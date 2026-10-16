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
  if (src.indexOf("await ready()") >= 0) return src;
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
  },
  "never-loaded": function (src) {
    const from = "  if (!loadedAt) return true;\n";
    if (src.indexOf(from) < 0) throw new Error("never-loaded anchor missing");
    return src.replace(from, "  if (!loadedAt) return false;\n");
  },
  "failed-read": function (src) {
    const from = "  if (!remote) return;\n";
    if (src.indexOf(from) < 0) throw new Error("failed-read anchor missing");
    return src.replace(from, "");
  },
  "depth-stuck": function (src) {
    const from = "    saveDepth--;\n";
    if (src.indexOf(from) < 0) throw new Error("depth-stuck anchor missing");
    return src.replace(from, "    \n");
  },
  "no-baseline-save": function (src) {
    const from = "      loadedAt = Date.now();\n      captureBaseline();\n    }\n    return ok;\n";
    if (src.indexOf(from) < 0) throw new Error("no-baseline-save anchor missing");
    return src.replace(from, "      loadedAt = Date.now();\n    }\n    return ok;\n");
  },
  "no-loadedAt-save": function (src) {
    const from = "      loadedAt = Date.now();\n      captureBaseline();\n";
    if (src.indexOf(from) < 0) throw new Error("no-loadedAt-save anchor missing");
    return src.replace(from, "      captureBaseline();\n");
  },
  "cold-marked": function (src) {
    const from = "  if (!failed) loadedAt = Date.now();\n";
    if (src.indexOf(from) < 0) throw new Error("cold-marked anchor missing");
    return src.replace(from, "  loadedAt = Date.now();\n");
  },
  "epoch-late": function (src) {
    const from = "  const seen = epoch;\n  const remote = await blobRead();\n";
    if (src.indexOf(from) < 0) throw new Error("epoch-late anchor missing");
    return src.replace(from, "  const remote = await blobRead();\n  const seen = epoch;\n");
  },
  "no-baseline-reload": function (src) {
    const from = "  loadedAt = Date.now();\n  captureBaseline();\n}\n";
    if (src.indexOf(from) < 0) throw new Error("no-baseline-reload anchor missing");
    return src.replace(from, "  loadedAt = Date.now();\n}\n");
  },
  "flight-stuck": function (src) {
    const from = "reloadStore().finally(() => { reloadFlight = null; })";
    if (src.indexOf(from) < 0) throw new Error("flight-stuck anchor missing");
    return src.replace(from, "reloadStore()");
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
    } else if (opts.copy && opts.copy.indexOf(name) >= 0) {
      fs.copyFileSync(from, to);
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
  pass("upload.js await ready() allowed (stacked on 329)");
  if (uploadSrc.indexOf("8_000_000") < 0) fail("8 MB cap must stay");
  else pass("8 MB cap is unchanged");
  if (uploadSrc.indexOf("RATE_MAX = 30") < 0) fail("rate limit must stay");
  else pass("rate limit is unchanged");

  const scenarios = ["warm", "cold", "stale", "write", "failure", "stagger", "cold-upload", "retry", "clean-fail", "after-save", "save-window", "late", "second", "quiet", "health"];
  scenarios.forEach(function (name) {
    const copy = [];
    if (name === "quiet") copy.push("_fields.js");
    if (name === "health") copy.push("health.js", "jobs.js");
    const root = stage({
      patchUpload: name === "stagger" || name === "cold-upload" ? patchUpload : null,
      copy: copy
    });
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
    ["reload-replace", "prove-loss"],
    ["never-loaded", "retry"],
    ["cold-marked", "retry"],
    ["failed-read", "clean-fail"],
    ["depth-stuck", "after-save"],
    ["no-baseline-save", "after-save"],
    ["no-loadedAt-save", "save-window"],
    ["epoch-late", "late"],
    ["no-baseline-reload", "second"],
    ["flight-stuck", "stale"]
  ];
  guards.forEach(function (pair) {
    const mutation = pair[0];
    const scenario = pair[1];
    let root;
    try {
      const copy = [];
      if (scenario === "quiet") copy.push("_fields.js");
      if (scenario === "health") copy.push("health.js", "jobs.js");
      root = stage({
        mutate: MUTATIONS[mutation],
        patchUpload: scenario === "stagger" || scenario === "prove-loss" ? patchUpload : null,
        copy: copy
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

function installFlakyBlob(files) {
  const Module = require("module");
  let attempt = 0;
  const counts = { heads: 0 };
  const BASE = "https://testhost.private.blob.vercel-storage.com/" + BLOB_KEY;
  const orig = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "@vercel/blob") {
      return {
        async head() {
          counts.heads++;
          attempt++;
          if (attempt === 1) throw new Error("Vercel Blob: boom");
          const snap = files[BLOB_KEY] || "";
          if (!snap) throw new Error("Vercel Blob: The requested blob does not exist");
          return { url: BASE, downloadUrl: BASE, pathname: BLOB_KEY };
        },
        async get() {
          if (attempt < 2) throw new Error("Vercel Blob: boom");
          const raw = files[BLOB_KEY] || "";
          if (!raw) return null;
          return { statusCode: 200, stream: { text: async function () { return raw; } }, blob: { url: BASE } };
        },
        async put() { throw new Error("retry put is not this check"); },
        async list() { return { blobs: [] }; },
        async del() {}
      };
    }
    return orig.apply(this, arguments);
  };
  global.fetch = async function () {
    if (attempt < 2) throw new Error("Vercel Blob: boom");
    const raw = files[BLOB_KEY] || "";
    if (!raw) return { ok: false, status: 404, statusText: "Not Found", text: async function () { return ""; } };
    return { ok: true, status: 200, text: async function () { return raw; } };
  };
  return { counts: counts };
}

function installGateBlob(files) {
  const Module = require("module");
  const snaps = new Map();
  let seq = 0;
  let hold = null;
  let releaseHold = null;
  let entered = null;
  const counts = { heads: 0 };
  const BASE = "https://testhost.private.blob.vercel-storage.com/" + BLOB_KEY;
  const orig = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "@vercel/blob") {
      return {
        async head() {
          counts.heads++;
          const id = ++seq;
          snaps.set(id, files[BLOB_KEY] || "");
          if (hold) {
            const notify = entered;
            entered = null;
            if (notify) notify();
            await hold;
            hold = null;
          }
          const snap = snaps.get(id);
          if (!snap) throw new Error("Vercel Blob: The requested blob does not exist");
          return { url: BASE + "?s=" + id, downloadUrl: BASE + "?s=" + id, pathname: BLOB_KEY };
        },
        async get(key) {
          const m = String(key || "").match(/[?&]s=(\d+)/);
          const raw = m && snaps.has(Number(m[1])) ? snaps.get(Number(m[1])) : (files[BLOB_KEY] || "");
          if (!raw) return null;
          return { statusCode: 200, stream: { text: async function () { return raw; } }, blob: { url: String(key || BASE) } };
        },
        async put(key, body) {
          const name = String(key || "");
          if (name !== BLOB_KEY && name !== "aia-store.json") {
            return { url: "https://testhost.public.blob.vercel-storage.com/" + name };
          }
          const text = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
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
    const m = u.match(/[?&]s=(\d+)/);
    const raw = m && snaps.has(Number(m[1])) ? snaps.get(Number(m[1])) : (files[BLOB_KEY] || "");
    if (!raw) return { ok: false, status: 404, statusText: "Not Found", text: async function () { return ""; } };
    return { ok: true, status: 200, text: async function () { return raw; } };
  };
  return {
    counts: counts,
    arm: function () {
      hold = new Promise(function (resolve) { releaseHold = resolve; });
      return new Promise(function (resolve) { entered = resolve; });
    },
    release: function () {
      if (releaseHold) releaseHold();
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

  if (scenario === "retry") {
    envProdBlob(storeFile, uploadDir);
    const disk = writeSeed(storeFile, pin);
    const remote = JSON.parse(JSON.stringify(disk));
    remote.files.push({ id: "file_remote", workspace: DESK, name: "remote.png" });
    const files = {};
    files[BLOB_KEY] = JSON.stringify(remote);
    const sim = installFlakyBlob(files);
    const lib = bootLib(apiDir);
    await lib.ready();
    const ids = (lib.mem.files || []).map(function (f) { return f && f.id; });
    if (ids.indexOf("file_remote") < 0) fail("cold failed load did not retry, ids " + ids.join(","));
    else pass("cold failed load retried");
    if (sim.counts.heads < 2) fail("cold failed load did not read again, heads " + sim.counts.heads);
    finish(!process.exitCode, { heads: sim.counts.heads });
    return;
  }

  if (scenario === "late") {
    envProdBlob(storeFile, uploadDir);
    const store = writeSeed(storeFile, pin);
    const files = {};
    files[BLOB_KEY] = JSON.stringify(store);
    const sim = installGateBlob(files);
    const lib = bootLib(apiDir);
    await lib.ready();
    const entered = sim.arm();
    clock.skew += lib.READY_MAX_AGE_MS + 50;
    let done = false;
    const pending = lib.ready().then(function () { done = true; });
    await entered;
    lib.mem.files.push({ id: "file_kept", workspace: DESK, name: "kept.png" });
    await lib.save();
    if (done) fail("reload finished before the overlapping save");
    sim.release();
    await pending;
    const ids = (lib.mem.files || []).map(function (f) { return f && f.id; });
    if (ids.indexOf("file_kept") < 0) fail("reload applied a snapshot taken before the save");
    else pass("reload discarded the pre-save snapshot");
    finish(!process.exitCode);
    return;
  }

  if (scenario === "health") {
    envProdBlob(storeFile, uploadDir);
    const helperPin = "7391";
    const store = writeSeed(storeFile, pin);
    store.workspaces[0].people.push({
      id: "p_helper",
      name: "Helper",
      role: "employee",
      kind: "helper",
      pin: hashPin(helperPin),
      status: "approved"
    });
    store.jobs.push({ id: "job_card", workspace: DESK, title: "Open card", status: "waiting" });
    fs.writeFileSync(storeFile, JSON.stringify(store));
    const files = {};
    files[BLOB_KEY] = JSON.stringify(store);
    installLatencyBlob(files);
    const lib = bootLib(apiDir);
    await lib.ready();
    const remote = JSON.parse(files[BLOB_KEY]);
    const card = remote.jobs.find(function (j) { return j && j.id === "job_card"; });
    card.status = "killed";
    const helper = remote.workspaces[0].people.find(function (p) { return p && p.id === "p_helper"; });
    helper.status = "denied";
    remote.files.push({ id: "file_marker", workspace: DESK, name: "marker.png" });
    files[BLOB_KEY] = JSON.stringify(remote);
    const health = require(path.join(apiDir, "health.js"));
    const res = await call(health, "GET", {});
    if (res.statusCode !== 200) fail("health status " + res.statusCode);
    const saved = JSON.parse(files[BLOB_KEY]);
    const savedCard = (saved.jobs || []).find(function (j) { return j && j.id === "job_card"; });
    const savedHelper = ((saved.workspaces[0] || {}).people || []).find(function (p) { return p && p.id === "p_helper"; });
    const savedIds = (saved.files || []).map(function (f) { return f && f.id; });
    if (!savedCard || savedCard.status !== "killed") fail("health resurrected the killed card");
    else pass("killed card stays killed");
    if (!savedHelper || savedHelper.status !== "denied") fail("health resurrected the helper");
    else pass("revoked helper stays revoked in the store");
    if (savedIds.indexOf("file_marker") < 0) fail("health dropped the other instance marker");
    else pass("other instance marker survived health");
    const jobs = require(path.join(apiDir, "jobs.js"));
    const listed = await call(jobs, "GET", { "x-workspace": DESK, "x-pin": helperPin });
    if (listed.statusCode !== 404) fail("revoked helper got " + listed.statusCode + " " + JSON.stringify(listed.body));
    else pass("revoked helper gets 404");
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
    clock.skew += lib.READY_MAX_AGE_MS + 50;
    await lib.ready();
    if (sim.counts.heads !== startHeads + 2) fail("second stale window should reload once, heads " + sim.counts.heads);
    else pass("second stale window reloaded once");
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

  if (scenario === "clean-fail") {
    clock.skew += lib.READY_MAX_AGE_MS + 50;
    sim.failReads();
    await lib.ready();
    const ids = (lib.mem.files || []).map(function (f) { return f && f.id; });
    const slugs = (lib.mem.workspaces || []).map(function (w) { return w && w.slug; });
    if (ids.indexOf("file_seed") < 0 || slugs.indexOf(DESK) < 0) {
      fail("failed read replaced a clean mem, ids " + ids.join(",") + " desks " + slugs.join(","));
    } else pass("failed read left a clean mem in place");
    finish(!process.exitCode);
    return;
  }

  if (scenario === "after-save") {
    lib.mem.files.push({ id: "file_saved", workspace: DESK, name: "saved.png" });
    await lib.save();
    const remote = JSON.parse(files[BLOB_KEY]);
    remote.files.push({ id: "file_marker", workspace: DESK, name: "marker.png" });
    files[BLOB_KEY] = JSON.stringify(remote);
    clock.skew += lib.READY_MAX_AGE_MS + 50;
    await lib.ready();
    const ids = (lib.mem.files || []).map(function (f) { return f && f.id; });
    if (ids.indexOf("file_saved") < 0) fail("local save disappeared");
    if (ids.indexOf("file_marker") < 0) fail("stale ready after a save did not apply the other instance");
    else pass("save still accepts the next stale reload");
    finish(!process.exitCode);
    return;
  }

  if (scenario === "save-window") {
    clock.skew += lib.READY_MAX_AGE_MS + 50;
    await lib.save();
    const afterSave = sim.counts.heads;
    await lib.ready();
    if (sim.counts.heads !== afterSave) fail("save did not restart the window, extra heads " + (sim.counts.heads - afterSave));
    else pass("save restarted the window");
    finish(!process.exitCode);
    return;
  }

  if (scenario === "second") {
    const first = JSON.parse(files[BLOB_KEY]);
    first.files.push({ id: "file_a", workspace: DESK, name: "a.png" });
    files[BLOB_KEY] = JSON.stringify(first);
    clock.skew += lib.READY_MAX_AGE_MS + 50;
    await lib.ready();
    const ids1 = (lib.mem.files || []).map(function (f) { return f && f.id; });
    if (ids1.indexOf("file_a") < 0) fail("first stale reload missed file_a");
    const secondBody = JSON.parse(files[BLOB_KEY]);
    secondBody.files.push({ id: "file_b", workspace: DESK, name: "b.png" });
    files[BLOB_KEY] = JSON.stringify(secondBody);
    clock.skew += lib.READY_MAX_AGE_MS + 50;
    await lib.ready();
    const ids2 = (lib.mem.files || []).map(function (f) { return f && f.id; });
    if (ids2.indexOf("file_b") < 0) fail("second stale reload missed file_b");
    else pass("second stale reload applied");
    finish(!process.exitCode);
    return;
  }

  if (scenario === "quiet") {
    const shop = (lib.mem.workspaces || []).find(function (w) { return w && w.slug === DESK; });
    if (!shop) {
      fail("quiet desk missing");
      finish(false);
      return;
    }
    lib.ensureRules(shop);
    lib.ensureNouns(shop);
    lib.ensurePeople(shop);
    require(path.join(apiDir, "_fields.js")).ensureFields(shop);
    if (!Array.isArray(shop.rules) || !shop.nouns || !Array.isArray(shop.fields)) {
      fail("read did not fill rules, nouns, and fields");
    } else pass("read filled rules, nouns, and fields");
    const remote = JSON.parse(files[BLOB_KEY]);
    remote.files.push({ id: "file_quiet", workspace: DESK, name: "quiet.png" });
    files[BLOB_KEY] = JSON.stringify(remote);
    clock.skew += lib.READY_MAX_AGE_MS + 50;
    await lib.ready();
    const ids = (lib.mem.files || []).map(function (f) { return f && f.id; });
    if (ids.indexOf("file_quiet") < 0) fail("read-time fill blocked the other instance");
    else pass("read-time fill did not block reload");
    lib.mem.files.push({ id: "file_real", workspace: DESK, name: "real.png" });
    const blocked = JSON.parse(files[BLOB_KEY]);
    blocked.files.push({ id: "file_blocked", workspace: DESK, name: "blocked.png" });
    files[BLOB_KEY] = JSON.stringify(blocked);
    clock.skew += lib.READY_MAX_AGE_MS + 50;
    await lib.ready();
    const after = (lib.mem.files || []).map(function (f) { return f && f.id; });
    if (after.indexOf("file_real") < 0) fail("unsaved write was replaced");
    else pass("unsaved write was not replaced");
    if (after.indexOf("file_blocked") >= 0) fail("unsaved write did not block the other instance");
    else pass("unsaved write still blocks replacement");
    finish(!process.exitCode);
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
