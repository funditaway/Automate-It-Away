#!/usr/bin/env node
require("./_env-guard");
// Mutant runner for scripts/check-account-follow.js (not in the npm test line).
// Copies the repo (no .git, no node_modules) to a temp dir, applies each mutant
// below, runs the follow check with a stripped env, and exits 1 if any survive.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const MUTANTS = [
  ["seat refusals leak 401/403", "api/_account-follow.js", [["if (!seat.ok) return refuse(res, 404, NO_ONE);", "if (!seat.ok) return refuse(res, seat.status, seat.error);"]]],
  ["other account id honoured", "api/_account-follow.js", [["if (s.askedOther(req, post ? body : q, seat.account)) return refuse(res, 404, NO_ONE);\n", ""]]],
  ["plain-body gate dropped", "api/_account-follow.js", [["if (post && !s.plainBody(body)) return refuse(res, 400, s.BODY_NOT_PLAIN);\n", ""]]],
  ["pause blocked when the secrets key is missing", "api/_account-follow.js", [["async function writePause(res, acc, person, whoKind, byHuman, seat, picked, turningOn) {\n  const s = S();\n", "async function writePause(res, acc, person, whoKind, byHuman, seat, picked, turningOn) {\n  const s = S();\n  if (!s.secretKey()) return refuse(res, 409, \"Secrets are off.\");\n"]]],
  ["AI unpause allowed", "api/_account-follow.js", [["if (!turningOn && locked(acc) && !byHuman)", "if (!turningOn && locked(acc) && false)"]]],
  ["pause sets draftOnly false on the Desk AI", "api/_account-follow.js", [["setItemPaused(acc, found.key, turningOn);", "setItemPaused(acc, found.key, turningOn); if (found.hit.kind === \"ai\") { const raw = (found.row.ais || []).find((a) => a && String(a.id || a.name) === found.hit.id); if (raw) raw.draftOnly = false; }"]]],
  ["unpause sets runOnItsOwn", "api/_account-follow.js", [["setItemPaused(acc, found.key, turningOn);", "setItemPaused(acc, found.key, turningOn); if (!turningOn) ensureSettings(acc).runOnItsOwn = true;"]]],
  ["can-do sets allowed.spend true", "api/_account-follow.js", [["const allowed = { read: false, draft: false, spend: false, deletes: false, messageNew: false };", "const allowed = { read: false, draft: false, spend: true, deletes: false, messageNew: false };"]]],
  ["can-do writes history", "api/_account-follow.js", [["return res.status(200).json(baseFlags({ ok: true, wrote: false, can: canAutomation(acc, found) }));", "S().addHistory(acc, seat.person, \"automations\", \"Looked.\", \"human\"); return res.status(200).json(baseFlags({ ok: true, wrote: false, can: canAutomation(acc, found) }));"]]],
  ["activity pushes a fake row", "api/_account-follow.js", [["rows = sortActivity(rows);", "rows = sortActivity(rows); rows.push({ at: \"2099-01-01T00:00:00.000Z\", who: \"invented\", what: \"ran on its own\", kind: \"invented\" });"]]],
  ["undo deletes the Desk AI", "api/_account-follow.js", [["setItemPaused(acc, found.key, frame.beforePaused === true);", "setItemPaused(acc, found.key, frame.beforePaused === true); if (found.row && found.row.ais) found.row.ais.pop();"]]],
  ["undo deletes the cards", "api/_account-follow.js", [["require(\"./_desk\").setDeskClosed(ownedDesk, frame.beforeClosed === true);", "require(\"./_desk\").setDeskClosed(ownedDesk, frame.beforeClosed === true); lib.mem.jobs = [];"]]],
  ["export copies the password and the desk code", "api/_account-follow.js", [["handle: acc.handle || \"\"", "handle: acc.handle || \"\", password: acc.password, deskCode: person && person.pin"]]],
  ["close-account deletes the account", "api/_account-follow.js", [["s.addHistory(acc, person, \"close\", \"Asked to close the account. That stays on hold. Nothing was deleted.\", whoKind, \"account:\" + acc.id);", "s.addHistory(acc, person, \"close\", \"Asked to close the account. That stays on hold. Nothing was deleted.\", whoKind, \"account:\" + acc.id); lib.mem.accounts = (lib.mem.accounts || []).filter((a) => a && a.id !== acc.id); if (lib.mem.jobs) lib.mem.jobs.pop();"]]],
  ["2xx without a save", "api/_account-follow.js", [["if (!ok) restore(acc, shot);\n  return ok;", "return true;"]]],
  ["Stop refused while paused", "api/_account-settings.js", [["if (ALWAYS_STEPS.indexOf(step) >= 0)", "if (false && ALWAYS_STEPS.indexOf(step) >= 0)"]]]
];

const hasUnshare = spawnSync("unshare", ["-rn", "true"]).status === 0;
function run(dir, home) {
  const argv = [process.execPath, path.join(dir, "scripts/check-account-follow.js")];
  const opts = { cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH, HOME: home }, timeout: 120000 };
  const p = hasUnshare ? spawnSync("unshare", ["-rn"].concat(argv), opts) : spawnSync(argv[0], argv.slice(1), opts);
  const out = (p.stdout || "") + (p.stderr || "");
  return { code: p.status == null ? 1 : p.status, first: (out.split("\n").find((l) => l.startsWith("FAIL")) || (p.error ? String(p.error.message) : "")).slice(0, 180) };
}

function main() {
  const only = process.argv[2] || "";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-follow-mut-"));
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
      const label = "F" + (i + 1) + " " + name;
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
