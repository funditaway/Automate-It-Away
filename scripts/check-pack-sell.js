#!/usr/bin/env node
require("./_env-guard");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function must(hay, needle, label) {
  if (!hay.includes(needle)) throw new Error("missing " + label + ": " + needle);
}

const help = read("help.html");
const studio = read("developer.html");
const studioJs = read("developer.js");
const more = read("more.html");
const account = read("account.html");
const walletUi = read("aia-wallet.js");
const packMd = read("PACK.md");
const yesNo = read("ACCOUNT-YES-NO.md");

must(help, 'id="sell-packs"', "help.html sell-packs card");
must(help, "Selling packs — risk honesty", "help.html sell-packs title");
must(help, "Not legal advice", "help.html not legal advice");
must(help, "thin JSON", "help.html thin JSON");
must(help, "buyer", "help.html buyer desk");
must(help, "Yes / Stop / Kill", "help.html Yes/Stop/Kill");
must(help, "Collect stays HOLD", "help.html Collect HOLD");
must(help, "Never hardcode yours", "help.html never hardcode");
must(help, "100% safe", "help.html no 100% safe");
must(help, "never banned", "help.html never banned");
must(help, "stands behind the pack", "help.html creator stands behind");
must(help, "Help is not legal advice", "help.html help not counsel");
must(help, "Talk to AIA", "help.html Talk to AIA");
must(help, "Marketplace can unlist", "help.html unlist");
must(help, "AS IS", "help.html AS IS");
must(help, "does not attach legal terms", "help.html no AIA attach flow");
must(help, "does not run chargeback holds", "help.html no chargeback hold");
must(help, "payout freezes", "help.html no payout freeze");
must(help, "sandbox throttle ladder", "help.html no throttle ladder");

must(help, 'id="pack-worth"', "help.html pack-worth card");
must(help, "When a pack is worth it", "help.html pack-worth title");
must(help, "process already works", "help.html worth it works");
must(help, "qualify → draft", "help.html qualify draft");
must(help, "fallbacks", "help.html fallbacks");
must(help, "Abandoned when APIs change", "help.html abandoned APIs");
must(help, "webhook", "help.html trivial webhook");
must(help, "Drop yourself", "help.html drop yourself");

must(help, 'id="creator-takeaways"', "help.html creator takeaways");
must(help, "Creator takeaways", "help.html takeaways title");
must(help, "buyer keys", "help.html takeaways buyer keys");
must(help, "@handle", "help.html takeaways handle");
must(help, "Owner vs Helper", "help.html takeaways owner helper");
must(help, "No email Team seats", "help.html takeaways no email seats");
must(help, "No merchant-of-record money desk", "help.html takeaways no MoR");
must(help, "No social OAuth auto-post", "help.html takeaways no social OAuth");

must(help, "Your wallet. AIA does not hold keys", "help.html wallet honesty");
must(help, "Collect and pack pay stay HOLD", "help.html pack pay HOLD");
must(help, ".aia Register when Bridge unlocks", "help.html Register when Bridge");
must(help, "not compute credits", "help.html not compute credits");
must(help, "creator payout ledger", "help.html not payout ledger");
must(help, "Collect and payouts HOLD", "help.html collect payouts HOLD");
must(help, "Not Wallet.AIA", "help.html not Wallet.AIA");

must(studio, "Selling packs.", "studio sell-packs one-liner");
must(studio, "/help#sell-packs", "studio sell-packs link");
must(studio, "Help is not legal advice", "studio not legal advice");
const zlib = require("zlib");
function decodeStudio(raw) {
  try { return zlib.gunzipSync(Buffer.from(String(raw).replace(/\s+/g, ""), "base64")).toString("utf8"); }
  catch (e) { return ""; }
}
const studioPack = decodeStudio(read("developer.z64.txt"));
if (studioJs.indexOf('fetch("/developer.z64.txt"') < 0 || studioJs.indexOf('DecompressionStream("gzip")') < 0) {
  throw new Error("Studio loader must unpack developer.z64.txt");
}
if (!studioPack || studioPack.indexOf("Creators Studio") < 0) throw new Error("developer.z64.txt must decode as Creators Studio");
must(studioPack, "Selling packs.", "studio pack sell-packs one-liner");
must(studioPack, "/help#sell-packs", "studio pack sell-packs link");
must(studioPack, "Help is not legal advice", "studio pack not legal advice");
must(studioPack, "Collect stays HOLD", "studio pack Collect HOLD");
must(more, "/help#sell-packs", "more.html sell-packs link");
must(more, "/help#pack-worth", "more.html pack-worth link");

