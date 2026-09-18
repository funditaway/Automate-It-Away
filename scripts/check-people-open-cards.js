#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const vm = require("vm");

const store = path.join(os.tmpdir(), "aia-people-open-cards-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

delete global.__aia;
delete global.__aiaHydrate;

const root = path.join(__dirname, "..");
const lib = require("../api/_lib");
const hist = require("../api/_history");
const admin = require("../api/admin");
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
async function call(handler, method, headers, body, query) {
  const res = mockRes();
  await handler({ method: method, headers: headers || {}, body: body || {}, query: query || {} }, res);
  return res;
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

["people.js", "api/admin.js", "api/_history.js"].forEach(function (name) {
  const syntax = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
  if (syntax.status !== 0) fail(name + " must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
  else pass(name + " parses");
});

const people = read("people.js");
const adminSrc = read("api/admin.js");
const histSrc = read("api/_history.js");
const help = read("help.html");
const more = read("more.html");
const peopleHtml = read("people.html");
const yesNo = read("ACCOUNT-YES-NO.md");
const pkg = read("package.json");

["function thenWhoOf", "function thenGoneOf", "function wipTalkLabelOf", "function talkLabelOf", "function talkRowsOf", "function trailThreadHtml", "function cardHtml", "function promptHtml", "function namedNeedsWho", "function goneHoldLabel", "function chipsHtml", "Then draft", "pipe WIP", "not on this desk", "On the card. Nothing sent alone", "item.thread", "p-thread", "p-then", "p-turn-ai", "p-turn-you"].forEach(function (bit) {
  if (people.indexOf(bit) < 0) fail("people.js missing " + bit);
  else pass("people.js " + bit);
});
if (people.indexOf("esc(draftText)") < 0 || people.indexOf("esc(row.text)") < 0 || people.indexOf("esc(turnLabel)") < 0) {
  fail("People open cards must escape Then draft / thread");
} else pass("People open cards escape Then draft / thread");
if (/who \|\| row\.from \|\| "Desk AI"/.test(people)) {
  fail("People talkHtml must not fall back to Desk AI when the Then AI is gone");
} else pass("People talkHtml does not fall back to Desk AI");
if (people.indexOf("yours.map(cardHtml)") < 0 || people.indexOf("theirs.map(cardHtml)") < 0) {
  fail("yours / theirs open cards must use cardHtml");
} else pass("yours / theirs use cardHtml");
if (/oauth|spacex|login\.x\.ai|custodial wallet|Collect charge|silent send/i.test(people + adminSrc)) {
  fail("People open cards invented Grok OAuth / wallet / Collect charge");
} else pass("no OAuth / wallet / Collect charge");

if (adminSrc.indexOf("historyItem(job, row)") < 0) fail("historyCard must reuse historyItem");
else pass("historyCard reuses historyItem");
["thenAiGoneOf", "thenAiGone: thenAiGoneOf(job)"].forEach(function (bit) {
  if (histSrc.indexOf(bit) < 0) fail("_history missing " + bit);
  else pass("_history " + bit);
});

if (peopleHtml.indexOf("p-thread") < 0 || peopleHtml.indexOf("p-hold") < 0) {
  fail("people.html must style the open-card thread");
} else pass("people.html styles open-card thread");
if (peopleHtml.indexOf("Open cards on the shared trail") < 0) {
  fail("people.html must say open cards show Then draft / thread");
} else pass("people.html names open-card honesty");
if (people.indexOf("promptHtml(item)") < 0 || people.indexOf("chipsHtml(item)") < 0) {
  fail("People trailThreadHtml must insert promptHtml / chipsHtml");
} else pass("People trailThreadHtml inserts promptHtml / chipsHtml");
if (peopleHtml.indexOf("Needs you / prompt ask-who") < 0) {
  fail("people.html must name Needs you / prompt ask-who");
} else pass("people.html names Needs you / prompt ask-who");
if (help.indexOf("People open cards on the shared trail") < 0) {
  fail("help#desk-cards must name People open cards");
} else pass("help names People open cards");
if (more.indexOf("Open cards show the Then draft") < 0) {
  fail("more.html People must name open-card Then draft");
} else pass("more.html names open-card Then draft");
if (yesNo.indexOf("check-people-open-cards.js") < 0) fail("ACCOUNT-YES-NO must record People open cards");
else pass("ACCOUNT-YES-NO records People open cards");
if (pkg.indexOf("check-people-open-cards.js") < 0) fail("package.json must run check-people-open-cards");
else pass("package.json runs check-people-open-cards");

if (typeof hist.historyItem !== "function" || typeof hist.thenAiGoneOf !== "function") {
  fail("_history must export historyItem / thenAiGoneOf");
} else pass("_history exports thenAiGoneOf");

const stackedJob = {
  id: "j-open",
  status: "waiting",
  title: "They clicked",
  workspace: "shop",
  assignee: "Pat",
  draft: "Ask who it is for and when. Do not send.",
  deskAi: { id: "james-s-ai", name: "James’s AI", does: "Draft the lead packet", prompt: "Ask who it is for." },
  thread: [
    { kind: "ask", from: "James’s AI", text: "Who is this for?", at: "2026-09-06T12:00:00Z" },
    { kind: "reply", from: "Pat", text: "Sam at the shop", at: "2026-09-06T12:01:00Z" },
    { kind: "note", from: "desk", text: "Dropped by neighbor.", at: "2026-09-06T11:59:00Z" },
    { kind: "note", from: "pipe", text: "Pipe update.", at: "2026-09-06T12:03:00Z" },
    { kind: "follow", from: "webhook", text: "Pipe confirmed done.", at: "2026-09-06T12:04:00Z" },
    { kind: "tell", from: "drop", text: "Not shipped. Qualify first.", at: "2026-09-06T11:58:00Z" }
  ],
  replies: [{ from: "Pat", text: "Sam at the shop" }],
  why: "James’s AI drafted on the card. Human send HOLD.",
  next: "Reply is on the card. Nothing sent alone.",
  waitingOn: "person",
  createdAt: "2026-09-06T12:02:00Z"
};

const stacked = hist.historyItem(stackedJob, { slug: "shop", biz: "Shop" });
if (!stacked || !stacked.draft || stacked.draft.indexOf("Ask who it is for") < 0) fail("historyItem must keep Then draft for open cards");
else pass("historyItem keeps Then draft");
if (!stacked.deskAi || stacked.deskAi.name !== "James’s AI") fail("historyItem must name the desk AI");
else pass("historyItem names the desk AI");
if (!stacked.thread || !stacked.thread.some(function (t) { return t.kind === "ask"; })) fail("historyItem must keep the AI ask");
else pass("historyItem keeps the AI ask");
if (!stacked.thread.some(function (t) { return t.kind === "reply"; })) fail("historyItem must keep the human reply");
else pass("historyItem keeps the human reply");
if (!stacked.thread.some(function (t) { return t.kind === "note" && /Dropped by neighbor/.test(t.text || ""); })) {
  fail("historyItem must keep desk notes");
} else pass("historyItem keeps desk notes");
if (!stacked.thread.some(function (t) { return t.kind === "follow"; })) fail("historyItem must keep follow rows");
else pass("historyItem keeps follow");
if (!stacked.thread.some(function (t) { return t.kind === "tell" && /Qualify first/.test(t.text || ""); })) {
  fail("historyItem must keep Tell AIA rows");
} else pass("historyItem keeps Tell AIA");

const goneJob = {
  id: "j-gone",
  status: "waiting",
  title: "Need 2 < 3",
  workspace: "shop",
  assignee: "Pat",
  draft: "Don't use <b>html</b>. Human send HOLD.",
  thenAiGone: { id: "shop-bot", name: "Shop Bot <gone>" },
  thread: [
    { kind: "ask", from: "Shop Bot <gone>", text: "Need <phone>?" },
    { kind: "reply", from: "Sam <helper>", text: "Use <script> no" }
  ],
  replies: [{ from: "Sam <helper>", text: "Use <script> no" }],
  waitingOn: "person",
  createdAt: "2026-09-06T12:03:00Z"
};
const goneItem = hist.historyItem(goneJob, { slug: "shop", biz: "Shop" });
if (!goneItem || !goneItem.thenAiGone || goneItem.thenAiGone.name !== "Shop Bot <gone>") {
  fail("historyItem must keep thenAiGone as data");
} else pass("historyItem keeps thenAiGone");
if (goneItem.deskAi) fail("gone historyItem must not invent a live desk AI");
else pass("gone historyItem does not invent a live desk AI");

const paintSrc = people.match(/function thenWhoOf\(item\)[\s\S]*?function historyHtml\(item\)[\s\S]*?\n\}/);
if (!paintSrc) fail("could not extract People open-card paint");
else pass("extracted People open-card paint");

const ctx = {
  esc: function (s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
    });
  },
  fmtTime: function () { return "just now"; }
};
if (paintSrc) vm.runInNewContext(paintSrc[0], ctx);
if (typeof ctx.cardHtml !== "function" || typeof ctx.trailThreadHtml !== "function") {
  fail("People must expose cardHtml / trailThreadHtml");
} else pass("cardHtml / trailThreadHtml run");

