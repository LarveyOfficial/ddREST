/**
 * Split-key session storage.
 *
 * DoorDash rotates refresh tokens on every use and rejects the previous one
 * immediately, so the refresh token cannot live on the client: if a response
 * carrying a rotated token is ever lost, the chain is dead and the user has to
 * log in again. It therefore has to live somewhere the server can durably
 * update — this table.
 *
 * The split-key part keeps most of the original "no usable token at rest"
 * property. Each session gets its own random data key, and only the *ciphertext*
 * is stored here. The data key exists solely inside the client's credential:
 *
 *     dds2.<base64url( session_id[16] || data_key[32] )>
 *
 * So a dump of this database decrypts to nothing on its own. Compromising a
 * session still requires the client's credential, exactly as with any cookie.
 *
 * Because the data key is per-session and never changes, refreshing the tokens
 * rewrites only the stored ciphertext — the client's credential stays valid.
 * Refresh is genuinely invisible to callers.
 */

import { Database } from 'bun:sqlite'
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { decryptBlob, encryptBlob, KEY_LENGTH } from '../crypto/aead.ts'

export const SESSION_PREFIX = 'dds2'
const ID_LENGTH = 16
const AAD = 'dd.session.v2'

/** The secret half of a session, encrypted at rest under the client's key. */
interface SealedFields {
  /** DoorDash access token */
  at: string
  /** DoorDash refresh token — rotates on every use */
  rt: string
  /** token_type, e.g. "Bearer" */
  tt: string
  /** granted scope, if DoorDash returned one (it currently does not) */
  sc?: string
}

export interface SessionRecord extends SealedFields {
  id: string
  /** Epoch seconds; when the access token dies and a refresh is required. */
  accessExpiresAt: number
  /** Epoch seconds; hard end of the session no matter how many refreshes occur. */
  absoluteExpiresAt: number
  createdAt: number
  lastUsedAt: number
}

export type LoadFailure = 'malformed' | 'unknown' | 'bad_key'
export type LoadResult = { ok: true; record: SessionRecord; key: Buffer } | { ok: false; reason: LoadFailure }

interface Row {
  id: string
  payload: Uint8Array
  access_expires_at: number
  absolute_expires_at: number
  created_at: number
  last_used_at: number
}

const now = () => Math.floor(Date.now() / 1000)

export class SessionStore {
  #db: Database

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.#db = new Database(path, { create: true })
    // WAL lets reads proceed during the write that persists a refresh.
    if (path !== ':memory:') this.#db.exec('PRAGMA journal_mode = WAL')
    this.#db.exec('PRAGMA busy_timeout = 5000')
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id                  TEXT PRIMARY KEY,
        payload             BLOB NOT NULL,
        access_expires_at   INTEGER NOT NULL,
        absolute_expires_at INTEGER NOT NULL,
        created_at          INTEGER NOT NULL,
        last_used_at        INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_absolute_expires ON sessions(absolute_expires_at);
    `)
  }

  /** Creates a session and returns the credential to hand the client. */
  create(fields: SealedFields, accessExpiresAt: number, absoluteExpiresAt: number): {
    credential: string
    id: string
  } {
    const id = randomBytes(ID_LENGTH).toString('hex')
    const key = randomBytes(KEY_LENGTH)
    const timestamp = now()

    this.#db
      .query(
        `INSERT INTO sessions (id, payload, access_expires_at, absolute_expires_at, created_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, seal(key, fields), accessExpiresAt, absoluteExpiresAt, timestamp, timestamp)

    const credential = `${SESSION_PREFIX}.${Buffer.concat([Buffer.from(id, 'hex'), key]).toString('base64url')}`
    return { credential, id }
  }

  load(credential: string): LoadResult {
    const parsed = parseCredential(credential)
    if (!parsed) return { ok: false, reason: 'malformed' }

    const row = this.#db.query('SELECT * FROM sessions WHERE id = ?').get(parsed.id) as Row | null
    if (!row) return { ok: false, reason: 'unknown' }

    const fields = open(parsed.key, row.payload)
    if (!fields) return { ok: false, reason: 'bad_key' }

    return {
      ok: true,
      key: parsed.key,
      record: {
        id: row.id,
        ...fields,
        accessExpiresAt: row.access_expires_at,
        absoluteExpiresAt: row.absolute_expires_at,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
      },
    }
  }

  /** Persists rotated tokens. The credential is unaffected — same data key. */
  updateTokens(id: string, key: Buffer, fields: SealedFields, accessExpiresAt: number): void {
    this.#db
      .query('UPDATE sessions SET payload = ?, access_expires_at = ?, last_used_at = ? WHERE id = ?')
      .run(seal(key, fields), accessExpiresAt, now(), id)
  }

  touch(id: string): void {
    this.#db.query('UPDATE sessions SET last_used_at = ? WHERE id = ?').run(now(), id)
  }

  delete(id: string): boolean {
    return this.#db.query('DELETE FROM sessions WHERE id = ?').run(id).changes > 0
  }

  /** Drops sessions past their absolute deadline or idle for too long. */
  sweep(idleTimeoutSeconds: number): number {
    const timestamp = now()
    return this.#db
      .query('DELETE FROM sessions WHERE absolute_expires_at <= ? OR last_used_at <= ?')
      .run(timestamp, timestamp - idleTimeoutSeconds).changes
  }

  count(): number {
    return (this.#db.query('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n
  }

  close(): void {
    this.#db.close()
  }
}

function seal(key: Buffer, fields: SealedFields): Uint8Array {
  return encryptBlob(key, AAD, Buffer.from(JSON.stringify(fields), 'utf8'))
}

function open(key: Buffer, payload: Uint8Array): SealedFields | undefined {
  const plaintext = decryptBlob(key, AAD, Buffer.from(payload))
  if (!plaintext) return undefined
  try {
    return JSON.parse(plaintext.toString('utf8')) as SealedFields
  } catch {
    return undefined
  }
}

export function parseCredential(credential: string): { id: string; key: Buffer } | undefined {
  if (typeof credential !== 'string' || !credential.startsWith(`${SESSION_PREFIX}.`)) return undefined

  let raw: Buffer
  try {
    raw = Buffer.from(credential.slice(SESSION_PREFIX.length + 1), 'base64url')
  } catch {
    return undefined
  }
  if (raw.length !== ID_LENGTH + KEY_LENGTH) return undefined

  return {
    id: raw.subarray(0, ID_LENGTH).toString('hex'),
    key: raw.subarray(ID_LENGTH),
  }
}
