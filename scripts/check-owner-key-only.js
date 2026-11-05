#!/usr/bin/env node
require("./_env-guard");
// Owner key only. A desk with no connected key skips pickDrafter, grokRecommend,
// and studioDraft as needsKey and does not call fetch, even when an env key is
// set. A packed desk key drafts when AIA_CONNECT_SECRET is set. With that secret
// unset, saving a key is refused and unwrap does not decrypt. XAI_API_KEY,
// BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN, and the old pilot string are not the
// cipher. No production env. Values are never printed.
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-owner-key-" + process.pid + "-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
const upload = path.join(os.tmpdir(), "aia-owner-key-up-" + process.pid);
process.env.AIA_UPLOAD_DIR = upload;

const KEY_ENVS = ["XAI_API_KEY", "GROK_API_KEY", "AIA_GROK_KEY", "AIA_CONNECT_SECRET", "BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN"];
KEY_ENVS.forEach(function (k) { delete process.env[k]; });

delete global.__aia;
delete global.__aiaHydrate;

const grok = require("../api/_grok");
const connections = require("../api/connections");
const jobs = require("../api/jobs");
const hook = require("../api/hook");
const packs = require("../api/_packs");
const { mem, hashPin, ensurePeople, ready } = require("../api/_lib");

const SLUG = "owner-key";
const PIN = "4821";
const DESK_KEY = "xai-owner-desk-key-0001";
const SECRET = "owner-key-check-secret";
const NOTE = "A Desk AI can't draft on this phone yet.";
const SUGGEST_NOTE = "A Desk AI can't draft on this phone yet. You can still put the work on the queue.";

let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); process.exitCode = 1; }
function pass(m) { console.log("ok   " + m); }
function eq(actual, expected, msg) {
  if (actual === expected) pass(msg);
  else fail(msg + " — got " + JSON.stringify(actual));
}
function drafterState(d) {
  if (!d) return "null";
  return String(d.source || "") + ":" + String(d.provider || "");
}

let fetches = 0;
let lastAuth = "";
let fetchMode = "block";
global.fetch = async function (_url, init) {
  fetches += 1;
  const headers = (init && init.headers) || {};
  lastAuth = headers.Authorization || headers.authorization || "";
  if (fetchMode === "block") throw new Error("fetch-blocked");
  return {
    ok: true,
    status: 200,
    json: async function () {
      return { choices: [{ message: { content: "{\"draft\":\"Desk draft\",\"name\":\"Lane\",\"does\":\"Draft notes\",\"ask\":0}" } }] };
    }
  };
};

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

async function call(handler, method, headers, body, query) {
  const res = mockRes();
  await handler({
    method: method,
    headers: headers || {},
    body: body || {},
    query: query || {},
    url: "/api/" + method.toLowerCase()
  }, res);
  return res;
}

function packWith(secret, plain) {
  const key = crypto.createHash("sha256").update(String(secret)).digest();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}

function plant(workspace, provider, secret, plain) {
  mem.connections = (mem.connections || []).filter(function (c) { return !c || c.workspace !== workspace; });
  mem.connections.unshift({
    id: "ai_" + provider + "_" + workspace,
    workspace: workspace,
    provider: provider,
    lane: "draft",
    keyPacked: packWith(secret, plain)
  });
}

function envKeys(on) {
  if (on) {
    process.env.XAI_API_KEY = "xai-env-not-a-desk-key";
    process.env.GROK_API_KEY = "grok-env-not-a-desk-key";
    process.env.AIA_GROK_KEY = "aia-env-not-a-desk-key";
  } else {
    delete process.env.XAI_API_KEY;
    delete process.env.GROK_API_KEY;
    delete process.env.AIA_GROK_KEY;
  }
}

