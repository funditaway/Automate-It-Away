const { cors, mem, log, save, ready, catalog, workspaceOf, readBody } = require("./_lib");
const { qualifyJob } = require("./engine");

const STEPS = [
  { id: "work", ask: "What do you do by hand every week that should run without you sitting on it?" },
  { id: "in", ask: "How does the work show up? Photo, form, call, email, walk-in — say which." },
  { id: "out", ask: "When it works, what should leave the shop? A listing, a text, a payout, a booking, something else?" },
  { id: "tools", ask: "What do you already use? Square, eBay, calendar, texting, your own website, nothing yet." }
];

function pipesNeeded(text) {
  const t = String(text || "").toLowerCase();
  const need = [];
  if (/square|payout|pay the seller|deposit/.test(t)) need.push("square");
  if (/ebay|marketplace|list it|listing/.test(t)) need.push("ebay");
  if (/calendar|book|appoint|schedule/.test(t)) need.push("calendar");
  if (/text|sms|missed call/.test(t)) need.push("sms");
  if (/consign|resale|dresser|photo/.test(t)) need.push("consign");
  if (/website|form|widget|webhook/.test(t)) need.push("webhook");
  if (/whatnot/.test(t)) need.push("whatnot");
  if (!need.length) need.push("webhook");
  return [...new Set(need)];
}

function verdict(answers) {
  const blob = Object.values(answers || {}).join(" ").toLowerCase();
  const need = pipesNeeded(blob);
  const cat = catalog();
  const blocked = [];
  const ready = [];
  const held = [];

  if (/bind|carrier|illustration|policy issue/.test(blob)) {
    blocked.push("We do not bind coverage or send a carrier app from this desk.");
  }
  if (/no one tap|fully automatic money|send money without me|auto pay over/.test(blob)) {
    blocked.push("Money over $250 always waits on the owner. That does not get automated away.");
  }
  if (need.includes("whatnot")) blocked.push("Whatnot stays off.");

  const known =
    /photo|consign|resale|list|ebay|payout|call|text|book|calendar|form|widget|website|queue|invoice|pickup|home|family|school|oil change|grocery|chore|reminder|house list/.test(blob);

  need.forEach((id) => {
    if (id === "whatnot") return;
    const row = cat.find((p) => p.id === id);
    if (!row || row.status === "down") blocked.push((row && row.label) || id);
    else if (row.status === "live") ready.push(row.label);
    else held.push(row.label + " — connect it on Pipes when you have keys");
  });

  if (!known && !blocked.length) {
    return {
      can: false,
      title: "Needs a look",
      why: "That job is not one of the five steps we already run (capture, qualify, do, collect, follow).",
      need, ready, held, next: "request"
    };
  }

  if (blocked.length) {
    return {
      can: false,
      title: "Not on this desk yet",
      why: blocked.join(" "),
      need, ready, held, next: "request"
    };
  }

  return {
    can: true,
    title: "We can run this",
    why: "Capture lands in your queue. You tap Send or Stop. Over $250 waits on the owner.",
    need, ready, held, next: "setup"
  };
}

