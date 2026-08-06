/** Saved addresses and payment methods. */

import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv } from '../types.ts'
import { TOOLS } from '../mcp/tools.ts'
import { callTool, security, toolResponses } from './shared.ts'

const tags = ['Account']

export function registerAccountRoutes(app: OpenAPIHono<AppEnv>): void {
  // doordash_list_delivery_addresses
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/addresses',
      tags,
      summary: 'List saved delivery addresses',
      security,
      responses: toolResponses('Saved addresses.'),
    }),
    async (c) => c.json(await callTool(c, TOOLS.listDeliveryAddresses, {})),
  )

  // doordash_set_delivery_address
  app.openapi(
    createRoute({
      method: 'put',
      path: '/v1/addresses/current',
      tags,
      summary: 'Set the active delivery address',
      security,
      request: {
        body: {
          required: true,
          content: {
            'application/json': {
              schema: z
                .object({
                  address_id: z.string().min(1).meta({ description: 'An id from GET /v1/addresses.' }),
                })
                .openapi('SetDeliveryAddressBody'),
            },
          },
        },
      },
      responses: toolResponses('Active address updated.'),
    }),
    async (c) => c.json(await callTool(c, TOOLS.setDeliveryAddress, c.req.valid('json'))),
  )

  // doordash_get_payment_info
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/payment-methods',
      tags,
      summary: 'List saved payment methods',
      security,
      responses: toolResponses('Saved payment methods (as DoorDash returns them — no full card numbers).'),
    }),
    async (c) => c.json(await callTool(c, TOOLS.getPaymentInfo, {})),
  )
}
