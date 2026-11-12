#!/usr/bin/env node
"use strict";
require("./_env-guard");

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const vm = require("vm");

const root = path.join(__dirname, "..");

let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

["desk-needs.js", "desk-card.js"].forEach(function (name) {
  const syntax = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
  if (syntax.status !== 0) fail(name + " must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
  else pass(name + " parses");
});

const needs = read("desk-needs.js");
const card = read("desk-card.js");
const help = read("help.html");
const more = read("more.html");
const moreTips = more + "\n" + read("aia-tip.js");
const yesNo = read("ACCOUNT-YES-NO.md");
const packMd = read("PACK.md");
const pkg = read("package.json");

// a2ad8c4 (#265) minified desk-needs.js. Names like capCardHtml / promptHtml /
// namedNeedsWho / chipsHtml / goneHoldLabel / loadCap were shortened.
// window.capCardHtml, window.promptHtml, and window.loadCap still paint a gone
// Cap face and still read leftover aia_session. Do not require the doubled
// "not on this desk" line or the "Gone bind HOLDs." picker jargon — those are
// parked for a later copy pass. Guard behaviour and exports, not minified names.
["not on this desk", "thenAiGone", "window.capCardHtml", "window.promptHtml", "window.loadCap", 'localStorage.getItem("aia_session")', "q-prompt-who", "q-prompt-q", "q-need", "q-ai-gone"].forEach(function (bit) {
  if (needs.indexOf(bit) < 0) fail("desk-needs.js missing " + bit);
  else pass("desk-needs.js " + bit);
});
function capPromptGoneSourceFaults(src) {
  const bad = [];
  if (src.indexOf("not on this desk") < 0) bad.push("missing not on this desk");
  if (src.indexOf("thenAiGone") < 0) bad.push("missing thenAiGone");
  if (src.indexOf("window.capCardHtml") < 0) bad.push("missing window.capCardHtml");
  if (src.indexOf("window.promptHtml") < 0) bad.push("missing window.promptHtml");
  if (src.indexOf("window.loadCap") < 0) bad.push("missing window.loadCap");
  if (src.indexOf('localStorage.getItem("aia_session")') < 0) bad.push("missing leftover aia_session");
  if (src.indexOf("q-prompt-who") < 0) bad.push("missing q-prompt-who");
  if (src.indexOf("q-prompt-q") < 0) bad.push("missing q-prompt-q");
  if (src.indexOf("q-need") < 0) bad.push("missing q-need");
  if (src.indexOf("q-ai-gone") < 0) bad.push("missing q-ai-gone");
  return bad;
}
(function () {
  const bad = capPromptGoneSourceFaults(needs);
  if (bad.length) fail("gone Cap prompt HOLD must stay in desk-needs.js: " + bad.join("; "));
  else pass("gone Cap prompt HOLD still lives in desk-needs.js");
})();
["function sheetPromptHtml", "function sheetChipsHtml", "function namedNeedsWhoOf", "function threadSheetHtml", "not on this desk"].forEach(function (bit) {
  if (card.indexOf(bit) < 0) fail("desk-card.js missing " + bit);
  else pass("desk-card.js " + bit);
});
if (yesNo.indexOf("Cap leftover session after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Cap leftover session");
} else pass("ACCOUNT-YES-NO names Cap leftover session");
if (packMd.indexOf("Cap leftover session:") < 0) {
  fail("PACK.md must name Cap leftover session");
} else pass("PACK.md names Cap leftover session");
if (yesNo.indexOf("Did not invent Cap greenfield") < 0 && packMd.indexOf("Did not invent Cap greenfield") < 0) {
  fail("canon must deny Cap greenfield invent");
} else pass("canon denies Cap greenfield invent");

const sheetSrc = card.slice(card.indexOf("function sheetPromptHtml"), card.indexOf("function talkLabelOf"));
if (sheetSrc.indexOf("namedNeedsWhoOf") < 0 && sheetSrc.indexOf("promptHtml") < 0) {
  fail("sheetPromptHtml must share namedNeedsWho / promptHtml");
} else pass("sheetPromptHtml shares gone ask-who helpers");
if (sheetSrc.indexOf("esc(label)") < 0 && sheetSrc.indexOf("esc(q)") < 0 && card.indexOf("esc(label)") < 0) {
  fail("Open-job prompt must escape ask-who");
} else pass("Open-job prompt escapes ask-who");

const threadSrc = card.slice(card.indexOf("function threadSheetHtml"), card.indexOf("function jobBy"));
if (threadSrc.indexOf("sheetPromptHtml") < 0) fail("threadSheetHtml must insert sheetPromptHtml");
else pass("threadSheetHtml inserts sheetPromptHtml");
if (threadSrc.indexOf("sheetChipsHtml") < 0) fail("threadSheetHtml must insert sheetChipsHtml");
else pass("threadSheetHtml inserts sheetChipsHtml");

if (/oauth|spacex|login\.x\.ai|custodial wallet|Collect charge|silent send/i.test(needs + card)) {
  fail("Cap / Open prompt invented Grok OAuth / wallet / Collect charge");
} else pass("no OAuth / wallet / Collect charge");
if (help.indexOf("Cap cards and Open") < 0 || help.indexOf("prompt ask-who") < 0) {
  fail("help#desk-cards must name Cap / Open prompt ask-who HOLD");
} else pass("help names Cap / Open prompt ask-who HOLD");
// a66b146 shortened more-queue. Gone-AI honesty stays as:
// "If a named desk AI is not on this desk, the card says so."
function moreQueueCapFaults(src) {
  const bad = [];
  if (src.indexOf("If a named desk AI is not on this desk, the card says so.") < 0) {
    bad.push("missing gone-AI honesty");
  }
  return bad;
}
(function () {
  const bad = moreQueueCapFaults(moreTips);
  if (bad.length) fail("more Queue tip must stay honest about Cap / Open gone prompt: " + bad.join("; "));
  else pass("more Queue tip names gone-AI honesty");
})();
if (more.indexOf('data-aia-tip="more-queue"') < 0) fail("more.html must wire more-queue tip");
else pass("more.html wires more-queue tip");
if (yesNo.indexOf("check-cap-prompt-gone.js") < 0) fail("ACCOUNT-YES-NO must record Cap / Open prompt gone HOLD");
else pass("ACCOUNT-YES-NO records Cap / Open prompt gone HOLD");
if (pkg.indexOf("check-cap-prompt-gone.js") < 0) fail("package.json must run check-cap-prompt-gone");
else pass("package.json runs check-cap-prompt-gone");

function baseCtx() {
  const ctx = {
    window: {},
    document: {
      readyState: "complete",
      addEventListener: function () {},
      getElementById: function () { return null; },
      createElement: function () { return { id: "", textContent: "", className: "", type: "" }; },
      head: { appendChild: function () {} }
    },
    setTimeout: function () {},
    localStorage: { getItem: function () { return ""; }, setItem: function () {} },
    JOBS: [],
    FIELDS: [],
    PEOPLE: [],
    role: "owner",
    esc: function (s) {
      return String(s || "").replace(/[&<>"']/g, function (c) {
        return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
      });
    },
    visitorLine: function (s) { return s || ""; },
    labelStatus: function (s) { return s || ""; }
  };
  ctx.window = ctx;
  return ctx;
}

function paintCtx() {
  const ctx = baseCtx();
  vm.runInNewContext(needs, ctx);
  vm.runInNewContext(card, ctx);
  ctx.AIADeskAis = {
    rows: [{ name: "James’s AI", does: "Draft the lead packet", prompt: "Ask who it is for and when. Do not send." }],
    primary: function () { return this.rows[0]; }
  };
  return ctx;
}

const ctx = paintCtx();
if (typeof ctx.card !== "function") fail("desk-needs.js must set window.card");
else pass("card() is on window");
if (typeof ctx.capCardHtml !== "function") fail("desk-needs.js must set window.capCardHtml");
else pass("capCardHtml() is on window");
if (typeof ctx.promptHtml !== "function") fail("desk-needs.js must set window.promptHtml");
else pass("promptHtml() is on window");
if (typeof ctx.loadCap !== "function") fail("desk-needs.js must set window.loadCap");
else pass("loadCap() is on window");
if (typeof ctx.threadSheetHtml !== "function") fail("desk-card.js must set threadSheetHtml");
else pass("threadSheetHtml() is on window");

function promptWho(html) {
  const m = String(html || "").match(/<div class="q-prompt-who">([\s\S]*?)<\/div>/);
  return m ? m[1] : "";
}
function promptQ(html) {
  const m = String(html || "").match(/<p class="q-prompt-q">([\s\S]*?)<\/p>/);
  return m ? m[1] : "";
}
function needChip(html) {
  const m = String(html || "").match(/<span class="q-chip q-need">([\s\S]*?)<\/span>/);
  return m ? m[1] : "";
}
function goneChip(html) {
  const m = String(html || "").match(/<span class="q-chip q-ai-gone">([\s\S]*?)<\/span>/);
  return m ? m[1] : "";
}
function unesc(s) {
  return String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// Behaviour only: the gone AI is named and marked not on this desk on a face
// surface (gone chip, Needs you chip, or prompt-who). Do not require the
// exact "Name · not on this desk" compound, do not require that line to be
// duplicated on the question, and do not require "Gone bind HOLDs."
function capPromptGonePaintFaults(html, name) {
  name = name || "Shop Bot";
  const bad = [];
  if (!html) { bad.push("no card html"); return bad; }
  if (html.indexOf("q-prompt") < 0) bad.push("missing prompt reply");
  if (html.indexOf("q-ai-gone") < 0) bad.push("missing q-ai-gone");
  const who = unesc(promptWho(html));
  const chip = unesc(needChip(html));
  const gone = unesc(goneChip(html));
  const faces = [who, chip, gone];
  const named = faces.some(function (t) { return t.indexOf(name) >= 0; });
  const marked = faces.some(function (t) { return t.indexOf("not on this desk") >= 0; });
  if (!named) bad.push("gone AI not named on the face");
  if (!marked) bad.push("missing not on this desk mark");
  if (who === "Needs you") bad.push("prompt-who stayed anonymous");
  if (chip === "Needs you") bad.push("Needs you chip stayed anonymous");
  if (/James/.test(who) || /James/.test(chip)) bad.push("stamped James");
  return bad;
}

const goneJob = {
  id: "j-gone-prompt",
  status: "waiting",
  title: "Oak dresser",
  waitingOn: "person",
  thenAiGone: { id: "shop-bot", name: "Shop Bot" }
};

const goneQueue = ctx.card(goneJob, false);
const goneCap = ctx.capCardHtml(goneJob, "shop");
const goneOpen = ctx.threadSheetHtml(goneJob);

["Queue", "Cap", "Open"].forEach(function (where, i) {
  const html = [goneQueue, goneCap, goneOpen][i];
  const bad = capPromptGonePaintFaults(html, "Shop Bot");
  if (bad.length) fail(where + " gone prompt must name the gone AI and mark not on this desk: " + bad.join("; "));
  else pass(where + " gone prompt names Shop Bot and marks not on this desk");
  if (promptQ(html).indexOf("The desk AI asked") >= 0) fail(where + " gone prompt must not say The desk AI asked");
  else pass(where + " gone prompt does not say The desk AI asked");
});
if (promptWho(goneQueue) !== promptWho(goneCap) || promptWho(goneQueue) !== promptWho(goneOpen)) {
  fail("Cap / Open prompt-who must match Queue, got " + [promptWho(goneQueue), promptWho(goneCap), promptWho(goneOpen)].join(" | "));
} else pass("Cap / Open prompt-who match Queue");
if (needChip(goneQueue) !== needChip(goneCap) || needChip(goneQueue) !== needChip(goneOpen)) {
  fail("Cap / Open Needs you must match Queue, got " + [needChip(goneQueue), needChip(goneCap), needChip(goneOpen)].join(" | "));
} else pass("Cap / Open Needs you match Queue");

if (goneCap.indexOf(">Yes<") >= 0) fail("Cap gone-prompt card must not show a Yes tap");
else pass("Cap gone-prompt has no Yes tap");
if (goneCap.indexOf("q-reply") < 0 && goneCap.indexOf(">Reply<") < 0) fail("Cap must keep a draft Reply");
else pass("Cap keeps draft Reply");
if (goneCap.indexOf("Nothing sent alone") < 0) fail("Cap must stay draft-only");
else pass("Cap stays draft-only");
if (goneQueue.indexOf(">Yes<") < 0 || goneQueue.indexOf(">Kill<") < 0) fail("Yes / Stop / Kill must stay on Queue");
else pass("Yes / Stop / Kill stay on Queue");

const capOther = ctx.capCardHtml(Object.assign({}, goneJob, { slug: "other-desk", desk: "Other desk" }), "shop");
(function () {
  const bad = capPromptGonePaintFaults(capOther, "Shop Bot");
  if (bad.length) fail("other-desk Cap must still name the gone AI: " + bad.join("; "));
  else if (capOther.indexOf("q-reply-box") >= 0) fail("other-desk Cap must stay read-only");
  else if (/>Yes</.test(capOther)) fail("other-desk Cap must not show Yes");
  else pass("other-desk Cap still names the gone AI and stays read-only");
})();

const xssJob = {
  id: "j-gone-xss",
  status: "waiting",
  title: "Need 2 < 3",
  waitingOn: "person",
  thenAiGone: { id: "shop-bot", name: "Shop Bot <gone>" }
};
const xssCap = ctx.capCardHtml(xssJob, "shop");
const xssOpen = ctx.threadSheetHtml(xssJob);
["Cap", "Open"].forEach(function (where, i) {
  const html = [xssCap, xssOpen][i];
  if (html.indexOf("Shop Bot <gone>") >= 0) fail(where + " raw < in gone prompt name must not become markup");
  else if (html.indexOf("Shop Bot &lt;gone&gt;") < 0) fail(where + " gone prompt name must stay text");
  else pass(where + " gone prompt name stays text");
  const bad = capPromptGonePaintFaults(html, "Shop Bot <gone>");
  if (bad.length) fail(where + " gone xss prompt must name the escaped bind and mark not on this desk: " + bad.join("; "));
  else pass(where + " gone xss prompt names the escaped bind and marks not on this desk");
});
if (xssCap.indexOf("Need 2 &lt; 3") < 0) fail("Cap gone title must stay text");
else pass("Cap gone title stays text");
if (xssCap.indexOf(">Yes<") >= 0) fail("Cap xss gone-prompt must not show a Yes tap");
else pass("Cap xss gone-prompt has no Yes tap");

const liveJob = {
  id: "j-live",
  status: "waiting",
  title: "Oak dresser",
  waitingOn: "person",
  deskAi: { name: "Shop Bot", does: "Qualify the click" }
};
const liveCap = ctx.capCardHtml(liveJob, "shop");
const liveOpen = ctx.threadSheetHtml(liveJob);
[liveCap, liveOpen].forEach(function (html, i) {
  const where = ["Cap", "Open"][i];
  if (promptWho(html).indexOf("Shop Bot asks") < 0) fail(where + " live prompt must still say Shop Bot asks, got " + promptWho(html));
  else pass(where + " live prompt still names Shop Bot");
  if (needChip(html).indexOf("Shop Bot · Needs you") < 0) fail(where + " live Needs you chip must still name Shop Bot, got " + needChip(html));
  else pass(where + " live Needs you chip still names Shop Bot");
  if (html.indexOf("not on this desk") >= 0) fail(where + " live bind must not paint gone HOLD");
  else pass(where + " live bind has no gone HOLD");
  if (/James/.test(promptWho(html) + needChip(html))) fail(where + " live Shop Bot must not first-eligible James");
  else pass(where + " live prompt / Needs you do not name James");
});

const unbound = {
  id: "j-any",
  status: "waiting",
  title: "Oak dresser",
  waitingOn: "info",
  why: "Need a number before this can go."
};
const unboundCap = ctx.capCardHtml(unbound, "shop");
const unboundOpen = ctx.threadSheetHtml(unbound);
[unboundCap, unboundOpen].forEach(function (html, i) {
  const where = ["Cap", "Open"][i];
  if (needChip(html) !== "Needs you") fail(where + " unbound Needs you chip must stay Needs you, got " + needChip(html));
  else pass(where + " unbound Needs you chip stays Needs you");
  if (html.indexOf("Ask the human") < 0) fail(where + " unbound missing-info must still say Ask the human");
  else pass(where + " unbound missing-info still says Ask the human");
  if (html.indexOf("not on this desk") >= 0) fail(where + " unbound card must not paint gone HOLD");
  else pass(where + " unbound card has no gone HOLD");
});

function paintCapFrom(src, job) {
  if (!src) return null;
  const run = baseCtx();
  try { vm.runInNewContext(src, run); } catch (e) { return "threw " + e.message; }
  if (typeof run.capCardHtml !== "function") return "no window.capCardHtml";
  run.AIADeskAis = {
    owner: true,
    rows: [
      { id: "james-s-ai", name: "James’s AI", does: "Draft the lead packet" },
      { id: "lane-bot", name: "Lane Bot", does: "Watch the lane" }
    ],
    primary: function () { return this.rows[0]; }
  };
  return run.capCardHtml(job || goneJob, "shop");
}

async function capLoadRun(src, opts) {
  opts = opts || {};
  if (!src) return "no source";
  const band = { hidden: true };
  const box = { innerHTML: "" };
  const calls = [];
  const store = Object.assign({ aia_ws: "shop", aia_pin: "", aia_session: "tok-leftover" }, opts.store || {});
  const list = (opts.list || []).slice();
  const run = baseCtx();
  run.document.getElementById = function (id) {
    if (id === "cap-band") return band;
    if (id === "cap-list") return box;
    return null;
  };
  run.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : ""; },
    setItem: function (k, v) { store[k] = v; }
  };
  try { vm.runInNewContext(src, run); } catch (e) { return "threw " + e.message; }
  if (typeof run.loadCap !== "function") return "no window.loadCap";
  run.AIADesks = {
    list: function () { return list.slice(); },
    find: function (slug) {
      return list.find(function (d) { return d && d.slug === slug; }) || null;
    }
  };
  run.AIADeskAis = {
    rows: [{ name: "James’s AI", does: "Draft the lead packet" }],
    primary: function () { return this.rows[0]; }
  };
  run.api = async function (path, opts) {
    calls.push({ path: path, opts: opts });
    return { data: { ok: true, items: [goneJob] } };
  };
  await run.loadCap();
  let desks = [];
  if (calls[0] && calls[0].opts && calls[0].opts.body) {
    try { desks = JSON.parse(calls[0].opts.body).desks || []; } catch (e) {}
  }
  return { desks: desks, html: box.innerHTML, hidden: band.hidden, calls: calls };
}
async function leftoverCapRun(src) {
  return capLoadRun(src, {});
}
function leftoverCapFaults(out) {
  const bad = [];
  if (typeof out === "string") { bad.push(out); return bad; }
  const desks = out.desks || [];
  const shop = desks.find(function (d) { return d && d.slug === "shop"; });
  if (!shop) {
    bad.push("did not unshift this desk for leftover session");
  } else {
    if (shop.token !== "tok-leftover") bad.push("did not send this desk via its session");
    if (shop.pin) bad.push("sent leftover aia_pin for this desk");
  }
  if (out.hidden) bad.push("hid the cap band");
  if (!out.calls || !out.calls.length) bad.push("did not ask /api/desks");
  return bad;
}
function leftoverPinCapFaults(out) {
  const bad = leftoverCapFaults(out);
  if (typeof out === "string") return bad;
  const desks = out.desks || [];
  const other = desks.find(function (d) { return d && d.slug === "other-desk"; });
  if (!other) bad.push("dropped other-desk Cap row");
  else {
    if (other.pin !== "9999") bad.push("changed other-desk Cap pin");
    if (other.token) bad.push("sent a token on other-desk Cap");
  }
  return bad;
}
function pinOnlyCapFaults(out) {
  const bad = [];
  if (typeof out === "string") { bad.push(out); return bad; }
  const desks = out.desks || [];
  const shop = desks.find(function (d) { return d && d.slug === "shop"; });
  if (!shop) bad.push("did not keep this desk on pin-only Cap");
  else if (shop.pin !== "4821") bad.push("pin-only current desk must still send the leftover pin");
  if (out.hidden) bad.push("hid the cap band");
  return bad;
}

