#!/usr/bin/env node
require("./_env-guard");
// GET /api/account never gives a helper the desk owner's account home.
// A helper seat (or a desk-code member login) whose session did not come from its own account's
// sign-in (proof "password", the #361 allowlist) gets exactly 403
// {ok:false, error:"Sign in again to change your account.", signIn:true}: never the owner's email,
// account id, or session list, and never an unfiltered session list. The owner (email + password,
// or the owner desk code as before), a proven helper (own account only), strangers, waiting seats
// and Stop/Kill are unchanged. Also: admin "mine" lists by the seat's own id and proven account only.
// Runs the real handlers against a temp store. No network.
// Usage: node scripts/check-account-home-proof.js            (the check)
//        node scripts/check-account-home-proof.js --mutate   (mutants on a temp copy; exit 1 if any non-equivalent survives)
const fs = require("fs");
const os = require("os");
const path = require("path");
const root = path.join(__dirname, "..");

const MUTATE = process.argv.indexOf("--mutate") >= 0;

if (!MUTATE) process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-acct-home-proof-" + Date.now() + "-" + process.pid + ".json");
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
const tick = () => new Promise((r) => setTimeout(r, 3));
const MSG = "Sign in again to change your account.";
const exact403 = (r) => r.statusCode === 403 && r.body && JSON.stringify(Object.keys(r.body).sort()) === JSON.stringify(["error", "ok", "signIn"]) &&
  r.body.ok === false && r.body.error === MSG && r.body.signIn === true;

