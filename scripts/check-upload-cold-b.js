#!/usr/bin/env node
require("./_env-guard");
// 329b: POST /api/upload loads the store only when this process has never loaded
// it. A warm process must not re-read the blob (that is what ready() does, and
// it can drop in-flight uploads). Mock Blob only — not Vercel, not a real cold
// start. 329 and 329b are alternative fixes, not a stack.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const MAIN = "859587b";
const SLUG = "cold-desk";
const PIN = "4821";
const TOKEN = "vercel_blob_rw_FAKESTORE_fakefakefake";
const OLD_ID = "file_alreadythere01";
const OLD_NAME = "earlier-note.pdf";
const LOCAL_NAME = "local-only.txt";
const MARKER_SLUG = "marker-desk";
const MARKER_NAME = "marker-from-other.txt";
const GAPS = [30, 50, 100, 500];
const OVERLAP_GAPS = [30, 50, 100];
const STAGGER_N = 40;
const READ_LATENCY_MS = 25;
const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]);

function fail(msg) {
  console.error("FAIL " + scrub(msg));
  process.exit(1);
}
function pass(msg) { console.log("ok  " + scrub(msg)); }
function scrub(msg) {
  return String(msg || "")
    .split(PIN).join("[pin]")
    .replace(/vercel_blob_rw_[A-Za-z0-9_]+/g, "[token]");
}
function pinHash(pin) {
  return crypto.createHash("sha256").update(String(pin) + ":" + (process.env.AIA_PIN_SALT || "aia-pilot")).digest("hex");
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function assertSources() {
  const lib = fs.readFileSync(path.join(root, "api/_lib.js"), "utf8");
  const upload = fs.readFileSync(path.join(root, "api/upload.js"), "utf8");
  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  if (upload.indexOf("loadIfCold") < 0) fail("upload.js must call loadIfCold");
  const uploadCode = upload.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  if (/ready\s*\(/.test(uploadCode)) fail("upload.js must not call ready()");
  const readyAt = lib.indexOf("async function ready()");
  const coldAt = lib.indexOf("async function loadIfCold()");
  const saveAt = lib.indexOf("async function save()");
  if (readyAt < 0 || coldAt < 0 || saveAt < 0 || !(readyAt < coldAt && coldAt < saveAt)) fail("loadIfCold must sit beside ready() without replacing it");
  const readySrc = lib.slice(readyAt, coldAt);
  const coldSrc = lib.slice(coldAt, saveAt);
  if (readySrc.indexOf("await blobRead()") < 0 || readySrc.indexOf("applyStore(remote)") < 0) fail("ready() must still re-read for its own callers");
  if (readySrc.indexOf("loadIfCold") >= 0) fail("ready() must not call loadIfCold");
  if (coldSrc.indexOf("globalThis.__aiaStoreLoaded") < 0) fail("loadIfCold must return when the store is already loaded");
  if (coldSrc.indexOf("globalThis.__aiaColdInflight") < 0) fail("loadIfCold must share one in-flight load");
  if (coldSrc.indexOf("Date.now") >= 0 || coldSrc.indexOf("setTimeout") >= 0) fail("loadIfCold must not use a time window");
  if (lib.indexOf("loadIfCold,") < 0 && lib.indexOf("loadIfCold ") < 0) fail("loadIfCold must be exported");
  const handlers = fs.readdirSync(path.join(root, "api")).filter((n) => n.endsWith(".js") && n !== "_lib.js" && n !== "upload.js");
  handlers.forEach((n) => {
    const src = fs.readFileSync(path.join(root, "api", n), "utf8");
    if (src.indexOf("loadIfCold") >= 0) fail(n + " must not call loadIfCold");
  });
  if (pkg.indexOf("scripts/check-upload-cold-b.js") < 0) fail("package.json must run check-upload-cold-b");
  if (pkg.indexOf("scripts/check-upload-migrate.js") < 0) fail("package.json must keep check-upload-migrate");
  pass("source: upload waits with loadIfCold, ready() still re-reads, no other handler changed");
}

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
async function call(h, method, headers, body, query) {
  const res = mockRes();
  await h({ method: method, headers: headers || {}, body: body || {}, query: query || {} }, res);
  return res;
}

function installMock(Module) {
  const fake = {
    files: Object.create(null),
    types: Object.create(null),
    puts: [],
    ops: [],
    inflight: 0,
    loadMax: 0,
    sawStorePut: false
  };
  function pathFrom(u) {
    const s = String(u || "");
    if (!/^https?:/i.test(s)) return s.replace(/^\/+/, "");
    const parsed = new URL(s);
    const q = parsed.searchParams.get("pathname");
    if (q) return q;
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  }
  function publicUrl(pathname) {
    return "https://store_FAKESTORE.public.blob.vercel-storage.com/" + pathname;
  }
  function isStore(key) { return pathFrom(key).indexOf("store.json") >= 0; }
  function track(op, key) {
    const store = isStore(key);
    fake.inflight += 1;
    if (!fake.sawStorePut && fake.inflight > fake.loadMax) fake.loadMax = fake.inflight;
    fake.ops.push({ op: op, store: store, beforePut: !fake.sawStorePut });
    return function done() { fake.inflight -= 1; };
  }
  fake.resetCounts = function () {
    fake.ops = [];
    fake.inflight = 0;
    fake.loadMax = 0;
    fake.sawStorePut = false;
    fake.puts = [];
  };
  fake.storeText = function () {
    const raw = fake.files["aia/store.json"];
    return raw ? Buffer.from(raw).toString("utf8") : "";
  };
  const orig = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "@vercel/blob") {
      return {
        async get(key, opts) {
          const store = isStore(key);
          // A store read issued at head() time must answer with that snapshot
          // after the latency, even if a later put landed while it was in flight.
          // Write-verify gets (blobWriteStick) read the live bytes instead.
          const stack = new Error().stack || "";
          const verify = stack.indexOf("blobWriteStick") >= 0;
          const queued = fake.snap && store && !verify && fake.snapQueue && fake.snapQueue.length ? fake.snapQueue.shift() : undefined;
          const done = track("get", key);
          try {
            if (fake.delayReadMs) await sleep(fake.delayReadMs);
            const pathname = pathFrom(key);
            const raw = queued !== undefined ? queued : fake.files[pathname];
            if (!raw) throw new Error("Vercel Blob: The requested blob does not exist");
            const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
            return { statusCode: 200, stream: { text: async () => text }, blob: { url: publicUrl(pathname) } };
          } finally { done(); }
        },
        async head(key, opts) {
          if (fake.snap && isStore(key)) {
            if (!fake.snapQueue) fake.snapQueue = [];
            const cur = fake.files[pathFrom(key)];
            fake.snapQueue.push(cur ? Buffer.from(cur) : null);
          }
          const done = track("head", key);
          try {
            if (fake.delayReadMs) await sleep(fake.delayReadMs);
            const pathname = pathFrom(key);
            const raw = fake.files[pathname];
            if (!raw) throw new Error("Vercel Blob: The requested blob does not exist");
            const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw));
            return { pathname: pathname, url: publicUrl(pathname), size: buf.length, contentType: fake.types[pathname] || "application/json" };
          } finally { done(); }
        },
        async put(key, body, opts) {
          const suffix = opts && opts.addRandomSuffix ? "-" + crypto.randomBytes(4).toString("hex") : "";
          const pathname = String(key) + suffix;
          const storePut = isStore(key) || isStore(pathname);
          fake.ops.push({ op: "put", store: storePut, beforePut: false });
          if (storePut) fake.sawStorePut = true;
          const buf = Buffer.isBuffer(body) ? Buffer.from(body) : Buffer.from(String(body));
          fake.files[pathname] = buf;
          fake.types[pathname] = (opts && opts.contentType) || "application/octet-stream";
          fake.puts.push({ pathname: pathname, contentType: fake.types[pathname] });
          return { url: publicUrl(pathname), pathname: pathname, contentType: fake.types[pathname] };
        },
        async del() { return; },
        async list() { return { blobs: [], hasMore: false }; }
      };
    }
    return orig.apply(this, arguments);
  };
  global.fetch = async function (url, opts) {
    const u = String(url || "");
    const method = String((opts && opts.method) || "GET").toUpperCase();
    const blobish = u.indexOf("blob.vercel-storage.com") >= 0 || u.indexOf("vercel.com/api/blob") >= 0;
    if (!blobish) return { ok: false, status: 404, text: async () => "", headers: { get: () => null }, arrayBuffer: async () => Buffer.alloc(0) };
    if (method === "GET") {
      const done = track("get", u);
      try {
        const pathname = pathFrom(u);
        const raw = fake.files[pathname];
        if (!raw) return { ok: false, status: 404, text: async () => "", headers: { get: () => null }, arrayBuffer: async () => Buffer.alloc(0) };
        const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
        return { ok: true, status: 200, text: async () => text, headers: { get: () => null }, arrayBuffer: async () => Buffer.from(text) };
      } finally { done(); }
    }
    if (method === "PUT" || method === "POST") {
      const parsed = new URL(u);
      const pathname = parsed.searchParams.get("pathname") || pathFrom(u);
      if (isStore(pathname)) fake.sawStorePut = true;
      const body = opts && opts.body;
      const buf = Buffer.isBuffer(body) ? Buffer.from(body) : Buffer.from(String(body || ""));
      fake.files[pathname] = buf;
      return { ok: true, status: 200, text: async () => JSON.stringify({ url: publicUrl(pathname), pathname: pathname }), headers: { get: () => null } };
    }
    return { ok: false, status: 404, text: async () => "", headers: { get: () => null } };
  };
  return { fake: fake };
}

