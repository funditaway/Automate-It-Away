#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-desk-ais-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

delete global.__aia;
delete global.__aiaHydrate;

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

["developer.js", "developer.html", "api/_ais.js", "api/_packs.js", "desk-ais.js", "create-desk.js", "market-shop.js"].forEach(function (name) {
  if (!fs.existsSync(path.join(root, name))) fail("missing " + name);
  else pass("file " + name);
});

const packsApi = fs.readFileSync(path.join(root, "api/_packs.js"), "utf8");
["save-ai", "private-pack", "attachAisToDesk", "normalizeAis"].forEach(function (bit) {
  if (!packsApi.includes(bit)) fail("_packs.js missing " + bit);
  else pass("packs " + bit);
});
if (!packsApi.includes("charged: false") || !packsApi.includes("hold: true")) fail("Collect must stay HOLD");
else pass("Collect HOLD");

const studio = fs.readFileSync(path.join(root, "developer.js"), "utf8");
["Desk AIs", "James", "private-pack", "save-ai", "ai1-name"].forEach(function (bit) {
  if (!studio.includes(bit)) fail("developer.js missing " + bit);
  else pass("studio " + bit);
});
if (studio.includes("$250")) fail("studio invented $250");
else pass("studio no $250");

const create = fs.readFileSync(path.join(root, "create-desk.js"), "utf8");
if (!create.includes('id: "ai"') || !create.includes("save-ai")) fail("create-desk.js missing Desk AI type");
else pass("create names a desk AI");

const market = fs.readFileSync(path.join(root, "market-shop.js"), "utf8");
if (!market.includes("aiRows") || !market.includes("Desk AI")) fail("market missing desk AI listing");
else pass("market shows desk AIs");

const desk = fs.readFileSync(path.join(root, "desk.html"), "utf8");
if (!desk.includes("id=\"desk-ais\"")) fail("desk.html missing desk-ais strip");
else pass("desk shows AI rails");

const nav = fs.readFileSync(path.join(root, "desk-nav.js"), "utf8");
if (!nav.includes("desk-ais.js")) fail("desk-nav.js must load desk-ais.js");
else pass("nav loads desk-ais");

const jobsSrc = fs.readFileSync(path.join(root, "api/jobs.js"), "utf8");
if (!jobsSrc.includes("actorBlocked") || !jobsSrc.includes("Desk AIs never")) fail("jobs.js must block AI Yes/Stop");
else pass("jobs block AI Yes/Stop");

const packMd = fs.readFileSync(path.join(root, "PACK.md"), "utf8");
if (!packMd.includes("Named desk AIs") || !packMd.includes("\"ais\"")) fail("PACK.md missing ais syntax");
else pass("PACK.md documents ais");

