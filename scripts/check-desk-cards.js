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
must(studioJs, "Desk cards.", "studio js desk-cards one-liner");
must(studioJs, "/help#desk-cards", "studio js desk-cards link");
must(more, "/help#desk-cards", "more.html desk-cards link");

must(preview, 'get("ws")', "drop-preview reads ?ws=");
must(preview, "function queryWs", "drop-preview queryWs");
must(drop, "window.ws = ws", "drop.html shares ws with preview");

must(yesNo, "Desk cards", "ACCOUNT-YES-NO desk-cards");

["render_desk_card", "interactive_review", "code_diff", "token badge"].forEach(function (bit) {
  if (help.includes(bit) || studio.includes(bit) || studioJs.includes(bit)) {
    throw new Error("invented desk-card product name: " + bit);
  }
});

const card = help.slice(help.indexOf('id="desk-cards"'), help.indexOf("Something broke?"));
if (/\$47|\$197|MoR|Router Node|Connected Accounts/i.test(card)) {
  throw new Error("desk-cards invented blocked fiction");
}

console.log("check-desk-cards: ok");
