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
  if (src.indexOf("input.full{flex:1 1 100%;min-width:100%}") < 0) {
    throw new Error(file + " must give search/webhook a full row so the placeholder is not clipped");
  }
  if (src.indexOf('id="q" class="full"') < 0) {
    throw new Error(file + " search field must use the full-row class");
  }
  if (src.indexOf('id="hook" class="full"') < 0) {
    throw new Error(file + " webhook field must use the full-row class");
  }
  if (src.indexOf('id="q"') >= 0 && /id="q"[^>]*min-width:180px/.test(src)) {
    throw new Error(file + " search field still uses the 180px min-width that clips the placeholder");
  }
  if (src.indexOf("aia-tip.js") < 0) throw new Error(file + " must load aia-tip.js");
  if (src.indexOf('data-aia-tip="pipes"') < 0) throw new Error(file + " must wire the pipes field tip");
  if (src.indexOf('data-aia-tip="desk-name"') < 0) throw new Error(file + " must wire the Desk name tip");
  if (src.indexOf('data-aia-tip="desk-code"') < 0) throw new Error(file + " must wire the Desk code tip");
  if (/if \(tok\) h\["X-Session"\] = tok;\s*else if \(pin\)/.test(src)) {
    throw new Error(file + " headers must still send the open-desk pin when a session token is present");
  }
  if (src.indexOf('if (tok) h["X-Session"] = tok') < 0) {
    throw new Error(file + " headers must send leftover X-Session so email-session owners can bind pipes");
  }
  if (src.indexOf('if (pin) h["X-Pin"] = pin') < 0) throw new Error(file + " headers must send X-Pin");
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
if (yesNo.indexOf("Pipes placeholder leftover") < 0) throw new Error("ACCOUNT-YES-NO must name Pipes placeholder leftover");
if (yesNo.indexOf("Pipes field tips leftover") < 0) throw new Error("ACCOUNT-YES-NO must name Pipes field tips leftover");
if (yesNo.indexOf("Desk session leftover after that pass") < 0) throw new Error("ACCOUNT-YES-NO must name Desk session leftover");
if (packMd.indexOf("Pipes / Connections leftover") < 0) throw new Error("PACK.md must name Pipes leftover");
if (packMd.indexOf("Pipes placeholder leftover") < 0) throw new Error("PACK.md must name Pipes placeholder leftover");
if (packMd.indexOf("Pipes field tips leftover") < 0) throw new Error("PACK.md must name Pipes field tips leftover");
if (packMd.indexOf("Desk session leftover:") < 0) throw new Error("PACK.md must name Desk session leftover");

console.log("check-pipes-switch: ok");
