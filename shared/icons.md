# Icons and logos

**Scope:** every image a connector needs — MCP's `Icon` schema, OpenAI's two required square images, Claude's total absence of any icon field — and the one asset set that satisfies all three at once.
**Assumes:** the server works ([`transport.md`](./transport.md)) and you are preparing it for registration. Field-by-field intake of these values lives in [`setup-form.md`](./setup-form.md).

## Decide first

| Ecosystem | Declared in | Required? | Format | Dimensions |
|---|---|---|---|---|
| MCP (any client) | `icons?: Icon[]` on `serverInfo`, and per `Tool` / `Resource` / `Prompt` | optional | PNG + JPEG MUST be renderable by clients; SVG + WebP SHOULD | free — `sizes` declares them as `WxH` or `any` |
| OpenAI directory | `interface.logo` and `interface.composerIcon` in `.codex-plugin/plugin.json` | **both required — submission is rejected without them** | `.png` `.jpg` `.jpeg` `.webp` `.svg` | square, ≥48×48, ≤4096×4096, ≤5 MiB |
| OpenAI skill agent | `interface.icon_small` / `icon_large` in `skills/<skill>/agents/openai.yaml` (snake_case) | optional | same | same |
| OpenAI screenshots | `interface.screenshots` | only if your server ships custom UI | PNG or JPEG | exactly 706 px wide, 400–860 tall, one per starter prompt |
| Claude — plugin, marketplace entry, custom connector | — | **no field exists** | — | — |

## MCP native

