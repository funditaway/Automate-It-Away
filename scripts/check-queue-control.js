#!/usr/bin/env node
require("./_env-guard");
// Queue step 1: the all-desks Queue as the control center (queue-login.js, screens only).
// - Each card shows one plain state, "Needs you", "Drafted", "Running" or "Done", mapped only from
//   fields GET /api/jobs?desks=all already returns (status, decide, awaiting, offDesk, draft).
//   A card that fits none shows no label. Every stored combination is checked against the spec below.
// - Yes and Stop sit on a card that needs you and call the desk's own POST /api/jobs taps with that
//   card's id and its own desk in X-Workspace: Yes is action "ship" with confirm false (the desk's ship()),
//   Stop is the desk's "Stop?" sheet first, then action "kill" with confirm true (the desk's kill() /
//   confirmKill()). Kill is the same desk flow behind the same sheet; it never fires on one tap.
//   The taps show only when that seat's own card lists them (a helper seat gets no Stop or Kill).
//   A refused tap (403 helper Kill, 404 other desk / no seat, 409 no confirm) or no answer: no reread,
//   the card stays and says "Nothing changed." The desk-wide control is a Pause link to the account
//   page's own desk row; there is no desk-wide Kill.
// - A stranger, a desk with no open seat, a closed seat, a 401/403, an empty or failed read: no cards
//   and no taps. Opening the Queue writes nothing: no job POST, no PUT/DELETE, no localStorage write,
//   no store save. Text goes in with textContent only.
// - The live-sync allowlist in check-queue-live-sync.js is byte-for-byte main's.
// The real api/jobs.js answers the page through a stubbed fetch. No network, no jsdom.
// Usage: node scripts/check-queue-control.js            (the check)
//        node scripts/check-queue-control.js --mutants  (each mutant must make the check fail)
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const MUTANTS_MODE = process.argv.indexOf("--mutants") >= 0;
let failed = 0;
let passed = 0;
function fail(msg) { failed += 1; console.error("FAIL " + msg); }
function ok(cond, msg) { if (cond) { passed += 1; console.log("ok  " + msg); } else fail(msg); }

const HTML = [];
function baseEl(tag) {
  const el = { tagName: String(tag || "div").toUpperCase(), className: "", hidden: false, value: "", type: "", text: "", href: "", attrs: {}, children: [], parentNode: null, style: {}, listeners: {}, disabled: false };
  Object.defineProperty(el, "id", { get: () => el.attrs.id || "", set: (v) => { el.attrs.id = String(v); } });
  el.classList = {
    toggle(name, on) {
      const parts = String(el.className || "").split(/\s+/).filter(Boolean).filter((p) => p !== name);
      const has = String(el.className || "").split(/\s+/).indexOf(name) >= 0;
      const next = on === undefined ? !has : !!on;
      if (next) parts.push(name);
      el.className = parts.join(" ");
      notifyMut(el);
      return next;
    },
    contains(name) { return String(el.className || "").split(/\s+/).indexOf(name) >= 0; },
    add(name) { el.classList.toggle(name, true); },
    remove(name) { el.classList.toggle(name, false); }
  };
  el.setAttribute = (k, v) => { el.attrs[k] = String(v); if (k === "class") el.className = String(v); };
  el.getAttribute = (k) => (Object.prototype.hasOwnProperty.call(el.attrs, k) ? el.attrs[k] : null);
  el.appendChild = (c) => { if (c.parentNode && c.parentNode.removeChild) c.parentNode.removeChild(c); c.parentNode = el; el.children.push(c); notifyMut(el); return c; };
  el.insertBefore = (c, ref) => {
    if (c.parentNode && c.parentNode.children) {
      const j = c.parentNode.children.indexOf(c);
      if (j >= 0) c.parentNode.children.splice(j, 1);
    }
    c.parentNode = el;
    const i = ref ? el.children.indexOf(ref) : -1;
    if (i < 0) el.children.push(c); else el.children.splice(i, 0, c);
    notifyMut(el);
    return c;
  };
  el.removeChild = (c) => {
    const i = el.children.indexOf(c);
    if (i >= 0) el.children.splice(i, 1);
    if (c) c.parentNode = null;
    notifyMut(el);
    return c;
  };
  el.replaceChildren = (...nodes) => { el.children.splice(0, el.children.length); nodes.forEach((n) => el.appendChild(n)); };
  Object.defineProperty(el, "firstChild", { get: () => el.children[0] || null });
  Object.defineProperty(el, "nextSibling", { get: () => { if (!el.parentNode) return null; const i = el.parentNode.children.indexOf(el); return i >= 0 ? el.parentNode.children[i + 1] || null : null; } });
  Object.defineProperty(el, "textContent", {
    get: () => (el.children.length ? el.children.map((c) => c.textContent || "").join(" ") : el.text),
    set: (v) => { el.text = v == null ? "" : String(v); el.children.splice(0, el.children.length); notifyMut(el); }
  });
  el.closest = (sel) => {
    const m = String(sel).match(/^\[([a-z-]+)\]$/);
    for (let n = el; n; n = n.parentNode) { if (m && n.getAttribute && n.getAttribute(m[1]) !== null) return n; }
    return null;
  };
  el.addEventListener = (ev, fn) => { (el.listeners[ev] = el.listeners[ev] || []).push(fn); };
  el.focus = () => { FOCUS.at = el; if (el.ownerDocument) el.ownerDocument.activeElement = el; };
  el.querySelector = (sel) => {
    const m = String(sel).match(/^\[([a-z-]+)\]$/);
    let f = null;
    if (m) walk(el, (n) => { if (!f && n !== el && n.getAttribute(m[1]) !== null) f = n; });
    return f;
  };
  return el;
}
const FOCUS = { at: null };
let moList = [];
function notifyMut(el) {
  let n = el;
  let inCards = false;
  while (n) {
    if (n.id === "queue-all-cards") { inCards = true; break; }
    n = n.parentNode;
  }
  if (inCards && el.ownerDocument && typeof el.ownerDocument._bumpScroll === "function") el.ownerDocument._bumpScroll();
  moList.forEach((o) => { if (o._el === el) { try { o._fn(); } catch (e) {} } });
}
function walk(el, fn) { if (!el || !el.tagName) return; fn(el); (el.children || []).forEach((c) => walk(c, fn)); }
function makeDocument() {
  const documentElement = makeEl("html"), head = makeEl("head"), body = makeEl("body"), main = makeEl("main"), h1 = makeEl("h1");
  h1.className = "page-title"; h1.textContent = "Queue";
  const banner = makeEl("div"); banner.id = "banner";
  const queue = makeEl("div"); queue.id = "queue";
  const yes = makeEl("button"); yes.className = "go"; yes.id = "q-yes-fixture"; yes.textContent = "Yes";
  const stop = makeEl("button"); stop.className = "kill"; stop.id = "q-stop-fixture"; stop.textContent = "Stop";
  const kill = makeEl("button"); kill.className = "edit"; kill.id = "q-kill-fixture"; kill.textContent = "Kill";
  queue.appendChild(yes); queue.appendChild(stop); queue.appendChild(kill);
  const sheet = makeEl("div"); sheet.id = "sheet";
  const sheetCard = makeEl("div"); sheetCard.id = "sheet-card";
  const talk = makeEl("textarea"); talk.id = "talk"; talk.value = "";
  sheetCard.appendChild(talk);
  sheet.appendChild(sheetCard);
  main.appendChild(h1); main.appendChild(banner); main.appendChild(queue);
  body.appendChild(main); body.appendChild(sheet);
  documentElement.appendChild(head); documentElement.appendChild(body);
  const listeners = {};
  const document = {
    documentElement, head, body, readyState: "loading", listeners, hidden: false, visibilityState: "visible",
    activeElement: documentElement, createElement: makeEl,
    addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    getElementById(id) { let f = null; walk(documentElement, (el) => { if (!f && el.id === id) f = el; }); if (!f && sheet.id === id) f = sheet; if (!f) walk(sheet, (el) => { if (!f && el.id === id) f = el; }); return f; },
    querySelector(sel) {
      const parts = String(sel || "").split(",").map((s) => s.trim());
      let f = null;
      walk(documentElement, (el) => {
        if (f) return;
        if (parts.indexOf("main h1") >= 0 && el.tagName === "H1" && el.parentNode && el.parentNode.tagName === "MAIN") f = el;
        else if (parts.indexOf("h1.page-title") >= 0 && el.tagName === "H1" && el.classList.contains("page-title")) f = el;
      });
      return f;
    }
  };
  function own(el) { el.ownerDocument = document; (el.children || []).forEach(own); }
  own(documentElement); own(sheet);
  const rawCreate = document.createElement;
  document.createElement = function (tag) { const el = makeEl(tag); own(el); return el; };
  void rawCreate;
  return document;
}
function memStore(seed) {
  const m = Object.assign({}, seed || {});
  return { getItem: (k) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
}

function makeEl(tag) {
  const el = baseEl(tag);
  Object.defineProperty(el, "innerHTML", { get: () => "", set: (v) => { HTML.push("innerHTML " + String(v).slice(0, 60)); } });
  Object.defineProperty(el, "outerHTML", { get: () => "", set: (v) => { HTML.push("outerHTML " + String(v).slice(0, 60)); } });
  el.insertAdjacentHTML = (w, v) => { HTML.push("insertAdjacentHTML " + String(v).slice(0, 60)); };
  return el;
}

const LABELS = ["Needs you", "Drafted", "Running", "Done"];
// main's allowedLiveCall + liveCallFaults in scripts/check-queue-live-sync.js (712 bytes).
const ALLOW_SHA = "8fa25af04b45fae638cef43476e4fcd39f2e648ee1ec8a8a401dce3bcf0cb59e";
const ALLOW_BYTES = 712;

function allowBlock(text) {
  const a = text.indexOf("function allowedLiveCall(c) {");
  const f = text.indexOf("function liveCallFaults(calls) {");
  if (a < 0 || f < a) return "";
  const e = text.indexOf("\n}\n", f);
  return e < 0 ? "" : text.slice(a, e + 3);
}

// The spec, written out on its own: what each stored combination must show.
function spec(j) {
  if (!j || typeof j !== "object") return "";
  const st = typeof j.status === "string" ? j.status : "";
  if (st === "shipped") return "Done";
  if (st === "out") return "Running";
  if (["waiting", "held", "exception"].indexOf(st) < 0) return "";
  if (j.awaiting === "writeback" || j.offDesk === true) return "Running";
  if ((st === "waiting" || st === "held") && j.decide === true) return "Needs you";
  if (typeof j.draft === "string" && j.draft.trim()) return "Drafted";
  return "";
}

function grabFn(src, name) {
  const at = src.indexOf("function " + name + "(");
  if (at < 0) return "";
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") { depth -= 1; if (depth === 0) return src.slice(at, i + 1); }
  }
  return "";
}

