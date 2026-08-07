/**
 * Order status as a stream instead of a poll loop.
 *
 * DoorDash offers no push for order progress, so something has to poll. Doing
 * it here rather than in every client means one poll loop per watcher instead
 * of one per client-side timer, and it turns "check every 15 seconds from a
 * Raspberry Pi" into a single request that stays open.
 *
 * Deliberately quiet: an event is emitted on the first poll and thereafter only
 * when the status actually changes, so a stream left open through a 40-minute
 * delivery produces a handful of events rather than 160 identical ones. The
 * stream ends on its own once the order reaches a terminal state.
 */

import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi'
import { streamSSE } from 'hono/streaming'
import { ApiError } from '../errors.ts'
import type { AppEnv } from '../types.ts'
import { TOOLS } from '../mcp/tools.ts'
import { callTool, security, trackingUrl } from './shared.ts'
import { resolveOrderUuid } from './resolve.ts'
import { OrderUuidParam } from '../schemas/common.ts'

/**
 * Statuses that mean "keep polling"; everything else is terminal.
 *
 * internal_get_order_status is a *post-submit processing* poll, not a delivery
 * tracker. Its documented values are `pending` (still clearing payment/fraud),
 * `successful`, `action_required`, `failed` and `not_found`. Only `pending` —
 * and briefly `not_found`, which is transient right after submit — is worth
 * polling on; `successful`/`action_required`/`failed` are all end states.
 *
 * Modelled as the continue-set rather than a terminal-set on purpose: the tool
 * reports whether the order went *through*, and DoorDash exposes no further
 * "preparing / picked up / delivered" progression here, so waiting for those
 * words (as an earlier version did) means never stopping.
 */
const STILL_PROCESSING = new Set(['pending', 'not_found'])

export function registerOrderStreamRoute(app: OpenAPIHono<AppEnv>): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/orders/{order_uuid}/status/stream',
      tags: ['Orders'],
      summary: 'Watch an order clear processing (Server-Sent Events)',
      description:
        'The same data as `GET /v1/orders/{order_uuid}/status`, pushed as it changes, so a client waits instead ' +
        'of polling.\n\n' +
        '**This tracks post-submit *processing*, not delivery.** DoorDash’s status here goes `pending` → ' +
        '`successful` (payment and fraud cleared, order placed) — or `action_required` / `failed` — and stops ' +
        'there. It does **not** report preparing / picked-up / delivered; DoorDash exposes no such progression ' +
        'through this API. So the stream ends as soon as the order is no longer `pending` — usually after a ' +
        'poll or two — rather than following the delivery. For that, open the `doordashTrackingUrl` on every ' +
        'event.\n\n' +
        'Events are `status` (the full payload plus `doordashTrackingUrl`, on the first poll and on every change ' +
        'afterwards), `error` (a poll failed; the stream continues), and `end` (why it stopped: `terminal`, ' +
        '`timeout` or `client`, also carrying `doordashTrackingUrl`). Each `status` event carries an ' +
        'incrementing `id`.\n\n' +
        'The poll interval and the maximum stream lifetime are set by `ORDER_STREAM_INTERVAL_SECONDS` and ' +
        '`ORDER_STREAM_MAX_SECONDS`.',
      security,
      request: { params: z.object({ order_uuid: OrderUuidParam }) },
      responses: {
        200: {
          description: 'An event stream of status changes.',
          content: {
            'text/event-stream': {
              schema: z.string().meta({
                description: 'SSE frames. `event:` is one of status, error, end; `data:` is JSON.',
              }),
            },
          },
        },
        400: { description: 'Invalid request, or `latest` matched no order.' },
        401: { description: 'Missing, invalid or expired session.' },
      },
    }),
    async (c) => {
      const cfg = c.get('config')
      // Resolved before the stream opens so `latest` matching nothing is a
      // plain 400 rather than an error frame inside a 200.
      const orderUuid = await resolveOrderUuid(c, c.req.valid('param').order_uuid)

      const intervalMs = cfg.orderStreamIntervalSeconds * 1000
      const deadline = Date.now() + cfg.orderStreamMaxSeconds * 1000
      // Added to every event: the API's status stops at "placed", so the live
      // page is where the caller goes next.
      const doordashTrackingUrl = trackingUrl(c, orderUuid)

      return streamSSE(c, async (stream) => {
        let lastStatus: string | undefined
        let id = 0
        let ended: 'terminal' | 'timeout' | 'client' = 'timeout'

        // Hono resolves this when the client disconnects; without checking it
        // the loop would keep calling DoorDash for a reader that has gone.
        let aborted = false
        stream.onAbort(() => {
          aborted = true
        })

        while (!aborted && Date.now() < deadline) {
          let payload: Record<string, unknown> | undefined
          try {
            payload = await callTool(c, TOOLS.getOrderStatus, { order_uuid: orderUuid })
          } catch (err) {
            await stream.writeSSE({
              event: 'error',
              data: JSON.stringify(
                err instanceof ApiError
                  ? err.toBody()
                  : { error: 'upstream_error', message: 'Failed to read the order status.' },
              ),
            })
          }

          if (payload) {
            const status = typeof payload.status === 'string' ? payload.status : undefined
            // First poll always emits, so a client that connects late still
            // learns the current state without waiting for a change.
            if (status !== lastStatus || lastStatus === undefined) {
              lastStatus = status
              await stream.writeSSE({
                event: 'status',
                id: String(++id),
                data: JSON.stringify({ ...payload, doordashTrackingUrl }),
              })
            }
            // A concrete status that is not a processing one is an end state.
            // An empty/absent status is treated as terminal too rather than
            // looping to the time cap on a response that carries nothing.
            if (status === undefined || !STILL_PROCESSING.has(status.toLowerCase())) {
              ended = 'terminal'
              break
            }
          }

          await stream.sleep(intervalMs)
        }

        // Nothing to say to a reader that has already gone.
        if (aborted) return
        await stream.writeSSE({
          event: 'end',
          data: JSON.stringify({ reason: ended, order_uuid: orderUuid, last_status: lastStatus, doordashTrackingUrl }),
        })
      })
    },
  )
}
