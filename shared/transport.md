# Transport

**Scope:** the wire contract — one `POST /mcp` endpoint, legacy and stateless protocol eras, Streamable HTTP/SSE, JSON-RPC errors, HTTP status, cache behavior and OAuth discovery.
**Assumes:** you are writing or debugging the endpoint itself. Authorization is [`oauth.md`](./oauth.md); the full 2026 migration is [`modern-protocol.md`](./modern-protocol.md).

## One endpoint, one dispatcher

Every remote host reaches one stable HTTPS endpoint, normally `POST /mcp`. The transport parses and normalizes JSON-RPC, then hands the call to the same catalog, policy, audit and business handlers.

Do not create a ChatGPT dispatcher, a Claude dispatcher and a Cursor dispatcher. Hosts differ at registration and negotiation, not at the application core.

## Two protocol eras now coexist

| Era | Revisions | Startup | What the endpoint implements |
|---|---|---|---|
| **Initialize-based** | `2024-11-05` through `2025-11-25` | `initialize`, then legacy lifecycle/notifications | `initialize`, `ping`, `tools/*` and any `resources/*` / `prompts/*` you genuinely expose |
| **Stateless** | `2026-07-28` onward | no `initialize`; optional `server/discover` probe | `server/discover` plus normal RPCs, each carrying its own version/client context |

Serve both from one URL while real clients still use both. The implementation pattern is in [`modern-protocol.md`](./modern-protocol.md).

## Legacy methods

At minimum:

- `initialize`;
- `tools/list`;
- `tools/call`;
- `ping`;
- empty acknowledgement for supported notifications.

MCP also defines resources and prompts. Decide deliberately whether each capability is a tool, resource or prompt in [`tool-design.md`](./tool-design.md); do not implement an addressable document as a model-controlled tool by reflex.

`tools/list` is paginated in the protocol. A small static catalog may return one page, but a per-tenant/generated catalog must either remain bounded or implement opaque cursors honestly.

## Modern methods and headers

The stateless era requires `server/discover` on the server and self-describing normal requests. Over HTTP, modern requests duplicate routing facts in headers:

```http
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/call
Mcp-Name: posts_create
```

The body carries the same method/name and per-request `_meta`. Validate equality before dispatch. Do **not** demand those headers from a request that negotiated a legacy revision; that breaks the compatibility path you intended to keep.

## Streamable HTTP vs SSE

Modern hosts use **Streamable HTTP**. A JSON-RPC request sent by POST may receive either:

- one `application/json` JSON-RPC object; or
- `text/event-stream` when the server genuinely streams.

A GET may return SSE or answer `405 Method Not Allowed` with `Allow: POST` when the server does not offer a resumable SSE stream. Session IDs are optional in initialize-based Streamable HTTP and absent in stateless MCP.

Start with bounded JSON POST. Add SSE when a client or workload actually needs progress, resumability or server messages. SSE is a transport choice, never a second tool catalog or result format.

## Batching is version-specific, not a timeless feature

- `2025-03-26` added JSON-RPC batching.
- `2025-06-18` removed it.
- Stateless MCP is self-contained per request.

Do not accept request arrays on a `2025-06-18+` path. Only keep batch handling when you intentionally still support a revision that defined it and your logs show clients using it. “Be lenient everywhere” is not compatibility when it makes the negotiated protocol meaningless.

## Notifications

For initialize-based clients, a JSON-RPC notification has no `id` and expects no JSON-RPC response. Over the simple HTTP adapter, return an empty `202 Accepted` for the notifications you support:

```ts
if (rpc.id === undefined) {
  return new Response(null, { status: 202 });
}
```

Validate authentication and any modern transport metadata **before** treating arbitrary input as a harmless notification. Otherwise a notification-shaped request can become an unmetered bypass.

## Protocol negotiation

### Initialize-based

Keep an explicit supported set. When the client requests one you support, echo it. Otherwise return your newest legacy revision and let the client decide whether it can continue.

```ts
const LEGACY = ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"] as const;
```

Do not advertise a revision because its number is newer. Advertise it only when you implement the behavior that revision requires.

### Stateless

The version is per request. Validate:

- header version equals body `_meta` version;
- method header equals JSON-RPC method;
- name header equals tool/resource/prompt target when applicable;
- unsupported version returns a dedicated error with the supported list.

