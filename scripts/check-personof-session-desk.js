#!/usr/bin/env node
// Proves a session only opens the desk it was issued for, or a desk where that
// session's own account holds an open seat (seat.accountId). An owner session for
// desk A sent with X-Workspace: B (or ?workspace=B) must not come back as B's owner.
// Runs the real handlers (GET /api/desks, GET /api/upload, GET /api/jobs,
// POST /api/desks list) against a temp store. No network.
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const store = path.join(os.tmpdir(), "aia-personof-desk-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
delete global.__aia;
delete global.__aiaHydrate;

let failed = 0;
function fail(msg) {
  console.error("FAIL " + msg);
  failed += 1;
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; }
  };
}

async function call(handler, method, headers, body, query, url) {
  const res = mockRes();
  await handler({
    method: method,
    headers: headers || {},
    body: body || {},
    query: query || {},
    url: url || "/api/auth"
  }, res);
  return res;
}

function leaked(body, bit) {
  return JSON.stringify(body == null ? "" : body).indexOf(bit) >= 0;
}

async function openDesk(auth, slug, name, pin, email, session) {
  const r = await call(auth, "POST", Object.assign({ "x-workspace": slug }, session ? { "x-session": session } : {}), {
    action: "open", slug: slug, biz: slug.replace(/-/g, " "), name: name, pin: pin, email: email || ""
  });
  if (r.statusCode !== 201 || !r.body || !r.body.session || !r.body.session.token) {
    fail("could not open " + slug + ": " + r.statusCode + " " + JSON.stringify(r.body));
    return "";
  }
  return r.body.session.token;
}

