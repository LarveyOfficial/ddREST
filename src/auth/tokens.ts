/**
 * The sealed login ticket: a pending login, held by the client between
 * /login/start and /login/complete so no server-side table of in-flight logins
 * is needed. Short-lived and single-purpose.
 *
 * Sessions are *not* sealed this way — see src/session/store.ts. They need
 * durable server-side updates because DoorDash rotates refresh tokens.
 */

import type { Config } from '../config.ts'
import { createSealer, type SealedPayload, type Sealer } from '../crypto/seal.ts'

export const LOGIN_TICKET_PREFIX = 'ddl1'

/** Retired client-held session format, still recognised to give a clear error. */
export const LEGACY_SESSION_PREFIX = 'dds1'

/** Pending login. Held by the client between /login/start and /login/complete. */
export interface LoginTicketPayload extends SealedPayload {
  /** PKCE code_verifier */
  v: string
  /** CSRF state we expect back in the callback URL */
  s: string
  /** redirect_uri used at /authorize; must be replayed identically at token exchange */
  r: string
}

export interface AuthSealers {
  loginTicket: Sealer<LoginTicketPayload>
}

export function createAuthSealers(cfg: Config): AuthSealers {
  return {
    loginTicket: createSealer<LoginTicketPayload>(cfg.sessionKeys, LOGIN_TICKET_PREFIX),
  }
}
