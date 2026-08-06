/**
 * Silent renewal.
 *
 * DoorDash rotates refresh tokens on every use and rejects the previous one
 * immediately (measured — see scripts/inspect-token.ts), so the invariant these
 * tests defend is: **one refresh token is spent exactly once**. The mock
 * enforces the same rule, so a broken chain shows up here as a 401 rather than
 * quietly working in tests and failing in production.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { bearer, login, makeHarness, type Harness } from './helpers.ts'
import { SessionStore } from '../src/session/store.ts'

let h: Harness
beforeEach(() => {
  h = makeHarness()
})
afterEach(() => {
  h.stop()
})

/**
 * Issues tokens that are already inside the default 300s refresh skew, so any
 * request must renew. Deliberately a small positive number: `expires_in: 0` is
 * treated as "field absent" and falls back to the assumed TTL, which would make
 * these tests silently pass without ever refreshing.
 */
function expiringSetup(harness: Harness): Harness {
  harness.mock.setAccessTokenTtl(5)
  return harness
}

describe('silent renewal', () => {
  test('renews when the access token is past expiry, transparently', async () => {
    const { sessionToken } = await login(expiringSetup(h))

    const res = await h.request('/v1/addresses', { headers: bearer(sessionToken) })
    expect(res.status).toBe(200)
    expect(h.mock.refreshAttempts()).toBe(1)
  })

  test('the client credential is unchanged by a renewal', async () => {
    const { sessionToken } = await login(expiringSetup(h))

    const first = await h.request('/v1/auth/session', { headers: bearer(sessionToken) })
    expect(((await first.json()) as { refreshed_this_request: boolean }).refreshed_this_request).toBe(true)

    // Same credential, still works — the whole point of keying the row with a
    // per-session key that never rotates.
    const second = await h.request('/v1/addresses', { headers: bearer(sessionToken) })
    expect(second.status).toBe(200)
  })

  test('the renewed access token is the one sent upstream', async () => {
    const { sessionToken } = await login(expiringSetup(h))
    const beforeRefresh = h.mock.accessToken

    await h.request('/v1/addresses', { headers: bearer(sessionToken) })

    expect(h.mock.accessToken).not.toBe(beforeRefresh)
    expect(h.mock.calls[0]!.authorization).toBe(`Bearer ${h.mock.accessToken}`)
  })

  test('renews early, within the skew window, before anything breaks', async () => {
    const early = makeHarness({ SESSION_REFRESH_SKEW_SECONDS: '600' })
    try {
      early.mock.setAccessTokenTtl(300) // inside the 600s skew window
      const { sessionToken } = await login(early)

      const res = await early.request('/v1/addresses', { headers: bearer(sessionToken) })
      expect(res.status).toBe(200)
      expect(early.mock.refreshAttempts()).toBe(1)
    } finally {
      early.stop()
    }
  })

  test('does not renew while the token is comfortably valid', async () => {
    const { sessionToken } = await login(h)
    await h.request('/v1/addresses', { headers: bearer(sessionToken) })
    await h.request('/v1/addresses', { headers: bearer(sessionToken) })
    expect(h.mock.refreshAttempts()).toBe(0)
  })

  test('renews repeatedly, chaining rotated tokens across many requests', async () => {
    const { sessionToken } = await login(expiringSetup(h))

    // Each call finds an already-expired token and must spend the token the
    // previous call stored. A break anywhere in the chain surfaces as a 401.
    for (let i = 1; i <= 5; i++) {
      const res = await h.request('/v1/addresses', { headers: bearer(sessionToken) })
      expect(res.status).toBe(200)
      expect(h.mock.refreshAttempts()).toBe(i)
    }
  })
})

describe('the rotation race', () => {
  /**
   * Log in with a stale token, then make renewals produce healthy ones — so a
   * single refresh is enough to satisfy everybody and any extra call is a
   * genuine double-spend rather than an artefact of the token still being stale.
   */
  async function staleSessionThenHealthyRenewals() {
    const { sessionToken } = await login(expiringSetup(h))
    h.mock.setAccessTokenTtl(259_200)
    return sessionToken
  }

  test('concurrent requests trigger exactly one refresh', async () => {
    const sessionToken = await staleSessionThenHealthyRenewals()

    // Without coalescing, all ten would spend the same refresh token and nine
    // would get a 401 from DoorDash — the failure this design exists to avoid.
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => h.request('/v1/addresses', { headers: bearer(sessionToken) })),
    )

    expect(responses.map((r) => r.status)).toEqual(Array(10).fill(200))
    expect(h.mock.refreshAttempts()).toBe(1)
  })

  test('later requests reuse the renewed token instead of refreshing again', async () => {
    const sessionToken = await staleSessionThenHealthyRenewals()

    expect((await h.request('/v1/addresses', { headers: bearer(sessionToken) })).status).toBe(200)
    expect(h.mock.refreshAttempts()).toBe(1)

    for (let i = 0; i < 5; i++) {
      expect((await h.request('/v1/addresses', { headers: bearer(sessionToken) })).status).toBe(200)
    }
    expect(h.mock.refreshAttempts()).toBe(1)
  })
})

