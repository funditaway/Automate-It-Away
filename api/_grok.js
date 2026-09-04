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
    rules: ((shop && shop.rules) || []).slice(0, 8).map((r) => clip(r && r.text, 120)).filter(Boolean),
    ais: ((shop && shop.ais) || []).slice(0, 3).map(function (a) {
      if (!a) return null;
      return { name: clip(a.name, 40), role: clip(a.role || a.crew, 16), does: clip(a.does, 120), steps: a.steps || a.allow || [] };
    }).filter(Boolean)
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
  const cites = normalizeCites([].concat(parsed.citations || [], job.citations || []));
  if (cites.length) job.citations = cites;
  return job;
}

function normalizeCites(rows) {
  const have = {};
  return (rows || []).map(function (c) {
    if (!c) return null;
    const url = String(typeof c === "string" ? c : (c.url || c.href || "")).trim();
    if (!/^https?:\/\//i.test(url) || have[url]) return null;
    have[url] = true;
    const title = String((c && (c.title || c.text)) || url).trim().slice(0, 80);
    return { url: url.slice(0, 300), title: title || url };
  }).filter(Boolean).slice(0, 6);
}

const SYSTEM = "You draft for Automate It Away. Return JSON only: {\"draft\":\"...\",\"next\":\"...\",\"recs\":[{\"kind\":\"next|ask|hold|draft\",\"text\":\"...\"}],\"citations\":[{\"title\":\"\",\"url\":\"https://...\"}],\"fields\":{\"title\":\"\",\"contactName\":\"\",\"phone\":\"\",\"email\":\"\",\"amount\":null,\"timing\":\"\",\"notes\":\"\",\"custom\":{}}}. Three recs max. Fill fields only from facts in the job. Leave unknown keys off. Citations only for real http(s) URLs you used — never invent links or money. Short local English. If the desk has a named AI, draft as that AI on this desk only. Never send money, never email a customer, never Stop a job, never Yes yourself. Human taps Yes or No.";

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

async function callGrok(drafter, job, shop, opts) {
  const payload = {
    model: drafter.model || grokModel(),
    temperature: 0.2,
    max_tokens: 360,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: JSON.stringify(jobBrief(job, shop)) }
    ]
  };
  if (!opts || opts.search !== false) payload.search_parameters = { mode: "auto" };
  const r = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + drafter.key },
    body: JSON.stringify(payload),
    signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = clip(data.error && data.error.message, 120);
    if ((!opts || opts.search !== false) && (r.status === 400 || r.status === 422 || /search/i.test(err || ""))) {
      return callGrok(drafter, job, shop, { search: false });
    }
    return { ok: false, reason: "http-" + r.status, error: err };
  }
  const cites = normalizeCites([].concat(data.citations || [], data.choices && data.choices[0] && data.choices[0].citations || []));
  return { ok: true, text: data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content, citations: cites };
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
    const parsed = parseGrok(out.text) || {};
    if (out.citations && out.citations.length) parsed.citations = [].concat(parsed.citations || [], out.citations);
    if (!parsed.draft && !parsed.next && !parsed.recs && !out.text) return { ok: false, skipped: false, reason: "bad-json", provider: drafter.provider };
    if (!parsed.draft && out.text && !parseGrok(out.text)) parsed.draft = clip(out.text, 400);
    applyGrok(job, parsed, drafter);
    return { ok: true, model: drafter.model, provider: drafter.provider, source: drafter.source, recs: job.recs, citations: job.citations || [] };
  } catch (e) {
    return { ok: false, skipped: false, reason: "net", error: clip(e && e.message, 80), provider: drafter.provider };
  }
}

