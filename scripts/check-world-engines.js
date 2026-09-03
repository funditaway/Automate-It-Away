const world = require("../api/_world-engines");
let fails = 0;
function fail(m) { console.error("FAIL " + m); fails += 1; }
function pass(m) { console.log("ok  " + m); }

const ids = world.allIds();
if (ids.length < 70) fail("engine count " + ids.length);
else pass("engine ids " + ids.length);

if (world.WANTED13.length !== 13) fail("wanted 13");
else pass("wanted 13");

if (world.faceOf("year2") !== "Insurance" || world.familyOf("year2") !== "Quote It Away") fail("year2 face");
else pass("year2 face Insurance / Quote It Away");

if (world.faceOf("lead") !== "Insurance") fail("lead face");
else pass("lead face Insurance");

const missedIns = world.detectWorld({ title: "Need a life quote in Missouri", notes: "missed call" });
if (missedIns !== "quote") fail("insurance words lost to missed-call: " + missedIns);
else pass("insurance words beat missed-call");

const missedBare = world.detectWorld({ title: "Missed call from Jordan", notes: "No voicemail. Call back today." });
if (missedBare !== "missed-call") fail("bare missed-call " + missedBare);
else pass("bare missed-call stays missed-call");

const y2 = world.detectWorld({ title: "Year-2 review in Missouri", notes: "annual review" });
if (y2 !== "year2") fail("year2 detect " + y2);
else pass("year2 detect");

const blob = JSON.stringify(world.WORLD);
if (/vita/i.test(blob)) fail("world catalog leaked agency shop name");
else pass("world catalog has no Vita word");

["illustration","claim-note","certificate","replacement"].forEach(function (id) {
  const b = world.brainOf(id, { title: id });
  if (!b.draft || /send the packet|bind coverage|file the claim/i.test(b.draft)) fail("brain " + id);
  if ((b.never || []).indexOf("bind") < 0) fail("never bind " + id);
});
pass("quote brains draft only");

if (fails) { console.error(fails + " failed"); process.exit(1); }
console.log("check-world-engines green");
