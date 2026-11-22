#!/usr/bin/env node
require("./_env-guard");
// /create top line (#aia-line) reads this desk's own /api/status, not public /api/health.
// Public /api/health is always off after #587, so reading it would tell a desk with its own key
// that a Desk AI can't draft. Node only: create-desk.js functions run in a vm with a fake fetch
// that answers like api/health.js deskStatus (on only for the desk that has its own key).
// - a desk with its own key sees "A Desk AI can draft."
// - a stranger, or a desk with no key, sees the can't-draft line
// - a failed, refused, odd, or silent status read never says a Desk AI can draft
// - the desk is passed with Create's own headers() (X-Workspace, X-Session, X-Pin); no new auth
// - the line is painted with textContent only
// Each rule runs on the real file, then against mutants that each must be caught.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
let failed = 0;
let passed = 0;
function fail(msg) { failed += 1; console.error("FAIL " + msg); }
function ok(cond, msg) { if (cond) { passed += 1; console.log("ok  " + msg); } else fail(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const ON_NOTE = "A Desk AI can draft.";
const OFF_NOTE = "A Desk AI can't draft on this phone yet.";
const CAN_DRAFT = /A Desk AI can draft\./;
const KEY_DESK = "owner-key-a";
const NO_KEY_DESK = "owner-key-b";

function grabFn(src, name) {
  let i = src.indexOf("function " + name + "(");
  if (i < 0) return null;
  if (src.slice(i - 6, i) === "async ") i -= 6;
  let depth = 0;
  for (let j = src.indexOf("{", i); j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return null;
}
function line(src, re) { const m = src.match(re); return m ? m[0] : ""; }

// Server face, copied from what api/health.js sends (asserted against the file below).
function statusBody(hdrs) {
  const h = hdrs || {};
  const ws = String(h["X-Workspace"] || "");
  const signedIn = !!(h["X-Session"] || h["X-Pin"]);
  const on = ws === KEY_DESK && signedIn;
  return { ok: true, workspace: ws, automation: { deskAi: { on: on, note: on ? ON_NOTE : OFF_NOTE } } };
}
function healthBody() {
  return { ok: true, automation: { deskAi: { on: false, note: OFF_NOTE }, drafts: { included: false, deskAccounts: 0 } } };
}
function reply(status, body) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status: status, json: () => Promise.resolve(body) });
}
function fakeFetch(mode, calls) {
  return (url, opts) => {
    calls.push({ url: String(url), opts: opts || {} });
    const u = String(url);
    if (mode === "hang") return new Promise(() => {});
    if (mode === "reject") return Promise.reject(new Error("offline"));
    if (mode === "500") return reply(500, { automation: { deskAi: { on: true, note: ON_NOTE } }, error: "boom" });
    if (mode === "badjson") return Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error("bad json")) });
    if (mode === "nodeskai") return reply(200, { ok: true, automation: {} });
    if (mode === "truthy") return reply(200, { ok: true, automation: { deskAi: { on: "yes", note: ON_NOTE } } });
    if (mode === "grokonly") return reply(200, { ok: true, automation: { grok: { on: true }, drafts: { included: true } } });
    if (/^\/api\/status(\?|$)/.test(u)) return reply(200, statusBody((opts && opts.headers) || {}));
    if (/^\/api\/health(\?|$)/.test(u)) return reply(200, healthBody());
    return reply(404, { error: "No such route" });
  };
}
function harness() {
  const timers = [];
  const el = {
    _text: "Checking whether a Desk AI can draft on this phone…",
    htmlWrites: 0,
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._text; },
    set innerHTML(v) { this.htmlWrites += 1; this._text = String(v); },
    classList: { _s: { }, add(c) { this._s[c] = 1; }, remove(c) { delete this._s[c]; }, toggle(c, on) { if (on) this._s[c] = 1; else delete this._s[c]; }, contains(c) { return !!this._s[c]; } }
  };
  return {
    el, timers,
    setTimeout: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].live = false; },
    fire() { timers.filter((t) => t.live).forEach((t) => { t.live = false; t.fn(); }); }
  };
}
const tick = () => new Promise((r) => setImmediate(r));
async function settle() { for (let i = 0; i < 12; i++) await tick(); }
function store(who) {
  const m = {};
  if (who === "key") { m.aia_ws = KEY_DESK; m.aia_session = "sess-key-a"; }
  if (who === "nokey") { m.aia_ws = NO_KEY_DESK; m.aia_session = "sess-key-b"; }
  if (who === "pin") { m.aia_ws = KEY_DESK; m.aia_pin = "4821"; }
  return { getItem: (k) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null) };
}

