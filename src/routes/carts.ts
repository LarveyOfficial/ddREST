/** Cart lifecycle, plus the grocery product-list builder. */

import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi'
import { ApiError } from '../errors.ts'
import type { AppEnv } from '../types.ts'
import { TOOLS } from '../mcp/tools.ts'
import { callTool, security, toolResponses } from './shared.ts'
import { resolveCartUuid, resolveMenuId, resolveStoreId } from './resolve.ts'
import {
  BooleanQuery,
  CartItemInputSchema,
  CartUuidParam,
  GroupCartConfigSchema,
  NestedOptionSchema,
  type NestedOption,
  StoreIdParam,
} from '../schemas/common.ts'

const tags = ['Cart']

const MENU_ID_NOTE =
  'Must belong to store_id. Optional — omit it and the store’s menu id is filled in for you, at the cost of ' +
  'one extra upstream lookup. The id used is returned in `X-Resolved-Menu-Id`.'

const PRICING_NOTE =
  'Include a pricing breakdown (subtotal, taxes_and_fees, discounts, total) in the response. This is an estimate ' +
  'for display — use the preview endpoint for the quote an order is actually placed against.'

/** Body for both add-to-cart routes; the path variant supplies cart_uuid itself. */
const AddItemsBody = z
  .object({
    store_id: StoreIdParam,
    menu_id: z.string().min(1).optional().meta({ description: MENU_ID_NOTE }),
    items: z.array(CartItemInputSchema).min(1),
    include_pricing: z.boolean().optional().meta({ description: PRICING_NOTE }),
    is_pickup: z.boolean().optional().meta({ description: 'New carts default to delivery.' }),
    // Per-participant group-cart limit lives inside group_cart_config, which is
    // where doordash_add_to_cart declares it. A top-level copy was both
    // redundant and rejected by the gateway's strict validator when set.
    group_cart_config: GroupCartConfigSchema.optional(),
  })
  .openapi('AddCartItemsBody')

const AddItemsBodyWithCart = AddItemsBody.extend({
  cart_uuid: z
    .string()
    .min(1)
    .optional()
    .meta({ description: 'Target an existing cart. Omit to append to a matching cart or create one.' }),
}).openapi('AddCartItemsBodyWithCart')

/**
 * Fills in whichever of store_id/menu_id the caller left as a shorthand.
 *
 * Ordered: a `name:` store has to become an id before its menu can be looked
 * up, and the menu call is skipped entirely when menu_id was supplied.
 */
async function withResolvedStoreAndMenu<T extends { store_id: string; menu_id?: string }>(
  c: Parameters<typeof resolveStoreId>[0],
  body: T,
): Promise<T & { store_id: string; menu_id: string }> {
  const store_id = await resolveStoreId(c, body.store_id)
  return { ...body, store_id, menu_id: await resolveMenuId(c, store_id, body.menu_id) }
}

/** The cart line whose `id` is the cart-line id, wherever it sits in the payload. */
function findCartLine(cart: unknown, cartLineId: string): Record<string, unknown> | undefined {
  for (const obj of walkObjects(cart)) {
    // A line carries both an id and an item_id; matching on id alone could hit
    // a nested option or the cart object itself.
    if (idString(obj.id) === cartLineId && 'item_id' in obj) return obj
  }
  return undefined
}

const noSuchLine = (cartId: string, cartLineId: string) =>
  new ApiError(
    400,
    'invalid_request',
    `No line with id ${JSON.stringify(cartLineId)} is in that cart. The path takes the cart-line id (an ` +
      'entry’s `id`), not the menu item_id.',
    { cart: `/v1/carts/${cartId}` },
  )

/**
 * The menu item id for a cart line, read off the cart.
 *
 * internal_update_cart_item advertises menu_item_id as optional but rejects the
 * call without it, so we fill it in. On a cart line, `id` is the cart-line id
 * (what the caller passes in the path) and `item_id` is the menu item id the
 * gateway wants.
 */
async function resolveMenuItemId(
  c: Parameters<typeof callTool>[0],
  cartId: string,
  cartLineId: string,
): Promise<string> {
  const line = findCartLine(await callTool(c, TOOLS.getCart, { cart_uuid: cartId }), cartLineId)
  if (!line) throw noSuchLine(cartId, cartLineId)
  const menuItemId = idString(line.item_id)
  if (menuItemId !== undefined) return menuItemId
  throw new ApiError(
    400,
    'invalid_request',
    `Cart line ${JSON.stringify(cartLineId)} carries no item_id to send as menu_item_id. Pass menu_item_id ` +
      'in the body.',
    { cart: `/v1/carts/${cartId}` },
  )
}

