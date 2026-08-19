# @rahmanef/mcp-files

**Scope:** the shared OpenAI file-input contract for MCP tools — schema builders, SSRF-safe ingestion, and the two adapter seams a consumer implements.
**Assumes:** you have an MCP server and want one tool to accept an image or document. Protocol background is in [`../../shared/file-inputs.md`](../../shared/file-inputs.md).

This package owns **protocol** concerns only. It never learns what a portfolio, a CV or a workspace is. Consumers supply that through two small interfaces.

## New project quickstart

Three steps. Nothing app-specific is involved.

**1 — declare the tool.** One tool per user goal, not one per storage step.

```ts
import { openAIFileSchema, fileParamsMeta } from "@rahmanef/mcp-files";

const securitySchemes = [{ type: "oauth2", scopes: ["mcp.write"] }];

export const attachMedia = {
  name: "portfolio_attach_media",
  title: "Attach portfolio media",
  description:
    "Attach one image to an existing portfolio entry. Use after the entry id and desired usage are known. " +
    "Do NOT use to change text. Returns stable resource/media ids and the stored URL.",
  inputSchema: {
    type: "object",
    properties: {
      item_id: { type: "string", description: "Id from portfolio_list." },
      file: openAIFileSchema(),
      usage: {
        type: "string",
        enum: ["thumbnail", "gallery", "attachment"],
        description: "How the image should be used. Defaults to gallery.",
      },
    },
    required: ["item_id", "file"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      resourceId: { type: "string" },
      mediaId: { type: "string" },
      usage: { type: "string" },
      url: { type: "string" },
      previous: {
        anyOf: [
          {
            type: "object",
            properties: { mediaId: { type: "string" }, url: { type: "string" } },
            required: ["mediaId", "url"],
            additionalProperties: false,
          },
          { type: "null" },
        ],
      },
    },
    required: ["resourceId", "mediaId", "usage", "url"],
    additionalProperties: false,
  },
  securitySchemes,
  annotations: {
    title: "Portfolio: Attach media",
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: false, // see "Reversibility" below
    openWorldHint: true,    // a public page changes
  },
  _meta: {
    ...fileParamsMeta(["file"]),
    securitySchemes,
    "openai/toolInvocation/invoking": "Attaching media…",
    "openai/toolInvocation/invoked": "Media attached",
  },
};
```

**2 — implement the two adapters.** This is the only code that knows your product.

```ts
const store: FileStoreAdapter = {
  async save({ bytes, mimeType, fileName, sizeBytes }) {
    const id = await myStorage.put(bytes, mimeType);
    return { id, url: `/media/${id}`, mimeType, fileName, sizeBytes };
  },
};

const attach: MediaAttachAdapter = {
  async attach({ resourceId, media, usage }) {
    const previous = await myDb.currentThumbnail(resourceId); // keep it, do not delete
    await myDb.setThumbnail(resourceId, media.id);
    return { resourceId, mediaId: media.id, usage, url: media.url, previous };
  },
};
```

**3 — compose.**

```ts
handler: async (ctx, userId, args) => {
  await requireScope(userId, "portfolio:write");     // yours, before anything else
  return receiveFileIntoMedia({
    file: args.file,
    resourceId: args.item_id,
    usage: args.usage ?? "gallery",
    store, attach,
    ingest: { policy: imagePolicy },
  });
}
```

The model calls one tool. It never sees an upload URL, a blob registration, or a storage id.

## What ingestion guarantees

`ingestOpenAIFile` returns bytes only after all of this holds:

| Check | Behaviour |
|---|---|
| Scheme | `https:` only |
| Address | loopback, RFC1918, link-local, CGNAT, `.internal`/`.local`, IPv6 ULA and the cloud metadata IP all refused |
| Credentials in URL | refused |
| Port | 443, plus anything the policy names |
| Redirects | followed **manually**, every hop re-validated, capped |
| Size | `content-length` for an early exit, then the **real** byte count, aborting mid-stream |
| Type | sniffed from **magic bytes**; a body that contradicts its own `content-type` is refused |
| File name | re-derived server-side; the caller's is advisory |
| Timeout | whole-request budget via `AbortController` |

`NormalizedIncomingFile` deliberately has **no `download_url`**. It is short-lived and host-owned, so persisting it yields dead links and a needless secret at rest.

**Known limit, stated rather than implied:** these are hostname checks. No DNS resolution happens, so a public name that resolves to a private address still passes, and a name validated now may resolve differently at connect time. Closing that needs an egress allowlist or a resolving agent at the network layer.

## Reversibility, and why it decides `destructiveHint`

`AttachedMedia.previous` exists so an adapter can report what it displaced.

- Adapter **keeps** the prior asset and returns `previous` → a reversible pointer change → `destructiveHint: false`.
- Adapter **discards** the prior asset → `destructiveHint: true`.

That is a property of your adapter, not of this package, which is why the field is part of the interface rather than a flag here. Prefer designing the reversible version.

## Errors

Everything throws `ConnectorError`. `toPublic()` is the only shape that may cross the wire — it carries `code`, `message`, `recoverable`, optional `fields`, and `correlation_id`, and it **drops** the `internal` property where the original throwable is kept for logs.

Codes: `invalid_input`, `unauthorized`, `insufficient_scope`, `not_found`, `conflict`, `payload_too_large`, `unsupported_media_type`, `url_rejected`, `upstream_unavailable`, `timeout`, `rate_limited`, `internal`.

## Contract testing

Call `assertFileParamsConformant(tool)` on every tool in your registry. It catches the four failures that are silent locally and fatal at Scan Tools: a missing property, an over-required optional, a field named in `_meta` that is not in `properties`, and any `$`-prefixed key — valid JSON Schema, but fatal to `tools/list` on any server whose RPC is a **Convex action** (see [`../../shared/convex.md`](../../shared/convex.md) §11). An `httpAction` that stringifies into a `Response` is not exposed; the check stays on regardless, because the same schema gets vendored into both and inlining costs nothing.

```ts
it("every tool's file params are conformant", () => {
  for (const t of TOOLS) expect(() => assertFileParamsConformant(t)).not.toThrow();
});
```

## Consuming it without npm

A Convex deployment bundles only its own `convex/` directory and cannot install
from a registry. `npm run bundle:single` emits `dist/single.ts` — the whole
package as one dependency-free module with a provenance header and a checksum.
Vendor that file, and re-run the script to pick up fixes.

```
/* GENERATED — do not edit here.
 * @rahmanef/mcp-files@0.1.0, bundled to a single module.
 * checksum: e804b6ab73d7 */
```

A Convex consumer vendors it at `convex/mcp/_vendor/mcpFiles.ts` today.
Replace that copy with the npm dependency once the package is published.

## Scripts

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run  — 46 tests
npm run build          # emits dist/ with .d.ts
npm run bundle:single  # emits dist/single.ts for vendoring
```

Zero runtime dependencies. `fetch` is injectable via `ingest.fetchImpl` for tests and for runtimes without a global.
