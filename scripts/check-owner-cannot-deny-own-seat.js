#!/usr/bin/env node
require("./_env-guard");
// Proves deny and remove (on /api/admin and /api/auth) never turn off the desk's owner seat or the
// requester's own seat. The refusal is a plain 409 and writes nothing: the store file and the
// in-memory store are byte-for-byte the same after. The owner's desk code still logs in after.
// Helpers can still be denied, approved again, and removed by the owner.
// Runs the real handlers against a temp store. No network.
const os = require("os");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-owner-deny-own-" + Date.now() + "-" + process.pid + ".json");
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
const REFUSAL = "You can't turn off the owner seat.";

async function main() {
  const auth = require(path.join(root, "api/auth"));
  const admin = require(path.join(root, "api/admin"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();
  const STORE = process.env.AIA_STORE_PATH;
  const bytes = () => { try { return fs.readFileSync(STORE); } catch (e) { return Buffer.from("<none>"); } };
  const W = (s) => lib.mem.workspaces.find((w) => w && w.slug === s);

  async function open(slug, name, pin, email) {
    const r = await call(auth, "POST", { "x-workspace": slug }, { action: "open", slug, biz: slug, name, pin, email }, "/api/auth");
    const t = r.body && r.body.session && r.body.session.token;
    if (r.statusCode !== 201 || !t) throw new Error("open " + slug + " " + r.statusCode + " " + JSON.stringify(r.body));
    return t;
  }
  const S = "ocd-ola";
  const olaTok = await open(S, "Ola", "1111", "ola@x.test");
  const ws = W(S);
  const pinHdr = (pin) => ({ "x-workspace": S, "x-pin": pin });
  const ola = pinHdr("1111");
  const asOwner = (tok, slug) => { const r = lib.personOf({ headers: { "x-session": tok, "x-workspace": slug } }, slug); return !!(r.person && lib.isOwner(r.person)); };
  const pinLogin = async (pin, slug) => { const r = await call(auth, "POST", {}, { action: "login", workspace: slug || S, pin }, "/api/auth"); return { code: r.statusCode, tok: r.body && r.body.session && r.body.session.token, body: r.body }; };
  const inv = async (name, pin, kind) => { await tick(); const r = await call(admin, "POST", ola, { action: "invite", name, pin, kind }); return r.body && r.body.person && r.body.person.id; };
  const halId = await inv("Hal", "2222", "helper");
  const coraId = await inv("Cora", "3333", "owner");
  const ownerSeat = ws.people.find((p) => lib.isOwner(p));
  const ownerId = ownerSeat && ownerSeat.id;
  ok(!!ownerId && !!halId && !!coraId, "[setup] Ola's desk has owner seat " + ownerId + ", helper Hal, co-owner Cora");
  const coraTok = (await pinLogin("3333")).tok;
  await call(admin, "POST", ola, { action: "mine" }); // warm lazy store setup
  await lib.save();


  // Reading a session slides its seenAt/expiresAt in memory (never saved by a refusal); mask only those.
  const memSnap = () => JSON.stringify(lib.mem, (k, v) => (k === "seenAt" || k === "expiresAt" ? undefined : v));
  // A refused turn-off: 409, plain refusal, no write anywhere.
  async function refused(tag, handler, url, headers, body) {
    const b0 = bytes();
    const m0 = memSnap();
    const r = await call(handler, "POST", headers, body, url);
    ok(r.statusCode === 409, tag + ": answers 409 (got " + r.statusCode + ")");
    ok(r.body && r.body.ok === false && r.body.error === REFUSAL, tag + ": plain refusal " + JSON.stringify(REFUSAL) + " (got " + JSON.stringify(r.body && r.body.error) + ")");
    ok(Buffer.compare(b0, bytes()) === 0, tag + ": store file byte-unchanged");
    ok(memSnap() === m0, tag + ": in-memory store byte-unchanged (session seenAt/expiresAt slide aside)");
  }

  // 1. Ola denies / removes her own owner seat, by desk code and by session, on both doors.
  await refused("[admin deny own owner seat, desk code]", admin, "/api/admin", ola, { action: "deny", id: ownerId });
  await refused("[admin deny own owner seat, session]", admin, "/api/admin", { "x-workspace": S, "x-session": olaTok }, { action: "deny", personId: ownerId });
  await refused("[admin remove own owner seat]", admin, "/api/admin", ola, { action: "remove", id: ownerId });
  await refused("[auth deny own owner seat]", auth, "/api/auth", ola, { action: "deny", id: ownerId });
  await refused("[auth remove own owner seat]", auth, "/api/auth", ola, { action: "remove", id: ownerId });
  ok(ownerSeat.status !== "denied" && ws.people.includes(ownerSeat), "[after] owner seat is still on the desk and not denied");
  const back = await pinLogin("1111");
  ok(back.code === 200 && !!back.tok && asOwner(back.tok, S), "[after] Ola's desk code still logs her in as owner (" + back.code + ")");
  ok(asOwner(olaTok, S), "[after] Ola's old session is still owner");

  // 2. Co-owner Cora: not her own seat, not the desk's owner seat.
  const cora = pinHdr("3333");
  await refused("[co-owner denies own seat]", admin, "/api/admin", cora, { action: "deny", id: coraId });
  await refused("[co-owner removes own seat]", admin, "/api/admin", cora, { action: "remove", id: coraId });
  await refused("[co-owner denies the desk's owner seat]", admin, "/api/admin", cora, { action: "deny", id: ownerId });
  await refused("[co-owner auth-denies own seat]", auth, "/api/auth", cora, { action: "deny", id: coraId });

  // 3. The desk's owner seat under another id (first owner seat) and p_owner behind another owner.
  const L = "ocd-lee";
  await open(L, "Lee", "5151", "lee@x.test");
  const wl = W(L);
  const leeSeat = wl.people.find((p) => lib.isOwner(p));
  leeSeat.id = "p_legacyown";
  await tick();
  const kayRes = await call(admin, "POST", { "x-workspace": L, "x-pin": "5151" }, { action: "invite", name: "Kay", pin: "5252", kind: "owner" });
  ok(kayRes.statusCode === 201, "[setup] Lee's desk owner seat is p_legacyown, co-owner Kay");
  await lib.save();
  await refused("[co-owner denies first owner seat with a non-p_owner id]", admin, "/api/admin", { "x-workspace": L, "x-pin": "5252" }, { action: "deny", id: "p_legacyown" });
  const P = "ocd-pat";
  await open(P, "Pat", "6161", "pat@x.test");
  const wp = W(P);
  const patSeat = wp.people.find((p) => lib.isOwner(p));
  patSeat.id = "p_patfirst";
  wp.people.push({ id: "p_owner", name: "Old Owner", role: "owner", kind: "owner", pin: lib.hashPin("6262"), status: "approved", createdAt: "2026-01-01T00:00:00.000Z" });
  await lib.save();
  await refused("[owner denies a p_owner seat behind another owner seat]", admin, "/api/admin", { "x-workspace": P, "x-pin": "6161" }, { action: "deny", id: "p_owner" });

  // 4. Helpers can still be turned off by the owner, on both doors.
  const d1 = await call(admin, "POST", ola, { action: "deny", id: halId });
  const hal = ws.people.find((p) => p.id === halId);
  ok(d1.statusCode === 200 && hal && hal.status === "denied", "[helper] owner denies helper Hal (200, denied)");
  const halLogin = await pinLogin("2222");
  ok(halLogin.code !== 200 || !halLogin.tok || !lib.personOf({ headers: { "x-session": halLogin.tok, "x-workspace": S } }, S).person, "[helper] denied Hal's desk code does not open the desk");
  const a1 = await call(auth, "POST", ola, { action: "approve", id: halId }, "/api/auth");
  ok(a1.statusCode === 200 && hal.status === "approved", "[helper] owner approves Hal again on /api/auth");
  const d2 = await call(auth, "POST", ola, { action: "deny", id: halId }, "/api/auth");
  ok(d2.statusCode === 200 && hal.status === "denied", "[helper] owner denies Hal on /api/auth (200)");
  const approveOwner = await call(admin, "POST", ola, { action: "approve", id: ownerId });
  ok(approveOwner.statusCode === 200 && ownerSeat.status === "approved", "[approve] approving the owner seat is not refused");
  // A stored helper seat holding the owner's account is still a helper: deniable.
  const stray = { id: "p_strayhelper", name: "Ola", role: "employee", kind: "helper", accountId: ownerSeat.accountId || ws.accountId || "acct_x", pin: lib.hashPin("8181"), status: "approved", createdAt: "2026-01-01T00:00:00.000Z" };
  ws.people.push(stray);
  const d3 = await call(admin, "POST", ola, { action: "deny", id: stray.id });
  ok(d3.statusCode === 200 && stray.status === "denied", "[helper] a helper seat named Ola and carrying the owner's account is still deniable");
  const r1 = await call(admin, "POST", ola, { action: "remove", id: halId });
  ok(r1.statusCode === 200 && !ws.people.some((p) => p.id === halId), "[helper] owner removes Hal (200, gone)");
  // A co-owner seat is neither the desk's owner seat nor Ola's own: Ola may still turn it off.
  const d4 = await call(admin, "POST", ola, { action: "deny", id: coraId });
  const coraSeat = ws.people.find((p) => p.id === coraId);
  ok(d4.statusCode === 200 && coraSeat && coraSeat.status === "denied", "[co-owner] the desk's owner may deny a co-owner seat (200)");
  // 5. A denied or waiting seat's live session proves nothing (personOf's owner-session fallback).
  const sess = (tok, slug) => lib.personOf({ headers: { "x-session": tok, "x-workspace": slug } }, slug);
  async function shut(tag, tok, slug, want) {
    const r = sess(tok, slug);
    ok(!r.person && r[want] === true, tag + ": personOf gives no person, " + want + " (got " + (r.person ? r.person.id : JSON.stringify({ denied: r.denied, pending: r.pending })) + ")");
    const g = await call(admin, "GET", { "x-workspace": slug, "x-session": tok }, null);
    ok(g.statusCode === 401 || g.statusCode === 403, tag + ": admin GET refused (" + g.statusCode + ")");
    const n0 = W(slug).people.length;
    const i = await call(admin, "POST", { "x-workspace": slug, "x-session": tok }, { action: "invite", name: "Sneak", pin: "9090", kind: "helper" });
    ok(i.statusCode >= 400 && W(slug).people.length === n0, tag + ": owner-only invite refused, no seat added (" + i.statusCode + ")");
  }
  ok(!!coraTok, "[setup] co-owner Cora holds a live session from before she was denied");
  await shut("[denied co-owner session]", coraTok, S, "denied");
  ok(asOwner(olaTok, S), "[denied co-owner session] Ola's own session is still owner");
  ws.people.find((p) => p.id === coraId).status = "pending";
  await shut("[waiting co-owner session]", coraTok, S, "pending");
  ws.people.find((p) => p.id === coraId).status = "denied";
  const N = "ocd-wen";
  const wenTok = await open(N, "Wen", "7171", "wen@x.test");
  const wn = W(N);
  const wenSeat = wn.people.find((p) => lib.isOwner(p));
  ok(asOwner(wenTok, N), "[setup] Wen's session is owner on her desk");
  wenSeat.status = "denied"; // a stored denied owner seat (main let an owner deny herself)
  await shut("[denied owner session]", wenTok, N, "denied");
  wenSeat.status = "pending";
  await shut("[waiting owner session]", wenTok, N, "pending");
  wenSeat.status = "approved";
  ok(asOwner(wenTok, N), "[reopened] the same session is owner again once the seat is open");
  const wenRow = (lib.mem.sessions || []).find((x) => x && x.workspace === N && x.personId === wenSeat.id);
  const wenAcct = wenRow && wenRow.accountId;
  ok(!!wenAcct && wenSeat.accountId === wenAcct, "[setup] Wen's session and owner seat carry her account " + wenAcct);
  if (wenRow) wenRow.personId = wenAcct + "_owner"; // account-level owner session, no seat id
  ok(asOwner(wenTok, N), "[account session] an account owner session is owner while her seat is open");
  wenSeat.status = "denied";
  await shut("[account session, denied owner seat]", wenTok, N, "denied");
  wenSeat.status = "approved";

  const unknown = await call(admin, "POST", ola, { action: "deny", id: "p_nobody" });
  ok(unknown.statusCode === 404, "[unknown] denying a missing seat still answers 404");

  console.log((failed ? "FAIL" : "PASS") + " check-owner-cannot-deny-own-seat: " + (asserts - failed) + "/" + asserts + " asserts");
  try { fs.unlinkSync(STORE); } catch (e) {}
}

main().catch((e) => { console.error("FAIL crashed: " + (e && e.stack || e)); process.exitCode = 1; });
