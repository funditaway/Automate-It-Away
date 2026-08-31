function grokKey() {
  return process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.AIA_GROK_KEY || "";
}

function grokOn() {
  return !!grokKey();
}

function grokModel() {
  return process.env.AIA_GROK_MODEL || "grok-4-fast-non-reasoning";
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

function applyGrok(job, parsed) {
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
  job.promptVersion = "grok-" + grokModel();
  job.grokAt = new Date().toISOString();
  return job;
}

async function grokRecommend(job, shop) {
  if (!job) return { ok: false, skipped: true, reason: "no-job" };
  if (!grokOn()) return { ok: false, skipped: true, reason: "no-key" };
  const body = {
    model: grokModel(),
    temperature: 0.2,
    max_tokens: 360,
    messages: [
      {
        role: "system",
        content: "You draft for Automate It Away. Return JSON only: {\"draft\":\"...\",\"next\":\"...\",\"recs\":[{\"kind\":\"next|ask|hold|draft\",\"text\":\"...\"}],\"fields\":{\"title\":\"\",\"contactName\":\"\",\"phone\":\"\",\"email\":\"\",\"amount\":null,\"timing\":\"\",\"notes\":\"\",\"custom\":{}}}. Three recs max. Fill fields only from facts in the job. Leave unknown keys off. Never invent money. Short local English. Never send money, never email a customer, never Stop a job. Human taps Yes or No."
      },
      {
        role: "user",
        content: JSON.stringify(jobBrief(job, shop))
      }
    ]
  };
  try {
    const ac = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined;
    const r = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + grokKey()
      },
      body: JSON.stringify(body),
      signal: ac
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, skipped: false, reason: "http-" + r.status, error: clip(data.error && data.error.message, 120) };
    }
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    const parsed = parseGrok(text);
    if (!parsed) return { ok: false, skipped: false, reason: "bad-json" };
    applyGrok(job, parsed);
    return { ok: true, model: grokModel(), recs: job.recs };
  } catch (e) {
    return { ok: false, skipped: false, reason: "net", error: clip(e && e.message, 80) };
  }
}

module.exports = { grokOn, grokModel, grokRecommend, applyGrok, jobBrief };
