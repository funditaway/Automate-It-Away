#!/usr/bin/env node
// Proves POST /api/hook only changes a card that is already on a desk for a seat on
// that desk or a sender holding that desk's hook secret. A stranger who knows a card
// id or externalId gets 401: the card stays as it was and nothing lands in money.
// New cards from a hook still come in from anyone (201).
// Runs the real handler on a temp store. Outbound fetch is blocked.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const store = path.join(os.tmpdir(), "aia-hook-gate-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
for (const k of Object.keys(process.env)) if (/BLOB|VERCEL|XAI|GROK|OPENAI|ANTHROPIC/.test(k)) delete process.env[k];
delete global.__aia;
delete global.__aiaHydrate;
const fetches = [];
global.fetch = async function (url) {
  fetches.push(String(url));
  return { status: 599, ok: false, json: async () => ({}), text: async () => "blocked" };
};

let failed = 0;
function fail(msg) { failed++; console.error("FAIL " + msg); }
function pass(msg) { console.log("ok  " + msg); }
function done() {
  try { fs.rmSync(store, { force: true }); } catch (e) {}
  if (failed) { console.error("check-hook-existing-card-gate: " + failed + " failed"); process.exit(1); }
  console.log("check-hook-existing-card-gate: ok");
}

const hp = (p) => crypto.createHash("sha256").update(String(p) + ":aia-pilot").digest("hex");
const TEST_SECRET = "test-only-hook-secret-not-real";
const now = new Date().toISOString();
function victimJob(id, ext) {
  return { id: id, workspace: "victim", externalId: ext, title: "Victim card " + id, notes: "Original notes", amount: 50, status: "exception", step: "Qualify", createdAt: now, log: ["Captured"], thread: [] };
}
fs.writeFileSync(store, JSON.stringify({
  workspaces: [
    { slug: "victim", name: "Olive", biz: "Victim Co", pin: hp("1111"), createdAt: now,
      people: [
        { id: "p_owner", name: "Olive", role: "owner", pin: hp("1111"), status: "approved" },
        { id: "p_helper", name: "Hana", role: "employee", pin: hp("2222"), status: "approved" },
        { id: "p_pending", name: "Pete", role: "employee", pin: hp("3333"), status: "pending" }] },
    { slug: "other", name: "Ozzy", biz: "Other Co", pin: hp("9999"), createdAt: now,
      people: [{ id: "p_other", name: "Ozzy", role: "owner", pin: hp("9999"), status: "approved" }] }
  ],
  jobs: [victimJob("job_victim1", "crm-1"), victimJob("job_victim2", "crm-2")],
  money: [],
  inbox: []
}));

function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; }
  };
}

