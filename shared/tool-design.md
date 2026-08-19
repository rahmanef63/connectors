# Tool design — the part that decides whether this is any good

**Scope:** primitive choice, task-oriented names, granularity, descriptions, schemas, security metadata, dynamic catalogs, workflow lifecycle and approval-relevant annotations.
**Assumes:** you know which user outcomes your app should expose. Transport details are not required until [`transport.md`](./transport.md).

Auth is where you get hacked; **tool design is where you get ignored or misused**. A correct server with a bad surface picks the wrong operation, burns context and strands partial state.

## 0. Pick the right MCP primitive

| Primitive | Who decides to use it | Reach for it when |
|---|---|---|
| **Tool** | the model, mid-conversation | something happens, or arguments are composed from conversation |
| **Resource** | the host/user | readable content exists at a stable address |
| **Prompt** | the user explicitly | a repeatable workflow should be invoked deliberately |

The control distinction matters: model-controlled, application-controlled, user-controlled.

Rules:

- side effect → tool;
- stable addressable readable thing → resource;
- model computes arguments → tool, even if read-only;
- recognizable “workflow I run” → prompt or skill;
- tools remain the universal fallback when a host does not surface general resources/prompts.

Host support is uneven. ChatGPT's documented resource path primarily binds UI templates to tools; general readable MCP resources/prompts are better-supported in Claude/Cursor-style hosts. Design by semantics, then verify the target-host capability matrix in [`clients.md`](./clients.md).

## 1. Design for user outcomes, not REST endpoints

Do not mirror every route/table mutation.

```text
GOOD: create_post({ title, body, published })
BAD:  create_draft → set_title → set_body → publish
```

A composite one-shot is valuable when it prevents stranded partial state. It is harmful when it bundles unrelated permissions or makes annotations dishonest.

Split by blast radius and intent:

- focused read/list/search;
- idempotent setter;
- non-idempotent create/append/send;
- destructive archive/trash/revoke;
- hard delete or arbitrary execution usually absent.

## 2. Names are stable public API

Use narrow, verb-clear, host-safe names:

```text
posts_list
posts_get
posts_search
posts_create
posts_set_status
posts_trash
```

Avoid:

- overloaded `manage`, `execute`, `update_anything`;
- names distinguished only by subtle word order;
- connector prefixes that collide when dots/underscores are normalized;
- renaming after publication without a deprecation period.

When one gateway exposes multiple apps, include a stable namespace and test the final host-visible flattened names for collisions.

## 3. Descriptions are routing instructions

A description is prompt context, not an API reference paragraph.

Write:

1. **WHEN to use**;
2. **WHEN NOT to use** when a sibling is confusable;
3. defaults and required clarifications;
4. irreversible/public effects;
5. the identifier/result needed for the next call.

Example:

```text
Use this to create one unpublished blog draft after the user supplied a title and body.
Do not use it to publish an existing draft; use posts_publish.
Slug defaults from the title. Returns the new post id.
```

Name ambiguous siblings explicitly. Inline small enums and defaults. Do not hide a required business choice behind “reasonable defaults” the user never approved.

## 4. Model-efficient text plus structured data

Return one normalized object, render concise Markdown/text for the model, and provide schema-valid structured data for hosts/UI:

```ts
const payload = { items, nextCursor, total };
return {
  content: [{ type: "text", text: renderList(payload) }],
  structuredContent: payload,
};
```

Markdown is efficient for prose/lists; JSON objects preserve ids/counts/cursors. They are complementary, not competing formats. Full rules: [`results.md`](./results.md).

Never silently truncate. A list includes `total` or `hasMore`, and pagination input accepts the cursor the output returns.

## 5. Input schemas should make guessing hard

Use a closed object schema for public tool arguments:

```json
{
  "type": "object",
  "properties": {
    "postId": {
      "type": "string",
      "description": "Post id returned by posts_list, posts_search or posts_create."
    }
  },
  "required": ["postId"],
  "additionalProperties": false
}
```

Principles:

- server-derived identity/tenant fields never appear;
- every property has a model-facing description;
- enums match the backend whitelist exactly;
- limit/cursor names match handler names and result names;
- dangerous broad strings (`command`, arbitrary URL/path) are replaced with bounded enums/ids whenever possible;
- defaults are described and applied in one layer;
- no second hand-maintained validator disagrees with the descriptor.

