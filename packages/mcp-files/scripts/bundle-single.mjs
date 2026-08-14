/* Emit dist/single.ts — the whole package as ONE dependency-free module.
 *
 * Exists because a consumer may live in a runtime that cannot install from
 * npm: a Convex deployment bundles only its own convex/ directory. Vendoring
 * one generated file with a provenance header beats hand-copying five, and
 * re-running this is the entire drift story. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

const ORDER = ["errors", "policy", "schema", "ingest", "adapters"];
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const body = ORDER.map((name) =>
  readFileSync(new URL(`../src/${name}.ts`, import.meta.url), "utf8")
    // internal imports vanish — everything lands in one scope
    .replace(/^import\s+(?:type\s+)?\{[\s\S]*?\}\s+from\s+"\.\/[^"]+";\s*$/gm, "")
    .trim(),
).join("\n\n");

const hash = createHash("sha256").update(body).digest("hex").slice(0, 12);
const header = `/* GENERATED — do not edit here.
 *
 * ${pkg.name}@${pkg.version}, bundled to a single module.
 * source:   github.com/rahmanef63/connectors/packages/mcp-files
 * checksum: ${hash}
 *
 * Fix bugs upstream and re-run \`npm run bundle:single\` there.
 * Replace this file with the npm dependency once it is published. */
`;
mkdirSync(new URL("../dist/", import.meta.url), { recursive: true });
writeFileSync(new URL("../dist/single.ts", import.meta.url), `${header}\n${body}\n`);
console.log(`dist/single.ts  ${body.split("\n").length} lines  sha256:${hash}`);
