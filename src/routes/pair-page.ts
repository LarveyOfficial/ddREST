/**
 * The human half of the device flow: three server-rendered pages at
 * /v1/auth/pair.
 *
 * Deliberately plain HTML with no JavaScript and no CDN. The whole point of
 * this flow is to reach people on awkward devices, and the browser they walk
 * over to may itself be a TV, a console, or a phone on a bad connection. A form
 * post works everywhere; a fetch() wrapper does not.
 */

const STYLE = /* css */ `
  :root { color-scheme: light dark; --fg: #1a1a1a; --muted: #5c5c5c; --bg: #fafafa;
          --card: #fff; --line: #e0e0e0; --accent: #c1272d; --warn-bg: #fff8e1;
          --warn-line: #ffe082; --warn-fg: #4a3b00; --err-bg: #fdecea; --err-fg: #8c1c13; }
  @media (prefers-color-scheme: dark) {
    :root { --fg: #e8e8e8; --muted: #a0a0a0; --bg: #16181c; --card: #1e2126; --line: #333840;
            --warn-bg: #2e2a1a; --warn-line: #5c5124; --warn-fg: #f0dfa8;
            --err-bg: #34201e; --err-fg: #f5b1a9; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 16px; background: var(--bg); color: var(--fg);
         font: 16px/1.6 system-ui, -apple-system, Segoe UI, sans-serif; }
  main { max-width: 34rem; margin: 0 auto; background: var(--card); border: 1px solid var(--line);
         border-radius: 12px; padding: 28px; }
  h1 { font-size: 1.35rem; margin: 0 0 4px; }
  h2 { font-size: 1rem; margin: 24px 0 8px; }
  p { margin: 0 0 14px; }
  .sub { color: var(--muted); margin-bottom: 22px; }
  label { display: block; font-weight: 600; margin-bottom: 6px; font-size: .9rem; }
  input[type=text], input[type=url] {
    width: 100%; padding: 11px 13px; font-size: 1rem; font-family: inherit;
    border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--fg); }
  input.code { font: 600 1.5rem/1 ui-monospace, SFMono-Regular, Menlo, monospace;
               letter-spacing: .18em; text-align: center; text-transform: uppercase; padding: 14px; }
  button { font: 600 1rem/1 inherit; padding: 12px 18px; border-radius: 8px; cursor: pointer;
           border: 1px solid transparent; }
  .primary { background: var(--accent); color: #fff; width: 100%; }
  .secondary { background: transparent; color: var(--muted); border-color: var(--line); }
  .row { display: flex; gap: 10px; align-items: center; margin-top: 18px; }
  .row .primary { width: auto; flex: 1; }
  .note { background: var(--warn-bg); border: 1px solid var(--warn-line); color: var(--warn-fg);
          border-radius: 8px; padding: 12px 14px; font-size: .9rem; margin: 0 0 20px; }
  .error { background: var(--err-bg); color: var(--err-fg); border-radius: 8px;
           padding: 12px 14px; font-size: .93rem; margin: 0 0 20px; }
  .device { border: 1px solid var(--line); border-radius: 8px; padding: 14px; margin-bottom: 20px;
            font-size: .93rem; }
  .device dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; margin: 0; }
  .device dt { color: var(--muted); }
  .device dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
  code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
  ol { padding-left: 1.3em; margin: 0 0 18px; }
  li { margin-bottom: 8px; }
  a.button { display: block; text-align: center; text-decoration: none; background: var(--accent);
             color: #fff; padding: 12px 18px; border-radius: 8px; font-weight: 600; margin-bottom: 8px;
             overflow-wrap: anywhere; }
  .ok { font-size: 3rem; line-height: 1; margin-bottom: 8px; }
  footer { max-width: 34rem; margin: 18px auto 0; color: var(--muted); font-size: .82rem; text-align: center; }
`

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${escapeHtml(title)} — ddREST</title>
    <style>${STYLE}</style>
  </head>
  <body>
    <main>${body}</main>
    <footer>ddREST · device pairing</footer>
  </body>
