const perms = require("../api/_permissions");
const roles = require("../api/_roles");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

const helper = { id: "p_help", name: "Lee", role: "employee", kind: "helper", status: "approved" };
const agent = { id: "p_agent", name: "Doer", role: "agent", kind: "agent", crew: "Doer", status: "approved" };
const owner = { id: "p_own", name: "James", role: "owner", kind: "owner", status: "approved" };

const hHold = perms.gateOverride(helper, true, { amount: 251, confirm: true, reason: "Already paid cash." });
if (hHold.ok || hHold.status !== 403) fail("helper HOLD override must 403");
else pass("1 helper cannot pass a HOLD");

const oNoReason = perms.gateOverride(owner, true, { amount: 251, confirm: true, reason: "" });
if (oNoReason.ok || oNoReason.status !== 409) fail("owner HOLD without reason must 409");
else pass("2 owner HOLD with no reason is 409");

const oNoTap = perms.gateOverride(owner, true, { amount: 251, confirm: false, reason: "Already paid cash." });
if (oNoTap.ok || oNoTap.status !== 409) fail("owner HOLD without confirm must 409");
else pass("3 owner HOLD without second tap is 409");

const oPass = perms.gateOverride(owner, true, { amount: 251, confirm: true, reason: "Already paid cash." });
if (!oPass.ok || oPass.rail !== "owner-override" || oPass.charged !== false || oPass.live !== false) {
  fail("owner HOLD with confirm+reason should pass as owner-override, no charge");
} else pass("4 owner HOLD with confirm + reason is owner-override, charged false");

const aHold = perms.gateOverride(agent, true, { amount: 20, confirm: true, reason: "Already paid cash." });
if (aHold.ok || aHold.status !== 403) fail("agent HOLD override must 403");
else pass("5 agent cannot pass a HOLD");

const desk = { people: [{ id: "p_sam", name: "Sam", role: "employee", kind: "helper", status: "approved" }] };
const sticky = perms.setSeatCan(desk, "p_sam", { edit: true, explore: true });
if (!sticky.ok || !desk.people[0].canSticky || !desk.people[0].can.edit) fail("sticky edit should save");
else pass("6 sticky Edit saves on the seat");

const flipped = perms.applyKind(desk.people[0], "family", { sticky: true });
if (!flipped.ok || desk.people[0].kind !== "family" || !desk.people[0].can.edit) {
  fail("sticky Edit should survive Family flip, got " + JSON.stringify(desk.people[0].can));
} else pass("7 sticky Edit survives Family flip");

const resetSeat = { id: "p_reset", name: "Pat", role: "employee", kind: "helper", can: { edit: true }, canSticky: false, status: "approved" };
const reset = perms.applyKind(resetSeat, "family");
if (!reset.ok || resetSeat.canSticky || resetSeat.can.edit) fail("kind change without sticky should reset to catalog");
else pass("8 kind change without sticky resets to catalog");

const promote = perms.applyKind({ id: "p_x", role: "employee", kind: "helper" }, "owner");
if (promote.ok) fail("no seat can be permitted to owner");
else pass("9 no seat can be permitted to owner");

const moneyDesk = { people: [{ id: "p_help2", name: "Lee", role: "employee", kind: "helper", status: "approved" }] };
const money = perms.setSeatCan(moneyDesk, "p_help2", { money: true, stop: true, send: true });
const can = moneyDesk.people[0].can;
if (can.money || can.stop) fail("helper money/stop must strip");
else if (!money.ok || !can.send) fail("helper send should stay if granted");
else pass("10 helper money and stop strip; send can stay");

const agentCan = roles.stripHard(roles.resolveCan("agent", "Doer", "approved"), agent);
if (agentCan.send || agentCan.stop || agentCan.money) fail("agent can must never send/stop/money");
else pass("11 agent never send, stop, or money");

const card = perms.publicPerson({
  id: "p_sam",
  name: "Sam",
  role: "employee",
  kind: "helper",
  handle: "sam",
  xHandle: "samx",
  ext: 2,
  walletId: "wal_desk_psam",
  can: { edit: true, queue: true },
  canSticky: true,
  status: "approved"
});
if (!card.can || card.can.money || !card.never || card.never.indexOf("money") < 0) fail("publicPerson can/never");
else if (!card.money || card.money.charged !== false || card.ext !== 2 || card.at !== "@sam" || card.xHandle !== "samx") {
  fail("publicPerson money/ext/handle " + JSON.stringify(card));
} else pass("12 publicPerson shows can, never, money, Ext, X handle");

if (process.exitCode) {
  console.error("check-permissions failed");
  process.exit(1);
}
console.log("check-permissions passed");
