#!/usr/bin/env node
"use strict";
require("./_env-guard");

const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-pack-rules-cap-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
delete global.__aia;
delete global.__aiaHydrate;

const root = path.join(__dirname, "..");
const lib = require("../api/_lib");
const packHandler = require("../api/_packs");
const { mem, hashPin, ensurePeople, ready } = lib;

const HOLD = "Packs never Collect on their own. Owner Yes still required.";
const INSTALL = "This desk keeps up to 8 rules from a pack. Not kept: ";
const WARN = "A pack can carry up to 8 rules. Not kept: ";
const IMG = "<img src=x onerror=alert(1)>";

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
function reqOf(method, headers, body, query) {
  return { method: method, headers: headers || {}, body: body || {}, query: query || {} };
}
async function call(handler, method, headers, body, query) {
  const res = mockRes();
  await handler(reqOf(method, headers, body, query), res);
  return res;
}

function ids(n, extra) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push("r" + String(i).padStart(2, "0"));
  if (extra) return extra;
  return out;
}

function makeRules(ruleIds) {
  return ruleIds.map(function (id, i) {
    return { id: id, name: "Rule " + (i + 1), text: "Carry line " + (i + 1) + " stays on the card." };
  });
}

function openDesk(slug) {
  const pin = "4821";
  const shop = {
    slug: slug,
    name: slug,
    biz: slug,
    pin: hashPin(pin),
    createdAt: new Date().toISOString(),
    people: [],
    rules: []
  };
  ensurePeople(shop);
  mem.workspaces.unshift(shop);
  return { shop: shop, headers: { "x-workspace": slug, "x-pin": pin } };
}

function sameList(got, want, label) {
  const a = Array.isArray(got) ? got : [];
  if (a.length !== want.length || a.some(function (id, i) { return id !== want[i]; })) {
    fail(label + " got " + JSON.stringify(a) + " want " + JSON.stringify(want));
    return false;
  }
  pass(label);
  return true;
}

function listedInOrder(note, want) {
  const text = String(note || "");
  let at = 0;
  for (let i = 0; i < want.length; i++) {
    const found = text.indexOf(want[i], at);
    if (found < 0) return false;
    at = found + want[i].length;
  }
  return true;
}

function assertHold(body, label) {
  if (!body || body.charged !== false) fail(label + " charged must stay false");
  else pass(label + " charged false");
  const note = body && body.collectHold && body.collectHold.note;
  if (note !== HOLD) fail(label + " Collect HOLD note changed: " + note);
  else pass(label + " Collect HOLD note unchanged");
  if (body && body.collectHold && body.collectHold.charged !== false) fail(label + " collectHold.charged");
}

function assertLiteral(text, label) {
  const raw = String(text || "");
  if (raw.indexOf(IMG) < 0) fail(label + " must keep the rule id as literal text");
  else pass(label + " keeps literal rule id");
  if (raw.indexOf("&lt;") >= 0 || raw.indexOf("\\u003c") >= 0 || raw.indexOf("&#60;") >= 0) {
    fail(label + " must not HTML-escape the rule id");
  } else pass(label + " is not HTML-escaped");
  const wire = JSON.stringify(raw);
  if (wire.indexOf("\\u003c") >= 0 || wire.indexOf("&lt;") >= 0) fail(label + " JSON wire escapes the rule id");
  else pass(label + " JSON wire stays literal");
}

async function installFile(desk, ruleIds, name) {
  return call(packHandler, "POST", desk.headers, {
    action: "install-aia",
    filename: name + ".aia",
    pack: { name: name, aia: name + ".aia", does: "Carry rules. Collect HOLD.", rules: makeRules(ruleIds) }
  });
}

async function savePack(desk, action, ruleIds, name) {
  return call(packHandler, "POST", desk.headers, {
    action: action,
    id: name,
    name: name,
    aia: name + ".aia",
    does: "Carry rules. Collect HOLD.",
    rules: makeRules(ruleIds)
  });
}

