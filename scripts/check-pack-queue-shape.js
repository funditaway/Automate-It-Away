#!/usr/bin/env node
"use strict";
require("./_env-guard");

const fs = require("fs");
const path = require("path");
const os = require("os");
const vm = require("vm");

const root = path.join(__dirname, "..");
const store = path.join(os.tmpdir(), "aia-pack-shape-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const engine = require("../api/_engine");
const { qualifyJob, detectPack } = engine;

const vitaFile = JSON.parse(read("packs/vita.json"));

const insShop = {
  slug: "oddo-ins",
  pack: "vita",
  packName: "Insurance",
  packFace: vitaFile.face,
  packQueue: vitaFile.queue,
  rules: vitaFile.rules
};
const insCard = qualifyJob({
  title: "Friday pickup",
  notes: "Need a ride Friday",
  contactName: "Pat"
}, insShop);
if (insCard.pack !== "vita") fail("installed Insurance desk must stamp pack vita, got " + insCard.pack);
else pass("installed Insurance desk stamps vita without a Drop pack pick");
if (insCard.packName !== "Insurance") fail("packName must stay Insurance, got " + insCard.packName);
else pass("Insurance packName stays Insurance");
if (!insCard.custom || !insCard.custom.face) fail("qualify must stamp custom.face");
else pass("qualify stamps custom.face");
if (insCard.custom.face.who !== "Pat") fail("face.who should be Pat, got " + (insCard.custom.face && insCard.custom.face.who));
else pass("Insurance face.who from Drop contactName");
if (!/Friday pickup/i.test(insCard.custom.face.what || "")) fail("face.what should keep the title");
else pass("Insurance face.what from title");
if (!/Bind stays off/i.test(insCard.custom.face.how || "")) fail("face.how must be the Insurance pack how");
else pass("Insurance face.how from pack");
if (/vita/i.test(JSON.stringify(insCard.custom.face) + insCard.packName + (insCard.draft || ""))) {
  fail("Vita leaked onto the shaped card");
} else pass("no Vita leak on shaped Insurance card");
if (/On the Home desk/i.test(insCard.draft || "")) fail("Insurance drop must not fall through to Home draft");
else pass("Insurance drop does not use Home draft");

const family = {
  slug: "family-lane",
  pack: "springfield-shop",
  packName: "Family lane",
  packFace: {
    who: { key: "contactName", label: "Who it is for" },
    what: { key: "need", label: "What they need" },
    when: { key: "timing", label: "When" },
    where: { key: "where", label: "Where" },
    how: "Draft the chore. You tap Yes or Stop. Collect stays HOLD."
  },
  packQueue: { badge: "Family lane", family: "Home", never: ["send", "stop", "pay"] },
  rules: [{ text: "Cap same-day cards.", when: "qualify", then: "cap", contains: "same-day" }]
};
const groc = qualifyJob({
  title: "Grocery run",
  notes: "family school pickup same-day",
  contactName: "Sam",
  timing: "Friday 3pm"
}, family);
if (groc.pack !== "springfield-shop") fail("creator pack must keep springfield-shop, got " + groc.pack);
else pass("creator pack is not stolen by Home text guess");
if (groc.packName !== "Family lane") fail("creator packName must stay Family lane, got " + groc.packName);
else pass("creator packName stays Family lane");
if ((groc.custom.face && groc.custom.face.who) !== "Sam") fail("creator face.who should be Sam");
else pass("creator face.who from contactName");
if (!/Grocery run/i.test((groc.custom.face && groc.custom.face.what) || "")) fail("creator face.what should keep Grocery run");
else pass("creator face.what from title");
if ((groc.custom.face && groc.custom.face.when) !== "Friday 3pm") fail("creator face.when should keep timing");
else pass("creator face.when from timing");
if (!/Collect stays HOLD/i.test((groc.custom.face && groc.custom.face.how) || "")) fail("creator face.how must keep Collect HOLD");
else pass("creator face.how keeps Collect HOLD");
if (/On the Home desk/i.test(groc.draft || groc.next || "")) fail("creator pack must not draft On the Home desk");
else pass("creator pack does not fall through to Home draft");
if (!groc.cap) fail("installed pack rules must still Cap same-day");
else pass("installed pack rules still Cap same-day");
if (/vita/i.test(JSON.stringify(groc))) fail("creator card invented Vita");
else pass("creator card has no Vita");

const empty = qualifyJob({ title: "School pickup", notes: "family school form" }, { slug: "empty-desk", rules: [] });
if (empty.pack !== "home") fail("empty desk should still guess home, got " + empty.pack);
else pass("empty desk still text-detects home");

const explicit = qualifyJob({ title: "Oak dresser", notes: "list the dresser", pack: "consign" }, insShop);
if (explicit.pack !== "consign") fail("explicit Drop pack must still win, got " + explicit.pack);
else pass("explicit Drop pack still wins over installed pack");

if (detectPack({ title: "Need a life quote in Missouri", notes: "missed call, illustration later" }) !== "vita") {
  fail("no-desk detectPack insurance words still vita");
} else pass("no-desk detectPack insurance words still vita");

const packsSrc = read("api/_packs.js");
if (packsSrc.indexOf("shop.packFace") < 0) fail("_packs.js must persist shop.packFace");
else pass("_packs.js persists shop.packFace");
if (packsSrc.indexOf("clipPackFace") < 0 || packsSrc.indexOf("face: clipPackFace(body.face)") < 0) {
  fail("normalizeCreatorPack must keep .aia face");
} else pass("install-aia keeps creator face");
if (packsSrc.indexOf("typeof pack.face === \"string\"") < 0) fail("packName must not stringify a face object");
else pass("packName does not stringify a face object");

const authSrc = read("api/auth.js");
if (authSrc.indexOf("pack: row.pack") < 0 || authSrc.indexOf("packName: row.packName") < 0) {
  fail("publicWorkspace must expose installed pack so Drop can skip the picker");
} else pass("publicWorkspace exposes installed pack");

const drop = read("drop.html");
const widget = read("widget.html");
const agent = read("drop-agent.js");
const app = read("drop-app.js");
const nav = read("desk-nav.js");

// 1ec1382 moved the pack picker and honesty hint out of drop.html /
// widget.html into drop-agent.js. fff3b47 shortened the always-visible
// #drop-sub line (parked the longer "already uses that pack" sentence
// there). The painted meaning is still on Drop: #drop-sub names the pack
// as on this desk, #action-hint next to the picker says the queue card
// already uses that pack / you don't pick each time, and #drop-pack hides.
// Assert that behaviour and meaning, not the old drop.html strings or the
// parked #drop-sub copy.

function packShapeSourceFaults(agentSrc, appSrc) {
  const bad = [];
  if (agentSrc.indexOf("function applyInstalledPack") < 0) bad.push("missing applyInstalledPack");
  if (agentSrc.indexOf("sel.hidden = on") < 0) bad.push("installed pack does not hide the pack select");
  if (agentSrc.indexOf("action-hint") < 0) bad.push("missing action-hint");
  if (!/already uses that pack|don't pick a pack|do not pick a pack/.test(agentSrc)) {
    bad.push("hint no longer says the pack already shapes the card / you don't pick each time");
  }
  if (appSrc.indexOf("applyInstalledPack") < 0) bad.push("drop-app does not call applyInstalledPack");
  if (appSrc.indexOf("drop-sub") < 0 || appSrc.indexOf("is on this desk") < 0) {
    bad.push("drop-sub no longer names the installed pack as on this desk");
  }
  if (appSrc.indexOf("shop.pack") < 0) bad.push("drop-app does not read shop.pack");
  return bad;
}

function packHintMeaningFaults(text, packName) {
  const s = String(text || "");
  const bad = [];
  if (packName && s.indexOf(packName) < 0) bad.push("hint does not name " + packName);
  if (s.indexOf("on this desk") < 0) bad.push("hint does not say the pack is on this desk");
  if (!/already uses that pack|don't pick a pack|do not pick a pack/.test(s)) {
    bad.push("hint does not say the pack already shapes the card");
  }
  return bad;
}

function paintApplyInstalledPack(agentSrc, pack) {
  const els = {};
  function el(id, tag) {
    els[id] = { id: id, tagName: tag, hidden: false, value: "", textContent: "", previousElementSibling: null };
    return els[id];
  }
  const sel = el("drop-pack", "SELECT");
  const lab = el("pack-lab", "LABEL");
  lab.textContent = "Pack";
  sel.previousElementSibling = lab;
  el("action-hint", "P").textContent = "Tap what a Desk AI should draft after this lands.";
  const ctx = {
    window: {},
    document: {
      readyState: "complete",
      addEventListener: function () {},
      getElementById: function (id) { return els[id] || null; },
      createElement: function () { return { id: "", style: {}, textContent: "", innerHTML: "", className: "", classList: { add: function () {}, contains: function () { return false; } } }; },
      body: { classList: { contains: function () { return false; } } },
      head: { appendChild: function () {} }
    },
    localStorage: { getItem: function (k) { return (k === "aia_ws" || k === "aia_session") ? "oddo-ins" : ""; }, setItem: function () {} },
    location: { search: "", pathname: "/drop", href: "http://127.0.0.1/drop" },
    fetch: function () { return Promise.resolve({ json: function () { return Promise.resolve({}); } }); },
    setTimeout: function () {},
    URLSearchParams: URLSearchParams,
    console: { log: function () {}, warn: function () {}, error: function () {} }
  };
  ctx.window = ctx;
  ctx.parent = ctx;
  ctx.AIADesks = { shopOpen: function () { return true; } };
  try { vm.runInNewContext(agentSrc, ctx); } catch (e) {
    return { err: String(e && e.message || e), els: els, sel: sel, lab: lab };
  }
  const api = ctx.window.AIADropAgent || ctx.AIADropAgent;
  if (!api || typeof api.applyInstalledPack !== "function") {
    return { err: "AIADropAgent.applyInstalledPack missing", els: els, sel: sel, lab: lab };
  }
  api.applyInstalledPack(pack);
  return {
    hint: els["action-hint"].textContent,
    packHidden: !!sel.hidden,
    labelHidden: !!lab.hidden,
    els: els, sel: sel, lab: lab
  };
}

(function () {
  const bad = packShapeSourceFaults(agent, app);
  if (bad.length) fail("Drop source must still tell people an installed pack shapes the card: " + bad.join("; "));
  else pass("Drop source still names the installed pack and hides the picker");
})();

[drop, widget].forEach(function (src, i) {
  const label = i ? "widget.html" : "drop.html";
  if (src.indexOf("drop-agent.js") < 0) fail(label + " must load drop-agent.js");
  else pass(label + " loads drop-agent.js");
  const sendAt = src.indexOf("async function send()");
  const sendEnd = src.indexOf("function copyDropShare", sendAt);
  const send = sendAt >= 0 && sendEnd > sendAt ? src.slice(sendAt, sendEnd) : src;
  if (/item\.pack\s*=/.test(send) || /pack:\s*document/.test(send)) fail(label + " send() must not require a pack pick");
  else pass(label + " send() does not require a pack pick");
});
if (app.indexOf("drop-agent.js") < 0 && drop.indexOf("drop-agent.js") >= 0) pass("drop-app relies on AIADropAgent from drop-agent.js");
const hintPaint = paintApplyInstalledPack(agent, { id: "vita", name: "Insurance" });
if (hintPaint.err) fail("applyInstalledPack must run: " + hintPaint.err);
else {
  const bad = packHintMeaningFaults(hintPaint.hint, "Insurance");
  if (bad.length) fail("installed-pack hint must say the pack already shapes the card: " + bad.join("; ") + " (got " + hintPaint.hint + ")");
  else pass("installed-pack hint names Insurance and says the card already uses that pack");
  if (!hintPaint.packHidden) fail("Advanced pack select must hide when a pack is installed");
  else pass("Advanced pack select hides when a pack is installed");
  if (!hintPaint.labelHidden) fail("Pack label must hide when a pack is installed");
  else pass("Pack label hides when a pack is installed");
}
const paintedOff = paintApplyInstalledPack(agent, null);
if (paintedOff.err) fail("applyInstalledPack(null) must run: " + paintedOff.err);
else if (paintedOff.packHidden) fail("pack select must stay visible when no pack is installed");
else pass("pack select stays visible when no pack is installed");
if (nav.indexOf("drop-pack.js") >= 0) fail("desk-nav must not load the marketplace pack picker on Drop");
else pass("Drop does not load marketplace pack picker");

const cardSrc = read("pack-card.js");
if (cardSrc.indexOf("return FACES[s] ? s : \"\"") >= 0) fail("pack-card packId must keep creator pack ids");
else pass("pack-card packId keeps creator pack ids");
if (cardSrc.indexOf("custom.face") < 0) fail("pack-card must paint stored custom.face");
else pass("pack-card paints stored custom.face");

const ctx = {
  window: {},
  document: {
    readyState: "complete",
    addEventListener: function () {},
    getElementById: function () { return null; },
    createElement: function () { return { id: "", textContent: "", style: {} }; },
    head: { appendChild: function () {} }
  },
  setTimeout: function () {}
};
ctx.window = ctx;
vm.runInNewContext(cardSrc, ctx);
if (!ctx.AIAPackCard || typeof ctx.AIAPackCard.faceOf !== "function") fail("pack-card.js must export faceOf");
else pass("pack-card faceOf runs");
const painted = ctx.AIAPackCard.queueLine(groc);
if (!/Family lane/.test(painted || "")) fail("queue line must show Family lane, got " + painted);
else pass("queue line shows creator pack badge");
const insLine = ctx.AIAPackCard.queueLine(insCard);
if (!/Insurance/.test(insLine || "")) fail("queue line must show Insurance, got " + insLine);
else pass("queue line shows Insurance badge");
if (/vita/i.test(insLine || "")) fail("queue line leaked Vita");
else pass("queue line has no Vita");

const help = read("help.html");
const yesNo = read("ACCOUNT-YES-NO.md");
const packMd = read("PACK.md");
const dropMd = read("DROP.md");
const studio = read("developer.html");
const studioJs = read("developer.js");
const more = read("more.html");
const pkg = read("package.json");
if (help.indexOf("Installed packs auto-shape") < 0) fail("help#desk-cards must name auto-shape");
else pass("help names auto-shape");
if (help.indexOf("You do not pick a pack on every Drop") < 0) fail("help must say no pack pick on every Drop");
else pass("help says no pack pick on every Drop");
if (yesNo.indexOf("check-pack-queue-shape.js") < 0) fail("ACCOUNT-YES-NO must record this beat");
else pass("ACCOUNT-YES-NO records pack queue shape");
if (packMd.indexOf("Qualify stamps `pack` + `custom.face`") < 0) fail("PACK.md must stamp face on Qualify, not Drop pick");
else pass("PACK.md stamps face on Qualify");
if (dropMd.indexOf("auto-shapes the queue card") < 0) fail("DROP.md must name auto-shape");
else pass("DROP.md names auto-shape");
if (studio.indexOf("you do not pick a pack on every Drop") < 0 && studio.indexOf("Installed packs auto-shape") < 0) {
  fail("Studio html missing skip-pick");
} else pass("Studio html skip-pick");
// 30ec2ec moved Studio skip-pick honesty into developer.html (visible).
// Do not require the sentence to live in developer.js.
if (studio.indexOf("you do not pick a pack on every Drop") < 0 && studioJs.indexOf("you do not pick a pack on every Drop") < 0) {
  fail("Studio must still say you do not pick a pack on every Drop");
} else pass("Studio still says you do not pick a pack on every Drop");
if (more.indexOf("no pack pick on every Drop") < 0) fail("more.html missing skip-pick");
else pass("more.html skip-pick");
if (pkg.indexOf("check-pack-queue-shape.js") < 0) fail("package.json must run check-pack-queue-shape");
else pass("package.json runs check-pack-queue-shape");

const deskCards = help.slice(help.indexOf('id="desk-cards"'), help.indexOf("Something broke?"));
const shapeBits = [deskCards, drop, widget, agent, studio, studioJs, more].join("\n");
if (/credits metering|buy packs with fake credits|AIA coin|custodial wallet|on-chain pack market/i.test(shapeBits)) {
  fail("auto-shape copy invented a blocked product");
} else pass("auto-shape copy stays on-desk");

const homeFace = JSON.parse(read("packs/home.json")).face;
const consignFace = JSON.parse(read("packs/consign.json")).face;
const fundFace = JSON.parse(read("packs/fund.json")).face;
const landFace = JSON.parse(read("packs/land.json")).face;
if (!homeFace || !consignFace || !fundFace || !landFace) fail("official packs must carry a face");
else pass("home/consign/fund/land carry face");

try {
  if (fs.existsSync(store)) fs.unlinkSync(store);
} catch (e) {}

function swap(str, from, to) { return str.indexOf(from) < 0 ? null : str.split(from).join(to); }

const MUTANTS = [
  ["Drop removes the pack-shapes line", function () {
    const n = swap(agent, "Drop anything — the queue card already uses that pack. You don't pick a pack each time. ", "");
    if (!n) return null;
    const painted = paintApplyInstalledPack(n, { id: "vita", name: "Insurance" });
    if (painted.err) return ["could not re-paint: " + painted.err];
    return packHintMeaningFaults(painted.hint, "Insurance");
  }],
  ["drop-sub no longer names the pack as on this desk", function () {
    const n = swap(app, "is on this desk", "is available");
    return n ? packShapeSourceFaults(agent, n) : null;
  }],
  ["applyInstalledPack no longer hides the pack select", function () {
    const n = swap(agent, "sel.hidden = on", "sel.hidden = false");
    if (!n) return null;
    const painted = paintApplyInstalledPack(n, { id: "vita", name: "Insurance" });
    if (painted.err) return ["could not re-paint: " + painted.err];
    const bad = [];
    if (!painted.packHidden) bad.push("pack select stayed visible");
    return bad;
  }],
  ["drop-agent loses applyInstalledPack", function () {
    const n = swap(agent, "function applyInstalledPack", "function applyInstalledOff");
    return n ? packShapeSourceFaults(n, app) : null;
  }],
  ["drop-app stops calling applyInstalledPack", function () {
    const n = swap(app, "applyInstalledPack", "applyInstalledOff");
    return n ? packShapeSourceFaults(agent, n) : null;
  }],
  ["queue line drops the pack badge name", function () {
    const n = swap(cardSrc, "var bits = [face.name];", "var bits = [];");
    if (!n) return null;
    const c = {
      window: {},
      document: {
        readyState: "complete",
        addEventListener: function () {},
        getElementById: function () { return null; },
        createElement: function () { return { id: "", textContent: "", style: {} }; },
        head: { appendChild: function () {} }
      },
      setTimeout: function () {}
    };
    c.window = c;
    try { vm.runInNewContext(n, c); } catch (e) { return ["threw " + e.message]; }
    if (!c.AIAPackCard || typeof c.AIAPackCard.queueLine !== "function") return ["queueLine missing"];
    const line = c.AIAPackCard.queueLine(groc);
    const bad = [];
    if (!/Family lane/.test(line || "")) bad.push("queue line lost Family lane, got " + line);
    return bad;
  }],
  ["help drops auto-shape / no pack pick honesty", function () {
    const n = swap(help, "Installed packs auto-shape", "Installed packs sit unused");
    if (!n) return null;
    const bad = [];
    if (n.indexOf("Installed packs auto-shape") < 0) bad.push("help no longer names auto-shape");
    return bad;
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
  console.error("check-pack-queue-shape failed");
  process.exit(1);
}
console.log("check-pack-queue-shape mutants: " + mutCaught + "/" + MUTANTS.length + " caught");
console.log("check-pack-queue-shape: ok");
