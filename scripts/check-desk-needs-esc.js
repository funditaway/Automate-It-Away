#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const file = path.join(root, "desk-needs.js");
const src = fs.readFileSync(file, "utf8");

function fail(msg) {
  throw new Error(msg);
}

const syntax = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
if (syntax.status !== 0) {
  fail("desk-needs.js must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
}

const start = src.indexOf("function esc(s)");
if (start < 0) fail("desk-needs.js missing esc()");
const end = src.indexOf("\n  function val", start);
const fn = src.slice(start, end > start ? end : start + 400);
if (!/"&":\s*"&amp;"/.test(fn) || !/"<":\s*"&lt;"/.test(fn)) {
  fail("desk-needs.js esc() does not encode & / <");
}
if (!/">":\s*"&gt;"/.test(fn) || !/"\\"":\s*"&quot;"/.test(fn)) {
  fail("desk-needs.js esc() does not encode > / \"");
}
if (fn.includes("&#39;") === false) fail("desk-needs.js esc() does not encode '");
if (/\s*"<":"<"/.test(fn) || /\s*"&":"&"/.test(fn)) {
  fail("desk-needs.js esc() is a no-op for < or &");
}

if (!src.includes("<h3>\" + esc(j.title)")) fail("queue card must esc titles into innerHTML");
if (!src.includes("esc(j.title)")) fail("cap band must esc titles into innerHTML");
if (/<h3>" \+ String\(j\.title/.test(src)) fail("titles must not paint with String(j.title)");
if (src.includes("<h3>\" + String(j.title")) fail("titles must not paint with String(j.title)");
if (src.includes("src=\\\"\" + j.photoUrl")) fail("photoUrl must be escaped in the thumb src");
if (src.includes("<p>\" + why +")) fail("why must be escaped on the queue card");
if (src.includes("draft\">\" + j.draft")) fail("draft must be escaped on the queue card");
if (src.includes("assignee ? \" · \" + j.assignee")) fail("assignee must be escaped on the queue card");
if (src.includes("next-line\\\">\" + (need.line") || src.includes("next-line\">\" + (need.line")) {
  fail("need line must be escaped on the queue card");
}

const ctx = {
  window: {},
  document: {
    readyState: "complete",
    addEventListener: function () {},
    getElementById: function () { return null; },
    createElement: function () { return { id: "", textContent: "" }; },
    head: { appendChild: function () {} }
  },
  setTimeout: function () {},
  localStorage: { getItem: function () { return ""; }, setItem: function () {} }
};
ctx.window = ctx;
vm.runInNewContext(src, ctx);
if (typeof ctx.esc !== "function") {
  const escCtx = {};
  vm.runInNewContext(fn + "; this.esc = esc;", escCtx);
  if (escCtx.esc("2 < 3") !== "2 &lt; 3") fail("esc must encode < in titles");
  if (escCtx.esc("a & b") !== "a &amp; b") fail("esc must encode &");
  if (escCtx.esc("\"hi\"") !== "&quot;hi&quot;") fail("esc must encode \"");
  if (escCtx.esc("O'Brien") !== "O&#39;Brien") fail("esc must encode '");
}
if (typeof ctx.card !== "function") fail("desk-needs.js must set window.card");

const html = ctx.card({
  id: "j1",
  status: "waiting",
  title: "Need 2 < 3 & \"go\"",
  why: "Buy <5 gallons",
  draft: "Don't use <b>html</b>",
  assignee: "Sam <helper>",
  photoUrl: "https://x.test/a.jpg\">"
}, false);

if (!html) fail("card() must return HTML");
if (/<h3>Need 2 < 3/.test(html)) fail("raw < in a title must not become markup");
if (html.indexOf("Need 2 &lt; 3 &amp; &quot;go&quot;") < 0) fail("title must stay text: 2 < 3 & \"go\"");
if (html.indexOf("Buy &lt;5 gallons") < 0) fail("why must stay text");
if (html.indexOf("Don&#39;t use &lt;b&gt;html&lt;/b&gt;") < 0) fail("draft must stay text");
if (html.indexOf("Sam &lt;helper&gt;") < 0) fail("assignee must stay text");
if (html.indexOf("src=\"https://x.test/a.jpg&quot;&gt;\"") < 0) fail("photoUrl quotes must not break the thumb");

const h3 = html.match(/<h3>(.*?)<\/h3>/);
if (!h3) fail("card must keep one title heading");
if (h3[1] !== "Need 2 &lt; 3 &amp; &quot;go&quot;") fail("painted h3 text must be one escaped title");

const nav = fs.readFileSync(path.join(root, "desk-nav.js"), "utf8");
if (nav.indexOf("desk-needs.js") < 0) fail("desk-nav.js must still load desk-needs.js");

console.log("check-desk-needs-esc: ok");
