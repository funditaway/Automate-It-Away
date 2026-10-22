#!/usr/bin/env node
// Helpers see other seats as name and role only.
// Anyone who is not the desk owner (a helper, an AI seat, a desk-code login, an unproven PIN
// helper, a staff seat, no seat at all) gets every seat list with other seats as display fields
// only: no email, no accountId, no phone, no PIN hash, no wallet, no permission map. The viewer's
// own seat keeps its own email; its accountId only when its own sign-in proved that account. The
// owner (desk code or email + password) still sees the full list. Never a raw seat row as `you`.
// Runs the real handlers against a temp store. No network.
// Usage: node scripts/check-helper-sees-display-only.js            (the check)
//        node scripts/check-helper-sees-display-only.js --mutate   (mutants on a temp copy; exit 1 if any non-equivalent survives)
const fs = require("fs");
const os = require("os");
const path = require("path");
const root = path.join(__dirname, "..");
const MUTATE = process.argv.indexOf("--mutate") >= 0;

if (!MUTATE) process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-hsd-" + Date.now() + "-" + process.pid + ".json");
delete global.__aia;
delete global.__aiaHydrate;

let failed = 0;
function fail(msg) { console.error("FAIL " + msg); failed += 1; process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }
function ok(cond, msg) { if (cond) pass(msg); else fail(msg); }
function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; }
  };
}
async function call(handler, method, headers, body, query, url) {
  const res = mockRes();
  await handler({ method, headers: headers || {}, body: body || {}, query: query || {}, url: url || "/api/auth" }, res);
  return res;
}

