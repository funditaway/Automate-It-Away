#!/usr/bin/env node
require("./_env-guard");
// Module load and auth open/register must never write the empty starter store
// over a store they did not really read. Stand-in @vercel/blob and fetch, fake
// tokens, no network, no production. One child process per case so each one
// is a clean module load.
// Faults at module load: empty body, false 404 (with and without a working
// listing), 403, 500, reset, timeout, bad JSON. After each: auth open and
// auth register (and account open) must get a 5xx, zero writes, and the real
// store stays byte-identical. Then the fault clears: a normal load works and
// open/register succeed on top of the real store. A genuine fresh install
// (listing proves the store absent) still writes the starter once.
// Also: /api/health store.state (read / absent-proven / not-ready) and its
// puts; store names (live aia/store.json, legacy aia-store.json never
// written); and every saving route and action in api/*.js (owner and
// anonymous, stale /tmp copy and cold instance) -- see the routes section.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const KEY = "aia/store.json";
const REST_KEY = "aia-store.json";
const PIN = "4826";
// The one not-ready answer every page shows as-is.
const NOT_READY = "The desk can't save right now. Try again in a moment.";
const NOT_READY_CODE = "store_not_ready";
const PAUSED_LINE = "Saving is paused: this desk couldn't read its store.";
const FAKE_ENV = {
  VERCEL_ENV: "production",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_FAKESTORE_fakefakefake",
  BLOB_STORE_ID: "store_FAKESTORE",
  AIA_CHECK_PARENT: String(process.pid)
};
const REAL = JSON.stringify({
  account: { id: "aia", name: "Automate It Away" },
  accounts: [{ id: "acct_real", name: "Real Shop", ownerName: "Real Owner", slug: "real-desk" }],
  workspaces: [{ slug: "real-desk", name: "Real Owner", biz: "Real Shop", people: [{ id: "p_real", name: "Real Owner", role: "owner" }] }],
  jobs: [{ id: "job_real1", workspace: "real-desk", title: "Real lot", status: "open" }],
  sessions: [], approvals: [], locks: [], connections: [], audit: [], money: [], inbox: [], files: [], tickets: [], packs: [], mail: [], migrations: {}
});
// A different, stale store under the legacy name.
const LEGACY_OTHER = JSON.stringify({
  account: { id: "aia", name: "Automate It Away" },
  accounts: [], workspaces: [{ slug: "legacy-desk", name: "Old", biz: "Old", people: [] }],
  jobs: [{ id: "job_legacy1", workspace: "legacy-desk", title: "Old lot", status: "open" }],
  sessions: [], approvals: [], locks: [], connections: [], audit: [], money: [], inbox: [], files: [], tickets: [], packs: [], mail: [], migrations: {}
});
const CASES = [
  { id: "empty-body", fault: "empty" },
  { id: "false-404", fault: "false404" },
  { id: "false-404-list-down", fault: "false404", listDown: true },
  // A listing page that says hasMore proves nothing about the rest.
  { id: "false-404-list-hasmore", fault: "false404", listHasMore: true },
  // The real store lives only under the legacy REST name aia-store.json
  // (the name the REST path uses when the SDK is denied).
  { id: "false-404-legacy-name", fault: "false404", legacy: true, sdkDenied: true },
  { id: "403", fault: "403" },
  { id: "500", fault: "500" },
  { id: "reset", fault: "reset" },
  { id: "timeout", fault: "timeout" },
  { id: "bad-json", fault: "badjson" }
];

