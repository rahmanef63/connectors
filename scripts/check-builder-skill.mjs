#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = process.cwd();
const skillRoot = join(root, ".agents", "skills", "mcp-project-builder");
const failures = [];
const required = [
  "SKILL.md",
  "contract.yaml",
  join("agents", "openai.yaml"),
  join("references", "reference-patterns.md"),
  join("assets", "mcp-build-plan.md"),
];

for (const rel of required) {
  if (!existsSync(join(skillRoot, rel))) failures.push(`missing ${relative(root, join(skillRoot, rel))}`);
}

function read(rel) {
  return readFileSync(join(skillRoot, rel), "utf8");
}

if (existsSync(join(skillRoot, "SKILL.md"))) {
  const text = read("SKILL.md");
  const lines = text.split(/\r?\n/);
  if (lines.length > 200) failures.push(`SKILL.md must stay <= 200 lines (got ${lines.length})`);
  if (lines[0] !== "---" || !text.startsWith("---\nname: mcp-project-builder\n")) {
    failures.push("SKILL.md must start with reviewed YAML frontmatter and the exact skill name");
  }
  if (!/^description:\s+.+$/m.test(text)) failures.push("SKILL.md must declare a description");
  if (!text.includes("# MCP Project Builder")) failures.push("SKILL.md must contain its H1");
  for (const section of [
    "## 0. Resolve the real target before editing",
    "## 2. Build one application core, not one server per host",
    "## 3. Make identity and OAuth a security boundary",
    "## 8. Build tests around silent contract drift",
    "## 9. Deploy, then prove the real path",
    "## 10. Handoff contract",
  ]) {
    if (!text.includes(section)) failures.push(`SKILL.md missing required lifecycle section: ${section}`);
  }

  const links = [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
  for (const raw of links) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("#")) continue;
    const target = raw.split("#", 1)[0];
    const resolved = resolve(skillRoot, target);
    const escaped = relative(root, resolved).startsWith(`..${sep}`) || relative(root, resolved) === "..";
    if (escaped || !existsSync(resolved)) failures.push(`SKILL.md unresolved link: ${raw}`);
  }
}

if (existsSync(join(skillRoot, "contract.yaml"))) {
  const text = read("contract.yaml");
  for (const token of [
    "version: 1",
    "target: mcp-project",
    "source_of_truth: target-project-and-live-runtime",
    "risk: medium",
    "concurrency: isolated-worktree-when-shared",
    "- host-acceptance",
  ]) {
    if (!text.includes(token)) failures.push(`contract.yaml missing: ${token}`);
  }
}

if (existsSync(join(skillRoot, "agents", "openai.yaml"))) {
  const text = read(join("agents", "openai.yaml"));
  for (const token of ["interface:", 'display_name: "MCP Project Builder"', "short_description:", "default_prompt:"]) {
    if (!text.includes(token)) failures.push(`agents/openai.yaml missing: ${token}`);
  }
}

if (existsSync(join(skillRoot, "references", "reference-patterns.md"))) {
  const text = read(join("references", "reference-patterns.md"));
  for (const source of ["Connectors Gateway", "CareerPack", "MSO", "Baton", "Content MCP builder", "Resources / Create Your MCP", "Rahmanef MCP", "Paperclip MCP", "OpenAI/reference plugin archive"]) {
    if (!text.includes(source)) failures.push(`reference-patterns.md missing provenance: ${source}`);
  }
}

for (const rel of required) {
  const full = join(skillRoot, rel);
  if (!existsSync(full)) continue;
  const text = readFileSync(full, "utf8");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) failures.push(`${rel}: private-key material detected`);
  if (/\b(?:sk|ghp|github_pat|xox[baprs])_[A-Za-z0-9_-]{16,}\b/.test(text)) failures.push(`${rel}: secret-shaped token detected`);
  const appIds = text.match(/\bplugin_asdk_app_[A-Za-z0-9_-]{8,}\b/g) ?? [];
  for (const id of appIds) {
    if (!/^plugin_asdk_app_(?:ID_FROM_CHATGPT|PLACEHOLDER|EXAMPLE|REPLACE_ME|0+)$/i.test(id)) {
      failures.push(`${rel}: concrete registered-app id must not be committed to the builder kit`);
    }
  }
}

for (const router of ["README.md", "AGENTS.md"]) {
  const text = readFileSync(join(root, router), "utf8");
  if (!text.includes(".agents/skills/mcp-project-builder/SKILL.md")) {
    failures.push(`${router}: must route build-from-zero agents to mcp-project-builder`);
  }
}

if (failures.length) {
  console.error(`MCP builder skill contract failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("MCP builder skill contract passed: routing, lifecycle, references, presentation metadata, and secret gates are intact.");
