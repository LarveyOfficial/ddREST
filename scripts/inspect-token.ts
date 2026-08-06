/**
 * One-off diagnostic: what does DoorDash actually put in the token response?
 *
 * dd-cli has no refresh feature, so nothing about it indicates whether the
 * token response carries a refresh_token — DoorDash may well return one that
 * simply goes unused. This answers two questions the design depends on:
 *
 *   1. Is there a refresh_token (or anything else we are discarding)?
 *   2. How long does DoorDash's access token actually last?
 *
 * Run:  bun run inspect-token
 *
 * It performs a REAL login against DoorDash and consumes one authorization
 * code. Secret values are never printed — only field names, types, lengths and
 * a short prefix.
 */

import { loadConfig } from '../src/config.ts'
import { deriveCodeChallenge, generateCodeVerifier, generateState } from '../src/auth/pkce.ts'
import { buildAuthorizeUrl, parseCallbackUrl } from '../src/auth/oauth.ts'

const SECRET_KEYS = /token|secret|code|jwt|assertion|key/i

function describe(key: string, value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return `${typeof value} = ${value}`
  if (typeof value === 'string') {
    // Lifetimes and scopes are not secrets and are exactly what we need to see.
    if (!SECRET_KEYS.test(key) || key === 'token_type') return `string = ${JSON.stringify(value)}`
    return `string, length ${value.length}, starts "${value.slice(0, 6)}…"`
  }
  if (Array.isArray(value)) return `array(${value.length})`
  return `object{${Object.keys(value as object).join(', ')}}`
}

const cfg = loadConfig({ ...process.env, SESSION_KEYS: process.env.SESSION_KEYS || Buffer.alloc(32, 1).toString('base64') })

const verifier = generateCodeVerifier()
const state = generateState()
const authorizeUrl = buildAuthorizeUrl(cfg, {
  state,
  codeChallenge: deriveCodeChallenge(verifier),
  redirectUri: cfg.redirectUri,
})

console.log('\n1. Open this in a browser and sign in:\n')
console.log(`   ${authorizeUrl}\n`)
console.log(`2. You will land on ${cfg.redirectUri} and the page will fail to load. That is expected.`)
console.log('3. Paste the full URL from the address bar below.\n')

const pasted = prompt('Callback URL:')
if (!pasted) {
  console.error('Nothing pasted; aborting.')
  process.exit(1)
}

const { code, state: returnedState } = parseCallbackUrl(pasted)
if (returnedState !== state) {
  console.error('State mismatch — that URL is from a different login attempt.')
  process.exit(1)
}

const url = `${cfg.tokenBase}/identity-bff/v1/oauth2/token`
console.log(`\nExchanging code at ${url} …\n`)

const response = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify({
    grant_type: 'authorization_code',
    client_id: cfg.clientId,
    code,
    redirect_uri: cfg.redirectUri,
    code_verifier: verifier,
  }),
})

const raw = await response.text()
console.log(`HTTP ${response.status} ${response.statusText}`)

let body: Record<string, unknown>
try {
  body = JSON.parse(raw) as Record<string, unknown>
} catch {
  console.error('Response was not JSON:\n', raw.slice(0, 500))
  process.exit(1)
}

if (!response.ok) {
  console.error('Token exchange failed:', JSON.stringify(body, null, 2))
  process.exit(1)
}

console.log('\n--- fields DoorDash returned ---')
for (const [key, value] of Object.entries(body)) {
  console.log(`  ${key.padEnd(22)} ${describe(key, value)}`)
}

const known = new Set(['access_token', 'token_type', 'expires_in', 'expires_at', 'scope'])
const extra = Object.keys(body).filter((k) => !known.has(k))

console.log('\n--- what this means ---')

const refreshKey = Object.keys(body).find((k) => /refresh/i.test(k))
if (refreshKey) {
  console.log(`  REFRESH IS POSSIBLE. DoorDash returned "${refreshKey}", which the API currently discards.`)
} else {
  console.log('  No refresh token in the response. Silent renewal is not available through this grant.')
}

