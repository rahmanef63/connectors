# Versioning — what you may change without breaking a stranger's assistant

**Scope:** the independent contracts a connector ships, which edits are additive or breaking, and how to migrate a live endpoint without silently changing another person's assistant.
**Assumes:** you have a working server. Read [`tool-design.md`](./tool-design.md) first; this is about changing a surface, not choosing one.

A remote connector has no consumer-controlled deploy. You change production, and the next discovery/scan/conversation can see a different contract. Treat every externally visible descriptor as versioned even when no semver field sits beside it.

## Five independent version axes

| Axis | Lives in | Who breaks when it moves |
|---|---|---|
| **Protocol era/revision** | `initialize` or modern per-request metadata + `server/discover` | host transport |
| **Tool/resource/prompt catalog** | `tools/list`, `resources/list`, `prompts/list` | model choice, saved approvals and workflows |
| **Authorization** | OAuth discovery, scopes, issuer/audience checks | already-issued grants and reconnect flows |
| **Reviewed plugin snapshot** | scanned OpenAI/other directory metadata | installed workspace/public plugin |
| **Package/code semver** | package/manifest version | builders and installers |

Only the last is ordinary dependency semver. The first four can change the instant you deploy or rescan.

## 1. Protocol — negotiate behavior, not only a string

### Initialize-based revisions

Keep a supported set. Echo a requested revision you genuinely implement; otherwise return your newest legacy revision and let the client decide whether to continue.

Dropping an old revision is breaking. Check observed negotiations before removal.

### Stateless `2026-07-28`

This is a new behavior era: no initialize handshake/session id, per-request metadata, `server/discover` and strict HTTP header/body agreement. It belongs beside the legacy adapter until your client mix proves legacy can be retired.

Adding modern support is additive when:

- legacy `initialize` remains intact;
- both paths use one normalized dispatcher;
- modern-only validation is applied only after a request identifies itself as modern;
- policy/auth/audit semantics are identical.

Replacing legacy with modern in one deploy is breaking. Follow [`modern-protocol.md`](./modern-protocol.md).

### Revision history that affects implementations

| Revision | Load-bearing change |
|---|---|
| `2024-11-05` | original HTTP+SSE era; older annotation/auth model |
| `2025-03-26` | OAuth 2.1/Streamable HTTP/tool annotations; batching introduced |
| `2025-06-18` | batching removed; structured content/output schemas; protected-resource auth model |
| `2025-11-25` | icons, OIDC/CIMD direction, incremental authorization work |
| `2026-07-28` | stateless era: no initialize/session, per-request context and routing headers |

Protocol strictness is scoped to the negotiated era:

- reject arrays on revisions where batching is removed;
- do not demand modern headers from legacy clients;
- reject header/body mismatches on modern requests before dispatch;
- never advertise a revision whose required behavior you skipped.

## 2. Tool names are public API

A tool name is referenced by:

- model behavior learned from descriptors;
- host “always allow”/policy rules;
- skills/prompts and test fixtures;
- user instructions and automation logs;
- approvals and audit records.

Renaming is breaking. Deprecate instead:

1. keep the old name working;
2. mark it deprecated in the description and point to the replacement;
3. stop emitting it only after logs show a full usage cycle with no calls;
4. keep a server-side tombstone/error long enough to explain stale clients when feasible.

Never repoint an old name to different semantics. A silent semantic swap is worse than a hard error.

## 3. Input schemas

Usually additive:

- new optional field;
- widened enum;
- relaxed maximum;
- better descriptions/examples;
- a new optional branch that preserves old meaning.

Breaking:

- new required field;
- removed/renamed field;
- narrowed enum/type/range;
- changing default behavior;
- making an open object closed after callers already send extra keys;
- changing identity/tenant fields from server-derived to caller-supplied.

For a genuinely stronger authority or different operation, publish a new tool name rather than quietly tightening the old one.

## 4. Output schemas and result shapes

For current OpenAI compatibility, a structured-success tool declares an exact object `outputSchema` and returns schema-valid `structuredContent` plus functionally equivalent text.

Breaking changes include:

- removing/renaming/retyping a required key;
- turning an object envelope into a bare array/scalar/null;
- declaring a schema while a legitimate success branch returns no structured object;
- changing a cursor/id the next call depends on;
- changing text and structured representations to describe different state.

Design the first version with stable envelopes:

