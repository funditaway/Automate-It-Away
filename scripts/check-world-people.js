#!/usr/bin/env node
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
must(help, 'id="onboard-desk"', "help.html onboard-desk card");
must(help, "Onboard this desk", "help.html onboard title");
must(help, "www.automateitaway.com/api/hook", "help.html inbound hook");
must(help, "Zapier or Make", "help.html Zapier/Make today");
must(help, "Search a site / Log in", "help.html vendor console");
must(help, "draft only", "help.html login is draft");
must(help, "Calendar, SMS, Square, and eBay stay HOLD", "help.html hold pipes");
must(help, "desk name plus a desk code", "help.html desk identity");
must(help, "james.aia", "help.html james.aia-style name");
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
must(studioJs, "Onboard this desk.", "studio js onboard one-liner");
must(studioJs, "/help#onboard-desk", "studio js onboard link");

must(more, "/help#onboard-desk", "more.html onboard link");

["aiastudios.app", "Team & Permissions", "Workspace Settings"].forEach(function (bit) {
  if (help.includes(bit) || studio.includes(bit) || studioJs.includes(bit)) {
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
  if (studio.includes(bit) || studioJs.includes(bit)) throw new Error("invented people chrome on studio: " + bit);
});

console.log("check-world-people: ok");
