const { dropCannedSeeds } = require("./_drop-seed");
const { cors, mem, log, save, ready, PROVIDERS, readBody, personOf, isOwner, ensureRules, defaultRules, ensureNouns, defaultNouns, widgetCount, moneyWaitOf, moneyNeedsOwner, ensurePeople, publicPerson, ruleWantsOwner, ruleWantsStop, ruleWhy } = require("./_lib");
const { pickFields, mergeFields, slugField, ensureFields, addTalk, makeCapturedJob } = require("./_fields");
const { qualifyJob, recommend, icsOf, runWorkspace, markFlow } = require("./_engine");
const { grokRecommend, normalizeCites } = require("./_grok");
const { needsOf, isPriorityJob } = require("./_history");
const clock = require("./_clock");

function namedWorkspace(req) {
  const raw = req.headers["x-workspace"] || (req.query && req.query.workspace);
  if (raw == null || !String(raw).trim()) return "";
  return String(raw).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}
function pipeWroteBack(dispatch) {
  return !!(dispatch && !dispatch.demo && (dispatch.ok === true || dispatch.inbound === true));
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
  return (person && person.name) || body.whoTapped || "desk";
}
function markDone(job, person, body, how) {
  const note = String((body && (body.text || body.notes)) || "Done off the desk.").trim();
  job.status = "shipped";
  job.doneHow = how || (body && body.how) || "off-desk";
  job.doneAt = new Date().toISOString();
  job.doneBy = actorName(person, body || {});
  job.awaiting = null;
  job.offDesk = false;
  job.followed = true;
  job.followNote = note;
  job.step = "Follow";
  job.rail = job.doneHow === "hand" ? "carried" : "done";
  job.whoTapped = actorName(person, body || {});
  job.dispatch = job.dispatch || { demo: false, done: true, how: job.doneHow };
  return note;
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
  job.rail = "hand";
  job.step = "Do";
  return note;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();
  if (dropCannedSeeds(mem)) await save();
  const workspace = namedWorkspace(req);
  if (!workspace) return res.status(400).json({ error: "Open a desk first." });
  const { workspace: shop, person } = personOf(req, workspace);

  if (req.method === "GET") {
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
    const staff = person && person.role === "employee";
    const rows = mem.jobs.filter((j) => j.workspace === workspace).map((j) => {
      const needs = needsOf(j, { staff });
      const tick = clock.clockOf(j);
      return Object.assign({}, j, { needs: needs.actions, needLine: needs.line, missing: needs.missing, decide: needs.decide, priority: isPriorityJob(j), clock: tick, late: tick.late, expired: tick.expired });
    });
    const cap = rows.filter((j) => j.priority);
    return res.status(200).json({
      workspace,
      you: person ? { name: person.name, role: person.role } : null,
      fields: ensureFields(shop),
      rules,
      nouns: shop ? ensureNouns(shop) : defaultNouns(),
      people: shop ? (shop.people || []).map(publicPerson) : [],
      widgetsOn: widgetCount(rules),
      cap,
      jobs: rows
    });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const action = body.action || "capture";
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
            ? "Drafts are off until XAI_API_KEY is on. You can still put the work on the queue."
            : "No draft this time. You can still put the work on the queue.")
      });
    }
    if (action === "capture") {
      const job = makeCapturedJob(workspace, shop, body);
      qualifyJob(job, shop);
      const incomingCites = normalizeCites(body.citations || []);
      if (incomingCites.length) job.citations = incomingCites;
      if (Array.isArray(body.recs) && body.recs.length && !job.recs) job.recs = body.recs.slice(0, 8);
      let grok = null;
      if (!job.draft) {
        grok = await grokRecommend(job, shop, workspace);
        if (grok && grok.ok) addTalk(job, "grok", job.draft || "Draft on the card.", "rec");
      } else {
        addTalk(job, "grok", job.draft, "rec");
      }
      if (job.notes) addTalk(job, job.from || "capture", job.notes, "note");
      addTalk(job, "desk", job.why || "In the queue.", "rec");
      mem.jobs.unshift(job);
      mem.inbox.unshift({ id: "in_" + Date.now().toString(36), workspace, text: job.title, from: job.from, at: Date.now() });
      log("Capture", job.title, "Waiting", workspace);
      runWorkspace(mem.jobs.filter((j) => j.workspace === workspace), Date.now(), shop);
      await save();
      return res.status(201).json({ ok: true, job, notify: job.notify || [], crew: job.crew || null, grok: grok && grok.ok ? "on" : (grok && grok.reason) || (job.draft ? "on" : "off") });
    }
    const job = mem.jobs.find((j) => j.id === body.id && j.workspace === workspace);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (action === "kill") {
      if (shop && !isOwner(person)) return res.status(403).json({ ok: false, error: "Only the owner can Stop a live job.", job });
      if (!body.confirm) return res.status(409).json({ ok: false, error: "Kill needs a second tap from the owner.", job });
      mergeFields(job, body);
      job.status = "killed";
      markFlow(job, "kill");
      job.killReason = body.killReason || job.killReason || "Owner kill";
      job.whoTapped = actorName(person, body);
      job.log = (job.log || []).concat(["Killed · " + job.killReason]);
      log("Agent", "Killed · " + job.title, "Stopped", workspace);
      await save();
      return res.status(200).json({ ok: true, job });
    }
    if (action === "qualify") {
      mergeFields(job, body);
      qualifyJob(job, shop);
      if (body.why) job.why = body.why;
      const grok = await grokRecommend(job, shop, workspace);
      if (grok && grok.ok) addTalk(job, "grok", job.draft || "Draft on the card.", "rec");
      log("Qualify", job.title, "Waiting", workspace);
      await save();
      return res.status(200).json({ ok: true, job, grok: grok && grok.ok ? "on" : (grok && grok.reason) || "off" });
    }
    if (action === "recommend") {
      qualifyJob(job, shop);
      const grok = await grokRecommend(job, shop, workspace);
      if (grok && grok.ok) addTalk(job, "grok", job.draft || "Draft on the card.", "rec");
      else recommend(job, [], shop);
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
      const provider = body.provider || job.provider || (job.pack === "home" ? "calendar" : null);
      if (job.pack === "home" || provider === "calendar") { job.ics = icsOf(job); job.artifact = "calendar"; }
      const pipe = pipesFor(workspace).find((c) => !provider || c.provider === provider);
      if (provider === "calendar") {
        job.dispatch = { demo: true, provider: "calendar", note: "Calendar file ready on the card. Google write stays off until GOOGLE_CLIENT_ID is on the box." };
      } else if (pipe && pipe.provider === "whatnot") {
        job.dispatch = { demo: true, note: "Whatnot is not a launch pipe." };
      } else if (pipe && pipe.provider === "webhook") {
        job.dispatch = await fireWebhook(pipe.hook, { event: "do", action: "ship", job: { id: job.id, title: job.title, draft: job.draft, amount: job.amount }, writeback: "https://automateitaway.com/api/hook?workspace=" + encodeURIComponent(workspace) });
      } else if (pipe && pipe.live) {
        job.dispatch = { queued: true, provider: pipe.provider, acts: PROVIDERS[pipe.provider].acts };
      } else {
        job.dispatch = { demo: true, note: "No live pipe. Stays on the desk." };
      }
      if (!pipeWroteBack(job.dispatch)) {
        job.status = "out";
        job.offDesk = true;
        job.awaiting = "writeback";
        job.amount = amount || job.amount;
        job.whoTapped = actorName(person, body);
        job.rail = "out";
        job.step = "Do";
        job.next = "Off the desk. Waiting on write-back, or tap Done off desk / Needs a hand.";
        job.log = (job.log || []).concat(["Out · waiting on write-back"]);
        addTalk(job, actorName(person, body), "Sent off the desk. Confirm when it is done.", "note");
        log(pipe ? pipe.label : "Desk", "Out · " + job.title, "Waiting", workspace);
        await save();
        return res.status(200).json({ ok: true, job, awaiting: "writeback" });
      }
      job.status = "shipped";
      job.amount = amount || job.amount;
      job.whoTapped = actorName(person, body);
      job.rail = moneyNeedsOwner(amount, holdAt) ? "owner-confirmed" : "sent";
      job.step = "Collect";
      markFlow(job, "collect");
      job.log = (job.log || []).concat([moneyNeedsOwner(amount, holdAt) ? "Owner confirmed" : "Shipped"]);
      mem.money.unshift({ at: new Date().toISOString(), workspace, who: job.payoutTo || job.title, what: "Ship", amt: amount ? "$" + amount : "—", held: false });
      log(pipe ? pipe.label : "Agent", "Shipped · " + job.title, "OK", workspace);
      await save();
      return res.status(200).json({ ok: true, job });
    }
    if (action === "assign") {
      if (!shop) return res.status(404).json({ error: "Open a desk first.", job });
      const people = shop.people || [];
      const want = String(body.name || body.assignee || body.to || "").trim();
      const whoPerson = people.find((p) => p && (p.id === want || String(p.name || "").toLowerCase() === want.toLowerCase()));
      if (!whoPerson) return res.status(404).json({ error: "Name someone already on People.", job });
      job.assignee = whoPerson.name;
      job.waitingOn = whoPerson.role === "owner" ? "owner" : "helper";
      job.next = "Waiting on " + whoPerson.name + ".";
      job.whoTapped = actorName(person, body);
      addTalk(job, actorName(person, body), "Handed to " + whoPerson.name + ".", "note");
      markFlow(job, "handoff");
      job.log = (job.log || []).concat(["Assigned · " + whoPerson.name]);
      log("Desk", "Assigned · " + job.title + " · " + whoPerson.name, "Waiting", workspace);
      await save();
      return res.status(200).json({ ok: true, job });
    }
    if (action === "carry") {
      const rules = shop ? ensureRules(shop) : [];
      const holdAt = shop ? moneyWaitOf(rules) : null;
      const amount = Number(job.amount || job.ask || 0);
      const waitHit = moneyNeedsOwner(amount, holdAt) || ruleWantsOwner(rules, job, "do") || ruleWantsStop(rules, job, "do") || ruleWantsOwner(rules, job, "follow") || ruleWantsStop(rules, job, "follow");
      if (waitHit && shop && !isOwner(person)) return res.status(403).json({ ok: false, error: ruleWhy(rules, job, "do") || ruleWhy(rules, job, "follow") || "Waiting on the owner to mark this done.", job });
      const note = String(body.text || body.notes || "Done by hand.").trim();
      job.carried = true;
      markDone(job, person, body, "hand");
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
      const note = markDone(job, person, body, body.how || "off-desk");
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
      await save();
      return res.status(200).json({ ok: true, job, needs: needsOf(job, { staff: person && person.role === "employee" }) });
    }
    return res.status(400).json({ error: "action must be capture, qualify, recommend, ship, kill, say, ask, fill, define-field, assign, carry, done, hand, priority, schedule, or snooze" });
  }
  return res.status(405).json({ error: "Use GET or POST" });
};
