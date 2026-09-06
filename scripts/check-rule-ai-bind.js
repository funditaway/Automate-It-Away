#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const store = path.join(os.tmpdir(), "aia-rule-ai-bind-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

delete global.__aia;
delete global.__aiaHydrate;

const root = path.join(__dirname, "..");
const ais = require("../api/_ais");
const lib = require("../api/_lib");
const { qualifyJob } = require("../api/_engine");
const rulesHandler = require("../api/rules");
const { mem, hashPin, ensurePeople, ready } = lib;

let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

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
async function call(handler, method, headers, body) {
  const res = mockRes();
  await handler({ method: method, headers: headers || {}, body: body || {}, query: {} }, res);
  return res;
}

const rulesHtml = fs.readFileSync(path.join(root, "rules.html"), "utf8");
const engineSrc = fs.readFileSync(path.join(root, "api/_engine.js"), "utf8");
const libSrc = fs.readFileSync(path.join(root, "api/_lib.js"), "utf8");
const rulesSrc = fs.readFileSync(path.join(root, "api/rules.js"), "utf8");
const yesNo = fs.readFileSync(path.join(root, "ACCOUNT-YES-NO.md"), "utf8");
const help = fs.readFileSync(path.join(root, "help.html"), "utf8");

["api/rules.js", "api/_engine.js", "api/_lib.js"].forEach(function (name) {
  const syntax = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
  if (syntax.status !== 0) fail(name + " must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
  else pass(name + " parses");
});

["rule-ai", "paintAiPick", "Then · named desk AI", "Any desk AI that can draft", "Nothing sent alone"].forEach(function (bit) {
  if (rulesHtml.indexOf(bit) < 0) fail("rules.html missing " + bit);
  else pass("rules.html " + bit);
});
if (!/esc\(a\.name/.test(rulesHtml)) fail("rules.html must esc AI option names");
else pass("rules.html esc AI names");
if (/oauth|spacex|login\.x\.ai|custodial wallet|Collect charge/i.test(rulesHtml + rulesSrc + engineSrc)) {
  fail("Rules Then bind invented Grok OAuth / wallet / Collect charge");
} else pass("no OAuth / wallet / Collect charge");

if (!/aiId/.test(libSrc) || !/aiName/.test(libSrc)) fail("_lib publicRule must keep aiId / aiName");
else pass("publicRule keeps aiId / aiName");
if (!/bindRuleAi/.test(rulesSrc) || !/No desk AI by that name/.test(rulesSrc)) {
  fail("rules.js must resolve a named desk AI on save");
} else pass("rules.js binds named AI");
if (!/rule\.aiId/.test(engineSrc) || !/That named desk AI is not on this desk/.test(engineSrc)) {
  fail("_engine Then draft must honor rule AI and gone-AI honesty");
} else pass("engine Then uses rule AI");
if (help.indexOf("owner picks which on Rules") < 0 && help.indexOf("Owner picks which bot writes matching cards") < 0) {
  fail("help must name Rules Then bind");
} else pass("help names Rules Then bind");
if (yesNo.indexOf("check-rule-ai-bind.js") < 0) fail("ACCOUNT-YES-NO must record Rules Then bind");
else pass("ACCOUNT-YES-NO records bind");

async function main() {
  await ready();
  const slug = "rule-ai-desk";
  const ownerPin = "4821";
  const staffPin = "7390";
  const shop = {
    slug: slug,
    name: "Bind Shop",
    biz: slug,
    pin: hashPin(ownerPin),
    createdAt: new Date().toISOString(),
    people: [],
    rules: []
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
  ais.attachAisToDesk(shop, [
    {
      name: "James’s AI",
      role: "Doer",
      does: "Draft the lead packet",
      prompt: "Ask who it is for and when. Do not send.",
      steps: ["qualify", "do"]
    },
    {
      name: "Shop Bot",
      role: "Worker",
      does: "Qualify the click",
      prompt: "Name the shop and the click. Do not send.",
      steps: ["qualify", "do"]
    }
  ]);
  mem.workspaces.unshift(shop);

  const owner = { "x-workspace": slug, "x-pin": ownerPin };
  const staff = { "x-workspace": slug, "x-pin": staffPin };

  const get1 = await call(rulesHandler, "GET", owner);
  if (get1.statusCode !== 200 || !Array.isArray(get1.body.ais) || get1.body.ais.length < 2) {
    fail("GET rules should list desk AIs, got " + JSON.stringify(get1.body && get1.body.ais));
  } else pass("GET rules lists desk AIs");

  const ghost = await call(rulesHandler, "POST", owner, {
    text: "Click → ghost drafts HOLD.",
    when: "drop",
    then: "draft",
    contains: "click",
    ai: "Missing Bot"
  });
  if (ghost.statusCode !== 400 || !/No desk AI/i.test((ghost.body && ghost.body.error) || "")) {
    fail("unknown AI should 400, got " + ghost.statusCode + " " + JSON.stringify(ghost.body));
  } else pass("unknown AI 400");

  const staffBind = await call(rulesHandler, "POST", staff, {
    text: "Click → Shop Bot drafts HOLD.",
    when: "drop",
    then: "draft",
    contains: "click",
    ai: "Shop Bot"
  });
  if (staffBind.statusCode !== 403) fail("helper bind should 403, got " + staffBind.statusCode);
  else pass("helper cannot bind Then AI");

  const add = await call(rulesHandler, "POST", owner, {
    text: "Click → Shop Bot drafts HOLD.",
    when: "drop",
    then: "draft",
    contains: "click",
    ai: "Shop Bot"
  });
  if (add.statusCode !== 201 || !add.body.rule) fail("owner bind add failed " + add.statusCode + " " + JSON.stringify(add.body));
  else if (add.body.rule.aiName !== "Shop Bot" || !add.body.rule.aiId) {
    fail("saved rule must name Shop Bot, got " + JSON.stringify(add.body.rule));
  } else pass("owner binds Shop Bot on Then");

  const get2 = await call(rulesHandler, "GET", owner);
  const stored = ((get2.body && get2.body.rules) || []).find(function (r) { return r.text === "Click → Shop Bot drafts HOLD."; });
  if (!stored || stored.aiName !== "Shop Bot") fail("GET lost Then AI bind");
  else pass("GET returns Then AI bind");

  const card = qualifyJob({
    title: "They clicked",
    notes: "click from the lane",
    from: "drop",
    workspace: slug
  }, shop);
  if (!card.deskAi || card.deskAi.name !== "Shop Bot") {
    fail("Then draft must use bound Shop Bot, got " + JSON.stringify(card.deskAi));
  } else pass("Then draft uses bound Shop Bot");
  if (!/Name the shop and the click/i.test(card.draft || "")) {
    fail("Then draft must use Shop Bot prompt, got " + JSON.stringify(card.draft));
  } else pass("card draft is Shop Bot");
  if (/Ask who it is for and when/i.test(card.draft || "")) fail("first-eligible James must not win over Then bind");
  else pass("first-eligible James did not win");
  if (!/HOLD/i.test(card.draft || "") && !/HOLD/i.test(card.next || "")) fail("bound Then must stay HOLD");
  else pass("bound Then stays HOLD");
  if (card.status === "shipped" || card.charged) fail("bound Then must not ship or charge");
  else pass("nothing left the desk");

  const keep = qualifyJob({
    title: "They clicked",
    notes: "click from the lane",
    from: "drop",
    draft: "Owner already wrote this. Do not wipe.",
    workspace: slug
  }, shop);
  if (!/Owner already wrote this/i.test(keep.draft || "")) fail("incoming Drop draft must stay");
  else if (keep.deskAi && keep.deskAi.name !== "Shop Bot") fail("incoming Drop should still stamp Shop Bot");
  else pass("incoming draft kept + Shop Bot stamped");

  const goneShop = {
    slug: "gone-ai",
    rules: [{
      text: "Click → missing drafts HOLD.",
      when: "drop",
      contains: "click",
      then: "draft",
      aiId: "shop-bot",
      aiName: "Shop Bot"
    }],
    ais: [],
    people: []
  };
  ais.attachAisToDesk(goneShop, [{
    name: "James’s AI",
    role: "Doer",
    does: "Draft the lead packet",
    prompt: "Ask who it is for and when. Do not send.",
    steps: ["qualify", "do"]
  }]);
  const gone = qualifyJob({
    title: "They clicked",
    notes: "click from the lane",
    from: "drop",
    workspace: "gone-ai"
  }, goneShop);
  if (gone.deskAi && /James/.test(gone.deskAi.name || "") && /Ask who it is for and when/i.test(gone.draft || "")) {
    fail("gone bound AI must not pretend James wrote Then: " + JSON.stringify({ deskAi: gone.deskAi, draft: gone.draft, next: gone.next }));
  } else if (!/HOLD/i.test(gone.draft || "") && !/HOLD/i.test(gone.next || "")) {
    fail("gone bound AI must still HOLD");
  } else pass("gone bound AI stays HOLD without a fake name");

  const anyShop = {
    slug: "any-ai",
    rules: [{ text: "Click → any drafts HOLD.", when: "drop", contains: "click", then: "draft" }],
    ais: [],
    people: []
  };
  ais.attachAisToDesk(anyShop, [{
    name: "James’s AI",
    role: "Doer",
    does: "Draft the lead packet",
    prompt: "Ask who it is for and when. Do not send.",
    steps: ["qualify", "do"]
  }]);
  const any = qualifyJob({
    title: "They clicked",
    notes: "click from the lane",
    from: "drop",
    workspace: "any-ai"
  }, anyShop);
  if (!any.deskAi || !/James/.test(any.deskAi.name || "")) fail("unbound Then should still pick an eligible desk AI");
  else pass("unbound Then still picks an eligible AI");

  const clear = await call(rulesHandler, "POST", owner, {
    action: "update",
    id: stored.id,
    ai: ""
  });
  if (clear.statusCode !== 200 || (clear.body.rule && clear.body.rule.aiName)) {
    fail("owner should be able to clear Then AI, got " + clear.statusCode + " " + JSON.stringify(clear.body && clear.body.rule));
  } else pass("owner can clear Then AI");

  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-rule-ai-bind ok");
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
