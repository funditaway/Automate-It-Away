#!/usr/bin/env node
// Every account change needs that account's own password sign-in.
// A desk code (X-Pin), a desk-code session, a stale session plus the code, or someone else on the
// same code gets exactly 403 {ok:false, error:"Sign in again to change your account.", signIn:true}
// for every write on /api/account (and the account writes on /api/auth and /api/admin), with nothing
// written. The one exception (AIA's rule): an account with no password AND no email on file may set
// both together, in one write, from its desk code. Reads by the owner's code stay as they were.
// Runs the real handlers against a temp store. No network.
// Usage: node scripts/check-account-writes-need-proof.js            (the check)
//        node scripts/check-account-writes-need-proof.js --mutate   (mutants on a temp copy; exit 1 if any survives)
const fs = require("fs");
const os = require("os");
const path = require("path");
const root = path.join(__dirname, "..");
const MUTATE = process.argv.indexOf("--mutate") >= 0;

if (!MUTATE) process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-awp-" + Date.now() + "-" + process.pid + ".json");
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
const MSG = "Sign in again to change your account.";
const exact403 = (r) => r.statusCode === 403 && r.body && JSON.stringify(Object.keys(r.body).sort()) === JSON.stringify(["error", "ok", "signIn"]) &&
  r.body.ok === false && r.body.error === MSG && r.body.signIn === true;

