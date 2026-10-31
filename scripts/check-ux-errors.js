#!/usr/bin/env node
require("./_env-guard");
// U1: an error must never look empty. On the Queue (queue-login.js) a 500, a network error,
// or a read that hangs past the wait shows "Couldn't load your Queue. Try again." with a
// Try again button, never "Nothing waiting". "Nothing waiting" shows only after a real 200 with
// zero open cards. Try again runs the load again. An old load never paints over a newer one.
// queue-login.js runs as-is in a tiny DOM with a stubbed fetch and stubbed timers.
// Every file is read up front; a missing or unreadable file is a FAIL (fail closed).
// Each rule runs on the real file, then against mutants that each must be caught.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
let failed = 0;
let passed = 0;
function fail(msg) { failed += 1; console.error("FAIL " + msg); }
function ok(cond, msg) { if (cond) { passed += 1; console.log("ok  " + msg); } else fail(msg); }
function readOrNull(rel) { try { const t = fs.readFileSync(path.join(root, rel), "utf8"); return typeof t === "string" ? t : null; } catch (e) { return null; } }

const FILES = ["queue-login.js", "package.json", "desk.html"];
const SRC = {};
FILES.forEach((f) => { SRC[f] = readOrNull(f); });

const NORTH = { slug: "north", name: "North Shop" };
const SOUTH = { slug: "south", name: "South Shop" };
const WAIT_MIN = 8000;
const WAIT_MAX = 12000;

