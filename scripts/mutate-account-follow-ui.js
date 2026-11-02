#!/usr/bin/env node
require("./_env-guard");
// Break-it-on-purpose for scripts/check-account-follow-ui.js: copy the tree, break ONE thing, demand red.
// Usage: node scripts/mutate-account-follow-ui.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const rep = (a, b) => (s) => { if (s.indexOf(a) < 0) throw new Error("mutant anchor missing: " + a.slice(0, 80)); return s.split(a).join(b); };
const F = "account-follow.js";
const MUTANTS = [
  ["text goes through innerHTML", F, rep("if (text != null) n.textContent = String(text);", "if (text != null) n.innerHTML = String(text);")],
  ["loads while signed out", F, rep("  function load() {\n    if (!signedIn()) { root.hidden = true; return; }\n", "  function load() {\n")],
  ["drops the session header", F, rep('    if (tok) h["X-Session"] = tok;\n', "")],
  ["pause read uses the settings flag", F, rep('read({ pause: "1" }),', 'read({ settings: "1" }),')],
  ["pause read asks for two things", F, rep('read({ pause: "1" }),', 'read({ pause: "1", can: "1" }),')],
  ["pause sends the wrong action", F, rep('var ACT_PAUSE = "pause";', 'var ACT_PAUSE = "settings";')],
  ["unpause sends pause", F, rep('var ACT_UNPAUSE = "unpause";', 'var ACT_UNPAUSE = "pause";')],
  ["what this can do is a write", F, rep('        readItem(query, "can:" + q.desk + ":" + q.kind + ":" + q.id, b);', '        write({ action: "can-do", desk: q.desk, kind: q.kind, id: q.id }, b);')],
  ["activity invents a row", F, rep("    if (!list.length) return;", '    if (!list.length) list = [{ what: "ran on its own", who: "invented" }];')],
  ["Collect sentence stays on the page", F, rep("    if (!t || loud(t) || leaky(t)) return \"\";", "    if (!t || leaky(t)) return \"\";")],
  ["pause hint keeps the Collect sentence", F, rep("      if (!t || loud(t) || leaky(t)) return;", "      if (!t || leaky(t)) return;")],
  ["what this can do prints the whole object", F, rep("      paintLineList(box, d.can.lines);\n      return;", "      paintLineList(box, d.can.lines);\n      box.appendChild(el(\"p\", null, JSON.stringify(d.can)));\n      return;")],
  ["activity prints a secret field", F, rep('      var what = safeText(typeof h.what === "string" ? h.what : "");', '      var what = safeText(typeof h.what === "string" ? h.what : "") + (h.password || "");')],
  ["raw kind shown in activity", F, rep('      var kind = KINDS[h.whoKind] || "";', '      var kind = h.whoKind || "";')],
  ["undo sends a seat id", F, rep('commit({ action: "undo" }, b, "Undid it.");', 'commit({ action: "undo", forSeat: "p_x" }, b, "Undid it.");')],
  ["undo button when nothing is left", F, rep("    if (view.available === true) {", "    if (view.available === true || view.available === false) {")],
  ["a refusal is treated as saved", F, rep("      if (!x.ok) { state.flash = errText(x.d); paint(); return; }\n      state.flash = saySafe(x.d && x.d.hint) || fallback;", "      if (!x.ok) { state.flash = errText(x.d); }\n      state.flash = saySafe(x.d && x.d.hint) || fallback;")],
  ["close account signs the phone out", F, rep("      state.flash = raw && !loud(raw) && !leaky(raw) ? raw : CLOSE_COPY;\n      paint();", "      state.flash = raw && !loud(raw) && !leaky(raw) ? raw : CLOSE_COPY;\n      leavePhoneNow();\n      paint();")],
  ["close account says it was deleted", F, rep("      state.flash = raw && !loud(raw) && !leaky(raw) ? raw : CLOSE_COPY;", '      state.flash = "Account deleted";')],
  ["a secret book is saved", F, rep('if (!text || pack.format !== "aia.account.v1" || badBook(text))', 'if (!text || pack.format !== "aia.account.v1")')],
  ["the book is painted on the page", F, rep("      state.flash = saySafe(x.d.hint) || EXPORT_COPY;", "      state.flash = text;")],
  ["export uses the book's verb", F, rep('write({ action: "export-close", do: VERB_EXPORT }, btn)', 'write({ action: "export-close", do: menuOf().export.do }, btn)')],
  ["leave this phone does not sign out", F, rep("      leavePhoneNow();\n    });\n  }\n  function doCloseAccount", "      paint();\n    });\n  }\n  function doCloseAccount")],
  ["a refused leave still signs out", F, rep("      if (!x.ok || !x.d || x.d.loggedOut !== true) { state.flash = errText(x.d); paint(); return; }\n      leavePhoneNow();", "      leavePhoneNow();\n      if (!x.ok || !x.d || x.d.loggedOut !== true) { state.flash = errText(x.d); paint(); return; }")],
  ["leaving the desk signs the phone out", F, rep('        commit({ action: "export-close", do: VERB_LEAVE_DESK }, b, LEFT_COPY);', "        leavePhoneNow();\n        commit({ action: \"export-close\", do: VERB_LEAVE_DESK }, b, LEFT_COPY);")],
  ["Stop and Kill line dropped when the server is quiet", F, rep('c.appendChild(el("p", "acct-always", line || STOP));', 'c.appendChild(el("p", "acct-always", line || ""));')],
  ["Desk AI draft line dropped", F, rep('    if (it.draftOnly === true) box.appendChild(el("p", "meta", DRAFT_AI));', "")],
  ["a rule is called a Desk AI draft", F, rep('    if (it.draftOnly === true) box.appendChild(el("p", "meta", DRAFT_AI));', '    box.appendChild(el("p", "meta", DRAFT_AI));')],
  ["pause stays on an automation when the desk is paused", F, rep("    if (!deskPaused && named) {", "    if (named) {")],
  ["paused desk line dropped", F, rep('    if (deskPaused) box.appendChild(el("p", "meta", DESK_PAUSED));\n', "")],
  ["What this can do is missing", F, rep('      actions.appendChild(button("What this can do", "edit", function (b) {\n        var query = { can: "1", desk: q.desk, kind: q.kind, id: q.id };\n        readItem(query, "can:" + q.desk + ":" + q.kind + ":" + q.id, b);\n      }));\n', "")],
  ["Close the account is missing", F, rep('    c.appendChild(button("Close the account", "edit", function (b) { doCloseAccount(b); }));\n', "")],
  ["a stranger still gets actions", F, rep("  function seatOk() { return !!(state.pause && state.pause.ok && state.pause.d && state.pause.d.pause); }", "  function seatOk() { return true; }")],
  ["desk code is painted", F, rep("    root.hidden = false;\n    if (state.flash) {", '    root.hidden = false;\n    root.appendChild(el("p", null, ls("aia_pin")));\n    if (state.flash) {')],
  ["desk code goes in the address", F, rep('    return fetch("/api/account?" + parts.join("&"), { method: "GET", headers: hdr() })', '    parts.push("pin=" + encodeURIComponent(ls("aia_pin")));\n    return fetch("/api/account?" + parts.join("&"), { method: "GET", headers: hdr() })')],
  ["inline handler added", F, rep('    b.type = "button";', '    b.type = "button"; b.setAttribute("onclick", "1");')],
  ["a switch is added", F, rep('    var line = typeof p.stopAndKill === "string" ? safeText(p.stopAndKill) : "";', '    var line = typeof p.stopAndKill === "string" ? safeText(p.stopAndKill) : "";\n    var sw = document.createElement("input"); sw.type = "checkbox"; c.appendChild(sw);')],
  ["run on its own is offered", F, rep('    c.appendChild(el("p", "acct-always", line || STOP));', '    c.appendChild(el("p", "acct-always", line || STOP));\n    c.appendChild(button("Run on its own", "go", function () { write({ action: "pause", runOnItsOwn: true }, null); }));')],
  ["list style dropped", "account.html", rep("    .acct-lines{margin:6px 0;padding-left:18px}.acct-flash{font-weight:700}\n", "")],
  ["mount removed from account.html", "account.html", rep('    <section id="acct-follow" aria-label="Pause, activity, undo, and export" hidden></section>\n', "")],
  ["follow mount moved under settings", "account.html", (s) => {
    const a = '    <section id="acct-follow" aria-label="Pause, activity, undo, and export" hidden></section>\n';
    const b = '    <section id="acct-settings" aria-label="My account settings" hidden></section>\n';
    if (s.indexOf(a) < 0 || s.indexOf(b) < 0) throw new Error("mutant anchor missing: follow mount");
    return s.split(a).join("").replace(b, b + a);
  }],
  ["script tag removed from account.html", "account.html", rep('  <script src="account-follow.js"></script>\n', "")],
  ["script loads before connections", "account.html", rep('  <script src="account-connections.js"></script>\n  <script src="account-follow.js"></script>', '  <script src="account-follow.js"></script>\n  <script src="account-connections.js"></script>')],
  ["desk.html touched", "desk.html", rep("</body>", '<script src="account-follow.js"></script></body>')],
  ["added to npm test early", "package.json", rep('"test": "node scripts/check-icons.js', '"test": "node scripts/check-account-follow-ui.js && node scripts/check-icons.js')]
];

