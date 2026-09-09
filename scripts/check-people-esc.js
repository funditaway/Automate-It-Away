#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const file = path.join(root, "people.js");
const src = fs.readFileSync(file, "utf8");

const syntax = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
if (syntax.status !== 0) {
  throw new Error("people.js must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
}

const start = src.indexOf("function esc(s)");
if (start < 0) throw new Error("people.js missing esc()");
const end = src.indexOf("\nfunction headers", start);
const fn = src.slice(start, end > start ? end : start + 400);
if (!/"&":\s*"&amp;"/.test(fn) || !/"<":\s*"&lt;"/.test(fn)) {
  throw new Error("people.js esc() does not encode & / <");
}
if (!/">":\s*"&gt;"/.test(fn) || !/"\\"":\s*"&quot;"/.test(fn)) {
  throw new Error("people.js esc() does not encode > / \"");
}
if (fn.includes("&#39;") === false) throw new Error("people.js esc() does not encode '");
if (/\s*"<":"<"/.test(fn) || /\s*"&":"&"/.test(fn) || /'"':\s*"""/.test(fn)) {
  throw new Error("people.js esc() is a no-op or invalid quote map");
}

const ctx = {};
vm.runInNewContext(fn + "; this.esc = esc;", ctx);
if (ctx.esc("2 < 3") !== "2 &lt; 3") throw new Error("esc must encode < in names");
if (ctx.esc("a & b") !== "a &amp; b") throw new Error("esc must encode &");
if (ctx.esc('"hi"') !== "&quot;hi&quot;") throw new Error("esc must encode \"");
if (ctx.esc("O'Brien") !== "O&#39;Brien") throw new Error("esc must encode '");

const html = fs.readFileSync(path.join(root, "people.html"), "utf8");
if (html.indexOf("people.js") < 0) throw new Error("people.html must load people.js");

console.log("check-people-esc: ok");
