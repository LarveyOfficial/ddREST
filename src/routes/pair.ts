/**
 * Device pairing — RFC 8628-shaped provisioning for clients with no browser.
 *
 * This sits *alongside* /v1/auth/login/start and /v1/auth/login/complete, which
 * are unchanged and remain the normal way in. Pairing exists for the case those
 * two cannot serve: a headless box, a TV, a terminal on a machine you would
 * rather not sign in from, where copying a long authorize URL out and a longer
 * callback URL back is the awkward part.
 *
 * Underneath it is the same paste-back exchange. See src/pairing/manager.ts for
 * the flow diagram and the security notes.
 */

import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { ApiError } from '../errors.ts'
import type { AppEnv } from '../types.ts'
import { deriveCodeChallenge, generateCodeVerifier, generateState } from '../auth/pkce.ts'
import { buildAuthorizeUrl, exchangeCodeForToken, parseCallbackUrl } from '../auth/oauth.ts'
import { PAIRING_TICKET_PREFIX } from '../auth/tokens.ts'
import { DEVICE_CODE_PREFIX } from '../pairing/store.ts'
import { formatUserCode } from '../pairing/codes.ts'
import { ErrorSchema } from './shared.ts'
import { SessionResponse } from './auth.ts'
import { renderApproval, renderCodeEntry, renderResult } from './pair-page.ts'

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
})

const PairRequestBody = z
  .object({
    device_label: z.string().min(1).max(64).optional().meta({
      description:
        'Free text shown to whoever approves the pairing, e.g. "Kitchen tablet". Purely advisory — anyone can ' +
        'claim any label, so it identifies a device you are expecting, it does not authenticate one.',
    }),
  })
  .openapi('PairRequest')

const PairRequestResponse = z
  .object({
    device_code: z.string().meta({
      description:
        `Secret held by the device (prefix "${DEVICE_CODE_PREFIX}."). Never display it — it is what collects the ` +
        'session. Send it to /v1/auth/pair/token to poll.',
    }),
    user_code: z.string().meta({ description: 'Short code to display, e.g. "BCDF-GHJK".' }),
    verification_uri: z.url().meta({ description: 'Where the human goes to type the code in.' }),
    verification_uri_complete: z.url().meta({
      description: 'Same page with the code prefilled — good for a QR code when the device has a screen.',
    }),
    expires_in: z.int().meta({ description: 'Seconds until the code stops being approvable.' }),
    interval: z.int().meta({ description: 'Minimum seconds between polls. Polling faster earns a `slow_down`.' }),
  })
  .openapi('PairRequestResponse')

const PairVerifyRequest = z
  .object({
    user_code: z.string().min(1).meta({ description: 'The code from the device. Case and hyphens do not matter.' }),
  })
  .openapi('PairVerifyRequest')

const PairVerifyResponse = z
  .object({
    authorize_url: z.url(),
    approval_ticket: z.string().meta({
      description: `Sealed pending approval (prefix "${PAIRING_TICKET_PREFIX}."). Send it back to /v1/auth/pair/complete.`,
    }),
    user_code: z.string(),
    device_label: z.string().optional(),
    redirect_uri: z.string(),
    expires_in: z.int(),
    instructions: z.string(),
  })
  .openapi('PairVerifyResponse')

const PairCompleteRequest = z
  .object({
    approval_ticket: z.string().min(1).meta({ description: 'The ticket from /v1/auth/pair/verify.' }),
    redirect_url: z.string().min(1).optional().meta({
      description: 'The full URL the browser landed on, pasted verbatim.',
    }),
    code: z.string().min(1).optional().meta({
      description: 'INSTEAD of redirect_url, if you parsed the callback yourself. Requires `state`.',
    }),
    state: z.string().min(1).optional().meta({ description: 'Required when using `code`.' }),
  })
  .refine((v) => v.redirect_url !== undefined || (v.code !== undefined && v.state !== undefined), {
    message: 'Provide either `redirect_url`, or both `code` and `state`.',
  })
  .openapi('PairCompleteRequest')

const PairCompleteResponse = z
  .object({
    ok: z.literal(true),
    user_code: z.string(),
    device_label: z.string().optional(),
    message: z.string(),
  })
  .openapi('PairCompleteResponse')

const PairDenyRequest = z
  .object({ approval_ticket: z.string().min(1) })
  .openapi('PairDenyRequest')

