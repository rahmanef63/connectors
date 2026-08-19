# package.md — bundle the registered MCP server into a reusable plugin

**Scope:** packaging a working, already-registered MCP connection with optional skills, assets and local MCP servers for ChatGPT/Codex installation and repository marketplaces.
**Assumes:** [`register.md`](./register.md) completed successfully and you copied the real technical connection id beginning with `plugin_asdk_app`; public directory review remains in [`publish.md`](./publish.md).

Registration and packaging are different jobs:

- **registration** creates the hosted MCP connection and its OAuth link;
- **packaging** gives that connection a stable plugin identity, optional skills, assets and installation source.

Do not package a guessed URL as a replacement for registration. For a hosted ChatGPT MCP connection, `.app.json` points at the technical id ChatGPT created.

## Pick one of the two MCP shapes

| What the plugin uses | File | Manifest field |
|---|---|---|
| A remote MCP connection already registered in ChatGPT | `.app.json` | `"apps": "./.app.json"` |
| A server process distributed with the plugin, commonly local `stdio` for Codex | `.mcp.json` | `"mcpServers": "./.mcp.json"` |

A plugin may have both. They are not aliases: `.app.json` is an account/workspace connector binding; `.mcp.json` is a process/server configuration bundled in the package.

## Folder contract

```text
my-plugin/
├── .codex-plugin/
│   └── plugin.json       # required; the only file inside .codex-plugin/
├── .app.json             # optional hosted connection mapping
├── .mcp.json             # optional bundled MCP server config
├── skills/               # optional repeatable workflows
│   └── use-my-app/
│       └── SKILL.md
├── assets/               # optional icon, logo, screenshots
└── README.md              # optional operator notes
```

Every path in `plugin.json` is relative to the plugin root, begins with `./`, and stays inside that root.

## Minimal hosted-MCP package

`.codex-plugin/plugin.json`:

```json
{
  "name": "my-app",
  "version": "0.1.0",
  "description": "Use My App through its authenticated MCP server.",
  "apps": "./.app.json",
  "interface": {
    "displayName": "My App",
    "shortDescription": "Read and update My App",
    "longDescription": "Use My App's reviewed MCP tools and optional workflows.",
    "developerName": "YOUR_TEAM",
    "category": "Productivity",
    "capabilities": ["Read", "Write"],
    "websiteURL": "https://APP_ORIGIN",
    "privacyPolicyURL": "https://APP_ORIGIN/privacy",
    "termsOfServiceURL": "https://APP_ORIGIN/terms",
    "defaultPrompt": [
      "Show my recent records in My App.",
      "Create a new record after confirming the details."
    ],
    "brandColor": "#RRGGBB",
    "composerIcon": "./assets/icon.png",
    "logo": "./assets/logo.png",
    "screenshots": []
  }
}
```

`.app.json` shape:

```json
{
  "apps": {
    "my-app": {
      "id": "plugin_asdk_app_ID_FROM_CHATGPT"
    }
  }
}
```

The string above is explanatory pseudodata. In a real package, replace it with the exact id from the registered connection **before committing or installing**. Never publish an `.app.json` containing `REPLACE_ME`, `TODO`, an empty id or an id copied from somebody else's workspace.

## Add skills only when they encode a workflow

A skill is not a second copy of every tool description. Use one when the plugin should perform a repeatable sequence such as:

```text
inspect current state
→ ask for missing constraints
→ call the least-privilege read tools
→ explain a proposed write
→ execute only after confirmation
→ verify the result
```

Keep business schemas in the MCP server. Keep workflow policy and tool-order guidance in `SKILL.md`. A skill that repeats 40 input schemas will drift the first time the server changes. When the server also exposes the workflow over MCP resources or the draft Skills extension, generate both forms from this same reviewed source and digest.

Add the pointer only when the directory exists:

```json
{
  "skills": "./skills/"
}
```

## Add a bundled local server only when installation owns the process

`.mcp.json` may be a direct map:

