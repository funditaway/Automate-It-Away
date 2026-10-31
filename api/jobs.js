const { dropCannedSeeds } = require("./_drop-seed");
const { cors, mem, log, save, ready, readyRead, slugify, queueSession, PROVIDERS, readBody, deskSeat, isOwner, ensureRules, defaultRules, ensureNouns, defaultNouns, widgetCount, moneyWaitOf, moneyNeedsOwner, ensurePeople, publicPerson, ruleWantsOwner, ruleWantsStop, ruleWhy, pipeWroteBack, hookUrl } = require("./_lib");
const { pickFields, mergeFields, slugField, ensureFields, addTalk, makeCapturedJob, makeFanOutJobs, holdCapturedJob, applyImplement } = require("./_fields");
const { qualifyJob, recommend, icsOf, runWorkspace, markFlow, applyRules, thenAfterYes } = require("./_engine");
const { grokRecommend, normalizeCites } = require("./_grok");
const { needsOf, isPriorityJob, missingOf } = require("./_history");
const clock = require("./_clock");
const ais = require("./_ais");
const { applyHandoff, applyDeskAiDraft, stampDeskAi, agentDraft } = require("./_handoff");

function namedWorkspace(req) {
  const raw = req.headers["x-workspace"] || (req.query && req.query.workspace);
  if (raw == null || !String(raw).trim()) return "";
  return String(raw).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}
