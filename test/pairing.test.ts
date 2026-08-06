import { afterAll, describe, expect, test } from 'bun:test'
import { createApp } from '../src/app.ts'
import { formatUserCode, generateUserCode, normalizeUserCode } from '../src/pairing/codes.ts'
import { makeConfig, makeHarness, bearer, type Harness } from './helpers.ts'
import { startMockUpstream } from '../mock/upstream.ts'

const h = makeHarness()
afterAll(() => h.stop())

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const form = (fields: Record<string, string>): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields).toString(),
})

interface PairStart {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete: string
  expires_in: number
  interval: number
}

async function startPairing(harness: Harness, deviceLabel?: string): Promise<PairStart> {
  const res = await harness.request('/v1/auth/pair/request', json(deviceLabel ? { device_label: deviceLabel } : {}))
  expect(res.status).toBe(200)
  return (await res.json()) as PairStart
}

/** Walks a human through approving `userCode`, returning the /pair/complete response. */
async function approve(harness: Harness, userCode: string): Promise<Response> {
  const verifyRes = await harness.request('/v1/auth/pair/verify', json({ user_code: userCode }))
  expect(verifyRes.status).toBe(200)
  const verify = (await verifyRes.json()) as { authorize_url: string; approval_ticket: string }

  const authRes = await fetch(verify.authorize_url, { redirect: 'manual' })
  const redirectUrl = authRes.headers.get('location')
  if (!redirectUrl) throw new Error('mock /authorize did not redirect')

  return await harness.request(
    '/v1/auth/pair/complete',
    json({ approval_ticket: verify.approval_ticket, redirect_url: redirectUrl }),
  )
}

describe('user codes', () => {
  test('generated codes are display-formatted and round-trip through normalisation', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateUserCode()
      expect(code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/)
      const normalized = normalizeUserCode(code)
      expect(normalized).toBe(code.replace('-', ''))
      expect(formatUserCode(normalized!)).toBe(code)
    }
  })

  test('the alphabet excludes vowels and every visually ambiguous character', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) for (const ch of generateUserCode().replace('-', '')) seen.add(ch)

    // No vowels means a random code can never spell a real word.
    for (const vowel of 'AEIOUY') expect(seen.has(vowel)) .toBe(false)
    // No digits at all, so O/0, I/1 and S/5 confusions cannot arise.
    for (const ch of seen) expect(ch).toMatch(/[A-Z]/)
    // All 20 letters should show up across 4000 draws; a biased generator would not manage it.
    expect(seen.size).toBe(20)
  })

  test('normalisation forgives how a human actually retypes a code', () => {
    expect(normalizeUserCode('bcdf-ghjk')).toBe('BCDFGHJK')
    expect(normalizeUserCode('  BCDF GHJK ')).toBe('BCDFGHJK')
    expect(normalizeUserCode('BC-DF-GH-JK')).toBe('BCDFGHJK')
  })

  test('normalisation rejects anything that could not be one of our codes', () => {
    expect(normalizeUserCode('BCDFGHJ')).toBeUndefined() // too short
    expect(normalizeUserCode('BCDFGHJKL')).toBeUndefined() // too long
    expect(normalizeUserCode('BCDFGHJA')).toBeUndefined() // 'A' is not in the alphabet
    expect(normalizeUserCode('BCDF1HJK')).toBeUndefined() // digits are never valid
    expect(normalizeUserCode('')).toBeUndefined()
  })
})

describe('pair/request', () => {
  test('returns a displayable code, a secret device code, and where to send the human', async () => {
    const pairing = await startPairing(h, 'Kitchen tablet')

    expect(pairing.user_code).toMatch(/^[A-Z]{4}-[A-Z]{4}$/)
    expect(pairing.device_code.startsWith('ddp1.')).toBe(true)
    expect(pairing.verification_uri).toBe('http://api.test/v1/auth/pair')
    expect(pairing.verification_uri_complete).toBe(
      `http://api.test/v1/auth/pair?user_code=${encodeURIComponent(pairing.user_code)}`,
    )
    expect(pairing.interval).toBe(5)
    expect(pairing.expires_in).toBeGreaterThan(500)

    // The user code must not be derivable from the device code, or displaying
    // one would leak the other.
    expect(pairing.device_code).not.toContain(pairing.user_code.replace('-', ''))
  })

  test('every pairing gets a distinct code and device code', async () => {
    const codes = new Set<string>()
    const devices = new Set<string>()
    for (let i = 0; i < 25; i++) {
      const p = await startPairing(h)
      codes.add(p.user_code)
      devices.add(p.device_code)
    }
    expect(codes.size).toBe(25)
    expect(devices.size).toBe(25)
  })

  test('works with no body at all', async () => {
    const res = await h.request('/v1/auth/pair/request', { method: 'POST' })
    expect(res.status).toBe(200)
  })

  test('PUBLIC_BASE_URL wins over the request host, for deployments behind a proxy', async () => {
    const proxied = makeHarness({ PUBLIC_BASE_URL: 'https://dd.example.com/' })
    try {
      const pairing = await startPairing(proxied)
      expect(pairing.verification_uri).toBe('https://dd.example.com/v1/auth/pair')
    } finally {
      proxied.stop()
    }
  })
})

