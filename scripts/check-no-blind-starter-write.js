#!/usr/bin/env node
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
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const KEY = "aia/store.json";
const REST_KEY = "aia-store.json";
const PIN = "4826";
const FAKE_ENV = {
  VERCEL_ENV: "production",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_FAKESTORE_fakefakefake",
  BLOB_STORE_ID: "store_FAKESTORE"
};
const REAL = JSON.stringify({
  account: { id: "aia", name: "Automate It Away" },
  accounts: [{ id: "acct_real", name: "Real Shop", ownerName: "Real Owner", slug: "real-desk" }],
  workspaces: [{ slug: "real-desk", name: "Real Owner", biz: "Real Shop", people: [{ id: "p_real", name: "Real Owner", role: "owner" }] }],
  jobs: [{ id: "job_real1", workspace: "real-desk", title: "Real lot", status: "open" }],
  sessions: [], approvals: [], locks: [], connections: [], audit: [], money: [], inbox: [], files: [], tickets: [], packs: [], mail: [], migrations: {}
});
const CASES = [
  { id: "empty-body", fault: "empty" },
  { id: "false-404", fault: "false404" },
  { id: "false-404-list-down", fault: "false404", listDown: true },
  { id: "403", fault: "403" },
  { id: "500", fault: "500" },
  { id: "reset", fault: "reset" },
  { id: "timeout", fault: "timeout" },
  { id: "bad-json", fault: "badjson" }
];

// ---------------- child ----------------
async function child(apiDir, spec) {
  const Module = require("module");
  const st = { files: {}, fault: spec.fault, listDown: !!spec.listDown, sdkDenied: !!spec.sdkDenied, writes: [], other: [] };
  if (spec.fresh !== true) st.files[KEY] = REAL;
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
            if (st.fault === "false404" || !st.files[n]) throw new Error("Vercel Blob: The requested blob does not exist");
            return { pathname: n, url: host + n, downloadUrl: host + n + "?download=1" };
          },
          async get(key) {
            sdkFail("get");
            const n = nameOf(key);
            if (st.fault === "false404" || !st.files[n]) return null;
            const raw = bodyOf(n);
            return { statusCode: 200, stream: { text: async () => raw }, blob: { url: host + n } };
          },
          async list(opts) {
            sdkFail("list");
            const prefix = (opts && opts.prefix) || "";
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
      const prefix = decodeURIComponent(pm[1]);
      return { ok: true, status: 200, url: u, text: async () => JSON.stringify({ blobs: Object.keys(st.files).filter((n) => n.indexOf(prefix) === 0).map((n) => ({ pathname: n })), hasMore: false }) };
    }
    const n = nameOf(u);
    if (f === "false404" || !st.files[n]) return { ok: false, status: 404, statusText: "Not Found", url: u, text: async () => "" };
    const raw = bodyOf(n);
    return { ok: true, status: 200, url: u, text: async () => raw };
  };

  const out = { steps: [] };
  let seen = 0;
  const note = (name, extra) => out.steps.push(Object.assign({ name, writes: st.writes.slice(seen, (seen = st.writes.length)), real: spec.fresh ? null : st.files[KEY] === REAL && !st.files[REST_KEY] }, extra || {}));
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
    return { status: res.statusCode, ok: !!(res.body && res.body.ok), error: res.body && res.body.error };
  }
  const open = (slug) => call({ slug, biz: slug, name: "New Owner", pin: PIN });
  const register = (slug) => call({ action: "register", slug, biz: slug, name: "New Owner", pin: PIN });
  if (spec.cleanOnly) {
    note("auth open after clean load", await open("clean-open"));
  } else if (!spec.fresh) {
    note("auth open after failed load", await open("new-open"));
    note("auth register after failed load", await register("new-reg"));
    note("account open after failed load", await call({ action: "open", account: "real-desk", pin: PIN }, { via: "account" }));
    // Any other handler that saves after a failed load: save() itself refuses.
    lib.mem.workspaces.unshift({ slug: "via-save", people: [] });
    let saved;
    try { saved = await lib.save(); } catch (e) { saved = "threw"; }
    lib.mem.workspaces = lib.mem.workspaces.filter((w) => w && w.slug !== "via-save");
    note("save() after failed load", { saved });
    st.fault = null; st.listDown = false;
    note("auth open after recovery", await open("new-open2"));
    note("auth register after recovery", await register("new-reg2"));
  } else {
    note("auth open on fresh install", await open("fresh-open"));
    note("auth register on fresh install", await register("fresh-reg"));
  }
  let final = null;
  try { final = JSON.parse(lib.blobOpen(st.files[KEY] || st.files[REST_KEY] || "null")); } catch (e) { final = "unparsed"; }
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
      t(c.id + ": " + name + " writes nothing", storeWrites(s.writes).length === 0, "writes " + JSON.stringify(s.writes));
      t(c.id + ": real store byte-identical after " + name, s.real);
    });
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
    const fo = fresh.steps.find((s) => s.name === "auth open on fresh install");
    const fr = fresh.steps.find((s) => s.name === "auth register on fresh install");
    t(f.id + ": auth open succeeds", fo && fo.status === 201, "status " + (fo && fo.status) + " " + JSON.stringify(fo && fo.error || ""));
    t(f.id + ": auth register succeeds", fr && fr.status === 201, "status " + (fr && fr.status) + " " + JSON.stringify(fr && fr.error || ""));
    const slugs = fresh.finalSlugs || [];
    t(f.id + ": store holds both new desks", slugs.indexOf("fresh-open") >= 0 && slugs.indexOf("fresh-reg") >= 0, JSON.stringify(slugs));
  });
  if (fails.length) {
    console.log("check-no-blind-starter-write failed: " + fails.length + " of " + n + " (first: " + fails[0] + ")");
    process.exit(1);
  }
  console.log("check-no-blind-starter-write passed (" + n + " checks)");
}

if (process.argv[2] === "--child") {
  child(process.argv[3], JSON.parse(process.argv[4])).catch((e) => {
    console.error(String(e && e.stack || e).replace(/vercel_blob_rw_\w+/g, "[token]"));
    process.exit(2);
  });
} else main();
