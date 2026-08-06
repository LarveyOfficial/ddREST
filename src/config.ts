/**
 * Environment-driven configuration.
 *
 * Everything that changes between "localhost dev" and "deployed behind TLS"
 * lives here, with defaults chosen so that an unconfigured deployment is
 * locked down rather than permissive.
 */

const DEFAULT_CLIENT_ID = '1862661064320741379'
const DEFAULT_SCOPE = 'mcp:consumer:write consumer:addresses:read'
const DEFAULT_REDIRECT_URI = 'http://localhost:4180/oauth2/callback'

/** DoorDash Identity only accepts loopback callbacks on these ports. */
export const ALLOWED_REDIRECT_PORTS = [4180, 4181, 4182, 4183, 4184]
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export type SameSite = 'Strict' | 'Lax' | 'None'

export interface Config {
  host: string
  port: number

  /** Decryption keys, newest first. Index 0 is used for sealing. */
  sessionKeys: Buffer[]

  cookieName: string
  cookieSecure: boolean
  cookieSameSite: SameSite
  cookieDomain?: string
  cookiePath: string

  /** Empty means "no cross-origin browser access". */
  corsOrigins: string[]
  /** Extra origins trusted for CSRF beyond corsOrigins (e.g. the API's own origin). */
  trustedOrigins: string[]

  clientId: string
  scope: string
  redirectUri: string
  identityBase: string
  tokenBase: string
  mcpBase: string

  loginTicketTtlSeconds: number
  /** Hard end of a session, however many times its tokens are refreshed. */
  sessionMaxAgeSeconds: number
  /** Drop sessions unused for this long. */
  sessionIdleTimeoutSeconds: number
  /** Refresh once the access token is within this many seconds of expiring. */
  sessionRefreshSkewSeconds: number
  sessionSweepIntervalSeconds: number
  sessionDbPath: string

  /** RFC 8628-style pairing for devices with no browser. */
  pairingEnabled: boolean
  pairingDbPath: string
  /** How long a displayed pairing code stays approvable. */
  pairingCodeTtlSeconds: number
  /** Seconds a device is told to wait between polls. */
  pairingPollIntervalSeconds: number
  /** Ceiling on unapproved pairings, since anyone can create one. */
  pairingMaxPending: number
  /**
   * Externally reachable base URL, used for the verification_uri a device puts
   * on screen. Derived from the request when unset, which is wrong behind a
   * proxy that rewrites the host.
   */
  publicBaseUrl?: string
  /** Used when the token response omits both expires_in and expires_at. */
  assumedTokenTtlSeconds: number

  /** Fallback coordinates for restaurant search, mirroring dd-cli's defaults. */
  defaultLatitude: number
  defaultLongitude: number

  upstreamTimeoutMs: number
}

export class ConfigError extends Error {}

function str(env: Record<string, string | undefined>, key: string, fallback: string): string {
  const v = env[key]
  return v === undefined || v === '' ? fallback : v
}

function int(env: Record<string, string | undefined>, key: string, fallback: number): number {
  const v = env[key]
  if (v === undefined || v === '') return fallback
  const n = Number(v)
  if (!Number.isInteger(n)) throw new ConfigError(`${key} must be an integer, got ${JSON.stringify(v)}`)
  return n
}

function num(env: Record<string, string | undefined>, key: string, fallback: number): number {
  const v = env[key]
  if (v === undefined || v === '') return fallback
  const n = Number(v)
  if (!Number.isFinite(n)) throw new ConfigError(`${key} must be a number, got ${JSON.stringify(v)}`)
  return n
}

function bool(env: Record<string, string | undefined>, key: string, fallback: boolean): boolean {
  const v = env[key]
  if (v === undefined || v === '') return fallback
  if (['1', 'true', 'yes', 'on'].includes(v.toLowerCase())) return true
  if (['0', 'false', 'no', 'off'].includes(v.toLowerCase())) return false
  throw new ConfigError(`${key} must be a boolean, got ${JSON.stringify(v)}`)
}

