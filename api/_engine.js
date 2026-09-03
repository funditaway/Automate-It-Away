const hand = require("./_handoff");
const {
  ensureRules, moneyWaitOf, moneyNeedsOwner,
  ruleWantsOwner, ruleWantsStop, ruleWhy
} = require("./_lib");
const clock = require("./_clock");

const MONEY_HOLD = null;
const CAP_MAX = 8;
const PACKS = ["home", "consign", "vita", "fund", "land"];

const FACES = {
  home: { id: "home", key: "home", name: "Home", family: "Automate It Away" },
  consign: { id: "consign", key: "consign", name: "Consign", family: "Consign It Away" },
  vita: { id: "vita", key: "quote", name: "Insurance", family: "Quote It Away" },
  quote: { id: "vita", key: "quote", name: "Insurance", family: "Quote It Away" },
  insurance: { id: "vita", key: "quote", name: "Insurance", family: "Quote It Away" },
  fund: { id: "fund", key: "fund", name: "Fund", family: "Fund It Away" },
  land: { id: "land", key: "land", name: "Land", family: "Land It Away" }
};
let ext = null;
try { ext = require("./_engine-ext"); } catch (e) { ext = null; }

function moneyOf(job) {
  const n = Number(job && (job.amount != null ? job.amount : job.ask));
  return Number.isFinite(n) ? n : null;
}

function blobOf(job) {
  const custom = (job && job.custom && typeof job.custom === "object") ? job.custom : {};
  return [
    job && job.title, job && job.notes, job && job.kind, job && job.pack,
    job && job.why, job && job.draft, job && job.risk, job && job.timing,
    job && job.tell, custom.outcome, custom.pack, custom.need
  ].filter(Boolean).join(" ").toLowerCase();
}

function packFace(id) {
  const key = String(id || "").toLowerCase();
  if (FACES[key]) return FACES[key];
  if (ext && ext.packFace) {
    const face = ext.packFace(key);
    if (face) return face;
  }
  return FACES.home;
}

function detectPack(job, shop) {
  const custom = (job && job.custom && typeof job.custom === "object") ? job.custom : {};
  const raw = String(
    (job && job.pack) || custom.pack || (shop && (shop.pack || shop.model)) ||
    (shop && Array.isArray(shop.packs) && shop.packs[0]) || ""
  ).toLowerCase();
  if (FACES[raw]) return packFace(raw).id;
  if (ext && ext.packFace && raw && ext.packFace(raw)) return raw;
  const text = blobOf(job) + " " + String((shop && (shop.does || shop.biz || shop.model)) || "").toLowerCase();
  if (/\b(quote|insur|illustration|life policy|annuity|missed call|sit-down)\b/.test(text)) return "vita";
  if (/\b(consign|resale|ebay|listing|payout|comps)\b/.test(text)) return "consign";
  if (/\b(fund|campaign|raise|credit)\b/.test(text)) return "fund";
  if (/\b(lot|acre|survey|flood|earnest|title run)\b/.test(text)) return "land";
  if (/\b(home|family|school|chore|grocery|ride|pickup|reminder)\b/.test(text)) return "home";
  if (shop && shop.pack) return packFace(shop.pack).id;
  return "home";
}

function detectKind(job) {
  if (job && job.kind) return String(job.kind).toLowerCase();
  const t = blobOf(job);
  if (/\b(quote|how much|estimate|illustration)\b/.test(t)) return "quote";
  if (/\b(list|sell|consign)\b/.test(t)) return "list";
  if (/\b(call|missed)\b/.test(t)) return "call";
  if (/\b(repair|fix)\b/.test(t)) return "repair";
  if (/\b(ride|pick ?up|delivery)\b/.test(t)) return "pickup";
  if (/\b(follow)\b/.test(t)) return "follow";
  if (/\b(flood|survey|lot)\b/.test(t)) return "lot";
  if (/\b(fund|campaign)\b/.test(t)) return "fund";
  return "request";
}

function loadPackFile(id) {
  const file = id === "quote" || id === "insurance" ? "vita" : id;
  try {
    return require("../packs/" + file + ".json");
  } catch (e) {
    return null;
  }
}

function packRulesOf(packId) {
  const file = loadPackFile(packId);
  return (file && Array.isArray(file.rules)) ? file.rules : [];
}

