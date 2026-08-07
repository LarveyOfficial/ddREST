/**
 * The conveniences layered on top of the tool routes: id shorthands, the
 * success:false mapping, the order guardrails, read-only mode and Retry-After.
 *
 * These are the parts with behaviour of their own rather than a straight
 * pass-through, so they are the parts that can be wrong in a way the route
 * table in routes.test.ts would not notice.
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

const ADDRESSES = {
  addresses: [
    { address_id: '111', address_link_id: 'l-111', label: 'home', lat: 41.9, lng: -87.6, is_default: true },
    { address_id: '222', address_link_id: 'l-222', label: 'Work', lat: 40.7, lng: -74.0 },
  ],
}

const CARTS = {
  carts: [
    { cart_uuid: 'cart-old', store_id: '111', items: [], updated_at: 100 },
    { cart_uuid: 'cart-new', store_id: '222', items: [], updated_at: 900 },
  ],
}

/** Canned payloads per tool, so a route that chains calls gets sensible input. */
function fixtures(overrides: Record<string, unknown> = {}) {
  return (tool: string, args: Record<string, unknown>) => {
    if (tool in overrides) return overrides[tool]
    if (tool === TOOLS.listDeliveryAddresses) return ADDRESSES
    if (tool === TOOLS.listActiveCarts) return CARTS
    if (tool === TOOLS.getOrderHistory) return { orders: [{ order_uuid: 'order-9', store_name: 'Pizza' }] }
    if (tool === TOOLS.getStoreInfo) return { store: { store_id: '327011', menu_id: 'menu-42', submarket_id: 7 } }
    return { tool, echoed_arguments: args }
  }
}

const lastCall = () => h.mock.calls.at(-1)!

describe('cart_uuid shorthands', () => {
  test('`latest` picks the most recently updated cart', async () => {
    h.mock.setToolResult(fixtures())
    const res = await h.request('/v1/carts/latest', { headers: auth })

    expect(res.status).toBe(200)
    expect(lastCall().tool).toBe(TOOLS.getCart)
    expect(lastCall().args.cart_uuid).toBe('cart-new')
    // Which cart it chose is not otherwise knowable from the response.
    expect(res.headers.get('X-Resolved-Cart-Uuid')).toBe('cart-new')
  })

  test('`store:<id>` picks that store’s cart, not the newest one', async () => {
    h.mock.setToolResult(fixtures())
    const res = await h.request('/v1/carts/store:111', { headers: auth })

    expect(res.status).toBe(200)
    expect(lastCall().args.cart_uuid).toBe('cart-old')
  })

  test('a literal uuid is passed through without a lookup', async () => {
    h.mock.setToolResult(fixtures())
    await h.request('/v1/carts/cart-explicit', { headers: auth })

    expect(h.mock.calls).toHaveLength(1)
    expect(lastCall().args.cart_uuid).toBe('cart-explicit')
  })

  test('`latest` with no carts lists what does exist', async () => {
    h.mock.setToolResult(fixtures({ [TOOLS.listActiveCarts]: { carts: [] } }))
    const res = await h.request('/v1/carts/latest', { headers: auth })

    expect(res.status).toBe(400)
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'cart_not_found' })
  })
})

describe('order_uuid and address shorthands', () => {
  test('`latest` resolves to the most recent order', async () => {
    h.mock.setToolResult(fixtures())
    const res = await h.request('/v1/orders/latest/status', { headers: auth })

    expect(lastCall().tool).toBe(TOOLS.getOrderStatus)
    expect(lastCall().args.order_uuid).toBe('order-9')
    expect(res.headers.get('X-Resolved-Order-Uuid')).toBe('order-9')
  })

  test('an address label resolves to that address’s coordinates', async () => {
    h.mock.setToolResult(fixtures())
    await h.request('/v1/restaurants?query=pizza&address_id=work', { headers: auth })

    expect(lastCall().tool).toBe(TOOLS.findRestaurants)
    // Case-insensitive: the saved label is "Work".
    expect(lastCall().args.latitude).toBe(40.7)
    expect(lastCall().args.longitude).toBe(-74.0)
  })

  test('an unknown label reports the labels that do exist', async () => {
    h.mock.setToolResult(fixtures())
    const res = await h.request('/v1/restaurants?query=pizza&address_id=cottage', { headers: auth })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; known_addresses: { label?: string }[] }
    expect(body.error).toBe('address_not_found')
    expect(body.known_addresses.map((a) => a.label)).toEqual(['home', 'Work'])
  })
})

