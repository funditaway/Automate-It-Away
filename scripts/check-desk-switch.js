const fs = require("fs");
const path = require("path");
const vm = require("vm");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

const root = path.join(__dirname, "..");
const store = {};
const sandbox = {
  localStorage: {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; }
  },
  location: { search: "" }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(root, "desk-switch.js"), "utf8"), sandbox);
const AIA = sandbox.AIADesks;

AIA.open({ slug: "desk-a", name: "Desk A", pin: "1111", role: "owner" });
AIA.open({ slug: "desk-b", name: "Desk B", pin: "2222", role: "owner" });
const slugs = AIA.list().map((d) => d.slug);
if (slugs.indexOf("desk-a") < 0 || slugs.indexOf("desk-b") < 0) fail("open B wiped A");
else pass("open B adds, does not replace A");
if (store.aia_ws !== "desk-b") fail("current desk should be B after open B");
else pass("current desk is B");

AIA.switchTo("desk-a");
if (store.aia_ws !== "desk-a" || store.aia_pin !== "1111") fail("switch A did not restore A");
else pass("switch sets aia_ws + aia_pin");

AIA.patch("desk-a", { name: "Desk A+", role: "owner" });
if (!AIA.find("desk-a") || AIA.find("desk-a").token !== "" || store.aia_session) fail("patch without a token should not invent one");
AIA.patch("desk-b", { token: "tok-b" });
AIA.switchTo("desk-b");
AIA.patch("desk-b", { name: "Desk Bee" });
if (!AIA.find("desk-b") || AIA.find("desk-b").token !== "tok-b" || store.aia_session !== "tok-b") fail("patch should keep the saved token");
else pass("patch keeps the desk token");

const before = AIA.list().length;
AIA.unlock();
if (AIA.list().length !== before) fail("unlock wiped saved desks");
else if (store.aia_pin) fail("unlock should clear current pin only");
else if (!AIA.find("desk-a") || !AIA.find("desk-b")) fail("unlock lost a saved desk");
else pass("unlock keeps the phone list");

sandbox.location.search = "";
store.aia_ws = "";
store.aia_pin = "";
if (AIA.captureDesk()) fail("empty phone should not capture");
else pass("no open desk → no capture desk");

sandbox.location.search = "?ws=desk-a";
const saved = AIA.captureDesk();
if (!saved || saved.slug !== "desk-a" || store.aia_ws) fail("saved ?ws= should capture A only, not switch current");
else pass("?ws= matching a saved desk is capture-only");

sandbox.location.search = "?ws=embed-shop";
const embed = AIA.captureDesk();
if (!embed || embed.slug !== "embed-shop" || !embed.embed) fail("embed ?ws= should capture that shop");
else if (store.aia_ws === "embed-shop") fail("embed should not write aia_ws");
else pass("embed ?ws= captures that shop only");

sandbox.location.search = "";
if (AIA.captureDesk()) fail("still no current desk, should stay empty");
else pass("never default to demo");

const widget = fs.readFileSync(path.join(root, "widget.html"), "utf8");
if (/localStorage\.getItem\("aia_ws"\)\s*\|\|/.test(widget) || /\|{2}\s*"demo"/.test(widget)) {
  fail("widget.html still falls back to demo or aia_ws||");
} else pass("widget.html has no demo fallback");
if (widget.includes("location.replace(\"/onboard\")")) {
  fail("widget.html still bounces to /onboard before they can pick");
} else pass("widget.html stays on /drop");
const pickJs = fs.readFileSync(path.join(root, "drop-pick.js"), "utf8");
if (!widget.includes("AIADesks.captureDesk") || !pickJs.includes("AIADesks.list") || !pickJs.includes("switchTo")) {
  fail("widget.html must list and switch saved desks");
} else pass("widget.html lists saved desks");
if (!widget.includes("Which desk gets this") || !widget.includes("Desks saved on this phone") || !widget.includes("Create a new desk") || !widget.includes("Add a saved desk")) {
  fail("widget.html missing doer picker copy");
} else pass("widget copy is desk picker");
if (!widget.includes("nouns") && !widget.includes("NOUNS.capture") && !widget.includes("nouns.capture")) {
  fail("widget.html must speak owner nouns");
} else pass("widget.html uses owner nouns");

