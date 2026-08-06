/**
 * Every REST route, checked against the tool it must invoke and the arguments
 * that tool requires. Those required arguments are the contract: if a route
 * forgets one, DoorDash rejects the call at runtime, so the table below
 * re-states them and the test asserts they were all sent. `bun run list-tools`
 * prints the schemas the gateway advertises, to check this table against.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { bearer, login, makeHarness, type Harness } from './helpers.ts'
import { TOOLS } from '../src/mcp/tools.ts'

let h: Harness
let auth: Record<string, string>

beforeEach(async () => {
  h = makeHarness()
  const { sessionToken } = await login(h)
  auth = { ...bearer(sessionToken), 'content-type': 'application/json' }
})
afterEach(() => {
  h.stop()
})

interface Case {
  name: string
  method: string
  path: string
  body?: unknown
  tool: string
  /** Arguments the tool requires, per the schema the gateway advertises. */
  required: string[]
  /** Specific argument values this route must translate correctly. */
  expect?: Record<string, unknown>
}

const CASES: Case[] = [
  // ---- Discovery -----------------------------------------------------------
  {
    name: 'search restaurants',
    method: 'GET',
    path: '/v1/restaurants?query=pizza&latitude=43.02&longitude=-85.58&limit=3',
    tool: TOOLS.findRestaurants,
    required: ['query', 'latitude', 'longitude', 'max_stores', 'intent'],
    expect: { query: 'pizza', latitude: 43.02, longitude: -85.58, max_stores: 3 },
  },
  {
    name: 'search restaurants with default coordinates',
    method: 'GET',
    path: '/v1/restaurants?query=sushi',
    tool: TOOLS.findRestaurants,
    required: ['query', 'latitude', 'longitude', 'max_stores', 'intent'],
    expect: { latitude: 37.3346, longitude: -122.009, max_stores: 5 },
  },
  {
    name: 'find nearby stores',
    method: 'GET',
    path: '/v1/nearby-stores?vertical_scope=alcohol&limit=7',
    tool: TOOLS.findNearbyStores,
    required: ['vertical_scope', 'max_stores', 'intent'],
    expect: { vertical_scope: 'alcohol', max_stores: 7 },
  },
  {
    name: 'store details',
    method: 'GET',
    path: '/v1/stores/327011',
    tool: TOOLS.getStoreInfo,
    required: ['store_id', 'intent'],
    expect: { store_id: '327011' },
  },
  {
    name: 'restaurant menu',
    method: 'GET',
    path: '/v1/stores/327011/menu',
    tool: TOOLS.getRestaurantMenu,
    required: ['store_id', 'intent'],
    expect: { store_id: '327011' },
  },
  {
    name: 'find items in store',
    method: 'GET',
    path: '/v1/stores/327011/items?name=milk&name=eggs',
    tool: TOOLS.findItemsInStore,
    required: ['store_id', 'item_names', 'intent'],
    expect: { store_id: '327011', item_names: ['milk', 'eggs'] },
  },
  {
    name: 'store item details',
    method: 'GET',
    path: '/v1/stores/327011/items/item-9',
    tool: TOOLS.getItemDetails,
    required: ['store_id', 'item_id', 'intent'],
    expect: { store_id: '327011', item_id: 'item-9' },
  },
  {
    name: 'menu item details',
    method: 'GET',
    path: '/v1/stores/327011/menus/menu-1/items/item-9',
    tool: TOOLS.getFoodItem,
    required: ['store_id', 'menu_id', 'item_id', 'intent'],
    expect: { store_id: '327011', menu_id: 'menu-1', item_id: 'item-9' },
  },

  // ---- Grocery -------------------------------------------------------------
  {
    name: 'create product list',
    method: 'POST',
    path: '/v1/product-lists',
    body: { items: [{ item_id: 'i1', item_name: 'Milk', quantity: 2 }], servings: 4 },
    tool: TOOLS.createProductList,
    required: ['items', 'intent'],
    expect: { servings: 4 },
  },

  // ---- Cart ----------------------------------------------------------------
  {
    name: 'list carts',
    method: 'GET',
    path: '/v1/carts?store_id=327011',
    tool: TOOLS.listActiveCarts,
    required: ['max_carts', 'intent'],
    expect: { store_id: '327011', max_carts: 40 },
  },
  {
    name: 'add items (cart chosen by DoorDash)',
    method: 'POST',
    path: '/v1/carts/items',
    body: { store_id: '327011', menu_id: 'menu-1', items: [{ item_id: 'i1', item_name: 'Pizza', quantity: 1 }] },
    tool: TOOLS.addToCart,
    required: ['store_id', 'menu_id', 'items', 'intent'],
  },
  {
    name: 'add items to a specific cart',
    method: 'POST',
    path: '/v1/carts/cart-7/items',
    body: { store_id: '327011', menu_id: 'menu-1', items: [{ item_id: 'i1', item_name: 'Pizza', quantity: 1 }] },
    tool: TOOLS.addToCart,
    required: ['store_id', 'menu_id', 'items', 'intent'],
    expect: { cart_uuid: 'cart-7' },
  },
  {
    name: 'show cart',
    method: 'GET',
    path: '/v1/carts/cart-7',
    tool: TOOLS.getCart,
    required: ['cart_uuid', 'intent'],
    expect: { cart_uuid: 'cart-7' },
  },
  {
    name: 'remove cart item',
    method: 'DELETE',
    path: '/v1/carts/cart-7/items/ci-3',
    tool: TOOLS.removeCartItem,
    required: ['cart_uuid', 'cart_item_id', 'intent'],
    expect: { cart_uuid: 'cart-7', cart_item_id: 'ci-3' },
  },
  {
    name: 'delete cart',
    method: 'DELETE',
    path: '/v1/carts/cart-7',
    tool: TOOLS.clearCart,
    required: ['cart_uuid', 'intent'],
    expect: { cart_uuid: 'cart-7' },
  },

  // ---- Promotions ----------------------------------------------------------
  {
    name: 'list promotions',
    method: 'GET',
    path: '/v1/stores/327011/promotions',
    tool: TOOLS.listPromotions,
    required: ['store_id', 'intent'],
    expect: { store_id: '327011' },
  },
  {
    name: 'apply promotion',
    method: 'POST',
    path: '/v1/carts/cart-7/promotions',
    body: { promo_code: 'SAVE10', campaign_id: 'camp-1' },
    tool: TOOLS.applyPromotion,
    required: ['cart_uuid', 'promo_code', 'intent'],
    expect: { cart_uuid: 'cart-7', promo_code: 'SAVE10', campaign_id: 'camp-1' },
  },
  {
    name: 'remove promotion',
    method: 'DELETE',
    path: '/v1/carts/cart-7/promotions/SAVE10?campaign_id=camp-1',
    tool: TOOLS.removePromotion,
    required: ['cart_uuid', 'promo_code', 'intent'],
    expect: { cart_uuid: 'cart-7', promo_code: 'SAVE10', campaign_id: 'camp-1' },
  },

  // ---- Orders --------------------------------------------------------------
  {
    name: 'order history',
    method: 'GET',
    path: '/v1/orders?days=30&limit=5',
    tool: TOOLS.getOrderHistory,
    required: ['time_range_days', 'max_orders', 'intent'],
    expect: { time_range_days: 30, max_orders: 5 },
  },
  {
    name: 'order receipt',
    method: 'GET',
    path: '/v1/orders/order-1/receipt',
    tool: TOOLS.getOrderReceipt,
    required: ['order_uuid', 'intent'],
    expect: { order_uuid: 'order-1' },
  },
  {
    name: 'order status',
    method: 'GET',
    path: '/v1/orders/order-1/status',
    tool: TOOLS.getOrderStatus,
    required: ['order_uuid', 'intent'],
    expect: { order_uuid: 'order-1' },
  },
  {
    name: 'reorder',
    method: 'POST',
    path: '/v1/orders/order-1/reorder',
    tool: TOOLS.reorder,
    required: ['order_uuid', 'intent'],
    expect: { order_uuid: 'order-1' },
  },
  {
    name: 'preview order',
    method: 'POST',
    path: '/v1/carts/cart-7/preview',
    body: { fulfillment: 'pickup', should_apply_credits: false },
    tool: TOOLS.previewOrder,
    required: ['cart_uuid', 'intent'],
    expect: { cart_uuid: 'cart-7', fulfillment: 'pickup', should_apply_credits: false },
  },
  {
    name: 'submit order',
    method: 'POST',
    path: '/v1/carts/cart-7/order',
    body: { tip_amount_cents: 500 },
    tool: TOOLS.submitOrder,
    required: ['cart_uuid', 'tip_amount_cents', 'intent'],
    expect: { cart_uuid: 'cart-7', tip_amount_cents: 500 },
  },
  {
    name: 'checkout url',
    method: 'GET',
    path: '/v1/carts/cart-7/checkout-url',
    tool: TOOLS.getCheckoutUrl,
    required: ['cart_uuid', 'intent'],
    expect: { cart_uuid: 'cart-7' },
  },

  // ---- Account -------------------------------------------------------------
  {
    name: 'list addresses',
    method: 'GET',
    path: '/v1/addresses',
    tool: TOOLS.listDeliveryAddresses,
    required: ['intent'],
  },
  {
    name: 'set delivery address',
    method: 'PUT',
    path: '/v1/addresses/current',
    body: { address_id: 'addr-2' },
    tool: TOOLS.setDeliveryAddress,
    required: ['address_id', 'intent'],
    expect: { address_id: 'addr-2' },
  },
  {
    name: 'list payment methods',
    method: 'GET',
    path: '/v1/payment-methods',
    tool: TOOLS.getPaymentInfo,
    required: ['intent'],
  },
]

