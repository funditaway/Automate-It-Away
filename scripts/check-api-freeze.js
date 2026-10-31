#!/usr/bin/env node
require("./_env-guard");
// Proves scripts/_api-freeze.js. The live tree must pass. Each mutant is
// applied on a local clone (BASE is api/ on main) and the three UI checks
// must exit non-zero for that reason:
//   a non-string edit in a pinned api file
//   a string-only edit in a pinned api file (blob pin; not a literal mask)
//   a template literal / backtick in a pinned api file (no silent mask)
//   the platform handle swapped inside isPlatformAccount
//   any edit in another api/ file
//   a missing base (real shallow clone of the tip) and a bogus base SHA
//     (check-ux-signin included)
//   an untracked api/_zz-hidden.js, including when api/.gitignore, a root
//     .gitignore, or .git/info/exclude would have hidden it
//   a tracked api file edited in the worktree and not committed
//   a tracked api file replaced by a symlink to the same bytes
//   an untracked symlink under api/
//   a tracked api file whose index mode is 100755
// A missing base must fail closed. Never pass by default.
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
const LANDED = ["api/_aia-admin.js", "api/_aia-mail.js", "api/_aia-net.js"];

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
    timeout: 300000
  });
}

function textOf(r) { return (r.stdout || "") + "\n" + (r.stderr || ""); }

