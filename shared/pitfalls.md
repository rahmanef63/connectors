# Pitfalls — 20 that cost real hours

**Scope:** real failures — symptom, root cause, fix.
**Assumes:** something is already broken. You have a deployed endpoint and an error message, not a blank page.

Ordered roughly by how likely or damaging they are.

1. **Auth-provider scope** — `/oauth/*` sits outside the app tree, so consent throws `useAuth must be used within AuthProvider`. Add a layout for that segment; do not hoist an auth websocket/provider into every marketing page.

2. **Discovery 404 reported as OAuth failure** — the host says “server does not implement OAuth”; the real cause is `.well-known` mounted on another origin or route. Curl both documents at the MCP resource origin.

3. **Secret exists in one runtime only** — frontend route and backend isolate use different environment stores. One can sign in while the other returns 401. Provision and rotate deliberately in both, or use one backend-owned per-user credential system.

4. **PKCE `plain` accepted** — refuse it. S256 only.

5. **Verifier grammar/length unchecked** — enforce RFC 7636 unreserved characters and 43..128 before hashing. Invalid grammar should not reach the code row.

6. **Base64url confused with base64** — challenge encoding is `+→-`, `/→_`, strip `=`. Standard base64 fails silently.

7. **Code burned too late—or not burned after a failed exchange** — delete the code before post-lookup validation. In rollback databases, return a refusal after the delete instead of throwing, or the transaction revives the row.

8. **Tool errors sent as JSON-RPC `error`** — hosts may hide protocol errors. An addressed tool that fails returns `result.isError = true` with readable text.

9. **Bearer threaded through every handler** — resolve caller identity once at the edge. Use request context/AsyncLocalStorage on Node; on Convex pass resolved server-side identity into internal functions, never AI-supplied ids.

10. **No cache headers on discovery** — public static OAuth documents should be cacheable. Per-user tool catalogs should be private. Copying one policy onto both either wastes traffic or leaks authorization state.

11. **MCP URL points at the wrong backend origin** — common on platforms with separate API/SITE hosts. The browser can show the dashboard while `/mcp` and `.well-known` 404 elsewhere.

12. **`.well-known` only on the frontend host** — clients probe the protected-resource origin first. A correct document on another host is invisible unless the first document points there.

13. **Backend internal functions dynamic-import unsupported code** — some isolates require static imports. It deploys or typechecks, then fails on the first call. Keep protocol adapters thin and runtime-compatible.

14. **Read-tool validator drift** — descriptor accepts `{id}`, handler suddenly requires `{id,userId}`. Identity belongs server-side; one schema/validator source should drive both descriptor and call boundary.

15. **Response-shape asymmetry** — handler returns `{items,nextCursor,total}`, adapter destructures `{results,cursor}`. `any` hides it; one live call catches it.

16. **Tenant key omitted on writes** — row is created but invisible behind tenant-scoped reads. Attach authenticated tenant/workspace identity server-side and assert it in write tests.

17. **OAuth token has no resource audience** — a bearer minted for the MCP endpoint works on another API route or sibling MCP server. Carry `resource` through consent/exchange, store/verify exact `aud`, and reject `invalid_target` early.

18. **Authorization-server mix-up** — a client id/code from one issuer is accepted by another, or the redirect omits/verifies no `iss`. Bind client, code and token to the issuer and use RFC 9207 where advertised.

19. **Modern headers trusted without body equality—or forced on legacy clients** — trusting only headers lets a proxy authorize one method while JSON-RPC dispatches another; requiring them globally breaks old clients. Classify the era, then validate strict equality only on modern requests.

20. **`outputSchema` and result drift** — descriptor promises an object, “not found” returns bare `null`, and a strict host throws after the handler succeeded. Normalize every success to an object envelope and validate fixtures against the exact schema.

## Two historical recipe errors to remove from copied implementations

**Plaintext credentials at rest.** Older examples stored raw code/token values under `by_code` / `by_token`. Rotate those credentials; do not merely hash a value that already sat exposed in plaintext.

**Versionless batching.** Batching existed in `2025-03-26` and was removed in `2025-06-18`. Delete blanket array handling. Support it only inside a revision path you intentionally still advertise.
