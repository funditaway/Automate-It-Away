#!/usr/bin/env node
require("./_env-guard");
// My account -> Sign-in (Two-factor, Backup codes, Signed-in devices). Page side only, no network.
// Runs the real account-security.js in a small DOM stub with fake GET /api/account replies and checks:
// the exact words; no button, input, link, or click handler (no setup control and no request on a
// click); one GET /api/account and nothing else on load (no POST/PUT/DELETE, no localStorage write,
// no HTML strings); the devices list reads only sessionPublic fields (current, workspace, seenAt,
// createdAt, accountId) and shows only rows whose accountId is this account's id; a stranger, a failed
// read, or another account's home shows nothing; no claim words. account.html mounts it hidden.
// Built-in mutants (each must fail the suite): node scripts/check-account-security.js --mutants
// It rides the npm test through scripts/check-account-settings.js (package.json is not touched).
// usage: node scripts/check-account-security.js [--mutants] [repoRoot]
process.env.TZ = "America/Chicago";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const args = process.argv.slice(2);
const MUTANTS = args.indexOf("--mutants") >= 0;
const root = path.resolve(args.filter((a) => a !== "--mutants")[0] || path.join(__dirname, ".."));
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const WORDS = {
  TITLE: "Sign-in",
  TWO_FACTOR: "Two-factor: not set up yet.",
  CODES: "Backup codes",
  NONE: "None yet.",
  DEVICES: "Signed-in devices",
  THIS_ONE: "This device",
  OTHER: "Other device",
  SEEN: "Seen "
};
const ALLOWED_ROW_FIELDS = ["accountId", "current", "workspace", "seenAt", "createdAt"];
const BANNED = /secur|bank-grade|unhackable|\bsafe|protect|guarant|encrypt|military|bulletproof|\bHOLD\b|\bSHA\b|\bmint|2FA|\bMFA\b|TOTP|\bOTP\b|charge|\bpay|price|\bbill|\bfee|\$|legal|\bterms\b|warrant|liab/i;
// 11:05 PM Central on Nov 18, 2026 and 9:30 AM Central on Nov 20, 2026.
const T1 = "2026-11-19T05:05:00.000Z";
const T2 = "2026-11-20T15:30:00.000Z";
const EVIL = '<img src=x onerror="alert(1)">';

