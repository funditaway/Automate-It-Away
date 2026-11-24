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
  "chainCards.mjs",
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
