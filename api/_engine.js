const hand = require("./_handoff");
const { ensureRules, moneyWaitOf, moneyNeedsOwner } = require("./_lib");

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
  const rules = shop ? ensureRules(shop) : [];
  const holdAt = shop ? moneyWaitOf(rules) : MONEY_HOLD;
  if (moneyNeedsOwner(moneyOf(job), holdAt)) {
    job.waitingOn = "owner";
    job.next = "Waiting on the owner.";
  }
  if (!job.next) job.next = "On the queue. You tap Yes or No.";
  job.crew = hand.crewOf(job, shop);
  return job;
}

function followJob(job) { return job; }
function runWorkspace() { return { ok: true }; }
function detectPack() { return "home"; }
function recommend() { return []; }
function icsOf() { return ""; }
function whenOf(job) { return (job && (job.followWhen || job.when || job.timing)) || ""; }
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
