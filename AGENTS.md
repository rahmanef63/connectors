# AGENTS.md

**Scope:** the entry point for an agent reading this repo cold — full file map, reading order per goal, and the invariants your output must not break.
**Assumes:** you were pointed here to write or debug an AI integration in *another* codebase. Every file here is read-only input; nothing in this repo is installed, imported or executed.

## Goal

Produce one remote MCP server in the target codebase, plus whatever registration the user's chosen host needs. One server, several ways to register and ship it. Vendor folders describe registration and distribution only — they never change server logic.

## Load only what applies

Every Markdown file here is guidance; there are no dated reports to skip. Reading all of them still costs tokens you want for the build. Open the folder that matches the goal, then pull single `shared/` files on demand ([`shared/README.md`](./shared/README.md) is that folder's own table). The per-goal orders below are the intended budget.

## File map

| Path | Purpose |
|---|---|
| `README.md` | human router: thesis, folder decision table, dependency line, license |
| `AGENTS.md` | this file — agent router |
| `LICENSE` | MIT, 2026 rahmanef63 |
| `packages/mcp-files/` | **code** — the shared OpenAI file-input contract: schema builders, SSRF-safe ingestion, store/attach adapter seams. `README.md` there is the quickstart |
| `cn-mcp-core/README.md` | the design invariant, the phase decision tree, framework/DB adaptation notes, spec links |
| `cn-mcp-core/phase-1-bearer.md` | the endpoint: JSON-RPC dispatch, bearer auth, tool registry |
| `cn-mcp-core/phase-2-oauth.md` | the authorization half: consent page, auth codes, token exchange, discovery documents |
| `cn-mcp-core/phase-3-admin-ui.md` | where a human mints, inspects and revokes their own tokens |
| `shared/README.md` | router for `shared/` — the "open when" table for all thirteen files |
| `shared/tool-design.md` | tool vs resource vs prompt, naming, granularity, annotations — decides whether the server is any good |
| `shared/results.md` | what `tools/call` hands back: `structuredContent`, the `outputSchema` one-way door, `isError` |
| `shared/testing.md` | catalog snapshot, host-facing invariants, golden prompts — the failures that never throw |
| `shared/clients.md` | per-host matrix: transport accepted, registration path, whether a bridge is needed |
| `shared/oauth.md` | OAuth 2.1 + PKCE S256 in implementable detail |
| `shared/transport.md` | `POST /mcp` JSON-RPC shape, SSE, status codes, discovery documents |
| `shared/convex.md` | Convex-only gotchas, starting with the SITE vs CLOUD origin split |
| `shared/setup-form.md` | the copy-paste-ready setup form — the exact string each host wants, the card spec, a dependency-free `CopyField` |
| `shared/file-inputs.md` | files and images both directions — ChatGPT's file-param contract, the SSRF and size guards, where the bytes live, `ImageContent` on the way out |
| `shared/icons.md` | every image a connector needs — MCP's `Icon` schema, OpenAI's two required squares, Claude's absent field, one asset set for all three |
| `shared/pitfalls.md` | 16 real failures, symptom → root cause → fix |
| `shared/security-checklist.md` | pass/fail gate before the endpoint is reachable by anyone |
| `cn-claude-plugin/README.md` | connector vs plugin, the surface picker, the claude.ai connector path |
| `cn-claude-plugin/manifest.md` | `plugin.json` fields, component directories, `${CLAUDE_PLUGIN_ROOT}`, local testing |
| `cn-claude-plugin/marketplace.md` | `marketplace.json`, `/plugin install`, what catalog submission actually is |
| `cn-gpt-plugin/README.md` | the auth-mode gate (no API-key field in ChatGPT) and the Apps SDK → Plugins rename |
| `cn-gpt-plugin/register.md` | Path A — developer mode, your own or your workspace's ChatGPT, no review |
| `cn-gpt-plugin/publish.md` | Path B — public Plugins Directory submission, verification and tool scan |
| `cn-gpts/README.md` | Actions vs MCP decision, plus the eight GPT Builder Configure fields |
| `cn-gpts/openapi-actions.md` | the OpenAPI 3.1 document, auth panel, privacy-policy gate, when to abandon this for MCP |

## Reading order by goal

| Goal | Order |
|---|---|
| **Build the server** | `cn-mcp-core/README.md` → `cn-mcp-core/phase-1-bearer.md` → `shared/tool-design.md` → `shared/transport.md` → `shared/convex.md` *(Convex only)* → `cn-mcp-core/phase-2-oauth.md` + `shared/oauth.md` *(any consumer host)* → `cn-mcp-core/phase-3-admin-ui.md` *(per-user tokens)* → `shared/results.md` *(before you settle the result shape)* → `shared/testing.md` → `shared/security-checklist.md` |
| **Accept an image or file** | `shared/file-inputs.md` — the whole contract, both directions → `shared/convex.md` *(Convex: `$`-keys are fatal here)* → `shared/security-checklist.md` |
| **Ship the setup UI** | `shared/setup-form.md` — the spec, read it first → `cn-mcp-core/phase-3-admin-ui.md` *(what the card sits inside)* → `shared/clients.md` *(per-host detail behind a tab)* → `shared/icons.md` *(only if the card carries branding)* |
| **Ship to Claude** | `cn-claude-plugin/README.md` → stop if the answer is "paste the URL" → `cn-claude-plugin/manifest.md` *(team `.mcp.json` or a shareable bundle)* → `cn-claude-plugin/marketplace.md` *(others install it)*. Skip `shared/icons.md`: Claude exposes no icon field anywhere |
| **Ship to ChatGPT** | `cn-gpt-plugin/README.md` → `cn-gpt-plugin/register.md` → `shared/icons.md` + `cn-gpt-plugin/publish.md` *(public directory only — `logo` and `composerIcon` are both required, submission is rejected without them)*; if OAuth is missing, detour to `shared/oauth.md` + `cn-mcp-core/phase-2-oauth.md` first |
| **Build a Custom GPT** | `cn-gpts/README.md` → `cn-gpts/openapi-actions.md`. Skips `cn-mcp-core/` entirely — Actions are not MCP |
| **Debug something broken** | `shared/pitfalls.md` first → `shared/transport.md` *(shape/status errors)* → `shared/convex.md` *(Convex)* → `shared/oauth.md` *(consent, codes, discovery)* |

## Invariants

- **One server, host-agnostic.** It lives in `cn-mcp-core/` and nowhere else. If a sentence you are about to write branches server behaviour by which AI is calling, delete it.
- **`cn-claude-plugin/` and `cn-gpt-plugin/` assume `cn-mcp-core/` is built and deployed. `cn-gpts/` does not.**
- **The guide folders are not installable.** `packages/` is; everything else is read-only prose. Never create `.claude-plugin/`, never create `skills/`, never add YAML frontmatter. Those artifacts belong in the *user's* project when `cn-claude-plugin/manifest.md` calls for them.
- **Every file opens with an H1, then exactly `**Scope:**` and `**Assumes:**`, in that order, before anything else.** Tables over paragraphs. No filler, no marketing.
- **Honesty beats fluency.** If a claim is not confirmed by a doc you actually fetched or a file you actually read, write `TODO: verify` inline. A confident wrong registration requirement costs the reader hours.
- **Never name a consumer application here.** This repo is a cookbook for any app, so no product name, deployment id or customer hostname belongs in it. Concrete servers are `MCP_ORIGIN` / `SERVER_NAME` / `mcp.example.com`; a real one is cited as "the worked example".
- **The worked example is at Phase 1, bearer only.** Its `convex/mcp/routes.ts` header comment defers OAuth 2.1 + PKCE to a later phase. Cite it with real paths and real snippets; never describe it as having OAuth today.

## Two vendor doc sites refuse automated fetching

You will hit this the moment you try to verify a `TODO: verify` against Anthropic's or OpenAI's help centre.

- **`support.claude.com`** returns 200 to `curl`, but the body is a JS shell — the article text hydrates client-side, so a plain fetch reads as an empty page rather than as a failure.
- **`help.openai.com`** returns **403** to `curl` and to plain fetch tooling. The 403 is **per session, not per article**, so retrying the same URL from the same context never recovers.

Both yield to a real browser. What worked: Playwright + Chromium, a **fresh browser context per page**, a warm-up navigation to the help-centre root first, then ~4s after `goto` and ~6s between pages. That took `help.openai.com` from 5-of-8 pages to 8-of-8. Do not conclude a page is gone because a fetch tool could not read it.

## Before you return

1. Every path you cite resolves — in this repo and in the target codebase.
2. Every host-specific claim is either sourced or marked `TODO: verify`.
3. No server logic branches on the calling host.
4. Report which files you actually read, so the next agent can skip them.
