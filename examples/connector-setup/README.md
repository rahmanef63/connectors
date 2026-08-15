# Connector setup card — a working example

**Scope:** a drop-in settings-page card that turns every value the host forms ask for into a labelled copy button, with an explicit verdict on which fields the user must actually touch.
**Assumes:** your server answers `POST /mcp` and serves `/.well-known/oauth-protected-resource`. The spec behind this is [`../../shared/setup-form.md`](../../shared/setup-form.md).

Two files, same UI, pick one:

| File | For |
|---|---|
| [`ConnectorSetup.tsx`](./ConnectorSetup.tsx) | React 17+. No UI kit, no icon package, no CSS file. Typechecks under `strict`. |
| [`connector-setup.html`](./connector-setup.html) | Everything else. Open it in a browser — nothing to build, nothing to install. |

## Adapting it

Edit one object. Every string in every tab derives from it.

```tsx
<ConnectorSetup config={connectorConfigFromEnv(process.env)} />
```

Nothing about a deployment is compiled in, so one build serves staging and
production. The variable names are in [`.env.example`](./.env.example):

```bash
NEXT_PUBLIC_MCP_SERVER_NAME="Your app"
NEXT_PUBLIC_MCP_ORIGIN="https://mcp.example.com"
NEXT_PUBLIC_MCP_SCOPES="mcp.read mcp.write"
NEXT_PUBLIC_MCP_DCR="true"
```

`NEXT_PUBLIC_` is the Next.js prefix; `VITE_`, `PUBLIC_`, `REACT_APP_` and no
prefix at all are accepted too, so the same helper works outside Next.

Pass the object literally instead when the values are already in hand. Either
way that is the whole required surface. Four fields.

| Field | Why it is required |
|---|---|
| `name` | what the host lists the connector as, and the slug for `.mcp.json` keys |
| `origin` | every URL on the page is built from it — endpoint, OAuth endpoints, discovery doc |
| `scopes` | ChatGPT's **Default scopes** box, one per line |
| `dcr` | flips the whole client-registration story: with it, both hosts leave the client fields empty; without it, they become paste targets |

Optional: `description`, `mcpPath` (default `/mcp`), `clientId`, `clientSecret`, `token`, `oidc`, and `endpoints` to override any path that is not conventional.

Pass `token` and the Claude Code, Cursor and curl tabs render a real bearer instead of the `MCP_TOKEN` placeholder. Pass `null` and they render the placeholder, which is what you want on a page where nothing has been minted yet.

## Styling

The CSS is scoped under `.cs` and reads `--foreground`, `--muted-foreground`, `--card`, `--muted`, `--border` and `--primary` from the host page, with a dark/light fallback pair of its own. Drop it into a shadcn or Tailwind app and it adopts the theme; drop it into a bare page and it still looks deliberate.

## The part worth keeping if you rewrite it

**Every row carries a verdict.** That is the whole design, and it is why this exists rather than a list of URLs.

| Badge | Meaning |
|---|---|
| `paste` | copy this value into the field |
| `pick` | choose this option from a control |
| `tick` | check this box |
| `auto` | discovery already filled it — paste **only** if you find it empty |
| `leave blank` | do not fill this in |

ChatGPT's plugin modal shows roughly twenty inputs. Fifteen of them are discovered from your `.well-known` documents and should never be typed into by hand — doing so is how someone breaks a connector that was one click from working. A page that lists all twenty as equals is not much better than the modal itself.

So the tab opens with **"the two fields you actually fill"** and everything after it is explicitly demoted. If you rewrite the card in your own design system, keep that ranking even if you drop everything else.

## Field labels are transcribed, not paraphrased

Each row's label is the exact string the host renders — `Remote MCP server URL`, `Authorization server base`, `I understand and want to continue`. A user scanning your card and their modal side by side should be matching identical words. Paraphrasing here costs more than it saves.

Sources: the ChatGPT **New Plugin** modal (including its **Advanced OAuth settings** panel and the **Registration method** dropdown) and the claude.ai **Add custom connector** dialog.

## What it does not do

- **No token minting.** The card shows values; issuing and revoking credentials is your app's job, and the once-only reveal rules are in [`../../shared/setup-form.md`](../../shared/setup-form.md).
- **No live discovery fetch.** The OAuth endpoints are derived from `origin` using conventional paths. If yours differ, pass `endpoints`. Fetching `/.well-known/oauth-protected-resource` from the browser would be more truthful, but it needs CORS on that route and fails closed in ways a settings page should not.
- **No host detection.** Every tab renders for everyone. Which client someone is setting up is not knowable from the page, and guessing wrong hides the tab they came for.
