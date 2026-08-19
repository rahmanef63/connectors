# Results — one payload, two representations, one declared contract

**Scope:** production `tools/call` results — text content, `structuredContent`, exact `outputSchema`, errors, private `_meta`, files/images and response-size bounds.
**Assumes:** you have tools that run. What they should be named and how granular they should be is [`tool-design.md`](./tool-design.md).

## The safe default

Return functionally equivalent text and structured data from one normalized payload:

```ts
const payload = { item, found: item !== null };

return {
  content: [{ type: "text", text: renderForModel(payload) }],
  structuredContent: payload,
  isError: false,
};
```

The text is readable by every host and by the model. `structuredContent` lets the host or a linked UI consume data without scraping prose. Build both from the same value; two independently assembled representations eventually disagree.

## Current OpenAI contract: schema and structured content travel together

When a tool returns `structuredContent`, declare an `outputSchema` describing its **exact JSON object shape**. OpenAI validates the pair. Treat the schema as a public API contract, not decorative documentation.

```ts
const outputSchema = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    item: {
      anyOf: [
        {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
          },
          required: ["id", "title"],
          additionalProperties: false,
        },
        { type: "null" },
      ],
    },
  },
  required: ["found", "item"],
  additionalProperties: false,
};
```

Keep the schema inline and plain. Some runtimes reject `$schema`, `$defs` or `$ref` keys at a data boundary even though they are legal JSON Schema keywords; [`convex.md`](./convex.md) documents that backend-specific trap.

## Make every success an object envelope

Legacy MCP revisions define `structuredContent` as an object, while the stateless 2026 era permits broader JSON values. An object envelope works in both eras and avoids per-version result reshaping.

Use:

```text
scalar       → { result: 42 }
string       → { result: "done" }
array        → { items: [...], total: N }
not found    → { found: false, item: null }
empty list   → { items: [], nextCursor: null, total: 0 }
write ack    → { ok: true, id: "..." }
```

Do not return a bare array in `structuredContent` and an object in text. Normalize the handler's result first, then render both representations from it.

## Text should optimize model comprehension

Structured JSON is for machines; the text block is prompt context. It may be Markdown as long as it communicates the same facts:

```ts
function renderForModel(value: ListResult): string {
  if (value.items.length === 0) return `No posts found. Total: ${value.total}.`;
  return [
    `## Posts (${value.total})`,
    ...value.items.map((item) => `- **${item.title}** · \`${item.id}\``),
    value.nextCursor ? `Next cursor: \`${value.nextCursor}\`` : "End of list.",
  ].join("\n");
}
```

Always include identifiers required for the next call. “Markdown instead of JSON” must never become “prose without ids, counts or cursors.”

## Pagination must be honest

A bounded list result carries:

```json
{
  "items": [],
  "nextCursor": null,
  "total": 0,
  "truncated": false
}
```

If you cannot compute a total cheaply, use another explicit signal such as `hasMore`. Never silently slice 300 records to 30 and let the model report that 30 is everything.

Input, handler and result names must match exactly. A result returning `nextCursor` while the input accepts no `cursor` is a one-page API wearing pagination metadata.

## `isError` is not JSON-RPC `error`

A tool that was successfully addressed and then failed returns a normal JSON-RPC **result**:

```json
{
  "content": [
    { "type": "text", "text": "DEVICE_OFFLINE: Start the paired workstation and retry." }
  ],
  "isError": true
}
```

Use the JSON-RPC `error` envelope for protocol/dispatch failures: malformed JSON, unknown RPC method, unknown tool, invalid params, unsupported protocol version and transport-header mismatch.

The important behavioral reason: the model can read a tool result and explain it. Hosts often terminate or hide a protocol error.

Authorization is the deliberate exception. Missing/insufficient authorization must also carry the HTTP status and `WWW-Authenticate` metadata the client needs to reconnect; see [`oauth.md`](./oauth.md).

## Private `_meta` for host/UI data

Tool-result `_meta` is delivered to the host/component and hidden from the model. Use it for data a linked UI needs but the model should not spend tokens on, such as:

- pagination implementation details not needed for the next call;
- UI lookup tables;
- short-lived component state;
- a namespaced resource version.

It is **not a secret channel**. The third-party host still receives it. Never put access tokens, raw credentials or long-lived signed URLs there.

Namespace custom keys:

```json
{
  "_meta": {
    "com.example.widget/stateVersion": "3"
  }
}
```

## Files and images

For a generated file:

- return a gateway-controlled reference or short-lived HTTPS URL, never an absolute local path;
- include a safe basename, MIME type, byte size and expiry;
- cap downloads and lifetime;
- do not embed unbounded base64 into an ordinary result.

Inline image blocks are useful when the host supports them, but they raise response-size limits quickly. Review individual rich tools and give only those tools a higher bounded envelope; keep the default result limit small. A screenshot tool may justify several MiB. A `list_users` tool does not.

Input-side file handling and SSRF/size guards are in [`file-inputs.md`](./file-inputs.md).

## Size budget

Every successful structured result may ship twice: readable text plus structured data. Bound at the query and at the transport:

- list limit and cursor in the input schema;
- database query bound, not serializer truncation;
- maximum serialized result size;
- stricter default, explicitly reviewed exceptions;
- cancellation/timeout while streaming;
- no redirect-following when credentials could be replayed to another host.

When a result is too large, fail explicitly. A silently truncated JSON object can be valid JSON describing invalid state.

## Never return

- access, refresh, device or connector credentials;
- authorization headers or upstream error bodies that may echo them;
- local filesystem paths;
- internal row ids that the model has no legitimate reason to quote back;
- raw email, IP, trace/session identifiers or logs unless the tool's stated purpose and privacy policy require them;
- long-lived signed URLs;
- caller-supplied HTML/Markdown rendered without sanitization in a linked UI.

Redact in the shared execution pipeline so REST, MCP and future SDK surfaces cannot disagree about what leaks.

## Contract tests

- every descriptor with `structuredContent` declares the exact object `outputSchema`;
- success fixtures validate against that schema;
- text and structured data are derived from the same normalized payload;
- null, empty-list, scalar and write-ack branches all remain object envelopes;
- `isError` failures do not become JSON-RPC protocol errors;
- credentials and absolute paths are absent from text, structured data, files and `_meta`;
- large ordinary results fail at the default cap;
- explicitly reviewed rich results remain below their hard ceiling;
- file refs expire and contain no local path.

## Primary sources

- OpenAI tool descriptor and result reference: <https://developers.openai.com/plugins/reference>
- OpenAI MCP server guide: <https://developers.openai.com/plugins/build/mcp-server>
- MCP tools result schema: <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>
