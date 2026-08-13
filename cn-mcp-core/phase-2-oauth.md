# Phase 2 — OAuth 2.1 + PKCE

**Scope:** the authorization half — consent page, auth codes, token exchange, discovery documents.
**Assumes:** Phase 1 is live and answering `initialize` over a bearer.

Full recipe in [`../shared/oauth.md`](../shared/oauth.md). The shape:

`consent page → mint code (short TTL, PKCE S256 challenge stored) → client POSTs /oauth/token with code_verifier → verify → mint access token`

Two tables, **both storing only sha256**: auth codes (delete the row on exchange, never a `consumed` flag) and access tokens. Serve `/.well-known/oauth-protected-resource` (RFC 9728) and `/.well-known/oauth-authorization-server` (RFC 8414) — and see pitfall #12 in [`../shared/pitfalls.md`](../shared/pitfalls.md) for *where* they must live.

Nothing in the transport changes when OAuth lands. The endpoint, the dispatcher and the tool registry are identical; only the function that turns a bearer into a caller identity gains a second source.

Next: [`phase-3-admin-ui.md`](./phase-3-admin-ui.md), then [`../shared/security-checklist.md`](../shared/security-checklist.md).
