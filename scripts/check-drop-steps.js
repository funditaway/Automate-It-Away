#!/usr/bin/env node
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

function fail(msg) {
  console.error("check-drop-steps: " + msg);
  process.exit(1);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const steps = read("drop-steps.js");
const syntax = spawnSync(process.execPath, ["--check", path.join(ROOT, "drop-steps.js")], { encoding: "utf8" });
if (syntax.status !== 0) {
  fail("drop-steps.js must parse: " + (syntax.stderr || syntax.stdout || "syntax error").trim());
}

const tableAt = steps.indexOf("var STEPS = [");
if (tableAt < 0) fail("drop-steps.js must name the Drop steps in one table");
const tableEnd = steps.indexOf("\n  ];", tableAt);
if (tableEnd < 0) fail("drop-steps.js STEPS table must close");
const box = {};
vm.runInNewContext(steps.slice(tableAt, tableEnd + 4) + "\nthis.STEPS = STEPS;", box);
const table = box.STEPS;

const want = ["desk", "tell", "card", "check", "share"];
const got = table.map((s) => s.id);
if (got.join(",") !== want.join(",")) {
  fail("Drop steps must run " + want.join(" → ") + ", got " + got.join(" → "));
}
if (got[0] !== "desk") fail("desk must be the first Drop step");
if (table[0].ids.indexOf("desk-pick") < 0) fail("step one must own #desk-pick");
if (table[0].ids.indexOf("public-desk-search") < 0) fail("step one must own the world desk search");
if (table[2].ids.indexOf("drop-form-card") < 0) fail("the Card step must own #drop-form-card");
if (table[2].ids.indexOf("modes") < 0) fail("the Card step must own #modes");
if ((table[2].also || []).indexOf("drop-sub") < 0) {
  fail("the Drop anything line must ride the Card step it describes, not crowd step one");
}
if ((table[0].also || []).indexOf("drop-sub") >= 0) {
  fail("step one must stay short — the Drop anything line belongs on the Card step");
}
if (table[4].ids.indexOf("embed-card") < 0) fail("the Share step must own #embed-card");
table.forEach(function (step) {
  if (!step.label) fail("step " + step.id + " needs a tab label");
  if (!step.hint) fail("step " + step.id + " needs a one-line hint");
  if (step.hint.length > 90) fail("step " + step.id + " hint must stay one short line");
});

const seats = {};
table.forEach(function (step) {
  step.ids.concat(step.also || []).forEach(function (id) {
    if (seats[id]) fail("#" + id + " sits on two Drop steps: " + seats[id] + " and " + step.id);
    seats[id] = step.id;
  });
});

if ((table[0].off || []).indexOf("drop-on") < 0) {
  fail("the Desk step must hush #drop-on — the desk card already says where the drop lands");
}
table.forEach(function (step) {
  (step.off || []).forEach(function (id) {
    if (seats[id]) fail("#" + id + " cannot be both seated on and hushed by a Drop step");
  });
});

if (steps.indexOf(".step-off{display:none!important}") < 0) {
  fail("drop-steps.js must hide the off-step cards with .step-off");
}
if (steps.indexOf("body.drop-steps .grid{grid-template-columns:1fr}") < 0) {
  fail("drop-steps.js must stack the Drop grid so one step is one column");
}
if (steps.indexOf("#drop-steps{position:sticky") < 0) fail("the step rail must stay on screen");
if (steps.indexOf("#drop-step-foot{position:sticky") < 0) fail("Back / Next must stay on screen");
if (steps.indexOf("@media(min-width:860px){#drop-step-foot{bottom:0}}") < 0) {
  fail("Back / Next must drop to the floor where desk-nav.css hides the phone bar");
}
if (steps.indexOf("min-height:44px") < 0 || steps.indexOf("min-height:48px") < 0) {
  fail("step taps must stay thumb sized");
}
if (steps.indexOf("#drop-step-tabs button{flex:1 1 auto;min-height:44px;min-width:0") < 0) {
  fail("the five step pills must share one phone row instead of clipping the last one");
}
if (steps.indexOf("body.drop-steps #public-desk-hits{max-height:184px;overflow:auto}") < 0) {
  fail("the world desk list must stay capped so step one does not grow past a phone screen");
}
if (steps.indexOf("You still tap Yes or Stop") < 0) fail("the step rail vow must keep Yes or Stop");
if (steps.indexOf("Nobody sends money from here") < 0) fail("the step rail vow must keep no money");
if (steps.indexOf("Draft only") < 0) fail("the step rail vow must say Draft only");
if (steps.indexOf("aia_drop_step") < 0) fail("drop-steps.js must remember the step across a desk pick");
if (steps.indexOf("MutationObserver") < 0) fail("drop-steps.js must seat cards that load after boot");
if (steps.indexOf("if (!onDrop() || embedOn()) return") < 0) {
  fail("drop-steps.js must stay off embed and off pages that are not Drop");
}
if (steps.indexOf("reveal") < 0) fail("drop-steps.js must expose reveal() so a hidden note is not lost");
if (/\b(back|next)\.hidden\s*=/.test(steps)) {
  fail("Back / Next must hide with .step-off — a global button display rule beats the hidden attribute");
}
if (steps.indexOf('back.classList.toggle("step-off"') < 0 || steps.indexOf('next.classList.toggle("step-off"') < 0) {
  fail("Back / Next must hide with .step-off at the ends of the rail");
}

function runEmbed(opts) {
  const sandbox = {
    document: { body: { classList: { contains: function (c) { return !!opts.embed && c === "embed"; } } } },
    location: { search: opts.search || "" }
  };
  sandbox.window = sandbox;
  sandbox.parent = opts.iframe ? {} : sandbox;
  const start = steps.indexOf("function embedOn");
  const end = steps.indexOf("function stepOf");
  vm.runInNewContext(steps.slice(start, end) + "\nthis.embedOn = embedOn;", sandbox);
  return !!sandbox.embedOn();
}
if (!runEmbed({ embed: true })) fail("body.embed must skip the step rail");
if (!runEmbed({ iframe: true })) fail("an iframe Drop must skip the step rail");
if (!runEmbed({ search: "?ws=springfield-shop&embed=1" })) fail("?embed=1 must skip the step rail");
if (runEmbed({ search: "?ws=springfield-shop" })) fail("/drop must still paint the step rail");

["drop.html", "widget.html"].forEach(function (file) {
  const src = read(file);
  const pick = src.indexOf('id="desk-pick"');
  const modes = src.indexOf('id="modes"');
  const form = src.indexOf('id="drop-form-card"');
  if (pick < 0) fail(file + " missing #desk-pick");
  if (modes < 0) fail(file + " missing #modes");
  if (form < 0) fail(file + " form card needs id drop-form-card so a step can seat it");
  if (pick > modes) fail(file + " must ask which desk gets this before the drop modes");
  if (pick > form) fail(file + " must ask which desk gets this before the drop form");
  if (src.indexOf('<script src="drop-steps.js"></script>') < 0) {
    fail(file + " must load drop-steps.js");
  }
  const noteAt = src.indexOf("function showNote");
  const note = src.slice(noteAt, src.indexOf("function paintDeskOn", noteAt));
  if (note.indexOf("AIADropSteps.reveal") < 0) {
    fail(file + " showNote must reveal the step that holds the note");
  }
});

const pickSrc = read("drop-pick.js");
const injectAt = pickSrc.indexOf("function injectSearch");
const inject = pickSrc.slice(injectAt, pickSrc.indexOf("function paint(", injectAt));
if (inject.indexOf('document.getElementById("desk-pick") || banner') < 0) {
  fail("drop-pick.js must seat the world desk search under Which desk gets this");
}
const goAt = pickSrc.indexOf("function goDrop");
const go = pickSrc.slice(goAt, goAt + 320);
if (go.indexOf("aia_drop_step") < 0 || go.indexOf('"tell"') < 0) {
  fail("drop-pick.js goDrop must move the picker to the next step after a desk is picked");
}

const preview = read("drop-preview.js");
if (preview.indexOf("AIADropSteps.go") < 0) {
  fail("drop-preview.js This drop cells must jump to the step that holds the field");
}

const dropMd = read("DROP.md");
const yesNo = read("ACCOUNT-YES-NO.md");
const packMd = read("PACK.md");
if (dropMd.indexOf("drop-steps.js") < 0) fail("DROP.md must name drop-steps.js");
if (dropMd.indexOf("Desk · Tell · Card · Check · Share") < 0) {
  fail("DROP.md must name the five Drop steps in order");
}
if (yesNo.indexOf("Drop desk-first steps leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop desk-first steps leftover");
}
if (packMd.indexOf("Drop desk-first steps leftover:") < 0) {
  fail("PACK.md must name Drop desk-first steps leftover");
}

console.log("check-drop-steps: ok");
