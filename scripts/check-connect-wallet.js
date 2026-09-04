#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-connect-wallet-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

delete global.__aia;
delete global.__aiaHydrate;

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

["aia-wallet.js", "api/_connect-wallet.js", "account.html"].forEach(function (name) {
  if (!fs.existsSync(path.join(root, name))) fail("missing " + name);
  else pass("file " + name);
});

const html = fs.readFileSync(path.join(root, "account.html"), "utf8");
if (!/id="aia-wallet"/.test(html)) fail("account.html missing Wallet card host");
else pass("account Wallet card host");
if (!/aia-wallet\.js/.test(html)) fail("account.html must load aia-wallet.js");
else pass("account loads aia-wallet.js");
if (!/aia_wallet_address/.test(html)) fail("leave-phone must clear wallet localStorage");
else pass("leave-phone clears wallet keys");

const ui = fs.readFileSync(path.join(root, "aia-wallet.js"), "utf8");
if (!/Connect Wallet/.test(ui)) fail("UI missing Connect Wallet");
else pass("Connect Wallet button");
if (!/Disconnect/.test(ui)) fail("UI missing Disconnect");
else pass("Disconnect");
if (!/window\.ethereum/.test(ui) || !/eth_requestAccounts/.test(ui)) fail("UI must use EIP-1193 window.ethereum");
else pass("EIP-1193 eth_requestAccounts");
if (!/Collect stays HOLD/.test(ui)) fail("UI must keep Collect HOLD");
else pass("Collect HOLD in UI");
if (!/Mint and Bridge stay external/.test(ui)) fail("UI missing mint/Bridge honesty");
else pass("mint/Bridge stay external");
if (/privateKey|mnemonic|seed phrase|demo ETH|fake ETH|0\.00 ETH/i.test(ui)) fail("UI must not show keys or demo ETH");
else pass("no keys or demo ETH in UI");
if (/eth_sendTransaction|eth_sendRawTransaction|wallet_sendCalls|personal_sign/.test(ui)) fail("UI must not broadcast a tx");
else pass("UI does not broadcast a tx");