const expiresIn = body.expires_in
if (typeof expiresIn === 'number') {
  const hours = (expiresIn / 3600).toFixed(1)
  console.log(`  DoorDash access token lasts ${expiresIn}s (${hours}h).`)
  if (expiresIn > cfg.sessionMaxAgeSeconds) {
    console.log(
      `  Your SESSION_MAX_AGE_SECONDS=${cfg.sessionMaxAgeSeconds} is SHORTER than that, so the API is ` +
        'truncating the session itself. Raise it to use the token’s full life.',
    )
  }
} else if (typeof body.expires_at === 'string') {
  console.log(`  No expires_in; expires_at = ${body.expires_at}.`)
} else {
  console.log('  Neither expires_in nor expires_at — the API falls back to ASSUMED_TOKEN_TTL_SECONDS.')
}

if (extra.length > 0) {
  console.log(`  Undocumented fields present: ${extra.join(', ')}`)
}

// --- The access token is a JWT; its claims are the only other readable source
// of lifetime information. The refresh token is an opaque UUID with nothing in
// it, and the discovery document publishes no lifetimes.
const claims = typeof body.access_token === 'string' ? decodeJwtClaims(body.access_token) : undefined
if (claims) {
  console.log('\n--- access token claims (decoded, NOT verified) ---')
  for (const [key, value] of Object.entries(claims)) {
    let rendered: string
    if (typeof value === 'number' && value > 1_000_000_000 && value < 4_000_000_000) {
      rendered = `${value}  (${new Date(value * 1000).toISOString()})`
    } else if (typeof value === 'number' && !Number.isSafeInteger(value)) {
      // JSON.parse silently rounds integers past 2^53, so the digits shown here
      // are not what DoorDash sent. Only affects display of ids like `cid`.
      rendered = `${value}  (rounded — exceeds JS safe-integer range)`
    } else {
      rendered = JSON.stringify(value)
    }
    console.log(`  ${key.padEnd(18)} ${rendered}`)
  }

  const exp = typeof claims.exp === 'number' ? claims.exp : undefined
  const iat = typeof claims.iat === 'number' ? claims.iat : undefined
  if (exp && iat) {
    console.log(`\n  Token validity from claims: ${((exp - iat) / 3600).toFixed(1)}h`)
  }
  // Some issuers carry a separate session deadline that survives renewals; if
  // one is present it is the answer to "how long can this session live".
  const sessionish = Object.keys(claims).filter((k) => /session|sess|sid|auth_time|max_age/i.test(k))
  if (sessionish.length > 0) {
    console.log(`  Possible session claims to watch: ${sessionish.join(', ')}`)
  }
}

function decodeJwtClaims(jwt: string): Record<string, unknown> | undefined {
  const parts = jwt.split('.')
  if (parts.length !== 3 || !parts[1]) return undefined
  try {
    const parsed: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

// --- Phase 2: does the refresh grant actually work, and does it rotate? -----
//
// Whether DoorDash issues a NEW refresh token on each use decides the whole
// design. If it rotates, a stateless server can lose the chain when two
// requests refresh concurrently; if it does not, statelessness is safe.
if (!refreshKey) {
  console.log()
  process.exit(0)
}

const refreshToken = body[refreshKey] as string
console.log('\n--- probing the refresh grant ---')

const refreshResponse = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify({
    grant_type: 'refresh_token',
    client_id: cfg.clientId,
    refresh_token: refreshToken,
  }),
})

const refreshRaw = await refreshResponse.text()
console.log(`  HTTP ${refreshResponse.status} ${refreshResponse.statusText}`)

let refreshed: Record<string, unknown>
try {
  refreshed = JSON.parse(refreshRaw) as Record<string, unknown>
} catch {
  console.log(`  Non-JSON response: ${refreshRaw.slice(0, 300)}`)
  process.exit(0)
}

if (!refreshResponse.ok) {
  console.log(`  Refresh grant REJECTED: ${JSON.stringify(refreshed)}`)
  console.log('  The refresh_token may need different parameters than the standard OAuth ones.')
  process.exit(0)
}