`Icon` is a first-class schema type ([2025-11-25 schema](https://modelcontextprotocol.io/specification/2025-11-25/schema)), verbatim:

```ts
interface Icon {
  src: string;
  mimeType?: string;
  sizes?: string[];
  theme?: "light" | "dark";
}
```

Six types carry `icons?: Icon[]`, always as the first member: `ResourceLink`, `Implementation`, `Prompt`, `Resource`, `ResourceTemplate`, `Tool`. `Implementation` is the type behind **both** `serverInfo` and `clientInfo`, so branding the connector card and branding individual rows in a tool picker use the same field.

- **`src`** — "A standard URI pointing to an icon resource. May be an HTTP/HTTPS URL or a `data:` URI with Base64-encoded image data."
- **`sizes` / `theme`** — `sizes` holds `WxH` strings (`48x48`, `96x96`) or `any` for scalable formats; `theme` is `light` for an icon designed for a **light background**, `dark` for a dark one. Omit either and the client assumes any size / any theme.
- **MIME tiers** — clients that render icons **MUST** support `image/png` and `image/jpeg` (and `image/jpg`); they **SHOULD** also support `image/svg+xml` and `image/webp`.

Two security notes in the spec, both load-bearing:

> Consumers SHOULD takes steps to ensure URLs serving icons are from the same domain as the client/server or a trusted domain.

> Consumers SHOULD take appropriate precautions when consuming SVGs as they can contain executable JavaScript.

(The `takes` typo is in the source.) Read them as two rules: **serve icons from the MCP endpoint's own origin**, and **never let SVG be the only entry**, because a hardened client is entitled to skip it and show a blank tile.

The origin rule bites hard when the server and the app are different hosts. In the worked example the MCP endpoint is on the Convex *site* origin — `convex/mcp/routes.ts:1-3`, *"POST /mcp on the Convex SITE origin (CONVEX_SITE_URL — the `*.convex.site` host, NOT the `*.convex.cloud` one)"* — at `https://MCP_ORIGIN`, while the brand assets are served by the Next app at `https://APP_ORIGIN`. Pointing `src` at the app domain is a cross-domain icon. Two fixes: mount a `GET /assets/icon-512.png` route on the same `httpRouter` as `POST /mcp`, or inline a `data:` URI — which that repo already demonstrates in `app/apple-icon.tsx:20`, `` `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString("base64")}` ``. A 32×32 single-path mark base64s to well under a kilobyte.

## OpenAI directory

Branding lives under `interface` in `.codex-plugin/plugin.json` — **not** `.claude-plugin/`. `logo` and `composerIcon` are both required and both must be square; a missing one fails the validator as `plugin_logo_path_missing` / `plugin_composer_icon_path_missing` before a human ever looks. Every path must start with `./` (`branding_asset_path_missing_root_prefix`), must be relative, must resolve inside the package, and must exist.

The full raster gate: readable (`image_file_unreadable`), ≤5 MiB (`image_file_too_large`), extension in `.png` `.jpg` `.jpeg` `.webp` `.svg` (`image_file_format_unsupported`), decodable (`raster_image_decode_failed`), extension matching the real bytes (`raster_image_extension_content_mismatch`), square (`raster_image_not_square`), ≥48×48 (`raster_image_dimensions_too_small`), ≤4096×4096 (`raster_image_dimensions_too_large`).

SVG gets its own gate: valid UTF-8 XML (`svg_xml_malformed`), `<svg>` root (`svg_root_element_invalid`), a numeric `viewBox` **or** numeric `width`+`height` (`svg_dimensions_missing`), no units or percentages (`svg_dimensions_not_numeric`), positive and finite (`svg_dimensions_not_positive`), square (`svg_dimensions_not_square`), ≥48×48 (`svg_dimensions_too_small`). `width="100%"` fails. Pointing the manifest at a PNG removes that entire validator surface.

Also: `interface.brandColor` must be six-digit hex (`#10A37F` shape), and the logo is asked for **twice** — packaged in the manifest, and uploaded again in the portal Info tab under listing details. Full submission flow is [`../cn-gpt-plugin/publish.md`](../cn-gpt-plugin/publish.md).

Three gaps in the published rules. Re-checked against `submission-errors` on 2026-08-15; two are now closed.

**Screenshots are pinned, not open** — *"Each screenshot must be exactly 706 pixels wide and 400–860 pixels tall"*, at most three (one per starter prompt, when custom UI is present). The width is exact, so a 1412-wide retina export is rejected rather than downscaled.

**The 5 MiB cap is general, not branding-only** — *"Image must not exceed 5 MiB"* sits with the dimension rules that govern every submitted image, alongside the format rule: *"Image filename must end in .png, .jpg, .jpeg, .webp, or .svg."*

`TODO: verify` — the one still open: OpenAI gives **no recommended dimension**, only the 48×48 floor and the 4096×4096 ceiling, so the 512/1024 sizes below remain engineering judgement; and it never states whether one file may serve as both `logo` and `composerIcon`. Both are required and each is validated independently, so pointing them at the same square PNG should pass every published rule — untested, and cheap to test by submitting.

## Claude

**There is no icon field anywhere in Claude's surface.** `.claude-plugin/plugin.json` has zero image support — the complete metadata set is `$schema`, `name`, `displayName`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, `metadata`, `defaultEnabled`, plus component-path fields. A `marketplace.json` entry adds `category`, `tags`, `strict`, `relevance` — still no image. See [`../cn-claude-plugin/manifest.md`](../cn-claude-plugin/manifest.md).

In practice: you cannot supply branding to Claude from your side. Claude Code ignores unrecognized top-level `plugin.json` fields, so a manifest *can* legally carry OpenAI-shaped keys — but `claude plugin validate --strict` turns those warnings into errors, so a single shared manifest breaks strict CI. Keep the OpenAI assets in `.codex-plugin/plugin.json`. On the connector side the add flow collects only the remote MCP server URL plus optional OAuth Client ID and Secret — no upload, no branding field. Branding is resolved **by domain**:

> If your custom connector's URL is on a domain that matches a listing in the Connectors Directory (for example, a Workato workspace URL), it appears with that service's name and branding instead of a "Custom" label.

This is the one case where your icon is decided for you. A self-hosted server on an unlisted domain renders as generic **"Custom"** and nothing in the flow changes that; a server hosted on a PaaS workspace URL that *is* listed will silently wear that vendor's name and logo. The docs frame this as expected, not a bug. There **is** a submission path, found 2026-08-15 — it is just not linked from the connector help article. Remote servers go through the [Connectors Directory submission portal](https://claude.ai/admin-settings/directory/submissions/new) inside Claude.ai admin settings, which needs a **Team or Enterprise organization** and directory-management access (Owners by default; on Enterprise an Owner can delegate via a custom role carrying the **Directory** or **Libraries** permission — Team has no custom roles, so it stays with Owners). Requirements are security review, OAuth 2.0 for authenticated services, clear docs, and **tool annotations on every tool** — *"All tools must include a `title` and the applicable `readOnlyHint` or `destructiveHint`."* Status and reviewer feedback appear in the submissions dashboard; `mcp-review@anthropic.com` is the escalation. Full flow: [Submitting to the Connectors Directory](https://claude.com/docs/connectors/building/submission).

Which means the branding above is not permanent: a listed connector carries **your** name and icon. Being shown as "Custom", or wearing your PaaS vendor's logo, is what an *unlisted* domain looks like.

## Produce four files, once

Author one square master (1024×1024 artboard, ~8% safe margin), then export. The fifth row is screenshots, which most servers omit:

| File | Spec | Satisfies |
|---|---|---|
| `assets/icon-512.png` | 512×512, transparent, mark drawn for a **light** background | MCP `icons[0]` (`theme: "light"`); OpenAI `composerIcon` |
| `assets/icon-512-dark.png` | 512×512, transparent, same mark inverted for a **dark** background | MCP `icons[1]` (`theme: "dark"`) — no OpenAI or Claude consumer |
| `assets/logo-1024.png` | 1024×1024, **opaque** brand ground | OpenAI `logo` + the portal Info-tab upload |
| `assets/icon.svg` | square numeric `viewBox`, numeric `width`/`height`, no `<script>`, no `on*`, no external `href`, no `<foreignObject>` | MCP `icons[2]` — an *extra*, never the only entry |
| `assets/screenshot-N.png` | exactly 706 px wide, 400–860 tall, one per starter prompt | OpenAI `screenshots` — **omit entirely** unless your server ships custom UI |

Plus one non-file value: a six-digit hex `brandColor`.

### A starter mark you can ship today

Square, numeric `viewBox`, numeric `width`/`height`, no `<script>`, no `on*` handler, no external `href`, no `<foreignObject>` — it satisfies every constraint in the table above. Swap the two colours for your own and it is done. Save as `assets/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="connector"><rect width="512" height="512" rx="112" fill="#0B0B0C"/><path d="M196 196 316 316" fill="none" stroke="#FAFAFA" stroke-width="36" stroke-linecap="round"/><circle cx="168" cy="168" r="54" fill="#FAFAFA"/><circle cx="344" cy="344" r="54" fill="#FAFAFA"/></svg>
```

For the dark variant swap `#0B0B0C` and `#FAFAFA`. Rasterise the same file to `icon-512.png` and, on an opaque ground, `logo-1024.png` — one master, four exports.

**The `data:` escape hatch.** When you cannot serve a file from the MCP origin — the cross-domain rule below — inline it instead. That SVG is 380 bytes, so its base64 is 508 characters:

```json
{ "src": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MTIiIGhlaWdodD0iNTEyIiB2aWV3Qm94PSIwIDAgNTEyIDUxMiIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJjb25uZWN0b3IiPjxyZWN0IHdpZHRoPSI1MTIiIGhlaWdodD0iNTEyIiByeD0iMTEyIiBmaWxsPSIjMEIwQjBDIi8+PHBhdGggZD0iTTE5NiAxOTYgMzE2IDMxNiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjRkFGQUZBIiBzdHJva2Utd2lkdGg9IjM2IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48Y2lyY2xlIGN4PSIxNjgiIGN5PSIxNjgiIHI9IjU0IiBmaWxsPSIjRkFGQUZBIi8+PGNpcmNsZSBjeD0iMzQ0IiBjeT0iMzQ0IiByPSI1NCIgZmlsbD0iI0ZBRkFGQSIvPjwvc3ZnPg==", "mimeType": "image/svg+xml", "sizes": ["any"] }
```

Regenerate with `base64 -w0 assets/icon.svg`. A `data:` URI sidesteps the same-domain guidance entirely, since nothing is fetched — but it is inert only because this SVG carries no script. Never inline an SVG you did not author.

Serve items 1, 2 and 4 from the MCP endpoint's origin. Declare them strongest-guarantee first, PNG before SVG:

```json
"serverInfo": {
  "name": "your-server",
  "title": "Your Server",
  "version": "1.0.0",
  "websiteUrl": "https://your-app.example.com",
  "icons": [
    { "src": "https://MCP_ORIGIN/assets/icon-512.png",      "mimeType": "image/png",     "sizes": ["512x512"], "theme": "light" },
    { "src": "https://MCP_ORIGIN/assets/icon-512-dark.png", "mimeType": "image/png",     "sizes": ["512x512"], "theme": "dark"  },
    { "src": "https://MCP_ORIGIN/assets/icon.svg",          "mimeType": "image/svg+xml", "sizes": ["any"] }
  ]
}
```

`MCP_ORIGIN` is the host serving `POST /mcp`, not your marketing site. `.codex-plugin/plugin.json` then gets `"composerIcon": "./assets/icon-512.png"`, `"logo": "./assets/logo-1024.png"`, `"brandColor": "#RRGGBB"`. `.claude-plugin/plugin.json` gets nothing. `TODO: verify` — whether any shipping host actually **renders** `serverInfo.icons` today. No fetched doc says claude.ai, ChatGPT, Cursor or Cline consumes the field, and OpenAI's MCP pages never mention icons at all.

One deduction narrows it hard, though it is not a substitute for testing: `Icon` first exists in the **2025-11-25** schema. A connection that negotiates `2024-11-05` or `2025-06-18` has no place for the field in its protocol type. Treat `serverInfo.icons` as inert on those revisions, and unverified on newer ones until the host documents rendering. Ship the manifest assets regardless — those are enforced at submission.

## How it fails

| Symptom | Cause |
|---|---|
| Submission rejected, `plugin_logo_path_missing` | `interface.logo` absent, or points at a non-square image |
| Rejected, `branding_asset_path_missing_root_prefix` | wrote `assets/icon.png` instead of `./assets/icon.png`. Two different validator families: the branding one requires `./`, while the skill-agent *error text* suggests a bare `assets/icon.png` even though its own YAML example writes `./`. Ship `./` and both pass |
| Rejected, `raster_image_extension_content_mismatch` | a file named `.png` that is really a JPEG; re-export, don't rename |
| Rejected, `svg_dimensions_not_numeric` | `width="100%"` or `width="32px"` — numbers with no units |
| Rejected, `screenshots_not_allowed` | screenshots supplied for a server with no UI output template |
| Portal shows placeholder branding after a Claude-plugin conversion | uploading a Claude archive as "Skills only" makes the portal generate `.codex-plugin/plugin.json` and "adds missing interface defaults" — replace them before submitting |
| Icon blank in one client, fine in another | SVG was the only entry; a client is within spec to refuse it |
| Dark-mode icon invisible | one SVG with an internal `prefers-color-scheme` instead of two exports — an out-of-DOM rasteriser ignores the media query |
| Connector shows someone else's logo on claude.ai | your URL's domain matches a Connectors Directory listing; branding follows the domain, not the connector |
| Icons declared but the client ignores them | `Icon` is documented in the **2025-11-25** schema. The worked example pins `MCP_PROTOCOL_VERSION = "2024-11-05"` (`convex/mcp/types.ts:8`) with the comment *"Do not bump it casually"* — bump the pin first, then advertise. It is **not** legal earlier: the `2025-06-18` schema has no `Icon` type at all, and `Implementation` there is only `BaseMetadata` + `version` (schema source, read 2026-08-15). So a host that negotiates `2024-11-05` or `2025-06-18` has nowhere to put your icons — advertising them cannot work until both sides are on `2025-11-25`. |
