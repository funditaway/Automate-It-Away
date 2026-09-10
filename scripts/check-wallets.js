const fs = require("fs");
const os = require("os");
const path = require("path");
const store = path.join(os.tmpdir(), "aia-wallets-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
delete global.__aia;
delete global.__aiaHydrate;
const src = fs.readFileSync(path.join(__dirname, "../api/_wallets.js"), "utf8");
const yesNo = fs.readFileSync(path.join(__dirname, "../ACCOUNT-YES-NO.md"), "utf8");
const packMd = fs.readFileSync(path.join(__dirname, "../PACK.md"), "utf8");
const wallets = require("../api/_wallets");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

if (!/charged: false/.test(src)) fail("wallets must keep charged:false");
else pass("wallets charged false");

if (/Agents do not hold money/.test(src)) fail("wallets still say Agents do not hold money");
else if (!/Desk AIs do not hold money/.test(src)) fail("desk AIs must not hold money");
else pass("desk AIs do not hold money");

if (/Agents do not spend money/.test(src)) fail("wallets still say Agents do not spend money");
else if (!/Desk AIs do not spend money/.test(src)) fail("desk AIs must not spend money");
else pass("desk AIs do not spend money");

if (src.indexOf('AGENT_KINDS = ["agent"]') < 0) fail("wallets must keep seat kind agent");
else pass("wallets keep seat kind agent");

const denied = wallets.openWallet({ id: "p_ai", name: "Doer", kind: "agent", role: "agent" }, "desk", { name: "test" });
if (denied.ok || denied.error !== "Desk AIs do not hold money.") {
  fail("openWallet agent must say Desk AIs do not hold money, got " + JSON.stringify(denied));
} else pass("openWallet refuses agent with Desk AI copy");

if (yesNo.indexOf("Wallet / permission Desk AI leftover") < 0) fail("ACCOUNT-YES-NO must name Wallet / permission Desk AI leftover");
else pass("ACCOUNT-YES-NO names Wallet / permission Desk AI leftover");
if (packMd.indexOf("Wallet / permission Desk AI leftover") < 0) fail("PACK.md must name Wallet / permission Desk AI leftover");
else pass("PACK.md names Wallet / permission Desk AI leftover");

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
