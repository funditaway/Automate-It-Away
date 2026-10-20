#!/usr/bin/env node
// Break-it-on-purpose for scripts/check-file-cards.js: copy the tree, undo ONE fix at a time, and demand the check goes red.
// Needs an older api/upload.js (one that returns photoUrl for every file): MUTATE_OLD_HANDLER_ROOT=/path/to/older/checkout
// (e.g. a checkout of e5e748a). Usage: node scripts/mutate-file-cards.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const oldRoot = process.env.MUTATE_OLD_HANDLER_ROOT;
if (!oldRoot || !fs.existsSync(path.join(oldRoot, "api", "upload.js"))) {
  console.error("mutate-file-cards: set MUTATE_OLD_HANDLER_ROOT to a checkout whose api/upload.js returns photoUrl for every file");
  process.exit(2);
}

const MUTANTS = [
  ["drop-app.js: photoUrl for every upload", "drop-app.js", (s) => s.replace("if (data.photoUrl && isPictureFile(data.file)) item.photoUrl", "if (data.photoUrl) item.photoUrl")],
  ["desk.html: photoUrl for every upload", "desk.html", (s) => s.replace(/if \(up\.data && up\.data\.photoUrl && \(saved\.type[^\n]*\) item\.photoUrl = up\.data\.photoUrl;/, "if (up.data && up.data.photoUrl) item.photoUrl = up.data.photoUrl;")],
  ["desk.html: files[] not kept", "desk.html", (s) => s.replace("item.files = up.data.files;", "")],
  ["desk-html-view.js: image decided by kind/extension, not stored type", "desk-html-view.js", (s) => s.replace("if (f.type) return /^image\\/(png|jpeg|gif|webp)$/i.test(f.type);", "if (f.type) return /^image\\//i.test(f.type);")],
  ["desk-html-view.js: bare photoUrl placed before files[]", "desk-html-view.js", (s) => {
    const a = "(j && Array.isArray(j.files) ? j.files : []).forEach(function (f) { add(f); });";
    const i = s.indexOf(a); const k = s.indexOf("return out;", i);
    const block = s.slice(i + a.length, k);
    return s.slice(0, i) + block + "\n    " + a + "\n    " + s.slice(k);
  }],
  ["desk-html-view.js: legacy non-image extensions ignored", "desk-html-view.js", (s) => s.replace(/var NOT_IMAGE = [^\n]*;/, "var NOT_IMAGE = /(?!)/;")],
  ["desk-needs.js: image decided by prefix, not png/jpeg/gif/webp", "desk-needs.js", (s) => s.replace("/^image\\/(png|jpeg|gif|webp)$/i.test(t.type)", "/^image\\//i.test(t.type)")],
  ["desk-needs.js: legacy non-image extensions ignored", "desk-needs.js", (s) => s.replace(/r=\/\\\.\(pdf\|heic[^\n]*?\)\(\\\?\|#\|\$\)\/i/, "r=/(?!)/")],
  ["desk-needs.js: bare photoUrl placed before files[]", "desk-needs.js", (s) => s.replace(/if\(\(e&&Array\.isArray\(e\.files\)\?e\.files:\[\]\)\.forEach\(\(function\(e\)\{i\(e\)\}\)\),e&&e\.photoUrl\)(\{const t=r\.test[^\n]*?\},!0\)\})/, "if(e&&e.photoUrl)$1(e&&Array.isArray(e.files)?e.files:[]).forEach((function(e){i(e)}));")]
];

let bad = 0;
function run(dir) {
  return spawnSync("node", [path.join(dir, "scripts", "check-file-cards.js")], { cwd: dir, env: Object.assign({}, process.env, { UPLOAD_HANDLER_ROOTS: oldRoot }), encoding: "utf8" });
}
function copy(dir) {
  fs.cpSync(root, dir, { recursive: true, filter: (p) => !/(^|\/)(\.git|node_modules)(\/|$)/.test(p) });
}
const clean = fs.mkdtempSync(path.join(os.tmpdir(), "fc-clean-"));
copy(clean);
const base = run(clean);
console.log("mutate-file-cards: unmodified copy " + (base.status === 0 ? "passes (good)" : "FAILS (bad)"));
if (base.status !== 0) { console.log((base.stdout + base.stderr).slice(0, 800)); bad++; }
fs.rmSync(clean, { recursive: true, force: true });
MUTANTS.forEach(function (m) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-mut-"));
  copy(dir);
  const file = path.join(dir, m[1]);
  const before = fs.readFileSync(file, "utf8");
  const after = m[2](before);
  if (after === before) { console.log("mutate-file-cards: NOT APPLIED  " + m[0]); bad++; fs.rmSync(dir, { recursive: true, force: true }); return; }
  fs.writeFileSync(file, after);
  const r = run(dir);
  const n = ((r.stdout + r.stderr).match(/FAIL/g) || []).length;
  if (r.status === 0) { console.log("mutate-file-cards: SURVIVED     " + m[0] + "  (check stayed green)"); bad++; }
  else console.log("mutate-file-cards: caught       " + m[0] + "  (" + n + " red line" + (n === 1 ? "" : "s") + ")");
  fs.rmSync(dir, { recursive: true, force: true });
});
if (bad) { console.error("mutate-file-cards: " + bad + " problem(s)"); process.exit(1); }
console.log("mutate-file-cards: every fix is held by the check");
