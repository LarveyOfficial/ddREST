/**
 * Input objects shared across several tools.
 *
 * Monetary values are cents throughout, matching the upstream convention.
 */

import { z } from '@hono/zod-openapi'

/**
 * Recursive item customisation: each level needs id + name + quantity.
 *
 * Written with a getter rather than `z.lazy` deliberately. `z.lazy` rebuilds the
 * inner object on every access, so the OpenAPI generator never recognises the
 * cycle and recurses until the stack blows; the getter form keeps one stable
 * reference, which registers as a `$ref` back to this named component.
 */
export const NestedOptionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    quantity: z.int().min(1),
    get options() {
      return z.array(NestedOptionSchema).optional()
    },
  })
  .openapi('NestedOption')

export type NestedOption = z.infer<typeof NestedOptionSchema>

export const CartItemInputSchema = z
  .object({
    item_id: z.string().min(1),
    item_name: z.string().min(1),
    quantity: z.int().min(1),
    nested_options: z
      .array(NestedOptionSchema)
      .optional()
      .meta({ description: 'Recursive customisations (options, extras, choices).' }),
  })
  .openapi('CartItemInput')

export const GroupCartConfigSchema = z
  .looseObject({
    spend_limit_cents: z.int().min(0).optional(),
  })
  .openapi('GroupCartConfig', { description: 'Group-cart settings (host-pays-all, per-participant limit).' })

export const StoreIdParam = z.string().min(1).meta({ description: 'DoorDash store id.', example: '327011' })
export const CartUuidParam = z.string().min(1).meta({ description: 'Cart UUID.' })
export const OrderUuidParam = z.string().min(1).meta({ description: 'Order UUID.' })

/** Query params arrive as strings; coerce then bound. */
export const LatitudeQuery = z.coerce.number().min(-90).max(90)
export const LongitudeQuery = z.coerce.number().min(-180).max(180)