describe('when renewal fails', () => {
  test('a refused refresh ends the session with a re-login pointer', async () => {
    const { sessionToken } = await login(expiringSetup(h))
    h.mock.setRefreshFailure({ status: 401, body: { error: 'invalid_grant' } })

    const res = await h.request('/v1/addresses', { headers: bearer(sessionToken) })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string; login_start: string }
    expect(body.error).toBe('session_expired')
    expect(body.login_start).toBe('/v1/auth/login/start')
  })

  test('the dead session is dropped rather than retried forever', async () => {
    const { sessionToken } = await login(expiringSetup(h))
    h.mock.setRefreshFailure({ status: 401, body: { error: 'invalid_grant' } })

    await h.request('/v1/addresses', { headers: bearer(sessionToken) })
    const attemptsAfterFirst = h.mock.refreshAttempts()

    // The row is gone, so this fails at lookup without touching DoorDash again.
    const second = await h.request('/v1/addresses', { headers: bearer(sessionToken) })
    expect(second.status).toBe(401)
    expect(((await second.json()) as { error: string }).error).toBe('session_invalid')
    expect(h.mock.refreshAttempts()).toBe(attemptsAfterFirst)
  })
})

describe('session store', () => {
  test('the database alone decrypts to nothing', () => {
    const store = new SessionStore(':memory:')
    const { credential } = store.create(
      { at: 'SECRET-ACCESS', rt: 'SECRET-REFRESH', tt: 'Bearer' },
      Math.floor(Date.now() / 1000) + 3600,
      Math.floor(Date.now() / 1000) + 86_400,
    )

    // The key lives only in the credential, never in the row.
    const loaded = store.load(credential)
    expect(loaded.ok).toBe(true)
    if (loaded.ok) expect(loaded.record.rt).toBe('SECRET-REFRESH')

    // Same id, wrong key → authentication failure, not silent garbage.
    const parts = Buffer.from(credential.slice(5), 'base64url')
    parts.writeUInt8(parts.readUInt8(parts.length - 1) ^ 0xff, parts.length - 1)
    const tampered = store.load(`dds2.${parts.toString('base64url')}`)
    expect(tampered).toEqual({ ok: false, reason: 'bad_key' })

    store.close()
  })

  test('rejects malformed credentials without throwing', () => {
    const store = new SessionStore(':memory:')
    for (const bad of ['', 'dds2', 'dds2.', 'nope', 'dds2.aGk', 'dds1.abc']) {
      expect(store.load(bad).ok).toBe(false)
    }
    store.close()
  })

  test('sweeps expired and idle sessions', () => {
    const store = new SessionStore(':memory:')
    const now = Math.floor(Date.now() / 1000)

    store.create({ at: 'a', rt: 'r', tt: 'Bearer' }, now + 3600, now - 1) // already past its deadline
    store.create({ at: 'b', rt: 'r', tt: 'Bearer' }, now + 3600, now + 86_400) // healthy
    expect(store.count()).toBe(2)

    expect(store.sweep(86_400)).toBe(1)
    expect(store.count()).toBe(1)

    store.close()
  })

  test('renewal rewrites the row without changing the credential', () => {
    const store = new SessionStore(':memory:')
    const now = Math.floor(Date.now() / 1000)
    const { credential, id } = store.create({ at: 'old', rt: 'r1', tt: 'Bearer' }, now + 60, now + 86_400)

    const first = store.load(credential)
    expect(first.ok).toBe(true)
    if (!first.ok) return

    store.updateTokens(id, first.key, { at: 'new', rt: 'r2', tt: 'Bearer' }, now + 3600)

    const second = store.load(credential)
    expect(second.ok).toBe(true)
    if (second.ok) {
      expect(second.record.at).toBe('new')
      expect(second.record.rt).toBe('r2')
      expect(second.record.accessExpiresAt).toBe(now + 3600)
    }

    store.close()
  })
})
