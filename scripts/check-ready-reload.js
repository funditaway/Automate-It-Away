#!/usr/bin/env node
"use strict";

// ready() must not re-read the sealed blob on every request. A warm instance
// reloads only when mem is cold or older than READY_MAX_AGE_MS, concurrent
// reloads share one read, and a read must not replace mem while this instance
// has unsaved or in-flight writes. Cross-instance last-put-wins is out of scope.
//
// The cold GET/POST at the bottom inlines the same await ready() calls as
// PR 329 in a throwaway copy of upload.js. This branch does not keep those calls.

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const BLOB_KEY = "aia/store.json";
const READ_MS = 35;
const WRITE_MS = 80;
const STAGGER_MS = 18;
const BURST = 40;
const DESK = "ready-desk";

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

function hashPin(pin) {
  return crypto.createHash("sha256").update(String(pin) + ":" + (process.env.AIA_PIN_SALT || "aia-pilot")).digest("hex");
}

function pngBytes() {
  return Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x00]);
}

function seedStore(pin) {
  const hash = hashPin(pin);
  return {
    account: null,
    accounts: [],
    sessions: [],
    approvals: [],
    locks: [],
    connections: [],
    jobs: [],
    audit: [],
    money: [],
    workspaces: [{
      slug: DESK,
      name: "Ready",
      biz: "Ready Desk",
      pin: hash,
      people: [{ id: "p_owner", name: "Owner", role: "owner", pin: hash }]
    }],
    inbox: [],
    files: [{ id: "file_seed", workspace: DESK, name: "seed.png" }],
    tickets: [],
    packs: [],
    mail: [],
    migrations: {}
  };
}

function patchUpload(src) {
  const before = 'const { cors, mem, log, save, workspaceOf, readBody, blobAllowed, personOf } = require("./_lib");';
  const after = 'const { cors, mem, log, save, ready, workspaceOf, readBody, blobAllowed, personOf } = require("./_lib");';
  if (src.indexOf(before) < 0) throw new Error("upload import anchor missing");
  src = src.replace(before, after);
  const getAnchor = '  if (req.method === "GET") {\n';
  if (src.indexOf(getAnchor) < 0) throw new Error("upload GET anchor missing");
  src = src.replace(getAnchor, '  if (req.method === "GET") {\n    await ready();\n');
  const postAnchor = '  if (overRate(req)) return res.status(429).json({ error: "Too many uploads. Wait a minute and try again." });\n';
  if (src.indexOf(postAnchor) < 0) throw new Error("upload POST anchor missing");
  src = src.replace(postAnchor, postAnchor + "  await ready();\n");
  return src;
}

const MUTATIONS = {
  "warm-skip": function (src) {
    const from = "  // ready-guard:warm-skip\n  if ((Date.now() - loadedAt) < READY_MAX_AGE_MS) return false;\n";
    if (src.indexOf(from) < 0) throw new Error("warm-skip anchor missing");
    return src.replace(from, "  // ready-guard:warm-skip removed\n");
  },
  "cold-shared": function (src) {
    const from = "  // ready-guard:cold-shared\n  await globalThis.__aiaHydrate;\n";
    if (src.indexOf(from) < 0) throw new Error("cold-shared anchor missing");
    return src.replace(from, "  // ready-guard:cold-shared removed\n");
  },
  "stale-reload": function (src) {
    const from = "  // ready-guard:stale-reload\n  return true;\n";
    if (src.indexOf(from) < 0) throw new Error("stale-reload anchor missing");
    return src.replace(from, "  // ready-guard:stale-reload removed\n  return false;\n");
  },
  "single-flight": function (src) {
    const from = "    // ready-guard:single-flight\n    if (!reloadFlight) reloadFlight = reloadStore().finally(() => { reloadFlight = null; });\n    await reloadFlight;\n";
    if (src.indexOf(from) < 0) throw new Error("single-flight anchor missing");
    return src.replace(from, "    // ready-guard:single-flight removed\n    await reloadStore();\n");
  },
  "write-hold": function (src) {
    const from = "  // ready-guard:write-hold\n  if (saveDepth > 0 || epoch !== seen || memDirty()) return;\n";
    if (src.indexOf(from) < 0) throw new Error("write-hold anchor missing");
    return src.replace(from, "  // ready-guard:write-hold removed\n");
  },
  "reload-replace": function (src) {
    return MUTATIONS["warm-skip"](MUTATIONS["write-hold"](src));
  }
};

