// Fix G check: the shared Blob store (aia/store.json) is production-only.
// Loads api/_lib.js, api/health.js and api/upload.js in a clean child process
// per environment with fake BLOB_* / OIDC values, a fake @vercel/blob and a
// fake fetch. No network. Off production nothing may reach the Blob store;
// on production the existing Blob path must still run.
// `node scripts/check-store-guard.js --mutate` also proves the check fails
// when any part of the guard is removed.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const FAKE = {
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_FAKESTORE_fakefakefake",
  BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN: "vercel_blob_rw_FAKESTORE_fakefakefake2",
  BLOB_READ_WRITE_TOKEN_STORE_ID: "store_FAKESTORE",
  BLOB_STORE_ID: "store_FAKESTORE",
  AIA_BLOB_TOKEN: "fake-aia-blob-token",
  VERCEL_OIDC_TOKEN: "fake.oidc.token"
};
const SCENARIOS = [
  { id: "preview", env: { VERCEL_ENV: "preview" }, prod: false },
  { id: "development", env: { VERCEL_ENV: "development" }, prod: false },
  { id: "unset", env: {}, prod: false },
  { id: "Production-wrong-case", env: { VERCEL_ENV: "Production" }, prod: false },
  { id: "preview-oidc-only", env: { VERCEL_ENV: "preview" }, only: ["VERCEL_OIDC_TOKEN"], prod: false },
  { id: "production", env: { VERCEL_ENV: "production" }, prod: true }
];

// ---------- child: runs one scenario against a given api dir ----------
async function child(apiDir, prod) {
  const Module = require("module");
  const calls = { sdk: [], fetchBlob: [], fetchOther: [] };
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "@vercel/blob") {
      const note = (op) => async (key) => { calls.sdk.push(op + ":" + String(key && key.prefix || key || "")); return op === "put" ? { url: "https://fake.private.blob.vercel-storage.com/aia/store.json" } : (op === "list" ? { blobs: [] } : null); };
      return { get: note("get"), head: note("head"), list: note("list"), put: note("put"), del: note("del") };
    }
    return origLoad.apply(this, arguments);
  };
  global.fetch = async (url) => {
    const u = String(url || "");
    if (/vercel-storage\.com|vercel\.com\/api\/blob/i.test(u)) calls.fetchBlob.push(u);
    else calls.fetchOther.push(u);
    return { status: 404, ok: false, statusText: "Not Found", url: u, text: async () => "", json: async () => ({}) };
  };
  const out = {};
  const lib = require(path.join(apiDir, "_lib.js"));
  await globalThis.__aiaHydrate;
  out.allowed = typeof lib.blobAllowed === "function" ? lib.blobAllowed() : null;
  out.ready = lib.blobReady();
  out.token = !!lib.blobToken();
  out.storeId = !!lib.blobStoreId();
  out.oidcReady = lib.blobOidcReady();
  const probe = lib.publicBlobProbe();
  out.probeToken = probe.token;
  out.probeStoreId = probe.storeId;
  await lib.ready();
  lib.mem.jobs.push({ id: "job_guard", workspace: "guard-check", title: "guard check" });
  out.saved = await lib.save();
  out.driver = lib.mem.driver;
  out.readNull = (await lib.blobRead()) == null;
  out.writeOk = await lib.blobWrite();
  try { await lib.blobHeadMeta(); out.headThrew = null; } catch (e) { out.headThrew = e && e.code || String(e && e.message || e); }
  // health: GET /api/health (calls ready() and save())
  const health = require(path.join(apiDir, "health.js"));
  const hres = fakeRes();
  await health({ method: "GET", query: {}, headers: {}, url: "/api/health" }, hres);
  const hb = hres.body || {};
  out.healthStatus = hres.statusCode;
  out.healthStore = hb.store && hb.store.driver;
  out.healthFiles = hb.files && hb.files.driver;
  // upload: GET /api/upload reports which driver it would store files with
  const upload = require(path.join(apiDir, "upload.js"));
  const ures = fakeRes();
  await upload({ method: "GET", query: {}, headers: {}, url: "/api/upload" }, ures);
  out.uploadDriver = ures.body && ures.body.driver;
  out.calls = { sdk: calls.sdk.length, fetchBlob: calls.fetchBlob.length, sdkPutStore: calls.sdk.filter((c) => c === "put:aia/store.json").length };
  process.stdout.write("RESULT " + JSON.stringify(out) + "\n");
}

function fakeRes() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; }, getHeader(k) { return this.headers[k]; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; },
    send(b) { this.body = b; return this; }
  };
}

// ---------- parent ----------
function runScenario(apiDir, sc) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-guard-"));
  const env = { PATH: process.env.PATH, HOME: tmp, AIA_STORE_PATH: path.join(tmp, "store.json"), AIA_UPLOAD_DIR: path.join(tmp, "up") };
  const names = sc.only || Object.keys(FAKE);
  names.forEach((k) => { env[k] = FAKE[k]; });
  Object.assign(env, sc.env);
  const r = spawnSync(process.execPath, [__filename, "--child", apiDir, sc.prod ? "1" : "0"], { env, cwd: tmp, encoding: "utf8", timeout: 60000 });
  fs.rmSync(tmp, { recursive: true, force: true });
  const line = String(r.stdout || "").split("\n").find((l) => l.indexOf("RESULT ") === 0);
  if (!line) return { error: "no result (exit " + r.status + "): " + String(r.stderr || "").slice(-400) };
  return JSON.parse(line.slice(7));
}

