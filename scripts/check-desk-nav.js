const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

const root = path.join(__dirname, "..");
const pages = [
  "desk.html", "drop.html", "widget.html", "create.html", "history.html",
  "pipes.html", "connections.html", "help.html", "rules.html", "more.html",
  "developer.html", "market.html", "account.html"
];
const need = ["Queue", "Drop", "Create", "History", "More", "has-desk-nav", "id=\"desk-nav\""];

pages.forEach((file) => {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  need.forEach((bit) => {
    if (!html.includes(bit)) fail(file + " missing " + bit);
  });
  if (!html.includes("desk-nav.css") && !html.includes("#desk-nav{")) {
    fail(file + " has no desk-nav CSS");
  }
  if (!/class="[^"]*\bhas-desk-nav\b/.test(html)) fail(file + " body missing has-desk-nav");
  else pass(file + " has five tabs + bar CSS");
  if (html.includes("data-tab=\"rules\"") || html.includes("data-tab=\"pipes\"") || html.includes("data-tab=\"people\"")) {
    fail(file + " still has Rules / Pipes / People on the tab bar");
  }
});

const desk = fs.readFileSync(path.join(root, "desk.html"), "utf8");
if (!desk.includes("desk-tabs")) fail("desk.html missing header tabs");
else pass("desk header shows Queue · Drop · Create · History · More");
if (!desk.includes("data-tab=\"create\"") || !desk.includes("data-tab=\"history\"")) {
  fail("desk.html missing Create / History tabs");
} else pass("desk tabs are Queue Drop Create History More");
if (!desk.includes("href=\"/create\"")) fail("desk.html Create tab is not /create");
else pass("desk Create tab href is /create");
if (!desk.includes("href=\"/history\"")) fail("desk.html History tab is not /history");
else pass("desk History tab href is /history");
const drop = fs.readFileSync(path.join(root, "drop.html"), "utf8");
if (!drop.includes("data-tab=\"create\"") || !drop.includes("data-tab=\"history\"")) {
  fail("drop.html missing Create / History tabs");
} else pass("drop tabs are Queue Drop Create History More");
if (drop.includes("http-equiv=\"refresh\"") || drop.includes("location.replace(\"/widget") || drop.length < 4000) {
  fail("drop.html must be the real Drop page, not a stub");
} else pass("drop.html is the real Drop page");
if (!drop.includes("Drop anything") || drop.includes("Drop something off") || drop.includes("List / sell")) {
  fail("drop.html must read as drop anything, not consign-only");
} else pass("drop.html copy is drop anything");
const pipes = fs.readFileSync(path.join(root, "pipes.html"), "utf8");
if (!pipes.includes("This desk") || pipes.includes("http-equiv=\"refresh\"") || pipes.length < 4000) {
  fail("pipes.html must be the real Pipes page, not a stub");
} else pass("pipes.html is the real Pipes page");
if (!pipes.includes("href=\"/pipes\"") && !fs.readFileSync(path.join(root, "more.html"), "utf8").includes("href=\"/pipes\"")) {
  fail("Pipes must stay reachable from More");
} else pass("Pipes is reachable");
const rules = fs.readFileSync(path.join(root, "rules.html"), "utf8");
if (!rules.includes("/api/rules")) fail("rules.html must stay the Rules page");
else pass("Rules page is intact");
const more = fs.readFileSync(path.join(root, "more.html"), "utf8");
if (!more.includes("href=\"/rules\"") || !more.includes("href=\"/pipes\"")) fail("more.html must keep Rules and Pipes links");
else pass("More keeps Rules and Pipes");
if (!more.includes("Lives here, not on the tab bar")) fail("more.html must say Rules/Pipes live under More");
else pass("Rules and Pipes copy is off the tab bar");
if (!more.includes("Creators Studio")) fail("more.html must link Creators Studio");
else pass("More links Creators Studio");
pages.concat(["desk-nav.js"]).forEach((file) => {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  if (html.includes("/desk#rules") && file !== "desk-nav.js") fail(file + " still links Rules to /desk#rules");
});
const nav = fs.readFileSync(path.join(root, "desk-nav.js"), "utf8");
if (!nav.includes("desk-ais.js")) fail("desk-nav.js must load desk-ais.js");
else pass("nav loads desk-ais");
if (!nav.includes("href: \"/create\"") || !nav.includes("href: \"/history\"")) fail("desk-nav.js missing Create / History hrefs");
else pass("Create and History hrefs are set");
if (!nav.includes("name === \"create\"") || !nav.includes("name === \"history\"")) fail("desk-nav.js must highlight /create and /history");
else pass("Create and History tabs highlight their pages");
if (nav.includes("href: \"/people\"")) fail("desk-nav.js still puts People on the bar");
else pass("People is off the tab bar");
if (nav.includes("href: \"/rules\"") || nav.includes("href: \"/pipes\"")) fail("desk-nav.js still puts Rules / Pipes on the bar");
else pass("Rules and Pipes are off the tab bar");
if (!nav.includes("href: \"/more\"") || !nav.includes("name === \"more\"")) fail("desk-nav.js More href is not /more");
else pass("More tab href is /more");
if (!nav.includes("href: \"/drop\"") || !nav.includes("return \"/drop\"")) fail("desk-nav.js Drop href is not /drop");
else pass("Drop tab href is /drop");
if (nav.includes("href: \"/widget\"") || nav.includes("return \"/widget\"")) fail("desk-nav.js Drop href must not be /widget");
else pass("Drop tab href is not /widget");
if (/display:\s*none/.test(desk) && /header span a/.test(desk)) {
  fail("desk.html still hides header links on phone");
}

