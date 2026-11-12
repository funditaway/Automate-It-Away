#!/usr/bin/env node
"use strict";
// Saved desk rows on /api/desks list, history and cap each open with their own proof: the row's own
// token, else its own desk code. A row's token never borrows this request's session, and the current
// desk's code-login session never opens another desk.
require("./_env-guard");

const os = require("os");
const path = require("path");

process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-desk-rows-" + process.pid + "-" + Date.now() + ".json");
delete global.__aia;
delete global.__aiaHydrate;

const lib = require("../api/_lib");
const auth = require("../api/auth");
const desks = require("../api/_desks-http");

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
function shop(slug, pin) {
  const row = { slug: slug, name: slug, biz: slug, pin: lib.hashPin(pin), createdAt: new Date().toISOString(), people: [] };
  lib.ensurePeople(row);
  lib.mem.workspaces.unshift(row);
  return row;
}
async function login(slug, pin) {
  const r = await call(auth, "POST", { "x-workspace": slug }, { action: "login", workspace: slug, pin: pin });
  const tok = r.body && r.body.session && r.body.session.token;
  if (r.statusCode !== 200 || !tok) { fail(slug + " code login must return a token, got " + r.statusCode); return ""; }
  return tok;
}
function rowOf(res, slug) {
  return ((res.body && res.body.desks) || []).find((d) => d && d.slug === slug) || null;
}
async function expectRow(action, reqHeaders, item, want, label) {
  const res = await call(desks, "POST", reqHeaders, { action: action, desks: [item] });
  const row = rowOf(res, item.slug);
  const got = !!(row && row.ok);
  if (got !== want) fail(action + ": " + label + " must be " + (want ? "open" : "refused") + ", got " + JSON.stringify(row));
  else pass(action + ": " + label + (want ? " opens" : " refused"));
  const raw = JSON.stringify(res.body || {});
  if (item.token && raw.indexOf(item.token) >= 0) fail(action + ": reply must not echo the row token");
}

async function main() {
  await lib.ready();
  shop("rows-a", "4411");
  shop("rows-b", "5522");
  const tokA = await login("rows-a", "4411");
  const tokB = await login("rows-b", "5522");
  if (!tokA || !tokB) return;
  const asA = { "x-workspace": "rows-a", "x-session": tokA };
  const asB = { "x-workspace": "rows-b", "x-session": tokB };
  for (const action of ["list", "history", "cap"]) {
    await expectRow(action, asA, { slug: "rows-b", token: tokB }, true, "other desk by its own token under this desk's session");
    await expectRow(action, {}, { slug: "rows-b", token: tokB }, true, "other desk by its own token with no request session");
    await expectRow(action, asB, { slug: "rows-b", token: "not-a-real-token" }, false, "bad row token never borrows the request session");
    await expectRow(action, { "x-workspace": "rows-b", cookie: "aia_session=" + tokB }, { slug: "rows-b", token: "nope" }, false, "bad row token never borrows the cookie");
    await expectRow(action, asA, { slug: "rows-b", token: tokA }, false, "another desk's token");
    await expectRow(action, asA, { slug: "rows-b" }, false, "this desk's code session on another desk");
    await expectRow(action, asA, { slug: "rows-b", pin: "5522" }, true, "other desk by its own code");
    await expectRow(action, asA, { slug: "rows-b", pin: "9999" }, false, "other desk by a wrong code");
    await expectRow(action, asA, { slug: "rows-a" }, true, "this desk by this request's session");
  }
}

main().then(function () {
  if (failed) { console.error(failed + " failed"); process.exit(1); }
  console.log("check-desk-rows-own-token ok");
  process.exit(0);
}, function (e) { console.error("FAIL threw " + (e && e.stack || e)); process.exit(1); });