describe('menu_id resolution', () => {
  test('an omitted menu_id is read off the store', async () => {
    h.mock.setToolResult(fixtures())
    const res = await h.request('/v1/carts/items', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ store_id: '327011', items: [{ item_id: 'i1', item_name: 'Pizza', quantity: 1 }] }),
    })

    expect(res.status).toBe(200)
    expect(lastCall().tool).toBe(TOOLS.addToCart)
    expect(lastCall().args.menu_id).toBe('menu-42')
    expect(res.headers.get('X-Resolved-Menu-Id')).toBe('menu-42')
  })

  test('an omitted menu_id on the food-item route resolves from the store', async () => {
    h.mock.setToolResult(fixtures())
    const res = await h.request('/v1/stores/327011/menu/items/item-9', { headers: auth })

    expect(res.status).toBe(200)
    expect(lastCall().tool).toBe(TOOLS.getFoodItem)
    expect(lastCall().args.menu_id).toBe('menu-42')
    expect(res.headers.get('X-Resolved-Menu-Id')).toBe('menu-42')
  })

  test('a supplied menu_id on the food-item route costs no extra call', async () => {
    h.mock.setToolResult(fixtures())
    await h.request('/v1/stores/327011/menu/items/item-9?menu_id=menu-mine', { headers: auth })

    expect(h.mock.calls).toHaveLength(1)
    expect(lastCall().args.menu_id).toBe('menu-mine')
  })

  test('an omitted menu_item_id on PATCH is read off the cart line', async () => {
    h.mock.setToolResult((tool) => {
      if (tool === TOOLS.getCart) {
        return { cart: { items: [{ id: 'line-3', item_id: 'menu-9', quantity: 1 }] } }
      }
      return { ok: true }
    })
    const res = await h.request('/v1/carts/cart-7/items/line-3', {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({ quantity: 2 }),
    })

    expect(res.status).toBe(200)
    expect(lastCall().tool).toBe(TOOLS.updateCartItem)
    expect(lastCall().args).toMatchObject({ cart_id: 'cart-7', item_id: 'line-3', menu_item_id: 'menu-9', quantity: 2 })
  })

  test('PATCH with an unknown cart-line id explains the id it wanted', async () => {
    h.mock.setToolResult(() => ({ cart: { items: [{ id: 'line-other', item_id: 'menu-1' }] } }))
    const res = await h.request('/v1/carts/cart-7/items/line-3', {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({ quantity: 2 }),
    })

    expect(res.status).toBe(400)
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'invalid_request' })
    // Never reached the update — no menu_item_id to send.
    expect(h.mock.calls.some((call) => call.tool === TOOLS.updateCartItem)).toBe(false)
  })

  test('a supplied menu_id costs no extra call', async () => {
    h.mock.setToolResult(fixtures())
    await h.request('/v1/carts/items', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        store_id: '327011',
        menu_id: 'menu-mine',
        items: [{ item_id: 'i1', item_name: 'Pizza', quantity: 1 }],
      }),
    })

    expect(h.mock.calls).toHaveLength(1)
    expect(lastCall().args.menu_id).toBe('menu-mine')
  })
})

describe('success: false', () => {
  test('becomes an error rather than a 200 nobody checks', async () => {
    h.mock.setToolResult(() => ({ success: false, message: 'That store is closed.' }))
    const res = await h.request('/v1/stores/327011', { headers: auth })

    expect(res.status).toBe(502)
    const body = (await res.json()) as { error: string; message: string; upstream_result: unknown }
    expect(body.error).toBe('doordash_tool_error')
    expect(body.message).toBe('That store is closed.')
    // The caller keeps everything the pass-through would have given them.
    expect(body.upstream_result).toMatchObject({ success: false })
  })

  test('success: true is untouched', async () => {
    h.mock.setToolResult(() => ({ success: true, store: { store_id: '1' } }))
    expect((await h.request('/v1/stores/327011', { headers: auth })).status).toBe(200)
  })

  test('STRICT_TOOL_ERRORS=false restores the pass-through', async () => {
    const lax = makeHarness({ STRICT_TOOL_ERRORS: 'false' })
    try {
      const { sessionToken } = await login(lax)
      lax.mock.setToolResult(() => ({ success: false, message: 'nope' }))
      const res = await lax.request('/v1/stores/327011', { headers: bearer(sessionToken) })
      expect(res.status).toBe(200)
    } finally {
      lax.stop()
    }
  })
})

