const { mem } = require("./_lib");
const crypto = require("crypto");

const AI_PROVIDERS = {
  grok: { vendor: "xAI", model: "grok-4-fast-non-reasoning" },
  openai: { vendor: "OpenAI", model: "gpt-4o-mini" },
  anthropic: { vendor: "Anthropic", model: "claude-sonnet-4-20250514" }
};
function connectSecret() {
  const s = process.env.AIA_CONNECT_SECRET || process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN || process.env.XAI_API_KEY || "aia-draft-pilot";
  return crypto.createHash("sha256").update(String(s)).digest();
}
function unwrapSecret(packed) {
  try {
    const buf = Buffer.from(String(packed || ""), "base64");
    if (buf.length < 29) return "";
    const d = crypto.createDecipheriv("aes-256-gcm", connectSecret(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
  } catch (e) {
    return "";
  }
}
function aiOf(workspace) {
  const ws = String(workspace || "");
  return (mem.connections || []).filter((c) => c && c.workspace === ws && c.lane === "draft" && c.keyPacked);
}

function grokKey() {
  return process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.AIA_GROK_KEY || "";
}

function grokOn() {
  return !!grokKey();
}

function grokModel() {
  return process.env.AIA_GROK_MODEL || "grok-4-fast-non-reasoning";
}

function pickDrafter(workspace) {
  const rows = aiOf(workspace);
  const row = rows[0];
  if (row) {
    const key = unwrapSecret(row.keyPacked);
    const spec = AI_PROVIDERS[row.provider] || {};
    if (key) {
      return {
        provider: row.provider,
        vendor: row.vendor || spec.vendor,
        model: row.model || spec.model,
        key,
        source: "desk"
      };
    }
  }
  if (grokKey()) {
    return { provider: "grok", vendor: "xAI", model: grokModel(), key: grokKey(), source: "included" };
  }
  return null;
}

function clip(s, n) {
  return String(s == null ? "" : s).trim().slice(0, n || 240);
}

function jobBrief(job, shop) {
  return {
    title: clip(job && job.title, 160),
    notes: clip(job && job.notes, 240),
    tell: clip(job && job.tell, 240),
    pack: job && job.pack,
    kind: job && job.kind,
    from: job && job.from,
    amount: job && (job.amount || job.ask || null),
    risk: job && job.risk,
    status: job && job.status,
    step: job && job.step,
    assignee: job && job.assignee,
    missingWhy: clip(job && job.why, 200),
    desk: shop && (shop.biz || shop.name || shop.slug),
    model: shop && shop.model,
    rules: ((shop && shop.rules) || []).slice(0, 8).map((r) => clip(r && r.text, 120)).filter(Boolean)
  };
}

function parseGrok(text) {
  const raw = String(text || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

function applyGrok(job, parsed, drafter) {
  if (!job || !parsed || typeof parsed !== "object") return job;
  const draft = clip(parsed.draft, 400);
  if (draft) job.draft = draft;
  const next = clip(parsed.next, 160);
  if (next) job.next = next;
  const fields = parsed.fields && typeof parsed.fields === "object" ? parsed.fields : null;
  if (fields) {
    if (!job.title || job.title === "Untitled") {
      if (fields.title) job.title = clip(fields.title, 160);
    }
    ["contactName", "phone", "email", "timing", "condition", "notes"].forEach(function (k) {
      if (!job[k] && fields[k]) job[k] = clip(fields[k], k === "notes" ? 400 : 80);
    });
    if ((job.amount == null || job.amount === "") && fields.amount != null) {
      const n = Number(fields.amount);
      if (Number.isFinite(n) && n >= 0) job.amount = n;
    }
    if (fields.custom && typeof fields.custom === "object") {
      job.custom = Object.assign({}, job.custom || {}, fields.custom);
    }
    job.custom = Object.assign({}, job.custom || {}, { grokFields: true });
  }
  const incoming = Array.isArray(parsed.recs) ? parsed.recs : [];
  const extra = incoming.map((r) => {
    if (!r) return null;
    if (typeof r === "string") return { kind: "grok", text: clip(r, 180) };
    const text = clip(r.text || r.note, 180);
    if (!text) return null;
    return { kind: clip(r.kind || "grok", 16), text };
  }).filter(Boolean);
  const have = {};
  job.recs = (job.recs || []).concat(extra).filter((r) => {
    const t = r && r.text;
    if (!t || have[t]) return false;
    have[t] = true;
    return true;
  }).slice(0, 8);
  job.promptVersion = (drafter && drafter.provider ? drafter.provider : "grok") + "-" + ((drafter && drafter.model) || grokModel());
  job.grokAt = new Date().toISOString();
  job.draftFrom = drafter && drafter.provider;
  return job;
}

const SYSTEM = "You draft for Automate It Away. Return JSON only: {\"draft\":\"...\",\"next\":\"...\",\"recs\":[{\"kind\":\"next|ask|hold|draft\",\"text\":\"...\"}],\"fields\":{\"title\":\"\",\"contactName\":\"\",\"phone\":\"\",\"email\":\"\",\"amount\":null,\"timing\":\"\",\"notes\":\"\",\"custom\":{}}}. Three recs max. Fill fields only from facts in the job. Leave unknown keys off. Never invent money. Short local English. Never send money, never email a customer, never Stop a job. Human taps Yes or No.";

async function callOpenAI(drafter, job, shop) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + drafter.key },
    body: JSON.stringify({
      model: drafter.model || "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 360,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(jobBrief(job, shop)) }
      ]
    }),
    signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, reason: "http-" + r.status, error: clip(data.error && data.error.message, 120) };
  return { ok: true, text: data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content };
}