const STUDIO_SYSTEM = "You draft thin JSON packs and named desk AIs for Automate It Away Creators Studio. Return JSON only: {\"name\":\"\",\"aia\":\"springfield-shop.aia\",\"does\":\"\",\"niche\":\"\",\"fields\":\"who:text,when:text\",\"kinds\":\"task,idea\",\"rule\":\"\",\"ask\":0,\"ais\":[{\"name\":\"\",\"aia\":\"james.aia\",\"role\":\"Doer\",\"does\":\"\",\"prompt\":\"\",\"steps\":\"qualify,do,follow\"}],\"bots\":[{\"name\":\"\",\"crew\":\"Doer\",\"does\":\"\",\"prompt\":\"\"}],\"dropHint\":\"\",\"queue\":{\"badge\":\"\",\"empty\":\"\",\"chips\":\"task,idea\"}}. AIA Internet uses the .aia TLD (james.aia, springfield-shop.aia). Never invent on-chain ownership. Never invent money or $250. Never Send, Stop, or pay. Never auto-mail. Desk AIs are bound to one desk. They draft only. Human taps Yes / Stop / Kill. Collect stays HOLD. Draft only. Human taps Yes to save or install. Short local English. Worker-first: AI drafts, the owner decides. Open packs: thin JSON a world desk can install. Secure-by-design: no silent Collect.";

async function studioDraft(brief, workspace, opts) {
  const drafter = pickDrafter(workspace);
  if (!drafter) return { ok: false, skipped: true, reason: "no-key" };
  const text = String(brief || "").trim().slice(0, 800);
  if (!text) return { ok: false, skipped: true, reason: "no-brief" };
  const kind = String((opts && opts.kind) || "pack").toLowerCase();
  try {
    const payload = {
      model: drafter.model || grokModel(),
      temperature: 0.2,
      max_tokens: 500,
      messages: [
        { role: "system", content: STUDIO_SYSTEM },
        { role: "user", content: JSON.stringify({ brief: text, kind: kind, never: ["send", "stop", "pay", "bind", "mail"], collect: "hold", aisBound: "desk", tld: ".aia", internet: "AIA Internet", chain: false }) }
      ]
    };
    const url = drafter.provider === "openai"
      ? "https://api.openai.com/v1/chat/completions"
      : drafter.provider === "anthropic"
        ? "https://api.anthropic.com/v1/messages"
        : "https://api.x.ai/v1/chat/completions";
    const headers = { "Content-Type": "application/json" };
    let body = payload;
    if (drafter.provider === "anthropic") {
      headers["x-api-key"] = drafter.key;
      headers["anthropic-version"] = "2023-06-01";
      body = { model: drafter.model, max_tokens: 500, temperature: 0.2, system: STUDIO_SYSTEM, messages: [{ role: "user", content: payload.messages[1].content }] };
    } else {
      headers.Authorization = "Bearer " + drafter.key;
    }
    const r = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(14000) : undefined
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, skipped: false, reason: "http-" + r.status, error: clip(data.error && data.error.message, 120), provider: drafter.provider };
    let raw = "";
    if (drafter.provider === "anthropic") {
      const block = (data.content || []).find((b) => b && b.type === "text");
      raw = block && block.text;
    } else {
      raw = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    }
    const parsed = parseGrok(raw);
    if (!parsed) return { ok: false, skipped: false, reason: "bad-json", provider: drafter.provider, text: clip(raw, 400) };
    if (parsed.ask != null) {
      const n = Number(parsed.ask);
      parsed.ask = Number.isFinite(n) && n >= 0 ? n : 0;
    }
    if (/\$250|over \$250/i.test(JSON.stringify(parsed))) {
      parsed.ask = 0;
      if (parsed.rule) parsed.rule = String(parsed.rule).replace(/\$250/g, "");
    }
    parsed.never = ["send", "stop", "pay"];
    parsed.collect = "hold";
    if (Array.isArray(parsed.bots) && !parsed.ais) parsed.ais = parsed.bots;
    if (Array.isArray(parsed.ais) && !parsed.bots) parsed.bots = parsed.ais;
    return { ok: true, pack: parsed, provider: drafter.provider, model: drafter.model, source: drafter.source || "included" };
  } catch (e) {
    return { ok: false, skipped: false, reason: "net", error: clip(e && e.message, 80) };
  }
}

module.exports = { grokOn, grokModel, grokRecommend, applyGrok, jobBrief, pickDrafter, normalizeCites, studioDraft };
