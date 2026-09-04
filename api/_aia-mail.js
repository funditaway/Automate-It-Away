const net = require("./_aia-net");
const lib = require("./_lib");

const HOLD_NOTE = "Identities work on the desk now. Internet mail when the MX pipe is connected. DNS for ai.aia / *.aia does not resolve yet.";
const SEND_HOLD = "Outbound Send stays HOLD. No silent mail. Rail / Yes. Status orange until a real MX pipe.";
const MAX = 12;

function ensureMail() {
  if (!Array.isArray(lib.mem.mail)) lib.mem.mail = [];
  return lib.mem.mail;
}

function clip(s, n) {
  return String(s == null ? "" : s).trim().slice(0, n || 80);
}

function localOf(raw, fallback) {
  let s = String(raw == null ? "" : raw).trim().toLowerCase();
  s = s.replace(/^@+/, "");
  if (s.indexOf("@") >= 0) s = s.split("@")[0];
  s = s.replace(/\.aia$/i, "");
  s = s.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!s && fallback) return localOf(fallback, "");
  if (!s) return "";
  s = s.slice(0, 63);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s)) return "";
  return s;
}

function parseAddress(raw) {
  const text = String(raw == null ? "" : raw).trim().toLowerCase().replace(/^mailto:/i, "");
  if (!text) return { ok: false, error: "Name a .aia email like james-ai@funditaway.aia." };
  if (text.indexOf("@") < 0) {
    return { ok: false, error: "Use local@account.aia — like james-ai@funditaway.aia or queue@springfield-shop.aia." };
  }
  const bits = text.split("@");
  if (bits.length !== 2) return { ok: false, error: "Use local@account.aia." };
  const local = localOf(bits[0], "");
  const host = String(bits[1] || "").trim();
  if (host && /\./.test(host) && !/\.aia$/i.test(host)) {
    return { ok: false, error: "AIA Internet mail ends in .aia — like james-ai@funditaway.aia." };
  }
  const account = net.labelOf(host, "");
  if (!local) return { ok: false, error: "Local part looks like james-ai or queue." };
  if (!account) return { ok: false, error: "Account label must be a .aia name — funditaway.aia or springfield-shop.aia." };
  return {
    ok: true,
    local: local,
    account: account,
    domain: account + ".aia",
    address: local + "@" + account + ".aia"
  };
}

function labelsFor(acc, desk) {
  const out = [];
  function add(raw, fallback) {
    const label = net.labelOf(raw, fallback);
    if (label && out.indexOf(label) < 0) out.push(label);
  }
  if (acc) {
    add(acc.aia || acc.handle || acc.slug || acc.name, acc.handle || acc.slug || "");
  }
  if (desk) {
    add(desk.aia || desk.aiaName || desk.slug || desk.biz, desk.slug || "");
  }
  return out;
}

function accountLabelOf(acc, desk) {
  return labelsFor(acc, desk)[0] || "";
}

function validateAddress(raw, acc, desk) {
  const parsed = parseAddress(raw);
  if (!parsed.ok) return parsed;
  const allowed = labelsFor(acc, desk);
  if (!allowed.length) {
    return { ok: false, error: "Set the AIA Internet name first — funditaway.aia or springfield-shop.aia." };
  }
  if (allowed.indexOf(parsed.account) < 0) {
    return { ok: false, error: "Use local@" + allowed[0] + ".aia — the account label must match this AIA Internet name." };
  }
  return parsed;
}

function publicIdentity(row) {
  if (!row) return null;
  return {
    id: row.id,
    address: row.address,
    local: row.local,
    account: row.account,
    domain: row.domain,
    workspace: row.workspace || "",
    desk: row.workspace || "",
    bind: row.bind === "ai" ? "ai" : "desk",
    aiId: row.aiId || "",
    aiName: row.aiName || "",
    mx: false,
    smtp: false,
    live: false,
    send: "hold",
    inbound: true,
    chain: false,
    owned: false,
    createdAt: row.createdAt || "",
    note: HOLD_NOTE
  };
}

