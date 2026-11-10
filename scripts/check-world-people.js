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

const people = read("people.html");
must(people, 'id="world-who"', "people.html world-who");
must(people, 'id="world-kind"', "people.html world-kind");
must(people, 'id="world-btn"', "people.html world-btn");
must(people, 'id="world-find-btn"', "people.html world-find-btn");
must(people, 'id="world-note"', "people.html world-note");
must(people, 'id="asks"', "people.html asks");
must(people, 'id="world"', "people.html world");
must(people, "people-world.js", "people.html loads overlay");
must(people, "@handle", "people.html handle copy");

const overlay = read("people-world.js");
must(overlay, '"find"', "overlay POST find");
must(overlay, '"invite-world"', "overlay POST invite-world");
must(overlay, '"accept-invite"', "overlay POST accept-invite");
must(overlay, '"decline-invite"', "overlay POST decline-invite");
must(overlay, '"invites"', "overlay POST invites");

const admin = read("api/admin.js");
must(admin, '_world-people', "admin requires helper");
must(admin, 'invite-world', "admin invite-world");
must(admin, 'accept-invite', "admin accept-invite");
must(admin, 'decline-invite', "admin decline-invite");
must(admin, 'searchWorldAccounts', "admin searchWorldAccounts");
if (admin.includes("leaveDesk")) throw new Error("admin.js must not call leaveDesk");

const helper = read("api/_world-people.js");
must(helper, "searchWorldAccounts", "helper searchWorldAccounts");
must(helper, "inviteWorld", "helper inviteWorld");
must(helper, "acceptInvite", "helper acceptInvite");
must(helper, "looksLikeEmail", "helper rejects email");
must(helper, "publicWorldCard", "helper public card");

const more = read("more.html");
must(more, "@handle", "more.html People copy");

const help = read("help.html");
must(help, "@handle", "help.html People copy");
must(help, 'id="people-desk"', "help.html add-people card");
must(help, "Add people to this desk", "help.html add-people title");
must(help, "AIA does not send invite mail", "help.html no invite mail");
must(help, "own seat", "help.html own seat");
must(help, "Cannot Stop", "help.html helper cannot Stop");
must(help, "<dt>Member</dt>", "help.html Member seat");
must(help, "operate the queue per the owner's instructions", "help.html member operate per owner");
must(help, "They use the desk, drop work into it", "help.html member use and drop");
must(help, 'id="onboard-desk"', "help.html onboard-desk card");
must(help, "Onboard this desk", "help.html onboard title");
must(help, "www.automateitaway.com/api/hook", "help.html inbound hook");
must(help, "Zapier or Make", "help.html Zapier/Make today");
must(help, "Search a site / Log in", "help.html vendor console");
must(help, "draft only", "help.html login is draft");
must(help, "Calendar, SMS, Square, and eBay stay HOLD", "help.html hold pipes");
must(help, "desk name plus a desk code", "help.html desk identity");
must(help, "<code>yourname.aia</code>-style name", "help.html yourname.aia-style name");
if (help.includes("james.aia")) throw new Error("help.html must not show the owner name james.aia");
must(help, "no live Business Details or brand-kit", "help.html no brand-kit page");
must(help, 'href="#people-desk"', "help.html people-desk link");
must(help, "Owner vs Helper", "help.html owner vs helper");
must(help, "does not send Team email seats", "help.html no team seats");
must(help, "Creators Studio", "help.html packs studio");
must(help, "/dev", "help.html /dev");
must(help, "no silent charge", "help.html no silent charge");
must(help, "do not map shared OpenAI keys into packs", "help.html no shared keys");
must(help, "Not on this desk", "help.html onboard denial");
must(help, "Connect Tool", "help.html denies Connect Tool");
must(help, "Connected Accounts", "help.html denies Connected Accounts");
must(help, "Admin / Creator / Viewer", "help.html denies team roles");
must(help, "Import Pack", "help.html denies Import Pack keys");

const studio = read("developer.html");
must(studio, "Add people.", "studio add-people one-liner");
must(studio, "AIA does not send invite mail", "studio no invite mail");
must(studio, "Onboard this desk.", "studio onboard one-liner");
must(studio, "/help#onboard-desk", "studio onboard link");

