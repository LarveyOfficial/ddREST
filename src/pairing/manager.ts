/**
 * Device-flow lifecycle (RFC 8628, adapted).
 *
 * The adaptation matters, so it is stated plainly: DoorDash Identity does **not**
 * implement RFC 8628, and this is not a device grant against DoorDash. It is a
 * device grant against *ddREST*, layered on top of the existing paste-back
 * login. The headless device never sees DoorDash at all — a human does the
 * ordinary browser login on a real computer, and the session that produces is
 * handed to the waiting device.
 *
 *   device                          human's browser
 *   ------                          ---------------
 *   POST /v1/auth/pair/request
 *     -> user_code + device_code
 *   shows user_code on screen
 *   polls /v1/auth/pair/token  ...  GET  /v1/auth/pair        (types the code)
 *                                   POST /v1/auth/pair/verify (gets authorize_url)
 *                                   ... signs in at DoorDash, lands on a dead
 *                                       loopback URL, copies it ...
 *                              ...  POST /v1/auth/pair/complete (pastes it back)
 *     <- session_token
 *
 * RFC 8628 §5.1 and §5.2 are the two attacks worth naming:
 *
 *   Guessing a user code. Defended by entropy first (20^8, see codes.ts) and by
 *   a throttle on failed lookups second. The throttle is deliberately loose,
 *   because a tight global one would let an attacker lock out the legitimate
 *   user; entropy is doing the real work here.
 *
 *   Phishing a user into approving the *attacker's* code. Nothing server-side
 *   can fully prevent this — it is the flow's inherent weakness — so the
 *   approval page states in plain words what is about to happen and offers a
 *   Deny button that is as prominent as approving.
 */

import type { Config } from '../config.ts'
import { ApiError } from '../errors.ts'
import type { AuthSealers } from '../auth/tokens.ts'
import { generateUserCode, normalizeUserCode } from './codes.ts'
import { PairingStore, type PairingRecord } from './store.ts'

const now = () => Math.floor(Date.now() / 1000)

/** RFC 8628 §3.5: each `slow_down` tells the device to add five seconds. */
const SLOW_DOWN_INCREMENT = 5

/** Failed user-code lookups tolerated per window before the endpoint starts refusing. */
const LOOKUP_FAILURE_LIMIT = 30
const LOOKUP_FAILURE_WINDOW_SECONDS = 60

export interface PairingRequest {
  deviceCode: string
  userCode: string
  expiresAt: number
  interval: number
}

/** What the device's poll resolved to. Everything else throws an ApiError. */
export interface PairingClaim {
  credential: string
}

export class PairingManager {
  #cfg: Config
  #store: PairingStore
  #sealers: AuthSealers
  #failures: number[] = []
  #sweepTimer?: ReturnType<typeof setInterval>

  constructor(cfg: Config, sealers: AuthSealers, store = new PairingStore(cfg.pairingDbPath)) {
    this.#cfg = cfg
    this.#sealers = sealers
    this.#store = store
  }

  get store(): PairingStore {
    return this.#store
  }

