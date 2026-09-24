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
    "clearSessionCookie", "parseCookies", "sessionFromReq", "isLocked", "noteFail", "noteOk", "sessionTokenOf", "applyStore"
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
  else if (/opt-in/i.test(res.body.accounts.note || "")) fail("health accounts.note must not claim authenticator opt-in");
  else if (!/HOLD/.test(res.body.accounts.note || "")) fail("health accounts.note must stay HOLD with mfa");
  else pass("health copy matches account doors");

  const healthJson = JSON.stringify(res.body);
  const grokTiers = ((((res.body.automation || {}).deskAi || (res.body.automation || {}).grok) || {}).rate || {}).tiers || "";
  if (Object.prototype.hasOwnProperty.call(res.body, "phase") || res.body.phase === "P1") {
    fail("health must not publish top-level phase / P1");
  } else if (/dispatch\.demo/.test(healthJson)) {
    fail("health JSON must not mention dispatch.demo");
  } else if (/\$250|T2 \$250/.test(grokTiers) || /T2 \$250/.test(healthJson)) {
    fail("health grok rate tiers must not publish $250 / T2 $250");
  } else pass("health JSON drops phase / dispatch.demo / T2 $250");

  const envJargon = /XAI_|AIA_GROK_|GROK_API_KEY|env present|BLOB_READ_WRITE_TOKEN/i;
  const deskAi = ((res.body.automation || {}).deskAi || (res.body.automation || {}).grok || {});
  const grokNote = deskAi.note || "";
  const grokOn = !!deskAi.on;
  if (envJargon.test(healthJson)) {
    fail("health JSON must not name env vars / env present");
  } else if (grokOn && grokNote !== "A Desk AI can draft.") {
    fail("health drafts-on note must be Desk AI voice, got " + JSON.stringify(grokNote));
  } else if (!grokOn && grokNote !== "A Desk AI can't draft on this phone yet.") {
    fail("health drafts-off note must be Desk AI voice, got " + JSON.stringify(grokNote));
  } else if ((res.body.automation || {}).grok && !(res.body.automation || {}).deskAi) {
    fail("health automation must publish deskAi, not grok");
  } else pass("health JSON drops env names; drafts note is Desk AI voice");

  const healthSrc = require("fs").readFileSync(path.join(__dirname, "..", "api/health.js"), "utf8");
  if (/phase:\s*["']P1["']/.test(healthSrc)) fail("api/health.js still hardcodes phase P1");
  else if (healthSrc.indexOf("dispatch.demo") >= 0) fail("api/health.js still mentions dispatch.demo");
  else if (/T2 \$250|\$250/.test(healthSrc)) fail("api/health.js still publishes $250 / T2 $250");
  else pass("health.js source drops phase P1 / dispatch.demo / T2 $250");
