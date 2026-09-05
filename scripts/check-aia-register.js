#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-register-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
process.env.AIA_TLD_PROBE = "1";

delete global.__aia;
delete global.__aiaHydrate;

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

["aia-register-abi.js", "api/_aia-register.js", "aia-tld.js", "account.html"].forEach(function (name) {
  if (!fs.existsSync(path.join(root, name))) fail("missing " + name);
  else pass("file " + name);
});

const html = fs.readFileSync(path.join(root, "account.html"), "utf8");
if (!/aia-register-abi\.js/.test(html) || !/aia-tld\.js/.test(html)) fail("account.html must load encoder then aia-tld.js");
else pass("account loads encoder + TLD card");

const ui = fs.readFileSync(path.join(root, "aia-tld.js"), "utf8");
if (!/Register \.aia/.test(ui)) fail("UI missing Register .aia");
else pass("Register .aia button copy");
if (!/Connect Wallet/.test(ui)) fail("unlocked + no wallet must offer Connect");
else pass("Connect first when no wallet");
if (!/Bridge locked on Decentraweb — watching/.test(ui)) fail("locked copy must stay");
else pass("locked copy unchanged");
if (!/eth_sendTransaction/.test(ui) || !/Sign commit/.test(ui) || !/Sign register/.test(ui)) {
  fail("client must walk Sign commit → wait → Sign register");
} else pass("commit / wait / register taps");
if (!/APPROVE_URL|approve-registration/.test(ui)) fail("browser must call approve-registration");
else pass("browser approve-registration path");
if (/privateKey|mnemonic|seed phrase|demo ETH|fake ETH/i.test(ui)) fail("UI leaked keys or demo ETH");
else pass("no keys or demo ETH");
if (!/Collect stays HOLD/.test(ui)) fail("Collect HOLD missing");
else pass("Collect HOLD");

const server = fs.readFileSync(path.join(root, "api/_aia-register.js"), "utf8") +
  fs.readFileSync(path.join(root, "api/_aia-tld.js"), "utf8");
