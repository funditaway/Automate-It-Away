#!/usr/bin/env node
require("./_env-guard");
// Proves POST /api/jobs {action:"build-log"} is owner-password-session only,
// safe to repeat, born in the History done lane as a helper, and never a
// Queue card, Grok call, hook, send, or money write.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const Module = require("module");

const LIVE = process.argv.indexOf("--live") >= 0;
const root = path.join(__dirname, "..");
const jobsPath = path.join(root, "api/jobs.js");
const store = path.join(os.tmpdir(), "aia-build-log-" + Date.now() + "-" + process.pid + ".json");
process.env.AIA_STORE_PATH = store;
Object.keys(process.env).forEach(function (k) {
  if (/BLOB|VERCEL|XAI|GROK|OPENAI|ANTHROPIC/.test(k)) delete process.env[k];
});
delete global.__aia;
delete global.__aiaHydrate;

const counts = { grok: 0, hook: 0, run: 0, fanout: 0, hold: 0, draft: 0, yes: 0, fetch: 0 };
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const mod = origLoad.apply(this, arguments);
  const file = parent && parent.filename ? String(parent.filename) : "";
  if (request === "./_grok" && /\/api\/jobs\.js$/.test(file)) {
    return Object.assign({}, mod, {
      grokRecommend: async function () {
        counts.grok += 1;
        return { ok: false, reason: "stub" };
      }
    });
  }
  if (request === "./_engine" && /\/api\/jobs\.js$/.test(file)) {
    return Object.assign({}, mod, {
      runWorkspace: function () { counts.run += 1; return mod.runWorkspace.apply(this, arguments); },
      thenAfterYes: function () { counts.yes += 1; return mod.thenAfterYes.apply(this, arguments); }
    });
  }
  if (request === "./_fields" && /\/api\/jobs\.js$/.test(file)) {
    return Object.assign({}, mod, {
      makeFanOutJobs: function () { counts.fanout += 1; return mod.makeFanOutJobs.apply(this, arguments); },
      holdCapturedJob: function () { counts.hold += 1; return mod.holdCapturedJob.apply(this, arguments); },
      applyImplement: mod.applyImplement
    });
  }
  if (request === "./_handoff" && /\/api\/jobs\.js$/.test(file)) {
    return Object.assign({}, mod, {
      applyDeskAiDraft: function () { counts.draft += 1; return; }
    });
  }
  return mod;
};

const origFetch = global.fetch;
global.fetch = async function (url) {
  counts.fetch += 1;
  counts.hook += 1;
  if (typeof origFetch === "function") {
    try { return await origFetch.apply(this, arguments); } catch (e) {}
  }
  return { status: 200, ok: true, json: async () => ({}), text: async () => "" };
};

function fail(msg) {
  console.error("FAIL " + msg);
  try { fs.rmSync(store, { force: true }); } catch (e) {}
  process.exit(1);
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
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; }
  };
}
async function call(handler, method, headers, body, query, url) {
  const res = mockRes();
  await handler({
    method: method,
    headers: headers || {},
    body: body || {},
    query: query || {},
    url: url || "/api/jobs"
  }, res);
  return res;
}

const HEAD1 = "c31c471baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HEAD2 = "b0168376a31c48cd7e2b37036f96cd893563a310";
const MAIN = "844bd125e9a88c41e36e0927f3a1863cd15ceb40";
const SHORT1 = HEAD1.slice(0, 7);
const SHORT_MAIN = MAIN.slice(0, 7);

function snapMoney(lib) { return JSON.stringify(lib.mem.money || []); }
function snapInbox(lib) { return JSON.stringify(lib.mem.inbox || []); }
function jobsOn(lib, slug) { return (lib.mem.jobs || []).filter((j) => j && j.workspace === slug); }
function buildLogs(lib, slug) {
  return jobsOn(lib, slug).filter((j) => j.custom && j.custom.buildLog);
}
function not2xx(res, label, lib, slug, before) {
  if (res.statusCode >= 200 && res.statusCode < 300) {
    fail(label + " must not succeed, got " + res.statusCode + " " + JSON.stringify(res.body));
  }
  const after = buildLogs(lib, slug).length;
  if (after !== before) fail(label + " must not write a card, jobs " + before + " -> " + after);
  return res;
}
function noSideEffects(lib, label, money0, inbox0) {
  if (snapMoney(lib) !== money0) fail(label + " wrote mem.money");
  if (snapInbox(lib) !== inbox0) fail(label + " wrote mem.inbox");
  if (counts.grok) fail(label + " called grokRecommend (" + counts.grok + ")");
  if (counts.run) fail(label + " called runWorkspace (" + counts.run + ")");
  if (counts.hook || counts.fetch) fail(label + " called hook/fetch (" + counts.hook + "/" + counts.fetch + ")");
  if (counts.fanout) fail(label + " called makeFanOutJobs");
  if (counts.hold) fail(label + " called holdCapturedJob");
  if (counts.draft) fail(label + " called applyDeskAiDraft");
  if (counts.yes) fail(label + " called thenAfterYes");
}

