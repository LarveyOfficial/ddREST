/**
 * Turning a handle a human has into the opaque id DoorDash wants.
 *
 * Same bargain as `address_id` in location.ts: the caller states intent, this
 * module spends one extra upstream call working out what they meant, and a
 * caller who already has the id pays nothing. Every shorthand is opt-in and
 * syntactically distinct from a real id, so a literal id is never reinterpreted.
 *
 *   cart_uuid   latest | store:<store_id>
 *   order_uuid  latest
 *   store_id    name:<text>
 *   menu_id     omitted entirely, resolved from the store
 *
 * A resolution the caller did not spell out is reported back in an
 * `X-Resolved-*` header, because "which cart did it actually use" is not a
 * question the body reliably answers, and guessing wrong about a cart is how
 * you order two dinners.
 */

import type { Context } from 'hono'
import { ApiError } from '../errors.ts'
import type { AppEnv } from '../types.ts'
import { TOOLS } from '../mcp/tools.ts'
import { callTool } from './shared.ts'
import { resolveLocation } from './location.ts'

/** Most recently touched, whichever resource it is. */
export const LATEST_KEYWORD = 'latest'
const STORE_PREFIX = 'store:'
const NAME_PREFIX = 'name:'

/**
 * Records what a shorthand turned into.
 *
 * A header rather than a body field: the body is DoorDash's, passed through
 * untouched, and threading an extra key into every response shape would make
 * this API's output disagree with the schemas it publishes.
 */
export function noteResolved(c: Context<AppEnv>, what: string, value: string): void {
  c.header(`X-Resolved-${what}`, value)
}

// ---- carts -----------------------------------------------------------------

interface CartSummary {
  cart_uuid: string
  store_id?: string
  store_name?: string
  items_count?: number
  updated_at?: number
}

/**
 * `latest`, `store:<id>`, or a literal cart uuid passed straight through.
 *
 * Ordering is by `updated_at` from the upstream payload; a cart missing it
 * sorts last rather than winning by accident.
 */
export async function resolveCartUuid(c: Context<AppEnv>, cartUuid: string): Promise<string> {
  const wantsLatest = cartUuid.toLowerCase() === LATEST_KEYWORD
  const storeFilter = cartUuid.toLowerCase().startsWith(STORE_PREFIX)
    ? cartUuid.slice(STORE_PREFIX.length).trim()
    : undefined

  if (!wantsLatest && storeFilter === undefined) return cartUuid

  const result = await callTool(c, TOOLS.listActiveCarts, {
    max_carts: 40,
    store_id: storeFilter === '' ? undefined : storeFilter,
  })
  const carts = collectCarts(result)

  const candidates =
    storeFilter === undefined ? carts : carts.filter((cart) => String(cart.store_id ?? '') === storeFilter)

  const chosen = [...candidates].sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0))[0]

  if (!chosen) {
    throw new ApiError(
      400,
      'cart_not_found',
      storeFilter === undefined
        ? 'There are no active carts, so there is no "latest" one. Add an item to create one.'
        : `There is no active cart at store ${JSON.stringify(storeFilter)}.`,
      // Always set, even when empty: an empty list is the answer, and its
      // presence is what stops hints.ts listing the carts a second time.
      { carts: '/v1/carts', known_carts: carts },
    )
  }

  noteResolved(c, 'Cart-Uuid', chosen.cart_uuid)
  return chosen.cart_uuid
}

/**
 * Active carts as a flat list, tolerant of where they sit in the payload.
 *
 * `list_active_carts` spells the key `cart_uuid` while `get_cart` spells it
 * `id`, so both are accepted.
 */
function collectCarts(result: unknown): CartSummary[] {
  const found = new Map<string, CartSummary>()
  for (const obj of walkObjects(result)) {
    const uuid = firstString(obj, ['cart_uuid', 'cart_id'])
    if (uuid === undefined || found.has(uuid)) continue
    found.set(uuid, {
      cart_uuid: uuid,
      ...pickString(obj, 'store_id'),
      ...pickString(obj, 'store_name'),
      ...pickNumber(obj, 'items_count'),
      ...pickNumber(obj, 'updated_at'),
    })
  }
  return [...found.values()]
}

/** The active carts, for an error that tells the caller what does exist. */
export async function knownCarts(c: Context<AppEnv>): Promise<CartSummary[]> {
  try {
    return collectCarts(await callTool(c, TOOLS.listActiveCarts, { max_carts: 40 }))
  } catch {
    // Best-effort decoration on an error path; the original failure matters more.
    return []
  }
}

// ---- orders ----------------------------------------------------------------

interface OrderSummary {
  order_uuid: string
  store_name?: string
  order_date?: string
}

/** `latest` (most recent order in the last 90 days), or a literal uuid. */
export async function resolveOrderUuid(c: Context<AppEnv>, orderUuid: string): Promise<string> {
  if (orderUuid.toLowerCase() !== LATEST_KEYWORD) return orderUuid

  // Upstream returns history newest-first; sorting on order_date would mean
  // parsing a format DoorDash does not document, so position is trusted.
  const result = await callTool(c, TOOLS.getOrderHistory, { time_range_days: 90, max_orders: 1 })
  const orders = collectOrders(result)
  const chosen = orders[0]

  if (!chosen) {
    throw new ApiError(400, 'order_not_found', 'No orders in the last 90 days, so there is no "latest" one.', {
      orders: '/v1/orders',
    })
  }

  noteResolved(c, 'Order-Uuid', chosen.order_uuid)
  return chosen.order_uuid
}

