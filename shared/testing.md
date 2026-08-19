# Testing — pin the contracts that otherwise drift silently

**Scope:** the highest-value tests for an MCP server and plugin package — descriptors, results, both protocol eras, OAuth attack cases, golden prompts, package integrity and one live acceptance call.
**Assumes:** the server runs and you can call `tools/list`. Debugging a server that does not answer is [`../cn-mcp-core/phase-1-bearer.md`](../cn-mcp-core/phase-1-bearer.md).

## Why ordinary coverage is not enough

The failures unique to MCP often behave exactly as written:

| Drift | Symptom |
|---|---|
| tool renamed | the model quietly stops choosing it |
| description changed | selection shifts with no exception |
| `destructiveHint` flipped | a host changes confirmation behavior |
| scope widened | old tokens fail later at call time |
| result no longer matches `outputSchema` | strict host throws after a successful handler |
| modern header and body target differ | proxy and dispatcher can authorize different operations |
| plugin path points nowhere | installation succeeds partially or fails in another host |

Testing here pins **intent and wire contracts**, not only code branches.

## 1. Snapshot the exact catalog

Extract one descriptor builder and call it from both the server and the test:

```ts
it("matches the reviewed tools/list contract", () => {
  expect(toolDescriptors()).toMatchSnapshot();
});
```

Review every snapshot diff. Regenerating automatically defeats the test.

For dynamic catalogs, snapshot representative authorization contexts rather than one global list:

```text
read-only user
write-enabled user
user with no connection
user with one online local device
user after device/connection revocation
```

Assert deterministic order and, when emitted, a deterministic digest.

## 2. Descriptor invariants

Loop over the whole registry:

- unique, stable names following one convention;
- non-empty `title` and task-oriented description;
- closed and compilable object `inputSchema`;
- all four annotations are booleans;
- no write is `readOnlyHint: true`;
- destructive tools require write authority;
- `securitySchemes` and compatibility `_meta.securitySchemes` agree;
- invocation-status strings remain within host limits;
- every structured-success tool declares an exact object `outputSchema`;
- no `$`-prefixed schema key crosses a backend that rejects it;
- no secret, real deployment id or placeholder appears in metadata.

One registry loop should protect every new tool automatically.

## 3. Result contract fixtures

Validate every success branch, not only the happy record:

```text
record found
record absent
empty list
next page present
scalar/ack result
generated file/image
```

For each fixture:

- validate `structuredContent` against `outputSchema`;
- prove it is an object envelope;
- prove the text contains functionally equivalent facts;
- prove ids/cursors needed for the next call remain present;
- prove credentials, local paths and internal diagnostics are absent;
- prove ordinary results stay under the default size cap;
- prove reviewed rich results stay under their separate hard ceiling.

Tool execution failures should return `isError: true`. Protocol failures should use JSON-RPC `error`. Keep a test that distinguishes them.

## 4. Dual-era protocol matrix

Run the same normalized business call through every era you advertise.

### Initialize-based cases

- each supported requested revision is echoed;
- unknown/absent request falls back to the newest legacy revision you actually implement;
- notifications return empty 202;
- request arrays are accepted only for a revision that defined batching;
- modern-only headers are not required.

### Stateless cases

- `server/discover` advertises only implemented versions/capabilities;
- body and `MCP-Protocol-Version` must match;
- body method and `Mcp-Method` must match;
- body target and `Mcp-Name` must match;
- non-ASCII name sentinel is decoded exactly when supported;
- missing client metadata/capabilities fails before dispatch;
- unknown RPC returns HTTP 404 + JSON-RPC `-32601`;
- unknown tool returns invalid params and never reaches a handler;
- complete result carries server identity and cache hints;
- a private per-user catalog never receives public cache scope.

Then one parity assertion:

```text
legacy tools/call(input X) and modern tools/call(input X)
→ same policy decision
→ same handler
→ same normalized business result
→ same audit semantics
```

## 5. OAuth attack matrix

The happy path is one test. Most OAuth tests should prove refusal:

