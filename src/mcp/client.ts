/**
 * The one upstream call everything funnels through.
 *
 * Every tool is `POST /mcp/consumer` with a JSON-RPC 2.0 `tools/call` body, and
 * the reply is Server-Sent Events whose first `data:` line is the JSON-RPC
 * envelope. This module is the only place that knows any of that; routes just
 * ask for a tool by name and get plain JSON back.
 */

import type { Config } from '../config.ts'
import { ApiError } from '../errors.ts'
import { RELOGIN_HINT } from '../errors.ts'

export interface JsonRpcError {
  code?: number
  message?: string
  data?: unknown
}

export interface McpContentBlock {
  type?: string
  text?: string
}

export interface McpToolResult {
  content?: McpContentBlock[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

export interface JsonRpcEnvelope {
  jsonrpc?: string
  id?: number
  result?: McpToolResult
  error?: JsonRpcError
}

export class McpClient {
  #cfg: Config
  #nextId = 1

  constructor(cfg: Config) {
    this.#cfg = cfg
  }

  async callTool(
    accessToken: string,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const envelope = await this.#post(accessToken, {
      jsonrpc: '2.0',
      id: this.#nextId++,
      method: 'tools/call',
      params: { name: tool, arguments: args },
    })
    const result = unwrapToolResult(envelope, tool)
    if (this.#cfg.strictToolErrors) assertSucceeded(result, tool)
    return result
  }

  async #post(accessToken: string, body: unknown): Promise<JsonRpcEnvelope> {
    const url = `${this.#cfg.mcpBase}/mcp/consumer`

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.#cfg.upstreamTimeoutMs),
      })
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'TimeoutError') {
        throw new ApiError(504, 'upstream_timeout', 'The DoorDash MCP gateway did not respond in time.')
      }
      throw new ApiError(502, 'upstream_error', 'Could not reach the DoorDash MCP gateway.', {
        cause: cause instanceof Error ? cause.message : String(cause),
      })
    }

    const text = await response.text()

    if (!response.ok) throw mapGatewayError(response.status, text, response.headers)

    const envelope = parseEnvelope(text, response.headers.get('content-type'))
    if (!envelope) {
      throw new ApiError(502, 'upstream_error', 'The MCP gateway returned no parseable JSON-RPC envelope.')
    }
    return envelope
  }
}

function mapGatewayError(status: number, rawBody: string, headers?: Headers): ApiError {
  let body: { error?: string } = {}
  try {
    body = JSON.parse(rawBody) as { error?: string }
  } catch {
    /* non-JSON error bodies happen; fall through with what we have */
  }

  if (status === 429) {
    // A rate-limit is recoverable, so surface it as one rather than an opaque
    // 502. Carrying the upstream Retry-After through means errors.ts can put it
    // on the header, and — because 429 is not in hints.ts's HINTABLE set — we
    // do not fire a second listing call straight back into the same limit.
    const retryAfter = parseRetryAfter(headers?.get('retry-after'))
    return new ApiError(
      429,
      'too_many_requests',
      'DoorDash is rate-limiting requests. Retry after a short wait.',
      { upstream_error: body.error, ...(retryAfter !== undefined ? { retry_after_seconds: retryAfter } : {}) },
    )
  }

  if (status === 401) {
    return new ApiError(
      401,
      'doordash_unauthorized',
      'DoorDash rejected the access token. It has expired or been revoked; a new browser login is required.',
      RELOGIN_HINT,
    )
  }

  if (status === 403) {
    // This exact body is the private-beta gating sentinel: the account
    // authenticated fine but is not an approved tester.
    const gated = body.error === 'The user is forbidden.'
    return new ApiError(
      403,
      'doordash_forbidden',
      gated
        ? 'This DoorDash account is authenticated but not enrolled in the consumer MCP private beta.'
        : 'DoorDash refused the request.',
      { upstream_error: body.error, private_beta_gating: gated || undefined },
    )
  }

  return new ApiError(502, 'upstream_error', 'The DoorDash MCP gateway returned an error.', {
    status,
    upstream_error: body.error ?? (rawBody.slice(0, 500) || undefined),
  })
}

/**
 * A `Retry-After` value in seconds.
 *
 * RFC 7231 allows either delta-seconds or an HTTP-date; accept both and reject
 * anything that lands in the past or does not parse, so a bad header degrades to
 * "no advice" rather than a negative wait.
 */
function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return seconds > 0 ? Math.ceil(seconds) : undefined
  const at = Date.parse(value)
  if (Number.isNaN(at)) return undefined
  const delta = Math.ceil((at - Date.now()) / 1000)
  return delta > 0 ? delta : undefined
}

/**
 * Accepts either a plain JSON body or an SSE stream, since both turn up on a
 * 200.
 */
