#!/usr/bin/env node
require("./_env-guard");
// A/B follow-ups, UI only.
// 1. Signed-out /drop (no ?ws=) keeps the public "find a public desk" search next to Sign in.
// 2. /login uses the same closed, disabled "Coming soon" sign-in doors as /onboard (login-doors.js).
// 3. The "Another site / Ask AIA" box stays off: the API only answers 409 and records nothing.
// 4. /onboard name, desk and city placeholders read as examples ("e.g. ...").
// 5. A signed-in empty Queue shows its one Drop step inside the empty box, not a second
//    "Drop anything" bar outside it.
// Each rule runs on the real files, then on mutants that each must be caught.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync, execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const BASE = require("./_api-freeze").BASE; // on main; survives a squash-land
let failed = 0;
let passed = 0;
function fail(msg) { failed += 1; console.error("FAIL " + msg); }
function ok(cond, msg) { if (cond) { passed += 1; console.log("ok  " + msg); } else fail(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const FILES = ["signin-first.js", "drop-pick.js", "drop.html", "login.html", "login-doors.js", "onboard.html", "desk-nav.css", "desk.html", "queue-login.js"];
const SRC = {};
FILES.forEach((f) => { SRC[f] = read(f); });

// ---------- tiny DOM ----------
function makeEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(), id: "", className: "", children: [], parentNode: null, attrs: {},
    _text: "",
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); },
    set textContent(v) { this._text = String(v); this.children = []; },
    appendChild(c) { if (c.parentNode) c.parentNode.children = c.parentNode.children.filter((x) => x !== c); c.parentNode = this; this.children.push(c); return c; },
    insertBefore(c, ref) {
      if (c.parentNode) c.parentNode.children = c.parentNode.children.filter((x) => x !== c);
      c.parentNode = this;
      const i = ref ? this.children.indexOf(ref) : -1;
      if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
      return c;
    },
    get firstChild() { return this.children[0] || null; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; },
    classList: null
  };
  const cls = [];
  el.classList = { add: (c) => { if (cls.indexOf(c) < 0) cls.push(c); }, contains: (c) => cls.indexOf(c) >= 0, list: cls };
  return el;
}
function walk(el, fn) { if (!el) return; fn(el); el.children.forEach((c) => walk(c, fn)); }

function runSignin(src, spec) {
  const html = makeEl("html");
  const head = makeEl("head");
  const body = makeEl("body");
  const main = makeEl("main");
  const pick = makeEl("div"); pick.id = "desk-pick";
  main.appendChild(pick);
  const search = makeEl("div"); search.id = "public-desk-search";
  main.appendChild(search);
  body.appendChild(main); html.appendChild(head); html.appendChild(body);
  const document = {
    documentElement: html, head, body, readyState: "complete", createElement: makeEl, addEventListener() {},
    getElementById(id) { let f = null; walk(html, (e) => { if (!f && e.id === id) f = e; }); return f; },
    querySelector(sel) { return sel === "main" ? main : null; }
  };
  const sb = {
    document, console, JSON, String, Object,
    location: { pathname: spec.path, search: spec.search || "" },
    localStorage: { getItem: (k) => (spec.local || {})[k] || null, setItem() {} },
    AIADesks: { list: () => spec.saved || [] }
  };
  sb.window = sb;
  vm.runInNewContext(src, sb, { filename: "signin-first.js" });
  const box = document.getElementById("signin-first");
  const css = document.getElementById("signin-first-css");
  return { box, css: css ? css.textContent : "", hides: html.classList.contains("signin-first"), note: document.getElementById("signin-first-public") };
}

// The public search must win over the "hide every tool" rule: same or higher specificity, later in the sheet.
function searchShows(css) {
  const hideAt = css.indexOf("html.signin-first main > :not(#signin-first){display:none!important}");
  const m = /html\.signin-first(?: body)? main > #public-desk-search\{display:block!important\}/.exec(css);
  return hideAt >= 0 && !!m && m.index > hideAt;
}