describe('order guardrails', () => {
  const submit = (body: unknown, headers: Record<string, string> = {}) =>
    h.request('/v1/carts/cart-7/order', {
      method: 'POST',
      headers: { ...auth, ...headers },
      body: JSON.stringify(body),
    })

  test('Idempotency-Key replays instead of ordering twice', async () => {
    h.mock.setToolResult(fixtures())
    const first = await submit({ tip_amount_cents: 500 }, { 'idempotency-key': 'key-1' })
    expect(first.status).toBe(200)
    const submissions = h.mock.calls.filter((call) => call.tool === TOOLS.submitOrder).length
    expect(submissions).toBe(1)

    const second = await submit({ tip_amount_cents: 500 }, { 'idempotency-key': 'key-1' })
    expect(second.status).toBe(200)
    expect(second.headers.get('Idempotency-Replayed')).toBe('true')
    // The point of the whole mechanism: no second order.
    expect(h.mock.calls.filter((call) => call.tool === TOOLS.submitOrder)).toHaveLength(1)
    expect(await second.json()).toEqual(await first.json())
  })

  test('reusing a key for a different order is a conflict, not a silent replay', async () => {
    h.mock.setToolResult(fixtures())
    await submit({ tip_amount_cents: 500 }, { 'idempotency-key': 'key-2' })
    const res = await submit({ tip_amount_cents: 900 }, { 'idempotency-key': 'key-2' })

    expect(res.status).toBe(409)
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'idempotency_conflict' })
  })

  test('no key means no replay protection', async () => {
    h.mock.setToolResult(fixtures())
    await submit({ tip_amount_cents: 500 })
    await submit({ tip_amount_cents: 500 })
    expect(h.mock.calls.filter((call) => call.tool === TOOLS.submitOrder)).toHaveLength(2)
  })

  test('confirm_total_cents refuses a moved price before ordering', async () => {
    h.mock.setToolResult(
      fixtures({ [TOOLS.previewOrder]: { quote: { net_total_before_tip: { unit_amount: 3410 } } } }),
    )
    const res = await submit({ tip_amount_cents: 500, confirm_total_cents: 2999 })

    expect(res.status).toBe(412)
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      error: 'total_mismatch',
      expected_cents: 2999,
      actual_cents: 3410,
    })
    // Nothing was ordered — that is the entire point.
    expect(h.mock.calls.some((call) => call.tool === TOOLS.submitOrder)).toBe(false)
  })

  test('a matching total proceeds', async () => {
    h.mock.setToolResult(
      fixtures({ [TOOLS.previewOrder]: { quote: { net_total_before_tip: { unit_amount: 3410 } } } }),
    )
    const res = await submit({ tip_amount_cents: 500, confirm_total_cents: 3410 })

    expect(res.status).toBe(200)
    expect(h.mock.calls.some((call) => call.tool === TOOLS.submitOrder)).toBe(true)
  })

  test('tolerance allows small drift', async () => {
    h.mock.setToolResult(
      fixtures({ [TOOLS.previewOrder]: { quote: { net_total_before_tip: { unit_amount: 3415 } } } }),
    )
    const res = await submit({
      tip_amount_cents: 500,
      confirm_total_cents: 3410,
      confirm_total_tolerance_cents: 10,
    })
    expect(res.status).toBe(200)
  })

  test('an unreadable quote refuses rather than ignoring the guardrail', async () => {
    h.mock.setToolResult(fixtures({ [TOOLS.previewOrder]: { quote: {} } }))
    const res = await submit({ tip_amount_cents: 500, confirm_total_cents: 3410 })

    expect(res.status).toBe(502)
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'total_mismatch' })
    expect(h.mock.calls.some((call) => call.tool === TOOLS.submitOrder)).toBe(false)
  })
})

describe('READ_ONLY', () => {
  let ro: Harness
  let roAuth: Record<string, string>

  beforeEach(async () => {
    ro = makeHarness({ READ_ONLY: 'true' })
    const { sessionToken } = await login(ro)
    roAuth = { ...bearer(sessionToken), 'content-type': 'application/json' }
  })
  afterEach(() => ro.stop())

  test('reads still work', async () => {
    expect((await ro.request('/v1/carts', { headers: roAuth })).status).toBe(200)
  })

  test('placing an order is refused', async () => {
    const res = await ro.request('/v1/carts/cart-7/order', {
      method: 'POST',
      headers: roAuth,
      body: JSON.stringify({ tip_amount_cents: 0 }),
    })

    expect(res.status).toBe(403)
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'read_only' })
    expect(ro.mock.calls.some((call) => call.tool === TOOLS.submitOrder)).toBe(false)
  })

  test('changing a cart is refused', async () => {
    const res = await ro.request('/v1/carts/cart-7', { method: 'DELETE', headers: roAuth })
    expect(res.status).toBe(403)
  })

  test('logging in is still allowed, or the instance would be unusable', async () => {
    expect((await ro.request('/v1/auth/login/start', { method: 'POST' })).status).toBe(200)
  })
})