const onboard = fs.readFileSync(path.join(root, "onboard.html"), "utf8");
if (!onboard.includes("Desk name") || !onboard.includes("AIADesks.open")) {
  fail("onboard.html should name the desk and add it");
} else pass("onboard adds the desk");

const login = fs.readFileSync(path.join(root, "login.html"), "utf8");
if (!login.includes("AIADesks.open")) fail("login.html should add the desk");
else pass("login adds the desk");

const desk = fs.readFileSync(path.join(root, "desk.html"), "utf8");
if (!desk.includes("#gate[hidden]") && !desk.includes("gate[hidden]")) fail("desk.html gate hidden can lose to .row flex");
else pass("desk.html honors hidden on the gate");
if (!desk.includes("Change desk") || !desk.includes("Open another") || !desk.includes("switchDesk")) {
  fail("desk.html missing switcher");
} else pass("desk.html can switch saved desks");
if (desk.includes("|| \"demo\"") || desk.includes("|| 'demo'")) fail("desk.html still falls back to demo");
else pass("desk.html has no demo fallback");
["pipes.html", "connections.html", "admin.html"].forEach((file) => {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  if (src.includes("|| \"demo\"") || src.includes("|| 'demo'")) fail(file + " still falls back to demo");
  else pass(file + " has no demo fallback");
});
if (!desk.includes("Drop anything") || !desk.includes("Add a rule") || !desk.includes("This desk") || !desk.includes("no rules yet")) fail("desk copy missing");
else pass("desk queue/rules copy");
if (!desk.includes("widget-count") || !desk.includes("rule-widgets") || !desk.includes("/rules")) {
  fail("desk.html missing widget count or /rules link");
} else pass("desk.html shows widget count and /rules");
if (desk.includes("noun-capture") || desk.includes("action: \"nouns\"")) fail("desk.html still has the nouns editor on the queue");
else pass("nouns editor lives on Rules, not Queue");
if (!desk.includes("Waiting on a person.") || !desk.includes("Waiting on the owner") || desk.includes("k-held") || desk.includes("Over $250") || desk.includes(">Release<") || desk.includes("Needs you")) {
  fail("desk.html still has $250 / Release chrome");
} else pass("desk chrome has no $250 button");
if (desk.includes("Grok") || desk.includes("the box") || desk.includes("Phone calendar") || desk.includes("floor-staff") || desk.includes("floor staff")) {
  fail("desk.html still lectures Grok / the box / floor-staff");
} else pass("desk.html has no Grok / box / floor-staff");

const cardJs = fs.readFileSync(path.join(root, "desk-card.js"), "utf8");
if (!cardJs.includes(">Save a file<") || !cardJs.includes(">Yes<") || !cardJs.includes(">No<")) {
  fail("desk-card.js missing Save a file / Yes / No");
} else pass("desk-card.js uses Save a file / Yes / No");
if (cardJs.includes(">Grok recs<") || cardJs.includes(">Phone calendar<") || cardJs.includes("That's my queue") || cardJs.includes("How work gets here") || cardJs.includes(">Send<") || cardJs.includes(">Stop<")) {
  fail("desk-card.js still has Grok / old button labels");
} else pass("desk-card.js has no Grok recs or old labels");

const jobs = fs.readFileSync(path.join(root, "api/jobs.js"), "utf8");
if (!jobs.includes("Open a desk first.") || jobs.includes("workspaceOf(req)")) {
  fail("jobs.js should reject a blank workspace and not call workspaceOf");
} else pass("jobs.js rejects a blank workspace");
if (!jobs.includes("ensureNouns") || !jobs.includes("nouns:")) fail("jobs.js should return desk nouns");
else pass("jobs.js returns nouns");

