const { catalog, mem, ensureRules, moneyWaitOf, moneyNeedsOwner } = require("./_lib");

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
  const modelText = String(model || "").toLowerCase();
  if (/home|family|house/.test(modelText)) return "home";
  if (/consign|resale/.test(modelText)) return "consign";
  if (/vita|life insurance/.test(modelText)) return "vita";
  if (/fund|lend/.test(modelText)) return "fund";
  if (/land|acre/.test(modelText)) return "land";
  return "desk";
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
  if (/today|tonight|now|after school|on the way/.test(text)) risk = "same-day";
  if (/post it|facebook|group|public/.test(text) && /kid|child|son|daughter|school/.test(text)) {
    risk = "legal";
  }
  job.draft = job.draft || draftHome(job);
  job.artifact = job.artifact || (/form|permission|slip/.test(text) ? "form note" : "reminder");
  job.provider = job.provider || "calendar";
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
    next = "Add the missing bit, then Send or Stop.";
  } else {
    why = "House draft is ready. Tap Send or Stop.";
    next = "Send the reminder or form note. Stop if it is already done.";
  }
  return { risk, why, next };
}

function shopOf(job) {
  return ((mem.workspaces || []).find((w) => w.slug === job.workspace) || null);
}

function shopMissing(job, shop) {
  const fields = shop && Array.isArray(shop.fields) ? shop.fields : [];
  const miss = [];
  fields.forEach((f) => {
    if (!f || !f.key) return;
    const fromJob = job[f.key];
    const fromCustom = job.custom && job.custom[f.key];
    const val = fromJob != null && fromJob !== "" ? fromJob : fromCustom;
    if (val == null || val === "") miss.push(f.label || f.key);
  });
  return miss;
}

function qualifyJob(job, shopOrModel) {
  const shop = shopOrModel && typeof shopOrModel === "object" ? shopOrModel : shopOf(job);
  const model = shop ? shop.model : shopOrModel;
  const pack = detectPack(job, model);
  const text = blob(job);
  const missing = shopMissing(job, shop);
  let risk = job.risk && job.risk !== "none" ? job.risk : "none";
  let why = "";
  let next = "Send or Stop.";

  if (pack === "home") {
    const home = qualifyHome(job, text, missing);
    risk = home.risk;
    why = home.why;
    next = home.next;
  } else if (pack === "consign") {
    if (job.titlePresent === "no") risk = "title";
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
  const holdAt = shop ? moneyWaitOf(ensureRules(shop)) : null;
  if (moneyNeedsOwner(amount, holdAt)) {
    why = (why ? why + " " : "") + "Waiting on the owner.";
    next = "Waiting on the owner.";
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
  const rail = risk === "legal" || risk === "title" || moneyNeedsOwner(amount, holdAt);
  job.status = rail || missing.length ? "exception" : "waiting";
  job.log = (job.log || []).concat(["Qualified · " + pack + " · " + risk + (missing.length ? " · missing " + missing.join(",") : "")]);
  recommend(job, missing, shop);
  return job;
}

function recommend(job, missing, shop) {
  const recs = [];
  if (missing && missing.length) recs.push({ kind: "ask", text: "Need " + missing.join(" and ") + " before Send." });
  if (job.draft) recs.push({ kind: "draft", text: job.draft });
  if (job.next) recs.push({ kind: "next", text: job.next });
  if (job.pack === "home") {
    job.provider = job.provider || "calendar";
    job.artifact = job.artifact || "calendar";
    recs.push({ kind: "next", text: "Phone calendar file is ready when you tap Send. Google stays off until the key is on the box." });
  }
  if (job.risk === "legal") recs.push({ kind: "hold", text: "Do not name a child or school on a public post." });
  if (job.risk === "same-day") recs.push({ kind: "hold", text: "Confirm this does not bump something already on the week." });
  const holdAt = shop ? moneyWaitOf(ensureRules(shop)) : null;
  if (moneyNeedsOwner(moneyOf(job), holdAt)) recs.push({ kind: "hold", text: "Waiting on the owner." });
  const row = shop && typeof shop === "object" ? shop : shopOf(job);
  if (row) {
    ensureRules(row);
    (row.rules || []).forEach((r) => {
      if (r && r.text) recs.push({ kind: "rule", text: r.text });
    });
  }
  if (!recs.length) recs.push({ kind: "next", text: "Draft is ready. Tap Send or Stop." });
  job.recs = recs.slice(0, 8);
  job.promptVersion = job.promptVersion || "desk-rules-2";
  return job;
}

function pad(n) { return String(n).padStart(2, "0"); }
function stamp(d) {
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z";
}
function whenOf(job) {
  const raw = String((job.timing || (job.custom && job.custom.when) || "")).trim();
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(9);
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  const days = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const word = raw.toLowerCase();
  if (/tomorrow/.test(word)) d.setDate(d.getDate() + 1);
  else if (days[word] != null) {
    const add = (days[word] - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + add);
  }
  return d;
}
function icsEscape(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
function icsOf(job) {
  const start = whenOf(job);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const title = icsEscape(job.title || "Desk item");
  const desc = icsEscape(job.draft || job.why || "");
  return ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Automate It Away//Desk//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH","BEGIN:VEVENT","UID:" + (job.id || "job") + "@automateitaway.com","DTSTAMP:" + stamp(new Date()),"DTSTART:" + stamp(start),"DTEND:" + stamp(end),"SUMMARY:" + title,"DESCRIPTION:" + desc,"END:VEVENT","END:VCALENDAR"].join("\r\n");
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

module.exports = { qualifyJob, followJob, runWorkspace, detectPack, recommend, icsOf, whenOf, MONEY_HOLD, PACKS };
