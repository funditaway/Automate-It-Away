// Lead Catcher — Official AIA Pack API. One function, action-based like the rest of /api.
// Reuses AIA sign-in (session / PIN via personOf). Reads the shared AIA store only to know who you are.
// Never writes the shared AIA store. Lead Catcher data lives in its own isolated store (api/_lc-store.js).
// Nothing is sent and nothing is charged: replies go to a MOCK outbox, Collect stays off.
const { cors, ready, personOf, isOwner, readBody } = require("./_lib");
const store = require("./_lc-store");
const lc = require("./_lc-engine");
const { HttpError } = require("./_lc-util");
const ais = require("./_ais");

// AIA seat → Lead Catcher seat when the owner has not set one. Desk AIs never get a seat.
function defaultRole(p) {
  if (!p) return "none";
  if (isOwner(p)) return "desk_owner";
  if (p.status === "pending" || p.status === "denied") return "none";
  if (p.kind === "member") return "technician";
  if (p.kind === "staff" || p.kind === "helper") return "responder";
  if (!p.kind && p.role === "employee") return "responder";
  return "none";
}

async function actorOf(req) {
  await ready();
  const { workspace: ws, person } = personOf(req);
  if (!ws || !person) return null;
  const D = store.desk(ws.slug);
  // A desk AI never holds a Lead Catcher seat, even if a seat was stored for it (AIA rule: AIs draft only).
  const roleOf = (p) => (ais.actorIsDeskAi(p) ? "none" : (D.roles && D.roles[p.id]) || defaultRole(p));
  const people = (ws.people || []).filter(Boolean).map((p) => ({ id: p.id, name: p.name || p.id, deskAi: ais.actorIsDeskAi(p), lcRole: roleOf(p) }));
  return {
    id: person.id, name: person.name || person.id, desk: ws.slug, deskName: ws.name || ws.biz || ws.slug,
    isOwner: isOwner(person), role: roleOf(person), people,
    accountKey: ws.accountId || person.accountId || ("desk:" + ws.slug)
  };
}

async function handler(req, res) {
  cors(res);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-AIA-Pack", "lead-catcher; outbound=MOCK; collect=off");
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    const q = req.query || {};
    const body = req.method === "POST" ? await readBody(req).catch(() => { throw new HttpError(400, "bad_json", "Body must be JSON."); }) : {};
    const action = String(body.action || q.action || "");

    if (action === "intake") {
      if (req.method !== "POST") throw new HttpError(405, "use_post", "Use POST.");
      if (store.liveBlocked()) throw new HttpError(503, "not_on_live_site", "Lead Catcher is not turned on for the live site yet.");
      const D = lc.deskByIntakeKey(req.headers["x-intake-key"]);
      if (!D) throw new HttpError(401, "bad_intake_key", "Unknown form key.");
      const ch = String(body.channel || q.channel || "web-form");
      const adapter = { "web-form": "web_form", "mock-email": "mock_email", "mock-sms": "mock_sms", "mock-missed-call": "mock_missed_call" }[ch];
      if (!adapter) throw new HttpError(400, "bad_channel", "Unknown channel.");
      const r = lc.intake(D, adapter, body.request || body, null);
      return res.status(r.duplicate ? 200 : 201).json({ ok: true, duplicate: r.duplicate, receipt: r.card.id, mock_channel: adapter.indexOf("mock_") === 0 });
    }

    const actor = await actorOf(req);
    if (!actor) throw new HttpError(401, "unauthenticated", "Open your desk first.");
    const id = String(body.cardId || q.cardId || "");
    const routes = {
      "pack-status": () => lc.packStatus(actor),
      "get-pack": () => lc.getPack(actor, body),
      "turn-on": () => lc.turnOn(actor, body),
      "turn-off": () => lc.turnOff(actor, body),
      "set-role": () => lc.setRole(actor, body),
      me: () => ({ user: { id: actor.id, name: actor.name, role: actor.role }, desk: actor.desk, deskName: actor.deskName, people: actor.people.filter((p) => !p.deskAi), can: Object.keys(require("./_lc-policy").ACTIONS).filter((a) => require("./_lc-policy").can(actor.role, a)) }),
      list: () => lc.list(actor, q),
      card: () => lc.detail(actor, id),
      create: () => lc.intakeManual(actor, body),
      assign: () => lc.assign(actor, id, body),
      fields: () => lc.updateFields(actor, id, body),
      "verify-contact": () => lc.verifyContact(actor, id, body),
      extract: () => lc.runExtraction(actor, id),
      status: () => lc.setStatus(actor, id, body),
      "draft-generate": () => lc.generateDraft(actor, id),
      draft: () => lc.saveDraft(actor, id, body),
      "draft-reject": () => lc.rejectDraft(actor, id, body),
      yes: () => lc.approve(actor, id, body),
      stop: () => lc.revoke(actor, id, body),
      run: () => lc.execute(actor, id, body),
      outcome: () => lc.recordOutcome(actor, id, body),
      numbers: () => lc.metrics(actor, q),
      attempts: () => lc.attempts(actor),
      "history-check": () => lc.historyCheck(actor)
    };
    const reads = ["pack-status", "me", "list", "card", "numbers", "attempts", "history-check"];
    if (!routes[action]) throw new HttpError(400, "unknown_action", "Unknown Lead Catcher action.");
    if (reads.indexOf(action) < 0 && req.method !== "POST") throw new HttpError(405, "use_post", "Use POST.");
    const out = await routes[action]();
    return res.status(200).json(out);
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json(Object.assign({ ok: false, error: e.code, message: e.message }, e.extra || {}));
    console.error("lead-catcher", e && e.message);
    return res.status(500).json({ ok: false, error: "server_error", message: "Something went wrong. Nothing was sent." });
  }
}

module.exports = handler;
