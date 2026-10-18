# Connector setup card — a working example

**Scope:** a drop-in settings-page card that turns every value the host forms ask for into a labelled copy button, with an explicit verdict on which fields the user must actually touch.
**Assumes:** your server answers `POST /mcp` and serves `/.well-known/oauth-protected-resource`. The spec behind this is [`../../shared/setup-form.md`](../../shared/setup-form.md).

Two files, same UI, pick one:

| File | For |
|---|---|
| [`ConnectorSetup.tsx`](./ConnectorSetup.tsx) | React 18+ (uses `useId`). No UI kit, no icon package, no CSS file. Typechecks under `strict`. |
| [`connector-setup.html`](./connector-setup.html) | Everything else. Open it in a browser — nothing to build, nothing to install. |

## Adapting it

Edit one object. Every string in every tab derives from it.

```tsx
// Client-side Next.js: literal reads are required for public-variable inlining.
const config = connectorConfigFromEnv({
  NEXT_PUBLIC_MCP_SERVER_NAME: process.env.NEXT_PUBLIC_MCP_SERVER_NAME,
  NEXT_PUBLIC_MCP_ORIGIN: process.env.NEXT_PUBLIC_MCP_ORIGIN,
  NEXT_PUBLIC_MCP_SCOPES: process.env.NEXT_PUBLIC_MCP_SCOPES,
  NEXT_PUBLIC_MCP_DCR: process.env.NEXT_PUBLIC_MCP_DCR,
});
<ConnectorSetup config={config} />
```

The variable names are in [`.env.example`](./.env.example). Public Next.js values are frozen at build time; dynamic lookups through `process.env` are not inlined. To promote one build between environments, load a public config object at runtime instead. See [Next.js environment-variable guidance](https://nextjs.org/docs/app/guides/environment-variables#bundling-environment-variables-for-the-browser).

```bash
NEXT_PUBLIC_MCP_SERVER_NAME="Your app"
NEXT_PUBLIC_MCP_ORIGIN="https://mcp.example.com"
NEXT_PUBLIC_MCP_SCOPES="mcp.read mcp.write"
NEXT_PUBLIC_MCP_DCR="true"
```

The helper accepts `NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`, `REACT_APP_` and unprefixed keys in a supplied record. It does not load `.env` or expose variables itself. Pass your framework's public environment object explicitly (for example, `import.meta.env` in Vite); never pass server secrets to the browser.

Pass the object literally instead when the values are already in hand. Either
way that is the whole required surface. Four fields.

| Field | Why it is required |
|---|---|
| `name` | what the host lists the connector as, and the slug for `.mcp.json` keys |
| `origin` | every URL on the page is built from it — endpoint, OAuth endpoints, discovery doc |
| `scopes` | ChatGPT's **Default scopes** box, one per line |
| `dcr` | flips the whole client-registration story: with it, both hosts leave the client fields empty; without it, they become paste targets |

Optional: `description`, `mcpPath` (default `/mcp`), `clientId`, `clientSecret`, `token`, `oidc`, and `endpoints` to override any path that is not conventional.

Shell examples use Bash/POSIX syntax and always reference an already-set `MCP_TOKEN` environment variable, including when `token` is supplied. JSON examples keep each host's own environment interpolation syntax. No raw bearer is embedded in the copied templates. Reveal a newly minted token only in your authenticated, per-user token UI; never place it in public environment variables or the standalone demo's source.

`clientSecret` is only for a deliberately user-visible OAuth client owned by the signed-in user. Do not pass a shared server/client secret into this browser component. This example supports DCR or manual client registration; `dcr: false` does not establish whether your server supports CIMD.

Both versions support `endpoints` overrides for a separate authorization server. Conventional paths are defaults, not discovery results; check them against the deployed metadata.

## Local verification

The example suite needs Bash and [Node 22.13+ on 22.x or 23.2+](https://nodejs.org/api/module.html#modulestriptypescripttypescode-options), which provides `module.stripTypeScriptTypes`; Node 24+ is a convenient baseline.

```bash
node --test examples/connector-setup/connector-setup.test.mjs
```

The dependency-free checks execute the standalone script and both versions' configuration/guide functions with synthetic values. They do not prove host compatibility, OAuth success, or React rendering.

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

Advanced labels were transcribed from the ChatGPT **New Plugin** modal (2026-08-15, including **Advanced OAuth settings** and **Registration method**) and the claude.ai **Add custom connector** dialog. The Plugins entry path and creation step follow [OpenAI's current connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt), checked 2026-10-18; legacy Apps screens differ.

## What it does not do

- **No token minting.** The card shows values; issuing and revoking credentials is your app's job, and the once-only reveal rules are in [`../../shared/setup-form.md`](../../shared/setup-form.md).
- **No live discovery fetch.** The OAuth endpoints are derived from `origin` using conventional paths. If yours differ, pass `endpoints`. Fetching `/.well-known/oauth-protected-resource` from the browser would be more truthful, but it needs CORS on that route and fails closed in ways a settings page should not.
- **No host detection.** Every tab renders for everyone. Which client someone is setting up is not knowable from the page, and guessing wrong hides the tab they came for.
