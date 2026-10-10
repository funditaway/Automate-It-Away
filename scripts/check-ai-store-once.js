#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { Readable } = require("stream");

const storeFile = path.join(os.tmpdir(), "aia-ai-store-once-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = storeFile;
process.env.AIA_TLD_PROBE = "0";

delete global.__aia;
delete global.__aiaHydrate;

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

const BODY_MAX = 1048576;
const TOO_BIG = "That's too big to send. Keep it under 1 MB.";
const SLUG = "once-desk";
const PIN = "4242";

const aisSrc = fs.readFileSync(path.join(root, "api/_ais.js"), "utf8");
const libSrc = fs.readFileSync(path.join(root, "api/_lib.js"), "utf8");
const uploadSrc = fs.readFileSync(path.join(root, "api/upload.js"), "utf8");
const packsSrc = fs.readFileSync(path.join(root, "api/_packs.js"), "utf8");
const grokSrc = fs.readFileSync(path.join(root, "api/_grok.js"), "utf8");

if (!/const STORE_AI_REFS = false;/.test(aisSrc)) fail("STORE_AI_REFS must stay false in source");
else pass("STORE_AI_REFS stays false");
if (/STORE_AI_REFS\s*=\s*process\.env/.test(aisSrc)) fail("STORE_AI_REFS must not read an env var");
else pass("STORE_AI_REFS is not an env var");
if (aisSrc.indexOf("Collect stays HOLD") < 0) fail("_ais.js Collect HOLD wording changed");
else pass("_ais.js Collect HOLD wording stays");
if (packsSrc.indexOf("Collect stays HOLD") < 0) fail("_packs.js Collect HOLD wording changed");
else pass("_packs.js Collect HOLD wording stays");
if (grokSrc.indexOf("Collect stays HOLD") < 0) fail("_grok.js Collect HOLD wording changed");
else pass("_grok.js Collect HOLD wording stays");
if (aisSrc.indexOf("return normalizeAis(storedAiRows(shop), shop.slug)") < 0) fail("deskAisOf must resolve stored rows");
else pass("deskAisOf resolves stored rows");
if (aisSrc.indexOf("const rows = storedAiRows(shop);") < 0) fail("allDeskAis must resolve stored rows");
else pass("allDeskAis resolves stored rows");
if (libSrc.indexOf("That's too big to send. Keep it under 1 MB.") < 0 || libSrc.indexOf("1048576") < 0) {
  fail("readBody must cap at 1048576 and name the 413 error");
} else pass("readBody names the 1 MB cap");
if (uploadSrc.indexOf("await readBody(req)") < 0) fail("upload.js must keep calling readBody(req)");
else pass("upload.js still calls readBody(req)");
if (uploadSrc.indexOf("Each file must stay under 4 MB.") < 0 || !/const MAX = 4_000_000;/.test(uploadSrc)) {
  fail("upload.js file cap must be 4,000,000");
} else pass("upload.js file cap is 4,000,000");

function walk(dir, acc) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (ent) {
    if (ent.name === "node_modules" || ent.name === ".git") return;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, acc);
    else if (/\.(js|html)$/.test(ent.name)) acc.push(full);
  });
}
const files = [];
walk(root, files);
const mirrorHits = files.filter(function (file) {
  const text = fs.readFileSync(file, "utf8");
  return text.indexOf("packAis") >= 0 || text.indexOf("packBots") >= 0;
}).map(function (file) { return path.relative(root, file).split(path.sep).join("/"); });
mirrorHits.sort();
const mirrorWant = ["api/_ais.js", "api/_packs.js", "scripts/check-ai-store-once.js"];
if (JSON.stringify(mirrorHits) !== JSON.stringify(mirrorWant)) {
  fail("packAis/packBots readers changed: " + mirrorHits.join(", "));
} else pass("packAis/packBots only in _ais.js, _packs.js, and this check");

const ais = require("../api/_ais");
const lib = require("../api/_lib");
const packHandler = require("../api/_packs");
const desksHandler = require("../api/_desks-http");
const healthHandler = require("../api/health");
const jobsHandler = require("../api/jobs");
const uploadHandler = require("../api/upload");
const hookHandler = require("../api/hook");
const { mem, hashPin, ready } = lib;