async function openCapRun(src, opts) {
  opts = opts || {};
  if (!src) return "no source";
  const store = Object.assign({ aia_ws: "shop", aia_pin: "4821", aia_session: "tok-leftover" }, opts.store || {});
  const writes = [];
  const pinEl = { value: opts.pinField != null ? opts.pinField : "" };
  const wsEl = { value: opts.wsField != null ? opts.wsField : (store.aia_ws || "") };
  const list = (opts.list || [{ slug: "shop", pin: "4821" }, { slug: "other-desk", pin: "9999" }]).slice();
  let loaded = 0;
  const opened = [];
  const run = baseCtx();
  run.document.getElementById = function (id) {
    if (id === "ws") return wsEl;
    if (id === "pin") return pinEl;
    return null;
  };
  run.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : ""; },
    setItem: function (k, v) { writes.push({ k: k, v: String(v) }); store[k] = String(v); }
  };
  run.location = { href: "/desk" };
  run.load = async function () { loaded += 1; };
  run.openJob = function (id) { opened.push(id); };
  try { vm.runInNewContext(src, run); } catch (e) { return "threw " + e.message; }
  if (typeof run.openCapDesk !== "function") return "no window.openCapDesk";
  run.AIADesks = {
    list: function () { return list.slice(); },
    find: function (slug) {
      return list.find(function (d) { return d && d.slug === slug; }) || null;
    }
  };
  await run.openCapDesk(opts.slug || "shop", opts.jobId || "j1");
  return {
    store: store,
    writes: writes,
    pinValue: pinEl.value,
    wsValue: wsEl.value,
    loaded: loaded,
    opened: opened,
    href: run.location.href
  };
}
function currentDeskOpenFaults(out) {
  const bad = [];
  if (typeof out === "string") { bad.push(out); return bad; }
  if (out.writes.some(function (w) { return w.k === "aia_pin"; })) bad.push("wrote leftover aia_pin");
  if (out.pinValue) bad.push("painted leftover aia_pin");
  if (!out.loaded) bad.push("did not load the current desk");
  if (out.opened.indexOf("j1") < 0) bad.push("did not open the card");
  if (out.href === "/desks") bad.push("bounced a session-only current desk to /desks");
  return bad;
}
function otherDeskOpenFaults(out) {
  const bad = [];
  if (typeof out === "string") { bad.push(out); return bad; }
  if (!out.writes.some(function (w) { return w.k === "aia_ws" && w.v === "other-desk"; })) {
    bad.push("did not switch aia_ws to the other desk");
  }
  if (!out.writes.some(function (w) { return w.k === "aia_pin" && w.v === "9999"; })) {
    bad.push("did not write the other-desk pin");
  }
  if (out.pinValue !== "9999") bad.push("did not paint the other-desk pin");
  if (out.wsValue !== "other-desk") bad.push("did not paint the other-desk name");
  if (!out.loaded) bad.push("did not load the other desk");
  if (out.opened.indexOf("j1") < 0) bad.push("did not open the card on the other desk");
  if (out.href === "/desks") bad.push("bounced a pin-backed other desk to /desks");
  return bad;
}
function otherDeskMissingPinFaults(out) {
  const bad = [];
  if (typeof out === "string") { bad.push(out); return bad; }
  if (out.href !== "/desks") bad.push("token-less other desk must still go to /desks");
  if (out.writes.some(function (w) { return w.k === "aia_pin"; })) bad.push("wrote a pin for a token-less other desk");
  if (out.loaded) bad.push("loaded a token-less other desk");
  return bad;
}

