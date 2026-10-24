#!/usr/bin/env node
require("./_env-guard");
// One cron run of GET /api/worker?all=1 must fit maxDuration 60 s.
// Stand-in @vercel/blob, fetch, AbortSignal.timeout and a virtual clock
// (Date.now/setTimeout), fake tokens, no network, no production.
// One child per case, each a cold instance:
//   hooks     6 follow hooks that hang: each fetch has a signal (4000 ms),
//             at most 3 tries per run, every try starts while it can end
//             by the hook cutoff, leftovers keep followPinged false, the
//             delivery id is the stored-field id, the run is not deferred
//   late      store reads + two slow scrub puts take 28 s: no hook goes out
//   defer     reads + puts push the run past the 35 s save cutoff: 503 +
//             Retry-After 5, ok:false, no store put for the save
//   readhang  every store read hangs: each times out at 5000 ms, no starter
//             write, store untrusted, no hook, no 2xx
//   readlate  the read answers after its deadline: the store stays untrusted
//   backhang  the read-back after a good put hangs: it times out at 5000 ms
//   puthang   the save's put hangs: 503 store_write_failed at 15000 ms
//   resend    hook answers, save fails: 503 store_write_failed; the next run
//             re-sends it with the same delivery id; once saved, never again
//   rotate    8 hooks, every hook hangs, every save fails (nothing is ever
//             saved): over 12 cron runs (14:00 + 22:00 UTC) every job is tried
//   lrt       saved followTriedAt: never-tried first (ties in rotation order),
//             then least recently tried
//   trust     warm and trusted, then a read times out: the store is untrusted
//   fair      10 hooks, all hang, saves land: no job tried twice before every
//             job was tried once (followTriedAt saved and used)
//   post-budget  warm POST after a failed save (Probe WP1): recovery reads
//             4.9 + 4.9 s, ready 4.9 s, scrub put 8 s + hung read-back, hooks
//             hang, save put 14.9 s + hung read-back: the clock starts when
//             guardStore takes the request, so it answers < 58 s, hooks end by
//             30 s and a save past 35 s is deferred
//   POST /api/worker (guardStore -> recoverStore), each 503 + Retry-After 5
//   within 10 s, store_not_ready, no store write:
//   post-cold     cold start, every store read hangs (hydrate, then recovery)
//   post-slow     cold start, every store read takes 45 s
//   post-warm     warm, a save failed, then the recovery read hangs
//   post-warmslow warm, a save failed, then the recovery read takes 45 s
//   post-legacy   legacy-only store, the legacy read hangs
//   post-absent   fresh install, the 'store absent' listing hangs
// Then the worst case is computed from the constants and the measured runs.
// `node scripts/check-worker-deadline.js --mutate` breaks the fix in a copy
// of api/ and proves each break is caught.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const KEY = "aia/store.json";
const SLUG = "wd-desk";
const HOOK_URL = "https://example.test/wd-hook";
const LIMIT_MS = 60000;
const PUT_MS = 15000;
const READ_MS = 5000;
const FAKE_ENV = { VERCEL_ENV: "production", BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_FAKESTORE_fakefakefake", BLOB_STORE_ID: "store_FAKESTORE", AIA_CHECK_PARENT: String(process.pid) };
const DAY0 = Date.UTC(2026, 9, 20, 14, 0, 0);
const scrub = (s) => String(s || "").replace(/vercel_blob_rw_\w+/g, "[token]");

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

// ---------- fixture: a desk with a webhook, on a plain file store ----------
async function buildFixture(apiDir, spec) {
  const lib = require(path.join(apiDir, "_lib.js"));
  await globalThis.__aiaHydrate;
  const res = fakeRes();
  await require(path.join(apiDir, "auth.js"))({ method: "POST", headers: {}, query: {}, url: "/api/auth", body: { slug: SLUG, biz: "WD Shop", name: "WD Owner", pin: "4826" } }, res);
  const mem = lib.mem;
  mem.connections.push({ id: "conn_wd", workspace: SLUG, provider: "webhook", hook: HOOK_URL });
  for (let i = 0; i < spec.hooks; i++) {
    mem.jobs.push({ id: "job_wd_" + i, workspace: SLUG, title: "Done card " + i, status: "shipped", pack: "wd", followed: true, followNote: "Done " + i, doneAt: new Date(DAY0 - 86400000 + i * 1000).toISOString(), log: [] });
    if (spec.triedAt && spec.triedAt[i]) mem.jobs[mem.jobs.length - 1].followTriedAt = spec.triedAt[i];
  }
  if (spec.out) {
    const r2 = fakeRes();
    await require(path.join(apiDir, "jobs.js"))({ method: "POST", headers: { "x-workspace": SLUG, "x-pin": "4826" }, query: {}, url: "/api/jobs", body: { action: "capture", title: "Out card", notes: "out" } }, r2);
    const j = mem.jobs.find((x) => x.title === "Out card");
    if (j) { j.status = "out"; j.nudgeOut = false; }
  }
  await lib.save();
  const store = JSON.parse(fs.readFileSync(process.env.AIA_STORE_PATH, "utf8"));
  // Rows the store scrub drops (persist-test jobs), so ready() writes.
  for (let i = 0; i < (spec.testRows || 0); i++) store.jobs.push({ id: "job_wdtest_" + i, workspace: SLUG, title: "TEST lot " + i, status: "shipped" });
  process.stdout.write("FIXTURE " + JSON.stringify(store) + "\n");
}

// ---------- child: one case on a virtual clock ----------
async function child(apiDir, spec) {
  const Module = require("module");
  const realImmediate = setImmediate;
  const V = { now: spec.start || DAY0, timers: [], seq: 0, log: [] };
  Date.now = () => V.now;
  global.setTimeout = function (fn, ms) {
    const t = { at: V.now + (Number(ms) || 0), ms: Number(ms) || 0, fn, args: Array.prototype.slice.call(arguments, 2), id: ++V.seq, cleared: false, unref() { return t; }, ref() { return t; }, hasRef() { return false; } };
    V.timers.push(t);
    if (t.ms >= 1000) V.log.push({ ms: t.ms, at: V.now });
    return t;
  };
  global.clearTimeout = function (t) { if (t && typeof t === "object") t.cleared = true; };
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const signals = [];
  AbortSignal.timeout = function (ms) {
    const c = new AbortController();
    signals.push(ms);
    setTimeout(() => { const e = new Error("The operation was aborted due to timeout"); e.name = "TimeoutError"; c.abort(e); }, ms);
    return c.signal;
  };
  const storeRaw = JSON.stringify(spec.store);
  fs.writeFileSync(process.env.AIA_STORE_PATH, storeRaw);
  const st = { files: spec.storeName === "none" ? {} : { [spec.storeName || KEY]: storeRaw }, putAttempts: [], hooks: [], other: [], putsOk: 0, dropLeft: spec.dropPuts || 0 };
  const host = "https://fakestore.private.blob.vercel-storage.com/";
  const nameOf = (k) => String(k || "").replace(/^https?:\/\/[^/]+\//, "").split("?")[0];
  const isStore = (n) => n === KEY || n === "aia-store.json";
  const never = () => new Promise(() => {});
  // op: "key" (head/get/fetch of a name) or "list" (listing by prefix).
  async function readGate(op, name) {
    const from = (V.run || 0) >= (spec.readFrom || 0);
    if (from && (spec.readHang || (spec.readBackHang && st.putsOk > 0))) return never();
    if (op === "key" && (spec.hangKeys || []).indexOf(name) >= 0) return never();
    if (op === "list" && (spec.hangLists || []).indexOf(name) >= 0) return never();
    if (from && op === "key" && spec.delayKeys && spec.delayKeys[name]) await sleep(spec.delayKeys[name]);
    if (spec.readLate) { await sleep(spec.readLate); return; }
    if (from && spec.readDelay) await sleep(spec.readDelay);
  }
  async function storePut(n, body) {
    st.putAttempts.push(V.now);
    // putPlan[run]: one entry per put in that run ("throw" or a delay in ms).
    const plan = spec.putPlan && spec.putPlan[V.run || 0];
    if (plan) {
      const k = st.putAttempts.length - 1 - (st.runPuts0 || 0);
      const step = plan[Math.min(k, plan.length - 1)];
      if (step === "throw") { const e = new Error("read ECONNRESET"); e.code = "ECONNRESET"; throw e; }
      await sleep(step);
      if (st.dropLeft > 0) { st.dropLeft--; st.putsOk++; return; }
      st.files[n] = body;
      st.putsOk++;
      return;
    }
    if (spec.put === "hang") return never();
    if (spec.put === "throw") { const e = new Error("read ECONNRESET"); e.code = "ECONNRESET"; throw e; }
    if (spec.putDelay) await sleep(spec.putDelay);
    if (st.dropLeft > 0) { st.dropLeft--; st.putsOk++; return; }
    st.files[n] = body;
    st.putsOk++;
  }
  Module._load = (function (orig) {
    return function (request) {
      if (request === "@vercel/blob") {
        return {
          async head(key) { const n = nameOf(key); await readGate("key", n); if (!st.files[n]) throw new Error("Vercel Blob: The requested blob does not exist"); return { pathname: n, url: host + n, downloadUrl: host + n + "?download=1" }; },
          async get(key) { const n = nameOf(key); await readGate("key", n); if (!st.files[n]) return null; const raw = st.files[n]; return { statusCode: 200, stream: { text: async () => raw }, blob: { url: host + n } }; },
          async list(opts) { const prefix = (opts && opts.prefix) || ""; await readGate("list", prefix); return { blobs: Object.keys(st.files).filter((n) => n.indexOf(prefix) === 0).map((n) => ({ pathname: n, url: host + n })), hasMore: false }; },
          async put(key, body) { const n = nameOf(key); const b = Buffer.isBuffer(body) ? body.toString("utf8") : String(body); if (isStore(n)) await storePut(n, b); else st.files[n] = b; return { url: host + n, downloadUrl: host + n + "?download=1", pathname: n }; },
          async del(key) { delete st.files[nameOf(key)]; },
          async copy(a, b) { st.files[nameOf(b)] = st.files[nameOf(a)]; return { url: host + nameOf(b), pathname: nameOf(b) }; }
        };
      }
      return orig.apply(this, arguments);
    };
  })(Module._load);
  global.fetch = async function (url, opts) {
    const u = String(url || "");
    const method = String((opts && opts.method) || "GET").toUpperCase();
    if (u === HOOK_URL) {
      let body = {};
      try { body = JSON.parse(opts.body); } catch (e) {}
      const id = body.job && body.job.id;
      const rec = { id, at: V.now, signal: !!(opts && opts.signal), delivery: body.delivery || null, key: (opts && opts.headers && opts.headers["Idempotency-Key"]) || null, run: V.run };
      st.hooks.push(rec);
      if ((spec.hangHooks || []).indexOf(id) >= 0 || spec.hangHooks === "all") {
        return new Promise((ok, no) => { if (opts && opts.signal) opts.signal.addEventListener("abort", () => no(opts.signal.reason)); });
      }
      return { ok: true, status: 200, url: u, text: async () => "{}" };
    }
    if (!/vercel-storage\.com|vercel\.com\/api\/blob/.test(u)) { st.other.push(u.slice(0, 80)); throw new Error("no network in this check"); }
    if (method !== "GET") {
      const m = u.match(/[?&]pathname=([^&]+)/);
      const n = m ? decodeURIComponent(m[1]) : nameOf(u);
      const b = Buffer.isBuffer(opts.body) ? opts.body.toString("utf8") : String(opts.body || "");
      if (isStore(n)) await storePut(n, b); else st.files[n] = b;
      return { ok: true, status: 200, url: u, text: async () => JSON.stringify({ url: host + n }) };
    }
    const pm = u.match(/[?&]prefix=([^&]+)/);
    await readGate(pm ? "list" : "key", pm ? decodeURIComponent(pm[1]) : nameOf(u));
    if (pm) { const prefix = decodeURIComponent(pm[1]); return { ok: true, status: 200, url: u, text: async () => JSON.stringify({ blobs: Object.keys(st.files).filter((n) => n.indexOf(prefix) === 0).map((n) => ({ pathname: n })), hasMore: false }) }; }
    const n = nameOf(u);
    if (!st.files[n]) return { ok: false, status: 404, statusText: "Not Found", url: u, text: async () => "" };
    const raw = st.files[n];
    return { ok: true, status: 200, url: u, text: async () => raw };
  };
  // Run a promise to completion on the virtual clock: when nothing else can
  // move, jump to the next live timer. No live timer left = hung for real.
  async function drive(p) {
    let state = "pending";
    let value;
    Promise.resolve(p).then((v) => { state = "done"; value = v; }, (e) => { state = "threw"; value = String(e && e.message || e).slice(0, 120); });
    for (let guard = 0; guard < 100000; guard++) {
      for (let i = 0; i < 30 && state === "pending"; i++) await new Promise((ok) => realImmediate(ok));
      if (state !== "pending") return { state, value };
      const live = V.timers.filter((t) => !t.cleared && !t.fired).sort((a, b) => a.at - b.at || a.id - b.id);
      if (!live.length) return { state: "hung" };
      const t = live[0];
      t.fired = true;
      if (t.at > V.now) V.now = t.at;
      try { t.fn.apply(null, t.args); } catch (e) {}
    }
    return { state: "hung" };
  }
  const lib = require(path.join(apiDir, "_lib.js"));
  const worker = require(path.join(apiDir, "worker.js"));
  const out = { budget: worker.WORKER_BUDGET || null, runs: [] };
  const coldStart = V.now;
  // spec.cold: the first request arrives while the cold load is in flight,
  // so its time includes the load.
  const h = spec.cold ? { state: "in-request" } : await drive(globalThis.__aiaHydrate);
  out.hydrate = { state: h.state, ms: V.now - coldStart };
  const stored = () => { try { return JSON.parse(lib.blobOpen(st.files[KEY])); } catch (e) { return null; } };
  async function run(at) {
    if (at) V.now = Math.max(V.now, at);
    V.run = out.runs.length;
    const t0 = V.now;
    const puts0 = st.putAttempts.length;
    st.runPuts0 = puts0;
    const hooks0 = st.hooks.length;
    const res = fakeRes();
    const method = (spec.methods && spec.methods[out.runs.length]) || spec.method || "GET";
    const d = await drive(worker({ method, headers: {}, query: { all: "1" }, url: "/api/worker?all=1" }, res));
    const b = res.body && typeof res.body === "object" ? res.body : {};
    const r = { state: d.state, threw: d.state === "threw" ? d.value : null, ms: V.now - t0, cold: out.runs.length === 0 ? out.hydrate.ms : 0, status: res.statusCode, retry: res.headers["Retry-After"] || null, ok: b.ok, deferred: !!b.deferred, code: b.code || null, puts: st.putAttempts.slice(puts0).map((x) => x - t0), hooks: st.hooks.slice(hooks0).map((x) => Object.assign({}, x, { at: x.at - t0 })), trusted: lib.storeTrusted(), driver: lib.mem.driver, write: lib.blobProbe && lib.blobProbe.write };
    out.runs.push(r);
    return r;
  }
  const runs = spec.runs || [0];
  for (const at of runs) await run(at);
  if (spec.readLate) { await drive(sleep(spec.readLate * 2)); out.trustedAfterLate = lib.storeTrusted(); }
  const fin = stored();
  out.final = fin && (fin.jobs || []).filter((j) => /^job_wd_/.test(j.id)).map((j) => ({ id: j.id, pinged: !!j.followPinged, doneAt: j.doneAt || null, delivery: worker.deliveryOf ? worker.deliveryOf(j) : null }));
  out.storeSame = st.files[KEY] === storeRaw;
  out.signals = signals;
  out.longTimers = V.log.map((x) => x.ms);
  out.putTotal = st.putAttempts.length;
  out.other = st.other;
  process.stdout.write("RESULT " + JSON.stringify(out) + "\n");
  process.exit(0);
}

// ---------- parent ----------
function spawn(args, env) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-wd-"));
  const e = Object.assign({ PATH: process.env.PATH, HOME: tmp, AIA_STORE_PATH: path.join(tmp, "store.json"), AIA_UPLOAD_DIR: path.join(tmp, "up") }, env || {});
  const r = spawnSync(process.execPath, [__filename].concat(args), { env: e, cwd: tmp, encoding: "utf8", timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  fs.rmSync(tmp, { recursive: true, force: true });
  return r;
}
function fixture(apiDir, spec) {
  const r = spawn(["--fixture", apiDir, JSON.stringify(spec)]);
  const line = String(r.stdout || "").split("\n").find((l) => l.indexOf("FIXTURE ") === 0);
  return line ? JSON.parse(line.slice(8)) : { error: scrub(r.stderr).slice(-300) };
}
function runCase(apiDir, spec) {
  const r = spawn(["--child", apiDir, JSON.stringify(spec)], FAKE_ENV);
  const line = String(r.stdout || "").split("\n").find((l) => l.indexOf("RESULT ") === 0);
  return line ? JSON.parse(line.slice(7)) : { error: "child gave no result (exit " + r.status + "): " + scrub(r.stderr).slice(-300) };
}

function runAll(apiDir, quiet) {
  const results = [];
  const t = (name, ok, why) => { results.push({ name, ok: !!ok }); if (!quiet) console.log((ok ? "ok   " : "FAIL ") + name + (ok || !why ? "" : " — " + why)); };
  const J = (x) => JSON.stringify(x);
  const fxHooks6 = fixture(apiDir, { hooks: 6 });
  const fxHooks8 = fixture(apiDir, { hooks: 8 });
  const fxHook1 = fixture(apiDir, { hooks: 1 });
  const fxLate = fixture(apiDir, { hooks: 4, testRows: 1 });
  const fxDefer = fixture(apiDir, { hooks: 4, testRows: 1, out: true });
  const fxOut = fixture(apiDir, { hooks: 0, out: true });
  const fxOutHook = fixture(apiDir, { hooks: 1, out: true });
  // Saved tries: jobs 1 and 4 never tried, then 2 (01:00) < 5 < 3 < 0.
  const TRIED = { 0: "2026-10-19T05:00:00.000Z", 2: "2026-10-19T01:00:00.000Z", 3: "2026-10-19T03:00:00.000Z", 5: "2026-10-19T02:00:00.000Z" };
  const fxTried = fixture(apiDir, { hooks: 6, triedAt: TRIED });
  const fxHooks10 = fixture(apiDir, { hooks: 10 });
  const fxBudget = fixture(apiDir, { hooks: 6, testRows: 2 });
  for (const [n, fx] of [["6 hooks", fxHooks6], ["8 hooks", fxHooks8], ["1 hook", fxHook1], ["late", fxLate], ["defer", fxDefer], ["out", fxOut], ["out+hook", fxOutHook], ["tried", fxTried], ["10 hooks", fxHooks10], ["budget", fxBudget]]) {
    if (fx.error) { t("fixture " + n, false, fx.error); return results; }
  }
  const measured = [];
  const ran = (name, o) => { if (o.error) { t(name + ": child ran", false, o.error); return false; } (o.runs || []).forEach((r) => measured.push({ name, ms: r.ms + r.cold, state: r.state })); return true; };
  const B = { HOOK_MS: 4000, HOOK_CAP: 3, HOOK_END_MS: 30000, DEFER_MS: 35000 };

  // hooks: 6 hanging hooks, everything else healthy.
  const a = runCase(apiDir, { store: fxHooks6, hangHooks: "all" });
  if (ran("hooks", a)) {
    const r = a.runs[0];
    t("hooks: the run finishes", r.state === "done", J([r.state, r.threw]));
    t("hooks: every hook fetch has an abort signal", r.hooks.length > 0 && r.hooks.every((x) => x.signal), J(r.hooks));
    t("hooks: each signal is AbortSignal.timeout(" + B.HOOK_MS + ")", a.signals.length === r.hooks.length && a.signals.every((ms) => ms === B.HOOK_MS), J(a.signals));
    t("hooks: at most " + B.HOOK_CAP + " hook tries in one run (6 due)", r.hooks.length === B.HOOK_CAP, J(r.hooks.map((x) => x.id)));
    t("hooks: a hung hook is given up at " + B.HOOK_MS + " ms", r.hooks.every((x, i) => i === 0 || x.at - r.hooks[i - 1].at === B.HOOK_MS), J(r.hooks.map((x) => x.at)));
    t("hooks: every hook starts while it can end by " + B.HOOK_END_MS + " ms", r.hooks.every((x) => x.at + B.HOOK_MS <= B.HOOK_END_MS), J(r.hooks.map((x) => x.at)));
    t("hooks: a run that tried hooks is not deferred, it saves (2xx)", !r.deferred && r.status === 200 && r.puts.length >= 1, J([r.status, r.deferred, r.puts]));
    t("hooks: the save starts after the hooks and before the " + B.DEFER_MS + " ms cutoff", r.puts.length >= 1 && r.puts[0] >= r.hooks[r.hooks.length - 1].at && r.puts[0] <= B.DEFER_MS, J(r.puts));
    const left = (a.final || []).filter((j) => r.hooks.every((x) => x.id !== j.id));
    t("hooks: leftovers (not tried this run) keep followPinged false", left.length === 3 && left.every((j) => !j.pinged), J(left));
    t("hooks: hung (aborted) hooks keep followPinged false", (a.final || []).every((j) => !j.pinged), J(a.final));
    const ids = {};
    (a.final || []).forEach((j) => { ids[j.id] = j.delivery; });
    t("hooks: delivery id in body and Idempotency-Key is the stored-field id", r.hooks.every((x) => x.delivery && x.delivery === x.key && x.delivery === ids[x.id]), J(r.hooks.map((x) => [x.id, x.delivery, x.key])));
    // Independent of the worker's own deliveryOf: sha256(jobId|follow|doneAt).
    const want = (j) => "follow_" + crypto.createHash("sha256").update(j.id + "|follow|" + (j.doneAt || "")).digest("hex").slice(0, 16);
    const fx6 = {};
    (fxHooks6.jobs || []).forEach((j) => { fx6[j.id] = j; });
    t("hooks: delivery id is sha256(jobId|follow|doneAt), doneAt included", r.hooks.length > 0 && r.hooks.every((x) => fx6[x.id] && fx6[x.id].doneAt && x.delivery === want(fx6[x.id])), J(r.hooks.map((x) => [x.id, x.delivery])));
    t("hooks: no non-hook, non-blob network", a.other.length === 0, J(a.other));
  }

  // lrt: saved followTriedAt orders the tries. 1 and 4 (never tried) are 3
  // apart, so no rotation window of 3 holds both: only the ordering can.
  const lr = runCase(apiDir, { store: fxTried });
  if (ran("lrt", lr)) {
    const ids = lr.runs[0].hooks.map((x) => x.id);
    t("lrt: never-tried jobs first (1 and 4)", ids.length === 3 && ids.slice(0, 2).sort().join() === "job_wd_1,job_wd_4", J(ids));
    t("lrt: then the least recently tried (2, tried 01:00)", ids[2] === "job_wd_2", J(ids));
    // Ties (both never tried) keep this run's rotation order.
    const start = Math.floor((((Math.floor(DAY0 / 3600000)) * 0.6180339887498949) % 1) * 6);
    const rot = [0, 1, 2, 3, 4, 5].map((i) => "job_wd_" + ((start + i) % 6)).filter((id) => id === "job_wd_1" || id === "job_wd_4");
    t("lrt: ties keep the run's rotation order", ids.slice(0, 2).join() === rot.join(), J([ids, rot]));
  }

  // late: cold load + two slow scrub puts take 28 s before the hook phase.
  const l = runCase(apiDir, { store: fxLate, hangHooks: "all", putDelay: 14000, dropPuts: 2 });
  if (ran("late", l)) {
    const r = l.runs[0];
    const pre = r.cold + (r.puts.length ? 0 : 0);
    t("late: the run finishes", r.state === "done", J([r.state, r.threw]));
    t("late: the hook phase starts late (>= " + (B.HOOK_END_MS - B.HOOK_MS) + " ms in)", l.hydrate.ms + 14000 >= B.HOOK_END_MS - B.HOOK_MS, J([l.hydrate.ms, r.ms, r.puts]));
    t("late: no hook goes out once it could not end by the hook cutoff", r.hooks.every((x) => r.cold + x.at + B.HOOK_MS <= B.HOOK_END_MS), J(r.hooks.map((x) => r.cold + x.at)));
    t("late: so no hook ever goes out where a deferred save is possible", r.hooks.length === 0 && B.HOOK_END_MS <= B.DEFER_MS, J([r.hooks.length, pre]));
  }

  // defer: slow reads + slow scrubs push the save past the cutoff.
  const d = runCase(apiDir, { store: fxDefer, hangHooks: "all", putDelay: 14000, dropPuts: 2, readDelay: 2400 });
  if (ran("defer", d)) {
    const r = d.runs[0];
    const at = d.hydrate.ms + r.ms;
    t("defer: the run finishes", r.state === "done", J([r.state, r.threw]));
    t("defer: the save would start past " + B.DEFER_MS + " ms", at > B.DEFER_MS, J([d.hydrate.ms, r.ms]));
    t("defer: answers 503 + Retry-After 5, ok:false, deferred", r.status === 503 && r.retry === "5" && r.ok === false && r.deferred === true, J([r.status, r.retry, r.ok, r.deferred]));
    t("defer: no store put for the deferred save (only the 2 scrubs)", d.putTotal === 2, J([d.putTotal, r.puts]));
    t("defer: no hook in a deferred run", r.hooks.length === 0, J(r.hooks));
  }

  // readhang: every store read hangs.
  const h = runCase(apiDir, { store: fxOutHook, readHang: true });
  if (ran("readhang", h)) {
    const r = h.runs[0];
    t("readhang: the cold load gives up at " + READ_MS + " ms", h.hydrate.state === "done" && h.hydrate.ms === READ_MS, J(h.hydrate));
    t("readhang: the run finishes, ready() read gives up at " + READ_MS + " ms", r.state === "done" && r.ms === READ_MS, J([r.state, r.ms, r.threw]));
    t("readhang: no starter or any store write", h.putTotal === 0 && h.storeSame, J([h.putTotal, h.storeSame]));
    t("readhang: the store stays untrusted", r.trusted === false, J(r.trusted));
    t("readhang: no hook while the store is untrusted", r.hooks.length === 0, J(r.hooks));
    t("readhang: no 2xx", r.status >= 400, J([r.status, r.code]));
  }

  // readlate: the read answers, but after its deadline.
  const rl = runCase(apiDir, { store: fxOut, readLate: 7000 });
  if (ran("readlate", rl)) {
    t("readlate: the late answer does not make the store trusted", rl.trustedAfterLate === false && rl.runs[0].trusted === false, J([rl.runs[0].trusted, rl.trustedAfterLate]));
    t("readlate: no store write", rl.putTotal === 0 && rl.storeSame, J([rl.putTotal]));
  }

  // backhang: reads hang once the put has landed.
  const bh = runCase(apiDir, { store: fxOutHook, readBackHang: true });
  if (ran("backhang", bh)) {
    const r = bh.runs[0];
    t("backhang: the run finishes", r.state === "done", J([r.state, r.threw]));
    t("backhang: the read-back gives up at " + READ_MS + " ms after the put", r.puts.length === 1 && r.ms - r.puts[0] === READ_MS, J([r.ms, r.puts]));
    t("backhang: a timed-out read-back is not a confirmed write (no-stick, not blob)", r.write === "no-stick" && r.driver !== "blob", J([r.write, r.driver]));
  }

  // puthang: the save's put hangs.
  const ph = runCase(apiDir, { store: fxOut, put: "hang" });
  if (ran("puthang", ph)) {
    const r = ph.runs[0];
    t("puthang: 503 store_write_failed when the " + PUT_MS + " ms put deadline fires", r.state === "done" && r.status === 503 && r.code === "store_write_failed" && r.ms - r.puts[0] === PUT_MS, J([r.state, r.status, r.code, r.ms, r.puts]));
  }

  // resend: hook answers, the save fails, then the save recovers.
  const rs1 = runCase(apiDir, { store: fxHook1, put: "throw", runs: [DAY0, DAY0 + 8 * 3600000] });
  if (ran("resend", rs1)) {
    const [r1, r2] = rs1.runs;
    t("resend: hook sent, then the save fails: 503 store_write_failed", r1.hooks.length === 1 && r1.status === 503 && r1.code === "store_write_failed", J([r1.hooks.length, r1.status, r1.code]));
    t("resend: the next cron re-sends that hook", r2.hooks.length === 1 && r2.hooks[0].id === r1.hooks[0].id, J([r1.hooks, r2.hooks]));
    t("resend: with the same delivery id (stored fields only)", r1.hooks[0] && r2.hooks[0] && r1.hooks[0].delivery === r2.hooks[0].delivery && r1.hooks[0].delivery === rs1.final[0].delivery, J([r1.hooks[0], r2.hooks[0], rs1.final]));
  }
  const rs2 = runCase(apiDir, { store: fxHook1, runs: [DAY0, DAY0 + 8 * 3600000] });
  if (ran("resend-ok", rs2)) {
    const [r1, r2] = rs2.runs;
    t("resend: once the save lands, the hook is not sent again", r1.status === 200 && r1.hooks.length === 1 && r2.hooks.length === 0 && rs2.final[0].pinged, J([r1.status, r1.hooks.length, r2.hooks.length, rs2.final]));
  }

  // rotate: nothing is ever saved, every hook hangs.
  const cron = [];
  for (let i = 0; i < 6; i++) { cron.push(DAY0 + i * 86400000); cron.push(DAY0 + i * 86400000 + 8 * 3600000); }
  const ro = runCase(apiDir, { store: fxHooks8, hangHooks: "all", put: "throw", runs: cron });
  if (ran("rotate", ro)) {
    const tried = {};
    ro.runs.forEach((r) => r.hooks.forEach((x) => { tried[x.id] = (tried[x.id] || 0) + 1; }));
    const all = (ro.final || []).map((j) => j.id);
    t("rotate: no save ever lands (store byte-identical)", ro.storeSame && ro.runs.every((r) => r.status === 503), J(ro.runs.map((r) => r.status)));
    t("rotate: at most " + B.HOOK_CAP + " tries per run", ro.runs.every((r) => r.hooks.length <= B.HOOK_CAP), J(ro.runs.map((r) => r.hooks.length)));
    t("rotate: every one of 8 jobs is tried within 12 cron runs", all.length === 8 && all.every((id) => tried[id] > 0), J(tried));
    t("rotate: the later jobs (5-7) get tried too", ["job_wd_5", "job_wd_6", "job_wd_7"].every((id) => tried[id] > 0), J(tried));
    const byId = {};
    ro.runs.forEach((r) => r.hooks.forEach((x) => { (byId[x.id] = byId[x.id] || new Set()).add(x.delivery); }));
    t("rotate: one delivery id per job across every run", Object.keys(byId).every((id) => byId[id].size === 1), J(Object.keys(byId).map((id) => [id, Array.from(byId[id])])));
  }

  // trust: warm and trusted, then a read times out: no longer trusted.
  const tr = runCase(apiDir, { store: fxOut, readHang: true, readFrom: 1, runs: [DAY0, DAY0 + 8 * 3600000] });
  if (ran("trust", tr)) {
    const [r1, r2] = tr.runs;
    t("trust: a read that timed out leaves the store untrusted (was trusted)", r1.trusted === true && r2.state === "done" && r2.trusted === false && r2.puts.length === 0, J([r1.trusted, r2.state, r2.trusted, r2.puts]));
  }

  // fair: 10 jobs, every hook hangs, every save lands (followTriedAt saved).
  const fa = runCase(apiDir, { store: fxHooks10, hangHooks: "all", runs: [DAY0, DAY0 + 8 * 3600000, DAY0 + 86400000, DAY0 + 86400000 + 8 * 3600000] });
  if (ran("fair", fa)) {
    const seq = [];
    fa.runs.forEach((r) => r.hooks.forEach((x) => seq.push(x.id)));
    const firstTen = seq.slice(0, 10);
    t("fair: the saves land (2xx) and each run tries " + B.HOOK_CAP, fa.runs.every((r) => r.status === 200 && r.hooks.length === B.HOOK_CAP), J(fa.runs.map((r) => [r.status, r.hooks.length])));
    t("fair: no job tried twice before all 10 were tried once (4 runs)", seq.length === 12 && new Set(firstTen).size === 10, J(seq));
  }

  // post-budget: Probe WP1, warm POST after a failed save, every step slow.
  const pb = runCase(apiDir, { store: fxBudget, storeName: "aia-store.json", hangHooks: "all", readFrom: 1, readBackHang: true, dropPuts: 99, delayKeys: { "aia/store.json": 4900, "aia-store.json": 4900 }, putPlan: [["throw"], [8000, 14900]], methods: ["GET", "POST"], runs: [DAY0, DAY0 + 8 * 3600000] });
  if (ran("post-budget", pb)) {
    const [r1, r2] = pb.runs;
    const S = PUT_MS + READ_MS;
    t("post-budget: the warm GET's save failed first (store untrusted)", r1.status === 503 && r1.code === "store_write_failed" && r1.trusted === false, J([r1.status, r1.code, r1.trusted]));
    t("post-budget: POST answers in < 58000 ms from arrival", r2.state === "done" && r2.ms < 58000, J([r2.state, r2.ms]));
    t("post-budget: 200, or a deferred 503 + Retry-After 5", r2.status === 200 || (r2.status === 503 && r2.retry === "5" && r2.deferred), J([r2.status, r2.retry, r2.deferred, r2.code]));
    t("post-budget: every hook ends by " + B.HOOK_END_MS + " ms from arrival", r2.hooks.every((x) => x.at + B.HOOK_MS <= B.HOOK_END_MS), J(r2.hooks.map((x) => x.at)));
    t("post-budget: every put starts while it can end by " + (B.DEFER_MS + S) + " ms from arrival", r2.puts.every((x) => x <= B.DEFER_MS), J(r2.puts));
  }

  // POST /api/worker: guardStore's recovery reads have the same 5 s deadline.
  const POST_MS = 2 * READ_MS;
  const post = (name, o, warm) => {
    if (!ran(name, o)) return;
    const r = o.runs[o.runs.length - 1];
    if (warm) t(name + ": the warm GET's save failed first (store untrusted)", o.runs[0].status === 503 && o.runs[0].code === "store_write_failed" && o.runs[0].trusted === false, J([o.runs[0].status, o.runs[0].code]));
    t(name + ": POST answers (does not hang)", r.state === "done", J([r.state, r.threw]));
    t(name + ": within " + POST_MS + " ms", r.state === "done" && r.ms + r.cold <= POST_MS, J(r.ms + r.cold));
    t(name + ": 503 store_not_ready + Retry-After 5, ok:false, never 2xx", r.status === 503 && r.retry === "5" && r.ok === false && r.code === "store_not_ready", J([r.status, r.retry, r.ok, r.code]));
    t(name + ": no store write", r.puts.length === 0 && (warm || o.putTotal === 0), J([r.puts, o.putTotal]));
    t(name + ": no hook", r.hooks.length === 0, J(r.hooks));
  };
  post("post-cold", runCase(apiDir, { store: fxOutHook, cold: true, method: "POST", readHang: true }));
  post("post-slow", runCase(apiDir, { store: fxOutHook, cold: true, method: "POST", readDelay: 45000 }));
  post("post-warm", runCase(apiDir, { store: fxOutHook, put: "throw", readHang: true, readFrom: 1, methods: ["GET", "POST"], runs: [DAY0, DAY0 + 8 * 3600000] }), true);
  post("post-warmslow", runCase(apiDir, { store: fxOutHook, put: "throw", readDelay: 45000, readFrom: 1, methods: ["GET", "POST"], runs: [DAY0, DAY0 + 8 * 3600000] }), true);
  post("post-legacy", runCase(apiDir, { store: fxOutHook, storeName: "aia-store.json", cold: true, method: "POST", hangKeys: ["aia-store.json"] }));
  post("post-absent", runCase(apiDir, { store: fxOutHook, storeName: "none", cold: true, method: "POST", hangLists: ["aia-store.json"] }));

  // Worst case, from the constants and from the runs above.
  const b = (a && a.budget) || {};
  t("budget: worker constants are the reviewed ones", b.HOOK_MS === B.HOOK_MS && b.HOOK_CAP === B.HOOK_CAP && b.HOOK_END_MS === B.HOOK_END_MS && b.DEFER_MS === B.DEFER_MS, J(b));
  const timers = (h.longTimers || []).concat(ph.longTimers || []);
  t("budget: read deadline " + READ_MS + " ms and put deadline " + PUT_MS + " ms are what runs", timers.indexOf(READ_MS) >= 0 && timers.indexOf(PUT_MS) >= 0 && timers.every((ms) => ms === READ_MS || ms === PUT_MS || ms === B.HOOK_MS), J(timers));
  const S = PUT_MS + READ_MS;
  const preHookCold = Math.max(READ_MS + S + READ_MS + S, READ_MS * 3 + S + READ_MS);
  const worst = Math.max(B.DEFER_MS + S, preHookCold, B.HOOK_END_MS + S);
  t("budget: hooks end before the save cutoff (" + B.HOOK_END_MS + " <= " + B.DEFER_MS + ")", B.HOOK_END_MS <= B.DEFER_MS);
  t("budget: computed worst case " + worst + " ms < " + LIMIT_MS + " ms", worst < LIMIT_MS, String(worst));
  const mx = measured.reduce((m, x) => Math.max(m, x.ms), 0);
  t("budget: every measured run finished, the longest " + mx + " ms <= computed worst " + worst + " ms", measured.length > 0 && measured.every((x) => x.state === "done") && mx <= worst, J(measured.filter((x) => x.state !== "done" || x.ms > worst)));
  if (!quiet) console.log("worst case: max(DEFER " + B.DEFER_MS + " + put " + PUT_MS + " + read-back " + READ_MS + ", cold pre-hook " + preHookCold + ", hooks " + B.HOOK_END_MS + " + " + S + ") = " + worst + " ms; longest measured " + mx + " ms");
  return results;
}

const MUTANTS = [
  { id: "W1 hook fetch without a signal", file: "worker.js", from: ", signal: AbortSignal.timeout(HOOK_MS) });", to: " });" },
  { id: "W2 no per-run hook cap", file: "worker.js", from: "if (tried >= HOOK_CAP || Date.now()", to: "if (Date.now()" },
  { id: "W3 no hook time budget", file: "worker.js", from: " || Date.now() - t0 + HOOK_MS > HOOK_END_MS) break;", to: ") break;" },
  { id: "W4 no store read deadline", file: "_lib.js", from: "function blobReadDeadline(job) {\n", to: "function blobReadDeadline(job) {\n  return job;\n" },
  { id: "W5 no read-back deadline", file: "_lib.js", from: "await blobDeadline(blobWriteStick(blob, used), blobReadMs(), \"read-back\").catch(() => false);", to: "await blobWriteStick(blob, used);" },
  { id: "W6 deferred run answers 200", file: "worker.js", from: "return res.status(503).json({ ok: false, deferred: true", to: "return res.status(200).json({ ok: false, deferred: true" },
  { id: "W7 deferred run still saves", file: "worker.js", from: "      return res.status(503).json({ ok: false, deferred: true", to: "      res.status(503).json({ ok: false, deferred: true" },
  { id: "W8 delivery id minted per try", file: "worker.js", from: "update(job.id + \"|follow|\" + (job.doneAt || \"\"))", to: "update(job.id + \"|follow|\" + Date.now())" },
  { id: "W9 no rotation (always from the first job)", file: "worker.js", from: "const start = Math.floor(((slot * 0.6180339887498949) % 1) * list.length);", to: "const start = 0;" },
  { id: "W10 hooks while the store is untrusted", file: "worker.js", from: "const pinged = storeTrusted() ? await pingHooks(scope, t0) : [];", to: "const pinged = await pingHooks(scope, t0);" },
  { id: "W11 late read answer trusts the store", file: "_lib.js", from: "job.then(() => { if (timedOut) untrustStore(); }, () => {});", to: "" },
  { id: "W12 doneAt dropped from the delivery id", file: "worker.js", from: "update(job.id + \"|follow|\" + (job.doneAt || \"\"))", to: "update(job.id + \"|follow|\")" },
  { id: "W13 least-recently-tried reversed (most recent first)", file: "worker.js", from: "String(a[0].job.followTriedAt || \"\").localeCompare(String(b[0].job.followTriedAt || \"\"))", to: "String(b[0].job.followTriedAt || \"\").localeCompare(String(a[0].job.followTriedAt || \"\"))" },
  { id: "W14 least-recently-tried key ignored (rotation only)", file: "worker.js", from: ".sort((a, b) => String(a[0].job.followTriedAt || \"\").localeCompare(String(b[0].job.followTriedAt || \"\")) || a[1] - b[1])", to: ".sort((a, b) => a[1] - b[1])" },
  { id: "W15 never-tried jobs last, not first", file: "worker.js", from: "String(a[0].job.followTriedAt || \"\").localeCompare(String(b[0].job.followTriedAt || \"\"))", to: "String(a[0].job.followTriedAt || \"\\uffff\").localeCompare(String(b[0].job.followTriedAt || \"\\uffff\"))" },
  { id: "W15b ties broken against the rotation order", file: "worker.js", from: " || a[1] - b[1])", to: " || b[1] - a[1])" },
  { id: "W16 no deadline on hydrate's legacy read", file: "_lib.js", from: "\n    if (blobProbe.read !== \"error\") {\n      const legacy = await blobReadDeadline(blobLegacyRead());", to: "\n    if (blobProbe.read !== \"error\") {\n      const legacy = await blobLegacyRead();" },
  { id: "W17 no deadline on hydrate's 'store absent' listing", file: "_lib.js", from: "!(await blobReadDeadline(blobAbsent()))", to: "!(await blobAbsent())" },
  { id: "W18 a timed-out read leaves the store trusted", file: "_lib.js", from: "    timedOut = true;\n    untrustStore();\n", to: "    timedOut = true;\n" },
  { id: "W19 read-back timeout counted as success", file: "_lib.js", from: "\"read-back\").catch(() => false);", to: "\"read-back\").catch(() => true);" },
  { id: "R1 no deadline on recoverStore's store read", file: "_lib.js", from: "untrusted (503).\n    const remote = await blobReadDeadline(blobRead());", to: "untrusted (503).\n    const remote = await blobRead();" },
  { id: "R2 no deadline on recoverStore's legacy read", file: "_lib.js", from: "} else if (blobProbe.read !== \"error\") {\n      const legacy = await blobReadDeadline(blobLegacyRead());", to: "} else if (blobProbe.read !== \"error\") {\n      const legacy = await blobLegacyRead();" },
  { id: "R3 no deadline on recoverStore's 'store absent' listing", file: "_lib.js", from: "        await blobReadDeadline(blobAbsent());\n", to: "        await blobAbsent();\n" },
  { id: "C1 warm clock starts after guardStore (reverted origin)", file: "worker.js", from: "coldRun ? loadedAt : (requestStartedAt() || Date.now());", to: "coldRun ? loadedAt : Date.now();" },
  { id: "C2 guardStore stamps the request after recovery", file: "_lib.js", from: "const ctx = { at, writes,", to: "const ctx = { at: Date.now(), writes," },
  { id: "D3 followTriedAt never set", file: "worker.js", from: "    job.followTriedAt = new Date(Date.now()).toISOString();\n", to: "" },
  { id: "R4 no deadline on any recoverStore read", file: "_lib.js", from: "async function recoverStore() {\n", to: "async function recoverStore() {\n  const blobReadDeadline = (job) => job;\n" }
];
// Equivalent (cannot change behavior, not counted): Array.prototype.sort is
// stable and the list is already in rotation order, so the index tie-break
// is redundant.
const EQUIVALENT = [
  { id: "E1 index tie-break dropped from the try order", file: "worker.js", from: " || a[1] - b[1])", to: ")" }
];

function mutate() {
  let caught = 0;
  MUTANTS.concat(EQUIVALENT).forEach((m) => {
    const eq = EQUIVALENT.indexOf(m) >= 0;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-wd-mut-"));
    const api = path.join(tmp, "api");
    fs.cpSync(path.join(ROOT, "api"), api, { recursive: true });
    const f = path.join(api, m.file);
    const src = fs.readFileSync(f, "utf8");
    if (src.split(m.from).length !== 2) { console.log("FAIL mutant " + m.id + ": anchor not found exactly once"); fs.rmSync(tmp, { recursive: true, force: true }); return; }
    fs.writeFileSync(f, src.replace(m.from, m.to));
    const bad = runAll(api, true).filter((c) => !c.ok);
    fs.rmSync(tmp, { recursive: true, force: true });
    if (eq) { console.log((bad.length ? "equivalent, yet " + bad.length + " checks fail: " : "equivalent (not counted), survives: ") + m.id); return; }
    if (bad.length) { caught++; console.log("caught  " + m.id + " (" + bad.length + " checks fail, e.g. " + bad[0].name + ")"); }
    else console.log("MISSED  " + m.id);
  });
  console.log(caught + "/" + MUTANTS.length + " mutants caught");
  return caught === MUTANTS.length;
}

const childErr = (e) => { console.error(scrub(e && e.stack || e)); process.exit(2); };
if (process.argv[2] === "--fixture") buildFixture(process.argv[3], JSON.parse(process.argv[4])).catch(childErr);
else if (process.argv[2] === "--child") child(process.argv[3], JSON.parse(process.argv[4])).catch(childErr);
else {
  const apiDir = path.resolve(process.argv[2] && process.argv[2].indexOf("--") !== 0 ? process.argv[2] : path.join(ROOT, "api"));
  const res = runAll(apiDir);
  const failed = res.filter((c) => !c.ok).length;
  console.log((res.length - failed) + " ok, " + failed + " FAIL");
  let ok = failed === 0;
  if (process.argv.includes("--mutate")) ok = mutate() && ok;
  if (!ok) { console.error("check-worker-deadline failed"); process.exit(1); }
  console.log("check-worker-deadline passed");
}
