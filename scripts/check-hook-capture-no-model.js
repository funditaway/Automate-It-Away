#!/usr/bin/env node
// Proves POST /api/hook capture: a caller with no seat and no valid X-Hook-Secret
// header still gets the card in (201, card stored) but makes 0 model calls on the
// desk's AI key. A seated owner, an approved helper, and the right header secret
// still get today's AI draft. Global fetch is stubbed; nothing leaves the box.
// Removing the gate, or letting a waiting seat or a query/body secret through,
// makes this check fail.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const store = path.join(os.tmpdir(), "aia-hook-no-model-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
delete global.__aia;
delete global.__aiaHydrate;

// Stub every network call. Count model calls by host. Nothing real is reached.
const calls = { xai: 0, openai: 0, anthropic: 0, other: 0 };
global.fetch = async function (url) {
  const u = String(url || "");
  if (u.indexOf("api.x.ai") >= 0) calls.xai += 1;
  else if (u.indexOf("api.openai.com") >= 0) calls.openai += 1;
  else if (u.indexOf("api.anthropic.com") >= 0) calls.anthropic += 1;
  else calls.other += 1;
  const content = JSON.stringify({ draft: "Stub draft from the test.", next: "Call them back.", recs: [] });
  return {
    ok: true,
    status: 200,
    json: async function () { return { choices: [{ message: { content: content } }], content: [{ type: "text", text: content }] }; },
    text: async function () { return content; }
  };
};
function modelCalls() { return calls.xai + calls.openai + calls.anthropic; }

const lines = [];
function pass(msg) { lines.push("ok  " + msg); }
function fail(msg) {
  // The first line out is the failure, so a red run reads plainly.
  console.error("FAIL " + msg);
  lines.forEach(function (l) { console.error("  (" + l + ")"); });
  try { fs.rmSync(store, { force: true }); } catch (e) {}
  process.exit(1);
}

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
  await handler({ method: method, headers: headers || {}, body: body || {}, query: query || {}, url: url || "/api/hook" }, res);
  return res;
}

function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