function seedStore(fake) {
  const hashed = pinHash(PIN);
  const store = {
    account: null, accounts: [], sessions: [], approvals: [], locks: [],
    connections: [], jobs: [], audit: [], money: [],
    workspaces: [{
      slug: SLUG,
      name: "Cold Desk",
      pin: hashed,
      people: [{ id: "p_owner", name: "Owen", role: "owner", pin: hashed, status: "approved" }]
    }],
    inbox: [],
    files: [{
      id: OLD_ID,
      workspace: SLUG,
      name: OLD_NAME,
      type: "application/octet-stream",
      bytes: 4,
      driver: "blob",
      url: "https://store_FAKESTORE.public.blob.vercel-storage.com/already"
    }],
    tickets: [], packs: [], mail: [], migrations: {}
  };
  fake.files["aia/store.json"] = Buffer.from(JSON.stringify(store));
  fake.types["aia/store.json"] = "application/json";
}

function storeJson(fake) {
  return JSON.parse(fake.storeText() || "{}");
}
function reloadGets(fake) {
  return fake.ops.filter((o) => o.op === "get" && o.store && o.beforePut).length;
}
function reloadHeads(fake) {
  return fake.ops.filter((o) => o.op === "head" && o.store && o.beforePut).length;
}
function userPuts(fake) {
  return fake.puts.filter((p) => p.pathname.indexOf("store.json") < 0);
}
// Snapshot reads are store head/get calls that start before this request's store put.
// Write-verify gets after the put are not snapshot reads. Counting per request
// matters: a global "before first put" flag hides every warm upload after the first.
function snapshotReadsSince(fake, start) {
  const ops = fake.ops.slice(start);
  let n = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.op === "put" && op.store) break;
    if (op.store && (op.op === "get" || op.op === "head")) n += 1;
  }
  return n;
}
function storeHeads(fake) {
  return fake.ops.filter((o) => o.op === "head" && o.store).length;
}