const PairTokenRequest = z
  .object({
    device_code: z.string().min(1),
    grant_type: z.string().optional().meta({
      description:
        'Accepted for RFC 8628 compatibility. When present it must be ' +
        '`urn:ietf:params:oauth:grant-type:device_code`; when absent that is assumed.',
    }),
  })
  .openapi('PairTokenRequest')

const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'

/**
 * Where to tell a device to send its human.
 *
 * Behind a reverse proxy the request URL is the internal hop, so it would print
 * an address nobody can reach. Host + X-Forwarded-Proto is right in that case,
 * and PUBLIC_BASE_URL overrides both when the proxy rewrites the path too.
 */
function publicBase(c: Context<AppEnv>): string {
  const cfg = c.get('config')
  if (cfg.publicBaseUrl) return cfg.publicBaseUrl

  const url = new URL(c.req.url)
  const host = c.req.header('host')
  if (!host) return url.origin
  const proto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() || url.protocol.replace(':', '')
  return `${proto}://${host}`
}

/** Step 2's shared core: validate the code and mint the browser's approval ticket. */
function beginApproval(c: Context<AppEnv>, rawUserCode: string) {
  const cfg = c.get('config')
  const record = c.get('pairings').lookup(rawUserCode)

  const verifier = generateCodeVerifier()
  const state = generateState()

  // Expires with the pairing rather than on its own clock, so the page and the
  // device never disagree about how long is left.
  const ticket = c.get('sealers').pairingTicket.sealUntil(
    { v: verifier, s: state, r: cfg.redirectUri, p: record.id, u: record.userCode },
    record.expiresAt,
  )

  return {
    record,
    ticket,
    authorizeUrl: buildAuthorizeUrl(cfg, {
      state,
      codeChallenge: deriveCodeChallenge(verifier),
      redirectUri: cfg.redirectUri,
    }),
    expiresIn: Math.max(0, record.expiresAt - Math.floor(Date.now() / 1000)),
  }
}

function openTicket(c: Context<AppEnv>, raw: string) {
  const opened = c.get('sealers').pairingTicket.unseal(raw)
  if (opened.ok) return opened.payload

  if (opened.reason === 'expired') {
    throw new ApiError(400, 'pairing_expired', 'This approval expired. Ask the device for a fresh code.')
  }
  throw new ApiError(400, 'pairing_ticket_invalid', 'This approval could not be verified. Start again.')
}

/** Step 3's shared core: redeem the code and attach the session to the pairing. */
async function finishApproval(
  c: Context<AppEnv>,
  input: { approval_ticket: string; redirect_url?: string; code?: string; state?: string },
) {
  const cfg = c.get('config')
  const ticket = openTicket(c, input.approval_ticket)

  const { code, state } = input.redirect_url
    ? parseCallbackUrl(input.redirect_url)
    : { code: input.code!, state: input.state! }

  if (!timingSafeEqualString(state, ticket.s)) {
    throw new ApiError(
      400,
      'state_mismatch',
      'The `state` in the pasted address does not match this approval. Make sure the address came from the ' +
        'sign-in you started on this page.',
    )
  }

  // Fail before spending the authorization code if the pairing has since gone
  // away: a session created here would have nowhere to go and would sit in the
  // database unreachable.
  const pairings = c.get('pairings')
  const pending = pairings.store.findById(ticket.p)
  if (!pending || pending.status !== 'pending') {
    throw new ApiError(
      409,
      'pairing_conflict',
      'That pairing is no longer waiting for approval — it expired, was denied, or was already approved.',
    )
  }

  const token = await exchangeCodeForToken(cfg, {
    code,
    redirectUri: ticket.r,
    codeVerifier: ticket.v,
  })

  const { credential } = c.get('sessions').create(token)

  try {
    pairings.approve(ticket.p, credential)
  } catch (err) {
    // The session is real but undeliverable, so do not leave it behind.
    c.get('sessions').revoke(credential)
    throw err
  }

  return { userCode: formatUserCode(ticket.u), deviceLabel: pending.deviceLabel }
}