const create = fs.readFileSync(path.join(root, "create.html"), "utf8");
const createJs = fs.readFileSync(path.join(root, "create-desk.js"), "utf8");
if (!create.includes("id=\"start-decide\"") || !create.includes("#start-decide[hidden]")) {
  fail("create.html must hide Yes/Stop until a draft exists");
} else pass("Create hides Yes/Stop until Ask the desk");
if (!create.includes("id=\"start-note\"") || !create.includes("id=\"start-open\"")) {
  fail("create.html must keep Ask / Yes / stranger notes on the start card");
} else pass("Create start notes stay on the start card");
if (!create.includes(".start-note.is-err") || !create.includes("var(--orange)") || !create.includes(".start-note.is-ok") || !create.includes("var(--teal)")) {
  fail("create.html start notes must paint orange fail / teal Yes on the start card");
} else pass("Create start notes paint orange fail / teal Yes");
if (!create.includes(".start-note.is-ask")) {
  fail("create.html empty Ask must paint a non-sticky is-ask note, not leftover is-err");
} else pass("Create empty Ask paints is-ask, not is-err");
if (createJs.includes('classList.toggle("err"') || createJs.includes('classList.toggle("ok"')) {
  fail("create-desk.js start notes must not reuse .err/.ok display:none");
} else pass("Create start notes do not reuse .err/.ok display:none");
if (create.indexOf("id=\"start-note\"") > create.indexOf("id=\"start-kind\"")) {
  fail("create.html start notes must sit above How / what so a phone sees them");
} else pass("Create start notes sit above the fields");
if (!create.includes("Open this desk") || !create.includes("Unlock this desk")) {
  fail("create.html start must offer Open this desk / Unlock this desk");
} else pass("Create start stranger path is Open / Unlock");
if (!create.includes("#start-queue[hidden]") || !create.includes("#start-note[hidden]")) {
  fail("create.html must hide Put it on the queue and start notes with hidden");
} else pass("Create start skip and notes honor hidden");
if (!create.includes("task") || !create.includes("idea") || !create.includes("project") || !create.includes("build")) {
  fail("create.html must start real AIA work kinds");
} else pass("Create kinds are task/errand/list/idea/project/build");
if (!createJs.includes("action: \"suggest\"") || !createJs.includes("/api/health") || !createJs.includes("A Desk AI can't draft on this phone yet.")) {
  fail("create-desk.js must ask the desk and stay honest when drafts are off");
} else pass("Create asks the desk and stays honest offline");
if (createJs.includes("XAI_API_KEY") || createJs.includes("this box") || create.includes("XAI_API_KEY") || create.includes("this box") || create.includes("when a key is on")) {
  fail("Create must not name XAI_API_KEY / this box / key-on jargon");
} else pass("Create drafts-off uses Desk AI voice");
["history.html", "more.html", "desk.html", "drop-agent.js"].forEach(function (file) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  if (src.indexOf("XAI_API_KEY") >= 0) fail(file + " still names XAI_API_KEY on public chrome");
  else if (/\bthis box\b/.test(src)) fail(file + " still says this box on public chrome");
  else pass(file + " Desk AI voice has no key / box jargon");
});
if (create.includes("$250") || create.includes("placeholder=\"250\"")) fail("create.html invented a $250 default");
else pass("Create has no $250 default");
if (!createJs.includes("save-ai") || !createJs.includes('id: "ai"')) fail("create-desk.js must name a desk AI");
else pass("Create can name a desk AI");
if (!createJs.includes("deskOpen") || !createJs.includes("Open or unlock this desk first")) fail("Create must gate Desk AI Bind behind an open desk");
else pass("Create gates Desk AI Bind");
["developer.html", "market.html", "create.html", "more.html", "help.html"].forEach(function (file) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  if (!html.includes("ai.aia")) fail(file + " missing ai.aia brand");
  else pass(file + " names ai.aia");
  if (html.includes("www.aia.aia")) fail(file + " branded www.aia.aia");
  else pass(file + " does not use www.aia.aia");
  if (file !== "more.html" && !html.includes(".aia")) fail(file + " missing .aia files");
});
if (!create.includes("You tap Yes or Stop.")) fail("create.html must keep Yes or Stop");
else pass("Create lead is Yes or Stop");
if (create.includes("What should the desk do?")) fail("create.html start still says What should the desk do");
else pass("Create start does not say What should the desk do");
if (!create.includes("What should a Desk AI draft?")) fail("create.html start must ask What should a Desk AI draft");
else pass("Create start is What should a Desk AI draft");
if (!create.includes(">Ask the desk<")) fail("create.html must keep the Ask the desk tap");
else pass("Create keeps Ask the desk");
if (createJs.includes("Yes or No") || createJs.includes("yes or no")) fail("create-desk.js still paints Yes or No as the rail");
else pass("Create form does not paint Yes or No");
if (!createJs.includes("You still tap Yes or Stop")) fail("create-desk.js must keep Yes or Stop");
else pass("Create form keeps Yes or Stop");
if (createJs.includes("Say what the desk should do.")) fail("create-desk.js empty start still says the desk should do");
else pass("Create empty start does not say the desk should do");
if (!createJs.includes("Say what a Desk AI should draft.")) fail("create-desk.js empty start must say Say what a Desk AI should draft");
else pass("Create empty start is Say what a Desk AI should draft");
if (createJs.includes('return startFail("Say what a Desk AI should draft.")')) {
  fail("create-desk.js empty Ask must not paint is-err via startFail");
} else pass("Create empty Ask does not use startFail / is-err");
if (!createJs.includes("function startHint") || !createJs.includes("function clearStartHint") || !createJs.includes('kind === "ask"')) {
  fail("create-desk.js empty Ask must use a non-sticky startHint path");
} else pass("Create empty Ask uses startHint");
if (!createJs.includes('addEventListener("input", clearStartHint') || !createJs.includes('addEventListener("focus", clearStartHint')) {
  fail("create-desk.js must clear empty-Ask hint on type / focus");
} else pass("Create empty Ask hint clears on type / focus");
if (createJs.includes('return fail("Say what a Desk AI should draft.")') || createJs.includes('return fail("Open a desk on this phone first.")')) {
  fail("create-desk.js start fail must stay on the start card, not #err under the form");
} else pass("Create start fail stays on the start card");
if (!createJs.includes("function startFail") || !createJs.includes("function startDone") || !createJs.includes("function paintStartDesk")) {
  fail("create-desk.js must paint start Ask / Yes / stranger notes on the start card");
} else pass("Create start paints Ask / Yes / stranger on the start card");
if (createJs.includes('classList.contains("err")')) {
  fail("create-desk.js paintStartDesk must check is-err, not leftover .err");
} else pass("Create start Open/Unlock clear does not check leftover .err");
if (!createJs.includes('classList.contains("is-err")')) {
  fail("create-desk.js paintStartDesk must clear the is-err Open/Unlock note");
} else pass("Create start Open/Unlock clear checks is-err");
if (!createJs.includes('addEventListener("pageshow"') || !/pageshow[\s\S]{0,80}paintStartDesk/.test(createJs)) {
  fail("create-desk.js must re-paint start desk on pageshow so Open/Unlock clear is honest");
} else pass("Create start re-paints on pageshow");
(function () {
  const from = createJs.indexOf('localStorage.setItem("aia_ws"');
  const to = createJs.indexOf('return done("Workspace is open');
  const block = from >= 0 && to > from ? createJs.slice(from, to) : "";
  if (block.indexOf("paintStartDesk()") < 0) {
    fail("create-desk.js must paintStartDesk after same-page Workspace open");
  } else pass("Create start clears Open/Unlock after same-page open");
})();
if (createJs.includes("Put the work on the queue, or Stop")) fail("create-desk.js drafts-off start still says Put the work, or Stop");
else pass("Create drafts-off start does not say Put the work, or Stop");
if (!createJs.includes("Yes puts the work on the queue. Stop discards it.")) {
  fail("create-desk.js drafts-off start must name Yes / Stop");
} else pass("Create drafts-off start names Yes / Stop");
if (!createJs.includes("skip.hidden = !!on") || !createJs.includes("start-queue")) {
  fail("create-desk.js must hide Put it on the queue while Yes / Stop decide");
} else pass("Create hides the skip while Yes / Stop decide");
if (!createJs.includes("You still tap Yes / Stop / Kill.")) {
  fail("create-desk.js start Yes handoff must name the Queue rail");
} else pass("Create start Yes handoff names Yes / Stop / Kill");
if (createJs.includes('return done("On the queue. Same Drop card.')) {
  fail("create-desk.js start Yes must not dump success under the form");
} else pass("Create start Yes stays on the start card");
if (!createJs.includes("function queueHref") || !createJs.includes("/desk?job=") || !createJs.includes("Open this card")) {
  fail("create-desk.js Yes handoff must link Open this card /desk?job=");
} else pass("Create Yes handoff links Open this card /desk?job=");
if (!create.includes("Open this card.")) fail("create.html start must name Open this card");
else pass("Create start hint names Open this card");
const yesNo = fs.readFileSync(path.join(root, "ACCOUNT-YES-NO.md"), "utf8");
const packMd = fs.readFileSync(path.join(root, "PACK.md"), "utf8");
if (yesNo.indexOf("Create → Queue handoff leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must record the Create → Queue handoff leftover");
} else pass("ACCOUNT-YES-NO records Create → Queue handoff leftover");
if (packMd.indexOf("Create → Queue handoff leftover:") < 0) {
  fail("PACK.md must record the Create → Queue handoff leftover");
} else pass("PACK.md records Create → Queue handoff leftover");
if (yesNo.indexOf("Create start leftover after that pass") < 0) fail("ACCOUNT-YES-NO must record the Create start leftover");
else pass("ACCOUNT-YES-NO records Create start leftover");
if (packMd.indexOf("Create start leftover:") < 0) fail("PACK.md must record the Create start leftover");
else pass("PACK.md records Create start leftover");
if (yesNo.indexOf("Create start card leftover after that pass") < 0) fail("ACCOUNT-YES-NO must record the Create start card leftover");
else pass("ACCOUNT-YES-NO records Create start card leftover");
if (packMd.indexOf("Create start card leftover:") < 0) fail("PACK.md must record the Create start card leftover");
else pass("PACK.md records Create start card leftover");
if (yesNo.indexOf("Create start Open/Unlock leftover after that pass") < 0) fail("ACCOUNT-YES-NO must record the Create start Open/Unlock leftover");
else pass("ACCOUNT-YES-NO records Create start Open/Unlock leftover");
if (packMd.indexOf("Create start Open/Unlock leftover:") < 0) fail("PACK.md must record the Create start Open/Unlock leftover");
else pass("PACK.md records Create start Open/Unlock leftover");
if (yesNo.indexOf("Counter Desk AI voice leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must record the Counter Desk AI voice leftover");
} else pass("ACCOUNT-YES-NO records Counter Desk AI voice leftover");
if (packMd.indexOf("Counter Desk AI voice leftover:") < 0) {
  fail("PACK.md must record the Counter Desk AI voice leftover");
} else pass("PACK.md records Counter Desk AI voice leftover");
const statusPage = fs.readFileSync(path.join(root, "status.html"), "utf8");
if (statusPage.indexOf("XAI_API_KEY") >= 0 || /Could not reach this box/.test(statusPage) || /Static host — API lives on the Vercel/.test(statusPage) || /\/drop\?ws=/.test(statusPage)) {
  fail("status.html still names keys, this box, Vercel, or /drop?ws= on the face");
} else if (!/Could not reach the desk/.test(statusPage) || !/From a link or this phone/.test(statusPage)) {
  fail("status.html must use Desk AI voice on catch / Drop");
} else if (/id="raw"|deskPublicDump/.test(statusPage) || /\bblob\b|Decentraweb/i.test(statusPage)) {
  fail("status.html still dumps raw health JSON or names blob / Decentraweb");
} else pass("status.html Counter chrome uses Desk AI voice; no raw dump");
if (yesNo.indexOf("Status raw health dump leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must record the Status raw health dump leftover");
} else pass("ACCOUNT-YES-NO records Status raw health dump leftover");
if (packMd.indexOf("Status raw health dump leftover:") < 0) {
  fail("PACK.md must record the Status raw health dump leftover");
} else pass("PACK.md records Status raw health dump leftover");

