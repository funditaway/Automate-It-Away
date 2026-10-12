#!/usr/bin/env node
// GET /api/health publishes the deployed commit.
// VERCEL_GIT_COMMIT_SHA set to a 40-char sha → rev is that sha, revShort is
// the first 7. Unset → both null. No other health key changes.
// /api/status is a separate builder and stays unchanged.
// Read-only. No charge. No store change. Collect stays HOLD.
const os = require("os");
const path = require("path");
const fs = require("fs");

const store = path.join(os.tmpdir(), "aia-health-rev-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
process.env.AIA_TLD_PROBE = "0";
delete process.env.VERCEL_GIT_COMMIT_SHA;

delete global.__aia;
delete global.__aiaHydrate;
["../api/_lib", "../api/health"].forEach((p) => {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
});

const health = require("../api/health");
const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4";

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
function withoutRev(body) {
  const copy = JSON.parse(JSON.stringify(body));
  delete copy.rev;
  delete copy.revShort;
  return copy;
}
function diffKeys(a, b, prefix, out) {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  const aObj = a && typeof a === "object";
  const bObj = b && typeof b === "object";
  if (!aObj || !bObj || Array.isArray(a) || Array.isArray(b)) {
    out.push(prefix + " " + JSON.stringify(a) + " -> " + JSON.stringify(b));
    return;
  }
  const keys = {};
  Object.keys(a).forEach((k) => { keys[k] = true; });
  Object.keys(b).forEach((k) => { keys[k] = true; });
  Object.keys(keys).forEach((k) => {
    diffKeys(a[k], b[k], prefix ? prefix + "." + k : k, out);
  });
}
async function call(url, query) {
  const res = mockRes();
  await health({ method: "GET", headers: {}, query: query || {}, url: url }, res);
  return res;
}

async function main() {
  const pkg = fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8");
  if (pkg.indexOf("check-health-rev.js") < 0) fail("package.json must run check-health-rev");
  else pass("package.json runs check-health-rev");
  if (SHA.length !== 40) fail("fixture sha length");

  delete process.env.VERCEL_GIT_COMMIT_SHA;
  await call("/api/health");
  const bare = await call("/api/health");
  if (bare.statusCode !== 200 || !bare.body) fail("health unset status");
  else if (bare.body.rev !== null || bare.body.revShort !== null) {
    fail("unset rev " + JSON.stringify({ rev: bare.body.rev, revShort: bare.body.revShort }));
  } else pass("unset rev null");

  process.env.VERCEL_GIT_COMMIT_SHA = SHA;
  const stamped = await call("/api/health");
  if (!stamped.body || stamped.statusCode !== 200) fail("health sha status");
  else if (stamped.body.rev !== SHA) fail("rev " + JSON.stringify(stamped.body.rev));
  else if (stamped.body.revShort !== SHA.slice(0, 7)) fail("revShort " + JSON.stringify(stamped.body.revShort));
  else pass("rev set");

  const changes = [];
  diffKeys(withoutRev(bare.body), withoutRev(stamped.body), "", changes);
  if (changes.length) fail("other health keys changed: " + changes.slice(0, 8).join("; "));
  else pass("other health keys unchanged");

  const hold = stamped.body || {};
  const tld = hold.aiaTld || {};
  const wallet = hold.wallet || {};
  const accounts = hold.accounts || {};
  const collect = (hold.automation || {}).collect || "";
  if (wallet.collect !== "hold" || tld.collect !== "hold") fail("collect hold");
  else if (String(tld.note || "").indexOf("Collect stays HOLD") < 0) fail("tld Collect HOLD");
  else if (accounts.charged !== false) fail("charged");
  else if (!/^HOLD/.test(accounts.mfa || "")) fail("mfa HOLD");
  else if (collect.indexOf("hold") < 0 && collect.indexOf("HOLD") < 0) fail("automation collect");
  else pass("Collect HOLD");

  delete process.env.VERCEL_GIT_COMMIT_SHA;
  const statusBare = await call("/api/status", { view: "status" });
  process.env.VERCEL_GIT_COMMIT_SHA = SHA;
  const statusSet = await call("/api/health?view=status", { view: "status" });
  if (!statusBare.body || !statusSet.body) fail("status body");
  else if (JSON.stringify(statusBare.body) !== JSON.stringify(statusSet.body)) fail("status changed with commit env");
  else if (Object.prototype.hasOwnProperty.call(statusSet.body, "rev") || Object.prototype.hasOwnProperty.call(statusSet.body, "revShort")) fail("status gained rev");
  else pass("status unchanged");

  delete process.env.VERCEL_GIT_COMMIT_SHA;
  try { fs.unlinkSync(store); } catch (e) {}
  if (process.exitCode) {
    console.error("check-health-rev failed");
    process.exit(1);
  }
  console.log("check-health-rev passed");
}

main().catch((err) => {
  fail(err && err.stack || String(err));
  console.error("check-health-rev failed");
  process.exit(1);
});
