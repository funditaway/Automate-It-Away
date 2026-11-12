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
const preview = read("drop-preview.js");
const drop = read("drop.html");
const yesNo = read("ACCOUNT-YES-NO.md");

must(help, 'id="desk-cards"', "help.html desk-cards card");
must(help, "Desk cards", "help.html desk-cards title");
must(help, "queue card", "help.html queue card");
must(help, "not a raw chat blob", "help.html not chat blob");
must(help, "Yes / Stop / Kill stay human", "help.html human rail");
must(help, "auto-send mail", "help.html not auto mail");
must(help, "push git", "help.html not push git");
must(help, "Collect charge", "help.html not collect charge");
must(help, "Collect stays HOLD", "help.html Collect HOLD");
must(help, "12 card fields", "help.html 12 fields cap");
must(help, "illustrative only", "help.html sample illustrative");
must(help, '"when": "drop"', "help.html sample when drop");

must(studio, "Desk cards.", "studio desk-cards one-liner");
must(studio, "/help#desk-cards", "studio desk-cards link");
must(studio, "12 card fields", "studio 12 fields");
must(studio, "Reply on the card when a Desk AI asks", "studio desk-cards Desk AI asks");
if (studio.includes("when the desk asks")) throw new Error("studio desk-cards still says when the desk asks");
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
must(studioPack, "Desk cards.", "studio pack desk-cards one-liner");
must(studioPack, "/help#desk-cards", "studio pack desk-cards link");
must(studioPack, "Reply on the card when a Desk AI asks", "studio pack desk-cards Desk AI asks");
must(studioPack, "12 card fields", "studio pack 12 fields");
if (studioPack.includes("when the desk asks")) throw new Error("studio pack desk-cards still says when the desk asks");
must(more, "/help#desk-cards", "more.html desk-cards link");

must(preview, 'get("ws")', "drop-preview reads ?ws=");
must(preview, "function queryWs", "drop-preview queryWs");
must(preview, "function deskSlug", "drop-preview deskSlug");
if (preview.indexOf("queryWs() || window.ws") < 0) throw new Error("drop-preview deskSlug must honor ?ws= then window.ws");
const dropApp = read("drop-app.js");
const deskSwitch = read("desk-switch.js");
must(drop, "/drop-app.js", "drop.html loads drop-app");
must(read("widget.html"), "/drop-app.js", "widget.html loads drop-app");
must(dropApp, "if (ws) window.ws = ws", "drop-app shares ws with preview");
must(dropApp, "AIADesks.captureDesk", "drop-app reads captureDesk");
must(deskSwitch, "function captureDesk", "desk-switch captureDesk");
if (deskSwitch.indexOf("/[?&]ws=([^&]*)/") < 0 && deskSwitch.indexOf('[?&]ws=') < 0) {
  throw new Error("captureDesk must honor ?ws= so a public drop link names the desk");
}

must(yesNo, "Desk cards", "ACCOUNT-YES-NO desk-cards");
must(yesNo, "Help FAQ Desk AI leftover after that pass", "ACCOUNT-YES-NO names Help FAQ Desk AI leftover");
must(read("PACK.md"), "Help FAQ Desk AI leftover:", "PACK.md names Help FAQ Desk AI leftover");

["render_desk_card", "interactive_review", "code_diff", "token badge"].forEach(function (bit) {
  if (help.includes(bit) || studio.includes(bit) || studioJs.includes(bit) || studioPack.includes(bit)) {
    throw new Error("invented desk-card product name: " + bit);
  }
});

const card = help.slice(help.indexOf('id="desk-cards"'), help.indexOf("Something broke?"));
if (/\$47|\$197|MoR|Router Node|Connected Accounts/i.test(card)) {
  throw new Error("desk-cards invented blocked fiction");
}