const rulesPage = fs.readFileSync(path.join(root, "rules.html"), "utf8");
if (!rulesPage.includes("id=\"desk-nav\"") || !rulesPage.includes("/api/rules") || !rulesPage.includes("Add a rule")) {
  fail("rules.html must be its own desk page");
} else pass("rules.html is the Rules page");
if (!rulesPage.includes("action: \"widget\"") || !rulesPage.includes("widget-count")) {
  fail("rules.html must toggle widgets and show the count");
} else pass("rules.html toggles rule widgets");
if (rulesPage.includes("placeholder=\"250\"") || rulesPage.includes("Starters") || rulesPage.includes("id=\"starters\"")) {
  fail("rules.html still shows example / $250 starter chrome");
} else pass("rules.html has no example-rule chrome");
if (!rulesPage.includes("Starts empty") && !rulesPage.includes("No rules yet")) fail("rules.html missing empty-desk copy");
else pass("rules.html says the desk starts empty");

const libSrc = fs.readFileSync(path.join(root, "api/_lib.js"), "utf8");
if (libSrc.includes("SEED_RULE_TEXT") || libSrc.includes("Payments over $250 wait for the owner.")) {
  fail("api/_lib.js still exports a $250 seed rule");
} else pass("API has no $250 seed rule");
if (libSrc.includes("|| \"demo\"") || libSrc.includes("|| 'demo'") || libSrc.includes("s || \"demo\"")) {
  fail("api/_lib.js still defaults workspace to demo");
} else pass("API has no demo workspace default");
const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
if (!vercel.includes("\"/api/status\"")) fail("vercel.json missing /api/status rewrite");
else pass("vercel.json rewrites /api/status");
if (!fs.existsSync(path.join(root, "api/status.js"))) fail("api/status.js is missing");
else pass("api/status.js exists");

const preview = fs.readFileSync(path.join(root, "drop-preview.js"), "utf8");
if (preview.includes("HOLD · $250+") || preview.includes(">= 250")) {
  fail("drop-preview.js still invents a $250 hold");
} else pass("Drop does not invent a $250 hold");

const dropPage = fs.readFileSync(path.join(root, "drop.html"), "utf8");
["Drop anything", "a task, an errand, a list, an idea, a project", "value=\"task\"", "value=\"idea\"", "value=\"project\"", "value=\"build\""].forEach(function (bit) {
  if (!dropPage.includes(bit)) fail("drop.html missing drop-anything chrome: " + bit);
});
["Drop something off", "List / sell", "list the lamp"].forEach(function (bit) {
  if (dropPage.includes(bit)) fail("drop.html still has consign chrome: " + bit);
});
if (!process.exitCode) pass("drop.html reads as drop anything");
["Drop anything", "a task, an errand, a list, an idea, a project"].forEach(function (bit) {
  if (!widget.includes(bit)) fail("widget.html missing drop-anything chrome: " + bit);
});
["Drop something off", "List / sell", "list the lamp"].forEach(function (bit) {
  if (widget.includes(bit)) fail("widget.html still has consign chrome: " + bit);
});
if (!process.exitCode) pass("widget.html reads as drop anything");
const agentSrc = fs.readFileSync(path.join(root, "drop-agent.js"), "utf8");
const moreSrc = fs.readFileSync(path.join(root, "drop-more.js"), "utf8");
if (agentSrc.includes("List / sell") || moreSrc.includes("List this")) fail("Drop kinds still say List / sell");
else pass("Drop kinds are not consign-only");

const nav = fs.readFileSync(path.join(root, "desk-nav.js"), "utf8");
if (!nav.includes("href: \"/create\"") || !nav.includes("name === \"create\"")) {
  fail("desk-nav.js must treat create.html as the Create tab");
} else pass("desk-nav.js Create tab is /create");
if (!nav.includes("href: \"/history\"") || !nav.includes("name === \"history\"")) {
  fail("desk-nav.js must treat history.html as the History tab");
} else pass("desk-nav.js History tab is /history");
if (!nav.includes("href: \"/more\"") || !nav.includes("name === \"more\"")) {
  fail("desk-nav.js must treat more.html as the More tab");
} else pass("desk-nav.js More tab is /more");
if (nav.includes("href: \"/rules\"") || nav.includes("href: \"/pipes\"") || nav.includes("href: \"/people\"")) {
  fail("desk-nav.js still puts Rules / Pipes / People on the bar");
} else pass("Rules, Pipes, and People stay off the tab bar");

