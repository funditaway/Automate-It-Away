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
const talk = read("support-talk.js");
const speech = read("speech.js");
const yesNo = read("ACCOUNT-YES-NO.md");

must(help, 'id="queue-runs"', "help.html queue-runs card");
must(help, "How the queue runs", "help.html queue-runs title");
must(help, "Pipes → Rules When · If · Then", "help.html pipes to rules");
must(help, "Yes / Stop / Kill", "help.html Yes/Stop/Kill");
must(help, "Needs you", "help.html Needs you");
must(help, "Talk to AIA", "help.html Talk to AIA");
must(help, "does not codegen, deploy, or auto-patch GitHub", "help.html no codegen");
must(help, "Collect stays HOLD", "help.html Collect HOLD");

must(help, "What plan tiers exist?", "help.html plan tiers FAQ");
must(help, "No public Free / Pro / Team / Enterprise SKUs", "help.html no public SKUs");
must(help, "credit pricing yet", "help.html no credit pricing");
must(help, "One desk account", "help.html one desk account");
must(help, "If I Create or Drop a goal, what happens?", "help.html create/drop FAQ");
must(help, "Create or Drop a goal → a draft card → you tap Yes", "help.html goal path");
must(help, "No autonomous ETA engine", "help.html no ETA engine");
must(help, "No SaaS codegen", "help.html no SaaS codegen");

must(studio, "How the queue runs.", "studio queue-runs one-liner");
must(studio, "/help#queue-runs", "studio queue-runs link");
must(studio, "No public Free / Pro / Team / Enterprise SKUs", "studio no public SKUs");
must(studio, "No autonomous ETA engine", "studio no ETA");
must(studioJs, "How the queue runs.", "studio js queue-runs one-liner");
must(studioJs, "/help#queue-runs", "studio js queue-runs link");
must(more, "/help#queue-runs", "more.html queue-runs link");

must(speech, "function listen(onResult, onErr)", "speech.js listen(fn, fn)");
if (/AIASpeech\.listen\(\s*\{/.test(talk)) throw new Error("support-talk must not pass an object to listen");
must(talk, "AIASpeech.listen(function", "support-talk listen result fn");
must(talk, "Did not catch that", "support-talk listen error fn");

const intake = read("api/intake.js");
must(intake, "You tap Yes or Stop.", "Talk intake Yes or Stop");
must(intake, "You still tap Yes or Stop.", "Talk start Yes or Stop");
must(intake, "Human before Yes.", "Talk card Human before Yes");
must(intake, "Open the desk to Yes or Stop.", "Talk setup Yes or Stop");
must(intake, "Talk to AIA and we will look at it.", "Talk hold points at Talk to AIA");
["You tap Send or Stop", "to Send or Stop", "You tap Yes or No.", "You still tap Yes or No.", "Human before send.", "press No.", "Send a request and we will look at it."].forEach(function (bit) {
  if (intake.includes(bit)) throw new Error("Talk intake painted a leftover rail: " + bit);
});

const handoffUi = read("desk-handoff.js");
must(handoffUi, "A person taps Yes.", "Queue handoff taps Yes");
if (handoffUi.includes("A person taps Send.")) throw new Error("Queue handoff painted Send as the HITL rail");

const auth = read("api/auth.js");
must(auth, "Human before Yes.", "onboard first card Human before Yes");
if (auth.includes("Human before send.")) throw new Error("onboard first card still said Human before send");

must(yesNo, "How the queue runs", "ACCOUNT-YES-NO queue-runs");
must(yesNo, "How lead / Talk / public Drop leftover", "ACCOUNT-YES-NO names How Yes-or-No leftover");

const queue = help.slice(help.indexOf('id="queue-runs"'), help.indexOf("Something broke?"));
if (/\$47|\$197|\$50|Router Node|MoR chargeback|Connected Accounts/i.test(queue)) {
  throw new Error("queue-runs invented blocked fiction");
}

["Login Kit", "BUYER_ENVIRONMENT_BINDINGS", "aiastudios.app"].forEach(function (bit) {
  if (help.includes(bit) || studio.includes(bit) || studioJs.includes(bit)) {
    throw new Error("invented fiction on public Help/Studio: " + bit);
  }
});

console.log("check-queue-help: ok");
