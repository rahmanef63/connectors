# marketplace.json, installing, and submission

**Scope:** distributing a plugin to other people — the `marketplace.json` schema, pulling plugins from external source repos, the `strict:false` skills-array form, `/plugin install`, and what submission to Anthropic's catalogs actually is.
**Assumes:** a plugin that already validates locally per [`manifest.md`](./manifest.md), and the server it points at built per [`../cn-mcp-core/README.md`](../cn-mcp-core/README.md).

## Front-load

A "marketplace" is one JSON file in a git repo. Users add it with `/plugin marketplace add owner/repo`, then `/plugin install <plugin>@<marketplace>`. You can run your own in five minutes; getting into Anthropic's is a separate, slower, partly-discretionary thing (§Submission).

**Location: `.claude-plugin/marketplace.json` at the repository root.** Relative plugin `source` paths resolve against the **marketplace root** — the directory containing `.claude-plugin/` — not against `.claude-plugin/` itself.

## Top-level schema

| Field | Req | Notes |
|---|---|---|
| `name` | **yes** | kebab-case, public-facing: `/plugin install x@THIS`. Re-adding a name replaces the old marketplace |
| `owner` | **yes** | object; `owner.name` required, `email`/`url` optional |
| `plugins` | **yes** | array of entries |
| `$schema` | no | ignored at load. Anthropic's catalog uses `https://anthropic.com/claude-code/marketplace.schema.json` |
| `description`, `version` | no | |
| `metadata.pluginRoot` | no | base dir prepended to relative sources, e.g. `"./plugins"` |
| `allowCrossMarketplaceDependenciesOn` | no | other marketplaces your plugins may depend on |
| `renames` | no | old name → new name, or → `null` if removed (v2.1.193+) |

**Reserved names**, blocked for third parties and re-checked on every load: `claude-plugins-official`, `claude-plugins-community`, `claude-community`, `claude-code-marketplace`, `claude-code-plugins`, `anthropic-marketplace`, `anthropic-plugins`, `agent-skills`, `anthropic-agent-skills`, `knowledge-work-plugins`, `life-sciences`, `claude-for-legal`, `claude-for-financial-services`, `financial-services-plugins`, `first-party-plugins`, `healthcare`. Impersonating names like `official-claude-plugins` are blocked too. Separately, `claude plugin validate` rejects `org`, `org-provisioned` and `unknown` as reserved in Claude Desktop, and rejects names Desktop won't sync (≤128 chars, letters/digits/`.`/`_`/`-`, starting with a letter or digit).

## Plugin entry

Required: `name` (immutable slug) and `source`. Optional: any plugin-manifest field (`description`, `version`, `author`, `homepage`, `license`, `keywords`, `displayName`, `metadata`, `defaultEnabled`) plus marketplace-only `category`, `tags`, `strict`, `relevance`, and component fields `skills`, `commands`, `agents`, `hooks`, `mcpServers`, `lspServers`.

**Precedence trap:** if `version` is set in both `plugin.json` and the entry, **`plugin.json` wins, silently.** Pick one place. Update resolution order overall: `plugin.json` version → entry version → git commit SHA → archive SHA-256 (first 12 chars) → `unknown` for npm and non-git local dirs.

## External source repos

| Form | Shape |
|---|---|
| relative | `"source": "./plugins/my-plugin"` — must start with `./`, no `../` |
| github | `{"source":"github","repo":"owner/repo","ref":"v2.0.0","sha":"<40-hex>"}` |
| url (git) | `{"source":"url","url":"https://gitlab.com/team/plugin.git","ref":…,"sha":…}` |
| git-subdir | `{"source":"git-subdir","url":…,"path":"tools/claude-plugin","ref":…,"sha":…}` — sparse partial clone |
| npm | `{"source":"npm","package":"@acme/claude-plugin","version":"^2.0.0","registry":…}` |
| archive | `{"source":"archive","url":"https://…/x-2.1.0.zip","sha256":"<64 hex>"}` — HTTPS only, blocks loopback/link-local/cloud-metadata hosts and bad redirect hops (v2.1.224+) |