function loadMapper(src) {
  const consts = (src.match(/^\s*var STATE_(NEEDS|DRAFTED|RUNNING|DONE) = "[^"]*";$/mg) || []).join("\n");
  const fn = grabFn(src, "queueState");
  if (!fn) return null;
  const box = {};
  vm.createContext(box);
  vm.runInContext(consts + "\n" + fn + "\nthis.queueState = queueState;", box, { timeout: 1000 });
  return box.queueState;
}

function memStoreLogged(seed, log, name) {
  const m = Object.assign({}, seed || {});
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
    setItem: (k, v) => { log.push(name + ".setItem " + k); m[k] = String(v); },
    removeItem: (k) => { log.push(name + ".removeItem " + k); delete m[k]; },
    clear: () => { log.push(name + ".clear"); }
  };
}
const tick = () => new Promise((r) => setImmediate(r));
async function settle(n) { for (let i = 0; i < (n || 60); i++) await tick(); }

// One page of desk.html running queue-login.js as-is. fetch goes to `answer(url, init)`.
function startPage(src, opts) {
  moList = [];
  const calls = [];
  const writes = [];
  const timers = [];
  const adds = [];
  let tid = 0;
  const document = makeDocument();
  const seed = opts.signedOut ? {} : Object.assign({ aia_session: opts.token || "sess-test", aia_ws: opts.home || "", aia_name: "Ann" }, opts.local || {});
  const local = memStoreLogged(seed, writes, "localStorage");
  const session = memStoreLogged({}, writes, "sessionStorage");
  const location = { href: "http://127.0.0.1/desk.html", pathname: "/desk.html", search: "", hash: "" };
  function MutationObserver(fn) { this._fn = fn; this._el = null; }
  MutationObserver.prototype.observe = function (el) { this._el = el; moList.push(this); };
  MutationObserver.prototype.disconnect = function () {};
  const sandbox = {
    URL, URLSearchParams, JSON, Object, Array, String, Number, Promise, Error, TypeError, Math, Date, encodeURIComponent, decodeURIComponent, console,
    AbortController,
    setTimeout: (fn, ms) => { const id = ++tid; timers.push({ id, fn, ms, cleared: false }); return id; },
    clearTimeout: (id) => { timers.forEach((t) => { if (t.id === id) t.cleared = true; }); },
    document, location, history: { pushState() {} }, localStorage: local, sessionStorage: session, MutationObserver,
    scrollX: 0, scrollY: 0, pageXOffset: 0, pageYOffset: 0, scrollTo() {},
    fetch(url, init) {
      const call = { url: String(url), method: String((init && init.method) || "GET").toUpperCase(), headers: Object.assign({}, (init && init.headers) || {}), body: init && init.body ? String(init.body) : "" };
      calls.push(call);
      return Promise.resolve(opts.answer(call)).then((r) => {
        if (r === "network") throw new TypeError("Failed to fetch");
        return { ok: r.status >= 200 && r.status < 300, status: r.status, json: () => Promise.resolve(r.body) };
      });
    },
    addEventListener() {},
    AIADesks: { slugify: (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40), add(d) { adds.push(d && d.slug); }, list: () => [], open() { adds.push("open"); } }
  };
  sandbox.window = sandbox;
  document._bumpScroll = function () {};
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "queue-login.js", timeout: 2000 });
  (document.listeners.DOMContentLoaded || []).forEach((fn) => { Promise.resolve().then(fn).catch((e) => { sandbox._bootError = String(e && (e.stack || e)); }); });
  const box = () => document.getElementById("queue-all-cards");
  const find = (pred) => { const out = []; if (box()) walk(box(), (el) => { if (pred(el)) out.push(el); }); return out; };
  return {
    calls, writes, timers, adds, document, sandbox,
    articles: () => find((el) => el.tagName === "ARTICLE"),
    article: (key) => find((el) => el.tagName === "ARTICLE" && el.getAttribute("data-queue-card") === key)[0] || null,
    buttons: () => find((el) => el.tagName === "BUTTON"),
    taps: () => find((el) => el.tagName === "BUTTON" && (el.getAttribute("data-queue-yes") !== null || el.getAttribute("data-queue-stop") !== null || el.getAttribute("data-queue-kill") !== null)),
    sheet: () => document.getElementById("sheet"),
    sheetCard: () => document.getElementById("sheet-card"),
    click(el) { (box().listeners.click || []).forEach((fn) => fn({ target: el })); },
    clickOwn(el) { (el.listeners.click || []).forEach((fn) => fn({ target: el })); },
    fireIdle() { const due = timers.filter((t) => !t.cleared && t.ms >= 15000); due.forEach((t) => { t.cleared = true; t.fn(); }); return due.length; }
  };
}

function stateOf(card) {
  const out = [];
  (card ? card.children : []).forEach((c) => { if (c.getAttribute && c.getAttribute("data-queue-state") !== null) out.push(c); });
  return out;
}
function countText(card, text) {
  let n = 0;
  walk(card, (el) => { if (!el.children.length && String(el.text || "") === text) n += 1; });
  return n;
}
function statusNodes(card) {
  const out = [];
  (card ? card.children : []).forEach((c) => { if (c.getAttribute && c.getAttribute("data-queue-status") !== null) out.push(c); });
  return out;
}
function tapsOf(card) {
  const out = { yes: [], stop: [], kill: [], all: [] };
  walk(card, (el) => {
    if (el.tagName !== "BUTTON") return;
    if (el.getAttribute("data-queue-yes") !== null) { out.yes.push(el); out.all.push(el); }
    if (el.getAttribute("data-queue-stop") !== null) { out.stop.push(el); out.all.push(el); }
    if (el.getAttribute("data-queue-kill") !== null) { out.kill.push(el); out.all.push(el); }
  });
  return out;
}

