# Reference patterns behind the MCP Project Builder

This file records **provenance and reusable patterns**, not code to copy blindly. The target project's architecture remains authoritative.

## What was reviewed

| Reference | High-value pattern retained |
|---|---|
| Connectors Gateway | authentication before catalog construction; per-user dynamic catalogs; one shared policy/approval/audit/redaction pipeline; tool-name collision checks; OAuth discovery; plugin-package contract tests; modern + legacy MCP parity |
| CareerPack | `tools/list` contract snapshots; golden prompts; scope derived from authority annotations and rechecked per call; server-level instructions; opaque-id provenance in descriptions; tool failure vs protocol failure separation; exact MCP-origin discovery |
| MSO | tool names/schemas/scopes as compatibility contracts; list-time + call-time scope parity; bounded generic project-MCP discovery/call instead of global tool explosion; workflow isolation; trusted-skill provenance; live-runtime verification and rollback |
| Baton | deployment kill switch; maximum scope ceiling; RBAC recheck after token scope; stable toolset version/hash; hashed credentials; layered rate limits and immediate revocation |
| Content MCP builder | current-spec/SDK research before coding; TypeScript/Python implementation references; MCP Inspector proof; realistic multi-call evaluations in addition to unit tests |
| Resources / Create Your MCP | reusable installable slice; one-time raw credentials with digest-at-rest; PKCE S256; opaque invalid-grant collapse; redirect host/path hardening; setup UI as part of the product |
| Rahmanef MCP | deliberately narrow product boundary; same registry drives names/scopes/annotations; list-time + call-time + backend RBAC; separate write/destructive buckets; source/build plus live deployment parity |
| Paperclip MCP | cited vendor research before implementation; exact-revision approval; supervised remote/local runtime slots; health metrics; timeout/restart-storm suppression; audit-write failure treated as a control-plane incident |
| OpenAI/reference plugin archive | compact goal-specific skills; supporting `references/` and `assets/`; package identity separate from connection state; explicit interface metadata; skills teach workflows instead of repeating entire tool schemas |
| Current OpenAI plugin docs | portable Agent Plugin root manifest and MCP config are canonical for new packages; OpenAI-specific presentation/bindings live in the OpenAI extension; Codex compatibility manifest remains a fallback |
| Current MCP specification | modern requests are stateless/self-describing; header routing and `server/discover`; cacheable deterministic list results; stronger issuer validation; client metadata direction for new authorization work |

## Patterns to reproduce

### 1. Catalog after identity

The safe order is:

```text
authenticate
→ resolve user/tenant membership
→ build allowed catalog
→ validate tool + arguments
→ enforce call-time authority
→ policy / approval
→ execute existing domain handler
→ normalize result
→ redact
→ audit
```

Do not list a tool and hope the handler catches authorization later. Do not authenticate once at token creation and stop checking current membership.

### 2. One authority fact should drive multiple surfaces

A tool's real effect should be declared once and used to derive or validate:

- read/write scope;
- `readOnlyHint`;
- destructive and idempotent hints;
- approval tier;
- consent text;
- contract tests.

Independent hand-maintained copies drift.

### 3. The catalog is model-facing API

Snapshot or deterministically hash the descriptor set. A name, description, required field, annotation or output-schema change is externally observable even when TypeScript still compiles.

For large/dynamic catalogs, pin representative authorization contexts rather than one fake global catalog.

### 4. Test routing, not only handlers

Golden prompts catch failures conventional unit tests cannot:

- **direct:** explicit user wording maps to the intended tool;
- **indirect:** ordinary natural language still selects correctly;
- **follow-up:** ids/cursors from prior results are reused;
- **negative:** the assistant should not call any tool.

Every published tool should have a direct case. Confusable sibling tools need indirect/negative coverage.

### 5. Server instructions orient; tool descriptions route

Server instructions explain the product, identity boundary, global conventions and cross-domain workflow. Tool descriptions explain one operation, its prerequisites, effects and the source of required ids.

Do not put an entire product manual in every descriptor.

### 6. Refusals are part of the product contract

Different refusal classes need different behavior. Distinguish at least:

- authentication/reconnect required;
- insufficient scope;
- policy denied;
- human approval required;
- dependency/device unavailable;
- timeout/upstream transient failure;
- invalid input.

A skill should tell the model which ones may be retried and which require human action or a state change.

### 7. Dynamic ecosystems need generic seams

When a project can install arbitrary downstream MCPs, do not append every downstream tool to a stable global catalog. Use bounded discovery + exact call primitives or a dynamic per-user catalog with collision checks, pagination and revocation semantics.

### 8. Package identity is not connection identity

A plugin package can be versioned and reviewed while the registered app/connection is workspace-specific. Keep package metadata, registered connection ids and user credentials as separate concerns.

### 9. Production controls belong in the contract

For remotely reachable write tools, design operational controls alongside schemas:

- deployment kill switch;
- maximum scope ceiling;
- stable catalog version/hash;
- revocation that takes effect immediately;
- separate limits for ordinary reads, writes and destructive actions;
- runtime health for error/timeout/restart storms;
- durable audit health, with fail-closed behavior where the audit record is a required control.

### 10. Evaluate model usability, not only protocol correctness

Unit tests prove handlers; they do not prove an LLM can discover and compose the surface. Keep golden prompts and, for a substantial catalog, a small set of realistic, stable, independently solved evaluation tasks. Record the model/version and catalog digest when running behavioral evals.

### 11. Research external vendors at an exact revision

When the MCP fronts a third-party service, separate evidence gathering from implementation. Prefer official current docs/protocol sources and safe metadata probes. Record the source/commit/date for auth, endpoints, redirects, scopes, DCR/CIMD behavior and action risks. If the evidence changes, invalidate stale approval rather than silently extending it.

### 12. Evidence ladder

Use the cheapest layer that can disprove the current hypothesis, then climb:

```text
schema/helper
→ registry/authorization
→ handler integration
→ protocol/OAuth
→ package/skill
→ clean build
→ deployed MCP
→ real host rescan + call
```

A lower layer passing never proves a higher layer.

## Patterns not to copy

- host-specific business dispatchers;
- caller-supplied user/tenant identity;
- broad `manage` / `execute-anything` tools;
- OAuth scopes that are advertised but not enforced;
- secrets in `.mcp.json`, skills, logs or tool results;
- retries that bypass approval/policy refusals;
- one global tool per dynamically installed downstream tool;
- auto-regenerated contract snapshots without review;
- package manifests containing guessed registered-app ids;
- claims of live success from repository state alone.

## How to use this reference

When the target already has a safer/narrower pattern, keep it. Use these references to identify missing guarantees, not to force one framework or database on every project.
