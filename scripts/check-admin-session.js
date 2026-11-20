#!/usr/bin/env node
"use strict";
require("./_env-guard");

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

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


function pinOpenTag(html) {
  const m = html.match(/<input\b[^>]*id="pin"[^>]*>/i);
  return m ? m[0] : "";
}
function invitePinTag(html) {
  const m = html.match(/<input\b[^>]*id="p"[^>]*>/i);
  return m ? m[0] : "";
}
function adminFaults(html) {
  const bad = [];
  if (!/\btype="password"/.test(pinOpenTag(html))) bad.push("field type=text");
  if (html.indexOf('localStorage.setItem("aia_pin"') >= 0) bad.push("pin stored");
  const hdrAt = html.indexOf("function headers()");
  const hdrEnd = html.indexOf("async function api(", hdrAt);
  const hdr = hdrAt >= 0 && hdrEnd > hdrAt ? html.slice(hdrAt, hdrEnd) : html;
  if (hdr.indexOf('localStorage.getItem("aia_pin")') >= 0) bad.push("leftover sent");
  if (html.indexOf('pinEl.value = localStorage.getItem("aia_pin")') >= 0) bad.push("field prefilled");
  return bad;
}
function applyAdminMutant(html, kind) {
  if (kind === "field type=text") {
    return html.replace(
      'id="pin" placeholder="Desk code" type="password"',
      'id="pin" placeholder="Desk code" type="text"'
    );
  }
  if (kind === "pin stored") {
    return html.replace(
      'if (wsEl.value) localStorage.setItem("aia_ws", wsEl.value);',
      'if (wsEl.value) localStorage.setItem("aia_ws", wsEl.value);\n      if (pinEl.value) localStorage.setItem("aia_pin", pinEl.value);'
    );
  }
  if (kind === "leftover sent") {
    return html.replace(
      "const pin = pinEl.value;",
      'const pin = pinEl.value || localStorage.getItem("aia_pin");'
    );
  }
  if (kind === "field prefilled") {
    return html.replace(
      'if (localStorage.getItem("aia_ws")) wsEl.value = localStorage.getItem("aia_ws");\n    if (wsEl.value && (pinEl.value || localStorage.getItem("aia_session"))) load();',
      'if (localStorage.getItem("aia_ws")) wsEl.value = localStorage.getItem("aia_ws");\n    if (localStorage.getItem("aia_pin")) pinEl.value = localStorage.getItem("aia_pin");\n    if (wsEl.value && (pinEl.value || localStorage.getItem("aia_session"))) load();'
    );
  }
  return html;
}

const liveFaults = adminFaults(admin);
if (liveFaults.length) fail("admin.html leftover desk code faults: " + liveFaults.join("; "));
else pass("admin.html keeps a leftover desk code out of storage and off boot GETs");
if (!/\btype="password"/.test(pinOpenTag(admin)) || !/\bautocomplete="current-password"/.test(pinOpenTag(admin))) {
  fail("admin.html Open-admin desk code field must be type=password autocomplete=current-password");
} else pass("admin.html Open-admin desk code field is masked");
if (!/\btype="password"/.test(invitePinTag(admin)) || !/\bautocomplete="new-password"/.test(invitePinTag(admin))) {
  fail("admin.html invite pin field must be type=password autocomplete=new-password");
} else pass("admin.html invite pin field is masked");

["field type=text", "pin stored", "leftover sent", "field prefilled"].forEach(function (kind) {
  const faults = adminFaults(applyAdminMutant(admin, kind));
  if (faults.indexOf(kind) < 0) fail("admin leftover-pin mutant survived: " + kind);
  else pass("admin leftover-pin mutant caught: " + kind);
});

