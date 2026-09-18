---
name: mcp-project-builder
description: Build or productionize a project MCP from zero through deployment, OAuth, tool contracts, plugin packaging, tests, security review, and live acceptance. Use when an agent is handed this repository plus a target application and is expected to deliver a production-quality MCP rather than only explain MCP.
metadata:
  short-description: Build a production MCP end to end
---

# MCP Project Builder

Use this skill when the task is to **build, repair, or productionize an MCP integration in another project**. The repository guides are the technical source of truth; this skill is the execution router.

Do not use this for a one-off MCP definition, a single connection setting, or a Custom GPT that only needs existing REST Actions.

## Outcome

Deliver one host-agnostic MCP server plus the registration/package surfaces the target actually needs. “Done” means code, contract tests, security gates, deployment evidence, and a real host-facing acceptance flow agree.

## 0. Resolve the real target before editing

Record:

- canonical target repository, branch/SHA, framework and package manager;
- running/deployment owner, public HTTPS origin, reverse proxy and environment;
- existing auth/session model and how user/tenant identity is resolved;
- existing service/domain handlers that should remain the business-logic SSOT;
- target hosts: ChatGPT/Codex, Claude, Cursor, or another MCP client;
- required read/write/destructive outcomes, files/images, UI resources and long-running work;
- current MCP/plugin state, if any.

Never edit a generated build, dependency cache, temporary clone, or unrelated runtime because it is the first search hit.

Copy the planning template from [assets/mcp-build-plan.md](assets/mcp-build-plan.md) when the work spans more than a small patch.

## 1. Design the capability surface before transport

Read [tool design](../../../shared/tool-design.md).

Create a reviewed table for every proposed capability:

| Field | Required decision |
|---|---|
| primitive | tool, resource, prompt/skill, or not exposed |
| public name | stable, verb-clear, collision-safe |
| use / do-not-use | routing intent and confusable sibling |
| input | closed schema, descriptions, bounded enums/ids |
| identity | server-derived; never caller-supplied user/tenant |
| output | exact object envelope and next-call identifiers |
| authority | read/write plus destructive/idempotent/open-world truth |
| scope | least privilege required at list and call time |
| approval | whether the effect needs explicit human approval |
| limits | pagination, bytes, rate, timeout, retries |

Prefer user outcomes over mirroring REST endpoints. Keep arbitrary shell, unrestricted filesystem/network, hard delete, and “manage anything” tools absent unless they are the product itself and have a separately reviewed safety model.

## 2. Build one application core, not one server per host

Read [MCP core](../../../cn-mcp-core/README.md), [transport](../../../shared/transport.md), and [modern protocol](../../../shared/modern-protocol.md).

Rules:

1. One MCP endpoint delegates to existing domain/service handlers.
2. Authentication happens before catalog construction and dispatch.
3. Policy, scope, approval, audit, redaction and timeout logic are shared across protocol eras and host wrappers.
4. Host-specific differences belong in registration/package metadata, not business behavior.
5. Prefer an official Tier-1 MCP SDK for new implementations. Hand-written JSON-RPC requires stronger protocol tests.
6. Support the protocol eras the real clients need; do not advertise revisions or extensions you do not implement.
7. For a remote write surface, prefer a deployment kill switch plus a maximum-scope ceiling that can fail closed without a code change.
8. Version/hash a dynamic or cacheable tool catalog so clients and operators can prove which public contract they loaded.

For modern MCP, treat each request as self-describing and stateless at the protocol layer. Keep legacy initialize support only when target clients still need it.

## 3. Make identity and OAuth a security boundary

For private developer use, a bearer phase can be useful. For consumer-hosted connections, read [OAuth](../../../shared/oauth.md) before exposing the endpoint.

Non-negotiable:

- identity and tenant come from the validated credential, never tool arguments;
- membership/ownership is rechecked on every call;
- issuer, audience/resource, expiry, revocation and scopes are enforced per request;
- discovery documents use canonical trusted origins;
- PKCE is S256; redirects are exact-match allowlisted;
- use current client-metadata guidance for new OAuth work and keep legacy registration only when compatibility requires it;
- raw access tokens, auth codes, secrets and upstream authorization headers never enter logs, tool results or skills.

