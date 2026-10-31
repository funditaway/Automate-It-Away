#!/usr/bin/env node
require("./_env-guard");
// Machine values that Probe's survivors flipped. Drives the real handlers
// with a stub response. Collect stays HOLD. No source grep is the proof.
//   GET /api/health?view=status  .wallet is emptyPublic (no seat)
//   POST /api/account action mfa on:false
//   POST /api/connections as a helper, and as the owner for Whatnot and eBay
//   GET /api/hook
//   the same status view's connections: eBay when nothing wrote, Whatnot down
const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-machine-values-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
process.env.AIA_TLD_PROBE = "0";
delete process.env.VERCEL_GIT_COMMIT_SHA;

delete global.__aia;
delete global.__aiaHydrate;
[
  "../api/_lib",
  "../api/_account",
  "../api/_account-http",
  "../api/_connect-wallet",
  "../api/auth",
  "../api/health",
  "../api/connections",
  "../api/hook"
].forEach(function (mod) {
  try { delete require.cache[require.resolve(mod)]; } catch (e) {}
});

const lib = require("../api/_lib");
const account = require("../api/_account-http");
const auth = require("../api/auth");
const health = require("../api/health");
const connections = require("../api/connections");
const hook = require("../api/hook");

const EMPTY_NOTE = "No wallet connected on this open desk. Connect MetaMask or WalletConnect on Account or Desk. AIA does not hold keys. Payments are off for now. Nothing is charged.";

let failed = 0;
let asserts = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); process.exitCode = 1; }
function pass(m) { console.log("ok   " + m); }
function eq(actual, expected, msg) {
  asserts += 1;
  if (actual === expected) pass(msg);
  else fail(msg + " — " + JSON.stringify(actual) + " !== " + JSON.stringify(expected));
}

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; }
  };
}

async function call(handler, method, headers, body, query, url) {
  const res = mockRes();
  await handler({
    method: method,
    headers: headers || {},
    body: body == null ? {} : body,
    query: query || {},
    url: url || ""
  }, res);
  return res;
}

function rowOf(list, provider) {
  return (list || []).find(function (c) { return c && c.provider === provider; }) || null;
}

async function main() {
  await lib.ready();

  const slug = "mv-desk";
  const ownerPin = "4821";
  const helperPin = "7390";
  const email = "owner@machine-values.test";
  const password = "good-pass1";

  const opened = await call(auth, "POST", { "x-workspace": slug }, {
    action: "open",
    slug: slug,
    biz: "Machine Desk",
    name: "Pat",
    pin: ownerPin
  }, {}, "/api/auth");
  eq(opened.statusCode, 201, "open desk");

  const pw = await call(account, "POST", { "x-workspace": slug, "x-pin": ownerPin }, {
    action: "password",
    email: email,
    password: password
  }, { via: "account" }, "/api/account");
  eq(pw.statusCode, 200, "first claim sets email and password");

  const login = await call(account, "POST", {}, {
    action: "login",
    email: email,
    password: password
  }, { via: "account" }, "/api/account");
  const token = login.body && login.body.session && login.body.session.token;
  eq(login.statusCode, 200, "email login");
  eq(typeof token, "string", "email login returns a session token");

  const mfa = await call(account, "POST", { "x-workspace": slug, "x-session": token }, {
    action: "mfa",
    on: false
  }, { via: "account" }, "/api/account");
  const mfaBody = mfa.body || {};
  eq(mfa.statusCode, 200, "mfa off replies 200");
  eq(mfaBody.ok, true, "mfa off ok === true");
  eq(mfaBody.hold, true, "mfa off hold === true");
  eq(mfaBody.mfaOn, false, "mfa off mfaOn === false");

  const shop = (lib.mem.workspaces || []).find(function (w) { return w && w.slug === slug; });
  if (!shop) fail("open desk did not leave a workspace");
  else {
    shop.people.push({
      id: "p_helper",
      name: "Lee",
      role: "helper",
      kind: "helper",
      status: "approved",
      pin: lib.hashPin(helperPin),
      createdAt: new Date().toISOString()
    });
  }

  const helper = await call(connections, "POST", { "x-workspace": slug, "x-pin": helperPin }, {
    provider: "ebay"
  }, {}, "/api/connections");
  eq(helper.statusCode, 403, "helper POST connections === 403");

  const owner = { "x-workspace": slug, "x-pin": ownerPin };
  const whatnotPost = await call(connections, "POST", owner, { provider: "whatnot" }, {}, "/api/connections");
  const whatnotPostBody = whatnotPost.body || {};
  eq(whatnotPost.statusCode, 409, "Whatnot connect === 409");
  eq(whatnotPostBody.status, "down", "Whatnot connect status === down");

  const ebayPost = await call(connections, "POST", owner, { provider: "ebay" }, {}, "/api/connections");
  eq(ebayPost.statusCode, 201, "owner connects unconfigured eBay");

  lib.mem.connections.unshift({
    id: "pipe_whatnot",
    workspace: slug,
    provider: "whatnot",
    label: "Whatnot",
    live: false,
    createdAt: new Date().toISOString()
  });

  const status = await call(health, "GET", { "x-workspace": slug }, {}, { view: "status" }, "/api/health?view=status");
  const statusBody = status.body || {};
  const wallet = statusBody.wallet || {};
  eq(status.statusCode, 200, "GET /api/health?view=status");
  eq(Object.prototype.hasOwnProperty.call(statusBody, "connections"), true, "status view lists connections");
  eq(wallet.collect, "hold", "wallet collect === hold");
  eq(wallet.mint, false, "wallet mint === false");
  eq(wallet.connected, false, "wallet connected === false");
  eq(wallet.note, EMPTY_NOTE, "wallet note is emptyPublic");

  const ebay = rowOf(statusBody.connections, "ebay");
  const whatnot = rowOf(statusBody.connections, "whatnot");
  eq(ebay != null, true, "status lists the eBay connection nothing wrote");
  eq(ebay ? ebay.status : undefined, "hold", "unconfigured connection status === hold");
  eq(whatnot != null, true, "status lists the Whatnot connection");
  eq(whatnot ? whatnot.status : undefined, "down", "Whatnot connection status === down");

  const hookGet = await call(hook, "GET", {}, {}, {}, "/api/hook");
  const hookBody = hookGet.body || {};
  eq(hookGet.statusCode, 200, "GET /api/hook");
  eq(hookBody.send, "hold", "hook GET send === hold");

  try { fs.unlinkSync(store); } catch (e) {}
  if (failed) {
    console.error("check-api-machine-values: " + asserts + " asserts, " + failed + " failed");
    process.exit(1);
  }
  console.log("check-api-machine-values: " + asserts + " asserts, 0 failed");
}

main().catch(function (err) {
  try { fs.unlinkSync(store); } catch (e) {}
  fail(err && err.stack || String(err));
  console.error("check-api-machine-values: " + asserts + " asserts, " + failed + " failed");
  process.exit(1);
});
