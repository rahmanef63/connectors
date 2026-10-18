import { after, test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, cpSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const source = fileURLToPath(new URL("../../", import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "connectors-docs-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));
let sequence = 0;

function fixture() {
  const root = join(scratch, String(++sequence));
  cpSync(source, root, {
    recursive: true,
    filter: (path) => ![".git", "node_modules", "dist"].includes(basename(path)),
  });
  return root;
}

function check(root, script = "check-docs.mjs") {
  const result = spawnSync(process.execPath, [resolve(root, "scripts", script)], {
    cwd: root, encoding: "utf8", timeout: 10_000,
  });
  assert.ifError(result.error);
  return result;
}

test("the unchanged cookbook passes from a fixture", () => {
  const result = check(fixture());
  assert.equal(result.status, 0, result.stderr);
});

test("broken and malformed encoded local links fail", () => {
  for (const target of ["missing.md", "broken%ZZ.md", "../outside.md"]) {
    const root = fixture();
    writeFileSync(join(root, "fixture.md"), `# Fixture\n\n**Scope:** test\n**Assumes:** test\n\n[link](${target})\n`);
    const result = check(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /(?:unresolved|malformed) local link/);
  }
});

test("all root consumer metadata is rejected", () => {
  for (const name of [".app.json", ".mcp.json", "mcp.json", "plugin.json"]) {
    const root = fixture();
    writeFileSync(join(root, name), "{}");
    const result = check(root);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(`${name}: generated consumer artifact`));
  }
});

test("synthetic secret tokens are rejected in examples and scripts without printing them", () => {
  for (const [prefix, delimiter] of [["ghp", "_"], ["github_pat", "_"], ["sk", "-"], ["xoxb", "-"]]) {
    for (const folder of ["examples", "scripts"]) {
      const root = fixture();
      const token = [prefix, "synthetic".repeat(4)].join(delimiter);
      writeFileSync(join(root, folder, "fixture.txt"), token);
      const result = check(root);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /secret-shaped token detected/);
      assert.ok(!result.stderr.includes(token));
    }
  }
});

test("placeholder connection ids pass and synthetic concrete ids fail", () => {
  const root = fixture();
  const path = join(root, "examples", "fixture.txt");
  writeFileSync(path, "plugin_asdk_app_PLACEHOLDER");
  assert.equal(check(root).status, 0);
  writeFileSync(path, ["plugin_asdk_app", "synthetic12345678"].join("_"));
  const result = check(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /concrete-looking ChatGPT connection id/);
});

test("symlinks are rejected without traversing their content or cycles", (t) => {
  const root = fixture();
  const outside = join(scratch, "outside");
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, "not-cookbook.txt"), ["ghp", "synthetic".repeat(4)].join("_"));
  try {
    symlinkSync(outside, join(root, "external"), "dir");
    symlinkSync(root, join(root, "cycle"), "dir");
    symlinkSync(join(scratch, "missing"), join(root, "dangling"));
    rmSync(join(root, "shared/README.md"));
    symlinkSync(join(outside, "not-cookbook.txt"), join(root, "shared/README.md"));
  } catch (error) {
    if (error.code === "EPERM") return t.skip("creating symlinks requires privileges on this platform");
    throw error;
  }
  const result = check(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /symbolic links are not allowed/);
  assert.doesNotMatch(result.stderr, /secret-shaped|RangeError|ENOENT/);
});

test("the builder gate also rejects hyphenated synthetic secret formats", () => {
  for (const prefix of ["sk", "xoxb"]) {
    const root = fixture();
    const token = [prefix, "synthetic".repeat(4)].join("-");
    appendFileSync(join(root, ".agents/skills/mcp-project-builder/SKILL.md"), `\n${token}\n`);
    const result = check(root, "check-builder-skill.mjs");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /secret-shaped token detected/);
    assert.ok(!result.stderr.includes(token));
  }
});
