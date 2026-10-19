#!/usr/bin/env node
// Proves POST /api/jobs action "suggest" needs a seat on that desk before it
// asks the Desk AI. A stranger, a wrong code, a waiting seat, and a made-up
// desk are refused and make zero calls to api.x.ai. A seated owner and helper
// still get a draft reply, and nothing is saved.
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const store = path.join(os.tmpdir(), "aia-suggest-seat-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
Object.keys(process.env).forEach(function (k) {
  if (/BLOB|VERCEL|XAI|GROK|OPENAI|ANTHROPIC|AIA_CONNECT/.test(k)) delete process.env[k];
});
process.env.XAI_API_KEY = "test-only-not-a-real-key";
delete global.__aia;
delete global.__aiaHydrate;

const fetches = [];
global.fetch = async function (url) {
  fetches.push(String(url));
  return { status: 599, ok: false, json: async () => ({}), text: async () => "stubbed" };
};
function llmCalls(from) {
  return fetches.slice(from || 0).filter((u) => u.indexOf("api.x.ai") >= 0).length;
}

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

async function main() {
  const auth = require(path.join(root, "api/auth"));
  const jobs = require(path.join(root, "api/jobs"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();

  const slug = "suggest-seat-shop";
  const pin = "4841";
  const opened = await call(auth, "POST", { "x-workspace": slug }, { action: "open", slug: slug, biz: "Suggest Seat Shop", name: "James", pin: pin });
  if (opened.statusCode !== 201) fail("could not open a desk, got " + opened.statusCode + " " + JSON.stringify(opened.body));
  const joined = await call(auth, "POST", { "x-workspace": slug }, { action: "join", name: "Sam", pin: "9292", kind: "helper" });
  if (joined.statusCode !== 202 || !joined.body || !joined.body.person) fail("could not add a waiting seat: " + JSON.stringify(joined.body));
  // A second helper asks for a seat and the owner denies it: a denied seat is no seat.
  // Seat ids are minted from the clock, so let a millisecond pass before the second join.
  await new Promise((r) => setTimeout(r, 5));
  const deniedJoin = await call(auth, "POST", { "x-workspace": slug }, { action: "join", name: "Dee", pin: "7373", kind: "helper" });
  if (deniedJoin.statusCode !== 202 || !deniedJoin.body || !deniedJoin.body.person) fail("could not add a seat to deny: " + JSON.stringify(deniedJoin.body));
  if (deniedJoin.body.person.id === joined.body.person.id) fail("the denied seat and the waiting seat need different ids");
  const denied = await call(auth, "POST", { "x-workspace": slug, "x-pin": pin }, { action: "deny", id: deniedJoin.body.person.id });
  if (denied.statusCode !== 200) fail("owner should deny the seat, got " + denied.statusCode + " " + JSON.stringify(denied.body));
  const people = lib.mem.workspaces.find((w) => w.slug === slug).people || [];
  const deniedRow = people.find((p) => p.id === deniedJoin.body.person.id);
  if (!deniedRow || deniedRow.status !== "denied") fail("the denied seat should be on the book as denied");
  const waitingRow = people.find((p) => p.id === joined.body.person.id);
  if (!waitingRow || waitingRow.status !== "pending") fail("the waiting seat should still be waiting after the deny");
  pass("opened a desk with an owner, a waiting helper, and a denied helper");

  const ask = { action: "suggest", title: "Draft a reply to the porch lead", notes: "price check" };
  const jobsBefore = lib.mem.jobs.length;
  const refused = [
    ["a desk name alone", { "x-workspace": slug }, 401],
    ["a wrong code", { "x-workspace": slug, "x-pin": "0000" }, 401],
    ["a made-up desk", { "x-workspace": "no-such-suggest-desk" }, 401],
    ["a waiting seat", { "x-workspace": slug, "x-pin": "9292" }, 403],
    ["a denied seat", { "x-workspace": slug, "x-pin": "7373" }, [401, 403]]
  ];
  let strangerBody = null;
  for (let i = 0; i < refused.length; i++) {
    const r = refused[i];
    const f0 = fetches.length;
    const res = await call(jobs, "POST", r[1], ask);
    if (Array.isArray(r[2]) ? r[2].indexOf(res.statusCode) < 0 : res.statusCode !== r[2]) fail(r[0] + " suggest should be " + r[2] + ", got " + res.statusCode + " " + JSON.stringify(res.body).slice(0, 300));
    if (!res.body || res.body.ok !== false || res.body.draft !== undefined || res.body.job !== undefined) fail(r[0] + " must get no draft back: " + JSON.stringify(res.body).slice(0, 300));
    if (fetches.length !== f0) fail(r[0] + " made " + (fetches.length - f0) + " outbound call(s), " + llmCalls(f0) + " to api.x.ai");
    if (r[2] === 401) {
      if (strangerBody === null) strangerBody = JSON.stringify(res.body);
      else if (JSON.stringify(res.body) !== strangerBody) fail(r[0] + " reply should match a stranger's, so the desk name is not confirmed");
    }
  }
  if (lib.mem.jobs.length !== jobsBefore) fail("a refused suggest must not save a card");
  pass("a stranger, a wrong code, a made-up desk (401), a waiting seat (403), and a denied seat (401 or 403) get no draft and zero calls to api.x.ai");

  const OWNER = { "x-workspace": slug, "x-pin": pin };
  const f1 = fetches.length;
  const owner = await call(jobs, "POST", OWNER, ask);
  if (owner.statusCode !== 200 || !owner.body || owner.body.ok !== true || owner.body.saved !== false) fail("seated owner suggest should answer 200 unsaved, got " + owner.statusCode + " " + JSON.stringify(owner.body).slice(0, 300));
  if (llmCalls(f1) < 1) fail("seated owner suggest should still ask the Desk AI, saw " + JSON.stringify(fetches.slice(f1)));
  if (lib.mem.jobs.length !== jobsBefore) fail("suggest must stay draft-only and save no card");
  pass("a seated owner still asks the Desk AI and nothing is saved");

  const token = opened.body && opened.body.session && opened.body.session.token;
  if (!token) fail("desk open should issue a session");
  // drop-custom.js:134 sends X-Workspace + X-Session with its exact body.
  const customAsk = {
    action: "suggest", kind: "custom", title: "Custom Drop",
    notes: "Draft a porch listing", custom: { customDrop: true, cardType: "custom", name: "Custom Drop" }
  };
  const f3 = fetches.length;
  const custom = await call(jobs, "POST", { "x-workspace": slug, "x-session": token }, customAsk);
  if (custom.statusCode !== 200 || !custom.body || custom.body.ok !== true) fail("drop-custom suggest with X-Session should answer 200, got " + custom.statusCode + " " + JSON.stringify(custom.body).slice(0, 300));
  if (llmCalls(f3) < 1) fail("drop-custom suggest with X-Session should still ask the Desk AI");
  // create-desk.js:498 sends X-Workspace + X-Session (+ X-Pin when stored).
  const f4 = fetches.length;
  const create = await call(jobs, "POST", { "x-workspace": slug, "x-session": token, "x-pin": pin }, { action: "suggest", title: "Draft the first card", notes: "start" });
  if (create.statusCode !== 200 || !create.body || create.body.ok !== true) fail("create-desk suggest with X-Session should answer 200, got " + create.statusCode);
  if (llmCalls(f4) < 1) fail("create-desk suggest should still ask the Desk AI");
  const f5 = fetches.length;
  const bareCustom = await call(jobs, "POST", { "x-workspace": slug }, customAsk);
  if (bareCustom.statusCode !== 401 || llmCalls(f5) !== 0) fail("drop-custom suggest with no session must be 401 with no model call, got " + bareCustom.statusCode);
  if (lib.mem.jobs.length !== jobsBefore) fail("suggest must stay draft-only and save no card");
  pass("drop-custom.js and create-desk.js suggest still draft for a seat with X-Session; drop-custom with no session is 401 and no model call");

  const approved = await call(auth, "POST", OWNER, { action: "approve", id: joined.body.person.id });
  if (approved.statusCode !== 200) fail("owner should approve the helper, got " + approved.statusCode);
  const f2 = fetches.length;
  const helper = await call(jobs, "POST", { "x-workspace": slug, "x-pin": "9292" }, ask);
  if (helper.statusCode !== 200 || !helper.body || helper.body.ok !== true) fail("approved helper suggest should answer 200, got " + helper.statusCode);
  if (llmCalls(f2) < 1) fail("approved helper suggest should still ask the Desk AI");
  pass("an approved helper still gets a draft");

  const dropped = await call(jobs, "POST", { "x-workspace": slug }, { action: "capture", title: "Street drop" });
  if (dropped.statusCode !== 201) fail("public drop must still POST a card with only the desk name, got " + dropped.statusCode);
  pass("public drop (capture) still works with only the desk name");

  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  if (pkg.indexOf("scripts/check-suggest-needs-seat.js") < 0) fail("package.json test must run this check");
  pass("package.json test runs this check");

  try { fs.rmSync(store, { force: true }); } catch (e) {}
  console.log("check-suggest-needs-seat: ok");
}

main().catch(function (e) {
  console.error(e && e.stack || e);
  try { fs.rmSync(store, { force: true }); } catch (x) {}
  process.exit(1);
});
