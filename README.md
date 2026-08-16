# connectors

**Scope:** the router for this repo — one paragraph of thesis, then which folder to open for your situation.
**Assumes:** you have a web app deployed on public HTTPS and you want an AI to call it. No prior MCP knowledge.

Documentation you *read*, not software you install. Point Claude Code, Codex or Cursor at this repo, let it open the one folder that matches the job, and let it write the integration into your codebase. Nothing here runs.

## The thesis

You build **one** MCP server: a single HTTPS endpoint that speaks JSON-RPC. ChatGPT, Claude.ai, Claude Code, Cursor and every other host connect to that same endpoint with the same protocol. Notion, Stripe, Linear and GitHub all ship exactly one hosted server and let every host connect to it — nobody ships a server per vendor. What differs between hosts is **how a client registers**, never what your server does. So this repo has one folder that builds the server, and vendor folders that describe registration and distribution on top of it. If you catch yourself branching server logic on which AI is calling, you have taken a wrong turn.

```mermaid
flowchart LR
    CG["ChatGPT<br/><i>OAuth or none</i>"]
    CA["claude.ai<br/><i>OAuth only</i>"]
    CC["Claude Code<br/><i>any header</i>"]
    CU["Cursor<br/><i>any header</i>"]
    MR["mcp-remote<br/><i>stdio bridge</i>"]

    CG --> EP
    CA --> EP
    CC --> EP
    CU --> EP
    MR --> EP

    EP["<b>POST /mcp</b><br/>one endpoint, JSON-RPC"]
    EP --> TR["tool registry"]
    TR --> APP["your app and database"]
```

Every host on the left speaks the identical protocol to the identical endpoint. The italics are the *only* thing that differs between them — how a client proves who it is — and that difference is settled at registration time, never in your dispatcher.

Two things come out the far end, not one. The server, and a **copy-paste-ready setup form** — one tab per host, every value the user must move into another application sitting behind a copy button, endpoint and token alike. That form is the whole difference between a server that exists and a server anyone can connect to, so it has its own spec: [`shared/setup-form.md`](./shared/setup-form.md).

## Which folder