function collectOrders(result: unknown): OrderSummary[] {
  const found = new Map<string, OrderSummary>()
  for (const obj of walkObjects(result)) {
    const uuid = firstString(obj, ['order_uuid', 'order_id'])
    if (uuid === undefined || found.has(uuid)) continue
    found.set(uuid, { order_uuid: uuid, ...pickString(obj, 'store_name'), ...pickString(obj, 'order_date') })
  }
  return [...found.values()]
}

// ---- stores ----------------------------------------------------------------

/**
 * `name:<text>`, or a literal store id.
 *
 * Search needs somewhere to search from, so this borrows the account's default
 * address and falls back to the configured coordinates. A name that matches
 * several stores is refused rather than resolved to the first hit — picking one
 * silently would mean ordering from the wrong branch of a chain.
 */
export async function resolveStoreId(c: Context<AppEnv>, storeId: string): Promise<string> {
  if (!storeId.toLowerCase().startsWith(NAME_PREFIX)) return storeId

  const name = storeId.slice(NAME_PREFIX.length).trim()
  if (name === '') {
    throw ApiError.badRequest('`name:` needs a store name after it, e.g. `name:Chipotle`.')
  }

  const cfg = c.get('config')
  const location = await defaultLocation(c)
  const result = await callTool(c, TOOLS.findRestaurants, {
    query: name,
    latitude: location.latitude ?? cfg.defaultLatitude,
    longitude: location.longitude ?? cfg.defaultLongitude,
    desired_restaurant_name: name,
    max_stores: 10,
  })

  const stores = collectStores(result)
  const wanted = name.toLowerCase()
  const exact = stores.filter((s) => s.name?.toLowerCase() === wanted)
  const candidates = exact.length > 0 ? exact : stores

  if (candidates.length === 0) {
    throw new ApiError(400, 'store_not_found', `No store near you matched the name ${JSON.stringify(name)}.`, {
      search: '/v1/restaurants',
    })
  }
  if (candidates.length > 1) {
    throw new ApiError(
      400,
      'store_not_found',
      `${JSON.stringify(name)} matched ${candidates.length} stores near you. Pass a store_id instead.`,
      { search: '/v1/restaurants', matches: candidates.slice(0, 10) },
    )
  }

  const chosen = candidates[0]!
  noteResolved(c, 'Store-Id', chosen.store_id)
  return chosen.store_id
}

interface StoreSummary {
  store_id: string
  name?: string
  distance?: string
}

function collectStores(result: unknown): StoreSummary[] {
  const found = new Map<string, StoreSummary>()
  for (const obj of walkObjects(result)) {
    const id = firstString(obj, ['store_id'])
    if (id === undefined || found.has(id)) continue
    found.set(id, { store_id: id, ...pickString(obj, 'name'), ...pickString(obj, 'distance') })
  }
  return [...found.values()]
}

// ---- menus -----------------------------------------------------------------

/**
 * The store's menu id, for callers who did not supply one.
 *
 * `get_store_info` carries `menu_id` directly, so this costs one small call
 * rather than pulling down a whole menu.
 */
export async function resolveMenuId(c: Context<AppEnv>, storeId: string, menuId?: string): Promise<string> {
  if (menuId !== undefined && menuId !== '') return menuId

  const result = await callTool(c, TOOLS.getStoreInfo, { store_id: storeId })
  for (const obj of walkObjects(result)) {
    const found = firstString(obj, ['menu_id'])
    if (found !== undefined) {
      noteResolved(c, 'Menu-Id', found)
      return found
    }
  }

  throw new ApiError(
    400,
    'menu_not_found',
    `Store ${JSON.stringify(storeId)} did not report a menu_id, so it could not be filled in. ` +
      'Pass `menu_id` explicitly — GET /v1/stores/{store_id}/menu returns it.',
    { menu: `/v1/stores/${storeId}/menu` },
  )
}

// ---- shared helpers --------------------------------------------------------

/** Coordinates of the account's default address, for calls that need a location. */
async function defaultLocation(c: Context<AppEnv>): Promise<{ latitude?: number; longitude?: number }> {
  try {
    return await resolveLocation(c, { address_id: 'default' })
  } catch {
    // No default saved is not a reason to fail a store lookup; the configured
    // coordinates stand in.
    return {}
  }
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

function firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value !== '') return value
    if (typeof value === 'number') return String(value)
  }
  return undefined
}

function pickString(obj: Record<string, unknown>, key: string): Record<string, string> {
  const value = obj[key]
  if (typeof value === 'string' && value !== '') return { [key]: value }
  if (typeof value === 'number') return { [key]: String(value) }
  return {}
}

function pickNumber(obj: Record<string, unknown>, key: string): Record<string, number> {
  const value = obj[key]
  return typeof value === 'number' && Number.isFinite(value) ? { [key]: value } : {}
}
