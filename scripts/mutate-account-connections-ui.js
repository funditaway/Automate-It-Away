#!/usr/bin/env node
// Break-it-on-purpose for scripts/check-account-connections-ui.js: copy the tree, break ONE thing, demand red.
// Usage: node scripts/mutate-account-connections-ui.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const rep = (a, b) => (s) => { if (s.indexOf(a) < 0) throw new Error("mutant anchor missing: " + a); return s.split(a).join(b); };
const F = "account-connections.js";
const MUTANTS = [
  ["text goes through innerHTML", F, rep("if (text != null) n.textContent = String(text);", "if (text != null) n.innerHTML = String(text);")],
  ["page writes its own connected status", F, rep('row.appendChild(el("p", "acct-conn-status", c.statusText || ""));', 'row.appendChild(el("p", "acct-conn-status", "Connected"));')],
  ["statusText reworded", F, rep('row.appendChild(el("p", "acct-conn-status", c.statusText || ""));', 'row.appendChild(el("p", "acct-conn-status", c.status === "saved" ? "Saved" : c.statusText));')],
  ["secret put back after a refusal", F, rep("    var p = post(body, hint, btn);\n    input.value = \"\";\n    return p.then(function (x) { input.value = \"\"; return x; });", "    var keep = input.value;\n    var p = post(body, hint, btn);\n    input.value = \"\";\n    return p.then(function (x) { input.value = x.ok ? \"\" : keep; return x; });")],
  ["secret not cleared on send", F, rep("    var p = post(body, hint, btn);\n    input.value = \"\";\n", "    var p = post(body, hint, btn);\n")],
  ["secret not cleared at all", F, (s) => rep("    input.value = \"\";\n    return p.then(function (x) { input.value = \"\"; return x; });", "    return p;")(s)],
  ["secret kept in sessionStorage", F, rep("    var p = post(body, hint, btn);\n", "    try { sessionStorage.setItem(\"aia_last\", JSON.stringify(body)); } catch (e) {}\n    var p = post(body, hint, btn);\n")],
  ["secret logged", F, rep("    var p = post(body, hint, btn);\n", "    console.log(\"sending\", JSON.stringify(body));\n    var p = post(body, hint, btn);\n")],
  ["secret echoed on the page", F, rep('connHint.textContent = x.d.name + ": set";', 'connHint.textContent = x.d.name + ": set" + (x.d.value ? " (" + x.d.value + ")" : "");')],
  ["shows more than name plus set", F, rep('connHint.textContent = x.d.name + ": set";', 'connHint.textContent = "Saved " + x.d.name + " for " + (c.service || "") + ".";')],
  ["secret field not masked", F, rep('var i = field(box, label, 0, "password");', 'var i = field(box, label, 0, "text");')],
  ["autocomplete left on", F, rep('    i.setAttribute("autocomplete", "off");\n    return i;', "    return i;")],
  ["server error replaced by a code", F, rep('if (!x.ok && hint) hint(errText(x.d));', 'if (!x.ok && hint) hint("Error " + (x.d.code || "409"));')],
  ["error left blank", F, rep('return d && typeof d.error === "string" && d.error.trim() ? d.error : OOPS;', 'return d && typeof d.error === "string" ? d.error : "";')],
  ["false done on refusal", F, rep("      return p.then(function (x) {\n        if (!x.ok) return;\n        say(x.d.entry", "      return p.then(function (x) {\n        say(x.d.entry")],
  ["Stop hidden on killed cards", F, rep("    always.appendChild(stopB);", '    if (card.status !== "killed") always.appendChild(stopB);')],
  ["Kill hidden mid-setup", F, rep("    always.appendChild(killB);", '    if (card.status !== "open") always.appendChild(killB);')],
  ["Stop greyed out on stopped cards", F, rep('    stopB.type = "button";', '    stopB.type = "button";\n    stopB.disabled = card.status === "stopped";')],
  ["Kill greyed while it sends", F, rep('post({ action: "setup-step", cardId: card.id, do: verb }, say, null)', 'post({ action: "setup-step", cardId: card.id, do: verb }, say, verb === "kill" ? killB : stopB)')],
  ["503 Stop marks the card stopped", F, rep("        if (!x.ok || x.d.saved === false) { say(", "        if (!x.ok && verb === \"stop\") { var c2 = JSON.parse(JSON.stringify(card)); c2.status = \"stopped\"; c2.statusText = \"Stopped.\"; upsertCard(c2); }\n        if (!x.ok || x.d.saved === false) { say(")],
  ["503 Kill marks the card killed", F, rep("        if (!x.ok || x.d.saved === false) { say(", "        if (!x.ok && verb === \"kill\") { var c3 = JSON.parse(JSON.stringify(card)); c3.status = \"killed\"; c3.statusText = \"Killed.\"; upsertCard(c3); }\n        if (!x.ok || x.d.saved === false) { say(")],
  ["Stop failure shows the server text", F, rep('say(verb === "stop" ? "Stop didn\'t save. Try again in a moment." : "Kill didn\'t save. Try again in a moment."); return;', "say(errText(x.d)); return;")],
  ["saved:false painted as stopped", F, rep("if (!x.ok || x.d.saved === false) {", "if (!x.ok) {")],
  ["Stop and Kill greyed after a failed save", F, rep("        if (!x.ok || x.d.saved === false) { say(", "        if (!x.ok) { stopB.disabled = true; killB.disabled = true; }\n        if (!x.ok || x.d.saved === false) { say(")],
  ["Kill failure says Stop", F, rep(': "Kill didn\'t save. Try again in a moment."', ': "Stop didn\'t save. Try again in a moment."')],
  ["sends a price field", F, rep("send({ allow: { money: false,", "send({ price: 0, allow: { money: false,")],
  ["buy on the card", F, rep('if (src.preview === true || card.bought === false || card.charged === false) box.appendChild(el("p", "acct-preview", PREVIEW));', 'box.appendChild(button("Buy", "go", function () { post({ action: "setup-card", from: { type: src.type, id: src.id, buy: true } }, say, null); }));')],
  ["preview line dropped", F, rep('if (src.preview === true || card.bought === false || card.charged === false) box.appendChild(el("p", "acct-preview", PREVIEW));', "")],
  ["history kind dropped", F, rep('(KINDS[h.whoKind] ? " (" + KINDS[h.whoKind] + ")" : "")', '""')],
  ["raw kind shown in history", F, rep('(KINDS[h.whoKind] ? " (" + KINDS[h.whoKind] + ")" : "")', '(h.whoKind ? " (" + h.whoKind + ")" : "")')],
  ["desk events lose who did it", F, rep('var who = h.who || h.by || "";', 'var who = h.who || "";')],
  ["bundle flattened, no group checklist", F, rep('var gb = el("div", "acct-group");', 'var gb = el("div", "acct-flat");')],
  ["wrong action name for the secret", F, rep('action: "connection-secret"', 'action: "secret-set"')],
  ["secret sent under the wrong field", F, rep("name: name, value: val.value }", "name: name, secret: val.value }")],
  ["connect sends one secret field", F, rep("        body.secrets = {};\n        body.secrets[sname.value.trim()] = sval.value;", "        body.secretName = sname.value.trim(); body.secret = sval.value;")],
  ["desk picked by name", F, rep("send({ deskId: dsel.value }, db);", "send({ desk: dsel.value }, db);")],
  ["test runs live", F, rep('var tb = button("Run the dry run", "go", function () { send({}, tb); });', 'var tb = button("Run the dry run", "go", function () { send({ live: true }, tb); });')],
  ["approve turns pauses off by default", F, rep("x.type = \"checkbox\"; x.checked = false;", "x.type = \"checkbox\"; x.checked = true;")],
  ["disconnect without asking", F, rep('if (typeof window.confirm === "function" && !window.confirm(ask)) return;', "")],
  ["skip sends no reason", F, rep('do: "skip", reason: why.value.trim() };', 'do: "skip" };')],
  ["skip offered on approve", F, rep("var SKIPS = { connect: 1, secret: 1 };", "var SKIPS = { connect: 1, secret: 1, approve: 1, test: 1 };")],
  ["loads while signed out", F, rep("if (!signedIn()) { root.hidden = true; return Promise.resolve(); }", "")],
  ["blocked reason dropped", F, rep('if (word) li.appendChild(el("span", "meta", " · " + word + (st.reason ? ": " + st.reason : "")));', 'if (word) li.appendChild(el("span", "meta", " · " + word));')],
  ["desk list includes desks you only help on", F, rep('return k && k.slug && k.yours === "own";', "return k && k.slug;")],
  ["mount removed from account.html", "account.html", rep('<section id="acct-connections" aria-label="Connections and setup cards" hidden></section>', "")],
  ["script tag removed from account.html", "account.html", rep('  <script src="account-connections.js"></script>\n', "")],
  ["desk.html touched", "desk.html", rep("</body>", "<script src=\"account-connections.js\"></script></body>")],
  ["added to npm test early", "package.json", rep('"test": "node scripts/check-icons.js', '"test": "node scripts/check-account-connections-ui.js && node scripts/check-icons.js')]
];

