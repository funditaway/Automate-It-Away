#!/usr/bin/env node
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

function fail(msg) {
  console.error("check-drop-ux: " + msg);
  process.exit(1);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function mustParseAndEsc(rel) {
  const file = path.join(ROOT, rel);
  const syntax = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (syntax.status !== 0) {
    fail(rel + " must parse: " + (syntax.stderr || syntax.stdout || "syntax error").trim());
  }
  const src = read(rel);
  const start = src.indexOf("function esc(s)");
  if (start < 0) fail(rel + " missing esc()");
  const end = src.indexOf("\n  function ", start + 10);
  const fn = src.slice(start, end > start ? end : start + 400);
  if (!/"&":\s*"&amp;"/.test(fn) || !/"<":\s*"&lt;"/.test(fn)) fail(rel + " esc() does not encode & / <");
  if (!/">":\s*"&gt;"/.test(fn) || !/"\\"":\s*"&quot;"/.test(fn)) fail(rel + " esc() does not encode > / \"");
  if (fn.indexOf("&#39;") < 0) fail(rel + " esc() does not encode '");
  if (/\s*"<":"<"/.test(fn) || /\s*"&":"&"/.test(fn) || /'"':\s*"""/.test(fn)) {
    fail(rel + " esc() is a no-op or invalid quote map");
  }
  const ctx = {};
  vm.runInNewContext(fn + "; this.esc = esc;", ctx);
  if (ctx.esc("Shop <desk>") !== "Shop &lt;desk&gt;") fail(rel + " esc must encode < in desk names");
  if (ctx.esc("A & B") !== "A &amp; B") fail(rel + " esc must encode &");
  if (ctx.esc('"hi"') !== "&quot;hi&quot;") fail(rel + " esc must encode \"");
  if (ctx.esc("O'Brien") !== "O&#39;Brien") fail(rel + " esc must encode '");
}

function sendFn(src, label) {
  const start = src.indexOf("async function send()");
  if (start < 0) fail(label + " missing send()");
  const end = src.indexOf("function copyDropShare", start);
  return src.slice(start, end > start ? end : start + 3600);
}

function copyFn(src, label) {
  const start = src.indexOf("function copyDropShare");
  if (start < 0) fail(label + " missing copyDropShare");
  return src.slice(start, start + 1400);
}

["drop.html", "widget.html"].forEach(function (file) {
  const src = read(file);
  const send = sendFn(src, file);
  const copy = copyFn(src, file);

  if (src.indexOf("https://www.automateitaway.com/drop?ws=") < 0) {
    fail(file + " share link must use www.automateitaway.com");
  }
  if (/https:\/\/automateitaway\.com\/drop\?ws=/.test(src) && src.indexOf("https://www.automateitaway.com/drop?ws=") < 0) {
    fail(file + " still advertises the apex drop host");
  }
  if (src.indexOf('id="desk-on"') < 0) fail(file + " missing #desk-on destination");
  if (src.indexOf('id="share-ok"') < 0) fail(file + " missing #share-ok");
  if (src.indexOf('id="share-copy"') < 0) fail(file + " missing Copy drop link button");
  if (src.indexOf('id="title-hint"') < 0) fail(file + " missing title hint");
  if (src.indexOf('aria-live="polite"') < 0 || src.indexOf('aria-live="assertive"') < 0) {
    fail(file + " must announce success and errors");
  }
  if (src.indexOf("function paintFiles") < 0 || src.indexOf('photoEl.addEventListener("change", paintFiles)') < 0) {
    fail(file + " must paint selected files");
  }
  if (src.indexOf("Saving file") < 0) fail(file + " must say Saving file while upload runs");
  if (src.indexOf("File did not save.") < 0) fail(file + " upload error must say File did not save");
  if (src.indexOf("Photo did not save.") >= 0) fail(file + " still says Photo did not save");
  if (src.indexOf("You still tap Yes or Stop") < 0) fail(file + " sub must keep Yes or Stop");
  if (src.indexOf("You still tap Yes or No") >= 0) fail(file + " still paints Yes or No as the rail");
  if (send.indexOf("You still tap Yes or Stop") < 0) fail(file + " success must keep Yes or Stop");
  if (send.indexOf("Dropping…") < 0 && send.indexOf("Dropping...") < 0) fail(file + " send() must show Dropping…");
  if (send.indexOf("attachFiles(item") < 0) fail(file + " send() must still attachFiles");
  if (send.indexOf("agent-tell") < 0) fail(file + " send() must read Tell AIA from #agent-tell");
  if (/\|\|\s*implement\)\s*\)\s*:/.test(send) || /tell\s*=\s*agentOn[\s\S]{0,120}\|\|\s*implement/.test(send)) {
    fail(file + " Tell AIA must not fall back to pasted implement");
  }
  if (send.indexOf("tell: tell") < 0) fail(file + " send() must post tell");
  if (copy.indexOf("share-ok") < 0) fail(file + " copyDropShare must write #share-ok");
  if (/getElementById\(["']ok["']\)/.test(copy)) fail(file + " copyDropShare must not hijack #ok");
  if (copy.indexOf("never see money") < 0) fail(file + " share copy must stay honest about money");
  if (src.indexOf("AIADesks.shopOpen") < 0) fail(file + " deskOpen must still follow shopOpen()");
});

["drop-pick.js", "drop-preview.js"].forEach(mustParseAndEsc);

const pick = read("drop-pick.js");
if (pick.indexOf("from the link") < 0) fail("drop-pick.js must name a link desk when this phone has no saved desk");
if (!/AIADesks\.hasAuth\s*\(\s*row\s*\)/.test(pick)) {
  fail("drop-pick.js pick() must still treat AIADesks.hasAuth(row) as enough");
}
if (pick.indexOf('class=\\"chip-label\\"') < 0 && pick.indexOf('class="chip-label"') < 0) {
  fail("drop-pick.js must keep World accounts / World desks on their own chip-label row");
}

const yesNo = read("ACCOUNT-YES-NO.md");
const packMd = read("PACK.md");
if (yesNo.indexOf("Drop pick / preview leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop pick / preview leftover");
}
if (packMd.indexOf("Drop pick / preview leftover:") < 0) {
  fail("PACK.md must name Drop pick / preview leftover");
}

const now = read("drop-now.js");
if (now.indexOf("This drop goes to") < 0) fail("drop-now.js banner must name the destination desk");
if (now.indexOf("You still tap Yes or Stop") < 0) fail("drop-now.js banner must keep Yes or Stop");

const preview = read("drop-preview.js");
const gateAt = preview.indexOf("function gateSend");
const gate = preview.slice(gateAt, preview.indexOf("function wrapFetch", gateAt));
if (gate.indexOf("Say what you need") < 0) fail("gateSend must show Say what you need when title is missing");
if (!/if\s*\(\s*card\.desk\s*&&\s*card\.title\s*\)\s*return/.test(gate)) {
  fail("gateSend must still let Drop it run when desk and title are set");
}
if (preview.indexOf("Then send it") >= 0) fail("drop-preview.js still says Then send it");
if (preview.indexOf("The desk asks what is missing") >= 0) fail("drop-preview.js Talk empty still says The desk asks");
if (preview.indexOf("A Desk AI drafts the card") < 0) fail("drop-preview.js Talk empty must say A Desk AI drafts the card");
if (preview.indexOf("You still tap Yes or Stop") < 0) fail("drop-preview.js must keep Yes or Stop");
if (preview.indexOf(': "Desk")') >= 0) fail("drop-preview.js Talk speaker still says Desk");
if (preview.indexOf(': "Desk AI")') < 0) fail("drop-preview.js Talk speaker must say Desk AI");
if (preview.indexOf("What should the desk do with this") >= 0) {
  fail("drop-preview.js ask still says What should the desk do with this");
}
if (preview.indexOf("Should the desk text them") >= 0) fail("drop-preview.js ask still says Should the desk text them");
if (preview.indexOf("The desk still will not send it") >= 0) {
  fail("drop-preview.js ask still says The desk still will not send it");
}
if (preview.indexOf("What is needed? A Desk AI drafts the card. You still tap Yes or Stop.") < 0) {
  fail("drop-preview.js title ask must say A Desk AI drafts the card");
}
if (yesNo.indexOf("Drop preview ask leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop preview ask leftover");
}
if (packMd.indexOf("Drop preview ask leftover:") < 0) {
  fail("PACK.md must name Drop preview ask leftover");
}

["drop.html", "widget.html"].forEach(function (file) {
  const src = read(file);
  if (src.indexOf("The desk writes the card") >= 0) fail(file + " Put data on still says The desk writes the card");
  if (src.indexOf("Paste the data. A Desk AI drafts the card. You still tap Yes or Stop.") < 0) {
    fail(file + " Put data on must say A Desk AI drafts the card");
  }
});
if (yesNo.indexOf("Drop Put data on leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop Put data on leftover");
}
if (packMd.indexOf("Drop Put data on leftover:") < 0) {
  fail("PACK.md must name Drop Put data on leftover");
}

const talk = read("drop-talk.js");
if (talk.indexOf("Talk the work in your words") >= 0) fail("drop-talk.js still says Talk the work in your words");
if (talk.indexOf("Then say drop it. Nobody sends money from here.") >= 0) {
  fail("drop-talk.js empty still says Then say drop it");
}
if (talk.indexOf("A Desk AI drafts the card") < 0) fail("drop-talk.js Hear this must say A Desk AI drafts the card");
if (talk.indexOf("You still tap Yes or Stop") < 0) fail("drop-talk.js must keep Yes or Stop");
["drop.html", "widget.html"].forEach(function (file) {
  const src = read(file);
  if (src.indexOf("Talk the work in your words") >= 0) fail(file + " Talk bar still says Talk the work in your words");
  if (src.indexOf("A Desk AI drafts the card") < 0) fail(file + " Talk bar must say A Desk AI drafts the card");
});

const nav = read("desk-nav.js");
if (nav.indexOf("function dropEmbedOn") < 0 || nav.indexOf("function bootDropEmbed") < 0) {
  fail("desk-nav.js must treat /widget as slim embed chrome");
}
if (nav.indexOf("widgetPath()") < 0 && nav.indexOf("file() === \"widget\"") < 0) {
  fail("desk-nav.js must detect the /widget path");
}
const embedBoot = nav.slice(nav.indexOf("function bootDropEmbed"), nav.indexOf("function boot()"));
if (embedBoot.indexOf("drop-chat.js") >= 0) fail("widget embed must not load drop-chat.js");
if (embedBoot.indexOf("drop-talk.js") >= 0) fail("widget embed must not load drop-talk.js Talk bar");
if (embedBoot.indexOf("drop-preview.js") < 0) fail("widget embed must load drop-preview.js for one Tell the desk");
if (nav.indexOf("loadDrop(\"drop-chat.js\"") < 0) fail("desk-nav.js must still load drop-chat.js on /drop");

["drop.html", "widget.html"].forEach(function (file) {
  const src = read(file);
  if (src.indexOf("p==='widget'") < 0 && src.indexOf("p === \"widget\"") < 0) {
    fail(file + " must mark /widget as embed on first paint");
  }
  if (src.indexOf("function widgetPath") < 0) fail(file + " must treat /widget path as embed");
  if (src.indexOf("html.embed header") < 0 || src.indexOf("html.embed #desk-nav") < 0) {
    fail(file + " must hide full Drop chrome on /widget");
  }
  if (src.indexOf("html.embed body.has-desk-nav") < 0) fail(file + " must drop the desk-nav gap on /widget");
});

const chat = read("drop-chat.js");
if (chat.indexOf("widgetPath()") < 0) fail("drop-chat.js must skip /widget so Tell the desk is not duplicated");

if (preview.indexOf("haveTell") < 0) fail("drop-preview.js must not inject a second Tell the desk");
if (preview.indexOf('p === "widget"') < 0) fail("drop-preview.js embedOn must treat /widget as embed");

if (pick.indexOf("function embedOn") < 0 || pick.indexOf('p === "widget"') < 0) {
  fail("drop-pick.js must skip world-desk chrome on /widget");
}

if (yesNo.indexOf("Drop widget chrome leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget chrome leftover");
}
if (packMd.indexOf("Drop widget chrome leftover:") < 0) {
  fail("PACK.md must name Drop widget chrome leftover");
}

console.log("check-drop-ux: ok");
