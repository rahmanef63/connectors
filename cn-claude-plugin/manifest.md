# plugin.json, component layout, packaging

**Scope:** the Claude Code plugin format — `plugin.json` fields, where component directories go, `${CLAUDE_PLUGIN_ROOT}`, zipping, and local testing before you publish anything.
**Assumes:** a deployed MCP endpoint per [`../cn-mcp-core/README.md`](../cn-mcp-core/README.md), and that you decided you actually want a plugin (see [`README.md`](./README.md) — most people do not need one).

## Front-load: the manifest is optional

> *"The manifest is optional. If omitted, Claude Code auto-discovers components in default locations and derives the plugin name from the directory name."*

A directory with a `.mcp.json` and a `skills/` folder **is already a valid plugin**. Add `plugin.json` only when you need metadata (version, author, description) or non-default component paths. **If you include a manifest, `name` is its only required field.**

Two rules that cause most first-time failures:

1. `plugin.json` is the **only** thing inside `.claude-plugin/`. Every component directory sits at the **plugin root**. Putting `skills/` inside `.claude-plugin/` makes the plugin load with nothing in it.
2. `name` is kebab-case and is the namespace. Agent `agent-creator` in plugin `plugin-dev` is invoked as `plugin-dev:agent-creator`.

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json        ← the ONLY file in here
├── .mcp.json              ← your MCP server registration
├── skills/<name>/SKILL.md
├── agents/*.md
└── hooks/hooks.json
```

## plugin.json fields

**Metadata** — all optional except `name`.

| Field | Notes |
|---|---|
| `name` | Required if a manifest exists. kebab-case, immutable identity |
| `displayName` | UI label only; never used for namespacing or lookup (v2.1.143+) |
| `version` | semver. Setting it **pins** the plugin — users update only when the string changes |
| `description`, `homepage`, `repository`, `license` | strings |
| `author` | `{name, email, url}` |
| `keywords` | array — a wrong type here is a hard load error |
| `metadata` | free-form; Claude Code never reads it |
| `defaultEnabled` | default `true`; `false` installs disabled (v2.1.154+) |
| `$schema` | editor autocomplete only, ignored at load |

**Component paths** — `skills`, `commands`, `agents`, `workflows`, `hooks`, `mcpServers`, `outputStyles`, `lspServers`, `experimental.themes`, `experimental.monitors`, `userConfig`, `channels`, `dependencies`.

The trap: `skills` **adds to** the default `skills/` scan. `commands`, `agents`, `workflows`, `outputStyles`, `experimental.themes`, `experimental.monitors` **replace** their default directory. All paths are relative and must start with `./`.

**Unrecognized top-level fields are ignored**, so one file can double as a VS Code / Cursor / npm / MCPB-DXT manifest. `claude plugin validate` reports them as warnings; `--strict` promotes warnings to errors.

## Component directories

| Path | Status |
|---|---|
| `skills/<name>/SKILL.md` | current — the recommended layout |
| `SKILL.md` at plugin root | current, for exactly one skill (v2.1.142+). Set frontmatter `name`, or the invocation name falls back to the install dir, which is a **version string that changes every update** |
| `commands/*.md` | still works, but docs say *"Use `skills/` for new plugins"* |
| `agents/*.md` | current. Plugin-shipped agents **may not** declare `hooks`, `mcpServers` or `permissionMode` — rejected for security |
| `hooks/hooks.json` | current (or inline `hooks` in plugin.json) |
| `.mcp.json` | current (or inline `mcpServers`) |
| `.lsp.json`, `workflows/`, `output-styles/`, `bin/` | current. `bin/` files become bare commands on the Bash `PATH` while enabled |
| `themes/`, `monitors/monitors.json` | **experimental** — declare under `experimental.*`; top level warns today and breaks later |
| `settings.json` at plugin root | only `agent` and `subagentStatusLine` are honored |
| `CLAUDE.md` at plugin root | **no-op.** Not loaded as project context. Ship instructions as a skill |

Plugin-bundled MCP servers are addressed as `mcp__plugin_<plugin-name>_<server-name>__<tool>`, and a hook's `server` field is `plugin:<plugin-name>:<server-name>`. A matcher written against the bare server key never fires.

## ${CLAUDE_PLUGIN_ROOT}

Expands to the **absolute path of the plugin's installation directory**. Siblings: `${CLAUDE_PLUGIN_DATA}` (`~/.claude/plugins/data/{id}/`, survives updates) and `${CLAUDE_PROJECT_DIR}`.

| Component | Fields where it resolves |
|---|---|
| Skill / agent content | anywhere in the text |
| Hook and monitor commands | anywhere |
| MCP `stdio` | `command`, `args`, `env` |
| MCP `http` / `sse` / `ws` | `url`, `headers`, `headersHelper` |
| LSP | `command`, `args`, `env`, `workspaceFolder` |

**Why it is mandatory for bundled files:** marketplace plugins are copied into `~/.claude/plugins/cache`, one directory **per resolved version**. A dev-machine path is wrong at runtime, and the path *changes on every update* — so never persist state there, use `${CLAUDE_PLUGIN_DATA}`. Installed plugins also cannot reach outside their own directory: `../shared-utils` fails, and symlinks pointing outside the marketplace are skipped for security. In shell-form hooks, quote it: `"\"${CLAUDE_PLUGIN_ROOT}\"/scripts/x.sh"`; better, use exec form with `args`.

## Packaging

**There is no `.plugin` file format and no `claude plugin pack` command.** Neither appears anywhere in the plugin, marketplace or CLI reference docs. The format is a **plain `.zip`**. (`.mcpb`, formerly `.dxt`, is the Claude *Desktop* bundle — a different thing.)

Either layout installs; `.claude-plugin/` must be at the archive top **or** inside a single top-level folder. Deeper nesting fails. Max **256 MiB**. Distribute via an `archive` marketplace source, which needs Claude Code v2.1.224+.

```
my-plugin.zip                    my-plugin.zip
├── .claude-plugin/              └── my-plugin/
│   └── plugin.json                  ├── .claude-plugin/plugin.json
└── skills/                          └── skills/
```

If the plugin root has `package.json` **plus** `bun.lock`/`bun.lockb` or `npm-shrinkwrap.json`/`package-lock.json`, Claude Code installs deps in the cache dir (`--ignore-scripts`, 60s timeout, cannot be disabled). `yarn.lock` and `pnpm-lock.yaml` are skipped by design. For an npm-source plugin use `npm-shrinkwrap.json` — npm strips `package-lock.json` from published packages.

## Local testing, in order

1. `claude plugin validate ./my-plugin` — checks `plugin.json`, skill/agent/command frontmatter, `hooks/hooks.json`. The community review pipeline runs the same check. Add `--strict`.
2. `claude --plugin-dir ./my-plugin` — loads for one session, no install. Also accepts a zip: `claude --plugin-dir ./my-plugin.zip`. Repeat the flag for several. It **shadows** an installed plugin of the same name for that session.
3. `claude --plugin-url https://example.com/my-plugin.zip` — one-session load of a hosted zip (a CI artifact). Fetch failures land in the `/plugin` **Errors** tab.
4. `/reload-plugins` after edits — reloads plugins, skills, agents, hooks, plugin MCP and LSP servers. Its summary counts only `commands/`, so it can print `0 skills` when your skill did reload. Ignore the count.
5. `claude plugin details <name>` for the component inventory and token cost; `claude --debug` for load errors.
6. Zero-install loop: `claude plugin init <name>` scaffolds `~/.claude/skills/<name>/`, auto-loaded next session as `<name>@skills-dir`, no marketplace involved.

## Worked example — codex, if it shipped a plugin

`codex-build-week` has no plugin today (grep for `.claude-plugin|marketplace.json|CLAUDE_PLUGIN_ROOT`: zero hits). One would be net-new, and would be *only* this `.mcp.json` at the plugin root:

```json
{ "mcpServers": { "temanusaha": {
  "type": "http",
  "url": "https://<deployment>.convex.site/mcp",
  "headers": { "Authorization": "Bearer <MCP_API_KEY>", "X-Action-API-Key": "<agent token>" }
} } }
```

Three things that example encodes. **`type` is required** — an entry with a `url` and no `type` is read as stdio, skipped, and reported as `MCP server "<name>" has a "url" but no "type"`. `streamable-http` is an accepted alias; SSE is deprecated. **The host is `*.convex.site`, not `*.convex.cloud`** — `registerMcpRoutes` in `convex/mcp/routes.ts` mounts `POST /mcp` on the SITE origin only, with `GET` → 405 and `OPTIONS` → 204. **Two secrets per call**, per `convex/mcp/auth.ts`: `MCP_API_KEY` gates the server, and a separate per-tenant agent token alone decides `businessId`; there is a documented single-field fallback, `Bearer <MCP_API_KEY>:<agent token>`, for clients whose form exposes one credential field.

That header pair is exactly why the same server cannot go into the claude.ai connector form as documented — a plugin `.mcp.json` takes arbitrary headers, the connector dialog does not.

## Getting a secret into those headers

Both earlier open questions are answered, and the answer is not `${ENV_VAR}`.

**Substitution in `headers` is limited to a fixed set.** For `http`, `sse` and `ws` servers, the fields `url`, `headers` and `headersHelper` substitute `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` and `${CLAUDE_PROJECT_DIR}` — paths, not secrets. Project `.mcp.json` separately supports **environment-variable expansion** — `${VAR}` and `${VAR:-default}` in `command`, `args`, `env`, `url` and `headers`, with `"Authorization": "Bearer ${API_KEY}"` as the documented example. `TODO: verify` whether that applies to a **plugin-bundled** `.mcp.json`: the plugin table lists only the three path placeholders, but never says plugin servers are excluded, and the reference does say plugin servers get the same environment as manually configured ones.

**The supported way to ship a per-user secret is `${user_config.KEY}`.** User-configuration values substitute into MCP server configs, and the docs are explicit that `headers` is where they belong: *"Put `${user_config.KEY}` in the server's `headers` field instead, which isn't shell-parsed."*

**`headersHelper` is the escape hatch for anything dynamic** — Kerberos, short-lived tokens, internal SSO. Claude Code runs the command at connect time and merges its JSON output into the headers; dynamic headers override static ones of the same name. For a plugin-provided server the helper runs with its working directory set to the plugin root, so a relative path resolves inside the plugin (v2.1.195+). **It cannot read `${user_config.*}`** — that command *is* shell-parsed, and Claude Code reports the server as misconfigured rather than substituting (v2.1.207+). Have the helper read its own config file. It executes arbitrary shell, so at project or local scope it runs only after the workspace trust dialog.

**Yes, a bundled `.mcp.json` can carry an `oauth` object.** It is a `.mcp.json` field, not a CLI-only one: `oauth.clientId`, `oauth.callbackPort`, `oauth.authServerMetadataUrl` (must be `https://`), and `oauth.scopes` — a single space-separated string that pins what Claude Code requests and takes precedence over both the metadata URL and `/.well-known` discovery. Leave `scopes` unset unless a security team needs a subset; since v2.1.196 an unset value means Claude Code asks for whatever `WWW-Authenticate` or protected-resource metadata advertises instead of the whole `scopes_supported` catalogue, which used to trip `invalid_scope`. `offline_access` is appended automatically when advertised, so tokens refresh without a browser round trip.

Distribution of this plugin is [`marketplace.md`](./marketplace.md).
