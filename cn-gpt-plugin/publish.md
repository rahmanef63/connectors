# publish.md — the public directory submission

**Scope:** PATH B only — submitting your MCP server to the **public Plugins Directory** so other people can install it. Path A (connecting the server to your own ChatGPT, no review) is [`register.md`](./register.md); if that is all you need, close this file.
**Assumes:** the server already works end-to-end in developer mode per [`register.md`](./register.md), is reachable at a stable public HTTPS URL, and passes [`../shared/security-checklist.md`](../shared/security-checklist.md).

Portal: `https://platform.openai.com/plugins` → **Create plugin** → **Skills only** or **With MCP** (use *With MCP*; it also covers MCP + skills). Form tabs: Info, MCP, Skills, Prompts, Testing, Global, Submit.

## Gates that reject you before a human ever looks

| Gate | What it means | Failure |
|---|---|---|
| **Apps Management = Write** | Org role permission at `https://platform.openai.com/settings/organization/people/roles`. Underlying: `api.apps.write` / `api.apps.read`. Org owners have it automatically. | portal won't let you submit |
| **Verified identity** | Complete individual or business verification at `https://platform.openai.com/settings/organization/general`, then select it in **Developer Identity**. "Publishing under an unverified individual or business name **will result in rejection**." | rejection |
| **Domain verification** | Serve the exact token at `https://<challenge-base-host>/.well-known/openai-apps-challenge`. Return **only that plugin's token** — not JSON, not a list, not multiple tokens. | `domain_verification_required` |
| **Public reachability** | Secure MCP Tunnel "does not support public plugin submission or distribution". A private server needs a public HTTPS proxy in front of it. | can't connect |
| **Data residency** | "For now, projects with EU data residency cannot submit plugins with MCP servers for review." Use a global-residency project. | blocked |
| **Not a reference** | "You cannot submit a plugin that references an existing, already-published integration" — submit the server from scratch through the portal. | rejection |

Challenge-URL detail: **Challenge Base URL** is optional and must be the MCP host or a **parent** host; **paths are ignored**. MCP at `https://api.example.com/mcp` → default challenge `https://api.example.com/.well-known/openai-apps-challenge`, with `https://example.com` usable as the parent origin. Two plugins that share a host and differ only by path share one challenge URL and **cannot** be separated by tenant paths — use a parent origin, a distinct host, or contact support.

If Platform shows you as verified but the form disagrees, you are submitting from a different org/project than the one where verification happened.

## URL type

| Type | Use | Requirement |
|---|---|---|
| **Universal** | one fixed URL for everyone — the default, pick this | just the URL |
| **Template** | per-workspace URLs, e.g. `https://{workspace}.example.com/mcp` | also an **Example MCP Server URL** that is concrete, working and publicly reachable during review with the submitted test credentials. Placeholders start with a letter, letters/digits/underscores only, unique per URL. "We only support template-based URLs for **trusted developers with whom we have an established relationship**." |

## Scan Tools — what gets frozen

Selecting **Scan Tools** snapshots: tool names, titles, descriptions, input **and** output schemas, security schemes, `_meta` fields, tool annotations, linked UI resource metadata **including CSP**, and the MCP server `instructions`. The published plugin then serves that reviewed snapshot while tool calls hit your live server.

> "Your submission justifications should explain why those server-provided annotation values match each tool's behavior. **They don't override the annotations.**"

Calling a tool "functionally read-only" in prose while the server advertises `readOnlyHint: false` does not work. Fix the server, redeploy, rescan. Tool text is graded here — write it per [`../shared/tool-design.md`](../shared/tool-design.md) before you scan, not after.

## Final-submission checklist

