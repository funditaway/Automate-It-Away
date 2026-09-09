const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "../api/_wallets.js"), "utf8");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

if (!/charged: false/.test(src)) fail("wallets must keep charged:false");
else pass("wallets charged false");

if (!/Agents do not hold money/.test(src)) fail("agents must not hold money");
else pass("agents do not hold money");

if (!/Owner money is not used/.test(src)) fail("wallet charge must not fall back to owner");
else pass("no owner fallback on a bill");

if (!/Kids are not billed/.test(src)) fail("family kid wallets stay off");
else pass("family kid wallets stay off");

if (!/X Money stays hold/.test(src) && !/xmoney/.test(src)) fail("X Money rail named");
else pass("X Money rail named and stays hold");

if (!/live: false/.test(src)) fail("wallets live stays false");
else pass("wallets live false");

if (process.exitCode) {
  console.error("check-wallets failed");
  process.exit(1);
}
console.log("check-wallets passed");