export function registerPairingRoutes(app: OpenAPIHono<AppEnv>): void {
  // ---------------------------------------------------------------- device side

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/auth/pair/request',
      tags: ['Pairing'],
      summary: 'Ask for a pairing code (device side)',
      description:
        'Called by a device that cannot run a browser. Returns a short `user_code` to put on screen and a secret ' +
        '`device_code` to keep. Poll `/v1/auth/pair/token` with the device code until a human approves it.\n\n' +
        'This is RFC 8628 in shape, not a device grant against DoorDash — DoorDash Identity does not implement ' +
        'one. A human still performs the ordinary paste-back login in a real browser; this only routes the ' +
        'resulting session back to the device.',
      request: {
        body: {
          required: false,
          content: {
            'application/json': {
              schema: PairRequestBody,
              // Without these Swagger UI invents {"device_label": "string"},
              // which reads as though the field were required.
              examples: {
                labelled: { summary: 'Name the device so the approver knows what it is', value: { device_label: 'Kitchen tablet' } },
                anonymous: { summary: 'No label', value: {} },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Pairing started.', content: { 'application/json': { schema: PairRequestResponse } } },
        403: errorResponse('Pairing is disabled on this server.'),
        429: errorResponse('Too many pairings are already awaiting approval.'),
      },
    }),
    (c) => {
      const body = c.req.valid('json') ?? {}
      const pairing = c.get('pairings').request(body.device_label)

      const base = publicBase(c)
      const verificationUri = `${base}/v1/auth/pair`

      return c.json(
        {
          device_code: pairing.deviceCode,
          user_code: pairing.userCode,
          verification_uri: verificationUri,
          verification_uri_complete: `${verificationUri}?user_code=${encodeURIComponent(pairing.userCode)}`,
          expires_in: Math.max(0, pairing.expiresAt - Math.floor(Date.now() / 1000)),
          interval: pairing.interval,
        },
        200,
      )
    },
  )

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/auth/pair/token',
      tags: ['Pairing'],
      summary: 'Poll for the session (device side)',
      description:
        'Poll no faster than the `interval` from /v1/auth/pair/request. Until a human acts this returns HTTP 400 ' +
        'with an RFC 8628 error code:\n\n' +
        '- `authorization_pending` — nobody has approved yet. Keep polling.\n' +
        '- `slow_down` — you polled too fast. The `interval` field carries the new minimum.\n' +
        '- `access_denied` — a human refused. Stop.\n' +
        '- `expired_token` — the code expired unapproved. Start over.\n' +
        '- `invalid_grant` — unrecognised device code, or the session was already collected. Stop.\n\n' +
        'On success the session credential is returned **once** and the pairing is deleted. Store it; a second ' +
        'poll gets `invalid_grant`. No cookie is set — this endpoint is for non-browser clients.',
      request: {
        body: {
          required: true,
          content: {
            'application/json': {
              schema: PairTokenRequest,
              // `grant_type` is optional here, but Swagger UI would prefill it
              // as the literal "string" and every poll would 400.
              examples: {
                poll: {
                  summary: 'Poll (normal case — grant_type is not needed)',
                  value: { device_code: 'ddp1.…' },
                },
                rfcClient: {
                  summary: 'With the RFC 8628 grant_type, for stock device-flow clients',
                  value: { device_code: 'ddp1.…', grant_type: DEVICE_CODE_GRANT },
                },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Approved; session issued.', content: { 'application/json': { schema: SessionResponse } } },
        400: errorResponse('Not ready, refused, expired, or an unknown device code — see the `error` field.'),
        403: errorResponse('Pairing is disabled on this server.'),
      },
    }),
    (c) => {
      const body = c.req.valid('json')
      if (body.grant_type && body.grant_type !== DEVICE_CODE_GRANT) {
        throw new ApiError(400, 'invalid_request', `grant_type must be "${DEVICE_CODE_GRANT}".`)
      }

      const { credential } = c.get('pairings').claim(body.device_code)

      // Read the session back for its real deadlines rather than recomputing
      // them, so the device is told exactly what the store will enforce.
      const loaded = c.get('sessions').store.load(credential)
      if (!loaded.ok) {
        throw new ApiError(
          400,
          'expired_token',
          'The approved session no longer exists. Start a new pairing.',
          { error_description: 'The approved session no longer exists. Start a new pairing.' },
        )
      }

      const record = loaded.record
      const now = Math.floor(Date.now() / 1000)

      return c.json(
        {
          session_token: credential,
          token_type: record.tt,
          expires_at: new Date(record.absoluteExpiresAt * 1000).toISOString(),
          expires_in: Math.max(0, record.absoluteExpiresAt - now),
          access_token_expires_at: new Date(record.accessExpiresAt * 1000).toISOString(),
          renewable: Boolean(record.rt),
          scope: record.sc,
          cookie_set: false,
        },
        200,
      )
    },
  )

  // ---------------------------------------------------------------- human side

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/auth/pair/verify',
      tags: ['Pairing'],
      summary: 'Look up a pairing code and get the authorization URL',
      description:
        'The JSON equivalent of the first step of the /v1/auth/pair page. Confirms a code refers to a device that ' +
        'is genuinely waiting, and returns the DoorDash authorize URL plus a sealed approval ticket.',
      request: {
        body: {
          required: true,
          content: {
            'application/json': {
              schema: PairVerifyRequest,
              examples: {
                typed: { summary: 'The code as it appears on the device', value: { user_code: 'BCDF-GHJK' } },
                messy: { summary: 'Case and hyphens do not matter', value: { user_code: 'bcdf ghjk' } },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Code recognised.', content: { 'application/json': { schema: PairVerifyResponse } } },
        400: errorResponse('Not a well-formed pairing code.'),
        403: errorResponse('Pairing is disabled on this server.'),
        404: errorResponse('No device is waiting with that code.'),
        409: errorResponse('That code was already approved or denied.'),
        410: errorResponse('That code expired.'),
        429: errorResponse('Too many incorrect codes submitted.'),
      },
    }),
    (c) => {
      const cfg = c.get('config')
      const { record, ticket, authorizeUrl, expiresIn } = beginApproval(c, c.req.valid('json').user_code)

      return c.json(
        {
          authorize_url: authorizeUrl,
          approval_ticket: ticket,
          user_code: formatUserCode(record.userCode),
          device_label: record.deviceLabel,
          redirect_uri: cfg.redirectUri,
          expires_in: expiresIn,
          instructions:
            `Open authorize_url and sign in. The browser lands on ${cfg.redirectUri} and fails to load — that is ` +
            'expected. Copy the whole address and POST it as `redirect_url` to /v1/auth/pair/complete with this ' +
            'approval_ticket. The session goes to the waiting device, not to you.',
        },
        200,
      )
    },
  )

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/auth/pair/complete',
      tags: ['Pairing'],
      summary: 'Approve the device by pasting the callback URL',
      description:
        'Redeems the authorization code and hands the resulting session to the waiting device.\n\n' +
        '**The session is not returned to you.** That is the difference from /v1/auth/login/complete: the caller ' +
        'here is approving access for someone else. Use /v1/auth/login/complete if you want a session for ' +
        'yourself.',
      request: {
        body: {
          required: true,
          content: {
            'application/json': {
              schema: PairCompleteRequest,
              // Same either/or as /v1/auth/login/complete: `redirect_url` and
              // `code`+`state` are alternatives, and a fabricated body showing
              // all three suggests they are sent together. They must not be.
              examples: {
                pastedUrl: {
                  summary: 'Paste the callback URL (normal case)',
                  value: {
                    approval_ticket: 'ddpa.…',
                    redirect_url: 'http://localhost:4180/oauth2/callback?code=…&state=…',
                  },
                },
                parsedParams: {
                  summary: 'Already-parsed code and state',
                  value: { approval_ticket: 'ddpa.…', code: '…', state: '…' },
                },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Device approved.', content: { 'application/json': { schema: PairCompleteResponse } } },
        400: errorResponse('Bad ticket, state mismatch, or DoorDash rejected the code.'),
        409: errorResponse('The pairing is no longer waiting for approval.'),
        502: errorResponse('DoorDash Identity was unreachable or misbehaved.'),
        504: errorResponse('DoorDash Identity timed out.'),
      },
    }),
    async (c) => {
      const result = await finishApproval(c, c.req.valid('json'))
      return c.json(
        {
          ok: true as const,
          user_code: result.userCode,
          device_label: result.deviceLabel,
          message: 'The device has been approved and will pick up its session on its next poll.',
        },
        200,
      )
    },
  )

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/auth/pair/deny',
      tags: ['Pairing'],
      summary: 'Refuse a pairing',
      description:
        'Rejects a pairing you were asked to approve but did not start. The device is told `access_denied` on its ' +
        'next poll instead of being left to time out.',
      request: {
        body: {
          required: true,
          content: {
            'application/json': {
              schema: PairDenyRequest,
              examples: {
                deny: { summary: 'Refuse the pairing', value: { approval_ticket: 'ddpa.…' } },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Pairing denied.',
          content: {
            'application/json': {
              schema: z.object({ ok: z.literal(true) }).openapi('PairDenyResponse'),
            },
          },
        },
        400: errorResponse('Bad or expired approval ticket.'),
      },
    }),
    (c) => {
      const ticket = openTicket(c, c.req.valid('json').approval_ticket)
      c.get('pairings').deny(ticket.p)
      return c.json({ ok: true as const }, 200)
    },
  )

  registerPairingPages(app)
}

/**
 * The browser UI. Plain routes rather than app.openapi: these serve HTML, and
 * putting them in the API document would only invite Swagger UI to "try" them.
 * They call the same helpers the JSON endpoints do.
 */
function registerPairingPages(app: OpenAPIHono<AppEnv>): void {
  app.get('/v1/auth/pair', (c) => {
    const cfg = c.get('config')
    if (!cfg.pairingEnabled) {
      return c.html(
        renderResult({ kind: 'error', message: 'Device pairing is turned off on this server.' }),
        403,
      )
    }
    // Prefilled by verification_uri_complete, so a QR code lands here ready to go.
    return c.html(renderCodeEntry({ userCode: c.req.query('user_code') }))
  })

  app.post('/v1/auth/pair', async (c) => {
    const form = await c.req.parseBody()
    const field = (name: string): string | undefined => {
      const v = form[name]
      return typeof v === 'string' && v.trim() !== '' ? v : undefined
    }

    const approvalTicket = field('approval_ticket')

    // Deny is checked before anything else so it works even with the paste
    // field left empty.
    if (approvalTicket && field('action') === 'deny') {
      try {
        c.get('pairings').deny(openTicket(c, approvalTicket).p)
        return c.html(renderResult({ kind: 'denied', message: 'The device was refused and gets no access.' }))
      } catch (err) {
        return c.html(renderResult({ kind: 'error', message: messageFor(err) }), statusFor(err))
      }
    }

    if (approvalTicket) {
      const redirectUrl = field('redirect_url')
      try {
        if (!redirectUrl) throw new ApiError(400, 'invalid_request', 'Paste the address the browser landed on.')
        const result = await finishApproval(c, { approval_ticket: approvalTicket, redirect_url: redirectUrl })
        return c.html(
          renderResult({
            kind: 'approved',
            message: `${result.deviceLabel ?? 'The device'} (code ${result.userCode}) now has access to your DoorDash account through ddREST.`,
          }),
        )
      } catch (err) {
        // Re-render the same step with the error rather than dumping the user
        // on a dead end — the ticket is usually still good for another attempt.
        const opened = c.get('sealers').pairingTicket.unseal(approvalTicket)
        if (opened.ok) {
          const cfg = c.get('config')
          const record = c.get('pairings').store.findById(opened.payload.p)
          if (record && record.status === 'pending' && record.expiresAt > Math.floor(Date.now() / 1000)) {
            return c.html(
              renderApproval({
                userCode: formatUserCode(opened.payload.u),
                deviceLabel: record.deviceLabel,
                authorizeUrl: buildAuthorizeUrl(cfg, {
                  state: opened.payload.s,
                  codeChallenge: deriveCodeChallenge(opened.payload.v),
                  redirectUri: cfg.redirectUri,
                }),
                ticket: approvalTicket,
                redirectUri: cfg.redirectUri,
                expiresInSeconds: record.expiresAt - Math.floor(Date.now() / 1000),
                error: messageFor(err),
              }),
              statusFor(err),
            )
          }
        }
        return c.html(renderResult({ kind: 'error', message: messageFor(err) }), statusFor(err))
      }
    }

    const userCode = field('user_code')
    try {
      if (!userCode) throw new ApiError(400, 'invalid_request', 'Enter the code shown on the device.')
      const cfg = c.get('config')
      const { record, ticket, authorizeUrl, expiresIn } = beginApproval(c, userCode)
      return c.html(
        renderApproval({
          userCode: formatUserCode(record.userCode),
          deviceLabel: record.deviceLabel,
          authorizeUrl,
          ticket,
          redirectUri: cfg.redirectUri,
          expiresInSeconds: expiresIn,
        }),
      )
    } catch (err) {
      return c.html(renderCodeEntry({ userCode, error: messageFor(err) }), statusFor(err))
    }
  })
}

function messageFor(err: unknown): string {
  if (err instanceof ApiError) return err.message
  console.error('Pairing page error:', err)
  return 'Something went wrong completing the pairing. Try again.'
}

/** Hono's html() wants a literal status union; ApiError statuses are all in range. */
function statusFor(err: unknown): 400 {
  return (err instanceof ApiError ? err.status : 400) as 400
}

/** Constant-time compare so state verification leaks nothing by timing. */
function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
