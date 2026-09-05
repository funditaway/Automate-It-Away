#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function fail(msg) {
  console.error("check-drop-ux: " + msg);
  process.exit(1);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
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
  if (send.indexOf("You still tap Yes or Stop") < 0) fail(file + " success must keep Yes or Stop");
  if (send.indexOf("Dropping…") < 0 && send.indexOf("Dropping...") < 0) fail(file + " send() must show Dropping…");
  if (send.indexOf("attachFiles(item") < 0) fail(file + " send() must still attachFiles");
  if (copy.indexOf("share-ok") < 0) fail(file + " copyDropShare must write #share-ok");
  if (/getElementById\(["']ok["']\)/.test(copy)) fail(file + " copyDropShare must not hijack #ok");
  if (copy.indexOf("never see money") < 0) fail(file + " share copy must stay honest about money");
  if (src.indexOf("AIADesks.shopOpen") < 0) fail(file + " deskOpen must still follow shopOpen()");
});

const pick = read("drop-pick.js");
if (pick.indexOf("from the link") < 0) fail("drop-pick.js must name a link desk when this phone has no saved desk");
if (!/AIADesks\.hasAuth\s*\(\s*row\s*\)/.test(pick)) {
  fail("drop-pick.js pick() must still treat AIADesks.hasAuth(row) as enough");
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

console.log("check-drop-ux: ok");
