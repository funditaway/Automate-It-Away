const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-rules-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

const lib = require("../api/_lib");
const rulesHandler = require("../api/rules");
const jobsHandler = require("../api/jobs");
const authHandler = require("../api/auth");
const connectionsHandler = require("../api/connections");
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

  const extraId = (shop.rules || []).find((r) => r.text === extra);
  await call(rulesHandler, "POST", owner, { action: "remove", id: extraId && extraId.id });
  ensureRules(shop);
  if (shop.rules.length !== 0) fail("ensureRules re-seeded empty list");
  else pass("empty list stays empty");

  const noRule = await call(jobsHandler, "POST", owner, { action: "ship", id: "job_hold250", amount: 250, confirm: false });
  if (noRule.statusCode === 409) {
    fail("empty-list amount 250 must not 409 without a money-wait rule, got " + noRule.statusCode + " " + JSON.stringify(noRule.body));
  } else pass("no money-wait rule → amount does not 409");

  const moneyLine = "Payments over $250 wait for the owner.";
  const addMoney = await call(rulesHandler, "POST", owner, { text: moneyLine });
  if (addMoney.statusCode !== 201) fail("could not add money-wait rule");
  const hold = await call(jobsHandler, "POST", owner, { action: "ship", id: "job_hold250", amount: 250, confirm: false });
  if (hold.statusCode !== 409 || !hold.body.job || hold.body.job.status !== "held") {
    fail("money-wait rule should 409, got " + hold.statusCode + " " + JSON.stringify(hold.body));
  } else pass("owner money-wait rule still 409s");
  const moneyId = (shop.rules || []).find((r) => r.text === moneyLine);
  await call(rulesHandler, "POST", owner, { action: "remove", id: moneyId && moneyId.id });

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

  ["desk-alpha", "desk-beta"].forEach(function (slugName) {
    const row = { slug: slugName, name: slugName, biz: slugName, people: [] };
    ensurePeople(row);
    mem.workspaces.unshift(row);
  });
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

  const witLine = "Click + Lead → tag Interested. Draft HOLD.";
  const addWit = await call(rulesHandler, "POST", owner, {
    text: witLine,
    when: "drop",
    then: "draft",
    ifTag: "Lead",
    contains: "click",
    tag: "Interested"
  });
  if (addWit.statusCode !== 201 || !addWit.body.rule) fail("could not add When/If/Then rule");
  else if (addWit.body.rule.when !== "drop" || addWit.body.rule.then !== "draft" || addWit.body.rule.ifTag !== "Lead" || addWit.body.rule.tag !== "Interested") {
    fail("publicRule stripped When/If/Then " + JSON.stringify(addWit.body.rule));
  } else pass("When/If/Then persists on the rule");

  const getWit = await call(rulesHandler, "GET", owner);
  const storedWit = (getWit.body.rules || []).find((r) => r.text === witLine);
  if (!storedWit || storedWit.when !== "drop" || storedWit.then !== "draft") fail("GET rules lost When/If/Then");
  else pass("GET rules returns When/If/Then");
  if (!Array.isArray(getWit.body.when) || getWit.body.when.indexOf("drop") < 0 || getWit.body.when.indexOf("inbound") < 0) {
    fail("GET rules missing trigger When list");
  } else pass("GET rules lists drop/pipe/inbound/status");
  if (!Array.isArray(getWit.body.then) || getWit.body.then.indexOf("draft") < 0 || getWit.body.then.indexOf("notify") < 0) {
    fail("GET rules missing Then actions");
  } else pass("GET rules lists draft/queue/notify");

  const { flattenWorkflows } = lib;
  const flat = flattenWorkflows({
    workflows: [{
      name: "Lead click",
      rules: [{ text: "Click + Lead → tag Interested. Draft HOLD.", when: "drop", ifTag: "Lead", then: "draft", tag: "Interested" }]
    }],
    sequences: [{
      name: "Support late",
      delay: "24h",
      rules: [{ text: "Unassigned + older than 24h → escalate.", when: "status", ifUnassigned: true, then: "escalate" }]
    }]
  });
  if (flat.length !== 2) fail("flattenWorkflows should string two rules, got " + flat.length);
  else if (flat[1].ifOlder !== 24) fail("sequence delay should become ifOlder 24, got " + flat[1].ifOlder);
  else pass("workflows flatten to rules with delay");

  const leftover = lib.issueSession(shop.people[0], shop, null, { headers: { "x-workspace": slug } });
  if (!leftover || !leftover.token) fail("must issue leftover owner session");
  const sessionOnly = { "x-workspace": slug, "x-session": leftover.token };
  const closedRules = await call(rulesHandler, "GET", { "x-workspace": slug });
  if (closedRules.body && closedRules.body.canAdd) fail("GET rules without pin or session must not canAdd");
  else pass("GET rules without auth keeps canAdd false");
  const closedAdd = await call(rulesHandler, "POST", { "x-workspace": slug }, { text: "Ask me if the leftover is empty." });
  if (closedAdd.statusCode !== 403) fail("save without pin or session must 403, got " + closedAdd.statusCode);
  else pass("save without auth still 403");
  const wrongAdd = await call(rulesHandler, "POST", { "x-workspace": slug, "x-session": "deadbeefdeadbeefdeadbeefdeadbeef" }, { text: "Ask me if the leftover is fake." });
  if (wrongAdd.statusCode !== 403) fail("wrong leftover session must 403, got " + wrongAdd.statusCode);
  else pass("wrong leftover session still 403");
  const leftoverGet = await call(rulesHandler, "GET", sessionOnly);
  if (leftoverGet.statusCode !== 200 || !leftoverGet.body.canAdd) {
    fail("leftover email-session owner GET must canAdd, got " + leftoverGet.statusCode + " " + JSON.stringify(leftoverGet.body));
  } else pass("leftover email-session owner GET canAdd");
  const leftoverAdd = await call(rulesHandler, "POST", sessionOnly, { text: "Ask me if leftover session can save." });
  if (leftoverAdd.statusCode !== 201 || !leftoverAdd.body.ok) {
    fail("leftover email-session owner save should 201, got " + leftoverAdd.statusCode + " " + JSON.stringify(leftoverAdd.body));
  } else pass("leftover email-session owner can save a rule");

  shop.people.push({
    id: "p_shared",
    name: "Shared helper",
    role: "employee",
    kind: "helper",
    status: "approved",
    accountId: "acct_shared",
    createdAt: new Date().toISOString()
  });
  const collide = lib.issueSession({
    id: "acct_shared_owner",
    name: "Pat",
    role: "owner",
    kind: "owner",
    status: "approved",
    accountId: "acct_shared"
  }, shop, { id: "acct_shared", slug }, { headers: { "x-workspace": slug } });
  const collideGet = await call(rulesHandler, "GET", { "x-workspace": slug, "x-session": collide.token });
  if (!collideGet.body || !collideGet.body.canAdd) fail("owner leftover session must not lose canAdd to a helper on the same account");
  else pass("owner leftover session wins over helper accountId");

  const helperSess = lib.issueSession(shop.people.find((p) => p.id === "p_staff"), shop, null, { headers: { "x-workspace": slug } });
  const helperGet = await call(rulesHandler, "GET", { "x-workspace": slug, "x-session": helperSess.token });
  if (helperGet.body && helperGet.body.canAdd) fail("helper leftover session must not canAdd");
  else pass("helper leftover session cannot add rules");

  const ghost = lib.issueSession({
    id: "acct_ghost_owner",
    name: "Pat",
    role: "owner",
    kind: "owner",
    status: "approved",
    accountId: "acct_ghost",
    email: "ghost-rules@example.com"
  }, shop, { id: "acct_ghost", slug }, { headers: { "x-workspace": slug } });
  const ghostGet = await call(rulesHandler, "GET", { "x-workspace": slug, "x-session": ghost.token });
  if (!ghostGet.body || !ghostGet.body.canAdd) fail("leftover owner session whose personId is not on the desk must still canAdd");
  else pass("leftover owner session with synthetic personId canAdd");

  const kindOnly = {
    slug: "kind-owner",
    name: "Kind",
    biz: "kind-owner",
    pin: hashPin(ownerPin),
    createdAt: new Date().toISOString(),
    people: [{
      id: "p_kind",
      name: "Kind",
      kind: "owner",
      status: "approved",
      accountId: "acct_kind",
      createdAt: new Date().toISOString()
    }]
  };
  mem.workspaces.unshift(kindOnly);
  const kindSess = lib.issueSession({
    id: "acct_kind_owner",
    name: "Kind",
    role: "owner",
    kind: "owner",
    status: "approved",
    accountId: "acct_kind"
  }, kindOnly, { id: "acct_kind", slug: "kind-owner" }, { headers: { "x-workspace": "kind-owner" } });
  const kindGet = await call(rulesHandler, "GET", { "x-workspace": "kind-owner", "x-session": kindSess.token });
  if (!kindGet.body || !kindGet.body.canAdd) fail("kind-only owner seat leftover session must canAdd");
  else pass("kind-only owner seat leftover session canAdd");

  const mail = "rules-owner@example.com";
  const opened = await call(authHandler, "POST", { "x-workspace": "email-rules" }, {
    action: "open",
    slug: "email-rules",
    biz: "Email Rules",
    name: "Pat",
    email: mail,
    pin: ownerPin
  });
  if (opened.statusCode !== 201) fail("email-rules open should 201, got " + opened.statusCode);
  const pw = await call(authHandler, "POST", { "x-workspace": "email-rules", "x-pin": ownerPin }, {
    action: "password",
    email: mail,
    password: "good-pass1"
  });
  if (pw.statusCode !== 200 && pw.statusCode !== 201) {
    const viaAccount = await call(authHandler, "POST", { "x-workspace": "email-rules", "x-pin": ownerPin }, {
      action: "password",
      email: mail,
      password: "good-pass1"
    }, { via: "account" });
    if (viaAccount.statusCode !== 200) fail("email-rules password should save, got " + pw.statusCode + "/" + viaAccount.statusCode);
  }
  const emailDesk = (mem.workspaces || []).find((w) => w && w.slug === "email-rules");
  if (emailDesk) {
    emailDesk.people = emailDesk.people || [];
    emailDesk.people.unshift({
      id: "p_email_helper",
      name: "Helper first",
      role: "employee",
      kind: "helper",
      status: "approved",
      accountId: emailDesk.accountId,
      email: mail,
      createdAt: new Date().toISOString()
    });
  }
  const emailed = await call(authHandler, "POST", {}, { action: "login", email: mail, password: "good-pass1" });
  const emailTok = emailed.body && emailed.body.session && emailed.body.session.token;
  if (emailed.statusCode !== 200 || !emailTok) {
    fail("email login should 200 with a leftover session, got " + emailed.statusCode + " " + JSON.stringify(emailed.body));
  } else pass("email login issues leftover session");
  const emailGet = await call(rulesHandler, "GET", { "x-workspace": "email-rules", "x-session": emailTok });
  if (emailGet.statusCode !== 200 || !emailGet.body.canAdd) {
    fail("email leftover session GET /api/rules must canAdd, got " + emailGet.statusCode + " " + JSON.stringify(emailGet.body));
  } else pass("email leftover session GET canAdd");
  const emailAdd = await call(rulesHandler, "POST", { "x-workspace": "email-rules", "x-session": emailTok }, { text: "Ask me if email session can save." });
  if (emailAdd.statusCode !== 201) {
    fail("email leftover session save should 201, got " + emailAdd.statusCode + " " + JSON.stringify(emailAdd.body));
  } else pass("email leftover session can save a rule");

  const pipeSearch = await call(connectionsHandler, "POST", { "x-workspace": slug }, { action: "pipe-search", q: "webhook" });
  if (pipeSearch.statusCode !== 200) fail("pipe search without session must still 200, got " + pipeSearch.statusCode);
  else pass("pipe search without auth still 200");
  const pipeClosed = await call(connectionsHandler, "POST", { "x-workspace": slug }, { provider: "webhook", hook: "https://example.com/hook" });
  if (pipeClosed.statusCode !== 403) fail("pipe bind without session must 403, got " + pipeClosed.statusCode);
  else pass("pipe bind without auth still 403");
  const pipeLeftover = await call(connectionsHandler, "POST", sessionOnly, { provider: "webhook", hook: "https://example.com/hook" });
  if (pipeLeftover.statusCode !== 201) {
    fail("leftover email-session owner pipe bind should 201, got " + pipeLeftover.statusCode + " " + JSON.stringify(pipeLeftover.body));
  } else pass("leftover email-session owner can bind a pipe");

  const rulesPage = fs.readFileSync(path.join(__dirname, "..", "rules.html"), "utf8");
  if (rulesPage.indexOf("Owner desk code required to save.") >= 0) {
    fail("rules.html still says Owner desk code required to save as the only gate");
  } else pass("rules.html leftover session can save");
  if (rulesPage.indexOf("canAdd") < 0) fail("rules.html must still gate add on canAdd");
  else pass("rules.html still gates add on canAdd");

  const yesNo = fs.readFileSync(path.join(__dirname, "..", "ACCOUNT-YES-NO.md"), "utf8");
  const packMd = fs.readFileSync(path.join(__dirname, "..", "PACK.md"), "utf8");
  if (yesNo.indexOf("Rules session leftover after that pass") < 0) fail("ACCOUNT-YES-NO must record the Rules session leftover");
  else pass("ACCOUNT-YES-NO names Rules session leftover");
  if (packMd.indexOf("Rules session leftover:") < 0) fail("PACK.md must record the Rules session leftover");
  else pass("PACK.md names Rules session leftover");

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
