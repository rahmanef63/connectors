# Security checklist — the gate before you expose it

**Scope:** the pass/fail release gate for a remote MCP server, OAuth authorization server and optional ChatGPT/Codex plugin package.
**Assumes:** you built at least Phase 1 of [`../cn-mcp-core/`](../cn-mcp-core/README.md); OAuth and packaging rows apply only when those surfaces exist.

## Identity and authorization

- [ ] Every MCP request authenticates independently; identity is never taken from tool arguments.
- [ ] Multi-tenant membership and ownership are re-checked on **every** call, not only when the token is minted.
- [ ] Manual API keys/tokens contain enough entropy, are hashed at rest, expire or have an explicit revoke path, and compare without obvious timing leaks.
- [ ] Auth codes and opaque access tokens are stored only as digests; raw values are returned exactly once.
- [ ] No UI can re-render a minted credential from the database—not even a masked preview.
- [ ] Tokens are bound to the exact OAuth issuer and MCP resource audience; a token for `/mcp` is not accepted automatically by unrelated REST routes.
- [ ] Expiry, revocation, issuer, audience and scopes are revalidated on every call.
- [ ] Read-only grants can reach no write/destructive tool; assert this over the registry.
- [ ] Required scopes are enforced before handlers run, not merely advertised/stored.

## OAuth 2.1 + PKCE

- [ ] 401 carries `WWW-Authenticate: Bearer resource_metadata="…"` pointing at a document that actually exists.
- [ ] RFC 9728 and RFC 8414 documents pin trusted deployment constants, never request `Host`/forwarded headers.
- [ ] `resource` travels through authorization and token exchange and must equal the canonical protected resource exactly.
- [ ] PKCE permits S256 only; verifier grammar and length 43..128 are checked before hashing.
- [ ] Redirect URIs are exact-match allowlisted; fragments, userinfo, non-loopback HTTP and non-canonical spellings are refused.
- [ ] DCR accepts only `application_type: web | native`, issues no client secret, binds client ids to the issuer, and is separately rate-limited.
- [ ] CIMD fetches are HTTPS-only, SSRF-safe, redirect-aware, size/time bounded and metadata-validated.
- [ ] Consent displays client identity status, exact return destination, exact resource and real scope consequences.
- [ ] Malformed/unregistered redirects are a dead end, never an error redirect to an untrusted URI.
- [ ] Authorization responses include and clients verify `iss` when RFC 9207 support is advertised.
- [ ] Auth codes have short TTL and are single-use even on failed redemption.
- [ ] In rollback transactions, post-delete refusal returns instead of throwing, so deletion commits.
- [ ] Token endpoint accepts form encoding, rejects JSON, emits OAuth error vocabulary, and responds with `Cache-Control: no-store` plus `Pragma: no-cache`.
- [ ] Invalid resource uses `invalid_target`; grant failures remain one opaque `invalid_grant` shape.
- [ ] OpenAI tools that require linking declare `securitySchemes` and return `_meta["mcp/www_authenticate"]` without secrets.

## Protocol and transport

- [ ] Request content type and declared/actual byte size are bounded before JSON parsing.
- [ ] Only protocol revisions actually implemented are advertised.
- [ ] Legacy negotiation echoes a supported requested revision and does not require modern-only headers.
- [ ] Stateless `2026-07-28` implements `server/discover` and validates version/method/name header-body agreement before dispatch.
- [ ] Unknown modern RPC is HTTP 404 + JSON-RPC `-32601`; unknown tool is invalid params and never reaches a handler.
- [ ] Request arrays are refused on revisions where batching is removed.
- [ ] Notifications cannot bypass auth/rate limits merely by omitting `id`.
- [ ] Per-user tool catalogs are built after authorization, deterministic, short-lived/private, and never cached publicly.
- [ ] GET/POST/SSE behavior is explicit; unsupported verbs return 405 with `Allow`.
- [ ] Upstream credential-bearing requests never follow cross-origin redirects.
- [ ] Timeouts, cancellation and response-size ceilings apply to ordinary and streaming calls.
- [ ] Rich file/image tools receive only explicitly reviewed larger limits; the global default stays small.

## Tools, results and execution

- [ ] Every tool has a stable name, title, focused description, closed input schema and all four safety annotations.
- [ ] No write claims `readOnlyHint: true`; annotations match real side effects and public-internet reach.
- [ ] Destructive/irreversible effects are narrow tools, explained before execution and approval-gated where policy requires.
- [ ] Arbitrary shell, Python, unrestricted filesystem and unrestricted network tools are absent by default, not merely hidden in UI.
- [ ] Every structured success has exact object `outputSchema` + schema-valid `structuredContent` + functionally equivalent text.
- [ ] Null, empty list, scalar and ack branches remain object envelopes.
- [ ] Execution failures return `isError: true`; transport failures use JSON-RPC errors.
- [ ] Approval binds connector + action + canonical arguments and is single-use.
- [ ] Audit logs store identities/outcomes, not raw arguments, credentials, files or upstream bodies.
- [ ] Credential and path redaction occurs in the shared execution pipeline used by every surface.

## Files, images and URLs

- [ ] Caller-supplied URL fetches authorize first, allow HTTPS only, block private/link-local/metadata address space, cap redirects, content type and actual bytes.
- [ ] Uploaded/generated file names are basenames; local absolute paths never leave the device/runtime.
- [ ] Download references are gateway-controlled, short-lived and download-bounded.
- [ ] Inline image/base64 results are capped and never accepted from arbitrary upstream HTML.
- [ ] SVG icons/resources are inert: no scripts, event handlers, external hrefs or unexpected active content.

## Rate limits and operations

- [ ] Separate limits exist for registration, token exchange, consent abuse, reads, writes and expensive/rich tools.
- [ ] Writes have both burst and daily budgets; shared-host egress addresses cannot let one tenant lock out everyone.
- [ ] Discovery/liveness endpoints return no secret and have deliberate caching/rate-limit policy.
- [ ] Schema/control-plane changes deploy before gateways that start sending new OAuth fields.
- [ ] Existing tokens are audited before stricter scope/audience enforcement is enabled.
- [ ] Secret-shaped added lines and committed `.env`/key material are scanned before release.

## Plugin/package gate

- [ ] `.codex-plugin/plugin.json` exists only in the consumer plugin package, not accidentally at cookbook root.
- [ ] Every manifest path begins `./`, stays inside the package and resolves.
- [ ] `.app.json` contains a real ChatGPT-created technical id and no placeholder; `.mcp.json` contains no user secret.
- [ ] OpenAI and Claude wrappers use their own manifest/config schemas rather than one ambiguous shared JSON shape.
- [ ] Skills are provider-neutral where possible and never duplicate secrets or entire tool schemas.
- [ ] MCP-served skills are bounded, digest-checked, exposed through standard resources as a fallback, and treated as untrusted instructions—not implicit execution authority.
- [ ] Draft skills-extension methods are feature-tested and never the only way to read a skill.
- [ ] Privacy policy, terms, support URLs, listing assets and test cases describe the real data/actions.
- [ ] A fresh install passes direct, indirect, follow-up, confirmation and negative acceptance prompts.

## Evidence required to check the gate

- [ ] Catalog snapshot and invariant tests are green.
- [ ] Result fixtures validate against output schemas.
- [ ] Legacy and modern protocol matrices are green for every advertised revision.
- [ ] OAuth refusal/replay/audience/issuer tests are green.
- [ ] Documentation/package contract checks are green.
- [ ] One live deployed OAuth + read + approval-gated write flow was inspected end-to-end.
