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
// 7. Re-open ("open" on an existing desk with a code) gives a session only to an open seat holding that code, or by
//    the desk code alone to an open owner seat with no code of its own: never people[0] blindly. A removed
//    or denied people[0], or an opener taken out by hand, gets the wrong-code reply and no session; a waiting
//    one gets the waiting-seat login reply, byte for byte.
// 8. A shut seat earlier in people[] never hides an open seat holding the same code: after a desk-code change
//    that also wrote onto a removed opener, the co-owner's own code and PIN login still open her seat; a codeless
//    co-owner behind a removed opener still opens by the desk code. A removed helper's session is nobody, and the
//    desk code alone never opens a codeless desk AI or helper seat. Refused PIN logins match the wrong-code reply.
// 9. Re-open, same rules: an open seat behind a shut one holding the same code re-opens; a codeless co-owner
//    behind a removed opener re-opens by the desk code; the desk code never re-opens a desk AI or helper seat;
//    removed and denied codes get the wrong-code reply, waiting codes the waiting-seat login reply, byte for byte.
// 10. Account door (GET /api/auth?via=account and POST account login): the account/desk code shortcut only lands on
//    an open owner seat. A removed or denied opener's old code gets the wrong-code reply on both, no session or cookie;
//    a waiting one the existing waiting reply. Open co-owners (also behind a removed opener) and legacy desks still open.
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

  // 7. "open" on an existing desk with a code (re-open) gives a session only to an open seat holding that code,
  //    or, by the desk code alone, to an open owner seat with no code of its own. Never people[0] blindly.
  const reopen = async (slug, pin) => {
    const r = await call(auth, "POST", {}, { action: "open", slug, biz: slug, name: "Again", pin }, "/api/auth");
    const sess = r.body && r.body.session;
    return { code: r.statusCode, body: r.body, tok: sess && sess.token, personId: sess && sess.personId };
  };
  const refusedOpen = async (tag, slug, pin) => {
    const bad = await reopen(slug, "0000");
    ok(bad.code === 401 && !bad.tok, tag + ": control: a wrong code is refused (" + bad.code + ")");
    const r = await noWrite(tag, auth, "/api/auth", {}, { action: "open", slug, biz: slug, name: "Again", pin }, [401]);
    ok(!(r.body && r.body.session) && JSON.stringify(r.body) === JSON.stringify(bad.body), tag + ": no session; same reply as a wrong code");
  };
  // A waiting seat's code: the same reply its PIN login gives (main's waiting-seat reply), no session, no write.
  const WAITING = { ok: false, pending: true, error: "That seat is waiting on the owner. They approve people on /admin." };
  const waitingOpen = async (tag, slug, pin) => {
    const lr = await call(auth, "POST", {}, { action: "login", workspace: slug, pin }, "/api/auth");
    const lg = { code: lr.statusCode, body: lr.body, tok: lr.body && lr.body.session && lr.body.session.token };
    ok(lg.code === 403 && !lg.tok && JSON.stringify(lg.body) === JSON.stringify(WAITING), tag + ": control: the PIN login for that code is the waiting-seat reply (" + lg.code + ")");
    const r = await noWrite(tag, auth, "/api/auth", {}, { action: "open", slug, biz: slug, name: "Again", pin }, [403]);
    ok(!(r.body && r.body.session) && JSON.stringify(r.body) === JSON.stringify(lg.body), tag + ": no session; byte for byte the waiting-seat login reply");
  };
  // 7a. Real owners are never locked out.
  const A7 = "css-reopen";
  await open(A7, "Ari", "7070", "ari@reopen.test");
  const a7co = await inv(A7, "7070", "Cole", "7171", "owner");
  const ra = await reopen(A7, "7070");
  ok(ra.code === 201 && ra.personId === "p_owner" && who(ra.tok, A7) === "p_owner(owner)", "[7a] the opener re-opens with her code: her own owner seat (" + ra.code + ")");
  const raw = await call(rules, "POST", { "x-workspace": A7, "x-session": ra.tok }, { text: "Re-opened owner writes.", when: "drop", then: "note", contains: "css" }, "/api/rules");
  ok(raw.statusCode === 201, "[7a] that session adds a rule (" + raw.statusCode + ")");
  const rc = await reopen(A7, "7171");
  ok(rc.code === 201 && rc.personId === a7co && who(rc.tok, A7) === a7co + "(owner)", "[7a] a co-owner re-opens with his own code: his own seat (" + rc.code + ")");
  // Legacy desk with no people list: the desk code opens the owner seat built from it.
  const L7 = "css-legacy-nopeople";
  lib.mem.workspaces.push({ slug: L7, name: "Lee", biz: L7, pin: lib.hashPin("7272"), createdAt: "2026-01-01T00:00:00.000Z" });
  const rl = await reopen(L7, "7272");
  ok(rl.code === 201 && rl.personId === "p_owner" && who(rl.tok, L7) === "p_owner(owner)", "[7a] legacy desk with no people list: the desk code opens the owner seat (" + rl.code + ")");
  // Legacy owner seat with no code of its own (kind owner): the desk code opens it.
  const K7 = "css-legacy-codeless";
  lib.mem.workspaces.push({ slug: K7, name: "Kit", biz: K7, pin: lib.hashPin("7373"), createdAt: "2026-01-01T00:00:00.000Z",
    people: [{ id: "p_kit", name: "Kit", role: "manager", kind: "owner", status: "approved", createdAt: "2026-01-01T00:00:00.000Z" }] });
  const rk = await reopen(K7, "7373");
  ok(rk.code === 201 && rk.personId === "p_kit" && who(rk.tok, K7) === "p_kit(owner)", "[7a] legacy codeless owner seat: the desk code opens it (" + rk.code + ")");
  // 7b. Opener taken out of people[] by hand: her old code (still the desk code) re-opens nothing, writes nothing.
  const S7 = "css-reopen-splice";
  await open(S7, "Sue", "7474", "sue@reopen.test");
  const s7bo = await inv(S7, "7474", "Bo", "7575", "owner");
  W(S7).people = W(S7).people.filter((p) => p.id !== "p_owner");
  await refusedOpen("[7b re-open, spliced opener old code]", S7, "7474");
  await rulesNo("[7b rules add, spliced opener old code]", rules, "/api/rules", { "x-workspace": S7, "x-pin": "7474" }, { text: "Spliced re-open wrote this.", when: "drop", then: "note", contains: "css" }, [403]);
  const s7b = await reopen(S7, "7575");
  ok(s7b.code === 201 && s7b.personId === s7bo, "[7b control] co-owner Bo still re-opens with his own code (" + s7b.code + ")");
  // 7c. people[0] removed, waiting or denied: its code (the desk code) re-opens nothing.
  for (const st of ["removed", "pending", "denied"]) {
    const P7 = "css-reopen-" + st;
    await open(P7, "Pat", "7676", "pat-" + st + "@reopen.test");
    await inv(P7, "7676", "Cy", "7777", "owner");
    const head = W(P7).people[0];
    head.status = st;
    ok(head.id === "p_owner" && W(P7).pin === lib.hashPin("7676"), "[7c " + st + " setup] people[0] is the opener seat, status " + st);
    if (st === "pending") await waitingOpen("[7c re-open, pending people[0] code]", P7, "7676");
    else await refusedOpen("[7c re-open, " + st + " people[0] code]", P7, "7676");
    const cy = await reopen(P7, "7777");
    ok(cy.code === 201 && cy.personId !== "p_owner", "[7c " + st + " control] the open co-owner still re-opens with his own code (" + cy.code + ")");
  }
  // A waiting helper first in people[] with no code, desk code orphaned by a spliced opener: nothing.
  const Q7 = "css-reopen-helperfirst";
  await open(Q7, "Quin", "7878", "quin@reopen.test");
  W(Q7).people = [{ id: "p_wait", name: "Wes", role: "employee", kind: "helper", status: "pending", createdAt: "2026-01-02T00:00:00.000Z" }];
  await refusedOpen("[7c re-open, desk code with a waiting codeless helper as people[0]]", Q7, "7878");
  // An approved helper with no code first in people[]: the desk code is not hers (owner seats only).
  W(Q7).people = [{ id: "p_hlp", name: "Hal", role: "employee", kind: "helper", status: "approved", createdAt: "2026-01-02T00:00:00.000Z" }];
  await refusedOpen("[7c re-open, desk code with an approved codeless helper as people[0]]", Q7, "7878");
  // A codeless legacy owner seat that is removed, waiting or denied: the desk code does not open it.
  for (const st of ["removed", "pending", "denied"]) {
    W(Q7).people = [{ id: "p_lgo", name: "Lo", role: "manager", kind: "owner", status: st, createdAt: "2026-01-02T00:00:00.000Z" }];
    await refusedOpen("[7c re-open, desk code with a " + st + " codeless owner seat]", Q7, "7878");
  }

  // 8. A shut seat earlier in people[] never hides an open seat holding the same code (no owner lock-out),
  //    a removed HELPER's session is nobody, and the desk code alone never opens a codeless non-owner seat.
  const pinLoginFull = async (slug, pin) => { const r = await call(auth, "POST", {}, { action: "login", workspace: slug, pin }, "/api/auth"); return { code: r.statusCode, body: r.body, tok: r.body && r.body.session && r.body.session.token }; };
  // A refused PIN login: no session, and the reply is byte for byte the wrong-code reply.
  const refusedLogin = async (tag, slug, pin) => {
    const bad = await pinLoginFull(slug, "0000");
    ok(bad.code === 401 && !bad.tok, tag + ": control: a wrong code is refused (" + bad.code + ")");
    const r = await noWrite(tag, auth, "/api/auth", {}, { action: "login", workspace: slug, pin }, [401]);
    ok(!(r.body && r.body.session) && JSON.stringify(r.body) === JSON.stringify(bad.body), tag + ": no session; same reply as a wrong code");
  };
  // 8a. Opener removed by hand (still people[0]), then the co-owner sets a new desk code: setDeskCode writes it
  //     onto every owner row, the removed one too. The co-owner's own code (= the new desk code) still opens her seat.
  const L8 = "css-lockout-newcode";
  await open(L8, "Lou", "8181", "lou@lockout.test");
  const liaId = await inv(L8, "8181", "Lia", "8282", "owner");
  W(L8).people[0].status = "removed";
  const sdc = require(path.join(root, "api/_desk")).setDeskCode(W(L8), "8383");
  ok(sdc.ok && W(L8).people[0].id === "p_owner" && W(L8).people[0].status === "removed" && W(L8).people[0].pin === lib.hashPin("8383") && W(L8).people.find((p) => p.id === liaId).pin === lib.hashPin("8383"), "[8a setup] the removed opener is people[0] and holds the new desk code, same as co-owner Lia");
  const l8pin = lib.personOf({ headers: { "x-workspace": L8, "x-pin": "8383" } }, L8);
  ok(!!l8pin.person && l8pin.person.id === liaId && lib.isOwner(l8pin.person), "[8a] Lia's own code (the new desk code) opens her owner seat, not the removed opener (got " + (l8pin.person ? l8pin.person.id : l8pin.pending ? "pending" : l8pin.denied ? "denied" : "none") + ")");
  const l8r = await call(rules, "POST", { "x-workspace": L8, "x-pin": "8383" }, { text: "Lia still writes.", when: "drop", then: "note", contains: "css" }, "/api/rules");
  ok(l8r.statusCode === 201, "[8a] Lia's code adds a rule (" + l8r.statusCode + ")");
  const l8lg = await pinLoginFull(L8, "8383");
  ok(l8lg.code === 200 && !!l8lg.tok && who(l8lg.tok, L8) === liaId + "(owner)", "[8a] Lia's PIN login lands on her own owner seat (" + l8lg.code + ")");
  await refusedLogin("[8a login, removed opener's old code]", L8, "8181");
  // Shut seats first with the code, an open seat after: the open seat wins, whatever the shut status.
  for (const st of ["removed", "pending", "denied"]) {
    const M8 = "css-lockout-order-" + st;
    lib.mem.workspaces.push({ slug: M8, name: "Moe", biz: M8, pin: lib.hashPin("8484"), createdAt: "2026-01-01T00:00:00.000Z",
      people: [{ id: "p_shut", name: "Moe", role: "owner", kind: "owner", status: st, pin: lib.hashPin("8484"), createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "p_open", name: "Meg", role: "owner", kind: "owner", status: "approved", pin: lib.hashPin("8484"), createdAt: "2026-01-02T00:00:00.000Z" }] });
    const m8 = lib.personOf({ headers: { "x-workspace": M8, "x-pin": "8484" } }, M8);
    ok(!!m8.person && m8.person.id === "p_open" && !m8.pending && !m8.denied, "[8a " + st + " first] the open seat holding the code wins (got " + (m8.person ? m8.person.id : m8.pending ? "pending" : m8.denied ? "denied" : "none") + ")");
    const m8lg = await pinLoginFull(M8, "8484");
    ok(m8lg.code === 200 && who(m8lg.tok, M8) === "p_open(owner)", "[8a " + st + " first] PIN login lands on the open seat (" + m8lg.code + ")");
    // Every seat holding the code shut: refused.
    W(M8).people[1].status = st === "removed" ? "denied" : "removed";
    const m8s = lib.personOf({ headers: { "x-workspace": M8, "x-pin": "8484" } }, M8);
    ok(!m8s.person, "[8a every holder shut, first " + st + "] the code is nobody (got " + (m8s.person ? m8s.person.id : "none") + ")");
    if (st !== "pending") await refusedLogin("[8a login, every holder shut, first " + st + "]", M8, "8484");
    else {
      const m8w = await noWrite("[8a login, every holder shut, first pending]", auth, "/api/auth", {}, { action: "login", workspace: M8, pin: "8484" }, [403]);
      ok(JSON.stringify(m8w.body) === JSON.stringify({ ok: false, pending: true, error: "That seat is waiting on the owner. They approve people on /admin." }), "[8a login, every holder shut, first pending]: the waiting-on-the-owner reply, unchanged");
    }
    await rulesNo("[8a rules add, every holder shut, first " + st + "]", rules, "/api/rules", { "x-workspace": M8, "x-pin": "8484" }, { text: "Shut holders wrote this.", when: "drop", then: "note", contains: "css" }, [403]);
  }
  // 8b. Codeless co-owner behind a removed opener that holds the desk code: the desk code opens her seat.
  const L8b = "css-lockout-codeless";
  lib.mem.workspaces.push({ slug: L8b, name: "Mo", biz: L8b, pin: lib.hashPin("8585"), createdAt: "2026-01-01T00:00:00.000Z",
    people: [{ id: "p_owner", name: "Mo", role: "owner", status: "removed", pin: lib.hashPin("8585"), createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "p_co", name: "Mae", role: "owner", createdAt: "2026-01-02T00:00:00.000Z" }] });
  const l8b = lib.personOf({ headers: { "x-workspace": L8b, "x-pin": "8585" } }, L8b);
  ok(!!l8b.person && l8b.person.id === "p_co" && lib.isOwner(l8b.person), "[8b] the desk code opens the codeless co-owner behind the removed opener (got " + (l8b.person ? l8b.person.id : "none") + ")");
  const l8br = await call(rules, "POST", { "x-workspace": L8b, "x-pin": "8585" }, { text: "Mae still writes.", when: "drop", then: "note", contains: "css" }, "/api/rules");
  ok(l8br.statusCode === 201, "[8b] that code adds a rule (" + l8br.statusCode + ")");
  const l8blg = await pinLoginFull(L8b, "8585");
  ok(l8blg.code === 200 && who(l8blg.tok, L8b) === "p_co(owner)", "[8b] PIN login lands on the codeless co-owner (" + l8blg.code + ")");
  // 8c. A removed HELPER's live session (seat left in people[] with status removed) is nobody, no write, and her code signs in to nothing.
  const H8 = "css-removed-helper";
  await open(H8, "Hana", "8686", "hana@helper.test");
  const hapId = await inv(H8, "8686", "Hap", "8787", "helper");
  const hap = await pinLoginFull(H8, "8787");
  ok(hap.code === 200 && who(hap.tok, H8) === hapId, "[8c setup] helper Hap signs in (" + who(hap.tok, H8) + ")");
  W(H8).people.find((p) => p.id === hapId).status = "removed";
  ok(W(H8).people.some((p) => p.id === hapId && p.status === "removed"), "[8c setup] Hap's seat is still in people[] with status removed");
  ok(who(hap.tok, H8) === "none", "[8c] removed helper's leftover session is nobody (got " + who(hap.tok, H8) + ")");
  await rulesNo("[8c rules add, removed helper session]", rules, "/api/rules", { "x-workspace": H8, "x-session": hap.tok }, { text: "Removed helper session wrote this.", when: "drop", then: "note", contains: "css" }, [403]);
  const hapPin = lib.personOf({ headers: { "x-workspace": H8, "x-pin": "8787" } }, H8);
  ok(!hapPin.person && !hapPin.pending && !hapPin.denied, "[8c] removed helper's code is nobody (got " + (hapPin.person ? hapPin.person.id : "none") + ")");
  await refusedLogin("[8c login, removed helper code]", H8, "8787");
  // 8d. Desk code with only codeless NON-owner seats left (opener spliced out): a desk AI seat, an approved helper. Nobody.
  const D8 = "css-deskcode-nonowner";
  await open(D8, "Dot", "8888", "dot@deskai.test");
  W(D8).people = [
    { id: "ai_bot", name: "Bot", role: "agent", kind: "agent", status: "approved", deskAi: true, createdAt: "2026-01-02T00:00:00.000Z" },
    { id: "p_hlp", name: "Hal", role: "employee", kind: "helper", status: "approved", createdAt: "2026-01-02T00:00:00.000Z" }];
  const d8 = lib.personOf({ headers: { "x-workspace": D8, "x-pin": "8888" } }, D8);
  ok(!d8.person && !d8.pending && !d8.denied, "[8d] the desk code opens no desk AI or helper seat (got " + (d8.person ? d8.person.id : "none") + ")");
  await rulesNo("[8d rules add, desk code with only non-owner codeless seats]", rules, "/api/rules", { "x-workspace": D8, "x-pin": "8888" }, { text: "Desk AI seat wrote this.", when: "drop", then: "note", contains: "css" }, [403]);
  await refusedLogin("[8d login, desk code with only non-owner codeless seats]", D8, "8888");
  // Control: add an open codeless owner seat after them: the desk code opens it, not the desk AI seat in front.
  W(D8).people.push({ id: "p_own2", name: "Dot", role: "owner", kind: "owner", status: "approved", createdAt: "2026-01-03T00:00:00.000Z" });
  const d8c = lib.personOf({ headers: { "x-workspace": D8, "x-pin": "8888" } }, D8);
  ok(!!d8c.person && d8c.person.id === "p_own2", "[8d control] the desk code opens the codeless owner seat behind them (got " + (d8c.person ? d8c.person.id : "none") + ")");

  // 9. Re-open never locks out an open seat behind a shut one holding the same code; a waiting seat keeps the
  //    waiting-seat reply (the PIN login's, byte for byte); the desk code never re-opens a codeless non-owner seat.
  // 9a. Opener removed by hand, then a desk-code change wrote the new code onto her row too: Lia re-opens.
  const r9a = await reopen(L8, "8383");
  ok(r9a.code === 201 && r9a.personId === liaId && who(r9a.tok, L8) === liaId + "(owner)", "[9a] co-owner Lia re-opens with her own code (the new desk code) into her own seat (" + r9a.code + ")");
  await refusedOpen("[9a re-open, removed opener's old code]", L8, "8181");
  for (const st of ["removed", "pending", "denied"]) {
    const M9 = "css-reopen-order-" + st;
    lib.mem.workspaces.push({ slug: M9, name: "Moe", biz: M9, pin: lib.hashPin("9191"), createdAt: "2026-01-01T00:00:00.000Z",
      people: [{ id: "p_shut", name: "Moe", role: "owner", kind: "owner", status: st, pin: lib.hashPin("9191"), createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "p_open", name: "Meg", role: "owner", kind: "owner", status: "approved", pin: lib.hashPin("9191"), createdAt: "2026-01-02T00:00:00.000Z" }] });
    const m9 = await reopen(M9, "9191");
    ok(m9.code === 201 && m9.personId === "p_open" && who(m9.tok, M9) === "p_open(owner)", "[9a " + st + " first] re-open lands on the open seat holding the code (" + m9.code + ")");
    W(M9).people[1].status = st === "removed" ? "denied" : "removed";
    if (st === "pending") await waitingOpen("[9a re-open, every holder shut, first pending]", M9, "9191");
    else await refusedOpen("[9a re-open, every holder shut, first " + st + "]", M9, "9191");
  }
  // 9b. Codeless co-owner behind a removed opener that holds the desk code: the desk code re-opens her seat.
  const r9b = await reopen(L8b, "8585");
  ok(r9b.code === 201 && r9b.personId === "p_co" && who(r9b.tok, L8b) === "p_co(owner)", "[9b] the desk code re-opens the codeless co-owner behind the removed opener (" + r9b.code + ")");
  // 9c. Helper codes: removed and denied get the wrong-code reply; a waiting helper gets the waiting-seat reply.
  await refusedOpen("[9c re-open, removed helper code]", H8, "8787");
  const wId = await inv(H8, "8686", "Wren", "9292", "helper");
  W(H8).people.find((p) => p.id === wId).status = "pending";
  await waitingOpen("[9c re-open, waiting helper code]", H8, "9292");
  W(H8).people.find((p) => p.id === wId).status = "denied";
  await refusedOpen("[9c re-open, denied helper code]", H8, "9292");
  // 9d. Desk code with only codeless non-owner seats (desk AI, helper): no re-open; a codeless owner seat behind them: yes.
  W(D8).people = W(D8).people.filter((p) => p.id !== "p_own2");
  ok(W(D8).people.length === 2 && W(D8).people.every((p) => !p.pin && !lib.isOwner(p)), "[9d setup] only the codeless desk AI and helper seats are left");
  await refusedOpen("[9d re-open, desk code with only non-owner codeless seats]", D8, "8888");
  W(D8).people.push({ id: "p_own2", name: "Dot", role: "owner", kind: "owner", status: "approved", createdAt: "2026-01-03T00:00:00.000Z" });
  const r9d = await reopen(D8, "8888");
  ok(r9d.code === 201 && r9d.personId === "p_own2", "[9d control] the desk code re-opens the codeless owner seat behind them (" + r9d.code + ")");

  // 10. Account door (GET /api/auth?via=account = GET /api/account, and POST action login): the account/desk code
  //     shortcut only lands on an OPEN owner seat. A removed or denied opener's old code gets the wrong-code reply
  //     on both (no session, no cookie, no write); a waiting one gets the existing waiting reply. An open co-owner's
  //     own code (also after a desk-code change wrote it onto the removed opener first in people[]), a legacy desk with
  //     no people list and a legacy codeless owner seat still open the account.
  const acctGet = async (slug, pin) => { const r = await call(auth, "GET", { "x-workspace": slug, "x-pin": pin }, null, "/api/auth?via=account"); return { code: r.statusCode, body: r.body, cookie: r.headers["set-cookie"] }; };
  const acctPost = async (slug, pin) => { const r = await call(auth, "POST", { "x-workspace": slug }, { action: "login", account: slug, pin }, "/api/auth?via=account"); return { code: r.statusCode, body: r.body, cookie: r.headers["set-cookie"], tok: r.body && r.body.session && r.body.session.token }; };
  const acctRefused = async (tag, slug, pin) => {
    const bg = await acctGet(slug, "0000");
    const bp = await acctPost(slug, "0000");
    ok(bg.code === 401 && bp.code === 401 && !bp.tok, tag + ": control: a wrong code is refused on GET and POST (" + bg.code + "/" + bp.code + ")");
    await lib.save();
    const b0 = bytes();
    const g = await acctGet(slug, pin);
    ok(g.code === bg.code && JSON.stringify(g.body) === JSON.stringify(bg.body) && !g.cookie, tag + ": GET via=account is byte for byte the wrong-code reply, no cookie (" + g.code + ")");
    const p = await noWrite(tag + " POST login", auth, "/api/auth?via=account", { "x-workspace": slug }, { action: "login", account: slug, pin }, [401]);
    ok(JSON.stringify(p.body) === JSON.stringify(bp.body) && !(p.body && p.body.session) && !p.headers["set-cookie"], tag + ": POST login is byte for byte the wrong-code reply, no session, no cookie");
    ok(bp.body && bp.body.error === "Account name or code does not match.", tag + ": the POST refusal is the existing wording");
    ok(Buffer.compare(b0, bytes()) === 0, tag + ": store file byte-unchanged across both");
  };
  const acctOpens = async (tag, slug, pin, seatId) => {
    const g = await acctGet(slug, pin);
    ok(g.code === 200 && g.body && g.body.ok !== false, tag + ": GET via=account opens the account home (" + g.code + ")");
    const p = await acctPost(slug, pin);
    ok(p.code === 200 && !!p.tok && (!seatId || (rowOf(p.tok) && rowOf(p.tok).personId === seatId)), tag + ": POST login gives a session" + (seatId ? " on seat " + seatId : "") + " (" + p.code + ")");
  };
  // 10a. Removed opener (still people[0]) and an open co-owner with her own code.
  const A10 = "css-acct-removed";
  await open(A10, "Rae", "1010", "rae@acct.test");
  const robId = await inv(A10, "1010", "Rob", "1020", "owner");
  await acctOpens("[10a control before]", A10, "1010", "p_owner");
  W(A10).people[0].status = "removed";
  ok(W(A10).people[0].id === "p_owner" && W(A10).pin === lib.hashPin("1010"), "[10a setup] the removed opener is people[0]; the desk code is still her old code");
  await acctRefused("[10a removed opener's old desk code]", A10, "1010");
  await acctOpens("[10a co-owner's own code]", A10, "1020", robId);
  // Lock-out case: a desk-code change writes the new code onto every owner row, the removed opener first.
  const sd10 = require(path.join(root, "api/_desk")).setDeskCode(W(A10), "1030");
  ok(sd10.ok && W(A10).people[0].status === "removed" && W(A10).people[0].pin === lib.hashPin("1030"), "[10a setup] the new desk code is on the removed opener's row too");
  await acctOpens("[10a co-owner's own code = the new desk code]", A10, "1030", robId);
  await acctRefused("[10a removed opener's code before the change]", A10, "1010");
  // 10b. Waiting and denied opener: waiting keeps the existing waiting reply, denied gets the wrong-code reply.
  const P10 = "css-acct-pending";
  await open(P10, "Pia", "1040", "pia@acct.test");
  W(P10).people[0].status = "pending";
  for (const r of [await acctGet(P10, "1040"), await acctPost(P10, "1040")]) {
    ok(r.code === 403 && r.body && r.body.pending === true && r.body.error === "That seat is waiting on the owner." && !(r.body.session) && !r.cookie, "[10b waiting opener] the existing waiting reply, no session (" + r.code + ")");
  }
  const D10 = "css-acct-denied";
  await open(D10, "Dee", "1050", "dee@acct.test");
  W(D10).people[0].status = "denied";
  await acctRefused("[10b denied opener's code]", D10, "1050");
  // 10c. Legacy desks keep working: no people list; a codeless owner seat (kind owner).
  const L10 = "css-acct-legacy-nopeople";
  lib.mem.workspaces.push({ slug: L10, name: "Lena", biz: L10, pin: lib.hashPin("1060"), createdAt: "2026-01-01T00:00:00.000Z" });
  await acctOpens("[10c legacy desk with no people list]", L10, "1060");
  const K10 = "css-acct-legacy-codeless";
  lib.mem.workspaces.push({ slug: K10, name: "Kai", biz: K10, pin: lib.hashPin("1070"), createdAt: "2026-01-01T00:00:00.000Z",
    people: [{ id: "p_kai", name: "Kai", role: "manager", kind: "owner", status: "approved", createdAt: "2026-01-01T00:00:00.000Z" }] });
  await acctOpens("[10c legacy codeless owner seat]", K10, "1070");
  const K10b = "css-acct-legacy-roleowner";
  lib.mem.workspaces.push({ slug: K10b, name: "Kip", biz: K10b, pin: lib.hashPin("1080"), createdAt: "2026-01-01T00:00:00.000Z",
    people: [{ id: "p_kip", name: "Kip", role: "owner", status: "approved", createdAt: "2026-01-01T00:00:00.000Z" }] });
  await acctOpens("[10c legacy role-owner seat with no code]", K10b, "1080", "p_kip");
  // A legacy account with no desk row and so no owner seat: its account code still opens it.
  const N10 = "css-acct-legacy-nodesk";
  lib.mem.accounts = lib.mem.accounts || [];
  lib.mem.accounts.push({ id: "acc_css_nodesk", name: "Nodesk Co", slug: N10, pin: lib.hashPin("1090"), desks: [], plan: "pro", createdAt: "2026-01-01T00:00:00.000Z" });
  ok(!W(N10), "[10c setup] the legacy account has no desk row");
  await acctOpens("[10c legacy account with no owner seat]", N10, "1090");

  console.log((failed ? "FAIL" : "PASS") + " check-closed-seat-session: " + (asserts - failed) + "/" + asserts + " asserts");
  try { fs.unlinkSync(STORE); } catch (e) {}
}

main().catch((e) => { console.error("FAIL crashed: " + (e && e.stack || e)); process.exitCode = 1; });