// ---------- tiny DOM ----------
function makeEl(tag) {
  const el = { tagName: String(tag || "div").toUpperCase(), className: "", hidden: false, value: "", type: "", text: "", href: "", attrs: {}, children: [], parentNode: null, style: {}, listeners: {} };
  Object.defineProperty(el, "id", { get: () => el.attrs.id || "", set: (v) => { el.attrs.id = String(v); } });
  el.classList = {
    toggle(name, on) {
      const parts = String(el.className || "").split(/\s+/).filter(Boolean).filter((p) => p !== name);
      const has = String(el.className || "").split(/\s+/).indexOf(name) >= 0;
      const next = on === undefined ? !has : !!on;
      if (next) parts.push(name);
      el.className = parts.join(" ");
      return next;
    },
    contains(name) { return String(el.className || "").split(/\s+/).indexOf(name) >= 0; }
  };
  el.setAttribute = (k, v) => { el.attrs[k] = String(v); if (k === "class") el.className = String(v); };
  el.getAttribute = (k) => (Object.prototype.hasOwnProperty.call(el.attrs, k) ? el.attrs[k] : null);
  el.appendChild = (c) => { c.parentNode = el; el.children.push(c); return c; };
  el.insertBefore = (c, ref) => { c.parentNode = el; const i = ref ? el.children.indexOf(ref) : -1; if (i < 0) el.children.push(c); else el.children.splice(i, 0, c); return c; };
  el.replaceChildren = (...nodes) => { el.children.splice(0, el.children.length); nodes.forEach((n) => el.appendChild(n)); };
  Object.defineProperty(el, "nextSibling", { get: () => { if (!el.parentNode) return null; const i = el.parentNode.children.indexOf(el); return i >= 0 ? el.parentNode.children[i + 1] || null : null; } });
  Object.defineProperty(el, "textContent", {
    get: () => (el.children.length ? el.children.map((c) => c.textContent || "").join(" ") : el.text),
    set: (v) => { el.text = v == null ? "" : String(v); el.children.splice(0, el.children.length); }
  });
  el.closest = (sel) => {
    const m = String(sel).match(/^\[([a-z-]+)\]$/);
    for (let n = el; n; n = n.parentNode) { if (m && n.getAttribute && n.getAttribute(m[1]) !== null) return n; }
    return null;
  };
  el.addEventListener = (ev, fn) => { (el.listeners[ev] = el.listeners[ev] || []).push(fn); };
  el.focus = () => { FOCUS.at = el; };
  el.querySelector = (sel) => {
    const m = String(sel).match(/^\[([a-z-]+)\]$/);
    let f = null;
    if (m) walk(el, (n) => { if (!f && n !== el && n.getAttribute(m[1]) !== null) f = n; });
    return f;
  };
  return el;
}
const FOCUS = { at: null }; // the element that last got focus in the current fake page
function walk(el, fn) { if (!el || !el.tagName) return; fn(el); (el.children || []).forEach((c) => walk(c, fn)); }
function makeDocument() {
  const documentElement = makeEl("html"), head = makeEl("head"), body = makeEl("body"), main = makeEl("main"), h1 = makeEl("h1");
  h1.className = "page-title"; h1.textContent = "Queue";
  const banner = makeEl("div"); banner.id = "banner";
  const queue = makeEl("div"); queue.id = "queue";
  main.appendChild(h1); main.appendChild(banner); main.appendChild(queue);
  body.appendChild(main); documentElement.appendChild(head); documentElement.appendChild(body);
  const listeners = {};
  return {
    documentElement, head, body, readyState: "loading", listeners, createElement: makeEl,
    addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    getElementById(id) { let f = null; walk(documentElement, (el) => { if (!f && el.id === id) f = el; }); return f; },
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
}
function memStore(seed) {
  const m = Object.assign({}, seed || {});
  return { getItem: (k) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
}
const tick = () => new Promise((r) => setImmediate(r));
async function settle(n) { for (let i = 0; i < (n || 30); i++) await tick(); }

// spec.routes: { mine, all, north, south } -> { status, body } | "network" | "hang" | function returning one of those
function startPage(src, spec) {
  FOCUS.at = null;
  const calls = [];
  const timers = [];
  const document = makeDocument();
  const local = memStore({ aia_session: "sess-test", aia_ws: "north" });
  const location = { href: "http://127.0.0.1/desk.html", pathname: "/desk.html", search: "", hash: "" };
  function MutationObserver() {}
  MutationObserver.prototype.observe = function () {};
  function answer(key, init) {
    let res = spec.routes[key];
    if (typeof res === "function") res = res();
    calls.push(key);
    const signal = init && init.signal;
    return new Promise((resolve, reject) => {
      const abortErr = () => { const e = new Error("The operation was aborted."); e.name = "AbortError"; reject(e); };
      if (signal && signal.aborted) return abortErr();
      if (signal && signal.addEventListener) signal.addEventListener("abort", abortErr);
      const go = (r) => {
        if (r === "hang") return;
        if (r === "network") return reject(new TypeError("Failed to fetch"));
        resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, json: () => Promise.resolve(r.body) });
      };
      if (res && typeof res.then === "function") res.then(go); else go(res || { status: 404, body: {} });
    });
  }
  const sandbox = {
    URL, URLSearchParams, JSON, Object, Array, String, Number, Promise, Error, TypeError, Math, Date, encodeURIComponent, decodeURIComponent, console,
    AbortController,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
    document, location, history: { pushState() {} }, localStorage: local, sessionStorage: memStore({}), MutationObserver,
    fetch(url, init) {
      const u = String(url);
      if (u.indexOf("/api/desks") >= 0) return answer("mine", init);
      if (u.indexOf("/api/jobs?desks=all") >= 0) return answer("all", init);
      const wm = u.match(/\/api\/jobs\?workspace=([^&]+)/);
      if (wm) return answer(decodeURIComponent(wm[1]), init);
      return answer("other", init);
    },
    addEventListener() {},
    AIADesks: { slugify: (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40), add() {}, list: () => spec.phone || [], open() {} }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "queue-login.js", timeout: 2000 });
  (document.listeners.DOMContentLoaded || []).forEach((fn) => { Promise.resolve().then(fn).catch(() => {}); });
  const box = () => document.getElementById("queue-all-cards");
  return {
    calls, timers,
    text: () => (box() ? box().textContent : ""),
    retry: () => { let b = null; walk(box(), (el) => { if (!b && el.tagName === "BUTTON" && el.getAttribute("data-queue-retry") !== null) b = el; }); return b; },
    // Like a browser: a disabled button fires no click.
    click(el) { if (el && (el.disabled || el.getAttribute("disabled") !== null)) return; const list = box(); (list.listeners.click || []).forEach((fn) => fn({ target: el })); },
    pick(slug) {
      const nav = document.getElementById("queue-desk-picker");
      let b = null; walk(nav, (el) => { if (!b && el.getAttribute && el.getAttribute("data-queue-desk") === slug) b = el; });
      if (b) (nav.listeners.click || []).forEach((fn) => fn({ target: b }));
      return !!b;
    },
    fireTimers() { timers.splice(0).forEach((t) => t.fn()); },
    focused: () => FOCUS.at,
    pickerDesks() { const out = []; walk(document.getElementById("queue-desk-buttons"), (el) => { if (el.tagName === "BUTTON" && el.getAttribute("data-queue-desk")) out.push(el.getAttribute("data-queue-desk") + "=" + el.textContent); }); return out; },
    labels() { const out = []; walk(box(), (el) => { if (el.classList.contains("queue-desk-label")) out.push(el.textContent); }); return out; },
    heading: () => document.querySelector("main h1"),
    find(attr, val) { let f = null; walk(box(), (el) => { if (!f && el.getAttribute(attr) === val) f = el; }); return f; },
    findText(re) { let f = null; walk(box(), (el) => { if (!f && !el.children.length && re.test(el.text)) f = el; }); return f; }
  };
}
const ok200 = (jobs) => ({ status: 200, body: { ok: true, jobs } });
const job = (d) => ({ id: "job-" + d.slug, title: d.name + " card", status: "waiting", slug: d.slug, desk: d.slug });
const MINE = { status: 200, body: { ok: true, desks: [NORTH, SOUTH] } };
const LOAD_FAILED = /Couldn't load your Queue\. Try again\./;
const EMPTY = /Nothing waiting/;

