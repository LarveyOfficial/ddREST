/**
 * The paste-back OAuth flow.
 *
 * DoorDash only accepts loopback redirect URIs, so a server-hosted API can
 * never receive the callback. Instead:
 *
 *   1. POST /v1/auth/login/start     -> authorize_url + a sealed login_ticket
 *   2. user opens authorize_url, logs in, and lands on a dead
 *      http://localhost:4180/... URL ("connection refused" is expected)
 *   3. POST /v1/auth/login/complete  -> paste that URL back; we redeem the code
 *
 * Nothing about the pending login is stored server-side: the PKCE verifier and
 * the expected `state` travel with the client inside the sealed ticket.
 */

import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { ApiError } from '../errors.ts'
import type { AppEnv } from '../types.ts'
import { deriveCodeChallenge, generateCodeVerifier, generateState } from '../auth/pkce.ts'
import { buildAuthorizeUrl, exchangeCodeForToken, parseCallbackUrl } from '../auth/oauth.ts'
import { LOGIN_TICKET_PREFIX } from '../auth/tokens.ts'
import { SESSION_PREFIX } from '../session/store.ts'
import { sessionMiddleware } from '../auth/middleware.ts'
import { ErrorSchema, security } from './shared.ts'
import type { Config } from '../config.ts'

const LoginStartResponse = z
  .object({
    authorize_url: z.url().meta({
      description: 'Open this in a browser. After login it redirects to a loopback URL that will not load.',
    }),
    login_ticket: z.string().meta({
      description: `Sealed pending-login credential (prefix "${LOGIN_TICKET_PREFIX}."). Hold it and send it back to /login/complete.`,
    }),
    redirect_uri: z.string(),
    expires_in: z.int().meta({ description: 'Seconds until the ticket expires.' }),
    instructions: z.string(),
  })
  .openapi('LoginStartResponse')

const LoginCompleteRequest = z
  .object({
    login_ticket: z.string().min(1).meta({ description: 'The ticket from /login/start.' }),
    redirect_url: z
      .string()
      .min(1)
      .optional()
      .meta({
        description:
          'The full URL the browser landed on, pasted verbatim — e.g. ' +
          'http://localhost:4180/oauth2/callback?code=...&state=...',
      }),
    code: z.string().min(1).optional().meta({
      description:
        'INSTEAD of redirect_url, for callers that have already parsed the callback themselves. ' +
        'Must be sent together with `state`. Ignored entirely if `redirect_url` is present — do not send both.',
    }),
    state: z.string().min(1).optional().meta({
      description: 'Required when using `code`. Ignored entirely if `redirect_url` is present.',
    }),
    set_cookie: z.boolean().optional().meta({
      description:
        'Whether to also send a Set-Cookie header. Defaults to true. This does NOT choose between cookie and ' +
        'bearer auth: `session_token` is returned in the body either way, and works as a bearer token regardless.',
    }),
  })
  .refine((v) => v.redirect_url !== undefined || (v.code !== undefined && v.state !== undefined), {
    message: 'Provide either `redirect_url`, or both `code` and `state`.',
  })
  .openapi('LoginCompleteRequest')

export const SessionResponse = z
  .object({
    session_token: z.string().meta({
      description:
        `Session credential (prefix "${SESSION_PREFIX}."). Send as Authorization: Bearer, or rely on the cookie. ` +
        'It stays valid across token renewals — you never need to replace it.',
    }),
    token_type: z.string(),
    expires_at: z.iso.datetime().meta({
      description: 'Hard end of the session. Reaching it requires a new browser login.',
    }),
    expires_in: z.int(),
    access_token_expires_at: z.iso.datetime().meta({
      description:
        'When the underlying DoorDash token expires and the server silently renews it. Informational — no ' +
        'client action is required.',
    }),
    renewable: z.boolean().meta({ description: 'False if DoorDash returned no refresh token for this session.' }),
    scope: z.string().optional(),
    cookie_set: z.boolean(),
  })
  .openapi('SessionResponse')