const lib = require("../api/_lib");
const ais = require("../api/_ais");
const packHandler = require("../api/_packs");
const jobsHandler = require("../api/jobs");
const { mem, hashPin, ensurePeople, ready, save } = lib;

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
  const slug = "james-desk";
  const pin = "4821";
  const shop = {
    slug: slug,
    name: "James",
    biz: slug,
    pin: hashPin(pin),
    createdAt: new Date().toISOString(),
    people: [],
    rules: []
  };
  ensurePeople(shop);
  mem.workspaces.unshift(shop);
  const owner = { "x-workspace": slug, "x-pin": pin };

  const made = ais.normalizeAi({
    name: "James’s AI",
    role: "Doer",
    does: "Drafts this project desk",
    steps: ["qualify", "do", "follow", "collect"],
    deny: ["mail"]
  }, slug);
  if (!made || made.name.indexOf("James") < 0) fail("normalize named AI");
  else pass("normalize named AI");
  if (made.steps.indexOf("collect") >= 0) fail("AI must not draft collect");
  else pass("collect is denied");
  if (made.never.indexOf("send") < 0 || made.never.indexOf("money") < 0 || made.never.indexOf("yes") < 0) fail("never missing send/money/yes");
  else pass("never send/stop/money/yes");
  if (!ais.aiMayDraft(made, "qualify") || ais.aiMayDraft(made, "collect")) fail("aiMayDraft");
  else pass("may draft qualify, not collect");

  const attach = ais.attachAisToDesk(shop, [made]);
  if (attach < 1 || !shop.ais.length) fail("attach AIs to desk");
  else pass("attach to desk");
  const seat = (shop.people || []).find(function (p) { return p && p.deskAi; });
  if (!seat || seat.status !== "approved" || seat.kind !== "agent") fail("desk AI seat not approved agent");
  else pass("desk AI is approved agent seat");
  if (seat.pin) fail("desk AI must not get a login pin");
  else pass("desk AI has no login pin");

  const saveAi = await call(packHandler, "POST", owner, {
    action: "save-ai",
    name: "Project AI",
    role: "Worker",
    does: "Qualify cards on this desk",
    steps: "qualify, follow"
  });
  if (saveAi.statusCode !== 200 || !saveAi.body.ok || !(saveAi.body.ais || []).some(function (a) { return a.name === "Project AI"; })) {
    fail("save-ai " + saveAi.statusCode + " " + JSON.stringify(saveAi.body));
  } else pass("save-ai binds Project AI");

  const getAis = await call(packHandler, "GET", owner, {}, { ais: "1" });
  if (getAis.statusCode !== 200 || !getAis.body.ais || getAis.body.ais.length < 1) fail("GET ais");
  else pass("GET desk ais");
  if (!/Yes \/ Stop \/ Kill/.test(getAis.body.rails || "")) fail("rails copy");
  else pass("rails visible");

  const priv = await call(packHandler, "POST", owner, {
    action: "private-pack",
    name: "Family lane",
    does: "Draft chores. Wait on payout.",
    ais: [{ name: "Family AI", role: "Doer", steps: ["qualify", "do"] }],
    visibility: "private"
  });
  if (priv.statusCode !== 200 || !priv.body.ok) fail("private-pack " + JSON.stringify(priv.body));
  else pass("private-pack");
  if (priv.body.pack && priv.body.pack.visibility !== "private" && priv.body.pack.status !== "private") fail("private pack not marked private");
  else pass("private off Market");
  if (!(priv.body.ais || []).some(function (a) { return /Family AI/.test(a.name || ""); }) && !(shop.ais || []).some(function (a) { return /Family AI/.test(a.name || ""); })) {
    fail("private pack did not attach Family AI");
  } else pass("private pack attaches AI");

  const listed = await call(packHandler, "GET", {}, {}, {});
  const listedIds = ((listed.body && listed.body.packs) || []).map(function (p) { return p.id; });
  if (listedIds.some(function (id) { return /family-lane/.test(String(id || "")); })) fail("private pack leaked onto Market");
  else pass("Market hides private packs");

  mem.jobs.unshift({
    id: "job_ai_yes",
    workspace: slug,
    title: "Pay the bill",
    amount: 20,
    status: "waiting",
    step: "Do",
    log: []
  });
  const agentHdr = { "x-workspace": slug, "x-pin": "9999" };
  shop.people.push({
    id: seat.id + "_login",
    name: "James’s AI",
    role: "agent",
    kind: "agent",
    deskAi: true,
    status: "approved",
    pin: hashPin("9999")
  });
  const ship = await call(jobsHandler, "POST", agentHdr, { action: "ship", id: "job_ai_yes", confirm: true });
  if (ship.statusCode !== 403) fail("desk AI ship must 403, got " + ship.statusCode + " " + JSON.stringify(ship.body));
  else pass("desk AI cannot Yes / ship");
  const kill = await call(jobsHandler, "POST", agentHdr, { action: "kill", id: "job_ai_yes", confirm: true });
  if (kill.statusCode !== 403) fail("desk AI kill must 403, got " + kill.statusCode);
  else pass("desk AI cannot Kill");

  const ownerShip = await call(jobsHandler, "POST", owner, { action: "ship", id: "job_ai_yes", confirm: true, amount: 20 });
  if (ownerShip.statusCode >= 400 && ownerShip.statusCode !== 200) {
    fail("owner ship should still work, got " + ownerShip.statusCode);
  } else pass("owner still taps Yes");

  shop.people.push({ id: "human_helper", name: "Sam", role: "employee", kind: "helper", status: "approved" });
  mem.jobs.unshift({
    id: "job_human",
    workspace: slug,
    title: "Sam has this",
    status: "waiting",
    step: "Do",
    assignee: "Sam",
    log: []
  });
  const workerHandler = require("../api/worker");
  const work = await call(workerHandler, "GET", owner, {}, {});
  const humanJob = mem.jobs.find(function (j) { return j.id === "job_human"; });
  if (work.statusCode !== 200) fail("worker " + work.statusCode);
  else if (humanJob && humanJob.agentDrafted) fail("desk AI must not draft over a human assignee");
  else pass("human assignee is not overwritten");

  if (/\$250|White House|eBay|Whatnot/.test(JSON.stringify(priv.body))) fail("hard-line leak");
  else pass("no demo $250 / White House / live eBay");

  await save();
  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-desk-ais ok");
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
