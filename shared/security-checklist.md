# Security checklist — the gate before you expose it

**Scope:** the pass/fail list for a server that is about to be reachable by an AI host.
**Assumes:** you built at least Phase 1 of [`../cn-mcp-core/`](../cn-mcp-core/README.md); OAuth items are inert until Phase 2.

- [ ] `MCP_API_KEY` ≥ 32 hex chars, and its compare is constant-time-ish (same-length first)
- [ ] PKCE S256 only, `plain` refused; verifier length 43..128 enforced
- [ ] `redirect_uri` pre-registered per client + HTTPS-validated at the consent page. Host allowlist for known clients; under open DCR the consent page must render the destination HOST and mark the client name self-reported
- [ ] Auth codes single-use, ≤5 min TTL, row DELETED on exchange
- [ ] Access tokens carry `expiresAt` + a revoke path, re-validated on every call
- [ ] Tokens **and** auth codes stored as sha256; raw value returned exactly once, at mint
- [ ] 401 carries `WWW-Authenticate: Bearer resource_metadata="…"`
- [ ] Discovery documents pin their origin to a CONSTANT, never the request `Host` header
- [ ] No raw secrets in tool output
- [ ] Service-account env bypass is opt-in (skipped when the env var is unset)
- [ ] Per-minute **and** per-day rate limits on every write tool
- [ ] Multi-tenant: membership re-checked on EVERY call, not just at mint
