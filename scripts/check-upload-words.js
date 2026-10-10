// Upload limit words: every page and doc outside api/ says the real limit (3 MB per file), never 8 MB,
// and the drop page refuses a file over 3,000,000 bytes (file.size) before upload, same as api/upload.js.
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
const OLD = /\b8 ?MB\b|\b8 ?megabytes?\b|\b8,?000,?000\b|8388608|8 \* 1024 \* 1024/i;

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
files.forEach(function (rel) {
  let text;
  try { text = read(rel); } catch (e) { return; }
  if (rel === "developer.z64.txt") {
    try { text = zlib.gunzipSync(Buffer.from(text.replace(/\s+/g, ""), "base64")).toString("utf8"); }
    catch (e) { fail("could not unpack developer.z64.txt: " + e.message); return; }
  }
  seen += 1;
  text.split("\n").forEach(function (line, i) {
    const m = line.match(OLD);
    if (m) fail(rel + ":" + (i + 1) + " still states the old upload limit: " + m[0]);
  });
});
pass("checked " + seen + " pages, scripts and docs outside api/ for the old 8 MB limit");

// 2. The drop page refuses over 3,000,000 bytes before upload, with the plain line.
const NEW = "Each file must stay under 3 MB.";
const app = read("drop-app.js");
const lim = app.match(/const MAX_FILE_BYTES = (\d+);/);
if (!lim || Number(lim[1]) !== 3000000) fail("drop-app.js must set MAX_FILE_BYTES = 3000000");
else pass("drop-app.js limit is 3,000,000 bytes");
const sizeChecks = app.match(/\.size > [A-Z_0-9]+/g) || [];
if (sizeChecks.length !== 3 || sizeChecks.some(function (s) { return s !== ".size > MAX_FILE_BYTES"; })) fail("every file size check in drop-app.js must use MAX_FILE_BYTES: " + sizeChecks.join(", "));
else pass("all 3 size checks in drop-app.js use MAX_FILE_BYTES (file.size)");
if (!/if \(picked\[i\]\.size > MAX_FILE_BYTES\) \{\s*showNote\(err, "Each file must stay under 3 MB\."\);\s*return false;/.test(app)) fail("drop-app.js must refuse before upload with '" + NEW + "'");
else pass("drop-app.js refuses before upload with '" + NEW + "'");

// 3. The plain line is on the pages and docs that state the limit.
[["drop.html", "Optional. Up to 8 files. " + NEW], ["widget.html", "Optional. Up to 8 files. " + NEW], ["drop-app.js", "Optional. Up to 8 files. " + NEW], ["aia-tip.js", NEW],
 ["help.html", "each file must stay under 3 MB."], ["developer.html", "each file must stay under 3 MB."], ["PACK.md", "each file must stay under 3 MB"], ["ACCOUNT-YES-NO.md", "each file must stay under 3 MB."]].forEach(function (p) {
  if (read(p[0]).indexOf(p[1]) < 0) fail(p[0] + " must say: " + p[1]);
});
pass("drop, widget, tip, help, developer, PACK and ACCOUNT-YES-NO say each file must stay under 3 MB");

if (bad) { console.error(bad + " check(s) failed"); process.exit(1); }
console.log("check-upload-words ok");