const openPaint = ctx.cardHtml(Object.assign({ desk: "Shop", side: "yours" }, stacked));
if (openPaint.indexOf("p-thread") < 0) fail("open card must wrap Then + thread in p-thread");
else pass("open card wraps p-thread");
if (openPaint.indexOf("Then draft") < 0) fail("open card must label Then draft");
else pass("open card labels Then draft");
if (openPaint.indexOf("James") < 0) fail("open card must name the desk AI");
else pass("open card names the desk AI");
if (openPaint.indexOf("Who is this for?") < 0) fail("open card must show the AI ask");
else pass("open card shows the AI ask");
if (openPaint.indexOf("Sam at the shop") < 0) fail("open card must show the human reply");
else pass("open card shows the human reply");
if (openPaint.indexOf("p-turn-you") < 0 || openPaint.indexOf("p-turn-ai") < 0) {
  fail("open card must mark AI and human turns");
} else pass("open card marks AI and human turns");
if (openPaint.indexOf("On the card. Nothing sent alone.") < 0) fail("open card must stay nothing sent alone");
else pass("open card stays nothing sent alone");
if (openPaint.indexOf("Dropped by neighbor") < 0) fail("open card must show the desk note");
else pass("open card shows the desk note");
if (openPaint.indexOf("desk · note") < 0) fail("open card must label a desk note as note");
else pass("open card labels desk note");
if (openPaint.indexOf("Pipe update.") < 0) fail("open card must show pipe WIP");
else pass("open card shows pipe WIP");
if (openPaint.indexOf("pipe · pipe WIP") < 0) fail("open card must label pipe notes as pipe WIP");
else pass("open card labels pipe WIP");
if (openPaint.indexOf("Pipe confirmed done.") < 0) fail("open card must show follow");
else pass("open card shows follow");
if (openPaint.indexOf("webhook · follow") < 0) fail("open card must label follow");
else pass("open card labels follow");
if (openPaint.indexOf("Not shipped. Qualify first.") < 0) fail("open card must show Tell AIA");
else pass("open card shows Tell AIA");
if (openPaint.indexOf("drop · tell") < 0) fail("open card must label Tell AIA as tell");
else pass("open card labels Tell AIA");
if (typeof ctx.talkLabelOf !== "function") fail("People must expose talkLabelOf");
else if (ctx.talkLabelOf({ kind: "tell", from: "drop" }, "James’s AI", "").indexOf("Then draft") >= 0) {
  fail("open card Tell AIA must not look like a Then draft");
} else pass("open card Tell AIA is not a Then draft");
if (openPaint.indexOf("Agent") >= 0 || /Bot MVP/i.test(openPaint)) fail("open card WIP must stay Desk-AI-safe");
else pass("open card WIP stays Desk-AI-safe");

