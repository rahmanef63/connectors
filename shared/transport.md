# Transport

## One endpoint, JSON-RPC over POST

`POST /mcp`, `content-type: application/json`, a JSON-RPC object in and one out. That covers every remote host.

Methods to implement: `initialize`, `tools/list`, `tools/call`, `ping`. Ack `notifications/*`.

## Streamable HTTP vs SSE

Modern hosts use **streamable HTTP**. Some older or IDE clients still expect **SSE**. Notion serves both — streamable HTTP suits Cursor, SSE buys compatibility with more clients — and crucially, **the payloads are identical**. Supporting SSE is a transport concern, never a second tool surface or a second output format.

Start with plain POST. Add SSE only when a client you actually need refuses to connect. Do not adapt output per client; that is the road back to N servers.

## JSON-RPC batching is GONE

The 2025-06-18 revision **removed** batching from MCP. Do not implement array-of-requests handling, and delete it if an older recipe told you to. No shipping client emits batches.

## Notifications

A notification has **no `id`** and expects **no body**. Ack every one with `202`, not just `notifications/initialized` — a client that sends `notifications/cancelled` and gets nothing back will sit waiting.

```ts
if (body?.id == null && String(body?.method ?? "").startsWith("notifications/")) {
  return new Response(null, { status: 202 });
}
```

Deciding this before the auth check is a legitimate trade (it does no work and reveals nothing) but it means notifications skip your rate limiter. Fine by default — just write the trade-off down where the next reader sees it.

## Protocol version

Echo back `params.protocolVersion` when you support it, otherwise return your newest. `"2024-11-05"` is still accepted by every shipping client, so a stale constant is not urgent — but a hardcoded one that ignores the client's request is a latent break.

Capabilities: `{ tools: { listChanged: false } }` unless you genuinely push list changes.

## Error codes

| Code | Use for |
|---|---|
| `-32700` | unparseable body |
| `-32601` | unknown method |
| `-32602` | unknown tool, or bad arguments — this is the spec's own worked example |
| `-32603` | your dispatcher threw |
| `-32001` (custom) | unauthorized — pair it with HTTP 401 + `WWW-Authenticate` |
| `-32029` (custom) | rate limited — pair it with HTTP 429 + `Retry-After` |

**Execution failures are not protocol errors.** A tool that ran and failed returns `result.isError = true` with text. Only the transport/dispatch layer uses the `error` envelope.

## Status codes that matter to a host

- **401** on a bad/absent bearer, always with `WWW-Authenticate: Bearer resource_metadata="https://…/.well-known/oauth-protected-resource"`. That header is how a client discovers where to authenticate; without it, hosts report your server as not supporting OAuth.
- **429** with `Retry-After`.
- **202** with an empty body for notifications.
- **405** on `GET /mcp`, with `Allow: POST`.

## Discovery documents

Serve both, cacheable (`public, max-age=3600`):

- `/.well-known/oauth-protected-resource` (RFC 9728)
- `/.well-known/oauth-authorization-server` (RFC 8414)

**Pin their origin to a constant, never the request `Host` header.** These documents are identical for every caller, so reading the host buys nothing — and it lets a spoofed `Host` rewrite the `authorization_endpoint` a client is about to trust.

Framework trap: on Next.js with `cacheComponents` (PPR) enabled, adding a **second** child under `app/.well-known/` has been observed to break the build while prerendering an unrelated page. If that bites, author the documents under a normal path and map them with `rewrites()` — clients still see the RFC path, which is all the spec requires.
