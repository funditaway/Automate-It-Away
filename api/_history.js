const DESK_FORMAT = "aia.desk.v1";

function laneOf(job) {
  if (!job) return "doing";
  const st = String(job.status || "");
  const wait = String(job.waitingOn || "").toLowerCase();
  if (st === "shipped") return "done";
  if (st === "killed") return "stopped";
  if (st === "out" || job.offDesk || job.awaiting) return "ext";
  if (job.expired || job.late) return "need";
  if (st === "held" || st === "exception" || job.rail === "hand" || wait === "owner") return "need";
  if (wait && wait !== "owner") return "wait";
  return "doing";
}

function laneLabel(lane) {
  return ({
    need: "Need you",
    doing: "In progress",
    wait: "Waiting on",
    ext: "Ext",
    done: "Done",
    stopped: "Stopped",
    desk: "Desk"
  })[String(lane || "")] || "In progress";
}

function historyItem(job, desk) {
  if (!job) return null;
  const lane = laneOf(job);
  return {
    kind: "job",
    id: job.id,
    t: job.doneAt || job.updatedAt || job.createdAt || job.t || null,
    lane,
    label: laneLabel(lane),
    slug: job.workspace || (desk && desk.slug),
    desk: (desk && (desk.biz || desk.name || desk.slug)) || job.workspace,
    title: job.title || "Card",
    status: job.status || "",
    step: job.step || "",
    waitingOn: job.waitingOn || "",
    who: job.whoTapped || job.doneBy || job.from || "",
    href: "/desk"
  };
}

function jobVal(job, key) {
  if (!job) return "";
  const custom = job.custom && typeof job.custom === "object" ? job.custom : {};
  const auto = custom.automation && typeof custom.automation === "object" ? custom.automation : {};
  return job[key] || custom[key] || auto[key] || "";
}

function phoneOf(job) {
  return String(jobVal(job, "phone") || jobVal(job, "tel") || "").trim();
}

function emailOf(job) {
  return String(jobVal(job, "email") || jobVal(job, "mail") || "").trim();
}

function whenOf(job) {
  return String(
    job.dueAt || job.due || job.followWhen || job.when || job.timing || job.followAt ||
    jobVal(job, "when") || jobVal(job, "timing") || jobVal(job, "due") || ""
  ).trim();
}

function outcomeOf(job) {
  return String((job && (job.outcome || jobVal(job, "outcome"))) || "").toLowerCase();
}

function isPriorityJob(job) {
  if (!job) return false;
  const st = String(job.status || "");
  if (st === "shipped" || st === "killed") return false;
  return !!(job.priority || job.cap);
}

function isDecideJob(job) {
  if (!job) return false;
  const st = String(job.status || "");
  if (st === "killed" || st === "shipped" || job.carried) return false;
  if (job.waitingOn === "info") return false;
  if (/Need .+ before/i.test(String(job.why || ""))) return false;
  return st === "waiting" || st === "held";
}

function missingOf(job) {
  const miss = [];
  if (!job) return miss;
  const kind = String(job.kind || "").toLowerCase();
  const outcome = outcomeOf(job);
  const wantCall = outcome === "call" || kind === "call" || kind === "follow" || /missed call|call them/i.test(String(job.title || ""));
  const wantText = outcome === "text" || kind === "message";
  const wantMail = outcome === "email" || kind === "email";
  const wantWhen = outcome === "book" || /book|ride|pickup|delivery|school|reminder|package|appointment/i.test(kind + " " + outcome);
  if ((wantCall || wantText) && !phoneOf(job)) miss.push("phone");
  if (wantMail && !emailOf(job)) miss.push("email");
  if (wantWhen && !whenOf(job)) miss.push("when");
  if (!String(job.title || job.notes || "").trim()) miss.push("what");
  if ((kind === "list" || kind === "photo" || outcome === "list") && !job.photoUrl && !(job.files && job.files.length)) miss.push("photo");
  if ((outcome === "quote" || kind === "quote" || kind === "estimate" || kind === "invoice") && !Number(job.amount || job.ask || 0)) miss.push("amount");
  return miss;
}

