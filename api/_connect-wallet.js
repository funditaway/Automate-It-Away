const lib = require("./_lib");

const HELP =
  "Wallet is for AIA Internet identity / TLD ownership. Mint and Bridge stay external until ready. Collect stays HOLD.";
const MISSING = "No browser wallet on this phone. Install MetaMask or another EIP-1193 wallet, then tap Connect.";
const CHAINS = {
  1: "Ethereum mainnet",
  11155111: "Sepolia",
  137: "Polygon",
  10: "Optimism",
  42161: "Arbitrum One",
  8453: "Base"
};

function normalizeAddress(raw) {
  const s = String(raw || "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(s)) return "";
  return "0x" + s.slice(2).toLowerCase();
}

function parseAddress(raw) {
  const address = normalizeAddress(raw);
  if (!address) return { ok: false, status: 400, error: "That is not an Ethereum address." };
  return { ok: true, address };
}

function parseChainId(raw) {
  if (raw == null || raw === "") return { ok: true, chainId: 0 };
  let n;
  const s = String(raw).trim();
  if (/^0x[0-9a-fA-F]+$/.test(s)) n = parseInt(s, 16);
  else n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 2147483647) {
    return { ok: false, status: 400, error: "That chain id does not look right." };
  }
  return { ok: true, chainId: Math.floor(n) };
}

function shortAddress(addr) {
  const a = normalizeAddress(addr);
  if (!a) return "";
  return a.slice(0, 6) + "…" + a.slice(-4);
}

function chainLabel(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return "";
  return CHAINS[n] || ("Chain " + n);
}

function emptyPublic(extra) {
  return Object.assign({
    connected: false,
    address: "",
    short: "",
    chainId: 0,
    chain: "",
    custodial: false,
    charged: false,
    collect: "hold",
    mint: false,
    live: false,
    note: "No browser wallet on this open desk. Connect on Account. Collect stays HOLD."
  }, extra || {});
}

function publicOf(acc, session) {
  const address = normalizeAddress((session && session.walletAddress) || (acc && acc.walletAddress) || "");
  const chainId = Number((session && session.walletChainId) || (acc && acc.walletChainId) || 0) || 0;
  if (!address) return emptyPublic();
  return {
    connected: true,
    address,
    short: shortAddress(address),
    chainId,
    chain: chainLabel(chainId),
    custodial: false,
    charged: false,
    collect: "hold",
    mint: false,
    live: false,
    note: HELP
  };
}

function canStampAccount(acc, person) {
  if (!acc || !person) return false;
  if (person.accountId && person.accountId === acc.id) return true;
  if (person.role === "owner") return true;
  return false;
}

function currentSession(req) {
  const token = typeof lib.sessionTokenOf === "function" ? lib.sessionTokenOf(req) : "";
  if (!token || typeof lib.findSession !== "function") return null;
  return lib.findSession(token, { slide: false, req }) || null;
}

function applyConnect(acc, session, person, body) {
  const parsed = parseAddress((body && (body.walletAddress || body.address)) || "");
  if (!parsed.ok) return parsed;
  const chain = parseChainId(body && (body.walletChainId || body.chainId));
  if (!chain.ok) return chain;
  const now = new Date().toISOString();
  if (session) {
    session.walletAddress = parsed.address;
    session.walletChainId = chain.chainId;
    session.walletAt = now;
  }
  if (canStampAccount(acc, person)) {
    acc.walletAddress = parsed.address;
    acc.walletChainId = chain.chainId;
    acc.walletAt = now;
  }
  return { ok: true, wallet: publicOf(acc, session) };
}

function clearConnect(acc, session, person) {
  if (session) {
    session.walletAddress = "";
    session.walletChainId = 0;
    session.walletAt = "";
  }
  if (canStampAccount(acc, person) && acc) {
    acc.walletAddress = "";
    acc.walletChainId = 0;
    acc.walletAt = "";
  }
  if (acc && acc.id) {
    (lib.mem.sessions || []).forEach((row) => {
      if (row && row.accountId === acc.id) {
        row.walletAddress = "";
        row.walletChainId = 0;
        row.walletAt = "";
      }
    });
  }
  return { ok: true, wallet: emptyPublic({ note: "Browser wallet disconnected on this desk session. Collect stays HOLD." }) };
}

function ofRequest(req, acc, session) {
  const found = typeof lib.personOf === "function" ? lib.personOf(req, typeof lib.workspaceOf === "function" ? lib.workspaceOf(req) : "") : null;
  const row = session || currentSession(req);
  const account = acc || null;
  if (!found || !found.person) return emptyPublic();
  return publicOf(account, row);
}

function healthBlock() {
  return {
    connect: "eip-1193",
    custodial: false,
    charged: false,
    collect: "hold",
    mint: false,
    note: "Browser wallet on Account. Address only. No keys on this server. Collect stays HOLD. Mint / Bridge stay external."
  };
}

module.exports = {
  HELP,
  MISSING,
  CHAINS,
  normalizeAddress,
  parseAddress,
  parseChainId,
  shortAddress,
  chainLabel,
  emptyPublic,
  publicOf,
  canStampAccount,
  currentSession,
  applyConnect,
  clearConnect,
  ofRequest,
  healthBlock
};
