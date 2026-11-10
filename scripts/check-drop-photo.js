#!/usr/bin/env node
"use strict";
require("./_env-guard");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");

function fail(msg) {
  console.error("check-drop-photo: " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

// 1ec1382 moved send()/attachFiles out of drop.html and widget.html into
// drop-app.js. Do not require the unminified function to live in the HTML
// pages. Assert the painted #photo input, that Drop posts the photo on
// capture, that the /desk card paints it, and that Drop does not ship,
// start, or charge before Yes.
const app = read("drop-app.js");
const needs = read("desk-needs.js");
const drop = read("drop.html");
const widget = read("widget.html");

function sendFn(src) {
  const start = src.indexOf("async function send()");
  if (start < 0) {
    const alt = src.indexOf("async function send(");
    if (alt < 0) return "";
    const end = src.indexOf("function copyDropShare", alt);
    return src.slice(alt, end > alt ? end : alt + 2800);
  }
  const end = src.indexOf("function copyDropShare", start);
  return src.slice(start, end > start ? end : start + 2800);
}
function attachFn(src) {
  const start = src.indexOf("async function attachFiles");
  if (start < 0) return "";
  const end = src.indexOf("async function send", start + 10);
  return src.slice(start, end > start ? end : start + 2000);
}

function dropPhotoPayloadFaults(appSrc) {
  const bad = [];
  const attach = attachFn(appSrc) || appSrc;
  const send = sendFn(appSrc) || appSrc;
  if (!/photo\.files/.test(attach) && !/photo\.files/.test(appSrc)) bad.push("does not read #photo files");
  if (!/\/api\/upload/.test(attach) && !/\/api\/upload/.test(appSrc)) bad.push("does not POST /api/upload");
  if (!/item\.photoUrl/.test(attach)) bad.push("photo dropped from the payload (no photoUrl)");
  if (!/item\.files/.test(attach)) bad.push("photo dropped from the payload (no files)");
  if (!/attachFiles\s*\(\s*item/.test(send)) bad.push("send does not attachFiles before capture");
  if (!/action:\s*["']capture["']/.test(send) && !/\/api\/jobs/.test(send)) bad.push("send does not capture to /api/jobs");
  return bad;
}

function dropPhotoHoldFaults(appSrc) {
  const bad = [];
  const send = sendFn(appSrc) || appSrc;
  if (/action:\s*["']ship["']|action:\s*["']start["']|action:\s*["']charge["']/.test(send)) {
    bad.push("drop auto-sends/starts before Yes");
  }
  return bad;
}

function dropPhotoCardPaintFaults(needsSrc) {
  const bad = [];
  if (!/class="thumb"/.test(needsSrc) && !/class=\\"thumb\\"/.test(needsSrc)) {
    bad.push("card does not paint the photo");
  }
  if (!/photoUrl/.test(needsSrc)) bad.push("card painter ignores photoUrl");
  if (!/q-files/.test(needsSrc)) bad.push("card painter missing q-files");
  return bad;
}

["drop.html", "widget.html"].forEach(function (file) {
  const src = file === "drop.html" ? drop : widget;
  if (!/id="photo"/.test(src) && !/id=\\"photo\\"/.test(src)) fail(file + " must keep the #photo file input");
  else pass(file + " keeps #photo");
  if (src.indexOf("drop-app.js") < 0) fail(file + " must load drop-app.js");
  else pass(file + " loads drop-app.js");
});

if (!sendFn(app)) fail("drop-app.js missing send()");
else pass("drop-app.js has send()");
if (!attachFn(app) && app.indexOf("async function attachFiles") < 0) fail("drop-app.js must attachFiles before send");
else pass("drop-app.js has attachFiles");

(function () {
  const bad = dropPhotoPayloadFaults(app);
  if (bad.length) fail("photo must reach the capture payload: " + bad.join("; "));
  else pass("Drop attachFiles uploads and sets photoUrl/files on capture");
})();
(function () {
  const bad = dropPhotoHoldFaults(app);
  if (bad.length) fail("Drop must not send or Start before Yes: " + bad.join("; "));
  else pass("Drop does not ship/start/charge before Yes");
})();
(function () {
  const bad = dropPhotoCardPaintFaults(needs);
  if (bad.length) fail("/desk card must paint the photo: " + bad.join("; "));
  else pass("desk-needs paints q-files / img.thumb from photoUrl");
})();

if (app.indexOf("You still tap Yes, then Start") < 0) fail("Drop must still say You still tap Yes, then Start");
else pass("Drop keeps You still tap Yes, then Start");

const fields = read("api/_fields.js");
const start = fields.indexOf("function makeCapturedJob");
const end = fields.indexOf("function addTalk", start + 10);
const fn = fields.slice(start, end > start ? end : start + 5000);
if (fn.indexOf("src.files") < 0 || fn.indexOf("job.files") < 0) {
  fail("makeCapturedJob must keep uploaded files on the card");
} else pass("makeCapturedJob keeps uploaded files");

const api = require(path.join(root, "api/_fields"));
const job = api.makeCapturedJob("springfield-desk", { fields: [], people: [] }, {
  title: "Porch photo",
  notes: "Need a look",
  photoUrl: "/api/upload?id=file_1",
  files: [{ id: "file_1", name: "porch.jpg", type: "image/jpeg", kind: "photo", bytes: 12, url: "/api/upload?id=file_1" }]
});
if (job.photoUrl !== "/api/upload?id=file_1") fail("capture must keep photoUrl");
else pass("capture keeps photoUrl");
if (!job.files || job.files[0].url !== "/api/upload?id=file_1") fail("capture must keep files");
else pass("capture keeps files");

(function () {
  const ctx = {
    window: {},
    document: {
      readyState: "complete",
      addEventListener: function () {},
      getElementById: function () { return null; },
      createElement: function () { return { id: "", textContent: "" }; },
      head: { appendChild: function () {} },
      querySelector: function () { return null; }
    },
    setTimeout: function () {},
    localStorage: { getItem: function () { return ""; }, setItem: function () {} },
    esc: function (s) {
      return String(s || "").replace(/[&<>"]/g, function (c) {
        return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c];
      });
    },
    safeUrl: function (u) { return String(u || ""); },
    fileNameHtml: function (t) { return (t && t.name) || "File"; },
    cardTitleHtml: function (t) { return "<h3>" + (t && t.title || "") + "</h3>"; },
    thenDraftName: function (n) { return n; },
    visitorLine: function (s) { return s; },
    labelStatus: function (s) { return s; },
    sheetCardOf: function (t) { return t; }
  };
  ctx.window = ctx;
  try { vm.runInNewContext(needs, ctx); } catch (e) { fail("desk-needs.js must parse in vm: " + e.message); return; }
  if (typeof ctx.card !== "function") { fail("desk-needs.js must set window.card"); return; }
  let html;
  try {
    html = ctx.card({
      id: "j-photo-1",
      status: "waiting",
      title: "Porch photo",
      why: "Need a look",
      kind: "photo",
      photoUrl: "/api/upload?id=file_1",
      files: [{ id: "file_1", name: "porch.jpg", type: "image/jpeg", kind: "photo", url: "/api/upload?id=file_1" }]
    }, false);
  } catch (e) { fail("card() threw: " + e.message); return; }
  if (!html) { fail("card() must return HTML"); return; }
  if (!/<img[^>]*class="thumb"[^>]*src="\/api\/upload\?id=file_1"/.test(html) && html.indexOf("/api/upload?id=file_1") < 0) {
    fail("queue card must paint the photo or its upload ref");
  } else pass("queue card paints img.thumb from the upload ref");
  if (!/q-files/.test(html) && !/<img[^>]*class="thumb"/.test(html)) fail("queue card must paint a photo marker");
  if (!/>Yes</.test(html) && !/q-yes/.test(html)) fail("Yes must stay on a waiting photo card");
  else pass("Yes stays on a waiting photo card");
  if (!/>Stop</.test(html) && !/q-stop/.test(html)) fail("Stop must stay on a waiting photo card");
  else pass("Stop stays on a waiting photo card");
  if (!/>Kill</.test(html) && !/q-kill/.test(html)) fail("Kill must stay on a waiting photo card");
  else pass("Kill stays on a waiting photo card");
  if (/q-start/.test(html) && !/q-yes/.test(html)) fail("Start must not replace Yes on a fresh photo drop");
  else pass("Start does not replace Yes on a fresh photo drop");
})();

function swap(str, from, to) { return str.indexOf(from) < 0 ? null : str.split(from).join(to); }

const MUTANTS = [
  ["photo dropped from the payload", function () {
    let n = swap(app, "if (data.photoUrl) item.photoUrl = data.photoUrl;", "");
    if (!n) return null;
    n = swap(n, "if (Array.isArray(data.files) && data.files.length) item.files = data.files;", "");
    if (!n) return null;
    return dropPhotoPayloadFaults(n);
  }],
  ["card not painting the photo", function () {
    const n = swap(needs, 'class="thumb"', 'class="file"');
    return n ? dropPhotoCardPaintFaults(n) : null;
  }],
  ["drop auto-sends/starts before Yes", function () {
    const needle = 'const r = await fetch("/api/jobs", { method: "POST", headers: headers(), body: JSON.stringify(item) });';
    const n = swap(app, needle, needle + ' await fetch("/api/jobs", { method: "POST", headers: headers(), body: JSON.stringify({ action: "ship" }) });');
    return n ? dropPhotoHoldFaults(n) : null;
  }]
];
let mutCaught = 0;
MUTANTS.forEach(function (m) {
  let out;
  try { out = m[1](); } catch (e) { out = ["threw " + e.message]; }
  if (out === null || out === false || out === undefined) fail("mutant does not apply: " + m[0]);
  else if (out.length) { mutCaught += 1; pass("mutant caught: " + m[0] + " (" + out[0] + ")"); }
  else fail("mutant survived: " + m[0]);
});
pass("mutants: " + mutCaught + "/" + MUTANTS.length + " caught");
if (mutCaught !== MUTANTS.length) fail("not every mutant was caught");

if (process.exitCode) {
  console.error("check-drop-photo failed");
  process.exit(1);
}
console.log("check-drop-photo mutants: " + mutCaught + "/" + MUTANTS.length + " caught");
console.log("check-drop-photo: ok");
