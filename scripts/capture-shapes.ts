/**
 * Derives response schemas from real gateway responses.
 *
 * Run:  bun run capture-shapes                # read-only
 *       bun run capture-shapes --with-cart    # also covers cart/preview shapes
 *       bun run capture-shapes --fresh        # discard previous captures first
 *       bun run gen-schemas
 *
 * Runs accumulate. What can be captured depends on what exists on the account
 * at the time — no active cart means no get_cart shape — so each run keeps
 * whatever earlier ones found and only replaces the tools it captures itself.
 *
 * The gateway's advertised `outputSchema` is not enough to document a response.
 * Six of the tools we use declare a bare `{additionalProperties: true}`, and
 * several of the described ones leave their leaves untyped — `find_restaurants`
 * declares `stores` as `{"type": "array"}` with no item schema at all. Swagger
 * has nothing to render from that but `additionalProp1/2/3`.
 *
 * So this calls the read-only tools for real and infers the shape from what
 * comes back. It chains: the addresses give coordinates, a restaurant search
 * gives a store, the menu gives an item, and so on — no ids to paste in.
 *
 * **Only types are recorded, never values.** Real responses carry the account's
 * addresses, order history and payment methods, and the output of this script is
 * committed to a public repository. Field names and types are the API's shape;
 * the values are the user's data, and they are dropped here rather than
 * scrubbed later.
 *
 * Read-only by default. `--with-cart` additionally creates a cart, captures the
 * three shapes that require one (get_cart, checkout-url, preview_order), and
 * clears it again. That is a write, but a reversible one — a cart is not an
 * order and nothing is charged. Nothing here ever submits an order.
 */

import { loadConfig } from '../src/config.ts'
import { deriveCodeChallenge, generateCodeVerifier, generateState } from '../src/auth/pkce.ts'
import { buildAuthorizeUrl, exchangeCodeForToken, parseCallbackUrl } from '../src/auth/oauth.ts'
import { parseEnvelope } from '../src/mcp/client.ts'
import { TOOLS, intentFor, type ToolName } from '../src/mcp/tools.ts'

const OUT = 'data/observed-shapes.json'

const cfg = loadConfig({
  ...process.env,
  SESSION_KEYS: process.env.SESSION_KEYS || Buffer.alloc(32, 1).toString('base64'),
})

const argv = process.argv.slice(2)
const pastedCallback = argv.find((a) => a.includes('://') || a.includes('code='))
const withCart = argv.includes('--with-cart')
const fresh = argv.includes('--fresh')
const accessToken = process.env.DD_ACCESS_TOKEN ?? (await loginForToken())

async function loginForToken(): Promise<string> {
  const verifier = generateCodeVerifier()
  const state = generateState()
  console.log('\n1. Open this and sign in:\n')
  console.log(`   ${buildAuthorizeUrl(cfg, { state, codeChallenge: deriveCodeChallenge(verifier), redirectUri: cfg.redirectUri })}\n`)
  console.log(`2. You land on ${cfg.redirectUri} and it fails to load. That is expected.`)
  console.log('3. Paste the full URL.  (Or set DD_ACCESS_TOKEN to skip this.)\n')
  const pasted = pastedCallback ?? prompt('Callback URL:')
  if (!pasted) process.exit(1)
  const { code, state: returned } = parseCallbackUrl(pasted)
  if (returned !== state) {
    console.error('State mismatch — that URL is from a different login attempt.')
    process.exit(1)
  }
  return (await exchangeCodeForToken(cfg, { code, redirectUri: cfg.redirectUri, codeVerifier: verifier })).access_token
}

