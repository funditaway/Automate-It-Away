// Structured pack / add-on install lifecycle history.
// Entries live on mem.installHistory (persisted with the store) and compact
// like audit / deskEvents. Succeeded is only written into the batch that
// commits; a failed save rewrites the same entry to failed so nothing looks
// like a phantom success.
const crypto = require("crypto");

const HISTORY_MAX = 200;
const MODULE_TYPES = ["pack", "addon"];
const STATUSES = ["succeeded", "failed", "rolled_back"];
const INSTALL_MODES = ["fresh", "retry", "noop"];
const EVENT_TYPES = {
  pack: {
    installed: "pack.installed",
    upgraded: "pack.upgraded",
    removed: "pack.removed",
    rolled_back: "pack.rolled_back"
  },
  addon: {
    installed: "addon.installed",
    upgraded: "addon.upgraded",
    removed: "addon.removed",
    rolled_back: "addon.rolled_back"
  }
};

function mem() {
  return require("./_lib").mem;
}

function nowIso() {
  return new Date().toISOString();
}

function newEventId() {
  return "ih_" + Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
}

function clip(v, n) {
  const t = String(v == null ? "" : v).trim();
  if (!t) return "";
  return t.length <= n ? t : t.slice(0, n);
}

function ensureInstallHistory() {
  const m = mem();
  if (!Array.isArray(m.installHistory)) m.installHistory = [];
  return m.installHistory;
}

function compactInstallHistory(list) {
  const rows = (list || []).filter((e) => e && typeof e === "object" && !Array.isArray(e));
  const next = rows.slice(0, HISTORY_MAX);
  mem().installHistory = next;
  return next;
}

function moduleTypeOf(raw, pack) {
  const want = String(raw || (pack && pack.moduleType) || (pack && pack.type) || "pack").toLowerCase();
  if (want === "addon" || want === "add-on" || want === "add_on") return "addon";
  return "pack";
}

function versionOf(pack, body) {
  const nested = body && body.pack && typeof body.pack === "object" ? body.pack : null;
  if (body && body.version != null && String(body.version).trim()) return clip(body.version, 80);
  if (nested && nested.version != null && String(nested.version).trim()) return clip(nested.version, 80);
  if (pack && pack.version != null && String(pack.version).trim()) return clip(pack.version, 80);
  return "1";
}

function slugOf(pack) {
  if (!pack) return "";
  return clip(pack.aia || pack.file || pack.slug || pack.id || pack.packId || pack.name, 80);
}

function moduleIdOf(pack) {
  if (!pack) return "";
  return clip(pack.packId || pack.id || pack.aia || pack.name, 80);
}

function actorOf(person, acc, session, stamp) {
  const who = stamp && stamp.who ? stamp.who : clip((person && person.name) || "desk", 80);
  const whoKind = stamp && stamp.whoKind ? stamp.whoKind : "";
  const seatId = clip(
    (session && (session.seatId || session.personId || session.asSeatId)) ||
      (person && person.id) ||
      "",
    40
  );
  const override =
    session && (session.seatOverride || session.overrideSeatId || session.actingAs)
      ? clip(session.seatOverride || session.overrideSeatId || session.actingAs, 40)
      : "";
  return {
    id: seatId || clip((acc && acc.id) || "", 40),
    seatId: seatId,
    accountId: clip((acc && acc.id) || (person && person.accountId) || "", 40),
    name: who,
    whoKind: whoKind,
    role: clip((person && person.role) || "", 24),
    seatOverride: override || null,
    permission: clip((session && (session.permission || session.perms || session.can)) || (person && person.kind) || "", 40)
  };
}

function scopeOf(shop, card, agent) {
  const deskId = clip((shop && (shop.slug || shop.id)) || "", 40);
  const cardId = clip((card && (card.id || card.cardId)) || "", 40);
  const agentId = clip((agent && (agent.id || agent.agentId)) || "", 40);
  let kind = "global";
  if (deskId && (cardId || agentId)) kind = "desk+card";
  else if (deskId) kind = "desk";
  else if (cardId || agentId) kind = "card";
  return {
    kind: kind,
    deskId: deskId || null,
    workspace: deskId || null,
    cardId: cardId || null,
    agentId: agentId || null
  };
}

