const hand = require("./_handoff");
const { ensureRules, moneyWaitOf, moneyNeedsOwner } = require("./_lib");
const clock = require("./_clock");

const MONEY_HOLD = null;
const PACKS = ["home", "consign", "vita", "fund", "land"];

function moneyOf(job) {
  const n = Number(job && (job.amount != null ? job.amount : job.ask));
  return Number.isFinite(n) ? n : null;
}

function qualifyJob(job, shop) {
  if (!job) return job;
  if (!job.status || job.status === "exception") job.status = "waiting";
  if (!job.step) job.step = "Qualify";
  clock.applyClock(job, job);
  clock.tickClock(job);
  const rules = shop ? ensureRules(shop) : [];
  const holdAt = shop ? moneyWaitOf(rules) : MONEY_HOLD;
  if (moneyNeedsOwner(moneyOf(job), holdAt)) {
    job.waitingOn = "owner";
    job.next = "Waiting on the owner.";
  }
  if (!job.next) {
    const line = clock.clockLine(job);
    job.next = line || "On the queue. You tap Yes or No.";
  }
  job.crew = hand.crewOf(job, shop);
  return job;
}

function followJob(job) { return job; }

function runWorkspace(jobs, now) {
  let clocked = 0;
  let qualified = 0;
  (jobs || []).forEach((job) => {
    if (!job || job.status === "killed" || job.status === "shipped") {
      if (clock.tickClock(job, now)) clocked += 1;
      return;
    }
    if (clock.tickClock(job, now)) clocked += 1;
    if (job.status === "exception" && !job.qualifiedAt) {
      qualifyJob(job);
      qualified += 1;
    }
  });
  return { ok: true, qualified, followed: 0, clocked, touched: qualified + clocked };
}

function detectPack() { return "home"; }
function recommend() { return []; }

function whenOf(job) {
  const parsed = clock.parseClock(clock.dueSource(job) || (job && job.timing) || "", Date.now());
  return parsed || "";
}

function pad(n) { return String(n).padStart(2, "0"); }
function stamp(d) {
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z";
}
function icsEscape(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
function icsOf(job) {
  const start = clock.parseClock(clock.dueSource(job) || (job && job.timing) || "", Date.now()) || new Date();
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const title = icsEscape((job && job.title) || "Desk item");
  const desc = icsEscape((job && (job.draft || job.why)) || "");
  return ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Automate It Away//Desk//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH","BEGIN:VEVENT","UID:" + ((job && job.id) || "job") + "@automateitaway.com","DTSTAMP:" + stamp(new Date()),"DTSTART:" + stamp(start),"DTEND:" + stamp(end),"SUMMARY:" + title,"DESCRIPTION:" + desc,"END:VEVENT","END:VCALENDAR"].join("\r\n");
}

function markFlow(job, step) {
  if (!job) return job;
  job.flow = (job.flow || []).concat([{ step: step || job.step, at: new Date().toISOString() }]);
  return job;
}

module.exports = Object.assign({}, hand, {
  qualifyJob,
  followJob,
  runWorkspace,
  detectPack,
  recommend,
  icsOf,
  whenOf,
  markFlow,
  crewOf: hand.crewOf,
  MONEY_HOLD,
  PACKS
});
