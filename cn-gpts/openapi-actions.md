# OpenAPI Actions — schema, auth, shipping

**Scope:** the OpenAPI 3.1 document a Custom GPT consumes, the auth panel beside it, the privacy-policy gate, and when to abandon this route for MCP.
**Assumes:** you read [`./README.md`](./README.md) and chose Actions. You have HTTPS routes that already work under `curl`.

Four things carry the weight: `servers[0].url`, `security` + `components.securitySchemes`, every `operationId`, and every `description`. Descriptions are load-bearing, not documentation — [getting-started](https://developers.openai.com/api/docs/actions/getting-started.md): *"ChatGPT uses the **info** at the top (including the description in particular) to determine if this action is relevant for the user query."* Get those right and the rest is ordinary OpenAPI. (Whether `servers` entries past the first are used is still undocumented; both worked files declare one.)

## Minimum viable schema

Abridged from `codex/GPTs/temanusaha-actions.yaml` lines 1-33 and 141-146 (`info.description` and the response bodies elided):

```yaml
openapi: 3.1.0
info:
  title: Asisten Pribadi AI — Demo Actions API
  version: 0.1.0
servers:
  - url: https://utmost-snake-682.convex.site
security:
  - ApiKeyAuth: []
paths:
  /api/orders:
    get:
      operationId: list_pending_orders
      summary: Daftar pesanan berstatus PENDING
      description: "Demo-only: membaca pesanan PENDING sintetis Warung Nasi Bu Sari."
      responses:
        "200": { ... }
        "401": { $ref: "#/components/responses/Error" }
components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-Action-API-Key
```

| Element | Rule | Evidence |
|---|---|---|
| `openapi` | `3.1.0` in both worked files | `action-schema.json:2`, `temanusaha-actions.yaml:1` |
| `servers` | exactly one entry, absolute HTTPS origin | `action-schema.json:8-13` |
| `security` | declared globally once, not per-operation | `action-schema.json:14-18` |
| `operationId` | **this is the tool name the model sees.** Unique, snake_case, verb-first | all 6 ops |
| `description` | model-facing prompt context, not docs — say when to use the op | `temanusaha-actions.yaml:23` |
| `additionalProperties: false` | on every request body, so the model cannot invent fields | `temanusaha-actions.yaml:165, 175` |
| `$ref` | internal `#/components/...` refs work; the schema is one pasted blob | throughout |

## Hard limits

From [production](https://developers.openai.com/api/docs/actions/production.md), *"subject to change"*:

| Limit | Value |
|---|---|
| Endpoint `description`/`summary` | **300 characters** each |
| Parameter `description` | **700 characters** each |
| Request and response payloads | **< 100,000 characters** each |
| Request timeout | **45 seconds** |
| Payload content | text only — no images, no video |
| OAuth domain | must match the primary endpoint domain, except Google, Microsoft and Adobe |

No operation-count or total-schema-size ceiling is documented. Both worked files declare one server and 6 operations.

**"Custom headers are not supported"** is on that same list, and it reads like it forbids the worked example's `X-Action-API-Key`. It does not. That line governs headers you declare **in the OpenAPI document** (`parameters: - in: header`). The custom header *name* you type into the API-key auth panel is a different mechanism and is the documented flow. Nothing on a fetched page says this outright — the two facts simply live on different pages — so treat the spec as the place you cannot put a header.

## `operationId` is a cross-surface contract

Keep the same name on every front door you build. In the worked example the 6 GPT `operationId`s, the 11 MCP tool names and the 11 CLI ops are one vocabulary — `convex/mcp/tools.ts:1-3` states the rule outright: "one tool per published `/api/agent/*` operation, named with the SAME operationId the Custom GPT schema and the harness skill already use."

Renaming an `operationId` later invalidates every Instructions block, test, and sibling client that referenced it.

## `x-openai-isConsequential`

The only machine-enforced safety flag in the whole surface. `alfa.md:221`: mutations (`POST`, `PATCH`, `DELETE`) are always `true` so ChatGPT holds the call until the user approves; reads are always `false`.

```json
"operationId": "create_order",
"x-openai-isConsequential": true,
```
— `action-schema.json:87` and `:91`; the intervening `summary`, `description` and `tags` are elided

**Absent is not unsafe.** [`developers.openai.com/api/docs/actions/production`](https://developers.openai.com/api/docs/actions/production): *"If the field isn't present, ChatGPT defaults all GET operations to `false` and all other operations to `true`."*

So the flag appearing 6 times in `action-schema.json` (`true` at 91, 214 — both mutations; `false` at 40, 325, 374, 411 — all GETs) and **zero** times in `temanusaha-actions.yaml` is cosmetic: every explicit flag restates the default, and the two files behave identically. `alfa.md:187` step 5 telling the reader to paste the YAML is fine. Set the flag explicitly only to invert a default — a GET that is consequential, or a mutation that is not.

## Auth

The Actions panel's Authentication selector, then the schema must match it.

| Option | Worked example | Notes |
|---|---|---|
| API key → **Custom header** | **yes** — header `X-Action-API-Key`, value from the Convex env var `ACTION_API_KEY` (`alfa.md:184-186`) | matches `type: apiKey, in: header, name: X-Action-API-Key` (`temanusaha-actions.yaml:142-146`) |
| API key → Basic / Bearer | not used | same panel, different wire prefix |
| None | not used | public read-only APIs only |
| OAuth | not used | for per-user connection, ChatGPT's OAuth path is the MCP connector route → [`../cn-mcp-core/`](../cn-mcp-core/README.md) |

Labels confirmed — [authentication](https://developers.openai.com/api/docs/actions/authentication.md): *"To specify the authentication schema for your action, use the GPT editor and select **"None"**, **"API Key"**, or **"OAuth"**."* Three top-level choices, defaulting to None; Basic / Bearer / Custom-header is a sub-choice under API Key. OAuth asks for client ID, client secret, authorization URL, token URL and scope, and its callback is `https://chatgpt.com/aip/{g-YOUR-GPT-ID}/oauth/callback` (the older `chat.openai.com` form is still valid) — register **both** or sign-in fails.

**The credential is per-GPT, not per-user.** Whoever configures the GPT types one key, and every conversation in that GPT uses it. The worked example handles multi-tenancy by making each owner build their own GPT: dashboard → Agent Setup → mint a token → paste that workspace's generated OpenAPI JSON into their own GPT Builder (`alfa.md:195-198`, `alfa.md:24`). Registration steps, verbatim order (`alfa.md:183-189`): Create new action → Authentication = API key → Custom header → header name → key value → paste schema → confirm the operationIds are detected → Privacy Policy URL.

**Never make the tenant a request field.** The backend derives it from the credential — `alfa.md:83`: "backend mengunci tenant. Jangan meminta/mengirim `businessId`." A tenant-shaped parameter in an Action schema is a cross-tenant hole, because the model fills it from conversation text.

## Privacy policy

`alfa.md:189`: a private demo may leave the Privacy Policy URL blank; before sharing the GPT via public link or the GPT Store you must supply a valid public privacy-policy URL.

The gate, confirmed: **private GPT → not required. Public link or GPT Store → required.** Publishing without one is blocked with `Public actions require valid privacy policy URLs`. See [Sharing and publishing GPTs](https://help.openai.com/en/articles/8798878-sharing-and-publishing-gpts) and [Troubleshooting GPTs](https://help.openai.com/en/articles/11325361-troubleshooting-gpts). Note `help.openai.com` returns **403 to automated fetches**, so those two pages must be opened in a browser to re-check.

TODO: verify what "valid" means mechanically — builders report the error while a policy URL *is* configured, which suggests the URL is fetched and must return 200 public HTML, but no page states the check.

Different gate from the OpenAI plugins directory, which requires a privacy-policy URL for every MCP-backed submission — HTTPS, ≤1024 chars, matching your verified publisher identity, and disclosing every data category you return. See [`../cn-gpt-plugin/publish.md`](../cn-gpt-plugin/publish.md).

## Two files, same spec, different fidelity

The worked example commits both and `alfa.md:191` requires identical operation IDs, paths and schemas across them: `action-schema.json` (784 lines) carries full response examples plus the 6 consequential flags, `temanusaha-actions.yaml` (234 lines) is `$ref`-only and flagless. Worth the duplication only if something else consumes the JSON — otherwise keep one file.

## Gotchas

| Symptom | Cause | Fix |
|---|---|---|
| Two schemas fight over the same names | Demo and Workspace schemas share `operationId`s but different path prefixes | never install both on one GPT (`alfa.md:200`) |
| Mutation fires with no confirmation | it is a GET that mutates — GETs default to `false` | make it POST/PATCH/DELETE, or set `x-openai-isConsequential: true` explicitly |
| GPT invents an order/product ID | Instructions never forbade it | "Jangan pernah mengarang ID" + look it up with a read op first (`alfa.md:90`) |
| GPT reports stale numbers | other clients wrote between turns | Instructions must force a re-read on the same turn (`alfa.md:40`) |
| **Test** button fails, `curl` works | schema/auth/description mismatch, or the workspace blocks the domain | check custom-header auth, then allowlist the Action domain (`alfa.md:253`) |

## When NOT to use this

**Short answer: Actions are per-GPT and OpenAI-only. MCP is one server every host reaches.** If any row below is true, build [`../cn-mcp-core/`](../cn-mcp-core/README.md) instead.

| Signal | Why Actions cannot carry it |
|---|---|
| A second host matters — Claude.ai, Cursor, Claude Code, your own agent | an Action exists inside one GPT inside OpenAI's product; nothing outside ChatGPT can read your schema |
| More than one GPT needs the surface | each GPT holds its own pasted copy and its own credential; N GPTs = N copies to keep in sync |
| Users connect their own accounts | the key is typed once by the builder — per-user auth means OAuth, which is the MCP connector path |
| You want revocable, auditable per-user access | there is nothing to revoke but the one shared key |
| The tool surface is large or churning | the schema is pasted text with unverified size limits; a served tool list is not |

Same backend routes either way. Choosing MCP later does not invalidate this schema — the worked example runs both over one Convex deployment.
