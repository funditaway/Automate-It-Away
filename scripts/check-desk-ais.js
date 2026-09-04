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

["developer.js", "developer.html", "api/_ais.js", "api/_packs.js", "api/_aia-net.js", "desk-ais.js", "create-desk.js", "market-shop.js"].forEach(function (name) {
  if (!fs.existsSync(path.join(root, name))) fail("missing " + name);
  else pass("file " + name);
});

const packsApi = fs.readFileSync(path.join(root, "api/_packs.js"), "utf8");
["save-ai", "private-pack", "attachAisToDesk", "normalizeAis", "download-pack", "install-aia", ".aia"].forEach(function (bit) {
  if (!packsApi.includes(bit)) fail("_packs.js missing " + bit);
  else pass("packs " + bit);
});
if (!packsApi.includes("charged: false") || !packsApi.includes("hold: true")) fail("Collect must stay HOLD");
else pass("Collect HOLD");

const studio = fs.readFileSync(path.join(root, "developer.js"), "utf8");
["Desk AIs", "James", "private-pack", "save-ai", "ai1-name", "james.aia", "springfield-shop.aia", "AIA Internet", "install-aia"].forEach(function (bit) {
  if (!studio.includes(bit)) fail("developer.js missing " + bit);
  else pass("studio " + bit);
});
if (studio.includes("$250")) fail("studio invented $250");
else pass("studio no $250");
["When", "If", "Then", "workflows", "Lead click", "Customs Form", "older than 24h", "Pack workflow"].forEach(function (bit) {
  if (!studio.includes(bit)) fail("developer.js missing " + bit);
  else pass("studio " + bit);
});

const create = fs.readFileSync(path.join(root, "create-desk.js"), "utf8");
if (!create.includes('id: "ai"') || !create.includes("save-ai")) fail("create-desk.js missing Desk AI type");
else pass("create names a desk AI");
if (!create.includes("function deskOpen") || !create.includes("Open or unlock this desk first")) fail("create must gate Desk AI Bind on an open desk");
else pass("create gates Desk AI Bind");
if (!create.includes("if (!deskOpen()) return fail")) fail("create save-ai must refuse without an open desk");
else pass("create will not Bind without an open desk");
if (!studio.includes("Named desk AIs") || !studio.includes("save-ai") || !studio.includes("install-aia")) fail("Studio naming / .aia install must stay");
else pass("Studio naming and .aia install stay");

const market = fs.readFileSync(path.join(root, "market-shop.js"), "utf8");
if (!market.includes("aiRows") || !market.includes("Desk AI")) fail("market missing desk AI listing");
else pass("market shows desk AIs");
if (!market.includes("install-aia") || !market.includes("aia-file")) fail("market missing install .aia");
else pass("market installs .aia");

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
if (!packMd.includes("Named desk AIs") || !packMd.includes("\"ais\"") || !packMd.includes("AIA Internet") || !packMd.includes(".aia")) fail("PACK.md missing ais syntax");
else pass("PACK.md documents ais");