const studioJs = read("developer.js");
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
must(studioPack, "Onboard this desk.", "studio pack onboard one-liner");
must(studioPack, "/help#onboard-desk", "studio pack onboard link");
must(studioPack, "Add people.", "studio pack add-people one-liner");
must(studioPack, "AIA does not send invite mail", "studio pack no invite mail");

must(more, "/help#onboard-desk", "more.html onboard link");

["aiastudios.app", "Team & Permissions", "Workspace Settings"].forEach(function (bit) {
  if (help.includes(bit) || studio.includes(bit) || studioJs.includes(bit) || studioPack.includes(bit)) {
    throw new Error("invented people chrome: " + bit);
  }
});

function onlyInDenial(hay, bit, label) {
  var idx = 0;
  var found = false;
  while ((idx = hay.indexOf(bit, idx)) !== -1) {
    found = true;
    var before = hay.slice(Math.max(0, idx - 400), idx);
    if (!/Not on this desk/i.test(before)) throw new Error("invented chrome outside denial (" + label + "): " + bit);
    idx += bit.length;
  }
  if (!found) throw new Error("missing denial of " + bit);
}

onlyInDenial(help, "Connected Accounts", "help.html");
onlyInDenial(help, "Connect Tool", "help.html");
onlyInDenial(help, "Import Pack", "help.html");
onlyInDenial(help, "User Groups", "help.html");

["Connected Accounts", "Connect Tool", "Import Pack", "User Groups"].forEach(function (bit) {
  if (studio.includes(bit) || studioJs.includes(bit) || studioPack.includes(bit)) throw new Error("invented people chrome on studio: " + bit);
});


const overlayInvite = (function () {
  const start = overlay.indexOf("async function inviteWorld");
  if (start < 0) return "";
  const end = overlay.indexOf("function parseTalk", start);
  return overlay.slice(start, end > start ? end : start + 900);
})();
if (!overlayInvite) throw new Error("people-world.js missing inviteWorld");
if (overlayInvite.indexOf("accept-invite") >= 0 || overlayInvite.indexOf("charged: true") >= 0) {
  throw new Error("invite must not accept or charge without a person tapping Accept");
}
if (overlay.indexOf('data-accept') < 0 || overlay.indexOf(">Accept<") < 0) throw new Error("People must paint Accept on an invite");
if (overlay.indexOf("Waiting on Accept") < 0 && people.indexOf("They Accept on their People tab") < 0) {
  throw new Error("People must say an invite waits on Accept");
}
if (people.indexOf("AIA does not send") < 0 && overlay.indexOf("AIA does not send") < 0) {
  throw new Error("People must say AIA does not send invite mail");
}
if (overlay.indexOf("Nobody sends money from here") < 0) throw new Error("People invite line must say nobody sends money");

