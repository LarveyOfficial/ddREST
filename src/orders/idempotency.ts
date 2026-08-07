/**
 * Replay protection for the one route that spends money.
 *
 * `POST /v1/carts/{cart_uuid}/order` charges the account. If the response is
 * lost — a timeout, a dropped connection, a client that retried on its own —
 * the caller has no way to tell whether the order went through, and the safe
 * options are both bad: retry and risk two dinners, or don't and risk none.
 *
 * An `Idempotency-Key` closes that. The first request under a key runs and its
 * response is stored; a repeat returns the stored response verbatim instead of
 * placing a second order. Keys are scoped to the session, so one caller's key
 * can never collide with or read another's.
 *
 * What is stored is the response body of a *successful* submission only. A
 * failed attempt records nothing, because the caller retrying after a failure
 * wants a real attempt, not a replayed error.
 */

import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * How long a key is honoured.
 *
 * Long enough to cover any plausible retry, short enough that the table does
 * not grow without bound. A day is well past the point where replaying a
 * yesterday's order response would be a helpful answer.
 */
const TTL_SECONDS = 86_400

const now = () => Math.floor(Date.now() / 1000)

interface Row {
  response: string
  request_fingerprint: string
}

export interface StoredResponse {
  body: unknown
  /** True when the stored entry was created by a different request body. */
  conflict: boolean
}

export class IdempotencyStore {
  #db: Database

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.#db = new Database(path, { create: true })
    if (path !== ':memory:') this.#db.exec('PRAGMA journal_mode = WAL')
    this.#db.exec('PRAGMA busy_timeout = 5000')
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS idempotency (
        scope                TEXT NOT NULL,
        key                  TEXT NOT NULL,
        request_fingerprint  TEXT NOT NULL,
        response             TEXT NOT NULL,
        created_at           INTEGER NOT NULL,
        expires_at           INTEGER NOT NULL,
        PRIMARY KEY (scope, key)
      )
    `)
    this.#db.exec('CREATE INDEX IF NOT EXISTS idx_idempotency_expiry ON idempotency (expires_at)')
  }

  /**
   * The stored response for this key, if any.
   *
   * A hit whose fingerprint differs is reported rather than returned: reusing
   * one key for two different orders is a client bug, and quietly handing back
   * the first order's response would hide it.
   */
  lookup(scope: string, key: string, requestFingerprint: string): StoredResponse | undefined {
    const row = this.#db
      .query<Row, [string, string, number]>(
        'SELECT response, request_fingerprint FROM idempotency WHERE scope = ? AND key = ? AND expires_at > ?',
      )
      .get(scope, key, now())
    if (!row) return undefined

    return {
      body: JSON.parse(row.response) as unknown,
      conflict: row.request_fingerprint !== requestFingerprint,
    }
  }

  save(scope: string, key: string, requestFingerprint: string, body: unknown): void {
    const timestamp = now()
    // Swept here rather than on a timer: writes happen only when an order is
    // actually placed, so the table is small and the cost is negligible, and
    // there is no interval to leak in tests or shutdown.
    this.sweep()
    this.#db
      .query(
        `INSERT INTO idempotency (scope, key, request_fingerprint, response, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (scope, key) DO NOTHING`,
      )
      .run(scope, key, requestFingerprint, JSON.stringify(body), timestamp, timestamp + TTL_SECONDS)
  }

  sweep(): number {
    return this.#db.query('DELETE FROM idempotency WHERE expires_at <= ?').run(now()).changes
  }

  close(): void {
    this.#db.close()
  }
}

/**
 * A stable digest of what was asked for.
 *
 * Keys are sorted so that two bodies differing only in property order count as
 * the same request — JSON object order is not meaningful and a client that
 * re-serialises before retrying should not trip a conflict.
 */
export function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalise(value)).digest('hex')
}

function canonicalise(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`).join(',')}}`
}
