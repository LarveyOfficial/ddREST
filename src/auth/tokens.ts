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

/** Pending device-flow approval, held by the *browser* between /pair/verify and /pair/complete. */
export const PAIRING_TICKET_PREFIX = 'ddpa'

/** An approved session credential waiting in the pairings table for its device to collect it. */
export const PAIRING_GRANT_PREFIX = 'ddpg'

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

/**
 * A pending login that is *also* bound to a pairing.
 *
 * Same three OAuth fields as a login ticket, plus the pairing it will hand the
 * resulting session to. Sealed under a distinct prefix so a plain login ticket
 * can never be replayed at /pair/complete to attach an unrelated session to a
 * waiting device, nor the reverse.
 */
export interface PairingTicketPayload extends SealedPayload {
  /** PKCE code_verifier */
  v: string
  /** CSRF state we expect back in the callback URL */
  s: string
  /** redirect_uri used at /authorize; must be replayed identically at token exchange */
  r: string
  /** pairing row id */
  p: string
  /** user code, echoed so the confirmation page can show what is being approved */
  u: string
}

/** An approved session credential, sealed at rest until its device collects it. */
export interface PairingGrantPayload extends SealedPayload {
  /** the session credential */
  c: string
}

export interface AuthSealers {
  loginTicket: Sealer<LoginTicketPayload>
  pairingTicket: Sealer<PairingTicketPayload>
  pairingGrant: Sealer<PairingGrantPayload>
}

export function createAuthSealers(cfg: Config): AuthSealers {
  return {
    loginTicket: createSealer<LoginTicketPayload>(cfg.sessionKeys, LOGIN_TICKET_PREFIX),
    pairingTicket: createSealer<PairingTicketPayload>(cfg.sessionKeys, PAIRING_TICKET_PREFIX),
    pairingGrant: createSealer<PairingGrantPayload>(cfg.sessionKeys, PAIRING_GRANT_PREFIX),
  }
}
