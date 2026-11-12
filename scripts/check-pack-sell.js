#!/usr/bin/env node
require("./_env-guard");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function must(hay, needle, label) {
  if (!hay.includes(needle)) throw new Error("missing " + label + ": " + needle);
}

const help = read("help.html");
const studio = read("developer.html");
const studioJs = read("developer.js");
const more = read("more.html");
const account = read("account.html");
const walletUi = read("aia-wallet.js");
const packMd = read("PACK.md");
const yesNo = read("ACCOUNT-YES-NO.md");

must(help, 'id="sell-packs"', "help.html sell-packs card");
must(help, "Selling packs — risk honesty", "help.html sell-packs title");
must(help, "Not legal advice", "help.html not legal advice");
must(help, "thin JSON", "help.html thin JSON");
must(help, "buyer", "help.html buyer desk");
must(help, "Yes / Stop / Kill", "help.html Yes/Stop/Kill");
must(help, "Collect stays HOLD", "help.html Collect HOLD");
must(help, "Never hardcode yours", "help.html never hardcode");
must(help, "100% safe", "help.html no 100% safe");
must(help, "never banned", "help.html never banned");
must(help, "stands behind the pack", "help.html creator stands behind");
must(help, "Help is not legal advice", "help.html help not counsel");
must(help, "Talk to AIA", "help.html Talk to AIA");
must(help, "Marketplace can unlist", "help.html unlist");
must(help, "AS IS", "help.html AS IS");
must(help, "does not attach legal terms", "help.html no AIA attach flow");
must(help, "does not run chargeback holds", "help.html no chargeback hold");
must(help, "payout freezes", "help.html no payout freeze");
must(help, "sandbox throttle ladder", "help.html no throttle ladder");

must(help, 'id="pack-worth"', "help.html pack-worth card");
must(help, "When a pack is worth it", "help.html pack-worth title");
must(help, "process already works", "help.html worth it works");
must(help, "qualify → draft", "help.html qualify draft");
must(help, "fallbacks", "help.html fallbacks");
must(help, "Abandoned when APIs change", "help.html abandoned APIs");
must(help, "webhook", "help.html trivial webhook");
must(help, "Drop yourself", "help.html drop yourself");

must(help, 'id="creator-takeaways"', "help.html creator takeaways");
must(help, "Creator takeaways", "help.html takeaways title");
must(help, "buyer keys", "help.html takeaways buyer keys");
must(help, "@handle", "help.html takeaways handle");
must(help, "Owner vs Helper", "help.html takeaways owner helper");
must(help, "No email Team seats", "help.html takeaways no email seats");
must(help, "No merchant-of-record money desk", "help.html takeaways no MoR");
must(help, "No social OAuth auto-post", "help.html takeaways no social OAuth");

must(help, "Your wallet. AIA does not hold keys", "help.html wallet honesty");
must(help, "Collect and pack pay stay HOLD", "help.html pack pay HOLD");
must(help, ".aia Register when Bridge unlocks", "help.html Register when Bridge");
must(help, "not compute credits", "help.html not compute credits");
must(help, "creator payout ledger", "help.html not payout ledger");
must(help, "Collect and payouts HOLD", "help.html collect payouts HOLD");
must(help, "Not Wallet.AIA", "help.html not Wallet.AIA");

must(studio, "Selling packs.", "studio sell-packs one-liner");
must(studio, "/help#sell-packs", "studio sell-packs link");
must(studio, "Help is not legal advice", "studio not legal advice");
const zlib = require("zlib");
function decodeStudio(raw) {
  try { return zlib.gunzipSync(Buffer.from(String(raw).replace(/\s+/g, ""), "base64")).toString("utf8"); }
  catch (e) { return ""; }
}
const studioPack = decodeStudio(read("developer.z64.txt"));
if (studioJs.indexOf('fetch("/developer.z64.txt"') < 0 || studioJs.indexOf('DecompressionStream("gzip")') < 0) {
  throw new Error("Studio loader must unpack developer.z64.txt");
}
if (!studioPack || studioPack.indexOf("Creators Studio") < 0) throw new Error("developer.z64.txt must decode as Creators Studio");
must(studioPack, "Selling packs.", "studio pack sell-packs one-liner");
must(studioPack, "/help#sell-packs", "studio pack sell-packs link");
must(studioPack, "Help is not legal advice", "studio pack not legal advice");
must(studioPack, "Collect stays HOLD", "studio pack Collect HOLD");
must(more, "/help#sell-packs", "more.html sell-packs link");
must(more, "/help#pack-worth", "more.html pack-worth link");

