import { describe, expect, test } from 'bun:test'
import { createSealer, generateSessionKey, type SealedPayload } from '../src/crypto/seal.ts'

interface Demo extends SealedPayload {
  secret: string
}

const key = () => Buffer.from(generateSessionKey(), 'base64')

describe('seal', () => {
  test('round-trips a payload', () => {
    const sealer = createSealer<Demo>([key()], 'dds1')
    const token = sealer.seal({ secret: 'doordash-token' }, 60)

    expect(token.startsWith('dds1.')).toBe(true)
    const result = sealer.unseal(token)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.secret).toBe('doordash-token')
  })

  test('the plaintext never appears in the token', () => {
    const sealer = createSealer<Demo>([key()], 'dds1')
    const token = sealer.seal({ secret: 'super-secret-access-token' }, 60)
    expect(token).not.toContain('super-secret-access-token')
    expect(Buffer.from(token.slice(5), 'base64url').toString('utf8')).not.toContain('super-secret')
  })

  test('rejects a token sealed under a different key', () => {
    const a = createSealer<Demo>([key()], 'dds1')
    const b = createSealer<Demo>([key()], 'dds1')
    expect(b.unseal(a.seal({ secret: 'x' }, 60))).toEqual({ ok: false, reason: 'bad_key' })
  })

  test('rejects a tampered ciphertext', () => {
    const sealer = createSealer<Demo>([key()], 'dds1')
    const token = sealer.seal({ secret: 'x' }, 60)
    const body = Buffer.from(token.slice(5), 'base64url')
    const last = body.length - 1
    body.writeUInt8(body.readUInt8(last) ^ 0xff, last)
    expect(sealer.unseal(`dds1.${body.toString('base64url')}`)).toEqual({ ok: false, reason: 'bad_key' })
  })

  test('a login ticket cannot be replayed as a session', () => {
    const shared = key()
    const ticket = createSealer<Demo>([shared], 'ddl1')
    const session = createSealer<Demo>([shared], 'dds1')

    const ticketToken = ticket.seal({ secret: 'verifier' }, 60)
    // Same key, so only the AAD binding stops this.
    expect(session.unseal(ticketToken)).toEqual({ ok: false, reason: 'malformed' })
    expect(session.unseal(`dds1.${ticketToken.slice(5)}`)).toEqual({ ok: false, reason: 'bad_key' })
  })

  test('rejects an expired token', () => {
    const sealer = createSealer<Demo>([key()], 'dds1')
    expect(sealer.unseal(sealer.seal({ secret: 'x' }, -1))).toEqual({ ok: false, reason: 'expired' })
  })

  test('rejects malformed input without throwing', () => {
    const sealer = createSealer<Demo>([key()], 'dds1')
    for (const bad of ['', 'dds1', 'dds1.', 'nope', 'dds1.!!!!', 'dds1.aGk']) {
      expect(sealer.unseal(bad).ok).toBe(false)
    }
  })

  test('rotation: old keys still decrypt, new key seals', () => {
    const oldKey = key()
    const newKey = key()

    const before = createSealer<Demo>([oldKey], 'dds1').seal({ secret: 'issued-earlier' }, 60)

    const rotated = createSealer<Demo>([newKey, oldKey], 'dds1')
    const stillValid = rotated.unseal(before)
    expect(stillValid.ok).toBe(true)

    // Newly issued tokens use the new key only.
    const after = rotated.seal({ secret: 'issued-later' }, 60)
    expect(createSealer<Demo>([newKey], 'dds1').unseal(after).ok).toBe(true)
    expect(createSealer<Demo>([oldKey], 'dds1').unseal(after).ok).toBe(false)
  })

  test('two seals of the same payload differ (fresh IV)', () => {
    const sealer = createSealer<Demo>([key()], 'dds1')
    expect(sealer.seal({ secret: 'x' }, 60)).not.toBe(sealer.seal({ secret: 'x' }, 60))
  })
})
