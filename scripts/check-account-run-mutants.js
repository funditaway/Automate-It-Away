#!/usr/bin/env node
require("./_env-guard");
// Mutant runner for scripts/check-account-run.js (not in the npm test line).
// Copies the repo (no .git, no node_modules) to a temp dir, applies each mutant
// below, runs the run check with a stripped env, and exits 1 if any survive.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const MUTANTS = [
  ["hold gate skipped, a missing key can turn the switch on", "api/_account-follow.js", [[
    "  if (!runReady()) {\n    if (scope === \"desk\") {\n      const slug = lib.slugify(str(spec.desk));\n      if (!desks.find((w) => w && w.slug === slug)) return { ok: false, status: 404, error: NO_ONE };\n    } else if (spec.kind === \"rule\" || spec.kind === \"ai\") {\n      const found = findAuto(acc, spec.desk, spec.kind, spec.id, desks);\n      if (!found.ok) return { ok: false, status: found.status, error: found.error };\n    }\n    return { ok: false, status: 409, error: RUN_HOLD, available: false, held: true };\n  }\n",
    ""
  ]]],
  ["runReady ignores the key", "api/_account-follow.js", [["return !!S().secretKey();", "return true;"]]],
  ["flags charge and release Collect", "api/_account-follow.js", [["    charged: false,\n    collect: \"hold\",", "    charged: true,\n    collect: \"live\","]]],
  ["an off automation follows the desk", "api/_account-follow.js", [["    if (item === false) return false;\n", ""]]],
  ["an AI account can turn the switch on", "api/_account-follow.js", [["if (turningOn && stored !== true && locked(acc) && !spec.byHuman)", "if (false)"]]],
  ["turn-on clears the Desk AI draft", "api/_account-follow.js", [["  setItemRun(acc, found.key, turningOn);\n", "  setItemRun(acc, found.key, turningOn);\n  if (found.hit.kind === \"ai\" && found.row && Array.isArray(found.row.ais)) { const raw = found.row.ais.find((a) => a && String(a.id) === found.hit.id); if (raw) raw.draftOnly = false; }\n"]]],
  ["may-run list includes send", "api/_account-follow.js", [["return (Array.isArray(hit.ai.steps) ? hit.ai.steps : []).filter((step) => STEP_WORDS[step] && !banned[step] && !never[step]);", "return (Array.isArray(hit.ai.steps) ? hit.ai.steps : []).filter((step) => STEP_WORDS[step] && !banned[step] && !never[step]).concat([\"send\"]);"]]],
  ["another desk is the hold reply", "api/_account-follow.js", [["  const row = deskFor(acc, seat, byHuman, picked.desk);\n  if (!row) return refuse(res, 404, NO_ONE);\n", "  const row = deskFor(acc, seat, byHuman, picked.desk);\n  if (!row) return refuse(res, 409, RUN_HOLD);\n"]]],
  ["strangers get their real status", "api/_account-follow.js", [["if (!seat.ok) return refuse(res, 404, NO_ONE);", "if (!seat.ok) return refuse(res, seat.status, seat.error);"]]],
  ["the reply includes the server key", "api/_account-follow.js", [["  const note = ready ? RUN_READY_NOTE : RUN_HELD_NOTE;\n", "  const note = (ready ? RUN_READY_NOTE : RUN_HELD_NOTE) + String(process.env.AIA_ACCOUNT_SECRETS_KEY || \"\");\n"]]],
  ["message-new no longer stops", "api/_account-settings.js", [["  if (running && stopOn) {\n", "  if (false && running && stopOn) {\n"]]],
  ["spend is charged when the switch is on", "api/_account-settings.js", [["    return { ok: false, status: 409, step, paused: false, held: true, done: false, charged: false, record: true,\n      error: \"Collect stays HOLD. Nothing was charged for \" + label + \".\" };", "    return { ok: false, status: 200, step, paused: false, held: false, done: true, charged: true, record: true,\n      error: \"Charged for \" + label + \".\" };"]]],
  ["a running delete reports done", "api/_account-settings.js", [["    out.runOnItsOwn = true;\n    out.reply = \"This step may run for \" + label + \". Nothing was sent, deleted, or charged. Collect stays HOLD. You still tap Yes, Stop, or Kill.\";\n", "    out.runOnItsOwn = true;\n    out.done = true;\n    out.reply = \"Sent and deleted for \" + label + \".\";\n"]]],
  ["Create saves a live Desk AI", "api/_ais.js", [["    never: NEVER.slice(),\n    draftOnly: true,\n    bound: \"desk\",\n    kind: \"desk-ai\",", "    never: NEVER.slice(),\n    draftOnly: false,\n    bound: \"desk\",\n    kind: \"desk-ai\","]]]
];

const hasUnshare = spawnSync("unshare", ["-rn", "true"]).status === 0;
function run(dir, home) {
  const argv = [process.execPath, path.join(dir, "scripts/check-account-run.js")];
  const opts = { cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH, HOME: home }, timeout: 120000 };
  const p = hasUnshare ? spawnSync("unshare", ["-rn"].concat(argv), opts) : spawnSync(argv[0], argv.slice(1), opts);
  const out = (p.stdout || "") + (p.stderr || "");
  return { code: p.status == null ? 1 : p.status, first: (out.split("\n").find((l) => l.startsWith("FAIL")) || (p.error ? String(p.error.message) : "")).slice(0, 220) };
}

function main() {
  const only = process.argv[2] || "";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-run-mut-"));
  const dir = path.join(tmp, "repo");
  const home = path.join(tmp, "home");
  fs.mkdirSync(home);
  fs.cpSync(root, dir, { recursive: true, filter: (s) => !/[\\/](\.git|node_modules)$/.test(s) });
  const files = Array.from(new Set(MUTANTS.map((m) => m[1])));
  const orig = {};
  files.forEach((f) => { orig[f] = fs.readFileSync(path.join(dir, f), "utf8"); });
  const restore = () => files.forEach((f) => fs.writeFileSync(path.join(dir, f), orig[f]));
  let bad = 0;
  let caught = 0;
  let total = 0;
  try {
    if (!hasUnshare) console.log("note: unshare -rn not available; running without a network namespace");
    const base = run(dir, home);
    console.log("UNMUTATED | " + (base.code === 0 ? "PASS" : "FAIL " + base.first));
    if (base.code !== 0) bad++;
    MUTANTS.forEach(([name, file, reps], i) => {
      const label = "R" + (i + 1) + " " + name;
      if (only && label.indexOf(only) < 0 && name.indexOf(only) < 0) return;
      total++;
      let txt = orig[file];
      const miss = reps.find(([find, repl]) => { if (txt.indexOf(find) < 0) return true; txt = txt.split(find).join(repl); return false; });
      if (miss) { bad++; console.log(label + " | NOOP | text not found in " + file); return; }
      fs.writeFileSync(path.join(dir, file), txt);
      const r = run(dir, home);
      restore();
      if (r.code !== 0) { caught++; console.log(label + " | CAUGHT | " + r.first); }
      else { bad++; console.log(label + " | SURVIVED |"); }
    });
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log("SCORE " + caught + "/" + total + " caught");
  process.exitCode = bad ? 1 : 0;
}

main();
