// Desk money-wait rules win. No canned $250 on an empty-rules desk.
// $250 stays a catalog Ask-me line, shown in preview metadata only.
const PLATFORM_HOLD = null;
const ASK_ME_FLOOR = 250;

function moneyHold(moneyWaitOf, rules) {
  const n = typeof moneyWaitOf === "function" ? moneyWaitOf(rules) : moneyWaitOf;
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Number(n);
}

module.exports = { PLATFORM_HOLD, ASK_ME_FLOOR, moneyHold };
