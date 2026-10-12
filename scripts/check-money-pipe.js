#!/usr/bin/env node
// A webhook receives messages. It is not a money pipe.
const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-money-pipe-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

const root = path.join(__dirname, "..");
let failed = 0;
function fail(msg) { failed += 1; console.error("FAIL " + msg); }
function pass(msg) { console.log("ok  " + msg); }

const PAY_ENV = [
  "SQUARE_ACCESS_TOKEN",
  "EBAY_CLIENT_ID",
  "EBAY_CLIENT_SECRET",
  "CONSIGN_API_BASE",
  "TWILIO_ACCOUNT_SID",
  "GOOGLE_CLIENT_ID",
  "WHATNOT_TOKEN"
];
const savedEnv = {};
PAY_ENV.forEach(function (k) {
  savedEnv[k] = process.env[k];
  delete process.env[k];
});
function restoreEnv() {
  PAY_ENV.forEach(function (k) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  });
}

const NO_PIPE_NOTE = "Ask $49 is listed. No money pipe on this desk. Collect stays HOLD. Orange until Square or a live webhook is connected.";
const FREE_NOTE = "Packs never Collect on their own. Owner Yes still required.";
const YES_NOTE = "Ask $49 is listed. Collect stays HOLD until a person taps Yes.";

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

function sameFree(row, label) {
  if (!row) return fail(label + " missing");
  if (row.hold !== true) fail(label + " hold");
  else if (row.charged !== false) fail(label + " charged");
  else if (row.ask !== 0) fail(label + " ask");
  else if (row.note !== FREE_NOTE) fail(label + " note " + JSON.stringify(row.note));
  else if (row.pipe === "live") fail(label + " must not call the pipe live");
  else if (row.pipe !== null) fail(label + " pipe " + JSON.stringify(row.pipe));
  else pass(label);
}

