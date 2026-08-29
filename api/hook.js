const { cors, mem, log, save, ready, slugify, readBody } = require("./_lib");
const { qualifyJob } = require("./engine");

function eventOf(body) {
  const raw = String(body.event || body.action || body.status || "update").toLowerCase();
  if (/sold|paid|booked|done|complete|shipped/.test(raw)) return "collect";
  if (/fail|error|cancel|kill|stop/.test(raw)) return "kill";
  if (/capture|new|create|intake/.test(raw)) return "capture";
  return "update";
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();

  if (req.method !== "POST") {
    return res.status(200).json({
      ok: true,
      use: "POST",
      events: ["capture", "update", "collect", "kill"],
      note: "Pipes write back here. Owner still owns Stop and money over $250."
    });
  }

  const body = await readBody(req);
  const workspace = slugify(req.headers["x-workspace"] || req.query.workspace || body.workspace || "demo");
  const event = eventOf(body);
  const title = body.title || body.item || body.name || body.notes || "Pipe update";

  let job = null;
  if (body.id || body.jobId) {
    job = mem.jobs.find((j) => j.workspace === workspace && (j.id === body.id || j.id === body.jobId));
  }
  if (!job && body.externalId) {
    job = mem.jobs.find((j) => j.workspace === workspace && j.externalId === String(body.externalId));
  }

  if (event === "capture" || !job) {
    job = {
      id: "job_" + Date.now().toString(36),
      workspace,
      title: String(title).slice(0, 160),
      why: "In from a pipe.",
      status: "exception",
      step: "Qualify",
      createdAt: new Date().toISOString(),
      log: ["Pipe capture"],
      from: body.from || body.provider || "webhook",
      provider: body.provider || "webhook",
      externalId: body.externalId || null,
      notes: body.notes || body.text || "",
      amount: body.amount || body.ask || null,
      contactName: body.contactName || body.who || "",
      phone: body.phone || "",
      email: body.email || ""
    };
    qualifyJob(job);
    mem.jobs.unshift(job);
    mem.inbox.unshift({
      id: "in_" + Date.now().toString(36),
      workspace,
      text: job.title,
      from: job.from,
      at: Date.now()
    });
    log("Pipe", "In · " + job.title, "Waiting", workspace);
    await save();
    return res.status(201).json({ ok: true, event: "capture", job });
  }

  if (event === "kill") {
    job.status = "killed";
    job.killReason = body.reason || body.killReason || "Pipe said stop";
    job.whoTapped = body.who || body.provider || "webhook";
    job.log = (job.log || []).concat(["Pipe stop"]);
    log("Pipe", "Stop · " + job.title, "Stopped", workspace);
    await save();
    return res.status(200).json({ ok: true, event: "kill", job });
  }

  if (event === "collect") {
    const amount = Number(body.amount || job.amount || job.ask || 0);
    if (amount > 250) {
      job.status = "held";
      job.amount = amount;
      job.why = "Pipe reported money over $250. Owner taps Send.";
      job.log = (job.log || []).concat(["Pipe collect held · $" + amount]);
      log("Rail", "Held · pipe collect · $" + amount, "Waiting", workspace);
      await save();
      return res.status(409).json({
        ok: false,
        error: "Guardrail: money over $250 needs the owner on the desk.",
        job
      });
    }
    job.status = "shipped";
    job.step = "Collect";
    job.amount = amount || job.amount;
    job.dispatch = { provider: body.provider || "webhook", inbound: true, demo: false };
    job.log = (job.log || []).concat(["Pipe wrote back · collect"]);
    mem.money.unshift({
      at: new Date().toISOString(),
      workspace,
      who: job.payoutTo || job.title,
      what: "Pipe collect",
      amt: amount ? "$" + amount : "—",
      held: false
    });
    log("Pipe", "Collect · " + job.title, "OK", workspace);
    await save();
    return res.status(200).json({ ok: true, event: "collect", job });
  }

  job.notes = body.notes || job.notes;
  if (body.status) job.pipeStatus = String(body.status).slice(0, 80);
  job.log = (job.log || []).concat(["Pipe update"]);
  log("Pipe", "Update · " + job.title, "OK", workspace);
  await save();
  return res.status(200).json({ ok: true, event: "update", job });
};
