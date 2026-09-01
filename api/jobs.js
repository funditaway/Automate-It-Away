const { cors, mem, log, save, ready, PROVIDERS, readBody, personOf, isOwner, ensureRules, defaultRules, ensureNouns, defaultNouns, widgetCount, moneyWaitOf, moneyNeedsOwner, ensurePeople, publicPerson, ruleWantsOwner, ruleWantsStop, ruleWhy } = require("./_lib");
const { pickFields, mergeFields, slugField, ensureFields, addTalk, makeCapturedJob } = require("./_fields");
const { qualifyJob, recommend, icsOf, runWorkspace, markFlow } = require("./_engine");
const { grokRecommend } = require("./_grok");

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
    return res.status(200).json({
      workspace,
      you: person ? { name: person.name, role: person.role } : null,
      fields: ensureFields(shop),
      rules,
      nouns: shop ? ensureNouns(shop) : defaultNouns(),
      people: shop ? (shop.people || []).map(publicPerson) : [],
      widgetsOn: widgetCount(rules),
      jobs: mem.jobs.filter((j) => j.workspace === workspace)
    });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const action = body.action || "capture";
    if (action === "capture") {
      const job = makeCapturedJob(workspace, shop, body);
      qualifyJob(job, shop);
      const grok = await grokRecommend(job, shop, workspace);
      if (grok && grok.ok) addTalk(job, "grok", job.draft || "Draft on the card.", "rec");
      if (job.notes) addTalk(job, job.from || "capture", job.notes, "note");
      addTalk(job, "desk", job.why || "In the queue.", "rec");
      mem.jobs.unshift(job);
      mem.inbox.unshift({ id: "in_" + Date.now().toString(36), workspace, text: job.title, from: job.from, at: Date.now() });
      log("Capture", job.title, "Waiting", workspace);
      runWorkspace(mem.jobs.filter((j) => j.workspace === workspace), Date.now(), shop);
      await save();
      return res.status(201).json({ ok: true, job, notify: job.notify || [], crew: job.crew || null });
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
    return res.status(400).json({ error: "action must be capture, qualify, recommend, ship, kill, say, ask, fill, define-field, assign, carry, done, or hand" });
  }
  return res.status(405).json({ error: "Use GET or POST" });
};