function staticChecks() {
  const pkg = read("package.json");
  if (pkg.indexOf("scripts/check-hook-capture-no-model.js") < 0) fail("package.json test must run check-hook-capture-no-model.js");
  const hook = read("api/hook.js");
  if (/stripe|paymentIntent|\.charge\(/.test(hook)) fail("hook must not charge");
  if (/query\[?["'.]?(hookSecret|hook_secret|secret)|body\.(hookSecret|hook_secret|secret)\b/.test(hook)) {
    fail("hook must read the hook secret from the X-Hook-Secret header only");
  }
  pass("package.json runs this check; hook reads no secret from query or body and does not charge");
}

async function main() {
  staticChecks();
  const auth = require(path.join(root, "api/auth"));
  const hook = require(path.join(root, "api/hook"));
  const connections = require(path.join(root, "api/connections"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();
  const mem = lib.mem;

  const slug = "hook-no-model-shop";
  const other = "hook-no-model-other";
  const pin = "4821";

  const opened = await call(auth, "POST", { "x-workspace": slug }, { action: "open", slug: slug, biz: "Hook No Model Shop", name: "James", pin: pin }, {}, "/api/auth");
  if (opened.statusCode !== 201) fail("could not open a desk, got " + opened.statusCode + " " + JSON.stringify(opened.body));
  const token = opened.body && opened.body.session && opened.body.session.token;
  if (!token) fail("desk open should issue a session");
  const opened2 = await call(auth, "POST", { "x-workspace": other }, { action: "open", slug: other, biz: "Other Desk", name: "Pat", pin: "7373" }, {}, "/api/auth");
  if (opened2.statusCode !== 201) fail("could not open a second desk, got " + opened2.statusCode);
  const otherToken = opened2.body && opened2.body.session && opened2.body.session.token;
  if (!otherToken) fail("second desk should issue a session");

  // The owner binds a fake draft key (stub fetch: never checked against a real API).
  const bound = await call(connections, "POST", { "x-workspace": slug, "x-pin": pin }, { provider: "grok", key: "xai-fake-test-key-not-real-0000" }, {}, "/api/connections");
  if (bound.statusCode !== 201) fail("owner could not bind a draft key, got " + bound.statusCode + " " + JSON.stringify(bound.body));
  pass("desk open with a draft key bound (fake key, stub fetch)");

  // Seats: a waiting helper, a denied helper, an approved helper.
  async function join(name, code) {
    // Seat ids are time based; space the joins so each seat gets its own id.
    await new Promise(function (r) { setTimeout(r, 5); });
    const j = await call(auth, "POST", { "x-workspace": slug }, { action: "join", name: name, pin: code, kind: "helper" }, {}, "/api/auth");
    if (j.statusCode !== 202 || !j.body || !j.body.person || !j.body.person.id) fail("could not add a waiting seat for " + name + ", got " + j.statusCode + " " + JSON.stringify(j.body));
    return j.body.person.id;
  }
  await join("Wally", "5151");
  const deniedId = await join("Dena", "6262");
  const helperId = await join("Hal", "8383");
  const denied = await call(auth, "POST", { "x-workspace": slug, "x-pin": pin }, { action: "deny", id: deniedId }, {}, "/api/auth");
  if (denied.statusCode !== 200) fail("owner should deny a seat, got " + denied.statusCode + " " + JSON.stringify(denied.body));
  const approved = await call(auth, "POST", { "x-workspace": slug, "x-pin": pin }, { action: "approve", id: helperId }, {}, "/api/auth");
  if (approved.statusCode !== 200) fail("owner should approve a seat, got " + approved.statusCode + " " + JSON.stringify(approved.body));
  const seats = (((mem.workspaces || []).find(function (w) { return w && w.slug === slug; }) || {}).people || []);
  const statusOf = function (name) { const p = seats.find(function (x) { return x && x.name === name; }); return p && p.status; };
  if (statusOf("Wally") !== "pending" || statusOf("Dena") !== "denied" || statusOf("Hal") !== "approved") {
    fail("seat setup went wrong: Wally " + statusOf("Wally") + ", Dena " + statusOf("Dena") + ", Hal " + statusOf("Hal"));
  }

  // The desk's hook secret (only its sha256 is on the desk row).
  const secret = "hook-secret-for-test-" + crypto.randomBytes(6).toString("hex");
  const shop = (mem.workspaces || []).find(function (w) { return w && w.slug === slug; });
  if (!shop) fail("desk row missing");
  shop.hookSecretHash = crypto.createHash("sha256").update(secret).digest("hex");

  // A .aia mail identity on this desk.
  if (!Array.isArray(mem.mail)) mem.mail = [];
  mem.mail.unshift({ id: "mail_hooknomodel", address: "queue@hook-no-model-shop.aia", workspace: slug, local: "queue", send: "hold" });

  const moneyBefore = (mem.money || []).length;
  const otherCalls = calls.other;
  let n = 0;

  async function capture(label, headers, body, query, wantModel) {
    n += 1;
    const before = modelCalls();
    const res = await call(hook, "POST", Object.assign({ "x-workspace": slug }, headers || {}),
      Object.assign({ event: "capture", title: "Capture " + n + " " + label }, body || {}), query || {});
    const made = modelCalls() - before;
    if (res.statusCode !== 201 || !res.body || res.body.ok !== true) fail(label + ": expected 201, got " + res.statusCode + " " + JSON.stringify(res.body));
    const id = res.body.id || (res.body.job && res.body.job.id);
    const job = id && mem.jobs.find(function (j) { return j && j.id === id; });
    if (!job || job.workspace !== slug) fail(label + ": the card was not stored on the desk");
    if (wantModel) {
      if (made !== 1) fail(label + ": should still make 1 model call, made " + made);
      if (job.aiWait) fail(label + ": card should not be marked waiting for a person");
    } else {
      if (made !== 0) fail(label + " made " + made + " api.x.ai call(s); a hook capture with no seat and no header secret must make 0");
      if (job.aiWait !== "person") fail(label + ": card should show it is waiting for a person (aiWait)");
    }
    pass(label + ": 201, card stored, " + made + " model call(s)");
    return job;
  }

  await capture("a desk name alone", {}, {}, {}, false);
  await capture("a wrong code", { "x-pin": "0000" }, {}, {}, false);
  await capture("a session from another desk", { "x-session": otherToken }, {}, {}, false);
  await capture("a bogus session", { "x-session": "sess_" + crypto.randomBytes(16).toString("hex") }, {}, {}, false);
  await capture("a bogus session cookie", { cookie: "aia_session=bogus" + crypto.randomBytes(8).toString("hex") }, {}, {}, false);
  await capture("a waiting seat", { "x-pin": "5151" }, {}, {}, false);
  await capture("a denied seat", { "x-pin": "6262" }, {}, {}, false);
  const savedHash = shop.hookSecretHash;
  delete shop.hookSecretHash;
  await capture("a header secret when the desk has no hook secret", { "x-hook-secret": secret }, {}, {}, false);
  shop.hookSecretHash = savedHash;
  await capture("a wrong header secret", { "x-hook-secret": "not-the-secret" }, {}, {}, false);
  await capture("the secret in the query", {}, {}, { hookSecret: secret, secret: secret, "x-hook-secret": secret, hook_secret: secret }, false);
  await capture("the secret in the body", {}, { hookSecret: secret, secret: secret, "x-hook-secret": secret, hook_secret: secret }, {}, false);
  await capture("a stranger posting a sold event with no card", {}, { event: "sold", amount: 999 }, {}, false);

  // .aia mail capture with no seat behaves like a stranger.
  {
    const before = modelCalls();
    const res = await call(hook, "POST", {}, { to: "queue@hook-no-model-shop.aia", from: "stranger@example.test", subject: "Hello from mail", text: "Can you help?" }, {});
    const made = modelCalls() - before;
    if (res.statusCode !== 201 || !res.body || !res.body.id) fail(".aia mail capture: expected 201, got " + res.statusCode + " " + JSON.stringify(res.body));
    const job = mem.jobs.find(function (j) { return j && j.id === res.body.id; });
    if (!job || job.workspace !== slug || job.aiaMail !== "queue@hook-no-model-shop.aia") fail(".aia mail capture: card not stored on the desk");
    if (made !== 0) fail(".aia mail capture made " + made + " api.x.ai call(s); with no seat it must make 0 like a stranger");
    if (job.aiWait !== "person") fail(".aia mail capture: card should show it is waiting for a person");
    pass(".aia mail capture with no seat: 201, card stored, 0 model calls");
  }

  // Seats and the header secret keep today's model behavior.
  await capture("the owner with a pin", { "x-pin": pin }, {}, {}, true);
  await capture("the owner with a session", { "x-session": token }, {}, {}, true);
  await capture("an approved helper", { "x-pin": "8383" }, {}, {}, true);
  await capture("the right X-Hook-Secret header", { "x-hook-secret": secret }, {}, {}, true);

  if (calls.openai || calls.anthropic) fail("unexpected non-xAI model calls: " + JSON.stringify(calls));
  if (calls.other !== otherCalls) fail("hook captures made " + (calls.other - otherCalls) + " other network call(s)");
  const moneyAfter = (mem.money || []).length;
  if (moneyAfter !== moneyBefore) fail("hook captures wrote " + (moneyAfter - moneyBefore) + " money row(s)");
  const collect = (mem.jobs || []).filter(function (j) { return j && j.workspace === slug && (j.step === "Collect" || j.status === "shipped"); });
  if (collect.length) fail("hook captures moved " + collect.length + " card(s) to Collect");
  pass("no money row and no Collect card written; only stubbed api.x.ai calls (" + calls.xai + ")");

  const disk = fs.existsSync(store) ? fs.readFileSync(store, "utf8") : "";
  if (disk && disk.indexOf(secret) >= 0) fail("the hook secret was saved to the store");
  pass("the hook secret is not in the store");

  lines.forEach(function (l) { console.log(l); });
  console.log("check-hook-capture-no-model: ok");
  try { fs.rmSync(store, { force: true }); } catch (e) {}
}

main().catch(function (e) { fail("crashed: " + (e && e.stack || e)); });
