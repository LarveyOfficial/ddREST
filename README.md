# ddREST

A REST implementation of the DoorDash Consumer MCP server.

The gateway speaks JSON-RPC 2.0 over Server-Sent Events and describes itself
through MCP's `tools/list`. ddREST puts conventional REST resources in front of
that: `GET /v1/restaurants`, `POST /v1/carts/{cart_uuid}/items`,
`GET /v1/orders/{order_uuid}/receipt`. Clients never see JSON-RPC, SSE, or the
`intent` argument every tool requires.

Inspired by [`dd-cli`](https://github.com/doordash-oss/doordash-cli), DoorDash's
own terminal client for the same gateway. ddREST is an independent
implementation.

Two problems shape the whole design:

1. **DoorDash only permits loopback OAuth callbacks** (`http://localhost:4180…`,
   ports 4180–4184). A server-hosted API can never receive the redirect, so
   login is a *paste-back* flow.
2. **DoorDash rotates refresh tokens with no grace period.** Every renewal
   invalidates the previous refresh token immediately, so tokens are stored
   server-side — encrypted under a key that exists only in the client's
   credential, so the database alone reveals nothing.

Built on Bun + Hono. Monetary values are in **cents** throughout.

## Quick start

```bash
bun install
```

```bash
bun run keygen
```

Put that line in `.env` (see [.env.example](.env.example)), then:

```bash
bun run dev
```

Then browse the API at **http://localhost:8787/docs** — Swagger UI, generated
from this API's own route definitions and served by the API itself. The raw
document is at `/openapi.json`.

*Try it out* works directly from that page: complete the login flow once (below)
and the session cookie is picked up automatically, since the requests are
same-origin and therefore pass the CSRF origin check.

The page loads the Swagger UI bundle from a CDN, so it needs internet access —
the API itself does not.

## Docker

Images are published to GitHub Container Registry for `linux/amd64` and
`linux/arm64`.

```bash
docker run -d --name ddrest -p 8787:8787 \
  -e SESSION_KEYS="$(openssl rand -base64 32)" \
  -v /path/to/appdata:/data \
  ghcr.io/larveyofficial/ddrest:latest
```

`SESSION_KEYS` is the only required setting. `openssl rand -base64 32` produces
exactly the format it wants, so no Bun install is needed to generate one.

The container starts as root only to fix ownership of `/data`, then drops to
`PUID`:`PGID` (default `1000:1000`). Pass `--user` instead if you would rather
pin it yourself — the entrypoint handles both.

| Setting | Default in image | Notes |
| --- | --- | --- |
| `SESSION_KEYS` | *(none)* | Required. Container exits with instructions if unset. |
| `HOST` | `0.0.0.0` | Overridden from the `127.0.0.1` default, which would be unreachable. |
| `SESSION_DB_PATH` | `/data/sessions.db` | Mount `/data` to keep sessions across recreates. |
| `PUID` / `PGID` | `1000` / `1000` | Ownership of `/data`. Unraid uses `99` / `100`. |
| `PUBLIC_BASE_URL` | *(derived)* | Set it behind a reverse proxy — [device pairing](#pairing-a-device-with-no-browser) prints this address for a human to visit. |

**Cookies over plain HTTP.** `COOKIE_SECURE` defaults to `true`, so a browser
reaching this over `http://host:8787` will silently drop the session cookie.
Set `COOKIE_SECURE=false` for LAN-only HTTP, or put it behind a reverse proxy
with TLS and leave it alone. Bearer tokens work either way.

## Unraid

[`unraid/my-ddREST.xml`](unraid/my-ddREST.xml) is a Community-Applications-style
template. Copy it to `/boot/config/plugins/dockerMan/templates-user/` on your
server, then *Docker → Add Container* and pick **ddREST** from the template
dropdown.

Generate the key on the Unraid terminal first:

```bash
openssl rand -base64 32
```

Paste that into `SESSION_KEYS`. The template defaults `PUID`/`PGID` to `99`/`100`
and `COOKIE_SECURE` to `false`, which is what LAN-only HTTP access needs; the
rest is optional and hidden under *Advanced*. The WebUI button opens `/docs`.

The template ships no icon. Drop a PNG somewhere reachable and add an `<Icon>`
element if you want one in the Docker tab.

## Logging in

DoorDash redirects to a port nothing is listening on, so the browser shows
"connection refused". That is expected — the URL in the address bar is the
payload.

**1. Start.** Nothing is stored server-side; the pending login travels with you
inside `login_ticket`.

```bash
curl -sX POST http://localhost:8787/v1/auth/login/start
```

```json
{
  "authorize_url": "https://identity.doordash.com/authorize?...",
  "login_ticket": "ddl1.…",
  "redirect_uri": "http://localhost:4180/oauth2/callback",
  "expires_in": 600
}
```

**2. Open `authorize_url`** in a browser and sign in. You land on
`http://localhost:4180/oauth2/callback?code=…&state=…` and the page fails to
load. Copy the whole URL.

**3. Finish.** The `state` is checked against the ticket, then the code is
redeemed with the PKCE verifier.

```bash
curl -sX POST http://localhost:8787/v1/auth/login/complete \
  -H 'content-type: application/json' \
  -d '{"login_ticket":"ddl1.…","redirect_url":"http://localhost:4180/oauth2/callback?code=…&state=…"}'
```

You get a `session_token` back, and a `dd_session` cookie is set. If you would
rather parse the URL yourself, send `{"code":…,"state":…}` instead.

That is the last login you need until the session's hard expiry, 30 days later
by default — the tokens renew themselves in between.

## Pairing a device with no browser

Copying a long authorize URL onto a TV, a headless Pi or a serial console — and
a longer callback URL back off it — is the awkward part of the flow above. So
there is a second way in, shaped like [RFC 8628][rfc8628]: the device shows a
short code, you approve it from a computer you already trust, and the session is
delivered to the device.

This is **additive**. `/v1/auth/login/start` and `/v1/auth/login/complete` are
unchanged and remain the normal way in.

[rfc8628]: https://datatracker.ietf.org/doc/html/rfc8628

> **This is not a device grant against DoorDash.** DoorDash Identity does not
> implement RFC 8628. The grant is against ddREST, layered on the same
> paste-back login: a human still signs in through a real browser. The device
> never talks to DoorDash at all.

**1. The device asks for a code.**

```bash
curl -sX POST http://localhost:8787/v1/auth/pair/request \
  -H 'content-type: application/json' \
  -d '{"device_label":"Kitchen tablet"}'
```

```json
{
  "device_code": "ddp1.…",
  "user_code": "BCDF-GHJK",
  "verification_uri": "http://localhost:8787/v1/auth/pair",
  "verification_uri_complete": "http://localhost:8787/v1/auth/pair?user_code=BCDF-GHJK",
  "expires_in": 600,
  "interval": 5
}
```

The device displays `user_code` and keeps `device_code` secret — that is what
collects the session. `verification_uri_complete` prefills the code, so a device
with a screen can render it as a QR code and skip the typing entirely.

**2. The device polls**, no faster than `interval`:

```bash
curl -sX POST http://localhost:8787/v1/auth/pair/token \
  -H 'content-type: application/json' \
  -d '{"device_code":"ddp1.…"}'
```

Until someone acts, that returns HTTP 400 with an RFC 8628 error code:

| `error` | Meaning |
| --- | --- |
| `authorization_pending` | Nobody has approved yet. Keep polling. |
| `slow_down` | You polled too fast. The new minimum is in `interval`. |
| `access_denied` | A human refused. Stop. |
| `expired_token` | The code expired unapproved. Start over. |
| `invalid_grant` | Unknown device code, or the session was already collected. Stop. |

Each body carries both `error_description` (what an off-the-shelf device-flow
client reads) and `message` (this API's house style).

**3. You approve it.** Open `/v1/auth/pair` on a real computer and type the
code. The page walks through the same sign-in-and-paste as the normal flow, then
confirms. There is a Deny button next to Approve.

The page is plain server-rendered HTML with no JavaScript and no CDN — the
browser you walk over to may itself be a console or a TV.

If you would rather script it, `/v1/auth/pair/verify`, `/v1/auth/pair/complete`
and `/v1/auth/pair/deny` are the JSON equivalents of the three page steps.
Note that `/v1/auth/pair/complete` does **not** return the session to you: you
are approving access for someone else.

**4. The device's next poll returns the session**, in the same shape as
`/v1/auth/login/complete`. It is delivered exactly once — the pairing is deleted
on collection, so a replayed device code gets `invalid_grant`. No cookie is set.

### Before you expose this

Device flows have one inherent weakness, and it is worth stating plainly: an
attacker can start a pairing, then talk *you* into typing *their* code in. If
you approve it, they get your account. Nothing server-side can fully prevent
that, so the approval page says so in as many words and makes Deny as easy to
reach as Approve.

**Only ever approve a code you read off a device in front of you.** If a code
arrives by message, email or phone call, deny it.

The other attack — guessing a pending code — is handled by the code itself.
They are eight characters from a 20-consonant alphabet (no vowels, so a code
can never spell anything; no digits, so `O`/`0` and `I`/`1` cannot be confused),
which is about 34.6 bits. Repeated wrong-but-well-formed guesses are throttled
on top of that; malformed input is not, so fat-fingering the code will never
lock you out.

Turn the whole feature off with `PAIRING_ENABLED=false` if you do not want it.

### Pairing settings

| Variable | Default | Notes |
| --- | --- | --- |
| `PAIRING_ENABLED` | `true` | `false` makes every pairing endpoint 403 and the page unreachable. |
| `PAIRING_CODE_TTL_SECONDS` | `600` (10m) | How long a displayed code stays approvable. Must be at least 60 — it has to survive a whole browser login. |
| `PAIRING_POLL_INTERVAL_SECONDS` | `5` | Minimum seconds between polls. Faster earns a `slow_down`. |
| `PAIRING_MAX_PENDING` | `100` | Ceiling on unapproved pairings, since anyone can start one. |
| `PAIRING_DB_PATH` | next to `SESSION_DB_PATH` | e.g. `/data/sessions-pairings.db`. |
| `PUBLIC_BASE_URL` | *(derived from the request)* | **Set this behind a reverse proxy.** It is the address a device puts on screen for a human to walk to, so an internal hostname here is an address nobody can reach. |

## How sessions work

Present the credential either way:

```
Cookie: dd_session=dds2.…              # browser
Authorization: Bearer dds2.…           # CLI, scripts, services
```

The `dds2.` prefix distinguishes a session from a raw DoorDash token; sending
the latter gets a 401 that says so explicitly.

### Silent renewal

Measured against the live API, DoorDash access tokens last **72 hours** and come
with a refresh token that **rotates on every use, with the previous value
rejected immediately** (`bun run inspect-token` reproduces this).

That rotation is why the tokens cannot live on the client. If a response
carrying a rotated token were ever lost — a dropped connection, a client crash
mid-write — DoorDash would have already rotated, the new token would exist only
in that lost response, and the session would be permanently dead. So tokens are
held server-side in SQLite, where they can be updated durably.

When a request arrives with an access token within `SESSION_REFRESH_SKEW_SECONDS`
of expiry, the server renews it inline. **Your credential does not change**, so
there is nothing to store and no header to watch: the per-session key that
decrypts the row lives in the credential and never rotates, while only the row
contents are rewritten.

Concurrent requests are coalesced onto a single renewal — without that, ten
parallel requests would each spend the same refresh token and nine would get a
401. That coalescing is per-process, so **do not run multiple instances against
one SQLite file**; that needs a shared lock (Redis) instead.

If a renewal is refused the chain is broken for good, so the session is deleted
and the response is `401 {"error":"session_expired"}` pointing at a fresh login.

### How long a session can actually live

Measured against the live API:

| | |
| --- | --- |
| Access token lifetime | 72h (`expires_in` 259200) |
| Refresh token | Rotates on every use; previous value 401s immediately |
| Absolute cap on the chain | **None found** |

The last row is the important one. Access-token claims carry `orig_iat`
("original issued at") and no plain `iat` — a claim that only needs to exist if
something is measured from the first authentication, which is how a maximum
refresh window is usually enforced. But `orig_iat` **moves forward on every
refresh**, so each renewal mints a fresh 72h window anchored to now rather than
to the original login. Nothing ties the chain back to when you signed in.

So a session in regular use renews indefinitely, and `SESSION_MAX_AGE_SECONDS`
is a policy choice rather than a technical limit — how long should a leaked
credential stay usable, given that `POST /v1/auth/logout` can revoke it anyway?
The 30-day default is deliberately conservative; raise it freely.

Two caveats. This is inference from claims, not a guarantee: DoorDash could
enforce a cap server-side that the claims do not reflect. And how long an
*unused* refresh token survives is still unmeasured, which is what
`SESSION_IDLE_TIMEOUT_SECONDS` (14 days) hedges against. Either way the failure
mode is one browser login.

`bun run inspect-token` reproduces all of the above in a single run.

<details>
<summary>Measuring it yourself over time (rarely needed)</summary>

`scripts/probe-refresh-lifetime.ts` measures refresh-token lifetime empirically,
over real elapsed time. Now that the claims answer the absolute-cap question,
its only residual use is bounding the idle timeout, or confirming that no
server-side cap exists that the claims fail to show.

A probe **consumes the token** — a successful refresh rotates it and resets the
idle clock — so each success is both a data point and the token for the next
probe.

| Probe | Question | Method |
| --- | --- | --- |
| `idle` | How long can a token sit unused? | Gap doubles after each success (1d, 2d, 4d…) until refused |
| `sustained` | Does a regularly-used chain die anyway? | Refreshes daily; a failure means a cap the claims hid |

Use a dedicated login for each — the probe rotates the token it holds, so
sharing one with a live session would break both.

```bash
bun run probe-refresh init idle
```

`tick` only acts when a probe is due, and records the gap that *actually*
elapsed rather than the one scheduled, so a missed run or a sleeping machine
skews nothing:

```bash
(crontab -l 2>/dev/null; echo "0 * * * * cd $PWD && ~/.bun/bin/bun run probe-refresh tick idle") | crontab -
```

```bash
bun run probe-refresh status idle
```

State lives in `./data/refresh-probe-*.json`, written `0600` because it holds a
live credential, and gitignored.

</details>

### What is stored, and what protects it

Each session gets its own random data key. Only ciphertext goes in the database;
the key exists solely inside the client's credential:

```
dds2.<base64url( session_id[16] || data_key[32] )>
```

A dump of `sessions.db` therefore decrypts to nothing on its own. Compromising a
session still requires the client's credential, exactly as with any cookie.

`SESSION_KEYS` no longer protects sessions — it now covers only short-lived
sealed values: the login ticket, and the two pairing tickets below. It remains
an ordered list: first key seals, all decrypt, so prepend a new key to rotate.

Pairings get the same split-key treatment where it fits and a documented
exception where it does not. The **device code** is the same shape as a session
credential (`ddp1.<id||key>`) and only `sha256(key)` is stored, so a dump of the
pairings table yields no usable device code. The **session credential waiting to
be collected** cannot work that way — the browser doing the approving has never
seen the device code, so it has no key to encrypt to. It is sealed under
`SESSION_KEYS` instead, for the few minutes between approval and collection,
and the row is deleted the moment the device picks it up. Reading that table is
therefore not enough on its own; it also takes `SESSION_KEYS`, which is the same
boundary login tickets already rely on.

**CSRF.** Cookie-authenticated writes require a trusted `Origin`. Bearer-
authenticated requests are exempt — a cross-site page cannot set an
`Authorization` header without a CORS preflight it will not pass.

### Session lifetime settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `SESSION_MAX_AGE_SECONDS` | `2592000` (30d) | Hard end of a session, regardless of renewals. The only thing that forces a new browser login. |
| `SESSION_IDLE_TIMEOUT_SECONDS` | `1209600` (14d) | Drop a session unused for this long. Must be shorter than the cap or it can never fire — the server warns at startup if it cannot. |
| `SESSION_REFRESH_SKEW_SECONDS` | `300` (5m) | Renew once the access token is this close to expiring. |
| `SESSION_SWEEP_INTERVAL_SECONDS` | `3600` (1h) | How often expired rows are deleted. |
| `SESSION_DB_PATH` | `./data/sessions.db` | Where sessions live. |

Handy values: `604800` = 7d, `2592000` = 30d, `7776000` = 90d, `31536000` = 365d.

Non-positive values are rejected at startup rather than producing sessions that
are dead on arrival. The effective policy is printed on boot, since `.env` is
loaded automatically and a stale file silently overrides the defaults:

```
  Session policy:
    max age  30d       (SESSION_MAX_AGE_SECONDS=2592000)
    idle out 14d       (SESSION_IDLE_TIMEOUT_SECONDS=1209600)
    renew at 5m        before token expiry (SESSION_REFRESH_SKEW_SECONDS=300)
```

**Revocation is real.** `POST /v1/auth/logout` deletes the row, so every copy of
that credential stops working immediately. Sessions also expire on their own via
`SESSION_MAX_AGE_SECONDS` (hard deadline) and `SESSION_IDLE_TIMEOUT_SECONDS`
(unused for too long), swept periodically.

## Endpoints

The gateway is self-describing: MCP's `tools/list` returns every tool it offers,
with descriptions and input schemas. At the time of writing that is 62 tools, of
which ddREST covers the 26 that make up ordinary browse-cart-order use.

```bash
bun run list-tools
```

That prints what the gateway currently advertises and flags anything ddREST
calls that it does not — the check to run when adding a route or after DoorDash
ships a change.

| Method | Path | Tool |
| --- | --- | --- |
| GET | `/v1/restaurants` | `doordash_find_restaurants` |
| GET | `/v1/nearby-stores` | `internal_find_nearby_stores` |
| GET | `/v1/stores/{store_id}` | `internal_get_store_info` |
| GET | `/v1/stores/{store_id}/menu` | `doordash_get_restaurant_menu` |
| GET | `/v1/stores/{store_id}/items` | `internal_find_items_in_store` |
| GET | `/v1/stores/{store_id}/items/{item_id}` | `internal_get_item_details` |
| GET | `/v1/stores/{store_id}/menus/{menu_id}/items/{item_id}` | `doordash_get_food_item` |
| GET | `/v1/stores/{store_id}/promotions` | `internal_list_eligible_cart_promotions` |
| POST | `/v1/product-lists` | `doordash_create_product_list` |
| GET | `/v1/carts` | `doordash_list_active_carts` |
| POST | `/v1/carts/items` | `doordash_add_to_cart` |
| POST | `/v1/carts/{cart_uuid}/items` | `doordash_add_to_cart` |
| GET | `/v1/carts/{cart_uuid}` | `doordash_get_cart` |
| DELETE | `/v1/carts/{cart_uuid}` | `doordash_clear_cart` |
| DELETE | `/v1/carts/{cart_uuid}/items/{cart_item_id}` | `doordash_remove_cart_item` |
| POST | `/v1/carts/{cart_uuid}/promotions` | `internal_apply_cart_promotion` |
| DELETE | `/v1/carts/{cart_uuid}/promotions/{promo_code}` | `internal_remove_cart_promotion` |
| POST | `/v1/carts/{cart_uuid}/preview` | `internal_preview_order` |
| POST | `/v1/carts/{cart_uuid}/order` | `internal_submit_order` |
| GET | `/v1/carts/{cart_uuid}/checkout-url` | `doordash_get_checkout_url` |
| GET | `/v1/orders` | `internal_get_order_history` |
| GET | `/v1/orders/{order_uuid}/receipt` | `internal_get_order_receipt` |
| GET | `/v1/orders/{order_uuid}/status` | `internal_get_order_status` |
| POST | `/v1/orders/{order_uuid}/reorder` | `internal_reorder` |
| GET | `/v1/addresses` | `doordash_list_delivery_addresses` |
| PUT | `/v1/addresses/current` | `doordash_set_delivery_address` |
| GET | `/v1/payment-methods` | `doordash_get_payment_info` |

`POST /v1/carts/{cart_uuid}/order` places a real order and charges the account.
`tip_amount_cents` is required rather than defaulted, so a tip is always
deliberate.

### Locations

Anywhere coordinates are accepted — `GET /v1/restaurants` and
`GET /v1/nearby-stores` — you can pass an `address_id` from
`GET /v1/addresses` instead, and ddREST reads the coordinates off the saved
address for you:

```bash
curl -s "http://localhost:8787/v1/restaurants?query=pizza&address_id=addr-home" \
  -H "authorization: Bearer dds2.…"
```

That costs one extra upstream lookup, so passing `latitude`/`longitude`
directly stays the cheaper path. Nothing is cached — an address you just added
would otherwise be invisible until a TTL elapsed.

Sending `address_id` *and* coordinates is refused rather than picking a winner,
since the two can disagree and you would have no way to tell which was used. An
unknown id returns `address_not_found` and lists the ids that do exist; a saved
address with no coordinates on it returns `address_missing_coordinates` rather
than quietly falling back to the configured default.

The auth and pairing routes are not tool-backed:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/auth/login/start` | Begin the paste-back login |
| POST | `/v1/auth/login/complete` | Finish it and get a session |
| GET | `/v1/auth/session` | Inspect the current session |
| POST | `/v1/auth/logout` | Revoke it |
| POST | `/v1/auth/pair/request` | Device: ask for a pairing code |
| POST | `/v1/auth/pair/token` | Device: poll for the session |
| GET/POST | `/v1/auth/pair` | Human: the approval pages (HTML) |
| POST | `/v1/auth/pair/verify` | Human: look up a code (JSON) |
| POST | `/v1/auth/pair/complete` | Human: approve it (JSON) |
| POST | `/v1/auth/pair/deny` | Human: refuse it (JSON) |

### About `intent`

Every MCP tool requires an `intent` string, and per dd-cli's own help text
DoorDash "may review this data for research and product-improvement purposes".
This API generates it server-side, per operation, and forwards no end-user text.
Callers cannot set or influence it. Every string sent is in one auditable place:
[`src/mcp/tools.ts`](src/mcp/tools.ts).

### Errors

```json
{ "error": "session_expired", "message": "…", "login_start": "/v1/auth/login/start" }
```

`error` is a stable machine-readable code. Notable ones: `session_missing`,
`session_invalid`, `session_expired`, `csrf_origin_rejected`,
`login_ticket_expired`, `state_mismatch`, `token_exchange_failed`,
`doordash_unauthorized`, `doordash_forbidden`, `upstream_error`.

A `403 doordash_forbidden` with `private_beta_gating: true` means the account
authenticated fine but is not an approved consumer-MCP tester.

### Response bodies

Tool responses are passed through unvalidated. DoorDash does not publish their
shapes, so validating against a guess would reject real payloads the moment one
carried a field we had not anticipated.

## Testing

```bash
bun test
```

123 tests covering the crypto primitives, the full paste-back flow, session and
CSRF handling, silent renewal (including the concurrent-refresh race and a
refused renewal), SSE/JSON-RPC parsing, and every one of the 26 route-to-tool
mappings against their required arguments.

The suite runs against [`mock/upstream.ts`](mock/upstream.ts), which enforces
PKCE S256, single-use codes, `redirect_uri` consistency, bearer auth, SSE
framing, and — critically — the same refresh-token rotation the real endpoint
does, rejecting a spent token with a 401. A forgiving mock there would hide
exactly the bug this design exists to prevent.

The OAuth and token-lifetime behaviour has been confirmed against the live
DoorDash endpoints via `bun run inspect-token`, and the tool surface against
`bun run list-tools`. Individual tool *calls* have not been exercised live, and
their responses are passed through rather than validated.

To drive the mock manually:

```bash
bun run mock
```

```bash
DD_IDENTITY_BASE=http://127.0.0.1:8788 DD_TOKEN_BASE=http://127.0.0.1:8788 DD_MCP_BASE=http://127.0.0.1:8788 bun run dev
```

## Layout

```
src/
  config.ts            env parsing and validation
  crypto/               AES-256-GCM primitives, sealing, split-key handles
  auth/                PKCE, token exchange, login tickets, session middleware
  session/             SQLite store and the renewal coordinator
  pairing/             device-flow codes, store and lifecycle
  mcp/                 JSON-RPC + SSE client; tool names and intent strings
  routes/              auth flow, pairing, the 26 tool routes, and the /docs UI
  schemas/common.ts    shared input objects
mock/upstream.ts       stand-in for DoorDash Identity + MCP gateway
```

## Disclaimer

**ddREST is not affiliated with, endorsed by, or supported by DoorDash.** It is
an independent project. Nothing here is official, and DoorDash provides no
support for it.

**Access to the MCP server is gated by DoorDash.** It is waitlist-only and
requires an approved DoorDash account — see
[doordash-oss/doordash-cli](https://github.com/doordash-oss/doordash-cli) for
the waitlist and for DoorDash's own client. ddREST neither grants nor bypasses
that gating: it authenticates as you, using your own account, and does nothing
you could not already do through DoorDash's client. Without an approved account
it will not work at all.

**Your use of ddREST is still governed by DoorDash's terms.** Those terms define
"the CLI" to include the authentication tokens, not just the binary — so
authenticating through this project puts you squarely under DoorDash's CLI
Access Terms of Service, together with the Consumer Terms of Service and Privacy
Policy they incorporate. The CLI Terms ship with the `dd-cli` download. They
cover, among other things, personal and non-commercial use, acting only on your
own account, and limits on retaining or reusing data obtained through the CLI.

Read them and satisfy yourself that your intended use complies. That
responsibility is yours, not this project's, and nothing in this README grants
permission DoorDash has not.

Provided as-is, without warranty of any kind.