const morePage = fs.readFileSync(path.join(root, "more.html"), "utf8");
if (!morePage.includes("id=\"desk-nav\"") || !morePage.includes("href=\"/more\"") || !morePage.includes("This desk.")) {
  fail("more.html must be its own desk page");
} else pass("more.html is the More page");
["65 DEMO", "seedLiveBlob", "Never Vita", "dogfood", "api_fields.js", "AIA needs AIA", "Whatnot stays down"].forEach(function (bit) {
  if (morePage.includes(bit)) fail("more.html still shows crew note: " + bit);
});
if (!process.exitCode) pass("more.html has no public crew / demo notes");

const publicPages = ["index.html", "how.html", "setup.html", "login.html", "onboard.html", "help.html", "widget.html", "desk.html", "rules.html", "more.html"];
const leaks = [
  "eBay stays on hold",
  "Whatnot stays off",
  "automateitaway@gmail",
  "does not send mail",
  "Capture → Qualify",
  "Slug <b>automate-it-away",
  "placeholder=\"automate-it-away\"",
  "$250",
  "Grok",
  "the box",
  "floor-staff",
  "floor staff",
  "Over $250",
  "Phone calendar",
  "key on the box"
];
let leak = "";
publicPages.forEach((file) => {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  leaks.forEach((bit) => {
    if (html.includes(bit)) leak = file + " still shows " + bit;
  });
});
if (leak) fail(leak);
else pass("public pages have no crew build notes");
if (!fs.readFileSync(path.join(root, "index.html"), "utf8").includes("Name your desk")) fail("home missing doer copy");
else pass("home says Name your desk");
if (!fs.readFileSync(path.join(root, "how.html"), "utf8").includes("Drop the work. You tap yes or no.")) fail("how missing doer copy");
else pass("how is doer-short");
if (!fs.readFileSync(path.join(root, "setup.html"), "utf8").includes("Add a rule if you need one")) fail("setup missing doer copy");
else pass("setup is doer-short");
if (!rulesPage.includes("Add a rule. Turn a widget on. Advanced lives here.")) fail("rules missing doer copy");
else pass("rules is doer-short");
if (!login.includes("placeholder=\"Desk name\"")) fail("login still names a slug");
else pass("login placeholder is generic");
const help = fs.readFileSync(path.join(root, "help.html"), "utf8");
if (!help.includes("Waiting on a person.") || !help.includes("Owner, twice.") || !help.includes("The job.") || !help.includes("Save a file")) {
  fail("help.html missing doer button labels");
} else pass("help.html uses doer button labels");
if (jobs.includes("amount >= MONEY_HOLD && !body.confirm")) {
  fail("jobs.js still hard-codes amount >= 250 → 409");
} else if (!jobs.includes("moneyWaitOf") || !jobs.includes("moneyNeedsOwner") || !jobs.includes("status(409)")) {
  fail("jobs.js must 409 only when an owner money-wait rule matches");
} else pass("jobs.js 409s only on an owner money-wait rule");

const themed = ["index.html", "how.html", "setup.html", "onboard.html", "login.html", "desk.html", "drop.html", "widget.html", "create.html", "history.html", "rules.html", "pipes.html", "connections.html", "help.html", "more.html", "admin.html", "chat.html", "support.html", "legal.html", "pricing.html", "status.html"];
let themeMiss = "";
themed.forEach((file) => {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  if (!html.includes("theme.js") || !html.includes("theme.css") || !html.includes("data-theme-btn")) {
    themeMiss = file + " missing theme.js / theme.css / toggle";
  }
});
if (themeMiss) fail(themeMiss);
else pass("public pages carry aia_theme");

if (process.exitCode) {
  console.error("check-desk-switch failed");
  process.exit(1);
}
console.log("check-desk-switch passed");
