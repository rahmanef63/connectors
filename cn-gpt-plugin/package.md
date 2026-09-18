# package.md — bundle a working MCP server into a portable plugin

**Scope:** packaging a working MCP server and optional workflow skills for ChatGPT/Codex, with portable Agent Plugin files as the default and the older Codex package layout as a compatibility fallback.
**Assumes:** the MCP server already works; hosted ChatGPT registration is covered by [`register.md`](./register.md), and public directory review remains in [`publish.md`](./publish.md).

Registration and packaging are different jobs:

- **registration** creates the hosted MCP connection and its OAuth link;
- **packaging** gives that connection a stable plugin identity, optional skills, assets and installation source.

Do not package a guessed URL as a replacement for registration. For a hosted ChatGPT MCP connection, `.app.json` points at the technical id ChatGPT created.

## New packages: portable Agent Plugin first

Current OpenAI documentation makes the portable package the default for new work:

```text
my-plugin/
├── plugin.json          # required portable manifest
├── mcp.json             # optional portable MCP server declarations
├── skills/              # optional workflow skills
├── assets/              # optional listing assets
├── .app.json            # optional registered OpenAI app mapping
└── .codex-plugin/
    └── plugin.json      # optional compatibility settings layer
```

Keep `plugin.json`, `mcp.json`, `skills/` and `assets/` at the package root. A separate `.codex-plugin/plugin.json` remains supported as a compatibility fallback, but it is no longer the canonical identity for a new portable package.

Do **not** rename a legacy `.mcp.json` to `mcp.json` and call it migrated. Portable MCP config has its own schema and an explicit transport type.

### Portable `plugin.json`

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-app",
  "version": "0.1.0",
  "description": "Use My App through reviewed MCP tools and reusable workflows.",
  "author": {
    "name": "YOUR_TEAM",
    "url": "https://APP_ORIGIN"
  },
  "homepage": "https://APP_ORIGIN",
  "license": "MIT",
  "keywords": ["mcp", "productivity"]
}
```

Portable components use fixed root locations. Do not invent alternate paths for `skills/` or `mcp.json`.

### OpenAI-specific presentation

Put OpenAI-specific display settings and registered-app mappings in `extensions.com.openai`:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-app",
  "version": "0.1.0",
  "description": "Use My App through reviewed MCP tools and reusable workflows.",
  "extensions": {
    "com.openai": {
      "apps": "./.app.json",
      "interface": {
        "displayName": "My App",
        "shortDescription": "Read and update My App",
        "longDescription": "Use reviewed My App MCP tools and workflow skills.",
        "developerName": "YOUR_TEAM",
        "category": "Productivity",
        "capabilities": ["Read", "Write"],
        "websiteURL": "https://APP_ORIGIN",
        "privacyPolicyURL": "https://APP_ORIGIN/privacy",
        "termsOfServiceURL": "https://APP_ORIGIN/terms",
        "defaultPrompt": [
          "Show my recent records in My App.",
          "Create a new record after confirming the details."
        ]
      }
    }
  }
}
```

When `extensions.com.openai` exists, treat it as the OpenAI settings authority instead of maintaining a second drifting copy in the compatibility layer.

### Portable `mcp.json`

