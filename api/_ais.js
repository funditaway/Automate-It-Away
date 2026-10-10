const net = require("./_aia-net");

const NEVER = ["send", "stop", "money", "mail", "yes", "kill"];
const STEPS_OK = ["capture", "qualify", "do", "follow"];
const STEPS_DEFAULT = ["qualify", "do", "follow"];
const CREWS = ["Doer", "Worker", "Rail", "Packer", "Mapper", "Foreman", "Builder"];
const RAILS = "Yes / Stop / Kill stay human. Desk AIs never Yes themselves. Collect stays HOLD. No silent money or mail.";
const FIRM = "Draft ready. I cannot send, pay, or bind anything. You stay in control.";
const TAGLINE = "Desk AIs that draft. Humans that decide.";
const DEFAULT_DOES = "Drafts the next step and the words. Nothing sent.";
const DEFAULT_PROMPT = FIRM + " " + TAGLINE + " Never send, pay, or bind. Collect stays HOLD.";

// Full Desk AI objects live in shop.ais. packAis and packBots mirror that list.
// This stays false in production: a save still writes full object copies, the
// same shape as before. True writes AI id strings only. Readers accept both.
// Flip the exported flag in-process for a check. Do not read an env var.
// A ref has no per-pack fields. It is the AI id and nothing else.
const STORE_AI_REFS = false;

function clip(s, n) {
  return String(s == null ? "" : s).trim().slice(0, n || 160);
}

// Cut to max Unicode code points. Array.from walks code points, so an emoji
// or other astral character is never split into a lone surrogate.
function cutCodePoints(str, max) {
  const chars = Array.from(str);
  if (chars.length <= max) return str;
  return chars.slice(0, max).join("");
}

// Desk AI rules are stored text only. Cap at 1000 Unicode code points. Do not
// trim, interpret, or run them. Over-long text is cut to 1000 with no error.
// null and undefined are empty text. An object, array, number, or boolean
// is empty text too — never "[object Object]" or any other coerced string.
function rulesText(v) {
  if (typeof v !== "string") return "";
  return cutCodePoints(v, 1000);
}

// Desk AI plan is stored text only, in order. Cap at 200 lines and 500
// Unicode code points each. Trim whitespace, cut, then trim trailing
// whitespace again. Drop a line that ends up empty. Count a line in trimmed
// only when that 500 cut changes the stored text. Drop non-strings, and keep
// the first 200. Do not run, charge, or enforce them. A missing value or
// anything that is not an array is []. This is not the draft allow-list.
const PLAN_MAX = 200;
const PLAN_CHARS = 500;

function planText(v) {
  if (!Array.isArray(v)) return { plan: [], cut: null };
  const plan = [];
  const droppedIndexes = [];
  const trimmedIndexes = [];
  v.forEach(function (item, index) {
    if (typeof item !== "string") { droppedIndexes.push(index); return; }
    const trimmedInput = item.trim();
    if (!trimmedInput) { droppedIndexes.push(index); return; }
    if (plan.length >= PLAN_MAX) { droppedIndexes.push(index); return; }
    const stored = cutCodePoints(trimmedInput, PLAN_CHARS).trimEnd();
    if (!stored) { droppedIndexes.push(index); return; }
    if (stored !== trimmedInput) trimmedIndexes.push(index);
    plan.push(stored);
  });
  const dropped = droppedIndexes.length;
  const trimmed = trimmedIndexes.length;
  const cut = (dropped || trimmed) ? {
    kept: plan.length,
    dropped: dropped,
    trimmed: trimmed,
    droppedIndexes: droppedIndexes,
    trimmedIndexes: trimmedIndexes
  } : null;
  return { plan: plan, cut: cut };
}

function planListOk(v) {
  return Array.isArray(v) && v.every(function (item) { return typeof item === "string"; });
}

function slugAi(name) {
  return String(name || "desk-ai").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "desk-ai";
}

function parseList(v) {
  if (Array.isArray(v)) {
    return v.map(function (s) { return clip(typeof s === "string" ? s : (s && (s.id || s.name || s.step)), 24); }).filter(Boolean);
  }
  return String(v || "").split(/[,;]+/).map(function (s) { return s.trim(); }).filter(Boolean);
}

function parseSteps(v) {
  const rows = parseList(v).map(function (s) { return String(s).toLowerCase(); });
  const out = [];
  rows.forEach(function (s) {
    if (s === "collect" || s === "send" || s === "pay" || s === "money" || s === "mail") return;
    if (STEPS_OK.indexOf(s) >= 0 && out.indexOf(s) < 0) out.push(s);
  });
  return out.length ? out : STEPS_DEFAULT.slice();
}