async function main() {
  const auth = require(path.join(root, "api/auth"));
  const jobs = require(path.join(root, "api/jobs"));
  const admin = require(path.join(root, "api/admin"));
  const desks = require(path.join(root, "api/_desks-http"));
  const acch = require(path.join(root, "api/_account-http"));
  const lib = require(path.join(root, "api/_lib"));
  const account = require(path.join(root, "api/_account"));
  await lib.ready();

  const A = "hsd-desk";
  const opened = await call(auth, "POST", {}, { action: "open", slug: A, biz: A, name: "Ann", pin: "1111", email: "ann.plant.hsd@x.test" });
  ok(opened.statusCode === 201, "[setup] Ann opens the desk (" + opened.statusCode + ")");
  const annPinTok = opened.body.session.token;
  const ws = lib.mem.workspaces.find((w) => w && w.slug === A);
  const acctA = ws.accountId;
  const annAcc = lib.mem.accounts.find((a) => a.id === acctA);
  account.setAccountPassword(annAcc, "ann-pass-hsd-1234");
  const annEmail = await call(auth, "POST", {}, { action: "login", email: "ann.plant.hsd@x.test", password: "ann-pass-hsd-1234" });
  ok(annEmail.statusCode === 200 && annEmail.body.session, "[setup] Ann signs in by email + password (" + annEmail.statusCode + ")");
  const annPwTok = annEmail.body.session.token;
  const owner = { "x-workspace": A, "x-session": annPinTok };

  const now = new Date().toISOString();
  const seat = (id, name, kind, pin, email, accountId, extra) => Object.assign({ id, name, role: kind === "agent" ? "agent" : "employee", kind, status: "approved", pin: lib.hashPin(pin), email, accountId, phone: "+1555" + pin + "0000", walletId: "wal_hsd_" + pin, prompt: "PROMPT-HSD-" + pin, createdAt: now }, extra || {});
  // Olly: plain helper, an accountId typed on the seat (never proven).
  ws.people.push(seat("p_hsd_olly", "Olly", "helper", "7171", "olly.plant.hsd@x.test", "acct_hsd_olly_typed"));
  // Lex: legacy seat carrying the owner's account and email.
  ws.people.push(seat("p_hsd_lex", "Lex", "helper", "6161", "lex.plant.hsd@x.test", acctA));
  // Hal: helper with his own account, proven by his own sign-in; world handle set.
  lib.mem.accounts.push({ id: "acct_hsd_hal", name: "Hal", ownerName: "Hal", email: "hal.plant.hsd@x.test", handle: "halhsd", desks: [], memberDesks: [A], plan: "pro" });
  const halAcc = lib.mem.accounts.find((a) => a.id === "acct_hsd_hal");
  ws.people.push(seat("p_hsd_hal", "Hal", "helper", "5252", "hal.plant.hsd@x.test", "acct_hsd_hal"));
  // An AI seat and a staff seat that can invite.
  ws.people.push(seat("p_hsd_bot", "Desk Bot", "agent", "8181", "bot.plant.hsd@x.test", "acct_hsd_bot", { deskAi: true, does: "Sorts intake" }));
  ws.people.push(seat("p_hsd_sam", "Sam", "staff", "9191", "sam.plant.hsd@x.test", "acct_hsd_sam", { can: { invite: true } }));
  // Pia: a world account already asked onto the desk (pending seat).
  lib.mem.accounts.push({ id: "acct_hsd_pia", name: "Pia", ownerName: "Pia", email: "pia.plant.hsd@x.test", handle: "piahsd", desks: [], memberDesks: [], plan: "pro" });
  ws.people.push(seat("p_hsd_pia", "Pia", "helper", "3535", "pia.plant.hsd@x.test", "acct_hsd_pia", { status: "pending", worldInvite: true }));
  const S = (id) => ws.people.find((p) => p.id === id);
  const ownerSeat = ws.people.find((p) => p.role === "owner");
  ownerSeat.phone = "+15551111999";

  const loginTok = async (pin) => { const r = await call(auth, "POST", {}, { action: "login", workspace: A, pin }); return r.body && r.body.session && r.body.session.token; };
  const ollyTok = await loginTok("7171");
  const lexTok = await loginTok("6161");
  const samTok = await loginTok("9191");
  const botTok = lib.issueSession(S("p_hsd_bot"), ws, null).token;
  const halTok = lib.issueSession(S("p_hsd_hal"), ws, halAcc, null, "password").token;
  ok(!!(ollyTok && lexTok && samTok && botTok && halTok), "[setup] every viewer has a session");

  // What each viewer must never see.
  const EMAIL = { pia: "pia.plant.hsd@x.test", owner: "ann.plant.hsd@x.test", olly: "olly.plant.hsd@x.test", lex: "lex.plant.hsd@x.test", hal: "hal.plant.hsd@x.test", bot: "bot.plant.hsd@x.test", sam: "sam.plant.hsd@x.test" };
  const ACCT = { owner: acctA, olly: "acct_hsd_olly_typed", hal: "acct_hsd_hal", bot: "acct_hsd_bot", sam: "acct_hsd_sam" };
  const hashes = () => ws.people.map((p) => p && p.pin).filter(Boolean).concat([ws.pin]);
  const PRIVATE = () => ws.people.map((p) => p && p.phone).filter(Boolean).concat(ws.people.map((p) => p && p.walletId).filter(Boolean), ws.people.map((p) => p && p.prompt).filter((x) => /HSD/.test(String(x || ""))));
  const SEAT = { owner: ownerSeat && ownerSeat.id, olly: "p_hsd_olly", lex: "p_hsd_lex", hal: "p_hsd_hal", bot: "p_hsd_bot", sam: "p_hsd_sam" };
  const forbidden = (who, ownAcct) => {
    const out = [];
    const ownPhone = who && S(SEAT[who]) ? S(SEAT[who]).phone : "";
    Object.keys(EMAIL).forEach((k) => { if (k !== who) out.push(EMAIL[k]); });
    Object.keys(ACCT).forEach((k) => { if (ACCT[k] !== ownAcct) out.push(ACCT[k]); });
    // The viewer's own phone may come back on its own person book; nobody else's.
    return out.concat(hashes(), PRIVATE().filter((x) => x !== ownPhone));
  };
  const leaks = (r, who, ownAcct) => { const t = JSON.stringify(r && r.body == null ? "" : r.body); return forbidden(who, ownAcct).filter((s) => s && t.indexOf(s) >= 0); };
  const allPeople = (b) => {
    const lists = [];
    const walk = (o) => { if (!o || typeof o !== "object") return; if (Array.isArray(o.people) && o.people.length && typeof o.people[0] === "object") lists.push(o.people); Object.keys(o).forEach((k) => walk(o[k])); };
    walk(b); return lists;
  };
  const rawYou = (b) => !!(b && b.you && typeof b.you === "object" && (b.you.pin || b.you.thread || b.you.phone || b.you.walletId || b.you.createdAt));

  // Every reply a non-owner viewer can get that carries seats.
  const sites = (hd) => [
    ["GET /api/auth (auth.js publicWorkspace)", () => call(auth, "GET", hd, null, {}, "/api/auth")],
    ["GET /api/admin (people, you, shop)", () => call(admin, "GET", hd, null, {}, "/api/admin")],
    ["GET /api/admin?who=Ann (person book)", () => call(admin, "GET", hd, null, { who: "Ann" }, "/api/admin?who=Ann")],
    ["POST /api/admin book Lex (person book)", () => call(admin, "POST", hd, { action: "book", name: "Lex" }, {}, "/api/admin")],
    ["POST /api/admin mine (you)", () => call(admin, "POST", hd, { action: "mine" }, {}, "/api/admin")],
    ["GET /api/jobs (people)", () => call(jobs, "GET", hd, null, {}, "/api/jobs")],
    ["GET /api/desks (publicDesk)", () => call(desks, "GET", hd, null, {}, "/api/desks")],
    ["GET /api/desks?explore=1 (exploreDesk)", () => call(desks, "GET", hd, null, { explore: "1" }, "/api/desks?explore=1")],
    ["POST /api/desks export (exportDesk)", () => call(desks, "POST", hd, { action: "export" }, {}, "/api/desks")],
    ["POST /api/desks mine (you)", () => call(desks, "POST", hd, { action: "mine" }, {}, "/api/desks")],
    ["POST /api/auth invite (owner only)", () => call(auth, "POST", hd, { action: "invite", name: "Nope", kind: "helper", pin: "3131" })],
    ["POST /api/auth approve (owner only)", () => call(auth, "POST", hd, { action: "approve", id: "p_hsd_olly" })],
    ["POST /api/auth nouns (owner only)", () => call(auth, "POST", hd, { action: "nouns", nouns: {} })],
    ["POST /api/auth create (owner only)", () => call(auth, "POST", hd, { action: "create", name: "Thing" })],
    ["POST /api/auth remove (owner only)", () => call(auth, "POST", hd, { action: "remove", id: "p_hsd_sam" })]
  ];
  const viewers = [
    ["helper Olly, desk-code session", "olly", "", { "x-workspace": A, "x-session": ollyTok }],
    ["unproven PIN helper Olly, X-Pin only", "olly", "", { "x-workspace": A, "x-pin": "7171" }],
    ["legacy seat Lex (owner's account on the seat), session", "lex", "", { "x-workspace": A, "x-session": lexTok }],
    ["AI seat Desk Bot, session", "bot", "", { "x-workspace": A, "x-session": botTok }],
    ["staff Sam, desk-code session", "sam", "", { "x-workspace": A, "x-session": samTok }],
    ["helper Hal, own proven account", "hal", "acct_hsd_hal", { "x-workspace": A, "x-session": halTok }],
    ["no seat (desk name only)", "", "", { "x-workspace": A }]
  ];
  for (const [tag, who, ownAcct, hd] of viewers) {
    for (const [site, run] of sites(hd)) {
      const r = await run();
      const l = leaks(r, who, ownAcct);
      ok(l.length === 0, "[" + tag + "] " + site + " " + r.statusCode + ": no other seat's email/accountId, no hash/phone/wallet/prompt (" + (l.length ? l.join(",") : "none") + ")");
      if (rawYou(r.body)) fail("[" + tag + "] " + site + ": `you` is a raw seat row");
    }
  }

  // Desk-code logins: the login replies themselves.
  const deskLogins = [
    ["POST /api/auth login (desk code, Olly)", "olly", () => call(auth, "POST", {}, { action: "login", workspace: A, pin: "7171" })],
    ["POST /api/auth login (desk code, Lex)", "lex", () => call(auth, "POST", {}, { action: "login", workspace: A, pin: "6161" })],
    ["POST /api/auth open on an existing desk (desk code, Olly)", "olly", () => call(auth, "POST", {}, { action: "open", slug: A, pin: "7171" })],
    ["POST /api/auth open on an existing desk (desk code, Desk Bot)", "bot", () => call(auth, "POST", {}, { action: "open", slug: A, pin: "8181" })]
  ];
  for (const [site, who, run] of deskLogins) {
    const r = await run();
    const l = leaks(r, who, "");
    ok((r.statusCode === 200 || r.statusCode === 201) && l.length === 0, "[desk-code login] " + site + " " + r.statusCode + ": nothing of other seats (" + (l.length ? l.join(",") : "none") + ")");
    const people = (r.body && r.body.workspace && r.body.workspace.people) || [];
    ok(people.length === ws.people.length && people.every((p) => p.name && p.role) && people.every((p) => !p.email || p.id === (r.body.you && r.body.you.id)), "[desk-code login] " + site + ": every seat still listed by name and role");
    ok(r.body && r.body.you && r.body.you.email === EMAIL[who] && !r.body.you.accountId, "[desk-code login] " + site + ": own email kept, no unproven accountId on `you`");
  }

  // World invite as staff: the seat already on the desk comes back name and role only.
  const wi = await call(admin, "POST", { "x-workspace": A, "x-session": samTok }, { action: "invite-world", accountId: "acct_hsd_hal", kind: "helper" }, {}, "/api/admin");
  ok(wi.statusCode === 409 && wi.body.person && wi.body.person.name === "Hal" && !wi.body.person.email && JSON.stringify(wi.body).indexOf(EMAIL.hal) < 0, "[staff Sam] world invite of a seat already on the desk: name and role, no email (" + wi.statusCode + ")");

  const wp = await call(admin, "POST", { "x-workspace": A, "x-session": samTok }, { action: "invite-world", accountId: "acct_hsd_pia", kind: "helper" }, {}, "/api/admin");
  ok(wp.statusCode === 409 && wp.body.pending && wp.body.person && wp.body.person.name === "Pia" && !wp.body.person.email && JSON.stringify(wp.body).indexOf(EMAIL.pia) < 0, "[staff Sam] world invite of a seat already asked: name and role, no email (" + wp.statusCode + ")");

  // Hal exports his proven account: desk A is not his, so its seats are display only, his own row keeps his.
  const ex = await call(acch, "POST", { "x-workspace": A, "x-session": halTok }, { action: "export" }, {}, "/api/account");
  const exPeople = ex.body && ex.body.pack && ex.body.pack.desks && ex.body.pack.desks[0] && ex.body.pack.desks[0].people || [];
  const exHal = exPeople.find((p) => p.id === "p_hsd_hal") || {};
  ok(ex.statusCode === 200 && leaks(ex, "hal", "acct_hsd_hal").length === 0 && exPeople.length === ws.people.length, "[helper Hal] /api/account export: other seats name and role only (" + ex.statusCode + ", " + leaks(ex, "hal", "acct_hsd_hal").join(",") + ")");
  ok(exHal.email === EMAIL.hal && exHal.accountId === "acct_hsd_hal", "[helper Hal] /api/account export: his own seat keeps his email and proven account");

  // ---- Positives.
  const g = await call(auth, "GET", { "x-workspace": A, "x-session": ollyTok }, null, {}, "/api/auth");
  const gp = g.body.workspace.people;
  ok(gp.length === ws.people.length && gp.every((p) => p.id && p.name && p.role && p.kind && p.status), "[helper Olly] sees every seat with id, name, role, kind, status");
  ok(gp.find((p) => p.id === "p_hsd_olly").email === EMAIL.olly && g.body.you.email === EMAIL.olly, "[helper Olly] his own seat keeps his own email");
  ok(gp.find((p) => p.id === "p_hsd_olly").accountId === "" && g.body.you.accountId === "", "[helper Olly] an accountId typed on his seat (never proven) is not shown, even to him");
  ok(gp.find((p) => p.id === "p_hsd_bot").deskAi === true && gp.find((p) => p.id === "p_hsd_bot").does === "Sorts intake", "[helper Olly] the AI seat still shows as a desk AI with what it does");
  const gh = await call(auth, "GET", { "x-workspace": A, "x-session": halTok }, null, {}, "/api/auth");
  ok(gh.body.you.accountId === "acct_hsd_hal" && gh.body.workspace.people.find((p) => p.id === "p_hsd_hal").accountId === "acct_hsd_hal", "[helper Hal] his own proven account id is kept on his own seat");
  const halAdm = await call(admin, "GET", { "x-workspace": A, "x-session": halTok }, null, {}, "/api/admin");
  ok(halAdm.body.you && halAdm.body.you.accountId === "acct_hsd_hal" && halAdm.body.you.email === EMAIL.hal && halAdm.body.people.find((p) => p.id === "p_hsd_hal").accountId === "acct_hsd_hal", "[helper Hal] /api/admin: his own seat keeps his email and proven account");
  const halMine = await call(admin, "POST", { "x-workspace": A, "x-session": halTok }, { action: "mine" }, {}, "/api/admin");
  ok(halMine.body.you && halMine.body.you.accountId === "acct_hsd_hal" && halMine.body.you.name === "Hal", "[helper Hal] admin mine: `you` is his public seat with his proven account");
  const ollyMine = await call(admin, "POST", { "x-workspace": A, "x-session": ollyTok }, { action: "mine" }, {}, "/api/admin");
  ok(ollyMine.body.you && ollyMine.body.you.email === EMAIL.olly && ollyMine.body.you.accountId === "" && !ollyMine.body.you.pin, "[helper Olly] admin mine: own email, no typed accountId, no pin hash");
  const ollyBook = await call(admin, "GET", { "x-workspace": A, "x-session": ollyTok }, null, { who: "Olly" }, "/api/admin?who=Olly");
  ok(ollyBook.body.person && ollyBook.body.person.email === EMAIL.olly && ollyBook.body.person.phone === S("p_hsd_olly").phone, "[helper Olly] his own person book keeps his email and phone");
  const ollyDesk = await call(desks, "GET", { "x-workspace": A, "x-session": ollyTok }, null, {}, "/api/desks");
  ok(Array.isArray(ollyDesk.body.desk.people) && ollyDesk.body.desk.people.length === ws.people.length && ollyDesk.body.desk.you.email === EMAIL.olly, "[helper Olly] /api/desks: every seat listed, own email on `you`");
  const adm = await call(admin, "GET", { "x-workspace": A, "x-session": ollyTok }, null, {}, "/api/admin");
  ok(adm.statusCode === 200 && adm.body.people.length === ws.people.length && adm.body.shop && adm.body.shop.name && !adm.body.shop.id, "[helper Olly] /api/admin people are all listed; the desk account shows its name, not its id");
  ok(JSON.stringify(Object.keys(adm.body.shop)) === '["name"]' && !(adm.body.account && adm.body.account.shop && (adm.body.account.shop.id || adm.body.account.shop.desks)), "[helper Olly] /api/admin accountSnapshot shop is name only: no shop.id, no shop.desks (" + JSON.stringify(Object.keys(adm.body.shop)) + ")");

  const everyEmail = Object.keys(EMAIL).map((k) => EMAIL[k]);
  const ownerSites = [
    ["owner desk-code session GET /api/auth", () => call(auth, "GET", owner, null, {}, "/api/auth")],
    ["owner X-Pin GET /api/auth", () => call(auth, "GET", { "x-workspace": A, "x-pin": "1111" }, null, {}, "/api/auth")],
    ["owner email session GET /api/auth", () => call(auth, "GET", { "x-workspace": A, "x-session": annPwTok }, null, {}, "/api/auth")],
    ["owner GET /api/admin", () => call(admin, "GET", owner, null, {}, "/api/admin")],
    ["owner GET /api/jobs", () => call(jobs, "GET", owner, null, {}, "/api/jobs")],
    ["owner GET /api/desks", () => call(desks, "GET", owner, null, {}, "/api/desks")],
    ["owner GET /api/desks?explore=1", () => call(desks, "GET", owner, null, { explore: "1" }, "/api/desks?explore=1")],
    ["owner POST /api/desks export", () => call(desks, "POST", owner, { action: "export" }, {}, "/api/desks")],
    ["owner desk-code login", () => call(auth, "POST", {}, { action: "login", workspace: A, pin: "1111" })],
    ["owner email + password login", () => call(auth, "POST", {}, { action: "login", email: "ann.plant.hsd@x.test", password: "ann-pass-hsd-1234" })],
    ["owner open on her desk by code", () => call(auth, "POST", {}, { action: "open", slug: A, pin: "1111" })],
    ["owner nouns", () => call(auth, "POST", owner, { action: "nouns", nouns: {} })],
    ["owner create", () => call(auth, "POST", owner, { action: "create", name: "Widget", kind: "model" })],
    ["owner invite", () => call(auth, "POST", owner, { action: "invite", name: "Ivy", kind: "helper", pin: "4141" })],
    ["owner approve", () => call(auth, "POST", owner, { action: "approve", id: "p_hsd_olly" })],
    ["owner remove", () => call(auth, "POST", owner, { action: "remove", id: (ws.people.find((p) => p.name === "Ivy") || {}).id })]
  ];
  for (const [site, run] of ownerSites) {
    const r = await run();
    const lists = allPeople(r.body);
    const t = JSON.stringify(lists);
    const missing = everyEmail.filter((e) => t.indexOf(e) < 0);
    const hasAcctField = lists.some((l) => l.some((p) => p && Object.prototype.hasOwnProperty.call(p, "accountId")));
    ok(r.statusCode < 300 && lists.length > 0 && missing.length === 0 && (!hasAcctField || t.indexOf("acct_hsd_olly_typed") >= 0), "[owner] " + site + " " + r.statusCode + ": full seat list, every email and accountId (" + (missing.join(",") || "all there") + ")");
  }
  // An older owner seat with no accountId on it (Lex's legacy seat carries the account): still her desk.
  const ownerAcctId = ownerSeat.accountId; delete ownerSeat.accountId;
  const annEx = await call(acch, "POST", { "x-workspace": A, "x-session": annPwTok }, { action: "export" }, {}, "/api/account");
  if (ownerAcctId) ownerSeat.accountId = ownerAcctId;
  const annExT = JSON.stringify(annEx.body && annEx.body.pack && annEx.body.pack.desks || []);
  ok(annEx.statusCode === 200 && everyEmail.every((e) => annExT.indexOf(e) >= 0) && annExT.indexOf("acct_hsd_olly_typed") >= 0, "[owner] /api/account export of her own desk: full seat list (" + annEx.statusCode + ")");
  const ownAdm = await call(admin, "GET", owner, null, {}, "/api/admin");
  ok(ownAdm.body.shop && ownAdm.body.shop.id === acctA && ownAdm.body.account.shop && ownAdm.body.account.shop.id === acctA, "[owner] /api/admin still shows her desk account id");
  const book = await call(admin, "GET", owner, null, { who: "Olly" }, "/api/admin?who=Olly");
  ok(book.body.person && book.body.person.email === EMAIL.olly && book.body.person.phone === S("p_hsd_olly").phone, "[owner] person book still shows the seat's email and phone");
  const ownMine = await call(admin, "POST", owner, { action: "mine" }, {}, "/api/admin");
  ok(ownMine.statusCode === 200 && ownMine.body.you && ownMine.body.you.email === EMAIL.owner && !ownMine.body.you.pin, "[owner] admin mine: her seat with her email, never the raw row");
  const newDesk = await call(auth, "POST", {}, { action: "open", slug: "hsd-new", biz: "hsd-new", name: "Nia", pin: "2424", email: "nia.plant.hsd@x.test" });
  ok(newDesk.statusCode === 201 && newDesk.body.workspace.people[0].email === "nia.plant.hsd@x.test" && newDesk.body.you.email === "nia.plant.hsd@x.test", "[owner] opening a new desk still shows her own seat in full");

  // The notes thread on a person sheet: only the seat itself and the owner read it.
  S("p_hsd_olly").thread = [{ from: "Ann", text: "SECRET-OLLY-THREAD", at: now }];
  S("p_hsd_hal").thread = [{ from: "Ann", text: "SECRET-HAL-THREAD", at: now }];
  S("p_hsd_lex").thread = [{ from: "Ann", text: "SECRET-LEX-THREAD", at: now }];
  const sheet = async (hd, id, post) => post ? call(admin, "POST", hd, { action: "person", id }, {}, "/api/admin") : call(admin, "GET", hd, null, { seat: id }, "/api/admin?seat=" + id);
  const hasT = (r, tag) => JSON.stringify(r && r.body == null ? "" : r.body).indexOf("SECRET-" + tag + "-THREAD") >= 0;
  for (const [tag, hd, own] of [["Hal (proven)", { "x-workspace": A, "x-session": halTok }, "HAL"], ["Olly session", { "x-workspace": A, "x-session": ollyTok }, "OLLY"], ["Olly X-Pin", { "x-workspace": A, "x-pin": "7171" }, "OLLY"], ["Lex", { "x-workspace": A, "x-session": lexTok }, "LEX"], ["Sam (staff)", { "x-workspace": A, "x-session": samTok }, ""], ["Desk Bot", { "x-workspace": A, "x-session": botTok }, ""]]) {
    for (const [other, id] of [["OLLY", "p_hsd_olly"], ["HAL", "p_hsd_hal"], ["LEX", "p_hsd_lex"]]) {
      if (other === own) continue;
      for (const post of [false, true]) {
        const r = await sheet(hd, id, post);
        ok(!hasT(r, other) && !(r.body && Array.isArray(r.body.thread) && r.body.thread.length), "[thread " + tag + "] " + (post ? "POST person" : "GET ?seat=") + " " + id + ": no notes thread of another seat (" + r.statusCode + ")");
      }
    }
    if (own) {
      const id = { OLLY: "p_hsd_olly", HAL: "p_hsd_hal", LEX: "p_hsd_lex" }[own];
      const r = await sheet(hd, id, false);
      ok(r.statusCode === 200 && hasT(r, own), "[thread " + tag + "] her own sheet still has her own notes thread (" + r.statusCode + ")");
    }
  }
  for (const [tag, hd] of [["desk code", owner], ["email + password", { "x-workspace": A, "x-session": annPwTok }]]) {
    for (const [who, id] of [["OLLY", "p_hsd_olly"], ["HAL", "p_hsd_hal"]]) {
      const r = await sheet(hd, id, false);
      ok(r.statusCode === 200 && hasT(r, who), "[thread owner " + tag + "] the owner reads " + id + "'s notes thread (" + r.statusCode + ")");
    }
  }

  // Two seats both named Sam (#372 person sheet): looked up by seat id, cards credited by seat id.
  // Same-name seats never see each other's seats or cards. A legacy card that stores no seat id
  // counts by name only when that name is on exactly one seat of its desk.
  const SD = "hsd-sams", SD2 = "hsd-sams2";
  const so = await call(auth, "POST", {}, { action: "open", slug: SD, biz: SD, name: "Tess", pin: "6060" });
  const so2 = await call(auth, "POST", {}, { action: "open", slug: SD2, biz: SD2, name: "Ray", pin: "6363" });
  ok(so.statusCode === 201 && so2.statusCode === 201, "[sams setup] two desks open (" + so.statusCode + "/" + so2.statusCode + ")");
  const sw = lib.mem.workspaces.find((w) => w && w.slug === SD);
  const sw2 = lib.mem.workspaces.find((w) => w && w.slug === SD2);
  sw.people.push(seat("p_sam_a", "Sam", "helper", "6161", "sam.a.hsd@x.test", "acct_sam_a"));
  sw.people.push(seat("p_sam_b", "sam", "helper", "6262", "sam.b.hsd@x.test", "acct_sam_b"));
  sw.people.push(seat("p_uma", "Uma", "helper", "6464", "uma.hsd@x.test", ""));
  sw2.people.push(seat("p_sam_x", "Sam", "helper", "6565", "sam.a.hsd@x.test", "acct_sam_a"));
  sw2.people.push(seat("p_sam_y", "Sam", "helper", "6666", "sam.y.hsd@x.test", "acct_sam_y"));
  const sjob = (id, ws2, extra) => Object.assign({ id, workspace: ws2, title: id + " card", status: "exception", step: "Do", createdAt: now, log: ["Captured"] }, extra);
  lib.mem.jobs.push(sjob("SA1", SD, { assignee: "Sam", assigneeId: "p_sam_a" }));
  lib.mem.jobs.push(sjob("SB1", SD, { whoTapped: "Sam", whoTappedId: "p_sam_b" }));
  lib.mem.jobs.push(sjob("SB2", SD, { assignee: "Sam", handedTo: { id: "p_sam_b", name: "Sam", kind: "helper" } }));
  lib.mem.jobs.push(sjob("SBC", SD, { assignee: "Sam", custom: { personId: "p_sam_b" } }));
  lib.mem.jobs.push(sjob("SAD", SD, { status: "shipped", doneAt: now, doneBy: "Sam", doneById: "p_sam_a", whoTapped: "Sam" }));
  lib.mem.jobs.push(sjob("SLEG", SD, { assignee: "Sam" }));
  lib.mem.jobs.push(sjob("SLEGT", SD, { whoTapped: "Sam", contactName: "Sam" }));
  lib.mem.jobs.push(sjob("ULEG", SD, { assignee: "Uma" }));
  lib.mem.jobs.push(sjob("SX1", SD2, { assignee: "Sam", assigneeId: "p_sam_x" }));
  lib.mem.jobs.push(sjob("SY1", SD2, { assignee: "Sam", assigneeId: "p_sam_y" }));
  lib.mem.jobs.push(sjob("SXLEG", SD2, { assignee: "Sam" }));
  const tess = { "x-workspace": SD, "x-pin": "6060" };
  const ids = (b) => ((b && b.cards) || []).map((c) => c.id).sort().join(",");
  const hist = (b) => ((b && b.history) || []).map((h) => h.title || "").join("|");
  const seatIds = (b) => ((b && b.seats) || []).map((s) => s.slug + "/" + s.id).sort().join(",");
  const bA = await call(admin, "GET", tess, null, { seat: "p_sam_a" }, "/api/admin?seat=p_sam_a");
  ok(bA.statusCode === 200 && seatIds(bA.body) === SD + "/p_sam_a", "[sams] owner ?seat=p_sam_a: only Sam A's seat (" + bA.statusCode + " " + seatIds(bA.body) + ")");
  ok(ids(bA.body) === "SA1", "[sams] owner ?seat=p_sam_a: only Sam A's open card by seat id, none of Sam B's and no ambiguous legacy card (" + ids(bA.body) + ")");
  ok(hist(bA.body).indexOf("SAD card") >= 0 && !/SB1|SB2|SBC|SLEG/.test(hist(bA.body)), "[sams] owner ?seat=p_sam_a: history has Sam A's done card and nothing of Sam B's (" + hist(bA.body).slice(0, 120) + ")");
  ok(bA.body.person && bA.body.person.email === "sam.a.hsd@x.test", "[sams] owner ?seat=p_sam_a: the person is Sam A");
  const bB = await call(admin, "GET", tess, null, { seat: "p_sam_b" }, "/api/admin?seat=p_sam_b");
  ok(bB.statusCode === 200 && seatIds(bB.body) === SD + "/p_sam_b" && ids(bB.body) === "SB1,SB2,SBC", "[sams] owner ?seat=p_sam_b: Sam B's seat and her cards by tap, hand-off and personId, none of Sam A's (" + seatIds(bB.body) + " " + ids(bB.body) + ")");
  ok(!/SA1|SAD/.test(hist(bB.body)) && bB.body.person && bB.body.person.email === "sam.b.hsd@x.test", "[sams] owner ?seat=p_sam_b: no Sam A history, the person is Sam B");
  const bAid = await call(admin, "GET", tess, null, { who: "Sam", id: "p_sam_a" }, "/api/admin?who=Sam&id=p_sam_a");
  ok(bAid.statusCode === 200 && seatIds(bAid.body) === SD + "/p_sam_a" && ids(bAid.body) === "SA1", "[sams] owner ?who=Sam&id=p_sam_a: the id wins (" + seatIds(bAid.body) + ")");
  const bName = await call(admin, "GET", tess, null, { who: "Sam" }, "/api/admin?who=Sam");
  ok(bName.statusCode === 409 && !bName.body.cards && !bName.body.seats && !bName.body.person, "[sams] owner ?who=Sam with two Sams: 409, no seat and no cards (" + bName.statusCode + ")");
  const pA = await call(admin, "POST", tess, { action: "person", id: "p_sam_a", name: "Sam", email: "sam.b.hsd@x.test", accountId: "acct_sam_b", desks: [{ slug: SD2, pin: "6363" }] }, {}, "/api/admin");
  ok(pA.statusCode === 200 && seatIds(pA.body) === [SD + "/p_sam_a", SD2 + "/p_sam_x"].sort().join(","), "[sams] POST person id=p_sam_a across two desks: Sam A's seats only (same account), not Sam B's by email/account hint, not Ray's other Sam (" + seatIds(pA.body) + ")");
  ok(ids(pA.body) === "SA1,SX1", "[sams] POST person id=p_sam_a across two desks: Sam A's cards on both desks; no Sam Y card and no legacy name-only card where two Sams sit (" + ids(pA.body) + ")");
  const pB = await call(admin, "POST", tess, { action: "person", id: "p_sam_b", name: "Sam", desks: [{ slug: SD2, pin: "6363" }] }, {}, "/api/admin");
  ok(pB.statusCode === 200 && seatIds(pB.body) === SD + "/p_sam_b" && ids(pB.body) === "SB1,SB2,SBC", "[sams] POST person id=p_sam_b across two desks: no other Sam's seat on the second desk (" + seatIds(pB.body) + " " + ids(pB.body) + ")");
  const pName = await call(admin, "POST", tess, { action: "person", name: "Sam", desks: [] }, {}, "/api/admin");
  ok(pName.statusCode === 409 && !pName.body.seats, "[sams] POST person by name only with two Sams: 409 (" + pName.statusCode + ")");
  const pDesk = await call(admin, "POST", tess, { action: "person", seat: "p_sam_x", desk: SD2, desks: [{ slug: SD2, pin: "6363" }] }, {}, "/api/admin");
  ok(pDesk.statusCode === 200 && seatIds(pDesk.body) === [SD + "/p_sam_a", SD2 + "/p_sam_x"].sort().join(","), "[sams] POST person seat=p_sam_x desk=" + SD2 + ": that seat, plus the same account's seat here (" + seatIds(pDesk.body) + ")");
  const pRay = await call(admin, "POST", tess, { action: "person", seat: "p_owner", desk: SD2, desks: [{ slug: SD2, pin: "6363" }] }, {}, "/api/admin");
  ok(pRay.statusCode === 200 && seatIds(pRay.body) === SD2 + "/p_owner" && pRay.body.person && pRay.body.person.name === "Ray", "[sams] POST person seat=p_owner desk=" + SD2 + ": the desk param picks Ray's owner seat (" + seatIds(pRay.body) + ")");
  const pOwn = await call(admin, "POST", tess, { action: "person", id: "p_owner", desks: [{ slug: SD2, pin: "6363" }] }, {}, "/api/admin");
  ok(pOwn.statusCode === 200 && seatIds(pOwn.body) === SD + "/p_owner", "[sams] POST person id=p_owner (every owner seat's id): this desk's owner only, not Ray's owner seat (" + seatIds(pOwn.body) + ")");
  // Sam A on his own seat never gets Sam B's cards; a name-only ask is refused for him too.
  const samA = { "x-workspace": SD, "x-pin": "6161" };
  const selfA = await call(admin, "GET", samA, null, { seat: "p_sam_a" }, "/api/admin?seat=p_sam_a");
  ok(selfA.statusCode === 200 && seatIds(selfA.body) === SD + "/p_sam_a" && ids(selfA.body) === "SA1" && JSON.stringify(selfA.body).indexOf("sam.b.hsd@x.test") < 0, "[sams] Sam A on his own seat: his seat and card only, nothing of Sam B (" + ids(selfA.body) + ")");
  const nameA = await call(admin, "GET", samA, null, { who: "Sam" }, "/api/admin?who=Sam");
  ok(nameA.statusCode === 409 && JSON.stringify(nameA.body).indexOf("SB1") < 0, "[sams] Sam A asking ?who=Sam: 409, no card (" + nameA.statusCode + ")");
  const samB = { "x-workspace": SD, "x-pin": "6262" };
  const selfB = await call(admin, "POST", samB, { action: "person", id: "p_sam_b", name: "Sam" }, {}, "/api/admin");
  ok(selfB.statusCode === 200 && ids(selfB.body) === "SB1,SB2,SBC" && JSON.stringify(selfB.body).indexOf("sam.a.hsd@x.test") < 0, "[sams] Sam B on her own seat: her cards only, nothing of Sam A (" + ids(selfB.body) + ")");
  // Legacy, name only: a unique name still counts; a missing seat id is 404.
  const bU = await call(admin, "GET", tess, null, { seat: "p_uma" }, "/api/admin?seat=p_uma");
  ok(bU.statusCode === 200 && ids(bU.body) === "ULEG", "[sams] legacy name-only card for a unique name (Uma) still counts by name (" + ids(bU.body) + ")");
  const bUn = await call(admin, "GET", tess, null, { who: "uma" }, "/api/admin?who=uma");
  ok(bUn.statusCode === 200 && seatIds(bUn.body) === SD + "/p_uma", "[sams] ?who=uma (one seat with that name) still opens her sheet (" + bUn.statusCode + ")");
  const bNo = await call(admin, "GET", tess, null, { seat: "p_nobody" }, "/api/admin?seat=p_nobody");
  ok(bNo.statusCode === 404, "[sams] unknown seat id: 404 (" + bNo.statusCode + ")");
  const bY = await call(admin, "POST", { "x-workspace": SD2, "x-pin": "6363" }, { action: "person", id: "p_sam_y" }, {}, "/api/admin");
  ok(bY.statusCode === 200 && ids(bY.body) === "SY1", "[sams] Ray's Sam Y: only her card; the legacy card on a desk with two Sams counts for neither (" + ids(bY.body) + ")");
  // New taps and hand-offs store the seat id; the sheet follows the id, not the name.
  lib.mem.jobs.push(sjob("SNEW", SD, {}));
  const tap = await call(jobs, "POST", samB, { action: "done", id: "SNEW" }, {}, "/api/jobs");
  const snew = lib.mem.jobs.find((j) => j.id === "SNEW");
  ok(tap.statusCode === 200 && snew.whoTappedId === "p_sam_b" && snew.doneById === "p_sam_b", "[sams] Sam B taps Done: the card stores her seat id (whoTappedId/doneById) (" + tap.statusCode + ")");
  const afterA = await call(admin, "GET", tess, null, { seat: "p_sam_a" }, "/api/admin?seat=p_sam_a");
  const afterB = await call(admin, "GET", tess, null, { seat: "p_sam_b" }, "/api/admin?seat=p_sam_b");
  ok(hist(afterB.body).indexOf("SNEW card") >= 0 && hist(afterA.body).indexOf("SNEW card") < 0, "[sams] Sam B's Done shows on her sheet only, not on Sam A's");
  lib.mem.jobs.push(sjob("SHAND", SD, {}));
  const hand = await call(jobs, "POST", tess, { action: "assign", id: "SHAND", to: "p_sam_a" }, {}, "/api/jobs");
  const shand = lib.mem.jobs.find((j) => j.id === "SHAND");
  ok(hand.statusCode === 200 && shand.assigneeId === "p_sam_a" && shand.handedTo && shand.handedTo.id === "p_sam_a", "[sams] owner hands a card to seat p_sam_a: the card stores that seat id (" + hand.statusCode + ")");
  const handName = await call(jobs, "POST", tess, { action: "assign", id: "SHAND", to: "Sam" }, {}, "/api/jobs");
  ok(handName.statusCode === 409 && shand.assigneeId === "p_sam_a", "[sams] handing by the name Sam with two Sams: 409, the card stays on Sam A (" + handName.statusCode + ")");
  const fields = require(path.join(root, "api/_fields"));
  const fj = { id: "FJ" };
  fields.assignIfKnown(fj, sw, { assignee: "Sam" });
  ok(!fj.assignee && !fj.assigneeId, "[sams] capture with assignee Sam (two Sams): nobody is assigned");
  fields.assignIfKnown(fj, sw, { assignee: "p_sam_b" });
  ok(fj.assignee === "sam" && fj.assigneeId === "p_sam_b", "[sams] capture with assignee p_sam_b: Sam B by seat id");
  fields.assignIfKnown(fj, sw, { assignee: "Uma" });
  ok(fj.assigneeId === "p_uma", "[sams] capture with a unique name (Uma): her seat id is stored");

  // Desk talk "Assign this to Sam" (intake.js matchPerson): with two Sams on the desk nobody is
  // picked; a unique name (Uma) is handed the card by seat id.
  const intake = require(path.join(root, "api/intake"));
  lib.mem.jobs.push(sjob("SIN1", SD, {}));
  lib.mem.jobs.push(sjob("SIN2", SD, {}));
  const ist = await call(intake, "POST", tess, { action: "start" }, {}, "/api/intake");
  const irow = lib.mem.intakes.find((i) => ist.body && ist.body.intake && i.id === ist.body.intake.id);
  ok(ist.statusCode === 201 && !!irow, "[sams intake] desk talk opens (" + ist.statusCode + ")");
  irow.jobId = "SIN1";
  const isam = await call(intake, "POST", tess, { action: "do", id: irow.id, text: "Assign this to Sam" }, {}, "/api/intake");
  const sin1 = lib.mem.jobs.find((j) => j.id === "SIN1");
  const lastMsg = (r) => { const m = (r.body && r.body.intake && r.body.intake.messages) || []; return (m[m.length - 1] || {}).text || ""; };
  ok(isam.statusCode === 200 && !sin1.assignee && !sin1.assigneeId && /Name someone already on People/.test(lastMsg(isam)), "[sams intake] \"Assign this to Sam\" with two Sams: nobody is assigned (" + isam.statusCode + " " + JSON.stringify(sin1.assigneeId || sin1.assignee || "") + ")");
  irow.jobId = "SIN2";
  const iuma = await call(intake, "POST", tess, { action: "do", id: irow.id, text: "Assign this to Uma" }, {}, "/api/intake");
  const sin2 = lib.mem.jobs.find((j) => j.id === "SIN2");
  ok(iuma.statusCode === 200 && sin2.assignee === "Uma" && sin2.assigneeId === "p_uma", "[sams intake] \"Assign this to Uma\" (one seat): handed to Uma by seat id (" + JSON.stringify(sin2.assigneeId || "") + ")");

  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  ok(pkg.indexOf("node scripts/check-helper-sees-display-only.js") >= 0, "package.json test runs this check");
  try { fs.rmSync(process.env.AIA_STORE_PATH, { force: true }); } catch (e) {}
}

