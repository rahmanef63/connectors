# Phase 3 — admin / settings UI

**Scope:** the surface where a human mints, inspects and revokes their own tokens.
**Assumes:** Phase 1, and Phase 2 if consumer AI hosts connect.

1. **Setup card** — copy-to-clipboard fields, one tab per client (see [`../shared/clients.md`](../shared/clients.md)). This replaces a separate onboarding doc.
2. **Tokens table** — `label`, status, `createdAt`, `lastUsedAt`, `expiresAt`, Revoke. No token preview: only the digest exists.
3. **Env note** — say plainly that `MCP_API_KEY` is a dev fallback and is not in the table.

Then run [`../shared/security-checklist.md`](../shared/security-checklist.md) before you expose it.
