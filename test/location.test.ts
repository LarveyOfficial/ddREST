import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { TOOLS } from '../src/mcp/tools.ts'
import { makeHarness, bearer, login } from './helpers.ts'

const h = makeHarness()
afterAll(() => h.stop())

let session: string
const calls: { tool: string; args: Record<string, unknown> }[] = []

/**
 * Serves a saved-address list and records every tool call, so a test can assert
 * both that the lookup happened and what coordinates came out of it.
 */
function withAddresses(addresses: unknown): void {
  calls.length = 0
  h.mock.setToolResult((tool, args) => {
    calls.push({ tool, args })
    return tool === TOOLS.listDeliveryAddresses ? addresses : { ok: true }
  })
}

/** The real shape, captured from a live account. */
const CHICAGO = {
  address_id: '1611178960',
  address_link_id: '6065321966',
  printable_address: 'Thompson Hotels, 21 E Bellevue Pl, Chicago, IL 60611, USA',
  street_address: '21 E Bellevue Pl',
  city: 'Chicago',
  state: 'IL',
  zip_code: '60611',
  lat: 41.901498986408114,
  lng: -87.62748101726174,
  is_default: false,
  label: null,
  delivery_instructions: '',
}

const LA = {
  ...CHICAGO,
  address_id: '2222222222',
  address_link_id: '3333333333',
  printable_address: '2 Broad St, Los Angeles, CA 90012, USA',
  street_address: '2 Broad St',
  city: 'Los Angeles',
  state: 'CA',
  lat: 34.0522,
  lng: -118.2437,
  is_default: true,
}

const LIST = { widget_type: 'delivery_addresses', addresses: [CHICAGO, LA] }

beforeEach(async () => {
  if (!session) session = (await login(h)).sessionToken
  withAddresses(LIST)
})

const get = (path: string) => h.request(path, { headers: bearer(session) })

const searchArgs = () => calls.find((c) => c.tool === TOOLS.findRestaurants)?.args

describe('address_id as a location', () => {
  test('resolves to the saved address coordinates', async () => {
    const res = await get(`/v1/restaurants?query=pizza&address_id=${LA.address_id}`)
    expect(res.status).toBe(200)

    expect(calls.map((c) => c.tool)).toEqual([TOOLS.listDeliveryAddresses, TOOLS.findRestaurants])
    expect(searchArgs()).toMatchObject({ latitude: LA.lat, longitude: LA.lng })
  })

  test('works the same on nearby-stores', async () => {
    await get(`/v1/nearby-stores?address_id=${CHICAGO.address_id}`)
    const args = calls.find((c) => c.tool === TOOLS.findNearbyStores)?.args
    expect(args).toMatchObject({ user_lat: CHICAGO.lat, user_lon: CHICAGO.lng })
  })

  test('address_link_id is not mistaken for address_id', async () => {
    // Each entry carries both, and only one of them is the id this accepts.
    const res = await get(`/v1/restaurants?query=pizza&address_id=${CHICAGO.address_link_id}`)
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('address_not_found')
  })

  test('costs no extra lookup when coordinates are given directly', async () => {
    await get('/v1/restaurants?query=pizza&latitude=1&longitude=2')
    expect(calls.map((c) => c.tool)).toEqual([TOOLS.findRestaurants])
    expect(searchArgs()).toMatchObject({ latitude: 1, longitude: 2 })
  })

  test('falls back to the configured default when no location is given at all', async () => {
    await get('/v1/restaurants?query=pizza')
    expect(calls.map((c) => c.tool)).toEqual([TOOLS.findRestaurants])
    expect(searchArgs()).toMatchObject({ latitude: h.cfg.defaultLatitude, longitude: h.cfg.defaultLongitude })
  })

  test('an unknown id is rejected, and says which addresses exist', async () => {
    const res = await get('/v1/restaurants?query=pizza&address_id=9999')
    expect(res.status).toBe(400)

    const body = (await res.json()) as {
      error: string
      message: string
      known_addresses: { id: string; address?: string }[]
    }
    expect(body.error).toBe('address_not_found')
    expect(body.message).toContain('9999')
    // Ids alone are opaque numbers, so each is paired with something readable.
    expect(body.known_addresses).toEqual([
      { id: CHICAGO.address_id, address: CHICAGO.printable_address },
      { id: LA.address_id, address: LA.printable_address },
    ])

    // Rejected before the search runs, rather than quietly searching elsewhere.
    expect(calls.map((c) => c.tool)).toEqual([TOOLS.listDeliveryAddresses])
  })

  test('an address with no coordinates on it is an error, not a silent default', async () => {
    withAddresses({ addresses: [{ id: 'addr-bare', street: '3 Elm St' }] })

    const res = await get('/v1/restaurants?query=pizza&address_id=addr-bare')
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; address_fields: string[] }
    expect(body.error).toBe('address_missing_coordinates')
    // The fields it did find, so an unexpected shape is diagnosable from the error alone.
    expect(body.address_fields).toEqual(['id', 'street'])
  })

  test('supplying both forms is refused rather than one silently winning', async () => {
    const res = await get('/v1/restaurants?query=pizza&address_id=addr-home&latitude=1&longitude=2')
    expect(res.status).toBe(400)
    expect(((await res.json()) as { message: string }).message).toContain('not both')
    expect(calls).toEqual([])
  })

  test('reads the shapes DoorDash might plausibly return, since it publishes none', async () => {
    // Nested container, nested coordinates, string values, and an alternative
    // id field — all variations we cannot rule out and none worth failing over.
    withAddresses({
      data: { items: [{ address_id: 'addr-x', location: { latitude: '51.5072', longitude: '-0.1276' } }] },
    })

    await get('/v1/restaurants?query=pizza&address_id=addr-x')
    expect(searchArgs()).toMatchObject({ latitude: 51.5072, longitude: -0.1276 })
  })
})
