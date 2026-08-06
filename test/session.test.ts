import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { bearer, login, makeHarness, type Harness } from './helpers.ts'

let h: Harness
beforeEach(() => {
  h = makeHarness()
})
afterEach(() => {
  h.stop()
})

describe('session presentation', () => {
  test('accepts a bearer session token', async () => {
    const { sessionToken } = await login(h)
    const res = await h.request('/v1/addresses', { headers: bearer(sessionToken) })
    expect(res.status).toBe(200)
  })

  test('accepts a cookie session', async () => {
    const { cookie } = await login(h)
    const res = await h.request('/v1/addresses', { headers: { cookie } })
    expect(res.status).toBe(200)
  })

  test('reports session details without exposing the DoorDash token', async () => {
    const { sessionToken } = await login(h)
    const res = await h.request('/v1/auth/session', { headers: bearer(sessionToken) })
    expect(res.status).toBe(200)

    const body = await res.text()
    expect(body).not.toContain(h.mock.accessToken)
    const parsed = JSON.parse(body) as { authenticated: boolean; transport: string; scope: string }
    expect(parsed.authenticated).toBe(true)
    expect(parsed.transport).toBe('bearer')
    expect(parsed.scope).toBe('mcp:consumer:write consumer:addresses:read')
  })

  test('the bearer header wins when both are presented', async () => {
    const { sessionToken, cookie } = await login(h)
    const res = await h.request('/v1/auth/session', { headers: { ...bearer(sessionToken), cookie } })
    expect(((await res.json()) as { transport: string }).transport).toBe('bearer')
  })
})

describe('session rejection', () => {
  test('401s with no credential', async () => {
    const res = await h.request('/v1/addresses')
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string; login_start: string }
    expect(body.error).toBe('session_missing')
    expect(body.login_start).toBe('/v1/auth/login/start')
  })

  test('names the mistake when handed a raw DoorDash token', async () => {
    await login(h) // so the mock has actually issued an access token
    const res = await h.request('/v1/addresses', { headers: bearer(h.mock.accessToken) })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe('session_invalid')
    expect(body.message).toContain('raw DoorDash access token')
  })

  test('rejects a credential belonging to a different server instance', async () => {
    const other = makeHarness({ SESSION_KEYS: Buffer.alloc(32, 7).toString('base64') })
    try {
      const { sessionToken } = await login(other)
      const res = await h.request('/v1/addresses', { headers: bearer(sessionToken) })
      expect(res.status).toBe(401)
      expect(((await res.json()) as { error: string }).error).toBe('session_invalid')
    } finally {
      other.stop()
    }
  })

  test('401s once a session passes its absolute deadline', async () => {
    // Non-positive lifetimes are a config error, and the idle timeout must stay
    // below the cap, so the shortest usable pair is 2s/1s.
    const brief = makeHarness({ SESSION_MAX_AGE_SECONDS: '2', SESSION_IDLE_TIMEOUT_SECONDS: '1' })
    try {
      const { sessionToken } = await login(brief)
      await Bun.sleep(2_100)
      const res = await brief.request('/v1/addresses', { headers: bearer(sessionToken) })
      expect(res.status).toBe(401)
      const body = (await res.json()) as { error: string; message: string; login_start: string }
      expect(body.error).toBe('session_expired')
      expect(body.message).toContain('maximum lifetime')
      expect(body.login_start).toBe('/v1/auth/login/start')
    } finally {
      brief.stop()
    }
  })

  test('rejects a retired dds1 session with an explanation', async () => {
    const res = await h.request('/v1/addresses', { headers: bearer('dds1.abcdef') })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe('session_invalid')
    expect(body.message).toContain('predates auto-renewal')
  })

  test('rejects a credential whose session row is gone', async () => {
    const { sessionToken } = await login(h)
    await h.request('/v1/auth/logout', { method: 'POST', headers: bearer(sessionToken) })

    const res = await h.request('/v1/addresses', { headers: bearer(sessionToken) })
    expect(res.status).toBe(401)
    expect(((await res.json()) as { error: string }).error).toBe('session_invalid')
  })

  test('maps a DoorDash 401 to re-login rather than a 502', async () => {
    const { sessionToken } = await login(h)
    h.mock.setToolFailure({ status: 401, body: { error: 'The user is unauthorized.' } })

    const res = await h.request('/v1/addresses', { headers: bearer(sessionToken) })
    expect(res.status).toBe(401)
    expect(((await res.json()) as { error: string }).error).toBe('doordash_unauthorized')
  })

  test('flags the private-beta gating 403 specifically', async () => {
    const { sessionToken } = await login(h)
    h.mock.setToolFailure({ status: 403, body: { error: 'The user is forbidden.' } })

    const res = await h.request('/v1/addresses', { headers: bearer(sessionToken) })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string; private_beta_gating: boolean; message: string }
    expect(body.error).toBe('doordash_forbidden')
    expect(body.private_beta_gating).toBe(true)
    expect(body.message).toContain('private beta')
  })
})

