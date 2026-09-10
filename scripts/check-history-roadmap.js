#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const vm = require("vm");

const root = path.join(__dirname, "..");

let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

["people.js", "api/_history.js", "api/_desk.js", "api/_desks-http.js"].forEach(function (name) {
  const syntax = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
  if (syntax.status !== 0) fail(name + " must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
  else pass(name + " parses");
});
(function () {
  const m = read("history.html").match(/<script>\s*var lane[\s\S]*?<\/script>/);
  if (!m) {
    fail("history.html script must parse: missing History paint script");
    return;
  }
  const tmp = path.join(require("os").tmpdir(), "aia-history-road-" + Date.now() + ".js");
  fs.writeFileSync(tmp, m[0].replace(/^<script>/, "").replace(/<\/script>$/, ""));
  const syntax = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  try { fs.unlinkSync(tmp); } catch (e) {}
  if (syntax.status !== 0) fail("history.html script must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
  else pass("history.html script parses");
})();

const history = read("history.html");
const people = read("people.js");
const peopleHtml = read("people.html");
const account = read("account.html");
const help = read("help.html");
const more = read("more.html");
const packMd = read("PACK.md");
const yesNo = read("ACCOUNT-YES-NO.md");
const pkg = read("package.json");
const histSrc = read("api/_history.js");
const deskSrc = read("api/_desk.js");
const desksSrc = read("api/_desks-http.js");
const packsSrc = read("api/_packs.js");

[
  "id=\"account-road\"",
  "id=\"road-body\"",
  "id=\"sheet-road\"",
  "id=\"road-file\"",
  "function roadHtml",
  "function paintRoad",
  "function givePack",
  "function postAia",
  "Give pack",
  "Update pack",
  "install-aia",
  "download-pack",
  "Recurring update pass HOLD",
  "Push to another desk HOLD",
  ".aia identity HOLD until mint",
  "Give is the file",
  "Update is install again",
  "Collect HOLD",
  "not custody"
].forEach(function (bit) {
  if (history.indexOf(bit) < 0) fail("history.html missing " + bit);
  else pass("history.html " + bit);
});

if (history.indexOf("esc(past)") < 0 || history.indexOf("esc(now)") < 0 || history.indexOf("esc(next)") < 0) {
  fail("History roadmap copy must stay escaped");
} else pass("History roadmap copy is escaped");

if (!/accept=["']\.aia/.test(history)) fail("History pack picker must accept .aia");
else pass("History pack picker accepts .aia");

if (/action:\s*["']give-pack["']|action:\s*["']update-pack["']/.test(history)) {
  fail("History must not invent give-pack / update-pack charge actions");
} else pass("History uses existing pack actions");

const fiction = /Wallet\.AIA|on-chain pack buy|AIA coin|gas pricing|cloud hosting|account levels|credits metering|fake economy|OAuth|robots\/IoT|silent charge|Collect charge/i;
if (fiction.test(history)) fail("History roadmap invented a HOLD item as live");
else pass("History roadmap has no invented live economy");

if (people.indexOf("function accountRoadMini") < 0 || people.indexOf("/history#account-road") < 0) {
  fail("People shared trail must point at the History account roadmap");
} else pass("People shared trail points at History roadmap");
if (peopleHtml.indexOf("id=\"sheet-road\"") < 0) fail("people.html must keep Explore / person sheet-road");
else pass("people.html has sheet-road");
if (peopleHtml.indexOf("past / now / next lives on History") < 0) {
  fail("people.html must name the account roadmap");
} else pass("people.html names the account roadmap");

if (account.indexOf("id=\"account-road\"") < 0 || account.indexOf("/history#account-road") < 0) {
  fail("account.html must point at the History roadmap");
} else pass("account.html points at History roadmap");
if (account.indexOf("Recurring update HOLD") < 0 || account.indexOf("Collect HOLD") < 0) {
  fail("account.html must keep pack / Collect HOLD");
} else pass("account.html keeps HOLD");

if (help.indexOf("this account’s roadmap") < 0 || help.indexOf("Give is the file") < 0) {
  fail("help.html must name the History account roadmap");
} else pass("help.html names the History account roadmap");
if (more.indexOf("This account’s past / now / next") < 0 || more.indexOf("Give is the file") < 0) {
  fail("more.html History must name the account roadmap");
} else pass("more.html names the account roadmap");
if (packMd.indexOf("Give pack = download") < 0 || packMd.indexOf("download-pack") < 0) {
  fail("PACK.md must name give as download-pack");
} else pass("PACK.md names give as download-pack");
if (packMd.indexOf("install-aia") < 0 || packMd.indexOf("Recurring update pass") < 0) {
  fail("PACK.md must name update as install-aia + HOLD");
} else pass("PACK.md names update as install-aia + HOLD");

if (yesNo.indexOf("check-history-roadmap.js") < 0) fail("ACCOUNT-YES-NO must record History account roadmap");
else pass("ACCOUNT-YES-NO records History account roadmap");
if (yesNo.indexOf("Give pack as a silent push") < 0) fail("ACCOUNT-YES-NO must HOLD silent give");
else pass("ACCOUNT-YES-NO HOLDs silent give");
if (yesNo.indexOf("History leftover") < 0) fail("ACCOUNT-YES-NO must name History leftover");
else pass("ACCOUNT-YES-NO names History leftover");
if (packMd.indexOf("History leftover") < 0) fail("PACK.md must name History leftover");
else pass("PACK.md names History leftover");
if (/if\(tok\)h\["X-Session"\]=tok;\s*else if\(d&&d\.pin\)/.test(history)) {
  fail("History packHdr must still send the open-desk pin when a session token is present");
} else pass("History packHdr keeps X-Pin with X-Session");
if (history.indexOf('if(pin)h["X-Pin"]=pin') < 0) fail("History packHdr must send X-Pin");
else pass("History packHdr sends X-Pin");
if (pkg.indexOf("check-history-roadmap.js") < 0) fail("package.json must run check-history-roadmap");
else pass("package.json runs check-history-roadmap");

if (histSrc.indexOf("function accountRoadmapOf") < 0) fail("api/_history.js missing accountRoadmapOf");
else pass("api/_history.js accountRoadmapOf");
if (desksSrc.indexOf("account: accountRoadmapOf(desks)") < 0) fail("history API must return account roadmap");
else pass("history API returns account roadmap");
if (deskSrc.indexOf("pack: row.pack") < 0 || deskSrc.indexOf("packName: row.packName") < 0) {
  fail("publicDesk must expose the installed pack");
} else pass("publicDesk exposes installed pack");

if (packsSrc.indexOf("action === \"give-pack\"") >= 0 || packsSrc.indexOf("action === \"update-pack\"") >= 0) {
  fail("do not invent give-pack / update-pack APIs");
} else pass("no invented give-pack / update-pack APIs");
if (packsSrc.indexOf("charged: false") < 0) fail("packs must stay charged: false");
else pass("packs stay charged: false");

const hist = require(path.join(root, "api/_history"));
if (typeof hist.accountRoadmapOf !== "function") fail("accountRoadmapOf must be exported");
else pass("accountRoadmapOf exported");

const emptyRoad = hist.accountRoadmapOf([]);
if (!emptyRoad || emptyRoad.desks !== 0 || emptyRoad.pack) fail("empty accountRoadmapOf must stay empty");
else pass("empty accountRoadmapOf stays empty");
if (!emptyRoad.install || emptyRoad.install.action !== "install-aia") fail("roadmap install must name install-aia");
else pass("roadmap install names install-aia");
if (!emptyRoad.give || emptyRoad.give.action !== "download-pack") fail("roadmap give must name download-pack");
else pass("roadmap give names download-pack");
if (!emptyRoad.update || emptyRoad.update.action !== "install-aia") fail("roadmap update must name install-aia");
else pass("roadmap update names install-aia");

const liveRoad = hist.accountRoadmapOf([
  { ok: true, name: "Shop <desk>", slug: "shop", pack: "vita", packName: "Insurance <pack>", you: { role: "owner" } }
]);
if (liveRoad.desk !== "Shop <desk>") fail("accountRoadmapOf must keep the desk name");
else pass("accountRoadmapOf keeps desk name");
if (liveRoad.pack !== "Insurance <pack>" || liveRoad.packId !== "vita") fail("accountRoadmapOf must keep the installed pack");
else pass("accountRoadmapOf keeps installed pack");
if (!liveRoad.owner) fail("accountRoadmapOf must mark the owner");
else pass("accountRoadmapOf marks owner");

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, function (c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
  });
}

const paintSrc = history.match(/function roadHtml\(road\)[\s\S]*?\nfunction paintRoad/);
if (!paintSrc) {
  fail("could not extract History roadHtml");
} else {
  const ctx = { esc: esc };
  vm.runInNewContext(paintSrc[0].replace(/\nfunction paintRoad[\s\S]*$/, ""), ctx);
  if (typeof ctx.roadHtml !== "function") fail("roadHtml must run");
  else pass("roadHtml runs");
  const html = ctx.roadHtml({ desk: "Shop <desk>", pack: "Insurance <pack>" });
  if (html.indexOf("Shop <desk>") >= 0 || html.indexOf("Insurance <pack>") >= 0) {
    fail("roadHtml raw < must not become markup");
  } else if (html.indexOf("Shop &lt;desk&gt;") < 0 || html.indexOf("Insurance &lt;pack&gt;") < 0) {
    fail("roadHtml desk / pack must stay text, got " + html);
  } else pass("roadHtml desk / pack stay text");
  if (html.indexOf("Give pack") < 0 || html.indexOf("Update pack") < 0) fail("roadHtml must name give / update");
  else pass("roadHtml names give / update");
  if (html.indexOf("data-road=\"install\"") < 0 || html.indexOf("data-road=\"give\"") < 0 || html.indexOf("data-road=\"update\"") < 0) {
    fail("roadHtml must keep install / give / update taps");
  } else pass("roadHtml keeps pack taps");
  if (html.indexOf("Push to another desk HOLD") < 0 || html.indexOf("Recurring update pass HOLD") < 0) {
    fail("roadHtml must HOLD silent give / recurring update");
  } else pass("roadHtml HOLDs silent give / recurring update");
  if (html.indexOf("Collect HOLD") < 0 || html.indexOf("HOLD until mint") < 0) fail("roadHtml must HOLD Collect / mint");
  else pass("roadHtml HOLDs Collect / mint");
  const bare = ctx.roadHtml({});
  if (bare.indexOf("No pack on this desk yet") < 0) fail("empty roadmap must not invent a pack");
  else pass("empty roadmap does not invent a pack");
  if (/vita\.json|demo pack|placeholder pack/i.test(bare)) fail("empty roadmap invented a placeholder pack");
  else pass("empty roadmap has no placeholder pack");
}

if (people.indexOf("accountRoadMini()") < 0) fail("People openSheet must paint accountRoadMini");
else pass("People openSheet paints accountRoadMini");

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

async function leftoverMain() {
  const store = path.join(require("os").tmpdir(), "aia-history-road-leftover-" + Date.now() + ".json");
  process.env.AIA_STORE_PATH = store;
  delete global.__aia;
  delete global.__aiaHydrate;
  ["../api/_lib", "../api/_packs", "../api/auth", "../api/_desks-http"].forEach(function (mod) {
    try { delete require.cache[require.resolve(mod)]; } catch (e) {}
  });
  const lib = require("../api/_lib");
  const packHandler = require("../api/_packs");
  const auth = require("../api/auth");
  const { mem, ready, save, hashPin, ensurePeople } = lib;
  await ready();
  const slug = "history-pack-desk";
  const pin = "2468";
  const leftover = "deadbeefdeadbeefdeadbeefdeadbeef";
  const opened = await call(auth, "POST", { "x-workspace": slug }, {
    action: "open",
    slug: slug,
    biz: "History Pack Desk",
    name: "Pat",
    pin: pin
  });
  if (opened.statusCode !== 201 && opened.statusCode !== 200) fail("open desk " + opened.statusCode);
  else pass("open desk");
  const shop = (mem.workspaces || []).find(function (w) { return w && w.slug === slug; });
  if (!shop) fail("open desk missing workspace");
  else {
    ensurePeople(shop);
    shop.pin = shop.pin || hashPin(pin);
  }
  const owner = { "x-workspace": slug, "x-pin": pin };
  const packed = await call(packHandler, "POST", owner, {
    action: "private-pack",
    name: "History lane",
    aia: "history-lane.aia",
    does: "Draft the lane. Collect HOLD."
  });
  if (packed.statusCode !== 200 || !packed.body || !packed.body.ok) {
    fail("private-pack " + packed.statusCode + " " + JSON.stringify(packed.body));
  } else pass("private-pack on History desk");

  const leftoverInstall = await call(packHandler, "POST", {
    "x-workspace": slug,
    "x-session": leftover
  }, { action: "install-aia", filename: "history-lane.aia", pack: { name: "History lane", aia: "history-lane.aia", does: "Draft. Collect HOLD." } });
  if (leftoverInstall.statusCode !== 403) {
    fail("leftover session without pin must still 403 History install-aia, got " + leftoverInstall.statusCode);
  } else pass("leftover session without pin stays 403 on History install-aia");

  const leftoverInstallPin = await call(packHandler, "POST", {
    "x-workspace": slug,
    "x-session": leftover,
    "x-pin": pin
  }, { action: "install-aia", filename: "history-lane.aia", pack: { name: "History lane", aia: "history-lane.aia", does: "Draft. Collect HOLD." } });
  if (leftoverInstallPin.statusCode !== 200 || !leftoverInstallPin.body || !leftoverInstallPin.body.ok) {
    fail("leftover session + matching pin must still install-aia " + leftoverInstallPin.statusCode + " " + JSON.stringify(leftoverInstallPin.body));
  } else pass("leftover session + pin installs .aia");

  const leftoverGive = await call(packHandler, "POST", {
    "x-workspace": slug,
    "x-session": leftover,
    "x-pin": pin
  }, { action: "download-pack", id: "history-lane.aia", aia: "history-lane.aia" });
  if (leftoverGive.statusCode !== 200) {
    fail("leftover session + pin must still download-pack " + leftoverGive.statusCode);
  } else pass("leftover session + pin downloads .aia");

  const leftoverWrong = await call(packHandler, "POST", {
    "x-workspace": slug,
    "x-session": leftover,
    "x-pin": "0000"
  }, { action: "install-aia", filename: "history-lane.aia", pack: { name: "History lane", aia: "history-lane.aia" } });
  if (leftoverWrong.statusCode !== 403) {
    fail("wrong leftover pin must still 403 History install-aia, got " + leftoverWrong.statusCode);
  } else pass("wrong leftover pin stays 403 on History install-aia");

  const leftoverEmpty = await call(packHandler, "POST", {
    "x-workspace": slug,
    "x-session": leftover,
    "x-pin": ""
  }, { action: "install-aia", filename: "history-lane.aia", pack: { name: "History lane", aia: "history-lane.aia" } });
  if (leftoverEmpty.statusCode !== 403) {
    fail("empty leftover pin must still 403 History install-aia, got " + leftoverEmpty.statusCode);
  } else pass("empty leftover pin stays 403 on History install-aia");

  await save();
  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-history-roadmap: ok");
}

leftoverMain().catch(function (e) {
  console.error(e);
  process.exit(1);
});
