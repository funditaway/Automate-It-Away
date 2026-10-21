const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PROVIDERS = {
  square: { label: "Square", acts: ["payout", "checkout"], env: ["SQUARE_ACCESS_TOKEN"] },
  ebay: { label: "eBay", acts: ["list", "unlist", "sync"], env: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"] },
  calendar: { label: "Google Calendar", acts: ["book", "cancel"], env: ["GOOGLE_CLIENT_ID"] },
  consign: { label: "Consign It Away store", acts: ["list", "payout"], env: ["CONSIGN_API_BASE"] },
  webhook: { label: "Custom webhook", acts: ["post"], env: [] },
  sms: { label: "SMS", acts: ["text"], env: ["TWILIO_ACCOUNT_SID"] },
  whatnot: { label: "Whatnot", acts: ["list"], env: ["WHATNOT_TOKEN"] }
};

const EMPTY = {
  account: null, accounts: [], sessions: [], approvals: [], locks: [],
  connections: [], jobs: [], audit: [], money: [], workspaces: [], inbox: [], files: [], tickets: [], packs: [], mail: [],
  migrations: {}
};
const SESSION_DAYS = 14;
const SESSION_MAX = 8;
const LOCK_FAILS = 8;
const LOCK_MINUTES = 15;
const BLOB_KEY = "aia/store.json";
const BLOB_STAMP = "write-v1";
const blobProbe = { token: false, write: null, read: null, url: null, detail: null, status: null, access: null, auth: null, stamp: BLOB_STAMP, rev: null };
const PERSIST_TEST_DROP = {
  "consign-it-away": ["job_mtegpvhk", "job_mtegkkap", "job_mtegezu8"],
  "p1-synth": ["job_mtemdqeq", "job_mtemdpyc", "job_mtemdpc3"],
  "p1-scratch": ["job_mtekn4yj"],
  "p1-rail-check": ["job_mtejjcbn", "job_mtejjbs1"],
  "p1-rules-check": ["job_mtept7yo"]
};

function storePath() {
  if (process.env.AIA_STORE_PATH) return process.env.AIA_STORE_PATH;
  const durable = path.join(__dirname, "data", "aia.json");
  const tmp = path.join("/tmp", "aia-store.json");
  try {
    fs.mkdirSync(path.dirname(durable), { recursive: true });
    fs.accessSync(path.dirname(durable), fs.constants.W_OK);
    return durable;
  } catch (e) {
    return tmp;
  }
}

function shape(parsed) {
  parsed = parsed && typeof parsed === "object" ? parsed : {};
  return {
    account: parsed.account && typeof parsed.account === "object" ? parsed.account : null,
    accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    approvals: Array.isArray(parsed.approvals) ? parsed.approvals : [],
    locks: Array.isArray(parsed.locks) ? parsed.locks : [],
    connections: Array.isArray(parsed.connections) ? parsed.connections : [],
    jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
    audit: Array.isArray(parsed.audit) ? parsed.audit : [],
    money: Array.isArray(parsed.money) ? parsed.money : [],
    workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
    inbox: Array.isArray(parsed.inbox) ? parsed.inbox : [],
    files: Array.isArray(parsed.files) ? parsed.files : [],
    tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
    packs: Array.isArray(parsed.packs) ? parsed.packs : [],
    mail: Array.isArray(parsed.mail) ? parsed.mail : [],
    migrations: parsed.migrations && typeof parsed.migrations === "object" && !Array.isArray(parsed.migrations) ? parsed.migrations : {}
  };
}

function payload() {
  return {
    account: mem.account,
    accounts: mem.accounts,
    sessions: mem.sessions,
    approvals: mem.approvals,
    locks: mem.locks,
    connections: mem.connections,
    jobs: mem.jobs,
    audit: mem.audit,
    money: mem.money,
    workspaces: mem.workspaces,
    inbox: mem.inbox,
    files: mem.files,
    tickets: mem.tickets,
    packs: mem.packs,
    mail: mem.mail,
    migrations: mem.migrations && typeof mem.migrations === "object" ? mem.migrations : {}
  };
}

// Fix G: the shared Blob store (aia/store.json) is the live production data.
// Only a production deployment may read or write it. Previews, development and
// local runs never get a token, store id or OIDC path to it, even if Vercel
// hands them one; they fall back to the file store (api/data or /tmp).
function blobAllowed() {
  return process.env.VERCEL_ENV === "production";
}

function blobOffProd() {
  const err = new Error("Vercel Blob: shared store is production-only (VERCEL_ENV=" + (process.env.VERCEL_ENV || "unset") + ")");
  err.code = "AIA_BLOB_PROD_ONLY";
  return err;
}

function blobToken() {
  if (!blobAllowed()) return "";
  return process.env.BLOB_READ_WRITE_TOKEN
    || process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN
    || process.env.AIA_BLOB_TOKEN
    || "";
}

function blobRev() {
  return String(process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 40);
}

function blobErrText(e) {
  if (e == null) return "blob-fail";
  if (typeof e === "string") {
    const s = e.trim();
    if (!s || s === "[object Object]") return "blob-fail";
    return s.slice(0, 180);
  }
  if (typeof e === "number" || typeof e === "boolean") return String(e);
  const msg = e && e.message;
  if (typeof msg === "string" && msg && msg !== "[object Object]") return msg.slice(0, 180);
  if (msg && typeof msg === "object" && msg !== e) {
    const inner = blobErrText(msg);
    if (inner !== "blob-fail") return inner;
  }
  const nested = e && (e.error || e.cause);
  if (nested && nested !== e) {
    const inner = blobErrText(nested);
    if (inner !== "blob-fail") return inner;
  }
  if (e && typeof e === "object") {
    try {
      const json = JSON.stringify(e);
      if (json && json !== "{}" && json !== "[]") return json.slice(0, 180);
    } catch (x) {}
  }
  return "blob-fail";
}

function blobStoreId() {
  if (!blobAllowed()) return "";
  return process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN_STORE_ID || "";
}

function blobOidcReady() {
  return !!blobStoreId();
}

function blobAuthKind() {
  if (blobProbe.auth === "token" || blobProbe.auth === "rest") return blobProbe.auth;
  if (blobOidcReady()) return "oidc";
  if (blobToken()) return "token";
  return null;
}

function blobAuthAttempts() {
  const attempts = [];
  if (blobStoreId()) attempts.push({ storeId: blobStoreId() });
  attempts.push({});
  if (blobToken()) attempts.push({ token: blobToken() });
  return attempts;
}

function blobAuthOpts() {
  return blobStoreId() ? { storeId: blobStoreId() } : (blobToken() ? { token: blobToken() } : {});
}

async function blobTryAuth(run) {
  if (!blobAllowed()) throw blobOffProd();
  const attempts = blobAuthAttempts();
  let last;
  for (let i = 0; i < attempts.length; i++) {
    try {
      const out = await run(attempts[i]);
      blobProbe.auth = attempts[i].token ? "token" : "oidc";
      return out;
    } catch (e) {
      last = e;
      const msg = (e && e.message) || e;
      if (blobMissing(msg)) throw e;
      if (!blobNeedsRetry(msg)) throw e;
    }
  }
  throw last;
}

const BLOB_REST_KEY = "aia-store.json";

function blobRestErr(json, text, status) {
  const fromJson = blobErrText(json && (json.error || json.message || json));
  if (fromJson && fromJson !== "blob-fail") return fromJson.slice(0, 180);
  if (text && text !== "[object Object]") {
    const t = String(text).trim();
    if (t) return t.slice(0, 180);
  }
  return ("rest-" + (status || "fail")).slice(0, 180);
}

function blobRestStoreId() {
  const env = blobStoreId();
  if (env) return env;
  const t = blobToken();
  if (/^vercel_blob_rw_/.test(t)) {
    const parts = t.split("_");
    return parts[3] || "";
  }
  return "";
}

function blobRestHeaders(extra) {
  const headers = {
    Authorization: "Bearer " + blobToken(),
    "x-api-version": "7"
  };
  const storeId = blobRestStoreId();
  if (storeId) headers["x-vercel-blob-store-id"] = storeId;
  return Object.assign(headers, extra || {});
}

function blobRestPutUrls(name) {
  return [
    "https://vercel.com/api/blob/?pathname=" + encodeURIComponent(name),
    "https://blob.vercel-storage.com/" + name
  ];
}

// The live store is aia/store.json (the SDK name; production health shows the
// SDK path). aia-store.json is a legacy leftover: it is read only when a
// listing proves the live name absent, it is never written or deleted, and the
// first save after loading it migrates the data to aia/store.json.
async function blobRestGetName(name) {
  const r = await fetch("https://blob.vercel-storage.com/" + name, {
    headers: blobRestHeaders()
  });
  if (r.status === 404) return { empty: true, status: 404 };
  if (!r.ok) {
    const text = await r.text();
    let json = {};
    try { json = JSON.parse(text); } catch (e) { json = {}; }
    const err = new Error(blobRestErr(json, text, r.status));
    err.status = r.status;
    throw err;
  }
  const raw = await r.text();
  if (!raw) return { empty: true, status: 200, url: r.url || null };
  return { data: shape(JSON.parse(blobOpen(raw))), url: r.url || null };
}

async function blobRestGet() {
  if (!blobToken()) return null;
  const live = await blobRestGetName(BLOB_KEY);
  if (!live.empty || live.status !== 404) return live;
  if (!(await blobLiveProvenAbsent())) return live;
  const legacy = await blobRestGetName(BLOB_REST_KEY);
  // Never point later reads or writes at the legacy name.
  if (legacy.data) return { data: legacy.data, url: null, legacy: true };
  return live;
}

// True only when a listing shows no aia/store.json at all.
async function blobLiveProvenAbsent() {
  try {
    const listed = await blobListNames(BLOB_KEY);
    if (!listed || !Array.isArray(listed.blobs) || listed.hasMore) return false;
    return !listed.blobs.some((b) => b && b.pathname === BLOB_KEY);
  } catch (e) {
    return false;
  }
}

// Legacy-only store: live name proven absent, legacy present. Read it (SDK,
// then REST), read-only. The caller applies it; the next save goes to
// aia/store.json. Returns null when there is nothing to load.
async function blobLegacyRead() {
  if (!(await blobLiveProvenAbsent())) return null;
  const modes = blobProbe.access === "public" ? ["public", "private"] : ["private", "public"];
  let sdkAnswered = false;
  for (let i = 0; i < modes.length; i++) {
    try {
      const got = await blobGetKey(modes[i], BLOB_REST_KEY);
      if (got && got.data) {
        markBlobHit(modes[i], null);
        mem.storeLegacy = true;
        return got.data;
      }
      if (got && got.empty) sdkAnswered = true;
    } catch (e) {
      if (blobMissing(blobErrText(e))) sdkAnswered = true;
    }
  }
  // REST only when the SDK could not answer (denied or down).
  if (!sdkAnswered && blobToken()) {
    try {
      const got = await blobRestGetName(BLOB_REST_KEY);
      if (got && got.data) {
        markBlobHit("public", null);
        mem.storeLegacy = true;
        return got.data;
      }
    } catch (e) {}
  }
  return null;
}

async function blobRestPut(body) {
  if (!blobToken()) throw new Error("Vercel Blob: no BLOB_READ_WRITE_TOKEN");
  const payload = Buffer.from(blobSeal(body), "utf8");
  // Only the live name. The legacy aia-store.json is never written.
  const names = [BLOB_KEY];
  const variants = [
    {
      "x-content-type": "application/json",
      "x-add-random-suffix": "0"
    },
    {
      "x-content-type": "application/json",
      "x-add-random-suffix": "0",
      "x-allow-overwrite": "1"
    },
    {
      "x-content-type": "application/json",
      "x-add-random-suffix": "0",
      "x-vercel-blob-access": "public"
    },
    {
      "x-content-type": "application/json",
      "x-add-random-suffix": "0",
      "x-vercel-blob-access": "public",
      "x-allow-overwrite": "1"
    }
  ];
  let last = "rest put failed";
  for (let n = 0; n < names.length; n++) {
    const urls = blobRestPutUrls(names[n]);
    for (let u = 0; u < urls.length; u++) {
    for (let v = 0; v < variants.length; v++) {
      const r = await fetch(urls[u], {
        method: "PUT",
        headers: blobRestHeaders(variants[v]),
        body: payload
      });
      const text = await r.text();
      let json = {};
      try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
      if (r.ok) {
        blobProbe.auth = "rest";
        blobProbe.detail = "rest";
        return {
          url: json.url || "https://blob.vercel-storage.com/" + names[n],
          downloadUrl: json.downloadUrl || json.url || null
        };
      }
      last = blobRestErr(json, text, r.status);
    }
    }
  }
  throw new Error(last);
}

async function blobRestRead() {
  try {
    const rest = await blobRestGet();
    if (rest && rest.data) {
      markBlobHit("public", rest.url);
      if (rest.legacy) mem.storeLegacy = true;
      blobProbe.auth = "rest";
      blobProbe.detail = "rest";
      return rest.data;
    }
    if (rest && rest.empty) {
      markBlobEmpty("public");
      blobProbe.auth = "rest";
      return null;
    }
  } catch (e) {
    if (blobMissing((e && e.message) || e)) {
      markBlobEmpty("public");
      blobProbe.auth = "rest";
      return null;
    }
    throw e;
  }
  return undefined;
}

const BLOB_WRAP = "aia-blob-1";

function blobSealKey() {
  const raw = blobToken();
  if (!raw) return null;
  return crypto.createHash("sha256").update("aia-store|" + raw).digest();
}

function blobSeal(plain) {
  const key = blobSealKey();
  if (!key) return String(plain || "");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const bin = Buffer.concat([cipher.update(Buffer.from(String(plain || ""), "utf8")), cipher.final()]);
  return JSON.stringify({
    aia: BLOB_WRAP,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: bin.toString("base64")
  });
}

function blobOpen(raw) {
  const text = String(raw || "");
  if (!text) return text;
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { return text; }
  if (!parsed || parsed.aia !== BLOB_WRAP) return text;
  const key = blobSealKey();
  if (!key) throw new Error("Vercel Blob: sealed store needs BLOB_READ_WRITE_TOKEN");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(parsed.data, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function blobWantsPublic(msg) {
  return /access.*(public|private)|must be \"public\"|public store|private storage/i.test(String(msg || ""));
}

function blobMayWrite() {
  if (mem.driver === "blob") return true;
  if (blobProbe.read !== "error") return true;
  return !!(mem.account || (mem.accounts && mem.accounts.length) || (mem.workspaces && mem.workspaces.length));
}

function blobAccess() {
  return blobProbe.access === "public" ? "public" : "private";
}

function blobAccessOfUrl(url) {
  return /\.public\.blob\./i.test(String(url || "")) ? "public" : "private";
}

function blobIs403(msg) {
  return /403|forbidden/i.test(String(msg || ""));
}

function blobNeedsRetry(msg) {
  const text = String(msg || "");
  return blobIs403(text) || /no blob credentials|invalid token|unable to extract store|oidcToken was passed/i.test(text);
}

function blobMissing(msg) {
  return /not found|404|does not exist/i.test(String(msg || ""));
}

function blobGetOpts(access, auth) {
  return Object.assign({
    access: access || blobAccess(),
    useCache: false
  }, auth || blobAuthOpts());
}

function blobPutOpts(access, auth) {
  return Object.assign({
    access: access || blobAccess(),
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json"
  }, auth || blobAuthOpts());
}

function blobOpts() {
  return blobPutOpts();
}

function blobReady() {
  if (!blobAllowed()) return false;
  return !!(blobToken() || blobStoreId() || process.env.VERCEL_OIDC_TOKEN);
}

async function streamText(stream) {
  if (!stream) return "";
  if (typeof stream.text === "function") return stream.text();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function parseBlobGet(result) {
  if (result === null) return { empty: true, status: 404 };
  const status = result && (result.statusCode || result.status);
  if (status && status !== 200) return { error: true, status: status, read: "get-" + status };
  const raw = result && result.stream
    ? await streamText(result.stream)
    : result && result.blob && result.blob.body
      ? await streamText(result.blob.body)
      : "";
  if (!raw) return { empty: true, status: status || 200 };
  return {
    data: shape(JSON.parse(blobOpen(raw))),
    url: (result.blob && (result.blob.url || result.blob.downloadUrl)) || null
  };
}

async function blobGetKey(access, key) {
  const { get } = require("@vercel/blob");
  return parseBlobGet(await blobTryAuth((auth) => get(key || BLOB_KEY, blobGetOpts(access, auth))));
}

function markBlobHit(access, url) {
  blobProbe.access = access === "public" ? "public" : "private";
  blobProbe.read = "ok";
  blobProbe.status = 200;
  if (blobProbe.write !== "fail" && blobProbe.write !== "no-stick") blobProbe.detail = null;
  if (blobProbe.auth !== "token") blobProbe.auth = blobAuthKind();
  blobProbe.url = url ? "set" : blobProbe.url;
  if (url) mem.blobUrl = url;
  // Real store bytes were read; every caller applies them to mem.
  mem.storeSeen = true;
  if (!mem.storeBasis) mem.storeBasis = "read";
}

function markBlobEmpty(access) {
  if (access) blobProbe.access = access;
  blobProbe.read = "empty";
  blobProbe.status = 404;
  if (blobProbe.write !== "fail" && blobProbe.write !== "no-stick") blobProbe.detail = null;
  if (blobProbe.auth !== "token") blobProbe.auth = blobAuthKind();
}

async function blobHeadMeta() {
  const { head } = require("@vercel/blob");
  try {
    const meta = await blobTryAuth((auth) => head(BLOB_KEY, auth));
    if (!meta) return { empty: true };
    return { meta };
  } catch (e) {
    const msg = blobErrText(e);
    if (blobMissing(msg)) return { empty: true };
    throw e;
  }
}

async function blobListStore() {
  const { list } = require("@vercel/blob");
  const listed = await blobTryAuth((auth) => list(Object.assign({ prefix: "aia/", limit: 20 }, auth)));
  const blobs = (listed && listed.blobs) || [];
  return blobs.find((b) => b && (b.pathname === BLOB_KEY || String(b.pathname || "").indexOf("store.json") >= 0)) || null;
}

// Fresh-install proof. Only a listing that succeeds and holds neither store
// key proves the store is absent. An empty body, a "404" text, a 403, a 500,
// a reset or bad JSON from get/head proves nothing. SDK list first, REST list
// when the SDK is denied.
async function blobListNames(name) {
  try {
    const { list } = require("@vercel/blob");
    return await blobTryAuth((auth) => list(Object.assign({ prefix: name, limit: 10 }, auth)));
  } catch (e) {
    if (!blobToken()) throw e;
    const r = await fetch("https://vercel.com/api/blob?prefix=" + encodeURIComponent(name) + "&limit=10", { headers: blobRestHeaders() });
    if (!r.ok) throw new Error("rest-list-" + r.status);
    return JSON.parse(await r.text());
  }
}

async function blobAbsent() {
  try {
    const names = [BLOB_KEY, BLOB_REST_KEY];
    for (let i = 0; i < names.length; i++) {
      const listed = await blobListNames(names[i]);
      if (!listed || !Array.isArray(listed.blobs) || listed.hasMore) return false;
      if (listed.blobs.some((b) => b && b.pathname === names[i])) return false;
    }
    mem.storeAbsent = true;
    if (!mem.storeBasis) mem.storeBasis = "absent-proven";
    return true;
  } catch (e) {
    return false;
  }
}

// The store may be written only after this process really read it, or proved
// it absent. File-store runs (no Blob) are always trusted.
function storeTrusted() {
  if (!blobReady()) return true;
  return !!(mem.storeSeen || mem.storeAbsent);
}

// One answer for every not-ready refusal. Pages show error as-is.
const STORE_NOT_READY = "The desk can't save right now. Try again in a moment.";
const STORE_NOT_READY_CODE = "store_not_ready";
const STORE_PAUSED_LINE = "Saving is paused: this desk couldn't read its store.";

// Read-only: how this instance came to trust its store. "read" (it really
// read it), "absent-proven" (a listing proved a fresh install), or
// "not-ready" (neither; every saving request answers 503).
function storeState() {
  if (!storeTrusted()) return "not-ready";
  if (!blobReady()) return "read";
  return mem.storeBasis || (mem.storeSeen ? "read" : "absent-proven");
}

function refuseNotReady(res) {
  if (res && typeof res.setHeader === "function") res.setHeader("Retry-After", "5");
  return res.status(503).json({ ok: false, error: STORE_NOT_READY, code: STORE_NOT_READY_CODE });
}

function storeNotReady(res) {
  if (storeTrusted()) return false;
  refuseNotReady(res);
  return true;
}

// One store-call record per request (shared across module reloads). save()
// and persistScrub() mark it when they refuse to write.
const { AsyncLocalStorage } = require("async_hooks");
const storeCalls = globalThis.__aiaStoreCalls || (globalThis.__aiaStoreCalls = new AsyncLocalStorage());
const WRITE_METHODS = { POST: true, PUT: true, PATCH: true, DELETE: true };

function noteSkipped(kind) {
  const ctx = storeCalls.getStore();
  if (ctx) ctx[kind] = true;
}

// Untrusted store: one more honest look before refusing. A good read replaces
// memory (so nothing unsaved survives); a listing may still prove a fresh
// install. Anything else stays untrusted.
async function recoverStore() {
  if (storeTrusted()) return true;
  if (!globalThis.__aiaStoreLoaded) return false;
  try {
    const remote = await blobRead();
    if (remote) {
      applyStore(remote);
      mem.driver = "blob";
      mem.path = "blob:" + BLOB_KEY;
    } else if (blobProbe.read !== "error") {
      const legacy = await blobLegacyRead();
      if (legacy) {
        applyStore(legacy);
        mem.driver = "blob";
        mem.path = "blob:" + BLOB_KEY;
      } else {
        await blobAbsent();
      }
    }
  } catch (e) {}
  return storeTrusted();
}

// While untrusted, memory is the local disk copy plus whatever this request
// did. A skipped write must not leak to later requests as if saved.
function forgetUnsaved() {
  if (storeTrusted()) return;
  const driver = mem.driver;
  const where = mem.path;
  applyStore(readDisk());
  dropPersistTests();
  mem.driver = driver;
  mem.path = where;
}

// A 2xx never goes out for a request whose store write was refused.
function holdSuccess(res, ctx) {
  const blocked = () => {
    if (ctx.sent) return false;
    const code = Number(res.statusCode || 200);
    if (code < 200 || code >= 300) return false;
    return !!(ctx.skipped || (ctx.writes && ctx.scrubSkipped));
  };
  ["json", "send", "end"].forEach((name) => {
    const orig = res && res[name];
    if (typeof orig !== "function") return;
    res[name] = function (body) {
      if (blocked()) {
        ctx.sent = true;
        ctx.refused = true;
        if (typeof res.status === "function") res.status(503); else res.statusCode = 503;
        if (typeof res.setHeader === "function") res.setHeader("Retry-After", "5");
        const base = body && typeof body === "object" && !Buffer.isBuffer(body) ? body : {};
        const out = Object.assign({}, base, { ok: false, error: STORE_NOT_READY, code: STORE_NOT_READY_CODE, saved: false });
        if (name === "json") return orig.call(this, out);
        if (typeof res.setHeader === "function") res.setHeader("Content-Type", "application/json; charset=utf-8");
        return orig.call(this, JSON.stringify(out));
      }
      ctx.sent = true;
      return orig.apply(this, arguments);
    };
  });
}

// Every api/*.js handler is wrapped in this. POST/PUT/PATCH/DELETE are refused
// with a JSON 503 + Retry-After up front while the store is not trusted. Any
// request (GET included) whose save() was refused cannot answer 2xx, and its
// unsaved memory is dropped.
function guardStore(handler) {
  if (typeof handler !== "function" || handler.__storeGuarded) return handler;
  const wrapped = async function guardedHandler(req, res) {
    if (storeCalls.getStore()) return handler.apply(this, arguments);
    const method = String((req && req.method) || "GET").toUpperCase();
    const writes = !!WRITE_METHODS[method];
    if (writes && blobReady()) {
      // Same shared cold load the handlers use. A cold load that failed in
      // this request is this request's answer; a loaded but untrusted store
      // gets one fresh read.
      let loadFailed = false;
      try { await loadIfCold(); } catch (e) { loadFailed = true; }
      if (!storeTrusted() && (loadFailed || !(await recoverStore()))) return refuseNotReady(res);
    }
    const ctx = { writes, skipped: false, scrubSkipped: false, sent: false };
    holdSuccess(res, ctx);
    const self = this;
    const args = arguments;
    try {
      return await storeCalls.run(ctx, () => handler.apply(self, args));
    } finally {
      if (ctx.skipped || ctx.scrubSkipped) forgetUnsaved();
    }
  };
  Object.keys(handler).forEach((k) => { wrapped[k] = handler[k]; });
  wrapped.__storeGuarded = true;
  return wrapped;
}

async function blobFetchUrl(url, access) {
  if (!blobAllowed()) throw blobOffProd();
  if (!url) return null;
  try {
    const got = await blobGetKey(access || blobAccessOfUrl(url), url);
    if (got.data) return got;
  } catch (e) {
    if (!blobIs403(e && e.message) && !blobMissing(e && e.message)) throw e;
  }
  async function fetchWith(token) {
    const headers = token ? { Authorization: "Bearer " + token } : {};
    return fetch(url, { headers });
  }
  let r = await fetchWith(process.env.VERCEL_OIDC_TOKEN || blobToken());
  if (r.status === 403 && process.env.VERCEL_OIDC_TOKEN && blobToken()) {
    r = await fetchWith(blobToken());
    blobProbe.auth = "token";
  }
  if (r.status === 404) return { empty: true, status: 404 };
  if (!r.ok) {
    const err = new Error("Vercel Blob: Failed to fetch blob: " + r.status + " " + r.statusText);
    err.status = r.status;
    throw err;
  }
  return { data: shape(JSON.parse(blobOpen(await r.text()))), url: url };
}

async function blobRead() {
  if (!blobAllowed()) return null;
  blobProbe.token = !!(blobToken() || blobStoreId() || process.env.VERCEL_OIDC_TOKEN);
  blobProbe.auth = blobAuthKind();
  let lastErr = "";
  let saw403 = false;
  try {
    const headed = await blobHeadMeta();
    if (headed.empty) {
      markBlobEmpty(blobProbe.access || "private");
      return null;
    }
    const url = headed.meta.url || headed.meta.downloadUrl;
    const access = blobAccessOfUrl(url);
    const got = await blobFetchUrl(url, access);
    if (got && got.data) {
      markBlobHit(access, url);
      return got.data;
    }
    if (got && got.empty) {
      markBlobEmpty(access);
      return null;
    }
  } catch (e) {
    const msg = blobErrText(e);
    lastErr = msg;
    if (blobMissing(msg)) {
      markBlobEmpty(blobProbe.access || "private");
      return null;
    }
    if (blobIs403(msg) || blobNeedsRetry(msg)) {
      saw403 = blobIs403(msg) || saw403;
      try {
        const rest = await blobRestRead();
        if (rest) return rest;
        if (blobProbe.read === "empty") return null;
      } catch (re) {
        lastErr = blobErrText(re);
      }
    } else {
      try {
        const rest = await blobRestRead();
        if (rest) return rest;
        if (blobProbe.read === "empty") return null;
      } catch (re) {
        lastErr = blobErrText(re);
      }
      blobProbe.read = "error";
      blobProbe.detail = lastErr;
      blobProbe.status = e && e.status || blobProbe.status;
      return null;
    }
  }
  const modes = blobProbe.access === "public" ? ["public", "private"] : ["private", "public"];
  for (let i = 0; i < modes.length; i++) {
    const access = modes[i];
    try {
      const got = await blobGetKey(access);
      if (got.data) {
        markBlobHit(access, got.url);
        return got.data;
      }
      if (got.error) {
        if (got.status === 403) {
          saw403 = true;
          lastErr = "get-" + got.status;
          continue;
        }
        blobProbe.read = got.read || "error";
        blobProbe.status = got.status;
        return null;
      }
      markBlobEmpty(access);
      return null;
    } catch (e) {
      const msg = blobErrText(e);
      lastErr = msg;
      if (blobMissing(msg)) {
        markBlobEmpty(access);
        return null;
      }
      if (blobIs403(msg)) {
        saw403 = true;
        continue;
      }
      blobProbe.read = "error";
      blobProbe.detail = lastErr;
      return null;
    }
  }
  if (saw403) {
    try {
      const hit = await blobListStore();
      if (!hit) {
        markBlobEmpty(blobProbe.access || "private");
        return null;
      }
      const access = blobAccessOfUrl(hit.url || hit.downloadUrl);
      const got = await blobFetchUrl(hit.url || hit.downloadUrl, access);
      if (got && got.data) {
        markBlobHit(access, hit.url || hit.downloadUrl);
        return got.data;
      }
      if (got && got.empty) {
        markBlobEmpty(access);
        return null;
      }
    } catch (e) {
      lastErr = blobErrText(e);
      if (blobMissing(lastErr)) {
        markBlobEmpty(blobProbe.access || "private");
        return null;
      }
    }
    try {
      const rest = await blobRestRead();
      if (rest) return rest;
      if (blobProbe.read === "empty") return null;
    } catch (re) {
      lastErr = blobErrText(re);
    }
  }
  blobProbe.read = "error";
  blobProbe.detail = lastErr || "Failed to fetch blob";
  blobProbe.status = saw403 ? 403 : blobProbe.status;
  blobProbe.auth = blobAuthKind();
  return null;
}

async function blobPut(body, access) {
  const { put } = require("@vercel/blob");
  return blobTryAuth((auth) => put(BLOB_KEY, body, blobPutOpts(access, auth)));
}

async function blobWriteStick(blob, used) {
  const url = blob && (blob.url || blob.downloadUrl);
  if (url) {
    try {
      const got = await blobFetchUrl(url, used);
      if (got && got.data) return true;
    } catch (e) {}
  }
  try {
    const headed = await blobHeadMeta();
    if (headed && headed.meta) return true;
  } catch (e) {}
  try {
    const rest = await blobRestGet();
    if (rest && rest.data) return true;
  } catch (e) {}
  try {
    const remote = await blobRead();
    return !!remote;
  } catch (e) {
    return false;
  }
}

async function blobWrite() {
  if (!blobAllowed()) return false;
  blobProbe.token = !!(blobToken() || blobStoreId() || process.env.VERCEL_OIDC_TOKEN);
  if (blobProbe.auth !== "token") blobProbe.auth = blobAuthKind();
  const body = JSON.stringify(payload());
  try {
    let blob;
    let used = "private";
    try {
      blob = await blobPut(body, "private");
    } catch (first) {
      const msg = blobErrText(first);
      try {
        if (!blobToken() || !(blobWantsPublic(msg) || blobNeedsRetry(msg))) throw first;
        blob = await blobPut(blobSeal(body), "public");
        used = "public";
        blobProbe.detail = "sealed-public";
      } catch (second) {
        blob = await blobRestPut(body);
        used = "public";
        blobProbe.detail = "rest";
      }
    }
    blobProbe.access = used;
    blobProbe.write = "ok";
    blobProbe.status = 200;
    if (blobProbe.auth === "rest" || blobProbe.detail === "rest") blobProbe.detail = "rest";
    else blobProbe.detail = used === "public" ? "sealed-public" : "ok";
    blobProbe.url = blob && (blob.url || blob.downloadUrl) ? "set" : blobProbe.url;
    if (blob && blob.url) mem.blobUrl = blob.url;
    const stuck = await blobWriteStick(blob, used);
    if (!stuck) {
      blobProbe.write = "no-stick";
      blobProbe.detail = (blobProbe.detail || "Blob write did not stick").slice(0, 180);
      return false;
    }
    blobProbe.read = "ok";
    if (blobProbe.auth !== "token") blobProbe.auth = blobAuthKind();
    return true;
  } catch (e) {
    blobProbe.write = "fail";
    const why = blobErrText(e);
    blobProbe.detail = why && why !== "[object Object]" ? why : "blob-fail";
    return false;
  }
}

function publicBlobDetail() {
  const write = blobProbe.write;
  let detail = blobProbe.detail;
  if (write === "fail" || write === "no-stick") {
    detail = blobErrText(detail);
    if (!detail || detail === "[object Object]") {
      if (blobProbe.read === "error") return "read error — will not overwrite store";
      return write === "no-stick" ? "Blob write did not stick" : "blob-fail";
    }
    return detail;
  }
  if (write === "ok") {
    if (detail === "rest" || blobProbe.auth === "rest") return "rest";
    if (detail === "sealed-public" || blobProbe.access === "public") return "sealed-public";
    return "ok";
  }
  if (detail == null || detail === "") return null;
  if (typeof detail === "string" && detail !== "[object Object]") return detail;
  const text = blobErrText(detail);
  return text === "[object Object]" ? "blob-fail" : text;
}

function publicBlobProbe() {
  return {
    token: !!blobToken(),
    storeId: !!blobStoreId(),
    write: blobProbe.write,
    read: blobProbe.read,
    status: blobProbe.status,
    access: blobProbe.access || null,
    auth: blobProbe.auth || null,
    url: blobProbe.url ? "set" : null,
    detail: publicBlobDetail(),
    stamp: BLOB_STAMP,
    rev: blobRev() || null
  };
}

function readDisk() {
  const file = storePath();
  try {
    return shape(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (e) {
    return shape(EMPTY);
  }
}

function writeDisk() {
  const file = storePath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(payload(), null, 2));
    mem.path = file;
    return file.indexOf("/tmp") === 0 ? "tmp-file" : "file";
  } catch (e) {
    mem.path = null;
    return "memory-fallback";
  }
}

const mem = globalThis.__aia || (globalThis.__aia = Object.assign({ driver: "file", path: null }, EMPTY));

function isPersistTestJob(j) {
  if (!j || j.id === "job_mtenqutb") return false;
  const title = String(j.title || "").trim();
  const ws = slugify(j.workspace || "");
  if (ws === "consign-it-away" && /oil\s*change/i.test(title)) return false;
  const ids = PERSIST_TEST_DROP[ws] || PERSIST_TEST_DROP[j.workspace];
  if (ids && ids.indexOf(j.id) !== -1) return true;
  if (/^TEST lot\b/i.test(title)) return true;
  if (/^p1-/.test(ws) && /^TEST\b/i.test(title)) return true;
  return false;
}

function dropPersistTests() {
  const before = (mem.jobs || []).length;
  mem.jobs = (mem.jobs || []).filter((j) => !isPersistTestJob(j));
  return mem.jobs.length !== before;
}

async function persistScrub() {
  if (!dropPersistTests()) return false;
  writeDisk();
  if (blobReady() && !storeTrusted()) noteSkipped("scrubSkipped");
  if (blobReady() && storeTrusted()) {
    const ok = await blobWrite();
    if (ok) {
      mem.driver = "blob";
      mem.path = "blob:" + BLOB_KEY;
    }
  }
  return true;
}

async function hydrate() {
  if (blobReady()) {
    const remote = await blobRead();
    if (remote) {
      applyStore(remote);
      mem.driver = "blob";
      mem.path = "blob:" + BLOB_KEY;
      await persistScrub();
      return;
    }
    // Live name proven absent but the legacy copy is there: load it
    // read-only; the first save migrates it to aia/store.json.
    if (blobProbe.read !== "error") {
      const legacy = await blobLegacyRead();
      if (legacy) {
        applyStore(legacy);
        mem.driver = "blob";
        mem.path = "blob:" + BLOB_KEY;
        return;
      }
    }
    // No data and no error: an empty body or a false 404 lands here too, so
    // the starter goes up only when a listing proves the store absent.
    if (blobProbe.read !== "error" && !(await blobAbsent())) {
      blobProbe.read = "error";
      blobProbe.detail = "store not proven absent — will not write starter";
    }
    if (blobProbe.read === "error") {
      applyStore(readDisk());
      dropPersistTests();
      mem.driver = writeDisk();
      mem.path = storePath();
      return;
    }
    applyStore(readDisk());
    dropPersistTests();
    writeDisk();
    const ok = await blobWrite();
    if (ok) {
      mem.driver = "blob";
      mem.path = "blob:" + BLOB_KEY;
      return;
    }
  }
  applyStore(readDisk());
  dropPersistTests();
  mem.driver = writeDisk();
  mem.path = storePath();
}

if (!globalThis.__aiaHydrate) {
  globalThis.__aiaHydrate = hydrate();
  // Loaded means this process finished a hydrate. A rejection leaves the flag
  // unset so a later loadIfCold() can try again. ready() still awaits this
  // same promise.
  globalThis.__aiaHydrate.then(function () {
    globalThis.__aiaStoreLoaded = true;
  }, function () {
    globalThis.__aiaStoreLoaded = false;
  });
}

function applyStore(parsed) {
  const next = shape(parsed);
  mem.account = next.account;
  mem.accounts = next.accounts;
  mem.sessions = next.sessions;
  mem.approvals = next.approvals;
  mem.locks = next.locks;
  mem.connections = next.connections;
  mem.jobs = next.jobs;
  mem.audit = next.audit;
  mem.money = next.money;
  mem.workspaces = next.workspaces;
  mem.inbox = next.inbox;
  mem.files = next.files;
  mem.tickets = next.tickets;
  mem.packs = next.packs;
  mem.mail = next.mail;
  mem.migrations = next.migrations;
  return mem;
}

async function ready() {
  await globalThis.__aiaHydrate;
  if (blobReady()) {
    const remote = await blobRead();
    if (remote) {
      applyStore(remote);
      mem.driver = "blob";
      mem.path = "blob:" + BLOB_KEY;
    }
  }
  await persistScrub();
}

// Read-only twin of ready() for GET checks like /api/health. Same first-load
// wait and same blob re-read, but it never writes: no persistScrub(), no
// save(). Test rows are dropped from mem only, so counts match ready().
async function readyRead() {
  await globalThis.__aiaHydrate;
  if (blobReady()) {
    const remote = await blobRead();
    if (remote) {
      applyStore(remote);
      mem.driver = "blob";
      mem.path = "blob:" + BLOB_KEY;
    }
  }
  dropPersistTests();
}

function captureMem() {
  return {
    data: JSON.parse(JSON.stringify(payload())),
    driver: mem.driver,
    path: mem.path
  };
}

function revertMem(shot) {
  if (!shot) return;
  applyStore(shot.data);
  mem.driver = shot.driver;
  mem.path = shot.path;
}

// Cold instance: mem is still the empty starter until the in-flight hydrate
// finishes. Warm instance: that hydrate already resolved, so return without
// reading the blob or replacing mem. Concurrent callers share one attempt.
// A rejected attempt does not mark the store loaded and does not keep a
// partial apply. ready() is unchanged and still re-reads for its own callers.
async function loadIfCold() {
  if (globalThis.__aiaStoreLoaded) return;
  if (globalThis.__aiaColdInflight) return globalThis.__aiaColdInflight;
  const joinModule = !globalThis.__aiaColdTried;
  globalThis.__aiaColdTried = true;
  const before = captureMem();
  let job;
  job = (async () => {
    try {
      if (joinModule) await globalThis.__aiaHydrate;
      else await hydrate();
      globalThis.__aiaStoreLoaded = true;
    } catch (err) {
      // The module promise stays rejected so ready() still observes it.
      // save() must not wait on that rejection after a later successful load.
      globalThis.__aiaHydrateRejected = true;
      revertMem(before);
      throw err;
    } finally {
      if (globalThis.__aiaColdInflight === job) globalThis.__aiaColdInflight = null;
    }
  })();
  globalThis.__aiaColdInflight = job;
  return job;
}

async function save() {
  // Wait for first hydrate only. Do not call ready() — that re-reads the blob
  // and would replace in-request mutations (onboard, sessions, Studio Open login)
  // with the pre-mutation snapshot before write.
  // After a rejected cold load, a successful retry has already filled mem.
  // Waiting on the original rejected promise would throw away that save.
  // ready() still awaits the original promise.
  if (!(globalThis.__aiaStoreLoaded && globalThis.__aiaHydrateRejected)) {
    await globalThis.__aiaHydrate;
  }
  if (!storeTrusted()) {
    // Never read and not proven absent: write nothing, not even the disk copy.
    blobProbe.write = "fail";
    blobProbe.detail = "store not loaded — will not overwrite store";
    noteSkipped("skipped");
    return false;
  }
  dropPersistTests();
  const disk = writeDisk();
  if (blobReady()) {
    if (!blobMayWrite()) {
      mem.driver = disk;
      if (blobProbe.write !== "ok") {
        blobProbe.write = "fail";
        const why = blobErrText(blobProbe.detail);
        blobProbe.detail = why && why !== "blob-fail"
          ? why
          : "read error — will not overwrite store";
      }
      return disk !== "memory-fallback";
    }
    const ok = await blobWrite();
    if (ok) {
      mem.driver = "blob";
      mem.path = "blob:" + BLOB_KEY;
      return true;
    }
  }
  mem.driver = disk;
  return disk !== "memory-fallback";
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Workspace, X-Pin, X-Session");
}

function configured(provider) {
  if (provider === "whatnot") return false;
  const spec = PROVIDERS[provider];
  if (!spec) return false;
  if (!spec.env.length) return true;
  return spec.env.every((k) => !!process.env[k]);
}

function catalog() {
  return Object.entries(PROVIDERS).map(([id, spec]) => ({
    id,
    label: spec.label,
    acts: spec.acts,
    live: configured(id),
    status: id === "whatnot" ? "down" : configured(id) ? "live" : "hold",
    note: id === "whatnot"
      ? "Not a launch pipe"
      : configured(id) ? "This pipe is set up." : "Hold until this pipe is set up."
  }));
}

// Site address for generated links/callbacks: live host on production only (api/_public-host.js).
const { PUBLIC_HOST, hookUrl, publicUrl } = require("./_public-host");

function pipeWroteBack(dispatch) {
  return !!(dispatch && !dispatch.demo && (dispatch.ok === true || dispatch.inbound === true));
}

function pipesAnswered(workspace) {
  const ws = String(workspace || "");
  if (!ws) return false;
  return (mem.jobs || []).some((j) => j && j.workspace === ws && pipeWroteBack(j.dispatch));
}

function answeredProviders(workspace) {
  const ws = String(workspace || "");
  const ids = [];
  if (!ws) return ids;
  (mem.jobs || []).forEach((j) => {
    if (!j || j.workspace !== ws || !pipeWroteBack(j.dispatch)) return;
    const provider = (j.dispatch && j.dispatch.provider) || j.provider;
    if (provider && ids.indexOf(provider) < 0) ids.push(provider);
  });
  return ids;
}

const RULE_TEXT_MAX = 140;
const RULE_MAX = 8;
const RULE_FORBID = /auto[-\s]?pay|auto[-\s]?list|auto[-\s]?ship|auto[-\s]?release|un-?\s?kill|skip\s+(the\s+)?(kill|payout|pay\b|named\s+outbound|live\s+list|outbound)|live\s+list|mark\s+ebay|ebay\s+live|set\s+ebay|go\s+live\s+on\s+ebay/;
const RULE_FORBID_MSG = "Hard stops still win. A rule cannot skip payout, Kill, a live list, or named outbound. It cannot auto-pay, auto-list, or un-kill junk.";

function scrubLog(s) {
  return String(s == null ? "" : s)
    .replace(/x-pin["'\s:=]+[^,\s]+/ig, "x-pin:[redacted]")
    .replace(/x-session["'\s:=]+[^,\s]+/ig, "x-session:[redacted]")
    .replace(/aia_session=[^;\s]+/ig, "aia_session=[redacted]")
    .replace(/\bpin["'\s:=]+\d+/ig, "pin:[redacted]");
}

function log(agent, action, result, workspace) {
  mem.audit.unshift({
    t: new Date().toISOString(),
    agent: scrubLog(agent),
    action: scrubLog(action),
    result: scrubLog(result),
    workspace: workspace || null,
    undo: result === "OK"
  });
  mem.audit = mem.audit.slice(0, 200);
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function hashPin(pin) {
  return crypto
    .createHash("sha256")
    .update(String(pin) + ":" + (process.env.AIA_PIN_SALT || "aia-pilot"))
    .digest("hex");
}

function workspaceOf(req) {
  req = req || {};
  const headers = req.headers || {};
  const query = req.query || {};
  return slugify(headers["x-workspace"] || query.workspace || "");
}

function ensureAuthState() {
  if (!Array.isArray(mem.accounts)) mem.accounts = [];
  if (!Array.isArray(mem.sessions)) mem.sessions = [];
  if (!Array.isArray(mem.approvals)) mem.approvals = [];
  if (!Array.isArray(mem.locks)) mem.locks = [];
  return mem;
}

function hashSession(token) {
  return hashPin("session|" + String(token || ""));
}

function parseCookies(req) {
  const raw = String((req && req.headers && req.headers.cookie) || "");
  const out = {};
  raw.split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i < 0) return;
    const key = part.slice(0, i).trim();
    if (!key) return;
    const val = part.slice(i + 1).trim();
    try { out[key] = decodeURIComponent(val); } catch (e) { out[key] = val; }
  });
  return out;
}

function sessionTokenOf(req) {
  const headers = (req && req.headers) || {};
  return String(headers["x-session"] || parseCookies(req).aia_session || "").trim();
}

function sessionMaxAge() {
  return SESSION_DAYS * 24 * 60 * 60;
}

function sessionExpiresAt(now) {
  return new Date(now + sessionMaxAge() * 1000).toISOString();
}

function sessionPublic(row, token) {
  if (!row) return null;
  const out = {
    id: row.id,
    workspace: row.workspace || "",
    personId: row.personId || "",
    accountId: row.accountId || "",
    role: row.role || "",
    name: row.name || "",
    createdAt: row.createdAt || "",
    seenAt: row.seenAt || row.createdAt || "",
    expiresAt: row.expiresAt || "",
    current: !!row.current,
    walletAddress: row.walletAddress || "",
    walletChainId: row.walletChainId || 0
  };
  if (token) out.token = token;
  if (row.ua) out.ua = row.ua;
  return out;
}

function pruneSessions() {
  ensureAuthState();
  const now = Date.now();
  mem.sessions = (mem.sessions || []).filter((row) => {
    if (!row || !row.tokenHash) return false;
    if (!row.expiresAt) return true;
    const t = Date.parse(row.expiresAt);
    return !Number.isFinite(t) || t > now;
  });
  return mem.sessions;
}

function sessionMatches(row, hint) {
  const h = hint || {};
  if (!row) return false;
  if (h.id && row.id !== h.id) return false;
  if (h.accountId && row.accountId !== h.accountId) return false;
  if (h.personId && row.personId !== h.personId) return false;
  if (h.workspace && row.workspace !== slugify(h.workspace)) return false;
  return !!(h.id || h.accountId || h.personId || h.workspace) ? true : true;
}

function touchSession(row, req) {
  if (!row) return row;
  const now = Date.now();
  row.seenAt = new Date(now).toISOString();
  row.expiresAt = sessionExpiresAt(now);
  const headers = (req && req.headers) || {};
  const ua = String(headers["user-agent"] || "").trim().slice(0, 160);
  if (ua) row.ua = ua;
  const ip = String(headers["x-forwarded-for"] || headers["x-real-ip"] || "").split(",")[0].trim().slice(0, 80);
  if (ip) row.ip = ip;
  return row;
}

function findSession(token, options) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  pruneSessions();
  const row = (mem.sessions || []).find((item) => item && item.tokenHash === hashSession(raw)) || null;
  if (!row) return null;
  const opts = options || {};
  if (opts.slide !== false) touchSession(row, opts.req);
  return row;
}

function listSessions(hint) {
  const h = hint || {};
  const currentHash = h.currentToken ? hashSession(h.currentToken) : "";
  return pruneSessions()
    .filter((row) => sessionMatches(row, h))
    .sort((a, b) => String(b.seenAt || b.createdAt || "").localeCompare(String(a.seenAt || a.createdAt || "")))
    .slice(0, 32)
    .map((row) => sessionPublic(Object.assign({}, row, { current: !!(currentHash && row.tokenHash === currentHash) })));
}

function revokeSession(tokenOrId, hint) {
  ensureAuthState();
  pruneSessions();
  const raw = String(tokenOrId || "").trim();
  const tokenHash = raw && !/^sess_/i.test(raw) ? hashSession(raw) : "";
  const id = /^sess_/i.test(raw) ? raw : "";
  let removed = 0;
  mem.sessions = (mem.sessions || []).filter((row) => {
    if (!row) return false;
    const hit = (tokenHash && row.tokenHash === tokenHash) || (id && row.id === id) || (!tokenHash && !id && sessionMatches(row, hint));
    const allowed = hit && (!hint || sessionMatches(row, hint));
    if (allowed) {
      removed += 1;
      return false;
    }
    return true;
  });
  return removed;
}

function issueSession(person, workspace, account, req) {
  ensureAuthState();
  pruneSessions();
  const now = Date.now();
  const token = crypto.randomBytes(24).toString("hex");
  const row = {
    id: "sess_" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
    tokenHash: hashSession(token),
    workspace: slugify((workspace && workspace.slug) || (account && account.slug) || (req && workspaceOf(req)) || ""),
    accountId: (account && account.id) || (person && person.accountId) || (workspace && workspace.accountId) || "",
    personId: (person && person.id) || "",
    name: (person && person.name) || "",
    role: (person && person.role) || "",
    email: (person && person.email) || (account && account.email) || "",
    createdAt: new Date(now).toISOString(),
    seenAt: new Date(now).toISOString(),
    expiresAt: sessionExpiresAt(now)
  };
  touchSession(row, req);
  const group = (mem.sessions || [])
    .filter((item) => item && ((row.accountId && item.accountId === row.accountId) || (!row.accountId && item.workspace === row.workspace && item.personId === row.personId)))
    .sort((a, b) => String(b.seenAt || b.createdAt || "").localeCompare(String(a.seenAt || a.createdAt || "")));
  const keep = new Set(group.slice(0, SESSION_MAX - 1).map((item) => item.id));
  mem.sessions = (mem.sessions || []).filter((item) => !item || !group.length || keep.has(item.id) || !(((row.accountId && item.accountId === row.accountId) || (!row.accountId && item.workspace === row.workspace && item.personId === row.personId))));
  mem.sessions.unshift(row);
  return sessionPublic(row, token);
}

function sessionCookie(token) {
  return "aia_session=" + encodeURIComponent(String(token || "")) + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + sessionMaxAge();
}

function clearSessionCookie() {
  return "aia_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
}

function sessionFromReq(req, options) {
  const token = sessionTokenOf(req);
  if (!token) return null;
  const row = findSession(token, Object.assign({ req }, options || {}));
  if (!row) return null;
  if (req) {
    req.__aiaSessionToken = token;
    req.__aiaSession = sessionPublic(row);
  }
  return { token, session: row };
}

function pruneLocks() {
  ensureAuthState();
  const now = Date.now();
  mem.locks = (mem.locks || []).filter((row) => {
    if (!row || !row.id) return false;
    const until = row.until ? Date.parse(row.until) : NaN;
    if (Number.isFinite(until) && until <= now) {
      row.until = null;
      row.count = 0;
    }
    return !!row.id;
  });
  return mem.locks;
}

function lockRow(id, create) {
  ensureAuthState();
  pruneLocks();
  const key = String(id || "").trim();
  if (!key) return null;
  let row = (mem.locks || []).find((item) => item && item.id === key) || null;
  if (!row && create) {
    row = { id: key, count: 0, until: null, lastFailAt: null, lastOkAt: null };
    mem.locks.unshift(row);
  }
  return row;
}

function isLocked(id) {
  const row = lockRow(id, false);
  if (!row || !row.until) return false;
  const until = Date.parse(row.until);
  if (!Number.isFinite(until) || until <= Date.now()) {
    row.until = null;
    row.count = 0;
    return false;
  }
  return true;
}

function noteFail(id) {
  const row = lockRow(id, true);
  if (!row) return { ok: false };
  const now = Date.now();
  if (!isLocked(id) && row.until) {
    row.until = null;
    row.count = 0;
  }
  row.count = Number(row.count || 0) + 1;
  row.lastFailAt = new Date(now).toISOString();
  if (row.count >= LOCK_FAILS) row.until = new Date(now + LOCK_MINUTES * 60 * 1000).toISOString();
  return { ok: true, locked: isLocked(id), count: row.count, until: row.until };
}

function noteOk(id) {
  const row = lockRow(id, false);
  if (!row) return { ok: true, cleared: false };
  row.count = 0;
  row.until = null;
  row.lastOkAt = new Date().toISOString();
  return { ok: true, cleared: true };
}

function ensurePeople(ws) {
  if (!ws) return null;
  if (!Array.isArray(ws.people) || !ws.people.length) {
    ws.people = [{
      id: "p_owner",
      name: ws.name || "Owner",
      role: "owner",
      pin: ws.pin,
      email: ws.email || "",
      createdAt: ws.createdAt || new Date().toISOString()
    }];
  } else if (ws.pin) {
    const owner = ws.people.find((p) => p && p.role === "owner");
    if (owner && !owner.pin) owner.pin = ws.pin;
  }
  return ws;
}

function publicPerson(p) {
  if (!p) return null;
  const kind = p.kind || (p.role === "owner" ? "owner" : "");
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    email: p.email || "",
    kind: kind,
    status: p.status || "approved",
    deskAi: !!p.deskAi,
    does: p.does || "",
    prompt: String(p.prompt || "").trim().slice(0, 160),
    aia: p.aia || "",
    aiId: p.aiId || "",
    accountId: p.accountId || "",
    requestedKind: p.requestedKind || ""
  };
}

function sessionLooksOwner(session) {
  if (!session) return false;
  const role = String(session.role || session.kind || "").toLowerCase();
  if (role === "owner") return true;
  return /_owner$/.test(String(session.personId || ""));
}

function seatLooksOwner(person) {
  if (!person) return false;
  const role = String(person.role || "").toLowerCase();
  const kind = String(person.kind || "").toLowerCase();
  return role === "owner" || kind === "owner";
}

function seatOpen(person) {
  return !!(person && person.status !== "pending" && person.status !== "denied");
}

function ownerSeatOf(ws) {
  return ((ws && ws.people) || []).find((p) => seatOpen(p) && seatLooksOwner(p)) || null;
}

function sessionOwnerPerson(session, ws) {
  const seated = ownerSeatOf(ws);
  if (seated) return seated;
  return {
    id: (session && session.personId) || "owner",
    name: (session && session.name) || "Owner",
    role: "owner",
    kind: "owner",
    status: "approved",
    accountId: (session && session.accountId) || "",
    email: (session && session.email) || "",
    deskAi: false
  };
}

function personOf(req, workspaceSlug) {
  req = req || {};
  const headers = req.headers || {};
  const query = req.query || {};
  const fromSession = sessionFromReq(req, { slide: true });
  const asked = String(headers["x-workspace"] || query.workspace || workspaceSlug || "").trim();
  const slug = slugify(asked || (fromSession && fromSession.session && fromSession.session.workspace) || "");
  const fallbackSlug = fromSession && fromSession.session ? fromSession.session.workspace : "";
  const ws = ensurePeople(mem.workspaces.find((w) => w.slug === slug) || mem.workspaces.find((w) => w && w.slug === fallbackSlug) || null);
  if (!ws) return { workspace: null, person: null };
  if (fromSession && fromSession.session) {
    const session = fromSession.session;
    const people = ws.people || [];
    let person = people.find((p) => seatOpen(p) && session.personId && p.id === session.personId) || null;
    if (person && sessionLooksOwner(session) && !seatLooksOwner(person)) person = null;
    if (!person && session.accountId) {
      person = people.find((p) => seatOpen(p) && p.accountId && p.accountId === session.accountId && seatLooksOwner(p))
        || people.find((p) => seatOpen(p) && p.accountId && p.accountId === session.accountId) || null;
    }
    if (!person && session.email) {
      const e = String(session.email).trim().toLowerCase();
      person = people.find((p) => seatOpen(p) && p.email && String(p.email).trim().toLowerCase() === e) || null;
    }
    if (person && sessionLooksOwner(session) && !seatLooksOwner(person)) person = null;
    if (!person && sessionLooksOwner(session)) person = sessionOwnerPerson(session, ws);
    if (person && person.status === "pending") return { workspace: ws, person: null, pending: true, session: sessionPublic(session) };
    if (person && person.status === "denied") return { workspace: ws, person: null, denied: true, session: sessionPublic(session) };
    if (person) return { workspace: ws, person, session: sessionPublic(session) };
  }
  const raw = String(headers["x-pin"] || "");
  if (!raw) return { workspace: ws, person: null };
  const hashed = hashPin(raw);
  const person = (ws.people || []).find((p) => p && p.pin === hashed)
    || (ws.pin === hashed ? ownerSeatOf(ws) : null);
  if (person && person.status === "pending") return { workspace: ws, person: null, pending: true };
  if (person && person.status === "denied") return { workspace: ws, person: null, denied: true };
  return { workspace: ws, person: person || null };
}

// Shared seat helper for GET /api/jobs and POST /api/hook.
// personOf reads X-Pin, X-Session, and the aia_session cookie.
// An open seat is an approved person. A waiting seat, a denied seat, a wrong code, and a stranger are not.
function deskSeat(req, workspaceSlug) {
  return personOf(req, workspaceSlug);
}

function isOwner(person) {
  return seatLooksOwner(person);
}

const NOUN_KEYS = ["capture", "qualify", "do", "collect", "follow"];
const NOUN_MAX = 24;
const DEFAULT_NOUNS = {
  capture: "Capture",
  qualify: "Qualify",
  do: "Do",
  collect: "Collect",
  follow: "Follow"
};

function defaultNouns() {
  return {
    capture: DEFAULT_NOUNS.capture,
    qualify: DEFAULT_NOUNS.qualify,
    do: DEFAULT_NOUNS.do,
    collect: DEFAULT_NOUNS.collect,
    follow: DEFAULT_NOUNS.follow
  };
}

function cleanNoun(val, fallback) {
  const t = String(val == null ? "" : val).trim().replace(/\s+/g, " ").slice(0, NOUN_MAX);
  return t || fallback;
}

function publicNouns(src) {
  const n = src && typeof src === "object" ? src : {};
  return {
    capture: cleanNoun(n.capture, DEFAULT_NOUNS.capture),
    qualify: cleanNoun(n.qualify, DEFAULT_NOUNS.qualify),
    do: cleanNoun(n.do, DEFAULT_NOUNS.do),
    collect: cleanNoun(n.collect, DEFAULT_NOUNS.collect),
    follow: cleanNoun(n.follow, DEFAULT_NOUNS.follow)
  };
}

function ensureNouns(ws) {
  if (!ws) return defaultNouns();
  if (!ws.nouns || typeof ws.nouns !== "object") ws.nouns = defaultNouns();
  return publicNouns(ws.nouns);
}

function setWorkspaceNouns(ws, incoming) {
  if (!ws) return { ok: false, error: "Open a desk first so the words have a home." };
  const src = incoming && typeof incoming === "object" ? incoming : {};
  ws.nouns = publicNouns(src);
  return { ok: true, nouns: publicNouns(ws.nouns) };
}

function publicRuleWidget(w) {
  if (!w || typeof w !== "object") return { on: false, label: "" };
  return {
    on: !!w.on,
    label: String(w.label || "").trim().replace(/\s+/g, " ").slice(0, NOUN_MAX)
  };
}

function clipRule(s, n) {
  return String(s == null ? "" : s).trim().replace(/\s+/g, " ").slice(0, n || 80);
}

function publicRule(r) {
  if (!r) return null;
  const when = normalizeWhen(r.when || r.attach);
  const then = normalizeThen(r.then);
  return {
    id: r.id,
    text: r.text,
    seed: !!r.seed,
    attach: when,
    when: when,
    then: then,
    ifMoney: r.ifMoney != null && Number.isFinite(Number(r.ifMoney)) ? Number(r.ifMoney) : null,
    contains: clipRule(r.contains, 80),
    ifField: clipRule(r.ifField, 32),
    ifValue: clipRule(r.ifValue, 80),
    ifTag: clipRule(r.ifTag, 40),
    ifStatus: clipRule(r.ifStatus, 32),
    ifUnassigned: !!r.ifUnassigned,
    ifOlder: r.ifOlder != null && Number.isFinite(Number(r.ifOlder)) ? Number(r.ifOlder) : null,
    tag: clipRule(r.tag || r.thenTag, 40),
    aiId: clipRule(r.aiId || (r.ai && r.ai.id) || "", 40),
    aiName: clipRule(r.aiName || (r.ai && r.ai.name) || "", 40),
    widget: publicRuleWidget(r.widget)
  };
}

function moneyWaitOf(rules) {
  let hold = null;
  (rules || []).forEach((r) => {
    const t = String((r && r.text) || "").toLowerCase();
    if (!t) return;
    const dollar = t.match(/\$\s*(\d+(?:\.\d+)?)/);
    const moneyWord = /\b(money|pay(?:ment|out)?s?|amount|invoice|\$)\b/.test(t);
    const ownerWait = /wait(?:s|ing)?\s+(?:for|on)\s+(?:the\s+)?owner/.test(t)
      || /owner\s+(?:must|confirms?|releases?|taps?)/.test(t)
      || (/\bowner\b/.test(t) && /\bwait/.test(t));
    if (dollar && (ownerWait || moneyWord || /over|above|more than|at least/.test(t))) {
      const n = Number(dollar[1]);
      if (Number.isFinite(n) && (hold == null || n < hold)) hold = n;
    } else if (ownerWait && moneyWord) {
      if (hold == null) hold = 0;
    }
  });
  return hold;
}

function moneyNeedsOwner(amount, hold) {
  if (hold == null) return false;
  const n = Number(amount);
  if (!Number.isFinite(n)) return false;
  if (hold === 0) return n > 0;
  return n >= hold;
}

function widgetsOn(rules) {
  return (rules || []).filter((r) => r && r.widget && r.widget.on);
}

function widgetCount(rules) {
  return widgetsOn(rules).length;
}

function setRuleWidget(ws, id, on, label) {
  if (!ws) return { ok: false, error: "Open a desk first so rules have a home." };
  if (!Array.isArray(ws.rules)) ensureRules(ws);
  const key = String(id || "");
  const rule = (ws.rules || []).find((r) => r && r.id === key);
  if (!rule) return { ok: false, error: "Rule not found." };
  const next = publicRuleWidget(rule.widget);
  if (on != null) next.on = !!on;
  if (label != null) next.label = String(label).trim().replace(/\s+/g, " ").slice(0, NOUN_MAX);
  rule.widget = next;
  return { ok: true, rule: publicRule(rule), rules: ws.rules.map(publicRule).filter(Boolean) };
}

const RULE_WHEN = ["drop", "pipe", "inbound", "status", "capture", "qualify", "do", "collect", "follow"];
const RULE_THEN = ["draft", "queue", "notify", "note", "wait", "stop", "tag", "escalate"];
const RULE_IF = ["qualify", "contains", "tag", "status", "unassigned", "older", "money", "field"];

function normalizeWhen(when) {
  const w = String(when || "").toLowerCase().trim();
  if (RULE_WHEN.indexOf(w) >= 0) return w;
  if (w === "hook" || w === "webhook") return "pipe";
  if (w === "aia" || w === "mail" || w === "email") return "inbound";
  if (w === "done" || w === "change") return "status";
  return "qualify";
}

function normalizeThen(then) {
  const t = String(then || "").toLowerCase().trim();
  if (RULE_THEN.indexOf(t) >= 0) return t;
  if (t === "cap" || t === "priority") return "escalate";
  if (t === "alert" || t === "card") return "queue";
  if (t === "hold") return "wait";
  if (t === "kill") return "stop";
  return "note";
}

function parseDelayHours(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const t = String(raw).toLowerCase().trim();
  const n = Number((t.match(/(\d+(?:\.\d+)?)/) || [])[1]);
  if (!Number.isFinite(n)) return null;
  if (/day/.test(t)) return n * 24;
  if (/min/.test(t)) return n / 60;
  return n;
}

function jobOlderHours(job, now) {
  const t = Date.parse((job && (job.createdAt || job.qualifiedAt)) || "") || 0;
  if (!t) return 0;
  return ((now || Date.now()) - t) / 3600000;
}

function jobTagsOf(job) {
  const raw = (job && job.tags) || (job && job.custom && job.custom.tags) || [];
  const list = Array.isArray(raw) ? raw : String(raw).split(/[,;]+/);
  return list.map(function (s) { return String(s || "").trim(); }).filter(Boolean);
}

function jobAssigned(job) {
  if (!job) return false;
  if (job.assignee) return true;
  if (job.handedTo && (job.handedTo.name || job.handedTo.id)) return true;
  return false;
}

function isPipeJob(job) {
  if (!job) return false;
  const blob = [job.from, job.provider, job.lane, job.source, job.why].join(" ").toLowerCase();
  return /\b(pipe|webhook|hook|zapier|make)\b/.test(blob) || job.lane === "ext";
}

function isInboundAia(job) {
  if (!job) return false;
  const blob = [job.from, job.inbound, job.to, job.aiaMail, job.aia, job.source].join(" ");
  return /@[\w.-]+\.aia\b/i.test(blob) || /\binbound\b/i.test(blob);
}

function flattenWorkflows(pack) {
  const src = pack && typeof pack === "object" ? pack : {};
  const rows = [].concat(src.workflows || [], src.sequences || []);
  const rules = [];
  rows.forEach(function (wf) {
    if (!wf) return;
    const delay = parseDelayHours(wf.delay || wf.delayHours);
    const branch = clipRule(wf.branch, 80);
    [].concat(wf.rules || wf.steps || []).forEach(function (r) {
      if (!r) return;
      const copy = typeof r === "string" ? { text: r } : Object.assign({}, r);
      if (delay != null && (copy.ifOlder == null || copy.ifOlder === "")) copy.ifOlder = delay;
      if (branch && !copy.contains && !copy.ifTag) copy.contains = branch;
      rules.push(copy);
    });
  });
  return rules;
}

function publicWorkflow(wf) {
  if (!wf) return null;
  const rules = [].concat(wf.rules || wf.steps || []).map(function (r) {
    return typeof r === "string" ? { text: clipRule(r, RULE_TEXT_MAX) } : publicRule(Object.assign({ id: r.id || "wf" }, r));
  }).filter(Boolean);
  return {
    id: clipRule(wf.id || wf.name, 40),
    name: clipRule(wf.name || wf.id, 80),
    delay: wf.delay || wf.delayHours || null,
    branch: clipRule(wf.branch, 80),
    rules: rules.slice(0, RULE_MAX)
  };
}

function ruleStarters() {
  return [];
}

function applyRuleBody(rule, src) {
  if (!rule || !src || typeof src !== "object") return rule;
  if (src.when != null && src.when !== "") rule.when = normalizeWhen(src.when);
  if (src.then != null && src.then !== "") rule.then = normalizeThen(src.then);
  if (src.ifMoney != null) {
    const n = Number(src.ifMoney);
    rule.ifMoney = Number.isFinite(n) ? n : null;
  }
  if (src.contains != null) rule.contains = clipRule(src.contains, 80);
  if (src.ifField != null) rule.ifField = clipRule(src.ifField, 32);
  if (src.ifValue != null) rule.ifValue = clipRule(src.ifValue, 80);
  if (src.ifTag != null) rule.ifTag = clipRule(src.ifTag, 40);
  if (src.ifStatus != null) rule.ifStatus = clipRule(src.ifStatus, 32);
  if (src.ifUnassigned != null) rule.ifUnassigned = !!src.ifUnassigned;
  if (src.ifOlder != null) {
    const n = parseDelayHours(src.ifOlder);
    rule.ifOlder = n;
  }
  if (src.tag != null || src.thenTag != null) rule.tag = clipRule(src.tag || src.thenTag, 40);
  if (src.aiId != null) rule.aiId = clipRule(src.aiId, 40);
  if (src.aiName != null) rule.aiName = clipRule(src.aiName, 40);
  return rule;
}

function defaultRules() {
  return [];
}

function forbiddenRule(text) {
  return RULE_FORBID.test(String(text || "").toLowerCase());
}

function ensureRules(ws) {
  if (!ws) return [];
  if (!Array.isArray(ws.rules)) ws.rules = [];
  return ws.rules.map(publicRule).filter(Boolean);
}

function ruleTextOf(src) {
  if (src && typeof src === "object") return String(src.text || "");
  return String(src == null ? "" : src);
}

function addWorkspaceRule(ws, src, person) {
  if (!ws) return { ok: false, error: "Open a desk first so rules have a home." };
  if (!Array.isArray(ws.rules)) ensureRules(ws);
  const clean = ruleTextOf(src).trim().replace(/\s+/g, " ");
  if (clean.length < 4) return { ok: false, error: "Type a small wait-for-owner line." };
  if (clean.length > RULE_TEXT_MAX) return { ok: false, error: "Keep the rule short." };
  if (forbiddenRule(clean)) return { ok: false, error: RULE_FORBID_MSG };
  if ((ws.rules || []).some((r) => r && r.text === clean)) {
    return { ok: false, error: "That rule is already on this desk." };
  }
  if ((ws.rules || []).length >= RULE_MAX) {
    return { ok: false, error: "This desk has enough rules." };
  }
  const body = src && typeof src === "object" ? src : {};
  const rule = {
    id: "rule_" + Date.now().toString(36),
    text: clean,
    seed: false,
    attach: "qualify",
    when: "qualify",
    then: "note",
    ifMoney: null,
    aiId: "",
    aiName: "",
    widget: { on: false, label: "" },
    createdAt: new Date().toISOString(),
    by: (person && person.name) || "owner"
  };
  applyRuleBody(rule, body);
  rule.attach = rule.when;
  ws.rules.push(rule);
  return { ok: true, rule: publicRule(rule), rules: ws.rules.map(publicRule).filter(Boolean) };
}

function updateWorkspaceRule(ws, id, body) {
  if (!ws) return { ok: false, error: "Open a desk first so rules have a home." };
  if (!Array.isArray(ws.rules)) ensureRules(ws);
  const key = String(id || "");
  const rule = (ws.rules || []).find((r) => r && r.id === key);
  if (!rule) return { ok: false, error: "Rule not found." };
  const src = body && typeof body === "object" ? body : {};
  if (src.text != null) {
    const clean = String(src.text || "").trim().replace(/\s+/g, " ");
    if (clean.length < 4) return { ok: false, error: "Type a small wait-for-owner line." };
    if (clean.length > RULE_TEXT_MAX) return { ok: false, error: "Keep the rule short." };
    if (forbiddenRule(clean)) return { ok: false, error: RULE_FORBID_MSG };
    rule.text = clean;
  }
  applyRuleBody(rule, src);
  rule.attach = rule.when || rule.attach || "qualify";
  return { ok: true, rule: publicRule(rule), rules: ws.rules.map(publicRule).filter(Boolean) };
}

function whenMatches(ruleWhen, step, job) {
  const w = String(ruleWhen || "").toLowerCase();
  const s = String(step || "").toLowerCase();
  if (!w || !s || w === "any" || w === s) return true;
  if (w === "drop" && (s === "capture" || s === "drop")) return true;
  if (w === "pipe" && (s === "pipe" || s === "capture") && isPipeJob(job)) return true;
  if (w === "inbound" && (s === "inbound" || s === "capture") && isInboundAia(job)) return true;
  if (w === "status" && (s === "status" || s === "do" || s === "follow" || s === "done")) return true;
  if (w === "capture" && s === "drop") return true;
  return false;
}

function ifMatches(rule, job, now) {
  if (!rule || !job) return false;
  if (rule.ifKind && String(job.kind || "").toLowerCase() !== String(rule.ifKind).toLowerCase()) return false;
  if (rule.contains) {
    const blob = [
      job.title, job.notes, job.kind, job.pack, job.why, job.draft, job.tell,
      (job.tags || []).join(" ")
    ].join(" ").toLowerCase();
    if (blob.indexOf(String(rule.contains).toLowerCase()) < 0) return false;
  }
  if (rule.ifField && rule.ifValue) {
    const got = String((job[rule.ifField] != null ? job[rule.ifField] : (job.custom && job.custom[rule.ifField])) || "").toLowerCase();
    if (got !== String(rule.ifValue).toLowerCase() && got.indexOf(String(rule.ifValue).toLowerCase()) < 0) return false;
  }
  if (rule.ifTag) {
    const want = String(rule.ifTag).toLowerCase();
    const tags = jobTagsOf(job).map(function (t) { return t.toLowerCase(); });
    const blob = [job.title, job.notes, job.kind].join(" ").toLowerCase();
    if (tags.indexOf(want) < 0 && blob.indexOf(want) < 0) return false;
  }
  if (rule.ifStatus) {
    const want = String(rule.ifStatus).toLowerCase();
    const have = String(job.status || "").toLowerCase();
    const step = String(job.step || "").toLowerCase();
    if (want === "done" && !(have === "shipped" || have === "done" || step === "follow" || job.doneAt)) return false;
    else if (want !== "done" && have !== want && step !== want) return false;
  }
  if (rule.ifUnassigned && jobAssigned(job)) return false;
  if (rule.ifOlder != null && Number(rule.ifOlder) > 0 && jobOlderHours(job, now) < Number(rule.ifOlder)) return false;
  if (rule.ifMoney != null) {
    const n = Number(job.amount != null ? job.amount : job.ask);
    if (!Number.isFinite(n) || n < Number(rule.ifMoney)) return false;
  }
  return true;
}

function matchingRules(rules, job, step, now) {
  const want = String(step || "").toLowerCase();
  return (rules || []).filter(function (r) {
    if (!r) return false;
    if (!whenMatches(r.when || r.attach, want, job)) return false;
    if (job && !ifMatches(r, job, now)) return false;
    return true;
  });
}

function ruleWantsOwner(rules, job, step) {
  return matchingRules(rules, job, step).some(function (r) { return r.then === "wait"; });
}

function ruleWantsStop(rules, job, step) {
  return matchingRules(rules, job, step).some(function (r) { return r.then === "stop"; });
}

function ruleWhy(rules, job, step) {
  const hit = matchingRules(rules, job, step).find(function (r) {
    return r.then === "wait" || r.then === "stop";
  });
  return hit ? hit.text : "";
}

function removeWorkspaceRule(ws, id) {
  if (!ws) return { ok: false, error: "Open a desk first so rules have a home." };
  if (!Array.isArray(ws.rules)) ws.rules = [];
  const key = String(id || "");
  if (!key) return { ok: false, error: "Pick a rule to remove." };
  const before = ws.rules.length;
  ws.rules = ws.rules.filter((r) => r && r.id !== key);
  if (ws.rules.length === before) return { ok: false, error: "Rule not found." };
  return { ok: true, rules: ws.rules.map(publicRule).filter(Boolean) };
}

function storeBody() {
  return payload();
}

// File-blob copy / head / del. Credential order matches upload put():
// SDK with storeId, then SDK with no extra auth, then SDK with the token, then REST.
// save() and the store put() path are untouched.
async function blobFileCall(run) {
  if (!blobAllowed()) throw blobOffProd();
  const attempts = [];
  const storeId = blobStoreId();
  const token = blobToken();
  if (storeId) attempts.push({ storeId: storeId });
  attempts.push({});
  if (token) attempts.push({ token: token });
  let last = "blob-fail";
  for (let i = 0; i < attempts.length; i++) {
    try {
      const out = await run(attempts[i]);
      blobProbe.auth = attempts[i].token ? "token" : "oidc";
      return out;
    } catch (e) {
      last = blobErrText(e);
    }
  }
  const err = new Error(last);
  err.code = "AIA_BLOB_SDK";
  throw err;
}

function blobMissingErr() {
  const err = new Error("Vercel Blob: The requested blob does not exist");
  err.code = "AIA_BLOB_MISSING";
  return err;
}

async function blobRestJson(url, opts) {
  const r = await fetch(url, opts);
  const text = await r.text();
  let json = {};
  try { json = JSON.parse(text); } catch (e) { json = {}; }
  return { ok: r.ok, status: r.status, json: json, text: text };
}

async function blobRestCopy(fromUrl, toPathname, options) {
  if (!blobToken()) throw new Error("Vercel Blob: no token for copy fallback");
  const headers = blobRestHeaders({
    "x-content-type": options.contentType || "application/octet-stream",
    "x-add-random-suffix": options.addRandomSuffix ? "1" : "0",
    "x-allow-overwrite": "0",
    "x-vercel-blob-access": "public"
  });
  const q = "pathname=" + encodeURIComponent(toPathname) + "&fromUrl=" + encodeURIComponent(fromUrl);
  const urls = [
    "https://vercel.com/api/blob/?" + q,
    "https://blob.vercel-storage.com/" + toPathname + "?fromUrl=" + encodeURIComponent(fromUrl)
  ];
  let last = "copy failed";
  for (let i = 0; i < urls.length; i++) {
    const got = await blobRestJson(urls[i], { method: "PUT", headers: headers });
    if (got.ok && got.json && got.json.url) return got.json;
    last = blobRestErr(got.json, got.text, got.status);
    if (blobMissing(last)) throw blobMissingErr();
  }
  throw new Error(last);
}

async function blobRestHead(url) {
  if (!blobToken()) throw new Error("Vercel Blob: no token for head fallback");
  const headers = blobRestHeaders();
  const urls = [
    "https://vercel.com/api/blob/?url=" + encodeURIComponent(url)
  ];
  let last = "head failed";
  for (let i = 0; i < urls.length; i++) {
    const got = await blobRestJson(urls[i], { method: "GET", headers: headers });
    if (got.ok && got.json && (got.json.url || got.json.size != null || got.json.pathname)) return got.json;
    last = blobRestErr(got.json, got.text, got.status);
    if (got.status === 404 || blobMissing(last)) throw blobMissingErr();
  }
  throw new Error(last);
}

async function blobRestDel(url) {
  if (!blobToken()) throw new Error("Vercel Blob: no token for del fallback");
  const headers = blobRestHeaders({ "content-type": "application/json" });
  const urls = [
    "https://vercel.com/api/blob/delete",
    "https://blob.vercel-storage.com/delete"
  ];
  let last = "del failed";
  for (let i = 0; i < urls.length; i++) {
    const got = await blobRestJson(urls[i], {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ urls: [url] })
    });
    if (got.ok) return { ok: true };
    last = blobRestErr(got.json, got.text, got.status);
    if (got.status === 404 || blobMissing(last)) return { ok: true, missing: true };
  }
  throw new Error(last);
}

async function blobRestList() {
  if (!blobToken()) throw new Error("Vercel Blob: no token for list fallback");
  const headers = blobRestHeaders();
  const out = [];
  let cursor = "";
  for (let page = 0; page < 40; page++) {
    const q = "limit=1000" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
    const got = await blobRestJson("https://vercel.com/api/blob?" + q, { method: "GET", headers: headers });
    if (!got.ok) throw new Error(blobRestErr(got.json, got.text, got.status));
    const blobs = (got.json && got.json.blobs) || [];
    blobs.forEach((b) => out.push(b));
    if (!got.json || !got.json.hasMore || !got.json.cursor) break;
    cursor = got.json.cursor;
  }
  return out;
}

async function blobRestPutAt(pathname, body, options) {
  if (!blobToken()) throw new Error("Vercel Blob: no token for put fallback");
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ""), "utf8");
  const headers = blobRestHeaders({
    "x-content-type": (options && options.contentType) || "application/json",
    "x-add-random-suffix": options && options.addRandomSuffix ? "1" : "0",
    "x-allow-overwrite": options && options.allowOverwrite ? "1" : "0",
    "x-vercel-blob-access": (options && options.access) || "public"
  });
  const urls = blobRestPutUrls(pathname);
  let last = "put failed";
  for (let i = 0; i < urls.length; i++) {
    const r = await fetch(urls[i], { method: "PUT", headers: headers, body: payload });
    const text = await r.text();
    let json = {};
    try { json = JSON.parse(text); } catch (e) { json = {}; }
    if (r.ok && (json.url || r.ok)) {
      return {
        url: json.url || ("https://blob.vercel-storage.com/" + pathname),
        pathname: json.pathname || pathname,
        contentType: json.contentType || headers["x-content-type"]
      };
    }
    last = blobRestErr(json, text, r.status);
  }
  throw new Error(last);
}

// copy: SDK copy(fromUrl, toPathname, {access, addRandomSuffix, contentType}), then REST.
async function blobCopy(fromUrl, toPathname, opts) {
  if (!blobAllowed()) throw blobOffProd();
  const options = {
    access: "public",
    addRandomSuffix: !opts || opts.addRandomSuffix !== false,
    allowOverwrite: false,
    contentType: (opts && opts.contentType) || "application/octet-stream"
  };
  try {
    const { copy } = require("@vercel/blob");
    const blob = await blobFileCall((auth) => copy(fromUrl, toPathname, Object.assign({}, options, auth)));
    if (blob && blob.url) return blob;
    throw new Error("Vercel Blob: copy returned no url");
  } catch (e) {
    if (e && e.code === "AIA_BLOB_PROD_ONLY") throw e;
    if (blobMissing(blobErrText(e))) throw blobMissingErr();
    return blobRestCopy(fromUrl, toPathname, options);
  }
}

// head: SDK head(url), then REST. Missing blobs throw AIA_BLOB_MISSING.
async function blobHead(url) {
  if (!blobAllowed()) throw blobOffProd();
  try {
    const { head } = require("@vercel/blob");
    const meta = await blobFileCall((auth) => head(url, auth));
    if (!meta) throw blobMissingErr();
    return meta;
  } catch (e) {
    if (e && e.code === "AIA_BLOB_PROD_ONLY") throw e;
    if (e && e.code === "AIA_BLOB_MISSING") throw e;
    if (blobMissing(blobErrText(e))) throw blobMissingErr();
    return blobRestHead(url);
  }
}

// del: SDK del(url), then REST. One url at a time.
async function blobDel(url) {
  if (!blobAllowed()) throw blobOffProd();
  try {
    const { del } = require("@vercel/blob");
    await blobFileCall((auth) => del(url, auth));
    return { ok: true };
  } catch (e) {
    if (e && e.code === "AIA_BLOB_PROD_ONLY") throw e;
    if (blobMissing(blobErrText(e))) return { ok: true, missing: true };
    return blobRestDel(url);
  }
}

async function blobListAll() {
  if (!blobAllowed()) throw blobOffProd();
  // Read-only note for the migrate-uploads dry run: which path answered the last list.
  blobListAll.via = "";
  try {
    const { list } = require("@vercel/blob");
    const out = [];
    let cursor;
    for (let page = 0; page < 40; page++) {
      const listed = await blobFileCall((auth) => list(Object.assign({ limit: 1000 }, cursor ? { cursor: cursor } : {}, auth)));
      const blobs = (listed && listed.blobs) || [];
      blobs.forEach((b) => out.push(b));
      if (!listed || !listed.hasMore || !listed.cursor) break;
      cursor = listed.cursor;
    }
    blobListAll.via = "sdk";
    return out;
  } catch (e) {
    if (e && e.code === "AIA_BLOB_PROD_ONLY") throw e;
    const rest = await blobRestList();
    blobListAll.via = "rest";
    return rest;
  }
}

// Additive put to a pathname that is not the live store key. Does not call blobPut().
async function blobPutAt(pathname, body, opts) {
  if (!blobAllowed()) throw blobOffProd();
  if (pathname === BLOB_KEY || pathname === BLOB_REST_KEY) {
    throw new Error("Vercel Blob: backup put must not overwrite the live store");
  }
  const base = Object.assign({
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "application/json"
  }, opts || {});
  const { put } = require("@vercel/blob");
  try {
    return await blobFileCall((auth) => put(pathname, body, Object.assign({ access: "private" }, base, auth)));
  } catch (e) {
    if (e && e.code === "AIA_BLOB_PROD_ONLY") throw e;
    try {
      return await blobFileCall((auth) => put(pathname, body, Object.assign({ access: "public" }, base, auth)));
    } catch (e2) {
      if (e2 && e2.code === "AIA_BLOB_PROD_ONLY") throw e2;
      return blobRestPutAt(pathname, body, Object.assign({ access: "public" }, base));
    }
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
  });
}

module.exports = {
  PROVIDERS, cors, configured, catalog, PUBLIC_HOST, hookUrl, publicUrl, pipeWroteBack, pipesAnswered, answeredProviders, mem, log, save, ready, readyRead, loadIfCold, applyStore, storePath,
  slugify, hashPin, workspaceOf, readBody, blobAllowed, blobToken, blobStoreId, blobProbe, blobWrite, blobRead,
  blobOidcReady, blobReady, blobAuthOpts, blobHeadMeta, blobWriteStick, blobMayWrite, blobSeal, blobOpen,
  blobCopy, blobHead, blobDel, blobListAll, blobPutAt, storeBody,
  BLOB_STAMP, blobRev, blobErrText, publicBlobProbe, publicBlobDetail,
  ensureAuthState, parseCookies, sessionTokenOf, issueSession, findSession, listSessions, revokeSession, sessionCookie, clearSessionCookie, sessionFromReq,
  isLocked, noteFail, noteOk,
  ensurePeople, publicPerson, personOf, deskSeat, isOwner, dropPersistTests, isPersistTestJob, PERSIST_TEST_DROP,
  RULE_TEXT_MAX, RULE_MAX, RULE_FORBID_MSG, publicRule, defaultRules, ensureRules,
  addWorkspaceRule, updateWorkspaceRule, removeWorkspaceRule, forbiddenRule, moneyWaitOf, moneyNeedsOwner, scrubLog,
  matchingRules, ruleWantsOwner, ruleWantsStop, ruleWhy, whenMatches, ifMatches,
  normalizeWhen, normalizeThen, flattenWorkflows, publicWorkflow, applyRuleBody,
  jobOlderHours, jobTagsOf, isPipeJob, isInboundAia, parseDelayHours,
  NOUN_KEYS, NOUN_MAX, DEFAULT_NOUNS, defaultNouns, publicNouns, ensureNouns, setWorkspaceNouns,
  publicRuleWidget, setRuleWidget, widgetsOn, widgetCount,
  ruleStarters, RULE_WHEN, RULE_THEN, RULE_IF,
  storeTrusted, storeNotReady, blobAbsent, guardStore, persistScrub, storeState, STORE_NOT_READY, STORE_NOT_READY_CODE, STORE_PAUSED_LINE
};