(async function main() {
  const lib = require(path.join(root, "api/_lib"));
  const hook = require(path.join(root, "api/hook"));
  await lib.ready();
  const mem = lib.mem;
  if (!Array.isArray(mem.money)) mem.money = [];

  async function call(headers, body, query) {
    const res = mockRes();
    await hook({ method: "POST", headers: headers || {}, query: query || {}, body: body || {}, url: "/api/hook", on() {} }, res);
    return res;
  }
  const card = (id) => mem.jobs.find((j) => j && j.id === id);
  const snap = (id) => JSON.stringify(card(id) || null);
  const H = { "x-workspace": "victim" };

  const events = [
    ["kill", { event: "kill", reason: "stranger stop" }],
    ["done", { event: "done", notes: "stranger done" }],
    ["update", { event: "update", notes: "STRANGER OVERWRITE" }],
    ["default update", { notes: "STRANGER OVERWRITE 2" }],
    ["do", { event: "do", notes: "stranger do" }],
    ["hand", { event: "needs a hand", notes: "stranger hand" }],
    ["collect", { event: "paid", amount: 99999 }],
    ["collect (sold)", { event: "sold", amount: 12345 }]
  ];
  const refs = [["id", { id: "job_victim1" }], ["jobId", { jobId: "job_victim1" }], ["externalId", { externalId: "crm-1" }]];

  // 1. Strangers (no seat, no secret, wrong pin, pending seat, other desk's pin, a secret on a desk with none set).
  const strangers = [
    ["no seat", H, {}],
    ["wrong pin", Object.assign({ "x-pin": "0000" }, H), {}],
    ["pending seat", Object.assign({ "x-pin": "3333" }, H), {}],
    ["other desk owner pin", Object.assign({ "x-pin": "9999" }, H), {}],
    ["secret on desk with none set", Object.assign({ "x-hook-secret": TEST_SECRET }, H), { hook_secret: TEST_SECRET }]
  ];
  for (const who of strangers) {
    for (const ref of refs) {
      for (const ev of events) {
        const before = snap("job_victim1");
        const jobsBefore = mem.jobs.length;
        const moneyBefore = mem.money.length;
        const fetchBefore = fetches.length;
        const r = await call(who[1], Object.assign({}, ref[1], ev[1]), who[2]);
        const label = who[0] + " " + ev[0] + " by " + ref[0];
        if (r.statusCode !== 401) fail(label + " -> expected 401, got " + r.statusCode + " " + JSON.stringify(r.body).slice(0, 200));
        else if (!r.body || r.body.ok !== false || typeof r.body.error !== "string" || r.body.job || r.body.id) fail(label + " -> 401 body should be a plain message, got " + JSON.stringify(r.body));
        if (snap("job_victim1") !== before) fail(label + " changed the card");
        if (mem.jobs.length !== jobsBefore) fail(label + " added a card");
        if (mem.money.length !== moneyBefore) fail(label + " wrote a money row: " + JSON.stringify(mem.money[0]));
        if (fetches.length !== fetchBefore) fail(label + " made an outbound call");
      }
    }
  }
  const v1 = card("job_victim1");
  if (!v1 || v1.status !== "exception" || v1.notes !== "Original notes" || v1.amount !== 50) fail("victim card after strangers: " + JSON.stringify(v1));
  if (mem.money.length !== 0) fail("money after strangers: " + JSON.stringify(mem.money));
  else pass("strangers get 401 on kill/done/update/do/hand/collect by id, jobId and externalId; card unchanged; no money row");

  // 2. New cards still come in from anyone.
  for (const c of [
    ["capture event", { event: "capture", title: "Stranger lead A", notes: "hi" }],
    ["no event, no id", { title: "Stranger lead B", notes: "hi" }],
    ["update for an unknown externalId", { event: "update", externalId: "crm-new", title: "Stranger lead C" }],
    ["capture naming an existing id", { event: "capture", id: "job_victim1", title: "Stranger lead D" }]
  ]) {
    const before = mem.jobs.length;
    const victimBefore = snap("job_victim1");
    const r = await call(H, c[1]);
    if (r.statusCode !== 201 || !r.body || r.body.ok !== true || r.body.event !== "capture" || !r.body.id) fail("stranger " + c[0] + " -> expected 201 capture, got " + r.statusCode + " " + JSON.stringify(r.body).slice(0, 200));
    else if (mem.jobs.length !== before + 1 || !card(r.body.id) || card(r.body.id).workspace !== "victim") fail("stranger " + c[0] + " did not create the card");
    else if (r.body.job) fail("stranger " + c[0] + " got the card echoed back");
    if (snap("job_victim1") !== victimBefore) fail("stranger " + c[0] + " changed the victim card");
  }
  if (mem.money.length !== 0) fail("a capture wrote money");
  pass("stranger new-card capture still 201 and creates the card");

  // 3. Seated people on that desk can still change cards.
  const owner = Object.assign({ "x-pin": "1111" }, H);
  let r = await call(owner, { id: "job_victim1", event: "update", notes: "Owner notes" });
  if (r.statusCode !== 200 || !r.body.job || card("job_victim1").notes !== "Owner notes") fail("owner update by id -> " + r.statusCode + " " + JSON.stringify(r.body).slice(0, 200));
  else pass("seated owner can update by id");
  r = await call(Object.assign({ "x-pin": "2222" }, H), { externalId: "crm-1", event: "done", notes: "Helper done" });
  if (r.statusCode !== 200 || card("job_victim1").status !== "shipped") fail("helper done by externalId -> " + r.statusCode);
  else pass("seated helper can mark done by externalId");
  r = await call(owner, { id: "job_victim1", event: "paid", amount: 70 });
  if (r.statusCode !== 200 || mem.money.length !== 1 || mem.money[0].amt !== "$70") fail("owner collect -> " + r.statusCode + " " + JSON.stringify(mem.money));
  else pass("seated owner collect still writes one money row");

  // 4. With a hook secret on the desk (test value on a temp store), the secret opens existing cards; a wrong one does not.
  const shop = mem.workspaces.find((w) => w.slug === "victim");
  shop.hookSecretHash = crypto.createHash("sha256").update(TEST_SECRET).digest("hex");
  const moneyNow = mem.money.length;
  for (const bad of [["wrong header", { "x-hook-secret": "nope" }, {}], ["wrong query", {}, { hook_secret: "nope" }], ["secret in body only", {}, {}, { hook_secret: TEST_SECRET }]]) {
    const before = snap("job_victim2");
    const rr = await call(Object.assign({}, H, bad[1]), Object.assign({ id: "job_victim2", event: "kill" }, bad[3] || {}), bad[2]);
    if (rr.statusCode !== 401 || snap("job_victim2") !== before) fail(bad[0] + " -> expected 401 and no change, got " + rr.statusCode);
  }
  r = await call(Object.assign({}, H, { "x-hook-secret": TEST_SECRET }), { externalId: "crm-2", event: "update", notes: "Pipe notes" });
  if (r.statusCode !== 200 || card("job_victim2").notes !== "Pipe notes" || r.body.job) fail("secret header update -> " + r.statusCode + " " + JSON.stringify(r.body).slice(0, 200));
  r = await call(H, { id: "job_victim2", event: "paid", amount: 30 }, { hook_secret: TEST_SECRET });
  if (r.statusCode !== 200 || mem.money.length !== moneyNow + 1) fail("secret query collect -> " + r.statusCode);
  r = await call(Object.assign({}, H, { "x-hook-secret": TEST_SECRET }), { id: "job_victim2", event: "kill" });
  if (r.statusCode !== 200 || card("job_victim2").status !== "killed") fail("secret kill -> " + r.statusCode);
  if (!failed) pass("valid desk hook secret (header or ?hook_secret=) can change cards; wrong secret gets 401; reply stays plain");

  // 5. Another desk's secret does not open this desk.
  const other = mem.workspaces.find((w) => w.slug === "other");
  other.hookSecretHash = crypto.createHash("sha256").update("other-desk-secret").digest("hex");
  r = await call(Object.assign({}, H, { "x-hook-secret": "other-desk-secret" }), { id: "job_victim1", event: "kill" });
  if (r.statusCode !== 401) fail("other desk secret opened victim card -> " + r.statusCode);
  else pass("another desk's secret does not open this desk");

  done();
})().catch((e) => { console.error("FAIL " + (e && e.stack || e)); try { fs.rmSync(store, { force: true }); } catch (x) {} process.exit(1); });
