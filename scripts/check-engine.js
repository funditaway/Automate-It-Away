const os = require("os");
const path = require("path");
const fs = require("fs");

const store = path.join(os.tmpdir(), "aia-engine-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

const engine = require("../api/_engine");
const {
  qualifyJob, followJob, runWorkspace, detectPack, detectKind, packFace,
  recommend, applyCap, MONEY_HOLD, PACKS, CAP_MAX
} = engine;

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

function blob(job) {
  return JSON.stringify(job || {}).toLowerCase();
}

if (MONEY_HOLD !== null) fail("MONEY_HOLD must stay null, got " + MONEY_HOLD);
else pass("MONEY_HOLD is null");

if (CAP_MAX !== 8) fail("CAP_MAX should be 8");
else pass("CAP_MAX 8");

["home", "consign", "vita", "fund", "land"].forEach((id) => {
  if (PACKS.indexOf(id) < 0) fail("PACKS missing " + id);
});
pass("PACKS has five official engines");

const quoteFace = packFace("vita");
if (quoteFace.id !== "vita" || quoteFace.name !== "Insurance" || quoteFace.family !== "Quote It Away") {
  fail("vita face should be Insurance / Quote It Away, got " + JSON.stringify(quoteFace));
} else pass("vita face is Insurance / Quote It Away");

if (packFace("quote").id !== "vita" || packFace("insurance").name !== "Insurance") fail("quote/insurance aliases");
else pass("quote and insurance alias to vita id");

const quoteJob = { title: "Need a life quote in Missouri", notes: "missed call, illustration later" };
if (detectPack(quoteJob) !== "vita") fail("detectPack quote should be vita, got " + detectPack(quoteJob));
else pass("detectPack insurance words → vita");

const listJob = { title: "Oak dresser", notes: "consign on ebay, comps $200" };
if (detectPack(listJob) !== "consign") fail("detectPack consign got " + detectPack(listJob));
else pass("detectPack consign");

const landJob = { title: "Back acre lot", notes: "flood and survey" };
if (detectPack(landJob) !== "land") fail("detectPack land got " + detectPack(landJob));
else pass("detectPack land");

const fundJob = { title: "Raise for the shop", notes: "campaign goal and credit" };
if (detectPack(fundJob) !== "fund") fail("detectPack fund got " + detectPack(fundJob));
else pass("detectPack fund");

const homeJob = { title: "School pickup", notes: "family reminder tomorrow" };
if (detectPack(homeJob) !== "home") fail("detectPack home got " + detectPack(homeJob));
else pass("detectPack home");

if (detectKind({ title: "How much for term life" }) !== "quote") fail("detectKind quote");
else pass("detectKind quote");

const q = qualifyJob({ title: "Need a life quote", notes: "Missouri, missed call", amount: 250 }, null);
if (q.pack !== "vita") fail("qualify pack " + q.pack);
else if (q.packName !== "Insurance" || q.packFamily !== "Quote It Away") fail("qualify face " + q.packName + " / " + q.packFamily);
else if (q.waitingOn === "owner" && /waiting on the owner/i.test(q.next || "") && !q.risk) fail("$250 without a rule waited");
else if (!q.draft || !q.next || !q.recs || !q.recs.length) fail("qualify missing draft/next/recs");
else if (/vita/.test([q.draft, q.next, q.packName, q.packFamily].concat((q.recs || []).map(function (r) { return r.text || r; })).join(" ").toLowerCase())) {
  fail("Vita leaked onto the card: " + blob(q).slice(0, 200));
} else pass("qualify Insurance card, no $250 floor, no Vita word");

const small = qualifyJob({ title: "Pay the oil change", notes: "home reminder", amount: 20 }, null);
if (small.waitingOn === "owner") fail("$20 without a rule waited");
else pass("$20 without a money rule does not wait");

const emptyDesk = qualifyJob({ title: "School pickup", notes: "family school form" }, { slug: "empty-desk", rules: [] });
if (emptyDesk.waitingOn === "owner" && /kid or school/i.test(emptyDesk.next || emptyDesk.why || "")) {
  fail("empty desk inherited a pack example rule");
} else pass("empty desk does not inherit pack example rules");

const shop = {
  slug: "engine-shop",
  pack: "home",
  rules: [{ text: "Cap same-day cards.", when: "qualify", then: "cap", contains: "same-day" }]
};
const capCard = qualifyJob({ title: "Same-day grocery run", notes: "same-day family pickup", workspace: "engine-shop" }, shop, []);
if (!capCard.cap || !capCard.priority) fail("pack/owner cap rule should orange the card");
else pass("cap rule oranges the card");

const full = [];
for (let i = 0; i < 8; i++) full.push({ workspace: "engine-shop", cap: true, status: "waiting" });
const ninth = qualifyJob({ title: "Same-day ninth", notes: "same-day", workspace: "engine-shop" }, shop, full);
if (ninth.cap) fail("9th cap should not land when pyramid is full");
else if (!/cap is full/i.test(ninth.next || "")) fail("full cap should say take one off");
else pass("cap max 8 holds");

const waitShop = {
  slug: "wait-shop",
  rules: [{ text: "Ask me if a kid or school is named.", when: "qualify", then: "wait", contains: "school" }]
};
const school = qualifyJob({ title: "School form", notes: "school pickup" }, waitShop);
if (school.waitingOn !== "owner") fail("school wait rule should wait on owner");
else pass("owner wait rule fires");

const recs = recommend({ pack: "vita", title: "Quote" }, [], null);
if (!recs.length) fail("recommend empty");
else if (recs.some((r) => /\bsend money\b|\bbind coverage\b/i.test(r.text || ""))) fail("recommend tried to send or bind");
else if (recs.some((r) => /vita/i.test(r.text || ""))) fail("recommend said Vita");
else pass("recommend drafts only, no Vita");

const follow = followJob({ title: "Nudge me", status: "waiting", pack: "home" }, null);
if (!follow.followed) fail("followJob should mark one nudge");
else if (/send|text them|email them automatically/i.test(follow.next || "")) fail("follow tried to send");
else pass("followJob one nudge, no send");

const run = runWorkspace([
  { title: "Need a quote", notes: "illustration later", status: "exception" },
  { title: "Off desk listing", status: "out", offDesk: true, pack: "consign" }
], Date.now(), null);
if (!run.ok || run.qualified < 1 || run.followed < 1) fail("runWorkspace " + JSON.stringify(run));
else pass("runWorkspace qualifies and follows");

applyCap({ title: "no hit" }, { rules: [] }, []);
pass("applyCap no-ops without a cap rule");

try {
  if (fs.existsSync(store)) fs.unlinkSync(store);
} catch (e) {}

if (process.exitCode) {
  console.error("check-engine failed");
  process.exit(1);
}
console.log("check-engine passed");
