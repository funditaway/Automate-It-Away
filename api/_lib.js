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

async function hydrate() {
  if (blobReady()) {
    const remote = await blobRead();
    if (remote) {
      Object.assign(mem, remote);
      mem.driver = "blob";
      mem.path = "blob:" + BLOB_KEY;
      return;
    }
    Object.assign(mem, readDisk());
    writeDisk();
    const ok = await blobWrite();
    if (ok) {
      mem.driver = "blob";
      mem.path = "blob:" + BLOB_KEY;
      return;
    }
  }
  Object.assign(mem, readDisk());
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
}

async function save() {
  await ready();
  const disk = writeDisk();
  if (blobReady()) {
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

function log(agent, action, result, workspace) {
  mem.audit.unshift({
    t: new Date().toISOString(),
    agent,
    action,
    result,
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
  ensurePeople, publicPerson, personOf, isOwner
};
