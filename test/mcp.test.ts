import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { bearer, login, makeHarness, type Harness } from './helpers.ts'
import { parseEnvelope, unwrapToolResult } from '../src/mcp/client.ts'

let h: Harness
beforeEach(() => {
  h = makeHarness()
})
afterEach(() => {
  h.stop()
})

describe('parseEnvelope', () => {
  const envelope = { jsonrpc: '2.0', id: 1, result: { structuredContent: { ok: true } } }

  test('parses an SSE data line', () => {
    const text = `event: message\ndata: ${JSON.stringify(envelope)}\n\n`
    expect(parseEnvelope(text, 'text/event-stream')).toEqual(envelope)
  })

  test('parses plain JSON', () => {
    expect(parseEnvelope(JSON.stringify(envelope), 'application/json')).toEqual(envelope)
  })

  test('detects SSE even when the content-type lies', () => {
    const text = `data: ${JSON.stringify(envelope)}\n\n`
    expect(parseEnvelope(text, 'application/json')).toEqual(envelope)
  })

  test('joins a multi-line data field', () => {
    // SSE may split one payload across several data: lines, rejoined with "\n".
    const json = JSON.stringify(envelope)
    const at = json.indexOf('"result"')
    const text = `data: ${json.slice(0, at)}\ndata: ${json.slice(at)}\n\n`
    expect(parseEnvelope(text, 'text/event-stream')).toEqual(envelope)
  })

  test('skips leading events that are not JSON-RPC', () => {
    const text = `event: ping\ndata: {"hello":"world"}\n\nevent: message\ndata: ${JSON.stringify(envelope)}\n\n`
    expect(parseEnvelope(text, 'text/event-stream')).toEqual(envelope)
  })

  test('returns undefined for junk', () => {
    expect(parseEnvelope('not json at all', 'application/json')).toBeUndefined()
    expect(parseEnvelope('', 'text/event-stream')).toBeUndefined()
  })
})

describe('unwrapToolResult', () => {
  test('prefers structuredContent', () => {
    const out = unwrapToolResult(
      { result: { structuredContent: { stores: [1] }, content: [{ type: 'text', text: '{"stale":true}' }] } },
      't',
    )
    expect(out).toEqual({ stores: [1] })
  })

  test('falls back to parsing the text block', () => {
    expect(unwrapToolResult({ result: { content: [{ type: 'text', text: '{"a":1}' }] } }, 't')).toEqual({ a: 1 })
  })

  test('falls through an empty structuredContent to the text block', () => {
    // The shape that returned a bare {} — an empty structuredContent shadowing
    // a populated text block, which some tools use as their only payload.
    const out = unwrapToolResult(
      { result: { structuredContent: {}, content: [{ type: 'text', text: '{"item":{"name":"Burrito"}}' }] } },
      'internal_get_item_details',
    )
    expect(out).toEqual({ item: { name: 'Burrito' } })
  })

  test('returns an empty object only when there is genuinely nothing else', () => {
    expect(unwrapToolResult({ result: { structuredContent: {} } }, 't')).toEqual({})
  })

  test('wraps non-object text', () => {
    expect(unwrapToolResult({ result: { content: [{ type: 'text', text: 'plain words' }] } }, 't')).toEqual({
      text: 'plain words',
    })
  })

  test('raises on a JSON-RPC error', () => {
    expect(() => unwrapToolResult({ error: { code: -32000, message: 'nope' } }, 't')).toThrow('nope')
  })

  test('raises on isError', () => {
    expect(() =>
      unwrapToolResult({ result: { isError: true, content: [{ type: 'text', text: 'cart not found' }] } }, 't'),
    ).toThrow('cart not found')
  })
})

