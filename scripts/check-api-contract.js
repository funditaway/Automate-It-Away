const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-api-contract-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

delete global.__aia;
delete global.__aiaHydrate;
delete require.cache[require.resolve("../api/_lib")];
delete require.cache[require.resolve("../api/health")];

const lib = require("../api/_lib");
const health = require("../api/health");

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
