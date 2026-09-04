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
  connections: [], jobs: [], audit: [], money: [], workspaces: [], inbox: [], files: [], tickets: [], packs: []
};
const SESSION_DAYS = 14;
const SESSION_MAX = 8;
const LOCK_FAILS = 8;
const LOCK_MINUTES = 15;
const BLOB_KEY = "aia/store.json";
const blobProbe = { token: false, write: null, read: null, url: null, detail: null, status: null };
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
    packs: Array.isArray(parsed.packs) ? parsed.packs : []
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
    packs: mem.packs
  };
}

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN
    || process.env.BLOB_READ_WRITE_TOKEN
    || process.env.AIA_BLOB_TOKEN
    || "";
}

function blobStoreId() {
  return process.env.BLOB_READ_WRITE_TOKEN_STORE_ID || process.env.BLOB_STORE_ID || "";
}

function blobOpts() {
  const opts = { access: "private", addRandomSuffix: false, allowOverwrite: true };
  if (blobStoreId()) opts.storeId = blobStoreId();
  if (blobToken()) opts.token = blobToken();
  return opts;
}

function blobReady() {
  return !!(blobToken() || blobStoreId() || process.env.VERCEL_OIDC_TOKEN);
}

async function streamText(stream) {
  if (!stream) return "";
  if (typeof stream.text === "function") return stream.text();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function blobRead() {
  blobProbe.token = !!(blobToken() || blobStoreId() || process.env.VERCEL_OIDC_TOKEN);
  try {
    const { get } = require("@vercel/blob");
    const result = await get(BLOB_KEY, blobOpts());
    if (result === null) {
      blobProbe.read = "empty";
      blobProbe.status = 404;
      return null;
    }
    const status = result && (result.statusCode || result.status);
    if (status && status !== 200) {
      blobProbe.read = "get-" + status;
      blobProbe.status = status;
      return null;
    }
    const raw = result && result.stream
      ? await streamText(result.stream)
      : result && result.blob && result.blob.body
        ? await streamText(result.blob.body)
        : "";
    if (!raw) {
      blobProbe.read = "empty";
      return null;
    }
    const parsed = JSON.parse(raw);
    blobProbe.read = "ok";
    blobProbe.url = "set";
    return shape(parsed);
  } catch (e) {
    const msg = String((e && e.message) || e);
    blobProbe.read = /not found|404/i.test(msg) ? "empty" : "error";
    blobProbe.detail = msg.slice(0, 180);
    return null;
  }
}

async function blobPut(body) {
  const { put } = require("@vercel/blob");
  return put(BLOB_KEY, body, Object.assign({
    contentType: "application/json"
  }, blobOpts()));
}

async function blobWrite() {
  blobProbe.token = !!(blobToken() || blobStoreId() || process.env.VERCEL_OIDC_TOKEN);
  const body = JSON.stringify(payload());
  try {
    let blob;
    try {
      blob = await blobPut(body);
    } catch (first) {
      const { del } = require("@vercel/blob");
      await del(BLOB_KEY, blobOpts()).catch(() => null);
      blob = await blobPut(body);
      blobProbe.detail = "rewrote";
    }
    blobProbe.write = "ok";
    blobProbe.status = 200;
    if (!blobProbe.detail) blobProbe.detail = null;
    blobProbe.url = blob && (blob.url || blob.downloadUrl) ? "set" : blobProbe.url;
    if (blob && blob.url) mem.blobUrl = blob.url;
    return true;
  } catch (e) {
    blobProbe.write = "fail";
    blobProbe.detail = String((e && e.message) || e).slice(0, 180);
    return false;
  }
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
  if (blobReady()) {
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
      Object.assign(mem, remote);
      mem.driver = "blob";
      mem.path = "blob:" + BLOB_KEY;
      await persistScrub();
      return;
    }
    if (blobProbe.read === "error") {
      Object.assign(mem, readDisk());
      dropPersistTests();
      mem.driver = writeDisk();
      mem.path = storePath();
      return;
    }
    Object.assign(mem, readDisk());
    dropPersistTests();
    writeDisk();
    const ok = await blobWrite();
    if (ok) {
      mem.driver = "blob";
      mem.path = "blob:" + BLOB_KEY;
      return;
    }
  }
  Object.assign(mem, readDisk());
  dropPersistTests();
  mem.driver = writeDisk();
  mem.path = storePath();
}

if (!globalThis.__aiaHydrate) {
  globalThis.__aiaHydrate = hydrate();
}

async function ready() {
  await globalThis.__aiaHydrate;
  if (blobReady() && mem.driver !== "blob") {
    const remote = await blobRead();
    if (remote) {
      Object.assign(mem, remote);
      mem.driver = "blob";
      mem.path = "blob:" + BLOB_KEY;
    }
  }
  await persistScrub();
}

async function save() {
  await ready();
  dropPersistTests();
  const disk = writeDisk();
  if (blobReady()) {
    if (blobProbe.read === "error" && mem.driver !== "blob") {
      mem.driver = disk;
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
      : configured(id) ? "env present" : "connect when keys are set"
  }));
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
  return String(s || "demo")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "demo";
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
  return slugify(headers["x-workspace"] || query.workspace || "demo");
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
    current: !!row.current
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
  }
  return ws;
}

