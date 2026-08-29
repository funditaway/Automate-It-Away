const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

const root = path.join(__dirname, "..");
const pages = ["desk.html", "widget.html", "connections.html", "help.html", "rules.html"];
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
});

const desk = fs.readFileSync(path.join(root, "desk.html"), "utf8");
if (!desk.includes("desk-tabs")) fail("desk.html missing header tabs");
else pass("desk header shows Queue · Drop · Rules · Pipes · More");
pages.concat(["desk-nav.js"]).forEach((file) => {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  if (html.includes("/desk#rules") && file !== "desk-nav.js") fail(file + " still links Rules to /desk#rules");
});
const nav = fs.readFileSync(path.join(root, "desk-nav.js"), "utf8");
if (!nav.includes("href: \"/rules\"")) fail("desk-nav.js Rules href is not /rules");
else pass("Rules tab href is /rules");
if (/display:\s*none/.test(desk) && /header span a/.test(desk)) {
  fail("desk.html still hides header links on phone");
}

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
