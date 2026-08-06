/**
 * Split-key handles: an opaque client credential carrying both the row id to
 * look up and the key material that authorises it.
 *
 *     <prefix>.<base64url( id[16] || key[32] )>
 *
 * Two things are built on this shape, for the same reason — the server should
 * not hold, by itself, everything needed to use what the row protects:
 *
 *   - session credentials (src/session/store.ts), where the key decrypts the
 *     stored tokens and is written down nowhere;
 *   - device codes (src/pairing/store.ts), where only a hash of the key is
 *     stored, so a dump of the table yields no usable device code.
 */

import { randomBytes } from 'node:crypto'
import { KEY_LENGTH } from './aead.ts'

export const ID_LENGTH = 16

export interface Handle {
  /** Hex, suitable as a primary key. */
  id: string
  key: Buffer
}

export function formatHandle(prefix: string, id: string, key: Buffer): string {
  return `${prefix}.${Buffer.concat([Buffer.from(id, 'hex'), key]).toString('base64url')}`
}

export function createHandle(prefix: string): Handle & { credential: string } {
  const id = randomBytes(ID_LENGTH).toString('hex')
  const key = randomBytes(KEY_LENGTH)
  return { id, key, credential: formatHandle(prefix, id, key) }
}

export function parseHandle(prefix: string, credential: string): Handle | undefined {
  if (typeof credential !== 'string' || !credential.startsWith(`${prefix}.`)) return undefined

  let raw: Buffer
  try {
    raw = Buffer.from(credential.slice(prefix.length + 1), 'base64url')
  } catch {
    return undefined
  }
  if (raw.length !== ID_LENGTH + KEY_LENGTH) return undefined

  return { id: raw.subarray(0, ID_LENGTH).toString('hex'), key: raw.subarray(ID_LENGTH) }
}
