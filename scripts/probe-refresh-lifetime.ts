/**
 * Measures how long DoorDash keeps a refresh token usable.
 *
 * Two independent questions, run as two independent probes:
 *
 *   idle       How long can a refresh token sit UNUSED and still work?
 *              Bounds SESSION_IDLE_TIMEOUT_SECONDS. Each probe waits longer
 *              than the last (doubling) until one is refused.
 *
 *   sustained  Does a chain that is refreshed regularly ever die anyway?
 *              This is the one that decides whether a session can effectively
 *              live forever. Bounds SESSION_MAX_AGE_SECONDS. Refreshes on a
 *              fixed cadence until refused, or until you stop caring.
 *
 * The awkward part: a successful probe SPENDS the token and rotates it, which
 * also resets the idle clock. So there is no way to peek without consuming.
 * Every success is therefore a data point ("survived this gap") and a fresh
 * token for the next one; the first failure brackets the answer between the
 * last successful gap and the failing one.
 *
 *   bun run probe-refresh init idle        # one browser login, stores a token
 *   bun run probe-refresh tick idle        # run on a timer; probes when due
 *   bun run probe-refresh status idle
 *
 * Use a DEDICATED login for this. The probe rotates the token it holds, so
 * pointing it at a session your API is also using would invalidate one or the
 * other the first time either refreshes.
 *
 * State files hold a live credential. They are written 0600 under ./data/,
 * which is gitignored.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { loadConfig } from '../src/config.ts'
import { deriveCodeChallenge, generateCodeVerifier, generateState } from '../src/auth/pkce.ts'
import { buildAuthorizeUrl, parseCallbackUrl } from '../src/auth/oauth.ts'

type Mode = 'idle' | 'sustained'

interface Attempt {
  at: string
  /** Seconds actually elapsed since the previous success — the real measurement. */
  gapSeconds: number
  ok: boolean
  status: number
  error?: string
}

interface State {
  mode: Mode
  startedAt: string
  refreshToken: string
  /** Wall-clock time of the last successful refresh. */
  lastSuccessAt: string
  /** Epoch ms; probe when now >= this. */
  nextProbeAt: number
  /** Planned gap for the next probe, seconds. */
  intervalSeconds: number
  finished?: { verdict: string; at: string }
  attempts: Attempt[]
}

const HOUR = 3600
const DAY = 24 * HOUR

/** Starting gaps. Idle doubles from here; sustained stays put. */
const FIRST_INTERVAL: Record<Mode, number> = { idle: 1 * DAY, sustained: 1 * DAY }

const cfg = loadConfig({
  ...process.env,
  SESSION_KEYS: process.env.SESSION_KEYS || Buffer.alloc(32, 1).toString('base64'),
})

const [command = 'status', modeArg = 'idle', callbackArg] = process.argv.slice(2)
if (modeArg !== 'idle' && modeArg !== 'sustained') {
  console.error(`Unknown mode ${JSON.stringify(modeArg)}. Use "idle" or "sustained".`)
  process.exit(1)
}
const mode: Mode = modeArg
const statePath = process.env.PROBE_STATE_PATH ?? `./data/refresh-probe-${mode}.json`

function readState(): State {
  if (!existsSync(statePath)) {
    console.error(`No probe started yet. Run:  bun run probe-refresh init ${mode}`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(statePath, 'utf8')) as State
}

function writeState(state: State): void {
  mkdirSync('./data', { recursive: true })
  writeFileSync(statePath, JSON.stringify(state, null, 2))
  chmodSync(statePath, 0o600) // it holds a live credential
}

const human = (seconds: number) =>
  seconds >= DAY ? `${(seconds / DAY).toFixed(1)}d` : seconds >= HOUR ? `${(seconds / HOUR).toFixed(1)}h` : `${seconds}s`

async function refresh(token: string): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${cfg.tokenBase}/identity-bff/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', client_id: cfg.clientId, refresh_token: token }),
  })
  const raw = await response.text()
  let body: Record<string, unknown> = {}
  try {
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    body = { raw: raw.slice(0, 300) }
  }
  return { ok: response.ok, status: response.status, body }
}

