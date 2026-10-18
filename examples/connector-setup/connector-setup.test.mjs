import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { execFileSync } from "node:child_process";
import test from "node:test";
import vm from "node:vm";

const dir = new URL("./", import.meta.url);
const html = readFileSync(new URL("connector-setup.html", dir), "utf8");
const source = readFileSync(new URL("ConnectorSetup.tsx", dir), "utf8");
const app = { innerHTML: "", addEventListener() {} };
const standalone = vm.createContext({
  document: { getElementById: (id) => id === "app" ? app : null },
});
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], standalone);

const modelSource = source.slice(0, source.indexOf("const rowsOf"))
  .replace(/^import .* from "react";\n/m, "")
  .replace(/\bexport /g, "");
const react = vm.createContext({});
vm.runInContext(stripTypeScriptTypes(modelSource), react);

const config = {
  name: "Demo", origin: "https://mcp.example.com/", scopes: ["mcp.read"], dcr: true,
};
const rows = (guides) => guides.flatMap((guide) => guide.groups.flatMap((group) => group.rows));
const variants = [
  ["standalone", standalone, standalone.guides],
  ["React model", react, react.buildGuides],
];

for (const [name, api, build] of variants) {
  test(name + ": custom authorization endpoints and a nonempty server key", () => {
    const endpoints = {
      authorize: "https://auth.example.com/consent",
      token: "https://auth.example.com/token",
      register: "https://auth.example.com/register",
      asBase: "https://auth.example.com",
      resource: "https://mcp.example.com/custom",
    };
    const resolved = api.resolveConnector({ ...config, name: "!!!", mcpPath: "/custom", endpoints });
    for (const [key, value] of Object.entries(endpoints)) assert.equal(resolved[key], value);
    assert.equal(resolved.slug, "server");
    assert.equal(resolved.server, endpoints.resource);
    assert.equal(resolved.protectedResource, "https://mcp.example.com/.well-known/oauth-protected-resource");
  });

  test(name + ": DCR does not imply CIMD support", () => {
    const all = rows(build(api.resolveConnector({ ...config, dcr: false, clientId: "synthetic-client" })));
    assert.ok(all.some((row) => row.field === "Client ID" && row.value === "synthetic-client"));
    assert.ok(!JSON.stringify(all).includes("DCR and CIMD will read"));
    assert.ok(all.some((row) => row.field === "Registration URL" && row.verdict === "skip"));
  });

  test(name + ": bearer commands use shell environment and literal endpoint arguments", () => {
    const origin = "https://mcp.example.com/'$(printf injected)'";
    const guides = build(api.resolveConnector({ ...config, origin, token: "synthetic-raw-token" }));
    const all = rows(guides);
    assert.ok(!JSON.stringify(all).includes("synthetic-raw-token"));
    const cli = all.find((row) => row.field === "terminal").value;
    assert.ok(cli.includes("${MCP_TOKEN:?"));
    execFileSync("bash", ["-n", "-c", cli]);
    const output = execFileSync("bash", ["-c",
      "claude() { printf '%s\\n' \"$@\"; }\n" + cli,
    ], { env: { PATH: process.env.PATH, MCP_TOKEN: "synthetic-shell-token" }, encoding: "utf8" });
    assert.ok(output.split("\n").includes(origin + "/mcp"));
    assert.ok(output.split("\n").includes("Authorization: Bearer synthetic-shell-token"));
    const claudeConfig = JSON.parse(all.find((row) => row.field === ".mcp.json").value);
    assert.equal(claudeConfig.mcpServers.demo.headers.Authorization, "Bearer ${MCP_TOKEN}");
    const cursorConfig = JSON.parse(all.find((row) => row.field === ".cursor/mcp.json").value);
    assert.equal(cursorConfig.mcpServers.demo.headers.Authorization, "Bearer ${env:MCP_TOKEN}");
    for (const row of all.filter((row) => row.field === "curl")) {
      execFileSync("bash", ["-n", "-c", row.value]);
      if (row.value.includes("POST")) assert.ok(row.value.includes("Accept: application/json, text/event-stream"));
    }
  });
}

test("public environment mapping is explicit and does not read client secrets", () => {
  const mapped = react.connectorConfigFromEnv({
    VITE_MCP_ORIGIN: config.origin,
    VITE_MCP_SERVER_NAME: "Demo",
    VITE_MCP_SCOPES: "mcp.read,mcp.write",
    VITE_MCP_DCR: "true",
    VITE_MCP_CLIENT_SECRET: "synthetic-private-value",
  });
  assert.equal(mapped.origin, config.origin);
  assert.equal(mapped.scopes.join(" "), "mcp.read mcp.write");
  assert.equal(mapped.dcr, true);
  assert.equal(mapped.clientSecret, undefined);
  assert.throws(() => react.connectorConfigFromEnv({}), /MCP_ORIGIN is not set/);
});

test("standalone initial render escapes config text", () => {
  standalone.CONFIG.name = '<img src=x onerror="alert(1)">';
  standalone.render();
  assert.ok(!app.innerHTML.includes("<img"));
  assert.ok(app.innerHTML.includes("&lt;img"));
});