function checkDrop(S, bad) {
  let r;
  try { r = runSignin(S["signin-first.js"], { path: "/drop" }); } catch (e) { bad("signin-first threw " + e.message); return; }
  if (!r.box || !r.hides) { bad("signed-out /drop must still lead with Sign in first"); return; }
  if (!searchShows(r.css)) bad("signed-out /drop must keep the public desk search showing");
  if (!r.note || !/find a public desk/i.test(r.note.textContent)) bad("Sign in box on /drop must point strangers at the public desk search");
  const links = []; walk(r.box, (e) => { if (e.tagName === "A") links.push(e); });
  if (links.length !== 1) bad("Sign in box keeps exactly one link (" + links.length + ")");
  ["/create", "/history"].forEach((p) => {
    let o; try { o = runSignin(S["signin-first.js"], { path: p }); } catch (e) { bad(p + " threw " + e.message); return; }
    if (o.note) bad(p + " must not mention public desks");
  });
  const pick = S["drop-pick.js"];
  if (!/wrap\.id = "public-desk-search"/.test(pick) || !/fetch\("\/api\/desks\?listed=1&q="/.test(pick)) bad("drop-pick.js must still build the public desk search");
  const injectAt = pick.indexOf("injectSearch(); paint();");
  if (injectAt < 0) bad("drop-pick.js must inject the public search on every Drop load");
  if (!/<script src="drop-pick\.js"><\/script>/.test(S["drop.html"]) || S["drop.html"].indexOf('<script src="signin-first.js"></script>') < 0) bad("drop.html must load signin-first.js and drop-pick.js");
}

function checkLogin(S, bad) {
  const html = S["login.html"];
  if (html.indexOf('<script src="login-doors.js"></script>') < 0) bad("/login must load login-doors.js (Coming soon doors)");
  if (/<script src="\/?doors\.js"><\/script>/.test(html)) bad("/login must not load the old doors.js (Hold / Ask / Ext)");
  if (html.indexOf('<div id="oauth-wall"></div>') < 0) bad("/login lost its sign-in doors box");
  const doors = S["login-doors.js"];
  if (/id=\\"oauth-site\\"|data-id=\\"other\\"/.test(doors)) bad("login-doors.js must not bring back the dead Another site / Ask AIA box");
  if (!/<details class=\\"oauth-more\\" data-group=\\"soon\\">/.test(doors)) bad("Coming soon doors must sit in a closed group");
}

function ph(html, name) {
  const m = new RegExp('<input[^>]*\\bname="' + name + '"[^>]*>').exec(html);
  const p = m && /placeholder="([^"]*)"/.exec(m[0]);
  return p ? p[1] : "";
}
function checkOnboard(S, bad) {
  ["name", "biz", "city"].forEach((n) => {
    const v = ph(S["onboard.html"], n);
    if (!/^e\.g\. \S/.test(v)) bad("/onboard " + n + " placeholder must read as an example (" + v + ")");
  });
}

