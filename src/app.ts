import { OpenAPIHono, z } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import type { Config } from './config.ts'
import { ApiError } from './errors.ts'
import { McpClient } from './mcp/client.ts'
import { createAuthSealers } from './auth/tokens.ts'
import { sessionMiddleware } from './auth/middleware.ts'
import { SESSION_PREFIX } from './session/store.ts'
import { SessionManager } from './session/manager.ts'
import { PairingManager } from './pairing/manager.ts'
import type { AppEnv } from './types.ts'
import { SHARED_RESULT_DEFS } from './schemas/results.generated.ts'
import { registerAuthRoutes } from './routes/auth.ts'
import { registerPairingRoutes } from './routes/pair.ts'
import { registerDocsRoutes } from './routes/docs.ts'
import { registerDiscoveryRoutes } from './routes/discovery.ts'
import { registerCartRoutes } from './routes/carts.ts'
import { registerPromotionRoutes } from './routes/promotions.ts'
import { registerOrderRoutes } from './routes/orders.ts'
import { registerAccountRoutes } from './routes/account.ts'

export function createApp(cfg: Config): OpenAPIHono<AppEnv> {
  const sealers = createAuthSealers(cfg)
  const mcp = new McpClient(cfg)
  const sessions = new SessionManager(cfg)
  sessions.startSweeper()
  const pairings = new PairingManager(cfg, sealers)
  if (cfg.pairingEnabled) pairings.startSweeper()

  const app = new OpenAPIHono<AppEnv>({
    // Surface Zod failures in the same error envelope as everything else.
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            error: 'invalid_request',
            message: 'Request validation failed.',
            issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          },
          400,
        )
      }
    },
  })

  app.use('*', async (c, next) => {
    c.set('config', cfg)
    c.set('sealers', sealers)
    c.set('sessions', sessions)
    c.set('pairings', pairings)
    c.set('mcp', mcp)
    await next()
  })

  if (cfg.corsOrigins.length > 0) {
    app.use(
      '/v1/*',
      cors({
        origin: cfg.corsOrigins,
        credentials: true,
        allowHeaders: ['content-type', 'authorization'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        maxAge: 600,
      }),
    )
  }

  app.get('/healthz', (c) => c.json({ ok: true }))

  registerDocsRoutes(app)
  registerAuthRoutes(app)
  registerPairingRoutes(app)

  // Everything below the auth routes needs a session. Registered as route-level
  // middleware rather than a blanket app.use so the OpenAPI document reflects it.
  const guarded = sessionMiddleware()
  for (const path of ['/v1/restaurants', '/v1/nearby-stores', '/v1/offers', '/v1/stores/*', '/v1/carts', '/v1/carts/*', '/v1/orders', '/v1/orders/*', '/v1/addresses', '/v1/addresses/*', '/v1/payment-methods', '/v1/product-lists']) {
    app.use(path, guarded)
  }

  registerDiscoveryRoutes(app)
  registerCartRoutes(app)
  registerPromotionRoutes(app)
  registerOrderRoutes(app)
  registerAccountRoutes(app)

  // Object shapes shared between tool results, hoisted out of each tool's
  // `$defs` so the `$ref`s in them resolve inside the OpenAPI document.
  for (const [name, schema] of Object.entries(SHARED_RESULT_DEFS)) {
    app.openAPIRegistry.registerComponent('schemas', name, schema as Record<string, unknown>)
  }

  app.openAPIRegistry.registerComponent('securitySchemes', 'sessionCookie', {
    type: 'apiKey',
    in: 'cookie',
    name: cfg.cookieName,
    description: `Session cookie (value begins "${SESSION_PREFIX}."). Set by /v1/auth/login/complete. Stays valid across silent token renewals.`,
  })
  app.openAPIRegistry.registerComponent('securitySchemes', 'sessionBearer', {
    type: 'http',
    scheme: 'bearer',
    description:
      `Session credential (begins "${SESSION_PREFIX}."), for non-browser clients. ` +
      'This is not the DoorDash access token, and it does not change when the session renews.',
  })

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'ddREST — DoorDash Consumer MCP over REST',
      version: '0.1.0',
      description:
        'A REST implementation of the DoorDash Consumer MCP server. The gateway speaks JSON-RPC 2.0 over ' +
        'Server-Sent Events; this API puts conventional REST resources in front of it, so clients never see ' +
        'JSON-RPC, SSE, or the `intent` argument every tool requires.\n\n' +
        'Inspired by [dd-cli](https://github.com/doordash-oss/doordash-cli), DoorDash\u2019s own terminal client ' +
        'for the same gateway. Independent implementation.\n\n' +
        '**Login is a paste-back flow.** DoorDash only permits loopback OAuth callbacks, so this server cannot ' +
        'receive the redirect. `POST /v1/auth/login/start` returns a URL to open plus a sealed ticket; after ' +
        'signing in, the browser lands on a `http://localhost:4180/...` URL that fails to load. Copy it from the ' +
        'address bar and post it to `POST /v1/auth/login/complete`.\n\n' +
        '**Sessions renew themselves.** DoorDash access tokens last 72h and their refresh tokens rotate on every ' +
        'use, so tokens are held server-side and renewed silently. They are AES-256-GCM encrypted under a ' +
        'per-session key that exists only inside your session credential, so the database alone decrypts to ' +
        'nothing. Your credential never changes when a renewal happens — log in once and keep using it until the ' +
        'session’s hard expiry.\n\n' +
        'Monetary values are in **cents** throughout.',
    },
    tags: [
      { name: 'Auth', description: 'Paste-back OAuth login and session inspection.' },
      {
        name: 'Pairing',
        description:
          'RFC 8628-style device pairing, for provisioning a session to something with no browser. Additive — ' +
          'the Auth endpoints above are unchanged and remain the normal way in.',
      },
      { name: 'Discovery', description: 'Restaurants, stores, menus and items.' },
      { name: 'Grocery', description: 'Grocery product lists.' },
      { name: 'Cart', description: 'Cart lifecycle.' },
      { name: 'Promotions', description: 'Cart promotions.' },
      { name: 'Orders', description: 'History, preview, submission, status.' },
      { name: 'Account', description: 'Saved addresses and payment methods.' },
    ],
  })

  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json(err.toBody(), err.status as 400)
    if (err instanceof HTTPException) {
      return c.json({ error: 'invalid_request', message: err.message }, err.status)
    }
    if (err instanceof z.ZodError) {
      return c.json({ error: 'invalid_request', message: 'Request validation failed.', issues: err.issues }, 400)
    }
    console.error('Unhandled error:', err)
    return c.json({ error: 'internal_error', message: 'Unexpected server error.' }, 500)
  })

  app.notFound((c) => c.json({ error: 'invalid_request', message: `No route for ${c.req.method} ${c.req.path}` }, 404))

  return app
}