const helper = fs.readFileSync(path.join(root, "api/_connect-wallet.js"), "utf8");
if (/privateKey|mnemonic|secret key/i.test(helper)) fail("helper must not mention private keys");
else pass("helper has no private keys");
if (/eth_sendTransaction|eth_sendRawTransaction|require\([\"'].*dw-check/.test(helper + ui)) fail("must not mint, send, or import dw-check");
else pass("no mint / send / dw-check");
if (/ethers|privy|walletconnect|@walletconnect|web3modal/i.test(helper + ui + html)) fail("must stay greenfield EIP-1193 — no WC/Privy/ethers");
else pass("no WC / Privy / ethers");
if (/aia_money|AIA\.money|fundWallet|chargeWallet/.test(helper + ui + html)) fail("must not wire demo aia_money or ledger charge");
else pass("no aia_money chrome");
const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
if (/ethers|privy|walletconnect|wagmi|viem/i.test(pkg)) fail("package.json must not add a web3 stack");
else pass("package.json stays thin");
if (!/custodial: false/.test(helper) || !/charged: false/.test(helper)) fail("helper must stay non-custodial and uncharged");
else pass("non-custodial uncharged");

["../api/_lib", "../api/_account", "../api/_connect-wallet", "../api/account", "../api/auth", "../api/health"].forEach(function (mod) {
  try { delete require.cache[require.resolve(mod)]; } catch (e) {}
});

const lib = require("../api/_lib");
const connect = require("../api/_connect-wallet");
const account = require("../api/account");
const auth = require("../api/auth");
const health = require("../api/health");
const { mem, ready, save } = lib;

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

async function main() {
  if (connect.shortAddress("0x1234567890abcdef1234567890abcdef12345678") !== "0x1234…5678") {
    fail("short address " + connect.shortAddress("0x1234567890abcdef1234567890abcdef12345678"));
  } else pass("short address 0x1234…5678");
  if (connect.chainLabel(1) !== "Ethereum mainnet") fail("chain 1 must be Ethereum mainnet");
  else pass("Ethereum mainnet label");
  if (connect.parseAddress("not-an-address").ok) fail("must reject junk address");
  else pass("rejects junk address");
  if (connect.parseAddress("0x123").ok) fail("must reject short address");
  else pass("rejects short address");

  await ready();
  const slug = "wallet-desk";
  const pin = "4821";
  const opened = await call(auth, "POST", { "x-workspace": slug }, {
    action: "open",
    slug: slug,
    biz: "Wallet Desk",
    name: "James",
    email: "james-wallet@example.com",
    pin: pin
  });
  if (opened.statusCode !== 201 && opened.statusCode !== 200) fail("open desk " + opened.statusCode);
  else pass("open desk");

  const owner = { "x-workspace": slug, "x-pin": pin };
  const empty = await call(account, "GET", owner, {}, {});
  const emptyWallet = empty.body && (empty.body.wallet || (empty.body.account && empty.body.account.wallet));
  if (!emptyWallet || emptyWallet.connected) fail("fresh account must not fake connected " + JSON.stringify(emptyWallet));
  else pass("fresh account wallet not connected");

  const bad = await call(account, "POST", owner, { action: "wallet", walletAddress: "0xdead" });
  if (bad.statusCode < 400 || (bad.body && bad.body.wallet && bad.body.wallet.connected)) {
    fail("bad address must not connect " + bad.statusCode + " " + JSON.stringify(bad.body));
  } else pass("bad address rejected");

  const addr = "0x1234567890AbCdEf1234567890aBcDeF12345678";
  const saved = await call(account, "POST", owner, {
    action: "wallet",
    walletAddress: addr,
    walletChainId: "0x1"
  });
  const w = saved.body && saved.body.wallet;
  if (saved.statusCode !== 200 || !w || !w.connected || w.short !== "0x1234…5678" || w.chain !== "Ethereum mainnet") {
    fail("connect persist " + saved.statusCode + " " + JSON.stringify(saved.body));
  } else pass("connect persists truncated address + mainnet");
  if (w.custodial || w.charged || w.mint || w.live || w.collect !== "hold") fail("connect must stay honest HOLD");
  else pass("connect stays non-custodial HOLD");
  const bound = (mem.audit || []).find(function (a) { return a && a.agent === "Pipe" && a.action === "wallet bound"; });
  if (!bound || bound.result !== "OK") fail("connect must audit Pipe · wallet bound");
  else pass("audit wallet bound");
  if (/private|seed|ETH balance|demo/i.test(JSON.stringify(w))) fail("wallet payload leaked demo money or keys");
  else pass("wallet payload is address only");

  const acc = (mem.accounts || [])[0];
  if (!acc || acc.walletAddress !== "0x1234567890abcdef1234567890abcdef12345678" || acc.walletChainId !== 1) {
    fail("account blob missing walletAddress " + JSON.stringify(acc && { a: acc.walletAddress, c: acc.walletChainId }));
  } else pass("account blob stores walletAddress + walletChainId");

  await save();
  const disk = JSON.parse(fs.readFileSync(store, "utf8"));
  const diskAcc = (disk.accounts || [])[0] || {};
  if (diskAcc.walletAddress !== "0x1234567890abcdef1234567890abcdef12345678") fail("store did not persist walletAddress");
  else pass("store persists walletAddress");

  const again = await call(account, "GET", owner, {}, {});
  const againW = again.body && (again.body.wallet || (again.body.account && again.body.account.wallet));
  if (!againW || !againW.connected || againW.short !== "0x1234…5678") fail("refresh GET must keep address " + JSON.stringify(againW));
  else pass("refresh keeps address");

  const st = await call(health.status, "GET", owner, {}, {});
  if (!st.body || !st.body.wallet || !st.body.wallet.connected || st.body.wallet.short !== "0x1234…5678") {
    fail("status must show connected wallet " + JSON.stringify(st.body && st.body.wallet));
  } else pass("status shows connected wallet");
  if (st.body.wallet.charged || st.body.wallet.mint || st.body.wallet.collect !== "hold") fail("status wallet invented money");
  else pass("status wallet Collect HOLD");

  const stranger = await call(health.status, "GET", {}, {}, {});
  if (!stranger.body || !stranger.body.wallet || stranger.body.wallet.connected) {
    fail("status without desk must not fake connected " + JSON.stringify(stranger.body && stranger.body.wallet));
  } else pass("status without desk is not connected");

  const hh = await call(health, "GET", {}, {}, {});
  if (!hh.body || !hh.body.wallet || hh.body.wallet.custodial || hh.body.wallet.charged || hh.body.wallet.collect !== "hold") {
    fail("health wallet block must stay honest " + JSON.stringify(hh.body && hh.body.wallet));
  } else pass("health wallet block is honest");

  const gone = await call(account, "POST", owner, { action: "disconnect-wallet" });
  if (gone.statusCode !== 200 || !gone.body.wallet || gone.body.wallet.connected) {
    fail("disconnect " + gone.statusCode + " " + JSON.stringify(gone.body));
  } else pass("disconnect clears wallet");
  const revoked = (mem.audit || []).find(function (a) { return a && a.agent === "Pipe" && a.action === "wallet revoked"; });
  if (!revoked || revoked.result !== "OK") fail("disconnect must audit Pipe · wallet revoked");
  else pass("audit wallet revoked");
  if (acc.walletAddress) fail("disconnect left address on account");
  else pass("disconnect clears account blob");

  const after = await call(health.status, "GET", owner, {}, {});
  if (!after.body || !after.body.wallet || after.body.wallet.connected) fail("status after disconnect still connected");
  else pass("status after disconnect is not connected");

  const guest = await call(account, "POST", {}, { action: "wallet", walletAddress: addr, walletChainId: 1 });
  if (guest.statusCode !== 401) fail("wallet without sign-in must 401, got " + guest.statusCode);
  else pass("wallet requires open desk");

  if (/\$250|demo seed|fake ETH|silent Collect/i.test(JSON.stringify(saved.body) + JSON.stringify(st.body.wallet) + ui + html)) {
    fail("hard-line leak");
  } else pass("no demo money chrome");

  await save();
  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-connect-wallet ok");
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
