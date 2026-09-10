#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const vm = require("vm");

const root = path.join(__dirname, "..");

function fail(msg) {
  console.error("check-desk-grok: " + msg);
  process.exit(1);
}

const needs = fs.readFileSync(path.join(root, "desk-needs.js"), "utf8");
const nav = fs.readFileSync(path.join(root, "desk-nav.js"), "utf8");
const jobs = fs.readFileSync(path.join(root, "api/jobs.js"), "utf8");
const yesNo = fs.readFileSync(path.join(root, "ACCOUNT-YES-NO.md"), "utf8");
const grokSrc = fs.readFileSync(path.join(root, "api/_grok.js"), "utf8");
if (!grokSrc.includes("Human taps Yes or Stop.")) fail("grok SYSTEM must keep Human taps Yes or Stop");
if (grokSrc.includes("Human taps Yes or No.")) fail("grok SYSTEM still paints Yes or No");
if (grokSrc.includes("You draft for Automate It Away.")) fail("grok SYSTEM still opens as a generic MVP drafter");
if (!grokSrc.includes("You are a Desk AI for Automate It Away")) fail("grok SYSTEM must name Desk AI");
if (!grokSrc.includes("Desk AIs that draft. Humans that decide.")) fail("grok SYSTEM must keep the Desk AI tagline");
if (!grokSrc.includes("Draft ready. I cannot send, pay, or bind anything. You stay in control.")) {
  fail("grok SYSTEM must keep the firm draft-only line");
}
if (!grokSrc.includes("Collect stays HOLD")) fail("grok SYSTEM must keep Collect HOLD");
if (!grokSrc.includes("desk crew, not captains")) fail("grok SYSTEM must keep desk-crew roles");
if (!grokSrc.includes("using its does and prompt")) fail("grok SYSTEM must draft as the named Desk AI prompt");
if (!grokSrc.includes("function aiBrief")) fail("jobBrief must map named Desk AI prompt via aiBrief");
if (!grokSrc.includes("prompt: clip(a.prompt")) fail("jobBrief must pass named Desk AI prompt");
if (!grokSrc.includes("deskAi: bound")) fail("jobBrief must pass the bound deskAi");
if (!grokSrc.includes("not MVP demo bots")) fail("Studio SYSTEM must not seed MVP demo bots");
if (!grokSrc.includes("Fill ais[].does and ais[].prompt")) fail("Studio SYSTEM must fill Desk AI does / prompt with canon");
if (grokSrc.includes("Bots draft only.")) fail("grok SYSTEM still says Bots draft only");
if (!grokSrc.includes("Desk AIs draft only.")) fail("grok SYSTEM must say Desk AIs draft only");
if (!/Create \/ market \/ engine \/ grok leftover/.test(yesNo)) {
  fail("ACCOUNT-YES-NO must record Create / market / engine / grok leftover");
}
if (!/Desk AI canon leftover/.test(yesNo)) {
  fail("ACCOUNT-YES-NO must record Desk AI canon leftover");
}
if (!/Desk AI copy leftover/.test(yesNo)) {
  fail("ACCOUNT-YES-NO must record Desk AI copy leftover");
}
if (!grokSrc.includes("bots[]")) fail("Studio SYSTEM must keep bots[] alias");

