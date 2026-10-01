// Asserts for history-pack-give.js (loaded from scripts/check-packs-download-assert.js)
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
function fail(msg) { console.error("FAIL " + msg); process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }
const root = path.join(__dirname, "..");
const givePath = path.join(root, "history-pack-give.js");
if (!fs.existsSync(givePath)) fail("history-pack-give.js missing for History Give · .aia honesty");
else pass("history-pack-give.js present");
const giveJs = fs.readFileSync(givePath, "utf8");
const syn = spawnSync(process.execPath, ["--check", givePath], { encoding: "utf8" });
if (syn.status !== 0) fail("history-pack-give.js must parse: " + (syn.stderr || syn.stdout || "").trim());
else pass("history-pack-give.js parses");
if (giveJs.indexOf("PLACEHOLDER") >= 0) fail("history-pack-give.js must not be PLACEHOLDER");
else pass("history-pack-give.js real contents");
if (giveJs.length < 400) fail("history-pack-give.js too small");
else pass("history-pack-give.js size ok");
if (giveJs.indexOf("history-pack-give-honest") < 0) fail("history-pack-give must inject Give · .aia honesty");
else pass("History Give honesty id");
if (giveJs.indexOf("Yes, then Start") < 0) fail("history-pack-give must keep Yes, then Start");
else pass("History Give Yes, then Start");
if (giveJs.indexOf("Packs do not send money") < 0) fail("history-pack-give must say packs do not send money");
else pass("History Give packs do not send money");
if (giveJs.indexOf("Collect stays HOLD") < 0) fail("history-pack-give must keep Collect HOLD");
else pass("History Give Collect HOLD");
if (giveJs.indexOf("No silent push") < 0) fail("history-pack-give must deny silent push");
else pass("History Give no silent push");
if (giveJs.indexOf("They install with Yes. No silent push") < 0) fail("history-pack-give must rewrite soft Give success");
else pass("History Give soft success rewrite");
const navJs = fs.readFileSync(path.join(root, "desk-nav.js"), "utf8");
if (navJs.indexOf("history-pack-give.js") < 0) fail("desk-nav.js must load history-pack-give.js on History");
else pass("desk-nav loads history-pack-give.js");
if (navJs.indexOf("loadHistory") < 0) fail("desk-nav.js must keep loadHistory helper");
else pass("desk-nav loadHistory helper");
const historyHtml = fs.readFileSync(path.join(root, "history.html"), "utf8");
["Queue", "Drop", "Create", "History", "More"].forEach(function (t) {
  if (historyHtml.indexOf(t) < 0) fail("history.html missing bar tab " + t);
});
pass("live bar tabs still on history.html");