function checkDeskDrop(S, bad) {
  const css = S["desk-nav.css"].replace(/\/\*[\s\S]*?\*\//g, "");
  const m = /body:has\(#queue-empty-next\) #drop-go[^{]*\{\s*display:\s*none\s*!important;?\s*\}/.exec(css);
  if (!m) bad("desk-nav.css must hide the outside Drop anything bar while the empty box shows");
  if (S["desk.html"].indexOf('href="desk-nav.css"') < 0) bad("desk.html must load desk-nav.css");
  const q = S["queue-login.js"];
  if (!/wrap\.id = "queue-empty-next"/.test(q)) bad("queue-login.js empty box id changed");
  if (!/"\/drop", "Drop a card"\)/.test(q)) bad("the empty box must keep its own Drop step");
}

async function suite(S, okFn) {
  const bad = [];
  const b = (m) => bad.push(m);
  const steps = [
    ["signed-out Drop keeps the public desk search", () => checkDrop(S, b)],
    ["login uses Coming soon doors", () => checkLogin(S, b)],
    ["onboard placeholders are examples", () => checkOnboard(S, b)],
    ["empty Queue shows one Drop step", () => checkDeskDrop(S, b)]
  ];
  for (const [name, fn] of steps) {
    const n = bad.length;
    try { await fn(); } catch (e) { bad.push(name + " threw " + e.message); }
    if (okFn && bad.length === n) okFn(name);
  }
  return bad;
}

const MUTANTS = [
  ["public search hidden again", "signin-first.js", [['        "html.signin-first body main > #public-desk-search{display:block!important}" +\n', ""]]],
  ["public search rule before the hide rule", "signin-first.js", [['        "html.signin-first main > :not(#signin-first){display:none!important}" +\n        "html.signin-first body main > #public-desk-search{display:block!important}" +', '        "html.signin-first body main > #public-desk-search{display:block!important}" +\n        "html.signin-first main > :not(#signin-first){display:none!important}" +']]],
  ["no pointer to public desks", "signin-first.js", [['or.textContent = "No account? Find a public desk below and drop your work there.";', 'or.textContent = "No account?";']]],
  ["pointer on every page", "signin-first.js", [['if (page === "drop") {\n      // Strangers', 'if (true) {\n      // Strangers']]],
  ["pointer is a second link", "signin-first.js", [['var or = document.createElement("p");', 'var or = document.createElement("a");']]],
  ["drop-pick skips the search", "drop-pick.js", [["injectSearch(); paint();", "paint();"]]],
  ["login back on doors.js", "login.html", [['<script src="login-doors.js"></script>', '<script src="doors.js"></script>']]],
  ["login loads both door scripts", "login.html", [['<script src="login-doors.js"></script>', '<script src="doors.js"></script>\n  <script src="login-doors.js"></script>']]],
  ["login doors box gone", "login.html", [['<div id="oauth-wall"></div>', ""]]],
  ["Ask AIA box back", "login-doors.js", [['"<p class=\\"err\\" id=\\"oauth-flash\\"', '"<input id=\\"oauth-site\\"><button data-id=\\"other\\">Ask AIA</button><p class=\\"err\\" id=\\"oauth-flash\\"']]],
  ["soon group opens", "login-doors.js", [['<details class=\\"oauth-more\\" data-group=\\"soon\\">', '<details class=\\"oauth-more\\" data-group=\\"soon\\" open>']]],
  ["name placeholder real", "onboard.html", [['placeholder="e.g. Alex Rivera"', 'placeholder="Alex Rivera"']]],
  ["desk placeholder real", "onboard.html", [['placeholder="e.g. Oddo house"', 'placeholder="Oddo house"']]],
  ["city placeholder real", "onboard.html", [['placeholder="e.g. Springfield"', 'placeholder="Springfield"']]],
  ["outside Drop bar back", "desk-nav.css", [["body:has(#queue-empty-next) #drop-go,\nbody:has(#queue-empty-next) a#drop-go {\n  display: none !important;\n}", ""]]],
  ["rule keyed on the wrong box", "desk-nav.css", [["body:has(#queue-empty-next) #drop-go,", "body:has(#queue-empty-gone) #drop-go,"], ["body:has(#queue-empty-next) a#drop-go", "body:has(#queue-empty-gone) a#drop-go"]]],
  ["empty box loses its Drop step", "queue-login.js", [['"/drop", "Drop a card")', '"/desk", "Refresh")']]],
  ["desk stops loading desk-nav.css", "desk.html", [['href="desk-nav.css"', 'href="desk-nav-x.css"']]]
];
function mutate(S, file, reps) {
  let s = S[file];
  for (const [find, repl] of reps) {
    if (s.indexOf(find) < 0) return null;
    s = s.split(find).join(repl);
  }
  return Object.assign({}, S, { [file]: s });
}
function staticChecks() {
  const desk = fs.statSync(path.join(root, "desk.html")).size;
  ok(desk === 35012, "desk.html is 35012 bytes (" + desk + ")");
  // api/ freeze from #434: any git or helper error is a FAIL, never a pass.
  let freeze;
  try { freeze = require("./_api-freeze").check(root); }
  catch (e) { freeze = { ok: false, problems: ["api freeze helper failed: " + ((e && e.message) || e)] }; }
  if (!freeze || freeze.ok !== true) freeze = { ok: false, base: (freeze && freeze.base) || BASE, problems: (freeze && freeze.problems && freeze.problems.length) ? freeze.problems : ["api freeze gave no answer"] };
  ok(freeze.ok, "api/ frozen vs " + String(freeze.base || BASE).slice(0, 8) + " (scripts/_api-freeze.js)" + (freeze.ok ? "" : ": " + freeze.problems.join("; ")));
  ok(/check-ux-ab-followup\.js/.test(read("package.json")), "npm test runs check-ux-ab-followup.js");
  ok(!/checkout|charge\(|\/api\/pay|process\.env/i.test(SRC["signin-first.js"] + SRC["desk-nav.css"]), "no pay or checkout wiring");
}
async function main() {
  staticChecks();
  const base = await suite(SRC, (m) => ok(true, m));
  base.forEach((m) => fail(m));
  let caught = 0;
  for (const [name, file, reps] of MUTANTS) {
    const S = mutate(SRC, file, reps);
    if (S === null) { fail("mutant does not apply: " + name); continue; }
    if (S[file] === SRC[file]) { fail("mutant changed nothing: " + name); continue; }
    let bad;
    try { bad = await suite(S, null); } catch (e) { bad = ["threw " + e.message]; }
    if (bad.length) { caught += 1; console.log("ok  mutant caught: " + name + " (" + bad[0] + ")"); }
    else fail("mutant NOT caught: " + name);
  }
  console.log("mutants caught " + caught + "/" + MUTANTS.length);
  if (caught !== MUTANTS.length || MUTANTS.length < 10) fail("every mutant must be caught (" + caught + "/" + MUTANTS.length + ")");
  if (failed) { console.error("check-ux-ab-followup: " + passed + " ok, " + failed + " failed"); process.exit(1); }
  console.log("check-ux-ab-followup: " + passed + " ok, 0 failed");
}
main().catch((e) => { console.error("FAIL " + (e && e.stack || e)); process.exit(1); });
