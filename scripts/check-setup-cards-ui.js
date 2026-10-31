#!/usr/bin/env node
require("./_env-guard");
// Setup cards on the desk (UI for the #429 setup card reads).
// Runs the REAL setup-cards.js in a small DOM stub (node vm) with a fake fetch, then runs the
// same checks against source mutants; every mutant must be caught.
// Checks: renders setupCards (open, stopped, done; never killed); ?desks=all shows the desk
// label from slug; step states and statusText shown; every button POSTs the exact
// { action: "setup-step", cardId, stepId, do } to /api/account; a 409 on a secret step shows
// waiting copy with no crash and no retry; [] and 403 show nothing and no error text; the link
// is /account#setup-<id>; no run-on-its-own control; Stop and Kill on every card; the Pack
// install reply's setupCard is surfaced; no money or checkout fetches; plain public copy.
// Also: desk.html is 35012 bytes and api/ is frozen to blob pins vs main (scripts/_api-freeze.js).
// Usage: node scripts/check-setup-cards-ui.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
let failed = 0;
let passed = 0;
function fail(msg) { failed += 1; console.error("FAIL " + msg); }
function ok(cond, msg) { if (cond) { passed += 1; console.log("ok  " + msg); } else fail(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const SRC = read("setup-cards.js");
// U2: the killed-card line is the api's own sentence, byte for byte.
const GONE_API = (read("api/_account-connect.js").match(/if \(card\.status === "killed"\) return "([^"]+)";/) || [])[1] || "";
const KILL_ASK = "Stop for good? Nothing more happens on this card.";
const KILL_AGAIN = "Kill needs a second tap.";
const KILL_REARM = "Kill needs a second tap. Tap Yes, stop for good, or Keep the card.";

// ---------- small DOM ----------
function makeDom() {
  const doc = { listeners: {}, readyState: "complete" };
  function El(tag) {
    this.tagName = String(tag).toUpperCase();
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
    this.scrolled = 0;
    this._text = "";
    const self = this;
    this.classList = {
      add(c) { const l = self.className.split(/\s+/).filter(Boolean); if (l.indexOf(c) < 0) l.push(c); self.className = l.join(" "); },
      remove(c) { self.className = self.className.split(/\s+/).filter((x) => x && x !== c).join(" "); },
      contains(c) { return self.className.split(/\s+/).indexOf(c) >= 0; },
      toggle(c, on) { if (on === undefined) on = !this.contains(c); if (on) this.add(c); else this.remove(c); return on; }
    };
  }
  El.prototype = {
    get id() { return this.attrs.id || ""; },
    set id(v) { this.attrs.id = String(v); },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    appendChild(c) { if (!(c instanceof El)) throw new TypeError("appendChild needs a node"); if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; },
    removeChild(c) { this.childNodes = this.childNodes.filter((x) => x !== c); c.parentNode = null; return c; },
    insertBefore(c, ref) { if (c.parentNode) c.parentNode.removeChild(c); const i = this.childNodes.indexOf(ref); c.parentNode = this; if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c); return c; },
    replaceChildren() { this.childNodes.forEach((c) => { c.parentNode = null; }); this.childNodes = []; },
    get firstChild() { return this.childNodes[0] || null; },
    get children() { return this.childNodes; },
    set textContent(v) { this.childNodes = []; this._text = String(v == null ? "" : v); },
    get textContent() { return this._text + this.childNodes.map((c) => c.textContent).join(""); },
    set innerHTML(v) { throw new Error("innerHTML used"); },
    addEventListener(t, fn) { (this.handlers[t] = this.handlers[t] || []).push(fn); },
    click() {
      const ev = { target: this, preventDefault() {} };
      let n = this;
      while (n) { (n.handlers.click || []).forEach((fn) => fn(ev)); n = n.parentNode; }
      (doc.listeners.click || []).forEach((fn) => fn(ev));
    },
    matches(sel) { return matches(this, sel); },
    closest(sel) { let n = this; while (n) { if (matches(n, sel)) return n; n = n.parentNode; } return null; },
    querySelectorAll(sel) { const out = []; walk(this, (n) => { if (n !== this && matches(n, sel)) out.push(n); }); return out; },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    scrollIntoView() { this.scrolled += 1; }
  };
  function matches(n, sel) {
    sel = String(sel).trim();
    if (sel.indexOf(",") >= 0) return sel.split(",").some((s) => matches(n, s));
    let m;
    if ((m = /^\[([\w-]+)\]$/.exec(sel))) return n.getAttribute(m[1]) !== null;
    if ((m = /^#([\w-]+)$/.exec(sel))) return n.id === m[1];
    if ((m = /^\.([\w-]+)$/.exec(sel))) return n.classList.contains(m[1]);
    if ((m = /^([a-z0-9]+)\.([\w-]+)$/i.exec(sel))) return n.tagName === m[1].toUpperCase() && n.classList.contains(m[2]);
    if ((m = /^([a-z0-9]+)\[([\w-]+)\]$/i.exec(sel))) return n.tagName === m[1].toUpperCase() && n.getAttribute(m[2]) !== null;
    if (/^[a-z0-9]+$/i.test(sel)) return n.tagName === sel.toUpperCase();
    return false;
  }
  function walk(n, fn) { fn(n); n.childNodes.forEach((c) => walk(c, fn)); }
  const html = new El("html");
  const head = new El("head");
  const body = new El("body");
  html.appendChild(head);
  html.appendChild(body);
  doc.documentElement = html;
  doc.head = head;
  doc.body = body;
  doc.createElement = (t) => new El(t);
  doc.getElementById = (id) => { let hit = null; walk(html, (n) => { if (!hit && n.id === id) hit = n; }); return hit; };
  doc.querySelectorAll = (s) => html.querySelectorAll(s);
  doc.querySelector = (s) => html.querySelector(s);
  doc.addEventListener = (t, fn) => { (doc.listeners[t] = doc.listeners[t] || []).push(fn); };
  return { doc, El, walk };
}

// ---------- one sandboxed page ----------
function runPage(src, opts) {
  const dom = makeDom();
  const doc = dom.doc;
  (opts.build || function () {})(doc);
  const calls = [];
  const timers = [];
  const errors = [];
  const store = Object.assign({}, opts.storage || {});
  function respond(url, init) {
    const r = opts.route(url, init || {}, calls.length);
    if (r && r.later) {
      return new Promise((resolve) => {
        r.later(function (status, bodyObj) { resolve({ ok: status >= 200 && status < 300, status: status, json() { return Promise.resolve(JSON.parse(JSON.stringify(bodyObj))); } }); });
      });
    }
    const status = r ? r.status : 404;
    const bodyObj = r ? r.body : {};
    return Promise.resolve({ ok: status >= 200 && status < 300, status: status, json() { return Promise.resolve(JSON.parse(JSON.stringify(bodyObj))); } });
  }
  const win = {
    addEventListener() {},
    AIADesks: opts.desks ? { list() { return opts.desks; } } : undefined
  };
  const loc = Object.assign({ pathname: "/desk.html", search: "", hash: "", href: "https://x.test/desk.html" }, opts.location || {});
  const ctx = {
    window: win,
    document: doc,
    location: loc,
    localStorage: { getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }, setItem(k, v) { store[k] = String(v); }, removeItem(k) { delete store[k]; } },
    fetch(url, init) { calls.push({ url: String(url), init: init || {} }); return respond(String(url), init); },
    URLSearchParams,
    setTimeout(fn) { timers.push(fn); return timers.length; },
    clearTimeout() {},
    MutationObserver: function (fn) { this.observe = function () { (opts.observers = opts.observers || []).push(fn); }; },
    console: { log() {}, warn() {}, error(e) { errors.push(String(e)); }, info() {} },
    JSON, Object, Array, String, Promise, RegExp, Error, Math, Date
  };
  win.window = win;
  win.document = doc;
  win.location = loc;
  ctx.window.fetch = ctx.fetch;
  ctx.window.setTimeout = ctx.setTimeout;
  vm.createContext(ctx);
  try { vm.runInContext(src, ctx, { filename: "setup-cards.js" }); } catch (e) { errors.push("boot: " + e.message); }
  return { dom, doc, calls, timers, errors, ctx, api: () => win.AIASetupCards };
}
async function flush(n) { for (let i = 0; i < (n || 8); i++) await new Promise((r) => setImmediate(r)); }
async function drainTimers(page, rounds) {
  for (let i = 0; i < (rounds || 5); i++) {
    const t = page.timers.splice(0);
    if (!t.length) break;
    t.forEach((fn) => { try { fn(); } catch (e) { page.errors.push("timer: " + e.message); } });
    await flush();
  }
}

// ---------- data ----------
function step(id, kind, title, state, extra) { return Object.assign({ id, group: id === "card.desk" ? "card" : "g1", kind, title, state, reason: "" }, extra || {}); }
function openCard() {
  return {
    id: "setup_open1", source: { type: "pack", id: "home", name: "Home Pack", preview: true }, deskId: "ann-bakery",
    status: "open", statusText: "Open. 2 of 5 steps done.", charged: false, bought: false, href: "/account#setup-setup_open1",
    groups: [{ id: "g1", name: "Gmail", service: "Gmail" }],
    steps: [
      step("card.desk", "desk", "Pick a desk", "done"),
      step("g1.connect", "connect", "Connect Gmail", "done", { statusText: "Saved, not tested yet." }),
      step("g1.secret", "secret", "Enter the secret", "skipped", { reason: "Needs no outside account." }),
      step("g1.approve", "approve", "Approve allowed actions once", "todo"),
      step("g1.test", "test", "Test run (dry run)", "todo")
    ]
  };
}
function stoppedCard() {
  return { id: "setup_stop2", source: { name: "Lawn Route" }, status: "stopped", statusText: "Stopped. Nothing runs from this card. Start it again to go on.", href: "/account#setup-setup_stop2",
    steps: [step("card.desk", "desk", "Pick a desk", "done"), step("g1.test", "test", "Test run (dry run)", "todo")] };
}
function doneCard() {
  return { id: "setup_done3", source: { name: "Invoice Bundle" }, status: "done", statusText: "Set up as a dry run. Nothing runs on its own yet.", href: "/account#setup-setup_done3",
    steps: [step("card.desk", "desk", "Pick a desk", "done"), step("g1.test", "test", "Test run (dry run)", "done")] };
}
function killedCard() {
  return { id: "setup_kill4", source: { name: "Killed Thing" }, status: "killed", statusText: GONE_API, href: "/account#setup-setup_kill4",
    steps: [step("g1.test", "test", "Test run (dry run)", "blocked", { reason: "Killed." })] };
}
function secretCard() {
  return { id: "setup_sec5", source: { name: "Stripe Thing" }, status: "open", statusText: "Open. 2 of 4 steps done.", href: "/account#setup-setup_sec5",
    steps: [step("card.desk", "desk", "Pick a desk", "done"), step("g1.connect", "connect", "Connect Stripe", "done"), step("g1.secret", "secret", "Enter the secret", "todo"), step("g1.test", "test", "Test run (dry run)", "todo")] };
}
const SECRETS_OFF = "Secrets are off until the server secret key is set. Nothing was saved.";
const SESSION = { aia_session: "tok_ann", aia_ws: "ann-bakery" };
function deskPage(doc) {
  const main = doc.createElement("main");
  const h1 = doc.createElement("h1"); h1.textContent = "Queue";
  const q = doc.createElement("div"); q.id = "queue";
  main.appendChild(h1); main.appendChild(q); doc.body.appendChild(main);
}
function articles(doc) { return doc.querySelectorAll("article").filter((a) => a.classList.contains("setup-card")); }
function cardEl(doc, id) { return doc.getElementById("setup-card-" + id); }
function buttons(n) { return n ? n.querySelectorAll("button") : []; }
function btn(n, label) { return buttons(n).find((b) => b.textContent === label) || null; }
function stepEl(n, id) { return n ? n.querySelectorAll("li").find((li) => li.getAttribute("data-step-id") === id) : null; }
function acctCalls(p) { return p.calls.filter((c) => /\/api\/account/.test(c.url) || /setup-step/.test(String(c.init.body || ""))); }
function bodyOf(c) { try { return JSON.parse(c.init.body); } catch (e) { return null; } }
function keys(o) { return Object.keys(o || {}).sort().join(","); }
const MONEY = /checkout|charge|\bpay|payment|buy|purchase|price|market|stripe|secret|env/i;
const JARGON = /\bSHA\b|\bPASS\b|\bFAIL\b|\bHOLD\b|\bAPI\b|endpoint|\b40[0-9]\b|null|undefined|\[object/;
const AUTO = /on its own|auto-?run|automatic|autopilot|always run|run by itself/i;

// ---------- the suite (returns failure strings; empty means all good) ----------
async function suite(src, say) {
  const bad = [];
  const t = (cond, msg) => { if (!cond) bad.push(msg); else if (say) say(msg); };
  const pages = [];

  // A: one desk
  let afterStop = null;
  const A = runPage(src, {
    location: { pathname: "/desk.html", search: "?workspace=ann-bakery" }, storage: SESSION, build: deskPage,
    route(url, init) {
      if (/^\/api\/jobs\?workspace=ann-bakery$/.test(url)) return { status: 200, body: { jobs: [], setupCards: [openCard(), stoppedCard(), doneCard(), killedCard()] } };
      if (url === "/api/account") {
        const b = JSON.parse(init.body);
        if (b.do === "done" && b.stepId === "g1.approve") { const c = openCard(); c.steps[3].state = "done"; c.statusText = "Open. 3 of 5 steps done."; return { status: 200, body: { ok: true, card: c, entry: { what: "Approved allowed actions once." } } }; }
        if (b.do === "stop") { const c = openCard(); c.status = "stopped"; c.statusText = "Stopped. Nothing runs from this card."; afterStop = c; return { status: 200, body: { ok: true, changed: true, saved: true, card: c } }; }
        if (b.do === "start") { const c = stoppedCard(); c.status = "open"; c.statusText = "Open again."; return { status: 200, body: { ok: true, card: c } }; }
        if (b.do === "kill") { const c = doneCard(); c.status = "killed"; return { status: 200, body: { ok: true, changed: true, saved: true, card: c } }; }
        if (b.do === "skip") return { status: 200, body: { ok: true, card: openCard(), entry: { what: "Skipped." } } };
      }
      return { status: 404, body: {} };
    }
  });
  await flush();
  pages.push(A);
  t(A.errors.length === 0, "[desk] no errors on boot (" + A.errors.join("; ") + ")");
  t(A.calls.some((c) => c.url === "/api/jobs?workspace=ann-bakery"), "[desk] reads /api/jobs?workspace=<desk>");
  const arts = articles(A.doc);
  t(arts.length === 3, "[desk] renders open, stopped and done setup cards (" + arts.length + ")");
  t(!cardEl(A.doc, "setup_kill4") && A.doc.body.textContent.indexOf("Killed Thing") < 0, "[desk] a killed card is never shown");
  const oc = cardEl(A.doc, "setup_open1");
  t(!!oc && oc.textContent.indexOf("Home Pack") >= 0, "[desk] the card names what is being set up");
  t(!!oc && oc.textContent.indexOf("Open. 2 of 5 steps done.") >= 0, "[desk] card statusText shown word for word");
  t(!!oc && oc.textContent.indexOf("Saved, not tested yet.") >= 0, "[desk] step statusText shown word for word");
  t(!!oc && oc.textContent.indexOf("Needs no outside account.") >= 0, "[desk] a skipped step shows why");
  const words = (id) => { const li = stepEl(oc, id); const w = li && li.querySelector(".setup-word"); return w ? w.textContent : ""; };
  t(words("card.desk") === "Done" && words("g1.connect") === "Done", "[desk] done steps read Done");
  t(words("g1.secret") === "Skipped", "[desk] skipped step reads Skipped");
  t(words("g1.approve") === "To do" && words("g1.test") === "To do", "[desk] todo steps read To do");
  t(arts.every((a) => { const l = a.querySelectorAll("a").find((x) => x.textContent === "Open in My account"); return l && l.href === "/account#setup-" + a.getAttribute("data-card-id"); }), "[desk] every card links to /account#setup-<id>");
  t(arts.every((a) => !!btn(a, "Stop") && !!btn(a, "Kill") && !btn(a, "Stop").disabled && !btn(a, "Kill").disabled), "[desk] Stop and Kill on every card, open, stopped and done");
  t(!!btn(cardEl(A.doc, "setup_stop2"), "Start again"), "[desk] a stopped card offers Start again");
  t(!btn(cardEl(A.doc, "setup_done3"), "Done"), "[desk] a finished card has no step buttons");
  const controls = A.doc.querySelectorAll("button").concat(A.doc.querySelectorAll("input"), A.doc.querySelectorAll("label"), A.doc.querySelectorAll("select"));
  t(!controls.some((c) => AUTO.test(c.textContent) || c.type === "checkbox"), "[desk] no run-on-its-own control and no switch");
  t(!JARGON.test(A.doc.body.textContent), "[desk] public copy is plain (no tech words)");
  t(A.doc.querySelector("#setup-cards-desk") && !A.doc.querySelector("#setup-cards-desk").hidden, "[desk] the setup section is shown");

  // Done on a step
  const doneB = btn(stepEl(oc, "g1.approve"), "Done");
  t(!!doneB, "[desk] a todo step has a Done button");
  if (doneB) doneB.click();
  await flush();
  let ac = acctCalls(A);
  const b1 = ac[0] && bodyOf(ac[0]);
  t(ac.length === 1 && ac[0].url === "/api/account" && String(ac[0].init.method).toUpperCase() === "POST", "[desk] Done POSTs once to /api/account");
  t(b1 && keys(b1) === "action,cardId,do,stepId" && b1.action === "setup-step" && b1.cardId === "setup_open1" && b1.stepId === "g1.approve" && b1.do === "done", "[desk] Done sends exactly {action:'setup-step',cardId,stepId,do:'done'} (" + JSON.stringify(b1) + ")");
  const oc2 = cardEl(A.doc, "setup_open1");
  t(!!oc2 && oc2.textContent.indexOf("Open. 3 of 5 steps done.") >= 0, "[desk] the card repaints from the reply");

  // Stop
  const stopB = btn(cardEl(A.doc, "setup_open1"), "Stop");
  if (stopB) stopB.click();
  await flush();
  ac = acctCalls(A);
  const b2 = ac[1] && bodyOf(ac[1]);
  t(b2 && keys(b2) === "action,cardId,do" && b2.action === "setup-step" && b2.cardId === "setup_open1" && b2.do === "stop", "[desk] Stop sends exactly {action:'setup-step',cardId,do:'stop'} (" + JSON.stringify(b2) + ")");
  t(!!afterStop && !!btn(cardEl(A.doc, "setup_open1"), "Start again") && !!btn(cardEl(A.doc, "setup_open1"), "Kill"), "[desk] after Stop: Start again and Kill still there");

  // Start again
  const startB = btn(cardEl(A.doc, "setup_stop2"), "Start again");
  if (startB) startB.click();
  await flush();
  ac = acctCalls(A);
  const b3 = ac[2] && bodyOf(ac[2]);
  t(b3 && keys(b3) === "action,cardId,do" && b3.cardId === "setup_stop2" && b3.do === "start", "[desk] Start again sends do:'start'");

  // Kill takes two taps, like Stop on the Queue: the first only asks.
  const killB = btn(cardEl(A.doc, "setup_done3"), "Kill");
  if (killB) killB.click();
  await flush();
  const armedBox = cardEl(A.doc, "setup_done3");
  t(acctCalls(A).length === 3, "[kill] one tap on Kill sends nothing");
  t(!!armedBox && armedBox.textContent.indexOf(KILL_ASK) >= 0, "[kill] the first tap asks: " + KILL_ASK);
  t(!!armedBox && !!btn(armedBox, "Yes, stop for good") && !btn(armedBox, "Kill") && !!btn(armedBox, "Keep the card"), "[kill] the first tap arms it: Yes, stop for good and Keep the card");
  const yesB = armedBox && btn(armedBox, "Yes, stop for good");
  if (yesB) yesB.click();
  await flush();
  ac = acctCalls(A);
  const b4 = ac[3] && bodyOf(ac[3]);
  t(b4 && keys(b4) === "action,cardId,confirm,do" && b4.cardId === "setup_done3" && b4.do === "kill" && b4.confirm === true, "[desk] the second Kill tap sends do:'kill' with confirm:true (" + JSON.stringify(b4) + ")");
  t(!cardEl(A.doc, "setup_done3"), "[desk] a killed card leaves the desk");
  t(GONE_API === "Stopped for good. Nothing more happens on this card." && A.doc.body.textContent.indexOf(GONE_API) >= 0, "[kill] the desk says the api's words: " + GONE_API);
  t(A.doc.body.textContent.indexOf("Killed.") < 0 && !/\bStopped\.(?! Nothing runs)/.test(A.doc.body.textContent.replace(GONE_API, "")), "[kill] no Killed or bare Stopped. after a kill");
  await drainTimers(A);
  t(acctCalls(A).length === 4, "[desk] one request per tap, nothing extra");
  t(A.errors.length === 0, "[desk] no errors after taps (" + A.errors.join("; ") + ")");

  // K: Keep the card cancels the armed Kill, and Stop disarms it; neither kills.
  const K = runPage(src, {
    location: { pathname: "/desk.html", search: "?workspace=ann-bakery" }, storage: SESSION, build: deskPage,
    route(url, init) {
      if (/^\/api\/jobs\?workspace=ann-bakery$/.test(url)) return { status: 200, body: { jobs: [], setupCards: [openCard(), doneCard()] } };
      if (url === "/api/account") {
        const b = JSON.parse(init.body);
        if (b.do === "stop") { const c = doneCard(); c.status = "stopped"; c.statusText = "Stopped. Nothing runs from this card."; return { status: 200, body: { ok: true, changed: true, saved: true, card: c } }; }
        if (b.do === "kill") { const c = doneCard(); c.status = "killed"; return { status: 200, body: { ok: true, changed: true, saved: true, card: c } }; }
      }
      return { status: 404, body: {} };
    }
  });
  await flush();
  pages.push(K);
  const kc = () => cardEl(K.doc, "setup_done3");
  if (btn(kc(), "Kill")) btn(kc(), "Kill").click();
  await flush();
  const keepB = kc() && btn(kc(), "Keep the card");
  if (keepB) keepB.click();
  await flush();
  t(acctCalls(K).length === 0 && !!kc() && !!btn(kc(), "Kill") && !btn(kc(), "Yes, stop for good") && !btn(kc(), "Keep the card") && kc().textContent.indexOf(KILL_ASK) < 0, "[kill] Keep the card cancels: nothing sent, Kill is back, the ask is gone");
  if (btn(kc(), "Kill")) btn(kc(), "Kill").click();
  await flush();
  if (btn(kc(), "Stop")) btn(kc(), "Stop").click();
  await flush();
  const kb = acctCalls(K).map((c) => bodyOf(c).do);
  t(kb.join() === "stop" && !!kc() && !!btn(kc(), "Kill") && !btn(kc(), "Yes, stop for good"), "[kill] Stop while Kill is armed stops the card and disarms Kill (" + kb.join() + ")");
  if (btn(kc(), "Kill")) btn(kc(), "Kill").click();
  await flush();
  t(acctCalls(K).length === 1, "[kill] after Stop, one tap on Kill again sends nothing");
  if (btn(kc(), "Yes, stop for good")) btn(kc(), "Yes, stop for good").click();
  await flush();
  t(acctCalls(K).map((c) => bodyOf(c).do).join() === "stop,kill" && !kc(), "[kill] the second tap kills");

  // L: enforcing fake api (U2 needs Switch's allowlist PR first; nothing here hits the real api):
  // a Kill without confirm:true gets 409; the second tap carries it, so it kills.
  const L = runPage(src, {
    location: { pathname: "/desk.html", search: "?workspace=ann-bakery" }, storage: SESSION, build: deskPage,
    route(url, init) {
      if (/^\/api\/jobs\?workspace=ann-bakery$/.test(url)) return { status: 200, body: { jobs: [], setupCards: [doneCard()] } };
      if (url === "/api/account") {
        const b = JSON.parse(init.body);
        if (b.do === "kill" && b.confirm !== true) return { status: 409, body: { ok: false, error: KILL_AGAIN } };
        if (b.do === "kill") { const c = doneCard(); c.status = "killed"; return { status: 200, body: { ok: true, changed: true, saved: true, card: c } }; }
      }
      return { status: 404, body: {} };
    }
  });
  await flush();
  pages.push(L);
  if (btn(cardEl(L.doc, "setup_done3"), "Kill")) btn(cardEl(L.doc, "setup_done3"), "Kill").click();
  await flush();
  t(acctCalls(L).length === 0, "[enforcing api] the first tap sends no request");
  if (cardEl(L.doc, "setup_done3") && btn(cardEl(L.doc, "setup_done3"), "Yes, stop for good")) btn(cardEl(L.doc, "setup_done3"), "Yes, stop for good").click();
  await flush();
  const lb = acctCalls(L).map(bodyOf);
  t(lb.length === 1 && keys(lb[0]) === "action,cardId,confirm,do" && lb[0].confirm === true, "[enforcing api] the second tap sends one Kill with confirm:true (" + JSON.stringify(lb) + ")");
  t(!cardEl(L.doc, "setup_done3") && L.doc.body.textContent.indexOf(GONE_API) >= 0, "[enforcing api] the card is stopped for good and leaves the desk");

  // M: the api answers 409 Kill needs a second tap: ask again, not a dead error.
  let mKills = 0;
  const M = runPage(src, {
    location: { pathname: "/desk.html", search: "?workspace=ann-bakery" }, storage: SESSION, build: deskPage,
    route(url, init) {
      if (/^\/api\/jobs\?workspace=ann-bakery$/.test(url)) return { status: 200, body: { jobs: [], setupCards: [doneCard()] } };
      if (url === "/api/account") {
        const b = JSON.parse(init.body);
        if (b.do === "kill" && ++mKills === 1) return { status: 409, body: { ok: false, error: KILL_AGAIN } };
        if (b.do === "kill") { const c = doneCard(); c.status = "killed"; return { status: 200, body: { ok: true, changed: true, saved: true, card: c } }; }
      }
      return { status: 404, body: {} };
    }
  });
  await flush();
  pages.push(M);
  const mc = () => cardEl(M.doc, "setup_done3");
  if (btn(mc(), "Kill")) btn(mc(), "Kill").click();
  await flush();
  if (mc() && btn(mc(), "Yes, stop for good")) btn(mc(), "Yes, stop for good").click();
  await flush();
  t(!!mc() && mc().textContent.indexOf(KILL_REARM) >= 0 && !!btn(mc(), "Yes, stop for good") && !btn(mc(), "Yes, stop for good").disabled && !!btn(mc(), "Keep the card"), "[409 second tap] asks again with Yes, stop for good and Keep the card");
  t(!!mc() && mc().textContent.indexOf("didn't go through") < 0, "[409 second tap] not a dead error");
  if (mc() && btn(mc(), "Yes, stop for good")) btn(mc(), "Yes, stop for good").click();
  await flush();
  t(mKills === 2 && !mc() && bodyOf(acctCalls(M).slice(-1)[0]).confirm === true, "[409 second tap] the next Yes kills, with confirm:true");

  // B: 409 on a secret step
  const B = runPage(src, {
    location: { pathname: "/desk.html", search: "?workspace=ann-bakery" }, storage: SESSION, build: deskPage,
    route(url) {
      if (/^\/api\/jobs\?workspace=/.test(url)) return { status: 200, body: { setupCards: [secretCard()] } };
      if (url === "/api/account") return { status: 409, body: { ok: false, error: SECRETS_OFF, secretsReady: false } };
      return { status: 404, body: {} };
    }
  });
  await flush();
  pages.push(B);
  let unhandled = 0;
  const onUnh = () => { unhandled += 1; };
  process.on("unhandledRejection", onUnh);
  const sb = btn(stepEl(cardEl(B.doc, "setup_sec5"), "g1.secret"), "Done");
  t(!!sb, "[409] the secret step has a Done button");
  let threw = false;
  try { if (sb) sb.click(); } catch (e) { threw = true; }
  await flush();
  await drainTimers(B, 6);
  await flush();
  process.removeListener("unhandledRejection", onUnh);
  const bc = acctCalls(B);
  const sc = cardEl(B.doc, "setup_sec5");
  t(!threw && unhandled === 0 && B.errors.length === 0, "[409] no crash (" + B.errors.join("; ") + ")");
  t(bc.length === 1, "[409] exactly one request, no retry loop (" + bc.length + ")");
  t(!!sc && /Waiting/.test(sc.textContent), "[409] shows plain waiting copy");
  const sw = stepEl(sc, "g1.secret");
  t(!!sw && sw.querySelector(".setup-word") && sw.querySelector(".setup-word").textContent === "Waiting", "[409] the secret step reads Waiting");
  t(!!sc && sc.textContent.indexOf("server secret key") < 0 && !JARGON.test(B.doc.body.textContent), "[409] waiting copy is plain, no server words");
  t(!!sc && !!btn(sc, "Stop") && !!btn(sc, "Kill"), "[409] Stop and Kill still there");

  // C: All desks
  const C = runPage(src, {
    location: { pathname: "/desk.html", search: "" }, storage: SESSION, build: deskPage,
    desks: [{ slug: "ann-bakery", name: "Ann's Bakery" }],
    route(url) {
      if (url === "/api/jobs?desks=all") {
        const a = openCard(); a.slug = "ann-bakery";
        const b = secretCard(); b.slug = "side-shop";
        const k = killedCard(); k.slug = "ann-bakery";
        return { status: 200, body: { ok: true, jobs: [], setupCards: [a, b, k] } };
      }
      return { status: 404, body: {} };
    }
  });
  await flush();
  pages.push(C);
  t(C.calls.length && C.calls[0].url === "/api/jobs?desks=all", "[all] the Queue's All desks view reads ?desks=all");
  const ca = cardEl(C.doc, "setup_open1");
  const cb = cardEl(C.doc, "setup_sec5");
  t(!!ca && ca.textContent.indexOf("Desk: Ann's Bakery") >= 0, "[all] desk label from slug, by the desk's name");
  t(!!cb && cb.textContent.indexOf("Desk: side-shop") >= 0, "[all] desk label falls back to the slug");
  t(articles(C.doc).length === 2, "[all] killed card left out");

  // D: 403 and []
  async function nothing(tag, status, body, search) {
    const P = runPage(src, {
      location: { pathname: "/desk.html", search: search }, storage: SESSION, build: deskPage,
      route() { return { status: status, body: body }; }
    });
    await flush();
    await drainTimers(P);
    pages.push(P);
    const sec = P.doc.getElementById("setup-cards-desk");
    t(articles(P.doc).length === 0 && (!sec || sec.hidden), "[" + tag + "] shows nothing");
    t(P.doc.body.textContent.indexOf("No desk with that name") < 0 && !/went wrong|error|couldn|could not|didn/i.test(P.doc.body.textContent), "[" + tag + "] no error text");
    t(P.errors.length === 0, "[" + tag + "] no crash");
  }
  await nothing("403 all", 403, { ok: false, error: "No desk with that name." }, "");
  await nothing("403 desk", 403, { ok: false, error: "No desk with that name." }, "?workspace=ann-bakery");
  await nothing("empty", 200, { jobs: [], setupCards: [] }, "?workspace=ann-bakery");
  await nothing("empty all", 200, { ok: true, jobs: [], setupCards: [] }, "");

  // G: two overlapping reads; the older All desks answer lands last and must not win
  let releaseAll = null;
  const G = runPage(src, {
    location: { pathname: "/desk.html", search: "" }, storage: SESSION, build: deskPage,
    route(url) {
      if (url === "/api/jobs?desks=all") return { later(done) { releaseAll = () => { const k = stoppedCard(); k.slug = "ann-bakery"; done(200, { ok: true, jobs: [], setupCards: [k] }); }; } };
      if (url === "/api/jobs?workspace=side-shop") return { status: 200, body: { jobs: [], setupCards: [secretCard()] } };
      return { status: 404, body: {} };
    }
  });
  await flush();
  pages.push(G);
  G.ctx.location.search = "?workspace=side-shop";
  if (G.api()) await G.api().refresh();
  await flush();
  t(!!cardEl(G.doc, "setup_sec5"), "[stale] the newer desk's cards show");
  if (releaseAll) releaseAll();
  await flush();
  t(!!releaseAll && !cardEl(G.doc, "setup_stop2") && !!cardEl(G.doc, "setup_sec5"), "[stale] a late, older All desks answer does not overwrite the newer desk");

  // H: a connect step to do, on a card whose id has odd characters
  const ODD = "setup_x#1&y z";
  const ODD_HREF = "/account#setup-setup_x%231%26y%20z";
  const H = runPage(src, {
    location: { pathname: "/desk.html", search: "?workspace=ann-bakery" }, storage: SESSION, build: deskPage,
    route(url, init) {
      if (/^\/api\/jobs\?workspace=/.test(url)) {
        return { status: 200, body: { setupCards: [{ id: ODD, href: "/account#setup-" + ODD, source: { name: "Calendar Thing" }, status: "open", statusText: "Open. 1 of 4 steps done.",
          steps: [step("card.desk", "desk", "Pick a desk", "done"), step("g1.connect", "connect", "Connect Calendar", "todo"), step("g1.secret", "secret", "Enter the secret", "todo"), step("g1.test", "test", "Test run (dry run)", "todo")] }] } };
      }
      if (url === "/api/account") return { status: 200, body: { ok: true, entry: { what: "Skipped." } } };
      return { status: 404, body: {} };
    }
  });
  await flush();
  pages.push(H);
  const hc = cardEl(H.doc, ODD);
  const hconn = stepEl(hc, "g1.connect");
  t(!!hconn && !btn(hconn, "Done"), "[connect] a connect step has no Done button");
  const hfin = hconn ? hconn.querySelectorAll("a").find((a) => a.textContent === "Finish in My account") : null;
  t(!!hfin && hfin.href === ODD_HREF, "[connect] a connect step links to Finish in My account at the card's href (" + (hfin && hfin.href) + ")");
  t(!!btn(hc, "Stop") && !!btn(hc, "Kill") && !!btn(hconn, "Skip"), "[connect] Skip, Stop and Kill stay");
  const hopen = hc ? hc.querySelectorAll("a").find((a) => a.textContent === "Open in My account") : null;
  t(!!hopen && hopen.href === ODD_HREF, "[id] an id with # & and space is encoded in the My account link (" + (hopen && hopen.href) + ")");
  const skipB = btn(hconn, "Skip");
  if (skipB) skipB.click();
  await flush();
  const hb = acctCalls(H)[0] && bodyOf(acctCalls(H)[0]);
  t(!!hb && hb.do === "skip" && hb.cardId === ODD && hb.stepId === "g1.connect" && typeof hb.reason === "string" && hb.reason.trim().length > 0 && keys(hb) === "action,cardId,do,reason,stepId", "[skip] Skip POSTs a non-empty reason (" + JSON.stringify(hb) + ")");

  // H2: My account finds an encoded #setup-<id>
  const H2 = runPage(src, {
    location: { pathname: "/account.html", search: "", hash: "#setup-" + encodeURIComponent(ODD) }, storage: SESSION,
    build(doc) { const host = doc.createElement("section"); host.id = "acct-connections"; const box = doc.createElement("div"); box.id = "acct-card-" + ODD; host.appendChild(box); doc.body.appendChild(host); },
    route() { return { status: 404, body: {} }; }
  });
  await flush();
  pages.push(H2);
  t(H2.doc.getElementById("acct-card-" + ODD).classList.contains("setup-hl"), "[id] My account decodes an encoded #setup-<id> and highlights that card");

  // E: Pack install reply
  const E = runPage(src, {
    location: { pathname: "/market.html", search: "" }, storage: SESSION,
    build(doc) { const okEl = doc.createElement("p"); okEl.id = "ok"; okEl.textContent = "Pack JSON is on this desk."; doc.body.appendChild(okEl); },
    route() { return { status: 404, body: {} }; }
  });
  await flush();
  pages.push(E);
  const api = E.api();
  t(!!api && typeof api.fromInstall === "function", "[install] AIASetupCards.fromInstall is there");
  const okEl = E.doc.getElementById("ok");
  if (api) api.fromInstall({ ok: true, charged: false, setupCardCreated: true, setupCard: { id: "setup_new9", source: { name: "Home Pack" }, status: "open", steps: [] } }, okEl);
  const fin = okEl.querySelectorAll("a").find((a) => a.textContent === "Finish setup");
  t(!!fin && fin.href === "/account#setup-setup_new9", "[install] the reply's setupCard shows a Finish setup link to its href");
  t(okEl.textContent.indexOf("Home Pack") >= 0, "[install] the line names the Pack");
  if (api) api.fromInstall({ ok: true, setupCard: null, setupCardCreated: false }, okEl);
  t(okEl.querySelectorAll("a").filter((a) => a.textContent === "Finish setup").length === 1, "[install] no setupCard adds nothing more");
  t(E.calls.length === 0, "[install] surfacing the card fetches nothing");

  // F: My account #setup-<id>
  let opened = 0;
  const F = runPage(src, {
    location: { pathname: "/account.html", search: "", hash: "#setup-setup_open1" }, storage: SESSION,
    build(doc) {
      const host = doc.createElement("section"); host.id = "acct-connections";
      const other = doc.createElement("div"); other.id = "acct-card-setup_other"; host.appendChild(other);
      const box = doc.createElement("div"); box.id = "acct-card-setup_open1";
      const o = doc.createElement("button"); o.textContent = "Open"; o.addEventListener("click", () => { opened += 1; });
      box.appendChild(o); host.appendChild(box); doc.body.appendChild(host);
    },
    route() { return { status: 404, body: {} }; }
  });
  await flush();
  pages.push(F);
  const fbox = F.doc.getElementById("acct-card-setup_open1");
  t(fbox.classList.contains("setup-hl") && fbox.scrolled >= 1, "[account] #setup-<id> scrolls to and highlights that card");
  t(opened === 1, "[account] the card opens once so setup can be finished there");
  t(!F.doc.getElementById("acct-card-setup_other").classList.contains("setup-hl"), "[account] other cards are not highlighted");

  // money / checkout
  const allCalls = [].concat.apply([], pages.map((p) => p.calls));
  t(!allCalls.some((c) => MONEY.test(c.url) || /"action":"(buy|pay|checkout|charge|buy-pack|install-pack|use-pack)/i.test(String(c.init.body || ""))), "[money] no money, checkout, Market or secret-key fetches (" + allCalls.map((c) => c.url).join(" ") + ")");
  t(allCalls.every((c) => /^\/api\/(jobs\?(workspace=[\w-]+|desks=all)|account)$/.test(c.url)), "[money] only the jobs read and /api/account");
  return bad;
}

// ---------- mutants ----------
const MUTANTS = [
  ["drop slug label", [["if (card.slug) {", "if (false) {"]]],
  ["wrong do value", [["body.do = verb;", "body.do = verb === \"done\" ? \"complete\" : verb;"]]],
  ["wrong endpoint", [["fetch(\"/api/account\",", "fetch(\"/api/accounts\","]]],
  ["swallow card statusText", [["if (typeof card.statusText === \"string\" && card.statusText) box.appendChild(el(\"p\", \"meta setup-status\", card.statusText));", ""]]],
  ["swallow step statusText", [["typeof st.statusText === \"string\" && st.statusText ? st.statusText : (st.reason || \"\")", "(st.reason || \"\")"]]],
  ["render killed cards", [["function liveCard(c) { return c && c.id && c.status !== \"killed\"; }", "function liveCard(c) { return c && c.id; }"]]],
  ["missing href", [["    a.href = hrefOf(card);\n    row.appendChild(a);", "    row.appendChild(a);"]]],
  ["retry loop on 409", [["      waiting[card.id + \"|\" + st.id] = true;", "      setTimeout(function () { act(card, st, \"done\"); }, 2000);\n      waiting[card.id + \"|\" + st.id] = true;"]]],
  ["show run-on-its-own", [["    row.appendChild(button(\"Stop\",", "    row.appendChild(button(\"Let it run on its own\", \"setup-auto\", function () {}));\n    row.appendChild(button(\"Stop\","]]],
  ["leak 403 error", [
    ["  var root = null;", "  var root = null;\n  var leak = \"\";"],
    ["      if (!r.ok) return [];", "      if (!r.ok) return r.json().then(function (d) { leak = d.error || \"Something went wrong.\"; return []; });"],
    ["    if (!live.length && !said.__top) { box.hidden = true; return; }", "    if (leak) { box.hidden = false; box.appendChild(el(\"p\", \"setup-say\", leak)); return; }\n    if (!live.length && !said.__top) { box.hidden = true; return; }"]
  ]],
  ["ignore setupCard", [["    var card = data && data.setupCard;", "    var card = null;"]]],
  ["no Stop button", [["    row.appendChild(button(\"Stop\", \"setup-stop\", function (b) { act(card, null, \"stop\", b); }));\n", ""]]],
  ["no Kill button", [["    row.appendChild(button(armed[card.id] ? KILL_YES : \"Kill\", \"setup-kill\", function (b) { act(card, null, \"kill\", b); }));\n", ""]]],
  ["Kill in one tap", [["    if (verb === \"kill\" && !armed[card.id]) { armed[card.id] = true; said[card.id] = KILL_ASK; paint(); return Promise.resolve(null); }\n", ""]]],
  ["armed Kill has no confirm label", [["button(armed[card.id] ? KILL_YES : \"Kill\",", "button(\"Kill\","]]],
  ["Keep the card does not cancel", [["function () { delete armed[card.id]; said[card.id] = \"\"; paint(); }", "function () {}"]]],
  ["no Keep the card", [["    if (armed[card.id]) row.appendChild(button(KILL_KEEP,", "    if (false) row.appendChild(button(KILL_KEEP,"]]],
  ["Stop leaves Kill armed", [["    if (armed[card.id]) { delete armed[card.id]; if (said[card.id] === KILL_ASK) said[card.id] = \"\"; }\n", ""]]],
  ["second tap sends no confirm", [["    if (verb === \"kill\") body.confirm = true;\n", ""]]],
  ["confirm sent as a string", [["    if (verb === \"kill\") body.confirm = true;", "    if (verb === \"kill\") body.confirm = \"yes\";"]]],
  ["409 second tap shown as a dead error", [["      if (verb === \"kill\" && x.status === 409 && x.d && x.d.error === KILL_AGAIN) { armed[card.id] = true; said[card.id] = KILL_REARM; paint(); return x; }\n", ""]]],
  ["killed line back to Killed", [["  var GONE = \"Stopped for good. Nothing more happens on this card.\";", "  var GONE = \"Killed. Nothing more happens on that card.\";"]]],
  ["Stop and Kill only on open cards", [["    // Stop and Kill: on every card", "    if (card.status !== \"open\") { box.appendChild(row); return box; }\n    // Stop and Kill: on every card"]]],
  ["409 crashes", [["    if (x.status === 409 && st && (st.kind === \"secret\" || (x.d && x.d.secretsReady === false))) {", "    if (x.status === 409 && st && (st.kind === \"secret\" || (x.d && x.d.secretsReady === false))) {\n      throw new Error(x.d.error);"]]],
  ["409 shows the server words", [["      said[card.id] = WAIT_SECRET;", "      said[card.id] = x.d.error;"]]],
  ["state word wrong", [["var STATE = { todo: \"To do\", done: \"Done\",", "var STATE = { todo: \"Pending\", done: \"Done\","]]],
  ["extra field on Done", [["    var body = { action: \"setup-step\", cardId: card.id };", "    var body = { action: \"setup-step\", cardId: card.id, desk: \"x\" };"]]],
  ["money fetch on tap", [["    if (btn) btn.disabled = true;", "    if (btn) btn.disabled = true;\n    fetch(\"/api/checkout\", { method: \"POST\" });"]]],
  ["all desks not used", [["if (queueAll) p = read(\"/api/jobs?desks=all\", \"\")", "if (false) p = read(\"/api/jobs?desks=all\", \"\")"]]],
  ["no account highlight", [["    if (box.classList) box.classList.add(\"setup-hl\");", ""]]],
  ["stale read guard removed", [["if (gen === readGen) show(got.l, got.all);", "show(got.l, got.all);"]]],
  ["href to wrong page", [["    return \"/account#setup-\" + encodeURIComponent(", "    return \"/my-account#\" + encodeURIComponent("]]],
  ["skip drops the reason", [["    if (verb === \"skip\") body.reason = SKIP_WHY;\n", ""]]],
  ["skip sends an empty reason", [["    if (verb === \"skip\") body.reason = SKIP_WHY;", "    if (verb === \"skip\") body.reason = \"\";"]]],
  ["connect step shows Done again", [["      if (st.kind === \"connect\") {", "      if (false) {"]]],
  ["connect step loses the My account link", [["        fin.href = hrefOf(card);\n        li.appendChild(fin);\n", ""]]],
  ["card id not encoded in href", [["    return \"/account#setup-\" + encodeURIComponent(String(card && card.id || \"\"));", "    return \"/account#setup-\" + String(card && card.id || \"\");"]]],
  ["My account does not decode the id", [["    try { return decodeURIComponent(m[1]); } catch (e) { return \"\"; }", "    return m[1];"]]]
];

function mutate(src, reps) {
  let out = src;
  for (const [a, b] of reps) {
    if (out.indexOf(a) < 0) return null;
    out = out.replace(a, b);
  }
  return out;
}

// ---------- static checks ----------
function staticChecks() {
  const deskBytes = fs.statSync(path.join(root, "desk.html")).size;
  ok(deskBytes === 35012, "desk.html is 35012 bytes (" + deskBytes + ")");
  const apiFreeze = require("./_api-freeze").check(root);
  ok(apiFreeze.ok, "api/ frozen vs " + apiFreeze.base + " (blob pin)" + (apiFreeze.ok ? "" : ": " + apiFreeze.problems.join("; ")));
  const pkg = JSON.parse(read("package.json"));
  ok(/node scripts\/check-setup-cards-ui\.js/.test(pkg.scripts.test), "npm test runs check-setup-cards-ui");
  ok(/node scripts\/check-setup-cards-desk\.js/.test(pkg.scripts.test) && /node scripts\/check-queue-login\.js/.test(pkg.scripts.test), "npm test still runs the desk and Queue checks");
  const nav = read("desk-nav.js");
  ok(/sc\.src = "\/setup-cards\.js"/.test(nav) && /tabOf\(\) === "queue" \|\| file\(\) === "account" \|\| file\(\) === "market" \|\| file\(\) === "create"/.test(nav), "desk-nav.js loads setup-cards.js on the Queue, My account, Market and Create (desk.html untouched)");
  ["desk.html", "account.html", "market.html", "create.html"].forEach((f) => ok(/<script src="desk-nav\.js"><\/script>/.test(read(f)), f + " loads desk-nav.js, so it gets setup-cards.js"));
  ["market-shop.js", "create-desk.js"].forEach((f) => {
    const n = (read(f).match(/AIASetupCards\.fromInstall\(data, ok\)/g) || []).length;
    ok(n === 2, f + " surfaces the install reply's setupCard after both installs (" + n + ")");
  });
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(code), "setup-cards.js sets text only, never HTML");
  ok(!/checkout|charge|buy-pack|install-pack|\/api\/market|secret-key|process\.env/i.test(code), "setup-cards.js has no money, checkout, Market or key code");
  ok(!/type\s*=\s*"checkbox"|\.checked\b/.test(code), "setup-cards.js has no switch");
}

async function main() {
  staticChecks();
  const base = await suite(SRC, (m) => ok(true, m));
  base.forEach((m) => fail(m));
  let caught = 0;
  for (const [name, reps] of MUTANTS) {
    const m = mutate(SRC, reps);
    if (m === null) { fail("mutant does not apply: " + name); continue; }
    if (m === SRC) { fail("mutant changed nothing: " + name); continue; }
    let bad;
    try { bad = await suite(m, null); } catch (e) { bad = ["threw " + e.message]; }
    if (bad.length) { caught += 1; console.log("ok  mutant caught: " + name + " (" + bad[0] + ")"); }
    else fail("mutant NOT caught: " + name);
  }
  console.log("mutants caught " + caught + "/" + MUTANTS.length);
  if (caught !== MUTANTS.length || MUTANTS.length < 10) fail("every mutant must be caught (" + caught + "/" + MUTANTS.length + ")");
  if (failed) { console.error("check-setup-cards-ui: " + passed + " ok, " + failed + " failed"); process.exit(1); }
  console.log("check-setup-cards-ui: " + passed + " ok, 0 failed");
}
main().catch((e) => { console.error("FAIL " + (e && e.stack || e)); process.exit(1); });