describe('tool routes', () => {
  for (const tc of CASES) {
    test(`${tc.method} ${tc.path} -> ${tc.tool} (${tc.name})`, async () => {
      const res = await h.request(tc.path, {
        method: tc.method,
        headers: auth,
        body: tc.body === undefined ? undefined : JSON.stringify(tc.body),
      })

      expect(res.status).toBe(200)
      expect(h.mock.calls).toHaveLength(1)

      const call = h.mock.calls[0]!
      expect(call.tool).toBe(tc.tool)

      for (const key of tc.required) {
        expect(call.args).toHaveProperty(key)
        expect(call.args[key]).not.toBeUndefined()
      }
      for (const [key, value] of Object.entries(tc.expect ?? {})) {
        expect(call.args[key]).toEqual(value as never)
      }
    })
  }

  test('covers all 26 tools', () => {
    const covered = new Set(CASES.map((c) => c.tool))
    const all = new Set<string>(Object.values(TOOLS))
    expect(all.size).toBe(26)
    expect([...all].filter((t) => !covered.has(t))).toEqual([])
  })
})

describe('request validation', () => {
  test('rejects a search with no query', async () => {
    const res = await h.request('/v1/restaurants', { headers: auth })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('invalid_request')
  })

  test('rejects an out-of-range latitude', async () => {
    const res = await h.request('/v1/restaurants?query=x&latitude=999&longitude=0', { headers: auth })
    expect(res.status).toBe(400)
  })

  test('requires a tip amount when submitting an order', async () => {
    const res = await h.request('/v1/carts/cart-7/order', { method: 'POST', headers: auth, body: '{}' })
    expect(res.status).toBe(400)
    expect(h.mock.calls).toHaveLength(0)
  })

  test('requires team_id and budget_id together', async () => {
    const res = await h.request('/v1/carts/cart-7/order', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ tip_amount_cents: 0, team_id: 'team-1' }),
    })
    expect(res.status).toBe(400)
    expect(await res.text()).toContain('budget_id')
  })

  test('rejects an empty cart-item list', async () => {
    const res = await h.request('/v1/carts/items', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ store_id: 's', menu_id: 'm', items: [] }),
    })
    expect(res.status).toBe(400)
  })

  test('accepts recursive nested options', async () => {
    const res = await h.request('/v1/carts/items', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        store_id: 's',
        menu_id: 'm',
        items: [
          {
            item_id: 'i1',
            item_name: 'Burrito',
            quantity: 1,
            nested_options: [
              {
                id: 'o1',
                name: 'Protein',
                quantity: 1,
                options: [{ id: 'o2', name: 'Extra chicken', quantity: 2 }],
              },
            ],
          },
        ],
      }),
    })
    expect(res.status).toBe(200)

    const items = h.mock.calls[0]!.args.items as { nested_options: { options: unknown[] }[] }[]
    expect(items[0]!.nested_options[0]!.options).toHaveLength(1)
  })

  test('omits absent optional arguments rather than sending null', async () => {
    await h.request('/v1/carts', { headers: auth })
    expect(h.mock.calls[0]!.args).not.toHaveProperty('store_id')
  })

  test('404s an unknown route in the standard envelope', async () => {
    const res = await h.request('/v1/nope', { headers: auth })
    expect(res.status).toBe(404)
    expect(((await res.json()) as { error: string }).error).toBe('invalid_request')
  })
})

