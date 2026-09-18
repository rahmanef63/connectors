# MCP build plan

Copy this file into the target project's task/handoff notes when the MCP work is substantial. Replace prompts with verified facts; do not fill unknowns by guessing.

## Target

- Repository / branch / SHA:
- Runtime owner:
- Framework / package manager:
- Public MCP origin:
- Deployment path:
- Target hosts:
- Current MCP state:
- Rollback:

## Existing application authorities

- Authentication/session SSOT:
- User/tenant membership SSOT:
- Domain/service handler SSOT:
- Database/data ownership boundary:
- Existing audit/logging:
- Existing rate limit / policy layer:
- Secret store:

## Capability map

| outcome | primitive | public name | input/output | scope | destructive | idempotent | open world | approval | source handler |
|---|---|---|---|---|---|---|---|---|---|

## Protocol and auth

- Protocol revisions actually required:
- SDK / transport:
- Discovery endpoints:
- OAuth issuer:
- Protected resource / audience:
- Client metadata / compatibility registration:
- PKCE:
- Redirect allowlist:
- Scope vocabulary:
- Revocation:
- Identity stripped from caller arguments: yes/no

## Result and file contracts

- Output envelopes:
- Pagination:
- Default result byte cap:
- Rich-result exceptions:
- File/image tools:
- SSRF policy:
- Signed/reference URL lifetime:
- Redaction boundary:

## Skill and plugin package

- Workflow skill needed? why:
- Portable `plugin.json`:
- Portable `mcp.json`:
- `extensions.com.openai`:
- Compatibility `.codex-plugin/plugin.json` needed?:
- Registered `.app.json` binding needed?:
- Assets/privacy/terms/support:
- Placeholder/secret gate:

## Test matrix

- [ ] catalog snapshot/digest
- [ ] descriptor invariants
- [ ] input/output fixtures
- [ ] scope list-time + call-time
- [ ] direct/indirect/follow-up/negative prompts
- [ ] protocol revisions
- [ ] OAuth refusal/replay/audience/issuer
- [ ] approval/policy/replay
- [ ] redaction/secret output
- [ ] package/skill integrity
- [ ] typecheck/lint/test/build

## Live acceptance

- [ ] deployed health/version
- [ ] discovery documents
- [ ] unauthenticated challenge
- [ ] authenticated catalog
- [ ] read call
- [ ] write/approval call
- [ ] insufficient-scope/revocation
- [ ] modern/legacy parity if both advertised
- [ ] host rescan/reconnect
- [ ] fresh plugin install

## Handoff

- Verified:
- Not verified:
- Known risks:
- External/manual steps:
- Exact commands:
- Evidence locations:
