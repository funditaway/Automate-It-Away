#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const studioHtml = read("developer.html");
const studioJs = read("developer.js");
const market = read("market-shop.js");
const help = read("help.html");
const more = read("more.html");
const packsApi = read("api/_packs.js");
const vercel = read("vercel.json");
const packMd = read("PACK.md");
const yesNo = read("ACCOUNT-YES-NO.md");

const surfaces = {
  "developer.html": studioHtml,
  "developer.js": studioJs,
  "market-shop.js": market,
  "help.html": help,
  "more.html": more
};

const honest = [
  "no public payout baseline",
  "Collect stays HOLD",
  "off-platform"
];
honest.forEach(function (bit) {
  if (!studioHtml.toLowerCase().includes(bit.toLowerCase())) fail("developer.html missing " + bit);
  else pass("studio html " + bit);
});
if (!/earn by pricing a pack|listed ask/i.test(studioHtml)) fail("developer.html must say you earn by pricing a pack");
else pass("studio html earn by pricing");
if (!/private project, company, or family/i.test(studioHtml)) fail("developer.html missing private desks");
else pass("studio html private desks");
if (!/id="earnings"/.test(studioHtml)) fail("developer.html must expose #earnings");
else pass("studio html #earnings");

if (!/no public payout baseline/i.test(studioJs)) fail("developer.js missing no public payout baseline");
else pass("studio js no public payout baseline");
if (!/Agency consulting is off-platform/i.test(studioJs)) fail("developer.js missing agency off-platform");
else pass("studio js agency off-platform");
if (!/Collect stays HOLD until a person taps Yes and a real Collect money pipe/i.test(studioJs)) {
  fail("developer.js must keep Collect HOLD until Yes + pipe");
} else pass("studio js Collect HOLD until Yes + pipe");

if (!/no public payout baseline/i.test(market)) fail("market-shop.js missing no public payout baseline");
else pass("market no public payout baseline");
if (!/Agency consulting is off-platform/i.test(market)) fail("market-shop.js missing agency off-platform");
else pass("market agency off-platform");
if (!/Collect stays HOLD/i.test(market)) fail("market-shop.js missing Collect HOLD");
else pass("market Collect HOLD");

if (!/no public payout baseline/i.test(help)) fail("help.html missing no public payout baseline");
else pass("help no public payout baseline");
if (!/Agency consulting is off-platform/i.test(help)) fail("help.html missing agency off-platform");
else pass("help agency off-platform");
if (!/no public payout table/i.test(more) || !/no public payout baseline/i.test(more)) fail("more.html missing payout honesty");
else pass("more payout honesty");

const fake = [
  /\$1\.5k/i,
  /\$10k/i,
  /15\s*[–-]\s*30\s*%/,
  /affiliate\s+\d/i,
  /influencer\s+(income|range|payout|earn)/i,
  /AI Creator/i
];
Object.keys(surfaces).forEach(function (name) {
  const src = surfaces[name];
  fake.forEach(function (re) {
    if (re.test(src)) fail(name + " invented " + re);
  });
  if (/\$250/.test(src)) fail(name + " invented $250");
  pass(name + " has no fake income bands");
});

if (!packsApi.includes("charged: false") || !packsApi.includes("hold: true")) fail("Collect must stay HOLD, charged false");
else pass("Collect HOLD, charged false");
if (!/function collectHoldOf/.test(packsApi)) fail("collectHoldOf must stay");
else pass("collectHoldOf stays");
if (/Labeled DEMO/i.test(studioHtml + studioJs)) fail("studio demo chrome");
else pass("studio no demo chrome");
if (/demo seed/i.test(studioHtml + studioJs) && !/no demo seed/i.test(studioHtml + studioJs)) fail("studio invented a demo seed");
else pass("studio no invented demo seed");

if (!vercel.includes("\"/studio\"") || !vercel.includes("/developer.html")) fail("vercel /studio must rewrite to developer.html");
else pass("/studio → developer.html");
if (!/"\/dev"/.test(vercel) || !vercel.includes("\"/developer\"")) fail("vercel /dev must send people to Creators Studio");
else pass("/dev → Creators Studio");

if (!/Creators \/ earnings/i.test(packMd) || !/no public payout baseline/i.test(packMd)) fail("PACK.md missing earnings canon");
else pass("PACK.md earnings canon");
if (!/Creators \/ earnings honesty/i.test(yesNo) || !/no public payout baseline/i.test(yesNo)) fail("ACCOUNT-YES-NO.md missing earnings YES");
else pass("ACCOUNT-YES-NO earnings YES");

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("check-studio-earnings ok");
