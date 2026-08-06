import { describe, expect, test } from 'bun:test'
import { ConfigError, loadConfig } from '../src/config.ts'
import { generateSessionKey } from '../src/crypto/seal.ts'

/** loadConfig reads only what it is given, so tests never touch the real .env. */
const base = { SESSION_KEYS: generateSessionKey(), SESSION_DB_PATH: ':memory:' }
const load = (overrides: Record<string, string> = {}) => loadConfig({ ...base, ...overrides })

describe('session lifetime settings', () => {
  test('defaults: 30 day cap, 14 day idle, 5 minute renewal skew', () => {
    const cfg = load()
    expect(cfg.sessionMaxAgeSeconds).toBe(2_592_000)
    expect(cfg.sessionIdleTimeoutSeconds).toBe(1_209_600)
    expect(cfg.sessionRefreshSkewSeconds).toBe(300)
  })

  test('every one is overridable from the environment', () => {
    const cfg = load({
      SESSION_MAX_AGE_SECONDS: '31536000',
      SESSION_IDLE_TIMEOUT_SECONDS: '7776000',
      SESSION_REFRESH_SKEW_SECONDS: '900',
      SESSION_SWEEP_INTERVAL_SECONDS: '600',
      SESSION_DB_PATH: '/var/lib/dd/sessions.db',
    })
    expect(cfg.sessionMaxAgeSeconds).toBe(31_536_000)
    expect(cfg.sessionIdleTimeoutSeconds).toBe(7_776_000)
    expect(cfg.sessionRefreshSkewSeconds).toBe(900)
    expect(cfg.sessionSweepIntervalSeconds).toBe(600)
    expect(cfg.sessionDbPath).toBe('/var/lib/dd/sessions.db')
  })

  test('rejects values that would kill every session immediately', () => {
    for (const key of [
      'SESSION_MAX_AGE_SECONDS',
      'SESSION_IDLE_TIMEOUT_SECONDS',
      'SESSION_REFRESH_SKEW_SECONDS',
    ]) {
      expect(() => load({ [key]: '0' })).toThrow(ConfigError)
      expect(() => load({ [key]: '-1' })).toThrow(ConfigError)
    }
  })

  test('rejects non-integers rather than silently coercing', () => {
    expect(() => load({ SESSION_MAX_AGE_SECONDS: 'forever' })).toThrow(ConfigError)
    expect(() => load({ SESSION_IDLE_TIMEOUT_SECONDS: '30d' })).toThrow(ConfigError)
  })

  test('warns when the idle timeout can never fire', () => {
    const warnings: string[] = []
    const original = console.warn
    console.warn = (msg: string) => warnings.push(msg)
    try {
      // Idle 14d against a 1d cap — the cap always wins first.
      load({ SESSION_MAX_AGE_SECONDS: '86400', SESSION_IDLE_TIMEOUT_SECONDS: '1209600' })
      expect(warnings.join('\n')).toContain('idle expiry will never trigger')

      warnings.length = 0
      load({ SESSION_MAX_AGE_SECONDS: '2592000', SESSION_IDLE_TIMEOUT_SECONDS: '1209600' })
      expect(warnings).toEqual([])
    } finally {
      console.warn = original
    }
  })
})