function csv(env: Record<string, string | undefined>, key: string): string[] {
  return (env[key] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseKeys(raw: string): Buffer[] {
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) {
    throw new ConfigError(
      'SESSION_KEYS is required. Generate one with:  openssl rand -base64 32   (or: bun run keygen)',
    )
  }
  return parts.map((part, i) => {
    let key: Buffer
    try {
      key = Buffer.from(part, 'base64')
    } catch {
      throw new ConfigError(`SESSION_KEYS[${i}] is not valid base64`)
    }
    if (key.length !== 32) {
      throw new ConfigError(
        `SESSION_KEYS[${i}] must decode to exactly 32 bytes (got ${key.length}). ` +
          'Generate one with:  openssl rand -base64 32',
      )
    }
    return key
  })
}

/**
 * DoorDash rejects any redirect_uri that is not loopback on 4180-4184, so we
 * reject it here too rather than discovering it as an opaque OAuth error.
 */
function validateRedirectUri(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ConfigError(`DD_REDIRECT_URI is not a valid URL: ${JSON.stringify(raw)}`)
  }
  if (url.protocol !== 'http:') {
    throw new ConfigError('DD_REDIRECT_URI must use http: (DoorDash only accepts loopback callbacks)')
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new ConfigError(
      `DD_REDIRECT_URI host must be loopback (localhost or 127.0.0.1), got ${JSON.stringify(url.hostname)}`,
    )
  }
  const port = Number(url.port)
  if (!ALLOWED_REDIRECT_PORTS.includes(port)) {
    throw new ConfigError(
      `DD_REDIRECT_URI port must be one of ${ALLOWED_REDIRECT_PORTS.join(', ')}, got ${url.port || '(none)'}`,
    )
  }
  return url.toString()
}

