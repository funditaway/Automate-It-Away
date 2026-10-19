#!/usr/bin/env node
// Proves a helper's old session stops working once the owner denies or removes that seat.
// A pin login stamps the desk's account (and its email) on a helper's session, so on the
// same desk the old session could fall through to the owner seat by accountId or email.
// It must be refused (never owner, never any seat) unless it matches an open seat on its own.
// Runs the real handlers against a temp store. No network.
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-denied-helper-" + Date.now() + ".json");
delete global.__aia;
delete global.__aiaHydrate;

let failed = 0;
function fail(msg) { console.error("FAIL " + msg); failed += 1; process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }

function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k] = v; },
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
function has(body, bit) { return JSON.stringify(body == null ? "" : body).indexOf(bit) >= 0; }

async function main() {
  const auth = require(path.join(root, "api/auth"));
  const jobs = require(path.join(root, "api/jobs"));
  const upload = require(path.join(root, "api/upload"));
  const admin = require(path.join(root, "api/admin"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();

  const D = "dhs-desk";
  const open = await call(auth, "POST", { "x-workspace": D }, { action: "open", slug: D, biz: "dhs desk", name: "Olive", pin: "4141", email: "olive@example.test" });
  const ownerTok = open.body && open.body.session && open.body.session.token;
  if (open.statusCode !== 201 || !ownerTok) { fail("could not open desk: " + open.statusCode + " " + JSON.stringify(open.body)); return; }
  const owner = { "x-session": ownerTok, "x-workspace": D };
  lib.mem.files.unshift({ id: "file_dhs", workspace: D, name: "dhs-ledger.pdf", type: "application/pdf", remoteUrl: "https://blob.example.test/dhs-secret.pdf", createdAt: new Date().toISOString() });
  lib.mem.jobs.unshift({ id: "job_dhs", workspace: D, title: "Olive private card", status: "exception", step: "Qualify", createdAt: new Date().toISOString() });

  async function addHelper(name, pin) {
    await new Promise((r) => setTimeout(r, 3)); // seat ids are time-based on main: keep them distinct
    const inv = await call(auth, "POST", owner, { action: "invite", name, pin, kind: "helper" });
    if (inv.statusCode !== 201 || !inv.body.person) { fail("owner could not add helper " + name + ": " + inv.statusCode + " " + JSON.stringify(inv.body)); return null; }
    const login = await call(auth, "POST", {}, { action: "login", workspace: D, pin });
    const tok = login.body && login.body.session && login.body.session.token;
    if (login.statusCode !== 200 || !tok) { fail("helper " + name + " could not sign in: " + login.statusCode); return null; }
    return { id: inv.body.person.id, tok };
  }

  async function expectHelper(h, label) {
    const seen = lib.personOf({ headers: { "x-session": h.tok, "x-workspace": D } }, D);
    if (!seen.person || seen.person.id !== h.id || lib.isOwner(seen.person)) fail(label + ": approved helper session did not come back as the helper (" + JSON.stringify(seen.person && { id: seen.person.id, role: seen.person.role }) + ")");
    else pass(label + ": approved helper session -> helper seat, not owner");
    const desk = await call(auth, "GET", { "x-session": h.tok, "x-workspace": D }, null, {}, "/api/desks");
    if (desk.statusCode !== 200) fail(label + ": approved helper GET /api/desks " + desk.statusCode);
    else pass(label + ": approved helper GET /api/desks 200");
  }

  async function expectRefused(h, label) {
    const hdr = { "x-session": h.tok, "x-workspace": D };
    const seen = lib.personOf({ headers: hdr }, D);
    if (seen.person) fail(label + ": personOf -> " + (seen.person.role || "") + " " + (seen.person.name || "") + (lib.isOwner(seen.person) ? " (OWNER)" : ""));
    else pass(label + ": personOf -> no seat");
    const desk = await call(auth, "GET", hdr, null, {}, "/api/desks");
    if (desk.statusCode === 200 || has(desk.body, "\"desk\"")) fail(label + ": GET /api/desks " + desk.statusCode + (has(desk.body, "\"owner\"") ? " as owner" : ""));
    else pass(label + ": GET /api/desks refused (" + desk.statusCode + ")");
    const deskPost = await call(auth, "POST", hdr, { action: "mine", slug: D }, {}, "/api/desks");
    if (deskPost.statusCode === 200) fail(label + ": POST /api/desks mine 200");
    else pass(label + ": POST /api/desks mine refused (" + deskPost.statusCode + ")");
    const jb = await call(jobs, "GET", hdr, null, {}, "/api/jobs");
    if (jb.statusCode === 200 || has(jb.body, "Olive private card")) fail(label + ": GET /api/jobs " + jb.statusCode);
    else pass(label + ": GET /api/jobs refused (" + jb.statusCode + ")");
    const up = await call(upload, "GET", hdr, null, {}, "/api/upload");
    if (up.statusCode === 200 || has(up.body, "dhs-ledger.pdf")) fail(label + ": GET /api/upload " + up.statusCode);
    else pass(label + ": GET /api/upload refused (" + up.statusCode + ")");
    const upFile = await call(upload, "GET", hdr, null, { id: "file_dhs" }, "/api/upload?id=file_dhs");
    if (upFile.statusCode === 302 || has(upFile.headers, "dhs-secret")) fail(label + ": GET /api/upload?id= opened the file");
    else pass(label + ": GET /api/upload?id= refused (" + upFile.statusCode + ")");
    const acc = await call(auth, "GET", hdr, null, {}, "/api/account?via=account");
    if (acc.statusCode === 200 || has(acc.body, "olive@example.test")) fail(label + ": GET /api/account " + acc.statusCode);
    else pass(label + ": GET /api/account refused (" + acc.statusCode + ")");
    const inv = await call(auth, "POST", hdr, { action: "invite", name: "Sneaky", pin: "9090", kind: "helper" });
    if (inv.statusCode === 201 || inv.statusCode === 200) fail(label + ": people invite " + inv.statusCode);
    else pass(label + ": people invite refused (" + inv.statusCode + ")");
    const appr = await call(auth, "POST", hdr, { action: "approve", id: h.id });
    if (appr.statusCode === 200) fail(label + ": helper re-approved its own seat");
    else pass(label + ": people approve (self) refused (" + appr.statusCode + ")");
    const adm = await call(admin, "GET", hdr, null, {}, "/api/admin");
    if (adm.statusCode === 200) fail(label + ": GET /api/admin " + adm.statusCode);
    else pass(label + ": GET /api/admin refused (" + adm.statusCode + ")");
    const ws = lib.mem.workspaces.find((w) => w && w.slug === D);
    if ((ws.people || []).some((p) => p && p.name === "Sneaky")) fail(label + ": a seat was added by the refused session");
  }

  async function expectOwner(label) {
    const seen = lib.personOf({ headers: owner }, D);
    if (!seen.person || !lib.isOwner(seen.person)) fail(label + ": owner session no longer owner");
    else pass(label + ": owner session still owner");
    const desk = await call(auth, "GET", owner, null, {}, "/api/desks");
    const jb = await call(jobs, "GET", owner, null, {}, "/api/jobs");
    const up = await call(upload, "GET", owner, null, {}, "/api/upload");
    const acc = await call(auth, "GET", owner, null, {}, "/api/account?via=account");
    if (desk.statusCode !== 200 || jb.statusCode !== 200 || up.statusCode !== 200 || acc.statusCode !== 200) fail(label + ": owner desks/jobs/upload/account " + [desk.statusCode, jb.statusCode, up.statusCode, acc.statusCode].join("/"));
    else pass(label + ": owner desks/jobs/upload/account all 200");
  }

  // 1. Deny.
  const h1 = await addHelper("Hank", "5151");
  if (!h1) return;
  await expectHelper(h1, "deny case");
  const denied = await call(auth, "POST", owner, { action: "deny", id: h1.id });
  if (denied.statusCode !== 200) fail("owner could not deny helper: " + denied.statusCode);
  await expectRefused(h1, "denied helper");
  await expectOwner("after deny");

  // 2. Remove.
  const h2 = await addHelper("Rita", "6161");
  if (!h2) return;
  await expectHelper(h2, "remove case");
  const removed = await call(auth, "POST", owner, { action: "remove", id: h2.id });
  if (removed.statusCode !== 200) fail("owner could not remove helper: " + removed.statusCode);
  await expectRefused(h2, "removed helper");
  await expectOwner("after remove");

  // 3. A helper whose seat is approved again works again as the helper (not owner).
  const back = await call(auth, "POST", owner, { action: "approve", id: h1.id });
  if (back.statusCode !== 200) fail("owner could not re-approve: " + back.statusCode);
  await expectHelper(h1, "re-approved");

  const wsD = lib.mem.workspaces.find((w) => w && w.slug === D);
  const seatOf = (ws, id) => (ws.people || []).find((p) => p && p.id === id) || null;
  function seenOn(tok, slug, extra) {
    return lib.personOf({ headers: Object.assign({ "x-session": tok, "x-workspace": slug }, extra || {}) }, slug);
  }
  function expectSeat(seen, wantId, label) {
    if (!seen.person || seen.person.id !== wantId || lib.isOwner(seen.person)) fail(label + ": wanted seat " + wantId + ", got " + JSON.stringify(seen.person && { id: seen.person.id, role: seen.person.role }));
    else pass(label + ": -> seat " + wantId + ", not owner");
  }
  function expectNone(seen, label) {
    if (seen.person) fail(label + ": personOf -> " + (seen.person.role || "") + " " + (seen.person.name || "") + (lib.isOwner(seen.person) ? " (OWNER)" : ""));
    else pass(label + ": personOf -> no seat");
  }

  // 4. A desk code (X-Pin) still opens a seat when the session does not count. Rita's seat is removed.
  const pia = await addHelper("Pia", "7171");
  if (!pia) return;
  expectSeat(seenOn(h2.tok, D, { "x-pin": "7171" }), pia.id, "removed session + approved helper pin");
  expectNone(seenOn(h2.tok, D, { "x-pin": "0000" }), "removed session + wrong pin");
  expectNone(seenOn(h2.tok, D, { "x-pin": "6161" }), "removed session + its own old pin");
  expectSeat(lib.personOf({ headers: { "x-workspace": D, "x-pin": "7171" } }, D), pia.id, "no session + approved helper pin");
  expectNone(lib.personOf({ headers: { "x-workspace": D, "x-pin": "0000" } }, D), "no session + wrong pin");
  const pinJobs = await call(jobs, "GET", { "x-session": h2.tok, "x-workspace": D, "x-pin": "7171" }, null, {}, "/api/jobs");
  if (pinJobs.statusCode !== 200) fail("removed session + approved helper pin: GET /api/jobs " + pinJobs.statusCode);
  else pass("removed session + approved helper pin: GET /api/jobs 200");
  const wrongJobs = await call(jobs, "GET", { "x-session": h2.tok, "x-workspace": D, "x-pin": "0000" }, null, {}, "/api/jobs");
  if (wrongJobs.statusCode === 200 || has(wrongJobs.body, "Olive private card")) fail("removed session + wrong pin: GET /api/jobs " + wrongJobs.statusCode);
  else pass("removed session + wrong pin: GET /api/jobs refused (" + wrongJobs.statusCode + ")");

  // 5. The account-level owner id (<accountId>_owner, from an email sign-in) still opens the desk as owner.
  const deskAcct = (lib.mem.accounts || []).find((a) => a && a.id === wsD.accountId) || { id: wsD.accountId, email: "olive@example.test" };
  if (!deskAcct.id) fail("desk has no account id");
  const acctOwner = lib.issueSession({ id: deskAcct.id + "_owner", name: "Olive", role: "owner", kind: "owner", status: "approved", accountId: deskAcct.id, email: deskAcct.email || "" }, wsD, deskAcct);
  const acctSeen = seenOn(acctOwner.token, D);
  if (!acctSeen.person || !lib.isOwner(acctSeen.person)) fail("account owner id session: not owner (" + JSON.stringify(acctSeen.person && { id: acctSeen.person.id, role: acctSeen.person.role }) + ")");
  else pass("account owner id session -> owner");
  const acctJobs = await call(jobs, "GET", { "x-session": acctOwner.token, "x-workspace": D }, null, {}, "/api/jobs");
  if (acctJobs.statusCode !== 200) fail("account owner id session: GET /api/jobs " + acctJobs.statusCode);
  else pass("account owner id session: GET /api/jobs 200");

  // 6. An account holding two seats here: its closed seat's session reaches the other seat by account,
  // only while that other seat is open.
  const sam = await addHelper("Sam", "8181");
  const tess = await addHelper("Tess", "8282");
  if (!sam || !tess) return;
  const Y = { id: "acct_dhs_y" };
  seatOf(wsD, sam.id).accountId = Y.id;
  seatOf(wsD, tess.id).accountId = Y.id;
  const samTok = lib.issueSession(seatOf(wsD, sam.id), wsD, Y).token;
  expectSeat(seenOn(samTok, D), sam.id, "account seat approved");
  if ((await call(auth, "POST", owner, { action: "deny", id: sam.id })).statusCode !== 200) fail("owner could not deny Sam");
  expectSeat(seenOn(samTok, D), tess.id, "denied seat, same account's other seat approved");
  const samJobs = await call(jobs, "GET", { "x-session": samTok, "x-workspace": D }, null, {}, "/api/jobs");
  if (samJobs.statusCode !== 200) fail("denied seat, account's other seat approved: GET /api/jobs " + samJobs.statusCode);
  else pass("denied seat, account's other seat approved: GET /api/jobs 200");
  if ((await call(auth, "POST", owner, { action: "deny", id: tess.id })).statusCode !== 200) fail("owner could not deny Tess");
  await expectRefused({ id: tess.id, tok: samTok }, "account path, other seat denied");
  if ((await call(auth, "POST", owner, { action: "approve", id: tess.id })).statusCode !== 200) fail("owner could not re-approve Tess");
  expectSeat(seenOn(samTok, D), tess.id, "account path, other seat approved again");
  if ((await call(auth, "POST", owner, { action: "remove", id: tess.id })).statusCode !== 200) fail("owner could not remove Tess");
  await expectRefused({ id: tess.id, tok: samTok }, "account path, other seat removed");

  // 7. A seat's state on desk A is not carried to desk B.
  const B = "dhs-desk-b";
  const openB = await call(auth, "POST", { "x-workspace": B }, { action: "open", slug: B, biz: "dhs desk b", name: "Bea", pin: "4343", email: "bea@example.test" });
  const ownerB = openB.body && openB.body.session && { "x-session": openB.body.session.token, "x-workspace": B };
  if (openB.statusCode !== 201 || !ownerB) { fail("could not open desk B: " + openB.statusCode); return; }
  const wsB = lib.mem.workspaces.find((w) => w && w.slug === B);
  await new Promise((r) => setTimeout(r, 3));
  const zoeInv = await call(auth, "POST", ownerB, { action: "invite", name: "Zoe", pin: "9393", kind: "helper" });
  const zed = await addHelper("Zed", "9292");
  if (zoeInv.statusCode !== 201 || !zed) { fail("could not add Zoe / Zed: " + zoeInv.statusCode); return; }
  const Z = { id: "acct_dhs_z" };
  seatOf(wsD, zed.id).accountId = Z.id;
  seatOf(wsB, zoeInv.body.person.id).accountId = Z.id;
  const zedTok = lib.issueSession(seatOf(wsD, zed.id), wsD, Z).token;
  if ((await call(auth, "POST", owner, { action: "deny", id: zed.id })).statusCode !== 200) fail("owner could not deny Zed");
  expectNone(seenOn(zedTok, D), "denied on desk A, on desk A");
  expectSeat(seenOn(zedTok, B), zoeInv.body.person.id, "denied on desk A, same account's open seat on desk B");
  const hankOnB = seenOn(h1.tok, B);
  const deniedOnB = seenOn(zed.tok, B);
  if (hankOnB.person || hankOnB.denied || hankOnB.pending) fail("desk A helper session on desk B: " + JSON.stringify({ person: hankOnB.person && hankOnB.person.id, denied: hankOnB.denied, pending: hankOnB.pending }));
  else pass("desk A helper session on desk B: stranger there");
  if (deniedOnB.person || deniedOnB.denied || deniedOnB.pending) fail("desk A denied seat's pin session on desk B carried its desk A state: " + JSON.stringify({ person: deniedOnB.person && deniedOnB.person.id, denied: deniedOnB.denied, pending: deniedOnB.pending }));
  else pass("desk A denied seat's session on desk B: stranger there, not marked denied");
}

main().then(() => {
  if (failed) { console.error(failed + " check(s) failed"); process.exit(1); }
  console.log("check-denied-helper-session: all good");
}).catch((e) => { console.error("FAIL threw " + (e && e.stack || e)); process.exit(1); });
