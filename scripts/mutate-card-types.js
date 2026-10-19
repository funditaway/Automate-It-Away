#!/usr/bin/env node
// Break-it-on-purpose for scripts/check-card-types.js: copy the tree, break ONE thing, and demand the check goes red.
// Usage: node scripts/mutate-card-types.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const rep = (a, b) => (s) => s.split(a).join(b);
const MUTANTS = [
  ["detector: lead checked before file", "card-type.js", rep('if (isFile(j)) return "file";\n      if (isLead(j)) return "lead";', 'if (isLead(j)) return "lead";\n      if (isFile(j)) return "file";')],
  ["detector: automation checked last", "card-type.js", rep('if (isAutomation(j)) return "automation";\n      if (isFile(j)) return "file";\n      if (isLead(j)) return "lead";\n      if (isApproval(j)) return "approval";', 'if (isFile(j)) return "file";\n      if (isLead(j)) return "lead";\n      if (isApproval(j)) return "approval";\n      if (isAutomation(j)) return "automation";')],
  ["detector: photoUrl no longer makes a file card", "card-type.js", rep("|| has(j.photoUrl)", "")],
  ["detector: files not checked for being an array", "card-type.js", rep("Array.isArray(j.files) && j.files.length > 0", "j.files && j.files.length > 0")],
  ["detector: approval without decide/status gate", "card-type.js", rep("if (!(j.decide === true || waiting)) return false;", "")],
  ["detector: no try/catch", "card-type.js", rep("} catch (e) {}\n    return \"unknown\";", "} finally {}\n    return \"unknown\";")],
  ["middle: stored text goes through innerHTML", "card-middle.js", rep("el.textContent = text;", "el.innerHTML = text;")],
  ["middle: file link uses the raw url", "card-middle.js", rep('var href = f.url ? urlOf(opts, f.url) : "";', 'var href = f.url || "";')],
  ["middle: any image/* type gets a thumbnail", "card-middle.js", rep("var IMAGE = /^image\\/(png|jpeg|gif|webp)$/i;", "var IMAGE = /^image\\//i;")],
  ["middle: tel: link without checking the number", "card-middle.js", rep('if (/^\\+?[0-9]{3,20}$/.test(compact)) {', "if (true) {")],
  ["middle: unsure sentence dropped", "card-middle.js", rep('if (o.result === "unsure") li.appendChild(make(doc, "p", "card-unsure", UNSURE));', "")],
  ["middle: size units wrong", "card-middle.js", rep("n /= 1024;", "n /= 1000;")],
  ["middle: unknown card gets a frame", "card-middle.js", rep("if (!label) return null;", "label = label || 'Card';")],
  ["middle: 'Nothing happens until you say Yes.' dropped", "card-middle.js", rep('box.appendChild(make(doc, "p", "card-hold", "Nothing happens until you say Yes."));', "")],
  ["middle: adds a Collect HOLD claim", "card-middle.js", rep('"Nothing happens until you say Yes."', '"Nothing happens until you say Yes. Collect stays on HOLD."')],
  ["desk-card.js: no try/catch around the typed card", "desk-card.js", rep("try { typed = openTypedCard(j, sheetCard, sheetBody, sheetDecide); } catch (e) { typed = false; }", "typed = openTypedCard(j, sheetCard, sheetBody, sheetDecide);")],
  ["desk-card.js: typed card drops the decide row", "desk-card.js", rep('+ "</details>" + decide);', '+ "</details>");')],
  ["desk-card.js: decide row markup changed", "desk-card.js", rep('class=\\"go q-yes\\"', 'class=\\"go q-yes2\\"')],
  ["desk-card.js: old card body dropped from typed card", "desk-card.js", rep('</summary>" + body + "</details>"', '</summary></details>"')]
].map((m) => m);

function copy(dir) { fs.cpSync(root, dir, { recursive: true, filter: (p) => !/(^|\/)(\.git|node_modules)(\/|$)/.test(p) }); }
function run(dir) { return spawnSync("node", [path.join(dir, "scripts", "check-card-types.js")], { cwd: dir, encoding: "utf8", timeout: 120000 }); }
let bad = 0;
const clean = fs.mkdtempSync(path.join(os.tmpdir(), "ct-clean-"));
copy(clean);
const base = run(clean);
console.log("mutate-card-types: unmodified copy " + (base.status === 0 ? "passes (good)" : "FAILS (bad)"));
if (base.status !== 0) { console.log((base.stdout + base.stderr).slice(0, 800)); bad++; }
fs.rmSync(clean, { recursive: true, force: true });
MUTANTS.forEach(function (m) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ct-mut-"));
  copy(dir);
  const file = path.join(dir, m[1]);
  const before = fs.readFileSync(file, "utf8");
  const after = m[2](before);
  if (after === before) { console.log("mutate-card-types: NOT APPLIED  " + m[0]); bad++; fs.rmSync(dir, { recursive: true, force: true }); return; }
  fs.writeFileSync(file, after);
  const r = run(dir);
  const n = ((r.stdout + r.stderr).match(/FAIL/g) || []).length;
  if (r.status === 0) { console.log("mutate-card-types: SURVIVED     " + m[0] + "  (check stayed green)"); bad++; }
  else console.log("mutate-card-types: caught       " + m[0] + "  (" + (n || "crash") + " red)");
  fs.rmSync(dir, { recursive: true, force: true });
});
if (bad) { console.error("mutate-card-types: " + bad + " problem(s)"); process.exit(1); }
console.log("mutate-card-types: every break is caught by the check");