const SessionInfoResponse = z
  .object({
    authenticated: z.literal(true),
    expires_at: z.iso.datetime().meta({ description: 'Hard end of the session.' }),
    expires_in: z.int(),
    access_token_expires_at: z.iso.datetime(),
    renewable: z.boolean(),
    refreshed_this_request: z.boolean().meta({
      description: 'True if serving this request triggered a silent token renewal.',
    }),
    scope: z.string().optional(),
    transport: z.enum(['cookie', 'bearer']),
  })
  .openapi('SessionInfoResponse')

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
})

function sessionCookieOptions(cfg: Config, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: cfg.cookieSameSite,
    path: cfg.cookiePath,
    domain: cfg.cookieDomain,
    maxAge: maxAgeSeconds,
  } as const
}

export function registerAuthRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/auth/login/start',
      tags: ['Auth'],
      summary: 'Begin login and get the DoorDash authorization URL',
      description:
        'Generates PKCE parameters and returns the URL to open in a browser, plus a sealed ticket holding the ' +
        'pending login. Nothing is stored server-side. The browser will land on a loopback URL that fails to ' +
        'load — that is expected; copy it from the address bar and send it to /v1/auth/login/complete.',
      responses: {
        200: { description: 'Authorization URL and login ticket.', content: { 'application/json': { schema: LoginStartResponse } } },
      },
    }),
    (c) => {
      const cfg = c.get('config')
      const verifier = generateCodeVerifier()
      const state = generateState()

      const ticket = c.get('sealers').loginTicket.seal(
        { v: verifier, s: state, r: cfg.redirectUri },
        cfg.loginTicketTtlSeconds,
      )

      return c.json({
        authorize_url: buildAuthorizeUrl(cfg, {
          state,
          codeChallenge: deriveCodeChallenge(verifier),
          redirectUri: cfg.redirectUri,
        }),
        login_ticket: ticket,
        redirect_uri: cfg.redirectUri,
        expires_in: cfg.loginTicketTtlSeconds,
        instructions:
          `Open authorize_url in a browser and sign in. You will be redirected to ${cfg.redirectUri} ` +
          'and the page will fail to load — that is expected, nothing is listening there. Copy the full URL from ' +
          'the address bar and POST it as `redirect_url` to /v1/auth/login/complete together with this login_ticket.',
      })
    },
  )

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/auth/login/complete',
      tags: ['Auth'],
      summary: 'Finish login by pasting the loopback callback URL',
      description:
        'Verifies the pasted `state` against the sealed ticket, redeems the authorization code with the PKCE ' +
        'verifier, and returns a session credential.\n\n' +
        'The tokens are stored encrypted under a key that exists only inside the credential you receive, so the ' +
        'database alone decrypts to nothing. The session renews itself in the background and the credential never ' +
        'changes, so a successful login here is the last one needed until the session’s hard expiry.\n\n' +
        'Supply the callback **one way or the other**: either `redirect_url` (the whole URL, pasted verbatim) or ' +
        '`code` + `state` if you have already parsed it yourself. Do not send both — when `redirect_url` is ' +
        'present, `code` and `state` are ignored.',
      request: {
        body: {
          required: true,
          content: {
            'application/json': {
              schema: LoginCompleteRequest,
              // Without explicit examples Swagger UI fabricates a body containing every
              // optional field as the literal "string", which reads as though `code` and
              // `state` must be filled in alongside `redirect_url`. They must not.
              examples: {
                pastedUrl: {
                  summary: 'Paste the callback URL (normal case)',
                  value: {
                    login_ticket: 'ddl1.…',
                    redirect_url: 'http://localhost:4180/oauth2/callback?code=…&state=…',
                  },
                },
                parsedParams: {
                  summary: 'Already-parsed code and state',
                  value: { login_ticket: 'ddl1.…', code: '…', state: '…' },
                },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Session established.', content: { 'application/json': { schema: SessionResponse } } },
        400: errorResponse('Bad ticket, state mismatch, or DoorDash rejected the code.'),
        502: errorResponse('DoorDash Identity was unreachable or misbehaved.'),
        504: errorResponse('DoorDash Identity timed out.'),
      },
    }),
    async (c) => {
      const cfg = c.get('config')
      const body = c.req.valid('json')

      const ticket = c.get('sealers').loginTicket.unseal(body.login_ticket)
      if (!ticket.ok) {
        if (ticket.reason === 'expired') {
          throw new ApiError(
            400,
            'login_ticket_expired',
            `The login ticket expired (it is valid for ${cfg.loginTicketTtlSeconds}s). Start a new login.`,
            { login_start: '/v1/auth/login/start' },
          )
        }
        throw new ApiError(400, 'login_ticket_invalid', 'The login ticket could not be verified.', {
          reason: ticket.reason,
          login_start: '/v1/auth/login/start',
        })
      }

      const { code, state } = body.redirect_url
        ? parseCallbackUrl(body.redirect_url)
        : { code: body.code!, state: body.state! }

      if (!timingSafeEqualString(state, ticket.payload.s)) {
        throw new ApiError(
          400,
          'state_mismatch',
          'The `state` in the pasted URL does not match this login ticket. ' +
            'Make sure the URL came from the login you started with this ticket.',
        )
      }

      const token = await exchangeCodeForToken(cfg, {
        code,
        redirectUri: ticket.payload.r,
        codeVerifier: ticket.payload.v,
      })

      // The session outlives the access token: it stores the refresh token and
      // renews itself, so its deadline is our own ceiling, not DoorDash's 72h.
      const { credential, accessExpiresAt, absoluteExpiresAt } = c.get('sessions').create(token)
      const now = Math.floor(Date.now() / 1000)
      const expiresIn = Math.max(0, absoluteExpiresAt - now)

      const setCookieFlag = body.set_cookie ?? true
      if (setCookieFlag) {
        setCookie(c, cfg.cookieName, credential, sessionCookieOptions(cfg, expiresIn))
      }

      return c.json(
        {
          session_token: credential,
          token_type: token.token_type ?? 'Bearer',
          expires_at: new Date(absoluteExpiresAt * 1000).toISOString(),
          expires_in: expiresIn,
          access_token_expires_at: new Date(accessExpiresAt * 1000).toISOString(),
          renewable: Boolean(token.refresh_token),
          scope: token.scope,
          cookie_set: setCookieFlag,
        },
        200,
      )
    },
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/auth/session',
      tags: ['Auth'],
      summary: 'Inspect the current session',
      description: 'Reports whether the presented session is valid and when it expires. Never returns the DoorDash token.',
      security,
      middleware: [sessionMiddleware()] as const,
      responses: {
        200: { description: 'Session details.', content: { 'application/json': { schema: SessionInfoResponse } } },
        401: errorResponse('No valid session.'),
      },
    }),
    (c) => {
      const session = c.get('session')
      const now = Math.floor(Date.now() / 1000)
      return c.json(
        {
          authenticated: true as const,
          expires_at: new Date(session.absoluteExpiresAt * 1000).toISOString(),
          expires_in: Math.max(0, session.absoluteExpiresAt - now),
          access_token_expires_at: new Date(session.accessExpiresAt * 1000).toISOString(),
          renewable: true,
          refreshed_this_request: session.refreshed,
          scope: session.scope,
          transport: c.get('authTransport'),
        },
        200,
      )
    },
  )

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/auth/logout',
      tags: ['Auth'],
      summary: 'Revoke the session',
      description:
        'Deletes the session server-side and clears the cookie. This is real revocation: any copy of the session ' +
        'token stops working immediately, including one already taken elsewhere.',
      responses: {
        200: {
          description: 'Session revoked (or there was none to revoke).',
          content: {
            'application/json': {
              schema: z
                .object({
                  ok: z.literal(true),
                  revoked: z.boolean().meta({ description: 'False if no matching session existed.' }),
                })
                .openapi('LogoutResponse'),
            },
          },
        },
      },
    }),
    (c) => {
      const cfg = c.get('config')

      // Read the credential directly: logout must work even for a session that
      // is expired or otherwise unusable, which the auth middleware would reject.
      const header = c.req.header('authorization')?.replace(/^Bearer\s+/i, '').trim()
      const credential = header || getCookie(c, cfg.cookieName)
      const revoked = credential ? c.get('sessions').revoke(credential) : false

      deleteCookie(c, cfg.cookieName, {
        path: cfg.cookiePath,
        domain: cfg.cookieDomain,
        secure: cfg.cookieSecure,
        sameSite: cfg.cookieSameSite,
      })
      return c.json({ ok: true as const, revoked })
    },
  )
}

/** Constant-time compare so state verification leaks nothing by timing. */
function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