function git(cwd, args) {
  return execFileSync("git", args, { cwd: cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

const live = freeze.check(root);
ok(live.ok === true && live.problems.length === 0 && live.base === freeze.BASE, "live api/ freeze passes vs " + freeze.BASE.slice(0, 8) + (live.ok ? "" : " (" + live.problems.join("; ") + ")"));
ok(typeof freeze.codeShape !== "function", "freeze has no string mask");
LANDED.forEach(function (rel) {
  let at = "";
  try { at = git(root, ["rev-parse", freeze.BASE + ":" + rel]).trim(); } catch (e) { at = ""; }
  ok(freeze.PIN[rel] === at && at.length === 40, rel + " pin is its blob at the freeze base");
});
let grokBase = "";
let grokNow = "";
try { grokBase = git(root, ["rev-parse", freeze.BASE + ":api/_grok.js"]).trim(); } catch (e) { grokBase = ""; }
try { grokNow = git(root, ["hash-object", "--", "api/_grok.js"]).trim(); } catch (e) { grokNow = ""; }
ok(freeze.PIN["api/_grok.js"] === grokNow && grokNow !== grokBase && grokNow.length === 40, "api/_grok.js pin is the neutral-example blob");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aia-api-freeze-"));
let caught = 0;
let total = 0;
function score(name, rel, r, needle) {
  total += 1;
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
}

function scoreFreeze(name, result, needle) {
  total += 1;
  const text = (result.problems || []).join(" ");
  const hit = result.ok === false && text.indexOf(needle) >= 0;
  if (hit) {
    caught += 1;
    console.log("ok   " + name + " | freeze | CAUGHT");
  } else {
    failed += 1;
    process.exitCode = 1;
    console.error("FAIL " + name + " | freeze | SURVIVED | " + text.slice(0, 180));
  }
}

try {
  execFileSync("git", ["clone", "--local", root, dir], { stdio: ["ignore", "pipe", "pipe"] });
  OVERLAY.forEach(function (rel) {
    fs.copyFileSync(path.join(root, rel), path.join(dir, rel));
  });
  const snap = {};
  function read(rel) { return fs.readFileSync(path.join(dir, rel), "utf8"); }
  function write(rel, text) { fs.writeFileSync(path.join(dir, rel), text); }
  ["api/_aia-mail.js", "api/_aia-admin.js", "api/health.js", "scripts/_api-freeze.js"].forEach(function (rel) { snap[rel] = read(rel); });
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
  ok(stringOnly.ok === false && stringOnly.problems.join(" ").indexOf("pinned blob") >= 0, "string-only edit fails the blob pin" + (stringOnly.ok ? "" : " (" + stringOnly.problems.join("; ") + ")"));
  restore();

  const quote = '"Type an AIA email, like name@your-account.aia."';
  const template = '`Type an AIA email, like name@your-account.aia.${""}`';
  ok(mail.indexOf(quote) >= 0, "template control finds a plain string");
  write("api/_aia-mail.js", mail.replace(quote, template));
  const templated = freeze.check(dir);
  ok(templated.ok === false && templated.problems.join(" ").indexOf("pinned blob") >= 0, "template literal fails closed (no silent mask)");
  ok(read("api/_aia-mail.js").indexOf("`") >= 0, "template control wrote a backtick");
  restore();

  const admin = read("api/_aia-admin.js");
  const handleFrom = '  const handle = normalizeHandle(acc.handle || acc.xHandle || acc.slug);\n  return handle === "aia";';
  const handleTo = '  const handle = normalizeHandle(acc.handle || acc.xHandle || acc.slug);\n  return handle === "springfield-shop";';
  ok(admin.indexOf(handleFrom) === admin.lastIndexOf(handleFrom) && admin.indexOf(handleFrom) >= 0, "platform-handle anchor is unique");
  write("api/_aia-admin.js", admin.replace(handleFrom, handleTo));
  const handleSwap = freeze.check(dir);
  ok(handleSwap.ok === false && handleSwap.problems.join(" ").indexOf("pinned blob") >= 0, "platform handle swap fails the blob pin");
  restore();

  const mutants = [
    ["mail non-string", function () {
      write("api/_aia-mail.js", snap["api/_aia-mail.js"] + "\nfunction freezeMutantProbe(){return 1;}\n");
    }, "pinned blob"],
    ["mail template literal", function () {
      write("api/_aia-mail.js", snap["api/_aia-mail.js"].replace(quote, template));
    }, "pinned blob"],
    ["platform handle swap", function () {
      write("api/_aia-admin.js", snap["api/_aia-admin.js"].replace(handleFrom, handleTo));
    }, "pinned blob"],
    ["other api file", function () {
      write("api/health.js", snap["api/health.js"] + "\nfunction freezeMutantProbe(){return 1;}\n");
    }, "outside the pin"],
    ["bogus base", function () {
      write("scripts/_api-freeze.js", snap["scripts/_api-freeze.js"].split(freeze.BASE).join("not-a-real-sha"));
    }, "is not in this clone"]
  ];

  mutants.forEach(function (row) {
    const name = row[0];
    const apply = row[1];
    const needle = row[2];
    restore();
    apply();
    CHECKS.forEach(function (rel) {
      const r = runCheck(dir, rel);
      score(name, rel, r, needle);
    });
    restore();
  });

  restore();
  try { execFileSync("git", ["update-index", "--no-assume-unchanged", "api/health.js"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] }); } catch (e) {}
  write("api/health.js", snap["api/health.js"] + "\nfunction freezeMutantProbe(){return 1;}\n");
  execFileSync("git", ["update-index", "--assume-unchanged", "api/health.js"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
  const dirty = freeze.check(dir);
  scoreFreeze("tracked worktree edit", dirty, "outside the pin");
  CHECKS.forEach(function (rel) {
    score("tracked worktree edit", rel, runCheck(dir, rel), "outside the pin");
  });
  try { execFileSync("git", ["update-index", "--no-assume-unchanged", "api/health.js"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] }); } catch (e) {}
  restore();

  const hiddenJs = "module.exports = function () { return 1; };\n";
  function readOpt(rel) {
    const p = path.join(dir, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  }
  const ignoreSnap = {
    ".gitignore": readOpt(".gitignore"),
    ".git/info/exclude": readOpt(".git/info/exclude"),
    "api/.gitignore": readOpt("api/.gitignore")
  };
  function writeOpt(rel, text) {
    const p = path.join(dir, rel);
    if (text === null) { if (fs.existsSync(p)) fs.unlinkSync(p); return; }
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  }
  function cleanupHidden() {
    const hiddenPath = path.join(dir, "api/_zz-hidden.js");
    if (fs.existsSync(hiddenPath)) fs.unlinkSync(hiddenPath);
    writeOpt("api/.gitignore", ignoreSnap["api/.gitignore"]);
    writeOpt(".gitignore", ignoreSnap[".gitignore"]);
    writeOpt(".git/info/exclude", ignoreSnap[".git/info/exclude"]);
    restore();
  }
  const hidden = [
    ["api gitignore star", function () {
      fs.writeFileSync(path.join(dir, "api/.gitignore"), "*\n");
      fs.writeFileSync(path.join(dir, "api/_zz-hidden.js"), hiddenJs);
    }],
    ["root gitignore", function () {
      const prev = ignoreSnap[".gitignore"] || "";
      fs.writeFileSync(path.join(dir, ".gitignore"), prev + (prev && !/\n$/.test(prev) ? "\n" : "") + "api/_zz-hidden.js\n");
      fs.writeFileSync(path.join(dir, "api/_zz-hidden.js"), hiddenJs);
    }],
    ["info exclude", function () {
      const prev = ignoreSnap[".git/info/exclude"] || "";
      fs.writeFileSync(path.join(dir, ".git/info/exclude"), prev + (prev && !/\n$/.test(prev) ? "\n" : "") + "api/_zz-hidden.js\n");
      fs.writeFileSync(path.join(dir, "api/_zz-hidden.js"), hiddenJs);
    }],
    ["plain untracked", function () {
      fs.writeFileSync(path.join(dir, "api/_zz-hidden.js"), hiddenJs);
    }]
  ];
  hidden.forEach(function (row) {
    cleanupHidden();
    try {
      row[1]();
      const seen = freeze.check(dir);
      scoreFreeze(row[0], seen, "api/_zz-hidden.js");
      CHECKS.forEach(function (rel) {
        score(row[0], rel, runCheck(dir, rel), "api/_zz-hidden.js");
      });
    } finally {
      cleanupHidden();
    }
  });

  const linkOutside = path.join(os.tmpdir(), "aia-freeze-link-target-" + process.pid);
  function unlinkIfLink(rel) {
    const full = path.join(dir, rel);
    try {
      if (fs.lstatSync(full).isSymbolicLink()) fs.unlinkSync(full);
    } catch (e) {}
  }
  function cleanupShape() {
    unlinkIfLink("api/health.js");
    unlinkIfLink("api/_zz-symlink.js");
    try { if (fs.existsSync(linkOutside)) fs.unlinkSync(linkOutside); } catch (e) {}
    restore();
    try { execFileSync("git", ["update-index", "--chmod=-x", "--", "api/health.js"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] }); } catch (e) {}
  }
  const shape = [
    ["tracked symlink", function () {
      fs.writeFileSync(linkOutside, snap["api/health.js"]);
      unlinkIfLink("api/health.js");
      try { fs.unlinkSync(path.join(dir, "api/health.js")); } catch (e) {}
      fs.symlinkSync(linkOutside, path.join(dir, "api/health.js"));
      const orig = git(dir, ["rev-parse", "HEAD:api/health.js"]).trim();
      const hashed = git(dir, ["hash-object", "--", "api/health.js"]).trim();
      ok(orig === hashed && orig.length === 40, "symlink to identical bytes still hashes as the file");
    }, "api symlink"],
    ["untracked symlink", function () {
      fs.symlinkSync(path.join(dir, "api/health.js"), path.join(dir, "api/_zz-symlink.js"));
    }, "api symlink"],
    ["mode 100755", function () {
      execFileSync("git", ["update-index", "--chmod=+x", "--", "api/health.js"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
      const line = git(dir, ["ls-files", "-s", "--", "api/health.js"]);
      ok(line.indexOf("100755") === 0, "mode mutant staged 100755");
    }, "100755"]
  ];
  shape.forEach(function (row) {
    cleanupShape();
    try {
      row[1]();
      const seen = freeze.check(dir);
      scoreFreeze(row[0], seen, row[2]);
      CHECKS.forEach(function (rel) {
        score(row[0], rel, runCheck(dir, rel), row[2]);
      });
    } finally {
      cleanupShape();
    }
  });

  restore();
  const prep = fs.mkdtempSync(path.join(os.tmpdir(), "aia-api-freeze-tip-"));
  const shallow = fs.mkdtempSync(path.join(os.tmpdir(), "aia-api-freeze-shallow-"));
  try {
    execFileSync("git", ["clone", "--local", dir, prep], { stdio: ["ignore", "pipe", "pipe"] });
    OVERLAY.forEach(function (rel) {
      fs.copyFileSync(path.join(root, rel), path.join(prep, rel));
    });
    execFileSync("git", ["checkout", "-B", "freeze-tip"], { cwd: prep, stdio: ["ignore", "pipe", "pipe"] });
    execFileSync("git", ["add", "-A"], { cwd: prep, stdio: ["ignore", "pipe", "pipe"] });
    execFileSync("git", ["-c", "user.email=freeze@example.com", "-c", "user.name=Freeze", "commit", "--allow-empty", "-m", "freeze tip"], { cwd: prep, stdio: ["ignore", "pipe", "pipe"] });
    const prepHasBase = spawnSync("git", ["cat-file", "-e", freeze.BASE + "^{commit}"], { cwd: prep, encoding: "utf8" });
    ok(prepHasBase.status === 0, "full clone still has the freeze base before the shallow copy");
    execFileSync("git", ["clone", "--depth", "1", "--branch", "freeze-tip", "--no-local", "file://" + prep, shallow], { stdio: ["ignore", "pipe", "pipe"] });
    const shallowHasBase = spawnSync("git", ["cat-file", "-e", freeze.BASE + "^{commit}"], { cwd: shallow, encoding: "utf8" });
    ok(shallowHasBase.status !== 0, "shallow clone (depth 1 of the tip) does not contain the freeze base");
    if (shallowHasBase.status === 0) {
      failed += 1;
      process.exitCode = 1;
      console.error("FAIL missing base | shallow clone still has the base; not a real mutant");
    } else {
      const shallowFreeze = freeze.check(shallow);
      const freezeHit = shallowFreeze.ok === false && shallowFreeze.problems.join(" ").indexOf("is not in this clone") >= 0;
      total += 1;
      if (freezeHit) {
        caught += 1;
        console.log("ok   missing base | freeze | CAUGHT");
      } else {
        failed += 1;
        process.exitCode = 1;
        console.error("FAIL missing base | freeze | SURVIVED | " + shallowFreeze.problems.join("; ").slice(0, 180));
      }
      CHECKS.forEach(function (rel) {
        const r = runCheck(shallow, rel);
        score("missing base", rel, r, "is not in this clone");
      });
    }
  } finally {
    fs.rmSync(prep, { recursive: true, force: true });
    fs.rmSync(shallow, { recursive: true, force: true });
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

ok(total > 0 && caught === total, "SCORE " + caught + "/" + total + " caught");
if (failed) {
  console.error("check-api-freeze: " + failed + " failed, " + passed + " passed, mutants " + caught + "/" + total);
  process.exit(1);
}
console.log("check-api-freeze: " + passed + " passed, mutants " + caught + "/" + total + " caught");
