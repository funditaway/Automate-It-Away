const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) {
  console.log("ok  " + msg);
}

const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "theme.css"), "utf8");
const js = fs.readFileSync(path.join(root, "theme.js"), "utf8");
const nav = fs.readFileSync(path.join(root, "desk-nav.js"), "utf8");

if (/\.who-chip span\s*,/.test(css) || /\.who-chip span\s*\{/.test(css)) {
  fail("theme.css must not style every .who-chip span — that paints a blank white pill");
} else {
  pass("who-chip does not blanket-style span");
}
if (!css.includes(".who-copy strong") || !css.includes("font-size: 16px")) {
  fail("theme.css missing who-copy lock or 16px inputs");
} else {
  pass("chip label + 16px inputs");
}
if (!css.includes("kb-open") || !css.includes("100dvh")) {
  fail("theme.css missing keyboard / dvh phone rules");
} else {
  pass("keyboard hide + dvh");
}
if (!js.includes("liftChrome") || !js.includes("ensurePhoneMeta")) {
  fail("theme.js missing liftChrome / ensurePhoneMeta");
} else {
  pass("theme.js lifts chip onto the header row");
}
if (!js.includes("Desk name + code") || js.indexOf('"/account"') < 0) {
  fail("signed-in / signed-out copy drifted");
} else {
  pass("account chip copy intact");
}
if (!nav.includes("kb-open")) fail("desk-nav.js must hide the bar when the keyboard is open");
else pass("desk-nav hides on keyboard");
if (!js.includes("paintSiteNav") || !js.includes("paintFooter") || !js.includes("Open your desk")) {
  fail("theme.js missing shared site nav / footer");
} else {
  pass("theme.js paints one header and one footer");
}
if (!css.includes(".site-foot") || !css.includes(".site-nav")) {
  fail("theme.css missing site-foot / site-nav");
} else {
  pass("theme.css styles shared chrome");
}

if (process.exitCode) {
  console.error("check-mobile failed");
  process.exit(1);
}
console.log("check-mobile passed");