if (ais.STORE_AI_REFS !== false) fail("exported STORE_AI_REFS must start false");
else pass("exported STORE_AI_REFS starts false");

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end(b) { if (b != null) this.body = b; return this; }
  };
}

function ownerHeaders() {
  return { "x-workspace": SLUG, "x-pin": PIN };
}

async function call(handler, method, headers, body, query) {
  const res = mockRes();
  await handler({ method: method, headers: headers || {}, body: body || {}, query: query || {} }, res);
  return res;
}

function blankMem() {
  mem.account = null;
  mem.accounts = [];
  mem.sessions = [];
  mem.approvals = [];
  mem.locks = [];
  mem.connections = [];
  mem.jobs = [];
  mem.audit = [];
  mem.money = [];
  mem.workspaces = [];
  mem.inbox = [];
  mem.files = [];
  mem.tickets = [];
  mem.packs = [];
  mem.mail = [];
  if (Array.isArray(mem.deskEvents)) mem.deskEvents = [];
  if (Array.isArray(mem.intakes)) mem.intakes = [];
}

function twoAis() {
  return [
    ais.normalizeAi({
      name: "Plan AI",
      role: "Doer",
      does: "Drafts the next step and the words. Nothing sent.",
      rules: "Stay on this desk.",
      plan: ["Open the desk", "Draft the note"],
      steps: ["qualify", "do", "follow"]
    }, SLUG),
    ais.normalizeAi({
      name: "Second AI",
      role: "Worker",
      does: "Qualifies the card.",
      plan: ["Wait for Yes"],
      steps: "qualify, follow"
    }, SLUG)
  ];
}

function baseShop(rows, packAis, packBots) {
  const pin = hashPin(PIN);
  return {
    slug: SLUG,
    name: "Once",
    biz: "Once Desk",
    pin: pin,
    createdAt: "2026-01-01T00:00:00.000Z",
    people: [{
      id: "p_owner",
      name: "Once",
      role: "owner",
      pin: pin,
      email: "",
      createdAt: "2026-01-01T00:00:00.000Z"
    }],
    rules: [],
    ais: rows,
    packAis: packAis,
    packBots: packBots
  };
}

function shopOf(kind) {
  const rows = twoAis();
  const full = JSON.parse(JSON.stringify(rows));
  if (kind === "old") {
    const bots = JSON.parse(JSON.stringify(full));
    bots.push("Queue Helper");
    return baseShop(rows, JSON.parse(JSON.stringify(full)), bots);
  }
  if (kind === "ids") {
    return baseShop(rows, rows.map(function (a) { return a.id; }), rows.map(function (a) { return a.id; }).concat(["Queue Helper"]));
  }
  if (kind === "id-objects") {
    const bots = rows.map(function (a) { return { id: a.id }; });
    bots.push("Queue Helper");
    return baseShop(rows, rows.map(function (a) { return { id: a.id }; }), bots);
  }
  if (kind === "mirrors-only") {
    return baseShop([], JSON.parse(JSON.stringify(full)), JSON.parse(JSON.stringify(full)));
  }
  if (kind === "ais-only") {
    return baseShop(JSON.parse(JSON.stringify(full)), [], []);
  }
  if (kind === "full-pair") {
    return baseShop(rows, JSON.parse(JSON.stringify(full)), JSON.parse(JSON.stringify(full)));
  }
  if (kind === "mixed") {
    return baseShop(rows, [JSON.parse(JSON.stringify(full[0])), rows[1].id], [{ id: rows[0].id }, JSON.parse(JSON.stringify(full[1]))]);
  }
  throw new Error("unknown shop " + kind);
}

function install(kind) {
  blankMem();
  const shop = shopOf(kind);
  mem.workspaces = [shop];
  return shop;
}

function clipDiff(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  const n = Math.min(left.length, right.length);
  let i = 0;
  while (i < n && left.charCodeAt(i) === right.charCodeAt(i)) i += 1;
  return left.slice(Math.max(0, i - 60), i + 120) + " <> " + right.slice(Math.max(0, i - 60), i + 120);
}

