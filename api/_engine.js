const hand = require("./_handoff");
const ais = require("./_ais");
const {
  ensureRules, moneyWaitOf, moneyNeedsOwner,
  ruleWantsOwner, ruleWantsStop, ruleWhy,
  whenMatches, ifMatches, jobTagsOf
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
  land: { id: "land", key: "land", name: "Land", family: "Land It Away" },
  "aia-adoption": { id: "aia-adoption", key: "aia-adoption", name: "Try it on this desk", family: "Automate It Away" },
  "aia-implement": { id: "aia-implement", key: "aia-implement", name: "Four steps on this desk", family: "Automate It Away" }
};

function moneyOf(job) {
  const n = Number(job && (job.amount != null ? job.amount : job.ask));
  return Number.isFinite(n) ? n : null;
}

function blobOf(job) {
  const custom = (job && job.custom && typeof job.custom === "object") ? job.custom : {};
  return [
    job && job.title, job && job.notes, job && job.kind, job && job.pack,
    job && job.why, job && job.draft, job && job.risk, job && job.timing,
    job && job.tell, jobTagsOf(job).join(" "), custom.outcome, custom.pack, custom.need
  ].filter(Boolean).join(" ").toLowerCase();
}

const FACE_SPEC = {
  vita: {
    who: { key: "contactName", label: "Who it is for" },
    what: { key: "need", label: "What they need" },
    when: { key: "timing", label: "When" },
    where: { key: "state", label: "State" },
    how: "Draft a packet. Bind stays off. Illustration send is an owner tap.",
    next: "Draft the packet. Illustration send is an owner tap.",
    rails: ["Bind stays off the desk.", "Illustration send is an owner tap."],
    keys: { who: ["whoFor", "contactName", "who"], what: ["need", "product", "title", "kind"], when: ["timing", "when"], where: ["state", "where"] }
  },
  home: {
    who: { key: "contactName", label: "Who it is for" },
    what: { key: "need", label: "What is needed" },
    when: { key: "timing", label: "When" },
    where: { key: "where", label: "Where" },
    how: "Text, calendar file, or hand it.",
    next: "Cap same-day. Ask if a kid is named.",
    rails: ["Cap same-day cards."],
    keys: { who: ["whoFor", "contactName", "who"], what: ["need", "title", "kind"], when: ["timing", "when"], where: ["where"] }
  },
  consign: {
    who: { key: "contactName", label: "Seller" },
    what: { key: "title", label: "Item" },
    when: { key: "timing", label: "List when" },
    where: { key: "where", label: "Photo / channel" },
    how: "Draft a listing. Collect HOLD until Yes + a real money pipe.",
    next: "Draft the title. Collect HOLD until Yes + a real money pipe.",
    rails: ["Wait on me before a payout leaves."],
    keys: { who: ["contactName", "who"], what: ["title", "need", "condition"], when: ["timing", "when"], where: ["where"] }
  },
  fund: {
    who: { key: "contactName", label: "Campaign owner" },
    what: { key: "title", label: "Campaign" },
    when: { key: "timing", label: "Raise window" },
    where: { key: "where", label: "Page" },
    how: "Draft the page. Credit waits.",
    next: "Draft the page. Credit decision waits on you.",
    rails: ["Wait on me before a credit decision."],
    keys: { who: ["contactName", "who"], what: ["campaign", "title", "need"], when: ["timing", "when"], where: ["where"] }
  },
  land: {
    who: { key: "contactName", label: "Buyer" },
    what: { key: "title", label: "Lot" },
    when: { key: "timing", label: "Interest when" },
    where: { key: "where", label: "Flood / access" },
    how: "Lot note. Cap flood and title.",
    next: "Write the lot note. Cap flood and title.",
    rails: ["Cap flood cards.", "Cap title cards."],
    keys: { who: ["contactName", "who"], what: ["lot", "title", "need"], when: ["timing", "when"], where: ["where"] }
  },
  "aia-adoption": {
    who: { key: "contactName", label: "Who it is for" },
    what: { key: "need", label: "What the work is" },
    when: { key: "timing", label: "When" },
    where: { key: "deskName", label: "This desk" },
    how: "Drop real work. AIA drafts. You tap Yes or Stop.",
    next: "AIA drafts. A person taps Yes or Stop. Collect stays HOLD.",
    rails: ["Worker-first: a person taps Yes or Stop.", "Collect stays HOLD. No silent send."],
    keys: { who: ["contactName", "who"], what: ["need", "title", "kind", "notes"], when: ["timing", "when"], where: ["deskName", "where"] }
  },
  "aia-implement": {
    who: { key: "contactName", label: "Who does the work now" },
    what: { key: "need", label: "Which leak or step" },
    when: { key: "timing", label: "When it piles up" },
    where: { key: "deskName", label: "This desk" },
    how: "Walk 1→2→3→4. AIA drafts. You tap Yes, Stop, or Kill.",
    next: "Find the leaks. Hook the pipes. Name a desk AI. You still tap. Collect stays HOLD.",
    rails: ["Four steps on this desk.", "Collect stays HOLD. No silent send."],
    keys: { who: ["contactName", "who"], what: ["need", "title", "kind", "notes"], when: ["timing", "when"], where: ["deskName", "where"] }
  }
};

