#!/usr/bin/env node
require("./_env-guard");
// Presence words on My account -> Activity (James approved the words exactly).
// Runs the real account-follow.js in a small DOM stub with fake /api/account replies and checks:
// the exact words, owner vs member scoping on the page (even when the server sends extra rows),
// using #576's real shapes: presenceRows { at, desk, seat, name, kind }, Pause desks (owned desks),
// and the GET /api/account home (you, mine.owned / mine.member personId),
// shut seats never shown, a non-member sees nothing, at most 12 newest first, times shown as the
// data gives them (h:mm AM/PM, local, never re-rounded), and names written with textContent only.
// usage: node scripts/check-presence-words.js [repoRoot]
process.env.TZ = "America/Chicago";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
let failures = 0, passes = 0;
function fail(msg) { failures += 1; console.error("check-presence-words: FAIL " + msg); }
function ok(cond, msg) { if (cond) passes += 1; else fail(msg); }
function eq(label, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) passes += 1; else fail(label + "\n    got  " + a + "\n    want " + b);
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const SRC = read("account-follow.js");
const CODE = SRC.replace(/^\s*\/\/.*$/gm, "");

const NOTE = "Online means this desk was open on their phone or computer in the last 5 minutes. It can be a couple of minutes behind.";
const ROUND = "Times are rounded down to the last 5 minutes. Each person keeps at most 12 a day, and the newest 12 show here.";
const OLD_ROUND = ["Times are rounded down to", "the 5 minutes."].join(" ");
const EVIL = '<img src=x onerror="alert(1)">';

let htmlWrites = 0;
function makeEl(tag) {
  const el = {
    tagName: String(tag).toLowerCase(), attrs: {}, className: "", id: "", parts: [], hidden: false, disabled: false,
    type: "", value: "", selected: false, handlers: {},
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    appendChild(c) { if (!c || !c.tagName) throw new TypeError("appendChild needs a node"); c.parentNode = this; this.parts.push(c); return c; },
    removeChild(c) { this.parts = this.parts.filter((p) => p !== c); return c; },
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); },
    fire(ev) { (this.handlers[ev] || []).forEach((fn) => fn({ target: this })); },
    querySelector() { return null; },
    set textContent(v) { this.parts = [{ text: String(v == null ? "" : v) }]; },
    get textContent() { return this.parts.map((p) => p.text !== undefined ? p.text : p.textContent).join(""); },
    get firstChild() { return this.parts[0] || null; }
  };
  ["innerHTML", "outerHTML"].forEach((k) => Object.defineProperty(el, k, {
    set(v) { htmlWrites += 1; el.parts = [{ text: String(v) }]; }, get() { return ""; }
  }));
  el.insertAdjacentHTML = function () { htmlWrites += 1; };
  return el;
}
function walk(el, fn) { fn(el); (el.parts || []).forEach((p) => { if (p.tagName) walk(p, fn); }); }
function find(el, pred) { const out = []; walk(el, (n) => { if (pred(n)) out.push(n); }); return out; }
function byId(el, id) { return find(el, (n) => n.id === id)[0] || null; }
const tick = () => new Promise((r) => setImmediate(r));
async function settle() { for (let i = 0; i < 16; i++) await tick(); }

