/** Saved addresses and payment methods. */

import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv } from '../types.ts'
import { TOOLS } from '../mcp/tools.ts'
import { callTool, security, toolResponses } from './shared.ts'

const tags = ['Account']

/**
 * These two routes key off `address_link_id`, not `address_id`.
 *
 * Both appear on every entry from GET /v1/addresses and they are different
 * values. `address_id` identifies the place; `address_link_id` identifies this
 * account's link to it, which is what carries a personal label and personal
 * delivery instructions.
 */
const ADDRESS_LINK_NOTE =
  'Keyed by `address_link_id` from GET /v1/addresses — **not** `address_id`. Both appear on every saved ' +
  'address: `address_id` is the place itself, `address_link_id` is this account’s link to it, which is what ' +
  'holds the label and the instructions.'

const AddressLinkIdParam = z.string().min(1).meta({
  description: 'The `address_link_id` of a saved address.',
  example: '6065321966',
})

export function registerAccountRoutes(app: OpenAPIHono<AppEnv>): void {
  // doordash_list_delivery_addresses
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/addresses',
      tags,
      summary: 'List saved delivery addresses',
      security,
      responses: toolResponses('Saved addresses.', TOOLS.listDeliveryAddresses),
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
      responses: toolResponses('Active address updated.', TOOLS.setDeliveryAddress),
    }),
    async (c) => c.json(await callTool(c, TOOLS.setDeliveryAddress, c.req.valid('json'))),
  )

  // internal_set_delivery_instructions
  app.openapi(
    createRoute({
      method: 'put',
      path: '/v1/addresses/{address_link_id}/instructions',
      tags,
      summary: 'Set the Dasher instructions for a saved address',
      description: ADDRESS_LINK_NOTE,
      security,
      request: {
        params: z.object({ address_link_id: AddressLinkIdParam }),
        body: {
          required: true,
          content: {
            'application/json': {
              schema: z
                .object({
                  delivery_instructions: z.string().meta({
                    description: 'Shown to the Dasher, e.g. "Gate code 1234". An empty string clears them.',
                  }),
                })
                .openapi('DeliveryInstructionsBody'),
            },
          },
        },
      },
      responses: toolResponses('Instructions saved.', TOOLS.setDeliveryInstructions),
    }),
    async (c) => {
      const { address_link_id } = c.req.valid('param')
      return c.json(await callTool(c, TOOLS.setDeliveryInstructions, { address_link_id, ...c.req.valid('json') }))
    },
  )

  // internal_set_address_label
  app.openapi(
    createRoute({
      method: 'put',
      path: '/v1/addresses/{address_link_id}/label',
      tags,
      summary: 'Label a saved address',
      description: `${ADDRESS_LINK_NOTE}\n\nThe label is what the DoorDash app shows for the address.`,
      security,
      request: {
        params: z.object({ address_link_id: AddressLinkIdParam }),
        body: {
          required: true,
          content: {
            'application/json': {
              schema: z
                .object({
                  label: z.string().min(1).meta({
                    description: '"home", "work", or anything else. "office" is treated as "work" upstream.',
                    example: 'home',
                  }),
                })
                .openapi('AddressLabelBody'),
            },
          },
        },
      },
      responses: toolResponses('Label saved.', TOOLS.setAddressLabel),
    }),
    async (c) => {
      const { address_link_id } = c.req.valid('param')
      return c.json(await callTool(c, TOOLS.setAddressLabel, { address_link_id, ...c.req.valid('json') }))
    },
  )

  // doordash_get_payment_info
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/payment-methods',
      tags,
      summary: 'List saved payment methods',
      security,
      responses: toolResponses('Saved payment methods (as DoorDash returns them — no full card numbers).', TOOLS.getPaymentInfo),
    }),
    async (c) => c.json(await callTool(c, TOOLS.getPaymentInfo, {})),
  )
}