function assertSources() {
  const jobs = fs.readFileSync(jobsPath, "utf8");
  if (jobs.indexOf('action === "build-log"') < 0) fail("jobs.js must handle action build-log");
  if (jobs.indexOf("queueSession(req)") < 0 || jobs.indexOf("isOwner(person)") < 0) {
    fail("build-log must use queueSession and isOwner");
  }
  const start = jobs.indexOf('if (action === "build-log")');
  const end = jobs.indexOf("// Every action below reads or changes a card", start);
  if (start < 0 || end < 0) fail("could not slice the build-log branch");
  const block = jobs.slice(start, end);
  ["grokRecommend", "fireWebhook", "runWorkspace", "holdCapturedJob", "makeFanOutJobs", "applyDeskAiDraft", "thenAfterYes"].forEach(function (fn) {
    if (block.indexOf(fn) >= 0) fail("build-log branch must not call " + fn);
  });
  if (/mem\.money|mem\.inbox/.test(block)) fail("build-log branch must not write money or inbox");
  if (block.indexOf('actorKind: "helper"') < 0) fail("build-log must stamp actorKind helper");
  if (block.indexOf('const bornStatus = "shipped"') < 0) fail("build-log must be born shipped");
  if (block.indexOf("findBuildLogJob") < 0) fail("build-log must dedupe");
  if (jobs.indexOf("build-log") < 0 || !/action must be capture, build-log/.test(jobs)) {
    fail("unknown-action 400 must mention build-log");
  }
  pass("jobs.js build-log branch is owner-only, shipped, helper-stamped, and side-effect free");

  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  const desks = pkg.indexOf("scripts/check-desks.js");
  const mine = pkg.indexOf("scripts/check-build-log.js");
  const blob = pkg.indexOf("scripts/check-blob-store.js");
  const ender = pkg.lastIndexOf("scripts/check-header-cls-early.js");
  const mask = pkg.indexOf("scripts/check-jobs-mask-names.js");
  if (desks < 0 || mine < 0 || mine < desks || blob < 0 || mine > blob) {
    fail("package.json must insert check-build-log.js right after check-desks.js");
  }
  if (mine > ender) fail("check-build-log.js must not sit at the end of the test line");
  if (mask < 0 || ender < 0) fail("package.json must keep the original ending, including check-jobs-mask-names");
  pass("package.json inserts this check after check-desks.js and keeps the original ending");

  if (jobs.indexOf("npm install") >= 0 && block.indexOf("npm install") >= 0) {
    fail("build-log must not call npm install");
  }
}

const MUTANTS = [
  {
    name: "drop the owner check",
    find: "      if (!buildSession || !shop || shop.slug !== workspace || !person || !isOwner(person)) return refuseJobRead(res, found);",
    repl: "      if (!buildSession || !shop || shop.slug !== workspace || !person) return refuseJobRead(res, found);"
  },
  {
    name: "accept pin-only",
    find: "      if (!buildSession || !shop || shop.slug !== workspace || !person || !isOwner(person)) return refuseJobRead(res, found);",
    repl: "      if (!shop || shop.slug !== workspace || !person || !isOwner(person)) return refuseJobRead(res, found);"
  },
  {
    name: "drop the dedupe",
    find: "      const existing = findBuildLogJob(workspace, pr, head);",
    repl: "      const existing = null;"
  },
  {
    name: "trust the client actorKind",
    find: '      const helperActor = { actorKind: "helper", actorLabel: "helper" };',
    repl: '      const helperActor = { actorKind: (body.actorKind ? String(body.actorKind).trim().toLowerCase() : "helper"), actorLabel: "helper" };'
  },
  {
    name: "born exception or Queue",
    find: '      const bornStatus = "shipped";',
    repl: '      const bornStatus = "exception";'
  },
  {
    name: "invent a default verdict",
    find: '      let verdict = "";',
    repl: '      let verdict = "PASS";'
  },
  {
    name: "call Grok",
    find: "      mem.jobs.unshift(job);\n      log(\"Build\", title, \"OK\", workspace);\n      await save();",
    repl: "      mem.jobs.unshift(job);\n      log(\"Build\", title, \"OK\", workspace);\n      await grokRecommend(job, shop, workspace);\n      await save();"
  },
  {
    name: "allow an unknown field",
    find: "        if (!BUILD_LOG_KEYS[k]) {\n          return res.status(400).json({ ok: false, error: \"That field is not used here.\" });\n        }",
    repl: "        /* allow unknown */"
  }
];