## 6. Output schemas are exact object contracts

For current OpenAI compatibility, every tool that returns `structuredContent` declares an exact object `outputSchema`.

Standardize envelopes from day one:

```text
get    → { found, item }
list   → { items, nextCursor, total|hasMore }
write  → { ok, id, changedFields? }
scalar → { result }
```

This keeps empty/null/scalar branches compatible across legacy and stateless protocol eras. Validate real fixtures against the schema in CI.

## 7. Complete ChatGPT/OpenAI-facing descriptor

A production descriptor should carry both protocol-standard and compatibility metadata:

```ts
const descriptor = {
  name: "posts_create",
  title: "Create blog draft",
  description: "Use this to create one unpublished draft after title and body are known.",
  inputSchema,
  outputSchema,
  securitySchemes: [
    { type: "oauth2", scopes: ["mcp.write"] },
  ],
  annotations: {
    title: "Blog: Create draft",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  _meta: {
    securitySchemes: [
      { type: "oauth2", scopes: ["mcp.write"] },
    ],
    "openai/toolInvocation/invoking": "Creating draft…",
    "openai/toolInvocation/invoked": "Draft created",
  },
};
```

`securitySchemes` and `_meta.securitySchemes` mirror one another for clients reading the compatibility location.

Invocation strings describe status, not instructions or secrets. Keep them short.

## 8. Annotations carry real authority

Set all four from actual behavior:

- `readOnlyHint` — no externally visible mutation;
- `destructiveHint` — deletes, overwrites, revokes, irreversible sends/publishes or equivalent loss;
- `idempotentHint` — repeating identical arguments has the same intended final effect;
- `openWorldHint` — the tool interacts beyond a closed/private world (external services, public internet or other entities, according to the host contract).

Do not globally hardcode them because all tools happen to share an adapter. Evaluate the action.

Examples:

```text
list private records          readOnly=true,  destructive=false, idempotent=true
set title to exact value      readOnly=false, destructive=false, idempotent=true
append comment                readOnly=false, destructive=false, idempotent=false
send email / publish post     readOnly=false, destructive=true or explicitly irreversible, idempotent=false
trash record                  readOnly=false, destructive=true,  idempotent depends on implementation
```

Hosts use annotations for confirmation and review. Prose cannot override a false annotation.

## 9. Security scheme derives from the same authority fact

Avoid three independent declarations of “this is a write.” Derive defaults from action metadata:

```ts
const requiredScope = action.requiredScope ??
  (action.annotations.readOnlyHint ? "mcp.read" : "mcp.write");
```

Then use that same value in:

- OAuth consent/scopes;
- descriptor `securitySchemes`;
- per-call dispatcher enforcement;
- tests proving read grants cannot reach writes.

A write grant may imply read only if your public scope semantics say so.

## 10. Dynamic catalogs are authorization, not convenience

For each request, build the list from the authenticated caller's current state:

```text
installed app capabilities
∩ connected credentials/devices
∩ tenant membership
∩ policy/approval eligibility
∩ OAuth scopes
```

Then sort by name and emit deterministic descriptors. Do not list a tool and rely on the handler to reveal that the caller never had access; absence is the least-confusing authorization boundary.

For stateless/private catalogs:

- short private TTL;
- optional namespaced digest;
- no public CDN caching;
- catalog miss audited safely;
- a stale tool name never routes by fuzzy matching or derivation.

## 11. Search/schema tools for very large upstream catalogs

Do not expose thousands of guessed remote actions directly when a connector can search them.

Use a small meta-surface:

```text
capabilities_search({ query })
capabilities_schema({ names[] })
capabilities_execute({ name, arguments })
```

Rules:

- search never executes;
- schema returns exact names/arguments;
- execute refuses names not returned/allowed by the trusted catalog;
- destructive annotations and approval apply to execute;
- descriptions tell the model to search/schema first;
- never derive a near-match name and call it.

## 12. Explicit workflow lifecycle for multi-step operations

When tasks regularly need several calls, expose an explicit lifecycle instead of relying on hidden session memory:

```text
workflow_start({ intent, project?, constraints? }) → { workflowId, recommendedPlan }
operational_tool({ workflowId, ... })
workflow_finish({ workflowId, summary, success, verification })
workflow_cancel({ workflowId, reason })
```

Useful additions:

- trusted recipe/skill search at start;
- project/workspace resolution;
- high-level trace without private reasoning;
- verified fastest successful path stored after finish;
- redacted step metadata only—no credentials/raw file contents.

The handle makes the workflow compatible with stateless transport and parallel conversations. It must not widen tool authority: every operational call still passes ordinary auth, scope, policy and approval.

Do not expose arbitrary shell/browser power merely to imitate an internal operator. Publish bounded capabilities; omit full-host tools by construction unless that is the product and the threat model explicitly supports it.

## 13. Export operating instructions once; treat Skills-over-MCP as draft

Put the shortest universal rules in the server `instructions`: dynamic tool availability, search-before-execute, approval semantics, retryable error codes, and destructive-action confirmation. Keep them concise and front-loaded.

For richer workflows, keep one canonical `SKILL.md` source and expose it through progressively portable layers:

1. **Package layer** — bundle `skills/<name>/SKILL.md` in the OpenAI/Claude plugin when the host installs packages.
2. **Standard MCP resources** — expose a bounded `skill://index.json` plus `skill://<name>/SKILL.md` (and supporting files) through `resources/list` / `resources/read`.
3. **Draft Skills extension adapter** — only for tested hosts, advertise `capabilities.extensions["io.modelcontextprotocol/skills"]` and implement the draft list/get shape that host expects.
4. **Tool fallback** — for clients that expose neither packages nor general resources, a small read-only `skills_search` / `skills_read` surface can preserve discoverability.

SEP-2640 is still draft and its method/index shape has changed during review. Therefore:

- standard resources are the compatibility floor;
- `skills/list` / `skills/get` must not be the only path;
- pin the draft revision/shape in tests and behind an adapter;
- include a digest per concrete skill and reject content whose digest does not match;
- cap skill/index size and supporting-file traversal;
- serve only trusted, reviewed instructions by default;
- treat every remote skill as untrusted model input, never implicit permission to execute code;
- do not duplicate tool schemas inside the skill—reference stable tool names and workflow intent;
- generate packaged and MCP-served copies from the same source so they cannot drift.

A useful static skill can describe:

```text
when to use this server
→ which read/search tool comes first
→ which missing fields must be asked
→ how approval-required refusals work
→ how to verify a write
→ what never to retry or bypass
```

## 14. Catalog template

Read-only:

```text
<resource>_list({ cursor?, limit? }) → { items, nextCursor, total|hasMore }
<resource>_get({ id })               → { found, item }
<resource>_search({ query, limit? }) → { items, nextCursor?, total|hasMore }
```

Idempotent writes:

```text
<resource>_set_<field>({ id, value }) → { ok, id, changedFields }
```

Non-idempotent writes:

```text
<resource>_create({ ... })        → { ok, id }
<resource>_create_inline({ ... }) → { ok, id }
<resource>_append_<thing>({ ... })→ { ok, id }
```

Destructive:

```text
<resource>_trash({ id })
<resource>_revoke({ id })
```

Prefer recoverable soft-delete over hard delete. Keep hard delete/arbitrary execution off the surface unless users explicitly need it and the separate approval/audit threat model is complete.

## 15. Review checklist for one new tool

Before adding it:

- Is tool/resource/prompt the correct primitive?
- Is this one user outcome rather than one REST route?
- Can a sibling be confused with it?
- Does the description resolve that confusion?
- Are identity and permissions server-derived?
- Are all schemas closed, exact and fixture-tested?
- Do annotations match every side effect?
- Is authority derived consistently into scopes/security schemes?
- Is output bounded and useful for the next call?
- Would repeating it be safe?
- Should it require explicit approval or be absent entirely?
- Does adding the name collide after host normalization?
- Do direct, indirect, follow-up and negative prompts behave correctly?

## Primary sources

- OpenAI tool/reference metadata: <https://developers.openai.com/plugins/reference>
- MCP tools: <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>
- Draft Skills-over-MCP SEP-2640: <https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/sep-draft-skills-extension.md>
- Notion hosted MCP design: <https://www.notion.com/blog/notions-hosted-mcp-server-an-inside-look>