function copy(dir) { fs.cpSync(root, dir, { recursive: true, filter: (p) => !/(^|\/)(\.git|node_modules)(\/|$)/.test(p) }); }
function run(dir) { return spawnSync("node", [path.join(dir, "scripts", "check-account-connections-ui.js"), dir], { cwd: dir, encoding: "utf8", timeout: 60000 }); }
let bad = 0, red = 0;
const clean = fs.mkdtempSync(path.join(os.tmpdir(), "acu-clean-"));
copy(clean);
const base = run(clean);
console.log("mutate-account-connections-ui: unmodified copy " + (base.status === 0 ? "passes (good)" : "FAILS (bad)"));
if (base.status !== 0) { console.log((base.stdout + base.stderr).slice(0, 800)); bad++; }
MUTANTS.forEach(([name, file, fn]) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acu-mut-"));
  copy(dir);
  const p = path.join(dir, file);
  try { fs.writeFileSync(p, fn(fs.readFileSync(p, "utf8"))); } catch (e) { console.log("  ANCHOR MISSING " + name + ": " + e.message); bad++; fs.rmSync(dir, { recursive: true, force: true }); return; }
  const r = run(dir);
  if (r.status === 0) { console.log("  SURVIVED " + name); bad++; } else { console.log("  red     " + name); red++; }
  fs.rmSync(dir, { recursive: true, force: true });
});
fs.rmSync(clean, { recursive: true, force: true });
console.log("mutate-account-connections-ui: " + MUTANTS.length + " mutants, " + red + " caught, " + bad + " problems");
process.exit(bad ? 1 : 0);
