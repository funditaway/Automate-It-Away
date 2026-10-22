#!/usr/bin/env node
// Proves POST /api/jobs actions on a card need a seat on that desk.
// A stranger who sends only X-Workspace and a card id is refused on every
// non-capture action, gets no card fields back, changes nothing, and fires
// no pipe. A seated owner and helper still work the card. Capture stays open.
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const store = path.join(os.tmpdir(), "aia-jobs-need-seat-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
Object.keys(process.env).forEach(function (k) {
  if (/BLOB|VERCEL|XAI|GROK|OPENAI|ANTHROPIC/.test(k)) delete process.env[k];
});
delete global.__aia;
delete global.__aiaHydrate;

const fetches = [];
global.fetch = async function (url) {
  fetches.push(String(url));
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
async function call(handler, method, headers, body) {
  const res = mockRes();
  await handler({ method: method, headers: headers || {}, body: body || {}, query: {}, url: "/api/jobs" }, res);
  return res;
}

const HOOK = "https://hooks.example.test/jobs-need-seat-pipe";
const CARD = {
  title: "Seat secret title",
  notes: "Seat secret notes",
  phone: "555-0177",
  email: "client-seat@example.test",
  file: "https://blob.example.test/seat-secret.pdf",
  thread: "Seat secret thread line"
};
const STRANGER_ACTIONS = [
  ["say", { text: "stranger note" }],
  ["fill", { custom: { price: "1" } }],
  ["ask", { text: "stranger ask?" }],
  ["hand", { text: "stranger hand" }],
  ["done", { text: "stranger done" }],
  ["priority", {}],
  ["cap", {}],
  ["uncap", {}],
  ["assign", { name: "Sam" }],
  ["schedule", { dueAt: "2030-01-01T00:00:00Z" }],
  ["due", { dueAt: "2030-01-02T00:00:00Z" }],
  ["expire", { expireAt: "2030-01-03T00:00:00Z" }],
  ["snooze", { until: "in 2 hours" }],
  ["qualify", { why: "stranger why" }],
  ["recommend", {}],
  ["ship", { provider: "webhook", confirm: true }],
  ["carry", { text: "stranger carry" }],
  ["kill", { confirm: true }],
  ["reply", { text: "stranger reply" }],
  ["define-field", { label: "Stranger field" }],
  ["bind-ai", { aiId: "x" }],
  ["set-ai", { ai: "ai_needseat" }],
  ["assign-ai", { ai: "ai_needseat" }],
  ["no-such-action", {}]
];

function noCardFields(res, label) {
  const blob = JSON.stringify(res.body == null ? "" : res.body);
  if (res.body && (res.body.job || res.body.jobs || res.body.nextJob)) fail(label + " returned a card: " + blob.slice(0, 300));
  Object.keys(CARD).forEach(function (k) {
    if (blob.indexOf(CARD[k]) >= 0) fail(label + " leaked card " + k + ": " + blob.slice(0, 300));
  });
  if (blob.indexOf("job_needseat") >= 0) fail(label + " echoed the card id");
}

async function main() {
  const auth = require(path.join(root, "api/auth"));
  const jobs = require(path.join(root, "api/jobs"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();

  const slug = "jobs-need-seat-shop";
  const pin = "4831";
  const opened = await call(auth, "POST", { "x-workspace": slug }, { action: "open", slug: slug, biz: "Need Seat Shop", name: "James", pin: pin });
  if (opened.statusCode !== 201) fail("could not open a desk, got " + opened.statusCode + " " + JSON.stringify(opened.body));
  const joined = await call(auth, "POST", { "x-workspace": slug }, { action: "join", name: "Sam", pin: "9191", kind: "helper" });
  if (joined.statusCode !== 202 || !joined.body || !joined.body.person) fail("could not add a waiting seat: " + JSON.stringify(joined.body));
  // A second helper asks for a seat and the owner denies it: a denied seat is no seat.
  // Seat ids are minted from the clock, so let a millisecond pass before the second join.
  await new Promise((r) => setTimeout(r, 5));
  const deniedJoin = await call(auth, "POST", { "x-workspace": slug }, { action: "join", name: "Dee", pin: "7272", kind: "helper" });
  if (deniedJoin.statusCode !== 202 || !deniedJoin.body || !deniedJoin.body.person) fail("could not add a seat to deny: " + JSON.stringify(deniedJoin.body));
  if (deniedJoin.body.person.id === joined.body.person.id) fail("the denied seat and the waiting seat need different ids");
  const denied = await call(auth, "POST", { "x-workspace": slug, "x-pin": pin }, { action: "deny", id: deniedJoin.body.person.id });
  if (denied.statusCode !== 200) fail("owner should deny the seat, got " + denied.statusCode + " " + JSON.stringify(denied.body));
  const deniedRow = (lib.mem.workspaces.find((w) => w.slug === slug).people || []).find((p) => p.id === deniedJoin.body.person.id);
  if (!deniedRow || deniedRow.status !== "denied") fail("the denied seat should be on the book as denied");
  const waitingRow = (lib.mem.workspaces.find((w) => w.slug === slug).people || []).find((p) => p.id === joined.body.person.id);
  if (!waitingRow || waitingRow.status !== "pending") fail("the waiting seat should still be waiting after the deny");
  lib.mem.connections.push({ id: "c_needseat", workspace: slug, provider: "webhook", label: "Zap", hook: HOOK, live: true });
  function seed(id) {
    lib.mem.jobs.unshift({
      id: id, workspace: slug, title: CARD.title, notes: CARD.notes, phone: CARD.phone, email: CARD.email, amount: 20,
      status: "exception", step: "Qualify", createdAt: new Date().toISOString(),
      files: [{ name: "seat-secret.pdf", url: CARD.file }], thread: [{ from: "James", text: CARD.thread }]
    });
    return lib.mem.jobs[0];
  }
  seed("job_needseat");
  pass("opened a desk with a private card and a webhook pipe");

  // Probe's bar. With no seat (no desk code, no session), every action except capture gets the exact
  // reply for a desk that does not exist, on a real desk or a made-up one, with a real or a fake card id;
  // nothing is written and no pipe fires. These asserts all run (no stop at the first), then fail together.
  let barFails = 0;
  function bar(cond, msg) { if (cond) console.log("ok  " + msg); else { console.error("FAIL " + msg); barFails += 1; } }
  const NO_DESK = JSON.stringify({ status: 404, body: { ok: false, error: "No desk with that name." } });
  const shape = (r) => JSON.stringify({ status: r.statusCode, body: r.body });
  const BAR_ACTIONS = [
    ["done", { text: "bar done" }],
    ["snooze", { until: "in 2 hours" }],
    ["fill", { custom: { price: "3" } }],
    ["schedule", { dueAt: "2031-01-01T00:00:00Z" }],
    ["assign", { name: "James", to: "James" }],
    ["no-such-bar-action", {}]
  ];
  const DESKS = [["real desk", { "x-workspace": slug }], ["made-up desk", { "x-workspace": "no-such-bar-desk" }]];
  for (const [act, extra] of BAR_ACTIONS) {
    const seen = {};
    for (const [deskTag, hd] of DESKS) {
      for (const [cardTag, id] of [["real card", "job_needseat"], ["fake card", "job_bar_fake_0001"]]) {
        const before = JSON.stringify(lib.mem.jobs);
        const counts = [lib.mem.money.length, lib.mem.inbox.length, (lib.mem.audit || []).length].join(",");
        const f0 = fetches.length;
        const r = await call(jobs, "POST", hd, Object.assign({ action: act, id: id, whoTapped: "James" }, extra));
        seen[deskTag + "/" + cardTag] = shape(r);
        bar(shape(r) === NO_DESK && JSON.stringify(lib.mem.jobs) === before && [lib.mem.money.length, lib.mem.inbox.length, (lib.mem.audit || []).length].join(",") === counts && fetches.length === f0,
          "[no seat] " + act + " on a " + deskTag + " with a " + cardTag + ": exactly the missing-desk reply, nothing written, no pipe (" + shape(r).slice(0, 120) + ")");
      }
    }
    bar(seen["real desk/real card"] === seen["real desk/fake card"] && seen["real desk/real card"] === seen["made-up desk/fake card"],
      "[no seat] " + act + ": a real card id takes the same path as a fake one and a made-up desk (" + seen["real desk/real card"].slice(0, 60) + " vs " + seen["real desk/fake card"].slice(0, 60) + ")");
  }
  const replyBefore = JSON.stringify(lib.mem.jobs);
  const rep = await call(jobs, "POST", { "x-workspace": slug }, { action: "reply", id: "job_needseat", text: "bar reply", whoTapped: "James" });
  bar([403, 404].indexOf(rep.statusCode) >= 0 && rep.body && rep.body.ok === false && !rep.body.job && JSON.stringify(rep.body).indexOf(CARD.notes) < 0 && JSON.stringify(lib.mem.jobs) === replyBefore,
    "[no seat] reply is refused without the card in the reply and nothing written (" + shape(rep).slice(0, 100) + ")");
  if (barFails) fail(barFails + " no-seat bar asserts failed");
  pass("no seat: done, snooze, fill, schedule, assign and an unknown action get the missing-desk reply on any desk and any card id, nothing written");

  const OPEN = { "x-workspace": slug };
  const MISSING = { "x-workspace": "no-such-need-seat-desk" };
  const missingReply = await call(jobs, "POST", MISSING, { action: "say", id: "job_needseat", text: "x" });

  const callers = [
    ["a desk name alone", OPEN],
    ["a wrong code", { "x-workspace": slug, "x-pin": "0000" }],
    ["a waiting seat", { "x-workspace": slug, "x-pin": "9191" }],
    ["a denied seat", { "x-workspace": slug, "x-pin": "7272" }]
  ];
  for (let c = 0; c < callers.length; c++) {
    for (let i = 0; i < STRANGER_ACTIONS.length; i++) {
      const a = STRANGER_ACTIONS[i];
      const label = callers[c][0] + " · " + a[0];
      const before = JSON.stringify(lib.mem.jobs.find((j) => j.id === "job_needseat"));
      const counts = [lib.mem.jobs.length, lib.mem.money.length, lib.mem.inbox.length].join(",");
      const f0 = fetches.length;
      const res = await call(jobs, "POST", callers[c][1], Object.assign({ action: a[0], id: "job_needseat" }, a[1]));
      if ([401, 403, 404].indexOf(res.statusCode) < 0) fail(label + " should be refused, got " + res.statusCode + " " + JSON.stringify(res.body).slice(0, 300));
      if (!res.body || res.body.ok === true) fail(label + " must not say ok");
      noCardFields(res, label);
      if (JSON.stringify(lib.mem.jobs.find((j) => j.id === "job_needseat")) !== before) fail(label + " changed the card");
      if ([lib.mem.jobs.length, lib.mem.money.length, lib.mem.inbox.length].join(",") !== counts) fail(label + " added cards, money, or inbox rows");
      if (fetches.length !== f0) fail(label + " made an outbound call: " + JSON.stringify(fetches.slice(f0)));
      if (c !== 2 && (res.statusCode !== missingReply.statusCode || JSON.stringify(res.body) !== JSON.stringify(missingReply.body))) {
        fail(label + " should look like a missing desk: " + res.statusCode + " " + JSON.stringify(res.body));
      }
      if (c === 2 && (res.statusCode !== 403 || res.body.error !== "That seat is waiting on the owner.")) fail(label + " should be the waiting-seat 403");
    }
    pass(callers[c][0] + " is refused on every card action, with no card back and nothing changed");
  }

  const guessed = await call(jobs, "POST", OPEN, { action: "say", id: "job_doesnotexist", text: "x" });
  if (guessed.statusCode !== missingReply.statusCode || JSON.stringify(guessed.body) !== JSON.stringify(missingReply.body)) {
    fail("a stranger must not learn whether a card id exists: " + guessed.statusCode + " " + JSON.stringify(guessed.body));
  }
  pass("a stranger cannot tell a real card id from a made-up one");

  const OWNER = { "x-workspace": slug, "x-pin": pin };
  const said = await call(jobs, "POST", OWNER, { action: "say", id: "job_needseat", text: "owner note" });
  if (said.statusCode !== 200 || !said.body || !said.body.job || said.body.job.notes !== CARD.notes) fail("seated owner say should return the card, got " + said.statusCode + " " + JSON.stringify(said.body).slice(0, 300));
  if (!(said.body.job.thread || []).some((t) => t && t.text === "owner note")) fail("owner note should land on the card");
  const filled = await call(jobs, "POST", OWNER, { action: "fill", id: "job_needseat", custom: { price: "9" } });
  if (filled.statusCode !== 200 || !filled.body.job) fail("seated owner fill should work, got " + filled.statusCode);
  const pri = await call(jobs, "POST", OWNER, { action: "priority", id: "job_needseat" });
  if (pri.statusCode !== 200 || !pri.body.job) fail("seated owner priority should work, got " + pri.statusCode);
  const nf = await call(jobs, "POST", OWNER, { action: "say", id: "job_doesnotexist", text: "x" });
  if (nf.statusCode !== 404 || !nf.body || nf.body.error !== "Job not found") fail("a seat on a missing card should still get Job not found");
  const f1 = fetches.length;
  const shipped = await call(jobs, "POST", OWNER, { action: "ship", id: "job_needseat", provider: "webhook", confirm: true });
  if (shipped.statusCode !== 200 || !shipped.body.job) fail("seated owner ship should work, got " + shipped.statusCode + " " + JSON.stringify(shipped.body).slice(0, 300));
  if (fetches.slice(f1).filter((u) => u === HOOK).length !== 1) fail("seated owner ship should fire the desk pipe once, saw " + JSON.stringify(fetches.slice(f1)));
  pass("a seated owner still says, fills, flags, ships (pipe fires once), and gets Job not found on a bad id");

  const token = opened.body && opened.body.session && opened.body.session.token;
  if (!token) fail("desk open should issue a session");
  const SESSION = { "x-workspace": slug, "x-session": token };
  const COOKIE = { "x-workspace": slug, cookie: "aia_session=" + encodeURIComponent(token) };
  const shopRow = lib.mem.workspaces.find((w) => w.slug === slug);
  shopRow.ais = (shopRow.ais || []).concat([{ id: "ai_needseat", name: "Lister", role: "Doer", does: "drafts listings" }]);
  async function ok(headers, body, label, want) {
    const res = await call(jobs, "POST", headers, body);
    if (res.statusCode !== (want || 200) || !res.body || !res.body.job) fail(label + " should work, got " + res.statusCode + " " + JSON.stringify(res.body).slice(0, 300));
    return res;
  }

  // store.js (consign.html) today: X-Workspace + X-Pin only, ship then kill.
  seed("job_consign_pin");
  const f3 = fetches.length;
  await ok(OWNER, { action: "ship", id: "job_consign_pin", amount: 0, confirm: true, note: "consign" }, "store.js owner ship with X-Pin");
  if (fetches.slice(f3).filter((u) => u === HOOK).length !== 1) fail("store.js owner ship should fire the pipe once");
  seed("job_consign_pin_k");
  const pk = await ok(OWNER, { action: "kill", id: "job_consign_pin_k", confirm: true }, "store.js owner kill with X-Pin");
  if (pk.body.job.status !== "killed") fail("store.js owner kill with X-Pin should kill the card");
  pass("store.js today (X-Workspace + X-Pin): the owner still ships and kills on Consign");

  // store.js once it also sends X-Session: X-Workspace + X-Session, no X-Pin.
  seed("job_consign_ses");
  await ok(SESSION, { action: "ship", id: "job_consign_ses", amount: 0, confirm: true, note: "consign" }, "store.js owner ship with X-Session only");
  seed("job_consign_ses_k");
  const sk = await ok(SESSION, { action: "kill", id: "job_consign_ses_k", confirm: true }, "store.js owner kill with X-Session only");
  if (sk.body.job.status !== "killed") fail("session-only owner kill should kill the card");
  seed("job_consign_cookie");
  await ok(COOKIE, { action: "ship", id: "job_consign_cookie", amount: 0, confirm: true }, "store.js owner ship with only the aia_session cookie");
  pass("an owner with a session and no desk code (X-Session, or the same-origin cookie) ships and kills");

  // store.js today with no stored pin and no session cookie: just X-Workspace. That is a stranger.
  seed("job_consign_bare");
  const bareBefore = JSON.stringify(lib.mem.jobs.find((j) => j.id === "job_consign_bare"));
  const f4 = fetches.length;
  const bs = await call(jobs, "POST", OPEN, { action: "ship", id: "job_consign_bare", amount: 0, confirm: true, note: "consign" });
  const bk = await call(jobs, "POST", OPEN, { action: "kill", id: "job_consign_bare", confirm: true });
  [["ship", bs], ["kill", bk]].forEach(function (r) {
    if ([401, 403, 404].indexOf(r[1].statusCode) < 0) fail("store.js with no pin and no session · " + r[0] + " should be refused, got " + r[1].statusCode);
    noCardFields(r[1], "store.js with no pin and no session · " + r[0]);
  });
  if (fetches.length !== f4) fail("store.js with no pin and no session must not fire the pipe");
  if (JSON.stringify(lib.mem.jobs.find((j) => j.id === "job_consign_bare")) !== bareBefore) fail("store.js with no pin and no session must not change the card");
  pass("store.js with no pin and no session (desk name only) is refused on ship and kill");

  // desk-needs.js through desk.html api(): reply, bind-ai, recommend, priority; X-Session seat.
  seed("job_needs_page");
  await ok(SESSION, { action: "reply", id: "job_needs_page", text: "owner reply", whoTapped: "James" }, "desk-needs reply with X-Session");
  await ok(SESSION, { action: "bind-ai", id: "job_needs_page", ai: "ai_needseat", whoTapped: "James" }, "desk-needs bind-ai with X-Session");
  await ok(SESSION, { action: "recommend", id: "job_needs_page", whoTapped: "James" }, "desk-needs recommend with X-Session");
  await ok(SESSION, { action: "priority", id: "job_needs_page", on: true, whoTapped: "James" }, "desk-needs priority on with X-Session");
  await ok(SESSION, { action: "priority", id: "job_needs_page", on: false, whoTapped: "James" }, "desk-needs priority off with X-Session");
  pass("desk-needs.js reply, bind-ai, recommend, and priority still work for a seated owner with X-Session");

  // drop-agent.js after a capture: recommend {id} and assign {id, name}, same headers as the capture.
  // drop-app.js sends X-Workspace + X-Pin; a desk page may carry X-Session.
  for (const h of [["X-Pin", OWNER], ["X-Session", SESSION]]) {
    const cap = await ok(h[1], { action: "capture", title: "Agent drop " + h[0] }, "drop-agent capture with " + h[0], 201);
    const id = cap.body.job.id;
    await ok(h[1], { action: "recommend", id: id }, "drop-agent recommend with " + h[0]);
    await ok(h[1], { action: "assign", id: id, name: "James" }, "drop-agent assign with " + h[0]);
  }
  pass("drop-agent.js recommend and assign after a drop still work for a seat (X-Pin or X-Session)");

  // create-desk.js only sends capture (lines 304, 530) and suggest (498) to /api/jobs; headers X-Workspace + X-Session (+ X-Pin).
  await ok(SESSION, { action: "capture", title: "Create page drop", from: "create", whoTapped: "James" }, "create-desk capture with X-Session", 201);
  await ok(Object.assign({ "x-pin": pin }, SESSION), { action: "capture", title: "Create page drop 2", from: "create" }, "create-desk capture with X-Session + X-Pin", 201);
  pass("create-desk.js capture still works with X-Session");

  const approved = await call(auth, "POST", OWNER, { action: "approve", id: joined.body.person.id });
  if (approved.statusCode !== 200) fail("owner should approve the helper, got " + approved.statusCode);
  seed("job_needseat2");
  const HELPER = { "x-workspace": slug, "x-pin": "9191" };
  const hs = await call(jobs, "POST", HELPER, { action: "say", id: "job_needseat2", text: "helper note" });
  if (hs.statusCode !== 200 || !hs.body.job) fail("seated helper say should work, got " + hs.statusCode);
  const ha = await call(jobs, "POST", HELPER, { action: "assign", id: "job_needseat2", name: "Sam" });
  if (ha.statusCode !== 200 || !ha.body.job) fail("seated helper assign should work, got " + ha.statusCode + " " + JSON.stringify(ha.body).slice(0, 200));
  const hd = await call(jobs, "POST", HELPER, { action: "done", id: "job_needseat2", text: "helper done" });
  if (hd.statusCode !== 200 || !hd.body.job || hd.body.job.status !== "shipped") fail("seated helper done should work, got " + hd.statusCode);
  const hk = await call(jobs, "POST", HELPER, { action: "kill", id: "job_needseat2", confirm: true });
  if (hk.statusCode !== 403) fail("a helper still cannot Stop a live job, got " + hk.statusCode);
  pass("an approved helper still says, assigns, and marks done; Stop stays owner-only");

  const dropped = await call(jobs, "POST", OPEN, { action: "capture", title: "Street drop" });
  if (dropped.statusCode !== 201 || !dropped.body || !dropped.body.job) fail("public drop must still POST a card with only the desk name, got " + dropped.statusCode);
  pass("public drop (capture) still works with only the desk name");

  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  if (pkg.indexOf("scripts/check-jobs-need-seat.js") < 0) fail("package.json test must run this check");
  pass("package.json test runs this check");

  try { fs.rmSync(store, { force: true }); } catch (e) {}
  console.log("check-jobs-need-seat: ok");
}

main().catch(function (e) {
  console.error(e && e.stack || e);
  try { fs.rmSync(store, { force: true }); } catch (x) {}
  process.exit(1);
});