function classifyLifecycle(opts) {
  const action = String(opts.action || opts.lifecycle || "install").toLowerCase();
  const moduleType = moduleTypeOf(opts.moduleType, opts.pack);
  const prevId = clip(opts.previousModuleId || opts.previousPackId || "", 80);
  const nextId = clip(opts.moduleId || moduleIdOf(opts.pack), 80);
  const prevVer = opts.previousVersion != null && String(opts.previousVersion) !== ""
    ? clip(opts.previousVersion, 80)
    : null;
  const nextVer = clip(opts.version != null ? opts.version : versionOf(opts.pack, opts.body), 80) || "1";
  const sameModule = !!(prevId && nextId && prevId === nextId);
  const alreadySame = sameModule && prevVer && prevVer === nextVer;

  if (action === "remove" || action === "uninstall" || action === "removed") {
    return { eventType: EVENT_TYPES[moduleType].removed, lifecycle: "removed", installMode: "fresh" };
  }
  if (action === "rollback" || action === "rolled_back" || action === "roll-back") {
    return { eventType: EVENT_TYPES[moduleType].rolled_back, lifecycle: "rolled_back", installMode: "fresh" };
  }
  if (sameModule && prevVer && prevVer !== nextVer) {
    return { eventType: EVENT_TYPES[moduleType].upgraded, lifecycle: "upgraded", installMode: "fresh" };
  }
  if (alreadySame || opts.already === true) {
    const mode = opts.installMode === "retry" || opts.retry === true ? "retry" : "noop";
    return { eventType: EVENT_TYPES[moduleType].installed, lifecycle: "installed", installMode: mode };
  }
  if (opts.retry === true || opts.installMode === "retry") {
    return { eventType: EVENT_TYPES[moduleType].installed, lifecycle: "installed", installMode: "retry" };
  }
  return { eventType: EVENT_TYPES[moduleType].installed, lifecycle: "installed", installMode: "fresh" };
}

function normalizeEntry(input) {
  const opts = input || {};
  const moduleType = MODULE_TYPES.indexOf(opts.moduleType) >= 0
    ? opts.moduleType
    : moduleTypeOf(opts.moduleType, opts.pack);
  const classified = classifyLifecycle(Object.assign({}, opts, { moduleType: moduleType }));
  const status = STATUSES.indexOf(opts.status) >= 0 ? opts.status : "succeeded";
  const installMode = INSTALL_MODES.indexOf(opts.installMode) >= 0
    ? opts.installMode
    : classified.installMode;
  const eventType = opts.eventType || classified.eventType;
  const moduleId = clip(opts.moduleId || moduleIdOf(opts.pack), 80);
  const version = clip(opts.version != null ? opts.version : versionOf(opts.pack, opts.body), 80) || "1";
  const previousVersion = opts.previousVersion != null && String(opts.previousVersion) !== ""
    ? clip(opts.previousVersion, 80)
    : null;
  const entry = {
    id: clip(opts.id, 40) || newEventId(),
    timestamp: opts.timestamp || nowIso(),
    eventType: eventType,
    action: classified.lifecycle,
    moduleType: moduleType,
    moduleId: moduleId,
    slug: clip(opts.slug || slugOf(opts.pack) || moduleId, 80),
    version: version,
    previousVersion: previousVersion,
    scope: opts.scope && typeof opts.scope === "object" ? opts.scope : scopeOf(opts.shop, opts.card, opts.agent),
    actor: opts.actor && typeof opts.actor === "object" ? opts.actor : actorOf(opts.person, opts.acc, opts.session, opts.stamp),
    status: status,
    error: status === "failed" ? clip(opts.error || "Install failed.", 240) : null,
    installMode: installMode,
    kind: "install"
  };
  return entry;
}

