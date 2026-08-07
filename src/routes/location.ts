/**
 * Turning an `address_id` into coordinates.
 *
 * Every endpoint that takes latitude/longitude also takes an `address_id` from
 * GET /v1/addresses, because "search near my apartment" is the actual intent
 * almost every time and looking the coordinates up by hand is busywork.
 *
 * The lookup calls doordash_list_delivery_addresses and reads the coordinates
 * off the matching entry. That costs one extra upstream round trip, but only
 * when `address_id` is actually used — passing latitude/longitude skips it
 * entirely. Nothing is cached: an address the user just added would otherwise
 * be invisible until a TTL elapsed, which is a worse failure than a round trip.
 *
 * DoorDash does not publish response shapes (see ToolResultSchema), so the
 * field names below are tolerant rather than exact, and a shape we cannot read
 * produces an error that says what was actually found. Guessing silently and
 * returning results for the wrong part of the country would be far worse.
 */

import type { Context } from 'hono'
import { ApiError } from '../errors.ts'
import type { AppEnv } from '../types.ts'
import { TOOLS } from '../mcp/tools.ts'
import { callTool } from './shared.ts'

const ID_FIELDS = ['id', 'address_id', 'uuid', 'address_uuid']
const DEFAULT_FIELDS = ['is_default', 'default', 'is_primary']

/** Stands in for whichever address DoorDash has marked as the default. */
export const DEFAULT_KEYWORD = 'default'
const LAT_FIELDS = ['lat', 'latitude']
const LNG_FIELDS = ['lng', 'lon', 'long', 'longitude']

/** The label a saved address carries — "home", "work", whatever was set. */
const LABEL_ONLY_FIELDS = ['label', 'address_label', 'name']

export interface LocationInput {
  latitude?: number
  longitude?: number
  address_id?: string
}

export interface ResolvedLocation {
  latitude?: number
  longitude?: number
  /** Set when a shorthand was resolved, so the route can report what it picked. */
  addressId?: string
}

/**
 * Resolves whichever form of location the caller supplied.
 *
 * Returns coordinates unchanged when given directly, so the only cost of this
 * indirection falls on requests that opt into it.
 */
export async function resolveLocation(c: Context<AppEnv>, input: LocationInput): Promise<ResolvedLocation> {
  const { latitude, longitude, address_id } = input

  if (address_id === undefined) return { latitude, longitude }

  // Silently preferring one over the other would send results for a place the
  // caller did not ask about, and they would have no way to tell.
  if (latitude !== undefined || longitude !== undefined) {
    throw new ApiError(
      400,
      'invalid_request',
      'Send either `address_id` or `latitude`/`longitude`, not both — they would disagree.',
    )
  }

  const result = await callTool(c, TOOLS.listDeliveryAddresses, {})

  // A literal id match is tried first, so a real address whose id happened to
  // be "default" or "home" still wins over the shorthand reading of it.
  let address = findAddress(result, address_id)
  if (!address && address_id.toLowerCase() === DEFAULT_KEYWORD) {
    address = findDefaultAddress(result)
    if (!address) {
      throw new ApiError(
        400,
        'address_not_found',
        'No saved address is marked as the default. Pass a specific address_id instead.',
        { addresses: '/v1/addresses', known_addresses: collectAddresses(result) },
      )
    }
  }
  // Labels are what people actually call their addresses, and PUT
  // /v1/addresses/{id}/label exists to set them, so accepting one here closes
  // the loop. Ambiguity is refused rather than resolved arbitrarily.
  if (!address) {
    const labelled = findByLabel(result, address_id)
    if (labelled.length > 1) {
      throw new ApiError(
        400,
        'address_not_found',
        `${JSON.stringify(address_id)} matches ${labelled.length} saved addresses, so it is ambiguous. ` +
          'Pass the address_id of the one you mean.',
        { addresses: '/v1/addresses', known_addresses: collectAddresses(result) },
      )
    }
    address = labelled[0]
  }

  if (!address) {
    // Ids are opaque numbers, so listing them bare is little help — pair each
    // with something a human recognises.
    const known = collectAddresses(result)
    throw new ApiError(
      400,
      'address_not_found',
      `No saved address has the id or label ${JSON.stringify(address_id)}. ` +
        `Use one of the entries below, its label, or "${DEFAULT_KEYWORD}" for whichever address is marked as ` +
        'the account default.',
      { addresses: '/v1/addresses', ...(known.length > 0 ? { known_addresses: known } : {}) },
    )
  }

  const coords = coordinatesOf(address)
  if (!coords) {
    throw new ApiError(
      400,
      'address_missing_coordinates',
      `The saved address ${JSON.stringify(address_id)} has no coordinates on it, so it cannot be used to search. ` +
        'Pass `latitude` and `longitude` instead.',
      { address_fields: Object.keys(address).sort(), addresses: '/v1/addresses' },
    )
  }

  return { ...coords, addressId: idOf(address) }
}