  /** Step 1, called by the headless device. */
  request(deviceLabel?: string): PairingRequest {
    this.#assertEnabled()

    // Unauthenticated row creation, so it needs a ceiling. Sweep first: without
    // it a burst of abandoned pairings would keep the cap tripped for a full TTL
    // after the burst ended.
    this.#store.sweep()
    if (this.#store.countPending() >= this.#cfg.pairingMaxPending) {
      throw new ApiError(
        429,
        'too_many_requests',
        `Too many pairings are already waiting for approval (limit ${this.#cfg.pairingMaxPending}). ` +
          'Approve or abandon one and try again; abandoned ones clear on their own when they expire.',
        // Surfaces as Retry-After. The queue drains as pairings expire, so the
        // poll interval is the useful cadence rather than a fixed penalty.
        { retry_after_seconds: this.#cfg.pairingPollIntervalSeconds },
      )
    }

    const expiresAt = now() + this.#cfg.pairingCodeTtlSeconds
    const interval = this.#cfg.pairingPollIntervalSeconds
    const label = normalizeLabel(deviceLabel)

    // User codes are unique, so a collision is possible in principle. At this
    // keyspace it is a curiosity rather than a risk, but an insert failing under
    // a user is not acceptable either.
    for (let attempt = 0; attempt < 5; attempt++) {
      const userCode = generateUserCode()
      try {
        const { deviceCode } = this.#store.create({
          userCode: userCode.replace(/-/g, ''),
          deviceLabel: label,
          expiresAt,
          interval,
        })
        return { deviceCode, userCode, expiresAt, interval }
      } catch (err) {
        if (!isUniqueViolation(err)) throw err
      }
    }
    throw new ApiError(500, 'internal_error', 'Could not allocate a unique pairing code.')
  }

  /**
   * Step 2, called by the browser: turn a typed user code into the pairing it
   * refers to. Throws unless it is pending and still alive.
   */
  lookup(rawUserCode: string): PairingRecord {
    this.#assertEnabled()

    const normalized = normalizeUserCode(rawUserCode)
    if (!normalized) {
      // Not a countable failure: this is a typo, not a guess. Telling the two
      // apart keeps fat-fingering from consuming the brute-force budget.
      throw new ApiError(
        400,
        'invalid_request',
        'That does not look like a pairing code. They are eight letters, like BCDF-GHJK.',
      )
    }

    this.#assertLookupsAllowed()
    const record = this.#store.findByUserCode(normalized)

    if (!record) {
      this.#recordFailure()
      throw new ApiError(404, 'pairing_not_found', 'No device is waiting with that code. Check it and try again.')
    }
    if (record.expiresAt <= now()) {
      this.#store.delete(record.id)
      throw new ApiError(
        410,
        'pairing_expired',
        'That pairing code expired. Ask the device for a new one.',
      )
    }
    if (record.status !== 'pending') {
      throw new ApiError(
        409,
        'pairing_conflict',
        `That code was already ${record.status}. Ask the device for a new one.`,
      )
    }
    return record
  }

  /** Step 3: attach a freshly-minted session to the waiting pairing. */
  approve(id: string, credential: string): void {
    const record = this.#store.findById(id)
    if (!record) {
      throw new ApiError(404, 'pairing_not_found', 'That pairing no longer exists — it expired or was cancelled.')
    }
    if (record.expiresAt <= now()) {
      this.#store.delete(id)
      throw new ApiError(410, 'pairing_expired', 'That pairing expired before it could be approved.')
    }

    // Sealed to the pairing's own deadline, so an un-collected grant becomes
    // undecryptable at exactly the moment the device is told it has expired.
    const grant = this.#sealers.pairingGrant.sealUntil({ c: credential }, record.expiresAt)

    if (!this.#store.approve(id, grant)) {
      throw new ApiError(409, 'pairing_conflict', 'That pairing was already approved or denied.')
    }
  }

  deny(id: string): void {
    this.#store.deny(id)
  }

  /**
   * The device's poll. Success is the only path that returns; every other
   * outcome is an ApiError carrying the RFC 8628 error code.
   */
  claim(deviceCode: string): PairingClaim {
    this.#assertEnabled()

    const loaded = this.#store.loadByDeviceCode(deviceCode)
    if (!loaded.ok) {
      // 'unknown' is also what a *collected* pairing looks like, since the row
      // is deleted on collection. Both mean the same thing to the device.
      throw new ApiError(400, 'invalid_grant', 'This device code is not valid. Start a new pairing.', {
        error_description: 'This device code is not valid. Start a new pairing.',
      })
    }

    const record = loaded.record
    const timestamp = now()

    if (record.expiresAt <= timestamp) {
      this.#store.delete(record.id)
      throw rfcError('expired_token', 'The pairing code expired before it was approved. Start a new pairing.')
    }

    if (record.status === 'denied') {
      this.#store.delete(record.id)
      throw rfcError('access_denied', 'The pairing was denied.')
    }

    if (record.status === 'pending') {
      // Checked before recording the poll, so a device that ignores `interval`
      // cannot keep resetting its own clock.
      if (record.lastPolledAt > 0 && timestamp - record.lastPolledAt < record.interval) {
        const interval = record.interval + SLOW_DOWN_INCREMENT
        this.#store.recordPoll(record.id, interval)
        throw rfcError('slow_down', `Polling too fast. Wait at least ${interval} seconds between polls.`, {
          interval,
        })
      }
      this.#store.recordPoll(record.id, record.interval)
      throw rfcError('authorization_pending', 'Nobody has approved this pairing yet.', {
        interval: record.interval,
      })
    }

    const opened = this.#sealers.pairingGrant.unseal(record.grant ?? '')
    this.#store.delete(record.id)
    if (!opened.ok) {
      // Only reachable if the grant outlived its seal or the keys rotated
      // underneath it. Either way the device must start over.
      throw rfcError('expired_token', 'The approved session could no longer be read. Start a new pairing.')
    }

    return { credential: opened.payload.c }
  }

  startSweeper(): void {
    if (this.#sweepTimer) return
    // Pairings live minutes, not weeks, so they cannot wait for the hourly
    // session sweep.
    const every = Math.max(60, Math.min(this.#cfg.sessionSweepIntervalSeconds, this.#cfg.pairingCodeTtlSeconds))
    this.#sweepTimer = setInterval(() => {
      try {
        this.#store.sweep()
      } catch (err) {
        console.error('Pairing sweep failed:', err)
      }
    }, every * 1000)
    this.#sweepTimer.unref?.()
  }

  close(): void {
    if (this.#sweepTimer) clearInterval(this.#sweepTimer)
    this.#store.close()
  }

  #assertEnabled(): void {
    if (!this.#cfg.pairingEnabled) {
      throw new ApiError(
        403,
        'pairing_disabled',
        'Device pairing is turned off on this server. Set PAIRING_ENABLED=true to enable it.',
      )
    }
  }

  #assertLookupsAllowed(): void {
    const cutoff = now() - LOOKUP_FAILURE_WINDOW_SECONDS
    this.#failures = this.#failures.filter((t) => t > cutoff)
    if (this.#failures.length >= LOOKUP_FAILURE_LIMIT) {
      throw new ApiError(
        429,
        'too_many_requests',
        'Too many incorrect pairing codes were submitted. Wait a minute and try again.',
        // The failure window is what actually has to elapse, so say so.
        { retry_after_seconds: LOOKUP_FAILURE_WINDOW_SECONDS },
      )
    }
  }

  #recordFailure(): void {
    this.#failures.push(now())
  }
}

/**
 * RFC 8628 §3.5 error responses. The RFC's field is `error_description`; this
 * API's is `message`. Both are emitted so a stock OAuth device client and a
 * ddREST client each find what they expect.
 */
function rfcError(
  code: 'authorization_pending' | 'slow_down' | 'access_denied' | 'expired_token',
  message: string,
  extra: Record<string, unknown> = {},
): ApiError {
  return new ApiError(400, code, message, { error_description: message, ...extra })
}

/** Device-supplied, shown to a human. Trimmed, capped, and stripped of control characters. */
function normalizeLabel(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 64)
  return cleaned || undefined
}

function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes('UNIQUE constraint failed')
}
