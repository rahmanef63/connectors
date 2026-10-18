# register.md — your own MCP server, your own ChatGPT

**Scope:** ChatGPT custom MCP connections — connecting and testing an already-deployed MCP server for yourself/workspace. Reusable packaging is [`package.md`](./package.md); public review is [`publish.md`](./publish.md).
**Assumes:** the server answers JSON-RPC over public HTTPS at a stable URL ending in `/mcp`, and you have read [`../cn-mcp-core/README.md`](../cn-mcp-core/README.md).

## Do this in order

1. Check the two gates below. If auth fails, stop — the UI will not save you.
2. Open `https://chatgpt.com/plugins` → **+** → **Add custom MCP server**.
3. Supply the name, endpoint or tunnel, authentication and risk acknowledgement; select **Create as a plugin**.
4. Review the discovered tools, install the plugin and test it in a new conversation.
5. Copy the real technical id (`plugin_asdk_app…`) after live acceptance; package it only when distribution needs a bundle.

The current Plugins flow does not require the old Developer Mode toggle. Account/workspace policies still apply. Legacy Apps screens have a separate creation/draft flow. Verified 2026-10-18 against [OpenAI's connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt) and [current help article](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt).

## Gate 1 — auth. Read before anything else

Use the server's OAuth/no-auth/per-tool auth contract; the [authentication guide](https://developers.openai.com/plugins/build/auth) is the source of truth. Static bearer headers are not a ChatGPT registration option:

> "ChatGPT does not support machine-to-machine OAuth grants such as client credentials, service accounts, or JWT bearer assertions, **nor can it present custom API keys** or customer-provided mTLS certificates." — [build/auth.md](https://developers.openai.com/plugins/build/auth.md)

| Your server's auth today | Option to pick | Verdict |
|---|---|---|
| OAuth 2.1 + PKCE (S256) | **OAuth** | Works. Build it per [`../shared/oauth.md`](../shared/oauth.md). |
| Static bearer, or any custom header | *(none exists)* | **Blocked.** There is nowhere to type it. |
| Genuinely public, read-only tools | **No Authentication** | Works. Only if leaking every tool result to anyone who finds the URL is fine. |
| Public discovery + authenticated tools | **Mixed Authentication** | `initialize` and list-tools run unauthenticated; each tool uses OAuth or no auth per its own `securitySchemes`. |

For OAuth, prefer Client ID Metadata Documents (CIMD) when the authorization server/client setup supports them; keep DCR for compatible hosts and use a pre-defined/static OAuth client only when the workspace/form explicitly supplies one. Whichever path is used, the authorization request and token must remain bound to the exact protected `resource`, issuer and redirect URI. Redirect URI is `https://chatgpt.com/connector/oauth/{callback_id}`.

The current connection guide explicitly includes authentication configuration before creation.

**Both halves or no linking UI:** the OAuth prompt appears only when you ship per-tool `securitySchemes` **and** return a runtime error carrying `_meta["mcp/www_authenticate"]` with both `error` and `error_description`. "Without both halves ChatGPT will not show the linking UI for that tool." Details in [`../shared/oauth.md`](../shared/oauth.md).

## Gate 2 — entitlement

Check the [current availability and workspace permissions](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt) before promising access. Full MCP is documented for Business and Enterprise/Edu on web; Pro has read/fetch access. Business creation is restricted to admins/owners; Enterprise/Edu may grant selected members creation rights. Only admins/owners publish workspace apps. Plus/Free eligibility is not established by this source; check the actual account.

## What ChatGPT demands that Claude Code and Cursor do not

| Requirement | ChatGPT | Claude Code / Cursor |
|---|---|---|
| Creation permission | account/workspace policy; current Plugins flow has no global toggle prerequisite | local client configuration |
| Paid plan, web surface | yes | any account, local |
| Auth | OAuth / none / mixed **only** | paste any header you like |
| Reachability | public HTTPS, or Secure MCP Tunnel | `localhost` and `stdio` are fine |
| Metadata changes | explicit **Refresh** step | reconnect and it re-lists |

Full per-host comparison: [`../shared/clients.md`](../shared/clients.md). If a tool needs to accept an image or a file, that is ChatGPT's `openai/fileParams` contract — [`../shared/file-inputs.md`](../shared/file-inputs.md).

## Transport

"Supported MCP protocols: **SSE and streaming HTTP**." Elsewhere: "Respond at a stable URL, typically ending in `/mcp`." Search/fetch tools are **not** required in developer mode — confirmed twice now, most bluntly by the help centre: *"Are search and fetch tools required for connected servers? **No. They are no longer required.**"* See [`../shared/transport.md`](../shared/transport.md).

**POST-only, sessionless, 405-on-GET is conformant Streamable HTTP — not a degraded mode.** The MCP spec settles this half, from [Transports (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports):

| Question | Spec answer |
|---|---|
| Must a POST carrying a request return SSE? | No. *"If the input is a JSON-RPC request, the server **MUST** either return `Content-Type: text/event-stream`, to initiate an SSE stream, or `Content-Type: application/json`, to return one JSON object."* |
| Is 405 on GET legal? | It is the sanctioned signal. *"The server **MUST** either return `Content-Type: text/event-stream` in response to this HTTP GET, or else return HTTP 405 Method Not Allowed, indicating that the server does not offer an SSE stream at this endpoint."* (Same page also says the endpoint **MUST** support both methods — read together: answer the GET, and 405 is an answer.) |
| Are sessions required? | No. *"A server using the Streamable HTTP transport **MAY** assign a session ID at initialization time."* |

`protocolVersion` is the open half. The spec sets no floor, only negotiation — *"If the server supports the requested protocol version, it MUST respond with the same version. Otherwise, the server MUST respond with another protocol version it supports… If the client does not support the version in the server's response, it SHOULD disconnect"* ([Lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)) — so the accepted set is whatever ChatGPT implements, and OpenAI publishes no list. Two hints, not rules: its pages cite `specification/2025-06-18` and `specification/2025-11-25`, and `2024-11-05` is precisely the revision whose HTTP+SSE transport Streamable HTTP superseded (*"This replaces the HTTP+SSE transport from protocol version 2024-11-05"*). Answering `2024-11-05` while serving Streamable HTTP advertises a transport you do not implement and hands a strict client grounds to disconnect. TODO: verify which revisions ChatGPT accepts. Already searched, do not repeat: every plugins and api/docs page — the strongest statements are *"Supported MCP protocols: SSE and streaming HTTP"* and *"Support the MCP streamable HTTP transport"* ([build/mcp-server](https://developers.openai.com/plugins/build/mcp-server.md)), neither naming a revision. Empirical check beats guessing: point [MCP Inspector](https://developers.openai.com/plugins/build/mcp-server.md) at your endpoint with **Streamable HTTP** selected before you register.

## Using it, and iterating

- **Test the plugin:** install it, start a new conversation and `@`-mention it; use the [current connection/test flow](https://developers.openai.com/plugins/deploy/connect-chatgpt).
- **Confirmations:** "Write actions by default require confirmation… We respect the `readOnlyHint` tool annotation… **Tools without this hint are treated as write actions.**" Annotate properly ([`../shared/tool-design.md`](../shared/tool-design.md)) or every read prompts.
- **After you redeploy:** open the connection at `https://chatgpt.com/plugins` → **Refresh** → confirm the advertised metadata changed → start a *new* conversation and re-test. Dev mode also lets you toggle individual tools on/off.
- **Raw debugging:** `https://platform.openai.com/playground` → Tools → Add → MCP Server → enter the HTTPS endpoint and inspect request/response.
- The connection's technical ID is in the browser URL and starts with `plugin_asdk_app`. Keep the exact value. Use [`package.md`](./package.md) to map it into `.app.json`; never invent or commit a placeholder id.

## Package the verified connection only when distribution needs it

A successful live connection is enough for personal use. A repository/local plugin bundle is a separate step: `.codex-plugin/plugin.json`, a real `.app.json` mapping the connection id, and optional skills/assets/local MCP config. Follow [`package.md`](./package.md); do not hand-copy fragments from the public-submission form.

## Private servers: Secure MCP Tunnel

Run `tunnel-client` inside your network; it long-polls OpenAI outbound-only over HTTPS to `api.openai.com:443`, forwards JSON-RPC locally, posts responses back. No inbound firewall holes. Hard limit: **"It does not support public plugin submission or distribution."** ([secure-mcp-tunnels.md](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels.md))

**Yes, the tunnel must exist first**, and the setup is more than a `tunnel_id`:

- Create it in [Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels). Permissions are **organization-level, not project-level**: `Read` to view, `Read` + `Manage` to create, and **`Use`** to run `tunnel-client` or pick the tunnel in the modal. Allow **up to 30 minutes** for a new role assignment to propagate.
- **Associate the tunnel with the target ChatGPT workspace, not only the Platform organization** — this is the documented reason a tunnel fails to appear in the modal. The same `tunnel_id` serves every association; adding one does not create a second tunnel.
- **Control-plane mTLS is optional**, not required: outbound goes to `api.openai.com:443` *"or `mtls.api.openai.com:443` when control-plane mTLS is configured"*.
- Keep `tunnel-client run` healthy while you create or test — discovery and tool calls both depend on it. It exposes `/healthz`, `/readyz`, `/metrics` and a loopback-only admin UI at `/ui`.
- Tunnel lifecycle lands in Platform Audit logs as `tunnel.created` / `tunnel.updated` / `tunnel.deleted`.

## Workspace-only distribution — the middle tier

`https://chatgpt.com/plugins` → **Personal** → three-dot menu on the plugin → **Publish** → specify workspace roles. Requires being a **workspace admin** — *"Only Admins and Owners can publish apps"*, and the help centre routes it through Workspace Settings → Apps → Drafts → Publish. "Publishing a local plugin to your workspace doesn't publish it to the universal public Plugins Directory." Admins can disable it with `features.plugin_sharing = false` in `requirements.toml`. This is the cheapest way to serve a team without review.

Three consequences of publishing to a workspace, all from the [help-centre article](https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta): a published app carries *"the label custom next to the app name"* while a draft carries *"the label Dev"*; *"For Business plans, apps cannot be updated after publishing at launch"* — recreate and republish, while Enterprise/Edu admins can toggle actions afterwards; and the workspace freezes your metadata exactly like directory review does — *"ChatGPT uses a 'frozen' snapshot of its available tools and inputs"*, so *"If the live app no longer matches the frozen snapshot, tool calls can error"* and a non-backward-compatible change needs an admin to refresh the tool actions.

**Codex has no separate registration path.** You register once through ChatGPT settings; the directory is shared. Surface targeting is documented only for a **bundled skill**, which declares it in `skills/<skill>/agents/openai.yaml` under `policy.products` — `CHAT`, `CODEX`, or both ([submission-errors](https://developers.openai.com/plugins/deploy/submission-errors.md)). `TODO: verify` how an MCP-only plugin targets surfaces; no fetched page names a manifest-level equivalent, and an MCP-only submission has no `agents/openai.yaml` to put it in. Review requires *"all test cases pass on the supported ChatGPT and Codex surfaces"*, and deleting the plugin removes it *"from ChatGPT and Codex"* — one artifact, two surfaces.

## Worked example: why it cannot be registered today

`convex/mcp/routes.ts` lines 5–6 say it in the source:

```
// Registered by convex/http.ts. Phase 1 = bearer only; OAuth 2.1 + PKCE is a
// separate, later phase and nothing here needs to change when it lands.
```

Every call needs **two** secrets (`convex/mcp/auth.ts`): `Authorization: Bearer <MCP_API_KEY>` plus `X-Action-API-Key: <agent token>`, with a one-field fallback `Bearer <MCP_API_KEY>:<agent token>` for "clients whose connector form exposes only one credential field". ChatGPT's form exposes **zero** credential fields, so even the fallback has nowhere to go. Claude Code, Cursor and `mcp-remote` carry those headers fine; ChatGPT is the one host that cannot.

Two more facts that would bite at connect time, and one that would not. **Would not:** `registerMcpRoutes` mounts `POST /mcp` on the Convex `*.convex.site` origin and returns **405 on GET** (`convex/mcp/routes.ts:89,106`, "hanya menerima POST JSON-RPC (tanpa SSE)") — that is the spec's own way of saying "no SSE stream here", so it is conformant, not broken. **Would bite:** `initialize` answers `protocolVersion: MCP_PROTOCOL_VERSION` unconditionally (`convex/mcp/jsonrpc.ts:122`) and that constant is `"2024-11-05"` (`convex/mcp/types.ts:8`) — the server never echoes the client's requested revision, and a client that cannot use the answer SHOULD disconnect. And the 401 emits `WWW-Authenticate: Bearer realm="SERVER_NAME", error="invalid_token"` with **no `resource_metadata` parameter** — so nothing points ChatGPT at OAuth discovery. What it already gets right: real annotations (`readOnlyHint` / `destructiveHint` / `idempotentHint`, `openWorldHint: false` throughout) via an `annotations(title, kind)` helper in `convex/mcp/tools.ts`.

Order of work for this server: Phase 2 OAuth per [`../shared/oauth.md`](../shared/oauth.md) → add `resource_metadata` to the 401 → re-check [`../shared/security-checklist.md`](../shared/security-checklist.md) → then step 2 above.