function swap(str, from, to) { return str.indexOf(from) < 0 ? null : str.split(from).join(to); }

async function main() {
  const leftover = await leftoverCapRun(needs);
  const leftoverBad = leftoverCapFaults(leftover);
  if (leftoverBad.length) fail("Cap load must unshift this desk when leftover email session is live: " + leftoverBad.join("; "));
  else pass("Cap load unshifts this desk on leftover email session");

  const leftoverPin = await capLoadRun(needs, {
    store: { aia_ws: "shop", aia_pin: "4821", aia_session: "tok-leftover" },
    list: [{ slug: "shop", pin: "4821" }, { slug: "other-desk", pin: "9999" }]
  });
  const leftoverPinBad = leftoverPinCapFaults(leftoverPin);
  if (leftoverPinBad.length) fail("Cap load must send this desk via its session, not a leftover pin: " + leftoverPinBad.join("; "));
  else pass("Cap load sends this desk via its session and leaves other-desk pins alone");

  const pinOnly = await capLoadRun(needs, {
    store: { aia_ws: "shop", aia_pin: "4821", aia_session: "" },
    list: []
  });
  const pinOnlyBad = pinOnlyCapFaults(pinOnly);
  if (pinOnlyBad.length) fail("Cap load must still send a leftover pin when there is no session: " + pinOnlyBad.join("; "));
  else pass("Cap load still sends a leftover pin when there is no session");

  const openCurrent = await openCapRun(needs, { slug: "shop", jobId: "j1" });
  const openCurrentBad = currentDeskOpenFaults(openCurrent);
  if (openCurrentBad.length) fail("openCapDesk on the current desk with a session must not write or paint aia_pin: " + openCurrentBad.join("; "));
  else pass("openCapDesk on the current desk with a session does not write or paint aia_pin");

  const openSessionOnly = await openCapRun(needs, {
    slug: "shop",
    jobId: "j1",
    store: { aia_ws: "shop", aia_pin: "", aia_session: "tok-leftover" },
    list: []
  });
  const openSessionOnlyBad = currentDeskOpenFaults(openSessionOnly);
  if (openSessionOnlyBad.length) fail("openCapDesk must still open a session-only current desk: " + openSessionOnlyBad.join("; "));
  else pass("openCapDesk still opens a session-only current desk");

  const openOther = await openCapRun(needs, { slug: "other-desk", jobId: "j1" });
  const openOtherBad = otherDeskOpenFaults(openOther);
  if (openOtherBad.length) fail("openCapDesk on another desk must still write and paint that desk's pin: " + openOtherBad.join("; "));
  else pass("openCapDesk on another desk still writes and paints that desk's pin");

  const openMissing = await openCapRun(needs, {
    slug: "other-desk",
    jobId: "j1",
    list: [{ slug: "other-desk" }]
  });
  const openMissingBad = otherDeskMissingPinFaults(openMissing);
  if (openMissingBad.length) fail("openCapDesk on another desk without a pin must still go to /desks: " + openMissingBad.join("; "));
  else pass("openCapDesk on another desk without a pin still goes to /desks");

  const MUTANTS = [
    ["cap source loses not on this desk", function () {
      const n = swap(needs, "not on this desk", "left this desk");
      return n && capPromptGoneSourceFaults(n);
    }],
    ["cap source loses thenAiGone", function () {
      const n = swap(needs, "thenAiGone", "thenAiLeft");
      return n && capPromptGoneSourceFaults(n);
    }],
    ["cap source loses window.capCardHtml", function () {
      const n = swap(needs, "window.capCardHtml", "window.capCardOff");
      return n && capPromptGoneSourceFaults(n);
    }],
    ["cap source loses window.loadCap", function () {
      const n = swap(needs, "window.loadCap", "window.loadOff");
      return n && capPromptGoneSourceFaults(n);
    }],
    ["cap source loses leftover aia_session", function () {
      const n = swap(needs, 'localStorage.getItem("aia_session")', 'localStorage.getItem("aia_session_off")');
      return n && capPromptGoneSourceFaults(n);
    }],
    ["more-queue tip drops gone-AI honesty", function () {
      const n = swap(moreTips, "If a named desk AI is not on this desk, the card says so.", "The queue just runs.");
      return n && moreQueueCapFaults(n);
    }],
    ["cap card drops the gone label", function () {
      const n = swap(needs, " · not on this desk", " · left this desk");
      const html = paintCapFrom(n);
      if (html == null) return null;
      if (typeof html !== "string") return [String(html)];
      return capPromptGonePaintFaults(html, "Shop Bot");
    }],
    ["cap card drops q-ai-gone", function () {
      const n = swap(needs, "q-ai-gone", "q-ai-miss");
      const html = paintCapFrom(n);
      if (html == null) return null;
      if (typeof html !== "string") return [String(html)];
      return capPromptGonePaintFaults(html, "Shop Bot");
    }],
    ["cap load drops leftover email session", async function () {
      const n = swap(needs, 'localStorage.getItem("aia_session")', 'localStorage.getItem("aia_session_off")');
      if (!n) return null;
      const out = await leftoverCapRun(n);
      return leftoverCapFaults(out);
    }],
    ["current-desk Cap keeps leftover pin", async function () {
      const n = swap(needs, "r.unshift({slug:i,token:a})", "r.unshift({slug:i,pin:o})");
      if (!n) return null;
      const out = await capLoadRun(n, {
        store: { aia_ws: "shop", aia_pin: "4821", aia_session: "tok-leftover" },
        list: [{ slug: "shop", pin: "4821" }, { slug: "other-desk", pin: "9999" }]
      });
      return leftoverPinCapFaults(out);
    }],
    ["current-desk Cap sends no token", async function () {
      const n = swap(needs, "r.unshift({slug:i,token:a})", "r.unshift({slug:i})");
      if (!n) return null;
      const out = await leftoverCapRun(n);
      return leftoverCapFaults(out);
    }],
    ["openCapDesk writes leftover aia_pin on current desk", async function () {
      const n = swap(
        needs,
        'if(e&&e===s&&o)return"function"==typeof load&&await load(),void(t&&"function"==typeof openJob&&openJob(t));',
        'if(e&&e===s&&o)return localStorage.setItem("aia_pin","leftover"),"function"==typeof load&&await load(),void(t&&"function"==typeof openJob&&openJob(t));'
      );
      if (!n) return null;
      const out = await openCapRun(n, { slug: "shop", jobId: "j1" });
      return currentDeskOpenFaults(out);
    }],
    ["openCapDesk paints leftover code on current desk", async function () {
      const n = swap(
        needs,
        'if(e&&e===s&&o)return"function"==typeof load&&await load(),void(t&&"function"==typeof openJob&&openJob(t));',
        'if(e&&e===s&&o)return document.getElementById("pin")&&(document.getElementById("pin").value="leftover"),"function"==typeof load&&await load(),void(t&&"function"==typeof openJob&&openJob(t));'
      );
      if (!n) return null;
      const out = await openCapRun(n, { slug: "shop", jobId: "j1" });
      return currentDeskOpenFaults(out);
    }]
  ];
  let mutCaught = 0;
  for (let i = 0; i < MUTANTS.length; i++) {
    const m = MUTANTS[i];
    let out;
    try { out = await Promise.resolve(m[1]()); } catch (e) { out = ["threw " + e.message]; }
    if (out === null || out === false || out === undefined) fail("mutant does not apply: " + m[0]);
    else if (out.length) { mutCaught += 1; pass("mutant caught: " + m[0] + " (" + out[0] + ")"); }
    else fail("mutant survived: " + m[0]);
  }
  pass("mutants: " + mutCaught + "/" + MUTANTS.length + " caught");
  if (mutCaught !== MUTANTS.length) fail("not every mutant was caught");

  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }

  await checkCapSession(mutCaught, MUTANTS.length);
}

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end() { return this; }
  };
}
function reqOf(method, headers, body, query) {
  return { method: method, headers: headers || {}, body: body || {}, query: query || {} };
}
async function call(handler, method, headers, body, query) {
  const res = mockRes();
  await handler(reqOf(method, headers, body, query), res);
  return res;
}

