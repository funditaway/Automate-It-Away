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
  if (src.indexOf("You still tap Yes or Stop.") < 0) throw new Error(file + " draft-accounts must keep Yes or Stop");
  if (src.indexOf("cannot Send, Stop") >= 0 || src.indexOf("tap Send and Stop") >= 0) {
    throw new Error(file + " still paints Send as the HITL rail");
  }
});

const switchJs = read("desk-switch.js");
if (switchJs.indexOf("root.AIADesks") < 0) throw new Error("desk-switch.js must export AIADesks");
if (switchJs.indexOf("function open") < 0) throw new Error("desk-switch.js must open() a saved desk");

const conn = read("api/connections.js");
if (conn.indexOf("You still tap Yes or Stop.") < 0) throw new Error("connections next must keep Yes or Stop");
if (conn.indexOf("tap Send and Stop") >= 0) throw new Error("connections next still paints Send as the HITL rail");

const health = read("api/health.js");
if (health.indexOf("Yes and Stop stay on the desk") < 0) throw new Error("health Do must keep Yes and Stop");
if (health.indexOf("Send and Stop stay on the desk") >= 0) throw new Error("health Do still paints Send as the HITL rail");

const yesNo = read("ACCOUNT-YES-NO.md");
const packMd = read("PACK.md");
if (yesNo.indexOf("Pipes / Connections leftover") < 0) throw new Error("ACCOUNT-YES-NO must name Pipes leftover");
if (packMd.indexOf("Pipes / Connections leftover") < 0) throw new Error("PACK.md must name Pipes leftover");

console.log("check-pipes-switch: ok");
