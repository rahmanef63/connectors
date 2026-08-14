# Versioning — what you may change without breaking a stranger's assistant

**Scope:** the four things in a connector that carry versions, which edits are additive, which are breaking, and how to retire something without stranding a live client.
**Assumes:** you have a working server. Read [`tool-design.md`](./tool-design.md) first — this is about changing a surface, not choosing one.

A connector has no build step at the consumer. There is no lockfile, no pinned dependency, no deploy they control. You push, and on the next `tools/list` a model somewhere is holding a different contract than the one it learned. Everything below follows from that.

## Four independent version axes

Do not conflate them. They move at different speeds, for different reasons.

| Axis | Lives in | Who breaks when it moves |
|---|---|---|
| **Protocol revision** | `initialize` result | the host application |
| **Tool catalog** | `tools/list` | the model's tool choice |
| **Authorization scopes** | discovery + per-call check | already-issued tokens |
| **Shared package** | `package.json` semver | you, at build time |

Only the last one is a normal dependency with normal semver. The other three ship the moment you deploy.

## 1. Protocol revision — negotiate, never hardcode

A server that pins one revision string and returns it unconditionally is lying whenever the client asked for something else.

Keep a **supported set**. On `initialize`, echo the client's requested revision when it is in the set; otherwise return your latest and let the client decide whether it can live with that. Adding a newer revision to the set is additive. Dropping the oldest is breaking, and there is no signal you can send in advance — check your logs for what clients actually request before removing one.

Bumping the revision you *advertise* is not cosmetic. Later revisions move content shapes, change what is allowed on the wire, and add required headers. Read the changelog for every revision you skip over, not just the one you land on.

The published revisions, and the one thing in each that will bite you:

| Revision | What changed that matters |
|---|---|
| `2024-11-05` | the original. No auth framework, no tool annotations |
| `2025-03-26` | OAuth 2.1, Streamable HTTP, tool annotations, JSON-RPC batching **added** |
| `2025-06-18` | batching **removed**; `structuredContent` + `outputSchema` added; servers become OAuth Resource Servers (RFC 9728); `MCP-Protocol-Version` header required |
| `2025-11-25` | OIDC discovery, icons, incremental scope consent |
| `2026-07-28` | **current** — stateless rewrite: no `initialize` handshake, no session id, per-request version in `_meta`, mandatory `server/discover`, `Mcp-Method`/`Mcp-Name` headers |

Two traps in that table. Batching was added in one revision and removed in the next, so "does the spec support batching" has no answer without a version. And the current revision is not a version bump at all — it deletes the handshake every existing implementation is built around, so "upgrade to current" is a transport rewrite. Implementing the newest revision your hosts actually negotiate is the correct target, not the newest revision that exists.

Being lenient about input costs nothing: keep accepting batches, and do not reject a request over a missing `MCP-Protocol-Version` header. Strictness there breaks working clients to prove a point.

## 2. Tool names are your public API

The name is what a model learned, what a host's "always allow this tool" rule matched on, and what a user's saved prompt refers to.

**Renaming a tool is a breaking change.** There is no redirect. Deprecate instead:

1. Keep the old name registered and working.
2. Point at the replacement in its description — the model reads that and will migrate on its own.
3. Remove it only once nothing has called it for a full usage cycle. You have logs; use them.

Never re-point an existing name at different behaviour. A silent semantic swap is worse than a rename, because nothing anywhere reports an error — the assistant just quietly does the wrong thing on someone's data.

## 3. Schemas — the additive/breaking line

**Input schema.** Additive: a new optional property, a widened enum, a relaxed maximum, a better description. Breaking: making a property required, removing one, narrowing an enum, tightening a constraint, or setting `additionalProperties: false` where it was previously open.

**Output.** Declaring an output schema looks additive and is not — it is a one-way door. The spec leaves one question open (does declaring a schema oblige you to return structured content on *every* success?) and the reference TypeScript SDK resolves it in the strict direction: the client throws when a tool declares an output schema and a successful result arrives without structured content. So any branch that legitimately has nothing to return — the empty read, the record that does not exist yet — turns from "the model says you have not set that up" into a client-side exception, on the branch new users hit first.

Declare one only where **every** success has a structured value. Once declared, adding a key is additive while the schema stays open; removing or retyping one is breaking. And keep sending the unstructured text form alongside it for as long as the protocol allows — that text is what older clients read, and dropping it is invisible until someone's integration goes blank.

**Descriptions are versioned too, even though nothing validates them.** The description *is* the prompt. Rewording one changes tool selection across every conversation, and no test fails. Treat a description edit as a real change with a real diff.

## 4. Scopes — the direction matters

Widening what a tool requires (`read` → `write`) **breaks every token already issued** with the narrower grant, and it fails at call time, long after the user consented. Narrowing is always safe.

If a tool genuinely needs more authority than it used to, that is a new tool with a new name, not a quiet tightening of an old one. Adding an entirely new scope is additive as long as no existing tool starts requiring it.

Flipping `destructiveHint` from `true` to `false` removes a confirmation prompt a host was showing a human. That is a security-relevant edit and deserves the same scrutiny as a permission change — never a drive-by.

## 5. Make the change visible

Every rule above shares a failure mode: nothing throws. The catalog is data, and data drifts silently.

The cheap enforcement is a **snapshot of the exact `tools/list` payload**, committed and diffed in review. Build the snapshot from the same function the server serves, not from a copy in the test — a test that rebuilds the mapping itself keeps passing while the wire format moves underneath it.

Then the workflow is: the snapshot fails, someone reads the diff, and either it was intended or it is a bug. The value is entirely in the reading. A team that reflexively regenerates the snapshot has bought nothing.

## 6. The shared package

Ordinary semver, with one addition: the file contract is a **major**. `openAIFileSchema()` emits a shape a third-party scanner validates, so changing which properties it declares or requires breaks consumers at their integration boundary, not at their type checker.

Vendored copies (a runtime that cannot install from a registry) carry a provenance header with version and checksum. That header is the only thing that tells you a vendored file is three releases stale, so keep it, and re-run the bundler rather than hand-editing the copy.
