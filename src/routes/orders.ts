/** Order history, preview, submission and status. */

import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi'
import { ApiError } from '../errors.ts'
import type { AppEnv } from '../types.ts'
import { TOOLS } from '../mcp/tools.ts'
import { callTool, security, submitErrorResponses, toolResponses } from './shared.ts'
import { resolveCartUuid, resolveOrderUuid } from './resolve.ts'
import { fingerprint } from '../orders/idempotency.ts'
import { registerOrderStreamRoute } from './order-stream.ts'
import { CartUuidParam, OrderUuidParam } from '../schemas/common.ts'

const tags = ['Orders']

const ADDRESS_NOTE =
  'An `address_id` from GET /v1/addresses. Selects that saved address for this order instead of the account’s ' +
  'current one, without changing the account default. Sent upstream as `delivery_address_id`.'

/**
 * Where a preview quote reports the pre-tip total.
 *
 * `net_total_before_tip` is the one to check: it is after credits, so it is
 * what the card is actually charged. `total_before_tip` is the fallback for a
 * quote that omits it.
 */
const TOTAL_FIELDS = ['net_total_before_tip', 'total_before_tip'] as const

/**
 * Re-price the cart and refuse if the total has moved.
 *
 * The point is the ordering: this runs *before* submission, so a mismatch costs
 * a failed request rather than an unexpected charge. A quote we cannot read a
 * total out of is also a refusal — proceeding would mean ignoring the guardrail
 * the caller explicitly asked for.
 */
async function assertTotalUnchanged(
  c: Parameters<typeof callTool>[0],
  cartUuid: string,
  expectedCents: number,
  toleranceCents: number,
): Promise<void> {
  const quote = await callTool(c, TOOLS.previewOrder, { cart_uuid: cartUuid })
  const actual = findTotalCents(quote)

  if (actual === undefined) {
    throw new ApiError(
      502,
      'total_mismatch',
      'confirm_total_cents was supplied, but the preview quote carried no readable total, so the total could ' +
        'not be checked. Nothing was ordered.',
      { checked_fields: [...TOTAL_FIELDS] },
    )
  }

  const difference = Math.abs(actual - expectedCents)
  if (difference > toleranceCents) {
    throw new ApiError(
      412,
      'total_mismatch',
      `The cart now prices at ${actual} cents before tip, not the ${expectedCents} you confirmed ` +
        `(off by ${difference}). Nothing was ordered.`,
      {
        expected_cents: expectedCents,
        actual_cents: actual,
        difference_cents: difference,
        tolerance_cents: toleranceCents,
      },
    )
  }
}

/** The pre-tip total in cents, wherever in the quote it sits. */
function findTotalCents(quote: unknown): number | undefined {
  for (const field of TOTAL_FIELDS) {
    for (const obj of walkObjects(quote)) {
      const holder = obj[field]
      if (holder === null || typeof holder !== 'object') continue
      const amount = (holder as Record<string, unknown>).unit_amount
      if (typeof amount === 'number' && Number.isFinite(amount)) return amount
    }
  }
  return undefined
}

function* walkObjects(value: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(value)) {
    for (const item of value) yield* walkObjects(item)
    return
  }
  if (value !== null && typeof value === 'object') {
    yield value as Record<string, unknown>
    for (const nested of Object.values(value)) yield* walkObjects(nested)
  }
}