function maskActor(actor, viewer) {
  if (!actor || typeof actor !== "object") return null;
  let owner = false;
  try {
    owner = !!(viewer && require("./_lib").isOwner(viewer));
  } catch (e) {
    owner = false;
  }
  if (owner) {
    return {
      id: actor.id || "",
      seatId: actor.seatId || "",
      accountId: actor.accountId || "",
      name: actor.name || "",
      whoKind: actor.whoKind || "",
      role: actor.role || "",
      seatOverride: actor.seatOverride || null,
      permission: actor.permission || ""
    };
  }
  // Helpers / staff / desk-code: display name + kind only (matches viewSeat).
  return {
    id: "",
    seatId: "",
    accountId: "",
    name: actor.name || "",
    whoKind: actor.whoKind || "",
    role: "",
    seatOverride: null,
    permission: ""
  };
}

function publicEntry(entry, viewer) {
  if (!entry || typeof entry !== "object") return null;
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    t: entry.timestamp,
    eventType: entry.eventType,
    action: entry.action,
    moduleType: entry.moduleType,
    moduleId: entry.moduleId,
    slug: entry.slug,
    version: entry.version,
    previousVersion: entry.previousVersion || null,
    scope: entry.scope || null,
    actor: maskActor(entry.actor, viewer),
    status: entry.status,
    error: entry.error || null,
    installMode: entry.installMode,
    kind: "install"
  };
}

function whatLine(entry) {
  const name = entry.slug || entry.moduleId || entry.moduleType;
  const ver = entry.version ? " v" + entry.version : "";
  if (entry.status === "failed") {
    return "Failed " + entry.eventType + " · " + name + ver + (entry.error ? " · " + entry.error : "");
  }
  if (entry.action === "upgraded") {
    return "Upgraded " + entry.moduleType + " · " + name + " " + (entry.previousVersion || "?") + " → " + entry.version;
  }
  if (entry.action === "removed") return "Removed " + entry.moduleType + " · " + name + ver;
  if (entry.action === "rolled_back") {
    return "Rolled back " + entry.moduleType + " · " + name + " to " + (entry.version || "?");
  }
  if (entry.installMode === "noop") return "Already on desk · " + name + ver;
  if (entry.installMode === "retry") return "Retry install · " + name + ver;
  return "Installed " + entry.moduleType + " · " + name + ver;
}

/**
 * Append one lifecycle entry. Caller should include this in the same save()
 * batch as the registry mutation. Use markFailed(entry, err) if that save
 * does not commit.
 */
function recordInstallEvent(input) {
  const entry = normalizeEntry(input);
  const list = ensureInstallHistory();
  list.unshift(entry);
  compactInstallHistory(list);

  try {
    const lib = require("./_lib");
    lib.log(
      entry.moduleType === "addon" ? "Add-on" : "Pack",
      entry.eventType + " · " + (entry.slug || entry.moduleId),
      entry.status === "succeeded" ? "OK" : (entry.error || entry.status),
      entry.scope && entry.scope.deskId
    );
  } catch (e) { /* audit log is best-effort */ }

  if (input && input.acc && input.person) {
    try {
      const settings = require("./_account-settings");
      settings.addHistory(
        input.acc,
        input.person,
        entry.moduleType === "addon" ? "addons" : "packs",
        whatLine(entry),
        entry.actor && entry.actor.whoKind,
        entry.moduleType + ":" + entry.moduleId
      );
    } catch (e) { /* account history is best-effort */ }
  }

  if (input && input.shop && input.person && (entry.action === "removed" || entry.action === "installed" || entry.action === "upgraded" || entry.action === "rolled_back")) {
    try {
      const desk = require("./_desk");
      desk.logDesk(entry.eventType, input.shop, input.person, {
        moduleId: entry.moduleId,
        version: entry.version,
        previousVersion: entry.previousVersion,
        status: entry.status,
        installMode: entry.installMode
      });
    } catch (e) { /* desk events are best-effort */ }
  }

  return entry;
}

function markFailed(entry, error) {
  if (!entry || typeof entry !== "object") return entry;
  entry.status = "failed";
  entry.error = clip(error || "State did not save.", 240);
  return entry;
}

