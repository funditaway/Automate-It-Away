#!/usr/bin/env node
"use strict";
// People page after the helper trim (PR 372): a helper gets other seats back as display fields
// only (email and accountId empty; no phone, prompt, wallet, permissions, thread).
// Renders people.js against a helper-shaped reply and an owner-shaped reply in a small fake DOM:
// - helpers: two different seats with the same name stay two cards (never merged by name alone)
// - helpers: no empty meta line, no bare " · " label, no empty "Prompt ·", no "#" / bare mailto: / sms: link
// - owners: grouping by accountId / email and the card lines read exactly as before
// - stranger-typed names stay escaped; no inline handlers in people.js
// - Accept / Deny / Say (people-desk.js) act on the seat the sheet opened, not on a same-name seat
// - the sheet opens by seat: GET /api/admin?seat=<id>&desk=<slug> on that desk, never ?who= when the
//   seat id is known; POST person sends id + desk, no email / accountId as identity
// - a 409 (two seats share a name) shows a plain line and nobody's data, with no name fallback
// - "Full history" (people.js), "Open on People" (desk-inbox.js) and "Open on People" (history.html)
//   carry the seat id and desk, not the name
// - job credit (Holding / Ext) follows the job's seat ids; a job with no id credits a name only when
//   exactly one seat on that desk has it
// - History asks POST /api/desks {action:"history", seat, desk} when the seat is known, never who=
// - desk-queue.js / desk-card.js send no whoTapped (the server credits the session's own seat)
// - hand-off (desk-handoff.js, desk-card.js handTo, desk-queue.js handOffTo) sends assign {to:<seat id>};
//   a shared name or no seat sends nothing and shows a plain line; a 409 shows the plain line
// - the person sheet's notes area shows only when the server sent a thread (seat itself / owner)
// PEOPLE_HELPER_VIEW_JS / _DESK_JS / _INBOX_JS / _HISTORY / _HANDOFF_JS / _CARD_JS / _QUEUE_JS may point at
// other copies (used by mutate-people-helper-view.js).

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const jsFile = process.env.PEOPLE_HELPER_VIEW_JS || path.join(root, "people.js");
const htmlSrc = fs.readFileSync(path.join(root, "people.html"), "utf8");
const src = fs.readFileSync(jsFile, "utf8");
const deskFile = process.env.PEOPLE_HELPER_VIEW_DESK_JS || path.join(root, "people-desk.js");
const deskSrc = fs.readFileSync(deskFile, "utf8");
const inboxFile = process.env.PEOPLE_HELPER_VIEW_INBOX_JS || path.join(root, "desk-inbox.js");
const inboxSrc = fs.readFileSync(inboxFile, "utf8");
const historyFile = process.env.PEOPLE_HELPER_VIEW_HISTORY || path.join(root, "history.html");
const historySrc = fs.readFileSync(historyFile, "utf8");
const handoffFile = process.env.PEOPLE_HELPER_VIEW_HANDOFF_JS || path.join(root, "desk-handoff.js");
const handoffSrc = fs.readFileSync(handoffFile, "utf8");
const cardFile = process.env.PEOPLE_HELPER_VIEW_CARD_JS || path.join(root, "desk-card.js");
const cardSrc = fs.readFileSync(cardFile, "utf8");
const queueFile = process.env.PEOPLE_HELPER_VIEW_QUEUE_JS || path.join(root, "desk-queue.js");
const queueSrc = fs.readFileSync(queueFile, "utf8");
const SAME_NAME = "Two people share that name. Open them from the People list.";
const PICK_LINE = "Pick the person from the list.";

let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }
function check(cond, m) { if (cond) pass(m); else fail(m); }

const syntax = spawnSync(process.execPath, ["--check", jsFile], { encoding: "utf8" });
if (syntax.status !== 0) { console.error("FAIL people.js must parse: " + (syntax.stderr || syntax.stdout)); process.exit(1); }
const deskSyntax = spawnSync(process.execPath, ["--check", deskFile], { encoding: "utf8" });
if (deskSyntax.status !== 0) { console.error("FAIL people-desk.js must parse: " + (deskSyntax.stderr || deskSyntax.stdout)); process.exit(1); }

// Helper fixtures must only carry what 372's trim lets through (api/_lib.js SEAT_DISPLAY + email + accountId).
let display = null;
try {
  const lib = fs.readFileSync(path.join(root, "api", "_lib.js"), "utf8");
  const m = lib.match(/const SEAT_DISPLAY = \[([^\]]*)\]/);
  if (m) display = m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean).concat(["email", "accountId"]);
} catch (e) {}

// ---- tiny fake DOM, enough for people.js ----
function makeDom() {
  const els = {};
  const re = /<(\w+)([^>]*)\sid="([^"]+)"([^>]*)>/g;
  let m;
  while ((m = re.exec(htmlSrc))) {
    const attrsText = m[2] + " " + m[4];
    const attrs = {};
    const ar = /([\w-]+)(?:="([^"]*)")?/g;
    let a;
    while ((a = ar.exec(attrsText))) attrs[a[1]] = a[2] === undefined ? "" : a[2];
    els[m[3]] = makeEl(m[1].toLowerCase(), m[3], attrs);
  }
  // people-desk.js builds these from a string; the fake DOM has them up front so its wire() finds them.
  ["sheet-approve", "sheet-deny", "sheet-say-btn"].forEach((id) => { els[id] = makeEl("button", id, {}); });
  els["sheet-say"] = makeEl("input", "sheet-say", {});
  return els;
}
function makeEl(tag, id, attrs) {
  const el = {
    tagName: tag.toUpperCase(), id: id, attrs: Object.assign({}, attrs), style: {}, listeners: {},
    innerHTML: "", textContent: "", value: attrs.value || "", checked: "checked" in attrs,
    hidden: "hidden" in attrs, parentNode: null, onclick: null,
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === "hidden") this.hidden = true; },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; if (k === "hidden") this.hidden = false; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    insertBefore() {}, appendChild() {}, querySelector() { return null; }, closest() { return null; }
  };
  Object.defineProperty(el, "href", {
    get() { return this.attrs.href === undefined ? "" : this.attrs.href; },
    set(v) { this.attrs.href = String(v); }
  });
  return el;
}

function makeStore(init) {
  const data = Object.assign({}, init);
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    removeItem(k) { delete data[k]; }
  };
}

async function render(opts) {
  const els = makeDom();
  const calls = [];
  const document = {
    readyState: "loading",
    getElementById(id) { return els[id] || null; },
    createElement(tag) { return makeEl(tag, "", {}); },
    addEventListener() {},
    querySelector() { return null; }
  };
  const localStorage = makeStore(Object.assign({ aia_people_scope_init: "1", aia_ws: opts.current, aia_session: "tok", aia_desk_name: opts.current }, opts.storage || {}));
  async function fetch(p, o) {
    const h = (o && o.headers) || {};
    const ws = h["X-Workspace"] || localStorage.getItem("aia_ws");
    const body = o && o.body ? JSON.parse(o.body) : {};
    calls.push({ path: p, ws: ws, body: body, method: (o && o.method) || "GET" });
    let reply = { ok: true };
    if (p === "/api/admin" && body.action === "person") reply = opts.person(body, ws);
    else if (/^\/api\/admin\?/.test(p)) {
      const q = new URLSearchParams(p.split("?")[1]);
      reply = opts.seatBook ? opts.seatBook(q, ws) : opts.person({ id: q.get("seat") || "", name: "" }, ws);
    }
    else if (p === "/api/admin") reply = opts.desks[ws];
    else if (p === "/api/jobs") reply = { ok: true, jobs: (opts.jobs && opts.jobs[ws]) || [] };
    const status = (reply && reply.__status) || 200;
    return { status: status, json: async () => JSON.parse(JSON.stringify(reply)) };
  }
  const ctx = {
    document, localStorage, fetch, console,
    location: { search: opts.search || "", pathname: "/people" },
    history: { replaceState() {} },
    navigator: { clipboard: { writeText: async () => {} } },
    URLSearchParams, setTimeout, clearTimeout, Promise, Date, JSON
  };
  ctx.window = ctx;
  if (opts.desksList) ctx.AIADesks = { list: () => opts.desksList.slice(), remember() {}, open() {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: "people.js" });
  if (opts.all) ctx.STATE.all = true;
  await ctx.load();
  if (opts.withDesk) {
    document.readyState = "complete";
    vm.runInContext(deskSrc, ctx, { filename: "people-desk.js" });
  }
  return { ctx, els, calls };
}

