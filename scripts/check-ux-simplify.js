#!/usr/bin/env node
require("./_env-guard");
// Simpler pages, UI only.
// /create and /history: the "Checking whether a Desk AI can draft…" line always ends in a plain next
// step, whether /api/health answers, fails, or does not answer within about 7 seconds, and it starts
// before anything else on the page can throw. /create shows one clear first choice. /more groups its
// tiles under four plain headings. /help has an "On this page" list and readable link text.
// Each rule runs once on the real files, then against mutants that each must be caught.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const BASE = "782cbc0730d55498dde14b3cac8e39f34cb68ae3";
let failed = 0;
let passed = 0;
function fail(msg) { failed += 1; console.error("FAIL " + msg); }
function ok(cond, msg) { if (cond) { passed += 1; console.log("ok  " + msg); } else fail(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const FILES = ["create-desk.js", "create.html", "history.html", "more.html", "help.html"];
const SRC = {};
FILES.forEach((f) => { SRC[f] = read(f); });
const CHECKING = "Checking whether a Desk AI can draft on this phone…";

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

// fake clock + element
function harness() {
  const timers = [];
  const el = { textContent: CHECKING, classList: { _s: {}, add(c) { this._s[c] = 1; }, remove(c) { delete this._s[c]; }, toggle(c, on) { if (on) this._s[c] = 1; else delete this._s[c]; }, contains(c) { return !!this._s[c]; } } };
  return {
    el, timers,
    setTimeout: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].live = false; },
    fire() { timers.filter((t) => t.live).forEach((t) => { t.live = false; t.fn(); }); }
  };
}
const tick = () => new Promise((r) => setImmediate(r));
async function settle() { for (let i = 0; i < 10; i++) await tick(); }
function fetchFor(mode) {
  return () => {
    if (mode === "hang") return new Promise(() => {});
    if (mode === "fail") return Promise.reject(new Error("offline"));
    if (mode === "on") return Promise.resolve({ json: () => Promise.resolve({ automation: { deskAi: { on: true, note: "" } } }) });
    if (mode === "odd") return Promise.resolve({ json: () => Promise.resolve({ automation: { deskAi: { on: true, note: "Grok crew ready on this box" } } }) });
    return Promise.resolve({ json: () => Promise.resolve({ automation: { deskAi: { on: false } } }) });
  };
}
function nextStep(t) { return /You can still|reload this page|You still tap Yes or Stop|add work from Drop|Check your connection/.test(t); }

