#!/usr/bin/env node
// Owner invite screen (people.html "Add someone"): one plain line says accounts join only by
// signing in (PR 361: a typed account name or id no longer attaches an account).
// The line is static HTML in the form, not built from typed text, not hidden, not rewritten by JS.
// usage: node scripts/check-invite-link-line.js [repoRoot]
const fs = require("fs");
const path = require("path");

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
ok(at > box.indexOf('id="acct"') && at > box.indexOf('id="p"') && at < box.indexOf('id="now"') && at < box.indexOf('id="add-btn"'), "the line sits under the fields, before Approve now and Add to desk");
ok(!/id="add-link-line"[^>]*\b(hidden|style=)/.test(html), "the line is not hidden");
ok(js.indexOf("add-link-line") < 0 && js.indexOf(LINE) < 0 && js.indexOf("link their own account") < 0, "people.js never rewrites or rebuilds the line");
ok(!/(innerHTML|insertAdjacentHTML|outerHTML)[^;]*link their own account/.test(js + read("people-world.js")), "the line never goes in through innerHTML");
ok(fs.statSync(path.join(root, "desk.html")).size === 33792, "desk.html stays 33,792 bytes");
ok(!/link their own account/.test(read("desk.html")), "desk.html untouched");
ok(!/check-invite-link-line/.test(read("package.json")), "not in npm test yet (lands after 361)");

console.log("check-invite-link-line: " + passes + " pass, " + failures + " fail");
process.exit(failures ? 1 : 0);