function stage(opts) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aia-ready-"));
  const api = path.join(root, "api");
  fs.mkdirSync(api);
  const real = path.join(ROOT, "api");
  fs.readdirSync(real).forEach(function (name) {
    const from = path.join(real, name);
    const to = path.join(api, name);
    if (name === "_lib.js") {
      let src = fs.readFileSync(from, "utf8");
      if (opts.mutate) src = opts.mutate(src);
      fs.writeFileSync(to, src);
    } else if (name === "upload.js" && opts.patchUpload) {
      fs.writeFileSync(to, opts.patchUpload(fs.readFileSync(from, "utf8")));
    } else {
      fs.symlinkSync(from, to);
    }
  });
  try { fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(root, "node_modules")); } catch (e) {}
  return root;
}

function runChild(scenario, apiDir, extraEnv) {
  const env = Object.assign({}, process.env, extraEnv || {});
  delete env.VERCEL_ENV;
  const r = spawnSync(process.execPath, [__filename, "--child", scenario, apiDir], {
    env: env,
    encoding: "utf8",
    timeout: 30000
  });
  return {
    status: r.status == null ? 1 : r.status,
    out: String(r.stdout || "") + String(r.stderr || ""),
    error: r.error ? String(r.error.message || r.error) : ""
  };
}

function resultOf(run) {
  const m = String(run.out || "").match(/RESULT (\w+)([^\n]*)/);
  if (!m) return null;
  const lost = /lost=(\d+)/.exec(m[2] || "");
  const heads = /heads=(\d+)/.exec(m[2] || "");
  return { kind: m[1], lost: lost ? Number(lost[1]) : null, heads: heads ? Number(heads[1]) : null, line: m[0] };
}

