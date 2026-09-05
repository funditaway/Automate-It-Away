#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-tld-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
process.env.AIA_TLD_PROBE = "1";

delete global.__aia;
delete global.__aiaHydrate;

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

["aia-tld.js", "api/_aia-tld.js", "account.html"].forEach(function (name) {
  if (!fs.existsSync(path.join(root, name))) fail("missing " + name);
  else pass("file " + name);
});

const html = fs.readFileSync(path.join(root, "account.html"), "utf8");
if (!/id="aia-tld"/.test(html)) fail("account.html missing AIA Internet / .aia TLD card host");
else pass("account TLD card host");
if (!/aia-tld\.js/.test(html)) fail("account.html must load aia-tld.js");
else pass("account loads aia-tld.js");
if (!/has-desk-nav/.test(html) || !/id="desk-nav"/.test(html) || !/data-tab="create"/.test(html) || !/data-tab="history"/.test(html)) {
  fail("account.html must match Create · History desk chrome");
} else pass("account has Create · History desk chrome");

const ui = fs.readFileSync(path.join(root, "aia-tld.js"), "utf8");
if (!/Bridge locked on Decentraweb — watching/.test(ui)) fail("UI missing locked copy");
else pass("locked copy");
if (!/Ready to mint when Bridge clears/.test(ui)) fail("UI missing ready-to-mint copy");
else pass("ready-to-mint copy");
if (!/Open Decentraweb Register/.test(ui)) fail("UI missing Decentraweb Register CTA");
else pass("Register CTA");
if (!/dns\.decentraweb\.org\/name\/aia/.test(ui)) fail("UI must deep-link to Decentraweb .aia");
else pass("Decentraweb .aia link");
if (!/Collect stays HOLD/.test(ui)) fail("UI must keep Collect HOLD");
else pass("Collect HOLD in UI");
if (/privateKey|mnemonic|seed phrase|demo ETH|fake ETH|0\.00 ETH/i.test(ui)) fail("UI must not show keys or demo ETH");
else pass("no keys or demo ETH in UI");
if (/eth_sendTransaction|eth_sendRawTransaction|wallet_sendCalls/.test(ui)) fail("this PR must not broadcast a mint tx");
else pass("UI does not broadcast a mint");

const helper = fs.readFileSync(path.join(root, "api/_aia-tld.js"), "utf8");
if (/approve-registration/.test(helper) && !/Never approve-registration/.test(helper)) {
  fail("helper must not call approve-registration");
} else pass("no approve-registration call");
if (!/bridge\/lockDomain/.test(helper) || !/domain-validation/.test(helper)) fail("helper must probe lockDomain + domain-validation");
else pass("probes lockDomain and domain-validation");
if (/privateKey|mnemonic|secret key/i.test(helper)) fail("helper must not mention private keys");
else pass("helper has no private keys");
if (/ethers|privy|walletconnect|wagmi|viem/i.test(helper + ui + html)) fail("must not add a web3 stack");
else pass("no web3 stack");
const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
if (/ethers|privy|walletconnect|wagmi|viem/i.test(pkg)) fail("package.json must not add a web3 stack");
else pass("package.json stays thin");

["../api/_lib", "../api/_account", "../api/_connect-wallet", "../api/_aia-tld", "../api/account", "../api/auth", "../api/health"].forEach(function (mod) {
  try { delete require.cache[require.resolve(mod)]; } catch (e) {}
});

const lib = require("../api/_lib");
const tld = require("../api/_aia-tld");
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

function jsonRes(status, obj) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status: status,
    text: function () { return Promise.resolve(JSON.stringify(obj)); }
  });
}

function mockFetch(routes) {
  return function (url, opts) {
    const path = String(url || "").replace("https://api.decentraweb.org/api/v1", "");
    const method = ((opts && opts.method) || "GET").toUpperCase();
    if (path.indexOf("approve-registration") >= 0) {
      fail("probe called approve-registration");
      return jsonRes(400, { error: "should not call approve-registration" });
    }
    const hit = routes[method + " " + path] || routes[path];
    if (!hit) return jsonRes(404, { error: "unexpected " + method + " " + path });
    return jsonRes(hit.status, hit.body);
  };
}

