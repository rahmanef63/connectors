# MCP 2026 dual-stack — legacy and modern from one dispatcher

**Scope:** the production migration from initialize-based MCP through `2025-11-25` to stateless MCP `2026-07-28`, without cloning the tool registry, policy layer or business handlers.
**Assumes:** the existing server already answers `POST /mcp`; read [`transport.md`](./transport.md) first and [`versioning.md`](./versioning.md) before removing any legacy revision.

The protocol now has two **behavior eras**, not merely two version strings:

| Era | Revisions | Startup | Request context |
|---|---|---|---|
| **legacy** | `2024-*` through `2025-11-25` | `initialize` → `notifications/initialized` | negotiated once, then retained for the connection |
| **modern** | starts at `2026-07-28` | no handshake; optional client probe through `server/discover` | protocol version, client identity and capabilities travel on every request |

A production server should normally serve both eras from one endpoint while its client mix is unknown. The official TypeScript SDK can probe modern support and fall back to legacy automatically, and the stateless proposal explicitly permits a server to keep `initialize` beside the modern RPCs.

## The architecture: two protocol adapters, one application core

Do not fork the app into a 2025 server and a 2026 server. Split only the wire-specific work:

```text
POST /mcp
  → authenticate this request
  → parse JSON-RPC once
  → classify legacy or modern
  → validate that era's transport contract
  → dispatch to the same catalog / policy / approval / audit / handler pipeline
  → wrap the result for that era
```

The dispatcher receives the same normalized input either way:

```ts
type NormalizedCall = {
  caller: Principal;
  method: string;
  name?: string;
  params: Record<string, unknown>;
  protocolVersion: string;
};
```

Nothing below that type knows whether the request arrived through `initialize` or `server/discover`.

## Classify before dispatch, not by user agent

Never branch on `ChatGPT`, `Claude`, `Cursor`, a header fingerprint or an IP range. Classify from the protocol itself:

```ts
const modern =
  body.method === "server/discover" ||
  header("mcp-protocol-version") === "2026-07-28" ||
  body.params?._meta?.["io.modelcontextprotocol/protocolVersion"] !== undefined ||
  header("mcp-method") !== null ||
  header("mcp-name") !== null;
```

Treat a partially-modern request as modern and reject the mismatch. In particular, any body protocol-version metadata opts into modern validation even when the value is unsupported, so it returns the dedicated supported-version error instead of slipping into the legacy path. Falling back silently after seeing modern-only fields lets a proxy route one target while the body dispatches another.

## Legacy path

Keep the existing behavior for every legacy revision you still claim:

- implement `initialize`, `ping`, `tools/list`, `tools/call` and the primitives you actually expose;
- echo the requested legacy revision when it is in your supported set;
- return the newest legacy revision you support when the request is absent or unknown;
- acknowledge notifications with an empty HTTP response;
- do not require modern-only headers on this path.

A legacy client that omits `MCP-Protocol-Version` may still be real. Strict modern validation belongs only after the request has identified itself as modern.

## Modern path

`2026-07-28` removes `initialize`, `notifications/initialized` and `Mcp-Session-Id`. Every request must stand alone.

### 1. Implement `server/discover`

Servers **must** implement it; clients may skip it and call another RPC directly. Return at least:

```json
{
  "supportedVersions": ["2026-07-28"],
  "capabilities": {
    "tools": {},
    "resources": {}
  },
  "serverInfo": {
    "name": "SERVER_NAME",
    "version": "SERVER_VERSION"
  },
  "instructions": "Short operational rules the model must follow."
}
```

Do not advertise a modern revision until every normal RPC can also be served without hidden session state.

Draft extensions may be advertised under `capabilities.extensions`, for example `io.modelcontextprotocol/skills`, but keep them out of the minimum example and provide standard-resource fallback. Extension negotiation does not make a draft method universal.

### 2. Validate header and body agreement

For Streamable HTTP modern requests, validate:

- `MCP-Protocol-Version` equals the version in request `_meta`;
- `Mcp-Method` equals the JSON-RPC `method`;
- `Mcp-Name` equals the addressed tool, resource or prompt name when the method has one;
- the request carries the client metadata/capabilities your implementation requires;
- an unsupported version fails before business dispatch and returns the supported list.

Example request:

```http
POST /mcp HTTP/1.1
Content-Type: application/json
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/call
Mcp-Name: posts_create
```