const history = fs.readFileSync(path.join(root, "history.html"), "utf8");
if (!history.includes("id=\"aia-line\"") || !history.includes("id=\"desk-pick\"") || !history.includes("does not invent")) {
  fail("history.html missing AIA trail / desk filter / honest empty");
} else pass("History has AIA trail, desk filter, honest empty");
if (!history.includes("citations") || !history.includes("aiaStatus")) fail("history.html must show AIA status and citations");
else pass("History shows AIA status and citations");
if (history.includes("$250") || /demo activity|fake job/i.test(history)) fail("history.html invented demo activity");
else pass("History has no fake activity");

const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
if (!/"source": "\/pipes"/.test(vercel) || !/\/pipes\.html/.test(vercel)) {
  fail("vercel.json must rewrite /pipes to pipes.html");
} else pass("/pipes rewrites to the Pipes page");
if (!/"source": "\/drop"/.test(vercel) || !/\/drop\.html/.test(vercel)) {
  fail("vercel.json must rewrite /drop to drop.html");
} else pass("/drop rewrites to the Drop page");
if (!/"source": "\/create"/.test(vercel) || !/\/create\.html/.test(vercel)) {
  fail("vercel.json must rewrite /create to create.html");
} else pass("/create rewrites to the Create page");
if (!/"source": "\/history"/.test(vercel) || !/\/history\.html/.test(vercel)) {
  fail("vercel.json must rewrite /history to history.html");
} else pass("/history rewrites to the History page");
if (!fs.existsSync(path.join(root, "drop.html"))) fail("drop.html missing — Vercel cleanUrls 404s /drop");
else pass("drop.html exists for /drop");
if (!fs.existsSync(path.join(root, "pipes.html"))) fail("pipes.html missing — Vercel cleanUrls 404s /pipes");
else pass("pipes.html exists for /pipes");
if (!fs.existsSync(path.join(root, "create.html"))) fail("create.html missing — Vercel cleanUrls 404s /create");
else pass("create.html exists for /create");
if (!fs.existsSync(path.join(root, "history.html"))) fail("history.html missing — Vercel cleanUrls 404s /history");
else pass("history.html exists for /history");

