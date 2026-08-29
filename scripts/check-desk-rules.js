const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-rules-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

const lib = require("../api/_lib");
const rulesHandler = require("../api/rules");
const jobsHandler = require("../api/jobs");
const {
  mem, hashPin, ensurePeople, ensureRules,
  SEED_RULE_TEXT, forbiddenRule, ready, save
} = lib;

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
  return {
    method,
    headers: headers || {},
    body: body || {},
    query: query || {}
  };
}

async function call(handler, method, headers, body, query) {
  const res = mockRes();
  await handler(reqOf(method, headers, body, query), res);
  return res;
}

async function main() {
  await ready();

  const slug = "rules-shop";
  const ownerPin = "4821";
  const staffPin = "7390";
  const shop = {
    slug,
    name: "Pat",
    biz: slug,
    model: "Consignment & resale",
    pin: hashPin(ownerPin),
    createdAt: new Date().toISOString(),
    people: []
  };
  ensurePeople(shop);
  shop.people[0].name = "Pat";
  shop.people.push({
    id: "p_staff",
    name: "Lee",
    role: "employee",
    pin: hashPin(staffPin),
    createdAt: new Date().toISOString()
  });
  mem.workspaces.unshift(shop);

  const first = ensureRules(shop);
  if (!first.some((r) => r.text === SEED_RULE_TEXT)) fail("seed missing on first ensure");
  else pass("seed on first ensure");

  const owner = { "x-workspace": slug, "x-pin": ownerPin };
  const staff = { "x-workspace": slug, "x-pin": staffPin };

  let get1 = await call(rulesHandler, "GET", owner);
  if (get1.statusCode !== 200 || !get1.body.rules.some((r) => r.text === SEED_RULE_TEXT)) {
    fail("GET rules missing seed");
  } else pass("GET shows seed");

  const extra = "Ask me if the title is missing.";
  const add = await call(rulesHandler, "POST", owner, { text: extra });
  if (add.statusCode !== 201 || !add.body.rules.some((r) => r.text === extra)) fail("owner add extra");
  else pass("owner add extra");

  const get2 = await call(rulesHandler, "GET", owner);
  if (!get2.body.rules.some((r) => r.text === extra)) fail("second GET lost extra");
  else pass("second GET still has extra");

  const disk = JSON.parse(fs.readFileSync(store, "utf8"));
  const row = (disk.workspaces || []).find((w) => w.slug === slug);
  if (!row || !(row.rules || []).some((r) => r.text === extra)) fail("extra not on store file");
  else pass("extra persisted on store");

  const staffAdd = await call(rulesHandler, "POST", staff, { text: "Ask me if it is oak." });
  if (staffAdd.statusCode !== 403) fail("employee add should 403, got " + staffAdd.statusCode);
  else pass("employee cannot add");

  ["auto-pay invoices", "auto-list on eBay", "un-kill junk", "skip Kill", "skip payout", "skip named outbound", "mark eBay live"].forEach((t) => {
    if (!forbiddenRule(t)) fail("should forbid: " + t);
  });
  if (forbiddenRule("Ask me if the seller wants a check.")) fail("good wait-line was forbidden");
  else pass("forbidden patterns");

  const bad = await call(rulesHandler, "POST", owner, { text: "auto-pay anything over $10" });
  if (bad.statusCode !== 400) fail("forbidden add should 400");
  else pass("forbidden add rejected");

  mem.jobs.unshift({
    id: "job_hold250",
    workspace: slug,
    title: "Payout",
    amount: 250,
    status: "exception",
    step: "Qualify",
    log: []
  });
  mem.jobs.unshift({
    id: "job_demo",
    workspace: slug,
    title: "Small send",
    amount: 20,
    status: "exception",
    step: "Qualify",
    log: []
  });

  const seedId = (shop.rules || []).find((r) => r.seed || r.text === SEED_RULE_TEXT);
  const dropSeed = await call(rulesHandler, "POST", owner, { action: "remove", id: seedId && seedId.id });
  if (dropSeed.statusCode !== 200 || dropSeed.body.rules.some((r) => r.text === SEED_RULE_TEXT)) {
    fail("owner should be able to delete the seed line");
  } else pass("owner can delete seed");
  const afterDelete = await call(rulesHandler, "GET", owner);
  if (afterDelete.body.rules.some((r) => r.text === SEED_RULE_TEXT)) fail("GET re-seeded after delete");
  else if (!afterDelete.body.rules.some((r) => r.text === extra)) fail("extra gone after seed delete");
  else pass("seed delete does not re-seed or drop extra");

  const extraId = (shop.rules || []).find((r) => r.text === extra);
  await call(rulesHandler, "POST", owner, { action: "remove", id: extraId && extraId.id });
  ensureRules(shop);
  if (shop.rules.length !== 0) fail("ensureRules re-seeded empty list");
  else pass("empty list stays empty");

  const hold = await call(jobsHandler, "POST", owner, { action: "ship", id: "job_hold250", amount: 250, confirm: false });
  if (hold.statusCode !== 409 || !hold.body.job || hold.body.job.status !== "held") {
    fail("empty-list $250 ship should 409 held, got " + hold.statusCode + " " + JSON.stringify(hold.body));
  } else pass("empty-list $250 ship still 409 held");

  const demo = await call(jobsHandler, "POST", owner, { action: "ship", id: "job_demo", amount: 20, confirm: true });
  if (!demo.body.job || demo.body.job.status === "shipped" || !(demo.body.job.dispatch && demo.body.job.dispatch.demo)) {
    fail("demo ship should stay held, got " + JSON.stringify(demo.body.job));
  } else pass("demo ship stays held");

  const pinLeak = (mem.audit || []).some((a) => /4821|7390/.test(JSON.stringify(a)));
  if (pinLeak) fail("PIN appeared in audit");
  else pass("no PIN in audit");

  await save();
  if (process.exitCode) {
    console.error("check-desk-rules failed");
    process.exit(1);
  }
  console.log("check-desk-rules passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
