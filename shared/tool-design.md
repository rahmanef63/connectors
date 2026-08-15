# Tool design — the part that decides whether this is any good

**Scope:** naming, granularity, response shape, descriptions, pagination symmetry and annotations — the surface that decides whether the server is any good.
**Assumes:** you know which operations you want to expose. Nothing about MCP transport is needed to read this.

Auth is where you get hacked; **tool design is where you get ignored**. A correct server with a bad tool surface produces an assistant that picks the wrong tool, burns tokens, and gives up.

## 0. A tool is one of three primitives, and often the wrong one

Everything else in this repo is about tools, because tools are what most apps need. But MCP defines three server primitives, and reaching for a tool by reflex is a design mistake worth catching before you write a hundred of them.

| Primitive | Who decides to use it | Reach for it when |
|---|---|---|
| **Tool** | the **model**, mid-conversation | something happens, or a query needs arguments the model composes |
| **Resource** | the **application**, usually the user picking from a list | you are exposing readable content that exists at a stable address — a document, a record, a file |
| **Prompt** | the **user**, explicitly, as a slash command or menu entry | you are shipping a workflow you want invoked deliberately, not guessed at |

The distinction that matters: **a tool is model-controlled, a resource is application-controlled, a prompt is user-controlled.** Three different things get to decide, and picking the wrong primitive means the wrong actor is in charge.

The common mistake is a read-only `get_document(id)` tool for content the user was going to select anyway. As a tool the model must first *discover* the id — usually by calling a list tool and burning its output into context — then guess whether reading it is wanted. As a resource the host shows a picker, the user attaches what they meant, and no tokens are spent on discovery at all.

Rules of thumb that hold up:

- It **does** something, or it has side effects → tool. Always.
- It is a stable, addressable, readable thing → resource. A tool is a poor substitute for an address.
- Its arguments are computed by the model from the conversation → tool, even if it only reads.
- A user would recognise it as "a thing I run" → prompt.

**Support is not uniform, and the gap runs along the line you would least like.** Verified 2026-08-15:

| Host | Tools | Resources | Prompts |
|---|---|---|---|
| **Claude Code** | yes | yes — `@` mentions, listed alongside files in autocomplete | yes — `/mcp__servername__promptname` |
| **Cursor** | yes | yes — *"structured data sources that can be read and referenced"* | yes — *"templated messages and workflows for users"* |
| **claude.ai** (web connector) | yes | yes — ingested at connect time | yes — ingested at connect time |
| **ChatGPT** | yes | **UI templates only** — `registerResource` + `_meta.ui.resourceUri` bind a component to a tool; nothing documents general `resources/read` | not documented |

The claude.ai row is not from the connector help article, which describes tools and only tools. It is from the Connectors Directory submission portal, whose Tools step states that *"your server's tools, prompts, and resources sync automatically from the connected server"* — you cannot sync what the host does not ingest.

**ChatGPT is the outlier, and it is the one most people build for.** It uses the resource mechanism for something else entirely: `registerResource` serves widget markup, bound to a tool through `_meta.ui.resourceUri`. Nothing documents general-purpose `resources/read` there. So a design that leans on resources as *readable content* degrades to nothing on ChatGPT while working on the other three.

The honest shape: **tools everywhere; resources and prompts as an enhancement that ChatGPT will ignore.** Pick the primitive by what the thing *is* — that decides whether the model, the app or the user is in charge — then check this table before assuming every host will honour it.

