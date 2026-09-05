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
if (/display:\s*none/.test(desk) && /header span a/.test(desk)) {
  fail("desk.html still hides header links on phone");
}

const create = fs.readFileSync(path.join(root, "create.html"), "utf8");
const createJs = fs.readFileSync(path.join(root, "create-desk.js"), "utf8");
if (!create.includes("id=\"start-decide\"") || !create.includes("#start-decide[hidden]")) {
  fail("create.html must hide Yes/Stop until a draft exists");
} else pass("Create hides Yes/Stop until Ask the desk");
if (!create.includes("task") || !create.includes("idea") || !create.includes("project") || !create.includes("build")) {
  fail("create.html must start real AIA work kinds");
} else pass("Create kinds are task/errand/list/idea/project/build");
if (!createJs.includes("action: \"suggest\"") || !createJs.includes("/api/health") || !createJs.includes("XAI_API_KEY")) {
  fail("create-desk.js must ask the desk and stay honest when drafts are off");
} else pass("Create asks the desk and stays honest offline");
if (create.includes("$250") || create.includes("placeholder=\"250\"")) fail("create.html invented a $250 default");
else pass("Create has no $250 default");
if (!createJs.includes("save-ai") || !createJs.includes('id: "ai"')) fail("create-desk.js must name a desk AI");
else pass("Create can name a desk AI");
if (!createJs.includes("deskOpen") || !createJs.includes("Open or unlock this desk first")) fail("Create must gate Desk AI Bind behind an open desk");
else pass("Create gates Desk AI Bind");

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
