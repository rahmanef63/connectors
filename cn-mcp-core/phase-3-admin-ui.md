# Phase 3 — admin / settings UI

**Scope:** the surface where a human mints, inspects and revokes their own tokens.
**Assumes:** Phase 1, and Phase 2 if consumer AI hosts connect.

1. **Setup card** — copy-to-clipboard fields, one tab per client. This replaces a separate onboarding doc. Build it from [`../shared/setup-form.md`](../shared/setup-form.md), not from this bullet: that file is the spec — the exact string each host wants, the card's element table, and a `CopyField` you can paste in. Any icon or logo the card renders comes from [`../shared/icons.md`](../shared/icons.md).
2. **Tokens table** — `label`, status, `createdAt`, `lastUsedAt`, `expiresAt`, Revoke. No token preview: only the digest exists.
3. **Env note** — say plainly that `MCP_API_KEY` is a dev fallback and is not in the table.

## Worked example

`slices/real-dashboard/components/agent-setup.tsx` in `codex-build-week` is item 1 plus half of item 2: one card, tabbed copy-to-clipboard fields (client name, description, instructions, starters, settings, generated OpenAPI schema), and a mint button calling `api.agent.issue`. The raw token renders once in-page; afterwards only `tokenPrefix`, `createdAt` and `expiresAt` are readable (`convex/agent.ts:11`), because `issue` stores `sha256(token)` (`convex/agent.ts:6,10`).

Where it falls short of item 2: no tokens table and no Revoke button. `issue` silently revokes every prior live token for the workspace, so exactly one exists at a time — workable for one client, not once a user connects several.

Then run [`../shared/security-checklist.md`](../shared/security-checklist.md) before you expose it.
