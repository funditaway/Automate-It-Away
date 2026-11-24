#!/usr/bin/env node
require("./_env-guard");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const packDir = path.join(root, "plugins", "gemini-aia-pack");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

if (!fs.existsSync(packDir)) {
  fail("missing plugins/gemini-aia-pack");
  process.exit(1);
}
pass("pack directory");

const required = [
  "gemini-aia-pack.json",
  "GEMINI_SYSTEM_PROMPT.md",
  "deploy_gemini_aia_pack.mjs",
  "queue-card-schema.json",
  ".cursor/rules/gemini-aia-pack.mdc",
  "aia-gemini-plugin.yaml",
  "eval-fixtures.json",
  "queue-ui-model.json",
  "processQueueItem.mjs",
  "processQueueItemV2.mjs",
  "run-evals.mjs",
  "QueueItemCard.jsx",
  "QueuePage.jsx",
  "queueApiHandler.mjs",
  "queueApiHandlerV2.mjs",
  "intake-followup-cards.json",
  "doctor.mjs",
  "withRetry.mjs",
  "audit-log-schema.json",
  "intakeBatchHandler.mjs",
  "setup-pack.sh",
  "run-batch.mjs",
  "sample-batch.json",
  "queue-desk.css",
  "package.json",
  "validateState.mjs",
  "serve-queue.mjs",
  "queueStore.mjs",
  "gemini-aia-desk.html",
  "gemini-aia-desk.css",
  "gemini-aia-desk.js",
  "chainCards.mjs",
  "readBodyLimited.mjs",
  ".env.example",
  "README.md"
];

required.forEach(function (name) {
  if (!fs.existsSync(path.join(packDir, name))) fail("missing " + name);
  else pass(name);
});

const repoRule = path.join(root, ".cursor", "rules", "gemini-aia-pack.mdc");
if (!fs.existsSync(repoRule)) fail("missing repo .cursor/rules/gemini-aia-pack.mdc");
else pass("repo cursor rule");

const schema = JSON.parse(fs.readFileSync(path.join(packDir, "queue-card-schema.json"), "utf8"));
if (schema.title !== "AIAQueueItemState") fail("schema title");
else pass("schema title");
if (!schema.properties || !schema.properties.status || !schema.properties.status.enum) fail("schema status enum");
else pass("schema status enum");

const manifest = JSON.parse(fs.readFileSync(path.join(packDir, "gemini-aia-pack.json"), "utf8"));
if (manifest.id !== "gemini-aia-pack") fail("manifest id");
else pass("manifest id");
if (!/HOLD|draft|Yes/i.test(JSON.stringify(manifest.rails || []))) fail("manifest rails");
else pass("manifest rails");

const ui = JSON.parse(fs.readFileSync(path.join(packDir, "queue-ui-model.json"), "utf8"));
if (/Ready to Send/i.test(JSON.stringify(ui))) fail("UI must not say Ready to Send");
else pass("UI Draft Ready voice");

const serveSrc = fs.readFileSync(path.join(packDir, "serve-queue.mjs"), "utf8");
if (!/127\.0\.0\.1/.test(serveSrc) || /listen\(\s*port\s*\)/.test(serveSrc.replace(/\s+/g, " "))) {
  fail("serve-queue.mjs must bind 127.0.0.1 (not all interfaces)");
} else pass("serve-queue loopback bind");
if (!/\/api\/queue\/status/.test(serveSrc)) fail("serve-queue missing /api/queue/status");
else pass("serve-queue status route");
if (!/gemini-aia-desk\.html/.test(serveSrc)) fail("serve-queue must serve desk HTML");
else pass("serve-queue desk static");
if (/Access-Control-Allow-Origin/.test(serveSrc)) {
  fail("serve-queue must not set CORS (same-origin desk; no wildcard ACAO)");
} else pass("serve-queue no CORS");
const deskJs = fs.readFileSync(path.join(packDir, "gemini-aia-desk.js"), "utf8");
if (/AUTO_APPROVED_AND_COMPLETED/.test(deskJs)) fail("desk must not auto-approve completions");
else pass("desk HITL voice");
if (!/\/api\/queue\/process/.test(deskJs) || !/\/api\/queue\/approve/.test(deskJs)) {
  fail("desk must wire process/approve Live API routes");
} else pass("desk Live API routes");
if (!fs.existsSync(path.join(packDir, "readBodyLimited.mjs"))) fail("missing readBodyLimited.mjs");
else pass("body size cap helper");
const v2 = fs.readFileSync(path.join(packDir, "queueApiHandlerV2.mjs"), "utf8");
if (!v2.includes("readBodyLimited")) fail("V2 handler must use readBodyLimited");
else pass("V2 body size cap");

function run(script) {
  const r = spawnSync(process.execPath, [script], {
    cwd: packDir,
    env: Object.assign({}, process.env, { AIA_GEMINI_DRY_RUN: "1" }),
    encoding: "utf8"
  });
  if (r.status !== 0) {
    fail(script + " exit " + r.status + "\n" + (r.stdout || "") + (r.stderr || ""));
  } else pass(script);
}

run("doctor.mjs");
run("run-evals.mjs");

if (failed) {
  console.error(failed + " failure(s)");
  process.exit(1);
}
console.log("check-gemini-aia-pack: ok");