async function main() {
  const libSrc = fs.readFileSync(path.join(root, "api", "_lib.js"), "utf8");
  if (!/const RULE_MAX = 8;/.test(libSrc)) fail("RULE_MAX must stay 8");
  else pass("RULE_MAX stays 8");
  const packsSrc = fs.readFileSync(path.join(root, "api", "_packs.js"), "utf8");
  if (packsSrc.indexOf(INSTALL) < 0) fail("install note sentence missing");
  else pass("install note sentence");
  if (packsSrc.indexOf(WARN) < 0) fail("save warning sentence missing");
  else pass("save warning sentence");
  if (/escapeHtml|encodeURIComponent\(ids|replace\([\s\S]{0,40}&lt;/.test(packsSrc.slice(packsSrc.indexOf("function rulesNotKeptLine")))) {
    fail("rules cap note must stay raw plain text");
  } else pass("rules cap note is raw plain text");

  await ready();

  const eight = ids(8);
  const nine = ids(9);
  const twelve = ids(12);
  const dup = ["r01", "r02", "r03", "r04", "r05", "r06", "r07", "r08", "r03", "r03"];
  const xss = eight.concat([IMG]);

  const d8 = openDesk("cap-install-8");
  const i8 = await installFile(d8, eight, "cap-install-8");
  if (i8.statusCode !== 200 || !i8.body || !i8.body.ok) fail("install 8 " + i8.statusCode + " " + JSON.stringify(i8.body));
  else pass("install 8 ok");
  if (i8.body && /Not kept/.test(i8.body.note || "")) fail("install 8 must not report dropped rules");
  else pass("install 8 nothing reported in the note");
  sameList(i8.body && i8.body.rulesNotKept, [], "install 8 rulesNotKept empty");
  if (i8.body && i8.body.added !== 8) fail("install 8 added " + (i8.body && i8.body.added));
  else pass("install 8 added 8");
  sameList((d8.shop.rules || []).map(function (r) { return r.id; }), eight, "install 8 kept every rule");
  assertHold(i8.body, "install 8");

  const d9 = openDesk("cap-install-9");
  const i9 = await installFile(d9, nine, "cap-install-9");
  if (i9.statusCode !== 200 || !i9.body || !i9.body.ok) fail("install 9 " + JSON.stringify(i9.body));
  else pass("install 9 ok");
  sameList(i9.body && i9.body.rulesNotKept, ["r09"], "install 9 rulesNotKept");
  if (!i9.body || i9.body.note.indexOf(INSTALL + "r09.") < 0) fail("install 9 note " + (i9.body && i9.body.note));
  else pass("install 9 note names r09");
  if (i9.body && i9.body.added !== 8) fail("install 9 added changed " + (i9.body && i9.body.added));
  else pass("install 9 still adds 8");
  sameList((d9.shop.rules || []).map(function (r) { return r.id; }), eight, "install 9 desk keeps the first 8");
  if (/Collect stays HOLD/.test((i9.body && i9.body.note) || "") === false) fail("install 9 note dropped Collect stays HOLD");
  else pass("install 9 note still says Collect stays HOLD");
  assertHold(i9.body, "install 9");

  const d12 = openDesk("cap-install-12");
  const i12 = await installFile(d12, twelve, "cap-install-12");
  const extra12 = ["r09", "r10", "r11", "r12"];
  sameList(i12.body && i12.body.rulesNotKept, extra12, "install 12 rulesNotKept in order");
  if (!i12.body || i12.body.note.indexOf(INSTALL + extra12.join(", ") + ".") < 0) fail("install 12 note " + (i12.body && i12.body.note));
  else pass("install 12 note lists extras in order");
  if (!listedInOrder(i12.body && i12.body.note, extra12)) fail("install 12 note order");
  if (i12.body && i12.body.added !== 8) fail("install 12 added " + (i12.body && i12.body.added));
  else pass("install 12 still adds 8");
  sameList((d12.shop.rules || []).map(function (r) { return r.id; }), eight, "install 12 desk keeps the first 8");
  assertHold(i12.body, "install 12");

  const dDup = openDesk("cap-install-dup");
  const iDup = await installFile(dDup, dup, "cap-install-dup");
  sameList(iDup.body && iDup.body.rulesNotKept, ["r03", "r03"], "install duplicate ids listed in order");
  if (!iDup.body || iDup.body.note.indexOf(INSTALL + "r03, r03.") < 0) fail("install dup note " + (iDup.body && iDup.body.note));
  else pass("install duplicate ids named twice");
  if (iDup.body && iDup.body.added !== 8) fail("install dup added " + (iDup.body && iDup.body.added));
  else pass("install dup still adds 8");
  const dupKept = (dDup.shop.rules || []).map(function (r) { return r.id; });
  sameList(dupKept, eight, "install dup keeps the first eight ids");
  if ((dDup.shop.rules || []).some(function (r) { return r && r.text === "Carry line 9 stays on the card."; })) {
    fail("install dup kept an extra copy");
  } else pass("install dup left the extra copies off the desk");

  const dX = openDesk("cap-install-xss");
  const iX = await installFile(dX, xss, "cap-install-xss");
  sameList(iX.body && iX.body.rulesNotKept, [IMG], "install xss rulesNotKept literal");
  assertLiteral(iX.body && iX.body.note, "install xss note");
  if (!iX.body || iX.body.note.indexOf(INSTALL + IMG + ".") < 0) fail("install xss note missing the plain sentence");
  else pass("install xss note uses the plain sentence");
  if ((dX.shop.rules || []).some(function (r) { return r && r.id === IMG; })) fail("install xss kept the payload rule");
  else pass("install xss did not keep the payload rule");
  assertHold(iX.body, "install xss");

  const s8 = openDesk("cap-save-8");
  const p8 = await savePack(s8, "private-pack", eight, "cap-save-8");
  if (p8.statusCode !== 200 || !p8.body || !p8.body.ok) fail("save 8 " + p8.statusCode + " " + JSON.stringify(p8.body));
  else pass("save 8 ok");
  if (p8.body && p8.body.warning) fail("save 8 must not warn: " + p8.body.warning);
  else pass("save 8 nothing reported");
  sameList(p8.body && p8.body.rulesNotKept, [], "save 8 rulesNotKept empty");
  if (p8.body && /Not kept/.test(p8.body.note || "")) fail("save 8 note must stay quiet");
  else pass("save 8 note stays quiet");
  if (!p8.body || !p8.body.pack || p8.body.pack.ruleRows.length !== 8) fail("save 8 ruleRows");
  else pass("save 8 keeps 8 rule rows");
  assertHold(p8.body, "save 8");

  const s9 = openDesk("cap-save-9");
  const p9 = await savePack(s9, "private-pack", nine, "cap-save-9");
  if (p9.statusCode !== 200) fail("save 9 must stay 200, got " + p9.statusCode + " " + JSON.stringify(p9.body));
  else pass("save 9 stays 200");
  if (p9.body && p9.body.error) fail("save 9 must not refuse: " + p9.body.error);
  else pass("save 9 does not refuse");
  if (!p9.body || p9.body.warning !== WARN + "r09.") fail("save 9 warning " + (p9.body && p9.body.warning));
  else pass("save 9 warning names r09");
  sameList(p9.body && p9.body.rulesNotKept, ["r09"], "save 9 rulesNotKept");
  if (!p9.body || !/Private on this desk/.test(p9.body.note || "")) fail("save 9 note changed");
  else pass("save 9 keeps the private note");
  if (!p9.body || !p9.body.pack || p9.body.pack.ruleRows.length !== 8) fail("save 9 stored more than 8");
  else pass("save 9 stores 8");
  assertHold(p9.body, "save 9");

  const s12 = openDesk("cap-save-12");
  const p12 = await savePack(s12, "publish-pack", twelve, "cap-save-12");
  if (p12.statusCode !== 200) fail("publish 12 must stay 200, got " + p12.statusCode);
  else pass("publish 12 stays 200");
  if (!p12.body || p12.body.warning !== WARN + extra12.join(", ") + ".") fail("publish 12 warning " + (p12.body && p12.body.warning));
  else pass("publish 12 warning lists extras in order");
  sameList(p12.body && p12.body.rulesNotKept, extra12, "publish 12 rulesNotKept in order");
  if (!listedInOrder(p12.body && p12.body.warning, extra12)) fail("publish 12 warning order");
  if (!p12.body || !/Listed free/.test(p12.body.note || "")) fail("publish 12 note changed");
  else pass("publish 12 keeps the listed note");
  if (!p12.body || !p12.body.pack || p12.body.pack.ruleRows.length !== 8) fail("publish 12 stored more than 8");
  else pass("publish 12 stores 8");
  assertHold(p12.body, "publish 12");

  const buyer = openDesk("cap-install-published");
  const bought = await call(packHandler, "POST", buyer.headers, { action: "install-pack", id: "cap-save-12" });
  if (bought.statusCode !== 200 || !bought.body || !bought.body.ok) fail("install published " + bought.statusCode + " " + JSON.stringify(bought.body));
  else pass("install published pack");
  sameList(bought.body && bought.body.rulesNotKept, extra12, "install published rulesNotKept in order");
  if (!bought.body || bought.body.note.indexOf(INSTALL + extra12.join(", ") + ".") < 0) {
    fail("install published note " + (bought.body && bought.body.note));
  } else pass("install published note lists extras in order");
  if (bought.body && bought.body.added !== 8) fail("install published added " + (bought.body && bought.body.added));
  else pass("install published still adds 8");
  assertHold(bought.body, "install published");

  const sDup = openDesk("cap-save-dup");
  const pDup = await savePack(sDup, "private-pack", dup, "cap-save-dup");
  sameList(pDup.body && pDup.body.rulesNotKept, ["r03", "r03"], "save duplicate ids listed in order");
  if (!pDup.body || pDup.body.warning !== WARN + "r03, r03.") fail("save dup warning " + (pDup.body && pDup.body.warning));
  else pass("save duplicate ids warned twice");
  if (pDup.statusCode !== 200) fail("save dup status " + pDup.statusCode);
  else pass("save dup stays 200");

  const sX = openDesk("cap-save-xss");
  const pX = await savePack(sX, "publish-pack", xss, "cap-save-xss");
  sameList(pX.body && pX.body.rulesNotKept, [IMG], "save xss rulesNotKept literal");
  assertLiteral(pX.body && pX.body.warning, "save xss warning");
  if (!pX.body || pX.body.warning !== WARN + IMG + ".") fail("save xss warning sentence");
  else pass("save xss warning uses the plain sentence");
  if (pX.statusCode !== 200) fail("save xss must stay 200, got " + pX.statusCode);
  else pass("save xss stays 200");
  assertHold(pX.body, "save xss");

  if (process.exitCode) {
    console.error("check-pack-rules-cap failed");
    return;
  }
  console.log("check-pack-rules-cap ok");
  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
}

main().catch(function (e) {
  console.error(e && e.stack || e);
  process.exit(1);
});
