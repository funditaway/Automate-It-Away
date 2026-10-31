// API freeze. The freeze base is api/ on main.
// Every api/ file must match its blob at BASE. A file listed in PIN must
// match that blob id instead. There is no string mask: a backtick, a template
// literal, or any other byte change is a different blob and fails closed.
// Modes come from `git ls-files -s` and the base `git ls-tree -r`. A symlink
// (120000), an executable (100755), or any other non-100644 mode fails.
// hash-object follows a symlink, so a link to the same bytes still matches
// the blob; the worktree is lstat'd and any symlink or non-regular file
// under api/ fails closed. A missing BASE fails closed. Never pass by default.
//
// How a later API PR updates the pin (one constant plus blob ids):
//   1. Set BASE to the full 40-character SHA of api/ on main — the main
//      commit this change is based on, or post-land main once it has landed.
//   2. Set PIN to {} or to each api/ file this PR may change, mapped to the
//      blob id of its new bytes (`git rev-parse <that-commit>:path` after the
//      change, or `git hash-object` of the worktree file). Files absent from
//      PIN must match BASE byte for byte. A pin equal to the blob at BASE
//      just records that those landed bytes stay exact.
//   Do not widen this back to "any string literal".
//
// When to retire the freeze:
//   Remove this module and the freeze calls in check-queue-login-ui.js,
//   check-setup-cards-ui.js, and check-ux-signin.js once api/ changes are
//   reviewed in the PR diff and this pin is no longer the gate. Until then,
//   every PR that touches api/ updates BASE and PIN in the same commit.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE = "27287b6174419c1e57781a512d759a08c2e20601";
const PIN = {
  "api/_aia-admin.js": "88c9303aee9b120e1b7962c2b0f337c1fced0c56",
  "api/_aia-mail.js": "95c0615905927e29f2dbd752fb53fe95bd6f0e80",
  "api/_aia-net.js": "b592bc6615323a570a1e20b27c1a79219094a58e",
  "api/_grok.js": "8d3ed7cfe9449a0ea72601bcc9f2cd927f318807"
};