function showsError(p, bad, label) {
  const t = p.text();
  if (!LOAD_FAILED.test(t)) bad(label + ": no plain error (" + t.trim().slice(0, 80) + ")");
  if (!p.retry() || !/^Try again$/.test(p.retry().textContent)) bad(label + ": no Try again button");
  if (EMPTY.test(t) || /No desks in this Queue yet/.test(t)) bad(label + ": the error reads as empty (" + t.trim().slice(0, 80) + ")");
  const box = p.find("data-queue-error", "1");
  if (!box || box.getAttribute("role") !== "alert") bad(label + ": the error box must have role=alert so a screen reader says it");
  const again = p.retry();
  if (again && (again.disabled || again.getAttribute("disabled") !== null || again.getAttribute("aria-disabled") === "true")) bad(label + ": Try again must not be disabled");
}

async function suite(S, okFn) {
  const bad = [];
  const b = (m) => bad.push(m);
  FILES.forEach((f) => { if (typeof S[f] !== "string") b(f + " is missing or unreadable (fail closed)"); });
  const src = S["queue-login.js"];
  if (typeof src !== "string") return bad;
  const run = async (label, fn) => {
    const n = bad.length;
    try { await fn(); } catch (e) { b(label + " threw " + ((e && e.message) || e)); }
    if (okFn && bad.length === n) okFn(label);
  };

  await run("500", async () => {
    const p = startPage(src, { routes: { mine: MINE, all: { status: 500, body: { error: "boom" } }, north: { status: 500, body: {} }, south: { status: 500, body: {} } } });
    await settle(); showsError(p, b, "500 on every read");
  });
  await run("network", async () => {
    const p = startPage(src, { routes: { mine: MINE, all: "network", north: "network", south: "network" } });
    await settle(); showsError(p, b, "network error");
  });
  await run("hang", async () => {
    const p = startPage(src, { routes: { mine: MINE, all: "hang", north: "hang", south: "hang" } });
    await settle();
    const t = p.text();
    if (EMPTY.test(t)) b("hang: shows Nothing waiting while the read is still out");
    if (LOAD_FAILED.test(t)) b("hang: shows the error before the wait is over");
    const wait = p.findText(/^Loading your Queue/);
    if (!wait) b("hang: no Loading line while the read is still out");
    else if (wait.getAttribute("role") !== "status") b("hang: the Loading line must have role=status");
    const waits = p.timers.map((x) => x.ms);
    if (!waits.length) b("hang: no timeout is set on the Queue reads");
    if (waits.some((ms) => !(ms >= WAIT_MIN && ms <= WAIT_MAX))) b("hang: the wait must be " + WAIT_MIN + "–" + WAIT_MAX + " ms, got " + waits.join(","));
    p.fireTimers(); await settle();
    p.fireTimers(); await settle();
    showsError(p, b, "hang past the wait");
  });
  await run("mine hang", async () => {
    // A hang on the desk list and the cards shares one deadline: one round of timers ends it.
    const p = startPage(src, { routes: { mine: "hang", all: "hang", north: "hang" } });
    await settle(); p.fireTimers(); await settle();
    showsError(p, b, "desk list and cards hang");
  });
  await run("first load keeps focus", async () => {
    // A normal first load (and a desk pick) must not move focus: only Try again does.
    const p = startPage(src, { routes: { mine: MINE, all: ok200([job(NORTH), job(SOUTH)]), north: ok200([job(NORTH)]), south: ok200([job(SOUTH)]) } });
    await settle();
    if (!/North Shop card/.test(p.text())) b("first load: the cards did not paint (" + p.text().trim().slice(0, 80) + ")");
    if (p.focused()) b("first load: focus moved to " + p.focused().tagName + " (must stay on the page body)");
    if (!p.pick("north")) { b("first load: no North desk button"); return; }
    await settle();
    if (p.focused()) b("desk pick: focus moved to " + p.focused().tagName + " (must stay where the tap left it)");
  });
  await run("first load error keeps focus", async () => {
    const p = startPage(src, { routes: { mine: MINE, all: { status: 500, body: {} }, north: { status: 500, body: {} }, south: { status: 500, body: {} } } });
    await settle();
    if (p.focused()) b("first load error: focus moved to " + p.focused().tagName + " before any Try again");
  });
  await run("empty 200", async () => {
    const p = startPage(src, { routes: { mine: MINE, all: ok200([]) } });
    await settle();
    const t = p.text();
    if (!/Nothing waiting in this Queue\. Drop a card to start\./.test(t)) b("200 with zero cards must show Nothing waiting (" + t.trim().slice(0, 80) + ")");
    if (LOAD_FAILED.test(t) || p.retry()) b("200 with zero cards must not show the error");
  });
  await run("empty 200 per desk", async () => {
    const p = startPage(src, { routes: { mine: MINE, all: ok200([{ id: "x", title: "no slug" }]), north: ok200([]), south: ok200([]) } });
    await settle();
    if (!EMPTY.test(p.text()) || p.retry()) b("per-desk 200s with zero cards must show Nothing waiting and no error");
  });
  await run("no desks 200", async () => {
    const p = startPage(src, { routes: { mine: { status: 200, body: { ok: true, desks: [] } }, all: ok200([]) } });
    await settle();
    if (!/No desks in this Queue yet/.test(p.text()) || p.retry()) b("a real 200 with no desks must show No desks yet, not the error");
  });
  await run("no desks, all-desks network error", async () => {
    // A network error on the all-desks read counts like a 500: with no desk list to fall back on it is the
    // error, never "No desks yet".
    const p = startPage(src, { routes: { mine: { status: 200, body: { ok: true, desks: [] } }, all: "network" } });
    await settle(); showsError(p, b, "no desks, all-desks network error");
  });
  await run("desk list 500", async () => {
    const p = startPage(src, { routes: { mine: { status: 500, body: {} }, all: { status: 500, body: {} } } });
    await settle(); showsError(p, b, "desk list and cards 500");
  });
  await run("retry", async () => {
    const state = { all: { status: 500, body: {} }, north: { status: 500, body: {} }, south: { status: 500, body: {} } };
    const p = startPage(src, { routes: { mine: MINE, all: () => state.all, north: () => state.north, south: () => state.south } });
    await settle();
    const btn = p.retry();
    if (!btn) { b("retry: no Try again button"); return; }
    const before = p.calls.length;
    state.all = ok200([job(NORTH)]);
    if (btn.disabled || btn.getAttribute("disabled") !== null) b("retry: Try again is disabled");
    p.click(btn); await settle();
    if (p.calls.length <= before) b("Try again must run the load again (a click fired no new request)");
    if (!/North Shop card/.test(p.text())) b("after Try again the loaded card must show (" + p.text().trim().slice(0, 80) + ")");
    if (LOAD_FAILED.test(p.text()) || p.retry()) b("after a good Try again the error must be gone");
    const f = p.focused();
    if (!f || f !== p.heading()) b("after a good Try again focus must move to the Queue heading (got " + (f ? f.tagName : "nothing / body") + ")");
    else if (f.getAttribute("tabindex") !== "-1") b("the Queue heading needs tabindex=-1 to take focus");
  });
  await run("retry fails again", async () => {
    const p = startPage(src, { routes: { mine: MINE, all: { status: 500, body: {} }, north: { status: 500, body: {} }, south: { status: 500, body: {} } } });
    await settle();
    const btn = p.retry();
    if (!btn) { b("retry fails again: no Try again button"); return; }
    p.click(btn); await settle();
    showsError(p, b, "Try again that fails again");
    if (!p.focused() || p.focused() !== p.retry()) b("after a Try again that fails again, focus must land on the new Try again button");
  });
  await run("retry desk list", async () => {
    const state = { mine: { status: 500, body: {} } };
    const p = startPage(src, { routes: { mine: () => state.mine, all: { status: 500, body: {} }, north: ok200([job(NORTH)]), south: ok200([]) } });
    await settle();
    const btn = p.retry();
    if (!btn) { b("retry desk list: no Try again button"); return; }
    state.mine = MINE;
    p.click(btn); await settle();
    if (p.calls.filter((c) => c === "mine").length < 2) b("Try again must read the desk list again when that read failed");
    if (!/North Shop card/.test(p.text())) b("after Try again the desk list and its cards must show");
  });
  for (const oldFail of [{ status: 500, body: {} }, "network"]) await run("overlap: old read fails first (" + (oldFail === "network" ? "network" : "500") + ")", async () => {
    // Two North loads overlap; the old one fails while the newer one is still out. The failure is the old
    // load's: the newer load answers with cards and no "Couldn't load every desk" note may show.
    let releaseOld, releaseNew;
    const oldRead = new Promise((r) => { releaseOld = r; });
    const newRead = new Promise((r) => { releaseNew = r; });
    let northReads = 0;
    const p = startPage(src, { routes: { mine: MINE, all: ok200([]), north: () => (++northReads === 1 ? oldRead : northReads === 2 ? newRead : ok200([])), south: ok200([]) } });
    await settle();
    if (!p.pick("north")) { b("overlap: no North desk button"); return; }
    await settle();
    if (!p.pick("north")) { b("overlap: no North desk button (second tap)"); return; }
    await settle();
    if (northReads < 2) { b("overlap: the second North tap did not start a new read"); return; }
    releaseOld(oldFail);
    await settle();
    releaseNew(ok200([job(NORTH)]));
    await settle();
    const t = p.text();
    if (!/North Shop card/.test(t)) b("overlap: the newer North load must paint its card (" + t.trim().slice(0, 80) + ")");
    if (/Couldn't load/.test(t) || p.retry()) b("overlap (" + (oldFail === "network" ? "network" : "500") + "): an old failed read flagged the newer load (" + t.trim().slice(0, 80) + ")");
  });
  await run("stale retry keeps focus", async () => {
    // Try again goes out, then the user picks North before it answers. The retry's answer is stale: focus
    // must not move when it lands.
    const state = { all: { status: 500, body: {} } };
    let release;
    const slow = new Promise((r) => { release = r; });
    const p = startPage(src, { routes: { mine: MINE, all: () => state.all, north: ok200([job(NORTH)]), south: { status: 500, body: {} } } });
    await settle();
    const btn = p.retry();
    if (!btn) { b("stale retry: no Try again button"); return; }
    state.all = slow;
    p.click(btn); await settle();
    if (!p.pick("north")) { b("stale retry: no North desk button"); return; }
    await settle();
    release(ok200([job(NORTH)]));
    await settle();
    if (!/North Shop card/.test(p.text())) b("stale retry: the newer North load must stay painted");
    if (p.focused()) b("stale retry: focus moved to " + p.focused().tagName + " after a Try again that went stale");
  });
  for (const listAnswer of ["200", "500"]) await run("stale desk-list retry (" + listAnswer + ")", async () => {
    // The desk list read fails, Try again re-reads it, and the user taps All desks while that read is out.
    // When the list answers, the retry is stale: no second Queue read, no focus move, no error over the
    // newer cards. A fresh desk list (200) is kept: the picker fills and the card says North Shop.
    let release;
    const slow = new Promise((r) => { release = r; });
    const st = { mine: { status: 500, body: {} }, all: { status: 500, body: {} } };
    const p = startPage(src, { routes: { mine: () => st.mine, all: () => st.all, north: ok200([job(NORTH)]), south: ok200([]) } });
    await settle();
    const btn = p.retry();
    if (!btn) { b("stale desk-list retry: no Try again button"); return; }
    st.mine = slow; st.all = ok200([job(NORTH)]);
    const c0 = p.calls.length;
    p.click(btn); await settle();
    if (!p.pick("")) { b("stale desk-list retry: no All desks button"); return; }
    await settle();
    release(listAnswer === "200" ? MINE : { status: 500, body: {} });
    await settle();
    const label = "stale desk-list retry (" + listAnswer + ")";
    const reads = p.calls.slice(c0).join(",");
    if (reads !== "mine,all") b(label + ": reads must be exactly mine,all, got " + reads);
    if (p.focused()) b(label + ": focus moved to " + p.focused().tagName + " after a Try again that went stale");
    const t = p.text();
    if (!/North Shop card/.test(t)) b(label + ": the newer All desks cards must stay painted (" + t.trim().slice(0, 80) + ")");
    if (/Couldn't load/.test(t) || p.retry()) b(label + ": the stale retry's error painted over the newer cards");
    if (listAnswer === "200") {
      const desksNow = p.pickerDesks().join(",");
      if (desksNow !== "north=North Shop,south=South Shop") b(label + ": the fresh desk list was thrown away (picker: " + (desksNow || "empty") + ")");
      const labs = p.labels().join(",");
      if (labs !== "North Shop") b(label + ": the card must say North Shop, got " + (labs || "no label"));
    }
  });
  await run("partial", async () => {
    const p = startPage(src, { routes: { mine: MINE, all: { status: 500, body: {} }, north: ok200([job(NORTH)]), south: { status: 500, body: {} } } });
    await settle();
    const t = p.text();
    if (!/North Shop card/.test(t)) b("partial: the desk that answered must still show its card");
    if (!/Couldn't load every desk/.test(t) || !p.retry()) b("partial: a desk that failed must say so with Try again");
  });
  await run("stale", async () => {
    let release;
    const slow = new Promise((r) => { release = r; });
    // The newer North read answers with a card; the old All desks load, if it went on, would read North again and get none.
    let northReads = 0;
    const p = startPage(src, { routes: { mine: MINE, all: () => slow, north: () => (++northReads === 1 ? ok200([job(NORTH)]) : ok200([])), south: { status: 500, body: {} } } });
    await settle();
    if (!p.pick("north")) { b("stale: no North desk button"); return; }
    await settle();
    release({ status: 500, body: {} });
    await settle();
    const t = p.text();
    if (!/North Shop card/.test(t)) b("stale: the newer North load must stay painted");
    if (/Couldn't load/.test(t)) b("stale: an old failed load painted its error over a newer good one");
  });
  await run("stale all-desks answer", async () => {
    // The old All desks read answers 200 after a newer North load: it must not replace North's card.
    let release;
    const slow = new Promise((r) => { release = r; });
    const p = startPage(src, { routes: { mine: MINE, all: () => slow, north: ok200([job(NORTH)]), south: ok200([]) } });
    await settle();
    if (!p.pick("north")) { b("stale all-desks answer: no North desk button"); return; }
    await settle();
    release(ok200([]));
    await settle();
    if (!/North Shop card/.test(p.text())) b("stale all-desks answer: an old 200 replaced the newer North cards (" + p.text().trim().slice(0, 80) + ")");
  });
  await run("stale desk-code read", async () => {
    // Desk-code path: desks=all fails fast with a 403, so the old load reads desk by desk. Its first read
    // (North) is slow and fails after a newer South load has painted. It must not replace South's card
    // or paint its error over it.
    let release;
    const slow = new Promise((r) => { release = r; });
    let northReads = 0;
    let southReads = 0;
    const p = startPage(src, { routes: {
      mine: MINE,
      all: { status: 403, body: { ok: false, error: "Sign in with your account to see every desk." } },
      north: () => (++northReads === 1 ? slow : ok200([])),
      south: () => (++southReads === 1 ? ok200([job(SOUTH)]) : ok200([]))
    } });
    await settle();
    if (!p.pick("south")) { b("stale desk-code read: no South desk button"); return; }
    await settle();
    if (!/South Shop card/.test(p.text())) { b("stale desk-code read: the newer South load did not paint"); return; }
    release({ status: 500, body: {} });
    await settle();
    const t = p.text();
    if (!/South Shop card/.test(t)) b("stale desk-code read: an old desk read replaced the newer South cards (" + t.trim().slice(0, 80) + ")");
    if (/Couldn't load/.test(t)) b("stale desk-code read: an old desk read painted its error over the newer South cards");
  });
  await run("stale one-desk read", async () => {
    // A slow North read finishes (with an error) after the user moved on to South: South's card stays.
    let release;
    const slow = new Promise((r) => { release = r; });
    let northReads = 0;
    const p = startPage(src, { routes: { mine: MINE, all: ok200([]), north: () => (++northReads === 1 ? slow : ok200([])), south: ok200([job(SOUTH)]) } });
    await settle();
    if (!p.pick("north")) { b("stale one-desk read: no North desk button"); return; }
    await settle();
    if (!p.pick("south")) { b("stale one-desk read: no South desk button"); return; }
    await settle();
    release({ status: 500, body: {} });
    await settle();
    const t = p.text();
    if (!/South Shop card/.test(t) || /Couldn't load/.test(t)) b("stale one-desk read: an old North read painted over the newer South cards (" + t.trim().slice(0, 80) + ")");
  });
  return bad;
}

const MUTANTS = [
  ["error branch removed", [["    if (!open.length && loadError) { errorState(box, LOAD_FAILED); return; }\n", ""]]],
  ["500 on a desk read not counted", [["if (!r.ok || !data || !Array.isArray(data.jobs)) { if (mine) mine.failed = true; return []; }", "if (!r.ok || !data || !Array.isArray(data.jobs)) { return []; }"]]],
  ["network error on a desk read not counted", [["    } catch (e) {\n      if (mine) mine.failed = true;\n      return [];", "    } catch (e) {\n      return [];"]]],
  ["no timeout", [["return ctl ? ctl.signal : undefined;", "return undefined;"]]],
  ["timeout too long", [["var QUEUE_WAIT_MS = 8000;", "var QUEUE_WAIT_MS = 60000;"]]],
  ["error read as empty", [["    loadError = !!me.failed;\n", "    loadError = false;\n"]]],
  ["every load reads as an error", [["    loadError = !!me.failed;\n", "    loadError = true;\n"]]],
  ["empty while loading", [["    if (!open.length && loading) { loadingState(box); return; }\n", ""]]],
  ["Try again not wired", [["if (again) { retryLoad(); return; }", "if (again) { return; }"]]],
  ["Try again button missing", [["    wrap.appendChild(again);\n", ""]]],
  ["Try again says Refresh", [['again.textContent = "Try again";', 'again.textContent = "Refresh";']]],
  ["error words back to empty", [['var LOAD_FAILED = "Couldn\'t load your Queue. Try again.";', 'var LOAD_FAILED = "Nothing waiting in this Queue. Drop a card to start.";']]],
  ["failed desk list reads as no desks", [["        if (!desks.length && (me.allFailed || mineFailed)) me.failed = true;\n", ""]]],
  ["Try again skips the desk list", [["    if (mineFailed && !desks.length) {\n", "    if (false) {\n"]]],
  ["partial failure hidden", [["    if (loadError) errorState(box, SOME_FAILED);\n", ""]]],
  ["a new deadline after the desk list, so a hang waits twice", [["    var me = load = { failed: false, allFailed: false, signal: firstSignal || waitSignal() };", "    var me = load = { failed: false, allFailed: false, signal: waitSignal() };"]]],
  ["stale-load guard removed", [["if (gen !== loadGen) return;", "/* no guard */"]]],
  ["stale guard after the all-desks read removed", [["      var all = await readAllDesks();\n      if (gen !== loadGen) return;\n", "      var all = await readAllDesks();\n"]]],
  ["stale guard after each desk read removed", [["          var part = await jobsForDesk(desks[i]);\n          if (gen !== loadGen) return;\n", "          var part = await jobsForDesk(desks[i]);\n"]]],
  ["stale guard after the one-desk read removed", [["      next = await jobsForDesk(desk);\n      if (gen !== loadGen) return;\n", "      next = await jobsForDesk(desk);\n"]]],
  ["error box loses role=alert", [['    wrap.setAttribute("role", "alert");\n', ""]]],
  ["Loading line loses role=status", [['    p.setAttribute("role", "status");\n', ""]]],
  ["no focus after Try again", [["    if (await refreshCards()) focusAfterRetry();\n", "    await refreshCards();\n"]]],
  ["heading not focusable", [['target.setAttribute("tabindex", "-1");', "void 0;"]]],
  ["focus on the heading even when Try again fails", [["    if (loadError) {\n      var box", "    if (false) {\n      var box"]]],
  // QA probe 443b at 530828c0.
  ["P2d old load marks the newest load failed", [["if (!r.ok || !data || !Array.isArray(data.jobs)) { if (mine) mine.failed = true; return []; }", "if (!r.ok || !data || !Array.isArray(data.jobs)) { if (load) load.failed = true; return []; }"]]],
  ["P2d network error marks the newest load failed", [["    } catch (e) {\n      if (mine) mine.failed = true;\n      return [];", "    } catch (e) {\n      if (load) load.failed = true;\n      return [];"]]],
  ["P9 Try again disabled", [["again.type = \"button\";\n    again.setAttribute(\"data-queue-retry\", \"1\");", "again.type = \"button\";\n    again.setAttribute(\"data-queue-retry\", \"1\"); again.disabled = true;"]]],
  ["P9b Try again disabled by attribute", [["again.type = \"button\";\n    again.setAttribute(\"data-queue-retry\", \"1\");", "again.type = \"button\";\n    again.setAttribute(\"data-queue-retry\", \"1\"); again.setAttribute(\"disabled\", \"\");"]]],
  ["P8 network error on the all-desks read not counted", [["    } catch (e) {\n      if (mine) mine.allFailed = true;\n      return null;", "    } catch (e) {\n      return null;"]]],
  ["P2e stale guard after the retry desk-list read removed", [["      if (gen !== loadGen) { firstSignal = null; return; }\n", ""]]],
  ["stale retry back to the old order (guard before the desk list)", [["      if (mine) desks = fromMine(mine);\n      if (mine && gen !== loadGen) { paintPicker(); paintCards(visibleCards()); }\n      if (gen !== loadGen) { firstSignal = null; return; }\n", "      if (gen !== loadGen) { firstSignal = null; return; }\n      if (mine) desks = fromMine(mine);\n"]]],
  ["stale retry throws away the fresh desk list", [["      if (mine && gen !== loadGen) { paintPicker(); paintCards(visibleCards()); }\n", ""]]],
  ["stale retry keeps the list but never repaints the picker", [["      if (mine && gen !== loadGen) { paintPicker(); paintCards(visibleCards()); }\n", "      if (mine && gen !== loadGen) { paintCards(visibleCards()); }\n"]]],
  ["stale retry keeps the list but never repaints the cards", [["      if (mine && gen !== loadGen) { paintPicker(); paintCards(visibleCards()); }\n", "      if (mine && gen !== loadGen) { paintPicker(); }\n"]]],
  ["F5 focus moves on every load", [["    paintCards(visibleCards());\n    return true;\n", "    paintCards(visibleCards());\n    focusAfterRetry();\n    return true;\n"]]],
  ["F6 focus even when the retry load went stale", [["    if (await refreshCards()) focusAfterRetry();\n", "    await refreshCards(); focusAfterRetry();\n"]]],
  ["queue-login.js unreadable", null]
];
function mutate(S, reps) {
  if (reps === null) return Object.assign({}, S, { "queue-login.js": null });
  let s = S["queue-login.js"];
  if (typeof s !== "string") return null;
  for (const [find, repl] of reps) { if (s.indexOf(find) < 0) return null; s = s.split(find).join(repl); }
  return Object.assign({}, S, { "queue-login.js": s });
}

function staticChecks() {
  const desk = (() => { try { return fs.statSync(path.join(root, "desk.html")).size; } catch (e) { return -1; } })();
  ok(desk === 35012, "desk.html is 35012 bytes (" + desk + ")");
  let freeze;
  try { freeze = require("./_api-freeze").check(root); } catch (e) { freeze = { ok: false, problems: ["api freeze helper failed: " + ((e && e.message) || e)] }; }
  ok(!!(freeze && freeze.ok === true), "api/ frozen (scripts/_api-freeze.js)" + (freeze && freeze.ok ? "" : ": " + ((freeze && freeze.problems) || []).join("; ")));
  let line = "";
  try { line = JSON.parse(SRC["package.json"] || "").scripts.test || ""; } catch (e) { line = ""; }
  ok(/node scripts\/check-ux-errors\.js && node scripts\/check-aia-tld-mutants\.js && node scripts\/check-api-machine-values\.js && node scripts\/check-api-machine-values-mutants\.js$/.test(line.trim()), "npm test ends with the machine-value checks after the .aia TLD mutant check");
  let legal = null;
  try {
    const base = require("./_api-freeze").BASE;
    legal = execFileSync("git", ["diff", "--name-only", base, "--", "legal.html"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch (e) { legal = null; }
  ok(legal === "", "legal.html is untouched" + (legal === null ? " (git error, failing closed)" : legal ? " (" + legal + ")" : ""));
}

async function main() {
  staticChecks();
  const base = await suite(SRC, (label) => ok(true, "Queue " + label));
  base.forEach((m) => fail(m));
  let caught = 0;
  for (const [name, reps] of MUTANTS) {
    const S = mutate(SRC, reps);
    if (S === null) { fail("mutant does not apply: " + name); continue; }
    let bad;
    try { bad = await suite(S); } catch (e) { bad = ["threw " + e.message]; }
    if (bad.length) { caught += 1; console.log("ok  mutant caught: " + name + " (" + bad[0] + ")"); }
    else fail("mutant NOT caught: " + name);
  }
  console.log("mutants caught " + caught + "/" + MUTANTS.length);
  if (caught !== MUTANTS.length) fail("every mutant must be caught (" + caught + "/" + MUTANTS.length + ")");
  if (failed) { console.error("check-ux-errors: " + passed + " ok, " + failed + " failed"); process.exit(1); }
  console.log("check-ux-errors: " + passed + " ok, 0 failed");
}
main().catch((e) => { console.error("FAIL " + ((e && e.stack) || e)); process.exit(1); });
