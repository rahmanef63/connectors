# OAuth 2.1 + PKCE for MCP

**Scope:** the production OAuth 2.1 + PKCE S256 recipe — discovery, protected-resource binding, client registration, consent, single-use codes, audience-bound tokens, per-call enforcement and rollout order.
**Assumes:** Phase 1 is live and you are targeting a host whose form exposes no credential field (ChatGPT, Claude.ai). Budget several focused hours the first time; the security properties matter more than the route count.

Those hosts require OAuth; Cursor, Claude Code and `mcp-remote` may also accept a manually configured bearer. OAuth changes **how a bearer becomes an authenticated caller**, not the tool registry or business dispatcher.

## The identities and URLs you must not blur together

Use explicit names in code:

| Name | Meaning | Example |
|---|---|---|
| `MCP_RESOURCE` | the exact protected resource named by RFC 9728; commonly the full MCP endpoint | `https://api.example.com/mcp` |
| `AUTH_ISSUER` | the authorization server issuer | `https://api.example.com` |
| `AUTHORIZATION_ENDPOINT` | the browser consent route; it may live on another frontend origin | `https://app.example.com/oauth/authorize` |
| `TOKEN_ENDPOINT` | the machine-to-machine code exchange | `https://api.example.com/oauth/token` |
| `REGISTRATION_ENDPOINT` | RFC 7591 dynamic client registration, when supported | `https://api.example.com/oauth/register` |

A different consent-page host is fine. A token minted for a different `MCP_RESOURCE`, or by a different `AUTH_ISSUER`, is not.

## Discovery starts from the 401

A request without a usable bearer returns HTTP 401 plus the protected-resource pointer:

```http
WWW-Authenticate: Bearer resource_metadata="https://MCP_ORIGIN/.well-known/oauth-protected-resource"
```

Serve both public, CORS-open and cacheable:

### RFC 9728 protected-resource metadata

```json
{
  "resource": "MCP_RESOURCE",
  "authorization_servers": ["AUTH_ISSUER"],
  "bearer_methods_supported": ["header"],
  "scopes_supported": ["mcp.read", "mcp.write"]
}
```

### RFC 8414 authorization-server metadata

```json
{
  "issuer": "AUTH_ISSUER",
  "authorization_endpoint": "AUTHORIZATION_ENDPOINT",
  "token_endpoint": "TOKEN_ENDPOINT",
  "registration_endpoint": "REGISTRATION_ENDPOINT",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"],
  "authorization_response_iss_parameter_supported": true,
  "scopes_supported": ["mcp.read", "mcp.write"]
}
```

Pin every origin to trusted deployment configuration, never `Host` or `X-Forwarded-Host` from the request. Discovery documents are inputs to a client's trust decision.

## Client identity: CIMD first, DCR for compatibility

OpenAI recommends **Client ID Metadata Documents (CIMD)** for MCP clients. Keep RFC 7591 DCR when hosts you support still use it.

### CIMD

The client id is an HTTPS URL that resolves to the client's metadata document. At authorization time:

1. fetch it over HTTPS;
2. refuse redirects unless your policy deliberately allows and re-validates them;
3. cap the response size and timeout;
4. validate the document and exact redirect URI;
5. cache briefly, but revalidate often enough that revocation matters.

Do not accept an arbitrary URL as a client id and trust fields from it without SSRF, redirect and size guards.

### DCR

A DCR client row is inert until a signed-in human approves it. Store:

```text
clientId
clientName             # self-reported
redirectUris[]         # exact-match allowlist
applicationType        # "web" | "native"
issuer                 # AUTH_ISSUER that registered it
createdAt
lastUsedAt?
```

Requirements:

- public client only; no client secret;
- `token_endpoint_auth_method: "none"`;
- `application_type` accepts only `web` or `native`;
- `https` redirect URIs for web clients;
- loopback HTTP and reviewed reverse-DNS private schemes only for native clients;
- no fragments, userinfo or non-canonical URL spellings;
- exact-string redirect matching, never prefix or subdomain matching;
- bind the row to `AUTH_ISSUER`, so a client id minted by another issuer cannot be replayed here;
- rate-limit registration and prune registrations that never complete a flow.