async function main() {
  const auth = require(path.join(root, "api/auth"));
  const jobs = require(path.join(root, "api/jobs"));
  const admin = require(path.join(root, "api/admin"));
  const acch = require(path.join(root, "api/_account-http"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();
  const getHome = (hd) => call(acch, "GET", hd, null, {}, "/api/account");
  const open = async (slug, name, pin, email, tok, password) => {
    const r = await call(auth, "POST", Object.assign({ "x-workspace": slug }, tok ? { "x-session": tok } : {}), Object.assign({ action: "open", slug, biz: slug, name, pin, email }, password ? { password } : {}));
    if (r.statusCode !== 201) throw new Error("open " + slug + " " + r.statusCode + " " + JSON.stringify(r.body));
    return r.body.session.token;
  };
  const login = async (slug, pin) => { const r = await call(auth, "POST", {}, { action: "login", workspace: slug, pin }); return r.body && r.body.session && r.body.session.token; };
  const A = "ahp-ann", D = "ahp-ann-two", B = "ahp-bea", Z = "ahp-zed";
  const annPinTok = await open(A, "Ann", "1111", "ann@ahp.test", null, "ann-pass-1234");
  await open(D, "Ann", "4444", "ann@ahp.test", annPinTok);
  const beaTok = await open(B, "Bea", "2222", "bea@ahp.test");
  const zedTok = await open(Z, "Zed", "2323", "zed@ahp.test");
  const W = (s) => lib.mem.workspaces.find((w) => w && w.slug === s);
  const wsA = W(A), wsB = W(B), acctA = wsA.accountId, acctB = wsB.accountId, acctZ = W(Z).accountId;
  const annAcc = lib.mem.accounts.find((a) => a.id === acctA);
  // Ann set her password when she opened A (a desk-code session cannot set it later: #370 writes).
  ok(!!annAcc.password, "[setup] Ann's account has the password she set when she opened A");
  const annEmail = await call(acch, "POST", {}, { action: "login", email: "ann@ahp.test", password: "ann-pass-1234" }, {}, "/api/account");
  const annPwTok = annEmail.body && annEmail.body.session && annEmail.body.session.token;
  ok(annEmail.statusCode === 200 && lib.mem.sessions[0].proof === "password", "[setup] Ann's email + password login is proven");
  lib.mem.jobs.unshift({ id: "job_ahp_a", workspace: A, title: "Ann card", status: "exception", step: "Qualify", createdAt: new Date().toISOString() });
  lib.mem.jobs.unshift({ id: "job_ahp_a2", workspace: A, title: "Ann card two", status: "exception", step: "Qualify", createdAt: new Date().toISOString() });

  // Helpers on A.
  const ownerHdr = { "x-workspace": A, "x-session": annPwTok };
  await call(auth, "POST", ownerHdr, { action: "invite", name: "Olly", kind: "helper", pin: "7171" });
  const ollyTok = await login(A, "7171");
  await tick();
  wsA.people.push({ id: "p_ahp_lex", name: "Lex", role: "employee", kind: "helper", accountId: acctA, email: "ann@ahp.test", pin: lib.hashPin("6161"), status: "approved", createdAt: new Date().toISOString() });
  const lexTok = await login(A, "6161");
  const lexOld = lib.issueSession(wsA.people.find((p) => p.id === "p_ahp_lex"), wsA, annAcc).token;
  Object.assign(lib.mem.sessions[0], { accountId: acctA, email: "ann@ahp.test", proof: "password" });
  wsA.people.push({ id: "p_ahp_carl", name: "Carl", role: "employee", kind: "helper", accountId: acctZ, email: "", pin: lib.hashPin("2626"), status: "approved", createdAt: new Date().toISOString() });
  const carlTok = await login(A, "2626");
  const carlAcctLogin = await call(acch, "POST", {}, { action: "login", account: A, pin: "2626" }, {}, "/api/account");
  const carlAcctTok = carlAcctLogin.body && carlAcctLogin.body.session && carlAcctLogin.body.session.token;
  // Quinn: a helper on A and B with her own account; her own sign-in proved it.
  lib.mem.accounts.push({ id: "acct_ahp_q", name: "Quinn", ownerName: "Quinn", email: "quinn@ahp.test", desks: [], memberDesks: [A, B], plan: "pro" });
  const qAcc = lib.mem.accounts.find((a) => a.id === "acct_ahp_q");
  const qSeat = { id: "p_ahp_q", name: "Quinn", role: "employee", kind: "helper", accountId: "acct_ahp_q", email: "quinn@ahp.test", pin: lib.hashPin("2727"), status: "approved" };
  wsA.people.push(qSeat);
  wsB.people.push({ id: "p_ahp_q_b", name: "Quinn", role: "employee", kind: "helper", accountId: "acct_ahp_q", email: "", pin: lib.hashPin("2828"), status: "approved" });
  const qTok = lib.issueSession(qSeat, wsA, qAcc, null, "password").token;
  // Waiting seat.
  await call(auth, "POST", { "x-workspace": A }, { action: "join", workspace: A, name: "Pat", pin: "5151", kind: "helper" });

  // Strings that must never reach an unproven helper.
  const ownerSessionIds = () => lib.mem.sessions.filter((s) => s && (s.accountId === acctA || s.accountId === acctB || s.accountId === acctZ)).map((s) => s.id);
  const secrets = () => ["ann@ahp.test", acctA, "zed@ahp.test", acctZ, "bea@ahp.test", acctB].concat(ownerSessionIds());
  const leaks = (r) => { const t = JSON.stringify(r.body == null ? "" : r.body); return secrets().filter((s) => s && t.indexOf(s) >= 0); };

  // ---- 1. Unproven: exact 403, nothing of the owner's (or anyone's) account.
  const unproven = [
    ["plain helper Olly, desk-code session", { "x-workspace": A, "x-session": ollyTok }],
    ["plain helper Olly, X-Pin only", { "x-workspace": A, "x-pin": "7171" }],
    ["plain helper Olly, ?workspace + session", { "x-session": ollyTok }, { workspace: A }],
    ["legacy seat Lex (owner's account on the seat), desk-code session", { "x-workspace": A, "x-session": lexTok }],
    ["legacy seat Lex, old session stamped with the owner's account + password mark", { "x-workspace": A, "x-session": lexOld }],
    ["legacy seat Lex, X-Pin only", { "x-workspace": A, "x-pin": "6161" }],
    ["third account on Carl's seat, desk-code session", { "x-workspace": A, "x-session": carlTok }],
    ["third account on Carl's seat, /api/account desk-code login session", { "x-workspace": A, "x-session": carlAcctTok }],
    ["Carl, X-Pin only", { "x-workspace": A, "x-pin": "2626" }]
  ];
  for (const [tag, hd, q] of unproven) {
    const r = q ? await call(acch, "GET", hd, null, q, "/api/account?workspace=" + q.workspace) : await getHome(hd);
    ok(exact403(r), "[unproven " + tag + "] GET /api/account is exactly 403 sign in again (got " + r.statusCode + " " + JSON.stringify(r.body).slice(0, 120) + ")");
    const l = leaks(r);
    ok(l.length === 0, "[unproven " + tag + "] no owner email, account id or session id in the reply (" + l.length + " leaked)");
  }
  // /api/account desk-code login itself stays a sign-in door, but its reply carries no account and no session list.
  const ollyLogin = await call(acch, "POST", {}, { action: "login", account: A, pin: "7171" }, {}, "/api/account");
  const ownSid = lib.mem.sessions[0].id;
  ok(ollyLogin.statusCode === 200 && ollyLogin.body.session, "[desk-code login] /api/account desk-code login still signs in (" + ollyLogin.statusCode + ")");
  ok(leaks(ollyLogin).length === 0, "[desk-code login] its reply has no owner email, account id or session id (" + leaks(ollyLogin).join(",") + ")");
  const listed = (ollyLogin.body && ollyLogin.body.sessions) || [];
  ok(Array.isArray(listed) && listed.length === 0, "[desk-code login] no session list without an account (got " + listed.length + ")");
  const others = lib.mem.sessions.filter((s) => s.id !== ownSid).map((s) => s.id);
  ok(!others.some((id) => JSON.stringify(ollyLogin.body).indexOf(id) >= 0), "[desk-code login] no other session id anywhere in the reply");
  ok(exact403(await getHome({ "x-workspace": A, "x-session": ollyLogin.body.session.token })), "[desk-code login] that session's GET /api/account is 403 sign in again");

  // ---- 2. Positive: owner and proven helper unchanged.
  const annHome = await getHome(ownerHdr);
  ok(annHome.statusCode === 200 && annHome.body.account && annHome.body.account.id === acctA && annHome.body.account.email === "ann@ahp.test", "[owner password] Ann's email session gets her own home (" + annHome.statusCode + ")");
  ok((annHome.body.sessions || []).some((s) => s.current) && (annHome.body.sessions || []).every((s) => s.accountId === acctA || !s.accountId), "[owner password] her session list is her own account's, current marked");
  ok(JSON.stringify(annHome.body).indexOf("bea@ahp.test") < 0 && JSON.stringify(annHome.body).indexOf(acctB) < 0, "[owner password] nothing of Bea's account");
  const annPinHome = await getHome({ "x-workspace": A, "x-pin": "1111" });
  ok(annPinHome.statusCode === 200 && annPinHome.body.account && annPinHome.body.account.id === acctA, "[owner desk code] owner X-Pin GET unchanged: her own home (" + annPinHome.statusCode + ")");
  const annSesHome = await getHome({ "x-workspace": A, "x-session": annPinTok });
  ok(annSesHome.statusCode === 200 && annSesHome.body.account && annSesHome.body.account.id === acctA, "[owner desk session] owner's desk-open session GET unchanged: her own home (" + annSesHome.statusCode + ")");
  const helperSesOwnerPin = await getHome({ "x-workspace": A, "x-session": ollyTok, "x-pin": "1111" });
  ok(helperSesOwnerPin.statusCode === 200 && helperSesOwnerPin.body.account && helperSesOwnerPin.body.account.id === acctA, "[owner desk code] the owner's own code still opens her home even under a helper session (" + helperSesOwnerPin.statusCode + ")");
  // An old desk with no account at all: its owner's session still reads what it read before (not 403).
  const L = "ahp-legacy-desk";
  lib.mem.workspaces.push({ slug: L, biz: L, name: L, pin: lib.hashPin("3434"), people: [{ id: "p_owner", name: "Lou", role: "owner", kind: "owner", status: "approved", pin: lib.hashPin("3434") }], createdAt: new Date().toISOString() });
  const louTok = lib.issueSession(W(L).people[0], W(L), null).token;
  const louHome = await getHome({ "x-workspace": L, "x-session": louTok });
  ok(louHome.statusCode === 200 && louHome.body.account && louHome.body.account.id && W(L).accountId === louHome.body.account.id, "[owner, desk with no account record] its owner session gets that desk's own (new) account home, not 403 (" + louHome.statusCode + ")");
  const qHome = await getHome({ "x-workspace": A, "x-session": qTok });
  ok(qHome.statusCode === 200 && qHome.body.account && qHome.body.account.id === "acct_ahp_q", "[proven helper] Quinn's own sign-in gets her own account home (" + qHome.statusCode + ")");
  ok(leaks(qHome).length === 0, "[proven helper] nothing of Ann's, Bea's or Zed's account in it (" + leaks(qHome).join(",") + ")");
  ok((qHome.body.sessions || []).every((s) => s.accountId === "acct_ahp_q"), "[proven helper] only her own sessions");

  // ---- 3. Unchanged replies for strangers, wrong codes and waiting seats.
  const stranger = await getHome({ "x-workspace": A });
  ok(stranger.statusCode === 401 && stranger.body.error === "Account name, desk code, or email does not match.", "[unchanged] stranger 401 (" + stranger.statusCode + ")");
  const wrong = await getHome({ "x-workspace": A, "x-pin": "0000" });
  ok(wrong.statusCode === 401 && wrong.body.error === "Account name, desk code, or email does not match.", "[unchanged] wrong code 401 (" + wrong.statusCode + ")");
  const stale = await getHome({ "x-workspace": A, "x-session": "deadbeefdeadbeefdeadbeefdeadbeef" });
  ok(stale.statusCode === 401, "[unchanged] leftover session without a code 401 (" + stale.statusCode + ")");
  const pat = await getHome({ "x-workspace": A, "x-pin": "5151" });
  ok(pat.statusCode === 403 && pat.body.pending === true && leaks(pat).length === 0, "[unchanged] waiting seat 403 pending (" + pat.statusCode + ")");
  const ollyPw = await call(auth, "POST", { "x-workspace": A, "x-session": ollyTok }, { action: "password", password: "olly-pass-1234" });
  ok(ollyPw.statusCode === 404 && ollyPw.body.error === "No AIA account on this login.", "[unchanged] helper with no account: auth password still 404 (" + ollyPw.statusCode + ")");
  const ollySes = await call(acch, "POST", { "x-workspace": A, "x-session": ollyTok }, { action: "sessions" }, {}, "/api/account");
  ok(ollySes.statusCode === 401 && ollySes.body.error === "Sign in first.", "[unchanged] helper with no account: /api/account sessions still 401 (" + ollySes.statusCode + ")");

  // ---- 4. Admin reads that touch the owner's account.
  const adminHome = await call(admin, "POST", { "x-workspace": A, "x-session": lexTok }, { action: "home" }, {}, "/api/admin");
  ok(adminHome.statusCode === 403 && leaks(adminHome).length === 0, "[admin home] a helper still gets 403, nothing of Ann's account (" + adminHome.statusCode + ")");
  const adminOwner = await call(admin, "POST", ownerHdr, { action: "home" }, {}, "/api/admin");
  ok(adminOwner.statusCode === 200 && adminOwner.body.account && adminOwner.body.account.id === acctA, "[admin home] the owner still gets her home (" + adminOwner.statusCode + ")");
  const slugs = (r, k) => ((r.body && r.body[k]) || []).map((d) => d.slug);
  const lexMine = await call(admin, "POST", { "x-workspace": A, "x-session": lexTok }, { action: "mine" }, {}, "/api/admin");
  ok(lexMine.statusCode === 200 && slugs(lexMine, "owned").length === 0 && slugs(lexMine, "member").join(",") === A, "[admin mine] a seat holding Ann's account lists only its own helper seat (owned " + JSON.stringify(slugs(lexMine, "owned")) + ", member " + JSON.stringify(slugs(lexMine, "member")) + ")");
  const carlMine = await call(admin, "POST", { "x-workspace": A, "x-session": carlTok }, { action: "mine" }, {}, "/api/admin");
  ok(slugs(carlMine, "owned").indexOf(Z) < 0 && slugs(carlMine, "member").indexOf(Z) < 0, "[admin mine] Carl's desk code lists nothing of Zed's");
  const qMine = await call(admin, "POST", { "x-workspace": A, "x-session": qTok }, { action: "mine" }, {}, "/api/admin");
  ok(slugs(qMine, "member").sort().join(",") === [A, B].sort().join(","), "[admin mine] Quinn's proven session lists her seats on A and B (" + JSON.stringify(slugs(qMine, "member")) + ")");
  const annMine = await call(admin, "POST", ownerHdr, { action: "mine" }, {}, "/api/admin");
  ok(slugs(annMine, "owned").sort().join(",") === [A, D].sort().join(","), "[admin mine] Ann lists exactly A and D (" + JSON.stringify(slugs(annMine, "owned")) + ")");

  // ---- 5. Stop/Kill unaffected.
  const helperKill = await call(jobs, "POST", { "x-workspace": A, "x-session": ollyTok }, { action: "kill", id: "job_ahp_a", confirm: true }, {}, "/api/jobs");
  ok(helperKill.statusCode === 403, "[stop/kill] a helper still cannot Kill (" + helperKill.statusCode + ")");
  const pinKill = await call(jobs, "POST", { "x-workspace": A, "x-session": annPinTok }, { action: "kill", id: "job_ahp_a", confirm: true }, {}, "/api/jobs");
  ok(pinKill.statusCode === 200 && lib.mem.jobs.find((j) => j.id === "job_ahp_a").status === "killed", "[stop/kill] owner desk session still Kills (" + pinKill.statusCode + ")");
  const pwKill = await call(jobs, "POST", ownerHdr, { action: "kill", id: "job_ahp_a2", confirm: true }, {}, "/api/jobs");
  ok(pwKill.statusCode === 200, "[stop/kill] owner email session still Kills (" + pwKill.statusCode + ")");

  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  ok(pkg.indexOf("node scripts/check-account-home-proof.js") >= 0, "package.json test runs this check");
  try { fs.rmSync(process.env.AIA_STORE_PATH, { force: true }); } catch (e) {}
}

// [name, file, find, replace, equivalent?]
const MUTANTS = [
  ["G1 no 403 for unproven helpers (old fallback)", "api/_account-http.js", "    if ((via.ok && via.memberLogin) || (!(via.ok) && helperSeat(found.person))) return res.status(403).json(require(\"./_account\").signInAgain());\n", ""],
  ["G2 only the desk-code member branch", "api/_account-http.js", "if ((via.ok && via.memberLogin) || (!(via.ok) && helperSeat(found.person)))", "if ((via.ok && via.memberLogin))"],
  ["G3 only the helper-session branch", "api/_account-http.js", "if ((via.ok && via.memberLogin) || (!(via.ok) && helperSeat(found.person)))", "if ((!(via.ok) && helperSeat(found.person)))"],
  ["G4 helper branch even when the owner's code is given", "api/_account-http.js", "(!(via.ok) && helperSeat(found.person))", "(helperSeat(found.person))"],
  ["G5 401 instead of 403", "api/_account-http.js", "return res.status(403).json(require(\"./_account\").signInAgain());\n    if (via.ok) {", "return res.status(401).json(require(\"./_account\").signInAgain());\n    if (via.ok) {"],
  ["G6 403 with a different body", "api/_account-http.js", "return res.status(403).json(require(\"./_account\").signInAgain());\n    if (via.ok) {", "return res.status(403).json({ ok: false, error: \"Sign in first.\" });\n    if (via.ok) {"],
  ["G7 owners treated as helpers (equivalent: an owner's homeAccount always returns before this line; accountForDesk creates the desk's account if missing)", "api/_account-http.js", "const helperSeat = (p) => !!p && !isOwner(p) && !/_owner$/.test(String(p.id || \"\"));", "const helperSeat = (p) => !!p;", true],
  ["G8 '_owner' ids treated as helpers (equivalent: personOf returns the owner seat, isOwner already true)", "api/_account-http.js", "const helperSeat = (p) => !!p && !isOwner(p) && !/_owner$/.test(String(p.id || \"\"));", "const helperSeat = (p) => !!p && !isOwner(p);", true],
  ["S1 unfiltered session list without an account id", "api/_account-http.js", "typeof lib.listSessions === \"function\" && acc && acc.id\n", "typeof lib.listSessions === \"function\"\n"],
  ["S2 session list for an account object with no id", "api/_account-http.js", "typeof lib.listSessions === \"function\" && acc && acc.id\n", "typeof lib.listSessions === \"function\" && acc\n"],
  ["A1 admin mine back to the raw seat hint", "api/admin.js", "fn(plans.listHint(person, homeAccount(person, row, req), row.slug))", "fn({ id: person.id, name: person.name, email: person.email, pin: person.pin, accountId: person.accountId })"],
  ["A2 admin mine without the request (no proven account)", "api/admin.js", "homeAccount(person, row, req), row.slug))", "homeAccount(person, row), row.slug))"],
  ["A3 admin mine with the desk owner's account", "api/admin.js", "fn(plans.listHint(person, homeAccount(person, row, req), row.slug))", "fn(plans.listHint(person, accountForDesk(row), row.slug))"],
  ["A4 admin mine without the slug (equivalent: listHint finds the seat's own desk by reference)", "api/admin.js", "homeAccount(person, row, req), row.slug))", "homeAccount(person, row, req)))", true]
];
function runMutants() {
  const { spawnSync } = require("child_process");
  const skip = new Set([".git", "node_modules"]);
  const copy = (src, dst) => { fs.mkdirSync(dst, { recursive: true }); for (const e of fs.readdirSync(src, { withFileTypes: true })) { if (skip.has(e.name)) continue; const s = path.join(src, e.name), d = path.join(dst, e.name); if (e.isDirectory()) copy(s, d); else if (e.isFile()) fs.copyFileSync(s, d); } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aia-ahp-mut-"));
  copy(root, dir);
  if (fs.existsSync(path.join(root, "node_modules"))) fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
  const run = () => { const h = fs.mkdtempSync(path.join(os.tmpdir(), "aia-ahp-home-")); return spawnSync(process.execPath, [path.join(dir, "scripts/check-account-home-proof.js")], { cwd: dir, env: { PATH: process.env.PATH || "", HOME: h, TMPDIR: h }, encoding: "utf8", timeout: 120000 }); };
  const base = run();
  if (base.status !== 0) { console.error("unmutated check fails in the copy:\n" + (base.stdout + base.stderr).slice(-2000)); process.exit(1); }
  let caught = 0, total = 0, eq = 0, bad = 0;
  for (const [name, file, find, repl, equivalent] of MUTANTS) {
    const p = path.join(dir, file); const orig = fs.readFileSync(p, "utf8");
    if (orig.indexOf(find) < 0) { console.log(name + " | ANCHOR GONE"); bad += 1; continue; }
    fs.writeFileSync(p, orig.replace(find, repl));
    const r = run(); fs.writeFileSync(p, orig);
    const first = ((r.stdout || "") + (r.stderr || "")).split("\n").find((l) => l.indexOf("FAIL") === 0) || "";
    if (equivalent) { eq += 1; console.log(name + " | " + (r.status ? "CAUGHT" : "survived") + " (equivalent, not scored)"); continue; }
    total += 1;
    if (r.status) { caught += 1; console.log(name + " | CAUGHT | " + first.slice(0, 160)); } else console.log(name + " | SURVIVED");
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("SCORE " + caught + "/" + total + " caught (" + eq + " equivalent not scored" + (bad ? ", " + bad + " anchors gone" : "") + ")");
  process.exit(caught === total && !bad ? 0 : 1);
}

if (MUTATE) runMutants();
else main().then(() => {
  if (failed) { console.error("check-account-home-proof: " + failed + " failed"); process.exit(1); }
  console.log("check-account-home-proof: ok");
  process.exit(0);
}).catch((e) => { console.error("FAIL crash " + (e && e.stack || e)); process.exit(1); });
