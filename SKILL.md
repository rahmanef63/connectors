---
name: chatgpt-mcp
description: Add a ChatGPT/Claude/Cursor-controllable MCP server (bearer + OAuth 2.1 PKCE + admin UI) to a Next.js or Convex project so MCP-aware clients can call CRUD tools via natural language. Trigger on /chatgpt-mcp, "add MCP server", "ChatGPT connector", "Claude connector", "OAuth PKCE for MCP", "ChatGPT custom app", "expose tools to ChatGPT", "expose tools to AI", "build MCP for Convex".
---

# ChatGPT MCP Integration (bearer + OAuth 2.1)

Hand-rolled MCP server (~500 LOC, no SDK) + OAuth 2.1 PKCE in front of it so MCP-aware clients (ChatGPT custom apps, Claude.ai web, Cursor, Cline, `mcp-remote` stdio bridge) can talk to it.

Two host shapes are covered:

- **Next.js + custom auth** — single-tenant admin-gated, MCP endpoint at `/api/mcp`, OAuth on Next routes.
- **Convex self-hosted + `@convex-dev/auth`** — multi-user, per-user OAuth + per-user static-bearer tokens, MCP at the SITE origin via `httpRouter`.

The Convex-specific gotchas in the next section bit hard in real deployments — read them first if your backend is Convex.

## Decision tree (run first)

| Need | Build |
|---|---|
| Curl/script automation, internal only | **Phase 1 only** (bearer). 30 min, 1 env var. |
| ChatGPT custom app | **Phase 1 + 2** (bearer + OAuth). ChatGPT form has no API-key field — OAuth mandatory. |
| Production w/ revocable per-user tokens | **Phase 1 + 2 + 3** (admin UI / user-settings UI). |

Always build bearer first — keeps a dev escape hatch after OAuth lands.

## Phase 1 — MCP bearer server

Generate secret: `openssl rand -hex 32`. Set in BOTH places (frontend env + backend env, e.g. Convex `npx convex env set MCP_API_KEY <hex>`).

Files to create (paths from the Next.js shape — adapt for your framework):
- `app/api/mcp/route.ts` — POST handler, JSON-RPC dispatch, bearer check, batched array support
- `frontend/shared/lib/mcp/types.ts` — `JsonRpcRequest|Response`, `ToolDef`, `RPC_ERROR` constants
- `frontend/shared/lib/mcp/server.ts` — `dispatchJsonRpc()` handling `initialize`, `notifications/*`, `ping`, `tools/list`, `tools/call`
- `frontend/shared/lib/mcp/auth.ts` — `extractBearer`, `tokenMatches` (constant-time-ish), `isAuthorized`
- `frontend/shared/lib/mcp/context.ts` — `AsyncLocalStorage` for per-request token
- `frontend/shared/lib/mcp/backend-client.ts` — `mcpQuery`, `mcpAdminMutation` pulling token from ALS
- `frontend/shared/lib/mcp/tools/<surface>.ts` — one file per domain (`pages.ts`, `databases.ts`, ...)

For Convex backend, the equivalent files are:
- `convex/http.ts` — `httpRouter` route for `POST /mcp`
- `convex/mcp/jsonrpc.ts` — dispatcher + tool catalog
- `convex/mcp/internal.ts` — internal queries/mutations that take `userId` arg
- `convex/mcp/wellKnown.ts` — `.well-known/*` httpActions
- `convex/_shared/pkce.ts` — PKCE helpers (S256, base64url)

Protocol version: `"2024-11-05"`. Server caps: `{ tools: { listChanged: false } }`. Notifications (id null/undefined) → return `null` → respond 202.

**Tool errors stay inside `result`** with `isError: true` + text content. Never bubble handler exceptions to JSON-RPC `error` — ChatGPT hides protocol errors from the user.

Tool annotation semantics ChatGPT acts on: `readOnlyHint` (skip confirmation), `destructiveHint` (extra confirmation), `idempotentHint` (safe retry), `openWorldHint` (touches external svc).

Snake_case tool names. Descriptions are model-facing — write them like prompt context: include slug rules, default behaviour, when to flip booleans. `"Create a blog post. Slug must be unique kebab-case. Set published=true to make it live."` beats `"Create blog post"`.

Smoke test:
```bash
curl -X POST $BASE/api/mcp \
  -H "authorization: Bearer $MCP_API_KEY" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
# then tools/list, then tools/call
```

## Phase 2 — OAuth 2.1 + PKCE