/** Saved addresses whose label matches, compared loosely so "Home" finds "home". */
function findByLabel(result: unknown, label: string): Record<string, unknown>[] {
  const wanted = label.trim().toLowerCase()
  const matches: Record<string, unknown>[] = []
  const seen = new Set<string>()
  for (const obj of walkObjects(result)) {
    const id = idOf(obj)
    if (id === undefined || seen.has(id) || !coordinatesOf(obj)) continue
    const hit = LABEL_ONLY_FIELDS.some((field) => {
      const value = obj[field]
      return typeof value === 'string' && value.trim().toLowerCase() === wanted
    })
    if (hit) {
      seen.add(id)
      matches.push(obj)
    }
  }
  return matches
}

/** Every object anywhere in the payload, so the array's nesting does not matter. */
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

function idOf(obj: Record<string, unknown>): string | undefined {
  for (const field of ID_FIELDS) {
    const value = obj[field]
    if (typeof value === 'string' && value !== '') return value
    if (typeof value === 'number') return String(value)
  }
  return undefined
}

function findAddress(result: unknown, addressId: string): Record<string, unknown> | undefined {
  for (const obj of walkObjects(result)) {
    if (idOf(obj) === addressId) return obj
  }
  return undefined
}

/**
 * Coordinates of the account's default saved address, given a raw
 * doordash_list_delivery_addresses result.
 *
 * Exported for scripts/capture-shapes.ts, which needs somewhere real to search
 * from and should use the same notion of "default" this API does rather than a
 * second implementation that could drift.
 */
export function defaultAddressCoordinates(addressList: unknown): ResolvedLocation | undefined {
  const address = findDefaultAddress(addressList)
  return address ? coordinatesOf(address) : undefined
}

/** Coordinates of any saved address that has them — a fallback when none is default. */
export function anyAddressCoordinates(addressList: unknown): ResolvedLocation | undefined {
  for (const obj of walkObjects(addressList)) {
    if (idOf(obj) === undefined) continue
    const coords = coordinatesOf(obj)
    if (coords) return coords
  }
  return undefined
}

/** The entry flagged as the account's default, if any is. */
function findDefaultAddress(result: unknown): Record<string, unknown> | undefined {
  for (const obj of walkObjects(result)) {
    if (idOf(obj) === undefined || !coordinatesOf(obj)) continue
    if (DEFAULT_FIELDS.some((field) => obj[field] === true)) return obj
  }
  return undefined
}

const LABEL_FIELDS = ['printable_address', 'street_address', 'label', 'name', 'address']

interface KnownAddress {
  id: string
  address?: string
  label?: string
  default?: true
}

/** The usable addresses in the payload, so a wrong id can be corrected without a second call. */
function collectAddresses(result: unknown): KnownAddress[] {
  const found = new Map<string, KnownAddress>()
  for (const obj of walkObjects(result)) {
    // Only objects that also carry coordinates; ids on unrelated nested objects
    // would be noise in the error.
    const id = idOf(obj)
    if (id === undefined || found.has(id) || !coordinatesOf(obj)) continue

    const printable = LABEL_FIELDS.map((f) => obj[f]).find((v) => typeof v === 'string' && v.trim() !== '')
    // Reported separately from the printable address because it is itself a
    // valid value for address_id now.
    const label = LABEL_ONLY_FIELDS.map((f) => obj[f]).find((v) => typeof v === 'string' && v.trim() !== '')
    found.set(id, {
      id,
      ...(typeof printable === 'string' ? { address: printable } : {}),
      ...(typeof label === 'string' ? { label } : {}),
      ...(DEFAULT_FIELDS.some((field) => obj[field] === true) ? { default: true as const } : {}),
    })
  }
  return [...found.values()]
}

function pickNumber(obj: Record<string, unknown>, fields: string[]): number | undefined {
  for (const field of fields) {
    const value = obj[field]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    // Some payloads carry coordinates as strings; a blank string coerces to 0,
    // which would silently mean "off the coast of Africa".
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

/** Coordinates on the object itself, or on a nested one such as `location`. */
function coordinatesOf(obj: Record<string, unknown>): ResolvedLocation | undefined {
  const latitude = pickNumber(obj, LAT_FIELDS)
  const longitude = pickNumber(obj, LNG_FIELDS)
  if (latitude !== undefined && longitude !== undefined) return { latitude, longitude }

  for (const value of Object.values(obj)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const nested = coordinatesOf(value as Record<string, unknown>)
      if (nested) return nested
    }
  }
  return undefined
}