async function runCreate(S, mode) {
  const src = S["create-desk.js"];
  const code = [line(src, /const AIA_WAIT_MS = \d+;/), line(src, /const AIA_NO_ANSWER = "[^"]*";/), grabFn(src, "healthWithin"), grabFn(src, "draftsOffNote"), grabFn(src, "deskAiFromHealth"), grabFn(src, "paintAia")].join("\n");
  const h = harness();
  const ctx = { document: { getElementById: (id) => (id === "aia-line" ? h.el : null) }, fetch: fetchFor(mode), setTimeout: h.setTimeout, clearTimeout: h.clearTimeout, Promise, grokOn: false };
  vm.runInNewContext("var grokOn=false;\n" + code + "\nthis.go = paintAia;", ctx, { timeout: 1000 });
  ctx.go();
  await settle();
  if (mode === "hang") { h.fire(); await settle(); }
  return { text: h.el.textContent, off: h.el.classList.contains("off"), timers: h.timers };
}
async function runHistory(S, mode) {
  const html = S["history.html"];
  const code = [line(html, /var AIA_WAIT_MS=\d+;/), grabFn(html, "paintAia")].join("\n");
  const h = harness();
  const ctx = { document: { getElementById: (id) => (id === "aia-line" ? h.el : null) }, fetch: fetchFor(mode), setTimeout: h.setTimeout, clearTimeout: h.clearTimeout, Promise };
  vm.runInNewContext(code + "\nthis.go = paintAia;", ctx, { timeout: 1000 });
  ctx.go();
  await settle();
  if (mode === "hang") { h.fire(); await settle(); }
  return { text: h.el.textContent, off: h.el.classList.contains("off"), timers: h.timers };
}
async function checkHealth(S, bad) {
  for (const [page, run] of [["/create", runCreate], ["/history", runHistory]]) {
    for (const mode of ["hang", "fail", "on", "off", "odd"]) {
      let r;
      try { r = await run(S, mode); } catch (e) { bad(page + " " + mode + " threw " + e.message); continue; }
      if (r.text === CHECKING || !r.text) bad(page + " health " + mode + ": still says Checking (or nothing)");
      else if (!nextStep(r.text)) bad(page + " health " + mode + ": no plain next step ('" + r.text + "')");
      if ((mode === "hang" || mode === "fail" || mode === "off") && !r.off) bad(page + " health " + mode + ": must show the off style");
      if (mode === "on" && (r.off || !/A Desk AI can draft\./.test(r.text))) bad(page + " health on: must say a Desk AI can draft");
      if (mode === "odd" && /Grok|box/.test(r.text)) bad(page + " health on: must not paint raw server notes");
      const t = r.timers[0];
      if (!t || t.ms < 6000 || t.ms > 8000) bad(page + " must give /api/health 6-8 seconds, then stop waiting (" + (t ? t.ms : "no timer") + ")");
      if ((mode === "on" || mode === "off" || mode === "fail") && r.timers.some((x) => x.live)) bad(page + " health " + mode + ": timer must be cleared once it answers");
    }
  }
  const boot = S["create-desk.js"].slice(S["create-desk.js"].indexOf("(function boot() {"));
  if (!/^\(function boot\(\) \{\s*paintAia\(\);/.test(boot)) bad("/create must start the health check first in boot, before anything else can throw");
  if ((boot.match(/paintAia\(\)/g) || []).length !== 1) bad("/create boot must call paintAia once");
  const hb = S["history.html"];
  if (!/paintAia\(\);loadView\(\);/.test(hb)) bad("/history must start the health check before loadView and fillPick");
  if (/fillPick\(\);paintAia\(\);/.test(hb)) bad("/history still waits for fillPick before the health check");
  if (S["create.html"].indexOf(CHECKING) < 0 || hb.indexOf(CHECKING) < 0) bad("the Checking line must stay as the first paint");
}

// ---------- /create one first choice ----------
function El(id, tag) { this.id = id || ""; this.tagName = (tag || "div").toUpperCase(); this.children = []; this.parentNode = null; this.textContent = ""; this.className = ""; this.open = false; }
El.prototype.appendChild = function (c) { if (c.parentNode) c.parentNode.children = c.parentNode.children.filter((x) => x !== c); this.children.push(c); c.parentNode = this; return c; };
function checkCreate(S, bad) {
  const html = S["create.html"];
  const askStart = html.indexOf('<div id="cs-ask">');
  const askEnd = html.indexOf('<div id="cs-review"');
  const ask = html.slice(askStart, askEnd);
  const src = S["create-desk.js"];
  const list = (src.match(/const MORE_WAYS = (\[[^\]]*\]);/) || [])[1];
  if (!list) { bad("create-desk.js MORE_WAYS missing"); return; }
  const ids = JSON.parse(list);
  ["cs-starters", "cs-library", "cs-when-pick", "cs-files", "cs-example", "cs-webhook", "cs-voice"].forEach((id) => { if (ids.indexOf(id) < 0) bad("/create still shows " + id + " up front"); });
  ids.forEach((id) => { if (ask.indexOf('id="' + id + '"') < 0) bad("MORE_WAYS names " + id + " which is not in the first step"); });
  ["cs-words", "cs-draft"].forEach((id) => { if (ids.indexOf(id) >= 0) bad("/create hides the first choice " + id); });
  const fn = grabFn(src, "trimCreate");
  if (!fn) { bad("trimCreate missing"); return; }
  for (const openIt of [false, true]) {
    const els = {};
    const askEl = new El("cs-ask");
    ["cs-step", "cs-words", "cs-draft", "cs-note"].concat(ids).forEach((id) => { els[id] = askEl.appendChild(new El(id)); });
    els["cs-ask"] = askEl;
    const doc = { getElementById: (id) => els[id] || null, createElement: (t) => { const e = new El("", t); const orig = e.appendChild.bind(e); e.appendChild = (c) => { if (c.id) els[c.id] = c; return orig(c); }; return e; } };
    const ctx = { document: doc };
    vm.runInNewContext("const MORE_WAYS = " + list + ";\n" + fn + "\ntrimCreate(" + openIt + ");", ctx, { timeout: 1000 });
    const more = askEl.children.find((c) => c.tagName === "DETAILS");
    if (!more) { bad("/create must fold the other ways into one details"); continue; }
    if (more.id !== "cs-more") bad("the fold must be #cs-more");
    const sum = more.children.find((c) => c.tagName === "SUMMARY");
    if (!sum || sum.textContent !== "More ways to start") bad("the fold must be labelled 'More ways to start'");
    const top = askEl.children.map((c) => c.id).filter(Boolean);
    ids.forEach((id) => { if (top.indexOf(id) >= 0) bad("/create still shows " + id + " up front"); });
    ["cs-words", "cs-draft"].forEach((id) => { if (top.indexOf(id) < 0) bad("/create first choice lost " + id); });
    if (askEl.children.indexOf(more) < askEl.children.indexOf(els["cs-draft"])) bad("'More ways to start' must sit under Draft it");
    if (more.open !== openIt) bad("the fold must open only when a link asks for another kind");
  }
  if (!/trimCreate\(kind !== "job"\);/.test(src)) bad("boot must fold the other ways (open only for ?kind=)");
}

// ---------- /more groups ----------
function checkMore(S, bad) {
  const html = S["more.html"];
  const heads = [];
  html.replace(/<h2 data-more-section="([^"]+)">([^<]+)<\/h2>/g, (m, id, t) => { heads.push([id, t]); return m; });
  const want = [["account", "Your account"], ["work", "Everyday work"], ["help", "Get help"], ["build", "For builders"]];
  if (JSON.stringify(heads) !== JSON.stringify(want)) bad("/more must group tiles under: " + want.map((w) => w[1]).join(", ") + " (got " + heads.map((h) => h[1]).join(", ") + ")");
  const total = (html.match(/<article class="more-item"/g) || []).length;
  if (total < 28) bad("/more lost tiles (" + total + ")");
  let counted = 0;
  want.forEach(([id]) => {
    const i = html.indexOf('<div class="card" data-more-section="' + id + '">');
    if (i < 0) { bad("/more section " + id + " missing"); return; }
    const j = html.indexOf("\n    </div>\n", i);
    const sec = html.slice(i, j);
    const n = (sec.match(/<article class="more-item"/g) || []).length;
    counted += n;
    if (id !== "build" && n > 6) bad("/more " + id + " is too long (" + n + " tiles)");
    if (!/<p class="more-lead">[^<]{10,}<\/p>/.test(sec)) bad("/more " + id + " needs a one-line plain lead");
  });
  if (counted !== total) bad("/more has tiles outside the four groups (" + counted + "/" + total + ")");
  const work = html.slice(html.indexOf('data-more-section="work">'), html.indexOf('data-more-section="help">'));
  ["/desk", "/drop#talk", "/create", "/history"].forEach((h) => { if (work.indexOf('href="' + h + '"') < 0) bad("Everyday work must hold " + h); });
  const help = html.slice(html.indexOf('data-more-section="help">'), html.indexOf('data-more-section="build">'));
  ["/help#faq", "/support", "/status"].forEach((h) => { if (help.indexOf('href="' + h + '"') < 0) bad("Get help must hold " + h); });
  if (/Tap <b>\?<\/b>/.test(html)) bad("/more still says Tap ? (the button shows an i)");
}

// ---------- /help ----------
function checkHelp(S, bad) {
  const html = S["help.html"];
  html.replace(/<a\b[^>]*>([^<]*)<\/a>/g, (m, t) => {
    const s = t.trim();
    if (/^(#|\/|https?:|www\.)/.test(s)) bad("/help bare link text: " + s);
    if (/click here|^here$/i.test(s)) bad("/help 'click here' link");
    return m;
  });
  const toc = (html.match(/<nav class="card help-toc" id="help-toc"[\s\S]*?<\/nav>/) || [""])[0];
  if (!toc) { bad("/help needs an 'On this page' list"); return; }
  if (!/<h2>On this page<\/h2>/.test(toc)) bad("/help list must be titled 'On this page'");
  const groups = (toc.match(/<div class="toc-group"><h3>/g) || []).length;
  if (groups < 4) bad("/help list needs at least 4 short groups (" + groups + ")");
  const ids = {};
  html.replace(/\sid="([^"]+)"/g, (m, id) => { ids[id] = 1; return m; });
  let links = 0;
  toc.replace(/href="#([^"]+)"/g, (m, id) => { links += 1; if (!ids[id]) bad("/help list links to #" + id + " which does not exist"); return m; });
  if (links < 12) bad("/help list is too thin (" + links + " links)");
  if (html.indexOf("help-toc") > html.indexOf('id="playbook-card"')) bad("/help list must come before the first section");
  const cards = html.match(/<div class="card"(?: id="[^"]*")?>\s*<h2>/g) || [];
  const noId = cards.filter((c) => !/ id="/.test(c)).length;
  if (noId) bad("/help has " + noId + " sections you cannot jump to");
}

async function suite(S, okFn) {
  const bad = [];
  const b = (m) => bad.push(m);
  const steps = [["health line always resolves", () => checkHealth(S, b)], ["/create one first choice", () => checkCreate(S, b)], ["/more four groups", () => checkMore(S, b)], ["/help sections and link text", () => checkHelp(S, b)]];
  for (const [name, fn] of steps) {
    const n = bad.length;
    try { await fn(); } catch (e) { bad.push(name + " threw " + e.message); }
    if (okFn && bad.length === n) okFn(name);
  }
  return bad;
}

const MUTANTS = [
  ["create no timeout", "create-desk.js", [["        const timer = setTimeout(function () {\n          if (ctl) { try { ctl.abort(); } catch (e) {} }\n          reject(new Error(\"timeout\"));\n        }, ms);", "        const timer = 0;"]]],
  ["create 30s timeout", "create-desk.js", [["const AIA_WAIT_MS = 7000;", "const AIA_WAIT_MS = 30000;"]]],
  ["create fail leaves Checking", "create-desk.js", [["        el.textContent = AIA_NO_ANSWER;", ""]]],
  ["create raw server note", "create-desk.js", [["        el.textContent = face.on\n          ? \"A Desk AI can draft. You still tap Yes or Stop.\"", "        el.textContent = face.on\n          ? (face.note || \"A Desk AI can draft. You still tap Yes or Stop.\")"]]],
  ["create health after picks", "create-desk.js", [["    (function boot() {\n      paintAia();", "    (function boot() {"], ["      wireStart();\n      paintStartDesk();", "      wireStart();\n      paintAia();\n      paintStartDesk();"]]],
  ["create timer never cleared", "create-desk.js", [[".then(function (h) { clearTimeout(timer); resolve(h); }", ".then(function (h) { resolve(h); }"]]],
  ["history no timeout", "history.html", [["var timer=setTimeout(function(){if(ctl){try{ctl.abort();}catch(e){}}say(false,fail);},AIA_WAIT_MS);", "var timer=0;"]]],
  ["history off has no next step", "history.html", [[":\"A Desk AI can't draft on this phone yet. Your history still shows here, and you can add work from Drop.\");", ":\"A Desk AI can't draft on this phone yet.\");"]]],
  ["history health after fillPick", "history.html", [["paintAia();loadView();", "loadView();"], ["fillPick();if(askSeat)", "fillPick();paintAia();if(askSeat)"]]],
  ["create shows everything", "create-desk.js", [["      trimCreate(kind !== \"job\");\n", ""]]],
  ["create fold always open", "create-desk.js", [["        if (openIt) more.open = true;", "        more.open = true;"]]],
  ["create hides the words", "create-desk.js", [["const MORE_WAYS = [\"cs-starter-hint\",", "const MORE_WAYS = [\"cs-words\", \"cs-starter-hint\","]]],
  ["create keeps starters up front", "create-desk.js", [["\"cs-starter-hint\", \"cs-starters\", \"cs-library\",", "\"cs-starter-hint\", \"cs-library\","]]],
  ["more one big list", "more.html", [["<h2 data-more-section=\"build\">For builders</h2>", "<h2 data-more-section=\"help\">More</h2>"]]],
  ["more Tap ?", "more.html", [["Tap the round <b>i</b> button", "Tap <b>?</b>"]]],
  ["more lead missing", "more.html", [["<p class=\"more-lead\">Answers, a person to ask, and what is on right now.</p>", ""]]],
  ["help bare anchor", "help.html", [["<a href=\"#sell-packs\">Selling packs</a> ·", "<a href=\"#sell-packs\">#sell-packs</a> ·"]]],
  ["help bare url", "help.html", [["<a href=\"/dev#first-pack\">Your first pack in Creators Studio</a>", "<a href=\"/dev#first-pack\">/dev#first-pack</a>"]]],
  ["help no TOC", "help.html", [["<h2>On this page</h2>", "<h2>Topics</h2>"]]],
  ["help dead TOC link", "help.html", [["<a href=\"#first-day\">Your first day</a>", "<a href=\"#first-days\">Your first day</a>"]]],
  ["help section without id", "help.html", [["<div class=\"card\" id=\"broke\">", "<div class=\"card\">"]]]
];
function mutate(S, file, reps) {
  let s = S[file];
  for (const [find, repl] of reps) { if (s.indexOf(find) < 0) return null; s = s.split(find).join(repl); }
  return Object.assign({}, S, { [file]: s });
}
function staticChecks() {
  const desk = fs.statSync(path.join(root, "desk.html")).size;
  ok(desk === 35012, "desk.html is 35012 bytes (" + desk + ")");
  let apiDiff = "";
  try { apiDiff = execSync("git diff --name-only " + BASE + " -- api", { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch (e) { apiDiff = ""; }
  ok(apiDiff === "", "no api/ file differs from " + BASE.slice(0, 8) + (apiDiff ? " (" + apiDiff + ")" : ""));
  ok(/check-ux-simplify\.js/.test(read("package.json")), "npm test runs check-ux-simplify.js");
}
async function main() {
  staticChecks();
  const base = await suite(SRC, (m) => ok(true, m));
  base.forEach((m) => fail(m));
  let caught = 0;
  for (const [name, file, reps] of MUTANTS) {
    const S = mutate(SRC, file, reps);
    if (S === null) { fail("mutant does not apply: " + name); continue; }
    let bad;
    try { bad = await suite(S, null); } catch (e) { bad = ["threw " + e.message]; }
    if (bad.length) { caught += 1; console.log("ok  mutant caught: " + name + " (" + bad[0] + ")"); }
    else fail("mutant NOT caught: " + name);
  }
  console.log("mutants caught " + caught + "/" + MUTANTS.length);
  if (caught !== MUTANTS.length || MUTANTS.length < 10) fail("every mutant must be caught (" + caught + "/" + MUTANTS.length + ")");
  if (failed) { console.error("check-ux-simplify: " + passed + " ok, " + failed + " failed"); process.exit(1); }
  console.log("check-ux-simplify: " + passed + " ok, 0 failed");
}
main().catch((e) => { console.error("FAIL " + (e && e.stack || e)); process.exit(1); });
