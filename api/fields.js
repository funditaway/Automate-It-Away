const PACKS = ["home", "consign", "vita", "fund", "land"];
const KINDS = ["photo", "walk-in", "widget", "call", "form", "email", "note", "text"];
const RISKS = ["none", "price", "title", "flood", "suitability", "credit", "same-day", "legal"];

function blank(v) {
  if (v === undefined || v === null || v === "") return null;
  return v;
}

function pickFields(body) {
  const amount = body.amount === undefined || body.amount === "" ? null : Number(body.amount);
  return {
    pack: PACKS.includes(body.pack) ? body.pack : (body.pack || null),
    kind: blank(body.kind),
    from: blank(body.from),
    contactName: blank(body.contactName || body.name || body.who),
    phone: blank(body.phone || body.how),
    email: blank(body.email),
    notes: blank(body.notes || body.text),
    photoUrl: blank(body.photoUrl),
    provider: blank(body.provider),
    amount: Number.isFinite(amount) ? amount : null,
    condition: blank(body.condition),
    titlePresent: blank(body.titlePresent),
    compsLow: body.compsLow === undefined || body.compsLow === "" ? null : Number(body.compsLow),
    compsHigh: body.compsHigh === undefined || body.compsHigh === "" ? null : Number(body.compsHigh),
    ask: body.ask === undefined || body.ask === "" ? null : Number(body.ask),
    risk: RISKS.includes(body.risk) ? body.risk : (blank(body.risk) || "none"),
    timing: blank(body.timing),
    artifact: blank(body.artifact),
    draft: blank(body.draft),
    payoutTo: blank(body.payoutTo),
    killReason: blank(body.killReason),
    whoTapped: blank(body.whoTapped),
    promptVersion: blank(body.promptVersion)
  };
}

function mergeFields(job, body) {
  const next = pickFields(body);
  Object.keys(next).forEach((k) => {
    if (next[k] !== null && next[k] !== undefined) job[k] = next[k];
  });
  if (body.title) job.title = body.title;
  if (body.why) job.why = body.why;
  if (body.custom && typeof body.custom === "object") {
    job.custom = Object.assign({}, job.custom || {}, body.custom);
  }
  return job;
}

function slugField(label) {
  return String(label || "field")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "field";
}

function defaultFields(model) {
  const blob = String(model || "").toLowerCase();
  if (/home|family|house|life/.test(blob)) {
    return [
      { key: "who", label: "Who it is for", type: "text" },
      { key: "when", label: "When", type: "text" },
      { key: "where", label: "Where", type: "text" }
    ];
  }
  return [
    { key: "condition", label: "Condition", type: "text" },
    { key: "ask", label: "Ask", type: "number" }
  ];
}

function ensureFields(shop) {
  if (!shop) return [];
  if (!Array.isArray(shop.fields) || !shop.fields.length) {
    shop.fields = defaultFields(shop.model);
  }
  return shop.fields;
}

function addTalk(job, from, text, kind) {
  if (!job || !text) return job;
  if (!Array.isArray(job.thread)) job.thread = [];
  job.thread.push({
    at: new Date().toISOString(),
    from: from || "desk",
    text: String(text).slice(0, 500),
    kind: kind || "note"
  });
  job.thread = job.thread.slice(-40);
  return job;
}

module.exports = {
  pickFields, mergeFields, PACKS, KINDS, RISKS,
  slugField, defaultFields, ensureFields, addTalk
};
