const { cors, mem, log, save, ready, PROVIDERS, readBody, personOf, isOwner, ensureRules, defaultRules, ensureNouns, defaultNouns, widgetCount } = require("./_lib");
const { pickFields, mergeFields, slugField, ensureFields, addTalk } = require("./fields");
const { qualifyJob, recommend, icsOf, runWorkspace, MONEY_HOLD } = require("./engine");

function namedWorkspace(req) {
  const raw = req.headers["x-workspace"] || (req.query && req.query.workspace);
  if (raw == null || !String(raw).trim()) return "";
  return String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function pipeWroteBack(dispatch) {
  return !!(dispatch && !dispatch.demo && (dispatch.ok === true || dispatch.inbound === true));
}

function pipesFor(workspace) {
  return mem.connections.filter((c) => c.workspace === workspace);
}

async function fireWebhook(hook, payload) {
  if (!hook) return { skipped: true };
  const r = await fetch(hook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return { status: r.status, ok: r.ok };
}

function actorName(person, body) {
  return (person && person.name) || body.whoTapped || "desk";
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();
  const workspace = namedWorkspace(req);
  if (!workspace) {
    return res.status(400).json({ error: "Open a desk first." });
  }
  const { workspace: shop, person } = personOf(req, workspace);

  if (req.method === "GET") {
    if (req.query.audit === "1") {
      return res.status(200).json({
        workspace,
        audit: mem.audit.filter((a) => !a.workspace || a.workspace === workspace).slice(0, 50)
      });
    }
    if (req.query.money === "1") {
      return res.status(200).json({
        workspace,
        money: mem.money.filter((m) => m.workspace === workspace).slice(0, 50)
      });
    }
    if (req.query.inbox === "1") {
      return res.status(200).json({
        workspace,
        inbox: mem.inbox.filter((i) => i.workspace === workspace)
      });
    }
    if (req.query.ics) {
      const job = mem.jobs.find((j) => j.id === req.query.ics && j.workspace === workspace);
      if (!job) return res.status(404).json({ error: "Job not found" });
      const body = icsOf(job);
      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=\"" + job.id + ".ics\"");
      return res.status(200).send(body);
    }
    if (shop) {
      ensureRules(shop);
      ensureNouns(shop);
    }
    const rules = shop ? ensureRules(shop) : defaultRules();
    return res.status(200).json({
      workspace,
      you: person ? { name: person.name, role: person.role } : null,
      fields: ensureFields(shop),
      rules,
      nouns: shop ? ensureNouns(shop) : defaultNouns(),
      widgetsOn: widgetCount(rules),
      jobs: mem.jobs.filter((j) => j.workspace === workspace)
    });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const action = body.action || "capture";

    if (action === "capture") {
      const fields = pickFields(body);
      const job = {
        id: "job_" + Date.now().toString(36),
        workspace,
        title: body.title || fields.notes || "Untitled",
        why: body.why || "Captured.",
        status: "exception",
        step: "Qualify",
        createdAt: new Date().toISOString(),
        log: ["Captured"],
        ...fields,
        from: fields.from || "widget"
      };
      qualifyJob(job, shop);
      if (fields.notes) addTalk(job, job.from || "capture", fields.notes, "note");
      addTalk(job, "desk", job.why || "In the queue.", "rec");
      mem.jobs.unshift(job);
      mem.inbox.unshift({
        id: "in_" + Date.now().toString(36),
        workspace,
        text: job.title,
        from: job.from,
        at: Date.now()
      });
      log("Capture", job.title, "Waiting", workspace);
      runWorkspace(mem.jobs.filter((j) => j.workspace === workspace), Date.now(), shop);
      await save();
      return res.status(201).json({ ok: true, job });
    }

    const job = mem.jobs.find((j) => j.id === body.id && j.workspace === workspace);
    if (!job) return res.status(404).json({ error: "Job not found" });

    if (action === "kill") {
      if (shop && !isOwner(person)) {
        return res.status(403).json({
          ok: false,
          error: "Only the owner can Stop a live job.",
          job
        });
      }
      if (!body.confirm) {
        return res.status(409).json({
          ok: false,
          error: "Kill needs a second tap from the owner.",
          job
        });
      }
      mergeFields(job, body);
      job.status = "killed";
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
      log("Qualify", job.title, "Waiting", workspace);
      await save();
      return res.status(200).json({ ok: true, job });
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
      job.next = "Waiting on an answer. Then Send or Stop.";
      recommend(job);
      log("Desk", "Asked · " + job.title, "Waiting", workspace);
      await save();
      return res.status(200).json({ ok: true, job });
    }

    if (action === "fill") {
      mergeFields(job, body);
      if (!job.custom) job.custom = {};
      if (body.key) job.custom[slugField(body.key)] = body.value == null ? "" : String(body.value).slice(0, 200);
      addTalk(job, actorName(person, body), "Updated " + (body.key || "fields"), "note");
      qualifyJob(job, shop);
      log("Desk", "Fill · " + job.title, "OK", workspace);
      await save();
      return res.status(200).json({ ok: true, job, fields: ensureFields(shop) });
    }

    if (action === "define-field") {
      if (shop && !isOwner(person)) {
        return res.status(403).json({ error: "Only the owner can add a field." });
      }
      if (!shop) return res.status(404).json({ error: "Open a desk first so fields have a home." });
      const label = String(body.label || "").trim();
      if (!label) return res.status(400).json({ error: "Name the field." });
      const fields = ensureFields(shop);
      const key = slugField(body.key || label);
      if (fields.some((f) => f.key === key)) {
        return res.status(409).json({ error: "That field is already on this desk.", fields });
      }
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
      // Hard stop is code, not workspace rule text. Deleting or rewriting the $250 rule still holds.
      if (amount >= MONEY_HOLD && !body.confirm) {
        job.status = "held";
        job.amount = amount;
        job.rail = "held";
        log("Rail", "Held · " + job.title + " · $" + amount, "Waiting", workspace);
        await save();
        return res.status(409).json({
          ok: false,
          error: "Guardrail: money over $250 needs the owner on the desk.",
          job
        });
      }
      if (amount >= MONEY_HOLD && shop && !isOwner(person)) {
        job.status = "held";
        job.amount = amount;
        job.rail = "held";
        await save();
        return res.status(403).json({
          ok: false,
          error: "Only the owner can release money over $250.",
          job
        });
      }
      const provider = body.provider || job.provider || (job.pack === "home" ? "calendar" : null);
      if (job.pack === "home" || provider === "calendar") {
        job.ics = icsOf(job);
        job.artifact = "calendar";
      }
      const pipe = pipesFor(workspace).find((c) => !provider || c.provider === provider);
      if (provider === "calendar") {
        job.dispatch = {
          demo: true,
          provider: "calendar",
          note: "Calendar file ready on the card. Google write stays off until GOOGLE_CLIENT_ID is on the box."
        };
      } else if (pipe && pipe.provider === "whatnot") {
        job.dispatch = { demo: true, note: "Whatnot is not a launch pipe." };
      } else if (pipe && pipe.provider === "webhook") {
        job.dispatch = await fireWebhook(pipe.hook, { job, action: "ship" });
      } else if (pipe && pipe.live) {
        job.dispatch = { queued: true, provider: pipe.provider, acts: PROVIDERS[pipe.provider].acts };
      } else {
        job.dispatch = { demo: true, note: "No live pipe. Stays on the desk." };
      }
      // Hard stop is code, not rule text. Demo / no write-back cannot become shipped.
      if (!pipeWroteBack(job.dispatch)) {
        job.status = "held";
        job.amount = amount || job.amount;
        job.whoTapped = actorName(person, body);
        job.rail = "held";
        job.log = (job.log || []).concat(["Held · no live pipe write-back"]);
        log(pipe ? pipe.label : "Agent", "Held · " + job.title, job.dispatch && job.dispatch.demo ? "Demo" : "Waiting", workspace);
        await save();
        return res.status(200).json({ ok: true, job });
      }
      job.status = "shipped";
      job.amount = amount || job.amount;
      job.whoTapped = actorName(person, body);
      job.rail = amount >= MONEY_HOLD ? "owner-confirmed" : "under-250";
      job.step = "Collect";
      job.log = (job.log || []).concat([amount >= MONEY_HOLD ? "Owner confirmed $" + amount : "Shipped"]);
      mem.money.unshift({
        at: new Date().toISOString(),
        workspace,
        who: job.payoutTo || job.title,
        what: "Ship",
        amt: amount ? "$" + amount : "—",
        held: false
      });
      log(pipe ? pipe.label : "Agent", "Shipped · " + job.title, "OK", workspace);
      await save();
      return res.status(200).json({ ok: true, job });
    }

    return res.status(400).json({ error: "action must be capture, qualify, ship, kill, say, ask, fill, or define-field" });
  }

  return res.status(405).json({ error: "Use GET or POST" });
};