const gonePaint = ctx.cardHtml(Object.assign({ desk: "Shop", side: "theirs" }, goneItem));
if (gonePaint.indexOf("James") >= 0) fail("gone open card must not name James");
else pass("gone open card does not name James");
if (gonePaint.indexOf("not on this desk") < 0) fail("gone open card must say not on this desk");
else pass("gone open card says not on this desk");
if (gonePaint.indexOf("Shop Bot <gone>") >= 0) fail("raw < in gone AI name must not become markup");
else if (gonePaint.indexOf("Shop Bot &lt;gone&gt;") < 0) fail("gone AI name must stay text");
else pass("gone AI name stays text");
if (gonePaint.indexOf("Don't use <b>html</b>") >= 0) fail("raw draft markup must not land");
else if (gonePaint.indexOf("Don&#39;t use &lt;b&gt;html&lt;/b&gt;") < 0 && gonePaint.indexOf("&lt;b&gt;html&lt;/b&gt;") < 0) {
  fail("Then draft must stay text");
} else pass("gone Then draft stays text");
if (gonePaint.indexOf("Need <phone>?") >= 0) fail("raw < in the ask must not become markup");
else if (gonePaint.indexOf("Need &lt;phone&gt;?") < 0) fail("ask must stay text");
else pass("gone ask stays text");
if (gonePaint.indexOf("Use <script> no") >= 0) fail("raw reply markup must not land");
else if (gonePaint.indexOf("Use &lt;script&gt; no") < 0) fail("reply text must stay text");
else pass("gone reply stays text");
if (gonePaint.indexOf("On the card. Nothing sent alone.") < 0) fail("gone open card must stay nothing sent alone");
else pass("gone open card stays nothing sent alone");
if (gonePaint.indexOf("Desk AI") >= 0) fail("gone open-card talk must not fall back to Desk AI");
else pass("gone open-card talk does not say Desk AI");
if (gonePaint.indexOf("Then draft") >= 0) fail("gone open-card talk must not look like a live Then draft");
else pass("gone open-card talk does not look live");

