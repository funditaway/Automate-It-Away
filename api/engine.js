const { catalog } = require("./_lib");

const MONEY_HOLD = 250;
const PACKS = ["home", "consign", "vita", "fund", "land"];

function blob(job) {
  return [job.title, job.notes, job.why, job.kind, job.from, job.contactName].filter(Boolean).join(" ").toLowerCase();
}

function moneyOf(job) {
  const n = Number(job.amount != null ? job.amount : job.ask);
  return Number.isFinite(n) ? n : null;
}

function pipeStatus(id) {
  const row = catalog().find((p) => p.id === id);
  return row ? row.status : "hold";
}

function detectPack(job, model) {
  const given = String(job.pack || "").toLowerCase();
  if (PACKS.includes(given)) return given;
  const text = blob(job) + " " + String(model || "");
  if (/vita|term life|life insurance|illustration|policy app/.test(text) && !/school|permission slip/.test(text)) return "vita";
  if (/hard money|private lend|draw request|investor packet/.test(text)) return "fund";
  if (/\bacre\b|parcel|flood plain|\bplat\b|rural lot/.test(text)) return "land";
  if (/consign|resale|ebay|estate sale|\bdresser\b|\blisting\b|payout to seller/.test(text)) return "consign";
  if (/home|family|household|house desk|school|permission|field trip|homework|oil change|grocery|lawn|dentist|pediatric|neighbor|babysit|chore|pickup kids|practice tonight/.test(text)) return "home";
  if (/home|family|house|life/.test(String(model || "").toLowerCase())) return "home";
  return "consign";
}

function draftConsign(job) {
  const amount = moneyOf(job);
  const low = job.compsLow != null ? Number(job.compsLow) : null;
  const high = job.compsHigh != null ? Number(job.compsHigh) : null;
  const band = Number.isFinite(low) && Number.isFinite(high)
    ? "$" + low + "–$" + high
    : amount != null ? "$" + amount : "price on request";
  const cond = job.condition ? job.condition + ". " : "";
  const title = job.title && job.title !== "Untitled" ? job.title : "Item from the shop";
  return title + ". " + cond + "Ask " + band + ". Draft only — nothing listed until Send.";
}

function draftHome(job) {
  const title = job.title && job.title !== "Untitled" ? job.title : "Thing on the house list";
  const when = job.timing ? " Due " + job.timing + "." : "";
  const who = job.contactName ? " For " + job.contactName + "." : "";
  const pay = moneyOf(job) != null ? " Bill $" + moneyOf(job) + "." : "";
  if (/form|permission|slip|school/.test(blob(job))) {
    return "Form note: " + title + "." + who + when + " Sign and send only after you tap Send.";
  }
  if (/oil change|grocery|lawn|chore|pickup|practice|dentist|doctor/.test(blob(job))) {
    return "Reminder: " + title + "." + who + when + pay + " Nothing goes to anyone until Send.";
  }
  return title + "." + who + when + pay + " Draft only — Send or Stop.";
}

function draftGeneric(job) {
  const title = job.title && job.title !== "Untitled" ? job.title : "Job from the desk";
  return title + (job.notes ? " · " + job.notes : "") + ". Draft only — Send or Stop.";
}

function qualifyHome(job, text, missing) {
  let risk = job.risk && job.risk !== "none" ? job.risk : "none";
  if (!job.timing && !/today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this week|after school/.test(text)) {
    missing.push("when");
  }
  if (/today|tonight|now|after school|on the way/.test(text)) risk = "same-day";
  if (/post it|facebook|group|public/.test(text) && /kid|child|son|daughter|school/.test(text)) {
    risk = "legal";
  }
  job.draft = job.draft || draftHome(job);
  job.artifact = job.artifact || (/form|permission|slip/.test(text) ? "form note" : "reminder");
  job.provider = job.provider || "webhook";
  let why;
  let next;
  if (risk === "legal") {
    why = "This would name a child or school in public. Ask me before Send.";
    next = "Keep it in the house queue, or Stop.";
  } else if (risk === "same-day") {
    why = "Same-day. Confirm it does not bump something already on the week.";
    next = "Owner or helper taps Send if it still fits.";
  } else if (missing.length) {
    why = "Need " + missing.join(" and ") + " before this is ready.";
    next = "Add when, then Send or Stop.";
  } else {
    why = "House draft is ready. Tap Send or Stop.";
    next = "Send the reminder or form note. Stop if it is already done.";
  }
  return { risk, why, next };
}

