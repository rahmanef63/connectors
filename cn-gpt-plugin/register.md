# register.md — your own MCP server, your own ChatGPT

**Scope:** PATH A only — ChatGPT **developer mode**. Connecting an already-deployed MCP server so *you* (and optionally your workspace) can call it. Nothing here makes it installable by strangers; that is [`publish.md`](./publish.md).
**Assumes:** the server answers JSON-RPC over public HTTPS at a stable URL ending in `/mcp`, and you have read [`../cn-mcp-core/README.md`](../cn-mcp-core/README.md).

## Do this in order

1. Check the two gates below. If auth fails, stop — the UI will not save you.
2. **Settings → Security and login → turn on Developer mode.** (Stated identically on [quickstart.md](https://developers.openai.com/plugins/quickstart.md), [deploy/connect-chatgpt.md](https://developers.openai.com/plugins/deploy/connect-chatgpt.md), [build/plugins.md](https://developers.openai.com/plugins/build/plugins.md).)
3. Go to `https://chatgpt.com/plugins`, select the **plus button**. "The plus button will only create developer-mode apps after you turn on Developer mode."
4. Enter a user-facing **name and description**.
5. Under **Connection**, either enter the MCP server URL **including the `/mcp` path**, or select **Tunnel** and pick a tunnel / enter its `tunnel_id`.
6. Create the connection, then review the tools and metadata ChatGPT discovered.
7. The draft lands under **Drafts** in app settings. Test it (see below).

## Gate 1 — auth. Read before anything else

The form offers exactly: **OAuth, No Authentication, and Mixed Authentication** ([developer-mode.md](https://developers.openai.com/api/docs/guides/developer-mode.md)). And:

> "ChatGPT does not support machine-to-machine OAuth grants such as client credentials, service accounts, or JWT bearer assertions, **nor can it present custom API keys** or customer-provided mTLS certificates." — [build/auth.md](https://developers.openai.com/plugins/build/auth.md)

| Your server's auth today | Option to pick | Verdict |
|---|---|---|
| OAuth 2.1 + PKCE (S256) | **OAuth** | Works. Build it per [`../shared/oauth.md`](../shared/oauth.md). |
| Static bearer, or any custom header | *(none exists)* | **Blocked.** There is nowhere to type it. |
| Genuinely public, read-only tools | **No Authentication** | Works. Only if leaking every tool result to anyone who finds the URL is fine. |
| Public discovery + authenticated tools | **Mixed Authentication** | `initialize` and list-tools run unauthenticated; each tool uses OAuth or no auth per its own `securitySchemes`. |

For OAuth: "if static credentials are provided, then they will be used. Otherwise, ChatGPT can use Client ID Metadata Documents when the authorization server advertises support… ChatGPT can also use DCR when configured." CIMD supports `none` and `private_key_jwt` token-endpoint auth. Redirect URI is `https://chatgpt.com/connector/oauth/{callback_id}`.

**Both halves or no linking UI:** the OAuth prompt appears only when you ship per-tool `securitySchemes` **and** return a runtime error carrying `_meta["mcp/www_authenticate"]` with both `error` and `error_description`. "Without both halves ChatGPT will not show the linking UI for that tool." Details in [`../shared/oauth.md`](../shared/oauth.md).

The modal, step by step ([connect-chatgpt](https://developers.openai.com/plugins/deploy/connect-chatgpt.md)): plus button → user-facing **name and description** → under **Connection**, either paste the MCP server URL *including the `/mcp` path*, or select **Tunnel** and choose an available tunnel / enter its `tunnel_id` → **Create the connection** → review the tools and metadata discovered from the server. There is no auth selector in the modal: auth is **discovered**, not declared.

"Static credentials" means an OAuth client ID and secret you supply. [developer-mode](https://developers.openai.com/api/docs/guides/developer-mode.md): *"For OAuth, if static credentials are provided, then they will be used. Otherwise, ChatGPT can use Client ID Metadata Documents when the authorization server advertises support and the app creator chooses CIMD."* CIMD covers public-client exchange (`none`) and signed client assertion (`private_key_jwt`); **DCR remains supported when configured**. So three registration routes, in ChatGPT's own order of preference: static → CIMD → DCR.

## Gate 2 — entitlement

| Requirement | Value | Source |
|---|---|---|
| Plan | "Available to Pro, Plus, Business, Enterprise, and Education accounts **on the web**." | [developer-mode.md](https://developers.openai.com/api/docs/guides/developer-mode.md) |
| Policy | "Developer mode availability can depend on account and workspace policy." | [connect-chatgpt.md](https://developers.openai.com/plugins/deploy/connect-chatgpt.md) |
| Risk label | Flagged **"Elevated risk"** | [developer-mode.md](https://developers.openai.com/api/docs/guides/developer-mode.md) |

Settled: *"Available to Pro, Plus, Business, Enterprise, and Education accounts **on the web**."* Free is absent from that list, and the list is the eligibility statement — so Free is out. **Web only**: registration is not available in the mobile or desktop apps. And it is not purely a plan question — *"Developer mode availability can depend on account and workspace policy"*, with Enterprise/Edu needing a workspace admin to grant it before the user can flip the switch.

## What ChatGPT demands that Claude Code and Cursor do not

| Requirement | ChatGPT | Claude Code / Cursor |
|---|---|---|
| A global toggle before you can add anything | **Developer mode** | no equivalent |
| Paid plan, web surface | yes | any account, local |
| Auth | OAuth / none / mixed **only** | paste any header you like |
| Reachability | public HTTPS, or Secure MCP Tunnel | `localhost` and `stdio` are fine |
| Metadata changes | explicit **Refresh** step | reconnect and it re-lists |

Full per-host comparison: [`../shared/clients.md`](../shared/clients.md).

## Transport

"Supported MCP protocols: **SSE and streaming HTTP**." Elsewhere: "Respond at a stable URL, typically ending in `/mcp`." Search/fetch tools are **not** required in developer mode — they matter only for company-knowledge eligibility. See [`../shared/transport.md`](../shared/transport.md).

TODO: verify — whether a POST-only JSON-RPC endpoint that never opens an SSE stream and holds no session is accepted, and whether `protocolVersion "2024-11-05"` still is. Searched every plugins and api/docs page: the strongest statements are *"Supported MCP protocols: SSE and streaming HTTP"* and *"Support the MCP streamable HTTP transport"* ([build/mcp-server](https://developers.openai.com/plugins/build/mcp-server.md)). Neither names a minimum protocol revision or a required subset. Empirical check beats guessing here: point [MCP Inspector](https://developers.openai.com/plugins/build/mcp-server.md) at your endpoint with **Streamable HTTP** selected before you register.

## Using it, and iterating

- **Test a personal plugin:** `https://chatgpt.com/plugins?view=personal` → open it → plus button to install → back to `https://chatgpt.com` → switch the top tab from **Chat** to **Work** → new Work chat → type `@` and pick the plugin. Alternatively, choose **Developer mode** from the Plus menu and select apps for that conversation.
- **Confirmations:** "Write actions by default require confirmation… We respect the `readOnlyHint` tool annotation… **Tools without this hint are treated as write actions.**" Annotate properly ([`../shared/tool-design.md`](../shared/tool-design.md)) or every read prompts.
- **After you redeploy:** open the connection at `https://chatgpt.com/plugins` → **Refresh** → confirm the advertised metadata changed → start a *new* conversation and re-test. Dev mode also lets you toggle individual tools on/off.
- **Raw debugging:** `https://platform.openai.com/playground` → Tools → Add → MCP Server → enter the HTTPS endpoint and inspect request/response.
- The connection's technical ID is in the browser URL and starts with `plugin_asdk_app`. Keep it — the built-in `@plugin-creator` skill takes it when you later scaffold for [`publish.md`](./publish.md).

## Private servers: Secure MCP Tunnel

Run `tunnel-client` inside your network; it long-polls OpenAI outbound-only over HTTPS to `api.openai.com:443`, forwards JSON-RPC locally, posts responses back. No inbound firewall holes. Hard limit: **"It does not support public plugin submission or distribution."** ([secure-mcp-tunnels.md](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels.md))

**Yes, the tunnel must exist first**, and the setup is more than a `tunnel_id`:

- Create it in [Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels). Permissions are **organization-level, not project-level**: `Read` to view, `Read` + `Manage` to create, and **`Use`** to run `tunnel-client` or pick the tunnel in the modal. Allow **up to 30 minutes** for a new role assignment to propagate.
- **Associate the tunnel with the target ChatGPT workspace, not only the Platform organization** — this is the documented reason a tunnel fails to appear in the modal. The same `tunnel_id` serves every association; adding one does not create a second tunnel.
- **Control-plane mTLS is optional**, not required: outbound goes to `api.openai.com:443` *"or `mtls.api.openai.com:443` when control-plane mTLS is configured"*.
- Keep `tunnel-client run` healthy while you create or test — discovery and tool calls both depend on it. It exposes `/healthz`, `/readyz`, `/metrics` and a loopback-only admin UI at `/ui`.
- Tunnel lifecycle lands in Platform Audit logs as `tunnel.created` / `tunnel.updated` / `tunnel.deleted`.

## Workspace-only distribution — the middle tier

`https://chatgpt.com/plugins` → **Personal** → three-dot menu on the plugin → **Publish** → specify workspace roles. Requires being a **workspace admin**. "Publishing a local plugin to your workspace doesn't publish it to the universal public Plugins Directory." Admins can disable it with `features.plugin_sharing = false` in `requirements.toml`. This is the cheapest way to serve a team without review.

**Codex has no separate registration path.** You register once through ChatGPT settings and target surfaces declaratively: the submission manifest's `policy.products` takes `CHAT`, `CODEX`, or both ([submission-errors](https://developers.openai.com/plugins/deploy/submission-errors.md)). Review requires *"all test cases pass on the supported ChatGPT and Codex surfaces"*, and deleting the plugin removes it *"from ChatGPT and Codex"* — one artifact, two surfaces.

## Worked example: why TemanUsaha AI cannot be registered today

`/home/rahman/projects/codex/convex/mcp/routes.ts` lines 5–6 say it in the source:

```
// Registered by convex/http.ts. Phase 1 = bearer only; OAuth 2.1 + PKCE is a
// separate, later phase and nothing here needs to change when it lands.
```

Every call needs **two** secrets (`convex/mcp/auth.ts`): `Authorization: Bearer <MCP_API_KEY>` plus `X-Action-API-Key: <agent token>`, with a one-field fallback `Bearer <MCP_API_KEY>:<agent token>` for "clients whose connector form exposes only one credential field". ChatGPT's form exposes **zero** credential fields, so even the fallback has nowhere to go. Claude Code, Cursor and `mcp-remote` carry those headers fine; ChatGPT is the one host that cannot.

Three more facts that would bite at connect time: `registerMcpRoutes` mounts `POST /mcp` on the Convex `*.convex.site` origin and returns **405 on GET** ("hanya menerima POST JSON-RPC (tanpa SSE)"), `MCP_PROTOCOL_VERSION = "2024-11-05"` (`convex/mcp/types.ts:8`), and the 401 emits `WWW-Authenticate: Bearer realm="asisten-pribadi-mcp", error="invalid_token"` with **no `resource_metadata` parameter** — so nothing points ChatGPT at OAuth discovery. What it already gets right: real annotations (`readOnlyHint` / `destructiveHint` / `idempotentHint`, `openWorldHint: false` throughout) via an `annotations(title, kind)` helper in `convex/mcp/tools.ts`.

Order of work for this server: Phase 2 OAuth per [`../shared/oauth.md`](../shared/oauth.md) → add `resource_metadata` to the 401 → re-check [`../shared/security-checklist.md`](../shared/security-checklist.md) → then step 2 above.
