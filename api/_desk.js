const lib = require("./_lib");
const perms = require("./_permissions");
const ais = require("./_ais");
const net = require("./_aia-net");

const DESK_FORMAT = "aia.desk.v1";
const DEFAULT_DESK_PERMS = {
  helperEdit: false,
  helperExport: false,
  helperExplore: true,
  helperClose: false
};

function mem() { return lib.mem; }

function deskClosed(ws) {
  return !!(ws && (ws.closed === true || ws.accepts === false));
}

function deskClosedMessage(ws) {
  const name = (ws && (ws.biz || ws.name || ws.slug)) || "This desk";
  return name + " is closed. The owner can reopen it. No new drops.";
}

function jobCounts(slug) {
  const s = lib.slugify(slug || "");
  const rows = (mem().jobs || []).filter((j) => j && j.workspace === s);
  const out = { waiting: 0, held: 0, shipped: 0, killed: 0, out: 0, total: rows.length };
  rows.forEach((j) => {
    const st = String(j.status || "");
    if (st === "killed") out.killed += 1;
    else if (st === "shipped") out.shipped += 1;
    else if (st === "held") out.held += 1;
    else if (st === "out") out.out += 1;
    else out.waiting += 1;
  });
  return out;
}

function deskPerms(ws) {
  const p = (ws && ws.perms && typeof ws.perms === "object") ? ws.perms : {};
  return {
    helperEdit: !!p.helperEdit,
    helperExport: !!p.helperExport,
    helperExplore: p.helperExplore !== false,
    helperClose: !!p.helperClose
  };
}

function setDeskPerms(ws, incoming) {
  if (!ws) return { ok: false, error: "No desk." };
  const src = incoming && typeof incoming === "object" ? incoming : {};
  const cur = deskPerms(ws);
  ws.perms = {
    helperEdit: src.helperEdit != null ? !!src.helperEdit : cur.helperEdit,
    helperExport: src.helperExport != null ? !!src.helperExport : cur.helperExport,
    helperExplore: src.helperExplore != null ? !!src.helperExplore : cur.helperExplore,
    helperClose: src.helperClose != null ? !!src.helperClose : cur.helperClose
  };
  return { ok: true, perms: deskPerms(ws) };
}

function personCan(person, key) {
  if (!person || lib.isOwner(person)) return !!lib.isOwner(person);
  const can = perms.resolvedCan(person);
  if (key === "explore") return can.explore !== false;
  return !!can[key];
}

function canDesk(person, ws, action) {
  if (lib.isOwner(person)) return true;
  if (!person) return false;
  const p = deskPerms(ws);
  const act = String(action || "");
  if (act === "update" || act === "edit") return p.helperEdit || personCan(person, "edit");
  if (act === "export") return p.helperExport || personCan(person, "export");
  if (act === "explore" || act === "audit") return p.helperExplore || personCan(person, "explore");
  if (act === "close" || act === "open" || act === "reopen") return p.helperClose || personCan(person, "close");
  return false;
}

function deskAbility(person, ws) {
  return {
    edit: canDesk(person, ws, "update"),
    close: canDesk(person, ws, "close"),
    export: canDesk(person, ws, "export"),
    explore: canDesk(person, ws, "explore"),
    code: lib.isOwner(person),
    delete: lib.isOwner(person),
    perms: lib.isOwner(person)
  };
}

function publicDesk(row, person) {
  if (!row) return null;
  const owner = lib.isOwner(person);
  const counts = jobCounts(row.slug);
  const explore = canDesk(person, row, "explore");
  const rails = ais.railsOf(row);
  return {
    format: DESK_FORMAT,
    slug: row.slug,
    name: row.biz || row.name || row.slug,
    ownerName: row.name || "",
    biz: row.biz || row.slug,
    city: row.city || "",
    model: row.model || "",
    does: row.does || "",
    closed: deskClosed(row),
    createdAt: row.createdAt || null,
    people: (owner || explore) ? (row.people || []).map(perms.publicPerson) : (row.people || []).length,
    peopleCount: (row.people || []).length,
    you: perms.publicPerson(person),
    role: person ? person.role : null,
    waiting: counts.waiting,
    held: counts.held,
    shipped: counts.shipped,
    killed: counts.killed,
    out: counts.out,
    drop: "/drop?ws=" + encodeURIComponent(row.slug),
    perms: deskPerms(row),
    can: deskAbility(person, row),
    ais: rails.ais,
    aiCount: rails.count,
    aiRails: rails.rails,
    never: rails.never,
    aia: rails.aia,
    internet: net.INTERNET,
    net: rails.net
  };
}

