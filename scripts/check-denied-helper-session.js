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
}

main().then(() => {
  if (failed) { console.error(failed + " check(s) failed"); process.exit(1); }
  console.log("check-denied-helper-session: all good");
}).catch((e) => { console.error("FAIL threw " + (e && e.stack || e)); process.exit(1); });
