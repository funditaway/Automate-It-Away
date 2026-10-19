#!/usr/bin/env node
// 329c: the production path that check-upload-cold-b's "fail" scenario misses.
// On Vercel, hydrate() does not reject when the blob read fails: blobRead()
// turns the error into null (blobProbe.read = "error"), hydrate() applies the
// empty starter and resolves. On 2eb7259 the module-level .then() and
// loadIfCold() then mark the store loaded, so every later GET /api/upload in
// that process answers 404 "No desk with that name." This check runs the real
// hydrate() at require time against a mock Blob whose reads fail while the
// module loads and work once a request runs (the same split /api/jobs sees,
// because ready() reads again inside the request). No thrown promise is
// injected. It must fail on 2eb7259 and pass on the fix. Mock Blob only.
// The request-time load must never write the store back (no hydrate()
// write-back, no persist scrub), a failed load must answer a JSON 503, and a
// missing store must count as "nothing to load", not as a failure.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const MAIN = "2eb7259";
const SLUG = "aia";
const PIN = "7314";
const TOKEN = "vercel_blob_rw_FAKESTORE_fakefakefake";
const OLD_ID = "file_alreadythere01";
const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]);

function scrub(msg) {
  return String(msg || "").split(PIN).join("[pin]").replace(/vercel_blob_rw_[A-Za-z0-9_]+/g, "[token]");
}
function fail(msg) { console.error("FAIL " + scrub(msg)); process.exit(1); }
function pass(msg) { console.log("ok  " + scrub(msg)); }
function pinHash(pin) {
  return crypto.createHash("sha256").update(String(pin) + ":" + (process.env.AIA_PIN_SALT || "aia-pilot")).digest("hex");
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; }
  };
}
async function call(h, method, headers, body) {
  const res = mockRes();
  try {
    await h({ method: method, headers: headers || {}, body: body || {}, query: {} }, res);
  } catch (e) {
    return { statusCode: 500, body: { error: "threw: " + String(e && e.message || e) } };
  }
  return res;
}

// failMode: null (reads work), "403" (auth refused, as with no request-scoped
// OIDC token), "net" (fetch failed), or "missing" (every read says the blob
// does not exist, even when it does). Writes are recorded, never refused.
function installMock(Module) {
  const fake = { files: Object.create(null), failMode: null, ops: [], storePuts: 0 };
  function pathFrom(u) {
    const s = String(u || "");
    if (!/^https?:/i.test(s)) return s.replace(/^\/+/, "");
    const parsed = new URL(s);
    return parsed.searchParams.get("pathname") || decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  }
  function isStore(k) { return /store\.json$/.test(pathFrom(k)); }
  function url(p) { return "https://store_FAKESTORE.public.blob.vercel-storage.com/" + p; }
  function refuse() {
    if (fake.failMode === "403") {
      const e = new Error("Vercel Blob: Access denied, please provide a valid token for this resource. (403)");
      e.status = 403;
      throw e;
    }
    if (fake.failMode === "net") throw new Error("fetch failed: ECONNRESET");
    if (fake.failMode === "missing") throw new Error("Vercel Blob: The requested blob does not exist");
  }
  const orig = Module._load;
  Module._load = function (request) {
    if (request === "@vercel/blob") {
      return {
        async head(key) {
          fake.ops.push({ op: "head", store: isStore(key) });
          refuse();
          const raw = fake.files[pathFrom(key)];
          if (!raw) throw new Error("Vercel Blob: The requested blob does not exist");
          return { pathname: pathFrom(key), url: url(pathFrom(key)), size: raw.length, contentType: "application/json" };
        },
        async get(key) {
          fake.ops.push({ op: "get", store: isStore(key) });
          refuse();
          const raw = fake.files[pathFrom(key)];
          if (!raw) throw new Error("Vercel Blob: The requested blob does not exist");
          const text = raw.toString("utf8");
          return { statusCode: 200, stream: { text: async () => text }, blob: { url: url(pathFrom(key)) } };
        },
        async put(key, body, opts) {
          const p = String(key) + (opts && opts.addRandomSuffix ? "-" + crypto.randomBytes(4).toString("hex") : "");
          if (isStore(p)) fake.storePuts += 1;
          fake.ops.push({ op: "put", store: isStore(p) });
          fake.files[p] = Buffer.isBuffer(body) ? Buffer.from(body) : Buffer.from(String(body));
          return { url: url(p), pathname: p };
        },
        async del() {},
        async list() {
          fake.ops.push({ op: "list", store: true });
          if (fake.failMode !== "missing") refuse();
          return { blobs: [], hasMore: false };
        }
      };
    }
    return orig.apply(this, arguments);
  };
  global.fetch = async function (u, opts) {
    const s = String(u || "");
    const method = String((opts && opts.method) || "GET").toUpperCase();
    const no = { ok: false, status: 404, statusText: "Not Found", url: s, text: async () => "", headers: { get: () => null } };
    if (s.indexOf("blob.vercel-storage.com") < 0 && s.indexOf("vercel.com/api/blob") < 0) return no;
    if (method === "GET") {
      fake.ops.push({ op: "get", store: isStore(s) || /aia-store\.json/.test(s) });
      if (fake.failMode === "403") return { ok: false, status: 403, statusText: "Forbidden", url: s, text: async () => "Forbidden", headers: { get: () => null } };
      if (fake.failMode === "net") throw new Error("fetch failed: ECONNRESET");
      if (fake.failMode === "missing") return no;
      const raw = fake.files[pathFrom(s)];
      if (!raw) return no;
      const text = raw.toString("utf8");
      return { ok: true, status: 200, url: s, text: async () => text, headers: { get: () => null } };
    }
    const p = new URL(s).searchParams.get("pathname") || pathFrom(s);
    if (isStore(p) || /aia-store\.json/.test(p)) fake.storePuts += 1;
    fake.ops.push({ op: "put", store: true });
    fake.files[p] = Buffer.from(String((opts && opts.body) || ""));
    return { ok: true, status: 200, url: s, text: async () => JSON.stringify({ url: url(p), pathname: p }), headers: { get: () => null } };
  };
  return fake;
}

