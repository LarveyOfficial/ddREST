/** Order history, preview, submission and status. */

import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv } from '../types.ts'
import { TOOLS } from '../mcp/tools.ts'
import { callTool, security, toolResponses } from './shared.ts'
import { CartUuidParam, OrderUuidParam } from '../schemas/common.ts'

const tags = ['Orders']

const ADDRESS_NOTE =
  'An `address_id` from GET /v1/addresses. Selects that saved address for this order instead of the account’s ' +
  'current one, without changing the account default. Sent upstream as `delivery_address_id`.'

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
      const { order_uuid } = c.req.valid('param')
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
      const { order_uuid } = c.req.valid('param')
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
      const { order_uuid } = c.req.valid('param')
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
      const { cart_uuid } = c.req.valid('param')
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
        'always a deliberate choice rather than an inherited default.',
      security,
      request: {
        params: z.object({ cart_uuid: CartUuidParam }),
        body: {
          required: true,
          content: {
            'application/json': {
              schema: z
                .object({
                  tip_amount_cents: z.int().min(0),
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
      responses: toolResponses('Submitted order.', TOOLS.submitOrder),
    }),
    async (c) => {
      const { cart_uuid } = c.req.valid('param')
      const { address_id, ...body } = c.req.valid('json')
      return c.json(
        await callTool(c, TOOLS.submitOrder, { ...body, cart_uuid, delivery_address_id: address_id }),
      )
    },
  )

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
      const { cart_uuid } = c.req.valid('param')
      return c.json(await callTool(c, TOOLS.getCheckoutUrl, { cart_uuid }))
    },
  )
}
