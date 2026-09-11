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

console.log("check-drop-ux: ok");