- 401 contains a valid `resource_metadata` pointer;
- discovery pins trusted origins, resource and scopes;
- DCR refuses unsupported `application_type`;
- unsafe, repeated or unregistered redirect URI is refused;
- another issuer cannot use the client id;
- anonymous caller cannot mint a code;
- `plain` PKCE and malformed verifier are refused;
- malformed verifier does **not** burn a code;
- valid-shaped wrong verifier burns it and cannot be retried;
- thrown transaction failure cannot roll the deletion back;
- another client, redirect, issuer or resource cannot redeem the code;
- expired and replayed code produce the same opaque `invalid_grant`;
- token endpoint rejects JSON and accepts form encoding;
- token response has `no-store` and `no-cache`;
- token audience equals the protected resource;
- bearer for another audience or issuer fails authentication;
- read-only grant sees/calls no write action;
- reconnect replaces only the same client grant;
- no failure echoes code, verifier, token or service secret.

For CIMD, add SSRF, redirect, oversized document, timeout and stale-metadata tests.

## 6. Policy, approval and audit

For every risk tier:

- default decision is explicit and fail-closed;
- a caller cannot downgrade risk through arguments;
- approval binds connector + action + canonical input;
- changing one argument requires a new approval;
- one approval cannot be consumed twice concurrently;
- no approval store means refusal, not permission;
- denied/unknown actions write a safe audit event without raw payload;
- audit-sink failure does not report a completed side effect as failed;
- R4/arbitrary shell/filesystem capabilities are absent or unconditionally denied by construction.

## 7. Golden prompts

Keep direct, indirect, follow-up and negative prompts in the languages users actually type.

Structural CI tier:

- every expected tool exists;
- every tool has at least one direct prompt;
- negative prompts expect no call;
- no duplicate case ids;
- follow-up cases preserve ids returned by the prior result.

Behavioral on-demand tier:

- send the entire relevant catalog slice to the target model;
- fail setup errors loudly instead of scoring them as model misses;
- retry rate limits separately;
- group failures by confused tool pair;
- record model/version and catalog digest;
- know the token cost before running the whole suite.

## 8. Plugin-package contracts

For `.codex-plugin/plugin.json`, `.app.json`, `.mcp.json`, skills and marketplace entries:

- every JSON/YAML document parses;
- every declared relative path begins `./`, remains inside the package and exists;
- plugin/server/package versions intentionally agree;
- `.app.json` contains a real registered id, never placeholder text;
- `.mcp.json` contains no embedded user credential;
- OpenAI and Claude wrappers keep their own schema shapes;
- marketplace source resolves from the documented root;
- skills have valid frontmatter and no stale tool names;
- packaged, resource-served and optional extension entries resolve to the same reviewed source/digest;
- draft `skills/list` / `skills/get` is never the sole discovery path;
- no private key, bearer, token or raw `.env` value is tracked.

A cookbook should test the **template contract** without committing a real consumer package at its own root.

## 9. Documentation contracts

For a guide repo, CI should also verify:

- required H1/Scope/Assumes header shape;
- every relative Markdown link resolves;
- router file counts match the directory;
- generated consumer artifacts are not accidentally committed at cookbook root;
- placeholders stay generic;
- runnable example packages typecheck, test and build from a frozen lockfile.

This repository ships `scripts/check-docs.mjs` and `.github/workflows/docs.yml` as the executable version of that gate.

## 10. One live call before “done”

Run against the deployed URL and read the raw exchange:

1. both OAuth discovery documents;
2. unauthenticated 401 challenge;
3. one OAuth round trip;
4. one legacy `tools/list` and `tools/call`;
5. one stateless `server/discover`, `tools/list` and `tools/call` when advertised;
6. one read and one approval-gated write;
7. metadata refresh in the actual host;
8. one fresh installation of the packaged plugin when packaging is part of the deliverable.

Unit tests cannot prove a reverse proxy preserved headers, a deployment used the right origin, or a host refreshed its frozen tool snapshot.

## What not to fake

Do not hand-write a fake MCP client as the main wire proof. It tests your interpretation of the protocol—the part most likely to be wrong. Use MCP Inspector/official SDK transport for the wire and unit-test your dispatcher/handlers directly.

Do not score “the host connected” as an automated contract. Verify everything the repo controls, then keep a short manual acceptance checklist for the host UI.