function installHistoryOf(opts) {
  const q = opts || {};
  const desk = clip(q.deskId || q.workspace || q.slug || "", 40);
  const moduleId = clip(q.moduleId || q.id || "", 80);
  const moduleType = q.moduleType ? moduleTypeOf(q.moduleType) : "";
  const viewer = q.viewer || null;
  return ensureInstallHistory().filter((e) => {
    if (!e) return false;
    if (desk && !(e.scope && (e.scope.deskId === desk || e.scope.workspace === desk))) return false;
    if (moduleId && e.moduleId !== moduleId) return false;
    if (moduleType && e.moduleType !== moduleType) return false;
    return true;
  }).map((e) => publicEntry(e, viewer)).filter(Boolean);
}

function historyFeedItems(desk, limit, viewer) {
  const n = Math.min(Math.max(Number(limit) || 40, 1), 80);
  const slug = desk && (desk.slug || desk);
  return installHistoryOf({ deskId: slug, viewer: viewer }).slice(0, n).map((e) => ({
    kind: "install",
    id: e.id,
    t: e.timestamp,
    lane: e.status === "failed" ? "need" : (e.action === "removed" ? "stopped" : "desk"),
    when: "past",
    label: e.status === "failed" ? "Install failed" : "Install",
    slug: (e.scope && e.scope.deskId) || slug || "",
    desk: (desk && (desk.biz || desk.name || desk.slug)) || (e.scope && e.scope.deskId) || "",
    title: whatLine(e),
    status: e.eventType,
    step: e.installMode || "",
    waitingOn: "",
    who: (e.actor && e.actor.name) || "",
    hands: e.actor && e.actor.name ? [e.actor.name] : [],
    work: e.moduleType,
    pack: e.moduleId,
    eventType: e.eventType,
    moduleType: e.moduleType,
    moduleId: e.moduleId,
    version: e.version,
    previousVersion: e.previousVersion,
    installMode: e.installMode,
    installStatus: e.status,
    error: e.error,
    href: "/history"
  }));
}

function deskPackSnapshot(shop) {
  if (!shop) return { packId: "", version: null, packName: "", packQueue: null, packFace: null, packBots: null };
  return {
    packId: shop.pack ? String(shop.pack) : "",
    version: shop.packVersion != null ? String(shop.packVersion) : null,
    packName: shop.packName || "",
    packQueue: shop.packQueue || null,
    packFace: shop.packFace || null,
    packBots: shop.packBots || null
  };
}

function applyDeskPackVersion(shop, version) {
  if (!shop) return;
  if (version) shop.packVersion = String(version);
  else delete shop.packVersion;
}

function restoreDeskPack(shop, snap) {
  if (!shop || !snap) return;
  if (snap.packId) shop.pack = snap.packId;
  else delete shop.pack;
  if (snap.version) shop.packVersion = snap.version;
  else delete shop.packVersion;
  if (snap.packName) shop.packName = snap.packName;
  else delete shop.packName;
  if (snap.packQueue) shop.packQueue = snap.packQueue;
  else delete shop.packQueue;
  if (snap.packFace) shop.packFace = snap.packFace;
  else delete shop.packFace;
  if (snap.packBots) shop.packBots = snap.packBots;
  else delete shop.packBots;
}

function clearDeskPack(shop) {
  if (!shop) return;
  delete shop.pack;
  delete shop.packName;
  delete shop.packVersion;
  delete shop.packQueue;
  delete shop.packFace;
  delete shop.packBots;
}

module.exports = {
  HISTORY_MAX,
  MODULE_TYPES,
  STATUSES,
  INSTALL_MODES,
  EVENT_TYPES,
  ensureInstallHistory,
  compactInstallHistory,
  moduleTypeOf,
  versionOf,
  moduleIdOf,
  slugOf,
  actorOf,
  scopeOf,
  classifyLifecycle,
  normalizeEntry,
  publicEntry,
  maskActor,
  whatLine,
  recordInstallEvent,
  markFailed,
  installHistoryOf,
  historyFeedItems,
  deskPackSnapshot,
  applyDeskPackVersion,
  restoreDeskPack,
  clearDeskPack,
  newEventId,
  nowIso
};