function judge(sc, o) {
  const checks = [];
  const t = (name, ok) => checks.push({ name: sc.id + ": " + name, ok: !!ok });
  if (o.error) { t("child ran", false); return checks; }
  if (!sc.prod) {
    t("blobAllowed() false", o.allowed === false);
    t("blobReady() false (even with OIDC/BLOB_* set)", o.ready === false);
    t("blobToken() empty", o.token === false);
    t("blobStoreId() empty", o.storeId === false);
    t("blobOidcReady() false", o.oidcReady === false);
    t("publicBlobProbe token/storeId false", o.probeToken === false && o.probeStoreId === false);
    t("save() falls back to file store", o.saved === true && o.driver !== "blob");
    t("blobRead() refuses (null)", o.readNull === true);
    t("blobWrite() refuses (false)", o.writeOk === false);
    t("blobHeadMeta() throws AIA_BLOB_PROD_ONLY", o.headThrew === "AIA_BLOB_PROD_ONLY");
    t("/api/health 200, store not shared, files tmp", o.healthStatus === 200 && o.healthStore !== "shared" && o.healthFiles === "tmp");
    t("/api/upload driver is tmp-file", o.uploadDriver === "tmp-file");
    t("zero @vercel/blob calls", o.calls.sdk === 0);
    t("zero Blob HTTP calls", o.calls.fetchBlob === 0);
  } else {
    t("blobAllowed() true", o.allowed === true);
    t("blobReady() true", o.ready === true);
    t("blobToken() set", o.token === true);
    t("blobStoreId() set", o.storeId === true);
    t("publicBlobProbe token/storeId true", o.probeToken === true && o.probeStoreId === true);
    t("Blob SDK path runs (put aia/store.json attempted)", o.calls.sdkPutStore > 0);
    t("blobHeadMeta() not refused", o.headThrew !== "AIA_BLOB_PROD_ONLY");
    t("/api/health 200, files shared", o.healthStatus === 200 && o.healthFiles === "shared");
    t("/api/upload driver is blob", o.uploadDriver === "blob");
  }
  return checks;
}

function runAll(apiDir) {
  let all = [];
  SCENARIOS.forEach((sc) => { all = all.concat(judge(sc, runScenario(apiDir, sc))); });
  return all;
}

const MUTATIONS = [
  { id: "M1 guard always true", file: "_lib.js", from: 'return process.env.VERCEL_ENV === "production";', to: "return true;" },
  { id: "M2 blobReady unguarded", file: "_lib.js", from: "function blobReady() {\n  if (!blobAllowed()) return false;\n", to: "function blobReady() {\n" },
  { id: "M3 blobToken unguarded", file: "_lib.js", from: "function blobToken() {\n  if (!blobAllowed()) return \"\";\n", to: "function blobToken() {\n" },
  { id: "M4 blobStoreId unguarded", file: "_lib.js", from: "function blobStoreId() {\n  if (!blobAllowed()) return \"\";\n", to: "function blobStoreId() {\n" },
  { id: "M5 blobTryAuth unguarded", file: "_lib.js", from: "async function blobTryAuth(run) {\n  if (!blobAllowed()) throw blobOffProd();\n", to: "async function blobTryAuth(run) {\n" },
  { id: "M6 upload driver unguarded", file: "upload.js", from: "if (blobAllowed() && process.env.BLOB_READ_WRITE_TOKEN) return \"blob\";", to: "if (process.env.BLOB_READ_WRITE_TOKEN) return \"blob\";" }
];

function mutate() {
  let caught = 0;
  MUTATIONS.forEach((m) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-guard-mut-"));
    const api = path.join(tmp, "api");
    fs.cpSync(path.join(ROOT, "api"), api, { recursive: true });
    try { fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(tmp, "node_modules")); } catch (e) {}
    const f = path.join(api, m.file);
    const src = fs.readFileSync(f, "utf8");
    if (src.indexOf(m.from) === -1) { console.log("FAIL mutation " + m.id + ": anchor not found"); fs.rmSync(tmp, { recursive: true, force: true }); return; }
    fs.writeFileSync(f, src.replace(m.from, m.to));
    const bad = runAll(api).filter((c) => !c.ok);
    fs.rmSync(tmp, { recursive: true, force: true });
    if (bad.length) { caught++; console.log("PASS mutation " + m.id + " caught (" + bad.length + " checks fail, e.g. " + bad[0].name + ")"); }
    else console.log("FAIL mutation " + m.id + " NOT caught");
  });
  console.log(caught + "/" + MUTATIONS.length + " mutations caught");
  return caught === MUTATIONS.length;
}

if (process.argv[2] === "--child") {
  child(process.argv[3], process.argv[4] === "1").catch((e) => { console.error(e && e.stack || e); process.exit(1); });
} else {
  const checks = runAll(path.join(ROOT, "api"));
  checks.forEach((c) => console.log((c.ok ? "PASS " : "FAIL ") + c.name));
  const failed = checks.filter((c) => !c.ok).length;
  console.log((checks.length - failed) + " PASS, " + failed + " FAIL");
  let ok = failed === 0;
  if (process.argv.includes("--mutate")) ok = mutate() && ok;
  if (!ok) { console.error("check-store-guard failed"); process.exit(1); }
  console.log("check-store-guard passed");
}