function findByAddress(raw) {
  const parsed = parseAddress(raw);
  if (!parsed.ok) return null;
  return ensureMail().find(function (row) {
    return row && row.address === parsed.address;
  }) || null;
}

function findById(id) {
  const want = String(id || "").toLowerCase();
  if (!want) return null;
  return ensureMail().find(function (row) {
    return row && (String(row.id || "").toLowerCase() === want || String(row.address || "").toLowerCase() === want);
  }) || null;
}

function listForAccount(acc) {
  if (!acc) return [];
  const id = acc.id;
  const slug = acc.slug;
  return ensureMail().filter(function (row) {
    return row && (row.accountId === id || (slug && row.account === slug) || (acc.handle && row.account === acc.handle) || (acc.aia && row.domain === acc.aia));
  }).map(publicIdentity).filter(Boolean);
}

function listForDesk(slug) {
  const want = lib.slugify(slug || "");
  if (!want) return [];
  return ensureMail().filter(function (row) {
    return row && row.workspace === want;
  }).map(publicIdentity).filter(Boolean);
}

function bindAi(desk, hint) {
  if (!desk) return null;
  const want = String(hint || "").toLowerCase();
  if (!want) return null;
  const ais = require("./_ais");
  const rows = ais.deskAisOf(desk);
  return rows.find(function (a) {
    return a && (
      String(a.id || "").toLowerCase() === want ||
      String(a.name || "").toLowerCase() === want ||
      String(a.aia || "").toLowerCase() === want ||
      String(a.aiaLabel || "").toLowerCase() === want
    );
  }) || null;
}

function createIdentity(acc, desk, body) {
  if (!acc) return { ok: false, status: 401, error: "Sign in first." };
  if (!desk) return { ok: false, status: 400, error: "Name the desk this identity binds to." };
  const mine = listForAccount(acc);
  if (mine.length >= MAX) return { ok: false, status: 409, error: "Twelve .aia emails is enough on one account." };
  const aiHint = body && (body.ai || body.aiId || body.aiName || (body.bind === "ai" ? body.local : ""));
  const ai = bindAi(desk, aiHint);
  const bind = (body && body.bind === "ai") || ai ? "ai" : "desk";
  if (bind === "ai" && !ai) return { ok: false, status: 400, error: "Name the desk AI this email binds to." };
  const localHint = (body && (body.local || body.name || body.part)) || (ai && (ai.aiaLabel || ai.id || ai.name)) || "queue";
  const labels = labelsFor(acc, desk);
  if (!labels.length) return { ok: false, status: 400, error: "Set the AIA Internet name first — funditaway.aia or springfield-shop.aia." };
  const wantDomain = net.labelOf((body && (body.account || body.domain || body.host)) || "", labels[0]) || labels[0];
  if (labels.indexOf(wantDomain) < 0) {
    return { ok: false, status: 400, error: "Use local@" + labels[0] + ".aia — the account label must match this AIA Internet name." };
  }
  const raw = (body && (body.address || body.email || body.mail)) || (localOf(localHint, "queue") + "@" + wantDomain + ".aia");
  const parsed = validateAddress(raw, acc, desk);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  if (findByAddress(parsed.address)) {
    return { ok: false, status: 409, error: parsed.address + " is already on this book." };
  }
  const row = {
    id: "mail_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    address: parsed.address,
    local: parsed.local,
    account: parsed.account,
    domain: parsed.domain,
    accountId: acc.id,
    workspace: desk.slug,
    bind: bind,
    aiId: ai ? ai.id : "",
    aiName: ai ? ai.name : "",
    mx: false,
    smtp: false,
    live: false,
    send: "hold",
    inbound: true,
    chain: false,
    owned: false,
    createdAt: new Date().toISOString()
  };
  ensureMail().unshift(row);
  if (!Array.isArray(acc.mail)) acc.mail = [];
  acc.mail = listForAccount(acc);
  if (!Array.isArray(desk.mail)) desk.mail = [];
  desk.mail = listForDesk(desk.slug);
  return { ok: true, identity: publicIdentity(row), mail: listForAccount(acc), note: HOLD_NOTE };
}