function needsOf(job, opts) {
  const staff = !!(opts && opts.staff);
  const actions = [];
  const missing = missingOf(job);
  if (!job) return { line: "", actions, missing, decide: false, priority: false };
  const st = String(job.status || "");
  const done = st === "shipped" || st === "killed";
  const outDesk = st === "out" || job.offDesk || job.awaiting === "writeback";
  const decide = isDecideJob(job);
  const priority = isPriorityJob(job);
  const phone = phoneOf(job);
  const email = emailOf(job);
  const draft = String(job.draft || job.title || "").trim();
  const outcome = outcomeOf(job);
  const kind = String(job.kind || "").toLowerCase();
  const when = whenOf(job);
  function add(id, label, extra) {
    if (actions.some((a) => a.id === id)) return;
    actions.push(Object.assign({ id, label }, extra || {}));
  }
  if (!done) add("open", "Open");
  if (outDesk) {
    add("done", "Done off desk");
    add("handback", "Needs a hand");
  } else if (missing.length) {
    add("fill", "Add " + missing[0]);
    if (missing.indexOf("phone") >= 0) add("ask", "Ask for number");
    else if (missing.indexOf("when") >= 0) add("ask", "Ask for when");
    else add("ask", "Ask for more");
  } else if (decide) {
    add("yes", "Yes");
    if (!staff) add("stop", "Stop");
  }
  if (draft && !missing.length) add("copy", "Copy draft");
  if (phone) add("text", "Text", { href: "sms:" + phone.replace(/[^\d+]/g, "") + (draft ? "?&body=" + encodeURIComponent(draft) : "") });
  else if (draft && wantSend(outcome, kind)) add("text", "Text");
  if (email) add("email", "Email", { href: "mailto:" + email + "?subject=" + encodeURIComponent(job.title || "Desk draft") + "&body=" + encodeURIComponent(draft) });
  else if (draft && (outcome === "email" || emailOf(job))) add("email", "Email");
  if (phone && (outcome === "call" || kind === "call" || kind === "follow")) {
    add("call", "Call", { href: "tel:" + phone.replace(/[^\d+]/g, "") });
  }
  if (when || job.dueAt || outcome === "book" || /school|reminder|pickup|ride|delivery|book/.test(kind)) add("ics", "Phone file");
  if (!done && !job.dueAt && !job.due) add("due", "Set due");
  if (!done && (job.dueAt || job.due)) add("snooze", "Snooze");
  if (!job.draft && !done) add("grok", "Ask Grok");
  if (!job.assignee && !outDesk && !done) add("hand", "Hand to");
  if (job.assignee && !outDesk && !done) add("handback", "Needs a hand");
  if (!done && !outDesk && decide) add("done", "Done by hand");
  if (!done) add(priority ? "uncap" : "cap", priority ? "Off the cap" : "Cap");
  const line = needLine(job, missing, decide, outDesk, priority);
  return { line, actions, missing, decide, priority, outDesk };
}

function wantSend(outcome, kind) {
  return outcome === "text" || outcome === "call" || kind === "message" || kind === "follow" || kind === "call";
}

function needLine(job, missing, decide, outDesk, priority) {
  if (outDesk) return "Off the desk. Confirm done, or tap Needs a hand.";
  if (job && (job.expired || job.late)) {
    try {
      const line = require("./_clock").clockLine(job);
      if (line) return line;
    } catch (e) {}
  }
  if (missing && missing.length) {
    const map = { phone: "a number", email: "an email", when: "a time", what: "what this is", photo: "a photo", amount: "an amount" };
    return "Need " + (map[missing[0]] || missing[0]) + " before this can go.";
  }
  if (job && job.next) return String(job.next);
  if (decide) return "Ready. Yes sends it off this desk. Stop kills it.";
  if (priority) return "On the cap. Do this first.";
  if (job && job.waitingOn === "owner") return "Waiting on the owner.";
  return "Do the next thing this card needs. Not a Yes/No card yet.";
}

function capCard(job, desk) {
  if (!job) return null;
  const needs = needsOf(job);
  return {
    kind: "cap",
    id: job.id,
    t: job.priorityAt || job.updatedAt || job.createdAt || null,
    lane: laneOf(job),
    label: "Cap",
    slug: job.workspace || (desk && desk.slug),
    desk: (desk && (desk.biz || desk.name || desk.slug)) || job.workspace,
    title: job.title || "Card",
    status: job.status || "",
    step: job.step || "",
    waitingOn: job.waitingOn || "",
    next: needs.line,
    needs: needs.actions.map((a) => a.id),
    priority: true,
    href: "/desk"
  };
}