must(account, "Your wallet. AIA does not hold keys", "account.html wallet honesty");
must(account, "Collect and pack pay stay HOLD", "account.html pack pay HOLD");
must(account, ".aia Register when Bridge unlocks", "account.html Register when Bridge");
must(account, "not compute credits", "account.html not compute credits");
must(account, "creator payout ledger", "account.html not payout ledger");
must(walletUi, "Your wallet. AIA does not hold keys", "aia-wallet.js honesty");
must(walletUi, "not compute credits", "aia-wallet.js not compute credits");
must(walletUi, "creator payout ledger", "aia-wallet.js not payout ledger");
must(walletUi, "Collect and pack pay stay HOLD", "aia-wallet.js Collect HOLD");
must(walletUi, ".aia Register when Bridge unlocks", "aia-wallet.js Register when Bridge");

must(packMd, "Selling packs — risk honesty", "PACK.md risk honesty");
must(packMd, "When a pack is worth it", "PACK.md pack worth");
must(yesNo, "Selling packs — risk honesty", "ACCOUNT-YES-NO risk honesty");
must(yesNo, "When a pack is worth it", "ACCOUNT-YES-NO pack worth");

const sell = help.slice(help.indexOf('id="sell-packs"'), help.indexOf('id="pack-worth"'));
const worth = help.slice(help.indexOf('id="pack-worth"'), help.indexOf('id="creator-takeaways"'));
[sell, worth].forEach(function (chunk, i) {
  const name = i === 0 ? "sell-packs" : "pack-worth";
  if (/\$47|\$197|\$50|300 hours|10\s*[–-]\s*15\s*minutes/i.test(chunk)) {
    throw new Error(name + " invented $ or hours table");
  }
});

["Lemon Squeezy", "Paddle"].forEach(function (bit) {
  if (sell.includes(bit)) throw new Error("sell-packs must not invent " + bit + " as an AIA pipe");
});

["Login Kit", "auto-schedule", "aiastudios.app", "compute credits wallet"].forEach(function (bit) {
  if (help.includes(bit) || studio.includes(bit) || studioJs.includes(bit) || studioPack.includes(bit)) {
    throw new Error("invented fiction: " + bit);
  }
});


function sliceFn(src, name) {
  const start = src.indexOf("async function " + name) >= 0 ? src.indexOf("async function " + name) : src.indexOf("function " + name);
  if (start < 0) return "";
  const next = src.slice(start + 10).search(/\n  (async )?function /);
  return src.slice(start, next >= 0 ? start + 10 + next : start + 1200);
}
const bootFn = sliceFn(studioPack, "boot");
const submitFn = sliceFn(studioPack, "submitPack");
const saveFn = sliceFn(studioPack, "saveDraft");
const bindFn = sliceFn(studioPack, "bindLab");
if (!submitFn) throw new Error("Studio missing submitPack");
if (!bindFn || bindFn.indexOf("submit-pack") < 0 || bindFn.indexOf("submitPack") < 0) {
  throw new Error("Publish must be a human tap on #submit-pack");
}
if (bootFn && (bootFn.indexOf("submitPack") >= 0 || bootFn.indexOf("submit-pack") >= 0)) {
  throw new Error("Studio boot must not publish a pack");
}
if (saveFn.indexOf("list-pack") >= 0 && /status:\s*"listed"|submit:\s*true/.test(saveFn)) {
  throw new Error("Save draft must not list the pack on Market");
}
if (/charged:\s*true/.test(studioPack) || /charged:\s*true/.test(walletUi) || /charged:\s*true/.test(account)) {
  throw new Error("Studio, wallet, or account must not send charged:true");
}
if (submitFn.indexOf("charged") >= 0 && /charged:\s*true/.test(submitFn)) {
  throw new Error("Publish must not charge");
}
if (/action:\s*"payout"|action:\s*"withdraw"|action:\s*"pay-out"/.test(studioPack + walletUi + account)) {
  throw new Error("Studio, wallet, or account must not pay out");
}
must(studioPack, "No silent charge", "studio pack no silent charge");
must(studioPack, "no public payout baseline", "studio pack no payout baseline");
if (help.indexOf("Collect and payouts HOLD") < 0 && help.indexOf("Collect and pack pay stay HOLD") < 0) {
  throw new Error("help must keep payouts HOLD");
}

