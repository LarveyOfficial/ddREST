/**
 * Calls two MCP tools and compares what actually comes back.
 *
 * Run:  bun run compare-tools <tool_a> <tool_b> '<json args>'
 *       bun run compare-tools doordash_find_restaurants doordash_search_restaurants \
 *         '{"query":"pizza","latitude":41.9015,"longitude":-87.6275,"max_stores":3}'
 *
 * Exists because the advertised schemas cannot settle which of a pair is the
 * better fit. Several tools declare their output as a bare object, and even the
 * described ones leave the interesting parts opaque — doordash_find_restaurants
 * documents a `stores` array whose item definition has no properties at all. So
 * the only way to know whether a tool returns usable data or widget scaffolding
 * is to call it and look.
 *
 * Arguments not accepted by a tool are dropped for that call, so one args object
 * can drive both sides of a comparison.
 *
 * Read-only by intent, but it calls whatever it is given — do not point it at
 * submit_order.
 */

import { loadConfig } from '../src/config.ts'
import { deriveCodeChallenge, generateCodeVerifier, generateState } from '../src/auth/pkce.ts'
import { buildAuthorizeUrl, exchangeCodeForToken, parseCallbackUrl } from '../src/auth/oauth.ts'
import { parseEnvelope } from '../src/mcp/client.ts'

const cfg = loadConfig({
  ...process.env,
  SESSION_KEYS: process.env.SESSION_KEYS || Buffer.alloc(32, 1).toString('base64'),
})

const argv = process.argv.slice(2)
const tools = argv.filter((a) => /^(doordash|internal)_/.test(a))
const argsRaw = argv.find((a) => a.trim().startsWith('{'))
const pastedCallback = argv.find((a) => a.includes('://') || a.includes('code='))

if (tools.length !== 2) {
  console.error("Give exactly two tool names.\n\n  bun run compare-tools doordash_find_restaurants doordash_search_restaurants '{\"query\":\"pizza\",…}'")
  process.exit(1)
}

let baseArgs: Record<string, unknown> = {}
if (argsRaw) {
  try {
    baseArgs = JSON.parse(argsRaw) as Record<string, unknown>
  } catch (err) {
    console.error('The args argument is not valid JSON:', (err as Error).message)
    process.exit(1)
  }
}

const accessToken = process.env.DD_ACCESS_TOKEN ?? (await loginForToken())

async function loginForToken(): Promise<string> {
  const verifier = generateCodeVerifier()
  const state = generateState()
  console.log('\n1. Open this and sign in:\n')
  console.log(`   ${buildAuthorizeUrl(cfg, { state, codeChallenge: deriveCodeChallenge(verifier), redirectUri: cfg.redirectUri })}\n`)
  console.log(`2. You land on ${cfg.redirectUri} and it fails to load. That is expected.`)
  console.log('3. Paste the full URL.  (Or set DD_ACCESS_TOKEN to skip this.)\n')

  const pasted = pastedCallback ?? prompt('Callback URL:')
  if (!pasted) {
    console.error('Nothing pasted; aborting.')
    process.exit(1)
  }
  const { code, state: returned } = parseCallbackUrl(pasted)
  if (returned !== state) {
    console.error('State mismatch — that URL is from a different login attempt.')
    process.exit(1)
  }
  return (await exchangeCodeForToken(cfg, { code, redirectUri: cfg.redirectUri, codeVerifier: verifier })).access_token
}

/** The gateway rejects unknown arguments, so trim to what each tool advertises. */
async function acceptedArgs(tool: string): Promise<Set<string> | undefined> {
  try {
    const dump = JSON.parse(await Bun.file('data/tools-list.json').text()) as {
      name?: string
      inputSchema?: { properties?: Record<string, unknown> }
    }[]
    const entry = dump.find((t) => t.name === tool)
    return entry?.inputSchema?.properties ? new Set(Object.keys(entry.inputSchema.properties)) : undefined
  } catch {
    return undefined // no dump available; send everything and let the gateway decide
  }
}

async function call(tool: string): Promise<unknown> {
  const accepted = await acceptedArgs(tool)
  const args = accepted
    ? Object.fromEntries(Object.entries(baseArgs).filter(([k]) => accepted.has(k)))
    : baseArgs

  const dropped = Object.keys(baseArgs).filter((k) => !(k in args))
  console.log(`\n──────── ${tool}`)
  console.log(`  args:    ${JSON.stringify(args)}`)
  if (dropped.length) console.log(`  dropped: ${dropped.join(', ')} (not in this tool's schema)`)

  const started = Date.now()
  const response = await fetch(`${cfg.mcpBase}/mcp/consumer`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: args } }),
  })

  const raw = await response.text()
  const elapsed = Date.now() - started
  console.log(`  HTTP ${response.status} in ${elapsed}ms`)

  if (!response.ok) {
    console.log(`  body: ${raw.slice(0, 400)}`)
    return undefined
  }

  const envelope = parseEnvelope(raw, response.headers.get('content-type'))
  if (envelope?.error) {
    console.log(`  JSON-RPC error: ${JSON.stringify(envelope.error).slice(0, 400)}`)
    return undefined
  }

  const result = (envelope?.result ?? {}) as { structuredContent?: unknown }
  return result.structuredContent ?? result
}

/** Enough shape to see whether a payload is data or scaffolding. */
function describe(value: unknown, depth = 0): string[] {
  if (value === null || typeof value !== 'object') return []
  const pad = '   '.repeat(depth + 1)
  const out: string[] = []
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(nested)) {
      const first = nested[0]
      const keys = first && typeof first === 'object' ? Object.keys(first as object) : []
      out.push(`${pad}${key}: array(${nested.length})${keys.length ? ` of {${keys.join(', ')}}` : ''}`)
      if (depth < 1 && first && typeof first === 'object') out.push(...describe(first, depth + 2))
    } else if (nested !== null && typeof nested === 'object') {
      out.push(`${pad}${key}: object`)
      if (depth < 1) out.push(...describe(nested, depth + 1))
    } else {
      const shown = typeof nested === 'string' && nested.length > 60 ? `${nested.slice(0, 60)}…` : JSON.stringify(nested)
      out.push(`${pad}${key}: ${shown}`)
    }
  }
  return out
}

const results: Record<string, unknown> = {}
for (const tool of tools) results[tool] = await call(tool)

console.log('\n\n════════ shape comparison ════════')
for (const tool of tools) {
  const value = results[tool]
  console.log(`\n${tool}${value === undefined ? '  (failed)' : ''}`)
  if (value !== undefined) {
    console.log(`  bytes: ${JSON.stringify(value).length}`)
    console.log(describe(value).join('\n') || '   (empty)')
  }
}

const [a, b] = tools as [string, string]
if (results[a] && results[b]) {
  const keysOf = (v: unknown) => new Set(Object.keys((v ?? {}) as object))
  const ka = keysOf(results[a])
  const kb = keysOf(results[b])
  console.log('\n════════ top-level keys ════════')
  console.log(`  only in ${a}: ${[...ka].filter((k) => !kb.has(k)).join(', ') || '—'}`)
  console.log(`  only in ${b}: ${[...kb].filter((k) => !ka.has(k)).join(', ') || '—'}`)
  console.log(`  in both:      ${[...ka].filter((k) => kb.has(k)).join(', ') || '—'}`)
}

await Bun.write('data/compare-tools.json', JSON.stringify(results, null, 2))
console.log('\nFull responses written to data/compare-tools.json (gitignored).')
