const taps = require("../api/_taps");

function fail(msg) { console.error("FAIL " + msg); process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }

const consign = { slug: "consign-it-away", biz: "Consign It Away", model: "Consignment & resale", nouns: { do: "List", collect: "Payout" } };
const vita = { slug: "vita-financial", biz: "Vita Financial", model: "life insurance" };

const a = taps.applyTaps({ title: "Oak dresser", pack: "consign", status: "waiting" }, null, consign);
if (!a.length) fail("consign taps empty");
else if (a.some((t) => /^(yes|no)$/i.test(t.label))) fail("consign still has Yes/No: " + a.map((t) => t.label).join(","));
else if (!a.some((t) => /Consign It Away|Payout|title|desk/i.test(t.label))) fail("consign taps not desk-custom: " + a.map((t) => t.label).join(","));
else pass("consign taps are desk-custom");

const b = taps.applyTaps({ title: "Year-2 review", pack: "vita", status: "waiting" }, null, vita);
if (b.some((t) => /oil change|yes|no/i.test(t.label))) fail("vita used example copy: " + b.map((t) => t.label).join(","));
else if (!b.some((t) => /Vita|illustration|family/i.test(t.label))) fail("vita taps not custom: " + b.map((t) => t.label).join(","));
else pass("vita taps are desk-custom");

const written = taps.applyTaps({ title: "School form", pack: "home" }, [
  { label: "Text the school", action: "carry" },
  { label: "Need the due date", action: "ask" },
  { label: "Yes", action: "ship" }
], { biz: "Oddo House", model: "home" });
if (!written.some((t) => t.label === "Text the school")) fail("bot label dropped");
else if (written.some((t) => t.label === "Yes")) fail("Yes survived sanitizer");
else pass("bot writes labels; Yes is rewritten");

const held = taps.applyTaps({ status: "held", pack: "consign" }, [], consign);
if (!held.some((t) => t.action === "override" && t.owner)) fail("held card missing owner release");
else pass("held card gets owner release tap");

const hit = taps.tapOf({ taps: written }, { tapId: "Text the school" }) || taps.tapOf({ taps: written }, { label: "Text the school" });
if (!hit || hit.action !== "carry") fail("tap lookup missed bot button");
else pass("pressing the bot button finds carry");

const fs = require("fs");
const path = require("path");
const desk = fs.readFileSync(path.join(__dirname, "..", "desk.html"), "utf8");
["data-filter=\"cap\"", "cap-band", "Cap · orange", "cap-card", "Do this first"].forEach((bit) => {
  if (!desk.includes(bit)) fail("desk.html missing " + bit);
});
if (!process.exitCode) pass("desk.html paints orange cap first");

if (process.exitCode) process.exit(process.exitCode);
