#!/usr/bin/env node
require("./_env-guard");
// The store was read, then the durable Blob write (put) of aia/store.json
// fails. No saving request may answer 2xx with only a local /tmp copy kept.
// Stand-in @vercel/blob and fetch, fake tokens, no network, no production.
// One child process per put fault: throw, non-200 (SDK 500 + REST 500),
// 403 on every path, a put that never answers (timeout), a TimeoutError.
// For each, across representative POST/DELETE handlers:
//   - no 2xx; the exact 503 {ok:false, error, code} + Retry-After
//   - the Blob store stays byte-identical
//   - nothing of the failed work is left in memory or in the local copy, and
//     nothing of it is served afterwards (GET with Blob reads also down)
//   - save() called outside a handler also refuses and drops the work
//   - account unlink-provider (like link-provider) answers 503 and the
//     linked door stays linked in memory, Blob and the local copy
// Then the put recovers: the same handlers succeed with a store put, and the
// final store has the real desk plus the recovered work, none of the failed.
// A separate child runs on the real put deadline (no override) with
// setTimeout/clearTimeout spied: the deadline is exactly 15000 ms, it is
// cleared after a good put and after a failed put, and a put that hangs is
// answered 503 store_write_failed only when that 15000 ms timer fires. The
// store read before it and the read-back after a good put each arm one
// 5000 ms deadline (check-worker-deadline.js covers what those do).
// `node scripts/check-blob-write-fail.js --mutate` breaks the fix in a copy of
// api/ and proves this check catches each break (16 mutants).
// On main 1f45d6a (api/ without the fix) this check fails 57 of its 94
// checks (`node scripts/check-blob-write-fail.js <main>/api`). As first
// written, before the unlink-provider, exact-code and deadline checks, it
// failed 35 of 71 there, not 29.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const KEY = "aia/store.json";
const PIN = "4826";
const TEXT = "The desk can't save right now. Try again in a moment.";
const CODE = "store_write_failed";
const DEADLINE_MS = 15000;
const READ_MS = 5000;
const REAL_DOOR = { provider: "google", subject: "bwf-real-google-sub", email: "real-google@example.test" };
const realSetTimeout = setTimeout;
const FAKE_ENV = {
  VERCEL_ENV: "production",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_FAKESTORE_fakefakefake",
  BLOB_STORE_ID: "store_FAKESTORE",
  AIA_CHECK_PARENT: String(process.pid)
};
const FAULTS = ["throw", "non200", "403", "hang", "timeout-error"];
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

// ---------- fixture: the real code on a plain file store ----------
async function buildFixture(apiDir) {
  require(path.join(apiDir, "_lib.js"));
  await globalThis.__aiaHydrate;
  const call = async (file, req) => {
    const res = fakeRes();
    await require(path.join(apiDir, file + ".js"))(Object.assign({ headers: {}, query: {}, url: "/api/" + file }, req), res);
    return res;
  };
  const slug = "real-desk";
  const owner = { "x-workspace": slug, "x-pin": PIN };
  let r = await call("auth", { method: "POST", body: { slug, biz: "Real Shop", name: "Real Owner", pin: PIN, email: "owner@example.test", password: "Longer-pass-1234" } });
  r = await call("auth", { method: "POST", body: { action: "login", email: "owner@example.test", password: "Longer-pass-1234" } });
  const fx = { slug, token: r.body && r.body.session && r.body.session.token, jobs: [] };
  for (let i = 0; i < 3; i++) {
    r = await call("jobs", { method: "POST", headers: owner, body: { action: "capture", title: "Real card " + i, notes: "real" } });
    fx.jobs.push(r.body && r.body.job && r.body.job.id);
  }
  r = await call("connections", { method: "POST", headers: owner, body: { provider: "webhook", hook: "https://example.test/hook" } });
  fx.conn = r.body && r.body.connection && r.body.connection.id;
  fx.connStatus = r.statusCode;
  r = await call("auth", { method: "POST", headers: { "x-workspace": slug, "x-pin": PIN, "x-session": fx.token, cookie: "aia_session=" + fx.token }, query: { via: "account" }, url: "/api/account", body: Object.assign({ action: "link-provider" }, REAL_DOOR) });
  fx.doorStatus = r.statusCode;
  fx.store = fs.readFileSync(process.env.AIA_STORE_PATH, "utf8");
  process.stdout.write("FIXTURE " + JSON.stringify(fx) + "\n");
}

