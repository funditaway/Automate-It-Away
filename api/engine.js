const { catalog, mem, ensureRules, moneyWaitOf, moneyNeedsOwner, matchingRules, ruleWantsOwner, ruleWantsStop, ruleWhy } = require("./_lib");

const MONEY_HOLD = null;
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
