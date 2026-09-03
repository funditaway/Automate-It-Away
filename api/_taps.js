const ALLOWED = ["preview", "ship", "override", "kill", "carry", "done", "hand", "ask", "say", "recommend", "assign", "priority"];
const HARD = ["kill", "override", "ship"];

function clip(s, n) {
  return String(s == null ? "" : s).trim().replace(/\s+/g, " ").slice(0, n || 32);
}

function deskName(shop) {
  return clip((shop && (shop.biz || shop.name || shop.slug)) || "this desk", 40);
}

function nounsOf(shop) {
  const n = (shop && shop.nouns) || {};
  return {
    do: clip(n.do, 24) || "Do",
    qualify: clip(n.qualify, 24) || "Qualify",
    collect: clip(n.collect, 24) || "Collect",
    follow: clip(n.follow, 24) || "Follow"
  };
}

function packOf(job, shop) {
  return String((job && job.pack) || (shop && shop.model) || "").toLowerCase();
}

function publicTap(t, shop) {
  if (!t) return null;
  const action = ALLOWED.indexOf(String(t.action || "").toLowerCase()) >= 0
    ? String(t.action).toLowerCase()
    : "preview";
  let label = clip(t.label || t.text, 28);
  if (!label) return null;
  if (/^(yes|no|y|n)$/i.test(label)) {
    label = action === "kill" ? "Stop on " + deskName(shop) : action === "carry" ? "Done on " + deskName(shop) : "Preview on " + deskName(shop);
  }
  const confirm = HARD.indexOf(action) >= 0 || !!t.confirm;
  const owner = HARD.indexOf(action) >= 0 || action === "override";
  return {
    id: clip(t.id, 24) || (action + "_" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 16)),
    label,
    action,
    pass: clip(t.pass, 16) || (action === "override" ? "ship" : ""),
    confirm,
    owner,
    scope: t.scope === "all" || t.scope === "selected" ? t.scope : "this"
  };
}

function fallbackTaps(job, shop) {
  const desk = deskName(shop);
  const n = nounsOf(shop);
  const pack = packOf(job, shop);
  const missing = clip(job && job.why, 80);
  const held = job && (job.status === "held" || job.rail === "held");
  const out = [];

  if (held) {
    out.push({ label: "Preview hold on " + desk, action: "preview" });
    out.push({ label: "Owner release", action: "override", pass: "ship", confirm: true, owner: true });
    out.push({ label: "Stop on " + desk, action: "kill", confirm: true, owner: true });
    return out.map((t) => publicTap(t, shop)).filter(Boolean).slice(0, 5);
  }

  if (missing && /wait|missing|need|ask/i.test(missing)) {
    out.push({ label: "Ask on " + desk, action: "ask" });
  } else {
    out.push({ label: n.qualify + " this card", action: "recommend" });
  }

  if (/consign|resale/.test(pack)) {
    out.push({ label: "Preview " + n.collect, action: "preview" });
    out.push({ label: "Title still missing", action: "ask" });
    out.push({ label: "Sold off desk", action: "carry" });
  } else if (/vita|insur|life/.test(pack)) {
    out.push({ label: "Hold illustration", action: "preview" });
    out.push({ label: "Need family facts", action: "ask" });
    out.push({ label: "Done on " + desk, action: "carry" });
  } else if (/fund|credit/.test(pack)) {
    out.push({ label: "Hold the credit call", action: "preview" });
    out.push({ label: "Ask for numbers", action: "ask" });
  } else if (/land|lot|flood|title/.test(pack)) {
    out.push({ label: "Cap this lot", action: "priority" });
    out.push({ label: "Flag flood or title", action: "ask" });
    out.push({ label: "Packet stays draft", action: "preview" });
  } else if (/home|family|school|form/.test(pack) || (job && job.kind === "form")) {
    out.push({ label: "Text the draft", action: "carry" });
    out.push({ label: "Save the date file", action: "preview" });
    out.push({ label: "Need one fact", action: "ask" });
  } else {
    out.push({ label: n.do + " on " + desk, action: "carry" });
    out.push({ label: "Preview before it leaves", action: "preview" });
  }

  out.push({ label: "Stop on " + desk, action: "kill", confirm: true, owner: true });
  return out.map((t) => publicTap(t, shop)).filter(Boolean).slice(0, 5);
}

function applyTaps(job, incoming, shop) {
  if (!job) return [];
  const raw = Array.isArray(incoming) ? incoming : (Array.isArray(job.taps) ? job.taps : []);
  const have = {};
  const taps = raw.map((t) => publicTap(t, shop)).filter(Boolean).filter((t) => {
    if (have[t.label + t.action]) return false;
    have[t.label + t.action] = true;
    return true;
  });
  const next = taps.length ? taps.slice(0, 5) : fallbackTaps(job, shop);
  job.taps = next;
  if (!job.next || /yes or no/i.test(job.next)) {
    job.next = "AIA wrote the taps for " + deskName(shop) + ". You press one.";
  }
  return next;
}

function tapOf(job, body) {
  const taps = (job && job.taps) || [];
  const want = clip((body && (body.tapId || body.tap || body.label)) || "", 40);
  if (!want) return null;
  return taps.find((t) => t && (t.id === want || t.label === want || t.action === want)) || null;
}

module.exports = { ALLOWED, HARD, publicTap, fallbackTaps, applyTaps, tapOf, deskName };
