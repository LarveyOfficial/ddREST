/** Discovery tools: restaurants, stores, menus, items. */

import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv } from '../types.ts'
import { TOOLS } from '../mcp/tools.ts'
import { callTool, security, toolResponses } from './shared.ts'
import { AddressIdQuery, LatitudeQuery, LongitudeQuery, StoreIdParam } from '../schemas/common.ts'
import { resolveLocation } from './location.ts'

const LOCATION_NOTE =
  'Give a location as either `latitude`+`longitude` or an `address_id` from GET /v1/addresses — not both. ' +
  'Using `address_id` costs one extra upstream lookup to read the coordinates off the saved address.'

const tags = ['Discovery']

export function registerDiscoveryRoutes(app: OpenAPIHono<AppEnv>): void {
  // doordash_find_restaurants
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/restaurants',
      tags,
      summary: 'Search for restaurants near a location',
      description:
        `${LOCATION_NOTE} With no location at all, DEFAULT_LATITUDE/DEFAULT_LONGITUDE are used.`,
      security,
      request: {
        query: z.object({
          query: z.string().min(1).meta({ example: 'pizza near me' }),
          latitude: LatitudeQuery.optional(),
          longitude: LongitudeQuery.optional(),
          address_id: AddressIdQuery.optional(),
          limit: z.coerce.number().int().min(1).max(50).default(5),
        }),
      },
      responses: toolResponses('Matching restaurants.'),
    }),
    async (c) => {
      const cfg = c.get('config')
      const { query, limit, ...location } = c.req.valid('query')
      const { latitude, longitude } = await resolveLocation(c, location)
      return c.json(
        await callTool(c, TOOLS.findRestaurants, {
          query,
          latitude: latitude ?? cfg.defaultLatitude,
          longitude: longitude ?? cfg.defaultLongitude,
          max_stores: limit,
        }),
      )
    },
  )

  // internal_find_nearby_stores
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/nearby-stores',
      tags,
      summary: 'Find nearby non-restaurant stores',
      description: LOCATION_NOTE,
      security,
      request: {
        query: z.object({
          vertical_scope: z
            .enum(['grocery', 'nv', 'alcohol', 'convenience', 'pets', 'retail'])
            .default('grocery')
            .meta({
              description:
                'grocery = grocery + DashMart; nv = all non-restaurant verticals; the rest narrow to one type.',
            }),
          limit: z.coerce.number().int().min(1).max(50).default(5),
          latitude: LatitudeQuery.optional(),
          longitude: LongitudeQuery.optional(),
          address_id: AddressIdQuery.optional(),
        }),
      },
      responses: toolResponses('Nearby stores.'),
    }),
    async (c) => {
      const { vertical_scope, limit, ...location } = c.req.valid('query')
      const { latitude, longitude } = await resolveLocation(c, location)
      // Upstream expects these paired, so send both or neither.
      const hasCoords = latitude !== undefined && longitude !== undefined
      return c.json(
        await callTool(c, TOOLS.findNearbyStores, {
          vertical_scope,
          max_stores: limit,
          user_lat: hasCoords ? latitude : undefined,
          user_lon: hasCoords ? longitude : undefined,
        }),
      )
    },
  )

  // internal_get_store_info
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/stores/{store_id}',
      tags,
      summary: 'Get store details',
      security,
      request: { params: z.object({ store_id: StoreIdParam }) },
      responses: toolResponses('Store details.'),
    }),
    async (c) => {
      const { store_id } = c.req.valid('param')
      return c.json(await callTool(c, TOOLS.getStoreInfo, { store_id }))
    },
  )

  // doordash_get_restaurant_menu
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/stores/{store_id}/menu',
      tags,
      summary: 'Get a restaurant menu',
      security,
      request: { params: z.object({ store_id: StoreIdParam }) },
      responses: toolResponses('Menu id and items.'),
    }),
    async (c) => {
      const { store_id } = c.req.valid('param')
      return c.json(await callTool(c, TOOLS.getRestaurantMenu, { store_id }))
    },
  )

  // internal_find_items_in_store
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/stores/{store_id}/items',
      tags,
      summary: 'Find items within a store by name',
      description: 'Repeat the `name` parameter to search for several items in one call.',
      security,
      request: {
        params: z.object({ store_id: StoreIdParam }),
        query: z.object({
          name: z
            .union([z.string().min(1), z.array(z.string().min(1))])
            .meta({ description: 'Item name to look for. Repeatable.' }),
        }),
      },
      responses: toolResponses('Matching items in the store.'),
    }),
    async (c) => {
      const { store_id } = c.req.valid('param')
      // Read raw so repeated `name` params all survive.
      const names = c.req.queries('name') ?? []
      return c.json(await callTool(c, TOOLS.findItemsInStore, { store_id, item_names: names }))
    },
  )

  // internal_get_item_details
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/stores/{store_id}/items/{item_id}',
      tags,
      summary: 'Get details for a store item',
      security,
      request: { params: z.object({ store_id: StoreIdParam, item_id: z.string().min(1) }) },
      responses: toolResponses('Item details.'),
    }),
    async (c) => {
      const { store_id, item_id } = c.req.valid('param')
      return c.json(await callTool(c, TOOLS.getItemDetails, { store_id, item_id }))
    },
  )

  // doordash_get_food_item
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/stores/{store_id}/menus/{menu_id}/items/{item_id}',
      tags,
      summary: 'Get details for a menu item',
      description: 'The restaurant-menu variant, which needs the menu id alongside the store and item.',
      security,
      request: {
        params: z.object({ store_id: StoreIdParam, menu_id: z.string().min(1), item_id: z.string().min(1) }),
      },
      responses: toolResponses('Menu item details.'),
    }),
    async (c) => {
      const { store_id, menu_id, item_id } = c.req.valid('param')
      return c.json(await callTool(c, TOOLS.getFoodItem, { store_id, menu_id, item_id }))
    },
  )
}
