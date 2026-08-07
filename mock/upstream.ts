/**
 * A stand-in for DoorDash Identity, the token gateway and the MCP gateway.
 *
 * It exists because the real flow cannot be exercised without a DoorDash
 * account in the consumer MCP private beta. The mock enforces the parts that
 * are easy to get subtly wrong — PKCE S256 verification, single-use codes,
 * redirect_uri consistency between /authorize and the token exchange, bearer
 * auth, and an SSE-framed JSON-RPC reply.
 *
 * Run standalone:  bun run mock
 * Use in tests:    startMockUpstream()
 */

import { createHash } from 'node:crypto'
import { TOOLS } from '../src/mcp/tools.ts'

/** What the mock gateway claims to offer when asked via tools/list. */
const advertisedTools: string[] = Object.values(TOOLS)

interface PendingCode {
  challenge: string
  redirectUri: string
  scope: string
  used: boolean
}

export interface MockUpstream {
  url: string
  port: number
  /** Tool calls seen, in order — assertions read this. */
  calls: { tool: string; args: Record<string, unknown>; authorization: string | null }[]
  /** Next tool result. Defaults to an echo of the arguments. */
  setToolResult(fn: (tool: string, args: Record<string, unknown>) => unknown): void
  /** Force the next MCP response to a given status/body. */
  setToolFailure(failure: { status: number; body: unknown; headers?: Record<string, string> } | undefined): void
  /** Replace the whole JSON-RPC envelope, to exercise error and isError paths. */
  setEnvelope(fn: ((tool: string, id: number) => unknown) | undefined): void
  /** Reply as plain JSON instead of SSE, to exercise both transports. */
  setPlainJson(enabled: boolean): void
  /** Seconds until issued access tokens expire. Lower it to force a refresh. */
  setAccessTokenTtl(seconds: number): void
  /** Force the refresh grant to fail, simulating a broken token chain. */
  setRefreshFailure(failure: { status: number; body: unknown } | undefined): void
  /** How many times the refresh grant has been called. */
  refreshAttempts(): number
  /** The access token currently considered valid — rotates on every issue. */
  readonly accessToken: string
  stop(): void
}

const b64url = (b: Buffer) => b.toString('base64url')

