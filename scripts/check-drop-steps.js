#!/usr/bin/env node
"use strict";
require("./_env-guard");

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
});
const widgetHtml = read("widget.html");
const dropHtml = read("drop.html");
const app = read("drop-app.js");
const noteAt = app.indexOf("function showNote");
const note = app.slice(noteAt, app.indexOf("function paintDeskOn", noteAt));
if (noteAt < 0 || note.indexOf("AIADropSteps.reveal") < 0) {
  fail("drop-app.js showNote must reveal the step that holds the note");
}
if (dropHtml.indexOf('src="/drop-app.js"') < 0 || widgetHtml.indexOf('src="/drop-app.js"') < 0) {
  fail("drop.html and widget.html must load drop-app.js so a note can reveal its step");
}
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
const go = pickSrc.slice(goAt, goAt + 360);
if (go.indexOf("aia_drop_step") < 0 || go.indexOf('"card"') < 0) {
  fail("drop-pick.js goDrop must move the picker to Card after a desk is picked");
}
if (go.indexOf('"tell"') >= 0) {
  fail("drop-pick.js goDrop must not dump manual entry onto Tell");
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
  fail("DROP.md must name the Drop tab widgetHref");
}
if (dropMd.indexOf("point at `/drop`") < 0 && dropMd.indexOf("widgetHref` is `/drop`") < 0) {
  fail("DROP.md must say the Drop tab widgetHref points at /drop");
}
const switchSrc = read("desk-switch.js");
const hrefAt = switchSrc.indexOf("function widgetHref");
const hrefFn = switchSrc.slice(hrefAt, switchSrc.indexOf("function captureDesk"));
if (hrefFn.indexOf('return "/drop"') < 0 || hrefFn.indexOf('"/drop?ws="') < 0) {
  fail("widgetHref must point the Drop tab at /drop, not /widget");
}
if (hrefFn.indexOf('"/widget?ws="') >= 0 || hrefFn.indexOf('return "/widget"') >= 0) {
  fail("widgetHref must not send the Drop tab to /widget");
}
const navSrc = read("desk-nav.js");
const dropHrefAt = navSrc.indexOf("function dropHref");
const dropHrefFn = navSrc.slice(dropHrefAt, navSrc.indexOf("function tabOf"));
if (dropHrefFn.indexOf('return "/drop"') < 0 || dropHrefFn.indexOf('"/drop?ws="') < 0) {
  fail("desk-nav.js dropHref fallback must be /drop so the Drop tab paints the rail");
}
if (dropHrefFn.indexOf('"/widget?ws="') >= 0 || dropHrefFn.indexOf('return "/widget"') >= 0) {
  fail("desk-nav.js dropHref must not fall back to /widget");
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
if (pickSrc.indexOf("AIADesks.widgetHref") >= 0) {
  fail("drop-pick.js must not use widgetHref — Drop tab /drop must not dump /widget pick onto the rail");
}
function runPickHref(opts) {
  const sandbox = {
    location: { pathname: opts.path || "/drop", href: opts.href || "" },
    window: {},
    AIADesks: {
      slugify: function (s) {
        return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      },
      widgetHref: function (slug) {
        var use = sandbox.AIADesks.slugify(slug);
        if (!use) return "/drop";
        return "/drop?ws=" + encodeURIComponent(use);
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
if (nowSrc.indexOf("AIADesks.widgetHref") >= 0) {
  fail("drop-now.js must not use widgetHref — Drop tab /drop must not dump /widget recent desks onto the rail");
}
function runNowHref(opts) {
  const sandbox = {
    location: { pathname: opts.path || "/drop", href: opts.href || "", search: opts.search || "" },
    document: {
      documentElement: { classList: { contains: function (c) { return c === "widget" && !!opts.htmlWidget; } } },
      body: { classList: { contains: function (c) { return c === "widget" && !!opts.widget; } } }
    },
    window: {},
    AIADesks: {
      widgetHref: function (slug) {
        var use = String(slug || "").trim();
        if (!use) return "/drop";
        return "/drop?ws=" + encodeURIComponent(use);
      }
    }
  };
  sandbox.window = sandbox;
  sandbox.window.AIADesks = sandbox.AIADesks;
  const start = nowSrc.indexOf("function widgetOn");
  const end = nowSrc.indexOf("function banner");
  vm.runInNewContext(nowSrc.slice(start, end) + "\nthis.dropHref = dropHref;", sandbox);
  return sandbox.dropHref(opts.slug);
}
if (runNowHref({ path: "/widget", slug: "springfield-shop" }) !== "/widget?ws=springfield-shop") {
  fail("/widget recent desks must stay on /widget?ws= even when widgetHref is /drop");
}
if (runNowHref({ path: "/drop", slug: "springfield-shop" }) !== "/drop?ws=springfield-shop") {
  fail("/drop recent desks must still open /drop?ws=");
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
if (nowSrc.indexOf("talkBar") < 0 || nowSrc.indexOf("talk.parentNode.removeChild(talk)") < 0) {
  fail("drop-now.js slimChrome must tear down #talkBar on /widget");
}
if (yesNo.indexOf("Drop widget Talk chrome leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget Talk chrome leftover");
}
if (packMd.indexOf("Drop widget Talk chrome leftover:") < 0) {
  fail("PACK.md must name Drop widget Talk chrome leftover");
}
if (dropMd.indexOf("tears down `#talkBar`") < 0) {
  fail("DROP.md must say slimChrome tears down #talkBar");
}
if (dropMd.indexOf("Probe /widget vs /drop Talk") < 0) {
  fail("DROP.md must include Probe /widget vs /drop Talk");
}
if (dropMd.indexOf("Probe Drop tab vs /widget") < 0) {
  fail("DROP.md must include Probe Drop tab vs /widget");
}
if (yesNo.indexOf("Drop tab full Drop leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop tab full Drop leftover");
}
if (packMd.indexOf("Drop tab full Drop leftover:") < 0) {
  fail("PACK.md must name Drop tab full Drop leftover");
}

if (dropMd.indexOf("still moves the rail to Tell") >= 0 || dropMd.indexOf("moves the rail to step two") >= 0) {
  fail("DROP.md must not dump a desk pick onto Tell");
}
if (dropMd.indexOf("moves the rail to Card") < 0) {
  fail("DROP.md must say a desk pick lands on Card");
}
if (yesNo.indexOf("Drop Card manual leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop Card manual leftover");
}
if (packMd.indexOf("Drop Card manual leftover:") < 0) {
  fail("PACK.md must name Drop Card manual leftover");
}
if (table[2].hint.indexOf("Tap a kind") < 0) {
  fail("the Card step hint must tell a dropper to tap a kind");
}
if (steps.indexOf("function talkWanted") < 0) fail("drop-steps.js must keep Talk URLs on Tell");
if (steps.indexOf("function deskFromLink") < 0) fail("drop-steps.js must detect a /drop?ws= share");
if (steps.indexOf('deskFromLink() ? "card"') < 0) {
  fail("drop-steps.js must land a /drop?ws= share on Card when no step is remembered");
}
if (nowSrc.indexOf('sessionStorage.setItem("aia_drop_step", "card")') < 0) {
  fail("drop-now.js recent public desks must land on Card");
}
const moreSrc = read("drop-more.js");
if (moreSrc.indexOf('var CORE = ["task", "chore", "list", "idea", "project"]') < 0) {
  fail("drop-more.js must lead Card with task / errand / list / idea / project chips");
}
if (moreSrc.indexOf("Quick drops") >= 0) {
  fail("drop-more.js must not add a second Quick drops label over What is it");
}
["drop.html", "widget.html"].forEach(function (file) {
  const src = read(file);
  const pane = src.indexOf('id="pane-work"');
  const paneEnd = src.indexOf('id="pane-agent"', pane);
  const box = src.slice(pane, paneEnd > pane ? paneEnd : pane + 4000);
  const kindAt = box.indexOf('id="kind"');
  const titleAt = box.indexOf('id="title"');
  const noteAt = box.indexOf('id="note"');
  const whoAt = box.indexOf('id="who-chips"');
  if (kindAt < 0 || titleAt < 0 || noteAt < 0 || whoAt < 0) fail(file + " Card form is missing kind / title / need / I am");
  if (!(kindAt < titleAt && titleAt < noteAt && noteAt < whoAt)) {
    fail(file + " Card form must run kind → title → What do you need → I am");
  }
});


// ---------- Talk links open Talk (/drop?talk=1, /drop#talk, and drop.html#talk from other pages) ----------
// Runs the real drop-steps.js and drop-talk.js in a fake signed-in Drop page. drop-steps boots first (as on the
// live page), while the Talk bar is still hidden, so its first paint falls back to Desk; drop-talk then has to
// open Tell so the bar is shown and the type box gets focus. Plain /drop must still start at step 1 (Desk).
// focus() is a no-op on a node that is hidden or display:none (hidden, or step-off on it or an ancestor),
// as in a real browser, so code that focuses before it shows the step is caught.
// At 390 the step rail is sticky, so the Talk bar needs a top scroll margin of the rail height plus 8px.
// A small fake layout plays the scroll: the rail sticks at the top, Back / Next sticks 84px up from the bottom,
// the bottom nav is fixed, and the injected CSS rules (exact selectors only) decide scroll-margin-top, display
// and position. One frame after the jump the Tell box lays out and shifts the bar down (layout.shift), so a
// missing second scroll leaves the bar off the top. Landscape (844x390) must land the type box above the nav.
const talkSrc = read("drop-talk.js");
const RAIL_H = 135;
// Parse injected CSS into [selector, decls] with exact selectors: "#id" or "body.a.b #id" (a comma list is split).
function cssRules(text) {
  const out = [];
  String(text).replace(/([^{}]+)\{([^{}]*)\}/g, (m, sel, body) => {
    const decls = {};
    body.split(";").forEach((d) => { const i = d.indexOf(":"); if (i > 0) decls[d.slice(0, i).trim()] = d.slice(i + 1).replace(/!important/, "").trim(); });
    sel.split(",").forEach((one) => {
      const x = /^\s*(?:body((?:\.[\w-]+)*)\s+)?#([\w-]+)\s*$/.exec(one);
      if (x) out.push({ id: x[2], body: (x[1] || "").split(".").filter(Boolean), decls: decls });
    });
    return m;
  });
  return out;
}
function fakeDrop(opts) {
  const byId = {};
  let focused = null;
  const timers = [];
  const rafs = [];
  const L = Object.assign({ ih: 844, rail: RAIL_H, barTop: 420, barH: 108, gap: 111, typeH: 44, navH: 70, footH: 56, shift: 60 }, opts.layout || {});
  let scrollY = 0;
  let shift = 0;
  let inRaf = false;
  const scrolls = [];
  const focusCalls = [];
  const winListeners = {};
  const rootVars = {};
  const styles = [];
  const shownNode = (n) => { for (let x = n; x; x = x.parentNode) if (x.hidden || x.cls.has("step-off")) return false; return true; };
  function mk(tag, id) {
    const n = {
      tagName: String(tag).toUpperCase(), id: id || "", children: [], parentNode: null, hidden: false, text: "", value: "", _html: "", listeners: {},
      cls: new Set(),
      appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = n; n.children.push(c); reg(c); if (c.tagName === "STYLE") styles.push(c); return c; },
      insertBefore(c, ref) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = n; const i = ref ? n.children.indexOf(ref) : -1; if (i < 0) n.children.push(c); else n.children.splice(i, 0, c); reg(c); return c; },
      removeChild(c) { const i = n.children.indexOf(c); if (i >= 0) n.children.splice(i, 1); c.parentNode = null; unreg(c); return c; },
      contains(o) { for (let x = o; x; x = x.parentNode) if (x === n) return true; return false; },
      hasAttribute(k) { return k === "hidden" ? !!n.hidden : false; },
      setAttribute() {}, getAttribute() { return null; },
      addEventListener(ev, fn) { (n.listeners[ev] = n.listeners[ev] || []).push(fn); },
      // Like a browser: a hidden or display:none node does not take focus.
      focus(o) { focusCalls.push({ id: n.id, preventScroll: !!(o && o.preventScroll === true) }); if (shownNode(n) && n.parentNode) focused = n; },
      // Records each call; moves the fake scroll like a browser (block start honours scroll-margin-top).
      scrollIntoView(arg) {
        const block = arg === true || arg === undefined ? "start" : (arg && arg.block) || "start";
        scrolls.push({ id: n.id, block: block, raw: arg, raf: inRaf });
        const top = docTop(n.id), h = docH(n.id);
        if (top === null) return;
        if (block === "start") scrollY = top - marginTop(n);
        else if (block === "center") scrollY = top + h / 2 - L.ih / 2;
        else if (block === "end") scrollY = top + h - L.ih;
        scrollY = Math.max(0, scrollY);
      },
      getBoundingClientRect() { return rectOf(n); },
      closest() { return null; },
      style: { setProperty: (k, v) => { if (n.tagName === "HTML") rootVars[k] = String(v); } }
    };
    n.classList = { add: (c) => n.cls.add(c), remove: (c) => n.cls.delete(c), contains: (c) => n.cls.has(c), toggle: (c, on) => { const v = on === undefined ? !n.cls.has(c) : !!on; if (v) n.cls.add(c); else n.cls.delete(c); return v; } };
    Object.defineProperty(n, "firstChild", { get: () => n.children[0] || null });
    Object.defineProperty(n, "lastChild", { get: () => n.children[n.children.length - 1] || null });
    Object.defineProperty(n, "offsetHeight", { get: () => (n.id === "drop-steps" && shownNode(n) ? L.rail : 0) });
    Object.defineProperty(n, "nextSibling", { get: () => { if (!n.parentNode) return null; const k = n.parentNode.children; return k[k.indexOf(n) + 1] || null; } });
    Object.defineProperty(n, "textContent", { get: () => n.text + n.children.map((c) => c.textContent).join(""), set: (v) => { n.text = String(v); } });
    Object.defineProperty(n, "innerHTML", {
      get: () => n._html,
      set: (v) => {
        n._html = String(v);
        n.children.slice().forEach((c) => n.removeChild(c));
        String(v).replace(/<([a-z]+)\b[^>]*\bid="([^"]+)"[^>]*>([^<]*)/gi, (m, t, cid, txt) => { const c = mk(t, cid); c.text = txt; n.appendChild(c); return m; });
      }
    });
    return n;
  }
  function reg(n) { if (n.id) byId[n.id] = n; n.children.forEach(reg); }
  const cssText = () => styles.map((t) => t.textContent).join("\n");
  function prop(n, name) {
    // Like the cascade: higher specificity wins (each body class counts), then the later rule.
    let v = null, best = -1;
    cssRules(cssText()).forEach((r) => {
      if (r.id !== n.id || !r.body.every((c) => body.cls.has(c)) || !(name in r.decls)) return;
      const spec = r.body.length;
      if (spec >= best) { best = spec; v = r.decls[name]; }
    });
    return v;
  }
  function computed(n) {
    return {
      display: prop(n, "display") || (n.id === "desk-nav" ? "flex" : "block"),
      position: prop(n, "position") || (n.id === "desk-nav" ? "fixed" : "static")
    };
  }
  function marginTop(n) {
    const v = prop(n, "scroll-margin-top");
    if (!v) return 0;
    const flat = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (m, k, fb) => rootVars[k] || fb || "0px").replace(/calc\(|\)/g, "");
    return flat.split("+").reduce((sum, part) => sum + (parseFloat(part) || 0), 0);
  }
  function docTop(id) {
    if (id === "talkBar") return L.barTop + shift;
    if (id === "talkType") return L.barTop + shift + L.barH + L.gap;
    return null;
  }
  function docH(id) { return id === "talkBar" ? L.barH : id === "talkType" ? L.typeH : 0; }
  const box = (top, h) => ({ top: top, bottom: top + h, height: h, left: 0, right: 100, width: 100 });
  function rectOf(n) {
    if (!n.parentNode || !shownNode(n)) return box(0, 0);
    const cs = computed(n);
    if (cs.display === "none") return box(0, 0);
    if (n.id === "talkBar" || n.id === "talkType") return box(docTop(n.id) - scrollY, docH(n.id));
    if (n.id === "desk-nav") return L.navH ? box(L.ih - L.navH, L.navH) : box(0, 0);
    if (n.id === "drop-step-foot") return cs.position === "sticky" ? box(L.ih - 84 - L.footH, L.footH) : box(docTop("talkType") + L.typeH + 200 - scrollY, L.footH);
    if (n.id === "drop-steps") return cs.position === "sticky" ? box(0, L.rail) : box(-scrollY, L.rail);
    return box(0, 0);
  }
  function unreg(n) { if (n.id && byId[n.id] === n) delete byId[n.id]; n.children.forEach(unreg); }
  const html = mk("html"), head = mk("head"), body = mk("body"), main = mk("main");
  main.cls.add("wrap");
  html.appendChild(head); html.appendChild(body); body.appendChild(main);
  body.appendChild(mk("nav", "desk-nav"));
  [["h1", "drop-title"], ["p", "drop-sub"], ["div", "desk-pick"], ["p", "desk-err"], ["div", "talkBar"], ["div", "drop-ways"], ["div", "modes"], ["div", "drop-form-card"], ["div", "embed-card"]].forEach(([t, id]) => main.appendChild(mk(t, id)));
  byId.talkBar.hidden = true;
  ["talkStatus", "hearBtn", "talkBtn", "quietBtn"].forEach((id) => byId.talkBar.appendChild(mk(id === "talkStatus" ? "p" : "button", id)));
  byId["drop-form-card"].appendChild(mk("button", "drop-send"));
  ["title", "note"].forEach((id) => byId["drop-form-card"].appendChild(mk("input", id)));
  const document = {
    documentElement: html, head, body, readyState: "complete",
    getElementById: (id) => byId[id] || null,
    createElement: (t) => mk(t),
    querySelector: (sel) => (sel === "main.wrap" ? main : null),
    querySelectorAll: () => [],
    addEventListener() {}
  };
  Object.defineProperty(document, "activeElement", { get: () => focused || body });
  const store = (seed) => { const m = Object.assign({}, seed); return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; };
  const location = { pathname: "/drop", search: opts.search || "", hash: opts.hash || "", href: "http://127.0.0.1/drop" + (opts.search || "") + (opts.hash || "") };
  const win = {
    document, location, URLSearchParams, JSON, Object, Array, String, Math, RegExp,
    localStorage: store({ aia_ws: "north", aia_session: "sess-test" }), sessionStorage: store(opts.session || {}),
    setTimeout: (fn, ms) => { timers.push(fn); return timers.length; }, clearTimeout() {},
    requestAnimationFrame: (fn) => { rafs.push(fn); return rafs.length; },
    setInterval: () => 0, clearInterval() {},
    scrollTo() {},
    scrollBy: (x, y) => { scrollY = Math.max(0, scrollY + (+y || 0)); },
    getComputedStyle: (n) => computed(n),
    addEventListener: (ev, fn) => { (winListeners[ev] = winListeners[ev] || []).push(fn); },
    console
  };
  Object.defineProperty(win, "innerHeight", { get: () => L.ih });
  win.window = win; win.parent = win; win.self = win;
  vm.createContext(win);
  return {
    win, byId, rootVars,
    css: () => styles.map((t) => t.textContent).join("\n"),
    run(src, name) { vm.runInContext(src, win, { filename: name, timeout: 2000 }); },
    // Timers, then the next frame: the Tell box lays out once (the bar shifts down), then frame callbacks run.
    flush() {
      for (let i = 0; i < 5 && (timers.length || rafs.length); i++) {
        timers.splice(0).forEach((fn) => fn());
        if (!rafs.length) continue;
        shift = L.shift;
        inRaf = true;
        try { rafs.splice(0).forEach((fn) => fn()); } finally { inRaf = false; }
      }
    },
    rect: (id) => (byId[id] ? rectOf(byId[id]) : box(0, 0)),
    computed: (id) => (byId[id] ? computed(byId[id]) : null),
    bodyHas: (c) => body.cls.has(c),
    scrolls, focusCalls, L,
    resize(ih, rail) { L.ih = ih; L.rail = rail; (winListeners.resize || []).forEach((fn) => fn({})); },
    // drop-chat.js / drop-preview.js mount the Tell box with the type input.
    mountChat() {
      if (byId["drop-chat-wrap"]) return;
      const wrap = mk("div", "drop-chat-wrap");
      wrap.appendChild(mk("input", "talkType"));
      main.insertBefore(wrap, byId["desk-pick"].nextSibling);
      // The live page's MutationObserver re-syncs the rail, which hides the new box off its step.
      if (win.AIADropSteps) win.AIADropSteps.refresh();
    },
    hashTo(h) { location.hash = h; (winListeners.hashchange || []).forEach((fn) => fn({})); },
    focused: () => focused
  };
}
function talkFaults(stepsText, talkText) {
  const faults = [];
  const shown = (page) => !page.byId.talkBar.hidden && !page.byId.talkBar.cls.has("step-off");
  function talkOpen(page, label, want) {
    const cur = page.win.AIADropSteps && page.win.AIADropSteps.current();
    if (cur !== "tell") faults.push(label + ": lands on step '" + cur + "', not Tell");
    if (!shown(page)) faults.push(label + ": the Talk bar is hidden");
    const f = page.focused();
    if (!f || f.id !== (want || "talkType")) faults.push(label + ": focus is on " + (f ? f.id || f.tagName : "body") + ", not " + (want || "talkType"));
  }
  // Boot as the live page does: the Tell box is mounted before drop-talk's 50ms focus runs, unless noBox.
  function boot(opts, talkFirst, noBox, layout) {
    const page = fakeDrop(Object.assign({}, opts, layout ? { layout: layout } : {}));
    if (talkFirst) { page.run(talkText, "drop-talk.js"); page.run(stepsText, "drop-steps.js"); }
    else { page.run(stepsText, "drop-steps.js"); page.run(talkText, "drop-talk.js"); }
    if (!noBox) page.mountChat();
    page.flush();
    page.win.AIADropSteps.refresh();
    return page;
  }
  try {
    talkOpen(boot({ search: "?talk=1" }), "/drop?talk=1");
    const hashPage = boot({ hash: "#talk" });
    talkOpen(hashPage, "/drop#talk");
    talkOpen(boot({ search: "?mode=talk" }), "/drop?mode=talk");
    talkOpen(boot({ search: "?talk=1" }, true), "/drop?talk=1 with drop-talk first");
    // The Talk button is the fallback only while the type box is not on the page yet.
    talkOpen(boot({ hash: "#talk" }, false, true), "/drop#talk before the type box exists", "talkBtn");
    // The sticky rail must not cover the bar after the jump: scroll margin = rail height + 8px, on exactly
    // #talkBar and #talkType (a near-miss selector like #talkBarX does not count).
    const rules = cssRules(hashPage.css());
    ["talkBar", "talkType"].forEach(function (id) {
      const hit = rules.some((r) => r.id === id && /^calc\(\s*var\(--drop-rail-h[^)]*\)\s*\+\s*8px\s*\)$/.test(r.decls["scroll-margin-top"] || ""));
      if (!hit) faults.push("#" + id + " has no scroll-margin-top of the rail height + 8px");
    });
    // The jump scrolls the bar to the top (block start), and again one frame later after Tell lays out.
    const barStarts = hashPage.scrolls.filter((c) => c.id === "talkBar" && c.block === "start");
    if (!barStarts.some((c) => !c.raf)) faults.push("the Talk jump does not scroll #talkBar with block:'start'");
    if (!barStarts.some((c) => c.raf)) faults.push("no second #talkBar block:'start' scroll one frame later");
    if (hashPage.scrolls.some((c) => c.block !== "start")) faults.push("a Talk scroll uses block:'" + hashPage.scrolls.filter((c) => c.block !== "start")[0].block + "', not 'start'");
    // Focus must not scroll by itself; the scroll is ours, after the step change.
    if (!hashPage.focusCalls.some((c) => c.id === "talkType" && c.preventScroll)) faults.push("talkType focus is not preventScroll:true");
    // Geometry: the bar sits just under the sticky rail and the type box above the bottom nav / Back / Next.
    function geom(page, label) {
      const ih = page.L.ih;
      const rail = page.computed("drop-steps").position === "sticky" ? page.rect("drop-steps").bottom : 0;
      let floor = ih;
      ["desk-nav", "drop-step-foot"].forEach(function (id) {
        const cs = page.computed(id); const r = page.rect(id);
        if (cs && cs.display !== "none" && (cs.position === "fixed" || cs.position === "sticky") && r.height > 0 && r.top < floor && r.bottom > 0) floor = r.top;
      });
      const bar = page.rect("talkBar"), type = page.rect("talkType");
      if (bar.top < rail) faults.push(label + ": the Talk bar top " + bar.top + " is under the rail (" + rail + ")");
      if (bar.top > rail + 8 + 1) faults.push(label + ": the Talk bar top " + bar.top + " is not at the top (rail " + rail + " + 8)");
      if (type.top < rail || type.bottom + 8 > floor) faults.push(label + ": the type box " + type.top + "-" + type.bottom + " is not between the rail (" + rail + ") and 8px above the bottom cover (" + floor + ")");
    }
    geom(hashPage, "390x844 #talk");
    if (hashPage.bodyHas("talk-roomy") || hashPage.computed("desk-nav").display === "none") faults.push("390x844: the bottom nav must stay when the type box fits");
    const wide = boot({ search: "?talk=1" }, false, false, { ih: 390, rail: 100 });
    geom(wide, "844x390 ?talk=1");
    if (wide.computed("desk-nav").display !== "none") faults.push("844x390: the bottom nav still covers Talk");
    wide.win.AIADropSteps.go("card", true);
    if (wide.computed("desk-nav").display === "none") faults.push("844x390: the bottom nav stays hidden after Tell");
    if (wide.computed("drop-step-foot").position !== "sticky") faults.push("844x390: Back / Next stays unstuck after Tell");
    geom(boot({ hash: "#talk" }, false, false, { ih: 360, rail: 100 }), "740x360 #talk");
    // With Back / Next out of the way (scrolled off), the fixed nav alone must still be cleared.
    geom(boot({ hash: "#talk" }, false, false, { ih: 390, rail: 100, footH: 0 }), "844x390 #talk, nav only");
    // A type box that clears the nav but sits under the stuck Back / Next must still be moved.
    geom(boot({ hash: "#talk" }, false, false, { ih: 390, rail: 100, gap: 40 }), "844x390 #talk, under Back / Next");
    // 5px above the nav is still too close for a thumb: the 8px clearance counts.
    geom(boot({ hash: "#talk" }, false, false, { ih: 390, rail: 100, footH: 0, gap: 55 }), "844x390 #talk, 5px above the nav");
    // A ?talk=1 visit has no #talk to go back from: another hash change keeps Tell.
    const query = boot({ search: "?talk=1" });
    query.hashTo("#elsewhere"); query.flush();
    if (query.win.AIADropSteps.current() !== "tell") faults.push("a hash change on a ?talk=1 visit leaves Tell for '" + query.win.AIADropSteps.current() + "'");
    // Back from #talk returns to the step the page was on (Card here), not always Desk.
    const onCard = boot({});
    onCard.win.AIADropSteps.go("card", true);
    onCard.hashTo("#talk"); onCard.flush();
    onCard.hashTo(""); onCard.flush();
    if (onCard.win.AIADropSteps.current() !== "card") faults.push("Back from #talk on Card lands on '" + onCard.win.AIADropSteps.current() + "', not Card");
    if (hashPage.rootVars["--drop-rail-h"] !== RAIL_H + "px") faults.push("--drop-rail-h is not the measured rail height (" + (hashPage.rootVars["--drop-rail-h"] || "unset") + ")");
    // The rail var follows a resize (phone turned on its side).
    hashPage.resize(390, 100);
    if (hashPage.rootVars["--drop-rail-h"] !== "100px") faults.push("--drop-rail-h does not follow a resize (" + (hashPage.rootVars["--drop-rail-h"] || "unset") + ")");
    // A Talk link opens Tell for this visit; it must not become the remembered step.
    if (hashPage.win.sessionStorage.getItem("aia_drop_step") === "tell") faults.push("a Talk link saved 'tell' as the remembered step");
    const plain = boot({});
    const cur = plain.win.AIADropSteps && plain.win.AIADropSteps.current();
    if (cur !== "desk") faults.push("plain /drop: starts on '" + cur + "', not step 1 Desk");
    if (!/^Step 1 of /.test(plain.byId["drop-step-hint"] ? plain.byId["drop-step-hint"].textContent : "")) faults.push("plain /drop: hint must say Step 1");
    if (shown(plain)) faults.push("plain /drop: the Talk bar must stay on its own step");
    if (plain.focused()) faults.push("plain /drop: focus must not move");
    plain.hashTo("#talk"); plain.flush();
    talkOpen(plain, "plain /drop, then #talk");
    plain.hashTo(""); plain.flush();
    const back = plain.win.AIADropSteps.current();
    if (back !== "desk") faults.push("Back from #talk stays on '" + back + "', not the step before (desk)");
  } catch (e) {
    faults.push("threw " + ((e && e.message) || e));
  }
  return faults;
}
const liveTalk = talkFaults(steps, talkSrc);
if (liveTalk.length) fail("Talk links: " + liveTalk.join("; "));
const FOCUS_LINE = '    var typeEl = document.getElementById("talkType") || document.getElementById("talkBtn"); if (typeEl) typeEl.focus({ preventScroll: true });\n';
const SHOW_LINE = "    bar.hidden = false;\n";
const GO_BLOCK_START = '    if (window.AIADropSteps && AIADropSteps.go && AIADropSteps.current() !== "tell") {\n';
const once = (a, b) => (src) => (src.indexOf(a) < 0 || src.indexOf(a) !== src.lastIndexOf(a) ? null : src.replace(a, b));
const chain = (...fns) => (src) => fns.reduce((s, fn) => (s === null ? null : fn(s)), src);
const TALK_MUTANTS = [
  ["focusTalk no longer opens Tell (fix removed)", "talk", once('      AIADropSteps.go("tell", true);\n', "")],
  ["focusTalk falls back to the Desk step", "talk", once('AIADropSteps.go("tell", true);', 'AIADropSteps.go("desk", true);')],
  ["paint always falls back to the first open step", "steps", once("    if (rows.indexOf(stepOf(active)) < 0) active = rows[0].id;\n", "    active = rows[0].id;\n")],
  ["Talk gets no focus", "talk", once(FOCUS_LINE, "")],
  ["plain /drop no longer starts at step 1", "steps", once('active = deskFromLink() ? "card" : STEPS[0].id;', 'active = deskFromLink() ? "card" : "card";')],
  ["plain /drop opens Talk", "talk", once("    if (wantTalk()) setTimeout(focusTalk, 50);\n", "    setTimeout(focusTalk, 50);\n")],
  ["#talk no longer counts", "talk", once('return location.hash === "#talk" || params.get("talk") === "1"', 'return params.get("talk") === "1"')],
  ["TM2 focus before the bar is shown and Tell is open", "talk", chain(once(FOCUS_LINE, ""), once(SHOW_LINE, FOCUS_LINE + SHOW_LINE))],
  ["TM2b focus before Tell is open (bar shown)", "talk", chain(once(FOCUS_LINE, ""), once(GO_BLOCK_START, FOCUS_LINE + GO_BLOCK_START))],
  ["TM7 focus the Talk button, not the type box", "talk", once('document.getElementById("talkType") || document.getElementById("talkBtn")', 'document.getElementById("talkBtn")')],
  ["no Talk button fallback while the type box is missing", "talk", once('document.getElementById("talkType") || document.getElementById("talkBtn")', 'document.getElementById("talkType")')],
  ["#talkBar scroll margin removed", "steps", once('"body.drop-steps #talkBar,body.drop-steps #talkType{scroll-margin-top:calc(var(--drop-rail-h,140px) + 8px)}" +\n', "")],
  ["scroll margin loses the 8px", "steps", once("var(--drop-rail-h,140px) + 8px)", "var(--drop-rail-h,140px))")],
  ["rail height never measured", "steps", once("paint(); railHeight(); }", "paint(); }")],
  ["Talk link saves 'tell' as the remembered step", "talk", once("      try { if (kept === null) sessionStorage.removeItem(STEP_KEY); else sessionStorage.setItem(STEP_KEY, kept); } catch (e) {}\n", "")],
  ["Back from #talk stays on Tell", "talk", once("if (wantTalk()) focusTalk(); else leaveTalk();", "if (wantTalk()) focusTalk();")],
  // QA's TM list (probe 442c at 40e60020) and the landscape fix.
  ["TM9 no scroll at all (talkToTop empty)", "talk", once('    try { bar.scrollIntoView({ block: "start" }); } catch (e) { bar.scrollIntoView(true); }\n    fitType(bar);\n', "")],
  ["TM10 no second scroll after a frame", "talk", once("    (window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); })(function () { talkToTop(bar); });\n", "")],
  ["TM11 scroll block center", "talk", once('    try { bar.scrollIntoView({ block: "start" }); } catch (e) { bar.scrollIntoView(true); }\n    fitType(bar);\n', '    try { bar.scrollIntoView({ block: "center" }); } catch (e) { bar.scrollIntoView(true); }\n    fitType(bar);\n')],
  ["TM12 preventScroll dropped", "talk", once("typeEl.focus({ preventScroll: true })", "typeEl.focus()")],
  ["TM13 scroll margin on a wrong selector", "steps", once("body.drop-steps #talkBar,body.drop-steps #talkType{scroll-margin-top", "body.drop-steps #talkBarX,body.drop-steps #talkTypeX{scroll-margin-top")],
  ["TM13b scroll margin on #talkBar only by prefix", "steps", once("body.drop-steps #talkBar,body.drop-steps #talkType{scroll-margin-top", "body.drop-steps #talkBar-x,body.drop-steps #talkType-x{scroll-margin-top")],
  ["TM15 resize no longer re-measures", "steps", once('    window.addEventListener("resize", railHeight);\n', "")],
  ["TM18 leaveTalk always goes desk (even from ?talk=1 visits)", "talk", once('beforeTalk = location.hash === "#talk" ? AIADropSteps.current() || "" : "";', 'beforeTalk = "desk";')],
  ["landscape: type box never fitted", "talk", once("    fitType(bar);\n", "")],
  ["landscape: floor ignores the bottom nav", "talk", once('["desk-nav", "drop-step-foot"].forEach', '["drop-step-foot"].forEach')],
  ["landscape: floor ignores Back / Next", "talk", once('["desk-nav", "drop-step-foot"].forEach', '["desk-nav"].forEach')],
  ["landscape: fit ignores the 8px", "talk", once("return t.getBoundingClientRect().bottom + 8 <= floorY();", "return t.getBoundingClientRect().bottom <= floorY();")],
  ["landscape: room is made even when it fits", "talk", once("    if (fits()) return;\n    var room", "    var room")],
  ["landscape: no talk-tight stage", "talk", once('var room = ["talk-roomy", "talk-tight"];', 'var room = ["talk-roomy"];')],
  ["landscape: nav not hidden on talk-roomy", "steps", once("body.drop-at-tell.talk-roomy #desk-nav{display:none!important}", "body.drop-at-tell.talk-roomy #desk-navX{display:none!important}")],
  ["landscape: Back / Next stays stuck on talk-roomy", "steps", once("body.drop-at-tell.talk-roomy #drop-step-foot{position:static}", "body.drop-at-tell.talk-roomy #drop-step-footX{position:static}")],
  ["landscape: rail stays stuck on talk-tight", "steps", once("body.drop-at-tell.talk-tight #drop-steps{position:static}", "body.drop-at-tell.talk-tight #drop-stepsX{position:static}")],
  ["landscape: talk-tight keeps the rail margin", "steps", once("body.drop-at-tell.talk-tight #talkBar{scroll-margin-top:8px}", "body.drop-at-tell.talk-tight #talkBarX{scroll-margin-top:8px}")],
  ["landscape: nav rule not keyed to Tell", "steps", once('document.body.classList.toggle("drop-at-tell", active === "tell");', 'document.body.classList.add("drop-at-tell");')]
];
TALK_MUTANTS.forEach(function (m) {
  const src = m[1] === "talk" ? talkSrc : steps;
  const next = m[2](src);
  if (next === null) { fail("Talk mutant anchor missing or not unique: " + m[0]); return; }
  const faults = m[1] === "talk" ? talkFaults(steps, next) : talkFaults(next, talkSrc);
  if (!faults.length) fail("Talk mutant NOT caught: " + m[0]);
  else console.log("check-drop-steps: Talk mutant caught: " + m[0] + " (" + faults[0] + ")");
});
console.log("check-drop-steps: Talk links open Talk; " + TALK_MUTANTS.length + " Talk mutants");
console.log("check-drop-steps: ok");
