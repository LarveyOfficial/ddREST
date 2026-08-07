/**
 * Turns the gateway's advertised `outputSchema`s into a committed source file.
 *
 * Run:  bun run list-tools --dump      # what the gateway advertises
 *       bun run capture-shapes         # what real responses contain (optional)
 *       bun run gen-schemas
 *
 * The MCP gateway describes each tool's result as well as its arguments, but
 * not completely: six of the tools we use advertise a bare
 * `{additionalProperties: true}`, and several described ones leave a leaf
 * untyped. Where a capture from capture-shapes is present it fills those gaps,
 * and where the advertised schema is specific it wins.
 *
 * The result is baked into src/schemas/results.generated.ts rather than fetched
 * at boot: the API document must be identical for everyone, must not depend on
 * an account, and must not make a network call to render /docs.
 *
 * Three transformations happen here:
 *
 *   - Each tool's `$defs` are hoisted into shared components. A `$ref` of
 *     "#/$defs/Cart" resolves against the document root once the schema is
 *     inlined into an OpenAPI document, where no such path exists, so every
 *     ref is rewritten to "#/components/schemas/...". All 13 definitions are
 *     byte-identical wherever they appear, so hoisting cannot lose anything.
 *
 *   - Observed shapes fill anything the advertised schema leaves untyped.
 *
 *   - Tools left with nothing from either source are skipped. They describe
 *     nothing, so the generic pass-through result stays more honest than an
 *     empty object would be.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { TOOLS } from '../src/mcp/tools.ts'

const DUMP = 'data/tools-list.json'
const OUT = 'src/schemas/results.generated.ts'
const OBSERVED = 'data/observed-shapes.json'
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

/**
 * Shapes inferred from real responses by scripts/capture-shapes.ts.
 *
 * The advertised schemas are incomplete in two ways this fills: six tools
 * declare nothing at all, and several described ones leave a leaf untyped
 * (`find_restaurants` declares `stores` as an array with no item schema). An
 * observed shape is used wherever the advertised one says less.
 */
let observedShapes: Record<string, Record<string, unknown>> = {}
try {
  observedShapes = JSON.parse(readFileSync(OBSERVED, 'utf8')) as typeof observedShapes
  console.log(`  using observed shapes for ${Object.keys(observedShapes).length} tools (${OBSERVED})`)
} catch {
  console.log(`  no ${OBSERVED} — advertised schemas only. Produce it with:  bun run capture-shapes`)
}

/** True when `node` describes nothing a developer could rely on. */
function saysNothing(node: unknown): boolean {
  if (!node || typeof node !== 'object') return true
  const s = node as Record<string, unknown>
  if (s.$ref) return false
  if (s.type === 'array') return !s.items
  if (s.type === 'object' || s.type === undefined) return !s.properties
  return false
}

/**
 * Advertised schema wins wherever it is specific; the observed one fills the
 * gaps. Never the other way round — the advertised names and descriptions are
 * DoorDash's own, while the observed shape is one account on one day.
 */
function fillGaps(adv: unknown, obs: unknown): unknown {
  if (obs === undefined) return adv
  if (saysNothing(adv)) return obs

  const a = adv as Record<string, unknown>
  const o = obs as Record<string, unknown>

  if (a.type === 'array' && o.type === 'array') {
    return { ...a, items: fillGaps(a.items, o.items) }
  }
  if (a.properties && o.properties) {
    const ap = a.properties as Record<string, unknown>
    const op = o.properties as Record<string, unknown>
    const properties: Record<string, unknown> = {}
    for (const key of new Set([...Object.keys(ap), ...Object.keys(op)])) {
      properties[key] = key in ap ? fillGaps(ap[key], op[key]) : op[key]
    }
    return { ...a, properties }
  }
  return a
}

const sharedDefs: Record<string, unknown> = {}
const results: Record<string, { component: string; schema: unknown; source: string }> = {}
const skipped: string[] = []

for (const tool of used) {
  const entry = advertised.get(tool)
  if (!entry) {
    console.warn(`  ! ${tool} is not advertised by the gateway — skipping.`)
    continue
  }

  const observed = observedShapes[tool]
  let schema = entry.outputSchema
  let source = 'advertised'

  if (isFreeForm(schema)) {
    if (!observed) {
      skipped.push(tool)
      continue
    }
    // Nothing advertised, so the observed shape is all there is.
    schema = observed
    source = 'observed'
  } else if (observed) {
    const filled = fillGaps(schema, observed) as Record<string, unknown>
    if (JSON.stringify(filled) !== JSON.stringify(schema)) source = 'advertised + observed'
    schema = filled
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

  results[tool] = { component: componentName(tool), schema: rewriteRefs(rest), source }
}

const bySource = (s: string) => Object.entries(results).filter(([, r]) => r.source === s).map(([t]) => t)

const banner = `/**
 * GENERATED — do not edit.
 *
 * Response shapes for each tool, from two sources:
 *
 *   - what the gateway advertises through tools/list, and
 *   - what real responses actually contain, captured by scripts/capture-shapes.ts.
 *
 * The second exists because the first is incomplete. Six tools advertise a bare
 * \`{additionalProperties: true}\`, and several described ones leave a leaf
 * untyped — doordash_find_restaurants declares \`stores\` as an array with no
 * item schema at all. Where the advertised schema says nothing, the observed
 * shape fills in; where it is specific, it wins, because its field names and
 * descriptions are DoorDash's own and the observed shape is one account's data
 * on one day.
 *
 * Regenerate with:
 *   bun run list-tools --dump      # advertised schemas
 *   bun run capture-shapes         # observed shapes (types only, no values)
 *   bun run gen-schemas
 *
 * These document the response; they do not validate it. DoorDash can add a
 * field at any time and a response carrying one must still pass through
 * untouched, so nothing here is enforced at runtime.
 *
 * advertised only:        ${bySource('advertised').length}
 * advertised + observed:  ${bySource('advertised + observed').length}
 * observed only:          ${bySource('observed').length}
 * still undocumented:     ${skipped.length}${skipped.length ? `\n${skipped.map((t) => ` *   - ${t}`).join('\n')}` : ''}
 */
`

const body = `${banner}
/** Shared object definitions, hoisted out of each tool's \`$defs\`. */
export const SHARED_RESULT_DEFS: Record<string, unknown> = ${JSON.stringify(sharedDefs, null, 2)}

/** Tool name -> the OpenAPI component name and schema for its result. */
export const TOOL_RESULT_SCHEMAS: Record<string, { component: string; schema: Record<string, unknown>; source: string }> = ${JSON.stringify(
  results,
  null,
  2,
)}
`

writeFileSync(OUT, body)

console.log(`\nWrote ${OUT}`)
console.log(`  advertised only:       ${bySource('advertised').length}`)
console.log(`  advertised + observed: ${bySource('advertised + observed').length}`)
console.log(`  observed only:         ${bySource('observed').length}`)
console.log(`  shared defs:           ${Object.keys(sharedDefs).length}`)
if (skipped.length) {
  console.log(`\n  still undocumented (${skipped.length}): ${skipped.join(', ')}`)
  console.log('  Run `bun run capture-shapes` to derive these from real responses.')
}
