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

console.log("check-world-people: ok");