if (/fetchImpl|http\(|fetch\(/.test(fs.readFileSync(path.join(root, "api/_aia-register.js"), "utf8")) &&
    /approve-registration/.test(fs.readFileSync(path.join(root, "api/_aia-register.js"), "utf8"))) {
  fail("server register helper must not HTTP approve-registration");
} else pass("server does not call approve-registration");
if (/privateKey|mnemonic|secret key/i.test(server)) fail("server mentioned private keys");
else pass("server has no private keys");

const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
if (/ethers|@decentraweb\/core|privy|walletconnect|wagmi|viem/i.test(pkg)) fail("package.json must stay thin");
else pass("no ethers / @decentraweb/core in package.json");

["../aia-register-abi", "../api/_lib", "../api/_account", "../api/_connect-wallet", "../api/_aia-tld", "../api/_aia-register", "../api/account", "../api/auth", "../api/health"].forEach(function (mod) {
  try { delete require.cache[require.resolve(mod)]; } catch (e) {}
});

const abi = require("../aia-register-abi");
const register = require("../api/_aia-register");
const tld = require("../api/_aia-tld");
const connect = require("../api/_connect-wallet");
const account = require("../api/account");
const auth = require("../api/auth");
const lib = require("../api/_lib");
const { ready, save } = lib;

const emptyKeccak = abi.keccak256("");
if (emptyKeccak !== "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470") {
  fail("keccak256 empty vector " + emptyKeccak);
} else pass("keccak256 empty vector");

const selectors = abi.verifySelectors();
Object.keys(selectors).forEach(function (sig) {
  if (!selectors[sig].ok) fail("selector " + sig + " " + selectors[sig].got);
  else pass("selector " + sig);
});

const owner = "0x1234567890abcdef1234567890abcdef12345678";
const commitment = "0x1111111111111111111111111111111111111111111111111111111111111111";
const secret = "0x2222222222222222222222222222222222222222222222222222222222222222";
const sig = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" +
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1c";

const commitData = abi.encodeCommit(commitment, sig);
if (!commitData.startsWith(abi.SELECTOR.commit) || commitData.length !== 10 + 64 * 4) {
  fail("commit calldata length " + commitData.length);
} else pass("commit calldata encoded");
if (commitData.indexOf("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") < 0) {
  fail("commit missing r");
} else pass("commit packs signature");

const rent = abi.encodeRentPrice("aia", abi.DURATION_ONE_YEAR, false);
if (!rent.startsWith(abi.SELECTOR.rentPrice) || rent.indexOf("616961") < 0) fail("rentPrice calldata " + rent);
else pass("rentPrice calldata encoded");

const registerData = abi.encodeRegister({
  names: ["aia"],
  owner: owner,
  durations: [abi.DURATION_ONE_YEAR],
  secret: secret,
  chainId: 1,
  timestamp: 1700000000,
  dweb: false,
  fee: "49500000000000000"
});
if (!registerData.startsWith(abi.SELECTOR.registerWithConfigBatch)) fail("register selector");
else pass("registerWithConfigBatch selector");
if (registerData.indexOf(owner.slice(2).toLowerCase()) < 0) fail("register missing owner");
else pass("register owner is the connected address");
if (registerData.indexOf("616961") < 0) fail("register missing aia label");
else pass("register encodes aia");

const tx = abi.txRegister({
  owner: owner,
  secret: secret,
  timestamp: 1700000000,
  fee: "49500000000000000"
});
if (tx.to !== abi.CONTROLLER || tx.from !== abi.normalizeAddress(owner) || tx.value === "0x0") {
  fail("register tx " + JSON.stringify(tx));
} else pass("register tx value is the buffered fee");
if (tx.data !== registerData) fail("txRegister data mismatch");
else pass("txRegister does not broadcast — returns calldata only");

const quote = abi.quoteOf({ rentWei: abi.FEE_HIGH_WEI });
if (quote.safeWei !== abi.withBuffer(abi.FEE_HIGH_WEI) || quote.collect !== "hold" || quote.mint) {
  fail("quote " + JSON.stringify(quote));
} else pass("quote adds 10% buffer and stays HOLD");
if (!/0\.0495/.test(quote.safeEth) && quote.safeEth !== "0.0495") {
  if (Number(quote.safeEth) < 0.045) fail("buffered fee too small " + quote.safeEth);
  else pass("buffered ETH estimate " + quote.safeEth);
} else pass("buffered ETH estimate shown");

const lockHit = abi.parseApproval({ errorMessage: "Failed to check domain is bridge lock or not" }, {});
if (!lockHit.bridgeLocked || lockHit.ok) fail("lock approval parse " + JSON.stringify(lockHit));
else pass("approve-registration lock stays locked");

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end() { return this; }
  };
}
function reqOf(method, headers, body, query) {
  return { method: method, headers: headers || {}, body: body || {}, query: query || {} };
}
async function call(handler, method, headers, body, query) {
  const res = mockRes();
  await handler(reqOf(method, headers, body, query), res);
  return res;
}
function jsonRes(status, obj) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status: status,
    text: function () { return Promise.resolve(JSON.stringify(obj)); }
  });
}

