# mcp-skill

A [Claude Code](https://claude.com/claude-code) skill that walks you through building a **production-ready MCP server** (bearer + OAuth 2.1 + PKCE + admin UI) so MCP-aware clients — ChatGPT custom apps, Claude.ai web, Cursor, Cline, the `mcp-remote` stdio bridge — can call your app's tools via natural language.

Battle-tested across two real deployments. Covers the 16 pitfalls you'd otherwise hit yourself.

> **What's a skill?** A Markdown file Claude Code loads on demand. When you type `/chatgpt-mcp` or say "add MCP server to this project", Claude reads `SKILL.md` and uses its content as a step-by-step recipe. No code execution; pure prompt context.

## What you'll build

| Phase | Outcome | Time |
|---|---|---|
| **1. Bearer** | `curl`-able MCP server. Hand out static tokens for scripts. | ~30 min |
| **2. OAuth 2.1 + PKCE** | ChatGPT/Claude custom-app connector works end-to-end. | ~3 hours |
| **3. Admin / Settings UI** | Per-user token issuance + revocation + ChatGPT setup card with copy-to-clipboard fields. | ~2 hours |

Each phase ships independently. Bearer alone unlocks scripts and stays as a dev escape hatch after OAuth lands.

## Who it's for

- You have a **Next.js** or **Convex** (self-hosted) app with auth (admin or multi-user).
- You want users to interact with your app through ChatGPT/Claude/Cursor via tool calls — list/get/create/update/trash entities.
- You'd rather copy a recipe with the 16 pitfalls already mapped than rediscover them.

If your backend is something else (Hono, Express, SvelteKit, Cloudflare Workers), the skill's adaptation notes get you 80% of the way.

## Quick install

The skill lives in a single file: `SKILL.md`. Drop it into your Claude Code skills directory and reload.

### Option A — clone (recommended, easy updates)

```bash
git clone https://github.com/rahmanef63/mcp-skill.git ~/.claude/skills/chatgpt-mcp
```

To update later:

```bash
cd ~/.claude/skills/chatgpt-mcp && git pull
```

### Option B — copy file only

```bash
mkdir -p ~/.claude/skills/chatgpt-mcp
curl -fsSL https://raw.githubusercontent.com/rahmanef63/mcp-skill/main/SKILL.md \
  -o ~/.claude/skills/chatgpt-mcp/SKILL.md
```

### Option C — per-project (not global)

Drop in your project's `.claude/skills/chatgpt-mcp/` instead of `~/.claude/`. The skill is then available only inside that repo.

```bash
mkdir -p .claude/skills/chatgpt-mcp
curl -fsSL https://raw.githubusercontent.com/rahmanef63/mcp-skill/main/SKILL.md \
  -o .claude/skills/chatgpt-mcp/SKILL.md
```

## Verify the install

Open Claude Code in any project and run:

```
/chatgpt-mcp
```

You should see Claude acknowledge the skill loaded. Then:

```
Build an MCP server for this project. Start with Phase 1.
```

Claude reads the recipe, surveys your repo, and walks you through the steps.

## Trigger phrases

The skill auto-activates on any of these (you don't need to type `/chatgpt-mcp`):

- `add MCP server`
- `ChatGPT connector`
- `Claude connector`
- `OAuth PKCE for MCP`
- `ChatGPT custom app`
- `expose tools to ChatGPT` / `expose tools to AI`
- `build MCP for Convex`
- `MCP server does not implement OAuth` (the error string ChatGPT shows you)

## What's in the recipe

`SKILL.md` is ~300 lines covering:

- **3-phase build** — bearer → OAuth → admin UI, ship each phase independently
- **Convex-specific gotchas** — 8 pitfalls unique to self-hosted Convex (CLOUD vs SITE origin split, static-import requirement, etc.)
- **LLM steering via tool descriptions** — descriptions ARE prompt context; how to write them so the model picks the right tool
- **Pagination + response-shape symmetry** — the bug class TypeScript can't catch
- **Anti-abuse layering** — per-minute burst + per-day cap + AI token quota per user
- **Always-allow reality check** — MCP spec has no server flag for it; what actually works
- **Security checklist** — 13 items to verify before opening to ChatGPT
- **Tool catalog template** — copy-paste tool signatures by op-type
- **ChatGPT connector form mapping** — exact field-by-field values to paste
- **16 pitfalls** with symptoms + root cause + fix

## Compatibility

| Backend | Coverage |
|---|---|
| **Next.js + Convex (cloud or self-hosted)** | ✅ Full recipe, both hosts addressed |
| **Next.js + Drizzle/Prisma/Supabase** | ✅ Adapt the schema; PKCE/token logic is DB-agnostic |
| **Hono / Express / SvelteKit** | ✅ MCP endpoint is just `POST(json) → json` |
| **Bun runtime** | ✅ ALS API identical |
| **Cloudflare Workers** | ⚠ Needs nodejs compat shim for AsyncLocalStorage |
| **Convex self-hosted** | ✅ Convex-specific section walks the SITE/CLOUD split + the Convex isolate gotchas |

## Security posture

- **No secrets in the skill itself.** Everything you set up is your own keys (`MCP_API_KEY`, `JWT_PRIVATE_KEY`, OAuth client config) under your control.
- **PKCE S256 only**, `plain` rejected.
- **Auth codes single-use, 5-min TTL, deleted before the token is minted** to prevent race-window double-issuance (and to keep the table from growing forever).
- **Access tokens revocable** server-side; immediate effect on next MCP call.
- **redirect_uri host allowlist** (chatgpt.com / chat.openai.com / platform.openai.com) so attackers can't phish through your consent page.
- **Per-minute + per-day rate limits** on write tools; AI token quota for tools that fan out to upstream LLMs.
- **Tokens + auth codes stored as sha256** — the raw value is shown exactly once, at mint; the DB never holds it, so there is nothing for the admin UI to strip.

The skill's security checklist is the final gate before opening your MCP endpoint to public clients.

## Updating

This repo is updated as new gotchas surface. To pull the latest recipe:

```bash
cd ~/.claude/skills/chatgpt-mcp && git pull
```

Installed with Option B or C? Re-run the same `curl` — it overwrites the file in place.

No code changes in your project — just the recipe Claude reads.

## Contributing

Found a gotcha I missed? Open a PR adding it to the **Pitfalls** section with symptom + root cause + fix. Real-world bugs > theoretical ones.

If you've added MCP to a backend not yet covered (Drizzle, Cloudflare Workers, Bun-only, etc.), open a PR with a short adaptation note.

## License

MIT — see [LICENSE](./LICENSE). Use freely, fork, modify, ship in commercial products.

## Acknowledgements

Recipe distilled from real production deployments across two MCP-enabled apps (a Next.js admin tool + a multi-user Convex-backed editor). Every pitfall in the list cost someone hours; documenting them saves the next person those hours.

The MCP spec itself is from [Anthropic + the MCP working group](https://modelcontextprotocol.io). PKCE is RFC 7636. AS metadata is RFC 8414. Protected-resource metadata is RFC 9728. ChatGPT custom-apps + Apps SDK are from OpenAI.