async function child(scenario, apiDir) {
  const checks = [];
  const t = (name, ok, detail) => checks.push({ name: name, ok: !!ok, detail: detail == null ? "" : scrub(typeof detail === "string" ? detail : JSON.stringify(detail)) });
  if (scenario === "fail") {
    globalThis.__aiaHydrate = Promise.reject(new Error("cold load failed"));
    globalThis.__aiaHydrate.catch(function () {});
  }
  const hydratePromise = globalThis.__aiaHydrate;
  const { fake } = installMock(require("module"));
  seedStore(fake);
  if (scenario === "cold" || scenario === "concurrent") fake.delayReadMs = 250;
  const lib = require(path.join(apiDir, "_lib.js"));
  const upload = require(path.join(apiDir, "upload.js"));
  const post = (name, ip) => call(upload, "POST", { "x-workspace": SLUG, "x-forwarded-for": ip || "198.51.100.9" }, {
    name: name, type: "image/png", data: PNG.toString("base64")
  });
  const get = () => call(upload, "GET", { "x-workspace": SLUG, "x-pin": PIN }, {});

  if (scenario === "cold") {
    const coldEmpty = !(lib.mem.workspaces || []).some((w) => w && w.slug === SLUG);
    t("cold: desk is not in memory when the handler is required", coldEmpty, "");
    const posted = post("porch.png", "198.51.100.9");
    const listed = get();
    const res = await posted;
    const list = await listed;
    const saved = storeJson(fake);
    const memFiles = (lib.mem.files || []).filter((f) => f && f.workspace === SLUG);
    const blobFiles = (saved.files || []).filter((f) => f && f.workspace === SLUG);
    t("cold POST into an existing desk -> 201", res.statusCode === 201, [res.statusCode, res.body && res.body.error]);
    t("cold GET seat lookup -> 200 (not 404)", list.statusCode === 200, [list.statusCode, list.body && list.body.error]);
    t("upload is added beside the existing file, not onto an empty store",
      memFiles.some((f) => f.id === OLD_ID) && memFiles.some((f) => f.name === "porch.png") &&
      blobFiles.some((f) => f.id === OLD_ID) && blobFiles.some((f) => f.name === "porch.png") &&
      (saved.workspaces || []).some((w) => w && w.slug === SLUG),
      { mem: memFiles.map((f) => f.name), blob: blobFiles.map((f) => f.name) });
    t("cold desk+seat requests share one load", fake.loadMax === 1 && reloadGets(fake) === 1, { loadMax: fake.loadMax, gets: reloadGets(fake), heads: reloadHeads(fake) });
  }

  if (scenario === "warm") {
    await globalThis.__aiaHydrate;
    t("warm: hydrate marked the store loaded", globalThis.__aiaStoreLoaded === true, "");
    t("warm: desk is in memory", (lib.mem.workspaces || []).some((w) => w && w.slug === SLUG), "");
    lib.mem.files.push({
      id: "file_localonly",
      workspace: SLUG,
      name: LOCAL_NAME,
      type: "application/octet-stream",
      bytes: 3,
      driver: "blob",
      url: "/local-only"
    });
    const remote = storeJson(fake);
    remote.workspaces.push({ slug: MARKER_SLUG, name: "Marker", people: [] });
    remote.files.push({ id: "file_marker", workspace: SLUG, name: MARKER_NAME, type: "application/octet-stream", bytes: 1 });
    fake.files["aia/store.json"] = Buffer.from(JSON.stringify(remote));
    fake.resetCounts();
    const res = await post("warm.png", "198.51.100.20");
    const names = (lib.mem.files || []).map((f) => f && f.name);
    const slugs = (lib.mem.workspaces || []).map((w) => w && w.slug);
    t("warm POST -> 201", res.statusCode === 201, res.statusCode);
    t("warm upload does not pull a marker written after warm-up", names.indexOf(MARKER_NAME) < 0 && slugs.indexOf(MARKER_SLUG) < 0, { names: names, slugs: slugs });
    t("warm upload does not clobber in-memory records", names.indexOf(LOCAL_NAME) >= 0 && names.indexOf(OLD_NAME) >= 0 && names.indexOf("warm.png") >= 0, names);
    t("warm upload blob snapshot GETs before save = 0", reloadGets(fake) === 0 && reloadHeads(fake) === 0, { gets: reloadGets(fake), heads: reloadHeads(fake), ops: fake.ops.length });
  }

  if (scenario === "warm-two") {
    await globalThis.__aiaHydrate;
    fake.resetCounts();
    const at1 = fake.ops.length;
    const first = await post("warm-a.png", "198.51.100.41");
    const reads1 = snapshotReadsSince(fake, at1);
    const at2 = fake.ops.length;
    const second = await post("warm-b.png", "198.51.100.42");
    const reads2 = snapshotReadsSince(fake, at2);
    const memNames = (lib.mem.files || []).map((f) => f && f.name);
    const blobNames = (storeJson(fake).files || []).map((f) => f && f.name);
    t("first warm POST -> 201", first.statusCode === 201, first.statusCode);
    t("second warm POST -> 201", second.statusCode === 201, second.statusCode);
    t("first warm POST snapshot reads = 0", reads1 === 0, { reads: reads1 });
    t("second warm POST snapshot reads = 0", reads2 === 0, { reads: reads2 });
    t("both warm POSTs keep both records in memory and in the blob",
      memNames.indexOf("warm-a.png") >= 0 && memNames.indexOf("warm-b.png") >= 0 &&
      memNames.indexOf(OLD_NAME) >= 0 &&
      blobNames.indexOf("warm-a.png") >= 0 && blobNames.indexOf("warm-b.png") >= 0 &&
      blobNames.indexOf(OLD_NAME) >= 0,
      { mem: memNames, blob: blobNames });
  }

  if (scenario === "concurrent") {
    const coldEmpty = !(lib.mem.workspaces || []).some((w) => w && w.slug === SLUG);
    t("concurrent: still cold when the burst starts", coldEmpty, "");
    const N = 8;
    const jobs = [];
    for (let i = 0; i < N; i++) jobs.push(post("c" + i + ".png", "198.51.100." + (i + 1)));
    const rs = await Promise.all(jobs);
    const codes = rs.map((r) => r.statusCode);
    const names = (lib.mem.files || []).filter((f) => f && /^c\d+\.png$/.test(f.name)).map((f) => f.name);
    t("concurrent cold uploads all 201", codes.every((c) => c === 201), codes.join(","));
    t("concurrent cold uploads share one load (one snapshot GET, max in flight 1)", fake.loadMax === 1 && reloadGets(fake) === 1, { loadMax: fake.loadMax, gets: reloadGets(fake), heads: reloadHeads(fake) });
    t("concurrent uploads all land on the existing store", names.length === N && (lib.mem.files || []).some((f) => f && f.id === OLD_ID), { names: names.length });
  }

  if (scenario === "fail") {
    const before = fake.storeText();
    const first = await Promise.race([
      post("retry-me.png", "198.51.100.30").then((r) => ({ status: r.statusCode, error: r.body && r.body.error })).catch((e) => ({ threw: String(e && e.message || e) })),
      sleep(5000).then(() => ({ hung: true }))
    ]);
    t("failed cold load settles (does not wedge)", !first.hung, first);
    t("failed cold load does not publish the upload", !first.status || first.status !== 201, first);
    t("failed cold load does not mark the store loaded", globalThis.__aiaStoreLoaded !== true, globalThis.__aiaStoreLoaded);
    t("failed cold load does not overwrite the blob", fake.storeText() === before && userPuts(fake).length === 0, { puts: userPuts(fake).length });
    t("failed cold load leaves ready()'s hydrate promise in place", globalThis.__aiaHydrate === hydratePromise, "");
    const second = await Promise.race([
      post("retry-ok.png", "198.51.100.31").then((r) => r).catch((e) => ({ statusCode: 0, body: { error: String(e && e.message || e) } })),
      sleep(8000).then(() => ({ statusCode: 0, body: { error: "hung" } }))
    ]);
    const saved = storeJson(fake);
    const blobFiles = saved.files || [];
    t("retry after a failed cold load -> 201", second.statusCode === 201, [second.statusCode, second.body && second.body.error]);
    t("retry adds the file onto the existing store", globalThis.__aiaStoreLoaded === true && blobFiles.some((f) => f && f.id === OLD_ID) && blobFiles.some((f) => f && f.name === "retry-ok.png"), blobFiles.map((f) => f && f.name));
    t("retry still does not replace ready()'s hydrate promise", globalThis.__aiaHydrate === hydratePromise, "");
  }

  const overlap = [];
  if (scenario === "overlap") {
    await globalThis.__aiaHydrate;
    fake.delayReadMs = READ_LATENCY_MS;
    fake.snap = true;
    fake.resetCounts();
    for (let g = 0; g < OVERLAP_GAPS.length; g++) {
      const gap = OVERLAP_GAPS[g];
      const prefix = "o" + gap + "-";
      const headsBefore = storeHeads(fake);
      const pending = [];
      for (let i = 0; i < STAGGER_N; i++) {
        if (i) await sleep(gap);
        const name = prefix + i + ".png";
        pending.push(post(name, "198.51." + (gap % 200) + "." + (i + 1)).then((r) => r.statusCode).catch(() => 0));
      }
      const codes = await Promise.all(pending);
      const ok201 = codes.filter((c) => c === 201).length;
      const memNames = new Set((lib.mem.files || []).filter((f) => f && String(f.name || "").indexOf(prefix) === 0).map((f) => f.name));
      const blobNames = new Set((storeJson(fake).files || []).filter((f) => f && String(f.name || "").indexOf(prefix) === 0).map((f) => f.name));
      let lostMem = 0;
      let lostDurable = 0;
      for (let i = 0; i < STAGGER_N; i++) {
        const name = prefix + i + ".png";
        if (!memNames.has(name)) lostMem += 1;
        if (!blobNames.has(name)) lostDurable += 1;
      }
      const heads = storeHeads(fake) - headsBefore;
      overlap.push({ gap: gap, ok201: ok201, lostMem: lostMem, lostDurable: lostDurable, heads: heads, n: STAGGER_N });
      t("overlap gap " + gap + "ms warm fire-and-forget lost 0", ok201 === STAGGER_N && lostMem === 0 && lostDurable === 0, overlap[overlap.length - 1]);
      t("overlap gap " + gap + "ms snapshot reads after warm-up = 0", heads === 0, { heads: heads });
    }
  }

  const stagger = [];
  if (scenario === "stagger") {
    fake.delayReadMs = 0;
    await globalThis.__aiaHydrate;
    for (let g = 0; g < GAPS.length; g++) {
      const gap = GAPS[g];
      const prefix = "g" + gap + "-";
      let ok201 = 0;
      for (let i = 0; i < STAGGER_N; i++) {
        if (i) await sleep(gap);
        const name = prefix + i + ".png";
        const res = await post(name, "198.51." + (gap % 250) + "." + (i + 1));
        if (res.statusCode === 201) ok201 += 1;
      }
      const memNames = new Set((lib.mem.files || []).filter((f) => f && String(f.name || "").indexOf(prefix) === 0).map((f) => f.name));
      const blobNames = new Set((storeJson(fake).files || []).filter((f) => f && String(f.name || "").indexOf(prefix) === 0).map((f) => f.name));
      let lostMem = 0;
      let lostDurable = 0;
      for (let i = 0; i < STAGGER_N; i++) {
        const name = prefix + i + ".png";
        if (!memNames.has(name)) lostMem += 1;
        if (!blobNames.has(name)) lostDurable += 1;
      }
      stagger.push({ gap: gap, ok201: ok201, lostMem: lostMem, lostDurable: lostDurable, n: STAGGER_N });
      t("stagger gap " + gap + "ms single instance lost 0", ok201 === STAGGER_N && lostMem === 0 && lostDurable === 0, stagger[stagger.length - 1]);
    }
  }

  process.stdout.write("RESULT " + JSON.stringify({ checks: checks, stagger: stagger, overlap: overlap }) + "\n");
  if (checks.some((c) => !c.ok)) process.exit(1);
}

