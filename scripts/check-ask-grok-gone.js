#!/usr/bin/env node
"use strict";
require("./_env-guard");

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
const moreTips = more + "\n" + read("aia-tip.js");
const yesNo = read("ACCOUNT-YES-NO.md");
const pkg = read("package.json");

// a2ad8c4 (#265) minified desk-needs.js. Names like namedAskWho / askGrokLabel /
// thenGone / bindAiHtml were shortened; window.card still paints
// "Ask the desk · Shop Bot · not on this desk" and does not first-eligible James.
["not on this desk", "HOLD ask", "Gone bind HOLDs", "Ask the desk · "].forEach(function (bit) {
  if (needs.indexOf(bit) < 0) fail("desk-needs.js missing " + bit);
  else pass("desk-needs.js " + bit);
});
function askGoneSourceFaults(src) {
  const bad = [];
  if (src.indexOf("Ask the desk · ") < 0) bad.push("missing Ask the desk · ");
  if (src.indexOf(" · not on this desk") < 0) bad.push("missing · not on this desk");
  if (src.indexOf("thenAiGone") < 0) bad.push("missing thenAiGone");
  if (src.indexOf("window.bindAiHtml") < 0) bad.push("missing window.bindAiHtml");
  if (src.indexOf("window.helpWithAi") < 0) bad.push("missing window.helpWithAi");
  return bad;
}
(function () {
  const bad = askGoneSourceFaults(needs);
  if (bad.length) fail("named Ask gone HOLD must stay in desk-needs.js: " + bad.join("; "));
  else pass("named Ask gone HOLD still lives in desk-needs.js");
})();
if (/thenWho\(j\)\s*\|\|\s*\(\(primaryAi\(\)/.test(needs)) {
  fail("namedAskWho must not first-eligible thenWho || primaryAi()");
} else pass("namedAskWho does not first-eligible to primaryAi");
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
// a66b146 shortened more-queue. Gone-AI honesty stays as:
// "If a named desk AI is not on this desk, the card says so."
function moreQueueAskFaults(src) {
  const bad = [];
  if (src.indexOf("If a named desk AI is not on this desk, the card says so.") < 0) {
    bad.push("missing gone-AI honesty");
  }
  return bad;
}
(function () {
  const bad = moreQueueAskFaults(moreTips);
  if (bad.length) fail("more Queue tip must stay honest about gone Ask / bind: " + bad.join("; "));
  else pass("more Queue tip names gone Ask / bind honesty");
})();
if (more.indexOf('data-aia-tip="more-queue"') < 0) fail("more.html must wire more-queue tip");
else pass("more.html wires more-queue tip");
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
if (goneCard.indexOf("Ask the desk") < 0) fail("gone waiting card with no draft must still show Ask the desk");
else pass("gone card still shows Ask the desk");
if (goneCard.indexOf("Ask the desk · James") >= 0 || /Ask the desk[^<]*James/.test(goneCard)) {
  fail("gone Ask the desk must not first-eligible to James: " + goneCard.match(/Ask the desk[^<]*/));
} else pass("gone Ask the desk does not name James");
if (goneCard.indexOf("Ask the desk · Shop Bot · not on this desk") < 0) {
  fail("gone Ask the desk must hold Shop Bot · not on this desk");
} else pass("gone Ask the desk holds Shop Bot");
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
if (/James/.test(xss) && xss.indexOf("Ask the desk · James") >= 0) fail("xss gone card named James");
else pass("xss gone card does not first-eligible James");

const live = ctx.card({
  id: "j-live",
  status: "waiting",
  title: "Oak dresser",
  deskAi: { name: "Shop Bot", does: "Qualify the click" }
}, false);
if (live.indexOf("Ask the desk · Shop Bot") < 0) fail("live bind must still name Shop Bot on Ask the desk");
else pass("live bind still names Shop Bot");
if (/Ask the desk · James/.test(live)) fail("live Shop Bot must not first-eligible James");
else pass("live bind does not name James");

const unbound = ctx.card({
  id: "j-any",
  status: "waiting",
  title: "Oak dresser"
}, false);
if (unbound.indexOf("Ask the desk · James") < 0) fail("unbound Ask the desk must still name the live primary");
else pass("unbound Ask the desk still names primary");

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
if (ownerGone.indexOf("Ask the desk · Shop Bot · not on this desk") < 0) fail("owner gone Ask the desk must still hold Shop Bot");
else pass("owner gone Ask the desk holds Shop Bot");
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

  const bot = {
    id: "ai_login",
    name: "James’s AI",
    role: "agent",
    kind: "agent",
    deskAi: true,
    status: "approved",
    pin: hashPin("9999")
  };
  shop.people.push(bot);
  const deskAiYes = await call(jobsHandler, "POST", { "x-workspace": slug, "x-pin": "9999" }, {
    action: "ship",
    id: card.id,
    confirm: true,
    whoTapped: "James’s AI"
  });
  if (deskAiYes.statusCode !== 403) fail("desk AI still cannot Yes on a gone Ask bind, got " + deskAiYes.statusCode);
  else pass("desk AI still cannot Yes on a gone Ask bind");

  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
}

function askGonePaintFaults(html) {
  const bad = [];
  if (!html) { bad.push("no card html"); return bad; }
  if (html.indexOf("Ask the desk · Shop Bot") < 0) bad.push("missing Ask the desk · Shop Bot");
  if (html.indexOf(" · not on this desk") < 0) bad.push("missing · not on this desk");
  if (html.indexOf("q-ai-gone") < 0) bad.push("missing q-ai-gone");
  if (/Ask the desk · James/.test(html)) bad.push("named James");
  return bad;
}

function paintFrom(src, job) {
  if (!src) return null;
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
  try { vm.runInNewContext(src, ctx); } catch (e) { return "threw " + e.message; }
  if (typeof ctx.card !== "function") return "no window.card";
  ctx.AIADeskAis = {
    owner: true,
    rows: [
      { id: "james-s-ai", name: "James’s AI", does: "Draft the lead packet" },
      { id: "lane-bot", name: "Lane Bot", does: "Watch the lane" }
    ],
    primary: function () { return this.rows[0]; }
  };
  return ctx.card(job || {
    id: "j-mut",
    status: "waiting",
    title: "Oak dresser",
    thenAiGone: { id: "shop-bot", name: "Shop Bot" }
  }, false);
}

async function main() {
  await banners();
  await apiPath();

  const capCtx = paintCtx();
  if (typeof capCtx.capCardHtml === "function") {
    const capHtml = capCtx.capCardHtml({
      id: "j-gone-cap",
      status: "waiting",
      title: "Oak dresser",
      thenAiGone: { id: "shop-bot", name: "Shop Bot <gone>" }
    }, "shop");
    if (capHtml.indexOf("Shop Bot &lt;gone&gt; · not on this desk") < 0) fail("Cap must paint Shop Bot · not on this desk");
    else if (capHtml.indexOf("q-ai-gone") < 0) fail("Cap must use q-ai-gone");
    else if (/>Yes</.test(capHtml)) fail("Cap gone-Ask card must not show Yes");
    else if (/Ask the desk · James/.test(capHtml)) fail("Cap gone-Ask must not first-eligible James");
    else pass("Cap paints gone Ask HOLD and does not Yes");
  } else fail("window.capCardHtml must stay exported");

  const livePaint = askGonePaintFaults(goneCard);
  if (livePaint.length) fail("queue Ask card must paint gone HOLD: " + livePaint.join("; "));
  else pass("queue Ask card paints Ask the desk · Shop Bot · not on this desk");

  // Mutants for the replaced assertions. In-memory only.
  function swap(str, from, to) { return str.indexOf(from) < 0 ? null : str.split(from).join(to); }
  const MUTANTS = [
    ["ask source loses Ask the desk · ", function () {
      const n = swap(needs, "Ask the desk · ", "Ask the helper · ");
      return n && askGoneSourceFaults(n);
    }],
    ["ask source loses · not on this desk", function () {
      const n = swap(needs, " · not on this desk", " · left this desk");
      return n && askGoneSourceFaults(n);
    }],
    ["ask source loses window.bindAiHtml", function () {
      const n = swap(needs, "window.bindAiHtml", "window.bindAiOff");
      return n && askGoneSourceFaults(n);
    }],
    ["ask source loses window.helpWithAi", function () {
      const n = swap(needs, "window.helpWithAi", "window.helpOff");
      return n && askGoneSourceFaults(n);
    }],
    ["more-queue tip drops gone-AI honesty", function () {
      const n = swap(moreTips, "If a named desk AI is not on this desk, the card says so.", "The queue just runs.");
      return n && moreQueueAskFaults(n);
    }],
    ["queue card drops the gone-AI line", function () {
      const n = swap(needs, " · not on this desk", " · left this desk");
      const html = paintFrom(n);
      if (html == null) return null;
      if (typeof html !== "string") return [String(html)];
      return askGonePaintFaults(html);
    }],
    ["queue card drops q-ai-gone", function () {
      const n = swap(needs, "q-ai-gone", "q-ai-miss");
      const html = paintFrom(n);
      if (html == null) return null;
      if (typeof html !== "string") return [String(html)];
      return askGonePaintFaults(html);
    }]
  ];
  let mutCaught = 0;
  MUTANTS.forEach(function (m) {
    let out;
    try { out = m[1](); } catch (e) { out = ["threw " + e.message]; }
    if (out === null || out === false || out === undefined) fail("mutant does not apply: " + m[0]);
    else if (out.length) { mutCaught += 1; pass("mutant caught: " + m[0] + " (" + out[0] + ")"); }
    else fail("mutant survived: " + m[0]);
  });
  pass("mutants: " + mutCaught + "/" + MUTANTS.length + " caught");
  if (mutCaught !== MUTANTS.length) fail("not every mutant was caught");

  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-ask-grok-gone mutants: " + mutCaught + "/" + MUTANTS.length + " caught");
  console.log("check-ask-grok-gone: ok");
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
