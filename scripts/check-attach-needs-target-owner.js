#!/usr/bin/env node
require("./_env-guard");
// POST /api/account action "attach" only attaches a desk the request proves it owns: the desk it is
// signed into, a desk already its account's, or the named desk's own owner code, owner session, or
// owner password. Hal (no seat on Bea's desk), Lex (a helper on Bea's desk), and Cyd (owner of a
// different desk) all get one identical reply, the same as a made-up desk name, and the store is
// byte-unchanged. Stale, expired, and revoked sessions for Bea's desk prove nothing. Desk names
// that differ only in case or spacing resolve to Bea's desk and are refused the same way.
// Afterwards Hal's email login never lands on Bea's seat, and Hal's session cannot read or invite
// on Bea's desk. A real owner attaching her own second desk with proof still works.
// Runs the real handlers against a temp store. No network.
// --mutate: copies the tree once per mutant (unique anchors only), runs this check, reports caught/total.
const os = require("os");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

if (process.argv.indexOf("--mutate") >= 0) { mutate(); return; }

process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-attach-owner-" + Date.now() + "-" + process.pid + ".json");
delete global.__aia;
delete global.__aiaHydrate;

let failed = 0, passed = 0;
function fail(msg) { console.error("FAIL " + msg); failed += 1; process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); passed += 1; }
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
const tick = () => new Promise((r) => setTimeout(r, 4)); // seat ids are time-based

