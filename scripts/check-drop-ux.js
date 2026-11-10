#!/usr/bin/env node
"use strict";
require("./_env-guard");

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

function fail(msg) {
  console.error("check-drop-ux: " + msg);
  process.exit(1);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function mustParseAndEsc(rel) {
  const file = path.join(ROOT, rel);
  const syntax = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (syntax.status !== 0) {
    fail(rel + " must parse: " + (syntax.stderr || syntax.stdout || "syntax error").trim());
  }
  const src = read(rel);
  const start = src.indexOf("function esc(s)");
  if (start < 0) fail(rel + " missing esc()");
  const end = src.indexOf("\n  function ", start + 10);
  const fn = src.slice(start, end > start ? end : start + 400);
    // drop-preview.js later split the entity map ("&" + "amp;"). Accept
  // that form or a literal map; the vm tests below assert the encoding.
  function hasEntity(raw, entity) {
    const tight = '"' + raw + '":"' + entity + '"';
    const spaced = '"' + raw + '": "' + entity + '"';
    const split = entity.charAt(0) === "&" ? ('"' + raw + '": "&" + "' + entity.slice(1) + '"') : "";
    return fn.indexOf(tight) >= 0 || fn.indexOf(spaced) >= 0 || (split && fn.indexOf(split) >= 0);
  }
  if (!hasEntity("&", "&amp;") || !hasEntity("<", "&lt;")) fail(rel + " esc() does not encode & / <");
  if (!hasEntity(">", "&gt;") || !hasEntity('\\"', "&quot;")) fail(rel + " esc() does not encode > / \"");
if (fn.indexOf("&#39;") < 0) fail(rel + " esc() does not encode '");
  if (/\s*"<":"<"/.test(fn) || /\s*"&":"&"/.test(fn) || /'"':\s*"""/.test(fn)) {
    fail(rel + " esc() is a no-op or invalid quote map");
  }
  const ctx = {};
  vm.runInNewContext(fn + "; this.esc = esc;", ctx);
  if (ctx.esc("Shop <desk>") !== "Shop &lt;desk&gt;") fail(rel + " esc must encode < in desk names");
  if (ctx.esc("A & B") !== "A &amp; B") fail(rel + " esc must encode &");
  if (ctx.esc('"hi"') !== "&quot;hi&quot;") fail(rel + " esc must encode \"");
  if (ctx.esc("O'Brien") !== "O&#39;Brien") fail(rel + " esc must encode '");
}

function pass(msg) { console.log("ok  " + msg); }

function sendFn(src, label) {
  const start = src.indexOf("async function send()");
  if (start < 0) fail(label + " missing send()");
  const end = src.indexOf("function copyDropShare", start);
  return src.slice(start, end > start ? end : start + 3600);
}

function copyFn(src, label) {
  const start = src.indexOf("function copyDropShare");
  if (start < 0) fail(label + " missing copyDropShare");
  return src.slice(start, start + 1400);
}

// 1ec1382 moved send(), copyDropShare, paintFiles, and shareUrl from
// drop.html / widget.html into drop-app.js. Later copy shorten changed
// the live success hold from "Yes or Stop" to "Yes, then Start".
// The form, Drop it button, and ok/err slots stay on the pages.
const app = read("drop-app.js");

["drop.html", "widget.html"].forEach(function (file) {
  const src = read(file);
  if (src.indexOf("drop-app.js") < 0) fail(file + " must load drop-app.js");
  else pass(file + " loads drop-app.js");
  if (src.indexOf('id="desk-on"') < 0) fail(file + " missing #desk-on destination");
  if (src.indexOf('id="share-ok"') < 0) fail(file + " missing #share-ok");
  if (src.indexOf('id="share-copy"') < 0) fail(file + " missing Copy drop link button");
  if (src.indexOf('id="title-hint"') < 0) fail(file + " missing title hint");
  if (src.indexOf('id="drop-send"') < 0) fail(file + " missing Drop it button");
  if (src.indexOf('id="title"') < 0) fail(file + " missing title field");
  if (src.indexOf('id="ok"') < 0 || src.indexOf('id="err"') < 0) fail(file + " missing ok / error slots");
  if (src.indexOf('aria-live="polite"') < 0 || src.indexOf('aria-live="assertive"') < 0) {
    fail(file + " must announce success and errors");
  }
  if (src.indexOf("You still tap Yes or No") >= 0) fail(file + " still paints Yes or No as the rail");
});

if (app.indexOf("https://www.automateitaway.com/drop?ws=") < 0) {
  fail("share link must use www.automateitaway.com");
}
if (/https:\/\/automateitaway\.com\/drop\?ws=/.test(app)) {
  fail("share link still advertises the apex drop host");
}
if (app.indexOf("function paintFiles") < 0 || app.indexOf('photoEl.addEventListener("change", paintFiles)') < 0) {
  fail("drop-app.js must paint selected files");
}
if (app.indexOf("Saving file") < 0) fail("drop-app.js must say Saving file while upload runs");
if (app.indexOf("File did not save.") < 0) fail("upload error must say File did not save");
if (app.indexOf("Photo did not save.") >= 0) fail("drop-app.js still says Photo did not save");
if (app.indexOf("You still tap Yes or No") >= 0) fail("drop-app.js still paints Yes or No as the rail");
if (app.indexOf("AIADesks.shopOpen") < 0) fail("deskOpen must still follow shopOpen()");

const send = sendFn(app, "drop-app.js");
const copy = copyFn(app, "drop-app.js");
if (send.indexOf("On the queue") < 0 || send.indexOf("You still tap Yes, then Start") < 0) {
  fail("success must still paint On the queue and hold for a human Yes, then Start");
}
if (send.indexOf("Say what you need.") < 0) fail("empty drop must be blocked with Say what you need");
if (send.indexOf("Dropping…") < 0 && send.indexOf("Dropping...") < 0) fail("send() must show Dropping…");
if (send.indexOf("attachFiles(item") < 0) fail("send() must still attachFiles");
if (send.indexOf("agent-tell") < 0) fail("send() must read Tell AIA from #agent-tell");
if (/\|\|\s*implement\)\s*\)\s*:/.test(send) || /tell\s*=\s*agentOn[\s\S]{0,120}\|\|\s*implement/.test(send)) {
  fail("Tell AIA must not fall back to pasted implement");
}
if (send.indexOf("tell: tell") < 0) fail("send() must post tell");
if (copy.indexOf("share-ok") < 0) fail("copyDropShare must write #share-ok");
if (/getElementById\(["']ok["']\)/.test(copy)) fail("copyDropShare must not hijack #ok");
if (copy.indexOf("never see money") < 0) fail("share copy must stay honest about money");
pass("send() paints one capture, success, a plain error, and blocks an empty drop");

function jobsFetches(sendSrc) {
  const out = [];
  const needle = 'fetch("/api/jobs"';
  let from = 0;
  while (true) {
    const at = sendSrc.indexOf(needle, from);
    if (at < 0) break;
    out.push(sendSrc.slice(at, at + 220));
    from = at + needle.length;
  }
  return out;
}

function dropUxFaults(appSrc) {
  const bad = [];
  const s = sendFn(appSrc, "mutant");
  const fetches = jobsFetches(s);
  if (!fetches.length) bad.push("no capture on Drop it");
  else if (fetches.length > 1) bad.push("double capture");
  if (fetches.length === 1 && !/action:\s*"capture"/.test(appSrc.slice(appSrc.indexOf("async function send()"), appSrc.indexOf("function copyDropShare") >= 0 ? appSrc.indexOf("function copyDropShare") : appSrc.indexOf("async function send()") + 3600).split('fetch("/api/jobs"')[0] + fetches[0])) {
    // capture action lives on the item built before the fetch
  }
  const sendBody = s;
  if (sendBody.indexOf('action: "capture"') < 0 && fetches.length) {
    if (bad.indexOf("no capture on Drop it") < 0) bad.push("no capture on Drop it");
  }
  if (sendBody.indexOf('showNote(ok, "On the queue"') < 0) bad.push("success not painted");
  const httpErr = /else\s*\{\s*showNote\(\s*err\s*,\s*out\.error\s*\|\|\s*"Could not send\."\s*\)/.test(sendBody);
  const netErr = /catch\s*\(\s*\w+\s*\)\s*\{\s*showNote\(\s*err\s*,\s*"Could not reach the desk\."\s*\)/.test(sendBody);
  if (!httpErr || !netErr) bad.push("error swallowed");
  if (/action:\s*"start"|action:\s*"ship"|action:\s*"charge"|action:\s*"bind-ai"|action:\s*"assign"/.test(sendBody)) {
    bad.push("ship/start on drop");
  }
  return bad;
}

const liveUx = dropUxFaults(app);
if (liveUx.length) fail("drop-app.js send() lost drop UX: " + liveUx.join("; "));

function applyMutant(src, kind) {
  let next = src;
  const oneFetch = "const r = await fetch(\"/api/jobs\", { method: \"POST\", headers: headers(), body: JSON.stringify(item) });";
  if (kind === "no capture on Drop it") {
    next = next.replace(oneFetch, "const r = { ok: true, json: async function () { return {}; } };");
  } else if (kind === "double capture") {
    next = next.replace(
      oneFetch,
      oneFetch + " await fetch(\"/api/jobs\", { method: \"POST\", headers: headers(), body: JSON.stringify(item) });"
    );
  } else if (kind === "success not painted") {
    next = next.replace("showNote(ok, \"On the queue\"", "showNote(err, \"On the queue\"");
  } else if (kind === "error swallowed") {
    next = next.replace("} else { showNote(err, out.error || \"Could not send.\"); }", "} else { }");
    next = next.replace("catch (ex) { showNote(err, \"Could not reach the desk.\"); }", "catch (ex) { }");
  } else if (kind === "ship/start on drop") {
    next = next.replace(
      oneFetch,
      oneFetch + " await fetch(\"/api/jobs\", { method: \"POST\", headers: headers(), body: JSON.stringify({ action: \"start\" }) });"
    );
  }
  return next;
}

const mutants = [
  "no capture on Drop it",
  "double capture",
  "success not painted",
  "error swallowed",
  "ship/start on drop"
];
let caught = 0;
mutants.forEach(function (kind) {
  const faults = dropUxFaults(applyMutant(app, kind));
  if (faults.indexOf(kind) < 0) {
    console.error("mutant missed: " + kind + " (got " + JSON.stringify(faults) + ")");
    process.exitCode = 1;
  } else {
    caught++;
    pass("mutant caught: " + kind + " (" + kind + ")");
  }
});
if (caught !== mutants.length) fail("mutants: " + caught + "/" + mutants.length + " caught");
console.log("ok  mutants: " + caught + "/" + mutants.length + " caught");
console.log("check-drop-ux mutants: " + caught + "/" + mutants.length + " caught");

["drop-pick.js", "drop-preview.js"].forEach(mustParseAndEsc);

const pick = read("drop-pick.js");
if (pick.indexOf("from the link") < 0) fail("drop-pick.js must name a link desk when this phone has no saved desk");
if (!/AIADesks\.hasAuth\s*\(\s*row\s*\)/.test(pick)) {
  fail("drop-pick.js pick() must still treat AIADesks.hasAuth(row) as enough");
}
if (pick.indexOf('class=\\"chip-label\\"') < 0 && pick.indexOf('class="chip-label"') < 0) {
  fail("drop-pick.js must keep World accounts / World desks on their own chip-label row");
}

const yesNo = read("ACCOUNT-YES-NO.md");
const packMd = read("PACK.md");
const dropMd = read("DROP.md");
if (yesNo.indexOf("Drop pick / preview leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop pick / preview leftover");
}
if (packMd.indexOf("Drop pick / preview leftover:") < 0) {
  fail("PACK.md must name Drop pick / preview leftover");
}

const now = read("drop-now.js");
if (now.indexOf("This drop goes to") < 0) fail("drop-now.js banner must name the destination desk");
if (now.indexOf("You still tap Yes, then Start") < 0 && now.indexOf("You still tap Yes or Stop") < 0) fail("drop-now.js banner must still hold for a human Yes");
if (now.indexOf("function widgetOn") < 0) fail("drop-now.js must detect the /widget path");
if (now.indexOf("function slimChrome") < 0) fail("drop-now.js must slim #drop-on on /widget");
const bannerAt = now.indexOf("function banner");
const bannerFn = now.slice(bannerAt, now.indexOf("function camera", bannerAt));
if (bannerFn.indexOf("slimChrome()") < 0) fail("drop-now.js banner must skip #drop-on on /widget");
if (bannerFn.indexOf("drop-steps") < 0 || bannerFn.indexOf("drop-step-foot") < 0) {
  fail("drop-now.js slimChrome must tear down #drop-steps on /widget");
}
if (bannerFn.indexOf("talkBar") < 0 || bannerFn.indexOf("talk.parentNode.removeChild(talk)") < 0) {
  fail("drop-now.js slimChrome must tear down #talkBar on /widget");
}
if (bannerFn.indexOf("Change desk") < 0 || bannerFn.indexOf("/drop") < 0) {
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
if (!runSlimNow({ path: "/widget/" })) fail("/widget/ must skip #drop-on");
if (!runSlimNow({ path: "/drop", embed: true })) fail("embed /drop must skip #drop-on");
if (!runSlimNow({ path: "/drop", iframe: true })) fail("iframe /drop must skip #drop-on");
if (!runSlimNow({ search: "?ws=springfield-shop&embed=1" })) fail("?embed=1 must skip #drop-on");
if (!runSlimNow({ widget: true, path: "/drop.html" })) fail("body.widget must skip #drop-on even when pathname is drop.html");
if (runSlimNow({ path: "/drop" })) fail("/drop must still paint #drop-on");
if (runSlimNow({ path: "/drop.html" })) fail("/drop.html must still paint #drop-on");
if (runSlimNow({ search: "?ws=springfield-shop" })) fail("/drop?ws= must still paint #drop-on");
if (dropMd.indexOf("skip the `#drop-on` banner") < 0) fail("DROP.md must say /widget skips #drop-on");
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
const stepsHush = read("drop-steps.js");
if (/off:\s*\[["']drop-on["']\]/.test(stepsHush)) {
  fail("drop-steps.js must not hush #drop-on on /drop step one");
}
if (stepsHush.indexOf('keep.classList.remove("step-off")') < 0) {
  fail("drop-steps.js paint() must keep #drop-on visible on /drop");
}
if (yesNo.indexOf("Drop widget standalone steps rail leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget standalone steps rail leftover");
}
if (packMd.indexOf("Drop widget standalone steps rail leftover:") < 0) {
  fail("PACK.md must name Drop widget standalone steps rail leftover");
}

const preview = read("drop-preview.js");
const gateAt = preview.indexOf("function gateSend");
const gate = preview.slice(gateAt, preview.indexOf("function wrapFetch", gateAt));
if (gate.indexOf("Say what you need") < 0) fail("gateSend must show Say what you need when title is missing");
if (!/if\s*\(\s*card\.desk\s*&&\s*card\.title\s*\)\s*return/.test(gate)) {
  fail("gateSend must still let Drop it run when desk and title are set");
}
if (preview.indexOf("Then send it") >= 0) fail("drop-preview.js still says Then send it");
if (preview.indexOf("The desk asks what is missing") >= 0) fail("drop-preview.js Talk empty still says The desk asks");
if (preview.indexOf("A Desk AI drafts the card") < 0) fail("drop-preview.js Talk empty must say A Desk AI drafts the card");
if (preview.indexOf("You still tap Yes or Stop") < 0) fail("drop-preview.js must keep Yes or Stop");
if (preview.indexOf(': "Desk")') >= 0) fail("drop-preview.js Talk speaker still says Desk");
if (preview.indexOf(': "Desk AI")') < 0) fail("drop-preview.js Talk speaker must say Desk AI");
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
const injectAt = preview.indexOf("function inject");
const inject = preview.slice(injectAt, preview.indexOf("function addLine", injectAt));
if (inject.indexOf("hasThread") < 0 || inject.indexOf('getElementById("drop-thread")') < 0) {
  fail("drop-preview.js inject must reuse an existing Tell the desk thread");
}
if (inject.indexOf("hasThread ? \"\"") < 0) {
  fail("drop-preview.js inject must skip a second Tell the desk card");
}
if (inject.indexOf("slimChrome") < 0 || inject.indexOf("stripHtml") < 0) {
  fail("drop-preview.js inject must skip This drop / Counter on /widget");
}
if (inject.indexOf("slim ? \"\"") < 0) {
  fail("drop-preview.js inject must omit #verify-strip when slim");
}
if (inject.indexOf("bar.hidden = slimChrome()") >= 0) {
  fail("drop-preview.js must not leave Talk as hidden-only on /widget");
}
if (inject.indexOf("talkBar") < 0 || inject.indexOf("slimChrome()") < 0 || inject.indexOf("removeChild") < 0) {
  fail("drop-preview.js inject must tear down the Talk bar on /widget");
}
if (inject.indexOf("id=\\\"verify-strip\\\"") < 0 && inject.indexOf("id=\"verify-strip\"") < 0) {
  fail("drop-preview.js must still paint This drop on /drop");
}
if (inject.indexOf("logHtml") < 0) {
  fail("drop-preview.js inject must skip Drops from this phone on /widget");
}
if (inject.indexOf("id=\\\"drop-log-card\\\"") < 0 && inject.indexOf("id=\"drop-log-card\"") < 0) {
  fail("drop-preview.js must still paint Drops from this phone on /drop");
}
if (yesNo.indexOf("Drop widget phone log leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget phone log leftover");
}
if (packMd.indexOf("Drop widget phone log leftover:") < 0) {
  fail("PACK.md must name Drop widget phone log leftover");
}
if (preview.indexOf("function widgetOn") < 0) fail("drop-preview.js must detect /widget path");
if (preview.indexOf("function slimChrome") < 0) fail("drop-preview.js must slim This drop on /widget");
if (yesNo.indexOf("Drop widget This drop leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget This drop leftover");
}
if (packMd.indexOf("Drop widget This drop leftover:") < 0) {
  fail("PACK.md must name Drop widget This drop leftover");
}
function runSlim(opts) {
  const sandbox = {
    document: {
      documentElement: { classList: { contains: function (c) { return !!opts.htmlWidget && c === "widget"; } } },
      body: { classList: { contains: function (c) {
        if (c === "embed") return !!opts.embed;
        if (c === "widget") return !!opts.widget;
        return false;
      } } }
    },
    location: { pathname: opts.path || "/drop", href: opts.href || "" }
  };
  sandbox.window = sandbox;
  sandbox.parent = opts.iframe ? {} : sandbox;
  const start = preview.indexOf("function embedOn");
  const end = preview.indexOf("function queryWs");
  vm.runInNewContext(preview.slice(start, end) + "\nthis.widgetOn = widgetOn;\nthis.slimChrome = slimChrome;", sandbox);
  return !!sandbox.slimChrome();
}
if (!runSlim({ path: "/widget" })) fail("/widget must skip This drop / Counter");
if (!runSlim({ path: "/widget.html" })) fail("/widget.html must skip This drop / Counter");
if (!runSlim({ path: "/drop", embed: true })) fail("embed /drop must skip This drop / Counter");
if (!runSlim({ path: "/drop", iframe: true })) fail("iframe /drop must skip This drop / Counter");
if (!runSlim({ widget: true, path: "/drop.html" })) fail("body.widget must skip This drop / Counter even when pathname is drop.html");
if (runSlim({ path: "/drop" })) fail("/drop must still paint This drop / Counter");
if (runSlim({ path: "/drop.html" })) fail("/drop.html must still paint This drop / Counter");
const hookTypeAt = preview.indexOf("function hookType");
const hookType = preview.slice(hookTypeAt, preview.indexOf("function hookSendAlias", hookTypeAt));
if (hookType.indexOf("if (window.AIADropChat) return") < 0) {
  fail("drop-preview.js hookType must yield Tell to chat on the one #drop-thread");
}
if (hookType.indexOf("if (last && /Type the work\\. A Desk AI drafts the card/") < 0) {
  fail("drop-preview.js empty Tell must skip a second blank-chat prompt");
}
if (yesNo.indexOf("Drop widget empty Tell leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget empty Tell leftover");
}
if (packMd.indexOf("Drop widget empty Tell leftover:") < 0) {
  fail("PACK.md must name Drop widget empty Tell leftover");
}
const chat = read("drop-chat.js");
if (chat.indexOf("if (last && /Type the work\\. A Desk AI drafts the card/") < 0) {
  fail("drop-chat.js empty Tell must skip a second blank-chat prompt");
}
if (yesNo.indexOf("Drop Tell click leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop Tell click leftover");
}
if (packMd.indexOf("Drop Tell click leftover:") < 0) {
  fail("PACK.md must name Drop Tell click leftover");
}
const nav = read("desk-nav.js");
if (nav.indexOf('loadDrop("drop-preview.js", "data-aia-drop-preview", function ()') < 0) {
  fail("desk-nav.js must load drop-chat.js after drop-preview.js");
}
if (yesNo.indexOf("Drop preview ask leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop preview ask leftover");
}
if (packMd.indexOf("Drop preview ask leftover:") < 0) {
  fail("PACK.md must name Drop preview ask leftover");
}
if (yesNo.indexOf("Drop widget Tell leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget Tell leftover");
}
if (packMd.indexOf("Drop widget Tell leftover:") < 0) {
  fail("PACK.md must name Drop widget Tell leftover");
}

["drop.html", "widget.html"].forEach(function (file) {
  const src = read(file);
  if (src.indexOf("The desk writes the card") >= 0) fail(file + " Put data on still says The desk writes the card");
  if (src.indexOf("What should the desk do with it?") >= 0) fail(file + " Put data on Tell still says What should the desk do with it");
  if (src.indexOf("What should a Desk AI draft?") < 0) fail(file + " Put data on Tell must say What should a Desk AI draft");
});
// Live lane copy was shortened in drop-app.js (Yes, then Start). Do not lock parked HTML.
if (app.indexOf("Paste the data. A Desk AI drafts the card. You still tap Yes, then Start.") < 0) {
  fail("Put data on must still say A Desk AI drafts the card and hold for Yes, then Start");
}
if (yesNo.indexOf("Drop Put data on Tell leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop Put data on Tell leftover");
}
if (packMd.indexOf("Drop Put data on Tell leftover:") < 0) {
  fail("PACK.md must name Drop Put data on Tell leftover");
}
const tip = read("aia-tip.js");
if (tip.indexOf("What should the desk do with it?") >= 0) fail("aia-tip.js drop-tell still says What should the desk do with it");
if (tip.indexOf("Tell the desk the next draft") >= 0) fail("aia-tip.js drop-tell still says Tell the desk the next draft");
if (tip.indexOf("What should a Desk AI draft?") < 0) fail("aia-tip.js drop-tell must say What should a Desk AI draft");
if (tip.indexOf("What the desk should do next") >= 0) fail("aia-tip.js drop-outcome still says What the desk should do next");
if (tip.indexOf("What a Desk AI should draft next") < 0) fail("aia-tip.js drop-outcome must say What a Desk AI should draft next");
const agent = read("drop-agent.js");
if (agent.indexOf("What the desk should do next") >= 0) fail("drop-agent.js Preferred outcome still says What the desk should do next");
if (agent.indexOf("Tap what the desk should do after this lands") >= 0) fail("drop-agent.js Advanced still says Tap what the desk should do");
if (agent.indexOf("What a Desk AI should draft next") < 0) fail("drop-agent.js Preferred outcome must say What a Desk AI should draft next");
if (yesNo.indexOf("Drop Preferred outcome leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop Preferred outcome leftover");
}
if (packMd.indexOf("Drop Preferred outcome leftover:") < 0) {
  fail("PACK.md must name Drop Preferred outcome leftover");
}
if (yesNo.indexOf("Drop Put data on leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop Put data on leftover");
}
if (packMd.indexOf("Drop Put data on leftover:") < 0) {
  fail("PACK.md must name Drop Put data on leftover");
}

const talk = read("drop-talk.js");
if (talk.indexOf("Talk the work in your words") >= 0) fail("drop-talk.js still says Talk the work in your words");
if (talk.indexOf("Then say drop it. Nobody sends money from here.") >= 0) {
  fail("drop-talk.js empty still says Then say drop it");
}
if (talk.indexOf("A Desk AI drafts the card") < 0) fail("drop-talk.js Hear this must say A Desk AI drafts the card");
if (talk.indexOf("You still tap Yes or Stop") < 0) fail("drop-talk.js must keep Yes or Stop");
const talkBootAt = talk.indexOf("function boot");
const talkBoot = talk.slice(talkBootAt, talk.indexOf("if (document.readyState", talkBootAt));
if (talk.indexOf("function widgetOn") < 0) fail("drop-talk.js must detect the /widget path");
if (talk.indexOf("function slimChrome") < 0 || talkBoot.indexOf("hushTalk()") < 0) {
  fail("drop-talk.js boot must tear down the Talk bar on /widget");
}
if (talk.indexOf('classList.contains("embed")') < 0 || talk.indexOf("window !== window.parent") < 0) {
  fail("drop-talk.js boot must still skip the Talk bar on embed");
}
function runTalkSkip(opts) {
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
  const start = talk.indexOf("function embedOn");
  const end = talk.indexOf("function status");
  vm.runInNewContext(talk.slice(start, end) + "\nthis.slimChrome = slimChrome;", sandbox);
  return !!sandbox.slimChrome();
}
if (!runTalkSkip({ path: "/widget" })) fail("/widget must skip the Talk bar");
if (!runTalkSkip({ path: "/widget.html" })) fail("/widget.html must skip the Talk bar");
if (!runTalkSkip({ path: "/widget/" })) fail("/widget/ must skip the Talk bar");
if (!runTalkSkip({ embed: true, path: "/drop" })) fail("embed /drop must skip the Talk bar");
if (!runTalkSkip({ iframe: true, path: "/drop" })) fail("iframe /drop must skip the Talk bar");
if (!runTalkSkip({ search: "?ws=springfield-shop&embed=1" })) fail("?embed=1 must skip the Talk bar");
if (!runTalkSkip({ widget: true, path: "/drop.html" })) fail("body.widget must skip the Talk bar even when pathname is drop.html");
if (!runTalkSkip({ htmlWidget: true, path: "/drop.html" })) fail("html.widget must skip the Talk bar even when pathname is drop.html");
if (!runTalkSkip({ href: "https://www.automateitaway.com/widget?ws=springfield-shop", path: "/drop.html" })) {
  fail("location.href /widget must skip the Talk bar even when pathname is drop.html");
}
if (runTalkSkip({ path: "/drop" })) fail("/drop must still paint the Talk bar");
if (runTalkSkip({ path: "/drop.html" })) fail("/drop.html must still paint the Talk bar");
if (runTalkSkip({ search: "?ws=springfield-shop" })) fail("/drop?ws= must still paint the Talk bar");
function runTalkTeardown(opts) {
  const ids = {};
  function classList(initial) {
    const set = {};
    (initial || []).forEach(function (c) { set[c] = true; });
    return {
      contains: function (c) { return !!set[c]; },
      add: function (c) { set[c] = true; },
      remove: function (c) { delete set[c]; },
      toggle: function () {}
    };
  }
  const talkBar = {
    id: "talkBar",
    hidden: true,
    classList: classList(["talk-bar"]),
    parentNode: null,
    querySelector: function () { return null; }
  };
  const parent = {
    removeChild: function (n) {
      if (n === talkBar) { delete ids.talkBar; talkBar.parentNode = null; }
    }
  };
  talkBar.parentNode = parent;
  ids.talkBar = talkBar;
  const sandbox = {
    document: {
      documentElement: { classList: classList() },
      body: { classList: classList(opts.bodyClass ? [opts.bodyClass] : []) },
      head: { appendChild: function () {} },
      readyState: "complete",
      getElementById: function (id) { return ids[id] || null; },
      createElement: function () { return { id: "", textContent: "" }; },
      addEventListener: function () {},
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; }
    },
    location: {
      pathname: opts.path || "/drop",
      search: opts.search || "",
      href: opts.href || ("https://www.automateitaway.com" + (opts.path || "/drop")),
      hash: ""
    },
    addEventListener: function () {},
    URLSearchParams: URLSearchParams
  };
  sandbox.window = sandbox;
  sandbox.parent = opts.iframe ? {} : sandbox;
  vm.runInNewContext(talk, sandbox);
  return !ids.talkBar;
}
if (!runTalkTeardown({ path: "/widget" })) fail("/widget boot must remove #talkBar from the DOM");
if (!runTalkTeardown({ path: "/widget", search: "?embed=1" })) fail("/widget?embed=1 boot must remove #talkBar from the DOM");
if (!runTalkTeardown({ path: "/drop", search: "?embed=1" })) fail("embed /drop boot must remove #talkBar from the DOM");
if (runTalkTeardown({ path: "/drop" })) fail("/drop boot must keep #talkBar in the DOM");
if (runTalkTeardown({ path: "/drop.html" })) fail("/drop.html boot must keep #talkBar in the DOM");
if (yesNo.indexOf("Drop widget Talk chrome leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget Talk chrome leftover");
}
if (packMd.indexOf("Drop widget Talk chrome leftover:") < 0) {
  fail("PACK.md must name Drop widget Talk chrome leftover");
}
if (dropMd.indexOf("tears down `#talkBar`") < 0) {
  fail("DROP.md must say slimChrome tears down #talkBar");
}
if (dropMd.indexOf("display:none!important") < 0) {
  fail("DROP.md must say .widget hard-hides Talk with display:none!important");
}
if (dropMd.indexOf("Probe /widget vs /drop Talk") < 0) {
  fail("DROP.md must include Probe /widget vs /drop Talk");
}
if (dropMd.indexOf("Probe Drop tab vs /widget") < 0) {
  fail("DROP.md must include Probe Drop tab vs /widget");
}
if (yesNo.indexOf("Drop tab full Drop leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop tab full Drop leftover");
}
if (packMd.indexOf("Drop tab full Drop leftover:") < 0) {
  fail("PACK.md must name Drop tab full Drop leftover");
}
if (talk.indexOf("display:none!important") < 0 || talk.indexOf("body.widget #talkBar") < 0) {
  fail("drop-talk.js must hard-hide #talkBar on .widget so preview cannot unhide");
}
["drop.html", "widget.html"].forEach(function (file) {
  const src = read(file);
  if (src.indexOf("drop-page.css") < 0) fail(file + " must load drop-page.css so .widget hard-hides Talk");
});
// 1ec1382 moved the .widget Talk hide out of the HTML / ui-fix.css into drop-page.css
// (drop-talk.js still injects the same rule). /widget must not paint Hear this.
const dropPage = read("drop-page.css");
if (dropPage.indexOf("html.widget #talkBar") < 0 || dropPage.indexOf("body.widget #talkBar") < 0) {
  fail("drop-page.css must hard-hide #talkBar on .widget so .talk-bar flex cannot paint Hear this");
}
if (dropPage.indexOf("display:none!important") < 0) {
  fail("drop-page.css must hard-hide #talkBar with display:none!important");
}
const dropHtmlSrc = read("drop.html");
if (dropHtmlSrc.indexOf('classList.add("widget")') < 0) {
  fail("drop.html must stamp html.widget on /widget so Talk CSS hide applies on the drop.html rewrite");
}
if (yesNo.indexOf("Drop widget Talk bar leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget Talk bar leftover");
}
if (packMd.indexOf("Drop widget Talk bar leftover:") < 0) {
  fail("PACK.md must name Drop widget Talk bar leftover");
}
if (yesNo.indexOf("Drop widget standalone Talk bar leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget standalone Talk bar leftover");
}
if (packMd.indexOf("Drop widget standalone Talk bar leftover:") < 0) {
  fail("PACK.md must name Drop widget standalone Talk bar leftover");
}
if (dropMd.indexOf("`/widget`, embed, and `?embed=1` skip the Talk bar") < 0) {
  fail("DROP.md must say /widget skips the Talk bar");
}
if (dropMd.indexOf("`/drop` still paints Talk") < 0) {
  fail("DROP.md must keep Talk on /drop");
}
if (yesNo.indexOf("Drop widget steps rail leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget steps rail leftover");
}
if (packMd.indexOf("Drop widget steps rail leftover:") < 0) {
  fail("PACK.md must name Drop widget steps rail leftover");
}
if (yesNo.indexOf("Drop widget Drop-tab rail leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget Drop-tab rail leftover");
}
if (packMd.indexOf("Drop widget Drop-tab rail leftover:") < 0) {
  fail("PACK.md must name Drop widget Drop-tab rail leftover");
}
const steps = read("drop-steps.js");
if (steps.indexOf("function widgetOn") < 0) fail("drop-steps.js must detect the /widget path");
if (steps.indexOf("if (!onDrop() || embedOn() || widgetOn()) return") < 0) {
  fail("drop-steps.js boot must skip the step rail on /widget");
}
if (steps.indexOf("function slimChrome") < 0 || steps.indexOf("if (slimChrome()) hush()") < 0) {
  fail("drop-steps.js must hush #drop-steps on /widget via slimChrome");
}
const hrefSrc = read("desk-switch.js");
const hrefAt = hrefSrc.indexOf("function widgetHref");
const hrefFn = hrefSrc.slice(hrefAt, hrefSrc.indexOf("function captureDesk"));
if (hrefFn.indexOf('return "/drop"') < 0 || hrefFn.indexOf('"/drop?ws="') < 0) {
  fail("widgetHref must point the Drop tab at /drop so the rail paints");
}
if (hrefFn.indexOf('"/widget?ws="') >= 0 || hrefFn.indexOf('return "/widget"') >= 0) {
  fail("widgetHref must not send the Drop tab to /widget");
}
if (yesNo.indexOf("Drop widget pick href leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name Drop widget pick href leftover");
}
if (packMd.indexOf("Drop widget pick href leftover:") < 0) {
  fail("PACK.md must name Drop widget pick href leftover");
}
if (dropMd.indexOf("stays on `/widget?ws=`") < 0) {
  fail("DROP.md must say /widget world pick stays on /widget?ws=");
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
if (pickHref.indexOf("AIADesks.widgetHref") >= 0) {
  fail("drop-pick.js must not use widgetHref — Drop tab /drop must not dump /widget pick onto the rail");
}
if (now.indexOf("function dropHref") < 0) fail("drop-now.js must pick /widget vs /drop for recent desks");
if (now.indexOf("location.href = dropHref(") < 0) {
  fail("drop-now.js recent public desks must use dropHref");
}
if (now.indexOf('location.href = "/drop?ws="') >= 0) {
  fail("drop-now.js recent public desks must not always dump to /drop");
}
if (now.indexOf("AIADesks.widgetHref") >= 0) {
  fail("drop-now.js must not use widgetHref — Drop tab /drop must not dump /widget recent desks onto the rail");
}
["drop.html", "widget.html"].forEach(function (file) {
  const src = read(file);
  if (src.indexOf("Talk the work in your words") >= 0) fail(file + " Talk bar still says Talk the work in your words");
});
// Live Talk copy is asserted on drop-talk.js above. Do not lock parked HTML #talkStatus / #drop-sub.

console.log("check-drop-ux: ok");
