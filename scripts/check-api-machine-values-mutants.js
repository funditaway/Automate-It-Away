#!/usr/bin/env node
require("./_env-guard");
// Mutant runner for scripts/check-api-machine-values.js.
// Copies the repo (no node_modules) to a temp dir, including .git so the
// API freeze can be re-pinned. Applies each of Probe's 8 survivors exactly
// (file, find, replace, count), git-adds that api file, and rewrites its
// PIN blob to the new hash. The freeze then passes on the mutant bytes, so
// it cannot be what fails the check. The value check must fail. A control
// copy is re-pinned with no edit and must pass. The real tree is never written.
// Usage: node scripts/check-api-machine-values-mutants.js [id-filter]
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const FREEZE = "scripts/_api-freeze.js";
// [id, description, file, find, replace, count]. count is exact, first match only
// when count is 1. Strings are Probe's table.
const MUTANTS = [
  ["M4", "connect-wallet emptyPublic collect 'hold'->'live'", "api/_connect-wallet.js",
    "    collect: \"hold\",\n    mint: false,\n    live: false,\n    note: \"No wallet connected",
    "    collect: \"live\",\n    mint: false,\n    live: false,\n    note: \"No wallet connected", 1],
  ["M5", "connect-wallet emptyPublic mint false->true", "api/_connect-wallet.js",
    "    collect: \"hold\",\n    mint: false,\n    live: false,\n    note: \"No wallet connected",
    "    collect: \"hold\",\n    mint: true,\n    live: false,\n    note: \"No wallet connected", 1],
  ["M7", "mfa off: hold true -> false", "api/_account-http.js",
    "{ ok: true, hold: true, mfaOn: false, hint: \"Two-step",
    "{ ok: true, hold: false, mfaOn: false, hint: \"Two-step", 1],
  ["M8", "connections helper POST 403 -> 200", "api/connections.js",
    "    if (person && !isOwner(person)) {\n      return res.status(403).json({ error: \"Only the owner can connect this.",
    "    if (person && !isOwner(person)) {\n      return res.status(200).json({ error: \"Only the owner can connect this.", 1],
  ["M9", "connections whatnot 409 -> 200", "api/connections.js",
    "return res.status(409).json({ error: \"Whatnot stays down. Off for now.\", status: \"down\" });",
    "return res.status(200).json({ error: \"Whatnot stays down. Off for now.\", status: \"down\" });", 1],
  ["M11", "hook GET send 'hold' -> 'live'", "api/hook.js",
    "      send: \"hold\",",
    "      send: \"live\",", 1],
  ["M14", "health honestConnection status 'hold' -> 'live'", "api/health.js",
    "status: wrote ? \"live\" : \"hold\",",
    "status: wrote ? \"live\" : \"live\",", 1],
  ["M15", "health honestConnection whatnot status 'down' -> 'live'", "api/health.js",
    "      live: false,\n      status: \"down\",\n      note: \"Off for now.\"",
    "      live: false,\n      status: \"live\",\n      note: \"Off for now.\"", 1]
];

const API_FILES = Array.from(new Set(MUTANTS.map(function (m) { return m[2]; })));

function git(dir, args) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function replaceCount(text, find, repl, count) {
  let out = text;
  let from = 0;
  let n = 0;
  while (n < count) {
    const at = out.indexOf(find, from);
    if (at < 0) return null;
    out = out.slice(0, at) + repl + out.slice(at + find.length);
    from = at + repl.length;
    n += 1;
  }
  return out;
}

