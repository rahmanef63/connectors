# SSOT gap report — 2026-08-14

**Scope:** what exists today across `connectors` and the consumer, measured against the goal of making `connectors` the single source of truth for MCP/Plugin integration, and what must change to get there.

> **Anonymised.** This repo is a cookbook, so the application audited here is called only "the consumer". The findings are what transfer; its name is not.
**Assumes:** you are deciding whether and how to add a shared code layer. Nothing here has been implemented; this is the audit that precedes it.

## The premise is inverted

The task brief assumes `connectors` holds working connector code to preserve and refactor, and that the consumer is a downstream consumer. **It is the other way round.**

| | `connectors` | the consumer |
|---|---|---|
| Code | **none** — 25 `.md`, `LICENSE`, `.gitignore` | **5,891 lines** across 33 files under `convex/mcp/` |
| Published tool names | none | **68**, live |
| Auth | described | implemented: OAuth + RFC 9728 metadata + an env escape hatch |
| File subsystem | described | implemented: HMAC-signed, expiring, ownership-bound read URLs |
| Tests | none | `convex/mcp/jsonrpc.test.ts` |

So there is nothing in `connectors` to protect, and no consumer to break. The "existing code protection" section of the brief applies to **the consumer**, and extraction runs **the consumer → connectors**, not the reverse.

The consumer's HEAD commit is `feat(mcp): attach library images to a portfolio item as its thumbnail` — the exact capability the brief wants to enable. It is closer to the goal than the brief assumes, and blocked by something more specific.

## What the consumer already does well

Do not rebuild these. They are the extraction candidates.

- **A real tool contract.** `ToolDef` = `name` / `description` / `inputSchema` / `annotations` / `handler`, with the handler receiving `userId` from the token row and never from `args`. The dispatcher deletes any client-supplied `userId` before dispatch.
- **All four annotations on all 68 tools**, with a written rationale: read-only skips the confirmation prompt, destructive forces one, "a wrong hint is either nagging or data loss."
- **A documented authoring contract** in `tools/index.ts` — including the when-to-use / when-NOT-to-use rule the brief asks for, already in force.
- **One module per domain**, concatenated by an index that never needs editing to add a tool.
- **RFC 9728 protected-resource metadata** with `authorization_servers` and `scopes_supported`.
- **A file-read path that is safe by construction**: the token *is* the credential, HMAC-bound to one file id and one owner, one-hour expiry, re-checked against the row on redemption, and every failure answers an identical 404 so probing leaks nothing.

## Gaps, in priority order

### 1. The acceptance test is impossible today — and not for the reason the brief assumes

The brief's target: ChatGPT generates an image and puts it on a portfolio item without orchestrating storage internals.

The consumer's `portfolio_set_media` description says, verbatim:

> "upload with `files_upload_url` + `files_register` first, then pass those `file_ids` here."

That is the exact choreography the brief names as undesirable. But the deeper problem is that **it cannot be executed by a model at all**: `files_upload_url` mints a signed URL expecting an HTTP `PUT` of bytes, and a language model has no way to perform that upload. The middle step is not merely awkward — it is unreachable. Any host would stall between `files_upload_url` and `files_register`.

**No `openai/fileParams` appears anywhere in the consumer.** A repo-wide grep for `fileParams`, `download_url` and `file_id`-as-file-input returns only the consumer's *own* `file_id` (a Convex document id from `files_list`, a different thing entirely wearing the same name). That name collision will confuse a model and should be resolved deliberately, not by accident.

**This is the one gap that blocks the stated acceptance test.** Everything else below is quality.

### 2. Scopes are advertised but not enforced

`MCP_SCOPES = "mcp.read mcp.write"` is published in the discovery documents. The dispatcher checks only that `auth.userId` exists before calling any handler; no tool declares a required scope and nothing compares one. A token minted for reading can call `portfolio_delete`.

This is precisely the brief's warning — *"do not merely authenticate the MCP connection once and then trust every tool call"* — and it is the most serious finding in this report. Two coarse scopes also cannot express least privilege across 68 tools spanning CV, finances, contacts and calendar.

### 3. Naming: the brief contradicts itself, and its own rule resolves it

The brief asks for dot-notation (`portfolio.attach_media`) and *also* says: *"If the repository's current naming convention has already been published, do not rename tools casually."*

The consumer has **68 published `snake_case` domain-prefixed names**. Renaming them all to dot-notation would break every existing consumer for aesthetics. **Recommendation: keep `snake_case`.** It already satisfies the real requirement — domain-prefixed, action-oriented, narrow enough to allow-list individually. Any shared package must not hardcode a separator.

### 4. `_meta`, `structuredContent`, and output schemas are unused

The consumer returns handler values through a single text-content path. No tool declares an output schema, and `structuredContent` is not used. This is a real gap against the current spec, but it is a **compatibility-affecting change** to 68 published contracts and should be staged, not swept.

### 5. No contract snapshot, no golden prompts

`jsonrpc.test.ts` covers dispatch. Nothing pins the 68 tool names, descriptions, schemas or annotations, so a careless edit to a published contract passes CI silently. With 68 tools and a model choosing between them on description text alone, this is the highest-leverage test to add.

### 6. Protocol pin is two revisions behind

`MCP_PROTOCOL_VERSION = "2024-11-05"`. Current is `2025-11-25`. The pin is defensible — it is what hosts still negotiate, and the code says bumping it is not cosmetic — but a shared package must let the consumer choose rather than baking either value in.

## What the shared layer should own, and what it must not

Extraction targets, in dependency order:

1. **File ingestion** — the `OpenAIFile` schema builders, an SSRF-safe fetch policy, normalized bytes + metadata, and the `FileStoreAdapter` / `MediaAttachAdapter` seams. This is the only item that unblocks the acceptance test, and the consumer has no existing implementation to preserve, so it is also the lowest-risk thing to build first.
2. **Tool contract types + annotation validation** — the consumer's `ToolDef` is already close; lift it, do not redesign it.
3. **Contract snapshot + golden-prompt harness** — pure test infrastructure, zero runtime risk.
4. **Scope declaration and per-call enforcement** — needs a the consumer migration plan because it changes behaviour.
5. **OAuth resource-server helpers** — the consumer's is working; extract only once a second consumer exists to prove the shape.

Must **not** move into the shared layer: portfolio/CV/application/financial semantics, the consumer's storage rules, its `users` table identity, or anything that assumes Convex.

## The decision this report cannot make

`connectors` is today a **published, coherent, code-free guide**. Its own README says *"Documentation you read, not software you install. Nothing here runs."* Adding TypeScript packages contradicts that sentence and changes what the repo is.

Two defensible architectures:

- **A. One repo, two layers** — keep the guides, add `packages/` beside them. Spec and implementation stay adjacent and cannot drift. Cost: the repo stops being installation-free, needs a toolchain, and the "nothing here runs" promise is retired.
- **B. Guide stays, code ships separately** — `connectors` remains the doc SSOT; shared code lives in its own package the guides link to. Cost: two repos to keep in sync, and the drift the current repo was built to prevent.

This is a product decision about what `connectors` *is*, not a technical one, and it gates every line of code that follows. It should be made before anything is built, not discovered afterwards.

## Recommended first slice, once that is settled

Build **only** the file-ingestion primitive, with tests, and wire exactly one the consumer tool to it. That proves the seam end to end against the brief's own acceptance test, touches no published contract, and leaves the other 67 tools untouched. Everything else in the brief is real work that follows from a foundation that has been demonstrated rather than assumed.
