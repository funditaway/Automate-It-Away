#!/usr/bin/env node
require("./_env-guard");
// My account page: Pause, What this can do, Activity, Undo, and Export and close.
// Runs the real account-follow.js in a small DOM stub with a fake fetch.
// usage: node scripts/check-account-follow-ui.js [repoRoot]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
let failures = 0, passes = 0;
function fail(msg) { failures += 1; console.error("check-account-follow-ui: FAIL " + msg); }
function ok(cond, msg) { if (cond) passes += 1; else fail(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const SRC = read("account-follow.js");
const CODE = SRC.replace(/^\s*\/\/.*$/gm, "");

const VOID = { input: 1, br: 1, img: 1 };
function escText(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escAttr(s) { return escText(s).replace(/"/g, "&quot;"); }
let innerHTMLUsed = 0;
function makeEl(tag) {
  const el = {
    tagName: String(tag).toLowerCase(), attrs: {}, className: "", id: "", parts: [], hidden: false, disabled: false,
    type: "", name: "", value: "", checked: false, selected: false, download: "", rel: "", href: "", maxLength: -1, handlers: {},
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    appendChild(c) { if (!c || !c.tagName) throw new TypeError("appendChild needs a node"); c.parentNode = this; this.parts.push(c); return c; },
    removeChild(c) { this.parts = this.parts.filter((p) => p !== c); return c; },
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); },
    fire(ev) { (this.handlers[ev] || []).forEach((fn) => fn({ target: this })); },
    click() { this.fire("click"); },
    querySelector() { return null; },
    set textContent(v) { this.parts = [{ text: String(v == null ? "" : v) }]; },
    get textContent() { return this.parts.map((p) => p.text !== undefined ? p.text : p.textContent).join(""); },
    get firstChild() { return this.parts[0] || null; }
  };
  Object.defineProperty(el, "innerHTML", { set() { innerHTMLUsed += 1; throw new Error("innerHTML used"); }, get() { return serialize(el, true); } });
  el.insertAdjacentHTML = function () { innerHTMLUsed += 1; throw new Error("insertAdjacentHTML used"); };
  if (el.tagName === "select") Object.defineProperty(el, "value", {
    get() { const o = el.parts.filter((x) => x.tagName === "option"); const hit = o.filter((x) => x.selected)[0] || o[0]; return hit ? hit.value : ""; },
    set(v) { el.parts.forEach((x) => { if (x.tagName === "option") x.selected = x.value === String(v); }); }
  });
  return el;
}
function serialize(el, inner) {
  const body = el.parts.map((p) => p.text !== undefined ? escText(p.text) : serialize(p, false)).join("");
  if (inner) return body;
  const a = (el.id ? ' id="' + escAttr(el.id) + '"' : "") + (el.className ? ' class="' + escAttr(el.className) + '"' : "") + (el.type ? ' type="' + escAttr(el.type) + '"' : "") + Object.keys(el.attrs).map((k) => " " + k + '="' + escAttr(el.attrs[k]) + '"').join("");
  return "<" + el.tagName + a + ">" + (VOID[el.tagName] ? "" : body + "</" + el.tagName + ">");
}
function walk(el, fn) { fn(el); (el.parts || []).forEach((p) => { if (p.tagName) walk(p, fn); }); }
function find(el, pred) { const out = []; walk(el, (n) => { if (pred(n)) out.push(n); }); return out; }
function byId(el, id) { return find(el, (n) => n.id === id)[0] || null; }
function buttons(el, text) { return find(el || { parts: [] }, (n) => n.tagName === "button" && (text == null || n.textContent === text)); }
const tick = () => new Promise((r) => setImmediate(r));
async function settle() { for (let i = 0; i < 16; i++) await tick(); }

const EVIL = '<img src=x onerror="alert(1)">';
const SECRET = "pw-SECRET-77";
const HOOK = "https://hooks.example/secret-value";
const PIN = "9191-desk";
const TOKEN = "session-token-123";
const LOCK = "An AI or SI account can't change this itself. The human owner can.";
const CLOSE_ERR = "Closing the account stays on hold. Nothing was deleted. Export your book, leave this phone, or leave the desk.";
const PAUSE_HINT = "Paused. Desk AIs stay drafts. You still tap Yes, Stop, or Kill. It does not run on its own. Collect stays HOLD.";
const EXPORT_HINT = "Exported. No desk code. No password. No secrets. Collect stays HOLD.";
const SIGNED = { aia_ws: "own-desk", aia_session: TOKEN, aia_pin: PIN };

function goodPack() {
  return { format: "aia.account.v1", marker: "BOOK-MARKER-99", account: { name: "Pat", email: "pat@shop.test" }, note: "Your account book. No desk code. No password. No secrets." };
}
function basePause(calls) {
  const posts = (calls || []).filter((c) => c.body);
  const deskOn = posts.some((c) => c.body.action === "pause" && c.body.target === "desk" && c.body.desk === "own-desk");
  const aiOn = posts.some((c) => c.body.action === "pause" && c.body.target === "automation" && c.body.id === "ai_doer");
  return {
    ok: true,
    pause: {
      stopAndKill: "You still tap Yes, Stop, or Kill. Server line.",
      desks: [
        { slug: "own-desk", name: EVIL, paused: deskOn, draftOnly: true },
        { slug: "other-desk", name: "Side desk", paused: true, draftOnly: true }
      ],
      items: [
        { desk: "own-desk", kind: "ai", id: "ai_doer", name: EVIL, paused: aiOn || deskOn, deskPaused: deskOn, draftOnly: true, secret: SECRET },
        { desk: "own-desk", kind: "rule", id: "r1", name: "Lead rule", paused: deskOn, deskPaused: deskOn, draftOnly: false },
        { desk: "other-desk", kind: "rule", id: "r2", name: "Side rule", paused: true, deskPaused: true, draftOnly: false }
      ]
    }
  };
}
function menuBody() {
  return {
    ok: true,
    exportClose: {
      export: { available: true, do: "close-account", note: "Exports the account book you own. No desk code. No password. No secrets." },
      leavePhone: { available: true, do: "leave-phone", note: "Leaves this phone. Your account stays." },
      leaveEveryPhone: { available: true, do: "leave-every-phone", note: "Leaves every phone. Your account stays." },
      leaveDesk: { available: true, do: "leave-desk", note: "You leave this desk. Your account stays." },
      closeDesk: { available: true, do: "close-desk", note: "Closes this desk so new work stops. Nothing is deleted." },
      openDesk: { available: true, do: "open-desk", note: "Opens a closed desk again. Nothing is deleted." },
      closeAccount: { available: false, hold: true, do: "close-account", note: "Closing the account stays on hold. Nothing is deleted." },
      collect: "hold",
      runOnItsOwn: false
    }
  };
}
function undoBody(calls) {
  const did = (calls || []).some((c) => c.body && c.body.action === "undo");
  if (did) return { ok: true, undo: { available: false, note: "Nothing to undo." } };
  return { ok: true, undo: { available: true, kind: "pause", label: "Paused Desk AI \"Doer\" on Own Shop.", beforePaused: true, person: { pin: "pin-SECRET-55" } } };
}
function activityBody(url) {
  const u = String(url);
  if (u.indexOf("kind=rule") >= 0) {
    return { ok: true, note: "Only what was recorded.", activity: [{ at: "2026-10-19T15:04:00.000Z", who: "Hal", whoKind: "human", what: "Only this rule.", password: SECRET, hook: HOOK }] };
  }
  if (u.indexOf("desk=") >= 0) {
    return { ok: true, note: "Only what was recorded.", activity: [{ at: "2026-10-19T15:05:00.000Z", who: "Ann", whoKind: "si", what: "Desk trail.", card: { pin: PIN } }] };
  }
  return {
    ok: true,
    note: "Only what was recorded.",
    activity: [
      { at: "2026-10-19T15:04:00.000Z", who: EVIL, whoKind: "ai", what: "Paused the desk.", password: SECRET, hook: HOOK, pin: PIN },
      { at: "2026-10-19T15:06:00.000Z", who: "Hal", whoKind: "nope", what: "Saved a note." }
    ]
  };
}
function canBody() {
  return {
    ok: true,
    can: {
      lines: [
        "It can draft the next step and the words, for you to check.",
        "It cannot send, pay, or delete on its own.",
        "This Desk AI stays a draft. You tap Yes, Stop, or Kill.",
        "You still tap Yes, Stop, or Kill. Those cannot be switched off.",
        "It does not run on its own.",
        "Collect stays HOLD. Nothing is charged.",
        "hook: " + HOOK,
        "password: " + SECRET
      ],
      secret: SECRET,
      hook: HOOK,
      password: SECRET,
      runOnItsOwn: false,
      allowed: { spend: false, deletes: false, messageNew: false }
    }
  };
}

function world(opts) {
  opts = opts || {};
  innerHTMLUsed = 0;
  const mount = makeEl("section"); mount.id = "acct-follow"; mount.hidden = true;
  const store = Object.assign({}, opts.storage || {});
  const sess = {};
  const calls = [], logs = [], downloads = [];
  const loc = { href: "https://aia.test/account", search: "", hash: "" };
  const document = { getElementById(id) { return id === "acct-follow" ? mount : null; }, createElement: makeEl };
  const logger = {};
  ["log", "info", "warn", "error", "debug"].forEach((k) => { logger[k] = function () { logs.push(Array.prototype.join.call(arguments, " ")); }; });
  function Blob(parts) { this.parts = parts; }
  const URL = {
    createObjectURL(blob) { const text = blob && blob.parts ? blob.parts.join("") : ""; downloads.push(text); return "blob:pack"; },
    revokeObjectURL() {}
  };
  const ctx = {
    document, console: logger, Date, JSON, Array, Object, String, Promise, encodeURIComponent, isFinite, setTimeout, Blob, URL,
    location: loc,
    localStorage: { getItem(k) { return k in store ? store[k] : null; }, setItem(k, v) { store[k] = String(v); }, removeItem(k) { delete store[k]; } },
    sessionStorage: { getItem(k) { return k in sess ? sess[k] : null; }, setItem(k, v) { sess[k] = String(v); }, removeItem(k) { delete sess[k]; } },
    fetch(url, init) {
      const body = init && init.body ? JSON.parse(init.body) : null;
      calls.push({ url: String(url), init: init || {}, body: body });
      const reply = opts.reply ? opts.reply(String(url), body, calls) : { status: 200, data: {} };
      return Promise.resolve({ ok: reply.status >= 200 && reply.status < 300, status: reply.status, json() { return Promise.resolve(reply.data); } });
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: "account-follow.js" });
  return { ctx, mount, calls, store, sess, logs, downloads, loc, posts: () => calls.filter((c) => c.body), last: () => calls.filter((c) => c.body).slice(-1)[0] };
}
function keysOf(body) { return Object.keys(body || {}).sort(); }
function sameBody(body, want) {
  const a = keysOf(body), b = keysOf(want);
  return JSON.stringify(a) === JSON.stringify(b) && b.every((k) => body[k] === want[k]);
}
function happyReply(url, body, calls) {
  if (url.indexOf("pause=1") >= 0) return { status: 200, data: basePause(calls) };
  if (url.indexOf("activity=1") >= 0) return { status: 200, data: activityBody(url) };
  if (url.indexOf("undo=1") >= 0) return { status: 200, data: undoBody(calls) };
  if (url.indexOf("exportClose=1") >= 0) return { status: 200, data: menuBody() };
  if (url.indexOf("can=1") >= 0) return { status: 200, data: canBody() };
  if (body && body.action === "pause") return { status: 200, data: { ok: true, changed: true, paused: true, hint: PAUSE_HINT } };
  if (body && body.action === "unpause") return { status: 200, data: { ok: true, changed: true, hint: "Unpaused. You still tap Yes, Stop, or Kill." } };
  if (body && body.action === "undo") return { status: 200, data: { ok: true, undid: true, hint: "Undid: Paused the desk." } };
  if (body && body.action === "export-close" && body.do === "export") return { status: 200, data: { ok: true, hint: EXPORT_HINT, pack: goodPack() } };
  if (body && body.action === "export-close" && body.do === "leave-desk") return { status: 200, data: { ok: true, hint: "You left. Your account stays. Nothing was deleted." } };
  if (body && body.action === "export-close" && body.do === "close-desk") return { status: 200, data: { ok: true, hint: "Closed. Nothing was deleted.", closed: true } };
  if (body && body.action === "export-close" && body.do === "open-desk") return { status: 200, data: { ok: true, hint: "Open again. Nothing was deleted.", closed: false } };
  if (body && body.action === "export-close" && body.do === "close-account") return { status: 409, data: { ok: false, error: CLOSE_ERR, hold: true, deleted: false } };
  if (body && body.action === "export-close" && (body.do === "leave-phone" || body.do === "leave-every-phone")) return { status: 200, data: { ok: true, loggedOut: true, hint: "Left this phone. Your account stays." } };
  return { status: 404, data: { ok: false, error: "Nothing like that for this sign-in." } };
}
function allText(w) { return w.mount.textContent; }
function leaked(w) {
  const page = w.mount.innerHTML + "\n" + allText(w) + "\n" + JSON.stringify(w.sess) + "\n" + w.logs.join("\n");
  const store = JSON.stringify(w.store);
  if (page.indexOf(SECRET) >= 0 || store.indexOf(SECRET) >= 0) return SECRET;
  if (page.indexOf(HOOK) >= 0 || store.indexOf(HOOK) >= 0) return HOOK;
  if (page.indexOf("pin-SECRET-55") >= 0) return "pin-SECRET-55";
  if (page.indexOf(TOKEN) >= 0 || page.indexOf(PIN) >= 0) return "seat secret on the page";
  return "";
}
async function click(w, id, label) {
  const row = byId(w.mount, id);
  const b = buttons(row, label)[0];
  if (!b) return null;
  b.fire("click");
  await settle();
  return b;
}

(async function main() {
  ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(CODE), "account-follow.js must not write HTML");
  ok(!/\son[a-z]+\s*=/.test(CODE) && !/onclick|onerror/.test(CODE), "account-follow.js must not use inline handlers");
  ok(!/type = "checkbox"/.test(CODE), "no switch that could turn Stop or Kill off");
  ok(!/\b(PASS|FAIL|HOLD)\b/.test(CODE), "no PASS, FAIL, or HOLD words in the page script");
  ok(!/\bCollect\b/.test(CODE) && !/\bcharged\b/.test(CODE), "the page script does not talk about Collect or charged");
  ok(!/runOnItsOwn|forSeat/.test(CODE), "no run-on-its-own control and no seat id field");
  ok(!/d0b5a293/.test(SRC), "no tip on the page");
  ok(/You still tap Yes, Stop, or Kill\. Those cannot be switched off\./.test(SRC), "Stop and Kill stay in the page's own words");
  ok(/This Desk AI stays a draft\. You tap Yes, Stop, or Kill\./.test(SRC), "a Desk AI stays a draft");
  const acct = read("account.html");
  ok(/<section id="acct-follow" aria-label="Pause, activity, undo, and export" hidden><\/section>\s*<section id="acct-connections"/.test(acct), "account.html mounts follow before Connections");
  ok(/<section id="acct-connections" aria-label="Connections and setup cards" hidden><\/section>\s*<section id="acct-settings"/.test(acct), "Connections stays right before settings");
  ok(/<section id="acct-settings" aria-label="My account settings" hidden><\/section>\s*<\/main>/.test(acct), "settings mount still right before </main>");
  ok(/<script src="account-settings\.js"><\/script>\s*<script src="account-connections\.js"><\/script>\s*<script src="account-follow\.js"><\/script>/.test(acct), "account-follow.js loads after settings and connections");
  ok(/\.acct-lines\{/.test(acct), "account.html styles the follow lists");
  ok(fs.statSync(path.join(root, "desk.html")).size === 35012, "desk.html stays 35,012 bytes");
  ok(!/account-follow/.test(read("desk.html")), "desk.html untouched");
  ok(!/check-account-follow-ui/.test(read("package.json")), "not in npm test yet");
  ok(!fs.existsSync(path.join(root, "api/account-follow.js")), "no new account-follow function");

  { const w = world({ reply: happyReply }); await settle(); ok(w.calls.length === 0 && w.mount.hidden === true, "signed out: no fetch, stays hidden"); }

  {
    const w = world({ storage: SIGNED, reply: happyReply });
    await settle();
    ok(w.mount.hidden === false, "signed in: shows");
    ok(w.calls.length >= 4, "loads pause, activity, undo, and export");
    ok(w.calls[0].url === "/api/account?pause=1" && w.calls[0].init.method === "GET" && !w.calls[0].body, "pause is a GET flag");
    ok(w.calls[1].url === "/api/account?activity=1" && w.calls[1].init.method === "GET", "activity is a GET flag");
    ok(w.calls[2].url === "/api/account?undo=1" && w.calls[2].init.method === "GET", "undo preview is a GET flag");
    ok(w.calls[3].url === "/api/account?exportClose=1" && w.calls[3].init.method === "GET", "export and close is a GET flag");
    ok(w.calls.every((c) => c.url.indexOf(PIN) < 0 && c.url.indexOf(TOKEN) < 0 && c.url.indexOf(SECRET) < 0), "reads do not put the desk code, session, or a secret in the address");
    ok(w.calls[0].init.headers["X-Workspace"] === "own-desk" && w.calls[0].init.headers["X-Session"] === TOKEN && w.calls[0].init.headers["X-Pin"] === PIN, "sends the signed-in seat");
    ok(/Server line\./.test(allText(w)), "shows the server's Stop and Kill line");
    ok(/Desk AIs stay drafts\./.test(allText(w)), "a desk keeps Desk AIs as drafts");
    const ai = byId(w.mount, "acct-auto-own-desk-ai-ai_doer");
    const rule = byId(w.mount, "acct-auto-own-desk-rule-r1");
    const side = byId(w.mount, "acct-auto-other-desk-rule-r2");
    const sideDesk = byId(w.mount, "acct-desk-actions-other-desk");
    ok(!!ai && !!rule && !!side, "automations are listed under their desks");
    ok(/This Desk AI stays a draft\. You tap Yes, Stop, or Kill\./.test(ai.textContent), "the Desk AI row says it stays a draft");
    ok(rule.textContent.indexOf("This Desk AI stays a draft") < 0, "a rule is not called a Desk AI draft");
    ok(buttons(byId(w.mount, "acct-auto-actions-own-desk-ai-ai_doer"), "Pause").length === 1, "a Desk AI can be paused");
    ok(buttons(byId(w.mount, "acct-auto-actions-own-desk-ai-ai_doer"), "What this can do").length === 1, "What this can do is on the automation");
    ok(buttons(byId(w.mount, "acct-auto-actions-other-desk-rule-r2"), "Pause").length === 0 && buttons(byId(w.mount, "acct-auto-actions-other-desk-rule-r2"), "Unpause").length === 0, "an automation on a paused desk has no pause switch of its own");
    ok(/The desk is paused\./.test(side.textContent), "a paused desk is said in plain words");
    ok(buttons(sideDesk, "Unpause").length === 1, "the paused desk can be unpaused");
    ok(/Only what was recorded\./.test(allText(w)) && /Paused the desk\./.test(allText(w)) && /\(AI\)/.test(allText(w)), "activity shows what was recorded and the kind in words");
    ok(allText(w).indexOf("(ai)") < 0 && allText(w).indexOf("(nope)") < 0, "an unknown kind is left off");
    ok(/Paused Desk AI "Doer" on Own Shop\./.test(allText(w)) && buttons(byId(w.mount, "acct-undo"), "Undo").length === 1, "undo preview shows the last step");
    ok(allText(w).indexOf("beforePaused") < 0, "undo preview does not show the stored frame");
    ok(/Closing the account stays on hold\. Nothing is deleted\./.test(allText(w)), "closing the account shows the on-hold line");
    ok(buttons(w.mount, "Export the book").length === 1 && buttons(w.mount, "Leave this phone").length === 1 && buttons(w.mount, "Leave this desk").length === 1 && buttons(w.mount, "Close the desk").length === 1 && buttons(w.mount, "Open the desk").length === 1, "export and close offers the menu");
    ok(!/runOnItsOwn|Collect stays|\bHOLD\b/.test(allText(w)), "Collect stays quiet and nothing here runs on its own");
    const html = w.mount.innerHTML;
    ok(html.indexOf("<img") < 0 && html.indexOf("&lt;img src=x onerror=") >= 0, "names render as text");
    ok(innerHTMLUsed === 0, "no innerHTML writes");
    ok(!leaked(w), "secrets, the hook, the desk code, and the session stay off the page");

    await click(w, "acct-auto-actions-own-desk-ai-ai_doer", "Pause");
    const paused = w.last();
    ok(paused && sameBody(paused.body, { action: "pause", target: "automation", desk: "own-desk", kind: "ai", id: "ai_doer" }), "pause sends the automation, the desk, and the id");
    ok(/Server line\./.test(allText(w)) && buttons(byId(w.mount, "acct-auto-actions-own-desk-ai-ai_doer"), "Unpause").length === 1, "after a pause the Desk AI shows unpause");
    ok(/Yes, Stop, or Kill/.test(allText(w)) && !/\bHOLD\b/.test(allText(w)), "the pause line keeps Yes, Stop, and Kill and drops the Collect sentence");
    ok(w.store.aia_session === TOKEN, "a pause does not sign the phone out");

    await click(w, "acct-auto-actions-own-desk-ai-ai_doer", "What this can do");
    const can = w.calls.filter((c) => c.url.indexOf("can=1") >= 0).slice(-1)[0];
    ok(can && can.url === "/api/account?can=1&desk=own-desk&kind=ai&id=ai_doer" && can.init.method === "GET" && !can.body, "What this can do is one GET");
    ok(/It cannot send, pay, or delete on its own\./.test(allText(w)), "shows what it cannot do");
    ok(/It does not run on its own\./.test(allText(w)), "says it does not run on its own");
    ok(!/Collect stays|\bHOLD\b/.test(allText(w)) && allText(w).indexOf(SECRET) < 0 && allText(w).indexOf(HOOK) < 0, "the read drops Collect and does not show a secret or a hook");

    await click(w, "acct-auto-actions-own-desk-rule-r1", "Activity");
    const act = w.calls.filter((c) => c.url.indexOf("activity=1") >= 0 && c.url.indexOf("kind=rule") >= 0).slice(-1)[0];
    ok(act && act.url === "/api/account?activity=1&desk=own-desk&kind=rule&id=r1" && !act.body, "activity for one rule is one GET");
    ok(/Only this rule\./.test(allText(w)) && allText(w).indexOf(SECRET) < 0, "the activity line is the words that were recorded");

    await click(w, "acct-desk-actions-own-desk", "Activity");
    const deskAct = w.calls.filter((c) => c.url === "/api/account?activity=1&desk=own-desk").slice(-1)[0];
    ok(!!deskAct && /Desk trail\./.test(allText(w)) && /\(SI\)/.test(allText(w)), "desk activity names the desk and the kind");

    await click(w, "acct-undo", "Undo");
    ok(w.last() && sameBody(w.last().body, { action: "undo" }), "undo sends only the undo action");
    ok(/Undid: Paused the desk\./.test(allText(w)) && /Nothing to undo\./.test(allText(w)), "undo shows what it undid, then that nothing is left");
    ok(buttons(byId(w.mount, "acct-undo"), "Undo").length === 0, "no undo button when nothing is left");
    ok(allText(w).indexOf("pin-SECRET-55") < 0 && w.store.aia_session === TOKEN, "undo does not show a desk code or sign out");

    await click(w, "acct-export", "Export the book");
    ok(w.last() && sameBody(w.last().body, { action: "export-close", do: "export" }), "export sends export, not the book's other verb");
    ok(w.downloads.length === 1 && w.downloads[0].indexOf("BOOK-MARKER-99") >= 0 && w.downloads[0].indexOf('"format": "aia.account.v1"') >= 0, "the book downloads");
    ok(w.downloads[0].indexOf(TOKEN) < 0 && w.downloads[0].indexOf('"password"') < 0 && w.downloads[0].indexOf('"pin"') < 0, "the download has no session, password, or desk code");
    ok(allText(w).indexOf("BOOK-MARKER-99") < 0, "the book is not painted on the page");
    ok(/Exported\. No desk code\. No password\. No secrets\./.test(allText(w)) && !/\bHOLD\b/.test(allText(w)), "export says what was left out");

    const sel = byId(w.mount, "acct-desk-pick");
    ok(!!sel && sel.value === "own-desk", "the desk picker starts on this desk");
    sel.value = "other-desk";
    sel.fire("change");
    await click(w, "acct-export", "Close the desk");
    ok(w.last() && sameBody(w.last().body, { action: "export-close", do: "close-desk", desk: "other-desk" }), "close the desk names the desk you picked");
    ok(/Nothing was deleted\./.test(allText(w)) && w.store.aia_session === TOKEN, "closing a desk does not delete or sign out");
    await click(w, "acct-export", "Open the desk");
    ok(w.last() && sameBody(w.last().body, { action: "export-close", do: "open-desk", desk: "other-desk" }), "open the desk uses the same desk");

    await click(w, "acct-export", "Leave this desk");
    ok(w.last() && sameBody(w.last().body, { action: "export-close", do: "leave-desk" }), "leave this desk sends no other desk");
    ok(w.store.aia_session === TOKEN && w.loc.href.indexOf("/login") < 0, "leaving the desk keeps this phone signed in");
    ok(!leaked(w), "after the writes, secrets stay off the page, the logs, and storage");
  }

  {
    const w = world({
      storage: SIGNED,
      reply(url, body, calls) {
        if (body && body.action === "unpause") return { status: 403, data: { ok: false, error: LOCK } };
        const base = happyReply(url, body, calls);
        if (url.indexOf("pause=1") >= 0) {
          base.data.pause.items[0].paused = true;
          base.data.pause.items[0].deskPaused = false;
        }
        return base;
      }
    });
    await settle();
    await click(w, "acct-auto-actions-own-desk-ai-ai_doer", "Unpause");
    ok(w.last() && sameBody(w.last().body, { action: "unpause", target: "automation", desk: "own-desk", kind: "ai", id: "ai_doer" }), "unpause sends the automation");
    ok(allText(w).indexOf(LOCK) >= 0, "an AI or SI refusal is shown in the server's words");
    ok(w.store.aia_session === TOKEN && w.loc.href.indexOf("/login") < 0, "the refusal does not sign the phone out");
    ok(/Paused\./.test(byId(w.mount, "acct-auto-own-desk-ai-ai_doer").textContent), "a refused unpause does not show the automation as unpaused");
  }

  {
    const w = world({ storage: SIGNED, reply: happyReply });
    await settle();
    await click(w, "acct-export", "Close the account");
    ok(w.last() && sameBody(w.last().body, { action: "export-close", do: "close-account" }), "close the account asks, and does not send a delete");
    ok(allText(w).indexOf(CLOSE_ERR) >= 0, "the on-hold reply is shown word for word");
    ok(w.store.aia_session === TOKEN && w.store.aia_ws === "own-desk" && w.loc.href.indexOf("/login") < 0, "closing the account does not sign out or remove the desk");
    ok(allText(w).indexOf("Account deleted") < 0, "the page does not say the account was deleted");
  }

  {
    const w = world({
      storage: SIGNED,
      reply(url, body, calls) {
        if (body && body.do === "export") return { status: 200, data: { ok: true, hint: EXPORT_HINT, pack: { format: "aia.account.v1", password: SECRET, hook: HOOK, account: { name: "Pat" } } } };
        return happyReply(url, body, calls);
      }
    });
    await settle();
    await click(w, "acct-export", "Export the book");
    ok(w.downloads.length === 0, "a book that carries a secret is not saved on this phone");
    ok(/That book was not saved on this phone\./.test(allText(w)), "the page says the book was not saved");
    ok(allText(w).indexOf(SECRET) < 0 && allText(w).indexOf(HOOK) < 0 && w.store.aia_session === TOKEN, "the secret is not shown and the phone stays signed in");
  }

  {
    const w = world({
      storage: SIGNED,
      reply(url, body, calls) {
        if (body && body.do === "close-account") return { status: 400, data: { ok: false, error: "hook: " + HOOK } };
        return happyReply(url, body, calls);
      }
    });
    await settle();
    await click(w, "acct-export", "Close the account");
    ok(allText(w).indexOf(HOOK) < 0 && /Nothing was deleted\./.test(allText(w)), "a secret in the refusal is not shown");
    ok(w.store.aia_session === TOKEN, "that refusal does not sign the phone out");
  }

  {
    const w = world({ storage: Object.assign({}, SIGNED), reply: happyReply });
    await settle();
    await click(w, "acct-export", "Leave this phone");
    ok(w.last() && sameBody(w.last().body, { action: "export-close", do: "leave-phone" }), "leave this phone uses export and close");
    ok(!w.store.aia_session && !w.store.aia_pin && !w.store.aia_ws, "leave this phone clears this phone");
    ok(w.loc.href === "/login", "leave this phone returns to sign in");
  }

  {
    const w = world({
      storage: Object.assign({}, SIGNED),
      reply(url, body, calls) {
        if (body && body.do === "leave-phone") return { status: 409, data: { ok: false, error: "That did not save. Nothing changed. Try again." } };
        return happyReply(url, body, calls);
      }
    });
    await settle();
    await click(w, "acct-export", "Leave this phone");
    ok(w.store.aia_session === TOKEN && w.store.aia_pin === PIN && w.loc.href.indexOf("/login") < 0, "a refused leave keeps this phone signed in");
    ok(/That did not save\. Nothing changed\. Try again\./.test(allText(w)), "the refusal is the server's words");
  }

  {
    const w = world({ storage: Object.assign({}, SIGNED), reply: happyReply });
    await settle();
    await click(w, "acct-export", "Leave every phone");
    ok(w.last() && sameBody(w.last().body, { action: "export-close", do: "leave-every-phone" }), "leave every phone uses its own verb");
    ok(!w.store.aia_session && w.loc.href === "/login", "leave every phone signs this phone out");
  }

  {
    const w = world({
      storage: SIGNED,
      reply() { return { status: 404, data: { ok: false, error: "Nothing like that for this sign-in." } }; }
    });
    await settle();
    ok(/Nothing like that for this sign-in\./.test(allText(w)), "a stranger sees the same missing line");
    ok(buttons(w.mount, "Pause").length === 0 && buttons(w.mount, "Export the book").length === 0 && buttons(w.mount, "Close the account").length === 0, "a stranger gets no actions");
  }

  {
    const w = world({
      storage: SIGNED,
      reply(url, body, calls) {
        if (url.indexOf("activity=1") >= 0 && url.indexOf("desk=") < 0) return { status: 200, data: { ok: true, activity: [], note: "Nothing recorded on this yet." } };
        return happyReply(url, body, calls);
      }
    });
    await settle();
    ok(/Nothing recorded on this yet\./.test(allText(w)), "an empty activity says nothing was recorded");
    ok(byId(w.mount, "acct-activity").textContent.indexOf("ran on its own") < 0, "activity does not invent a row");
  }

  {
    const w = world({
      storage: SIGNED,
      reply(url) {
        if (String(url).indexOf("pause=1") >= 0) return { status: 200, data: { ok: true, pause: { desks: [], items: [], stopAndKill: "" } } };
        if (String(url).indexOf("undo=1") >= 0) return { status: 200, data: { ok: true, undo: { available: false, label: "", note: "" } } };
        return happyReply(url, null, []);
      }
    });
    await settle();
    ok(/No desks on this account yet\./.test(allText(w)), "no desks yet is said in plain words");
    ok(/You still tap Yes, Stop, or Kill\. Those cannot be switched off\./.test(allText(w)), "Stop and Kill stay even when the server line is empty");
    ok(/Nothing to undo\./.test(allText(w)) && buttons(w.mount, "Undo").length === 0, "nothing to undo has no button");
    ok(buttons(w.mount, "Pause").length === 0, "no pause button without a desk");
  }

  console.log("check-account-follow-ui: " + passes + " pass, " + failures + " fail");
  if (failures) process.exit(1);
})().catch((e) => { console.error("check-account-follow-ui: FAIL crashed " + (e && e.stack || e)); process.exit(1); });
