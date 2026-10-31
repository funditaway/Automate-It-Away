#!/usr/bin/env node
require("./_env-guard");
// Proves scripts/_api-freeze.js. The live tree must pass. Each mutant is
// applied on a local clone (base 782cbc07 is on main) and the three UI checks
// must exit non-zero for that reason:
//   a non-string edit in api/_aia-mail.js
//   any edit in another api/ file
//   a missing base SHA and a bogus base SHA (check-ux-signin included)
// A string-only edit in an allowlisted file must still pass.
// Usage: node scripts/check-api-freeze.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const freeze = require("./_api-freeze");
const CHECKS = [
  "scripts/check-queue-login-ui.js",
  "scripts/check-setup-cards-ui.js",
  "scripts/check-ux-signin.js"
];
const OVERLAY = [
  "scripts/_api-freeze.js",
  "scripts/check-queue-login-ui.js",
  "scripts/check-setup-cards-ui.js",
  "scripts/check-ux-signin.js"
];

let failed = 0;
let passed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log("ok   " + msg); }
  else { failed += 1; console.error("FAIL " + msg); process.exitCode = 1; }
}

function runCheck(dir, rel) {
  return spawnSync(process.execPath, [path.join(dir, rel)], {
    cwd: dir,
    env: { PATH: process.env.PATH || "", HOME: dir, TMPDIR: os.tmpdir() },
    encoding: "utf8",
    timeout: 180000
  });
}

function textOf(r) { return (r.stdout || "") + "\n" + (r.stderr || ""); }

const live = freeze.check(root);
ok(live.ok === true && live.problems.length === 0 && live.base === freeze.BASE, "live api/ freeze passes vs " + freeze.BASE.slice(0, 8) + (live.ok ? "" : " (" + live.problems.join("; ") + ")"));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aia-api-freeze-"));
let caught = 0;
let total = 0;
try {
  execFileSync("git", ["clone", "--local", root, dir], { stdio: ["ignore", "pipe", "pipe"] });
  OVERLAY.forEach(function (rel) {
    fs.copyFileSync(path.join(root, rel), path.join(dir, rel));
  });
  const snap = {};
  function read(rel) { return fs.readFileSync(path.join(dir, rel), "utf8"); }
  function write(rel, text) { fs.writeFileSync(path.join(dir, rel), text); }
  ["api/_aia-mail.js", "api/health.js", "scripts/_api-freeze.js"].forEach(function (rel) { snap[rel] = read(rel); });
  function restore() {
    Object.keys(snap).forEach(function (rel) { write(rel, snap[rel]); });
  }

  const clean = freeze.check(dir);
  ok(clean.ok === true, "clone freeze passes before mutants" + (clean.ok ? "" : " (" + clean.problems.join("; ") + ")"));
  CHECKS.forEach(function (rel) {
    const r = runCheck(dir, rel);
    ok(r.status === 0, "unmutated " + path.basename(rel) + " passes (" + r.status + ")");
  });

  const mail = read("api/_aia-mail.js");
  const swapped = mail.replace("Type an AIA email, like name@your-account.aia.", "Type an AIA email, like person@your-account.aia.");
  ok(swapped !== mail, "string-only control edits a literal");
  write("api/_aia-mail.js", swapped);
  const stringOnly = freeze.check(dir);
  ok(stringOnly.ok === true, "string-only edit stays inside the allowlist" + (stringOnly.ok ? "" : " (" + stringOnly.problems.join("; ") + ")"));
  restore();

  const mutants = [
    ["mail non-string", function () {
      write("api/_aia-mail.js", snap["api/_aia-mail.js"] + "\nfunction freezeMutantProbe(){return 1;}\n");
    }, "changed outside string literals"],
    ["other api file", function () {
      write("api/health.js", snap["api/health.js"] + "\nfunction freezeMutantProbe(){return 1;}\n");
    }, "outside the allowlist"],
    ["missing base", function () {
      write("scripts/_api-freeze.js", snap["scripts/_api-freeze.js"].replace(freeze.BASE, "0123456789abcdef0123456789abcdef01234567"));
    }, "is not in this clone"],
    ["bogus base", function () {
      write("scripts/_api-freeze.js", snap["scripts/_api-freeze.js"].replace(freeze.BASE, "not-a-real-sha"));
    }, "is not in this clone"]
  ];

  mutants.forEach(function (row) {
    const name = row[0];
    const apply = row[1];
    const needle = row[2];
    restore();
    apply();
    CHECKS.forEach(function (rel) {
      total += 1;
      const r = runCheck(dir, rel);
      const out = textOf(r);
      const hit = r.status !== 0 && out.indexOf(needle) >= 0;
      if (hit) {
        caught += 1;
        console.log("ok   " + name + " | " + path.basename(rel) + " | CAUGHT");
      } else {
        failed += 1;
        process.exitCode = 1;
        const first = out.split("\n").filter(function (l) { return l.indexOf("FAIL") === 0; })[0] || ("exit " + r.status);
        console.error("FAIL " + name + " | " + path.basename(rel) + " | SURVIVED | " + first.slice(0, 180));
      }
    });
    restore();
  });
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

ok(total > 0 && caught === total, "SCORE " + caught + "/" + total + " caught");
if (failed) {
  console.error("check-api-freeze: " + failed + " failed, " + passed + " passed, mutants " + caught + "/" + total);
  process.exit(1);
}
console.log("check-api-freeze: " + passed + " passed, mutants " + caught + "/" + total + " caught");