describe('docs UI', () => {
  test('serves a Swagger UI page pointed at this API’s own spec', async () => {
    const res = await h.request('/docs')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')

    const html = await res.text()
    expect(html).toContain('swagger-ui')
    expect(html).toContain("url: '/openapi.json'")
    // Try-it-out must send the session cookie.
    expect(html).toContain('withCredentials: true')
  })
})

describe('openapi document', () => {
  test('describes every route and both security schemes', async () => {
    const res = await h.request('/openapi.json')
    expect(res.status).toBe(200)

    const doc = (await res.json()) as {
      openapi: string
      paths: Record<string, Record<string, unknown>>
      components: { securitySchemes: Record<string, unknown> }
    }
    expect(doc.openapi).toBe('3.1.0')
    expect(Object.keys(doc.components.securitySchemes).sort()).toEqual(['sessionBearer', 'sessionCookie'])

    const operations = Object.values(doc.paths).flatMap((methods: Record<string, unknown>) =>
      Object.keys(methods).filter((m) => ['get', 'post', 'put', 'delete'].includes(m)),
    )
    // 26 tools + the extra add-to-cart entry point + 4 auth routes.
    expect(operations).toHaveLength(31)
    expect(doc.paths['/v1/auth/login/complete']).toBeDefined()
  })

  test('login/complete ships examples so Swagger UI does not invent "string" placeholders', async () => {
    const doc = (await (await h.request('/openapi.json')).json()) as any
    const examples = doc.paths['/v1/auth/login/complete'].post.requestBody.content['application/json'].examples

    expect(Object.keys(examples)).toEqual(['pastedUrl', 'parsedParams'])
    // The default example Swagger UI pre-fills must not suggest sending code/state too.
    expect(Object.keys(examples.pastedUrl.value).sort()).toEqual(['login_ticket', 'redirect_url'])
    expect(Object.keys(examples.parsedParams.value).sort()).toEqual(['code', 'login_ticket', 'state'])
  })
})
