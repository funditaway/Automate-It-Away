const net = require("./_aia-net");

const NEVER = ["send", "stop", "money", "mail", "yes", "kill"];
const STEPS_OK = ["capture", "qualify", "do", "follow"];
const STEPS_DEFAULT = ["qualify", "do", "follow"];
const CREWS = ["Doer", "Worker", "Rail", "Packer", "Mapper", "Foreman", "Builder"];
const RAILS = "Yes / Stop / Kill stay human. Desk AIs never Yes themselves. Collect stays HOLD. No silent money or mail.";

function clip(s, n) {
  return String(s == null ? "" : s).trim().slice(0, n || 160);
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
    does: clip(raw.does, 160),
    prompt: clip(raw.prompt, 400),
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
  const prompt = clip(ai.prompt, 400);
  return {
    id: ai.id,
    name: ai.name,
    aia: aia.name,
    aiaLabel: aia.label,
    file: aia.file,
    internet: net.INTERNET,
    role: ai.role || "Doer",
    does: ai.does || "",
    prompt: prompt,
    promptSummary: clip(prompt, 80),
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

function deskAisOf(shop) {
  if (!shop) return [];
  const rows = [].concat(shop.ais || [], shop.packAis || [], shop.packBots || []);
  return normalizeAis(rows, shop.slug);
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
  const rows = [].concat(shop.ais || [], shop.packAis || [], shop.packBots || []);
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
  shop.packBots = shop.ais.slice();
  shop.packAis = shop.ais.slice();
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
  shop.packBots = (shop.ais || []).slice();
  shop.packAis = (shop.ais || []).slice();
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
  clip,
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