A scope that is merely advertised is not enforcement. Test catalog visibility and call-time refusal independently.

## 4. Treat every tool descriptor as public API

Read [results](../../../shared/results.md).

For every tool:

- stable name and human title;
- task-oriented description that says when to use it and, when needed, when not to;
- closed object input schema with every property described;
- exact object output schema when structured content is returned;
- truthful security schemes and all safety annotations;
- concise text plus equivalent structured content from one normalized payload;
- identifiers/cursors needed by the next call;
- bounded result size.

A tool execution failure should normally be a tool result with `isError: true`; malformed protocol/dispatch belongs in JSON-RPC error. Authorization failures must also carry the HTTP challenge needed to reconnect.

## 5. Handle files and URLs as a separate threat surface

If any tool accepts or returns files/images, read [file inputs](../../../shared/file-inputs.md) before implementation.

Authorize before fetching. Allow safe schemes only, block private/link-local/metadata targets, bound redirects/time/bytes/type, sanitize basenames, and never expose absolute local paths or durable storage credentials.

## 6. Add workflow skills only for behavior the catalog cannot teach well

A skill is workflow policy, not a duplicate tool schema. Keep `SKILL.md` concise; put detailed policies/examples in `references/`, templates in `assets/`, and deterministic helpers in `scripts/` only when instructions/tools are insufficient.

Good skill content includes:

- non-obvious multi-call order;
- “stop, do not retry” refusal semantics;
- destructive-action confirmation;
- how to obtain opaque ids;
- domain rules or recovery paths.

See [reference patterns](references/reference-patterns.md) for the patterns distilled from MSO, CareerPack, Connectors Gateway and archived production plugins.

## 7. Package portable-first, compatibility-aware

Read [ChatGPT/Codex packaging](../../../cn-gpt-plugin/package.md) after the live MCP works.

For a new portable Agent Plugin, prefer:

```text
plugin.json
mcp.json          # only when the package declares an MCP server
skills/           # only when workflows add value
assets/           # optional
.codex-plugin/plugin.json  # optional compatibility layer
```

Keep OpenAI-specific presentation/app bindings in the documented OpenAI extension layer. Do not rename a legacy `.mcp.json` to `mcp.json` blindly: the portable MCP schema has its own transport declaration.

Never invent a registered app/connection id. Never commit user credentials.

## 8. Build tests around silent contract drift

Read [testing](../../../shared/testing.md) and [security gate](../../../shared/security-checklist.md).

Minimum production gates:

- exact `tools/list` snapshot or deterministic catalog contract;
- descriptor invariants over every tool;
- input/output schema fixtures including empty/not-found branches;
- scope visibility plus call-time authorization;
- direct, indirect, follow-up and negative golden prompts;
- realistic behavioral evaluations with independently verified answers when the catalog is substantial;
- protocol matrix for every advertised revision;
- OAuth refusal/replay/audience/issuer/redirect tests when OAuth exists;
- policy/approval single-use and canonical-input tests;
- redaction and secret-shaped output tests;
- plugin/skill path + placeholder + version contract tests;
- clean typecheck/lint/test/build for the target project.

Do not auto-update snapshots just to make CI green. Review the public contract diff.

## 9. Deploy, then prove the real path

Source/build success is not live success. Verify:

1. deployed health/version and exact MCP origin;
2. OAuth discovery and unauthenticated challenge;
3. authenticated catalog with the expected identity/scope;
4. one read through the deployed MCP;
5. one write or approval-gated write when supported;
6. revocation/insufficient-scope behavior;
7. modern and legacy paths when both are advertised;
8. host metadata/tool rescan after descriptor changes;
9. fresh plugin installation when packaging is in scope;
10. runtime error/timeout health, restart suppression and audit durability for supervised production gateways.

Use the host/official SDK or MCP Inspector for wire proof; do not make a home-grown client the only interoperability evidence.

## 10. Handoff contract

Return:

- what was built and why this surface was chosen;
- public tools/resources/skills and authority model;
- exact tests/build commands and results;
- deployment/runtime evidence;
- host/plugin packaging state;
- anything still unverified;
- rollback path and external rescan/reconnect steps.

Never claim “production-ready” from source inspection alone. If live acceptance is unavailable, say exactly which layer remains unproved.
