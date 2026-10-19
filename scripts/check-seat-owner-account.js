#!/usr/bin/env node
// Proves a seat never carries the desk owner's account, and a helper never becomes owner through it.
// Hana joins desk A without signing in and types owner Ann's email (or account name, or accountId).
// Ann approves her, Hana signs in by desk code, Ann denies her. At no point is Hana owner on A,
// on Ann's other desk D, or on Bea's desk B; reads on D stay refused.
// Also: a stored seat (and a stored session) that already carries the owner's account, the world
// invite door, a signed-in helper's own account, the real owner, owner pin login, and a stored seat
// holding a third person's account (only that account's own sign-in proves it).
// Runs the real handlers against a temp store. No network.
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-seat-owner-acct-" + Date.now() + "-" + process.pid + ".json");
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
const tick = () => new Promise((r) => setTimeout(r, 3)); // seat ids are time-based: keep them distinct

async function main() {
  const auth = require(path.join(root, "api/auth"));
  const jobs = require(path.join(root, "api/jobs"));
  const admin = require(path.join(root, "api/admin"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();

  const A = "soa-ann", D = "soa-ann-two", B = "soa-bea", G = "soa-gus";
  async function open(slug, name, pin, email, tok) {
    const r = await call(auth, "POST", Object.assign({ "x-workspace": slug }, tok ? { "x-session": tok } : {}), { action: "open", slug, biz: slug, name, pin, email });
    const t = r.body && r.body.session && r.body.session.token;
    if (r.statusCode !== 201 || !t) throw new Error("open " + slug + " " + r.statusCode + " " + JSON.stringify(r.body));
    return t;
  }
  const annTok = await open(A, "Ann", "1111", "ann@x.test");
  await open(D, "Ann", "4444", "ann@x.test", annTok);
  const beaTok = await open(B, "Bea", "2222", "bea@x.test");
  const gusTok = await open(G, "Gus", "3333", "gus@x.test");
  const W = (s) => lib.mem.workspaces.find((w) => w && w.slug === s);
  const wsA = W(A), wsD = W(D), wsB = W(B), wsG = W(G);
  const acctA = wsA.accountId, acctB = wsB.accountId, acctG = wsG.accountId;
  const annAcc = lib.mem.accounts.find((a) => a.id === acctA);
  ok(acctA && wsD.accountId === acctA, "[setup] desks A and D are both Ann's account");
  ok(acctB && acctB !== acctA && acctG && acctG !== acctA, "[setup] Bea and Gus have their own accounts");
  lib.mem.jobs.unshift({ id: "job_soa_d", workspace: D, title: "Ann private card on D", status: "exception", step: "Qualify", createdAt: new Date().toISOString() });
  const annSeat = wsA.people.find((p) => lib.isOwner(p));

  const po = (tok, slug) => lib.personOf({ headers: { "x-session": tok, "x-workspace": slug } }, slug);
  const ownerOn = (tok, slug) => { const r = po(tok, slug); return !!(r.person && lib.isOwner(r.person)); };
  const who = (tok, slug) => { const r = po(tok, slug); return r.person ? r.person.name + (lib.isOwner(r.person) ? "(OWNER)" : "") : (r.pending ? "PENDING" : (r.denied ? "DENIED" : null)); };
  const ownerHdr = { "x-workspace": A, "x-session": annTok };
  const login = async (slug, pin) => { const r = await call(auth, "POST", {}, { action: "login", workspace: slug, pin }); return { r, tok: r.body && r.body.session && r.body.session.token }; };
  const readsD = async (tok) => ({
    jobs: (await call(jobs, "GET", { "x-session": tok, "x-workspace": D }, null, {}, "/api/jobs")).statusCode,
    desks: (await call(auth, "GET", { "x-session": tok, "x-workspace": D }, null, {}, "/api/desks")).statusCode
  });
  const seatsOnAWithAnnAcct = () => wsA.people.filter((p) => p && !lib.isOwner(p) && p.accountId === acctA);

  // Nothing on A (beyond her own helper seat), D or B; reads on D refused.
  async function nothing(tag, tok, own) {
    const onA = who(tok, A);
    ok(!ownerOn(tok, A) && (own ? (onA === own || onA === null || onA === "DENIED" || onA === "PENDING") : onA === null || onA === "DENIED" || onA === "PENDING"), "[" + tag + "] not owner on A (got " + onA + ")");
    ok(!ownerOn(tok, D) && po(tok, D).person == null, "[" + tag + "] no seat on Ann's desk D (got " + who(tok, D) + ")");
    ok(!ownerOn(tok, B) && po(tok, B).person == null, "[" + tag + "] no seat on Bea's desk B (got " + who(tok, B) + ")");
    const r = await readsD(tok);
    ok(r.jobs !== 200 && r.desks !== 200, "[" + tag + "] jobs/desks reads on D refused (jobs " + r.jobs + ", desks " + r.desks + ")");
  }

  // ---- 1. Hana's path on every typed door: join unsigned, approve, pin login, deny.
  const doors = [
    ["email", { email: "ann@x.test" }],
    ["email-case-spaces", { email: "  ANN@X.Test  " }],
    ["email-plus-tag", { email: "ann+desk@x.test" }],
    ["account-name", { account: annAcc.name, home: annAcc.slug }],
    ["account-id", { accountId: acctA, id: acctA, account: acctA }],
    ["desk-slug-as-account", { slug: A, biz: A }],
    ["seat-id", { seatId: annSeat.id, personId: annSeat.id, id: annSeat.id }],
    ["foreign-owner-email", { email: "bea@x.test" }],
    ["staff-kind", { email: "ann@x.test", kind: "staff" }],
    ["request-door", { email: "ann@x.test", _action: "request" }],
    ["admin-request-door", { email: "ann@x.test", _admin: true }]
  ];
  let n = 0;
  let staffTok = null, staffId = null;
  for (const [tag, extra] of doors) {
    n += 1;
    await tick();
    const name = "Hana" + n, pin = String(5000 + n);
    const body = Object.assign({ action: extra._action || "join", workspace: A, name, pin, kind: "helper" }, extra);
    delete body._action; delete body._admin;
    let jr;
    if (extra._admin) {
      // admin request needs someone on the desk: Ann asks on Hana's behalf, unsigned typed email.
      jr = await call(admin, "POST", ownerHdr, Object.assign({}, body, { action: "request" }), {}, "/api/admin");
    } else {
      jr = await call(auth, "POST", { "x-workspace": A }, body);
    }
    const seat = wsA.people.find((p) => p && p.name === name);
    if (!seat) { fail("[" + tag + "] join made no seat: " + jr.statusCode + " " + JSON.stringify(jr.body)); continue; }
    ok(!seat.accountId, "[" + tag + "] unsigned join stores no accountId (got '" + (seat.accountId || "") + "')");
    ok(!lib.isOwner(seat), "[" + tag + "] seat is not an owner seat");
    ok(String(seat.email || "").trim().toLowerCase() !== "ann@x.test" && String(seat.email || "").trim().toLowerCase() !== "bea@x.test", "[" + tag + "] another account's email is not stored on the seat");
    const ap = await call(auth, "POST", ownerHdr, { action: "approve", id: seat.id });
    ok(ap.statusCode === 200, "[" + tag + "] owner approves");
    const { r: lr, tok } = await login(A, pin);
    ok(lr.statusCode === 200 && !!tok, "[" + tag + "] Hana signs in by desk code");
    if (!tok) continue;
    const stored = lib.mem.sessions.find((s) => s && s.personId === seat.id);
    ok(stored && stored.accountId !== acctA && stored.accountId !== acctB, "[" + tag + "] her session does not carry an owner's account");
    ok(stored && String(stored.email || "").toLowerCase() !== "ann@x.test", "[" + tag + "] her session does not carry the owner's email");
    ok(!lib.listSessions({ accountId: acctA }).some((s) => s.personId === seat.id), "[" + tag + "] her session is not listed on Ann's account");
    ok(who(tok, A) === name, "[" + tag + "] open: she is her own helper seat on A (got " + who(tok, A) + ")");
    await nothing(tag + " open", tok, name);
    // Her account doors: she cannot set or change Ann's account.
    const pw0 = annAcc.password || "", mail0 = annAcc.email;
    await call(auth, "POST", { "x-workspace": A, "x-session": tok }, { action: "password", password: "hana-pass-1234", next: "hana-pass-1234" });
    await call(auth, "POST", { "x-workspace": A, "x-session": tok }, { action: "details", email: "hana" + n + "@evil.test" });
    ok((annAcc.password || "") === pw0 && annAcc.email === mail0, "[" + tag + "] she cannot set Ann's account password or email");
    const em = await call(auth, "POST", {}, { action: "login", email: "ann@x.test", password: "hana-pass-1234" });
    ok(em.statusCode !== 200, "[" + tag + "] no email login as Ann with a password she picked");
    if (tag === "staff-kind") { staffTok = tok; staffId = seat.id; continue; }
    const dn = await call(auth, "POST", ownerHdr, { action: "deny", id: seat.id });
    ok(dn.statusCode === 200, "[" + tag + "] owner denies");
    await nothing(tag + " denied", tok, null);
    const again = await login(A, pin);
    ok(!again.tok, "[" + tag + "] denied pin no longer signs in");
  }

  // Owner seats are never a request, on any door.
  await tick();
  for (const [tag, body] of [["join-kind-owner", { action: "join", kind: "owner" }], ["request-role-owner", { action: "request", role: "owner", kind: "" }], ["request-kind-owner", { action: "request", kind: "owner" }]]) {
    await tick();
    const name = "Oz-" + tag;
    const r = await call(auth, "POST", { "x-workspace": A }, Object.assign({ workspace: A, name, pin: "6060", email: "ann@x.test" }, body));
    const seat = wsA.people.find((p) => p && p.name === name);
    ok(!seat || !lib.isOwner(seat), "[" + tag + "] no owner seat from outside (" + r.statusCode + ")");
    if (seat) { await call(auth, "POST", ownerHdr, { action: "approve", id: seat.id }); ok(!lib.isOwner(seat), "[" + tag + "] approval does not make it owner"); }
  }

  // ---- 2. World invite door: staff Hana asks Ann's own account onto Ann's desk.
  annAcc.handle = "annsoa";
  if (staffTok) {
    const before = seatsOnAWithAnnAcct().length;
    const wi = await call(admin, "POST", { "x-workspace": A, "x-session": staffTok }, { action: "invite-world", handle: "annsoa", kind: "helper" }, {}, "/api/admin");
    ok(wi.statusCode !== 202 && seatsOnAWithAnnAcct().length === before, "[world-invite] staff cannot seat the desk's own account as a helper (" + wi.statusCode + ")");
    const wo = await call(admin, "POST", ownerHdr, { action: "invite-world", accountId: acctA, kind: "helper" }, {}, "/api/admin");
    ok(wo.statusCode !== 202 && seatsOnAWithAnnAcct().length === before, "[world-invite] owner cannot seat her own account as a helper (" + wo.statusCode + ")");
    await call(auth, "POST", ownerHdr, { action: "deny", id: staffId });
    await nothing("staff denied", staffTok, null);
  } else fail("[world-invite] no staff session to test with");

  // Owner invite typing her own email: helper seat, no owner account on it.
  await tick();
  const oi = await call(auth, "POST", ownerHdr, { action: "invite", name: "Olly", kind: "helper", pin: "7171", email: "ann@x.test" });
  const olly = wsA.people.find((p) => p && p.name === "Olly");
  ok(oi.statusCode === 201 && olly && !olly.accountId, "[owner-invite-own-email] helper seat never carries the desk's own account");
  const ollyTok = (await login(A, "7171")).tok;
  ok(!!ollyTok && who(ollyTok, A) === "Olly", "[owner-invite-own-email] she is her helper seat");
  await nothing("owner-invite-own-email open", ollyTok, "Olly");

  // ---- 3. Legacy store: a seat that already carries Ann's account (and Ann's email), and old
  // sessions stamped with Ann's account by the old pin login.
  await tick();
  const lex = { id: "p_soa_legacy", name: "Lex", role: "employee", kind: "helper", accountId: acctA, email: "ann@x.test", pin: lib.hashPin("6161"), status: "approved", createdAt: new Date().toISOString() };
  wsA.people.push(lex);
  const lexLogin = await login(A, "6161");
  ok(!!lexLogin.tok && who(lexLogin.tok, A) === "Lex", "[legacy-seat] pin login is her helper seat, not owner (got " + (lexLogin.tok && who(lexLogin.tok, A)) + ")");
  await nothing("legacy-seat open", lexLogin.tok, "Lex");
  const lexOld = lib.issueSession(lex, wsA, annAcc).token;
  const lexRow = lib.mem.sessions[0]; lexRow.accountId = acctA; lexRow.email = "ann@x.test"; lexRow.role = "employee"; lexRow.proof = "password";
  ok(who(lexOld, A) === "Lex", "[legacy-session] old stamped session is her helper seat on A (got " + who(lexOld, A) + ")");
  await nothing("legacy-session open", lexOld, "Lex");
  const lexPw = annAcc.password || "";
  await call(auth, "POST", { "x-workspace": A, "x-session": lexOld }, { action: "password", password: "lex-pass-1234" });
  ok((annAcc.password || "") === lexPw, "[legacy-seat] cannot set Ann's account password");
  await call(auth, "POST", ownerHdr, { action: "deny", id: lex.id });
  await nothing("legacy-seat denied (pin session)", lexLogin.tok, null);
  await nothing("legacy-seat denied (old session)", lexOld, null);
  // Plain helper with an old session stamped with Ann's account and email.
  await tick();
  await call(auth, "POST", ownerHdr, { action: "invite", name: "Pete", kind: "helper", pin: "7272" });
  const pete = wsA.people.find((p) => p && p.name === "Pete");
  const peteOld = lib.issueSession(pete, wsA, annAcc).token;
  const peteRow = lib.mem.sessions[0]; peteRow.accountId = acctA; peteRow.email = "ann@x.test"; peteRow.proof = "password";
  ok(who(peteOld, A) === "Pete", "[legacy-helper-session] open: Pete on A");
  await nothing("legacy-helper-session open", peteOld, "Pete");
  await call(auth, "POST", ownerHdr, { action: "deny", id: pete.id });
  await nothing("legacy-helper-session denied", peteOld, null);

  // Old store: desk D's row has no accountId (only Ann's account lists it). A stored helper seat on D
  // carries Ann's account; an old helper session carries an owner seat's email that no account has.
  await tick();
  const savedD = wsD.accountId; delete wsD.accountId;
  const dex = { id: "p_soa_dex", name: "Dex", role: "employee", kind: "helper", accountId: acctA, email: "", pin: lib.hashPin("6464"), status: "approved", createdAt: new Date().toISOString() };
  wsD.people.push(dex);
  const dexTok = (await login(D, "6464")).tok;
  ok(!!dexTok && who(dexTok, D) === "Dex", "[legacy-desk-row] Dex is his helper seat on D (got " + (dexTok && who(dexTok, D)) + ")");
  ok(!!dexTok && !ownerOn(dexTok, A) && po(dexTok, A).person == null && !ownerOn(dexTok, B), "[legacy-desk-row] Dex is nothing on A or B (A " + (dexTok && who(dexTok, A)) + ")");
  const dexOld = lib.issueSession(dex, wsD, annAcc).token; Object.assign(lib.mem.sessions[0], { accountId: acctA, proof: "password" });
  ok(po(dexOld, A).person == null && !ownerOn(dexOld, D), "[legacy-desk-row] an old proven-marked Dex session with Ann's account is nothing on A (got " + who(dexOld, A) + ")");
  const lexProven = lib.issueSession(lex, wsA, annAcc, null, "password");
  ok(lib.mem.sessions[0].accountId !== acctA, "[legacy-seat] even a password-marked helper session never carries its desk's own account");
  void lexProven;
  const beaSeat = wsB.people.find((p) => lib.isOwner(p)); const beaMail = beaSeat.email; beaSeat.email = "bea-shop@x.test";
  await tick();
  await call(auth, "POST", ownerHdr, { action: "invite", name: "Pip", kind: "helper", pin: "7373" });
  const pip = wsA.people.find((p) => p && p.name === "Pip");
  const pipOld = lib.issueSession(pip, wsA, null).token; lib.mem.sessions[0].email = "bea-shop@x.test";
  ok(!ownerOn(pipOld, B) && po(pipOld, B).person == null, "[legacy-owner-seat-email] an owner seat's email on a helper session proves nothing on B (got " + who(pipOld, B) + ")");
  await call(auth, "POST", ownerHdr, { action: "deny", id: pip.id });
  beaSeat.email = beaMail; wsD.accountId = savedD;

  // ---- 4. M3: a helper with her OWN attached account whose session carries another account
  // (old pin stamp). The account must match her seat's own account to prove anything.
  await tick();
  await call(auth, "POST", ownerHdr, { action: "invite", name: "Ivy", kind: "helper", pin: "8181" });
  const ivy = wsA.people.find((p) => p && p.name === "Ivy");
  ivy.accountId = "acct_soa_ivy";
  lib.mem.accounts.push({ id: "acct_soa_ivy", name: "Ivy", ownerName: "Ivy", email: "ivy@x.test", desks: [], memberDesks: [A] });
  const ivyPin = (await login(A, "8181")).tok;
  ok(!!ivyPin && !ownerOn(ivyPin, D) && !ownerOn(ivyPin, B), "[M3] Ivy (own account) pin session: not owner on D or B (D " + who(ivyPin, D) + ", B " + who(ivyPin, B) + ")");
  for (const [label, acct] of [["desk account", acctA], ["other owner's account", acctB]]) {
    const t = lib.issueSession(ivy, wsA, annAcc).token;
    const row = lib.mem.sessions[0]; row.accountId = acct; row.proof = "password";
    ok(!ownerOn(t, D) && po(t, D).person == null, "[M3] Ivy session stamped with the " + label + ": no seat on D (got " + who(t, D) + ")");
    ok(!ownerOn(t, B) && po(t, B).person == null, "[M3] Ivy session stamped with the " + label + ": no seat on B (got " + who(t, B) + ")");
    ok(who(t, A) === "Ivy", "[M3] still her own helper seat on A (got " + who(t, A) + ")");
  }
  const beaAcc = lib.mem.accounts.find((a) => a.id === acctB);
  const ivyBea = lib.issueSession(ivy, wsA, beaAcc, null, "password").token;
  ok(lib.mem.sessions[0].accountId !== acctB, "[M3] that session is not stored with the other account");
  ok(!ownerOn(ivyBea, B) && po(ivyBea, B).person == null, "[M3] a session issued for Ivy's seat with another account proves nothing on B (got " + who(ivyBea, B) + ")");

  // ---- 5. Legit: Gus signs in (his own desk G), joins A signed in. His own account sits on his seat.
  await tick();
  const gj = await call(auth, "POST", { "x-workspace": A, "x-session": gusTok }, { action: "join", workspace: A, name: "Gus", pin: "9191", kind: "helper" });
  const gus = wsA.people.find((p) => p && p.name === "Gus");
  ok(gj.statusCode === 202 && gus && gus.accountId === acctG, "[legit] signed-in join attaches his own account (got '" + (gus && gus.accountId) + "')");
  await tick();
  const gx = await call(auth, "POST", { "x-workspace": A, "x-session": gusTok }, { action: "join", workspace: A, name: "Gus2", pin: "9292", kind: "helper", email: "ann@x.test" });
  const gus2 = wsA.people.find((p) => p && p.name === "Gus2");
  ok(gus2 && !gus2.accountId, "[legit] signed in as Gus but typing Ann's email attaches nothing (" + gx.statusCode + ", '" + (gus2 && gus2.accountId) + "')");
  if (gus) {
    await call(auth, "POST", ownerHdr, { action: "approve", id: gus.id });
    // (An owner session on someone else's desk is #340's door; this check stays on seats.)
    ok(ownerOn(gusTok, G), "[legit] still owner on his own desk G");
    const gp = (await login(A, "9191")).tok;
    ok(!!gp && who(gp, A) === "Gus", "[legit] his pin login opens his helper seat on A (got " + (gp && who(gp, A)) + ")");
    ok(!!gp && !ownerOn(gp, A) && !ownerOn(gp, D) && !ownerOn(gp, B), "[legit] his helper pin session is owner nowhere");
    ok(gus.accountId === acctG, "[legit] his own account stays on his seat");
  }

  // Ann, signed in, asks for a helper seat on her own desk: it never carries her account.
  await tick();
  await call(auth, "POST", { "x-workspace": A, "x-session": annTok }, { action: "join", workspace: A, name: "Annie", pin: "6363", kind: "helper" });
  const annie = wsA.people.find((p) => p && p.name === "Annie");
  ok(annie && !annie.accountId, "[own-desk-join] a helper seat on Ann's desk never carries Ann's account (got '" + (annie && annie.accountId) + "')");

  // ---- 6. The real owner.
  ok(ownerOn(annTok, A) && ownerOn(annTok, D), "[owner] Ann's session is owner on A and D");
  const al = await login(A, "1111");
  ok(al.r.statusCode === 200 && al.tok && ownerOn(al.tok, A) && al.r.body.you && al.r.body.you.role === "owner", "[owner-pin] owner pin login unchanged: owner on A");
  const alRow = lib.mem.sessions.find((s) => s && s.personId === annSeat.id);
  ok(alRow && alRow.accountId === acctA, "[owner-pin] owner pin session still carries her account");
  ok(ownerOn(al.tok, D), "[owner-pin] owner pin session still reaches her other desk D");
  const pinHdr = lib.personOf({ headers: { "x-workspace": A, "x-pin": "1111" } }, A);
  ok(pinHdr.person && lib.isOwner(pinHdr.person), "[owner-pin] X-Pin owner header unchanged");
  ok(lib.isOwner(annSeat) && annSeat.accountId === acctA, "[owner] Ann's owner seat still carries her account");

  // ---- 7. Third person's account on a stored seat. An old invite typed Zed's account onto Carl's
  // seat on A. Zed owns desk Z and holds a helper seat on Y. Carl has only his desk code: no door
  // may let his session act as Zed. Only a session from Zed's own sign-in proves Zed.
  const acch = require(path.join(root, "api/_account-http"));
  const Z = "soa-zed", Y = "soa-yan";
  const zedTok = await open(Z, "Zed", "2323", "zed@x.test");
  const yanTok = await open(Y, "Yan", "2424", "yan@x.test");
  const wsZ = W(Z), wsY = W(Y), acctZ = wsZ.accountId;
  const zAcc = lib.mem.accounts.find((a) => a.id === acctZ);
  wsY.people.push({ id: "p_soa_zed_y", name: "Zed", role: "employee", kind: "helper", accountId: acctZ, email: "", pin: lib.hashPin("2525"), status: "approved" });
  const carl = { id: "p_soa_carl", name: "Carl", role: "employee", kind: "helper", accountId: acctZ, email: "", pin: lib.hashPin("2626"), status: "approved" };
  wsA.people.push(carl);
  const nothingOfZed = (tag, t) => {
    ok(!ownerOn(t, Z) && po(t, Z).person == null, "[third " + tag + "] nothing on Zed's desk Z (got " + who(t, Z) + ")");
    ok(po(t, Y).person == null, "[third " + tag + "] nothing on desk Y, not Zed's seat there (got " + who(t, Y) + ")");
  };
  const carlPin = (await login(A, "2626")).tok;
  ok(!!carlPin && who(carlPin, A) === "Carl", "[third] Carl's desk code opens his helper seat on A");
  ok(lib.mem.sessions[0].accountId !== acctZ && lib.mem.sessions[0].proof !== "password", "[third] his desk-code session carries neither Zed's account nor a proof mark");
  nothingOfZed("auth pin login", carlPin);
  const al2 = await call(acch, "POST", {}, { action: "login", account: A, pin: "2626" }, {}, "/api/account");
  const carlAcct = al2.body && al2.body.session && al2.body.session.token;
  ok(!carlAcct || (lib.mem.sessions[0].accountId !== acctZ && lib.mem.sessions[0].proof !== "password"), "[third] /api/account desk-code login carries neither Zed's account nor a proof mark");
  if (carlAcct) nothingOfZed("account pin login", carlAcct);
  const carlOld = lib.issueSession(carl, wsA, zAcc).token;
  ok(lib.mem.sessions[0].accountId !== acctZ, "[third] a session issued without the account's own sign-in never carries it");
  lib.mem.sessions[0].accountId = acctZ; delete lib.mem.sessions[0].proof;
  nothingOfZed("stored session stamped with Zed, no proof mark", carlOld);
  const zpw = zAcc.password || "", zmail = zAcc.email;
  for (const [tag, h, hd, u] of [["auth session", auth, { "x-workspace": A, "x-session": carlPin }, "/api/auth"], ["auth x-pin", auth, { "x-workspace": A, "x-pin": "2626" }, "/api/auth"],
    ["account session", acch, { "x-workspace": A, "x-session": carlPin }, "/api/account"], ["account stored session", acch, { "x-workspace": A, "x-session": carlOld }, "/api/account"]]) {
    await call(h, "POST", hd, { action: "password", password: "carl-pass-9999" }, {}, u);
    await call(h, "POST", hd, { action: "details", email: "carl@evil.test", city: "Evilton" }, {}, u);
    ok((zAcc.password || "") === zpw && zAcc.email === zmail && zAcc.city !== "Evilton", "[third " + tag + "] cannot set Zed's password, email or details");
  }
  const asZed = await call(auth, "POST", {}, { action: "login", email: "zed@x.test", password: "carl-pass-9999" });
  ok(asZed.statusCode !== 200, "[third] no email login as Zed (" + asZed.statusCode + ")");
  // Zed himself: his own sign-in still works and still proves him.
  const zp = await call(auth, "POST", { "x-workspace": Z, "x-session": zedTok }, { action: "password", password: "zed-pass-1234" });
  ok(zp.statusCode === 200 && !!zAcc.password, "[third legit] Zed sets his own password from his own session");
  const ze = await call(auth, "POST", {}, { action: "login", email: "zed@x.test", password: "zed-pass-1234" });
  const zet = ze.body && ze.body.session && ze.body.session.token;
  ok(ze.statusCode === 200 && ownerOn(zet, Z), "[third legit] Zed's email login is owner on Z");
  ok(lib.mem.sessions[0].proof === "password", "[third legit] an email login is marked as proving its account");
  const ze2 = await call(acch, "POST", {}, { action: "login", email: "zed@x.test", password: "zed-pass-1234" }, {}, "/api/account");
  ok(ze2.statusCode === 200 && lib.mem.sessions[0].proof === "password", "[third legit] /api/account email login is marked as proving its account");
  // A helper seat whose session came from that account's own sign-in keeps the account's powers.
  lib.mem.accounts.push({ id: "acct_soa_q", name: "Quinn", ownerName: "Quinn", email: "quinn@x.test", desks: [], memberDesks: [Y], plan: "pro" });
  const qAcc = lib.mem.accounts.find((a) => a.id === "acct_soa_q");
  require(path.join(root, "api/_account")).setAccountPassword(qAcc, "quinn-pass-1234");
  const qSeat = { id: "p_soa_q_y", name: "Quinn", role: "employee", kind: "helper", accountId: "acct_soa_q", email: "quinn@x.test", pin: lib.hashPin("2727"), status: "approved" };
  wsY.people.push(qSeat);
  wsB.people.push({ id: "p_soa_q_b", name: "Quinn", role: "employee", kind: "helper", accountId: "acct_soa_q", email: "", pin: lib.hashPin("2828"), status: "approved" });
  const qt = lib.issueSession(qSeat, wsY, qAcc, null, "password").token;
  ok(lib.mem.sessions[0].accountId === "acct_soa_q", "[third legit] Quinn's signed-in helper session carries her account");
  ok(who(qt, Y) === "Quinn" && who(qt, B) === "Quinn", "[third legit] it opens her helper seats on Y and B (Y " + who(qt, Y) + ", B " + who(qt, B) + ")");
  const qp = await call(auth, "POST", { "x-workspace": Y, "x-session": qt }, { action: "password", current: "quinn-pass-1234", password: "quinn-pass-5678" });
  ok(qp.statusCode === 200, "[third legit] Quinn sets her own password from her signed-in session (" + qp.statusCode + ")");
  const qPin = (await login(Y, "2727")).tok;
  const qpw = qAcc.password;
  await call(auth, "POST", { "x-workspace": Y, "x-session": qPin }, { action: "password", password: "pin-pass-0000" });
  ok(qAcc.password === qpw && po(qPin, B).person == null, "[third] Quinn's desk-code session alone neither edits her account nor reaches B");
}

main().then(() => {
  if (failed) { console.error(failed + " check(s) failed"); process.exit(1); }
  console.log("seat-owner-account: all ok");
  process.exit(0);
}).catch((e) => { console.error("FAIL crash " + (e && e.stack || e)); process.exit(1); });
