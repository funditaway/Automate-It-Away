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
  if (healthSrc.indexOf("Set XAI_API_KEY") >= 0 || healthSrc.indexOf("Do not set AIA_GROK_MODEL") >= 0 || healthSrc.indexOf("No BLOB_READ_WRITE_TOKEN") >= 0) {
    fail("api/health.js still publishes env-name notes");
  } else pass("health.js source drops env-name notes");
  const libSrc = require("fs").readFileSync(path.join(__dirname, "..", "api/_lib.js"), "utf8");
  if (libSrc.indexOf("env present") >= 0 || libSrc.indexOf("connect when keys are set") >= 0) {
    fail("catalog still publishes env present / keys-are-set notes");
  } else pass("catalog notes drop env present");

  const statusHtml = require("fs").readFileSync(path.join(__dirname, "..", "status.html"), "utf8");
  if (/Pin workspace/.test(statusHtml)) fail("status.html must not hardcode pin-only accounts");
  else if (!/id="accounts"/.test(statusHtml) || !/accounts\.login/.test(statusHtml)) fail("status.html must paint World user accounts from health.accounts.login");
  else if (/authenticator is opt-in/i.test(statusHtml)) fail("status.html must not claim authenticator opt-in");
  else pass("status.html paints accounts from health");
  if (/Orange is P1/.test(statusHtml)) fail("status.html must not call orange P1");
  else if (!/Orange is HOLD/.test(statusHtml)) fail("status.html must say Orange is HOLD — wait");
  else if (!/id="grok"/.test(statusHtml) || !/automation\.(deskAi|grok)/.test(statusHtml)) fail("status.html must paint Desk AI drafts from health.automation.deskAi");
  else if (/API key not set/.test(statusHtml)) fail("status.html must not hardcode Grok API key not set");
  else if (/Drafts are off — no XAI_API_KEY/.test(statusHtml) || /no XAI_API_KEY on this box/.test(statusHtml)) {
    fail("status.html must not fall back to XAI_API_KEY on this box");
  } else if (/id="raw"|deskPublicDump|JSON\.stringify/.test(statusHtml)) {
    fail("status.html must not dump raw health JSON on the phone");
  } else if (/\bblob\b|Decentraweb|BLOB_|XAI_API_KEY|AIA_GROK_|GROK_API_KEY|env present/i.test(statusHtml)) {
    fail("status.html must not name blob / Decentraweb / env keys on the phone");
  } else if (!/A Desk AI can't draft on this phone yet/.test(statusHtml)) {
    fail("status.html drafts-off must use Desk AI voice");
  } else if (!/Name register stays HOLD/.test(statusHtml) || !/Saved on this desk/.test(statusHtml) || !/Photos and files are saved/.test(statusHtml)) {
    fail("status.html must keep Saved work / Photos and files / Name register in Desk AI voice");
  } else pass("status.html paints Grok from health; orange is HOLD; no raw dump");

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
  const statusJson = JSON.stringify(st.body);
  if (/dispatch\.demo/.test(statusJson)) fail("status JSON must not mention dispatch.demo");
  else pass("status JSON drops dispatch.demo");
  if (envJargon.test(statusJson)) fail("status JSON must not name env vars / env present");
  else if ((st.body.pipes || []).some((p) => /env present|XAI_|AIA_GROK_/i.test(p.note || ""))) {
    fail("status pipe notes must not name env / keys");
  } else pass("status JSON drops env names");
  const statusTldFace = JSON.stringify(st.body.aiaTld || {});
  if (/decentraweb|approveUrl|registerUrl|lockDomain|oidc|\bblob\b/i.test(statusTldFace)) {
    fail("status aiaTld must not dump Decentraweb URLs or probe jargon");
  } else pass("status aiaTld stays plain HOLD");
  if (!st.body.aiaTld || st.body.aiaTld.owned || st.body.aiaTld.ownedByConnected || st.body.aiaTld.mint || st.body.aiaTld.charged || st.body.aiaTld.collect !== "hold") {
    fail("status aiaTld must stay honest HOLD and not invent owned " + JSON.stringify(st.body.aiaTld));
  } else pass("status aiaTld is honest HOLD");
  if (res.body.aiaTld && (res.body.aiaTld.mint || res.body.aiaTld.charged || res.body.aiaTld.collect !== "hold")) {
    fail("health aiaTld block invented mint or Collect");
  } else pass("health aiaTld block is honest");

  const healthPipes = (res.body.pipes || []).map((p) => p.id + ":" + p.status + ":" + p.live).join(",");