async function main() {
  const auth = require(path.join(root, "api/auth"));
  const admin = require(path.join(root, "api/admin"));
  const acch = require(path.join(root, "api/_account-http"));
  const lib = require(path.join(root, "api/_lib"));
  const plans = require(path.join(root, "api/_plans"));
  await lib.ready();
  const W = (s) => lib.mem.workspaces.find((w) => w && w.slug === s);
  const accOf = (s) => lib.mem.accounts.find((a) => a && a.id === W(s).accountId);
  const open = async (slug, name, pin, email, password) => {
    const r = await call(auth, "POST", { "x-workspace": slug }, Object.assign({ action: "open", slug, biz: slug, name, pin }, email ? { email } : {}, password ? { password } : {}));
    if (r.statusCode !== 201) throw new Error("open " + slug + " " + r.statusCode + " " + JSON.stringify(r.body));
    return r.body.session.token;
  };
  const acctPost = (hd, body) => call(acch, "POST", hd, body, {}, "/api/account");
  const emailLogin = async (email, password) => { const r = await acctPost({}, { action: "login", email, password }); return { r, tok: r.body && r.body.session && r.body.session.token }; };

  // Ann: email + password set when she opened. Bea: another owner. Cal: his own desk on the same code as Ann.
  const A = "awp-ann", B = "awp-bea", C = "awp-cal";
  const annPinTok = await open(A, "Ann", "1111", "ann@awp.test", "ann-pass-1234");
  await open(B, "Bea", "2222", "bea@awp.test", "bea-pass-1234");
  const calTok = await open(C, "Cal", "1111", "cal@awp.test", "cal-pass-1234");
  const annAcc = accOf(A);
  annAcc.identities = [{ provider: "github", subject: "ann-gh", email: "ann@awp.test", linkedAt: new Date().toISOString(), verified: true }];
  annAcc.handle = "annawp";
  const annDeskLogin = await call(auth, "POST", {}, { action: "login", workspace: A, pin: "1111" });
  const annDeskTok = annDeskLogin.body.session.token;
  const annAcctLogin = await acctPost({}, { action: "login", account: A, pin: "1111" });
  const annAcctPinTok = annAcctLogin.body && annAcctLogin.body.session && annAcctLogin.body.session.token;
  await call(auth, "POST", { "x-workspace": A, "x-session": annPinTok }, { action: "invite", name: "Olly", kind: "helper", pin: "7171" });

  const snap = () => JSON.stringify({
    accounts: lib.mem.accounts,
    desks: lib.mem.workspaces.map((w) => [w.slug, w.accountId, (w.people || []).map((p) => [p.id, p.name, p.email || "", p.accountId || ""])]),
    sessions: lib.mem.sessions.map((s) => s && s.id).sort()
  });
  const otherPlan = (plans.publicPlans().map((p) => p.id).find((id) => id !== (annAcc.plan || "pro"))) || "dev";
  const WRITES = [
    ["password", { action: "password", password: "x-pass-9999", email: "hijack@awp.test" }],
    ["details", { action: "details", city: "X", email: "cal-owns@awp.test" }],
    ["profile", { action: "profile", city: "Y", name: "Mallory" }],
    ["handle", { action: "handle", handle: "stolenawp" }],
    ["at", { action: "at", handle: "stolenawp2" }],
    ["mint", { action: "mint", name: "X" }],
    ["attach", { action: "attach", desk: B }],
    ["plan", { action: "plan", plan: otherPlan }],
    ["subscribe", { action: "subscribe", plan: otherPlan }],
    ["mfa", { action: "mfa", on: true }],
    ["link-provider", { action: "link-provider", provider: "gitlab", subject: "x" }],
    ["unlink-provider", { action: "unlink-provider", provider: "github" }],
    ["mail-add", { action: "mail-add", local: "stolen" }],
    ["mail-remove", { action: "mail-remove", id: "x" }],
    ["wallet", { action: "wallet", walletAddress: "0x" + "11".repeat(20), walletChainId: "0x1" }],
    ["connect-wallet", { action: "connect-wallet", walletAddress: "0x" + "22".repeat(20), walletChainId: "0x1" }],
    ["disconnect-wallet", { action: "disconnect-wallet" }],
    ["reviewer", { action: "reviewer" }],
    ["logout-all", { action: "logout-all" }]
  ];
  const unproven = [
    ["Ann's desk code (X-Pin only)", { "x-workspace": A, "x-pin": "1111" }],
    ["Ann's desk-code session (auth login)", { "x-workspace": A, "x-session": annDeskTok }],
    ["Ann's desk-open session", { "x-workspace": A, "x-session": annPinTok }],
    ["Ann's /api/account desk-code login session", { "x-workspace": A, "x-session": annAcctPinTok }],
    ["a stale session plus Ann's code", { "x-workspace": A, "x-session": "deadbeefdeadbeefdeadbeefdeadbeef", "x-pin": "1111" }],
    ["Cal (his own desk on code 1111) using 1111 on Ann's desk", { "x-workspace": A, "x-pin": "1111", "x-session": calTok }]
  ];
  for (const [tag, hd] of unproven) {
    for (const [name, body] of WRITES) {
      const before = snap();
      const r = await acctPost(hd, body);
      ok(exact403(r) && snap() === before, "[" + tag + "] POST /api/account " + name + ": exactly 403 sign in again, nothing written (" + r.statusCode + (snap() === before ? "" : ", STATE CHANGED") + ")");
    }
    for (const [name, h, body, url] of [
      ["auth password", auth, { action: "password", password: "x-pass-9999", email: "hijack@awp.test" }, "/api/auth"],
      ["auth details", auth, { action: "details", email: "cal-owns@awp.test", city: "X", name: "Mallory" }, "/api/auth"],
      ["admin handle", admin, { action: "handle", handle: "stolenawp3" }, "/api/admin"],
      ["admin at", admin, { action: "at", handle: "stolenawp4" }, "/api/admin"],
      ["admin plan", admin, { action: "plan", plan: otherPlan }, "/api/admin"],
      ["admin monthly", admin, { action: "monthly" }, "/api/admin"],
      ["admin accept-invite", admin, { action: "accept-invite", slug: B }, "/api/admin"],
      ["admin decline-invite", admin, { action: "decline-invite", slug: B }, "/api/admin"]
    ]) {
      const before = snap();
      const r = await call(h, "POST", hd, body, {}, url);
      ok(exact403(r) && snap() === before, "[" + tag + "] POST " + name + ": exactly 403 sign in again, nothing written (" + r.statusCode + ")");
    }
  }
  const annLogin = await emailLogin("ann@awp.test", "ann-pass-1234");
  ok(annLogin.r.statusCode === 200 && annLogin.tok && accOf(A).email === "ann@awp.test" && W(B).accountId !== annAcc.id, "[Cal on Ann's code] Ann's email and password still open her account; Bea's desk was not attached to Ann's");

  // Reads by the owner's code are unchanged.
  const g = await call(acch, "GET", { "x-workspace": A, "x-pin": "1111" }, null, {}, "/api/account");
  ok(g.statusCode === 200 && g.body.account && g.body.account.id === annAcc.id, "[reads] the owner's code still GETs her own account home (" + g.statusCode + ")");
  for (const action of ["sessions", "export", "mail-list"]) {
    const r = await acctPost({ "x-workspace": A, "x-pin": "1111" }, { action });
    ok(r.statusCode === 200, "[reads] the owner's code still reads POST " + action + " (" + r.statusCode + ")");
  }
  const lo = await acctPost({ "x-workspace": A, "x-session": annDeskTok }, { action: "logout" });
  ok(lo.statusCode === 200, "[reads] logout of her own desk-code session still works (" + lo.statusCode + ")");

  // Proven: Ann's own email + password sign-in changes her account.
  const P = { "x-workspace": A, "x-session": annLogin.tok };
  const det = await acctPost(P, { action: "details", city: "Annville" });
  ok(det.statusCode === 200 && accOf(A).city === "Annville", "[proven] Ann's email sign-in changes her details (" + det.statusCode + ")");
  const pl = await acctPost(P, { action: "plan", plan: otherPlan });
  ok(pl.statusCode === 200 && accOf(A).plan === otherPlan, "[proven] Ann's email sign-in switches her plan (" + pl.statusCode + ")");
  const hd = await acctPost(P, { action: "handle", handle: "annawp2" });
  ok(hd.statusCode === 200 && accOf(A).handle === "annawp2", "[proven] Ann's email sign-in sets her handle (" + hd.statusCode + ")");
  const wl = await acctPost(P, { action: "wallet", walletAddress: "0x" + "33".repeat(20), walletChainId: "0x1" });
  ok(wl.statusCode === 200 && /^0x3333/i.test(accOf(A).walletAddress || ""), "[proven] Ann's email sign-in connects a wallet (" + wl.statusCode + ")");
  const pw = await call(auth, "POST", P, { action: "password", current: "ann-pass-1234", password: "ann-pass-5678" });
  ok(pw.statusCode === 200 && (await emailLogin("ann@awp.test", "ann-pass-5678")).r.statusCode === 200, "[proven] Ann's email sign-in changes her password with the current one (" + pw.statusCode + ")");
  const ad = await call(admin, "POST", P, { action: "monthly" }, {}, "/api/admin");
  ok(ad.statusCode === 200, "[proven] Ann's email sign-in still notes monthly on admin (" + ad.statusCode + ")");
  const ai = await call(admin, "POST", P, { action: "accept-invite", slug: B }, {}, "/api/admin");
  ok(ai.statusCode !== 403, "[proven] Ann's email sign-in reaches accept-invite (no invite: " + ai.statusCode + ")");
  const bLogin = await emailLogin("bea@awp.test", "bea-pass-1234");
  const crossed = await acctPost({ "x-workspace": A, "x-pin": "1111", "x-session": bLogin.tok }, { action: "details", city: "Beaville" });
  ok(exact403(crossed) && accOf(A).city === "Annville", "[proven elsewhere] Bea's proven session plus Ann's code cannot change Ann's account (" + crossed.statusCode + ")");

  // First claim: no password and no email yet. One write sets both; nothing after that by code.
  const F = "awp-fay";
  await open(F, "Fay", "3131");
  const fay = accOf(F);
  ok(fay && !fay.password && !fay.email, "[first claim setup] Fay opened with neither an email nor a password");
  const FP = { "x-workspace": F, "x-pin": "3131" };
  let before = snap();
  const onlyPw = await acctPost(FP, { action: "password", password: "fay-pass-1234" });
  ok(exact403(onlyPw) && snap() === before, "[first claim] a password with no email is not the claim: 403, nothing written (" + onlyPw.statusCode + ")");
  before = snap();
  const onlyMail = await acctPost(FP, { action: "details", email: "fay@awp.test" });
  ok(exact403(onlyMail) && snap() === before, "[first claim] an email with no password is not the claim: 403, nothing written (" + onlyMail.statusCode + ")");
  before = snap();
  const mailNoPw = await acctPost(FP, { action: "password", email: "fay@awp.test" });
  ok(exact403(mailNoPw) && snap() === before, "[first claim] the password action with an email and no password is not the claim: 403, nothing written (" + mailNoPw.statusCode + ")");
  before = snap();
  const bothDetails = await acctPost(FP, { action: "details", email: "fay@awp.test", password: "fay-pass-1234" });
  ok(exact403(bothDetails) && snap() === before, "[first claim] email + password sent as details is not the claim (only action password): 403, nothing written (" + bothDetails.statusCode + ")");
  before = snap();
  const bothProfile = await call(auth, "POST", FP, { action: "details", email: "fay@awp.test", password: "fay-pass-1234" });
  ok(exact403(bothProfile) && snap() === before, "[first claim] the same as /api/auth details: 403, nothing written (" + bothProfile.statusCode + ")");
  before = snap();
  const taken = await acctPost(FP, { action: "password", email: "ann@awp.test", password: "fay-pass-1234" });
  ok(taken.statusCode === 409 && snap() === before && !fay.password && !fay.email, "[first claim] an email already on another account: 409 and nothing saved, not even the password (" + taken.statusCode + ")");
  before = snap();
  const short = await acctPost(FP, { action: "password", email: "fay@awp.test", password: "short" });
  ok(short.statusCode === 400 && snap() === before && !fay.email, "[first claim] a too-short password: 400 and nothing saved, not even the email (" + short.statusCode + ")");
  const claim = await acctPost(FP, { action: "password", email: "fay@awp.test", password: "fay-pass-1234" });
  ok(claim.statusCode === 200 && !!fay.password && fay.email === "fay@awp.test", "[first claim] email + password in one write from the desk code saves both (" + claim.statusCode + ")");
  const fayLogin = await emailLogin("fay@awp.test", "fay-pass-1234");
  ok(fayLogin.r.statusCode === 200 && fayLogin.tok, "[first claim] Fay's new email + password sign in");
  before = snap();
  const again = await acctPost(FP, { action: "password", email: "mal@awp.test", password: "mal-pass-1234" });
  ok(exact403(again) && snap() === before && fay.email === "fay@awp.test", "[first claim] a second claim by code (password and email now on file): 403, nothing written (" + again.statusCode + ")");
  before = snap();
  const againAuth = await call(auth, "POST", FP, { action: "password", email: "mal@awp.test", password: "mal-pass-1234" });
  ok(exact403(againAuth) && snap() === before, "[first claim] the same second claim on /api/auth: 403, nothing written (" + againAuth.statusCode + ")");
  // The same claim on /api/auth for a fresh account.
  const G = "awp-gia";
  await open(G, "Gia", "4141");
  const gClaim = await call(auth, "POST", { "x-workspace": G, "x-pin": "4141" }, { action: "password", email: "gia@awp.test", password: "gia-pass-1234" });
  ok(gClaim.statusCode === 200 && accOf(G).password && accOf(G).email === "gia@awp.test", "[first claim /api/auth] email + password in one write saves both (" + gClaim.statusCode + ")");

  // Partial state blocks the code: a password but no email, or an email but no password.
  const H = "awp-hal";
  await open(H, "Hal", "5151", "", "hal-pass-1234");
  ok(accOf(H).password && !accOf(H).email, "[partial setup] Hal has a password and no email");
  before = snap();
  const hClaim = await acctPost({ "x-workspace": H, "x-pin": "5151" }, { action: "password", email: "hal@awp.test", password: "hal-pass-5678" });
  ok(exact403(hClaim) && snap() === before, "[partial] password on file, no email: a code claim gets 403, nothing written (" + hClaim.statusCode + ")");
  const I = "awp-ivy";
  await open(I, "Ivy", "6161", "ivy@awp.test");
  ok(!accOf(I).password && accOf(I).email === "ivy@awp.test", "[partial setup] Ivy opened with an email and no password");
  before = snap();
  const iClaim = await acctPost({ "x-workspace": I, "x-pin": "6161" }, { action: "password", email: "ivy@awp.test", password: "ivy-pass-1234" });
  ok(exact403(iClaim) && snap() === before, "[partial] email on file, no password: a code claim gets 403, nothing written (no route sets her first password today) (" + iClaim.statusCode + ")");
  before = snap();
  const iAuth = await call(auth, "POST", { "x-workspace": I, "x-pin": "6161" }, { action: "password", password: "ivy-pass-1234" });
  ok(exact403(iAuth) && snap() === before, "[partial] the same on /api/auth: 403, nothing written (" + iAuth.statusCode + ")");

  // Replies that were not account writes stay as they were.
  const ollyPw = await acctPost({ "x-workspace": A, "x-pin": "7171" }, { action: "password", password: "olly-pass-1234", email: "olly@awp.test" });
  ok(ollyPw.statusCode === 404, "[unchanged] a helper with no account still gets 404 No AIA account (" + ollyPw.statusCode + ")");
  const strangerPw = await acctPost({ "x-workspace": A }, { action: "password", password: "x-pass-1234", email: "x@awp.test" });
  ok(strangerPw.statusCode === 401, "[unchanged] no seat still gets 401 (" + strangerPw.statusCode + ")");
  const ollyAttach = await acctPost({ "x-workspace": A, "x-pin": "7171" }, { action: "attach", desk: B });
  ok(ollyAttach.statusCode === 403 && ollyAttach.body.error === "Owner desk code required to attach a desk.", "[unchanged] a helper's attach still gets the owner-code 403 (" + ollyAttach.statusCode + ")");
  const unknown = await acctPost({ "x-workspace": A, "x-pin": "1111" }, { action: "nope" });
  ok(unknown.statusCode === 400, "[unchanged] an unknown action is still 400 (" + unknown.statusCode + ")");

  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  ok(pkg.indexOf("node scripts/check-account-writes-need-proof.js") >= 0, "package.json test runs this check");
  try { fs.rmSync(process.env.AIA_STORE_PATH, { force: true }); } catch (e) {}
}

