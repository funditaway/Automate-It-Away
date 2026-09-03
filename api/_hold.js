const PLATFORM_HOLD = null;

function moneyHold(moneyWaitOf, rules) {
  const n = typeof moneyWaitOf === "function" ? moneyWaitOf(rules) : moneyWaitOf;
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Number(n);
}

module.exports = { PLATFORM_HOLD, moneyHold };