const tick = () => new Promise((r) => setTimeout(r, 15));
async function tap(r, id, action, sayText) {
  const before = r.calls.length;
  if (sayText !== undefined) r.els["sheet-say"].value = sayText;
  (r.els[id].listeners.click || []).forEach((f) => f({ target: r.els[id] }));
  for (let i = 0; i < 6; i++) await tick();
  const hit = r.calls.slice(before).filter((c) => c.path === "/api/admin" && c.body.action === action);
  return hit.length ? hit[0].body.id : null;
}

function cardsOf(html) {
  return String(html || "").split("<article").slice(1).map((c) => {
    const h3 = (c.match(/<h3>([\s\S]*?)<\/h3>/) || [])[1] || "";
    const metas = [];
    const mr = /<p class="meta">([\s\S]*?)<\/p>/g;
    let m;
    while ((m = mr.exec(c))) metas.push(m[1]);
    return { name: h3, html: c, metas: metas, key: (c.match(/data-open="([^"]*)"/) || [])[1] || "" };
  });
}

function blankBits(html, label) {
  const bad = [];
  if (/<p class="meta">\s*<\/p>/.test(html)) bad.push("empty meta line");
  if (/<p class="meta">\s*·/.test(html)) bad.push("line starting with a bare ·");
  if (/·\s*<\/p>/.test(html)) bad.push("line ending with a bare ·");
  if (/Prompt ·\s*<\/p>/.test(html)) bad.push("bare Prompt label");
  if (/Ext\s*(·|<|$)/.test(html) || /Ext 0/.test(html)) bad.push("bare Ext label");
  if (/mailto:(\?|"|$)/.test(html) || /sms:(\?|"|$)/.test(html)) bad.push("empty mailto/sms");
  if (/href="#"/.test(html)) bad.push("href=#");
  check(!bad.length, label + " has no blank pieces" + (bad.length ? " (found: " + bad.join(", ") + ")" : ""));
}

function linkState(el) {
  const shown = !el.hidden && el.style.display !== "none";
  return { shown: shown, href: el.getAttribute("href") };
}
function linkClean(el, label) {
  const s = linkState(el);
  const bareHref = s.href === null || s.href === "" || s.href === "#" || /^(mailto|sms):(\?|$)/.test(s.href);
  check(!(s.shown && bareHref), label + " is hidden when there is no address (shown=" + s.shown + ", href=" + JSON.stringify(s.href) + ")");
  check(!(s.href !== null && bareHref && s.href !== ""), label + " carries no bare '#' / 'mailto:' / 'sms:' href");
}

function r409(r) { return r.els.banner.textContent === SAME_NAME; }

// desk-inbox.js in a tiny DOM: returns the inbox HTML for one /api/admin reply.
async function runInbox(adminReply) {
  const inboxEl = makeEl("section", "desk-inbox", {});
  const document = {
    readyState: "complete",
    getElementById(id) { return id === "desk-inbox" ? inboxEl : null; },
    createElement(tag) { return makeEl(tag, "", {}); },
    addEventListener() {},
    body: { insertBefore() {}, firstChild: null }
  };
  const localStorage = makeStore({ aia_ws: "shop-a", aia_session: "tok" });
  async function fetch() { return { status: 200, json: async () => JSON.parse(JSON.stringify(adminReply)) }; }
  const ctx = { document, localStorage, fetch, console, Date, JSON, Promise, setTimeout };
  ctx.window = ctx;
  vm.createContext(ctx);
  try { vm.runInContext(inboxSrc, ctx, { filename: "desk-inbox.js" }); } catch (e) { fail("desk-inbox.js runs: " + e.message); return ""; }
  for (let i = 0; i < 6; i++) await tick();
  return inboxEl.innerHTML;
}

// history.html seat helpers, lifted out of the page script and run alone.
function historyView() {
  const names = ["seatHdr", "openSeat", "whoPeopleHref", "paintWhoPeople", "historyAsk", "historyBody"];
  const lines = historySrc.split("\n");
  const pick = lines.filter((l) => /^var seatId=|^var SAME_NAME=/.test(l) || names.some((n) => l.indexOf("function " + n + "(") === 0 || l.indexOf("async function " + n + "(") === 0));
  if (pick.length < 8) return null;
  async function boot(status, reply) {
    const calls = [];
    const a = makeEl("a", "who-people", { href: "/people" });
    const ctx = {
      document: { getElementById(id) { return id === "who-people" ? a : null; } },
      localStorage: makeStore({ aia_ws: "shop-a", aia_session: "tok" }),
      AIADesks: { list: () => deskList.slice() },
      phone: () => deskList.slice(),
      fetch: async (p, o) => { calls.push({ path: p, ws: o && o.headers && o.headers["X-Workspace"] }); return { status: status, json: async () => JSON.parse(JSON.stringify(reply)) }; },
      encodeURIComponent, JSON, Promise, String
    };
    vm.createContext(ctx);
    vm.runInContext("var who=\"\",slug=\"\",lane=\"all\",when=\"all\",q=\"\",work=\"\",pipe=\"\",since=\"\",advanced=false,flags={money:0};\n" + pick.join("\n") + "\nthis.__get=function(){return {who:who,seatNote:seatNote,href:whoPeopleHref(),seatId:seatId,body:historyBody(historyAsk(phone()))};};this.__set=function(w){who=w;seatId=\"\";};", ctx);
    return { ctx, calls, a };
  }
  return {
    async run(id, desk, status, reply) {
      const b = await boot(status, reply);
      const result = await b.ctx.openSeat(id, desk);
      b.ctx.paintWhoPeople();
      const g = b.ctx.__get();
      const shown = !b.a.hidden && b.a.style.display !== "none";
      return { result, path: b.calls[0] && b.calls[0].path, ws: b.calls[0] && b.calls[0].ws, who: g.who, note: g.seatNote, href: shown ? (b.a.getAttribute("href") || "") : "", body: g.body };
    },
    async nameOnly(name) {
      const b = await boot(200, {});
      b.ctx.__set(name);
      b.ctx.paintWhoPeople();
      const shown = !b.a.hidden && b.a.style.display !== "none";
      return shown ? (b.a.getAttribute("href") || "") : "";
    },
    async nameBody(name) {
      const b = await boot(200, {});
      b.ctx.__set(name);
      return b.ctx.__get().body;
    }
  };
}

// desk-handoff.js on a fake queue with one card. pick(value, status) taps Hand to with that picker value.
async function runHandoff(peopleList, job) {
  const banner = makeEl("div", "banner", {});
  const sel = makeEl("select", "hand-to-" + job.id, {});
  const calls = [];
  let status = 200;
  let rowHtml = "";
  const article = makeEl("article", "", {});
  article.querySelector = () => null;
  article.appendChild = (el) => { if (el && /<select/.test(el.innerHTML || "")) rowHtml = el.innerHTML; };
  const h3 = { textContent: job.title };
  article.querySelector = (q) => (q === "h3" ? h3 : null);
  const document = {
    readyState: "complete",
    getElementById(id) { return id === "banner" ? banner : (id === "hand-to-" + job.id ? sel : null); },
    createElement(tag) {
      const el = makeEl(tag, "", {});
      el.querySelectorAll = () => [makeEl("button", "", {}), makeEl("button", "", {})];
      return el;
    },
    querySelectorAll(q) { return q === "#queue article.item" ? [article] : []; },
    addEventListener() {}
  };
  const ctx = {
    document, console, JSON, Promise,
    PEOPLE: peopleList, JOBS: [job],
    api: async (p, o) => { calls.push({ path: p, body: o && o.body ? JSON.parse(o.body) : {} }); return { status: status, data: status >= 400 ? { error: "server said no" } : { ok: true } }; }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  try { vm.runInContext(handoffSrc, ctx, { filename: "desk-handoff.js" }); } catch (e) { fail("desk-handoff.js runs: " + e.message); }
  return {
    rowHtml,
    async pick(value, st) {
      status = st || 200;
      banner.textContent = "";
      sel.value = value;
      const before = calls.length;
      await ctx.handCardTo(job.id);
      const c = calls.slice(before).find((x) => x.path === "/api/jobs" && x.body.action === "assign");
      return { body: c ? c.body : null, banner: banner.textContent };
    }
  };
}
// Cut a piece of source from `start` (or `start`..`after`) to the first `end` after it.
function lift(text, start, after, end) {
  const i = text.indexOf(start);
  if (i < 0) return null;
  const from = after ? text.indexOf(after, i) : i;
  if (from < 0) return null;
  const j = text.indexOf(end, from);
  if (j < 0) return null;
  return text.slice(i, j + end.length);
}
// Run a lifted hand-off function (desk-card.js handTo / desk-queue.js handOffTo) alone.
async function runHandTo(code, fnName, peopleList, args, status) {
  const banner = makeEl("div", "banner", {});
  const sel = makeEl("select", "hand-to", {});
  sel.value = fnName === "handTo" ? args[0] : "";
  const calls = [];
  const sheet = makeEl("div", "sheet", {});
  sheet.classList = { remove() {}, add() {} };
  const ctx = {
    document: { getElementById(id) { return id === "banner" ? banner : id === "hand-to" ? sel : id === "sheet" ? sheet : null; } },
    PEOPLE: peopleList, JSON, Promise, String, console,
    api: async (p, o) => { calls.push({ path: p, body: o && o.body ? JSON.parse(o.body) : {} }); return { status: status, data: status >= 400 ? { error: "server said no" } : { ok: true } }; },
    load: async () => {}, openJob: () => {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(code + "\nthis.__fn = " + fnName + ";", ctx);
  if (fnName === "handTo") await ctx.__fn("j1"); else await ctx.__fn(args[0], args[1]);
  const c = calls.find((x) => x.path === "/api/jobs" && x.body.action === "assign");
  return { body: c ? c.body : null, banner: banner.textContent };
}

// ---------- fixtures ----------
const helperA = {
  ok: true,
  you: { id: "s_hal", name: "Hal", role: "employee", kind: "helper", status: "approved", email: "hal@x.test", accountId: "" },
  shop: { name: "Shop A" },
  people: [
    { id: "s_ann", name: "Ann", role: "owner", kind: "owner", status: "approved", email: "", accountId: "" },
    { id: "s_sam1", name: "Sam", role: "employee", kind: "helper", status: "approved", email: "", accountId: "" },
    { id: "s_sam2", name: "Sam", role: "employee", kind: "family", status: "approved", email: "", accountId: "" },
    { id: "s_hal", name: "Hal", role: "employee", kind: "helper", status: "approved", email: "hal@x.test", accountId: "" },
    { id: "s_ai", name: "Worker", role: "agent", kind: "agent", status: "approved", deskAi: true, does: "Drafts replies", crew: "Worker", aia: "", email: "", accountId: "" },
    { id: "s_zed", name: "<img src=x onerror=alert(1)>Zed", role: "employee", kind: "helper", status: "pending", email: "", accountId: "" }
  ],
  levels: []
};
const helperB = {
  ok: true,
  you: { id: "s_halb", name: "Hal", role: "employee", kind: "helper", status: "approved", email: "hal@x.test", accountId: "" },
  shop: { name: "Shop B" },
  people: [
    { id: "s_sam9", name: "Sam", role: "employee", kind: "helper", status: "approved", email: "", accountId: "" },
    { id: "s_halb", name: "Hal", role: "employee", kind: "helper", status: "approved", email: "hal@x.test", accountId: "" }
  ],
  levels: []
};
const ownerA = {
  ok: true,
  you: { id: "s_ann", name: "Ann", role: "owner", kind: "owner", status: "approved", email: "ann@x.test", accountId: "acct_ann" },
  shop: { name: "Shop A" },
  people: [
    { id: "s_ann", name: "Ann", role: "owner", kind: "owner", status: "approved", email: "ann@x.test", accountId: "acct_ann", phone: "555-0100" },
    { id: "s_sam1", name: "Sam", role: "employee", kind: "helper", status: "approved", email: "sam1@x.test", accountId: "", phone: "555-0101" },
    { id: "s_sam2", name: "Sam", role: "employee", kind: "family", status: "approved", email: "sam2@x.test", accountId: "" },
    { id: "s_bo", name: "Bo", role: "employee", kind: "staff", status: "approved", email: "bo@x.test", accountId: "acct_bo", phone: "555-0102" },
    { id: "s_ai", name: "Worker", role: "agent", kind: "agent", status: "approved", deskAi: true, does: "Drafts replies", prompt: "Draft a short polite reply.", aiId: "ai_1", email: "ai@x.test", accountId: "" },
    { id: "s_kit", name: "Kit", role: "employee", kind: "helper", status: "approved", email: "", accountId: "acct_kit" },
    { id: "s_pat1", name: "Pat", role: "employee", kind: "helper", status: "pending", email: "", accountId: "" },
    { id: "s_pat2", name: "Pat", role: "employee", kind: "family", status: "pending", email: "", accountId: "" }
  ],
  levels: []
};
const ownerB = {
  ok: true,
  you: { id: "s_annb", name: "Ann", role: "owner", kind: "owner", status: "approved", email: "ann@x.test", accountId: "acct_ann" },
  shop: { name: "Shop B" },
  people: [
    { id: "s_sam1b", name: "Sam", role: "employee", kind: "helper", status: "approved", email: "SAM1@x.test ", accountId: "" },
    { id: "s_bob", name: "Bobby", role: "employee", kind: "helper", status: "approved", email: "bo.other@x.test", accountId: "acct_bo" },
    { id: "s_kitb", name: "Kit", role: "employee", kind: "helper", status: "approved", email: "", accountId: "acct_kit" }
  ],
  levels: []
};
const deskList = [{ slug: "shop-a", name: "Shop A", token: "t1" }, { slug: "shop-b", name: "Shop B", token: "t2" }];
const helperBook = (body) => ({
  ok: true,
  person: { id: body.id, name: body.name, role: "employee", kind: "helper", status: "approved", email: body.id === "s_hal" ? "hal@x.test" : "", accountId: "", phone: "", desks: 1 },
  seats: [{ id: body.id, desk: "Shop A", slug: "shop-a", kind: "helper", status: "approved", holding: 0, ext: 0, done: 0, lastSeen: null }],
  cards: [], history: [], lastCard: null, currentSlug: "shop-a"
});
const ownerBook = (body) => ({
  ok: true,
  person: { id: body.id, name: body.name, email: body.email || "", accountId: body.accountId || "", phone: body.id === "s_sam1" ? "555-0101" : "", desks: 1 },
  seats: [{ id: body.id, desk: "Shop A", slug: "shop-a", kind: "helper", status: "approved", holding: 1, ext: 2, done: 0, lastSeen: null }],
  cards: [], history: [], lastCard: null, currentSlug: "shop-a"
});

(async function main() {
  if (display) {
    const extra = [];
    [helperA, helperB].forEach((d) => d.people.forEach((p) => Object.keys(p).forEach((k) => { if (display.indexOf(k) < 0) extra.push(k); })));
    check(!extra.length, "helper fixtures only carry fields 372's trim lets through" + (extra.length ? " (extra: " + extra.join(",") + ")" : ""));
  }

  // ---- helper, one desk ----
  const h1 = await render({ current: "shop-a", desks: { "shop-a": helperA }, person: helperBook });
  const hCards = cardsOf(h1.els.list.innerHTML);
  const sams = hCards.filter((c) => c.name === "Sam");
  check(sams.length === 2, "helper, one desk: two different seats named Sam stay two cards (got " + sams.length + ")");
  check(new Set(sams.map((c) => c.key)).size === sams.length, "helper, one desk: each Sam card has its own key");
  check(hCards.length === 6, "helper, one desk: six seats, six cards (got " + hCards.length + ")");
  blankBits(h1.els.list.innerHTML, "helper, one desk: card list");
  check(h1.els.list.innerHTML.indexOf("<img") < 0 && h1.els.list.innerHTML.indexOf("&lt;img src=x onerror=alert(1)&gt;Zed") >= 0, "helper: stranger-typed name stays escaped");
  const halCard = hCards.find((c) => c.name === "Hal");
  check(!!halCard && halCard.metas[0] === "hal@x.test", "helper: own seat still shows own email (got " + JSON.stringify(halCard && halCard.metas[0]) + ")");
  const samGrouped = h1.ctx.STATE.people.filter((p) => p.name === "Sam");
  check(samGrouped.length === 2 && samGrouped.every((p) => p.seats.length === 1), "helper: grouped rows keep one seat per Sam");

  // helper opens a Sam: no email, no phone
  const samRow = samGrouped[0];
  await h1.ctx.openSheet(samRow);
  const personCall = h1.calls.filter((c) => c.body.action === "person").pop();
  check(!!personCall && personCall.body.id === samRow.id, "helper: sheet asks for that seat's id");
  linkClean(h1.els["sheet-mail"], "helper sheet: Email it");
  linkClean(h1.els["sheet-text"], "helper sheet: Text it");
  blankBits(h1.els["sheet-seats"].innerHTML, "helper sheet: seat rows");
  check(h1.els["sheet-name"].textContent === "Sam", "helper sheet: name set with textContent");
  // helper opens own seat: Email it comes back, Text it stays hidden
  await h1.ctx.openSheet(h1.ctx.STATE.people.find((p) => p.name === "Hal"));
  const ms = linkState(h1.els["sheet-mail"]);
  check(ms.shown && /^mailto:hal%40x\.test\?subject=/.test(ms.href || ""), "helper sheet, own seat: Email it shows again with own address");
  linkClean(h1.els["sheet-text"], "helper sheet, own seat: Text it");

  // ---- helper, All desks ----
  const h2 = await render({ current: "shop-a", all: true, desksList: deskList, desks: { "shop-a": helperA, "shop-b": helperB }, person: helperBook });
  const allCards = cardsOf(h2.els.list.innerHTML);
  const allSams = allCards.filter((c) => c.name === "Sam");
  check(allSams.length === 3, "helper, All desks: three Sam seats on two desks stay three cards (got " + allSams.length + ")");
  const halAll = allCards.filter((c) => c.name === "Hal");
  check(halAll.length === 1 && halAll[0].metas[0] === "hal@x.test · Several desks", "helper, All desks: own seats still group by own email (got " + JSON.stringify(halAll.map((c) => c.metas[0])) + ")");
  blankBits(h2.els.list.innerHTML, "helper, All desks: card list");

  // ---- owner, one desk ----
  const o1 = await render({ current: "shop-a", desks: { "shop-a": ownerA }, person: ownerBook });
  const oKeys = o1.ctx.STATE.people.map((p) => p.key);
  check(JSON.stringify(oKeys) === JSON.stringify(["account:acct_ann", "email:sam1@x.test", "email:sam2@x.test", "account:acct_bo", "email:ai@x.test", "account:acct_kit", "seat:shop-a:s_pat1", "seat:shop-a:s_pat2"]), "owner, one desk: grouping keys as before (got " + JSON.stringify(oKeys) + ")");
  const oCards = cardsOf(o1.els.list.innerHTML);
  const metaOf = (n) => oCards.filter((c) => c.name === n).map((c) => c.metas[0]);
  check(JSON.stringify(metaOf("Ann")) === JSON.stringify(["555-0100 · ann@x.test"]), "owner: Ann line reads phone · email (got " + JSON.stringify(metaOf("Ann")) + ")");
  check(JSON.stringify(metaOf("Sam")) === JSON.stringify(["555-0101 · sam1@x.test", "sam2@x.test"]), "owner: Sam lines read as before (got " + JSON.stringify(metaOf("Sam")) + ")");
  const worker = oCards.find((c) => c.name === "Worker");
  check(!!worker && worker.html.indexOf("<p class=\"meta\">Prompt · Draft a short polite reply.</p>") >= 0, "owner: Desk AI prompt summary still shows");
  check(!!worker && worker.html.indexOf("form class=\"ai-edit\" data-ai=\"ai_1\"") >= 0, "owner: Desk AI edit form still there");
  blankBits(o1.els.list.innerHTML, "owner, one desk: card list");
  await o1.ctx.openSheet(o1.ctx.STATE.people.find((p) => p.key === "email:sam1@x.test"));
  const om = linkState(o1.els["sheet-mail"]);
  const ot = linkState(o1.els["sheet-text"]);
  check(om.shown && om.href === "mailto:sam1%40x.test?subject=Desk%20invite&body=" + encodeURIComponent(o1.els["sheet-copy"].textContent), "owner sheet: Email it unchanged (" + om.href + ")");
  check(ot.shown && ot.href === "sms:555-0101?body=" + encodeURIComponent(o1.els["sheet-copy"].textContent), "owner sheet: Text it unchanged (" + ot.href + ")");
  check(/Holding 1 · Ext 2/.test(o1.els["sheet-seats"].innerHTML), "owner sheet: seat row still shows Holding / Ext counts");

  // ---- owner, All desks ----
  const o2 = await render({ current: "shop-a", all: true, desksList: deskList, desks: { "shop-a": ownerA, "shop-b": ownerB }, person: ownerBook });
  const o2Keys = o2.ctx.STATE.people.map((p) => p.key + "=" + p.seats.length);
  check(JSON.stringify(o2Keys) === JSON.stringify(["account:acct_ann=1", "email:sam1@x.test=2", "email:sam2@x.test=1", "account:acct_bo=2", "email:ai@x.test=1", "account:acct_kit=2", "seat:shop-a:s_pat1=1", "seat:shop-a:s_pat2=1"]), "owner, All desks: same account / same email still merge (got " + JSON.stringify(o2Keys) + ")");
  const o2Cards = cardsOf(o2.els.list.innerHTML);
  check(JSON.stringify(o2Cards.filter((c) => c.name === "Sam").map((c) => c.metas[0])) === JSON.stringify(["555-0101 · sam1@x.test · Several desks", "sam2@x.test"]), "owner, All desks: Sam lines read as before");
  check(JSON.stringify(o2Cards.filter((c) => c.name === "Kit").map((c) => c.metas[0])) === JSON.stringify(["Several desks"]), "owner, All desks: no phone or email reads just 'Several desks', no leading ' · ' (got " + JSON.stringify(o2Cards.filter((c) => c.name === "Kit").map((c) => c.metas[0])) + ")");
  blankBits(o2.els.list.innerHTML, "owner, All desks: card list");
  check(JSON.stringify(o2Cards.filter((c) => c.name === "Bo").map((c) => c.metas[0])) === JSON.stringify(["555-0102 · bo@x.test · Several desks"]), "owner, All desks: Bo line reads as before");

  // ---- Accept / Deny / Say hit the seat the sheet opened (people-desk.js) ----
  const od = await render({ current: "shop-a", withDesk: true, desks: { "shop-a": ownerA }, person: ownerBook });
  const pats = od.ctx.STATE.people.filter((p) => p.name === "Pat");
  check(pats.length === 2, "owner: two pending Pat seats are two cards (got " + pats.length + ")");
  const pat1 = pats.find((p) => p.id === "s_pat1");
  const pat2 = pats.find((p) => p.id === "s_pat2");
  await od.ctx.openSheet(pat2);
  let got = await tap(od, "sheet-approve", "approve");
  check(got === "s_pat2", "owner opens the second Pat: Accept targets s_pat2 (got " + got + ")");
  await od.ctx.openSheet(pat2);
  got = await tap(od, "sheet-deny", "deny");
  check(got === "s_pat2", "owner opens the second Pat: Deny targets s_pat2 (got " + got + ")");
  await od.ctx.openSheet(pat2);
  got = await tap(od, "sheet-say-btn", "say", "hello second Pat");
  check(got === "s_pat2", "owner opens the second Pat: Say targets s_pat2 (got " + got + ")");
  await od.ctx.openSheet(pat1);
  got = await tap(od, "sheet-approve", "approve");
  check(got === "s_pat1", "owner opens the first Pat: Accept targets s_pat1 (got " + got + ")");
  await od.ctx.openSheet(od.ctx.STATE.people.find((p) => p.name === "Bo"));
  got = await tap(od, "sheet-approve", "approve");
  check(got === "s_bo", "owner: Accept on a one-of-a-kind name still targets that seat (got " + got + ")");
  // a seat that is gone from the list: no tap lands on a same-name stranger
  od.els.sheet.setAttribute("data-seat", "s_gone");
  od.els.sheet.setAttribute("data-key", "seat:shop-a:s_gone");
  od.els["sheet-name"].textContent = "Pat";
  got = await tap(od, "sheet-approve", "approve");
  check(got === null, "owner: a seat no longer on the list does not fall back to a same-name seat (got " + got + ")");
  got = await tap(od, "sheet-say-btn", "say", "anyone there");
  check(got === null, "owner: Say on a seat no longer on the list does not land anywhere (got " + got + ")");
  // no seat on the sheet at all: the old name match still works
  od.els.sheet.removeAttribute("data-seat");
  od.els.sheet.removeAttribute("data-key");
  od.els.sheet.removeAttribute("data-desk");
  od.els["sheet-name"].textContent = "Bo";
  got = await tap(od, "sheet-approve", "approve");
  check(got === "s_bo", "owner: with no seat on the sheet, the name is still the fallback (got " + got + ")");

  const hd = await render({ current: "shop-a", withDesk: true, desks: { "shop-a": helperA }, person: helperBook });
  const hSam2 = hd.ctx.STATE.people.find((p) => p.id === "s_sam2");
  await hd.ctx.openSheet(hSam2);
  got = await tap(hd, "sheet-say-btn", "say", "hi Sam");
  check(got === "s_sam2", "helper opens the second Sam: Say targets s_sam2 (got " + got + ")");
  const hSam1 = hd.ctx.STATE.people.find((p) => p.id === "s_sam1");
  await hd.ctx.openSheet(hSam1);
  got = await tap(hd, "sheet-say-btn", "say", "hi other Sam");
  check(got === "s_sam1", "helper opens the first Sam: Say targets s_sam1 (got " + got + ")");

  // ---- the sheet opens by seat id + desk (372's GET /api/admin?seat=<id>&desk=<slug>) ----
  const sOpen = await render({ current: "shop-a", all: true, desksList: deskList, desks: { "shop-a": helperA, "shop-b": helperB }, person: helperBook });
  const sSam9 = sOpen.ctx.STATE.people.find((p) => p.id === "s_sam9");
  let before = sOpen.calls.length;
  await sOpen.ctx.openSheet(sSam9);
  let fresh = sOpen.calls.slice(before);
  const seatGet = fresh.find((c) => /^\/api\/admin\?/.test(c.path));
  const seatQ = seatGet ? new URLSearchParams(seatGet.path.split("?")[1]) : new URLSearchParams("");
  check(!!seatGet && seatQ.get("seat") === "s_sam9" && seatQ.get("desk") === "shop-b", "sheet: GET /api/admin?seat=<id>&desk=<slug> for the open seat (got " + (seatGet && seatGet.path) + ")");
  check(!!seatGet && seatGet.ws === "shop-b", "sheet: the seat GET goes to that seat's own desk, so that desk resolves it (got " + (seatGet && seatGet.ws) + ")");
  check(fresh.every((c) => !/[?&](who|name|person)=/.test(c.path)), "sheet: no ?who= / ?name= lookup when the seat id is known");
  const pPost = fresh.find((c) => c.body.action === "person");
  check(!!pPost && pPost.body.id === "s_sam9" && pPost.body.desk === "shop-b", "sheet: POST person sends the seat id and desk (got " + JSON.stringify(pPost && { id: pPost.body.id, desk: pPost.body.desk }) + ")");
  check(!!pPost && !("email" in pPost.body) && !("accountId" in pPost.body) && !("name" in pPost.body), "sheet: POST person sends no email / accountId / name as identity (keys " + JSON.stringify(pPost && Object.keys(pPost.body)) + ")");
  check(sOpen.els.sheet.getAttribute("data-seat") === "s_sam9" && sOpen.els.sheet.getAttribute("data-desk") === "shop-b", "sheet: open seat and desk set on the sheet");
  // the owner seat: p_owner is on every desk, so the desk picks which owner
  const ownerSeatA = { ok: true, you: { id: "p_owner", name: "Ann", role: "owner", kind: "owner", status: "approved", email: "ann@x.test", accountId: "acct_ann" }, shop: { name: "Shop A" }, people: [{ id: "p_owner", name: "Ann", role: "owner", kind: "owner", status: "approved", email: "ann@x.test", accountId: "acct_ann" }], levels: [] };
  const ownerSeatB = { ok: true, you: { id: "p_owner", name: "Ann", role: "owner", kind: "owner", status: "approved", email: "ann@x.test", accountId: "acct_ann" }, shop: { name: "Shop B" }, people: [{ id: "p_owner", name: "Dee", role: "owner", kind: "owner", status: "approved", email: "dee@x.test", accountId: "acct_dee" }], levels: [] };
  const sOwn = await render({ current: "shop-a", all: true, desksList: deskList, desks: { "shop-a": ownerSeatA, "shop-b": ownerSeatB }, person: ownerBook, search: "?seat=p_owner&desk=shop-b" });
  for (let i = 0; i < 6; i++) await tick();
  const ownGet = sOwn.calls.find((c) => /^\/api\/admin\?/.test(c.path));
  const ownQ = ownGet ? new URLSearchParams(ownGet.path.split("?")[1]) : new URLSearchParams("");
  check(!!ownGet && ownQ.get("seat") === "p_owner" && ownQ.get("desk") === "shop-b" && ownGet.ws === "shop-b", "link ?seat=p_owner&desk=shop-b opens shop-b's owner, on shop-b (got " + (ownGet && ownGet.path + " on " + ownGet.ws) + ")");
  check(sOwn.els.sheet.getAttribute("data-seat") === "p_owner" && sOwn.els.sheet.getAttribute("data-desk") === "shop-b", "link ?seat=&desk=: the sheet holds that desk's owner seat");

  // ---- 409: two seats share a name -> plain line, nobody's data, no name fallback ----
  const book409 = () => ({ __status: 409, ok: false, error: "More than one seat has that name." });
  const c1 = await render({ current: "shop-a", withDesk: true, desks: { "shop-a": ownerA }, person: ownerBook, seatBook: (q) => (q.get("seat") === "s_pat2" ? book409() : ownerBook({ id: q.get("seat"), name: "" })) });
  await c1.ctx.openSheet(c1.ctx.STATE.people.find((p) => p.name === "Bo"));
  const pat2b = c1.ctx.STATE.people.find((p) => p.id === "s_pat2");
  check(c1.els["sheet-name"].textContent === "Bo" && c1.els.sheet.getAttribute("data-seat") === "s_bo", "409 setup: Bo's sheet is open first");
  await c1.ctx.openSheet(pat2b);
  const quiet = (r) => r.els["sheet-name"].textContent === "" && r.els["sheet-seats"].innerHTML === "" && r.els["sheet-yours"].innerHTML === "" &&
    r.els["sheet-theirs"].innerHTML === "" && r.els["sheet-history"].innerHTML === "" && r.els["sheet-copy"].textContent === "" && r.els.sheet.getAttribute("data-seat") === "";
  check(r409(c1), "409 on the seat GET: the plain line shows (got " + JSON.stringify(c1.els.banner.textContent) + ")");
  check(quiet(c1) && c1.els.sheet.hidden === true, "409 on the seat GET: nobody's data on the sheet (name " + JSON.stringify(c1.els["sheet-name"].textContent) + ", seat " + JSON.stringify(c1.els.sheet.getAttribute("data-seat")) + ")");
  const afterGet = c1.calls.slice(c1.calls.map((c) => /^\/api\/admin\?/.test(c.path)).lastIndexOf(true) + 1);
  check(!afterGet.some((c) => c.body.action === "person") && !afterGet.some((c) => /[?&](who|name)=/.test(c.path)), "409: no name lookup or person POST after the 409");
  c1.ctx.STATE.people.push({ key: "seat:shop-a:s_noname", id: "s_noname", name: "", seats: [{ id: "s_noname", deskSlug: "shop-a" }] });
  got = await tap(c1, "sheet-approve", "approve");
  check(got === null, "409: Accept after a 409 lands on nobody, not even a seat with no name (got " + got + ")");
  const c2 = await render({ current: "shop-a", desks: { "shop-a": ownerA }, person: () => book409(), seatBook: (q) => ownerBook({ id: q.get("seat"), name: "Pat" }) });
  await c2.ctx.openSheet(c2.ctx.STATE.people.find((p) => p.id === "s_pat1"));
  check(r409(c2) && quiet(c2), "409 on POST person: plain line and nobody's data");
  const c3 = await render({ current: "shop-a", desks: { "shop-a": ownerA }, person: ownerBook, search: "?who=Pat" });
  for (let i = 0; i < 6; i++) await tick();
  check(r409(c3) && quiet(c3) && !c3.calls.some((c) => c.body.action === "person" || /^\/api\/admin\?/.test(c.path)), "old ?who=Pat link with two Pats: plain line, nobody opened");
  const c4 = await render({ current: "shop-a", desks: { "shop-a": ownerA }, person: ownerBook, search: "?who=Pa" });
  for (let i = 0; i < 6; i++) await tick();
  check(!c4.calls.some((c) => c.body.action === "person"), "old ?who= link: no partial-name match");

  // ---- links carry the seat id and desk, not the name ----
  const lk = await render({ current: "shop-a", desks: { "shop-a": ownerA }, person: ownerBook });
  await lk.ctx.openSheet(lk.ctx.STATE.people.find((p) => p.id === "s_pat2"));
  const hl = lk.els["sheet-history-link"].getAttribute("href") || "";
  check(hl === "/history?seat=s_pat2&desk=shop-a#account-road", "people.js Full history link carries seat + desk (got " + JSON.stringify(hl) + ")");
  check(src.indexOf("?who=\" +") < 0 && src.indexOf("/history?who=") < 0, "people.js builds no ?who= link");

  const inbox = await runInbox({ ok: true, you: { id: "p_owner", role: "owner", kind: "owner", name: "Ann" }, people: [
    { id: "s_pat1", name: "Pat", status: "pending", kind: "helper" },
    { id: "s_pat2", name: "Pat", status: "pending", kind: "family" },
    { id: "s_ann", name: "Ann", status: "approved" }
  ], connections: [{ id: "c_1", label: "Pat", status: "pending" }] });
  const inLinks = (inbox.match(/href="\/people\?[^"]*"/g) || []);
  check(inLinks.length === 2 && inLinks[0] === 'href="/people?seat=s_pat1&desk=shop-a&f=waiting"' && inLinks[1] === 'href="/people?seat=s_pat2&desk=shop-a&f=waiting"', "desk-inbox.js Open on People carries seat + desk; a pipe gets no link (got " + JSON.stringify(inLinks) + ")");
  check(inboxSrc.indexOf("/people?who=") < 0, "desk-inbox.js builds no ?who= link");
  const inbox2 = await runInbox({ ok: true, you: { role: "owner", kind: "owner" }, people: [{ id: "s_x", name: "Lee", status: "approved" }], asks: [{ name: "Lee", status: "pending" }] });
  const in2 = (inbox2.match(/href="\/people\?[^"]*"/g) || []);
  check(in2.length === 1 && in2[0] === 'href="/people?seat=s_x&desk=shop-a&f=waiting"', "desk-inbox.js: a row with no id links to the one seat with that name (got " + JSON.stringify(in2) + ")");
  const inbox3 = await runInbox({ ok: true, you: { role: "owner", kind: "owner" }, people: [{ id: "s_k1", name: "Kim", status: "approved" }, { id: "s_k2", name: "Kim", status: "approved" }], asks: [{ name: "Kim", status: "pending" }] });
  check(inbox3.indexOf("Kim asked to sit") >= 0 && !/href="\/people\?/.test(inbox3), "desk-inbox.js: a row with no id and a shared name gets no link");
  const inbox4 = await runInbox({ ok: true, you: { role: "owner", kind: "owner" }, people: [{ id: "s_m1", name: "Max", status: "approved" }], asks: [{ name: "Moe", status: "pending" }] });
  check(inbox4.indexOf("Moe asked to sit") >= 0 && !/href="\/people\?/.test(inbox4), "desk-inbox.js: a row with no id and no matching seat gets no link");

  const hv = historyView();
  if (hv) {
    let ok = await hv.run("s_pat2", "shop-b", 200, { ok: true, person: { id: "s_pat2", name: "Pat" } });
    check(ok.result === true && ok.href === "/people?seat=s_pat2&desk=shop-b", "history.html Open on People carries seat + desk (got " + JSON.stringify(ok.href) + ")");
    check(!!ok.path && new URLSearchParams(ok.path.split("?")[1]).get("seat") === "s_pat2" && new URLSearchParams(ok.path.split("?")[1]).get("desk") === "shop-b" && !/[?&]who=/.test(ok.path), "history.html resolves the seat by GET ?seat=&desk= (got " + ok.path + ")");
    check(ok.ws === "shop-b", "history.html asks the seat's own desk (got " + ok.ws + ")");
    let bad = await hv.run("s_pat2", "shop-a", 409, { ok: false, error: "x" });
    check(bad.note === SAME_NAME && bad.who === "" && bad.href === "", "history.html 409: plain line, no person filter, no link (got " + JSON.stringify(bad) + ")");
    const body = ok.body || {};
    check(body.action === "history" && body.seat === "s_pat2" && body.desk === "shop-b", "history.html: POST /api/desks history sends seat + desk when the seat is known (got " + JSON.stringify({ seat: body.seat, desk: body.desk }) + ")");
    check(!("who" in body), "history.html: no who= filter when the seat is known (keys " + JSON.stringify(Object.keys(body)) + ")");
    check(JSON.stringify((body.desks || []).map((d) => d.slug)) === JSON.stringify(["shop-b"]), "history.html: asks the seat's own desk so the server can open it (got " + JSON.stringify(body.desks) + ")");
    check(!("seat" in (bad.body || {})) && !("who" in (bad.body || {})), "history.html 409: the history ask carries no seat and no name (got " + JSON.stringify(bad.body) + ")");
    const nb = await hv.nameBody("Sam");
    check(nb.who === "Sam" && !("seat" in nb) && (nb.desks || []).length === 2, "history.html: with no seat, the free-text who filter still works over every desk");
    let nameOnly = await hv.nameOnly("Sam");
    check(nameOnly === "", "history.html: a name with no seat gets no People link (got " + JSON.stringify(nameOnly) + ")");
  } else fail("history.html seat helpers (seatHdr / openSeat / whoPeopleHref / paintWhoPeople) not found");
  check(historySrc.indexOf("/people?who=") < 0, "history.html builds no ?who= link");
  check(/ var body=historyBody\(asked\);/.test(historySrc) && /,asked=historyAsk\(rows\);/.test(historySrc) && historySrc.indexOf("who:who,kind:work") < 0, "history.html load() uses the seat-aware history ask");

  // ---- whoTapped: the server credits the session's own seat; the client no longer names it ----
  check(queueSrc.indexOf("whoTapped") < 0, "desk-queue.js sends no whoTapped (" + (queueSrc.match(/whoTapped/g) || []).length + " left)");
  check(cardSrc.indexOf("whoTapped") < 0, "desk-card.js sends no whoTapped (" + (cardSrc.match(/whoTapped/g) || []).length + " left)");
  check(handoffSrc.indexOf("whoTapped") < 0, "desk-handoff.js sends no whoTapped");

  // ---- hand-off by seat id ----
  const deskPeople = [
    { id: "s_sam1", name: "Sam", role: "employee", status: "approved" },
    { id: "s_sam2", name: "Sam", role: "employee", status: "approved" },
    { id: "s_bo", name: "Bo", role: "employee", status: "approved" },
    { id: "s_new", name: "Nia", role: "employee", status: "pending" }
  ];
  const ho = await runHandoff(deskPeople, { id: "j1", title: "Fix sink", status: "held", assignee: "Sam", assigneeId: "s_sam2" });
  const optVals = (ho.rowHtml.match(/<option value="([^"]*)"/g) || []).map((o) => o.replace(/^<option value="|"$/g, ""));
  check(JSON.stringify(optVals) === JSON.stringify(["s_sam1", "s_sam2", "s_bo"]), "desk-handoff.js picker values are seat ids (got " + JSON.stringify(optVals) + ")");
  check(/<option value="s_sam2" selected>/.test(ho.rowHtml) && !/<option value="s_sam1" selected>/.test(ho.rowHtml), "desk-handoff.js picker selects the holder by seat id, not the name");
  let hr = await ho.pick("s_sam2");
  check(!!hr.body && hr.body.action === "assign" && hr.body.to === "s_sam2" && !("name" in hr.body) && !("whoTapped" in hr.body), "desk-handoff.js: hand-off sends assign {to:<seat id>} (got " + JSON.stringify(hr.body) + ")");
  hr = await ho.pick("Sam");
  check(!hr.body && hr.banner === SAME_NAME, "desk-handoff.js: a shared name sends nothing and shows the plain line (got " + JSON.stringify(hr) + ")");
  hr = await ho.pick("Bo");
  check(!!hr.body && hr.body.to === "s_bo", "desk-handoff.js: a name picker carries the one seat's id (got " + JSON.stringify(hr.body) + ")");
  hr = await ho.pick("Zed");
  check(!hr.body && hr.banner === PICK_LINE, "desk-handoff.js: no seat, nothing sent, plain line (got " + JSON.stringify(hr) + ")");
  hr = await ho.pick("s_bo", 409);
  check(!!hr.body && hr.banner === SAME_NAME, "desk-handoff.js: a 409 shows the plain line (got " + JSON.stringify(hr.banner) + ")");
  hr = await ho.pick("s_bo", 200);
  check(hr.banner === "Handed to Bo.", "desk-handoff.js: success names the seat (got " + JSON.stringify(hr.banner) + ")");

  const ch = lift(cardSrc, "function handSeatOfPick(", "async function handTo(", "\n}\n");
  if (ch) {
    let r = await runHandTo(ch, "handTo", deskPeople, ["s_sam1"], 200);
    check(!!r.body && r.body.to === "s_sam1" && !("name" in r.body), "desk-card.js handTo sends assign {to:<seat id>} (got " + JSON.stringify(r.body) + ")");
    r = await runHandTo(ch, "handTo", deskPeople, ["Sam"], 200);
    check(!r.body && r.banner === SAME_NAME, "desk-card.js handTo: shared name sends nothing, plain line (got " + JSON.stringify(r) + ")");
    r = await runHandTo(ch, "handTo", deskPeople, [""], 200);
    check(!r.body && r.banner === PICK_LINE, "desk-card.js handTo: nothing picked, plain line");
    r = await runHandTo(ch, "handTo", deskPeople, ["s_bo"], 409);
    check(!!r.body && r.banner === SAME_NAME, "desk-card.js handTo: a 409 shows the plain line (got " + JSON.stringify(r.banner) + ")");
  } else fail("desk-card.js handTo / handSeatOfPick not found");
  check(/"<option value=\\"" \+ esc\(p\.id \|\| ""\) \+/.test(cardSrc), "desk-card.js Hand to picker values are seat ids");
  const qh = lift(queueSrc, "  window.handOffTo = async function (id, name) {", null, "\n  };\n");
  if (qh) {
    let r = await runHandTo(qh, "handOffTo", deskPeople, ["j1", "Bo"], 200);
    check(!!r.body && r.body.to === "s_bo" && !("name" in r.body), "desk-queue.js handOffTo sends assign {to:<seat id>} (got " + JSON.stringify(r.body) + ")");
    r = await runHandTo(qh, "handOffTo", deskPeople, ["j1", "Sam"], 200);
    check(!r.body && r.banner === SAME_NAME, "desk-queue.js handOffTo: a shared name sends nothing, plain line (got " + JSON.stringify(r) + ")");
    r = await runHandTo(qh, "handOffTo", deskPeople, ["j1", "Zed"], 200);
    check(!r.body && r.banner === PICK_LINE, "desk-queue.js handOffTo: no seat, nothing sent, plain line");
    r = await runHandTo(qh, "handOffTo", deskPeople, ["j1", "Bo"], 409);
    check(r.banner === SAME_NAME, "desk-queue.js handOffTo: a 409 shows the plain line (got " + JSON.stringify(r.banner) + ")");
  } else fail("desk-queue.js handOffTo not found");

  // ---- notes thread: only when the server sent one ----
  const nt = await render({ current: "shop-a", desks: { "shop-a": ownerA }, person: (b) => Object.assign(ownerBook(b), b.id === "s_bo" ? { thread: [{ t: "2026-10-01T10:00:00Z", from: "<b>Ann</b>", kind: "note", text: "<img src=x onerror=alert(1)>call back" }] } : {}) });
  const notesEl = nt.els["sheet-notes"];
  check(!!notesEl && notesEl.hidden === true, "people.html has a notes area, hidden until there is a thread");
  await nt.ctx.openSheet(nt.ctx.STATE.people.find((p) => p.id === "s_pat1"));
  check(!!notesEl && notesEl.hidden && notesEl.style.display === "none" && notesEl.innerHTML === "", "sheet with no thread: notes area hidden, empty, no stray label (got " + JSON.stringify(notesEl && notesEl.innerHTML) + ")");
  await nt.ctx.openSheet(nt.ctx.STATE.people.find((p) => p.id === "s_bo"));
  check(!!notesEl && !notesEl.hidden && notesEl.style.display !== "none" && /Notes on this seat/.test(notesEl.innerHTML) && /call back/.test(notesEl.innerHTML), "sheet with a thread (seat itself / owner): notes show");
  check(!!notesEl && notesEl.innerHTML.indexOf("<img") < 0 && notesEl.innerHTML.indexOf("<b>Ann") < 0 && notesEl.innerHTML.indexOf("&lt;img src=x") >= 0, "notes: stranger-typed text stays escaped");
  await nt.ctx.openSheet(nt.ctx.STATE.people.find((p) => p.id === "s_pat2"));
  check(!!notesEl && notesEl.hidden && notesEl.innerHTML === "", "notes: opening a seat with no thread after one with a thread clears the old notes");
  const ht = await render({ current: "shop-a", desks: { "shop-a": helperA }, person: (b) => Object.assign(helperBook(b), { thread: [] }) });
  await ht.ctx.openSheet(ht.ctx.STATE.people.find((p) => p.id === "s_sam1"));
  check(ht.els["sheet-notes"].hidden && ht.els["sheet-notes"].innerHTML === "" && ht.els["sheet-name"].textContent === "Sam", "helper sheet with thread: []: renders, notes hidden");
  const nt2 = await render({ current: "shop-a", desks: { "shop-a": ownerA }, person: (b) => Object.assign(ownerBook(b), { thread: [{ from: "Ann", text: "x" }] }), seatBook: (q) => (q.get("seat") === "s_pat2" ? { __status: 409, ok: false } : Object.assign(ownerBook({ id: q.get("seat"), name: "" }), { thread: [{ from: "Ann", text: "x" }] })) });
  await nt2.ctx.openSheet(nt2.ctx.STATE.people.find((p) => p.id === "s_bo"));
  const hadNotes = !nt2.els["sheet-notes"].hidden;
  await nt2.ctx.openSheet(nt2.ctx.STATE.people.find((p) => p.id === "s_pat2"));
  check(hadNotes && nt2.els["sheet-notes"].hidden && nt2.els["sheet-notes"].innerHTML === "", "notes: a 409 clears the last person's notes");

  // ---- job credit follows the job's seat ids ----
  const jobsA = [
    { id: "j1", status: "new", handedTo: { id: "s_sam2", name: "Sam" }, assignee: "Sam" },
    { id: "j2", status: "out", assignee: "Sam", assigneeId: "s_sam2" },
    { id: "j3", status: "new", assignee: "Sam" },
    { id: "j4", status: "new", assignee: "Bo" },
    { id: "j5", status: "new", assignee: "Sam", assigneeId: "s_bo" },
    { id: "j6", status: "new", handedTo: { id: "s_gone", name: "Bo" } },
    { id: "j7", status: "new", whoTapped: "Sam", whoTappedId: "s_kit", doneBy: "Sam", doneById: "s_ann", custom: { personId: "s_pat1" } }
  ];
  const jc = await render({ current: "shop-a", desks: { "shop-a": ownerA }, person: ownerBook, jobs: { "shop-a": jobsA } });
  const P = (id) => jc.ctx.STATE.people.find((p) => p.id === id);
  check(jc.ctx.holdingOf(P("s_sam2")) === 1 && jc.ctx.extOf(P("s_sam2")) === 1, "job credit: handedTo.id / assigneeId credit the second Sam (holding " + jc.ctx.holdingOf(P("s_sam2")) + ", ext " + jc.ctx.extOf(P("s_sam2")) + ")");
  check(jc.ctx.holdingOf(P("s_sam1")) === 0 && jc.ctx.extOf(P("s_sam1")) === 0, "job credit: the first Sam gets none of the second Sam's jobs, and a no-id 'Sam' job credits nobody (holding " + jc.ctx.holdingOf(P("s_sam1")) + ")");
  check(jc.ctx.holdingOf(P("s_bo")) === 2, "job credit: assigneeId beats the name; a no-id job credits the one seat named Bo; a gone seat id credits nobody (got " + jc.ctx.holdingOf(P("s_bo")) + ")");
  check(jc.ctx.holdingOf(P("s_kit")) === 0 && jc.ctx.holdingOf(P("s_ann")) === 0 && jc.ctx.holdingOf(P("s_pat1")) === 0, "job credit: who tapped / who finished / personId do not count as holding");
  const j3 = jc.ctx.STATE.jobs.find((j) => j.id === "j3");
  const j5 = jc.ctx.STATE.jobs.find((j) => j.id === "j5");
  check(jc.ctx.jobHolderSeat(j3) === null && (jc.ctx.jobHolderSeat(j5) || {}).id === "s_bo", "job credit: holder seat comes from the id; a shared name with no id is nobody");

  // ---- source rules ----
  check(!/key\s*=\s*"name:"/.test(src), "people.js has no name-only grouping key");
  check(!/\son[a-z]+=\\?"/i.test(src.replace(/\.on[a-z]+\s*=/g, "")), "people.js writes no inline on*= handlers into markup");

  if (failed) { console.error("check-people-helper-view: " + failed + " failed"); process.exit(1); }
  console.log("check-people-helper-view: ok");
})().catch((e) => { console.error("FAIL " + (e && e.stack || e)); process.exit(1); });
