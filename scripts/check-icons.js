#!/usr/bin/env node
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
const BOLT = "148,22 58,138";

function pngSize(file) {
  const buf = fs.readFileSync(file);
  if (buf[0] !== 0x89 || buf.slice(1, 4).toString() !== "PNG") {
    throw new Error(path.basename(file) + " is not a PNG");
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
}

function mustPng(rel, w, h, minBytes) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    fail(rel + " missing");
    return;
  }
  try {
    const info = pngSize(file);
    if (info.width !== w || info.height !== h) fail(rel + " is " + info.width + "x" + info.height + ", want " + w + "x" + h);
    else if (info.bytes < minBytes) fail(rel + " is a stub (" + info.bytes + " bytes)");
    else pass(rel + " " + w + "x" + h);
  } catch (err) {
    fail(String(err.message || err));
  }
}

mustPng("apple-touch-icon.png", 180, 180, 2000);
mustPng("apple-touch-icon-precomposed.png", 180, 180, 2000);
mustPng("img/icon-192.png", 192, 192, 2000);
mustPng("img/icon-512.png", 512, 512, 4000);
mustPng("img/og.png", 1200, 630, 4000);

const ico = path.join(root, "favicon.ico");
if (!fs.existsSync(ico)) fail("favicon.ico missing");
else {
  const buf = fs.readFileSync(ico);
  if (buf.length < 1000 || buf[0] !== 0 || buf[1] !== 0 || buf[2] !== 1 || buf[4] < 3) {
    fail("favicon.ico is not a multi-size ICO");
  } else pass("favicon.ico " + buf.length + " bytes, " + buf[4] + " sizes");
}

const svg = fs.readFileSync(path.join(root, "favicon.svg"), "utf8");
if (svg.includes(BOLT) || /lightning|bolt/i.test(svg)) fail("favicon.svg still has the bolt");
else if (!svg.includes("128,36") || !svg.includes("#0d6b6b") || !svg.includes("#ffffff")) {
  fail("favicon.svg is not the header pyramid");
} else pass("favicon.svg is the AIA pyramid");

const header = fs.readFileSync(path.join(root, "img", "aia-pyramid-header.svg"), "utf8");
if (!header.includes("M40 196 L128 36 L216 196 L128 220")) fail("header mark missing pyramid path");
else pass("header pyramid still the source mark");

const manifest = JSON.parse(fs.readFileSync(path.join(root, "site.webmanifest"), "utf8"));
const srcs = (manifest.icons || []).map((i) => i.src + " " + i.type);
if (!srcs.some((s) => s.includes("/img/icon-192.png") && s.includes("png"))) fail("manifest missing 192 PNG");
else pass("manifest 192 PNG");
if (!srcs.some((s) => s.includes("/img/icon-512.png") && s.includes("png"))) fail("manifest missing 512 PNG");
else pass("manifest 512 PNG");
if ((manifest.icons || []).some((i) => /bolt|lightning/i.test(i.src))) fail("manifest still points at a bolt");
else pass("manifest has no bolt path");

const htmlFiles = fs.readdirSync(root).filter((f) => f.endsWith(".html"));
htmlFiles.forEach((file) => {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  if (html.includes(BOLT)) fail(file + " still embeds the bolt");
  const apple = html.match(/<link\s+rel="apple-touch-icon"[^>]*>/i);
  if (!apple) {
    fail(file + " missing apple-touch-icon");
    return;
  }
  if (!/href="\/apple-touch-icon\.png"/.test(apple[0])) fail(file + " apple-touch-icon href is not /apple-touch-icon.png");
  else pass(file + " apple-touch-icon");
  if (!html.includes('href="/favicon.svg"')) fail(file + " missing /favicon.svg");
  if (!html.includes('href="/favicon.ico"')) fail(file + " missing /favicon.ico");
  if (!html.includes('href="/site.webmanifest"')) fail(file + " missing manifest");
});

const analytics = fs.readFileSync(path.join(root, "analytics.js"), "utf8");
["/favicon.svg", "/favicon.ico", "/apple-touch-icon.png", "/site.webmanifest"].forEach((href) => {
  if (!analytics.includes(href)) fail("analytics.js missing " + href);
  else pass("analytics.js " + href);
});

const theme = fs.readFileSync(path.join(root, "theme.js"), "utf8");
["ensureIcons", "/apple-touch-icon.png", "/favicon.ico", "/site.webmanifest"].forEach((bit) => {
  if (!theme.includes(bit)) fail("theme.js missing " + bit);
  else pass("theme.js " + bit);
});

const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
if (!index.includes("https://automateitaway.com/img/og.png")) fail("index.html og:image must be PNG for iOS share");
else pass("index.html og:image PNG");

const walk = [root];
while (walk.length) {
  const dir = walk.pop();
  fs.readdirSync(dir, { withFileTypes: true }).forEach((ent) => {
    if (ent.name === ".git" || ent.name === "node_modules") return;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk.push(full);
    else if (/\.(svg|html|js|json|css|md)$/i.test(ent.name)) {
      if (ent.name === "check-icons.js") return;
      const text = fs.readFileSync(full, "utf8");
      if (text.includes(BOLT)) fail(path.relative(root, full) + " still has the bolt polygon");
    }
  });
}

if (process.exitCode) {
  console.error("check-icons failed");
  process.exit(1);
}
console.log("check-icons passed");
