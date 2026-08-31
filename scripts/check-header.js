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
const files = fs.readdirSync(root).filter((f) => f.endsWith(".html") && f !== "drop.html");

files.forEach((file) => {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  const m = html.match(/<header\b[\s\S]*?<\/header>/i);
  if (!m) {
    fail(file + " has no header");
    return;
  }
  const hdr = m[0];
  if (!hdr.includes('class="brand"')) fail(file + " header missing class=brand");
  if (!hdr.includes('class="brand-name">Automate It Away</span>')) {
    fail(file + " header wordmark is not Automate It Away");
  } else {
    pass(file + " wordmark");
  }
  if (/AUTOMATE\s/.test(hdr) || /automateitaway\.com/.test(hdr)) {
    fail(file + " still uses old header text");
  }
  if (hdr.includes("brand-mark") === false) fail(file + " missing brand-mark");
});

const theme = fs.readFileSync(path.join(root, "theme.css"), "utf8");
if (!theme.includes("font: 700 16px/1.15")) fail("theme.css missing 16px wordmark lock");
else pass("theme.css locks 16px wordmark");

const js = fs.readFileSync(path.join(root, "theme.js"), "utf8");
if (!js.includes("aia-header-lock")) fail("theme.js missing header lock");
else pass("theme.js injects header lock");
if (!js.includes("paintWho") || !js.includes("who-chip")) fail("theme.js missing signed-in profile chip");
else pass("theme.js paints signed-in profile");
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