must(account, "Your wallet. AIA does not hold keys", "account.html wallet honesty");
must(account, "Collect and pack pay stay HOLD", "account.html pack pay HOLD");
must(account, ".aia Register when Bridge unlocks", "account.html Register when Bridge");
must(account, "not compute credits", "account.html not compute credits");
must(account, "creator payout ledger", "account.html not payout ledger");
must(walletUi, "Your wallet. AIA does not hold keys", "aia-wallet.js honesty");
must(walletUi, "not compute credits", "aia-wallet.js not compute credits");
must(walletUi, "creator payout ledger", "aia-wallet.js not payout ledger");
must(walletUi, "Collect and pack pay stay HOLD", "aia-wallet.js Collect HOLD");
must(walletUi, ".aia Register when Bridge unlocks", "aia-wallet.js Register when Bridge");

must(packMd, "Selling packs — risk honesty", "PACK.md risk honesty");
must(packMd, "When a pack is worth it", "PACK.md pack worth");
must(yesNo, "Selling packs — risk honesty", "ACCOUNT-YES-NO risk honesty");
must(yesNo, "When a pack is worth it", "ACCOUNT-YES-NO pack worth");

const sell = help.slice(help.indexOf('id="sell-packs"'), help.indexOf('id="pack-worth"'));
const worth = help.slice(help.indexOf('id="pack-worth"'), help.indexOf('id="creator-takeaways"'));
[sell, worth].forEach(function (chunk, i) {
  const name = i === 0 ? "sell-packs" : "pack-worth";
  if (/\$47|\$197|\$50|300 hours|10\s*[–-]\s*15\s*minutes/i.test(chunk)) {
    throw new Error(name + " invented $ or hours table");
  }
});

["Lemon Squeezy", "Paddle"].forEach(function (bit) {
  if (sell.includes(bit)) throw new Error("sell-packs must not invent " + bit + " as an AIA pipe");
});

["Login Kit", "auto-schedule", "aiastudios.app", "compute credits wallet"].forEach(function (bit) {
  if (help.includes(bit) || studio.includes(bit) || studioJs.includes(bit) || studioPack.includes(bit)) {
    throw new Error("invented fiction: " + bit);
  }
});


