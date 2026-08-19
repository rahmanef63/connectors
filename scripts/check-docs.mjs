#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

const root = process.cwd();
const failures = [];
const ignored = new Set([".git", "node_modules", "dist"]);

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    if (ignored.has(name)) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) entries.push(...walk(path));
    else entries.push(path);
  }
  return entries;
}

const files = walk(root);
const markdown = files.filter((file) => extname(file) === ".md");
const jsonFiles = files.filter((file) => extname(file) === ".json" && !/^tsconfig(?:\..+)?\.json$/.test(file.split(sep).at(-1) ?? ""));

for (const file of jsonFiles) {
  const rel = relative(root, file);
  try {
    JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    failures.push(`${rel}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
}

for (const file of markdown) {
  const rel = relative(root, file);
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  if (!lines[2]?.startsWith("**Scope:**")) failures.push(`${rel}: line 3 must start with **Scope:**`);
  if (!lines[3]?.startsWith("**Assumes:**")) {
    failures.push(`${rel}: line 4 must start with **Assumes:**`);
  }

  let fence = null;
  let h1Count = 0;
  for (const [index, line] of lines.entries()) {
    const match = /^(\s*)(`{3,}|~{3,})/.exec(line);
    if (match) {
      const marker = match[2];
      if (fence === null) fence = { char: marker[0], length: marker.length, line: index + 1 };
      else if (marker[0] === fence.char && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence === null && line.startsWith("# ")) h1Count += 1;
  }
  if (!lines[0]?.startsWith("# ") || h1Count !== 1) failures.push(`${rel}: must contain exactly one H1 outside code fences, on line 1`);
  if (fence !== null) failures.push(`${rel}: unclosed code fence opened at line ${fence.line}`);

  const links = [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
  for (const raw of links) {
    const target = raw.trim().replace(/^<|>$/g, "");
    if (!target || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const withoutAnchor = target.split("#", 1)[0].split("?", 1)[0];
    if (!withoutAnchor) continue;
    let decoded;
    try {
      decoded = decodeURIComponent(withoutAnchor);
    } catch {
      failures.push(`${rel}: malformed local link ${raw}`);
      continue;
    }
    const resolved = resolve(dirname(file), decoded);
    const escaped = relative(root, resolved).startsWith(`..${sep}`) || relative(root, resolved) === "..";
    if (escaped || !existsSync(resolved)) failures.push(`${rel}: unresolved local link ${raw}`);
  }
}

const sharedDocs = readdirSync(join(root, "shared")).filter((name) => name.endsWith(".md") && name !== "README.md");
const sharedReadme = readFileSync(join(root, "shared", "README.md"), "utf8");
const countWords = new Map([
  [13, "thirteen"],
  [14, "fourteen"],
  [15, "fifteen"],
  [16, "sixteen"],
  [17, "seventeen"],
  [18, "eighteen"],
  [19, "nineteen"],
  [20, "twenty"],
]);
const expectedCount = countWords.get(sharedDocs.length) ?? String(sharedDocs.length);
if (!sharedReadme.includes(`which of the ${expectedCount} files`)) {
  failures.push(`shared/README.md: router count must describe ${sharedDocs.length} files (${expectedCount})`);
}

const rootReadme = readFileSync(join(root, "README.md"), "utf8");
if (!rootReadme.includes(`${expectedCount[0].toUpperCase()}${expectedCount.slice(1)} cross-cutting files`)) {
  failures.push(`README.md: shared count must describe ${sharedDocs.length} files (${expectedCount})`);
}

const forbiddenArtifactDirs = [".codex-plugin", ".claude-plugin", "skills"];
for (const dir of forbiddenArtifactDirs) {
  if (existsSync(join(root, dir))) failures.push(`${dir}/: generated consumer artifact must not live at cookbook root`);
}

for (const file of files) {
  const rel = relative(root, file);
  if (rel.startsWith(`scripts${sep}`)) continue;
  const text = readFileSync(file, "utf8");
  const appIds = text.match(/\bplugin_asdk_app_[A-Za-z0-9_-]{8,}\b/g) ?? [];
  for (const appId of appIds) {
    const placeholder = /^plugin_asdk_app_(?:ID_FROM_CHATGPT|PLACEHOLDER|EXAMPLE|REPLACE_ME|0+)$/i.test(appId);
    if (!placeholder) {
      failures.push(`${rel}: contains a concrete-looking ChatGPT connection id; cookbook files must use placeholders`);
    }
  }
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) {
    failures.push(`${rel}: contains private-key material`);
  }
}

if (failures.length > 0) {
  console.error(`Documentation contract failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Documentation contract passed: ${markdown.length} Markdown files, ${jsonFiles.length} JSON files, ${sharedDocs.length} shared guides, all local links resolved.`);
