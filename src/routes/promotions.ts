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
