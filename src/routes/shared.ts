/**
 * Pieces every tool route reuses: the pass-through result schema, the standard
 * error responses, and the helper that actually issues the tool call.
 */

import { z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import type { AppEnv } from '../types.ts'
import { intentFor, type ToolName } from '../mcp/tools.ts'
import { TOOL_RESULT_SCHEMAS } from '../schemas/results.generated.ts'

/**
 * Tool responses are passed through unvalidated.
 *
 * DoorDash does not publish the response shapes, so validating against a guess
 * would reject real payloads the moment one carried a field we had not
 * anticipated. We document the body as free-form and forward it intact.
 */
export const ToolResultSchema = z
  .looseObject({})
  .openapi('ToolResult', {
    description:
      'Pass-through of the MCP tool result (`result.structuredContent`). Field-level shapes are not validated by ' +
      'this API, because DoorDash does not publish them.',
  })

export const ErrorSchema = z
  .looseObject({
    error: z.string().meta({ description: 'Stable machine-readable code.' }),
    message: z.string(),
  })
  .openapi('Error')

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
})

/** Attached to every authenticated tool route. */
export const commonErrorResponses = {
  400: errorResponse('Invalid request.'),
  401: errorResponse('Missing, invalid or expired session — start a new login.'),
  403: errorResponse('Origin rejected, or the DoorDash account is not enrolled in the consumer MCP beta.'),
  502: errorResponse('The DoorDash MCP gateway failed or returned an error.'),
  504: errorResponse('The DoorDash MCP gateway timed out.'),
} as const

/**
 * The documented result shape for a tool, or the generic pass-through when the
 * gateway describes its output as a bare object.
 *
 * The schema is attached as metadata rather than expressed in Zod: it comes
 * verbatim from the gateway (see src/schemas/results.generated.ts) and is for
 * documentation only. Nothing validates a response against it, so a new field
 * from DoorDash still passes through untouched.
 */
function resultSchemaFor(tool: ToolName) {
  const described = TOOL_RESULT_SCHEMAS[tool]
  if (!described) return ToolResultSchema
  return z.looseObject({}).meta({ id: described.component, ...described.schema })
}

export const okResponse = (description: string, tool?: ToolName) => ({
  description,
  content: { 'application/json': { schema: tool ? resultSchemaFor(tool) : ToolResultSchema } },
})

/** Standard 200 + error set for a tool-backed route. */
export const toolResponses = (description: string, tool?: ToolName) => ({
  200: okResponse(description, tool),
  ...commonErrorResponses,
})

/**
 * Issue a tool call for the current request. `intent` is injected here and
 * nowhere else, which is what keeps it off the public API surface.
 */
export function callTool(
  c: Context<AppEnv>,
  tool: ToolName,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return c.get('mcp').callTool(c.get('accessToken'), tool, { ...compact(args), intent: intentFor(tool) })
}

/** Drop undefined values so optional arguments are omitted rather than sent as null. */
export function compact(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    if (v !== undefined) out[k] = v
  }
  return out
}

/** Either credential is accepted, so this is an OR of two schemes. */
export const security: Record<string, string[]>[] = [{ sessionCookie: [] }, { sessionBearer: [] }]