## The authorization request carries the resource

The browser request includes, at minimum:

```text
response_type=code
client_id=...
redirect_uri=...
code_challenge=...
code_challenge_method=S256
resource=MCP_RESOURCE
scope=mcp.read mcp.write
state=...
```

Validate every field **before** rendering consent:

- signed-in user comes from the session, never from a query parameter;
- client exists and belongs to this issuer;
- redirect URI is an exact member of the registered/validated client metadata;
- `response_type` is `code`;
- PKCE method is exactly `S256`;
- challenge grammar is valid;
- `resource` canonicalizes to exactly `MCP_RESOURCE`;
- requested scopes are a supported subset;
- repeated parameters are refused rather than resolved by first- or last-wins guessing;
- `state` is bounded and echoed verbatim on success and denial.

A malformed or unregistered redirect is a dead end on your page. Do **not** redirect to an untrusted `redirect_uri` merely to report the error; that is the open redirect.

## The consent page is a security control

Show:

- the client name, labelled self-reported unless independently verified;
- the exact destination host and redirect URI;
- the exact protected resource;
- what each requested scope permits;
- whether writes may alter, send, publish, delete or revoke anything;
- how the user revokes the grant later.

The approve button should name the client. A vague “Continue” button beside a client name the user cannot place is how a technically valid OAuth flow becomes phishing UX.

## Three digest-only records

### Authorization codes

```text
codeHash
codeChallenge
clientId
redirectUri
resource
issuer
scopes[]
userId
expiresAt
```

Index by `codeHash`. TTL should be minutes, not hours. Store only SHA-256 of the raw code.

### Opaque access tokens

```text
tokenHash
userId
clientId
resourceAudience
issuer
scopes[]
expiresAt
createdAt
lastUsedAt?
revokedAt?
label
```

Store only the digest. Return the raw token once. If your app already has a secure, expiring session/API-key table, an OAuth grant can be that same row with `clientId`, audience and scopes attached — one revocation path and one authenticator.

### Clients

Only needed for DCR or a local client registry. CIMD clients are validated from their metadata document instead of being minted by this endpoint.

## PKCE S256

- verifier length **43..128** from the RFC 7636 unreserved character set;
- reject malformed verifiers before looking up a code, so a random short string cannot burn an honest user's code;
- challenge = `base64url(sha256(verifier))` — `+→-`, `/→_`, strip `=`;
- compare in constant time;
- never accept `plain`.

## Exchange ordering: burn the code, but do not let rollback revive it

The token endpoint accepts **`application/x-www-form-urlencoded` only**. OAuth defines this request encoding; accepting JSON creates a second, non-standard parser and lets clients appear to work against a contract other OAuth implementations reject.

```text
validate grant_type, required fields and verifier grammar
find row by sha256(code)           → miss? invalid_grant
DELETE the row                     ← single-use from this point
validate expiry, client, redirect, issuer, resource and PKCE
mint access token bound to resource + issuer + scopes
return token
```

There is one transactional trap: in databases where a thrown mutation rolls back all writes, **deleting and then throwing restores the code**. In that environment, return a typed refusal such as `{ok:false}` after the delete, let the transaction commit, and translate it to OAuth `invalid_grant` outside the transaction.

Every grant rejection should look the same to the caller. Unknown code, expired code, wrong client, wrong redirect and wrong verifier all become:

```json
{
  "error": "invalid_grant",
  "error_description": "The authorization grant is invalid or expired."
}
```

Keep diagnostic detail in redacted server logs.

A presented `resource` that is malformed or names another audience fails as `invalid_target` **before** consuming the code when possible. At authorization and exchange, always compare the canonical exact value to `MCP_RESOURCE`.

## Token response

```json
{
  "access_token": "RETURNED_ONCE",
  "token_type": "Bearer",
  "expires_in": 7776000,
  "scope": "mcp.read mcp.write"
}
```

Headers:

```http
Cache-Control: no-store
Pragma: no-cache
Content-Type: application/json
```

Do not emit a refresh token unless you actually implement rotation, revocation and replay handling. A missing field is better than a decorative credential the client cannot use safely.

## Authorization response issuer