console.log('  Refresh grant ACCEPTED. Fields returned:')
for (const [key, value] of Object.entries(refreshed)) {
  console.log(`    ${key.padEnd(20)} ${describe(key, value)}`)
}

// --- Is there an absolute cap on the chain? --------------------------------
//
// `orig_iat` ("original issued at") only needs to exist if something is
// measured from the first authentication rather than the latest token. If it
// survives a refresh unchanged, there is a fixed anchor and therefore a ceiling
// on how long refreshing can continue. If it moves to now, there is no anchor
// and a regularly-used session can renew indefinitely. This is the whole
// question, and it is answerable right here rather than by waiting weeks.
const before = claims
const after = typeof refreshed.access_token === 'string' ? decodeJwtClaims(refreshed.access_token) : undefined

if (before && after) {
  console.log('\n--- absolute cap on the session chain? ---')

  const origBefore = before.orig_iat
  const origAfter = after.orig_iat

  if (typeof origBefore === 'number' && typeof origAfter === 'number') {
    const drift = origAfter - origBefore
    console.log(`  orig_iat before refresh: ${origBefore} (${new Date(origBefore * 1000).toISOString()})`)
    console.log(`  orig_iat after refresh:  ${origAfter} (${new Date(origAfter * 1000).toISOString()})`)

    if (drift === 0) {
      console.log('\n  PRESERVED across the refresh — the chain is anchored to your original login.')
      console.log('  That is how a maximum refresh window is enforced, so assume an absolute cap exists.')
      console.log('  Its size is still unknown; `bun run probe-refresh init sustained` is the way to find it.')
      console.log('  Until then keep SESSION_MAX_AGE_SECONDS conservative — a session cannot outlive the cap.')
    } else {
      console.log(`\n  RESET by the refresh (moved ${drift}s) — no fixed anchor to your original login.`)
      console.log('  Nothing here bounds how long refreshing can continue, so a session in regular use should')
      console.log('  renew indefinitely. SESSION_MAX_AGE_SECONDS is then purely your own policy choice.')
    }
  } else {
    console.log('  No orig_iat on one side of the refresh; cannot compare.')
  }

  const addedOrRemoved = [
    ...Object.keys(after).filter((k) => !(k in before)).map((k) => `+${k}`),
    ...Object.keys(before).filter((k) => !(k in after)).map((k) => `-${k}`),
  ]
  if (addedOrRemoved.length > 0) {
    console.log(`\n  Claims that changed shape across the refresh: ${addedOrRemoved.join(', ')}`)
  }

  const expAfter = after.exp
  if (typeof expAfter === 'number' && typeof origAfter === 'number') {
    console.log(`  Renewed token is valid for ${((expAfter - origAfter) / 3600).toFixed(1)}h measured from orig_iat.`)
  }
}

const newRefresh = Object.keys(refreshed).find((k) => /refresh/i.test(k))
console.log()
if (!newRefresh) {
  console.log('  ROTATION: no. The original refresh token stays valid and reusable.')
  console.log('  => A fully stateless design is safe; concurrent refreshes cannot break the chain.')
} else if (refreshed[newRefresh] === refreshToken) {
  console.log('  ROTATION: no — the same refresh token was returned.')
  console.log('  => A fully stateless design is safe; concurrent refreshes cannot break the chain.')
} else {
  console.log('  ROTATION: YES — a different refresh token was issued.')
  console.log('  => Each refresh invalidates the previous token, so two concurrent refreshes can')
  console.log('     drop the chain unless the refresh token is held server-side.')

  // Is the old one really dead? That decides how severe the race is.
  const replay = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', client_id: cfg.clientId, refresh_token: refreshToken }),
  })
  console.log(
    `     Replaying the OLD refresh token: HTTP ${replay.status} ` +
      (replay.ok ? '(still accepted — grace period, race is survivable)' : '(rejected — race is fatal)'),
  )
}
console.log()
