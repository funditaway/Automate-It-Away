#!/usr/bin/env node
// Break-it-on-purpose for scripts/check-invite-link-line.js: copy the tree, break ONE thing, demand red.
// Usage: node scripts/mutate-invite-link-line.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const rep = (a, b) => (s) => { if (s.indexOf(a) < 0) throw new Error("mutant anchor missing: " + a); return s.split(a).join(b); };
const LINE = "They'll link their own account when they sign in.";
const TAG = '      <p class="meta" id="add-link-line">' + LINE + "</p>\n";
const H = "people.html", J = "people.js";
const MUTANTS = [
  ["line removed", H, rep(TAG, "")],
  ["wrong text", H, rep(LINE, "They link their account when they sign in.")],
  ["curly apostrophe", H, rep(LINE, LINE.replace("'", "\u2019"))],
  ["promise kept: typing links", H, rep(LINE, "Type their account and it links.")],
  ["line hidden", H, rep('id="add-link-line">', 'id="add-link-line" hidden>')],
  ["line moved to world invite", H, (s) => rep('<p class="meta" id="world-note">', TAG.trim() + '\n      <p class="meta" id="world-note">')(rep(TAG, "")(s))],
  ["line moved above the fields", H, (s) => rep('      <div class="grid">\n        <input id="n"', TAG + '      <div class="grid">\n        <input id="n"')(rep(TAG, "")(s))],
  ["line twice", H, rep(TAG, TAG + TAG)],
  ["added through innerHTML", J, rep('document.getElementById("add-btn").addEventListener("click", invite);', 'document.getElementById("add-btn").addEventListener("click", invite);\ndocument.getElementById("inv").innerHTML = "<p>They\'ll link their own account when they sign in.</p>";')],
  ["JS rewrites the line", J, rep('document.getElementById("add-btn").addEventListener("click", invite);', 'document.getElementById("add-btn").addEventListener("click", invite);\ndocument.getElementById("add-link-line").textContent = "";')],
  ["account field put back", H, rep('        <input id="p" placeholder', '        <input id="acct" placeholder="Their AIA account, if they have one">\n        <input id="p" placeholder')],
  ["account field under a new id", H, rep('        <input id="p" placeholder', '        <input id="who-acct" placeholder="Their AIA account name">\n        <input id="p" placeholder')],
  ["account param sent again", J, rep("pin: pin, kind: kind,", 'pin: pin, account: document.getElementById("acct").value, kind: kind,')],
  ["accountId param sent", J, rep("pin: pin, kind: kind,", 'pin: pin, accountId: document.getElementById("accountId").value, kind: kind,')],
  ["promise wording back", H, rep("<p>Name them. Pick a seat. Give them a desk code.</p>", "<p>One AIA account. Name them. Pick a seat. Give a code if they do not have an account yet.</p>")],
  ["code placeholder promises", H, rep('placeholder="Desk code, 4+ digits"', 'placeholder="New desk code if no account yet"')],
  ["desk code dropped from the body", J, rep("pin: pin, kind: kind,", "kind: kind,")],
  ["desk.html touched", "desk.html", rep("</body>", "<p>They'll link their own account when they sign in.</p></body>")],
  ["added to npm test early", "package.json", rep('"test": "node scripts/check-icons.js', '"test": "node scripts/check-invite-link-line.js && node scripts/check-icons.js')]
];

function copy(dir) { fs.cpSync(root, dir, { recursive: true, filter: (p) => !/(^|\/)(\.git|node_modules)(\/|$)/.test(p) }); }
function run(dir) { return spawnSync("node", [path.join(dir, "scripts", "check-invite-link-line.js"), dir], { cwd: dir, encoding: "utf8", timeout: 60000 }); }
let bad = 0, red = 0;
const clean = fs.mkdtempSync(path.join(os.tmpdir(), "ill-clean-"));
copy(clean);
const base = run(clean);
console.log("mutate-invite-link-line: unmodified copy " + (base.status === 0 ? "passes (good)" : "FAILS (bad)"));
if (base.status !== 0) { console.log((base.stdout + base.stderr).slice(0, 800)); bad++; }
MUTANTS.forEach(([name, file, fn]) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ill-mut-"));
  copy(dir);
  const p = path.join(dir, file);
  try { fs.writeFileSync(p, fn(fs.readFileSync(p, "utf8"))); } catch (e) { console.log("  ANCHOR MISSING " + name + ": " + e.message); bad++; fs.rmSync(dir, { recursive: true, force: true }); return; }
  const r = run(dir);
  if (r.status === 0) { console.log("  SURVIVED " + name); bad++; } else { console.log("  red     " + name); red++; }
  fs.rmSync(dir, { recursive: true, force: true });
});
fs.rmSync(clean, { recursive: true, force: true });
console.log("mutate-invite-link-line: " + MUTANTS.length + " mutants, " + red + " caught, " + bad + " problems");
process.exit(bad ? 1 : 0);