export function parseEnvelope(text: string, contentType: string | null): JsonRpcEnvelope | undefined {
  const looksLikeSse = (contentType ?? '').includes('text/event-stream') || /^\s*(event|data|id|retry):/m.test(text)

  if (!looksLikeSse) {
    try {
      return JSON.parse(text) as JsonRpcEnvelope
    } catch {
      return undefined
    }
  }

  // Take the first `data:` payload that parses as a JSON-RPC envelope. Multi-line
  // `data:` fields are concatenated with newlines per the SSE spec.
  let buffer: string[] = []
  const flush = (): JsonRpcEnvelope | undefined => {
    if (buffer.length === 0) return undefined
    const payload = buffer.join('\n')
    buffer = []
    if (payload === '[DONE]') return undefined
    try {
      const parsed = JSON.parse(payload) as JsonRpcEnvelope
      // A response carries result or error. A notification/progress frame carries
      // only `jsonrpc` + `method`; skip it and keep scanning for the real reply
      // rather than handing it back as an empty envelope.
      return parsed.result !== undefined || parsed.error !== undefined ? parsed : undefined
    } catch {
      return undefined
    }
  }

  for (const line of text.split(/\r\n|\r|\n/)) {
    if (line === '') {
      const done = flush()
      if (done) return done
      continue
    }
    if (line.startsWith('data:')) {
      buffer.push(line.slice(5).replace(/^ /, ''))
    }
  }
  return flush()
}

/**
 * Reduce an MCP result to the plain JSON body we hand back to clients.
 *
 * `structuredContent` is the real payload. When it is absent the text block
 * usually mirrors it as a JSON string, so we try that before giving up and
 * returning the raw content blocks.
 */
export function unwrapToolResult(envelope: JsonRpcEnvelope, tool: string): Record<string, unknown> {
  if (envelope.error) {
    throw new ApiError(502, 'upstream_error', envelope.error.message ?? `Tool ${tool} failed.`, {
      jsonrpc_code: envelope.error.code,
      jsonrpc_data: envelope.error.data,
    })
  }

  const result = envelope.result
  if (!result) {
    throw new ApiError(502, 'upstream_error', `Tool ${tool} returned an empty result.`)
  }

  if (result.isError) {
    throw new ApiError(502, 'doordash_tool_error', textOf(result) ?? `Tool ${tool} reported an error.`, { tool })
  }

  const structured = result.structuredContent
  const structuredIsObject = structured !== null && typeof structured === 'object'

  // A populated structuredContent is the real payload and is preferred. An
  // *empty* one is not: some tools mirror nothing into it and carry everything
  // in the text block, so `structuredContent: {}` next to a full text block is
  // a response we would otherwise hand back as `{}` — a 200 that looks broken.
  // Only short-circuit here when there is actually something in it.
  if (structuredIsObject && Object.keys(structured).length > 0) {
    return structured
  }

  const text = textOf(result)
  if (text !== undefined) {
    try {
      const parsed: unknown = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
      return { result: parsed }
    } catch {
      return { text }
    }
  }

  // Nothing in the text either. An empty structuredContent, if that is what we
  // had, is a truer answer than an invented `content` wrapper.
  if (structuredIsObject) return structured
  return { content: result.content ?? [] }
}

/**
 * A tool that reported failure inside a successful envelope.
 *
 * MCP's own `isError` covers a tool that blew up; this covers the far more
 * common case of one that ran fine and refused — cart gone, store closed, item
 * unavailable. DoorDash signals that with `success: false` in the body, which
 * would otherwise reach the caller as HTTP 200 and have to be noticed. Anything
 * that has to be noticed eventually isn't.
 *
 * Deliberately narrow: only a literal `false` counts, so a tool that omits the
 * field, or that nests a `success` somewhere deeper, is left alone.
 */
function assertSucceeded(result: Record<string, unknown>, tool: string): void {
  if (result.success !== false) return

  const message = firstString(result, ['error_message', 'message', 'error'])
  throw new ApiError(
    502,
    'doordash_tool_error',
    message ?? `DoorDash reported that ${tool} did not succeed, without saying why.`,
    {
      tool,
      // The rest of the payload is often the only diagnostic there is, and
      // dropping it would leave the caller with strictly less than the
      // pass-through gave them.
      upstream_result: result,
      ...pick(result, ['error_type', 'error_category']),
    },
  )
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return undefined
}

function pick(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) out[key] = obj[key]
  }
  return out
}

function textOf(result: McpToolResult): string | undefined {
  const blocks = (result.content ?? []).filter((b) => typeof b.text === 'string')
  if (blocks.length === 0) return undefined
  return blocks.map((b) => b.text).join('\n')
}
