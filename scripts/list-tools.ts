/**
 * Asks the MCP gateway to enumerate its own tools.
 *
 * MCP defines a standard `tools/list` method. Whether the gateway answers it,
 * and with what, decides something that matters beyond curiosity: if the server
 * advertises every tool and its input schema to any authorized client, then
 * those names and shapes are surface the server discloses on request rather
 * than internals that had to be derived from somewhere else.
 *
 * Run:  bun run list-tools
 *       bun run list-tools doordash_find_restaurants   (dump one tool's schema)
 *
 * Performs a real login and consumes one authorization code. Prints only tool
 * metadata — no account data is fetched.
 */

import { loadConfig } from '../src/config.ts'
import { deriveCodeChallenge, generateCodeVerifier, generateState } from '../src/auth/pkce.ts'
import { buildAuthorizeUrl, exchangeCodeForToken, parseCallbackUrl } from '../src/auth/oauth.ts'
import { parseEnvelope } from '../src/mcp/client.ts'
import { TOOLS } from '../src/mcp/tools.ts'

const cfg = loadConfig({
  ...process.env,
  SESSION_KEYS: process.env.SESSION_KEYS || Buffer.alloc(32, 1).toString('base64'),
})

/**
 * Arguments are identified by shape rather than position, because both are
 * optional and either can come first:
 *
 *   bun run list-tools
 *   bun run list-tools doordash_find_restaurants
 *   bun run list-tools 'http://localhost:4180/oauth2/callback?code=…&state=…'
 *   bun run list-tools doordash_find_restaurants 'http://localhost:4180/…'
 */
const args = process.argv.slice(2)
const toolFilter = args.find((a) => /^(doordash|internal)_/.test(a))
const pastedCallback = args.find((a) => a.includes('://') || a.includes('code='))

const accessToken = process.env.DD_ACCESS_TOKEN ?? (await loginForToken())

/** Paste-back login, skipped entirely when DD_ACCESS_TOKEN is already set. */
async function loginForToken(): Promise<string> {
  const verifier = generateCodeVerifier()
  const state = generateState()

  console.log('\n1. Open this and sign in:\n')
  console.log(`   ${buildAuthorizeUrl(cfg, { state, codeChallenge: deriveCodeChallenge(verifier), redirectUri: cfg.redirectUri })}\n`)
  console.log(`2. You will land on ${cfg.redirectUri} and the page will fail to load. That is expected.`)
  console.log('3. Paste the full URL from the address bar.\n')
  console.log('   (Or skip all this by setting DD_ACCESS_TOKEN to a token you already have.)\n')

  const pasted = pastedCallback ?? prompt('Callback URL:')
  if (!pasted) {
    console.error('Nothing pasted; aborting. Pass the URL as an argument, or set DD_ACCESS_TOKEN.')
    process.exit(1)
  }

  const { code, state: returned } = parseCallbackUrl(pasted)
  if (returned !== state) {
    console.error('State mismatch — that URL is from a different login attempt.')
    process.exit(1)
  }

  const token = await exchangeCodeForToken(cfg, { code, redirectUri: cfg.redirectUri, codeVerifier: verifier })
  return token.access_token
}

console.log(`\nCalling tools/list on ${cfg.mcpBase}/mcp/consumer …\n`)

const response = await fetch(`${cfg.mcpBase}/mcp/consumer`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
})

const raw = await response.text()
console.log(`HTTP ${response.status} ${response.statusText}`)

// Distinguish "the gateway refused to enumerate" from "we were not authorised
// to ask". Both surface as an error body, and conflating them would produce a
// confidently wrong conclusion.
if (!response.ok) {
  console.error(`\n  Request rejected before tools/list was considered: ${raw.slice(0, 300)}`)
  if (response.status === 401) {
    console.error('  The access token is missing, expired, or not accepted — this says nothing about tools/list.')
  } else if (response.status === 403) {
    console.error('  This account is authenticated but not approved for the consumer MCP beta.')
  }
  process.exit(1)
}

const envelope = parseEnvelope(raw, response.headers.get('content-type'))
if (!envelope) {
  console.error('No JSON-RPC envelope in the response:\n', raw.slice(0, 600))
  process.exit(1)
}
if (envelope.error) {
  console.error('\ntools/list was refused:', JSON.stringify(envelope.error, null, 2))
  console.error('\n  => The gateway does NOT enumerate its tools for clients.')
  process.exit(0)
}

const result = envelope.result as { tools?: { name?: string; description?: string; inputSchema?: unknown }[] } | undefined
const advertised = result?.tools ?? []

if (advertised.length === 0) {
  console.log('\n  tools/list returned no tools. Raw result:\n', JSON.stringify(envelope.result, null, 2).slice(0, 800))
  process.exit(0)
}

const implemented = new Set<string>(Object.values(TOOLS))
const advertisedNames = new Set<string>()
for (const tool of advertised) advertisedNames.add(tool.name ?? '(unnamed)')

/**
 * A tool name filter dumps that tool's advertised input schema in full.
 *
 * This is the only authoritative answer to "is this argument actually
 * required?" — our own route schemas were reconstructed from dd-cli's
 * behaviour, which is what the CLI sends, not what the gateway demands.
 */
if (toolFilter) {
  const tool = advertised.find((t) => t.name === toolFilter)
  if (!tool) {
    console.error(`\nThe gateway does not advertise a tool named ${toolFilter}.`)
    process.exit(1)
  }
  console.log(`\n--- ${toolFilter} ---\n`)
  if (tool.description) console.log(`${tool.description}\n`)

  const schema = tool.inputSchema as { required?: string[]; properties?: Record<string, unknown> } | undefined
  if (!schema) {
    console.log('The gateway advertises no input schema for this tool.')
  } else {
    const required = new Set(schema.required ?? [])
    for (const arg of Object.keys(schema.properties ?? {})) {
      console.log(`  ${required.has(arg) ? 'REQUIRED' : 'optional'}  ${arg}`)
    }
    console.log(`\nFull schema:\n${JSON.stringify(schema, null, 2)}`)
  }
  process.exit(0)
}

console.log(`\n--- the gateway advertises ${advertised.length} tools ---\n`)

for (const tool of advertised) {
  const name = tool.name ?? '(unnamed)'
  const mark = implemented.has(name) ? ' ' : '+' // '+' = advertised but not implemented here
  const schema = tool.inputSchema ? 'schema' : 'no schema'
  console.log(`  ${mark} ${name.padEnd(42)} ${schema}`)
  if (tool.description) console.log(`      ${tool.description.slice(0, 100)}`)
}
console.log('\n  Pass a tool name to dump its full input schema, e.g.:')
console.log('    bun run list-tools doordash_find_restaurants')

const missing = [...implemented].filter((t) => !advertisedNames.has(t))
const extra = [...advertisedNames].filter((t) => !implemented.has(t))

console.log('\n--- what this means ---')
console.log(`  Advertised by the gateway:      ${advertisedNames.size}`)
console.log(`  Implemented by this API:        ${implemented.size}`)
if (extra.length > 0) console.log(`  Advertised but not implemented: ${extra.join(', ')}`)
if (missing.length > 0) console.log(`  Implemented but NOT advertised: ${missing.join(', ')}`)

const internalAdvertised = [...advertisedNames].filter((t) => t.startsWith('internal_'))
console.log(`\n  "internal_" tools advertised:   ${internalAdvertised.length}`)
if (missing.length === 0) {
  console.log('\n  Every tool this API uses is one the gateway itself lists on request.')
} else {
  console.log('\n  Some tools this API uses are NOT advertised by the gateway.')
}
console.log()
