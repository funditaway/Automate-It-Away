#!/usr/bin/env node
"use strict";
// Mutation run for scripts/check-people-helper-view.js: each mutant breaks one piece of the
// helper-view People page on purpose; the check must fail on every one. Writes mutants to a temp
// dir only; people.js itself is never changed. Not wired into npm test.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const check = path.join(__dirname, "check-people-helper-view.js");
const src = fs.readFileSync(path.join(root, "people.js"), "utf8");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aia-people-helper-mut-"));

const ORIGINAL_KEY = 'var key = "name:" + String(p.name || "").trim().toLowerCase();\n    if (p.email) key = "email:" + String(p.email).trim().toLowerCase();\n    if (p.accountId) key = "account:" + String(p.accountId).trim();';

const mutants = [
  ["group by name again (personKey falls back to name)", 'return "seat:" + desk + ":" + (id || ("#" + i));', 'return "name:" + String((p && p.name) || "").trim().toLowerCase();'],
  ["groupPeople back to the old name-first key", "var key = personKey(p, i);", ORIGINAL_KEY],
  ["owner: email no longer groups", 'if (mail) return "email:" + mail;', ""],
  ["owner: accountId no longer groups", 'if (acct) return "account:" + acct;', ""],
  ["owner: email grouping stops folding case", 'var mail = String((p && p.email) || "").trim().toLowerCase();', 'var mail = String((p && p.email) || "").trim();'],
  ["empty mailto when no email", 'if (!email) return "";', 'if (!email) return "mailto:";'],
  ["bare # sms link when no phone", 'if (!phone) return "";', 'if (!phone) return "#";'],
  ["sheet links never hide", "  if (href) {\n    el.href = href;", "  if (true) {\n    el.href = href;"],
  ["sheet links keep old href when hidden", '    el.removeAttribute("href");\n    el.hidden = true;\n    el.style.display = "none";', '    el.href = "#";'],
  ["drop the blank guard on the email/phone line", '(sub ? "<p class=\\"meta\\">" + sub + "</p>" : "")', '"<p class=\\"meta\\">" + sub + "</p>"'],
  ["old line join (leading ' · ')", 'var sub = subBits.join(" · ");', 'var sub = (p.phone ? esc(p.phone) : "") + (p.phone && p.email ? " · " : "") + (p.email ? esc(p.email) : "") + (seatCount >= 2 ? " · Several desks" : "");'],
  ["drop the blank guard on the prompt summary", '(prompt ? "<p class=\\"meta\\">Prompt · " + esc(prompt) + "</p>" : "")', '"<p class=\\"meta\\">Prompt · " + esc(prompt) + "</p>"'],
  ["drop the blank guard on seat.ext", 'if (seat.ext) bits.push("Ext " + seat.ext);', 'bits.push("Ext " + seat.ext);'],
  ["hide a helper's own email", "if (p.email) subBits.push(esc(p.email));", ""],
  ["stop escaping the card name", 'esc(p.name || "Unnamed")', '(p.name || "Unnamed")']
];

let caught = 0;
const missed = [];
mutants.forEach(function (m, i) {
  const name = m[0];
  if (src.indexOf(m[1]) < 0) { missed.push(name + " (anchor not found)"); console.error("MISS " + name + " (anchor not found)"); return; }
  const file = path.join(dir, "people-mut-" + (i + 1) + ".js");
  fs.writeFileSync(file, src.replace(m[1], m[2]));
  const r = spawnSync(process.execPath, [check], { encoding: "utf8", env: Object.assign({}, process.env, { PEOPLE_HELPER_VIEW_JS: file }) });
  if (r.status !== 0) {
    caught += 1;
    const first = String(r.stderr || "").split("\n").find(function (l) { return /^FAIL/.test(l); }) || "";
    console.log("caught " + name + "  <- " + first);
  } else {
    missed.push(name);
    console.error("MISS " + name);
  }
});
fs.rmSync(dir, { recursive: true, force: true });
console.log("mutate-people-helper-view: " + caught + "/" + mutants.length + " caught");
if (missed.length) process.exit(1);