function copy(dir) { fs.cpSync(root, dir, { recursive: true, filter: (p) => !/(^|\/)(\.git|node_modules)(\/|$)/.test(p) }); }
function run(dir) { return spawnSync("node", [path.join(dir, "scripts", "check-account-follow-ui.js"), dir], { cwd: dir, encoding: "utf8", timeout: 60000 }); }
let bad = 0, red = 0;
const clean = fs.mkdtempSync(path.join(os.tmpdir(), "afu-clean-"));
copy(clean);
const base = run(clean);
console.log("mutate-account-follow-ui: unmodified copy " + (base.status === 0 ? "passes (good)" : "FAILS (bad)"));
if (base.status !== 0) { console.log((base.stdout + base.stderr).slice(0, 800)); bad++; }
MUTANTS.forEach(([name, file, fn]) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "afu-mut-"));
  copy(dir);
  const p = path.join(dir, file);
  try { fs.writeFileSync(p, fn(fs.readFileSync(p, "utf8"))); } catch (e) { console.log("  ANCHOR MISSING " + name + ": " + e.message); bad++; fs.rmSync(dir, { recursive: true, force: true }); return; }
  const r = run(dir);
  if (r.status === 0) { console.log("  SURVIVED " + name); bad++; } else { console.log("  red     " + name); red++; }
  fs.rmSync(dir, { recursive: true, force: true });
});
fs.rmSync(clean, { recursive: true, force: true });
console.log("mutate-account-follow-ui: " + MUTANTS.length + " mutants, " + red + " caught, " + bad + " problems");
process.exit(bad ? 1 : 0);