async function run(src, who, mode) {
  const parts = [
    grabFn(src, "headers"),
    line(src, /const AIA_WAIT_MS = \d+;/),
    line(src, /const AIA_NO_ANSWER = "[^"]*";/),
    grabFn(src, "healthWithin"),
    grabFn(src, "draftsOffNote"),
    grabFn(src, "deskAiFromHealth"),
    grabFn(src, "paintAia")
  ];
  if (parts.some((p) => !p)) throw new Error("create-desk.js is missing headers / healthWithin / draftsOffNote / deskAiFromHealth / paintAia / AIA_* lines");
  const h = harness();
  const calls = [];
  const ctx = {
    document: { getElementById: (id) => (id === "aia-line" ? h.el : null) },
    localStorage: store(who),
    fetch: fakeFetch(mode, calls),
    setTimeout: h.setTimeout, clearTimeout: h.clearTimeout, Promise
  };
  vm.runInNewContext("var grokOn=false;\n" + parts.join("\n") + "\nthis.go = paintAia; this.on = function () { return grokOn; };", ctx, { timeout: 1000 });
  ctx.go();
  await settle();
  if (mode === "hang") { h.fire(); await settle(); }
  return { text: h.el.textContent, off: h.el.classList.contains("off"), grokOn: ctx.on(), html: h.el.htmlWrites, calls: calls, noAnswer: (line(src, /const AIA_NO_ANSWER = "([^"]*)";/).match(/"([^"]*)"/) || [])[1] || "" };
}

