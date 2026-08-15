# Setup form — every value one click away

**Scope:** the copy-paste-ready connector setup your app renders — the exact string each host wants, the card spec, and a dependency-free `CopyField`.
**Assumes:** the server from [`../cn-mcp-core/`](../cn-mcp-core/README.md) is deployed and answers `POST /mcp`; you are building the settings screen where a user connects it.

## The rule

**Any value the user must move into another application is a copy target.** Not prose telling them what to type — a field with a button. Never make anyone select-drag a token.

The reason, from [code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp):

> "Claude Code also warns when an MCP config value carries hidden leading or trailing whitespace, which often comes from pasting a token with a trailing newline. Claude Code checks `command`, `url`, each `args` entry, and the values and key names under `env` and `headers`… naming the affected fields without echoing their values, for example `Leading or trailing whitespace in: headers.Authorization`. Claude Code doesn't trim the whitespace and uses the values exactly as written."

It warns but does not fix, and it names the field without showing the value — so the user cannot see the stray character. Claude Code is the *only* host here that warns at all; ChatGPT and claude.ai just fail to connect. `writeText(value.trim())` deletes the whole class upstream of every host.

**Placeholders are bare tokens, never `<angle-bracketed>`:** `MCP_ORIGIN`, `MCP_TOKEN`, `SERVER_NAME`. A `<` survives the copy button, lands in the field, and per the warning above nothing downstream flags it.

## Field matrix

