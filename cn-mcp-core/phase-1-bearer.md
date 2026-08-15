# Phase 1 — the MCP server

**Scope:** the endpoint itself — JSON-RPC dispatch, bearer auth, tool registry.
**Assumes:** you read [`README.md`](./README.md) and picked at least Phase 1 from the decision tree.

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

## Worked example

The worked example (Next.js + Convex) ships exactly this phase — bearer only, 11 tools, no OAuth.

| File | Shows |
|---|---|
| `convex/mcp/routes.ts` | `POST /mcp` on a Convex `httpRouter`; `GET` answers **405 + `allow: POST, OPTIONS`**, not 404, so legacy HTTP+SSE probes get a readable answer; every response `cache-control: no-store` |
| `convex/mcp/jsonrpc.ts` | the dispatcher — `initialize`/`ping`/`tools/list`/`tools/call`, `notifications/*` produce no response object (route then answers 202), tool failures become `isError` text inside `result` |
| `convex/mcp/auth.ts` | the two-gate model below; constant-time compare, fails closed when the key is unset or under 32 chars |
| `convex/mcp/tools.ts` | 11 tool defs whose annotation hints are derived from one 4-value `kind` (`read`/`idempotent`/`create`/`destructive`), `openWorldHint: false` throughout |
| `convex/mcp/handlers.ts` | one handler per tool, each taking the tenant as a **parameter**; a 9-name denylist (`businessId`, `tenantId`, `token`, …) makes a smuggled tenant arg a hard `VALIDATION_ERROR`, not an ignored key |
| `convex/mcp/types.ts` | wire types, capabilities `{ tools: { listChanged: false } }`, `protocolVersion` pinned to `"2024-11-05"` — that is *its* pin, check the current spec revision before copying it |

**Two gates, not one** (`auth.ts:1-12`). Gate 1: the `MCP_API_KEY` bearer answers "may this client speak MCP to this deployment". Gate 2: a per-tenant token in `X-Action-API-Key` answers "which workspace", resolved through the same internal query the REST routes use. A shared bearer cannot be the tenant in a multi-tenant backend, and letting a tool argument name the tenant is a cross-tenant hole. Clients whose connector form exposes only one credential field may send `Bearer <MCP_API_KEY>:<agent token>` — both halves are still verified independently.

**Origin gotcha.** On Convex the endpoint lives on the SITE host; the CLOUD host 404s. Same trap in other shapes: mount the route where the platform actually serves HTTP. `routes.ts:1-3`:

```ts
// MCP transport: POST /mcp on the Convex SITE origin (CONVEX_SITE_URL — the
// *.convex.site host, NOT the *.convex.cloud one; httpRouter only mounts on
// site). This is the URL an MCP client is configured with.
```

Smoke test:
```bash
curl -X POST $BASE/mcp -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}'
# then tools/list, then tools/call
```

Next: [`phase-2-oauth.md`](./phase-2-oauth.md) if any consumer AI host has to connect.
