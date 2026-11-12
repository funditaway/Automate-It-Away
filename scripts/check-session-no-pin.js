#!/usr/bin/env node
"use strict";
// After sign-in the page never needs the raw desk code: the session alone reads and
// captures, logout ends it, and a desk code never unlocks an account write.
require("./_env-guard");

const os = require("os");
const path = require("path");

process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-session-no-pin-" + process.pid + "-" + Date.now() + ".json");
delete global.__aia;
delete global.__aiaHydrate;

const lib = require("../api/_lib");
const accountHandler = require("../api/_account-http");
const jobsHandler = require("../api/jobs");

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
async function call(handler, method, headers, body) {
  const res = mockRes();
  await handler({ method: method, headers: headers || {}, body: body || {}, query: {} }, res);
  return res;
}
function expect(res, code, label) {
  if (res.statusCode !== code) fail(label + " must be " + code + ", got " + res.statusCode + " " + JSON.stringify(res.body && res.body.error || ""));
  else pass(label + " " + code);
}

async function main() {
  await lib.ready();
  const slug = "session-no-pin";
  const pin = "6612";
  const shop = { slug: slug, name: "Session No Pin", biz: slug, pin: lib.hashPin(pin), createdAt: new Date().toISOString(), people: [] };
  lib.ensurePeople(shop);
  lib.mem.workspaces.unshift(shop);

  const login = await call(accountHandler, "POST", { "x-workspace": slug }, { action: "login", slug: slug, pin: pin });
  expect(login, 200, "desk-code sign-in");
  const session = login.body && login.body.session;
  const token = session && session.token;
  if (!token) { fail("sign-in must return session.token"); return; }
  pass("sign-in returns session.token");
  const cookie = String(login.headers["Set-Cookie"] || "");
  if (!/^aia_session=/.test(cookie) || !/HttpOnly/.test(cookie)) fail("sign-in must set an HttpOnly aia_session cookie");
  else pass("sign-in sets HttpOnly aia_session");
  if (JSON.stringify(login.body).indexOf("\"" + pin + "\"") >= 0) fail("sign-in reply must not echo the desk code");
  else pass("sign-in reply does not echo the desk code");

  const sess = { "x-workspace": slug, "x-session": token };
  expect(await call(accountHandler, "GET", sess), 200, "account read with session only");
  expect(await call(accountHandler, "GET", { "x-workspace": slug, cookie: "aia_session=" + token }), 200, "account read with cookie only");
  expect(await call(jobsHandler, "GET", sess), 200, "Queue read with session only");
  expect(await call(jobsHandler, "POST", sess, { action: "capture", title: "Session only card", from: "drop" }), 201, "capture with session only");

  const withPin = await call(accountHandler, "POST", Object.assign({ "x-pin": pin }, sess), { action: "attach", slug: "other-desk" });
  expect(withPin, 403, "desk code plus session cannot attach");
  const pinOnly = await call(accountHandler, "POST", { "x-workspace": slug, "x-pin": pin }, { action: "attach", slug: "other-desk" });
  expect(pinOnly, 403, "desk code alone cannot attach");

  expect(await call(accountHandler, "POST", sess, { action: "logout" }), 200, "logout");
  expect(await call(accountHandler, "GET", sess), 401, "account read after logout");
}

main().then(function () {
  if (failed) { console.error(failed + " failed"); process.exit(1); }
  console.log("check-session-no-pin ok");
  process.exit(0);
}, function (e) { console.error("FAIL threw " + (e && e.stack || e)); process.exit(1); });
