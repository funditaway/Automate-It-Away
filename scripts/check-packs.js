const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

const root = path.join(__dirname, "..");
const packsApi = fs.readFileSync(path.join(root, "api", "_packs.js"), "utf8");
if (!packsApi.includes("action === \"use-pack\"") || !packsApi.includes("action === \"install-pack\"")) fail("_packs.js missing use-pack / install-pack");
else pass("packs use/install");
if (!packsApi.includes("action === \"list-pack\"")) fail("_packs.js missing list-pack");
else pass("packs list");
if (!packsApi.includes("studio-draft") || !packsApi.includes("grok-pack")) fail("_packs.js missing studio-draft");
else pass("packs studio-draft");
if (!packsApi.includes("charged: false") || !packsApi.includes("hold: true")) fail("Collect must stay HOLD, never silent charge");
else pass("Collect HOLD, charged false");
if (!/collectHoldOf/.test(packsApi)) fail("must expose collectHoldOf");
else pass("collectHoldOf");
if (/priced pack must 409|Ask is a tag\. No card\. No checkout/i.test(packsApi) && packsApi.includes("priced") && /return res\.status\(409\).*priced/s.test(packsApi)) {
  fail("priced packs must install, not 409");
} else pass("priced packs install");
if (!packsApi.includes("aia-adoption")) fail("_packs.js missing aia-adoption");
else pass("official list has aia-adoption");

const create = fs.readFileSync(path.join(root, "create-desk.js"), "utf8");
["id: \"pack\"", "Use on this desk", "Collect stays HOLD"].forEach((bit) => {
  if (!create.includes(bit)) fail("create-desk.js missing " + bit);
  else pass("create " + bit);
});
if (create.includes("/api/packs")) fail("create-desk.js should post /api/desks, not /api/packs");
else pass("create uses /api/desks");

const market = fs.readFileSync(path.join(root, "market.html"), "utf8");
if (!market.includes("market-shop.js")) fail("market.html must load market-shop.js");
else pass("market loads shop");
const shop = fs.readFileSync(path.join(root, "market-shop.js"), "utf8");
if (!shop.includes("do not send money") && !shop.includes("never send money") && !shop.includes("Packs never send money")) fail("market missing money line");
else pass("market money line");
if (!shop.includes("Collect HOLD") && !shop.includes("Collect stays HOLD")) fail("market missing Collect HOLD");
else pass("market Collect HOLD");
if (!shop.includes("data-use")) fail("market must Use on this desk");
else pass("market Use on this desk");
if (!shop.includes("Buy · install") && !shop.includes("data-buy")) fail("market missing Buy / install");
else pass("market Buy / install");
if (!shop.includes("aia-line off") && !shop.includes("pipeMissing")) fail("market must orange when money pipe is missing");
else pass("market orange if pipe missing");
if (shop.includes("Labeled DEMO")) fail("market still shows demo chrome");
else pass("market has no demo chrome");

const packsApi2 = packsApi;
if (!packsApi2.includes("buy-pack")) fail("_packs.js missing buy-pack");
else pass("packs buy-pack");
if (!packsApi2.includes("save-ai") || !packsApi2.includes("private-pack")) fail("_packs.js missing save-ai / private-pack");
else pass("packs save-ai / private-pack");
if (!packsApi2.includes("grokStudio") || !packsApi2.includes("Grok · AIA Studio")) fail("missing Grok AIA Studio identity");
else pass("Grok AIA Studio identity");
if (!packsApi2.includes("authoredBy")) fail("packs missing authoredBy");
else pass("packs authoredBy");
if (!packsApi2.includes("sku: false")) fail("Grok Studio must not be a SKU");
else pass("Grok Studio is not a SKU");
if (!packsApi2.includes("download-pack") || !packsApi2.includes("filename=")) fail("_packs.js missing .aia download");
else pass("packs download .aia file");
if (!packsApi2.includes("install-aia") || !packsApi2.includes("readAiaPack")) fail("_packs.js missing install-aia");
else pass("packs install-aia");
if (!shop.includes("AIA Internet") || !shop.includes(".aia") || !shop.includes("install-aia")) fail("market missing AIA Internet / .aia install");
else pass("market AIA Internet .aia");

["vita.json", "fund.json", "land.json", "aia-adoption.json", "aia-implement.json"].forEach((name) => {
  const p = path.join(root, "packs", name);
  if (!fs.existsSync(p)) fail("missing " + name);
  else pass("pack file " + name);
});

const studio = fs.readFileSync(path.join(root, "developer.html"), "utf8");
if (!studio.includes("Creators Studio")) fail("developer.html must be Creators Studio");
else pass("developer.html is Creators Studio");
if (!studio.includes("desk AI") && !fs.readFileSync(path.join(root, "developer.js"), "utf8").includes("Desk AIs")) fail("Creators Studio must name desk AIs");
else pass("Studio names desk AIs");
const studioJs = fs.readFileSync(path.join(root, "developer.js"), "utf8");
if (!studioJs.includes("workflows") || !studioJs.includes("When → If → Then")) fail("Studio must author pack workflows");
else pass("Studio pack workflows");
if (studio.includes("AIA Studio Pro")) fail("must not brand AIA Studio Pro");
else pass("not AIA Studio Pro");
if (!studio.includes("Creators / earnings") || !studio.includes("no public payout baseline")) fail("developer.html missing honest earnings");
else pass("Studio honest earnings");
if (!studio.includes("off-platform")) fail("developer.html missing agency off-platform");
else pass("Studio agency off-platform");
if (/\$1\.5k|\$10k|15\s*[–-]\s*30\s*%|AI Creator/i.test(studio + studioJs + shop)) fail("invented creator income bands");
else pass("no invented creator income bands");

const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
if (!vercel.includes("\"/studio\"") || !vercel.includes("/developer.html")) fail("vercel /studio must rewrite to developer.html");
else pass("/studio → developer.html");
if (!/"\/dev"/.test(vercel) || !vercel.includes("\"/developer\"")) fail("vercel /dev must send people to Creators Studio");
else pass("/dev → Creators Studio");
const stub = fs.readFileSync(path.join(root, "dev.html"), "utf8");
if (!stub.includes("Creators Studio") || stub.includes(">Developer ·")) fail("dev.html stub must title Creators Studio");
else pass("dev.html is Creators Studio stub");

if (process.exitCode) {
  console.error("check-packs failed");
  process.exit(1);
}
console.log("check-packs passed");
