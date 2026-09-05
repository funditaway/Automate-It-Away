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

const worldSurfaces = {
  "help.html": help,
  "developer.html": studioHtml,
  "developer.js": studioJs
};
const launchBits = [
  "Days are a guide, not a promise",
  "Core setup",
  "First pack suite",
  "Package",
  "GTM",
  "Yes / Stop / Kill",
  "illustrative / off-platform",
  "not an AIA rate card",
  "Simulate inbound",
  "www hook",
  "Lead capture",
  "Content multiplier",
  "seeded demo rules",
  "Four models",
  "operational infrastructure",
  "Tripwire / Core",
  "Industry bundles",
  "does not host",
  "Pack Creator",
  "repurposing drafts",
  "not live OAuth",
  "Not social SSO",
  "clear titles + niche keywords",
  "Build automation packs",
  "Core logic stack",
  "inbound .aia",
  "no silent crash",
  "Plug-and-play",
  "credential vars",
  "Free / core / DFY"
];
Object.keys(worldSurfaces).forEach(function (name) {
  const src = worldSurfaces[name];
  if (!/id="world/.test(src) && name !== "developer.js") fail(name + " missing #world");
  else if (name !== "developer.js") pass(name + " #world");
  if (!/World users/i.test(src)) fail(name + " missing World users");
  else pass(name + " World users");
  launchBits.forEach(function (bit) {
    if (!src.includes(bit)) fail(name + " missing launch bit: " + bit);
    else pass(name + " " + bit);
  });
});
if (!/id="world"/.test(help) || !/id="world"/.test(studioHtml)) fail("stranger path must expose static #world");
else pass("stranger path static #world");
if (!/Agency \/ DFY \/ co-pilot/i.test(help + studioHtml) && !/agency, DFY, and co-pilot/i.test(help + studioHtml)) {
  fail("World users must label agency / DFY / co-pilot off-platform");
} else pass("agency / DFY / co-pilot off-platform labels");
if (!/does not rank listings on platform search/i.test(help) || !/does not rank listings on platform search/i.test(studioHtml)) {
  fail("must not invent platform-search rank");
} else pass("no platform-search rank promise");
if (!/example thinking only/i.test(help) || !/AIA does not run ads/i.test(help)) fail("help missing ads principles");
else pass("help ads principles");
if (!/example thinking only/i.test(studioHtml) || !/AIA does not run ads/i.test(studioHtml)) fail("studio missing ads principles");
else pass("studio ads principles");
if (!/examples only, not AIA terms/i.test(help) || !/examples only, not AIA terms/i.test(studioHtml)) {
  fail("10–15% cuts must stay examples only, not AIA terms");
} else pass("co-pilot cuts are examples only");
if (/\$0\.05/.test(help + studioHtml + studioJs) && !/does not host/i.test(help + studioHtml + studioJs)) {
  fail("$0.05/exec must say AIA does not host");
} else pass("$0.05/exec is not hosted");
if (/always works/i.test(help + studioHtml) && !/not .always works/i.test(help + studioHtml) && !/not “always works/i.test(help + studioHtml)) {
  fail("must not claim always works");
} else pass("no always-works claim");
if (/review-rate|4\.9 star|close rate/i.test(help + studioHtml + studioJs) && !/No invented close rates|Do not invent review-rate|No review-rate/i.test(help + studioHtml + studioJs)) {
  fail("invented review or close-rate stats");
} else pass("no invented review/close stats");
if (/Login Kit|hands-off niche|auto-schedule/i.test(help + studioHtml + studioJs)) {
  fail("must not ship Automated Short-Form / Media Creator as live Studio");
} else pass("no live short-form auto-publisher");
if (/social SSO/i.test(help + studioHtml) && !/Not social SSO/i.test(help + studioHtml)) {
  fail("account door must not be social SSO");
} else pass("account door is not social SSO");

const fake = [
  /\$1\.5k/i,
  /\$10k/i,
  /\$29(?!\d)/,
  /\$97(?!\d)/,
  /\$297(?!\d)/,
  /15\s*[–-]\s*30\s*%/,
  /affiliate\s+\d/i,
  /affiliate\s*%/i,
  /monthly P&amp;L|monthly P&L/i,
  /influencer\s+(income|range|payout|earn)/i,
  /AI Creator/i
];
Object.keys(surfaces).forEach(function (name) {
  const src = surfaces[name];
  fake.forEach(function (re) {
    if (re.test(src)) fail(name + " invented " + re);
  });
  if (/\$250/.test(src)) fail(name + " invented $250");
  const bands = /\$47|\$197|\$997/.test(src);
  if (bands && (!/illustrative \/ off-platform/i.test(src) || !/not an AIA rate card/i.test(src))) {
    fail(name + " price bands must stay illustrative / off-platform");
  }
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
if (!/World users launch help/i.test(yesNo) || !/guide, not a promise/i.test(yesNo)) fail("ACCOUNT-YES-NO.md missing World users launch YES");
else pass("ACCOUNT-YES-NO World users launch YES");
if (!/World users · launch/i.test(packMd) || !/illustrative \/ off-platform/i.test(packMd)) fail("PACK.md missing World users launch");
else pass("PACK.md World users launch");
if (!/Build automation packs/i.test(packMd) || !/Core logic stack/i.test(packMd)) fail("PACK.md missing pack blueprint");
else pass("PACK.md pack blueprint");

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("check-studio-earnings ok");