async function suite(src, say) {
  const bad = [];
  const good = (c, m) => { if (!c) bad.push(m); else if (say) say(m); };

  // 1. desk with its own key (session, and PIN-only) -> can draft
  for (const who of ["key", "pin"]) {
    const r = await run(src, who, "ok");
    const c = r.calls[0] || { url: "", opts: {} };
    good(r.calls.length === 1 && /^\/api\/status(\?|$)/.test(c.url), "key desk (" + who + "): Create reads /api/status (got " + r.calls.map((x) => x.url).join(",") + ")");
    good(!r.calls.some((x) => /\/api\/health/.test(x.url)), "key desk (" + who + "): Create does not read public /api/health");
    const hd = (c.opts && c.opts.headers) || {};
    good(hd["X-Workspace"] === KEY_DESK, "key desk (" + who + "): status read names the desk with X-Workspace");
    good(who === "key" ? hd["X-Session"] === "sess-key-a" : hd["X-Pin"] === "4821", "key desk (" + who + "): status read carries the desk's own session / PIN");
    good(!c.opts.method || String(c.opts.method).toUpperCase() === "GET", "key desk (" + who + "): status read is a GET");
    good(CAN_DRAFT.test(r.text) && r.text.indexOf(ON_NOTE) === 0, "key desk (" + who + "): line says " + ON_NOTE + " ('" + r.text + "')");
    good(!r.off && r.grokOn === true, "key desk (" + who + "): line is not in the off style and Ask knows drafts are on");
    good(r.html === 0, "key desk (" + who + "): line is painted with textContent, not innerHTML");
  }

  // 2. desk with no key, and a stranger -> can't-draft
  for (const who of ["nokey", "stranger"]) {
    const r = await run(src, who, "ok");
    const c = r.calls[0] || { url: "", opts: {} };
    const hd = (c.opts && c.opts.headers) || {};
    good(/^\/api\/status(\?|$)/.test(c.url), who + ": Create reads /api/status");
    if (who === "nokey") good(hd["X-Workspace"] === NO_KEY_DESK, "nokey: status read names its own desk, not another desk");
    else good(!hd["X-Workspace"] && !hd["X-Session"] && !hd["X-Pin"], "stranger: status read carries no desk, session, or PIN");
    good(!CAN_DRAFT.test(r.text), who + ": line never says a Desk AI can draft ('" + r.text + "')");
    good(r.text.indexOf(OFF_NOTE) === 0, who + ": line is the can't-draft line ('" + r.text + "')");
    good(r.off && r.grokOn === false, who + ": line is in the off style and Ask knows drafts are off");
    good(r.html === 0, who + ": line is painted with textContent, not innerHTML");
  }

  // 3. failed / refused / odd / silent read for the key desk -> never can draft
  for (const mode of ["reject", "500", "hang", "badjson", "nodeskai", "truthy", "grokonly"]) {
    const r = await run(src, "key", mode);
    good(!CAN_DRAFT.test(r.text), "status " + mode + ": never claims a Desk AI can draft ('" + r.text + "')");
    good(r.off && r.grokOn === false, "status " + mode + ": off style, drafts off for Ask");
    if (mode === "reject" || mode === "500" || mode === "hang") good(r.text === r.noAnswer && /can't draft/.test(r.text), "status " + mode + ": keeps the could-not-reach can't-draft line");
    else good(/can't draft/.test(r.text), "status " + mode + ": shows a can't-draft line");
    good(r.html === 0, "status " + mode + ": textContent only");
  }
  return bad;
}

function staticChecks(src) {
  ok(!/fetch\(\s*["']\/api\/health/.test(src), "create-desk.js no longer fetches public /api/health for the top line");
  const paint = grabFn(src, "paintAia") || "";
  ok(!/innerHTML/.test(paint), "paintAia never writes innerHTML");
  ok(/A Desk AI can draft\. You still tap Yes or Stop\./.test(paint), "paintAia keeps the existing can-draft words (no new words)");
  const api = read("api/health.js");
  ok(api.indexOf('"' + ON_NOTE + '"') >= 0 && api.indexOf('"' + OFF_NOTE + '"') >= 0, "api/health.js still sends the same on / off deskAi notes this check fakes");
  ok(/deskAi:\s*deskAiFace\(requestingDeskCanDraft\(workspace\)\)/.test(api), "api/health.js status still answers deskAi for the requesting desk");
  ok(/const publicDraftOn = false;/.test(api), "api/health.js public health is still always off (so Create must not read it)");
  ok(/check-create-draft-line\.js/.test(read("scripts/check-desk-nav.js")), "check-desk-nav.js runs this check (npm test)");
}

const MUTANTS = [
  ["Create reads public health again", [['return fetch("/api/status", opts);', 'return fetch("/api/health", opts);']]],
  ["Create reads health with no headers (old call)", [['return fetch("/api/status", opts);', 'return fetch("/api/health", ctl ? { signal: ctl.signal } : undefined);']]],
  ["Create drops the desk headers", [["if (hdrs) opts.headers = hdrs;", ""]]],
  ["Create shows can-draft when the status read fails", [["        grokOn = false;\n        el.classList.add(\"off\");\n        el.textContent = AIA_NO_ANSWER;", "        grokOn = true;\n        el.classList.remove(\"off\");\n        el.textContent = \"A Desk AI can draft. You still tap Yes or Stop.\";"]]],
  ["Create treats a 500 as an answer", [["if (r && r.ok === false) throw new Error(\"health \" + r.status);", ""]]],
  ["Create shows can-draft for a desk with no key", [["const on = g.on === true;", "const on = true;"]]],
  ["Create trusts a truthy non-boolean on", [["const on = g.on === true;", "const on = !!g.on;"]]],
  ["Create brings back the drafts.included / grok fallback", [["const g = a.deskAi || {};\n      const on = g.on === true;", "const g = a.deskAi || a.grok || {};\n      const on = g.on === true || !!(a.drafts && a.drafts.included) || !!(a.grok && a.grok.on);"]]],
  ["Create paints the line with innerHTML", [["        el.textContent = face.on\n", "        el.innerHTML = face.on\n"]]],
  ["Create shows a server can-draft note while off", [["!(!on && /\\bcan draft\\b/i.test(g.note))", "true"]]],
  ["Create shows can-draft on a timeout", [["reject(new Error(\"timeout\"));", "resolve({ automation: { deskAi: { on: true } } });"]]]
];
function mutate(src, reps) {
  let s = src;
  for (const [a, b] of reps) { if (s.indexOf(a) < 0) return null; s = s.split(a).join(b); }
  return s;
}

async function main() {
  const SRC = read("create-desk.js");
  staticChecks(SRC);
  const base = await suite(SRC, (m) => ok(true, m));
  base.forEach((m) => fail(m));
  let caught = 0;
  for (const [name, reps] of MUTANTS) {
    const S = mutate(SRC, reps);
    if (S === null) { fail("mutant does not apply: " + name); continue; }
    let bad;
    try { bad = await suite(S, null); } catch (e) { bad = ["threw " + e.message]; }
    if (bad.length) { caught += 1; console.log("ok  mutant caught: " + name + " (" + bad[0] + ")"); }
    else fail("mutant NOT caught: " + name);
  }
  console.log("mutants caught " + caught + "/" + MUTANTS.length);
  if (caught !== MUTANTS.length) fail("every mutant must be caught (" + caught + "/" + MUTANTS.length + ")");
  if (failed) { console.error("check-create-draft-line: " + passed + " ok, " + failed + " failed"); process.exit(1); }
  console.log("PASS check-create-draft-line: " + passed + " ok, 0 failed");
}
main().catch((e) => { console.error("FAIL " + (e && e.stack || e)); process.exit(1); });
