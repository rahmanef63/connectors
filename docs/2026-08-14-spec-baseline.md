# Spec baseline — checked 2026-08-14

**Scope:** which published specifications this repo's guidance and any shared code are written against, and when each was last verified.
**Assumes:** nothing. Re-check before trusting anything below; these move.

Every source here was fetched on **2026-08-14** unless a different date is given. Where a page refuses automated fetching, the method used is recorded so the next pass does not repeat the discovery.

| Source | Version / state | Verified | Notes |
|---|---|---|---|
| [MCP specification](https://modelcontextprotocol.io/specification/2025-11-25) | **2025-11-25** | 2026-08-14, 200 | current revision. `Icon`, `icons?: Icon[]` on six types, `ImageContent`, `MCP-Protocol-Version` header rules |
| [MCP lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle) | 2025-11-25 | 2026-08-14 | `initialize` params are required; the protocol header is mandated only on requests *after* initialize |
| [MCP TypeScript SDK](https://www.npmjs.com/package/@modelcontextprotocol/sdk) | **1.30.0** | 2026-08-14 | published 2026-07-27. Not currently a dependency of any repo here |
| [developers.openai.com/plugins](https://developers.openai.com/plugins) | live | 2026-08-14, 200 | append `.md` to any page for Markdown; `plugins/llms.txt` indexes the tree |
| [plugins/reference](https://developers.openai.com/plugins/reference.md) | live | 2026-08-13 | the **file-param contract** — the authority for `_meta["openai/fileParams"]` |
| [api/docs/guides/developer-mode](https://developers.openai.com/api/docs/guides/developer-mode.md) | live | 2026-08-13 | auth modes, plan eligibility |
| [plugins/deploy/submission](https://developers.openai.com/plugins/deploy/submission.md) + `submission-errors` | live | 2026-08-13 | packaging, `interface.logo` / `composerIcon`, validator error codes |
| [plugins/guides/submit-claude-plugin](https://developers.openai.com/plugins/guides/submit-claude-plugin.md) | live | 2026-08-13 | Claude-plugin → OpenAI mapping |
| [openai/openai-apps-sdk-examples](https://github.com/openai/openai-apps-sdk-examples) | last pushed **2026-04-15** | 2026-08-14 | **four months stale.** See the naming note below |
| [code.claude.com/docs/en/plugins-reference](https://code.claude.com/docs/en/plugins-reference) | live | 2026-08-13 | plugin.json, `${CLAUDE_PLUGIN_ROOT}`, marketplace schema |
| [code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp) | live | 2026-08-13 | `.mcp.json`, `headersHelper`, env expansion |
| [cursor.com/docs/mcp](https://cursor.com/docs/mcp) | live | 2026-08-13 | `${env:NAME}` interpolation |

## Naming: "Apps SDK" is the old name

ChatGPT's MCP feature is surfaced as **Plugins**. `developers.openai.com/apps-sdk` and `/apps-sdk/build/auth` both **301 to `/plugins/...`** (verified 2026-08-13). The `openai-apps-sdk-examples` repository still carries the old name and has not been pushed since 2026-04-15, so treat it as illustrative, not authoritative — prefer `developers.openai.com/plugins` wherever the two disagree.

Distinct and dead: the **2023 ChatGPT plugins** system built on `.well-known/ai-plugin.json` (no new conversations after 2024-03-19, shut down 2024-04-09). It shares a word with the current feature and nothing else. Never document it as live.

## Sources that refuse automated fetching

- **`support.claude.com`** returns 200 to `curl` but the body is a JS shell; the article text hydrates client-side.
- **`help.openai.com`** returns **403** to `curl` and to plain fetch tooling. The 403 is **per session, not per article**.

Both yield to a real browser. What worked: Playwright + Chromium, a fresh browser context per page, a warm-up navigation to the help-centre root, and ~4s after `goto` plus ~6s between pages. That took `help.openai.com` from 5-of-8 pages to 8-of-8.

## Protocol version in use

`2024-11-05` is what ChatGPT, Claude and Cursor all still negotiate, and it is what CareerPack pins. The spec revision above is newer; bumping the pin is not cosmetic, because later revisions change error and content shapes. Any shared package must let the consumer choose, and must not silently advertise a revision the server does not actually implement.