function removeIdentity(acc, id) {
  if (!acc) return { ok: false, status: 401, error: "Sign in first." };
  const row = findById(id);
  if (!row) return { ok: false, status: 404, error: "No .aia email by that name." };
  if (row.accountId && row.accountId !== acc.id) {
    return { ok: false, status: 403, error: "That identity is on another account." };
  }
  lib.mem.mail = ensureMail().filter(function (r) { return r && r.id !== row.id; });
  acc.mail = listForAccount(acc);
  const desk = (lib.mem.workspaces || []).find(function (w) { return w && w.slug === row.workspace; });
  if (desk) desk.mail = listForDesk(desk.slug);
  return { ok: true, removed: row.address, mail: listForAccount(acc), note: HOLD_NOTE };
}

function sendHold() {
  return {
    ok: false,
    hold: true,
    send: "hold",
    mx: false,
    smtp: false,
    live: false,
    status: "orange",
    pipe: "hold",
    chain: false,
    owned: false,
    error: SEND_HOLD,
    note: HOLD_NOTE
  };
}

function wantsSend(body) {
  if (!body || typeof body !== "object") return false;
  const act = String(body.action || body.event || body.verb || "").toLowerCase();
  if (act === "send" || act === "mail-send" || act === "outbound" || act === "smtp") return true;
  if (body.send === true || body.outbound === true || body.smtp === true) return true;
  return false;
}

function inboundPayload(body, identity) {
  const src = body && typeof body === "object" ? body : {};
  const subject = clip(src.subject || src.title || src.item || "", 160);
  const text = clip(src.text || src.notes || src.body || src.html || "", 2000);
  const from = clip(src.from || src.sender || src.replyTo || "inbound", 80);
  const title = subject || text.split(/\n/)[0] || ("Mail · " + (identity && identity.address));
  return {
    title: title,
    why: "In from a .aia email identity.",
    from: from,
    notes: text || subject,
    kind: "email",
    email: from.indexOf("@") >= 0 ? from : "",
    provider: src.provider || "aia-mail",
    lane: "in",
    event: "capture",
    to: identity && identity.address,
    aiaMail: identity && identity.address,
    custom: {
      lane: "in",
      outcome: "email",
      aiaMail: identity && identity.address,
      automation: {
        inbound: true,
        trigger: "mail",
        identity: identity && identity.address,
        bind: identity && identity.bind,
        aiId: identity && identity.aiId || ""
      }
    }
  };
}

function statusOf() {
  return {
    identities: true,
    mx: false,
    smtp: false,
    live: false,
    send: "hold",
    inbound: "/api/hook",
    pipe: "hold",
    dns: "ai.aia / *.aia does not resolve yet",
    chain: false,
    owned: false,
    status: "orange",
    note: HOLD_NOTE
  };
}

function deskOfIdentity(row) {
  if (!row || !row.workspace) return null;
  return (lib.mem.workspaces || []).find(function (w) { return w && w.slug === row.workspace; }) || null;
}

module.exports = {
  HOLD_NOTE,
  SEND_HOLD,
  MAX,
  ensureMail,
  localOf,
  parseAddress,
  labelsFor,
  accountLabelOf,
  validateAddress,
  publicIdentity,
  findByAddress,
  findById,
  listForAccount,
  listForDesk,
  createIdentity,
  removeIdentity,
  sendHold,
  wantsSend,
  inboundPayload,
  statusOf,
  deskOfIdentity,
  bindAi
};