function restoreJobs(orig) {
  fs.writeFileSync(jobsPath, orig);
}

function runMutants(orig) {
  const live = fs.readFileSync(jobsPath, "utf8");
  if (live !== orig) fail("jobs.js drifted before mutants");
  let caught = 0;
  try {
    MUTANTS.forEach(function (m) {
      const cur = fs.readFileSync(jobsPath, "utf8");
      if (cur !== orig) restoreJobs(orig);
      const src = fs.readFileSync(jobsPath, "utf8");
      if (src.indexOf(m.find) < 0) fail("mutant anchor gone: " + m.name);
      if (src.indexOf(m.find) !== src.lastIndexOf(m.find)) fail("mutant anchor not unique: " + m.name);
      fs.writeFileSync(jobsPath, src.replace(m.find, m.repl));
      const r = spawnSync(process.execPath, [path.join(root, "scripts/check-build-log.js"), "--live"], {
        cwd: root,
        env: Object.assign({}, process.env, {
          AIA_STORE_PATH: path.join(os.tmpdir(), "aia-bl-mut-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".json")
        }),
        encoding: "utf8",
        timeout: 45000
      });
      restoreJobs(orig);
      const out = String(r.stdout || "") + "\n" + String(r.stderr || "");
      const first = out.split("\n").find(function (l) { return l.indexOf("FAIL") === 0; }) || "";
      if (r.status) {
        caught += 1;
        pass("mutant caught: " + m.name + (first ? " (" + first.slice(0, 140) + ")" : ""));
      } else {
        console.error("SURVIVED " + m.name + "\n" + out.slice(-800));
        fail("mutant survived: " + m.name);
      }
    });
  } finally {
    restoreJobs(orig);
  }
  if (fs.readFileSync(jobsPath, "utf8") !== orig) fail("jobs.js was not restored byte-identical");
  if (caught !== MUTANTS.length) fail("mutants: " + caught + "/" + MUTANTS.length + " caught");
  pass("mutants: " + caught + "/" + MUTANTS.length + " caught");
  pass("jobs.js restored byte-identical after mutants");
  return caught;
}

async function main() {
  assertSources();
  const auth = require(path.join(root, "api/auth"));
  const jobs = require(path.join(root, "api/jobs"));
  const desks = require(path.join(root, "api/_desks-http"));
  const lib = require(path.join(root, "api/_lib"));
  const history = require(path.join(root, "api/_history"));
  await lib.ready();

  const slug = "build-log-shop";
  const other = "build-log-other";
  const pin = "4821";
  const opened = await call(auth, "POST", { "x-workspace": slug }, {
    action: "open", slug: slug, biz: "Build Log Shop", name: "James", pin: pin
  }, {}, "/api/auth");
  if (opened.statusCode !== 201 || !opened.body || !opened.body.session) {
    fail("could not open a desk, got " + opened.statusCode + " " + JSON.stringify(opened.body));
  }
  const openTok = opened.body.session.token;
  const pw = await call(auth, "POST", { "x-workspace": slug, "x-session": openTok }, {
    action: "password", password: "james-pass-build-1234", email: "james@buildlog.test"
  }, {}, "/api/auth");
  if (pw.statusCode !== 200) fail("could not set a password, got " + pw.statusCode + " " + JSON.stringify(pw.body));
  const login = await call(auth, "POST", {}, {
    action: "login", email: "james@buildlog.test", password: "james-pass-build-1234", workspace: slug
  }, {}, "/api/auth");
  if (login.statusCode !== 200 || !login.body || !login.body.session || !login.body.session.token) {
    fail("email login failed, got " + login.statusCode + " " + JSON.stringify(login.body));
  }
  const ownerTok = login.body.session.token;
  const rawOwner = lib.findSession(ownerTok, { slide: false });
  if (!rawOwner || rawOwner.proof !== "password") fail("owner email session must be password proof");
  pass("opened a desk and signed in with email and password");

  const pinLogin = await call(auth, "POST", {}, { action: "login", workspace: slug, pin: pin }, {}, "/api/auth");
  if (pinLogin.statusCode !== 200 || !pinLogin.body || !pinLogin.body.session) {
    fail("desk-code login failed, got " + pinLogin.statusCode);
  }
  const pinTok = pinLogin.body.session.token;
  const rawPin = lib.findSession(pinTok, { slide: false });
  if (!rawPin || rawPin.proof === "password") fail("desk-code session must not be a password proof");
  pass("desk-code session is not a password session");

  const joined = await call(auth, "POST", { "x-workspace": slug }, {
    action: "join", name: "Sam", pin: "9090", kind: "helper"
  }, {}, "/api/auth");
  if (joined.statusCode !== 202 || !joined.body || !joined.body.person) {
    fail("could not add a helper, got " + joined.statusCode + " " + JSON.stringify(joined.body));
  }
  const approved = await call(auth, "POST", { "x-workspace": slug, "x-pin": pin }, {
    action: "approve", id: joined.body.person.id
  }, {}, "/api/auth");
  if (approved.statusCode !== 200) fail("owner should approve the helper, got " + approved.statusCode);
  const shop = (lib.mem.workspaces || []).find((w) => w && w.slug === slug);
  const helperPerson = (shop.people || []).find((p) => p && p.id === joined.body.person.id);
  if (!helperPerson) fail("helper seat missing");
  const helperAcc = {
    id: "acc_bl_helper",
    email: "sam@buildlog.test",
    name: "Sam",
    desks: [slug],
    createdAt: new Date().toISOString()
  };
  lib.mem.accounts.push(helperAcc);
  helperPerson.accountId = helperAcc.id;
  helperPerson.email = helperAcc.email;
  const helperSess = lib.issueSession(helperPerson, shop, helperAcc, { headers: { "x-workspace": slug } }, "password");
  if (!helperSess || !helperSess.token) fail("could not issue a helper password session");
  const helperTok = helperSess.token;
  const rawHelper = lib.findSession(helperTok, { slide: false });
  if (!rawHelper || rawHelper.proof !== "password" || !lib.queueSession({ headers: { "x-session": helperTok, "x-workspace": slug } })) {
    fail("helper password session should satisfy queueSession, raw " + JSON.stringify({ proof: rawHelper && rawHelper.proof, accountId: rawHelper && rawHelper.accountId }));
  }
  pass("helper has a password session on this desk");

  const otherOpen = await call(auth, "POST", { "x-workspace": other }, {
    action: "open", slug: other, biz: "Other Shop", name: "Dee", pin: "7777", email: "dee@buildlog.test"
  }, {}, "/api/auth");
  if (otherOpen.statusCode !== 201) fail("could not open a second desk, got " + otherOpen.statusCode + " " + JSON.stringify(otherOpen.body));
  pass("opened a second desk James does not sit on");

  const ownerHdr = { "x-workspace": slug, "x-session": ownerTok };
  const base = {
    action: "build-log",
    pr: 557,
    head: HEAD1,
    status: "draft",
    name: "Pack ownership"
  };
  const money0 = snapMoney(lib);
  const inbox0 = snapInbox(lib);
  const before = buildLogs(lib, slug).length;

  const missingWs = await call(jobs, "POST", { "x-session": ownerTok }, base);
  if (missingWs.statusCode !== 400 || !missingWs.body || missingWs.body.error !== "Open a desk first.") {
    fail("missing X-Workspace should stay 400 Open a desk first, got " + missingWs.statusCode + " " + JSON.stringify(missingWs.body));
  }
  pass("missing X-Workspace stays 400 Open a desk first");

  const stranger = not2xx(await call(jobs, "POST", { "x-workspace": slug }, base), "stranger", lib, slug, before);
  if (!stranger.body || stranger.body.error !== "No desk with that name.") {
    fail("stranger should see the existing missing-desk wording, got " + JSON.stringify(stranger.body));
  }
  const cookieless = not2xx(await call(jobs, "POST", { "x-workspace": slug, cookie: "" }, base), "cookie-less", lib, slug, before);
  if (cookieless.body.error !== "No desk with that name.") fail("cookie-less wording drifted");
  const pinOnly = not2xx(await call(jobs, "POST", { "x-workspace": slug, "x-pin": pin }, base), "pin-only", lib, slug, before);
  if (pinOnly.statusCode >= 200 && pinOnly.statusCode < 300) fail("pin-only must not succeed");
  const pinSess = not2xx(await call(jobs, "POST", { "x-workspace": slug, "x-session": pinTok }, base), "desk-code session", lib, slug, before);
  const helperHit = not2xx(await call(jobs, "POST", { "x-workspace": slug, "x-session": helperTok }, base), "helper", lib, slug, before);
  const helperPin = not2xx(await call(jobs, "POST", { "x-workspace": slug, "x-pin": "9090" }, base), "helper pin", lib, slug, before);
  const wrongDesk = not2xx(await call(jobs, "POST", { "x-workspace": other, "x-session": ownerTok }, Object.assign({}, base, { name: "Wrong desk" })), "wrong-desk", lib, other, buildLogs(lib, other).length);
  const missingDesk = not2xx(await call(jobs, "POST", { "x-workspace": "no-such-build-log-desk", "x-session": ownerTok }, base), "missing desk", lib, slug, before);
  pass("pin-only, helper, other-seat, stranger, cookie-less, and wrong-desk sessions are refused");
  noSideEffects(lib, "refusals", money0, inbox0);

  function bad(extra, label) {
    return (async function () {
      const body = Object.assign({}, base, extra);
      const n = buildLogs(lib, slug).length;
      const r = await call(jobs, "POST", ownerHdr, body);
      not2xx(r, label, lib, slug, n);
      if (r.statusCode !== 400) fail(label + " should be 400, got " + r.statusCode + " " + JSON.stringify(r.body));
    })();
  }
  await bad({ pr: undefined }, "missing pr");
  // missing pr: Object.assign with undefined may still leave pr. Handle explicitly.
  {
    const body = { action: "build-log", head: HEAD1, status: "draft", name: "Pack ownership" };
    const n = buildLogs(lib, slug).length;
    const r = await call(jobs, "POST", ownerHdr, body);
    not2xx(r, "missing pr field", lib, slug, n);
    if (r.statusCode !== 400) fail("missing pr should be 400, got " + r.statusCode);
  }
  {
    const body = { action: "build-log", pr: 557, status: "draft", name: "Pack ownership" };
    const n = buildLogs(lib, slug).length;
    const r = await call(jobs, "POST", ownerHdr, body);
    not2xx(r, "missing head", lib, slug, n);
    if (r.statusCode !== 400) fail("missing head should be 400");
  }
  await bad({ pr: 0 }, "pr 0");
  await bad({ pr: -1 }, "negative pr");
  await bad({ pr: 1.5 }, "fractional pr");
  await bad({ pr: "abc" }, "non-numeric pr");
  await bad({ head: "c31c471" }, "short head");
  await bad({ head: HEAD1.slice(0, 39) }, "39-char head");
  await bad({ head: HEAD1 + "a" }, "41-char head");
  await bad({ head: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz" }, "non-hex head");
  await bad({ mainSha: "844bd12" }, "short mainSha");
  await bad({ verdict: "pass" }, "lowercase verdict");
  await bad({ verdict: "OK" }, "unknown verdict");
  await bad({ status: "shipped" }, "job-status as payload status");
  await bad({ status: "waiting" }, "queue status");
  await bad({ status: "" }, "empty status");
  await bad({ name: "" }, "empty name");
  await bad({ name: "   " }, "whitespace name");
  await bad({ title: "Invented" }, "unknown title field");
  await bad({ why: "Invented" }, "unknown why field");
  await bad({ foo: "bar" }, "unknown field foo");
  await bad({ id: "job_fake" }, "unknown id field");
  await bad({ amount: 12 }, "money amount");
  await bad({ hook: "https://hooks.example.test/x" }, "hook field");
  await bad({ provider: "webhook" }, "provider field");
  await bad({ email: "pay@example.test" }, "email field");
  await bad({ collect: "yes" }, "collect field");
  if (snapMoney(lib) !== money0) fail("invalid/money payloads wrote mem.money");
  pass("field allowlist and validation refuse unknown, invalid, and money fields");

  counts.grok = counts.hook = counts.run = counts.fanout = counts.hold = counts.draft = counts.yes = counts.fetch = 0;
  const first = await call(jobs, "POST", ownerHdr, Object.assign({}, base, { actorKind: "ai" }));
  if (first.statusCode !== 201 || !first.body || first.body.created !== true || !first.body.job || !first.body.job.id) {
    fail("owner password session should 201 created, got " + first.statusCode + " " + JSON.stringify(first.body));
  }
  if (first.body.charged !== false || first.body.sent !== false) fail("reply must say charged and sent are false");
  const job = first.body.job;
  if (job.status !== "shipped") fail("stored status must be shipped, got " + job.status);
  if (job.title !== "Draft: Pack ownership (#557)") fail("title should be Draft: Pack ownership (#557), got " + job.title);
  if (!job.why || job.why.indexOf("Head " + SHORT1) < 0) fail("why must name the short head, got " + job.why);
  if (/On main|passed|failed|green|orange|red/i.test(job.why)) {
    fail("why must not invent a main SHA or a verdict when none was sent, got " + job.why);
  }
  const bl = job.custom && job.custom.buildLog;
  if (!bl || bl.pr !== 557 || bl.head !== HEAD1 || bl.status !== "draft" || bl.name !== "Pack ownership" || bl.desk !== slug) {
    fail("custom.buildLog fields wrong: " + JSON.stringify(bl));
  }
  if (Object.prototype.hasOwnProperty.call(bl, "verdict") && bl.verdict) fail("must not invent a verdict, got " + bl.verdict);
  if (Object.prototype.hasOwnProperty.call(bl, "mainSha") && bl.mainSha) fail("must not invent a main SHA, got " + bl.mainSha);
  const thread = job.thread || [];
  if (!thread.some((t) => t && t.actorKind === "helper")) {
    fail("thread must have actorKind helper, got " + JSON.stringify(thread));
  }
  if (thread.some((t) => t && (t.actorKind === "ai" || t.actorKind === "human" || t.actorKind === "si"))) {
    fail("client actorKind must not be stored, got " + JSON.stringify(thread));
  }
  const stored = (lib.mem.jobs || []).find((j) => j && j.id === job.id);
  if (!stored || stored.status !== "shipped" || stored.charged !== false || stored.amount !== null || stored.waitingOn !== "") {
    fail("stored job must be shipped, uncharged, no amount, empty waitingOn: " + JSON.stringify(stored && { status: stored.status, charged: stored.charged, amount: stored.amount, waitingOn: stored.waitingOn }));
  }
  if (stored.kind !== "note") fail("kind must be note");
  noSideEffects(lib, "first write", money0, inbox0);
  pass("owner session creates one shipped helper card with a plain Draft title");

  const hist = await call(desks, "POST", ownerHdr, { action: "history", desks: [{ slug: slug, pin: "" }] }, {}, "/api/desks");
  if (hist.statusCode !== 200 || !hist.body || !hist.body.ok) {
    fail("History read should 200, got " + hist.statusCode + " " + JSON.stringify(hist.body));
  }
  const card = (hist.body.items || []).find((it) => it && it.id === job.id);
  if (!card || card.kind !== "job") fail("History must include the card as kind job, got " + JSON.stringify(card));
  if (card.lane !== "done" || card.label !== "Done" || card.when !== "past") {
    fail("History card must be in the done lane, got " + JSON.stringify({ lane: card.lane, label: card.label, when: card.when, status: card.status }));
  }
  if (card.title !== "Draft: Pack ownership (#557)") fail("History title drifted: " + card.title);
  if (String(card.how || "").indexOf("Head " + SHORT1) < 0) fail("History how-line must carry the head, got " + card.how);
  if (card.money) fail("History card must not be flagged as money");
  if (card.status !== "shipped") fail("History status must be shipped");
  if (!(card.thread || []).some((t) => t && t.actorKind === "helper")) {
    fail("History thread must show actorKind helper, got " + JSON.stringify(card.thread));
  }
  const viaHistFn = history.historyOf
    ? history.historyOf(shop, lib.mem.jobs.filter((j) => j.workspace === slug), [])
    : null;
  pass("POST /api/desks history shows the card in the done lane with thread actorKind helper");

  const queue = await call(jobs, "GET", { "x-workspace": slug, "x-session": ownerTok });
  if (queue.statusCode !== 200) fail("owner GET /api/jobs should 200");
  const qCard = (queue.body.jobs || []).find((j) => j && j.id === job.id);
  if (!qCard) fail("GET /api/jobs should still list the card (History reads the same store)");
  if (qCard.status !== "shipped") fail("Queue listing status must be shipped, not open work");
  const openWork = (queue.body.jobs || []).filter((j) => j && j.id === job.id && (j.status === "exception" || j.status === "waiting" || j.status === "held"));
  if (openWork.length) fail("build-log must not appear as Queue work, status " + openWork[0].status);
  if (qCard.decide) fail("build-log must not ask for Yes");
  const lane = history.laneOf ? history.laneOf(stored) : card.lane;
  if (lane !== "done") fail("laneOf must be done, got " + lane);
  pass("the card is not Queue work: shipped, done lane, no Yes");

  const n1 = (lib.mem.jobs || []).length;
  const again = await call(jobs, "POST", ownerHdr, Object.assign({}, base, { actorKind: "human" }));
  if (again.statusCode !== 200 || again.body.created !== false || !again.body.job || again.body.job.id !== job.id) {
    fail("repeat must 200 created:false with the same id, got " + again.statusCode + " " + JSON.stringify(again.body));
  }
  if ((lib.mem.jobs || []).length !== n1) fail("repeat must not add a job, " + n1 + " -> " + (lib.mem.jobs || []).length);
  if ((again.body.job.thread || []).some((t) => t && t.actorKind === "human")) {
    fail("repeat must still ignore client actorKind");
  }
  pass("dedupe on (desk, pr, head) returns the same job id");

  const updated = await call(jobs, "POST", ownerHdr, {
    action: "build-log",
    pr: 557,
    head: HEAD1,
    mainSha: MAIN,
    verdict: "GREEN",
    hold: "Waiting on a sign-in safety review.",
    status: "landed",
    name: "Pack ownership"
  });
  if (updated.statusCode !== 200 || updated.body.created !== false || updated.body.job.id !== job.id) {
    fail("in-place update must keep the id, got " + updated.statusCode + " " + JSON.stringify(updated.body));
  }
  if ((lib.mem.jobs || []).length !== n1) fail("in-place update added a job");
  const u = updated.body.job;
  if (u.title !== "Landed: Pack ownership (#557)") fail("updated title should be Landed: Pack ownership (#557), got " + u.title);
  if (u.why.indexOf("Head " + SHORT1) < 0 || u.why.indexOf("On main " + SHORT_MAIN) < 0 || u.why.indexOf("The live result is green.") < 0 || u.why.indexOf("Waiting on a sign-in safety review.") < 0) {
    fail("updated why should name head, main, verdict, and hold, got " + u.why);
  }
  if (/collect|money|tip|crew/i.test(u.why + u.title)) fail("title/why must not use money, Collect, or crew words: " + u.title + " / " + u.why);
  const ubl = u.custom.buildLog;
  if (ubl.verdict !== "GREEN" || ubl.mainSha !== MAIN || ubl.hold !== "Waiting on a sign-in safety review." || ubl.status !== "landed") {
    fail("in-place custom.buildLog not updated: " + JSON.stringify(ubl));
  }
  const storedU = (lib.mem.jobs || []).find((j) => j.id === job.id);
  if (storedU.status !== "shipped") fail("in-place update must stay shipped, got " + storedU.status);
  const hist2 = await call(desks, "POST", ownerHdr, { action: "history", desks: [{ slug: slug, pin: "" }] }, {}, "/api/desks");
  const card2 = (hist2.body.items || []).find((it) => it && it.id === job.id);
  if (!card2 || card2.lane !== "done" || card2.title !== "Landed: Pack ownership (#557)" || String(card2.how || "").indexOf("The live result is green.") < 0) {
    fail("History after update is wrong: " + JSON.stringify(card2 && { title: card2.title, lane: card2.lane, how: card2.how }));
  }
  if (!(card2.thread || []).some((t) => t && t.actorKind === "helper")) fail("updated History thread lost helper");
  pass("in-place update changes verdict, hold, status, mainSha, and name, and History reflects them");

  const n2 = (lib.mem.jobs || []).length;
  const newHead = await call(jobs, "POST", ownerHdr, {
    action: "build-log",
    pr: 557,
    head: HEAD2,
    status: "hold",
    name: "Pack ownership",
    hold: "On the safety hold.",
    verdict: "PASS"
  });
  if (newHead.statusCode !== 201 || newHead.body.created !== true || newHead.body.job.id === job.id) {
    fail("a new head must make a new card, got " + newHead.statusCode + " " + JSON.stringify(newHead.body));
  }
  if ((lib.mem.jobs || []).length !== n2 + 1) fail("new head should add exactly one job");
  if (newHead.body.job.title !== "On hold: Pack ownership (#557)") fail("hold title wrong: " + newHead.body.job.title);
  if (newHead.body.job.why.indexOf("The check passed.") < 0 || newHead.body.job.why.indexOf("On the safety hold.") < 0) {
    fail("hold why wrong: " + newHead.body.job.why);
  }
  const firstStill = (lib.mem.jobs || []).find((j) => j.id === job.id);
  if (!firstStill || firstStill.custom.buildLog.head !== HEAD1 || firstStill.custom.buildLog.status !== "landed") {
    fail("the first card must stay untouched when a new head is logged");
  }
  pass("a different head for the same PR makes a new card and leaves the first alone");

  const waiting = await call(jobs, "POST", ownerHdr, {
    action: "build-log",
    pr: 561,
    head: HEAD1,
    status: "waiting-on-James",
    name: "Sign-in safety fixes"
  });
  if (waiting.statusCode !== 201 || waiting.body.job.title !== "Waiting on you: Sign-in safety fixes (#561)") {
    fail("waiting title should be Waiting on you: Sign-in safety fixes (#561), got " + (waiting.body && waiting.body.job && waiting.body.job.title) + " " + waiting.statusCode);
  }
  pass("Waiting on you and On hold titles are built server-side from the status and name");

  const cookieOk = await call(jobs, "POST", {
    "x-workspace": slug,
    cookie: "aia_session=" + encodeURIComponent(ownerTok)
  }, {
    action: "build-log",
    pr: 559,
    head: HEAD1,
    status: "landed",
    name: "Blob store fallback",
    verdict: "FAIL"
  });
  if (cookieOk.statusCode !== 201 || cookieOk.body.job.title !== "Landed: Blob store fallback (#559)") {
    fail("aia_session cookie should work for the owner, got " + cookieOk.statusCode + " " + JSON.stringify(cookieOk.body));
  }
  if (cookieOk.body.job.why.indexOf("The check failed.") < 0) fail("FAIL verdict why wrong: " + cookieOk.body.job.why);
  pass("the owner session cookie is accepted, and FAIL/PASS/GREEN verdicts use plain words");

  const hist3 = await call(desks, "POST", ownerHdr, { action: "history", desks: [{ slug: slug, pin: "" }] }, {}, "/api/desks");
  const titles = (hist3.body.items || []).filter((it) => it && it.kind === "job" && it.lane === "done").map((it) => it.title);
  ["Landed: Pack ownership (#557)", "On hold: Pack ownership (#557)", "Waiting on you: Sign-in safety fixes (#561)", "Landed: Blob store fallback (#559)"].forEach(function (t) {
    if (titles.indexOf(t) < 0) fail("History missing " + t + ", have " + JSON.stringify(titles));
  });
  pass("History done lane lists every build-log title");

  const unknown = await call(jobs, "POST", ownerHdr, { action: "no-such-build", id: job.id });
  if (unknown.statusCode !== 400 || !String((unknown.body && unknown.body.error) || "").includes("build-log")) {
    fail("unknown action 400 should mention build-log, got " + unknown.statusCode + " " + JSON.stringify(unknown.body));
  }
  pass("unknown action 400 lists build-log");

  const dropped = await call(jobs, "POST", { "x-workspace": slug }, { action: "capture", title: "Street drop stays open" });
  if (dropped.statusCode !== 201 || !dropped.body || !dropped.body.job) {
    fail("public capture must still work, got " + dropped.statusCode);
  }
  pass("public capture is unchanged");

  // Capture may have incremented grok/fanout/hold and written inbox. Compare counts around a final build-log.
  const g0 = counts.grok, r0 = counts.run, f0 = counts.fetch, h0 = counts.hold, fo0 = counts.fanout;
  const finalOne = await call(jobs, "POST", ownerHdr, {
    action: "build-log", pr: 560, head: HEAD2, status: "draft", name: "Create headers"
  });
  if (finalOne.statusCode !== 201) fail("final write should 201, got " + finalOne.statusCode);
  if (counts.grok !== g0) fail("final build-log called Grok");
  if (counts.run !== r0) fail("final build-log called runWorkspace");
  if (counts.fetch !== f0) fail("final build-log fetched/hooked");
  if (counts.hold !== h0 || counts.fanout !== fo0) fail("final build-log used capture helpers");
  pass("build-log never calls Grok, hook, send, fan-out, or runWorkspace");

  if (/collect|Collect/.test(finalOne.body.job.title + finalOne.body.job.why)) fail("cards must not mention Collect");
  pass("no money or Collect words on the cards");

  try { fs.rmSync(store, { force: true }); } catch (e) {}
  console.log("check-build-log: ok");
}

if (LIVE) {
  main().catch(function (e) {
    console.error(e && e.stack || e);
    process.exit(1);
  });
} else {
  const orig = fs.readFileSync(jobsPath, "utf8");
  main().then(function () {
    const caught = runMutants(orig);
    console.log("check-build-log mutants: " + caught + "/" + MUTANTS.length + " caught");
  }).catch(function (e) {
    try { restoreJobs(orig); } catch (err) {}
    console.error(e && e.stack || e);
    process.exit(1);
  });
}
