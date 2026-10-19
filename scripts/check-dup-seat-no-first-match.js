#!/usr/bin/env node
// Proves AIA refuses instead of picking when two seats on one desk share an id.
// A session whose seat id matches two seats opens nothing (jobs, desks, upload, admin GETs),
// and the owner's "seat" edit (setSeatCan) on that id is a 409 that changes neither seat.
// Unique seats keep working. Seat ids also repeat across desks (p_owner): a session's seat id,
// email and owner flag only count on the desk the session was issued for. Runs the real handlers against a temp store. No network.
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const store = path.join(os.tmpdir(), "aia-dup-seat-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
delete global.__aia;
delete global.__aiaHydrate;

const DUP = "Two seats on this desk share that id, so AIA can't tell who you mean. Nothing changed.";
let failed = 0;
function fail(msg) {
  if (!failed) console.error("FAIL (first) " + msg);
  else console.error("FAIL " + msg);
  failed += 1;
  process.exitCode = 1;
}
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
function snap(x) { return JSON.stringify(x); }

async function main() {
  const auth = require(path.join(root, "api/auth"));
  const jobs = require(path.join(root, "api/jobs"));
  const upload = require(path.join(root, "api/upload"));
  const admin = require(path.join(root, "api/admin"));
  const lib = require(path.join(root, "api/_lib"));
  const desk = require(path.join(root, "api/_desk"));
  await lib.ready();

  const S = "dup-seat-desk";
  const opened = await call(auth, "POST", { "x-workspace": S }, { action: "open", slug: S, biz: "dup seat desk", name: "Ann", pin: "1111", email: "ann@example.test" });
  const annTok = opened.body && opened.body.session && opened.body.session.token;
  if (!annTok) { fail("could not open desk: " + opened.statusCode + " " + JSON.stringify(opened.body)); return finish(); }
  const own = { "x-session": annTok, "x-workspace": S };

  async function helper(name, pin) {
    const j = await call(auth, "POST", { "x-workspace": S }, { action: "join", name, pin, kind: "helper" });
    const id = j.body && j.body.person && j.body.person.id;
    await call(auth, "POST", own, { action: "approve", id });
    const l = await call(auth, "POST", { "x-workspace": S }, { action: "login", workspace: S, pin });
    return { id, tok: l.body && l.body.session && l.body.session.token };
  }
  const hal = await helper("Hal", "3333");
  const uma = await helper("Uma", "4444");
  if (!hal.tok || !uma.tok) { fail("helper logins should issue sessions"); return finish(); }

  const row = lib.mem.workspaces.find((w) => w && w.slug === S);
  const halSeat = row.people.find((p) => p && p.id === hal.id);
  // Hal is an approved, owner-like helper: every soft tap on.
  halSeat.kind = "staff";
  halSeat.can = Object.assign({}, halSeat.can, { queue: true, capture: true, qualify: true, draft: true, hand: true, send: true, invite: true, edit: true, explore: true, export: true, rules: true });
  // A second seat already carries Hal's id: a denied stranger (old time-based ids could clash).
  row.people.push({ id: hal.id, name: "Dee", role: "employee", kind: "helper", email: "dee@example.test", status: "denied", pin: lib.hashPin ? lib.hashPin("5555") : "x", can: {}, createdAt: new Date().toISOString() });
  lib.mem.jobs.unshift({ id: "job_dup_secret", workspace: S, title: "Dup desk private card", status: "exception", step: "Qualify", createdAt: new Date().toISOString() });
  lib.mem.files.unshift({ id: "file_dup_secret", workspace: S, name: "dup-ledger.pdf", type: "application/pdf", remoteUrl: "https://blob.example.test/dup-secret.pdf", createdAt: new Date().toISOString() });
  await lib.save();
  pass("seeded desk with Hal (approved staff) and Dee (denied) sharing id " + hal.id);

  const before = snap(row.people);
  const storeBefore = snap({ people: row.people, jobs: lib.mem.jobs.length, files: lib.mem.files.length });
  const halH = { "x-session": hal.tok, "x-workspace": S };

  // 1. The session for the shared id opens nothing.
  const who = lib.personOf({ headers: halH }, S);
  if (who.person) fail("personOf: session for a shared seat id opened " + who.person.name + " (first match) instead of nothing");
  else pass("personOf: session for a shared seat id -> no person");
  const whoCookie = lib.personOf({ headers: { cookie: "aia_session=" + encodeURIComponent(hal.tok) }, query: { workspace: S } }, "");
  if (whoCookie.person) fail("personOf: cookie session for a shared seat id opened " + whoCookie.person.name);
  else pass("personOf: cookie + ?workspace for a shared seat id -> no person");

  const gets = [
    ["GET /api/jobs", jobs, "/api/jobs", {}],
    ["GET /api/desks", auth, "/api/desks", {}],
    ["GET /api/upload", upload, "/api/upload", {}],
    ["GET /api/upload?id=", upload, "/api/upload?id=file_dup_secret", { id: "file_dup_secret" }],
    ["GET /api/admin", admin, "/api/admin", {}]
  ];
  for (const g of gets) {
    const r = await call(g[1], "GET", halH, null, g[3], g[2]);
    const leak = has(r.body, "Dup desk private card") || has(r.body, "dup-ledger.pdf") || has(r.body, "dup-secret.pdf") || r.statusCode === 302 || (r.body && (r.body.desk || r.body.jobs || r.body.shop));
    if ([401, 403, 404].indexOf(r.statusCode) < 0 || leak) fail(g[0] + ": session for a shared seat id got " + r.statusCode + (leak ? " with desk data" : ""));
    else pass(g[0] + ": shared seat id refused (" + r.statusCode + "), no card data (main: 200 for the first open duplicate)");
  }
  // GET /api/auth answers every caller with the public desk card; the seat must read as no one.
  const me = await call(auth, "GET", halH, null, {}, "/api/auth");
  if (me.body && me.body.you) fail("GET /api/auth: session for a shared seat id came back as " + (me.body.you.name || "a seat"));
  else pass("GET /api/auth: shared seat id reads as no one (you: null)");
  const exp = await call(auth, "POST", halH, { action: "export" }, {}, "/api/desks");
  if ([401, 403, 404].indexOf(exp.statusCode) < 0 || (exp.body && exp.body.pack) || has(exp.body, "Dup desk private card")) fail("POST /api/desks export: shared seat id exported the desk (" + exp.statusCode + ")");
  else pass("POST /api/desks export: shared seat id refused (" + exp.statusCode + ")");
  const bizBefore = row.biz;
  const edit = await call(auth, "POST", halH, { action: "edit", biz: "taken over" }, {}, "/api/desks");
  if ([401, 403, 404].indexOf(edit.statusCode) < 0 || row.biz !== bizBefore) fail("POST /api/desks edit: shared seat id edited the shop (" + edit.statusCode + ")");
  else pass("POST /api/desks edit: shared seat id refused (" + edit.statusCode + "), shop unchanged");
  if (snap({ people: row.people, jobs: lib.mem.jobs.length, files: lib.mem.files.length }) !== storeBefore) fail("store changed while the shared seat id was refused");
  else pass("store unchanged by the refused session");

  // 2. Owner edits the shared id with action "seat": 409, neither seat changes.
  const seatDesk = await call(auth, "POST", own, { action: "seat", id: hal.id, can: { send: false, export: false } }, {}, "/api/desks");
  if (seatDesk.statusCode !== 409 || !seatDesk.body || seatDesk.body.error !== DUP) fail("POST /api/desks seat on a shared id should be 409 + plain message, got " + seatDesk.statusCode + " " + JSON.stringify(seatDesk.body && seatDesk.body.error));
  else pass("POST /api/desks seat on a shared id -> 409 \"" + DUP + "\"");
  const seatAdmin = await call(admin, "POST", own, { action: "seat", id: hal.id, kind: "member" }, {}, "/api/admin");
  if (seatAdmin.statusCode !== 409 || !seatAdmin.body || seatAdmin.body.error !== DUP) fail("POST /api/admin seat on a shared id should be 409, got " + seatAdmin.statusCode);
  else pass("POST /api/admin seat on a shared id -> 409");
  const direct = desk.setSeatCan(row, hal.id, { can: { queue: false } });
  if (direct.ok || direct.status !== 409 || direct.error !== DUP) fail("setSeatCan on a shared id should refuse with 409, got " + JSON.stringify(direct));
  else pass("setSeatCan on a shared id refuses (409)");
  const talk = await call(admin, "POST", own, { action: "talk", id: hal.id, text: "private note for Hal" }, {}, "/api/admin");
  if (talk.statusCode !== 409 || has(row.people, "private note for Hal")) fail("POST /api/admin talk on a shared id should be 409 with no note written, got " + talk.statusCode);
  else pass("POST /api/admin talk on a shared id -> 409, no note on either seat");
  if (snap(row.people) !== before) fail("a refused edit changed a seat sharing the id");
  else pass("both seats sharing the id are unchanged");

  // 3. Unique seats still work.
  const umaH = { "x-session": uma.tok, "x-workspace": S };
  const umaWho = lib.personOf({ headers: umaH }, S);
  if (!umaWho.person || umaWho.person.name !== "Uma") fail("unique helper session should still be Uma");
  else pass("unique helper session is still Uma");
  const umaDesk = await call(auth, "GET", umaH, null, {}, "/api/desks");
  const umaJobs = await call(jobs, "GET", umaH, null, {}, "/api/jobs");
  if (umaDesk.statusCode !== 200 || umaJobs.statusCode !== 200) fail("unique helper should open desk and jobs, got " + umaDesk.statusCode + " / " + umaJobs.statusCode);
  else pass("unique helper opens GET /api/desks and GET /api/jobs (200)");
  const annDesk = await call(auth, "GET", own, null, {}, "/api/desks");
  if (annDesk.statusCode !== 200) fail("owner should still open the desk, got " + annDesk.statusCode);
  else pass("owner still opens the desk");
  const halAndDee = snap(row.people.filter((p) => p && p.id === hal.id));
  const umaEdit = await call(auth, "POST", own, { action: "seat", id: uma.id, can: { send: false, export: true } }, {}, "/api/desks");
  const umaSeat = row.people.find((p) => p && p.id === uma.id);
  if (umaEdit.statusCode !== 200 || !umaSeat.can || umaSeat.can.send !== false || umaSeat.can.export !== true) fail("seat edit on a unique id should change it, got " + umaEdit.statusCode + " " + JSON.stringify(umaSeat && umaSeat.can));
  else pass("seat edit on a unique id changes that seat");
  if (snap(row.people.filter((p) => p && p.id === hal.id)) !== halAndDee) fail("unique seat edit touched the seats sharing Hal's id");
  else pass("unique seat edit changed only that seat");
  const umaTalk = await call(admin, "POST", own, { action: "talk", id: uma.id, text: "hi Uma" }, {}, "/api/admin");
  if (umaTalk.statusCode !== 200) fail("talk on a unique id should still work, got " + umaTalk.statusCode);
  else pass("talk on a unique id still works");

  // 4. Seat ids repeat across desks: every old desk's first owner is "p_owner". A session only
  //    opens the desk it was issued for by seat id; on another desk that id means nothing.
  const PA = "dup-po-desk-a";
  const PB = "dup-po-desk-b";
  const now = new Date().toISOString();
  lib.mem.workspaces.push({ slug: PA, name: "Pia", biz: "po desk a", pin: lib.hashPin("6161"), people: [], createdAt: now });
  lib.mem.workspaces.push({ slug: PB, name: "Bo", biz: "po desk b", pin: lib.hashPin("7171"), people: [], createdAt: now });
  lib.ensurePeople(lib.mem.workspaces.find((w) => w.slug === PA));
  lib.ensurePeople(lib.mem.workspaces.find((w) => w.slug === PB));
  lib.mem.jobs.unshift({ id: "job_po_b", workspace: PB, title: "Bo private card", status: "exception", step: "Qualify", createdAt: now });
  await lib.save();
  const pia = await call(auth, "POST", { "x-workspace": PA }, { action: "open", slug: PA, pin: "6161" });
  const piaTok = pia.body && pia.body.session && pia.body.session.token;
  const piaSeat = pia.body && pia.body.you;
  if (!piaTok || !piaSeat || piaSeat.id !== "p_owner") fail("desk A code should issue a p_owner session: " + pia.statusCode + " " + JSON.stringify(pia.body && pia.body.you));
  else pass("desk A and desk B both have owner seat id p_owner; A's session is for p_owner");
  const poB = lib.personOf({ headers: { "x-session": piaTok, "x-workspace": PB } }, PB);
  if (poB.person) fail("personOf: desk A p_owner session opened desk B as " + (poB.person.role || "") + " " + (poB.person.name || ""));
  else pass("personOf: desk A p_owner session -> no person on desk B");
  const poBq = lib.personOf({ headers: { cookie: "aia_session=" + encodeURIComponent(piaTok) }, query: { workspace: PB } }, "");
  if (poBq.person) fail("personOf: desk A p_owner cookie + ?workspace=B opened desk B");
  else pass("personOf: desk A p_owner cookie + ?workspace=B -> no person");
  const poJobs = await call(jobs, "GET", { "x-session": piaTok, "x-workspace": PB }, null, {}, "/api/jobs");
  if (poJobs.statusCode === 200 || has(poJobs.body, "Bo private card")) fail("GET /api/jobs: desk A p_owner session read desk B (" + poJobs.statusCode + ")");
  else pass("GET /api/jobs: desk A p_owner session refused on desk B (" + poJobs.statusCode + ")");
  const poDesk = await call(auth, "GET", { "x-session": piaTok, "x-workspace": PB }, null, {}, "/api/desks");
  if (poDesk.statusCode === 200 || (poDesk.body && poDesk.body.desk)) fail("GET /api/desks: desk A p_owner session read desk B (" + poDesk.statusCode + ")");
  else pass("GET /api/desks: desk A p_owner session refused on desk B (" + poDesk.statusCode + ")");
  const poA = lib.personOf({ headers: { "x-session": piaTok, "x-workspace": PA } }, PA);
  const poAJobs = await call(jobs, "GET", { "x-session": piaTok, "x-workspace": PA }, null, {}, "/api/jobs");
  if (!poA.person || poA.person.name !== "Pia" || !lib.isOwner(poA.person) || poAJobs.statusCode !== 200) fail("desk A p_owner session should still open desk A as owner (" + poAJobs.statusCode + ")");
  else pass("desk A p_owner session still opens desk A as its owner");
  const poPin = lib.personOf({ headers: { "x-session": piaTok, "x-workspace": PB, "x-pin": "7171" } }, PB);
  if (!poPin.person || poPin.person.name !== "Bo") fail("desk B's own code should still open desk B");
  else pass("desk B's own code still opens desk B");

  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  if (pkg.indexOf("scripts/check-dup-seat-no-first-match.js") < 0) fail("package.json test must run this check");
  else pass("package.json test runs this check");
  return finish();
}
function finish() {
  try { fs.rmSync(store, { force: true }); } catch (e) {}
  if (failed) { console.error("check-dup-seat-no-first-match: " + failed + " failed"); process.exit(1); }
  console.log("check-dup-seat-no-first-match: ok");
}
main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