function storeSnap() {
  return JSON.stringify({
    workspaces: mem.workspaces,
    audit: mem.audit,
    jobs: mem.jobs,
    packs: mem.packs,
    files: mem.files
  });
}

async function responsesFor(kind) {
  install(kind);
  const headers = ownerHeaders();
  const out = {};
  const desk = await call(desksHandler, "GET", headers, {}, {});
  out.desk = JSON.stringify({ status: desk.statusCode, body: desk.body });
  const packs = await call(packHandler, "GET", headers, {}, {});
  out.packs = JSON.stringify({ status: packs.statusCode, body: packs.body });
  const listing = await call(packHandler, "GET", headers, {}, { id: "home" });
  out.listing = JSON.stringify({ status: listing.statusCode, body: listing.body });
  const listed = await call(packHandler, "GET", headers, {}, { ais: "1" });
  out.ais = JSON.stringify({ status: listed.statusCode, body: listed.body });
  const jobs = await call(jobsHandler, "GET", headers, {}, {});
  out.jobs = JSON.stringify({ status: jobs.statusCode, body: jobs.body });
  const status = await call(healthHandler, "GET", headers, {}, { view: "status" });
  out.status = JSON.stringify({ status: status.statusCode, body: status.body });
  const health = await call(healthHandler, "GET", headers, {}, {});
  out.health = JSON.stringify({ status: health.statusCode, body: health.body });
  const attach = await call(packHandler, "POST", headers, {
    action: "attach-ai",
    name: "Attach AI",
    role: "Doer",
    does: "Drafts an attach.",
    plan: ["Look", "Draft"],
    steps: "qualify, do"
  }, {});
  out["attach-ai"] = JSON.stringify({ status: attach.statusCode, body: attach.body });
  const save = await call(packHandler, "POST", headers, {
    action: "save-ai",
    name: "Save AI",
    role: "Worker",
    does: "Drafts a save.",
    plan: ["Write", "Wait"],
    steps: "qualify, follow"
  }, {});
  out["save-ai"] = JSON.stringify({ status: save.statusCode, body: save.body });
  return out;
}

function jsonOfSize(size, fields) {
  const skeleton = Object.assign({}, fields, { pad: "" });
  const bare = JSON.stringify(skeleton);
  const need = size - Buffer.byteLength(bare);
  if (need < 0) throw new Error("skeleton is " + Buffer.byteLength(bare) + " bytes");
  skeleton.pad = "p".repeat(need);
  const raw = JSON.stringify(skeleton);
  if (Buffer.byteLength(raw) !== size) throw new Error("built " + Buffer.byteLength(raw) + " wanted " + size);
  return raw;
}

function countingStream(chunks) {
  let i = 0;
  let sent = 0;
  const stream = new Readable({
    read: function () {
      if (i >= chunks.length) {
        this.push(null);
        return;
      }
      const chunk = chunks[i++];
      sent += chunk.length;
      this.push(chunk);
    }
  });
  stream.sent = function () { return sent; };
  stream.method = "POST";
  stream.headers = ownerHeaders();
  stream.query = {};
  return stream;
}

function payloadBytes() {
  return Buffer.byteLength(JSON.stringify({
    account: mem.account,
    accounts: mem.accounts,
    sessions: mem.sessions,
    approvals: mem.approvals,
    locks: mem.locks,
    connections: mem.connections,
    jobs: mem.jobs,
    audit: mem.audit,
    money: mem.money,
    workspaces: mem.workspaces,
    inbox: mem.inbox,
    files: mem.files,
    tickets: mem.tickets,
    packs: mem.packs,
    mail: mem.mail
  }));
}