ChatGPT custom-app form only offers OAuth dropdown. Use **User-Defined Client** registration (no DCR/CIMD needed).

Flow: `consent page → mint code (5-min TTL, PKCE S256 challenge stored) → ChatGPT POSTs /api/oauth/token w/ code_verifier → validate PKCE → mint access_token (1-year, revocable)`.

Schema (two tables):
- `oauthCodes` — `code, codeChallenge, codeChallengeMethod, redirectUri, clientId, scope, resource, userId, expiresAt, consumed, createdAt`. Index `by_code`.
- `oauthAccessTokens` — `token, userId, clientId, scope, resource, expiresAt, createdAt, lastUsedAt, revokedAt, label`. Index `by_token`.

PKCE helpers (`pkce.ts`): `sha256Base64Url`, `randomHex`, `verifyPkce`. Base64url = `+→-`, `/→_`, strip `=`. Reject `plain` method. Verifier 43-128 chars (RFC 7636 §4.1).

Routes:
- `app/oauth/authorize/page.tsx` — client component, reads current user from your auth context, calls `createCode` mutation, redirects to `redirect_uri?code=...&state=...`. Bounces to `/login?next=` when unauthed.
- `app/oauth/layout.tsx` — wrap in the same providers that the auth tree uses. **Otherwise `useAuth must be used within AuthProvider` throws** (pitfall #1).
- `app/api/oauth/token/route.ts` — accept `application/x-www-form-urlencoded` AND `application/json`. Validate `grant_type=authorization_code`, all required fields, return OAuth error codes (`invalid_grant`, `invalid_request`, `unsupported_grant_type`).
- `app/.well-known/oauth-authorization-server/route.ts` — RFC 8414 metadata. `revalidate = 3600`.
- `app/.well-known/oauth-protected-resource/route.ts` — RFC 9728 metadata.

`exchangeCode` mutation must **patch `consumed: true` BEFORE inserting the token** — otherwise a retry races and double-issues.

Extend `requireAuth` (or `requireAdmin`, depending on your model) to accept multiple token types:
1. `MCP_API_KEY` env match → synthetic service-account user
2. Existing session row (admin or regular user)
3. `oauthAccessTokens` row where `!revokedAt && expiresAt >= now` → look up the linked user

AsyncLocalStorage pattern (Next.js): route handler calls `setMcpContext({ token: bearer })` before dispatch; `mcpAdminMutation` reads via `getMcpToken()`. Eliminates threading bearer through every handler.

Convex equivalent: resolve `userId` from bearer in the route handler ONCE, then call **internal mutations** that take `userId: v.id("users")` as an explicit arg + check ownership inline (`if (doc.userId !== args.userId) throw`). Convex isolate has no ALS-equivalent that survives across mutation hops.

## Phase 3 — Admin / Settings UI

Three sections:
1. **Setup card** — copy-to-clipboard fields matching ChatGPT form labels verbatim (MCP Server URL, Auth URL, Token URL, Resource, Client ID hint, "leave Secret empty"). Eliminates separate onboarding doc. Pro UX: tabs per MCP client (ChatGPT / Claude / Others) — each tab shows that client's setup recipe (web OAuth flow, JSON config snippet for desktop apps using `mcp-remote`, etc.).
2. **Tokens table** — masked preview (`abc12345…ef9d`), status badge (active/expired/revoked), `createdAt`, `lastUsedAt`, `expiresAt`, Revoke button.
3. **Env note** — call out `MCP_API_KEY` exists as dev fallback (not in table).

`adminList` (or `listMine` for per-user) query **strips raw token values** — only returns `tokenPreview = token.slice(0,8) + "…" + token.slice(-4)`. Token material never leaves DB.

For per-user (not admin-only) mode: the same UI lives under user settings instead of admin. Tokens table filters by current `userId` via a `by_user` index.

## ChatGPT connector form (exact mapping)

Settings → Connectors → New App:

| Field | Value |
|---|---|
| MCP Server URL | `https://MCP_ORIGIN/mcp` (on Convex this is the SITE origin) |
| Authentication | `OAuth` |
| Registration method | `User-Defined OAuth Client` |
| Client ID | any string (`chatgpt-yourapp`) |
| Client Secret | *empty* |
| Token endpoint auth method | `none` |
| Auth URL | `https://FRONTEND/oauth/authorize` |
| Token URL | `https://FRONTEND/api/oauth/token` |
| Authorization server base | `https://FRONTEND` |
| Resource | `https://MCP_ORIGIN/mcp` |

**Verify discovery before clicking Create** — curl both `.well-known/*` endpoints. If they 404, route files in wrong place (note: `.well-known` is a literal `app/` folder in Next.js).

## Convex-specific (read FIRST if backend = Convex self-hosted)

These are NOT in the Next.js-only recipe.

1. **SITE vs CLOUD origin split** — Self-hosted Convex exposes TWO domains. `api-<app>.<host>` = CLOUD (queries + mutations only). `site-<app>.<host>` = SITE (where `httpRouter` mounts — `/mcp`, `/.well-known/*`, custom `httpAction` routes). The MCP URL advertised to ChatGPT MUST be the **SITE** origin. The CLOUD origin will 404 for `/mcp`. Memory hook: api = data, site = HTTP.

2. **`.well-known/*` MUST live at MCP origin (= SITE origin on Convex)** — RFC 9728. ChatGPT's first discovery probe is at the MCP URL's host. If you only mirror the JSON at your frontend host, ChatGPT throws "MCP server does not implement OAuth". Mirror PR + AS metadata at the SITE origin too (both — some clients fetch both well-knowns at resource origin):

   ```ts
   // convex/mcp/wellKnown.ts
   export const protectedResourceMetadata = httpAction(async () => json({
     resource: "https://site-<app>.<host>/mcp",
     authorization_servers: ["https://<frontend>"],
     scopes_supported: ["mcp.read", "mcp.write"],
     bearer_methods_supported: ["header"],
   }));
   // Wire in convex/http.ts:
   //   http.route({ path: "/.well-known/oauth-protected-resource", method: "GET", handler: ... });
   //   http.route({ path: "/.well-known/oauth-authorization-server", method: "GET", handler: ... });
   ```

3. **Convex `internalMutation` rejects dynamic imports** — `await import("./_shared/markdown")` throws `dynamic module import unsupported` inside internal mutations even though it works in public mutations (different bundling path). Always use STATIC top-level imports in internal mutations. Won't surface until first call.

4. **`requireAuth` is empty in MCP context** — Bearer auth is resolved in the HTTP layer; the action's `getAuthUserId(ctx)` returns null because there's no `@convex-dev/auth` session cookie. Public mutations that call `requireAuth` throw "Not signed in". Pattern: resolve `userId` from bearer once in the route handler, then call **internal** mutations that take `userId: v.id("users")` as an explicit arg + check ownership inline.

5. **Stamp `workspaceId` on every insert (multi-workspace apps)** — Sidebar/library filter via `by_workspace` index. MCP-created pages/rows/databases without `workspaceId` exist on disk but are INVISIBLE in the UI. Use a `getActiveWorkspaceMutation(ctx, userId)` helper that resolves saved active OR falls back to personal + auto-creates personal if missing. Apply to every `createPage`, `createRow`, `createDatabase`, `duplicatePage` etc.

6. **Property-name ↔ id translation in dispatcher (database-shaped tools)** — Notion-style DB props have stable internal `id` but the LLM thinks by property `name`. Dispatcher needs a `mapPropsByName()` helper that translates both directions. Title is special — usually stored on the page record, NOT in `rowProps`. Route it out separately.

7. **Block-aware tools for editor primitives** — Some features can't be markdown:
    - **Inline database embed** → `pages_embed_database(pageId, dbId)` inserts a `database` block. The LLM WILL default to markdown table without this.
    - **Side-by-side columns** → `pages_append_columns(pageId, columns: string[])` creates a `layouts` entry + stamps each column's blocks with `layoutGroup` + `layoutCol`. Without this the AI stacks everything vertically.
    - **One-shot composite** → `databases_create_inline(pageId, name, properties)` does create + embed in one call. Reduces partial-failure surface.

8. **Per-resource native CRUD beats one mega-tool** — Don't try to satisfy databases via `pages_*`. Separate native surfaces: `pages_*`, `databases_*`, `database_rows_*`. Each tool has narrow blast radius, clear hint annotations, focused description.

## LLM steering via tool descriptions

Tool descriptions are model prompt context — not docs. The LLM reads them every call and uses them to PICK the right tool. Without explicit "when-to-use" cues, it defaults to the most-obvious tool (usually wrong).

Rules:
- Each description includes ONE WHEN-TO-USE sentence + ONE WHEN-NOT-TO-USE sentence when an ambiguous sibling exists.
- Steer OFF wrong defaults explicitly: `pages_append_markdown` description says *"markdown tables become STATIC blocks — for real DB use databases_create_inline. For side-by-side layout use pages_append_columns."*
- Hint default behaviour: *"DEFAULT to columns for any list-of-N comparable items instead of stacking vertically."*
- For composite tools, name the failure mode being prevented: *"ONE-SHOT — skips the create→get→append chain that strands the page empty when append fails."*
- Annotate enums in description: select-option lists, status defaults, slug format.

## Pagination + response-shape symmetry

Bug pattern: tool returns `nextCursor` but the inputSchema doesn't accept `cursor`. Decorative nonsense — client can never paginate.

Rule: tool inputSchema, dispatcher arg pass-through, and handler validator must agree on **arg name, type, AND nullability**. Same for response — dispatcher destructure must match handler return EXACTLY (`{items, nextCursor, total}` vs hallucinated `{results, cursor}`). TypeScript won't catch this since the field access is `.results` on `any`. First real client call exposes it as "validation/internal error inconsistent" from the LLM's perspective.

Contract:
```
inputSchema:  { cursor?: number; limit?: number }
dispatcher:   passes through, clamps limit to 1..100, defaults cursor to 0
handler:      args: { userId, cursor?: number, pageSize?: number }   ← name match!
returns:      { items, nextCursor: number|null, total }
dispatcher:   destructures { items, nextCursor, total } and maps verbatim
```

## Anti-abuse layering

Multi-user MCP is a cost-attack surface (entity spam + AI token burn). Layer:
- **Per-minute burst** — `rateLimits` table per `(userId, scope)`. e.g. `pages.create: 60/min`.
- **Per-day cap** — second `rateLimits` bucket with `windowMs: 86_400_000`. e.g. `pages.create.day: 800/day`. Stops slow-brute pacing under the burst cap.
- **AI token quota** — separate `aiTokenUsage` table keyed by `(userId, dayKey)`. Check BEFORE invoking upstream LLM, record after each hop. Default e.g. 200k tokens/day, env-tunable (`AI_DAILY_TOKEN_CAP`).

Sizing: daily ≈ 10× heaviest legitimate user. Per-minute unchanged.

## Pitfalls (the 16 we hit)

1. **AuthProvider scope** — `/oauth/*` outside admin tree → add `app/oauth/layout.tsx` mounting your auth providers. Do NOT hoist provider into root layout (drags websocket onto marketing pages).
2. **Browser extensions** — Perplexity/Grammarly inject inline content blocked by CSP. Verify in incognito before debugging.
3. **Env in two places** — `MCP_API_KEY` must exist in Next runtime AND in backend isolate (Convex env). Missing one → 401 from MCP OR "session invalid" from mutations.
4. **PKCE method** — refuse `plain`, S256 only.
5. **Verifier length** — 43..128, reject outside.
6. **base64url ≠ base64** — `+→-`, `/→_`, strip `=`. Standard base64 silently produces wrong challenges.
7. **Consume code before mint** — patch `consumed:true` first, insert token second.
8. **Tool errors → `result.isError`** — NOT JSON-RPC `error` object.
9. **AsyncLocalStorage > prop drilling (Next)** — skip ALS and every handler threads bearer manually. For Convex, equivalent is "resolve `userId` from bearer in route handler, pass to internal mutations as arg".
10. **Discovery cache headers** — `cache-control: public, max-age=3600` on `.well-known/*`.
11. **MCP URL must be SITE origin on Convex self-hosted** — `api-*` is queries-only; httpActions live at `site-*`. Wrong URL → 404 on first call → ChatGPT says "MCP server does not implement OAuth".
12. **`.well-known/*` MUST mirror at MCP origin** — Frontend copy alone is insufficient. ChatGPT probes resource host first. Symptom matches #11.
13. **Convex internal mutations cannot dynamic-import** — Static top-level only. Symptom: "dynamic module import unsupported" at first tool call.
14. **Read-tool args validator drift** — Dispatcher missing `userId` arg to ownership-scoped queries throws Convex `ArgumentValidationError` → "validation/internal error". Pass every required arg explicitly.
15. **Response shape symmetry** — Handler returns `{items, nextCursor, total}` but dispatcher destructures `{results, cursor}` → `.map of undefined`. TypeScript doesn't catch because `any`. Test with a real call before declaring done.
16. **Missing `workspaceId` on inserts = invisible rows** — Sidebar/library filter via `by_workspace`; rows with `undefined` workspaceId vanish from UI even though they exist. Auto-stamp via `getActiveWorkspaceMutation`.

## "Always allow" — what's possible

MCP spec has NO server-side flag for `alwaysAllow` / `skipUserConfirmation`. Approval is host UX (ChatGPT/Claude/Cursor each have their own).

What CAN steer client policy:
- `readOnlyHint: true` → reads usually skip approval entirely
- `idempotentHint: true` + `destructiveHint: false` → many clients auto-approve after first "always allow" click
- `destructiveHint: true` → always prompts (correct — matches blast radius)
- Snake_case + narrow tool names → fewer mega-tools = less reason to wrap in "review every call"

User clicks "always allow this tool" in client UI once per tool. That's the actual mechanism — no bypass.

## Security checklist (verify before opening to ChatGPT)

- [ ] `MCP_API_KEY` ≥ 32 hex chars
- [ ] Bearer compare constant-time-ish (same-length first)
- [ ] PKCE verifier 43..128, S256 only
- [ ] `redirect_uri` HTTPS-validated at consent page + host allowlist for known clients (chatgpt.com / chat.openai.com / platform.openai.com)
- [ ] Auth codes single-use, ≤5 min TTL
- [ ] Access tokens have `expiresAt` + `revokedAt`
- [ ] `adminList`/`listMine` returns preview only, never raw token
- [ ] OAuth tokens re-validated as active on every check
- [ ] 401 response includes `www-authenticate: Bearer realm="..."` + `resource_metadata` hint
- [ ] No raw secrets in tool handler output
- [ ] Service-account env bypass opt-in (skip when env unset)
- [ ] Per-minute + per-day rate limits on every write tool
- [ ] AI token quota per user per day if any tool fans out to an LLM

## Adaptation notes

- **Different DB** — Drizzle/Prisma/Supabase. PKCE/token logic DB-agnostic; need `byToken` + `byCode` lookups + atomic `consumed` patch.
- **Different framework** — Hono/Express/SvelteKit. MCP endpoint is just `POST(json) → json`. Same dispatcher works.
- **Bun** — ALS API identical. **Cloudflare Workers** — needs nodejs compat shim for ALS.
- **Multi-tenant** — scope `userId` to tenant, add `tenantId` to ALS context (or arg on Convex), filter tool queries by tenant from token.
- **Per-user (not admin-only)** — switch `createCode` from `requireAdmin` to `requireAuth`. Every authed user mints OAuth codes for their own scope. `revokeToken` becomes owner-check (`row.userId === me`) instead of admin. Tokens query becomes `listMine` (filter by_user index) instead of `adminList`.
- **No admin auth** — build email+password (bcrypt/argon2/PBKDF2) first; consent page needs someone to authorize on behalf of.
- **Editor-style apps** — add block-aware tools the LLM can't fake via markdown: inline DB embed, column layouts, mention insertion, snapshot, slash-command shortcuts. Each as its own narrow tool with WHEN-TO-USE description.

## Tool catalog template (start here)

Read-only (`readOnlyHint:true`):
- `<resource>_list({cursor?, limit?}) → {items, nextCursor, total}`
- `<resource>_get({id}) → {…full doc}`
- `<resource>_search({query, limit?}) → {results[]}`

Mutating, idempotent (`idempotentHint:true`):
- `<resource>_set_<field>({id, value})` — narrow per-field setters beat one `_update` mega-tool

Mutating, non-idempotent:
- `<resource>_create({…required, …optional}) → {id}`
- `<resource>_create_inline({parentId, …}) → {id, blockId}` (composite one-shot)
- `<resource>_append_<thing>({id, …}) → {id, …Count}`

Destructive (`destructiveHint:true`):
- `<resource>_trash({id})` — soft-delete, recoverable
- Reserve hard-delete for admin surface; never expose to MCP unless explicit.

For databases:
- Always add `<entity>_set_schema` (add property) NOT `_update_property` (broad).
- Always map property NAME↔id in dispatcher; never expose internal `id` to LLM.

## Reference links

- MCP spec 2025-11-25: https://modelcontextprotocol.io/specification/2025-11-25
- MCP authorization: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- OpenAI Apps SDK: https://developers.openai.com/apps-sdk
- Apps SDK auth: https://developers.openai.com/apps-sdk/build/auth
- RFC 7636 PKCE: https://datatracker.ietf.org/doc/html/rfc7636
- RFC 8414 AS Metadata: https://datatracker.ietf.org/doc/html/rfc8414
- RFC 9728 Protected Resource Metadata: https://datatracker.ietf.org/doc/html/rfc9728
- `mcp-remote` (HTTP → stdio bridge for Claude Desktop / etc.): https://www.npmjs.com/package/mcp-remote
