#!/usr/bin/env node
require("./_env-guard");
// Tap targets + header, UI only.
// Every tappable thing is at least 44px tall and 44px wide (header nav, footer links with padding, short .btn links, the 'i' info
// buttons, the theme toggle, summaries, chips, /help links), the phone tab bar never covers the
// footer, the header says "Sign in to your Queue" once (and "Open a Queue" once on /login), the
// stray bold full-width line on home is gone, and the theme toggle has a plain label.
// Each rule is run once on the real files, then against mutants that each must be caught.
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
const FILES = ["theme.js", "theme.css", "phone-clear.css", "ui-fix.css", "login.html"];
const SRC = {};
FILES.forEach((f) => { SRC[f] = read(f); });

// ---------- tiny CSS reader ----------
function rules(css) {
  const out = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0, media = "";
  const stack = [];
  let buf = "";
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "{") {
      const sel = buf.trim(); buf = "";
      if (/^@/.test(sel)) { stack.push(sel); continue; }
      const end = src.indexOf("}", i);
      out.push({ media: stack.join(" "), sel, body: src.slice(i + 1, end) });
      i = end;
    } else if (c === "}") { stack.pop(); buf = ""; }
    else buf += c;
  }
  return out;
}
function decl(body, prop) {
  const m = body.match(new RegExp("(?:^|;|\\s)" + prop + "\\s*:\\s*([^;]+)"));
  return m ? m[1].trim() : null;
}
function px(v) { const m = String(v || "").match(/^(-?\d+(?:\.\d+)?)px/); return m ? +m[1] : null; }
function sels(r) {
  const out = []; let depth = 0, cur = "";
  for (const c of r.sel) { if (c === "(") depth++; if (c === ")") depth--; if (c === "," && !depth) { out.push(cur.trim()); cur = ""; } else cur += c; }
  out.push(cur.trim());
  return out;
}
function findRule(css, wanted, prop, test) {
  return rules(css).some((r) => sels(r).indexOf(wanted) >= 0 && test(decl(r.body, prop), r));
}
function lastDecl(css, wanted, prop) {
  let v = null;
  rules(css).forEach((r) => { if (!r.media && sels(r).indexOf(wanted) >= 0) { const d = decl(r.body, prop); if (d !== null) v = d; } });
  return v;
}
function atLeast44(v) { return px(v) !== null && px(v) >= 44 && /!important/.test(v); }

