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
  return el;
}
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
    click(el) { const list = box(); (list.listeners.click || []).forEach((fn) => fn({ target: el })); },
    pick(slug) {
      const nav = document.getElementById("queue-desk-picker");
      let b = null; walk(nav, (el) => { if (!b && el.getAttribute && el.getAttribute("data-queue-desk") === slug) b = el; });
      if (b) (nav.listeners.click || []).forEach((fn) => fn({ target: b }));
      return !!b;
    },
    fireTimers() { timers.splice(0).forEach((t) => t.fn()); }
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
    p.click(btn); await settle();
    if (p.calls.length <= before) b("Try again must run the load again");
    if (!/North Shop card/.test(p.text())) b("after Try again the loaded card must show (" + p.text().trim().slice(0, 80) + ")");
    if (LOAD_FAILED.test(p.text()) || p.retry()) b("after a good Try again the error must be gone");
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
  ok(/node scripts\/check-ux-errors\.js$/.test(line.trim()), "npm test ends with check-ux-errors.js");
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
