const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-rules-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

const lib = require("../api/_lib");
const rulesHandler = require("../api/rules");
const jobsHandler = require("../api/jobs");
const authHandler = require("../api/auth");
const { PLATFORM_HOLD } = require("../api/_hold");
const {
  mem, hashPin, ensurePeople, ensureRules, ensureNouns, defaultNouns,
  moneyWaitOf, moneyNeedsOwner, forbiddenRule, ready, save,
  dropPersistTests, isPersistTestJob
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

  const oil = { id: "job_mtenqutb", workspace: "consign-it-away", title: "Oil change " };
  const dresser = { id: "job_realdesk", workspace: "consign-it-away", title: "Oak dresser" };
  const tests = [
    { id: "job_mtemdqeq", workspace: "p1-synth", title: "TEST lot 1" },
    { id: "job_newids", workspace: "P1 Synth", title: "TEST lot 2" },
    { id: "job_lot3", workspace: "p1-scratch", title: "TEST lot 3" }
  ];
  mem.jobs = tests.concat([oil, dresser]);
  if (!isPersistTestJob(tests[0]) || !isPersistTestJob(tests[1]) || !isPersistTestJob(tests[2])) {
    fail("TEST lots should splice by id or title");
  } else pass("TEST lots marked for splice");
  if (isPersistTestJob(oil) || isPersistTestJob(dresser)) fail("Oil change / real consign job must stay");
  else pass("Oil change and real consign job kept");
  dropPersistTests();
  const left = (mem.jobs || []).map((j) => j.id).sort();
  if (left.join(",") !== "job_mtenqutb,job_realdesk") fail("splice left " + left.join(","));
  else pass("splice drops TEST lots only");

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
  if (first.length !== 0) fail("fresh desk should start with empty rules, got " + first.length);
  else pass("fresh desk has no seeded rules");

  const owner = { "x-workspace": slug, "x-pin": ownerPin };
  const staff = { "x-workspace": slug, "x-pin": staffPin };

  let get1 = await call(rulesHandler, "GET", owner);
  if (get1.statusCode !== 200 || (get1.body.rules || []).length !== 0) {
    fail("GET rules should be empty on a new desk");
  } else pass("GET shows empty rules");

  if (moneyWaitOf([]) != null) fail("empty rules should not money-wait");
  else if (moneyWaitOf([{ text: "Ask me if the title is missing." }]) != null) fail("non-money rule should not money-wait");
  else if (moneyWaitOf([{ text: "Payments over $250 wait for the owner." }]) !== 250) fail("should parse $250 from owner rule");
  else if (!moneyNeedsOwner(250, 250) || moneyNeedsOwner(20, 250) || moneyNeedsOwner(250, null)) fail("moneyNeedsOwner threshold");
  else pass("money wait is parsed from owner rules only");

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
  mem.jobs.unshift({
    id: "job_preview_live",
    workspace: slug,
    title: "Live preview",
    amount: 20,
    provider: "webhook",
    status: "exception",
    step: "Qualify",
    log: []
  });
  mem.jobs.unshift({
    id: "job_preview_whatnot",
    workspace: slug,
    title: "Whatnot preview",
    amount: 20,
    provider: "whatnot",
    status: "exception",
    step: "Qualify",
    log: []
  });
  mem.jobs.unshift({
    id: "job_override_kill",
    workspace: slug,
    title: "Override kill",
    amount: 20,
    status: "held",
    step: "Do",
    log: []
  });
  mem.jobs.unshift({
    id: "job_platform_hold",
    workspace: "preview-desk",
    title: "Platform hold",
    amount: PLATFORM_HOLD,
    status: "exception",
    step: "Qualify",
    log: []
  });
  mem.connections.unshift({
    id: "conn_preview_live",
    workspace: slug,
    provider: "webhook",
    label: "Webhook",
    live: true,
    hook: "https://example.invalid/hook"
  });
  mem.connections.unshift({
    id: "conn_preview_whatnot",
    workspace: slug,
    provider: "whatnot",
    label: "Whatnot",
    live: true
  });

  const extraId = (shop.rules || []).find((r) => r.text === extra);
  await call(rulesHandler, "POST", owner, { action: "remove", id: extraId && extraId.id });
  ensureRules(shop);
  if (shop.rules.length !== 0) fail("ensureRules re-seeded empty list");
  else pass("empty list stays empty");

  const noRule = await call(jobsHandler, "POST", owner, { action: "ship", id: "job_hold250", amount: 250, confirm: false });
  if (noRule.statusCode !== 409 || !noRule.body.preview || !(noRule.body.dispatch && noRule.body.dispatch.holdAt === PLATFORM_HOLD)) {
    fail("empty-list amount 250 should preview at platform hold, got " + noRule.statusCode + " " + JSON.stringify(noRule.body));
  } else pass("no money-wait rule still previews at platform hold");

  const moneyLine = "Payments over $250 wait for the owner.";
  const addMoney = await call(rulesHandler, "POST", owner, { text: moneyLine });
  if (addMoney.statusCode !== 201) fail("could not add money-wait rule");
  const hold = await call(jobsHandler, "POST", owner, { action: "ship", id: "job_hold250", amount: 250, confirm: false });
  if (hold.statusCode !== 409 || !hold.body.job || hold.body.job.status !== "held") {
    fail("money-wait rule should 409, got " + hold.statusCode + " " + JSON.stringify(hold.body));
  } else pass("owner money-wait rule still 409s");
  const moneyId = (shop.rules || []).find((r) => r.text === moneyLine);
  await call(rulesHandler, "POST", owner, { action: "remove", id: moneyId && moneyId.id });

  const livePreview = await call(jobsHandler, "POST", owner, { action: "preview", id: "job_preview_live", amount: 20, provider: "webhook" });
  if (livePreview.statusCode !== 200 || !livePreview.body.preview || !(livePreview.body.dispatch && livePreview.body.dispatch.live) || livePreview.body.dispatch.demo) {
    fail("preview should show live dispatch, got " + livePreview.statusCode + " " + JSON.stringify(livePreview.body));
  } else pass("preview shows live dispatch");

  const whatnotPreview = await call(jobsHandler, "POST", owner, { action: "preview", id: "job_preview_whatnot", amount: 20, provider: "whatnot" });
  if (whatnotPreview.statusCode !== 200 || !(whatnotPreview.body.dispatch && whatnotPreview.body.dispatch.demo) || whatnotPreview.body.dispatch.live) {
    fail("whatnot preview should stay demo-only, got " + whatnotPreview.statusCode + " " + JSON.stringify(whatnotPreview.body));
  } else pass("whatnot preview stays demo-only");

  const liveHold = await call(jobsHandler, "POST", staff, { action: "ship", id: "job_preview_live", amount: 20, provider: "webhook", confirm: false });
  if (liveHold.statusCode !== 409 || !liveHold.body.preview || !liveHold.body.job || liveHold.body.job.status !== "held" || !(liveHold.body.dispatch && liveHold.body.dispatch.live)) {
    fail("live ship should preview-hold first, got " + liveHold.statusCode + " " + JSON.stringify(liveHold.body));
  } else pass("live ship previews before leaving the desk");

  const liveBlock = await call(jobsHandler, "POST", staff, { action: "ship", id: "job_preview_live", amount: 20, provider: "webhook", confirm: true });
  if (liveBlock.statusCode !== 403) fail("employee confirm should 403 on live send, got " + liveBlock.statusCode);
  else pass("employee cannot confirm live send");

  const overridePreview = await call(jobsHandler, "POST", owner, { action: "override", id: "job_override_kill", pass: "kill", confirm: false });
  if (overridePreview.statusCode !== 409 || !overridePreview.body.preview) fail("override should require second tap, got " + overridePreview.statusCode + " " + JSON.stringify(overridePreview.body));
  else pass("override requires second tap");

  const overrideKill = await call(jobsHandler, "POST", owner, { action: "override", id: "job_override_kill", pass: "kill", confirm: true });
  if (overrideKill.statusCode !== 200 || !overrideKill.body.overridden || !overrideKill.body.job || overrideKill.body.job.status !== "killed") {
    fail("owner override kill failed, got " + overrideKill.statusCode + " " + JSON.stringify(overrideKill.body));
  } else pass("owner override can kill after preview");

  const killPreview = await call(jobsHandler, "POST", owner, { action: "kill", id: "job_demo", confirm: false });
  if (killPreview.statusCode !== 409 || !killPreview.body.preview) fail("kill should preview on first tap, got " + killPreview.statusCode + " " + JSON.stringify(killPreview.body));
  else pass("kill first tap is preview");

  const platformHold = await call(jobsHandler, "POST", { "x-workspace": "preview-desk" }, { action: "ship", id: "job_platform_hold", amount: PLATFORM_HOLD, confirm: false });
  if (platformHold.statusCode !== 409 || !platformHold.body.preview || !(platformHold.body.dispatch && platformHold.body.dispatch.holdAt === PLATFORM_HOLD)) {
    fail("desk without shop should still use platform hold, got " + platformHold.statusCode + " " + JSON.stringify(platformHold.body));
  } else pass("desk without shop still uses platform hold");

  const demo = await call(jobsHandler, "POST", owner, { action: "ship", id: "job_demo", amount: 20, confirm: true });
  if (!demo.body.job || demo.body.job.status === "shipped" || !(demo.body.job.dispatch && demo.body.job.dispatch.demo)) {
    fail("demo ship should stay held, got " + JSON.stringify(demo.body.job));
  } else pass("demo ship stays held");

  const missing = await call(jobsHandler, "POST", {}, { action: "capture", title: "No desk" });
  if (missing.statusCode !== 400) fail("missing workspace should 400, got " + missing.statusCode);
  else pass("missing workspace rejected");
  const blank = await call(jobsHandler, "POST", { "x-workspace": "   " }, { action: "capture", title: "Blank desk" });
  if (blank.statusCode !== 400) fail("blank workspace should 400, got " + blank.statusCode);
  else pass("blank workspace rejected");
  const getNone = await call(jobsHandler, "GET", {});
  if (getNone.statusCode !== 400) fail("GET missing workspace should 400, got " + getNone.statusCode);
  else pass("GET missing workspace rejected");

  const capA = await call(jobsHandler, "POST", { "x-workspace": "desk-alpha" }, { action: "capture", title: "Alpha only" });
  const capB = await call(jobsHandler, "POST", { "x-workspace": "desk-beta" }, { action: "capture", title: "Beta only" });
  if (capA.statusCode !== 201 || capB.statusCode !== 201) fail("capture A/B should 201");
  const getA = await call(jobsHandler, "GET", { "x-workspace": "desk-alpha" });
  const getB = await call(jobsHandler, "GET", { "x-workspace": "desk-beta" });
  const titlesA = (getA.body.jobs || []).map((j) => j.title);
  const titlesB = (getB.body.jobs || []).map((j) => j.title);
  if (titlesA.indexOf("Alpha only") < 0 || titlesA.indexOf("Beta only") >= 0) fail("desk A leaked or missed: " + titlesA.join(","));
  else if (titlesB.indexOf("Beta only") < 0 || titlesB.indexOf("Alpha only") >= 0) fail("desk B leaked or missed: " + titlesB.join(","));
  else pass("two desks two queues");
  if (!(mem.jobs || []).some((j) => j.id === "job_mtenqutb" && j.workspace === "consign-it-away")) {
    fail("Oil change job_mtenqutb must stay");
  } else pass("Oil change job still on consign-it-away");

  const firstNouns = ensureNouns(shop);
  if (firstNouns.capture !== "Capture" || firstNouns.do !== "Do") fail("default nouns should be Capture/Qualify/Do/Collect/Follow");
  else pass("default nouns are generic");

  const nounsSave = await call(authHandler, "POST", owner, {
    action: "nouns",
    nouns: { capture: "Drop", qualify: "Fit", do: "Draft", collect: "Pay", follow: "Nudge" }
  });
  if (nounsSave.statusCode !== 200 || !nounsSave.body.nouns || nounsSave.body.nouns.capture !== "Drop") {
    fail("owner nouns save failed " + nounsSave.statusCode + " " + JSON.stringify(nounsSave.body));
  } else pass("owner can save nouns");

  const staffNouns = await call(authHandler, "POST", staff, {
    action: "nouns",
    nouns: { capture: "Steal" }
  });
  if (staffNouns.statusCode !== 403) fail("employee nouns should 403, got " + staffNouns.statusCode);
  else pass("employee cannot save nouns");

  const authGet = await call(authHandler, "GET", owner);
  if (!authGet.body.workspace || authGet.body.workspace.nouns.capture !== "Drop") fail("GET /api/auth lost nouns");
  else pass("GET auth returns desk nouns");

  const jobsNouns = await call(jobsHandler, "GET", owner);
  if (!jobsNouns.body.nouns || jobsNouns.body.nouns.capture !== "Drop") fail("GET /api/jobs missing nouns");
  else pass("GET jobs returns desk nouns");

  const deskB = {
    slug: "nouns-b",
    name: "Other",
    biz: "nouns-b",
    pin: hashPin(ownerPin),
    createdAt: new Date().toISOString(),
    people: []
  };
  ensurePeople(deskB);
  mem.workspaces.unshift(deskB);
  const bOwner = { "x-workspace": "nouns-b", "x-pin": ownerPin };
  ensureNouns(deskB);
  const bSave = await call(authHandler, "POST", bOwner, {
    action: "nouns",
    nouns: { capture: "Intake", qualify: "Screen", do: "Write", collect: "Bill", follow: "Ping" }
  });
  if (bSave.statusCode !== 200 || bSave.body.nouns.capture !== "Intake") fail("desk B nouns save failed");
  const aAgain = await call(authHandler, "GET", owner);
  const bAgain = await call(authHandler, "GET", bOwner);
  if (aAgain.body.workspace.nouns.capture !== "Drop") fail("desk A nouns leaked or reset");
  else if (bAgain.body.workspace.nouns.capture !== "Intake") fail("desk B nouns missing");
  else if (aAgain.body.workspace.nouns.capture === bAgain.body.workspace.nouns.capture) fail("two desks share nouns");
  else pass("two desks keep separate nouns");

  const widgetLine = "Ask me if the photo is blurry.";
  const addWidget = await call(rulesHandler, "POST", owner, { text: widgetLine });
  if (addWidget.statusCode !== 201 || !addWidget.body.rule) fail("could not add widget rule");
  const widgetId = addWidget.body.rule.id;
  if (addWidget.body.rule.widget && addWidget.body.rule.widget.on) fail("new rule widget should start off");
  else pass("new rule widget defaults off");

  const widgetOn = await call(rulesHandler, "POST", owner, { action: "widget", id: widgetId, on: true, label: "Front drop" });
  if (widgetOn.statusCode !== 200 || !widgetOn.body.rule || !widgetOn.body.rule.widget.on || widgetOn.body.widgetsOn < 1) {
    fail("owner widget on failed " + widgetOn.statusCode + " " + JSON.stringify(widgetOn.body));
  } else pass("owner can turn a rule widget on");

  const staffWidget = await call(rulesHandler, "POST", staff, { action: "widget", id: widgetId, on: false });
  if (staffWidget.statusCode !== 403) fail("employee widget should 403, got " + staffWidget.statusCode);
  else pass("employee cannot toggle widget");

  const rulesGet = await call(rulesHandler, "GET", owner);
  if (!rulesGet.body.rules.some((r) => r.id === widgetId && r.widget && r.widget.on && r.widget.label === "Front drop")) {
    fail("GET rules lost widget");
  } else if (rulesGet.body.widgetsOn < 1) fail("GET rules missing widgetsOn");
  else pass("GET rules returns widget + count");

  const disk2 = JSON.parse(fs.readFileSync(store, "utf8"));
  const stored = (disk2.workspaces || []).find((w) => w.slug === slug);
  const storedRule = ((stored && stored.rules) || []).find((r) => r.id === widgetId);
  if (!storedRule || !storedRule.widget || !storedRule.widget.on) fail("widget not on workspace blob row");
  else pass("widget persisted on workspace rule row");

  const bWidget = await call(rulesHandler, "GET", bOwner);
  if ((bWidget.body.widgetsOn || 0) !== 0) fail("desk B inherited desk A widgets");
  else pass("two desks keep separate widgets");

  if (/consign|vita|fund|land/i.test(JSON.stringify(defaultNouns()))) fail("defaults leaked a vertical name");
  else pass("defaults are not a vertical");

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
