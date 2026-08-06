/**
 * PKCE (RFC 7636, S256) parameter generation. Parameter sizes match dd-cli's,
 * which are themselves ordinary choices for this flow.
 */

import { createHash, randomBytes } from 'node:crypto'

/** dd-cli uses `secrets.token_urlsafe(64)[:128]`; 64 random bytes base64url is 86 chars. */
export function generateCodeVerifier(): string {
  return randomBytes(64).toString('base64url')
}

/** dd-cli uses `secrets.token_hex(16)`. */
export function generateState(): string {
  return randomBytes(16).toString('hex')
}

export function deriveCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url')
}