```json
{
  "jsonrpc": "2.0",
  "id": 17,
  "method": "tools/call",
  "params": {
    "name": "posts_create",
    "arguments": { "title": "Hello" },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        "name": "CLIENT_NAME",
        "version": "CLIENT_VERSION"
      },
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

The duplicated method/name are intentional. They let a gateway, WAF or rate limiter route on headers, while equality checks stop the header layer and body dispatcher from authorizing different calls.

When a tool name or resource URI contains non-ASCII text, encode its UTF-8 bytes as standard padded Base64 and wrap the header value with the exact sentinel:

```text
=?base64?<BASE64_PAYLOAD>?=
```

Decode with fatal UTF-8 validation before comparing to the body. Reject empty payloads, invalid padding/alphabet and malformed UTF-8; never compare the encoded sentinel string directly to the Unicode JSON value.

### 3. Return the modern result envelope

A complete response carries server identity and `resultType: "complete"`. List/read responses also carry cache hints:

```json
{
  "tools": [],
  "ttlMs": 60000,
  "cacheScope": "private",
  "resultType": "complete",
  "_meta": {
    "io.modelcontextprotocol/serverInfo": {
      "name": "SERVER_NAME",
      "version": "SERVER_VERSION"
    }
  }
}
```

Use `cacheScope: "private"` whenever the list depends on user identity, scopes, connected accounts, tenant policy or online devices. A public cache key for a per-user catalog is an authorization leak.

### 4. Unknown RPC means both JSON-RPC and HTTP failure

For modern HTTP, an unsupported RPC returns:

- JSON-RPC `-32601` (`Method not found`); and
- HTTP `404 Not Found`.

An unknown **tool name** under the known `tools/call` method is bad params, not an unknown RPC method. Keep those two cases separate in tests.

## Dynamic catalogs: deterministic, private and inspectable

Build `tools/list` from the authenticated caller's current authorization context, then:

1. sort tools by stable name;
2. emit identical descriptors for identical authorization context;
3. include a private TTL;
4. optionally add a namespaced SHA-256 digest over the exact descriptor array.

The digest is not a substitute for versioning. It is an observability hook that tells logs, tests and clients that the catalog changed without copying the entire payload into an audit event.

```json
{
  "_meta": {
    "com.example.mcp/toolset": {
      "version": "SERVER_VERSION",
      "digest": "sha256:…"
    }
  }
}
```

Vendor-namespace custom metadata. Never put a bare `version` or `digest` key in `_meta` and hope no later protocol field collides with it.

## Explicit state, not transport state

Stateless MCP does not forbid a stateful workflow. It forbids hiding that state in a transport session.

When several calls belong together, return an explicit opaque handle and require it on later calls:

```text
workflow_start → { workflowId }
step_a({ workflowId, ... })
step_b({ workflowId, ... })
workflow_finish({ workflowId, verification })
```

This is also the right pattern for resumable imports, render jobs and approval flows. The model can see and preserve the handle; a load balancer can send every request to a different instance.

## Dual-stack pseudocode

```ts
async function handleMcp(request: Request): Promise<Response> {
  const token = parseBearer(request.headers.get("authorization"));
  const caller = await authenticateEveryRequest(token);
  const body = await readBoundedJsonObject(request);
  const rpc = parseJsonRpc(body);
  const transport = readMcpHeaders(request.headers);

  const era = classifyEra(rpc, transport);
  if (era === "modern") validateModernRequest(rpc, transport);

  if (rpc.id === undefined) return new Response(null, { status: 202 });

  try {
    const value = await dispatchSamePipeline({ caller, rpc });
    const result = era === "modern" ? completeModern(value) : value;
    return jsonRpcResult(rpc.id, result, 200);
  } catch (error) {
    return mapProtocolFailure(error, { id: rpc.id, era, method: rpc.method });
  }
}
```

Authentication happens on **every** request in both eras. Removing `initialize` must never remove the only auth check.

## Migration order

1. Extract one protocol-neutral dispatcher and one descriptor builder.
2. Pin the legacy behavior with snapshots and live tests.
3. Add `server/discover` and modern validation beside it.
4. Add modern result wrapping and private cache hints.
5. Run the same tool-call test once through each era.
6. Deploy without deleting `initialize`.
7. Log negotiated eras for a full usage cycle before considering any legacy removal.

Do not roll out a new gateway adapter and a new authorization schema in the wrong order. When modern support also adds OAuth audience/issuer fields, deploy the data/control-plane changes first, then the edge that starts sending them.

## Contract tests worth keeping forever

- every advertised legacy revision is actually echoed and served;
- modern `server/discover` returns the revision and capabilities the server really supports;
- header/body version mismatch is rejected before dispatch;
- header/body method mismatch is rejected before dispatch;
- header/body tool-name mismatch is rejected before dispatch;
- modern unknown RPC returns HTTP 404 plus JSON-RPC `-32601`;
- modern unknown tool never reaches a handler;
- one normalized tool call produces the same business result in both eras;
- private catalogs are deterministic and their digest changes when a descriptor changes;
- no request succeeds without independent authentication.

## Primary sources

- MCP release overview: <https://blog.modelcontextprotocol.io/posts/2026-07-28/>
- Stateless protocol proposal and migration scenarios: <https://modelcontextprotocol.io/seps/2575-stateless-mcp>
- `server/discover`: <https://modelcontextprotocol.io/specification/2026-07-28/server/discover>
- TypeScript SDK era negotiation: <https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions>
