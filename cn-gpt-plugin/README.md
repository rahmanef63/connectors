# cn-gpt-plugin — getting your MCP server into ChatGPT

**Scope:** registering an already-built remote MCP server with ChatGPT — for yourself, and for everyone. Registration and distribution only; no server internals.
**Assumes:** you already have a deployed MCP endpoint on public HTTPS, built per [`../cn-mcp-core/README.md`](../cn-mcp-core/README.md). Nothing in this folder changes a line of that server.

## Pick the path first

| You want | Read | What it costs |
|---|---|---|
| Your own server in your own ChatGPT | [`register.md`](./register.md) | minutes, no review |
| Your team to use it | [`register.md`](./register.md), workspace-publish section | minutes, needs workspace admin |
| Anyone to install it from the public directory | [`publish.md`](./publish.md) | identity + domain verification, tool scan, review of unstated length |

The two paths use the **same** server at the **same** URL. Do not build a second one for ChatGPT.

## Read this much, then stop

| You are | Read |
|---|---|
| Anyone | this file (~2 min), then the one path row above |
| Blocked on "where do I paste my API key?" | the gate below, then [`register.md`](./register.md) |
| Missing the OAuth half the form demands | [`../shared/oauth.md`](../shared/oauth.md) |
| Comparing hosts before committing | [`../shared/clients.md`](../shared/clients.md) |
| Unsure your endpoint shape is acceptable | [`../shared/transport.md`](../shared/transport.md) |
| Writing tool names/descriptions/annotations | [`../shared/tool-design.md`](../shared/tool-design.md) — review reads these, so does the model |
| Debugging a failed connection | [`../shared/pitfalls.md`](../shared/pitfalls.md) |
| About to expose it | [`../shared/security-checklist.md`](../shared/security-checklist.md) |
| On Convex | [`../shared/convex.md`](../shared/convex.md) |

## The one gate that stops most people

ChatGPT's connection form offers exactly three auth modes — **OAuth**, **No Authentication**, **Mixed Authentication** ([developer-mode.md](https://developers.openai.com/api/docs/guides/developer-mode.md)). There is no API-key field and no custom-header field, and the docs are explicit that ChatGPT "cannot present custom API keys" ([build/auth.md](https://developers.openai.com/plugins/build/auth.md)). Claude Code, Cursor and `mcp-remote` all let you paste an arbitrary `Authorization:` or `X-Whatever:` header. **ChatGPT does not.** A bearer-only server is therefore registerable in ChatGPT only by dropping its own gate — which you should not do. If you want ChatGPT, you need [`../shared/oauth.md`](../shared/oauth.md) implemented first.

## What ChatGPT calls this now

OpenAI renamed the feature to **Plugins**. `https://developers.openai.com/apps-sdk` 301-redirects to `https://developers.openai.com/plugins` (verified with `curl -L`); there is no separate Apps SDK doc tree any more. A "plugin" is defined as skills, an MCP server, or both — `Plugin ├── Skills └── MCP server (optional)` ([concepts/plugins.md](https://developers.openai.com/plugins/concepts/plugins.md)) — and ChatGPT and Codex share one universal plugin directory. **This is a rename of the MCP feature, not a packaging format you must adopt.** Your server stays exactly what it was: one HTTPS JSON-RPC endpoint. Even the file named `.app.json` is described by OpenAI as "a compatibility identifier; the underlying primitive is the MCP server" ([build/plugins.md](https://developers.openai.com/plugins/build/plugins.md)).

*History, for disambiguation only:* the 2023 ChatGPT plugin system built on `.well-known/ai-plugin.json` is dead and unrelated to any of this. It appears nowhere in the current doc tree. If a search result, a blog post or your own memory tells you to write an `ai-plugin.json`, that result is from the dead system — ignore it. It is not mentioned again anywhere in this folder.

## Worked example

The worked example (Next.js + Convex) is cited throughout both files as a real server at Phase 1 — bearer only, its own source says so — and therefore as a real example of a server that **cannot** be registered in ChatGPT today without work. Its separate Custom GPT Actions surface under `GPTs/` is a different mechanism and is not covered here.