When you advertise RFC 9207 support, redirect with `iss=AUTH_ISSUER` on success and denial. The client uses it to detect authorization-server mix-up. Bind the code and client record to the same issuer and re-check it at exchange.

## Verify the access token on every MCP request

For an opaque token:

1. hash the presented bearer;
2. find the row;
3. require active/not revoked;
4. require `expiresAt > now`;
5. require issuer exactly `AUTH_ISSUER`;
6. require audience exactly `MCP_RESOURCE`;
7. resolve the current user and tenant membership;
8. enforce the required scope for the addressed tool.

For a JWT, verify signature, `iss`, `aud`, `exp`, `nbf` and scopes with the same exactness. Parsing claims without validating them is not authentication.

A bearer for `/mcp` must not automatically authorize unrelated REST routes. Audience binding is what stops a valid token from becoming a universal API key.

## Scope: advertise, consent, store, enforce

Derive the required scope from the same action metadata used for annotations:

```ts
const requiredScope = tool.requiredScope ??
  (tool.annotations.readOnlyHint === true ? "mcp.read" : "mcp.write");
```

A write grant may imply read if your published scope semantics say so. A read grant never implies write.

Before the handler runs:

```ts
if (!satisfiesScope(caller.scopes, requiredScope)) {
  throw insufficientScope(requiredScope);
}
```

For the HTTP authorization failure, return 403 and a recoverable RFC 6750 challenge:

```http
WWW-Authenticate: Bearer error="insufficient_scope", scope="mcp.write", resource_metadata="https://MCP_ORIGIN/.well-known/oauth-protected-resource"
```

For OpenAI tool-level linking, the descriptor's `securitySchemes` and the runtime result `_meta["mcp/www_authenticate"]` are both required. The runtime challenge should include `error` and `error_description`; never put tokens or internal diagnostics in it.

## Rate limits and lifecycle

Use separate budgets for:

- unauthenticated registration;
- token exchange;
- authorization-page abuse;
- per-token MCP calls;
- per-day write volume, not just per-minute burst.

Useful lifecycle rules:

- one live token per `(user, client)` if reconnect should replace the old grant;
- reconnecting one client must not revoke another client's grant;
- expired codes are swept in bounded batches;
- never prune a client that has successfully completed a flow unless you have an explicit revocation/migration plan;
- expose grants in a user-facing revoke screen.

## Deployment order

When adding audience, issuer or new client metadata to a live system:

1. deploy schema/control-plane support first, while fields remain optional for rolling compatibility;
2. verify old gateway calls still work;
3. deploy the gateway that starts sending and enforcing the new fields;
4. verify discovery, DCR/CIMD, consent, token exchange and authenticated `tools/list` live;
5. only then require the fields on newly issued grants;
6. inspect existing tokens before enabling enforcement that would strand them.

Deploying the edge first can make it call backend mutations whose validators do not yet understand `resource`, `issuer` or `applicationType`.

## Contract tests

- 401 challenge points at a document the server really serves;
- discovery origins are constants and contain the exact resource/scopes;
- DCR accepts only supported application types and safe redirect URIs;
- another issuer cannot reuse a client id;
- anonymous callers cannot mint codes;
- code, verifier, redirect, client, issuer and resource are all bound;
- malformed verifier does not consume a code; a valid-shaped wrong verifier does;
- failed post-lookup exchange commits the code deletion;
- token endpoint rejects JSON and accepts form encoding;
- token responses are non-cacheable;
- another resource fails before minting a token;
- issued token carries exact approved scopes and audience;
- read-only token sees and calls no write tool;
- reconnect replaces only the same `(user, client)` grant;
- no refusal leaks the code, token or upstream exception.

## Primary sources

- OpenAI MCP authentication: <https://developers.openai.com/plugins/build/auth>
- MCP authorization overview: <https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization>
- MCP 2026 authorization changes: <https://blog.modelcontextprotocol.io/posts/2026-07-28/>
- RFC 7636 (PKCE), RFC 8414 (authorization-server metadata), RFC 8707 (resource indicators), RFC 9207 (authorization response issuer), RFC 9728 (protected-resource metadata), RFC 7591 (dynamic registration)