async function call(tool: ToolName, args: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
  const response = await fetch(`${cfg.mcpBase}/mcp/consumer`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: tool, arguments: { ...args, intent: intentFor(tool) } },
    }),
  })

  const raw = await response.text()
  if (!response.ok) {
    console.log(`   ${tool}: HTTP ${response.status}`)
    return undefined
  }
  const envelope = parseEnvelope(raw, response.headers.get('content-type'))
  if (envelope?.error) {
    console.log(`   ${tool}: JSON-RPC error`)
    return undefined
  }
  const result = (envelope?.result ?? {}) as { structuredContent?: unknown; isError?: boolean }
  if (result.isError) {
    console.log(`   ${tool}: tool reported an error`)
    return undefined
  }
  const structured = result.structuredContent
  if (!structured || typeof structured !== 'object') {
    console.log(`   ${tool}: no structuredContent`)
    return undefined
  }
  return structured as Record<string, unknown>
}

// ---------------------------------------------------------------- inference

type Schema = Record<string, unknown>

/** JSON Schema for a value — types and structure only, never the value itself. */
function infer(value: unknown): Schema {
  if (value === null) return { type: 'null' }
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: 'array' }
    // Merge every element, so a field absent from the first entry is still
    // documented and only fields present in all of them are marked required.
    return { type: 'array', items: value.map(infer).reduce(merge) }
  }
  switch (typeof value) {
    case 'string':
      return { type: 'string' }
    case 'number':
      return { type: Number.isInteger(value) ? 'integer' : 'number' }
    case 'boolean':
      return { type: 'boolean' }
    case 'object': {
      const properties: Schema = {}
      for (const [k, v] of Object.entries(value as object)) properties[k] = infer(v)
      return {
        type: 'object',
        properties,
        required: Object.keys(properties),
        additionalProperties: true,
      }
    }
    default:
      return {}
  }
}

/** Combines two inferred schemas for the same position across samples. */
function merge(a: Schema, b: Schema): Schema {
  if (JSON.stringify(a) === JSON.stringify(b)) return a

  // A field seen as null in one sample and typed in another is nullable.
  if (a.type === 'null') return { ...b, nullable: true }
  if (b.type === 'null') return { ...a, nullable: true }

  if (a.type === 'object' && b.type === 'object') {
    const pa = (a.properties ?? {}) as Schema
    const pb = (b.properties ?? {}) as Schema
    const properties: Schema = { ...pa }
    for (const [k, v] of Object.entries(pb)) {
      properties[k] = k in pa ? merge(pa[k] as Schema, v as Schema) : (v as Schema)
    }
    const ra = new Set((a.required as string[]) ?? [])
    const rb = new Set((b.required as string[]) ?? [])
    return {
      type: 'object',
      properties,
      required: [...ra].filter((k) => rb.has(k)),
      additionalProperties: true,
    }
  }

  if (a.type === 'array' && b.type === 'array') {
    const ia = a.items as Schema | undefined
    const ib = b.items as Schema | undefined
    return { type: 'array', ...(ia && ib ? { items: merge(ia, ib) } : ia || ib ? { items: ia ?? ib } : {}) }
  }

  // integer and number are the same field seen with and without a fraction.
  if ((a.type === 'integer' && b.type === 'number') || (a.type === 'number' && b.type === 'integer')) {
    return { type: 'number' }
  }
  return { type: [a.type, b.type].filter(Boolean).flat() }
}

// ---------------------------------------------------------------- capture

/**
 * Previous runs are carried forward, not overwritten.
 *
 * Coverage depends on what happens to exist on the account at the time: no
 * active cart means no get_cart shape, no past orders means no receipt shape.
 * A plain re-run would otherwise delete whatever the last run managed to
 * capture, so a read-only run after a --with-cart run would silently undo it.
 *
 * A tool captured in *this* run replaces its previous entry outright rather
 * than merging, so a field DoorDash has removed does not linger forever.
 */
let observed: Record<string, Schema> = {}
if (!fresh) {
  try {
    observed = JSON.parse(await Bun.file(OUT).text()) as Record<string, Schema>
    console.log(`Carrying forward ${Object.keys(observed).length} shapes from ${OUT}.`)
  } catch {
    // No previous capture; starting from nothing is the normal first run.
  }
}
const carriedOver = new Set(Object.keys(observed))
const capturedNow = new Set<string>()