function clipFace(s, n) {
  return String(s || "").trim().slice(0, n || 200);
}

function installedPackId(shop) {
  if (!shop) return "";
  const raw = String(shop.pack || shop.packId || "").toLowerCase();
  if (raw) return raw;
  if (Array.isArray(shop.packs) && shop.packs[0]) {
    const p = shop.packs[0];
    return String((p && (p.id || p.packId || p)) || "").toLowerCase();
  }
  return "";
}

function packFace(id, shop) {
  const key = String(id || "").toLowerCase();
  if (FACES[key]) return FACES[key];
  const installed = installedPackId(shop);
  const use = key || installed;
  if (shop && use && (use === installed || use === String(shop.pack || "").toLowerCase())) {
    const q = shop.packQueue || {};
    return {
      id: use,
      key: use,
      name: clipFace(shop.packName || q.badge || use, 48) || "Pack",
      family: clipFace(q.family || "", 48)
    };
  }
  return FACES.home;
}

function detectPack(job, shop) {
  const custom = (job && job.custom && typeof job.custom === "object") ? job.custom : {};
  const explicit = String((job && job.pack) || custom.pack || "").trim().toLowerCase();
  if (explicit) {
    if (FACES[explicit]) return packFace(explicit).id;
    return explicit.slice(0, 40);
  }
  const installed = installedPackId(shop);
  if (installed) {
    if (FACES[installed]) return packFace(installed).id;
    return installed.slice(0, 40);
  }
  const text = blobOf(job) + " " + String((shop && (shop.does || shop.biz || shop.model)) || "").toLowerCase();
  if (/\b(quote|insur|illustration|life policy|annuity|missed call|sit-down)\b/.test(text)) return "vita";
  if (/\b(consign|resale|ebay|listing|payout|comps)\b/.test(text)) return "consign";
  if (/\b(fund|campaign|raise|credit)\b/.test(text)) return "fund";
  if (/\b(lot|acre|survey|flood|earnest|title run)\b/.test(text)) return "land";
  if (/\b(home|family|school|chore|grocery|ride|pickup|reminder)\b/.test(text)) return "home";
  return "home";
}

function slotLabel(slot, fallback) {
  if (slot && typeof slot === "object" && slot.label) return clipFace(slot.label, 40);
  if (typeof slot === "string" && slot.trim()) return clipFace(slot, 40);
  return fallback;
}

function slotKey(slot) {
  if (slot && typeof slot === "object" && slot.key) return String(slot.key);
  return "";
}

function specKeys(slot, extra) {
  const out = [];
  const k = slotKey(slot);
  if (k) out.push(k);
  (extra || []).forEach(function (key) {
    if (key && out.indexOf(key) < 0) out.push(key);
  });
  return out;
}