async function main() {
  const packs = require("../api/_packs");
  const lib = require("../api/_lib");
  const health = require("../api/health");

  if (typeof packs.moneyPipeLive !== "function") fail("moneyPipeLive must be callable");
  else if (packs.moneyPipeLive() !== false) fail("webhook-only config must not be a money pipe");
  else pass("webhook-only moneyPipeLive false");

  const webhook = (lib.catalog() || []).find(function (p) { return p && p.id === "webhook"; });
  if (!webhook || webhook.live !== true || webhook.status !== "live") fail("webhook inbound must stay live");
  else if (!lib.PROVIDERS.webhook || lib.PROVIDERS.webhook.env.length !== 0) fail("webhook env must stay empty");
  else pass("webhook still receives; empty env is not a money pipe");

  if ((lib.PROVIDERS.square.env || []).join(",") !== "SQUARE_ACCESS_TOKEN") fail("square settings changed");
  else if ((lib.PROVIDERS.square.acts || []).indexOf("checkout") < 0) fail("square must stay the checkout pipe");
  else pass("square is still the checkout pipe");

  const priced = packs.collectHoldOf({ id: "probe-ask", name: "Probe ask", ask: 49, price: 49, priced: true });
  if (!priced || priced.pipe !== null) fail("priced pack pipe " + JSON.stringify(priced && priced.pipe));
  else if (priced.hold !== true || priced.charged !== false || priced.ask !== 49) fail("priced pack hold/charged/ask");
  else if (priced.note !== NO_PIPE_NOTE) fail("priced pack note " + JSON.stringify(priced.note));
  else pass("priced $49 collectHoldOf no pipe, hold, not charged");

  lib.mem.packs = lib.mem.packs || [];
  lib.mem.packs.unshift({
    id: "ask-49",
    name: "Ask forty nine",
    workspace: "money-pipe-desk",
    status: "listed",
    visibility: "listed",
    ask: 49,
    price: 49,
    priced: true,
    does: "A listed ask."
  });
  const listed = packs.listingOf("ask-49");
  if (!listed || !listed.collectHold || listed.collectHold.pipe !== null || listed.collectHold.note !== NO_PIPE_NOTE) {
    fail("listed $49 pack " + JSON.stringify(listed && listed.collectHold));
  } else if (listed.pipeMissing !== true || listed.charged !== false || listed.collectHold.hold !== true || listed.collectHold.charged !== false) {
    fail("listed $49 pipeMissing/charged");
  } else pass("listed $49 pack reports no pipe");

  const pricedByPrice = packs.collectHoldOf({ price: 49 });
  if (!pricedByPrice || pricedByPrice.note !== NO_PIPE_NOTE || pricedByPrice.pipe !== null || pricedByPrice.charged !== false || pricedByPrice.hold !== true) {
    fail("price 49 without a priced flag still uses the no-pipe note");
  } else pass("price 49 uses the no-pipe note");

  sameFree(packs.collectHoldOf({ id: "home", price: 0 }), "free pack collectHoldOf");
  sameFree(packs.collectHoldOf({ id: "free-listed", ask: 0, priced: false }), "free listed collectHoldOf");
  const home = packs.listingOf("home");
  if (!home || home.priced || home.price !== 0 || home.charged !== false || home.pipeMissing) fail("home listing changed");
  else sameFree(home.collectHold, "home listing collectHold");

  process.env.EBAY_CLIENT_ID = "fake-ebay-id";
  process.env.EBAY_CLIENT_SECRET = "fake-ebay-secret";
  process.env.CONSIGN_API_BASE = "https://example.invalid/consign";
  process.env.TWILIO_ACCOUNT_SID = "fake-twilio";
  process.env.GOOGLE_CLIENT_ID = "fake-google";
  if (packs.moneyPipeLive() !== false) fail("non-checkout pipes must not count");
  else pass("ebay, consign, sms, calendar do not take payment");

  process.env.SQUARE_ACCESS_TOKEN = "fake-square-token-not-a-charge";
  if (packs.moneyPipeLive() !== true) fail("checkout pipe with its setting set must count");
  else pass("square with SQUARE_ACCESS_TOKEN counts");
  const livePriced = packs.collectHoldOf({ ask: 49, priced: true });
  if (!livePriced || livePriced.pipe !== "live" || livePriced.hold !== true || livePriced.charged !== false || livePriced.note !== YES_NOTE) {
    fail("priced pack with square set " + JSON.stringify(livePriced));
  } else pass("priced pack still HOLD and not charged when square is set");
  const liveFree = packs.collectHoldOf({ price: 0 });
  if (!liveFree || liveFree.hold !== true || liveFree.charged !== false || liveFree.ask !== 0 || liveFree.note !== FREE_NOTE) {
    fail("free pack changed while square is set");
  } else pass("free pack note unchanged while square is set");

  delete process.env.SQUARE_ACCESS_TOKEN;
  if (packs.moneyPipeLive() !== false) fail("clearing the square setting must drop the money pipe");
  else pass("square setting cleared, money pipe false");

  const healthRes = mockRes();
  await health({ method: "GET", headers: {}, query: {} }, healthRes);
  const collect = healthRes.body && healthRes.body.automation && healthRes.body.automation.collect;
  if (collect !== "No money pipe. Collect stays HOLD.") fail("health collect " + JSON.stringify(collect));
  else pass("health collect does not call the webhook a money pipe");
  const healthHook = ((healthRes.body && healthRes.body.pipes) || []).find(function (p) { return p && p.id === "webhook"; });
  if (!healthHook || healthHook.live !== true || healthHook.status !== "live") fail("health webhook catalog");
  else pass("health still lists the webhook as up");

  const hookSrc = fs.readFileSync(path.join(root, "api", "hook.js"), "utf8");
  if (hookSrc.indexOf("moneyPipeLive") >= 0) fail("hook.js must not consult the money pipe");
  else pass("hook.js does not consult the money pipe");

  lib.mem.workspaces.unshift({
    slug: "money-pipe-desk",
    name: "Money pipe desk",
    biz: "money-pipe-desk",
    createdAt: new Date().toISOString(),
    people: []
  });
  const moneyBefore = (lib.mem.money || []).length;
  const hook = require("../api/hook");
  const hookRes = mockRes();
  await hook({
    method: "POST",
    headers: { "x-workspace": "money-pipe-desk" },
    query: {},
    body: { title: "Inbound note", notes: "Hello from a hook.", provider: "webhook" }
  }, hookRes);
  if (hookRes.statusCode !== 201 || !hookRes.body || hookRes.body.ok !== true || hookRes.body.event !== "capture") {
    fail("webhook accept " + hookRes.statusCode + " " + JSON.stringify(hookRes.body && hookRes.body.error));
  } else pass("webhook still accepts an incoming hook");
  if ((lib.mem.money || []).length !== moneyBefore) fail("incoming hook charged");
  else pass("incoming hook did not charge");

  const shop = fs.readFileSync(path.join(root, "market-shop.js"), "utf8");
  let at = 0;
  let buys = 0;
  while ((at = shop.indexOf("Buy · install", at)) >= 0) {
    buys += 1;
    const before = shop.slice(Math.max(0, at - 220), at);
    if (before.indexOf("collectHold.pipe") < 0) fail("Buy button is not gated on a money pipe");
    at += 1;
  }
  if (buys !== 2) fail("Buy button markup count " + buys);
  else pass("Buy shows only when a money pipe is live");
  if (shop.indexOf("Collect stays HOLD") < 0 && shop.indexOf("Collect HOLD") < 0) fail("market lost Collect HOLD");
  else pass("market Collect HOLD lines stay");
  if (shop.indexOf("No money pipe") < 0) fail("market lost the no-pipe line");
  else pass("market keeps the no-pipe line");

  const packsSrc = fs.readFileSync(path.join(root, "api", "_packs.js"), "utf8");
  if (packsSrc.indexOf("No money pipe on this desk. Collect stays HOLD. Orange until Square or a live webhook is connected.") < 0) fail("no-pipe note text changed");
  else pass("no-pipe note text unchanged");
  if (packsSrc.indexOf("Collect stays HOLD") < 0) fail("_packs.js lost Collect stays HOLD");
  else pass("_packs.js Collect HOLD stays");

  const callers = [];
  function walk(dir) {
    fs.readdirSync(dir).forEach(function (name) {
      if (name === "node_modules" || name === ".git") return;
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) return walk(full);
      if (!/\.(js|html)$/.test(name)) return;
      const text = fs.readFileSync(full, "utf8");
      if (text.indexOf("moneyPipeLive") >= 0) callers.push(path.relative(root, full));
    });
  }
  walk(path.join(root, "api"));
  walk(root);
  const uniq = callers.filter(function (p, i) { return callers.indexOf(p) === i; }).sort();
  const expected = ["api/_packs.js", "api/health.js", "scripts/check-money-pipe.js"];
  if (uniq.join(",") !== expected.join(",")) fail("moneyPipeLive callers " + uniq.join(", "));
  else pass("moneyPipeLive callers are packs, health, and this check");

  let buyPages = 0;
  ["market.html", "index.html", "help.html", "developer.html", "pricing.html"].forEach(function (rel) {
    const html = fs.readFileSync(path.join(root, rel), "utf8");
    if (/<button[^>]*>[^<]*\bBuy\b/i.test(html)) {
      buyPages += 1;
      fail(rel + " paints a Buy button");
    }
  });
  if (!buyPages) pass("no page paints a Buy button");
}

main().then(function () {
  restoreEnv();
  try { fs.unlinkSync(store); } catch (e) {}
  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-money-pipe ok");
}).catch(function (e) {
  restoreEnv();
  console.error(e && e.stack || e);
  process.exit(1);
});