const record = (tool: ToolName, body: Record<string, unknown> | undefined) => {
  if (!body) return
  const shape = infer(body)
  // Merge only with samples from this run — several calls to the same tool with
  // different arguments each show a bit more of the shape.
  observed[tool] = capturedNow.has(tool) ? merge(observed[tool]!, shape) : shape
  capturedNow.add(tool)
  console.log(`   ${tool}: captured ${Object.keys(body).length} top-level fields`)
}

/** First value at `path` anywhere in the payload — shapes vary, so search rather than assume. */
function pluck(value: unknown, keys: string[]): string | undefined {
  const stack: unknown[] = [value]
  while (stack.length) {
    const node = stack.pop()
    if (Array.isArray(node)) {
      stack.push(...node)
      continue
    }
    if (node && typeof node === 'object') {
      for (const key of keys) {
        const found = (node as Record<string, unknown>)[key]
        if (typeof found === 'string' && found !== '') return found
        if (typeof found === 'number') return String(found)
      }
      stack.push(...Object.values(node))
    }
  }
  return undefined
}

console.log('\nCapturing response shapes (read-only) …\n')

console.log(' account')
const addresses = await call(TOOLS.listDeliveryAddresses, {})
record(TOOLS.listDeliveryAddresses, addresses)
record(TOOLS.getPaymentInfo, await call(TOOLS.getPaymentInfo, {}))

const lat = Number(pluck(addresses, ['lat', 'latitude']) ?? cfg.defaultLatitude)
const lng = Number(pluck(addresses, ['lng', 'longitude']) ?? cfg.defaultLongitude)
console.log(`   using ${lat.toFixed(4)}, ${lng.toFixed(4)}`)

console.log('\n discovery')
const restaurants = await call(TOOLS.findRestaurants, { query: 'pizza', latitude: lat, longitude: lng, max_stores: 5 })
record(TOOLS.findRestaurants, restaurants)

const storeId = pluck(restaurants, ['store_id'])
if (!storeId) {
  console.log('   no store_id in the restaurant search — menu and item shapes not captured')
} else {
  record(TOOLS.getStoreInfo, await call(TOOLS.getStoreInfo, { store_id: storeId }))
  // include_extras, or every item's extras[] and popular_modifications[] come
  // back empty and an empty array documents nothing.
  const menu = await call(TOOLS.getRestaurantMenu, { store_id: storeId, include_extras: true })
  record(TOOLS.getRestaurantMenu, menu)
  record(TOOLS.listPromotions, await call(TOOLS.listPromotions, { store_id: storeId }))

  const menuId = pluck(menu, ['menu_id'])
  const itemId = pluck(menu, ['item_id'])
  if (menuId && itemId) {
    record(TOOLS.getFoodItem, await call(TOOLS.getFoodItem, { store_id: storeId, menu_id: menuId, item_id: itemId }))
  } else {
    console.log(`   menu gave menu_id=${menuId ?? 'none'} item_id=${itemId ?? 'none'} — get_food_item skipped`)
  }
}

const grocery = await call(TOOLS.findNearbyStores, { vertical_scope: 'grocery', max_stores: 5, user_lat: lat, user_lon: lng })
record(TOOLS.findNearbyStores, grocery)

const groceryId = pluck(grocery, ['store_id'])
if (!groceryId) {
  console.log('   no grocery store nearby — item search shapes not captured')
} else {
  // Several terms, because a store that stocks none of them returns an empty
  // results set and the shape stays unknown.
  for (const term of ['milk', 'bread', 'banana']) {
    const items = await call(TOOLS.findItemsInStore, { store_id: groceryId, item_names: [term] })
    record(TOOLS.findItemsInStore, items)
    const groceryItem = pluck(items, ['item_id'])
    if (groceryItem) {
      record(TOOLS.getItemDetails, await call(TOOLS.getItemDetails, { store_id: groceryId, item_id: groceryItem }))
      break
    }
    console.log(`   "${term}" returned nothing usable, trying another term`)
  }
}

