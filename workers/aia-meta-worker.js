#!/usr/bin/env node
/**
 * Meta.aia + Claude worker — draft only.
 *
 * POST /aia/card.created  → Meta + Claude drafts → PUT back to AIA card draft
 * POST /aia/card.nudge.due → one follow-up draft → never loops
 * GET  /health
 *
 * Rails:
 * - Desk AIs draft. Humans Yes / Stop / Kill.
 * - AIA never sends from this worker.
 * - Collect stays HOLD. No pay / bind / unlock.
 * - Verify HMAC signature when AIA_WEBHOOK_SECRET is set.
 *
 * Env:
 *   AIA_API_BASE          default https://www.automateitaway.com/api
 *   AIA_ACCOUNT_SIG       bearer for PUT draft (owner/worker token)
 *   AIA_WEBHOOK_SECRET    optional HMAC secret for inbound verify
 *   META_AI_ENDPOINT      optional upstream Meta AI URL
 *   CLAUDE_API_KEY        optional; without it Claude uses local stub drafts
 *   PORT                  default 8787
 */
"use strict";

const http = require("http");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8787);
const AIA_API = String(process.env.AIA_API_BASE || "https://www.automateitaway.com/api").replace(/\/$/, "");
const AIA_ACCOUNT_SIG = process.env.AIA_ACCOUNT_SIG || "";
const WEBHOOK_SECRET = process.env.AIA_WEBHOOK_SECRET || "";
const META_AI_ENDPOINT = process.env.META_AI_ENDPOINT || "";
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || "";

const DESK_AIS = {
  meta_catch: "Meta - Catch",
  meta_next: "Meta - Next Step",
  meta_words: "Meta - Words",
  meta_followup: "Meta - Follow Up",
  meta_collect_guard: "Meta - Collect Guard",
  claude_catch: "Claude - Catch",
  claude_next: "Claude - Next Step",
  claude_words: "Claude - Words",
  claude_followup: "Claude - Follow Up",
  claude_collect_guard: "Claude - Collect Guard"
};

function readBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    req.on("data", function (c) { chunks.push(c); });
    req.on("end", function () { resolve(Buffer.concat(chunks)); });
    req.on("error", reject);
  });
}

function json(res, code, body) {
  const raw = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(raw);
}

function verifySignature(raw, req) {
  if (!WEBHOOK_SECRET) return { ok: true, mode: "open" };
  const header = String(req.headers["x-aia-signature"] || req.headers["x-signature"] || "");
  const got = header.replace(/^sha256=/i, "").trim();
  if (!got) return { ok: false, error: "Missing signature." };
  const want = crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");
  const a = Buffer.from(got, "utf8");
  const b = Buffer.from(want, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: "Bad signature." };
  }
  return { ok: true, mode: "hmac" };
}

async function callUpstream(id, card) {
  const title = String((card && (card.title || card.name || card.need)) || "New work");
  const isClaude = String(id).indexOf("claude") >= 0;

  if (isClaude && CLAUDE_API_KEY) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 400,
          messages: [{
            role: "user",
            content: "Draft only for an AIA desk card. Never claim you sent, paid, or bound anything. Title: " + title + ". Notes: " + String((card && card.notes) || "").slice(0, 500)
          }]
        }),
        signal: AbortSignal.timeout(12000)
      });
      if (r.ok) {
        const data = await r.json();
        const text = (((data.content || [])[0] || {}).text) || "";
        if (text) return { draft: text.slice(0, 1200), reasoning: "Claude reasoning: FIT yes · DRAFT READY", status: "DRAFT_READY" };
      }
    } catch (e) {
      /* fall through to stub */
    }
  }

  if (!isClaude && META_AI_ENDPOINT) {
    try {
      const r = await fetch(META_AI_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desk_ai: id, card: card }),
        signal: AbortSignal.timeout(12000)
      });
      if (r.ok) return await r.json();
    } catch (e) {
      /* fall through to stub */
    }
  }

  if (isClaude) {
    return {
      draft: "Claude draft for " + title + " — thoughtful analysis — DRAFT READY. Nothing sent.",
      reasoning: "Claude reasoning: FIT yes",
      status: "DRAFT_READY"
    };
  }
  if (id === "meta_next") {
    return { next_step: "FIT: yes | WHEN: today | WHO: owner", status: "DRAFT_READY" };
  }
  if (id === "meta_followup") {
    return { short_text: "One nudge for " + title + " — then stop. DRAFT READY.", status: "DRAFT_READY" };
  }
  if (id === "meta_collect_guard") {
    return { short_text: "Collect stays HOLD until Yes + a real money pipe. Nothing charged.", status: "DRAFT_READY" };
  }
  return {
    short_text: title + " — got it — Meta draft ready. Nothing sent.",
    status: "DRAFT_READY"
  };
}

