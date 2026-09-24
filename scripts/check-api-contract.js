const os = require("os");
const path = require("path");
const fs = require("fs");
const store = path.join(os.tmpdir(), "aia-api-contract-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
process.env.AIA_TLD_PROBE = "0";
delete global.__aia;
delete global.__aiaHydrate;
["../api/_lib", "../api/health", "../api/rules", "../api/connections"].forEach((p) => {
 try { delete require.cache[require.resolve(p)]; } catch (e) {}
});
const lib = require("../api/_lib");
const health = require("../api/health");
const status = health.status;
const rules = require("../api/rules");
const connections = require("../api/connections");
function fail(msg) { console.error("FAIL " + msg); process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }
function mockRes() {
 return {
  headers: {}, statusCode: 200, body: null,
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
  send(b) { this.body = b; return this; },
  end() { return this; }
 };
}
const envJargon = /XAI_|AIA_GROK_|GROK_API_KEY|env present|BLOB_READ_WRITE_TOKEN/i;
const strangerJargon = /\bblob\b|oidc|Decentraweb|decentraweb|SuperGrok|console\.x\.ai|api\.x\.ai|docs\.x\.ai|storeId|BLOB_|approve-registration|lockDomain/i;
async function main() {
 [
  "issueSession", "findSession", "listSessions", "revokeSession", "sessionCookie",
  "clearSessionCookie", "parseCookies", "sessionFromReq", "isLocked", "noteFail", "noteOk", "sessionTokenOf", "applyStore"
 ].forEach((k) => { if (typeof lib[k] !== "function") fail("_lib missing " + k); });
 if (!process.exitCode) pass("lib");
 const cookies = lib.parseCookies({ headers: { cookie: "a=1; aia_session=abc123%20z" } });
 if (cookies.aia_session !== "abc123 z") fail("parseCookies"); else pass("cookies");
 const setCookie = lib.sessionCookie("tok123");
 const clearCookie = lib.clearSessionCookie();
 if (!/aia_session=tok123/.test(setCookie) || !/HttpOnly/.test(setCookie) || !/Max-Age=1209600/.test(setCookie)) fail("sessionCookie");
 else if (!/aia_session=;/.test(clearCookie) || !/Max-Age=0/.test(clearCookie)) fail("clearSessionCookie");
 else pass("sess");
 const res = mockRes();
 await health({ method: "GET", headers: {}, query: {} }, res);
 if (res.statusCode !== 200 || !res.body || !res.body.accounts) fail("health"); else pass("health");
 if (res.headers["Access-Control-Allow-Headers"] !== "Content-Type, Authorization, X-Workspace, X-Pin, X-Session") fail("CORS"); else pass("CORS");
 if (res.body.accounts.login !== "desk name + desk code, or email + password") fail("accounts.login");
 else if (!/^HOLD/.test(res.body.accounts.mfa)) fail("accounts.mfa");
 else if (/opt-in/i.test(res.body.accounts.note || "")) fail("accounts.note opt-in");
 else if (!/HOLD/.test(res.body.accounts.note || "")) fail("accounts.note HOLD");
 else pass("acct");
 const healthJson = JSON.stringify(res.body);
 const deskAi = ((res.body.automation || {}).deskAi || (res.body.automation || {}).grok || {});
 const grokTiers = ((deskAi.rate || {}).tiers) || "";
 if (Object.prototype.hasOwnProperty.call(res.body, "phase") || res.body.phase === "P1") fail("phase");
 else if (/dispatch\.demo/.test(healthJson)) fail("dispatch.demo");
 else if (/\$250|T2 \$250/.test(grokTiers) || /T2 \$250/.test(healthJson)) fail("T2 $250");
 else pass("honest");
 const grokNote = deskAi.note || "";
 const grokOn = !!deskAi.on;
 if (envJargon.test(healthJson)) fail("env jargon");
 else if (grokOn && grokNote !== "A Desk AI can draft.") fail("deskAi on note " + JSON.stringify(grokNote));
 else if (!grokOn && grokNote !== "A Desk AI can't draft on this phone yet.") fail("deskAi off note " + JSON.stringify(grokNote));
 else if ((res.body.automation || {}).grok && !(res.body.automation || {}).deskAi) fail("need deskAi not grok");
 else pass("deskAi");
 if (strangerJargon.test(healthJson) || (res.body.store && res.body.store.blob)) fail("stranger dump");
 else pass("no jargon");
 const healthSrc = fs.readFileSync(path.join(__dirname, "..", "api/health.js"), "utf8");
 if (/phase:\s*["']P1["']/.test(healthSrc) || healthSrc.indexOf("dispatch.demo") >= 0 || /T2 \$250|\$250/.test(healthSrc)) fail("health.js honesty");
 else pass("h.js");
 if (healthSrc.indexOf("Set XAI_API_KEY") >= 0 || healthSrc.indexOf("Do not set AIA_GROK_MODEL") >= 0 || healthSrc.indexOf("No BLOB_READ_WRITE_TOKEN") >= 0) fail("health.js env notes");
 else pass("h.env");
 if (!/deskAi/.test(healthSrc)) fail("health.js deskAi"); else pass("h.desk");
 const libSrc = fs.readFileSync(path.join(__dirname, "..", "api/_lib.js"), "utf8");
 if (libSrc.indexOf("env present") >= 0 || libSrc.indexOf("connect when keys are set") >= 0) fail("catalog env"); else pass("cat");
 const statusHtml = fs.readFileSync(path.join(__dirname, "..", "status.html"), "utf8");
 if (/Pin workspace/.test(statusHtml) || !/id="accounts"/.test(statusHtml) || !/accounts\.login/.test(statusHtml) || /authenticator is opt-in/i.test(statusHtml)) fail("status accounts");
 else pass("st.acct");
 if (/Orange is P1/.test(statusHtml) || !/Orange is HOLD/.test(statusHtml)) fail("status orange");
 else if (!/id="grok"/.test(statusHtml) || !/automation\.(deskAi|grok)/.test(statusHtml)) fail("status deskAi paint");
 else if (/API key not set/.test(statusHtml) || /Drafts are off — no XAI_API_KEY/.test(statusHtml) || /no XAI_API_KEY on this box/.test(statusHtml)) fail("status XAI");
 else if (/id="raw"|deskPublicDump|JSON\.stringify/.test(statusHtml)) fail("status raw dump");
 else if (/\bblob\b|Decentraweb|BLOB_|XAI_API_KEY|AIA_GROK_|GROK_API_KEY|env present/i.test(statusHtml)) fail("status stranger");
 else if (!/A Desk AI can't draft on this phone yet/.test(statusHtml)) fail("status drafts-off voice");
 else if (!/Name register stays HOLD/.test(statusHtml) || !/Saved on this desk/.test(statusHtml) || !/Photos and files are saved/.test(statusHtml)) fail("status desk voice");
 else pass("st.html");
 const st = mockRes();
 await status({ method: "GET", headers: {}, query: {} }, st);
 if (st.statusCode !== 200 || !st.body || st.body.ok !== true) fail("status endpoint"); else pass("st");
 if (st.body.workspace === "demo" || st.body.label === "demo") fail("status demo"); else pass("st.demo");
 if (st.body.status !== "hold" || st.body.answered !== false) fail("status hold"); else pass("st.hold");
 const statusJson = JSON.stringify(st.body);
 if (/dispatch\.demo/.test(statusJson) || envJargon.test(statusJson)) fail("status jargon");
 else if ((st.body.pipes || []).some((p) => /env present|XAI_|AIA_GROK_/i.test(p.note || ""))) fail("status pipe notes");
 else pass("st.clean");
 const statusTldFace = JSON.stringify(st.body.aiaTld || {});
 if (/decentraweb|approveUrl|registerUrl|lockDomain|oidc|\bblob\b/i.test(statusTldFace)) fail("status aiaTld dump");
 else pass("st.tld");
 if (!st.body.aiaTld || st.body.aiaTld.owned || st.body.aiaTld.ownedByConnected || st.body.aiaTld.mint || st.body.aiaTld.charged || st.body.aiaTld.collect !== "hold") fail("status aiaTld honesty");
 else pass("st.tldH");
 const healthPipes = (res.body.pipes || []).map((p) => p.id + ":" + p.status + ":" + p.live).join(",");
 const statusPipes = (st.body.pipes || []).map((p) => p.id + ":" + p.status + ":" + p.live).join(",");
 if (!healthPipes || healthPipes !== statusPipes) fail("pipes match"); else pass("pipes");
 const webhook = (st.body.pipes || []).find((p) => p.id === "webhook");
 const whatnot = (st.body.pipes || []).find((p) => p.id === "whatnot");
 const held = (st.body.pipes || []).filter((p) => ["square", "ebay", "calendar", "consign", "sms"].indexOf(p.id) >= 0);
 if (!webhook || webhook.status !== "live" || !webhook.live) fail("webhook");
 else if (!whatnot || whatnot.status !== "down" || whatnot.live) fail("whatnot");
 else if (held.some((p) => p.status !== "hold" || p.live)) fail("held pipes");
 else pass("catalog");
 lib.mem.jobs.push({ id: "job_status_writeback", workspace: "probe-desk", dispatch: { provider: "webhook", inbound: true, demo: false } });
 const live = mockRes();
 await status({ method: "GET", headers: { "x-workspace": "probe-desk" }, query: {} }, live);
 if (live.body.status !== "live" || live.body.workspace !== "probe-desk" || live.body.answered !== true) fail("writeback");
 else pass("wb");
 lib.mem.jobs = (lib.mem.jobs || []).filter((j) => j && j.id !== "job_status_writeback");
 const hadKey = process.env.XAI_API_KEY;
 process.env.XAI_API_KEY = "probe-drafts-on";
 const onRes = mockRes();
 await health({ method: "GET", headers: {}, query: {} }, onRes);
 const onDesk = (onRes.body.automation && (onRes.body.automation.deskAi || onRes.body.automation.grok)) || {};
 const onJson = JSON.stringify(onRes.body);
 if (!onRes.body.automation || !onDesk.on) fail("drafts on");
 else if ((onDesk.note || "") !== "A Desk AI can draft.") fail("drafts on note");
 else if (envJargon.test(onJson) || strangerJargon.test(onJson) || (onRes.body.store && onRes.body.store.blob)) fail("drafts on dump");
 else if (onRes.body.automation.grok && !onRes.body.automation.deskAi) fail("drafts on deskAi");
 else pass("drafts");
 if (hadKey == null) delete process.env.XAI_API_KEY; else process.env.XAI_API_KEY = hadKey;
 const rulesRes = mockRes();
 await rules({ method: "GET", headers: {}, query: {} }, rulesRes);
 if (rulesRes.statusCode !== 200 || !Array.isArray(rulesRes.body.rules) || rulesRes.body.rules.length) fail("rules empty");
 else if (!Array.isArray(rulesRes.body.starters) || rulesRes.body.starters.length) fail("starters empty");
 else if (rulesRes.body.workspace === "demo") fail("rules demo");
 else pass("rules");
 const conn = mockRes();
 await connections({ method: "GET", headers: {}, query: {} }, conn);
 if (conn.statusCode !== 200) fail("connections");
 else if (conn.body.workspace === "demo") fail("connections demo");
 else pass("conn");
 if (process.exitCode) { console.error("check-api-contract failed"); process.exit(1); }
 console.log("check-api-contract passed");
}
main().catch((err) => {
 fail(err && err.stack || String(err));
 console.error("check-api-contract failed");
 process.exit(1);
});