function publicPerson(p) {
  if (!p) return null;
  return { id: p.id, name: p.name, role: p.role, email: p.email || "" };
}

function personOf(req, workspaceSlug) {
  req = req || {};
  const headers = req.headers || {};
  const query = req.query || {};
  const fromSession = sessionFromReq(req, { slide: true });
  const asked = String(headers["x-workspace"] || query.workspace || workspaceSlug || "").trim();
  const slug = slugify(asked || (fromSession && fromSession.session && fromSession.session.workspace) || "demo");
  const fallbackSlug = fromSession && fromSession.session ? fromSession.session.workspace : "";
  const ws = ensurePeople(mem.workspaces.find((w) => w.slug === slug) || mem.workspaces.find((w) => w && w.slug === fallbackSlug) || null);
  if (!ws) return { workspace: null, person: null };
  if (fromSession && fromSession.session) {
    const session = fromSession.session;
    const person = (ws.people || []).find((p) => p && (
      (session.personId && p.id === session.personId)
      || (session.accountId && p.accountId && p.accountId === session.accountId)
      || (session.email && p.email && String(p.email).trim().toLowerCase() === String(session.email).trim().toLowerCase())
      || (session.role === "owner" && p.role === "owner")
    )) || null;
    if (person && person.status === "pending") return { workspace: ws, person: null, pending: true, session: sessionPublic(session) };
    if (person && person.status === "denied") return { workspace: ws, person: null, denied: true, session: sessionPublic(session) };
    if (person) return { workspace: ws, person, session: sessionPublic(session) };
  }
  const raw = String(headers["x-pin"] || "");
  if (!raw) return { workspace: ws, person: null };
  const hashed = hashPin(raw);
  const person = (ws.people || []).find((p) => p && p.pin === hashed)
    || (ws.pin === hashed ? (ws.people || []).find((p) => p && p.role === "owner") : null);
  if (person && person.status === "pending") return { workspace: ws, person: null, pending: true };
  if (person && person.status === "denied") return { workspace: ws, person: null, denied: true };
  return { workspace: ws, person: person || null };
}

function isOwner(person) {
  return !!(person && person.role === "owner");
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

function publicRule(r) {
  if (!r) return null;
  return {
    id: r.id,
    text: r.text,
    seed: !!r.seed,
    attach: "qualify",
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

const RULE_WHEN = ["capture", "qualify", "do", "collect", "follow"];
const RULE_THEN = ["note", "wait", "stop"];

function ruleStarters() {
  return [];
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
    when: RULE_WHEN.indexOf(body.when) >= 0 ? body.when : "qualify",
    then: RULE_THEN.indexOf(body.then) >= 0 ? body.then : "note",
    ifMoney: body.ifMoney != null && Number.isFinite(Number(body.ifMoney)) ? Number(body.ifMoney) : null,
    widget: { on: false, label: "" },
    createdAt: new Date().toISOString(),
    by: (person && person.name) || "owner"
  };
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
  if (src.when && RULE_WHEN.indexOf(src.when) >= 0) rule.when = src.when;
  if (src.then && RULE_THEN.indexOf(src.then) >= 0) rule.then = src.then;
  if (src.ifMoney != null) {
    const n = Number(src.ifMoney);
    rule.ifMoney = Number.isFinite(n) ? n : null;
  }
  return { ok: true, rule: publicRule(rule), rules: ws.rules.map(publicRule).filter(Boolean) };
}

function matchingRules(rules, job, step) {
  const want = String(step || "").toLowerCase();
  return (rules || []).filter(function (r) {
    if (!r) return false;
    const when = String(r.when || r.attach || "").toLowerCase();
    return !want || !when || when === want;
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
  PROVIDERS, cors, configured, catalog, mem, log, save, ready, storePath,
  slugify, hashPin, workspaceOf, readBody, blobToken, blobStoreId, blobProbe, blobWrite, blobRead,
  ensureAuthState, parseCookies, sessionTokenOf, issueSession, findSession, listSessions, revokeSession, sessionCookie, clearSessionCookie, sessionFromReq,
  isLocked, noteFail, noteOk,
  ensurePeople, publicPerson, personOf, isOwner, dropPersistTests, isPersistTestJob, PERSIST_TEST_DROP,
  RULE_TEXT_MAX, RULE_MAX, RULE_FORBID_MSG, publicRule, defaultRules, ensureRules,
  addWorkspaceRule, updateWorkspaceRule, removeWorkspaceRule, forbiddenRule, moneyWaitOf, moneyNeedsOwner, scrubLog,
  matchingRules, ruleWantsOwner, ruleWantsStop, ruleWhy,
  NOUN_KEYS, NOUN_MAX, DEFAULT_NOUNS, defaultNouns, publicNouns, ensureNouns, setWorkspaceNouns,
  publicRuleWidget, setRuleWidget, widgetsOn, widgetCount,
  ruleStarters, RULE_WHEN, RULE_THEN
};
