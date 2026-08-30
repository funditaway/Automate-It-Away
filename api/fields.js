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

function sameKeys(a, b) {
  return (a || []).map((f) => f.key).join(",") === (b || []).map((f) => f.key).join(",");
}

function ensureFields(shop) {
  if (!shop) return [];
  if (!Array.isArray(shop.fields)) shop.fields = [];
  if (shop.fields.length && sameKeys(shop.fields, defaultFields(shop.model))) {
    shop.fields = [];
  }
  return shop.fields;
}

function publicField(f) {
  if (!f || !f.key) return null;
  const type = f.type === "number" || f.type === "yesno" ? f.type : "text";
  return { key: String(f.key).slice(0, 32), label: String(f.label || f.key).slice(0, 40), type };
}

function parseFieldList(raw) {
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      if (!item) return null;
      if (typeof item === "string") {
        const label = item.trim();
        if (!label) return null;
        return { key: slugField(label), label: label.slice(0, 40), type: "text" };
      }
      const label = String(item.label || item.key || "").trim();
      if (!label) return null;
      const type = item.type === "number" || item.type === "yesno" ? item.type : "text";
      return { key: slugField(item.key || label), label: label.slice(0, 40), type };
    }).filter(Boolean);
  }
  return String(raw || "")
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label) => ({ key: slugField(label), label: label.slice(0, 40), type: "text" }));
}

function addShopField(shop, label, type) {
  if (!shop) return { ok: false, error: "Open a desk first so fields have a home." };
  const fields = ensureFields(shop);
  const clean = String(label || "").trim();
  if (!clean) return { ok: false, error: "Name the field." };
  const key = slugField(clean);
  if (fields.some((f) => f.key === key)) {
    return { ok: false, error: "That field is already on this desk.", fields };
  }
  if (fields.length >= 12) return { ok: false, error: "Twelve fields is enough on one desk." };
  const row = publicField({ key, label: clean, type });
  fields.push(row);
  shop.fields = fields;
  return { ok: true, field: row, fields };
}

function applyFieldList(shop, raw) {
  const incoming = parseFieldList(raw);
  const added = [];
  incoming.slice(0, 12).forEach((f) => {
    const out = addShopField(shop, f.label, f.type);
    if (out.ok) added.push(out.field);
  });
  return { fields: ensureFields(shop), added };
}

function ensureCreations(shop) {
  if (!shop) return [];
  if (!Array.isArray(shop.creations)) shop.creations = [];
  return shop.creations;
}

function publicCreation(c) {
  if (!c) return null;
  return {
    id: c.id,
    kind: c.kind || "model",
    name: c.name,
    does: c.does || "",
    fields: Array.isArray(c.fields) ? c.fields.map(publicField).filter(Boolean) : []
  };
}

function addCreation(shop, body) {
  if (!shop) return { ok: false, error: "Open a desk first so this has a home." };
  const list = ensureCreations(shop);
  const name = String((body && (body.name || body.model || body.title)) || "").trim().slice(0, 48);
  if (!name) return { ok: false, error: "Name what you are creating." };
  const kind = String((body && body.kind) || "model").toLowerCase();
  const allowed = kind === "template" || kind === "model" ? kind : "model";
  if (list.some((c) => c && String(c.name).toLowerCase() === name.toLowerCase() && c.kind === allowed)) {
    return { ok: false, error: "That is already on this desk.", creations: list.map(publicCreation).filter(Boolean) };
  }
  if (list.length >= 8) return { ok: false, error: "Eight custom creations is enough on one desk." };
  const fields = parseFieldList(body && (body.fields || body.fieldList));
  const row = {
    id: "cr_" + Date.now().toString(36),
    kind: allowed,
    name,
    does: String((body && (body.does || body.hint || body.text)) || "").trim().slice(0, 160),
    fields,
    createdAt: new Date().toISOString()
  };
  list.unshift(row);
  shop.creations = list;
  if (allowed === "model") shop.model = name;
  if (fields.length) applyFieldList(shop, fields);
  return { ok: true, creation: publicCreation(row), creations: list.map(publicCreation).filter(Boolean), fields: ensureFields(shop) };
}

function customFromText(shop, text) {
  const custom = {};
  const fields = shop ? ensureFields(shop) : [];
  const blob = String(text || "");
  fields.forEach((f) => {
    if (!f || !f.key) return;
    const label = String(f.label || f.key);
    const re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[:=]\\s*([^,;\\n]+)", "i");
    const m = blob.match(re);
    if (m) custom[f.key] = m[1].trim().slice(0, 200);
  });
  return custom;
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
  slugField, defaultFields, ensureFields, addTalk,
  publicField, parseFieldList, addShopField, applyFieldList,
  ensureCreations, publicCreation, addCreation, customFromText
};