function seed(fake) {
  const h = pinHash(PIN);
  const store = {
    account: null, accounts: [], sessions: [], approvals: [], locks: [], connections: [],
    // hydrate()'s persistScrub() drops this job and PUTs the store; the request-time load must not.
    jobs: [{ id: "job_coldc_scrub", workspace: SLUG, title: "TEST lot cold-c" }], audit: [], money: [],
    workspaces: [{ slug: SLUG, name: "AIA", pin: h, people: [{ id: "p_owner", name: "Owner", role: "owner", pin: h, status: "approved" }] }],
    inbox: [],
    files: [{ id: OLD_ID, workspace: SLUG, name: "earlier.pdf", type: "application/octet-stream", bytes: 4, driver: "blob", url: "https://store_FAKESTORE.public.blob.vercel-storage.com/already" }],
    tickets: [], packs: [], mail: [], migrations: {}
  };
  fake.files["aia/store.json"] = Buffer.from(JSON.stringify(store));
}

async function child(scenario, apiDir) {
  const checks = [];
  const t = (name, ok, detail) => checks.push({ name: name, ok: !!ok, detail: detail == null ? "" : scrub(JSON.stringify(detail)) });
  const fake = installMock(require("module"));
  if (scenario !== "fresh") seed(fake);
  const mode = scenario === "net" || scenario === "net-stays" ? "net" : "403";
  fake.failMode = mode;
  const storeText = () => fake.files["aia/store.json"] ? fake.files["aia/store.json"].toString("utf8") : null;
  const before = storeText();
  const lib = require(path.join(apiDir, "_lib.js"));
  const upload = require(path.join(apiDir, "upload.js"));
  let rejected = false;
  await Promise.resolve(globalThis.__aiaHydrate).catch(() => { rejected = true; });
  await sleep(0);
  // This is the production shape: the module hydrate RESOLVES, it does not throw.
  t("module hydrate resolves (does not reject) on a blob read " + mode + " error", !rejected, { rejected: rejected });
  t("module hydrate left the starter store (desk not in memory)", !(lib.mem.workspaces || []).some((w) => w && w.slug === SLUG), "");
  t("failed module load wrote nothing to the store", fake.storePuts === 0 && storeText() === before, { puts: fake.storePuts });
  const seat = { "x-workspace": SLUG, "x-pin": PIN };

  if (scenario === "403" || scenario === "net") {
    // A request runs now; reads work inside it (as ready() sees on /api/jobs).
    fake.failMode = null;
    fake.ops = [];
    const [g1, g2] = await Promise.all([call(upload, "GET", seat), call(upload, "GET", { "x-workspace": SLUG })]);
    const coldReads = fake.ops.filter((o) => o.store && (o.op === "head" || o.op === "get")).length;
    t("cold GET /api/upload with owner seat -> 200 (not 404 No desk)", g1.statusCode === 200, [g1.statusCode, g1.body && g1.body.error]);
    t("cold GET /api/upload without seat -> 401 (desk found)", g2.statusCode === 401, [g2.statusCode, g2.body && g2.body.error]);
    t("concurrent cold requests share one read (1 head + 1 get)", coldReads <= 2 && coldReads >= 1, { reads: coldReads });
    t("store marked loaded only after the desk is really in memory", globalThis.__aiaStoreLoaded === true && (lib.mem.workspaces || []).some((w) => w && w.slug === SLUG), "");
    t("request-time load wrote nothing back to the store", fake.storePuts === 0 && storeText() === before, { puts: fake.storePuts });
    fake.ops = [];
    const p = await call(upload, "POST", { "x-workspace": SLUG, "x-forwarded-for": "198.51.100.7" }, { name: "porch.png", type: "image/png", data: PNG.toString("base64") });
    const snap = [];
    for (const o of fake.ops) { if (o.op === "put" && o.store) break; if (o.store && (o.op === "head" || o.op === "get" || o.op === "list")) snap.push(o.op); }
    const saved = JSON.parse(fake.files["aia/store.json"].toString("utf8"));
    t("warm POST -> 201", p.statusCode === 201, [p.statusCode, p.body && p.body.error]);
    t("warm POST snapshot reads = 0", snap.length === 0, snap);
    t("upload lands beside the existing file in the store", (saved.files || []).some((f) => f && f.id === OLD_ID) && (saved.files || []).some((f) => f && f.name === "porch.png") && (saved.workspaces || []).some((w) => w && w.slug === SLUG), (saved.files || []).map((f) => f && f.name));
  }

  if (scenario === "net-stays") {
    // Reads keep failing during the request too: fail closed, write nothing, retry later.
    const g = await call(upload, "GET", seat);
    const gp = await call(upload, "POST", { "x-workspace": SLUG, "x-forwarded-for": "198.51.100.8" }, { name: "porch.png", type: "image/png", data: PNG.toString("base64") });
    t("GET while the store cannot be read -> JSON 503", g.statusCode === 503 && g.body && g.body.ok === false && !!g.body.error, [g.statusCode, g.body && g.body.error]);
    t("POST while the store cannot be read -> JSON 503, nothing stored", gp.statusCode === 503 && gp.body && gp.body.ok === false && fake.ops.every((o) => o.op !== "put"), [gp.statusCode, gp.body && gp.body.error]);
    t("store is not marked loaded after a request-time failure", globalThis.__aiaStoreLoaded !== true, globalThis.__aiaStoreLoaded);
    t("request-time failure writes nothing", fake.storePuts === 0 && storeText() === before, { puts: fake.storePuts });
    fake.failMode = null;
    const g2 = await call(upload, "GET", seat);
    t("next request after reads recover -> 200", g2.statusCode === 200, [g2.statusCode, g2.body && g2.body.error]);
  }

  if (scenario === "missing" || scenario === "fresh") {
    // The request-time read finds no store ("missing": a spurious not-found
    // while the store exists; "fresh": no store yet). That is "nothing to load":
    // no 5xx, no retry loop, and above all no write-back of the starter store.
    fake.failMode = "missing";
    fake.ops = [];
    const g = await call(upload, "GET", seat);
    t("missing store in the request is not a 5xx", g.statusCode < 500, [g.statusCode, g.body && g.body.error]);
    t("missing store in the request: nothing written back", fake.storePuts === 0 && storeText() === before, { puts: fake.storePuts });
    t("missing store counts as loaded (not a failure forever)", globalThis.__aiaStoreLoaded === true, globalThis.__aiaStoreLoaded);
    fake.ops = [];
    const g2 = await call(upload, "GET", seat);
    const again = fake.ops.filter((o) => o.store && (o.op === "head" || o.op === "get" || o.op === "list")).length;
    t("next request is not a 5xx and does not read again", g2.statusCode < 500 && again === 0, [g2.statusCode, again]);
  }

  process.stdout.write("RESULT " + JSON.stringify({ checks: checks }) + "\n");
  if (checks.some((c) => !c.ok)) process.exit(1);
}

