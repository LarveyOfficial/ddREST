/** Cart promotions. */

import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv } from '../types.ts'
import { TOOLS } from '../mcp/tools.ts'
import { callTool, security, toolResponses } from './shared.ts'
import { CartUuidParam, StoreIdParam } from '../schemas/common.ts'

const tags = ['Promotions']

/** Ad targeting identifiers that accompany a promo code on apply/remove. */
const adFields = {
  campaign_id: z.string().min(1).optional(),
  ad_group_id: z.string().min(1).optional(),
  ad_id: z.string().min(1).optional(),
}

export function registerPromotionRoutes(app: OpenAPIHono<AppEnv>): void {
  // internal_list_eligible_cart_promotions
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/stores/{store_id}/promotions',
      tags,
      summary: 'List promotions the account is eligible for at a store',
      security,
      request: { params: z.object({ store_id: StoreIdParam }) },
      responses: toolResponses('Eligible promotions.', TOOLS.listPromotions),
    }),
    async (c) => {
      const { store_id } = c.req.valid('param')
      return c.json(await callTool(c, TOOLS.listPromotions, { store_id }))
    },
  )

  // internal_get_promo_eligible_items
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/stores/{store_id}/promotions/{campaign_id}/items',
      tags,
      summary: 'List the items that qualify for a promotion',
      description:
        'For promotions that need a specific item to be in the cart — a free item, BOGO, or percentage-off-item ' +
        'deal. `campaign_id` comes from the eligible-promotions list above.',
      security,
      request: {
        params: z.object({ store_id: StoreIdParam, campaign_id: z.string().min(1) }),
        query: z.object({
          max_results: z.coerce.number().int().min(1).max(50).optional().meta({
            description: 'Upstream defaults to 20 and caps at 50.',
          }),
          fulfillment_type: z.enum(['DELIVERY', 'PICKUP']).optional(),
        }),
      },
      responses: toolResponses('Items eligible for the promotion.', TOOLS.getPromoEligibleItems),
    }),
    async (c) => {
      const { store_id, campaign_id } = c.req.valid('param')
      return c.json(
        await callTool(c, TOOLS.getPromoEligibleItems, { store_id, campaign_id, ...c.req.valid('query') }),
      )
    },
  )

  // internal_get_applied_cart_promotions
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/carts/{cart_uuid}/promotions',
      tags,
      summary: 'Show the promotions currently applied to a cart',
      description:
        'What is actually on the cart, as opposed to what the account is eligible for. Reports the discount per ' +
        'promotion alongside the cart’s subtotal and total before tip.',
      security,
      request: { params: z.object({ cart_uuid: CartUuidParam }) },
      responses: toolResponses('Applied promotions and discount totals.', TOOLS.getAppliedPromotions),
    }),
    async (c) => {
      const { cart_uuid } = c.req.valid('param')
      return c.json(await callTool(c, TOOLS.getAppliedPromotions, { cart_uuid }))
    },
  )

  // internal_apply_cart_promotion
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/carts/{cart_uuid}/promotions',
      tags,
      summary: 'Apply a promotion to a cart',
      security,
      request: {
        params: z.object({ cart_uuid: CartUuidParam }),
        body: {
          required: true,
          content: {
            'application/json': {
              schema: z
                .object({ promo_code: z.string().min(1), ...adFields })
                .openapi('ApplyPromotionBody'),
            },
          },
        },
      },
      responses: toolResponses('Updated cart.', TOOLS.applyPromotion),
    }),
    async (c) => {
      const { cart_uuid } = c.req.valid('param')
      return c.json(await callTool(c, TOOLS.applyPromotion, { ...c.req.valid('json'), cart_uuid }))
    },
  )

  // internal_remove_cart_promotion
  app.openapi(
    createRoute({
      method: 'delete',
      path: '/v1/carts/{cart_uuid}/promotions/{promo_code}',
      tags,
      summary: 'Remove a promotion from a cart',
      security,
      request: {
        params: z.object({ cart_uuid: CartUuidParam, promo_code: z.string().min(1) }),
        query: z.object(adFields),
      },
      responses: toolResponses('Updated cart.', TOOLS.removePromotion),
    }),
    async (c) => {
      const { cart_uuid, promo_code } = c.req.valid('param')
      return c.json(await callTool(c, TOOLS.removePromotion, { ...c.req.valid('query'), cart_uuid, promo_code }))
    },
  )
}
