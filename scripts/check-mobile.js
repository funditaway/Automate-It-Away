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
if (js.indexOf("Sign in") < 0 || js.indexOf('"/account"') < 0 || js.indexOf("New desk") < 0) {
  fail("signed-in / signed-out copy drifted");
} else {
  pass("account chip copy intact");
}
if (!nav.includes("kb-open")) fail("desk-nav.js must hide the bar when the keyboard is open");
else pass("desk-nav hides on keyboard");
if (js.indexOf("paintSiteNav") < 0 || js.indexOf("paintFooter") < 0 || js.indexOf("site-foot") < 0) {
  fail("theme.js missing shared site nav / footer");
} else {
  pass("theme.js paints one header and one footer");
}
if (!css.includes(".site-foot") || !css.includes(".site-nav")) {
  fail("theme.css missing site-foot / site-nav");
} else {
  pass("theme.css styles shared chrome");
}
if (!css.includes("auto-fit") || !css.includes("minmax(min(100%")) {
  fail("theme.css missing auto-fit minmax grids");
} else {
  pass("shared grids use auto-fit minmax");
}

const preview = fs.readFileSync(path.join(root, "drop-preview.js"), "utf8");
const navCss = fs.readFileSync(path.join(root, "desk-nav.css"), "utf8");
const fix = fs.readFileSync(path.join(root, "ui-fix.css"), "utf8");
if (preview.indexOf("flex-direction:column") < 0 || preview.indexOf('class=\\"v\\"') < 0) {
  fail("drop-preview verify cells must stack label over value");
} else {
  pass("drop-preview stacks This drop cells");
}
if (navCss.indexOf(".verify-cells button") < 0 || fix.indexOf("flex-direction: column") < 0) {
  fail("desk-nav/ui-fix must override global button flex on verify cells");
} else {
  pass("global button flex does not smash two-line cells");
}
if (js.indexOf("chip.tagName !== \"A\"") < 0) {
  fail("theme.js must not steal a non-link #who-chip");
} else {
  pass("account chip ignores foreign #who-chip");
}

if (process.exitCode) {
  console.error("check-mobile failed");
  process.exit(1);
}
console.log("check-mobile passed");