function firstFaceValue(job, keys) {
  const custom = (job && job.custom && typeof job.custom === "object") ? job.custom : {};
  const face = custom.face && typeof custom.face === "object" ? custom.face : {};
  const list = keys || [];
  for (let i = 0; i < list.length; i++) {
    const k = list[i];
    const v = face[k] || custom[k] || (job && job[k]);
    if (v != null && String(v).trim()) return clipFace(v, 200);
  }
  return "";
}

function howOfSpec(spec) {
  if (!spec) return "";
  if (typeof spec.how === "string") return clipFace(spec.how, 200);
  if (spec.how && spec.how.label) return clipFace(spec.how.label, 200);
  return "";
}

function packSpecOf(packId, shop) {
  const id = String(packId || installedPackId(shop) || "").toLowerCase();
  const builtId = FACES[id] ? packFace(id).id : id;
  const built = FACE_SPEC[builtId] || FACE_SPEC[id] || null;
  const file = loadPackFile(id) || (builtId !== id ? loadPackFile(builtId) : null);
  const installed = installedPackId(shop);
  const fromShop = shop && shop.packFace && typeof shop.packFace === "object" && (!installed || installed === id || (FACES[installed] && packFace(installed).id === id))
    ? shop.packFace
    : null;
  const raw = fromShop || (file && file.face && typeof file.face === "object" ? file.face : null) || built;
  if (!raw && !id) return null;
  const q = (shop && shop.packQueue) || (file && file.queue) || {};
  const name = clipFace((shop && shop.packName) || q.badge || (file && file.name) || (FACES[id] && FACES[id].name) || id, 48);
  const spec = {
    id: builtId || id,
    name: name || "Pack",
    family: clipFace(q.family || (file && file.family) || (FACES[id] && FACES[id].family) || "", 48),
    who: (raw && raw.who) || (built && built.who),
    what: (raw && raw.what) || (built && built.what),
    when: (raw && raw.when) || (built && built.when),
    where: (raw && raw.where) || (built && built.where),
    how: howOfSpec(raw) || howOfSpec(built),
    next: clipFace((raw && raw.next) || (built && built.next) || q.empty || "", 200),
    rails: (raw && Array.isArray(raw.rails) ? raw.rails : null) || (built && built.rails) || [],
    keys: (built && built.keys) || {}
  };
  if (!spec.how) spec.how = name ? (name + ". Draft the next step. A person taps Yes or Stop.") : "";
  if (!spec.next) spec.next = "On the queue. You tap Yes or Stop. Collect stays HOLD.";
  return spec;
}