Sources, read 2026-08-15: [Claude Code MCP](https://code.claude.com/docs/en/mcp) (§Use MCP resources, §MCP prompts as slash commands), [cursor.com/docs/mcp](https://cursor.com/docs/mcp) (feature-support table), [Submitting to the Connectors Directory](https://claude.com/docs/connectors/building/submission) (§Tools), [plugins/reference](https://developers.openai.com/plugins/reference.md). The ChatGPT row is absence from the docs, not a tested negative.

## 0b. If you might ever list it, annotate from day one

Anthropic's directory makes annotations a **submission requirement**, not advice: *"All tools must include a `title` and the applicable `readOnlyHint` or `destructiveHint`."* The portal groups your tools by annotation on the way in and flags the ones missing it, so this is checked before a human ever reviews you. Everything in §6 below is therefore a gate, not a nicety — and retrofitting titles across a grown tool surface is exactly the kind of change [`versioning.md`](./versioning.md) warns you about.

## 1. Do not mirror your REST API

The instinct is a tool per endpoint. Resist it. Notion, building their hosted server, deliberately moved away from 1:1 API mapping toward agent-oriented tools (`create-pages`, `update-page`, `search`) and put it plainly: you can *"skip RESTful web API practices and ship 'private' functionality slices with LLM-friendly descriptions."*

Design for the task the model is trying to finish, not the table you happen to store.

- ✅ `create_post({title, body, published})` — one call, one outcome
- ❌ `create_draft` → `set_title` → `set_body` → `publish` — four calls, three chances to strand a half-made thing

Composite one-shots are worth their weight: `databases_create_inline(pageId, name, properties)` does create + embed together, so a failure cannot leave an empty page behind.

## 2. Return Markdown, not JSON

Notion's biggest efficiency decision: responses are Notion-flavoured Markdown, chosen over richer JSON because *"Markdown provides efficient content density per LLM token, requiring fewer tool interactions and less cost."*

JSON spends tokens on braces, quotes and repeated keys — none of which the model needs to read prose. Reserve JSON for genuinely structured returns the model must parse field-by-field (ids, counts, cursors); use Markdown for anything a human would read.

```
❌ {"posts":[{"id":"a1","title":"Hello","excerpt":"…","published":true}, …]}
✅ ## Posts (12)
   - **Hello** · `a1` · published — …
```

Always return the identifier the model needs for the next call. Markdown does not mean "drop the ids".

## 3. Say when to use it, and when not to

Descriptions are prompt context, re-read on every call — not documentation. Without explicit cues the model reaches for the most obvious tool, which is usually wrong.

- One WHEN-TO-USE sentence, plus one WHEN-NOT-TO-USE whenever an ambiguous sibling exists.
- Steer off wrong defaults by name: *"markdown tables become STATIC blocks — for a real database use `databases_create_inline`; for side-by-side layout use `pages_append_columns`."*
- State default behaviour: *"DEFAULT to columns for any list of N comparable items instead of stacking vertically."*
- For composites, name the failure being prevented: *"ONE-SHOT — skips the create→get→append chain that strands the page empty when append fails."*
- Inline the enums: valid statuses, slug format, which booleans flip what.

`"Create a blog post. Slug must be unique kebab-case. Set published=true to make it live."` beats `"Create blog post"` every time.

## 4. Truncate loudly

If you cap a list at 30, return the **total** beside it. A silent slice reads to the model as "that is everything", and it will confidently tell the user there are 30 items when there are 300.

## 5. Pagination symmetry

The classic decorative bug: the tool returns `nextCursor` but `inputSchema` never accepts `cursor`, so no client can ever paginate.

Input schema, dispatcher pass-through and handler validator must agree on **arg name, type and nullability**. Same for the response — the dispatcher's destructure must match the handler's return exactly. TypeScript will not catch `{results, cursor}` against `{items, nextCursor}` when the value is typed `any`; the first real call surfaces it as an incoherent "validation error" from the model's point of view.

```
inputSchema:  { cursor?: number; limit?: number }
dispatcher:   passes through, clamps limit 1..100, defaults cursor 0
handler:      args: { userId, cursor?: number, pageSize?: number }   ← names must line up
returns:      { items, nextCursor: number|null, total }
dispatcher:   destructures { items, nextCursor, total } verbatim
```

## 6. Annotations carry real weight

`readOnlyHint` · `destructiveHint` · `idempotentHint` · `openWorldHint`. Hosts use them to decide what to auto-approve. Only the read-only case needs stating: MCP already treats an un-annotated tool as destructive, so adding `destructiveHint: true` everywhere changes nothing.

## 7. Catalog template

Read-only (`readOnlyHint: true`):
- `<resource>_list({cursor?, limit?}) → {items, nextCursor, total}`
- `<resource>_get({id})`
- `<resource>_search({query, limit?})`

Idempotent writes (`idempotentHint: true`):
- `<resource>_set_<field>({id, value})` — narrow per-field setters beat one `_update` mega-tool

Non-idempotent writes:
- `<resource>_create({…}) → {id}`
- `<resource>_create_inline({parentId, …})` — composite one-shot
- `<resource>_append_<thing>({id, …})`

Destructive (`destructiveHint: true`):
- `<resource>_trash({id})` — soft delete, recoverable. Keep hard delete off the MCP surface unless someone explicitly asks for it.

Per-resource native surfaces beat one mega-tool: `pages_*`, `databases_*`, `database_rows_*`. Narrow blast radius, honest annotations, focused descriptions.

For database-shaped tools: map property NAME ↔ internal id inside the dispatcher and never expose the internal id to the model — it thinks in names. Title is usually stored on the record itself, not among the properties; route it separately.
