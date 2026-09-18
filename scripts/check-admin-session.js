#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-admin-session-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

delete global.__aia;
delete global.__aiaHydrate;

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

const admin = fs.readFileSync(path.join(root, "admin.html"), "utf8");
if (/if \(tok\) h\["X-Session"\] = tok;\s*else if \(pin\)/.test(admin)) {
  fail("admin.html headers must still send the open-desk pin when a session token is present");
} else pass("admin.html headers keeps X-Pin with X-Session");
if (admin.indexOf('if (tok) h["X-Session"] = tok') < 0) {
  fail("admin.html headers must send leftover X-Session so email-session Account book still opens");
} else pass("admin.html headers sends leftover X-Session");
if (admin.indexOf('if (pin) h["X-Pin"] = pin') < 0) fail("admin.html headers must send X-Pin");
else pass("admin.html headers sends X-Pin");
if (admin.indexOf('if (wsEl.value && pinEl.value) load()') >= 0) {
  fail("admin.html Open admin still requires a leftover pin and skips email-session desks");
} else pass("admin.html Open admin does not require pin-only");
if (admin.indexOf("aia_session") < 0) {
  fail("admin.html must treat leftover email session as enough to Open admin");
} else pass("admin.html treats leftover email session as open");
if (admin.indexOf("if (wsEl.value && (pinEl.value || localStorage.getItem(\"aia_session\"))) load()") < 0) {
  fail("admin.html must load when leftover session is live");
} else pass("admin.html loads when leftover session is live");

const yesNo = fs.readFileSync(path.join(root, "ACCOUNT-YES-NO.md"), "utf8");
const packMd = fs.readFileSync(path.join(root, "PACK.md"), "utf8");
if (yesNo.indexOf("Account book leftover session after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Account book leftover session");
} else pass("ACCOUNT-YES-NO names Account book leftover session");
if (packMd.indexOf("Account book leftover session:") < 0) {
  fail("PACK.md must name Account book leftover session");
} else pass("PACK.md names Account book leftover session");

const lib = require("../api/_lib");
const adminHandler = require("../api/admin");
const { mem, hashPin, ensurePeople, ready } = lib;

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
function reqOf(method, headers, body, query) {
  return { method: method, headers: headers || {}, body: body || {}, query: query || {} };
}
async function call(handler, method, headers, body, query) {
  const res = mockRes();
  await handler(reqOf(method, headers, body, query), res);
  return res;
}

async function main() {
  await ready();
  const slug = "admin-book";
  const pin = "4821";
  const shop = {
    slug: slug,
    name: "Admin Book",
    biz: slug,
    pin: hashPin(pin),
    createdAt: new Date().toISOString(),
    people: [],
    rules: []
  };
  ensurePeople(shop);
  mem.workspaces.unshift(shop);

  const dead = await call(adminHandler, "GET", { "x-workspace": slug, "x-session": "deadbeefdeadbeefdeadbeefdeadbeef" });
  if (dead.statusCode !== 401 || !/Pin required/.test((dead.body && dead.body.error) || "")) {
    fail("leftover session without pin must 401 GET /api/admin " + dead.statusCode + " " + JSON.stringify(dead.body));
  } else pass("leftover session without pin stays 401 on GET /api/admin");

  const pinOnly = await call(adminHandler, "GET", { "x-workspace": slug, "x-pin": pin });
  if (pinOnly.statusCode !== 200 || !pinOnly.body || !pinOnly.body.ok || !pinOnly.body.you) {
    fail("desk code GET /api/admin must still open " + pinOnly.statusCode + " " + JSON.stringify(pinOnly.body));
  } else pass("desk code still opens Account book");

  const leftoverPin = await call(adminHandler, "GET", {
    "x-workspace": slug,
    "x-session": "deadbeefdeadbeefdeadbeefdeadbeef",
    "x-pin": pin
  });
  if (leftoverPin.statusCode !== 200 || !leftoverPin.body || !leftoverPin.body.ok) {
    fail("leftover session + matching pin must GET /api/admin " + leftoverPin.statusCode + " " + JSON.stringify(leftoverPin.body));
  } else pass("leftover session + pin GET opens Account book");

  const issued = lib.issueSession(shop.people[0], shop, null, { headers: { "x-workspace": slug } });
  if (!issued || !issued.token) fail("must issue leftover email-session token for Account book");
  else pass("issued leftover email-session token for Account book");
  const sessionOnly = { "x-workspace": slug, "x-session": issued.token };
  const leftoverGet = await call(adminHandler, "GET", sessionOnly);
  if (leftoverGet.statusCode !== 200 || !leftoverGet.body || !leftoverGet.body.ok || leftoverGet.body.you.role !== "owner") {
    fail("leftover email-session owner GET /api/admin should 200, got " + leftoverGet.statusCode + " " + JSON.stringify(leftoverGet.body));
  } else pass("leftover email-session owner opens Account book");
  if (!leftoverGet.body.audit) fail("leftover email-session owner must still see audit");
  else pass("leftover email-session owner sees audit");

  const leftoverInvite = await call(adminHandler, "POST", sessionOnly, {
    action: "invite",
    name: "Session helper",
    kind: "helper",
    role: "employee",
    pin: "7390"
  });
  if (leftoverInvite.statusCode !== 201 && leftoverInvite.statusCode !== 200) {
    fail("leftover email-session owner invite should 201, got " + leftoverInvite.statusCode + " " + JSON.stringify(leftoverInvite.body));
  } else pass("leftover email-session owner can invite");

  const closed = await call(adminHandler, "GET", { "x-workspace": slug });
  if (closed.statusCode !== 401) fail("GET /api/admin without pin or session must 401, got " + closed.statusCode);
  else pass("GET /api/admin without auth still 401");

  const helperSeat = {
    id: "p_admin_helper",
    name: "Admin helper",
    role: "employee",
    kind: "helper",
    status: "approved"
  };
  shop.people.push(helperSeat);
  const helperTok = lib.issueSession(helperSeat, shop, null, { headers: { "x-workspace": slug } });
  const helperGet = await call(adminHandler, "GET", { "x-workspace": slug, "x-session": helperTok.token });
  if (helperGet.statusCode !== 200 || !helperGet.body || helperGet.body.you.role === "owner") {
    fail("helper leftover session GET should stay helper, got " + helperGet.statusCode + " " + JSON.stringify(helperGet.body));
  } else pass("helper leftover session opens helper book");
  if (helperGet.body.audit) fail("helper leftover session must not see audit");
  else pass("helper leftover session cannot see audit");
  const helperInvite = await call(adminHandler, "POST", { "x-workspace": slug, "x-session": helperTok.token }, {
    action: "invite",
    name: "Helper invite",
    kind: "helper",
    role: "employee",
    pin: "8642"
  });
  if (helperInvite.statusCode !== 403) fail("helper leftover session invite must 403, got " + helperInvite.statusCode);
  else pass("helper leftover session cannot invite");

  if (failed) process.exit(1);
  console.log("check-admin-session: ok");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