function rows(fx, tag) {
  const owner = { "x-workspace": fx.slug, "x-pin": PIN, "x-session": fx.token, cookie: "aia_session=" + fx.token };
  const R = [];
  const add = (file, method, label, body, extra) => R.push(Object.assign({ file, method, label, body: body || {}, headers: owner, query: {}, url: "/api/" + file }, extra || {}));
  add("jobs", "POST", "jobs capture", { action: "capture", title: tag + "-capture", notes: tag });
  add("jobs", "POST", "jobs say", { action: "say", id: fx.jobs[0], text: tag + "-say" });
  add("jobs", "POST", "jobs done", { action: "done", id: fx.jobs[1], how: "off-desk", notes: tag + "-done" });
  add("hook", "POST", "hook capture", { event: "capture", title: tag + "-hook" }, { headers: { "x-workspace": fx.slug } });
  add("intake", "POST", "intake start", { action: "start" });
  add("rules", "POST", "rules add", { action: "add", text: "Hold anything over $" + (tag.length * 37) + " for me " + tag });
  add("connections", "DELETE", "connections unbind", {}, { query: { id: fx.conn, workspace: fx.slug } });
  add("admin", "POST", "admin invite", { action: "invite", name: tag + " Invitee", pin: "6161" });
  add("auth", "POST", "auth open", { slug: tag + "-open", biz: tag + "-open", name: "New Owner", pin: PIN }, { headers: {} });
  add("auth", "POST", "auth join", { action: "join", workspace: fx.slug, name: tag + " Joiner", pin: "5150" }, { headers: {} });
  add("auth", "POST", "account details", { action: "details", account: fx.slug, pin: PIN, name: "Real Owner", email: tag.toLowerCase() + "@example.test" }, { query: { via: "account" }, url: "/api/account" });
  add("auth", "POST", "account link-provider", { action: "link-provider", provider: "github", subject: tag + "-gh", email: tag.toLowerCase() + "-gh@example.test" }, { query: { via: "account" }, url: "/api/account" });
  add("auth", "POST", "account unlink-provider", { action: "unlink-provider", provider: REAL_DOOR.provider }, { query: { via: "account" }, url: "/api/account" });
  add("upload", "POST", "upload file", { name: tag + ".png", type: "image/png", data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" });
  return R;
}

// ---------- child: one put fault ----------
function mockBlob(fx) {
  const Module = require("module");
  fs.writeFileSync(process.env.AIA_STORE_PATH, fx.store);
  const st = { files: { [KEY]: fx.store }, putFault: null, readFault: false, puts: 0, other: [] };
  const host = "https://fakestore.private.blob.vercel-storage.com/";
  const nameOf = (k) => String(k || "").replace(/^https?:\/\/[^/]+\//, "").split("?")[0];
  const isStore = (n) => n === KEY || n === "aia-store.json";
  function putFail() {
    const f = st.putFault;
    if (f === "throw") { const e = new Error("read ECONNRESET"); e.code = "ECONNRESET"; throw e; }
    if (f === "non200") throw new Error("Vercel Blob: The blob service is currently not available. Please try again. 500 Internal Server Error");
    if (f === "403") throw new Error("Vercel Blob: Access denied, please provide a valid token for this resource. 403 Forbidden");
    if (f === "timeout-error") { const e = new Error("The operation was aborted due to timeout"); e.name = "TimeoutError"; throw e; }
    if (f === "hang") return new Promise(() => {});
    return null;
  }
  function readFail() {
    if (st.readFault) { const e = new Error("read ECONNRESET"); e.code = "ECONNRESET"; throw e; }
  }
  Module._load = (function (orig) {
    return function (request) {
      if (request === "@vercel/blob") {
        return {
          async head(key) { readFail(); const n = nameOf(key); if (!st.files[n]) throw new Error("Vercel Blob: The requested blob does not exist"); return { pathname: n, url: host + n, downloadUrl: host + n + "?download=1" }; },
          async get(key) { readFail(); const n = nameOf(key); if (!st.files[n]) return null; const raw = st.files[n]; return { statusCode: 200, stream: { text: async () => raw }, blob: { url: host + n } }; },
          async list(opts) { readFail(); const prefix = (opts && opts.prefix) || ""; return { blobs: Object.keys(st.files).filter((n) => n.indexOf(prefix) === 0).map((n) => ({ pathname: n, url: host + n, size: String(st.files[n]).length, uploadedAt: new Date().toISOString() })), hasMore: false }; },
          async put(key, body) {
            const n = nameOf(key);
            if (isStore(n)) { const p = putFail(); if (p) await p; st.puts++; }
            st.files[n] = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
            return { url: host + n, downloadUrl: host + n + "?download=1", pathname: n };
          },
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
    if (!/vercel-storage\.com|vercel\.com\/api\/blob/.test(u)) { st.other.push(u.slice(0, 80)); throw new Error("no network in this check"); }
    if (method !== "GET") {
      const m = u.match(/[?&]pathname=([^&]+)/);
      const n = m ? decodeURIComponent(m[1]) : nameOf(u);
      if (isStore(n) && st.putFault) {
        if (st.putFault === "throw") throw new Error("fetch failed: ECONNRESET");
        if (st.putFault === "hang") return new Promise(() => {});
        if (st.putFault === "timeout-error") throw new Error("The operation was aborted due to timeout");
        const code = st.putFault === "403" ? 403 : 500;
        return { ok: false, status: code, statusText: "fail", url: u, text: async () => JSON.stringify({ error: { code: "fail", message: "put failed " + code } }) };
      }
      if (isStore(n)) st.puts++;
      st.files[n] = Buffer.isBuffer(opts.body) ? opts.body.toString("utf8") : String(opts.body || "");
      return { ok: true, status: 200, url: u, text: async () => JSON.stringify({ url: host + n }) };
    }
    if (st.readFault) throw new Error("fetch failed: ECONNRESET");
    const pm = u.match(/[?&]prefix=([^&]+)/);
    if (pm) {
      const prefix = decodeURIComponent(pm[1]);
      return { ok: true, status: 200, url: u, text: async () => JSON.stringify({ blobs: Object.keys(st.files).filter((n) => n.indexOf(prefix) === 0).map((n) => ({ pathname: n })), hasMore: false }) };
    }
    const n = nameOf(u);
    if (!st.files[n]) return { ok: false, status: 404, statusText: "Not Found", url: u, text: async () => "" };
    const raw = st.files[n];
    return { ok: true, status: 200, url: u, text: async () => raw };
  };
  return st;
}

async function child(apiDir, spec) {
  const fx = spec.fx;
  globalThis.__aiaBlobPutMs = 300;
  const st = mockBlob(fx);
  const lib = require(path.join(apiDir, "_lib.js"));
  await globalThis.__aiaHydrate;
  const out = { trustedAtLoad: lib.storeTrusted(), F: [], R: [] };
  const disk = () => { try { return fs.readFileSync(process.env.AIA_STORE_PATH, "utf8"); } catch (e) { return ""; } };
  async function hit(r) {
    const res = fakeRes();
    const before = st.puts;
    let threw = null;
    const run = require(path.join(apiDir, r.file + ".js"))({ method: r.method, headers: r.headers, query: r.query, url: r.url, body: r.body }, res);
    const capped = await Promise.race([
      Promise.resolve(run).then(() => "done", (e) => { threw = String(e && e.message || e).slice(0, 100); return "threw"; }),
      new Promise((ok) => realSetTimeout(() => ok("hung"), 5000))
    ]);
    const b = (res.body && typeof res.body === "object" ? res.body : (() => { try { return JSON.parse(res.body); } catch (e) { return {}; } })()) || {};
    return { label: r.label, method: r.method, status: capped === "hung" ? "hung" : res.statusCode, threw, body: b, keys: Object.keys(b || {}).sort().join(","), retry: res.headers["Retry-After"] || null, puts: st.puts - before };
  }
  const tagF = "bwfF" + spec.fault.replace(/\W/g, "");
  const has = (s, needle) => String(s || "").toLowerCase().indexOf(String(needle).toLowerCase()) >= 0;
  const memText = () => JSON.stringify(lib.mem);
  const connIn = (text) => has(text, "\"" + fx.conn + "\"");
  const blobText = () => { try { return lib.blobOpen(st.files[KEY]); } catch (e) { return ""; } };
  const doorIn = (text) => has(text, REAL_DOOR.subject);
  out.doorAtStart = { mem: doorIn(memText()), blob: doorIn(blobText()), disk: doorIn(disk()) };
  // A good save first: puts work.
  out.pre = await hit(rows(fx, "bwfPre")[0]);
  const blobBefore = st.files[KEY];
  st.putFault = spec.fault;
  for (const r of rows(fx, tagF)) {
    const x = await hit(r);
    x.blobSame = st.files[KEY] === blobBefore;
    x.memClean = !has(memText(), tagF) && connIn(memText());
    x.diskClean = !has(disk(), tagF) && connIn(disk());
    x.door = { mem: doorIn(memText()), blob: doorIn(blobText()), disk: doorIn(disk()) };
    delete x.body.session;
    out.F.push(x);
  }
  // save() outside any handler, on a store just read again: refuses and
  // drops the work.
  await lib.ready();
  out.direct0 = lib.storeTrusted();
  lib.mem.jobs.unshift({ id: "job_bwfdirect", workspace: fx.slug, title: tagF + "-direct" });
  let direct;
  try { direct = await Promise.race([lib.save(), new Promise((ok) => setTimeout(() => ok("hung"), 5000))]); } catch (e) { direct = "threw"; }
  out.direct = { saved: direct, memClean: !has(memText(), tagF), diskClean: !has(disk(), tagF), blobSame: st.files[KEY] === blobBefore };
  // Afterwards, with Blob reads down too, nothing failed is served.
  st.readFault = true;
  const owner = rows(fx, "x")[0].headers;
  const g = await hit({ file: "jobs", method: "GET", label: "jobs GET", headers: owner, query: {}, url: "/api/jobs", body: {} });
  out.afterGet = { status: g.status, served: has(JSON.stringify(g.body), tagF), memClean: !has(memText(), tagF) };
  const h = await hit({ file: "health", method: "GET", label: "health GET", headers: {}, query: {}, url: "/api/health", body: {} });
  out.afterHealth = { status: h.status, state: h.body && h.body.store && h.body.store.state };
  st.readFault = false;
  // The put recovers.
  st.putFault = null;
  for (const r of rows(fx, "bwfR")) out.R.push(await hit(r));
  const final = (() => { try { return lib.blobOpen(st.files[KEY]); } catch (e) { return ""; } })();
  out.finalDoor = doorIn(final);
  out.final = { real: has(final, "\"real-desk\"") && has(final, "Real card 2"), recovered: has(final, "bwfR-capture") && has(final, "bwfR-hook") && has(final, "bwfPre-capture"), failed: has(final, tagF), conn: connIn(final) };
  out.diskFinal = { recovered: has(disk(), "bwfR-capture"), failed: has(disk(), tagF) };
  out.other = st.other;
  out.F.forEach((x) => { x.body = { ok: x.body.ok, error: x.body.error, code: x.body.code }; });
  out.R.forEach((x) => { x.body = { ok: x.body.ok, error: x.body.error && String(x.body.error).slice(0, 80), code: x.body.code }; });
  process.stdout.write("RESULT " + JSON.stringify(out) + "\n");
  process.exit(0);
}

// ---------- child: the real put deadline, timers spied ----------
// No __aiaBlobPutMs override. Every setTimeout made while a save is in flight
// is recorded; one of 1 s or more is the put deadline. In "hold" mode that
// timer is not scheduled at all: the check fires it by hand, so a hanging put
// can be shown to wait exactly for the 15000 ms timer and then refuse.
async function timerChild(apiDir, spec) {
  const fx = spec.fx;
  const st = mockBlob(fx);
  const lib = require(path.join(apiDir, "_lib.js"));
  await globalThis.__aiaHydrate;
  const realClear = clearTimeout;
  let log = null;
  let hold = false;
  global.setTimeout = function (fn, ms) {
    if (!log) return realSetTimeout.apply(this, arguments);
    const rec = { ms: Number(ms) || 0, cleared: false, fired: false };
    log.push(rec);
    if (hold && rec.ms >= 1000) {
      const h = { held: true, rec, fire() { rec.fired = true; fn(); }, unref() { return h; }, ref() { return h; }, hasRef() { return false; } };
      rec.handle = h;
      return h;
    }
    const args = Array.prototype.slice.call(arguments, 2);
    const t = realSetTimeout(function () { rec.fired = true; return fn.apply(this, args); }, ms);
    rec.handle = t;
    return t;
  };
  global.clearTimeout = function (t) {
    if (log) log.forEach((r) => { if (t && r.handle === t) r.cleared = true; });
    if (t && t.held) return undefined;
    return realClear.apply(this, arguments);
  };
  const owner = rows(fx, "x")[0].headers;
  const pending = Symbol("pending");
  async function capture(tag, fault, holdIt) {
    st.putFault = fault;
    hold = !!holdIt;
    log = [];
    const res = fakeRes();
    const before = st.puts;
    let state = pending;
    const run = Promise.resolve(require(path.join(apiDir, "jobs.js"))({ method: "POST", headers: owner, query: {}, url: "/api/jobs", body: { action: "capture", title: tag, notes: tag } }, res)).then(() => { state = "done"; }, () => { state = "threw"; });
    const out = { fault };
    if (holdIt) {
      await new Promise((ok) => realSetTimeout(ok, 250));
      const held = log.filter((r) => r.handle && r.handle.held);
      out.beforeFire = { pending: state === pending, held: held.map((r) => r.ms), heldCleared: held.map((r) => r.cleared) };
      held.forEach((r) => { if (!r.fired && r.ms === DEADLINE_MS) r.handle.fire(); });
    }
    await Promise.race([run, new Promise((ok) => realSetTimeout(ok, 5000))]);
    const long = log.filter((r) => r.ms >= 1000);
    const b = (res.body && typeof res.body === "object" ? res.body : {}) || {};
    Object.assign(out, { state: state === pending ? "hung" : state, status: res.statusCode, code: b.code || null, ok: b.ok, error: b.error === TEXT, keys: Object.keys(b).sort().join(","), retry: res.headers["Retry-After"] || null, puts: st.puts - before, timers: long.map((r) => ({ ms: r.ms, cleared: r.cleared, fired: r.fired })) });
    log = null;
    hold = false;
    st.putFault = null;
    if (state !== pending) await lib.ready();
    return out;
  }
  const o = {};
  o.ok = await capture("bwfT-ok", null, false);
  o.fail = await capture("bwfT-throw", "throw", false);
  o.hang = await capture("bwfT-hang", "hang", true);
  process.stdout.write("RESULT " + JSON.stringify(o) + "\n");
  process.exit(0);
}

// ---------- parent ----------
function fixture(apiDir) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-bwf-fx-"));
  const env = { PATH: process.env.PATH, HOME: tmp, AIA_STORE_PATH: path.join(tmp, "store.json"), AIA_UPLOAD_DIR: path.join(tmp, "up") };
  const b = spawnSync(process.execPath, [__filename, "--fixture", apiDir], { env, cwd: tmp, encoding: "utf8", timeout: 60000 });
  fs.rmSync(tmp, { recursive: true, force: true });
  const line = String(b.stdout || "").split("\n").find((l) => l.indexOf("FIXTURE ") === 0);
  return line ? JSON.parse(line.slice(8)) : { error: scrub(b.stderr).slice(-300) };
}

function runFault(apiDir, fx, fault, mode) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-bwf-"));
  const env = Object.assign({ PATH: process.env.PATH, HOME: tmp, AIA_STORE_PATH: path.join(tmp, "store.json"), AIA_UPLOAD_DIR: path.join(tmp, "up") }, FAKE_ENV);
  const r = spawnSync(process.execPath, [__filename, mode || "--child", apiDir, JSON.stringify({ fault, fx })], { env, cwd: tmp, encoding: "utf8", timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
  fs.rmSync(tmp, { recursive: true, force: true });
  const line = String(r.stdout || "").split("\n").find((l) => l.indexOf("RESULT ") === 0);
  return line ? JSON.parse(line.slice(7)) : { error: "child gave no result (exit " + r.status + "): " + scrub(r.stderr).slice(-300) };
}

function runAll(apiDir, quiet) {
  const results = [];
  const t = (name, ok, why) => { results.push({ name, ok: !!ok }); if (!quiet) console.log((ok ? "ok   " : "FAIL ") + name + (ok || !why ? "" : " — " + why)); };
  const fx = fixture(apiDir);
  if (fx.error) { t("fixture built", false, fx.error); return results; }
  t("fixture has a session, cards, a pipe and a linked door", !!(fx.token && fx.jobs.every(Boolean) && fx.conn && fx.doorStatus === 200), JSON.stringify({ token: !!fx.token, jobs: fx.jobs, conn: fx.conn, connStatus: fx.connStatus, doorStatus: fx.doorStatus }));
  FAULTS.forEach((fault) => {
    const o = runFault(apiDir, fx, fault);
    const p = "put " + fault + ": ";
    if (o.error) return t(p + "child ran", false, o.error);
    t(p + "store was read at load", o.trustedAtLoad === true);
    t(p + "a save before the fault works (2xx with a put)", o.pre.status >= 200 && o.pre.status < 300 && o.pre.puts >= 1, JSON.stringify(o.pre));
    const two = o.F.filter((x) => !(typeof x.status === "number" && (x.status < 200 || x.status >= 300)));
    t(p + "no POST/DELETE answers 2xx (" + o.F.length + " handlers)", two.length === 0, JSON.stringify(two.slice(0, 4).map((x) => [x.label, x.status, x.threw])));
    const shape = o.F.filter((x) => !(x.status === 503 && x.body.ok === false && x.body.error === TEXT && x.body.code === CODE && x.keys === "code,error,ok" && x.retry));
    t(p + "each is the exact 503 {ok:false, error, code} + Retry-After", shape.length === 0, JSON.stringify(shape.slice(0, 3).map((x) => [x.label, x.status, x.keys, x.body.code, x.retry])));
    const notCode = o.F.filter((x) => x.body.code !== CODE);
    t(p + "every refusal has code exactly " + CODE, notCode.length === 0, JSON.stringify(notCode.slice(0, 3).map((x) => [x.label, x.status, x.body.code])));
    const ul = o.F.find((x) => x.label === "account unlink-provider");
    t(p + "account unlink-provider: 503 " + CODE + ", door still linked in memory, Blob and local copy", o.doorAtStart.mem && o.doorAtStart.blob && o.doorAtStart.disk && ul && ul.status === 503 && ul.body.code === CODE && ul.blobSame && ul.door.mem && ul.door.blob && ul.door.disk, JSON.stringify({ start: o.doorAtStart, row: ul && [ul.status, ul.body.code, ul.blobSame, ul.door] }));
    const doorLost = o.F.filter((x) => !(x.door.mem && x.door.blob && x.door.disk));
    t(p + "the linked door survives every failed write", doorLost.length === 0, JSON.stringify(doorLost.map((x) => [x.label, x.door])));
    const moved = o.F.filter((x) => !x.blobSame);
    t(p + "Blob store byte-identical through the failed writes", moved.length === 0, JSON.stringify(moved.map((x) => x.label)));
    const memLeft = o.F.filter((x) => !x.memClean);
    t(p + "no failed work left in memory after each request", memLeft.length === 0, JSON.stringify(memLeft.map((x) => x.label)));
    const diskLeft = o.F.filter((x) => !x.diskClean);
    t(p + "no failed work in the local /tmp copy", diskLeft.length === 0, JSON.stringify(diskLeft.map((x) => x.label)));
    t(p + "save() outside a handler refuses and drops the work", o.direct0 === true && o.direct.saved === false && o.direct.memClean && o.direct.diskClean && o.direct.blobSame, JSON.stringify(o.direct));
    t(p + "afterwards nothing failed is served (GET, Blob reads down)", !o.afterGet.served && o.afterGet.memClean, JSON.stringify(o.afterGet));
    t(p + "health shows the store not ready after the failed write", o.afterHealth.state === "not-ready", JSON.stringify(o.afterHealth));
    const broke = o.R.filter((x) => !(typeof x.status === "number" && x.status >= 200 && x.status < 300 && x.puts >= 1));
    t(p + "after the put recovers every handler succeeds with a store put", broke.length === 0, JSON.stringify(broke.slice(0, 4).map((x) => [x.label, x.status, x.puts, x.body])));
    t(p + "final store: real desk and recovered work, none of the failed", o.final.real && o.final.recovered && !o.final.failed && !o.final.conn && !o.finalDoor, JSON.stringify(Object.assign({ door: o.finalDoor }, o.final)));
    t(p + "local copy follows Blob after recovery", o.diskFinal.recovered && !o.diskFinal.failed, JSON.stringify(o.diskFinal));
    const stray = (o.other || []).filter((u) => !/api\.decentraweb\.org\/api\/v1\/(?:bridge\/lockDomain\/aia|domain-validation)(?:\?|$)/.test(String(u)));
    t(p + "no non-blob network", stray.length === 0, JSON.stringify(stray));
  });
  const d = runFault(apiDir, fx, null, "--timer");
  const q = "put deadline: ";
  if (d.error) { t(q + "child ran", false, d.error); return results; }
  // Long timers, in order: the store read in ready() (READ_MS), the put
  // (exactly one DEADLINE_MS), then after a good put its read-back (READ_MS).
  const one = (x, want) => x.timers.length === want.length && want.every((ms, i) => x.timers[i].ms === ms) && x.timers.filter((r) => r.ms === DEADLINE_MS).length === 1;
  const OK_TIMERS = [READ_MS, DEADLINE_MS, READ_MS];
  const FAIL_TIMERS = [READ_MS, DEADLINE_MS];
  const allCleared = (x) => x.timers.every((r) => r.cleared && !r.fired);
  t(q + "a good put arms exactly one " + DEADLINE_MS + " ms timer (read " + READ_MS + ", put, read-back " + READ_MS + ")", one(d.ok, OK_TIMERS), JSON.stringify(d.ok.timers));
  t(q + "a good put answers 2xx with a store put", d.ok.state === "done" && d.ok.status >= 200 && d.ok.status < 300 && d.ok.puts >= 1, JSON.stringify([d.ok.state, d.ok.status, d.ok.puts]));
  t(q + "the timer is cleared after a good put", one(d.ok, OK_TIMERS) && allCleared(d.ok), JSON.stringify(d.ok.timers));
  t(q + "a failed put arms exactly one " + DEADLINE_MS + " ms timer (read " + READ_MS + ", put)", one(d.fail, FAIL_TIMERS), JSON.stringify(d.fail.timers));
  t(q + "a failed put answers 503 " + CODE, d.fail.state === "done" && d.fail.status === 503 && d.fail.code === CODE, JSON.stringify([d.fail.state, d.fail.status, d.fail.code]));
  t(q + "the timer is cleared after a failed put", one(d.fail, FAIL_TIMERS) && allCleared(d.fail), JSON.stringify(d.fail.timers));
  t(q + "a hanging put waits on exactly one " + DEADLINE_MS + " ms timer (the read's " + READ_MS + " ms one already cleared)", d.hang.beforeFire.pending && d.hang.beforeFire.held.length === 2 && d.hang.beforeFire.held[0] === READ_MS && d.hang.beforeFire.heldCleared[0] === true && d.hang.beforeFire.held[1] === DEADLINE_MS && d.hang.beforeFire.heldCleared[1] === false, JSON.stringify(d.hang.beforeFire));
  t(q + "when it fires the answer is the exact 503 " + CODE + " + Retry-After", d.hang.state === "done" && d.hang.status === 503 && d.hang.code === CODE && d.hang.ok === false && d.hang.error && d.hang.keys === "code,error,ok" && d.hang.retry && d.hang.puts === 0, JSON.stringify(d.hang));
  return results;
}

const MUTANTS = [
  { id: "M1 save ignores a failed blobWrite", file: "_lib.js", from: "if (!ok && blobProbe.write === \"fail\") return storeWriteFailed();", to: "" },
  { id: "M2 failed write keeps the store trusted", file: "_lib.js", from: "function storeWriteFailed() {\n  mem.storeSeen = false;\n  mem.storeAbsent = false;\n", to: "function storeWriteFailed() {\n" },
  { id: "M3 failed write not marked on the request", file: "_lib.js", from: "  noteSkipped(\"writeFailed\");\n  noteSkipped(\"skipped\");\n", to: "" },
  { id: "M4 failed write keeps unsaved memory (save() itself)", file: "_lib.js", from: "  noteSkipped(\"skipped\");\n  forgetUnsaved();\n  return false;\n}", to: "  noteSkipped(\"skipped\");\n  return false;\n}" },
  { id: "M5 local copy written before the Blob put", file: "_lib.js", from: "keep it either.\n    const ok = await blobWrite();\n", to: "keep it either.\n    writeDisk();\n    const ok = await blobWrite();\n" },
  { id: "M6 refusal body keeps the handler's success body", file: "_lib.js", from: "const out = ctx.writeFailed\n", to: "const out = false\n" },
  { id: "M7 refusal without Retry-After", file: "_lib.js", from: "        if (typeof res.setHeader === \"function\") res.setHeader(\"Retry-After\", \"5\");\n        const base", to: "        const base" },
  { id: "M8 no deadline on the store put", file: "_lib.js", from: "await blobPutDeadline(blobPutStore(body));", to: "await blobPutStore(body);" },
  { id: "M9 account doors do not await save", file: "_account-doors.js", from: "await hooks.save();", to: "hooks.save();", all: true },
  { id: "M10 blobWrite reports a failed put as written", file: "_lib.js", from: "    blobProbe.detail = why && why !== \"[object Object]\" ? why : \"blob-fail\";\n    return false;", to: "    blobProbe.detail = why && why !== \"[object Object]\" ? why : \"blob-fail\";\n    return true;" },
  { id: "M11 recovery never re-reads (stays not-ready)", file: "_lib.js", from: "  if (!globalThis.__aiaStoreLoaded) return false;\n  try {\n", to: "  return false;\n  try {\n" },
  { id: "M12 put deadline 30 s", file: "_lib.js", from: "const BLOB_PUT_MS = 15000;", to: "const BLOB_PUT_MS = 30000;" },
  { id: "M13 refusal code store_not_ready", file: "_lib.js", from: "const STORE_WRITE_FAILED_CODE = \"store_write_failed\";", to: "const STORE_WRITE_FAILED_CODE = \"store_not_ready\";" },
  { id: "M14 unlink-provider does not await save", file: "_account-doors.js", from: "  acc.identities = next;\n  if (typeof hooks.save === \"function\") await hooks.save();", to: "  acc.identities = next;\n  if (typeof hooks.save === \"function\") hooks.save();" },
  { id: "M15 put deadline timer never cleared", file: "_lib.js", from: "  return Promise.race([job, late]).finally(() => clearTimeout(timer));", to: "  return Promise.race([job, late]);" },
  { id: "M16 put deadline 1 s", file: "_lib.js", from: "const BLOB_PUT_MS = 15000;", to: "const BLOB_PUT_MS = 1000;" }
];

function mutate() {
  let caught = 0;
  MUTANTS.forEach((m) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-bwf-mut-"));
    const api = path.join(tmp, "api");
    fs.cpSync(path.join(ROOT, "api"), api, { recursive: true });
    const f = path.join(api, m.file);
    const src = fs.readFileSync(f, "utf8");
    if (src.split(m.from).length !== 2 && !m.all) { console.log("FAIL mutant " + m.id + ": anchor not found exactly once"); fs.rmSync(tmp, { recursive: true, force: true }); return; }
    fs.writeFileSync(f, m.all ? src.split(m.from).join(m.to) : src.replace(m.from, m.to));
    const bad = runAll(api, true).filter((c) => !c.ok);
    fs.rmSync(tmp, { recursive: true, force: true });
    if (bad.length) { caught++; console.log("caught  " + m.id + " (" + bad.length + " checks fail, e.g. " + bad[0].name + ")"); }
    else console.log("MISSED  " + m.id);
  });
  console.log(caught + "/" + MUTANTS.length + " mutants caught");
  return caught === MUTANTS.length;
}

const childErr = (e) => { console.error(scrub(e && e.stack || e)); process.exit(2); };
if (process.argv[2] === "--fixture") buildFixture(process.argv[3]).catch(childErr);
else if (process.argv[2] === "--child") child(process.argv[3], JSON.parse(process.argv[4])).catch(childErr);
else if (process.argv[2] === "--timer") timerChild(process.argv[3], JSON.parse(process.argv[4])).catch(childErr);
else {
  const apiDir = path.resolve(process.argv[2] && process.argv[2].indexOf("--") !== 0 ? process.argv[2] : path.join(ROOT, "api"));
  const res = runAll(apiDir);
  const failed = res.filter((c) => !c.ok).length;
  console.log((res.length - failed) + " ok, " + failed + " FAIL");
  let ok = failed === 0;
  if (process.argv.includes("--mutate")) ok = mutate() && ok;
  if (!ok) { console.error("check-blob-write-fail failed"); process.exit(1); }
  console.log("check-blob-write-fail passed");
}
