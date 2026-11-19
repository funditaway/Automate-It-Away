#!/usr/bin/env node
"use strict";
require("./_env-guard");

// Presence B's Blob scenario runs in a child of this check (see presenceBlobChild at the end).
if (process.argv[2] === "--presence-blob") {
  presenceBlobChild().catch(function (e) { console.log("FAIL presence B blob: " + (e && e.stack || e)); process.exit(1); });
  return;
}

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
const moreTips = more + "\n" + read("aia-tip.js");
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
// a66b146 shortened More People copy; cd3dea6 (#325) set the current sub.
// Open-card Then draft honesty stays on people.html / help (assertions above).
function morePeopleSlice(src) {
  var out = "";
  var art = src.match(/<article class="more-item"[^>]*data-more-keys="people[^"]*"[\s\S]*?<\/article>/);
  if (art) out += art[0];
  var tip = src.match(/"more-people"\s*:\s*\{[\s\S]*?\n\s*\}/);
  if (tip) out += "\n" + tip[0];
  return out;
}
function morePeopleFaults(src) {
  const slice = morePeopleSlice(src);
  const bad = [];
  if (slice.indexOf("more-people") < 0) bad.push("missing more-people tip");
  if (slice.indexOf('href="/people"') < 0) bad.push("missing /people link");
  if (slice.indexOf("Invite members with @handle") < 0) bad.push("missing invite @handle");
  if (slice.indexOf("They Accept") < 0) bad.push("missing Accept");
  if (slice.indexOf("work the desk") < 0) bad.push("missing work the desk");
  if (slice.indexOf("Invite them to this desk") < 0) bad.push("missing tip invite");
  if (slice.indexOf("Nothing sends from here") < 0) bad.push("missing nothing sends");
  return bad;
}
(function () {
  const bad = morePeopleFaults(moreTips);
  if (bad.length) fail("more.html People must name invite / Accept / work the desk: " + bad.join("; "));
  else pass("more.html names People invite / Accept / work the desk");
})();
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

  // People presence (GET /api/admin desk read): Online / Offline / Not seen yet from the seenAt stamp
  // sessions already carry. Buckets only, own-desk sessions only, members only, nothing written.
  await (async function presenceChecks() {
    const A = "presence-desk-a";
    const B = "presence-desk-b";
    const ownerPinA = "6142";
    const ownerPinB = "6143";
    const T = Date.parse("2026-11-15T19:00:00.000Z");
    const iso = function (ms) { return new Date(ms).toISOString(); };
    const far = iso(T + 10 * 24 * 3600 * 1000);
    function seat(id, status, extra) {
      return Object.assign({ id: id, name: id, role: "helper", kind: "helper", status: status, createdAt: iso(T - 86400000) }, extra || {});
    }
    const deskA = { slug: A, name: "Presence A", biz: A, pin: hashPin(ownerPinA), createdAt: iso(T - 86400000), people: [] };
    const deskB = { slug: B, name: "Presence B", biz: B, pin: hashPin(ownerPinB), createdAt: iso(T - 86400000), people: [] };
    ensurePeople(deskA);
    ensurePeople(deskB);
    const ownerA = deskA.people[0].id;
    deskA.people.push(
      seat("s299", "approved"), seat("s300", "approved"), seat("s301", "approved"),
      seat("sNone", "approved"), seat("sExpired", "approved"), seat("sBad", "approved"), seat("sFuture", "approved"),
      seat("sCross", "approved"), seat("sAcct", "approved", { accountId: "acct_presence_x" }), seat("sTwo", "approved"),
      seat("sHelper", "approved", { pin: hashPin("7011") }),
      seat("sRemoved", "removed", { pin: hashPin("7012") }),
      seat("sPending", "pending", { pin: hashPin("7013") }),
      seat("sDenied", "denied", { pin: hashPin("7014") })
    );
    deskB.people.push(seat("sCross", "approved"), seat("bOnly", "approved", { accountId: "acct_presence_x" }));
    mem.workspaces.unshift(deskA, deskB);
    let n = 0;
    function sess(ws, personId, seenAt, expiresAt, extra) {
      n += 1;
      mem.sessions.push(Object.assign({ id: "sess_presence" + n, tokenHash: "presence-hash-" + n, workspace: ws, personId: personId, name: personId, role: "helper", createdAt: iso(T - 3600000), seenAt: seenAt, expiresAt: expiresAt === undefined ? far : expiresAt, ua: "PresenceUA/1.0", ip: "203.0.113.9" }, extra || {}));
    }
    sess(A, "s299", iso(T - 299000));
    sess(A, "s300", iso(T - 300000));
    sess(A, "s301", iso(T - 301000));
    sess(A, "sExpired", iso(T - 1000), iso(T - 1));
    sess(A, "sBad", "not-a-time");
    sess(A, "sFuture", iso(T + 10 * 60000));
    sess(B, "sCross", iso(T - 1000));
    sess(B, "bOnly", iso(T - 1000), undefined, { accountId: "acct_presence_x" });
    sess(A, "sGhost", iso(T - 1000), undefined, { accountId: "acct_presence_x" });
    sess(A, "sTwo", iso(T - 3600000));
    sess(A, "sTwo", iso(T - 2000));
    sess(A, "sRemoved", iso(T - 1000));
    sess(A, "sPending", iso(T - 1000));
    sess(A, "sDenied", iso(T - 1000));
    sess(A, "s299", iso(T - 1000), undefined, { workspace: B });
    await lib.save();

    const realNow = Date.now;
    async function getAt(headers) {
      Date.now = function () { return T; };
      try { return await call(admin, "GET", headers, {}, {}); } finally { Date.now = realNow; }
    }
    const want = {
      s299: "online", s300: "online", s301: "offline", sNone: "not-seen", sExpired: "not-seen", sBad: "offline",
      sFuture: "offline", sCross: "not-seen", sAcct: "not-seen", sTwo: "online", sHelper: "not-seen"
    };
    want[ownerA] = "not-seen";

    const disk0 = fs.readFileSync(store, "utf8");
    const own = await getAt({ "x-workspace": A, "x-pin": ownerPinA });
    const pres = own.body && own.body.presence;
    if (fs.readFileSync(store, "utf8") !== disk0) fail("presence: the owner read must not write the store");
    else pass("presence: the owner read writes nothing to the store");
    if (own.statusCode !== 200 || !pres) fail("presence: owner desk read must carry presence, got " + own.statusCode + " " + JSON.stringify(own.body && own.body.presence));
    else pass("presence: owner desk read carries presence");
    const list = (pres && Array.isArray(pres.people)) ? pres.people : [];
    const byId = {};
    list.forEach(function (p) { byId[p && p.id] = p && p.presence; });
    if (!pres || pres.window !== 300) fail("presence: window must be 300 seconds"); else pass("presence: window is 300 seconds");
    Object.keys(want).forEach(function (id) {
      if (byId[id] !== want[id]) fail("presence: " + id + " must be " + want[id] + ", got " + byId[id]);
      else pass("presence: " + id + " is " + want[id]);
    });
    ["s299", "s300"].forEach(function (id) { if (byId[id] !== "online") fail("presence: " + id + "s inside the window must be online"); else pass("presence: " + id + " inside the 300s window is online"); });
    if (byId.s301 !== "offline") fail("presence: 301s, just past the window, must not be online"); else pass("presence: 301s, just past the window, is offline");
    if (byId.sCross !== "not-seen") fail("presence: a desk-B session must not mark a desk-A seat online"); else pass("presence: desk-B session for the same seat id does not count on desk A");
    if (byId.sAcct !== "not-seen") fail("presence: a desk-B session of the same account must not count on desk A"); else pass("presence: same account's desk-B session does not count on desk A");
    if (byId.s299 !== "online" || list.filter(function (p) { return p.id === "s299"; }).length !== 1) fail("presence: one row per seat"); else pass("presence: one row per seat");
    ["sRemoved", "sPending", "sDenied", "bOnly"].forEach(function (id) {
      if (Object.prototype.hasOwnProperty.call(byId, id)) fail("presence: " + id + " must not be listed on desk A");
      else pass("presence: " + id + " is not listed on desk A");
    });
    if (list.length !== Object.keys(want).length) fail("presence: list must be exactly the open seats (" + Object.keys(want).length + "), got " + list.length);
    else pass("presence: list is exactly the " + list.length + " open seats");
    const tally = { online: 0, offline: 0, notSeen: 0 };
    list.forEach(function (p) { tally[p.presence === "not-seen" ? "notSeen" : p.presence] += 1; });
    const counts = (pres && pres.counts) || {};
    if (JSON.stringify(Object.keys(counts).sort()) !== JSON.stringify(["notSeen", "offline", "online"])) fail("presence: counts keys must be online / offline / notSeen");
    else pass("presence: counts keys are online / offline / notSeen");
    if (counts.online !== tally.online || counts.offline !== tally.offline || counts.notSeen !== tally.notSeen) fail("presence: counts must equal the list, got " + JSON.stringify(counts) + " vs " + JSON.stringify(tally));
    else pass("presence: counts equal the list");
    if (counts.online + counts.offline + counts.notSeen !== list.length) fail("presence: counts must add up to the list"); else pass("presence: counts add up to the list");
    if (counts.online !== 3 || counts.offline !== 3 || counts.notSeen !== 6) fail("presence: counts must be 3 / 3 / 6, got " + JSON.stringify(counts));
    else pass("presence: counts are 3 online / 3 offline / 6 not seen");
    const presJson = JSON.stringify(pres || {});
    if (/\d{4}-\d\d-\d\dT|seenAt|expiresAt|createdAt|PresenceUA|203\.0\.113|acct_presence|tokenHash|presence-hash|sess_presence|"ua"|"ip"/.test(presJson)) fail("presence: must carry no time, browser, address, account or session");
    else pass("presence: no time, browser, address, account or session in presence");
    if (!pres || JSON.stringify(Object.keys(pres).sort()) !== JSON.stringify(["counts", "people", "window"])) fail("presence: keys must be window / people / counts only");
    else pass("presence: keys are window / people / counts only");
    if (list.some(function (p) { return JSON.stringify(Object.keys(p).sort()) !== JSON.stringify(["id", "presence"]); })) fail("presence: each row must be id and presence only");
    else pass("presence: each row is id and presence only");
    if (list.some(function (p) { return ["online", "offline", "not-seen"].indexOf(p.presence) < 0; })) fail("presence: buckets must be online / offline / not-seen");
    else pass("presence: buckets are online / offline / not-seen");

    const helper = lib.issueSession(deskA.people.find(function (p) { return p.id === "sHelper"; }), deskA, null, { headers: {} });
    const hRow = mem.sessions.find(function (s) { return s.id === helper.id; });
    hRow.seenAt = iso(T - 3600000);
    // Presence B: this read falls inside the 2-minute stamp window (stamped 60 s before), so it writes nothing.
    hRow.stampAt = iso(T - 60000);
    await lib.save();
    const disk1 = fs.readFileSync(store, "utf8");
    const hr = await getAt({ "x-workspace": A, "x-session": helper.token });
    const hp = hr.body && hr.body.presence;
    if (hr.statusCode !== 200 || !hp) fail("presence: helper member must get presence, got " + hr.statusCode);
    else pass("presence: helper member gets presence");
    const hById = {};
    ((hp && hp.people) || []).forEach(function (p) { hById[p.id] = p.presence; });
    if (hById.sHelper !== "online") fail("presence: helper's own live session reads online, got " + hById.sHelper); else pass("presence: helper's own live session reads online");
    if (hp && /\d{4}-\d\d-\d\dT|seenAt|PresenceUA|203\.0\.113|acct_presence/.test(JSON.stringify(hp))) fail("presence: helper view leaks a time / browser / address / account");
    else pass("presence: helper view has no time / browser / address / account");
    if (fs.readFileSync(store, "utf8") !== disk1) fail("presence: the helper read must not write the store"); else pass("presence: the helper read writes nothing to the store");

    const bv = await getAt({ "x-workspace": B, "x-pin": ownerPinB });
    const bp = bv.body && bv.body.presence;
    const bIds = ((bp && bp.people) || []).map(function (p) { return p.id; }).sort();
    const bOwner = deskB.people[0].id;
    if (JSON.stringify(bIds) !== JSON.stringify([bOwner, "bOnly", "sCross"].sort())) fail("presence: desk B lists only desk B seats, got " + JSON.stringify(bIds));
    else pass("presence: desk B lists only desk B seats");
    const bById = {};
    ((bp && bp.people) || []).forEach(function (p) { bById[p.id] = p.presence; });
    if (bById.sCross !== "online" || bById.bOnly !== "online") fail("presence: desk B's own fresh sessions read online there"); else pass("presence: desk B's own sessions read online on desk B only");

    const bOwnerSession = lib.issueSession(deskB.people[0], deskB, null, { headers: {} });
    process.env.AIA_ADMIN_PIN = "presence-admin-fake-9911";
    const shut = [
      ["stranger", { "x-workspace": A }],
      ["wrong code", { "x-workspace": A, "x-pin": "0000" }],
      ["waiting seat", { "x-workspace": A, "x-pin": "7013" }],
      ["denied seat", { "x-workspace": A, "x-pin": "7014" }],
      ["removed seat code", { "x-workspace": A, "x-pin": "7012" }],
      ["desk-B session on desk A", { "x-workspace": A, "x-session": bOwnerSession.token }],
      ["platform admin branch", { "x-workspace": A, "x-admin-pin": "presence-admin-fake-9911" }]
    ];
    const removedSession = lib.issueSession(deskA.people.find(function (p) { return p.id === "sRemoved"; }), deskA, null, { headers: {} });
    shut.push(["removed seat session", { "x-workspace": A, "x-session": removedSession.token }]);
    for (const row of shut) {
      const r = await getAt(row[1]);
      const body = r.body || {};
      if (Object.prototype.hasOwnProperty.call(body, "presence") || JSON.stringify(body).indexOf('"presence"') >= 0 || JSON.stringify(body).indexOf("not-seen") >= 0) fail("presence: " + row[0] + " must get no presence (" + r.statusCode + ")");
      else pass("presence: " + row[0] + " gets no presence (" + r.statusCode + ")");
    }
    delete process.env.AIA_ADMIN_PIN;
    const statusOf = async function (h) { return (await getAt(h)).statusCode; };
    if (await statusOf({ "x-workspace": A }) !== 401) fail("presence: stranger gate stays 401"); else pass("presence: stranger gate stays 401");
    if (await statusOf({ "x-workspace": A, "x-pin": "7013" }) !== 403) fail("presence: waiting gate stays 403"); else pass("presence: waiting gate stays 403");
    if (await statusOf({ "x-workspace": A, "x-pin": "7014" }) !== 401) fail("presence: denied gate stays 401"); else pass("presence: denied gate stays 401");

    const own2 = await getAt({ "x-workspace": A, "x-pin": ownerPinA });
    const again = {};
    (((own2.body && own2.body.presence) || {}).people || []).forEach(function (p) { again[p.id] = p.presence; });
    const moved = Object.keys(want).filter(function (id) { return id !== "sHelper" && again[id] !== want[id]; });
    if (moved.length || again.sHelper !== "online") fail("presence: after the helper's own read only the helper turns online, moved " + JSON.stringify(moved) + " helper " + again.sHelper);
    else pass("presence: after the helper's own read only the helper turns online");
    if (fs.readFileSync(store, "utf8") !== disk1) fail("presence: no read (member, refused, admin branch) may write the store");
    else pass("presence: no read (member, refused, admin branch) writes the store");
  })();

  // Presence B (James, "Everything let's go", via Build lead): a session used on its own desk saves
  // its seenAt at most once per 2 minutes per session (through save()), and that same save writes
  // came-online / went-offline flips to the desk row's presenceLog. GET /api/admin?view=presence is
  // the 15 s poll; ?view=presence-log is owner-only. Store writes are counted on the store file.
  await (async function presenceBChecks() {
    const C = "presence-log-c";
    const D = "presence-log-d";
    const pinC = "6151";
    const pinD = "6152";
    const iso = function (ms) { return new Date(ms).toISOString(); };
    const MIN = 60000;
    const T0 = Date.parse("2026-11-15T12:03:40.000Z");
    const realNow = Date.now;
    const realWrite = fs.writeFileSync;
    let writes = 0;
    fs.writeFileSync = function (file) {
      if (String(file) === store) writes += 1;
      return realWrite.apply(fs, arguments);
    };
    async function at(ms, fn) {
      Date.now = function () { return ms; };
      try { return await fn(); } finally { Date.now = realNow; }
    }
    function seat(id, name, status, extra) {
      return Object.assign({ id: id, name: name, role: "helper", kind: "helper", status: status, createdAt: iso(T0 - 86400000) }, extra || {});
    }
    const deskC = { slug: C, name: "Presence C", biz: C, pin: hashPin(pinC), createdAt: iso(T0 - 86400000), people: [] };
    const deskD = { slug: D, name: "Presence D", biz: D, pin: hashPin(pinD), createdAt: iso(T0 - 86400000), people: [] };
    ensurePeople(deskC);
    ensurePeople(deskD);
    deskC.people[0].name = "Owner Cat";
    deskC.people.push(
      seat("hA", "Ana", "approved", { pin: hashPin("7101") }),
      seat("hB", "Ben", "approved"),
      seat("hC", "Cy", "approved"),
      seat("hRcase", "Rae", "Removed"),
      seat("hPpad", "Pia", " pending "),
      seat("hDcase", "Dee", "DENIED"),
      seat("hRm", "Rem", "removed"),
      seat("xA", "Xan", "approved", { accountId: "acct_presence_b" }),
      seat("hE", "Eve", "approved")
    );
    deskD.people.push(seat("hA", "Ana on D", "approved"), seat("dOnly", "Dot", "approved"), seat("xA", "Xan D", "approved", { accountId: "acct_presence_b" }));
    mem.workspaces.unshift(deskC, deskD);
    const seatOf = function (ws, id) { return ws.people.find(function (p) { return p.id === id; }); };
    const UA = "LeakUA/9.9 (PresencePhone)";
    const IP = "198.51.100.77";
    const reqH = { headers: { "user-agent": UA, "x-forwarded-for": IP } };
    const tok = {};
    await at(T0 - 30 * MIN, async function () {
      ["hA", "hB", "hC", "hE", "hRcase", "hPpad", "hDcase", "hRm"].forEach(function (id) { tok[id] = lib.issueSession(seatOf(deskC, id), deskC, null, reqH); });
      tok.owner = lib.issueSession(deskC.people[0], deskC, null, reqH);
      tok.dhA = lib.issueSession(seatOf(deskD, "hA"), deskD, null, reqH);
      tok.dOnly = lib.issueSession(seatOf(deskD, "dOnly"), deskD, null, reqH);
      tok.dOwner = lib.issueSession(deskD.people[0], deskD, null, reqH);
      tok.dxA = lib.issueSession(seatOf(deskD, "xA"), deskD, { id: "acct_presence_b" }, reqH, "password");
    });
    // hC starts with one entry inside the last 24 h (cap parity); desk D starts with 199 old entries.
    deskC.presenceLog = [{ seat: "hC", kind: "offline", at: iso(T0 - 60 * MIN - 220000) }, { seat: "hRm", kind: "online", at: iso(T0 - 90 * MIN - 220000) }];
    deskD.presenceLog = [];
    for (let i = 0; i < 199; i += 1) deskD.presenceLog.push({ seat: i === 0 ? "dOldest" : "dOnly", kind: i % 2 ? "offline" : "online", at: iso(T0 - 220000 - 3 * 86400000 + i * 5 * MIN) });
    // Saved out of time order: the entry dropped first is the oldest by time, not the first saved.
    deskD.presenceLog[100] = { seat: "dOlder", kind: "online", at: iso(T0 - 220000 - 4 * 86400000) };
    deskD.presenceLog[198].kind = "online";
    const rowOf = function (t) { return mem.sessions.find(function (s) { return s.id === t.id; }); };
    rowOf(tok.dOnly).stampAt = iso(T0 - 30 * MIN);
    // Eve: an old saved stamp, and her last entry is already "went offline" (an older log).
    rowOf(tok.hE).stampAt = iso(T0 - 30 * MIN);
    deskC.presenceLog.push({ seat: "hE", kind: "offline", at: iso(T0 - 25 * MIN - 220000) });
    await lib.save();
    const H = function (t, desk) { return { "x-workspace": desk || C, "x-session": t.token, "user-agent": UA, "x-forwarded-for": IP }; };
    const get = function (ms, headers, query) { return at(ms, function () { return call(admin, "GET", headers, {}, query || {}); }); };
    const logOf = function (ws, id) { return (ws.presenceLog || []).filter(function (e) { return !id || e.seat === id; }); };
    const fileStore = function () { return JSON.parse(fs.readFileSync(store, "utf8")); };
    function eq(label, got, want) {
      if (JSON.stringify(got) !== JSON.stringify(want)) fail("presence B: " + label + ": want " + JSON.stringify(want) + ", got " + JSON.stringify(got));
      else pass("presence B: " + label);
    }

    // 1. Write budget. First use of a session stamps once; reads inside 2 minutes write nothing.
    writes = 0;
    const first = await get(T0, H(tok.hA), { view: "presence" });
    eq("first session read stamps once (1 store write)", writes, 1);
    eq("view=presence answers ok + presence only", Object.keys(first.body || {}).sort(), ["ok", "presence"]);
    eq("view=presence: Ana reads online", (((first.body || {}).presence || {}).people || []).filter(function (p) { return p.id === "hA"; }).map(function (p) { return p.presence; }), ["online"]);
    eq("saved stamp is in the store file", (fileStore().sessions.find(function (s) { return s.id === tok.hA.id; }) || {}).stampAt, iso(T0));
    eq("saved seenAt is in the store file", (fileStore().sessions.find(function (s) { return s.id === tok.hA.id; }) || {}).seenAt, iso(T0));
    eq("came online is written once, at the 5-minute step", logOf(deskC, "hA"), [{ seat: "hA", kind: "online", at: "2026-11-15T12:00:00.000Z" }]);
    let budget = { reads: 1, writes: 1 };
    writes = 0;
    const shapes = [{ view: "presence" }, {}, { view: "presence-log" }];
    for (let i = 1; i <= 20; i += 1) await get(T0 + i * 5900, H(tok.hA), shapes[i % 3]);
    await get(T0 + 2 * MIN - 1, H(tok.hA), { view: "presence" });
    eq("21 more reads inside 2 minutes (poll, desk read, refused log read) write nothing", writes, 0);
    budget.reads += 21;
    await get(T0 + 2 * MIN, H(tok.hA), { view: "presence" });
    eq("at 2 minutes exactly: 1 more write", writes, 1);
    for (let i = 1; i <= 15; i += 1) await get(T0 + 2 * MIN + i * 7900, H(tok.hA), shapes[i % 3]);
    eq("15 more reads in the next 2 minutes write nothing", writes, 1);
    await get(T0 + 4 * MIN, H(tok.hA), {});
    eq("at 4 minutes: 1 more write (3 in all)", writes, 2);
    budget.reads += 17;
    budget.writes += writes;
    eq("still one came-online entry (no flip while active)", logOf(deskC, "hA").length, 1);
    writes = 0;
    for (let i = 0; i < 12; i += 1) await get(T0 + i * 20000, { "x-workspace": C, "x-pin": pinC }, i % 2 ? { view: "presence" } : {});
    for (let i = 0; i < 6; i += 1) await get(T0 + i * 20000, { "x-workspace": C, "x-pin": "7101" }, { view: "presence" });
    for (let i = 0; i < 6; i += 1) await get(T0 + i * 20000, { "x-workspace": C }, { view: "presence" });
    eq("desk-code (no session) and stranger reads never write (24 reads, 0 writes)", writes, 0);
    eq("desk-code reads write no presence entry", logOf(deskC, "hA").length, 1);
    console.log("ok   presence B write budget: session reads " + budget.reads + " in 4 min -> " + budget.writes + " store writes (1 at 0, 1 at 2:00, 1 at 4:00); 24 code/stranger reads -> 0");

    // 2. Flips. Back within 10 minutes: no pair. Away longer: went offline (last stamp + 5 min) + came online.
    let last = T0 + 4 * MIN;
    writes = 0;
    await get(last + 10 * MIN, H(tok.hA), {});
    eq("back after exactly 10 minutes: stamp saved (1 write)", writes, 1);
    eq("back after exactly 10 minutes: no offline / online pair", logOf(deskC, "hA").length, 1);
    last = last + 10 * MIN;
    await get(last + 30 * MIN, { "x-workspace": C, "x-pin": pinC }, {});
    eq("while away nothing is written (no fake went-offline)", logOf(deskC, "hA").length, 1);
    const awayView = await get(last + 30 * MIN, { "x-workspace": C, "x-pin": pinC }, { view: "presence" });
    eq("while away the live state reads offline", (((awayView.body || {}).presence || {}).people || []).filter(function (p) { return p.id === "hA"; }).map(function (p) { return p.presence; }), ["offline"]);
    writes = 0;
    await get(last + 10 * MIN + 1, H(tok.hA), { view: "presence" });
    eq("back after 10 min + 1 ms: 1 write", writes, 1);
    eq("went offline at last stamp + 5 min, came online now (5-minute steps)", logOf(deskC, "hA"), [
      { seat: "hA", kind: "online", at: "2026-11-15T12:00:00.000Z" },
      { seat: "hA", kind: "offline", at: "2026-11-15T12:20:00.000Z" },
      { seat: "hA", kind: "online", at: "2026-11-15T12:25:00.000Z" }
    ]);
    last = last + 10 * MIN + 1;

    // Last entry already "went offline": the next came-online adds no second went-offline.
    writes = 0;
    await get(T0, H(tok.hE), { view: "presence" });
    eq("after a saved went-offline only came-online is added (1 write)", [writes, logOf(deskC, "hE")], [1, [
      { seat: "hE", kind: "offline", at: "2026-11-15T11:35:00.000Z" },
      { seat: "hE", kind: "online", at: "2026-11-15T12:00:00.000Z" }
    ]]);

    // 3. Per-person cap: 12 in a rolling 24 h. Ben starts empty (1, 3, ... 11), Cy starts with 1 (2, ... 12).
    const capBase = T0 + 2 * 3600000;
    writes = 0;
    for (let k = 0; k < 8; k += 1) {
      await get(capBase + k * 11 * MIN, H(tok.hB), { view: "presence" });
      await get(capBase + k * 11 * MIN + 30000, H(tok.hC), { view: "presence" });
    }
    eq("cap: every due stamp still saves (16 writes)", writes, 16);
    eq("cap: Ben stops at 11 (the next pair would be 13 > 12)", logOf(deskC, "hB").length, 11);
    eq("cap: Cy stops at 12 (seeded 1 + online + 5 pairs)", logOf(deskC, "hC").length, 12);
    eq("cap: Ben's last written entry is the 6th came-online", logOf(deskC, "hB").slice(-1).map(function (e) { return e.kind; }), ["online"]);
    await get(capBase + 7 * 11 * MIN + 25 * 3600000, H(tok.hB), { view: "presence" });
    eq("cap is rolling: 24 h later Ben writes again (a new pair)", logOf(deskC, "hB").length, 13);

    // 4. Per-desk cap: 200, oldest dropped first.
    writes = 0;
    await get(T0, H(tok.dOnly, D), { view: "presence" });
    eq("desk cap: desk D keeps 200 entries", logOf(deskD).length, 200);
    eq("desk cap: the oldest entry by time is dropped first", logOf(deskD, "dOlder").length, 0);
    eq("desk cap: the first-saved (newer) entry is kept", logOf(deskD, "dOldest").length, 1);
    eq("desk cap: the new pair is at the end", logOf(deskD).slice(-2), [
      { seat: "dOnly", kind: "offline", at: "2026-11-15T11:35:00.000Z" },
      { seat: "dOnly", kind: "online", at: "2026-11-15T12:00:00.000Z" }
    ]);
    eq("desk cap: 1 write", writes, 1);

    // 5. Shut seats (any case / padding) and other desks write nothing.
    const dxStamp = rowOf(tok.dxA).stampAt;
    eq("desk D's account session was stamped at its desk D login", dxStamp, iso(T0 - 30 * MIN));
    const cBefore = JSON.stringify(deskC.presenceLog);
    const dBefore = JSON.stringify(deskD.presenceLog);
    writes = 0;
    for (const id of ["hRcase", "hPpad", "hDcase", "hRm"]) {
      await get(T0 + 5 * MIN, H(tok[id]), {});
      await get(T0 + 5 * MIN, H(tok[id]), { view: "presence" });
      if (rowOf(tok[id]) && rowOf(tok[id]).stampAt) fail("presence B: " + id + " session must not be stamped");
      else pass("presence B: " + id + " (" + JSON.stringify(seatOf(deskC, id).status) + ") session is not stamped");
    }
    await get(T0 + 5 * MIN, H(tok.dhA, C), {});
    await get(T0 + 5 * MIN, H(tok.dhA, C), { view: "presence" });
    await get(T0 + 5 * MIN, H(tok.hA, D), { view: "presence" });
    await get(T0 + 5 * MIN, H(tok.dxA, C), {});
    eq("removed / waiting / denied seats and cross-desk sessions: 0 writes", writes, 0);
    eq("desk C log unchanged by shut seats and other desks", JSON.stringify(deskC.presenceLog) === cBefore, true);
    eq("desk D log unchanged by desk C sessions", JSON.stringify(deskD.presenceLog) === dBefore, true);
    eq("an account session from desk D used on desk C is not stamped", rowOf(tok.dxA).stampAt, dxStamp);
    writes = 0;
    await get(T0 + 5 * MIN, H(tok.dhA, D), { view: "presence" });
    eq("desk D's own hA session stamps on desk D (1 write)", writes, 1);
    eq("desk D's hA lands in desk D's log only", logOf(deskD, "hA").length === 1 && JSON.stringify(deskC.presenceLog) === cBefore, true);

    // 6. Nothing leaks: entries are seat / kind / 5-minute time only.
    const stored = fileStore().workspaces.filter(function (w) { return w.slug === C || w.slug === D; });
    const keysBad = [];
    stored.forEach(function (w) { (w.presenceLog || []).forEach(function (e) { if (JSON.stringify(Object.keys(e).sort()) !== JSON.stringify(["at", "kind", "seat"])) keysBad.push(e); }); });
    eq("stored entries are seat / kind / at only", keysBad, []);
    const storedJson = JSON.stringify(stored.map(function (w) { return w.presenceLog; }));
    eq("stored log carries no browser, address, session or account", /LeakUA|PresencePhone|198\.51\.100|sess_|tokenHash|acct_presence|"ua"|"ip"|Ana|Ben/.test(storedJson), false);
    eq("stored times are on 5-minute steps", stored.every(function (w) { return (w.presenceLog || []).every(function (e) { return Date.parse(e.at) % (5 * MIN) === 0; }); }), true);

    // 7. Owner-only log read.
    seatOf(deskC, "hA").name = "Ana Renamed";
    const own = await get(T0 + 6 * MIN, { "x-workspace": C, "x-pin": pinC }, { view: "presence-log" });
    const entries = (((own.body || {}).presenceLog) || {}).entries || [];
    eq("owner log read is 200 with ok + presenceLog", [own.statusCode, Object.keys(own.body || {}).sort()], [200, ["ok", "presenceLog"]]);
    eq("owner log entries are seat / name / kind / at", entries.every(function (e) { return JSON.stringify(Object.keys(e).sort()) === JSON.stringify(["at", "kind", "name", "seat"]); }) && entries.length > 0, true);
    eq("owner log names are read now", entries.filter(function (e) { return e.seat === "hA"; }).map(function (e) { return e.name; }), ["Ana Renamed", "Ana Renamed", "Ana Renamed"]);
    eq("owner log is newest first", entries.length > 1 && entries.every(function (e, i) { return i === 0 || Date.parse(entries[i - 1].at) >= Date.parse(e.at); }), true);
    eq("owner log leaves out removed seats", entries.filter(function (e) { return e.seat === "hRm"; }).length, 0);
    eq("owner log is this desk only", entries.filter(function (e) { return e.name === "Ana on D" || e.seat === "dOnly"; }).length, 0);
    eq("owner log count = stored open-seat entries", entries.length, logOf(deskC).filter(function (e) { return e.seat !== "hRm"; }).length);
    eq("owner log carries no browser, address, session or account", /LeakUA|PresencePhone|198\.51\.100|sess_|tokenHash|acct_presence|seenAt|stampAt|expiresAt|"ua"|"ip"/.test(JSON.stringify(own.body)), false);
    const ownS = await get(T0 + 6 * MIN, H(tok.owner), { view: "presence-log" });
    eq("owner session reads the same log", JSON.stringify((ownS.body || {}).presenceLog), JSON.stringify((own.body || {}).presenceLog));
    const stranger = await get(T0 + 6 * MIN, { "x-workspace": C }, { view: "presence-log" });
    eq("stranger log read is the plain 401", [stranger.statusCode, stranger.body], [401, { ok: false, error: "Pin required." }]);
    const refused = [
      ["helper session", H(tok.hB)], ["helper desk code", { "x-workspace": C, "x-pin": "7101" }],
      ["removed seat session", H(tok.hRm)], ["Removed (case) seat session", H(tok.hRcase)], ["DENIED (case) seat session", H(tok.hDcase)],
      ["desk D owner session on C", H(tok.dOwner, C)], ["desk D owner code on C", { "x-workspace": C, "x-pin": pinD }],
      ["desk D account session on C", H(tok.dxA, C)], ["wrong code", { "x-workspace": C, "x-pin": "0000" }]
    ];
    for (const r of refused) {
      const got = await get(T0 + 6 * MIN, r[1], { view: "presence-log" });
      eq("log read refused like a stranger: " + r[0], [got.statusCode, got.body], [stranger.statusCode, stranger.body]);
    }
    const waiting = await get(T0 + 6 * MIN, H(tok.hPpad), { view: "presence-log" });
    eq("padded pending seat gets no log", JSON.stringify(waiting.body || {}).indexOf("presenceLog") < 0 && JSON.stringify(waiting.body || {}).indexOf("entries") < 0, true);
    const dOwn = await get(T0 + 6 * MIN, { "x-workspace": D, "x-pin": pinD }, { view: "presence-log" });
    const dEntries = (((dOwn.body || {}).presenceLog) || {}).entries || [];
    eq("desk D owner reads desk D's log only", dEntries.length > 0 && dEntries.every(function (e) { return ["dOnly", "hA", "xA"].indexOf(e.seat) >= 0; }) && dEntries.some(function (e) { return e.name === "Ana on D"; }), true);
    for (const r of [["owner desk read", { "x-workspace": C, "x-pin": pinC }], ["helper desk read", H(tok.hB)]]) {
      const got = await get(T0 + 6 * MIN, r[1], {});
      eq(r[0] + " carries no presenceLog", JSON.stringify(got.body || {}).indexOf("presenceLog") < 0 && JSON.stringify(got.body || {}).indexOf("went offline") < 0, true);
    }
    process.env.AIA_ADMIN_PIN = "presence-b-admin-fake-4410";
    const plat = await get(T0 + 6 * MIN, { "x-workspace": C, "x-admin-pin": "presence-b-admin-fake-4410" }, { view: "presence-log" });
    eq("platform admin branch carries no presence log", plat.statusCode === 200 && JSON.stringify(plat.body || {}).indexOf("presenceLog") < 0 && !Object.prototype.hasOwnProperty.call(plat.body || {}, "presence"), true);
    delete process.env.AIA_ADMIN_PIN;

    // 8. view=presence gate: member only, same block as the desk read.
    const pollAt = T0 + 6 * MIN;
    const poll = await get(pollAt, { "x-workspace": C, "x-pin": pinC }, { view: "presence" });
    const full = await get(pollAt, { "x-workspace": C, "x-pin": pinC }, {});
    eq("view=presence equals the desk read's presence block", JSON.stringify((poll.body || {}).presence), JSON.stringify((full.body || {}).presence));
    eq("view=presence is ok + presence only", Object.keys(poll.body || {}).sort(), ["ok", "presence"]);
    const helperPoll = await get(pollAt, { "x-workspace": C, "x-pin": "7101" }, { view: "presence" });
    eq("helper member (desk code) gets the poll", helperPoll.statusCode === 200 && !!(helperPoll.body || {}).presence, true);
    writes = 0;
    const gate = [
      ["stranger", { "x-workspace": C }], ["wrong code", { "x-workspace": C, "x-pin": "0000" }],
      ["padded pending session", H(tok.hPpad)], ["DENIED (case) session", H(tok.hDcase)], ["Removed (case) session", H(tok.hRcase)],
      ["removed session", H(tok.hRm)], ["desk D session on C", H(tok.dhA, C)], ["desk D owner code on C", { "x-workspace": C, "x-pin": pinD }]
    ];
    for (const g of gate) {
      const got = await get(pollAt, g[1], { view: "presence" });
      const txt = JSON.stringify(got.body || {});
      if (got.statusCode === 200 || txt.indexOf("presence") >= 0 || /not-seen|"online"|"offline"/.test(txt)) fail("presence B: view=presence must refuse " + g[0] + " (" + got.statusCode + " " + txt + ")");
      else pass("presence B: view=presence refuses " + g[0] + " (" + got.statusCode + ")");
    }
    eq("refused polls write nothing", writes, 0);

    // 9. Probe P10 / P11 / P7 / P16. Every legacy desk's owner seat is "p_owner" (ensurePeople).
    // P10: a session on ANOTHER desk with the same seat id never feeds this desk's last-seen, and
    // never merges or hides this desk's offline / online pair. P11: another session's future stamp
    // (clock skew) is not a last-seen either.
    const E = "presence-log-e";
    const F = "presence-log-f";
    const deskE = { slug: E, name: "Presence E", biz: E, pin: hashPin("6153"), createdAt: iso(T0 - 86400000) };
    const deskF = { slug: F, name: "Presence F", biz: F, pin: hashPin("6154"), createdAt: iso(T0 - 86400000) };
    ensurePeople(deskE);
    ensurePeople(deskF);
    mem.workspaces.unshift(deskE, deskF);
    eq("legacy owners on E and F share the seat id p_owner", [deskE.people[0].id, deskF.people[0].id], ["p_owner", "p_owner"]);
    const TE = T0 + 10 * 86400000 + 2 * 3600000;
    const stepIso = function (ms) { return iso(Math.floor(ms / (5 * MIN)) * 5 * MIN); };
    await at(TE, async function () {
      tok.eOwn = lib.issueSession(deskE.people[0], deskE, null, reqH);
      tok.eSkew = lib.issueSession(deskE.people[0], deskE, null, reqH);
      tok.fOwn = lib.issueSession(deskF.people[0], deskF, null, reqH);
    });
    rowOf(tok.eSkew).stampAt = iso(TE + 1000 * MIN);
    await lib.save();
    const eLog = function () { return logOf(deskE, "p_owner").map(function (e) { return [e.kind, e.at]; }); };
    eq("E owner login: one came-online", eLog(), [["online", stepIso(TE)]]);
    await get(TE + 20 * MIN, H(tok.fOwn, F), { view: "presence" });
    await get(TE + 45 * MIN, H(tok.fOwn, F), { view: "presence" });
    eq("F owner's own pair is F's (off at login+5, on at +20)", logOf(deskF, "p_owner").map(function (e) { return [e.kind, e.at]; }).slice(0, 3), [["online", stepIso(TE)], ["offline", stepIso(TE + 5 * MIN)], ["online", stepIso(TE + 20 * MIN)]]);
    eq("F's reads write nothing on E", eLog(), [["online", stepIso(TE)]]);
    await get(TE + 50 * MIN, H(tok.eOwn, E), { view: "presence" });
    eq("E owner back after 50 min: pair from E's own stamp, not F's (5 min ago) or the future stamp", eLog(), [["online", stepIso(TE)], ["offline", stepIso(TE + 5 * MIN)], ["online", stepIso(TE + 50 * MIN)]]);
    await get(TE + 70 * MIN, H(tok.fOwn, F), { view: "presence" });
    await get(TE + 90 * MIN, H(tok.eOwn, E), { view: "presence" });
    eq("E's last-seen is E's own +50 stamp, not F's +70", eLog().slice(3), [["offline", stepIso(TE + 55 * MIN)], ["online", stepIso(TE + 90 * MIN)]]);

    // P7: the per-seat cap of 12 counts a rolling 24 h: an entry exactly 24 h old is out, 24 h - 1 ms is in.
    const TL = TE + 2 * 86400000;
    deskE.people.push(seat("cOut", "Cap Out", "approved"), seat("cIn", "Cap In", "approved"));
    const capSeed = function (id, edgeAt) {
      const list = [{ seat: id, kind: "online", at: iso(edgeAt) }];
      for (let i = 0; i < 11; i += 1) list.push({ seat: id, kind: i % 2 ? "online" : "offline", at: stepIso(TL - (11 - i) * 60 * MIN) });
      list[list.length - 1].kind = "offline";
      return list;
    };
    deskE.presenceLog = deskE.presenceLog.concat(capSeed("cOut", TL - 86400000), capSeed("cIn", TL - 86400000 + 1));
    await at(TL, async function () {
      tok.cOut = lib.issueSession(seatOf(deskE, "cOut"), deskE, null, reqH);
      tok.cIn = lib.issueSession(seatOf(deskE, "cIn"), deskE, null, reqH);
    });
    eq("cap edge: entry exactly 24 h old is out of the window (11 + 1 = 12 is written)", logOf(deskE, "cOut").length, 13);
    eq("cap edge: entry 24 h - 1 ms old is in the window (12 + 1 = 13 is refused)", logOf(deskE, "cIn").length, 12);
    await lib.save();

    // P16: while a stamp is due, the reply waits until the stamp save is done.
    let writesAtReply = -1;
    const heldRes = mockRes();
    heldRes.json = function (b) { writesAtReply = writes; this.body = b; return this; };
    writes = 0;
    await at(TL + 30 * MIN, function () { return admin({ method: "GET", headers: H(tok.cOut, E), body: {}, query: { view: "presence" } }, heldRes); });
    eq("a due stamp: the reply is sent only after its save (1 write before the reply)", [writesAtReply, writes, heldRes.statusCode], [1, 1, 200]);

    fs.writeFileSync = realWrite;
  })();

  // Presence B across instances (fake Blob in a child process: production-shaped store, no network).
  (function presenceBlob() {
    const r = spawnSync(process.execPath, [__filename, "--presence-blob"], {
      encoding: "utf8", timeout: 60000,
      env: { PATH: process.env.PATH || "", HOME: process.env.HOME || "", TMPDIR: os.tmpdir() }
    });
    const out = String(r.stdout || "") + String(r.stderr || "");
    out.split("\n").forEach(function (line) {
      if (/^ok   /.test(line)) pass(line.slice(5));
      else if (/^FAIL /.test(line)) fail(line.slice(5));
    });
    if (r.status !== 0 || out.indexOf("presence-blob: done") < 0) fail("presence B blob child must finish clean (" + r.status + "): " + out.split("\n").filter(function (l) { return /FAIL|Error/.test(l); }).slice(0, 3).join(" | "));
    else pass("presence B blob child finished");
  })();

  // Mutants for the updated More People assertion. In-memory only.
  function swap(s, from, to) { return s.indexOf(from) < 0 ? null : s.split(from).join(to); }
  const MUTANTS = [
    ["more People tip id gone", function () {
      const t = swap(moreTips, "more-people", "more-crew");
      return t && morePeopleFaults(t);
    }],
    ["more People sub drops invite @handle", function () {
      const t = swap(moreTips, "Invite members with @handle", "Invite a helper");
      return t && morePeopleFaults(t);
    }],
    ["more People sub drops work the desk", function () {
      const t = swap(moreTips, "work the desk", "watch the desk");
      return t && morePeopleFaults(t);
    }],
    ["more People drops They Accept", function () {
      const t = swap(moreTips, "They Accept", "They wait");
      return t && morePeopleFaults(t);
    }],
    ["more People tip drops invite them", function () {
      const t = swap(moreTips, "Invite them to this desk", "Mention them on this desk");
      return t && morePeopleFaults(t);
    }],
    ["more People tip drops nothing sends", function () {
      const t = swap(moreTips, "They Accept. Nothing sends from here.", "They Accept. The desk may send.");
      return t && morePeopleFaults(t);
    }]
  ];
  let mutCaught = 0;
  MUTANTS.forEach(function (m) {
    let out;
    try { out = m[1](); } catch (e) { out = ["threw " + e.message]; }
    if (out === null || out === false || out === undefined) fail("mutant does not apply: " + m[0]);
    else if (out.length) { mutCaught += 1; console.log("ok   mutant caught: " + m[0] + " (" + out[0] + ")"); }
    else fail("mutant survived: " + m[0]);
  });
  if (!failed) console.log("check-people-open-cards mutants: " + mutCaught + "/" + MUTANTS.length + " caught");

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

