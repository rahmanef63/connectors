# Testing — what breaks silently, and the cheapest thing that catches it

**Scope:** what to assert about an MCP server, in rough order of value per line of test.
**Assumes:** the server runs and you can call `tools/list`. Debugging a server that does not respond at all is [`cn-mcp-core/phase-1-bearer.md`](../cn-mcp-core/phase-1-bearer.md).

## The problem is that nothing throws

Ordinary bugs announce themselves. The failures specific to this surface do not:

| What changed | What you see |
|---|---|
| a tool renamed | nothing — the model stops choosing it |
| a description reworded | nothing — tool selection shifts across every conversation |
| `destructiveHint` flipped to `false` | nothing — a host stops asking the human first |
| a required scope widened | nothing until a live token calls it and gets 403 |
| a descriptor that fails to serialize | on some backends, `tools/list` returns nothing at all |
| `structuredContent` disagreeing with the text block | nothing — two readers see two states |

None of these fail a typecheck, and most do not fail an integration test either, because the server is behaving exactly as written. Testing here means **pinning intent**, not exercising code paths.

## 1. Snapshot the catalog

The highest value per line in this whole file. Snapshot the exact `tools/list` payload and commit it.

```ts
it("matches the committed contract", () => {
  expect(toolDescriptors()).toMatchSnapshot();
});
```

Two rules make it worth having:

**Build the snapshot from the same function the server serves.** A test that rebuilds the descriptor mapping itself keeps passing while the wire format moves underneath it, which is worse than no test — it is a green light attached to nothing. Extract one `toolDescriptors()` and let both the dispatcher and the test call it.

**The value is entirely in reading the diff.** A rename, a reworded description, a flipped annotation all become a diff someone approves on purpose. A team that reflexively runs `-u` has bought nothing at all, so say that next to the test.

## 2. Assert the invariants a host acts on

Cheap, and they catch the class of bug that turns into a data-loss incident rather than an inconvenience.

- every tool has all four annotations, and they are booleans — a missing hint defaults to the most cautious or the most permissive behaviour depending on the client, and neither is what you chose
- **no write is annotated `readOnlyHint: true`** — that is the one that makes a host auto-approve without asking
- every destructive tool requires the write scope
- a read-only scope set can reach **no** destructive tool
- names match your published convention, and are unique — two domains picking `documents_list` means one silently shadows the other in a name→tool map, and the loser is advertised to the model but dispatches to the winner
- descriptions are non-empty and under any host's cap (OpenAI rejects a function description over 1024 characters, and the whole request fails, not just that tool)
- no `$`-prefixed key anywhere in a descriptor ([`convex.md`](./convex.md) §11)

Write these as loops over the registry, not per tool. One test covers however many tools you grow to.

## 3. Golden prompts

The catalog can be internally perfect and still lead a model to the wrong tool. That is a real defect, and nothing above detects it.

Keep a fixture of prompts with the tool each one should reach:

- **direct** — the user plainly asks for the thing
- **indirect** — the user states a goal without naming the operation
- **negative** — a realistic request that must call **no** tool at all

Aim them at the pairs that are genuinely confusable — list vs get, create vs update, attach vs replace — because those are where wording actually decides the outcome. Write them in the language your users type in.

Two tiers, and be honest about which you have:

**Structural, free, runs in CI.** Every prompt names a tool that exists (this alone catches a rename), every tool has at least one direct prompt (a tool nobody wrote a way to reach is a tool nobody will reach), negatives expect nothing, no duplicates.

**Behavioural, costs money, runs on demand.** Send each prompt plus the whole tool catalog to a model and compare the tool it calls. Three things decide whether the result is usable:

- **A setup failure is not an accuracy result.** A missing key, a 401, a 500 must fail the run loudly with the HTTP body attached. Score them as wrong answers and an unset environment variable reads as 0% accuracy, sending someone off to rewrite tool descriptions. Retry a 429 rather than counting it.
- **Group misses by the confused pair, not by prompt.** Ten prompts all sliding from `x_get` to `x_list` is one wording bug, not ten.
- **Know the bill before you start.** Every request carries the entire catalog, so cost scales with tools × prompts, not with prompts. Sixty-odd tools is roughly 20–25k input tokens *per prompt*. Start with a slice.

A fixture that no model ever reads is not an evaluation. If you only build the structural tier, say so where someone will read it, rather than letting the word "golden" imply more than it does.

## 4. One live call, before you call it done

Not a test — a habit. Response-shape asymmetry survives every test above: the handler returns `{items, nextCursor}`, the dispatcher destructures `{results, cursor}`, TypeScript sees `any` on both sides, and the user gets a vague "validation error" from the model. Make one real call against the deployed endpoint and read the JSON.

## What not to bother with

**Do not mock the protocol.** A hand-written fake client tests your understanding of MCP, which is the thing most likely to be wrong. Use the inspector for the wire and unit-test your handlers directly.

**Do not test that a host connects.** You cannot automate it, it depends on their UI, and it fails for reasons outside your repo. Verify discovery with `curl`, verify the wire with the inspector, and treat the host as manual acceptance.