// [name, file, find, replace, equivalent?]
const MUTANTS = [
  ["V1 viewSeat never trims (old full seat for everyone)", "api/_lib.js", "  if (viewer && isOwner(viewer)) return out;\n  const self", "  return out;\n  const self"],
  ["V2 owners trimmed too", "api/_lib.js", "  if (viewer && isOwner(viewer)) return out;\n  const self", "  const self"],
  ["V3 every viewer counts as the seat itself", "api/_lib.js", "const self = !!(viewer && raw && viewer.id && raw.id === viewer.id);", "const self = !!viewer;"],
  ["V4 other seats keep their email", "api/_lib.js", "shown.email = self ? out.email : \"\";", "shown.email = out.email;"],
  ["V5 own email dropped", "api/_lib.js", "shown.email = self ? out.email : \"\";", "shown.email = \"\";"],
  ["V6 own accountId without proof", "api/_lib.js", "shown.accountId = self && ownAccountId && out.accountId === ownAccountId ? out.accountId", "shown.accountId = self ? out.accountId"],
  ["V7 own proven accountId dropped", "api/_lib.js", "shown.accountId = self && ownAccountId && out.accountId === ownAccountId ? out.accountId", "shown.accountId = false ? out.accountId"],
  ["V8 wallet (money) in the display fields", "api/_lib.js", "\"handle\", \"at\"];", "\"handle\", \"at\", \"money\"];"],
  ["V9 others' accountId kept", "api/_lib.js", "shown.accountId = self && ownAccountId && out.accountId === ownAccountId ? out.accountId : \"\";", "shown.accountId = out.accountId;"],
  ["W1 publicWorkspace lists full seats", "api/auth.js", "people: libx.seatsFor(viewer, row.people, publicPerson, ownAccountId),", "people: (row.people || []).map(publicPerson),"],
  ["W2 GET /api/auth you is the full public seat", "api/auth.js", "      you: youOf(person, ownIdOf(person, row, req))", "      you: publicPerson(person)"],
  ["W3 GET /api/auth without the proven own account", "api/auth.js", "      workspace: publicWorkspace(row, person, ownIdOf(person, row, req)),\n      you: youOf(person, ownIdOf(person, row, req))", "      workspace: publicWorkspace(row, person),\n      you: youOf(person)"],
  ["W4 desk-code login lists as the owner", "api/auth.js", "        workspace: publicWorkspace(row, person),\n        you: youOf(person),", "        workspace: publicWorkspace(row, row.people[0]),\n        you: youOf(person),"],
  ["W5 desk-code login you is the full public seat", "api/auth.js", "        workspace: publicWorkspace(row, person),\n        you: youOf(person),", "        workspace: publicWorkspace(row, person),\n        you: publicPerson(person),"],
  ["W6 open-by-code lists as the owner", "api/auth.js", "workspace: publicWorkspace(row, match),", "workspace: publicWorkspace(row, row.people[0]),"],
  ["W7 open-by-code you is the full public seat", "api/auth.js", "        you: youOf(match),", "        you: publicPerson(match),"],
  ["W8 email login loses the viewer (owner trimmed)", "api/auth.js", "workspace: via.desk ? publicWorkspace(via.desk, via.person, via.account && via.account.id) : null,", "workspace: via.desk ? publicWorkspace(via.desk) : null,"],
  ["W9 owner invite reply loses the viewer", "api/auth.js", "        pending: !!made.pending,\n        workspace: publicWorkspace(row, person)", "        pending: !!made.pending,\n        workspace: publicWorkspace(row)"],
  ["W10 owner nouns reply loses the viewer", "api/auth.js", "nouns: saved.nouns, workspace: publicWorkspace(row, person) });", "nouns: saved.nouns, workspace: publicWorkspace(row) });"],
  ["W11 owner create reply loses the viewer", "api/auth.js", "        fields: made.fields,\n        workspace: publicWorkspace(row, person)", "        fields: made.fields,\n        workspace: publicWorkspace(row)"],
  ["W12 owner remove reply loses the viewer", "api/auth.js", "return res.status(200).json({ ok: true, workspace: publicWorkspace(row, person) });", "return res.status(200).json({ ok: true, workspace: publicWorkspace(row) });"],
  ["W13 owner approve reply loses the viewer", "api/auth.js", "person: made.person, workspace: publicWorkspace(row, person) });", "person: made.person, workspace: publicWorkspace(row) });"],
  ["W14 new desk open loses the viewer", "api/auth.js", "workspace: publicWorkspace(row, owner),", "workspace: publicWorkspace(row),"],
  ["A1 /api/admin people full", "api/_account.js", "people: row ? lib.seatsFor(person, row.people, lib.publicPerson, ownAccountId) : [],", "people: row ? (row.people || []).map(lib.publicPerson) : [],"],
  ["A2 /api/admin you full", "api/_account.js", "you: lib.viewSeat(lib.publicPerson(person), person, person, ownAccountId),", "you: lib.publicPerson(person),"],
  ["A3 /api/admin shop id for everyone", "api/_account.js", "shop: shop ? (owner ? {", "shop: shop ? (true ? {"],
  ["A4 /api/admin account.shop untrimmed", "api/_account.js", "  if (!owner && account && account.shop) account.shop = { name: account.shop.name };\n", ""],
  ["A5 /api/admin without the proven own account", "api/admin.js", "const snap = accountSnapshot(row, person, ownAcc && ownAcc.id);", "const snap = accountSnapshot(row, person);"],
  ["A6 person book untrimmed", "api/admin.js", "person: Object.assign({}, viewSeat(publicPerson(first), first, viewer) || {},", "person: Object.assign({}, publicPerson(first) || {},"],
  ["A7 person book phone for everyone", "api/admin.js", "{ phone: isOwner(viewer) || (viewer && viewer.id === first.id) ? first.phone || \"\" : \"\",", "{ phone: first.phone || \"\","],
  ["A8 person book viewer full", "api/admin.js", "viewer: viewSeat(publicPerson(viewer), viewer, viewer),", "viewer: publicPerson(viewer),"],
  ["A9 admin mine you is the raw row", "api/admin.js", "you: viewSeat(publicPerson(person), person, person, ownAcc && ownAcc.id), owned", "you: person, owned"],
  ["A10 admin mine without the proven own account", "api/admin.js", "you: viewSeat(publicPerson(person), person, person, ownAcc && ownAcc.id), owned", "you: viewSeat(publicPerson(person), person, person), owned"],
  ["J1 /api/jobs people full", "api/jobs.js", "people: shop ? require(\"./_lib\").seatsFor(person, shop.people, publicPerson) : [],", "people: shop ? (shop.people || []).map(publicPerson) : [],"],
  ["D1 publicDesk people full", "api/_desk.js", "people: (owner || explore) ? lib.seatsFor(person, row.people, perms.publicPerson) :", "people: (owner || explore) ? (row.people || []).map(perms.publicPerson) :"],
  ["D2 publicDesk you full", "api/_desk.js", "you: lib.viewSeat(perms.publicPerson(person), person, person),", "you: perms.publicPerson(person),"],
  ["D3 exportDesk people full", "api/_desk.js", "    rules: lib.ensureRules(row),\n    people: lib.seatsFor(person, row.people, perms.publicPerson),\n    counts:", "    rules: lib.ensureRules(row),\n    people: (row.people || []).map(perms.publicPerson),\n    counts:"],
  ["D4 exploreDesk people full", "api/_desk.js", "    rules: lib.ensureRules(row),\n    people: lib.seatsFor(person, row.people, perms.publicPerson),\n    events:", "    rules: lib.ensureRules(row),\n    people: (row.people || []).map(perms.publicPerson),\n    events:"],
  ["D5 export without the viewer (owner trimmed)", "api/_desks-http.js", "pack: exportDesk(row, person) });", "pack: exportDesk(row) });"],
  ["D6 /api/desks mine you is the raw row", "api/_desks-http.js", "you: lib.viewSeat(lib.publicPerson(person), person, person, acc && acc.id),", "you: person,"],
  ["X1 world invite (already on desk) full seat", "api/_world-people.js", "alreadyOnDesk: true, person: lib.viewSeat(lib.publicPerson(existing), existing, actor) };", "alreadyOnDesk: true, person: lib.publicPerson(existing) };"],
  ["X2 world invite (already asked) full seat", "api/_world-people.js", "pending: true, person: lib.viewSeat(lib.publicPerson(existing), existing, actor) };", "pending: true, person: lib.publicPerson(existing) };"],
  ["E1 account export: every desk counted as owned", "api/_account-http.js", "const owns = !!(acc && (row.accountId === acc.id || (acc.desks || []).indexOf(row.slug) >= 0));", "const owns = true;"],
  ["E2 account export: own seat not found (own email lost)", "api/_account-http.js", "find((p) => p && acc && p.accountId && p.accountId === acc.id) || null", "find(() => false) || null"],
  ["P1 person sheet ignores the seat id (name lookup)", "api/admin.js", "  if (want.id) {\n    const order", "  if (false) {\n    const order"],
  ["P2 name lookup takes the first of two same-name seats", "api/admin.js", "if (named.length === 1) return { row, seat: named[0] };", "if (named.length >= 1) return { row, seat: named[0] };"],
  ["P3 other desks' seats by name, not account", "api/admin.js", "if (seat && String(seat.accountId || \"\") === acct) seats.push(", "if (seat && lower(seat.name) === lower(found.seat.name)) seats.push("],
  ["P4 cards by name even when a seat id is stored", "api/admin.js", "  if (ids.length) return ids.indexOf(String(seat.id)) >= 0;\n", ""],
  ["P5 legacy name-only card without the one-seat rule", "api/admin.js", "  if (named.length !== 1 || named[0] !== seat) return false;\n", ""],
  ["P6 hand-off seat id not read", "api/admin.js", "[custom.personId, job && job.handedTo && job.handedTo.id]", "[custom.personId]"],
  ["P7 whoTappedId not read", "api/admin.js", "  [\"whoTapped\", \"whoTappedId\"],\n", ""],
  ["P8 doneById not read", "api/admin.js", "[\"doneBy\", \"doneById\"]", "[\"doneBy\", \"doneByX\"]"],
  ["P9 custom.personId not read", "api/admin.js", "[custom.personId, job && job.handedTo", "[job && job.handedTo"],
  ["P10 taps do not store the seat id", "api/jobs.js", "return (person && person.id) ? String(person.id) : \"\";", "return \"\";"],
  ["P11 hand-off does not store assigneeId", "api/_handoff.js", "  job.assigneeId = who.id || \"\";\n", ""],
  ["P12 seatFor takes the first same-name seat", "api/_fields.js", "return named.length === 1 ? named[0] : null;", "return named[0] || null;"],
  ["P13 assign by a shared name is not refused", "api/jobs.js", "        return res.status(409).json({ error: \"More than one seat has that name. Hand it by seat id.\", job });\n", ""],
  ["P14 a seat id is looked up on every desk at once (p_owner)", "api/admin.js", "const order = byDesk.length ? byDesk : [rows.find((r) => r.slug === currentSlug)].filter(Boolean);", "const order = byDesk.length ? byDesk : [];"],
  ["P15 GET ignores ?seat", "api/admin.js", "seat: q.seat || q.id || q.personId || \"\",", "seat: q.id || q.personId || \"\","],
  ["P16 desk param ignored", "api/admin.js", "desk: slugify(typeof hint.desk === \"string\" ? hint.desk : (typeof hint.seatDesk === \"string\" ? hint.seatDesk : \"\")),", "desk: \"\","],
  ["P17 assignIfKnown stores no assigneeId", "api/_fields.js", "  job.assigneeId = whoPerson.id || \"\";\n", ""],
  ["A11 person book thread for every viewer", "api/admin.js", "thread: isOwner(viewer) || (viewer && viewer.id === first.id) ? (first.thread || []).slice(-40) : [],", "thread: (first.thread || []).slice(-40),"],
  ["A12 person book thread for nobody (own and owner lost)", "api/admin.js", "thread: isOwner(viewer) || (viewer && viewer.id === first.id) ? (first.thread || []).slice(-40) : [],", "thread: [],"],
  ["I1 desk talk hands the card to the first of two Sams", "api/intake.js", "return hit && !require(\"./_fields\").seatNameShared(people, hit) ? hit : null;", "return hit;"],
  ["I2 desk talk assign stores no seat id", "api/intake.js", "      job.assigneeId = whoPerson.id || \"\";\n", ""],
  ["E3 account export: owned desks trimmed", "api/_account-http.js", "const owns = !!(acc && (row.accountId === acc.id || (acc.desks || []).indexOf(row.slug) >= 0));", "const owns = false;"]
];
function runMutants() {
  const { spawnSync } = require("child_process");
  const skip = new Set([".git", "node_modules"]);
  const copy = (src, dst) => { fs.mkdirSync(dst, { recursive: true }); for (const e of fs.readdirSync(src, { withFileTypes: true })) { if (skip.has(e.name)) continue; const s = path.join(src, e.name), d = path.join(dst, e.name); if (e.isDirectory()) copy(s, d); else if (e.isFile()) fs.copyFileSync(s, d); } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aia-hsd-mut-"));
  copy(root, dir);
  if (fs.existsSync(path.join(root, "node_modules"))) fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
  const run = () => { const h = fs.mkdtempSync(path.join(os.tmpdir(), "aia-hsd-home-")); return spawnSync(process.execPath, [path.join(dir, "scripts/check-helper-sees-display-only.js")], { cwd: dir, env: { PATH: process.env.PATH || "", HOME: h, TMPDIR: h }, encoding: "utf8", timeout: 120000 }); };
  const base = run();
  if (base.status !== 0) { console.error("unmutated check fails in the copy:\n" + (base.stdout + base.stderr).slice(-2000)); process.exit(1); }
  let caught = 0, total = 0, eq = 0, bad = 0;
  for (const [name, file, find, repl, equivalent] of MUTANTS) {
    const p = path.join(dir, file); const orig = fs.readFileSync(p, "utf8");
    if (orig.indexOf(find) < 0) { console.log(name + " | ANCHOR GONE"); bad += 1; continue; }
    fs.writeFileSync(p, orig.replace(find, repl));
    const r = run(); fs.writeFileSync(p, orig);
    const first = ((r.stdout || "") + (r.stderr || "")).split("\n").find((l) => l.indexOf("FAIL") === 0) || "";
    if (equivalent) { eq += 1; console.log(name + " | " + (r.status ? "CAUGHT" : "survived") + " (equivalent, not scored)"); continue; }
    total += 1;
    if (r.status) { caught += 1; console.log(name + " | CAUGHT | " + first.slice(0, 160)); } else console.log(name + " | SURVIVED");
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("SCORE " + caught + "/" + total + " caught (" + eq + " equivalent not scored" + (bad ? ", " + bad + " anchors gone" : "") + ")");
  process.exit(caught === total && !bad ? 0 : 1);
}

if (MUTATE) runMutants();
else main().then(() => {
  if (failed) { console.error("check-helper-sees-display-only: " + failed + " failed"); process.exit(1); }
  console.log("check-helper-sees-display-only: ok");
  process.exit(0);
}).catch((e) => { console.error("FAIL crash " + (e && e.stack || e)); process.exit(1); });
