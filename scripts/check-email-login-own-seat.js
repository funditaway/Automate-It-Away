#!/usr/bin/env node
// Proves email + password sign-in lands on this account's own seat, never another person's:
// A. An open co-owner (or helper) whose own account lists the owner's desk gets her own seat, not p_owner.
//    An account that lists a desk where it holds no seat, and is not that desk's own account, is refused (403, no write).
// B. An account on several desks: the desk the request names (body workspace/slug/biz or X-Workspace) when it is
//    this account's, else a desk where it has an open seat. A denied seat on one desk does not block another desk;
//    a named desk where its seat is closed is refused (403, no write) and never switches to another seat.
// C. A removed seat's older session with no account id is still nobody and cannot invite an owner.
// Owner, legacy owner and helper email logins keep working. Runs the real handlers against a temp store. No network.
const os = require("os");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-email-login-own-seat-" + Date.now() + "-" + process.pid + ".json");
delete global.__aia;
delete global.__aiaHydrate;

let failed = 0;
let asserts = 0;
function fail(msg) { console.error("FAIL " + msg); failed += 1; process.exitCode = 1; }
function ok(cond, msg) { asserts += 1; if (cond) console.log("ok  " + msg); else fail(msg); }

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
  const acctLib = require(path.join(root, "api/_account"));
  await lib.ready();
  const STORE = process.env.AIA_STORE_PATH;
  const bytes = () => { try { return fs.readFileSync(STORE); } catch (e) { return Buffer.from("<none>"); } };
  const memSnap = () => JSON.stringify(lib.mem, (k, v) => (k === "seenAt" || k === "expiresAt" ? undefined : v));
  const W = (s) => lib.mem.workspaces.find((w) => w && w.slug === s);
  async function open(slug, name, pin, email) {
    const r = await call(auth, "POST", { "x-workspace": slug }, { action: "open", slug, biz: slug, name, pin, email }, "/api/auth");
    const t = r.body && r.body.session && r.body.session.token;
    if (r.statusCode !== 201 || !t) throw new Error("open " + slug + " " + r.statusCode + " " + JSON.stringify(r.body));
    return t;
  }
  const inv = async (slug, pin, name, np, kind) => { await tick(); const r = await call(admin, "POST", { "x-workspace": slug, "x-pin": pin }, { action: "invite", name, pin: np, kind }); return r.body && r.body.person && r.body.person.id; };
  const who = (tok, slug) => {
    const r = lib.personOf({ headers: { "x-session": tok, "x-workspace": slug } }, slug);
    return r.person ? r.person.id + (lib.isOwner(r.person) ? "(owner)" : "") : (r.denied ? "denied" : r.pending ? "pending" : "none");
  };
  const setPw = async (slug, tok, email, pw) => {
    const r = await call(auth, "POST", { "x-workspace": slug, "x-session": tok }, { action: "password", password: pw, email }, "/api/auth");
    if (r.statusCode !== 200) throw new Error("password " + slug + " " + r.statusCode + " " + JSON.stringify(r.body));
  };
  const acctBy = (email) => (lib.mem.accounts || []).find((a) => a && a.email === email);
  function newAccount(id, name, email, pw, desks) {
    const acc = { id, name, ownerName: name, email, desks: desks.slice(), memberDesks: [], plan: "pro", createdAt: "2026-01-01T00:00:00.000Z" };
    acctLib.setAccountPassword(acc, pw);
    lib.mem.accounts.push(acc);
    return acc;
  }
  const login = (email, pw, extra, headers, url) => call(auth, "POST", headers || {}, Object.assign({ action: "login", email, password: pw }, extra || {}), url || "/api/auth");
  const sess = (r) => (r && r.body && r.body.session) || null;
  const tag = (r) => r.statusCode + " " + (sess(r) ? sess(r).workspace + "/" + sess(r).personId : "no-session");
  // A refused email login: 403, no session, no write to the store file or memory (a prior wrong try's lock row stays).
  async function refused(t, email, pw, extra, headers, url) {
    await login(email, "wrong-pass-000000", extra, headers, url);
    await lib.save();
    const b0 = bytes(); const m0 = memSnap(); const n0 = (lib.mem.sessions || []).length;
    const r = await login(email, pw, extra, headers, url);
    ok(r.statusCode === 403 && !sess(r), t + ": refused 403, no session (got " + tag(r) + ")");
    ok(Buffer.compare(b0, bytes()) === 0 && memSnap() === m0 && (lib.mem.sessions || []).length === n0, t + ": store file and memory unchanged");
    return r;
  }

  // A. Open co-owner Zoe: her seat carries her account; her account lists Ola's desk.
  const S = "eos-ola";
  const olaTok = await open(S, "Ola", "1111", "ola@eos.test");
  await setPw(S, olaTok, "ola@eos.test", "ola-pass-123456");
  const ws = W(S);
  const zoeId = await inv(S, "1111", "Zoe", "4444", "owner");
  const zoe = newAccount("acct_eos_zoe", "Zoe", "zoe@eos.test", "zoe-pass-123456", [S]);
  ws.people.find((p) => p.id === zoeId).accountId = zoe.id;
  const za = await login("zoe@eos.test", "zoe-pass-123456");
  ok(za.statusCode === 200 && sess(za) && sess(za).personId === zoeId, "[A C06e0] open co-owner's email login is her own seat, not p_owner (got " + tag(za) + ")");
  ok(!!sess(za) && who(sess(za).token, S) === zoeId + "(owner)", "[A] her session reads as her own seat (" + (sess(za) ? who(sess(za).token, S) : "-") + ")");
  const zd = acctLib.loginAccount("zoe@eos.test", "", { email: "zoe@eos.test", password: "zoe-pass-123456" });
  ok(zd.ok && zd.person && zd.person.id === zoeId, "[A] account door (loginAccount) gives her own seat (got " + (zd.person && zd.person.id) + ")");
  const zh = await login("zoe@eos.test", "zoe-pass-123456", null, {}, "/api/account");
  ok(zh.statusCode === 200 && sess(zh) && sess(zh).personId === zoeId, "[A] /api/account email login gives her own seat (got " + tag(zh) + ")");
  const oa = await login("ola@eos.test", "ola-pass-123456");
  ok(oa.statusCode === 200 && sess(oa) && sess(oa).personId === "p_owner" && who(sess(oa).token, S) === "p_owner(owner)", "[A control] owner Ola's email login is still p_owner (got " + tag(oa) + ")");
  // A helper seat carrying Ola's own account listed first: her email login is still her owner seat.
  ws.people.unshift({ id: "p_olahelper", name: "Ola helper", role: "employee", kind: "helper", status: "approved", accountId: ws.accountId, createdAt: "2026-01-01T00:00:00.000Z" });
  const oh = await login("ola@eos.test", "ola-pass-123456");
  ok(oh.statusCode === 200 && sess(oh) && sess(oh).personId === "p_owner", "[A control] a helper seat on her own account listed first: owner Ola is still p_owner (got " + tag(oh) + ")");
  ws.people = ws.people.filter((p) => p.id !== "p_olahelper");
  // Helper Hal with his own account on Ola's desk.
  const halId = await inv(S, "1111", "Hal", "2222", "helper");
  const hal = newAccount("acct_eos_hal", "Hal", "hal@eos.test", "hal-pass-123456", [S]);
  ws.people.find((p) => p.id === halId).accountId = hal.id;
  const ha = await login("hal@eos.test", "hal-pass-123456");
  ok(ha.statusCode === 200 && sess(ha) && sess(ha).personId === halId && who(sess(ha).token, S) === halId, "[A] helper with his own account: his own helper seat, not the owner's (got " + tag(ha) + ")");
  // Zoe's seat denied: refused (no write), never the open owner seat.
  ws.people.find((p) => p.id === zoeId).status = "denied";
  await refused("[A denied co-owner]", "zoe@eos.test", "zoe-pass-123456");
  ws.people.find((p) => p.id === zoeId).status = "approved";
  // An old closed seat of Zoe's listed before her open one: her open seat.
  ws.people.unshift({ id: "p_zoeold", name: "Zoe old", role: "owner", kind: "owner", status: "denied", accountId: zoe.id, createdAt: "2026-01-01T00:00:00.000Z" });
  const zo = await login("zoe@eos.test", "zoe-pass-123456");
  ok(zo.statusCode === 200 && sess(zo) && sess(zo).personId === zoeId, "[A] an old closed seat of hers listed first: her open seat (got " + tag(zo) + ")");
  ws.people = ws.people.filter((p) => p.id !== "p_zoeold");
  // Xena lists Ola's desk but holds no seat there and the desk is not hers: refused, never p_owner.
  newAccount("acct_eos_xena", "Xena", "xena@eos.test", "xena-pass-123456", [S]);
  await refused("[A no seat, not the desk's account]", "xena@eos.test", "xena-pass-123456");
  // Legacy desk L (owner seat carries no account) owned by Lee's account; Xia lists L, no seat: refused, not L's owner seat.
  const L = "eos-lee";
  const leeTok = await open(L, "Lee", "5151", "lee@eos.test");
  await setPw(L, leeTok, "lee@eos.test", "lee-pass-123456");
  const wl = W(L);
  wl.people.find((p) => p.id === "p_owner").accountId = "";
  newAccount("acct_eos_xia", "Xia", "xia@eos.test", "xia-pass-123456", [L]);
  await refused("[A legacy owner seat, another account's desk]", "xia@eos.test", "xia-pass-123456");
  const la = await login("lee@eos.test", "lee-pass-123456");
  ok(la.statusCode === 200 && sess(la) && sess(la).personId === "p_owner" && who(sess(la).token, L) === "p_owner(owner)", "[A control] legacy owner seat (no account) still signs in its desk's own account (got " + tag(la) + ")");

  // B. Mia owns two desks; Lu owns a third, where Mia is a helper.
  const M1 = "eos-mia-one";
  const miaTok = await open(M1, "Mia", "3131", "mia@eos.test");
  await setPw(M1, miaTok, "mia@eos.test", "mia-pass-123456");
  const mia = acctBy("mia@eos.test");
  const M2 = "eos-mia-two";
  await open(M2, "Mia", "3232", "");
  const w2 = W(M2);
  w2.accountId = mia.id; w2.people.find((p) => p.id === "p_owner").accountId = mia.id;
  if (mia.desks.indexOf(M2) < 0) mia.desks.push(M2);
  const order = require(path.join(root, "api/_plans")).desksOfAccount(mia).map((w) => w.slug);
  ok(order.length === 2, "[B setup] Mia's account lists two desks (" + order.join(",") + ")");
  const [first, second] = order;
  const seatOf = (slug) => W(slug).people.find((p) => p.id === "p_owner");
  const mp = (extra, headers, url) => login("mia@eos.test", "mia-pass-123456", extra, headers, url);
  const b0 = await mp();
  ok(b0.statusCode === 200 && sess(b0).workspace === first, "[B control] no desk named, both open: preference order unchanged (" + tag(b0) + ")");
  const bw = await mp({ workspace: second });
  ok(bw.statusCode === 200 && sess(bw).workspace === second && sess(bw).personId === "p_owner" && who(sess(bw).token, second) === "p_owner(owner)", "[B named] body workspace names her second desk: that desk (got " + tag(bw) + ")");
  const bh = await mp(null, { "x-workspace": second });
  ok(bh.statusCode === 200 && sess(bh).workspace === second, "[B named] X-Workspace names her second desk: that desk (got " + tag(bh) + ")");
  const bs = await mp({ slug: second }, {}, "/api/account");
  ok(bs.statusCode === 200 && sess(bs) && sess(bs).workspace === second, "[B named] /api/account slug names her second desk: that desk (got " + tag(bs) + ")");
  const bf = await mp({ workspace: S });
  ok(bf.statusCode === 200 && sess(bf).workspace === first && sess(bf).personId === "p_owner", "[B named] a desk not on her account is not used; her own desk (got " + tag(bf) + ")");
  for (const st of ["denied", "pending"]) {
    seatOf(first).status = st;
    const bd = await mp();
    ok(bd.statusCode === 200 && sess(bd).workspace === second && sess(bd).personId === "p_owner" && who(sess(bd).token, second) === "p_owner(owner)", "[B C07e " + st + "] her seat on the first desk is " + st + ": she signs in to the desk where her seat is open (got " + tag(bd) + ")");
    await refused("[B " + st + " named desk]", "mia@eos.test", "mia-pass-123456", { workspace: first });
    await refused("[B " + st + " named desk by X-Workspace]", "mia@eos.test", "mia-pass-123456", null, { "x-workspace": first });
    const da = acctLib.loginAccount("mia@eos.test", "", { email: "mia@eos.test", password: "mia-pass-123456" });
    ok(da.ok && da.desk && da.desk.slug === second, "[B " + st + "] account door also signs her in to the open desk (got " + (da.desk && da.desk.slug) + ")");
  }
  seatOf(first).status = "approved";
  // Mia's own desks both closed; she is an open helper on Lu's desk (listed on her account): her helper seat, never Lu's.
  const U = "eos-lu";
  await open(U, "Lu", "6565", "lu@eos.test");
  const wu = W(U);
  wu.people.push({ id: "p_mia_at_lu", name: "Mia", role: "employee", status: "approved", accountId: mia.id, createdAt: "2026-01-02T00:00:00.000Z" });
  mia.desks.push(U);
  seatOf(first).status = "denied"; seatOf(second).status = "denied";
  const bu = await mp();
  ok(bu.statusCode === 200 && sess(bu).workspace === U && sess(bu).personId === "p_mia_at_lu" && who(sess(bu).token, U) === "p_mia_at_lu", "[B] own desks closed, open helper seat on another desk: that helper seat, not its owner (got " + tag(bu) + ")");
  seatOf(first).status = "approved"; seatOf(second).status = "approved";

  // C. survC: a removed co-owner's older session with no account id (and no email) is nobody.
  const C = "eos-sc";
  await open(C, "Ola", "7171", "ola@eosc.test");
  const danId = await inv(C, "7171", "Dan", "4747", "owner");
  const dl = await call(auth, "POST", {}, { action: "login", workspace: C, pin: "4747" }, "/api/auth");
  const danTok = sess(dl) && sess(dl).token;
  ok(dl.statusCode === 200 && who(danTok, C) === danId + "(owner)", "[C setup] co-owner Dan signs in with his desk code");
  await call(admin, "POST", { "x-workspace": C, "x-pin": "7171" }, { action: "remove", id: danId });
  const row = lib.findSession(danTok, { slide: false }); row.accountId = ""; row.email = "";
  ok(who(danTok, C) === "none", "[C survC] removed co-owner's older session without account id is nobody (got " + who(danTok, C) + ")");
  await lib.save();
  const cb = bytes(); const cm = memSnap(); const n0 = W(C).people.length;
  const ci = await call(admin, "POST", { "x-workspace": C, "x-session": danTok }, { action: "invite", name: "Sneak", pin: "9393", kind: "owner" });
  ok(ci.statusCode >= 400 && ci.statusCode !== 201 && W(C).people.length === n0, "[C survC] it cannot invite an owner (got " + ci.statusCode + ")");
  ok(Buffer.compare(cb, bytes()) === 0 && memSnap() === cm, "[C survC] store file and memory unchanged");

  console.log((failed ? "FAIL" : "PASS") + " check-email-login-own-seat: " + (asserts - failed) + "/" + asserts + " asserts");
  try { fs.unlinkSync(STORE); } catch (e) {}
}

main().catch((e) => { console.error("FAIL crashed: " + (e && e.stack || e)); process.exitCode = 1; });
