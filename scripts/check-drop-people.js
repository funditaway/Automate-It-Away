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
if (now.indexOf("function widgetOn") < 0) fail("drop-now.js must detect the /widget path");
if (now.indexOf("function slimChrome") < 0) fail("drop-now.js must slim #drop-on on /widget");
const nowBannerAt = now.indexOf("function banner");
const nowBanner = now.slice(nowBannerAt, now.indexOf("function camera", nowBannerAt));
if (nowBanner.indexOf("slimChrome()") < 0) fail("drop-now.js banner must skip #drop-on on /widget");
if (nowBanner.indexOf("drop-steps") < 0 || nowBanner.indexOf("drop-step-foot") < 0) {
  fail("drop-now.js slimChrome must tear down #drop-steps on /widget");
}
if (nowBanner.indexOf("talkBar") < 0) fail("drop-now.js slimChrome must tear down #talkBar on /widget");
if (nowBanner.indexOf("Change desk") < 0 || nowBanner.indexOf("/drop") < 0) {
  fail("drop-now.js /drop banner must still offer Change desk");
}
function runSlimNow(opts) {
  const sandbox = {
    document: {
      documentElement: { classList: { contains: function (c) { return !!opts.htmlWidget && c === "widget"; } } },
      body: { classList: { contains: function (c) {
        if (c === "embed") return !!opts.embed;
        if (c === "widget") return !!opts.widget;
        return false;
      } } }
    },
    location: { pathname: opts.path || "/drop", search: opts.search || "", href: opts.href || "" }
  };
  sandbox.window = sandbox;
  sandbox.parent = opts.iframe ? {} : sandbox;
  const start = now.indexOf("function embedOn");
  const end = now.indexOf("function banner");
  vm.runInNewContext(now.slice(start, end) + "\nthis.slimChrome = slimChrome;", sandbox);
  return !!sandbox.slimChrome();
}
if (!runSlimNow({ path: "/widget" })) fail("/widget must skip #drop-on");
if (!runSlimNow({ path: "/widget.html" })) fail("/widget.html must skip #drop-on");
if (!runSlimNow({ search: "?embed=1" })) fail("?embed=1 must skip #drop-on");
if (!runSlimNow({ widget: true, path: "/drop.html" })) fail("body.widget must skip #drop-on even when pathname is drop.html");
if (runSlimNow({ path: "/drop" })) fail("/drop must still paint #drop-on");
if (runSlimNow({ search: "?ws=springfield-shop" })) fail("/drop?ws= must still paint #drop-on");

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

