/**
 * Turning "that didn't work" into "here is what would".
 *
 * The nicest thing about the `address_not_found` error is that it lists the
 * addresses that do exist, so a wrong id can be corrected without a second
 * round trip and without reading the docs. That only ever applied to ids this
 * API resolved itself; an id DoorDash rejected got a bare upstream error.
 *
 * This closes that gap. When a cart- or store-scoped request fails in a way
 * consistent with a bad id, the same kind of orientation is appended before the
 * error goes out. Everything here is decoration: the status and the message are
 * untouched, nothing is retried, and a failure to gather the hint leaves the
 * original error exactly as it was.
 *
 * It hooks into `onError` rather than sitting in middleware because Hono's
 * compose catches a thrown error at the dispatch frame that raised it and hands
 * it straight to `onError` — an enclosing middleware's `await next()` resolves
 * normally and never sees it. `onError` is the only real error boundary.
 */

import type { Context } from 'hono'
import { ApiError } from '../errors.ts'
import type { AppEnv } from '../types.ts'
import { knownCarts } from './resolve.ts'

/**
 * Statuses worth annotating.
 *
 * A 502 is how an upstream rejection surfaces once `success: false` is mapped,
 * and a 400 is our own validation. Anything else — 401, 403, 429 — has nothing
 * to do with the id being wrong, and listing carts under an auth failure would
 * be noise at best and a second failing call at worst.
 */
const HINTABLE = new Set([400, 502])

const CART_PATH = /^\/v1\/carts\/([^/]+)/
const STORE_PATH = /^\/v1\/stores\/([^/]+)/

const STORE_HINT = {
  search: '/v1/restaurants',
  store_id_hint: 'Store ids come from GET /v1/restaurants or /v1/nearby-stores, or pass `name:<store name>`.',
} as const

/** The error to actually send, with orientation added where it helps. */
export async function withNotFoundHints(c: Context<AppEnv>, err: ApiError): Promise<ApiError> {
  if (!HINTABLE.has(err.status)) return err
  // A session is needed to look anything up, and its absence is already the
  // more useful error.
  if (!c.get('accessToken')) return err

  // An error that already carries the listing came from a resolver that had it
  // to hand; fetching it again would be a second call for the same answer.
  if (CART_PATH.test(c.req.path) && !('known_carts' in err.extra)) {
    return err.with({ carts: '/v1/carts', known_carts: await knownCarts(c) })
  }

  if (STORE_PATH.test(c.req.path) && !('search' in err.extra)) {
    return err.with(STORE_HINT)
  }

  return err
}