function run(scenario, apiDir) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-coldb-"));
  const env = {
    PATH: process.env.PATH,
    HOME: tmp,
    AIA_STORE_PATH: path.join(tmp, "store.json"),
    AIA_UPLOAD_DIR: path.join(tmp, "up"),
    VERCEL_ENV: "production",
    BLOB_READ_WRITE_TOKEN: TOKEN,
    BLOB_STORE_ID: "store_FAKESTORE",
    AIA_CHECK_PARENT: String(process.pid)
  };
  const timeout = scenario === "stagger" || scenario === "overlap" ? 180000 : 30000;
  const r = spawnSync(process.execPath, [__filename, "--child", scenario, apiDir], {
    env: env,
    cwd: tmp,
    encoding: "utf8",
    timeout: timeout
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  const blob = String(r.stdout || "") + "\n" + String(r.stderr || "");
  if (blob.indexOf(PIN) >= 0 || blob.indexOf(TOKEN) >= 0) return { error: "child output contained a pin or token", checks: [] };
  const line = String(r.stdout || "").split("\n").find((l) => l.indexOf("RESULT ") === 0);
  if (!line) return { error: "no result (exit " + r.status + "): " + scrub(String(r.stderr || r.stdout || "").slice(-500)), checks: [], status: r.status };
  try {
    const parsed = JSON.parse(line.slice(7));
    parsed.status = r.status;
    return parsed;
  } catch (e) { return { error: "bad result json", checks: [], status: r.status }; }
}

function judge(out, label) {
  if (out.error) fail(label + " " + out.error);
  const bad = (out.checks || []).filter((c) => !c.ok);
  if (bad.length) fail(label + " " + bad.map((c) => c.name + (c.detail ? " (" + c.detail + ")" : "")).join("; "));
  pass(label);
}

function materialize(dir, files) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-coldb-api-"));
  const api = path.join(tmp, "api");
  fs.cpSync(path.join(root, "api"), api, { recursive: true });
  Object.keys(files || {}).forEach((name) => fs.writeFileSync(path.join(api, name), files[name]));
  try { fs.symlinkSync(path.join(root, "node_modules"), path.join(tmp, "node_modules")); } catch (e) {}
  dir.clean = tmp;
  return api;
}