// 11:05 PM and 11:40 PM Central on Nov 18, 2026 (UTC-6).
const T1105 = "2026-11-19T05:05:00.000Z";
const T1140 = "2026-11-19T05:40:00.000Z";
const NAMES = { "front-desk": "Front Desk", "back-desk": "Back Desk", "my-shop": "My Shop" };
// presenceRows rows exactly as #576 (d9c50e1d) sends them: { at, desk, seat, name, kind }.
function row(at, desk, kind, seat, name, extra) {
  return Object.assign({ at: at, desk: desk, seat: seat, name: name, kind: kind }, extra || {});
}
// Pause desks = ownedDesks(acc) (scopeDesks). GET /api/account home: you (publicPerson) and
// mine.owned / mine.member cards ({ slug, name, personId, ... }) as desksForPerson builds them.
function viewer(o) {
  o = o || {};
  const card = (slug, personId) => ({ slug: slug, name: NAMES[slug] || slug, role: "member", kind: "member", status: "approved", personId: personId, yours: "member" });
  return {
    ws: o.ws || "front-desk",
    owned: (o.owned || []).map((slug) => ({ slug: slug, name: NAMES[slug] || slug, paused: false, draftOnly: true })),
    home: o.homeFail ? { status: 403, data: { ok: false, error: "Sign in again." } } : { status: 200, data: {
      ok: true, product: "aia", account: { id: "acct_me", desks: o.owned || [] },
      you: o.youId === undefined ? null : { id: o.youId, name: "Pat", role: "owner", kind: "owner", status: "approved" },
      mine: { owned: (o.mineOwned || []).map((x) => Object.assign(card(x[0], x[1]), { role: "owner", kind: "owner", yours: "own" })), member: (o.mineMember || []).map((x) => card(x[0], x[1])) }
    } }
  };
}
const OWNER = viewer({ owned: ["front-desk"], youId: "p_owner", mineOwned: [["front-desk", "p_owner"]], mineMember: [["back-desk", "p_bm"]] });

function world(v, activity, detail) {
  htmlWrites = 0;
  const mount = makeEl("section"); mount.id = "acct-follow"; mount.hidden = true;
  const store = { aia_ws: v.ws, aia_session: "tok-1" };
  const document = { getElementById(id) { return id === "acct-follow" ? mount : null; }, createElement: makeEl };
  const ctx = {
    document, console: { log() {}, info() {}, warn() {}, error() {}, debug() {} }, Date, JSON, Array, Object, String, Promise,
    encodeURIComponent, isFinite, setTimeout, location: { href: "https://aia.test/account" },
    localStorage: { getItem(k) { return k in store ? store[k] : null; }, setItem(k, v2) { store[k] = String(v2); }, removeItem(k) { delete store[k]; } },
    fetch(url) {
      url = String(url);
      let reply = { status: 200, data: { ok: true } };
      if (url === "/api/account") reply = v.home;
      else if (url.indexOf("pause=1") >= 0) reply.data = { ok: true, pause: { stopAndKill: "You still tap Yes, Stop, or Kill.", desks: v.owned, items: [] } };
      else if (url.indexOf("activity=1") >= 0 && url.indexOf("desk=") >= 0) reply.data = Object.assign({ ok: true, wrote: false, activity: [], note: "Nothing recorded on this yet." }, detail || {});
      else if (url.indexOf("activity=1") >= 0) reply.data = Object.assign({ ok: true, wrote: false, activity: [], note: "Nothing recorded on this yet." }, activity || {});
      else if (url.indexOf("undo=1") >= 0) reply.data = { ok: true, undo: { available: false, note: "Nothing to undo." } };
      else if (url.indexOf("exportClose=1") >= 0) reply.data = { ok: true, exportClose: {} };
      return Promise.resolve({ ok: reply.status >= 200 && reply.status < 300, status: reply.status, json() { return Promise.resolve(reply.data); } });
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: "account-follow.js" });
  return { mount };
}
function presenceOf(box) {
  const wraps = find(box, (n) => n.className === "acct-presence");
  return {
    wraps: wraps.length,
    lines: wraps.length ? find(wraps[0], (n) => n.tagName === "li").map((n) => n.textContent) : [],
    notes: wraps.length ? find(wraps[0], (n) => n.tagName === "p").map((n) => n.textContent) : []
  };
}
async function card(v, activity) {
  const w = world(v, activity);
  await settle();
  return { w, p: presenceOf(byId(w.mount, "acct-activity") || { parts: [] }), all: w.mount.textContent };
}

