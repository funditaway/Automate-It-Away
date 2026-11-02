#!/usr/bin/env node
require("./_env-guard");
// Opening a new desk must not file it under an account that already exists unless the
// request proves it IS that account (a live owner session of that account, or that
// account's email + password). Typing a victim's email, account name, or account id into
// the open form must give a new, separate account with no reach into the victim's desks.
// Runs the real handlers (POST /api/auth open, GET /api/account, GET /api/desks,
// POST /api/desks export, GET /api/jobs, GET /api/upload) against a temp store. No network.
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const store = path.join(os.tmpdir(), "aia-new-desk-claim-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
delete global.__aia;
delete global.__aiaHydrate;

let failed = 0;
const held = [];
const listedByEmail = [];
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
  await handler({ method, headers: headers || {}, body: body || {}, query: query || {}, url: url || "/api/auth" }, res);
  return res;
}

function leaked(body, bit) {
  return JSON.stringify(body == null ? "" : body).indexOf(bit) >= 0;
}

async function main() {
  const auth = require(path.join(root, "api/auth"));
  const jobs = require(path.join(root, "api/jobs"));
  const upload = require(path.join(root, "api/upload"));
  const lib = require(path.join(root, "api/_lib"));
  const account = require(path.join(root, "api/_account"));
  await lib.ready();

  async function open(slug, body, headers) {
    const r = await call(auth, "POST", Object.assign({ "x-workspace": slug }, headers || {}),
      Object.assign({ action: "open", slug, biz: slug.replace(/-/g, " "), name: "Owner " + slug, pin: "4321" }, body || {}));
    if (r.statusCode !== 201 || !r.body || !r.body.session || !r.body.session.token) {
      fail("could not open " + slug + ": " + r.statusCode + " " + JSON.stringify(r.body && r.body.error));
      return { token: "", body: r.body || {} };
    }
    return { token: r.body.session.token, body: r.body };
  }
  const deskRow = (slug) => lib.mem.workspaces.find((w) => w && w.slug === slug) || null;
  const acctById = (id) => (lib.mem.accounts || []).find((a) => a && a.id === id) || null;
  const sessionOf = (tok) => (lib.findSession(tok, { slide: false }) || null);

  // Victim: one desk, email + password, a private card and file.
  const V = "vic-shop";
  const VEMAIL = "vic@example.test";
  const VPASS = "vic-pass-8812";
  const vic = await open(V, { biz: "Vic Shop", name: "Vic", email: VEMAIL, password: VPASS, pin: "1111" });
  const vicAcc = acctById(deskRow(V).accountId);
  if (!vicAcc) { fail("victim desk has no account"); return; }
  const vicDesksBefore = JSON.stringify(vicAcc.desks || []);
  const vicPwBefore = vicAcc.password;
  lib.mem.files.unshift({ id: "file_vic", workspace: V, name: "vic-ledger.pdf", type: "application/pdf", remoteUrl: "https://blob.example.test/vic-secret-91.pdf", createdAt: new Date().toISOString() });
  lib.mem.jobs.unshift({ id: "job_vic", workspace: V, title: "Vic private card", status: "exception", step: "Qualify", createdAt: new Date().toISOString() });
  pass("victim desk " + V + " open on its own account");

  // Control: a stranger's desk with nothing claimed. Used to tell this hole apart from the
  // separate personOf cross-desk hole (PR 340): if a plain owner session already walks into
  // the victim desk, desk-level probes cannot isolate the account claim.
  const ctrl = await open("ctrl-desk", { email: "ctrl@example.test" });
  async function reaches(tok) {
    const h = { "x-session": tok, "x-workspace": V };
    const out = [];
    const d = await call(auth, "GET", h, null, {}, "/api/desks");
    if (d.statusCode === 200 || (d.body && d.body.desk)) out.push("GET /api/desks " + d.statusCode);
    const ex = await call(auth, "POST", h, { action: "export", slug: V }, {}, "/api/desks");
    if (ex.statusCode === 200 || (ex.body && ex.body.pack)) out.push("POST /api/desks export " + ex.statusCode);
    const j = await call(jobs, "GET", h, null, {}, "/api/jobs");
    if (j.statusCode === 200 || leaked(j.body, "Vic private card")) out.push("GET /api/jobs " + j.statusCode);
    const u = await call(upload, "GET", h, null, {}, "/api/upload");
    if (u.statusCode === 200 || leaked(u.body, "vic-ledger.pdf")) out.push("GET /api/upload " + u.statusCode);
    return out;
  }
  const ctrlReach = await reaches(ctrl.token);
  const personOfOpen = ctrlReach.length > 0;
  if (personOfOpen) console.log("note: a plain owner session of an unrelated desk already reaches " + V + " (" + ctrlReach.join(", ") + "). That is the personOf hole PR 340 closes; desk-level probes below are reported, not failed, unless the claimed session reaches more than the control.");

  async function attack(label, slug, body) {
    const a = await open(slug, body);
    if (!a.token) return;
    const row = deskRow(slug);
    const sess = sessionOf(a.token);
    if (row.accountId === vicAcc.id) fail(label + ": new desk " + slug + " filed under the victim's account");
    else pass(label + ": new desk filed under its own account");
    if (a.body.account && a.body.account.id === vicAcc.id) fail(label + ": open answered with the victim's account id");
    if (sess && sess.accountId === vicAcc.id) fail(label + ": new desk session carries the victim's accountId");
    else pass(label + ": new desk session does not carry the victim's accountId");
    if (account.findAccountByEmail(VEMAIL) !== vicAcc) fail(label + ": victim email now finds another account");
    const home = await call(auth, "GET", { "x-session": a.token, "x-workspace": slug }, null, {}, "/api/account");
    const homeAcc = home.body && (home.body.account || home.body.shop || {});
    if (home.statusCode !== 200) fail(label + ": GET /api/account for the new desk failed " + home.statusCode);
    else if (!homeAcc || homeAcc.id === vicAcc.id || leaked(home.body, vicAcc.id) || leaked(homeAcc, VEMAIL) || leaked(homeAcc.desks, V)) fail(label + ": GET /api/account (settings) shows the victim's account");
    else pass(label + ": account settings are the new account, not the victim's");
    if (leaked(home.body && home.body.desksOwned, V)) listedByEmail.push(label);
    const reach = await reaches(a.token);
    const extra = reach.filter((r) => ctrlReach.map((c) => c.split(" ").slice(0, -1).join(" ")).indexOf(r.split(" ").slice(0, -1).join(" ")) < 0);
    if (!personOfOpen) {
      if (reach.length) fail(label + ": new desk session reaches victim desk: " + reach.join(", "));
      else pass(label + ": victim desk refused on /api/desks, export, /api/jobs, /api/upload");
    } else if (extra.length) {
      fail(label + ": claimed session reaches more of the victim desk than a plain session: " + extra.join(", "));
    } else {
      held.push(label);
      pass(label + ": no reach beyond the plain-session control (desk-level refusal needs PR 340)");
    }
  }

  await attack("victim email", "evil-mail", { email: VEMAIL, password: "attacker-pass-1" });
  await attack("victim account name", "evil-name", { account: vicAcc.name });
  await attack("victim account id", "evil-id", { id: vicAcc.id, accountId: vicAcc.id });
  await attack("victim email, wrong password", "evil-wrongpw", { email: VEMAIL, password: "not-vic-pass" });

  if (JSON.stringify(vicAcc.desks || []) !== vicDesksBefore) fail("victim account desk list changed: " + JSON.stringify(vicAcc.desks));
  else pass("victim account desk list unchanged " + vicDesksBefore);
  if (vicAcc.password !== vicPwBefore) fail("victim password changed by a stranger's open");
  if (account.loginWithEmail(VEMAIL, VPASS).ok !== true || account.loginWithEmail(VEMAIL, VPASS).account !== vicAcc) fail("victim email login no longer lands on the victim account");
  else pass("victim email + password still opens the victim account");

  // Flood: nine more opens with the victim's email must not push the victim's sessions out.
  for (let i = 0; i < 9; i += 1) await open("evil-flood-" + i, { email: VEMAIL });
  if (!sessionOf(vic.token)) fail("victim's own session was pushed out by strangers opening desks with the victim's email");
  else pass("victim session still live after nine strangers' opens with the victim's email");
  if (JSON.stringify(vicAcc.desks || []) !== vicDesksBefore) fail("victim account desk list changed after flood: " + JSON.stringify(vicAcc.desks));

  // A victim account with no password yet (desk opened by code with an email only): a stranger's open
  // that types that email plus a password of their own must not set the victim's password.
  const NP = "nopw-shop", NPEMAIL = "nopw.owner@example.test";
  await open(NP, { biz: "No Pw Shop", name: "Nia", email: NPEMAIL, pin: "5151" });
  const npAcc = deskRow(NP) && acctById(deskRow(NP).accountId);
  if (!npAcc || npAcc.password) fail("setup: no-password victim account (" + (npAcc && npAcc.id) + ")");
  const npDesksBefore = JSON.stringify((npAcc && npAcc.desks) || []);
  await open("evil-nopw", { email: NPEMAIL, password: "attacker-pass-9" });
  const npLogin = account.loginWithEmail(NPEMAIL, "attacker-pass-9");
  if (!npAcc || npAcc.password || (npLogin && npLogin.ok) || (deskRow("evil-nopw") && deskRow("evil-nopw").accountId === npAcc.id) || JSON.stringify(npAcc.desks || []) !== npDesksBefore) {
    fail("no-password victim: a stranger's open set a password or filed a desk on the account (password set: " + !!(npAcc && npAcc.password) + ", attacker login ok: " + !!(npLogin && npLogin.ok) + ")");
  } else pass("no-password victim: a stranger's open with the victim's email cannot set the victim's password or file a desk there");

  // A helper seat on the victim desk (legacy shape: the seat and its session carry the owner's account
  // id), but a helper is not that account. A new desk the helper opens with that session (and the
  // owner's email) is not filed there.
  const helperSeat = { id: "p_vic_helper", name: "Hana", role: "helper", kind: "helper", status: "open", pin: "7777", workspace: V, accountId: vicAcc.id };
  deskRow(V).people.push(helperSeat);
  const hs = lib.issueSession(helperSeat, deskRow(V), null);
  const htok = hs && (hs.token || (hs.session && hs.session.token));
  await open("helper-own", { email: VEMAIL, name: "Hana" }, { "x-session": htok });
  if (!htok || (deskRow("helper-own") && deskRow("helper-own").accountId === vicAcc.id) || JSON.stringify(vicAcc.desks || []) !== vicDesksBefore) {
    fail("helper session on the victim desk: new desk filed under the victim's account (" + (deskRow("helper-own") && deskRow("helper-own").accountId) + ")");
  } else pass("helper session on the victim desk: a new desk it opens is not filed under the owner's account");

  // A legacy desk with no account yet that only typed the victim's email: when the server files it
  // (accountForDesk, no request), the typed email alone does not put it under the victim's account.
  lib.mem.workspaces.push({ slug: "legacy-typed", name: "Legacy Typed", biz: "Legacy Typed", email: VEMAIL, people: [], createdAt: new Date().toISOString() });
  const legacyAcc = account.accountForDesk(deskRow("legacy-typed"));
  if (!legacyAcc || legacyAcc.id === vicAcc.id || JSON.stringify(vicAcc.desks || []) !== vicDesksBefore) fail("legacy desk with a typed victim email filed under the victim's account");
  else pass("legacy desk with a typed victim email gets its own account, not the victim's");

  // Legit: the signed-in victim adds a second desk; it joins the same account and the new
  // session works on both desks.
  const V2 = "vic-second";
  const two = await open(V2, { biz: "Vic Second", name: "Vic", email: VEMAIL, pin: "2222" }, { "x-session": vic.token });
  if (deskRow(V2) && deskRow(V2).accountId === vicAcc.id && (vicAcc.desks || []).indexOf(V2) >= 0) pass("signed-in owner: second desk linked to the same account");
  else fail("signed-in owner: second desk not linked to the owner's account (" + (deskRow(V2) && deskRow(V2).accountId) + ")");
  for (const tok of [two.token, vic.token]) {
    for (const slug of [V, V2]) {
      const d = await call(auth, "GET", { "x-session": tok, "x-workspace": slug }, null, {}, "/api/desks");
      const j = await call(jobs, "GET", { "x-session": tok, "x-workspace": slug }, null, {}, "/api/jobs");
      const who = tok === two.token ? "new session" : "first session";
      if (d.statusCode !== 200 || j.statusCode !== 200) fail("signed-in owner: " + who + " on " + slug + " got desks " + d.statusCode + " jobs " + j.statusCode);
      else pass("signed-in owner: " + who + " works on " + slug);
    }
  }
  const mine = await call(auth, "GET", { "x-session": two.token, "x-workspace": V2 }, null, {}, "/api/account");
  const mineAcc = mine.body && (mine.body.account || {});
  if (mine.statusCode !== 200 || mineAcc.id !== vicAcc.id) fail("signed-in owner: account settings from desk two are not the owner's account");
  else pass("signed-in owner: account settings from desk two are the owner's account");

  // Legit: not signed in, but the account's email + password on the open form.
  const V3 = "vic-third";
  await open(V3, { biz: "Vic Third", name: "Vic", email: VEMAIL, password: VPASS, pin: "3333" });
  if (deskRow(V3) && deskRow(V3).accountId === vicAcc.id) pass("email + right password: desk linked to that account");
  else fail("email + right password: desk not linked to the account");

  if (listedByEmail.length) console.log("note: account home for [" + listedByEmail.join("; ") + "] still lists " + V + " by name because desksForPerson (api/_plans.js) matches seats by typed email. A listing only; not an open seat. Separate from this check.");
  if (held.length) console.log("note: desk-level refusal for [" + held.join("; ") + "] also needs PR 340 (personOf).");
  if (failed) console.error("check-new-desk-account-claim: " + failed + " failed");
  else console.log("check-new-desk-account-claim: ok");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => {
  try { require("fs").unlinkSync(store); } catch (e) {}
});
