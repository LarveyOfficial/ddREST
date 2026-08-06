/**
 * Authenticated sealing of small JSON payloads under the server's own keys.
 *
 * Used for login tickets: rather than keeping a table of pending logins, the
 * PKCE verifier and expected `state` are encrypted under a server key and
 * handed to the client, which presents them back at /login/complete.
 *
 * Wire format:  <prefix>.<base64url( iv[12] || tag[16] || ciphertext )>
 *
 * Two properties matter:
 *   - The `prefix` is bound in as GCM additional authenticated data, so one kind
 *     of sealed value can never be replayed as another even though both are
 *     sealed under the same key.
 *   - Decryption is trialled across every configured key, newest first, while
 *     sealing always uses key 0. That gives zero-downtime key rotation: prepend
 *     the new key, redeploy, drop the old one once outstanding values age out.
 *
 * Sessions do NOT use this — see src/session/store.ts. They are encrypted under
 * a per-session key held by the client, because DoorDash rotates refresh tokens
 * and a client-held session cannot be updated durably.
 */

import { randomBytes } from 'node:crypto'
import { decryptBlob, encryptBlob, IV_LENGTH, TAG_LENGTH } from './aead.ts'

export interface SealedPayload {
  /** Expiry, epoch seconds. Checked on unseal. */
  exp: number
}

export type UnsealFailure =
  | 'malformed' /** not our format, or not decodable */
  | 'bad_key' /** no configured key authenticates it — forged, tampered, or sealed under a retired key */
  | 'expired'

export type UnsealResult<T> = { ok: true; payload: T } | { ok: false; reason: UnsealFailure }

export interface Sealer<T extends SealedPayload> {
  readonly prefix: string
  /** Seals `payload`, stamping `exp` at `ttlSeconds` from now. */
  seal(payload: Omit<T, 'exp'>, ttlSeconds: number): string
  /** Seals with an explicit absolute expiry (epoch seconds). */
  sealUntil(payload: Omit<T, 'exp'>, expEpochSeconds: number): string
  unseal(token: string): UnsealResult<T>
}

const nowSeconds = () => Math.floor(Date.now() / 1000)

export function createSealer<T extends SealedPayload>(keys: readonly Buffer[], prefix: string): Sealer<T> {
  if (keys.length === 0) throw new Error('createSealer requires at least one key')
  const activeKey = keys[0]!

  function sealUntil(payload: Omit<T, 'exp'>, exp: number): string {
    const plaintext = Buffer.from(JSON.stringify({ ...payload, exp }), 'utf8')
    return `${prefix}.${encryptBlob(activeKey, prefix, plaintext).toString('base64url')}`
  }

  return {
    prefix,

    seal(payload, ttlSeconds) {
      return sealUntil(payload, nowSeconds() + ttlSeconds)
    },

    sealUntil,

    unseal(token) {
      if (typeof token !== 'string') return { ok: false, reason: 'malformed' }
      if (!token.startsWith(`${prefix}.`)) return { ok: false, reason: 'malformed' }

      const encoded = token.slice(prefix.length + 1)
      if (encoded.length === 0) return { ok: false, reason: 'malformed' }

      let body: Buffer
      try {
        body = Buffer.from(encoded, 'base64url')
      } catch {
        return { ok: false, reason: 'malformed' }
      }
      if (body.length <= IV_LENGTH + TAG_LENGTH) return { ok: false, reason: 'malformed' }

      for (const key of keys) {
        const plaintext = decryptBlob(key, prefix, body)
        if (!plaintext) continue // wrong key (or tampered payload) — try the next

        let parsed: unknown
        try {
          parsed = JSON.parse(plaintext.toString('utf8'))
        } catch {
          // Authenticated but not JSON: only reachable if a key was reused for
          // some other purpose under the same prefix.
          return { ok: false, reason: 'malformed' }
        }

        if (typeof parsed !== 'object' || parsed === null) return { ok: false, reason: 'malformed' }
        const payload = parsed as T
        if (typeof payload.exp !== 'number') return { ok: false, reason: 'malformed' }
        if (payload.exp <= nowSeconds()) return { ok: false, reason: 'expired' }

        return { ok: true, payload }
      }

      return { ok: false, reason: 'bad_key' }
    },
  }
}

/** 32 random bytes, base64 — the format SESSION_KEYS expects. */
export function generateSessionKey(): string {
  return randomBytes(32).toString('base64')
}
