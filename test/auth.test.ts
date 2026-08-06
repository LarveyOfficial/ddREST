import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { makeHarness, login, bearer, type Harness } from './helpers.ts'
import { generateSessionKey } from '../src/crypto/seal.ts'
import { parseCallbackUrl, resolveTokenExpiry } from '../src/auth/oauth.ts'

let h: Harness
beforeEach(() => {
  h = makeHarness()
})
afterEach(() => {
  h.stop()
})

async function startLogin() {
  const res = await h.request('/v1/auth/login/start', { method: 'POST' })
  return (await res.json()) as {
    authorize_url: string
    login_ticket: string
    redirect_uri: string
    expires_in: number
  }
}

async function callbackUrlFor(authorizeUrl: string): Promise<string> {
  const res = await fetch(authorizeUrl, { redirect: 'manual' })
  const location = res.headers.get('location')
  if (!location) throw new Error('no redirect from mock /authorize')
  return location
}

describe('POST /v1/auth/login/start', () => {
  test('returns a well-formed PKCE authorize URL', async () => {
    const start = await startLogin()
    const url = new URL(start.authorize_url)

    expect(url.pathname).toBe('/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('client_id')).toBe('1862661064320741379')
    expect(url.searchParams.get('scope')).toBe('mcp:consumer:write consumer:addresses:read')
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:4180/oauth2/callback')
    expect(url.searchParams.get('state')).toMatch(/^[0-9a-f]{32}$/)
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  test('the ticket carries the verifier, not the server', async () => {
    const start = await startLogin()
    expect(start.login_ticket.startsWith('ddl1.')).toBe(true)

    // The verifier must actually match the challenge that was published.
    const ticket = h.app.fetch // touch nothing; unseal via a fresh sealer below
    void ticket
    const { createAuthSealers } = await import('../src/auth/tokens.ts')
    const opened = createAuthSealers(h.cfg).loginTicket.unseal(start.login_ticket)
    expect(opened.ok).toBe(true)
    if (!opened.ok) return

    const expected = createHash('sha256').update(opened.payload.v, 'ascii').digest('base64url')
    expect(new URL(start.authorize_url).searchParams.get('code_challenge')).toBe(expected)
    expect(new URL(start.authorize_url).searchParams.get('state')).toBe(opened.payload.s)
  })

  test('two logins produce independent verifiers', async () => {
    const a = await startLogin()
    const b = await startLogin()
    expect(a.login_ticket).not.toBe(b.login_ticket)
    expect(new URL(a.authorize_url).searchParams.get('state')).not.toBe(
      new URL(b.authorize_url).searchParams.get('state'),
    )
  })
})

describe('POST /v1/auth/login/complete', () => {
  test('completes the paste-back flow and issues a session', async () => {
    const start = await startLogin()
    const callback = await callbackUrlFor(start.authorize_url)

    const res = await h.request('/v1/auth/login/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login_ticket: start.login_ticket, redirect_url: callback }),
    })
    expect(res.status).toBe(200)

    const body = (await res.json()) as Record<string, unknown>
    expect(body.session_token as string).toStartWith('dds2.')
    expect(body.cookie_set).toBe(true)
    expect(body.expires_in as number).toBeGreaterThan(0)

    // The DoorDash token must not leak into the response or the cookie.
    expect(JSON.stringify(body)).not.toContain(h.mock.accessToken)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain(`${h.cfg.cookieName}=dds2.`)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).not.toContain(h.mock.accessToken)
  })

  test('accepts code and state directly instead of a pasted URL', async () => {
    const start = await startLogin()
    const callback = new URL(await callbackUrlFor(start.authorize_url))

    const res = await h.request('/v1/auth/login/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        login_ticket: start.login_ticket,
        code: callback.searchParams.get('code'),
        state: callback.searchParams.get('state'),
      }),
    })
    expect(res.status).toBe(200)
  })

  test('set_cookie:false returns a token without setting a cookie', async () => {
    const start = await startLogin()
    const callback = await callbackUrlFor(start.authorize_url)

    const res = await h.request('/v1/auth/login/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login_ticket: start.login_ticket, redirect_url: callback, set_cookie: false }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(((await res.json()) as { cookie_set: boolean }).cookie_set).toBe(false)
  })

  test('rejects a state that does not match the ticket', async () => {
    const start = await startLogin()
    const callback = new URL(await callbackUrlFor(start.authorize_url))
    callback.searchParams.set('state', 'deadbeefdeadbeefdeadbeefdeadbeef')

    const res = await h.request('/v1/auth/login/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login_ticket: start.login_ticket, redirect_url: callback.toString() }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('state_mismatch')
  })

  test('rejects a ticket sealed by a different server key', async () => {
    const other = makeHarness({ SESSION_KEYS: generateSessionKey() })
    try {
      const start = await startLogin()
      const callback = await callbackUrlFor(start.authorize_url)

      // `other` has its own SESSION_KEYS, so our ticket must not verify there.
      const res = await other.request('/v1/auth/login/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ login_ticket: start.login_ticket, redirect_url: callback }),
      })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe('login_ticket_invalid')
    } finally {
      other.stop()
    }
  })

  test('surfaces an authorization code that has already been used', async () => {
    const start = await startLogin()
    const callback = await callbackUrlFor(start.authorize_url)
    const body = JSON.stringify({ login_ticket: start.login_ticket, redirect_url: callback })
    const headers = { 'content-type': 'application/json' }

    expect((await h.request('/v1/auth/login/complete', { method: 'POST', headers, body })).status).toBe(200)

    const second = await h.request('/v1/auth/login/complete', { method: 'POST', headers, body })
    expect(second.status).toBe(400)
    const err = (await second.json()) as { error: string; oauth_error: string; hint: string }
    expect(err.error).toBe('token_exchange_failed')
    expect(err.oauth_error).toBe('invalid_grant')
    expect(err.hint).toContain('single-use')
  })

  test('rejects a callback URL carrying an OAuth error', async () => {
    const start = await startLogin()
    const res = await h.request('/v1/auth/login/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        login_ticket: start.login_ticket,
        redirect_url: 'http://localhost:4180/oauth2/callback?error=access_denied&error_description=User+said+no',
      }),
    })
    expect(res.status).toBe(400)
    const err = (await res.json()) as { error: string; oauth_error: string }
    expect(err.error).toBe('authorization_denied')
    expect(err.oauth_error).toBe('access_denied')
  })

  test('rejects an expired ticket', async () => {
    const short = makeHarness({ LOGIN_TICKET_TTL_SECONDS: '-1' })
    try {
      const startRes = await short.request('/v1/auth/login/start', { method: 'POST' })
      const start = (await startRes.json()) as { authorize_url: string; login_ticket: string }
      const res = await short.request('/v1/auth/login/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          login_ticket: start.login_ticket,
          redirect_url: await callbackUrlFor(start.authorize_url),
        }),
      })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe('login_ticket_expired')
    } finally {
      short.stop()
    }
  })

  test('rejects a body with neither redirect_url nor code+state', async () => {
    const res = await h.request('/v1/auth/login/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login_ticket: 'ddl1.whatever' }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('invalid_request')
  })
})