</html>
`
}

const errorBlock = (message?: string) => (message ? `<p class="error">${escapeHtml(message)}</p>` : '')

/** Step 1: type in the code shown on the device. */
export function renderCodeEntry(opts: { userCode?: string; error?: string } = {}): string {
  return shell(
    'Pair a device',
    `
      <h1>Pair a device</h1>
      <p class="sub">Enter the code shown on the device you want to sign in.</p>
      ${errorBlock(opts.error)}
      <form method="post" action="pair" autocomplete="off">
        <label for="user_code">Pairing code</label>
        <input id="user_code" name="user_code" class="code" type="text" required
               placeholder="BCDF-GHJK" spellcheck="false" autocapitalize="characters"
               value="${escapeHtml(opts.userCode ?? '')}" autofocus />
        <div class="row"><button class="primary" type="submit">Continue</button></div>
      </form>
    `,
  )
}

/** Step 2: confirm what is being authorised, sign in, paste the callback back. */
export function renderApproval(opts: {
  userCode: string
  deviceLabel?: string
  authorizeUrl: string
  ticket: string
  redirectUri: string
  expiresInSeconds: number
  error?: string
}): string {
  const minutes = Math.max(1, Math.round(opts.expiresInSeconds / 60))
  return shell(
    'Approve this device',
    `
      <h1>Approve this device</h1>
      <p class="sub">Signing in here gives this device access to your DoorDash account through ddREST.</p>
      ${errorBlock(opts.error)}
      <p class="note">
        <strong>Only continue if you started this yourself.</strong> If someone sent you this code or asked you to
        type it in, stop and choose Deny — approving would hand them your account.
      </p>
      <div class="device">
        <dl>
          <dt>Code</dt><dd class="mono">${escapeHtml(opts.userCode)}</dd>
          <dt>Device</dt><dd>${opts.deviceLabel ? escapeHtml(opts.deviceLabel) : '<em>not provided</em>'}</dd>
          <dt>Expires</dt><dd>in about ${minutes} minute${minutes === 1 ? '' : 's'}</dd>
        </dl>
      </div>
      <h2>1. Sign in to DoorDash</h2>
      <a class="button" href="${escapeHtml(opts.authorizeUrl)}" target="_blank" rel="noopener noreferrer">
        Open the DoorDash sign-in page
      </a>
      <h2>2. Copy the address it lands on</h2>
      <p>
        After signing in the browser goes to <code>${escapeHtml(opts.redirectUri)}</code> and the page fails to
        load. That is expected — nothing is listening there. Copy the whole address out of the address bar.
      </p>
      <h2>3. Paste it here</h2>
      <form method="post" action="pair" autocomplete="off">
        <input type="hidden" name="approval_ticket" value="${escapeHtml(opts.ticket)}" />
        <label for="redirect_url">Address the browser landed on</label>
        <input id="redirect_url" name="redirect_url" type="text" required spellcheck="false"
               placeholder="${escapeHtml(opts.redirectUri)}?code=…&amp;state=…" />
        <div class="row">
          <button class="primary" type="submit" name="action" value="approve">Approve device</button>
          <button class="secondary" type="submit" name="action" value="deny" formnovalidate>Deny</button>
        </div>
      </form>
    `,
  )
}

/** Step 3: terminal states. */
export function renderResult(opts: { kind: 'approved' | 'denied' | 'error'; message: string }): string {
  const icon = opts.kind === 'approved' ? '✓' : opts.kind === 'denied' ? '✕' : '!'
  const heading =
    opts.kind === 'approved' ? 'Device approved' : opts.kind === 'denied' ? 'Device denied' : 'Pairing failed'

  const tail =
    opts.kind === 'approved'
      ? '<p class="sub">You can close this page. The device picks up its session within a few seconds.</p>'
      : '<p class="sub"><a href="pair">Pair a different device</a></p>'

  return shell(heading, `<p class="ok">${icon}</p><h1>${heading}</h1><p>${escapeHtml(opts.message)}</p>${tail}`)
}
