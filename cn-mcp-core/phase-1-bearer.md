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

Smoke test:
```bash
curl -X POST $BASE/mcp -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
# then tools/list, then tools/call
```

Next: [`phase-2-oauth.md`](./phase-2-oauth.md) if any consumer AI host has to connect.
