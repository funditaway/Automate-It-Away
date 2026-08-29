const {
  cors, mem, log, save, ready, catalog, workspaceOf, readBody,
  personOf, isOwner, moneyWaitOf, moneyNeedsOwner, ensureRules
} = require("./_lib");
const { qualifyJob } = require("./engine");

const STEPS = [
  { id: "work", ask: "What do you do by hand every week that should run without you sitting on it?" },
  { id: "in", ask: "How does the work show up? Photo, form, call, email, walk-in — say which." },
  { id: "out", ask: "When it works, what should leave the desk? A listing, a text, a payout, a booking, something else?" },
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
    blocked.push("Money wait stays an owner rule. That does not get automated away.");
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
    why: "Capture lands in your queue. You tap Send or Stop.",
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
    jobId: row.jobId || null,
    who: row.who || null,
    next: row.next || null
  };
}

function titleOf(text) {
  const clean = String(text || "").trim().replace(/\s+/g, " ");
  const cut = clean.split(/[.!?]/)[0] || clean;
  return cut.slice(0, 80) || "Desk note";
}

function amountOf(text) {
  const m = String(text || "").match(/\$\s*(\d+(?:\.\d+)?)/) || String(text || "").match(/\b(\d+(?:\.\d+)?)\s*(?:dollars?|bucks)\b/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

function intentOf(text, hasJob) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return "empty";
  if (hasJob && /^(yes|send it|send|approve|do it|ship it|ok)\b/.test(t)) return "decide-yes";
  if (hasJob && /^(no|stop|kill|cancel|don't|do not)\b/.test(t)) return "decide-no";
  if (/\b(assign|give (this )?to|hand (this )?to|delegate|pass to)\b/.test(t)) return "assign";
  if (hasJob && /\b(draft|write it|list it|make the text|rewrite)\b/.test(t)) return "draft";
  return "create";
}

function whoFor(job, shop, person) {
  const rules = shop ? ensureRules(shop) : [];
  const hold = moneyWaitOf(rules);
  const money = moneyNeedsOwner(job.amount != null ? job.amount : job.ask, hold);
  const hard = job.risk === "legal" || job.risk === "title" || job.risk === "credit" || job.risk === "suitability";
  if (money || hard) {
    return { role: "owner", line: "Waiting on the owner." };
  }
  if (job.assignee) {
    return { role: "assignee", line: "Waiting on " + job.assignee + "." };
  }
  if (person && person.role === "employee") {
    return { role: "helper", line: "You can tap Yes. Only the owner can tap No." };
  }
  return { role: "desk", line: "You tap Yes or No." };
}

function matchPerson(shop, text) {
  const t = String(text || "").toLowerCase();
  const people = (shop && shop.people) || [];
  return people.find((p) => p && p.name && t.indexOf(String(p.name).toLowerCase()) !== -1) || null;
}

function replyFor(job, who) {
  const draft = job.draft ? " Draft: " + job.draft : "";
  return "On the queue as \u201c" + job.title + "\u201d. " + (who && who.line ? who.line : "You tap Yes or No.") + draft;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();
  if (!Array.isArray(mem.intakes)) mem.intakes = [];
  if (!Array.isArray(mem.tickets)) mem.tickets = [];

  const workspace = workspaceOf(req);
  const { workspace: shop, person } = personOf(req, workspace);

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
        { from: "desk", text: "Say the work. It lands on this desk\u2019s queue. You still tap Yes or No." }
      ],
      createdAt: new Date().toISOString()
    };
    mem.intakes.unshift(row);
    log("Intake", "Chat opened", "OK", workspace);
    await save();
    return res.status(201).json({ ok: true, intake: publicIntake(row) });
  }

  if (action === "do") {
    const text = String(body.text || "").trim();
    if (!text) return res.status(400).json({ error: "Type the work." });
    if (!shop) return res.status(404).json({ ok: false, error: "Open a desk first." });

    let row = body.id ? mem.intakes.find((i) => i.id === body.id && i.workspace === workspace) : null;
    if (!row) {
      row = {
        id: "in_" + Date.now().toString(36),
        workspace,
        step: 0,
        answers: {},
        messages: [{ from: "desk", text: "Say the work. It lands on this desk\u2019s queue. You still tap Yes or No." }],
        createdAt: new Date().toISOString()
      };
      mem.intakes.unshift(row);
    }

    row.messages.push({ from: "you", text });
    const job = row.jobId ? mem.jobs.find((j) => j.id === row.jobId && j.workspace === workspace) : null;
    const kind = intentOf(text, !!job);

    if (kind === "decide-yes" || kind === "decide-no") {
      row.messages.push({
        from: "desk",
        text: kind === "decide-no"
          ? "Stop is an owner tap on the queue. Open the card and press No."
          : "Yes is a tap on the queue. Chat does not send money or a public message."
      });
      row.next = "/desk";
      await save();
      return res.status(200).json({ ok: true, intake: publicIntake(row), job: job || null });
    }

    if (kind === "assign" && job) {
      const whoPerson = matchPerson(shop, text);
      if (!whoPerson) {
        row.messages.push({ from: "desk", text: "Name someone already on People." });
        await save();
        return res.status(200).json({ ok: true, intake: publicIntake(row), job });
      }
      job.assignee = whoPerson.name;
      job.waitingOn = whoPerson.role === "owner" ? "owner" : "helper";
      job.next = "Waiting on " + whoPerson.name + ".";
      job.log = (job.log || []).concat(["Assigned \u00b7 " + whoPerson.name]);
      const who = whoFor(job, shop, person);
      row.who = who;
      row.messages.push({ from: "desk", text: "Handed to " + whoPerson.name + ". Still needs a Yes or No tap." });
      log("Desk", "Assigned \u00b7 " + job.title + " \u00b7 " + whoPerson.name, "Waiting", workspace);
      await save();
      return res.status(200).json({ ok: true, intake: publicIntake(row), job });
    }

    if (kind === "draft" && job) {
      qualifyJob(job, shop);
      const who = whoFor(job, shop, person);
      row.who = who;
      row.messages.push({ from: "desk", text: replyFor(job, who) });
      log("Desk", "Draft \u00b7 " + job.title, "Waiting", workspace);
      await save();
      return res.status(200).json({ ok: true, intake: publicIntake(row), job });
    }

    const amount = amountOf(text);
    const created = {
      id: "job_" + Date.now().toString(36),
      workspace,
      title: titleOf(text),
      notes: text,
      amount,
      why: "From desk talk. Human before send.",
      status: "exception",
      step: "Qualify",
      createdAt: new Date().toISOString(),
      log: ["Captured from desk talk"],
      from: "desk-chat",
      whoTapped: (person && person.name) || "desk"
    };
    qualifyJob(created, shop);
    mem.jobs.unshift(created);
    row.jobId = created.id;
    row.answers.work = text;
    const who = whoFor(created, shop, person);
    row.who = who;
    row.next = "/desk";
    row.verdict = { can: true, title: created.title, why: who.line };
    row.messages.push({ from: "desk", text: replyFor(created, who) });
    log("Intake", "Talk \u00b7 " + created.title, "Waiting", workspace);
    await save();
    return res.status(201).json({ ok: true, intake: publicIntake(row), job: created });
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
        text: v.why + (pipeLine ? " Connections: " + pipeLine + "." : "") + " Open your desk and the first job lands in the queue."
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
      why: "From desk chat. Guardrail: human before send.",
      status: "exception",
      step: "Qualify",
      createdAt: new Date().toISOString(),
      log: ["Captured from desk chat"],
      notes: Object.values(row.answers).join(" \u00b7 "),
      from: "desk-chat",
      pack: /school|home|family|oil change|grocery|chore|house/.test(blob) ? "home" : undefined
    };
    qualifyJob(job, shop);
    mem.jobs.unshift(job);
    row.jobId = job.id;
    row.messages.push({ from: "desk", text: "Job is in the queue as \u201c" + title + "\u201d. Open the desk to Send or Stop." });
    log("Intake", "Setup \u00b7 " + title, "Waiting", workspace);
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
    log("Intake", "Request \u00b7 " + ticket.id, "Waiting", workspace);
    await save();
    return res.status(201).json({ ok: true, intake: publicIntake(row), ticket });
  }

  return res.status(400).json({ error: "action must be start, say, do, setup, or request" });
};