const goneAnon = hist.historyItem({
  id: "j-gone-anon",
  status: "waiting",
  title: "Bare gone talk",
  workspace: "shop",
  draft: "Hold the <draft>.",
  thenAiGone: { id: "shop-bot", name: "Shop Bot <gone>" },
  thread: [
    { kind: "ask", text: "Need <phone>?" },
    { kind: "rec", text: "A later <rec>." }
  ]
}, { slug: "shop", biz: "Shop" });
const goneAnonPaint = ctx.cardHtml(Object.assign({ desk: "Shop", side: "yours" }, goneAnon));
if (goneAnonPaint.indexOf("Desk AI") >= 0) fail("anonymous gone open-card talk must not fall back to Desk AI");
else pass("anonymous gone open-card talk does not say Desk AI");
if (goneAnonPaint.indexOf("Then draft") >= 0) fail("anonymous gone open-card talk must not look like a live Then draft");
else pass("anonymous gone open-card talk does not look live");
if (goneAnonPaint.indexOf("not on this desk") < 0) fail("anonymous gone open-card talk must say not on this desk");
else pass("anonymous gone open-card talk says not on this desk");
if (goneAnonPaint.indexOf("Shop Bot <gone>") >= 0) fail("raw < in anonymous gone talk must not become markup");
else if (goneAnonPaint.indexOf("Shop Bot &lt;gone&gt;") < 0) fail("anonymous gone talk name must stay text");
else pass("anonymous gone talk name stays text");
if (typeof ctx.talkLabelOf !== "function") fail("People must expose talkLabelOf");
else if (ctx.talkLabelOf({ kind: "ask" }, "", "Shop Bot <gone>").indexOf("not on this desk") < 0) {
  fail("gone ask with no from must use gone HOLD");
} else pass("gone ask with no from uses gone HOLD");
if (ctx.talkLabelOf({ kind: "rec" }, "", "Shop Bot") === "Desk AI · Then draft") {
  fail("gone rec with no from must not say Desk AI");
} else pass("gone rec with no from does not say Desk AI");

