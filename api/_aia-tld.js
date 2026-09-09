/* Honest .aia TLD reclaim status. Probe Decentraweb lock/validation only.
   Never approve-registration (that can reserve a name). Never invent owned.
   No keys. No mint broadcast. Collect stays HOLD. */
const connect = require("./_connect-wallet");

const LABEL = "aia";
const TLD = ".aia";
const INTERNET = "AIA Internet";
const REGISTER_URL = "https://dns.decentraweb.org/name/aia";
const API_BASE = "https://api.decentraweb.org/api/v1";
const CACHE_MS = 5 * 60 * 1000;
const FETCH_MS = 3500;
const FEE = "~0.041–0.045 ETH/yr + gas, or DWEB";
const LOCKED_NOTE = "Bridge locked on Decentraweb — watching. When unlocked, Connect wallet then Register.";
const READY_NOTE = "Ready to mint when Bridge clears.";
const AVAILABLE_NOTE = "Bridge is clear. Connect wallet, then Register .aia on this desk. James signs commit, waits ~60s, then signs register. AIA holds no keys.";
const OWNED_NOTE = "This connected wallet matches the on-chain .aia owner.";
const WATCH_NOTE = "Watching Decentraweb for .aia. Collect stays HOLD. AIA does not mint from this server.";
const DUMMY_OWNER = "0x1111111111111111111111111111111111111111";

let cache = null;
let inflight = null;
let fetchImpl = typeof fetch === "function" ? fetch : null;

function setFetch(fn) {
  fetchImpl = fn;
  cache = null;
  inflight = null;
}

function probeEnabled() {
  if (process.env.AIA_TLD_PROBE === "0") return false;
  if (process.env.AIA_TLD_PROBE === "1") return true;
  return true;
}

function nowIso() {
  return new Date().toISOString();
}

function blobOf(status, body, text) {
  return String(status || "") + " " + String(text || "") + " " + JSON.stringify(body || {});
}

function looksBridgeLock(status, body, text) {
  const blob = blobOf(status, body, text);
  if (/bridge lock/i.test(blob)) return true;
  if (/failed to get bridge lock/i.test(blob)) return true;
  if (/failed to check domain is bridge lock/i.test(blob)) return true;
  return false;
}

function looksTaken(status, body, text) {
  const blob = blobOf(status, body, text);
  if (/already registered|not available|name is taken|already owned|is registered/i.test(blob)) return true;
  if (body && (body.available === false || body.isAvailable === false || body.taken === true || body.registered === true)) return true;
  return false;
}

function lockedFlag(body) {
  if (!body || typeof body !== "object") return null;
  if (body.locked === true || body.isLocked === true || body.bridgeLocked === true) return true;
  if (body.locked === false || body.isLocked === false || body.bridgeLocked === false) return false;
  return null;
}

function availableFlag(body) {
  if (!body || typeof body !== "object") return null;
  if (body.available === true || body.isAvailable === true) return true;
  if (body.available === false || body.isAvailable === false || body.taken === true || body.registered === true) return false;
  return null;
}

function ownerOf(body) {
  if (!body || typeof body !== "object") return "";
  const raw = body.ownerAddress || body.owner || (body.owner && body.owner.id) || body.registrant || "";
  if (raw && typeof raw === "object") return connect.normalizeAddress(raw.id || raw.address || "");
  return connect.normalizeAddress(raw);
}

function emptyProbe(extra) {
  return Object.assign({
    at: 0,
    checkedAt: "",
    available: null,
    bridgeLocked: null,
    owner: "",
    approveRegistration: null,
    lockDomain: null,
    domainValidation: null,
    error: ""
  }, extra || {});
}

function statusOf(probe, wallet) {
  const ownedByConnected = !!(wallet && wallet.connected && wallet.address && probe.owner && connect.normalizeAddress(wallet.address) === probe.owner);
  if (ownedByConnected) return "owned";
  if (probe.bridgeLocked === true) return "bridge-locked";
  if (probe.available === true && probe.bridgeLocked === false) return "available";
  return "watching";
}

function noteOf(status, wallet) {
  if (status === "owned") return OWNED_NOTE;
  if (status === "available") return AVAILABLE_NOTE;
  if (status === "bridge-locked" && wallet && wallet.connected && wallet.short) return READY_NOTE;
  if (status === "bridge-locked") return LOCKED_NOTE;
  return WATCH_NOTE;
}

