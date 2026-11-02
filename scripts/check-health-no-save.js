#!/usr/bin/env node
require("./_env-guard");
// GET /api/health must be read-only. QA uses it as a GET-only check, so a
// health read must never call save() and never write the shared store
// (aia/store.json): no put, no del, no copy, no REST PUT/DELETE.
// Uses a fake @vercel/blob and a fake fetch. No network. No real store.
// Cold (first load still in flight) and warm (already loaded) both count.
// Collect stays HOLD. No money field is read or changed here.
const os = require("os");
const path = require("path");
const Module = require("module");

const BLOB_KEY = "aia/store.json";
const HOST = "https://testhost.private.blob.vercel-storage.com/";
const fake = { files: Object.create(null), writes: [], reads: 0 };

function seedStore(extraJobs, extraWorkspaces) {
  fake.files[BLOB_KEY] = JSON.stringify({
    workspaces: [{ slug: "probe-shop", name: "Probe Shop" }].concat(extraWorkspaces || []),
    jobs: [{ id: "job_probe1", workspace: "probe-shop", title: "Fix a sink" }].concat(extraJobs || []),
    connections: [], audit: [], money: [], files: [], migrations: {}
  });
}

function blobUrl(key) { return HOST + key; }

Module._load = (function (orig) {
  return function (request) {
    if (request === "@vercel/blob") {
      return {
        async head(key) {
          fake.reads++;
          if (!fake.files[key]) throw new Error("Vercel Blob: The requested blob does not exist");
          return { pathname: key, url: blobUrl(key), downloadUrl: blobUrl(key) + "?download=1" };
        },
        async get(key) {
          fake.reads++;
          const k = String(key || "").replace(HOST, "").replace(/\?.*$/, "");
          if (!fake.files[k]) return null;
          const raw = fake.files[k];
          return { statusCode: 200, stream: { text: async () => raw }, blob: { url: blobUrl(k) } };
        },
        async list() {
          fake.reads++;
          return { blobs: Object.keys(fake.files).map((p) => ({ pathname: p, url: blobUrl(p) })), hasMore: false };
        },
        async put(key, body) { fake.writes.push("put " + key); fake.files[key] = String(body); return { url: blobUrl(key) }; },
        async del(key) { fake.writes.push("del " + key); delete fake.files[key]; },
        async copy(from, to) { fake.writes.push("copy " + from + " -> " + to); return { url: blobUrl(to) }; }
      };
    }
    return orig.apply(this, arguments);
  };
})(Module._load);

global.fetch = async function (url, opts) {
  const method = String((opts && opts.method) || "GET").toUpperCase();
  const u = String(url || "");
  if (method !== "GET" && method !== "HEAD") fake.writes.push("fetch " + method + " " + u);
  if (u.indexOf("blob.vercel-storage.com") < 0 && u.indexOf("vercel.com/api/blob") < 0) {
    fake.writes.push("network " + u);
    throw new Error("no network in check-health-no-save: " + u);
  }
  const k = u.replace(HOST, "").replace(/\?.*$/, "");
  if (!fake.files[k]) return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
  return { ok: true, status: 200, text: async () => fake.files[k] };
};

process.env.VERCEL_ENV = "production";
process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_testhost_fake";
process.env.BLOB_STORE_ID = "testhost";
delete process.env.VERCEL_OIDC_TOKEN;
process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-health-no-save-" + Date.now() + ".json");
process.env.AIA_TLD_PROBE = "0";

function fail(msg) { console.error("FAIL " + msg); process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }
function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end() { return this; }
  };
}

let saves = 0;
function boot() {
  ["__aia", "__aiaHydrate", "__aiaStoreLoaded", "__aiaColdInflight", "__aiaColdTried", "__aiaHydrateRejected"]
    .forEach((k) => { delete global[k]; });
  Object.keys(require.cache).forEach((id) => {
    if (/\/api\/[^/]+\.js$/.test(id)) delete require.cache[id];
  });
  const lib = require("../api/_lib");
  const realSave = lib.save;
  // Wrap before health.js loads so its destructured save is this counter.
  lib.save = async function () { saves++; return realSave.apply(this, arguments); };
  return { lib, health: require("../api/health") };
}

async function get(health, url, query) {
  const res = mockRes();
  await health({ method: "GET", headers: {}, query: query || {}, url: url }, res);
  return res;
}

function counted(label, before, res) {
  const w = fake.writes.slice(before.writes);
  const s = saves - before.saves;
  if (res.statusCode !== 200 || !res.body || res.body.ok !== true) fail(label + ": status " + res.statusCode);
  if (s !== 0) fail(label + ": save() called " + s + " time(s), want 0");
  if (w.length !== 0) fail(label + ": " + w.length + " blob write(s), want 0: " + w.join("; "));
  if (s === 0 && w.length === 0) pass(label + ": 0 save() calls, 0 blob writes");
}

function mark() { return { writes: fake.writes.length, saves: saves }; }

async function main() {
  seedStore();
  // Cold: module load starts the first hydrate; health is the first request.
  let m = mark();
  const app = boot();
  const cold = await get(app.health, "/api/health");
  counted("cold GET /api/health", m, cold);
  if (cold.body && cold.body.store && cold.body.store.driver !== "shared") {
    fail("cold health store.driver should be shared, got " + cold.body.store.driver);
  } else pass("cold health reads the shared store");

  // Warm: same instance, store already loaded.
  m = mark();
  const warm = await get(app.health, "/api/health");
  counted("warm GET /api/health", m, warm);

  // Warm again after another instance changed the store: health must still
  // re-read (live counts) without writing, even if a test row shows up.
  seedStore(
    [{ id: "job_probe2", workspace: "probe-shop", title: "Fix a door" },
      { id: "job_test1", workspace: "p1-scratch", title: "TEST lot of 3" }],
    [{ slug: "probe-two", name: "Probe Two" }]
  );
  m = mark();
  const fresh = await get(app.health, "/api/health");
  counted("warm GET /api/health after store changed", m, fresh);
  const st = (fresh.body && fresh.body.store) || {};
  if (st.workspaces !== 2 || st.jobs !== 2) {
    fail("warm health should re-read counts (workspaces 2, jobs 2 without the test row), got " + JSON.stringify(st));
  } else pass("warm health re-reads the store and hides the test row without writing");

  m = mark();
  const status = await get(app.health, "/api/health?view=status", { view: "status" });
  counted("GET /api/health?view=status", m, status);

  const collect = warm.body && warm.body.automation && warm.body.automation.collect;
  if (collect !== "Payments are off for now. Nothing is charged.") fail("collect line must still say payments are off and nothing is charged, got " + JSON.stringify(collect));
  else pass("collect still says payments are off and nothing is charged");

  const pkg = require("../package.json");
  if (String((pkg.scripts && pkg.scripts.test) || "").indexOf("check-health-no-save.js") < 0) {
    fail("package.json test must run check-health-no-save");
  } else pass("package.json runs check-health-no-save");

  if (process.exitCode) console.error("check-health-no-save failed");
  else console.log("check-health-no-save passed");
}

main().catch((e) => {
  console.error("FAIL " + (e && e.stack || e));
  console.error("check-health-no-save failed");
  process.exitCode = 1;
});