function main() {
  const pkg = fs.readFileSync(path.join(ROOT, "package.json"), "utf8");
  if (pkg.indexOf("scripts/check-ready-reload.js") < 0) fail("package.json must run check-ready-reload");
  else pass("package.json runs check-ready-reload");

  const libSrc = fs.readFileSync(path.join(ROOT, "api/_lib.js"), "utf8");
  if (!/const READY_MAX_AGE_MS = 2000;/.test(libSrc)) fail("READY_MAX_AGE_MS must be 2000");
  else pass("stale window is 2000ms");
  ["warm-skip", "cold-shared", "stale-reload", "single-flight", "write-hold"].forEach(function (name) {
    if (libSrc.indexOf("ready-guard:" + name) < 0) fail("missing ready-guard:" + name);
  });
  if (!process.exitCode) pass("ready guards are marked in the shared lib");

  const uploadSrc = fs.readFileSync(path.join(ROOT, "api/upload.js"), "utf8");
  if (uploadSrc.indexOf("await ready()") >= 0) fail("this branch must not keep upload.js await ready()");
  else pass("upload.js on this branch does not await ready()");
  if (uploadSrc.indexOf("8_000_000") < 0) fail("8 MB cap must stay");
  else pass("8 MB cap is unchanged");
  if (uploadSrc.indexOf("RATE_MAX = 30") < 0) fail("rate limit must stay");
  else pass("rate limit is unchanged");

  const scenarios = ["warm", "cold", "stale", "write", "failure", "stagger", "cold-upload"];
  scenarios.forEach(function (name) {
    const root = stage({ patchUpload: name === "stagger" || name === "cold-upload" ? patchUpload : null });
    const run = runChild(name, path.join(root, "api"));
    fs.rmSync(root, { recursive: true, force: true });
    const result = resultOf(run);
    if (run.status === 0 && result && result.kind === "pass") {
      pass(name + (result.lost != null ? " lost=" + result.lost : "") + (result.heads != null ? " heads=" + result.heads : ""));
    } else {
      fail(name + " failed\n" + run.out.slice(-1200) + (run.error ? "\n" + run.error : ""));
    }
  });

  const guards = [
    ["warm-skip", "warm"],
    ["warm-skip", "stagger"],
    ["cold-shared", "cold"],
    ["stale-reload", "stale"],
    ["single-flight", "stale"],
    ["write-hold", "write"],
    ["reload-replace", "prove-loss"]
  ];
  guards.forEach(function (pair) {
    const mutation = pair[0];
    const scenario = pair[1];
    let root;
    try {
      root = stage({
        mutate: MUTATIONS[mutation],
        patchUpload: scenario === "stagger" || scenario === "prove-loss" ? patchUpload : null
      });
    } catch (e) {
      fail(mutation + " stage: " + (e && e.message || e));
      return;
    }
    const run = runChild(scenario, path.join(root, "api"));
    fs.rmSync(root, { recursive: true, force: true });
    const result = resultOf(run);
    if (scenario === "prove-loss") {
      if (run.status === 0 && result && result.kind === "pass" && result.lost > 0) {
        pass("reload-replace removed: 40 staggered uploads lost " + result.lost + " (probe model)");
      } else {
        fail("reload-replace removed but the loss model did not lose records\n" + run.out.slice(-800));
      }
      return;
    }
    if (run.status !== 0 || (result && result.kind === "fail")) {
      pass(mutation + " removed: " + scenario + " failed");
    } else {
      fail(mutation + " removed but " + scenario + " still passed\n" + run.out.slice(-800));
    }
  });

  if (process.exitCode) {
    console.error("check-ready-reload failed");
    process.exit(1);
  }
  console.log("check-ready-reload passed");
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

function call(handler, method, headers, body) {
  const res = mockRes();
  return handler({ method: method, headers: headers || {}, body: body || {}, query: {} }, res).then(function () { return res; });
}

function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function installClock() {
  const realNow = Date.now;
  const clock = { skew: 0 };
  Date.now = function () { return realNow() + clock.skew; };
  return clock;
}

function bootLib(apiDir) {
  delete global.__aia;
  delete global.__aiaHydrate;
  delete globalThis.__aia;
  delete globalThis.__aiaHydrate;
  return require(path.join(apiDir, "_lib.js"));
}

function installLatencyBlob(files) {
  const Module = require("module");
  const snaps = new Map();
  let seq = 0;
  const counts = { heads: 0, puts: 0 };
  let putHook = null;
  let failReads = false;
  const BASE = "https://testhost.private.blob.vercel-storage.com/" + BLOB_KEY;
  function snapFrom(key) {
    const m = String(key || "").match(/[?&]s=(\d+)/);
    if (m && snaps.has(Number(m[1]))) return snaps.get(Number(m[1]));
    return files[BLOB_KEY] || "";
  }
  const orig = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "@vercel/blob") {
      return {
        async head() {
          counts.heads++;
          if (failReads) throw new Error("Vercel Blob: boom");
          const id = ++seq;
          const snap = files[BLOB_KEY] || "";
          await delay(READ_MS);
          if (!snap) throw new Error("Vercel Blob: The requested blob does not exist");
          snaps.set(id, snap);
          const url = BASE + "?s=" + id;
          return { url: url, downloadUrl: url, pathname: BLOB_KEY };
        },
        async get(key) {
          if (failReads) throw new Error("Vercel Blob: boom");
          const raw = snapFrom(key);
          if (!raw) return null;
          return { statusCode: 200, stream: { text: async function () { return raw; } }, blob: { url: String(key || BASE) } };
        },
        async put(key, body) {
          const name = String(key || "");
          if (name !== BLOB_KEY && name !== "aia-store.json") {
            return { url: "https://testhost.public.blob.vercel-storage.com/" + name };
          }
          counts.puts++;
          const text = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
          if (putHook) {
            const hook = putHook;
            putHook = null;
            await hook();
          }
          await delay(WRITE_MS);
          files[name] = text;
          return { url: BASE, downloadUrl: BASE };
        },
        async del() {},
        async list() { return { blobs: [] }; }
      };
    }
    return orig.apply(this, arguments);
  };
  global.fetch = async function (url) {
    const u = String(url || "");
    if (failReads) throw new Error("Vercel Blob: boom");
    if (u.indexOf("blob.vercel-storage.com") < 0 && u.indexOf("vercel.com/api/blob") < 0) {
      throw new Error("unexpected fetch " + u);
    }
    const raw = snapFrom(u);
    if (!raw) return { ok: false, status: 404, statusText: "Not Found", text: async function () { return ""; } };
    return { ok: true, status: 200, text: async function () { return raw; } };
  };
  return {
    counts: counts,
    setPutHook: function (fn) { putHook = fn; },
    failReads: function () { failReads = true; }
  };
}

