#!/usr/bin/env node
"use strict";
// ship refuses with 409 while missingOf(job) is non-empty. Collect HOLD; nothing sent.
require("./_env-guard");

const os = require("os");
const path = require("path");

process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-ship-needs-" + process.pid + "-" + Date.now() + ".json");
delete global.__aia;
delete global.__aiaHydrate;

const lib = require("../api/_lib");
const jobsHandler = require("../api/jobs");
const { mem, hashPin, ensurePeople, ready } = lib;

let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }
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
async function call(headers, body) {
  const res = mockRes();
  await jobsHandler({ method: "POST", headers: headers, body: body, query: {} }, res);
  return res;
}

async function main() {
  await ready();
  const slug = "ship-needs-desk";
  const pin = "5137";
  const shop = { slug: slug, name: "Ship Needs", biz: slug, pin: hashPin(pin), createdAt: new Date().toISOString(), people: [] };
  ensurePeople(shop);
  mem.workspaces.unshift(shop);
  const owner = { "x-workspace": slug, "x-pin": pin };

  const cap = await call(owner, { action: "capture", title: "Missed call from Dana", notes: "call them back", from: "drop" });
  const job = cap.body && (cap.body.job || cap.body.lead);
  if (cap.statusCode !== 201 || !job || !job.id) { fail("capture must 201 with a job, got " + cap.statusCode); return; }
  pass("capture 201");

  const before = mem.jobs.find((j) => j.id === job.id);
  const dispatchBefore = before && before.dispatch;
  const statusBefore = before && before.status;

  const noNum = await call(owner, { action: "ship", id: job.id, confirm: true });
  if (noNum.statusCode !== 409) fail("ship with no number must 409, got " + noNum.statusCode);
  else pass("ship with no number 409");
  if (!noNum.body || noNum.body.ok !== false) fail("ship 409 must say ok:false");
  if (!noNum.body || noNum.body.error !== "Need a number first.") fail("ship 409 must say Need a number first., got " + JSON.stringify(noNum.body && noNum.body.error));
  else pass("ship 409 says Need a number first.");
  if (!noNum.body || !Array.isArray(noNum.body.missing) || noNum.body.missing.indexOf("phone") < 0) fail("ship 409 must list missing phone");
  else pass("ship 409 lists missing phone");
  const after = mem.jobs.find((j) => j.id === job.id);
  if (!after || after.status === "shipped" || after.status !== statusBefore) fail("refused ship must not change status, got " + (after && after.status));
  else pass("refused ship leaves status alone");
  if (after && after.dispatch !== dispatchBefore) fail("refused ship must not dispatch");
  else pass("refused ship does not dispatch");
  if (after && after.charged) fail("refused ship must not charge");

  const withNum = await call(owner, { action: "ship", id: job.id, confirm: true, phone: "555-0142" });
  if (withNum.statusCode === 409 && withNum.body && /^Need /.test(String(withNum.body.error || ""))) fail("ship with a number must not hit the need gate");
  else pass("ship with a number passes the need gate (" + withNum.statusCode + ")");
}

main().then(function () {
  if (failed) { console.error(failed + " failed"); process.exit(1); }
  console.log("check-ship-needs-number ok");
  process.exit(0);
}, function (e) { console.error("FAIL threw " + (e && e.stack || e)); process.exit(1); });
