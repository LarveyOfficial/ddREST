/**
 * AES-256-GCM over an arbitrary key.
 *
 * Split out from seal.ts because there are now two distinct keying schemes:
 * login tickets are encrypted under the server's SESSION_KEYS, while session
 * rows are encrypted under a per-session key that exists only in the client's
 * credential. Both want the same primitive.
 *
 * Blob layout: iv[12] || tag[16] || ciphertext
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export const IV_LENGTH = 12
export const TAG_LENGTH = 16
export const KEY_LENGTH = 32

export function encryptBlob(key: Buffer, aad: string, plaintext: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext])
}

/** Returns undefined when the key is wrong or the blob has been tampered with. */
export function decryptBlob(key: Buffer, aad: string, blob: Buffer): Buffer | undefined {
  if (blob.length <= IV_LENGTH + TAG_LENGTH) return undefined
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, blob.subarray(0, IV_LENGTH))
    decipher.setAAD(Buffer.from(aad, 'utf8'))
    decipher.setAuthTag(blob.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH))
    return Buffer.concat([decipher.update(blob.subarray(IV_LENGTH + TAG_LENGTH)), decipher.final()])
  } catch {
    return undefined
  }
}
