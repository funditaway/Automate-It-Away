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

if ((table[0].off || []).indexOf("drop-on") >= 0) {
  fail("the Desk step must paint #drop-on — This drop goes to / Change desk is initial chrome on /drop");
}
table.forEach(function (step) {
  if ((step.off || []).indexOf("drop-on") >= 0) {
    fail("step " + step.id + " must not hush #drop-on on /drop");
  }
});
if (steps.indexOf('keep.classList.remove("step-off")') < 0) {
  fail("paint() must keep #drop-on visible on /drop — not display:none at step one");
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
if (steps.indexOf("if (!onDrop() || embedOn() || widgetOn()) return") < 0) {
  fail("drop-steps.js must stay off /widget, off embed, and off pages that are not Drop");
}
if (steps.indexOf("function widgetOn") < 0) fail("drop-steps.js must detect the /widget path");
if (steps.indexOf("function slimChrome") < 0) fail("drop-steps.js must slim the step rail on /widget");
if (steps.indexOf("function hush") < 0 || steps.indexOf("if (slimChrome()) hush()") < 0) {
  fail("drop-steps.js must hush #drop-steps on /widget");
}
if (steps.indexOf('contains("widget")') < 0) {
  fail("widgetOn must honor body.widget so the /widget skip does not depend on pathname");
}
if (steps.indexOf("reveal") < 0) fail("drop-steps.js must expose reveal() so a hidden note is not lost");
if (/\b(back|next)\.hidden\s*=/.test(steps)) {
  fail("Back / Next must hide with .step-off — a global button display rule beats the hidden attribute");
}
if (steps.indexOf('back.classList.toggle("step-off"') < 0 || steps.indexOf('next.classList.toggle("step-off"') < 0) {
  fail("Back / Next must hide with .step-off at the ends of the rail");
}

function runSkip(opts) {
  const sandbox = {
    document: {
      documentElement: { classList: { contains: function (c) { return !!opts.htmlWidget && c === "widget"; } } },
      body: { classList: { contains: function (c) {
        if (c === "embed") return !!opts.embed;
        if (c === "widget") return !!opts.widget;
        return false;
      } } }
    },
    location: { search: opts.search || "", pathname: opts.path || "/drop", href: opts.href || "" }
  };
  sandbox.window = sandbox;
  sandbox.parent = opts.iframe ? {} : sandbox;
  const start = steps.indexOf("function embedOn");
  const end = steps.indexOf("function stepOf");
  vm.runInNewContext(steps.slice(start, end) + "\nthis.embedOn = embedOn;\nthis.widgetOn = widgetOn;\nthis.slimChrome = slimChrome;", sandbox);
  return !!(sandbox.embedOn() || sandbox.widgetOn());
}
if (!runSkip({ embed: true })) fail("body.embed must skip the step rail");
if (!runSkip({ iframe: true })) fail("an iframe Drop must skip the step rail");
if (!runSkip({ search: "?ws=springfield-shop&embed=1" })) fail("?embed=1 must skip the step rail");
if (!runSkip({ path: "/widget" })) fail("/widget must skip the step rail");
if (!runSkip({ path: "/widget.html" })) fail("/widget.html must skip the step rail");
if (!runSkip({ path: "/widget/" })) fail("/widget/ must skip the step rail");
if (!runSkip({ widget: true, path: "/drop.html" })) fail("body.widget must skip the step rail even when pathname is drop.html");
if (!runSkip({ htmlWidget: true, path: "/drop.html" })) fail("html.widget must skip the step rail even when pathname is drop.html");
if (!runSkip({ href: "https://www.automateitaway.com/widget?ws=springfield-shop", path: "/drop.html" })) {
  fail("location.href /widget must skip the step rail even when pathname is drop.html");
}
if (runSkip({ search: "?ws=springfield-shop" })) fail("/drop must still paint the step rail");
if (runSkip({ path: "/drop" })) fail("/drop must still paint the step rail");
if (runSkip({ path: "/drop.html" })) fail("/drop.html must still paint the step rail");

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
  if (src.indexOf('<script src="drop-steps.js"></script>') >= 0) {
    fail(file + " must not load drop-steps.js unconditionally — /widget never paints #drop-steps");
  }
  if (src.indexOf("function skipSteps") < 0 || src.indexOf("if (skipSteps()) return") < 0) {
    fail(file + " must skip loading drop-steps.js on /widget");
  }
  if (src.indexOf('s.src = "drop-steps.js"') < 0) {
    fail(file + " must still load drop-steps.js on /drop");
  }
  const noteAt = src.indexOf("function showNote");
  const note = src.slice(noteAt, src.indexOf("function paintDeskOn", noteAt));
  if (note.indexOf("AIADropSteps.reveal") < 0) {
    fail(file + " showNote must reveal the step that holds the note");
  }
});
const widgetHtml = read("widget.html");
const dropHtml = read("drop.html");
if (!/<body[^>]*\bwidget\b/.test(widgetHtml)) {
  fail("widget.html must mark body.widget so #drop-steps stays 0 even if pathname is drop.html");
}
if (/<body[^>]*\bwidget\b/.test(dropHtml)) {
  fail("drop.html must not mark body.widget — /drop still paints the step rail");
}

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
if (dropMd.indexOf("`/widget`, embed, and `?embed=1` skip the rail") < 0) {
  fail("DROP.md must say /widget skips the step rail");
}
if (dropMd.indexOf("body.widget") < 0) {
  fail("DROP.md must say widget.html marks body.widget");
}
if (dropMd.indexOf("skipSteps()") < 0) {
  fail("DROP.md must say /widget does not load drop-steps.js");
}
if (dropMd.indexOf("tears down `#drop-steps`") < 0) {
  fail("DROP.md must say slimChrome tears down #drop-steps on /widget");
}
if (dropMd.indexOf("`/drop` still paints Desk · Tell · Card · Check · Share") < 0) {
  fail("DROP.md must keep the step rail on /drop");
}
if (yesNo.indexOf("Drop desk-first steps leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop desk-first steps leftover");
}
if (packMd.indexOf("Drop desk-first steps leftover:") < 0) {
  fail("PACK.md must name Drop desk-first steps leftover");
}
if (yesNo.indexOf("Drop widget steps rail leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget steps rail leftover");
}
if (packMd.indexOf("Drop widget steps rail leftover:") < 0) {
  fail("PACK.md must name Drop widget steps rail leftover");
}
if (yesNo.indexOf("Drop widget Drop-tab rail leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget Drop-tab rail leftover");
}
if (packMd.indexOf("Drop widget Drop-tab rail leftover:") < 0) {
  fail("PACK.md must name Drop widget Drop-tab rail leftover");
}
if (yesNo.indexOf("Drop widget `#drop-on` leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget #drop-on leftover");
}
if (packMd.indexOf("Drop widget `#drop-on` leftover:") < 0) {
  fail("PACK.md must name Drop widget #drop-on leftover");
}
if (dropMd.indexOf("skip the `#drop-on` banner") < 0) {
  fail("DROP.md must say /widget skips #drop-on");
}
if (dropMd.indexOf("paints the `#drop-on` banner") < 0) {
  fail("DROP.md must say /drop paints #drop-on at step one");
}
if (dropMd.indexOf("still paints `#drop-on` at step one") < 0) {
  fail("DROP.md must keep #drop-on painted at /drop step one");
}
if (dropMd.indexOf("it hushes the `#drop-on` banner") >= 0) {
  fail("DROP.md must not say step one hushes #drop-on");
}
if (yesNo.indexOf("Drop `#drop-on` keep leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop #drop-on keep leftover");
}
if (packMd.indexOf("Drop `#drop-on` keep leftover:") < 0) {
  fail("PACK.md must name Drop #drop-on keep leftover");
}
if (yesNo.indexOf("Drop widget standalone steps rail leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget standalone steps rail leftover");
}
if (packMd.indexOf("Drop widget standalone steps rail leftover:") < 0) {
  fail("PACK.md must name Drop widget standalone steps rail leftover");
}
if (dropMd.indexOf("widgetHref") < 0 || dropMd.indexOf("Drop tab") < 0) {
  fail("DROP.md must say the Drop tab widgetHref points at /widget");
}
const switchSrc = read("desk-switch.js");
const hrefAt = switchSrc.indexOf("function widgetHref");
const hrefFn = switchSrc.slice(hrefAt, switchSrc.indexOf("function captureDesk"));
if (hrefFn.indexOf('return "/widget"') < 0 || hrefFn.indexOf('"/widget?ws="') < 0) {
  fail("widgetHref must point the Drop tab at /widget, not /drop");
}
if (hrefFn.indexOf('"/drop?ws="') >= 0 || hrefFn.indexOf('return "/drop"') >= 0) {
  fail("widgetHref must not send the Drop tab to /drop");
}
const navSrc = read("desk-nav.js");
const dropHrefAt = navSrc.indexOf("function dropHref");
const dropHrefFn = navSrc.slice(dropHrefAt, navSrc.indexOf("function tabOf"));
if (dropHrefFn.indexOf('return "/widget"') < 0 || dropHrefFn.indexOf('"/widget?ws="') < 0) {
  fail("desk-nav.js dropHref fallback must be /widget so #drop-steps skips");
}
if (dropHrefFn.indexOf('"/drop?ws="') >= 0 || dropHrefFn.indexOf('return "/drop"') >= 0) {
  fail("desk-nav.js dropHref must not fall back to /drop");
}
if (yesNo.indexOf("Drop widget pick href leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget pick href leftover");
}
if (packMd.indexOf("Drop widget pick href leftover:") < 0) {
  fail("PACK.md must name Drop widget pick href leftover");
}
if (dropMd.indexOf("stays on `/widget?ws=`") < 0) {
  fail("DROP.md must say /widget world pick stays on /widget?ws=");
}
if (dropMd.indexOf("does not dump onto Desk · Tell · Card · Check · Share") < 0) {
  fail("DROP.md must say /widget pick does not dump onto the step rail");
}
if (pickSrc.indexOf("function widgetOn") < 0) fail("drop-pick.js must detect the /widget path");
if (pickSrc.indexOf("function dropHref") < 0) fail("drop-pick.js must pick /widget vs /drop");
if (pickSrc.indexOf("location.href = dropHref(use)") < 0) {
  fail("drop-pick.js goDrop must use dropHref so /widget stays on /widget");
}
if (pickSrc.indexOf('location.href = use ? ("/drop?ws="') >= 0) {
  fail("drop-pick.js goDrop must not always dump to /drop");
}
function runPickHref(opts) {
  const sandbox = {
    location: { pathname: opts.path || "/drop" },
    window: {},
    AIADesks: {
      slugify: function (s) {
        return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      },
      widgetHref: function (slug) {
        var use = sandbox.AIADesks.slugify(slug);
        if (!use) return "/widget";
        return "/widget?ws=" + encodeURIComponent(use);
      }
    }
  };
  sandbox.window = sandbox;
  sandbox.window.AIADesks = sandbox.AIADesks;
  const start = pickSrc.indexOf("function slugify");
  const end = pickSrc.indexOf("function paintSearch");
  vm.runInNewContext(pickSrc.slice(start, end) + "\nthis.dropHref = dropHref;", sandbox);
  return sandbox.dropHref(opts.slug);
}
if (runPickHref({ path: "/widget", slug: "springfield-shop" }) !== "/widget?ws=springfield-shop") {
  fail("/widget world pick must stay on /widget?ws=");
}
if (runPickHref({ path: "/widget.html", slug: "springfield-shop" }) !== "/widget?ws=springfield-shop") {
  fail("/widget.html world pick must stay on /widget?ws=");
}
if (runPickHref({ path: "/widget/", slug: "springfield-shop" }) !== "/widget?ws=springfield-shop") {
  fail("/widget/ world pick must stay on /widget?ws=");
}
if (runPickHref({ path: "/drop", slug: "springfield-shop" }) !== "/drop?ws=springfield-shop") {
  fail("/drop world pick must still open /drop?ws=");
}
if (runPickHref({ path: "/drop.html", slug: "springfield-shop" }) !== "/drop?ws=springfield-shop") {
  fail("/drop.html world pick must still open /drop?ws=");
}
if (runPickHref({ path: "/widget", slug: "" }) !== "/widget") {
  fail("empty /widget pick must stay on /widget");
}
if (runPickHref({ path: "/drop", slug: "" }) !== "/drop") {
  fail("empty /drop pick must stay on /drop");
}
const nowSrc = read("drop-now.js");
if (nowSrc.indexOf("function dropHref") < 0) fail("drop-now.js must pick /widget vs /drop for recent desks");
if (nowSrc.indexOf("location.href = dropHref(") < 0) {
  fail("drop-now.js recent public desks must use dropHref");
}
if (nowSrc.indexOf('location.href = "/drop?ws="') >= 0) {
  fail("drop-now.js recent public desks must not always dump to /drop");
}