function run(scenario, apiDir) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-coldc-"));
  const env = {
    PATH: process.env.PATH, HOME: tmp,
    AIA_STORE_PATH: path.join(tmp, "store.json"), AIA_UPLOAD_DIR: path.join(tmp, "up"),
    VERCEL_ENV: "production", BLOB_READ_WRITE_TOKEN: TOKEN, BLOB_STORE_ID: "store_FAKESTORE"
  };
  const r = spawnSync(process.execPath, [__filename, "--child", scenario, apiDir], { env: env, cwd: tmp, encoding: "utf8", timeout: 30000 });
  fs.rmSync(tmp, { recursive: true, force: true });
  const all = String(r.stdout || "") + String(r.stderr || "");
  if (all.indexOf(PIN) >= 0 || all.indexOf(TOKEN) >= 0) return { error: "child output contained a pin or token", checks: [], status: r.status };
  const line = String(r.stdout || "").split("\n").find((l) => l.indexOf("RESULT ") === 0);
  if (!line) return { error: "no result (exit " + r.status + "): " + scrub(all.slice(-400)), checks: [], status: r.status };
  const out = JSON.parse(line.slice(7));
  out.status = r.status;
  return out;
}

function materialize(files) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-coldc-api-"));
  const api = path.join(tmp, "api");
  fs.cpSync(path.join(root, "api"), api, { recursive: true });
  Object.keys(files).forEach((n) => fs.writeFileSync(path.join(api, n), files[n]));
  try { fs.symlinkSync(path.join(root, "node_modules"), path.join(tmp, "node_modules")); } catch (e) {}
  return { api: api, clean: tmp };
}

