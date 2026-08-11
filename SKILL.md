---
name: chatgpt-mcp
description: Build ONE MCP server your app exposes to every AI host — ChatGPT apps/connectors, Claude.ai, Claude Code, Cursor, Cline, mcp-remote — with OAuth 2.1 PKCE, hashed bearers and an admin UI. Trigger on /chatgpt-mcp, "add MCP server", "ChatGPT connector", "Claude connector", "Cursor MCP", "OAuth PKCE for MCP", "ChatGPT custom app", "expose tools to ChatGPT", "expose tools to AI", "expose my app to an AI agent", "build MCP for Convex", "MCP server does not implement OAuth".
---

# One MCP server, every AI host

You build **one** remote MCP endpoint. ChatGPT, Claude.ai, Cursor and the rest all speak the same protocol to it. Nobody ships a per-vendor server — Notion, Stripe, Linear and GitHub each expose a single hosted endpoint and let every host connect. Vendor differences live in **how a client registers**, never in your server.

That is the whole design. If you find yourself branching on which AI is calling, stop — you have taken a wrong turn.

**Non-negotiables** (every host assumes them): remote HTTPS, OAuth 2.1 + PKCE S256, tokens hashed at rest, tool errors inside `result`.

## Read this much, then stop

| You are | Read |
|---|---|
| Anyone | this file, top to bottom (~5 min) |
| Wiring a specific client | `references/clients.md` |
| Designing the tool surface | `references/tool-design.md` ← **highest leverage, most-skipped** |
| Implementing the OAuth half | `references/oauth.md` |
| Choosing/serving the transport | `references/transport.md` |
| On Convex | `references/convex.md` — **read before writing code** |
| Debugging something broken | `references/pitfalls.md` (16 real ones) |

Load only what applies. Reading all of it costs tokens you want for the build.

## Decision tree (run first)

| Need | Build |
|---|---|
| Curl/script automation, internal only | **Phase 1 only** (bearer). ~30 min, one env var. |
| Any consumer AI host (ChatGPT, Claude.ai, Cursor) | **Phase 1 + 2**. Their forms have no API-key field — OAuth is mandatory. |
| Production, revocable per-user access | **Phase 1 + 2 + 3** (admin / user-settings UI). |

Always build bearer first — it stays as your dev escape hatch after OAuth lands.

## Phase 1 — the MCP server

One endpoint: `POST /mcp` → JSON-RPC in, JSON-RPC out. Handle `initialize`, `tools/list`, `tools/call`, `ping`, and ack `notifications/*`. That is the entire protocol surface most servers need.

Single-tenant? Generate `openssl rand -hex 32`, set it in **both** runtimes (frontend env AND backend env — e.g. `npx convex env set MCP_API_KEY <hex>`). Multi-tenant? Skip the shared secret entirely and mint per-user DB-backed tokens from day one — then pitfall #3 and checklist item 1 stop applying to you.

Typical layout (Next.js shape — adapt freely; the endpoint is just `POST(json) → json`):

- `app/api/mcp/route.ts` — POST handler, bearer check, dispatch
- `lib/mcp/types.ts` — `JsonRpcRequest|Response`, `ToolDef`, error constants
- `lib/mcp/server.ts` — `dispatchJsonRpc()`
- `lib/mcp/auth.ts` — `extractBearer`, `isAuthorized`
- `lib/mcp/tools/<surface>.ts` — one file per domain

**Store only `sha256(token)`.** The raw bearer is shown to the user exactly once, at mint. A database dump must contain no usable credential — and then there is nothing for an admin list to redact.

**Tool errors stay inside `result`** with `isError: true` and text content. Never bubble a handler exception into the JSON-RPC `error` envelope — hosts hide protocol errors from the user, so your careful message vanishes. Reserve `error` for protocol faults (unknown method, unknown tool, bad args → `-32602`).

Smoke test:
```bash
curl -X POST $BASE/mcp -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
# then tools/list, then tools/call
```

## Phase 2 — OAuth 2.1 + PKCE

Full recipe in `references/oauth.md`. The shape:

`consent page → mint code (short TTL, PKCE S256 challenge stored) → client POSTs /oauth/token with code_verifier → verify → mint access token`

Two tables, **both storing only sha256**: auth codes (delete the row on exchange, never a `consumed` flag) and access tokens. Serve `/.well-known/oauth-protected-resource` (RFC 9728) and `/.well-known/oauth-authorization-server` (RFC 8414) — and see pitfall #12 for *where* they must live.

## Phase 3 — admin / settings UI

1. **Setup card** — copy-to-clipboard fields, one tab per client (see `references/clients.md`). This replaces a separate onboarding doc.
2. **Tokens table** — `label`, status, `createdAt`, `lastUsedAt`, `expiresAt`, Revoke. No token preview: only the digest exists.
3. **Env note** — say plainly that `MCP_API_KEY` is a dev fallback and is not in the table.

## Security checklist (the gate before you expose it)

- [ ] `MCP_API_KEY` ≥ 32 hex chars, and its compare is constant-time-ish (same-length first)
- [ ] PKCE S256 only, `plain` refused; verifier length 43..128 enforced
- [ ] `redirect_uri` pre-registered per client + HTTPS-validated at the consent page. Host allowlist for known clients; under open DCR the consent page must render the destination HOST and mark the client name self-reported
- [ ] Auth codes single-use, ≤5 min TTL, row DELETED on exchange
- [ ] Access tokens carry `expiresAt` + a revoke path, re-validated on every call
- [ ] Tokens **and** auth codes stored as sha256; raw value returned exactly once, at mint
- [ ] 401 carries `WWW-Authenticate: Bearer resource_metadata="…"`
- [ ] Discovery documents pin their origin to a CONSTANT, never the request `Host` header
- [ ] No raw secrets in tool output
- [ ] Service-account env bypass is opt-in (skipped when the env var is unset)
- [ ] Per-minute **and** per-day rate limits on every write tool
- [ ] Multi-tenant: membership re-checked on EVERY call, not just at mint

## Adaptation notes

- **Any framework** — the endpoint is `POST(json) → json`. Hono, Express, SvelteKit, Workers: same dispatcher.
- **Any database** — PKCE/token logic is DB-agnostic; you need a by-hash lookup for tokens and codes plus an atomic delete-on-exchange.
- **Multi-tenant** — scope every tool query by the tenant on the token, and re-check membership per call: that is what kills a live bearer the moment a member is removed. OAuth-minted tokens have no tenant picker — decide up front between defaulting to a personal tenant and putting a selector on the consent page.
- **Per-user rather than admin-only** — consent switches from `requireAdmin` to `requireAuth`; revoke becomes an owner check; the tokens list filters by a `by_user` index.
- **No auth yet?** Build sign-in first. A consent page needs somebody to authorize on behalf of.

## Reference links

- MCP spec: https://modelcontextprotocol.io/specification/2025-11-25 · [authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- OpenAI Apps SDK: https://developers.openai.com/apps-sdk · [auth](https://developers.openai.com/apps-sdk/build/auth) · [MCP & connectors](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)
- RFC 7636 PKCE · RFC 8414 AS metadata · RFC 9728 protected-resource metadata · RFC 7591 dynamic client registration
- `mcp-remote` (HTTP → stdio bridge): https://www.npmjs.com/package/mcp-remote
- Prior art worth reading: [Notion's hosted MCP server](https://www.notion.com/blog/notions-hosted-mcp-server-an-inside-look) · [Stripe MCP](https://docs.stripe.com/mcp)