function installHoldBlob(files) {
  const Module = require("module");
  let released = false;
  let releaseHold;
  const hold = new Promise(function (resolve) { releaseHold = resolve; });
  const counts = { heads: 0 };
  const BASE = "https://testhost.private.blob.vercel-storage.com/" + BLOB_KEY;
  const orig = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "@vercel/blob") {
      return {
        async head() {
          counts.heads++;
          const snap = files[BLOB_KEY] || "";
          if (!released) await hold;
          if (!snap) throw new Error("Vercel Blob: The requested blob does not exist");
          return { url: BASE, downloadUrl: BASE, pathname: BLOB_KEY };
        },
        async get() {
          const raw = files[BLOB_KEY] || "";
          if (!raw) return null;
          return { statusCode: 200, stream: { text: async function () { return raw; } }, blob: { url: BASE } };
        },
        async put() { throw new Error("cold burst put is not this check"); },
        async list() { return { blobs: [] }; },
        async del() {}
      };
    }
    return orig.apply(this, arguments);
  };
  global.fetch = async function () {
    const raw = files[BLOB_KEY] || "";
    if (!raw) return { ok: false, status: 404, statusText: "Not Found", text: async function () { return ""; } };
    return { ok: true, status: 200, text: async function () { return raw; } };
  };
  return {
    counts: counts,
    release: function () {
      if (released) return;
      released = true;
      releaseHold();
    }
  };
}

function installColdHold() {
  const Module = require("module");
  let released = false;
  let releaseHold;
  const hold = new Promise(function (resolve) { releaseHold = resolve; });
  const counts = { heads: 0 };
  const orig = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "@vercel/blob") {
      return {
        async head() {
          counts.heads++;
          if (!released) await hold;
          throw new Error("Vercel Blob: The requested blob does not exist");
        },
        async get() { throw new Error("Vercel Blob: The requested blob does not exist"); },
        async put() { throw new Error("cold blob put is not this check"); },
        async list() { return { blobs: [] }; },
        async del() {}
      };
    }
    return orig.apply(this, arguments);
  };
  global.fetch = async function () {
    return { ok: false, status: 404, statusText: "Not Found", text: async function () { return ""; }, json: async function () { return {}; }, headers: { get: function () { return ""; } } };
  };
  return {
    counts: counts,
    release: function () {
      if (released) return;
      released = true;
      releaseHold();
    }
  };
}

function envProdBlob(storeFile, uploadDir) {
  process.env.AIA_STORE_PATH = storeFile;
  process.env.AIA_UPLOAD_DIR = uploadDir;
  process.env.VERCEL_ENV = "production";
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_testhost_secret";
  process.env.BLOB_STORE_ID = "store_ready";
  delete process.env.VERCEL_OIDC_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN;
  delete process.env.AIA_BLOB_TOKEN;
}

function writeSeed(storeFile, pin) {
  const store = seedStore(pin);
  fs.mkdirSync(path.dirname(storeFile), { recursive: true });
  fs.writeFileSync(storeFile, JSON.stringify(store));
  return store;
}

function blobFilesOf(files) {
  try { return JSON.parse(files[BLOB_KEY] || "{}").files || []; } catch (e) { return []; }
}

function finish(ok, extra) {
  const lost = extra && extra.lost != null ? extra.lost : "";
  const heads = extra && extra.heads != null ? extra.heads : "";
  console.log("RESULT " + (ok && !process.exitCode ? "pass" : "fail") + (lost === "" ? "" : " lost=" + lost) + (heads === "" ? "" : " heads=" + heads));
  if (process.exitCode) process.exit(1);
}

