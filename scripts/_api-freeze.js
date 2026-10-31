// API freeze guard. Pins api/ to a commit that is on main (survives a squash-land).
// Files in ALLOW may differ from BASE only inside string literals.
// Any git error, missing BASE, unreadable file, or other api/ change FAILS.
// Never pass by default.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE = "782cbc0730d55498dde14b3cac8e39f34cb68ae3";
const ALLOW = ["api/_aia-admin.js", "api/_aia-mail.js", "api/_aia-net.js"];

// Mask string/template literal bodies, drop comments, collapse whitespace.
function codeShape(src) {
  let out = "";
  let i = 0;
  let prev = "";
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i = src.indexOf("*/", i + 2); i = i < 0 ? src.length : i + 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < src.length && src[i] !== c) { if (src[i] === "\\") i++; i++; }
      i++;
      out += c + "S" + c; prev = c; continue;
    }
    if (c === "/" && /[(,=:[!&|?{};]$|^$/.test(prev)) {
      let j = i + 1, cls = false;
      while (j < src.length && src[j] !== "\n") {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === "[") cls = true; else if (src[j] === "]") cls = false;
        else if (src[j] === "/" && !cls) break;
        j++;
      }
      out += src.slice(i, j + 1); i = j + 1; prev = "/"; continue;
    }
    if (/\s/.test(c)) { if (!/\s$/.test(out)) out += " "; i++; continue; }
    out += c; prev = c; i++;
  }
  return out.trim();
}

function check(root) {
  const git = function (args) {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  };
  const problems = [];
  try { git(["cat-file", "-e", BASE + "^{commit}"]); }
  catch (e) { return { ok: false, problems: ["API freeze base " + BASE.slice(0, 8) + " is not in this clone"], base: BASE }; }
  let changed, untracked;
  try {
    changed = git(["diff", "--name-only", BASE, "--", "api"]).split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    untracked = git(["ls-files", "--others", "--exclude-standard", "--", "api"]).split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
  } catch (e) { return { ok: false, problems: ["could not diff api/ vs " + BASE.slice(0, 8)], base: BASE }; }
  untracked.forEach(function (f) { problems.push("new untracked api file " + f); });
  changed.forEach(function (f) {
    if (ALLOW.indexOf(f) < 0) { problems.push("api file changed outside the allowlist: " + f); return; }
    let before;
    try { before = git(["show", BASE + ":" + f]); }
    catch (e) { problems.push("could not read " + f + " at base"); return; }
    const p = path.join(root, f);
    if (!fs.existsSync(p)) { problems.push(f + " was deleted"); return; }
    let now;
    try { now = fs.readFileSync(p, "utf8"); }
    catch (e) { problems.push("could not read " + f); return; }
    let shapeBefore, shapeNow;
    try { shapeBefore = codeShape(before); shapeNow = codeShape(now); }
    catch (e) { problems.push("could not read " + f); return; }
    if (shapeBefore !== shapeNow) problems.push(f + " changed outside string literals");
  });
  return { ok: problems.length === 0, problems: problems, base: BASE };
}

module.exports = { BASE, ALLOW, codeShape, check };
