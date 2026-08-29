const { cors, mem, log, save, PROVIDERS, workspaceOf, readBody } = require("./_lib");
const { pickFields, mergeFields } = require("./fields");

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

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  const workspace = workspaceOf(req);

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
    return res.status(200).json({
      workspace,
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
        why: body.why || "Captured. Guardrail: human before ship.",
        status: "exception",
        step: "Qualify",
        createdAt: new Date().toISOString(),
        log: ["Captured", "Waiting on owner"],
        ...fields,
        from: fields.from || "widget"
      };
      mem.jobs.unshift(job);
      mem.inbox.unshift({
        id: "in_" + Date.now().toString(36),
        workspace,
        text: job.title,
        from: job.from,
        at: Date.now()
      });
      save();
      log("Capture", job.title, "Waiting", workspace);
      return res.status(201).json({ ok: true, job });
    }

    const job = mem.jobs.find((j) => j.id === body.id && j.workspace === workspace);
    if (!job) return res.status(404).json({ error: "Job not found" });

    if (action === "kill") {
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
      job.whoTapped = body.whoTapped || "owner";
      job.log = (job.log || []).concat(["Killed · " + job.killReason]);
      save();
      log("Agent", "Killed · " + job.title, "Stopped", workspace);
      return res.status(200).json({ ok: true, job });
    }

    if (action === "qualify") {
      mergeFields(job, body);
      job.step = "Do the work";
      job.why = body.why || job.why;
      if (job.risk && job.risk !== "none") job.status = "exception";
      job.log = (job.log || []).concat(["Qualified · risk " + (job.risk || "none")]);
      save();
      log("Qualify", job.title, "Waiting", workspace);
      return res.status(200).json({ ok: true, job });
    }

    if (action === "ship") {
      mergeFields(job, body);
      const amount = Number(body.amount || job.amount || job.ask || 0);
      if (amount > 250 && !body.confirm) {
        job.status = "held";
        job.amount = amount;
        save();
        log("Rail", "Held · " + job.title + " · $" + amount, "Waiting", workspace);
        return res.status(409).json({
          ok: false,
          error: "Guardrail: money over $250 needs the owner on the desk.",
          job
        });
      }
      const provider = body.provider || job.provider;
      const pipe = pipesFor(workspace).find((c) => !provider || c.provider === provider);
      if (pipe && pipe.provider === "whatnot") {
        job.dispatch = { demo: true, note: "Whatnot is not a launch pipe." };
      } else if (pipe && pipe.provider === "webhook") {
        job.dispatch = await fireWebhook(pipe.hook, { job, action: "ship" });
      } else if (pipe && pipe.live) {
        job.dispatch = { queued: true, provider: pipe.provider, acts: PROVIDERS[pipe.provider].acts };
      } else {
        job.dispatch = { demo: true, note: "No live pipe. Marked shipped on the API only." };
      }
      job.status = "shipped";
      job.amount = amount || job.amount;
      job.whoTapped = body.whoTapped || job.whoTapped || "owner";
      job.rail = amount > 250 ? "owner-confirmed" : "under-250";
      job.log = (job.log || []).concat([amount > 250 ? "Owner confirmed $" + amount : "Shipped"]);
      mem.money.unshift({
        at: new Date().toISOString(),
        workspace,
        who: job.payoutTo || job.title,
        what: job.dispatch && job.dispatch.demo ? "Demo ship — not billed" : "Ship",
        amt: amount ? "$" + amount : "—",
        held: false
      });
      save();
      log(pipe ? pipe.label : "Agent", "Shipped · " + job.title, job.dispatch && job.dispatch.demo ? "Demo" : "OK", workspace);
      return res.status(200).json({ ok: true, job });
    }

    return res.status(400).json({ error: "action must be capture, qualify, ship, or kill" });
  }

  return res.status(405).json({ error: "Use GET or POST" });
};