function unique(rows) {
  const out = [];
  rows.forEach(function (row) { if (out.indexOf(row) < 0) out.push(row); });
  return out;
}
function inviteFnOf(src) {
  const start = src.indexOf("async function inviteWorld");
  if (start < 0) return "";
  const end = src.indexOf("function parseTalk", start);
  return src.slice(start, end > start ? end : start + 900);
}
function worldFaults(loader, pack, html, overlaySrc, helpSrc, peopleSrc) {
  const bad = [];
  const hasLoader = loader.indexOf('fetch("/developer.z64.txt"') >= 0 && loader.indexOf('DecompressionStream("gzip")') >= 0;
  if (!hasLoader || !pack || pack.indexOf("Onboard this desk.") < 0 || pack.indexOf("/help#onboard-desk") < 0) {
    bad.push("Studio onboard gone");
  }
  const inv = inviteFnOf(overlaySrc);
  if (!inv || inv.indexOf("accept-invite") >= 0 || overlaySrc.indexOf('data-accept') < 0 || overlaySrc.indexOf(">Accept<") < 0) {
    bad.push("Invite without Accept");
  }
  if (peopleSrc.indexOf("AIA does not send") < 0 && overlaySrc.indexOf("AIA does not send") < 0 && html.indexOf("AIA does not send invite mail") < 0 && pack.indexOf("AIA does not send invite mail") < 0 && helpSrc.indexOf("AIA does not send invite mail") < 0) {
    bad.push("silent invite mail");
  }
  if (/aiastudios\.app|Team & Permissions|Workspace Settings/.test(pack + html) || /Connected Accounts|Connect Tool|Import Pack|User Groups/.test(pack + html)) {
    bad.push("invented people chrome on studio");
  }
  if (/charged:\s*true/.test(inv) || /charged:\s*true/.test(overlaySrc) || /charged:\s*true/.test(pack)) {
    bad.push("charge or bind without Yes");
  }
  return unique(bad);
}
function applyMutant(kind, files) {
  const next = {
    loader: files.loader,
    pack: files.pack,
    html: files.html,
    overlaySrc: files.overlaySrc,
    helpSrc: files.helpSrc,
    peopleSrc: files.peopleSrc
  };
  if (kind === "Studio onboard gone") {
    next.pack = next.pack.replace(/Onboard this desk\./g, "Skip ahead.").replace(/\/help#onboard-desk/g, "/help#skip");
  } else if (kind === "Invite without Accept") {
    next.overlaySrc = next.overlaySrc
      .replace(/action: "invite-world"/g, 'action: "invite-world", also: "accept-invite"')
      .replace(/data-accept/g, "data-ok")
      .replace(/>Accept</g, ">Join now<")
      .replace("async function inviteWorld", 'async function inviteWorld(){ await admin({ action: "accept-invite" }); }\nasync function inviteWorldOld');
  } else if (kind === "silent invite mail") {
    next.peopleSrc = next.peopleSrc.replace(/AIA does not send/g, "AIA emails them for you");
    next.overlaySrc = next.overlaySrc.replace(/AIA does not send/g, "AIA emails them for you");
    next.html = next.html.replace(/AIA does not send invite mail/g, "AIA emails the invite");
    next.pack = next.pack.replace(/AIA does not send invite mail/g, "AIA emails the invite");
    next.helpSrc = next.helpSrc.replace(/AIA does not send invite mail/g, "AIA emails the invite");
  } else if (kind === "invented people chrome on studio") {
    next.pack = next.pack + "\nTeam & Permissions\nWorkspace Settings";
    next.html = next.html + "\nConnected Accounts";
  } else if (kind === "charge or bind without Yes") {
    next.overlaySrc = next.overlaySrc.replace("action: \"invite-world\"", "action: \"invite-world\", charged: true");
    next.pack = next.pack + "\ncharged: true";
  }
  return next;
}

let failed = 0;
function fail(msg) { failed += 1; console.error("FAIL " + msg); }
function pass(msg) { console.log("ok  " + msg); }

const files = { loader: studioJs, pack: studioPack, html: studio, overlaySrc: overlay, helpSrc: help, peopleSrc: people };
const live = worldFaults(files.loader, files.pack, files.html, files.overlaySrc, files.helpSrc, files.peopleSrc);
if (live.length) fail("world people behaviour drifted: " + live.join("; "));
else pass("Studio onboard, invite Accept, and no silent mail still hold");

const mutants = [
  "Studio onboard gone",
  "Invite without Accept",
  "silent invite mail",
  "invented people chrome on studio",
  "charge or bind without Yes"
];
let caught = 0;
mutants.forEach(function (kind) {
  const next = applyMutant(kind, files);
  const faults = worldFaults(next.loader, next.pack, next.html, next.overlaySrc, next.helpSrc, next.peopleSrc);
  if (faults.indexOf(kind) < 0) fail("mutant missed: " + kind + " (got " + JSON.stringify(faults) + ")");
  else { caught += 1; pass("mutant caught: " + kind); }
});
if (caught !== mutants.length) fail("mutants: " + caught + "/" + mutants.length + " caught");
else pass("mutants: " + caught + "/" + mutants.length + " caught");
if (failed) {
  console.error("check-world-people failed");
  process.exit(1);
}

console.log("check-world-people: ok");
