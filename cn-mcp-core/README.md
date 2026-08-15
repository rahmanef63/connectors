# cn-mcp-core — the MCP server

**Scope:** building the one remote MCP endpoint every AI host connects to — transport, auth, tools, OAuth, admin UI.
**Assumes:** a deployed web app on HTTPS with some notion of a signed-in user. Nothing else; no host chosen yet.

**Worked example:** a Next.js + Convex deployment implements this at **Phase 1 only** — bearer, no OAuth; each phase file cites its real files.

You build **one** remote MCP endpoint. ChatGPT, Claude.ai, Cursor and the rest all speak the same protocol to it. Nobody ships a per-vendor server — Notion, Stripe, Linear and GitHub each expose a single hosted endpoint and let every host connect. Vendor differences live in **how a client registers**, never in your server.

That is the whole design. If you find yourself branching on which AI is calling, stop — you have taken a wrong turn.

**Non-negotiable everywhere:** tokens hashed at rest, tool errors inside `result`.
**Non-negotiable for a public consumer host** (ChatGPT, Claude.ai): remote HTTPS, OAuth 2.1 + PKCE S256 — their forms expose no credential field. Claude Code, Cursor and `mcp-remote` take an arbitrary header from config, so bearer-only is a complete build there. See the decision tree below.

## Read this much, then stop

| You are | Read |
|---|---|
| Anyone | this file, top to bottom (~5 min) |
| Building the endpoint | [`phase-1-bearer.md`](./phase-1-bearer.md) |
| Adding OAuth | [`phase-2-oauth.md`](./phase-2-oauth.md) |
| Adding a settings UI | [`phase-3-admin-ui.md`](./phase-3-admin-ui.md) |
| Building the connect / setup screen | [`../shared/setup-form.md`](../shared/setup-form.md) — the spec for the card: one copy target per host |
| Wiring a specific client | [`../shared/clients.md`](../shared/clients.md) |
| Designing the tool surface | [`../shared/tool-design.md`](../shared/tool-design.md) ← **highest leverage, most-skipped** |
| Implementing the OAuth half | [`../shared/oauth.md`](../shared/oauth.md) |
| Choosing/serving the transport | [`../shared/transport.md`](../shared/transport.md) |
| On Convex | [`../shared/convex.md`](../shared/convex.md) — **read before writing code** |
| Producing icons or a directory logo | [`../shared/icons.md`](../shared/icons.md) — two squares are required by OpenAI, optional in MCP, no field in Claude |
| Debugging something broken | [`../shared/pitfalls.md`](../shared/pitfalls.md) (16 real ones) |
| Shipping it | [`../shared/security-checklist.md`](../shared/security-checklist.md) — the gate before you expose it |

Load only what applies. Reading all of it costs tokens you want for the build.

## Decision tree (run first)

| Need | Build |
|---|---|
| Curl/script automation, internal only | **Phase 1 only** (bearer). ~30 min, one env var. |
| Cursor, Claude Code, `mcp-remote` | **Phase 1 only** — they take an arbitrary header from config. |
| ChatGPT or Claude.ai connector form | **Phase 1 + 2**. Those forms have no API-key field — OAuth is mandatory. |
| Production, revocable per-user access | **Phase 1 + 2 + 3** (admin / user-settings UI). |

Always build bearer first — it stays as your dev escape hatch after OAuth lands.

## Adaptation notes

- **Any framework** — the endpoint is `POST(json) → json`. Hono, Express, SvelteKit, Workers: same dispatcher.
- **Any database** — PKCE/token logic is DB-agnostic; you need a by-hash lookup for tokens and codes plus an atomic delete-on-exchange.
- **Multi-tenant** — scope every tool query by the tenant on the token, and re-check membership per call: that is what kills a live bearer the moment a member is removed. OAuth-minted tokens have no tenant picker — decide up front between defaulting to a personal tenant and putting a selector on the consent page.
- **Per-user rather than admin-only** — consent switches from `requireAdmin` to `requireAuth`; revoke becomes an owner check; the tokens list filters by a `by_user` index.
- **No auth yet?** Build sign-in first. A consent page needs somebody to authorize on behalf of.

## Reference links

- MCP spec: https://modelcontextprotocol.io/specification/2025-11-25 · [authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- OpenAI Plugins, formerly Apps SDK — both `/apps-sdk` URLs now 301 here: https://developers.openai.com/plugins · [auth](https://developers.openai.com/plugins/build/auth) · [MCP & connectors](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)
- RFC 7636 PKCE · RFC 8414 AS metadata · RFC 9728 protected-resource metadata · RFC 7591 dynamic client registration
- `mcp-remote` (HTTP → stdio bridge): https://www.npmjs.com/package/mcp-remote
- Prior art worth reading: [Notion's hosted MCP server](https://www.notion.com/blog/notions-hosted-mcp-server-an-inside-look) · [Stripe MCP](https://docs.stripe.com/mcp)
