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

*TODO: verify* — the exact field labels in the connect modal. The docs name only **Connection** and **Tunnel**; the auth selector's labels and what "static credentials" means concretely (presumably a client ID / client secret pair) are never shown.

## Gate 2 — entitlement

| Requirement | Value | Source |
|---|---|---|
| Plan | "Available to Pro, Plus, Business, Enterprise, and Education accounts **on the web**." | [developer-mode.md](https://developers.openai.com/api/docs/guides/developer-mode.md) |
| Policy | "Developer mode availability can depend on account and workspace policy." | [connect-chatgpt.md](https://developers.openai.com/plugins/deploy/connect-chatgpt.md) |
| Risk label | Flagged **"Elevated risk"** | [developer-mode.md](https://developers.openai.com/api/docs/guides/developer-mode.md) |

*TODO: verify* — whether Free is actually excluded (the line lists eligible plans but never excludes Free), and whether the mobile/desktop apps can register at all ("on the web" is all that is said).

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

*TODO: verify* — whether a POST-only JSON-RPC endpoint that never opens an SSE stream and holds no session is accepted. No fetched page states the minimum subset of streamable HTTP required. *TODO: verify* — whether `protocolVersion "2024-11-05"` is accepted; no page states a minimum revision.

## Using it, and iterating

- **Test a personal plugin:** `https://chatgpt.com/plugins?view=personal` → open it → plus button to install → back to `https://chatgpt.com` → switch the top tab from **Chat** to **Work** → new Work chat → type `@` and pick the plugin. Alternatively, choose **Developer mode** from the Plus menu and select apps for that conversation.
- **Confirmations:** "Write actions by default require confirmation… We respect the `readOnlyHint` tool annotation… **Tools without this hint are treated as write actions.**" Annotate properly ([`../shared/tool-design.md`](../shared/tool-design.md)) or every read prompts.
- **After you redeploy:** open the connection at `https://chatgpt.com/plugins` → **Refresh** → confirm the advertised metadata changed → start a *new* conversation and re-test. Dev mode also lets you toggle individual tools on/off.
- **Raw debugging:** `https://platform.openai.com/playground` → Tools → Add → MCP Server → enter the HTTPS endpoint and inspect request/response.
- The connection's technical ID is in the browser URL and starts with `plugin_asdk_app`. Keep it — the built-in `@plugin-creator` skill takes it when you later scaffold for [`publish.md`](./publish.md).

## Private servers: Secure MCP Tunnel

Run `tunnel-client` inside your network; it long-polls OpenAI outbound-only over HTTPS to `api.openai.com:443`, forwards JSON-RPC locally, posts responses back. No inbound firewall holes. Hard limit: **"It does not support public plugin submission or distribution."** ([secure-mcp-tunnels.md](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels.md)) *TODO: verify* — whether the connect modal needs anything beyond selecting **Tunnel** and supplying a `tunnel_id` (prior tunnel creation, control-plane mTLS).

## Workspace-only distribution — the middle tier

`https://chatgpt.com/plugins` → **Personal** → three-dot menu on the plugin → **Publish** → specify workspace roles. Requires being a **workspace admin**. "Publishing a local plugin to your workspace doesn't publish it to the universal public Plugins Directory." Admins can disable it with `features.plugin_sharing = false` in `requirements.toml`. This is the cheapest way to serve a team without review.

*TODO: verify* — whether Codex has a separate registration path for a personal MCP server. The directory is shared, but registration is documented only through ChatGPT settings.

## Worked example: why TemanUsaha AI cannot be registered today

`/home/rahman/projects/codex/convex/mcp/routes.ts` lines 5–6 say it in the source:

```
// Registered by convex/http.ts. Phase 1 = bearer only; OAuth 2.1 + PKCE is a
// separate, later phase and nothing here needs to change when it lands.
```

Every call needs **two** secrets (`convex/mcp/auth.ts`): `Authorization: Bearer <MCP_API_KEY>` plus `X-Action-API-Key: <agent token>`, with a one-field fallback `Bearer <MCP_API_KEY>:<agent token>` for "clients whose connector form exposes only one credential field". ChatGPT's form exposes **zero** credential fields, so even the fallback has nowhere to go. Claude Code, Cursor and `mcp-remote` carry those headers fine; ChatGPT is the one host that cannot.

Three more facts that would bite at connect time: `registerMcpRoutes` mounts `POST /mcp` on the Convex `*.convex.site` origin and returns **405 on GET** ("hanya menerima POST JSON-RPC (tanpa SSE)"), `MCP_PROTOCOL_VERSION = "2024-11-05"` (`convex/mcp/types.ts:8`), and the 401 emits `WWW-Authenticate: Bearer realm="asisten-pribadi-mcp", error="invalid_token"` with **no `resource_metadata` parameter** — so nothing points ChatGPT at OAuth discovery. What it already gets right: real annotations (`readOnlyHint` / `destructiveHint` / `idempotentHint`, `openWorldHint: false` throughout) via an `annotations(title, kind)` helper in `convex/mcp/tools.ts`.

Order of work for this server: Phase 2 OAuth per [`../shared/oauth.md`](../shared/oauth.md) → add `resource_metadata` to the 401 → re-check [`../shared/security-checklist.md`](../shared/security-checklist.md) → then step 2 above.