function mainApi() {
  const files = {};
  ["upload.js", "_lib.js"].forEach((name) => {
    const r = spawnSync("git", ["show", MAIN + ":api/" + name], { cwd: root, encoding: "utf8" });
    if (r.status !== 0) fail("could not read " + MAIN + " api/" + name);
    files[name] = r.stdout;
  });
  return materialize({}, files);
}

function replaceLoadIfCold(src, replacement) {
  const start = src.indexOf("async function loadIfCold()");
  const end = src.indexOf("async function save()");
  if (start < 0 || end < 0 || end < start) return null;
  return src.slice(0, start) + replacement.trim() + "\n\n" + src.slice(end);
}

const MUTANTS = [
  {
    id: "always reload",
    scenario: "warm",
    body: [
      "async function loadIfCold() {",
      "  await globalThis.__aiaHydrate;",
      "  if (blobReady()) {",
      "    const remote = await blobRead();",
      "    if (remote) applyStore(remote);",
      "  }",
      "}"
    ].join("\n")
  },
  {
    id: "no in-flight sharing",
    scenario: "concurrent",
    body: [
      "async function loadIfCold() {",
      "  if (globalThis.__aiaStoreLoaded) return;",
      "  await hydrate();",
      "  globalThis.__aiaStoreLoaded = true;",
      "}"
    ].join("\n")
  },
  {
    id: "failed load marks loaded",
    scenario: "fail",
    body: [
      "async function loadIfCold() {",
      "  if (globalThis.__aiaStoreLoaded) return;",
      "  if (globalThis.__aiaColdInflight) return globalThis.__aiaColdInflight;",
      "  const joinModule = !globalThis.__aiaColdTried;",
      "  globalThis.__aiaColdTried = true;",
      "  let job;",
      "  job = (async () => {",
      "    try {",
      "      if (joinModule) await globalThis.__aiaHydrate;",
      "      else await hydrate();",
      "      globalThis.__aiaStoreLoaded = true;",
      "    } catch (err) {",
      "      globalThis.__aiaStoreLoaded = true;",
      "      throw err;",
      "    } finally {",
      "      if (globalThis.__aiaColdInflight === job) globalThis.__aiaColdInflight = null;",
      "    }",
      "  })();",
      "  globalThis.__aiaColdInflight = job;",
      "  return job;",
      "}"
    ].join("\n")
  },
  {
    id: "always reload on warm upload",
    scenarios: ["warm-two", "overlap"],
    body: [
      "async function loadIfCold() {",
      "  await globalThis.__aiaHydrate;",
      "  if (globalThis.__aiaStoreLoaded && blobReady()) {",
      "    const remote = await blobRead();",
      "    if (remote) applyStore(remote);",
      "  }",
      "}"
    ].join("\n")
  },
  {
    id: "reload only on the second warm POST",
    scenarios: ["warm-two", "overlap"],
    body: [
      "async function loadIfCold() {",
      "  await globalThis.__aiaHydrate;",
      "  if (!globalThis.__aiaStoreLoaded) return;",
      "  globalThis.__aiaWarmPosts = (globalThis.__aiaWarmPosts || 0) + 1;",
      "  if (globalThis.__aiaWarmPosts < 2) return;",
      "  if (blobReady()) {",
      "    const remote = await blobRead();",
      "    if (remote) applyStore(remote);",
      "  }",
      "}"
    ].join("\n")
  }
];

