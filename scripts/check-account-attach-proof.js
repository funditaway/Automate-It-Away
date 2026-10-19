#!/usr/bin/env node
// Proves POST /api/account {action:"attach"} only adds a desk to your account when the
// request proves you own that desk (its owner desk code, or your account already holds
// its open owner seat). Naming someone else's desk is refused and changes nothing.
// Runs the real handlers against a temp store. No network.
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-attach-proof-" + Date.now() + ".json");
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
const ACCOUNT_URL = "/api/auth?via=account";

async function main() {
  const auth = require(path.join(root, "api/auth"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();

  async function openDesk(slug, name, pin, email, password) {
    const r = await call(auth, "POST", { "x-workspace": slug }, { action: "open", slug, biz: slug.replace(/-/g, " "), name, pin, email: email || "", password: password || "" });
    const tok = r.body && r.body.session && r.body.session.token;
    if (r.statusCode !== 201 || !tok) { fail("could not open " + slug + ": " + r.statusCode + " " + JSON.stringify(r.body)); return ""; }
    return tok;
  }
  const deskOf = (slug) => lib.mem.workspaces.find((w) => w && w.slug === slug);
  const accountOf = (id) => (lib.mem.accounts || []).find((a) => a && a.id === id);

  const ATK = "aap-attacker";
  const VIC = "aap-victim";
  const MINE = "aap-attacker-two";
  const atkTok = await openDesk(ATK, "Ann", "1111", "ann@example.test", "ann-password-1");
  const vicTok = await openDesk(VIC, "Vic", "2222", "vic@example.test", "vic-password-1");
  const mineTok = await openDesk(MINE, "Ann", "3333", "", "");
  if (!atkTok || !vicTok || !mineTok) return;
  const atkAccId = deskOf(ATK).accountId;
  const vicAccId = deskOf(VIC).accountId;
  if (!atkAccId || !vicAccId || atkAccId === vicAccId) { fail("setup: desks should sit on two different accounts"); return; }
  pass("setup: attacker desk and victim desk on two accounts");

  const atk = { "x-session": atkTok, "x-workspace": ATK };

  // 1. Attacker owner names the victim desk. No proof, attacker's own code, a wrong code.
  const tries = [
    ["no proof", { action: "attach", desk: VIC }],
    ["attacker's own desk code", { action: "attach", desk: VIC, pin: "1111" }],
    ["wrong code", { action: "attach", desk: VIC, pin: "9999" }],
    ["victim owner id + account in body", { action: "attach", desk: VIC, personId: "p_owner", accountId: vicAccId }]
  ];
  for (const [label, body] of tries) {
    const r = await call(auth, "POST", atk, body, {}, ACCOUNT_URL);
    if (r.statusCode === 200 || (r.body && r.body.ok !== false)) fail("attach victim desk (" + label + ") was allowed: " + r.statusCode);
    else pass("attach victim desk (" + label + ") refused (" + r.statusCode + "): " + (r.body && r.body.error));
  }
  const atkPin = await call(auth, "POST", { "x-workspace": ATK, "x-pin": "1111" }, { action: "attach", desk: VIC }, {}, ACCOUNT_URL);
  if (atkPin.statusCode === 200) fail("attach victim desk with attacker X-Pin was allowed");
  else pass("attach victim desk with attacker X-Pin refused (" + atkPin.statusCode + ")");

  // 2. Nothing changed for the victim desk.
  if (deskOf(VIC).accountId !== vicAccId) fail("victim desk accountId moved to " + deskOf(VIC).accountId);
  else pass("victim desk still on the victim account");
  const atkAcc = accountOf(atkAccId);
  if ((atkAcc.desks || []).indexOf(VIC) >= 0 || (atkAcc.memberDesks || []).indexOf(VIC) >= 0) fail("victim desk is in the attacker account list");
  else pass("victim desk not in the attacker account list");

  // 3. No access gained through the account doors.
  const home = await call(auth, "GET", atk, null, {}, ACCOUNT_URL);
  if (JSON.stringify(home.body || {}).indexOf(VIC) >= 0) fail("attacker GET /api/account lists the victim desk");
  else pass("attacker GET /api/account does not list the victim desk (" + home.statusCode + ")");
  const login = await call(auth, "POST", {}, { action: "login", email: "ann@example.test", password: "ann-password-1" }, {}, ACCOUNT_URL);
  const loginDesk = login.body && login.body.session && login.body.session.workspace;
  if (loginDesk === VIC || JSON.stringify(login.body || {}).indexOf(VIC) >= 0) fail("attacker email login opens or lists the victim desk");
  else pass("attacker email login does not reach the victim desk (" + login.statusCode + ")");
  const vicHome = await call(auth, "GET", { "x-session": vicTok, "x-workspace": VIC }, null, {}, ACCOUNT_URL);
  if (vicHome.statusCode !== 200 || JSON.stringify(vicHome.body || {}).indexOf(VIC) < 0) fail("victim owner lost their account home: " + vicHome.statusCode);
  else pass("victim owner still opens their account with their desk");

  // 4. A missing desk still answers the same as before.
  const none = await call(auth, "POST", atk, { action: "attach", desk: "aap-no-such-desk" }, {}, ACCOUNT_URL);
  if (none.statusCode !== 404) fail("missing desk answer changed: " + none.statusCode);
  else pass("missing desk still 404");

  // 5. Legit: the same owner attaches their own second desk with that desk's code.
  const mineAccBefore = deskOf(MINE).accountId;
  const own = await call(auth, "POST", atk, { action: "attach", desk: MINE, pin: "3333" }, {}, ACCOUNT_URL);
  if (own.statusCode !== 200) fail("owner attaching own second desk with its code refused: " + own.statusCode + " " + JSON.stringify(own.body && own.body.error));
  else pass("owner attaches own second desk with its code (200)");
  if ((accountOf(atkAccId).desks || []).indexOf(MINE) < 0) fail("own second desk not in account list after attach");
  else pass("own second desk now in account list");
  if (deskOf(MINE).accountId !== atkAccId) fail("own second desk accountId not moved (" + mineAccBefore + " -> " + deskOf(MINE).accountId + ")");
  else pass("own second desk now on the owner's account");
  // Attaching a desk the account already owns is still fine without a code.
  const again = await call(auth, "POST", atk, { action: "attach", desk: ATK }, {}, ACCOUNT_URL);
  if (again.statusCode !== 200) fail("re-attaching own current desk refused: " + again.statusCode);
  else pass("re-attaching own current desk ok (200)");
}

main().then(() => {
  if (failed) { console.error(failed + " check(s) failed"); process.exit(1); }
  console.log("check-account-attach-proof: all good");
}).catch((e) => { console.error("FAIL threw " + (e && e.stack || e)); process.exit(1); });