- [ ] Production HTTPS MCP URL, domain challenge served, and a **successful, current** tool scan
- [ ] `readOnlyHint`, `openWorldHint` **and** `destructiveHint` set on every tool, each with a written justification (`annotations_required`, `justification_required`)
- [ ] Positive and negative test cases — each positive one carries a user prompt, expected tool/skill behavior, expected result shape, and test account or fixture data; each negative one carries the scenario, the expected refusal/clarification/safe fallback, and why the plugin should not complete it
- [ ] Demo credentials that work **without MFA, SMS, email confirmation, or private-network access** (required when the server uses OAuth)
- [ ] A **demo-recording URL** showing the main use cases and tools across supported platforms (MCP-backed submissions)
- [ ] Website, support, privacy policy and terms URLs — HTTPS, ≤1024 chars, required for MCP-backed
- [ ] Release notes
- [ ] Screenshots **only** if the scan reports a UI output template (otherwise `screenshots_not_allowed`); if supplied, one PNG/JPEG per starter prompt, **exactly 706 px wide, 400–860 px tall**

**Resolved: five and three, exactly.** [submission.md](https://developers.openai.com/plugins/deploy/submission.md) is inconsistent with itself — its prose says *"at least five positive test cases and three negative test cases"* while its own summary table and pre-flight checklist both say plainly *"five positive test cases and three negative test cases"*. [submission-errors.md](https://developers.openai.com/plugins/deploy/submission-errors.md) — the catalogue of what the portal validator actually rejects — says *"Exactly five positive test cases, three negative test cases, and release notes"*. The validator is the surface that fails you, so it governs. Prepare exactly five and three.

The portal never enumerates auth modes the way developer mode does. What it does demand for an MCP-backed submission: *"public MCP server URL, domain verification access, authentication details, demo credentials if needed, content security policy, and accurate tool metadata"*, and **reviewer credentials that work without MFA, email confirmation or SMS confirmation** — a login wall a human reviewer cannot pass is a rejection.

Instead of gating on auth mode, review gates on **annotations, which are mandatory for every MCP tool**: `readOnlyHint`, `openWorldHint`, `destructiveHint`. Set `openWorldHint: true` for a write tool that can change publicly visible internet state, and `destructiveHint: true` for anything that deletes, overwrites, revokes access, or sends something irreversible.

TODO: verify — whether a **No Authentication** server exposing write tools can pass directory review. Still unstated after sweeping the help centre as well as `developers.openai.com`; already searched, do not repeat. Three sourced facts bound the answer without settling it: review grades **disclosure, not auth mode** — *"if your server advertises `readOnlyHint: false`, describing the tool as 'functionally read-only' in the justification doesn't make the tool read-only"* ([app-review](https://developers.openai.com/plugins/deploy/app-review.md)); the submission checklist presumes auth may be absent — *"authentication details, demo credentials **if needed**"* ([submission](https://developers.openai.com/plugins/deploy/submission.md)); and ChatGPT keeps a runtime backstop regardless — *"Some especially risky actions may be blocked instead of being presented for approval"* ([help centre](https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta)). None of that is permission. A write tool anyone who finds the URL can invoke is a design defect before it is a review question — [`../shared/security-checklist.md`](../shared/security-checklist.md).

## Listing limits

| Field | Rule |
|---|---|
| Package name | ≤64 chars, starts with ASCII letter/digit, only ASCII letters/digits/`_`/`-` |
| Version | semver, ≤64 chars |
| Display name / short description | ≤30 chars each, one line |
| Long description | ≤4,000 chars, line breaks allowed |
| Developer name | ≤80 chars, one line |
| Capabilities | ≤20, each ≤120 chars, one line |
| Starter prompts | ≤3, each ≤128 chars, unique after Unicode/whitespace normalization, **no `@mention`** |
| Brand colors | optional 6-digit hex; light ≥2:1 contrast vs white, dark ≥2:1 vs `#212121` |

Categories (omit it to default to `Other`; an unrecognised value is `plugin_category_unknown`): Productivity, Creativity, Developer Tools, Business & Operations, Data & Analytics, Communication, Education & Research, Security, Finance, Healthcare, Travel, Entertainment, Other. Sizes and formats for the `logo`, `composerIcon` and screenshots — plus the optional MCP-native `serverInfo.icons` — are in [`../shared/icons.md`](../shared/icons.md).

## Only if you ship UI

Declare CSP as `_meta.ui.csp` on the resource contents: `connectDomains` (fetch/XHR), `resourceDomains` (images, fonts, scripts, styles), optional `frameDomains`. The legacy compat key `_meta["openai/widgetCSP"]` uses snake_case and remains the **only** place `redirect_domains` can be set — `_meta.ui.csp` does not support it, so `window.openai.openExternal(...)` targets still need the legacy key. `_meta.ui.domain` is a dedicated origin, "required when submitting a plugin with UI; must be unique per plugin", defaulting to `https://web-sandbox.oaiusercontent.com`.

Nested frames are blocked by default. Adding `frameDomains` opts into iframes and "triggers stricter plugin review"; every external frame domain needs a written explanation (`frame_domain_explanation_required`), and such plugins "are often not approved for broad distribution". Keep allowlists narrow — review checks the declared policy against actual UI behavior.

## Packaging (only when you bundle skills or distribute a plugin)

The manifest is **`.codex-plugin/plugin.json`**. Only `plugin.json` goes inside `.codex-plugin/`; `skills/`, `hooks/`, `assets/`, `.mcp.json` and `.app.json` stay at the plugin root. Paths are relative to the root, start with `./`, and must stay inside it. `name` is kebab-case and stable — "Plugin hosts use it as the plugin identifier and component namespace." Keys: `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, `skills`, `mcpServers`, `apps`, `hooks`, and an `interface` block (`displayName`, `shortDescription`, `longDescription`, `developerName`, `category`, `capabilities`, `websiteURL`, `privacyPolicyURL`, `termsOfServiceURL`, `defaultPrompt`, `brandColor`, `composerIcon`, `logo`, `screenshots`). Scaffold it with the built-in `@plugin-creator` skill, fed the `plugin_asdk_app…` connection ID from [`register.md`](./register.md). Reference plugins: `https://github.com/openai/plugins/tree/main/plugins` (figma, notion, build-web-apps).

Coming from Claude: skills-only plugin → **Skills only**; remote MCP connector → **With MCP**; both → one **With MCP** submission. Local `stdio`-only servers are unsupported (expose public HTTP first), the portal **does not accept `.mcpb`**, and "Claude marketplace listings and approvals don't transfer". A `.claude-plugin/plugin.json` can stay for a direct Claude archive upload — "the portal converts it to `.codex-plugin/plugin.json`". `userConfig` / `${user_config.*}` is unsupported: credentials move to OAuth 2.1 on the remote server, and no secrets in the archive, manifest, instructions or defaults.

## Review, publish, and life afterwards

Submit → OpenAI reviews → **you** choose when to publish ("after OpenAI approves the plugin, the developer chooses when to publish it") → it appears in the directory shared by ChatGPT and Codex. Status shows in the Dashboard plus email. Rejections come with per-check feedback; appeal by replying to the email. Withdraw an in-flight submission with **Cancel Review** — only one version may be published and one in review per MCP server integration at a time. Skill safety/security scans "can take up to 2 hours". Contact press@openai.com before any launch announcement.

**There is no review duration to find.** OpenAI declines to give one: *"Review timelines may vary… Please do not contact support to request expedited review, as these requests cannot be accommodated."* The only published number is the skill safety/security scan, which *"can take up to 2 hours"*. Do not promise anyone a date.

**Discovery reality check:** plugins appear on the directory's main pages "only if OpenAI selects them for enhanced distribution". Otherwise they are findable by exact-name search or direct listing URL, and "developers cannot request enhanced distribution".

Top rejection causes, in the order they actually happen: (1) reviewers can't connect with the given URL/credentials — MFA, SMS, expired creds, internal-network-only; (2) test cases don't produce correct results on every supported ChatGPT and Codex surface; (3) the plugin returns user-related data not disclosed in the privacy policy — strip PII, telemetry, session/trace/request IDs, timestamps, internal account IDs, logs, auth secrets; (4) annotations don't match behavior.

## Post-publication: treat your metadata as a versioned API contract

| You change | You must | Users see it |
|---|---|---|
| Tool list, names, titles, descriptions, schemas, annotations, security schemes, tool `_meta`, server `instructions` | deploy → new draft version → rescan → submit → publish after approval | after publish |
| UI resource URI, or linked resource metadata incl. CSP | same full re-review cycle | after publish |
| Backward-compatible content at the same published UI resource URI | just deploy | after deploy, but ChatGPT may serve cached resource contents **up to one hour** |
| Server-only fix, live tool results, business data | just deploy | immediately |
| MCP server **origin** (`scheme`, `hostname`, or `port`) | create an **entirely new plugin** and redo scan/submit/review/publish | after publishing the new plugin |

The endpoint **path** may change in a new version; the origin never can. Pick the hostname you can live with forever before you submit — see [`../cn-mcp-core/README.md`](../cn-mcp-core/README.md) and, on Convex, the SITE-vs-CLOUD origin trap in [`../shared/convex.md`](../shared/convex.md), since the `*.convex.site` host you mount on is the origin you are locked to.

"Breaking changes to the MCP server contract inside a published plugin aren't currently supported." Removing or renaming a tool, or serving incompatible content at a published UI resource URI, breaks the live version the instant you deploy — roll back rather than wait out a review. Published submissions are locked for safety; every resubmission starts a new review. Removal is by unpublishing the current version or deleting from the portal, and "plugins may be removed if they are inactive, unstable, or non-compliant".

## From a Claude Code plugin

OpenAI publishes a dedicated mapping: [submit-claude-plugin](https://developers.openai.com/plugins/guides/submit-claude-plugin.md). Read it before porting anything.

The structural difference: *"Claude uses separate submission processes for Claude Code plugins and MCP connectors. OpenAI uses one plugin submission with either skills alone or skills and an optional remote MCP server."* And plainly: **"Claude marketplace listings and approvals don't transfer."**

| What you have | OpenAI path |
|---|---|
| Skills-only plugin | Skills-only upload |
| Remote MCP connector | **With MCP** (skills optional) |
| Skills + remote MCP server | **With MCP**, skills in the same submission |
| Only local `stdio` MCP servers | Not supported — expose a public HTTP endpoint, or wait |
| Claude Desktop extension (`.mcpb`) | Portal rejects the file outright |

Directory submissions **must** use **With MCP** and submit the MCP server directly — you cannot enter the directory by referencing an existing app integration.

What has to change in the package:

- `commands/` and `agents/` — convert to skills. Turn each Markdown command into a skill; merge persona instructions into the relevant skill.
- `hooks/hooks.json` — **ChatGPT does not run plugin hooks yet**, and Codex does not run prompt or agent hook handlers. Never make a hook load-bearing for the core workflow.
- **`userConfig` / `${user_config.*}` is not expanded.** This is the one that bites hardest coming from Claude, because `${user_config.KEY}` in `headers` is exactly how you ship a per-user secret there ([`../cn-claude-plugin/manifest.md`](../cn-claude-plugin/manifest.md)). OpenAI's answer: if the plugin needs credentials or persistent user settings, take the **With MCP** path and let the server own them.
- Skills that name Claude — rewrite to provider-neutral language such as "the model". Keep a product name only where the instruction genuinely applies to that product.
- `outputStyles`, `lspServers`, `channels`, `dependencies`, `experimental.*` — fold anything essential into skills, then delete the declaration.
- Claude live artifacts are unsupported; return the content as ordinary conversation output.
- `.claude-plugin/plugin.json` — keep it. The portal converts it to `.codex-plugin/plugin.json` and asks you to confirm normalized fields.
- `.claude-plugin/marketplace.json`, `.mcp.json`, `mcpServers`, `.app.json` — carry no weight here. A skills-only upload excludes MCP and app configuration entirely.

For a direct Claude archive upload the root, or its single top-level directory, must hold `.claude-plugin/plugin.json` with a non-empty `description` and at least one valid skill at `skills/<skill-name>/SKILL.md`.