async function main() {
  tld.setFetch(mockFetch({
    "GET /bridge/lockDomain/aia": { status: 500, body: { error: "Failed to get bridge lock domain" } },
    "POST /domain-validation": { status: 400, body: { errorCode: -2, errorMessage: "Failed to check domain is bridge lock or not" } }
  }));

  const locked = await tld.forWallet(connect.emptyPublic(), { fresh: true });
  if (!locked.bridgeLocked || locked.status !== "bridge-locked" || locked.label !== "Bridge locked") {
    fail("bridge lock probe " + JSON.stringify(locked));
  } else pass("bridge lock from lockDomain 500 + validation 400");
  if (locked.owned || locked.ownedByConnected || locked.available === true || locked.mint || locked.charged || locked.collect !== "hold") {
    fail("locked probe invented owned/available/mint " + JSON.stringify(locked));
  } else pass("locked probe does not invent owned or available");
  if (locked.probes && locked.probes.approveRegistration) fail("public payload leaked an approve-registration probe");
  else pass("approve-registration stays off the probe");
  if (!/Bridge locked on Decentraweb/.test(locked.note)) fail("locked note " + locked.note);
  else pass("locked note is honest");

  const wallet = {
    connected: true,
    address: "0x1234567890abcdef1234567890abcdef12345678",
    short: "0x1234…5678",
    chainId: 1,
    chain: "Ethereum mainnet"
  };
  const readyMint = await tld.forWallet(wallet, { fresh: true });
  if (!readyMint.bridgeLocked || readyMint.ownedByConnected || readyMint.note !== tld.READY_NOTE) {
    fail("connected + locked should be ready to mint, not owned " + JSON.stringify(readyMint));
  } else pass("connected + locked is ready to mint, not owned");
  if (!readyMint.wallet || readyMint.wallet.short !== "0x1234…5678") fail("short address missing on locked+connected");
  else pass("short address on locked+connected");

  tld.setFetch(mockFetch({
    "GET /bridge/lockDomain/aia": { status: 200, body: { locked: false, available: true } },
    "POST /domain-validation": { status: 200, body: { available: true, locked: false } }
  }));
  const open = await tld.forWallet(wallet, { fresh: true });
  if (open.bridgeLocked || open.available !== true || open.status !== "available" || open.ownedByConnected) {
    fail("unlocked available " + JSON.stringify(open));
  } else pass("unlocked + available is not owned");
  if (open.mint || open.collect !== "hold") fail("unlocked must not mint or Collect");
  else pass("unlocked stays HOLD");

  const otherOwner = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  tld.setFetch(mockFetch({
    "GET /bridge/lockDomain/aia": { status: 200, body: { locked: false, available: false, owner: otherOwner } },
    "POST /domain-validation": { status: 200, body: { available: false, owner: otherOwner } }
  }));
  const taken = await tld.forWallet(wallet, { fresh: true });
  if (taken.owned || taken.ownedByConnected || taken.owner) {
    fail("must not invent owned when owner is someone else " + JSON.stringify(taken));
  } else pass("foreign owner is not owned");
  if (taken.available !== false) fail("taken name must report available false");
  else pass("taken name is not available");

  tld.setFetch(mockFetch({
    "GET /bridge/lockDomain/aia": { status: 200, body: { locked: false, available: false, owner: wallet.address } },
    "POST /domain-validation": { status: 200, body: { available: false, owner: wallet.address } }
  }));
  const mine = await tld.forWallet(wallet, { fresh: true });
  if (!mine.owned || !mine.ownedByConnected || mine.owner !== wallet.address || mine.status !== "owned") {
    fail("matching wallet must be owned " + JSON.stringify(mine));
  } else pass("owned only when wallet matches registry owner");

  const nobody = await tld.forWallet(connect.emptyPublic(), { fresh: true });
  if (nobody.owned || nobody.ownedByConnected || nobody.owner) {
    fail("no wallet must not be owned even if registry has an owner " + JSON.stringify(nobody));
  } else pass("no wallet is never owned");

  await ready();
  const slug = "tld-desk";
  const pin = "4821";
  const opened = await call(auth, "POST", { "x-workspace": slug }, {
    action: "open",
    slug: slug,
    biz: "TLD Desk",
    name: "James",
    email: "james-tld@example.com",
    pin: pin
  });
  if (opened.statusCode !== 201 && opened.statusCode !== 200) fail("open desk " + opened.statusCode);
  else pass("open desk");

  tld.setFetch(mockFetch({
    "GET /bridge/lockDomain/aia": { status: 500, body: { error: "Failed to get bridge lock domain" } },
    "POST /domain-validation": { status: 400, body: { error: "Failed to check domain is bridge lock or not" } }
  }));

  const ownerHdr = { "x-workspace": slug, "x-pin": pin };
  const home = await call(account, "GET", ownerHdr, {}, {});
  if (!home.body || !home.body.aiaTld || !home.body.aiaTld.bridgeLocked || home.body.aiaTld.owned) {
    fail("account GET aiaTld " + JSON.stringify(home.body && home.body.aiaTld));
  } else pass("account GET shows bridge locked, not owned");

  const st = await call(health.status, "GET", ownerHdr, {}, {});
  if (!st.body || !st.body.aiaTld || !st.body.aiaTld.bridgeLocked || st.body.aiaTld.ownedByConnected || st.body.aiaTld.collect !== "hold") {
    fail("status aiaTld " + JSON.stringify(st.body && st.body.aiaTld));
  } else pass("status exposes honest aiaTld");

  const hh = await call(health, "GET", {}, {}, {});
  if (!hh.body || !hh.body.aiaTld || hh.body.aiaTld.mint || hh.body.aiaTld.collect !== "hold") {
    fail("health aiaTld block " + JSON.stringify(hh.body && hh.body.aiaTld));
  } else pass("health aiaTld block is honest");

  const src = helper + ui + html;
  if (/\$250|demo seed|fake ETH|silent Collect/i.test(src)) fail("hard-line leak");
  else pass("no demo money chrome");

  await save();
  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-aia-tld ok");
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
