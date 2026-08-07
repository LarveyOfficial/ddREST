/** Saved addresses and payment methods. */

import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv } from '../types.ts'
import { TOOLS } from '../mcp/tools.ts'
import { callTool, security, toolResponses } from './shared.ts'
import { resolveLocation } from './location.ts'
import { AddressIdQuery, LatitudeQuery, LongitudeQuery } from '../schemas/common.ts'

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
  // doordash_get_user_info
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/me',
      tags,
      summary: 'Who this session belongs to',
      description: 'The DoorDash account the current session authenticates as.',
      security,
      responses: toolResponses('Account details.', TOOLS.getUserInfo),
    }),
    async (c) => c.json(await callTool(c, TOOLS.getUserInfo, {})),
  )

  // doordash_address_autocomplete
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/addresses/search',
      tags,
      summary: 'Search for an address to add',
      description:
        'Autocomplete over real addresses, for adding one the account has not saved before. Each result carries ' +
        'a `place_id`; POST it to /v1/addresses to save it.\n\n' +
        'Results are biased toward the location you give, which improves them noticeably for a partial query ' +
        'like "21 E Bellevue".',
      security,
      request: {
        query: z.object({
          query: z.string().min(1).meta({ description: 'Partial address text.', example: '21 E Bellevue Pl' }),
          country: z
            .string()
            .length(2)
            .optional()
            .meta({ description: 'ISO country code to restrict results, e.g. `us`. Omit to search globally.' }),
          latitude: LatitudeQuery.optional(),
          longitude: LongitudeQuery.optional(),
          address_id: AddressIdQuery.optional(),
        }),
      },
      responses: toolResponses('Address predictions.', TOOLS.addressAutocomplete),
    }),
    async (c) => {
      const { query, country, ...location } = c.req.valid('query')
      const { latitude, longitude } = await resolveLocation(c, location)
      return c.json(
        await callTool(c, TOOLS.addressAutocomplete, { query, country, latitude, longitude }),
      )
    },
  )

  // doordash_select_address
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/addresses',
      tags,
      summary: 'Save a new delivery address',
      description:
        'Takes a `place_id` from /v1/addresses/search and saves it to the account, which is the only way to add ' +
        'an address the account has never used.\n\n' +
        'This also makes it the account’s current delivery address, because upstream does both in one step. ' +
        'Set `save_to_profile: false` to resolve the address without keeping it — useful for a one-off ' +
        'delivery.\n\n' +
        'The detail fields (`subpremise`, `entry_code`, and so on) are worth filling in at creation time: they ' +
        'are what a Dasher actually reads.',
      security,
      request: {
        body: {
          required: true,
          content: {
            'application/json': {
              schema: z
                .object({
                  place_id: z.string().min(1).meta({ description: 'From GET /v1/addresses/search.' }),
                  subpremise: z.string().optional().meta({ description: 'Apartment, suite, room or floor.' }),
                  entry_code: z.string().optional().meta({ description: 'Gate or entry code.' }),
                  building_name: z.string().optional().meta({ description: 'Building, hotel or business name.' }),
                  delivery_instructions: z.string().optional(),
                  address_type: z.enum(['house', 'apartment', 'hotel', 'office', 'other']).optional(),
                  delivery_preference: z.enum(['leave', 'meet']).optional(),
                  delivery_location: z
                    .enum(['door', 'lobby', 'apartment_door', 'room_door', 'office_suite', 'outside'])
                    .optional(),
                  save_to_profile: z.boolean().optional().meta({
                    description: 'Defaults to true upstream. False resolves the address without saving it.',
                  }),
                })
                .openapi('CreateAddressBody'),
            },
          },
        },
      },
      responses: toolResponses('The saved address.', TOOLS.selectAddress),
    }),
    async (c) => c.json(await callTool(c, TOOLS.selectAddress, c.req.valid('json'))),
  )

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