async function child(scenario, apiDir) {
  const pin = "4821";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-ready-run-"));
  const storeFile = path.join(tmp, "store.json");
  const uploadDir = path.join(tmp, "up");
  fs.mkdirSync(uploadDir, { recursive: true });
  const clock = installClock();

  if (scenario === "cold") {
    envProdBlob(storeFile, uploadDir);
    const store = writeSeed(storeFile, pin);
    const files = {};
    files[BLOB_KEY] = JSON.stringify(store);
    const sim = installHoldBlob(files);
    const lib = bootLib(apiDir);
    const jobs = [];
    for (let i = 0; i < 8; i++) jobs.push(lib.ready());
    await delay(30);
    if (sim.counts.heads !== 1) fail("cold burst started " + sim.counts.heads + " blob reads");
    else pass("cold burst is sharing one load");
    sim.release();
    await Promise.all(jobs);
    if (sim.counts.heads !== 1) fail("cold burst loaded " + sim.counts.heads + " times");
    const ids = (lib.mem.files || []).map(function (f) { return f && f.id; });
    if (ids.indexOf("file_seed") < 0) fail("cold burst did not load the seed");
    else pass("cold burst loaded the seed once");
    finish(!process.exitCode, { heads: sim.counts.heads });
    return;
  }

  if (scenario === "cold-upload") {
    process.env.AIA_STORE_PATH = storeFile;
    process.env.AIA_UPLOAD_DIR = uploadDir;
    process.env.VERCEL_ENV = "production";
    process.env.BLOB_STORE_ID = "store_cold";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN;
    delete process.env.AIA_BLOB_TOKEN;
    delete process.env.VERCEL_OIDC_TOKEN;
    writeSeed(storeFile, pin);
    const hold = installColdHold();
    const upload = require(path.join(apiDir, "upload.js"));
    const lib = require(path.join(apiDir, "_lib.js"));
    if ((lib.mem.workspaces || []).some(function (w) { return w && w.slug === DESK; })) {
      fail("cold require loaded the desk before ready()");
    } else pass("throwaway upload required with the desk still unloaded");
    let getDone = false;
    let postDone = false;
    const listedP = call(upload, "GET", {
      "x-workspace": DESK,
      "x-pin": pin,
      "x-forwarded-for": "203.0.113.10"
    }).then(function (res) { getDone = true; return res; });
    const droppedP = call(upload, "POST", {
      "x-workspace": DESK,
      "x-forwarded-for": "203.0.113.11"
    }, {
      name: "porch.png",
      type: "image/png",
      data: pngBytes().toString("base64")
    }).then(function (res) { postDone = true; return res; });
    await new Promise(function (resolve) { setImmediate(resolve); });
    await delay(30);
    if (getDone || postDone) {
      hold.release();
      fail("handler returned before the store loaded");
      finish(false);
      return;
    }
    pass("cold GET and POST wait for ready()");
    hold.release();
    const listed = await listedP;
    const dropped = await droppedP;
    if (listed.statusCode !== 200 || !listed.body || listed.body.workspace !== DESK) {
      fail("cold GET list should be 200, got " + listed.statusCode + " " + JSON.stringify(listed.body));
    } else pass("cold GET list is 200");
    if (dropped.statusCode !== 201 || !dropped.body || !dropped.body.ok || !dropped.body.file) {
      fail("cold public POST should be 201, got " + dropped.statusCode + " " + JSON.stringify(dropped.body));
    } else pass("cold public POST is 201");
    finish(!process.exitCode);
    return;
  }

  envProdBlob(storeFile, uploadDir);
  const store = writeSeed(storeFile, pin);
  const files = {};
  files[BLOB_KEY] = JSON.stringify(store);
  const sim = installLatencyBlob(files);
  const lib = bootLib(apiDir);

  await lib.ready();
  const startHeads = sim.counts.heads;

  if (scenario === "warm") {
    for (let i = 0; i < 12; i++) await lib.ready();
    if (sim.counts.heads !== startHeads) fail("warm ready() re-read the blob (" + sim.counts.heads + " heads, start " + startHeads + ")");
    else pass("warm store is not re-read");
    const ids = (lib.mem.files || []).map(function (f) { return f && f.id; });
    if (ids.indexOf("file_seed") < 0) fail("warm mem lost the seed file");
    finish(!process.exitCode, { heads: sim.counts.heads - startHeads });
    return;
  }

  if (scenario === "stale") {
    clock.skew += lib.READY_MAX_AGE_MS + 50;
    const jobs = [];
    for (let i = 0; i < 8; i++) jobs.push(lib.ready());
    await Promise.all(jobs);
    const extra = sim.counts.heads - startHeads;
    if (extra !== 1) fail("stale window should trigger one shared reload, extra heads " + extra);
    else pass("stale window triggered one reload");
    await lib.ready();
    if (sim.counts.heads !== startHeads + 1) fail("fresh reload must not read again, heads " + sim.counts.heads);
    finish(!process.exitCode, { heads: extra });
    return;
  }

  if (scenario === "write") {
    lib.mem.files.push({ id: "file_unsaved", workspace: DESK, name: "unsaved.png" });
    clock.skew += lib.READY_MAX_AGE_MS + 50;
    await lib.ready();
    if (!(lib.mem.files || []).some(function (f) { return f && f.id === "file_unsaved"; })) {
      fail("stale ready() replaced mem while a write was unsaved");
    } else pass("unsaved mem was not replaced");
    lib.mem.files.push({ id: "file_inflight", workspace: DESK, name: "inflight.png" });
    let saw = false;
    sim.setPutHook(async function () {
      saw = true;
      await lib.ready();
    });
    await lib.save();
    if (!saw) fail("store put did not run the in-flight hook");
    if (!(lib.mem.files || []).some(function (f) { return f && f.id === "file_inflight"; })) {
      fail("ready() replaced mem while a store put was in flight");
    } else pass("in-flight put did not replace mem");
    if (!(lib.mem.files || []).some(function (f) { return f && f.id === "file_unsaved"; })) {
      fail("in-flight reload dropped the unsaved file");
    }
    finish(!process.exitCode);
    return;
  }

  if (scenario === "failure") {
    lib.mem.files.push({ id: "file_keep", workspace: DESK, name: "keep.png" });
    clock.skew += lib.READY_MAX_AGE_MS + 50;
    sim.failReads();
    await lib.ready();
    const ids = (lib.mem.files || []).map(function (f) { return f && f.id; });
    if (ids.indexOf("file_seed") < 0 || ids.indexOf("file_keep") < 0) {
      fail("load failure replaced mem, ids " + ids.join(","));
    } else pass("load failure left mem in place");
    finish(!process.exitCode);
    return;
  }

  if (scenario === "stagger" || scenario === "prove-loss") {
    const upload = require(path.join(apiDir, "upload.js"));
    const tasks = [];
    for (let i = 0; i < BURST; i++) {
      tasks.push(new Promise(function (resolve) {
        setTimeout(function () {
          call(upload, "POST", {
            "x-workspace": DESK,
            "x-forwarded-for": "203.0.113." + i
          }, {
            name: "lot-" + i + ".png",
            type: "image/png",
            data: pngBytes().toString("base64")
          }).then(resolve, function (err) { resolve({ statusCode: 500, body: { error: String(err && err.message || err) } }); });
        }, i * STAGGER_MS);
      }));
    }
    const results = await Promise.all(tasks);
    const acked = [];
    let bad = 0;
    results.forEach(function (res) {
      if (res.statusCode === 201 && res.body && res.body.file && res.body.file.id) acked.push(res.body.file.id);
      else bad++;
    });
    const inBlob = {};
    blobFilesOf(files).forEach(function (f) { if (f && f.id) inBlob[f.id] = true; });
    const lost = acked.filter(function (id) { return !inBlob[id]; }).length;
    const extra = sim.counts.heads - startHeads;
    if (scenario === "prove-loss") {
      if (lost + bad > 0) pass("unguarded stagger lost " + lost + " acked and " + bad + " non-201");
      else fail("unguarded stagger kept every record");
      finish(lost + bad > 0, { lost: lost + bad, heads: extra });
      return;
    }
    if (bad) fail("stagger uploads not all acknowledged (" + bad + " non-201)");
    if (lost) fail("stagger lost " + lost + " of " + acked.length + " acknowledged files");
    else pass("40 staggered uploads kept every acknowledged file");
    if (extra !== 0) fail("warm stagger re-read the blob (" + extra + " extra heads)");
    else pass("warm stagger did not re-read");
    finish(!process.exitCode, { lost: lost, heads: extra });
    return;
  }

  fail("unknown scenario " + scenario);
  finish(false);
}

if (process.argv[2] === "--child") {
  child(process.argv[3], process.argv[4]).catch(function (err) {
    fail(err && err.stack || String(err));
    console.log("RESULT fail");
    process.exit(1);
  });
} else {
  main();
}
