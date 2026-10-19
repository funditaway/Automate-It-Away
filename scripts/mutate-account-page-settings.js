#!/usr/bin/env node
// Break-it-on-purpose for scripts/check-account-page-settings.js: copy the tree, break ONE thing, demand red.
// Usage: node scripts/mutate-account-page-settings.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const rep = (a, b) => (s) => { if (s.indexOf(a) < 0) throw new Error("mutant anchor missing: " + a); return s.split(a).join(b); };
const F = "account-settings.js";
const MUTANTS = [
  ["text goes through innerHTML", F, rep("if (text != null) n.textContent = String(text);", "if (text != null) n.innerHTML = String(text);")],
  ["loads while signed out", F, rep("if (!signedIn()) { root.hidden = true; return; }", "")],
  ["drops own-seat session header", F, rep('if (tok) h["X-Session"] = tok;', "")],
  ["reads the wrong endpoint", F, rep('"/api/account?settings=1"', '"/api/account"')],
  ["Stop and Kill line dropped", F, rep('c.appendChild(el("p", "acct-always", "Stop and Kill always work. They cannot be switched off."));', "")],
  ["Stop and Kill get a switch", F, rep('var STOPS = [["money"', 'var STOPS = [["stopAndKill", "Stop and Kill"], ["money"')],
  ["secrets get a field", F, rep("soon(c, SOON.secrets);", 'soon(c, SOON.secrets); var i = document.createElement("input"); i.type = "password"; c.appendChild(i);')],
  ["secret names listed", F, (src) => rep("    paintSecrets();", "    paintSecrets(st.secrets);")(rep("function paintSecrets() {", "function paintSecrets(s) { var c0 = card(\"acct-secret-list\", \"Saved\"); ((s && s.items) || []).forEach(function (x) { c0.appendChild(el(\"p\", null, x.name)); });")(src))],
  ["notify gets coming soon removed", F, rep("if (!on(s.notify)) soon(c, SOON.notify);", "")],
  ["unbacked profile shows fields", F, rep("if (!on(s)) return soon(c, SOON.profile);", "s = s || {};")],
  ["unbacked look shows a picker", F, rep("if (!on(s)) return soon(c, SOON.look);", "s = s || {};")],
  ["allow list coming soon dropped", F, rep("if (!anyAllow) soon(c, SOON.allow);", "")],
  ["refused change not reverted", F, rep(".then(function (d) { if (!d) x.checked = !x.checked; });", ";")],
  ["sends every stop choice at once", F, rep("set[st[0]] = x.checked;", "STOPS.forEach(function (o) { set[o[0]] = x.checked; });")],
  ["look applied even when refused", F, rep("        if (!d) return;\n        try { localStorage.setItem", "        try { localStorage.setItem")],
  ["history not refreshed from reply", F, rep("if (x.d.settings) paintHistory(x.d.settings.history);", "")],
  ["profile sends an extra field", F, rep("Object.keys(f).forEach(function (k) { set[k] = f[k].value; });", "Object.keys(f).forEach(function (k) { set[k] = f[k].value; }); set.role = \"owner\";")],
  ["footer link dropped", "theme.js", rep('    { href: "/account", label: "My account" },\n', "")],
  ["mount removed from account.html", "account.html", rep('<section id="acct-settings" aria-label="My account settings" hidden></section>', "")],
  ["script tag removed from account.html", "account.html", rep('  <script src="account-settings.js"></script>\n', "")],
  ["desk.html touched", "desk.html", rep("</body>", "<script src=\"account-settings.js\"></script></body>")]
];

function copy(dir) { fs.cpSync(root, dir, { recursive: true, filter: (p) => !/(^|\/)(\.git|node_modules)(\/|$)/.test(p) }); }
function run(dir) { return spawnSync("node", [path.join(dir, "scripts", "check-account-page-settings.js"), dir], { cwd: dir, encoding: "utf8", timeout: 60000 }); }
let bad = 0;
const clean = fs.mkdtempSync(path.join(os.tmpdir(), "aps-clean-"));
copy(clean);
const base = run(clean);
console.log("mutate-account-page-settings: unmodified copy " + (base.status === 0 ? "passes (good)" : "FAILS (bad)"));
if (base.status !== 0) { console.log((base.stdout + base.stderr).slice(0, 800)); bad++; }
MUTANTS.forEach(([name, file, fn]) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aps-mut-"));
  copy(dir);
  const p = path.join(dir, file);
  try { fs.writeFileSync(p, fn(fs.readFileSync(p, "utf8"))); } catch (e) { console.log("  ANCHOR MISSING " + name + ": " + e.message); bad++; return; }
  const r = run(dir);
  if (r.status === 0) { console.log("  SURVIVED " + name); bad++; } else console.log("  red     " + name);
  fs.rmSync(dir, { recursive: true, force: true });
});
fs.rmSync(clean, { recursive: true, force: true });
console.log("mutate-account-page-settings: " + (MUTANTS.length) + " mutants, " + bad + " problems");
process.exit(bad ? 1 : 0);