function lines(text) {
  return String(text || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
}

function relOf(root, full) {
  return path.relative(root, full).split(path.sep).join("/");
}

// `git ls-tree -r` lines: "<mode> <type> <blob>\t<path>"
// `git ls-files -s` lines: "<mode> <blob> <stage>\t<path>"
function parseTree(text, problems) {
  const out = {};
  String(text || "").split("\n").forEach(function (line) {
    if (!line) return;
    const tab = line.indexOf("\t");
    if (tab < 0) { problems.push("could not read api base tree"); return; }
    const meta = line.slice(0, tab).split(" ");
    const file = line.slice(tab + 1);
    if (meta.length < 3 || !/^[0-9]+$/.test(meta[0]) || !/^[0-9a-f]{40}$/.test(meta[2]) || !file) {
      problems.push("could not read api base tree");
      return;
    }
    out[file] = { mode: meta[0], blob: meta[2] };
  });
  return out;
}

function parseIndex(text, problems) {
  const out = {};
  String(text || "").split("\n").forEach(function (line) {
    if (!line) return;
    const tab = line.indexOf("\t");
    if (tab < 0) { problems.push("could not read api index"); return; }
    const meta = line.slice(0, tab).split(" ");
    const file = line.slice(tab + 1);
    if (meta.length < 3 || !/^[0-9]+$/.test(meta[0]) || !/^[0-9a-f]{40}$/.test(meta[1]) || !file) {
      problems.push("could not read api index");
      return;
    }
    if (meta[2] !== "0") { problems.push(file + " is not a clean index entry"); return; }
    out[file] = { mode: meta[0], blob: meta[1] };
  });
  return out;
}

function rejectOddFiles(root, problems) {
  const apiRoot = path.join(root, "api");
  let apiSt;
  try { apiSt = fs.lstatSync(apiRoot); }
  catch (e) { problems.push("could not read api"); return; }
  if (apiSt.isSymbolicLink()) { problems.push("api symlink api"); return; }
  if (!apiSt.isDirectory()) { problems.push("api non-regular file api"); return; }
  function walk(dir) {
    let names;
    try { names = fs.readdirSync(dir); }
    catch (e) { problems.push("could not read " + relOf(root, dir)); return; }
    names.forEach(function (name) {
      const full = path.join(dir, name);
      let st;
      try { st = fs.lstatSync(full); }
      catch (e) { problems.push("could not read " + relOf(root, full)); return; }
      const rel = relOf(root, full);
      if (st.isSymbolicLink()) { problems.push("api symlink " + rel); return; }
      if (st.isDirectory()) { walk(full); return; }
      if (!st.isFile()) { problems.push("api non-regular file " + rel); return; }
      if ((st.mode & 0o111) !== 0) problems.push(rel + " is executable");
      if (st.nlink > 1) problems.push(rel + " has extra links");
    });
  }
  walk(apiRoot);
}

function check(root) {
  const git = function (args) {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  };
  const problems = [];
  try { git(["cat-file", "-e", BASE + "^{commit}"]); }
  catch (e) { return { ok: false, problems: ["API freeze base " + BASE.slice(0, 8) + " is not in this clone"], base: BASE }; }
  let baseTree, index, tracked, untracked;
  try {
    baseTree = parseTree(git(["ls-tree", "-r", BASE, "--", "api"]), problems);
    index = parseIndex(git(["ls-files", "-s", "--full-name", "--", "api"]), problems);
    // -c is the tracked index. Gitignore, info/exclude, and assume-unchanged
    // do not drop a tracked path from this list.
    tracked = lines(git(["ls-files", "-c", "--full-name", "--", "api"]));
    // Ignored files count too. --exclude-standard would hide an untracked
    // api/ file matched by api/.gitignore, a root .gitignore, or info/exclude.
    untracked = lines(git(["ls-files", "--others", "--", "api"]));
  } catch (e) { return { ok: false, problems: ["could not diff api/ vs " + BASE.slice(0, 8)], base: BASE }; }
  const baseFiles = Object.keys(baseTree);
  const baseSet = {};
  baseFiles.forEach(function (f) { baseSet[f] = true; });
  const trackedSet = {};
  tracked.forEach(function (f) { trackedSet[f] = true; });
  untracked.forEach(function (f) { problems.push("new untracked api file " + f); });
  baseFiles.forEach(function (f) {
    if (!trackedSet[f]) problems.push(f + " was deleted");
  });
  try { rejectOddFiles(root, problems); }
  catch (e) { problems.push("could not read api"); }
  const seen = {};
  baseFiles.concat(tracked).forEach(function (f) {
    if (seen[f]) return;
    seen[f] = true;
    if (!trackedSet[f]) return;
    const pinned = Object.prototype.hasOwnProperty.call(PIN, f);
    const idx = index[f];
    const baseInfo = baseTree[f];
    if (!idx) problems.push("could not read " + f + " index");
    else {
      const wantMode = baseInfo ? baseInfo.mode : "100644";
      if (idx.mode !== "100644" || idx.mode !== wantMode) {
        problems.push(f + " mode " + idx.mode + " is not " + (idx.mode !== "100644" ? "100644" : wantMode));
      }
      // Index blob vs the base tree. Pinned files are allowed to differ from
      // BASE and must match PIN instead. An unstaged edit keeps the old index
      // blob; the worktree hash below still rejects it.
      if (baseInfo && !pinned && idx.blob !== baseInfo.blob) {
        problems.push("api file changed outside the pin: " + f);
      }
      if (pinned && idx.blob !== PIN[f]) problems.push(f + " does not match its pinned blob");
    }
    if (!pinned && !baseSet[f]) { problems.push("api file changed outside the pin: " + f); return; }
    const filePath = path.join(root, f);
    let lst;
    try { lst = fs.lstatSync(filePath); }
    catch (e) { problems.push(f + " was deleted"); return; }
    if (lst.isSymbolicLink()) {
      problems.push("api symlink " + f);
      return;
    }
    if (!lst.isFile()) {
      problems.push(f + " is not a regular file");
      return;
    }
    if ((lst.mode & 0o111) !== 0) problems.push(f + " is executable");
    if (lst.nlink > 1) problems.push(f + " has extra links");
    let expected;
    try { expected = pinned ? PIN[f] : git(["rev-parse", BASE + ":" + f]).trim(); }
    catch (e) { problems.push("could not read " + f + " at base"); return; }
    let actual;
    // Worktree bytes, not the index blob. A tracked file edited but not
    // committed fails closed, including when the index bit is assume-unchanged.
    // hash-object follows symlinks; those are already rejected above.
    try { actual = git(["hash-object", "--", f]).trim(); }
    catch (e) { problems.push("could not read " + f); return; }
    if (actual !== expected) {
      problems.push(pinned ? (f + " does not match its pinned blob") : ("api file changed outside the pin: " + f));
    }
  });
  Object.keys(PIN).forEach(function (f) {
    if (!trackedSet[f] && !baseSet[f]) problems.push(f + " was deleted");
  });
  return { ok: problems.length === 0, problems: problems, base: BASE };
}

module.exports = { BASE, PIN, check };
