# Convex-specific — read before writing code

**Scope:** the Convex-only traps that break an MCP server, starting with the SITE vs CLOUD origin split.
**Assumes:** your backend is Convex (self-hosted or Cloud) and you are about to write the `/mcp` route.

These bit hard in real deployments and are not in the generic recipe.

## 1. SITE vs CLOUD origin (self-hosted)

Self-hosted Convex exposes TWO domains:

- `api-<app>.<host>` = **CLOUD** — queries and mutations only
- `site-<app>.<host>` = **SITE** — where `httpRouter` mounts: `/mcp`, `/.well-known/*`, every custom `httpAction`

The MCP URL you advertise MUST be the **SITE** origin. CLOUD returns 404 for `/mcp`, and the host reports it as *"MCP server does not implement OAuth"* — an error that names the wrong subsystem.

Memory hook: **api = data, site = HTTP**.

Convex Cloud (not self-hosted) has no such split. If you host the MCP route on your Next app in front of Cloud, none of this applies.

## 2. `.well-known/*` must live at the MCP origin

RFC 9728: the first discovery probe goes to the MCP URL's host. Mirroring the JSON only at your frontend host is not enough. On self-hosted Convex, serve both documents from the SITE origin as well.

```ts
// convex/mcp/wellKnown.ts
export const protectedResourceMetadata = httpAction(async () => json({
  resource: "https://site-<app>.<host>/mcp",
  authorization_servers: ["https://<frontend>"],
  bearer_methods_supported: ["header"],
}));
// convex/http.ts
//   http.route({ path: "/.well-known/oauth-protected-resource", method: "GET", handler: ... });
//   http.route({ path: "/.well-known/oauth-authorization-server", method: "GET", handler: ... });
```

## 3. `internalMutation` rejects dynamic imports

`await import("./_shared/markdown")` throws `dynamic module import unsupported` inside an internal mutation, even though the identical line works in a public mutation — different bundling path. Always use static top-level imports. It will not surface until the first call.

## 4. `requireAuth` is empty in MCP context

Bearer auth resolves in the HTTP layer, so `getAuthUserId(ctx)` returns null — there is no `@convex-dev/auth` session cookie on an MCP call. Any public mutation calling `requireAuth` throws "Not signed in".

Pattern: resolve `userId` from the bearer once in the route handler, then call **internal** mutations taking `userId: v.id("users")` explicitly, checking ownership inline (`if (doc.userId !== args.userId) throw`).

## 5. Mutations cannot live in a `"use node"` file

Split them out. A `"use node"` module holds actions only. (A misleading "self-signed certificate" error on deploy is often this, not TLS.)

## 6. A mutation cannot `runMutation` another mutation

Which is why rate-limit helpers get inlined. Extract the limiter as a **plain async function** taking `ctx`, not as an internal mutation.

## 7. Stamp `workspaceId` on every insert (multi-workspace apps)

Sidebars filter through a `by_workspace` index. MCP-created rows without `workspaceId` exist on disk and are **invisible** in the UI — the model reports success, the user sees nothing. Use a helper that resolves the active workspace or falls back to personal, and apply it to every create path.

## 8. Convex paths reject hyphens

`convex/features/my-feature/` is invalid — snake_case or camelCase only.

## 9. Moving a Convex file renames its api path

`api.mcp.*` is derived from `convex/mcp.ts`. Move that file into `convex/features/mcp/` and every reference repo-wide changes with it. When a slice wants to "own" root-level Convex modules, declare them in metadata and **leave the files where they are**.

## 10. Validator drift on read tools

A dispatcher that forgets to pass `userId` to an ownership-scoped query throws Convex `ArgumentValidationError`, which reaches the model as a vague "validation/internal error". Pass every required arg explicitly.
