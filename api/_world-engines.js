const fs = require("fs");
const path = require("path");

function readJson(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, rel), "utf8"));
  } catch (e) {
    return null;
  }
}

const NEVER = ["send", "stop", "pay", "bind"];
const OFFICIAL = ["home", "consign", "quote", "fund", "land"];
const WANTED13 = ["lawn", "repair", "shop-bay", "estate-day", "cleanout", "rental", "rent-due", "title-run", "survey", "year2", "wholesale", "missed-call", "delivery"];

const INSURANCE_RE = /\b(quote|insur|illustration|life policy|term life|annuity|sit-?down|fact-?find|carrier packet|underwrit|suitability|replacement|beneficiary|year-?2|medicare|acord|bind|premium|policy app)\b/;

function loadWorld() {
  const file = readJson("../packs/world-engines.json") || { packs: [] };
  const quote = readJson("../packs/quote-engines.json") || { packs: [] };
  const wanted = readJson("../packs/wanted.json") || { packs: [] };
  const byId = {};
  [].concat(wanted.packs || [], file.packs || [], quote.packs || []).forEach(function (p) {
    if (p && p.id && !byId[p.id]) byId[p.id] = p;
  });
  return byId;
}

const WORLD = loadWorld();

function blobOf(job) {
  const custom = (job && job.custom && typeof job.custom === "object") ? job.custom : {};
  return [
    job && job.title, job && job.notes, job && job.kind, job && job.pack,
    job && job.why, job && job.draft, custom.outcome, custom.pack, custom.need
  ].filter(Boolean).join(" ").toLowerCase();
}

function insuranceWords(text) {
  return INSURANCE_RE.test(String(text || "").toLowerCase());
}

function detectWorld(job, model) {
  const text = blobOf(job) + " " + String(model || "");
  const explicit = String((job && job.pack) || (job && job.custom && job.custom.pack) || "").toLowerCase();
  if (WORLD[explicit]) {
    if (insuranceWords(text) && explicit === "missed-call") return "quote";
    return explicit;
  }
  if (insuranceWords(text)) {
    if (/year-?2|annual review/.test(text)) return "year2";
    return "quote";
  }
  if (/\b(missed call|no voicemail|call back)\b/.test(text)) return "missed-call";
  const ids = Object.keys(WORLD);
  for (let i = 0; i < ids.length; i++) {
    const spec = WORLD[ids[i]];
    const hints = [].concat(spec.detect || [], spec.kinds || [], [spec.id, spec.name]);
    for (let h = 0; h < hints.length; h++) {
      const needle = String(hints[h] || "").toLowerCase();
      if (needle && text.indexOf(needle) >= 0) return spec.id;
    }
  }
  return "";
}

function faceOf(id) {
  const spec = WORLD[id] || {};
  if (spec.face) return spec.face;
  if (spec.family === "Quote It Away" || spec.aisle === "Insurance" || id === "year2" || id === "quote") return "Insurance";
  if (spec.aisle === "Consign" || spec.family === "Consign It Away") return "Consign";
  if (spec.aisle === "Fund" || spec.family === "Fund It Away") return "Fund";
  if (spec.aisle === "Land" || spec.family === "Land It Away") return "Land";
  if (spec.aisle === "Home") return "Home";
  return spec.name || "Desk";
}

function familyOf(id) {
  const spec = WORLD[id] || {};
  if (faceOf(id) === "Insurance") return "Quote It Away";
  return spec.family || "Automate It Away";
}

function brainOf(id, job) {
  const spec = WORLD[id] || {};
  return {
    id: id,
    face: faceOf(id),
    family: familyOf(id),
    wanted: spec.wanted !== false && OFFICIAL.indexOf(id) < 0,
    risk: spec.risk || "none",
    artifact: spec.artifact || "note",
    draft: spec.draft || ((job && job.title) || spec.name || "Card") + ". Draft only — Yes or Stop.",
    next: spec.next || "Copy, text, email, or hand this card.",
    recs: spec.recs || [],
    rails: spec.rails || [],
    kill: spec.kill || [],
    collect: spec.collect || "Money stays with the owner. Desk does not send.",
    follow: spec.follow || "One nudge. Desk does not text or email.",
    never: spec.never || NEVER
  };
}

function allIds() {
  return OFFICIAL.concat(WANTED13, Object.keys(WORLD).filter(function (id) {
    return OFFICIAL.indexOf(id) < 0 && WANTED13.indexOf(id) < 0;
  }));
}

module.exports = {
  NEVER,
  OFFICIAL,
  WANTED13,
  WORLD,
  INSURANCE_RE,
  insuranceWords,
  detectWorld,
  faceOf,
  familyOf,
  brainOf,
  allIds,
  blobOf
};
