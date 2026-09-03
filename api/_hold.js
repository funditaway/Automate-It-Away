const PLATFORM_HOLD = 250;

function moneyHold(moneyWaitOf, rules) {
  const n = typeof moneyWaitOf === "function" ? moneyWaitOf(rules) : moneyWaitOf;
  if (n == null || !Number.isFinite(Number(n))) return PLATFORM_HOLD;
  return Math.min(Number(n), PLATFORM_HOLD);
}

module.exports = { PLATFORM_HOLD, moneyHold };
