// Asserts for #266 Studio Packs ownership UI (packs-own.html / packs-own.js)
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

var localFail = 0;
function fail(msg) { console.error("FAIL " + msg); localFail = 1; process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }

const root = path.join(__dirname, "..");
const htmlPath = path.join(root, "packs-own.html");
const jsPath = path.join(root, "packs-own.js");

if (!fs.existsSync(htmlPath)) fail("packs-own.html missing");
else pass("packs-own.html present");
if (!fs.existsSync(jsPath)) fail("packs-own.js missing");
else pass("packs-own.js present");

const html = fs.readFileSync(htmlPath, "utf8");
const js = fs.readFileSync(jsPath, "utf8");

if (js.includes("PLACEHOLDER") || js.includes("LOAD_FROM")) fail("packs-own.js looks like a stub");
else pass("packs-own.js real contents");
if (js.length < 2000) fail("packs-own.js too small");
else pass("packs-own.js size ok");

const chk = spawnSync(process.execPath, ["--check", jsPath], { encoding: "utf8" });
if (chk.status !== 0) fail("packs-own.js node --check: " + (chk.stderr || chk.stdout || "fail"));
else pass("packs-own.js parses");

[
  ["Your packs", html],
  ["Put on a desk", html + js],
  ["Put on more desks", html + js],
  ["A pack can change how a desk works", html + js],
  ["Buy once", html + js],
  ["Money stays off until you tap Yes", html],
  ["data-activate", js],
  ["data-multi", js],
  ["use-pack", js],
  ["unlist-pack", js],
  ["Muse Pack", html],
  ["Meta Official Packs", html],
  ["data-yes-shell", html + js],
  ["Yes", html],
  ["Stop", html],
  ["Give pack", html],
  ["Install pack", html],
  ["List a pack", html],
  ["Queue", html],
  ["Drop", html],
  ["Create", html],
  ["History", html],
  ["More", html]
].forEach(function (pair) {
  if (!pair[1].includes(pair[0])) fail("missing " + pair[0]);
  else pass(pair[0]);
});

// No tip SHA / PASS/FAIL / HOLD jargon / mint how-to on public ownership face
if (/\bPASS\b|\bFAIL\b|tip SHA|mint how-to|crew-speak/i.test(html)) fail("ownership page has probe jargon");
else pass("no probe jargon on ownership page");
if (html.includes("Collect stays HOLD") || html.includes("Collect HOLD")) fail("ownership page should use plain money words, not HOLD jargon");
else pass("ownership page plain money words");

// No invented Market / Wallet.AIA / live Collect charge / mesh
["Wallet.AIA", "silent charge", "mesh of Desk", "CDN Market", ".aia Market"].forEach(function (bad) {
  if (html.includes(bad) || js.includes(bad)) fail("must not invent " + bad);
});
pass("no invented Market/Wallet/mesh");

const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
if (!vercel.includes("/packs-own.html")) fail("vercel missing packs-own rewrite");
else pass("vercel /own → packs-own");

const more = fs.readFileSync(path.join(root, "more.html"), "utf8");
if (!more.includes('href="/own"')) fail("more.html missing Your packs");
else pass("more links Your packs");

const account = fs.readFileSync(path.join(root, "account.html"), "utf8");
if (!account.includes('href="/own"')) fail("account.html missing Your packs");
else pass("account links Your packs");

const market = fs.readFileSync(path.join(root, "market-shop.js"), "utf8");
if (!market.includes("/own")) fail("market-shop missing Your packs");
else pass("market links Your packs");
if (!market.includes("Buy once") || !market.includes("change how a desk")) fail("market missing buy-once honesty");
else pass("market buy-once honesty");

// Do not regress Yes/Start/Stop or invent /api/packs
if (js.includes("/api/packs")) fail("packs-own must use /api/desks, not /api/packs");
else pass("packs-own uses /api/desks");

if (localFail) {
  console.error("check-packs-own failed");
} else {
  console.log("check-packs-own ok");
}
