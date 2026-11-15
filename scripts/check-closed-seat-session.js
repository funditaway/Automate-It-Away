#!/usr/bin/env node
require("./_env-guard");
// Proves a closed or removed seat's session is nobody on its desk, and a closed seat's password proves nothing:
// 1. A removed co-owner's live desk-code session (it carries the desk's account) never lands on the owner seat
//    by account or email: nobody, and it cannot invite (store unchanged). A removed helper stays nobody.
// 2. A legacy owner seat with no account stays the owner for the owner's account session while a co-owner with
//    her own account is denied.
// 3. Email + password for an account whose own seat is denied or waiting is refused (403, no session, no write)
//    and never maps to the open co-owner's seat.
// 4. A closed owner seat without the session's account (legacy data) gives nobody: no other owner seat, no made-up owner.
// 5. A seat left in people[] with status "removed" is shut: its pin and its leftover session are nobody and
//    cannot change desk rules (403, no write), the same as a spliced-out seat; its plain GET /api/admin
//    read is exactly a stranger's (no people, no presence).
// 6. Ways back in stay shut: an opener seat taken out of people[] by hand cannot use its old code (the desk
//    code) to land on a co-owner's seat; another desk's owner session is nobody here; a padded or trimmed
//    code, the owner's name or email is not a code. Every refused rules write runs with the owner's talk
//    draft in the store and its reply carries no part of it.
// The owner's own desk code and session keep working; owners still deny/remove helpers; a co-owner still denies
// another co-owner. Runs the real handlers against a temp store. No network.
const os = require("os");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-closed-seat-session-" + Date.now() + "-" + process.pid + ".json");
delete global.__aia;
delete global.__aiaHydrate;

let failed = 0;
let asserts = 0;
function fail(msg) { console.error("FAIL " + msg); failed += 1; process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }
function ok(cond, msg) { asserts += 1; if (cond) pass(msg); else fail(msg); }

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
async function call(handler, method, headers, body, url) {
  const res = mockRes();
  await handler({ method, headers: headers || {}, body: body || {}, query: {}, url: url || "/api/admin" }, res);
  return res;
}
const tick = () => new Promise((r) => setTimeout(r, 3));