When `ref` and `sha` are both set, **`sha` is the effective pin**. Marketplace sources (where the catalog itself lives) take `ref` but not `sha`; plugin sources take both.

**Relative-source gotcha:** relative paths do **not** resolve if the user added your marketplace as a direct URL to `marketplace.json` — Claude Code downloads only that one file. For URL distribution use github / git-subdir / npm / archive.

**Org distribution** (Team/Enterprise, Organization settings → Plugins) is narrower: the marketplace repo must be private/internal, and only `github`, `url` and `git-subdir` plugin sources work — `npm` and `archive` do not.

## strict:false + an explicit skills array

This is the documented way to publish a source repo that ships `SKILL.md` files and **no** `plugin.json`.

| `strict` | Behavior |
|---|---|
| `true` (default) | `plugin.json` is the authority; the entry supplements it; both merge |
| `false` | the entry is the **entire** definition. A component-declaring `plugin.json` in the source is then a conflict and the plugin fails to load: `Plugin <name> has conflicting manifests: both plugin.json and marketplace entry specify components.` |

Each path in `skills` is relative to `source.path`, may be more than one level deep, and registers as `<plugin-name>:<skill-name>`. Live entry from `claude-plugins-official`:

```json
{
  "name": "amd-skills",
  "author": { "name": "AMD" },
  "category": "development",
  "source": {
    "source": "git-subdir",
    "url": "https://github.com/amd/skills.git",
    "path": "skills",
    "ref": "main",
    "sha": "11c8edb0aee051b87640146bae38c82b22dff86f"
  },
  "strict": false,
  "skills": ["./local-ai-use", "./local-ai-app-integration", "./serving-llms-on-instinct", "./tracelens-analysis-orchestrator"]
}
```

`strict:false` and the `skills` array are **independent knobs** — `box` in `claude-plugins-official` uses `skills` without `strict:false`, because its source does have a manifest. Worth knowing that in `claude-plugins-community`, the catalog you can actually submit to, both `skills` entries set `strict:false`, so that catalog has no example of the split. For entries rooted at the marketplace itself, listing specific subdirs makes those the complete set; if none of the listed paths exist, the default scan runs anyway.

Catalog shape as a sanity check on your own. Use `claude-plugins-community`, since that is the one you can actually submit to: **2281 entries**, sources `url` 1876 / `git-subdir` 401 / relative 4; only 8 set `strict`, 2 set `skills`, none set `lspServers`, and just **2 declare `mcpServers`** — MCP-backed plugins almost always ship their own `.mcp.json` in the source repo instead, which is what you should do too. (`claude-plugins-official` is a different shape and closed to submissions: 287 entries, `url` 150 / `git-subdir` 84 / relative 53, 15 `strict`, 4 `skills`, 12 `lspServers`, 0 `mcpServers`.)

## Installing

```bash
/plugin marketplace add owner/repo           # or a git URL#ref, a URL to marketplace.json, or ./local/path
/plugin install my-plugin@my-marketplace
claude plugin install my-plugin -s user      # scopes: user (default) | project | local
```

`project` scope writes `.claude/settings.json` and travels with the repo; `local` writes `.claude/settings.local.json`. `--config key=value` sets a `userConfig` option. If the install summary says `Run /reload-plugins to activate.`, run it. `/plugin marketplace add` also takes `--scope` and `--sparse <paths...>`; a bare host with no scheme is rejected (v2.1.196+).

