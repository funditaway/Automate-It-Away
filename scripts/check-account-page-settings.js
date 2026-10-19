#!/usr/bin/env node
// My account page: six plain sections, own seat only, "coming soon" where nothing backs it,
// Stop and Kill fixed on, secrets never shown, every typed value rendered as text.
// Runs the REAL account-settings.js in a small DOM stub with a fake fetch.
// usage: node scripts/check-account-page-settings.js [repoRoot]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
let failures = 0, passes = 0;
function fail(msg) { failures += 1; console.error("check-account-page-settings: FAIL " + msg); }
function ok(cond, msg) { if (cond) passes += 1; else fail(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const SRC = read("account-settings.js");

// ---------- small DOM ----------
const VOID = { input: 1, br: 1, img: 1 };
function escText(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escAttr(s) { return escText(s).replace(/"/g, "&quot;"); }
function makeEl(tag) {
  const el = {
    tagName: String(tag).toLowerCase(), attrs: {}, className: "", id: "", parts: [], hidden: false, disabled: false,
    type: "", name: "", value: "", checked: false, selected: false, maxLength: -1, handlers: {},
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    appendChild(c) { if (!c || !c.tagName) throw new TypeError("appendChild needs a node"); c.parentNode = this; this.parts.push(c); return c; },
    removeChild(c) { this.parts = this.parts.filter((p) => p !== c); return c; },
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); },
    fire(ev) { (this.handlers[ev] || []).forEach((fn) => fn({ target: this })); },
    querySelector(sel) { let hit = null; walk(this, (n) => { if (hit || n === this) return; if (sel === "input:checked" && n.tagName === "input" && n.checked) hit = n; }); return hit; },
    set textContent(v) { this.parts = [{ text: String(v == null ? "" : v) }]; },
    get textContent() { return this.parts.map((p) => p.text !== undefined ? p.text : p.textContent).join(""); },
    get firstChild() { return this.parts[0] || null; }
  };
  Object.defineProperty(el, "innerHTML", { set() { el.usedInnerHTML = true; throw new Error("innerHTML used"); }, get() { return serialize(el, true); } });
  el.insertAdjacentHTML = function () { el.usedInnerHTML = true; throw new Error("insertAdjacentHTML used"); };
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
const tick = () => new Promise((r) => setImmediate(r));
async function settle() { for (let i = 0; i < 8; i++) await tick(); }

function world(opts) {
  opts = opts || {};
  const mount = makeEl("section"); mount.id = "acct-settings"; mount.hidden = true;
  const store = Object.assign({}, opts.storage || {});
  const calls = [];
  const document = { getElementById(id) { return id === "acct-settings" ? mount : null; }, createElement: makeEl };
  const ctx = {
    document, console, Date, JSON, Array, Object, String, Promise,
    localStorage: { getItem(k) { return k in store ? store[k] : null; }, setItem(k, v) { store[k] = String(v); }, removeItem(k) { delete store[k]; } },
    fetch(url, init) {
      calls.push({ url, init: init || {}, body: init && init.body ? JSON.parse(init.body) : null });
      const reply = opts.reply ? opts.reply(url, init, calls.length) : { status: 200, data: {} };
      return Promise.resolve({ ok: reply.status >= 200 && reply.status < 300, status: reply.status, json() { return Promise.resolve(reply.data); } });
    }
  };
  ctx.window = ctx;
  let applied = 0; ctx.AIATheme = { apply() { applied += 1; } };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: "account-settings.js" });
  return { ctx, mount, calls, store, applied: () => applied };
}

const EVIL = '<img src=x onerror="alert(1)">';
function fullSettings() {
  return {
    account: { id: "acc1" },
    profile: { available: true, name: EVIL, email: "pat@shop.test", phone: "4175550100", city: "Springfield", state: "MO", timezone: "America/Chicago", hours: "8-5", note: "<b>hi</b>" },
    talk: { available: true, reach: "text", reachChoices: ["call", "text", "email"], notify: { available: false } },
    desks: { available: true, items: [{ slug: "aia", name: EVIL, yours: "own", pack: { id: "p1", name: "<script>x</script>" }, automations: [{ kind: "flow", id: "a1", name: "Lead <i>catcher</i>" }], allowList: { available: false } }] },
    automations: { available: true, stopAndKill: { always: true, canTurnOff: false }, runOnItsOwn: { available: false }, note: "AIA still waits for a person on every card today.", items: [{ desk: "aia", kind: "flow", id: "a1", name: EVIL, stopBefore: { money: true, deletes: false, messageNew: true }, updatedAt: "" }] },
    look: { available: true, theme: "dark", themes: ["system", "light", "dark"] },
    secrets: { available: true, items: [{ name: "SECRET_NAME_SHOULD_NOT_SHOW", set: true, updatedAt: "" }], max: 20 },
    history: [{ at: "2026-10-19T01:00:00Z", who: EVIL, section: "look", what: "Changed look to dark." }]
  };
}
const SIGNED = { aia_ws: "aia", aia_session: "tok123" };
const SIX = ["acct-profile", "acct-talk", "acct-desks", "acct-autos", "acct-look", "acct-secrets"];

(async function main() {
  // ---------- static ----------
  ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(SRC), "account-settings.js must not write HTML");
  ok(!/\son[a-z]+\s*=/.test(SRC.replace(/\/\/.*$/gm, "")), "account-settings.js must not use inline handlers");
  ok(!/placeholder/i.test(SRC), "account-settings.js must not use placeholder text");
  ok(!/secret-set|secret-remove|type\s*=\s*"password"|\.type = "password"/.test(SRC), "secrets must stay coming soon: no secret writes or fields");
  ok(!/Collect|charge|Market|mesh/i.test(SRC.replace(/^\s*\/\/.*$/gm, "")), "account-settings.js must not show Collect, charges, Market or mesh");
  ok(/Stop and Kill always work\. They cannot be switched off\./.test(SRC), "fixed Stop and Kill line present");
  const theme = read("theme.js");
  ok(/\{ href: "\/account", label: "My account" \}/.test(theme), "footer links My account at /account");
  const foot = theme.slice(theme.indexOf("var FOOT_LINKS"), theme.indexOf("];", theme.indexOf("var FOOT_LINKS")));
  ok((foot.match(/href:/g) || []).length === 7, "footer has seven links");
  ok(/href: "\/status", label: "Status"/.test(foot) && /href: "\/legal", label: "Legal"/.test(foot), "footer keeps Legal and Status");
  const acct = read("account.html");
  ok(/<section id="acct-settings" aria-label="My account settings" hidden><\/section>\s*<\/main>/.test(acct), "account.html has the hidden mount before </main>");
  ok(/<script src="aia-mail\.js"><\/script>\s*<script src="account-settings\.js"><\/script>/.test(acct), "account.html loads account-settings.js after aia-mail.js");
  ok(fs.statSync(path.join(root, "desk.html")).size === 33792, "desk.html stays 33,792 bytes");
  ok(!/account-settings/.test(read("desk.html")), "desk.html untouched");

  // ---------- signed out: nothing loads ----------
  { const w = world({}); await settle(); ok(w.calls.length === 0, "signed out: no fetch"); ok(w.mount.hidden === true, "signed out: stays hidden"); }

  // ---------- full settings ----------
  {
    const w = world({ storage: SIGNED, reply: (u) => u.indexOf("settings=1") >= 0 ? { status: 200, data: { ok: true, settings: fullSettings() } } : { status: 200, data: { ok: true, hint: "Saved your look.", settings: Object.assign(fullSettings(), { history: [{ at: "2026-10-19T02:00:00Z", who: "Pat", what: "Turned off stop before money." }] }) } } });
    await settle();
    const c0 = w.calls[0];
    ok(c0 && c0.url === "/api/account?settings=1" && c0.init.method === "GET", "reads GET /api/account?settings=1");
    ok(c0 && c0.init.headers["X-Workspace"] === "aia" && c0.init.headers["X-Session"] === "tok123", "sends own seat headers");
    ok(w.mount.hidden === false, "signed in: shows");
    SIX.concat(["acct-history"]).forEach((id) => ok(!!byId(w.mount, id), "section " + id + " painted"));
    const html = w.mount.innerHTML;
    ok(html.indexOf("<img") < 0 && html.indexOf("<script") < 0 && html.indexOf("<b>") < 0 && html.indexOf("<i>") < 0, "typed values render as text");
    ok(html.indexOf("&lt;img src=x onerror=") >= 0, "hostile name visible as escaped text");
    ok(html.indexOf("SECRET_NAME_SHOULD_NOT_SHOW") < 0, "secret names never shown");
    const sec = byId(w.mount, "acct-secrets");
    ok(find(sec, (n) => n.tagName === "input" || n.tagName === "button").length === 0, "secrets: no field or button");
    ok(/coming soon/.test(sec.textContent), "secrets: coming soon");
    const autos = byId(w.mount, "acct-autos");
    ok(/Stop and Kill always work\. They cannot be switched off\./.test(autos.textContent), "autos: Stop and Kill line");
    ok(/run on its own is coming soon/.test(autos.textContent), "autos: run-on-its-own coming soon");
    const boxes = find(autos, (n) => n.tagName === "input" && n.type === "checkbox");
    ok(boxes.length === 3, "autos: three stop-before choices");
    ok(boxes.map((b) => b.checked).join() === "true,false,true", "autos: choices reflect saved values");
    ok(find(autos, (n) => n.tagName === "span" && /kill/i.test(n.textContent) && n.parentNode && n.parentNode.className === "acct-pick").length === 0, "autos: no switch for Stop or Kill");
    ok(/allows is coming soon/.test(byId(w.mount, "acct-desks").textContent), "desks: allow list coming soon");
    ok(/which things AIA tells you about is coming soon/.test(byId(w.mount, "acct-talk").textContent), "talk: notify coming soon");
    const radios = find(byId(w.mount, "acct-talk"), (n) => n.type === "radio");
    ok(radios.length === 3 && radios.filter((r) => r.checked).map((r) => r.value).join() === "text", "talk: reach radios reflect saved");
    ok(find(w.mount, (n) => n.tagName === "li").some((li) => /Changed look to dark\./.test(li.textContent)), "history line shown");

    // profile save
    const prof = byId(w.mount, "acct-profile");
    const inputs = find(prof, (n) => n.tagName === "input" || n.tagName === "textarea");
    ok(inputs.length === 8, "profile: eight fields");
    ok(inputs[0].value === EVIL, "profile: name goes in as value");
    find(prof, (n) => n.tagName === "button")[0].fire("click");
    await settle();
    let last = w.calls[w.calls.length - 1];
    ok(last.init.method === "POST" && last.body.action === "settings" && last.body.section === "profile", "profile: posts settings/profile");
    ok(Object.keys(last.body.set).sort().join() === "city,email,hours,name,note,phone,state,timezone", "profile: sends exactly the profile fields");
    ok(find(w.mount, (n) => n.tagName === "li").some((li) => /Turned off stop before money\./.test(li.textContent)), "history refreshes from the reply");

    // talk save
    radios[2].checked = true; radios[1].checked = false;
    find(byId(w.mount, "acct-talk"), (n) => n.tagName === "button")[0].fire("click");
    await settle();
    last = w.calls[w.calls.length - 1];
    ok(last.body.section === "talk" && last.body.set.reach === "email" && Object.keys(last.body.set).length === 1, "talk: posts reach only");

    // stop-before change
    boxes[1].checked = true; boxes[1].fire("change");
    await settle();
    last = w.calls[w.calls.length - 1];
    ok(last.body.section === "automations", "autos: posts automations section");
    ok(JSON.stringify(last.body.set) === JSON.stringify({ desk: "aia", kind: "flow", id: "a1", deletes: true }), "autos: sends desk/kind/id and one stop choice");
    ok(!Object.keys(last.body.set).some((k) => /stop|kill/i.test(k)), "autos: never sends a Stop or Kill key");

    // look save
    const sel = find(byId(w.mount, "acct-look"), (n) => n.tagName === "select")[0];
    ok(sel && sel.parts.length === 3, "look: three choices");
    sel.value = "light";
    find(byId(w.mount, "acct-look"), (n) => n.tagName === "button")[0].fire("click");
    await settle();
    last = w.calls[w.calls.length - 1];
    ok(last.body.section === "look" && last.body.set.theme === "light", "look: posts theme");
    ok(w.store.aia_theme === "light" && w.applied() === 1, "look: applies on this phone after save");
  }

  // ---------- refused write reverts and says why ----------
  {
    const w = world({ storage: SIGNED, reply: (u) => u.indexOf("settings=1") >= 0 ? { status: 200, data: { ok: true, settings: fullSettings() } } : { status: 403, data: { ok: false, error: "That seat is not open." } } });
    await settle();
    const autos = byId(w.mount, "acct-autos");
    const box = find(autos, (n) => n.type === "checkbox")[0];
    box.checked = false; box.fire("change");
    await settle();
    ok(box.checked === true, "refused change flips the choice back");
    ok(/That seat is not open\./.test(autos.textContent), "refused change shows the server's plain reason");
    const look = byId(w.mount, "acct-look");
    find(look, (n) => n.tagName === "button")[0].fire("click");
    await settle();
    ok(!w.store.aia_theme && w.applied() === 0, "refused look save changes nothing here");
  }

  // ---------- nothing backed: every section says coming soon, no dead switches ----------
  for (const variant of ["no-settings", "all-off", "error"]) {
    const off = { profile: { available: false }, talk: { available: false }, desks: { available: false }, automations: { available: false }, look: { available: false }, secrets: { available: false }, history: [] };
    const w = world({ storage: SIGNED, reply: () => variant === "no-settings" ? { status: 200, data: { ok: true } } : variant === "error" ? { status: 401, data: { ok: false, error: "Sign in first." } } : { status: 200, data: { ok: true, settings: off } } });
    await settle();
    SIX.forEach((id) => {
      const c = byId(w.mount, id);
      ok(!!c && /coming soon/.test(c.textContent), variant + ": " + id + " says coming soon");
      ok(c && find(c, (n) => n.tagName === "input" || n.tagName === "select" || n.tagName === "button" || n.tagName === "textarea").length === 0, variant + ": " + id + " has no controls");
    });
    ok(/Stop and Kill always work/.test(byId(w.mount, "acct-autos").textContent), variant + ": Stop and Kill line still shown");
    ok(/No changes yet\./.test(byId(w.mount, "acct-history").textContent), variant + ": empty history says so");
  }

  console.log("check-account-page-settings: " + passes + " pass, " + failures + " fail");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("check-account-page-settings: FAIL crashed " + (e && e.stack || e)); process.exit(1); });