async function main() {
  const auth = require(path.join(root, "api/auth"));
  const admin = require(path.join(root, "api/admin"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();
  const STORE = process.env.AIA_STORE_PATH;
  const bytes = () => { try { return fs.readFileSync(STORE); } catch (e) { return Buffer.from("<none>"); } };
  // Reading a session slides its seenAt/expiresAt in memory; mask only those.
  const memSnap = () => JSON.stringify(lib.mem, (k, v) => (k === "seenAt" || k === "expiresAt" ? undefined : v));
  const W = (s) => lib.mem.workspaces.find((w) => w && w.slug === s);
  const rowOf = (tok) => lib.findSession(tok, { slide: false });
  async function open(slug, name, pin, email) {
    const r = await call(auth, "POST", { "x-workspace": slug }, { action: "open", slug, biz: slug, name, pin, email }, "/api/auth");
    const t = r.body && r.body.session && r.body.session.token;
    if (r.statusCode !== 201 || !t) throw new Error("open " + slug + " " + r.statusCode + " " + JSON.stringify(r.body));
    return t;
  }
  const pinLogin = async (slug, pin) => { const r = await call(auth, "POST", {}, { action: "login", workspace: slug, pin }, "/api/auth"); return { code: r.statusCode, tok: r.body && r.body.session && r.body.session.token }; };
  const inv = async (slug, pin, name, np, kind) => { await tick(); const r = await call(admin, "POST", { "x-workspace": slug, "x-pin": pin }, { action: "invite", name, pin: np, kind }); return r.body && r.body.person && r.body.person.id; };
  const who = (tok, slug) => {
    const r = lib.personOf({ headers: { "x-session": tok, "x-workspace": slug } }, slug);
    return r.person ? r.person.id + (lib.isOwner(r.person) ? "(owner)" : "") : (r.denied ? "denied" : r.pending ? "pending" : "none");
  };
  // A refused request: status in `codes`, no write to the store file or memory.
  async function noWrite(tag, handler, url, headers, body, codes) {
    await lib.save();
    const b0 = bytes();
    const m0 = memSnap();
    const r = await call(handler, "POST", headers, body, url);
    ok(codes.indexOf(r.statusCode) >= 0, tag + ": refused " + codes.join("/") + " (got " + r.statusCode + ")");
    ok(Buffer.compare(b0, bytes()) === 0, tag + ": store file byte-unchanged");
    ok(memSnap() === m0, tag + ": in-memory store byte-unchanged (session seenAt/expiresAt slide aside)");
    return r;
  }

  // 1. Removed co-owner.
  const S = "css-ola";
  const olaTok = await open(S, "Ola", "1111", "ola@css.test");
  const ws = W(S);
  const danId = await inv(S, "1111", "Dan", "4444", "owner");
  const dan = await pinLogin(S, "4444");
  ok(dan.code === 200 && who(dan.tok, S) === danId + "(owner)", "[1 setup] co-owner Dan signs in with his desk code (" + who(dan.tok, S) + ")");
  const danRow = rowOf(dan.tok);
  ok(!!danRow && !!danRow.accountId, "[1 setup] Dan's desk-code session carries the desk's account");
  const rm = await call(admin, "POST", { "x-workspace": S, "x-pin": "1111" }, { action: "remove", id: danId });
  ok(rm.statusCode === 200 && !ws.people.some((p) => p.id === danId), "[1] Ola removes Dan (" + rm.statusCode + ")");
  ok(who(dan.tok, S) === "none", "[1] removed co-owner's old session is nobody, not the owner seat (got " + who(dan.tok, S) + ")");
  const seats = ws.people.length;
  await noWrite("[1 admin invite owner, removed co-owner session]", admin, "/api/admin", { "x-workspace": S, "x-session": dan.tok }, { action: "invite", name: "Sneak", pin: "9393", kind: "owner" }, [401, 403]);
  await noWrite("[1 auth invite owner, removed co-owner session]", auth, "/api/auth", { "x-workspace": S, "x-session": dan.tok }, { action: "invite", name: "Sneak", pin: "9393", kind: "owner" }, [401, 403]);
  await noWrite("[1 admin remove owner seat, removed co-owner session]", admin, "/api/admin", { "x-workspace": S, "x-session": dan.tok }, { action: "remove", id: "p_owner" }, [401, 403]);
  ok(ws.people.length === seats, "[1] no seat was added");
  const g = await call(admin, "GET", { "x-workspace": S, "x-session": dan.tok }, null);
  ok(g.statusCode >= 400, "[1] removed co-owner's session cannot read /api/admin (" + g.statusCode + ")");
  // Same removed session also carrying the owner's email (desk account email): still nobody.
  danRow.email = "ola@css.test";
  ok(who(dan.tok, S) === "none", "[1] removed co-owner's session with the desk's email is still nobody (got " + who(dan.tok, S) + ")");
  // A desk code alongside the stale session still proves itself.
  const both = lib.personOf({ headers: { "x-session": dan.tok, "x-workspace": S, "x-pin": "1111" } }, S);
  ok(!!both.person && lib.isOwner(both.person) && both.person.id === "p_owner", "[1] a valid desk code beside the stale session still opens its own seat");
  // Removed helper stays nobody.
  const halId = await inv(S, "1111", "Hal", "2222", "helper");
  const hal = await pinLogin(S, "2222");
  ok(who(hal.tok, S) === halId, "[1 setup] helper Hal signs in");
  const rmh = await call(admin, "POST", { "x-workspace": S, "x-session": olaTok }, { action: "remove", id: halId });
  ok(rmh.statusCode === 200 && who(hal.tok, S) === "none", "[1] owner removes helper Hal by session; his old session is nobody (" + rmh.statusCode + ")");
  // Owner keeps working; helpers deniable; co-owner can deny another co-owner.
  ok(who(olaTok, S) === "p_owner(owner)", "[1 after] Ola's own session is still the owner");
  const back = await pinLogin(S, "1111");
  ok(back.code === 200 && who(back.tok, S) === "p_owner(owner)", "[1 after] Ola's desk code still signs her in as owner");
  const hal2 = await inv(S, "1111", "Hal2", "2323", "helper");
  const dh = await call(admin, "POST", { "x-workspace": S, "x-session": olaTok }, { action: "deny", id: hal2 });
  ok(dh.statusCode === 200 && ws.people.find((p) => p.id === hal2).status === "denied", "[1 after] owner still denies a helper (" + dh.statusCode + ")");
  const coraId = await inv(S, "1111", "Cora", "3333", "owner");
  const eveId = await inv(S, "1111", "Eve", "3434", "owner");
  const cora = await pinLogin(S, "3333");
  const de = await call(admin, "POST", { "x-workspace": S, "x-session": cora.tok }, { action: "deny", id: eveId });
  ok(de.statusCode === 200 && ws.people.find((p) => p.id === eveId).status === "denied", "[1 after] co-owner Cora still denies co-owner Eve (" + de.statusCode + ")");
  const ad = await call(auth, "POST", { "x-workspace": S, "x-session": cora.tok }, { action: "approve", id: eveId }, "/api/auth");
  ok(ad.statusCode === 200, "[1 after] co-owner Cora approves Eve again on /api/auth (" + ad.statusCode + ")");
  ok(who(cora.tok, S) === coraId + "(owner)", "[1 after] Cora's live open seat is unchanged");
  // A denied co-owner's session stays denied (closed seat never falls through).
  await call(admin, "POST", { "x-workspace": S, "x-pin": "1111" }, { action: "deny", id: coraId });
  ok(who(cora.tok, S) === "denied", "[1] denied co-owner's session is denied, not the owner seat (got " + who(cora.tok, S) + ")");
  // Account-level owner ids name no seat: "<account>_owner" and legacy "owner" sessions still find the open owner seat.
  const olaRow = rowOf(olaTok);
  const acct = olaRow && olaRow.accountId;
  olaRow.personId = acct + "_owner";
  ok(who(olaTok, S) === "p_owner(owner)", "[1] account-level owner session (<account>_owner) is still the owner");
  olaRow.personId = "owner";
  ok(who(olaTok, S) === "p_owner(owner)", "[1] legacy owner session (personId owner) is still the owner");
  olaRow.personId = "p_owner";
  // On another desk the session still counts by its account's own open seat there (its seat id is not on that desk).
  const Y = "css-yan";
  await open(Y, "Yan", "6161", "yan@css.test");
  const wy = W(Y);
  wy.people.find((p) => p.id === "p_owner").id = "p_yan";
  wy.people.push({ id: "p_olahere", name: "Ola", role: "employee", status: "approved", accountId: acct, createdAt: "2026-01-02T00:00:00.000Z" });
  ok(who(olaTok, Y) === "p_olahere", "[1 control] Ola's session on another desk is her own open seat there (got " + who(olaTok, Y) + ")");
  // A session naming p_owner on a desk whose p_owner seat is gone is nobody too (never the other owner seat by account).
  const Q = "css-quinn";
  const qTok = await open(Q, "Quinn", "6262", "quinn@css.test");
  const wq = W(Q);
  wq.people.find((p) => p.id === "p_owner").id = "p_qlegacy";
  ok(who(qTok, Q) === "none", "[1] a session naming a p_owner seat no longer on its desk is nobody (got " + who(qTok, Q) + ")");

  // 2. Legacy owner seat (no account) open; co-owner with her OWN account denied; owner's account-level session.
  const S2 = "css-s21";
  const t2 = await open(S2, "Ola", "1212", "ola@s21css.test");
  const w2 = W(S2);
  const c2 = await inv(S2, "1212", "Cora", "3131", "owner");
  const c2Seat = w2.people.find((p) => p.id === c2);
  c2Seat.accountId = "acct_cora_own"; c2Seat.status = "denied";
  const own2 = w2.people.find((p) => p.id === "p_owner"); own2.accountId = ""; own2.email = "";
  const r2 = rowOf(t2); r2.personId = r2.accountId + "_owner";
  ok(who(t2, S2) === "p_owner(owner)", "[2 S21] owner's account session on a legacy owner seat stays owner while a co-owner with her own account is denied (got " + who(t2, S2) + ")");
  // S20: an open and a closed owner seat on the session's account: the open one.
  const S3 = "css-s20";
  const t3 = await open(S3, "Pia", "2121", "pia@s20css.test");
  const w3 = W(S3);
  const r3 = rowOf(t3); r3.personId = r3.accountId + "_owner";
  w3.people.unshift({ id: "p_oldown", name: "Pia old", role: "owner", kind: "owner", status: "denied", accountId: r3.accountId, pin: lib.hashPin("2929"), createdAt: "2026-01-01T00:00:00.000Z" });
  ok(who(t3, S3) === "p_owner(owner)", "[2 S20] account session with one open + one closed owner seat on its account is the open one (got " + who(t3, S3) + ")");

  // 3. Email + password for an account whose own seat is closed.
  const N = "css-wen";
  const wenTok = await open(N, "Wen", "7171", "");
  const wn = W(N);
  const kimId = await inv(N, "7171", "Kim", "7272", "owner");
  const pw = await call(auth, "POST", { "x-workspace": N, "x-session": wenTok }, { action: "password", password: "wen-pass-123456", email: "wen@css.test" }, "/api/auth");
  ok(pw.statusCode === 200, "[3 setup] Wen sets her account password (" + pw.statusCode + ")");
  const wenSeat = wn.people.find((p) => p.id === "p_owner");
  const emailLogin = (handler, url) => call(handler, "POST", {}, { action: "login", email: "wen@css.test", password: "wen-pass-123456" }, url);
  const okLogin = await emailLogin(auth, "/api/auth");
  ok(okLogin.statusCode === 200 && okLogin.body.session && okLogin.body.session.personId === "p_owner", "[3 control] open owner seat: email login is Wen's own seat (" + okLogin.statusCode + ")");
  const sessions0 = (lib.mem.sessions || []).length;
  for (const st of ["denied", "pending"]) {
    wenSeat.status = st;
    await call(auth, "POST", {}, { action: "login", email: "wen@css.test", password: "wrong-pass-000000" }, "/api/auth");
    const r = await noWrite("[3 " + st + " owner email login, /api/auth]", auth, "/api/auth", {}, { action: "login", email: "wen@css.test", password: "wen-pass-123456" }, [403]);
    ok(!(r.body && r.body.session) && r.body.ok === false, "[3 " + st + "] no session issued, not Kim's seat");
    const acctLib = require(path.join(root, "api/_account"));
    const via = acctLib.loginAccount("wen@css.test", "", { email: "wen@css.test", password: "wen-pass-123456" });
    ok(via.ok === false && via.status === 403 && !(via.person && via.person.id === kimId), "[3 " + st + "] account door (loginAccount) refuses too (" + via.status + ")");
  }
  ok((lib.mem.sessions || []).length === sessions0, "[3] refused email logins issued no session");
  // Legacy: the closed owner seat carries no account; the desk is Wen's.
  const keepAcct = wenSeat.accountId;
  wenSeat.accountId = ""; wenSeat.status = "denied";
  await noWrite("[3 legacy denied owner seat (no account) email login]", auth, "/api/auth", {}, { action: "login", email: "wen@css.test", password: "wen-pass-123456" }, [403]);
  // An old closed seat plus an open one on her account: the open one, login works.
  wenSeat.accountId = keepAcct; wenSeat.status = "approved";
  wn.people.push({ id: "p_wenold", name: "Wen old", role: "owner", kind: "owner", status: "denied", accountId: keepAcct, createdAt: "2026-01-01T00:00:00.000Z" });
  wn.people.unshift(wn.people.pop());
  const twice = await emailLogin(auth, "/api/auth");
  ok(twice.statusCode === 200 && twice.body.session.personId === "p_owner", "[3 control] a closed old seat beside her open seat does not refuse (" + twice.statusCode + ")");
  wn.people = wn.people.filter((p) => p.id !== "p_wenold");
  // A closed legacy owner seat on a desk that is not this account's own seat never refuses this account:
  // (a) her desk list still names desk V, now on another account, whose owner seat carries no account;
  // (b) desk V is on her account (attached) but its owner seat carries its own other account.
  const V = "css-vee";
  await open(V, "Vee", "6363", "vee@css.test");
  const wv = W(V);
  const wenAcc = (lib.mem.accounts || []).find((a) => a && a.email === "wen@css.test");
  const vSeat = wv.people.find((p) => p.id === "p_owner");
  const vAcct = wv.accountId;
  wenAcc.desks = (wenAcc.desks || []).concat([V]);
  vSeat.accountId = ""; vSeat.status = "denied";
  const va = await emailLogin(auth, "/api/auth");
  ok(va.statusCode !== 403, "[3] another account's desk in her list with a closed accountless owner seat does not refuse her (" + va.statusCode + ")");
  wenAcc.desks = wenAcc.desks.filter((d) => d !== V);
  wv.accountId = wenAcc.id; vSeat.accountId = vAcct || "acct_vee_own";
  const vb = await emailLogin(auth, "/api/auth");
  ok(vb.statusCode !== 403, "[3] a desk on her account whose closed owner seat holds another account does not refuse her (" + vb.statusCode + ")");
  wv.accountId = vAcct; vSeat.status = "approved";

  // 4. Closed owner seat without the session's account (legacy): nobody, never another or a made-up owner.
  const wenRow = rowOf(wenTok);
  wenRow.personId = wenRow.accountId + "_owner";
  ok(who(wenTok, N) === "p_owner(owner)", "[4 control] account-level session, open owner seat: owner");
  wenSeat.accountId = ""; wenSeat.status = "denied";
  ok(who(wenTok, N) === "none", "[4 B56] denied legacy owner seat + account session + open co-owner Kim: nobody (got " + who(wenTok, N) + ")");
  await noWrite("[4 B56 invite owner]", admin, "/api/admin", { "x-workspace": N, "x-session": wenTok }, { action: "invite", name: "Sneak", pin: "9494", kind: "owner" }, [401, 403]);
  wenSeat.status = "pending";
  ok(who(wenTok, N) === "none", "[4] waiting legacy owner seat + account session: nobody (got " + who(wenTok, N) + ")");
  // The desk's own owner seat is p_owner even when an open co-owner seat sits before it.
  wenSeat.status = "denied";
  wn.people = wn.people.filter((p) => p !== wenSeat).concat([wenSeat]);
  ok(who(wenTok, N) === "none", "[4] denied legacy p_owner listed after open co-owner Kim: still nobody (got " + who(wenTok, N) + ")");
  const Z = "css-zed";
  const zTok = await open(Z, "Zed", "8181", "zed@css.test");
  const zSeat = W(Z).people.find((p) => p.id === "p_owner");
  const zRow = rowOf(zTok);
  zRow.personId = zRow.accountId + "_owner"; zSeat.accountId = ""; zSeat.status = "denied";
  ok(who(zTok, Z) === "none", "[4 R3] denied legacy owner seat, no co-owner: nobody, not a made-up owner (got " + who(zTok, Z) + ")");
  await noWrite("[4 R3 invite owner]", admin, "/api/admin", { "x-workspace": Z, "x-session": zTok }, { action: "invite", name: "Sneak", pin: "9595", kind: "owner" }, [401, 403]);
  zRow.accountId = ""; zRow.personId = "owner";
  ok(who(zTok, Z) === "none", "[4 R4] legacy owner session without account, owner seat denied: nobody (got " + who(zTok, Z) + ")");
  zSeat.status = "approved";
  ok(who(zTok, Z) === "p_owner(owner)", "[4 control] same legacy session once the owner seat is open again: owner");
  // Legacy owner seat id (not p_owner), denied, beside an open co-owner: nobody.
  zSeat.id = "p_zlegacy"; zSeat.status = "denied";
  W(Z).people.push({ id: "p_zco", name: "Zoe", role: "owner", kind: "owner", status: "approved", createdAt: "2026-01-03T00:00:00.000Z" });
  ok(who(zTok, Z) === "none", "[4] denied legacy owner seat with a non-p_owner id + open co-owner: nobody (got " + who(zTok, Z) + ")");

  // 5. Removed seat left in people[] (legacy / hand-set / import) and who may read /api/rules.
  const rules = require(path.join(root, "api/rules"));
  // Every refused rules write runs with the owner's talk draft in the store, and its reply must carry no
  // part of it: not the text, not its when/then/contains/ifMoney fields alone, and no keys past ok/error.
  const TALK = { text: "Hold anything over $7 that says zebra", when: "upload", then: "stop", ifMoney: 7, contains: "zebra" };
  function replyClean(b) {
    const j = JSON.stringify(b || {});
    const keysOk = !!b && Object.keys(b).every((k) => k === "ok" || k === "error");
    const parts = [TALK.text, TALK.contains, "$7", '"' + TALK.when + '"', '"' + TALK.then + '"', TALK.when, '"when"', '"then"', '"contains"', '"ifMoney"', '"draft"'];
    return keysOk && b.ok === false && parts.every((x) => j.indexOf(x) < 0);
  }
  async function rulesNo(tag, handler, url, headers, body, codes) {
    const desk = W(headers["x-workspace"]);
    if (desk) desk.ruleDraft = JSON.parse(JSON.stringify(TALK));
    ok(!!desk && !!desk.ruleDraft && desk.ruleDraft.text === TALK.text, tag + ": precondition: the owner's talk draft is in the store");
    const r = await noWrite(tag, handler, url, headers, body, codes);
    ok(replyClean(r.body), tag + ": refused reply carries no part of the talk draft (text, when, then, contains, ifMoney)");
    ok(!!desk && !!desk.ruleDraft && desk.ruleDraft.text === TALK.text && desk.ruleDraft.when === TALK.when, tag + ": the owner's talk draft is untouched");
    if (desk) desk.ruleDraft = null;
    return r;
  }
  const R = "css-rules";
  const rTok = await open(R, "Ria", "5151", "ria@css.test");
  const wr = W(R);
  const ruleTexts = () => ((W(R).rules) || []).map((x) => x && x.text);
  const addRule = (headers, text) => call(rules, "POST", Object.assign({ "x-workspace": R }, headers), { text, when: "drop", then: "note", contains: "css" }, "/api/rules");
  const base = await addRule({ "x-pin": "5151" }, "Ria rule stays.");
  ok(base.statusCode === 201 && ruleTexts().indexOf("Ria rule stays.") >= 0, "[5 control] open owner adds a rule (" + base.statusCode + ")");
  const boId = await inv(R, "5151", "Bo", "5252", "owner");
  const bo = await pinLogin(R, "5252");
  ok(bo.code === 200 && who(bo.tok, R) === boId + "(owner)", "[5 setup] co-owner Bo signs in with his desk code (" + who(bo.tok, R) + ")");
  const boSeat = wr.people.find((p) => p.id === boId);
  boSeat.status = "removed";
  ok(wr.people.some((p) => p.id === boId && p.status === "removed"), "[5 setup] Bo's seat is still in people[] with status removed");
  const byPin = lib.personOf({ headers: { "x-workspace": R, "x-pin": "5252" } }, R);
  ok(!byPin.person && !byPin.pending && !byPin.denied, "[5] removed co-owner's own pin is nobody (not pending/denied, got " + (byPin.person ? byPin.person.id : "none") + ")");
  ok(who(bo.tok, R) === "none", "[5] removed co-owner's leftover session is nobody (got " + who(bo.tok, R) + ")");
  const n0 = ruleTexts().length;
  await rulesNo("[5 rules add, removed co-owner pin]", rules, "/api/rules", { "x-workspace": R, "x-pin": "5252" }, { text: "Removed pin wrote this.", when: "drop", then: "note", contains: "css" }, [403]);
  await rulesNo("[5 rules add, removed co-owner session]", rules, "/api/rules", { "x-workspace": R, "x-session": bo.tok }, { text: "Removed session wrote this.", when: "drop", then: "note", contains: "css" }, [403]);
  ok(ruleTexts().length === n0, "[5] no rule was added by the removed seat");
  // Plain desk read on GET /api/admin: a removed seat gets exactly what a stranger gets (no member read, no presence).
  const adminGet = (headers) => call(admin, "GET", Object.assign({ "x-workspace": R }, headers), null, "/api/admin");
  const strangerAdmin = await adminGet({});
  ok(strangerAdmin.statusCode >= 400 && strangerAdmin.body && strangerAdmin.body.ok === false, "[5 setup] stranger plain GET /api/admin is refused (" + strangerAdmin.statusCode + ")");
  const ownerAdmin = await adminGet({ "x-pin": "5151" });
  ok(ownerAdmin.statusCode === 200 && Array.isArray(ownerAdmin.body.people) && ownerAdmin.body.people.length > 0, "[5 control] open owner gets the 200 member read on GET /api/admin (" + ownerAdmin.statusCode + ")");
  const fresh = await pinLogin(R, "5252");
  const freshOk = !fresh.tok || who(fresh.tok, R) === "none";
  ok(freshOk, "[5] removed seat's desk code gives no session, or a fresh session that is nobody (code " + fresh.code + ")");
  const removedReads = [["pin", { "x-pin": "5252" }], ["leftover session", { "x-session": bo.tok }]];
  if (fresh.tok) removedReads.push(["fresh session", { "x-session": fresh.tok }]);
  for (const rr of removedReads) {
    const g = await adminGet(rr[1]);
    ok(g.statusCode === strangerAdmin.statusCode && JSON.stringify(g.body) === JSON.stringify(strangerAdmin.body), "[5 admin GET removed " + rr[0] + "] same reply as a stranger (" + g.statusCode + ")");
    ok(!!g.body && !("presence" in g.body) && !("people" in g.body) && JSON.stringify(g.body).indexOf("presence") < 0, "[5 admin GET removed " + rr[0] + "] no member read, no presence field");
  }
  for (const st of ["pending", "denied"]) {
    boSeat.status = st;
    await rulesNo("[5 rules add, " + st + " co-owner pin]", rules, "/api/rules", { "x-workspace": R, "x-pin": "5252" }, { text: st + " wrote this.", when: "drop", then: "note", contains: "css" }, [403]);
  }
  boSeat.status = "removed";
  // The desk's own owner seat marked removed: its pin, the desk code, and its session are nobody; no write.
  const R2 = "css-rules-sole";
  const r2Tok = await open(R2, "Sol", "5353", "sol@css.test");
  const add2 = await call(rules, "POST", { "x-workspace": R2, "x-pin": "5353" }, { text: "Sol rule.", when: "drop", then: "note", contains: "css" }, "/api/rules");
  ok(add2.statusCode === 201, "[5 control] sole owner adds a rule while open (" + add2.statusCode + ")");
  const solSeat = W(R2).people.find((p) => p.id === "p_owner");
  solSeat.status = "removed";
  ok(who(r2Tok, R2) === "none", "[5] removed sole owner's session is nobody (got " + who(r2Tok, R2) + ")");
  await rulesNo("[5 rules add, removed sole owner pin]", rules, "/api/rules", { "x-workspace": R2, "x-pin": "5353" }, { text: "Removed sole pin.", when: "drop", then: "note", contains: "css" }, [403]);
  await rulesNo("[5 rules add, removed sole owner session]", rules, "/api/rules", { "x-workspace": R2, "x-session": r2Tok }, { text: "Removed sole session.", when: "drop", then: "note", contains: "css" }, [403]);
  solSeat.status = "approved";
  const solBack = await call(rules, "POST", { "x-workspace": R2, "x-session": r2Tok }, { text: "Sol is back.", when: "drop", then: "note", contains: "css" }, "/api/rules");
  ok(solBack.statusCode === 201, "[5 control] same session once the seat is open again adds a rule (" + solBack.statusCode + ")");
  // Ria (still open) keeps writing while a removed co-owner sits in people[].
  const still = await addRule({ "x-session": rTok }, "Ria still writes.");
  ok(still.statusCode === 201 && ruleTexts().indexOf("Ria still writes.") >= 0, "[5 control] open owner session still adds a rule beside a removed seat (" + still.statusCode + ")");

  // An old removed owner seat on the session's account beside her open one: the open one (as S20 for denied).
  const R3 = "css-rules-s20";
  const t5 = await open(R3, "Uma", "5656", "uma@css.test");
  const w5 = W(R3);
  const r5 = rowOf(t5); r5.personId = r5.accountId + "_owner";
  w5.people.unshift({ id: "p_umaold", name: "Uma old", role: "owner", kind: "owner", status: "removed", accountId: r5.accountId, pin: lib.hashPin("5757"), createdAt: "2026-01-01T00:00:00.000Z" });
  ok(who(t5, R3) === "p_owner(owner)", "[5 S20] account session with one open + one removed owner seat on its account is the open one (got " + who(t5, R3) + ")");
  const old5 = await call(rules, "POST", { "x-workspace": R3, "x-pin": "5757" }, { text: "Old removed pin.", when: "drop", then: "note", contains: "css" }, "/api/rules");
  ok(old5.statusCode === 403 && !((w5.rules || []).some((x) => x && x.text === "Old removed pin.")), "[5 S20] the removed old seat's own pin cannot add a rule (" + old5.statusCode + ")");

  // 6. Ways back in that must stay shut (all refused writes keep the store byte-unchanged).
  // 6a. Opener seat taken out of people[] by hand (legacy / import): its old code is still the desk code
  //     (ws.pin). It must not open the co-owner's seat, write rules, read /api/admin, or sign in.
  const H = "css-splice";
  const hTok = await open(H, "Ann", "6060", "ann@splice.test");
  const hBoId = await inv(H, "6060", "Bo", "6161", "owner");
  const hw = W(H);
  hw.people = hw.people.filter((p) => p.id !== "p_owner");
  ok(!hw.people.some((p) => p.id === "p_owner") && hw.pin === lib.hashPin("6060"), "[6a setup] opener seat is out of people[]; the desk code is still her old code");
  const hPin = lib.personOf({ headers: { "x-workspace": H, "x-pin": "6060" } }, H);
  ok(!hPin.person && !hPin.pending && !hPin.denied, "[6a] spliced opener's old code (the desk code) is nobody, not co-owner Bo (got " + (hPin.person ? hPin.person.id : "none") + ")");
  ok(who(hTok, H) === "none", "[6a] spliced opener's leftover session is nobody (got " + who(hTok, H) + ")");
  await rulesNo("[6a rules add, spliced opener old code]", rules, "/api/rules", { "x-workspace": H, "x-pin": "6060" }, { text: "Spliced code wrote this.", when: "drop", then: "note", contains: "css" }, [403]);
  await rulesNo("[6a rules add, spliced opener session]", rules, "/api/rules", { "x-workspace": H, "x-session": hTok }, { text: "Spliced session wrote this.", when: "drop", then: "note", contains: "css" }, [403]);
  const hStr = await call(admin, "GET", { "x-workspace": H }, null, "/api/admin");
  const hGet = await call(admin, "GET", { "x-workspace": H, "x-pin": "6060" }, null, "/api/admin");
  ok(hGet.statusCode === hStr.statusCode && JSON.stringify(hGet.body) === JSON.stringify(hStr.body), "[6a] spliced opener's old code reads /api/admin exactly as a stranger (" + hGet.statusCode + ")");
  const hLogin = await pinLogin(H, "6060");
  ok(!hLogin.tok, "[6a] spliced opener's old code signs in to nothing (" + hLogin.code + ")");
  const hBo = await call(rules, "POST", { "x-workspace": H, "x-pin": "6161" }, { text: "Bo still writes.", when: "drop", then: "note", contains: "css" }, "/api/rules");
  ok(hBo.statusCode === 201, "[6a control] co-owner Bo's own code still adds a rule (" + hBo.statusCode + ")");
  // Control: on a normal desk the desk code still opens the owner seat (desk code == owner code).
  const G = "css-deskcode";
  await open(G, "Gus", "6262", "gus@deskcode.test");
  const gWho = lib.personOf({ headers: { "x-workspace": G, "x-pin": "6262" } }, G);
  ok(!!gWho.person && gWho.person.id === "p_owner" && lib.isOwner(gWho.person), "[6a control] the desk code still opens the desk's own owner seat");
  // 6b. Another desk's owner session (desk-code and opener sessions) on this desk: nobody, no write.
  const O = "css-other";
  const oTok = await open(O, "Oz", "6363", "oz@other.test");
  const oPin = await pinLogin(O, "6363");
  for (const t of [["opener session", oTok], ["desk-code session", oPin.tok]]) {
    ok(who(t[1], R) === "none", "[6b] desk " + O + " owner's " + t[0] + " is nobody on desk " + R + " (got " + who(t[1], R) + ")");
    await rulesNo("[6b rules add, other desk owner's " + t[0] + "]", rules, "/api/rules", { "x-workspace": R, "x-session": t[1] }, { text: "Foreign session wrote this.", when: "drop", then: "note", contains: "css" }, [403]);
    await rulesNo("[6b rules add, other desk owner's " + t[0] + " + wrong code]", rules, "/api/rules", { "x-workspace": R, "x-session": t[1], "x-pin": "0000" }, { text: "Foreign session+code wrote this.", when: "drop", then: "note", contains: "css" }, [403]);
  }
  // 6c. Near-miss codes: padded or trimmed owner code, the owner's name in any case, her email, empty.
  for (const c of [["padded", " 5151 "], ["trailing space", "5151 "], ["leading space", " 5151"], ["tab", "5151\t"], ["owner name", "Ria"], ["owner name lower", "ria"], ["owner name upper", "RIA"], ["owner email", "ria@css.test"], ["empty", ""]]) {
    const pw = lib.personOf({ headers: { "x-workspace": R, "x-pin": c[1] } }, R);
    ok(!pw.person && !pw.pending && !pw.denied, "[6c " + c[0] + "] is nobody as a code (got " + (pw.person ? pw.person.id : "none") + ")");
    await rulesNo("[6c rules add, " + c[0] + " as code]", rules, "/api/rules", { "x-workspace": R, "x-pin": c[1] }, { text: c[0] + " wrote this.", when: "drop", then: "note", contains: "css" }, [403]);
    if (c[1]) {
      const lg = await pinLogin(R, c[1]);
      ok(!lg.tok, "[6c " + c[0] + "] signs in to nothing (" + lg.code + ")");
    }
  }
  const exact = await call(rules, "POST", { "x-workspace": R, "x-pin": "5151" }, { text: "Exact code still writes.", when: "drop", then: "note", contains: "css" }, "/api/rules");
  ok(exact.statusCode === 201, "[6c control] the exact owner code still adds a rule (" + exact.statusCode + ")");

  console.log((failed ? "FAIL" : "PASS") + " check-closed-seat-session: " + (asserts - failed) + "/" + asserts + " asserts");
  try { fs.unlinkSync(STORE); } catch (e) {}
}

main().catch((e) => { console.error("FAIL crashed: " + (e && e.stack || e)); process.exitCode = 1; });
