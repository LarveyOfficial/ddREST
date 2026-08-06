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
    return unwrapToolResult(envelope, tool)
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

    if (!response.ok) throw mapGatewayError(response.status, text)

    const envelope = parseEnvelope(text, response.headers.get('content-type'))
    if (!envelope) {
      throw new ApiError(502, 'upstream_error', 'The MCP gateway returned no parseable JSON-RPC envelope.')
    }
    return envelope
  }
}

function mapGatewayError(status: number, rawBody: string): ApiError {
  let body: { error?: string } = {}
  try {
    body = JSON.parse(rawBody) as { error?: string }
  } catch {
    /* non-JSON error bodies happen; fall through with what we have */
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
      return parsed.jsonrpc !== undefined || parsed.result !== undefined || parsed.error !== undefined
        ? parsed
        : undefined
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

  if (result.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent
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

  return { content: result.content ?? [] }
}

function textOf(result: McpToolResult): string | undefined {
  const blocks = (result.content ?? []).filter((b) => typeof b.text === 'string')
  if (blocks.length === 0) return undefined
  return blocks.map((b) => b.text).join('\n')
}
