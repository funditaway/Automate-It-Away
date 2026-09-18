#!/usr/bin/env node
/** Static checks for the Automate It Away Grok plugin package. */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "plugins", "automate-it-away");
const required = [
  ".grok-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  ".mcp.json",
  "README.md",
  "LICENSE",
  "mcp/server.mjs",
  "mcp/run.mjs",
  "skills/automate-it-away/SKILL.md",
  "skills/aia-desk/SKILL.md",
  "skills/aia-packs/SKILL.md",
  "assets/logo.svg",
];

let failed = 0;
for (const rel of required) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    console.error("missing", rel);
    failed += 1;
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, ".grok-plugin/plugin.json"), "utf8"));
if (manifest.name !== "automate-it-away") {
  console.error("manifest name must be automate-it-away");
  failed += 1;
}
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.name)) {
  console.error("invalid plugin name");
  failed += 1;
}

const mcp = JSON.parse(fs.readFileSync(path.join(root, ".mcp.json"), "utf8"));
if (!mcp.mcpServers || !mcp.mcpServers["automate-it-away"]) {
  console.error("mcp server automate-it-away missing");
  failed += 1;
}

const server = fs.readFileSync(path.join(root, "mcp/server.mjs"), "utf8");
const banned = [
  { label: "curl pipe", re: /curl\s+\|/ },
  { label: "eval", re: /\beval\s*\(/ },
  { label: "child_process", re: /child_process/ },
  { label: "ssh dir", re: /~\/\.ssh/ },
  { label: "dotenv file read", re: /(?:^|[^A-Za-z0-9_])\.env(?:[^A-Za-z0-9_]|$)/m },
];
for (const { label, re } of banned) {
  if (re.test(server)) {
    console.error("server contains disallowed pattern:", label);
    failed += 1;
  }
}
if (!server.includes("automateitaway.com")) {
  console.error("server must default to automateitaway.com");
  failed += 1;
}

if (failed) {
  console.error("check-aia-grok-plugin: FAIL", failed);
  process.exit(1);
}
console.log("check-aia-grok-plugin: ok");
