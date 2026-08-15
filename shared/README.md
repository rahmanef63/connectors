# shared — cross-cutting files

**Scope:** the router for this folder — which of the thirteen files to open, and when.
**Assumes:** you already picked a folder ([`../cn-mcp-core/`](../cn-mcp-core/README.md), [`../cn-claude-plugin/`](../cn-claude-plugin/README.md), [`../cn-gpt-plugin/`](../cn-gpt-plugin/README.md), [`../cn-gpts/`](../cn-gpts/README.md)). Nothing here is an entry point on its own.

Pull these one at a time, on demand. Reading the folder end to end costs tokens you want for the build.

## Open when

| File | Open when |
|---|---|
| [`tool-design.md`](./tool-design.md) | designing the tool surface — highest leverage, most skipped. Start here, including the tool / resource / prompt choice |
| [`clients.md`](./clients.md) | comparing what each host requires before you commit |
| [`transport.md`](./transport.md) | JSON-RPC shape, SSE, status codes, discovery documents |
| [`oauth.md`](./oauth.md) | implementing OAuth 2.1 + PKCE S256 |
| [`convex.md`](./convex.md) | your backend is Convex — read before writing code |
| [`setup-form.md`](./setup-form.md) | building the screen where a user connects the server — the exact string per host, the card spec, a dependency-free `CopyField` |
| [`file-inputs.md`](./file-inputs.md) | a tool must accept an image or file, or return one — ChatGPT's file-param contract, the SSRF and size guards, where the bytes live |
| [`icons.md`](./icons.md) | producing icons and logos — two square images are **required** for an OpenAI directory submission, optional in MCP, and Claude has no field at all |
| [`results.md`](./results.md) | deciding what a tool hands back — `structuredContent`, why an `outputSchema` is usually a downgrade, the `isError` rule |
| [`testing.md`](./testing.md) | nothing throws when a catalog drifts — the snapshot, the host-facing invariants, golden prompts |
| [`versioning.md`](./versioning.md) | changing a surface that is already live — which edits are additive, which strand a client, how to retire a tool |
| [`pitfalls.md`](./pitfalls.md) | something is broken (16 real ones, symptom → cause → fix) |
| [`security-checklist.md`](./security-checklist.md) | about to expose the endpoint to anyone |

## Two of these are outputs, not just reading

[`setup-form.md`](./setup-form.md) and [`icons.md`](./icons.md) each end in artifacts you ship: a rendered setup card with one copy target per host, and four square files plus an optional screenshot set and a `brandColor`. Everything else is knowledge you apply to code you were already writing.

## Order that usually works

Building → `tool-design.md`, `transport.md`, `results.md`, `convex.md` *(Convex only)*, `oauth.md` *(Phase 2)*, `file-inputs.md` *(only if a tool takes a file)*.
Before you trust it → `testing.md`.
Shipping → `setup-form.md`, `icons.md` *(directory submission)*, then `security-checklist.md` as the gate.
Changing something already live → `versioning.md` before you touch the catalog.
Broken → `pitfalls.md` first, always.
