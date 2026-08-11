# mcp-skill

A [Claude Code](https://claude.com/claude-code) skill for building **one** production MCP server that every AI host can use — ChatGPT apps/connectors, Claude.ai, Claude Code, Cursor, Cline, the `mcp-remote` bridge — with OAuth 2.1 + PKCE, hashed bearers and an admin UI.

The premise: you never build a server per vendor. Notion, Stripe, Linear and GitHub each expose a single hosted endpoint and let every host connect to it. The differences between AI hosts live in how a client *registers*, never in your server.

Battle-tested across real deployments. Covers the 16 pitfalls you'd otherwise hit yourself.

> **What's a skill?** Markdown that Claude Code loads on demand. Type `/chatgpt-mcp` or say "add an MCP server to this project" and Claude reads `SKILL.md` as a step-by-step recipe. No code execution; pure prompt context.
>
> **Why is it still called `chatgpt-mcp`?** History — it started as a ChatGPT connector recipe. The name is the trigger people already type, so renaming it would break every install for no benefit. The content is host-agnostic.

## Structure

`SKILL.md` stays short (~110 lines) and is the only file always loaded. Everything else is pulled in **only when it applies**, so a build for a Next.js app never pays for the Convex chapter:

| File | Read when |
|---|---|
| `SKILL.md` | always — decision tree, the universal core, security checklist |
| `references/clients.md` | wiring a specific host (ChatGPT / Claude.ai / Cursor / IDEs) |
| `references/tool-design.md` | designing the tool surface — **highest leverage, most skipped** |
| `references/oauth.md` | implementing the OAuth half |
| `references/transport.md` | JSON-RPC shape, SSE, status codes, discovery docs |
| `references/convex.md` | your backend is Convex |
| `references/pitfalls.md` | something is broken |

## What you'll build

| Phase | Outcome | Time |
|---|---|---|
| **1. Bearer** | `curl`-able MCP server. Hand out static tokens for scripts. | ~30 min |
| **2. OAuth 2.1 + PKCE** | ChatGPT/Claude custom-app connector works end-to-end. | ~3 hours |
| **3. Admin / Settings UI** | Per-user token issuance + revocation + ChatGPT setup card with copy-to-clipboard fields. | ~2 hours |

Each phase ships independently. Bearer alone unlocks scripts and stays as a dev escape hatch after OAuth lands.

## Who it's for

- You have an app with auth (admin or multi-user) and want an AI to act in it — list/get/create/update/trash.
- You want it reachable from whichever AI you or your users prefer, without maintaining N integrations.
- You'd rather copy a recipe with the 16 pitfalls already mapped than rediscover them.

Worked examples are Next.js and Convex, but the endpoint is just `POST(json) → json` — Hono, Express, SvelteKit and Workers are adaptation notes, not rewrites.

## Quick install

Copy the whole folder (`SKILL.md` + `references/`) into your Claude Code skills directory and reload.

### Option A — clone (recommended, easy updates)

```bash
git clone https://github.com/rahmanef63/mcp-skill.git ~/.claude/skills/chatgpt-mcp
```

To update later:

```bash
cd ~/.claude/skills/chatgpt-mcp && git pull
```

### Option B — copy the files (no git)

```bash
DEST=~/.claude/skills/chatgpt-mcp
mkdir -p $DEST/references
for f in SKILL.md references/clients.md references/tool-design.md references/oauth.md references/transport.md references/convex.md references/pitfalls.md; do
  curl -fsSL "https://raw.githubusercontent.com/rahmanef63/mcp-skill/main/$f" -o "$DEST/$f"
done
```

### Option C — per-project (not global)

Drop in your project's `.claude/skills/chatgpt-mcp/` instead of `~/.claude/`. The skill is then available only inside that repo — and, if you commit it, to everyone who clones it.

```bash
DEST=.claude/skills/chatgpt-mcp
mkdir -p $DEST/references
for f in SKILL.md references/clients.md references/tool-design.md references/oauth.md references/transport.md references/convex.md references/pitfalls.md; do
  curl -fsSL "https://raw.githubusercontent.com/rahmanef63/mcp-skill/main/$f" -o "$DEST/$f"
done
```

Skills are discovered by directory presence — there is nothing to register in `.claude/settings.json`, no plugin list, no config key.

## It's additive — that's the whole design

The skill is Markdown Claude reads. It has no runtime, imports nothing, and is imported by nothing.

**Its entire footprint in your repo:**

```
.claude/skills/chatgpt-mcp/SKILL.md
.claude/skills/chatgpt-mcp/references/*.md
```

| Never touched | Why it matters |
|---|---|
| `package.json`, lockfiles | no dependency to audit, nothing to bump |
| `.claude/settings.json`, `.mcp.json` | nothing points at the skill, so nothing can dangle |
| `.gitignore`, CI config, build scripts | your pipeline can't know it exists |
| any source file | the recipe tells *you* what to write; it writes nothing itself |

**Uninstall:**

```bash
rm -rf .claude/skills/chatgpt-mcp          # per-project
rm -rf ~/.claude/skills/chatgpt-mcp        # global
```

That is the complete removal. `git status` goes back to clean and the repo is byte-identical to before — verified on a fresh repo, install then uninstall, `git diff` empty and HEAD unchanged.

**Code you already shipped with its help keeps working.** The MCP server the recipe walks you through is ordinary code in your own repo — routes, Convex functions, a schema. It has no link back to the skill. Delete the skill and the server keeps serving; the only thing you lose is the recipe for the *next* one.

**Check whether your copy has drifted from upstream:**

```bash
for f in SKILL.md references/clients.md references/tool-design.md references/oauth.md references/transport.md references/convex.md references/pitfalls.md; do
  curl -fsSL "https://raw.githubusercontent.com/rahmanef63/mcp-skill/main/$f" \
    | diff -q - ".claude/skills/chatgpt-mcp/$f" >/dev/null || echo "drifted: $f"
done; echo "check complete"
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

~110 lines always loaded, ~410 more pulled in on demand, covering:

- **3-phase build** — bearer → OAuth → admin UI, ship each phase independently
- **Convex-specific gotchas** — 8 pitfalls unique to self-hosted Convex (CLOUD vs SITE origin split, static-import requirement, etc.)
- **Tool design** — agent-oriented tools over 1:1 REST mapping, Markdown over JSON for token density, descriptions as prompt context
- **Pagination + response-shape symmetry** — the bug class TypeScript can't catch
- **Anti-abuse layering** — per-minute burst + per-day cap + AI token quota per user
- **Always-allow reality check** — MCP spec has no server flag for it; what actually works
- **Security checklist** — the gate to clear before you expose it to anyone
- **Tool catalog template** — copy-paste tool signatures by op-type
- **Client matrix** — what ChatGPT / Claude.ai / Cursor / IDE agents each require, and the exact ChatGPT form values
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