async function callAnthropic(drafter, job, shop) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": drafter.key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: drafter.model || "claude-sonnet-4-20250514",
      max_tokens: 360,
      temperature: 0.2,
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(jobBrief(job, shop)) }]
    }),
    signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, reason: "http-" + r.status, error: clip(data.error && data.error.message, 120) };
  const block = (data.content || []).find((b) => b && b.type === "text");
  return { ok: true, text: block && block.text };
}

async function callGrok(drafter, job, shop) {
  const r = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + drafter.key },
    body: JSON.stringify({
      model: drafter.model || grokModel(),
      temperature: 0.2,
      max_tokens: 360,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(jobBrief(job, shop)) }
      ]
    }),
    signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, reason: "http-" + r.status, error: clip(data.error && data.error.message, 120) };
  return { ok: true, text: data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content };
}

async function grokRecommend(job, shop, workspace) {
  if (!job) return { ok: false, skipped: true, reason: "no-job" };
  const ws = workspace || (shop && (shop.slug || shop.workspace || shop.id)) || job.workspace;
  const drafter = pickDrafter(ws);
  if (!drafter) return { ok: false, skipped: true, reason: "no-key" };
  try {
    let out;
    if (drafter.provider === "openai") out = await callOpenAI(drafter, job, shop);
    else if (drafter.provider === "anthropic") out = await callAnthropic(drafter, job, shop);
    else out = await callGrok(drafter, job, shop);
    if (!out || !out.ok) return { ok: false, skipped: false, reason: (out && out.reason) || "http", error: out && out.error, provider: drafter.provider };
    const parsed = parseGrok(out.text);
    if (!parsed) return { ok: false, skipped: false, reason: "bad-json", provider: drafter.provider };
    applyGrok(job, parsed, drafter);
    return { ok: true, model: drafter.model, provider: drafter.provider, source: drafter.source, recs: job.recs };
  } catch (e) {
    return { ok: false, skipped: false, reason: "net", error: clip(e && e.message, 80), provider: drafter.provider };
  }
}

module.exports = { grokOn, grokModel, grokRecommend, applyGrok, jobBrief, pickDrafter };
