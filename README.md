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

Then browse the API at **http://localhost:8787/docs**. Complete the login flow
below once and *Try it out* works on every endpoint from that page.

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
| `PUBLIC_BASE_URL` | *(derived)* | Set it behind a reverse proxy — [device pairing](https://github.com/LarveyOfficial/ddREST/wiki/Device-pairing) prints this address for a human to visit. |

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

DoorDash only permits loopback OAuth callbacks, so this server cannot receive
the redirect. Log in once by pasting it back:

```bash
curl -sX POST http://localhost:8787/v1/auth/login/start
```

Open the `authorize_url` it returns and sign in. You land on
`http://localhost:4180/oauth2/callback?code=…&state=…` and the page fails to
load — that is expected, the URL in the address bar is the payload. Send it back
with the ticket:

```bash
curl -sX POST http://localhost:8787/v1/auth/login/complete \
  -H 'content-type: application/json' \
  -d '{"login_ticket":"ddl1.…","redirect_url":"http://localhost:4180/oauth2/callback?code=…&state=…"}'
```

You get a `session_token` back and a `dd_session` cookie is set. That is the
last login you need until the session's hard expiry, 30 days later by default —
the tokens renew themselves in between.

Signing in something with no usable browser, like a TV or a headless box? See
[Device pairing](https://github.com/LarveyOfficial/ddREST/wiki/Device-pairing).

Full walkthrough: [Logging in](https://github.com/LarveyOfficial/ddREST/wiki/Logging-in).

## Documentation

Browse the live API at **`/docs`** on your own instance — Swagger UI generated
from its own route definitions, so it always matches the version you are
running. The raw document is at `/openapi.json`.

Everything else is in the [wiki](https://github.com/LarveyOfficial/ddREST/wiki):

| Page | What is in it |
| --- | --- |
| [Logging in](https://github.com/LarveyOfficial/ddREST/wiki/Logging-in) | The paste-back OAuth flow in full, and why it works that way. |
| [Device pairing](https://github.com/LarveyOfficial/ddREST/wiki/Device-pairing) | RFC 8628-style pairing for devices with no browser. |
| [Sessions](https://github.com/LarveyOfficial/ddREST/wiki/Sessions) | Silent renewal, session lifetime, what is stored and what protects it. |
| [Endpoints](https://github.com/LarveyOfficial/ddREST/wiki/Endpoints) | Every route and its tool, locations, optional parameters, errors, response shapes. |
| [Development](https://github.com/LarveyOfficial/ddREST/wiki/Development) | Tests and a map of the source. |

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