async function main() {
  const auth = require(path.join(root, "api/auth"));
  const jobs = require(path.join(root, "api/jobs"));
  const upload = require(path.join(root, "api/upload"));
  const lib = require(path.join(root, "api/_lib"));
  const account = require(path.join(root, "api/_account"));
  await lib.ready();
  const personOf = lib.personOf;

  const A = "pod-desk-a";
  const B = "pod-desk-b";
  const annTok = await openDesk(auth, A, "Ann", "1111", "ann@example.test");
  const beaTok = await openDesk(auth, B, "Bea", "2222", "bea@example.test");
  const secretUrl = "https://blob.example.test/pod-b-secret-77.pdf";
  lib.mem.files.unshift({ id: "file_pod_b", workspace: B, name: "b-ledger.pdf", type: "application/pdf", remoteUrl: secretUrl, createdAt: new Date().toISOString() });
  lib.mem.jobs.unshift({ id: "job_pod_b", workspace: B, title: "Bea private card", status: "exception", step: "Qualify", createdAt: new Date().toISOString() });
  pass("opened desk A (Ann) and desk B (Bea), two separate accounts");

  // 1. Owner session for A, X-Workspace: B.
  const direct = personOf({ headers: { "x-session": annTok, "x-workspace": B } }, B);
  if (direct.person) fail("A owner session + X-Workspace B came back as " + (direct.person.role || "") + " " + (direct.person.name || "") + " on B");
  else pass("personOf: A owner session + X-Workspace B -> no person on B");
  const viaQuery = personOf({ headers: { "x-session": annTok }, query: { workspace: B } }, "");
  if (viaQuery.person) fail("A owner session + ?workspace=B came back as " + (viaQuery.person.role || "") + " " + (viaQuery.person.name || "") + " on B");
  else pass("personOf: A owner session + ?workspace=B -> no person on B");
  const viaCookie = personOf({ headers: { cookie: "aia_session=" + encodeURIComponent(annTok), "x-workspace": B } }, B);
  if (viaCookie.person) fail("A owner cookie + X-Workspace B came back as a seat on B");
  else pass("personOf: A owner cookie + X-Workspace B -> no person on B");

  const deskB = await call(auth, "GET", { "x-session": annTok, "x-workspace": B }, null, {}, "/api/desks");
  if (deskB.statusCode === 200 || (deskB.body && deskB.body.desk)) fail("GET /api/desks: A owner session read desk B: " + deskB.statusCode);
  else pass("GET /api/desks: A owner session + X-Workspace B refused (" + deskB.statusCode + ")");
  const deskBq = await call(auth, "GET", { "x-session": annTok }, null, { workspace: B }, "/api/desks?workspace=" + B);
  if (deskBq.statusCode === 200 || (deskBq.body && deskBq.body.desk)) fail("GET /api/desks?workspace=B: A owner session read desk B: " + deskBq.statusCode);
  else pass("GET /api/desks?workspace=B: A owner session refused (" + deskBq.statusCode + ")");

  const upB = await call(upload, "GET", { "x-session": annTok, "x-workspace": B }, null, {}, "/api/upload");
  if (upB.statusCode === 200 || leaked(upB.body, secretUrl) || leaked(upB.body, "b-ledger.pdf")) fail("GET /api/upload: A owner session listed desk B files: " + upB.statusCode);
  else pass("GET /api/upload: A owner session + X-Workspace B refused (" + upB.statusCode + ")");
  const upBq = await call(upload, "GET", { "x-session": annTok }, null, { workspace: B }, "/api/upload?workspace=" + B);
  if (upBq.statusCode === 200 || leaked(upBq.body, "b-ledger.pdf")) fail("GET /api/upload?workspace=B: A owner session listed desk B files: " + upBq.statusCode);
  else pass("GET /api/upload?workspace=B: A owner session refused (" + upBq.statusCode + ")");
  const upFile = await call(upload, "GET", { "x-session": annTok, "x-workspace": B }, null, { id: "file_pod_b" }, "/api/upload?id=file_pod_b");
  if (upFile.statusCode === 302 || upFile.headers.Location === secretUrl) fail("GET /api/upload?id=: A owner session opened a desk B file");
  else pass("GET /api/upload?id=: A owner session cannot open a desk B file (" + upFile.statusCode + ")");

  const jobsB = await call(jobs, "GET", { "x-session": annTok, "x-workspace": B }, null, {}, "/api/jobs");
  if (jobsB.statusCode === 200 || leaked(jobsB.body, "Bea private card")) fail("GET /api/jobs: A owner session read desk B queue: " + jobsB.statusCode);
  else pass("GET /api/jobs: A owner session + X-Workspace B refused (" + jobsB.statusCode + ")");

  // Swapped body ids do not matter: POST /api/desks list with B's ids in the body.
  const bOwner = (lib.mem.workspaces.find((w) => w && w.slug === B).people || [])[0] || {};
  const listed = await call(auth, "POST", { "x-session": annTok, "x-workspace": A }, {
    action: "list", personId: bOwner.id, accountId: bOwner.accountId, workspace: B,
    desks: [{ slug: B, personId: bOwner.id, accountId: bOwner.accountId }, { slug: A }]
  }, {}, "/api/desks");
  const rowB = ((listed.body && listed.body.desks) || []).find((d) => d && d.slug === B);
  const rowA = ((listed.body && listed.body.desks) || []).find((d) => d && d.slug === A);
  if (!rowB || rowB.ok !== false) fail("POST /api/desks list: A owner session with B ids in the body opened B: " + JSON.stringify(rowB));
  else pass("POST /api/desks list: B ids in the body do not open B");
  if (!rowA || rowA.ok !== true) fail("POST /api/desks list: A owner session should still open A: " + JSON.stringify(rowA));
  else pass("POST /api/desks list: A owner session still opens A");

  // 2. Own desk still works, by header, query, and cookie.
  const ownA = personOf({ headers: { "x-session": annTok, "x-workspace": A } }, A);
  if (!ownA.person || !lib.isOwner(ownA.person) || ownA.person.name !== "Ann") fail("A owner session should still be A's owner");
  else pass("A owner session is still A's owner");
  const ownDeskA = await call(auth, "GET", { "x-session": annTok, "x-workspace": A }, null, {}, "/api/desks");
  const ownUpA = await call(upload, "GET", { cookie: "aia_session=" + encodeURIComponent(annTok) }, null, { workspace: A }, "/api/upload?workspace=" + A);
  if (ownDeskA.statusCode !== 200 || ownUpA.statusCode !== 200) fail("own desk reads should stay 200, got " + ownDeskA.statusCode + " / " + ownUpA.statusCode);
  else pass("GET /api/desks and GET /api/upload still open A for its own session");
  const ownB = personOf({ headers: { "x-session": beaTok, "x-workspace": B } }, B);
  if (!ownB.person || !lib.isOwner(ownB.person) || ownB.person.name !== "Bea") fail("B owner session should still be B's owner");
  else pass("B owner session is still B's owner");

  // 3. X-Pin path unchanged, even with a mismatched session on top.
  const pinB = personOf({ headers: { "x-session": annTok, "x-workspace": B, "x-pin": "2222" } }, B);
  if (!pinB.person || pinB.person.name !== "Bea" || !lib.isOwner(pinB.person)) fail("A session + B's real code should open B by the code");
  else pass("mismatched session falls through to X-Pin: B's real code still opens B");
  const wrongPin = personOf({ headers: { "x-session": annTok, "x-workspace": B, "x-pin": "0000" } }, B);
  if (wrongPin.person) fail("A session + a wrong code must not open B");
  else pass("mismatched session + wrong code -> no person");
  const barePin = personOf({ headers: { "x-workspace": B, "x-pin": "2222" } }, B);
  if (!barePin.person || barePin.person.name !== "Bea") fail("X-Pin alone should still open B");
  else pass("X-Pin alone still opens B");

  // 4. Helper session on A can't become anything on B.
  const join = await call(auth, "POST", { "x-workspace": A }, { action: "join", name: "Hal", pin: "3333", kind: "helper" });
  const halId = join.body && join.body.person && join.body.person.id;
  await call(auth, "POST", { "x-workspace": A, "x-session": annTok }, { action: "approve", id: halId });
  const halLogin = await call(auth, "POST", { "x-workspace": A }, { action: "login", workspace: A, pin: "3333" });
  const halTok = halLogin.body && halLogin.body.session && halLogin.body.session.token;
  if (!halTok) fail("helper login on A should issue a session: " + halLogin.statusCode + " " + JSON.stringify(halLogin.body));
  const halA = personOf({ headers: { "x-session": halTok, "x-workspace": A } }, A);
  if (!halA.person || halA.person.name !== "Hal" || lib.isOwner(halA.person)) fail("helper session should still be Hal on A");
  else pass("helper session is still Hal (helper) on A");
  const halB = personOf({ headers: { "x-session": halTok, "x-workspace": B } }, B);
  if (halB.person) fail("helper session for A came back as " + (halB.person.role || "") + " " + (halB.person.name || "") + " on B");
  else pass("helper session for A -> no person on B");
  const halUpB = await call(upload, "GET", { "x-session": halTok, "x-workspace": B }, null, {}, "/api/upload");
  if (halUpB.statusCode === 200) fail("GET /api/upload: helper session for A listed desk B files");
  else pass("GET /api/upload: helper session for A refused on B (" + halUpB.statusCode + ")");

  // 5. Pending / denied unchanged (X-Pin and mismatched session alike).
  const pat = await call(auth, "POST", { "x-workspace": B }, { action: "join", name: "Pat", pin: "4444", kind: "helper" });
  const patId = pat.body && pat.body.person && pat.body.person.id;
  const waiting = personOf({ headers: { "x-workspace": B, "x-pin": "4444" } }, B);
  if (!waiting.pending || waiting.person) fail("waiting seat by code should stay pending");
  else pass("waiting seat by code is still pending");
  const waitingMixed = personOf({ headers: { "x-session": annTok, "x-workspace": B, "x-pin": "4444" } }, B);
  if (!waitingMixed.pending || waitingMixed.person) fail("A session + waiting B code should read as pending on B, got " + JSON.stringify({ pending: waitingMixed.pending, person: waitingMixed.person && waitingMixed.person.name }));
  else pass("A session + waiting B code reads as pending, not owner");
  const deskWait = await call(auth, "GET", { "x-workspace": B, "x-pin": "4444" }, null, {}, "/api/desks");
  if (deskWait.statusCode !== 403 || !deskWait.body || !deskWait.body.pending) fail("GET /api/desks: waiting seat should stay 403 pending, got " + deskWait.statusCode);
  else pass("GET /api/desks: waiting seat still 403 pending");
  await call(auth, "POST", { "x-workspace": B, "x-session": beaTok }, { action: "deny", id: patId });
  const denied = personOf({ headers: { "x-workspace": B, "x-pin": "4444" } }, B);
  if (!denied.denied || denied.person) fail("denied seat by code should stay denied");
  else pass("denied seat by code is still denied");
  const deniedMixed = personOf({ headers: { "x-session": annTok, "x-workspace": B, "x-pin": "4444" } }, B);
  if (!deniedMixed.denied || deniedMixed.person) fail("A session + denied B code should read as denied on B");
  else pass("A session + denied B code reads as denied, not owner");

  // 6. One account that genuinely owns two desks still opens both with one session.
  const C = "pod-desk-c";
  const D = "pod-desk-d";
  const caraTok = await openDesk(auth, C, "Cara", "5555", "cara@example.test");
  // Opening a second desk with the same account email files it under the same account (createOwnerAccount).
  await openDesk(auth, D, "Cara", "6666", "cara@example.test", caraTok);
  const rowC = lib.mem.workspaces.find((w) => w && w.slug === C);
  const rowD = lib.mem.workspaces.find((w) => w && w.slug === D);
  const accC = account.accountForDesk(rowC);
  if (!accC || account.accountForDesk(rowD) !== accC || rowD.accountId !== accC.id) fail("C and D should be one account");
  const caraD = personOf({ headers: { "x-session": caraTok, "x-workspace": D } }, D);
  if (!caraD.person || !lib.isOwner(caraD.person) || caraD.person.accountId !== accC.id) fail("an account owning C and D should open D with its C session");
  else pass("same account owns C and D: C session opens D as owner");
  const caraDesks = await call(auth, "GET", { "x-session": caraTok, "x-workspace": D }, null, {}, "/api/desks");
  const caraUp = await call(upload, "GET", { "x-session": caraTok, "x-workspace": D }, null, {}, "/api/upload");
  if (caraDesks.statusCode !== 200 || caraUp.statusCode !== 200) fail("C session on D should read /api/desks and /api/upload, got " + caraDesks.statusCode + " / " + caraUp.statusCode);
  else pass("GET /api/desks and GET /api/upload open D for the account's C session");
  const dLogin = await call(auth, "POST", { "x-workspace": D }, { action: "login", workspace: D, pin: "6666" });
  const dTok = dLogin.body && dLogin.body.session && dLogin.body.session.token;
  const dOnC = personOf({ headers: { "x-session": dTok, "x-workspace": C } }, C);
  if (!dOnC.person || !lib.isOwner(dOnC.person)) fail("D owner session (same account) should open C");
  else pass("same account: D session opens C as owner");
  const caraList = await call(auth, "POST", { "x-session": caraTok }, { action: "list", desks: [{ slug: C }, { slug: D }, { slug: B }] }, {}, "/api/desks");
  const okSlugs = ((caraList.body && caraList.body.desks) || []).filter((d) => d && d.ok).map((d) => d.slug).sort().join(",");
  if (okSlugs !== [C, D].sort().join(",")) fail("POST /api/desks list with Cara's session should open C and D only, got " + okSlugs);
  else pass("POST /api/desks list: one session opens the account's own desks, not B");
  const caraB = personOf({ headers: { "x-session": caraTok, "x-workspace": B } }, B);
  if (caraB.person) fail("Cara's session must not open B");
  else pass("multi-desk account session still gets nothing on B");

  // 7. A helper on C (an account with several desks) does not ride the owner's accountId to D.
  await call(auth, "POST", { "x-workspace": C }, { action: "join", name: "Hank", pin: "7777", kind: "helper" });
  const hank = (rowC.people || []).find((p) => p && p.name === "Hank");
  await call(auth, "POST", { "x-workspace": C, "x-session": caraTok }, { action: "approve", id: hank && hank.id });
  const hankLogin = await call(auth, "POST", { "x-workspace": C }, { action: "login", workspace: C, pin: "7777" });
  const hankTok = hankLogin.body && hankLogin.body.session && hankLogin.body.session.token;
  const hankC = personOf({ headers: { "x-session": hankTok, "x-workspace": C } }, C);
  if (!hankC.person || hankC.person.name !== "Hank") fail("helper session should still be Hank on C");
  else pass("helper session is still Hank on C");
  const hankD = personOf({ headers: { "x-session": hankTok, "x-workspace": D } }, D);
  if (hankD.person) fail("helper session for C came back as " + (hankD.person.role || "") + " " + (hankD.person.name || "") + " on D");
  else pass("helper session for C -> no person on D (same owner account)");

  // 8. A member seat the account genuinely holds on another desk still opens.
  // A typed accountId never attaches an account (#seat-owner-account): Ann asks signed in, Bea approves.
  const memberSeat = await call(auth, "POST", { "x-workspace": B, "x-session": annTok }, { action: "join", workspace: B, name: "Ann", kind: "helper", pin: "8888" });
  if (memberSeat.statusCode >= 300) fail("Ann could not ask for a seat on B signed in: " + memberSeat.statusCode + " " + JSON.stringify(memberSeat.body));
  const annSeatB = (lib.mem.workspaces.find((w) => w && w.slug === B).people || []).find((p) => p && p.name === "Ann" && !lib.isOwner(p));
  await call(auth, "POST", { "x-workspace": B, "x-session": beaTok }, { action: "approve", id: annSeatB && annSeatB.id });
  const annOnB = personOf({ headers: { "x-session": annTok, "x-workspace": B } }, B);
  if (!annOnB.person || lib.isOwner(annOnB.person) || annOnB.person.name !== "Ann") fail("Ann's account seat on B should open as that helper seat, not owner: " + JSON.stringify(annOnB.person && { name: annOnB.person.name, role: annOnB.person.role }));
  else pass("Ann's account holds a helper seat on B: her A session opens B as that helper, not owner");

  // 9. A seat's state stays on its own desk. Account X: denied seat on A, open seat on B.
  const X = { id: "acct_pod_x", email: "" };
  const wsA = lib.mem.workspaces.find((w) => w && w.slug === A);
  const wsB = lib.mem.workspaces.find((w) => w && w.slug === B);
  await new Promise((r) => setTimeout(r, 3));
  const gusA = await call(auth, "POST", { "x-workspace": A, "x-session": annTok }, { action: "invite", name: "Gus", kind: "helper", pin: "9191" });
  await new Promise((r) => setTimeout(r, 3));
  const gusB = await call(auth, "POST", { "x-workspace": B, "x-session": beaTok }, { action: "invite", name: "Gus", kind: "helper", pin: "9292" });
  const gusASeat = gusA.body && gusA.body.person && (wsA.people || []).find((p) => p && p.id === gusA.body.person.id);
  const gusBSeat = gusB.body && gusB.body.person && (wsB.people || []).find((p) => p && p.id === gusB.body.person.id);
  if (!gusASeat || !gusBSeat) fail("could not add Gus on A and B: " + gusA.statusCode + " / " + gusB.statusCode);
  else {
    gusASeat.accountId = X.id;
    gusBSeat.accountId = X.id;
    // Gus's own sign-in proved account X (#361: only a proven login carries an account on a helper seat).
    const gusTok = lib.issueSession(gusASeat, wsA, X, null, "password").token;
    const gusOn = (slug) => personOf({ headers: { "x-session": gusTok, "x-workspace": slug } }, slug);
    const g1 = gusOn(B);
    if (!g1.person || g1.person.id !== gusBSeat.id || lib.isOwner(g1.person)) fail("Gus's A session should open his own B seat while both are open");
    else pass("account seat on A + own open seat on B: A session opens B as that seat");
    await call(auth, "POST", { "x-workspace": A, "x-session": annTok }, { action: "deny", id: gusASeat.id });
    const g2 = gusOn(A);
    if (g2.person) fail("Gus denied on A: his A session still got " + (g2.person.role || "") + " " + (g2.person.name || "") + " on A");
    else pass("denied on A: A session gets nothing on A");
    const g3 = gusOn(B);
    if (!g3.person || g3.person.id !== gusBSeat.id || lib.isOwner(g3.person)) fail("denied on A must not erase Gus's own open seat on B: " + JSON.stringify(g3.person && { id: g3.person.id, role: g3.person.role }));
    else pass("denied on A: his own open seat on B still opens B as that seat, not owner");
    const g4 = gusOn(C);
    if (g4.person) fail("Gus's A session must get nothing on C (no seat there)");
    else pass("denied on A: nothing on a desk where the account has no seat");
    await call(auth, "POST", { "x-workspace": B, "x-session": beaTok }, { action: "deny", id: gusBSeat.id });
    const g5 = gusOn(B);
    if (g5.person) fail("Gus denied on B too: still got a seat on B");
    else pass("denied on A and B: nothing on B");
  }

  // 10. #325 member-desk doors (POST /api/desks mine/update/leave/ask/code/perms/delete, auth invite with
  // instructions, GET /api/jobs desk card). An owner session for A sent with X-Workspace of another desk
  // is never that desk's owner: nothing on a desk with no seat for her account, and only her own helper
  // seat on B (section 8).
  const E = "pod-desk-e";
  const eveTok = await openDesk(auth, E, "Eve", "1212", "eve@example.test");
  const wsE = lib.mem.workspaces.find((w) => w && w.slug === E);
  await call(auth, "POST", { "x-workspace": E, "x-session": eveTok }, { action: "update", instructions: "Eve only: keep the queue tidy." }, {}, "/api/desks");
  await call(auth, "POST", { "x-workspace": B, "x-session": beaTok }, { action: "update", instructions: "Bea only: hand money cards to me." }, {}, "/api/desks");
  const instrE = wsE.instructions, instrB = wsB.instructions, codeE = wsE.pin, codeB = wsB.pin;
  if (instrE !== "Eve only: keep the queue tidy." || instrB !== "Bea only: hand money cards to me.") fail("owners should set their own member instructions: " + JSON.stringify([instrE, instrB]));
  const deskPost = (slug, body) => call(auth, "POST", { "x-session": annTok, "x-workspace": slug }, body, { action: body.action }, "/api/desks?action=" + body.action);
  const peopleE = (wsE.people || []).length;
  for (const body of [{ action: "mine" }, { action: "update", instructions: "Ann was here" }, { action: "leave" }, { action: "ask", kind: "staff" },
    { action: "code", pin: "9999", newPin: "9999" }, { action: "perms", id: "p_owner", kind: "staff" }, { action: "delete", confirm: E }]) {
    const r = await deskPost(E, body);
    if (r.statusCode < 400) fail("POST /api/desks " + body.action + ": A owner session + X-Workspace E (no seat) got " + r.statusCode);
    else pass("POST /api/desks " + body.action + ": A owner session + X-Workspace E (no seat) refused (" + r.statusCode + ")");
  }
  const invE = await call(auth, "POST", { "x-session": annTok, "x-workspace": E }, { action: "invite", name: "Mal", kind: "member", pin: "1313", instructions: "Ann was here" });
  if (invE.statusCode < 400 || (wsE.people || []).length !== peopleE) fail("auth invite: A owner session + X-Workspace E added a seat (" + invE.statusCode + ")");
  else pass("auth invite with instructions: A owner session + X-Workspace E refused (" + invE.statusCode + ")");
  const jobsE = await call(jobs, "GET", { "x-session": annTok, "x-workspace": E }, null, {}, "/api/jobs");
  if (jobsE.statusCode === 200 || leaked(jobsE.body, "Eve only")) fail("GET /api/jobs: A owner session read desk E's card/instructions: " + jobsE.statusCode);
  else pass("GET /api/jobs: A owner session + X-Workspace E does not see E's desk card (" + jobsE.statusCode + ")");
  if (wsE.instructions !== instrE || wsE.pin !== codeE || (wsE.people || []).length !== peopleE || !lib.mem.workspaces.some((w) => w && w.slug === E) || !(wsE.people || []).some((p) => lib.isOwner(p) && p.name === "Eve")) fail("desk E changed under Ann's A session");
  else pass("desk E untouched: instructions, code, seats and Eve's owner seat");
  // B: Ann holds her own helper seat there (section 8). She is that helper, never B's owner.
  const mineB = await deskPost(B, { action: "mine" });
  const ownedB = ((mineB.body && mineB.body.owned) || []).map((d) => d.slug), memberB = ((mineB.body && mineB.body.member) || []).map((d) => d.slug);
  if (mineB.statusCode !== 200 || ownedB.indexOf(B) >= 0 || memberB.indexOf(B) < 0 || (mineB.body.you && lib.isOwner(mineB.body.you))) fail("POST /api/desks mine on B: Ann should be B's helper, not owner: " + JSON.stringify({ s: mineB.statusCode, ownedB, memberB }));
  else pass("POST /api/desks mine on B: Ann's A session lists B as a member desk, not owned");
  const peopleB = (wsB.people || []).length;
  for (const body of [{ action: "update", instructions: "Ann was here" }, { action: "code", pin: "9999", newPin: "9999" }, { action: "perms", id: annSeatB && annSeatB.id, kind: "staff" }, { action: "delete", confirm: B }]) {
    const r = await deskPost(B, body);
    if (r.statusCode < 400) fail("POST /api/desks " + body.action + ": Ann's helper seat on B acted as owner (" + r.statusCode + ")");
    else pass("POST /api/desks " + body.action + ": Ann's helper seat on B refused (" + r.statusCode + ")");
  }
  const askB = await deskPost(B, { action: "ask", kind: "owner" });
  if (askB.statusCode < 400) fail("POST /api/desks ask owner: Ann asked to become B's owner (" + askB.statusCode + ")");
  else pass("POST /api/desks ask owner: refused (" + askB.statusCode + ")");
  const invB = await call(auth, "POST", { "x-session": annTok, "x-workspace": B }, { action: "invite", name: "Mal", kind: "member", pin: "1414", instructions: "Ann was here" });
  if (invB.statusCode < 400 || (wsB.people || []).length !== peopleB) fail("auth invite: Ann's helper seat on B invited (" + invB.statusCode + ")");
  else pass("auth invite with instructions: Ann's helper seat on B refused (" + invB.statusCode + ")");
  if (wsB.instructions !== instrB || wsB.pin !== codeB) fail("desk B instructions or code changed under Ann's A session");
  else pass("desk B instructions and code untouched");
  const leaveB = await deskPost(B, { action: "leave" });
  const beaStill = (wsB.people || []).some((p) => lib.isOwner(p) && p.name === "Bea");
  const annGoneB = !(wsB.people || []).some((p) => p && annSeatB && p.id === annSeatB.id);
  if (leaveB.statusCode !== 200 || !beaStill || !annGoneB) fail("POST /api/desks leave on B: should drop only Ann's own helper seat: " + JSON.stringify({ s: leaveB.statusCode, beaStill, annGoneB }));
  else pass("POST /api/desks leave on B: drops only Ann's own helper seat; Bea stays owner");
  const afterLeave = personOf({ headers: { "x-session": annTok, "x-workspace": B } }, B);
  if (afterLeave.person) fail("after leaving, Ann's A session still opens B as " + afterLeave.person.name);
  else pass("after leaving B, Ann's A session gets nothing on B");
  const ownAStill = personOf({ headers: { "x-session": annTok, "x-workspace": A } }, A);
  if (!ownAStill.person || !lib.isOwner(ownAStill.person)) fail("Ann should still own A");
  else pass("Ann still owns A");

  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  if (pkg.indexOf("scripts/check-personof-session-desk.js") < 0) fail("package.json test must run this check");
  else pass("package.json test runs this check");

  try { fs.rmSync(store, { force: true }); } catch (e) {}
  if (failed) {
    console.error("check-personof-session-desk: " + failed + " failed");
    process.exit(1);
  }
  console.log("check-personof-session-desk: ok");
}

main().catch(function (e) {
  console.error(e && e.stack || e);
  process.exit(1);
});