async function main() {
  const auth = require(path.join(root, "api/auth"));
  const admin = require(path.join(root, "api/admin"));
  const acch = require(path.join(root, "api/_account-http"));
  const lib = require(path.join(root, "api/_lib"));
  const account = require(path.join(root, "api/_account"));
  await lib.ready();
  const W = (s) => lib.mem.workspaces.find((w) => w && w.slug === s);
  const accOf = (s) => lib.mem.accounts.find((a) => a && a.id === (W(s) || {}).accountId);
  async function open(slug, name, pin, email) {
    const r = await call(auth, "POST", {}, { action: "open", slug, biz: slug, name, pin, email });
    if (r.statusCode !== 201) throw new Error("open " + slug + " " + r.statusCode + " " + JSON.stringify(r.body));
    await tick();
    return r.body && r.body.session && r.body.session.token;
  }
  const codeLogin = async (slug, pin) => {
    const r = await call(auth, "POST", {}, { action: "login", workspace: slug, pin });
    return r.body && r.body.session && r.body.session.token;
  };
  const attach = (headers, body) => call(acch, "POST", headers, Object.assign({ action: "attach" }, body), {}, "/api/account");

  // ---- setup
  await open("at-hal", "Hal", "7171", "hal@at.test");
  await open("at-bea", "Bea", "7272", "bea@at.test");
  await open("at-cyd", "Cyd", "7474", "cyd@at.test");
  await open("at-lex", "Lex", "7676", "lex@at.test");
  const inv = await call(admin, "POST", { "x-workspace": "at-bea", "x-pin": "7272" }, { action: "invite", name: "Lex", kind: "helper", pin: "7575", approve: true }, {}, "/api/admin");
  await tick();
  const B = W("at-bea"), H = W("at-hal");
  const beaAcc = accOf("at-bea"), halAcc = accOf("at-hal"), cydAcc = accOf("at-cyd");
  const lexSeat = (B.people || []).find((p) => p && p.name === "Lex");
  ok((inv.statusCode === 201 || inv.statusCode === 202) && lexSeat && !lib.isOwner(lexSeat), "[setup] Lex is a helper on Bea's desk (" + inv.statusCode + ")");
  ok(!(B.people || []).some((p) => p && p.name === "Hal"), "[setup] Hal has no seat on Bea's desk");
  ok(!!beaAcc && !!halAcc && beaAcc.id !== halAcc.id && !!cydAcc && cydAcc.id !== beaAcc.id, "[setup] Hal, Bea, Cyd have their own accounts");
  account.setAccountPassword(halAcc, "hal-pass-at-1234");
  account.setAccountPassword(cydAcc, "cyd-pass-at-1234");
  account.setAccountPassword(beaAcc, "bea-pass-at-1234");
  account.setAccountPassword(accOf("at-lex"), "lex-pass-at-1234");
  const emailTok = async (email, password) => {
    const r = await call(acch, "POST", {}, { action: "login", email, password }, {}, "/api/account");
    return r.body && r.body.session && r.body.session.token;
  };
  const halTok = await emailTok("hal@at.test", "hal-pass-at-1234");
  const cydProven = await emailTok("cyd@at.test", "cyd-pass-at-1234");
  const lexProven = await emailTok("lex@at.test", "lex-pass-at-1234");
  const cydTok = await codeLogin("at-cyd", "7474");
  const lexHelperTok = await codeLogin("at-bea", "7575");
  const beaTok = await codeLogin("at-bea", "7272");
  ok(!!halTok && !!cydProven && !!lexProven && !!cydTok && !!lexHelperTok && !!beaTok, "[setup] sessions issued");
  // Bea's stale sessions: one expired, one revoked by her own logout.
  const beaExpiredTok = await codeLogin("at-bea", "7272");
  await tick();
  const beaRevokedTok = await codeLogin("at-bea", "7272");
  const expRow = lib.findSession(beaExpiredTok, { slide: false });
  ok(!!expRow, "[setup] found Bea's session to expire");
  if (expRow) expRow.expiresAt = new Date(Date.now() - 60000).toISOString();
  const lo = await call(acch, "POST", { "x-workspace": "at-bea", "x-session": beaRevokedTok }, { action: "logout" }, {}, "/api/account");
  ok(lo.statusCode === 200, "[setup] Bea logged one session out (" + lo.statusCode + ")");
  const gExp = await call(admin, "GET", { "x-workspace": "at-bea", "x-session": beaExpiredTok }, null, {}, "/api/admin");
  const gRev = await call(admin, "GET", { "x-workspace": "at-bea", "x-session": beaRevokedTok }, null, {}, "/api/admin");
  ok(gExp.statusCode !== 200 && gRev.statusCode !== 200, "[setup] Bea's expired and revoked sessions open nothing (" + gExp.statusCode + "," + gRev.statusCode + ")");
  await lib.save();

  const store = process.env.AIA_STORE_PATH;
  ok(fs.existsSync(store), "[setup] store file written");
  const snapFile = () => fs.readFileSync(store);
  const snapMem = () => JSON.stringify({ w: lib.mem.workspaces, a: lib.mem.accounts });
  const file0 = snapFile(), mem0 = snapMem();
  const beaPeople0 = JSON.stringify(B.people);

  // ---- refusals
  // A desk code (or a desk-code session) is not a password sign-in, so attach is refused before any
  // desk is looked up: the same sign-in-again reply for a made-up name and for Bea's real desk.
  const signInAgain = (r) => r.statusCode === 403 && r.body && r.body.ok === false && r.body.signIn === true && r.body.error === "Sign in again to change your account.";
  const hal = { "x-workspace": "at-hal", "x-pin": "7171" };
  const halP = { "x-workspace": "at-hal", "x-session": halTok };
  async function held(label, headers, body) {
    const r = await attach(headers, body);
    ok(signInAgain(r), label + ": sign in again (" + r.statusCode + " " + JSON.stringify(r.body) + ")");
    ok(Buffer.compare(snapFile(), file0) === 0, label + ": store file byte-unchanged");
    ok(snapMem() === mem0, label + ": desks and accounts unchanged in memory");
    ok(B.accountId === beaAcc.id && (halAcc.desks || []).indexOf("at-bea") < 0 && (cydAcc.desks || []).indexOf("at-bea") < 0, label + ": Bea's desk still Bea's");
  }
  const pinFake = await attach(hal, { desk: "at-nobody-here" });
  const pinReal = await attach(hal, { desk: "at-bea" });
  ok(signInAgain(pinFake) && JSON.stringify(pinFake.body) === JSON.stringify(pinReal.body), "[Hal desk code] same sign-in-again reply for a made-up desk and Bea's (" + pinFake.statusCode + ")");
  await held("[Hal desk code, Bea's desk]", hal, { desk: "at-bea" });
  await held("[Hal + Bea's expired session]", Object.assign({ "x-session": beaExpiredTok }, hal), { desk: "at-bea" });
  await held("[Hal + Bea's revoked session]", Object.assign({ "x-session": beaRevokedTok }, hal), { desk: "at-bea" });
  await held("[Hal + Lex's helper session on Bea]", Object.assign({ "x-session": lexHelperTok }, hal), { desk: "at-bea" });
  await held("[Cyd other-desk owner, code]", { "x-workspace": "at-cyd", "x-pin": "7474" }, { desk: "at-bea" });
  await held("[Cyd other-desk owner, code session]", { "x-workspace": "at-cyd", "x-session": cydTok }, { desk: " At Bea " });
  const lex = { "x-workspace": "at-lex", "x-pin": "7676" };
  await held("[Lex own desk code]", lex, { desk: "at-bea" });
  await held("[Lex helper session is not his password sign-in]", Object.assign({ "x-session": lexHelperTok }, lex), { desk: "AT-BEA" });
  // A password sign-in still has to prove the named desk. A miss is the same 404 as a made-up name.
  const fake = await attach(halP, { desk: "at-nobody-here" });
  const want = JSON.stringify({ s: fake.statusCode, b: fake.body });
  ok(fake.statusCode === 404 && fake.body && fake.body.ok === false && fake.body.error === "No desk with that name.", "[made-up desk, password session] 404 No desk with that name. (" + want + ")");
  async function refused(label, headers, body) {
    const r = await attach(headers, body);
    const got = JSON.stringify({ s: r.statusCode, b: r.body });
    ok(got === want, label + ": same reply as a made-up desk (" + got + ")");
    ok(Buffer.compare(snapFile(), file0) === 0, label + ": store file byte-unchanged");
    ok(snapMem() === mem0, label + ": desks and accounts unchanged in memory");
    ok(B.accountId === beaAcc.id && (halAcc.desks || []).indexOf("at-bea") < 0 && (cydAcc.desks || []).indexOf("at-bea") < 0, label + ": Bea's desk still Bea's");
  }
  await refused("[Hal non-seat, email session]", halP, { desk: "at-bea" });
  await refused("[Hal non-seat, slug field]", halP, { slug: "at-bea" });
  await refused("[Hal wrong Bea code]", halP, { desk: "at-bea", pin: "0000" });
  await refused("[Hal his own code as Bea's]", halP, { desk: "at-bea", pin: "7171", code: "7171" });
  await refused("[Hal Lex's helper code for Bea]", halP, { desk: "at-bea", pin: "7575" });
  await refused("[Hal his own password]", halP, { desk: "at-bea", password: "hal-pass-at-1234" });
  await refused("[Hal wrong Bea password]", halP, { desk: "at-bea", password: "bea-pass-at-9999" });
  for (const name of ["AT-BEA", " at-bea ", "at bea", "At  Bea", "\tat-bea\n", "AT_BEA", "  At - Bea  "]) {
    await refused("[Hal name variant " + JSON.stringify(name) + "]", halP, { desk: name });
  }
  ok(lib.slugify("  At - Bea  ") === "at-bea" && lib.slugify("AT_BEA") === "at-bea", "[name variants] resolve to Bea's desk slug");
  await refused("[Lex password session, helper code as proof]", { "x-workspace": "at-lex", "x-session": lexProven }, { desk: "at-bea", pin: "7575" });
  await refused("[Cyd other-desk owner, password session]", { "x-workspace": "at-cyd", "x-session": cydProven }, { desk: " At Bea " });
  await refused("[Cyd own password]", { "x-workspace": "at-cyd", "x-session": cydProven }, { desk: "at-bea", password: "cyd-pass-at-1234" });
  // A helper signed into Bea's desk fails the owner gate before any desk is named: same reply for
  // Bea's desk and a made-up one, and nothing written.
  const lx1 = await attach({ "x-workspace": "at-bea", "x-pin": "7575" }, { desk: "at-bea" });
  const lx2 = await attach({ "x-workspace": "at-bea", "x-pin": "7575" }, { desk: "at-nobody-here" });
  ok(lx1.statusCode === 403 && JSON.stringify(lx1.body) === JSON.stringify(lx2.body) && lx1.statusCode === lx2.statusCode, "[Lex signed in as helper on Bea] owner gate, same reply for real and made-up desk (" + lx1.statusCode + " " + JSON.stringify(lx1.body) + ")");
  ok(Buffer.compare(snapFile(), file0) === 0 && snapMem() === mem0, "[Lex signed in as helper on Bea] nothing written");

  // ---- no takeover afterwards
  const el = await call(acch, "POST", {}, { action: "login", email: "hal@at.test", password: "hal-pass-at-1234" }, {}, "/api/account");
  const eb = el.body || {};
  const sessDesk = eb.session && (eb.session.slug || eb.session.workspace);
  ok(el.statusCode === 200 && sessDesk === "at-hal", "[Hal email login] lands on his own desk (" + el.statusCode + ", " + sessDesk + ")");
  ok(!(eb.you && eb.you.name === "Bea") && !(eb.desksOwned || []).some((d) => d && d.slug === "at-bea"), "[Hal email login] not Bea's seat, does not own Bea's desk (you " + (eb.you && eb.you.name) + ")");
  const t2 = eb.session && eb.session.token;
  const g = await call(admin, "GET", { "x-workspace": "at-bea", "x-session": t2 }, null, {}, "/api/admin");
  ok(g.statusCode !== 200 && !(g.body && Array.isArray(g.body.people)), "[Hal session] admin GET on Bea's desk refused (" + g.statusCode + ")");
  const d = await call(admin, "POST", { "x-workspace": "at-bea", "x-session": t2 }, { action: "invite", name: "Mallory", kind: "helper", pin: "7373", approve: true }, {}, "/api/admin");
  ok(d.statusCode >= 400, "[Hal session] admin invite on Bea's desk refused (" + d.statusCode + ")");
  ok(JSON.stringify(B.people) === beaPeople0 && !(B.people || []).some((p) => p && p.name === "Mallory"), "[Bea's desk] people unchanged, no Mallory");
  const bl = await call(auth, "POST", {}, { action: "login", workspace: "at-bea", pin: "7272" });
  const bel = await call(acch, "POST", {}, { action: "login", email: "bea@at.test", password: "bea-pass-at-1234" }, {}, "/api/account");
  ok(bl.statusCode === 200 && bel.statusCode === 200 && (bel.body.session || {}).workspace === "at-bea", "[Bea] her code and email still open her desk (" + bl.statusCode + "," + bel.statusCode + ")");

  // ---- legit: Ann attaches her own second desks with proof
  await open("at-ann", "Ann", "8181", "ann@at.test");
  await open("at-ann-two", "Ann", "8282", "ann2@at.test");
  await open("at-ann-three", "Ann", "8383", "ann3@at.test");
  await open("at-ann-four", "Ann", "8484", "ann4@at.test");
  const annAcc = accOf("at-ann");
  account.setAccountPassword(annAcc, "ann-pass-at-1234");
  account.setAccountPassword(accOf("at-ann-three"), "ann3-pass-at-1234");
  const annTok = await emailTok("ann@at.test", "ann-pass-at-1234");
  const ann4Tok = await codeLogin("at-ann-four", "8484");
  ok(!!annTok && !!ann4Tok, "[Ann] password sign-in and the fourth desk's code session");
  const annH = { "x-workspace": "at-ann", "x-session": annTok };
  const annPin = { "x-workspace": "at-ann", "x-pin": "8181" };
  const mine = (slug) => W(slug).accountId === annAcc.id && (annAcc.desks || []).indexOf(slug) >= 0;
  const desksBefore = (annAcc.desks || []).slice().join(",");
  const lCode = await attach(annPin, { desk: "at-ann" });
  ok(signInAgain(lCode) && (annAcc.desks || []).join(",") === desksBefore, "[Ann desk code] attaching the desk she opened needs a password sign-in (" + lCode.statusCode + ")");
  const l0 = await attach(annH, { desk: "at-ann" });
  ok(l0.statusCode === 200 && mine("at-ann"), "[Ann] attach the desk she is signed into (" + l0.statusCode + ")");
  const ln = await attach(annH, { desk: "at-ann-two" });
  ok(ln.statusCode === 404 && JSON.stringify(ln.body) === JSON.stringify(fake.body) && !mine("at-ann-two"), "[Ann] her other desk without its proof is refused like any other (" + ln.statusCode + ")");
  const l1 = await attach(annH, { desk: "at-ann-two", pin: "8282" });
  ok(l1.statusCode === 200 && mine("at-ann-two"), "[Ann] attach second desk with its owner code (" + l1.statusCode + ")");
  const l2 = await attach(annH, { desk: " AT  Ann Three ", password: "ann3-pass-at-1234" });
  ok(l2.statusCode === 200 && mine("at-ann-three"), "[Ann] attach third desk (name in odd case/spacing) with its owner password (" + l2.statusCode + ")");
  const l3code = await attach({ "x-workspace": "at-ann", "x-session": ann4Tok, "x-pin": "8181" }, { desk: "at-ann-four" });
  ok(signInAgain(l3code) && !mine("at-ann-four"), "[Ann] the fourth desk's code session is not a password sign-in (" + l3code.statusCode + ")");
  const l3 = await attach(annH, { desk: "at-ann-four", pin: "8484" });
  ok(l3.statusCode === 200 && mine("at-ann-four"), "[Ann] attach fourth desk with its owner code (" + l3.statusCode + ")");
  const l4 = await attach(annH, { desk: "at-ann-two" });
  ok(l4.statusCode === 200 && mine("at-ann-two"), "[Ann] re-attach a desk already hers needs no new proof (" + l4.statusCode + ")");
  const al = await call(acch, "POST", {}, { action: "login", account: "at-ann", pin: "8181" }, {}, "/api/account");
  const owned = ((al.body || {}).desks || []).map((c) => c && c.slug);
  ok(al.statusCode === 200 && ["at-ann", "at-ann-two", "at-ann-three", "at-ann-four"].every((s) => owned.indexOf(s) >= 0) && owned.indexOf("at-bea") < 0, "[Ann] her account home lists her four desks and not Bea's (" + JSON.stringify(owned) + ")");
  // The desk she is signed into needs no second proof, even with a stray wrong code in the body
  // and a login whose account is not the desk's own (at-ann-two's owner seat holds its first account).
  const two0 = lib.mem.accounts.find((a) => a && a.id === (W("at-ann-two").people || []).find((p) => p && lib.isOwner(p)).accountId);
  account.setAccountPassword(two0, "ann2-pass-at-1234");
  const ann2Tok = await emailTok("ann2@at.test", "ann2-pass-at-1234");
  const l5 = await attach({ "x-workspace": "at-ann-two", "x-session": ann2Tok }, { desk: "at-ann-two", pin: "0000" });
  ok(l5.statusCode === 200 && two0 && two0.id !== annAcc.id && W("at-ann-two").accountId === two0.id, "[at-ann-two owner code] attach the desk signed into, stray body code ignored (" + l5.statusCode + ")");
  ok(W("at-bea").accountId === beaAcc.id, "[end] Bea's desk still Bea's");

  try { fs.unlinkSync(store); } catch (e) {}
  console.log((failed ? "FAILED " : "PASS ") + passed + " ok / " + failed + " FAIL");
  process.exit(failed ? 1 : 0);
}