| Host | User pastes | Where | Token? |
|---|---|---|---|
| ChatGPT developer mode | `https://MCP_ORIGIN/mcp` | Plugins → **+** → Connection | **No** — OAuth / none / mixed only; ChatGPT "cannot present custom API keys" ([build/auth](https://developers.openai.com/plugins/build/auth.md)) |
| claude.ai custom connector | `https://MCP_ORIGIN/mcp` | Customize → Connectors → **+** | No field; OAuth ID/secret under **Advanced settings** only |
| Claude Code (CLI) | the `claude mcp add` line | terminal | Yes — `--header` |
| Claude Code (project) | the JSON object | `.mcp.json` at repo root | Yes — `${MCP_TOKEN}` |
| Cursor | the JSON object | `.cursor/mcp.json` | Yes — `${env:MCP_TOKEN}` |
| Desktop / stdio-only IDEs | the JSON object | that client's config | Yes — `env` |
| Script / smoke test | the `curl` command | terminal | Yes |

## Copy blocks

### ChatGPT developer mode

Enable it first, and show both paths because the docs disagree: **Settings → Security and login** ([developer-mode](https://developers.openai.com/api/docs/guides/developer-mode.md)) or **Workspace Settings → Permissions & Roles → Connected Data** then **Settings → Apps → Advanced Settings** ([help centre](https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta)). Web only.

```
https://MCP_ORIGIN/mcp
```

The `/mcp` path is required, not inferred: "enter the MCP server URL, including the `/mcp` path" ([connect-chatgpt](https://developers.openai.com/plugins/deploy/connect-chatgpt.md)). Then **Scan Tools**, then **Create**; the app lands in **Drafts**.

#### The modal's actual fields

Transcribed from the **New Plugin** modal, 2026-08-15. This supersedes the `Client ID`/`Token URL` labels in [`./clients.md`](./clients.md), which come from the GPT Actions editor — a different surface with different names.

| Field | Who fills it |
|---|---|
| `Icon (optional)` | you, or nobody. PNG only, 256×256+, **10 KB max** |
| `Name` | you |
| `Description (optional)` | you |
| `Connection` — `Server URL` \| `Tunnel` | you. `Tunnel` is for a server on your own machine |
| the URL field | **you** — this is the one that matters |
| `Authentication` | you — `OAuth` |
| `I understand and want to continue` | you. `Create` stays disabled until it is ticked |

Everything below lives behind **Advanced OAuth settings** and is **discovered from the server**. A populated field there means discovery worked; touching it by hand is how a nearly-working connector breaks.

| Group | Fields |
|---|---|
| Client registration | `Registration method` — `User-Defined OAuth Client` \| `Dynamic Client Registration (DCR)` \| `Client Identifier Metadata Document (CIMD)` |
| Scopes | `Default scopes`, `Base scopes` — both textareas, one value per line or comma-separated |
| OAuth endpoints | `Auth URL`, `Token URL`, `Registration URL`, `Authorization server base`, `Resource` |
| OpenID support | `OIDC enabled`, `OIDC configuration URL`, `OIDC userinfo endpoint`, `OIDC scopes supported` |

Three things that only show up once you are looking at it:

- **DCR and CIMD render as `(Unavailable)`** in the dropdown when the server did not advertise them. The modal states the cause plainly: *"If Registration URL is missing, Dynamic Client Registration will fail."* So a server with RFC 7591 registration must get that URL into its discovery document, or the user is forced onto a hand-made client for no reason.
- **`Resource` is the MCP endpoint, not the origin** — the placeholder is `urn:example:resource`, and it is the RFC 8707 resource indicator, which for our servers is the same string as the Server URL.
- **`OIDC enabled` is greyed out** with *"This server did not advertise an OIDC configuration URL, so OpenID support is unavailable."* That is the normal state and nothing is wrong. OIDC here only lets ChatGPT read the user's email for authorization domain claiming; MCP does not need it.

The claude.ai dialog is four fields against these twenty: `Name`, `Remote MCP server URL`, and under **Advanced settings** an optional `OAuth Client ID` and `OAuth Client Secret`. Both stay empty when the server supports dynamic registration.

**A working card for all of this:** [`../examples/connector-setup/`](../examples/connector-setup/README.md) — React and standalone-HTML versions, config-driven, with a per-field verdict so the user knows which of the twenty inputs are theirs.

### claude.ai custom connector

Both paths below, and every line quoted in this block, come from [Getting started with custom connectors](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp).

Pro/Max: **Customize → Connectors → "+" → "Add custom connector"**. Team/Enterprise, **Owners only**: **Organization settings → Connectors → Add**, then the custom/remote-URL option.

```
https://MCP_ORIGIN/mcp
```

Print two traps beside the field. It **cannot be edited** — "you'll need to remove it first, then re-add it" — so a typo costs a full re-entry. And Claude dials out "from Anthropic's cloud infrastructure, rather than from your local device… including claude.ai, Claude Desktop, Cowork, and the mobile apps": `localhost` never works.

### Claude Code

Every `L` reference in the three blocks below is a line in [code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp).

```bash
claude mcp add --transport http SERVER_NAME https://MCP_ORIGIN/mcp \
  --header "Authorization: Bearer MCP_TOKEN"
```

`-t`/`-H`/`-s` are the short forms (L260-265). Never use `workspace`, `claude-in-chrome`, `computer-use`, `Claude Preview` or `Claude Browser` as `SERVER_NAME` — reserved, silently skipped (L208). Adding proves nothing: it "saves the configuration without validating credentials… A server with bad credentials shows `failed`" (L540).

With an `oauth` object instead of a header:

```bash
claude mcp add-json SERVER_NAME '{"type":"http","url":"https://MCP_ORIGIN/mcp","oauth":{"clientId":"CLIENT_ID","callbackPort":8080}}' --client-secret
```

`--client-secret` is a separate flag, **never inside the JSON** (L687) — masked prompt, keychain storage. Register `http://localhost:8080/callback` on your AS to match (L650).

Project-scoped file:

```json
{ "mcpServers": { "SERVER_NAME": {
  "type": "http",
  "url": "https://MCP_ORIGIN/mcp",
  "headers": { "Authorization": "Bearer ${MCP_TOKEN}" }
} } }
```

`type` is mandatory — "A JSON entry that has a `url` but no `type` is a configuration error… Claude Code skips that server" (L85). `${VAR}` and `${VAR:-default}` expand in `command`, `args`, `env`, `url` and `headers`, so the token stays out of the committed file. An unset variable does not fail the load: Claude Code warns in `claude mcp list` and sends the literal text `Bearer ${MCP_TOKEN}`, which your server answers with 401 (L465-495).

### Cursor

`.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global) — [cursor.com/docs/mcp](https://cursor.com/docs/mcp), fetched 2026-08-13.

```json
{ "mcpServers": { "SERVER_NAME": {
  "url": "https://MCP_ORIGIN/mcp",
  "headers": { "Authorization": "Bearer ${env:MCP_TOKEN}" }
} } }
```

Two ways this file is *not* interchangeable with Claude Code's, despite looking identical. **No `type` key** — Cursor's remote shape omits it, Claude Code errors without it. And the interpolation syntax is **`${env:NAME}`**, not `${NAME}`: Cursor resolves `${env:NAME}`, `${userHome}`, `${workspaceFolder}` in `command`, `args`, `env`, `url` and `headers`. Paste Claude Code's `${MCP_TOKEN}` here and Cursor sends it literally. `TODO: verify` — whether Cursor tolerates an extra `"type": "http"`.

### mcp-remote (HTTPS → stdio, for Desktop and stdio-only IDEs)

```json
{ "mcpServers": { "SERVER_NAME": {
  "command": "npx",
  "args": ["mcp-remote", "https://MCP_ORIGIN/mcp", "--header", "Authorization:${AUTH_HEADER}"],
  "env": { "AUTH_HEADER": "Bearer MCP_TOKEN" }
} } }
```

No space after that colon, on purpose: "Cursor and Claude Desktop (Windows) have a bug where spaces inside `args` aren't escaped when it invokes `npx`, which ends up mangling these values" (geelen/mcp-remote README, fetched 2026-08-13). Same failure class as the whitespace warning. The package self-describes as "experimental". `TODO: verify` — its behaviour against a POST-only streamable-HTTP endpoint; every README example uses an `/sse` URL.

### curl smoke test

```bash
curl -sS -X POST https://MCP_ORIGIN/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2024-11-05" \
  -H "Authorization: Bearer MCP_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}'
```

Those three `params` are the spec-required set. The `MCP-Protocol-Version` header is mandated on every request **after** initialize, not on initialize itself — it is here so the same line works for the follow-up calls ([lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)). Send the version the **server** advertises.

**A 401 is a passing smoke test.** Verified live 2026-08-13 against two independent servers. Server A: no credentials → `401`, `www-authenticate: Bearer realm="SERVER_NAME", error="invalid_token"`; `GET /mcp` → `405`, `allow: POST, OPTIONS`. Server B: `401`, `www-authenticate: Bearer resource_metadata="https://MCP_ORIGIN/.well-known/oauth-protected-resource"`; `GET /mcp` → `405`, `allow: POST`. Expect a 401 and a 405 — the `www-authenticate` form and the `allow` list are per-server, so assert on the status codes, not the strings. That proves DNS, TLS, routing and the auth gate. You are ruling out a `404` (wrong path, or on Convex the `.cloud` origin instead of `.site` — `convex/mcp/routes.ts:1-3`) and a timeout. Say so next to the button, or a reader who sees 401 re-mints a token that was never the problem.

**Two-secret servers need two rows.** The worked example wants both `Authorization: Bearer MCP_API_KEY` and `X-Action-API-Key: AGENT_TOKEN`, with a one-field fallback `Bearer MCP_API_KEY:AGENT_TOKEN` "for clients whose connector form exposes only one credential field" (`convex/mcp/auth.ts:19-31`). Render both; the single-field one is what claude.ai and mcp-remote profiles can hold.

## The setup card your app renders

Per [`../cn-mcp-core/phase-3-admin-ui.md`](../cn-mcp-core/phase-3-admin-ui.md):

| Element | Spec |
|---|---|
| **Tabs** | one per client, matrix order. Same server behind every tab — the tab changes the *string*, never the endpoint |
| **Endpoint row** | `https://MCP_ORIGIN/mcp` as a `CopyField` above the tabs, always visible. Origin from a server constant, never `window.location` |
| **Mint control** | label input + button. Require the label; an unlabelled row is unrevokable in practice |
| **Once-only reveal** | raw token in a `CopyField`, rendered once, with *"this is the only time this value is shown"* beside it, not below the fold. Dismissing is destructive — confirm it |
| **Token table** | `label`, `createdAt`, `lastUsedAt`, `expiresAt`, status, Revoke |
| **No column re-renders the token** | the reveal happens once, from the value in memory. A short stored `tokenPrefix` for identification is fine — the worked example stores one beside the digest (`convex/agent.ts:10`) — but no column may reproduce the full value |
| **Env note** | say plainly that a deploy-wide `MCP_API_KEY` is a fallback and never appears in the table |

## Reference `CopyField`

Dependency-free, framework-plain React. Paste it as-is.

```tsx
"use client";
import { useEffect, useRef, useState } from "react";

/** A value that IS copyable — not a button bolted next to one, so the
 *  affordance can never drift away from the thing it copies. */
export function CopyField({ value, what }: { value: string; what: string }) {
  const [state, setState] = useState<"idle" | "ok" | "manual">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const ref = useRef<HTMLElement>(null);
  // Trailing newlines are the documented cause of "Leading or trailing
  // whitespace in: headers.Authorization". Trim once, here, for every host.
  const clean = value.trim();
  // These rows unmount the moment the flow completes. writeText is awaited, so
  // the unmount can land mid-copy — `alive` stops the resume from arming a
  // timer that this cleanup has already run and can never clear.
  useEffect(() => () => {
    alive.current = false;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    let next: "ok" | "manual" = "ok";
    try {
      // Absent on insecure origins; throws when the permission is denied — one catch handles both.
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(clean);
    } catch {
      // Select the text so it stays one Ctrl+C away. A dead button is worse.
      next = "manual";
      const node = ref.current;
      if (node && window.getSelection) {
        const r = document.createRange();
        r.selectNodeContents(node);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
    }
    if (!alive.current) return;
    setState(next);
    if (timer.current) clearTimeout(timer.current);  // rapid clicks must not stack resets
    timer.current = setTimeout(() => setState("idle"), 1600);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
      {/* render the trimmed value: the fallback selects this node */}
      <code ref={ref} style={{ flex: 1, wordBreak: "break-all", fontSize: ".8rem" }}>{clean}</code>
      <button type="button" onClick={() => void copy()}
              aria-label={`copy ${what}`} title={`copy ${what}`}
              style={{ flexShrink: 0, cursor: "pointer", whiteSpace: "nowrap" }}>
        {state === "ok" ? "copied ✓" : state === "manual" ? "select + ⌘C" : "copy"}
      </button>
      {/* a colour change is not feedback for a screen reader */}
      <span role="status" aria-live="polite"
            style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {state === "ok" ? `${what} copied` : state === "manual" ? `${what} selected — press control C` : ""}
      </span>
    </div>
  );
}
```

**Without React:** give each `<code>` an id, delegate one `click` listener on the card, and run the same `writeText(el.textContent.trim())` → `catch` → `Range`/`getSelection()` sequence — swapping the button's `textContent` and writing the announcement into one shared `role="status"` node. One `setTimeout` handle per button, `clearTimeout` before re-arming.

## Accessibility and security

- **Label what it copies, never a bare "copy".** Across eight near-identical rows, `aria-label="copy"` is useless in a screen-reader rotor: `copy endpoint`, `copy claude code command`, `copy cursor config`.
- **Three states, not two.** `idle` / `ok` / `manual` — the third is where the user must act, so it is the one that matters.
- **Never render a token stored only as a hash.** The reveal happens once at mint, from the value still in memory — see [`./security-checklist.md`](./security-checklist.md).
- **Keep feedback on the button.** A settings or docs page has no toast host mounted; a toast renders nowhere.
- Icons and logos for these cards: [`./icons.md`](./icons.md). Per-host transport and registration detail: [`./clients.md`](./clients.md).