describe('pair/token polling', () => {
  test('reports authorization_pending until a human acts', async () => {
    const pairing = await startPairing(h)
    const res = await h.request('/v1/auth/pair/token', json({ device_code: pairing.device_code }))

    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe('authorization_pending')
    // RFC 8628 clients read error_description; ddREST clients read message.
    expect(body.error_description).toBe(body.message)
    expect(body.interval).toBe(5)
  })

  test('the first poll is never told to slow down', async () => {
    const pairing = await startPairing(h)
    const first = await h.request('/v1/auth/pair/token', json({ device_code: pairing.device_code }))
    expect(((await first.json()) as { error: string }).error).toBe('authorization_pending')
  })

  test('a second immediate poll earns slow_down with a raised interval', async () => {
    const pairing = await startPairing(h)
    await h.request('/v1/auth/pair/token', json({ device_code: pairing.device_code }))

    const res = await h.request('/v1/auth/pair/token', json({ device_code: pairing.device_code }))
    const body = (await res.json()) as { error: string; interval: number }
    expect(body.error).toBe('slow_down')
    expect(body.interval).toBe(10)

    // RFC 8628 §3.5: the increase is cumulative, and a device that keeps
    // hammering must not be able to reset its own clock by polling.
    const again = (await (
      await h.request('/v1/auth/pair/token', json({ device_code: pairing.device_code }))
    ).json()) as { interval: number }
    expect(again.interval).toBe(15)
  })

  test('rejects an unknown, malformed, or tampered device code', async () => {
    const pairing = await startPairing(h)

    for (const candidate of [
      'ddp1.notbase64!!',
      'nonsense',
      // Right shape, wrong key: flipping the last character breaks the hash
      // check without changing the row it points at.
      pairing.device_code.slice(0, -1) + (pairing.device_code.endsWith('A') ? 'B' : 'A'),
    ]) {
      const res = await h.request('/v1/auth/pair/token', json({ device_code: candidate }))
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe('invalid_grant')
    }
  })

  test('rejects a non-device-code grant_type but accepts the RFC one', async () => {
    const pairing = await startPairing(h)

    const wrong = await h.request(
      '/v1/auth/pair/token',
      json({ device_code: pairing.device_code, grant_type: 'authorization_code' }),
    )
    expect(((await wrong.json()) as { error: string }).error).toBe('invalid_request')

    const right = await h.request(
      '/v1/auth/pair/token',
      json({ device_code: pairing.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
    )
    expect(((await right.json()) as { error: string }).error).toBe('authorization_pending')
  })
})

describe('the full pairing flow', () => {
  test('a device receives a working session once a human approves', async () => {
    const pairing = await startPairing(h, 'Living room display')

    const completeRes = await approve(h, pairing.user_code)
    expect(completeRes.status).toBe(200)
    const complete = (await completeRes.json()) as Record<string, unknown>
    expect(complete.ok).toBe(true)
    expect(complete.device_label).toBe('Living room display')

    // The approver gets confirmation, never the credential itself.
    expect(JSON.stringify(complete)).not.toContain('dds2.')

    const tokenRes = await h.request('/v1/auth/pair/token', json({ device_code: pairing.device_code }))
    expect(tokenRes.status).toBe(200)
    const token = (await tokenRes.json()) as { session_token: string; cookie_set: boolean; renewable: boolean }
    expect(token.session_token.startsWith('dds2.')).toBe(true)
    expect(token.cookie_set).toBe(false)
    expect(token.renewable).toBe(true)

    // Polling must not set a cookie — the caller is not a browser.
    expect(tokenRes.headers.get('set-cookie')).toBeNull()

    // And the credential is a real session.
    const sessionRes = await h.request('/v1/auth/session', { headers: bearer(token.session_token) })
    expect(sessionRes.status).toBe(200)
    expect(((await sessionRes.json()) as { authenticated: boolean }).authenticated).toBe(true)
  })

  test('the session is delivered exactly once', async () => {
    const pairing = await startPairing(h)
    await approve(h, pairing.user_code)

    const first = await h.request('/v1/auth/pair/token', json({ device_code: pairing.device_code }))
    expect(first.status).toBe(200)

    // The row is deleted on collection, so a replayed device code — by the
    // device or by anyone who copied it — gets nothing.
    const second = await h.request('/v1/auth/pair/token', json({ device_code: pairing.device_code }))
    expect(second.status).toBe(400)
    expect(((await second.json()) as { error: string }).error).toBe('invalid_grant')
  })

  test('the code is accepted however the human retypes it', async () => {
    const pairing = await startPairing(h)
    const messy = `  ${pairing.user_code.replace('-', '').toLowerCase()}  `

    const res = await h.request('/v1/auth/pair/verify', json({ user_code: messy }))
    expect(res.status).toBe(200)
    expect(((await res.json()) as { user_code: string }).user_code).toBe(pairing.user_code)
  })

  test('an approved pairing cannot be approved a second time', async () => {
    const pairing = await startPairing(h)

    // Two people open the approval page for the same code before either
    // finishes, so both hold a ticket whose `state` is genuinely valid. This is
    // the case that must be caught by the pairing's status, not by state.
    const tickets: { approval_ticket: string; authorize_url: string }[] = []
    for (let i = 0; i < 2; i++) {
      tickets.push(
        (await (await h.request('/v1/auth/pair/verify', json({ user_code: pairing.user_code }))).json()) as {
          approval_ticket: string
          authorize_url: string
        },
      )
    }

    const callbacks = await Promise.all(
      tickets.map(async (t) => (await fetch(t.authorize_url, { redirect: 'manual' })).headers.get('location')!),
    )

    const winner = await h.request(
      '/v1/auth/pair/complete',
      json({ approval_ticket: tickets[0]!.approval_ticket, redirect_url: callbacks[0]! }),
    )
    expect(winner.status).toBe(200)

    const loser = await h.request(
      '/v1/auth/pair/complete',
      json({ approval_ticket: tickets[1]!.approval_ticket, redirect_url: callbacks[1]! }),
    )
    expect(loser.status).toBe(409)
    expect(((await loser.json()) as { error: string }).error).toBe('pairing_conflict')

    // The device gets the first session, and only that one.
    const tokenRes = await h.request('/v1/auth/pair/token', json({ device_code: pairing.device_code }))
    expect(tokenRes.status).toBe(200)
  })
})

describe('denial', () => {
  test('a denied device is told access_denied rather than being left to time out', async () => {
    const pairing = await startPairing(h)

    const verify = (await (
      await h.request('/v1/auth/pair/verify', json({ user_code: pairing.user_code }))
    ).json()) as { approval_ticket: string }

    const denyRes = await h.request('/v1/auth/pair/deny', json({ approval_ticket: verify.approval_ticket }))
    expect(denyRes.status).toBe(200)

    const res = await h.request('/v1/auth/pair/token', json({ device_code: pairing.device_code }))
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('access_denied')
  })

  test('a denied pairing cannot then be approved', async () => {
    const pairing = await startPairing(h)
    const verify = (await (
      await h.request('/v1/auth/pair/verify', json({ user_code: pairing.user_code }))
    ).json()) as { approval_ticket: string }

    await h.request('/v1/auth/pair/deny', json({ approval_ticket: verify.approval_ticket }))

    const res = await h.request('/v1/auth/pair/verify', json({ user_code: pairing.user_code }))
    expect(res.status).toBe(409)
  })
})

describe('bad codes', () => {
  test('an unrecognised but well-formed code is a 404', async () => {
    const res = await h.request('/v1/auth/pair/verify', json({ user_code: 'BCDF-GHJK' }))
    expect(res.status).toBe(404)
    expect(((await res.json()) as { error: string }).error).toBe('pairing_not_found')
  })

  test('a code that is not even the right shape says so, and is not a guess', async () => {
    const res = await h.request('/v1/auth/pair/verify', json({ user_code: 'hello' }))
    expect(res.status).toBe(400)
    expect(((await res.json()) as { message: string }).message).toContain('eight letters')
  })

  test('repeated wrong guesses are throttled, but typos are not', async () => {
    const fresh = makeHarness()
    try {
      // Malformed input must not consume the brute-force budget, or a user
      // fat-fingering the code would lock themselves out.
      for (let i = 0; i < 50; i++) {
        const res = await fresh.request('/v1/auth/pair/verify', json({ user_code: 'nope' }))
        expect(res.status).toBe(400)
      }

      // Well-formed-but-wrong codes are guesses, and do get throttled.
      let throttled = false
      for (let i = 0; i < 40; i++) {
        const res = await fresh.request('/v1/auth/pair/verify', json({ user_code: generateUserCode() }))
        if (res.status === 429) {
          throttled = true
          break
        }
        expect(res.status).toBe(404)
      }
      expect(throttled).toBe(true)
    } finally {
      fresh.stop()
    }
  })
})

describe('ticket binding', () => {
  test('a login ticket cannot be replayed as an approval ticket', async () => {
    const pairing = await startPairing(h)
    const start = (await (await h.request('/v1/auth/login/start', { method: 'POST' })).json()) as {
      login_ticket: string
      authorize_url: string
    }
    const authRes = await fetch(start.authorize_url, { redirect: 'manual' })

    // Both are sealed under the same server keys; only the bound prefix keeps
    // an ordinary login from being redirected into someone's waiting device.
    const res = await h.request(
      '/v1/auth/pair/complete',
      json({ approval_ticket: start.login_ticket, redirect_url: authRes.headers.get('location')! }),
    )
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('pairing_ticket_invalid')

    // ...and the device is still waiting, not paired.
    const poll = await h.request('/v1/auth/pair/token', json({ device_code: pairing.device_code }))
    expect(((await poll.json()) as { error: string }).error).toBe('authorization_pending')
  })

  test('an approval ticket cannot be replayed as a login ticket', async () => {
    const pairing = await startPairing(h)
    const verify = (await (
      await h.request('/v1/auth/pair/verify', json({ user_code: pairing.user_code }))
    ).json()) as { approval_ticket: string; authorize_url: string }
    const authRes = await fetch(verify.authorize_url, { redirect: 'manual' })

    const res = await h.request(
      '/v1/auth/login/complete',
      json({ login_ticket: verify.approval_ticket, redirect_url: authRes.headers.get('location')! }),
    )
    expect(res.status).toBe(400)
  })

  test('a callback from a different login is refused on state mismatch', async () => {
    const pairing = await startPairing(h)
    const verify = (await (
      await h.request('/v1/auth/pair/verify', json({ user_code: pairing.user_code }))
    ).json()) as { approval_ticket: string }

    // A callback the attacker obtained elsewhere, belonging to another login.
    const other = (await (await h.request('/v1/auth/login/start', { method: 'POST' })).json()) as {
      authorize_url: string
    }
    const authRes = await fetch(other.authorize_url, { redirect: 'manual' })

    const res = await h.request(
      '/v1/auth/pair/complete',
      json({ approval_ticket: verify.approval_ticket, redirect_url: authRes.headers.get('location')! }),
    )
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('state_mismatch')
  })
})

describe('the browser pages', () => {
  test('the entry page renders and prefills from verification_uri_complete', async () => {
    const pairing = await startPairing(h)

    const plain = await h.request('/v1/auth/pair')
    expect(plain.status).toBe(200)
    expect(plain.headers.get('content-type')).toContain('text/html')
    expect(await plain.text()).toContain('Pair a device')

    const prefilled = await h.request(`/v1/auth/pair?user_code=${pairing.user_code}`)
    expect(await prefilled.text()).toContain(`value="${pairing.user_code}"`)
  })

  test('a human can pair end to end through the form alone', async () => {
    const pairing = await startPairing(h, 'Garage Pi')

    const step2 = await h.request('/v1/auth/pair', form({ user_code: pairing.user_code }))
    expect(step2.status).toBe(200)
    const html = await step2.text()
    expect(html).toContain('Approve this device')
    expect(html).toContain('Garage Pi')
    expect(html).toContain(pairing.user_code)

    const ticket = /name="approval_ticket" value="([^"]+)"/.exec(html)?.[1]
    const authorizeUrl = /href="(http[^"]*authorize[^"]*)"/.exec(html)?.[1]?.replace(/&amp;/g, '&')
    expect(ticket).toBeDefined()
    expect(authorizeUrl).toBeDefined()

    const authRes = await fetch(authorizeUrl!, { redirect: 'manual' })
    const step3 = await h.request(
      '/v1/auth/pair',
      form({ approval_ticket: ticket!, redirect_url: authRes.headers.get('location')!, action: 'approve' }),
    )
    expect(step3.status).toBe(200)
    expect(await step3.text()).toContain('Device approved')

    const tokenRes = await h.request('/v1/auth/pair/token', json({ device_code: pairing.device_code }))
    expect(tokenRes.status).toBe(200)
  })

  test('the Deny button works with the paste field left empty', async () => {
    const pairing = await startPairing(h)
    const html = await (await h.request('/v1/auth/pair', form({ user_code: pairing.user_code }))).text()
    const ticket = /name="approval_ticket" value="([^"]+)"/.exec(html)![1]!

    const denied = await h.request('/v1/auth/pair', form({ approval_ticket: ticket, action: 'deny' }))
    expect(await denied.text()).toContain('Device denied')

    const poll = await h.request('/v1/auth/pair/token', json({ device_code: pairing.device_code }))
    expect(((await poll.json()) as { error: string }).error).toBe('access_denied')
  })

  test('a wrong code re-renders the form with the error, not a dead end', async () => {
    const res = await h.request('/v1/auth/pair', form({ user_code: 'BCDF-GHJK' }))
    expect(res.status).toBe(404)
    const html = await res.text()
    expect(html).toContain('No device is waiting with that code')
    expect(html).toContain('name="user_code"')
  })

  test('a bad paste re-renders the approval step so it can be retried', async () => {
    const pairing = await startPairing(h)
    const html = await (await h.request('/v1/auth/pair', form({ user_code: pairing.user_code }))).text()
    const ticket = /name="approval_ticket" value="([^"]+)"/.exec(html)![1]!

    const res = await h.request(
      '/v1/auth/pair',
      form({ approval_ticket: ticket, redirect_url: 'http://localhost:4180/oauth2/callback?code=x&state=wrong' }),
    )
    const retry = await res.text()
    expect(retry).toContain('Approve this device')
    expect(retry).toContain('does not match')
    expect(retry).toContain(`value="${ticket}"`)

    // Still pending, so the human really can try again.
    const poll = await h.request('/v1/auth/pair/token', json({ device_code: pairing.device_code }))
    expect(((await poll.json()) as { error: string }).error).toBe('authorization_pending')
  })

  test('a device label cannot inject markup into the approval page', async () => {
    const pairing = await startPairing(h, '<img src=x onerror="alert(1)">')
    const html = await (await h.request('/v1/auth/pair', form({ user_code: pairing.user_code }))).text()

    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
  })

  test('the pages warn about the phishing case this flow is inherently open to', async () => {
    const pairing = await startPairing(h)
    const html = await (await h.request('/v1/auth/pair', form({ user_code: pairing.user_code }))).text()

    expect(html).toContain('Only continue if you started this yourself')
    expect(html).toContain('Deny')
  })
})

