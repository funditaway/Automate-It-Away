#!/usr/bin/env node
require("./_env-guard");
// Mutant runner for scripts/check-aia-tld.js. npm test runs this last.
// Copies the repo (no .git, no node_modules) to a temp dir, applies each mutant
// below to api/health.js, runs check-aia-tld.js with a stripped env (PATH and a
// temp HOME only; no keys), and reports caught/total. The real tree is never
// written. Exit 1 if any mutant survives or no longer applies, or if the
// unmutated check fails.
// Usage: node scripts/check-aia-tld-mutants.js [name-filter]
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
// [name, file, [[find, replace], ...]]. Every find must occur in file; every
// occurrence is replaced.
const MUTANTS = [
  ["bridgeLocked dropped from status", "api/health.js", [[
    "    bridgeLocked: bridgeLockedOf(row),\n",
    ""
  ]]],
  ["bridgeLocked forced to false", "api/health.js", [[
    "return row.bridgeLocked === true;",
    "return false;"
  ]]],
  ["ownedByConnected true on status", "api/health.js", [[
    "    bridgeLocked: bridgeLockedOf(row),\n    ownedByConnected: false,\n",
    "    bridgeLocked: bridgeLockedOf(row),\n    ownedByConnected: true,\n"
  ]]],
  ["owner-only bridgeLocked on status", "api/health.js", [[
    "    aiaTld: strangerTld(aiaTld),",
    "    aiaTld: strangerTld(Object.assign({}, aiaTld, { bridgeLocked: !!(person && require(\"./_lib\").isOwner(person)) && aiaTld.bridgeLocked === true })),"
  ]]],
  ["plain health hardcodes bridgeLocked false", "api/health.js", [[
    "block.bridgeLocked = probed.bridgeLocked === true;",
    "block.bridgeLocked = false;"
  ]]]
];

function run(dir, home) {
  const p = spawnSync(process.execPath, ["scripts/check-aia-tld.js"], {
    cwd: dir,
    env: { PATH: process.env.PATH || "/usr/bin:/bin", HOME: home, TMPDIR: os.tmpdir() },
    encoding: "utf8",
    timeout: 120000
  });
  const out = (p.stdout || "") + (p.stderr || "");
  return { code: p.status == null ? 1 : p.status, first: (out.split("\n").find((l) => l.startsWith("FAIL")) || (p.error ? String(p.error.message) : "")).slice(0, 160) };
}

function main() {
  const only = process.argv[2] || "";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-tld-mut-"));
  const dir = path.join(tmp, "repo"), home = path.join(tmp, "home");
  fs.mkdirSync(home);
  fs.cpSync(root, dir, { recursive: true, filter: (s) => !/[\\/](\.git|node_modules)$/.test(s) });
  const files = Array.from(new Set(MUTANTS.map((m) => m[1])));
  const orig = {};
  files.forEach((f) => { orig[f] = fs.readFileSync(path.join(dir, f), "utf8"); });
  const restore = () => files.forEach((f) => fs.writeFileSync(path.join(dir, f), orig[f]));
  let bad = 0, caught = 0, total = 0;
  try {
    const base = run(dir, home);
    console.log("UNMUTATED | " + (base.code === 0 ? "PASS" : "FAIL " + base.first));
    if (base.code !== 0) bad++;
    MUTANTS.forEach(([name, file, reps]) => {
      if (only && name.indexOf(only) < 0) return;
      total++;
      let txt = orig[file];
      const miss = reps.find(([find, repl]) => { if (txt.indexOf(find) < 0) return true; txt = txt.split(find).join(repl); return false; });
      if (miss) { bad++; console.log(name + " | NOOP | text not found in " + file); return; }
      if (txt === orig[file]) { bad++; console.log(name + " | NOOP | changed nothing"); return; }
      fs.writeFileSync(path.join(dir, file), txt);
      const r = run(dir, home);
      restore();
      if (r.code !== 0) { caught++; console.log(name + " | CAUGHT | " + r.first); }
      else { bad++; console.log(name + " | SURVIVED |"); }
    });
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log("SCORE " + caught + "/" + total + " caught");
  process.exitCode = bad ? 1 : 0;
}

main();
