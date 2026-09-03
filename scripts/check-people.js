const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const adminSrc = fs.readFileSync(path.join(root, "api/admin.js"), "utf8");
const peopleHtml = fs.readFileSync(path.join(root, "people.html"), "utf8");
const peopleJs = fs.readFileSync(path.join(root, "people.js"), "utf8");
const historyHtml = fs.readFileSync(path.join(root, "history.html"), "utf8");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

if (!/action === "person"/.test(adminSrc)) fail("admin action=person");
else pass("admin action=person");
if (!/function personBook/.test(adminSrc) && !/personBook\(/.test(adminSrc)) fail("admin personBook");
else pass("admin personBook");
if (!/function allowedSlugs/.test(adminSrc)) fail("admin allowedSlugs");
else pass("admin allowedSlugs");
if (/slugs: slugs.length \? slugs : null/.test(adminSrc)) fail("admin must not pass slugs null");
else pass("admin slugs stay locked");
if (/peopleAcross\(\)/.test(adminSrc) && /action === "person"[\s\S]{0,400}peopleAcross/.test(adminSrc)) fail("person action must not use peopleAcross");
else pass("person action avoids peopleAcross");

if (peopleHtml.indexOf("id=\"sheet\"") < 0) fail("people sheet markup");
else pass("people sheet markup");
if (peopleJs.indexOf("function groupPeople") < 0) fail("people groupPeople");
else pass("people groupPeople");
if (peopleJs.indexOf("function openSheet") < 0) fail("people openSheet");
else pass("people openSheet");
if (peopleJs.indexOf("action: \"person\"") < 0) fail("people POSTs person");
else pass("people POSTs person");
if (peopleJs.indexOf("/history?who=") < 0) fail("people history who link");
else pass("people history who link");
if (peopleJs.indexOf("openFromQuery") < 0) fail("people ?who= open");
else pass("people ?who= open");
if (peopleJs.indexOf("function persistView") < 0 || peopleJs.indexOf("params.set(\"q\"") < 0 || peopleJs.indexOf("params.set(\"f\"") < 0) fail("people persist q/f");
else pass("people persist q/f");
if (peopleJs.indexOf("function applyViewFromQuery") < 0) fail("people apply q/f from query");
else pass("people apply q/f from query");
if (peopleJs.indexOf("function logicLine") < 0 || peopleJs.indexOf("function paintLogic") < 0 || peopleJs.indexOf("AND search") < 0) fail("people logic line");
else pass("people logic line");
if (peopleJs.indexOf("function applyTalk") < 0 || peopleJs.indexOf("find") < 0 || peopleJs.indexOf("STATE.filter = t.filter") < 0) fail("people talk find filter");
else pass("people talk find filter");
if (peopleJs.indexOf("clear-view") < 0 || peopleJs.indexOf("STATE.filter = \"all\"") < 0) fail("people clear view");
else pass("people clear view");
if (peopleJs.indexOf("f === \"ext\"") < 0 || peopleJs.indexOf("f === \"hold\"") < 0) fail("people ext/hold filters");
else pass("people ext/hold filters");

if (historyHtml.indexOf("params.get(\"who\")") < 0) fail("history reads ?who=");
else pass("history reads ?who=");
if (historyHtml.indexOf("who-chip") < 0) fail("history who chip");
else pass("history who chip");
if (historyHtml.indexOf("/people?who=") < 0) fail("history back to people");
else pass("history back to people");
