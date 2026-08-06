/**
 * User codes — the short string a headless device puts on its screen for a
 * human to retype.
 *
 * The alphabet is 20 consonants: no vowels, so a random code can never spell
 * something unfortunate, and no character pairs that get confused when read off
 * a TV across a room (no O/0, no I/1/l, no S/5, no B/8 — the digits simply are
 * not in the set, so a digit can only ever be a typo).
 *
 * Eight characters is 20^8 ≈ 2.6e10, about 34.6 bits. That is the whole defence
 * against someone guessing a pending code and hijacking the pairing, so it is
 * deliberately larger than RFC 8628's illustrative examples; see the note on
 * rate limiting in manager.ts for the second layer.
 */

import { randomBytes } from 'node:crypto'

const ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'
const CODE_LENGTH = 8
const GROUP = 4

/** Largest multiple of the alphabet size that fits in a byte, for rejection sampling. */
const CEILING = 256 - (256 % ALPHABET.length)

/** A fresh code in display form, e.g. "WDJB-MJHT". */
export function generateUserCode(): string {
  let out = ''
  while (out.length < CODE_LENGTH) {
    // Rejection sampling: plain modulo over 256 would favour the first 16
    // letters, shrinking the effective keyspace.
    for (const byte of randomBytes(CODE_LENGTH)) {
      if (byte >= CEILING) continue
      out += ALPHABET[byte % ALPHABET.length]
      if (out.length === CODE_LENGTH) break
    }
  }
  return formatUserCode(out)
}

/** Display form: grouped with a hyphen, which is easier to read back aloud. */
export function formatUserCode(normalized: string): string {
  const groups: string[] = []
  for (let i = 0; i < normalized.length; i += GROUP) groups.push(normalized.slice(i, i + GROUP))
  return groups.join('-')
}

/**
 * Canonical form for storage and lookup.
 *
 * Humans retype these, so accept the mess that comes with that: lowercase,
 * stray spaces, hyphens in the wrong places. Returns undefined when what is
 * left could not be one of our codes at all.
 */
export function normalizeUserCode(raw: string): string | undefined {
  if (typeof raw !== 'string') return undefined
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (cleaned.length !== CODE_LENGTH) return undefined
  for (const ch of cleaned) {
    if (!ALPHABET.includes(ch)) return undefined
  }
  return cleaned
}