const syntax = spawnSync(process.execPath, ["--check", path.join(root, "desk-needs.js")], { encoding: "utf8" });
if (syntax.status !== 0) fail("desk-needs.js must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));

if (!/function helpWithAi\s*\(\s*id\s*\)/.test(needs)) fail("desk-needs.js must define helpWithAi(id) for /desk.");
if (!/action:\s*["']recommend["']/.test(needs)) fail("helpWithAi must POST action recommend to /api/jobs.");
if (!/\/api\/jobs/.test(needs)) fail("helpWithAi must hit /api/jobs.");
if (/askGrok\s*\?/.test(needs) || /typeof askGrok/.test(needs)) {
  fail("queue Ask Grok must not call Studio askGrok (pack drafter, no job id).");
}
if (!/helpWithAi\('\s*"\s*\+\s*j\.id/.test(needs) && !/helpWithAi\('" \+ j\.id/.test(needs)) {
  fail("Ask Grok button must call helpWithAi with the card id.");
}

const grokFn = needs.slice(needs.indexOf("async function helpWithAi"), needs.indexOf("async function pinCap"));
if (!grokFn || grokFn.length < 80) fail("could not slice helpWithAi");
if (/oauth|spacex|login\.x\.ai|XAI login|grok bot api/i.test(grokFn)) {
  fail("helpWithAi invented Grok OAuth / SpaceX login.");
}
if (!/Nothing sent/.test(grokFn)) fail("Ask Grok must say nothing was sent.");

if (!nav.includes("desk-needs.js")) fail("desk-nav.js must load desk-needs.js on the queue.");
if (nav.includes("desk-queue.js")) {
  fail("desk-nav must not load desk-queue.js (paintQueueCard would overwrite need taps).");
}

if (!jobs.includes('action === "recommend"')) fail("jobs.js must still handle recommend.");
if (!/helpWithAi|Ask Grok/.test(yesNo) || !/recommend/.test(yesNo)) {
  fail("ACCOUNT-YES-NO must record queue Ask Grok → recommend.");
}
if (/Grok OAuth|SpaceX login/i.test(yesNo) === false) {
  fail("ACCOUNT-YES-NO must bar fake Grok OAuth / SpaceX login.");
}

async function main() {
  const calls = [];
  const banner = { textContent: "" };
  const ctx = {
    window: {},
    document: {
      readyState: "complete",
      addEventListener: function () {},
      getElementById: function (id) { return id === "banner" ? banner : null; },
      createElement: function () { return { id: "", textContent: "" }; },
      head: { appendChild: function () {} }
    },
    setTimeout: function () {},
    localStorage: { getItem: function () { return ""; }, setItem: function () {} },
    api: async function (path, opts) {
      calls.push({ path: path, opts: opts });
      return { status: 200, data: { ok: true, grok: "off", job: { id: "j1", draft: "Copy this. Yes or Stop." } } };
    },
    youName: "Pat",
    load: async function () { ctx._loaded = true; },
    openJob: function (id) { ctx._opened = id; }
  };
  ctx.window = ctx;
  vm.runInNewContext(needs, ctx);

  if (typeof ctx.helpWithAi !== "function") fail("desk-needs.js must set window.helpWithAi");
  if (typeof ctx.card !== "function") fail("desk-needs.js must still set window.card");

  await ctx.helpWithAi("j1");
  if (!calls.length) fail("helpWithAi did not call api");
  const rec = calls[0];
  if (rec.path !== "/api/jobs") fail("helpWithAi posted " + rec.path);
  const body = JSON.parse((rec.opts && rec.opts.body) || "{}");
  if (body.action !== "recommend") fail("helpWithAi action was " + body.action);
  if (body.id !== "j1") fail("helpWithAi did not send the card id");
  if (ctx._opened !== "j1") fail("helpWithAi should open the card after draft");
  if (!/Nothing sent/.test(banner.textContent)) fail("banner must say nothing was sent");

  const html = ctx.card({
    id: "j9",
    status: "waiting",
    title: "Oak dresser"
  }, false);
  if (!html) fail("card() must return HTML");
  if (!/Ask Grok/.test(html)) fail("a waiting card with no draft must show Ask Grok");
  if (!/helpWithAi\('j9'\)/.test(html)) fail("Ask Grok tap must call helpWithAi('j9')");
  if (!/>Yes</.test(html)) fail("Yes must stay on a decide card");
  if (!/>Stop</.test(html)) fail("Stop must stay on a decide card for the owner");
  if (/askGrok/.test(html)) fail("queue card must not call Studio askGrok");

  const drafted = ctx.card({
    id: "j8",
    status: "waiting",
    title: "Oak dresser",
    draft: "List the oak dresser."
  }, false);
  if (/Ask Grok/.test(drafted)) fail("a card that already has a draft must not show Ask Grok");

  const store = path.join(os.tmpdir(), "aia-desk-grok-" + Date.now() + ".json");
  process.env.AIA_STORE_PATH = store;
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
  const slug = "grok-desk";
  const pin = "4821";
  const shop = { slug: slug, name: "Pat", biz: slug, pin: hashPin(pin), people: [] };
  ensurePeople(shop);
  shop.people[0].name = "Pat";
  shop.people[0].pin = hashPin(pin);
  mem.workspaces.unshift(shop);
  const cap = await call(jobsHandler, "POST", { "x-workspace": slug, "x-pin": pin }, { action: "capture", title: "Permission slip Friday" });
  if (cap.statusCode !== 201 || !cap.body.job || !cap.body.job.id) fail("capture should 201, got " + cap.statusCode);
  const id = cap.body.job.id;
  const recOut = await call(jobsHandler, "POST", { "x-workspace": slug, "x-pin": pin }, { action: "recommend", id: id, whoTapped: "Pat" });
  if (recOut.statusCode !== 200 || !recOut.body.ok) fail("recommend should 200, got " + recOut.statusCode + " " + JSON.stringify(recOut.body));
  const job = recOut.body.job;
  if (!job) fail("recommend returned no job");
  if (job.status === "shipped" || job.charged === true) fail("recommend must not ship or charge");
  if (!(job.draft || (job.recs && job.recs.length))) fail("recommend must leave a draft or recs on the card");

  const grokMod = require("../api/_grok");
  const briefNamed = grokMod.jobBrief(
    { title: "Oak dresser" },
    { ais: [{ name: "James’s AI", role: "Doer", does: "Help the world desk", prompt: "Draft ready. I cannot send, pay, or bind anything. You stay in control." }] }
  );
  if (!briefNamed.ais || !briefNamed.ais[0] || (briefNamed.ais[0].prompt || "").indexOf("Draft ready") < 0) {
    fail("jobBrief must pass the named Desk AI prompt");
  }
  const briefEmpty = grokMod.jobBrief({ title: "Oak dresser" }, { ais: [{ name: "James’s AI" }] });
  if (!briefEmpty.ais || !briefEmpty.ais[0] || (briefEmpty.ais[0].prompt || "").indexOf("Draft ready") < 0) {
    fail("empty named-AI prompt must fall back to AIA canon");
  }
  if (!briefEmpty.ais[0].does || briefEmpty.ais[0].does.indexOf("Nothing sent") < 0) {
    fail("empty named-AI does must fall back to AIA canon");
  }
  const briefBound = grokMod.jobBrief({
    title: "Oak dresser",
    deskAi: { name: "James’s AI", prompt: "Draft ready. I cannot send, pay, or bind anything. You stay in control." }
  }, {});
  if (!briefBound.deskAi || (briefBound.deskAi.prompt || "").indexOf("Draft ready") < 0) {
    fail("jobBrief must pass the bound deskAi prompt");
  }

  console.log("check-desk-grok: ok");
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
