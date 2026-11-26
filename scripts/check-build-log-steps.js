#!/usr/bin/env node
require("./_env-guard");
// Proves the step posts on POST /api/jobs {action:"build-log"} (BL1): one card per piece of
// work (key: pr OR work), rows only ever appended in posted order, owner password session
// only, allowlisted words only in History, a hard cap of 200 rows that never trims, no
// money, no send, concurrent posts keep every row, a refusal writes nothing (store diff),
// and a legacy pr+head post answers exactly as it did on main fd5cea60.
// Usage: node scripts/check-build-log-steps.js      (runs the mutants too)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const LIVE = process.argv.indexOf("--live") >= 0;
const root = path.join(__dirname, "..");
const jobsPath = path.join(root, "api/jobs.js");
const store = path.join(os.tmpdir(), "aia-build-steps-" + Date.now() + "-" + process.pid + ".json");
process.env.AIA_STORE_PATH = store;
Object.keys(process.env).forEach(function (k) {
  if (/BLOB|VERCEL|XAI|GROK|OPENAI|ANTHROPIC/.test(k)) delete process.env[k];
});
delete global.__aia;
delete global.__aiaHydrate;

let fetches = 0;
const origFetch = global.fetch;
global.fetch = async function () {
  fetches += 1;
  if (typeof origFetch === "function") { try { return await origFetch.apply(this, arguments); } catch (e) {} }
  return { status: 200, ok: true, json: async () => ({}), text: async () => "" };
};

let okCount = 0;
function fail(msg) {
  console.error("FAIL " + msg);
  try { fs.rmSync(store, { force: true }); } catch (e) {}
  process.exit(1);
}
function pass(msg) { okCount += 1; console.log("ok  " + msg); }
function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; }
  };
}
async function call(handler, method, headers, body, query, url) {
  const res = mockRes();
  await handler({ method: method, headers: headers || {}, body: body || {}, query: query || {}, url: url || "/api/jobs" }, res);
  return res;
}

const HEAD_A = "00afea2b84db14b53bce29a946ab641cbcd50d86";
const HEAD_B = "b4633448aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HEAD_C = "9149f4b509be148fdbcf682afb964cfa75b082c3";
const MAIN = "fd5cea60290af385882dbc53a85c4fcfd87d9af4";
const DPL = "dpl_Hp8gavfMxxxxxxxx";
const STEPS = ["draft-opened", "new-head", "probe", "named", "landed", "deployed", "ramp", "decision"];
const VERDICTS = ["PASS", "FAIL", "GREEN", "ORANGE", "RED", "HOLD"];
const ROW_KEYS = ["step", "at", "head", "verdict", "deploy", "done", "by"];
const LABEL = { "draft-opened": "Draft opened", "new-head": "New head", probe: "Probe", named: "Named", landed: "Landed", deployed: "Deployed", ramp: "Ramp", decision: "Decision" };

// What a legacy pr+head post did on main fd5cea60 (ids and times removed).
const LEGACY_EXPECTED = [{"status":201,"body":{"ok":true,"created":true,"charged":false,"sent":false,"job":{"title":"Draft: Pack ownership (#557)","status":"shipped","workspace":"bl-steps-legacy","why":"Head 00afea2.","result":"Head 00afea2.","custom":{"buildLog":{"desk":"bl-steps-legacy","pr":557,"head":"00afea2b84db14b53bce29a946ab641cbcd50d86","status":"draft","name":"Pack ownership"}},"thread":[{"from":"helper","text":"Head 00afea2.","kind":"note","actorKind":"helper","actorLabel":"helper","input":"Head 00afea2.","output":""}]}}},{"status":200,"body":{"ok":true,"created":false,"charged":false,"sent":false,"job":{"title":"Draft: Pack ownership (#557)","status":"shipped","workspace":"bl-steps-legacy","why":"Head 00afea2.","result":"Head 00afea2.","custom":{"buildLog":{"desk":"bl-steps-legacy","pr":557,"head":"00afea2b84db14b53bce29a946ab641cbcd50d86","status":"draft","name":"Pack ownership"}},"thread":[{"from":"helper","text":"Head 00afea2.","kind":"note","actorKind":"helper","actorLabel":"helper","input":"Head 00afea2.","output":""},{"from":"helper","text":"Head 00afea2.","kind":"note","actorKind":"helper","actorLabel":"helper","input":"Head 00afea2.","output":""}]}}},{"status":200,"body":{"ok":true,"created":false,"charged":false,"sent":false,"job":{"title":"Landed: Pack ownership (#557)","status":"shipped","workspace":"bl-steps-legacy","why":"Head 00afea2. On main fd5cea6. The live result is green. Waiting on a sign-in safety review.","result":"Head 00afea2. On main fd5cea6. The live result is green. Waiting on a sign-in safety review.","custom":{"buildLog":{"desk":"bl-steps-legacy","pr":557,"head":"00afea2b84db14b53bce29a946ab641cbcd50d86","status":"landed","name":"Pack ownership","mainSha":"fd5cea60290af385882dbc53a85c4fcfd87d9af4","verdict":"GREEN","hold":"Waiting on a sign-in safety review."}},"thread":[{"from":"helper","text":"Head 00afea2.","kind":"note","actorKind":"helper","actorLabel":"helper","input":"Head 00afea2.","output":""},{"from":"helper","text":"Head 00afea2.","kind":"note","actorKind":"helper","actorLabel":"helper","input":"Head 00afea2.","output":""},{"from":"helper","text":"Head 00afea2. On main fd5cea6. The live result is green. Waiting on a sign-in safety review.","kind":"note","actorKind":"helper","actorLabel":"helper","input":"Head 00afea2. On main fd5cea6. The live result is green. Waiting on a sign-in safety review.","output":""}]}}},{"status":201,"body":{"ok":true,"created":true,"charged":false,"sent":false,"job":{"title":"On hold: Pack ownership (#557)","status":"shipped","workspace":"bl-steps-legacy","why":"Head b463344. The check passed. On the safety hold.","result":"Head b463344. The check passed. On the safety hold.","custom":{"buildLog":{"desk":"bl-steps-legacy","pr":557,"head":"b4633448aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","status":"hold","name":"Pack ownership","verdict":"PASS","hold":"On the safety hold."}},"thread":[{"from":"helper","text":"Head b463344. The check passed. On the safety hold.","kind":"note","actorKind":"helper","actorLabel":"helper","input":"Head b463344. The check passed. On the safety hold.","output":""}]}}},{"status":201,"body":{"ok":true,"created":true,"charged":false,"sent":false,"job":{"title":"Waiting on you: Sign-in safety fixes (#561)","status":"shipped","workspace":"bl-steps-legacy","why":"Head 00afea2.","result":"Head 00afea2.","custom":{"buildLog":{"desk":"bl-steps-legacy","pr":561,"head":"00afea2b84db14b53bce29a946ab641cbcd50d86","status":"waiting-on-James","name":"Sign-in safety fixes"}},"thread":[{"from":"helper","text":"Head 00afea2.","kind":"note","actorKind":"helper","actorLabel":"helper","input":"Head 00afea2.","output":""}]}}},{"status":400,"body":{"ok":false,"error":"The result must be PASS, FAIL, GREEN, ORANGE, or RED."}},{"status":400,"body":{"ok":false,"error":"That field is not used here."}},{"status":400,"body":{"ok":false,"error":"That field is not used here."}},[{"title":"Landed: Pack ownership (#557)","how":"Head 00afea2. On main fd5cea6. The live result is green. Waiting on a sign-in safety review.","lane":"done","status":"shipped","n":2},{"title":"On hold: Pack ownership (#557)","how":"Head b463344. The check passed. On the safety hold.","lane":"done","status":"shipped","n":1},{"title":"Waiting on you: Sign-in safety fixes (#561)","how":"Head 00afea2.","lane":"done","status":"shipped","n":1}],{"cards":3,"rows":["desk,head,hold,mainSha,name,pr,status,verdict","desk,head,hold,name,pr,status,verdict","desk,head,name,pr,status"]}];

function jobsOn(lib, slug) { return (lib.mem.jobs || []).filter((j) => j && j.workspace === slug); }
function stepCards(lib, slug) { return jobsOn(lib, slug).filter((j) => j.custom && j.custom.buildLog && Array.isArray(j.custom.buildLog.steps)); }
function snap(lib) {
  const bytes = fs.existsSync(store) ? fs.readFileSync(store, "utf8") : "";
  return JSON.stringify({
    jobs: lib.mem.jobs, audit: lib.mem.audit, money: lib.mem.money, inbox: lib.mem.inbox,
    files: lib.mem.files, connections: lib.mem.connections, workspaces: lib.mem.workspaces
  }) + "\n" + bytes;
}
function norm(r) {
  const o = JSON.parse(JSON.stringify(r.body));
  const strip = function (j) {
    if (!j) return;
    delete j.id;
    (j.thread || []).forEach(function (t) { delete t.at; delete t.id; });
  };
  if (o && o.job) strip(o.job);
  return { status: r.statusCode, body: o };
}