/** Everything a re-add needs to recreate a cart line with different options. */
interface CartLineForReadd {
  storeId: string
  menuId?: string
  itemId: string
  itemName: string
  quantity?: number
}

/**
 * Read a cart line into the shape add_to_cart wants, for the options-patch path.
 *
 * The gateway cannot edit an item's options in place, so a change means
 * removing the line and adding it back. That re-add needs the store, the menu,
 * the menu item id and the item's name — all of which live on the line and the
 * cart around it. Anything missing that a re-add can't do without is a clear
 * error up front, since the alternative is discovering it after the line has
 * already been removed.
 */
async function readCartLine(
  c: Parameters<typeof callTool>[0],
  cartId: string,
  cartLineId: string,
): Promise<CartLineForReadd> {
  const cart = await callTool(c, TOOLS.getCart, { cart_uuid: cartId })
  const line = findCartLine(cart, cartLineId)
  if (!line) throw noSuchLine(cartId, cartLineId)

  const itemId = idString(line.item_id)
  const itemName = typeof line.name === 'string' && line.name !== '' ? line.name : undefined
  const storeId = firstStoreId(cart)

  const missing = [
    itemId === undefined && 'item_id',
    itemName === undefined && 'name',
    storeId === undefined && 'store_id',
  ].filter((v): v is string => typeof v === 'string')
  if (missing.length > 0) {
    throw new ApiError(
      400,
      'invalid_request',
      `That cart line is missing ${missing.join(', ')}, so it cannot be rebuilt with new options. ` +
        'Remove it and add it again yourself.',
      { cart: `/v1/carts/${cartId}` },
    )
  }

  return {
    storeId: storeId!,
    menuId: idString(line.menu_id),
    itemId: itemId!,
    itemName: itemName!,
    quantity: typeof line.quantity === 'number' ? line.quantity : undefined,
  }
}

/** The store id on the cart, wherever it sits. */
function firstStoreId(cart: unknown): string | undefined {
  for (const obj of walkObjects(cart)) {
    const id = idString(obj.store_id)
    if (id !== undefined) return id
  }
  return undefined
}

/**
 * Change a line's options by removing it and adding it back.
 *
 * The gateway offers no in-place option edit, so this is the only way. The
 * removal happens first — reversing it would leave a duplicate line if the
 * add then merged with something — which means the window between the two is
 * real: if the add fails, the item is gone. The error for that case carries the
 * exact payload to re-add, so the caller can recover in one call rather than
 * reconstruct it.
 */
async function replaceCartItemOptions(
  c: Parameters<typeof callTool>[0],
  cartId: string,
  cartLineId: string,
  quantityOverride: number | undefined,
  nestedOptions: NestedOption[],
): Promise<Record<string, unknown>> {
  const line = await readCartLine(c, cartId, cartLineId)
  const quantity = quantityOverride ?? line.quantity ?? 1
  if (quantity < 1) {
    throw new ApiError(
      400,
      'invalid_request',
      'quantity 0 would remove the item, not re-add it with new options. Use DELETE on this path to remove it.',
      { cart: `/v1/carts/${cartId}` },
    )
  }

  const menu_id = line.menuId ?? (await resolveMenuId(c, line.storeId, undefined))
  const items = [{ item_id: line.itemId, item_name: line.itemName, quantity, nested_options: nestedOptions }]

  await callTool(c, TOOLS.removeCartItem, { cart_uuid: cartId, cart_item_id: cartLineId })

  try {
    const result = await callTool(c, TOOLS.addToCart, { cart_uuid: cartId, store_id: line.storeId, menu_id, items })
    // The line the caller named no longer exists; the new one is in `result`.
    c.header('X-Cart-Item-Replaced', 'true')
    return result
  } catch (err) {
    // The removal already happened, so leave the caller everything they need to
    // put the item back rather than a bare failure.
    const recovery = {
      removed: true,
      re_add_endpoint: `POST /v1/carts/${cartId}/items`,
      re_add_body: { store_id: line.storeId, menu_id, items },
    }
    if (err instanceof ApiError) throw err.with(recovery)
    throw new ApiError(
      502,
      'upstream_error',
      'The item was removed, but adding it back with the new options failed. Re-add it with the payload below.',
      recovery,
    )
  }
}

