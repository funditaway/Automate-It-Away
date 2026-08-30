const { cors, mem, log, save, ready, slugify, readBody } = require("./_lib");
const { qualifyJob } = require("./engine");
const { makeCapturedJob, addTalk } = require("./fields");

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
      note: "Pipes write back here. Owner still owns Stop."
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
    const shop = (mem.workspaces || []).find((w) => w && w.slug === workspace) || null;
    job = makeCapturedJob(workspace, shop, Object.assign({}, body, {
      title: title,
      why: body.why || "In from a pipe.",
      from: body.from || body.provider || "webhook",
      notes: body.notes || body.text || "",
      lane: body.lane || "ext"
    }));
    job.log = ["Pipe capture"];
    job.provider = body.provider || job.provider || "webhook";
    qualifyJob(job, shop);
    try {
      const { grokRecommend } = require("./grok");
      const grok = await grokRecommend(job, shop);
      if (grok && grok.ok) addTalk(job, "grok", job.draft || "Draft on the card.", "rec");
    } catch (e) {}
    if (job.notes) addTalk(job, job.from || "pipe", job.notes, "note");
    mem.jobs.unshift(job);
    mem.inbox.unshift({
      id: "in_" + Date.now().toString(36),
      workspace,
      text: job.title,
      from: job.from,
      at: Date.now()
    });
    log("Pipe", "In \u00b7 " + job.title, "Waiting", workspace);
    await save();
    return res.status(201).json({ ok: true, event: "capture", job });
  }

  if (event === "kill") {
    job.status = "killed";
    job.killReason = body.reason || body.killReason || "Pipe said stop";
    job.whoTapped = body.who || body.provider || "webhook";
    job.log = (job.log || []).concat(["Pipe stop"]);
    log("Pipe", "Stop \u00b7 " + job.title, "Stopped", workspace);
    await save();
    return res.status(200).json({ ok: true, event: "kill", job });
  }

  if (event === "collect") {
    const amount = Number(body.amount || job.amount || job.ask || 0);
    job.status = "shipped";
    job.step = "Collect";
    job.amount = amount || job.amount;
    job.dispatch = { provider: body.provider || "webhook", inbound: true, demo: false };
    job.log = (job.log || []).concat(["Pipe wrote back \u00b7 collect"]);
    mem.money.unshift({
      at: new Date().toISOString(),
      workspace,
      who: job.payoutTo || job.title,
      what: "Pipe collect",
      amt: amount ? "$" + amount : "—",
      held: false
    });
    log("Pipe", "Collect \u00b7 " + job.title, "OK", workspace);
    await save();
    return res.status(200).json({ ok: true, event: "collect", job });
  }

  job.notes = body.notes || job.notes;
  if (body.status) job.pipeStatus = String(body.status).slice(0, 80);
  job.log = (job.log || []).concat(["Pipe update"]);
  log("Pipe", "Update \u00b7 " + job.title, "OK", workspace);
  await save();
  return res.status(200).json({ ok: true, event: "update", job });
};
