#!/usr/bin/env node
require("./_env-guard");
// Stranger sign-in path (UX audit 32145675 findings 1, 2, 5).
// Runs the REAL code in small DOM stubs (node vm), then runs the same checks against source
// mutants; every mutant must be caught.
// /login: a clear "Open a free Queue" link for new people inside the form, and theme.js
//   paintSiteNav keeps links marked data-nav-keep (the header "Open a Queue" link).
// /account: a stranger sees Sign in first; the You card (with Save profile) stays hidden until
//   a session opens the book; placeholders read as examples; no real-looking address.
// desks.html, aia-mail.js: no hardcoded james / funditaway addresses.
// /onboard: login-doors.js shows sign-in doors that are not ready as disabled "Coming soon"
//   buttons in a closed group; only live doors start a login; no HOLD/ASK words.
// Also: desk.html is 35012 bytes and api/ is frozen vs main 782cbc0 (scripts/_api-freeze.js).
// Usage: node scripts/check-ux-signin.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
let failed = 0;
let passed = 0;
function fail(msg) { failed += 1; console.error("FAIL " + msg); }
function ok(cond, msg) { if (cond) { passed += 1; console.log("ok  " + msg); } else fail(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const FILES = ["theme.js", "login.html", "account.html", "desks.html", "aia-mail.js", "login-doors.js"];
const SRC = {};
FILES.forEach((f) => { SRC[f] = read(f); });

function El(tag, id) {
  this.tagName = String(tag || "div").toUpperCase();
  this.id = id || "";
  this.attrs = {};
  this.children = [];
  this.hidden = false;
  this.disabled = false;
  this.value = "";
  this.textContent = "";
  this.className = "";
  this.style = {};
  this.files = [];
  this._html = "";
  const self = this;
  this.classList = {
    add() { [].slice.call(arguments).forEach((c) => { if ((" " + self.className + " ").indexOf(" " + c + " ") < 0) self.className = (self.className + " " + c).trim(); }); },
    remove() {}, contains(c) { return (" " + self.className + " ").indexOf(" " + c + " ") >= 0; }
  };
}
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; };
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.hasAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); };
El.prototype.appendChild = function (c) { this.children = this.children.filter((x) => x !== c); this.children.push(c); c.parentNode = this; return c; };
El.prototype.insertBefore = function (c, ref) {
  this.children = this.children.filter((x) => x !== c);
  const i = this.children.indexOf(ref);
  if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
  c.parentNode = this; return c;
};
Object.defineProperty(El.prototype, "firstChild", { get() { return this.children[0] || null; } });
Object.defineProperty(El.prototype, "innerHTML", {
  get() { return this._html; },
  set(v) { this._html = String(v); this.children = []; }
});
El.prototype.querySelector = function () { return null; };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.addEventListener = function () {};
El.prototype.click = function () {};
El.prototype.focus = function () {};
const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle() { for (let i = 0; i < 8; i++) await tick(); }
function store(init) {
  const m = Object.assign({}, init || {});
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
}
function grabFn(src, name) {
  const i = src.indexOf("function " + name + "(");
  if (i < 0) return null;
  let depth = 0;
  for (let j = src.indexOf("{", i); j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return null;
}
function tagOf(html, id) {
  const m = html.match(new RegExp("<[a-z]+\\b[^>]*\\bid=\"" + id + "\"[^>]*>", "i"));
  return m ? m[0] : "";
}
function attrOf(tag, name) {
  const m = tag.match(new RegExp("\\s" + name + "=\"([^\"]*)\""));
  return m ? m[1] : null;
}

// ---------- /login + theme.js ----------
function checkLogin(S, bad) {
  const login = S["login.html"];
  const header = (login.match(/<header[\s\S]*?<\/header>/) || [""])[0];
  const headLink = (header.match(/<a\b[^>]*href="onboard\.html"[^>]*>[^<]*<\/a>/) || [""])[0];
  if (!/data-nav-keep/.test(headLink) || !/Open a Queue/.test(headLink)) bad("login header 'Open a Queue' link must be marked data-nav-keep");
  const form = (login.match(/<form class="gate-card" id="form">[\s\S]*?<\/form>/) || [""])[0];
  const link = (form.match(/<a\b[^>]*id="open-a-queue"[^>]*>[^<]*<\/a>/) || [""])[0];
  if (!link) bad("login form must carry the open-a-queue link");
  else {
    if (attrOf(link, "href") !== "onboard.html") bad("open-a-queue must go to onboard.html (" + attrOf(link, "href") + ")");
    if (!/>Open a free Queue</.test(link)) bad("open-a-queue must read 'Open a free Queue'");
  }
  if (form.indexOf('id="open-a-queue"') > form.indexOf('id="open-queue"')) bad("new-here link must sit above the sign-in button");
  if (/No password yet\?/.test(login)) bad("login still has the circular 'No password yet?' hint");

  const fn = grabFn(S["theme.js"], "paintSiteNav");
  if (!fn) { bad("theme.js paintSiteNav missing"); return; }
  const headerEl = new El("header");
  const nav = new El("div"); nav.className = "nav";
  const keep = new El("a"); keep.attrs = { href: "/onboard", "data-nav-keep": "" }; keep.textContent = "Open a Queue";
  const plain = new El("a"); plain.attrs = { href: "/somewhere" };
  nav.appendChild(keep); nav.appendChild(plain);
  nav.querySelectorAll = (sel) => (sel === "[data-nav-keep]" ? nav.children.filter((c) => c.hasAttribute("data-nav-keep")) : []);
  headerEl.querySelector = () => nav;
  const doc = { querySelector: () => headerEl, createElement: (t) => new El(t) };
  const ctx = { document: doc, isEmbed: () => false, pageName: () => "login",
    SITE_LINKS: [{ id: "how", href: "/how", label: "How" }, { id: "help", href: "/help", label: "Help" }] };
  try { vm.runInNewContext(fn + "\npaintSiteNav();", ctx, { timeout: 1000 }); }
  catch (e) { bad("paintSiteNav threw " + e.message); return; }
  if (nav.children.indexOf(keep) < 0) bad("paintSiteNav wiped the data-nav-keep link");
  if (nav.children.indexOf(plain) >= 0) bad("paintSiteNav must still replace unmarked links");
  if (!/href="\/how"/.test(nav.innerHTML) || !/href="\/help"/.test(nav.innerHTML)) bad("paintSiteNav must still paint the site links");
}

// ---------- /account ----------
async function runAccount(html, ls, bad, label) {
  const m = html.match(/<script>\s*const slugEl[\s\S]*?<\/script>/);
  if (!m) { bad("account.html script missing"); return null; }
  const code = m[0].replace(/^<script>/, "").replace(/<\/script>$/, "");
  const els = {};
  const doc = {
    getElementById(id) {
      if (!els[id]) {
        const t = tagOf(html, id);
        if (!t) return null;
        const e = new El((t.match(/^<([a-z]+)/i) || [])[1], id);
        e.hidden = /\shidden(\s|>|=)/.test(t);
        els[id] = e;
      }
      return els[id];
    },
    querySelectorAll: () => [], querySelector: () => null, createElement: (t) => new El(t)
  };
  const calls = [];
  const fetch = (url, opts) => { calls.push({ url, opts: opts || {} });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, account: { name: "Pat" }, plan: {}, sessions: [] }) }); };
  const ctx = { document: doc, localStorage: store(ls), fetch, console: { log() {}, error() {}, warn() {} },
    setTimeout, location: { href: "", search: "", pathname: "/account" }, URL: { createObjectURL: () => "", revokeObjectURL() {} },
    Image: function () {}, Blob: function () {} };
  ctx.window = ctx;
  try { vm.runInNewContext(code, ctx, { timeout: 2000 }); }
  catch (e) { bad(label + " account script threw " + e.message); return null; }
  await settle();
  return { els, calls, get: (id) => doc.getElementById(id) };
}
async function checkAccount(S, bad) {
  const html = S["account.html"];
  const gateAt = html.indexOf('<form class="card" id="gate">');
  const youAt = html.indexOf('id="you-card"');
  if (gateAt < 0 || youAt < 0) bad("account.html needs #gate and #you-card");
  else if (gateAt > youAt) bad("sign-in box must come before the You card");
  const saveAt = html.indexOf('id="save-you"');
  let youEnd = -1;
  if (youAt >= 0) {
    const re = /<\/?div\b/g; re.lastIndex = youAt; let depth = 1, m;
    while ((m = re.exec(html))) { depth += m[0] === "<div" ? 1 : -1; if (!depth) { youEnd = m.index; break; } }
  }
  if (!(saveAt > youAt && saveAt < youEnd)) bad("Save profile must sit inside the You card");
  if (!/#you-card\[hidden\]\{display:none!important\}/.test(html)) bad("#you-card must honor hidden");
  // Probe A18: the /account headings say what the page is and what to do, never "Open the account".
  const h1 = (html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/) || ["", ""])[1].replace(/<[^>]+>/g, "").trim();
  if (h1 !== "Your account") bad("/account heading must be Your account (" + h1 + ")");
  const gateHtml = gateAt >= 0 ? html.slice(gateAt, html.indexOf("</form>", gateAt)) : "";
  const gateH = (gateHtml.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/) || ["", ""])[1].replace(/<[^>]+>/g, "").trim();
  if (gateH !== "Sign in first") bad("/account sign-in box heading must be Sign in first (" + gateH + ")");
  if (/Open the account/i.test(html)) bad("/account must not say Open the account");

  const out = await runAccount(html, {}, bad, "stranger");
  if (out) {
    if (!out.get("you-card") || out.get("you-card").hidden !== true) bad("stranger: You card and Save profile must be hidden");
    if (out.get("gate").hidden) bad("stranger: sign-in box must show");
    if (out.calls.length) bad("stranger: no account fetch before sign in (" + out.calls.length + ")");
  }
  const inn = await runAccount(html, { aia_session: "tok", aia_ws: "pat-shop" }, bad, "signed in");
  if (inn) {
    if (!inn.calls.length) bad("signed in: account must load");
    if (inn.get("you-card").hidden !== false) bad("signed in: You card must show once the book opens");
    if (inn.get("gate").hidden !== true) bad("signed in: sign-in box must hide");
  }
  const ph = (id) => attrOf(tagOf(html, id), "placeholder") || "";
  if (ph("you-email") !== "you@example.com") bad("email placeholder must be you@example.com (" + ph("you-email") + ")");
  ["you-phone", "you-city", "you-handle"].forEach((id) => {
    if (!/^e\.g\. /.test(ph(id))) bad(id + " placeholder must read as an example (" + ph(id) + ")");
  });
  if (/417-555|Springfield|james/i.test(["you-phone", "you-city", "you-handle", "you-email"].map(ph).join(" "))) bad("account placeholders must not look like a real person");
}
function checkAddresses(S, bad) {
  ["account.html", "desks.html", "aia-mail.js"].forEach((f) => {
    if (/james-ai@funditaway\.aia|funditaway\.aia|james\.aia|springfield-shop\.aia/i.test(S[f])) bad(f + " still shows a hardcoded james / funditaway / springfield address");
    if (!/Create \.aia email for automations/.test(S[f])) bad(f + " lost the create .aia email copy");
  });
  const desks = S["desks.html"];
  if (!/^e\.g\. /.test(attrOf(tagOf(desks, "you-handle"), "placeholder") || "")) bad("desks.html handle placeholder must read as an example");
}