const net = require("../api/_aia-net");
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

  const james = net.parseName("james.aia");
  const shopName = net.parseName("springfield-shop.aia");
  if (!james.ok || james.name !== "james.aia") fail("james.aia");
  else pass("james.aia");
  if (!shopName.ok || shopName.file !== "springfield-shop.aia") fail("springfield-shop.aia");
  else pass("springfield-shop.aia");
  if (net.parseName("springfield-shop.com").ok) fail("must reject .com");
  else pass("rejects other TLDs");
  if (net.statusOf().chain || net.statusOf().owned || net.statusOf().live) fail("must not fake on-chain");
  else pass("no fake chain ownership");
  if (!/\.aia names on this desk/.test(net.statusOf().note)) fail("honest orange note");
  else pass("honest orange .aia note");

  const namedAi = ais.normalizeAi({ name: "James’s AI", aia: "james.aia" }, slug);
  if (!namedAi || namedAi.aia !== "james.aia" || namedAi.file !== "james.aia") fail("AI aia identity");
  else pass("AI addressed as james.aia");

  const badTld = await call(packHandler, "POST", owner, {
    action: "private-pack",
    name: "Wrong net",
    aia: "springfield-shop.com",
    does: "Must not save."
  });
  if (badTld.statusCode < 400) fail("pack .com must 400, got " + badTld.statusCode);
  else pass("pack rejects other TLDs");

  const packed = await call(packHandler, "POST", owner, {
    action: "private-pack",
    name: "Springfield shop",
    aia: "springfield-shop.aia",
    does: "Draft the lane. Wait on payout.",
    ais: [{ name: "James’s AI", aia: "james.aia", role: "Doer", steps: ["qualify", "do"] }]
  });
  if (packed.statusCode !== 200 || !packed.body.ok || !(packed.body.pack && packed.body.pack.aia === "springfield-shop.aia")) {
    fail("pack aia " + JSON.stringify(packed.body && packed.body.pack));
  } else pass("pack addressed as springfield-shop.aia");
  if (packed.body.pack && (packed.body.pack.chain || packed.body.pack.owned)) fail("pack must not claim chain");
  else pass("pack chain false");

  const dl = await call(packHandler, "GET", owner, {}, { download: "springfield-shop.aia" });
  if (dl.statusCode !== 200 || !dl.body) fail("download " + dl.statusCode);
  else {
    const file = typeof dl.body === "string" ? dl.body : JSON.stringify(dl.body);
    const disp = dl.headers && (dl.headers["Content-Disposition"] || dl.headers["content-disposition"] || "");
    if (!/springfield-shop\.aia/.test(disp) && !/springfield-shop\.aia/.test(file)) fail("download filename " + disp + " " + file.slice(0, 180));
    else pass("pack download is springfield-shop.aia");
    if (/\"chain\":\s*true|\"owned\":\s*true/.test(file)) fail("download claimed chain");
    else pass("download is not a chain claim");
  }

  const dlPost = await call(packHandler, "POST", owner, { action: "download-pack", aia: "springfield-shop.aia" });
  if (dlPost.statusCode !== 200) fail("download-pack " + dlPost.statusCode);
  else pass("POST download-pack");

  const homeDl = await call(packHandler, "GET", {}, {}, { download: "home.aia" });
  if (homeDl.statusCode !== 200) fail("official home.aia download " + homeDl.statusCode);
  else pass("official home.aia download");

  const file = typeof dl.body === "string" ? JSON.parse(dl.body) : dl.body;
  const other = {
    slug: "family-desk",
    name: "Family",
    biz: "family-desk",
    pin: hashPin("4821"),
    createdAt: new Date().toISOString(),
    people: [],
    rules: []
  };
  ensurePeople(other);
  mem.workspaces.unshift(other);
  const family = { "x-workspace": "family-desk", "x-pin": "4821" };
  const fake = JSON.parse(JSON.stringify(file));
  fake.chain = true;
  fake.owned = true;
  fake.live = true;
  const inst = await call(packHandler, "POST", family, { action: "install-aia", filename: "springfield-shop.aia", pack: fake });
  if (inst.statusCode !== 200 || !inst.body.ok) fail("install-aia " + inst.statusCode + " " + JSON.stringify(inst.body));
  else pass("install-aia onto family desk");
  if (inst.body.chain || inst.body.owned || (inst.body.pack && (inst.body.pack.chain || inst.body.pack.owned))) fail("install must not honor chain");
  else pass("install strips chain claim");
  if (!(inst.body.ais || []).some(function (a) { return /James/.test(a.name || "") || a.aia === "james.aia"; }) && !(other.ais || []).some(function (a) { return /James/.test(a.name || ""); })) {
    fail("install-aia did not attach named AI");
  } else pass("install-aia attaches named desk AI");

  const badFile = await call(packHandler, "POST", family, { action: "install-aia", filename: "lane.json", pack: { name: "Nope", aia: "nope.aia" } });
  if (badFile.statusCode < 400) fail("non-.aia filename must 400");
  else pass("rejects non-.aia filename");

  const health = require("../api/health");
  const healthRes = await call(health, "GET", {}, {}, {});
  if (!healthRes.body || !healthRes.body.internet || healthRes.body.internet.chain) fail("health internet");
  else pass("health exposes AIA Internet HOLD");

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