const emptyPaint = ctx.cardHtml({ title: "Bare card", desk: "Shop", status: "waiting" });
if (emptyPaint.indexOf("p-thread") >= 0 || emptyPaint.indexOf("Nothing sent alone") >= 0) {
  fail("bare open card must not invent a Then thread");
} else pass("bare open card stays bare");

const theirsPaint = ctx.cardHtml(Object.assign({ desk: "Other", side: "theirs" }, stacked));
if (theirsPaint.indexOf("Then draft") < 0 || theirsPaint.indexOf("Sam at the shop") < 0) {
  fail("theirs open card must paint the same thread");
} else pass("theirs open card paints the same thread");

async function main() {
  await ready();
  const slug = "people-open-desk";
  const pin = "4821";
  const shop = {
    slug: slug,
    name: "People Open",
    biz: slug,
    pin: hashPin(pin),
    createdAt: new Date().toISOString(),
    people: []
  };
  ensurePeople(shop);
  shop.people[0].name = "Owner Pat";
  shop.people.push({
    id: "p_helper",
    name: "Pat",
    role: "helper",
    kind: "helper",
    status: "approved",
    createdAt: new Date().toISOString()
  });
  mem.workspaces.unshift(shop);
  mem.jobs.push(Object.assign({}, stackedJob, { workspace: slug, id: "j-open-live" }));
  mem.jobs.push(Object.assign({}, goneJob, { workspace: slug, id: "j-gone-live" }));

  const out = await call(admin, "POST", { "x-workspace": slug, "x-pin": pin }, {
    action: "person",
    id: "p_helper",
    name: "Pat",
    desks: [{ slug: slug, pin: pin }]
  });
  if (out.statusCode !== 200 || !out.body || !out.body.ok) {
    fail("person book " + out.statusCode + " " + JSON.stringify(out.body));
  } else pass("person book returns");

  const cards = (out.body && out.body.cards) || [];
  const live = cards.find(function (c) { return c && c.id === "j-open-live"; });
  const gone = cards.find(function (c) { return c && c.id === "j-gone-live"; });
  if (!live) fail("person book must include the open stacked card");
  else pass("person book includes the open stacked card");
  if (!live || !live.draft || live.draft.indexOf("Ask who it is for") < 0) {
    fail("open card payload must keep Then draft, got " + JSON.stringify(live && live.draft));
  } else pass("open card payload keeps Then draft");
  if (!live || !live.deskAi || live.deskAi.name !== "James’s AI") {
    fail("open card payload must name the desk AI");
  } else pass("open card payload names the desk AI");
  if (!live || !live.thread || !live.thread.some(function (t) { return t.kind === "ask" && /Who is this for/.test(t.text || ""); })) {
    fail("open card payload must keep the AI ask");
  } else pass("open card payload keeps the AI ask");
  if (!live || !live.thread.some(function (t) { return t.kind === "reply" && /Sam at the shop/.test(t.text || ""); })) {
    fail("open card payload must keep the human reply");
  } else pass("open card payload keeps the human reply");
  if (!gone) fail("person book must include the gone open card");
  else pass("person book includes the gone open card");
  if (!gone || !gone.thenAiGone || gone.thenAiGone.name !== "Shop Bot <gone>") {
    fail("open card payload must keep thenAiGone");
  } else pass("open card payload keeps thenAiGone");
  if (gone && gone.deskAi) fail("gone open card payload must not invent a live desk AI");
  else pass("gone open card payload does not invent a live desk AI");
  if (out.body && (out.body.charged || (live && live.charged))) fail("person book must not charge");
  else pass("person book does not charge");

  const livePaint = ctx.cardHtml(live || {});
  if (live && (livePaint.indexOf("James") < 0 || livePaint.indexOf("Sam at the shop") < 0 || livePaint.indexOf("On the card. Nothing sent alone.") < 0)) {
    fail("person-book open card must paint Then / thread / HOLD");
  } else if (live) pass("person-book open card paints Then / thread / HOLD");

  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-people-open-cards: ok");
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