// Child for the presence-B Blob scenario: fake @vercel/blob and fetch, production-shaped env, a
// pinned clock. Prints ok / FAIL lines for the parent. Self-contained (runs before the main body).
async function presenceBlobChild() {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const crypto = require("crypto");
  const Module = require("module");
  const KEY = "aia/store.json";
  const HOST = "https://testhost.private.blob.vercel-storage.com/";
  const files = Object.create(null);
  const counts = { puts: 0, reads: 0 };
  let bad = 0;
  const ok = function (m) { console.log("ok   presence B blob: " + m); };
  const no = function (m) { bad += 1; console.log("FAIL presence B blob: " + m); };
  const eq = function (m, got, want) { if (JSON.stringify(got) === JSON.stringify(want)) ok(m); else no(m + ": want " + JSON.stringify(want) + ", got " + JSON.stringify(got)); };
  const orig = Module._load;
  Module._load = function (request) {
    if (request === "@vercel/blob") {
      return {
        async head(key) { counts.reads += 1; if (!files[KEY]) throw new Error("Vercel Blob: The requested blob does not exist"); return { pathname: KEY, url: HOST + KEY, downloadUrl: HOST + KEY }; },
        async get() { counts.reads += 1; const raw = files[KEY]; return raw ? { statusCode: 200, stream: { text: async function () { return raw; } }, blob: { url: HOST + KEY } } : null; },
        async list() { return { blobs: Object.keys(files).map(function (k) { return { pathname: k, url: HOST + k }; }), hasMore: false }; },
        async put(key, body) { const k = String(key); if (k === KEY) counts.puts += 1; files[k] = Buffer.isBuffer(body) ? body.toString("utf8") : String(body); return { url: HOST + k, downloadUrl: HOST + k }; },
        async del() {}, async copy() { return {}; }
      };
    }
    return orig.apply(this, arguments);
  };
  global.fetch = async function (url) {
    const u = String(url || "");
    if (u.indexOf("blob.vercel-storage.com") < 0) throw new Error("no network in presence-blob child: " + u);
    counts.reads += 1;
    return files[KEY] ? { ok: true, status: 200, text: async function () { return files[KEY]; } } : { ok: false, status: 404, statusText: "Not Found", text: async function () { return ""; } };
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-presence-blob-"));
  process.env.VERCEL_ENV = "production";
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_testhost_fake";
  process.env.BLOB_STORE_ID = "testhost";
  process.env.AIA_STORE_PATH = path.join(tmp, "store.json");
  process.env.AIA_TLD_PROBE = "0";
  const hash = function (pin) { return crypto.createHash("sha256").update(String(pin) + ":" + (process.env.AIA_PIN_SALT || "aia-pilot")).digest("hex"); };
  const DESK = "presence-blob";
  const T0 = Date.parse("2026-11-15T15:01:10.000Z");
  const MIN = 60000;
  let now = T0 - 10 * MIN;
  const realNow = Date.now;
  Date.now = function () { return now; };
  const seed = {
    account: null, accounts: [], approvals: [], locks: [], connections: [], jobs: [], audit: [], money: [], inbox: [], files: [], tickets: [], packs: [], mail: [], migrations: {},
    // An expired session of another seat sits in the store: dropping it on a read must not block the stamp.
    sessions: [{ id: "sess_old", tokenHash: "old-hash", workspace: DESK, personId: "p_x", name: "x", role: "helper", createdAt: new Date(T0 - 40 * 86400000).toISOString(), seenAt: new Date(T0 - 40 * 86400000).toISOString(), expiresAt: new Date(T0 - 20 * 86400000).toISOString() }],
    workspaces: [{ slug: DESK, name: "PB", biz: "PB", pin: hash("4821"), people: [
      { id: "p_owner", name: "Owner", role: "owner", pin: hash("4821") },
      { id: "p_h", name: "Helper", role: "helper", kind: "helper", status: "approved" },
      { id: "p_x", name: "Gone", role: "helper", kind: "helper", status: "approved" }
    ] }]
  };
  files[KEY] = JSON.stringify(seed);
  fs.writeFileSync(process.env.AIA_STORE_PATH, JSON.stringify(seed));
  const lib = require("../api/_lib");
  const admin = require("../api/admin");
  const res = function () { return { headers: {}, statusCode: 200, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, end() { return this; } }; };
  const get = async function (ms, headers, query) { now = ms; const r = res(); await admin({ method: "GET", headers: headers, query: query || {}, body: {}, url: "/api/admin" }, r); return r; };
  const blobSess = function () { const s = JSON.parse(files[KEY]); return (s.sessions || []).find(function (x) { return x.personId === "p_h"; }) || {}; };
  const helperIn = function (r) { const p = ((((r.body || {}).presence) || {}).people || []).find(function (x) { return x.id === "p_h"; }); return p ? p.presence : "(none " + r.statusCode + ")"; };
  const ownerH = { "x-workspace": DESK, "x-pin": "4821" };
  await lib.ready();
  eq("store driver is blob", lib.mem.driver, "blob");
  await get(T0 - 9 * MIN, ownerH, {});
  now = T0;
  const ws = lib.mem.workspaces.find(function (w) { return w.slug === DESK; });
  const pLogin = counts.puts;
  const s = lib.issueSession(ws.people[1], ws, null, { headers: {} });
  await lib.save();
  // The login's own save is the first stamp and carries the came-online entry: no extra put.
  eq("login: one put (the login's own save)", counts.puts - pLogin, 1);
  eq("login: the put carries the stamp", blobSess().stampAt, new Date(T0).toISOString());
  eq("login: the put carries came-online", (JSON.parse(files[KEY]).workspaces[0].presenceLog || []), [{ seat: "p_h", kind: "online", at: "2026-11-15T15:00:00.000Z" }]);
  const p0 = counts.puts;
  const hH = { "x-workspace": DESK, "x-session": s.token };
  await get(T0 + 3000, hH, { view: "presence" });
  eq("first read right after login puts nothing", counts.puts - p0, 0);
  for (let i = 1; i <= 12; i += 1) await get(T0 + 3000 + i * 9500, hH, i % 2 ? { view: "presence" } : {});
  eq("12 more reads inside 2 minutes (each past the 2 s reload) put nothing", counts.puts - p0, 0);
  // Another instance saved an already-expired session: dropping it on this read must not hold the stamp back.
  const withOld = JSON.parse(files[KEY]);
  withOld.sessions.push({ id: "sess_old2", tokenHash: "old-hash-2", workspace: DESK, personId: "p_x", name: "x", role: "helper", createdAt: new Date(T0 - 40 * 86400000).toISOString(), seenAt: new Date(T0 - 40 * 86400000).toISOString(), expiresAt: new Date(T0 - 86400000).toISOString() });
  files[KEY] = JSON.stringify(withOld);
  await get(T0 + 3000 + 2 * MIN - 5000, hH, {});
  await get(T0 + 3000 + 2 * MIN, hH, { view: "presence" });
  eq("at 2 minutes after login: 1 put", counts.puts - p0, 1);
  eq("the put carries the stamp", blobSess().stampAt, new Date(T0 + 3000 + 2 * MIN).toISOString());
  const saved = T0 + 3000 + 2 * MIN;
  const o1 = await get(saved + 4.5 * MIN, ownerH, { view: "presence" });
  eq("after reloads, the owner sees the helper online from the saved stamp (4.5 min later)", helperIn(o1), "online");
  eq("the reload kept the saved stamp", lib.mem.sessions.find(function (x) { return x.id === s.id; }).stampAt, new Date(saved).toISOString());
  const o2 = await get(saved + 5 * MIN + 1000, ownerH, { view: "presence" });
  eq("5 min after the last saved stamp the helper reads offline (not faked online)", helperIn(o2), "offline");
  // Another instance stamps first: this instance's memory is fresh (<2 s) but old, so the request
  // notes a due stamp; the forced re-read sees the other stamp and writes nothing.
  const t2 = saved + 6 * MIN;
  await get(t2, ownerH, {});
  const other = JSON.parse(files[KEY]);
  const os2 = other.sessions.find(function (x) { return x.personId === "p_h"; });
  os2.stampAt = new Date(t2 + 200).toISOString();
  os2.seenAt = os2.stampAt;
  files[KEY] = JSON.stringify(other);
  const p1 = counts.puts;
  await get(t2 + 900, hH, { view: "presence" });
  eq("another instance's fresh stamp: no second put", counts.puts - p1, 0);
  eq("another instance's stamp is not overwritten", blobSess().stampAt, new Date(t2 + 200).toISOString());
  // A fresh instance reads what was saved.
  ["__aia", "__aiaHydrate", "__aiaStoreLoaded", "__aiaColdInflight", "__aiaColdTried", "__aiaHydrateRejected"].forEach(function (k) { delete global[k]; });
  Object.keys(require.cache).forEach(function (id) { if (/\/api\/[^/]+\.js$/.test(id)) delete require.cache[id]; });
  const lib2 = require("../api/_lib");
  const admin2 = require("../api/admin");
  now = t2 + 4 * MIN;
  await lib2.ready();
  const r2 = res();
  await admin2({ method: "GET", headers: ownerH, query: { view: "presence-log" }, body: {}, url: "/api/admin" }, r2);
  const ent = (((r2.body || {}).presenceLog) || {}).entries || [];
  eq("fresh instance: owner log has the helper's came-online", ent.map(function (e) { return [e.seat, e.kind, e.at]; }), [["p_h", "online", "2026-11-15T15:00:00.000Z"]]);
  const r3 = res();
  await admin2({ method: "GET", headers: ownerH, query: { view: "presence" }, body: {}, url: "/api/admin" }, r3);
  eq("fresh instance: helper online from the other instance's saved stamp", helperIn(r3), "online");
  Date.now = realNow;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log(bad ? "presence-blob: " + bad + " failed" : "presence-blob: done");
  process.exit(bad ? 1 : 0);
}