// --- init --------------------------------------------------------------------

async function init(): Promise<void> {
  if (existsSync(statePath)) {
    console.error(`${statePath} already exists. Delete it to start a new ${mode} probe.`)
    process.exit(1)
  }

  const verifier = generateCodeVerifier()
  const state = generateState()
  const authorizeUrl = buildAuthorizeUrl(cfg, {
    state,
    codeChallenge: deriveCodeChallenge(verifier),
    redirectUri: cfg.redirectUri,
  })

  console.log(`\nStarting the "${mode}" probe. Use a login you are not using anywhere else.\n`)
  console.log('1. Open this and sign in:\n')
  console.log(`   ${authorizeUrl}\n`)
  console.log(`2. You will land on ${cfg.redirectUri} and the page will fail to load. That is expected.`)
  console.log('3. Paste the full URL from the address bar.\n')

  // prompt() returns null without a TTY, so allow the URL to be passed in
  // directly — which also makes this usable from a script.
  const pasted = callbackArg ?? prompt('Callback URL:')
  if (!pasted) {
    console.error('Nothing pasted; aborting. You can also pass the URL as an argument:')
    console.error(`  bun run probe-refresh init ${mode} "http://localhost:4180/oauth2/callback?code=...&state=..."`)
    process.exit(1)
  }

  const { code, state: returned } = parseCallbackUrl(pasted)
  if (returned !== state) {
    console.error('State mismatch — that URL is from a different login attempt.')
    process.exit(1)
  }

  const response = await fetch(`${cfg.tokenBase}/identity-bff/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: cfg.clientId,
      code,
      redirect_uri: cfg.redirectUri,
      code_verifier: verifier,
    }),
  })
  const token = (await response.json()) as { refresh_token?: string; expires_in?: number }
  if (!response.ok || !token.refresh_token) {
    console.error(`Token exchange failed (HTTP ${response.status}):`, JSON.stringify(token))
    process.exit(1)
  }

  const now = Date.now()
  const interval = FIRST_INTERVAL[mode]
  writeState({
    mode,
    startedAt: new Date(now).toISOString(),
    refreshToken: token.refresh_token,
    lastSuccessAt: new Date(now).toISOString(),
    nextProbeAt: now + interval * 1000,
    intervalSeconds: interval,
    attempts: [],
  })

  console.log(`\nStored in ${statePath} (0600).`)
  console.log(`Access token lifetime: ${human(token.expires_in ?? 0)}`)
  console.log(`First probe due: ${new Date(now + interval * 1000).toISOString()} (in ${human(interval)})\n`)
  console.log('Now run `bun run probe-refresh tick ' + mode + '` on a timer — see the README.')
}

// --- tick --------------------------------------------------------------------

async function tick(): Promise<void> {
  const state = readState()

  if (state.finished) {
    console.log(`Probe already finished: ${state.finished.verdict}`)
    return
  }
  if (Date.now() < state.nextProbeAt) {
    const waiting = Math.round((state.nextProbeAt - Date.now()) / 1000)
    console.log(`Not due yet — next probe in ${human(waiting)} (${new Date(state.nextProbeAt).toISOString()}).`)
    return
  }

  // Measure the gap that ACTUALLY elapsed, not the one we planned. A missed
  // timer or a machine that was asleep makes these differ, and the real elapsed
  // time is the only honest data point.
  const gapSeconds = Math.round((Date.now() - Date.parse(state.lastSuccessAt)) / 1000)
  const result = await refresh(state.refreshToken)

  const attempt: Attempt = {
    at: new Date().toISOString(),
    gapSeconds,
    ok: result.ok,
    status: result.status,
    error: result.ok ? undefined : String(result.body.error ?? result.body.raw ?? ''),
  }
  state.attempts.push(attempt)

  if (result.ok) {
    const next = typeof result.body.refresh_token === 'string' ? result.body.refresh_token : undefined
    if (!next) {
      state.finished = {
        verdict: 'Refresh succeeded but returned no new refresh token — rotation behaviour changed.',
        at: attempt.at,
      }
      writeState(state)
      console.log(state.finished.verdict)
      return
    }

    state.refreshToken = next
    state.lastSuccessAt = attempt.at
    // Idle mode reaches further each time; sustained keeps a steady cadence.
    state.intervalSeconds = mode === 'idle' ? state.intervalSeconds * 2 : state.intervalSeconds
    state.nextProbeAt = Date.now() + state.intervalSeconds * 1000
    writeState(state)

    console.log(`OK — survived ${human(gapSeconds)} idle. Next probe in ${human(state.intervalSeconds)}.`)
    if (mode === 'sustained') {
      const total = Math.round((Date.now() - Date.parse(state.startedAt)) / 1000)
      console.log(`Chain alive ${human(total)} since first login, across ${state.attempts.length} refreshes.`)
    }
    return
  }

  const lastGood = [...state.attempts].reverse().find((a) => a.ok)
  const total = Math.round((Date.now() - Date.parse(state.startedAt)) / 1000)
  const chainAge = `Chain was ${human(total)} old, across ${state.attempts.length - 1} successful refreshes.`

  let verdict: string
  if (mode === 'sustained') {
    verdict =
      `Chain died after ${human(total)} of regular use (HTTP ${result.status}), across ` +
      `${state.attempts.length - 1} successful refreshes. That is an absolute cap on how long a session can live.`
  } else if (lastGood && gapSeconds <= lastGood.gapSeconds) {
    // Idle gaps only grow, so failing at a gap already survived means the token
    // died of something other than sitting unused.
    verdict =
      `Refused after only ${human(gapSeconds)} idle (HTTP ${result.status}), yet ${human(lastGood.gapSeconds)} ` +
      'idle succeeded earlier — so this is NOT idle expiry. Likely an absolute cap on the chain, or the token ' +
      `was revoked or spent elsewhere. ${chainAge} Run the "sustained" probe to test for an absolute cap.`
  } else {
    verdict =
      `Refused after ${human(gapSeconds)} idle (HTTP ${result.status}). Idle lifetime is between ` +
      `${lastGood ? human(lastGood.gapSeconds) : '0'} and ${human(gapSeconds)}. ${chainAge} ` +
      'If that upper bound is close to the chain age, it may be an absolute cap rather than idle expiry — ' +
      'the "sustained" probe distinguishes them.'
  }

  state.finished = { at: attempt.at, verdict }
  writeState(state)
  console.log(state.finished.verdict)
}

// --- status ------------------------------------------------------------------

function status(): void {
  const state = readState()
  console.log(`\nProbe: ${state.mode}   started ${state.startedAt}`)
  console.log(`State: ${statePath}\n`)

  if (state.attempts.length === 0) {
    console.log('  (no probes yet)')
  }
  for (const a of state.attempts) {
    console.log(
      `  ${a.at}  gap ${human(a.gapSeconds).padStart(6)}  ${a.ok ? 'OK  ' : 'FAIL'} ` +
        `HTTP ${a.status}${a.error ? `  ${a.error}` : ''}`,
    )
  }

  console.log()
  if (state.finished) {
    console.log(`  VERDICT: ${state.finished.verdict}`)
  } else {
    const waiting = Math.round((state.nextProbeAt - Date.now()) / 1000)
    console.log(
      waiting > 0
        ? `  Next probe in ${human(waiting)} (${new Date(state.nextProbeAt).toISOString()}).`
        : '  Next probe is due now.',
    )
    const longest = state.attempts.filter((a) => a.ok).at(-1)
    if (longest) console.log(`  Longest idle gap survived so far: ${human(longest.gapSeconds)}.`)
  }
  console.log()
}

switch (command) {
  case 'init':
    await init()
    break
  case 'tick':
    await tick()
    break
  case 'status':
    status()
    break
  default:
    console.error(`Unknown command ${JSON.stringify(command)}. Use init, tick or status.`)
    process.exit(1)
}