Remote Streamable HTTP example:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "my-app": {
      "type": "streamable-http",
      "url": "https://mcp.example.com/mcp"
    }
  }
}
```

This is package configuration, not a credential store. Never embed a user's bearer token, API key, OAuth secret or session cookie.

### Registered hosted connection and `.app.json`

A hosted ChatGPT connection can still require a workspace-specific mapping. Register the live MCP first and use the exact technical id returned by that registration:

```json
{
  "apps": {
    "my-app": {
      "id": "plugin_asdk_app_ID_FROM_CHATGPT",
      "required": true
    }
  }
}
```

That placeholder is documentation only. Never manufacture a real-looking id or copy one from another workspace and assume it resolves. The mapping is package configuration; the MCP server still authenticates and authorizes the real user on every request.

### Compatibility-only layout

Existing packages and current plugin-creator output may still use:

```text
my-plugin/
├── .codex-plugin/
│   └── plugin.json
├── .mcp.json
├── .app.json
├── skills/
├── hooks/
└── assets/
```

That layout remains supported. Maintain it when an existing package or tool explicitly uses it, but prefer the portable root format for new packages.

A compatibility manifest may point to `./skills/`, `./.mcp.json` and `./.app.json`. Keep every referenced path inside the package root and do not assume legacy `.mcp.json` shares the portable `mcp.json` schema.

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

Portable packages discover `skills/` at the package root automatically. A `skills: "./skills/"` pointer belongs only to the older compatibility manifest shape. Do not maintain both as competing sources of truth.

When one skill specifically requires an MCP server, declare that dependency in its `agents/openai.yaml` using the current documented MCP dependency form; dependency metadata does not replace runtime authentication or clear workflow instructions.

## MCP server declarations stay schema-specific

For a portable package, use root `mcp.json` with the Agent Plugins MCP schema and the transport `type` required by that schema. The remote Streamable HTTP form is shown above.

For an older compatibility-only package, keep its existing `.mcp.json` contract and validate it against the tooling that consumes that layout. Do not make a single JSON file pretend to satisfy both formats.

Do not put a remote user's OAuth token, API key or client secret in either shape. Hosted user auth belongs to the remote server's OAuth flow; local secrets belong in the user's secret store or environment, never in the plugin archive.

## Repository marketplace

A repo-scoped marketplace lives at:

```text
.agents/plugins/marketplace.json
```

Minimal shape:

```json
{
  "name": "my-team-plugins",
  "interface": {
    "displayName": "My Team Plugins"
  },
  "plugins": [
    {
      "name": "my-app",
      "source": {
        "source": "local",
        "path": "./plugins/my-app"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
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
├── plugin.json                      # portable package identity
├── mcp.json                         # portable MCP declarations, when needed
├── skills/                          # reusable workflow intent
├── .app.json                        # optional OpenAI registered-app mapping
├── .codex-plugin/plugin.json        # optional OpenAI compatibility settings
└── .claude-plugin/plugin.json       # optional Claude packaging
```

Do not force one vendor's manifest schema into another vendor's file. The MCP endpoint and skill intent can be shared; registration and presentation metadata cannot.

## Package contract tests

Run these before installation or publication:

- portable `plugin.json` parses and declares the expected Agent Plugins schema;
- portable `mcp.json`, when present, parses, declares the MCP schema and gives every server an explicit transport `type`;
- `.codex-plugin/plugin.json`, when retained, is compatibility metadata rather than a second portable identity;
- `name`, `version` and `description` are non-empty and intentionally versioned;
- every OpenAI/compatibility relative path starts with `./`, stays inside the plugin root and exists;
- `.app.json` appears only when a registered hosted binding is required;
- every real app id is target-specific and contains no placeholder marker;
- no secret-shaped value appears in manifests, MCP config, skills, defaults or assets metadata;
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

1. Build and test the MCP server first.
2. Deploy and verify the real HTTPS MCP endpoint plus auth/discovery.
3. Register the hosted connection only when the target host requires registration.
4. Create the portable package; add compatibility metadata only when needed.
5. Run package and skill contract tests.
6. Add it to a local or repository marketplace or other supported source.
7. Restart/refresh the host, install the plugin and open a fresh conversation/session.
8. Run direct, indirect, follow-up, write-confirmation and negative prompts.
9. Refresh/rescan after public tool/metadata changes.
10. Only then continue to public review in [`publish.md`](./publish.md).

## Archive rule

Archived production plugins are valuable evidence for skill style, real interface metadata and compatibility layouts. They are not the authority for the current package root. When an archive conflicts with current OpenAI documentation, follow the current portable contract and preserve the old shape only as an explicit compatibility path.

## Primary sources

- Package structure and manifest fields: <https://developers.openai.com/plugins/build/plugins>
- Developer-mode registration and metadata refresh: <https://developers.openai.com/plugins/deploy/connect-chatgpt>
- Public examples: <https://github.com/openai/plugins>
- Current skill packaging and MCP dependencies: <https://developers.openai.com/plugins/build/skills>
- Draft Skills-over-MCP reference: <https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/sep-draft-skills-extension.md>