function brainOf(packId, kind) {
  if (ext && ext.brainExt) {
    const brain = ext.brainExt(packId, kind);
    if (brain) return brain;
  }
  const face = packFace(packId);
  const k = String(kind || "request").toLowerCase();
  if (face.id === "vita") {
    return {
      risk: /\b(bind|suitability|replace|illustration)\b/.test(k) || k === "quote" ? "suitability" : "none",
      artifact: "packet",
      draft: "Draft the Insurance packet. Bind stays off the desk. Illustration send is an owner tap.",
      next: k === "call" ? "Missed call on the Insurance desk. Draft the call-back. Desk does not dial."
        : "Qualify fit and state. Draft only. Owner taps before anything leaves."
    };
  }
  if (face.id === "consign") {
    return {
      risk: k === "list" ? "title" : "none",
      artifact: "listing",
      draft: "Draft the listing. Price and channel stay on the card. You still send it.",
      next: "Qualify condition and title. Draft the listing. Payout waits on the owner."
    };
  }
  if (face.id === "fund") {
    return {
      risk: "credit",
      artifact: "campaign",
      draft: "Draft the campaign page. Credit decision waits on the owner.",
      next: "Qualify the goal. Draft only. Credit stays an owner tap."
    };
  }
  if (face.id === "land") {
    return {
      risk: /flood|title/.test(k) ? "title" : "none",
      artifact: "lot note",
      draft: "Draft the lot note. Flood and title wait on the owner.",
      next: "Qualify flood, title, and access. Earnest stays off Drop."
    };
  }
  return {
    risk: /school|child|kid/.test(k) ? "legal" : "none",
    artifact: k === "book" || k === "reminder" ? "calendar" : "note",
    draft: "On the Home desk. Draft the next step. Nobody sends from here.",
    next: "On the queue. Copy, text, email, or hand it. Stop stays an owner tap."
  };
}

function rulesOf(job, shop) {
  const owner = shop ? (ensureRules(shop) || []) : [];
  const pack = packRulesOf(job && job.pack);
  return owner.concat(pack);
}

function ruleMatches(rule, job, step) {
  if (!rule || !job) return false;
  const when = String(rule.when || rule.step || "qualify").toLowerCase();
  if (when && when !== "any" && step && when !== String(step).toLowerCase()) return false;
  if (rule.ifKind && String(job.kind || "").toLowerCase() !== String(rule.ifKind).toLowerCase()) return false;
  if (rule.ifPack || rule.ifModel) {
    const want = String(rule.ifPack || rule.ifModel).toLowerCase();
    const have = String(job.pack || "").toLowerCase();
    if (have !== want && packFace(have).id !== want && packFace(have).key !== want) return false;
  }
  if (rule.contains && blobOf(job).indexOf(String(rule.contains).toLowerCase()) < 0) return false;
  if (rule.ifField && rule.ifValue) {
    const got = String((job[rule.ifField] != null ? job[rule.ifField] : (job.custom && job.custom[rule.ifField])) || "").toLowerCase();
    if (got !== String(rule.ifValue).toLowerCase()) return false;
  }
  if (rule.ifLate && !job.late) return false;
  if (rule.ifExpired && !job.expired) return false;
  if (rule.ifDue && !(job.dueAt || job.due || job.timing)) return false;
  if (rule.ifMoney != null) {
    const n = moneyOf(job);
    if (n == null || n < Number(rule.ifMoney)) return false;
  }
  return true;
}

function matchingRules(job, shop, step) {
  return rulesOf(job, shop).filter((r) => ruleMatches(r, job, step));
}

function capCount(jobs, workspace) {
  const ws = workspace || "";
  return (jobs || []).filter((j) => j && j.workspace === ws && (j.cap || j.priority) && j.status !== "killed" && j.status !== "shipped").length;
}

