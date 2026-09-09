const lib = require("./_lib");

const REASONS = ["send", "pipe", "storage", "seat", "job", "capture", "follow", "ext", "xmoney", "other"];
const FAMILY_KINDS = ["family", "friend"];
const AGENT_KINDS = ["agent"];

function ensureStore() {
  if (!Array.isArray(lib.mem.wallets)) lib.mem.wallets = [];
  return lib.mem.wallets;
}

function moneyOf(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.round(v * 100) / 100;
}

function walletIdFor(personId, workspace) {
  return "wal_" + String(workspace || "desk") + "_" + String(personId || "").replace(/[^a-zA-Z0-9_]+/g, "").slice(0, 40);
}

function publicWallet(w) {
  if (!w) return null;
  return {
    id: w.id,
    personId: w.personId,
    workspace: w.workspace,
    name: w.name || "",
    kind: w.kind || "",
    balance: moneyOf(w.balance),
    currency: "usd",
    charged: false,
    live: false,
    demo: true,
    status: w.status || "open",
    allowBill: w.allowBill !== false,
    allowAny: w.allowAny !== false,
    lastReason: w.lastReason || "",
    lastAmount: moneyOf(w.lastAmount || 0),
    rail: w.rail || "ledger",
    xHandle: w.xHandle || ""
  };
}

function publicLedger(row) {
  if (!row) return null;
  return {
    at: row.at,
    dir: row.dir,
    reason: row.reason,
    amount: moneyOf(row.amount),
    jobId: row.jobId || "",
    by: row.by || "",
    note: row.note || "",
    charged: false
  };
}

function findWallet(id) {
  return ensureStore().find((w) => w && w.id === id) || null;
}

function walletOfPerson(personId, workspace) {
  const pid = String(personId || "");
  const slug = String(workspace || "");
  return ensureStore().find((w) => w && w.personId === pid && (!slug || w.workspace === slug)) || null;
}

function canOpenForKind(kind, adult) {
  const k = String(kind || "").toLowerCase();
  if (AGENT_KINDS.indexOf(k) >= 0) return { ok: false, error: "Agents do not hold money." };
  if (FAMILY_KINDS.indexOf(k) >= 0 && !adult) {
    return { ok: false, error: "Family wallets stay off unless an adult seat is marked. Kids are not billed." };
  }
  return { ok: true };
}

function openWallet(person, workspace, actor, opts) {
  opts = opts || {};
  if (!person || !person.id) return { ok: false, status: 404, error: "No seat." };
  const kind = person.kind || (person.role === "owner" ? "owner" : "helper");
  const gate = canOpenForKind(kind, !!(opts.adult || kind === "owner" || kind === "helper" || kind === "staff" || kind === "member"));
  if (!gate.ok) return { ok: false, status: 409, error: gate.error };
  const existing = walletOfPerson(person.id, workspace);
  if (existing) return { ok: true, wallet: publicWallet(existing), existed: true };
  const row = {
    id: walletIdFor(person.id, workspace),
    personId: person.id,
    accountId: person.accountId || "",
    workspace: String(workspace || ""),
    name: person.name || "",
    kind,
    balance: 0,
    currency: "usd",
    charged: false,
    live: false,
    demo: true,
    status: "open",
    allowBill: kind !== "family",
    allowAny: true,
    rail: opts.rail === "xmoney" ? "xmoney" : "ledger",
    xHandle: String(opts.xHandle || person.xHandle || "").replace(/^@/, "").slice(0, 40),
    ledger: [],
    createdAt: new Date().toISOString(),
    createdBy: (actor && actor.name) || "desk"
  };
  ensureStore().unshift(row);
  person.walletId = row.id;
  return { ok: true, wallet: publicWallet(row), existed: false };
}

function addLedger(wallet, dir, amount, reason, actor, extra) {
  extra = extra || {};
  const row = {
    at: new Date().toISOString(),
    dir,
    amount: moneyOf(amount),
    reason: String(reason || "other").slice(0, 40),
    jobId: extra.jobId || "",
    by: (actor && actor.name) || extra.by || "desk",
    note: String(extra.note || "").slice(0, 240),
    charged: false
  };
  wallet.ledger = wallet.ledger || [];
  wallet.ledger.unshift(row);
  if (wallet.ledger.length > 200) wallet.ledger = wallet.ledger.slice(0, 200);
  wallet.lastReason = row.reason;
  wallet.lastAmount = row.amount;
  wallet.updatedAt = row.at;
  return row;
}