const preview = read("drop-preview.js");
if (preview.indexOf("The desk asks what is missing") >= 0) fail("drop-preview.js Talk empty still says The desk asks");
if (preview.indexOf("Then send it") >= 0) fail("drop-preview.js preview-sub still says Then send it");
if (preview.indexOf("The desk will ask") >= 0) fail("drop-preview.js Talk still says The desk will ask");
if (preview.indexOf("Talk with this desk") >= 0) fail("drop-preview.js Talk title still says Talk with this desk");
if (preview.indexOf(': "Desk")') >= 0) fail("drop-preview.js Talk speaker still says Desk");
if (preview.indexOf(': "Desk AI")') < 0) fail("drop-preview.js Talk speaker must say Desk AI");
if (preview.indexOf("A Desk AI drafts the card") < 0) fail("drop-preview.js Talk empty must say A Desk AI drafts the card");
if (preview.indexOf("You still tap Yes or Stop") < 0) fail("drop-preview.js Talk empty must keep Yes or Stop");
if (preview.indexOf("Type the work. A Desk AI drafts the card in this chat.") < 0) {
  fail("drop-preview.js Talk empty tap must say A Desk AI drafts the card");
}
if (preview.indexOf("What should the desk do with this") >= 0) {
  fail("drop-preview.js ask still says What should the desk do with this");
}
if (preview.indexOf("Should the desk text them") >= 0) fail("drop-preview.js ask still says Should the desk text them");
if (preview.indexOf("The desk still will not send it") >= 0) {
  fail("drop-preview.js ask still says The desk still will not send it");
}
if (preview.indexOf("What is needed? A Desk AI drafts the card. You still tap Yes or Stop.") < 0) {
  fail("drop-preview.js title ask must say A Desk AI drafts the card");
}
const previewInjectAt = preview.indexOf("function inject");
const previewInject = preview.slice(previewInjectAt, preview.indexOf("function addLine", previewInjectAt));
if (previewInject.indexOf("hasThread") < 0 || previewInject.indexOf('getElementById("drop-thread")') < 0) {
  fail("drop-preview.js inject must reuse an existing Tell the desk thread");
}
if (!/hasThread \? ""/.test(previewInject) && previewInject.indexOf("hasThread ? \"\"") < 0) {
  fail("drop-preview.js inject must skip a second Tell the desk card");
}
if (previewInject.indexOf("slimChrome") < 0 || previewInject.indexOf("stripHtml") < 0) {
  fail("drop-preview.js inject must skip This drop / Counter on /widget");
}
if (previewInject.indexOf("logHtml") < 0) {
  fail("drop-preview.js inject must skip Drops from this phone on /widget");
}
if (previewInject.indexOf("id=\\\"drop-log-card\\\"") < 0 && previewInject.indexOf("id=\"drop-log-card\"") < 0) {
  fail("drop-preview.js must still paint Drops from this phone on /drop");
}
if (preview.indexOf("function widgetOn") < 0) fail("drop-preview.js must detect /widget path");
if (preview.indexOf("function slimChrome") < 0) fail("drop-preview.js must slim This drop on /widget");
const steps = read("drop-steps.js");
if (steps.indexOf("function widgetOn") < 0) fail("drop-steps.js must detect the /widget path");
if (steps.indexOf("if (!onDrop() || embedOn() || widgetOn()) return") < 0) {
  fail("drop-steps.js boot must skip the step rail on /widget");
}
if (steps.indexOf("function slimChrome") < 0 || steps.indexOf("if (slimChrome()) hush()") < 0) {
  fail("drop-steps.js must hush #drop-steps on /widget via slimChrome");
}
const yesNo = read("ACCOUNT-YES-NO.md");
const packMd = read("PACK.md");
if (yesNo.indexOf("Drop widget Drop-tab rail leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget Drop-tab rail leftover");
}
if (packMd.indexOf("Drop widget Drop-tab rail leftover:") < 0) {
  fail("PACK.md must name Drop widget Drop-tab rail leftover");
}
if (yesNo.indexOf("Drop widget `#drop-on` leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget #drop-on leftover");
}
if (packMd.indexOf("Drop widget `#drop-on` leftover:") < 0) {
  fail("PACK.md must name Drop widget #drop-on leftover");
}
if (yesNo.indexOf("Drop `#drop-on` keep leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop #drop-on keep leftover");
}
if (packMd.indexOf("Drop `#drop-on` keep leftover:") < 0) {
  fail("PACK.md must name Drop #drop-on keep leftover");
}
if (yesNo.indexOf("Drop widget standalone steps rail leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget standalone steps rail leftover");
}
if (packMd.indexOf("Drop widget standalone steps rail leftover:") < 0) {
  fail("PACK.md must name Drop widget standalone steps rail leftover");
}
if (/off:\s*\[["']drop-on["']\]/.test(steps)) {
  fail("drop-steps.js must not hush #drop-on on /drop step one");
}
if (steps.indexOf('keep.classList.remove("step-off")') < 0) {
  fail("drop-steps.js paint() must keep #drop-on visible on /drop");
}
const hrefFn = read("desk-switch.js");
const hrefAt = hrefFn.indexOf("function widgetHref");
const href = hrefFn.slice(hrefAt, hrefFn.indexOf("function captureDesk"));
if (href.indexOf('return "/widget"') < 0 || href.indexOf('"/widget?ws="') < 0) {
  fail("widgetHref must point the Drop tab at /widget so #drop-steps skips");
}
if (yesNo.indexOf("Drop widget pick href leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget pick href leftover");
}
if (packMd.indexOf("Drop widget pick href leftover:") < 0) {
  fail("PACK.md must name Drop widget pick href leftover");
}
const pickHref = read("drop-pick.js");
if (pickHref.indexOf("function widgetOn") < 0) fail("drop-pick.js must detect the /widget path");
if (pickHref.indexOf("function dropHref") < 0) fail("drop-pick.js must pick /widget vs /drop");
if (pickHref.indexOf("location.href = dropHref(use)") < 0) {
  fail("drop-pick.js goDrop must use dropHref so /widget stays on /widget");
}
if (pickHref.indexOf('location.href = use ? ("/drop?ws="') >= 0) {
  fail("drop-pick.js goDrop must not always dump to /drop");
}
if (now.indexOf("function dropHref") < 0) fail("drop-now.js must pick /widget vs /drop for recent desks");
if (now.indexOf("location.href = dropHref(") < 0) {
  fail("drop-now.js recent public desks must use dropHref");
}
if (now.indexOf('location.href = "/drop?ws="') >= 0) {
  fail("drop-now.js recent public desks must not always dump to /drop");
}
const hookTypeAt = preview.indexOf("function hookType");
const hookType = preview.slice(hookTypeAt, preview.indexOf("function hookSendAlias", hookTypeAt));
if (hookType.indexOf("if (window.AIADropChat) return") < 0) {
  fail("drop-preview.js hookType must yield Tell to chat on the one #drop-thread");
}
if (hookType.indexOf("if (last && /Type the work\\. A Desk AI drafts the card/") < 0) {
  fail("drop-preview.js empty Tell must skip a second blank-chat prompt");
}
if (chat.indexOf("Type the work. A Desk AI drafts the card") < 0) {
  fail("drop-chat.js empty Tell must say A Desk AI drafts the card");
}
if (chat.indexOf("if (last && /Type the work\\. A Desk AI drafts the card/") < 0) {
  fail("drop-chat.js empty Tell must skip a second blank-chat prompt");
}

const dropNav = read("desk-nav.js");
const loadAt = dropNav.indexOf("function loadDrop");
const loadDropFn = dropNav.slice(loadAt, dropNav.indexOf("function loadQueue", loadAt));
if (loadDropFn.indexOf("then") < 0 || loadDropFn.indexOf("el.onload") < 0) {
  fail("desk-nav.js loadDrop must wait before the next Drop script");
}
if (dropNav.indexOf('loadDrop("drop-preview.js", "data-aia-drop-preview", function ()') < 0) {
  fail("desk-nav.js must load drop-chat.js after drop-preview.js");
}
if (!/loadDrop\("drop-preview\.js"[\s\S]{0,120}loadDrop\("drop-chat\.js"/.test(dropNav)) {
  fail("desk-nav.js must chain drop-chat.js onto drop-preview.js");
}

const talk = read("drop-talk.js");
if (talk.indexOf("Talk the work in your words") >= 0) fail("drop-talk.js Hear this still says Talk the work in your words");
if (talk.indexOf("Then say drop it. Nobody sends money from here.") >= 0) {
  fail("drop-talk.js empty still says Then say drop it");
}
if (talk.indexOf("End with drop it if you want it on the queue") >= 0) {
  fail("drop-talk.js listening still says End with drop it");
}
if (talk.indexOf("A Desk AI drafts the card") < 0) fail("drop-talk.js Hear this must say A Desk AI drafts the card");
if (talk.indexOf("You still tap Yes or Stop") < 0) fail("drop-talk.js Hear this must keep Yes or Stop");
const talkBootAt = talk.indexOf("function boot");
const talkBoot = talk.slice(talkBootAt, talk.indexOf("if (document.readyState", talkBootAt));
if (talkBoot.indexOf('classList.contains("embed")') < 0 || talkBoot.indexOf("window !== window.parent") < 0) {
  fail("drop-talk.js boot must skip the Talk bar on embed /widget");
}
if (talk.indexOf("function widgetOn") < 0) fail("drop-talk.js must detect the /widget path");
if (talkBoot.indexOf("widgetOn()") < 0) fail("drop-talk.js boot must skip the Talk bar on standalone /widget");
if (talkBoot.indexOf("hushTalk()") < 0) fail("drop-talk.js boot must tear down leftover #talkBar on /widget");
if (preview.indexOf("if (bar && slimChrome())") < 0) fail("drop-preview.js must skip unhiding Talk on /widget");
if (yesNo.indexOf("Drop widget standalone Talk bar leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget standalone Talk bar leftover");
}
if (packMd.indexOf("Drop widget standalone Talk bar leftover:") < 0) {
  fail("PACK.md must name Drop widget standalone Talk bar leftover");
}

["drop.html", "widget.html"].forEach(function (file) {
  const src = read(file);
  if (src.indexOf("window.ws = ws") < 0) fail(file + " must share ws with preview");
  if (src.indexOf("The desk writes the card") >= 0) fail(file + " Put data on still says The desk writes the card");
  if (src.indexOf("Paste the data. A Desk AI drafts the card. You still tap Yes or Stop.") < 0) {
    fail(file + " Put data on must say A Desk AI drafts the card");
  }
  if (src.indexOf("What should the desk do with it?") >= 0) fail(file + " Put data on Tell still says What should the desk do with it");
  if (src.indexOf("What should a Desk AI draft?") < 0) fail(file + " Put data on Tell must say What should a Desk AI draft");
  if (src.indexOf("Talk the work in your words") >= 0) fail(file + " Talk bar still says Talk the work in your words");
  if (src.indexOf("id=\"talkStatus\">Talk or type the work. A Desk AI drafts the card. You still tap Yes or Stop.") < 0) {
    fail(file + " Talk bar empty must say A Desk AI drafts the card");
  }
});
const tipSrc = read("aia-tip.js");
if (tipSrc.indexOf("What should the desk do with it?") >= 0) fail("aia-tip.js drop-tell still says What should the desk do with it");
if (tipSrc.indexOf("Tell the desk the next draft") >= 0) fail("aia-tip.js drop-tell still says Tell the desk the next draft");
if (tipSrc.indexOf("What should a Desk AI draft?") < 0) fail("aia-tip.js drop-tell must say What should a Desk AI draft");
if (tipSrc.indexOf("Tell a Desk AI the next draft") < 0) fail("aia-tip.js drop-tell must say Tell a Desk AI the next draft");
if (tipSrc.indexOf("What the desk should do next") >= 0) fail("aia-tip.js drop-outcome still says What the desk should do next");
if (tipSrc.indexOf("What a Desk AI should draft next") < 0) fail("aia-tip.js drop-outcome must say What a Desk AI should draft next");
if (agent.indexOf("What the desk should do next") >= 0) fail("drop-agent.js Preferred outcome still says What the desk should do next");
if (agent.indexOf("Tap what the desk should do after this lands") >= 0) fail("drop-agent.js Advanced still says Tap what the desk should do");
if (agent.indexOf("What a Desk AI should draft next") < 0) fail("drop-agent.js Preferred outcome must say What a Desk AI should draft next");
if (agent.indexOf("You still tap Yes or Stop") < 0) fail("drop-agent.js Preferred outcome must keep Yes or Stop");

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
