# Client matrix — what each AI host needs from the same server

**Scope:** what each AI host needs from the one server — transport accepted, registration path, whether a bridge is needed, plus the ChatGPT connector-form mapping.
**Assumes:** the server from [`../cn-mcp-core/`](../cn-mcp-core/README.md) exists; you are choosing which hosts to support, not writing server code.

Your server does not change per host. What changes is **registration** and, for desktop apps, whether a bridge is needed.

| Host | Transport it accepts | Client registration | Notes |
|---|---|---|---|
| **ChatGPT** (apps / connectors) | remote HTTPS **only** | User-Defined OAuth Client — no DCR | No API-key field anywhere. OAuth is mandatory, not a choice. |
| **Claude.ai** (web connectors) | remote HTTPS | expects **RFC 7591 DCR** | Advertise `registration_endpoint` or it cannot self-register. |
| **Claude Code / Claude Desktop** | remote HTTPS, or stdio via `mcp-remote` | DCR when remote | Desktop config takes a JSON snippet — ship it in your setup card. |
| **Cursor** | remote HTTPS (streamable) | expects DCR | Also happy with a bearer in a config header. |
| **Cline / other IDE agents** | usually stdio | n/a — bridge | Point them at `mcp-remote` against your HTTPS endpoint. |
| **Your own agent / SDK** | whatever you write | bearer is fine | Static token from the admin UI. |

**The one hard constraint:** ChatGPT will not talk to stdio. If a host you care about is desktop-only, `mcp-remote` bridges HTTPS → stdio; you do not build a second server.

## ChatGPT connector form (exact mapping)

Settings → Connectors → New App:

| Field | Value |
|---|---|
| MCP Server URL | `https://MCP_ORIGIN/mcp` (on self-hosted Convex this is the SITE origin) |
| Authentication | `OAuth` |
| Registration method | `User-Defined OAuth Client` |
| Client ID | any string (`chatgpt-yourapp`) |
| Client Secret | *empty* |
| Token endpoint auth method | `none` |
| Auth URL | `https://FRONTEND/oauth/authorize` |
| Token URL | `https://FRONTEND/oauth/token` — must match where your route actually lives |
| Authorization server base | `https://FRONTEND` |
| Resource | `https://MCP_ORIGIN/mcp` |

**Verify discovery before clicking Create.** `curl` both `.well-known/*` documents. A 404 there is the single most common cause of *"MCP server does not implement OAuth"* — the error names OAuth but the fault is usually routing.

## Claude.ai / Cursor — add DCR

They register themselves. You need `POST /oauth/register` (RFC 7591) and `registration_endpoint` in your AS metadata:

- accept https-only `redirect_uris` (localhost allowed for dev)
- dedupe on an identical redirect-URI set instead of minting a new client every time
- cap the list (~8) per client
- registration is safe to leave open **only because** a registered client is inert until a human approves it on your consent page — say so in a comment, or the next reader will "fix" it

Return structured errors. A redacted backend message ("Server Error" plus a request id) tells the client nothing and leaks your internals into a public endpoint.

## Approval / "always allow"

There is **no server-side flag** for `alwaysAllow` or `skipUserConfirmation`. Approval is host UX. What you *can* steer, via annotations:

- `readOnlyHint: true` → reads usually skip approval entirely
- `idempotentHint: true` + `destructiveHint: false` → many hosts auto-approve after one "always allow" click
- `destructiveHint: true` → always prompts, which is correct — match the blast radius
- narrow, snake_case tool names → fewer mega-tools → less reason for a user to gate every call

Do not annotate a write as read-only to dodge a prompt. The prompt is the feature.

## Setup card — ship one tab per client

The highest-value UI you can build. Each tab shows that client's recipe:

- **ChatGPT** — the form values above, with copy buttons, and "leave Client Secret empty" stated explicitly
- **Claude.ai** — just the server URL; DCR does the rest
- **Desktop / IDE** — the `mcp-remote` JSON snippet, pre-filled with the user's URL
- **Script / curl** — a bearer from the tokens table plus a one-line `curl`

This replaces onboarding docs that go stale.
