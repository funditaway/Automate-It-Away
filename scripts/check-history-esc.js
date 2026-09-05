#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function extractEsc(src) {
  const m = src.match(/function esc\(s\)[\s\S]*?return String\(s[\s\S]*?\}\);/);
  if (!m) throw new Error("could not extract esc()");
  return m[0];
}

function mustEscape(src, label) {
  const fn = extractEsc(src);
  if (fn.includes('"&":"&amp;"') === false || fn.includes('"<":"&lt;"') === false) {
    throw new Error(label + " esc() does not encode & / <");
  }
  if (fn.includes('">":"&gt;"') === false || fn.includes('"\\"":"&quot;"') === false) {
    throw new Error(label + " esc() does not encode > / \"");
  }
  if (fn.includes("&#39;") === false) throw new Error(label + " esc() does not encode '");
  if (/\s*"<":"<"/.test(fn) || /\s*"&":"&"/.test(fn)) {
    throw new Error(label + " esc() is a no-op for < or &");
  }
}

const history = read("history.html");
const rules = read("rules.html");
mustEscape(history, "history.html");
mustEscape(rules, "rules.html");
if (!history.includes("esc(it.title)")) throw new Error("history must esc titles into innerHTML");
if (!rules.includes("esc(r.text)")) throw new Error("rules must esc rule text into innerHTML");

console.log("check-history-esc: ok");
