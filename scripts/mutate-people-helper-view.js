#!/usr/bin/env node
"use strict";
// Mutation run for scripts/check-people-helper-view.js: each mutant breaks one piece of the
// helper-view People page on purpose; the check must fail on every one. Writes mutants to a temp
// dir only; people.js and people-desk.js are never changed. Not wired into npm test.
// A mutant tagged "desk" mutates people-desk.js, "inbox" desk-inbox.js, "history" history.html,
// "handoff" desk-handoff.js, "card" desk-card.js, "queue" desk-queue.js; the rest mutate people.js.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const check = path.join(__dirname, "check-people-helper-view.js");
const src = fs.readFileSync(path.join(root, "people.js"), "utf8");
const deskSrc = fs.readFileSync(path.join(root, "people-desk.js"), "utf8");
const inboxSrc = fs.readFileSync(path.join(root, "desk-inbox.js"), "utf8");
const historySrc = fs.readFileSync(path.join(root, "history.html"), "utf8");
const handoffSrc = fs.readFileSync(path.join(root, "desk-handoff.js"), "utf8");
const cardSrc = fs.readFileSync(path.join(root, "desk-card.js"), "utf8");
const queueSrc = fs.readFileSync(path.join(root, "desk-queue.js"), "utf8");
const FILES = {
  people: { src: src, env: "PEOPLE_HELPER_VIEW_JS", ext: ".js" },
  desk: { src: deskSrc, env: "PEOPLE_HELPER_VIEW_DESK_JS", ext: ".js" },
  inbox: { src: inboxSrc, env: "PEOPLE_HELPER_VIEW_INBOX_JS", ext: ".js" },
  history: { src: historySrc, env: "PEOPLE_HELPER_VIEW_HISTORY", ext: ".html" },
  handoff: { src: handoffSrc, env: "PEOPLE_HELPER_VIEW_HANDOFF_JS", ext: ".js" },
  card: { src: cardSrc, env: "PEOPLE_HELPER_VIEW_CARD_JS", ext: ".js" },
  queue: { src: queueSrc, env: "PEOPLE_HELPER_VIEW_QUEUE_JS", ext: ".js" }
};
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
  ["openSheet stops putting the open seat on the sheet", '  sheet.setAttribute("data-seat", seat.id);\n  sheet.setAttribute("data-desk", seat.desk);\n  sheet.setAttribute("data-key", person.key || "");\n', ""],
  ["desk: currentPerson back to name match", "  function currentPerson() {\n", "  function currentPerson() {\n    return personByName();\n", "desk"],
  ["desk: a seat gone from the list falls back to the name", 'if (seat) return list.find(function (p) { return holdsSeat(p, seat, sheetAttr("data-desk")); }) || null;', 'if (seat) return list.find(function (p) { return holdsSeat(p, seat, sheetAttr("data-desk")); }) || personByName();', "desk"],
  ["desk: no name fallback when the sheet has no seat", "    return personByName();\n  }\n  function openSeatId", "    return null;\n  }\n  function openSeatId", "desk"],
  ["desk: Accept / Deny use the name match", "  async function seatAct(action) {\n    var person = currentPerson();", "  async function seatAct(action) {\n    var person = personByName();", "desk"],
  ["desk: Say uses the name match", "  async function say() {\n    var person = currentPerson();", "  async function say() {\n    var person = personByName();", "desk"],
  ["desk: seat match ignores the seat id", "return s && s.id === seat && (!desk || !s.deskSlug || s.deskSlug === desk);", "return s && (!desk || !s.deskSlug || s.deskSlug === desk);", "desk"],
  // 372 server API: open by seat id + desk, 409 shows nobody, links and job credit by seat id
  ["seat GET drops desk=", 'return "/api/admin?seat=" + encodeURIComponent(seat.id) + (seat.desk ? "&desk=" + encodeURIComponent(seat.desk) : "");', 'return "/api/admin?seat=" + encodeURIComponent(seat.id);'],
  ["seat GET goes to the working desk, not the seat's desk", "{ headers: deskHeaders(seat.desk) }", "{}"],
  ["seat GET by ?who= even when the id is known", "var got = await api(seatBookPath(seat),", 'var got = await api("/api/admin?who=" + encodeURIComponent(person.name || ""),'],
  ["POST person always sends the name", 'if (!seat.id) body.name = person.name || "";', 'body.name = person.name || "";'],
  ["POST person sends email / accountId hints", 'var body = { action: "person", id: seat.id, desk: seat.desk, desks: desks };', 'var body = { action: "person", id: seat.id, desk: seat.desk, desks: desks, email: person.email || "", accountId: person.accountId || "" };'],
  ["POST person drops the desk", 'var body = { action: "person", id: seat.id, desk: seat.desk, desks: desks };', 'var body = { action: "person", id: seat.id, desks: desks };'],
  ["409 on the seat GET ignored", "if (got.status === 409) { clearSheet(SAME_NAME_LINE); return; }", ""],
  ["409 on the seat GET falls back to a name lookup", "if (got.status === 409) { clearSheet(SAME_NAME_LINE); return; }", 'if (got.status === 409) { seat = { id: "", desk: "" }; }'],
  ["409 on POST person ignored", "if (out.status === 409) { clearSheet(SAME_NAME_LINE); return; }", ""],
  ["409 keeps the last person's data on the sheet", '  ["sheet-name", "sheet-meta", "sheet-copy", "sheet-last"].forEach(function (id) {\n    var el = document.getElementById(id);\n    if (el) el.textContent = "";\n  });\n  ["sheet-seats", "sheet-yours", "sheet-theirs", "sheet-history"].forEach(function (id) {\n    var el = document.getElementById(id);\n    if (el) el.innerHTML = "";\n  });\n', ""],
  ["409 keeps the open seat on the sheet", '    sheet.setAttribute("data-seat", "");\n    sheet.setAttribute("data-desk", "");\n    sheet.setAttribute("data-key", "");\n', ""],
  ["409 shows no plain line", "if (banner && line) banner.textContent = line;", ""],
  ["old ?who= link opens the first of two same-name seats", "if (named.length > 1) { clearSheet(SAME_NAME_LINE); return; }", "if (named.length > 1) named = [named[0]];"],
  ["?seat= link ignores desk", 'if (s && s.id === seatId && (!desk || String(s.deskSlug || "") === desk)) hits.push', "if (s && s.id === seatId) hits.push"],
  ["Full history link back to ?who=", 'setSheetLink("sheet-history-link", seat.id ? seatLink("/history", seat) + "#account-road" : "");', 'setSheetLink("sheet-history-link", "/history?who=" + encodeURIComponent(person.name || "") + "#account-road");'],
  ["Full history link drops desk", 'return base + "?seat=" + encodeURIComponent(seat.id) + (seat.desk ? "&desk=" + encodeURIComponent(seat.desk) : "");', 'return base + "?seat=" + encodeURIComponent(seat.id);'],
  ["job holder by name, not handedTo.id / assigneeId", 'return jobSeat(j, (j.handedTo && j.handedTo.id) || j.assigneeId || "",', 'return jobSeat(j, "",'],
  ["job holder name fallback takes the first same-name seat", "return named.length === 1 ? named[0] : null;", "return named[0] || null;"],
  ["job with a gone seat id falls back to the name", 'if (seatId) return seatsOnDesk(desk).find(function (s) { return String(s.id || "") === seatId; }) || null;', 'if (seatId) return seatsOnDesk(desk).find(function (s) { return String(s.id || "") === seatId; }) || onlySeatNamed(desk, name);'],
  ["desk: empty sheet name still matches a nameless seat", "    if (!name) return null;\n", "", "desk"],
  ["inbox: Open on People back to ?who=", "        peopleLink(p) +", '        "<a class=\\"edit\\" href=\\"/people?who=" + encodeURIComponent(p.name || "") + "&f=waiting\\">Open on People</a>" +', "inbox"],
  ["inbox: link drops desk", '"&desk=" + encodeURIComponent(desk) + "&f=waiting', '"&f=waiting', "inbox"],
  ["inbox: pipes and asks get a seat link anyway", 'if (!seat) return "";', 'if (!seat) seat = { id: (p && p.id) || "" };', "inbox"],
  ["inbox: shared name with no id links the first seat", "if (named.length === 1) seat = named[0];", "if (named.length) seat = named[0];", "inbox"],
  ["history: Open on People back to ?who=", 'function whoPeopleHref(){return (seatId&&who&&who===seatName)?"/people?seat="+encodeURIComponent(seatId)+(seatDesk?"&desk="+encodeURIComponent(seatDesk):""):"";}', 'function whoPeopleHref(){return who?"/people?who="+encodeURIComponent(who):"";}', "history"],
  ["history: name with no seat still gets a link", "return (seatId&&who&&who===seatName)?", "return (who)?", "history"],
  ["history: seat GET drops desk=", 'fetch("/api/admin?seat="+encodeURIComponent(id)+(desk?"&desk="+encodeURIComponent(desk):""),', 'fetch("/api/admin?seat="+encodeURIComponent(id),', "history"],
  ["history: seat GET goes to the working desk", "s=s||cur;", "s=cur;", "history"],
  ["history: 409 ignored", "if(r.status===409){seatNote=SAME_NAME;return false;}", "", "history"],
  ["history: 409 keeps a person filter", "if(r.status===409){seatNote=SAME_NAME;return false;}", 'if(r.status===409){seatNote=SAME_NAME;who="Pat";return false;}', "history"],
  // 372 v3: history by seat, no client whoTapped, hand-off by seat id, notes only when sent
  ["history: seat known but who= still sent", "if(seatId){b.seat=seatId;b.desk=seatDesk;}else if(who)b.who=who;", "if(seatId){b.seat=seatId;b.desk=seatDesk;}if(who)b.who=who;", "history"],
  ["history: seat never sent to the server", "if(seatId){b.seat=seatId;b.desk=seatDesk;}else if(who)b.who=who;", "if(who)b.who=who;", "history"],
  ["history: seat sent without its desk", "if(seatId){b.seat=seatId;b.desk=seatDesk;}", "if(seatId){b.seat=seatId;}", "history"],
  ["history: seat ask goes to every desk", "if(seatId&&seatDesk)return rows.filter(function(d){return d.slug===seatDesk;});", "", "history"],
  ["history: load() back to the old name body", " var body=historyBody(asked);", ' var body={action:"history",lane:lane,when:when,q:q,who:who,kind:work,pipe:pipe,since:since,advanced:advanced,desks:asked.map(function(d){return {slug:d.slug,pin:d.pin};})};', "history"],
  ["history: free-text who dropped when no seat", "}else if(who)b.who=who;", "}", "history"],
  ["queue: whoTapped back on recommend", 'JSON.stringify({ action: "recommend", id: id })', 'JSON.stringify({ action: "recommend", id: id, whoTapped: (typeof youName !== "undefined" && youName) || "desk" })', "queue"],
  ["card: whoTapped back on carry", 'JSON.stringify({ action: "carry", id, text: note })', 'JSON.stringify({ action: "carry", id, text: note, whoTapped: youName || role || "desk" })', "card"],
  ["handoff: whoTapped back on Needs a hand", 'JSON.stringify({ action: "hand", id: id })', 'JSON.stringify({ action: "hand", id: id, whoTapped: (window.youName || "desk") })', "handoff"],
  ["handoff: sends the name, not the seat id", 'JSON.stringify({ action: "assign", id: id, to: String(seat.id) })', 'JSON.stringify({ action: "assign", id: id, name: seat.name })', "handoff"],
  ["handoff: shared name takes the first seat", '    if (named.length > 1) return "many";\n    return named[0] || null;', "    return named[0] || null;", "handoff"],
  ["handoff: shared name sends nothing but shows no line", 'if (seat === "many") { if (banner) banner.textContent = SAME_NAME; return; }', 'if (seat === "many") { return; }', "handoff"],
  ["handoff: no seat still sends the raw value", 'if (!seat) { if (banner) banner.textContent = "Pick the person from the list."; return; }', 'if (!seat) seat = { id: sel.value, name: sel.value };', "handoff"],
  ["handoff: 409 shows the server text", "if (out.status === 409) banner.textContent = SAME_NAME;\n      else ", "", "handoff"],
  ["handoff: picker values back to names", 'return "<option value=\\"" + esc(p.id || "") + "\\"" + sel + ">"', 'return "<option value=\\"" + esc(p.name) + "\\"" + sel + ">"', "handoff"],
  ["handoff: picker selects by name", "var sel = (p.id && heldId && String(heldId) === String(p.id)) ? \" selected\" : \"\";", "var sel = j && j.assignee === p.name ? \" selected\" : \"\";", "handoff"],
  ["card: handTo sends the name", "JSON.stringify({ action: \"assign\", id, to: String(seat.id) })", "JSON.stringify({ action: \"assign\", id, name: seat.name })", "card"],
  ["card: handTo shared name takes the first seat", "  if (named.length > 1) return \"many\";\n  return named[0] || null;", "  return named[0] || null;", "card"],
  ["card: handTo 409 shows the server text", "banner.textContent = out.status === 409 ? HAND_SAME_NAME_LINE : ((out.data && out.data.error) || \"Could not hand that off.\");", "banner.textContent = (out.data && out.data.error) || \"Could not hand that off.\";", "card"],
  ["card: Hand to picker values back to names", "\"<option value=\\\"\" + esc(p.id || \"\") + \"\\\"\"", "\"<option value=\\\"\" + esc(p.name) + \"\\\"\"", "card"],
  ["queue: handOffTo sends the name", "JSON.stringify({ action: \"assign\", id: id, to: String(seat.id) })", "JSON.stringify({ action: \"assign\", id: id, name: want })", "queue"],
  ["queue: handOffTo shared name takes the first seat", "if (named.length > 1) { if (banner) banner.textContent = \"Two people share that name. Open them from the People list.\"; return; }", "", "queue"],
  ["queue: handOffTo no seat sends the name anyway", "if (!named.length) { if (banner) banner.textContent = \"Pick the person from the list.\"; return; }\n    const seat = named[0];", "const seat = named[0] || { id: want, name: want };", "queue"],
  ["queue: handOffTo 409 shows the server text", "if (out.status === 409) { if (banner) banner.textContent = \"Two people share that name. Open them from the People list.\"; return; }\n", "", "queue"],
  ["notes: area shown even with no thread", "    el.innerHTML = \"\";\n    el.hidden = true;\n    el.style.display = \"none\";\n    return;", "    el.innerHTML = \"<p class=\\\"meta\\\">Notes on this seat</p>\";\n    el.hidden = false;\n    return;"],
  ["notes: thread text not escaped", "esc(t.text) + (t.t ?", "t.text + (t.t ?"],
  ["notes: thread never painted", "  paintNotes(data.thread);\n", ""],
  ["notes: a 409 keeps the old notes", "  paintNotes(null);\n", ""],
  // Probe FAIL on #384: POST must not override the GET's private fields; exact hand-off keys; queue sheet
  ["sheet: POST person overrides the GET's contact (old override)", "var priv = own ? (own.person || {}) : {};", "var priv = (wide && wide.person) || (own ? (own.person || {}) : {});"],
  ["sheet: POST thread overrides the GET's (old override)", "thread: own ? own.thread : null,", "thread: (wide || own).thread,"],
  ["sheet: no GET answer falls back to the POST's contact", "var priv = own ? (own.person || {}) : {};", "var priv = own ? (own.person || {}) : ((wide && wide.person) || {});"],
  ["sheet: contact falls back to the list row", "setSheetLink(\"sheet-mail\", mailHref(data.person.email, line));", "setSheetLink(\"sheet-mail\", mailHref(data.person.email || person.email || \"\", line));"],
  ["handoff: body carries assignee too", 'JSON.stringify({ action: "assign", id: id, to: String(seat.id) })', 'JSON.stringify({ action: "assign", id: id, to: String(seat.id), assignee: seat.name })', "handoff"],
  ["card: handTo body carries assignee too", 'JSON.stringify({ action: "assign", id, to: String(seat.id) })', 'JSON.stringify({ action: "assign", id, to: String(seat.id), assignee: seat.name })', "card"],
  ["queue: handOffTo body carries assignee too", 'JSON.stringify({ action: "assign", id: id, to: String(seat.id) })', 'JSON.stringify({ action: "assign", id: id, to: String(seat.id), assignee: seat.name })', "queue"],
  ["queue sheet: buttons pass the name again", "function () { window.handOffTo(id, String(p.id)); }", "function () { window.handOffTo(id, p.name); }", "queue"],
  ["queue sheet: back to inline onclick markup", '    sheet.innerHTML = "";\n', '    sheet.innerHTML = "<button class=\\"edit\\" type=\\"button\\" onclick=\\"openInvite()\\">Invite</button>";\n', "queue"],
  ["queue sheet: labels through innerHTML", "if (label != null) node.textContent = label;", "if (label != null) node.innerHTML = label;", "queue"],
  ["queue sheet: 'has it' by name", "const has = heldId && String(heldId) === String(p.id);", "const has = j.assignee && String(j.assignee) === String(p.name);", "queue"]
];

let caught = 0;
const missed = [];
mutants.forEach(function (m, i) {
  const name = m[0];
  const f = FILES[m[3] || "people"];
  const base = f.src;
  if (base.indexOf(m[1]) < 0) { missed.push(name + " (anchor not found)"); console.error("MISS " + name + " (anchor not found)"); return; }
  if (base.indexOf(m[1]) !== base.lastIndexOf(m[1])) { missed.push(name + " (anchor not unique)"); console.error("MISS " + name + " (anchor not unique)"); return; }
  const file = path.join(dir, (m[3] || "people") + "-mut-" + (i + 1) + f.ext);
  fs.writeFileSync(file, base.replace(m[1], () => m[2]));
  const env = Object.assign({}, process.env);
  env[f.env] = file;
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