export function startMockUpstream(port = 0): MockUpstream {
  const codes = new Map<string, PendingCode>()
  const calls: MockUpstream['calls'] = []

  // Both token kinds rotate, exactly as the real endpoint does.
  const refreshTokens = new Map<string, { scope: string; spent: boolean }>()
  let currentAccess = ''
  let issued = 0
  let refreshAttempts = 0
  let refreshFailure: { status: number; body: unknown } | undefined
  let accessTokenTtl = 259_200

  function issueTokens(scope: string) {
    issued++
    currentAccess = `mock-access-${issued}`
    const refresh = `mock-refresh-${issued}`
    refreshTokens.set(refresh, { scope, spent: false })
    return {
      access_token: currentAccess,
      token_type: 'Bearer',
      expires_in: accessTokenTtl,
      refresh_token: refresh,
      ...(scope ? { scope } : {}),
    }
  }

  let toolResult: (tool: string, args: Record<string, unknown>) => unknown = (tool, args) => ({
    tool,
    echoed_arguments: args,
  })
  let toolFailure: { status: number; body: unknown; headers?: Record<string, string> } | undefined
  let envelopeOverride: ((tool: string, id: number) => unknown) | undefined
  let plainJson = false
  let codeCounter = 0

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port,
    async fetch(req) {
      const url = new URL(req.url)

      // --- Identity: /authorize -------------------------------------------
      if (req.method === 'GET' && url.pathname === '/authorize') {
        const q = url.searchParams
        const redirectUri = q.get('redirect_uri')
        const state = q.get('state')
        const challenge = q.get('code_challenge')

        if (!redirectUri || !state || !challenge) return json(400, { error: 'invalid_request' })
        if (q.get('code_challenge_method') !== 'S256') return json(400, { error: 'invalid_request' })
        if (q.get('response_type') !== 'code') return json(400, { error: 'unsupported_response_type' })

        const code = `mock-code-${++codeCounter}`
        codes.set(code, { challenge, redirectUri, scope: q.get('scope') ?? '', used: false })

        const location = new URL(redirectUri)
        location.searchParams.set('code', code)
        location.searchParams.set('state', state)
        return new Response(null, { status: 302, headers: { location: location.toString() } })
      }

      // --- Token endpoint: both grants --------------------------------------
      if (req.method === 'POST' && url.pathname === '/identity-bff/v1/oauth2/token') {
        const body = (await req.json()) as Record<string, string>

        if (body.grant_type === 'authorization_code') {
          const pending = body.code ? codes.get(body.code) : undefined
          if (!pending || pending.used) {
            return json(400, { error: 'invalid_grant', error_description: 'Unknown or already-used code.' })
          }
          if (body.redirect_uri !== pending.redirectUri) {
            return json(400, { error: 'invalid_grant', error_description: 'redirect_uri mismatch.' })
          }
          const verifier = body.code_verifier ?? ''
          if (b64url(createHash('sha256').update(verifier, 'ascii').digest()) !== pending.challenge) {
            return json(400, { error: 'invalid_grant', error_description: 'PKCE verification failed.' })
          }

          pending.used = true
          return json(200, issueTokens(pending.scope))
        }

        // Mirrors the measured behaviour of the real endpoint: a NEW refresh
        // token every time, and the previous one rejected with 401 from that
        // instant. Tests depend on that being faithful — a forgiving mock would
        // hide exactly the bug this design exists to prevent.
        if (body.grant_type === 'refresh_token') {
          refreshAttempts++
          if (refreshFailure) return json(refreshFailure.status, refreshFailure.body)

          const live = body.refresh_token ? refreshTokens.get(body.refresh_token) : undefined
          if (!live || live.spent) {
            return json(401, { error: 'invalid_grant', error_description: 'Refresh token is spent or unknown.' })
          }
          live.spent = true
          return json(200, issueTokens(live.scope))
        }

        return json(400, { error: 'unsupported_grant_type' })
      }

      // --- MCP gateway ------------------------------------------------------
      if (req.method === 'POST' && url.pathname === '/mcp/consumer') {
        const authorization = req.headers.get('authorization')
        if (authorization !== `Bearer ${currentAccess}`) {
          return json(401, { error: 'The user is unauthorized.' })
        }
        if (toolFailure) return json(toolFailure.status, toolFailure.body, toolFailure.headers)

        const body = (await req.json()) as {
          method?: string
          id?: number
          params?: { name?: string; arguments?: Record<string, unknown> }
        }
        // The real gateway implements MCP's tools/list; mirror it so clients
        // that enumerate before calling behave the same here.
        if (body.method === 'tools/list') {
          const envelope = {
            jsonrpc: '2.0',
            id: body.id ?? 1,
            result: {
              tools: advertisedTools.map((name) => ({
                name,
                description: `Mock description for ${name}.`,
                inputSchema: { type: 'object', properties: { intent: { type: 'string' } }, required: ['intent'] },
              })),
            },
          }
          if (plainJson) return json(200, envelope)
          return new Response(`event: message\ndata: ${JSON.stringify(envelope)}\n\n`, {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          })
        }

        const tool = body.params?.name ?? ''
        const args = body.params?.arguments ?? {}
        calls.push({ tool, args, authorization })

        const id = body.id ?? 1
        const structured = toolResult(tool, args)
        const envelope = envelopeOverride
          ? envelopeOverride(tool, id)
          : {
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: JSON.stringify(structured) }],
                structuredContent: structured,
              },
            }

        if (plainJson) return json(200, envelope)
        return new Response(`event: message\ndata: ${JSON.stringify(envelope)}\n\n`, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      }

      return json(404, { error: 'not_found' })
    },
  })

  const boundPort = server.port
  if (boundPort === undefined) throw new Error('mock upstream did not bind a TCP port')

  return {
    url: `http://127.0.0.1:${boundPort}`,
    port: boundPort,
    calls,
    get accessToken() {
      return currentAccess
    },
    setAccessTokenTtl(seconds) {
      accessTokenTtl = seconds
    },
    setRefreshFailure(failure) {
      refreshFailure = failure
    },
    refreshAttempts() {
      return refreshAttempts
    },
    setToolResult(fn) {
      toolResult = fn
    },
    setToolFailure(failure) {
      toolFailure = failure
    },
    setEnvelope(fn) {
      envelopeOverride = fn
    },
    setPlainJson(enabled) {
      plainJson = enabled
    },
    stop() {
      server.stop(true)
    },
  }
}

function json(status: number, body: unknown, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  })
}

if (import.meta.main) {
  const mock = startMockUpstream(Number(process.env.MOCK_PORT ?? 8788))
  console.log(`mock DoorDash upstream on ${mock.url}`)
  console.log('  point the API at it with:')
  console.log(`    DD_IDENTITY_BASE=${mock.url} DD_TOKEN_BASE=${mock.url} DD_MCP_BASE=${mock.url} bun run dev`)
}
