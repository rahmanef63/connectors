# shared — cross-cutting files

**Scope:** the router for this folder — which of the fourteen files to open, and when.
**Assumes:** you already picked a folder ([`../cn-mcp-core/`](../cn-mcp-core/README.md), [`../cn-claude-plugin/`](../cn-claude-plugin/README.md), [`../cn-gpt-plugin/`](../cn-gpt-plugin/README.md), [`../cn-gpts/`](../cn-gpts/README.md)). Nothing here is an entry point on its own.

Pull these one at a time, on demand. Reading the folder end to end costs context you want for the target build.

## Open when

| File | Open when |
|---|---|
| [`tool-design.md`](./tool-design.md) | designing the public capability surface — primitive choice, names, schemas, annotations, security schemes, dynamic catalogs and workflow lifecycle |
| [`clients.md`](./clients.md) | comparing what each host requires before committing |
| [`transport.md`](./transport.md) | implementing the HTTP/JSON-RPC edge, status codes, OAuth discovery and deciding legacy vs modern behavior |
| [`modern-protocol.md`](./modern-protocol.md) | adding stateless MCP `2026-07-28` beside initialize-based clients without forking the application core |
| [`oauth.md`](./oauth.md) | implementing OAuth 2.1 + PKCE, CIMD/DCR, resource audience and issuer binding |
| [`convex.md`](./convex.md) | your backend is Convex — read before writing code |
| [`setup-form.md`](./setup-form.md) | building the screen where a user connects the server — exact values per host and a dependency-free `CopyField` |
| [`file-inputs.md`](./file-inputs.md) | a tool accepts/returns a file or image — file-param contract, SSRF/size guards and storage seams |
| [`icons.md`](./icons.md) | producing icons/logos — OpenAI listing assets, optional MCP icons and Claude's absent field |
| [`results.md`](./results.md) | designing exact `outputSchema`, object `structuredContent`, equivalent text, errors and rich-result bounds |
| [`testing.md`](./testing.md) | pinning descriptor/result/protocol/OAuth/package contracts and golden prompts |
| [`versioning.md`](./versioning.md) | changing a live tool, grant, protocol or reviewed plugin snapshot safely |
| [`pitfalls.md`](./pitfalls.md) | something is broken (20 real failures, symptom → cause → fix) |
| [`security-checklist.md`](./security-checklist.md) | release gate before exposing the endpoint or shipping a plugin package |

## Three of these produce artifacts

- [`setup-form.md`](./setup-form.md) ends in a rendered setup card.
- [`icons.md`](./icons.md) ends in listing/brand assets.
- [`testing.md`](./testing.md) ends in executable contract gates; this repo's implementation is `scripts/check-docs.mjs` plus `.github/workflows/docs.yml`.

Everything else changes code or policy you were already building in the target project.

## Order that usually works

Building:

```text
tool-design
→ transport
→ modern-protocol (only when dual-stack/stateless support is in scope)
→ results
→ convex (Convex only)
→ oauth (consumer hosts)
→ file-inputs (only when needed)
```

Before trust: `testing.md` → `security-checklist.md`.

Shipping: `setup-form.md` → `icons.md` when listing/branding requires them → the relevant vendor registration/package guide.

Changing something live: `versioning.md` before editing the catalog, scopes, protocol or reviewed plugin metadata.

Broken: `pitfalls.md` first.
