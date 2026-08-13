# OAuth 2.1 + PKCE for MCP

**Scope:** the implementable OAuth 2.1 + PKCE S256 recipe — flow, the two digest-only tables, exchange ordering, routes, consent page, rate limits.
**Assumes:** Phase 1 is live and you are targeting a host whose form exposes no credential field (ChatGPT, Claude.ai). Budget ~3 hours the first time.

Those hosts require this; Cursor, Claude Code and `mcp-remote` do not — they take an arbitrary header from config.

## Flow

```
consent page (human approves)
  → mint code: short TTL, PKCE S256 challenge stored, bound to client_id + redirect_uri
  → client POSTs /oauth/token with code + code_verifier
  → verify PKCE, delete the code row, mint access token
  → token returned ONCE
```

## Two tables, both digest-only

**Auth codes** — `codeHash, codeChallenge, codeChallengeMethod, redirectUri, clientId, scope, userId, expiresAt`. Index by `codeHash`. TTL ≤5 min; 60s is plenty and shrinks the window on a captured redirect.

**Access tokens** — `tokenHash, userId, clientId, scope, expiresAt, createdAt, lastUsedAt, revokedAt, label`. Index by `tokenHash`.

Store **sha256 of both**. The raw code exists only in flight between the redirect and the exchange; the raw token is shown once at mint. Consequences worth stating out loud: a database dump holds no usable credential, and your admin list has nothing to redact — so drop the "token preview" column, it only ever existed because the raw value was in the row.

## PKCE

Helpers: `sha256Base64Url`, `randomHex`, `verifyPkce`. Base64url is `+→-`, `/→_`, strip `=` — standard base64 silently produces wrong challenges and you will chase it for an hour.

- **S256 only.** Refuse `plain`.
- **Verifier length 43..128** (RFC 7636 §4.1). Check it *before* hashing: a verifier outside that range can never be the one that produced the challenge.
- Compare in constant time.

## exchangeCode: delete before mint

```
find code row by sha256(code)     → miss? invalid_grant
DELETE the row                     ← first, always
expired / client mismatch / redirect mismatch / PKCE mismatch → invalid_grant
insert token row (hashed)
return { access_token, token_type: "Bearer", expires_in, scope }
```

Deleting first makes the code genuinely single-use: a replayed code lands on the "unknown code" branch and gets the same opaque error. A `consumed: true` flag also works but grows the table by one dead row per successful login, forever.

**Every failure returns the same opaque `invalid_grant`.** Distinguishing "unknown" from "expired" from "PKCE mismatch" only helps an attacker narrow down a captured flow. Keep the detail in server logs.

## Scope

If you advertise exactly one scope, **store the literal** — never echo back a narrower scope the client asked for. A client that requests `mcp.read` and is told it got `mcp.read` while holding full write is a lie your own audit log will repeat.

## Routes

- `/oauth/authorize` — the consent page. Reads the signed-in user from your auth context; bounces to login when anonymous. On approve, calls the mint mutation and redirects to `redirect_uri?code=…&state=…`.
- `/oauth/token` — accept **both** `application/x-www-form-urlencoded` and `application/json`. Validate `grant_type=authorization_code`. Return proper OAuth error codes. `Cache-Control: no-store`.
- `/oauth/register` — RFC 7591 DCR, if you want Claude.ai / Cursor. See [`clients.md`](./clients.md).
- `/.well-known/oauth-authorization-server` + `/.well-known/oauth-protected-resource` — see [`transport.md`](./transport.md).

If your framework nests providers (Next.js app router), the consent route needs the **same auth providers** as the rest of the app or you get `useAuth must be used within AuthProvider`. Add a layout for the `/oauth` segment rather than hoisting the provider into the root layout — hoisting drags an auth websocket onto every marketing page.

## The consent page is a security control, not a formality

- Render the **destination host**, parsed from `redirect_uri`, as the primary trust signal.
- The client's name is **self-reported** by whoever called `/oauth/register`. Show it, and label it as self-reported.
- Enumerate what approval actually grants. If the token can write, say it can write, and name the surfaces. A consent screen that says "list your providers and view usage" while minting a token that can delete everything is the most common honest-looking lie in this whole design.
- `redirect_uri` must be pre-registered for that client and https (localhost excepted for dev). Reject userinfo (`user:pass@host`) and fragments.

## Accepting more than one credential type

Extend your auth resolver to accept, in order:

1. `MCP_API_KEY` env match → synthetic service account (skip entirely when the env var is unset)
2. an existing session row
3. an `oauthAccessTokens` row where not revoked and not expired → resolve the linked user

The cleanest version of this: make an MCP bearer *be* a row in your existing session table with a long TTL and a label. Then your existing permission helpers gate MCP with no changes, every function that already takes a token works untouched, and revoking is the delete path you already have. One auth system, not two.

## Passing identity to your handlers

- **Node/Next** — `AsyncLocalStorage`: the route handler sets `{ token }` before dispatch, backend helpers read it. Beats threading a bearer through every function.
- **Convex** — no ALS survives across mutation hops. Resolve `userId` from the bearer **once** in the route handler, then call internal mutations that take `userId` as an explicit arg and check ownership inline.

## Rate limiting

- per-minute burst per token
- **per-day bucket too** — per-minute alone still permits ~172k calls/day, which is a real bill on any tool that fans out to an LLM
- separate bucket per IP on the unauthenticated surfaces (`/oauth/register`, `/oauth/token`)

Size the daily cap at roughly 10× your heaviest legitimate day, and log what you dropped.
