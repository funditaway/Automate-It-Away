#!/usr/bin/env node
// Proves a closed or removed seat's session is nobody on its desk, and a closed seat's password proves nothing:
// 1. A removed co-owner's live desk-code session (it carries the desk's account) never lands on the owner seat
//    by account or email: nobody, and it cannot invite (store unchanged). A removed helper stays nobody.
// 2. A legacy owner seat with no account stays the owner for the owner's account session while a co-owner with
//    her own account is denied.
// 3. Email + password for an account whose own seat is denied or waiting is refused (403, no session, no write)
//    and never maps to the open co-owner's seat.
// 4. A closed owner seat without the session's account (legacy data) gives nobody: no other owner seat, no made-up owner.
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
  const wenTok = await open(N, "Wen", "7171", "wen@css.test");
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

  console.log((failed ? "FAIL" : "PASS") + " check-closed-seat-session: " + (asserts - failed) + "/" + asserts + " asserts");
  try { fs.unlinkSync(STORE); } catch (e) {}
}

main().catch((e) => { console.error("FAIL crashed: " + (e && e.stack || e)); process.exitCode = 1; });