describe('parseCallbackUrl', () => {
  test('reads code and state from a pasted URL', () => {
    expect(parseCallbackUrl('http://localhost:4180/oauth2/callback?code=abc&state=xyz')).toEqual({
      code: 'abc',
      state: 'xyz',
    })
  })

  test('tolerates surrounding whitespace from a sloppy paste', () => {
    expect(parseCallbackUrl('  http://localhost:4180/cb?code=abc&state=xyz\n')).toEqual({ code: 'abc', state: 'xyz' })
  })

  test('accepts a bare query string', () => {
    expect(parseCallbackUrl('?code=abc&state=xyz')).toEqual({ code: 'abc', state: 'xyz' })
  })

  test('reads params from the fragment when a browser puts them there', () => {
    expect(parseCallbackUrl('http://localhost:4180/cb#code=abc&state=xyz')).toEqual({ code: 'abc', state: 'xyz' })
  })

  test('explains itself when the code is missing', () => {
    expect(() => parseCallbackUrl('http://localhost:4180/oauth2/callback')).toThrow(/No `code`/)
  })
})

describe('resolveTokenExpiry', () => {
  const now = () => Math.floor(Date.now() / 1000)

  test('prefers expires_in', () => {
    const exp = resolveTokenExpiry({ access_token: 'x', token_type: 'Bearer', expires_in: 1800 }, 60)
    expect(exp).toBeGreaterThanOrEqual(now() + 1799)
  })

  test('falls back to expires_at', () => {
    const at = new Date(Date.now() + 600_000).toISOString()
    const exp = resolveTokenExpiry({ access_token: 'x', token_type: 'Bearer', expires_at: at }, 60)
    expect(Math.abs(exp - Math.floor(Date.parse(at) / 1000))).toBeLessThan(2)
  })

  test('falls back to the assumed TTL when the token says nothing', () => {
    const exp = resolveTokenExpiry({ access_token: 'x', token_type: 'Bearer' }, 120)
    expect(exp).toBeGreaterThanOrEqual(now() + 119)
    expect(exp).toBeLessThanOrEqual(now() + 121)
  })
})

describe('session lifetime', () => {
  test('SESSION_MAX_AGE_SECONDS caps a longer DoorDash token', async () => {
    const capped = makeHarness({ SESSION_MAX_AGE_SECONDS: '60', SESSION_IDLE_TIMEOUT_SECONDS: '30' })
    try {
      const { sessionToken } = await login(capped)
      const res = await capped.request('/v1/auth/session', { headers: bearer(sessionToken) })
      const body = (await res.json()) as { expires_in: number }
      // The mock issues a 3600s token; our ceiling must win.
      expect(body.expires_in).toBeLessThanOrEqual(60)
    } finally {
      capped.stop()
    }
  })
})