describe('CSRF protection on cookie auth', () => {
  test('a cookie write with no Origin is refused', async () => {
    const { cookie } = await login(h)
    const res = await h.request('/v1/addresses/current', {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ address_id: 'addr-1' }),
    })
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: string }).error).toBe('csrf_origin_rejected')
  })

  test('a cookie write from an untrusted Origin is refused', async () => {
    const { cookie } = await login(h)
    const res = await h.request('/v1/addresses/current', {
      method: 'PUT',
      headers: { cookie, origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ address_id: 'addr-1' }),
    })
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: string }).error).toBe('csrf_origin_rejected')
  })

  test('a cookie write from the API’s own origin is allowed', async () => {
    const { cookie } = await login(h)
    const res = await h.request('/v1/addresses/current', {
      method: 'PUT',
      headers: { cookie, origin: 'http://api.test', 'content-type': 'application/json' },
      body: JSON.stringify({ address_id: 'addr-1' }),
    })
    expect(res.status).toBe(200)
  })

  test('a cookie write from a configured CORS origin is allowed', async () => {
    const withCors = makeHarness({ CORS_ORIGINS: 'https://app.example' })
    try {
      const { cookie } = await login(withCors)
      const res = await withCors.request('/v1/addresses/current', {
        method: 'PUT',
        headers: { cookie, origin: 'https://app.example', 'content-type': 'application/json' },
        body: JSON.stringify({ address_id: 'addr-1' }),
      })
      expect(res.status).toBe(200)
    } finally {
      withCors.stop()
    }
  })

  test('cookie reads need no Origin', async () => {
    const { cookie } = await login(h)
    expect((await h.request('/v1/addresses', { headers: { cookie } })).status).toBe(200)
  })

  test('bearer writes are exempt — no Origin required', async () => {
    const { sessionToken } = await login(h)
    const res = await h.request('/v1/addresses/current', {
      method: 'PUT',
      headers: { ...bearer(sessionToken), 'content-type': 'application/json' },
      body: JSON.stringify({ address_id: 'addr-1' }),
    })
    expect(res.status).toBe(200)
  })
})

describe('POST /v1/auth/logout', () => {
  test('expires the cookie even with no session presented', async () => {
    const res = await h.request('/v1/auth/logout', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie') ?? '').toContain(`${h.cfg.cookieName}=`)
    expect(((await res.json()) as { revoked: boolean }).revoked).toBe(false)
  })

  test('actually revokes the session server-side', async () => {
    const { sessionToken } = await login(h)
    expect((await h.request('/v1/addresses', { headers: bearer(sessionToken) })).status).toBe(200)

    const out = await h.request('/v1/auth/logout', { method: 'POST', headers: bearer(sessionToken) })
    expect(((await out.json()) as { revoked: boolean }).revoked).toBe(true)

    // The whole point of the store: a copied credential dies too.
    const after = await h.request('/v1/addresses', { headers: bearer(sessionToken) })
    expect(after.status).toBe(401)
  })
})
