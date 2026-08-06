import { createApp } from '../src/app.ts'
import { loadConfig, type Config } from '../src/config.ts'
import { generateSessionKey } from '../src/crypto/seal.ts'
import { startMockUpstream, type MockUpstream } from '../mock/upstream.ts'

export interface Harness {
  app: ReturnType<typeof createApp>
  cfg: Config
  mock: MockUpstream
  request(path: string, init?: RequestInit): Promise<Response>
  stop(): void
}

export const TEST_KEY = generateSessionKey()

export function makeConfig(overrides: Record<string, string> = {}, mockUrl?: string): Config {
  return loadConfig({
    SESSION_KEYS: TEST_KEY,
    SESSION_DB_PATH: ':memory:',
    COOKIE_SECURE: 'false',
    ...(mockUrl ? { DD_IDENTITY_BASE: mockUrl, DD_TOKEN_BASE: mockUrl, DD_MCP_BASE: mockUrl } : {}),
    ...overrides,
  })
}

export function makeHarness(overrides: Record<string, string> = {}): Harness {
  const mock = startMockUpstream()
  const cfg = makeConfig(overrides, mock.url)
  const app = createApp(cfg)

  return {
    app,
    cfg,
    mock,
    async request(path, init) {
      return await app.fetch(new Request(`http://api.test${path}`, init))
    },
    stop() {
      mock.stop()
    },
  }
}

/** Runs the full paste-back login against the mock and returns the session token. */
export async function login(h: Harness): Promise<{ sessionToken: string; cookie: string }> {
  const startRes = await h.request('/v1/auth/login/start', { method: 'POST' })
  const start = (await startRes.json()) as { authorize_url: string; login_ticket: string }

  // Follow /authorize manually so we capture the Location the browser would land on.
  const authRes = await fetch(start.authorize_url, { redirect: 'manual' })
  const redirectUrl = authRes.headers.get('location')
  if (!redirectUrl) throw new Error('mock /authorize did not redirect')

  const completeRes = await h.request('/v1/auth/login/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login_ticket: start.login_ticket, redirect_url: redirectUrl }),
  })
  if (completeRes.status !== 200) {
    throw new Error(`login/complete failed: ${completeRes.status} ${await completeRes.text()}`)
  }
  const body = (await completeRes.json()) as { session_token: string }
  return {
    sessionToken: body.session_token,
    cookie: `${h.cfg.cookieName}=${body.session_token}`,
  }
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