function pipesFor(workspace) {
  return mem.connections.filter((c) => c.workspace === workspace);
}
async function fireWebhook(hook, payload) {
  if (!hook) return { skipped: true };
  const r = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return { status: r.status, ok: r.ok };
}
function actorName(person, body) {
  return (person && person.name) || (body && body.whoTapped) || "desk";
}
// The seat that tapped: jobs credit a seat by id (the person sheet reads these), never by name.
function actorId(person) {
  return (person && person.id) ? String(person.id) : "";
}
// Same seat check as GET /api/upload: deskSeat is personOf. It reads X-Pin, X-Session, and the aia_session cookie.
// A stranger and a missing desk get the same reply, so the desk name does not confirm the desk.
// Upload (#324) still answers 401 for a real desk with no code and 404 for a missing desk.
function refuseJobRead(res, found) {
  if (found && found.pending) {
    return res.status(403).json({ ok: false, error: "That seat is waiting on the owner." });
  }
  return res.status(404).json({ ok: false, error: "No desk with that name." });
}
function actorBlocked(person) {
  return ais.actorIsDeskAi(person);
}
function markDone(job, person, body, how, shop) {
  const note = String((body && (body.text || body.notes)) || "Done off the desk.").trim();
  job.status = "shipped";
  job.doneHow = how || (body && body.how) || "off-desk";
  job.doneAt = new Date().toISOString();
  job.doneBy = actorName(person, body || {});
  job.doneById = actorId(person);
  job.awaiting = null;
  job.offDesk = false;
  job.followed = true;
  job.followNote = note;
  job.step = "Follow";
  job.rail = job.doneHow === "hand" ? "carried" : "done";
  job.whoTapped = actorName(person, body || {});
  job.whoTappedId = actorId(person);
  job.dispatch = job.dispatch || { demo: false, done: true, how: job.doneHow };
  if (shop) applyRules(job, shop, "status");
  return note;
}
// Same card the single-desk GET returns for this seat: staff seats do not see Stop / Kill.
function presentJob(j, person) {
  const staff = person && person.role === "employee";
  const needs = needsOf(j, { staff });
  const tick = clock.clockOf(j);
  return Object.assign({}, j, { needs: needs.actions, needLine: needs.line, missing: needs.missing, decide: needs.decide, priority: isPriorityJob(j), clock: tick, late: tick.late, expired: tick.expired });
}
function tagQueueJob(card, slug) {
  return Object.assign({}, card, { slug: slug, desk: slug });
}
// The account's own password session only. A helper seat, a desk-code session,
// and a stranger get no cards from here. This does not save.
function accountForSetupRead(req, shop) {
  const session = queueSession(req);
  if (!session || !session.accountId) return null;
  if (!shop || !shop.slug) return null;
  return (mem.accounts || []).find((a) => a && a.id === session.accountId) || null;
}
function listSetupCards(acc, deskSlug, tag) {
  if (!acc || !deskSlug) return [];
  const cards = Array.isArray(acc.setupCards) ? acc.setupCards : [];
  const out = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card || card.deskId !== deskSlug) continue;
    if (card.status !== "open" && card.status !== "stopped" && card.status !== "done") continue;
    const pub = require("./_account-connect").publicCard(card);
    pub.href = "/account#setup-" + card.id;
    if (tag) pub.slug = deskSlug;
    out.push(pub);
  }
  return out;
}
async function setupCardsPayload(req, shop, tag) {
  const acc = accountForSetupRead(req, shop);
  return listSetupCards(acc, shop && shop.slug, tag);
}
// Opt-in only. Absent, or any other value, leaves the single-desk GET alone.
function queueReadWanted(req) {
  const q = (req && req.query) || {};
  const queue = String(q.queue == null ? "" : q.queue).trim().toLowerCase();
  if (queue === "1" || queue === "all") return { mode: "all" };
  const raw = String(q.desks == null ? "" : q.desks).trim().toLowerCase();
  if (!raw) return null;
  if (raw === "all") return { mode: "all" };
  const slugs = [];
  raw.split(",").forEach((part) => {
    const slug = slugify(part);
    if (slug && slugs.indexOf(slug) < 0) slugs.push(slug);
  });
  if (!slugs.length) return null;
  return { mode: "list", slugs: slugs };
}
function queueReq(req, slug) {
  const headers = Object.assign({}, (req && req.headers) || {});
  delete headers["x-pin"];
  headers["x-workspace"] = slug;
  const query = Object.assign({}, (req && req.query) || {});
  query.workspace = slug;
  return { headers: headers, query: query, method: "GET" };
}
// Open seat on this account. personOf already applied the cross-desk rule; this rejects a
// closed seat and a desk the account does not sit on. The home desk keeps the session's own seat.
function queueSeatOk(found, session) {
  const person = found && found.person;
  const ws = found && found.workspace;
  if (!person || !ws || !session) return false;
  if (person.status === "pending" || person.status === "denied") return false;
  if (person.accountId && person.accountId === session.accountId) return true;
  if (ws.slug === session.workspace && person.id && person.id === session.personId) return true;
  return false;
}
function refuseQueue(res) {
  return res.status(403).json({ ok: false, error: "No desk with that name." });
}
// Read-only. Does not save. PIN and stranger share refuseQueue, before any desk is opened.
async function readAccountQueue(req, res, want) {
  const session = queueSession(req);
  if (!session) return refuseQueue(res);
  const slugs = want.mode === "list" ? want.slugs : (mem.workspaces || []).map((w) => w && w.slug).filter(Boolean);
  const rows = [];
  for (let i = 0; i < slugs.length; i++) {
    const found = deskSeat(queueReq(req, slugs[i]), slugs[i]);
    // personOf falls back to the session's own desk when the name is not a desk.
    // An explicit list must not silently swap in that desk.
    const asked = found && found.workspace && found.workspace.slug === slugs[i];
    if (!asked || !queueSeatOk(found, session)) {
      if (want.mode === "list") return refuseQueue(res);
      continue;
    }
    rows.push(found);
  }
  const jobs = [];
  const setupCards = [];
  for (let i = 0; i < rows.length; i++) {
    const found = rows[i];
    const slug = found.workspace.slug;
    (mem.jobs || []).filter((j) => j && j.workspace === slug).forEach((j) => {
      jobs.push(tagQueueJob(presentJob(j, found.person), slug));
    });
    const part = await setupCardsPayload(req, found.workspace, true);
    for (let j = 0; j < part.length; j++) setupCards.push(part[j]);
  }
  const home = rows.find((f) => f.workspace.slug === session.workspace) || rows[0] || null;
  const acc = (mem.accounts || []).find((a) => a && a.id === session.accountId) || null;
  const built = home ? require("./_account").queueForPerson(home.person, acc, home.workspace.slug) : { accountId: session.accountId || "", name: (acc && (acc.name || acc.ownerName)) || "", desks: [] };
  const open = {};
  rows.forEach((f) => { open[f.workspace.slug] = true; });
  const desks = (built.desks || []).filter((d) => d && open[d.slug] && d.status !== "pending" && d.status !== "denied");
  return res.status(200).json({
    ok: true,
    queue: { accountId: built.accountId || session.accountId || "", name: built.name || "", desks: desks },
    desks: desks,
    jobs: jobs,
    cap: jobs.filter((j) => j.priority),
    setupCards: setupCards
  });
}
function markHand(job, person, body) {
  const note = String((body && (body.text || body.notes || body.reason)) || "Needs a hand.").trim();
  job.status = "exception";
  job.awaiting = null;
  job.offDesk = false;
  job.waitingOn = "owner";
  job.why = note;
  job.next = "Do this by hand. Then tap Done off desk.";
  job.doneHow = null;
  job.whoTapped = actorName(person, body || {});
  job.whoTappedId = actorId(person);
  job.rail = "hand";
  job.step = "Do";
  return note;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  const queueWant = req.method === "GET" ? queueReadWanted(req) : null;
  if (queueWant) {
    await readyRead();
    return readAccountQueue(req, res, queueWant);
  }
  await ready();
  if (dropCannedSeeds(mem)) await save();
  const workspace = namedWorkspace(req);
  if (!workspace) return res.status(400).json({ error: "Open a desk first." });
  const found = deskSeat(req, workspace);
  const shop = found.workspace;
  const person = found.person;

  if (req.method === "GET") {
    if (!shop || !person) return refuseJobRead(res, found);
    if (req.query.audit === "1") return res.status(200).json({ workspace, audit: mem.audit.filter((a) => !a.workspace || a.workspace === workspace).slice(0, 50) });
    if (req.query.money === "1") return res.status(200).json({ workspace, money: mem.money.filter((m) => m.workspace === workspace).slice(0, 50) });
    if (req.query.inbox === "1") return res.status(200).json({ workspace, inbox: mem.inbox.filter((i) => i.workspace === workspace) });
    if (req.query.ics) {
      const job = mem.jobs.find((j) => j.id === req.query.ics && j.workspace === workspace);
      if (!job) return res.status(404).json({ error: "Job not found" });
      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=\"" + job.id + ".ics\"");
      return res.status(200).send(icsOf(job));
    }
    if (shop) { ensureRules(shop); ensureNouns(shop); ensurePeople(shop); }
    const rules = shop ? ensureRules(shop) : defaultRules();
    const rows = mem.jobs.filter((j) => j.workspace === workspace).map((j) => presentJob(j, person));
    const cap = rows.filter((j) => j.priority);
    const setupCards = await setupCardsPayload(req, shop, false);
    const rails = shop ? ais.railsOf(shop) : { ais: [], count: 0, rails: ais.RAILS, never: ais.NEVER.slice() };
    return res.status(200).json({
      workspace,
      desk: shop ? { slug: shop.slug, name: shop.biz || shop.name || shop.slug, does: shop.does || "", instructions: String(shop.instructions || "").trim().slice(0, 400) } : null,
      you: person ? { name: person.name, role: person.role, kind: person.kind || person.role, deskAi: !!person.deskAi } : null,
      fields: ensureFields(shop),
      rules,
      nouns: shop ? ensureNouns(shop) : defaultNouns(),
      people: shop ? require("./_lib").seatsFor(person, shop.people, publicPerson) : [],
      ais: rails.ais,
      aiRails: rails.rails,
      never: rails.never,
      widgetsOn: widgetCount(rules),
      cap,
      jobs: rows,
      setupCards: setupCards
    });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const action = body.action || "capture";
    // A tap with no seat behind it names who tapped only as text. A name two seats on this desk share is
    // refused: never a guessed seat, never a silent nobody. (With a seat, the session's own seat is credited.)
    if (!person && shop && body.whoTapped && require("./_fields").seatNameShared(shop.people, { name: String(body.whoTapped).trim() })) {
      return res.status(409).json({ ok: false, error: "More than one seat has that name. Open your own seat to tap." });
    }
    if (action === "suggest") {
      const job = makeCapturedJob(workspace, shop, body);
      qualifyJob(job, shop);
      const grok = await grokRecommend(job, shop, workspace);
      if (grok && grok.ok) addTalk(job, "grok", job.draft || "Draft on the card.", "rec");
      const cites = normalizeCites([].concat(body.citations || [], job.citations || []));
      if (cites.length) job.citations = cites;
      return res.status(200).json({
        ok: true,
        saved: false,
        grok: grok && grok.ok ? "on" : (grok && grok.reason) || "off",
        draft: job.draft || "",
        next: job.next || "",
        recs: job.recs || [],
        citations: job.citations || [],
        job: { title: job.title, kind: job.kind, notes: job.notes || "" },
        note: grok && grok.ok
          ? "Draft only. Yes puts it on the queue. Stop discards it. AIA does not send."
          : (grok && grok.reason === "no-key"
            ? "A Desk AI can't draft on this phone yet. You can still put the work on the queue."
            : "No draft this time. You can still put the work on the queue.")
      });
    }
    if (action === "capture") {
      if (!shop) return res.status(404).json({ ok: false, error: "No desk with that name. Open one first." });
      // A signed-in seat captures as itself: who tapped is the session's seat, never the name in the body.
      // A stranger's drop (no seat) keeps the name it sent, as before.
      const capBody = person ? Object.assign({}, body, { whoTapped: actorName(person, {}) }) : body;
      const jobs = makeFanOutJobs(workspace, shop, capBody);
      if (person) jobs.forEach((j) => { j.whoTapped = actorName(person, {}); j.whoTappedId = actorId(person); });
      const incomingCites = normalizeCites(body.citations || []);
      let grok = null;
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        qualifyJob(job, shop);
        if (incomingCites.length) job.citations = incomingCites;
        if (Array.isArray(body.recs) && body.recs.length && !job.recs) job.recs = body.recs.slice(0, 8);
        if (jobs.length === 1 && !job.draft) {
          grok = await grokRecommend(job, shop, workspace);
          if (grok && grok.ok) addTalk(job, "grok", job.draft || "Draft on the card.", "rec");
        } else if (job.draft) {
          addTalk(job, "grok", job.draft, "rec");
        }
        applyDeskAiDraft(job, shop, "qualify");
        holdCapturedJob(job);
        const tell = String(job.tell || "").trim();
        if (tell && !(job.thread || []).some((t) => t && t.kind === "tell" && String(t.text || "").trim() === tell)) {
          addTalk(job, job.whoTapped || job.contactName || "drop", tell, "tell");
        }
        if (job.notes && String(job.notes).trim() !== tell) addTalk(job, job.from || "capture", job.notes, "note");
        addTalk(job, "desk", job.why || "In the queue.", "rec");
      }
      const lead = jobs[0];
      for (let i = jobs.length - 1; i >= 0; i--) mem.jobs.unshift(jobs[i]);
      const inboxText = jobs.length > 1
        ? (jobs.length + " cards · " + ((lead.custom && lead.custom.dropHeading) || lead.title))
        : lead.title;
      mem.inbox.unshift({ id: "in_" + Date.now().toString(36), workspace, text: inboxText, from: lead.from, at: Date.now() });
      log("Capture", inboxText, "Waiting", workspace);
      runWorkspace(mem.jobs.filter((j) => j.workspace === workspace), Date.now(), shop);
      await save();
      return res.status(201).json({
        ok: true,
        job: lead,
        jobs: jobs,
        fanOut: jobs.length,
        notify: lead.notify || [],
        crew: lead.crew || null,
        grok: grok && grok.ok ? "on" : (grok && grok.reason) || (lead.draft ? "on" : "off"),
        note: jobs.length > 1
          ? ("On the queue as " + jobs.length + " cards. You still tap Yes or Stop on each. Payments are off for now. Nothing is charged.")
          : undefined
      });
    }
    // Every action below reads or changes a card, so it needs a seat on this desk.
    // A desk name and a card id alone get the same reply as a missing desk, before the card is looked up.
    // Capture above stays open for the public drop.
    // A shared name with no seat already answered 409 above, and only when that name is actually shared.
    // A stranger who names one seat, or names nobody, still gets the missing-desk reply here (reply included).
    if (!shop || !person) return refuseJobRead(res, found);
    const job = mem.jobs.find((j) => j.id === body.id && j.workspace === workspace);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (action === "kill") {
      if (actorBlocked(person)) return res.status(403).json({ ok: false, error: "Desk AIs never Stop. A person taps Kill.", never: ais.NEVER.slice(), job });
      if (shop && !isOwner(person)) return res.status(403).json({ ok: false, error: "Only the owner can Stop a live job.", job });
      if (!body.confirm) return res.status(409).json({ ok: false, error: "Kill needs a second tap from the owner.", job });
      mergeFields(job, body);
      job.status = "killed";
      markFlow(job, "kill");
      job.killReason = body.killReason || job.killReason || "Owner kill";
      job.whoTapped = actorName(person, body);
      job.whoTappedId = actorId(person);
      job.log = (job.log || []).concat(["Killed · " + job.killReason]);
      log("Desk AI", "Killed · " + job.title, "Stopped", workspace);
      await save();
      return res.status(200).json({ ok: true, job });
    }
    if (action === "qualify") {
      mergeFields(job, body);
      qualifyJob(job, shop);
      if (body.why) job.why = body.why;
      const grok = await grokRecommend(job, shop, workspace);
      if (grok && grok.ok) addTalk(job, "grok", job.draft || "Draft on the card.", "rec");
      applyDeskAiDraft(job, shop, "qualify");
      log("Qualify", job.title, "Waiting", workspace);
      await save();
      return res.status(200).json({ ok: true, job, grok: grok && grok.ok ? "on" : (grok && grok.reason) || "off" });
    }
    if (action === "recommend") {
      qualifyJob(job, shop);
      const grok = await grokRecommend(job, shop, workspace);
      if (grok && grok.ok) addTalk(job, "grok", job.draft || "Draft on the card.", "rec");
      else recommend(job, [], shop);
      applyDeskAiDraft(job, shop, "qualify");
      stampDeskAi(job, shop);
      log("Desk", "Grok recs · " + job.title, grok && grok.ok ? "OK" : "Hold", workspace);
      await save();
      return res.status(200).json({ ok: true, job, grok: grok && grok.ok ? "on" : (grok && grok.reason) || "off" });
    }
    if (action === "say") {
      const text = String(body.text || body.notes || "").trim();
      if (!text) return res.status(400).json({ error: "Type the note." });
      addTalk(job, actorName(person, body), text, body.kind || "note");
      job.log = (job.log || []).concat(["Note"]);
      log("Desk", "Note · " + job.title, "OK", workspace);
      await save();
      return res.status(200).json({ ok: true, job });
    }
    if (action === "reply") {
      if (actorBlocked(person)) return res.status(403).json({ ok: false, error: "Desk AIs never reply as Yes. A person types on the card.", never: ais.NEVER.slice(), job });
      if (!person) return res.status(403).json({ ok: false, error: "Open this desk to reply.", job });
      const text = String(body.text || body.notes || body.reply || "").trim();
      if (!text) return res.status(400).json({ error: "Type a reply on the card." });
      addTalk(job, actorName(person, body), text, "reply");
      job.replies = (job.replies || []).concat([{
        from: actorName(person, body),
        text: text,
        at: new Date().toISOString()
      }]).slice(-20);
      applyImplement(job, shop, { implement: text, notes: text });
      if (body.custom && typeof body.custom === "object") mergeFields(job, body);
      const wasWaiting = String(job.waitingOn || "").toLowerCase();
      qualifyJob(job, shop);
      const miss = missingOf(job);
      if ((wasWaiting === "info" || wasWaiting === "helper") && !miss.length) {
        job.waitingOn = "person";
        applyRules(job, shop, "do");
      }
      if (job.status === "shipped" || job.status === "killed") job.status = "waiting";
      job.charged = false;
      job.whoTapped = actorName(person, body);
      job.whoTappedId = actorId(person);
      job.log = (job.log || []).concat(["Reply on the card"]);
      job.next = job.next || "Reply is on the card. Yes / Stop / Kill stay human. Nothing sent alone.";
      if (!/nothing sent/i.test(String(job.next))) {
        job.next = String(job.next).replace(/\.\s*$/, "") + ". Nothing sent alone.";
      }
      log("Desk", "Reply · " + job.title, "OK", workspace);
      await save();
      return res.status(200).json({ ok: true, job, sent: false, shipped: false, charged: false });
    }
    if (action === "ask") {
      const text = String(body.text || "").trim() || "Need a bit more before this can go.";
      addTalk(job, actorName(person, body), text, "ask");
      job.waitingOn = "info";
      job.why = text;
      job.next = "Waiting on an answer. Then Yes or Stop.";
      recommend(job);
      log("Desk", "Asked · " + job.title, "Waiting", workspace);
      await save();
      return res.status(200).json({ ok: true, job });
    }
    if (action === "fill") {
      mergeFields(job, body);
      clock.applyClock(job, body);
      if (!job.custom) job.custom = {};
      if (body.key) job.custom[slugField(body.key)] = body.value == null ? "" : String(body.value).slice(0, 200);
      addTalk(job, actorName(person, body), "Updated " + (body.key || "fields"), "note");
      qualifyJob(job, shop);
      log("Desk", "Fill · " + job.title, "OK", workspace);
      await save();
      return res.status(200).json({ ok: true, job, fields: ensureFields(shop), clock: clock.clockOf(job) });
    }
    if (action === "schedule" || action === "due" || action === "expire" || action === "snooze") {
      if (action === "snooze") clock.snoozeJob(job, body);
      else clock.applyClock(job, body);
      clock.tickClock(job);
      const line = action === "snooze"
        ? "Snoozed to " + (job.due || "later") + "."
        : (clock.clockLine(job) || "Times saved on the card.");
      addTalk(job, actorName(person, body), line, "note");
      job.log = (job.log || []).concat(["Clock"]);
      job.whoTapped = actorName(person, body);
      job.whoTappedId = actorId(person);
      qualifyJob(job, shop);
      log("Desk", "Clock · " + job.title, "OK", workspace);
      await save();
      return res.status(200).json({ ok: true, job, clock: clock.clockOf(job) });
    }
    if (action === "define-field") {
      if (shop && !isOwner(person)) return res.status(403).json({ error: "Only the owner can add a field." });
      if (!shop) return res.status(404).json({ error: "Open a desk first so fields have a home." });
      const label = String(body.label || "").trim();
      if (!label) return res.status(400).json({ error: "Name the field." });
      const fields = ensureFields(shop);
      const key = slugField(body.key || label);
      if (fields.some((f) => f.key === key)) return res.status(409).json({ error: "That field is already on this desk.", fields });
      if (fields.length >= 12) return res.status(409).json({ error: "Twelve fields is enough on one desk." });
      const type = body.type === "number" || body.type === "yesno" ? body.type : "text";
      fields.push({ key, label, type });
      shop.fields = fields;
      log("Desk", "Field · " + label, "OK", workspace);
      await save();
      return res.status(201).json({ ok: true, fields, workspace: shop.slug });
    }
    if (action === "ship") {
      if (actorBlocked(person)) return res.status(403).json({ ok: false, error: "Desk AIs never Yes themselves. No silent money or mail. A person taps Yes.", never: ais.NEVER.slice(), job });
      mergeFields(job, body);
      const amount = Number(body.amount || job.amount || job.ask || 0);
      const rules = shop ? ensureRules(shop) : [];
      const holdAt = shop ? moneyWaitOf(rules) : null;
      const stopHit = ruleWantsStop(rules, job, "do") || ruleWantsStop(rules, job, "collect");
      const waitHit = moneyNeedsOwner(amount, holdAt) || ruleWantsOwner(rules, job, "do") || ruleWantsOwner(rules, job, "collect");
      const waitLine = ruleWhy(rules, job, "do") || ruleWhy(rules, job, "collect") || "Waiting on the owner.";
      if ((stopHit || waitHit) && !body.confirm) {
        job.status = "held"; job.amount = amount; job.rail = "held"; job.why = waitLine;
        log("Rail", "Held · " + job.title + " · owner rule", "Waiting", workspace);
        await save();
        return res.status(409).json({ ok: false, error: waitLine, job });
      }
      if ((stopHit || waitHit) && shop && !isOwner(person)) {
        job.status = "held"; job.amount = amount; job.rail = "held"; job.why = waitLine;
        await save();
        return res.status(403).json({ ok: false, error: waitLine, job });
      }
      const nextJob = thenAfterYes(job, shop);
      if (nextJob) mem.jobs.unshift(nextJob);
      const provider = body.provider || job.provider || (job.pack === "home" ? "calendar" : null);
      if (job.pack === "home" || provider === "calendar") { job.ics = icsOf(job); job.artifact = "calendar"; }
      const pipe = pipesFor(workspace).find((c) => !provider || c.provider === provider);
      if (provider === "calendar") {
        job.dispatch = { demo: true, provider: "calendar", note: "Calendar file ready on the card. Google write stays off until GOOGLE_CLIENT_ID is on the box." };
      } else if (pipe && pipe.provider === "whatnot") {
        job.dispatch = { demo: true, note: "Whatnot is off for now." };
      } else if (pipe && pipe.provider === "webhook") {
        job.dispatch = await fireWebhook(pipe.hook, { event: "do", action: "ship", job: { id: job.id, title: job.title, draft: job.draft, amount: job.amount }, writeback: hookUrl(workspace) });
      } else if (pipe && pipe.live) {
        job.dispatch = { queued: true, provider: pipe.provider, acts: PROVIDERS[pipe.provider].acts };
      } else {
        job.dispatch = { demo: true, note: "No live connection. It stays on the desk." };
      }
      if (!pipeWroteBack(job.dispatch)) {
        job.status = "out";
        job.offDesk = true;
        job.awaiting = "writeback";
        job.amount = amount || job.amount;
        job.whoTapped = actorName(person, body);
        job.whoTappedId = actorId(person);
        job.rail = "out";
        job.step = "Do";
        job.next = "Off the desk. Waiting on write-back, or tap Done off desk / Needs a hand.";
        job.log = (job.log || []).concat(["Out · waiting on write-back"]);
        addTalk(job, actorName(person, body), "Sent off the desk. Confirm when it is done.", "note");
        log(pipe ? pipe.label : "Desk", "Out · " + job.title, "Waiting", workspace);
        await save();
        return res.status(200).json({ ok: true, job, nextJob: nextJob || undefined, awaiting: "writeback" });
      }
      job.status = "shipped";
      job.amount = amount || job.amount;
      job.whoTapped = actorName(person, body);
      job.whoTappedId = actorId(person);
      job.rail = moneyNeedsOwner(amount, holdAt) ? "owner-confirmed" : "sent";
      job.step = "Collect";
      markFlow(job, "collect");
      job.log = (job.log || []).concat([moneyNeedsOwner(amount, holdAt) ? "Owner confirmed" : "Shipped"]);
      // Collect is on HOLD: Ship never writes a money row.
      log(pipe ? pipe.label : "Desk AI", "Shipped · " + job.title, "OK", workspace);
      await save();
      return res.status(200).json({ ok: true, job, nextJob: nextJob || undefined });
    }
    if (action === "bind-ai" || action === "set-ai" || action === "assign-ai") {
      if (!shop) return res.status(404).json({ error: "Open a desk first.", job });
      if (actorBlocked(person)) return res.status(403).json({ ok: false, error: "Desk AIs never assign themselves. A person taps.", never: ais.NEVER.slice(), job });
      if (!isOwner(person)) return res.status(403).json({ ok: false, error: "Only the owner can pick which desk AI owns this card.", job });
      const hint = body.ai || body.aiId || body.name || body.deskAi || "";
      const picked = ais.findDeskAi(shop, hint);
      if (!picked) return res.status(404).json({ ok: false, error: "Name a desk AI already on this desk.", job });
      stampDeskAi(job, shop, picked);
      if (job.agentDrafted || (job.agentDraft && job.agentDraft.deskAi)) {
        const who = ais.findAiSeat(shop, picked) || {
          name: picked.name,
          crew: picked.role,
          deskAi: true,
          status: "approved",
          kind: "agent",
          role: "agent",
          prompt: picked.prompt,
          does: picked.does,
          never: picked.never,
          steps: picked.steps
        };
        job.agentDrafted = false;
        agentDraft(job, who);
      }
      job.whoTapped = actorName(person, body);
      job.whoTappedId = actorId(person);
      job.next = picked.name + " owns the next step on this card. Nothing goes out without your Yes.";
      addTalk(job, actorName(person, body), "Desk AI on this card · " + picked.name + ".", "note");
      job.log = (job.log || []).concat(["Desk AI · " + picked.name]);
      log("Desk", "Desk AI · " + job.title + " · " + picked.name, "OK", workspace);
      await save();
      return res.status(200).json({ ok: true, job, ai: ais.publicAi(picked), charged: false, sent: false });
    }
    if (action === "assign") {
      if (!shop) return res.status(404).json({ error: "Open a desk first.", job });
      if (actorBlocked(person)) return res.status(403).json({ ok: false, error: "Desk AIs never hand work. A person taps.", never: ais.NEVER.slice(), job });
      const people = shop.people || [];
      const want = String(body.name || body.assignee || body.to || "").trim();
      const whoPerson = require("./_fields").seatFor(people, want);
      if (!whoPerson && want && people.filter((p) => p && String(p.name || "").toLowerCase() === want.toLowerCase()).length > 1) {
        return res.status(409).json({ error: "More than one seat has that name. Hand it by seat id.", job });
      }
      if (!whoPerson) return res.status(404).json({ error: "Name someone already on People.", job });
      applyHandoff(job, whoPerson, shop);
      job.whoTapped = actorName(person, body);
      job.whoTappedId = actorId(person);
      addTalk(job, actorName(person, body), "Handed to " + whoPerson.name + ".", "note");
      markFlow(job, "handoff");
      job.log = (job.log || []).concat(["Assigned · " + whoPerson.name]);
      log("Desk", "Assigned · " + job.title + " · " + whoPerson.name, "Waiting", workspace);
      await save();
      return res.status(200).json({ ok: true, job });
    }
    if (action === "carry") {
      if (actorBlocked(person)) return res.status(403).json({ ok: false, error: "Desk AIs never Yes. A person taps Done.", never: ais.NEVER.slice(), job });
      const rules = shop ? ensureRules(shop) : [];
      const holdAt = shop ? moneyWaitOf(rules) : null;
      const amount = Number(job.amount || job.ask || 0);
      const waitHit = moneyNeedsOwner(amount, holdAt) || ruleWantsOwner(rules, job, "do") || ruleWantsStop(rules, job, "do") || ruleWantsOwner(rules, job, "follow") || ruleWantsStop(rules, job, "follow");
      if (waitHit && shop && !isOwner(person)) return res.status(403).json({ ok: false, error: ruleWhy(rules, job, "do") || ruleWhy(rules, job, "follow") || "Waiting on the owner to mark this done.", job });
      const note = String(body.text || body.notes || "Done by hand.").trim();
      job.carried = true;
      markDone(job, person, body, "hand", shop);
      job.followNote = note;
      job.dispatch = { demo: false, carried: true, how: "hand", note: "Done by hand on this desk." };
      markFlow(job, "follow");
      addTalk(job, actorName(person, body), note, "follow");
      job.log = (job.log || []).concat(["Carried · " + note]);
      log("Desk", "Carried · " + job.title, "OK", workspace);
      await save();
      return res.status(200).json({ ok: true, job });
    }
    if (action === "done") {
      if (actorBlocked(person)) return res.status(403).json({ ok: false, error: "Desk AIs never Yes. A person taps Done.", never: ais.NEVER.slice(), job });
      const note = markDone(job, person, body, body.how || "off-desk", shop);
      markFlow(job, "follow");
      addTalk(job, actorName(person, body), note, "follow");
      job.log = (job.log || []).concat(["Done · " + (job.doneHow || "off-desk")]);
      log("Desk", "Done · " + job.title, "OK", workspace);
      await save();
      return res.status(200).json({ ok: true, job });
    }
    if (action === "hand") {
      const note = markHand(job, person, body);
      markFlow(job, "handoff");
      addTalk(job, actorName(person, body), note, "ask");
      job.log = (job.log || []).concat(["Needs a hand"]);
      log("Desk", "Hand · " + job.title, "Waiting", workspace);
      await save();
      return res.status(200).json({ ok: true, job });
    }
    if (action === "priority" || action === "cap" || action === "uncap") {
      const off = action === "uncap" || body.on === false || body.on === 0 || body.off === true;
      if (!off) {
        const onDesk = mem.jobs.filter((j) => j && j.workspace === workspace && isPriorityJob(j)).length;
        if (!isPriorityJob(job) && onDesk >= 8) return res.status(409).json({ ok: false, error: "Eight cap cards on this desk. Take one off the pyramid first.", job });
        job.priority = true;
        job.cap = true;
        job.priorityAt = new Date().toISOString();
        job.priorityBy = actorName(person, body);
        addTalk(job, actorName(person, body), "On the cap. Orange. Do this first.", "note");
        job.log = (job.log || []).concat(["Cap"]);
        log("Desk", "Cap · " + job.title, "OK", workspace);
      } else {
        job.priority = false;
        job.cap = false;
        job.priorityAt = null;
        addTalk(job, actorName(person, body), "Off the cap.", "note");
        job.log = (job.log || []).concat(["Off cap"]);
        log("Desk", "Off cap · " + job.title, "OK", workspace);
      }
      job.whoTapped = actorName(person, body);
      job.whoTappedId = actorId(person);
      await save();
      return res.status(200).json({ ok: true, job, needs: needsOf(job, { staff: person && person.role === "employee" }) });
    }
    return res.status(400).json({ error: "action must be capture, qualify, recommend, ship, kill, say, reply, ask, fill, define-field, assign, bind-ai, carry, done, hand, priority, schedule, or snooze" });
  }
  return res.status(405).json({ error: "Use GET or POST" });
};

// Store guard: no saving request answers 2xx while its write was refused.
module.exports = require("./_lib").guardStore(module.exports);