describe('transport behaviour end to end', () => {
  test('sends the JSON-RPC envelope the gateway expects', async () => {
    const { sessionToken } = await login(h)
    await h.request('/v1/restaurants?query=pizza', { headers: bearer(sessionToken) })

    expect(h.mock.calls).toHaveLength(1)
    const call = h.mock.calls[0]!
    expect(call.tool).toBe('doordash_find_restaurants')
    expect(call.authorization).toBe(`Bearer ${h.mock.accessToken}`)
    expect(call.args.query).toBe('pizza')
  })

  test('works when the gateway replies with plain JSON instead of SSE', async () => {
    const { sessionToken } = await login(h)
    h.mock.setPlainJson(true)
    h.mock.setToolResult(() => ({ addresses: ['home'] }))

    const res = await h.request('/v1/addresses', { headers: bearer(sessionToken) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ addresses: ['home'] })
  })

  test('maps a gateway 5xx to 502 without leaking the token', async () => {
    const { sessionToken } = await login(h)
    h.mock.setToolFailure({ status: 503, body: { error: 'upstream unavailable' } })

    const res = await h.request('/v1/addresses', { headers: bearer(sessionToken) })
    expect(res.status).toBe(502)
    const text = await res.text()
    expect(text).not.toContain(h.mock.accessToken)
    expect(JSON.parse(text).error).toBe('upstream_error')
  })

  test('maps an upstream 429 to 429 and forwards its Retry-After', async () => {
    const { sessionToken } = await login(h)
    h.mock.setToolFailure({ status: 429, body: { error: 'rate limited' }, headers: { 'retry-after': '12' } })

    const res = await h.request('/v1/addresses', { headers: bearer(sessionToken) })
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('12')
    const body = (await res.json()) as { error: string; retry_after_seconds: number }
    expect(body.error).toBe('too_many_requests')
    expect(body.retry_after_seconds).toBe(12)
  })

  test('surfaces an isError result as doordash_tool_error', async () => {
    const { sessionToken } = await login(h)
    h.mock.setEnvelope((tool, id) => ({
      jsonrpc: '2.0',
      id,
      result: { isError: true, content: [{ type: 'text', text: 'Cart not found.' }] },
    }))

    const res = await h.request('/v1/addresses', { headers: bearer(sessionToken) })
    expect(res.status).toBe(502)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe('doordash_tool_error')
    expect(body.message).toBe('Cart not found.')
  })

  test('surfaces a JSON-RPC error envelope', async () => {
    const { sessionToken } = await login(h)
    h.mock.setEnvelope((_tool, id) => ({
      jsonrpc: '2.0',
      id,
      error: { code: -32602, message: 'Invalid params' },
    }))

    const res = await h.request('/v1/addresses', { headers: bearer(sessionToken) })
    expect(res.status).toBe(502)
    const body = (await res.json()) as { error: string; message: string; jsonrpc_code: number }
    expect(body.error).toBe('upstream_error')
    expect(body.message).toBe('Invalid params')
    expect(body.jsonrpc_code).toBe(-32602)
  })

  test('times out rather than hanging', async () => {
    const slow = makeHarness({ UPSTREAM_TIMEOUT_MS: '1', DD_MCP_BASE: 'http://127.0.0.1:1' })
    try {
      // Log in against `slow` itself — sessions live in its own store now.
      const { sessionToken } = await login(slow)
      const res = await slow.request('/v1/addresses', { headers: bearer(sessionToken) })
      expect([502, 504]).toContain(res.status)
    } finally {
      slow.stop()
    }
  })
})

describe('intent', () => {
  test('is injected server-side on every call', async () => {
    const { sessionToken } = await login(h)
    await h.request('/v1/addresses', { headers: bearer(sessionToken) })

    const intent = h.mock.calls[0]!.args.intent as string
    expect(intent).toContain('Summary:')
    expect(intent).toContain('saved delivery addresses')
    expect(intent).toContain('forwards no end-user text')
  })

  test('cannot be overridden by the caller', async () => {
    const { sessionToken } = await login(h)
    await h.request('/v1/addresses/current', {
      method: 'PUT',
      headers: { ...bearer(sessionToken), 'content-type': 'application/json' },
      body: JSON.stringify({ address_id: 'addr-1', intent: 'ATTACKER SUPPLIED INTENT' }),
    })

    const intent = h.mock.calls[0]!.args.intent as string
    expect(intent).not.toContain('ATTACKER SUPPLIED')
    expect(intent).toContain('Summary:')
  })
})