function idString(value: unknown): string | undefined {
  if (typeof value === 'string' && value !== '') return value
  if (typeof value === 'number') return String(value)
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

export function registerCartRoutes(app: OpenAPIHono<AppEnv>): void {
  // doordash_list_active_carts
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/carts',
      tags,
      summary: 'List active carts',
      security,
      request: {
        query: z.object({
          store_id: z.string().min(1).optional().meta({ description: 'Only carts at this store.' }),
          limit: z.coerce.number().int().min(1).max(40).default(40),
        }),
      },
      responses: toolResponses('Active carts.', TOOLS.listActiveCarts),
    }),
    async (c) => {
      const { store_id, limit } = c.req.valid('query')
      return c.json(await callTool(c, TOOLS.listActiveCarts, { max_carts: limit, store_id }))
    },
  )

  // doordash_add_to_cart (create or append)
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/carts/items',
      tags,
      summary: 'Add items, creating or appending to a cart',
      description: 'Pass `cart_uuid` in the body to target a specific cart, or omit it to let DoorDash choose.',
      security,
      request: { body: { required: true, content: { 'application/json': { schema: AddItemsBodyWithCart } } } },
      responses: toolResponses('Updated cart.', TOOLS.addToCart),
    }),
    async (c) => {
      const { cart_uuid, ...body } = c.req.valid('json')
      return c.json(
        await callTool(c, TOOLS.addToCart, {
          ...(await withResolvedStoreAndMenu(c, body)),
          // Only resolved when supplied; omitting it is what lets DoorDash pick.
          cart_uuid: cart_uuid === undefined ? undefined : await resolveCartUuid(c, cart_uuid),
        }),
      )
    },
  )

  // doordash_add_to_cart (explicit cart)
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/carts/{cart_uuid}/items',
      tags,
      summary: 'Add items to a specific cart',
      security,
      request: {
        params: z.object({ cart_uuid: CartUuidParam }),
        body: { required: true, content: { 'application/json': { schema: AddItemsBody } } },
      },
      responses: toolResponses('Updated cart.', TOOLS.addToCart),
    }),
    async (c) => {
      const cart_uuid = await resolveCartUuid(c, c.req.valid('param').cart_uuid)
      return c.json(
        await callTool(c, TOOLS.addToCart, { ...(await withResolvedStoreAndMenu(c, c.req.valid('json'))), cart_uuid }),
      )
    },
  )

  // doordash_get_cart
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/carts/{cart_uuid}',
      tags,
      summary: 'Show a cart',
      security,
      request: {
        params: z.object({ cart_uuid: CartUuidParam }),
        query: z.object({ include_pricing: BooleanQuery.optional().meta({ description: PRICING_NOTE }) }),
      },
      responses: toolResponses('Cart contents.', TOOLS.getCart),
    }),
    async (c) => {
      const cart_uuid = await resolveCartUuid(c, c.req.valid('param').cart_uuid)
      const { include_pricing } = c.req.valid('query')
      return c.json(await callTool(c, TOOLS.getCart, { cart_uuid, include_pricing }))
    },
  )

  // doordash_remove_cart_item
  app.openapi(
    createRoute({
      method: 'delete',
      path: '/v1/carts/{cart_uuid}/items/{cart_item_id}',
      tags,
      summary: 'Remove one item from a cart',
      security,
      request: { params: z.object({ cart_uuid: CartUuidParam, cart_item_id: z.string().min(1) }) },
      responses: toolResponses('Updated cart.', TOOLS.removeCartItem),
    }),
    async (c) => {
      const { cart_uuid, cart_item_id } = c.req.valid('param')
      return c.json(
        await callTool(c, TOOLS.removeCartItem, { cart_uuid: await resolveCartUuid(c, cart_uuid), cart_item_id }),
      )
    },
  )

  // doordash_clear_cart
  app.openapi(
    createRoute({
      method: 'delete',
      path: '/v1/carts/{cart_uuid}',
      tags,
      summary: 'Delete a cart',
      security,
      request: { params: z.object({ cart_uuid: CartUuidParam }) },
      responses: toolResponses('Cart cleared.', TOOLS.clearCart),
    }),
    async (c) => {
      const cart_uuid = await resolveCartUuid(c, c.req.valid('param').cart_uuid)
      return c.json(await callTool(c, TOOLS.clearCart, { cart_uuid }))
    },
  )

  // internal_update_cart_item
  app.openapi(
    createRoute({
      method: 'patch',
      path: '/v1/carts/{cart_uuid}/items/{cart_item_id}',
      tags,
      summary: 'Change an item’s quantity or options',
      description:
        '`cart_item_id` is the **cart-line id** — the `id` on an entry of the cart’s `items`, not the menu ' +
        '`item_id`. The same id the delete route takes.\n\n' +
        '**Quantity.** Send `quantity` and the line is updated in place. Setting it to 0 removes the item, which ' +
        'is what `DELETE` on this path does. The gateway needs the line’s menu item id too; omit `menu_item_id` ' +
        'and it is read off the cart for you, or pass it to skip that lookup.\n\n' +
        '**Options.** Send `nested_options` to change the item’s customisations. The gateway cannot edit options ' +
        'in place, so this is done by removing the line and adding it back with the new options — the item’s ' +
        'store, menu, id, name and (unless you override `quantity`) its current quantity are read off the cart ' +
        'and reused. **This replaces the whole set of options, and is not atomic:** the re-add can fail after ' +
        'the removal, and if it does the response says so and carries what was needed to add it back. Re-adding ' +
        'also mints a **new** cart-line id, so the id in this path is stale afterwards — the new one is in the ' +
        'returned cart.',
      security,
      request: {
        params: z.object({ cart_uuid: CartUuidParam, cart_item_id: z.string().min(1) }),
        body: {
          required: true,
          content: {
            'application/json': {
              schema: z
                .object({
                  quantity: z.int().min(0).optional().meta({
                    description:
                      'New quantity. 0 removes the item. Optional when changing only options, in which case the ' +
                      'current quantity is kept.',
                  }),
                  nested_options: z.array(NestedOptionSchema).optional().meta({
                    description:
                      'Replace the item’s customisations. Providing this switches to a remove-and-re-add; see ' +
                      'the description. The full set is replaced, so include every option you want, not just the ' +
                      'changed ones.',
                  }),
                  menu_item_id: z.string().min(1).optional().meta({
                    description:
                      'The menu item id for this line (`item_id` on the cart entry, distinct from the cart-line ' +
                      'id in the path). Only used on a quantity change; resolved from the cart when omitted, ' +
                      'because the gateway rejects the update without it despite advertising it as optional.',
                  }),
                })
                .refine((v) => v.quantity !== undefined || v.nested_options !== undefined, {
                  message: 'Provide quantity, nested_options, or both.',
                })
                .openapi('UpdateCartItemBody'),
            },
          },
        },
      },
      responses: toolResponses('Updated cart.', TOOLS.updateCartItem),
    }),
    async (c) => {
      const { cart_uuid, cart_item_id } = c.req.valid('param')
      const body = c.req.valid('json')
      const cart_id = await resolveCartUuid(c, cart_uuid)

      if (body.nested_options === undefined) {
        // Quantity-only: the refine guarantees quantity is present here.
        const menu_item_id = body.menu_item_id ?? (await resolveMenuItemId(c, cart_id, cart_item_id))
        return c.json(
          await callTool(c, TOOLS.updateCartItem, {
            cart_id,
            item_id: cart_item_id,
            quantity: body.quantity!,
            menu_item_id,
          }),
        )
      }

      return c.json(await replaceCartItemOptions(c, cart_id, cart_item_id, body.quantity, body.nested_options))
    },
  )

  // doordash_update_delivery_option
  app.openapi(
    createRoute({
      method: 'put',
      path: '/v1/carts/{cart_uuid}/fulfillment',
      tags,
      summary: 'Switch a cart between delivery and pickup',
      description:
        'Changes an existing cart’s fulfillment. `is_pickup` is otherwise only settable when the cart is first ' +
        'created, so without this changing your mind means starting the cart over.',
      security,
      request: {
        params: z.object({ cart_uuid: CartUuidParam }),
        body: {
          required: true,
          content: {
            'application/json': {
              schema: z
                .object({
                  is_pickup: z.boolean().meta({ description: 'True for pickup, false for delivery.' }),
                  include_pricing: z.boolean().optional().meta({ description: PRICING_NOTE }),
                })
                .openapi('UpdateFulfillmentBody'),
            },
          },
        },
      },
      responses: toolResponses('Updated fulfillment type.', TOOLS.updateDeliveryOption),
    }),
    async (c) => {
      const cart_uuid = await resolveCartUuid(c, c.req.valid('param').cart_uuid)
      return c.json(await callTool(c, TOOLS.updateDeliveryOption, { ...c.req.valid('json'), cart_uuid }))
    },
  )

  // doordash_create_product_list
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/product-lists',
      tags: ['Grocery'],
      summary: 'Build a grocery product list',
      security,
      request: {
        body: {
          required: true,
          content: {
            'application/json': {
              schema: z
                .object({
                  items: z.array(CartItemInputSchema).min(1),
                  store_id: z.string().min(1).optional(),
                  desired_mx_name: z.string().min(1).optional().meta({ description: 'Preferred merchant name.' }),
                  servings: z.int().min(1).optional(),
                })
                .openapi('CreateProductListBody'),
            },
          },
        },
      },
      responses: toolResponses('Product list.', TOOLS.createProductList),
    }),
    async (c) => c.json(await callTool(c, TOOLS.createProductList, c.req.valid('json'))),
  )
}
