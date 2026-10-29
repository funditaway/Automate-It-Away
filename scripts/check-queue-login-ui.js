require("./_env-guard");
// Queue sign-in is an account login. The Queue page lists every desk.
// Shop name + code still opens that one desk with ?workspace= on the same Queue.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const base = "466ec73a95221f95df3ddab4ec77144d4b92397c";
let bad = 0;
let okN = 0;
function fail(msg) { bad += 1; console.error("FAIL " + msg); }
function ok(msg) { okN += 1; console.log("ok " + msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const BAD = [
  /desk login/i,
  /sign in to your desk/i,
  /sign-in to your desk/i,
  /sign in to this desk/i,
  /sign in to the desk/i,
  /desk sign-in/i,
  /desk sign in/i
];
const COPY_FILES = [
  "login.html",
  "onboard.html",
  "help.html",
  "theme.js",
  "legal.html",
  "examples.html",
  "setup.html",
  "doors.js",
  "login-doors.js",
  "queue-login.js"
];
COPY_FILES.forEach(function (name) {
  const text = read(name);
  let hit = "";
  BAD.forEach(function (re) {
    if (re.test(text)) hit = re.source;
  });
  if (hit) fail(name + " still has desk-login wording (" + hit + ")");
  else ok(name + " has no desk-login wording");
});

const login = read("login.html");
const onboard = read("onboard.html");
const help = read("help.html");
const theme = read("theme.js");
const picker = read("queue-login.js");
const nav = read("desk-nav.js");

if (login.indexOf("Sign in to your Queue") < 0) fail("login.html missing Sign in to your Queue");
else ok("login.html says Sign in to your Queue");
if (login.indexOf("Open my Queue") < 0) fail("login.html missing Open my Queue");
else ok("login.html says Open my Queue");
if (login.indexOf('location.href = "desk.html"') < 0) fail("email sign-in must land on the Queue");
else ok("email sign-in lands on the Queue");
if (login.indexOf("desk.html?workspace=") < 0) fail("shop name + code must stay on the Queue with ?workspace=");
else ok("shop name + code uses ?workspace= on the Queue");
if (login.indexOf("AIADesks.open") < 0 || login.indexOf("if (!r.ok)") < 0) fail("login still has to keep the desk after a real sign-in");
else ok("login still keeps the desk after a real sign-in");

if (onboard.indexOf("Open your Queue") < 0 && onboard.indexOf("Open my Queue") < 0) fail("sign-up missing Queue copy");
else ok("sign-up says Queue");
if (onboard.indexOf('location.href = "desk.html"') < 0) fail("sign-up must land on the Queue");
else ok("sign-up lands on the Queue");
if (onboard.indexOf("Sign in to your Queue") < 0) fail("sign-up header missing Sign in to your Queue");
else ok("sign-up links to Sign in to your Queue");

if (help.indexOf("Sign in to your Queue") < 0 || help.indexOf("Open my Queue") < 0) fail("help missing Queue sign-in copy");
else ok("help says Sign in to your Queue");
if (theme.indexOf("Sign in to your Queue") < 0 || theme.indexOf("Open my Queue") < 0) fail("header/footer missing Queue account link");
else ok("header and footer say Queue");
if (theme.indexOf("Desk name + code") < 0) fail("theme.js dropped Desk name + code");
else ok("shop-name door copy still in the header chip title");

if (picker.indexOf("All desks") < 0 || picker.indexOf("Add a desk") < 0) fail("desk picker missing All desks or Add a desk");
else ok("desk picker has All desks and Add a desk");
if (picker.indexOf('id="queue-desk-picker"') < 0 && picker.indexOf("queue-desk-picker") < 0) fail("picker root missing");
else ok("picker root is queue-desk-picker");
if (picker.indexOf('action: "mine"') < 0 && picker.indexOf("action:\"mine\"") < 0) fail("picker must build desks from action mine");
else ok("picker reads POST /api/desks action mine");
if (picker.indexOf("workspace") < 0 || picker.indexOf("searchParams") < 0) fail("desk filter must use the ?workspace= query");
else ok("desk filter uses ?workspace=");
if (picker.indexOf("scope=account") < 0 || picker.indexOf("allDesks") < 0) fail("picker must feature-detect a future all-desks read");
else ok("future all-desks read is feature-detected");
if (picker.indexOf("/api/jobs?workspace=") < 0) fail("All desks must fetch each desk until an all-desks read exists");
else ok("All desks fetches each desk from the mine list");
if (nav.indexOf("queue-login.js") < 0) fail("desk-nav must load the Queue picker");
else ok("Queue page loads the picker");

["checkout", "charge", "buy-pack"].forEach(function (bit) {
  if (picker.indexOf(bit) >= 0) fail("queue-login.js must not " + bit);
  else ok("queue-login.js has no " + bit);
});

const deskBytes = fs.statSync(path.join(root, "desk.html")).size;
if (deskBytes !== 35012) fail("desk.html is " + deskBytes + " bytes, want 35012");
else ok("desk.html is 35012 bytes");

let before = [];
try {
  before = execSync("git ls-tree -r --name-only " + base + " -- api", { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(function (p) { return /^api\/[a-z][^/]*\.js$/.test(p) && p.indexOf("/_") < 0; });
} catch (e) {
  fail("could not list api routes on " + base);
}
const now = fs.readdirSync(path.join(root, "api")).filter(function (f) {
  return /^[a-z].*\.js$/.test(f) && f.indexOf("_") !== 0;
}).map(function (f) { return "api/" + f; });
const known = {};
before.forEach(function (p) { known[p] = true; });
const added = now.filter(function (p) { return !known[p]; });
if (added.length) fail("new api route files: " + added.join(", "));
else ok("no new api route files vs " + base.slice(0, 7));

if (bad) {
  console.error("check-queue-login-ui: " + okN + " ok, " + bad + " failed");
  process.exit(1);
}
console.log("check-queue-login-ui: " + okN + " ok, 0 failed");
