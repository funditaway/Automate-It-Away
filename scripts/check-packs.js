const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

const root = path.join(__dirname, "..");
const packsApi = fs.readFileSync(path.join(root, "api", "packs.js"), "utf8");
if (!packsApi.includes("action === \"use\"")) fail("packs.js missing use");
else pass("packs use");
if (!packsApi.includes("action === \"list\"")) fail("packs.js missing list");
else pass("packs list");
if (!packsApi.includes("409")) fail("priced pack must 409");
else pass("priced pack 409");
if (!/no card/i.test(packsApi)) fail("must say no card");
else pass("no card copy");

const create = fs.readFileSync(path.join(root, "create-desk.js"), "utf8");
["id: \"pack\"", "/api/packs", "Use on this desk", "Ask is a tag"].forEach((bit) => {
  if (!create.includes(bit)) fail("create-desk.js missing " + bit);
  else pass("create " + bit);
});

const market = fs.readFileSync(path.join(root, "market.html"), "utf8");
if (!market.includes("create-desk.js")) fail("market.html must reuse create-desk.js");
else pass("market reuses create");
if (!market.includes("Packs do not send money") && !market.includes("do not send money")) fail("market missing money line");
else pass("market money line");

["vita.json", "fund.json", "land.json"].forEach((name) => {
  const p = path.join(root, "packs", name);
  if (!fs.existsSync(p)) fail("missing " + name);
  else pass("pack file " + name);
});

if (process.exitCode) {
  console.error("check-packs failed");
  process.exit(1);
}
console.log("check-packs passed");