function assertSources() {
  const jobs = fs.readFileSync(jobsPath, "utf8");
  const start = jobs.indexOf('if (action === "build-log")');
  const end = jobs.indexOf("// Every action below reads or changes a card", start);
  if (start < 0 || end < 0) fail("could not slice the build-log branch");
  const block = jobs.slice(start, end);
  ["grokRecommend", "fireWebhook", "runWorkspace", "holdCapturedJob", "makeFanOutJobs", "applyDeskAiDraft", "thenAfterYes"].forEach(function (fn) {
    if (block.indexOf(fn) >= 0) fail("build-log branch must not call " + fn);
  });
  if (/mem\.money|mem\.inbox/.test(block)) fail("build-log branch must not write money or inbox");
  if (/splice|\.shift\(|\.pop\(|\.slice\(-|\.length\s*=[^=]|delete\s/.test(block)) fail("build-log branch must never remove or trim a row");
  pass("the build-log branch has no send, money, Grok, delete, or trim code");
  const stepsSrc = (jobs.match(/const BUILD_STEPS = \{([^}]*)\};/) || [])[1] || "";
  const listed = (stepsSrc.match(/"[a-z-]+":/g) || []).map((x) => x.replace(/[":]/g, ""));
  if (listed.join() !== STEPS.join()) fail("the step allowlist must be exactly " + STEPS.join(", ") + ", got " + listed.join(", "));
  const vSrc = (jobs.match(/const BUILD_STEP_VERDICTS = \[([^\]]*)\];/) || [])[1] || "";
  if (vSrc.replace(/[" ]/g, "") !== VERDICTS.join()) fail("the step results must be exactly " + VERDICTS.join(", ") + ", got " + vSrc);
  if (!/const BUILD_STEP_MAX = 200;/.test(jobs)) fail("the cap must be 200");
  pass("source: the step list, the result list, and the 200 cap are exactly the spec's");
  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  const a = pkg.indexOf("scripts/check-build-log.js");
  const b = pkg.indexOf("scripts/check-build-log-steps.js");
  if (a < 0 || b < 0 || b < a || b - a > 80) fail("package.json must run check-build-log-steps.js right after check-build-log.js");
  pass("package.json runs this check right after check-build-log.js");
}


const J = "      if (!buildSession || !shop || shop.slug !== workspace || !person || !isOwner(person)) return refuseJobRead(res, found);";
const PUSH = "stepJob.custom.buildLog.steps.push(stepRow);";
const CAP = "        if (stepCard && stepCard.custom.buildLog.steps.length >= BUILD_STEP_MAX) {\n          return refuse(409, \"This card already has \" + BUILD_STEP_MAX + \" steps. Nothing was saved.\");\n        }";
const MUTANTS = [
  { name: "steps added newest-first (out of order)", edits: [[PUSH, "stepJob.custom.buildLog.steps.unshift(stepRow);"]] },
  { name: "steps re-sorted into allowlist order", edits: [[PUSH, PUSH + " stepJob.custom.buildLog.steps.sort(function (a, b) { return Object.keys(BUILD_STEPS).indexOf(a.step) - Object.keys(BUILD_STEPS).indexOf(b.step); });"]] },
  { name: "a repeat of the same step rewrites the old row", edits: [[PUSH, "const was = stepJob.custom.buildLog.steps.find(function (r) { return r.step === stepRow.step; }); if (was) Object.assign(was, stepRow); else " + PUSH]] },
  { name: "done:true edits the last row instead of appending", edits: [[PUSH, "if (stepRow.done && stepJob.custom.buildLog.steps.length) stepJob.custom.buildLog.steps[stepJob.custom.buildLog.steps.length - 1].done = true; else " + PUSH]] },
  { name: "done:true removes the earlier rows of that step", edits: [[PUSH, "if (stepRow.done) stepJob.custom.buildLog.steps = stepJob.custom.buildLog.steps.filter(function (r) { return r.step !== stepRow.step; }); " + PUSH]] },
  { name: "a row is dropped on every 10th post", edits: [[PUSH, "if (stepJob.custom.buildLog.steps.length % 10 !== 9) " + PUSH]] },
  { name: "past the cap the oldest row is trimmed", edits: [[CAP, "        if (stepCard && stepCard.custom.buildLog.steps.length >= BUILD_STEP_MAX) { stepCard.custom.buildLog.steps.shift(); }"]] },
  { name: "cap off by one (201 rows)", edits: [["steps.length >= BUILD_STEP_MAX) {\n          return refuse(409", "steps.length > BUILD_STEP_MAX) {\n          return refuse(409"]] },
  { name: "cap raised to 1000", edits: [["const BUILD_STEP_MAX = 200;", "const BUILD_STEP_MAX = 1000;"]] },
  { name: "cap refusal writes a row first", edits: [[CAP, "        if (stepCard && stepCard.custom.buildLog.steps.length >= BUILD_STEP_MAX) {\n          stepCard.custom.buildLog.steps.push({ step: \"decision\", at: \"\", head: \"\", verdict: \"\", deploy: \"\", done: false, by: \"\" });\n          return refuse(409, \"This card already has \" + BUILD_STEP_MAX + \" steps. Nothing was saved.\");\n        }"]] },
  { name: "any step name accepted (constructor, __proto__)", edits: [["typeof body.step !== \"string\" || !BUILD_STEPS[body.step] || !Object.prototype.hasOwnProperty.call(BUILD_STEPS, body.step)", "typeof body.step !== \"string\" || !body.step"], ["let line = BUILD_STEPS[row.step];", "let line = BUILD_STEPS[row.step] || String(row.step);"]] },
  { name: "step name checked without hasOwnProperty", edits: [[" || !Object.prototype.hasOwnProperty.call(BUILD_STEPS, body.step)", ""]] },
  { name: "unknown step accepted (a new step name)", edits: [["const BUILD_STEPS = { ", "const BUILD_STEPS = { \"whatever\": \"Whatever\", "]] },
  { name: "owner check dropped", edits: [[J, J.replace(" || !isOwner(person)", "")]] },
  { name: "pin-only accepted", edits: [[J, J.replace("!buildSession || ", "")]] },
  { name: "money key amount allowed", edits: [["const BUILD_LOG_KEYS = { action: 1,", "const BUILD_LOG_KEYS = { amount: 1, action: 1,"], ["const BUILD_STEP_KEYS = { ", "const BUILD_STEP_KEYS = { amount: 1, "], ["        if (BUILD_MONEY_KEYS[k]) {\n          return res.status(400).json({ ok: false, error: \"That field is not used here.\" });\n        }\n", ""]] },
  { name: "money keys no longer refused before the step branch", edits: [["        if (BUILD_MONEY_KEYS[k]) {\n          return res.status(400).json({ ok: false, error: \"That field is not used here.\" });\n        }\n", ""], ["const BUILD_LOG_KEYS = { action: 1,", "const BUILD_LOG_KEYS = { charged: 1, money: 1, collect: 1, provider: 1, hook: 1, to: 1, email: 1, wallet: 1, payout: 1, ask: 1, action: 1,"], ["const BUILD_STEP_KEYS = { ", "const BUILD_STEP_KEYS = { charged: 1, money: 1, collect: 1, provider: 1, hook: 1, to: 1, email: 1, wallet: 1, payout: 1, ask: 1, "]] },
  { name: "delete key allowed", edits: [["const BUILD_LOG_KEYS = { action: 1,", "const BUILD_LOG_KEYS = { delete: 1, remove: 1, action: 1,"], ["const BUILD_STEP_KEYS = { ", "const BUILD_STEP_KEYS = { delete: 1, remove: 1, "]] },
  { name: "client steps array accepted", edits: [["const BUILD_LOG_KEYS = { action: 1,", "const BUILD_LOG_KEYS = { steps: 1, index: 1, action: 1,"], ["const BUILD_STEP_KEYS = { ", "const BUILD_STEP_KEYS = { steps: 1, index: 1, "]] },
  { name: "legacy-only keys (name, status) allowed on a step post", edits: [["const BUILD_STEP_KEYS = { ", "const BUILD_STEP_KEYS = { name: 1, status: 1, hold: 1, "]] },
  { name: "pr and work both accepted", edits: [["        if (hasPr && hasWork) return refuse(400, \"Send the PR or the work name, not both.\");\n", ""]] },
  { name: "neither pr nor work accepted", edits: [["        if (!hasPr && !hasWork) return refuse(400, \"Send the PR or a work name.\");\n", ""], ["          stepWork = body.work;\n", "          stepWork = String(body.work);\n"], ["        } else {\n          if (typeof body.work", "        } else if (hasWork) {\n          if (typeof body.work"]] },
  { name: "bad dpl id accepted", edits: [["!/^dpl_[A-Za-z0-9]{6,40}$/.test(body.deploy)", "!/^.{1,200}$/.test(body.deploy)"]] },
  { name: "dpl id of any length accepted", edits: [["/^dpl_[A-Za-z0-9]{6,40}$/.test(body.deploy)", "/^dpl_[A-Za-z0-9]{1,400}$/.test(body.deploy)"]] },
  { name: "work slug with spaces, HTML, or a path accepted", edits: [["!/^[a-z0-9][a-z0-9-]{0,39}$/.test(body.work)", "!/^.{1,300}$/.test(body.work)"]] },
  { name: "work slug over 40 characters accepted", edits: [["{0,39}$/.test(body.work)", "{0,99}$/.test(body.work)"]] },
  { name: "uppercase work slug accepted", edits: [["!/^[a-z0-9][a-z0-9-]{0,39}$/.test(body.work)", "!/^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/.test(body.work)"]] },
  { name: "short head accepted", edits: [["          stepHead = parseBuildSha(body.head);\n          if (!stepHead) return refuse(400, \"Head must be the full 40-character commit.\");", "          stepHead = String(body.head).slice(0, 40);"]] },
  { name: "new-head accepted without a head", edits: [["const BUILD_STEP_NEEDS_HEAD = { \"new-head\": 1, \"probe\": 1 };", "const BUILD_STEP_NEEDS_HEAD = {};"]] },
  { name: "HOLD verdict refused", edits: [["const BUILD_STEP_VERDICTS = [\"PASS\", \"FAIL\", \"GREEN\", \"ORANGE\", \"RED\", \"HOLD\"];", "const BUILD_STEP_VERDICTS = [\"PASS\", \"FAIL\", \"GREEN\", \"ORANGE\", \"RED\"];"]] },
  { name: "unknown verdict OK accepted", edits: [["const BUILD_STEP_VERDICTS = [\"PASS\", ", "const BUILD_STEP_VERDICTS = [\"OK\", \"PASS\", "]] },
  { name: "done accepted as a string or number", edits: [["        if (body.done !== undefined && typeof body.done !== \"boolean\") return refuse(400, \"Done must be true or false.\");\n", ""], ["done: body.done === true", "done: !!body.done"]] },
  { name: "raw text in the History line (who posted)", edits: [["  if (row.done) line += \". Done.\";", "  if (row.done) line += \". Done.\";\n  line += \" by \" + row.by;"]] },
  { name: "full head in the History line", edits: [["line += \" on \" + row.head.slice(0, 8);", "line += \" on \" + row.head;"]] },
  { name: "History line carries the body's work text", edits: [["const stepTitle = \"Build log: \" + (stepPr ? \"#\" + stepPr : stepWork);", "const stepTitle = \"Build log: \" + (stepPr ? \"#\" + stepPr : stepWork) + \" \" + JSON.stringify(body).slice(0, 80);"]] },
  { name: "a concurrent post loses a row", edits: [[PUSH, "const was = stepJob.custom.buildLog.steps.slice(); await Promise.resolve(); await Promise.resolve(); stepJob.custom.buildLog.steps = was.concat([stepRow]);"]] },
  { name: "a concurrent first post makes a second card", edits: [["        const stepCard = findBuildStepCard(workspace, stepPr, stepWork);", "        await Promise.resolve();\n        const stepCard = findBuildStepCard(workspace, stepPr, stepWork);\n        await Promise.resolve();"]] },
  { name: "a new head makes a new card", edits: [["    return pr ? Number(b.pr) === pr : b.work === work;", "    return (pr ? Number(b.pr) === pr : b.work === work) && !b.steps.some(function (r) { return r.head; });"]] },
  { name: "reply says charged", edits: [["          charged: false,\n          sent: false,\n          step: stepRow,", "          charged: true,\n          sent: false,\n          step: stepRow,"]] },
  { name: "reply says sent", edits: [["          charged: false,\n          sent: false,\n          step: stepRow,", "          charged: false,\n          sent: true,\n          step: stepRow,"]] },
  { name: "card born as Queue work", edits: [["            title: stepTitle,\n            why: stepLine,\n            result: stepLine,\n            status: \"shipped\",", "            title: stepTitle,\n            why: stepLine,\n            result: stepLine,\n            status: \"exception\","]] },
  { name: "a refusal writes an audit row", edits: [["        const refuse = function (code, error) { return res.status(code)", "        log(\"Build\", \"x\", \"x\", workspace);\n        const refuse = function (code, error) { return res.status(code)"]] },
  { name: "legacy post drifts: HOLD accepted as a legacy verdict", edits: [["const BUILD_VERDICTS = [\"PASS\", \"FAIL\", \"GREEN\", \"ORANGE\", \"RED\"];", "const BUILD_VERDICTS = [\"PASS\", \"FAIL\", \"GREEN\", \"ORANGE\", \"RED\", \"HOLD\"];"]] },
  { name: "legacy post drifts: a pr+head post is treated as a step post", edits: [["if (body.step !== undefined || body.work !== undefined", "if (body.head !== undefined || body.step !== undefined || body.work !== undefined"]] },
  { name: "legacy post drifts: the History line changes", edits: [["  const parts = [\"Head \" + String(fields.head).slice(0, 7) + \".\"];", "  const parts = [\"Head \" + String(fields.head).slice(0, 8) + \".\"];"]] },
  { name: "legacy post drifts: the legacy repeat is keyed on pr only", edits: [["    return j && j.workspace === workspace && b && Number(b.pr) === Number(pr) && b.head === head;", "    return j && j.workspace === workspace && b && Number(b.pr) === Number(pr);"]] },
  // BL1 child 1: Probe's six survivors (P2, P18, P31, P10, P9, P6) and the audit row (P19)
  { name: "P2: the step-card lookup drops the desk check (desk B's owner appends to desk A's card)", edits: [["    if (!j || j.workspace !== workspace || !b || !Array.isArray(b.steps)) return false;", "    if (!j || !b || !Array.isArray(b.steps)) return false;"]] },
  { name: "P18: the thread entry carries the poster's name", edits: [["        addTalk(stepJob, \"helper\", stepLine, \"note\", stepActor);", "        addTalk(stepJob, actorName(person, {}), stepLine, \"note\", { actorKind: \"helper\", actorLabel: \"helper\" });"]] },
  { name: "P18: the thread entry is labelled with the poster's name", edits: [["        const stepActor = { actorKind: \"helper\", actorLabel: \"helper\" };", "        const stepActor = { actorKind: \"helper\", actorLabel: actorName(person, {}) };"]] },
  { name: "P19: the audit row carries the raw body", edits: [["        log(\"Build\", stepTitle + \" · \" + stepLine, \"OK\", workspace);", "        log(\"Build\", stepTitle + \" · \" + stepLine + \" \" + JSON.stringify(body), \"OK\", workspace);"]] },
  { name: "P31: a step post lands on a legacy card (no steps array needed)", edits: [["    if (!j || j.workspace !== workspace || !b || !Array.isArray(b.steps)) return false;", "    if (!j || j.workspace !== workspace || !b) return false;"], ["        if (stepCard && stepCard.custom.buildLog.steps.length >= BUILD_STEP_MAX) {", "        if (stepCard && !Array.isArray(stepCard.custom.buildLog.steps)) stepCard.custom.buildLog.steps = [];\n        if (stepCard && stepCard.custom.buildLog.steps.length >= BUILD_STEP_MAX) {"]] },
  { name: "P31: a legacy repost erases the step rows on a shared card", edits: [["    return j && j.workspace === workspace && b && Number(b.pr) === Number(pr) && b.head === head;", "    return j && j.workspace === workspace && b && Number(b.pr) === Number(pr) && (b.head === head || Array.isArray(b.steps));"]] },
  { name: "P10: the deploy id allows . _ and - (dpl_../x style)", edits: [["/^dpl_[A-Za-z0-9]{6,40}$/.test(body.deploy)", "/^dpl_[A-Za-z0-9._-]{6,40}$/.test(body.deploy)"]] },
  { name: "P10: the deploy id allows a slash", edits: [["/^dpl_[A-Za-z0-9]{6,40}$/.test(body.deploy)", "/^dpl_[A-Za-z0-9/]{6,40}$/.test(body.deploy)"]] },
  { name: "P10: the deploy id allows a space", edits: [["/^dpl_[A-Za-z0-9]{6,40}$/.test(body.deploy)", "/^dpl_[A-Za-z0-9 ]{6,40}$/.test(body.deploy)"]] },
  { name: "P10: the deploy id may end with a newline", edits: [["/^dpl_[A-Za-z0-9]{6,40}$/.test(body.deploy)", "/^dpl_[A-Za-z0-9]{6,40}\\n?$/.test(body.deploy)"]] },
  { name: "P9: the dpl_ prefix is case-insensitive (DPL_ accepted)", edits: [["/^dpl_[A-Za-z0-9]{6,40}$/.test(body.deploy)", "/^dpl_[A-Za-z0-9]{6,40}$/i.test(body.deploy)"]] },
  { name: "P9: the dpl_ prefix accepts a capital D", edits: [["/^dpl_[A-Za-z0-9]{6,40}$/.test(body.deploy)", "/^[dD]pl_[A-Za-z0-9]{6,40}$/.test(body.deploy)"]] },
  { name: "P6: the work name allows _ and .", edits: [["!/^[a-z0-9][a-z0-9-]{0,39}$/.test(body.work)", "!/^[a-z0-9][a-z0-9._-]{0,39}$/.test(body.work)"]] },
  { name: "P6: the work name allows _", edits: [["!/^[a-z0-9][a-z0-9-]{0,39}$/.test(body.work)", "!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(body.work)"]] },
  { name: "P6: the work name allows .", edits: [["!/^[a-z0-9][a-z0-9-]{0,39}$/.test(body.work)", "!/^[a-z0-9][a-z0-9.-]{0,39}$/.test(body.work)"]] },
  { name: "P6: the work name may start with _ or .", edits: [["!/^[a-z0-9][a-z0-9-]{0,39}$/.test(body.work)", "!/^[a-z0-9_.][a-z0-9-]{0,39}$/.test(body.work)"]] }
];

function applyEdits(src, edits, name) {
  let out = src;
  edits.forEach(function (e) {
    if (out.indexOf(e[0]) < 0) fail("mutant anchor gone: " + name + " :: " + e[0].slice(0, 60));
    if (out.indexOf(e[0]) !== out.lastIndexOf(e[0])) fail("mutant anchor not unique: " + name + " :: " + e[0].slice(0, 60));
    out = out.replace(e[0], function () { return e[1]; });
  });
  return out;
}
function runMutants(orig) {
  let caught = 0;
  try {
    MUTANTS.forEach(function (m) {
      fs.writeFileSync(jobsPath, applyEdits(orig, m.edits, m.name));
      const r = spawnSync(process.execPath, [path.join(root, "scripts/check-build-log-steps.js"), "--live"], {
        cwd: root,
        env: Object.assign({}, process.env, { AIA_STORE_PATH: path.join(os.tmpdir(), "aia-bls-mut-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".json") }),
        encoding: "utf8",
        timeout: 120000
      });
      fs.writeFileSync(jobsPath, orig);
      const out = String(r.stdout || "") + "\n" + String(r.stderr || "");
      const first = out.split("\n").find(function (l) { return l.indexOf("FAIL") === 0; }) || "";
      if (!r.status) { console.error("SURVIVED " + m.name + "\n" + out.slice(-600)); fail("mutant survived: " + m.name); }
      caught += 1;
      pass("mutant caught: " + m.name + (first ? " (" + first.slice(0, 110) + ")" : ""));
    });
  } finally { fs.writeFileSync(jobsPath, orig); }
  if (fs.readFileSync(jobsPath, "utf8") !== orig) fail("jobs.js was not restored byte-identical");
  pass("mutants: " + caught + "/" + MUTANTS.length + " caught; jobs.js restored byte-identical");
  return caught;
}

async function main() {
  assertSources();
  const auth = require(path.join(root, "api/auth"));
  const jobs = require(path.join(root, "api/jobs"));
  const desks = require(path.join(root, "api/_desks-http"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();

  const slug = "bl-steps-shop";
  const other = "bl-steps-other";
  const pin = "4821";
  const opened = await call(auth, "POST", { "x-workspace": slug }, { action: "open", slug: slug, biz: "Steps Shop", name: "James", pin: pin }, {}, "/api/auth");
  if (opened.statusCode !== 201) fail("could not open a desk, got " + opened.statusCode);
  const pw = await call(auth, "POST", { "x-workspace": slug, "x-session": opened.body.session.token }, { action: "password", password: "james-pass-steps-1234", email: "james@steps.test" }, {}, "/api/auth");
  if (pw.statusCode !== 200) fail("could not set a password, got " + pw.statusCode);
  const login = await call(auth, "POST", {}, { action: "login", email: "james@steps.test", password: "james-pass-steps-1234", workspace: slug }, {}, "/api/auth");
  if (login.statusCode !== 200) fail("email login failed, got " + login.statusCode);
  const ownerTok = login.body.session.token;
  const pinLogin = await call(auth, "POST", {}, { action: "login", workspace: slug, pin: pin }, {}, "/api/auth");
  const pinTok = pinLogin.body.session.token;
  const joined = await call(auth, "POST", { "x-workspace": slug }, { action: "join", name: "Sam", pin: "9090", kind: "helper" }, {}, "/api/auth");
  const approved = await call(auth, "POST", { "x-workspace": slug, "x-pin": pin }, { action: "approve", id: joined.body.person.id }, {}, "/api/auth");
  if (approved.statusCode !== 200) fail("could not approve the helper");
  const shop = lib.mem.workspaces.find((w) => w && w.slug === slug);
  const helperPerson = shop.people.find((p) => p && p.id === joined.body.person.id);
  const helperAcc = { id: "acc_bls_helper", email: "sam@steps.test", name: "Sam", desks: [slug], createdAt: new Date().toISOString() };
  lib.mem.accounts.push(helperAcc);
  helperPerson.accountId = helperAcc.id;
  helperPerson.email = helperAcc.email;
  const helperTok = lib.issueSession(helperPerson, shop, helperAcc, { headers: { "x-workspace": slug } }, "password").token;
  const otherOpen = await call(auth, "POST", { "x-workspace": other }, { action: "open", slug: other, biz: "Other Shop", name: "Dee", pin: "7777", email: "dee@steps.test" }, {}, "/api/auth");
  if (otherOpen.statusCode !== 201) fail("could not open a second desk");
  pass("opened a desk, an owner password session, a desk-code session, a helper session, and a second desk");

  const ownerHdr = { "x-workspace": slug, "x-session": ownerTok };
  const post = function (body, hdr) { return call(jobs, "POST", hdr || ownerHdr, Object.assign({ action: "build-log" }, body)); };
  const good = { step: "draft-opened", work: "alpha" };

  // ---- Refusals write nothing (store diff) ----
  async function mustRefuse(label, body, hdr, codes) {
    const before = snap(lib);
    const f0 = fetches;
    const r = await post(body, hdr);
    if (codes.indexOf(r.statusCode) < 0) fail(label + " must be refused with " + codes.join("/") + ", got " + r.statusCode + " " + JSON.stringify(r.body));
    if (r.statusCode < 400 || (r.body && r.body.ok === true)) fail(label + " must not answer ok");
    if (snap(lib) !== before) fail(label + " wrote to the store (jobs, audit, money, inbox, or the saved file)");
    if (fetches !== f0) fail(label + " fetched");
    return r;
  }
  await mustRefuse("stranger", good, { "x-workspace": slug }, [403, 404]);
  await mustRefuse("cookie-less", good, { "x-workspace": slug, cookie: "" }, [403, 404]);
  await mustRefuse("pin-only", good, { "x-workspace": slug, "x-pin": pin }, [403, 404]);
  await mustRefuse("desk-code session", good, { "x-workspace": slug, "x-session": pinTok }, [403, 404]);
  await mustRefuse("helper session", good, { "x-workspace": slug, "x-session": helperTok }, [403, 404]);
  await mustRefuse("helper pin", good, { "x-workspace": slug, "x-pin": "9090" }, [403, 404]);
  await mustRefuse("owner token on another desk", good, { "x-workspace": other, "x-session": ownerTok }, [403, 404]);
  await mustRefuse("a desk that does not exist", good, { "x-workspace": "no-such-steps-desk", "x-session": ownerTok }, [403, 404]);
  const noWs = await post(good, { "x-session": ownerTok });
  if (noWs.statusCode !== 400 || noWs.body.error !== "Open a desk first.") fail("missing X-Workspace must stay 400 Open a desk first");
  if (stepCards(lib, slug).length || stepCards(lib, other).length) fail("a refused caller made a card");
  pass("stranger, cookie-less, pin-only, desk-code, helper, other-desk, and missing-desk callers are refused and the store is byte-identical");

  const bads = [
    ["unknown step", { step: "shipped", work: "alpha" }],
    ["unknown step whatever", { step: "whatever", work: "alpha" }],
    ["unknown step merged", { step: "merged", work: "alpha" }],
    ["unknown step approved", { step: "approved", work: "alpha" }],
    ["unknown step delete", { step: "delete", work: "alpha" }],
    ["unknown step empty", { step: "", work: "alpha" }],
    ["missing step", { work: "alpha", done: true }],
    ["step constructor", { step: "constructor", work: "alpha" }],
    ["step __proto__", { step: "__proto__", work: "alpha" }],
    ["step toString", { step: "toString", work: "alpha" }],
    ["step hasOwnProperty", { step: "hasOwnProperty", work: "alpha" }],
    ["step constructor with a head", { step: "constructor", work: "alpha", head: HEAD_A }],
    ["step __proto__ with a head", { step: "__proto__", work: "alpha", head: HEAD_A }],
    ["step toString with a head", { step: "toString", work: "alpha", head: HEAD_A }],
    ["step valueOf with a head", { step: "valueOf", work: "alpha", head: HEAD_A }],
    ["step uppercase", { step: "Probe", work: "alpha", head: HEAD_A }],
    ["step with space", { step: "probe ", work: "alpha", head: HEAD_A }],
    ["step array", { step: ["probe"], work: "alpha", head: HEAD_A }],
    ["step number", { step: 3, work: "alpha" }],
    ["step object", { step: { a: 1 }, work: "alpha" }],
    ["pr and work both", { step: "named", pr: 590, work: "alpha" }],
    ["neither pr nor work", { step: "named" }],
    ["pr empty and work empty", { step: "named", pr: "", work: "" }],
    ["pr 0", { step: "named", pr: 0 }],
    ["pr negative", { step: "named", pr: -4 }],
    ["pr fractional", { step: "named", pr: 1.5 }],
    ["pr text", { step: "named", pr: "abc" }],
    ["pr object", { step: "named", pr: { a: 1 } }],
    ["work with a space", { step: "named", work: "my work" }],
    ["work with HTML", { step: "named", work: "<b>x</b>" }],
    ["work with a path", { step: "named", work: "../etc/passwd" }],
    ["work with a slash", { step: "named", work: "a/b" }],
    ["work uppercase", { step: "named", work: "Alpha" }],
    ["work leading dash", { step: "named", work: "-alpha" }],
    ["work 41 characters", { step: "named", work: "a".repeat(41) }],
    ["work a number", { step: "named", work: 12 }],
    ["work an array", { step: "named", work: ["a"] }],
    ["work with a newline", { step: "named", work: "a\nb" }],
    ["head short", { step: "probe", work: "alpha", head: HEAD_A.slice(0, 7) }],
    ["head 39", { step: "probe", work: "alpha", head: HEAD_A.slice(0, 39) }],
    ["head 41", { step: "probe", work: "alpha", head: HEAD_A + "a" }],
    ["head not hex", { step: "probe", work: "alpha", head: "z".repeat(40) }],
    ["head an object", { step: "probe", work: "alpha", head: { a: 1 } }],
    ["new-head with no head", { step: "new-head", work: "alpha" }],
    ["probe with no head", { step: "probe", work: "alpha", verdict: "PASS" }],
    ["verdict lowercase", { step: "ramp", work: "alpha", verdict: "green" }],
    ["verdict OK", { step: "ramp", work: "alpha", verdict: "OK" }],
    ["verdict array", { step: "ramp", work: "alpha", verdict: ["PASS"] }],
    ["verdict with a space", { step: "ramp", work: "alpha", verdict: "PASS " }],
    ["deploy with no prefix", { step: "deployed", work: "alpha", deploy: "Hp8gavfMxxxxxxxx" }],
    ["deploy dpl_ only", { step: "deployed", work: "alpha", deploy: "dpl_" }],
    ["deploy too short", { step: "deployed", work: "alpha", deploy: "dpl_abcde" }],
    ["deploy 41 characters", { step: "deployed", work: "alpha", deploy: "dpl_" + "a".repeat(41) }],
    ["deploy with HTML", { step: "deployed", work: "alpha", deploy: "dpl_<script>alert(1)" }],
    ["deploy with a space", { step: "deployed", work: "alpha", deploy: "dpl_abc defgh" }],
    ["deploy with a newline", { step: "deployed", work: "alpha", deploy: "dpl_abcdefgh\nx" }],
    ["deploy a number", { step: "deployed", work: "alpha", deploy: 12345678 }],
    ["done as a string", { step: "ramp", work: "alpha", done: "true" }],
    ["done as 1", { step: "ramp", work: "alpha", done: 1 }],
    ["done as null", { step: "ramp", work: "alpha", done: null }]
  ];
  for (const b of bads) await mustRefuse(b[0], b[1], null, [400]);
  pass(bads.length + " bad step posts are refused with 400 and write nothing");

  const money = ["amount", "ask", "charged", "money", "provider", "hook", "to", "email", "collect", "payout", "wallet"];
  for (const k of money) {
    const r = await mustRefuse("money key " + k, Object.assign({}, good, { [k]: k === "charged" ? false : "1" }), null, [400]);
    if (r.body.error !== "That field is not used here.") fail("money key " + k + " wording drifted");
  }
  pass("every money key is refused with 400 and writes nothing");
  const deleteLike = ["delete", "remove", "deleteStep", "removeStep", "undo", "clear", "reset", "trim", "truncate", "rewrite", "edit", "index", "steps", "id", "at", "by", "name", "status", "mainSha", "hold", "actorKind", "unknown"];
  for (const k of deleteLike) await mustRefuse("delete-like or extra key " + k, Object.assign({}, good, { [k]: k === "steps" ? [{ step: "probe" }] : "x" }), null, [400]);
  pass("delete-like keys, a client steps array, and every legacy-only key are refused with 400 on a step post");

  // ---- One card per work, rows appended in posted order ----
  const calls = [
    { step: "draft-opened", work: "alpha" },
    { step: "new-head", work: "alpha", head: HEAD_A },
    { step: "probe", work: "alpha", head: HEAD_A, verdict: "FAIL" },
    { step: "new-head", work: "alpha", head: HEAD_B },
    { step: "probe", work: "alpha", head: HEAD_B, verdict: "PASS" },
    { step: "probe", work: "alpha", head: HEAD_B, verdict: "PASS", done: true },
    { step: "named", work: "alpha" },
    { step: "landed", work: "alpha", head: HEAD_B },
    { step: "deployed", work: "alpha", deploy: DPL },
    { step: "ramp", work: "alpha", verdict: "GREEN" },
    { step: "ramp", work: "alpha", head: HEAD_C, verdict: "ORANGE", done: false },
    { step: "decision", work: "alpha", verdict: "HOLD", done: true }
  ];
  const money0 = JSON.stringify(lib.mem.money || []);
  const inbox0 = JSON.stringify(lib.mem.inbox || []);
  let cardId = null;
  let prevRows = [];
  const wantLines = [];
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    const r = await post(c);
    if (r.statusCode !== (i === 0 ? 201 : 200) || r.body.ok !== true || r.body.created !== (i === 0)) fail("post " + i + " should be " + (i === 0 ? "201 created" : "200 appended") + ", got " + r.statusCode + " " + JSON.stringify(r.body));
    if (r.body.charged !== false || r.body.sent !== false) fail("post " + i + " reply must say charged:false and sent:false");
    if (!cardId) cardId = r.body.job.id;
    if (r.body.job.id !== cardId) fail("post " + i + " made a different card (a new head must not make a new card)");
    const rows = r.body.job.custom.buildLog.steps;
    if (rows.length !== i + 1) fail("post " + i + " should leave " + (i + 1) + " rows, has " + rows.length);
    for (let j = 0; j < prevRows.length; j++) {
      if (JSON.stringify(rows[j]) !== JSON.stringify(prevRows[j])) fail("post " + i + " changed row " + j);
    }
    const row = rows[i];
    if (JSON.stringify(Object.keys(row)) !== JSON.stringify(ROW_KEYS)) fail("row keys must be exactly " + ROW_KEYS.join(",") + ", got " + Object.keys(row).join(","));
    if (row.step !== c.step || row.head !== (c.head || "") || row.verdict !== (c.verdict || "") || row.deploy !== (c.deploy || "") || row.done !== (c.done === true) || row.by !== "James" || !/^\d{4}-\d\d-\d\dT/.test(row.at)) {
      fail("row " + i + " is wrong: " + JSON.stringify(row));
    }
    if (JSON.stringify(r.body.step) !== JSON.stringify(row)) fail("reply step must be the appended row");
    let line = LABEL[c.step];
    if (c.verdict) line += ": " + c.verdict;
    if (c.head) line += " on " + c.head.slice(0, 8);
    if (c.deploy) line += ". Deploy " + c.deploy;
    if (c.done === true) line += ". Done.";
    wantLines.push(line);
    if (r.body.job.why !== line || r.body.job.result !== line) fail("card text for post " + i + " must be exactly " + JSON.stringify(line) + ", got " + JSON.stringify(r.body.job.why));
    if (r.body.job.title !== "Build log: alpha" || r.body.job.status !== "shipped") fail("card title/status wrong: " + r.body.job.title + " " + r.body.job.status);
    prevRows = JSON.parse(JSON.stringify(rows));
  }
  if (stepCards(lib, slug).length !== 1) fail("one piece of work must be exactly one card, found " + stepCards(lib, slug).length);
  const stored = lib.mem.jobs.find((j) => j.id === cardId);
  if (JSON.stringify(stored.custom.buildLog.steps.map((r) => r.step)) !== JSON.stringify(calls.map((c) => c.step))) fail("rows must stay in the order posted");
  if (stored.custom.buildLog.work !== "alpha" || stored.custom.buildLog.desk !== slug || "head" in stored.custom.buildLog || "pr" in stored.custom.buildLog) fail("card facts wrong: " + JSON.stringify(Object.keys(stored.custom.buildLog)));
  if (JSON.stringify(lib.mem.money || []) !== money0 || JSON.stringify(lib.mem.inbox || []) !== inbox0) fail("step posts wrote money or inbox");
  pass("12 posts make one card with 12 rows in posted order; no row ever changed; done:true appended a new row; replies say charged:false sent:false");
  const allowedSteps = STEPS.length === Object.keys(LABEL).length;
  if (!allowedSteps) fail("step list drifted");
  for (const v of VERDICTS) {
    const r = await post({ step: "ramp", work: "verdicts", verdict: v });
    if (r.statusCode !== 200 && r.statusCode !== 201) fail("verdict " + v + " must be accepted, got " + r.statusCode);
    if (r.body.job.why !== "Ramp: " + v) fail("verdict line wrong for " + v + ": " + r.body.job.why);
  }
  for (const s of STEPS) {
    const body = { step: s, work: "allsteps" };
    if (s === "new-head" || s === "probe") body.head = HEAD_A;
    const r = await post(body);
    if (r.statusCode !== 200 && r.statusCode !== 201) fail("step " + s + " must be accepted, got " + r.statusCode);
  }
  if (stepCards(lib, slug).find((j) => j.custom.buildLog.work === "allsteps").custom.buildLog.steps.map((r) => r.step).join() !== STEPS.join()) fail("all eight steps must be accepted in order");
  pass("all eight steps and all six results (PASS, FAIL, GREEN, ORANGE, RED, HOLD) are accepted");

  // ---- pr key ----
  const p1 = await post({ step: "draft-opened", pr: 601 });
  const p2 = await post({ step: "new-head", pr: 601, head: HEAD_A });
  const p3 = await post({ step: "probe", pr: 601, head: HEAD_B, verdict: "PASS" });
  if (p1.statusCode !== 201 || p2.statusCode !== 200 || p3.statusCode !== 200 || p1.body.job.id !== p2.body.job.id || p2.body.job.id !== p3.body.job.id) fail("one PR must be one card even when the head changes");
  if (p3.body.job.title !== "Build log: #601" || p3.body.job.custom.buildLog.pr !== 601 || p3.body.job.custom.buildLog.steps.length !== 3) fail("pr card wrong: " + JSON.stringify(p3.body.job.custom.buildLog));
  const w601 = await post({ step: "draft-opened", work: "601" });
  if (w601.statusCode !== 201 || w601.body.job.id === p1.body.job.id) fail("work 601 and pr 601 are different keys");
  pass("a PR keys one card across new heads; a work id named like a PR is a different card");

  // ---- History ----
  const hist = await call(desks, "POST", ownerHdr, { action: "history", desks: [{ slug: slug, pin: "" }] }, {}, "/api/desks");
  if (hist.statusCode !== 200) fail("History read should 200");
  const hc = (hist.body.items || []).find((it) => it && it.id === cardId);
  if (!hc || hc.lane !== "done" || hc.kind !== "job" || hc.status !== "shipped" || hc.title !== "Build log: alpha") fail("History card wrong: " + JSON.stringify(hc && { lane: hc.lane, title: hc.title, status: hc.status }));
  if (String(hc.how || "") !== wantLines[wantLines.length - 1] || hc.money) fail("History line must be exactly " + JSON.stringify(wantLines[wantLines.length - 1]) + ", got " + JSON.stringify(hc.how));
  const texts = (hc.thread || []).map((t) => t && t.text);
  if (JSON.stringify(texts) !== JSON.stringify(wantLines)) fail("History thread must be the allowlisted lines in order, got " + JSON.stringify(texts));
  if (!(hc.thread || []).every((t) => t && t.actorKind === "helper")) fail("History thread must stay helper-stamped");
  const dump = JSON.stringify([hc.title, hc.how, hc.result, texts]);
  if (/[<>]|http|\\n/.test(dump)) fail("History carries raw text: " + dump.slice(0, 200));
  if (dump.indexOf(HEAD_A) >= 0 || dump.indexOf(HEAD_B) >= 0 || dump.indexOf(HEAD_C) >= 0) fail("History line must carry only the first 8 of a head");
  if (dump.indexOf("James") >= 0 || dump.indexOf("Sam") >= 0) fail("History line must not carry who posted");
  const queue = await call(jobs, "GET", ownerHdr);
  const qCard = (queue.body.jobs || []).find((j) => j && j.id === cardId);
  if (!qCard || qCard.status !== "shipped" || qCard.decide) fail("a step card must not be Queue work or ask for Yes");
  pass("History shows the card in the done lane with exactly the allowlisted lines, helper-stamped, never as Queue work");

  // ---- Cap: 200 rows, never trim ----
  let capId = null;
  for (let i = 0; i < 200; i++) {
    const r = await post({ step: i % 2 ? "probe" : "ramp", work: "capcard", head: HEAD_A, verdict: "PASS" });
    if (r.statusCode !== (i === 0 ? 201 : 200)) fail("row " + (i + 1) + " must be accepted, got " + r.statusCode + " " + JSON.stringify(r.body));
    capId = r.body.job.id;
  }
  const capCard = lib.mem.jobs.find((j) => j.id === capId);
  if (capCard.custom.buildLog.steps.length !== 200) fail("the card should hold exactly 200 rows");
  const first200 = JSON.stringify(capCard.custom.buildLog.steps);
  for (const extra of [{ step: "decision", work: "capcard" }, { step: "ramp", work: "capcard", done: true }]) {
    const r = await mustRefuse("row 201", extra, null, [409]);
    if (r.body.error !== "This card already has 200 steps. Nothing was saved.") fail("cap wording drifted: " + r.body.error);
  }
  if (JSON.stringify(capCard.custom.buildLog.steps) !== first200 || capCard.custom.buildLog.steps.length !== 200) fail("the cap must never trim or change a row");
  const stillOther = await post({ step: "decision", work: "after-cap" });
  if (stillOther.statusCode !== 201) fail("another card must still work after one hits the cap");
  pass("row 200 is accepted, row 201 is refused with 409 and nothing is saved, no row is trimmed, other cards keep working");

  // ---- Concurrency ----
  const race = await Promise.all([1, 2, 3, 4, 5].map((n) => post({ step: "probe", work: "race", head: HEAD_A, verdict: n % 2 ? "PASS" : "FAIL" })));
  if (race.some((r) => r.statusCode !== 200 && r.statusCode !== 201)) fail("concurrent first posts must all be accepted");
  const raceCards = stepCards(lib, slug).filter((j) => j.custom.buildLog.work === "race");
  if (raceCards.length !== 1 || raceCards[0].custom.buildLog.steps.length !== 5) fail("5 concurrent first posts must make 1 card with 5 rows, got " + raceCards.length + " cards / " + raceCards.map((c) => c.custom.buildLog.steps.length));
  const race2 = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => post({ step: "ramp", work: "race", verdict: VERDICTS[n % 6] })));
  if (race2.some((r) => r.statusCode !== 200)) fail("concurrent follow-up posts must all be accepted");
  if (raceCards[0].custom.buildLog.steps.length !== 11) fail("11 rows expected after 6 more concurrent posts, got " + raceCards[0].custom.buildLog.steps.length);
  for (let n = 0; n < 5; n++) if (!raceCards[0].custom.buildLog.steps.some((r) => r.verdict === "FAIL" || r.verdict === "PASS")) fail("a concurrent row is missing");
  // At the cap, concurrent posts: exactly the free slots are taken.
  for (let i = 0; i < 197; i++) await post({ step: "ramp", work: "edge" });
  const edge = await Promise.all([1, 2, 3, 4, 5].map(() => post({ step: "decision", work: "edge" })));
  const accepted = edge.filter((r) => r.statusCode === 200).length;
  const refusedN = edge.filter((r) => r.statusCode === 409).length;
  const edgeCard = stepCards(lib, slug).find((j) => j.custom.buildLog.work === "edge");
  if (accepted !== 3 || refusedN !== 2 || edgeCard.custom.buildLog.steps.length !== 200) fail("concurrent posts at the cap must take exactly the 3 free slots, got " + accepted + " ok / " + refusedN + " refused / " + edgeCard.custom.buildLog.steps.length + " rows");
  pass("concurrent posts keep every row, make one card, and respect the cap exactly");

  // ---- BL1 child 1 (Probe's six survivors): cross-desk, who posted, legacy sharing, dpl charset, work charset ----
  // P2: another desk's owner can never touch this desk's card. The same work name on desk B is a separate card on B only.
  const deskB = "bl-steps-deskb";
  const deskBOpen = await call(auth, "POST", { "x-workspace": deskB }, { action: "open", slug: deskB, biz: "Desk B", name: "Dee", pin: "7878" }, {}, "/api/auth");
  if (deskBOpen.statusCode !== 201) fail("could not open desk B, got " + deskBOpen.statusCode);
  const deskBPw = await call(auth, "POST", { "x-workspace": deskB, "x-session": deskBOpen.body.session.token }, { action: "password", password: "dee-pass-steps-1234", email: "deeb@steps.test" }, {}, "/api/auth");
  if (deskBPw.statusCode !== 200) fail("could not set a password on desk B, got " + deskBPw.statusCode);
  const deskBLogin = await call(auth, "POST", {}, { action: "login", email: "deeb@steps.test", password: "dee-pass-steps-1234", workspace: deskB }, {}, "/api/auth");
  if (deskBLogin.statusCode !== 200) fail("email login on desk B failed, got " + deskBLogin.statusCode);
  const otherHdr = { "x-workspace": deskB, "x-session": deskBLogin.body.session.token };
  const aCard = lib.mem.jobs.find((j) => j.id === cardId);
  const aBefore = JSON.stringify(jobsOn(lib, slug));
  const aAuditBefore = (lib.mem.audit || []).filter((a) => a && a.workspace === slug).map((a) => JSON.stringify(a));
  const aSteps = aCard.custom.buildLog.steps.length;
  const bWork = await post({ step: "ramp", work: "alpha", verdict: "RED" }, otherHdr);
  if (bWork.statusCode !== 201 || bWork.body.created !== true || bWork.body.job.id === cardId) fail("desk B's owner posting work alpha must make its own card on B, got " + bWork.statusCode + " created=" + (bWork.body && bWork.body.created) + " id " + (bWork.body && bWork.body.job && bWork.body.job.id));
  const bPr = await post({ step: "ramp", pr: 601, verdict: "RED" }, otherHdr);
  if (bPr.statusCode !== 201 || bPr.body.created !== true || bPr.body.job.id === p1.body.job.id) fail("desk B's owner posting PR 601 must make its own card on B");
  if (JSON.stringify(jobsOn(lib, slug)) !== aBefore) fail("a post from desk B changed a card on desk A");
  // The audit log keeps only the newest 200 rows, so desk B's rows may push desk A's oldest off the end. Desk A must gain none and change none.
  const aAuditAfter = (lib.mem.audit || []).filter((a) => a && a.workspace === slug).map((a) => JSON.stringify(a));
  if (aAuditAfter.length > aAuditBefore.length || aAuditAfter.some((row, ri) => row !== aAuditBefore[ri])) fail("a post from desk B added to or changed desk A's audit rows");
  if (!(lib.mem.audit || []).some((a) => a && a.workspace === deskB && a.agent === "Build")) fail("desk B's own post must be audited on desk B");
  if (aCard.custom.buildLog.steps.length !== aSteps || aCard.custom.buildLog.steps.some((r) => r.verdict === "RED")) fail("desk A's card must keep its rows and gain no RED row from desk B");
  const bCards = stepCards(lib, deskB);
  if (bCards.length !== 2 || bCards.some((j) => j.workspace !== deskB || j.custom.buildLog.desk !== deskB || j.custom.buildLog.steps.length !== 1)) fail("desk B must hold exactly its own two one-row cards, got " + bCards.length);
  const bAgain = await post({ step: "decision", work: "alpha", verdict: "HOLD" }, otherHdr);
  if (bAgain.statusCode !== 200 || bAgain.body.job.id !== bWork.body.job.id || bAgain.body.job.custom.buildLog.steps.length !== 2) fail("desk B's own second post must append to desk B's card");
  if (JSON.stringify(jobsOn(lib, slug)) !== aBefore) fail("desk B's second post changed desk A");
  if (stepCards(lib, slug).filter((j) => j.workspace !== slug).length) fail("a card on desk A carries another desk");
  pass("cross-desk: desk B's owner posting the same work or PR makes its own card on B; desk A's cards stay byte-identical and its audit gains no row");

  // P18: no seat or person name in any field of a thread entry (stored, replied, or in History).
  const nameDesk = await post({ step: "named", work: "who-posted" });
  if (nameDesk.statusCode !== 201) fail("who-posted card should be created");
  await post({ step: "probe", work: "who-posted", head: HEAD_A, verdict: "PASS", done: true });
  const nameCard = lib.mem.jobs.find((j) => j.id === nameDesk.body.job.id);
  const nameHist = await call(desks, "POST", ownerHdr, { action: "history", desks: [{ slug: slug, pin: "" }] }, {}, "/api/desks");
  const nameHc = (nameHist.body.items || []).find((it) => it && it.id === nameCard.id);
  if (!nameHc) fail("History must show the who-posted card");
  const seats = [];
  (shop.people || []).forEach(function (p) { if (p && p.name) seats.push(String(p.name)); });
  ["James", "Sam", "Dee", "Lee"].forEach(function (n) { if (seats.indexOf(n) < 0) seats.push(n); });
  const threads = { stored: nameCard.thread, replied: nameDesk.body.job.thread, history: nameHc.thread };
  Object.keys(threads).forEach(function (where) {
    const th = threads[where];
    if (!Array.isArray(th) || th.length !== 2) fail("the " + where + " thread must have exactly 2 entries, got " + JSON.stringify(th && th.length));
    th.forEach(function (entry, ei) {
      const wantText = ei === 0 ? "Named" : "Probe: PASS on 00afea2b. Done.";
      if (entry.from !== "helper" || entry.actorLabel !== "helper" || entry.actorKind !== "helper" || entry.kind !== "note") fail("the " + where + " thread entry " + ei + " must be stamped helper, got " + JSON.stringify(entry));
      if (entry.text !== wantText || entry.input !== wantText || (entry.output || "") !== "") fail("the " + where + " thread entry " + ei + " must carry only the allowlisted line, got " + JSON.stringify(entry));
      const everything = JSON.stringify(entry).toLowerCase();
      seats.forEach(function (n) { if (everything.indexOf(n.toLowerCase()) >= 0) fail("the " + where + " thread entry " + ei + " carries the name " + n + ": " + JSON.stringify(entry)); });
    });
  });
  const nameDump = JSON.stringify([nameHc.title, nameHc.how, nameHc.result, nameCard.why, nameCard.result]).toLowerCase();
  seats.forEach(function (n) { if (nameDump.indexOf(n.toLowerCase()) >= 0) fail("the History line, title, why or result carries the name " + n); });
  pass("no seat or person name appears in any field of a thread entry (stored, replied, or in History)");

  // P19: the audit row is the title and the allowlisted line only, never the body.
  const audit0 = lib.mem.audit[0];
  if (!audit0 || audit0.agent !== "Build" || audit0.result !== "OK" || audit0.workspace !== slug || audit0.action !== "Build log: who-posted · Probe: PASS on 00afea2b. Done.") fail("the step audit row must be exactly the title and the line, got " + JSON.stringify(audit0));
  pass("the step audit row carries only the title and the allowlisted line");

  // P31: a step card and a legacy card never share a card. A legacy repost never touches step rows, and a step post never lands on a legacy card.
  const legacyKey = { pr: 557, head: HEAD_A, status: "draft", name: "Pack" };
  const sharedBefore = jobsOn(lib, slug).length;
  const l1 = await post(legacyKey);
  if (l1.statusCode !== 201 || !l1.body.job.custom.buildLog || Array.isArray(l1.body.job.custom.buildLog.steps)) fail("a legacy post must make a legacy card without a steps array");
  const legacyId = l1.body.job.id;
  const legacyBytes = JSON.stringify(lib.mem.jobs.find((j) => j.id === legacyId));
  const s1 = await post({ step: "probe", pr: 557, head: HEAD_A, verdict: "PASS" });
  if (s1.statusCode !== 201 || s1.body.created !== true || s1.body.job.id === legacyId) fail("a step post on a PR that has a legacy card must make its own step card, got " + s1.statusCode + " same card " + (s1.body.job && s1.body.job.id === legacyId));
  if (JSON.stringify(lib.mem.jobs.find((j) => j.id === legacyId)) !== legacyBytes) fail("a step post changed the legacy card");
  const stepId = s1.body.job.id;
  const stepBytes = JSON.stringify(lib.mem.jobs.find((j) => j.id === stepId));
  const l2 = await post({ pr: 557, head: HEAD_A, status: "landed", name: "Pack" });
  if (l2.statusCode !== 200 || l2.body.job.id !== legacyId) fail("a legacy repost must update the legacy card only, got " + l2.statusCode);
  const stepAfter = lib.mem.jobs.find((j) => j.id === stepId);
  if (JSON.stringify(stepAfter) !== stepBytes || stepAfter.custom.buildLog.steps.length !== 1 || stepAfter.custom.buildLog.steps[0].verdict !== "PASS") fail("a legacy repost changed or erased the step rows");
  const s2 = await post({ step: "ramp", pr: 557, verdict: "GREEN" });
  if (s2.statusCode !== 200 || s2.body.job.id !== stepId || s2.body.job.custom.buildLog.steps.length !== 2) fail("a second step post must append to the step card, not the legacy one");
  const l3 = await post({ pr: 557, head: HEAD_A, status: "landed", name: "Pack" });
  if (l3.statusCode !== 200 || l3.body.job.id !== legacyId) fail("a second legacy repost must still hit the legacy card");
  const stepFinal = lib.mem.jobs.find((j) => j.id === stepId);
  if (stepFinal.custom.buildLog.steps.length !== 2 || stepFinal.custom.buildLog.steps[0].verdict !== "PASS" || stepFinal.custom.buildLog.steps[1].verdict !== "GREEN") fail("the step rows must survive every legacy repost");
  if (Array.isArray(lib.mem.jobs.find((j) => j.id === legacyId).custom.buildLog.steps)) fail("the legacy card must never gain a steps array");
  if (jobsOn(lib, slug).length !== sharedBefore + 2) fail("PR 557 must be exactly two cards, one legacy and one step card");
  // And the other way round: the step card exists first, then a legacy post makes its own card.
  const s3 = await post({ step: "named", pr: 558 });
  const l4 = await post({ pr: 558, head: HEAD_B, status: "draft", name: "Other" });
  if (s3.statusCode !== 201 || l4.statusCode !== 201 || l4.body.job.id === s3.body.job.id || lib.mem.jobs.find((j) => j.id === s3.body.job.id).custom.buildLog.steps.length !== 1) fail("a legacy post on a PR that has a step card must make its own card and leave the step rows alone");
  pass("a step card and a legacy card never share: a legacy repost never touches step rows, and a step post never lands on a legacy card");

  // P10 and P9: the deploy id is dpl_ (lowercase, exact) plus 6 to 40 letters or digits, nothing else.
  const deployBad = [
    ["deploy dpl_../x", "dpl_../x"],
    ["deploy with a path", "dpl_../../etc"],
    ["deploy with a slash in the middle", "dpl_abc/defgh"],
    ["deploy with a leading slash", "dpl_/abcdefgh"],
    ["deploy with a trailing slash", "dpl_abcdefgh/"],
    ["deploy with a backslash", "dpl_abc\\defgh"],
    ["deploy with a dot", "dpl_abc.defgh"],
    ["deploy with two dots", "dpl_abcdefgh.."],
    ["deploy with an underscore", "dpl_abc_defgh"],
    ["deploy with a dash", "dpl_abc-defgh"],
    ["deploy with a colon", "dpl_abc:defgh"],
    ["deploy with a percent", "dpl_abc%2Fdefgh"],
    ["deploy with a plus", "dpl_abc+defgh"],
    ["deploy with a unicode letter", "dpl_abcdéfgh"],
    ["deploy with a fullwidth letter", "dpl_abcdefgｈ"],
    ["deploy with a NUL", "dpl_abc\u0000defgh"],
    ["deploy with a trailing space", "dpl_abcdefgh "],
    ["deploy with a leading space", " dpl_abcdefgh"],
    ["deploy with a tab", "dpl_abc\tdefgh"],
    ["deploy with a trailing newline", "dpl_abcdefgh\n"],
    ["deploy with a double dpl_ prefix", "dpl_dpl_abcdefgh"],
    ["deploy in uppercase prefix", "DPL_abcdefgh"],
    ["deploy in mixed case prefix Dpl_", "Dpl_abcdefgh"],
    ["deploy in mixed case prefix dPl_", "dPl_abcdefgh"],
    ["deploy in mixed case prefix dpL_", "dpL_abcdefgh"],
    ["deploy in mixed case prefix DpL_", "DpL_abcdefgh"],
    ["deploy uppercase prefix with a long id", "DPL_" + "A".repeat(40)],
    ["deploy with a uppercase prefix and path", "DPL_../x"],
    ["deploy with no underscore", "dplabcdefghi"],
    ["deploy with a dash for the underscore", "dpl-abcdefgh"]
  ];
  for (const b of deployBad) {
    const r = await mustRefuse(b[0], { step: "deployed", work: "alpha", deploy: b[1] }, null, [400]);
    if (r.body.error !== "Deploy must be a dpl_ id.") fail(b[0] + " wording drifted: " + r.body.error);
    await mustRefuse(b[0] + " (new card)", { step: "deployed", work: "dpl-fresh", deploy: b[1] }, null, [400]);
  }
  if (jobsOn(lib, slug).some((j) => j.custom && j.custom.buildLog && j.custom.buildLog.work === "dpl-fresh")) fail("a refused deploy id made a card");
  const deployOk = ["dpl_" + "aB3".repeat(2), "dpl_" + "Z9".repeat(20), "dpl_Hp8gavfM", "dpl_000000", "dpl_" + "a".repeat(40)];
  for (const d of deployOk) {
    const r = await post({ step: "deployed", work: "dpl-ok", deploy: d });
    if ((r.statusCode !== 200 && r.statusCode !== 201) || r.body.step.deploy !== d || r.body.job.why !== "Deployed. Deploy " + d) fail("deploy " + d + " (6 to 40 letters or digits) must be accepted exactly as sent, got " + r.statusCode + " " + JSON.stringify(r.body.error || r.body.job.why));
  }
  pass(deployBad.length + " deploy ids with a path, dot, dash, underscore, space, unicode, or an uppercase or mixed-case dpl_ prefix are refused with no write; 6 to 40 letters or digits after lowercase dpl_ are accepted");

  // P6: the work name is a lowercase letter or digit, then up to 39 lowercase letters, digits, or dashes. Never _ or .
  const workBad = ["my_work", "my.work", "a_b", "a.b", "_alpha", ".alpha", "alpha_", "alpha.", "a..b", "a._b", "work.v2", "work_v2", "alpha-beta_", "alpha.beta-gamma", "a_".repeat(10), "..", "_", ".", "a\u0000b", "a b", "alphä", "alpha/", "alpha\\beta"];
  for (const w of workBad) {
    const r = await mustRefuse("work " + JSON.stringify(w), { step: "named", work: w }, null, [400]);
    if (r.body.error !== "Work name must be 1 to 40 lowercase letters, numbers, or dashes.") fail("work " + JSON.stringify(w) + " wording drifted: " + r.body.error);
  }
  const workOk = ["a", "0", "9z", "a-b", "alpha-2", "a--b", "a-", "x".repeat(40), "a1-".repeat(13) + "b"];
  for (const w of workOk) {
    const r = await post({ step: "named", work: w });
    if ((r.statusCode !== 200 && r.statusCode !== 201) || r.body.job.title !== "Build log: " + w || r.body.job.custom.buildLog.work !== w) fail("work " + w + " must be accepted as sent, got " + r.statusCode + " " + JSON.stringify(r.body.error || ""));
  }
  pass(workBad.length + " work names with an underscore, dot, slash, space, or unicode are refused with no write; lowercase letters, digits, and dashes up to 40 are accepted as sent");

  // ---- Legacy posts answer as they did on main ----
  const legacyDesk = "bl-steps-legacy";
  const lo = await call(auth, "POST", { "x-workspace": legacyDesk }, { action: "open", slug: legacyDesk, biz: "Legacy", name: "Lee", pin: "5151" }, {}, "/api/auth");
  await call(auth, "POST", { "x-workspace": legacyDesk, "x-session": lo.body.session.token }, { action: "password", password: "lee-pass-steps-1234", email: "lee@steps.test" }, {}, "/api/auth");
  const ll = await call(auth, "POST", {}, { action: "login", email: "lee@steps.test", password: "lee-pass-steps-1234", workspace: legacyDesk }, {}, "/api/auth");
  const lh = { "x-workspace": legacyDesk, "x-session": ll.body.session.token };
  const lpost = (b) => call(jobs, "POST", lh, Object.assign({ action: "build-log" }, b));
  const t = [];
  const L1 = { pr: 557, head: HEAD_A, status: "draft", name: "Pack ownership" };
  t.push(norm(await lpost(L1)));
  t.push(norm(await lpost(L1)));
  t.push(norm(await lpost({ pr: 557, head: HEAD_A, mainSha: MAIN, verdict: "GREEN", hold: "Waiting on a sign-in safety review.", status: "landed", name: "Pack ownership" })));
  t.push(norm(await lpost({ pr: 557, head: HEAD_B, status: "hold", name: "Pack ownership", hold: "On the safety hold.", verdict: "PASS" })));
  t.push(norm(await lpost({ pr: 561, head: HEAD_A, status: "waiting-on-James", name: "Sign-in safety fixes" })));
  t.push(norm(await lpost({ pr: 562, head: HEAD_A, status: "draft", name: "X", verdict: "HOLD" })));
  t.push(norm(await lpost({ pr: 563, head: HEAD_A, status: "draft", name: "X", amount: 5 })));
  t.push(norm(await lpost({ pr: 563, head: HEAD_A, status: "draft", name: "X", mystery: 1 })));
  const lh2 = await call(desks, "POST", lh, { action: "history", desks: [{ slug: legacyDesk, pin: "" }] }, {}, "/api/desks");
  t.push((lh2.body.items || []).filter((it) => it && it.kind === "job").map((it) => ({ title: it.title, how: it.how, lane: it.lane, status: it.status, n: (it.thread || []).length })).sort((a, b) => a.title < b.title ? -1 : 1));
  t.push({ cards: jobsOn(lib, legacyDesk).length, rows: jobsOn(lib, legacyDesk).map((j) => Object.keys(j.custom.buildLog).sort().join(",")).sort() });
  const got = JSON.stringify(t);
  if (process.env.BL_PRINT_LEGACY) { console.log("LEGACY_JSON " + got); }
  if (got !== JSON.stringify(LEGACY_EXPECTED)) fail("a legacy pr+head post drifted from main fd5cea60:\n got " + got.slice(0, 600) + "\n want " + JSON.stringify(LEGACY_EXPECTED).slice(0, 600));
  if (stepCards(lib, legacyDesk).length) fail("a legacy post must not make a step card");
  pass("legacy pr+head posts: same replies, same rows, same History lines, same counts as main fd5cea60");

  try { fs.rmSync(store, { force: true }); } catch (e) {}
  console.log("check-build-log-steps: ok (" + okCount + " ok)");
}

if (LIVE) {
  main().catch(function (e) { console.error(e && e.stack || e); process.exit(1); });
} else {
  const orig = fs.readFileSync(jobsPath, "utf8");
  main().then(function () {
    const caught = runMutants(orig);
    console.log("check-build-log-steps mutants: " + caught + "/" + MUTANTS.length + " caught");
  }).catch(function (e) {
    try { fs.writeFileSync(jobsPath, orig); } catch (err) {}
    console.error(e && e.stack || e);
    process.exit(1);
  });
}