function unique(rows) {
  const out = [];
  rows.forEach(function (row) { if (out.indexOf(row) < 0) out.push(row); });
  return out;
}
function sellFaults(loader, pack, helpSrc, accountSrc, walletSrc) {
  const bad = [];
  const hasLoader = loader.indexOf('fetch("/developer.z64.txt"') >= 0 && loader.indexOf('DecompressionStream("gzip")') >= 0;
  if (!hasLoader || !pack || pack.indexOf("Selling packs.") < 0 || pack.indexOf("/help#sell-packs") < 0) {
    bad.push("Studio sell-packs copy gone");
  }
  const boot = sliceFn(pack, "boot");
  const submit = sliceFn(pack, "submitPack");
  const bind = sliceFn(pack, "bindLab");
  const save = sliceFn(pack, "saveDraft");
  if (!submit || !bind || bind.indexOf("submit-pack") < 0 || bind.indexOf("submitPack") < 0 || (boot && (boot.indexOf("submitPack") >= 0 || boot.indexOf("submit-pack") >= 0)) || (save && /status:\s*"listed"|submit:\s*true/.test(save))) {
    bad.push("list/publish without Yes");
  }
  if (/charged:\s*true/.test(pack) || /charged:\s*true/.test(walletSrc) || /charged:\s*true/.test(accountSrc) || (submit && /charged:\s*true/.test(submit))) {
    bad.push("charge without Yes");
  }
  if (/action:\s*"payout"|action:\s*"withdraw"|action:\s*"pay-out"/.test(pack + walletSrc + accountSrc)) {
    bad.push("payout without Yes");
  }
  if (helpSrc.indexOf("Collect and pack pay stay HOLD") < 0 && helpSrc.indexOf("Collect and payouts HOLD") < 0) {
    bad.push("payout without Yes");
  }
  if (walletSrc.indexOf("Collect and pack pay stay HOLD") < 0 || accountSrc.indexOf("Collect and pack pay stay HOLD") < 0) {
    bad.push("payout without Yes");
  }
  return unique(bad);
}
function applyMutant(kind, files) {
  const next = { loader: files.loader, pack: files.pack, helpSrc: files.helpSrc, accountSrc: files.accountSrc, walletSrc: files.walletSrc };
  if (kind === "Studio sell-packs copy gone") {
    next.pack = next.pack.replace(/Selling packs\./g, "Move product.").replace(/\/help#sell-packs/g, "/help#skip");
  } else if (kind === "charge without Yes") {
    next.pack = next.pack.replace("async function submitPack()", "async function submitPack(){ await post(\"submit-pack\", { charged: true }); }\nasync function submitPackOld") + "\ncharged: true";
  } else if (kind === "list/publish without Yes") {
    next.pack = next.pack.replace("async function boot()", "async function boot(){ submitPack(); }\nasync function bootOld");
  } else if (kind === "payout without Yes") {
    next.walletSrc = next.walletSrc.replace(/Collect and pack pay stay HOLD/g, "Pack pay is sent now") + '\nfetch("/api/desks",{method:"POST",body:JSON.stringify({action:"payout"})});';
    next.accountSrc = next.accountSrc.replace(/Collect and pack pay stay HOLD/g, "Pack pay is sent now");
    next.helpSrc = next.helpSrc.replace(/Collect and pack pay stay HOLD/g, "Pack pay is sent now").replace(/Collect and payouts HOLD/g, "Payouts go out now");
    next.pack = next.pack + '\n{ action: "payout" }';
  }
  return next;
}

let failed = 0;
function fail(msg) { failed += 1; console.error("FAIL " + msg); }
function pass(msg) { console.log("ok  " + msg); }

const files = { loader: studioJs, pack: studioPack, helpSrc: help, accountSrc: account, walletSrc: walletUi };
const live = sellFaults(files.loader, files.pack, files.helpSrc, files.accountSrc, files.walletSrc);
if (live.length) fail("pack sell behaviour drifted: " + live.join("; "));
else pass("sell honesty, human Publish, and Collect/payout HOLD still hold");

const mutants = ["Studio sell-packs copy gone", "charge without Yes", "list/publish without Yes", "payout without Yes"];
let caught = 0;
mutants.forEach(function (kind) {
  const next = applyMutant(kind, files);
  const faults = sellFaults(next.loader, next.pack, next.helpSrc, next.accountSrc, next.walletSrc);
  if (faults.indexOf(kind) < 0) fail("mutant missed: " + kind + " (got " + JSON.stringify(faults) + ")");
  else { caught += 1; pass("mutant caught: " + kind); }
});
if (caught !== mutants.length) fail("mutants: " + caught + "/" + mutants.length + " caught");
else pass("mutants: " + caught + "/" + mutants.length + " caught");
if (failed) {
  console.error("check-pack-sell failed");
  process.exit(1);
}

console.log("check-pack-sell: ok");