function stampPackShape(job, shop) {
  if (!job) return job;
  const spec = packSpecOf(job.pack, shop);
  const faceMeta = packFace(job.pack, shop);
  const name = (spec && spec.name) || (faceMeta && faceMeta.name) || job.packName || "";
  const whoKeys = specKeys(spec && spec.who, (spec && spec.keys && spec.keys.who) || ["whoFor", "contactName", "who"]);
  const whatKeys = specKeys(spec && spec.what, (spec && spec.keys && spec.keys.what) || ["need", "title", "kind"]);
  const whenKeys = specKeys(spec && spec.when, (spec && spec.keys && spec.keys.when) || ["timing", "when"]);
  const whereKeys = specKeys(spec && spec.where, (spec && spec.keys && spec.keys.where) || ["state", "where"]);
  const who = firstFaceValue(job, whoKeys);
  const what = firstFaceValue(job, whatKeys) || clipFace((job && (job.title || job.kind)) || "", 200);
  const when = firstFaceValue(job, whenKeys) || clipFace((job && job.timing) || "", 80);
  const where = firstFaceValue(job, whereKeys);
  const how = (spec && spec.how) || "";
  job.packName = name || job.packName;
  if (spec && spec.family) job.packFamily = spec.family;
  job.custom = Object.assign({}, job.custom || {}, {
    pack: job.pack || "",
    packName: job.packName || "",
    face: {
      who: who,
      what: what,
      when: when,
      where: where,
      how: how,
      name: job.packName || "",
      labels: {
        who: slotLabel(spec && spec.who, "Who it is for"),
        what: slotLabel(spec && spec.what, "What they need"),
        when: slotLabel(spec && spec.when, "When"),
        where: slotLabel(spec && spec.where, "Where")
      }
    }
  });
  return job;
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

function brainOf(packId, kind, shop) {
  const face = packFace(packId, shop);
  const pack = String(packId || "").toLowerCase();
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
      next: "Qualify condition and title. Draft the listing. Collect HOLD until Yes + a real money pipe."
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
  if (pack === "aia-adoption" || face.id === "aia-adoption") {
    return {
      risk: "none",
      artifact: "draft on the card",
      draft: "Worker-first. Open packs. Secure-by-design. Draft the next step. A person taps Yes or Stop. Collect stays HOLD.",
      next: "Try first. Queue cards count. Workers decide. Nothing sends itself."
    };
  }
  if (pack === "aia-implement" || face.id === "aia-implement") {
    return {
      risk: "none",
      artifact: "draft on the card",
      draft: "Four steps. Find the leaks. Hook the pipes. Name a desk AI. You still tap. Collect stays HOLD.",
      next: "Walk 1→2→3→4. Queue cards count. Yes, Stop, or Kill stay human."
    };
  }
  const spec = packSpecOf(pack, shop);
  const installed = installedPackId(shop);
  if (spec && installed && !FACES[pack] && pack !== "home") {
    return {
      risk: "none",
      artifact: "draft on the card",
      draft: (spec.how || (spec.name + ". Draft the next step.")) + (/\bHOLD\b/i.test(spec.how || "") ? "" : " A person taps Yes or Stop. Collect stays HOLD."),
      next: spec.next || "On the queue. You tap Yes or Stop. Collect stays HOLD."
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
  if (!shop) return [];
  if (!Array.isArray(shop.rules)) shop.rules = [];
  return shop.rules.filter(Boolean);
}

function ruleMatches(rule, job, step) {
  if (!rule || !job) return false;
  if (!whenMatches(rule.when || rule.step || rule.attach || "qualify", step, job)) return false;
  if (!ifMatches(rule, job)) return false;
  if (rule.ifPack || rule.ifModel) {
    const want = String(rule.ifPack || rule.ifModel).toLowerCase();
    const have = String(job.pack || "").toLowerCase();
    if (have !== want && packFace(have).id !== want && packFace(have).key !== want) return false;
  }
  if (rule.ifLate && !job.late) return false;
  if (rule.ifExpired && !job.expired) return false;
  if (rule.ifDue && !(job.dueAt || job.due || job.timing)) return false;
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
    .concat(matchingRules(job, shop, "status"))
    .filter((r) => {
      const t = String(r.then || "").toLowerCase();
      return t === "cap" || t === "escalate";
    });
  if (!hits.length) return job;
  if (job.cap && job.priority) return job;
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

function addTag(job, tag) {
  const next = String(tag || "").trim();
  if (!next) return;
  const have = jobTagsOf(job);
  if (have.some(function (t) { return String(t).toLowerCase() === next.toLowerCase(); })) return;
  job.tags = have.concat([next]);
  job.custom = Object.assign({}, job.custom || {}, { tags: job.tags });
}

function markThenAiGone(job, hint) {
  if (!job || !hint) return job;
  job.thenAiGone = {
    id: String(hint.id || hint.aiId || "").slice(0, 40),
    name: String(hint.name || hint.aiName || "").slice(0, 40)
  };
  return job;
}

function applyThen(job, rule, step, shop) {
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
  } else if (then === "draft") {
    const keep = job._incomingDraft;
    const hint = (rule.aiId || rule.aiName) ? { id: rule.aiId || "", name: rule.aiName || "" } : null;
    const bound = hint && shop ? ais.findDeskAi(shop, hint) : null;
    if (hint && !bound) markThenAiGone(job, hint);
    else if (bound && job.thenAiGone) delete job.thenAiGone;
    if (shop && typeof hand.applyDeskAiDraft === "function") {
      if (!keep) {
        job.draft = "";
        job.agentDrafted = false;
        if (hint) job.deskAi = null;
      }
      if (!hint || bound) {
        hand.applyDeskAiDraft(job, shop, step || "qualify", bound || hint || job.deskAi);
      }
    }
    if (!job.draft) job.draft = why + " Desk AI draft. Human send HOLD.";
    else if (!/HOLD/i.test(String(job.draft))) job.draft = String(job.draft) + " Human send HOLD.";
    job.waitingOn = job.waitingOn || "person";
    const who = job.deskAi && job.deskAi.name;
    const goneName = hint && hint.name;
    job.next = who
      ? (who + " drafted on the card. Human send HOLD.")
      : (hint && !bound
        ? ((goneName || "That named desk AI") + " is not on this desk. Draft HOLD.")
        : (why + " Draft on the card. Human send HOLD."));
    job.log = (job.log || []).concat(["When/If/Then · draft HOLD"]);
  } else if (then === "notify") {
    const hint = (rule.aiId || rule.aiName) ? { id: rule.aiId || "", name: rule.aiName || "" } : null;
    const bound = hint && shop ? ais.findDeskAi(shop, hint) : null;
    if (bound && typeof hand.stampDeskAi === "function") {
      if (job.thenAiGone) delete job.thenAiGone;
      hand.stampDeskAi(job, shop, bound);
    } else if (hint && !bound) {
      markThenAiGone(job, hint);
    }
    const who = job.deskAi && job.deskAi.name;
    const line = who
      ? (who + " drafted. Nothing sent.")
      : (hint && !bound
        ? ((hint.name || "That named desk AI") + " is not on this desk. Nothing sent.")
        : (why + " Desk AI draft. Nothing sent."));
    job.notify = (job.notify || []).concat([{ who: "owner", text: line, hold: true }]);
    if (!job.draft) job.draft = line;
    job.waitingOn = job.waitingOn || "owner";
    job.next = job.next || line;
    job.log = (job.log || []).concat(["When/If/Then · notify HOLD"]);
  } else if (then === "queue") {
    job.alert = why;
    job.status = job.status && job.status !== "exception" ? job.status : "waiting";
    job.next = job.next || why;
    job.log = (job.log || []).concat(["When/If/Then · Queue alert"]);
  } else if (then === "tag") {
    addTag(job, rule.tag || rule.thenTag || rule.contains);
    job.log = (job.log || []).concat(["When/If/Then · tag " + (rule.tag || rule.thenTag || "")]);
  } else if (then === "escalate" || then === "cap") {
    job.priority = true;
    job.priorityAt = job.priorityAt || new Date().toISOString();
    job.priorityBy = job.priorityBy || "rule";
    job.next = job.next || why;
    job.log = (job.log || []).concat(["When/If/Then · escalate"]);
  } else if (then === "note") {
    job.log = (job.log || []).concat([why]);
  }
  if (rule.tag && then !== "tag") addTag(job, rule.tag);
}

function thenHits(job, shop, step) {
  return matchingRules(job, shop, step || "do");
}

function thenAfterYes(job, shop) {
  if (!job || !shop) return null;
  const hits = thenHits(job, shop, "do");
  if (!hits.length) return null;
  const spawn = hits.some(function (r) {
    const t = String((r && r.then) || "").toLowerCase();
    return t === "draft" || t === "queue";
  });
  if (!spawn) {
    applyRules(job, shop, "do");
    return null;
  }
  const next = {
    id: "job_" + Date.now().toString(36) + "n",
    workspace: job.workspace,
    title: job.title || "Next Then",
    notes: job.notes || "",
    why: "After Yes. Next Then. A person still taps.",
    status: "waiting",
    step: "Do",
    from: "then",
    parentId: job.id,
    pack: job.pack,
    kind: job.kind,
    tags: (job.tags || []).slice(),
    custom: Object.assign({}, job.custom || {}),
    createdAt: new Date().toISOString(),
    log: ["Then after Yes · from " + job.id],
    charged: false,
    waitingOn: "person"
  };
  if (job.deskAi) next.deskAi = job.deskAi;
  applyRules(next, shop, "do");
  if (next.status === "shipped" || next.status === "killed") next.status = "waiting";
  next.charged = false;
  if (next.waitingOn !== "owner") next.waitingOn = next.waitingOn || "person";
  if (!/HOLD/i.test(String(next.next || "")) && !/nothing sent/i.test(String(next.next || ""))) {
    next.next = String(next.next || "Next Then.").replace(/\.\s*$/, "") + ". HOLD. Nothing sent alone.";
  } else if (!/nothing sent/i.test(String(next.next || ""))) {
    next.next = String(next.next).replace(/\.\s*$/, "") + ". Nothing sent alone.";
  }
  job.nextJobId = next.id;
  job.log = (job.log || []).concat(["Then after Yes · " + next.id]);
  return next;
}

function applyRules(job, shop, step) {
  if (!job) return job;
  const hits = matchingRules(job, shop, step || "qualify");
  hits.forEach((rule) => {
    applyThen(job, rule, step, shop);
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
  const face = packFace(job && job.pack, shop);
  const pack = String((job && job.pack) || "").toLowerCase();
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
    add("hold", "Collect stays HOLD until Yes + a real money pipe.");
  } else if (face.id === "fund") {
    add("ask", "What is the raise for, and the goal?");
    add("hold", "Credit decision waits on the owner.");
  } else if (face.id === "land") {
    add("ask", "Flood, title, and access on this lot?");
    add("hold", "Earnest stays off Drop.");
  } else if (pack === "aia-adoption" || face.id === "aia-adoption") {
    add("ask", "What is the work, and who is it for?");
    add("draft", "AIA drafts. A person taps Yes or Stop.");
    add("hold", "Collect stays HOLD. No silent send.");
  } else if (pack === "aia-implement" || face.id === "aia-implement") {
    add("ask", "Which step — leak, pipe, desk AI, or guard?");
    add("draft", "AIA drafts. A person taps Yes, Stop, or Kill.");
    add("hold", "Collect stays HOLD. No silent send. No fake on-chain.");
  } else if (shop && installedPackId(shop) && !FACES[pack] && pack !== "home") {
    const spec = packSpecOf(pack, shop);
    const askBits = [slotLabel(spec && spec.who, ""), slotLabel(spec && spec.what, ""), slotLabel(spec && spec.when, "")].filter(Boolean);
    add("ask", askBits.length ? (askBits.join(", ") + "?") : "What is the work, and who is it for?");
    add("draft", (spec && spec.how) || "AIA drafts. A person taps Yes or Stop.");
    add("hold", "Collect stays HOLD. No silent send.");
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
  const face = packFace(job.pack, shop);
  job.packName = face.name;
  job.packFamily = face.family;
  stampPackShape(job, shop);
  if (!job.status || job.status === "exception") job.status = "waiting";
  if (!job.step) job.step = "Qualify";
  clock.applyClock(job, job);
  clock.tickClock(job);
  const brain = brainOf(job.pack, job.kind, shop);
  if (!job.risk || job.risk === "none") job.risk = brain.risk || "none";
  if (!job.artifact) job.artifact = brain.artifact;
  if (job.draft) job._incomingDraft = job.draft;
  else job.draft = brain.draft;
  const rules = shop ? ensureRules(shop) : [];
  const holdAt = shop ? moneyWaitOf(rules) : MONEY_HOLD;
  if (moneyNeedsOwner(moneyOf(job), holdAt)) {
    job.waitingOn = "owner";
    job.next = "Waiting on the owner.";
  }
  applyRules(job, shop, "qualify");
  applyRules(job, shop, "capture");
  applyRules(job, shop, "drop");
  applyRules(job, shop, "pipe");
  applyRules(job, shop, "inbound");
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
  delete job._incomingDraft;
  return job;
}

function followJob(job, shop) {
  if (!job || job.status === "killed" || job.status === "shipped") return job;
  clock.tickClock(job);
  applyRules(job, shop, "follow");
  applyRules(job, shop, "status");
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
  packSpecOf,
  stampPackShape,
  installedPackId,
  recommend,
  icsOf,
  whenOf,
  markFlow,
  applyRules,
  applyCap,
  thenAfterYes,
  thenHits,
  crewOf: hand.crewOf,
  MONEY_HOLD,
  PACKS,
  CAP_MAX
});
