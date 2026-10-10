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
const files = fs.readdirSync(root).filter((f) => f.endsWith(".html"));

files.forEach((file) => {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  const m = html.match(/<header\b[\s\S]*?<\/header>/i);
  if (!m) {
    fail(file + " has no header");
    return;
  }
  const hdr = m[0];
  if (!hdr.includes('class="brand"')) fail(file + " header missing class=brand");
  if (!hdr.includes('class="brand-name">AIA</span>')) {
    fail(file + " header wordmark is not AIA");
  } else {
    pass(file + " wordmark");
  }
  const mark = hdr.match(/<img class="brand-mark"[^>]*>/);
  if (mark && !/\balt=""/.test(mark[0])) fail(file + " header logo alt must be empty so screen readers say only AIA");
  if (/AUTOMATE\s/.test(hdr) || /automateitaway\.com/.test(hdr)) {
    fail(file + " still uses old header text");
  }
  if (hdr.includes("brand-mark") === false) fail(file + " missing brand-mark");
});

const theme = fs.readFileSync(path.join(root, "theme.css"), "utf8");
if (!theme.includes("font: 700 16px/1.15")) fail("theme.css missing 16px wordmark lock");
else pass("theme.css locks 16px wordmark");

const js = fs.readFileSync(path.join(root, "theme.js"), "utf8");
if (js.includes('img.setAttribute("alt", "Automate It Away")')) fail("theme.js must not fill an empty logo alt");
else pass("theme.js leaves an empty logo alt empty");
// Every alt theme.js sets (the fallback logo, the empty-alt fill, inline img markup) must be empty.
const altSets = [];
js.replace(/\.alt\s*=\s*(["'])([\s\S]*?)\1/g, function (_, q, v) { altSets.push(v); return _; });
js.replace(/setAttribute\(\s*["']alt["']\s*,\s*(["'])([\s\S]*?)\1/g, function (_, q, v) { altSets.push(v); return _; });
js.replace(/\balt=(?:\\?["'])([^"'\\]*)(?:\\?["'])/g, function (_, v) { altSets.push(v); return _; });
const fullAlts = altSets.filter(function (v) { return v !== ""; });
if (fullAlts.length) fail("theme.js must not set a non-empty logo alt: " + fullAlts.join(" | "));
else pass("theme.js sets only empty alts (" + altSets.length + " found)");
if (/alt\s*=\s*\\?["']Automate It Away|setAttribute\(\s*["']alt["']\s*,\s*["']Automate It Away/.test(js)) fail("theme.js must not use Automate It Away as an alt");
else pass("theme.js never uses Automate It Away as an alt");
if (!js.includes("aia-header-lock")) fail("theme.js missing header lock");
else pass("theme.js injects header lock");
if (!js.includes("paintWho") || !js.includes("who-chip")) fail("theme.js missing signed-in profile chip");
else pass("theme.js paints signed-in profile");
if (js.indexOf('if (r === "agent") return "Agent"') >= 0) fail("theme.js roleLabel still says Agent");
else pass("theme.js roleLabel does not say Agent");
if (js.indexOf('if (r === "agent") return "Desk AI"') < 0) fail("theme.js roleLabel must say Desk AI");
else pass("theme.js roleLabel maps agent to Desk AI");
if (!js.includes("Desk name + code")) fail("signed-out chip must not say email login");
else pass("signed-out copy is desk name + code");
const css = fs.readFileSync(path.join(root, "theme.css"), "utf8");
if (!css.includes(".who-chip")) fail("theme.css missing .who-chip");
else pass("theme.css styles the profile chip");

if (process.exitCode) {
  console.error("check-header failed");
  process.exit(1);
}
console.log("check-header passed");
