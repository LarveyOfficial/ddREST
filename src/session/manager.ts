/**
 * Session lifecycle: resolve a credential to a usable access token, renewing
 * silently when it is close to expiry.
 *
 * The single hard requirement is that **one refresh token is used exactly
 * once**. DoorDash rotates on use and rejects the previous value immediately,
 * so two concurrent refreshes would leave one caller holding a dead token and
 * break the chain for good.
 *
 * Concurrent requests are therefore coalesced: the first one to notice the
 * token is stale performs the refresh, and everyone else awaits that same
 * promise rather than starting their own. This is correct for a single process,
 * which is what SQLite implies — see the note on `refresh` below for what would
 * change with multiple instances.
 */

import type { Config } from '../config.ts'
import { ApiError, RELOGIN_HINT } from '../errors.ts'
import { refreshAccessToken, resolveTokenExpiry, type TokenResponse } from '../auth/oauth.ts'
import { SessionStore, type SessionRecord } from './store.ts'

const now = () => Math.floor(Date.now() / 1000)

export interface ResolvedSession {
  id: string
  accessToken: string
  tokenType: string
  scope?: string
  accessExpiresAt: number
  absoluteExpiresAt: number
  /** True when this request triggered (or waited on) a silent renewal. */
  refreshed: boolean
}

export class SessionManager {
  #cfg: Config
  #store: SessionStore
  #inflight = new Map<string, Promise<SessionRecord>>()
  #sweepTimer?: ReturnType<typeof setInterval>

  constructor(cfg: Config, store = new SessionStore(cfg.sessionDbPath)) {
    this.#cfg = cfg
    this.#store = store
  }

  get store(): SessionStore {
    return this.#store
  }

  create(token: TokenResponse): { credential: string; accessExpiresAt: number; absoluteExpiresAt: number } {
    if (!token.refresh_token) {
      // Not fatal — the session simply cannot outlive the access token. Worth
      // knowing about, because it means DoorDash changed something.
      console.warn('Token response carried no refresh_token; this session will not be renewable.')
    }

    const accessExpiresAt = resolveTokenExpiry(token, this.#cfg.assumedTokenTtlSeconds)
    const absoluteExpiresAt = now() + this.#cfg.sessionMaxAgeSeconds

    const { credential } = this.#store.create(
      {
        at: token.access_token,
        rt: token.refresh_token ?? '',
        tt: token.token_type ?? 'Bearer',
        sc: token.scope,
      },
      accessExpiresAt,
      absoluteExpiresAt,
    )

    return { credential, accessExpiresAt, absoluteExpiresAt }
  }

  async resolve(credential: string): Promise<ResolvedSession> {
    const loaded = this.#store.load(credential)
    if (!loaded.ok) throw loadFailure(loaded.reason)

    let record = loaded.record
    const timestamp = now()

    if (record.absoluteExpiresAt <= timestamp) {
      this.#store.delete(record.id)
      throw new ApiError(
        401,
        'session_expired',
        'This session reached its maximum lifetime. A new browser login is required.',
        RELOGIN_HINT,
      )
    }

    if (timestamp - record.lastUsedAt >= this.#cfg.sessionIdleTimeoutSeconds) {
      this.#store.delete(record.id)
      throw new ApiError(401, 'session_expired', 'This session was idle for too long and has been dropped.', RELOGIN_HINT)
    }

    let refreshed = false
    if (record.accessExpiresAt - timestamp <= this.#cfg.sessionRefreshSkewSeconds) {
      record = await this.#refresh(record, loaded.key)
      refreshed = true
    } else {
      this.#store.touch(record.id)
    }

    return {
      id: record.id,
      accessToken: record.at,
      tokenType: record.tt,
      scope: record.sc,
      accessExpiresAt: record.accessExpiresAt,
      absoluteExpiresAt: record.absoluteExpiresAt,
      refreshed,
    }
  }

  /**
   * Renew, coalescing concurrent callers onto one upstream exchange.
   *
   * Correct for a single process. Running several instances against the same
   * SQLite file would reintroduce the race across processes and needs a shared
   * lock (Redis, or a claim column with a short TTL) instead.
   */
  #refresh(record: SessionRecord, key: Buffer): Promise<SessionRecord> {
    const existing = this.#inflight.get(record.id)
    if (existing) return existing

    const pending = this.#doRefresh(record, key).finally(() => {
      this.#inflight.delete(record.id)
    })
    this.#inflight.set(record.id, pending)
    return pending
  }

  async #doRefresh(record: SessionRecord, key: Buffer): Promise<SessionRecord> {
    if (!record.rt) {
      this.#store.delete(record.id)
      throw new ApiError(
        401,
        'session_expired',
        'The access token expired and this session has no refresh token. A new browser login is required.',
        RELOGIN_HINT,
      )
    }

    let token: TokenResponse
    try {
      token = await refreshAccessToken(this.#cfg, record.rt)
    } catch (err) {
      // A refused refresh is terminal: the token we hold is spent either way,
      // so keeping the row would only produce the same failure on every request.
      if (err instanceof ApiError && err.status === 401) this.#store.delete(record.id)
      throw err
    }

    const accessExpiresAt = resolveTokenExpiry(token, this.#cfg.assumedTokenTtlSeconds)
    const fields = {
      at: token.access_token,
      // DoorDash always rotates, but fall back to the old value rather than
      // blanking the chain if a response ever omits it.
      rt: token.refresh_token ?? record.rt,
      tt: token.token_type ?? record.tt,
      sc: token.scope ?? record.sc,
    }

    this.#store.updateTokens(record.id, key, fields, accessExpiresAt)

    return { ...record, ...fields, accessExpiresAt, lastUsedAt: now() }
  }

  /** True if a session existed and was removed. */
  revoke(credential: string): boolean {
    const parsed = this.#store.load(credential)
    return parsed.ok ? this.#store.delete(parsed.record.id) : false
  }

  startSweeper(): void {
    if (this.#sweepTimer) return
    this.#sweepTimer = setInterval(() => {
      try {
        this.#store.sweep(this.#cfg.sessionIdleTimeoutSeconds)
      } catch (err) {
        console.error('Session sweep failed:', err)
      }
    }, this.#cfg.sessionSweepIntervalSeconds * 1000)
    this.#sweepTimer.unref?.()
  }

  close(): void {
    if (this.#sweepTimer) clearInterval(this.#sweepTimer)
    this.#store.close()
  }
}

function loadFailure(reason: 'malformed' | 'unknown' | 'bad_key'): ApiError {
  if (reason === 'unknown') {
    return new ApiError(
      401,
      'session_invalid',
      'This session is not recognised. It was revoked, expired, or belongs to a different server.',
      RELOGIN_HINT,
    )
  }
  if (reason === 'bad_key') {
    return new ApiError(401, 'session_invalid', 'Session credential failed authentication.', RELOGIN_HINT)
  }
  return new ApiError(401, 'session_invalid', 'Session credential is malformed.', RELOGIN_HINT)
}