function runMutants() {
  const src = fs.readFileSync(path.join(root, "api/_lib.js"), "utf8");
  MUTANTS.forEach((m) => {
    const next = replaceLoadIfCold(src, m.body);
    if (!next || next === src) fail("mutant " + m.id + ": could not patch loadIfCold");
    const held = {};
    const api = materialize(held, { "_lib.js": next });
    const scenarios = m.scenarios || [m.scenario];
    scenarios.forEach((scenario) => {
      const out = run(scenario, api);
      const bad = (out.checks || []).filter((c) => !c.ok);
      const exited = out.status !== 0;
      if (!bad.length || !exited) fail("mutant '" + m.id + "' scenario " + scenario + " was NOT caught" + (out.error ? " (" + out.error + ")" : ""));
      pass("mutant '" + m.id + "' fails " + scenario + " exit " + out.status + " (" + bad[0].name + ")");
    });
    fs.rmSync(held.clean, { recursive: true, force: true });
  });
}

function staggerLine(row, mainRow) {
  const mainLost = mainRow ? mainRow.lostDurable : "?";
  return "gap " + row.gap + "ms lost " + row.lostDurable + " mem " + row.lostMem + " (main lost " + mainLost + ", n=" + row.n + ", 201=" + row.ok201 + ")";
}