describe('configuration', () => {
  test('PAIRING_ENABLED=false turns the whole feature off', async () => {
    const off = makeHarness({ PAIRING_ENABLED: 'false' })
    try {
      const request = await off.request('/v1/auth/pair/request', { method: 'POST' })
      expect(request.status).toBe(403)
      expect(((await request.json()) as { error: string }).error).toBe('pairing_disabled')

      const page = await off.request('/v1/auth/pair')
      expect(page.status).toBe(403)
      expect(await page.text()).toContain('turned off')

      // The ordinary login flow is untouched by it.
      expect((await off.request('/v1/auth/login/start', { method: 'POST' })).status).toBe(200)
    } finally {
      off.stop()
    }
  })

  test('the pending cap refuses new pairings rather than growing without bound', async () => {
    const capped = makeHarness({ PAIRING_MAX_PENDING: '3' })
    try {
      for (let i = 0; i < 3; i++) {
        expect((await capped.request('/v1/auth/pair/request', { method: 'POST' })).status).toBe(200)
      }
      const res = await capped.request('/v1/auth/pair/request', { method: 'POST' })
      expect(res.status).toBe(429)
      expect(((await res.json()) as { error: string }).error).toBe('too_many_requests')
    } finally {
      capped.stop()
    }
  })

  test('a TTL too short to sign in within is rejected at startup', () => {
    expect(() => makeConfig({ PAIRING_CODE_TTL_SECONDS: '10' })).toThrow(/not long enough/)
    expect(() => makeConfig({ PAIRING_POLL_INTERVAL_SECONDS: '0' })).toThrow(/greater than 0/)
    expect(() => makeConfig({ PUBLIC_BASE_URL: 'not-a-url' })).toThrow(/PUBLIC_BASE_URL/)
  })

  test('the pairing database defaults alongside the session one', () => {
    expect(makeConfig({ SESSION_DB_PATH: '/data/sessions.db' }).pairingDbPath).toBe('/data/sessions-pairings.db')
    expect(makeConfig({ SESSION_DB_PATH: ':memory:' }).pairingDbPath).toBe(':memory:')
  })
})