function historyOf(row, jobs, extras) {
  const items = (jobs || []).map((j) => historyItem(j, row)).filter(Boolean);
  (extras || []).forEach((ev) => {
    if (!ev) return;
    items.push({
      kind: "desk",
      id: "ev_" + (ev.t || "") + "_" + (ev.action || ""),
      t: ev.t,
      lane: ev.action === "delete" ? "stopped" : "desk",
      label: ev.action === "delete" ? "Stopped" : "Desk",
      slug: ev.slug || (row && row.slug),
      desk: ev.name || (row && (row.biz || row.slug)),
      title: (ev.action || "desk") + (ev.by ? " · " + ev.by : ""),
      status: ev.action || "",
      step: "",
      waitingOn: "",
      who: ev.by || "",
      href: "/desks"
    });
  });
  items.sort((a, b) => String(b.t || "").localeCompare(String(a.t || "")));
  const counts = { need: 0, doing: 0, wait: 0, ext: 0, done: 0, stopped: 0, all: items.length };
  items.forEach((it) => {
    if (counts[it.lane] != null) counts[it.lane] += 1;
  });
  return { format: DESK_FORMAT, items, counts };
}

function filterHistory(items, query) {
  const q = query || {};
  const lane = String(q.lane || q.filter || "all").toLowerCase();
  const when = String(q.when || "all").toLowerCase();
  const text = String(q.q || q.text || q.query || "").trim().toLowerCase();
  const who = String(q.who || "").trim().toLowerCase();
  const work = String(q.kind || q.work || "").trim().toLowerCase();
  const pipe = String(q.pipe || "").trim().toLowerCase();
  const money = q.money === true || q.money === "1";
  const grok = q.grok === true || q.grok === "1";
  const files = q.files === true || q.files === "1";
  const cap = q.cap === true || q.cap === "1";
  const audit = q.audit === true || q.audit === "1";
  const missing = q.missing === true || q.missing === "1";
  const handed = q.handed === true || q.handed === "1";
  return (items || []).filter((it) => {
    if (!it) return false;
    if (lane && lane !== "all" && it.lane !== lane) return false;
    if (when && when !== "all" && it.when !== when) return false;
    if (text) {
      const hay = [it.title, it.desk, it.result, it.how, it.who, it.work, it.pipe, ((it.hands) || []).join(" ")].join(" ").toLowerCase();
      if (hay.indexOf(text) < 0) return false;
    }
    if (who) {
      const names = ((it.hands || []).concat([it.who])).join(" ").toLowerCase();
      if (names.indexOf(who) < 0) return false;
    }
    if (work && String(it.work || it.pack || "").toLowerCase().indexOf(work) < 0) return false;
    if (pipe && String(it.pipe || "").toLowerCase().indexOf(pipe) < 0) return false;
    if (money && !it.money && !it.amount) return false;
    if (grok && !it.grok) return false;
    if (files && !(it.files && it.files.length)) return false;
    if (cap && !it.priority) return false;
    if (audit && it.kind !== "audit" && it.kind !== "desk") return false;
    if (missing && !(it.missing && it.missing.length)) return false;
    if (handed && !it.handed) return false;
    return true;
  });
}

function facetsOf(items) {
  const who = {}, work = {}, pipes = {}, outcomes = {};
  (items || []).forEach((it) => {
    (it.hands || []).concat(it.who ? [it.who] : []).forEach((n) => {
      const s = String(n || "").trim();
      if (s) who[s] = (who[s] || 0) + 1;
    });
    if (it.work) work[it.work] = (work[it.work] || 0) + 1;
    if (it.pipe) pipes[it.pipe] = (pipes[it.pipe] || 0) + 1;
    if (it.outcome) outcomes[it.outcome] = (outcomes[it.outcome] || 0) + 1;
  });
  function top(map) { return Object.keys(map).sort((a, b) => map[b] - map[a]).slice(0, 16); }
  return { who: top(who), work: top(work), pipes: top(pipes), outcomes: top(outcomes) };
}

module.exports = {
  DESK_FORMAT,
  laneOf,
  laneLabel,
  historyItem,
  historyOf,
  filterHistory,
  facetsOf,
  jobVal,
  phoneOf,
  emailOf,
  whenOf,
  outcomeOf,
  isPriorityJob,
  isDecideJob,
  missingOf,
  needsOf,
  capCard
};