function unique(rows) {
  const out = [];
  rows.forEach(function (row) { if (out.indexOf(row) < 0) out.push(row); });
  return out;
}
function buildFaults(files) {
  const bad = [];
  const helpCardStart = files.help.indexOf('id="desk-cards"');
  const helpCardEnd = files.help.indexOf("Something broke?");
  const helpCard = helpCardStart >= 0 && helpCardEnd > helpCardStart ? files.help.slice(helpCardStart, helpCardEnd) : "";
  if (!helpCard || helpCard.indexOf("Desk cards") < 0 || helpCard.indexOf("not a raw chat blob") < 0 || helpCard.indexOf("Yes / Stop / Kill stay human") < 0 || helpCard.indexOf("Collect stays HOLD") < 0 || helpCard.indexOf("12 card fields") < 0) {
    bad.push("Help desk-cards honesty gone");
  }
  const hasLoader = files.loader.indexOf('fetch("/developer.z64.txt"') >= 0 && files.loader.indexOf('DecompressionStream("gzip")') >= 0;
  if (!hasLoader || !files.pack || files.pack.indexOf("Desk cards.") < 0 || files.pack.indexOf("/help#desk-cards") < 0 || files.pack.indexOf("Reply on the card when a Desk AI asks") < 0 || files.more.indexOf("/help#desk-cards") < 0) {
    bad.push("Studio desk-cards copy gone");
  }
  const honorsQuery = files.deskSwitch.indexOf("/[?&]ws=([^&]*)/") >= 0 || files.deskSwitch.indexOf("[?&]ws=") >= 0;
  if (files.drop.indexOf("/drop-app.js") < 0 || files.widget.indexOf("/drop-app.js") < 0 || files.dropApp.indexOf("if (ws) window.ws = ws") < 0 || files.dropApp.indexOf("AIADesks.captureDesk") < 0 || !honorsQuery || files.preview.indexOf('get("ws")') < 0 || files.preview.indexOf("queryWs() || window.ws") < 0) {
    bad.push("public /drop?ws= no longer names the desk");
  }
  if (helpCard.indexOf("Yes / Stop / Kill stay human") < 0 || helpCard.indexOf("Collect stays HOLD") < 0 || /charged:\s*true/.test(files.pack || "") || /action:\s*"payout"|action:\s*"withdraw"/.test(files.pack || "")) {
    bad.push("install or charge without Yes");
  }
  return unique(bad);
}
function applyMutant(kind, files) {
  const next = {
    help: files.help, more: files.more, loader: files.loader, pack: files.pack,
    drop: files.drop, widget: files.widget, dropApp: files.dropApp,
    deskSwitch: files.deskSwitch, preview: files.preview
  };
  if (kind === "Help desk-cards honesty gone") {
    next.help = next.help
      .replace(/id="desk-cards"/g, 'id="gone-cards"')
      .replace(/not a raw chat blob/g, "just a chat blob")
      .replace(/Yes \/ Stop \/ Kill stay human/g, "It goes out on its own")
      .replace(/Collect stays HOLD/g, "Collect is live")
      .replace(/12 card fields/g, "open field dump");
  } else if (kind === "Studio desk-cards copy gone") {
    next.pack = next.pack
      .replace(/Desk cards\./g, "Skip the cards.")
      .replace(/\/help#desk-cards/g, "/help#gone")
      .replace(/Reply on the card when a Desk AI asks/g, "when the desk asks");
    next.more = next.more.replace(/\/help#desk-cards/g, "/help#gone");
  } else if (kind === "public /drop?ws= no longer names the desk") {
    next.drop = next.drop.replace(/\/drop-app\.js/g, "/gone-app.js");
    next.widget = next.widget.replace(/\/drop-app\.js/g, "/gone-app.js");
    next.dropApp = next.dropApp.replace(/if \(ws\) window\.ws = ws/g, "window.ws = ''").replace(/AIADesks\.captureDesk/g, "AIADesks.goneDesk");
    next.deskSwitch = next.deskSwitch.replace("/[?&]ws=([^&]*)/", "/[?&]gone=([^&]*)/");
    next.preview = next.preview.replace(/get\("ws"\)/g, 'get("gone")').replace(/queryWs\(\) \|\| window\.ws/g, 'localStorage.getItem("aia_ws")');
  } else if (kind === "install or charge without Yes") {
    next.help = next.help
      .replace(/Yes \/ Stop \/ Kill stay human/g, "It goes out on its own")
      .replace(/Collect stays HOLD/g, "Collect is live");
    next.pack = next.pack + "\ncharged: true\n{ action: \"payout\" }\n{ action: \"install-aia\" }";
  }
  return next;
}

let failed = 0;
function fail(msg) { failed += 1; console.error("FAIL " + msg); }
function pass(msg) { console.log("ok  " + msg); }

const files = {
  help: help, more: more, loader: studioJs, pack: studioPack,
  drop: drop, widget: read("widget.html"), dropApp: dropApp,
  deskSwitch: deskSwitch, preview: preview
};
const live = buildFaults(files);
if (live.length) fail("desk cards behaviour drifted: " + live.join("; "));
else pass("Help desk-cards, Studio pack copy, and public /drop?ws= desk naming still hold");

const mutants = [
  "Help desk-cards honesty gone",
  "Studio desk-cards copy gone",
  "public /drop?ws= no longer names the desk",
  "install or charge without Yes"
];
let caught = 0;
mutants.forEach(function (kind) {
  const faults = buildFaults(applyMutant(kind, files));
  if (faults.indexOf(kind) < 0) fail("mutant missed: " + kind + " (got " + JSON.stringify(faults) + ")");
  else { caught += 1; pass("mutant caught: " + kind); }
});
if (caught !== mutants.length) fail("mutants: " + caught + "/" + mutants.length + " caught");
else pass("mutants: " + caught + "/" + mutants.length + " caught");
if (failed) {
  console.error("check-desk-cards failed");
  process.exit(1);
}

console.log("check-desk-cards: ok");
