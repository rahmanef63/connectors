# cn-claude-plugin — packaging for Claude

**Scope:** getting an already-built MCP server, or a skill, into Claude — Claude Code, claude.ai, Claude Desktop, Cowork. Registration and distribution only; nothing here changes a line of your server.
**Assumes:** you already built the one remote MCP endpoint in [`../cn-mcp-core/README.md`](../cn-mcp-core/README.md) and deployed it on public HTTPS. If you have not, stop — there is nothing to package yet.

## Read this before anything else

A remote MCP server reaches **claude.ai as a connector**: a human pastes your URL into a form. Same endpoint, same JSON-RPC, **no repackaging** — no plugin, no manifest, no artifact to build. Claude Code can also add it in one command.

A Claude Code **plugin** is a separate, optional convenience: a versioned directory you hand to *other developers* so they get your `.mcp.json` (plus skills, agents, hooks) without copy-pasting config. It is never a prerequisite for Claude reaching your server.

If all you want is "Claude can call my tools", use the first two rows below and skip both deep files.

## Pick the surface

| You want | What you build | Read |
|---|---|---|
| Your server in your own Claude Code | nothing — `claude mcp add --transport http <name> <url>` | [`../shared/clients.md`](../shared/clients.md) |
| Your server in claude.ai / Desktop / Cowork | nothing — user pastes the URL as a custom connector | this file, §Connector |
| Your team, checked into the repo | `.mcp.json` at project root | [`manifest.md`](./manifest.md) |
| A versioned, shareable bundle (config + skills) | plugin dir with `.claude-plugin/plugin.json` | [`manifest.md`](./manifest.md) |
| Anyone to `/plugin install` it | the above + a `marketplace.json` repo | [`marketplace.md`](./marketplace.md) |
| Listing in Anthropic's catalog | a submission, not an artifact | [`marketplace.md`](./marketplace.md), §Submission |

Every row above points at the **same one server**. None of them changes its logic.

## Also read, when it applies

| Situation | File |
|---|---|
| The connector form demands OAuth you have not built | [`../cn-mcp-core/phase-2-oauth.md`](../cn-mcp-core/phase-2-oauth.md), [`../shared/oauth.md`](../shared/oauth.md) |
| Still on bearer tokens | [`../cn-mcp-core/phase-1-bearer.md`](../cn-mcp-core/phase-1-bearer.md) |
| Unsure your endpoint shape is acceptable | [`../shared/transport.md`](../shared/transport.md) |
| Naming tools and writing descriptions | [`../shared/tool-design.md`](../shared/tool-design.md) |
| Something is broken | [`../shared/pitfalls.md`](../shared/pitfalls.md) |
| About to expose it publicly | [`../shared/security-checklist.md`](../shared/security-checklist.md) |
| Backend is Convex | [`../shared/convex.md`](../shared/convex.md) |

## Connector: the exact path, and the one hard requirement

**Pro / Max:** Customize → Connectors → **+** → **Add custom connector** → paste the server URL → optional **Advanced settings** for OAuth Client ID + Client Secret → **Add**.
**Team / Enterprise:** an Owner first does Organization settings → Connectors → **Add**, picks the custom/remote-URL option, pastes the URL, **Add**. Members then go to Customize → Connectors → **Connect**. TODO: verify the exact sub-menu labels — the support article confirms the entry point and the plan rules but never spells out the inner steps.

**Two Anthropic pages disagree on who may add one.** The support article says **Owners**; [code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp) says *"Add servers at `claude.ai/customize/connectors`. On Team and Enterprise plans, only admins can add servers."* Assume the stricter reading and have an Owner do it. That page also gives the canonical URL, which beats clicking through a menu whose labels keep moving. (Older docs still say *Settings → Connectors*; same dialog, stale label.)

**Claude connects from Anthropic's cloud, not from the user's device** — true on web, Desktop, Cowork and mobile. `localhost`, VPN-only and firewalled hosts silently fail. Publicly reachable HTTPS or nothing. Free plan allows one custom connector; Pro/Max/Team/Enterprise more.

The form offers a URL and, under Advanced settings, an OAuth client ID and secret. TODO: verify whether it exposes any custom-HTTP-header field, and whether it accepts a no-auth server at all — still not stated on any page that answers to an automated fetch (`support.claude.com` serves a JS shell; `help.openai.com` returns 403).

What *is* documented is that the web form and Claude Code are different surfaces with different powers. **Claude Code takes arbitrary headers** — `claude mcp add --header`, a `headers` object in `.mcp.json`, or `headersHelper` to mint one per connection. **The claude.ai form documents only URL + OAuth.** So a bearer-only server is a Claude Code server, and the way to give it to claude.ai is OAuth, not a header. Two useful details from the same page: a server returning `WWW-Authenticate` gets automatic authorization-server discovery, and if you set `headers.Authorization` and the server rejects it, Claude Code **reports the connection as failed rather than falling back to OAuth** — remove the header to get the OAuth flow. Consequence for bearer-only servers: see [`manifest.md`](./manifest.md), §Worked example.

Bonus: connectors added at claude.ai show up automatically in Claude Code's `/mcp` when your active auth is a claude.ai subscription login — but not under `ANTHROPIC_API_KEY`, Bedrock/Vertex or federation credentials.

## Worked example

`/home/rahman/projects/codex` (TemanUsaha AI, Next.js + Convex) is cited throughout with real paths. Its `convex/mcp/routes.ts` states in a comment that it is **Phase 1, bearer only**, with OAuth 2.1 + PKCE explicitly deferred — so it is a real example of a server that connects fine from Claude Code today and is blocked from the claude.ai connector form. It ships no plugin: a repo-wide grep for `.claude-plugin|marketplace.json|CLAUDE_PLUGIN_ROOT` returns zero hits.
