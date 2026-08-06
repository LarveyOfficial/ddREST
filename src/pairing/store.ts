/**
 * Pairing storage for the device flow.
 *
 * A pairing is a rendezvous between two HTTP clients that never talk to each
 * other: the headless device that asked for access, and the browser where a
 * human approves it. That is inherently server-side state, so unlike a login
 * ticket it cannot be sealed and handed to the client.
 *
 * Two secrets are involved and they are stored differently:
 *
 *   - The **device code** is a split-key handle (`ddp1.<id||key>`). Only
 *     sha256(key) is stored, so a dump of this table does not yield a usable
 *     device code — the same property the session table has.
 *
 *   - The **session credential** produced when a human approves cannot get the
 *     same treatment, because the browser doing the approving has never seen
 *     the device code and so has no key to encrypt to. It is instead sealed
 *     under the server keys (see PAIRING_GRANT_PREFIX) for the few minutes
 *     between approval and collection, then the row is deleted. So reading this
 *     table is not enough; SESSION_KEYS is needed too, which is the same
 *     boundary login tickets already rely on.
 */

import { Database } from 'bun:sqlite'
import { createHash, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createHandle, parseHandle } from '../crypto/handle.ts'

export const DEVICE_CODE_PREFIX = 'ddp1'

export type PairingStatus = 'pending' | 'approved' | 'denied'

export interface PairingRecord {
  id: string
  userCode: string
  status: PairingStatus
  /** Sealed session credential; present only once status is 'approved'. */
  grant?: string
  /** Free text the device supplied, shown to the human. Never trusted. */
  deviceLabel?: string
  createdAt: number
  expiresAt: number
  /** 0 until the device's first poll, so the first one is never told to slow down. */
  lastPolledAt: number
  interval: number
}

export type DeviceLoadFailure = 'malformed' | 'unknown' | 'bad_key'
export type DeviceLoadResult =
  | { ok: true; record: PairingRecord }
  | { ok: false; reason: DeviceLoadFailure }

interface Row {
  id: string
  user_code: string
  key_hash: Uint8Array
  status: PairingStatus
  grant_blob: string | null
  device_label: string | null
  created_at: number
  expires_at: number
  last_polled_at: number
  interval_seconds: number
}

const now = () => Math.floor(Date.now() / 1000)

const hashKey = (key: Buffer): Buffer => createHash('sha256').update(key).digest()

function toRecord(row: Row): PairingRecord {
  return {
    id: row.id,
    userCode: row.user_code,
    status: row.status,
    grant: row.grant_blob ?? undefined,
    deviceLabel: row.device_label ?? undefined,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastPolledAt: row.last_polled_at,
    interval: row.interval_seconds,
  }
}

export class PairingStore {
  #db: Database

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.#db = new Database(path, { create: true })
    if (path !== ':memory:') this.#db.exec('PRAGMA journal_mode = WAL')
    this.#db.exec('PRAGMA busy_timeout = 5000')
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS pairings (
        id               TEXT PRIMARY KEY,
        user_code        TEXT NOT NULL UNIQUE,
        key_hash         BLOB NOT NULL,
        status           TEXT NOT NULL,
        grant_blob       TEXT,
        device_label     TEXT,
        created_at       INTEGER NOT NULL,
        expires_at       INTEGER NOT NULL,
        last_polled_at   INTEGER NOT NULL,
        interval_seconds INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pairings_expires ON pairings(expires_at);
    `)
  }

  /**
   * Inserts a pairing, returning the device code. Throws on user-code
   * collision so the caller can retry with a fresh one.
   */
  create(opts: {
    userCode: string
    deviceLabel?: string
    expiresAt: number
    interval: number
  }): { deviceCode: string; id: string } {
    const { id, key, credential } = createHandle(DEVICE_CODE_PREFIX)

    this.#db
      .query(
        `INSERT INTO pairings
           (id, user_code, key_hash, status, grant_blob, device_label, created_at, expires_at, last_polled_at, interval_seconds)
         VALUES (?, ?, ?, 'pending', NULL, ?, ?, ?, 0, ?)`,
      )
      .run(id, opts.userCode, hashKey(key), opts.deviceLabel ?? null, now(), opts.expiresAt, opts.interval)

    return { deviceCode: credential, id }
  }

  findByUserCode(userCode: string): PairingRecord | undefined {
    const row = this.#select('SELECT * FROM pairings WHERE user_code = ?', userCode)
    return row ? toRecord(row) : undefined
  }

  findById(id: string): PairingRecord | undefined {
    const row = this.#select('SELECT * FROM pairings WHERE id = ?', id)
    return row ? toRecord(row) : undefined
  }

  /** Resolves a device code, verifying its key against the stored hash. */
  loadByDeviceCode(deviceCode: string): DeviceLoadResult {
    const parsed = parseHandle(DEVICE_CODE_PREFIX, deviceCode)
    if (!parsed) return { ok: false, reason: 'malformed' }

    const row = this.#select('SELECT * FROM pairings WHERE id = ?', parsed.id)
    if (!row) return { ok: false, reason: 'unknown' }

    const expected = Buffer.from(row.key_hash)
    const actual = hashKey(parsed.key)
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return { ok: false, reason: 'bad_key' }
    }

    return { ok: true, record: toRecord(row) }
  }

  /** Records approval. Only a pending row can be approved — losers get false. */
  approve(id: string, grant: string): boolean {
    return (
      this.#db
        .query("UPDATE pairings SET status = 'approved', grant_blob = ? WHERE id = ? AND status = 'pending'")
        .run(grant, id).changes > 0
    )
  }

  deny(id: string): boolean {
    return (
      this.#db
        .query("UPDATE pairings SET status = 'denied', grant_blob = NULL WHERE id = ? AND status = 'pending'")
        .run(id).changes > 0
    )
  }

  recordPoll(id: string, interval: number): void {
    this.#db
      .query('UPDATE pairings SET last_polled_at = ?, interval_seconds = ? WHERE id = ?')
      .run(now(), interval, id)
  }

  delete(id: string): boolean {
    return this.#db.query('DELETE FROM pairings WHERE id = ?').run(id).changes > 0
  }

  /** Pending rows are the only ones that can be created without a human, so this is what gets capped. */
  countPending(): number {
    return (
      this.#db
        .query("SELECT COUNT(*) AS n FROM pairings WHERE status = 'pending' AND expires_at > ?")
        .get(now()) as { n: number }
    ).n
  }

  count(): number {
    return (this.#db.query('SELECT COUNT(*) AS n FROM pairings').get() as { n: number }).n
  }

  sweep(): number {
    return this.#db.query('DELETE FROM pairings WHERE expires_at <= ?').run(now()).changes
  }

  close(): void {
    this.#db.close()
  }

  #select(sql: string, param: string): Row | null {
    return this.#db.query(sql).get(param) as Row | null
  }
}
