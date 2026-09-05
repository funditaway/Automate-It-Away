#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function pickDesk(src, label) {
  const start = src.indexOf("function pickDesk");
  if (start < 0) throw new Error(label + " missing pickDesk");
  const end = src.indexOf("\n    async function", start);
  return src.slice(start, end > start ? end : start + 600);
}

["pipes.html", "connections.html"].forEach(function (file) {
  const src = read(file);
  const fn = pickDesk(src, file);
  if (fn.indexOf("AIADesks.open") < 0) throw new Error(file + " pickDesk must AIADesks.open");
  if (/AIADeskSwitch\.open/.test(fn)) throw new Error(file + " pickDesk still calls missing AIADeskSwitch.open");
  if (src.indexOf("AIADesks.list") < 0) throw new Error(file + " must list saved desks via AIADesks");
});

const switchJs = read("desk-switch.js");
if (switchJs.indexOf("root.AIADesks") < 0) throw new Error("desk-switch.js must export AIADesks");
if (switchJs.indexOf("function open") < 0) throw new Error("desk-switch.js must open() a saved desk");

console.log("check-pipes-switch: ok");