function applyCap(job, shop, jobs) {
  if (!job) return job;
  const hits = matchingRules(job, shop, "qualify").concat(matchingRules(job, shop, "follow"))
    .filter((r) => String(r.then || "").toLowerCase() === "cap");
  if (!hits.length) return job;
  if (job.cap || job.priority) return job;
  const ws = job.workspace || (shop && shop.slug) || "";
  const used = capCount(jobs || [], ws);
  if (used >= CAP_MAX) {
    job.next = "Cap is full (8). Take one off the pyramid first.";
    return job;
  }
  job.cap = true;
  job.priority = true;
  job.priorityAt = job.priorityAt || new Date().toISOString();
  job.priorityBy = job.priorityBy || "rule";
  job.log = (job.log || []).concat(["Cap · " + (hits[0].text || "desk rule")]);
  return job;
}

function applyRules(job, shop, step) {
  if (!job) return job;
  const hits = matchingRules(job, shop, step || "qualify");
  hits.forEach((rule) => {
    const then = String(rule.then || "").toLowerCase();
    const why = rule.text || ruleWhy([rule], job, step) || "Desk rule.";
    if (then === "stop") {
      job.waitingOn = "owner";
      job.rail = job.rail || "held";
      job.why = why;
      job.next = why + " Stop stays an owner tap.";
    } else if (then === "wait") {
      job.waitingOn = job.waitingOn || "owner";
      job.why = job.why || why;
      job.next = why;
    } else if (then === "note") {
      job.log = (job.log || []).concat([why]);
    }
  });
  if (ruleWantsStop && shop && (ruleWantsStop(ensureRules(shop), job, step || "qualify"))) {
    job.waitingOn = "owner";
    job.next = ruleWhy(ensureRules(shop), job, step || "qualify") || job.next || "Waiting on the owner.";
  } else if (ruleWantsOwner && shop && ruleWantsOwner(ensureRules(shop), job, step || "qualify")) {
    job.waitingOn = job.waitingOn || "owner";
    job.next = ruleWhy(ensureRules(shop), job, step || "qualify") || job.next || "Waiting on the owner.";
  }
  return job;
}

function engineRecs(job, shop) {
  const face = packFace(job && job.pack);
  const recs = [];
  function add(kind, text) {
    if (!text || recs.some((r) => r.text === text)) return;
    recs.push({ kind: kind, text: text });
  }
  if (job && job.late) add("hold", "Late. Open it, snooze it, or Cap it. Nothing sent.");
  if (job && job.expired) add("hold", "Expired. Open it or Stop it. Desk does not Stop itself.");
  if (face.id === "vita") {
    add("ask", "Who is it for, and which state?");
    add("draft", "Draft the packet. Bind stays off. Illustration send is an owner tap.");
    add("hold", "Do not invent premium or say they are approved.");
  } else if (face.id === "consign") {
    add("ask", "Condition and title on the piece?");
    add("draft", "Draft the listing. You still post it.");
    add("hold", "Payout waits on the owner.");
  } else if (face.id === "fund") {
    add("ask", "What is the raise for, and the goal?");
    add("hold", "Credit decision waits on the owner.");
  } else if (face.id === "land") {
    add("ask", "Flood, title, and access on this lot?");
    add("hold", "Earnest stays off Drop.");
  } else {
    add("next", "Copy, text, email, or hand this card.");
    add("ask", "Who is it for, and when?");
  }
  add("next", "Yes and Stop stay human taps.");
  return recs.slice(0, 3);
}

function recommend(job, extra, shop) {
  if (!job) return [];
  const incoming = Array.isArray(extra) ? extra : [];
  const have = {};
  job.recs = (job.recs || []).concat(engineRecs(job, shop), incoming).filter((r) => {
    const t = r && r.text;
    if (!t || have[t]) return false;
    have[t] = true;
    return true;
  }).slice(0, 8);
  return job.recs;
}