function publicOf(probe, wallet) {
  const row = probe && typeof probe === "object" ? probe : emptyProbe();
  const w = wallet && wallet.connected && wallet.address ? wallet : connect.emptyPublic();
  const owner = connect.normalizeAddress(row.owner || "");
  const walletAddr = connect.normalizeAddress(w.address || "");
  const ownedByConnected = !!(walletAddr && owner && walletAddr === owner);
  const status = statusOf(row, w);
  return {
    tld: TLD,
    name: LABEL,
    internet: INTERNET,
    available: row.available === true ? true : row.available === false ? false : null,
    availableKnown: row.available === true || row.available === false,
    bridgeLocked: row.bridgeLocked === true,
    owned: ownedByConnected,
    ownedByConnected,
    owner: ownedByConnected ? owner : "",
    ownerKnown: !!owner,
    status,
    label: status === "owned" ? "Owned" : status === "available" ? "Available to register" : status === "bridge-locked" ? "Bridge locked" : "Watching",
    registerUrl: REGISTER_URL,
    fee: FEE,
    mint: false,
    live: ownedByConnected,
    chain: ownedByConnected,
    custodial: false,
    charged: false,
    collect: "hold",
    wallet: w.connected ? { connected: true, short: w.short || connect.shortAddress(w.address), chain: w.chain || connect.chainLabel(w.chainId), chainId: w.chainId || 0 } : { connected: false, short: "", chain: "", chainId: 0 },
    note: noteOf(status, w),
    checkedAt: row.checkedAt || "",
    probes: {
      lockDomain: row.lockDomain,
      domainValidation: row.domainValidation,
      approveRegistration: null
    },
    register: require("./_aia-register").publicFlow(w),
    followUp: "On-desk Register uses the connected wallet. Browser calls approve-registration with that owner, then James signs commit and register. Server never signs."
  };
}

function emptyPublic(wallet) {
  return publicOf(emptyProbe(), wallet);
}

function healthBlock() {
  return {
    tld: TLD,
    probe: "lockDomain + domain-validation",
    approveRegistration: false,
    register: "client commit→wait→register when unlocked",
    custodial: false,
    charged: false,
    collect: "hold",
    mint: false,
    note: "Account shows honest .aia reclaim status. Server does not call approve-registration or sign. Collect stays HOLD."
  };
}

async function http(method, path, body) {
  const fn = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!fn) return { ok: false, status: 0, body: null, text: "no fetch" };
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, FETCH_MS) : null;
  try {
    const res = await fn(API_BASE + path, {
      method: method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body || {}),
      signal: ctrl ? ctrl.signal : undefined
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch (e) { parsed = null; }
    return { ok: res.ok, status: res.status, body: parsed, text: text };
  } catch (err) {
    return { ok: false, status: 0, body: null, text: (err && err.message) || "probe failed" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function applyLock(probe, hit) {
  probe.lockDomain = hit.status || 0;
  if (looksBridgeLock(hit.status, hit.body, hit.text)) probe.bridgeLocked = true;
  const flag = lockedFlag(hit.body);
  if (flag === true) probe.bridgeLocked = true;
  if (flag === false && probe.bridgeLocked !== true) probe.bridgeLocked = false;
  const avail = availableFlag(hit.body);
  if (avail === true || avail === false) probe.available = avail;
  if (looksTaken(hit.status, hit.body, hit.text)) probe.available = false;
  const owner = ownerOf(hit.body);
  if (owner) probe.owner = owner;
}

function applyValidation(probe, hit) {
  probe.domainValidation = hit.status || 0;
  if (looksBridgeLock(hit.status, hit.body, hit.text)) probe.bridgeLocked = true;
  const flag = lockedFlag(hit.body);
  if (flag === true) probe.bridgeLocked = true;
  if (flag === false && probe.bridgeLocked !== true) probe.bridgeLocked = false;
  const avail = availableFlag(hit.body);
  if (avail === true || avail === false) probe.available = avail;
  if (looksTaken(hit.status, hit.body, hit.text)) probe.available = false;
  const owner = ownerOf(hit.body);
  if (owner) probe.owner = owner;
}

async function probeNow() {
  const probe = emptyProbe({ at: Date.now(), checkedAt: nowIso() });
  if (!probeEnabled()) {
    probe.error = "probe off";
    return probe;
  }
  const lock = http("GET", "/bridge/lockDomain/" + LABEL);
  const validation = http("POST", "/domain-validation", {
    name: [LABEL],
    owner: DUMMY_OWNER,
    chainid: 1
  });
  const hits = await Promise.all([lock, validation]);
  applyLock(probe, hits[0]);
  applyValidation(probe, hits[1]);
  if (probe.bridgeLocked == null && !hits[0].status && !hits[1].status) {
    probe.error = hits[0].text || hits[1].text || "Decentraweb did not answer.";
  }
  return probe;
}

async function ensure(fresh) {
  if (!fresh && cache && cache.at && (Date.now() - cache.at) < CACHE_MS) return cache;
  if (!fresh && inflight) return inflight;
  inflight = probeNow().then(function (row) {
    cache = row;
    inflight = null;
    return row;
  }, function (err) {
    inflight = null;
    cache = emptyProbe({ at: Date.now(), checkedAt: nowIso(), error: (err && err.message) || "probe failed" });
    return cache;
  });
  return inflight;
}

function peek(wallet) {
  return publicOf(cache || emptyProbe(), wallet);
}

async function forWallet(wallet, opts) {
  const row = await ensure(opts && opts.fresh);
  return publicOf(row, wallet);
}

async function forRequest(req, wallet) {
  return forWallet(wallet || connect.emptyPublic());
}

module.exports = {
  LABEL,
  TLD,
  INTERNET,
  REGISTER_URL,
  API_BASE,
  FEE,
  LOCKED_NOTE,
  READY_NOTE,
  AVAILABLE_NOTE,
  OWNED_NOTE,
  WATCH_NOTE,
  setFetch,
  probeEnabled,
  emptyProbe,
  emptyPublic,
  publicOf,
  healthBlock,
  peek,
  ensure,
  forWallet,
  forRequest
};
