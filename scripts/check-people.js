const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const adminSrc = fs.readFileSync(path.join(root, "api/admin.js"), "utf8");
const peopleHtml = fs.readFileSync(path.join(root, "people.html"), "utf8");
const peopleJs = fs.readFileSync(path.join(root, "people.js"), "utf8");
const peopleDesk = fs.readFileSync(path.join(root, "people-desk.js"), "utf8");
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
if (peopleJs.indexOf("function kindLabel") < 0 || peopleJs.indexOf('if (k === "agent") return "Desk AI"') < 0) {
  fail("people.js must label agent seats Desk AI");
} else pass("people kindLabel maps agent to Desk AI");
if (/esc\(kindOf\(p\)\)/.test(peopleJs)) fail("people card seat chip must not paint raw kindOf");
else pass("people card seat chip uses kindLabel");
if (peopleJs.indexOf("kindLabel(seat.kind") < 0) fail("people open-sheet seats must label agent Desk AI");
else pass("people open-sheet seats use kindLabel");
if (peopleDesk.indexOf("human, agent, or pipe") >= 0) fail("people-desk Say still says agent");
else pass("people-desk Say does not say agent");
if (peopleDesk.indexOf("human, Desk AI, or pipe") < 0) fail("people-desk Say must name Desk AI");
else pass("people-desk Say names Desk AI");
if (peopleJs.indexOf('bits.push("agents")') >= 0) fail("people logicLine still says agents");
else pass("people logicLine does not say agents");
if (peopleJs.indexOf('bits.push("Desk AIs")') < 0) fail("people logicLine must say Desk AIs");
else pass("people logicLine names Desk AIs");
const yesNo = fs.readFileSync(path.join(root, "ACCOUNT-YES-NO.md"), "utf8");
const packMd = fs.readFileSync(path.join(root, "PACK.md"), "utf8");
if (yesNo.indexOf("People logic leftover") < 0) fail("ACCOUNT-YES-NO must name People logic leftover");
else pass("ACCOUNT-YES-NO names People logic leftover");
if (packMd.indexOf("People logic leftover") < 0) fail("PACK.md must name People logic leftover");
else pass("PACK.md names People logic leftover");

if (historyHtml.indexOf("params.get(\"who\")") < 0) fail("history reads ?who=");
else pass("history reads ?who=");
if (historyHtml.indexOf("who-chip") < 0) fail("history who chip");
else pass("history who chip");
if (historyHtml.indexOf("/people?who=") < 0) fail("history back to people");
else pass("history back to people");
