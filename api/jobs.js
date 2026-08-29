const { cors, mem, log, PROVIDERS } = require("./_lib");

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
  });
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
  const workspace = req.headers["x-workspace"] || req.query.workspace || "demo";

  if (req.method === "GET") {
    if (req.query.audit === "1") {
      return res.status(200).json({ workspace, audit: mem.audit.slice(0, 50) });
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
      const job = {
        id: "job_" + Date.now().toString(36),
        workspace,
        title: body.title || "Untitled",
        why: body.why || "Captured. Guardrail: human before ship.",
        status: "exception",
        provider: body.provider || null,
        createdAt: new Date().toISOString()
      };
      mem.jobs.unshift(job);
      log("Capture", job.title, "Waiting");
      return res.status(201).json({ ok: true, job });
    }

    const job = mem.jobs.find((j) => j.id === body.id && j.workspace === workspace);
    if (!job) return res.status(404).json({ error: "Job not found" });

    if (action === "kill") {
      job.status = "killed";
      log("Agent", "Killed · " + job.title, "Stopped");
      return res.status(200).json({ ok: true, job });
    }

    if (action === "ship") {
      const amount = Number(body.amount || 0);
      if (amount > 250) {
        job.status = "held";
        log("Rail", "Held · " + job.title + " · $" + amount, "Waiting");
        return res.status(409).json({
          ok: false,
          error: "Guardrail: money over $250 needs the owner on the desk.",
          job
        });
      }
      const provider = body.provider || job.provider;
      const pipe = mem.connections.filter((c) => c.workspace === workspace).find((c) => !provider || c.provider === provider);
      if (pipe && pipe.provider === "webhook") {
        job.dispatch = await fireWebhook(pipe.hook, { job, action: "ship" });
      } else if (pipe && pipe.live) {
        job.dispatch = { queued: true, provider: pipe.provider, acts: PROVIDERS[pipe.provider].acts };
      } else {
        job.dispatch = { demo: true, note: "No live pipe. Marked shipped on the API only." };
      }
      job.status = "shipped";
      log(pipe ? pipe.label : "Agent", "Shipped · " + job.title, "OK");
      return res.status(200).json({ ok: true, job });
    }

    return res.status(400).json({ error: "action must be capture, ship, or kill" });
  }

  return res.status(405).json({ error: "Use GET or POST" });
};
