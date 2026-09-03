const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const adminSrc = fs.readFileSync(path.join(root, "api/admin.js"), "utf8");
const deskNavJs = fs.readFileSync(path.join(root, "desk-nav.js"), "utf8");
const deskInboxJs = fs.readFileSync(path.join(root, "desk-inbox.js"), "utf8");
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
if (!/function findSeat/.test(adminSrc) || !/function sayOnSeat/.test(adminSrc)) fail("admin seat say helpers");
else pass("admin seat say helpers");
if (!/action === "say"/.test(adminSrc)) fail("admin action=say");
else pass("admin action=say");
const sayAt = adminSrc.indexOf("action === \"say\"");
const ownerGateAt = adminSrc.indexOf("if (!isOwner(person))");
if (sayAt < 0 || ownerGateAt < 0 || sayAt > ownerGateAt) fail("say should run before owner-only gate");
else pass("say runs before owner-only gate");
if (!/seatCards[\s\S]{0,1200}id:\s*seat\.id[\s\S]{0,400}status:\s*seat\.status[\s\S]{0,400}thread:\s*seatThread\(seat\)/.test(adminSrc)) fail("seatCards include id status thread");
else pass("seatCards include id status thread");
if (!/thread,\s*\n\s*pending,/.test(adminSrc)) fail("personBook return thread and pending");
else pass("personBook return thread and pending");
if (!/actions:\s*\[[^\]]*"say"/.test(adminSrc)) fail("unknown action list includes say");
else pass("unknown action list includes say");
if (/slugs: slugs.length \? slugs : null/.test(adminSrc)) fail("admin must not pass slugs null");
else pass("admin slugs stay locked");
if (/peopleAcross\(\)/.test(adminSrc) && /action === "person"[\s\S]{0,400}peopleAcross/.test(adminSrc)) fail("person action must not use peopleAcross");
else pass("person action avoids peopleAcross");
if (!/data-aia-desk-inbox/.test(deskNavJs) || !/i\.src = "\/desk-inbox\.js"/.test(deskNavJs)) fail("desk-nav loads desk-inbox on queue");
else pass("desk-nav loads desk-inbox on queue");
if (!/id = "desk-inbox"/.test(deskInboxJs) || !/insertBefore\(box, queue\)/.test(deskInboxJs)) fail("desk-inbox inserts above queue");
else pass("desk-inbox inserts above queue");
if (!/apiCall\("\/api\/admin"\)/.test(deskInboxJs) || !/apiCall\("\/api\/connections"\)/.test(deskInboxJs)) fail("desk-inbox reads admin and connections");
else pass("desk-inbox reads admin and connections");
if (!/aiaInboxAdmin\('approve'/.test(deskInboxJs) || !/aiaInboxAdmin\('deny'/.test(deskInboxJs) || !/action:\s*"say"/.test(deskInboxJs)) fail("desk-inbox owner + say actions");
else pass("desk-inbox owner + say actions");
if (!/AIA does not send, post, or pay\./.test(deskInboxJs)) fail("desk-inbox no-send notice");
else pass("desk-inbox no-send notice");

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

if (historyHtml.indexOf("params.get(\"who\")") < 0) fail("history reads ?who=");
else pass("history reads ?who=");
if (historyHtml.indexOf("who-chip") < 0) fail("history who chip");
else pass("history who chip");
if (historyHtml.indexOf("/people?who=") < 0) fail("history back to people");
else pass("history back to people");
