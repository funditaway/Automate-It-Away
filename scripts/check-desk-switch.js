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
if (!widget.includes("Drop for") || !widget.includes("This desk only.")) fail("widget copy missing");
else pass("widget copy is desk-scoped");

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
if (!desk.includes("Change shop") || !desk.includes("Open another") || !desk.includes("switchDesk")) {
  fail("desk.html missing switcher");
} else pass("desk.html can switch saved desks");
if (desk.includes("|| \"demo\"") || desk.includes("|| 'demo'")) fail("desk.html still falls back to demo");
else pass("desk.html has no demo fallback");
if (!desk.includes("Empty is honest") || !desk.includes("This desk only.")) fail("desk copy missing");
else pass("desk queue/rules copy");

const jobs = fs.readFileSync(path.join(root, "api/jobs.js"), "utf8");
if (!jobs.includes("Open a desk first.") || jobs.includes("workspaceOf(req)")) {
  fail("jobs.js should reject a blank workspace and not call workspaceOf");
} else pass("jobs.js rejects a blank workspace");

if (process.exitCode) {
  console.error("check-desk-switch failed");
  process.exit(1);
}
console.log("check-desk-switch passed");
