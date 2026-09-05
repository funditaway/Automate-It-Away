#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "drop-preview.js"), "utf8");
const drop = fs.readFileSync(path.join(root, "drop.html"), "utf8");

const start = src.indexOf("function gateSend");
if (start < 0) throw new Error("drop-preview.js missing gateSend");
const end = src.indexOf("function wrapFetch", start);
const fn = src.slice(start, end > start ? end : start + 800);

if (fn.indexOf("stopImmediatePropagation") < 0) {
  throw new Error("gateSend must still stop a click that cannot send");
}
if (!/if\s*\(\s*card\.desk\s*&&\s*card\.title\s*\)\s*return/.test(fn)) {
  throw new Error("gateSend must let Drop it run when desk and title are set");
}
if (/if\s*\(\s*!miss\s*&&\s*card\.desk/.test(fn)) {
  throw new Error("gateSend must not block Drop it on preview missing() fields");
}
if (fn.indexOf("Say what you need") < 0 || fn.indexOf("Pick a desk above") < 0) {
  throw new Error("gateSend must show the same form error send() uses when it blocks");
}

const sendAt = drop.indexOf("async function send()");
const send = drop.slice(sendAt, drop.indexOf("function copyDropShare", sendAt));
if (send.indexOf("Say what you need") < 0) throw new Error("drop.html send() still title-gated");

console.log("check-drop-gate: ok");