```json
{
  "local-helper": {
    "command": "node",
    "args": ["./mcp/server.mjs"]
  }
}
```

or a wrapped map:

```json
{
  "mcp_servers": {
    "local-helper": {
      "command": "node",
      "args": ["./mcp/server.mjs"]
    }
  }
}
```

Do not put a remote user's OAuth token, API key or client secret in either shape. Hosted user auth belongs to the remote server's OAuth flow; local secrets belong in the user's secret store or environment, never in the archive.

## Repository marketplace

A repo-scoped marketplace lives at:

```text
.agents/plugins/marketplace.json
```

Minimal shape:

```json
{
  "name": "my-team-plugins",
  "plugins": [
    {
      "name": "my-app",
      "source": {
        "source": "path",
        "path": "./plugins/my-app"
      },
      "interface": {
        "displayName": "My App"
      }
    }
  ]
}
```

Resolve `source.path` relative to the marketplace root and keep it `./`-prefixed. A marketplace is a catalog, not a second plugin manifest; do not duplicate every interface field unless that catalog intentionally overrides how the entry is shown.

Codex can add a marketplace source from a local path or Git repository:

```bash
codex plugin marketplace add ./local-marketplace-root
codex plugin marketplace add OWNER/REPOSITORY --ref main
```

Use a pinned ref for a team release when an unreviewed `main` change would be too surprising.

## One repository, separate host wrappers

A project may also ship Claude packaging. Keep the shared pieces shared and the wrappers separate:

```text
plugin-root/
├── skills/                         # reusable, provider-neutral workflows
├── .codex-plugin/plugin.json       # OpenAI package identity
├── .app.json                       # OpenAI registered connector mapping
├── .mcp.json                       # bundled MCP processes, when needed
└── .claude-plugin/plugin.json      # Claude package identity, when needed
```

Do not force one vendor's manifest schema into another vendor's file. The MCP endpoint and skill intent can be shared; registration metadata cannot.

## Package contract tests

Run these before installation or publication:

- `.codex-plugin/plugin.json` parses as JSON;
- `name`, `version` and `description` are non-empty;
- every referenced relative path starts with `./`, stays inside the plugin root and exists;
- the manifest version matches the server/package release you intend to ship;
- `apps` appears only when `.app.json` exists;
- `mcpServers` appears only when `.mcp.json` exists;
- every app id is non-empty and contains no placeholder marker;
- no secret-shaped value appears in the manifest, skills, defaults or assets metadata;
- every optional skill has valid frontmatter and resolves its referenced files;
- packaged and MCP-served copies share one source/digest when both exist;
- no draft skills method is the only route to the skill;
- a fresh installation can complete one combined skill → tool → result workflow.

Example placeholder gate:

```ts
const forbidden = /REPLACE_ME|PLACEHOLDER|TODO|plugin_asdk_app_0+/i;
expect(JSON.stringify(appMap)).not.toMatch(forbidden);
```

A real `plugin_asdk_app…` id is not a secret, but it is deployment/workspace-specific. Treat it as configuration provenance: never manufacture one and never copy one without knowing the target workspace can resolve it.

## Install and acceptance sequence

1. Verify the live MCP server in developer mode.
2. Refresh the connection after any metadata change.
3. Copy the real technical id.
4. Generate or write the package.
5. Run the package contract tests.
6. Add it to a local or repo marketplace.
7. Restart/refresh the host, install the plugin and open a new conversation.
8. Run direct, indirect, follow-up, write-confirmation and negative prompts.
9. Only then continue to public review in [`publish.md`](./publish.md).

## Primary sources

- Package structure and manifest fields: <https://developers.openai.com/plugins/build/plugins>
- Developer-mode registration and metadata refresh: <https://developers.openai.com/plugins/deploy/connect-chatgpt>
- Public examples: <https://github.com/openai/plugins>
- Draft Skills-over-MCP reference: <https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/sep-draft-skills-extension.md>
