# Client matrix — what each AI host needs from the same server

**Scope:** what each AI host needs from the one server — transport accepted, registration path, whether a bridge is needed, plus the ChatGPT connector-form mapping.
**Assumes:** the server from [`../cn-mcp-core/`](../cn-mcp-core/README.md) exists; you are choosing which hosts to support, not writing server code.

Your server does not change per host. What changes is **registration** and, for desktop apps, whether a bridge is needed.

| Host | Transport it accepts | Client registration | Notes |
|---|---|---|---|
| **ChatGPT** (plugins / MCP connections) | remote HTTPS **only** | CIMD preferred where available; DCR or pre-defined client also supported | No arbitrary API-key/custom-header field. Private tools need OAuth. |
| **Claude.ai** (web connectors) | remote HTTPS | expects **RFC 7591 DCR** | Advertise `registration_endpoint` or it cannot self-register. |
| **Claude Code / Claude Desktop** | remote HTTPS, or stdio via `mcp-remote` | DCR when remote | Desktop config takes a JSON snippet — ship it in your setup card. |
| **Cursor** | remote HTTPS (streamable) | expects DCR | Also happy with a bearer in a config header. |
| **Cline / other IDE agents** | usually stdio | n/a — bridge | Point them at `mcp-remote` against your HTTPS endpoint. |
| **Your own agent / SDK** | whatever you write | bearer is fine | Static token from the admin UI. |

**The one hard constraint:** ChatGPT will not talk to stdio. If a host you care about is desktop-only, `mcp-remote` bridges HTTPS → stdio; you do not build a second server.

## ChatGPT connector form

**The field-by-field mapping lives in [`setup-form.md`](./setup-form.md#the-modals-actual-fields), and only there.** This file used to carry a second copy of that table. It drifted — it claimed ChatGPT had no DCR, told you to invent a client id, and hardcoded the authorization server base to the frontend origin. All three are wrong on a server that advertises registration, and the two tables disagreeing was worse than either being incomplete.

Two things that belong here rather than there, because they are about choosing a host:

**Almost every field in that form is discovered, not typed.** You supply a name and the server URL; the twenty-odd inputs behind **Advanced OAuth settings** are read out of your `.well-known` documents. Which means the work is getting discovery right, not filling a form correctly.

**Verify discovery before clicking Create.** `curl` both documents. A 404 there is the single most common cause of *"MCP server does not implement OAuth"* — the error names OAuth, the fault is usually routing.

```bash
curl -sS https://MCP_ORIGIN/.well-known/oauth-protected-resource
curl -sS https://MCP_ORIGIN/.well-known/oauth-authorization-server
```

Read what comes back rather than assuming: `authorization_servers[0]` is frequently **not** the same host as `authorization_endpoint`. A server whose consent page is a frontend route and whose registration endpoint is a backend route will legitimately name two different origins, and someone "fixing" that mismatch by hand breaks a working connector.

## Client registration — prefer CIMD, keep DCR compatibility

OpenAI recommends Client ID Metadata Documents (CIMD); several other hosts still rely on RFC 7591 DCR. Implement the client mode your target hosts actually use, and keep DCR compatibility when needed. For DCR, expose `POST /oauth/register` and `registration_endpoint`:

- accept `application_type: web | native` only
- require HTTPS redirects for web clients; allow reviewed native loopback/private schemes
- exact-match and cap the redirect list
- bind the client id to the authorization-server issuer
- optionally dedupe identical safe registrations when it does not blur client identity
- registration is safe to leave open **only because** a registered client is inert until a human approves it on your consent page — say so in a comment, or the next reader will "fix" it

Return structured errors. A redacted backend message ("Server Error" plus a request id) tells the client nothing and leaks your internals into a public endpoint.


## Protocol-era support is a server choice

Hosts do not require separate business APIs for legacy and stateless MCP. Keep one endpoint and one dispatcher; negotiate initialize-based revisions and add `2026-07-28` through [`modern-protocol.md`](./modern-protocol.md). OpenAI does not publish a definitive ChatGPT revision allowlist, so prove the endpoint with Inspector and the actual host rather than inferring support from a version number alone.

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
