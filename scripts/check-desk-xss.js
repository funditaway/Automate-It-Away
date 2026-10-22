#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const helpers = require(path.join(root, "escape-html.js"));

const IMG = "<img src=x onerror=alert(1)>";
const SCRIPT = "\"><script>alert(1)</script>";
const JSURL = "javascript:alert(1)";

function fail(msg) {
  console.error("check-desk-xss: " + msg);
  process.exit(1);
}

function syntax(file) {
  const out = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (out.status !== 0) fail(path.basename(file) + " must parse: " + (out.stderr || out.stdout || "syntax error"));
}

[
  "escape-html.js",
  "desk-needs.js",
  "desk-queue.js",
  "desk-card.js",
  "desk-html-view.js",
  "desk-view.js",
  "desk-handoff.js",
  "desk-inbox.js",
  "pack-card.js",
  "desk-ais.js",
  "desk-queue-packs.js"
].forEach(function (name) { syntax(path.join(root, name)); });

if (helpers.escapeHtml(IMG) !== "&lt;img src=x onerror=alert(1)&gt;") fail("escapeHtml must encode the img payload");
if (helpers.escapeHtml(SCRIPT) !== "&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;") fail("escapeHtml must encode the script payload");
if (helpers.escapeHtml("`") !== "&#96;") fail("escapeHtml must encode backtick");
if (helpers.escapeHtml("a & b < c > d \" e ' f") !== "a &amp; b &lt; c &gt; d &quot; e &#39; f") {
  fail("escapeHtml must encode & < > \" '");
}
if (helpers.safeUrl(JSURL) !== "") fail("javascript: links must be dropped");
if (helpers.safeUrl("  java\nscript:alert(1)") !== "") fail("javascript: with breaks must be dropped");
if (helpers.safeUrl("VBSCRIPT:msg") !== "") fail("vbscript: links must be dropped");
if (helpers.safeUrl("data:text/html,hi") !== "") fail("data: links must be dropped");
if (helpers.safeUrl("//evil.test/a") !== "") fail("protocol-relative links must be dropped");
if (helpers.safeUrl("https://x.test/slip.jpg") !== "https://x.test/slip.jpg") fail("https links must stay");
if (helpers.safeUrl("http://x.test/a") !== "http://x.test/a") fail("http links must stay");
if (helpers.safeUrl("mailto:a@b.test") !== "mailto:a@b.test") fail("mailto links must stay");
if (helpers.safeUrl("/api/upload?id=abc") !== "/api/upload?id=abc") fail("same-origin upload paths must stay");
if (helpers.safeUrl("https://x.test/a.jpg\">") !== "https://x.test/a.jpg\">") fail("https links keep their characters for the caller to escape");
if (helpers.safeTel("tel:+15551212") !== "tel:+15551212") fail("digit tel links must stay");
if (helpers.safeTel(JSURL) !== "#") fail("javascript: must not be a phone link");
if (helpers.safeId("job_1") !== "job_1") fail("job ids must stay");
if (/[<>"'`\s]/.test(helpers.safeId(SCRIPT + IMG))) fail("ids must not keep markup");
if (/<script/i.test(helpers.jsAttr(SCRIPT))) fail("jsAttr must not emit a script tag");

function sandbox() {
  const nodes = {};
  function make(id, tag) {
    return {
      id: id || "",
      tagName: String(tag || "div").toUpperCase(),
      children: [],
      hidden: false,
      className: "",
      classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
      innerHTML: "",
      textContent: "",
      value: "",
      style: {},
      setAttribute: function () {},
      getAttribute: function () { return ""; },
      appendChild: function (c) { this.children.push(c); return c; },
      insertBefore: function () {},
      remove: function () {},
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      addEventListener: function () {},
      closest: function () { return null; }
    };
  }
  const ctx = {
    console: console,
    setTimeout: function () {},
    clearTimeout: function () {},
    localStorage: { getItem: function () { return ""; }, setItem: function () {} },
    sessionStorage: { getItem: function () { return ""; }, setItem: function () {} },
    location: { search: "", href: "http://127.0.0.1:3000/desk" },
    MutationObserver: function () { this.observe = function () {}; this.disconnect = function () {}; },
    URLSearchParams: URLSearchParams
  };
  ctx.document = {
    readyState: "complete",
    addEventListener: function () {},
    getElementById: function (id) {
      if (!nodes[id]) nodes[id] = make(id);
      return nodes[id];
    },
    createElement: function (tag) { return make("", tag); },
    querySelector: function () { return null; },
    head: { appendChild: function () {} },
    body: { appendChild: function () {} }
  };
  ctx.window = ctx;
  ctx.escapeHtml = helpers.escapeHtml;
  ctx.safeUrl = helpers.safeUrl;
  ctx.safeId = helpers.safeId;
  ctx.safeTel = helpers.safeTel;
  ctx.jsAttr = helpers.jsAttr;
  ctx.esc = helpers.escapeHtml;
  ctx.nodes = nodes;
  return ctx;
}

// What a browser would show for a node built with createElement/textContent/appendChild:
// textContent is escaped, innerHTML is taken as written, then the children.
function serialize(node) {
  const inner = node.innerHTML ? node.innerHTML : helpers.escapeHtml(node.textContent || "");
  return inner + (node.children || []).map(function (c) {
    const t = String(c.tagName || "div").toLowerCase();
    return "<" + t + ">" + serialize(c) + "</" + t + ">";
  }).join("");
}

function assertInert(html, where) {
  if (typeof html !== "string" || !html) fail(where + " did not render");
  if (/<script[\s>/]/i.test(html)) fail(where + " rendered a script tag");
  if (/<img\b[^>]*\sonerror\s*=/i.test(html)) fail(where + " rendered an img onerror handler");
  if (/\s(?:href|src)\s*=\s*["']\s*(?:javascript|vbscript|data):/i.test(html)) fail(where + " rendered a javascript: link");
  if (html.indexOf(IMG) >= 0) fail(where + " left the img payload raw");
  if (html.indexOf("<script") >= 0) fail(where + " left a script tag raw");
  if (html.indexOf("\"><script>") >= 0) fail(where + " left the quote-break payload raw");
}

function assertEscapedText(html, raw, where) {
  const escaped = helpers.escapeHtml(raw);
  if (html.indexOf(escaped) < 0) fail(where + " did not escape " + raw);
}

const evil = {
  id: "job_xss",
  status: "waiting",
  title: IMG,
  why: SCRIPT,
  draft: SCRIPT,
  notes: IMG,
  assignee: SCRIPT,
  next: SCRIPT,
  kind: IMG,
  outcome: SCRIPT,
  photoUrl: JSURL,
  deskAi: { name: SCRIPT, does: IMG, prompt: SCRIPT },
  thread: [{ kind: "note", from: SCRIPT, text: IMG }],
  files: [
    { url: "https://x.test/slip.jpg", name: IMG, kind: "file" },
    { url: "/api/upload?id=abc", name: "Photo", kind: "file" },
    { url: JSURL, name: SCRIPT, kind: "file" }
  ],
  needs: [
    { id: "fill", label: IMG },
    { id: "call", label: SCRIPT, href: JSURL }
  ],
  decide: true,
  clock: { dueLabel: IMG, ageLabel: SCRIPT }
};

const photo = {
  id: "job_photo",
  status: "waiting",
  title: "Oak dresser",
  why: "List it",
  draft: "Draft only",
  photoUrl: "https://x.test/a.jpg\">",
  files: [{ url: "https://x.test/slip.jpg", name: "Permission slip.pdf", kind: "photo" }]
};

const needsCtx = sandbox();
vm.runInNewContext(fs.readFileSync(path.join(root, "desk-needs.js"), "utf8"), needsCtx);
if (typeof needsCtx.card !== "function") fail("desk-needs.js must set card()");
const needsHtml = needsCtx.card(evil, false);
assertInert(needsHtml, "desk queue card");
assertEscapedText(needsHtml, IMG, "desk queue title");
assertEscapedText(needsHtml, SCRIPT, "desk queue why");
if (needsHtml.indexOf("https://x.test/slip.jpg") < 0) fail("https file links must stay on the queue card");
if (needsHtml.indexOf("/api/upload?id=abc") < 0) fail("upload paths must stay on the queue card");
if (/onclick="kill\('[^']*img/i.test(needsHtml)) fail("Stop must not put the title in the click handler");
const needsPhoto = needsCtx.card(photo, false);
if (needsPhoto.indexOf("src=\"https://x.test/a.jpg&quot;&gt;\"") < 0) fail("https photo quotes must be escaped, not dropped");
if (needsPhoto.indexOf("https://x.test/slip.jpg") < 0) fail("https photo must stay");

const queueCtx = sandbox();
vm.runInNewContext(fs.readFileSync(path.join(root, "desk-queue.js"), "utf8"), queueCtx);
if (typeof queueCtx.queueCard !== "function") fail("desk-queue.js must set queueCard()");
const queueHtml = queueCtx.queueCard(evil, false);
assertInert(queueHtml, "queue card");
assertEscapedText(queueHtml, IMG, "queue title");
assertEscapedText(queueHtml, SCRIPT, "queue why");
if (/onclick="kill\('[^']*',/.test(queueHtml)) fail("queue Stop must not take a title argument");
if (fs.readFileSync(path.join(root, "desk-queue.js"), "utf8").indexOf("Yes or Stop.") < 0) {
  fail("queue decide line must stay Yes or Stop");
}
const queuePhoto = queueCtx.queueCard(photo, false);
if (queuePhoto.indexOf("src=\"https://x.test/a.jpg&quot;&gt;\"") < 0) fail("queue https photo quotes must be escaped");

queueCtx.api = async function () {
  return {
    data: {
      inbound: SCRIPT,
      catalog: [{ id: "hook", label: IMG, status: SCRIPT, live: false, note: IMG }],
      connections: []
    }
  };
};
queueCtx.PEOPLE = [{ id: "p1", name: SCRIPT, role: "helper" }];
queueCtx.JOBS = [evil];
queueCtx.jobBy = function () { return evil; };

async function sheets() {
  await queueCtx.openPipesSheet("job_xss");
  const pipes = queueCtx.nodes["sheet-card"].innerHTML;
  assertInert(pipes, "pipes sheet");
  assertEscapedText(pipes, IMG, "pipe label");
  assertEscapedText(pipes, SCRIPT, "inbound hook");
  if (pipes.indexOf("Orange until a real pipe answers") < 0) fail("pipes sheet copy drifted");
  if (pipes.indexOf("Owner still owns No") >= 0) fail("pipes sheet picked up hand-off copy");

  await queueCtx.openHandOff("job_xss");
  const hand = serialize(queueCtx.nodes["sheet-card"]);
  assertInert(hand, "hand-off sheet");
  assertEscapedText(hand, SCRIPT, "hand-off name");
  if (hand.indexOf("Owner still owns No") < 0) fail("hand-off sheet must keep Owner still owns No");
  if (/<script/i.test(hand)) fail("hand-off name broke out into a script tag");
}

function deskFallback() {
  const desk = fs.readFileSync(path.join(root, "desk.html"), "utf8");
  const start = desk.indexOf("function labelStatus(s)");
  const end = desk.indexOf("async function load()", start);
  if (start < 0 || end < 0) fail("desk.html card() not found");
  const ctx = sandbox();
  ctx.visitorLine = function (s) { return s || ""; };
  ctx.AIADesks = { stepNoun: function () { return "step"; } };
  ctx.NOUNS = {};
  vm.runInNewContext(desk.slice(start, end) + "\nthis.card = card;\n", ctx);
  const html = ctx.card(evil, false);
  assertInert(html, "desk.html card");
  assertEscapedText(html, IMG, "desk.html title");
  assertEscapedText(html, SCRIPT, "desk.html why");
  if (/onclick="kill\('[^']*',/.test(html)) fail("desk.html Stop must not take a title argument");
  const shown = ctx.card(photo, false);
  if (shown.indexOf("https://x.test/a.jpg") < 0) fail("desk.html must keep https photos");
  if (/\ssrc="https:\/\/x\.test\/a\.jpg">"/.test(shown)) fail("desk.html photo quote must not break the tag");
}

function openSheet() {
  const ctx = sandbox();
  ctx.role = "owner";
  ctx.FIELDS = [{ key: "note", label: IMG }];
  ctx.PEOPLE = [{ name: SCRIPT, role: "helper" }];
  ctx.JOBS = [Object.assign({}, evil, { custom: { note: SCRIPT, outcome: IMG } })];
  ctx.labelStatus = function (s) { return s || ""; };
  vm.runInNewContext(fs.readFileSync(path.join(root, "desk-html-view.js"), "utf8"), ctx);
  vm.runInNewContext(fs.readFileSync(path.join(root, "desk-card.js"), "utf8"), ctx);
  return ctx.openJob("job_xss").then(function () {
    const html = ctx.nodes["sheet-card"].innerHTML;
    assertInert(html, "open card");
    assertEscapedText(html, IMG, "open card title");
    assertEscapedText(html, SCRIPT, "open card draft");
    if (html.indexOf("https://x.test/slip.jpg") < 0) fail("open card must keep https files");
    if (html.indexOf("/api/upload?id=abc") < 0) fail("open card must keep upload paths");
    const files = ctx.filesHtml({ photoUrl: JSURL, files: [{ url: JSURL, name: IMG }] });
    assertInert(files || "<div></div>", "file row");
    if (files && /javascript\s*:/i.test(files)) fail("file row kept a javascript: url");
    const ok = ctx.filesHtml({ photoUrl: "https://x.test/slip.jpg", files: [{ url: "/api/upload?id=abc", name: IMG }] });
    if (!ok || ok.indexOf("https://x.test/slip.jpg") < 0 || ok.indexOf("/api/upload?id=abc") < 0) {
      fail("file row must keep https and upload paths");
    }
    assertEscapedText(ok, IMG, "file name");
  });
}

function packFace() {
  const ctx = sandbox();
  vm.runInNewContext(fs.readFileSync(path.join(root, "pack-card.js"), "utf8"), ctx);
  const html = ctx.AIAPackCard.viewHtml({ pack: "home", title: IMG, kind: SCRIPT, timing: SCRIPT });
  assertInert(html, "pack face");
  assertEscapedText(html, IMG, "pack title");
  assertEscapedText(html, SCRIPT, "pack kind");
}

const needsSrc = fs.readFileSync(path.join(root, "desk-needs.js"), "utf8");
if (needsSrc.indexOf("String(t.title") >= 0) fail("desk-needs still puts the title in a string");
if (!needsSrc.includes("<h3>\" + esc(j.title)")) fail("desk-needs must keep escaped titles");

sheets().then(function () {
  deskFallback();
  packFace();
  return openSheet();
}).then(function () {
  console.log("check-desk-xss: ok");
}).catch(function (err) {
  fail(err && err.stack ? err.stack : String(err));
});
