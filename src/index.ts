import { createApp } from './app.ts'
import { ConfigError, loadConfig } from './config.ts'

/** Seconds as something readable at a glance, for the startup banner. */
function duration(seconds: number): string {
  if (seconds >= 86_400) return `${+(seconds / 86_400).toFixed(1)}d`
  if (seconds >= 3_600) return `${+(seconds / 3_600).toFixed(1)}h`
  if (seconds >= 60) return `${+(seconds / 60).toFixed(1)}m`
  return `${seconds}s`
}

let cfg
try {
  cfg = loadConfig()
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`Configuration error: ${err.message}`)
    process.exit(1)
  }
  throw err
}

const app = createApp(cfg)

const server = Bun.serve({
  hostname: cfg.host,
  port: cfg.port,
  fetch: app.fetch,
})

console.log(`ddREST listening on http://${server.hostname}:${server.port}`)
console.log(`  Docs:     http://${server.hostname}:${server.port}/docs`)
console.log(`  OpenAPI:  http://${server.hostname}:${server.port}/openapi.json`)
console.log(`  MCP gateway: ${cfg.mcpBase}`)
console.log(`  OAuth callback: ${cfg.redirectUri}`)

// Print the effective session policy: these come from .env, which Bun loads
// automatically, so a stale file silently overrides the defaults.
console.log('  Session policy:')
console.log(`    max age  ${duration(cfg.sessionMaxAgeSeconds).padEnd(9)} (SESSION_MAX_AGE_SECONDS=${cfg.sessionMaxAgeSeconds})`)
console.log(`    idle out ${duration(cfg.sessionIdleTimeoutSeconds).padEnd(9)} (SESSION_IDLE_TIMEOUT_SECONDS=${cfg.sessionIdleTimeoutSeconds})`)
console.log(`    renew at ${duration(cfg.sessionRefreshSkewSeconds).padEnd(9)} before token expiry (SESSION_REFRESH_SKEW_SECONDS=${cfg.sessionRefreshSkewSeconds})`)
console.log(`    store    ${cfg.sessionDbPath}`)
if (!cfg.cookieSecure) {
  console.warn('  WARNING: COOKIE_SECURE=false — only acceptable for local http development.')
}
