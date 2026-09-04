const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

const root = path.join(__dirname, "..");
const pages = ["desk.html", "drop.html", "widget.html", "pipes.html", "connections.html", "help.html", "rules.html", "more.html"];
const need = ["Queue", "Drop", "Rules", "Pipes", "More", "has-desk-nav", "id=\"desk-nav\""];

pages.forEach((file) => {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  need.forEach((bit) => {
    if (!html.includes(bit)) fail(file + " missing " + bit);
  });
  if (!html.includes("desk-nav.css") && !html.includes("#desk-nav{")) {
    fail(file + " has no desk-nav CSS");
  }
  if (!/class="has-desk-nav"/.test(html)) fail(file + " body missing has-desk-nav");
  else pass(file + " has five tabs + bar CSS");
  if (html.includes("data-tab=\"history\"") || html.includes("data-tab=\"people\"")) {
    fail(file + " still has History / People on the tab bar");
  }
});

const desk = fs.readFileSync(path.join(root, "desk.html"), "utf8");
if (!desk.includes("desk-tabs")) fail("desk.html missing header tabs");
else pass("desk header shows Queue · Drop · Rules · Pipes · More");
if (!desk.includes("data-tab=\"rules\"") || !desk.includes("data-tab=\"pipes\"")) {
  fail("desk.html missing Rules / Pipes tabs");
} else pass("desk tabs are Queue Drop Rules Pipes More");
if (!desk.includes("href=\"/pipes\"")) fail("desk.html Pipes tab is not /pipes");
else pass("desk Pipes tab href is /pipes");
const drop = fs.readFileSync(path.join(root, "drop.html"), "utf8");
if (!drop.includes("data-tab=\"rules\"") || !drop.includes("data-tab=\"pipes\"")) {
  fail("drop.html missing Rules / Pipes tabs");
} else pass("drop tabs are Queue Drop Rules Pipes More");
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
pages.concat(["desk-nav.js"]).forEach((file) => {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  if (html.includes("/desk#rules") && file !== "desk-nav.js") fail(file + " still links Rules to /desk#rules");
});
const nav = fs.readFileSync(path.join(root, "desk-nav.js"), "utf8");
if (!nav.includes("href: \"/rules\"") || !nav.includes("href: \"/pipes\"")) fail("desk-nav.js missing Rules / Pipes hrefs");
else pass("Rules and Pipes hrefs are set");
if (!nav.includes("name === \"rules\"") || !nav.includes("name === \"pipes\"")) fail("desk-nav.js must highlight /rules and /pipes");
else pass("Rules and Pipes tabs highlight their pages");
if (nav.includes("href: \"/history\"") || nav.includes("href: \"/people\"")) fail("desk-nav.js still puts History / People on the bar");
else pass("History and People are off the tab bar");
if (!nav.includes("href: \"/more\"") || !nav.includes("name === \"more\"")) fail("desk-nav.js More href is not /more");
else pass("More tab href is /more");
if (!nav.includes("href: \"/drop\"") || !nav.includes("return \"/drop\"")) fail("desk-nav.js Drop href is not /drop");
else pass("Drop tab href is /drop");
if (/display:\s*none/.test(desk) && /header span a/.test(desk)) {
  fail("desk.html still hides header links on phone");
}

const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
if (!/"source": "\/pipes"/.test(vercel) || !/\/pipes\.html/.test(vercel)) {
  fail("vercel.json must rewrite /pipes to pipes.html");
} else pass("/pipes rewrites to the Pipes page");
if (!/"source": "\/drop"/.test(vercel) || !/\/drop\.html/.test(vercel)) {
  fail("vercel.json must rewrite /drop to drop.html");
} else pass("/drop rewrites to the Drop page");
if (!fs.existsSync(path.join(root, "drop.html"))) fail("drop.html missing — Vercel cleanUrls 404s /drop");
else pass("drop.html exists for /drop");
if (!fs.existsSync(path.join(root, "pipes.html"))) fail("pipes.html missing — Vercel cleanUrls 404s /pipes");
else pass("pipes.html exists for /pipes");

const theme = fs.readFileSync(path.join(root, "theme.css"), "utf8");
if (theme.includes("header span a { display: none; }")) {
  fail("theme.css still hides header links — iOS then has no Pipes/More");
} else pass("theme.css keeps header tabs visible");

const css = fs.readFileSync(path.join(root, "desk-nav.css"), "utf8");
if (!css.includes("#desk-nav") || !css.includes("position: fixed")) fail("desk-nav.css missing fixed bar");
else pass("desk-nav.css paints the bottom bar");

if (process.exitCode) {
  console.error("check-desk-nav failed");
  process.exit(1);
}
console.log("check-desk-nav passed");