function neverOf(extra) {
  const extraList = parseList(extra).map(function (s) { return String(s).toLowerCase(); });
  const out = NEVER.slice();
  extraList.forEach(function (s) {
    if (out.indexOf(s) < 0) out.push(s);
  });
  return out;
}

function crewOf(raw) {
  const want = clip(raw, 16);
  const hit = CREWS.find(function (c) { return c.toLowerCase() === want.toLowerCase(); });
  return hit || "Doer";
}

function normalizeAi(raw, workspace) {
  if (!raw) return null;
  if (typeof raw === "string") raw = { name: raw };
  if (typeof raw !== "object") return null;
  const name = clip(raw.name, 40);
  if (!name) return null;
  const deny = neverOf(raw.deny || raw.never);
  let steps = parseSteps(raw.steps || raw.allow);
  steps = steps.filter(function (s) { return deny.indexOf(s) < 0; });
  if (!steps.length) steps = ["qualify"];
  const aia = net.of(raw.aia || raw.aiaName || raw.host || raw.file || name, slugAi(name));
  return {
    id: clip(raw.id, 40) || slugAi(name),
    workspace: workspace || raw.workspace || "",
    name: name,
    aia: aia.name,
    aiaLabel: aia.label,
    file: aia.file,
    internet: net.INTERNET,
    role: crewOf(raw.role || raw.crew || "Doer"),
    does: clip(raw.does, 160) || DEFAULT_DOES,
    prompt: clip(raw.prompt, 400) || DEFAULT_PROMPT,
    rules: rulesText(raw.rules),
    plan: planText(raw.plan).plan,
    steps: steps,
    allow: steps.slice(),
    deny: deny,
    never: NEVER.slice(),
    draftOnly: true,
    bound: "desk",
    kind: "desk-ai",
    chain: false,
    owned: false
  };
}

function normalizeAis(rows, workspace) {
  const src = Array.isArray(rows) ? rows : [];
  const out = [];
  const seen = {};
  src.slice(0, 3).forEach(function (row) {
    const ai = normalizeAi(row, workspace);
    if (!ai) return;
    const key = String(ai.name).toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    out.push(ai);
  });
  return out;
}

function promptSummary(ai, n) {
  return clip((ai && (ai.promptSummary || ai.prompt)) || "", n || 80);
}

function publicAi(ai) {
  if (!ai) return null;
  const aia = net.of(ai.aia || ai.aiaName || ai.file || ai.name, ai.id || "desk-ai");
  const prompt = clip(ai.prompt, 400) || DEFAULT_PROMPT;
  return {
    id: ai.id,
    name: ai.name,
    aia: aia.name,
    aiaLabel: aia.label,
    file: aia.file,
    internet: net.INTERNET,
    role: ai.role || "Doer",
    does: ai.does || DEFAULT_DOES,
    prompt: prompt,
    promptSummary: clip(prompt, 80),
    rules: rulesText(ai.rules),
    plan: planText(ai.plan).plan,
    face: clip(ai.name, 40) + " · Then draft",
    steps: ai.steps || [],
    allow: ai.allow || ai.steps || [],
    deny: ai.deny || NEVER.slice(),
    never: NEVER.slice(),
    draftOnly: true,
    bound: "desk",
    rails: RAILS,
    chain: false,
    owned: false
  };
}

function packRefsOn() {
  return module.exports.STORE_AI_REFS === true;
}

function findStoredAi(shop, id) {
  const want = String(id || "").toLowerCase();
  if (!want || !shop) return null;
  return (shop.ais || []).find(function (ai) {
    return ai && String(ai.id || "").toLowerCase() === want;
  }) || null;
}

function hasAiBody(row) {
  return !!(row.name || row.does || row.prompt || row.steps || row.allow || row.role || row.aia || row.rules || row.plan || row.deny || row.file || row.workspace);
}

// Real Desk AI ids are slugAi output from a name: lowercase, at most 40
// characters, and at least one hyphen ("Plan AI" → "plan-ai"). A one-word
// name string such as "helper" is not that shape. Skip a string only when it
// is an id and no AI in ais has that id. Anything else stays a name.
function aiIdShape(s) {
  const t = String(s || "");
  return t.length <= 40 && /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(t);
}