(async function main() {
  // 0. Words and code shape.
  ok(SRC.indexOf(JSON.stringify(NOTE)) >= 0, "the approved Online note is in account-follow.js word for word");
  ok(SRC.indexOf(JSON.stringify(ROUND)) >= 0, "the approved rounding line is in account-follow.js word for word");
  ok(SRC.indexOf('" came online on "') >= 0 && SRC.indexOf('" went offline on "') >= 0, "came online on / went offline on words");
  ok(/var PRESENCE_YOU = "You";/.test(SRC), "own rows say You");
  ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(CODE), "account-follow.js writes no HTML");
  ok(/var PRESENCE_MAX = 12;/.test(SRC), "page cap is 12");
  const tracked = [];
  (function scan(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
      if (d.name === "node_modules" || d.name === ".git") return;
      const p = path.join(dir, d.name);
      if (d.isDirectory()) return scan(p);
      if (/\.(js|html|md|json|txt|css)$/.test(d.name)) tracked.push(p);
    });
  })(root);
  const oldHits = tracked.filter((p) => fs.readFileSync(p, "utf8").indexOf(OLD_ROUND) >= 0).map((p) => path.relative(root, p));
  eq("the old rounding line (\"...to the 5 minutes.\") appears in no file", oldHits, []);

  // 0b. The shapes these fake replies copy are the ones #576 really sends (read-only pins on api/).
  const follow = read("api/_account-follow.js"), plansSrc = read("api/_plans.js");
  ok(follow.indexOf('out.push([at, i, { at: new Date(at).toISOString(), desk: String(w.slug), seat: String(p.id), name: String(p.name || ""), kind: e.kind }]);') >= 0, "presenceRows rows are { at (ISO, 5-minute floor), desk, seat, name, kind }");
  ok(/const PRESENCE_ROWS = 12;/.test(follow) && /return out\.slice\(0, PRESENCE_ROWS\)/.test(follow), "server cap is 12 across the whole list");
  ok(/function scopeDesks\(acc, seat, byHuman\) \{[\s\S]{0,200}return owned\(acc\);\n\}/.test(follow), "Pause desks are the account's owned desks");
  ok(/const ownedDesk = !byHuman && !!ownedRow\(acc, w\.slug\);/.test(follow), "every open seat only on a desk the account owns");
  ok(/personId: hit\.id,/.test(plansSrc) && /you: typeof lib\.publicPerson === "function"/.test(plansSrc) && /mine, desksOwned/.test(plansSrc), "the account home carries you and mine (personId per desk)");

  // 1. Owner on a desk the account owns: own rows say You, others by name, both notes once.
  let r = await card(OWNER, { presenceRows: [
    row(T1140, "front-desk", "offline", "p_owner", "Pat"), row(T1140, "front-desk", "offline", "p_ana", "Ana"),
    row(T1105, "front-desk", "online", "p_owner", "Pat"), row(T1105, "front-desk", "online", "p_ana", "Ana")
  ] });
  eq("owner sees own You rows and Ana's rows, newest first, exact words", r.p.lines, [
    "11:40 PM · You went offline on Front Desk", "11:40 PM · Ana went offline on Front Desk",
    "11:05 PM · You came online on Front Desk", "11:05 PM · Ana came online on Front Desk"
  ]);
  eq("under the list: the Online note then the rounding line, once each", r.p.notes, [NOTE, ROUND]);
  eq("the rounding line shows once on the page", r.all.split(ROUND).length - 1, 1);
  eq("textContent only (no HTML writes)", htmlWrites, 0);

  // 2. Owner (of front-desk) on a desk the account does NOT own: only own You rows, even with extra rows sent.
  r = await card(OWNER, { presenceRows: [
    row(T1140, "back-desk", "offline", "p_ana", "Ana"), row(T1140, "back-desk", "offline", "p_bm", "Pat"),
    row(T1105, "back-desk", "online", "p_bo", "Bo"), row(T1105, "back-desk", "online", "p_bm", "Pat"),
    row(T1105, "back-desk", "online", "p_owner", "Bea")
  ] });
  eq("owner of another desk sees only own rows on a desk it does not own", r.p.lines, [
    "11:40 PM · You went offline on Back Desk", "11:05 PM · You came online on Back Desk"
  ]);
  ok(r.all.indexOf("Ana") < 0 && r.all.indexOf("Bo ") < 0 && r.all.indexOf("Bea") < 0, "no other names on a desk the account does not own (seat ids are per desk: back-desk's p_owner is not you)");

  // 3. A member who owns some other desk sees only their own rows on this desk (and everyone on the desk they own).
  const QUIN = viewer({ owned: ["my-shop"], youId: "p_q", mineOwned: [["my-shop", "p_owner"]], mineMember: [["front-desk", "p_q"]] });
  r = await card(QUIN, { presenceRows: [
    row(T1140, "front-desk", "offline", "p_ana", "Ana"), row(T1140, "front-desk", "offline", "p_owner", "Pat"),
    row(T1105, "front-desk", "online", "p_q", "Quin"), row(T1105, "my-shop", "online", "p_sal", "Sal")
  ] });
  eq("member (owns my-shop) sees only own row on front-desk, and Sal on the desk it owns", r.p.lines, ["11:05 PM · You came online on Front Desk", "11:05 PM · Sal came online on My Shop"]);
  ok(r.all.indexOf("Ana") < 0 && r.all.indexOf("Pat") < 0, "member never sees Ana or the owner on front-desk");
  const MOE = viewer({ owned: [], youId: "p_moe", mineMember: [["front-desk", "p_moe"]] });
  r = await card(MOE, { presenceRows: [row(T1140, "front-desk", "offline", "p_ana", "Ana"), row(T1105, "front-desk", "online", "p_moe", "Moe")] });
  eq("member with no owned desks sees only own row", r.p.lines, ["11:05 PM · You came online on Front Desk"]);
  const YOUONLY = viewer({ owned: [], youId: "p_moe" });
  r = await card(YOUONLY, { presenceRows: [row(T1105, "front-desk", "online", "p_moe", "Moe"), row(T1105, "back-desk", "online", "p_moe", "Moe")] });
  eq("you.id counts only on this sign-in's desk", r.p.lines, ["11:05 PM · You came online on front-desk"]);

  // 4. Shut seats never render, own or other (the server drops them; the page also drops any marked shut).
  r = await card(OWNER, { presenceRows: [
    row(T1140, "front-desk", "offline", "p_rem", "Rem", { status: "removed" }),
    row(T1140, "front-desk", "offline", "p_owner", "Pat", { status: "Pending" }),
    row(T1105, "front-desk", "online", "p_den", "Den", { status: "denied" }),
    row(T1105, "front-desk", "online", "p_shu", "Shu", { shut: true }),
    row(T1105, "front-desk", "online", "p_owner", "Pat", { open: false }),
    row(T1105, "front-desk", "online", "p_ana", "Ana", { status: "approved" })
  ] });
  eq("removed, pending, denied, shut and closed seats never render", r.p.lines, ["11:05 PM · Ana came online on Front Desk"]);

  // 5. Non-member / nothing to show: no presence block and no notes.
  const NOBODY = viewer({ owned: [], ws: "front-desk" });
  for (const [label, v, act] of [
    ["no presenceRows key", OWNER, {}],
    ["empty presenceRows", OWNER, { presenceRows: [] }],
    ["non-member sent rows", NOBODY, { presenceRows: [row(T1140, "front-desk", "offline", "p_ana", "Ana"), row(T1105, "front-desk", "online", "p_owner", "Pat")] }],
    ["home read refused", viewer({ owned: ["front-desk"], homeFail: true }), { presenceRows: [row(T1105, "front-desk", "online", "p_owner", "Pat"), row(T1105, "front-desk", "online", "p_ana", "Ana")] }],
    ["bad rows", OWNER, { presenceRows: [null, 5, "x", row(T1105, "front-desk", "away", "p_owner", "Pat"), row("not a time", "front-desk", "online", "p_owner", "Pat"), { at: T1105, seat: "p_owner", kind: "online" }, row(T1105, "front-desk", "online", "p_ana", "")] }]
  ]) {
    r = await card(v, act);
    eq("empty state (" + label + "): no presence rows", r.p.lines, []);
    ok(r.all.indexOf(NOTE) < 0 && r.all.indexOf(ROUND) < 0, "empty state (" + label + "): no notes");
  }

  // 6. Cap: 12 across the whole visible list (not per person), newest first.
  const base = Date.parse(T1140);
  const many = [];
  for (let i = 0; i < 15; i++) many.push(row(new Date(base - i * 5 * 60 * 1000).toISOString(), "front-desk", i % 2 ? "online" : "offline", i % 3 ? "p_owner" : "p_ana", i % 3 ? "Pat" : "Ana"));
  many.reverse();
  r = await card(OWNER, { presenceRows: many });
  eq("cap: 15 rows across two people -> 12 shown in all", r.p.lines.length, 12);
  eq("cap keeps newest first and drops the oldest", [r.p.lines[0], r.p.lines[1], r.p.lines[11]], ["11:40 PM · Ana went offline on Front Desk", "11:35 PM · You came online on Front Desk", "10:45 PM · You came online on Front Desk"]);
  r = await card(OWNER, { presenceRows: many.slice(3) });
  eq("cap edge: 12 rows -> 12 shown", r.p.lines.length, 12);
  r = await card(OWNER, { presenceRows: many.concat([row(T1140, "back-desk", "online", "p_x", "Xi"), row(T1140, "back-desk", "online", "p_y", "Yu")]) });
  ok(r.p.lines.length === 12 && r.all.indexOf("Xi") < 0 && r.all.indexOf("Yu") < 0, "rows the page drops never push out rows it shows");

  // 7. Time exactly as the data gives it: local h:mm AM/PM, never re-rounded.
  r = await card(OWNER, { presenceRows: [
    row("2026-11-19T05:07:00.000Z", "front-desk", "online", "p_owner", "Pat"),
    row("2026-11-19T06:00:00.000Z", "front-desk", "offline", "p_owner", "Pat"),
    row("2026-11-19T18:30:00.000Z", "front-desk", "online", "p_owner", "Pat")
  ] });
  eq("times: 11:07 PM stays 11:07 PM, midnight is 12:00 AM, noon side is PM", r.p.lines, [
    "12:30 PM · You came online on Front Desk", "12:00 AM · You went offline on Front Desk", "11:07 PM · You came online on Front Desk"
  ]);

  // 8. Names are text, never HTML; desk names come from the account's own lists, else the slug.
  r = await card(OWNER, { presenceRows: [row(T1105, "front-desk", "online", "p_evil", EVIL)] });
  eq("a name with markup is shown as text", r.p.lines, ["11:05 PM · " + EVIL + " came online on Front Desk"]);
  eq("no HTML writes with markup in a name", htmlWrites, 0);

  // 9. Desk Activity button: the desk read's presenceRows show under that desk, same rules.
  const w = world(MOE, {}, { presenceRows: [row(T1105, "front-desk", "online", "p_moe", "Moe"), row(T1140, "front-desk", "offline", "p_ana", "Ana")] });
  await settle();
  // Moe owns no desk, so give the desk card a desk to sit on: use the owner's view for the button.
  const w2 = world(OWNER, {}, { presenceRows: [row(T1105, "front-desk", "online", "p_owner", "Pat"), row(T1140, "front-desk", "offline", "p_ana", "Ana"), row(T1140, "front-desk", "offline", "p_q", "Quin", { status: "removed" })] });
  await settle();
  const deskBox = byId(w2.mount, "acct-desk-front-desk");
  const actBtn = deskBox && find(deskBox, (n) => n.tagName === "button" && n.textContent === "Activity")[0];
  if (actBtn) { actBtn.fire("click"); await settle(); }
  const dp = presenceOf(byId(w2.mount, "acct-desk-front-desk") || { parts: [] });
  eq("desk Activity (owner) shows You and Ana, newest first, no shut seat", dp.lines, ["11:40 PM · Ana went offline on Front Desk", "11:05 PM · You came online on Front Desk"]);
  eq("desk Activity notes", dp.notes, [NOTE, ROUND]);
  ok(!byId(w.mount, "acct-desk-front-desk"), "a member gets no desk card for a desk it does not own");

  console.log("check-presence-words: " + passes + " pass, " + failures + " fail");
  if (failures) process.exit(1);
  console.log("PASS check-presence-words");
})().catch((e) => { console.error("check-presence-words: FAIL " + (e && e.stack || e)); process.exit(1); });
