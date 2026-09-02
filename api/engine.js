const { catalog, mem, ensureRules, moneyWaitOf, moneyNeedsOwner, matchingRules, ruleWantsOwner, ruleWantsStop, ruleWhy } = require("./_lib");

const MONEY_HOLD = null;
const PACKS = ["home", "consign", "vita", "fund", "land"];

function blob(job) {
  return [job.title, job.notes, job.why, job.kind, job.from, job.contactName].filter(Boolean).join(" ").toLowerCase();
}