// Old mirrors are full AI objects. New mirrors are an id string or { id }
// with no AI body. Anything with a name or other stored AI fields is the old
// shape and is returned as-is. A string that is not an id stays a name.
// An id that is no longer in ais is a dead ref: leave it out. No blank row
// and no partial { id } object in the rows readers return.
function resolvePackRow(shop, row) {
  if (typeof row === "string") {
    if (!String(row).trim()) return null;
    const hit = findStoredAi(shop, row);
    if (hit) return hit;
    if (aiIdShape(row)) return null;
    return row;
  }
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  if (hasAiBody(row)) return row;
  if (row.id != null && String(row.id) !== "") return findStoredAi(shop, row.id) || null;
  return row;
}

function storedAiRows(shop) {
  if (!shop) return [];
  const out = [];
  [].concat(shop.ais || [], shop.packAis || [], shop.packBots || []).forEach(function (row) {
    const resolved = resolvePackRow(shop, row);
    if (resolved == null) return;
    out.push(resolved);
  });
  return out;
}

function writePackMirrors(shop) {
  const rows = (shop && shop.ais) || [];
  if (packRefsOn()) {
    const ids = [];
    rows.forEach(function (ai) {
      if (ai && ai.id) ids.push(String(ai.id));
    });
    shop.packBots = ids.slice();
    shop.packAis = ids.slice();
    return;
  }
  shop.packBots = rows.slice();
  shop.packAis = rows.slice();
}

function deskAisOf(shop) {
  if (!shop) return [];
  return normalizeAis(storedAiRows(shop), shop.slug);
}

function aiMayDraft(ai, step) {
  if (!ai) return false;
  const st = String(step || "qualify").toLowerCase();
  if (st === "collect" || st === "send" || st === "pay") return false;
  const deny = (ai.deny || NEVER).map(function (s) { return String(s).toLowerCase(); });
  if (deny.indexOf(st) >= 0) return false;
  if (deny.indexOf("send") < 0) deny.push("send");
  const allow = (ai.steps || ai.allow || STEPS_DEFAULT).map(function (s) { return String(s).toLowerCase(); });
  return allow.indexOf(st) >= 0;
}

function allDeskAis(shop) {
  if (!shop) return [];
  const rows = storedAiRows(shop);
  const out = [];
  const seen = {};
  rows.forEach(function (row) {
    const ai = normalizeAi(row, shop.slug);
    if (!ai) return;
    const key = String(ai.id || ai.name).toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    out.push(ai);
  });
  return out.slice(0, 6);
}

function findDeskAi(shop, hint) {
  if (!shop) return null;
  const rows = allDeskAis(shop);
  const raw = hint && typeof hint === "object" ? hint : { id: hint, name: hint };
  const id = clip(raw.id || raw.aiId || raw.ai || "", 40).toLowerCase();
  const name = clip(raw.name || raw.aiName || "", 40).toLowerCase();
  if (id) {
    const byId = rows.find(function (a) {
      return a && (String(a.id || "").toLowerCase() === id || String(a.seatId || "").toLowerCase() === id);
    });
    if (byId) return byId;
    const seat = (shop.people || []).find(function (p) {
      if (!p || !p.deskAi) return false;
      return String(p.id || "").toLowerCase() === id || String(p.aiId || "").toLowerCase() === id;
    });
    if (seat) {
      const viaSeat = rows.find(function (a) {
        return a && (a.id === seat.aiId || String(a.name || "").toLowerCase() === String(seat.name || "").toLowerCase());
      });
      if (viaSeat) return viaSeat;
    }
  }
  if (name) {
    return rows.find(function (a) { return a && String(a.name || "").toLowerCase() === name; }) || null;
  }
  return null;
}

function aiHintPresent(hint) {
  if (hint == null || hint === false) return false;
  if (typeof hint === "string") return !!clip(hint, 40);
  if (typeof hint !== "object") return false;
  return !!(clip(hint.id || hint.aiId || hint.ai || "", 40) || clip(hint.name || hint.aiName || "", 40));
}

function pickDeskAi(shop, step, hint) {
  const ais = allDeskAis(shop);
  const bound = findDeskAi(shop, hint);
  if (bound && aiMayDraft(bound, step)) return bound;
  if (bound) return bound;
  if (aiHintPresent(hint)) return null;
  return ais.find(function (a) { return aiMayDraft(a, step); }) || null;
}

function liveDeskAi(shop, hint) {
  const found = findDeskAi(shop, hint);
  if (!found || !shop || !Array.isArray(shop.ais)) return null;
  return shop.ais.find(function (a) {
    return a && (a.id === found.id || String(a.name || "").toLowerCase() === String(found.name || "").toLowerCase());
  }) || null;
}

function findAiSeat(shop, ai) {
  if (!shop || !ai) return null;
  const want = String(ai.name || "").toLowerCase();
  const id = String(ai.id || "");
  return (shop.people || []).find(function (p) {
    if (!p || !p.deskAi) return false;
    return String(p.name || "").toLowerCase() === want || p.aiId === id || p.id === ai.seatId;
  }) || null;
}

