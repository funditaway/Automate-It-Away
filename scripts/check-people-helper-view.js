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
// PEOPLE_HELPER_VIEW_JS / PEOPLE_HELPER_VIEW_DESK_JS may point at another people.js / people-desk.js
// (used by mutate-people-helper-view.js).

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
    calls.push({ path: p, ws: ws, body: body });
    let reply = { ok: true };
    if (p === "/api/admin" && body.action === "person") reply = opts.person(body, ws);
    else if (p === "/api/admin") reply = opts.desks[ws];
    else if (p === "/api/jobs") reply = { ok: true, jobs: [] };
    return { status: 200, json: async () => JSON.parse(JSON.stringify(reply)) };
  }
  const ctx = {
    document, localStorage, fetch, console,
    location: { search: "", pathname: "/people" },
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

  // ---- source rules ----
  check(!/key\s*=\s*"name:"/.test(src), "people.js has no name-only grouping key");
  check(!/\son[a-z]+=\\?"/i.test(src.replace(/\.on[a-z]+\s*=/g, "")), "people.js writes no inline on*= handlers into markup");

  if (failed) { console.error("check-people-helper-view: " + failed + " failed"); process.exit(1); }
  console.log("check-people-helper-view: ok");
})().catch((e) => { console.error("FAIL " + (e && e.stack || e)); process.exit(1); });
