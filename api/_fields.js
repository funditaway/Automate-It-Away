const PACKS = ["home", "consign", "vita", "fund", "land"];
const KINDS = ["photo", "walk-in", "widget", "call", "form", "email", "note", "text", "request"];
const RISKS = ["none", "price", "title", "flood", "suitability", "credit", "same-day", "legal"];
const DROP_WHO = ["family", "friend", "helper", "staff", "owner"];
function blank(v) { if (v === undefined || v === null || v === "") return null; return v; }
function splitContact(body) {
  const how = String(body.how || "").trim();
  let phone = body.phone; let email = body.email;
  if (how && /@/.test(how)) email = email || how; else if (how) phone = phone || how;
  return { phone: blank(phone), email: blank(email) };
}
function pickFields(body) {
  const amount = body.amount === undefined || body.amount === "" ? null : Number(body.amount);
  const contact = splitContact(body);
  const sourceUrl = blank(body.sourceUrl || body.extUrl || body.url);
  const nextCustom = body.custom && typeof body.custom === "object" ? Object.assign({}, body.custom) : {};
  if (sourceUrl) nextCustom.sourceUrl = String(sourceUrl).slice(0, 300);
  if (body.lane) nextCustom.lane = String(body.lane).slice(0, 24);
  const whoKind = DROP_WHO.includes(String(body.droppedByKind || body.whoKind || "").toLowerCase())
    ? String(body.droppedByKind || body.whoKind).toLowerCase()
    : null;
  if (whoKind) nextCustom.droppedByKind = whoKind;
  if (body.mode) nextCustom.mode = String(body.mode).slice(0, 24);
  const custom = Object.keys(nextCustom).length ? nextCustom : null;
  const fields = { pack: PACKS.includes(body.pack) ? body.pack : (body.pack || null), kind: blank(body.kind), from: blank(body.from), contactName: blank(body.contactName || body.name || body.who), phone: contact.phone, email: contact.email, notes: blank(body.notes || body.text), photoUrl: blank(body.photoUrl), provider: blank(body.provider), amount: Number.isFinite(amount) ? amount : null, condition: blank(body.condition), titlePresent: blank(body.titlePresent), compsLow: body.compsLow === undefined || body.compsLow === "" ? null : Number(body.compsLow), compsHigh: body.compsHigh === undefined || body.compsHigh === "" ? null : Number(body.compsHigh), ask: body.ask === undefined || body.ask === "" ? null : Number(body.ask), risk: RISKS.includes(body.risk) ? body.risk : (blank(body.risk) || "none"), timing: blank(body.timing), artifact: blank(body.artifact), draft: blank(body.draft), payoutTo: blank(body.payoutTo), killReason: blank(body.killReason), whoTapped: blank(body.whoTapped), promptVersion: blank(body.promptVersion), assignee: blank(body.assignee || body.handTo || body.ai), droppedByKind: whoKind, sourceUrl, custom };
  const to = blank(body.to);
  const aiaMail = blank(body.aiaMail);
  if (to) fields.to = to;
  if (aiaMail) fields.aiaMail = aiaMail;
  return fields;
}
function mergeFields(job, body) {
  const next = pickFields(body);
  Object.keys(next).forEach((k) => { if (next[k] !== null && next[k] !== undefined) job[k] = next[k]; });
  if (body.title) job.title = body.title;
  if (body.why) job.why = body.why;
  if (body.custom && typeof body.custom === "object") job.custom = Object.assign({}, job.custom || {}, body.custom);
  return job;
}
function slugField(label) {
  return String(label || "field").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "field";
}
function defaultFields(model) {
  const blob = String(model || "").toLowerCase();
  if (/home|family|house|life/.test(blob)) return [{ key: "who", label: "Who it is for", type: "text" }, { key: "when", label: "When", type: "text" }, { key: "where", label: "Where", type: "text" }];
  return [{ key: "condition", label: "Condition", type: "text" }, { key: "ask", label: "Ask", type: "number" }];
}
function sameKeys(a, b) { return (a || []).map((f) => f.key).join(",") === (b || []).map((f) => f.key).join(","); }
function ensureFields(shop) {
  if (!shop) return [];
  if (!Array.isArray(shop.fields)) shop.fields = [];
  if (shop.fields.length && sameKeys(shop.fields, defaultFields(shop.model))) shop.fields = [];
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
      if (typeof item === "string") { const label = item.trim(); if (!label) return null; return { key: slugField(label), label: label.slice(0, 40), type: "text" }; }
      const label = String(item.label || item.key || "").trim();
      if (!label) return null;
      const type = item.type === "number" || item.type === "yesno" ? item.type : "text";
      return { key: slugField(item.key || label), label: label.slice(0, 40), type };
    }).filter(Boolean);
  }
  return String(raw || "").split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean).map((label) => ({ key: slugField(label), label: label.slice(0, 40), type: "text" }));
}
function addShopField(shop, label, type) {
  if (!shop) return { ok: false, error: "Open a desk first so fields have a home." };
  const fields = ensureFields(shop);
  const clean = String(label || "").trim();
  if (!clean) return { ok: false, error: "Name the field." };
  const key = slugField(clean);
  if (fields.some((f) => f.key === key)) return { ok: false, error: "That field is already on this desk.", fields };
  if (fields.length >= 12) return { ok: false, error: "Twelve fields is enough on one desk." };
  const row = publicField({ key, label: clean, type });
  fields.push(row); shop.fields = fields;
  return { ok: true, field: row, fields };
}
function applyFieldList(shop, raw) {
  const incoming = parseFieldList(raw); const added = [];
  incoming.slice(0, 12).forEach((f) => { const out = addShopField(shop, f.label, f.type); if (out.ok) added.push(out.field); });
  return { fields: ensureFields(shop), added };
}
function ensureCreations(shop) { if (!shop) return []; if (!Array.isArray(shop.creations)) shop.creations = []; return shop.creations; }
function publicCreation(c) {
  if (!c) return null;
  return { id: c.id, kind: c.kind || "model", name: c.name, does: c.does || "", fields: Array.isArray(c.fields) ? c.fields.map(publicField).filter(Boolean) : [] };
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
  const row = { id: "cr_" + Date.now().toString(36), kind: allowed, name, does: String((body && (body.does || body.hint || body.text)) || "").trim().slice(0, 160), fields, createdAt: new Date().toISOString() };
  list.unshift(row); shop.creations = list;
  if (allowed === "model") shop.model = name;
  if (fields.length) applyFieldList(shop, fields);
  return { ok: true, creation: publicCreation(row), creations: list.map(publicCreation).filter(Boolean), fields: ensureFields(shop) };
}
function customFromText(shop, text) {
  const custom = {}; const fields = shop ? ensureFields(shop) : []; const blob = String(text || "");
  fields.forEach((f) => {
    if (!f || !f.key) return;
    const label = String(f.label || f.key);
    const re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[:=]\\s*([^,;\\n]+)", "i");
    const m = blob.match(re);
    if (m) custom[f.key] = m[1].trim().slice(0, 200);
  });
  return custom;
}
function firstWorkLine(text) {
  return String(text || "").split(/\n/).map((s) => s.trim()).find(Boolean) || "";
}
function implementFromText(shop, text) {
  const blob = String(text || "").trim();
  const out = { custom: customFromText(shop, blob) };
  if (!blob) return out;
  const email = blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email) out.email = email[0];
  const phone = blob.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/);
  if (phone) out.phone = phone[0];
  const dollars = blob.match(/\$\s*(\d+(?:\.\d{1,2})?)/) || blob.match(/\b(\d+(?:\.\d{1,2})?)\s*(?:dollars|usd)\b/i);
  if (dollars) {
    const n = Number(dollars[1]);
    if (Number.isFinite(n)) out.amount = n;
  }
  const when = blob.match(/\b(?:by |due |on |at )?((?:mon|tue|wed|thu|fri|sat|sun)[a-z]*(?:\s+\d{1,2}(?:\/\d{1,2})?)?(?:\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
  if (when) out.timing = String(when[1] || when[0]).trim().slice(0, 80);
  const named = blob.match(/\b(?:from|name|i am|i'm|this is)[ \t]*[:\-]?[ \t]*([A-Za-z][A-Za-z'.-]+(?:[ \t]+[A-Za-z][A-Za-z'.-]+)?)/i);
  if (named) out.contactName = named[1].trim().slice(0, 80);
  const title = firstWorkLine(blob).replace(/^[-*•]\s*/, "").slice(0, 160);
  if (title) out.title = title;
  return out;
}
function applyImplement(job, shop, body) {
  if (!job) return job;
  const blob = String((body && (body.implement || body.data || body.tell || body.notes)) || job.tell || job.notes || "").trim();
  const mapped = implementFromText(shop, blob);
  if (!job.title || job.title === "Untitled") {
    if (mapped.title) job.title = mapped.title;
  }
  if (!job.contactName && mapped.contactName) job.contactName = mapped.contactName;
  if (!job.phone && mapped.phone) job.phone = mapped.phone;
  if (!job.email && mapped.email) job.email = mapped.email;
  if ((job.amount == null || job.amount === "") && mapped.amount != null) job.amount = mapped.amount;
  if (!job.timing && mapped.timing) job.timing = mapped.timing;
  job.custom = Object.assign({}, job.custom || {}, mapped.custom || {}, { implemented: true });
  job.implementedAt = new Date().toISOString();
  return job;
}
function assignIfKnown(job, shop, body) {
  const want = String((body && (body.assignee || body.handTo || body.ai)) || job.assignee || "").trim();
  const people = shop && Array.isArray(shop.people) ? shop.people : [];
  if (!want) { delete job.assignee; return job; }
  const whoPerson = people.find((p) => p && (p.id === want || String(p.name || "").toLowerCase() === want.toLowerCase()));
  if (!whoPerson) { delete job.assignee; return job; }
  job.assignee = whoPerson.name;
  job.waitingOn = whoPerson.role === "owner" ? "owner" : "helper";
  job.next = "Waiting on " + whoPerson.name + ".";
  return job;
}
function makeCapturedJob(workspace, shop, body) {
  const src = body && typeof body === "object" ? body : {};
  const fields = pickFields(src);
  const job = { id: "job_" + Date.now().toString(36), workspace, title: String(src.title || fields.notes || "Untitled").slice(0, 160), why: src.why || "Captured.", status: "exception", step: "Qualify", createdAt: new Date().toISOString(), log: ["Captured"], ...fields, from: fields.from || src.from || "widget", externalId: src.externalId ? String(src.externalId).slice(0, 80) : null };
  if (fields.custom) job.custom = fields.custom;
  assignIfKnown(job, shop, src);
  const tell = String(src.tell || src.tellAia || src.implement || "").trim().slice(0, 800);
  if (tell) {
    job.tell = tell.slice(0, 400);
    addTalk(job, src.whoTapped || src.contactName || "drop", tell, "tell");
  }
  const mode = String(src.mode || (src.custom && src.custom.mode) || src.lane || "").toLowerCase();
  if (src.implement || src.data || mode === "agent" || mode === "ops") applyImplement(job, shop, src);
  if (job.droppedByKind) addTalk(job, job.contactName || "drop", "Dropped by " + job.droppedByKind + ".", "note");
  if (Array.isArray(src.thread)) {
    src.thread.slice(-16).forEach(function (line) {
      if (line && line.text) addTalk(job, line.from || "drop", line.text, line.kind || "note");
    });
  }
  if (src.previewReady) {
    job.custom = Object.assign({}, job.custom || {}, { previewReady: true, source: src.source || "preview" });
  }
  if (src.outcome || src.wanted) {
    job.custom = Object.assign({}, job.custom || {}, { outcome: src.outcome || src.wanted });
  }
  if (src.timing || src.due) job.timing = String(src.timing || src.due).slice(0, 80);
  if (Array.isArray(src.files) && src.files.length) {
    job.files = src.files.slice(0, 8).map(function (f) {
      if (!f || !f.url) return null;
      return {
        id: String(f.id || "").slice(0, 40),
        name: String(f.name || "").slice(0, 80),
        type: String(f.type || "").slice(0, 80),
        kind: String(f.kind || "").slice(0, 16),
        bytes: Number(f.bytes) || 0,
        url: String(f.url).slice(0, 400)
      };
    }).filter(Boolean);
  }
  return job;
}
function addTalk(job, from, text, kind) {
  if (!job || !text) return job;
  if (!Array.isArray(job.thread)) job.thread = [];
  job.thread.push({ at: new Date().toISOString(), from: from || "desk", text: String(text).slice(0, 500), kind: kind || "note" });
  job.thread = job.thread.slice(-40);
  return job;
}
module.exports = { pickFields, mergeFields, PACKS, KINDS, RISKS, DROP_WHO, slugField, defaultFields, ensureFields, addTalk, assignIfKnown, makeCapturedJob, publicField, parseFieldList, addShopField, applyFieldList, ensureCreations, publicCreation, addCreation, customFromText, implementFromText, applyImplement, firstWorkLine };