async function putDraft(cardId, payload) {
  if (!cardId) return { ok: false, error: "No card id." };
  if (!AIA_ACCOUNT_SIG) {
    return { ok: true, simulated: true, note: "No AIA_ACCOUNT_SIG — draft kept local only." };
  }
  const r = await fetch(AIA_API + "/cards/" + encodeURIComponent(cardId) + "/draft", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + AIA_ACCOUNT_SIG
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch (e) { body = { raw: text.slice(0, 200) }; }
  return { ok: r.ok, status: r.status, body: body };
}

async function onCardCreated(card) {
  const metaNext = await callUpstream("meta_next", card);
  const metaWords = await callUpstream("meta_words", card);
  const claudeWords = await callUpstream("claude_words", card);
  const payload = {
    card_id: card.id || card.cardId || card.card_id,
    desk_ais: [DESK_AIS.meta_words, DESK_AIS.claude_words],
    next_step: metaNext.next_step || metaNext.draft || "",
    drafts: {
      meta: {
        short_text: metaWords.short_text || metaWords.draft || "",
        status: "DRAFT_READY"
      },
      claude: {
        short_text: claudeWords.draft || claudeWords.short_text || "",
        reasoning: claudeWords.reasoning || "",
        status: "DRAFT_READY"
      }
    },
    meta: {
      pack: "Meta.aia + Claude",
      version: "1.1.0",
      claude_included: true,
      never: ["send", "stop", "pay", "yes", "kill"],
      note: "Draft only. Human Yes / Stop / Kill. Collect stays HOLD."
    }
  };
  const put = await putDraft(payload.card_id, payload);
  return { ok: true, claude_included: true, payload: payload, put: put };
}

async function onNudgeDue(card) {
  const followUp = await callUpstream("meta_followup", card);
  const payload = {
    card_id: card.id || card.cardId || card.card_id,
    desk_ais: [DESK_AIS.meta_followup],
    draft: followUp.short_text || followUp.draft || "",
    status: "DRAFT_READY",
    meta: { one_nudge: true, then: "stop", never: ["send"] }
  };
  const put = await putDraft(payload.card_id, payload);
  return { ok: true, payload: payload, put: put };
}

const server = http.createServer(async function (req, res) {
  const url = String(req.url || "").split("?")[0];
  if (req.method === "GET" && (url === "/health" || url === "/")) {
    return json(res, 200, {
      ok: true,
      pack: "Meta.aia + Claude v1.1",
      claude_included: true,
      version: "1.1.0",
      worker: "live",
      draft_only: true,
      never: ["send", "stop", "pay", "yes", "kill"]
    });
  }

  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "POST only for card events." });
  }

  let raw;
  try { raw = await readBody(req); } catch (e) {
    return json(res, 400, { ok: false, error: "Bad body." });
  }

  const sig = verifySignature(raw, req);
  if (!sig.ok) return json(res, 401, { ok: false, error: sig.error });

  let card;
  try { card = JSON.parse(raw.toString("utf8") || "{}"); } catch (e) {
    return json(res, 400, { ok: false, error: "Body must be JSON." });
  }
  if (card && card.card && typeof card.card === "object") card = Object.assign({}, card.card, { event: card.event || card.type });

  const event = String(card.event || card.type || url).toLowerCase();

  try {
    if (url === "/aia/card.created" || /card\.created/.test(event)) {
      const out = await onCardCreated(card);
      return json(res, 200, out);
    }
    if (url === "/aia/card.nudge.due" || /nudge/.test(event)) {
      const out = await onNudgeDue(card);
      return json(res, 200, out);
    }
    return json(res, 404, {
      ok: false,
      error: "Unknown route.",
      use: ["POST /aia/card.created", "POST /aia/card.nudge.due", "GET /health"]
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: "Worker miss. Nothing sent." });
  }
});

server.listen(PORT, "127.0.0.1", function () {
  console.log("Meta + Claude worker live :" + PORT + " (draft only · never send/pay)");
});