describe('openapi examples', () => {
  test('every pairing request body ships examples, so Swagger UI invents no "string" placeholders', async () => {
    const doc = (await (await h.request('/openapi.json')).json()) as any
    const bodyOf = (path: string) => doc.paths[path].post.requestBody.content['application/json']

    for (const path of [
      '/v1/auth/pair/request',
      '/v1/auth/pair/token',
      '/v1/auth/pair/verify',
      '/v1/auth/pair/complete',
      '/v1/auth/pair/deny',
    ]) {
      const examples = bodyOf(path).examples
      expect(examples).toBeDefined()
      expect(Object.keys(examples).length).toBeGreaterThan(0)

      // A fabricated "string" in an example is the exact failure these exist to
      // prevent, so no example value may contain one.
      for (const example of Object.values(examples) as { value: Record<string, unknown> }[]) {
        for (const value of Object.values(example.value)) expect(value).not.toBe('string')
      }
    }
  })

  test('the polling example omits grant_type, since prefilling it would 400 every poll', async () => {
    const doc = (await (await h.request('/openapi.json')).json()) as any
    const examples = doc.paths['/v1/auth/pair/token'].post.requestBody.content['application/json'].examples

    // Swagger UI prefills the first example, so that one must be the plain poll.
    expect(Object.keys(examples)).toEqual(['poll', 'rfcClient'])
    expect(Object.keys(examples.poll.value)).toEqual(['device_code'])
    expect(examples.rfcClient.value.grant_type).toBe('urn:ietf:params:oauth:grant-type:device_code')
  })

  test('the complete example does not suggest sending redirect_url alongside code/state', async () => {
    const doc = (await (await h.request('/openapi.json')).json()) as any
    const examples = doc.paths['/v1/auth/pair/complete'].post.requestBody.content['application/json'].examples

    expect(Object.keys(examples.pastedUrl.value).sort()).toEqual(['approval_ticket', 'redirect_url'])
    expect(Object.keys(examples.parsedParams.value).sort()).toEqual(['approval_ticket', 'code', 'state'])
  })
})

describe('expiry', () => {
  test('a code that expires unapproved leaves the device with expired_token', async () => {
    // Below the configured floor, so it is set directly rather than via env.
    const mock = startMockUpstream()
    const cfg = { ...makeConfig({}, mock.url), pairingCodeTtlSeconds: 1 }
    const app = createApp(cfg)
    const request = (path: string, init?: RequestInit) => app.fetch(new Request(`http://api.test${path}`, init))

    try {
      const pairing = (await (
        await request('/v1/auth/pair/request', { method: 'POST' })
      ).json()) as PairStart
      expect(pairing.expires_in).toBeLessThanOrEqual(1)

      await Bun.sleep(1100)

      const poll = await request('/v1/auth/pair/token', json({ device_code: pairing.device_code }))
      expect(poll.status).toBe(400)
      expect(((await poll.json()) as { error: string }).error).toBe('expired_token')

      // And the human is told the same thing, not left guessing.
      const verify = await request('/v1/auth/pair/verify', json({ user_code: pairing.user_code }))
      expect([404, 410]).toContain(verify.status)
    } finally {
      mock.stop()
    }
  })
})