async function main() {
  tld.setFetch(function (url) {
    const pathName = String(url || "");
    if (pathName.indexOf("approve-registration") >= 0) {
      fail("server probe/quote called approve-registration");
      return jsonRes(400, { error: "should not call approve-registration" });
    }
    if (/lockDomain/.test(pathName)) return jsonRes(200, { locked: false, available: true });
    if (/domain-validation/.test(pathName)) return jsonRes(200, { available: true, locked: false });
    return jsonRes(404, { error: "unexpected " + pathName });
  });

  const plan = register.encodePlan({
    owner: owner,
    commitment: commitment,
    signature: sig,
    secret: secret,
    timestamp: 1700000000,
    fee: "49500000000000000"
  });
  if (!plan.ok || !plan.commit || !plan.register) fail("encodePlan " + JSON.stringify(plan));
  else pass("server encodePlan returns calldata");
  if (plan.broadcast || plan.mint || plan.collect !== "hold" || plan.approveRegistration) {
    fail("encodePlan must not mint or approve " + JSON.stringify(plan));
  } else pass("encodePlan does not sign or approve-registration");
  if (plan.commit.data !== commitData) fail("server commit calldata drifted");
  else pass("server commit calldata matches encoder");
  if (plan.register.from !== abi.normalizeAddress(owner)) fail("server register owner drifted");
  else pass("server register owner is the supplied wallet");

  await ready();
  const slug = "reg-desk";
  const pin = "4821";
  const opened = await call(auth, "POST", { "x-workspace": slug }, {
    action: "open",
    slug: slug,
    biz: "Register Desk",
    name: "James",
    email: "james-reg@example.com",
    pin: pin
  });
  if (opened.statusCode !== 201 && opened.statusCode !== 200) fail("open desk " + opened.statusCode);
  else pass("open desk");

  const ownerHdr = { "x-workspace": slug, "x-pin": pin };
  const noWallet = await call(account, "POST", ownerHdr, { action: "aia-quote", owner: owner });
  if (noWallet.statusCode < 400) fail("quote without wallet must 400 " + noWallet.statusCode);
  else pass("quote without wallet is rejected");

  const bound = await call(account, "POST", ownerHdr, {
    action: "wallet",
    walletAddress: owner,
    walletChainId: 1
  });
  if (bound.statusCode !== 200 || !bound.body || !bound.body.wallet || !bound.body.wallet.connected) {
    fail("bind wallet " + JSON.stringify(bound.body && bound.body.wallet));
  } else pass("bind wallet");

  const other = await call(account, "POST", ownerHdr, {
    action: "aia-quote",
    owner: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  });
  if (other.statusCode < 400) fail("quote for a foreign owner must 400");
  else pass("quote owner must match connected wallet");

  const quoted = await call(account, "POST", ownerHdr, { action: "aia-quote", owner: owner, dweb: false });
  if (quoted.statusCode !== 200 || !quoted.body || !quoted.body.quote || quoted.body.broadcast || quoted.body.approveRegistration) {
    fail("aia-quote " + JSON.stringify(quoted.body));
  } else pass("aia-quote returns estimate, no broadcast");
  if (!quoted.body.commit && quoted.body.quote.safeWei) pass("quote without approval has no commit tx");
  else if (quoted.body.commit) fail("quote must not invent a commit");

  const encoded = await call(account, "POST", ownerHdr, {
    action: "aia-encode",
    owner: owner,
    commitment: commitment,
    signature: sig,
    secret: secret,
    timestamp: 1700000000,
    fee: "49500000000000000"
  });
  if (encoded.statusCode !== 200 || !encoded.body.commit || !encoded.body.register) fail("aia-encode " + JSON.stringify(encoded.body));
  else pass("aia-encode returns commit + register calldata");
  if (encoded.body.register.data.indexOf(owner.slice(2).toLowerCase()) < 0) fail("encoded register missing owner");
  else pass("encoded register is tied to the connected owner");

  const open = await tld.forWallet({
    connected: true,
    address: owner,
    short: "0x1234…5678",
    chainId: 1,
    chain: "Ethereum mainnet"
  }, { fresh: true });
  if (open.status !== "available" || !open.register || open.register.approveRegistration || open.mint || open.collect !== "hold") {
    fail("available public row " + JSON.stringify(open));
  } else pass("available status exposes client register flow, still HOLD");

  tld.setFetch(function (url) {
    if (String(url || "").indexOf("approve-registration") >= 0) {
      fail("locked probe called approve-registration");
      return jsonRes(400, { error: "no" });
    }
    return jsonRes(/lockDomain/.test(String(url || "")) ? 500 : 400, { error: "Failed to get bridge lock domain" });
  });
  const locked = await tld.forWallet(connect.emptyPublic(), { fresh: true });
  if (!locked.bridgeLocked || locked.status !== "bridge-locked") fail("locked status " + JSON.stringify(locked));
  else pass("locked status unchanged");

  if (/aia-tld-register-btn/.test(ui) && /status === "available"/.test(ui) && /aia-tld-connect/.test(ui)) {
    pass("Register button is on the unlocked branch; no wallet prompts Connect");
  } else fail("unlocked branch wiring missing");

  await save();
  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-aia-register ok");
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
