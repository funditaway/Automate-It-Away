#!/usr/bin/env node
// Owner invite screen (people.html "Add someone"): one plain line says accounts join only by
// signing in (PR 361: a typed account name or id no longer attaches an account).
// The line is static HTML in the form, not built from typed text, not hidden, not rewritten by JS.
// The typed "their AIA account" field is gone (it attached nothing after 361), the invite request
// no longer carries an account param, and no wording promises that typing an account links it.
// usage: node scripts/check-invite-link-line.js [repoRoot]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const LINE = "They'll link their own account when they sign in.";
const TAG = '<p class="meta" id="add-link-line">' + LINE + "</p>";
let passes = 0, failures = 0;
function ok(c, m) { if (c) passes++; else { failures++; console.error("check-invite-link-line: FAIL " + m); } }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const html = read("people.html");
const js = read("people.js");
const start = html.indexOf('<div class="add" id="add-box"');
const end = html.indexOf('<div class="add" id="world-invite-box"', start);
const box = start >= 0 && end > start ? html.slice(start, end) : "";
ok(!!box, "people.html still has the owner Add someone box");
ok(box.split(TAG).length === 2, "the Add someone box has the line once, word for word, as plain static text");
ok(html.split(LINE).length === 2, "the line shows once on the page, nowhere else");
const at = box.indexOf(TAG);
ok(at > box.indexOf('id="e"') && at > box.indexOf('id="p"') && at < box.indexOf('id="now"') && at < box.indexOf('id="add-btn"'), "the line sits under the fields, before Approve now and Add to desk");
ok(!/id="add-link-line"[^>]*\b(hidden|style=)/.test(html), "the line is not hidden");
ok(js.indexOf("add-link-line") < 0 && js.indexOf(LINE) < 0 && js.indexOf("link their own account") < 0, "people.js never rewrites or rebuilds the line");
ok(!/(innerHTML|insertAdjacentHTML|outerHTML)[^;]*link their own account/.test(js + read("people-world.js")), "the line never goes in through innerHTML");
// ---- the account field and its param are gone ----
ok(!/id="acct"/.test(html), "people.html has no typed account field");
ok(!/<input[^>]*placeholder="[^"]*\b(AIA account|account name|account id)\b[^"]*"/i.test(box), "no input in Add someone asks for an account");
ok(!/getElementById\("acct"\)/.test(js), "people.js never reads a typed account field");
ok(!/if they have one|if no account yet|if they do not have an account|One AIA account/i.test(box), "no wording says typing an account links it");
ok(box.indexOf('id="n"') > 0 && box.indexOf('id="p"') > 0 && box.indexOf('id="e"') > 0 && box.indexOf('id="ph"') > 0, "name, desk code, email and phone fields stay");
// Run the real invite() with a stub page and capture the body it sends.
function fnSource(src, head) {
  const i = src.indexOf(head);
  if (i < 0) return "";
  let d = 0, j = src.indexOf("{", i);
  for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) return src.slice(i, k + 1); } }
  return "";
}
const inv = fnSource(js, "async function invite()");
ok(!!inv, "people.js still has invite()");
const sent = [];
const els = {};
["n", "k", "crew", "p", "inv", "e", "ph", "now", "acct", "accountId", "account"].forEach((id) => { els[id] = { id, value: "", checked: true, textContent: "" }; });
els.n.value = "Sam"; els.k.value = "helper"; els.p.value = "4821"; els.e.value = "sam@example.test"; els.ph.value = "4175550100";
els.acct.value = "acct_ann_typed"; els.accountId.value = "acct_ann_typed"; els.account.value = "acct_ann_typed";
const ctx = {
  document: { getElementById(id) { return els[id] || { value: "", checked: false, textContent: "" }; } },
  api(url, init) { sent.push({ url, body: JSON.parse(init.body) }); return Promise.resolve({ status: 201, data: { ok: true, pending: false } }); },
  inviteLine() { return "line"; }, load() {}, navigator: { clipboard: { writeText() { return Promise.resolve(); } } }, JSON, Promise
};
vm.createContext(ctx);
(async function () {
  try { vm.runInContext(inv + "\ninvite();", ctx); } catch (e) { ok(false, "invite() runs: " + e.message); }
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  const b = sent[0] && sent[0].body;
  ok(!!b && sent[0].url === "/api/admin" && b.action === "invite", "invite() posts action invite to /api/admin");
  ok(!!b && !Object.keys(b).some((k) => /^(account|accountId|acct|accountName|owner|ownerAccount)$/i.test(k)), "the invite body carries no account param: " + (b ? Object.keys(b).join(",") : "none"));
  ok(!!b && JSON.stringify(b).indexOf("acct_ann_typed") < 0, "nothing typed as an account rides along");
  ok(!!b && b.name === "Sam" && b.pin === "4821" && b.email === "sam@example.test" && b.phone === "4175550100" && b.kind === "helper", "name, desk code, email, phone and kind still go");
  finish();
})();

function finish() {
ok(fs.statSync(path.join(root, "desk.html")).size === 35012, "desk.html stays 35,012 bytes (main cd3dea6 size)");
ok(!/link their own account/.test(read("desk.html")), "desk.html untouched");
ok(!/check-invite-link-line/.test(read("package.json")), "not in npm test yet (lands after 361)");

console.log("check-invite-link-line: " + passes + " pass, " + failures + " fail");
process.exit(failures ? 1 : 0);
}
