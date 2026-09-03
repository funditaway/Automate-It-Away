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

const EMPTY = { connections: [], jobs: [], audit: [], money: [], workspaces: [], inbox: [], files: [], tickets: [] };
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
  return {
    connections: Array.isArray(parsed.connections) ? parsed.connections : [],
    jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
    audit: Array.isArray(parsed.audit) ? parsed.audit : [],
    money: Array.isArray(parsed.money) ? parsed.money : [],
    workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
    inbox: Array.isArray(parsed.inbox) ? parsed.inbox : [],
    files: Array.isArray(parsed.files) ? parsed.files : [],
    tickets: Array.isArray(parsed.tickets) ? parsed.tickets : []
  };
}

function payload() {
  return {
    connections: mem.connections,
    jobs: mem.jobs,
    audit: mem.audit,
    money: mem.money,
    workspaces: mem.workspaces,
    inbox: mem.inbox,
    files: mem.files,
    tickets: mem.tickets
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Workspace, X-Pin");
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

const SEED_RULE_TEXT = "Payments over $250 wait for the owner.";
const RULE_TEXT_MAX = 140;
const RULE_MAX = 8;
const CAP_MAX = 8;
const RULE_FORBID = /auto[-\s]?pay|auto[-\s]?list|auto[-\s]?ship|auto[-\s]?release|un-?\s?kill|skip\s+(the\s+)?(kill|payout|pay\b|named\s+outbound|live\s+list|outbound)|live\s+list|mark\s+ebay|ebay\s+live|set\s+ebay|go\s+live\s+on\s+ebay/;
const RULE_FORBID_MSG = "Hard stops still win. A rule cannot skip payout, Kill, a live list, or named outbound. It cannot auto-pay, auto-list, or un-kill junk.";
const CAP_WORDS_RE = /\b(cap|on the (?:cap|pyramid)|do this first|priority|first thing)\b/i;
const CAP_KIND_RE = /\b(?:cap|priority)\s+([a-z][a-z0-9-]{1,24})\s+cards?\b/i;

function scrubLog(s) {
  return String(s == null ? "" : s)
    .replace(/x-pin["'\s:=]+[^,\s]+/ig, "x-pin:[redacted]")
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
  return slugify(req.headers["x-workspace"] || req.query.workspace || "demo");
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
  const slug = workspaceSlug || workspaceOf(req);
  const ws = ensurePeople(mem.workspaces.find((w) => w.slug === slug) || null);
  const raw = req.headers["x-pin"] || "";
  if (!ws || !raw) return { workspace: ws, person: null };
  const hashed = hashPin(raw);
  const person = (ws.people || []).find((p) => p.pin === hashed)
    || (ws.pin === hashed ? (ws.people || []).find((p) => p.role === "owner") : null);
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
  const out = {
    id: r.id,
    text: r.text,
    seed: !!r.seed,
    attach: "qualify",
    widget: publicRuleWidget(r.widget),
    when: r.when || "qualify",
    then: r.then || "note"
  };
  if (r.ifMoney != null && Number.isFinite(Number(r.ifMoney))) out.ifMoney = Number(r.ifMoney);
  if (r.contains) out.contains = String(r.contains);
  if (r.ifKind) out.ifKind = String(r.ifKind);
  if (r.ifModel) out.ifModel = String(r.ifModel);
  if (r.ifOutcome) out.ifOutcome = String(r.ifOutcome);
  if (r.ifField) out.ifField = String(r.ifField);
  if (r.ifValue) out.ifValue = String(r.ifValue);
  if (r.exceptContains) out.exceptContains = String(r.exceptContains);
  if (r.source) out.source = String(r.source);
  out.advanced = !!(
    r.advanced
    || out.when !== "qualify"
    || out.then !== "note"
    || out.ifMoney != null
    || out.contains
    || out.ifKind
    || out.ifModel
    || out.ifOutcome
    || out.ifField
    || out.ifValue
    || out.exceptContains
  );
  return out;
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
const RULE_THEN = ["note", "wait", "stop", "cap"];

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

function cleanRuleToken(val, max) {
  const t = String(val == null ? "" : val).trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return "";
  return t.replace(/[^a-z0-9_ -]+/g, "").trim().slice(0, max || 80);
}

function cleanContains(val) {
  return String(val == null ? "" : val).trim().replace(/\s+/g, " ").slice(0, 80);
}

function capThenOf(body, text, fallback) {
  if (body && body.then != null && RULE_THEN.indexOf(body.then) >= 0) return body.then;
  if (CAP_WORDS_RE.test(String(text || ""))) return "cap";
  return fallback || "note";
}

function capKindOf(body, text) {
  const byBody = cleanRuleToken(body && body.ifKind, 25);
  if (byBody) return byBody;
  const hit = String(text || "").match(CAP_KIND_RE);
  return hit ? cleanRuleToken(hit[1], 25) : "";
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
    then: capThenOf(body, clean, "note"),
    ifMoney: body.ifMoney != null && Number.isFinite(Number(body.ifMoney)) ? Number(body.ifMoney) : null,
    contains: cleanContains(body.contains) || null,
    ifKind: capKindOf(body, clean) || null,
    ifModel: cleanRuleToken(body.ifModel, 40) || null,
    ifOutcome: cleanRuleToken(body.ifOutcome, 40) || null,
    ifField: cleanRuleToken(body.ifField, 32) || null,
    ifValue: cleanContains(body.ifValue) || null,
    exceptContains: cleanContains(body.exceptContains) || null,
    source: cleanRuleToken(body.source, 40) || null,
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
    if (src.then == null) rule.then = capThenOf(src, clean, rule.then || "note");
  }
  if (src.when && RULE_WHEN.indexOf(src.when) >= 0) rule.when = src.when;
  if (src.then && RULE_THEN.indexOf(src.then) >= 0) rule.then = src.then;
  if (src.ifMoney != null) {
    const n = Number(src.ifMoney);
    rule.ifMoney = Number.isFinite(n) ? n : null;
  }
  if (src.contains != null) rule.contains = cleanContains(src.contains) || null;
  if (src.ifKind != null || src.text != null) rule.ifKind = capKindOf(src, rule.text) || null;
  if (src.ifModel != null) rule.ifModel = cleanRuleToken(src.ifModel, 40) || null;
  if (src.ifOutcome != null) rule.ifOutcome = cleanRuleToken(src.ifOutcome, 40) || null;
  if (src.ifField != null) rule.ifField = cleanRuleToken(src.ifField, 32) || null;
  if (src.ifValue != null) rule.ifValue = cleanContains(src.ifValue) || null;
  if (src.exceptContains != null) rule.exceptContains = cleanContains(src.exceptContains) || null;
  if (src.source != null) rule.source = cleanRuleToken(src.source, 40) || null;
  return { ok: true, rule: publicRule(rule), rules: ws.rules.map(publicRule).filter(Boolean) };
}

function matchingRules(rules, job, step) {
  const want = String(step || "").toLowerCase();
  const kind = String((job && job.kind) || "").toLowerCase();
  const model = String((job && job.model) || "").toLowerCase();
  const outcome = String((job && (job.outcome || job.wanted)) || "").toLowerCase();
  const blob = [job && job.title, job && job.notes, job && job.kind, job && job.pack].map((v) => String(v || "").toLowerCase()).join(" ");
  const amount = Number(job && (job.amount != null ? job.amount : job.ask));
  return (rules || []).filter(function (r) {
    if (!r) return false;
    const when = String(r.when || r.attach || "").toLowerCase();
    if (want && when && when !== want) return false;
    if (r.ifKind && kind !== String(r.ifKind).toLowerCase()) return false;
    if (r.ifModel && model !== String(r.ifModel).toLowerCase()) return false;
    if (r.ifOutcome && outcome !== String(r.ifOutcome).toLowerCase()) return false;
    if (r.contains && blob.indexOf(String(r.contains).toLowerCase()) < 0) return false;
    if (r.exceptContains && blob.indexOf(String(r.exceptContains).toLowerCase()) >= 0) return false;
    if (r.ifMoney != null) {
      const min = Number(r.ifMoney);
      if (!Number.isFinite(min) || !Number.isFinite(amount) || amount < min) return false;
    }
    if (r.ifField) {
      const row = job && job.custom && typeof job.custom === "object" ? job.custom : {};
      const key = String(r.ifField).toLowerCase();
      const got = row[key];
      const expect = String(r.ifValue || "").toLowerCase();
      if (expect) {
        if (String(got == null ? "" : got).toLowerCase().indexOf(expect) < 0) return false;
      } else if (got == null || got === "") {
        return false;
      }
    }
    return true;
  });
}

function ruleWantsOwner(rules, job, step) {
  return matchingRules(rules, job, step).some(function (r) { return r.then === "wait"; });
}

function ruleWantsStop(rules, job, step) {
  return matchingRules(rules, job, step).some(function (r) { return r.then === "stop"; });
}

function ruleWantsCap(rules, job, step) {
  return matchingRules(rules, job, step).some(function (r) { return r.then === "cap"; });
}

function applyCapFromRules(job, shop) {
  if (!job || !shop) return job;
  if (job.status === "shipped" || job.status === "killed") return job;
  const rules = ensureRules(shop);
  if (ruleWantsStop(rules, job, "qualify") || ruleWantsStop(rules, job, "do")) return job;
  const hit = ["capture", "qualify", "do"].map(function (step) {
    return matchingRules(rules, job, step).find(function (r) { return r.then === "cap"; });
  }).find(Boolean);
  if (!hit) return job;
  const live = (mem.jobs || []).filter(function (j) {
    return j && j.workspace === shop.slug && j.id !== job.id
      && (j.priority === true || j.cap === true)
      && j.status !== "shipped" && j.status !== "killed";
  }).length;
  if (!job.priority && !job.cap && live >= CAP_MAX) {
    job.capHeld = true;
    return job;
  }
  const line = "Cap · " + hit.text;
  job.priority = true;
  job.cap = true;
  job.capHeld = false;
  job.priorityAt = new Date().toISOString();
  job.priorityBy = hit.source || "rule";
  job.priorityRule = hit.text;
  if (!Array.isArray(job.log)) job.log = [];
  if (job.log.indexOf(line) < 0) job.log.push(line);
  return job;
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
  ensurePeople, publicPerson, personOf, isOwner, dropPersistTests, isPersistTestJob, PERSIST_TEST_DROP,
  SEED_RULE_TEXT, RULE_TEXT_MAX, RULE_MAX, RULE_FORBID_MSG, publicRule, defaultRules, ensureRules,
  addWorkspaceRule, updateWorkspaceRule, removeWorkspaceRule, forbiddenRule, moneyWaitOf, moneyNeedsOwner, scrubLog,
  matchingRules, ruleWantsOwner, ruleWantsStop, ruleWantsCap, applyCapFromRules, ruleWhy,
  NOUN_KEYS, NOUN_MAX, DEFAULT_NOUNS, defaultNouns, publicNouns, ensureNouns, setWorkspaceNouns,
  publicRuleWidget, setRuleWidget, widgetsOn, widgetCount,
  ruleStarters, RULE_WHEN, RULE_THEN, CAP_MAX
};
