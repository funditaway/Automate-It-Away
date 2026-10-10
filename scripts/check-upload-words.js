// Upload limit words: every page and doc outside api/ says the real limit (3 MB per file), never 8 MB or 3.5 MB,
// and the drop page and desk.html's Drop anything sheet refuse a file over 3,000,000 bytes (file.size) before upload,
// same as api/upload.js.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.join(__dirname, "..");
let bad = 0;
function fail(msg) { bad += 1; console.error("FAIL " + msg); }
function pass(msg) { console.log("ok " + msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

// Build output (dist) and installed packages are not our pages; other checks build queue/dist and runtime/dist locally.
const SKIP_DIRS = { ".git": 1, "node_modules": 1, "dist": 1, "api": 1, "img": 1, ".vercel": 1 };
const TEXT = /\.(html|js|mjs|md|txt|css|json)$/i;
const SELF = path.join("scripts", "check-upload-words.js");
const OLD = /\b8 ?MB\b|\b8 ?MiB\b|\b8 ?megabytes?\b|\b8,?000,?000\b|\b8_000_000\b|8388608|8 \* 1024 \* 1024/i;
// The old 3.5 MB page limit (desk.html's Drop anything sheet) is gone too: Vercel's 4.5 MB body limit cut in first near it.
const OLD_35 = /\b3\.5 ?MB\b|\b3\.5 ?megabytes?\b|\b3,500,000\b|\b3500000\b|\b3_500_000\b/i;
const NEW = "Each file must stay under 3 MB.";
// Every line is read on its own, so a file that also has the 3 MB line is still flagged for an old number.
function oldLimits(text) {
  const hits = [];
  String(text).split("\n").forEach(function (line, i) {
    const m = line.match(OLD) || line.match(OLD_35);
    if (m) hits.push({ line: i + 1, text: m[0] });
  });
  return hits;
}
// The scanner itself: each old form is caught, even beside the new line; the new line alone is clean.
[["8 MB", "Up to 8 MB."], ["8MB", "max 8MB"], ["8 MiB", "Up to 8 MiB."], ["8MiB", "max 8MiB"], ["8000000", "if (f.size > 8000000)"], ["8,000,000", "8,000,000 bytes"],
 ["8_000_000", "const MAX = 8_000_000;"], ["3.5MB", "Photo over 3.5MB."], ["3.5 MB", "under 3.5 MB"], ["3500000", "if (file.size > 3500000)"], ["3,500,000", "3,500,000 bytes"], ["3_500_000", "const MAX = 3_500_000;"]].forEach(function (c) {
  const hits = oldLimits(NEW + "\n" + c[1] + "\n" + NEW);
  if (hits.length !== 1 || hits[0].line !== 2) fail("the scanner must flag '" + c[0] + "' even in a file that also says the 3 MB line, got " + JSON.stringify(hits));
});
if (oldLimits(NEW + "\nMAX_FILE_BYTES = 3000000\n3,000,000 bytes").length) fail("the 3 MB line and 3,000,000 must not be flagged");
pass("scanner flags 8 MB / 8 MiB / 8000000 / 8_000_000 / 3.5 MB / 3500000 / 3,500,000 per line, even beside the 3 MB line");

function walk(dir, out) {
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).forEach(function (e) {
    const rel = dir ? path.join(dir, e.name) : e.name;
    if (e.isDirectory()) { if (!SKIP_DIRS[e.name] && !(dir === "" && e.name === "api")) walk(rel, out); return; }
    if (e.isFile() && TEXT.test(e.name) && rel !== SELF) out.push(rel);
  });
  return out;
}

// 1. No page, script or doc outside api/ says 8 MB (the packed Creators Studio copy is unpacked and read too).
const files = walk("", []);
let seen = 0;
let sawPacked = false;
files.forEach(function (rel) {
  let text;
  try { text = read(rel); } catch (e) { return; }
  if (rel === "developer.z64.txt") {
    try { text = zlib.gunzipSync(Buffer.from(text.replace(/\s+/g, ""), "base64")).toString("utf8"); }
    catch (e) { fail("could not unpack developer.z64.txt: " + e.message); return; }
  }
  seen += 1;
  if (rel === "developer.z64.txt") {
    if (text.indexOf("Desk card uploads: each file must stay under 3 MB.") < 0) fail("the unpacked developer.z64.txt must still say: Desk card uploads: each file must stay under 3 MB.");
    else pass("unpacked developer.z64.txt says each file must stay under 3 MB");
    sawPacked = true;
  }
  oldLimits(text).forEach(function (h) {
    fail(rel + ":" + h.line + " still states an old upload limit: " + h.text);
  });
});
if (!sawPacked) fail("developer.z64.txt must be there and unpack");
pass("checked " + seen + " pages, scripts and docs outside api/ for the old 8 MB and 3.5 MB limits");

// 2. The drop page refuses over 3,000,000 bytes before upload, with the plain line.
const app = read("drop-app.js");
const lim = app.match(/const MAX_FILE_BYTES = (\d+);/);
if (!lim || Number(lim[1]) !== 3000000) fail("drop-app.js must set MAX_FILE_BYTES = 3000000");
else pass("drop-app.js limit is 3,000,000 bytes");
const sizeChecks = app.match(/\.size > [A-Z_0-9]+/g) || [];
if (sizeChecks.length !== 3 || sizeChecks.some(function (s) { return s !== ".size > MAX_FILE_BYTES"; })) fail("every file size check in drop-app.js must use MAX_FILE_BYTES: " + sizeChecks.join(", "));
else pass("all 3 size checks in drop-app.js use MAX_FILE_BYTES (file.size)");
if (!/if \(picked\[i\]\.size > MAX_FILE_BYTES\) \{\s*showNote\(err, "Each file must stay under 3 MB\."\);\s*return false;/.test(app)) fail("drop-app.js must refuse before upload with '" + NEW + "'");
else pass("drop-app.js refuses before upload with '" + NEW + "'");

// 2b. desk.html's Drop anything sheet: same 3,000,000-byte limit (file.size), refused before any request, same line.
const desk = read("desk.html");
const cap = (desk.match(/async function capture\(\) \{[\s\S]*?\n    \}\n/) || [""])[0];
const deskSizes = cap.match(/\.size > \d+/g) || [];
if (!cap) fail("desk.html must keep capture() for the Drop anything sheet");
else if (deskSizes.length !== 1 || deskSizes[0] !== ".size > 3000000") fail("desk.html must refuse a file over 3000000 bytes (file.size), got " + JSON.stringify(deskSizes));
else pass("desk.html limit is 3,000,000 bytes (file.size)");
const refuse = cap.match(/if \(file\.size > 3000000\) \{ document\.getElementById\("banner"\)\.textContent = "([^"]*)"; return; \}/);
if (!refuse || refuse[1] !== NEW) fail("desk.html must show exactly '" + NEW + "' when a file is too big, got " + JSON.stringify(refuse && refuse[1]));
else if (refuse.index > cap.indexOf("readAsDataURL") || refuse.index > cap.indexOf("api(")) fail("desk.html must refuse before reading the file or sending any request");
else pass("desk.html refuses before any request with '" + NEW + "'");

// 3. The plain line is on the pages and docs that state the limit.
[["drop.html", "Optional. Up to 8 files. " + NEW], ["widget.html", "Optional. Up to 8 files. " + NEW], ["drop-app.js", "Optional. Up to 8 files. " + NEW], ["aia-tip.js", NEW],
 ["help.html", "each file must stay under 3 MB."], ["developer.html", "each file must stay under 3 MB."], ["PACK.md", "each file must stay under 3 MB"], ["ACCOUNT-YES-NO.md", "each file must stay under 3 MB."]].forEach(function (p) {
  if (read(p[0]).indexOf(p[1]) < 0) fail(p[0] + " must say: " + p[1]);
});
pass("drop, widget, tip, help, developer, PACK and ACCOUNT-YES-NO say each file must stay under 3 MB");

if (bad) { console.error(bad + " check(s) failed"); process.exit(1); }
console.log("check-upload-words ok");