if (process.argv[2] === "--child") {
  child(process.argv[3], process.argv[4]).catch((e) => {
    console.error(e && e.stack || e);
    process.exit(1);
  });
} else {
  assertSources();
  const api = path.join(root, "api");
  judge(run("cold", api), "cold upload lands on the existing desk");
  judge(run("warm", api), "warm upload does not reload");
  judge(run("warm-two", api), "two warm uploads in a row do not re-read");
  const over = run("overlap", api);
  judge(over, "overlapping warm uploads lose 0");
  (over.overlap || []).forEach((row) => {
    pass("overlap gap " + row.gap + "ms lost " + row.lostDurable + " mem " + row.lostMem + " snapshot heads " + row.heads + " (n=" + row.n + ", 201=" + row.ok201 + ")");
  });
  judge(run("concurrent", api), "concurrent cold uploads share one load");
  judge(run("fail", api), "failed cold load does not wedge and retry works");
  const ours = run("stagger", api);
  judge(ours, "staggered uploads on one instance lose 0");
  const held = {};
  const mainDir = mainApi();
  held.clean = path.dirname(mainDir);
  const main = run("stagger", mainDir);
  fs.rmSync(held.clean, { recursive: true, force: true });
  if (main.error) fail("main stagger " + main.error);
  const mainRows = main.stagger || [];
  (ours.stagger || []).forEach((row) => {
    const other = mainRows.find((r) => r.gap === row.gap);
    if (!other) fail("main stagger missing gap " + row.gap);
    if (row.lostDurable !== 0 || row.lostMem !== 0) fail("single instance lost records at " + row.gap + "ms");
    if (row.lostDurable > other.lostDurable || row.lostMem > other.lostMem) {
      fail("regression vs " + MAIN + " at " + row.gap + "ms (" + staggerLine(row, other) + ")");
    }
    pass("stagger " + staggerLine(row, other));
  });
  runMutants();
  pass("check-upload-cold-b passed");
}