const theme = fs.readFileSync(path.join(root, "theme.css"), "utf8");
if (theme.includes("header span a { display: none; }")) {
  fail("theme.css still hides header links — iOS then has no Create/History");
} else pass("theme.css keeps header tabs visible");

const css = fs.readFileSync(path.join(root, "desk-nav.css"), "utf8");
if (!css.includes("#desk-nav") || !css.includes("position: fixed")) fail("desk-nav.css missing fixed bar");
else pass("desk-nav.css paints the bottom bar");

["drop.html", "widget.html"].forEach(function (file) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  if (!src.includes('href="/drop" data-tab="drop"')) fail(file + " Drop tab must open /drop");
  else pass(file + " Drop tab opens /drop");
  if (src.includes('href="/widget" data-tab="drop"')) fail(file + " Drop tab must not open /widget");
  else pass(file + " Drop tab is not /widget");
});

if (yesNo.indexOf("Drop tab full Drop leftover after that pass") < 0) fail("ACCOUNT-YES-NO must name Drop tab full Drop leftover");
else pass("ACCOUNT-YES-NO records Drop tab full Drop leftover");
if (packMd.indexOf("Drop tab full Drop leftover:") < 0) fail("PACK.md must name Drop tab full Drop leftover");
else pass("PACK.md records Drop tab full Drop leftover");

const jobs = fs.readFileSync(path.join(root, "api/jobs.js"), "utf8");
if (!jobs.includes("action === \"suggest\"") || !jobs.includes("saved: false")) fail("jobs.js must draft without inventing a saved card");
else pass("jobs.js suggest does not save a fake card");
const grok = fs.readFileSync(path.join(root, "api/_grok.js"), "utf8");
if (!grok.includes("normalizeCites") || !grok.includes("search_parameters")) fail("grok must keep citations and optional web search");
else pass("Grok stores citations when the web was used");

if (process.exitCode) {
  console.error("check-desk-nav failed");
  process.exit(1);
}
console.log("check-desk-nav passed");