function qualifyJob(job, model) {
  const pack = detectPack(job, model);
  const text = blob(job);
  const missing = [];
  let risk = job.risk && job.risk !== "none" ? job.risk : "none";
  let why = "";
  let next = "Send or Stop.";

  if (!job.title || job.title === "Untitled" || /^test item/i.test(job.title)) {
    missing.push("what it is");
  }

  if (pack === "home") {
    const home = qualifyHome(job, text, missing);
    risk = home.risk;
    why = home.why;
    next = home.next;
  } else if (pack === "consign") {
    if (!job.condition && !/condition|used|new|good|fair|worn/.test(text)) missing.push("condition");
    if ((/car|truck|boat|trailer|vin|vehicle/.test(text) || job.titlePresent === "no") && job.titlePresent !== "yes") {
      risk = "title";
      missing.push("title");
    }
    const low = job.compsLow != null ? Number(job.compsLow) : null;
    const high = job.compsHigh != null ? Number(job.compsHigh) : null;
    const ask = job.ask != null ? Number(job.ask) : moneyOf(job);
    if (Number.isFinite(low) && Number.isFinite(high) && Number.isFinite(ask)) {
      const mid = (low + high) / 2;
      const band = Math.max(50, Math.abs(high - low) / 2, mid * 0.25);
      if (Math.abs(ask - mid) > band) risk = "price";
    }
    if (!job.draft) job.draft = draftConsign(job);
    job.artifact = job.artifact || "listing draft";
    if (risk === "title") {
      why = "Title is missing. Ask me before this goes out.";
      next = "Owner checks title, then Send or Stop.";
    } else if (risk === "price") {
      why = "Ask sits outside the comps band. Ask me before Send.";
      next = "Owner sets the ask, then Send or Stop.";
    } else if (missing.length) {
      why = "Need " + missing.join(" and ") + " before this is ready.";
      next = "Add the missing bit, then Send or Stop.";
    } else {
      why = "Listing draft is ready. Tap Send or Stop.";
    }
  } else if (pack === "vita") {
    risk = risk === "none" ? "suitability" : risk;
    why = "Illustration and app language wait on the owner.";
    next = "Owner reviews. Do not send a carrier packet from this desk.";
    job.draft = job.draft || draftGeneric(job);
    job.artifact = job.artifact || "needs-review note";
  } else if (pack === "fund") {
    risk = risk === "none" ? "credit" : risk;
    why = "Credit or match decision waits on the owner.";
    next = "Owner decides. Desk will not auto-approve.";
    job.draft = job.draft || draftGeneric(job);
    job.artifact = job.artifact || "needs-review note";
  } else if (pack === "land") {
    if (/flood|wetland|creek|fema/.test(text)) risk = "flood";
    if (/title|easement|access/.test(text)) risk = risk === "flood" ? "flood" : "title";
    why = risk !== "none"
      ? "Flood, access, or title flagged. Ask me before a packet leaves."
      : "Land note drafted. Owner sends.";
    next = "Owner taps Send or Stop.";
    job.draft = job.draft || draftGeneric(job);
    job.artifact = job.artifact || "land note";
  } else {
    job.draft = job.draft || draftGeneric(job);
    why = missing.length
      ? "Need " + missing.join(" and ") + " before this is ready."
      : "Draft is ready. Tap Send or Stop.";
  }

  const amount = moneyOf(job);
  if (amount != null && amount > MONEY_HOLD) {
    why = (why ? why + " " : "") + "Over $250 waits on the owner.";
    next = "Owner releases, or keep waiting.";
  }

  const provider = job.provider || null;
  if (provider === "whatnot") {
    risk = "legal";
    why = "Whatnot stays off.";
    next = "Pick another pipe or Stop.";
  } else if (provider && pipeStatus(provider) === "down") {
    why = (why ? why + " " : "") + "That pipe is down.";
  }

  job.pack = pack;
  job.step = "Do the work";
  job.risk = risk;
  job.why = why;
  job.next = next;
  job.qualifiedAt = new Date().toISOString();
  job.status = "exception";
  job.log = (job.log || []).concat(["Qualified · " + pack + " · " + risk + (missing.length ? " · missing " + missing.join(",") : "")]);
  return job;
}

function followNote(job) {
  if (job.pack === "home") return "Did \u201c" + job.title + "\u201d get done? One nudge. Then it stops.";
  if (job.pack === "vita") return "Still waiting on \u201c" + job.title + "\u201d. Owner sends the next note.";
  return "Check on \u201c" + job.title + "\u201d. Sold, picked up, or still sitting?";
}

function followJob(job, now) {
  if (job.status !== "shipped" || job.followed) return false;
  const age = now - Date.parse(job.createdAt || 0);
  if (age < 60 * 1000) return false;
  job.followed = true;
  job.followNote = job.followNote || followNote(job);
  job.log = (job.log || []).concat(["Follow nudge"]);
  return true;
}

function runWorkspace(jobs, now, model) {
  let qualified = 0;
  let followed = 0;
  jobs.forEach((job) => {
    if (job.status === "killed" || job.status === "held") return;
    const needsQualify = job.status === "exception" && (!job.qualifiedAt || job.step === "Qualify");
    if (needsQualify) {
      qualifyJob(job, model);
      qualified += 1;
    }
    if (followJob(job, now)) followed += 1;
  });
  return { qualified, followed, touched: qualified + followed };
}

module.exports = { qualifyJob, followJob, runWorkspace, detectPack, MONEY_HOLD, PACKS };
