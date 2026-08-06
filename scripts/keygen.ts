/** Prints a SESSION_KEYS value. Rotate by prepending a new key to the list. */

import { generateSessionKey } from '../src/crypto/seal.ts'

const count = Number(process.argv[2] ?? 1)
if (!Number.isInteger(count) || count < 1) {
  console.error('Usage: bun run keygen [count]')
  process.exit(1)
}

console.log(`SESSION_KEYS=${Array.from({ length: count }, generateSessionKey).join(',')}`)