function memStore(seed) {
  const m = Object.assign({}, seed || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? String(m[k]) : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    _raw: m
  };
}
function makeEl(id) {
  return {
    id: id,
    tagName: id === "people" || id === "rules" || id === "tickets" || id === "audit" || id === "money" || id === "invite-box" ? "DIV" : "INPUT",
    value: "",
    textContent: "",
    innerHTML: "",
    hidden: false,
    style: {},
    setAttribute: function () {},
    getAttribute: function () { return null; },
    addEventListener: function () {}
  };
}
function headerPin(headers) {
  if (!headers) return "";
  const keys = Object.keys(headers);
  for (let i = 0; i < keys.length; i++) {
    if (String(keys[i]).toLowerCase() === "x-pin") return String(headers[keys[i]] || "");
  }
  return "";
}
function extractInline(html) {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const parts = [];
  let m;
  while ((m = re.exec(html))) {
    if (/\bsrc\s*=/.test(m[1] || "")) continue;
    parts.push(m[2]);
  }
  return parts.join("\n");
}
function bootAdmin(html, seed, opts) {
  const store = memStore(seed);
  const fetches = [];
  const els = {};
  function el(id) {
    if (!els[id]) els[id] = makeEl(id);
    return els[id];
  }
  ["ws", "pin", "banner", "you", "c-wait", "c-held", "c-ship", "c-kill", "people", "invite-box", "rules", "tickets", "audit", "money", "n", "e", "p", "r", "inv"].forEach(el);
  if (opts && opts.pinValue != null) el("pin").value = opts.pinValue;
  if (opts && opts.wsValue != null) el("ws").value = opts.wsValue;
  const ctx = {
    localStorage: store,
    document: { getElementById: function (id) { return el(id); } },
    fetch: function (url, init) {
      fetches.push({ url: String(url), headers: (init && init.headers) || {}, body: init && init.body, method: (init && init.method) || "GET" });
      return Promise.resolve({
        status: 200,
        json: function () {
          return Promise.resolve({
            ok: true,
            you: { name: "Owner", role: "owner" },
            counts: { waiting: 0, held: 0, shipped: 0, killed: 0 },
            people: [],
            rules: [],
            tickets: [],
            audit: [],
            money: []
          });
        }
      });
    },
    console: console
  };
  ctx.window = ctx;
  vm.runInNewContext(extractInline(html), ctx, { timeout: 2000 });
  return Promise.resolve().then(function () { return Promise.resolve(); }).then(function () {
    return { store: store, fetches: fetches, els: els, ctx: ctx };
  });
}


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
  const leftoverBoot = await bootAdmin(admin, { aia_ws: "admin-book", aia_session: "sess-live", aia_pin: "6612" });
  const leftoverGets = leftoverBoot.fetches.filter(function (f) { return String(f.url).indexOf("/api/admin") >= 0; });
  if (!leftoverGets.length) fail("admin boot with leftover session must still GET /api/admin");
  else pass("admin boot with leftover session still GETs /api/admin");
  if (leftoverGets.some(function (f) { return headerPin(f.headers); })) {
    fail("admin boot GET must not send a leftover desk code as X-Pin");
  } else pass("admin boot GET does not send a leftover desk code");
  if (leftoverBoot.els.pin.value) fail("admin must not prefill the desk code field from leftover storage");
  else pass("admin does not prefill the desk code field from leftover storage");

  const typed = await bootAdmin(admin, { aia_ws: "admin-book", aia_session: "sess-live" }, { pinValue: "4821" });
  const typedGets = typed.fetches.filter(function (f) { return String(f.url).indexOf("/api/admin") >= 0; });
  if (!typedGets.length || typedGets.some(function (f) { return headerPin(f.headers) !== "4821"; })) {
    fail("admin must still send a typed desk code as X-Pin with a leftover session");
  } else pass("admin still sends a typed desk code with a leftover session");
  if (typed.store.getItem("aia_pin")) fail("admin Open must not store a typed desk code");
  else pass("admin Open does not store a typed desk code");

  const typedOnly = await bootAdmin(admin, { aia_ws: "admin-book" }, { pinValue: "4821" });
  const pinGets = typedOnly.fetches.filter(function (f) { return String(f.url).indexOf("/api/admin") >= 0; });
  if (!pinGets.length || pinGets.some(function (f) { return headerPin(f.headers) !== "4821"; })) {
    fail("admin Open with a typed desk code must still GET /api/admin with X-Pin");
  } else pass("admin Open with a typed desk code still works");
  if (typedOnly.store.getItem("aia_pin")) fail("admin Open with a typed desk code must not write aia_pin");
  else pass("admin Open with a typed desk code does not write aia_pin");

  const leakMutant = await bootAdmin(applyAdminMutant(admin, "leftover sent"), { aia_ws: "admin-book", aia_session: "sess-live", aia_pin: "6612" });
  if (!leakMutant.fetches.some(function (f) { return headerPin(f.headers) === "6612"; })) {
    fail("leftover sent mutant must send the stored desk code on boot GET");
  } else pass("leftover sent mutant still caught in the boot GET");

  const storeMutant = await bootAdmin(applyAdminMutant(admin, "pin stored"), { aia_ws: "admin-book" }, { pinValue: "4821" });
  if (storeMutant.store.getItem("aia_pin") !== "4821") fail("pin stored mutant must write aia_pin");
  else pass("pin stored mutant still caught on Open");

  const prefillMutant = await bootAdmin(applyAdminMutant(admin, "field prefilled"), { aia_ws: "admin-book", aia_session: "sess-live", aia_pin: "6612" });
  if (prefillMutant.els.pin.value !== "6612") fail("field prefilled mutant must fill the desk code field");
  else pass("field prefilled mutant still caught on boot");

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