if (yesNo.indexOf("Drop widget standalone Talk bar leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget standalone Talk bar leftover");
}
if (packMd.indexOf("Drop widget standalone Talk bar leftover:") < 0) {
  fail("PACK.md must name Drop widget standalone Talk bar leftover");
}
if (dropMd.indexOf("`/widget`, embed, and `?embed=1` skip the Talk bar") < 0) {
  fail("DROP.md must say /widget skips the Talk bar");
}
if (dropMd.indexOf("`/drop` still paints Talk") < 0) {
  fail("DROP.md must keep Talk on /drop");
}
if (nowSrc.indexOf("talkBar") < 0 || nowSrc.indexOf("talk.hidden = true") < 0) {
  fail("drop-now.js slimChrome must keep #talkBar hidden on /widget");
}
if (nowSrc.indexOf("embed-card") < 0) {
  fail("drop-now.js slimChrome must tear down #embed-card on /widget");
}
["drop.html", "widget.html"].forEach(function (file) {
  const src = read(file);
  if (src.indexOf("html.widget #embed-card") < 0 || src.indexOf("body.widget #embed-card") < 0) {
    fail(file + " must hide #embed-card on /widget");
  }
  if (src.indexOf("classList.add('widget')") < 0 && src.indexOf('classList.add("widget")') < 0) {
    fail(file + " must first-paint html.widget so /widget rewrite hides #embed-card");
  }
  if (src.indexOf('id="embed-card"') < 0) fail(file + " must still keep #embed-card markup for /drop");
  if (/body\.widget header/.test(src)) fail(file + " must not hide header on /widget");
  if (/body\.widget #modes/.test(src)) fail(file + " must not hide #modes on /widget");
});
if (yesNo.indexOf("Drop widget share leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget share leftover");
}
if (packMd.indexOf("Drop widget share leftover:") < 0) {
  fail("PACK.md must name Drop widget share leftover");
}
if (dropMd.indexOf("skip `#embed-card`") < 0) {
  fail("DROP.md must say /widget skips #embed-card");
}
if (dropMd.indexOf("still paints Drop from anywhere") < 0) {
  fail("DROP.md must keep Drop from anywhere on /drop");
}
if (dropMd.indexOf("tears down `#embed-card`") < 0) {
  fail("DROP.md must say slimChrome tears down #embed-card on /widget");
}

console.log("check-drop-steps: ok");
