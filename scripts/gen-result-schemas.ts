/**
 * Turns the gateway's advertised `outputSchema`s into a committed source file.
 *
 * Run:  bun run list-tools --dump && bun run gen-schemas
 *
 * The MCP gateway describes not just each tool's arguments but its result, so
 * response shapes no longer have to be guessed. Those descriptions are baked
 * into src/schemas/results.generated.ts rather than fetched at boot: the API
 * document must be identical for everyone, must not depend on an account, and
 * must not make a network call to render /docs.
 *
 * Two transformations happen here:
 *
 *   - Each tool's `$defs` are hoisted into shared components. A `$ref` of
 *     "#/$defs/Cart" resolves against the document root once the schema is
 *     inlined into an OpenAPI document, where no such path exists, so every
 *     ref is rewritten to "#/components/schemas/...". All 13 definitions are
 *     byte-identical wherever they appear, so hoisting cannot lose anything.
 *
 *   - Tools whose output is declared as a bare `{additionalProperties: true}`
 *     are skipped. They describe nothing, so the generic pass-through result
 *     stays more honest than an empty object would be.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { TOOLS } from '../src/mcp/tools.ts'

const DUMP = 'data/tools-list.json'
const OUT = 'src/schemas/results.generated.ts'
const PREFIX = 'DD'

interface Advertised {
  name?: string
  outputSchema?: Record<string, unknown>
}

let dump: Advertised[]
try {
  dump = JSON.parse(readFileSync(DUMP, 'utf8')) as Advertised[]
} catch {
  console.error(`Could not read ${DUMP}. Produce it first with:  bun run list-tools --dump`)
  process.exit(1)
}

const advertised = new Map(dump.filter((t) => t.name).map((t) => [t.name!, t]))
const used = Object.values(TOOLS)

/** doordash_find_restaurants -> DDFindRestaurantsResult */
function componentName(tool: string): string {
  const base = tool.replace(/^(doordash|internal)_/, '')
  const camel = base.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
  return `${PREFIX}${camel.charAt(0).toUpperCase()}${camel.slice(1)}Result`
}

/** A schema that says nothing beyond "some object" is not worth publishing. */
function isFreeForm(schema: Record<string, unknown> | undefined): boolean {
  if (!schema) return true
  const properties = schema.properties as Record<string, unknown> | undefined
  return !properties || Object.keys(properties).length === 0
}

function rewriteRefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rewriteRefs)
  if (value === null || typeof value !== 'object') return value

  const out: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value)) {
    if (key === '$ref' && typeof nested === 'string' && nested.startsWith('#/$defs/')) {
      out[key] = `#/components/schemas/${PREFIX}${nested.slice('#/$defs/'.length)}`
      continue
    }
    out[key] = rewriteRefs(nested)
  }
  return out
}

const sharedDefs: Record<string, unknown> = {}
const results: Record<string, { component: string; schema: unknown }> = {}
const skipped: string[] = []

for (const tool of used) {
  const entry = advertised.get(tool)
  if (!entry) {
    console.warn(`  ! ${tool} is not advertised by the gateway — skipping.`)
    continue
  }

  const schema = entry.outputSchema
  if (isFreeForm(schema)) {
    skipped.push(tool)
    continue
  }

  const { $defs, ...rest } = schema as Record<string, unknown> & { $defs?: Record<string, unknown> }
  for (const [name, body] of Object.entries($defs ?? {})) {
    const key = `${PREFIX}${name}`
    const rewritten = rewriteRefs(body)
    const existing = sharedDefs[key]
    // Identical everywhere they appear, but assert it rather than assume it —
    // a silent overwrite would publish one tool's shape under another's name.
    if (existing && JSON.stringify(existing) !== JSON.stringify(rewritten)) {
      console.error(`  ! $defs/${name} differs between tools; cannot hoist safely.`)
      process.exit(1)
    }
    sharedDefs[key] = rewritten
  }

  results[tool] = { component: componentName(tool), schema: rewriteRefs(rest) }
}

const banner = `/**
 * GENERATED — do not edit.
 *
 * Response shapes as the DoorDash MCP gateway advertises them via tools/list.
 * Regenerate with:  bun run list-tools --dump && bun run gen-schemas
 *
 * These document the response; they do not validate it. DoorDash can add a
 * field at any time and a response carrying one must still pass through
 * untouched, so nothing here is enforced at runtime.
 *
 * ${used.length - skipped.length} of ${used.length} tools describe their output. The rest advertise a bare
 * \`{additionalProperties: true}\` and keep the generic pass-through result:
${skipped.map((t) => ` *   - ${t}`).join('\n')}
 */
`

const body = `${banner}
/** Shared object definitions, hoisted out of each tool's \`$defs\`. */
export const SHARED_RESULT_DEFS: Record<string, unknown> = ${JSON.stringify(sharedDefs, null, 2)}

/** Tool name -> the OpenAPI component name and schema for its result. */
export const TOOL_RESULT_SCHEMAS: Record<string, { component: string; schema: Record<string, unknown> }> = ${JSON.stringify(
  results,
  null,
  2,
)}
`

writeFileSync(OUT, body)

console.log(`\nWrote ${OUT}`)
console.log(`  described:  ${Object.keys(results).length}`)
console.log(`  free-form:  ${skipped.length} (${skipped.join(', ')})`)
console.log(`  shared defs: ${Object.keys(sharedDefs).length}`)