// ---------- the real api/jobs.js behind the page ----------
function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; }
  };
}
async function call(handler, method, headers, body, query, url) {
  const res = mockRes();
  await handler({ method, headers: headers || {}, body: body || {}, query: query || {}, url: url || "/api/jobs" }, res);
  return res;
}

const NETWORK = [];
async function realServer() {
  global.fetch = function (u) { NETWORK.push(String(u)); return Promise.reject(new TypeError("no network in this check")); };
  process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-queue-control-" + Date.now() + "-" + process.pid + ".json");
  const auth = require(path.join(root, "api/auth"));
  const jobs = require(path.join(root, "api/jobs"));
  const desks = require(path.join(root, "api/_desks-http"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();
  async function open(slug, name, pin, email) {
    const r = await call(auth, "POST", { "x-workspace": slug }, { action: "open", slug, biz: name, name, pin, email: email || "" }, {}, "/api/auth");
    if (r.statusCode !== 201 || !r.body || !r.body.session) throw new Error("open " + slug + " " + r.statusCode);
    return r.body.session.token;
  }
  const annTok = await open("qc-a", "Ann Queue", "1111", "");
  const pw = await call(auth, "POST", { "x-workspace": "qc-a", "x-session": annTok }, { action: "password", password: "ann-pass-control-1234", email: "ann@control.test" }, {}, "/api/auth");
  if (pw.statusCode !== 200) throw new Error("password " + pw.statusCode);
  await open("qc-b", "Bea Desk", "2222", "bea@control.test");
  await open("qc-c", "Cy Desk", "3333", "cy@control.test");
  await open("qc-d", "Dee Desk", "4444", "dee@control.test");
  const ann = lib.mem.accounts.find((a) => a && a.email === "ann@control.test");
  const W = (slug) => lib.mem.workspaces.find((w) => w && w.slug === slug);
  W("qc-b").people.push({ id: "p_ann_at_b", name: "Ann", role: "employee", kind: "helper", status: "approved", accountId: ann.id, email: "ann@control.test", pin: lib.hashPin("9191"), createdAt: "2026-01-02T00:00:00.000Z" });
  W("qc-d").people.push({ id: "p_ann_at_d", name: "Ann", role: "owner", kind: "owner", status: "denied", accountId: ann.id, email: "ann@control.test", pin: lib.hashPin("8181"), createdAt: "2026-01-03T00:00:00.000Z" });
  if (ann.desks.indexOf("qc-c") < 0) ann.desks.push("qc-c");
  function put(slug, id, extra) {
    lib.mem.jobs.unshift(Object.assign({ id, workspace: slug, title: "Card " + id, status: "waiting", kind: "task", createdAt: "2026-01-01T00:00:00.000Z" }, extra || {}));
  }
  put("qc-a", "a_wait");
  put("qc-a", "a_held", { status: "held" });
  put("qc-a", "a_kill_me");
  put("qc-a", "a_info", { waitingOn: "info", draft: "Draft for a_info" });
  put("qc-a", "a_need", { why: "Need a number before this can go." });
  put("qc-a", "a_exc", { status: "exception", needs: [{ id: "yes", label: "Yes" }, { id: "stop", label: "Stop" }, { id: "kill", label: "Kill" }] });
  put("qc-a", "a_exc_draft", { status: "exception", draft: "Draft for a_exc_draft" });
  put("qc-a", "a_out", { status: "out", awaiting: "writeback" });
  put("qc-a", "a_carried", { carried: true });
  put("qc-a", "a_ship", { status: "shipped" });
  put("qc-a", "a_dead", { status: "killed" });
  put("qc-a", "a_odd", { status: "open", draft: "Draft for a_odd" });
  put("qc-b", "b_wait");
  put("qc-c", "c_wait", { title: "SECRET-C-NOSEAT" });
  put("qc-d", "d_wait", { title: "SECRET-D-CLOSED" });
  const login = await call(auth, "POST", {}, { action: "login", email: "ann@control.test", password: "ann-pass-control-1234", workspace: "qc-a" }, {}, "/api/auth");
  if (login.statusCode !== 200 || !login.body.session) throw new Error("login " + login.statusCode);
  await lib.save();
  let saves = 0;
  const save = lib.save;
  lib.save = async function () { saves += 1; return save.apply(this, arguments); };
  const answer = async (c) => {
    const u = new URL(c.url, "http://127.0.0.1");
    const query = {};
    u.searchParams.forEach((v, k) => { query[k] = v; });
    const headers = {};
    Object.keys(c.headers || {}).forEach((k) => { headers[k.toLowerCase()] = c.headers[k]; });
    const body = c.body ? JSON.parse(c.body) : {};
    const handler = u.pathname === "/api/desks" ? desks : u.pathname === "/api/jobs" ? jobs : null;
    if (!handler) return { status: 404, body: {} };
    const r = await call(handler, c.method, headers, body, query, c.url);
    return { status: r.statusCode, body: JSON.parse(JSON.stringify(r.body == null ? {} : r.body)) };
  };
  const jobOf = (id) => lib.mem.jobs.find((j) => j && j.id === id);
  const snap = () => JSON.stringify(lib.mem.jobs.map((j) => [j.id, j.workspace, j.status, j.whoTapped || "", j.rail || ""]));
  return { lib, answer, token: login.body.session.token, pinTok: annTok, jobOf, snap, saves: () => saves, mem: () => JSON.stringify({ jobs: lib.mem.jobs, workspaces: lib.mem.workspaces, accounts: lib.mem.accounts, money: lib.mem.money }) };
}

async function suite(src, liveSyncText, loginText) {
  // ---------- 1. the state mapping, every stored combination ----------
  const map = loadMapper(src);
  ok(typeof map === "function", "[map] queue-login.js has one pure queueState(card)");
  if (typeof map !== "function") return;
  const rows = [
    [{ status: "waiting", decide: true }, "Needs you"],
    [{ status: "held", decide: true }, "Needs you"],
    [{ status: "waiting", decide: true, draft: "Hi" }, "Needs you"],
    [{ status: "waiting" }, ""],
    [{ status: "held" }, ""],
    [{ status: "waiting", decide: false }, ""],
    [{ status: "waiting", decide: "true" }, ""],
    [{ status: "waiting", decide: false, draft: "Hi" }, "Drafted"],
    [{ status: "held", draft: "Hi" }, "Drafted"],
    [{ status: "exception", decide: true }, ""],
    [{ status: "exception", decide: true, draft: "Hi" }, "Drafted"],
    [{ status: "exception" }, ""],
    [{ status: "exception", draft: "Hi" }, "Drafted"],
    [{ status: "exception", draft: "   " }, ""],
    [{ status: "exception", draft: 5 }, ""],
    [{ status: "exception", waitingOn: "owner", draft: "Hi" }, "Drafted"],
    [{ status: "out", awaiting: "writeback" }, "Running"],
    [{ status: "out" }, "Running"],
    [{ status: "waiting", awaiting: "writeback" }, "Running"],
    [{ status: "held", offDesk: true, decide: true }, "Running"],
    [{ status: "waiting", offDesk: "yes", decide: true }, "Needs you"],
    [{ status: "out", decide: true }, "Running"],
    [{ status: "shipped" }, "Done"],
    [{ status: "shipped", carried: true, rail: "carried" }, "Done"],
    [{ status: "killed" }, ""],
    [{ status: "killed", decide: true }, ""],
    [{ status: "shipped", decide: true }, "Done"],
    [{ status: "killed", draft: "Hi" }, ""],
    [{ status: "open", draft: "Hi" }, ""],
    [{ status: "Shipped" }, ""],
    [{ status: "zzz", draft: "Hi", awaiting: "writeback", offDesk: true }, ""],
    [{}, ""],
    [{ draft: "Hi" }, ""],
    [{ awaiting: "writeback" }, ""],
    [{ offDesk: true }, ""],
    [{ decide: true }, ""],
    [{ decide: true, draft: "Hi", awaiting: "writeback" }, ""],
    [{ status: 1 }, ""],
    [null, ""],
    ["waiting", ""]
  ];
  rows.forEach(([card, want]) => {
    const got = map(card);
    ok(got === want, "[map] " + JSON.stringify(card) + " -> " + JSON.stringify(want) + (got === want ? "" : " (got " + JSON.stringify(got) + ")"));
  });
  // Every combination of the stored fields, against the spec.
  const STATUS = [undefined, "", "waiting", "held", "exception", "out", "shipped", "killed", "open", "zzz"];
  const AXES = { decide: [undefined, true, false, "true", 1], awaiting: [undefined, "writeback", "other"], offDesk: [undefined, true, "true"], draft: [undefined, "Draft", "  ", 3], carried: [undefined, true], waitingOn: [undefined, "info"] };
  let combos = 0, bad = [], neverOff = [], offList = [];
  STATUS.forEach((st) => {
    let list = [{}];
    Object.keys(AXES).forEach((k) => { const next = []; list.forEach((c) => AXES[k].forEach((v) => { const d = Object.assign({}, c); if (v !== undefined) d[k] = v; next.push(d); })); list = next; });
    list.forEach((c) => {
      if (st !== undefined) c.status = st;
      combos += 1;
      const got = map(c);
      if (got !== spec(c)) bad.push(JSON.stringify(c) + " got " + JSON.stringify(got) + " want " + JSON.stringify(spec(c)));
      if (got !== "" && LABELS.indexOf(got) < 0) offList.push(got);
      if (st === undefined && (got === "Done" || got === "Running")) neverOff.push(JSON.stringify(c));
    });
  });
  ok(!bad.length, "[map] all " + combos + " stored combinations match the spec" + (bad.length ? " (" + bad.length + " off, first: " + bad[0] + ")" : ""));
  ok(!offList.length, "[map] only the four labels or none (" + offList.slice(0, 3).join(", ") + ")");
  ok(!neverOff.length, "[map] a card with none of the state fields never shows Done or Running" + (neverOff.length ? " (" + neverOff[0] + ")" : ""));

  // ---------- 2. textContent only ----------
  const htmlSinks = (src.match(/\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML|document\.write\b/g) || []);
  ok(!htmlSinks.length, "[text] queue-login.js has no innerHTML / outerHTML / insertAdjacentHTML / document.write (" + htmlSinks.join(",") + ")");

  // ---------- 3. allowlist byte-unchanged ----------
  const blk = allowBlock(liveSyncText);
  const sha = crypto.createHash("sha256").update(blk).digest("hex");
  ok(blk.length === ALLOW_BYTES && sha === ALLOW_SHA, "[allowlist] check-queue-live-sync allowedLiveCall + liveCallFaults are main's bytes (" + blk.length + " bytes, " + sha.slice(0, 12) + ")");
  let allowed = null;
  try { const b = {}; vm.createContext(b); vm.runInContext(blk + "\nthis.allowedLiveCall = allowedLiveCall;", b); allowed = b.allowedLiveCall; } catch (e) { allowed = null; }
  ok(typeof allowed === "function", "[allowlist] main's allowedLiveCall loads");

  // ---------- 4. npm hook ----------
  ok(/spawnSync\(process\.execPath, \[path\.join\(root, "scripts\/check-queue-control\.js"\)\]/.test(loginText), "[npm] check-queue-login.js runs scripts/check-queue-control.js");

  // ---------- 5. the real server behind the page ----------
  const srv = await realServer();
  const memBefore = srv.mem();
  const savesBefore = srv.saves();
  HTML.length = 0;
  const p = startPage(src, { token: srv.token, home: "qc-a", answer: srv.answer });
  await settle();
  ok(!p.sandbox._bootError, "[load] page booted" + (p.sandbox._bootError ? " (" + p.sandbox._bootError.slice(0, 160) + ")" : ""));
  const loadCalls = p.calls.slice();
  const writeCalls = loadCalls.filter((c) => c.method !== "GET" && !(c.method === "POST" && /\/api\/desks$/.test(c.url.split("?")[0]) && JSON.parse(c.body || "{}").action === "mine"));
  ok(loadCalls.length > 0 && !writeCalls.length, "[load] opening the Queue sends no write (only GET reads and the read-only desks mine) (" + writeCalls.map((c) => c.method + " " + c.url).join("; ") + ")");
  ok(!loadCalls.some((c) => /\/api\/jobs/.test(c.url) && c.method !== "GET"), "[load] no POST/PUT/DELETE to /api/jobs on load");
  ok(allowed && loadCalls.every((c) => allowed(c)), "[load] every load call is on main's live-sync allowlist");
  ok(!p.writes.length, "[load] no localStorage or sessionStorage write on load (" + p.writes.join("; ") + ")");
  ok(srv.saves() === savesBefore && srv.mem() === memBefore, "[load] the store is not saved or changed by opening the Queue");
  // First paint, before any live refresh: a fresh waiting card already shows "Needs you" once.
  const first = p.article("a_wait@qc-a");
  ok(first && countText(first, "Needs you") === 1 && statusNodes(first).length === 0, "[once] first paint: a_wait shows \"Needs you\" once with no old status line (" + (first ? countText(first, "Needs you") + " / " + statusNodes(first).map((n) => n.textContent).join("|") : "no card") + ")");
  const before = p.calls.length;
  ok(p.fireIdle() > 0, "[live] a live refresh timer is armed after the good load");
  await settle();
  const liveCalls = p.calls.slice(before);
  ok(liveCalls.length > 0 && allowed && liveCalls.every((c) => allowed(c)), "[live] the live tick only makes allowlisted reads (" + liveCalls.map((c) => c.method + " " + c.url).join("; ") + ")");
  ok(!p.writes.length && srv.saves() === savesBefore, "[live] the live tick writes nothing");

  const keys = p.articles().map((a) => a.getAttribute("data-queue-card"));
  const want = {
    "a_wait@qc-a": ["Needs you", "yes,stop,kill"],
    "a_held@qc-a": ["Needs you", "yes,stop,kill"],
    "a_kill_me@qc-a": ["Needs you", "yes,stop,kill"],
    "a_info@qc-a": ["Drafted", ""],
    "a_need@qc-a": ["", ""],
    "a_exc@qc-a": ["", ""],
    "a_exc_draft@qc-a": ["Drafted", ""],
    "a_out@qc-a": ["Running", ""],
    "a_carried@qc-a": ["", ""],
    "a_odd@qc-a": ["", ""],
    "b_wait@qc-b": ["Needs you", "yes"]
  };
  Object.keys(want).forEach((k) => {
    const card = p.article(k);
    if (!card) { fail("[cards] " + k + " is on the Queue"); return; }
    const st = stateOf(card);
    const label = st.length ? st[0].textContent : "";
    ok(st.length <= 1 && label === want[k][0], "[state] " + k + " shows " + JSON.stringify(want[k][0] || "no label") + " (got " + JSON.stringify(label) + ", " + st.length + " label nodes)");
    if (st.length) ok(st[0].getAttribute("data-queue-state") === label && LABELS.indexOf(label) >= 0, "[state] " + k + " label is one of the four");
    const t = tapsOf(card);
    const sig = [t.yes.length ? "yes" : "", t.stop.length ? "stop" : "", t.kill.length ? "kill" : ""].filter(Boolean).join(",");
    ok(sig === want[k][1] && t.yes.length <= 1 && t.stop.length <= 1 && t.kill.length <= 1, "[taps] " + k + " has " + JSON.stringify(want[k][1] || "no taps") + " (got " + JSON.stringify(sig) + ")");
    const [id, desk] = k.split("@");
    t.all.forEach((b) => {
      const attr = b.getAttribute("data-queue-yes") !== null ? "data-queue-yes" : b.getAttribute("data-queue-stop") !== null ? "data-queue-stop" : "data-queue-kill";
      ok(b.getAttribute(attr) === id && b.getAttribute("data-queue-on") === desk && b.getAttribute("data-queue-desk") === null, "[taps] " + k + " " + attr + " names this card and this desk");
      const word = attr === "data-queue-yes" ? "Yes" : attr === "data-queue-stop" ? "Stop" : "Kill";
      ok(b.textContent === word, "[taps] " + k + " " + attr + " reads " + word + " (got " + JSON.stringify(b.textContent) + ")");
    });
  });
  ["a_ship@qc-a", "a_dead@qc-a", "c_wait@qc-c", "d_wait@qc-d"].forEach((k) => ok(!p.article(k), "[cards] " + k + " is not on the Queue"));
  // "Needs you" once: a waiting card that needs you shows the label only, never the old status line too.
  ["a_wait@qc-a", "a_kill_me@qc-a", "b_wait@qc-b"].forEach((k) => {
    const card = p.article(k);
    ok(card && countText(card, "Needs you") === 1, "[once] " + k + " shows \"Needs you\" exactly once (" + (card ? countText(card, "Needs you") : "no card") + ")");
    ok(card && statusNodes(card).length === 0, "[once] " + k + " has no old status line (" + (card ? statusNodes(card).map((n) => n.textContent).join("|") : "") + ")");
    ok(card && stateOf(card).length === 1 && stateOf(card)[0].textContent === "Needs you", "[once] " + k + " keeps the Needs you label");
  });
  p.articles().forEach((a) => ok(countText(a, "Needs you") <= 1, "[once] " + a.getAttribute("data-queue-card") + " never shows \"Needs you\" twice"));
  // Every other status line stays as it was.
  [["a_held@qc-a", "Waiting on the owner"], ["a_exc@qc-a", "Waiting on a person"], ["a_out@qc-a", "Open"], ["a_info@qc-a", "Needs you"]].forEach(([k, line]) => {
    const card = p.article(k);
    const lines = card ? statusNodes(card).map((n) => n.textContent) : [];
    ok(lines.length === 1 && lines[0] === line, "[once] " + k + " keeps its status line " + JSON.stringify(line) + " (" + lines.join("|") + ")");
  });
  const allText = p.articles().map((a) => a.textContent).join(" ");
  ok(allText.indexOf("SECRET-C") < 0 && allText.indexOf("SECRET-D") < 0, "[cards] no card from a desk with no seat or a closed seat");
  // Kill one tap away, for every desk whose cards list Kill for this seat.
  const killDesks = {};
  p.articles().forEach((a) => tapsOf(a).kill.forEach((b) => { killDesks[b.getAttribute("data-queue-on")] = true; }));
  ok(killDesks["qc-a"] === true, "[kill] the owner desk qc-a has Kill on the Queue");
  ok(!killDesks["qc-b"], "[kill] the helper seat at qc-b gets no Kill (its own card lists none)");
  // Desk-wide control: Pause (a link to the account page's own desk row), never a desk-wide Kill.
  const picker = p.document.getElementById("queue-desk-picker");
  const pauses = []; const deskWide = [];
  walk(picker, (el) => { if (el.getAttribute && el.getAttribute("data-queue-pause") !== null) pauses.push(el); if (!el.children.length && /\bKill\b/.test(el.text || "")) deskWide.push(el); });
  walk(p.document.getElementById("queue-all-cards"), (el) => {
    let inCard = false; for (let n = el; n; n = n.parentNode) { if (n.tagName === "ARTICLE" || (n.id === "sheet")) { inCard = true; break; } }
    if (!inCard && !el.children.length && /\bKill\b/.test(el.text || "")) deskWide.push(el);
  });
  ok(!deskWide.length, "[pause] no desk-wide Kill anywhere outside a card (" + deskWide.map((e) => e.tagName + ":" + e.text).join(",") + ")");
  const pa = pauses.find((e) => e.getAttribute("data-queue-pause") === "qc-a");
  ok(pauses.length === 1 && pa && pa.tagName === "A" && pa.textContent === "Pause" && pa.href === "/account#acct-desk-qc-a", "[pause] the owned desk qc-a has one Pause link to /account#acct-desk-qc-a (" + pauses.map((e) => e.getAttribute("data-queue-pause") + "=" + e.textContent + ">" + e.href).join(",") + ")");
  ok(!pauses.some((e) => e.getAttribute("data-queue-pause") === "qc-b"), "[pause] the helper desk qc-b gets no Pause");
  ok(!pauses.some((e) => e.getAttribute("data-queue-pause") === "qc-d"), "[pause] the closed (denied) seat at qc-d gets no Pause");
  ok(pa && !(pa.listeners.click || []).length, "[pause] Pause is a plain link: no tap handler, nothing sent from the Queue");
  ok(HTML.length === 0, "[text] no innerHTML / outerHTML / insertAdjacentHTML at runtime (" + HTML.slice(0, 2).join("; ") + ")");

  // ---------- 6. Yes ----------
  async function tapYes(key) {
    const card = p.article(key);
    const btn = card && tapsOf(card).yes[0];
    if (!btn) { fail("[yes] " + key + " has a Yes"); return null; }
    const n = p.calls.length;
    const s0 = srv.snap();
    p.click(btn);
    await settle();
    return { posts: p.calls.slice(n).filter((c) => c.method !== "GET" && !/\/api\/desks/.test(c.url)), s0 };
  }
  const changed = (s0, s1) => {
    const a = JSON.parse(s0), b = JSON.parse(s1);
    const m = {}; a.forEach((r) => { m[r[0] + "@" + r[1]] = JSON.stringify(r); });
    return b.filter((r) => m[r[0] + "@" + r[1]] !== JSON.stringify(r)).map((r) => r[0] + "@" + r[1]);
  };
  const y1 = await tapYes("a_wait@qc-a");
  if (y1) {
    const c = y1.posts;
    const body = c.length === 1 ? JSON.parse(c[0].body || "{}") : {};
    ok(c.length === 1 && c[0].url === "/api/jobs" && c[0].method === "POST", "[yes] one POST /api/jobs (" + c.map((x) => x.method + " " + x.url).join("; ") + ")");
    ok(body.action === "ship" && body.id === "a_wait" && body.confirm === false && body.amount === 0 && body.whoTapped === "Ann" && Object.keys(body).sort().join(",") === "action,amount,confirm,id,whoTapped", "[yes] the desk's ship body: action ship, this card id, confirm false (" + JSON.stringify(body) + ")");
    ok(c.length === 1 && c[0].headers["X-Workspace"] === "qc-a" && c[0].headers["X-Session"] === srv.token, "[yes] X-Workspace is the card's own desk and the session rides along");
    const moved = changed(y1.s0, srv.snap()).filter((k) => !/^job_/.test(k) || k.indexOf("@qc-a") < 0 || true);
    const st1 = srv.jobOf("a_wait").status;
    ok(st1 === "out" || st1 === "shipped", "[yes] the real a_wait card took the desk's Yes (now " + st1 + ")");
    ok(moved.filter((k) => k !== "a_wait@qc-a" && srv.jobOf(k.split("@")[0])).length === 0, "[yes] no other card changed (" + moved.join(",") + ")");
    const after = p.article("a_wait@qc-a");
    ok(st1 === "shipped" ? !after : !!(after && stateOf(after).length === 1 && stateOf(after)[0].textContent === "Running" && tapsOf(after).all.length === 0), "[yes] the Queue reread: the card is Running with no taps, or gone once sent");
  }
  const y2 = await tapYes("b_wait@qc-b");
  if (y2) {
    const c = y2.posts;
    const body = c.length === 1 ? JSON.parse(c[0].body || "{}") : {};
    ok(c.length === 1 && body.action === "ship" && body.id === "b_wait" && c[0].headers["X-Workspace"] === "qc-b" && !c[0].headers["X-Pin"], "[yes] Yes on another desk's card goes to that desk (" + (c[0] && c[0].headers["X-Workspace"]) + ")");
    ok(["out", "shipped"].indexOf(srv.jobOf("b_wait").status) >= 0 && changed(y2.s0, srv.snap()).filter((k) => k !== "b_wait@qc-b" && srv.jobOf(k.split("@")[0])).length === 0, "[yes] only b_wait on qc-b changed");
  }

  // ---------- 7. Stop: the desk's sheet first, then kill with confirm ----------
  async function stopFlow(key, attr, word) {
    const card = p.article(key);
    const t = card ? tapsOf(card) : null;
    const btn = t && (attr === "data-queue-stop" ? t.stop[0] : t.kill[0]);
    if (!btn) { fail("[" + word + "] " + key + " has a " + word); return; }
    const id = key.split("@")[0];
    const s0 = srv.snap();
    let n = p.calls.length;
    p.click(btn);
    await settle();
    ok(p.calls.slice(n).filter((c) => c.method !== "GET" && !/\/api\/desks/.test(c.url)).length === 0 && srv.snap() === s0, "[" + word + "] one tap on " + word + " sends nothing");
    const sheet = p.sheet();
    ok(sheet.classList.contains("on"), "[" + word + "] the desk's Stop? sheet opens");
    const sc = p.sheetCard();
    const h3 = sc.children.find((c) => c.tagName === "H3");
    const btns = []; walk(sc, (el) => { if (el.tagName === "BUTTON") btns.push(el); });
    const go = btns.find((b) => b.textContent === "Stop");
    const keep = btns.find((b) => b.textContent === "Keep the card");
    ok(h3 && h3.textContent === "Stop?" && sc.textContent.indexOf("Card " + id + ". Nothing goes out.") >= 0 && go && keep && btns.length === 2, "[" + word + "] sheet reads Stop? / <title>. Nothing goes out. / Stop / Keep the card");
    if (!go || !keep) return;
    p.clickOwn(keep);
    await settle();
    ok(!sheet.classList.contains("on") && srv.snap() === s0 && p.calls.slice(n).filter((c) => c.method !== "GET" && !/\/api\/desks/.test(c.url)).length === 0, "[" + word + "] Keep the card closes the sheet and sends nothing");
    p.click(btn);
    await settle();
    const sc2 = p.sheetCard();
    const btns2 = []; walk(sc2, (el) => { if (el.tagName === "BUTTON") btns2.push(el); });
    const go2 = btns2.find((b) => b.textContent === "Stop");
    n = p.calls.length;
    if (go2) p.clickOwn(go2);
    await settle();
    const posts = p.calls.slice(n).filter((c) => c.method !== "GET" && !/\/api\/desks/.test(c.url));
    const body = posts.length === 1 ? JSON.parse(posts[0].body || "{}") : {};
    ok(posts.length === 1 && posts[0].url === "/api/jobs" && body.action === "kill" && body.id === id && body.confirm === true && body.whoTapped === "Ann" && Object.keys(body).sort().join(",") === "action,confirm,id,whoTapped", "[" + word + "] the second tap sends the desk's kill: this card id, confirm true (" + JSON.stringify(body) + ")");
    ok(posts.length === 1 && posts[0].headers["X-Workspace"] === key.split("@")[1], "[" + word + "] X-Workspace is the card's own desk");
    ok(srv.jobOf(id).status === "killed" && changed(s0, srv.snap()).filter((k) => k !== key && srv.jobOf(k.split("@")[0])).length === 0, "[" + word + "] only " + key + " stopped (" + srv.jobOf(id).status + ")");
    ok(!sheet.classList.contains("on"), "[" + word + "] the sheet closes");
  }
  await stopFlow("a_held@qc-a", "data-queue-stop", "Stop");
  await stopFlow("a_kill_me@qc-a", "data-queue-kill", "Kill");
  ok(HTML.length === 0, "[text] no HTML sinks during taps (" + HTML.slice(0, 2).join("; ") + ")");

  // ---------- 7b. what the server refuses, and what the Queue shows then ----------
  const hdrA = (ws) => ({ "X-Session": srv.token, "X-Workspace": ws, "Content-Type": "application/json" });
  const wrongDesk = await srv.answer({ url: "/api/jobs", method: "POST", headers: hdrA("qc-b"), body: JSON.stringify({ action: "ship", id: "a_need", amount: 0, confirm: false, whoTapped: "Ann" }) });
  ok(wrongDesk.status === 404 && srv.jobOf("a_need").status === "waiting", "[server] a card sent with another desk's x-workspace gets 404 and does not move (" + wrongDesk.status + ")");
  const noSeat = await srv.answer({ url: "/api/jobs", method: "POST", headers: hdrA("qc-c"), body: JSON.stringify({ action: "kill", id: "c_wait", confirm: true, whoTapped: "Ann" }) });
  ok(noSeat.status >= 400 && srv.jobOf("c_wait").status === "waiting", "[server] a desk with no seat refuses (" + noSeat.status + ") and its card does not move");
  srv.jobOf("b_wait").status = "waiting";
  const helperKill = await srv.answer({ url: "/api/jobs", method: "POST", headers: hdrA("qc-b"), body: JSON.stringify({ action: "kill", id: "b_wait", confirm: true, whoTapped: "Ann" }) });
  ok(helperKill.status === 403 && srv.jobOf("b_wait").status === "waiting", "[server] a helper's Kill gets 403 (" + helperKill.status + ")");
  const noConfirm = await srv.answer({ url: "/api/jobs", method: "POST", headers: hdrA("qc-a"), body: JSON.stringify({ action: "kill", id: "a_need", whoTapped: "Ann" }) });
  ok(noConfirm.status === 409 && srv.jobOf("a_need").status === "waiting", "[server] kill without confirm gets 409 (" + noConfirm.status + ")");
  const strangerAll = await srv.answer({ url: "/api/jobs?desks=all", method: "GET", headers: {}, body: "" });
  ok(strangerAll.status === 403 && !(strangerAll.body && strangerAll.body.jobs), "[server] a stranger reading desks=all gets 403 and no cards");
  // The Queue on a refusal: nothing moves, no reread, and the card says nothing changed.
  const forged = { id: "f1", title: "Forged", status: "waiting", decide: true, slug: "north", desk: "north", needs: [{ id: "yes" }, { id: "stop" }, { id: "kill" }] };
  for (const [name, code, attr, want] of [["helper Kill 403", 403, "data-queue-kill", "Nothing changed."], ["other desk 404 on Yes", 404, "data-queue-yes", "Nothing changed."], ["no seat 404 on Stop", 404, "data-queue-stop", "Nothing changed."], ["409 on Kill", 409, "data-queue-kill", "Nothing changed."], ["no answer on Yes", "network", "data-queue-yes", "Could not reach AIA. Nothing changed."]]) {
    const posts = [];
    const r = startPage(src, { token: "sess-x", home: "north", answer: (c) => {
      if (/\/api\/desks/.test(c.url)) return { status: 200, body: { ok: true, desks: [{ slug: "north", name: "North", yours: "own" }] } };
      if (c.method === "POST") { posts.push(c); return code === "network" ? "network" : { status: code, body: { ok: false, error: "refused" } }; }
      if (/desks=all/.test(c.url)) return { status: 200, body: { ok: true, jobs: [forged] } };
      return { status: 200, body: { jobs: [forged] } };
    } });
    await settle();
    const card = r.article("f1@north");
    const t = card ? tapsOf(card) : null;
    const btn = t && (attr === "data-queue-yes" ? t.yes[0] : attr === "data-queue-stop" ? t.stop[0] : t.kill[0]);
    if (!btn) { fail("[refused] " + name + ": the forged card has the tap"); continue; }
    const n0 = r.calls.length;
    r.click(btn); await settle();
    if (attr !== "data-queue-yes") {
      ok(posts.length === 0, "[refused] " + name + ": the first tap only asks and sends nothing");
      const b2 = []; walk(r.sheetCard(), (el) => { if (el.tagName === "BUTTON" && el.textContent === "Stop") b2.push(el); });
      if (b2[0]) r.clickOwn(b2[0]);
      await settle();
    }
    const after = r.calls.slice(n0);
    const card2 = r.article("f1@north");
    const notes = []; walk(card2, (el) => { if (el.getAttribute && el.getAttribute("data-queue-tap-note") !== null) notes.push(el); });
    ok(posts.length === 1 && (attr === "data-queue-yes" || JSON.parse(posts[0].body).confirm === true), "[refused] " + name + ": one POST (the second tap for Stop/Kill)");
    ok(!after.some((c) => c.method === "GET"), "[refused] " + name + ": no reread after a refusal");
    ok(card2 && notes.length === 1 && notes[0].textContent === want && stateOf(card2)[0] && stateOf(card2)[0].textContent === "Needs you", "[refused] " + name + ": the card stays and says " + JSON.stringify(want) + " (" + (notes[0] ? notes[0].textContent : "no note") + ")");
  }

  // ---------- 8. live update gains and loses taps ----------
  srv.jobOf("a_info").waitingOn = "";
  srv.jobOf("b_wait").status = "shipped";
  p.fireIdle(); await settle();
  const info = p.article("a_info@qc-a");
  ok(info && stateOf(info).length === 1 && stateOf(info)[0].textContent === "Needs you" && tapsOf(info).yes.length === 1 && tapsOf(info).kill.length === 1, "[live] a card that turns Needs you gains its label and taps on the next refresh");
  ok(info && countText(info, "Needs you") === 1 && statusNodes(info).length === 0, "[live] that card drops the old status line and shows \"Needs you\" once (" + (info ? countText(info, "Needs you") + " / " + statusNodes(info).map((n) => n.textContent).join("|") : "") + ")");
  srv.jobOf("a_info").status = "out"; srv.jobOf("a_info").awaiting = "writeback";
  p.fireIdle(); await settle();
  const info2 = p.article("a_info@qc-a");
  ok(info2 && stateOf(info2).length === 1 && stateOf(info2)[0].textContent === "Running" && tapsOf(info2).all.length === 0, "[live] a card that goes Running loses its taps");
  ok(info2 && countText(info2, "Needs you") === 0 && statusNodes(info2).length === 1 && statusNodes(info2)[0].textContent === "Open", "[live] a card that leaves Needs you gets its status line back (" + (info2 ? statusNodes(info2).map((n) => n.textContent).join("|") : "") + ")");

  // ---------- 9. nothing for a stranger, 401/403, empty or failed reads ----------
  const deskCard = { id: "x1", title: "X", status: "waiting", decide: true, slug: "north", desk: "north", needs: [{ id: "yes" }, { id: "stop" }, { id: "kill" }] };
  const routes = (all, per, mine) => (c) => {
    if (/\/api\/desks/.test(c.url)) return mine || { status: 200, body: { ok: true, desks: [{ slug: "north", name: "North" }] } };
    if (/desks=all/.test(c.url)) return all;
    return per;
  };
  const cases = [
    ["stranger (signed out)", { signedOut: true, answer: routes({ status: 200, body: { ok: true, jobs: [deskCard] } }, { status: 200, body: { jobs: [deskCard] } }) }],
    ["401 on every read", { answer: routes({ status: 401, body: { ok: false } }, { status: 401, body: { ok: false } }, { status: 401, body: { ok: false } }) }],
    ["403 on every read", { answer: routes({ status: 403, body: { ok: false, error: "No desk with that name." } }, { status: 403, body: { ok: false } }) }],
    ["403 with cards in the body", { answer: routes({ status: 403, body: { ok: false, jobs: [deskCard] } }, { status: 403, body: { ok: false, jobs: [deskCard] } }) }],
    ["empty read", { answer: routes({ status: 200, body: { ok: true, jobs: [] } }, { status: 200, body: { jobs: [] } }) }],
    ["network failure", { answer: routes("network", "network") }],
    ["500", { answer: routes({ status: 500, body: {} }, { status: 500, body: {} }) }]
  ];
  for (const [name, o] of cases) {
    const q = startPage(src, Object.assign({ token: "sess-x", home: "north" }, o));
    await settle();
    ok(q.articles().length === 0 && q.taps().length === 0, "[none] " + name + ": no cards and no Yes/Stop/Kill");
    ok(!q.calls.some((c) => c.method !== "GET" && !/\/api\/desks/.test(c.url)) && !q.writes.length, "[none] " + name + ": no write");
  }
  // A card with no id, or no desk, gets no taps.
  const q2 = startPage(src, { token: "sess-x", home: "north", answer: routes({ status: 200, body: { ok: true, jobs: [Object.assign({}, deskCard, { id: "" })] } }, { status: 200, body: { jobs: [] } }) });
  await settle();
  ok(q2.taps().length === 0, "[none] a card with no id gets no taps");
  // A desk-code (PIN) session gets nothing from the all-desks read.
  const pinAll = await srv.answer({ url: "/api/jobs?desks=all", method: "GET", headers: { "X-Session": srv.pinTok, "X-Workspace": "qc-a", "X-Pin": "1111" }, body: "" });
  ok(!NETWORK.length, "[net] the server side made no network call (" + NETWORK.join(", ") + ")");
  ok(pinAll.status === 403 && !(pinAll.body && pinAll.body.jobs), "[none] a desk-code session gets 403 and no cards from GET /api/jobs?desks=all");
}

// ---------- mutants ----------
const MUTANTS = [
  ["wrong mapping: held is not Needs you", "queue-login.js", '(st === "waiting" || st === "held") && j.decide === true', '(st === "waiting") && j.decide === true'],
  ["map ignores decide", "queue-login.js", '(st === "waiting" || st === "held") && j.decide === true', '(st === "waiting" || st === "held")'],
  ["map takes a truthy decide", "queue-login.js", '(st === "waiting" || st === "held") && j.decide === true', '(st === "waiting" || st === "held") && !!j.decide'],
  ["swap states: Needs you and Drafted", "queue-login.js", 'j.decide === true) return STATE_NEEDS;', 'j.decide === true) return STATE_DRAFTED;'],
  ["confirm:true sent on the first Stop/Kill tap", "queue-login.js", '    var s = stopSheet();\n    if (!s) return;\n    var h = document.createElement("h3");', '    var s = stopSheet();\n    if (!s) return;\n    postJob(desk, { action: "kill", id: id, confirm: true, whoTapped: tapName("owner") });\n    var h = document.createElement("h3");'],
  ["desk-wide Kill shown", "queue-login.js", 'pause.textContent = "Pause";', 'pause.textContent = "Kill";'],
  ["Pause link missing", "queue-login.js", '      if (d.own === true) {', '      if (false) {'],
  ["Pause for a helper desk", "queue-login.js", '      if (d.own === true) {', '      if (true) {'],
  ["Pause for a closed seat", "queue-login.js", ' && row.status !== "denied" && row.status !== "pending" });', ' });'],
  ["Pause posts from the Queue", "queue-login.js", '        pause.textContent = "Pause";', '        pause.textContent = "Pause";\n        pause.addEventListener("click", function () { postJob(d.slug, { action: "pause", target: "desk", desk: d.slug }); });'],
  ["refused tap still rereads", "queue-login.js", '    if (!tapOk(out)) { tapRefused(id, desk, out && out.status); return; }\n    await refreshCards();\n  }\n  // Stop and Kill', '    if (!tapOk(out)) { tapRefused(id, desk, out && out.status); }\n    await refreshCards();\n  }\n  // Stop and Kill'],
  ["old Needs you status line restored", "queue-login.js", '    return text === queueState(j) ? "" : text;', '    return text;'],
  ["label removed instead of the old line", "queue-login.js", '    var label = queueState(j);\n    if (!label) return null;', '    var label = queueState(j);\n    if (!label || label === STATE_NEEDS) return null;'],
  ["label doubled", "queue-login.js", '    if (state) card.appendChild(state);', '    if (state) { card.appendChild(state); card.appendChild(buildState(j)); }'],
  ["live update keeps the old line", "queue-login.js", '    if (statusEl && !wantStatus) { el.removeChild(statusEl); statusEl = null; }', '    if (false) { el.removeChild(statusEl); statusEl = null; }'],
  ["old line always built on a fresh card", "queue-login.js", '    if (meta.textContent) card.appendChild(meta);', '    meta.textContent = plainStatus(j.status); card.appendChild(meta);'],
  ["refused tap says nothing", "queue-login.js", '    note.textContent = status ? NOTHING_CHANGED : NO_REACH;', '    note.textContent = "";'],
  ["invented state: killed says Stopped", "queue-login.js", '    if (!open) return "";\n    if (j.awaiting', '    if (st === "killed") return "Stopped";\n    if (!open) return "";\n    if (j.awaiting'],
  ["guess on unknown: no match says Drafted", "queue-login.js", '    if (typeof j.draft === "string" && j.draft.trim()) return STATE_DRAFTED;\n    return "";', '    if (typeof j.draft === "string" && j.draft.trim()) return STATE_DRAFTED;\n    return STATE_DRAFTED;'],
  ["swap states: shipped says Running", "queue-login.js", 'if (st === "shipped") return STATE_DONE;', 'if (st === "shipped") return STATE_RUNNING;'],
  ["swap states: out says Done", "queue-login.js", 'if (st === "out") return STATE_RUNNING;', 'if (st === "out") return STATE_DONE;'],
  ["no state fields shows Done", "queue-login.js", '    if (!open) return "";\n    if (j.awaiting', '    if (!open) return st ? "" : STATE_DONE;\n    if (j.awaiting'],
  ["writeback without a status shows Running", "queue-login.js", '    if (st === "out") return STATE_RUNNING;\n    if (!open) return "";', '    if (st === "out" || j.awaiting === "writeback") return STATE_RUNNING;\n    if (!open) return "";'],
  ["Yes hits the wrong endpoint (done)", "queue-login.js", '{ action: "ship", id: id, amount', '{ action: "done", id: id, amount'],
  ["Yes confirms on one tap", "queue-login.js", 'confirm: false, whoTapped: tapName("desk")', 'confirm: true, whoTapped: tapName("desk")'],
  ["Yes points at the wrong card", "queue-login.js", '{ action: "ship", id: id, amount', '{ action: "ship", id: safeCardId(cards[0] && cards[0].id), amount'],
  ["Yes points at the home desk", "queue-login.js", 'await postJob(desk, { action: "ship"', 'await postJob(slugify(localStorage.getItem("aia_ws") || ""), { action: "ship"'],
  ["taps drop the card desk header", "queue-login.js", 'headers: headersFor(desk), body: JSON.stringify(body)', 'headers: headersFor(""), body: JSON.stringify(body)'],
  ["Stop fires kill on one tap", "queue-login.js", 'if (stopBtn) { queueStopAsk(stopBtn, "data-queue-stop"); return; }', 'if (stopBtn) { queueStopConfirm(safeCardId(stopBtn.getAttribute("data-queue-stop")), stopBtn.getAttribute("data-queue-on")); return; }'],
  ["Kill fires on one tap", "queue-login.js", 'if (killBtn) { queueStopAsk(killBtn, "data-queue-kill"); return; }', 'if (killBtn) { queueStopConfirm(safeCardId(killBtn.getAttribute("data-queue-kill")), killBtn.getAttribute("data-queue-on")); return; }'],
  ["Stop sends kill without confirm", "queue-login.js", 'confirm: true, whoTapped: tapName("owner")', 'confirm: false, whoTapped: tapName("owner")'],
  ["Stop stops the wrong card", "queue-login.js", '{ action: "kill", id: id, confirm', '{ action: "kill", id: safeCardId(cards[0] && cards[0].id), confirm'],
  ["Stop button turned into Kill", "queue-login.js", '"data-queue-stop", id, desk, "Stop"', '"data-queue-stop", id, desk, "Kill"'],
  ["Kill missing for a desk", "queue-login.js", 'if (c.kill) row.appendChild(', 'if (false) row.appendChild('],
  ["helper seat gets Stop", "queue-login.js", 'stop: on && sheet && needHas(j, "stop")', 'stop: on && sheet'],
  ["taps without the Needs you gate", "queue-login.js", ' && queueState(j) === STATE_NEEDS;', ';'],
  ["state label via innerHTML", "queue-login.js", '    p.setAttribute("data-queue-state", label);\n    p.textContent = label;', '    p.setAttribute("data-queue-state", label);\n    p.innerHTML = label;'],
  ["state label via a computed innerHTML key (runtime trap)", "queue-login.js", '    p.setAttribute("data-queue-state", label);\n    p.textContent = label;', '    p.setAttribute("data-queue-state", label);\n    p["inner" + "HTML"] = label;'],
  ["Stop sheet via innerHTML", "queue-login.js", 'h.textContent = "Stop?";', 'h.innerHTML = "Stop?";'],
  ["load writes localStorage", "queue-login.js", '  async function boot() {\n    mount();', '  async function boot() {\n    mount();\n    try { localStorage.setItem("aia_queue_seen", "1"); } catch (e) {}'],
  ["load sends a job POST", "queue-login.js", '  async function boot() {\n    mount();', '  async function boot() {\n    mount();\n    fetch("/api/jobs", { method: "POST", headers: headersFor(""), body: JSON.stringify({ action: "say", id: "a_wait", text: "seen" }) });'],
  ["allowlist edit: POST allowed", "scripts/check-queue-live-sync.js", '  if (u.indexOf("/api/jobs?workspace=") >= 0) return method === "GET";', '  if (u.indexOf("/api/jobs?workspace=") >= 0) return method === "GET";\n  if (method === "POST") return true;'],
  ["allowlist edit: whitespace only", "scripts/check-queue-live-sync.js", 'function liveCallFaults(calls) {', 'function liveCallFaults(calls)  {'],
  ["npm hook removed", "scripts/check-queue-login.js", 'spawnSync(process.execPath, [path.join(root, "scripts/check-queue-control.js")]', 'spawnSync(process.execPath, [path.join(root, "scripts/check-queue-ux.js")]']
];

function runMutants() {
  const { spawnSync } = require("child_process");
  const skip = new Set([".git", "node_modules"]);
  const copy = (src, dst) => {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const s = path.join(src, e.name), d = path.join(dst, e.name);
      if (e.isDirectory()) copy(s, d);
      else if (e.isFile()) fs.copyFileSync(s, d);
    }
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aia-qc-mut-"));
  copy(root, dir);
  if (fs.existsSync(path.join(root, "node_modules"))) { try { fs.symlinkSync(fs.realpathSync(path.join(root, "node_modules")), path.join(dir, "node_modules")); } catch (e) {} }
  const run = () => {
    const h = fs.mkdtempSync(path.join(os.tmpdir(), "aia-qc-home-"));
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/check-queue-control.js")], { cwd: dir, env: { PATH: process.env.PATH || "", HOME: h, TMPDIR: h }, encoding: "utf8", timeout: 120000 });
    fs.rmSync(h, { recursive: true, force: true });
    return r;
  };
  let caught = 0, total = 0, bad = 0;
  const control = run();
  console.log("control | " + (control.status === 0 ? "PASS" : "FAIL " + ((control.stderr || "").split("\n")[0] || "")));
  if (control.status !== 0) bad += 1;
  for (const [name, file, find, repl] of MUTANTS) {
    const p = path.join(dir, file);
    const orig = fs.readFileSync(p, "utf8");
    if (orig.indexOf(find) < 0) { console.log(name + " | ANCHOR GONE"); bad += 1; continue; }
    if (orig.indexOf(find) !== orig.lastIndexOf(find)) { console.log(name + " | ANCHOR NOT UNIQUE"); bad += 1; continue; }
    fs.writeFileSync(p, orig.replace(find, repl));
    const r = run();
    fs.writeFileSync(p, orig);
    const first = ((r.stdout || "") + "\n" + (r.stderr || "")).split("\n").find((l) => l.indexOf("FAIL") === 0) || "";
    total += 1;
    if (r.status) { caught += 1; console.log(name + " | CAUGHT | " + first.slice(0, 200)); }
    else console.log(name + " | SURVIVED");
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("SCORE " + caught + "/" + total + " caught" + (bad ? " (" + bad + " bad)" : ""));
  process.exit(caught === total && !bad ? 0 : 1);
}

if (MUTANTS_MODE) runMutants();
else {
  const src = fs.readFileSync(path.join(root, "queue-login.js"), "utf8");
  const live = fs.readFileSync(path.join(root, "scripts/check-queue-live-sync.js"), "utf8");
  const login = fs.readFileSync(path.join(root, "scripts/check-queue-login.js"), "utf8");
  suite(src, live, login).then(() => {
    if (process.env.AIA_STORE_PATH) { try { fs.rmSync(process.env.AIA_STORE_PATH, { force: true }); } catch (e) {} }
    if (failed) { console.error("check-queue-control: " + failed + " failed, " + passed + " ok"); process.exit(1); }
    console.log("check-queue-control: " + passed + " ok");
    process.exit(0);
  }).catch((e) => { console.error("FAIL crash " + (e && e.stack || e)); process.exit(1); });
}
