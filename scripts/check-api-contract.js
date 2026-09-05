const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-api-contract-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
process.env.AIA_TLD_PROBE = "0";

delete global.__aia;
delete global.__aiaHydrate;
delete require.cache[require.resolve("../api/_lib")];
delete require.cache[require.resolve("../api/health")];
delete require.cache[require.resolve("../api/rules")];
delete require.cache[require.resolve("../api/connections")];

const lib = require("../api/_lib");
const health = require("../api/health");
const status = health.status;
const rules = require("../api/rules");
const connections = require("../api/connections");

function fail(msg) {
  console.error("FAIL " + msg);
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
    end() { return this; }
  };
}

async function main() {
  [
    "issueSession", "findSession", "listSessions", "revokeSession", "sessionCookie",
    "clearSessionCookie", "parseCookies", "sessionFromReq", "isLocked", "noteFail", "noteOk", "sessionTokenOf"
  ].forEach((key) => {
    if (typeof lib[key] !== "function") fail("_lib missing " + key);
  });
  if (!process.exitCode) pass("_lib exports account/session helpers");

  const cookies = lib.parseCookies({ headers: { cookie: "a=1; aia_session=abc123%20z" } });
  if (cookies.aia_session !== "abc123 z") fail("parseCookies should decode aia_session");
  else pass("parseCookies decodes session cookie");

  const setCookie = lib.sessionCookie("tok123");
  const clearCookie = lib.clearSessionCookie();
  if (!/aia_session=tok123/.test(setCookie) || !/HttpOnly/.test(setCookie) || !/Max-Age=1209600/.test(setCookie)) fail("sessionCookie contract changed");
  else if (!/aia_session=;/.test(clearCookie) || !/Max-Age=0/.test(clearCookie)) fail("clearSessionCookie contract changed");
  else pass("session cookies use aia_session + max age");

  const res = mockRes();
  await health({ method: "GET", headers: {}, query: {} }, res);
  if (res.statusCode !== 200 || !res.body || !res.body.accounts) fail("health should answer with accounts block");
  else pass("health endpoint answers");

  if (res.headers["Access-Control-Allow-Headers"] !== "Content-Type, Authorization, X-Workspace, X-Pin, X-Session") {
    fail("CORS allow headers missing X-Session");
  } else pass("CORS allows X-Session");

  if (res.body.accounts.login !== "desk name + desk code, or email + password") fail("health login copy should mention both doors");
  else if (!/^HOLD/.test(res.body.accounts.mfa)) fail("health mfa copy should say HOLD");
  else pass("health copy matches account doors");

  if (lib.slugify("") !== "" || lib.slugify(null) !== "") fail("slugify should not invent demo");
  else pass("slugify leaves an empty name empty");
  if (lib.workspaceOf({ headers: {}, query: {} }) !== "") fail("workspaceOf should not default to demo");
  else pass("workspaceOf is unset without a desk");

  if (typeof status !== "function") fail("health.status should be the desk status handler");
  else pass("status lives on health.js");

  const st = mockRes();
  await status({ method: "GET", headers: {}, query: {} }, st);
  if (st.statusCode !== 200 || !st.body || st.body.ok !== true) fail("status should 200, got " + st.statusCode);
  else pass("status endpoint answers");
  if (st.body.workspace === "demo" || st.body.label === "demo") fail("empty status should not label workspace demo");
  else pass("empty status workspace is not demo");
  if (st.body.status !== "hold" || st.body.answered !== false) fail("empty desk should stay hold until a pipe answers");
  else pass("status stays hold with no writeback");
  if (!st.body.aiaTld || st.body.aiaTld.owned || st.body.aiaTld.ownedByConnected || st.body.aiaTld.mint || st.body.aiaTld.charged || st.body.aiaTld.collect !== "hold") {
    fail("status aiaTld must stay honest HOLD and not invent owned " + JSON.stringify(st.body.aiaTld));
  } else pass("status aiaTld is honest HOLD");
  if (res.body.aiaTld && (res.body.aiaTld.mint || res.body.aiaTld.charged || res.body.aiaTld.collect !== "hold")) {
    fail("health aiaTld block invented mint or Collect");
  } else pass("health aiaTld block is honest");

  const healthPipes = (res.body.pipes || []).map((p) => p.id + ":" + p.status + ":" + p.live).join(",");
  const statusPipes = (st.body.pipes || []).map((p) => p.id + ":" + p.status + ":" + p.live).join(",");
  if (!healthPipes || healthPipes !== statusPipes) fail("status pipes should match health catalog");
  else pass("status pipes match health");
  const webhook = (st.body.pipes || []).find((p) => p.id === "webhook");
  const whatnot = (st.body.pipes || []).find((p) => p.id === "whatnot");
  const held = (st.body.pipes || []).filter((p) => ["square", "ebay", "calendar", "consign", "sms"].indexOf(p.id) >= 0);
  if (!webhook || webhook.status !== "live" || !webhook.live) fail("webhook should stay live in the catalog");
  else if (!whatnot || whatnot.status !== "down" || whatnot.live) fail("whatnot should stay down");
  else if (held.some((p) => p.status !== "hold" || p.live)) fail("paid pipes should stay hold without keys");
  else pass("catalog honesty matches health");

  lib.mem.jobs.push({
    id: "job_status_writeback",
    workspace: "probe-desk",
    dispatch: { provider: "webhook", inbound: true, demo: false }
  });
  const live = mockRes();
  await status({ method: "GET", headers: { "x-workspace": "probe-desk" }, query: {} }, live);
  if (live.body.status !== "live" || live.body.workspace !== "probe-desk" || live.body.answered !== true) {
    fail("writeback should mark that desk live, got " + JSON.stringify(live.body));
  } else pass("status goes live only after a real pipe answers");
  if (live.body.inbound !== "https://www.automateitaway.com/api/hook?workspace=probe-desk") {
    fail("status inbound must be www host, got " + live.body.inbound);
  } else pass("status inbound uses www host");
  const stillHold = mockRes();
  await status({ method: "GET", headers: {}, query: {} }, stillHold);
  if (stillHold.body.status !== "hold" || stillHold.body.workspace) fail("unset workspace should not inherit another desk's writeback");
  else pass("unset workspace stays hold");
  lib.mem.jobs = (lib.mem.jobs || []).filter((j) => j && j.id !== "job_status_writeback");

  const viaRewrite = mockRes();
  await health({ method: "GET", url: "/api/health?view=status", headers: {}, query: { view: "status" } }, viaRewrite);
  if (viaRewrite.body.status !== "hold" || viaRewrite.body.accounts) fail("health?view=status should return the status payload");
  else pass("health rewrite view=status answers as status");
  const viaUrl = mockRes();
  await health({ method: "GET", url: "/api/status", headers: {}, query: {} }, viaUrl);
  if (viaUrl.body.status !== "hold" || viaUrl.body.product) fail("/api/status on health should return the status payload");
  else pass("health handler answers /api/status");

  const rulesRes = mockRes();
  await rules({ method: "GET", headers: {}, query: {} }, rulesRes);
  if (rulesRes.statusCode !== 200 || !Array.isArray(rulesRes.body.rules) || rulesRes.body.rules.length) {
    fail("empty desk rules should be [], got " + JSON.stringify(rulesRes.body));
  } else if (!Array.isArray(rulesRes.body.starters) || rulesRes.body.starters.length) {
    fail("empty desk starters should be []");
  } else if (rulesRes.body.workspace === "demo") {
    fail("rules should not label an empty desk demo");
  } else pass("rules stay empty and unlabeled on a new desk");

  const conn = mockRes();
  await connections({ method: "GET", headers: {}, query: {} }, conn);
  if (conn.statusCode !== 200) fail("connections should answer without a desk");
  else if (conn.body.workspace === "demo") fail("connections should not label an empty desk demo");
  else pass("connections workspace is unset without a desk");
  if (conn.body.inbound !== "https://www.automateitaway.com/api/hook") {
    fail("connections inbound must be www host, got " + conn.body.inbound);
  } else pass("connections inbound uses www host");

  if (process.exitCode) {
    console.error("check-api-contract failed");
    process.exit(1);
  }
  console.log("check-api-contract passed");
}

main().catch((err) => {
  fail(err && err.stack || String(err));
  console.error("check-api-contract failed");
  process.exit(1);
});
