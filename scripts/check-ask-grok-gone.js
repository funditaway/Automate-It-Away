#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const vm = require("vm");

const root = path.join(__dirname, "..");

let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

["desk-needs.js"].forEach(function (name) {
  const syntax = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
  if (syntax.status !== 0) fail(name + " must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
  else pass(name + " parses");
});

const needs = read("desk-needs.js");
const help = read("help.html");
const more = read("more.html");
const yesNo = read("ACCOUNT-YES-NO.md");
const pkg = read("package.json");

["function namedAskWho", "function askGrokLabel", "function thenGone", "function bindAiHtml", "not on this desk", "HOLD ask", "Gone bind HOLDs"].forEach(function (bit) {
  if (needs.indexOf(bit) < 0) fail("desk-needs.js missing " + bit);
  else pass("desk-needs.js " + bit);
});
if (/thenWho\(j\)\s*\|\|\s*\(\(primaryAi\(\)/.test(needs)) {
  fail("namedAskWho must not first-eligible thenWho || primaryAi()");
} else pass("namedAskWho does not first-eligible to primaryAi");
const namedSrc = needs.slice(needs.indexOf("function namedAskWho"), needs.indexOf("function askGrokLabel"));
if (!/thenGone/.test(namedSrc)) fail("namedAskWho must consult thenGone before primaryAi");
else pass("namedAskWho consults thenGone");
const labelSrc = needs.slice(needs.indexOf("function askGrokLabel"), needs.indexOf("function jobOf"));
if (labelSrc.indexOf("goneHoldLabel") < 0 && labelSrc.indexOf("not on this desk") < 0) fail("askGrokLabel must paint gone HOLD");
else pass("askGrokLabel paints gone HOLD");
if (needs.indexOf("namedAskWho({ id: id })") >= 0 || needs.indexOf("namedAskWho({id:id})") >= 0) {
  fail("helpWithAi must not first-eligible namedAskWho({ id }) to primaryAi");
} else pass("helpWithAi uses the card, not { id }");
if (/oauth|spacex|login\.x\.ai|custodial wallet|Collect charge|silent send/i.test(needs)) {
  fail("Ask Grok gone HOLD invented Grok OAuth / wallet / Collect charge");
} else pass("no OAuth / wallet / Collect charge");
if (help.indexOf("Grok") >= 0) fail("help.html must not lecture Grok");
else pass("help.html does not lecture Grok");
if (help.indexOf("HOLD ask") < 0 || help.indexOf("does not name another live desk AI") < 0) {
  fail("help#desk-cards must name gone Ask HOLD");
} else pass("help names gone Ask HOLD");
if (help.indexOf("does not first-select another live desk AI") < 0) {
  fail("help#desk-cards must name gone bind picker HOLD");
} else pass("help names gone bind picker HOLD");
if (more.indexOf("HOLD ask") < 0 || more.indexOf("not on this desk") < 0) {
  fail("more.html Queue must name gone Ask HOLD");
} else pass("more.html names gone Ask HOLD");
if (more.indexOf("owner picker holds the same gone bind") < 0) {
  fail("more.html Queue must name gone bind picker HOLD");
} else pass("more.html names gone bind picker HOLD");
if (yesNo.indexOf("check-ask-grok-gone.js") < 0) fail("ACCOUNT-YES-NO must record Ask Grok gone HOLD");
else pass("ACCOUNT-YES-NO records Ask Grok gone HOLD");
if (pkg.indexOf("check-ask-grok-gone.js") < 0) fail("package.json must run check-ask-grok-gone");
else pass("package.json runs check-ask-grok-gone");

function paintCtx() {
  const ctx = {
    window: {},
    document: {
      readyState: "complete",
      addEventListener: function () {},
      getElementById: function () { return null; },
      createElement: function () { return { id: "", textContent: "" }; },
      head: { appendChild: function () {} }
    },
    setTimeout: function () {},
    localStorage: { getItem: function () { return ""; }, setItem: function () {} }
  };
  ctx.window = ctx;
  vm.runInNewContext(needs, ctx);
  ctx.AIADeskAis = {
    rows: [{ name: "James’s AI", does: "Draft the lead packet", prompt: "Ask who it is for and when. Do not send." }],
    primary: function () { return this.rows[0]; }
  };
  return ctx;
}

const ctx = paintCtx();
if (typeof ctx.card !== "function") fail("desk-needs.js must set window.card");
else pass("card() is on window");
if (typeof ctx.helpWithAi !== "function") fail("desk-needs.js must set window.helpWithAi");
else pass("helpWithAi is on window");

const goneCard = ctx.card({
  id: "j-gone-ask",
  status: "waiting",
  title: "Oak dresser",
  thenAiGone: { id: "shop-bot", name: "Shop Bot" }
}, false);
if (goneCard.indexOf("Ask Grok") < 0) fail("gone waiting card with no draft must still show Ask Grok");
else pass("gone card still shows Ask Grok");
if (goneCard.indexOf("Ask Grok · James") >= 0 || /Ask Grok[^<]*James/.test(goneCard)) {
  fail("gone Ask Grok must not first-eligible to James: " + goneCard.match(/Ask Grok[^<]*/));
} else pass("gone Ask Grok does not name James");
if (goneCard.indexOf("Ask Grok · Shop Bot · not on this desk") < 0) {
  fail("gone Ask Grok must hold Shop Bot · not on this desk");
} else pass("gone Ask Grok holds Shop Bot");
if (goneCard.indexOf("q-ai-gone") < 0 || goneCard.indexOf("not on this desk") < 0) {
  fail("gone card must still chip not on this desk");
} else pass("gone card chips not on this desk");
if (goneCard.indexOf(">Yes<") < 0 || goneCard.indexOf(">Kill<") < 0) fail("Yes / Stop / Kill must stay");
else pass("Yes / Stop / Kill stay");

const xss = ctx.card({
  id: "j-gone-xss",
  status: "waiting",
  title: "Need 2 < 3",
  thenAiGone: { id: "shop-bot", name: "Shop Bot <gone>" }
}, false);
if (xss.indexOf("Shop Bot <gone>") >= 0) fail("raw < in gone Ask Grok name must not become markup");
else if (xss.indexOf("Shop Bot &lt;gone&gt; · not on this desk") < 0) fail("gone Ask Grok name must stay text");
else pass("gone Ask Grok name stays text");
if (xss.indexOf("Need 2 &lt; 3") < 0) fail("gone title must stay text");
else pass("gone title stays text");
if (/James/.test(xss) && xss.indexOf("Ask Grok · James") >= 0) fail("xss gone card named James");
else pass("xss gone card does not first-eligible James");

const live = ctx.card({
  id: "j-live",
  status: "waiting",
  title: "Oak dresser",
  deskAi: { name: "Shop Bot", does: "Qualify the click" }
}, false);
if (live.indexOf("Ask Grok · Shop Bot") < 0) fail("live bind must still name Shop Bot on Ask Grok");
else pass("live bind still names Shop Bot");
if (/Ask Grok · James/.test(live)) fail("live Shop Bot must not first-eligible James");
else pass("live bind does not name James");

const unbound = ctx.card({
  id: "j-any",
  status: "waiting",
  title: "Oak dresser"
}, false);
if (unbound.indexOf("Ask Grok · James") < 0) fail("unbound Ask Grok must still name the live primary");
else pass("unbound Ask Grok still names primary");

function selectedLabel(html) {
  const m = String(html || "").match(/<option[^>]*\sselected[^>]*>([^<]*)<\/option>/i)
    || String(html || "").match(/<option[^>]*>([^<]*)<\/option>/i);
  return m ? m[1] : "";
}
function ownerCtx() {
  const run = paintCtx();
  run.AIADeskAis.owner = true;
  run.AIADeskAis.rows = [
    { id: "james-s-ai", name: "James’s AI", does: "Draft the lead packet", prompt: "Ask who it is for and when. Do not send." },
    { id: "lane-bot", name: "Lane Bot", does: "Watch the lane" }
  ];
  return run;
}
const ownerGone = ownerCtx().card({
  id: "j-gone-bind",
  status: "waiting",
  title: "Oak dresser",
  thenAiGone: { id: "shop-bot", name: "Shop Bot" }
}, false);
if (ownerGone.indexOf("q-ai-pick") < 0) fail("owner gone card must still show the desk AI picker");
else pass("owner gone card shows picker");
if (ownerGone.indexOf("Ask Grok · Shop Bot · not on this desk") < 0) fail("owner gone Ask Grok must still hold Shop Bot");
else pass("owner gone Ask Grok holds Shop Bot");
if (/<option[^>]*selected[^>]*>[^<]*James/.test(ownerGone) || /<option[^>]*James[^<]*selected/.test(ownerGone)) {
  fail("gone bind picker must not first-select James");
} else pass("gone bind picker does not first-select James");
const goneSel = selectedLabel(ownerGone);
if (goneSel.indexOf("not on this desk") < 0 || goneSel.indexOf("Shop Bot") < 0) {
  fail("gone bind picker must select Shop Bot · not on this desk, got " + goneSel);
} else pass("gone bind picker selects gone HOLD");
if (ownerGone.indexOf("James") < 0) fail("gone picker must still list the live primary as a choice");
else pass("gone picker still lists James as a choice");
if (ownerGone.indexOf("Gone bind HOLDs") < 0) fail("gone picker must say Gone bind HOLDs");
else pass("gone picker says Gone bind HOLDs");
if (ownerGone.indexOf(">Yes<") < 0 || ownerGone.indexOf(">Kill<") < 0) fail("owner gone card must keep Yes / Kill");
else pass("owner gone card keeps Yes / Kill");

const ownerXss = ownerCtx().card({
  id: "j-gone-bind-xss",
  status: "waiting",
  title: "Need 2 < 3",
  thenAiGone: { id: "shop-bot", name: "Shop Bot <gone>" }
}, false);
if (ownerXss.indexOf("Shop Bot <gone>") >= 0) fail("raw < in gone bind option must not become markup");
else if (ownerXss.indexOf("Shop Bot &lt;gone&gt; · not on this desk") < 0) fail("gone bind option must stay text");
else pass("gone bind option stays text");

const ownerLive = ownerCtx().card({
  id: "j-live-bind",
  status: "waiting",
  title: "Oak dresser",
  deskAi: { id: "lane-bot", name: "Lane Bot", does: "Watch the lane" }
}, false);
if (ownerLive.indexOf("q-ai-pick") < 0) fail("live owner card must still show the picker");
else pass("live owner card shows picker");
if (selectedLabel(ownerLive).indexOf("Lane Bot") < 0) fail("live bind picker must still select Lane Bot, got " + selectedLabel(ownerLive));
else pass("live bind picker still selects Lane Bot");
if (ownerLive.indexOf("not on this desk") >= 0) fail("live bind picker must not paint a gone HOLD option");
else pass("live bind picker has no gone HOLD option");
if (ownerLive.indexOf("Gone bind HOLDs") >= 0) fail("live bind must not say Gone bind HOLDs");
else pass("live bind keep-copy stays");

async function banners() {
  const banner = { textContent: "" };
  const calls = [];
  const run = paintCtx();
  run.document.getElementById = function (id) { return id === "banner" ? banner : null; };
  run.youName = "Pat";
  run.load = async function () { run._loaded = true; };
  run.openJob = function (id) { run._opened = id; };

  run.api = async function (path, opts) {
    calls.push({ path: path, opts: opts });
    return {
      status: 200,
      data: { ok: true, job: { id: "j-gone-ask", thenAiGone: { id: "shop-bot", name: "Shop Bot <gone>" } } }
    };
  };
  await run.helpWithAi("j-gone-ask");
  if (/James/.test(banner.textContent)) fail("gone recommend banner must not name James: " + banner.textContent);
  else pass("gone recommend banner does not name James");
  if (banner.textContent.indexOf("not on this desk") < 0 || banner.textContent.indexOf("HOLD ask") < 0) {
    fail("gone recommend banner must HOLD ask, got " + banner.textContent);
  } else pass("gone recommend banner HOLDs ask");
  if (banner.textContent.indexOf("Shop Bot") < 0) fail("gone recommend banner must name Shop Bot");
  else pass("gone recommend banner names Shop Bot");
  if (banner.textContent.indexOf("Nothing sent") < 0) fail("gone recommend banner must say nothing sent");
  else pass("gone recommend banner says nothing sent");
  if (run._opened !== "j-gone-ask") fail("helpWithAi should still open the card");
  else pass("helpWithAi still opens the card");

  banner.textContent = "";
  run.api = async function () {
    return { status: 200, data: { ok: true, job: { id: "j-live", deskAi: { name: "Shop Bot" } } } };
  };
  await run.helpWithAi("j-live");
  if (banner.textContent.indexOf("Shop Bot drafted on the card") < 0) fail("live recommend banner must name Shop Bot, got " + banner.textContent);
  else pass("live recommend banner names Shop Bot");
  if (/James/.test(banner.textContent)) fail("live Shop Bot banner must not name James");
  else pass("live recommend banner does not name James");

  banner.textContent = "";
  run.api = async function () {
    return { status: 200, data: { ok: true, job: { id: "j-any", draft: "Copy this. Yes or Stop." } } };
  };
  await run.helpWithAi("j-any");
  if (banner.textContent.indexOf("James") < 0) fail("unbound recommend banner must still name the live primary, got " + banner.textContent);
  else pass("unbound recommend banner still names primary");
  if (banner.textContent.indexOf("Nothing sent") < 0) fail("unbound recommend must say nothing sent");
  else pass("unbound recommend says nothing sent");
}

async function apiPath() {
  const store = path.join(os.tmpdir(), "aia-ask-grok-gone-" + Date.now() + ".json");
  process.env.AIA_STORE_PATH = store;
  delete global.__aia;
  delete global.__aiaHydrate;
  const ais = require("../api/_ais");
  const lib = require("../api/_lib");
  const jobsHandler = require("../api/jobs");
  const { mem, hashPin, ensurePeople, ready } = lib;

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

  await ready();
  const slug = "ask-grok-gone";
  const pin = "4821";
  const shop = {
    slug: slug,
    name: "Ask Gone",
    biz: slug,
    pin: hashPin(pin),
    createdAt: new Date().toISOString(),
    people: [],
    rules: [{
      text: "Click → Shop Bot drafts HOLD.",
      when: "drop",
      contains: "click",
      then: "draft",
      aiId: "shop-bot",
      aiName: "Shop Bot"
    }]
  };
  ensurePeople(shop);
  shop.people[0].name = "Pat";
  shop.people[0].pin = hashPin(pin);
  ais.attachAisToDesk(shop, [{
    name: "James’s AI",
    role: "Doer",
    does: "Draft the lead packet",
    prompt: "Ask who it is for and when. Do not send.",
    steps: ["qualify", "do"]
  }]);
  mem.workspaces.unshift(shop);
  const owner = { "x-workspace": slug, "x-pin": pin };
  const cap = await call(jobsHandler, "POST", owner, {
    action: "capture",
    title: "They clicked",
    notes: "click from the lane",
    from: "drop"
  });
  const card = cap.body && cap.body.job;
  if (cap.statusCode !== 201 || !card) fail("capture " + cap.statusCode);
  else pass("capture 201");
  const rec = await call(jobsHandler, "POST", owner, { action: "recommend", id: card.id, whoTapped: "Pat" });
  const recJob = rec.body && rec.body.job;
  if (rec.statusCode !== 200 || !recJob) fail("recommend " + rec.statusCode);
  else if (recJob.deskAi && /James/.test(recJob.deskAi.name || "")) fail("recommend must not stamp James on a gone bind");
  else if (!recJob.thenAiGone || recJob.thenAiGone.name !== "Shop Bot") fail("recommend must keep thenAiGone");
  else if (recJob.status === "shipped" || recJob.charged) fail("recommend must not ship or charge");
  else pass("recommend keeps gone-AI HOLD");

  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
}

async function main() {
  await banners();
  await apiPath();
  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-ask-grok-gone: ok");
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
