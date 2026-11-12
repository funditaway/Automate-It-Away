require("./_env-guard");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

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

function rulesPinTag(html) {
  const m = html.match(/<input\b[^>]*id="pin"[^>]*>/i);
  return m ? m[0] : "";
}
function rulesLoadBlock(html) {
  const from = html.indexOf("async function load()");
  const to = html.indexOf('document.getElementById("rule-list")', from);
  return from >= 0 && to > from ? html.slice(from, to) : "";
}
function rulesFaults(html) {
  const bad = [];
  if (!/\btype="password"/.test(rulesPinTag(html))) bad.push("field type=text");
  if (html.indexOf('localStorage.setItem("aia_pin"') >= 0) bad.push("pin stored");
  const load = rulesLoadBlock(html);
  if (load.indexOf('action: "login"') < 0) bad.push("no login");
  if (!/loginRes\.status\s*>=\s*400/.test(load)) bad.push("wrong-code 401");
  return bad;
}
function applyRulesMutant(html, kind) {
  if (kind === "field type=text") {
    return html.replace(
      'id="pin" placeholder="Desk code" type="password"',
      'id="pin" placeholder="Desk code" type="text"'
    );
  }
  if (kind === "pin stored") {
    return html
      .replace(
        "const typed = String(pinEl.value || \"\").trim();",
        "const typed = String(pinEl.value || \"\").trim();\n        if (typed) localStorage.setItem(\"aia_pin\", typed);"
      )
      .replace("try { localStorage.removeItem(\"aia_pin\"); } catch (e) {}", "");
  }
  if (kind === "wrong-code 401") {
    return html.replace(
      "if (loginRes.status >= 400 || loginData.ok === false) {\n            banner.textContent = (loginData && loginData.error) || \"Desk code does not match.\";\n            paintGate();\n            return;\n          }",
      ""
    );
  }
  return html;
}

