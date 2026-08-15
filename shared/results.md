# Results — what a tool hands back

**Scope:** the shape of `tools/call` results — text content, `structuredContent`, when declaring an `outputSchema` is a downgrade, and the `isError` rule.
**Assumes:** you have tools that run. What they should be *named* and how granular they should be is [`tool-design.md`](./tool-design.md).

## Two encodings of the same thing

A result carries `content` — an array, in practice one text block — and, since protocol revision **2025-06-18**, may also carry `structuredContent`.

```ts
{
  content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  structuredContent: payload,
  isError: false,
}
```

Send **both**. The text block is what every shipping client reads today and what the model actually consumes; `structuredContent` is what a client can act on without parsing prose. The spec says as much: a tool returning structured content SHOULD also return functionally equivalent unstructured content, for backward compatibility.

**Emit the same object reference in both**, as above. The moment you build the text from one value and the structured field from another, they can disagree, and nothing will ever tell you — the model reads one, your UI reads the other, and they quietly describe different states.

## `structuredContent` must be a JSON object

At 2025-06-18 and 2025-11-25 it is defined as an object. Not an array, not a string, not `null`. (2026-07-28 loosened this to any JSON value, but you are almost certainly negotiating an earlier revision — see [`versioning.md`](./versioning.md).)

Two consequences:

**A list tool must already return an envelope.** `{ items: [...], total }`, not a bare array. If your handlers return bare arrays, that is a reason to fix the handlers, not to wrap only inside `structuredContent` — wrapping in one place and not the other reintroduces exactly the disagreement above.

**A read that finds nothing has no representation.** A `get` returning bare `null` for a missing or foreign record — the normal anti-enumeration answer — simply carries no `structuredContent` on that call. Omitting it is legal, and the text block still says `null`. That is fine, *provided you did not declare an output schema.*

```ts
const isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
...(isPlainObject(payload) ? { structuredContent: payload } : {})
```

## Declaring `outputSchema` is a one-way door

It reads like an additive improvement. It is not.

The spec leaves one question open — does declaring a schema oblige you to return structured content on *every* success? — and **the reference TypeScript SDK resolves it strictly: the client throws when a declaring tool returns a success without `structuredContent`.**

So the moment you declare a schema on a read tool, the "record does not exist yet" branch stops being an answer the model can relay and becomes a client-side exception. For anything a new account has not created yet, that branch is not an edge case — it is the **first thing every new user hits**.

Declare one only where **every** success has a structured value. In practice that is narrower than it sounds, and the honest default for a large tool surface is to declare none, emit `structuredContent` everywhere it is free, and revisit if a consumer ever asks for validation.

The rest of the cost, once declared:

- Adding a key stays additive only while the schema is open; removing or retyping one is breaking. See [`versioning.md`](./versioning.md).
- Handlers usually return `unknown`, so nothing checks a schema against what the code actually returns. The schemas rot silently and the first symptom is a client throwing.
- On some backends a `$`-prefixed key anywhere in a descriptor is fatal to `tools/list` — see [`convex.md`](./convex.md) §11. Inline everything; no `$defs`, no `$ref`, no `$schema`.

## Payload size is a real cost

Both encodings ship on every successful call, so a result roughly doubles on the wire, and on hosts that surface both to the model it doubles in context too. That is fine for an ack and expensive for an unbounded list.

Bound your lists at the query, not at the serializer. A tool that reads a whole table and returns it is a bill and a truncated context, and it was already one before structured content existed.

## `isError` is not the JSON-RPC `error` envelope

A tool that ran and failed returns a **successful** JSON-RPC result carrying `isError: true` and readable text. Only the transport and dispatch layer — unparseable body, unknown method, unknown tool, bad arguments — uses the `error` envelope.

The reason is behavioural, not stylistic: hosts hide protocol errors from the user. A carefully written failure message put in the `error` envelope reaches nobody; the run just stops. In `result.isError` the model reads it, tells the user, and can retry.

The one deliberate exception is authorization. An insufficient-scope refusal belongs in the `error` envelope with a real 403 and an RFC 6750 challenge, because the client — not the model — is what has to act on it ([`oauth.md`](./oauth.md#the-half-that-gets-skipped-actually-checking-it)).

## Never return, in either encoding

Storage ids, internal row ids you do not want quoted back, tokens, signed URLs with a long life, raw email or IP. Everything here lands in a third party's transcript and stays there. If a tool must hand back a file, return a short-lived signed URL and say in the description that it expires — [`file-inputs.md`](./file-inputs.md).