```text
get       → { found, item }
list      → { items, nextCursor, total|hasMore }
write     → { ok, id, changedFields? }
scalar    → { result }
```

Adding optional keys can be additive when the schema permits them. If the schema is closed, add the property to the schema and review downstream consumers before deploy.

Keep backward-compatible text for older hosts even when structured data is primary.

## 5. Descriptions are prompt API

Nothing typechecks a description change, yet it changes tool selection across every conversation. Review description diffs like code:

- what intent should now choose this tool;
- which sibling should no longer be chosen;
- what default or warning changed;
- whether the text remains under host limits;
- whether golden prompts still select correctly.

A typo fix is small. Replacing “create draft” with “create and publish” is a behavior change.

## 6. Scopes and annotations

Widening required authority (`mcp.read` → `mcp.write`) breaks existing narrower tokens at call time. Narrowing is normally safe, provided the tool truly needs less access.

Adding a new scope is additive only while no existing tool starts requiring it unexpectedly.

Annotation changes alter host UX and approval policy:

- `readOnlyHint: false → true` can remove confirmation;
- `destructiveHint: true → false` can hide irreversible impact;
- `idempotentHint` changes retry expectations;
- `openWorldHint` changes how the host interprets external effects.

Treat those as security changes. Prose justification never overrides the values served by the server.

OAuth changes also have rollout order:

1. add optional schema/control-plane fields;
2. deploy readers that understand old and new records;
3. deploy issuers writing `resource`, `issuer`, scopes/application type;
4. verify live flows;
5. enforce required audience/issuer on new grants;
6. audit/migrate or revoke old grants before enforcing globally.

## 7. Dynamic catalogs

A per-user catalog changes legitimately when accounts, devices, scopes or policy change. That does not make it unversioned.

Guarantee:

- stable sorting;
- deterministic descriptors for identical authorization context;
- private cache scope and bounded TTL;
- optional namespaced digest over the exact list;
- audit/log signal when the digest changes;
- no tool becomes callable merely because it existed in a previous conversation.

`listChanged: false` means the server does not push notifications; it does not authorize a host to cache forever.

## 8. Plugin scans freeze another contract

A hosted plugin scan can freeze:

- names, titles, descriptions;
- input/output schemas;
- security schemes and annotations;
- tool `_meta` and server instructions;
- linked UI resource metadata/CSP.

A live server that changes incompatibly before the reviewed snapshot updates can break installed users immediately. For reviewed/public plugins:

```text
compatible server fix/results/data → deploy
metadata/catalog change            → deploy draft → rescan → review/publish
origin change                       → often a new integration/plugin
```

Keep server-only behavior fixes backward compatible with the frozen descriptors. Never remove a published tool and hope review catches up later.

## 9. Package semver and manifest version

Use ordinary semver for installable code/packages, plus two rules:

- a file/wire contract consumed outside TypeScript is a major compatibility surface even if local types compile;
- OpenAI/Claude package wrappers may use separate schemas, but their release versions should intentionally correspond to the same underlying release when shipped together.

Vendored code carries provenance: source package version and checksum. Regenerate it; do not hand-edit a copy until nobody knows which source it came from.

## 10. Make every change visible

Minimum workflow:

1. snapshot the exact catalog from production code;
2. run descriptor/result/protocol/OAuth/package invariants;
3. inspect the diff, including descriptions/annotations;
4. run focused golden prompts for confusable tools;
5. deploy in compatibility order;
6. make one live call in every advertised era;
7. refresh/rescan the host metadata;
8. monitor old names/revisions/grants before retirement.

A snapshot that is automatically regenerated without review is not a contract test.

## Change classification checklist

Before merging, answer:

- Does any existing prompt/tool name point at different behavior?
- Can an existing token still call everything it could legitimately call?
- Does every prior valid input remain valid and mean the same thing?
- Does every result branch still satisfy its advertised schema?
- Can old and new gateway/control-plane versions coexist during rollout?
- Does a published plugin snapshot still match the live descriptor?
- Is this change visible in tests, release notes and a catalog diff?

## Primary sources

- MCP revisions: <https://modelcontextprotocol.io/specification/>
- Stateless migration: <https://modelcontextprotocol.io/seps/2575-stateless-mcp>
- OpenAI plugin versioning/review lifecycle: <https://developers.openai.com/plugins/deploy/submission>
- OpenAI descriptor/result contract: <https://developers.openai.com/plugins/reference>
