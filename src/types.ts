import type { Config } from './config.ts'
import type { McpClient } from './mcp/client.ts'
import type { AuthSealers } from './auth/tokens.ts'
import type { SessionManager, ResolvedSession } from './session/manager.ts'
import type { PairingManager } from './pairing/manager.ts'
import type { IdempotencyStore } from './orders/idempotency.ts'

/** How the caller presented its session. Drives whether CSRF checks apply. */
export type AuthTransport = 'cookie' | 'bearer'

export interface AppEnv {
  Bindings: Record<string, never>
  Variables: {
    config: Config
    sealers: AuthSealers
    sessions: SessionManager
    pairings: PairingManager
    idempotency: IdempotencyStore
    mcp: McpClient
    session: ResolvedSession
    accessToken: string
    authTransport: AuthTransport
  }
}