function fatShop(refs) {
  const prev = ais.STORE_AI_REFS;
  ais.STORE_AI_REFS = refs;
  blankMem();
  const pin = hashPin(PIN);
  const shop = {
    slug: SLUG,
    name: "Once",
    biz: "Once Desk",
    pin: pin,
    createdAt: "2026-01-01T00:00:00.000Z",
    people: [{ id: "p_owner", name: "Once", role: "owner", pin: pin, createdAt: "2026-01-01T00:00:00.000Z" }],
    rules: [],
    ais: []
  };
  mem.workspaces = [shop];
  const plan = [];
  const line = "P".repeat(500);
  for (let i = 0; i < 200; i++) plan.push(line);
  const ai = ais.normalizeAi({ name: "Fat AI", plan: plan, steps: "qualify, do, follow" }, SLUG);
  ais.attachAisToDesk(shop, [ai]);
  const bytes = payloadBytes();
  ais.STORE_AI_REFS = prev;
  return { bytes: bytes, shop: shop };
}

async function main() {
  await ready();
  await lib.save();

  const oldRails = JSON.stringify(ais.railsOf(shopOf("old")));
  const idRails = JSON.stringify(ais.railsOf(shopOf("ids")));
  const objRails = JSON.stringify(ais.railsOf(shopOf("id-objects")));
  if (oldRails !== idRails) fail("string id mirrors must match full-object rails");
  else pass("string id mirrors match full-object rails");
  if (oldRails !== objRails) fail("{id} mirrors must match full-object rails");
  else pass("{id} mirrors match full-object rails");
  const mirrorOnly = JSON.stringify(ais.railsOf(shopOf("mirrors-only")));
  const aisOnly = JSON.stringify(ais.railsOf(shopOf("ais-only")));
  if (mirrorOnly !== aisOnly) fail("full objects only in packAis/packBots must still load");
  else pass("full objects only in packAis/packBots still load");
  const oldNames = JSON.parse(oldRails).ais.map(function (a) { return a.name; });
  if (oldNames.join(",") !== "Plan AI,Second AI,Queue Helper") {
    fail("old and new mirrors must keep the name-string bot, got " + oldNames.join(","));
  } else pass("a packBots name string still loads beside id refs");

  const mixedRails = JSON.stringify(ais.railsOf(shopOf("mixed")));
  const fullPairRails = JSON.stringify(ais.railsOf(shopOf("full-pair")));
  if (mixedRails !== fullPairRails) fail("a pack holding a full copy and an id ref must match all full copies");
  else pass("one pack with a full copy and an id ref matches all full copies");

  const live = twoAis();
  const deadShop = baseShop(live, [live[0].id, { id: "gone-ai" }, "gone-bot"], [{ id: "also-gone" }, "Queue Helper"]);
  let deadThrew = false;
  let deadRails = null;
  try { deadRails = ais.railsOf(deadShop); }
  catch (err) { deadThrew = true; }
  const deadNames = ((deadRails && deadRails.ais) || []).map(function (a) { return a && a.name; });
  const deadJson = JSON.stringify(deadRails);
  const deadBlank = (deadRails && deadRails.ais || []).some(function (a) {
    return a == null || !a.name || !String(a.name).trim() || (a.id === "gone-ai" && !a.does);
  });
  const deadPartial = /"id"\s*:\s*"gone-ai"|"id"\s*:\s*"also-gone"|"id"\s*:\s*"gone-bot"/.test(deadJson)
    || deadJson.indexOf("gone-ai") >= 0
    || deadJson.indexOf("also-gone") >= 0
    || deadJson.indexOf("gone-bot") >= 0;
  if (deadThrew) fail("a dead AI ref must not throw");
  else if (deadNames.join(",") !== "Plan AI,Second AI,Queue Helper") fail("a dead AI ref must be skipped, got " + deadNames.join(","));
  else if (deadBlank || deadPartial) fail("a dead AI ref leaked into public JSON");
  else pass("a dead AI ref is skipped with no blank or partial AI");
  if (deadShop.packAis.some(function (row) { return row && row.id === "gone-ai"; }) && deadShop.packBots.some(function (row) { return row && row.id === "also-gone"; })) {
    pass("reading does not rewrite the stored dead refs");
  } else fail("reader rewrote packAis or packBots");

  const oldHttp = await responsesFor("old");
  const idHttp = await responsesFor("ids");
  const objHttp = await responsesFor("id-objects");
  ["desk", "packs", "listing", "ais", "jobs", "attach-ai", "save-ai", "status", "health"].forEach(function (key) {
    if (oldHttp[key] !== idHttp[key]) fail(key + " response differs for string id mirrors: " + clipDiff(oldHttp[key], idHttp[key]));
    else pass(key + " matches for string id mirrors");
    if (oldHttp[key] !== objHttp[key]) fail(key + " response differs for {id} mirrors: " + clipDiff(oldHttp[key], objHttp[key]));
    else pass(key + " matches for {id} mirrors");
  });
  const mixedHttp = await responsesFor("mixed");
  const fullPairHttp = await responsesFor("full-pair");
  ["desk", "packs", "listing", "ais", "jobs", "attach-ai", "save-ai", "status", "health"].forEach(function (key) {
    if (mixedHttp[key] !== fullPairHttp[key]) fail(key + " differs for a mixed full-copy and id ref: " + clipDiff(mixedHttp[key], fullPairHttp[key]));
    else pass(key + " matches for a mixed full copy and id ref");
  });
  const mirrorHttp = await responsesFor("mirrors-only");
  const canonHttp = await responsesFor("ais-only");
  ["desk", "ais", "jobs"].forEach(function (key) {
    if (mirrorHttp[key] !== canonHttp[key]) fail(key + " differs when the old store keeps AIs only on the mirrors: " + clipDiff(mirrorHttp[key], canonHttp[key]));
    else pass(key + " matches a mirror-only old store");
  });

  ais.STORE_AI_REFS = false;
  install("old");
  const savedOff = await call(packHandler, "POST", ownerHeaders(), {
    action: "save-ai",
    name: "Saved AI",
    role: "Doer",
    does: "Drafts while the flag is off.",
    plan: ["One", "Two"],
    steps: "qualify, follow"
  }, {});
  const shopOff = mem.workspaces[0];
  const offSame = shopOff.packAis.length === shopOff.ais.length
    && shopOff.packAis.every(function (row, i) { return row === shopOff.ais[i]; })
    && shopOff.packBots.every(function (row, i) { return row === shopOff.ais[i]; })
    && JSON.stringify(shopOff.packAis) === JSON.stringify(shopOff.ais)
    && JSON.stringify(shopOff.packBots) === JSON.stringify(shopOff.ais)
    && shopOff.packAis.every(function (row) { return row && typeof row === "object" && row.name && Array.isArray(row.plan); });
  if (savedOff.statusCode !== 200 || !savedOff.body || !savedOff.body.ok || !offSame) {
    fail("flag false must write full-object copies, got " + savedOff.statusCode + " " + JSON.stringify(shopOff.packAis && shopOff.packAis[0] && shopOff.packAis[0].name));
  } else pass("flag false writes full-object copies, same JSON as ais");

  const getOff = await call(packHandler, "GET", ownerHeaders(), {}, { ais: "1" });
  ais.STORE_AI_REFS = true;
  install("old");
  const savedOn = await call(packHandler, "POST", ownerHeaders(), {
    action: "save-ai",
    name: "Saved AI",
    role: "Doer",
    does: "Drafts while the flag is off.",
    plan: ["One", "Two"],
    steps: "qualify, follow"
  }, {});
  const shopOn = mem.workspaces[0];
  const ids = shopOn.ais.map(function (a) { return a.id; });
  const onIds = JSON.stringify(shopOn.packAis) === JSON.stringify(ids)
    && JSON.stringify(shopOn.packBots) === JSON.stringify(ids)
    && shopOn.packAis.every(function (row) { return typeof row === "string"; })
    && shopOn.packBots.every(function (row) { return typeof row === "string"; })
    && JSON.stringify(shopOn.packAis).indexOf("\"plan\"") < 0;
  const getOn = await call(packHandler, "GET", ownerHeaders(), {}, { ais: "1" });
  if (savedOn.statusCode !== 200 || !savedOn.body || !savedOn.body.ok || !onIds) {
    fail("flag true must write ids only");
  } else pass("flag true writes ids only");
  if (JSON.stringify(savedOff.body) !== JSON.stringify(savedOn.body)) fail("save-ai response changed when the flag flipped");
  else pass("save-ai response stays identical with the flag on");
  if (JSON.stringify(getOff.body) !== JSON.stringify(getOn.body)) fail("GET ais changed after an id-only save");
  else pass("GET ais stays identical after an id-only save");
  ais.STORE_AI_REFS = false;
  if (ais.STORE_AI_REFS !== false) fail("flag did not return to false");
  else pass("flag returned to false");

  const oldSize = fatShop(false);
  const newSize = fatShop(true);
  ais.STORE_AI_REFS = false;
  console.log("store compact bytes old-shape: " + oldSize.bytes);
  console.log("store compact bytes id-refs: " + newSize.bytes);
  if (!(oldSize.bytes > newSize.bytes)) fail("id refs should shrink the 200x500 store, old " + oldSize.bytes + " new " + newSize.bytes);
  else pass("200x500 store shrinks when refs are on (" + oldSize.bytes + " -> " + newSize.bytes + ")");
  if (oldSize.shop.ais[0].plan.length !== 200 || oldSize.shop.ais[0].plan[0].length !== 500) {
    fail("fat plan was not stored at 200 x 500");
  } else pass("fat plan is 200 steps of 500 characters");
  if (typeof oldSize.shop.packAis[0] === "string" || typeof newSize.shop.packAis[0] !== "string") {
    fail("size probe wrote the wrong mirror shape");
  } else pass("size probe used full copies, then ids");

  install("old");
  const beforeOver = storeSnap();
  const overRaw = Buffer.alloc(BODY_MAX + 1, 0x78);
  const overReq = countingStream([overRaw]);
  overReq.headers["content-length"] = String(overRaw.length);
  const overRes = mockRes();
  await packHandler(overReq, overRes);
  if (overRes.statusCode !== 413 || !overRes.body || overRes.body.ok !== false || overRes.body.error !== TOO_BIG) {
    fail("1 MB + 1 must 413, got " + overRes.statusCode + " " + JSON.stringify(overRes.body));
  } else pass("1 MB + 1 returns 413");
  if (storeSnap() !== beforeOver) fail("1 MB + 1 must save nothing");
  else pass("1 MB + 1 saves nothing");
  if (overReq.sent() !== 0) fail("content-length over the cap must not be read, sent " + overReq.sent());
  else pass("content-length over the cap is not read");

  install("old");
  const hookRaw = jsonOfSize(BODY_MAX + 1, { title: "Over one meg", from: "pipe" });
  const hookReq = countingStream([Buffer.from(hookRaw)]);
  hookReq.headers["content-length"] = String(Buffer.byteLength(hookRaw));
  hookReq.headers["x-workspace"] = SLUG;
  hookReq.url = "/api/hook";
  const hookRes = mockRes();
  await hookHandler(hookReq, hookRes);
  if (hookRes.statusCode === 413) {
    fail("POST /api/hook just over 1 MB must not use the 1 MB cap, got " + JSON.stringify(hookRes.body));
  } else if (hookRes.statusCode !== 201 || !hookRes.body || hookRes.body.ok !== true) {
    fail("POST /api/hook just over 1 MB must still be accepted, got " + hookRes.statusCode + " " + JSON.stringify(hookRes.body && hookRes.body.error));
  } else pass("POST /api/hook just over 1 MB is accepted");
  const hookTooBig = (mem.jobs || []).filter(function (j) { return j && j.title === "Too big to take in"; });
  if (hookTooBig.length) fail("POST /api/hook just over 1 MB must not file a too-big card");
  else pass("POST /api/hook just over 1 MB files no too-big card");
  if (hookReq.sent() !== Buffer.byteLength(hookRaw)) fail("hook under 4 MB must be read, sent " + hookReq.sent());
  else pass("hook under 4 MB is read");

  const beforeChunk = storeSnap();
  const chunks = [Buffer.alloc(400000, 0x61), Buffer.alloc(400000, 0x62), Buffer.alloc(400000, 0x63), Buffer.alloc(400000, 0x64)];
  const chunkReq = countingStream(chunks);
  const chunkRes = mockRes();
  await packHandler(chunkReq, chunkRes);
  if (chunkRes.statusCode !== 413 || !chunkRes.body || chunkRes.body.error !== TOO_BIG) {
    fail("chunked body over 1 MB must 413, got " + chunkRes.statusCode + " " + JSON.stringify(chunkRes.body));
  } else pass("chunked body over 1 MB returns 413");
  if (storeSnap() !== beforeChunk) fail("chunked oversize must save nothing");
  else pass("chunked oversize saves nothing");
  if (!(chunkReq.sent() < Buffer.concat(chunks).length)) fail("reader kept going after the cap, sent " + chunkReq.sent());
  else pass("reader stops once the cap is crossed (" + chunkReq.sent() + " of " + Buffer.concat(chunks).length + ")");

  const underRaw = jsonOfSize(BODY_MAX - 1, { action: "packs" });
  const underReq = countingStream([Buffer.from(underRaw)]);
  underReq.headers["content-length"] = String(Buffer.byteLength(underRaw));
  const underRes = mockRes();
  await packHandler(underReq, underRes);
  if (underRes.statusCode !== 200 || !underRes.body || underRes.body.ok !== true || !Array.isArray(underRes.body.packs)) {
    fail("body just under 1 MB must be accepted, got " + underRes.statusCode + " " + JSON.stringify(underRes.body && underRes.body.error));
  } else pass("body just under 1 MB is accepted");

  const exactRaw = jsonOfSize(BODY_MAX, { action: "packs" });
  const exactReq = countingStream([Buffer.from(exactRaw)]);
  exactReq.headers["content-length"] = String(BODY_MAX);
  const exactRes = mockRes();
  await packHandler(exactReq, exactRes);
  if (exactRes.statusCode !== 200 || !exactRes.body || exactRes.body.ok !== true) {
    fail("body of exactly 1 MB must be accepted, got " + exactRes.statusCode + " " + JSON.stringify(exactRes.body && exactRes.body.error));
  } else pass("body of exactly 1 MB is accepted");

  const smallUpload = countingStream([Buffer.from(JSON.stringify({
    name: "note.txt",
    type: "text/plain",
    data: Buffer.from("hello").toString("base64")
  }))]);
  smallUpload.headers["x-workspace"] = SLUG;
  smallUpload.url = "/api/upload";
  const smallUp = mockRes();
  await uploadHandler(smallUpload, smallUp);
  if (smallUp.statusCode !== 201 || !smallUp.body || smallUp.body.ok !== true) {
    fail("small upload broke, got " + smallUp.statusCode + " " + JSON.stringify(smallUp.body));
  } else pass("small upload still saves");

  const wideUpload = countingStream([Buffer.from(JSON.stringify({
    name: "note.txt",
    type: "text/plain",
    data: Buffer.from("hello").toString("base64"),
    pad: "u".repeat(BODY_MAX)
  }))]);
  wideUpload.headers["x-workspace"] = SLUG;
  const wideUp = mockRes();
  await uploadHandler(wideUpload, wideUp);
  if (wideUp.statusCode === 413 && wideUp.body && wideUp.body.error === TOO_BIG) {
    fail("upload over 1 MB was caught by the body cap");
  } else if (wideUp.statusCode !== 201 || !wideUp.body || wideUp.body.ok !== true) {
    fail("upload over 1 MB should still save a small file, got " + wideUp.statusCode + " " + JSON.stringify(wideUp.body));
  } else pass("upload over 1 MB is exempt from the body cap");

  const bigFile = Buffer.alloc(4000001, 0x61);
  const bigUpload = countingStream([Buffer.from(JSON.stringify({
    name: "big.txt",
    type: "text/plain",
    data: bigFile.toString("base64")
  }))]);
  bigUpload.headers["x-workspace"] = SLUG;
  const bigUp = mockRes();
  await uploadHandler(bigUpload, bigUp);
  if (bigUp.statusCode !== 413 || !bigUp.body || bigUp.body.error !== "Each file must stay under 4 MB.") {
    fail("upload 4 MB cap changed, got " + bigUp.statusCode + " " + JSON.stringify(bigUp.body && bigUp.body.error));
  } else pass("upload rejects a file over 4 MB");

  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("all checks passed");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
