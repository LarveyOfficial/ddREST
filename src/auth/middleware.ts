/**
 * Session extraction, and the CSRF defence that goes with cookie auth.
 *
 * A session may arrive two ways:
 *   - `Cookie: dd_session=dds1....`      (browser)
 *   - `Authorization: Bearer dds1....`   (CLI, scripts, other services)
 *
 * The bearer form needs no CSRF protection: a cross-site page cannot set an
 * Authorization header without a CORS preflight it will not pass. The cookie
 * form does, because the browser attaches it automatically — so for cookie-auth
 * requests that change state we require an `Origin` we trust. Browsers send
 * Origin on every non-GET, including same-origin ones, so this is a complete
 * check rather than a heuristic.
 */

import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { ApiError, RELOGIN_HINT } from '../errors.ts'
import type { AppEnv, AuthTransport } from '../types.ts'
import { LEGACY_SESSION_PREFIX } from './tokens.ts'
import { SESSION_PREFIX } from '../session/store.ts'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1]?.trim() || undefined
}

/**
 * The API's own origin(s), so a same-origin UI works with no configuration.
 *
 * Two candidates, because neither alone is sufficient: the request URL is right
 * for a directly-exposed server, while the Host header (with X-Forwarded-Proto)
 * is what matches the browser's Origin behind a TLS-terminating proxy, where
 * the request URL reflects the internal hop instead. Set TRUSTED_ORIGINS to pin
 * this explicitly rather than inferring it.
 */
function selfOrigins(req: Request): string[] {
  const url = new URL(req.url)
  const origins = [url.origin]

  const host = req.headers.get('host')
  if (host) {
    const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || url.protocol.replace(':', '')
    origins.push(`${proto}://${host}`)
  }
  return origins
}

export function sessionMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    // Overlapping registrations (e.g. '/v1/addresses' and '/v1/addresses/*')
    // can both match one request. Resolving twice would mean a second store
    // read and, inside the refresh window, a second token rotation — so make
    // this idempotent rather than relying on the route table never overlapping.
    if (c.get('session')) return next()

    const cfg = c.get('config')

    const headerToken = bearerToken(c.req.header('authorization'))
    const cookieToken = getCookie(c, cfg.cookieName)

    let raw: string | undefined
    let transport: AuthTransport

    if (headerToken) {
      raw = headerToken
      transport = 'bearer'
    } else if (cookieToken) {
      raw = cookieToken
      transport = 'cookie'
    } else {
      throw new ApiError(
        401,
        'session_missing',
        `No session. Send the ${cfg.cookieName} cookie, or Authorization: Bearer <${SESSION_PREFIX}...>.`,
        RELOGIN_HINT,
      )
    }

    // Sessions issued before refresh support was added are no longer usable.
    if (raw.startsWith(`${LEGACY_SESSION_PREFIX}.`)) {
      throw new ApiError(
        401,
        'session_invalid',
        'This session predates auto-renewal and is no longer valid. Log in again to get a renewable session.',
        RELOGIN_HINT,
      )
    }

    // A raw DoorDash token is a common mix-up and produces a baffling
    // authentication failure otherwise, so name it explicitly.
    if (!raw.startsWith(`${SESSION_PREFIX}.`)) {
      throw new ApiError(
        401,
        'session_invalid',
        `Expected a session token beginning with "${SESSION_PREFIX}.". ` +
          'This API does not accept a raw DoorDash access token; complete /v1/auth/login/complete to get a session.',
        RELOGIN_HINT,
      )
    }

    if (transport === 'cookie' && !SAFE_METHODS.has(c.req.method)) {
      assertTrustedOrigin(c.req.raw, cfg.corsOrigins, cfg.trustedOrigins)
    }

    // Renews silently if the access token is close to expiry; the credential
    // the client holds is unaffected either way.
    const session = await c.get('sessions').resolve(raw)

    c.set('session', session)
    c.set('accessToken', session.accessToken)
    c.set('authTransport', transport)
    await next()
  }
}

function assertTrustedOrigin(req: Request, corsOrigins: string[], trustedOrigins: string[]): void {
  const origin = req.headers.get('origin')
  if (!origin) {
    throw new ApiError(
      403,
      'csrf_origin_rejected',
      'Cookie-authenticated write requests must carry an Origin header. ' +
        'Use Authorization: Bearer instead for non-browser clients.',
    )
  }

  const allowed = new Set<string>([...corsOrigins, ...trustedOrigins, ...selfOrigins(req)])

  if (!allowed.has(origin)) {
    throw new ApiError(403, 'csrf_origin_rejected', `Origin ${origin} is not allowed to use cookie authentication.`)
  }
}
