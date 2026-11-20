# GEMINI.md

**Scope:** Gemini-specific agent entry point for this repository; defers cookbook routing and invariants to [`AGENTS.md`](./AGENTS.md).
**Assumes:** you are working in this repository locally and need local MSO integration context lookup rules.

<!-- mso-local-context -->
## Local Integration & Credential Context
Before running GitHub (`git`/`gh`/API) or external provider operations, check local gitignored `mso.md` (or `.mso/mso.md`) in this repository root if present. It specifies the intended MSO integration user and connection for this project. Never commit `mso.md`, `.mso/mso.md`, or raw credentials.
