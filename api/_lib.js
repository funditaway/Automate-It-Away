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
  return process.env.BLOB_READ_WRITE_TOKEN || process.env.AIA_BLOB_TOKEN || "";
}

async function blobListUrl() {
  const token = blobToken();
  if (!token) return null;
  const r = await fetch("https://blob.vercel-storage.com?prefix=" + encodeURIComponent("aia/"), {
    headers: { Authorization: "Bearer " + token, "x-api-version": "7" }
  });
  blobProbe.status = r.status;
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    blobProbe.read = "list-" + r.status;
    blobProbe.detail = text.slice(0, 180);
    return null;
  }
  const data = await r.json().catch(() => ({}));
  const blobs = data.blobs || [];
  const hit = Array.isArray(blobs)
    ? blobs.find((b) => String(b.pathname || b.url || "").indexOf("store") !== -1)
    : null;
  const url = (hit && (hit.url || hit.downloadUrl)) || null;
  if (url) blobProbe.url = url;
  return url;
}

async function blobGet(url) {
  const token = blobToken();
  const headers = { "x-api-version": "7" };
  if (token) headers.Authorization = "Bearer " + token;
  const r = await fetch(url, { headers });
  if (!r.ok) {
    blobProbe.read = "get-" + r.status;
    blobProbe.detail = (await r.text().catch(() => "")).slice(0, 180);
    return null;
  }
  try {
    return shape(await r.json());
  } catch (e) {
    blobProbe.read = "bad-json";
    blobProbe.detail = String(e.message || e).slice(0, 180);
    return null;
  }
}

async function blobRead() {
  const token = blobToken();
  blobProbe.token = !!token;
  if (!token) return null;
  try {
    if (blobProbe.url || mem.blobUrl) {
      const direct = await blobGet(blobProbe.url || mem.blobUrl);
      if (direct) {
        blobProbe.read = "ok";
        return direct;
      }
    }
    const listed = await blobListUrl();
    if (listed) {
      const data = await blobGet(listed);
      if (data) {
        blobProbe.read = "ok";
        return data;
      }
    }
    const fallback = await blobGet("https://blob.vercel-storage.com/" + BLOB_KEY);
    if (fallback) {
      blobProbe.read = "ok";
      return fallback;
    }
    if (!blobProbe.read) blobProbe.read = "empty";
    return null;
  } catch (e) {
    blobProbe.read = "error";
    blobProbe.detail = String(e.message || e).slice(0, 180);
    return null;
  }
}

async function blobWrite() {
  const token = blobToken();
  blobProbe.token = !!token;
  if (!token) return false;
  const r = await fetch("https://blob.vercel-storage.com/" + BLOB_KEY, {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + token,
      "x-api-version": "7",
      "x-content-type": "application/json",
      "x-add-random-suffix": "0",
      "x-allow-overwrite": "true"
    },
    body: Buffer.from(JSON.stringify(payload()), "utf8")
  });
  const text = await r.text().catch(() => "");
  let json = {};
  try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
  blobProbe.status = r.status;
  blobProbe.write = r.ok ? "ok" : "fail-" + r.status;
  blobProbe.detail = r.ok ? null : (json.error || json.message || text).toString().slice(0, 180);
  if (r.ok) {
    blobProbe.url = json.url || json.downloadUrl || blobProbe.url;
    mem.blobUrl = blobProbe.url;
    return true;
  }
  return false;
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
  if (blobToken()) {
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
  if (blobToken() && mem.driver !== "blob") {
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
  if (blobToken()) {
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
  slugify, hashPin, workspaceOf, readBody, blobToken, blobProbe, blobWrite, blobRead,
  ensurePeople, publicPerson, personOf, isOwner
};