function fundWallet(walletId, amount, actor, note) {
  const wallet = findWallet(walletId);
  if (!wallet) return { ok: false, status: 404, error: "No wallet with that id." };
  if (wallet.status !== "open") return { ok: false, status: 409, error: "That wallet is closed." };
  const n = moneyOf(amount);
  if (n <= 0) return { ok: false, status: 400, error: "Put a dollar amount on the wallet." };
  const owner = lib.isOwner(actor);
  const self = actor && actor.id && actor.id === wallet.personId;
  if (!owner && !self) return { ok: false, status: 403, error: "Only the seat or the owner can put money on this wallet." };
  wallet.balance = moneyOf(wallet.balance) + n;
  addLedger(wallet, "credit", n, "fund", actor, { note: note || "Demo credit. No card charged." });
  return { ok: true, wallet: publicWallet(wallet), charged: false, live: false };
}

function chargeWallet(walletId, amount, reason, actor, extra) {
  extra = extra || {};
  const wallet = findWallet(walletId);
  if (!wallet) return { ok: false, status: 404, error: "No wallet with that id." };
  if (wallet.status !== "open") return { ok: false, status: 409, error: "That wallet is closed." };
  if (wallet.allowBill === false) return { ok: false, status: 403, error: "This seat did not turn billing on." };
  const n = moneyOf(amount);
  if (n <= 0) return { ok: false, status: 400, error: "Nothing to bill." };
  if (!actor || !actor.id) return { ok: false, status: 401, error: "Sign in to bill a wallet." };
  if (actor.id !== wallet.personId) {
    return { ok: false, status: 403, error: "That bill hits the owner of this wallet. It never falls back to someone else." };
  }
  if (actor.kind === "agent" || actor.role === "agent") {
    return { ok: false, status: 403, error: "Agents do not spend money." };
  }
  const why = String(reason || extra.reason || "other").toLowerCase().replace(/[^a-z]+/g, "").slice(0, 40) || "other";
  if (!wallet.allowAny && REASONS.indexOf(why) < 0) {
    return { ok: false, status: 400, error: "Pick a desk reason: " + REASONS.join(", ") + "." };
  }
  if (moneyOf(wallet.balance) < n) {
    return {
      ok: false,
      status: 402,
      error: "Empty wallet. Put money on this seat. Owner money is not used.",
      wallet: publicWallet(wallet),
      need: n,
      have: moneyOf(wallet.balance)
    };
  }
  wallet.balance = moneyOf(wallet.balance) - n;
  const row = addLedger(wallet, "debit", n, why, actor, extra);
  lib.mem.money = lib.mem.money || [];
  lib.mem.money.unshift({
    at: row.at,
    workspace: wallet.workspace,
    who: wallet.name || wallet.personId,
    what: "Wallet · " + why,
    amt: "$" + n,
    held: false,
    charged: false,
    live: false,
    walletId: wallet.id,
    personId: wallet.personId
  });
  return { ok: true, wallet: publicWallet(wallet), entry: publicLedger(row), charged: false, live: false };
}

function setRail(walletId, rail, xHandle, actor) {
  const wallet = findWallet(walletId);
  if (!wallet) return { ok: false, status: 404, error: "No wallet with that id." };
  const owner = lib.isOwner(actor);
  const self = actor && actor.id && actor.id === wallet.personId;
  if (!owner && !self) return { ok: false, status: 403, error: "Only this seat or the owner sets the money rail." };
  const next = String(rail || "ledger").toLowerCase();
  if (next !== "ledger" && next !== "xmoney" && next !== "stripe") {
    return { ok: false, status: 400, error: "Rail is ledger, X Money, or Stripe. X Money stays hold." };
  }
  wallet.rail = next;
  if (xHandle != null) wallet.xHandle = String(xHandle).replace(/^@/, "").slice(0, 40);
  wallet.live = false;
  wallet.charged = false;
  addLedger(wallet, "note", 0, next === "xmoney" ? "xmoney" : "other", actor, {
    note: next === "xmoney" ? "X Money named on this seat. No live send." : "Rail saved. Still ledger only."
  });
  return { ok: true, wallet: publicWallet(wallet), charged: false, live: false };
}

function closeWallet(walletId, actor) {
  const wallet = findWallet(walletId);
  if (!wallet) return { ok: false, status: 404, error: "No wallet with that id." };
  if (!lib.isOwner(actor) && !(actor && actor.id === wallet.personId)) {
    return { ok: false, status: 403, error: "Only the seat or the owner can close this wallet." };
  }
  wallet.status = "closed";
  wallet.allowBill = false;
  addLedger(wallet, "note", 0, "close", actor, { note: "Closed. No further bills." });
  return { ok: true, wallet: publicWallet(wallet) };
}

function listWallets(workspace, person) {
  const slug = String(workspace || "");
  const rows = ensureStore().filter((w) => w && (!slug || w.workspace === slug));
  if (lib.isOwner(person)) return rows.map(publicWallet);
  return rows.filter((w) => person && w.personId === person.id).map(publicWallet);
}

module.exports = {
  REASONS,
  ensureStore,
  publicWallet,
  publicLedger,
  findWallet,
  walletOfPerson,
  openWallet,
  fundWallet,
  chargeWallet,
  closeWallet,
  setRail,
  listWallets,
  walletIdFor
};