function checkCss(S, bad) {
  const css = S["theme.css"];
  [["header .site-nav a", "header nav"], [".site-foot a", "footer links"], ["button.aia-tip", "'i' info buttons"],
   ["header .theme-btn", "theme toggle"], ["summary", "summaries"], ["button", "buttons and chips"],
   [".aia-playbook .pb-go", "playbook links"], [".aia-playbook .pb-also", "playbook side links"],
   [".who-chip", "account chip"], [".more-go", "/more tiles"]].forEach(([sel, what]) => {
    if (!findRule(css, sel, "min-height", atLeast44)) bad(what + " (" + sel + ") must have min-height 44px !important in theme.css");
  });
  if (!findRule(css, "button.aia-tip", "width", atLeast44) || !findRule(css, "button.aia-tip", "height", atLeast44)) bad("'i' buttons must be 44px wide and tall");
  if (!findRule(css, ".site-foot a", "padding", (v) => v && /\d/.test(v) && !/^0(px)?\s*!?/.test(v) || (v && /^0 \d+px/.test(v)))) bad("footer links must have padding");
  if (!findRule(css, ".site-foot a", "padding", (v) => !!v && px(v.split(/\s+/)[1]) >= 8)) bad("footer links need at least 8px side padding");
  // list links on /help and elsewhere: full-height rows
  if (!findRule(css, "main li > a:not([class])", "padding-block", (v) => px(v) >= 11)) bad("links in lists must get 11px padding-block (44px rows)");
  if (!findRule(css, "main li > a:not([class])", "display", (v) => v === "inline-block")) bad("links in lists must be inline-block so the padding counts");
  if (!findRule(css, "main li > a:not([class])", "min-height", (v) => px(v) >= 44)) bad("links in lists need min-height 44px");
  // links in sentences: 44px hit without moving lines
  const inl = rules(css).find((r) => /body :is\(p,/.test(r.sel));
  if (!inl) bad("links inside sentences need a 44px hit rule");
  else {
    if (px(decl(inl.body, "padding-block")) < 11) bad("sentence links need 11px padding-block");
    if (px(decl(inl.body, "margin-block")) !== -11) bad("sentence links must cancel the padding with -11px margin-block so lines do not move");
    if (px(decl(inl.body, "min-height")) < 44) bad("sentence links need min-height 44px for small text");
  }
  // The last word on display wins: a sentence or list link that goes back to display:inline loses its 44px box.
  const SENT = "body :is(p, small, td, label, span, div, h2, h3, nav) > a:not([class])";
  [[SENT, "links inside sentences"], ["main li > a:not([class])", "links in lists"]].forEach(([sel, what]) => {
    const last = lastDecl(css, sel, "display");
    if (last !== "inline-block") bad(what + " must stay display:inline-block (last rule says " + last + ")");
  });
  // Width floor: short links and chips are at least 44px wide as well as tall.
  [["header .site-nav a", "header nav"], [".site-foot a", "footer links"], ["button", "buttons and chips"], ["summary", "summaries"],
   [".who-chip", "account chip"], [".more-go", "/more tiles"], [".aia-playbook .pb-go", "playbook links"], [".aia-playbook .pb-also", "playbook side links"],
   ["main li > a:not([class])", "links in lists"], ["main dd > a:not([class])", "links in definition lists"], [SENT, "links inside sentences"]].forEach(([sel, what]) => {
    const w = lastDecl(css, sel, "min-width");
    if (!(px(w) >= 44)) bad(what + " (" + sel + ") need min-width 44px (got " + w + ")");
  });
  // Button links with a short label ("Talk" on /examples is a.btn.quiet) get the width floor too.
  const btnW = lastDecl(css, "a.btn", "min-width");
  if (!(px(btnW) >= 44)) bad("button links with a short label (a.btn, like 'Talk' on /examples) need min-width 44px (got " + btnW + ")");
  // phone tab bar vs footer
  const foot = rules(css).find((r) => /max-width:\s*859px/.test(r.media) && sels(r).indexOf("body.has-desk-nav .site-foot") >= 0);
  if (!foot) bad("phone rule for .site-foot above #desk-nav missing");
  else {
    const mb = decl(foot.body, "margin-bottom") || "";
    const pb = decl(foot.body, "padding-bottom") || "";
    if (!/safe-area-inset-bottom/.test(mb) || !/safe-area-inset-bottom/.test(pb)) bad("footer spacing must include the phone safe area");
    const n = mb.match(/calc\((\d+)px/);
    if (!n || +n[1] < 72) bad("footer must clear the tab bar (margin-bottom >= 72px + safe area)");
  }
  // nothing shrinks the toggle or tips back under 44px with !important
  ["theme.css", "phone-clear.css", "ui-fix.css"].forEach((f) => {
    rules(S[f]).forEach((r) => {
      if (!/theme-btn|aia-tip|site-foot|site-nav|who-chip/.test(r.sel)) return;
      ["min-height", "height"].forEach((prop) => {
        const v = decl(r.body, prop);
        if (v && /!important/.test(v) && px(v) !== null && px(v) < 44) bad(f + " forces " + r.sel + " to " + prop + " " + v);
      });
    });
  });
  // stray bold full-width line on home
  rules(S["ui-fix.css"]).forEach((r) => {
    if (sels(r).some((s) => /queue-home-link/.test(s))) {
      const fl = decl(r.body, "flex") || "";
      if (/100%/.test(fl) || /^1 1/.test(fl)) bad("ui-fix.css makes .queue-home-link a full-width line (" + fl + ")");
      const fw = decl(r.body, "font-weight") || "";
      if (+fw >= 800) bad("ui-fix.css paints .queue-home-link as a heavy bold line (" + fw + ")");
    }
  });
}

// ---------- tiny DOM for theme.js ----------
function El(tag) {
  this.tagName = String(tag || "div").toUpperCase();
  this.id = ""; this.attrs = {}; this.children = []; this.style = {}; this.className = ""; this.textContent = "";
  this._html = ""; this.title = ""; this.href = "";
  const self = this;
  this.classList = {
    add() { [].slice.call(arguments).forEach((c) => { if (!self.classList.contains(c)) self.className = (self.className + " " + c).trim(); }); },
    remove() { const rm = [].slice.call(arguments); self.className = self.className.split(/\s+/).filter((c) => c && rm.indexOf(c) < 0).join(" "); },
    contains(c) { return (" " + self.className + " ").indexOf(" " + c + " ") >= 0; },
    toggle() {}
  };
}
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return k in this.attrs ? this.attrs[k] : null; };
El.prototype.hasAttribute = function (k) { return k in this.attrs; };
El.prototype.appendChild = function (c) {
  if (c.parentNode && c.parentNode !== this) c.parentNode.removeChild(c);
  this.children = this.children.filter((x) => x !== c); this.children.push(c); c.parentNode = this; return c;
};
function walk(el, fn) { if (fn(el)) return el; for (const c of el.children) { const f = walk(c, fn); if (f) return f; } return null; }
El.prototype.removeChild = function (c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; };
El.prototype.querySelector = function () { return null; };
El.prototype.querySelectorAll = function () { return []; };
Object.defineProperty(El.prototype, "innerHTML", { get() { return this._html; }, set(v) { this._html = String(v); } });
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
function store(init) {
  const m = Object.assign({}, init || {});
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
}
function visibleText(el) {
  if (!el || (el.style && el.style.display === "none") || el.hidden) return "";
  return (el.textContent || "") + " " + String(el._html || "").replace(/<[^>]+>/g, " ") + " " + el.children.map(visibleText).join(" ");
}
function count(hay, needle) { return hay.split(needle).length - 1; }

function header(S, page, ls, withKeep) {
  const names = ["label", "accountChip", "liftChrome", "esc", "roleLabel", "picHtml", "initials", "photoSrc", "paintWho", "queueHome", "paintQueueHome", "isEmbed"];
  const code = names.map((n) => grabFn(S["theme.js"], n) || "").join("\n");
  const hdr = new El("header");
  const els = {};
  let keep = null;
  if (withKeep) {
    keep = new El("a"); keep.attrs = { href: "onboard.html", "data-nav-keep": "" }; keep.textContent = "Open a Queue";
    hdr.appendChild(keep);
  }
  hdr.querySelector = (sel) => {
    if (/data-nav-keep/.test(sel)) return keep;
    if (/who-chip/.test(sel)) return walk(hdr, (c) => c !== hdr && c.classList.contains("who-chip"));
    if (sel === ".hdr-tools") return walk(hdr, (c) => c !== hdr && c.classList.contains("hdr-tools"));
    return null;
  };
  const document = {
    body: new El("body"),
    querySelector: (sel) => (/^header/.test(sel) ? hdr : null),
    querySelectorAll: () => [],
    getElementById: (id) => walk(hdr, (c) => c.id === id) || els[id] || null,
    createElement: (t) => new El(t)
  };
  const ctx = { document, localStorage: store(ls), window: {}, pageName: () => page };
  vm.runInNewContext(code + "\npaintWho(); paintQueueHome();", ctx, { timeout: 1000 });
  return { hdr, text: visibleText(hdr), keep };
}

function checkHeader(S, bad) {
  const out = header(S, "index", {}, false);
  const n = count(out.text, "Sign in to your Queue");
  if (n !== 1) bad("signed-out header must say 'Sign in to your Queue' once (said it " + n + " times)");
  if (walk(out.hdr, (c) => c.id === "queue-home-link")) bad("signed-out header must not add a second sign-in link");
  const on = header(S, "index", { aia_ws: "north", aia_pin: "x" }, false);
  const q = walk(on.hdr, (c) => c.id === "queue-home-link");
  if (!q || q.textContent !== "Open my Queue" || q.href !== "/desk") bad("signed-in header must keep 'Open my Queue' -> /desk");
  if (count(on.text, "Sign in to your Queue") !== 0) bad("signed-in header must not say Sign in");
  const lg = header(S, "login", {}, true);
  const m = count(lg.text, "Open a Queue");
  if (m !== 1) bad("/login header must say 'Open a Queue' once at desktop width (said it " + m + " times)");
  if (count(lg.text, "Sign in to your Queue") !== 0) bad("/login header must not ask you to sign in while you are on the sign-in page");
  const lg0 = header(S, "login", {}, false);
  if (count(lg0.text, "Open a Queue") !== 1) bad("/login without its own header link must still offer 'Open a Queue' once");
  const after = header(S, "index", {}, false);
  const chip = walk(after.hdr, (c) => c !== after.hdr && c.classList.contains("who-chip"));
  if (!chip || chip.style.display === "none" || !/Sign in to your Queue/.test(chip._html)) bad("account chip must stay visible off /login");
  // the real login page carries the kept header link the dedupe relies on
  const lh = (S["login.html"].match(/<header[\s\S]*?<\/header>/) || [""])[0];
  if (!/<a href="onboard\.html" data-nav-keep>Open a Queue<\/a>/.test(lh)) bad("login.html header must keep its 'Open a Queue' link");
}

function checkLabel(S, bad) {
  const apply = grabFn(S["theme.js"], "apply");
  if (!apply) { bad("theme.js apply() missing"); return; }
  ["system", "dark", "light"].forEach((t) => {
    const btn = new El("button");
    const doc = {
      documentElement: new El("html"), querySelector: () => null,
      querySelectorAll: (sel) => (/theme-btn/.test(sel) ? [btn] : [])
    };
    doc.documentElement.classList.toggle = () => {};
    const ctx = { document: doc, localStorage: store({ aia_theme: t }), window: { matchMedia: () => ({ matches: false }) }, paintMarks: () => {} };
    vm.runInNewContext([grabFn(S["theme.js"], "systemDark"), grabFn(S["theme.js"], "isDark"), grabFn(S["theme.js"], "label"), apply, "apply();"].join("\n"), ctx, { timeout: 1000 });
    const want = { system: "Theme: Auto", dark: "Theme: Dark", light: "Theme: Light" }[t];
    if (btn.textContent !== want) bad("theme toggle must read '" + want + "' (got '" + btn.textContent + "')");
    if (!/^Theme: /.test(btn.getAttribute("aria-label") || "")) bad("theme toggle aria-label must start with 'Theme: '");
    if (t === "system" && !/follows your device/.test(btn.title || "")) bad("Auto must explain it follows your device");
  });
}

async function suite(S, okFn) {
  const bad = [];
  const b = (m) => bad.push(m);
  const steps = [["tap floor CSS", () => checkCss(S, b)], ["one sign-in in the header", () => checkHeader(S, b)], ["plain theme label", () => checkLabel(S, b)]];
  for (const [name, fn] of steps) {
    const n = bad.length;
    try { await fn(); } catch (e) { bad.push(name + " threw " + e.message); }
    if (okFn && bad.length === n) okFn(name);
  }
  return bad;
}

const MUTANTS = [
  ["nav links under 44", "theme.css", [["header .site-nav a, header nav.site-nav a, .site-header .site-nav a {\n  display: inline-flex !important;\n  align-items: center;\n  min-height: 44px !important;", "header .site-nav a, header nav.site-nav a, .site-header .site-nav a {\n  display: inline-flex !important;\n  align-items: center;\n  min-height: 20px !important;"]]],
  ["footer links lose padding", "theme.css", [["  padding: 0 10px !important;\n}", "  padding: 0 !important;\n}"]]],
  ["info buttons back to 22px", "theme.css", [["  width: 44px !important;\n  height: 44px !important;", "  width: 22px !important;\n  height: 22px !important;"]]],
  ["theme pill 40px", "theme.css", [["header .theme-btn, .site-header .theme-btn, button.theme-btn, [data-theme-btn] {\n  min-height: 44px !important;", "header .theme-btn, .site-header .theme-btn, button.theme-btn, [data-theme-btn] {\n  min-height: 40px !important;"]]],
  ["phone-clear shrinks pill", "phone-clear.css", [["    min-width: 3.6em !important;\n    min-height: 44px !important;", "    min-width: 3.6em !important;\n    min-height: 40px !important;"]]],
  ["chips and summaries not floored", "theme.css", [["button, [role=\"button\"], select, summary, .who-chip, .queue-home-link, .more-go {\n  min-height: 44px !important;", "button, [role=\"button\"], select, summary, .who-chip, .queue-home-link, .more-go {\n  min-height: 36px !important;"]]],
  ["playbook links 36px", "theme.css", [[".aia-playbook .pb-go, .aia-playbook .pb-also {\n  display: inline-flex !important;\n  align-items: center;\n  min-height: 44px !important;", ".aia-playbook .pb-go, .aia-playbook .pb-also {\n  display: inline-flex !important;\n  align-items: center;\n  min-height: 36px !important;"]]],
  ["help list links stay short", "theme.css", [["  display: inline-block;\n  box-sizing: border-box;\n  min-height: 44px;\n  padding-block: 11px;\n  line-height: 22px;", "  display: inline;\n  padding-block: 0;\n  line-height: 22px;"]]],
  ["sentence links move lines", "theme.css", [["  margin-block: -11px;", "  margin-block: 0;"]]],
  ["small-text links 40px", "theme.css", [["  min-height: 44px;\n  padding-block: 11px;\n  margin-block: -11px;", "  padding-block: 11px;\n  margin-block: -11px;"]]],
  ["tab bar covers footer", "theme.css", [["    margin-bottom: calc(84px + env(safe-area-inset-bottom, 0px)) !important;", "    margin-bottom: 0 !important;"]]],
  ["footer ignores safe area", "theme.css", [["    padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)) !important;", "    padding-bottom: 16px !important;"]]],
  ["stray bold line back", "ui-fix.css", [[".queue-home-link{font-weight:700;text-decoration:none;display:inline-flex;align-items:center;min-height:44px;padding:0 8px;flex:0 0 auto}", ".queue-home-link{font-weight:800;text-decoration:none}\n@media (max-width: 640px) {\n  .queue-home-link { flex: 1 1 100%; }\n}"]]],
  ["signed-out header says sign in twice", "theme.js", [["    if (home.href === \"/login\") {", "    if (home.href === \"/nowhere\") {"]]],
  ["login says Open a Queue twice", "theme.js", [["      if (own && own !== chip && /Open a Queue/.test(own.textContent || \"\")) {", "      if (false) {"]]],
  ["chip removed everywhere", "theme.js", [["    chip.innerHTML = '<span class=\"who-copy\"><strong>Sign in to your Queue</strong></span>';\n    chip.href = \"/login\";\n    chip.title = \"Desk name + code\";", "    if (chip.parentNode) chip.parentNode.removeChild(chip);\n    return;"]]],
  ["signed-in Queue link dropped", "theme.js", [["    link.textContent = home.label;", "    link.textContent = \"\";"]]],
  ["theme label bare Auto", "theme.js", [["      b.textContent = \"Theme: \" + label();", "      b.textContent = label();"]]],
  ["Auto not explained", "theme.js", [["\"Theme: Auto follows your device. Tap to change.\"", "\"Theme: Auto. Tap to change.\""]]],
  ["sentence links back to inline", "theme.css", [["  display: inline-block;\n  box-sizing: border-box;\n  min-height: 44px;\n  padding-block: 11px;\n  margin-block: -11px;", "  display: inline;\n  box-sizing: border-box;\n  min-height: 44px;\n  padding-block: 11px;\n  margin-block: -11px;"]]],
  ["later rule makes sentence links inline", "theme.css", [["/* 2026-10-31 width floor:", "body :is(p, small, td, label, span, div, h2, h3, nav) > a:not([class]) { display: inline; }\n/* 2026-10-31 width floor:"]]],
  ["no width floor", "theme.css", [["header .site-nav a, header nav.site-nav a, .site-header .site-nav a, .site-foot a, .site-foot nav a, footer nav a,\nbutton, [role=\"button\"], summary, .who-chip, .queue-home-link, .more-go,\n.aia-playbook .pb-go, .aia-playbook .pb-also,\nmain li > a:not([class]), .wrap li > a:not([class]), main dd > a:not([class]),\nbody :is(p, small, td, label, span, div, h2, h3, nav) > a:not([class]) {\n  min-width: 44px;", "header .site-nav a, header nav.site-nav a, .site-header .site-nav a, .site-foot a, .site-foot nav a, footer nav a,\nbutton, [role=\"button\"], summary, .who-chip, .queue-home-link, .more-go,\n.aia-playbook .pb-go, .aia-playbook .pb-also,\nmain li > a:not([class]), .wrap li > a:not([class]), main dd > a:not([class]),\nbody :is(p, small, td, label, span, div, h2, h3, nav) > a:not([class]) {\n  min-width: 0;"]]],
  ["width floor 30px", "theme.css", [["  min-width: 44px;\n  box-sizing: border-box;\n}\nheader .site-nav a, .site-foot a,", "  min-width: 30px;\n  box-sizing: border-box;\n}\nheader .site-nav a, .site-foot a,"]]],
  ["width floor skips chips", "theme.css", [["button, [role=\"button\"], summary, .who-chip, .queue-home-link, .more-go,\n.aia-playbook", "[role=\"button\"], summary, .who-chip, .queue-home-link, .more-go,\n.aia-playbook"]]],
  ["width floor skips sentence links", "theme.css", [["main dd > a:not([class]),\nbody :is(p, small, td, label, span, div, h2, h3, nav) > a:not([class]) {\n  min-width: 44px;", "main dd > a:not([class]) {\n  min-width: 44px;"]]],
  ["short .btn label under 44 wide", "theme.css", [["a.btn {\n  min-width: 44px;", "a.btn {\n  min-width: 32px;"]]],
  ["short .btn label not floored", "theme.css", [["a.btn {\n  min-width: 44px;\n  box-sizing: border-box;\n", "a.btn {\n  box-sizing: border-box;\n"]]],
  ["width floor skips footer", "theme.css", [["header .site-nav a, header nav.site-nav a, .site-header .site-nav a, .site-foot a, .site-foot nav a, footer nav a,\nbutton,", "header .site-nav a, header nav.site-nav a, .site-header .site-nav a,\nbutton,"]]],
  ["ui-fix pill back to 40px", "ui-fix.css", [["    height: 44px !important;\n    min-height: 44px !important;\n    padding: 0 12px !important;\n    font-size: 13px !important;", "    height: 40px !important;\n    min-height: 40px !important;\n    padding: 0 12px !important;\n    font-size: 13px !important;"]]],
  ["ui-fix chip back to 40px", "ui-fix.css", [["    min-height: 44px !important;\n    height: 44px;\n    padding: 0 12px !important;", "    min-height: 40px !important;\n    height: 40px;\n    padding: 0 12px !important;"]]],
  ["login header link lost", "login.html", [["<a href=\"onboard.html\" data-nav-keep>Open a Queue</a>", "<a href=\"onboard.html\">Open a Queue</a>"]]]
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
  ok(/check-ux-tap-header\.js/.test(read("package.json")), "npm test runs check-ux-tap-header.js");
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
  if (failed) { console.error("check-ux-tap-header: " + passed + " ok, " + failed + " failed"); process.exit(1); }
  console.log("check-ux-tap-header: " + passed + " ok, 0 failed");
}
main().catch((e) => { console.error("FAIL " + (e && e.stack || e)); process.exit(1); });