function sliceFn(src, name) {
  const start = src.indexOf("async function " + name) >= 0 ? src.indexOf("async function " + name) : src.indexOf("function " + name);
  if (start < 0) return "";
  const next = src.slice(start + 10).search(/\n  (async )?function /);
  return src.slice(start, next >= 0 ? start + 10 + next : start + 1200);
}
const bootFn = sliceFn(studioPack, "boot");
const submitFn = sliceFn(studioPack, "submitPack");
const saveFn = sliceFn(studioPack, "saveDraft");
const bindFn = sliceFn(studioPack, "bindLab");
if (!submitFn) throw new Error("Studio missing submitPack");
if (!bindFn || bindFn.indexOf("submit-pack") < 0 || bindFn.indexOf("stagePublish") < 0 || bindFn.indexOf("pack-yes") < 0 || bindFn.indexOf("yesPublish") < 0) {
  throw new Error("Publish must wait for a Yes before it lists");
}
if (/subBtn\.onclick\s*=\s*submitPack/.test(bindFn)) {
  throw new Error("Publish must not list on the first tap");
}
const stageFn = sliceFn(studioPack, "stagePublish");
const stopFn = sliceFn(studioPack, "stopPublish");
if (!stageFn) throw new Error("Studio missing stagePublish");
if (!stopFn) throw new Error("Studio missing stopPublish");
if (stageFn.indexOf("submitPack") >= 0 || /post\(\s*"submit-pack"/.test(stageFn) || /post\(\s*"list-pack"/.test(stageFn)) {
  throw new Error("Publish tap must not list until Yes");
}
if (stopFn.indexOf("submitPack") >= 0 || /post\(\s*"submit-pack"/.test(stopFn) || /post\(\s*"list-pack"/.test(stopFn)) {
  throw new Error("Stop must not list a pack");
}
if (bootFn && (bootFn.indexOf("submitPack") >= 0 || bootFn.indexOf("submit-pack") >= 0)) {
  throw new Error("Studio boot must not publish a pack");
}
if (saveFn.indexOf("list-pack") >= 0 && /status:\s*"listed"|submit:\s*true/.test(saveFn)) {
  throw new Error("Save draft must not list the pack on Market");
}
if (/charged:\s*true/.test(studioPack) || /charged:\s*true/.test(walletUi) || /charged:\s*true/.test(account)) {
  throw new Error("Studio, wallet, or account must not send charged:true");
}
if (submitFn.indexOf("charged") >= 0 && /charged:\s*true/.test(submitFn)) {
  throw new Error("Publish must not charge");
}
if (/action:\s*"payout"|action:\s*"withdraw"|action:\s*"pay-out"/.test(studioPack + walletUi + account)) {
  throw new Error("Studio, wallet, or account must not pay out");
}
must(studioPack, "No silent charge", "studio pack no silent charge");
must(studioPack, "no public payout baseline", "studio pack no payout baseline");
if (help.indexOf("Collect and payouts HOLD") < 0 && help.indexOf("Collect and pack pay stay HOLD") < 0) {
  throw new Error("help must keep payouts HOLD");
}

function unique(rows) {
  const out = [];
  rows.forEach(function (row) { if (out.indexOf(row) < 0) out.push(row); });
  return out;
}
function sellFaults(loader, pack, helpSrc, accountSrc, walletSrc) {
  const bad = [];
  const hasLoader = loader.indexOf('fetch("/developer.z64.txt"') >= 0 && loader.indexOf('DecompressionStream("gzip")') >= 0;
  if (!hasLoader || !pack || pack.indexOf("Selling packs.") < 0 || pack.indexOf("/help#sell-packs") < 0) {
    bad.push("Studio sell-packs copy gone");
  }
  const boot = sliceFn(pack, "boot");
  const submit = sliceFn(pack, "submitPack");
  const bind = sliceFn(pack, "bindLab");
  const save = sliceFn(pack, "saveDraft");
  if (!submit || !bind || bind.indexOf("submit-pack") < 0 || bind.indexOf("stagePublish") < 0 || bind.indexOf("pack-yes") < 0 || bind.indexOf("yesPublish") < 0 || (boot && (boot.indexOf("submitPack") >= 0 || boot.indexOf("submit-pack") >= 0)) || (save && /status:\s*"listed"|submit:\s*true/.test(save))) {
    bad.push("list/publish without Yes");
  }
  if (/charged:\s*true/.test(pack) || /charged:\s*true/.test(walletSrc) || /charged:\s*true/.test(accountSrc) || (submit && /charged:\s*true/.test(submit))) {
    bad.push("charge without Yes");
  }
  if (/action:\s*"payout"|action:\s*"withdraw"|action:\s*"pay-out"/.test(pack + walletSrc + accountSrc)) {
    bad.push("payout without Yes");
  }
  if (helpSrc.indexOf("Collect and pack pay stay HOLD") < 0 && helpSrc.indexOf("Collect and payouts HOLD") < 0) {
    bad.push("payout without Yes");
  }
  if (walletSrc.indexOf("Collect and pack pay stay HOLD") < 0 || accountSrc.indexOf("Collect and pack pay stay HOLD") < 0) {
    bad.push("payout without Yes");
  }
  return unique(bad);
}
function applyMutant(kind, files) {
  const next = { loader: files.loader, pack: files.pack, helpSrc: files.helpSrc, accountSrc: files.accountSrc, walletSrc: files.walletSrc };
  if (kind === "Studio sell-packs copy gone") {
    next.pack = next.pack.replace(/Selling packs\./g, "Move product.").replace(/\/help#sell-packs/g, "/help#skip");
  } else if (kind === "charge without Yes") {
    next.pack = next.pack.replace("async function submitPack()", "async function submitPack(){ await post(\"submit-pack\", { charged: true }); }\nasync function submitPackOld") + "\ncharged: true";
  } else if (kind === "list/publish without Yes") {
    next.pack = next.pack.replace("async function boot()", "async function boot(){ submitPack(); }\nasync function bootOld");
  } else if (kind === "payout without Yes") {
    next.walletSrc = next.walletSrc.replace(/Collect and pack pay stay HOLD/g, "Pack pay is sent now") + '\nfetch("/api/desks",{method:"POST",body:JSON.stringify({action:"payout"})});';
    next.accountSrc = next.accountSrc.replace(/Collect and pack pay stay HOLD/g, "Pack pay is sent now");
    next.helpSrc = next.helpSrc.replace(/Collect and pack pay stay HOLD/g, "Pack pay is sent now").replace(/Collect and payouts HOLD/g, "Payouts go out now");
    next.pack = next.pack + '\n{ action: "payout" }';
  }
  return next;
}

let failed = 0;
function fail(msg) { failed += 1; console.error("FAIL " + msg); }
function pass(msg) { console.log("ok  " + msg); }

const files = { loader: studioJs, pack: studioPack, helpSrc: help, accountSrc: account, walletSrc: walletUi };
const live = sellFaults(files.loader, files.pack, files.helpSrc, files.accountSrc, files.walletSrc);
if (live.length) fail("pack sell behaviour drifted: " + live.join("; "));
else pass("sell honesty, human Publish, and Collect/payout HOLD still hold");

const mutants = ["Studio sell-packs copy gone", "charge without Yes", "list/publish without Yes", "payout without Yes"];
let caught = 0;
mutants.forEach(function (kind) {
  const next = applyMutant(kind, files);
  const faults = sellFaults(next.loader, next.pack, next.helpSrc, next.accountSrc, next.walletSrc);
  if (faults.indexOf(kind) < 0) fail("mutant missed: " + kind + " (got " + JSON.stringify(faults) + ")");
  else { caught += 1; pass("mutant caught: " + kind); }
});
if (caught !== mutants.length) fail("mutants: " + caught + "/" + mutants.length + " caught");
else pass("mutants: " + caught + "/" + mutants.length + " caught");

// ---- jsdom-style DOM stub: Publish must wait for Yes ----
const VOID = { AREA:1, BASE:1, BR:1, COL:1, EMBED:1, HR:1, IMG:1, INPUT:1, LINK:1, META:1, PARAM:1, SOURCE:1, TRACK:1, WBR:1 };
function decodeEnt(s) {
  return String(s || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
function El(tag) {
  this.tagName = String(tag || "div").toUpperCase();
  this.attrs = {};
  this.childNodes = [];
  this.parentNode = null;
  this.className = "";
  this.hidden = false;
  this.disabled = false;
  this.type = "";
  this.value = "";
  this.href = "";
  this.style = {};
  this.handlers = {};
  this.onclick = null;
  this._text = "";
  const self = this;
  this.classList = {
    add(c) { const l = self.className.split(/\s+/).filter(Boolean); if (l.indexOf(c) < 0) l.push(c); self.className = l.join(" "); },
    remove(c) { self.className = self.className.split(/\s+/).filter((x) => x && x !== c).join(" "); },
    contains(c) { return self.className.split(/\s+/).indexOf(c) >= 0; }
  };
}
El.prototype = {
  get id() { return this.attrs.id || ""; },
  set id(v) { this.attrs.id = String(v); },
  setAttribute(k, v) {
    k = String(k);
    if (v == null) this.attrs[k] = "";
    else this.attrs[k] = String(v);
    if (k === "id") this.attrs.id = String(v);
    if (k === "class") this.className = String(v);
    if (k === "type") this.type = String(v);
    if (k === "href") this.href = String(v);
    if (k === "value") this.value = String(v);
    if (k === "hidden") this.hidden = true;
    if (k === "disabled") this.disabled = true;
  },
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; },
  removeChild(c) { this.childNodes = this.childNodes.filter((x) => x !== c); c.parentNode = null; return c; },
  get children() { return this.childNodes.filter((n) => n.tagName && n.tagName !== "#TEXT"); },
  set textContent(v) { this.childNodes = []; this._text = String(v == null ? "" : v); },
  get textContent() { return this._text + this.childNodes.map((c) => c.textContent).join(""); },
  addEventListener(t, fn) { (this.handlers[t] = this.handlers[t] || []).push(fn); },
  click() {
    const ev = { target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} };
    const chain = [];
    let n = this;
    while (n) { chain.push(n); n = n.parentNode; }
    chain.forEach((node) => {
      if (typeof node.onclick === "function") node.onclick(ev);
      (node.handlers.click || []).forEach((fn) => fn(ev));
    });
  },
  matches(sel) { return matchesSel(this, sel); },
  closest(sel) { let n = this; while (n) { if (n.tagName && n.tagName !== "#TEXT" && matchesSel(n, sel)) return n; n = n.parentNode; } return null; },
  querySelectorAll(sel) { return queryAll(this, sel, false); },
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
};
Object.defineProperty(El.prototype, "innerHTML", {
  get() { return this._html || ""; },
  set(v) {
    this._html = String(v == null ? "" : v);
    this.childNodes = [];
    this._text = "";
    parseHTML(this, this._html);
  }
});
function walk(n, fn) { fn(n); (n.childNodes || []).forEach((c) => walk(c, fn)); }
function matchesSel(n, sel) {
  sel = String(sel || "").trim();
  if (!sel) return false;
  if (sel.indexOf(",") >= 0) return sel.split(",").some((s) => matchesSel(n, s.trim()));
  if (/\s/.test(sel)) return false;
  let rest = sel;
  let tag = null;
  let id = null;
  const classes = [];
  const attrs = [];
  const tagM = /^[a-z][a-z0-9]*/i.exec(rest);
  if (tagM && rest[0] !== "#" && rest[0] !== "." && rest[0] !== "[") {
    tag = tagM[0].toUpperCase();
    rest = rest.slice(tagM[0].length);
  }
  while (rest) {
    let m;
    if ((m = /^#([\w-]+)/.exec(rest))) { id = m[1]; rest = rest.slice(m[0].length); }
    else if ((m = /^\.([\w-]+)/.exec(rest))) { classes.push(m[1]); rest = rest.slice(m[0].length); }
    else if ((m = /^\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/.exec(rest))) {
      attrs.push({ k: m[1], v: m[2] != null ? m[2] : (m[3] != null ? m[3] : (m[4] != null ? m[4] : null)) });
      rest = rest.slice(m[0].length);
    } else return false;
  }
  if (tag && n.tagName !== tag) return false;
  if (id && n.id !== id) return false;
  for (let i = 0; i < classes.length; i++) if (!n.classList.contains(classes[i])) return false;
  for (let i = 0; i < attrs.length; i++) {
    const got = n.getAttribute(attrs[i].k);
    if (attrs[i].v == null) { if (got == null) return false; }
    else if (got !== attrs[i].v) return false;
  }
  return !!(tag || id || classes.length || attrs.length);
}
function queryAll(root, sel, includeSelf) {
  sel = String(sel || "").trim();
  if (!sel) return [];
  if (sel.indexOf(",") >= 0) {
    const out = [];
    sel.split(",").forEach((part) => {
      queryAll(root, part.trim(), includeSelf).forEach((n) => { if (out.indexOf(n) < 0) out.push(n); });
    });
    return out;
  }
  const parts = sel.split(/\s+/).filter(Boolean);
  function collect(node, part, acc, selfOk) {
    walk(node, (n) => { if ((selfOk || n !== node) && n.tagName && n.tagName !== "#TEXT" && matchesSel(n, part)) acc.push(n); });
  }
  if (parts.length === 1) {
    const acc = [];
    collect(root, parts[0], acc, includeSelf);
    return acc;
  }
  let curr = [];
  collect(root, parts[0], curr, includeSelf);
  for (let i = 1; i < parts.length; i++) {
    const next = [];
    curr.forEach((c) => collect(c, parts[i], next, false));
    curr = next;
  }
  return curr;
}
function parseAttrs(raw, el) {
  const re = /([:@\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(raw))) {
    const k = m[1];
    const v = m[2] != null ? m[2] : (m[3] != null ? m[3] : (m[4] != null ? m[4] : ""));
    el.setAttribute(k, v);
  }
}
function parseHTML(parent, html) {
  html = String(html || "");
  let i = 0;
  function parseInto(owner) {
    while (i < html.length) {
      if (html[i] !== "<") {
        const lt = html.indexOf("<", i);
        const text = html.slice(i, lt < 0 ? html.length : lt);
        i = lt < 0 ? html.length : lt;
        if (text) {
          const t = new El("#text");
          t._text = decodeEnt(text);
          owner.appendChild(t);
        }
        continue;
      }
      if (html.startsWith("<!--", i)) {
        const end = html.indexOf("-->", i + 4);
        i = end < 0 ? html.length : end + 3;
        continue;
      }
      const close = /^<\/([a-z][a-z0-9]*)\s*>/i.exec(html.slice(i));
      if (close) {
        i += close[0].length;
        if (close[1].toUpperCase() === owner.tagName) return;
        continue;
      }
      const open = /^<([a-z][a-z0-9]*)\b([^>]*?)(\/?)\s*>/i.exec(html.slice(i));
      if (!open) { i += 1; continue; }
      i += open[0].length;
      const el = new El(open[1]);
      parseAttrs(open[2], el);
      owner.appendChild(el);
      const selfClose = !!open[3] || VOID[el.tagName];
      if (!selfClose) parseInto(el);
    }
  }
  parseInto(parent);
}

function bodyOf(call) {
  try { return JSON.parse((call.init && call.init.body) || "{}"); } catch (e) { return {}; }
}
function isListPost(call) {
  if (String(call.url).indexOf("/api/desks") < 0) return false;
  if (String((call.init && call.init.method) || "GET").toUpperCase() !== "POST") return false;
  const body = bodyOf(call);
  if (body.action === "submit-pack" || body.action === "publish-pack") return true;
  if (body.action === "list-pack" && (body.submit === true || body.status === "submitted" || body.status === "listed" || body.status === "published" || body.visibility === "listed")) return true;
  return false;
}
function isDraftPost(call) {
  if (String(call.url).indexOf("/api/desks") < 0) return false;
  if (String((call.init && call.init.method) || "GET").toUpperCase() !== "POST") return false;
  const body = bodyOf(call);
  return body.action === "list-pack" && body.status === "draft" && body.submit !== true && body.visibility !== "listed";
}
function isPrivatePost(call) {
  if (String(call.url).indexOf("/api/desks") < 0) return false;
  if (String((call.init && call.init.method) || "GET").toUpperCase() !== "POST") return false;
  const body = bodyOf(call);
  return body.action === "private-pack" || body.visibility === "private";
}

async function flush(n) {
  for (let i = 0; i < (n || 12); i++) await new Promise((r) => setImmediate(r));
}

function runStudio(packSrc) {
  const html = new El("html");
  const head = new El("head");
  const body = new El("body");
  html.appendChild(head);
  html.appendChild(body);
  const view = new El("div");
  view.id = "view";
  view.setAttribute("id", "view");
  const err = new El("p");
  err.id = "err";
  err.setAttribute("id", "err");
  const ok = new El("p");
  ok.id = "ok";
  ok.setAttribute("id", "ok");
  body.appendChild(err);
  body.appendChild(ok);
  body.appendChild(view);
  const doc = {
    readyState: "complete",
    documentElement: html,
    head: head,
    body: body,
    listeners: {},
    createElement(t) { return new El(t); },
    getElementById(id) { let hit = null; walk(html, (n) => { if (!hit && n.id === id) hit = n; }); return hit; },
    querySelectorAll(s) { return queryAll(html, s, true); },
    querySelector(s) { return queryAll(html, s, true)[0] || null; },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  };
  const calls = [];
  const errors = [];
  const store = { aia_session: "tok_test", aia_ws: "test-desk" };
  function respond(url, init) {
    const u = String(url);
    const method = String((init && init.method) || "GET").toUpperCase();
    let body = {};
    try { body = JSON.parse((init && init.body) || "{}"); } catch (e) { body = {}; }
    if (u.indexOf("/api/account") >= 0) return { status: 200, body: { ok: true, account: { id: "a1" }, plan: { creator: true, plan: "dev" } } };
    if (u.indexOf("/api/health") >= 0) return { status: 200, body: { automation: { grok: { on: true } } } };
    if (method === "GET" && u.indexOf("/api/desks") >= 0) return { status: 200, body: { ok: true, packs: [], official: [] } };
    if (method === "POST" && u.indexOf("/api/desks") >= 0) return { status: 200, body: { ok: true, note: "ok" } };
    return { status: 404, body: { ok: false } };
  }
  const loc = { pathname: "/studio", href: "https://x.test/studio", search: "", hash: "" };
  const win = {};
  const ctx = {
    window: win,
    document: doc,
    location: loc,
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; }
    },
    fetch(url, init) {
      calls.push({ url: String(url), init: init || {} });
      const r = respond(url, init || {});
      return Promise.resolve({
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        json() { return Promise.resolve(JSON.parse(JSON.stringify(r.body))); },
        text() { return Promise.resolve(JSON.stringify(r.body)); }
      });
    },
    setTimeout() { return 0; },
    clearTimeout() {},
    console: { log() {}, warn() {}, error(e) { errors.push(String(e)); } },
    JSON, Object, Array, String, Number, Boolean, Promise, RegExp, Error, Math, Date, parseInt, isNaN, undefined
  };
  win.window = win;
  win.document = doc;
  win.location = loc;
  win.AIAMail = undefined;
  win.AIAPlaybook = undefined;
  ctx.window.fetch = ctx.fetch;
  vm.createContext(ctx);
  try { vm.runInContext(packSrc, ctx, { filename: "developer.pack.js" }); }
  catch (e) { errors.push("boot: " + (e && e.stack ? e.stack : e.message)); }
  return { doc, calls, errors, ctx };
}

async function goToSubmit(page) {
  await flush(16);
  const packTab = page.doc.querySelector('[data-tab="pack"]');
  if (!packTab) throw new Error("missing Pack tab after boot: " + page.errors.join(" | "));
  packTab.click();
  await flush(4);
  const name = page.doc.getElementById("name");
  if (!name) throw new Error("missing #name on Pack tab");
  name.value = "Saturday oil-change lane";
  const submitTab = page.doc.querySelector('[data-tab="submit"]');
  if (!submitTab) throw new Error("missing Submit tab");
  submitTab.click();
  await flush(4);
}

function listCalls(page) { return page.calls.filter(isListPost); }
function postsAfter(page, n) { return page.calls.slice(n); }

async function scenario(packSrc, kind) {
  const page = runStudio(packSrc);
  await goToSubmit(page);
  const before = page.calls.length;
  const pub = page.doc.getElementById("submit-pack");
  if (!pub) throw new Error("missing #submit-pack");
  if (kind === "private") {
    const priv = page.doc.getElementById("private-pack");
    if (!priv) throw new Error("missing #private-pack");
    priv.click();
    await flush(8);
    return { page, listed: postsAfter(page, before).some(isListPost), privated: postsAfter(page, before).some(isPrivatePost), drafted: postsAfter(page, before).some(isDraftPost) };
  }
  if (kind === "draft") {
    const packTab = page.doc.querySelector('[data-tab="pack"]');
    packTab.click();
    await flush(4);
    const name = page.doc.getElementById("name");
    if (name) name.value = "Saturday oil-change lane";
    const save = page.doc.getElementById("save-pack");
    if (!save) throw new Error("missing #save-pack");
    const mid = page.calls.length;
    save.click();
    await flush(8);
    return { page, listed: postsAfter(page, mid).some(isListPost), drafted: postsAfter(page, mid).some(isDraftPost), privated: false };
  }
  pub.click();
  const decideNow = page.doc.getElementById("pack-decide");
  const draftNow = page.doc.getElementById("pack-draft");
  const decideShown = !!(decideNow && decideNow.hidden === false);
  const draftOn = !!(draftNow && draftNow.classList.contains("on"));
  const draftText = draftNow ? draftNow.textContent : "";
  await flush(8);
  const afterPub = {
    listed: postsAfter(page, before).some(isListPost),
    decideShown: decideShown,
    draftOn: draftOn,
    draftText: draftText
  };
  if (kind === "publish-only") return Object.assign({ page }, afterPub);
  if (kind === "yes") {
    const yes = page.doc.getElementById("pack-yes");
    if (!yes) throw new Error("missing #pack-yes");
    const mid = page.calls.length;
    yes.click();
    await flush(8);
    return Object.assign({ page, listedAfterYes: postsAfter(page, mid).some(isListPost) }, afterPub, { listed: postsAfter(page, mid).some(isListPost) });
  }
  if (kind === "stop") {
    const stop = page.doc.getElementById("pack-stop");
    if (!stop) return Object.assign({ page, listedAfterStop: false, listed: afterPub.listed }, afterPub);
    const mid = page.calls.length;
    stop.click();
    await flush(8);
    return Object.assign({ page, listedAfterStop: postsAfter(page, mid).some(isListPost), listed: afterPub.listed || postsAfter(page, mid).some(isListPost) }, afterPub);
  }
  return Object.assign({ page }, afterPub);
}

function publishYesFaultsFromRuns(runs) {
  const bad = [];
  const pub = runs["publish-only"];
  if (pub && pub.listed && !pub.decideShown) bad.push("Publish lists without a Yes");
  if (pub && pub.listed && pub.decideShown) bad.push("the Yes is skipped");
  const stop = runs.stop;
  if (stop && stop.listedAfterStop) bad.push("Stop still lists");
  return unique(bad);
}

async function runPublishYesFaults(packSrc) {
  const runs = {};
  runs["publish-only"] = await scenario(packSrc, "publish-only");
  runs.stop = await scenario(packSrc, "stop");
  return { faults: publishYesFaultsFromRuns(runs), runs };
}

(async function () {
  try {
    const liveYes = await scenario(studioPack, "publish-only");
    if (liveYes.listed) fail("Publish listed a pack without a Yes");
    else if (!liveYes.decideShown) fail("Publish must show a Yes / Stop step");
    else pass("Publish waits for Yes");
    const yesRun = await scenario(studioPack, "yes");
    if (yesRun.listedAfterYes) pass("Yes lists the pack");
    else fail("Yes did not list the pack");
    const stopRun = await scenario(studioPack, "stop");
    if (stopRun.listedAfterStop || stopRun.listed) fail("Stop listed a pack");
    else pass("Stop lists nothing");
    const privRun = await scenario(studioPack, "private");
    if (privRun.listed) fail("Keep private listed a pack");
    else if (!privRun.privated) fail("Keep private must still save without a Yes");
    else pass("Keep private works without a Yes");
    const draftRun = await scenario(studioPack, "draft");
    if (draftRun.listed) fail("Save draft listed a pack");
    else if (!draftRun.drafted) fail("Save draft must still save without a Yes");
    else pass("Save draft works without a Yes");

    const yesMutants = [
      ["Publish lists without a Yes", function (pack) {
        return pack.replace("if (subBtn) subBtn.onclick = stagePublish;", "if (subBtn) subBtn.onclick = submitPack;");
      }],
      ["the Yes is skipped", function (pack) {
        return pack.replace(
          "if (okEl) okEl.style.display = \"none\";\n    if (errEl) errEl.style.display = \"none\";",
          "if (okEl) okEl.style.display = \"none\";\n    if (errEl) errEl.style.display = \"none\";\n    submitPack();"
        );
      }],
      ["Stop still lists", function (pack) {
        return pack.replace(
          "function stopPublish() {\n    hideListDecide();\n    show(\"Stopped. Nothing was saved or removed.\", true);\n  }",
          "function stopPublish() {\n    hideListDecide();\n    submitPack();\n    show(\"Stopped. Nothing was saved or removed.\", true);\n  }"
        );
      }]
    ];
    let yesCaught = 0;
    for (let i = 0; i < yesMutants.length; i++) {
      const name = yesMutants[i][0];
      const next = yesMutants[i][1](studioPack);
      if (next === studioPack) { fail("mutant changed nothing: " + name); continue; }
      const out = await runPublishYesFaults(next);
      if (out.faults.indexOf(name) < 0) fail("mutant missed: " + name + " (got " + JSON.stringify(out.faults) + ")");
      else { yesCaught += 1; pass("mutant caught: " + name); }
    }
    if (yesCaught !== yesMutants.length) fail("Yes-gate mutants: " + yesCaught + "/" + yesMutants.length + " caught");
    else pass("Yes-gate mutants: " + yesCaught + "/" + yesMutants.length + " caught");
  } catch (e) {
    fail("jsdom Publish Yes gate: " + (e && e.stack ? e.stack : e));
  }
  if (failed) {
    console.error("check-pack-sell failed");
    process.exit(1);
  }
  console.log("check-pack-sell: ok");
})();
