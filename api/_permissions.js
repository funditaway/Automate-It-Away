const roles = require("./_roles");

const REASON_MIN = 8;

function ownerish(person) {
  return !!(person && (person.role === "owner" || person.kind === "owner"));
}

function cloneCan(src) {
  const out = roles.blankCan();
  if (!src || typeof src !== "object") return out;
  roles.CAN_KEYS.forEach((k) => {
    if (src[k] != null) out[k] = !!src[k];
  });
  return out;
}

function resolvedCan(person) {
  if (!person) return roles.blankCan();
  const kind = person.kind || (person.role === "owner" ? "owner" : "helper");
  const status = person.status || "approved";
  if (person.canSticky && person.can && typeof person.can === "object") {
    return roles.stripHard(cloneCan(person.can), person);
  }
  const base = person.can && typeof person.can === "object"
    ? Object.assign(roles.resolveCan(kind, person.crew, status), cloneCan(person.can))
    : roles.resolveCan(kind, person.crew, status);
  return roles.stripHard(base, person);
}

function publicPerson(p) {
  if (!p) return null;
  const kind = p.kind || (p.role === "owner" ? "owner" : "helper");
  const status = p.status || "approved";
  const role = roles.publicRole(p) || {};
  const can = resolvedCan(p);
  const never = role.never || (kind === "owner" ? [] : roles.HARD_OWNER.slice());
  const handle = String(p.handle || p.at || "").replace(/^@+/, "").slice(0, 40);
  const xHandle = String(p.xHandle || "").replace(/^@+/, "").slice(0, 40);
  return {
    id: p.id,
    name: p.name || "",
    role: p.role || (kind === "owner" ? "owner" : "employee"),
    kind,
    status,
    email: p.email || "",
    handle,
    at: handle ? "@" + handle : "",
    xHandle,
    crew: p.crew || role.crew || "",
    can,
    never,
    canSticky: !!p.canSticky,
    money: {
      walletId: p.walletId || "",
      charged: false,
      live: false
    },
    ext: Number(p.ext) || 0
  };
}

function tapsFrom(incoming) {
  const src = incoming && typeof incoming === "object" ? incoming : {};
  const bag = src.can && typeof src.can === "object" ? Object.assign({}, src, src.can) : src;
  const out = {};
  let hit = false;
  roles.CAN_KEYS.forEach((k) => {
    if (bag[k] != null) {
      out[k] = !!bag[k];
      hit = true;
    }
  });
  return { hit, taps: out };
}

function setSeatCan(row, id, incoming) {
  if (!row) return { ok: false, error: "No desk." };
  const seat = (row.people || []).find((p) => p && p.id === id);
  if (!seat) return { ok: false, error: "Person not found." };
  if (seat.role === "owner" || seat.kind === "owner") {
    return { ok: false, error: "Owner already has every desk tap." };
  }
  const src = incoming && typeof incoming === "object" ? incoming : {};
  if (src.kind != null) {
    const want = String(src.kind).toLowerCase();
    if (want === "owner") return { ok: false, status: 400, error: "No seat can be permitted to owner." };
    if (want === "override") return { ok: false, status: 400, error: "Override stays on the owner seat." };
    const flipped = applyKind(seat, want, { sticky: src.sticky != null ? !!src.sticky : seat.canSticky });
    if (!flipped.ok) return flipped;
  }
  const pack = tapsFrom(src);
  if (pack.taps && pack.taps.override) {
    return { ok: false, status: 403, error: "Override stays on the owner seat." };
  }
  if (pack.hit) {
    const cur = seat.can && typeof seat.can === "object" ? seat.can : roles.resolveCan(seat.kind, seat.crew, seat.status);
    seat.can = roles.stripHard(Object.assign(roles.blankCan(), cur, pack.taps), seat);
    seat.canSticky = src.sticky === false ? false : true;
  }
  return { ok: true, person: publicPerson(seat) };
}

function applyKind(seat, kind, opts) {
  opts = opts || {};
  if (!seat) return { ok: false, error: "Person not found." };
  if (seat.role === "owner" || seat.kind === "owner") {
    return { ok: false, status: 409, error: "Owner seat stays owner." };
  }
  const want = String(kind || seat.kind || "helper").toLowerCase();
  if (want === "owner") return { ok: false, status: 400, error: "No seat can be permitted to owner." };
  const keepSticky = opts.sticky != null ? !!opts.sticky : !!seat.canSticky;
  seat.kind = want;
  if (keepSticky && seat.can && typeof seat.can === "object") {
    seat.canSticky = true;
    seat.can = roles.stripHard(cloneCan(seat.can), seat);
  } else {
    seat.canSticky = false;
    seat.can = roles.stripHard(roles.resolveCan(want, seat.crew, seat.status), seat);
  }
  return { ok: true, person: publicPerson(seat) };
}

function gateOverride(actor, hold, opts) {
  opts = opts || {};
  const confirm = !!(opts.confirm);
  const reason = String(opts.reason || opts.why || opts.note || opts.killReason || "").trim();
  if (!hold) {
    return { ok: true, override: false, charged: false, live: false, rail: "sent" };
  }
  if (!actor) return { ok: false, status: 401, error: "Sign in to pass a HOLD." };
  if (actor.kind === "agent" || actor.role === "agent") {
    return { ok: false, status: 403, error: "Agents never send, stop, or touch money." };
  }
  const allowed = ownerish(actor) && (typeof roles.canOverride !== "function" || roles.canOverride(actor));
  if (!allowed) {
    return { ok: false, status: 403, error: "Only the owner can pass a HOLD." };
  }
  if (!confirm) {
    return { ok: false, status: 409, error: "Owner override needs a second tap.", hold: true };
  }
  if (reason.length < REASON_MIN) {
    return { ok: false, status: 409, error: "Write why this HOLD can pass. Eight letters or more.", hold: true };
  }
  return {
    ok: true,
    override: true,
    charged: false,
    live: false,
    rail: "owner-override",
    reason: reason.slice(0, 240)
  };
}

module.exports = {
  REASON_MIN,
  ownerish,
  publicPerson,
  resolvedCan,
  setSeatCan,
  applyKind,
  gateOverride,
  tapsFrom
};