function attachAisToDesk(shop, rows) {
  if (!shop) return 0;
  const incoming = normalizeAis(rows, shop.slug);
  if (!Array.isArray(shop.people)) shop.people = [];
  if (!Array.isArray(shop.ais)) shop.ais = [];
  let added = 0;
  incoming.forEach(function (ai) {
    let have = liveDeskAi(shop, ai);
    if (have) {
      const keepId = have.id;
      const keepSeat = have.seatId;
      Object.assign(have, ai, { id: keepId });
      if (keepSeat) have.seatId = keepSeat;
    }
    else {
      shop.ais.push(ai);
      added += 1;
    }
    const row = have || ai;
    let seat = findAiSeat(shop, row);
    if (!seat) {
      seat = {
        id: "ai_" + slugAi(row.id || row.name),
        name: row.name,
        role: "agent",
        kind: "agent",
        crew: row.role || "Doer",
        status: "approved",
        deskAi: true,
        aiId: row.id,
        aia: row.aia,
        allow: row.allow,
        steps: row.steps,
        deny: row.deny,
        never: row.never,
        prompt: row.prompt,
        does: row.does,
        createdAt: new Date().toISOString(),
        approvedAt: new Date().toISOString()
      };
      shop.people.push(seat);
    } else {
      seat.status = "approved";
      seat.kind = "agent";
      seat.role = "agent";
      seat.name = row.name || seat.name;
      seat.crew = row.role || seat.crew;
      seat.allow = row.allow;
      seat.steps = row.steps;
      seat.deny = row.deny;
      seat.never = row.never;
      seat.prompt = row.prompt;
      seat.does = row.does;
      seat.aia = row.aia || seat.aia;
      seat.deskAi = true;
      seat.aiId = row.id;
      seat.approvedAt = seat.approvedAt || new Date().toISOString();
    }
    row.seatId = seat.id;
  });
  shop.ais = shop.ais.slice(0, 6);
  writePackMirrors(shop);
  return added;
}

function removeDeskAi(shop, id) {
  if (!shop) return { ok: false, error: "Open a desk first." };
  const want = String(id || "").toLowerCase();
  if (!want) return { ok: false, error: "Name the AI to remove." };
  const before = (shop.ais || []).length;
  shop.ais = (shop.ais || []).filter(function (a) {
    return a && String(a.id || "").toLowerCase() !== want && String(a.name || "").toLowerCase() !== want;
  });
  shop.people = (shop.people || []).filter(function (p) {
    if (!p || !p.deskAi) return true;
    return String(p.aiId || "").toLowerCase() !== want && String(p.name || "").toLowerCase() !== want && String(p.id || "").toLowerCase() !== want;
  });
  writePackMirrors(shop);
  if ((shop.ais || []).length === before) return { ok: false, error: "No desk AI by that name." };
  return { ok: true, ais: (shop.ais || []).map(publicAi) };
}

function actorIsDeskAi(person) {
  if (!person) return false;
  return !!(person.deskAi || person.kind === "agent" || person.role === "agent");
}

function railsOf(shop) {
  const ais = allDeskAis(shop);
  const deskNet = net.of(shop && (shop.aia || shop.aiaName || shop.slug), shop && shop.slug);
  return {
    ais: ais.map(publicAi).filter(Boolean),
    count: ais.length,
    rails: RAILS,
    never: NEVER.slice(),
    aia: deskNet.name,
    internet: net.INTERNET,
    net: net.publicNet(deskNet)
  };
}

function stepOf(job) {
  const raw = String((job && job.step) || "qualify").toLowerCase();
  if (raw === "capture" || raw === "qualify" || raw === "do" || raw === "follow") return raw;
  if (raw === "collect") return "collect";
  return "qualify";
}

module.exports = {
  NEVER,
  STEPS_OK,
  STEPS_DEFAULT,
  RAILS,
  FIRM,
  TAGLINE,
  DEFAULT_DOES,
  DEFAULT_PROMPT,
  STORE_AI_REFS,
  clip,
  rulesText,
  planText,
  planListOk,
  slugAi,
  normalizeAi,
  normalizeAis,
  publicAi,
  deskAisOf,
  promptSummary,
  aiMayDraft,
  pickDeskAi,
  aiHintPresent,
  findDeskAi,
  liveDeskAi,
  findAiSeat,
  attachAisToDesk,
  removeDeskAi,
  actorIsDeskAi,
  railsOf,
  neverOf,
  stepOf
};
