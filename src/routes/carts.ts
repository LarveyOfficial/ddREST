/** Cart lifecycle, plus the grocery product-list builder. */

import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv } from '../types.ts'
import { TOOLS } from '../mcp/tools.ts'
import { callTool, security, toolResponses } from './shared.ts'
import { resolveCartUuid, resolveMenuId, resolveStoreId } from './resolve.ts'
import {
  BooleanQuery,
  CartItemInputSchema,
  CartUuidParam,
  GroupCartConfigSchema,
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
    spend_limit_cents: z
      .int()
      .min(0)
      .optional()
      .meta({ description: 'Per-participant limit for a new host-pays group cart. Requires group_cart_config.' }),
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
      summary: 'Change an item’s quantity',
      description:
        '`cart_item_id` is the **cart-line id** — the `id` on an entry of the cart’s `items`, not the menu ' +
        '`item_id`. The same id the delete route takes.\n\n' +
        'Setting `quantity` to 0 removes the item, which is what `DELETE` on this path does. Use whichever reads ' +
        'better; they end up in the same place.',
      security,
      request: {
        params: z.object({ cart_uuid: CartUuidParam, cart_item_id: z.string().min(1) }),
        body: {
          required: true,
          content: {
            'application/json': {
              schema: z
                .object({
                  quantity: z.int().min(0).meta({ description: 'New quantity. 0 removes the item.' }),
                  menu_item_id: z.string().min(1).optional().meta({
                    description:
                      'The menu item id for this line (`item_id` on the cart entry). Optional, and distinct ' +
                      'from the cart-line id in the path.',
                  }),
                })
                .openapi('UpdateCartItemBody'),
            },
          },
        },
      },
      responses: toolResponses('Updated quantity.', TOOLS.updateCartItem),
    }),
    async (c) => {
      const { cart_uuid, cart_item_id } = c.req.valid('param')
      const { quantity, menu_item_id } = c.req.valid('json')
      return c.json(
        await callTool(c, TOOLS.updateCartItem, {
          cart_id: await resolveCartUuid(c, cart_uuid),
          item_id: cart_item_id,
          quantity,
          menu_item_id,
        }),
      )
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
