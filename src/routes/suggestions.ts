/**
 * "Add this and save on fees" suggestions for a cart.
 *
 * DoorDash calls this MIC — Make-it-Cheaper / Add-to-Save. Given what is in the
 * cart and what it comes to, it returns items that would push the order over
 * the next fee-savings threshold.
 *
 * The tool needs four things the caller does not have: store_id, submarket_id,
 * the item ids, and a projected subtotal in cents. All four are derivable from
 * the cart, so this route derives them — one cart read plus one store read —
 * rather than making the caller assemble them. Notably `submarket_id` is not on
 * the cart at all; the upstream description warns that MIC is silently
 * suppressed without it, which is a miserable thing to debug, so it is read off
 * the store instead.
 */

import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi'
import { ApiError } from '../errors.ts'
import type { AppEnv } from '../types.ts'
import { TOOLS } from '../mcp/tools.ts'
import { callTool, security, toolResponses } from './shared.ts'
import { resolveCartUuid, storeIdAsInt } from './resolve.ts'
import { CartUuidParam } from '../schemas/common.ts'

export function registerSuggestionRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/carts/{cart_uuid}/suggestions',
      tags: ['Cart'],
      summary: 'Items that would cut the fees on this cart',
      description:
        'DoorDash’s "Make it Cheaper" / "Add to Save" carousel: items worth adding to reach the next ' +
        'fee-savings threshold.\n\n' +
        'Costs two extra upstream reads — the cart, for its items and subtotal, and the store, for the ' +
        '`submarket_id` the upstream tool requires and silently returns nothing without.\n\n' +
        'Pass `projected_subtotal_cents` to ask what-if: the suggestions for a subtotal you are about to reach ' +
        'rather than the one you have.',
      security,
      request: {
        params: z.object({ cart_uuid: CartUuidParam }),
        query: z.object({
          projected_subtotal_cents: z.coerce.number().int().min(0).optional().meta({
            description: 'Override the cart’s own subtotal, e.g. to preview the effect of an item not yet added.',
          }),
        }),
      },
      responses: toolResponses('Suggested items.', TOOLS.micCarousel),
    }),
    async (c) => {
      const cart_uuid = await resolveCartUuid(c, c.req.valid('param').cart_uuid)
      const { projected_subtotal_cents } = c.req.valid('query')

      // include_pricing so the subtotal comes back on this same call.
      const cart = await callTool(c, TOOLS.getCart, { cart_uuid, include_pricing: true })

      const storeId = findStoreId(cart)
      if (storeId === undefined) {
        throw new ApiError(400, 'store_not_found', 'That cart does not report a store_id, so MIC cannot be asked.', {
          cart: `/v1/carts/${cart_uuid}`,
        })
      }

      const itemIds = findItemIds(cart)
      if (itemIds.length === 0) {
        throw new ApiError(
          400,
          'invalid_request',
          'That cart is empty. Suggestions are computed from what is already in the cart.',
          { cart: `/v1/carts/${cart_uuid}` },
        )
      }

      const subtotal = projected_subtotal_cents ?? findSubtotalCents(cart)
      if (subtotal === undefined) {
        throw new ApiError(
          400,
          'invalid_request',
          'The cart carried no readable subtotal, so the savings gap cannot be computed. Pass ' +
            '`projected_subtotal_cents` explicitly.',
          { cart: `/v1/carts/${cart_uuid}?include_pricing=true` },
        )
      }

      const store = await callTool(c, TOOLS.getStoreInfo, { store_id: storeId })
      const submarketId = findSubmarketId(store)
      if (submarketId === undefined) {
        throw new ApiError(
          502,
          'store_not_found',
          `Store ${storeId} did not report a submarket_id. MIC returns nothing without one, so this would have ` +
            'been an empty response rather than an error.',
          { store: `/v1/stores/${storeId}` },
        )
      }

      return c.json(
        await callTool(c, TOOLS.micCarousel, {
          // store_id is typed as an integer here, as it is for store deals.
          store_id: storeIdAsInt(storeId),
          submarket_id: submarketId,
          item_ids: itemIds,
          projected_subtotal_cents: subtotal,
        }),
      )
    },
  )
}

function findStoreId(cart: unknown): string | undefined {
  for (const obj of walkObjects(cart)) {
    const value = obj.store_id
    if (typeof value === 'string' && value !== '') return value
    if (typeof value === 'number') return String(value)
  }
  return undefined
}

function findSubmarketId(store: unknown): number | undefined {
  for (const obj of walkObjects(store)) {
    const value = obj.submarket_id
    if (typeof value === 'number' && Number.isInteger(value)) return value
    if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  }
  return undefined
}

/**
 * Menu item ids for the cart's lines.
 *
 * `item_id` is the product; `id` on the same object is the cart line. MIC wants
 * the product, so only `item_id` is collected — and only from objects that
 * carry one, which excludes the cart itself and the nested option trees.
 */
function findItemIds(cart: unknown): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const obj of walkObjects(cart)) {
    const value = obj.item_id
    const id = typeof value === 'string' && value !== '' ? value : typeof value === 'number' ? String(value) : undefined
    if (id === undefined || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function findSubtotalCents(cart: unknown): number | undefined {
  for (const obj of walkObjects(cart)) {
    const holder = obj.subtotal
    if (holder === null || typeof holder !== 'object') continue
    const amount = (holder as Record<string, unknown>).amount_cents
    if (typeof amount === 'number' && Number.isFinite(amount)) return amount
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