const SCENARIOS = [
  ["403", "module read refused (403), request read works"],
  ["net", "module read fails (network), request read works"],
  ["net-stays", "reads fail in the request too: JSON 503, write nothing, retry later"],
  ["missing", "module read refused, request read says not found: no 5xx, no write-back"],
  ["fresh", "module read refused, no store yet: no 5xx, no write-back, no retry loop"]
];

if (process.argv[2] === "--child") {
  child(process.argv[3], process.argv[4]).catch((e) => { console.error(e && e.stack || e); process.exit(1); });
} else {
  const api = path.join(root, "api");
  SCENARIOS.forEach(([s, label]) => {
    const out = run(s, api);
    if (out.error) fail(label + ": " + out.error);
    const bad = out.checks.filter((c) => !c.ok);
    if (bad.length || out.status !== 0) fail(label + ": " + bad.map((c) => c.name + " (" + c.detail + ")").join("; "));
    pass(label);
  });
  // The same scenarios against 2eb7259 must fail: that is the production bug.
  const files = {};
  ["_lib.js", "upload.js"].forEach((n) => {
    const r = spawnSync("git", ["show", MAIN + ":api/" + n], { cwd: root, encoding: "utf8" });
    if (r.status !== 0) fail("could not read " + MAIN + " api/" + n);
    files[n] = r.stdout;
  });
  const held = materialize(files);
  ["403", "net"].forEach((s) => {
    const out = run(s, held.api);
    const bad = (out.checks || []).filter((c) => !c.ok);
    if (!bad.length || out.status === 0) { fs.rmSync(held.clean, { recursive: true, force: true }); fail(MAIN + " scenario " + s + " was NOT caught" + (out.error ? " (" + out.error + ")" : "")); }
    pass(MAIN + " fails scenario " + s + " (" + bad[0].name + ": " + bad[0].detail + ")");
  });
  fs.rmSync(held.clean, { recursive: true, force: true });
  pass("check-upload-cold-c passed");
}