function publicIntake(row) {
  return {
    id: row.id,
    step: row.step,
    answers: row.answers,
    messages: row.messages,
    verdict: row.verdict || null,
    requestId: row.requestId || null,
    jobId: row.jobId || null
  };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();
  if (!Array.isArray(mem.intakes)) mem.intakes = [];
  if (!Array.isArray(mem.tickets)) mem.tickets = [];

  const workspace = workspaceOf(req);

  if (req.method === "GET") {
    const id = req.query.id;
    if (id) {
      const row = mem.intakes.find((i) => i.id === id);
      if (!row) return res.status(404).json({ error: "No chat" });
      return res.status(200).json({ ok: true, intake: publicIntake(row), catalog: catalog() });
    }
    return res.status(200).json({
      ok: true,
      intakes: mem.intakes.filter((i) => i.workspace === workspace).slice(0, 20).map(publicIntake)
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Use GET or POST" });

  const body = await readBody(req);
  const action = body.action || "start";

  if (action === "start") {
    const row = {
      id: "in_" + Date.now().toString(36),
      workspace,
      step: 0,
      answers: {},
      messages: [
        { from: "desk", text: "Tell the desk what should run without you sitting on it." },
        { from: "desk", text: STEPS[0].ask }
      ],
      createdAt: new Date().toISOString()
    };
    mem.intakes.unshift(row);
    log("Intake", "Chat opened", "OK", workspace);
    await save();
    return res.status(201).json({ ok: true, intake: publicIntake(row) });
  }

  const row = mem.intakes.find((i) => i.id === body.id);
  if (!row) return res.status(404).json({ error: "No chat" });

  if (action === "say") {
    const text = String(body.text || "").trim();
    if (!text) return res.status(400).json({ error: "Type what you need automated." });
    const q = STEPS[row.step] || STEPS[STEPS.length - 1];
    row.answers[q.id] = text;
    row.messages.push({ from: "you", text });
    row.step += 1;
    if (row.step < STEPS.length) {
      row.messages.push({ from: "desk", text: STEPS[row.step].ask });
      await save();
      return res.status(200).json({ ok: true, intake: publicIntake(row) });
    }
    row.verdict = verdict(row.answers);
    const v = row.verdict;
    const pipeLine = (v.held || []).concat(v.ready || []).join(". ");
    if (v.can) {
      row.messages.push({
        from: "desk",
        text: v.why + (pipeLine ? " Connections: " + pipeLine + "." : "") + " Open your shop and the first job lands in the queue."
      });
    } else {
      row.messages.push({
        from: "desk",
        text: v.why + " We cannot turn that on from this chat. Send a request and we will look at it."
      });
    }
    await save();
    return res.status(200).json({ ok: true, intake: publicIntake(row) });
  }

  if (action === "setup") {
    if (!row.verdict || !row.verdict.can) {
      return res.status(409).json({ error: "This one is a request, not a live job.", intake: publicIntake(row) });
    }
    const title = row.answers.work || "Automation from desk chat";
    const blob = String(title + " " + Object.values(row.answers).join(" ")).toLowerCase();
    const job = {
      id: "job_" + Date.now().toString(36),
      workspace,
      title,
      why: "From desk chat. Guardrail: human before send. Over $250 waits on the owner.",
      status: "exception",
      step: "Qualify",
      createdAt: new Date().toISOString(),
      log: ["Captured from desk chat"],
      notes: Object.values(row.answers).join(" · "),
      from: "desk-chat",
      pack: /school|home|family|oil change|grocery|chore|house/.test(blob) ? "home" : undefined
    };
    qualifyJob(job);
    mem.jobs.unshift(job);
    row.jobId = job.id;
    row.messages.push({ from: "desk", text: "Job is in the queue as \u201c" + title + "\u201d. Open the desk to Send or Stop." });
    log("Intake", "Setup · " + title, "Waiting", workspace);
    await save();
    return res.status(201).json({ ok: true, intake: publicIntake(row), job });
  }

  if (action === "request") {
    const ticket = {
      id: "t_" + Date.now().toString(36),
      workspace,
      title: "Automation request",
      body: Object.values(row.answers).join("\n"),
      from: body.name || "shop",
      email: body.email || "",
      role: "request",
      status: "open",
      createdAt: new Date().toISOString()
    };
    mem.tickets.unshift(ticket);
    row.requestId = ticket.id;
    row.messages.push({
      from: "desk",
      text: "Request sent to Automate It Away. Ticket " + ticket.id + ". We will not pretend it is live."
    });
    log("Intake", "Request · " + ticket.id, "Waiting", workspace);
    await save();
    return res.status(201).json({ ok: true, intake: publicIntake(row), ticket });
  }

  return res.status(400).json({ error: "action must be start, say, setup, or request" });
};