function suite(SRC, HTML, LIB) {
  const fails = [];
  let passes = 0;
  function ok(cond, msg) { if (cond) passes += 1; else fails.push(msg); }
  function eq(label, got, want) {
    const a = JSON.stringify(got), b = JSON.stringify(want);
    if (a === b) passes += 1; else fails.push(label + "\n    got  " + a + "\n    want " + b);
  }
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // 0. account.html mounts it hidden, once, after account-follow.js; nothing else on the page changed shape.
  ok((HTML.match(/<section id="acct-security" aria-label="Sign-in" hidden><\/section>/g) || []).length === 1, "account.html has one hidden #acct-security mount labelled Sign-in");
  ok((HTML.match(/<script src="account-security\.js"><\/script>/g) || []).length === 1, "account.html loads account-security.js once");
  ok(HTML.indexOf('<script src="account-follow.js"></script>') >= 0 && HTML.indexOf('<script src="account-security.js"></script>') > HTML.indexOf('<script src="account-follow.js"></script>'), "account-security.js loads after account-follow.js");
  ok(HTML.indexOf('id="mfa-card"') >= 0 && HTML.indexOf('id="phones"') >= 0, "the existing Authenticator and Phones cards are still on the page");

  // 1. Exact words, declared once each.
  Object.keys(WORDS).forEach((k) => {
    ok(new RegExp("var " + k + " = " + JSON.stringify(WORDS[k]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ";").test(SRC), "account-security.js declares " + k + " = " + JSON.stringify(WORDS[k]));
  });
  const literals = (CODE.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`/g) || []).map((s) => s.slice(1, -1));
  const known = new Set(Object.keys(WORDS).map((k) => WORDS[k]).concat([
    "use strict", "acct-security", "aia_ws", "aia_session", "aia_pin", "X-Workspace", "X-Session", "X-Pin",
    "card", "h2", "h3", "p", "meta", "div", "item", "strong", "", "0", "-", " ", ":", " · ", "acct-security-devices",
    "/api/account", "GET", "string", "object"
  ]));
  const odd = literals.filter((s) => !known.has(s));
  eq("account-security.js has no string literal outside the known words and names", odd, []);
  ok(!/`/.test(CODE), "account-security.js has no template literal");

  // 2. Code shape: no HTML strings, no writes, no other request, no controls, no handlers.
  ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment/.test(CODE), "account-security.js writes no HTML");
  ok(!/setItem|removeItem|\.clear\s*\(|sessionStorage|indexedDB|document\.cookie|caches\./.test(CODE), "account-security.js writes nothing on this phone");
  ok(!/\b(POST|PUT|DELETE|PATCH)\b|XMLHttpRequest|sendBeacon|WebSocket|EventSource|navigator\.|\.submit\s*\(|location\s*\.|location\s*=/.test(CODE), "account-security.js sends no write and opens no other channel");
  eq("account-security.js has exactly one fetch", (CODE.match(/\bfetch\s*\(/g) || []).length, 1);
  ok(/fetch\("\/api\/account", \{ method: "GET", headers: hdr\(\) \}\)/.test(CODE), "the one fetch is GET /api/account with no body");
  ok(!/addEventListener|\.on[a-z]+\s*=|onclick|"button"|'button'|"input"|"a"|"form"|disabled|\.click\s*\(/.test(CODE), "account-security.js makes no button, input, link, or click handler");

  // 3. The fields it reads exist on sessionPublic in api/_lib.js (no new field).
  const sp = (LIB.match(/function sessionPublic\(row, token\) \{[\s\S]*?\n\}/) || [""])[0];
  ALLOWED_ROW_FIELDS.forEach((f) => ok(new RegExp("\\b" + f + ":").test(sp), "sessionPublic has " + f));

  return { fails, get passes() { return passes; }, ok, eq };
}

// ---------- DOM stub ----------
function makeWorld(SRC, opts) {
  const rec = { fetches: [], writes: [], html: 0, handlers: 0, onProps: 0, rowReads: [] };
  function makeEl(tag) {
    const el = {
      tagName: String(tag).toLowerCase(), className: "", id: "", parts: [], hidden: false, attrs: {},
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
      appendChild(c) { if (!c || !c.tagName) throw new TypeError("appendChild needs a node"); c.parentNode = this; this.parts.push(c); return c; },
      removeChild(c) { this.parts = this.parts.filter((p) => p !== c); return c; },
      addEventListener() { rec.handlers += 1; },
      set textContent(v) { this.parts = [{ text: String(v == null ? "" : v) }]; },
      get textContent() { return this.parts.map((p) => p.text !== undefined ? p.text : p.textContent).join(""); },
      get firstChild() { return this.parts[0] || null; }
    };
    ["innerHTML", "outerHTML"].forEach((k) => Object.defineProperty(el, k, { set(v) { rec.html += 1; el.parts = [{ text: String(v) }]; }, get() { return ""; } }));
    el.insertAdjacentHTML = function () { rec.html += 1; };
    el.click = function () { rec.clicks = (rec.clicks || 0) + 1; };
    return new Proxy(el, { set(t, k, v) { if (/^on/.test(String(k))) rec.onProps += 1; t[k] = v; return true; } });
  }
  const mount = makeEl("section"); mount.id = "acct-security"; mount.hidden = true;
  const store = Object.assign({}, opts.store || {});
  const document = {
    getElementById(id) { return id === "acct-security" ? mount : null; }, createElement: makeEl,
    write() { rec.html += 1; }, get cookie() { return ""; }, set cookie(v) { rec.writes.push("cookie"); }
  };
  function watchRow(row) {
    if (!row || typeof row !== "object") return row;
    return new Proxy(row, { get(t, k) { if (typeof k === "string") rec.rowReads.push(k); return t[k]; } });
  }
  const ctx = {
    document, console: { log() {}, info() {}, warn() {}, error() {}, debug() {} }, Date, JSON, Array, Object, String, Promise, isFinite, setTimeout,
    localStorage: {
      getItem(k) { return k in store ? store[k] : null; },
      setItem(k) { rec.writes.push("set:" + k); }, removeItem(k) { rec.writes.push("remove:" + k); }, clear() { rec.writes.push("clear"); }
    },
    sessionStorage: { getItem() { return null; }, setItem(k) { rec.writes.push("session:" + k); }, removeItem(k) { rec.writes.push("session-remove:" + k); } },
    navigator: { sendBeacon() { rec.fetches.push({ url: "beacon", method: "BEACON" }); return true; } },
    XMLHttpRequest: function () { rec.fetches.push({ url: "xhr", method: "XHR" }); this.open = function () {}; this.send = function () {}; this.setRequestHeader = function () {}; },
    fetch(url, init) {
      init = init || {};
      rec.fetches.push({ url: String(url), method: String(init.method || "GET").toUpperCase(), body: init.body === undefined ? null : init.body, headers: Object.assign({}, init.headers || {}) });
      const reply = typeof opts.reply === "function" ? opts.reply(String(url), init) : opts.reply;
      if (reply === "reject") return Promise.reject(new Error("offline"));
      const r = reply || { status: 200, data: { ok: true } };
      return Promise.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, json() {
        if (r.badJson) return Promise.reject(new SyntaxError("bad json"));
        const d = r.data;
        if (d && Array.isArray(d.sessions)) return Promise.resolve(Object.assign({}, d, { sessions: d.sessions.map(watchRow) }));
        return Promise.resolve(d);
      } });
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: "account-security.js" });
  return { mount, rec, ctx };
}
function walk(el, fn) { fn(el); (el.parts || []).forEach((p) => { if (p.tagName) walk(p, fn); }); }
function find(el, pred) { const out = []; walk(el, (n) => { if (pred(n)) out.push(n); }); return out; }
const tick = () => new Promise((r) => setImmediate(r));
async function settle() { for (let i = 0; i < 16; i++) await tick(); }

const SIGNED = { aia_ws: "front-desk", aia_session: "tok-1" };
function home(extra) {
  return Object.assign({
    ok: true, product: "aia",
    account: { id: "acct_me", name: "My Shop", desks: ["front-desk"], mfaOn: false },
    you: { id: "p_owner", name: "Pat", role: "owner", accountId: "acct_me" },
    sessions: [
      { id: "sess_1", workspace: "front-desk", personId: "p_owner", accountId: "acct_me", role: "owner", name: "Pat", createdAt: T1, seenAt: T2, expiresAt: "", current: true, walletAddress: "", walletChainId: 0, ua: "Phone UA 1" },
      { id: "sess_2", workspace: "back-desk", personId: "p_bm", accountId: "acct_me", role: "member", name: "Pat", createdAt: T1, seenAt: "", expiresAt: "", current: false, walletAddress: "0xabc", walletChainId: 1 },
      { id: "sess_3", workspace: "their-desk", personId: "p_them", accountId: "acct_them", role: "owner", name: "Robin " + EVIL, createdAt: T1, seenAt: T2, current: true },
      { id: "sess_4", workspace: "nobody-desk", personId: "p_x", accountId: "", role: "member", name: "Nobody", createdAt: T1, seenAt: T2, current: false },
      null, "sess_5"
    ]
  }, extra || {});
}

async function scenarios(SRC, ok, eq) {
  function texts(mount, tag) { return find(mount, (n) => n.tagName === tag).map((n) => n.textContent); }
  function quiet(w, label) {
    eq(label + ": no localStorage, sessionStorage, or cookie write", w.rec.writes, []);
    eq(label + ": no HTML string", w.rec.html, 0);
    eq(label + ": no click handler", w.rec.handlers + w.rec.onProps, 0);
    const controls = find(w.mount, (n) => /^(button|input|select|textarea|a|form)$/.test(n.tagName));
    eq(label + ": no button, input, link, or form", controls.length, 0);
    w.rec.fetches.forEach((f) => ok(f.url === "/api/account" && f.method === "GET" && f.body === null, label + ": only GET /api/account with no body, got " + JSON.stringify(f)));
  }
  function empty(w, label) {
    ok(w.mount.hidden === true, label + ": section stays hidden");
    eq(label + ": section is empty", w.mount.parts.length, 0);
    quiet(w, label);
  }

  // Stranger: no sign-in on this phone. Nothing is asked and nothing shows.
  for (const [label, store] of [["stranger", {}], ["desk name only", { aia_ws: "front-desk" }], ["session but no desk", { aia_session: "tok-1" }]]) {
    const w = makeWorld(SRC, { store, reply: { status: 200, data: home() } });
    await settle();
    eq(label + ": no request", w.rec.fetches.length, 0);
    empty(w, label);
  }

  // Failed or wrong reads: nothing shows.
  const bad = [
    ["401", { status: 401, data: { ok: false, error: "Sign in again." } }],
    ["403 pending", { status: 403, data: { ok: false, pending: true, error: "That seat is waiting on the owner." } }],
    ["500", { status: 500, data: home() }],
    ["offline", "reject"],
    ["bad JSON", { status: 200, badJson: true }],
    ["ok false", { status: 200, data: home({ ok: false }) }],
    ["no account", { status: 200, data: home({ account: null }) }],
    ["account without id", { status: 200, data: home({ account: { name: "My Shop" } }) }],
    ["account id not a string", { status: 200, data: home({ account: { id: 7 } }) }],
    ["no sessions list", { status: 200, data: home({ sessions: undefined }) }],
    ["another account's home", { status: 200, data: home({ you: { id: "p_owner", accountId: "acct_other" } }) }]
  ];
  for (const [label, reply] of bad) {
    const w = makeWorld(SRC, { store: SIGNED, reply });
    await settle();
    eq(label + ": one request", w.rec.fetches.length, 1);
    empty(w, label);
  }

  // Signed in, good read.
  const w = makeWorld(SRC, { store: SIGNED, reply: { status: 200, data: home() } });
  await settle();
  eq("signed in: one request on load", w.rec.fetches.length, 1);
  eq("signed in: request headers are the sign-in already on this phone", w.rec.fetches[0] && w.rec.fetches[0].headers, { "X-Workspace": "front-desk", "X-Session": "tok-1" });
  ok(w.mount.hidden === false, "signed in: section shows");
  quiet(w, "signed in");
  eq("signed in: heading", texts(w.mount, "h2"), [WORDS.TITLE]);
  eq("signed in: sub headings", texts(w.mount, "h3"), [WORDS.CODES, WORDS.DEVICES]);
  eq("signed in: plain lines", texts(w.mount, "p"), [WORDS.TWO_FACTOR, WORDS.NONE]);
  const list = find(w.mount, (n) => n.id === "acct-security-devices")[0];
  ok(!!list, "signed in: devices list is there");
  const rows = list ? find(list, (n) => n.className === "item") : [];
  eq("signed in: devices are only this account's two rows, newest order kept", rows.map((r) => r.textContent), [
    WORDS.THIS_ONE + "front-desk · " + WORDS.SEEN + "2026-11-20 09:30",
    WORDS.OTHER + "back-desk · " + WORDS.SEEN + "2026-11-18 23:05"
  ]);
  const all = w.mount.textContent;
  ["their-desk", "Robin", "nobody-desk", "Nobody", "acct_", "sess_", "p_owner", "p_bm", "0xabc", "Phone UA", "tok-1", "Pat", "owner", "member", "img"].forEach((s) => {
    ok(all.indexOf(s) < 0, "signed in: screen does not show " + JSON.stringify(s));
  });
  const reads = Array.from(new Set(w.rec.rowReads)).sort();
  ok(reads.length > 0 && reads.every((k) => ALLOWED_ROW_FIELDS.indexOf(k) >= 0), "signed in: rows read only " + ALLOWED_ROW_FIELDS.join(", ") + ", got " + reads.join(","));
  eq("signed in: the whole screen word for word", all, [WORDS.TITLE, WORDS.TWO_FACTOR, WORDS.CODES, WORDS.NONE, WORDS.DEVICES,
    WORDS.THIS_ONE, "front-desk · " + WORDS.SEEN + "2026-11-20 09:30", WORDS.OTHER, "back-desk · " + WORDS.SEEN + "2026-11-18 23:05"].join(""));
  ok(!BANNED.test(all), "signed in: no claim, jargon, or money words on the screen");
  // Tap everything: still nothing more is asked.
  walk(w.mount, (n) => { if (typeof n.click === "function") n.click(); });
  await settle();
  eq("signed in: tapping the screen sends nothing", w.rec.fetches.length, 1);
  ok(typeof w.ctx.AIAAccountSecurity === "object" && Object.keys(w.ctx.AIAAccountSecurity).join(",") === "load", "only load is exposed");

  // Own rows only even when the current row belongs to someone else.
  const w2 = makeWorld(SRC, { store: { aia_ws: "front-desk", aia_pin: "1234" }, reply: { status: 200, data: home({ you: null, sessions: [
    { id: "sess_9", workspace: "their-desk", accountId: "acct_them", current: true, seenAt: T2 },
    { id: "sess_8", workspace: "front-desk", accountId: "acct_me", current: false, seenAt: T1 }
  ] }) } });
  await settle();
  const r2 = find(w2.mount, (n) => n.className === "item").map((r) => r.textContent);
  eq("desk code sign-in: another account's current row is left out", r2, [WORDS.OTHER + "front-desk · " + WORDS.SEEN + "2026-11-18 23:05"]);
  eq("desk code sign-in: headers", w2.rec.fetches[0] && w2.rec.fetches[0].headers, { "X-Workspace": "front-desk", "X-Pin": "1234" });
  quiet(w2, "desk code sign-in");

  // No own rows: the list says None yet. A missing time shows no time.
  const w3 = makeWorld(SRC, { store: SIGNED, reply: { status: 200, data: home({ sessions: [{ accountId: "acct_them", current: true, workspace: "x" }] }) } });
  await settle();
  eq("no own rows: list says None yet", find(w3.mount, (n) => n.id === "acct-security-devices")[0] ? find(w3.mount, (n) => n.id === "acct-security-devices")[0].textContent : null, WORDS.NONE);
  const w4 = makeWorld(SRC, { store: SIGNED, reply: { status: 200, data: home({ sessions: [{ accountId: "acct_me", current: true, workspace: EVIL, seenAt: "not a time" }] }) } });
  await settle();
  const r4 = find(w4.mount, (n) => n.className === "item").map((r) => r.textContent);
  eq("odd row: desk name is text, bad time is left out", r4, [WORDS.THIS_ONE + EVIL]);
  quiet(w4, "odd row");

  // Two-factor already on (the server cannot do that today): the not-set-up line is not shown.
  const w5 = makeWorld(SRC, { store: SIGNED, reply: { status: 200, data: home({ account: { id: "acct_me", mfaOn: true } }) } });
  await settle();
  ok(w5.mount.textContent.indexOf(WORDS.TWO_FACTOR) < 0, "two-factor on: the not-set-up line is not shown");
  // mfaOn as a string is not on.
  const w6 = makeWorld(SRC, { store: SIGNED, reply: { status: 200, data: home({ account: { id: "acct_me", mfaOn: "true" } }) } });
  await settle();
  ok(w6.mount.textContent.indexOf(WORDS.TWO_FACTOR) >= 0, "mfaOn \"true\" string still shows not set up");
}

// A mutant's stray promise must count as a failure, not crash the run.
let stray = 0;
process.on("unhandledRejection", () => { stray += 1; });
async function runAll(SRC, HTML, LIB, SETTINGS) {
  const s = suite(SRC, HTML, LIB);
  const staticCount = s.fails.length;
  const strayBefore = stray;
  try { await scenarios(SRC, s.ok, s.eq); } catch (e) { s.fails.push("scenario threw: " + (e && e.message)); }
  await settle();
  if (stray !== strayBefore) s.fails.push("a promise was left unhandled");
  s.runtime = s.fails.length - staticCount;
  s.ok(SETTINGS.indexOf("scripts/check-account-security.js") >= 0, "check-account-settings.js runs this check");
  const hook = proveSettingsHook(SETTINGS);
  s.ok(hook.ok, hook.ok ? "npm hook honors a failing child, a signal, and a spawn error" : ("npm hook self-test failed: " + hook.detail));
  return s;
}

function proveSettingsHook(SETTINGS) {
  const os = require("os");
  const { spawnSync } = require("child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aia-settings-hook-"));
  try {
    fs.writeFileSync(path.join(dir, "check-account-settings.js"), SETTINGS);
    fs.copyFileSync(path.join(__dirname, "_env-guard.js"), path.join(dir, "_env-guard.js"));
    const r = spawnSync(process.execPath, [path.join(dir, "check-account-settings.js"), "--prove-hook"], { encoding: "utf8", env: { PATH: process.env.PATH || "" }, timeout: 15000 });
    const out = String(r.stderr || "") + String(r.stdout || "");
    if (r.error) return { ok: false, detail: String(r.error) };
    if (typeof r.status !== "number" || r.status !== 0 || r.signal) return { ok: false, detail: (out.slice(0, 1500) || ("exit " + r.status + " signal " + r.signal)) };
    if (!/PASS check-account-settings hook/.test(r.stdout || "")) return { ok: false, detail: out.slice(0, 1500) || "missing PASS" };
    return { ok: true };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
}

const MUTATIONS = [
  ["setup button enabled", "account-security.js", [['    c.appendChild(el("h3", "", CODES));\n', '    c.appendChild(el("h3", "", CODES));\n    var b = el("button", "edit", "Make codes"); b.type = "button"; c.appendChild(b);\n']]],
  ["fetch on click", "account-security.js", [['    c.appendChild(el("h3", "", CODES));\n', '    c.appendChild(el("h3", "", CODES));\n    var k = el("p", "meta", NONE); k.onclick = function () { fetch("/api/account", { method: "POST", headers: hdr(), body: "{}" }); }; c.appendChild(k);\n']]],
  ["click handler via addEventListener", "account-security.js", [['    c.appendChild(list);\n', '    list.addEventListener("click", function () {});\n    c.appendChild(list);\n']]],
  ["another seat's devices shown", "account-security.js", [["return s && typeof s === \"object\" && s.accountId === id;", "return s && typeof s === \"object\";"]]],
  ["you.accountId guard dropped", "account-security.js", [["if (you && typeof you.accountId === \"string\" && you.accountId && you.accountId !== id) return null;", ""]]],
  ["banned word added", "account-security.js", [['var TWO_FACTOR = "Two-factor: not set up yet.";', 'var TWO_FACTOR = "Two-factor: not set up yet. Your account is secure.";']]],
  ["2FA jargon", "account-security.js", [['var TITLE = "Sign-in";', 'var TITLE = "2FA";']]],
  ["innerHTML", "account-security.js", [['    if (text != null) n.textContent = String(text);', '    if (text != null) n.innerHTML = String(text);']]],
  ["write on load", "account-security.js", [['  function load() {\n', '  function load() {\n    try { localStorage.setItem("aia_sec", "1"); } catch (e) {}\n']]],
  ["second request on load", "account-security.js", [['  window.AIAAccountSecurity = { load: load };', '  fetch("/api/account?settings=1", { method: "GET", headers: hdr() });\n  window.AIAAccountSecurity = { load: load };']]],
  ["POST read", "account-security.js", [['fetch("/api/account", { method: "GET", headers: hdr() })', 'fetch("/api/account", { method: "POST", headers: hdr(), body: JSON.stringify({ action: "sessions" }) })']]],
  ["shows on failed read", "account-security.js", [["      .then(function (r) { return r.ok ? r.json() : null; })", "      .then(function (r) { return r.json(); })"]]],
  ["shows to a stranger", "account-security.js", [["    if (!signedIn()) { hide(); return; }\n", ""]]],
  ["stranger sees words", "account-security.js", [["    if (!signedIn()) { hide(); return; }\n", "    if (!signedIn()) { paint({ account: { id: \"x\" }, sessions: [] }); return; }\n"]]],
  ["device name field shown", "account-security.js", [["    if (typeof s.workspace === \"string\" && s.workspace) bits.push(s.workspace);", "    if (typeof s.workspace === \"string\" && s.workspace) bits.push(s.workspace);\n    if (s.name) bits.push(s.name);"]]],
  ["new field read", "account-security.js", [["    if (at) bits.push(SEEN + at);", "    if (at) bits.push(SEEN + at);\n    if (s.device) bits.push(s.device);"]]],
  ["word changed", "account-security.js", [['var DEVICES = "Signed-in devices";', 'var DEVICES = "Signed in devices";']]],
  ["current flips", "account-security.js", [["s.current === true ? THIS_ONE : OTHER", "s.current ? OTHER : THIS_ONE"]]],
  ["mfa line dropped", "account-security.js", [['    if (!(d.account && d.account.mfaOn === true)) c.appendChild(el("p", "meta", TWO_FACTOR));\n', ""]]],
  ["mount not hidden", "account.html", [['<section id="acct-security" aria-label="Sign-in" hidden></section>', '<section id="acct-security" aria-label="Sign-in"></section>']]],
  ["script not loaded", "account.html", [['  <script src="account-security.js"></script>\n', ""]]],
  ["not run by npm", "scripts/check-account-settings.js", [["scripts/check-account-security.js", "scripts/check-account-securityX.js"]]],
  ["hook ignores child exit", "scripts/check-account-settings.js", [['if (typeof result.status === "number" && result.status !== 0) return name', 'if (false && typeof result.status === "number" && result.status !== 0) return name']]],
  ["hook treats a signal as a pass", "scripts/check-account-settings.js", [["if (!result || result.status == null || result.signal)", "if (false && (!result || result.status == null || result.signal))"]]],
  ["hook swallows a spawn error", "scripts/check-account-settings.js", [['if (result && result.error) return name + " could not start: "', 'if (false && result && result.error) return name + " could not start: "']]]
];

(async function main() {
  const SRC = read("account-security.js"), HTML = read("account.html"), LIB = read("api/_lib.js"), SETTINGS = read("scripts/check-account-settings.js");
  const base = await runAll(SRC, HTML, LIB, SETTINGS);
  base.fails.forEach((f) => console.error("check-account-security: FAIL " + f));
  let bad = base.fails.length;
  if (MUTANTS) {
    let caught = 0;
    for (const [label, file, edits] of MUTATIONS) {
      const files = { "account-security.js": SRC, "account.html": HTML, "scripts/check-account-settings.js": SETTINGS };
      let applied = true;
      edits.forEach(([from, to]) => { if (files[file].indexOf(from) < 0) applied = false; files[file] = files[file].split(from).join(to); });
      if (!applied) { console.error("check-account-security: FAIL mutant did not apply: " + label); bad += 1; continue; }
      const m = await runAll(files["account-security.js"], files["account.html"], LIB, files["scripts/check-account-settings.js"]);
      if (m.fails.length) { caught += 1; console.log("mutant caught: " + label + " (" + m.fails.length + " fails, " + m.runtime + " in the run; first: " + m.fails[0].split("\n")[0] + ")"); }
      else { console.error("check-account-security: FAIL mutant survived: " + label); bad += 1; }
    }
    console.log("mutants " + caught + "/" + MUTATIONS.length + " caught");
  }
  if (bad) { console.error("check-account-security: " + bad + " failure(s)"); process.exit(1); }
  console.log("PASS check-account-security (" + base.passes + " ok" + (MUTANTS ? ", " + MUTATIONS.length + "/" + MUTATIONS.length + " built-in mutants" : "") + ")");
})().catch((e) => { console.error("check-account-security: FAIL " + (e && e.stack || e)); process.exit(1); });