## JSON-RPC error mapping

| Code | Use for |
|---|---|
| `-32700` | body cannot be parsed as JSON |
| `-32600` | malformed JSON-RPC request |
| `-32601` | RPC method the server does not implement |
| `-32602` | invalid params or unknown tool under a known `tools/call` method |
| `-32603` | internal dispatch failure after safe normalization |
| implementation-defined `-320xx` | stable transport/auth/version/rate-limit conditions your clients can act on |

An unknown **tool** is not an unknown **RPC method**. Tests should prove an unlisted tool never reaches a handler.

Execution failures are tool results, not protocol errors. Return `result.isError = true` with readable text so the model can explain the failure. The exact result contract is [`results.md`](./results.md).

## HTTP status matters too

Use HTTP as well as JSON-RPC:

- **200** — normal JSON-RPC result, including `isError: true` execution outcomes;
- **202** — accepted notification with empty body;
- **400** — malformed request or modern header/body mismatch;
- **401** — absent/invalid bearer, with `WWW-Authenticate` discovery pointer;
- **403** — valid credential with insufficient scope, with RFC 6750 challenge;
- **404** — stateless RPC method not found, paired with JSON-RPC `-32601`;
- **405** — unsupported HTTP verb, with `Allow`;
- **413** — request body over the server cap;
- **429** — rate limited, with `Retry-After`;
- **500/502/504** — transport/upstream failures only after internal detail is redacted.

A blanket “always 200 because JSON-RPC” throws away the recovery signals OAuth clients, proxies and operators need.

## OAuth discovery is not `server/discover`

These are three different documents/RPCs:

| Surface | Purpose |
|---|---|
| `/.well-known/oauth-protected-resource` | names the MCP resource and authorization server |
| `/.well-known/oauth-authorization-server` | names OAuth endpoints and capabilities |
| `server/discover` | stateless MCP protocol/capability discovery |

Serve the two OAuth documents public, CORS-open and cacheable (`public, max-age=3600`). Pin their contents to trusted deployment constants, never the request host.

`server/discover` may contain per-server protocol instructions and capabilities. If its output can vary by authorization context, mark it private; do not reuse the public OAuth metadata cache policy blindly.

## Per-user catalogs and cache safety

A dynamic `tools/list` is authorization data. Build it only after authenticating the request and intersecting:

```text
installed capabilities
∩ connected accounts/devices
∩ tenant membership
∩ policy
∩ caller scopes
```

Then:

- sort by stable name;
- return deterministic descriptors;
- use private cache scope/short TTL in the modern era;
- never put one user's list in a shared CDN cache;
- optionally emit a namespaced digest for observability.

## Request and response bounds

At the HTTP edge:

- require JSON content type for JSON requests;
- cap declared and actual request bytes;
- parse one object, not arbitrary top-level values;
- cap response bytes and streaming duration;
- cancel work when the caller disconnects;
- never follow a credential-bearing redirect to another origin;
- return generic external errors and detailed redacted server logs.

Rich image/file tools may receive an explicitly reviewed larger result cap. Do not raise the global cap to accommodate one screenshot endpoint.

## Framework routing trap

On some Next.js/PPR builds, multiple literal children under `app/.well-known/` have caused prerender failures. A safe fallback is to author metadata under normal routes and map the RFC paths with rewrites. What matters is the externally visible URL and response, not the source-tree folder spelling.

## Verification commands

```bash
curl -i https://MCP_ORIGIN/mcp
curl -i https://MCP_ORIGIN/.well-known/oauth-protected-resource
curl -i https://MCP_ORIGIN/.well-known/oauth-authorization-server
```

Then use MCP Inspector for one legacy initialize flow and one stateless `server/discover`/tool-call flow. A browser showing a JSON page is not proof that a host can negotiate the wire contract.

## Primary sources

- MCP transports (initialize-based): <https://modelcontextprotocol.io/specification/2025-11-25/basic/transports>
- MCP stateless release: <https://blog.modelcontextprotocol.io/posts/2026-07-28/>
- Stateless migration details: <https://modelcontextprotocol.io/seps/2575-stateless-mcp>
- OpenAI MCP server guide: <https://developers.openai.com/plugins/build/mcp-server>