// ---------------- child ----------------
async function child(apiDir, spec) {
  const Module = require("module");
  const st = { files: {}, fault: spec.fault, listDown: !!spec.listDown, listHasMore: !!spec.listHasMore, sdkDenied: !!spec.sdkDenied, writes: [], reads: [], other: [] };
  const LIVE = spec.legacy ? REST_KEY : KEY;
  const SPARE = spec.legacy ? KEY : REST_KEY;
  if (spec.fresh !== true) st.files[LIVE] = REAL;
  if (spec.names === "both") st.files[REST_KEY] = LEGACY_OTHER;
  const legacyBytes = st.files[REST_KEY];
  const host = "https://fakestore.private.blob.vercel-storage.com/";
  const nameOf = (k) => String(k || "").replace(/^https?:\/\/[^/]+\//, "").split("?")[0];
  function sdkFail(op) {
    const f = st.fault;
    if (f === "403") throw new Error("Vercel Blob: Access denied, please provide a valid token for this resource. 403 Forbidden");
    if (f === "500") throw new Error("Vercel Blob: Failed to fetch blob: 500 Internal Server Error");
    if (f === "reset") { const e = new Error("read ECONNRESET"); e.code = "ECONNRESET"; throw e; }
    if (f === "timeout") { const e = new Error("The operation was aborted due to timeout"); e.name = "TimeoutError"; throw e; }
    if (st.sdkDenied) throw new Error("Vercel Blob: Access denied, please provide a valid token for this resource. 403 Forbidden");
    if (op === "list" && st.listDown) throw new Error("Vercel Blob: Failed to list blobs: 500 Internal Server Error");
  }
  function bodyOf(name) {
    if (st.fault === "empty") return "";
    if (st.fault === "badjson") return "{\"workspaces\": [tru";
    return st.files[name];
  }
  Module._load = (function (orig) {
    return function (request) {
      if (request === "@vercel/blob") {
        return {
          async head(key) {
            sdkFail("head");
            const n = nameOf(key);
            st.reads.push("sdk:" + n);
            if (st.fault === "false404" || !st.files[n]) throw new Error("Vercel Blob: The requested blob does not exist");
            return { pathname: n, url: host + n, downloadUrl: host + n + "?download=1" };
          },
          async get(key) {
            sdkFail("get");
            const n = nameOf(key);
            st.reads.push("sdk:" + n);
            if (st.fault === "false404" || !st.files[n]) return null;
            const raw = bodyOf(n);
            return { statusCode: 200, stream: { text: async () => raw }, blob: { url: host + n } };
          },
          async list(opts) {
            sdkFail("list");
            const prefix = (opts && opts.prefix) || "";
            if (st.listHasMore) return { blobs: [], hasMore: true, cursor: "next" };
            return { blobs: Object.keys(st.files).filter((n) => n.indexOf(prefix) === 0).map((n) => ({ pathname: n, url: host + n })), hasMore: false };
          },
          async put(key, body) {
            sdkFail("put");
            st.writes.push("sdk:" + key);
            st.files[nameOf(key)] = String(body);
            return { url: host + nameOf(key), downloadUrl: host + nameOf(key) + "?download=1" };
          },
          async del(key) { st.writes.push("del:" + key); delete st.files[nameOf(key)]; },
          async copy(a, b) { st.writes.push("copy:" + b); return { url: host + b }; }
        };
      }
      return orig.apply(this, arguments);
    };
  })(Module._load);
  global.fetch = async function (url, opts) {
    const u = String(url || "");
    const method = String((opts && opts.method) || "GET").toUpperCase();
    if (!/vercel-storage\.com|vercel\.com\/api\/blob/.test(u)) { st.other.push(u); throw new Error("no network in this check: " + u); }
    if (method !== "GET") {
      const m = u.match(/[?&]pathname=([^&]+)/);
      const n = m ? decodeURIComponent(m[1]) : nameOf(u);
      st.writes.push("rest:" + n);
      st.files[n] = Buffer.isBuffer(opts.body) ? opts.body.toString("utf8") : String(opts.body || "");
      return { ok: true, status: 200, url: u, text: async () => JSON.stringify({ url: host + n }) };
    }
    const f = st.fault;
    if (f === "reset" || f === "timeout") throw new Error(f === "reset" ? "fetch failed: ECONNRESET" : "The operation was aborted due to timeout");
    if (f === "403") return { ok: false, status: 403, statusText: "Forbidden", url: u, text: async () => "Forbidden" };
    if (f === "500") return { ok: false, status: 500, statusText: "Internal Server Error", url: u, text: async () => "boom" };
    const pm = u.match(/[?&]prefix=([^&]+)/);
    if (pm) {
      if (st.listDown) return { ok: false, status: 500, url: u, text: async () => "list down" };
      if (st.listHasMore) return { ok: true, status: 200, url: u, text: async () => JSON.stringify({ blobs: [], hasMore: true, cursor: "next" }) };
      const prefix = decodeURIComponent(pm[1]);
      return { ok: true, status: 200, url: u, text: async () => JSON.stringify({ blobs: Object.keys(st.files).filter((n) => n.indexOf(prefix) === 0).map((n) => ({ pathname: n })), hasMore: false }) };
    }
    const n = nameOf(u);
    st.reads.push("rest:" + n);
    if (f === "false404" || !st.files[n]) return { ok: false, status: 404, statusText: "Not Found", url: u, text: async () => "" };
    const raw = bodyOf(n);
    return { ok: true, status: 200, url: u, text: async () => raw };
  };
  const legacyReads = () => st.reads.filter((r) => /(^|:)aia-store\.json$/.test(r)).length;

  const out = { steps: [] };
  let seen = 0;
  const note = (name, extra) => out.steps.push(Object.assign({ name, writes: st.writes.slice(seen, (seen = st.writes.length)), real: spec.fresh ? null : st.files[LIVE] === REAL && !st.files[SPARE] }, extra || {}));
  const lib = require(path.join(apiDir, "_lib.js"));
  try { await globalThis.__aiaHydrate; } catch (e) { out.hydrateThrew = String(e && e.message || e); }
  note("module load");
  const auth = require(path.join(apiDir, "auth.js"));
  async function call(body, query) {
    const res = fakeRes();
    try {
      await auth({ method: "POST", headers: {}, query: query || {}, url: query && query.via === "account" ? "/api/account" : "/api/auth", body }, res);
    } catch (e) {
      res.statusCode = 500; res.body = { threw: String(e && e.message || e).slice(0, 120) };
    }
    return { status: res.statusCode, ok: !!(res.body && res.body.ok), error: res.body && res.body.error, code: res.body && res.body.code, retry: res.headers["Retry-After"] || null };
  }
  async function healthGet() {
    const res = fakeRes();
    try { await require(path.join(apiDir, "health.js"))({ method: "GET", headers: {}, query: {}, url: "/api/health" }, res); } catch (e) { res.statusCode = 500; }
    const b = res.body && typeof res.body === "object" ? res.body : {};
    return { status: res.statusCode, state: b.store && b.store.state, saving: b.store && b.store.saving, error: b.error };
  }
  const open = (slug) => call({ slug, biz: slug, name: "New Owner", pin: PIN });
  const register = (slug) => call({ action: "register", slug, biz: slug, name: "New Owner", pin: PIN });
  if (spec.proof) {
    // Legacy-only store, live name really absent, but the listing cannot
    // prove it (down or hasMore). The legacy copy must not be read or moved.
    note("health while unproven", await healthGet());
    note("auth open while unproven", await open("proof-open"));
    out.legacyReadsUnproven = legacyReads();
    out.legacyMarked = !!lib.mem.storeLegacy;
    out.liveWritesUnproven = st.writes.filter((w) => /(^|:)aia\/store\.json$/.test(w)).length;
    st.listDown = false; st.listHasMore = false;
    note("auth open after listing heals", await open("proof-open2"));
    note("health after listing heals", await healthGet());
    out.legacySame = st.files[REST_KEY] === legacyBytes;
    out.legacyPuts = st.writes.filter((w) => /(^|:)aia-store\.json$/.test(w)).length;
    out.liveWrites = st.writes.filter((w) => /(^|:)aia\/store\.json$/.test(w)).length;
  } else if (spec.names) {
    note("health after load", await healthGet());
    note("auth open", await open("name-open"));
    out.legacyReads = legacyReads();
    out.legacySame = st.files[REST_KEY] === legacyBytes;
    out.legacyPuts = st.writes.filter((w) => /(^|:)aia-store\.json$/.test(w)).length;
    out.liveWrites = st.writes.filter((w) => /(^|:)aia\/store\.json$/.test(w)).length;
  } else if (spec.cleanOnly) {
    note("health after clean load", await healthGet());
    note("auth open after clean load", await open("clean-open"));
  } else if (!spec.fresh) {
    note("health while not ready", await healthGet());
    note("auth open after failed load", await open("new-open"));
    note("auth register after failed load", await register("new-reg"));
    note("account open after failed load", await call({ action: "open", account: "real-desk", pin: PIN }, { via: "account" }));
    // Any other handler that saves after a failed load: save() itself refuses.
    lib.mem.workspaces.unshift({ slug: "via-save", people: [] });
    let saved;
    try { saved = await lib.save(); } catch (e) { saved = "threw"; }
    lib.mem.workspaces = lib.mem.workspaces.filter((w) => w && w.slug !== "via-save");
    note("save() after failed load", { saved });
    st.fault = null; st.listDown = false; st.listHasMore = false;
    note("auth open after recovery", await open("new-open2"));
    note("auth register after recovery", await register("new-reg2"));
    note("health after recovery", await healthGet());
  } else {
    note("health on fresh install", await healthGet());
    note("auth open on fresh install", await open("fresh-open"));
    note("auth register on fresh install", await register("fresh-reg"));
  }
  let final = null;
  try { final = JSON.parse(lib.blobOpen((spec.names || spec.proof ? st.files[KEY] : (st.files[KEY] || st.files[REST_KEY])) || "null")); } catch (e) { final = "unparsed"; }
  out.finalSlugs = final && Array.isArray(final.workspaces) ? final.workspaces.map((w) => w && w.slug) : null;
  out.finalJobs = final && Array.isArray(final.jobs) ? final.jobs.map((j) => j && j.id) : null;
  out.other = st.other;
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

// ---------------- parent ----------------
function run(apiDir, spec) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-noblind-"));
  const env = Object.assign({ PATH: process.env.PATH, HOME: tmp, AIA_STORE_PATH: path.join(tmp, "store.json"), AIA_UPLOAD_DIR: path.join(tmp, "up") }, FAKE_ENV);
  const r = spawnSync(process.execPath, [__filename, "--child", apiDir, JSON.stringify(spec)], { env, cwd: tmp, encoding: "utf8", timeout: 60000 });
  fs.rmSync(tmp, { recursive: true, force: true });
  const line = String(r.stdout || "").split("\n").find((l) => l.indexOf("RESULT ") === 0);
  if (!line) return { error: "child gave no result (exit " + r.status + "): " + String(r.stderr || "").replace(/vercel_blob_rw_\w+/g, "[token]").slice(-300) };
  return JSON.parse(line.slice(7));
}

function main() {
  const apiDir = path.resolve(process.argv[2] || path.join(__dirname, "..", "api"));
  const fails = [];
  let n = 0;
  const t = (name, ok, why) => { n++; if (ok) console.log("ok   " + name); else { console.log("FAIL " + name + (why ? " — " + why : "")); fails.push(name); } };
  const storeWrites = (w) => w.filter((x) => /aia\/store\.json|aia-store\.json/.test(x));
  // With #341 stacked, health never saves at all. Without it, health's old
  // save() probe still writes once on a trusted store (341 removes it); the
  // new state field itself never adds a put, and nothing is ever put while
  // the store is not ready.
  const healthSaves = /await save\(\)/.test(fs.readFileSync(path.join(apiDir, "health.js"), "utf8"));
  const healthPutsOk = (s) => storeWrites(s.writes || []).length <= (healthSaves ? 1 : 0);
  const healthState = (label, s, want) => {
    t(label + ": health shows store state " + want, s.state === want, JSON.stringify({ status: s.status, state: s.state }));
    t(label + ": health saving line matches", want === "not-ready" ? s.saving === PAUSED_LINE : s.saving === "Saving is on.", JSON.stringify(s.saving));
  };
  CASES.forEach((c) => {
    const o = run(apiDir, c);
    if (o.error) return t(c.id + ": child ran", false, o.error);
    const step = (name) => o.steps.find((s) => s.name === name) || { writes: [], real: false };
    const load = step("module load");
    t(c.id + ": module load writes nothing to the store", storeWrites(load.writes).length === 0, "writes " + JSON.stringify(load.writes));
    t(c.id + ": real store byte-identical after module load", load.real);
    ["auth open after failed load", "auth register after failed load", "account open after failed load"].forEach((name) => {
      const s = step(name);
      t(c.id + ": " + name + " gets a 5xx", s.status >= 500 && s.status < 600, "status " + s.status + " " + JSON.stringify(s.error || ""));
      t(c.id + ": " + name + " is the one not-ready JSON (exact error, code, Retry-After)", s.status === 503 && s.error === NOT_READY && s.code === NOT_READY_CODE && !!s.retry, JSON.stringify({ status: s.status, error: s.error, code: s.code, retry: s.retry }));
      t(c.id + ": " + name + " writes nothing", storeWrites(s.writes).length === 0, "writes " + JSON.stringify(s.writes));
      t(c.id + ": real store byte-identical after " + name, s.real);
    });
    const hn = step("health while not ready");
    healthState(c.id + " (not ready)", hn, "not-ready");
    t(c.id + ": health while not ready puts nothing", storeWrites(hn.writes).length === 0 && hn.real, JSON.stringify(hn.writes));
    const hr = step("health after recovery");
    healthState(c.id + " (recovered)", hr, "read");
    t(c.id + ": health after recovery adds no put of its own", healthPutsOk(hr), JSON.stringify(hr.writes));
    const sv = step("save() after failed load");
    t(c.id + ": save() after failed load refuses (false)", sv.saved === false, "returned " + JSON.stringify(sv.saved));
    t(c.id + ": save() after failed load writes nothing", storeWrites(sv.writes).length === 0, "writes " + JSON.stringify(sv.writes));
    t(c.id + ": real store byte-identical after save()", sv.real);
    const o2 = step("auth open after recovery");
    const r2 = step("auth register after recovery");
    t(c.id + ": auth open succeeds after recovery", o2.status === 201 && o2.ok, "status " + o2.status + " " + JSON.stringify(o2.error || ""));
    t(c.id + ": auth register succeeds after recovery", r2.status === 201 && r2.ok, "status " + r2.status + " " + JSON.stringify(r2.error || ""));
    const slugs = o.finalSlugs || [];
    t(c.id + ": store keeps the real desk and gains the new ones",
      slugs.indexOf("real-desk") >= 0 && slugs.indexOf("new-open2") >= 0 && slugs.indexOf("new-reg2") >= 0 && slugs.indexOf("new-open") < 0 && slugs.indexOf("new-reg") < 0 && slugs.indexOf("via-save") < 0 && (o.finalJobs || []).indexOf("job_real1") >= 0,
      "slugs " + JSON.stringify(slugs));
    t(c.id + ": no non-blob network", (o.other || []).length === 0, JSON.stringify(o.other));
  });
  // A clean module load of the real store: reads it, writes nothing.
  const clean = run(apiDir, { fault: null, cleanOnly: true });
  if (clean.error) t("clean load: child ran", false, clean.error);
  else {
    const load = clean.steps[0];
    t("clean load: module load writes nothing", storeWrites(load.writes).length === 0, JSON.stringify(load.writes));
    const hc = clean.steps.find((s) => s.name === "health after clean load") || {};
    healthState("clean load", hc, "read");
    t("clean load: health adds no put of its own", healthPutsOk(hc), JSON.stringify(hc.writes));
    const op = clean.steps.find((s) => s.name === "auth open after clean load");
    t("clean load: auth open succeeds", op && op.status === 201, "status " + (op && op.status));
    t("clean load: store keeps the real desk", (clean.finalSlugs || []).indexOf("real-desk") >= 0 && (clean.finalSlugs || []).indexOf("clean-open") >= 0, JSON.stringify(clean.finalSlugs));
  }
  // Genuine fresh install: listing proves no store, so the starter goes up once.
  // Also with the SDK denied, where the proof and the write go through REST.
  [{ id: "fresh install", fresh: true }, { id: "fresh install (SDK denied, REST)", fresh: true, sdkDenied: true }].forEach((f) => {
    const fresh = run(apiDir, { fault: null, fresh: true, sdkDenied: !!f.sdkDenied });
    if (fresh.error) return t(f.id + ": child ran", false, fresh.error);
    const load = fresh.steps[0];
    t(f.id + ": module load writes the starter exactly once", storeWrites(load.writes).length === 1, JSON.stringify(load.writes));
    const hf = fresh.steps.find((s) => s.name === "health on fresh install") || {};
    healthState(f.id, hf, "absent-proven");
    t(f.id + ": health adds no put of its own", healthPutsOk(hf), JSON.stringify(hf.writes));
    const fo = fresh.steps.find((s) => s.name === "auth open on fresh install");
    const fr = fresh.steps.find((s) => s.name === "auth register on fresh install");
    t(f.id + ": auth open succeeds", fo && fo.status === 201, "status " + (fo && fo.status) + " " + JSON.stringify(fo && fo.error || ""));
    t(f.id + ": auth register succeeds", fr && fr.status === 201, "status " + (fr && fr.status) + " " + JSON.stringify(fr && fr.error || ""));
    const slugs = fresh.finalSlugs || [];
    t(f.id + ": store holds both new desks", slugs.indexOf("fresh-open") >= 0 && slugs.indexOf("fresh-reg") >= 0, JSON.stringify(slugs));
  });
  // Store names. Live is aia/store.json; aia-store.json is a legacy leftover
  // that is never written. Both present (different contents): load and save
  // the live copy. Legacy only: load it read-only, the first save goes to the
  // live name. SDK path and REST path (SDK denied).
  [
    { id: "both names (SDK)", names: "both" },
    { id: "both names (SDK denied, REST)", names: "both", sdkDenied: true },
    // Live present: it loads straight away, whatever the listing says.
    { id: "both names, listing down (SDK)", names: "both", listDown: true },
    { id: "both names, listing down (SDK denied, REST)", names: "both", sdkDenied: true, listDown: true },
    { id: "both names, listing hasMore (SDK)", names: "both", listHasMore: true },
    { id: "both names, listing hasMore (SDK denied, REST)", names: "both", sdkDenied: true, listHasMore: true },
    { id: "legacy only (SDK)", names: "legacy", legacy: true },
    { id: "legacy only (SDK denied, REST)", names: "legacy", legacy: true, sdkDenied: true }
  ].forEach((nc) => {
    const o = run(apiDir, { fault: null, names: nc.names, legacy: !!nc.legacy, sdkDenied: !!nc.sdkDenied, listDown: !!nc.listDown, listHasMore: !!nc.listHasMore });
    if (o.error) return t(nc.id + ": child ran", false, o.error);
    const load = o.steps[0];
    const h = o.steps.find((x) => x.name === "health after load") || {};
    const op = o.steps.find((x) => x.name === "auth open") || {};
    t(nc.id + ": module load writes nothing", storeWrites(load.writes).length === 0, JSON.stringify(load.writes));
    t(nc.id + ": store is trusted (read)", h.state === "read", JSON.stringify({ state: h.state }));
    t(nc.id + ": auth open succeeds", op.status === 201, "status " + op.status + " " + JSON.stringify(op.error || ""));
    const slugs = o.finalSlugs || [];
    t(nc.id + ": the save went to aia/store.json and holds the real desk plus the new one", o.liveWrites >= 1 && slugs.indexOf("real-desk") >= 0 && slugs.indexOf("name-open") >= 0 && slugs.indexOf("legacy-desk") < 0, JSON.stringify({ live: o.liveWrites, slugs }));
    t(nc.id + ": legacy aia-store.json untouched (0 puts, byte-identical)", o.legacyPuts === 0 && o.legacySame === true, JSON.stringify({ puts: o.legacyPuts, same: o.legacySame }));
    if (nc.names === "both") t(nc.id + ": live present, legacy aia-store.json never read", o.legacyReads === 0, JSON.stringify({ legacyReads: o.legacyReads }));
  });
  // Legacy-only store, live aia/store.json really absent, but the listing does
  // not prove it: listing down, or a page that says hasMore. Without that
  // proof the legacy copy is never read or moved (SDK path and REST get path),
  // the store stays not-ready, and nothing is put. Once the listing proves
  // the live name absent, the legacy copy loads and the save goes live.
  [
    { id: "legacy only, listing down (SDK)", listDown: true },
    { id: "legacy only, listing down (SDK denied, REST)", listDown: true, sdkDenied: true },
    { id: "legacy only, listing hasMore (SDK)", listHasMore: true },
    { id: "legacy only, listing hasMore (SDK denied, REST)", listHasMore: true, sdkDenied: true }
  ].forEach((pc) => {
    const o = run(apiDir, { fault: null, proof: true, names: null, legacy: true, sdkDenied: !!pc.sdkDenied, listDown: !!pc.listDown, listHasMore: !!pc.listHasMore });
    if (o.error) return t(pc.id + ": child ran", false, o.error);
    const step = (name) => o.steps.find((s) => s.name === name) || { writes: [], real: false };
    const load = step("module load");
    const h = step("health while unproven");
    const op = step("auth open while unproven");
    t(pc.id + ": module load writes nothing", storeWrites(load.writes).length === 0, JSON.stringify(load.writes));
    t(pc.id + ": no legacy read without proof the live name is absent", o.legacyReadsUnproven === 0 && !o.legacyMarked, JSON.stringify({ legacyReads: o.legacyReadsUnproven, legacy: o.legacyMarked }));
    healthState(pc.id + " (unproven)", h, "not-ready");
    t(pc.id + ": auth open while unproven is the one not-ready JSON", op.status === 503 && op.error === NOT_READY && op.code === NOT_READY_CODE && !!op.retry, JSON.stringify({ status: op.status, error: op.error, code: op.code }));
    t(pc.id + ": nothing put while unproven (no move to aia/store.json)", o.liveWritesUnproven === 0 && storeWrites(h.writes).length === 0 && storeWrites(op.writes).length === 0 && op.real, JSON.stringify({ live: o.liveWritesUnproven, h: h.writes, op: op.writes }));
    const op2 = step("auth open after listing heals");
    const h2 = step("health after listing heals");
    t(pc.id + ": after the listing proves live absent, auth open succeeds", op2.status === 201, "status " + op2.status + " " + JSON.stringify(op2.error || ""));
    healthState(pc.id + " (proven)", h2, "read");
    const slugs = o.finalSlugs || [];
    t(pc.id + ": the save went to aia/store.json with the real desk plus the new one only", o.liveWrites >= 1 && slugs.indexOf("real-desk") >= 0 && slugs.indexOf("proof-open2") >= 0 && slugs.indexOf("proof-open") < 0, JSON.stringify({ live: o.liveWrites, slugs }));
    t(pc.id + ": legacy aia-store.json untouched (0 puts, byte-identical)", o.legacyPuts === 0 && o.legacySame === true, JSON.stringify({ puts: o.legacyPuts, same: o.legacySame }));
    t(pc.id + ": no non-blob network", (o.other || []).length === 0, JSON.stringify(o.other));
  });
  routesMain(apiDir, t);
  if (fails.length) {
    console.log("check-no-blind-starter-write failed: " + fails.length + " of " + n + " (first: " + fails[0] + ")");
    process.exit(1);
  }
  console.log("check-no-blind-starter-write passed (" + n + " checks)");
}

// ======================================================================
// Every saving route and action. While the store is not trusted (each
// fault above), every POST/PUT/PATCH/DELETE route and action must answer
// 5xx, never 2xx, with zero store puts, and the real store stays
// byte-identical. The disk copy here holds the real desk, a live owner
// session and real job ids, so a handler without the guard WOULD answer 2xx
// (the dangerous case: a warm /tmp copy). Any GET whose save() is refused
// must not answer 2xx either. After the fault clears, the same routes run
// on the recovered store: no not-ready answer, every key action
// succeeds with a store put, and no POST/PUT/PATCH/DELETE answers 2xx
// without a store put unless it is a listed read-only action that put
// nothing. Unsaved work from the failed phase never reaches the store.
// ======================================================================
const OWNER_PIN = "4826";
const HELPER = { name: "Helper Hal", pin: "7391" };
const JOB_ACTIONS = ["kill", "qualify", "recommend", "say", "reply", "ask", "fill", "schedule", "due", "expire", "snooze", "ship", "bind-ai", "assign", "carry", "done", "hand", "priority", "uncap", "hook-update", "hook-do", "hook-done", "hook-hand", "hook-collect", "hook-kill", "hook-stop"];
// POST actions that only read (or only answer from memory). After recovery
// they may answer 2xx without a store put, and must put nothing.
const READ_ONLY = [
  "jobs suggest", "connections pipe-search", "connections pipe-ask", "connections pipe-start", "connections ai-start", "admin pro", "admin find", "admin world-who", "admin invites", "admin mine", "admin person",
  "account sessions", "account export", "account mail", "account aia-quote", "account reviewer", "account mfa",
  "desks search", "desks list", "desks mine", "desks history", "desks priority", "desks explore", "desks gone", "desks mail",
  "migrate-uploads dry-run"
];

function routeTable(fx, phase) {
  const tag = phase === "A" ? "phaseA" : "phaseB";
  const J = (a) => fx.jobs[a];
  const owner = { "x-workspace": fx.slug, "x-pin": OWNER_PIN, "x-session": fx.token, cookie: "aia_session=" + fx.token };
  const R = [];
  const add = (route, file, method, label, body, extra) => R.push(Object.assign({ route, file, method, label, body: body || {}, headers: owner, query: {} }, extra || {}));
  // /api/jobs
  add("jobs", "jobs", "POST", "capture", { action: "capture", title: tag + "-capture", notes: tag });
  add("jobs", "jobs", "POST", "suggest", { action: "suggest", title: tag + "-suggest" });
  add("jobs", "jobs", "POST", "kill", { action: "kill", id: J("kill"), confirm: true, killReason: tag + "-kill" });
  add("jobs", "jobs", "POST", "qualify", { action: "qualify", id: J("qualify"), why: tag + "-qualify" });
  add("jobs", "jobs", "POST", "recommend", { action: "recommend", id: J("recommend") });
  add("jobs", "jobs", "POST", "say", { action: "say", id: J("say"), text: tag + "-say" });
  add("jobs", "jobs", "POST", "reply", { action: "reply", id: J("reply"), text: tag + "-reply" });
  add("jobs", "jobs", "POST", "ask", { action: "ask", id: J("ask"), text: tag + "-ask" });
  add("jobs", "jobs", "POST", "fill", { action: "fill", id: J("fill"), notes: tag + "-fill", phone: "555-0100" });
  add("jobs", "jobs", "POST", "schedule", { action: "schedule", id: J("schedule"), at: "2030-01-02T10:00:00Z", when: "2030-01-02T10:00" });
  add("jobs", "jobs", "POST", "due", { action: "due", id: J("due"), due: "2030-01-02T10:00" });
  add("jobs", "jobs", "POST", "expire", { action: "expire", id: J("expire"), expires: "2030-01-02T10:00" });
  add("jobs", "jobs", "POST", "snooze", { action: "snooze", id: J("snooze"), hours: 2 });
  add("jobs", "jobs", "POST", "define-field", { action: "define-field", id: J("qualify"), label: tag + " field", key: tag + "_field" });
  add("jobs", "jobs", "POST", "ship", { action: "ship", id: J("ship"), confirm: true, amount: 0 });
  add("jobs", "jobs", "POST", "bind-ai", { action: "bind-ai", id: J("bind-ai"), ai: "", off: true });
  add("jobs", "jobs", "POST", "assign", { action: "assign", id: J("assign"), assignee: "Real Owner" });
  add("jobs", "jobs", "POST", "carry", { action: "carry", id: J("carry"), note: tag + "-carry" });
  add("jobs", "jobs", "POST", "done", { action: "done", id: J("done"), how: "off-desk", notes: tag + "-done" });
  add("jobs", "jobs", "POST", "hand", { action: "hand", id: J("hand"), notes: tag + "-hand" });
  add("jobs", "jobs", "POST", "priority", { action: "priority", id: J("priority") });
  add("jobs", "jobs", "POST", "uncap", { action: "uncap", id: J("uncap") });
  // /api/hook (pipe write-backs; no seat needed)
  const hook = { "x-workspace": fx.slug };
  add("hook", "hook", "POST", "capture", { event: "capture", title: tag + "-hook-capture" }, { headers: hook });
  add("hook", "hook", "POST", "update", { event: "update", id: J("hook-update"), notes: tag + "-hook-update" }, { headers: hook });
  add("hook", "hook", "POST", "do", { event: "do", id: J("hook-do"), notes: tag + "-hook-do" }, { headers: hook });
  add("hook", "hook", "POST", "done", { event: "done", id: J("hook-done"), notes: tag + "-hook-done" }, { headers: hook });
  add("hook", "hook", "POST", "hand", { event: "hand", id: J("hook-hand"), notes: tag + "-hook-hand" }, { headers: hook });
  add("hook", "hook", "POST", "collect", { event: "paid", id: J("hook-collect"), amount: 12 }, { headers: hook });
  add("hook", "hook", "POST", "kill", { event: "kill", id: J("hook-kill"), reason: tag + "-hook-kill" }, { headers: hook });
  add("hook", "hook", "POST", "stop", { event: "stop", id: J("hook-stop"), reason: tag + "-hook-stop" }, { headers: hook });
  // /api/intake: the whole chat (start, four answers, setup, request), as the
  // owner and as an anonymous visitor. The chat id comes from start.
  const intakeChain = (who, headers) => {
    const id = "intake-" + who;
    const extra = (more) => Object.assign({ headers, idKey: id }, more || {});
    add("intake", "intake", "POST", "start", { action: "start" }, extra({ keep: (b, ctx) => { ctx[id] = b && b.intake && b.intake.id; } }));
    [tag + " TEST lot porch photos every week", "photo", "a listing", "ebay"].forEach((text, i) => {
      add("intake", "intake", "POST", "say " + (i + 1), { action: "say", text }, extra());
    });
    add("intake", "intake", "POST", "setup", { action: "setup" }, extra());
    add("intake", "intake", "POST", "request", { action: "request", name: "Req Person" }, extra());
    add("intake", "intake", "POST", "do", { action: "do", text: "TEST lot " + tag + " intake do" }, { headers });
  };
  intakeChain("owner", owner);
  // /api/upload
  add("upload", "upload", "POST", "file", { name: tag + ".png", type: "image/png", data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" });
  // /api/rules
  add("rules", "rules", "POST", "add", { action: "add", text: "Hold anything over $500 for me" });
  add("rules", "rules", "POST", "talk", { action: "talk", text: "Wait for me on anything over $900" });
  add("rules", "rules", "POST", "confirm", { action: "confirm", draft: { when: "money", if: "over", amount: 700, then: "wait", label: tag + " rule" } });
  add("rules", "rules", "POST", "widget", { action: "widget", id: fx.ruleId, on: true, label: tag });
  add("rules", "rules", "POST", "update", { action: "update", id: fx.ruleId, label: tag + "-rule" });
  add("rules", "rules", "POST", "remove", { action: "remove", id: fx.ruleId2 });
  // /api/connections
  add("connections", "connections", "POST", "pipe-search", { action: "pipe-search", q: "shopify" });
  add("connections", "connections", "POST", "pipe-ask", { action: "pipe-ask", name: tag + "-pipe" });
  add("connections", "connections", "POST", "pipe-start", { action: "pipe-start", provider: "shopify" });
  add("connections", "connections", "POST", "ai-start", { action: "ai-start", provider: "grok" });
  add("connections", "connections", "POST", "ai-bind", { action: "ai", provider: "grok", key: "xai-FAKEKEY-" + tag + "-0000000000" });
  add("connections", "connections", "DELETE", "unbind", {}, { query: { provider: "shopify", workspace: fx.slug } });
  // /api/admin
  ["say", "talk", "invite", "request", "ask", "permission", "permit", "kind", "perms", "seat", "approve", "deny", "plan", "subscribe", "pro", "monthly", "handle",
    "invite-world", "accept-invite", "decline-invite", "find", "world-who", "invites", "mine", "person", "remove"].forEach((a) => {
    add("admin", "admin", "POST", a, { action: a, text: tag + "-admin-" + a, name: "Seat " + a, id: fx.helperId, personId: fx.helperId, kind: "member", plan: "pro", pin: "6262", code: "6262", handle: "realowner" + (phase === "A" ? "a" : "b"), q: "real", who: "Real Owner" });
  });
  // /api/auth (and /api/account, /api/desks through the same function)
  add("auth", "auth", "POST", "open", { slug: tag + "-open", biz: tag + "-open", name: "New Owner", pin: OWNER_PIN }, { headers: {} });
  add("auth", "auth", "POST", "register", { action: "register", slug: tag + "-reg", biz: tag + "-reg", name: "New Owner", pin: OWNER_PIN }, { headers: {} });
  add("auth", "auth", "POST", "join", { action: "join", workspace: fx.slug, name: tag + " Joiner", pin: "5150" }, { headers: {} });
  add("auth", "auth", "POST", "request", { action: "request", workspace: fx.slug, name: tag + " Asker", pin: "5151" }, { headers: {} });
  add("auth", "auth", "POST", "login", { action: "login", slug: fx.slug, pin: OWNER_PIN }, { headers: {} });
  add("auth", "auth", "POST", "approve", { action: "approve", id: fx.helperId });
  add("auth", "auth", "POST", "deny", { action: "deny", id: fx.helper2Id });
  add("auth", "auth", "POST", "password", { action: "password", current: "Longer-pass-1234", password: "Longer-pass-1234", email: "owner@example.test" });
  add("auth", "auth", "POST", "details", { action: "details", name: "Real Owner", email: "owner@example.test" });
  add("auth", "auth", "POST", "invite", { action: "invite", name: tag + " Invitee", pin: "6161" });
  add("auth", "auth", "POST", "nouns", { action: "nouns", nouns: { capture: "Intake" } });
  add("auth", "auth", "POST", "create", { action: "create", slug: tag + "-create", biz: tag + "-create", name: "Real Owner", pin: OWNER_PIN });
  const acct = { via: "account" };
  ["login", "attach", "plan", "password", "details", "mint", "sessions", "export", "mfa", "handle", "mail", "mail-add", "mail-remove", "mail-send", "wallet", "disconnect-wallet", "aia-quote", "reviewer"].forEach((a) => {
    add("account", "auth", "POST", a, { action: a, account: fx.slug, pin: OWNER_PIN, name: "Real Owner", email: "owner@example.test", password: "Longer-pass-1234", current: "Longer-pass-1234", handle: "realown" + (phase === "A" ? "a" : "b"), local: "real" + (phase === "A" ? "a" : "b"), address: "0x0000000000000000000000000000000000000001", chainId: 8453 }, { query: acct, url: "/api/account" });
  });
  const desks = { via: "desks" };
  ["search", "list", "mine", "history", "priority", "mail", "mail-add", "mail-remove", "mail-send", "listed", "handle", "explore", "gone", "update", "close", "open", "code", "export", "perms", "seat"].forEach((a) => {
    add("desks", "auth", "POST", a, { action: a, slug: fx.slug, desk: fx.slug, q: "real", on: true, listed: true, name: "Real Shop " + tag, biz: "Real Shop " + tag, pin: OWNER_PIN, newPin: OWNER_PIN, code: OWNER_PIN, handle: "realdesk" + (phase === "A" ? "a" : "b"), local: "desk" + (phase === "A" ? "a" : "b") }, { query: desks, url: "/api/desks" });
  });
  // /api/migrate-uploads (owner, confirm phrase)
  add("migrate-uploads", "migrate-uploads", "POST", "dry-run", { confirm: "move-old-uploads" });
  add("migrate-uploads", "migrate-uploads", "POST", "apply", { confirm: "move-old-uploads", apply: true });
  add("migrate-uploads", "migrate-uploads", "POST", "delete", { confirm: "move-old-uploads", action: "delete", yes: "yes" });
  // /api/worker (cron is GET; POST also runs it)
  add("worker", "worker", "POST", "run", {}, { query: { all: "1" } });
  // /api/health refuses non-GET
  add("health", "health", "POST", "post", {});
  // Every route and action again with no seat at all (anonymous caller).
  const anon = { "x-workspace": fx.slug, "x-forwarded-for": "203.0.113.9" };
  R.slice().forEach((r) => {
    if (r.route === "intake") return;
    R.push(Object.assign({}, r, { label: r.label + " (anon)", headers: anon }));
  });
  intakeChain("anon", anon);
  R.forEach((r) => { if (r.route === "intake" && r.headers === anon && !/\(anon\)$/.test(r.label)) r.label += " (anon)"; });
  // Destructive last: they end the session or the desk.
  add("desks", "auth", "POST", "delete", { action: "delete", slug: tag + "-create", desk: tag + "-create", pin: OWNER_PIN, confirm: tag + "-create" }, { query: desks, url: "/api/desks", headers: Object.assign({}, owner, { "x-workspace": tag + "-create" }) });
  add("auth", "auth", "POST", "remove", { action: "remove", id: fx.helper3Id });
  add("account", "auth", "POST", "logout", { action: "logout" }, { query: acct, url: "/api/account" });
  add("account", "auth", "POST", "logout-all", { action: "logout-all" }, { query: acct, url: "/api/account" });
  return R;
}

function getTable(fx) {
  const owner = { "x-workspace": fx.slug, "x-pin": OWNER_PIN, "x-session": fx.token, cookie: "aia_session=" + fx.token };
  return [
    ["jobs", "jobs", {}], ["hook", "hook", {}], ["intake", "intake", {}], ["upload", "upload", {}], ["rules", "rules", {}],
    ["connections", "connections", {}], ["admin", "admin", {}], ["auth", "auth", {}], ["account", "auth", { via: "account" }],
    ["desks", "auth", { via: "desks" }], ["health", "health", {}], ["status", "health", { view: "status" }], ["worker", "worker", { all: "1" }]
  ].map((g) => ({ route: g[0], file: g[1], method: "GET", label: "GET", body: {}, headers: owner, query: g[2], url: "/api/" + g[0] }));
}

function wantKey(r) { return r.route + " " + r.label; }

// Builds the real store with the real code on a file store: one desk, an
// owner session, a helper seat, rules and one card per job action.
async function buildFixture(apiDir) {
  const R = () => fakeRes();
  const lib = require(path.join(apiDir, "_lib.js"));
  await globalThis.__aiaHydrate;
  const auth = require(path.join(apiDir, "auth.js"));
  const jobs = require(path.join(apiDir, "jobs.js"));
  const rules = require(path.join(apiDir, "rules.js"));
  const slug = "real-desk";
  let r = R();
  await auth({ method: "POST", headers: {}, query: {}, url: "/api/auth", body: { slug, biz: "Real Shop", name: "Real Owner", pin: OWNER_PIN, email: "owner@example.test", password: "Longer-pass-1234" } }, r);
  // The owner session is her email + password sign-in: account changes need a proven sign-in (#370).
  r = R();
  await auth({ method: "POST", headers: {}, query: {}, url: "/api/auth", body: { action: "login", email: "owner@example.test", password: "Longer-pass-1234" } }, r);
  const token = r.body && r.body.session && r.body.session.token;
  const owner = { "x-workspace": slug, "x-pin": OWNER_PIN };
  const fx = { slug, token, jobs: {} };
  for (let i = 0; i < JOB_ACTIONS.length; i++) {
    r = R();
    await jobs({ method: "POST", headers: owner, query: {}, url: "/api/jobs", body: { action: "capture", title: "Real card " + JOB_ACTIONS[i], notes: "real" } }, r);
    fx.jobs[JOB_ACTIONS[i]] = r.body && r.body.job && r.body.job.id;
  }
  for (const n of ["Helper Hal", "Helper Two", "Helper Three"]) {
    r = R();
    await auth({ method: "POST", headers: {}, query: {}, url: "/api/auth", body: { action: "join", workspace: slug, name: n, pin: "7" + String(n.length) + "91" } }, r);
  }
  const shop = lib.mem.workspaces.find((w) => w.slug === slug);
  const helpers = (shop.people || []).filter((p) => /^Helper/.test(p.name || ""));
  fx.helperId = helpers[0] && helpers[0].id;
  fx.helper2Id = helpers[1] && helpers[1].id;
  fx.helper3Id = helpers[2] && helpers[2].id;
  for (const t of ["Hold anything over $300 for me", "Stop anything from spam"]) {
    r = R();
    await rules({ method: "POST", headers: owner, query: {}, url: "/api/rules", body: { action: "add", text: t } }, r);
  }
  const rl = (shop.rules || []).filter((x) => x && x.id);
  fx.ruleId = rl[0] && rl[0].id;
  fx.ruleId2 = rl[1] && rl[1].id;
  fx.store = fs.readFileSync(process.env.AIA_STORE_PATH, "utf8");
  process.stdout.write("FIXTURE " + JSON.stringify(fx) + "\n");
}

async function routesChild(apiDir, spec) {
  const Module = require("module");
  const fx = spec.fx;
  // Stale: the /tmp copy holds the real desk, session and cards. Cold: no
  // local copy at all, and requests start before the module load settles.
  if (!spec.cold) fs.writeFileSync(process.env.AIA_STORE_PATH, fx.store);
  const REAL_BYTES = fx.store;
  const LIVE = spec.legacy ? REST_KEY : KEY;
  const SPARE = spec.legacy ? KEY : REST_KEY;
  const st = { files: { [LIVE]: REAL_BYTES }, fault: spec.fault, listDown: !!spec.listDown, listHasMore: !!spec.listHasMore, sdkDenied: !!spec.sdkDenied, writes: [], other: [] };
  const realNow = () => st.files[LIVE] === REAL_BYTES && !st.files[SPARE];
  const host = "https://fakestore.private.blob.vercel-storage.com/";
  const nameOf = (k) => String(k || "").replace(/^https?:\/\/[^/]+\//, "").split("?")[0];
  function sdkFail(op) {
    const f = st.fault;
    if (f === "403") throw new Error("Vercel Blob: Access denied, please provide a valid token for this resource. 403 Forbidden");
    if (f === "500") throw new Error("Vercel Blob: Failed to fetch blob: 500 Internal Server Error");
    if (f === "reset") { const e = new Error("read ECONNRESET"); e.code = "ECONNRESET"; throw e; }
    if (f === "timeout") { const e = new Error("The operation was aborted due to timeout"); e.name = "TimeoutError"; throw e; }
    if (st.sdkDenied) throw new Error("Vercel Blob: Access denied, please provide a valid token for this resource. 403 Forbidden");
    if (op === "list" && st.listDown) throw new Error("Vercel Blob: Failed to list blobs: 500 Internal Server Error");
  }
  const bodyOf = (n) => st.fault === "empty" ? "" : st.fault === "badjson" ? "{\"workspaces\": [tru" : st.files[n];
  Module._load = (function (orig) {
    return function (request) {
      if (request === "@vercel/blob") {
        return {
          async head(key) { sdkFail("head"); const n = nameOf(key); if (st.fault === "false404" || !st.files[n]) throw new Error("Vercel Blob: The requested blob does not exist"); return { pathname: n, url: host + n, downloadUrl: host + n + "?download=1" }; },
          async get(key) { sdkFail("get"); const n = nameOf(key); if (st.fault === "false404" || !st.files[n]) return null; const raw = bodyOf(n); return { statusCode: 200, stream: { text: async () => raw }, blob: { url: host + n } }; },
          async list(opts) { sdkFail("list"); const prefix = (opts && opts.prefix) || ""; if (st.listHasMore) return { blobs: [], hasMore: true, cursor: "next" }; return { blobs: Object.keys(st.files).filter((n) => n.indexOf(prefix) === 0).map((n) => ({ pathname: n, url: host + n, size: String(st.files[n]).length, uploadedAt: new Date().toISOString() })), hasMore: false }; },
          async put(key, body) { sdkFail("put"); st.writes.push("sdk:" + nameOf(key)); st.files[nameOf(key)] = Buffer.isBuffer(body) ? body.toString("utf8") : String(body); return { url: host + nameOf(key), downloadUrl: host + nameOf(key) + "?download=1", pathname: nameOf(key) }; },
          async del(key) { st.writes.push("del:" + nameOf(key)); delete st.files[nameOf(key)]; },
          async copy(a, b) { sdkFail("put"); st.writes.push("copy:" + nameOf(b)); st.files[nameOf(b)] = st.files[nameOf(a)]; return { url: host + nameOf(b), pathname: nameOf(b) }; }
        };
      }
      return orig.apply(this, arguments);
    };
  })(Module._load);
  global.fetch = async function (url, opts) {
    const u = String(url || "");
    const method = String((opts && opts.method) || "GET").toUpperCase();
    if (!/vercel-storage\.com|vercel\.com\/api\/blob/.test(u)) { st.other.push(u.slice(0, 80)); throw new Error("no network in this check"); }
    const f = st.fault;
    if (method !== "GET") {
      if (f === "403" || f === "500" || f === "reset" || f === "timeout") return { ok: false, status: 503, url: u, text: async () => "down" };
      const m = u.match(/[?&]pathname=([^&]+)/);
      const n = m ? decodeURIComponent(m[1]) : nameOf(u);
      st.writes.push("rest:" + n);
      st.files[n] = Buffer.isBuffer(opts.body) ? opts.body.toString("utf8") : String(opts.body || "");
      return { ok: true, status: 200, url: u, text: async () => JSON.stringify({ url: host + n }) };
    }
    if (f === "reset" || f === "timeout") throw new Error(f === "reset" ? "fetch failed: ECONNRESET" : "The operation was aborted due to timeout");
    if (f === "403") return { ok: false, status: 403, statusText: "Forbidden", url: u, text: async () => "Forbidden" };
    if (f === "500") return { ok: false, status: 500, statusText: "Internal Server Error", url: u, text: async () => "boom" };
    const pm = u.match(/[?&]prefix=([^&]+)/);
    if (pm) {
      if (st.listDown) return { ok: false, status: 500, url: u, text: async () => "list down" };
      if (st.listHasMore) return { ok: true, status: 200, url: u, text: async () => JSON.stringify({ blobs: [], hasMore: true, cursor: "next" }) };
      const prefix = decodeURIComponent(pm[1]);
      return { ok: true, status: 200, url: u, text: async () => JSON.stringify({ blobs: Object.keys(st.files).filter((n) => n.indexOf(prefix) === 0).map((n) => ({ pathname: n })), hasMore: false }) };
    }
    const n = nameOf(u);
    if (f === "false404" || !st.files[n]) return { ok: false, status: 404, statusText: "Not Found", url: u, text: async () => "" };
    const raw = bodyOf(n);
    return { ok: true, status: 200, url: u, text: async () => raw };
  };

  const isStore = (w) => /(^|:)(aia\/store\.json|aia-store\.json)$/.test(w);
  const lib = require(path.join(apiDir, "_lib.js"));
  if (!spec.cold) { try { await globalThis.__aiaHydrate; } catch (e) {} }
  const handlers = {};
  ["jobs", "hook", "intake", "upload", "rules", "connections", "admin", "auth", "health", "worker", "migrate-uploads"].forEach((f) => { handlers[f] = require(path.join(apiDir, f + ".js")); });
  const ctx = {};
  const out = { load: { writes: 0, trusted: false }, A: [], B: [], other: [] };
  if (spec.cold) {
    // Cold instance: an anonymous intake (TEST lot) and a GET land while the
    // module load is still in flight.
    const anon = { "x-workspace": fx.slug, "x-forwarded-for": "203.0.113.7" };
    const burst = await Promise.all([
      hitLater({ route: "intake", file: "intake", method: "POST", label: "do (anon, cold burst)", body: { action: "do", text: "TEST lot cold burst" }, headers: anon, query: {} }),
      hitLater({ route: "intake", file: "intake", method: "POST", label: "start (anon, cold burst)", body: { action: "start" }, headers: anon, query: {} }),
      hitLater({ route: "jobs", file: "jobs", method: "GET", label: "GET (cold burst)", body: {}, headers: {}, query: {} })
    ]);
    burst.forEach((x) => out.A.push(x));
    try { await globalThis.__aiaHydrate; } catch (e) {}
  }
  out.load = { writes: st.writes.filter(isStore).length, trusted: lib.storeTrusted() };
  async function hit(r) {
    const res = fakeRes();
    if (r.idKey) r = Object.assign({}, r, { body: Object.assign({}, r.body, { id: ctx[r.idKey] || "in_missing" }) });
    const before = st.writes.length;
    const netBefore = st.other.length;
    try {
      await handlers[r.file]({ method: r.method, headers: Object.assign({}, r.headers), query: Object.assign({}, r.query), url: (r.url || "/api/" + r.route), body: JSON.parse(JSON.stringify(r.body)), socket: { remoteAddress: "127.0.0.1" } }, res);
    } catch (e) {
      res.statusCode = 500; res.body = { threw: String(e && e.message || e).slice(0, 120) };
    }
    const puts = st.writes.slice(before).filter(isStore).length;
    const b = res.body && typeof res.body === "object" ? res.body : {};
    if (r.keep) r.keep(b, ctx);
    return { key: wantKey(r), method: r.method, status: res.statusCode, puts, net: st.other.length - netBefore, notReady: b.error === NOT_READY && b.code === NOT_READY_CODE, error: b.error, state: b.store && b.store.state, retry: res.headers["Retry-After"] || null, err: b.error ? String(b.error).slice(0, 90) : "", real: realNow() };
  }
  async function hitLater(r) { return hit(r); }
  // Phase A: the store is not trusted.
  for (const r of routeTable(fx, "A").concat(getTable(fx))) out.A.push(await hit(r));
  // persistScrub probe: a test card in memory while untrusted, then a GET
  // that runs ready() -> persistScrub(). It must not write the store.
  lib.mem.jobs.unshift({ id: "job_scrubprobe", workspace: "p1-probe", title: "TEST lot scrub probe" });
  const scrubBefore = st.writes.length;
  const scrubRes = await hit({ route: "jobs", file: "jobs", method: "GET", label: "GET (scrub probe)", body: {}, headers: {}, query: {}, url: "/api/jobs" });
  try { await lib.persistScrub(); } catch (e) {}
  lib.mem.jobs.unshift({ id: "job_scrubprobe2", workspace: "p1-probe", title: "TEST lot scrub probe" });
  try { await lib.persistScrub(); } catch (e) {}
  out.scrub = { puts: st.writes.slice(scrubBefore).filter(isStore).length, status: scrubRes.status, real: realNow() };
  // Leak probe: a GET that changes memory and saves while untrusted.
  const leaky = lib.guardStore(async function (req, res) {
    lib.mem.jobs.unshift({ id: "job_leakprobe", workspace: fx.slug, title: "leak probe" });
    await lib.save();
    return res.status(200).json({ ok: true });
  });
  const lres = fakeRes();
  await leaky({ method: "GET", headers: {}, query: {} }, lres);
  out.leak = { status: lres.statusCode, inMem: lib.mem.jobs.some((j) => j && j.id === "job_leakprobe") };
  out.trustedAfterA = lib.storeTrusted();
  out.otherA = st.other.slice();
  // Recovery: the fault clears. The next write request reads the real store.
  st.fault = null; st.listDown = false; st.listHasMore = false;
  for (const r of routeTable(fx, "B")) out.B.push(await hit(r));
  out.trustedAfterB = lib.storeTrusted();
  let final = null;
  try { final = lib.blobOpen(st.files[KEY] || st.files[REST_KEY] || "null"); } catch (e) { final = ""; }
  out.final = {
    phaseA: String(final || "").indexOf("phaseA") >= 0 || String(final || "").indexOf("leakprobe") >= 0 || String(final || "").indexOf("scrubprobe") >= 0,
    phaseB: String(final || "").indexOf("phaseB-say") >= 0 && String(final || "").indexOf("phaseB-hook-capture") >= 0,
    realDesk: String(final || "").indexOf("\"real-desk\"") >= 0 && String(final || "").indexOf("Real card kill") >= 0
  };
  out.other = st.other;
  process.stdout.write("RESULT " + JSON.stringify(out) + "\n");
}

function routesMain(apiDir, t) {
  const healthSaves = /await save\(\)/.test(fs.readFileSync(path.join(apiDir, "health.js"), "utf8"));
  // Health answers any method. With #341 it never saves, so POST /api/health
  // is read-only too; without it, its old save() probe makes it a write.
  const readOnly = READ_ONLY.concat(healthSaves ? [] : ["health post"]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-noblind-fx-"));
  const env = { PATH: process.env.PATH, HOME: tmp, AIA_STORE_PATH: path.join(tmp, "store.json"), AIA_UPLOAD_DIR: path.join(tmp, "up") };
  const b = spawnSync(process.execPath, [__filename, "--fixture", apiDir], { env, cwd: tmp, encoding: "utf8", timeout: 60000 });
  fs.rmSync(tmp, { recursive: true, force: true });
  const line = String(b.stdout || "").split("\n").find((l) => l.indexOf("FIXTURE ") === 0);
  if (!line) return t("routes: fixture built", false, String(b.stderr || "").slice(-300));
  const fx = JSON.parse(line.slice(8));
  t("routes: fixture has a session, cards, seats and rules", !!(fx.token && Object.values(fx.jobs).every(Boolean) && fx.helperId && fx.helper2Id && fx.helper3Id && fx.ruleId && fx.ruleId2), JSON.stringify(Object.assign({}, fx, { store: undefined, token: !!fx.token })));
  const table = [];
  const MUST_WORK = ["jobs capture", "jobs kill", "jobs say", "jobs ship", "jobs done", "jobs hand", "jobs qualify", "jobs priority", "hook capture", "hook update", "hook done", "hook hand", "hook kill", "hook stop", "intake start", "intake do", "intake setup", "intake request", "intake setup (anon)", "intake request (anon)", "hook capture (anon)", "upload file", "upload file (anon)", "rules add", "rules remove", "auth open", "auth register", "auth join", "account login", "account details", "desks update", "desks close", "admin say", "admin invite", "connections ai-bind", "connections unbind", "worker run"];
  const RUNS = [];
  CASES.forEach((c) => {
    RUNS.push(Object.assign({}, c, { id: c.id + " stale-copy" }));
    RUNS.push(Object.assign({}, c, { id: c.id + " cold", cold: true }));
  });
  RUNS.forEach((c) => {
    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "aia-noblind-routes-"));
    const env2 = Object.assign({ PATH: process.env.PATH, HOME: tmp2, AIA_STORE_PATH: path.join(tmp2, "store.json"), AIA_UPLOAD_DIR: path.join(tmp2, "up") }, FAKE_ENV);
    const r = spawnSync(process.execPath, [__filename, "--routes-child", apiDir, JSON.stringify({ fault: c.fault, listDown: !!c.listDown, listHasMore: !!c.listHasMore, legacy: !!c.legacy, sdkDenied: !!c.sdkDenied, cold: !!c.cold, fx })], { env: env2, cwd: tmp2, encoding: "utf8", timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
    fs.rmSync(tmp2, { recursive: true, force: true });
    const rl = String(r.stdout || "").split("\n").find((l) => l.indexOf("RESULT ") === 0);
    if (!rl) return t(c.id + " routes: child ran", false, String(r.stderr || "").replace(/vercel_blob_rw_\w+/g, "[token]").slice(-400));
    const o = JSON.parse(rl.slice(7));
    t(c.id + " routes: module load wrote nothing and stays untrusted", o.load.writes === 0 && o.load.trusted === false, JSON.stringify(o.load));
    const badA = o.A.filter((x) => x.method !== "GET" && !(x.status >= 500 && x.status < 600));
    t(c.id + " routes: every POST/DELETE route and action answers 5xx while not ready (" + o.A.filter((x) => x.method !== "GET").length + ")", badA.length === 0, JSON.stringify(badA.slice(0, 6)));
    const noRetry = o.A.filter((x) => x.method !== "GET" && !(x.status === 503 && x.notReady && x.retry));
    t(c.id + " routes: each is the one not-ready JSON 503 (exact error \"" + NOT_READY + "\", code, Retry-After)", noRetry.length === 0, JSON.stringify(noRetry.slice(0, 6)));
    const putA = o.A.filter((x) => x.puts > 0 || !x.real);
    t(c.id + " routes: zero store puts and byte-identical store on every route (GETs included)", putA.length === 0, JSON.stringify(putA.slice(0, 6)));
    const twoNoPutA = o.A.filter((x) => x.method !== "GET" && x.status >= 200 && x.status < 300 && x.puts === 0);
    t(c.id + " routes: no POST/PUT/PATCH/DELETE answers 2xx without a store put (not ready)", twoNoPutA.length === 0, JSON.stringify(twoNoPutA.slice(0, 6)));
    const hA = o.A.find((x) => x.key === "health GET") || {};
    t(c.id + " routes: health while not ready shows not-ready and puts nothing", hA.state === "not-ready" && hA.puts === 0 && (healthSaves ? hA.status === 503 : true), JSON.stringify(hA));
    const any503 = o.A.concat(o.B).filter((x) => x.status === 503 && !x.notReady);
    t(c.id + " routes: every 503 (GETs included) carries the exact not-ready error and code", any503.length === 0, JSON.stringify(any503.slice(0, 4)));
    t(c.id + " routes: persistScrub writes nothing while not ready", o.scrub.puts === 0 && o.scrub.real, JSON.stringify(o.scrub));
    t(c.id + " routes: a refused save never answers 2xx and its memory is dropped", o.leak.status === 503 && o.leak.inMem === false, JSON.stringify(o.leak));
    t(c.id + " routes: still untrusted after the failed phase", o.trustedAfterA === false);
    const nr = o.B.filter((x) => x.notReady || x.status === 503);
    t(c.id + " routes: after recovery no route answers not-ready", nr.length === 0, JSON.stringify(nr.slice(0, 6)));
    t(c.id + " routes: trusted after recovery", o.trustedAfterB === true);
    const broke = MUST_WORK.filter((k) => { const x = o.B.find((y) => y.key === k); return !x || !(x.status >= 200 && x.status < 300) || x.puts < 1; });
    t(c.id + " routes: key actions succeed after recovery with a store put", broke.length === 0, JSON.stringify(broke.map((k) => o.B.find((y) => y.key === k) || k).slice(0, 6)));
    // Collect is on HOLD: hook collect (paid) answers 409 HOLD and puts nothing.
    const hc = o.B.find((x) => x.key === "hook collect");
    t(c.id + " routes: hook collect (paid) answers 409 Collect HOLD with no store put", !!hc && hc.status === 409 && hc.puts === 0, JSON.stringify(hc || null));
    const twoNoPutB = o.B.filter((x) => x.method !== "GET" && x.status >= 200 && x.status < 300 && x.puts === 0 && readOnly.indexOf(x.key.replace(/ \(anon\)$/, "")) < 0);
    t(c.id + " routes: no POST/PUT/PATCH/DELETE answers 2xx without a store put after recovery (read-only list aside)", twoNoPutB.length === 0, JSON.stringify(twoNoPutB.slice(0, 8)));
    const roPut = o.B.filter((x) => readOnly.indexOf(x.key.replace(/ \(anon\)$/, "")) >= 0 && x.puts > 0);
    t(c.id + " routes: listed read-only actions put nothing", roPut.length === 0, JSON.stringify(roPut));
    t(c.id + " routes: final store has the real desk and phase-B work, none of the failed phase", o.final.realDesk && o.final.phaseB && !o.final.phaseA, JSON.stringify(o.final));
    const netA = o.A.filter((x) => x.method !== "GET" && x.net > 0);
    t(c.id + " routes: refused requests reach no network", netA.length === 0, JSON.stringify(netA.slice(0, 4)));
    if (c.id === "empty-body stale-copy") o.A.forEach((x, i) => table.push({ key: x.key, method: x.method, notReady: x.status, puts: x.puts, after: (o.B[i] && o.B[i].key === x.key) ? o.B[i].status + "/" + o.B[i].puts : "" }));
  });
  if (process.env.NOBLIND_TABLE) fs.writeFileSync(process.env.NOBLIND_TABLE, JSON.stringify(table, null, 1));
}

const childErr = (e) => {
  console.error(String(e && e.stack || e).replace(/vercel_blob_rw_\w+/g, "[token]"));
  process.exit(2);
};
if (process.argv[2] === "--fixture") buildFixture(process.argv[3]).catch(childErr);
else if (process.argv[2] === "--routes-child") routesChild(process.argv[3], JSON.parse(process.argv[4])).catch(childErr);
else if (process.argv[2] === "--child") {
  child(process.argv[3], JSON.parse(process.argv[4])).catch((e) => {
    console.error(String(e && e.stack || e).replace(/vercel_blob_rw_\w+/g, "[token]"));
    process.exit(2);
  });
} else main();