async function checkCapSession(mutCaught, mutTotal) {
  const store = path.join(os.tmpdir(), "aia-cap-session-check-" + Date.now() + ".json");
  process.env.AIA_STORE_PATH = store;
  delete global.__aia;
  delete global.__aiaHydrate;
  ["../api/_lib", "../api/_history", "../api/_desks-http", "../api/auth"].forEach(function (mod) {
    try { delete require.cache[require.resolve(mod)]; } catch (e) {}
  });

  const lib = require("../api/_lib");
  const desksHandler = require("../api/_desks-http");
  const { mem, ready, hashPin, ensurePeople } = lib;
  await ready();
  const slug = "cap-session-desk";
  const pin = "4821";
  const shop = {
    slug: slug,
    name: "Cap Session",
    biz: slug,
    pin: hashPin(pin),
    createdAt: new Date().toISOString(),
    people: [],
    rules: []
  };
  ensurePeople(shop);
  mem.workspaces.unshift(shop);
  mem.jobs = (mem.jobs || []).concat([{
    id: "j-cap-session",
    workspace: slug,
    title: "Email leftover cap",
    status: "waiting",
    priority: true,
    cap: true,
    createdAt: new Date().toISOString()
  }]);

  const dead = await call(desksHandler, "POST", {
    "x-workspace": slug,
    "x-session": "deadbeefdeadbeefdeadbeefdeadbeef"
  }, { action: "priority", desks: [{ slug: slug, pin: "" }] });
  if (dead.statusCode !== 200) fail("dead leftover session Cap should 200 empty, got " + dead.statusCode);
  else if ((dead.body.items || []).some(function (it) { return it && it.id === "j-cap-session"; })) {
    fail("dead leftover session must not paint the Cap band");
  } else pass("dead leftover session Cap stays empty");

  const closed = await call(desksHandler, "POST", { "x-workspace": slug }, {
    action: "priority",
    desks: [{ slug: slug, pin: "" }]
  });
  if (closed.statusCode !== 200) fail("Cap without pin or session should 200 empty, got " + closed.statusCode);
  else if ((closed.body.items || []).some(function (it) { return it && it.id === "j-cap-session"; })) {
    fail("closed Cap must not paint the card");
  } else pass("Cap without pin or session stays empty");

  const pinTrail = await call(desksHandler, "POST", { "x-workspace": slug, "x-pin": pin }, {
    action: "priority",
    desks: [{ slug: slug, pin: pin }]
  });
  if (pinTrail.statusCode !== 200 || !(pinTrail.body.items || []).some(function (it) { return it && it.id === "j-cap-session"; })) {
    fail("desk code Cap should still paint, got " + pinTrail.statusCode + " " + JSON.stringify(pinTrail.body));
  } else pass("desk code still paints Cap");

  const issued = lib.issueSession(shop.people[0], shop, null, { headers: { "x-workspace": slug } });
  if (!issued || !issued.token) fail("must issue leftover email-session token for Cap");
  else pass("issued leftover email-session token for Cap");
  const sessionCap = await call(desksHandler, "POST", {
    "x-workspace": slug,
    "x-session": issued.token
  }, { action: "priority", desks: [{ slug: slug, pin: "" }] });
  if (sessionCap.statusCode !== 200 || !sessionCap.body || !sessionCap.body.ok) {
    fail("leftover email-session owner Cap should 200, got " + sessionCap.statusCode + " " + JSON.stringify(sessionCap.body));
  } else if (!(sessionCap.body.items || []).some(function (it) { return it && it.id === "j-cap-session"; })) {
    fail("leftover email-session owner must see the Cap band, got " + JSON.stringify(sessionCap.body));
  } else pass("leftover email-session owner sees the Cap band");

  const helperSeat = {
    id: "p_cap_helper",
    name: "Cap helper",
    role: "employee",
    kind: "helper",
    status: "approved"
  };
  shop.people.push(helperSeat);
  const helperTok = lib.issueSession(helperSeat, shop, null, { headers: { "x-workspace": slug } });
  const helperCap = await call(desksHandler, "POST", {
    "x-workspace": slug,
    "x-session": helperTok.token
  }, { action: "priority", desks: [{ slug: slug, pin: "" }] });
  if (helperCap.statusCode !== 200 || !(helperCap.body.items || []).some(function (it) { return it && it.id === "j-cap-session"; })) {
    fail("helper leftover session Cap should still read, got " + helperCap.statusCode);
  } else pass("helper leftover session can read Cap");

  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}

  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  if (mutCaught != null) console.log("check-cap-prompt-gone mutants: " + mutCaught + "/" + mutTotal + " caught");
  console.log("check-cap-prompt-gone: ok");
}

main().catch(function (err) {
  console.error("check-cap-prompt-gone failed: " + (err && err.stack || err));
  process.exit(1);
});