/** Origin plus any path prefix, with the trailing slash removed so concatenation is predictable. */
function normalizeBaseUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ConfigError(`PUBLIC_BASE_URL is not a valid URL: ${JSON.stringify(raw)}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError(`PUBLIC_BASE_URL must be http or https, got ${JSON.stringify(url.protocol)}`)
  }
  return `${url.origin}${url.pathname}`.replace(/\/$/, '')
}

/**
 * Pairings are separate rows with a separate lifetime, so they get their own
 * file next to the session database rather than sharing its connection.
 */
function defaultPairingDbPath(sessionDbPath: string): string {
  if (sessionDbPath === ':memory:') return ':memory:'
  return sessionDbPath.replace(/(\.db)?$/, '') + '-pairings.db'
}

function normalizeOrigin(raw: string): string {
  try {
    return new URL(raw).origin
  } catch {
    throw new ConfigError(`Not a valid origin: ${JSON.stringify(raw)}`)
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const sameSiteRaw = str(env, 'COOKIE_SAME_SITE', 'Lax')
  const sameSite = (sameSiteRaw.charAt(0).toUpperCase() + sameSiteRaw.slice(1).toLowerCase()) as SameSite
  if (!['Strict', 'Lax', 'None'].includes(sameSite)) {
    throw new ConfigError(`COOKIE_SAME_SITE must be Strict, Lax or None; got ${JSON.stringify(sameSiteRaw)}`)
  }

  const cookieSecure = bool(env, 'COOKIE_SECURE', true)
  if (sameSite === 'None' && !cookieSecure) {
    throw new ConfigError('COOKIE_SAME_SITE=None requires COOKIE_SECURE=true; browsers reject the cookie otherwise')
  }

  const corsOrigins = csv(env, 'CORS_ORIGINS').map(normalizeOrigin)
  if (sameSite === 'None' && corsOrigins.length === 0) {
    throw new ConfigError(
      'COOKIE_SAME_SITE=None implies a cross-origin browser client, so CORS_ORIGINS must list it. ' +
        'Leaving it empty would let a cookie be sent cross-site with nothing to check the Origin against.',
    )
  }

  const sessionMaxAgeSeconds = int(env, 'SESSION_MAX_AGE_SECONDS', 2_592_000)
  const sessionIdleTimeoutSeconds = int(env, 'SESSION_IDLE_TIMEOUT_SECONDS', 1_209_600)
  const sessionRefreshSkewSeconds = int(env, 'SESSION_REFRESH_SKEW_SECONDS', 300)

  for (const [key, value] of [
    ['SESSION_MAX_AGE_SECONDS', sessionMaxAgeSeconds],
    ['SESSION_IDLE_TIMEOUT_SECONDS', sessionIdleTimeoutSeconds],
    ['SESSION_REFRESH_SKEW_SECONDS', sessionRefreshSkewSeconds],
  ] as const) {
    if (value <= 0) {
      throw new ConfigError(`${key} must be greater than 0, got ${value}. Every session would be dead on arrival.`)
    }
  }

  const sessionDbPath = str(env, 'SESSION_DB_PATH', './data/sessions.db')

  const publicBaseUrlRaw = env.PUBLIC_BASE_URL?.trim()
  const publicBaseUrl = publicBaseUrlRaw ? normalizeBaseUrl(publicBaseUrlRaw) : undefined

  const pairingCodeTtlSeconds = int(env, 'PAIRING_CODE_TTL_SECONDS', 600)
  const pairingPollIntervalSeconds = int(env, 'PAIRING_POLL_INTERVAL_SECONDS', 5)
  const pairingMaxPending = int(env, 'PAIRING_MAX_PENDING', 100)

  for (const [key, value] of [
    ['PAIRING_CODE_TTL_SECONDS', pairingCodeTtlSeconds],
    ['PAIRING_POLL_INTERVAL_SECONDS', pairingPollIntervalSeconds],
    ['PAIRING_MAX_PENDING', pairingMaxPending],
  ] as const) {
    if (value <= 0) throw new ConfigError(`${key} must be greater than 0, got ${value}.`)
  }

  // A code has to survive a whole browser login, which includes the user
  // finding their password. Anything under a minute is a code that expires
  // mid-flow every time.
  if (pairingCodeTtlSeconds < 60) {
    throw new ConfigError(
      `PAIRING_CODE_TTL_SECONDS is ${pairingCodeTtlSeconds}s, which is not long enough to sign in with. Use at least 60.`,
    )
  }

  // Not fatal, but the idle timeout can never fire in this arrangement — the
  // absolute deadline always wins first — so say so rather than let it look active.
  if (sessionIdleTimeoutSeconds >= sessionMaxAgeSeconds) {
    console.warn(
      `WARNING: SESSION_IDLE_TIMEOUT_SECONDS (${sessionIdleTimeoutSeconds}) is not shorter than ` +
        `SESSION_MAX_AGE_SECONDS (${sessionMaxAgeSeconds}), so idle expiry will never trigger.`,
    )
  }

  return {
    host: str(env, 'HOST', '127.0.0.1'),
    port: int(env, 'PORT', 8787),

    sessionKeys: parseKeys(str(env, 'SESSION_KEYS', '')),

    cookieName: str(env, 'COOKIE_NAME', 'dd_session'),
    cookieSecure,
    cookieSameSite: sameSite,
    cookieDomain: env.COOKIE_DOMAIN || undefined,
    cookiePath: str(env, 'COOKIE_PATH', '/'),

    corsOrigins,
    trustedOrigins: csv(env, 'TRUSTED_ORIGINS').map(normalizeOrigin),

    clientId: str(env, 'DD_CLIENT_ID', DEFAULT_CLIENT_ID),
    scope: str(env, 'DD_SCOPE', DEFAULT_SCOPE),
    redirectUri: validateRedirectUri(str(env, 'DD_REDIRECT_URI', DEFAULT_REDIRECT_URI)),
    identityBase: str(env, 'DD_IDENTITY_BASE', 'https://identity.doordash.com').replace(/\/$/, ''),
    tokenBase: str(env, 'DD_TOKEN_BASE', 'https://unified-gateway.doordash.com').replace(/\/$/, ''),
    mcpBase: str(env, 'DD_MCP_BASE', 'https://openapi.doordash.com').replace(/\/$/, ''),

    loginTicketTtlSeconds: int(env, 'LOGIN_TICKET_TTL_SECONDS', 600),
    // Sessions renew themselves and DoorDash imposes no cap of its own, so this
    // is policy rather than a technical limit: how long a leaked credential
    // stays usable. 30 days.
    sessionMaxAgeSeconds,
    sessionIdleTimeoutSeconds,
    // Renew slightly early so a request never races the expiry it just checked.
    sessionRefreshSkewSeconds,
    sessionSweepIntervalSeconds: int(env, 'SESSION_SWEEP_INTERVAL_SECONDS', 3_600),
    sessionDbPath,

    pairingEnabled: bool(env, 'PAIRING_ENABLED', true),
    // Defaults alongside the session database so one mounted volume covers both.
    pairingDbPath: str(env, 'PAIRING_DB_PATH', defaultPairingDbPath(sessionDbPath)),
    pairingCodeTtlSeconds,
    pairingPollIntervalSeconds,
    pairingMaxPending,
    publicBaseUrl,

    assumedTokenTtlSeconds: int(env, 'ASSUMED_TOKEN_TTL_SECONDS', 3_600),

    defaultLatitude: num(env, 'DEFAULT_LATITUDE', 37.3346),
    defaultLongitude: num(env, 'DEFAULT_LONGITUDE', -122.009),

    upstreamTimeoutMs: int(env, 'UPSTREAM_TIMEOUT_MS', 30_000),
  }
}