async function main() {
  await ready();
  const shop = {
    slug: SLUG,
    name: "Ada",
    biz: SLUG,
    pin: hashPin(PIN),
    createdAt: new Date().toISOString(),
    people: [],
    rules: []
  };
  ensurePeople(shop);
  if (!Array.isArray(mem.workspaces)) mem.workspaces = [];
  mem.workspaces.unshift(shop);
  if (!Array.isArray(mem.connections)) mem.connections = [];
  if (!Array.isArray(mem.jobs)) mem.jobs = [];
  const owner = { "x-workspace": SLUG, "x-pin": PIN };

  mem.connections = mem.connections.filter(function (c) { return !c || c.workspace !== SLUG; });
  envKeys(false);
  delete process.env.AIA_CONNECT_SECRET;
  fetches = 0;
  eq(drafterState(grok.pickDrafter(SLUG)), "null", "no desk key: pickDrafter is null");
  const skipped = await grok.grokRecommend({ id: "job_skip", title: "Porch", workspace: SLUG }, shop, SLUG);
  eq(skipped && skipped.skipped, true, "no desk key: grokRecommend skipped");
  eq(skipped && skipped.reason, "needsKey", "no desk key: grokRecommend needsKey");
  const studio = await grok.studioDraft("Name a lane pack", SLUG, { kind: "pack" });
  eq(studio && studio.skipped, true, "no desk key: studioDraft skipped");
  eq(studio && studio.reason, "needsKey", "no desk key: studioDraft needsKey");
  eq(fetches, 0, "no desk key: fetch was not called");

  envKeys(true);
  fetches = 0;
  eq(grok.grokOn(), true, "env key still reports on for ops status");
  eq(drafterState(grok.pickDrafter(SLUG)), "null", "env key is not a desk drafter");
  const envRec = await grok.grokRecommend({ id: "job_env", title: "Porch", workspace: SLUG }, shop, SLUG);
  eq(envRec && envRec.reason, "needsKey", "env key: grokRecommend needsKey");
  const envStudio = await grok.studioDraft("Name a lane pack", SLUG, { kind: "pack" });
  eq(envStudio && envStudio.reason, "needsKey", "env key: studioDraft needsKey");
  eq(fetches, 0, "env key: fetch was not called");

  const suggest = await call(jobs, "POST", owner, { action: "suggest", title: "Porch photos" });
  eq(suggest.statusCode, 200, "suggest answers");
  eq(suggest.body && suggest.body.grok, "needsKey", "suggest surfaces needsKey");
  eq(suggest.body && suggest.body.note, SUGGEST_NOTE, "suggest keeps the drafts-off note");
  eq(fetches, 0, "suggest did not fetch");

  const captured = await call(jobs, "POST", owner, { action: "capture", title: "Capture porch" });
  eq(captured.statusCode, 201, "capture answers");
  eq(fetches, 0, "capture did not fetch");
  const jobId = captured.body && captured.body.job && captured.body.job.id;
  if (!jobId) fail("capture did not return a job id");
  else pass("capture returned a job id");

  const qualify = await call(jobs, "POST", owner, { action: "qualify", id: jobId });
  eq(qualify.statusCode, 200, "qualify answers");
  eq(qualify.body && qualify.body.grok, "needsKey", "qualify surfaces needsKey");

  const recommend = await call(jobs, "POST", owner, { action: "recommend", id: jobId });
  eq(recommend.statusCode, 200, "recommend answers");
  eq(recommend.body && recommend.body.grok, "needsKey", "recommend surfaces needsKey");
  eq(fetches, 0, "jobs callers did not fetch");

  const hooked = await call(hook, "POST", owner, { event: "capture", title: "Hook porch" });
  eq(hooked.statusCode, 201, "hook capture answers");
  eq(hooked.body && hooked.body.job && hooked.body.job.draftReason, "needsKey", "hook surfaces needsKey");
  eq(fetches, 0, "hook did not fetch");

  const listed = await call(packs, "GET", owner, {}, {});
  eq(listed.statusCode, 200, "packs list answers");
  eq(listed.body && listed.body.grok && listed.body.grok.on, false, "packs list is off without a desk key");
  eq(listed.body && listed.body.grok && listed.body.grok.note, NOTE, "packs list uses the drafts-off note");
  if (JSON.stringify(listed.body && listed.body.grok || {}).indexOf("XAI_API_KEY") >= 0) fail("packs list still names XAI_API_KEY");
  else pass("packs list does not name XAI_API_KEY");

  const drafted = await call(packs, "POST", owner, { action: "studio-draft", brief: "Name a lane pack", kind: "pack" });
  eq(drafted.statusCode, 200, "studio-draft answers");
  eq(drafted.body && drafted.body.grok, "needsKey", "studio-draft surfaces needsKey");
  eq(drafted.body && drafted.body.saved, false, "studio-draft does not save");
  eq(fetches, 0, "studio-draft did not fetch");

  envKeys(false);
  process.env.AIA_CONNECT_SECRET = SECRET;
  const saved = await call(connections, "POST", owner, { action: "ai", provider: "grok", key: DESK_KEY });
  eq(saved.statusCode, 201, "desk key saves when the connect secret is set");
  eq(saved.body && saved.body.ok, true, "desk key save is ok");
  const packedBefore = (mem.connections.find(function (c) { return c && c.workspace === SLUG && c.provider === "grok"; }) || {}).keyPacked || "";
  const drafter = grok.pickDrafter(SLUG);
  if (!drafter || drafter.key !== DESK_KEY || drafter.source !== "desk") fail("packed desk key did not unwrap for this desk (" + drafterState(drafter) + ")");
  else pass("packed desk key unwraps for this desk");

  fetchMode = "ok";
  fetches = 0;
  lastAuth = "";
  const live = await grok.grokRecommend({ id: "job_live", title: "Porch", workspace: SLUG }, shop, SLUG);
  eq(live && live.ok, true, "desk key: grokRecommend drafts");
  eq(fetches, 1, "desk key: grokRecommend called fetch once");
  if (lastAuth !== "Bearer " + DESK_KEY) fail("grokRecommend did not use the desk key");
  else pass("grokRecommend used the desk key");
  fetches = 0;
  lastAuth = "";
  const liveStudio = await grok.studioDraft("Name a lane pack", SLUG, { kind: "pack" });
  eq(liveStudio && liveStudio.ok, true, "desk key: studioDraft drafts");
  eq(liveStudio && liveStudio.source, "desk", "studioDraft source is the desk");
  eq(fetches, 1, "desk key: studioDraft called fetch once");
  if (lastAuth !== "Bearer " + DESK_KEY) fail("studioDraft did not use the desk key");
  else pass("studioDraft used the desk key");
  const listedOn = await call(packs, "GET", owner, {}, {});
  eq(listedOn.body && listedOn.body.grok && listedOn.body.grok.on, true, "packs list is on with a desk key");

  delete process.env.AIA_CONNECT_SECRET;
  process.env.XAI_API_KEY = "xai-env-not-a-desk-key";
  process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN = "blob-token-not-a-cipher";
  fetches = 0;
  fetchMode = "block";
  eq(drafterState(grok.pickDrafter(SLUG)), "null", "unset connect secret does not unwrap the desk key");
  const before = (mem.connections || []).filter(function (c) { return c && c.workspace === SLUG && c.provider === "openai"; }).length;
  const refused = await call(connections, "POST", owner, { action: "ai", provider: "openai", key: "sk-openai-owner-check-key" });
  eq(refused.statusCode, 409, "save without the connect secret is refused");
  eq(refused.body && refused.body.ok, false, "refused save is not ok");
  eq(refused.body && refused.body.error, "keyLocked", "refused save error is keyLocked");
  eq(refused.body && refused.body.reason, "needsConnectSecret", "refused save reason is needsConnectSecret");
  const after = (mem.connections || []).filter(function (c) { return c && c.workspace === SLUG && c.provider === "openai"; }).length;
  eq(after, before, "refused save did not store a key");
  const packedAfter = (mem.connections.find(function (c) { return c && c.workspace === SLUG && c.provider === "grok"; }) || {}).keyPacked || "";
  eq(packedAfter, packedBefore, "existing keyPacked was not rewritten");
  eq(fetches, 0, "refused save did not fetch");

  const side = "owner-key-fallback";
  plant(side, "grok", process.env.XAI_API_KEY, "fallback-xai-plain");
  eq(drafterState(grok.pickDrafter(side)), "null", "XAI_API_KEY is not the cipher");
  plant(side, "grok", "aia-draft-pilot", "fallback-pilot-plain");
  eq(drafterState(grok.pickDrafter(side)), "null", "aia-draft-pilot is not the cipher");
  plant(side, "grok", process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN, "fallback-blob-plain");
  eq(drafterState(grok.pickDrafter(side)), "null", "BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN is not the cipher");
  delete process.env.XAI_API_KEY;
  delete process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN;
  plant(side, "grok", "aia-draft-pilot", "fallback-pilot-plain");
  eq(drafterState(grok.pickDrafter(side)), "null", "pilot string alone is not the cipher");

  process.env.AIA_CONNECT_SECRET = SECRET;
  mem.connections = (mem.connections || []).filter(function (c) { return !c || c.workspace !== side; });
  const again = grok.pickDrafter(SLUG);
  if (!again || again.key !== DESK_KEY) fail("the original secret still opens the packed desk key (" + drafterState(again) + ")");
  else pass("the original secret still opens the packed desk key");

  try { fs.rmSync(store, { force: true }); } catch (e) {}
  try { fs.rmSync(upload, { recursive: true, force: true }); } catch (e) {}
  if (failed) {
    console.error("check-owner-key-only: " + failed + " failed");
    process.exit(1);
  }
  console.log("check-owner-key-only: ok");
}

main().catch(function (e) {
  console.error("FAIL " + ((e && e.message) || e));
  process.exit(1);
});
