# cn-gpts — Custom GPTs via OpenAPI Actions

**Scope:** exposing an existing HTTP API to a ChatGPT Custom GPT as Actions — the OpenAPI 3.1 document, the auth panel, and the GPT Builder config wrapped around it.
**Assumes:** a deployed HTTPS API with stable JSON routes and a per-caller credential. Nothing else.

**This is the one folder that does not require [`../cn-mcp-core/`](../cn-mcp-core/README.md).** Actions are not MCP. A Custom GPT calls your REST routes directly from an OpenAPI document you paste into GPT Builder — no JSON-RPC, no `/mcp` endpoint, no authorization server of your own if a header key is enough. If REST already exists, this is the shortest path to one working AI client.

It is also the narrowest path. Read [when NOT to use this](./openapi-actions.md#when-not-to-use-this) before you invest.

## Decide first

| Your situation | Build |
|---|---|
| ChatGPT specifically, REST already exists, one GPT is enough | **this folder — stop here** |
| ChatGPT *and* Claude.ai / Cursor / Claude Code / your own agent | [`../cn-mcp-core/`](../cn-mcp-core/README.md) — one server, every host |
| Both | both. They are not competitors at the backend layer: same routes, same validation, same audit log, two front doors. |

The worked example does exactly that — six operations as GPT Actions over `/api/*`, eleven as MCP tools over `POST /mcp`, one Convex deployment underneath.

## Files

| File | Read when |
|---|---|
| this one | orienting; choosing Actions vs MCP |
| [`openapi-actions.md`](./openapi-actions.md) | writing the schema, wiring auth, shipping the GPT |

## A Custom GPT package is eight fields, and only one of them is the API

GPT Builder's **Configure** tab. The worked example ships the whole package as a single Markdown file, `GPTs/alfa.md`:

| Configure field | What belongs in it | Worked example |
|---|---|---|
| Name | product name, nothing clever | `alfa.md:15-19` |
| Description | one paragraph, shown in the picker | `alfa.md:21-25` |
| **Instructions** | the entire behaviour contract | `alfa.md:31-149` — **118 lines, the bulk of the package** |
| Conversation starters | 4 prompts that exercise real Actions | `alfa.md:151-160` |
| Knowledge | empty, when data comes from Actions — "Data operasional harus berasal dari Convex melalui Action, bukan file Knowledge yang cepat kedaluwarsa" (`alfa.md:164`) | `alfa.md:162-164` |
| Recommended model | `No Recommended Model` — do not pin a name that changes | `alfa.md:166-168` |
| Capabilities | all four off (Web Search, Canvas, Image Generation, Code Interpreter) for an Action-only GPT | `alfa.md:170-177` |
| Actions | the OpenAPI schema + the auth panel | `alfa.md:179-200` → [`openapi-actions.md`](./openapi-actions.md) |

**The load-bearing fact:** the schema enforces almost nothing about behaviour. `x-openai-isConsequential: true` is the only machine-level gate — it makes ChatGPT hold the call until the user approves (`alfa.md:221`). Confirm-before-mutate wording, never-invent-an-ID, re-read-before-asserting, don't-echo-secrets: all of that is prompt text in Instructions, and it is longer than the schema's prose. Budget your effort accordingly.

## Worked example

`/home/rahman/projects/codex` (`github.com/rahmanef63/codex-build-week`), a Next.js + Convex app:

| Path | What it is |
|---|---|
| `GPTs/temanusaha-actions.yaml` | 234 lines — the schema you paste into GPT Builder |
| `GPTs/action-schema.json` | 784 lines — same 6 operations, plus response examples and the consequential flags |
| `GPTs/alfa.md` | 258 lines — the Configure package and the operationId→route policy table |

## Reference links

- [Getting started with GPT Actions](https://developers.openai.com/api/docs/actions/getting-started)
- [Configuring actions in GPTs](https://help.openai.com/en/articles/9442513-configuring-actions-in-gpts)
- OpenAPI 3.1 spec: https://spec.openapis.org/oas/v3.1.0