| Your situation | Folder |
|---|---|
| "I want an AI to read and write things in my app" — start here | [`cn-mcp-core/`](./cn-mcp-core/README.md) |
| The server exists; now get it into Claude Code, claude.ai, Desktop or Cowork | [`cn-claude-plugin/`](./cn-claude-plugin/README.md) |
| The server exists; now get it into ChatGPT, for yourself or the public directory | [`cn-gpt-plugin/`](./cn-gpt-plugin/README.md) |
| I only care about ChatGPT, I already have REST routes, one Custom GPT is enough | [`cn-gpts/`](./cn-gpts/README.md) |
| Something is broken, or I need one cross-cutting detail | [`shared/`](#shared) |

Both ChatGPT paths can coexist: Actions and MCP are two front doors onto the same routes, the same validation, the same audit log.

```mermaid
flowchart TD
    Q{"What are you<br/>actually doing?"}
    Q -->|"one Custom GPT, REST already exists"| G["<b>cn-gpts/</b><br/>OpenAPI Actions<br/><i>needs no MCP server</i>"]
    Q -->|"an AI should read and write my app"| C

    subgraph BUILD["cn-mcp-core/ — build it once"]
        C["phase-1-bearer<br/><i>the endpoint</i>"] --> O["phase-2-oauth<br/><i>only for ChatGPT / claude.ai</i>"]
        O --> A["phase-3-admin-ui<br/><i>mint and revoke</i>"]
    end

    A --> W{"Who installs it?"}
    W -->|"just me"| R["<b>cn-gpt-plugin/</b><br/>register.md — no review"]
    W -->|"Claude users"| L["<b>cn-claude-plugin/</b><br/>manifest + marketplace"]
    W -->|"the public"| P["<b>cn-gpt-plugin/</b><br/>publish.md — reviewed"]
```

Stop at the first box that answers your question. Most people never reach the bottom row: a server you use yourself needs `phase-1` and `register.md` and nothing else.

Each folder's `README.md` is the orientation and the decision table; the files beside it are the deep ones you open only once you have decided:

- `cn-mcp-core/` — `phase-1-bearer.md` (the endpoint), `phase-2-oauth.md` (the authorization half), `phase-3-admin-ui.md` (token mint and revoke).
- `cn-claude-plugin/` — `manifest.md` (`plugin.json` and packaging), `marketplace.md` (`marketplace.json`, install, catalog submission).
- `cn-gpt-plugin/` — `register.md` (developer mode, no review), `publish.md` (public directory submission).
- `cn-gpts/` — `openapi-actions.md` (the schema, the auth panel, the privacy-policy gate).

## Dependencies, stated plainly

**`cn-claude-plugin/` and `cn-gpt-plugin/` assume `cn-mcp-core/` is already built and deployed.** They are packaging and registration; they change zero lines of your server. Open them with nothing built and there is nothing to package.

**`cn-gpts/` does not.** Custom GPT Actions are not MCP — a GPT calls your existing REST routes directly from an OpenAPI document you paste into GPT Builder. No JSON-RPC, no `/mcp` endpoint, no authorization server of your own if a header key is enough. It is the shortest path to one working AI client, and also the narrowest: one host, one GPT.

## shared

Thirteen cross-cutting files, read alongside whichever folder you picked — tool design, per-host clients, transport, results, OAuth, Convex, the setup form, file and image inputs, icons, versioning, testing, pitfalls, the security gate. The "open when" table for all of them lives in [`shared/README.md`](./shared/README.md); pull single files from there on demand.

## Reference implementation

Every concrete snippet in this repo comes from a real Next.js + Convex deployment, referred to throughout as **the worked example**. It is deliberately never named: this is a cookbook, and a recipe that only works for one restaurant is not a recipe. Its paths and snippets are quoted verbatim, so every claim here came out of running code rather than a template.

Read it honestly: it is at **Phase 1, bearer only**. Its `convex/mcp/routes.ts` says so in a header comment — *"Phase 1 = bearer only; OAuth 2.1 + PKCE is a separate, later phase"*. That makes it a working example of two things at once: a server Claude Code and Cursor can call today, and a server the ChatGPT and claude.ai connector forms will not accept, because those forms have no API-key field. It also ships a separate Custom GPT Actions surface under `GPTs/` — a different mechanism, covered in `cn-gpts/`.

Where a claim could not be confirmed from a fetched doc or from that repo, the text says `TODO: verify` inline instead of guessing. A confident wrong statement about a registration requirement costs you hours, which is the exact failure this repo exists to prevent.

## What is still unverified

Six open questions, listed here rather than left buried inline. Every one is marked at the point of use too, so you meet it where it matters — this is the index.

**None of these is blocked on effort.** Each has been searched to exhaustion; the answer is not published anywhere the vendor puts documentation. That is a different and more useful statement than "not looked into yet", and it is why they are worth showing rather than quietly carrying.

| # | Question | Where | What bounds it |
|---|---|---|---|
| 1 | What does "**valid**" mean mechanically for a GPT Actions privacy-policy URL? | [`cn-gpts/openapi-actions.md`](./cn-gpts/openapi-actions.md) | Three help-centre pages say "valid" and none defines it. The *plugins* directory does publish its validator codes for the same field — `wrong_type`, `empty`, `format`, `too_long` — and every one is a **static** check that never fetches the URL. Different pipeline, so it settles nothing, but it points at well-formed rather than reachable. |
| 2 | Can a **No Authentication** server exposing write tools pass OpenAI directory review? | [`cn-gpt-plugin/publish.md`](./cn-gpt-plugin/publish.md) | Review grades *disclosure*, not auth mode. Anthropic's directory does accept no-auth as one of three modes — different vendor, no read-across. |
| 3 | Which **protocol revisions does ChatGPT accept**? | [`cn-gpt-plugin/register.md`](./cn-gpt-plugin/register.md) | The spec sets no floor, only negotiation, so the accepted set is whatever ChatGPT implements — and OpenAI publishes no list. Its own pages cite `2025-06-18`. |
| 4 | How does an **MCP-only plugin target CHAT vs CODEX**? | [`cn-gpt-plugin/register.md`](./cn-gpt-plugin/register.md) | Surface targeting is documented only for a *bundled skill*, via `policy.products` in `agents/openai.yaml` — a file an MCP-only submission does not have. `plugins/reference` has `_meta.ui.visibility`, but that is model-vs-UI, not surface. |
| 5 | OpenAI's **recommended icon dimension**, and whether one file may serve as both `logo` and `composerIcon` | [`shared/icons.md`](./shared/icons.md) | Only a 48×48 floor and a 4096×4096 ceiling are published, so the 512/1024 sizes in that file are engineering judgement. Both fields are required and validated independently, so one square PNG *should* satisfy every published rule — untested, and cheap to test by submitting. |
| 6 | Does **any shipping host render `serverInfo.icons`**? | [`shared/icons.md`](./shared/icons.md) | Narrowed, not closed: `Icon` first exists in the `2025-11-25` schema — the `2025-06-18` schema has no such type at all — and hosts today commonly negotiate `2024-11-05` or `2025-06-18`, where the field has nowhere to live. Treat it as inert until a host both negotiates 2025-11-25 and documents rendering. |

Four of the six are OpenAI questions, and that is not a coincidence: `developers.openai.com` is fetchable and generally good, but `help.openai.com` now sits behind a Cloudflare bot challenge that refuses `curl` and real headless Chromium alike (re-tested 2026-08-15). Anything only the help centre knows is currently out of reach from a server. See [`AGENTS.md`](./AGENTS.md) for what works instead.

**Closing one is welcome.** The bar is a primary source or a reproducible observation — a vendor page, a schema file, a package's source, or "I submitted this and here is what happened". Replace the inline marker with the finding and the date, and delete the row here. A confident guess is worse than the open question, which is the whole reason these are visible.

## Reading this as an agent

[`AGENTS.md`](./AGENTS.md) has the full file map, per-goal reading order, and the invariants your output must not break.

## License

MIT — see [`LICENSE`](./LICENSE). Fork it, adapt it, ship it commercially.