describe('store name resolution', () => {
  test('`name:` resolves to the single nearby match', async () => {
    h.mock.setToolResult(
      fixtures({ [TOOLS.findRestaurants]: { stores: [{ store_id: '327011', name: 'Chipotle' }] } }),
    )
    const res = await h.request('/v1/stores/name:Chipotle', { headers: auth })

    expect(res.status).toBe(200)
    expect(lastCall().tool).toBe(TOOLS.getStoreInfo)
    expect(lastCall().args.store_id).toBe('327011')
    expect(res.headers.get('X-Resolved-Store-Id')).toBe('327011')
  })

  test('an ambiguous name is refused rather than guessed at', async () => {
    h.mock.setToolResult(
      fixtures({
        [TOOLS.findRestaurants]: {
          stores: [
            { store_id: '1', name: 'Chipotle' },
            { store_id: '2', name: 'Chipotle' },
          ],
        },
      }),
    )
    const res = await h.request('/v1/stores/name:Chipotle', { headers: auth })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; matches: unknown[] }
    expect(body.error).toBe('store_not_found')
    expect(body.matches).toHaveLength(2)
    // Never reached the store lookup, so nothing was fetched for the wrong branch.
    expect(h.mock.calls.some((call) => call.tool === TOOLS.getStoreInfo)).toBe(false)
  })
})

describe('not-found hints', () => {
  test('a rejected cart id comes back with the carts that exist', async () => {
    h.mock.setToolResult((tool) => {
      if (tool === TOOLS.listActiveCarts) return CARTS
      return { success: false, message: 'Cart not found.' }
    })
    const res = await h.request('/v1/carts/nope', { headers: auth })

    expect(res.status).toBe(502)
    const body = (await res.json()) as { known_carts: { cart_uuid: string }[]; carts: string }
    expect(body.carts).toBe('/v1/carts')
    expect(body.known_carts.map((cart) => cart.cart_uuid)).toEqual(['cart-old', 'cart-new'])
  })

  test('a rejected store id points at where ids come from', async () => {
    h.mock.setToolResult(() => ({ success: false, message: 'No such store.' }))
    const res = await h.request('/v1/stores/999999', { headers: auth })

    expect(res.status).toBe(502)
    expect((await res.json()) as { search: string }).toMatchObject({ search: '/v1/restaurants' })
  })

  test('an auth failure is not decorated', async () => {
    const res = await h.request('/v1/carts/cart-7', { headers: { authorization: 'Bearer dds2.nonsense' } })
    expect(res.status).toBe(401)
    expect(await res.json()).not.toHaveProperty('known_carts')
  })
})

describe('order status stream', () => {
  test('emits the status then ends on a terminal one', async () => {
    h.mock.setToolResult(() => ({ success: true, status: 'DELIVERED' }))
    const res = await h.request('/v1/orders/order-1/status/stream', { headers: auth })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')

    const body = await res.text()
    expect(body).toContain('event: status')
    expect(body).toContain('DELIVERED')
    // Terminal, so it closes itself rather than holding the connection open.
    expect(body).toContain('event: end')
    expect(body).toContain('"reason":"terminal"')
  })

  test('`latest` matching nothing fails before the stream opens', async () => {
    h.mock.setToolResult(fixtures({ [TOOLS.getOrderHistory]: { orders: [] } }))
    const res = await h.request('/v1/orders/latest/status/stream', { headers: auth })

    // A plain 400, not a 200 whose first frame is an error.
    expect(res.status).toBe(400)
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'order_not_found' })
  })
})

describe('Retry-After', () => {
  test('accompanies a pairing rate limit', async () => {
    const capped = makeHarness({ PAIRING_MAX_PENDING: '1' })
    try {
      expect((await capped.request('/v1/auth/pair/request', { method: 'POST' })).status).toBe(200)
      const res = await capped.request('/v1/auth/pair/request', { method: 'POST' })

      expect(res.status).toBe(429)
      expect(res.headers.get('Retry-After')).toBe('5')
    } finally {
      capped.stop()
    }
  })

  test('accompanies a slow_down, carrying the new interval', async () => {
    const { device_code } = (await (
      await h.request('/v1/auth/pair/request', { method: 'POST' })
    ).json()) as { device_code: string }

    const poll = () =>
      h.request('/v1/auth/pair/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ device_code }),
      })

    // The first poll is always allowed; the immediate second one is too fast.
    expect((await poll()).status).toBe(400)
    const res = await poll()

    expect((await res.clone().json()) as { error: string }).toMatchObject({ error: 'slow_down' })
    expect(res.headers.get('Retry-After')).toBe('10')
  })
})