console.log('\n carts')
let carts = await call(TOOLS.listActiveCarts, { max_carts: 10 })
record(TOOLS.listActiveCarts, carts)
let cartUuid = pluck(carts, ['cart_uuid', 'cart_id'])
let cartIsOurs = false

// A cart is the only way to see get_cart, checkout-url and preview_order, and
// those are three of the biggest remaining gaps. Creating one is reversible —
// it is not an order and nothing is charged — but it is still a write, so it
// happens only when asked for, and it is cleared again afterwards.
if (!cartUuid && withCart && storeId) {
  const menu = await call(TOOLS.getRestaurantMenu, { store_id: storeId })
  const menuId = pluck(menu, ['menu_id'])
  const itemId = pluck(menu, ['item_id'])
  const itemName = pluck(menu, ['name', 'item_name']) ?? 'Item'

  if (menuId && itemId) {
    console.log('   --with-cart: creating a temporary cart')
    const added = await call(TOOLS.addToCart, {
      store_id: storeId,
      menu_id: menuId,
      items: [{ item_id: itemId, item_name: itemName, quantity: 1 }],
      include_pricing: true,
    })
    record(TOOLS.addToCart, added)
    cartUuid = pluck(added, ['cart_uuid', 'cart_id'])
    cartIsOurs = Boolean(cartUuid)
    if (cartUuid) {
      carts = await call(TOOLS.listActiveCarts, { max_carts: 10 })
      record(TOOLS.listActiveCarts, carts)
    }
  } else {
    console.log('   --with-cart: could not find a menu item to add')
  }
}

if (cartUuid) {
  record(TOOLS.getCart, await call(TOOLS.getCart, { cart_uuid: cartUuid, include_pricing: true }))
  record(TOOLS.getCheckoutUrl, await call(TOOLS.getCheckoutUrl, { cart_uuid: cartUuid }))
  record(TOOLS.previewOrder, await call(TOOLS.previewOrder, { cart_uuid: cartUuid }))

  if (cartIsOurs) {
    // Always clean up, even if a capture above failed.
    const cleared = await call(TOOLS.clearCart, { cart_uuid: cartUuid })
    record(TOOLS.clearCart, cleared)
    console.log(cleared ? '   temporary cart cleared' : `   COULD NOT CLEAR CART ${cartUuid} — remove it yourself`)
  }
} else {
  console.log('   no active cart — get_cart, checkout-url and preview not captured')
  console.log('   (re-run with --with-cart to create and then clear a temporary one)')
}

console.log('\n orders')
const history = await call(TOOLS.getOrderHistory, { time_range_days: 365, max_orders: 10 })
record(TOOLS.getOrderHistory, history)
const orderUuid = pluck(history, ['order_uuid'])
if (orderUuid) {
  record(TOOLS.getOrderReceipt, await call(TOOLS.getOrderReceipt, { order_uuid: orderUuid }))
  record(TOOLS.getOrderStatus, await call(TOOLS.getOrderStatus, { order_uuid: orderUuid }))
} else {
  console.log('   no past orders — receipt and status not captured')
}

await Bun.write(OUT, JSON.stringify(observed, null, 2))

const missing = Object.values(TOOLS).filter((t) => !(t in observed))
const kept = [...carriedOver].filter((t) => !capturedNow.has(t))

console.log(`\nWrote ${OUT}`)
console.log(`  captured this run: ${capturedNow.size}`)
if (kept.length) console.log(`  kept from earlier: ${kept.length} (${kept.join(', ')})`)
console.log(`  total: ${Object.keys(observed).length}/${Object.values(TOOLS).length} tools`)
if (missing.length) console.log(`  never captured: ${missing.join(', ')}`)
console.log('\nTypes only — no values from the account are recorded. Now run:  bun run gen-schemas')
