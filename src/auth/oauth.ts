/**
 * The two upstream OAuth interactions: building the authorize URL, and
 * redeeming the pasted-back authorization code.
 */

import type { Config } from '../config.ts'
import { ApiError, RELOGIN_HINT } from '../errors.ts'

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
  expires_at?: string
  scope?: string
  /**
   * dd-cli does not use one, but DoorDash returns it regardless: an opaque
   * 36-char value, rotated on every use with the previous one rejected
   * immediately.
   */
  refresh_token?: string
  [k: string]: unknown
}

export function buildAuthorizeUrl(
  cfg: Config,
  params: { state: string; codeChallenge: string; redirectUri: string },
): string {
  const url = new URL('/authorize', cfg.identityBase)
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    scope: cfg.scope,
    redirect_uri: params.redirectUri,
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
  }).toString()
  return url.toString()
}

/**
 * Pull `code`/`state` out of whatever the user pasted.
 *
 * The browser lands on a dead loopback URL, so the user copies it straight from
 * the address bar — meaning we should be forgiving about what arrives, but
 * strict about what we accept out of it.
 */
export function parseCallbackUrl(raw: string): { code: string; state: string } {
  const trimmed = raw.trim()
  if (trimmed === '') throw ApiError.badRequest('redirect_url is empty')

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    // A bare query string ("?code=...&state=...") is a plausible paste too.
    if (trimmed.startsWith('?') || trimmed.includes('=')) {
      const params = new URLSearchParams(trimmed.replace(/^\?/, ''))
      return readCallbackParams(params)
    }
    throw ApiError.badRequest(
      'redirect_url is not a URL. Paste the full address your browser landed on, ' +
        'e.g. http://localhost:4180/oauth2/callback?code=...&state=...',
    )
  }

  // Some browsers surface OAuth errors in the fragment rather than the query.
  const params = new URLSearchParams(url.search)
  if (url.hash.length > 1) {
    for (const [k, v] of new URLSearchParams(url.hash.slice(1))) {
      if (!params.has(k)) params.append(k, v)
    }
  }
  return readCallbackParams(params)
}

function readCallbackParams(params: URLSearchParams): { code: string; state: string } {
  const error = params.get('error')
  if (error) {
    throw new ApiError(400, 'authorization_denied', 'DoorDash refused the authorization request.', {
      oauth_error: error,
      oauth_error_description: params.get('error_description') ?? undefined,
    })
  }

  const code = params.get('code')
  const state = params.get('state')
  if (!code) {
    throw ApiError.badRequest(
      'No `code` in the pasted URL. Make sure you copied the whole address including the query string.',
    )
  }
  if (!state) {
    throw ApiError.badRequest('No `state` in the pasted URL. Copy the whole address including the query string.')
  }
  return { code, state }
}

export async function exchangeCodeForToken(
  cfg: Config,
  params: { code: string; redirectUri: string; codeVerifier: string },
): Promise<TokenResponse> {
  const url = `${cfg.tokenBase}/identity-bff/v1/oauth2/token`

  const { response, body } = await postTokenEndpoint(cfg, url, {
    grant_type: 'authorization_code',
    client_id: cfg.clientId,
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  })

  if (!response.ok) {
    const err = body as { error?: string; error_description?: string }
    throw new ApiError(400, 'token_exchange_failed', 'DoorDash rejected the authorization code.', {
      status: response.status,
      oauth_error: err.error,
      oauth_error_description: err.error_description,
      // The single most common cause, and not obvious from DoorDash's message.
      hint:
        err.error === 'invalid_grant'
          ? 'Authorization codes are single-use and short-lived. Start a new login and paste a fresh URL.'
          : undefined,
    })
  }

  return assertToken(body)
}

/**
 * Redeem a refresh token for a fresh access token.
 *
 * DoorDash rotates: the response carries a NEW refresh token and the one just
 * used is rejected from that moment on. Callers must persist the new value
 * before the old one is discarded, which is why this is only ever driven from
 * the session store rather than from a client-held credential.
 *
 * A rejection here is terminal — the chain is broken and only a browser login
 * can restore it — so it surfaces as 401 rather than a retryable 5xx.
 */
export async function refreshAccessToken(cfg: Config, refreshToken: string): Promise<TokenResponse> {
  const { response, body } = await postTokenEndpoint(cfg, `${cfg.tokenBase}/identity-bff/v1/oauth2/token`, {
    grant_type: 'refresh_token',
    client_id: cfg.clientId,
    refresh_token: refreshToken,
  })

  if (!response.ok) {
    const err = body as { error?: string; error_description?: string }
    throw new ApiError(401, 'session_expired', 'DoorDash refused to renew this session; a new login is required.', {
      status: response.status,
      oauth_error: err.error,
      oauth_error_description: err.error_description,
      ...RELOGIN_HINT,
    })
  }

  return assertToken(body)
}

async function postTokenEndpoint(
  cfg: Config,
  url: string,
  payload: Record<string, string>,
): Promise<{ response: Response; body: unknown }> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(cfg.upstreamTimeoutMs),
    })
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'TimeoutError') {
      throw new ApiError(504, 'upstream_timeout', 'DoorDash Identity did not respond in time.')
    }
    throw new ApiError(502, 'upstream_error', 'Could not reach DoorDash Identity.', {
      cause: cause instanceof Error ? cause.message : String(cause),
    })
  }

  const raw = await response.text()
  try {
    return { response, body: raw === '' ? {} : JSON.parse(raw) }
  } catch {
    throw new ApiError(502, 'upstream_error', 'DoorDash Identity returned a non-JSON token response.', {
      status: response.status,
    })
  }
}

function assertToken(body: unknown): TokenResponse {
  const token = body as TokenResponse
  if (typeof token.access_token !== 'string' || token.access_token === '') {
    throw new ApiError(502, 'upstream_error', 'Token response contained no access_token.')
  }
  return token
}

/**
 * Absolute expiry (epoch seconds) for an access token.
 *
 * `expires_in` wins over `expires_at` because it is immune to clock skew
 * between us and DoorDash. Measured against the live API this is 259200s (72h),
 * after which the session store silently refreshes.
 */
export function resolveTokenExpiry(token: TokenResponse, assumedTtlSeconds: number): number {
  const now = Math.floor(Date.now() / 1000)
  if (typeof token.expires_in === 'number' && Number.isFinite(token.expires_in) && token.expires_in > 0) {
    return now + Math.floor(token.expires_in)
  }
  if (typeof token.expires_at === 'string') {
    const parsed = Date.parse(token.expires_at)
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000)
  }
  return now + assumedTtlSeconds
}