function applyDeskEdit(row, body) {
  if (!row) return { ok: false, error: "No desk." };
  const src = body && typeof body === "object" ? body : {};
  if (src.biz != null || src.shop != null) {
    const biz = String(src.biz || src.shop || "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (biz.length < 2) return { ok: false, error: "Shop name needs at least two letters." };
    row.biz = biz;
  }
  if (src.name != null && String(src.name).trim()) {
    row.name = String(src.name).trim().slice(0, 80);
    const ownerSeat = (row.people || []).find((p) => p && p.role === "owner");
    if (ownerSeat && !src.keepOwnerName) ownerSeat.name = row.name;
  }
  if (src.city != null) row.city = String(src.city).trim().slice(0, 80);
  if (src.model != null) row.model = String(src.model).trim().slice(0, 80);
  if (src.does != null) row.does = String(src.does).trim().slice(0, 160);
  if (src.aia != null || src.aiaName != null || src.host != null) {
    const named = net.parseName(src.aia || src.aiaName || src.host, row.slug);
    if (!named.ok) return { ok: false, error: named.error };
    row.aia = named.name;
    row.aiaLabel = named.label;
  }
  return { ok: true, desk: row };
}

function setDeskClosed(row, closed) {
  if (!row) return { ok: false, error: "No desk." };
  row.closed = !!closed;
  row.accepts = !row.closed;
  row.closedAt = row.closed ? new Date().toISOString() : null;
  return { ok: true, closed: row.closed };
}

function setDeskCode(row, nextPin) {
  if (!row) return { ok: false, error: "No desk." };
  const pin = String(nextPin || "");
  if (pin.length < 4) return { ok: false, error: "New desk code needs at least 4 digits." };
  if (!/^\d+$/.test(pin)) return { ok: false, error: "Desk code is digits only." };
  const hashed = lib.hashPin(pin);
  const others = (row.people || []).filter((p) => p && p.role !== "owner");
  if (others.some((p) => p.pin === hashed)) {
    return { ok: false, error: "That code is already on a helper." };
  }
  row.pin = hashed;
  lib.ensurePeople(row);
  (row.people || []).forEach((p) => {
    if (p && p.role === "owner") p.pin = hashed;
  });
  return { ok: true };
}

function exportDesk(row) {
  if (!row) return null;
  const slug = row.slug;
  const jobs = (mem().jobs || []).filter((j) => j && j.workspace === slug);
  return {
    format: DESK_FORMAT,
    note: "AIA desk pack. No pins. No live money. Cards are drafts until a person taps.",
    slug,
    biz: row.biz,
    name: row.name,
    city: row.city || "",
    model: row.model || "",
    does: row.does || "",
    closed: deskClosed(row),
    createdAt: row.createdAt || null,
    perms: deskPerms(row),
    nouns: lib.ensureNouns(row),
    rules: lib.ensureRules(row),
    people: (row.people || []).map(perms.publicPerson),
    counts: jobCounts(slug),
    jobs: jobs.map((j) => ({
      id: j.id,
      title: j.title,
      status: j.status,
      step: j.step,
      from: j.from,
      createdAt: j.createdAt,
      notes: j.notes || "",
      ask: j.ask,
      amount: j.amount
    })),
    exportedAt: new Date().toISOString()
  };
}

function ensureDeskEvents() {
  if (!Array.isArray(mem().deskEvents)) mem().deskEvents = [];
  return mem().deskEvents;
}

function logDesk(action, row, person, extra) {
  const ev = {
    t: new Date().toISOString(),
    action: String(action || "desk"),
    slug: row && row.slug,
    name: row && (row.biz || row.name || row.slug),
    by: (person && person.name) || "desk",
    role: (person && person.role) || "",
    extra: extra && typeof extra === "object" ? extra : null
  };
  ensureDeskEvents().unshift(ev);
  mem().deskEvents = mem().deskEvents.slice(0, 200);
  lib.log("Desk", ev.action + " · " + (ev.slug || ""), "OK", ev.slug || null);
  return ev;
}

function deskEventsOf(slug, limit) {
  const s = lib.slugify(slug || "");
  const n = Math.min(Math.max(Number(limit) || 25, 1), 80);
  return ensureDeskEvents().filter((e) => e && (!s || e.slug === s)).slice(0, n);
}

function exploreDesk(row, person) {
  if (!row) return null;
  const slug = row.slug;
  const jobs = (mem().jobs || []).filter((j) => j && j.workspace === slug);
  return {
    format: DESK_FORMAT,
    desk: publicDesk(row, person),
    can: deskAbility(person, row),
    perms: deskPerms(row),
    nouns: lib.ensureNouns(row),
    rules: lib.ensureRules(row),
    people: (row.people || []).map(perms.publicPerson),
    events: deskEventsOf(slug, 25),
    audit: (mem().audit || []).filter((a) => a && (!a.workspace || a.workspace === slug)).slice(0, 25),
    recent: jobs.slice(0, 8).map((j) => ({
      id: j.id,
      title: j.title,
      status: j.status,
      step: j.step,
      createdAt: j.createdAt
    }))
  };
}

function setSeatCan(row, id, incoming) {
  return perms.setSeatCan(row, id, incoming);
}

function wipeDesk(slug, person) {
  const s = lib.slugify(slug || "");
  if (!s) return { ok: false, error: "No desk." };
  const row = (mem().workspaces || []).find((w) => w && w.slug === s);
  if (!row) return { ok: false, error: "No desk with that name." };
  const counts = jobCounts(s);
  const tombstone = {
    jobs: counts.total,
    waiting: counts.waiting,
    held: counts.held,
    shipped: counts.shipped,
    killed: counts.killed,
    people: (row.people || []).map((p) => (p && p.name) || "").filter(Boolean),
    rules: (row.rules || []).length,
    model: row.model || "",
    closed: deskClosed(row)
  };
  const ev = logDesk("delete", row, person, tombstone);
  mem().workspaces = (mem().workspaces || []).filter((w) => w && w.slug !== s);
  mem().jobs = (mem().jobs || []).filter((j) => j && j.workspace !== s);
  mem().inbox = (mem().inbox || []).filter((i) => i && i.workspace !== s);
  mem().tickets = (mem().tickets || []).filter((t) => t && t.workspace !== s);
  mem().connections = (mem().connections || []).filter((c) => c && c.workspace !== s);
  mem().files = (mem().files || []).filter((f) => f && f.workspace !== s);
  if (Array.isArray(mem().intakes)) {
    mem().intakes = mem().intakes.filter((i) => i && i.workspace !== s);
  }
  return { ok: true, slug: s, name: row.biz || row.name || s, event: ev };
}

function adminPinOk(req) {
  const want = String(process.env.AIA_ADMIN_PIN || "").trim();
  if (!want) return false;
  const got = String((req.headers && (req.headers["x-admin-pin"] || req.headers["x-pin"])) || "").trim();
  if (!got) return false;
  try {
    const crypto = require("crypto");
    return crypto.timingSafeEqual(Buffer.from(lib.hashPin(got)), Buffer.from(lib.hashPin(want)));
  } catch (e) {
    return lib.hashPin(got) === lib.hashPin(want);
  }
}

module.exports = {
  DESK_FORMAT,
  DEFAULT_DESK_PERMS,
  deskClosed,
  deskClosedMessage,
  jobCounts,
  deskPerms,
  setDeskPerms,
  personCan,
  canDesk,
  deskAbility,
  publicDesk,
  applyDeskEdit,
  setDeskClosed,
  setDeskCode,
  exportDesk,
  ensureDeskEvents,
  logDesk,
  deskEventsOf,
  exploreDesk,
  setSeatCan,
  wipeDesk,
  adminPinOk
};