function memStore(seed) {
  const m = Object.assign({}, seed || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? String(m[k]) : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    _raw: m
  };
}
function makeClassList() {
  const set = {};
  return {
    add: function (c) { set[c] = true; },
    remove: function (c) { delete set[c]; },
    contains: function (c) { return !!set[c]; },
    toggle: function (c, on) {
      if (on === false) delete set[c];
      else if (on === true) set[c] = true;
      else if (set[c]) delete set[c];
      else set[c] = true;
      return !!set[c];
    }
  };
}
function makeEl(id) {
  return {
    id: id,
    value: "",
    textContent: "",
    innerHTML: "",
    hidden: false,
    style: {},
    classList: makeClassList(),
    setAttribute: function (k, v) { this._attrs = this._attrs || {}; this._attrs[k] = v; },
    getAttribute: function (k) { return (this._attrs && this._attrs[k]) || null; },
    addEventListener: function (type, fn) {
      this._on = this._on || {};
      this._on[type] = this._on[type] || [];
      this._on[type].push(fn);
    },
    closest: function () { return null; },
    replaceChildren: function () { this.innerHTML = ""; this._kids = []; },
    appendChild: function (c) { this._kids = this._kids || []; this._kids.push(c); },
    querySelector: function () { return null; }
  };
}
function extractRulesScript(html) {
  const m = html.match(/<script src="escape-html\.js"><\/script>\s*<script>([\s\S]*?)<\/script>/);
  return m ? m[1] : "";
}
function headerOf(headers, name) {
  if (!headers) return "";
  const keys = Object.keys(headers);
  for (let i = 0; i < keys.length; i++) {
    if (String(keys[i]).toLowerCase() === name.toLowerCase()) return String(headers[keys[i]] || "");
  }
  return "";
}
function bootRules(html, seed, opts) {
  const store = memStore(seed);
  const fetches = [];
  const els = {};
  function el(id) {
    if (!els[id]) els[id] = makeEl(id);
    return els[id];
  }
  ["ws", "pin", "banner", "gate", "session", "who-line", "nav-drop", "head-drop", "rule-list", "rule-add", "rule-hint", "noun-hint", "noun-save", "noun-capture", "noun-qualify", "noun-do", "noun-collect", "noun-follow", "widget-count", "desk-ais", "rule-text", "rule-when", "rule-then"].forEach(el);
  if (opts && opts.wsValue != null) el("ws").value = opts.wsValue;
  if (opts && opts.pinValue != null) el("pin").value = opts.pinValue;
  const statusOf = (opts && opts.loginStatus != null) ? opts.loginStatus : 200;
  const loginBody = (opts && opts.loginBody) || {
    ok: true,
    session: { token: "sess-rules-1" },
    you: { name: "Owner", role: "owner" },
    workspace: { slug: "rivera-resale", biz: "Rivera Resale", name: "Rivera Resale", nouns: { capture: "Capture", qualify: "Qualify", do: "Do", collect: "Collect", follow: "Follow" } }
  };
  const ctx = {
    Promise: Promise,
    JSON: JSON,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Date: Date,
    Error: Error,
    Math: Math,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    console: console,
    localStorage: store,
    location: { search: "", href: "http://127.0.0.1/rules" },
    document: {
      getElementById: function (id) { return el(id); },
      createElement: function (tag) { return makeEl(tag); },
      addEventListener: function () {}
    },
    fetch: function (url, init) {
      const method = ((init && init.method) || "GET").toUpperCase();
      fetches.push({ url: String(url), headers: (init && init.headers) || {}, body: init && init.body, method: method });
      let status = 200;
      let body = {};
      if (String(url).indexOf("/api/auth") >= 0 && method === "POST") {
        let action = "";
        try { action = (JSON.parse((init && init.body) || "{}") || {}).action; } catch (e) {}
        if (action === "login") {
          status = statusOf;
          body = status >= 400 ? (opts && opts.loginBody) || { ok: false, error: "Shop name or desk code does not match" } : loginBody;
        } else {
          body = { ok: true };
        }
      } else if (String(url).indexOf("/api/auth") >= 0) {
        body = {
          you: { name: "Owner", role: "owner" },
          workspace: { slug: "rivera-resale", biz: "Rivera Resale", nouns: { capture: "Capture", qualify: "Qualify", do: "Do", collect: "Collect", follow: "Follow" } }
        };
      } else if (String(url).indexOf("/api/rules") >= 0) {
        body = { rules: [], ais: [], canAdd: true, nouns: { capture: "Capture", qualify: "Qualify", do: "Do", collect: "Collect", follow: "Follow" }, widgetsOn: 0 };
      }
      return Promise.resolve({
        ok: status < 400,
        status: status,
        json: function () { return Promise.resolve(body); }
      });
    }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  const deskSwitch = fs.readFileSync(path.join(__dirname, "..", "desk-switch.js"), "utf8");
  const src = extractRulesScript(html);
  vm.runInNewContext(deskSwitch + "\n" + src, ctx, { timeout: 4000 });
  let wait = Promise.resolve();
  for (let i = 0; i < 16; i++) wait = wait.then(function () { return Promise.resolve(); });
  return wait
    .then(function () {
      if (ctx.load && opts && opts.reload) return ctx.load();
    })
    .then(function () { return Promise.resolve(); })
    .then(function () {
      return {
        store: store,
        fetches: fetches,
        els: els,
        ctx: ctx,
        shopOpen: !!(ctx.AIADesks && ctx.AIADesks.shopOpen && ctx.AIADesks.shopOpen())
      };
    });
}

async function runRulesPinTests(rulesPage) {
  const liveFaults = rulesFaults(rulesPage);
  if (liveFaults.length) fail("rules.html leftover desk code faults: " + liveFaults.join("; "));
  else pass("rules.html keeps a leftover desk code out of storage after Open");
  if (!/\btype="password"/.test(rulesPinTag(rulesPage)) || !/\bautocomplete="current-password"/.test(rulesPinTag(rulesPage))) {
    fail("rules.html Open desk code field must be type=password autocomplete=current-password");
  } else pass("rules.html Open desk code field is masked");

  ["field type=text", "pin stored", "wrong-code 401"].forEach(function (kind) {
    const faults = rulesFaults(applyRulesMutant(rulesPage, kind));
    if (faults.indexOf(kind) < 0) fail("rules leftover-pin mutant survived: " + kind);
    else pass("rules leftover-pin mutant caught: " + kind);
  });

  const openOk = await bootRules(rulesPage, {}, { wsValue: "Rivera Resale", pinValue: "4821" });
  const loginPosts = openOk.fetches.filter(function (f) {
    if (f.method !== "POST" || String(f.url).indexOf("/api/auth") < 0) return false;
    try { return (JSON.parse(f.body || "{}") || {}).action === "login"; } catch (e) { return false; }
  });
  if (!loginPosts.length) fail("rules Open must POST /api/auth action=login");
  else pass("rules Open POSTs /api/auth action=login");
  const login = loginPosts[0];
  let loginBody = {};
  try { loginBody = JSON.parse(login.body || "{}") || {}; } catch (e) {}
  if (loginBody.workspace !== "rivera-resale" || loginBody.pin !== "4821" || headerOf(login.headers, "X-Workspace") !== "rivera-resale") {
    fail("rules Open login must send workspace, pin, and X-Workspace");
  } else pass("rules Open login sends workspace, pin, and X-Workspace");
  if (openOk.store.getItem("aia_pin")) fail("rules Open must not store aia_pin, got " + openOk.store.getItem("aia_pin"));
  else pass("rules Open does not store aia_pin");
  if (openOk.store.getItem("aia_session") !== "sess-rules-1") fail("rules Open must keep the returned session");
  else pass("rules Open keeps the returned session");
  if (!openOk.shopOpen) fail("shopOpen must be true after rules Open with a session");
  else pass("shopOpen is true after rules Open");
  if (openOk.els.pin.value) fail("rules Open must clear the desk code field");
  else pass("rules Open clears the desk code field");
  if (openOk.els.gate && !openOk.els.gate.hidden) fail("rules gate must hide after Open");
  else pass("rules gate hides after Open");
  const afterLogin = openOk.fetches.filter(function (f) {
    return String(f.url).indexOf("/api/rules") >= 0;
  });
  if (!afterLogin.length) fail("rules Open must still GET /api/rules after login");
  else if (afterLogin.some(function (f) { return headerOf(f.headers, "X-Pin"); })) {
    fail("rules /api/rules after Open must not send a leftover desk code as X-Pin");
  } else if (afterLogin.every(function (f) { return headerOf(f.headers, "X-Session") !== "sess-rules-1" || headerOf(f.headers, "X-Workspace") !== "rivera-resale"; })) {
    fail("rules /api/rules after Open must send X-Session and X-Workspace");
  } else pass("rules /api/rules after Open uses the session and x-workspace only");

  const leftover = await bootRules(rulesPage, {
    aia_desks: JSON.stringify([{ slug: "rivera-resale", name: "Rivera Resale", pin: "6612" }])
  }, { wsValue: "Rivera Resale", pinValue: "4821" });
  if (leftover.store.getItem("aia_pin")) fail("rules Open must drop a leftover aia_pin");
  else pass("rules Open drops a leftover aia_pin");
  let leftoverDesks = [];
  try { leftoverDesks = JSON.parse(leftover.store.getItem("aia_desks") || "[]"); } catch (e) { leftoverDesks = []; }
  if (leftoverDesks.some(function (d) { return d && d.slug === "rivera-resale" && "pin" in d; })) {
    fail("rules Open must strip a leftover aia_desks pin");
  } else pass("rules Open strips a leftover aia_desks pin");

  const sessionBoot = await bootRules(rulesPage, { aia_ws: "rivera-resale", aia_session: "sess-live", aia_desk_name: "Rivera Resale" }, { wsValue: "rivera-resale" });
  if (sessionBoot.fetches.some(function (f) {
    try { return f.method === "POST" && (JSON.parse(f.body || "{}") || {}).action === "login"; } catch (e) { return false; }
  })) fail("rules leftover session boot must not POST login without a typed code");
  else pass("rules leftover session boot does not POST login");
  if (!sessionBoot.fetches.some(function (f) { return String(f.url).indexOf("/api/rules") >= 0 && headerOf(f.headers, "X-Session") === "sess-live" && !headerOf(f.headers, "X-Pin"); })) {
    fail("rules leftover session boot must GET /api/rules with X-Session and no X-Pin");
  } else pass("rules leftover session boot GETs /api/rules with the session only");
  if (!sessionBoot.shopOpen) fail("shopOpen must be true for a leftover session on /rules");
  else pass("shopOpen is true for a leftover session on /rules");

  const denied = await bootRules(rulesPage, {}, {
    wsValue: "Rivera Resale",
    pinValue: "0000",
    loginStatus: 401,
    loginBody: { ok: false, error: "Shop name or desk code does not match" }
  });
  if (denied.store.getItem("aia_pin") || denied.store.getItem("aia_session")) {
    fail("wrong-code rules Open must not write a session or pin");
  } else pass("wrong-code rules Open does not write a session or pin");
  if (denied.shopOpen) fail("shopOpen must stay false after a wrong desk code");
  else pass("shopOpen stays false after a wrong desk code");
  if (!/does not match/i.test(denied.els.banner.textContent || "")) {
    fail("wrong-code rules Open must show the 401 error, got " + (denied.els.banner.textContent || ""));
  } else pass("wrong-code rules Open shows the 401 error");
  if (denied.fetches.some(function (f) { return String(f.url).indexOf("/api/rules") >= 0; })) {
    fail("wrong-code rules Open must not continue to /api/rules");
  } else pass("wrong-code rules Open does not continue to /api/rules");

  const storedMutant = await bootRules(applyRulesMutant(rulesPage, "pin stored"), {}, { wsValue: "Rivera Resale", pinValue: "4821" });
  if (storedMutant.store.getItem("aia_pin") !== "4821") fail("pin stored mutant must write aia_pin");
  else pass("pin stored mutant still caught on Open");

  const codeMutant = await bootRules(applyRulesMutant(rulesPage, "wrong-code 401"), {}, {
    wsValue: "Rivera Resale",
    pinValue: "0000",
    loginStatus: 401,
    loginBody: { ok: false, error: "Shop name or desk code does not match" }
  });
  if (!codeMutant.fetches.some(function (f) { return String(f.url).indexOf("/api/rules") >= 0; })) {
    fail("wrong-code 401 mutant must still proceed to /api/rules");
  } else pass("wrong-code 401 mutant still caught on Open");
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

  const queuePin = "2468";
  ["desk-alpha", "desk-beta"].forEach(function (slugName) {
    const row = { slug: slugName, name: slugName, biz: slugName, pin: hashPin(queuePin), people: [] };
    ensurePeople(row);
    mem.workspaces.unshift(row);
  });
  const capA = await call(jobsHandler, "POST", { "x-workspace": "desk-alpha" }, { action: "capture", title: "Alpha only" });
  const capB = await call(jobsHandler, "POST", { "x-workspace": "desk-beta" }, { action: "capture", title: "Beta only" });
  if (capA.statusCode !== 201 || capB.statusCode !== 201) fail("capture A/B should 201");
  const getA = await call(jobsHandler, "GET", { "x-workspace": "desk-alpha", "x-pin": queuePin });
  const getB = await call(jobsHandler, "GET", { "x-workspace": "desk-beta", "x-pin": queuePin });
  if (getA.statusCode !== 200 || getB.statusCode !== 200) fail("seated GET A/B should 200, got " + getA.statusCode + "/" + getB.statusCode);
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
    pin: ownerPin
  });
  if (opened.statusCode !== 201) fail("email-rules open should 201, got " + opened.statusCode);
  // No email at open: the desk code's one first claim sets email + password together (#370).
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
  if (rulesPage.indexOf("owner taps No") >= 0 || rulesPage.indexOf("taps No") >= 0) {
    fail("rules.html Then still says owner taps No");
  } else pass("rules.html Then does not say taps No");
  if (rulesPage.indexOf("Stop — owner taps Stop") < 0) fail("rules.html Then must name Stop");
  else pass("rules.html Then is Stop — owner taps Stop");

  const yesNo = fs.readFileSync(path.join(__dirname, "..", "ACCOUNT-YES-NO.md"), "utf8");
  const packMd = fs.readFileSync(path.join(__dirname, "..", "PACK.md"), "utf8");
  if (yesNo.indexOf("Rules session leftover after that pass") < 0) fail("ACCOUNT-YES-NO must record the Rules session leftover");
  else pass("ACCOUNT-YES-NO names Rules session leftover");
  if (yesNo.indexOf("Open Stop leftover after that pass") < 0) fail("ACCOUNT-YES-NO must record the Open Stop leftover");
  else pass("ACCOUNT-YES-NO names Open Stop leftover");
  if (packMd.indexOf("Rules session leftover:") < 0) fail("PACK.md must record the Rules session leftover");
  else pass("PACK.md names Rules session leftover");
  if (packMd.indexOf("Open Stop leftover:") < 0) fail("PACK.md must record the Open Stop leftover");
  else pass("PACK.md names Open Stop leftover");

  await runRulesPinTests(rulesPage);
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
