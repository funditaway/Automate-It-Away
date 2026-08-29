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
if (!widget.includes("AIADesks.captureDesk") || !widget.includes("location.replace(\"/onboard\")")) {
  fail("widget.html must send missing desks to /onboard");
} else pass("widget.html goes to /onboard when no desk");
if (!widget.includes("This desk only.")) fail("widget copy missing");
else pass("widget copy is desk-scoped");
if (!widget.includes("nouns") && !widget.includes("NOUNS.capture") && !widget.includes("nouns.capture")) {
  fail("widget.html must speak owner nouns");
} else pass("widget.html uses owner nouns");

const onboard = fs.readFileSync(path.join(root, "onboard.html"), "utf8");
if (!onboard.includes("Name this desk") || !onboard.includes("Open it") || !onboard.includes("AIADesks.open")) {
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
if (!desk.includes("Nothing here yet.") || !desk.includes("Wait for the owner.")) fail("desk copy missing");
else pass("desk queue/rules copy");
if (!desk.includes("widget-count") || !desk.includes("rule-widgets") || !desk.includes("/rules")) {
  fail("desk.html missing widget count or /rules link");
} else pass("desk.html shows widget count and /rules");
if (!desk.includes("noun-capture") || !desk.includes("action: \"nouns\"")) fail("desk.html missing nouns editor");
else pass("desk.html can save nouns");

const jobs = fs.readFileSync(path.join(root, "api/jobs.js"), "utf8");
if (!jobs.includes("Open a desk first.") || jobs.includes("workspaceOf(req)")) {
  fail("jobs.js should reject a blank workspace and not call workspaceOf");
} else pass("jobs.js rejects a blank workspace");
if (!jobs.includes("ensureNouns") || !jobs.includes("nouns:")) fail("jobs.js should return desk nouns");
else pass("jobs.js returns nouns");

const rulesPage = fs.readFileSync(path.join(root, "rules.html"), "utf8");
if (!rulesPage.includes("id=\"desk-nav\"") || !rulesPage.includes("href=\"/rules\"") || !rulesPage.includes("/api/rules")) {
  fail("rules.html must be its own desk page");
} else pass("rules.html is the Rules page");
if (!rulesPage.includes("action: \"widget\"") || !rulesPage.includes("widget-count")) {
  fail("rules.html must toggle widgets and show the count");
} else pass("rules.html toggles rule widgets");
if (!rulesPage.includes("action: \"nouns\"")) fail("rules.html should save nouns");
else pass("rules.html saves nouns");

const nav = fs.readFileSync(path.join(root, "desk-nav.js"), "utf8");
if (!nav.includes("href: \"/rules\"") || !nav.includes("name === \"rules\"")) {
  fail("desk-nav.js must treat rules.html as the Rules tab");
} else pass("desk-nav.js Rules tab is /rules");

const publicPages = ["index.html", "how.html", "setup.html", "login.html", "onboard.html", "help.html", "widget.html", "desk.html", "rules.html"];
const leaks = [
  "eBay stays on hold",
  "Whatnot stays off",
  "automateitaway@gmail",
  "does not send mail",
  "Capture → Qualify",
  "Slug <b>automate-it-away",
  "placeholder=\"automate-it-away\""
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
if (!rulesPage.includes("Turn a widget on if this desk needs another drop")) fail("rules missing doer copy");
else pass("rules is doer-short");
if (!login.includes("placeholder=\"Desk name\"")) fail("login still names a slug");
else pass("login placeholder is generic");

if (process.exitCode) {
  console.error("check-desk-switch failed");
  process.exit(1);
}
console.log("check-desk-switch passed");