// ---------- /onboard login doors ----------
async function runDoors(src, providers, bad, label) {
  const box = new El("div", "oauth-wall");
  const flash = new El("p", "oauth-flash");
  box.querySelector = (sel) => (sel === "#oauth-flash" ? flash : null);
  const calls = [];
  const fetch = (url, opts) => {
    calls.push({ url, opts: opts || {} });
    if (/providers=1/.test(url)) {
      if (!providers) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ providers }) });
    }
    return Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({}) });
  };
  const doc = { readyState: "complete", getElementById: (id) => (id === "oauth-wall" ? box : null), addEventListener() {} };
  const ctx = { document: doc, fetch, localStorage: store({}), location: { search: "", pathname: "/onboard", href: "" }, console: { log() {}, error() {} }, setTimeout };
  ctx.window = ctx;
  try { vm.runInNewContext(src, ctx, { timeout: 2000 }); }
  catch (e) { bad(label + " login-doors threw " + e.message); return null; }
  await settle();
  return { box, calls, ctx };
}
function buttons(html) { return html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) || []; }
async function checkDoors(S, bad) {
  const src = S["login-doors.js"];
  const fb = await runDoors(src, null, bad, "fallback");
  if (fb) {
    const html = fb.box.innerHTML;
    const btns = buttons(html);
    const soon = btns.filter((b) => /data-soon=/.test(b));
    if (soon.length < 9) bad("fallback: doors that are not ready must show as Coming soon (" + soon.length + ")");
    soon.forEach((b) => {
      if (!/\sdisabled[\s>]/.test(b)) bad("Coming soon door must be disabled: " + b.slice(0, 80));
      if (!/Coming soon/.test(b)) bad("door must say Coming soon: " + b.slice(0, 80));
      if (/data-id=/.test(b) || /Continue with/.test(b)) bad("Coming soon door must not look like it works: " + b.slice(0, 80));
    });
    if (btns.some((b) => /data-id=/.test(b))) bad("fallback: no door is live, so none may start a login");
    if (/<details\b[^>]*\sopen/.test(html)) bad("Coming soon group must start closed");
    if (!/<details\b[^>]*>\s*<summary>[^<]*coming soon/i.test(html)) bad("Coming soon doors must sit in a closed group that says coming soon");
    if (/\b(HOLD|Hold|ASK|Ask|PASS)\b/.test(html.replace(/<[^>]+>/g, " "))) bad("door copy must not use HOLD/ASK words");
    if (/oauth-site/.test(html)) bad("no 'Another site' ask box on the public page");
  }
  const live = [{ id: "google", label: "Google", group: "live", status: "live" }, { id: "github", label: "GitHub", group: "live", status: "hold" }, { id: "grok", label: "Grok", group: "ask", status: "ask" }];
  const lv = await runDoors(src, live, bad, "live");
  if (lv) {
    const btns = buttons(lv.box.innerHTML);
    const g = btns.filter((b) => /data-id="google"/.test(b))[0] || "";
    if (!g || /\sdisabled[\s>]/.test(g) || !/Continue with Google/.test(g)) bad("live door must be a working 'Continue with Google' button");
    if (btns.filter((b) => /data-soon=/.test(b)).length !== 2) bad("hold and ask doors both show as Coming soon");
    const fake = (id, disabled) => ({ target: { closest: () => ({ disabled: !!disabled, getAttribute: () => id }) } });
    const posts = () => lv.calls.filter((c) => c.opts && c.opts.method === "POST").length;
    const before = posts();
    lv.box.onclick(fake("github", false)); await settle();
    if (posts() !== before) bad("a door that is not live must never start a login");
    lv.box.onclick(fake("google", true)); await settle();
    if (posts() !== before) bad("a disabled door must never start a login");
    lv.box.onclick(fake("google", false)); await settle();
    const p = lv.calls.filter((c) => c.opts && c.opts.method === "POST");
    if (posts() !== before + 1 || !/"oauth-start"/.test(p[p.length - 1].opts.body || "") || !/"google"/.test(p[p.length - 1].opts.body || "")) bad("live Google door must start oauth-start");
  }
}

