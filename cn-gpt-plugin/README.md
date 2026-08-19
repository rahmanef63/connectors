# cn-gpt-plugin — getting your MCP server into ChatGPT and Codex

**Scope:** registering, packaging and publicly distributing an already-built remote MCP server through OpenAI surfaces. No server business logic belongs here.
**Assumes:** you already have one deployed HTTPS MCP endpoint built per [`../cn-mcp-core/README.md`](../cn-mcp-core/README.md).

## Pick the path first

| You want | Read | Outcome |
|---|---|---|
| Your server in your own/workspace ChatGPT | [`register.md`](./register.md) | a hosted connection with OAuth and a technical `plugin_asdk_app…` id |
| A reusable repo/local plugin bundle for ChatGPT/Codex | [`package.md`](./package.md) | `.codex-plugin/plugin.json` + real `.app.json`, optional skills/local MCP config |
| Anyone to install it from the public directory | [`publish.md`](./publish.md) | identity/domain verification, reviewed scan and public listing |

The paths build on one another:

```text
working MCP server
→ register and test the live connection
→ package the real connection id when distribution needs a bundle
→ submit a reviewed public version only when required
```

They use the **same server at the same URL**. Do not create another dispatcher for ChatGPT or Codex.

## Read this much, then stop

| Situation | Read |
|---|---|
| Auth form has nowhere to paste an API key | the gate below → [`../shared/oauth.md`](../shared/oauth.md) |
| Endpoint shape/version uncertain | [`../shared/transport.md`](../shared/transport.md) + [`../shared/modern-protocol.md`](../shared/modern-protocol.md) |
| Tool metadata/annotations need work | [`../shared/tool-design.md`](../shared/tool-design.md) + [`../shared/results.md`](../shared/results.md) |
| Personal/workspace connection | [`register.md`](./register.md) |
| Repository/local installable package | [`package.md`](./package.md) |
| Public directory | [`publish.md`](./publish.md) |
| Failed connection/review | [`../shared/pitfalls.md`](../shared/pitfalls.md) |
| About to expose or ship | [`../shared/security-checklist.md`](../shared/security-checklist.md) |

## The gate that stops most builds

ChatGPT supports OAuth, no authentication and mixed authentication for custom MCP connections. It does **not** present arbitrary custom API keys/headers on behalf of the user. A bearer-only private server therefore remains suitable for Claude Code/Cursor-style configured clients but is not ready for ChatGPT OAuth linking.

Implement:

- RFC 9728 protected-resource discovery;
- authorization-server metadata;
- OAuth authorization code + PKCE S256;
- exact `resource`/audience and issuer validation;
- CIMD where supported, DCR for compatible hosts;
- per-tool `securitySchemes` and runtime auth challenge metadata;
- per-call scope enforcement.

The complete recipe is [`../shared/oauth.md`](../shared/oauth.md).

## What “plugin” means now

OpenAI's current plugin model can contain:

```text
Plugin
├── skills (optional)
└── MCP connection/server (optional)
```

Registration creates the hosted connection. Packaging gives it a reusable plugin identity and optional workflows/assets. Public submission freezes and reviews a version of that metadata. The underlying application primitive remains your MCP server.

The historical 2023 `.well-known/ai-plugin.json` system is unrelated. Do not resurrect it for this workflow.

## Metadata quality is runtime quality

Before registering or scanning, the live server should expose:

- stable `name`, human `title`, focused description;
- exact input and output schemas;
- protocol and compatibility security schemes;
- all four safety annotations;
- short invocation status text;
- deterministic per-user tool lists;
- concise server instructions;
- errors the model/client can act on.

After any descriptor change, refresh/rescan and test in a new conversation. A host may keep a frozen snapshot even while tool calls reach the live server.

## Worked example boundary

The unnamed Next.js + Convex worked example cited elsewhere is intentionally Phase 1 bearer-only. It demonstrates a server that configured desktop/IDE clients can call, and why consumer-host OAuth must be added before ChatGPT registration. Its separate Custom GPT Actions surface is another mechanism covered by [`../cn-gpts/`](../cn-gpts/README.md).
