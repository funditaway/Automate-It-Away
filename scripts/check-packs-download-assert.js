// Asserts for create-pack-download.js (loaded from scripts/check-packs.js)
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
function fail(msg) { console.error("FAIL " + msg); process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }
const root = path.join(__dirname, "..");
const dlPath = path.join(root, "create-pack-download.js");
if (!fs.existsSync(dlPath)) fail("create-pack-download.js missing for Download .aia Create honesty");
else pass("create-pack-download.js present");
const dlJs = fs.readFileSync(dlPath, "utf8");
const syn = spawnSync(process.execPath, ["--check", dlPath], { encoding: "utf8" });
if (syn.status !== 0) fail("create-pack-download.js must parse: " + (syn.stderr || syn.stdout || "").trim());
else pass("create-pack-download.js parses");
if (dlJs.indexOf("PLACEHOLDER") >= 0) fail("create-pack-download.js must not be PLACEHOLDER");
else pass("create-pack-download.js real contents");
if (dlJs.length < 400) fail("create-pack-download.js too small");
else pass("create-pack-download.js size ok");
if (dlJs.indexOf("pack-download-honest") < 0) fail("create-pack-download must inject Download .aia honesty");
else pass("Download .aia honesty id");
if (dlJs.indexOf("pack-mine-honest") < 0) fail("create-pack-download must honest #mine after List");
else pass("mine after-List honesty id");
if (dlJs.indexOf("History") < 0 || dlJs.indexOf("Give pack") < 0) fail("create-pack-download must point Download/Give to History");
else pass("Download/Give points to History");
if (dlJs.indexOf("You still tap Yes, then Start") < 0) fail("create-pack-download must keep Yes, then Start");
else pass("download/mine Yes, then Start");
if (dlJs.indexOf("Packs do not send money") < 0) fail("create-pack-download must say packs do not send money");
else pass("download/mine packs do not send money");
if (dlJs.indexOf("Collect stays HOLD") < 0) fail("create-pack-download must keep Collect HOLD");
else pass("download/mine Collect HOLD");
if (dlJs.indexOf("Pack is listed") < 0) fail("create-pack-download must honest Pack is listed success");
else pass("listed success Download honesty");
const createHtml = fs.readFileSync(path.join(root, "create.html"), "utf8");
if (createHtml.indexOf("create-pack-download.js") < 0) fail("create.html must load create-pack-download.js");
else pass("create.html loads create-pack-download.js");
["Queue", "Drop", "Create", "History", "More"].forEach(function (t) {
  if (createHtml.indexOf(t) < 0) fail("create.html missing bar tab " + t);
});
pass("live bar tabs still on create.html");
require("./check-packs-give-assert.js");