**Renames.** The entry `name` is an immutable slug — renaming it breaks installs with `plugin-not-found`. Change `displayName` for labels. When a rename is unavoidable, add it to `renames` (append-only; validate rejects cycles and chains that don't terminate at `null` or a listed name), and note that remote-source users must re-run `/plugin install` once.

## Submission

Two Anthropic catalogs, and they work differently. **This is the part that costs people time.**

- **`claude-plugins-official`** — registered automatically on your first interactive Claude Code launch. Verbatim from the docs: *"The official marketplace, `claude-plugins-official`, is curated separately. Anthropic decides which plugins to include at its discretion. There is no application process, and the submission form does not add plugins to the official marketplace."* Its README points at a submission form; the docs are the more precise source. Do not plan around getting in.
- **`claude-community`** — the public community marketplace, added manually with `/plugin marketplace add anthropics/claude-plugins-community` and installed as `@claude-community`. Note the mismatch: **repo is `claude-plugins-community`, marketplace name is `claude-community`.**

Community submission: run `claude plugin validate ./your-plugin` first (the review pipeline runs the same check plus automated safety screening), then submit via claude.ai → `https://claude.ai/admin-settings/directory/submissions/plugins/new` (needs a Team/Enterprise org with directory-management access) or Console → `https://platform.claude.com/plugins/submit` (individual authors). Approved plugins are pinned to a commit SHA in the community repo and CI bumps the pin as you push. The public catalog **syncs nightly**, so approval → installable has a lag; check by searching your name in that repo's `.claude-plugin/marketplace.json`.

**Where plugins run now:** claude.ai chat, the Claude Desktop Chat tab and Cowork, via Customize → Plugins → Browse plugins → Install. Skills work in chat and Desktop; hooks and sub-agents run only in Cowork and are greyed out in chat.

**A plugin carries MCP two different ways, and which one you get depends on where the server runs.** A bundled **local** MCP server — *"Plugins may include local MCP servers that run on your computer with the same permissions as any other program you run"*, which an Enterprise admin may have *"disabled … entirely"* — reaches only surfaces with a local process, so Desktop and Cowork, never claude.ai chat. A bundled **connector**, and a Claude connector *is* a remote MCP server — *"plugins can also bundle connectors, so the right services are set up for a workflow without you connecting each one"* — reaches claude.ai chat too, and inherits every connector constraint: *"In Cowork, connectors reach external services through Anthropic's cloud, not through your local network. A custom connector must point to a server that's reachable over the public internet from Anthropic's IP ranges."* For a **remote HTTPS** server, the only kind this repo builds, the connector path is the one you get; the local-server path is someone else's plugin. TODO: verify the on-disk key that declares a bundled connector in a claude.ai plugin. Already searched, do not repeat: a full sweep of `code.claude.com/docs` documents `.mcp.json` for Claude Code only — the plugins reference never says "Cowork" or "claude.ai" once — and the claude.ai help article names connectors without naming any file. Either way a plugin is a distribution channel for **both** Claude Code and claude.ai, not Claude Code alone.

**Shipping the same plugin to OpenAI?** It is a separate submission with its own rules, and Anthropic approvals do not carry over — see [`../cn-gpt-plugin/publish.md`](../cn-gpt-plugin/publish.md), §From a Claude Code plugin.

## Failure modes

| Symptom | Cause |
|---|---|
| `has conflicting manifests` | `strict:false` while the source also declares components in `plugin.json` |
| `Plugin directory not found at path: …` | bad relative `source`, or it needed `metadata.pluginRoot` |
| `Plugin archive integrity check failed` | `sha256` mismatch on an `archive` source |
| Users never get your update | `version` unchanged, or set in both places (plugin.json wins silently) |
| Plugin loads but has no skills | components placed inside `.claude-plugin/` instead of the plugin root |
| MCP server in the plugin fails | missing `${CLAUDE_PLUGIN_ROOT}`, or absolute/`../` paths — see [`manifest.md`](./manifest.md) |
| Connector times out (not a plugin issue) | server unreachable from Anthropic's egress — see [`../shared/pitfalls.md`](../shared/pitfalls.md) |
