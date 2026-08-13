# Pitfalls — 16 that cost real hours

**Scope:** real failures — symptom, root cause, fix.
**Assumes:** something is already broken. You have a deployed endpoint and an error message, not a blank page.

Ordered roughly by how likely you are to hit them.

1. **Auth-provider scope** — `/oauth/*` sits outside your app tree, so the consent page throws `useAuth must be used within AuthProvider`. Add a layout for that segment; do NOT hoist the provider into the root layout (it drags an auth websocket onto marketing pages).

2. **Discovery 404 reported as an OAuth failure** — the host says *"MCP server does not implement OAuth"*; the real cause is a `.well-known` route in the wrong place. Curl both documents before believing the error message. On Next.js, `.well-known` is a literal folder under `app/`.

3. **Env var in two runtimes** — the shared secret must exist in the frontend runtime AND the backend isolate. Missing one gives 401 from MCP, or "session invalid" from mutations. Multi-tenant apps sidestep this entirely by minting per-user tokens instead.

4. **PKCE `plain` accepted** — refuse it. S256 only.

5. **Verifier length unchecked** — enforce 43..128 (RFC 7636 §4.1), before hashing.

6. **base64url ≠ base64** — `+→-`, `/→_`, strip `=`. Standard base64 produces a wrong challenge silently.

7. **Code consumed after mint instead of before** — delete the code row FIRST, then insert the token, or a retry races and double-issues. A `consumed` flag grows the table forever.

8. **Tool errors sent as JSON-RPC `error`** — hosts hide protocol errors from the user. Execution failures belong in `result.isError` with text.

9. **Threading the bearer by hand** — use AsyncLocalStorage on Node; on Convex resolve `userId` once and pass it as an explicit arg.

10. **No cache headers on discovery** — `cache-control: public, max-age=3600`.

11. **MCP URL pointed at the wrong Convex origin** — must be SITE, not CLOUD, on self-hosted. Symptom is identical to #2.

12. **`.well-known` only at the frontend host** — the resource origin is probed first. Mirror it.

13. **Convex internal mutations cannot dynamic-import** — static top-level imports only. Fails at first call, not at deploy.

14. **Read-tool validator drift** — a missing `userId` arg surfaces to the model as an incoherent "validation error".

15. **Response-shape asymmetry** — handler returns `{items, nextCursor, total}`, dispatcher destructures `{results, cursor}` → `.map of undefined`. TypeScript will not catch it through `any`. Make one real call before declaring done.

16. **Missing `workspaceId` on inserts** — rows exist but are invisible behind a `by_workspace` filter. The model reports success; the user sees nothing.

## Two more the recipe itself got wrong

**Plaintext tokens at rest.** Earlier versions of this recipe told you to store the raw code and token and index them (`by_token`, `by_code`). Every real implementation hashes. If you copied an older version, migrate by **rotating**, not rehashing — a credential that sat in plaintext should be treated as compromised.

**JSON-RPC batching.** Removed from the spec in 2025-06-18. If an older recipe told you to build array handling, delete it.