function qualifyJob(job, shop, jobs) {
  if (!job) return job;
  job.pack = detectPack(job, shop);
  job.kind = detectKind(job);
  const face = packFace(job.pack);
  job.packName = face.name;
  job.packFamily = face.family;
  job.custom = Object.assign({}, job.custom || {}, { pack: job.pack, packName: face.name });
  if (!job.status || job.status === "exception") job.status = "waiting";
  if (!job.step) job.step = "Qualify";
  clock.applyClock(job, job);
  clock.tickClock(job);
  const brain = brainOf(job.pack, job.kind);
  if (!job.risk || job.risk === "none") job.risk = brain.risk || "none";
  if (!job.artifact) job.artifact = brain.artifact;
  if (!job.draft) job.draft = brain.draft;
  const rules = shop ? ensureRules(shop) : [];
  const holdAt = shop ? moneyWaitOf(rules) : MONEY_HOLD;
  if (moneyNeedsOwner(moneyOf(job), holdAt)) {
    job.waitingOn = "owner";
    job.next = "Waiting on the owner.";
  }
  applyRules(job, shop, "qualify");
  applyRules(job, shop, "capture");
  applyCap(job, shop, jobs);
  if (!job.next) {
    const line = clock.clockLine(job);
    job.next = line || brain.next || "On the queue. You tap Yes or No.";
  }
  if (job.risk === "suitability" || job.risk === "legal" || job.risk === "title" || job.risk === "credit") {
    job.waitingOn = job.waitingOn || "owner";
  }
  recommend(job, [], shop);
  job.crew = hand.crewOf(job, shop);
  job.qualifiedAt = job.qualifiedAt || new Date().toISOString();
  job.engine = "aia.desk.v1";
  return job;
}

function followJob(job, shop) {
  if (!job || job.status === "killed" || job.status === "shipped") return job;
  clock.tickClock(job);
  applyRules(job, shop, "follow");
  if (job.expired) {
    job.waitingOn = job.waitingOn || "owner";
    job.next = job.next || "This card expired. Open it or Stop it. Nothing sent.";
    return job;
  }
  if (job.late) {
    job.next = job.next || "Late. Open it, snooze it, or Cap it.";
    job.log = (job.log || []).concat(["Follow · late nudge"]);
    return job;
  }
  if (job.status === "out" || job.offDesk) {
    job.next = job.next || "Off the desk. Waiting on write-back, or tap Done off desk.";
    job.followed = true;
    job.log = (job.log || []).concat(["Follow · off-desk nudge"]);
    return job;
  }
  if (!job.followed) {
    job.followed = true;
    job.next = job.next || "One nudge on the card. Desk does not text or email.";
    job.log = (job.log || []).concat(["Follow · nudge"]);
  }
  job.crew = hand.crewOf(job, shop);
  return job;
}

function runWorkspace(jobs, now, shop) {
  let clocked = 0;
  let qualified = 0;
  let followed = 0;
  (jobs || []).forEach((job) => {
    if (!job) return;
    if (clock.tickClock(job, now)) clocked += 1;
    if (job.status === "killed" || job.status === "shipped") return;
    if ((job.status === "exception" && !job.qualifiedAt) || !job.pack) {
      qualifyJob(job, shop, jobs);
      qualified += 1;
    }
    if (job.status === "waiting" || job.status === "out" || job.offDesk || job.late || job.expired) {
      followJob(job, shop);
      followed += 1;
    }
  });
  return { ok: true, qualified, followed, clocked, touched: qualified + clocked + followed };
}

function whenOf(job) {
  const parsed = clock.parseClock(clock.dueSource(job) || (job && job.timing) || "", Date.now());
  return parsed || "";
}

function pad(n) { return String(n).padStart(2, "0"); }
function stamp(d) {
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z";
}
function icsEscape(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
function icsOf(job) {
  const start = clock.parseClock(clock.dueSource(job) || (job && job.timing) || "", Date.now()) || new Date();
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const title = icsEscape((job && job.title) || "Desk item");
  const desc = icsEscape((job && (job.draft || job.why)) || "");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Automate It Away//Desk//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT", "UID:" + ((job && job.id) || "job") + "@automateitaway.com", "DTSTAMP:" + stamp(new Date()), "DTSTART:" + stamp(start), "DTEND:" + stamp(end), "SUMMARY:" + title, "DESCRIPTION:" + desc, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}

function markFlow(job, step) {
  if (!job) return job;
  job.flow = (job.flow || []).concat([{ step: step || job.step, at: new Date().toISOString() }]);
  return job;
}

module.exports = Object.assign({}, hand, {
  qualifyJob,
  followJob,
  runWorkspace,
  detectPack,
  detectKind,
  packFace,
  recommend,
  icsOf,
  whenOf,
  markFlow,
  applyRules,
  applyCap,
  crewOf: hand.crewOf,
  MONEY_HOLD,
  PACKS,
  CAP_MAX
});