function mutate() {
  const cp = require("child_process");
  const F = "api/_account-http.js";
  const M = [
    ["M01-no-proof-call", F, "if (!row || !provesTargetOwner(req, body, found, account, row)) return", "if (!row) return"],
    ["M02-proof-always-true", F, "  if (!row || !found || !found.workspace) return false;\n  if (row.slug === found.workspace.slug) return true;", "  return true;"],
    ["M03-same-desk-check-dropped", F, "  if (row.slug === found.workspace.slug) return true;\n", ""],
    ["M04-target-seat-any-kind", F, "there.person && isOwner(there.person)) return true;", "there.person) return true;"],
    ["M05-target-workspace-guard-dropped", F, "if (there.workspace === row && there.person", "if (there.person"],
    ["M06-password-not-checked", F, "!!(deskAcc && deskAcc.password && passwordMatches(deskAcc.password, pw))", "!!deskAcc"],
    ["M07-password-any-account", F, "(mem.accounts || []).find((a) => a && a.id === deskId) : null;", "(mem.accounts || []).find((a) => a && a.password && passwordMatches(a.password, pw)) : null;"],
    ["M08-xworkspace-not-target", F, "    \"x-workspace\": row.slug,\n", ""],
    ["M09-xpin-not-target-code", F, "    \"x-pin\": String(body.pin || body.code || (req.headers && req.headers[\"x-pin\"]) || \"\")\n", "    \"x-pin\": String((req.headers && req.headers[\"x-pin\"]) || \"\")\n"],
    ["M10-same-account-always", F, "if (deskId && mineId && deskId === mineId) return true;", "if (mineId) return true;"],
    ["M11-unproven-says-sign-in", F, "if (!row || !provesTargetOwner(req, body, found, account, row)) return res.status(404).json({ ok: false, error: \"No desk with that name.\" });", "if (!row) return res.status(404).json({ ok: false, error: \"No desk with that name.\" });\n    if (!provesTargetOwner(req, body, found, account, row)) return res.status(403).json(require(\"./_account\").signInAgain());"],
    ["M12-save-before-refusal", F, "if (!row || !provesTargetOwner(req, body, found, account, row)) return res", "if (!row || !provesTargetOwner(req, body, found, account, row)) return (await save()), res"],
    ["M13-write-before-proof", F, "    const want = lib.slugify(other);\n", "    const want = lib.slugify(other);\n    { const w0 = (mem.workspaces || []).find((w) => w && w.slug === want); if (w0 && account) w0.accountId = account.id; }\n"],
    ["M14-no-slugify", F, "const want = lib.slugify(other);", "const want = other;"],
    ["M15-owner-gate-dropped", F, "if (!found.workspace || !isOwner(found.person)) {\n      return res.status(403).json({ ok: false, error: \"Owner desk code required to attach a desk.\" });", "if (!found.workspace) {\n      return res.status(403).json({ ok: false, error: \"Owner desk code required to attach a desk.\" });"],
    ["M16-pin-or-session-refused", F, "  if (there.workspace === row && there.person && isOwner(there.person)) return true;\n", ""],
    ["M17-old-main-attach", F, "if (!row || !provesTargetOwner(req, body, found, account, row)) return res.status(404)", "if (!row) return res.status(404)"]
  ];
  // Equivalent by construction (row exists, so personOf resolves that very desk): see report.
  const EQUIV = { "M05-target-workspace-guard-dropped": "row is a real desk, so personOf(x-workspace=row.slug) always returns that desk" };
  const src = fs.readFileSync(path.join(root, F), "utf8");
  for (const m of M) {
    const n = src.split(m[2]).length - 1;
    if (n !== 1) { console.error("non-unique anchor (" + n + ") for " + m[0]); process.exit(1); }
  }
  const self = path.relative(root, __filename);
  let caught = 0; const rows = [];
  for (const m of M) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attach-mut-"));
    cp.execFileSync("tar", ["-C", root, "--exclude=./.git", "--exclude=./node_modules", "-cf", path.join(dir, "t.tar"), "."]);
    cp.execFileSync("tar", ["-C", dir, "-xf", path.join(dir, "t.tar")]);
    fs.unlinkSync(path.join(dir, "t.tar"));
    if (fs.existsSync(path.join(root, "node_modules"))) fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
    const f = path.join(dir, m[1]);
    fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(m[2], m[3]));
    const r = cp.spawnSync(process.execPath, [path.join(dir, self)], { encoding: "utf8", env: process.env, timeout: 120000 });
    const out = (r.stdout || "") + (r.stderr || "");
    const fails = (out.match(/^FAIL /mg) || []).length;
    const hit = r.status !== 0;
    if (hit) caught += 1;
    rows.push(m[0] + "  " + (hit ? "CAUGHT" : "survived") + "  rc=" + r.status + " fails=" + fails + (EQUIV[m[0]] && !hit ? "  [equivalent: " + EQUIV[m[0]] + "]" : ""));
    fs.rmSync(dir, { recursive: true, force: true });
  }
  rows.forEach((l) => console.log(l));
  const eq = M.filter((m) => EQUIV[m[0]]).length;
  console.log("mutants caught " + caught + "/" + M.length + (eq ? " (" + eq + " labelled equivalent)" : ""));
  process.exit(0);
}

main().catch((e) => { console.error("FAIL crashed: " + (e && e.stack || e)); process.exit(1); });
