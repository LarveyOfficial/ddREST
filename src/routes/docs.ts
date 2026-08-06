/**
 * Browsable API documentation at /docs, rendering this API's own generated
 * OpenAPI document from /openapi.json.
 *
 * The page is a thin shell that loads Swagger UI from a CDN, which keeps the
 * server dependency-free. `withCredentials` is on so "Try it out" sends the
 * dd_session cookie; requests made from this page are same-origin, so they
 * satisfy the CSRF origin check on cookie-authenticated writes.
 */

import type { OpenAPIHono } from '@hono/zod-openapi'
import type { AppEnv } from '../types.ts'

const SWAGGER_UI_VERSION = '5.29.0'
const CDN = `https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}`

const page = /* html */ `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ddREST — API docs</title>
    <link rel="stylesheet" href="${CDN}/swagger-ui.css" />
    <style>
      body { margin: 0; background: #fafafa; }
      .topbar { display: none; }
      .dd-note {
        font: 14px/1.5 system-ui, sans-serif;
        background: #fff8e1;
        border-bottom: 1px solid #ffe082;
        color: #4a3b00;
        padding: 12px 20px;
      }
      .dd-note code { background: #0000000d; padding: 1px 5px; border-radius: 3px; }
      .dd-note a { color: #7a5c00; }
    </style>
  </head>
  <body>
    <div class="dd-note">
      <strong>Logging in:</strong> DoorDash only allows loopback OAuth callbacks, so this server cannot receive the
      redirect. Call <code>POST /v1/auth/login/start</code>, open the returned <code>authorize_url</code> in a browser,
      then paste the <code>http://localhost:4180/…</code> URL it lands on (the page will fail to load — that is
      expected) into <code>POST /v1/auth/login/complete</code>. That sets the session cookie, after which
      <em>Try it out</em> works on every endpoint below.
      <br /><br />
      <strong>Signing in something without a browser?</strong> A device can call
      <code>POST /v1/auth/pair/request</code>, display the short code it gets back, and poll
      <code>POST /v1/auth/pair/token</code> while you approve it at <a href="/v1/auth/pair">/v1/auth/pair</a>.
    </div>
    <div id="swagger-ui"></div>
    <script src="${CDN}/swagger-ui-bundle.js" crossorigin></script>
    <script src="${CDN}/swagger-ui-standalone-preset.js" crossorigin></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        withCredentials: true,
        persistAuthorization: true,
        tryItOutEnabled: true,
        docExpansion: 'list',
        defaultModelsExpandDepth: 0,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: 'StandaloneLayout',
      })
    </script>
  </body>
</html>
`

export function registerDocsRoutes(app: OpenAPIHono<AppEnv>): void {
  app.get('/docs', (c) => c.html(page))
}
