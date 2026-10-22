#!/usr/bin/env node
"use strict";
// Mutation run for scripts/check-people-helper-view.js: each mutant breaks one piece of the
// helper-view People page on purpose; the check must fail on every one. Writes mutants to a temp
// dir only; people.js and people-desk.js are never changed. Not wired into npm test.
// A mutant tagged "desk" mutates people-desk.js; the rest mutate people.js.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const check = path.join(__dirname, "check-people-helper-view.js");
const src = fs.readFileSync(path.join(root, "people.js"), "utf8");
const deskSrc = fs.readFileSync(path.join(root, "people-desk.js"), "utf8");
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
  ["stop escaping the card name", 'esc(p.name || "Unnamed")', '(p.name || "Unnamed")'],
  ["openSheet stops putting the open seat on the sheet", '  sheet.setAttribute("data-seat", person.id || "");\n  sheet.setAttribute("data-desk", (person.seats && person.seats[0] && person.seats[0].deskSlug) || "");\n  sheet.setAttribute("data-key", person.key || "");\n', ""],
  ["desk: currentPerson back to name match", "  function currentPerson() {\n", "  function currentPerson() {\n    return personByName();\n", "desk"],
  ["desk: a seat gone from the list falls back to the name", 'if (seat) return list.find(function (p) { return holdsSeat(p, seat, sheetAttr("data-desk")); }) || null;', 'if (seat) return list.find(function (p) { return holdsSeat(p, seat, sheetAttr("data-desk")); }) || personByName();', "desk"],
  ["desk: no name fallback when the sheet has no seat", "    return personByName();\n  }\n  function openSeatId", "    return null;\n  }\n  function openSeatId", "desk"],
  ["desk: Accept / Deny use the name match", "  async function seatAct(action) {\n    var person = currentPerson();", "  async function seatAct(action) {\n    var person = personByName();", "desk"],
  ["desk: Say uses the name match", "  async function say() {\n    var person = currentPerson();", "  async function say() {\n    var person = personByName();", "desk"],
  ["desk: seat match ignores the seat id", "return s && s.id === seat && (!desk || !s.deskSlug || s.deskSlug === desk);", "return s && (!desk || !s.deskSlug || s.deskSlug === desk);", "desk"]
];

let caught = 0;
const missed = [];
mutants.forEach(function (m, i) {
  const name = m[0];
  const desk = m[3] === "desk";
  const base = desk ? deskSrc : src;
  if (base.indexOf(m[1]) < 0) { missed.push(name + " (anchor not found)"); console.error("MISS " + name + " (anchor not found)"); return; }
  const file = path.join(dir, (desk ? "people-desk-mut-" : "people-mut-") + (i + 1) + ".js");
  fs.writeFileSync(file, base.replace(m[1], m[2]));
  const env = Object.assign({}, process.env);
  if (desk) env.PEOPLE_HELPER_VIEW_DESK_JS = file; else env.PEOPLE_HELPER_VIEW_JS = file;
  const r = spawnSync(process.execPath, [check], { encoding: "utf8", env: env });
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