async function suite(S, okFn) {
  const bad = [];
  const b = (m) => bad.push(m);
  const steps = [
    ["login link + kept header link", () => checkLogin(S, b)],
    ["account sign-in first", () => checkAccount(S, b)],
    ["no hardcoded addresses", () => checkAddresses(S, b)],
    ["onboard Coming soon doors", () => checkDoors(S, b)]
  ];
  for (const [name, fn] of steps) {
    const n = bad.length;
    try { await fn(); } catch (e) { bad.push(name + " threw " + e.message); }
    if (okFn && bad.length === n) okFn(name);
  }
  return bad;
}

const MUTANTS = [
  ["theme drops kept links", "theme.js", [["    keep.forEach(function (el) { nav.insertBefore(el, nav.firstChild); });\n", ""]]],
  ["theme keeps nothing", "theme.js", [['nav.querySelectorAll("[data-nav-keep]")', 'nav.querySelectorAll("[data-nothing]")']]],
  ["login header link not kept", "login.html", [['<a href="onboard.html" data-nav-keep>', '<a href="onboard.html">']]],
  ["login new-here link points at login", "login.html", [['<a href="onboard.html" id="open-a-queue">', '<a href="login.html" id="open-a-queue">']]],
  ["login new-here link removed", "login.html", [['New here? <a href="onboard.html" id="open-a-queue">Open a free Queue</a>', "New here?"]]],
  ["login circular hint back", "login.html", [["Already have a shop name and code?", "No password yet?"]]],
  ["You card shows to strangers", "account.html", [['<div class="card" id="you-card" hidden>', '<div class="card" id="you-card">']]],
  ["You card never opens", "account.html", [['      document.getElementById("you-card").hidden=false;\n', ""]]],
  ["Save profile outside You card", "account.html", [['      <p style="margin:10px 0 0"><button class="go" type="button" id="save-you">Save profile</button></p>\n', ""], ['    <div class="card" id="aia-wallet"></div>', '    <p><button class="go" type="button" id="save-you">Save profile</button></p>\n    <div class="card" id="aia-wallet"></div>']]],
  ["A18 account heading back to Open the account", "account.html", [["<h1>Your account</h1>", "<h1>Open the account</h1>"]]],
  ["A18 sign-in box heading back to Open the account", "account.html", [["<h2>Sign in first</h2>", "<h2>Open the account</h2>"]]],
  ["A18 sign-in button back to Open the account", "account.html", [['<button class="go" type="submit">Sign in</button>', '<button class="go" type="submit">Open the account</button>']]],
  ["email placeholder shop", "account.html", [['placeholder="you@example.com"', 'placeholder="you@shop.com"']]],
  ["phone placeholder real", "account.html", [['placeholder="e.g. 555-123-4567"', 'placeholder="417-555-0100"']]],
  ["city placeholder real", "account.html", [['placeholder="e.g. Your town"', 'placeholder="Springfield"']]],
  ["account intro address back", "account.html", [["Create .aia email for automations once you are signed in.", "Create .aia email for automations — james-ai@funditaway.aia."]]],
  ["desks handle placeholder james", "desks.html", [['placeholder="e.g. yourname.aia"', 'placeholder="james.aia"']]],
  ["aia-mail gate address back", "aia-mail.js", [["Sign in to create addresses like helper-ai@yourname.aia", "Open this account to create james-ai@funditaway.aia"]]],
  ["soon door not disabled", "login-doors.js", [[' disabled aria-disabled=\\"true\\"', ""]]],
  ["soon group open", "login-doors.js", [['<details class=\\"oauth-more\\" data-group=\\"soon\\">', '<details class=\\"oauth-more\\" data-group=\\"soon\\" open>']]],
  ["soon tag says Hold", "login-doors.js", [["Coming soon</span>", "Hold</span>"]]],
  ["hold doors look live", "login-doors.js", [['return p.status === "live";', 'return p.status !== "ask";']]],
  ["click ignores disabled", "login-doors.js", [["if (!btn || btn.disabled) return;", "if (!btn) return;"]]],
  ["click starts any door", "login-doors.js", [["if (row && isLive(row)) start(id);", "start(id);"]]]
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
  const apiFreeze = require("./_api-freeze").check(root);
  ok(apiFreeze.ok, "api/ frozen vs " + String(apiFreeze.base || "").slice(0, 8) + " (string-only allowlist)" + (apiFreeze.ok ? "" : ": " + apiFreeze.problems.join("; ")));
  const pkg = read("package.json");
  ok(/check-ux-signin\.js/.test(pkg), "npm test runs check-ux-signin.js");
  ["login-doors.js", "login.html", "account.html"].forEach((f) => {
    ok(!/checkout|charge\(|\/api\/pay|process\.env/i.test(read(f).replace(/never send, stop, pay, or draft/g, "")), f + " has no pay or checkout wiring");
  });
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
  if (failed) { console.error("check-ux-signin: " + passed + " ok, " + failed + " failed"); process.exit(1); }
  console.log("check-ux-signin: " + passed + " ok, 0 failed");
}
main().catch((e) => { console.error("FAIL " + (e && e.stack || e)); process.exit(1); });