function setPin(src, rel, blob) {
  const key = "\"" + rel + "\": \"";
  const at = src.indexOf(key);
  if (at < 0) return null;
  const start = at + key.length;
  if (!/^[0-9a-f]{40}"/.test(src.slice(start, start + 41))) return null;
  return src.slice(0, start) + blob + src.slice(start + 40);
}

// Stage the api files so the index blob matches the worktree, then point PIN
// at those blobs. Files not listed keep the pin already in the freeze module.
function repin(dir, rels) {
  if (rels.length) git(dir, ["add", "--"].concat(rels));
  const freezePath = path.join(dir, FREEZE);
  let src = fs.readFileSync(freezePath, "utf8");
  rels.forEach(function (rel) {
    const blob = git(dir, ["hash-object", "--", rel]).trim();
    const next = setPin(src, rel, blob);
    if (!next) throw new Error("could not re-pin " + rel);
    src = next;
  });
  fs.writeFileSync(freezePath, src);
}

function restore(dir) {
  git(dir, ["checkout", "HEAD", "--"].concat(API_FILES).concat([FREEZE]));
}

function freezeProblems(dir) {
  const p = spawnSync(process.execPath, ["-e",
    "const r=require('./scripts/_api-freeze').check(process.cwd());" +
    "if(!r.ok){process.stderr.write((r.problems||[]).join('; '));process.exit(1);}"
  ], {
    cwd: dir,
    env: { PATH: process.env.PATH || "/usr/bin:/bin", HOME: dir, TMPDIR: os.tmpdir() },
    encoding: "utf8",
    timeout: 60000
  });
  if (p.status === 0) return "";
  return ((p.stderr || "") + (p.stdout || "") + (p.error ? p.error.message : "")).trim().slice(0, 240);
}

function runCheck(dir, home) {
  const p = spawnSync(process.execPath, ["scripts/check-api-machine-values.js"], {
    cwd: dir,
    env: { PATH: process.env.PATH || "/usr/bin:/bin", HOME: home, TMPDIR: os.tmpdir() },
    encoding: "utf8",
    timeout: 120000
  });
  const out = (p.stdout || "") + (p.stderr || "");
  const first = (out.split("\n").find(function (l) { return l.indexOf("FAIL") === 0; }) || (p.error ? String(p.error.message) : "")).slice(0, 180);
  return { code: p.status == null ? 1 : p.status, first: first };
}

function main() {
  const only = process.argv[2] || "";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-mv-mut-"));
  const dir = path.join(tmp, "repo");
  const home = path.join(tmp, "home");
  fs.mkdirSync(home);
  fs.cpSync(root, dir, { recursive: true, filter: function (src) { return !/[\\/]node_modules$/.test(src); } });
  try { fs.rmSync(path.join(dir, ".git", "index.lock"), { force: true }); } catch (e) {}

  let bad = 0;
  let caught = 0;
  let total = 0;
  try {
    restore(dir);
    repin(dir, API_FILES.slice());
    const pin = freezeProblems(dir);
    const base = runCheck(dir, home);
    const controlOk = !pin && base.code === 0;
    console.log("CONTROL | " + (controlOk ? "PASS" : "FAIL") + (pin ? " | freeze " + pin : "") + (base.code === 0 ? "" : " | " + base.first));
    if (!controlOk) bad += 1;
    restore(dir);

    MUTANTS.forEach(function (row) {
      const id = row[0];
      const desc = row[1];
      const file = row[2];
      const find = row[3];
      const repl = row[4];
      const count = row[5];
      if (only && id.indexOf(only) < 0 && desc.indexOf(only) < 0) return;
      total += 1;
      restore(dir);
      const orig = fs.readFileSync(path.join(dir, file), "utf8");
      const next = replaceCount(orig, find, repl, count);
      if (next == null) {
        bad += 1;
        console.log(id + " | NOOP | text not found in " + file);
        return;
      }
      if (next === orig) {
        bad += 1;
        console.log(id + " | NOOP | changed nothing");
        return;
      }
      const hits = orig.split(find).length - 1;
      if (hits < count) {
        bad += 1;
        console.log(id + " | NOOP | found " + hits + " wanted " + count);
        return;
      }
      fs.writeFileSync(path.join(dir, file), next);
      let pinned = "";
      try { repin(dir, [file]); }
      catch (e) { pinned = (e && e.message) || String(e); }
      const freeze = pinned || freezeProblems(dir);
      if (freeze) {
        bad += 1;
        console.log(id + " | PIN | freeze still fails after re-pin | " + freeze);
        return;
      }
      const r = runCheck(dir, home);
      if (r.code !== 0) {
        caught += 1;
        console.log(id + " | CAUGHT | " + r.first);
      } else {
        bad += 1;
        console.log(id + " | SURVIVED | " + desc);
      }
    });
  } finally {
    try { restore(dir); } catch (e) {}
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log("SCORE " + caught + "/" + total + " caught");
  console.log("CONTROL " + (bad && caught === total ? "see above" : (caught === total && bad === 0 ? "PASS" : "FAIL")));
  process.exitCode = bad || caught !== total ? 1 : 0;
}

main();
