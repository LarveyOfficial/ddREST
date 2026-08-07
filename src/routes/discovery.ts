/** Discovery tools: restaurants, stores, menus, items. */

import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv } from '../types.ts'
import { TOOLS } from '../mcp/tools.ts'
import { callTool, security, toolResponses } from './shared.ts'
import { AddressIdQuery, BooleanQuery, LatitudeQuery, LongitudeQuery, StoreIdParam } from '../schemas/common.ts'
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
          radius: z.coerce
            .number()
            .min(0.1)
            .max(50)
            .optional()
            .meta({
              description:
                'Search radius in miles. Upstream default is 3, which is tight outside a dense city — widen it ' +
                'for suburban or rural areas, or when looking for the best option rather than the nearest.',
              example: 5,
            }),
          desired_restaurant_name: z.string().min(1).optional().meta({
            description:
              'Narrow to a specific named restaurant, e.g. "Chipotle". Leave unset for generic queries like ' +
              '"pizza" — upstream treats this as an exact-ish match, not a hint.',
          }),
          item_name: z.string().min(1).optional().meta({
            description:
              'Surface a specific menu item by name, e.g. "pad thai". For dish-level searches only; leave unset ' +
              'for mood queries like "something spicy".',
          }),
          delivery_address_label: z.string().min(1).optional().meta({
            description:
              'Display label for the location, e.g. "Near Fair Lawn, NJ". Affects presentation only, and only ' +
              'in DoorDash’s own widget — it has no effect on which restaurants are returned.',
          }),
        }),
      },
      responses: toolResponses('Matching restaurants.', TOOLS.findRestaurants),
    }),
    async (c) => {
      const cfg = c.get('config')
      const { query, limit, latitude, longitude, address_id, ...rest } = c.req.valid('query')
      const resolved = await resolveLocation(c, { latitude, longitude, address_id })
      return c.json(
        await callTool(c, TOOLS.findRestaurants, {
          query,
          latitude: resolved.latitude ?? cfg.defaultLatitude,
          longitude: resolved.longitude ?? cfg.defaultLongitude,
          max_stores: limit,
          ...rest,
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
          use_store_ranker: BooleanQuery.optional().meta({
            description:
              'Experimental upstream flag: rank by DoorDash’s store ranker instead of soonest-ETA first. Falls ' +
              'back to ETA order if the ranker is unavailable.',
          }),
        }),
      },
      responses: toolResponses('Nearby stores.', TOOLS.findNearbyStores),
    }),
    async (c) => {
      const { vertical_scope, limit, latitude, longitude, address_id, use_store_ranker } = c.req.valid('query')
      const resolved = await resolveLocation(c, { latitude, longitude, address_id })
      // Upstream expects these paired, so send both or neither.
      const hasCoords = resolved.latitude !== undefined && resolved.longitude !== undefined
      return c.json(
        await callTool(c, TOOLS.findNearbyStores, {
          vertical_scope,
          max_stores: limit,
          user_lat: hasCoords ? resolved.latitude : undefined,
          user_lon: hasCoords ? resolved.longitude : undefined,
          use_store_ranker,
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
      responses: toolResponses('Store details.', TOOLS.getStoreInfo),
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
      request: {
        params: z.object({ store_id: StoreIdParam }),
        query: z.object({
          include_extras: BooleanQuery.optional().meta({
            description:
              'Return every item’s extras and popular modifications inline. Makes the response substantially ' +
              'larger; prefer the single-item endpoint when you only need one item’s options.',
          }),
          store_name: z.string().min(1).optional().meta({
            description: 'Restaurant display name, passed through for presentation. Does not affect the menu returned.',
          }),
        }),
      },
      responses: toolResponses('Menu id and items.', TOOLS.getRestaurantMenu),
    }),
    async (c) => {
      const { store_id } = c.req.valid('param')
      return c.json(await callTool(c, TOOLS.getRestaurantMenu, { store_id, ...c.req.valid('query') }))
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
          max_results: z.coerce.number().int().min(1).max(100).optional().meta({
            description: 'Results per item searched. Upstream default is 20.',
          }),
          snap_eligible_only: BooleanQuery.optional().meta({
            description: 'Return only SNAP/EBT-eligible items.',
          }),
          disable_ads: BooleanQuery.optional().meta({
            description:
              'Suppress sponsored placements. Worth setting when you take only the first result per query, since ' +
              'a sponsored placement is not ranked and would otherwise silently become that result.',
          }),
        }),
      },
      responses: toolResponses('Matching items in the store.', TOOLS.findItemsInStore),
    }),
    async (c) => {
      const { store_id } = c.req.valid('param')
      const { max_results, snap_eligible_only, disable_ads } = c.req.valid('query')
      // Read raw so repeated `name` params all survive.
      const names = c.req.queries('name') ?? []
      return c.json(
        await callTool(c, TOOLS.findItemsInStore, {
          store_id,
          item_names: names,
          max_results,
          snap_eligible_only,
          disable_ads,
        }),
      )
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
      responses: toolResponses('Item details.', TOOLS.getItemDetails),
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
      responses: toolResponses('Menu item details.', TOOLS.getFoodItem),
    }),
    async (c) => {
      const { store_id, menu_id, item_id } = c.req.valid('param')
      return c.json(await callTool(c, TOOLS.getFoodItem, { store_id, menu_id, item_id }))
    },
  )
}