export function registerOrderRoutes(app: OpenAPIHono<AppEnv>): void {
  // internal_get_order_history
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/orders',
      tags,
      summary: 'List past orders',
      security,
      request: {
        query: z.object({
          days: z.coerce.number().int().min(1).max(365).default(90).meta({ description: 'Look-back window.' }),
          limit: z.coerce.number().int().min(1).max(100).default(10),
        }),
      },
      responses: toolResponses('Order history.', TOOLS.getOrderHistory),
    }),
    async (c) => {
      const { days, limit } = c.req.valid('query')
      return c.json(await callTool(c, TOOLS.getOrderHistory, { time_range_days: days, max_orders: limit }))
    },
  )

  // internal_get_order_receipt
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/orders/{order_uuid}/receipt',
      tags,
      summary: 'Get an order receipt',
      security,
      request: { params: z.object({ order_uuid: OrderUuidParam }) },
      responses: toolResponses('Receipt. Monetary values are in cents.', TOOLS.getOrderReceipt),
    }),
    async (c) => {
      const order_uuid = await resolveOrderUuid(c, c.req.valid('param').order_uuid)
      return c.json(await callTool(c, TOOLS.getOrderReceipt, { order_uuid }))
    },
  )

  // internal_get_order_status
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/orders/{order_uuid}/status',
      tags,
      summary: 'Get live order status',
      security,
      request: { params: z.object({ order_uuid: OrderUuidParam }) },
      responses: toolResponses('Order status.', TOOLS.getOrderStatus),
    }),
    async (c) => {
      const order_uuid = await resolveOrderUuid(c, c.req.valid('param').order_uuid)
      return c.json(await callTool(c, TOOLS.getOrderStatus, { order_uuid }))
    },
  )

  // internal_reorder
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/orders/{order_uuid}/reorder',
      tags,
      summary: 'Recreate a past order as a new cart',
      security,
      request: { params: z.object({ order_uuid: OrderUuidParam }) },
      responses: toolResponses('The new cart.', TOOLS.reorder),
    }),
    async (c) => {
      const order_uuid = await resolveOrderUuid(c, c.req.valid('param').order_uuid)
      return c.json(await callTool(c, TOOLS.reorder, { order_uuid }))
    },
  )

  // internal_preview_order
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/carts/{cart_uuid}/preview',
      tags,
      summary: 'Price a cart before ordering',
      description: 'Returns the quote (fees, taxes, delivery options) without placing anything.',
      security,
      request: {
        params: z.object({ cart_uuid: CartUuidParam }),
        body: {
          required: false,
          content: {
            'application/json': {
              schema: z
                .object({
                  address_id: z.string().min(1).optional().meta({ description: ADDRESS_NOTE }),
                  scheduled_delivery_time: z.iso.datetime().optional(),
                  fulfillment: z.enum(['delivery', 'pickup']).optional(),
                  delivery_option: z
                    .enum(['express'])
                    .optional()
                    .meta({ description: 'Quotes report delivery_option_type as STANDARD/PRIORITY/SCHEDULE.' }),
                  is_team_order: z.boolean().optional().meta({ description: 'Include work benefits.' }),
                  selected_budget_id: z.string().min(1).optional(),
                  should_apply_credits: z.boolean().optional().meta({ description: 'Defaults to true upstream.' }),
                })
                .openapi('PreviewOrderBody'),
            },
          },
        },
      },
      responses: toolResponses('Order quote.', TOOLS.previewOrder),
    }),
    async (c) => {
      const cart_uuid = await resolveCartUuid(c, c.req.valid('param').cart_uuid)
      // Exposed as address_id for consistency with the rest of the API; upstream
      // spells it delivery_address_id.
      const { address_id, ...body } = c.req.valid('json') ?? {}
      return c.json(
        await callTool(c, TOOLS.previewOrder, { ...body, cart_uuid, delivery_address_id: address_id }),
      )
    },
  )

  // internal_submit_order
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/carts/{cart_uuid}/order',
      tags,
      summary: 'Place the order',
      description:
        'Irreversible: this charges the account’s payment method. `tip_amount_cents` is required so a tip is ' +
        'always a deliberate choice rather than an inherited default.\n\n' +
        '**`Idempotency-Key` header.** Send a unique value and a repeat of the same request returns the first ' +
        'response instead of placing a second order. Without it, a lost response leaves you unable to tell ' +
        'whether the order went through. Keys are scoped to your session and honoured for 24 hours; reusing one ' +
        'with a different body is a `409 idempotency_conflict`.\n\n' +
        '**`confirm_total_cents`.** State the total you expect and the order is priced first and refused if it ' +
        'has moved. Prices change between preview and submit, and this is the difference between a failed ' +
        'request and a surprise charge.',
      security,
      request: {
        params: z.object({ cart_uuid: CartUuidParam }),
        headers: z.object({
          'idempotency-key': z.string().min(1).max(255).optional().meta({
            description: 'Opaque, unique per order attempt. A UUID is a good choice.',
          }),
        }),
        body: {
          required: true,
          content: {
            'application/json': {
              schema: z
                .object({
                  tip_amount_cents: z.int().min(0),
                  confirm_total_cents: z.int().min(0).optional().meta({
                    description:
                      'The pre-tip total you expect, from `quote.net_total_before_tip.unit_amount` on the ' +
                      'preview response. The cart is re-priced and the order refused with `total_mismatch` if ' +
                      'it differs by more than `confirm_total_tolerance_cents`.',
                  }),
                  confirm_total_tolerance_cents: z.int().min(0).default(0).meta({
                    description: 'Allowed drift, in cents. Only meaningful with confirm_total_cents.',
                  }),
                  address_id: z.string().min(1).optional().meta({ description: ADDRESS_NOTE }),
                  scheduled_delivery_time: z.iso.datetime().optional(),
                  fulfillment: z.enum(['delivery', 'pickup']).optional(),
                  delivery_option: z.enum(['express']).optional(),
                  team_id: z.string().min(1).optional().meta({ description: 'Work benefits; requires budget_id.' }),
                  budget_id: z.string().min(1).optional().meta({ description: 'Work benefits; requires team_id.' }),
                  team_account_id: z.string().min(1).optional(),
                  expense_code: z.string().min(1).optional(),
                  expense_notes: z.string().optional(),
                  should_apply_credits: z.boolean().optional(),
                })
                .refine((v) => (v.team_id === undefined) === (v.budget_id === undefined), {
                  message: 'team_id and budget_id must be provided together.',
                })
                .openapi('SubmitOrderBody'),
            },
          },
        },
      },
      responses: { ...toolResponses('Submitted order.', TOOLS.submitOrder), ...submitErrorResponses },
    }),
    async (c) => {
      const cart_uuid = await resolveCartUuid(c, c.req.valid('param').cart_uuid)
      const { address_id, confirm_total_cents, confirm_total_tolerance_cents, ...body } = c.req.valid('json')
      const args = { ...body, cart_uuid, delivery_address_id: address_id }

      const idempotencyKey = c.req.valid('header')['idempotency-key']
      // Fingerprinted on the resolved arguments, so `latest` and the uuid it
      // resolved to are the same request rather than a spurious conflict.
      const request = fingerprint(args)
      const scope = c.get('session').id
      const store = c.get('idempotency')

      if (idempotencyKey !== undefined) {
        const previous = store.lookup(scope, idempotencyKey, request)
        if (previous?.conflict) {
          throw new ApiError(
            409,
            'idempotency_conflict',
            `Idempotency-Key ${JSON.stringify(idempotencyKey)} was already used for a different order. ` +
              'Use a fresh key, or repeat the original request exactly to get its response back.',
          )
        }
        if (previous) {
          c.header('Idempotency-Replayed', 'true')
          return c.json(previous.body as Record<string, unknown>)
        }
      }

      if (confirm_total_cents !== undefined) {
        await assertTotalUnchanged(c, cart_uuid, confirm_total_cents, confirm_total_tolerance_cents)
      }

      const result = await callTool(c, TOOLS.submitOrder, args)
      // Only after it succeeded: a caller retrying past a failure wants a real
      // attempt, not yesterday's error handed back.
      if (idempotencyKey !== undefined) store.save(scope, idempotencyKey, request, result)
      return c.json(result)
    },
  )

  registerOrderStreamRoute(app)

  // doordash_get_checkout_url
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/carts/{cart_uuid}/checkout-url',
      tags,
      summary: 'Get a browser checkout link for a cart',
      description: 'Hands checkout to the DoorDash web flow instead of submitting through the API.',
      security,
      request: { params: z.object({ cart_uuid: CartUuidParam }) },
      responses: toolResponses('Checkout URL.', TOOLS.getCheckoutUrl),
    }),
    async (c) => {
      const cart_uuid = await resolveCartUuid(c, c.req.valid('param').cart_uuid)
      return c.json(await callTool(c, TOOLS.getCheckoutUrl, { cart_uuid }))
    },
  )
}