// [name, file, find, replace, equivalent?]
const MUTANTS = [
  ["W01 no /api/account write gate", "api/_account-http.js", "if (ACCOUNT_WRITES.indexOf(action) >= 0) {", "if (false) {"],
  ["W02 gate list drops attach", "api/_account-http.js", 'const ACCOUNT_WRITES = ["attach", ', "const ACCOUNT_WRITES = ["],
  ["W03 gate list drops logout-all", "api/_account-http.js", '"mint", "logout-all", ', '"mint", '],
  ["W04 gate list drops wallet", "api/_account-http.js", '"remove-mail", "wallet", ', '"remove-mail", '],
  ["W05 gate list drops unlink-provider", "api/_account-http.js", '"link-provider", "unlink-provider"];', '"link-provider"];'],
  ["W06 gate list drops details", "api/_account-http.js", '"password", "details", ', '"password", '],
  ["W07 proof ignores which account", "api/_account.js", "lib.sessionProof(s.proof) && s.accountId === acc.id);", "lib.sessionProof(s.proof));"],
  ["W08 any session counts as proof", "api/_account.js", "return !!(s && typeof lib.sessionProof === \"function\" && lib.sessionProof(s.proof) && s.accountId === acc.id);", "return !!(s && s.accountId === acc.id);"],
  ["W09 first claim ignores a password on file", "api/_account.js", "return !!acc && !acc.password && !emailOf(acc) &&", "return !!acc && !emailOf(acc) &&"],
  ["W10 first claim ignores an email on file", "api/_account.js", "return !!acc && !acc.password && !emailOf(acc) &&", "return !!acc && !acc.password &&"],
  ["W11 first claim without an email", "api/_account.js", "!emailOf(acc) && !!body && looksLikeEmail(body.email) &&", "!emailOf(acc) && !!body &&"],
  ["W12 first claim without a password", "api/_account.js", "&& !!String(body.password || body.next || \"\");", ";"],
  ["W13 claim saves the password before the email check", "api/_account.js", "  const e = emailOf(body);\n  if (emailTaken(e, acc.id))", "  setAccountPassword(acc, body.password || body.next);\n  const e = emailOf(body);\n  if (emailTaken(e, acc.id))"],
  ["W14 claim saves the email before the password check", "api/_account.js", "  const check = passwordOk(body.password || body.next);\n  if (!check.ok) return { ok: false, status: 400", "  acc.email = emailOf(body) || acc.email;\n  const check = passwordOk(body.password || body.next);\n  if (!check.ok) return { ok: false, status: 400"],
  ["W15 first claim on any action", "api/_account.js", 'if (action === "password" && firstClaim(acc, body)) return null;', "if (firstClaim(acc, body)) return null;"],
  ["W16 /api/account claim skips claimFirst (old set-password path)", "api/_account-http.js", "      if (!require(\"./_account\").provenFor(req, acc)) {\n        const made = require(\"./_account\").claimFirst(acc, body);", "      if (false) {\n        const made = require(\"./_account\").claimFirst(acc, body);"],
  ["W17 auth password gate gone", "api/auth.js", "if (refusedPw) return res.status(403).json(refusedPw);", ""],
  ["W18 auth details gate gone", "api/auth.js", "if (refusedDt) return res.status(403).json(refusedDt);", ""],
  ["W19 auth details renames the seat before the gate", "api/auth.js", "      const refusedDt = require(\"./_account\").writeRefused(req, acc, \"details\", body);", "      if (body.name) found.person.name = String(body.name).trim().slice(0, 80);\n      const refusedDt = require(\"./_account\").writeRefused(req, acc, \"details\", body);"],
  ["W20 admin handle gate gone", "api/admin.js", "if (refusedH) return res.status(403).json(refusedH);", ""],
  ["W21 admin plan gate gone", "api/admin.js", "if (refusedP) return res.status(403).json(refusedP);", ""],
  ["W22 admin monthly gate gone", "api/admin.js", "if (refusedM) return res.status(403).json(refusedM);", ""],
  ["W23 admin invite gate gone", "api/admin.js", "if (refusedI) return res.status(403).json(refusedI);", ""],
  ["W24 gate refuses even proven sessions", "api/_account.js", "if (!acc || provenFor(req, acc)) return null;", "if (!acc) return null;"],
  ["W25 gate refuses seats with no account (helpers lose their 404)", "api/_account.js", "if (!acc || provenFor(req, acc)) return null;", "if (provenFor(req, acc)) return null;"],
  ["W26 package.json does not run the check", "package.json", " && node scripts/check-account-writes-need-proof.js", ""]
];
function runMutants() {
  const { spawnSync } = require("child_process");
  const skip = new Set([".git", "node_modules"]);
  const copy = (src, dst) => { fs.mkdirSync(dst, { recursive: true }); for (const e of fs.readdirSync(src, { withFileTypes: true })) { if (skip.has(e.name)) continue; const s = path.join(src, e.name), d = path.join(dst, e.name); if (e.isDirectory()) copy(s, d); else if (e.isFile()) fs.copyFileSync(s, d); } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aia-awp-mut-"));
  copy(root, dir);
  if (fs.existsSync(path.join(root, "node_modules"))) fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
  const run = () => { const h = fs.mkdtempSync(path.join(os.tmpdir(), "aia-awp-home-")); return spawnSync(process.execPath, [path.join(dir, "scripts/check-account-writes-need-proof.js")], { cwd: dir, env: { PATH: process.env.PATH || "", HOME: h, TMPDIR: h, AIA_PIN_SALT: process.env.AIA_PIN_SALT || "" }, encoding: "utf8", timeout: 120000 }); };
  const base = run();
  if (base.status !== 0) { console.error("unmutated check fails in the copy:\n" + ((base.stdout || "") + (base.stderr || "")).slice(-2000)); process.exit(1); }
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
  if (failed) { console.error("check-account-writes-need-proof: " + failed + " failed"); process.exit(1); }
  console.log("check-account-writes-need-proof: ok");
  process.exit(0);
}).catch((e) => { console.error("FAIL crash " + (e && e.stack || e)); process.exit(1); });
