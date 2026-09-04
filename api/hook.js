const { cors, mem, log, save, ready, slugify, readBody } = require("./_lib");
const { deskClosed, deskClosedMessage } = require("./_desk");
const { qualifyJob, applyRules } = require("./_engine");
const { makeCapturedJob, addTalk } = require("./_fields");
const mail = require("./_aia-mail");

function eventOf(body) {
  const raw = String(body.event || body.action || body.status || "update").toLowerCase();
  if (/need[s]?\s*a?\s*hand|manual|by[\s-]?hand|retry|reopen/.test(raw)) return "hand";
  if (/sold|paid/.test(raw)) return "collect";
  if (/booked|done|complete|shipped|confirmed/.test(raw)) return "done";
  if (/fail|error|cancel|kill|stop/.test(raw)) return "kill";
  if (/capture|new|create|intake/.test(raw)) return "capture";
  return "update";
}

function finishDone(job, body, how) {
  const note = String(body.notes || body.text || body.reason || "Pipe confirmed done.").trim();
  job.status = "shipped";
  job.doneHow = how;
  job.doneAt = new Date().toISOString();
  job.doneBy = body.who || body.provider || "webhook";
  job.awaiting = null;
  job.offDesk = false;
  job.followed = true;
  job.followNote = note;
  job.step = "Follow";
  job.rail = "done";
  job.whoTapped = job.doneBy;
  job.dispatch = { provider: body.provider || "webhook", inbound: true, demo: false, done: true, how: how };
  addTalk(job, job.doneBy, note, "follow");
  return note;
}

function applyStatusRules(job, workspace) {
  const shop = (mem.workspaces || []).find((w) => w && w.slug === workspace) || null;
  if (shop) applyRules(job, shop, "status");
  return job;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();

  if (req.method !== "POST") {
    return res.status(200).json({
      ok: true,
      use: "POST",
      events: ["capture", "update", "do", "done", "hand", "collect", "kill", "mail"],
      inbound: "POST to /api/hook with to: local@account.aia — Drop / Capture on that desk. Automations can trigger from inbound.",
      send: "hold",
      mx: mail.statusOf(),
      note: "Write back done when the work finished off the desk. Write back hand when a person still has to finish it. Owner still owns Stop. .aia identities work on the desk now. Internet mail when the MX pipe is connected."
    });
  }

  const body = await readBody(req);
  if (mail.wantsSend(body)) {
    return res.status(409).json(mail.sendHold());
  }
  const toAddr = body.to || body.recipient || body.address || req.query.to || "";
  const identity = toAddr ? mail.findByAddress(toAddr) : null;
  if (toAddr && /\.aia$/i.test(String(toAddr).trim()) && !identity) {
    const parsed = mail.parseAddress(toAddr);
    return res.status(404).json({
      ok: false,
      error: parsed.ok ? ("No .aia email identity for " + parsed.address + ".") : parsed.error,
      mx: mail.statusOf()
    });
  }
  const workspace = slugify(req.headers["x-workspace"] || req.query.workspace || body.workspace || (identity && identity.workspace) || "");
  if (!workspace) return res.status(400).json({ ok: false, error: "Name the desk or send to a .aia email." });
  const event = identity ? "capture" : eventOf(body);
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
    if (deskClosed(shop)) {
      return res.status(409).json({ ok: false, error: deskClosedMessage(shop), closed: true });
    }
    const inbound = identity ? mail.inboundPayload(body, identity) : {};
    job = makeCapturedJob(workspace, shop, Object.assign({}, body, inbound, {
      title: inbound.title || title,
      why: inbound.why || body.why || "In from a pipe.",
      from: inbound.from || body.from || body.provider || "webhook",
      notes: inbound.notes || body.notes || body.text || "",
      lane: inbound.lane || body.lane || (identity ? "in" : "ext"),
      kind: inbound.kind || body.kind
    }));
    job.log = [identity ? ("Mail · " + identity.address) : "Pipe capture"];
    job.provider = (identity && "aia-mail") || body.provider || job.provider || "webhook";
    if (identity) {
      job.aiaMail = identity.address;
      job.to = identity.address;
      job.kind = job.kind || "email";
      job.custom = Object.assign({}, job.custom || {}, inbound.custom || {});
      if (identity.aiName) job.assignee = identity.aiName;
    }
    qualifyJob(job, shop);
    try {
      const { grokRecommend } = require("./_grok");
      const grok = await grokRecommend(job, shop, workspace);
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
    log("Pipe", "In · " + job.title, "Waiting", workspace);
    await save();
    return res.status(201).json({ ok: true, event: "capture", job });
  }

  if (event === "kill") {
    job.status = "killed";
    job.awaiting = null;
    job.offDesk = false;
    job.killReason = body.reason || body.killReason || "Pipe said stop";
    job.whoTapped = body.who || body.provider || "webhook";
    job.log = (job.log || []).concat(["Pipe stop"]);
    log("Pipe", "Stop · " + job.title, "Stopped", workspace);
    await save();
    return res.status(200).json({ ok: true, event: "kill", job });
  }

  if (event === "hand") {
    const note = String(body.notes || body.text || body.reason || "Pipe could not finish. Needs a hand.").trim();
    job.status = "exception";
    job.awaiting = null;
    job.offDesk = false;
    job.waitingOn = "owner";
    job.why = note;
    job.next = "Do this by hand. Then tap Done off desk.";
    job.rail = "hand";
    job.step = "Do";
    job.whoTapped = body.who || body.provider || "webhook";
    addTalk(job, job.whoTapped, note, "ask");
    job.log = (job.log || []).concat(["Pipe · needs a hand"]);
    log("Pipe", "Hand · " + job.title, "Waiting", workspace);
    await save();
    return res.status(200).json({ ok: true, event: "hand", job });
  }

  if (event === "done") {
    finishDone(job, body, body.how || "pipe");
    applyStatusRules(job, workspace);
    job.log = (job.log || []).concat(["Pipe wrote back · done"]);
    log("Pipe", "Done · " + job.title, "OK", workspace);
    await save();
    return res.status(200).json({ ok: true, event: "done", job });
  }

  if (event === "collect") {
    const amount = Number(body.amount || job.amount || job.ask || 0);
    finishDone(job, body, "pipe");
    job.step = "Collect";
    job.amount = amount || job.amount;
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
  if (String(body.event || "").toLowerCase() === "do") {
    job.status = "out";
    job.offDesk = true;
    job.awaiting = "writeback";
    job.next = "Off the desk. Waiting on write-back.";
  }
  job.log = (job.log || []).concat(["Pipe update"]);
  addTalk(job, body.who || body.provider || "webhook", body.notes || body.text || "Pipe update.", "note");
  log("Pipe", "Update · " + job.title, "OK", workspace);
  await save();
  return res.status(200).json({ ok: true, event: "update", job });
};
