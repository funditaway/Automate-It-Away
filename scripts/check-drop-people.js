#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

function fail(msg) {
  console.error("check-drop-people: " + msg);
  process.exit(1);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const agent = read("drop-agent.js");
const openAt = agent.indexOf("function deskIsOpen");
if (openAt < 0) fail("drop-agent.js missing deskIsOpen");
const openFn = agent.slice(openAt, agent.indexOf("function isEmbed", openAt));
if (openFn.indexOf("isEmbed()") < 0) fail("deskIsOpen must treat embed as public");
if (openFn.indexOf("destSlug") < 0) fail("deskIsOpen must read the destination desk");
if (openFn.indexOf("dest !== cur") < 0) fail("deskIsOpen must refuse a leftover desk that is not the destination");
if (openFn.indexOf("AIADesks.shopOpen") < 0) fail("deskIsOpen must still follow shopOpen() for the matching desk");

const injectAt = agent.indexOf("function injectDropUI");
if (injectAt < 0) fail("drop-agent.js missing injectDropUI");
const inject = agent.slice(injectAt, agent.indexOf("function bootDropKinds", injectAt));
if (inject.indexOf("!deskIsOpen()") < 0) fail("injectDropUI must not paint Advanced unless deskIsOpen()");
if (inject.indexOf("Hand to") < 0) fail("owner Advanced must still have Hand to");
if (inject.indexOf("adv-toggle") < 0) fail("owner Advanced toggle must stay");

const handAt = agent.indexOf("if (deskIsOpen()) {\n      try {");
if (handAt < 0) fail("People fetch must stay behind deskIsOpen()");
const hand = agent.slice(handAt, handAt + 900);
if (hand.indexOf("drop-hand") < 0) fail("People fetch must fill #drop-hand");
if (hand.indexOf("AIADesks.authHeaders") < 0) fail("People fetch must use AIADesks.authHeaders() on the open desk");
const switchSrc = read("desk-switch.js");
if (/if \(tok\) h\["X-Session"\] = tok;\s*else if \(pin\)/.test(switchSrc)) {
  fail("AIADesks.authHeaders must still send the open-desk pin when a session token is present");
}
if (switchSrc.indexOf('if (pin) h["X-Pin"] = pin') < 0) fail("AIADesks.authHeaders must send X-Pin");

const now = read("drop-now.js");
const nowDeskAt = now.indexOf("function desk()");
const nowDesk = now.slice(nowDeskAt, now.indexOf("function recent", nowDeskAt));
if (nowDesk.indexOf("cur.name || q") >= 0) fail("drop-now.js must not name a leftover desk on a ?ws= link");
if (nowDesk.indexOf("AIADesks.find") < 0) fail("drop-now.js must name a link desk from the saved row or the slug");

const chat = read("drop-chat.js");
const chatDeskAt = chat.indexOf("function desk()");
const chatDesk = chat.slice(chatDeskAt, chat.indexOf("function headers", chatDeskAt));
if (chatDesk.indexOf("cur.name || q") >= 0) fail("drop-chat.js must not greet with a leftover desk on a ?ws= link");
if (chatDesk.indexOf("AIADesks.find") < 0) fail("drop-chat.js must name the link desk");
if (chat.indexOf("AIA AI answers") >= 0) fail("drop-chat.js Talk empty still says AIA AI answers");
if (chat.indexOf("AIA writes") >= 0) fail("drop-chat.js Talk still says AIA writes");
if (chat.indexOf("AIA still answers") >= 0) fail("drop-chat.js Talk greet still says AIA still answers");
if (chat.indexOf("AIA answers and writes") >= 0) fail("drop-chat.js Talk empty tap still says AIA answers");
if (chat.indexOf("AIA would write") >= 0) fail("drop-chat.js Talk no-desk still says AIA would write");
if (chat.indexOf("AIA still wrote") >= 0) fail("drop-chat.js Talk 401 still says AIA still wrote");
if (chat.indexOf('from === "you" ? "You" : "AIA"') >= 0) fail("drop-chat.js Talk speaker still says AIA");
if (chat.indexOf('from === "you" ? "You" : "Desk AI"') < 0) fail("drop-chat.js Talk speaker must say Desk AI");
if (chat.indexOf("A Desk AI drafts the card") < 0) fail("drop-chat.js Talk empty must say A Desk AI drafts the card");
if (chat.indexOf("You still tap Yes or Stop") < 0) fail("drop-chat.js Talk empty must keep Yes or Stop");
if (chat.indexOf("Pick a world desk at the top, or say the work. A Desk AI drafts the card.") < 0) {
  fail("drop-chat.js Talk greet must say A Desk AI drafts the card");
}

const pick = read("drop-pick.js");
if (pick.indexOf("AIADesks.authHeaders") < 0) fail("List this desk must use AIADesks.authHeaders()");
if (/var ws = cur\.slug \|\| q/.test(pick)) fail("drop-pick.js must not prefer a leftover desk over ?ws=");
if (pick.indexOf("q || cur.slug") < 0) fail("drop-pick.js must highlight the link desk first");

["drop.html", "widget.html"].forEach(function (file) {
  const src = read(file);
  if (src.indexOf("AIADesks.shopOpen") < 0) fail(file + " deskOpen must still follow shopOpen()");
  if (src.indexOf("authWs") < 0 || src.indexOf("ws !== authWs") < 0) {
    fail(file + " must not mark desk-open when the link desk is not the saved desk");
  }
});

function runOpen(opts) {
  const store = opts.store || {};
  const sandbox = {
    document: { body: { classList: { contains: function (c) { return !!opts.embed && c === "embed"; } } } },
    location: { search: opts.search || "" },
    localStorage: {
      getItem: function (k) { return store[k] == null ? null : store[k]; }
    },
    URLSearchParams: URLSearchParams
  };
  sandbox.window = sandbox;
  sandbox.parent = opts.embed ? {} : sandbox;
  sandbox.AIADesks = {
    slugify: function (s) {
      return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    },
    shopOpen: function () {
      return !!(store.aia_ws && (store.aia_session || store.aia_pin));
    }
  };
  const start = agent.indexOf("function slugOf");
  const end = agent.indexOf("function paintActions");
  vm.runInNewContext(agent.slice(start, end) + "\nthis.deskIsOpen = deskIsOpen;\nthis.destSlug = destSlug;", sandbox);
  return sandbox.deskIsOpen();
}

if (runOpen({ search: "?ws=dads-desk", store: { aia_ws: "moms-desk", aia_pin: "1111" } })) {
  fail("family phone on /drop?ws=other must stay public — no People");
}
if (runOpen({ search: "?ws=dads-desk", store: {} })) {
  fail("first-time /drop?ws= must stay public — no People");
}
if (runOpen({ search: "", store: {} })) {
  fail("empty /drop must stay public — no People");
}
if (runOpen({ search: "?ws=moms-desk", store: { aia_ws: "moms-desk", aia_pin: "1111" }, embed: true })) {
  fail("embed must stay public even when this phone owns the desk");
}
if (!runOpen({ search: "?ws=moms-desk", store: { aia_ws: "moms-desk", aia_pin: "1111" } })) {
  fail("owner /drop?ws= matching desk must still count as open");
}
if (!runOpen({ search: "", store: { aia_ws: "moms-desk", aia_session: "tok" } })) {
  fail("owner /drop on a token-only session desk must still count as open");
}

console.log("check-drop-people: ok");
