#!/usr/bin/env node
// Proves POST /api/hook only changes a card that is already on a desk for a seat on
// that desk or a sender holding that desk's hook secret. A stranger who knows a card
// id or externalId gets 401: the card stays as it was and nothing lands in money.
// New cards from a hook still come in from anyone (201).
// The secret is header-only (X-Hook-Secret): one in the query string or the body is
// ignored. The compare goes through crypto.timingSafeEqual, a malformed stored hash is
// refused without throwing, and the secret and its hash never show up in a reply, in
// console output, or in what hook.js / _lib.js log.
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

  // Every call runs with console and stdout/stderr captured. The secret strings and
  // their hashes must appear in none of that, in the reply, or in new audit / inbox rows.
  const watched = [];
  function watch(secret) {
    const hex = crypto.createHash("sha256").update(secret).digest("hex");
    for (const w of [secret, hex, hex.toUpperCase()]) if (watched.indexOf(w) < 0) watched.push(w);
    return hex;
  }
  let leaks = 0;
  let calls = 0;
  let captured = 0;
  const CONSOLE = ["log", "info", "warn", "error", "debug", "trace"];
  async function call(headers, body, query) {
    const res = mockRes();
    query = query || {};
    const qs = Object.keys(query).map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(query[k])).join("&");
    const req = { method: "POST", headers: headers || {}, query: query, body: body || {}, url: "/api/hook" + (qs ? "?" + qs : ""), on() {} };
    const out = [];
    const saved = {};
    for (const m of CONSOLE) { saved[m] = console[m]; console[m] = function () { out.push(Array.prototype.map.call(arguments, (a) => typeof a === "string" ? a : (() => { try { return JSON.stringify(a); } catch (e) { return String(a); } })()).join(" ")); }; }
    const ow = process.stdout.write, ew = process.stderr.write;
    process.stdout.write = function (c) { out.push(String(c)); return true; };
    process.stderr.write = function (c) { out.push(String(c)); return true; };
    const auditBefore = (mem.audit || []).slice();
    const inboxBefore = (mem.inbox || []).slice();
    let thrown = null;
    try { await hook(req, res); } catch (e) { thrown = e; }
    finally {
      for (const m of CONSOLE) console[m] = saved[m];
      process.stdout.write = ow; process.stderr.write = ew;
    }
    calls++;
    captured += out.length;
    const fresh = (mem.audit || []).filter((a) => auditBefore.indexOf(a) < 0).concat((mem.inbox || []).filter((a) => inboxBefore.indexOf(a) < 0));
    const seen = out.join("\n") + "\n" + JSON.stringify(fresh) + "\n" + JSON.stringify(res.body) + "\n" + JSON.stringify(res.headers) + "\n" + (thrown ? String(thrown && thrown.stack || thrown) : "");
    const hit = watched.filter((w) => seen.indexOf(w) >= 0);
    if (hit.length) { leaks++; fail("call #" + calls + " leaked a hook secret or its hash (" + hit.length + " match" + (hit.length > 1 ? "es" : "") + ") into logs or the reply; output withheld"); }
    else if (out.length) process.stdout.write(out.join(""));
    if (thrown) throw thrown;
    return res;
  }
  const card = (id) => mem.jobs.find((j) => j && j.id === id);
  const snap = (id) => JSON.stringify(card(id) || null);
  const H = { "x-workspace": "victim" };
  watch(TEST_SECRET);
  watch("other-desk-secret");

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

  // 4. With a hook secret on the desk (test value on a temp store), the secret opens
  // existing cards from the X-Hook-Secret header only. Query or body is no secret.
  const shop = mem.workspaces.find((w) => w.slug === "victim");
  const goodHash = crypto.createHash("sha256").update(TEST_SECRET).digest("hex");
  shop.hookSecretHash = goodHash;
  const realTSE = crypto.timingSafeEqual;
  let tse = 0;
  crypto.timingSafeEqual = function () { tse++; return realTSE.apply(this, arguments); };
  const moneyNow = mem.money.length;
  const locked = [
    ["wrong header", { "x-hook-secret": "nope" }, {}, {}],
    ["wrong query", {}, { hook_secret: "nope" }, {}],
    ["right secret in query only", {}, { hook_secret: TEST_SECRET }, {}],
    ["right secret in body only", {}, {}, { hook_secret: TEST_SECRET }],
    ["right secret in body as hookSecret", {}, {}, { hookSecret: TEST_SECRET, secret: TEST_SECRET }],
    ["right secret in query and body, wrong header", { "x-hook-secret": "nope" }, { hook_secret: TEST_SECRET }, { hook_secret: TEST_SECRET }]
  ];
  for (const bad of locked) {
    for (const ev of [["kill", { event: "kill" }], ["update", { event: "update", notes: "QUERY OVERWRITE" }], ["collect", { event: "paid", amount: 777 }]]) {
      const before = snap("job_victim2");
      const mb = mem.money.length;
      const rr = await call(Object.assign({}, H, bad[1]), Object.assign({ id: "job_victim2" }, ev[1], bad[3]), bad[2]);
      if (rr.statusCode !== 401 || !rr.body || rr.body.ok !== false || rr.body.job || rr.body.id) fail(bad[0] + " " + ev[0] + " -> expected plain 401, got " + rr.statusCode);
      if (snap("job_victim2") !== before) fail(bad[0] + " " + ev[0] + " changed the card");
      if (mem.money.length !== mb) fail(bad[0] + " " + ev[0] + " wrote a money row");
    }
  }
  if (!failed) pass("secret in the query string or the body is ignored: 401 on kill/update/collect of an existing card, card unchanged, no money row");
  // New cards still come in with a secret in the query or body (ignored, not echoed).
  for (const nc of [["query", {}, { hook_secret: TEST_SECRET }], ["body", { hook_secret: TEST_SECRET }, {}]]) {
    const before = mem.jobs.length;
    const rr = await call(H, Object.assign({ event: "capture", title: "Lead with " + nc[0] + " secret" }, nc[1]), nc[2]);
    if (rr.statusCode !== 201 || !rr.body || rr.body.ok !== true || mem.jobs.length !== before + 1 || rr.body.job) fail("new card with " + nc[0] + " secret -> expected 201, got " + rr.statusCode);
    else if (watched.some((w) => JSON.stringify(card(rr.body.id)).indexOf(w) >= 0)) fail("new card with " + nc[0] + " secret stored the secret on the card");
  }
  if (!failed) pass("new cards with a secret in the query or body still 201");
  const tseBeforeGood = tse;
  r = await call(Object.assign({}, H, { "x-hook-secret": TEST_SECRET }), { externalId: "crm-2", event: "update", notes: "Pipe notes" });
  if (r.statusCode !== 200 || card("job_victim2").notes !== "Pipe notes" || r.body.job) fail("secret header update -> " + r.statusCode + " " + JSON.stringify(r.body).slice(0, 200));
  r = await call(Object.assign({}, H, { "x-hook-secret": TEST_SECRET }), { id: "job_victim2", event: "paid", amount: 30 });
  if (r.statusCode !== 200 || mem.money.length !== moneyNow + 1) fail("secret header collect -> " + r.statusCode);
  if (tse <= tseBeforeGood) fail("the right X-Hook-Secret was accepted without crypto.timingSafeEqual (compare must not be ==/===)");
  const tseBeforeWrong = tse;
  r = await call(Object.assign({}, H, { "x-hook-secret": "nope-wrong" }), { id: "job_victim2", event: "kill" });
  if (r.statusCode !== 401) fail("wrong header after good -> " + r.statusCode);
  if (tse <= tseBeforeWrong) fail("a wrong X-Hook-Secret was refused without crypto.timingSafeEqual");
  r = await call(Object.assign({}, H, { "x-hook-secret": TEST_SECRET }), { id: "job_victim2", event: "kill" });
  if (r.statusCode !== 200 || card("job_victim2").status !== "killed") fail("secret kill -> " + r.statusCode);
  if (!failed) pass("right X-Hook-Secret header still changes cards (update/collect/kill), reply stays plain; compare goes through crypto.timingSafeEqual");

  // Static pin: the hook compare is crypto.timingSafeEqual, not ==/===, and the secret is
  // read from the header only (no query/body/url read of it, no logging of req.url/query).
  const src = fs.readFileSync(path.join(root, "api/hook.js"), "utf8");
  const fnOf = (name) => { const i = src.indexOf("function " + name + "("); if (i < 0) return ""; const j = src.indexOf("\n}\n", i); return src.slice(i, j < 0 ? undefined : j + 2); };
  const proven = fnOf("hookSecretProven");
  const secretOf = fnOf("hookSecretOf");
  if (!/crypto\.timingSafeEqual\s*\(/.test(proven)) fail("hookSecretProven must compare with crypto.timingSafeEqual");
  if (/[!=]==?/.test(proven.replace(/!\/\^\[0-9a-f\]\{64\}\$\/\.test/g, ""))) fail("hookSecretProven must not compare with ==, ===, != or !==");
  if (!/\/\^\[0-9a-f\]\{64\}\$\/\.test\(want\)/.test(proven)) fail("hookSecretProven must keep the strict 64-hex guard on the stored hash");
  if (!secretOf || /query|body|url|cookie/i.test(secretOf.replace(/^\s*\/\/.*$/mg, ""))) fail("hookSecretOf must read the X-Hook-Secret header only");
  if (/hook_?secret/i.test(src.replace(/hookSecretHash|hookSecretOf|hookSecretProven/g, "").replace(/^\s*\/\/.*$/mg, "").replace(/"x-hook-secret"/g, ""))) fail("hook.js reads a hook secret from somewhere other than the X-Hook-Secret header");
  if (/console\.|req\.url|log\([^)]*req\.query|log\([^)]*hookSecret/i.test(src)) fail("hook.js must not log req.url, the query, or the hook secret");
  if (!failed) pass("static: compare is crypto.timingSafeEqual (no ==/===), strict 64-hex hash guard, secret read from X-Hook-Secret only, no req.url/query logging");

  // Malformed stored hash: refused (401) without throwing, for the right secret and for
  // wrong-length / non-hex secrets alike.
  const malformed = [
    ["short hex", goodHash.slice(0, 62)],
    ["long hex", goodHash + "00"],
    ["right hash plus junk", goodHash + "zz"],
    ["non-hex 64", "g".repeat(64)],
    ["hex with a space", goodHash.slice(0, 32) + " " + goodHash.slice(33)],
    ["number", 12345],
    ["object", { hex: goodHash }]
  ];
  const secretsToTry = [TEST_SECRET, "x", "zz-not-hex-zz", "a".repeat(5000), goodHash, "\u00e9\u00e8\u2603"];
  watch("zz-not-hex-zz");
  for (const m of malformed) {
    shop.hookSecretHash = m[1];
    for (const sec of secretsToTry) {
      const before = snap("job_victim1");
      let rr = null;
      try { rr = await call(Object.assign({}, H, { "x-hook-secret": sec }), { id: "job_victim1", event: "update", notes: "MALFORMED OVERWRITE" }); }
      catch (e) { fail("malformed hash (" + m[0] + ") threw: " + String(e && e.message || e).slice(0, 120)); continue; }
      if (rr.statusCode !== 401) fail("malformed hash (" + m[0] + ") with a " + sec.length + "-char secret -> expected 401, got " + rr.statusCode);
      if (snap("job_victim1") !== before) fail("malformed hash (" + m[0] + ") changed the card");
    }
  }
  // With a good hash, a non-hex or wrong-length secret is just a wrong secret.
  shop.hookSecretHash = goodHash;
  for (const sec of ["x", "zz-not-hex-zz", "a".repeat(5000), goodHash, goodHash.toUpperCase(), "\u00e9\u00e8\u2603"]) {
    let rr = null;
    try { rr = await call(Object.assign({}, H, { "x-hook-secret": sec }), { id: "job_victim1", event: "kill" }); }
    catch (e) { fail("odd secret threw: " + String(e && e.message || e).slice(0, 120)); continue; }
    if (rr.statusCode !== 401) fail("odd " + sec.length + "-char secret -> expected 401, got " + rr.statusCode);
  }
  crypto.timingSafeEqual = realTSE;
  if (!failed) pass("malformed stored hash and wrong-length / non-hex secrets are refused with 401, no throw");

  // 5. Another desk's secret does not open this desk.
  const other = mem.workspaces.find((w) => w.slug === "other");
  other.hookSecretHash = crypto.createHash("sha256").update("other-desk-secret").digest("hex");
  r = await call(Object.assign({}, H, { "x-hook-secret": "other-desk-secret" }), { id: "job_victim1", event: "kill" });
  if (r.statusCode !== 401) fail("other desk secret opened victim card -> " + r.statusCode);
  else pass("another desk's secret does not open this desk");

  // 6. Nothing above leaked a secret or its hash into console output, logs, or replies.
  if (!leaks && calls > 0) pass("no hook secret or hash in console/stdout/stderr, audit or inbox rows, or replies across " + calls + " calls (" + captured + " captured lines)");
  else if (!calls) fail("no calls were made");

  done();
})().catch((e) => { console.error("FAIL " + (e && e.stack || e)); try { fs.rmSync(store, { force: true }); } catch (x) {} process.exit(1); });
