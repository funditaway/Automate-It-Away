#!/usr/bin/env node
// My account page: Connections and setup cards (UI for the PR 355 API).
// Runs the REAL account-connections.js in a small DOM stub with a fake fetch. Checks: the
// server's statusText word for word, never the word "connected"; secrets cleared after every
// send and never kept, logged or shown; only "NAME: set" after a save; 409/403/503 show the
// server's words; Stop and Kill on every card; no buy/pay/price; text only via textContent;
// history kinds; bundle checklists; exact 355 action names and params.
// usage: node scripts/check-account-connections-ui.js [repoRoot]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
let failures = 0, passes = 0;
function fail(msg) { failures += 1; console.error("check-account-connections-ui: FAIL " + msg); }
function ok(cond, msg) { if (cond) passes += 1; else fail(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const SRC = read("account-connections.js");
const CODE = SRC.replace(/^\s*\/\/.*$/gm, "");

// ---------- small DOM (same idea as check-account-page-settings.js) ----------
const VOID = { input: 1, br: 1, img: 1 };
function escText(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escAttr(s) { return escText(s).replace(/"/g, "&quot;"); }
let innerHTMLUsed = 0;
function makeEl(tag) {
  const el = {
    tagName: String(tag).toLowerCase(), attrs: {}, className: "", id: "", parts: [], hidden: false, disabled: false,
    type: "", name: "", value: "", checked: false, selected: false, maxLength: -1, handlers: {},
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
function buttons(el, text) { return find(el, (n) => n.tagName === "button" && (text == null || n.textContent === text)); }
function inputsOf(el) { return find(el, (n) => n.tagName === "input"); }
const tick = () => new Promise((r) => setImmediate(r));
async function settle() { for (let i = 0; i < 12; i++) await tick(); }

const EVIL = '<img src=x onerror="alert(1)">';
const SECRET = "sk-live-SUPERSECRET-9931";
function conn(o) {
  return Object.assign({ id: "conn_k3x9a1", service: EVIL, serviceId: "gmail", label: EVIL, status: "saved", statusText: "Saved, not tested yet", createdAt: "", updatedAt: "", secretNames: [{ name: "API_KEY", set: true }, { name: "OTHER_KEY", set: false }], hookSet: false }, o || {});
}
function step(id, group, kind, title, state, reason) { return { id, group, kind, title, state, reason: reason || "" }; }
function groupSteps(g, svc, states) {
  const k = ["connect", "secret", "approve", "test"];
  const t = ["Connect " + (svc || ""), "Enter the secret", "Approve allowed actions once", "Test run (dry run)"];
  return k.map((kind, i) => step(g + "." + kind, g, kind, t[i], states[i][0], states[i][1]));
}
function cardMid() {
  return {
    id: "setup_mid", source: { type: "connection", id: "conn_k3x9a1", name: EVIL, preview: false }, deskId: null, status: "open", statusText: "Open. 0 of 5 steps done.", bought: false, charged: false,
    groups: [{ id: "g1", name: EVIL, type: "connection", service: "Gmail", serviceId: "gmail", connectionId: null, acts: [] }],
    steps: [step("card.desk", "card", "desk", "Pick a desk", "todo")].concat(groupSteps("g1", "Gmail", [["todo"], ["todo"], ["todo"], ["todo"]])),
    history: [
      { at: "2026-10-19T09:31:00.000Z", cardId: "setup_mid", stepId: "card", kind: "created", from: "", to: "open", who: EVIL, whoKind: "ai", what: "Setup card for Gmail." },
      { at: "2026-10-19T09:32:00.000Z", cardId: "setup_mid", stepId: "card", kind: "stop", from: "open", to: "stopped", who: "Hal", whoKind: EVIL, what: "Stopped this setup card." },
      { at: "2026-10-19T09:33:00.000Z", cardId: "setup_mid", stepId: "card", kind: "start", from: "stopped", to: "open", by: "Desk AI Rex", whoKind: "si", what: "Started this setup card again." }
    ]
  };
}
function cardBundle() {
  return {
    id: "setup_bun", source: { type: "bundle", id: "starter-bundle", name: "Starter bundle", preview: true }, deskId: "own-desk", status: "open", statusText: "Open. 3 of 9 steps done.", bought: false, charged: false,
    groups: [
      { id: "g1", name: "Lead catcher", type: "automation", service: "Gmail", serviceId: "gmail", connectionId: null, acts: ["read", "message-new"] },
      { id: "g2", name: "Reply helper", type: "addon", service: null, serviceId: null, connectionId: null, acts: ["draft"] }
    ],
    steps: [step("card.desk", "card", "desk", "Pick a desk", "done")]
      .concat(groupSteps("g1", "Gmail", [["todo"], ["todo"], ["todo"], ["todo"]]))
      .concat(groupSteps("g2", "", [["skipped", "Needs no outside account."], ["skipped", "Needs no outside account."], ["todo"], ["todo"]])),
    history: []
  };
}
function cardBlocked() {
  const c = cardMid();
  c.id = "setup_blk"; c.status = "killed"; c.statusText = "Killed. Nothing more happens on this card.";
  c.steps.forEach((s) => { s.state = "blocked"; s.reason = "Killed. Nothing more happens on this card."; });
  c.history = [];
  return c;
}
function cardStopped() {
  const c = cardMid();
  c.id = "setup_stp"; c.status = "stopped"; c.statusText = "Stopped. Nothing runs from this card. Start it again to go on.";
  c.steps[1].state = "blocked"; c.steps[1].reason = "The connection was removed. Connect again to go on.";
  c.history = [];
  return c;
}
function settings() { return { ok: true, settings: { desks: { available: true, items: [{ slug: "own-desk", name: "Pat's desk", yours: "own" }, { slug: "help-desk", name: "Not mine", yours: "help" }] } } }; }

function world(opts) {
  opts = opts || {};
  innerHTMLUsed = 0;
  const mount = makeEl("section"); mount.id = "acct-connections"; mount.hidden = true;
  const store = Object.assign({}, opts.storage || {});
  const sess = {};
  const calls = [], logs = [], held = [];
  const document = { getElementById(id) { return id === "acct-connections" ? mount : null; }, createElement: makeEl };
  const logger = {};
  ["log", "info", "warn", "error", "debug"].forEach((k) => { logger[k] = function () { logs.push(Array.prototype.join.call(arguments, " ")); }; });
  const ctx = {
    document, console: logger, Date, JSON, Array, Object, String, Promise,
    location: { href: "https://aia.test/account", search: "", hash: "" },
    history: { pushState() { calls.push({ url: "pushState:" + JSON.stringify(arguments) }); }, replaceState() { calls.push({ url: "replaceState:" + JSON.stringify(arguments) }); } },
    localStorage: { getItem(k) { return k in store ? store[k] : null; }, setItem(k, v) { store[k] = String(v); }, removeItem(k) { delete store[k]; } },
    sessionStorage: { getItem(k) { return k in sess ? sess[k] : null; }, setItem(k, v) { sess[k] = String(v); }, removeItem(k) { delete sess[k]; } },
    confirm(msg) { calls.push({ url: "confirm", msg }); return opts.confirm !== false; },
    fetch(url, init) {
      const body = init && init.body ? JSON.parse(init.body) : null;
      calls.push({ url, init: init || {}, body, raw: init && init.body });
      const reply = opts.reply ? opts.reply(url, body, calls.length) : { status: 200, data: {} };
      const resp = { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json() { return Promise.resolve(reply.data); } };
      if (opts.hold && body && opts.hold(body)) return new Promise((r) => held.push(() => r(resp)));
      return Promise.resolve(resp);
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: "account-connections.js" });
  return { ctx, mount, calls, store, sess, logs, held, posts: () => calls.filter((c) => c.body), last: () => calls.filter((c) => c.body).slice(-1)[0] };
}
const SIGNED = { aia_ws: "aia", aia_session: "tok123" };
function happy(over) {
  return (url, body) => {
    if (url.indexOf("settings=1") >= 0) return { status: 200, data: settings() };
    const a = body && body.action;
    if (over && over[a]) { const r = over[a](body); if (r) return r; }
    if (a === "connections") return { status: 200, data: { ok: true, connections: [conn()], max: 20, note: "Saved here only. AIA does not sign in to these services." } };
    if (a === "setup-cards") return { status: 200, data: { ok: true, cards: [cardMid(), cardBundle(), cardBlocked(), cardStopped()] } };
    if (a === "connection-secret") return { status: 200, data: { ok: true, name: body.name, set: true } };
    if (a === "connect") return { status: 200, data: { ok: true, created: true, connection: conn({ id: "conn_new", service: body.service, serviceId: "shopify", label: body.label || "", secretNames: [{ name: "API_KEY", set: true }] }), cardCreated: true, card: Object.assign(cardMid(), { id: "setup_new", source: { type: "connection", id: "conn_new", name: body.service, preview: false } }), hint: "Saved, not tested yet. A setup card is waiting." } };
    if (a === "disconnect") return { status: 200, data: { ok: true, removed: body.connectionId, connections: [] } };
    if (a === "setup-step") {
      const c = cardMid();
      if (body.do === "stop") { c.status = "stopped"; c.statusText = "Stopped. Nothing runs from this card. Start it again to go on."; }
      if (body.do === "kill") { c.status = "killed"; c.steps.forEach((s) => { s.state = "blocked"; s.reason = "Killed. Nothing more happens on this card."; }); }
      if (body.do === "done" && body.stepId === "card.desk") c.steps[0].state = "done";
      c.id = body.cardId;
      return { status: 200, data: { ok: true, changed: true, saved: true, card: c, entry: { what: "Server says: step moved." } } };
    }
    return { status: 404, data: { ok: false, error: "No setup card like that." } };
  };
}
function cardBox(w, id) { return byId(w.mount, "acct-card-" + id); }
async function openCard(w, id) { const b = buttons(cardBox(w, id), "Open")[0]; if (b) { b.fire("click"); await settle(); } return cardBox(w, id); }
function allText(w) { return w.mount.textContent; }
function deepKeys(o, out) { out = out || []; if (o && typeof o === "object") Object.keys(o).forEach((k) => { out.push(k); deepKeys(o[k], out); }); return out; }
function noSecretAnywhere(w, label) {
  const html = w.mount.innerHTML;
  const vals = inputsOf(w.mount).map((i) => i.value).join("|");
  const attrs = find(w.mount, () => true).map((n) => JSON.stringify(n.attrs)).join("|");
  ok(html.indexOf(SECRET) < 0 && w.mount.textContent.indexOf(SECRET) < 0, label + ": secret not in the page text");
  ok(vals.indexOf(SECRET) < 0 && attrs.indexOf(SECRET) < 0, label + ": secret not left in any field or attribute");
  ok(JSON.stringify(w.store).indexOf(SECRET) < 0 && JSON.stringify(w.sess).indexOf(SECRET) < 0, label + ": secret not in localStorage or sessionStorage");
  ok(w.logs.join("\n").indexOf(SECRET) < 0, label + ": secret not in console logs");
  ok(w.calls.every((c) => String(c.url).indexOf(SECRET) < 0) && JSON.stringify(w.ctx.location).indexOf(SECRET) < 0, label + ": secret not in any address");
}
const MONEY = /^(buy|pay|price|checkout|charge|purchase|payment|amount|cost)$/i;

(async function main() {
  // ---------- static ----------
  ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(CODE), "account-connections.js must not write HTML");
  ok(!/\son[a-z]+\s*=/.test(CODE), "account-connections.js must not use inline handlers");
  ok(!/connected/i.test(CODE), "the page never writes the word connected");
  ok(!/\b(buy|price|pricing|checkout|market|purchase)\b|\bpay\b/i.test(CODE), "no Buy button, price, Market link or purchase flow");
  ok(!/\b(PASS|FAIL|HOLD)\b/.test(CODE), "no PASS, FAIL or HOLD words in the page");
  ok(!/sign in with/i.test(CODE), "no sign-in-with flow for outside services");
  ok(!/console\.|localStorage\.setItem|sessionStorage|location\.|history\.(push|replace)State/.test(CODE), "no logs, no storage writes, no address changes");
  ok(/\.type = "password"|i = field\(box, label, 0, "password"\)/.test(SRC) && /setAttribute\("autocomplete", "off"\)/.test(SRC), "secret fields are masked with autocomplete off");
  const acct = read("account.html");
  ok(/<section id="acct-connections" aria-label="Connections and setup cards" hidden><\/section>\s*<section id="acct-settings"/.test(acct), "account.html has the hidden Connections mount");
  ok(/<script src="account-settings\.js"><\/script>\s*<script src="account-connections\.js"><\/script>/.test(acct), "account.html loads account-connections.js after account-settings.js");
  ok(/<section id="acct-settings" aria-label="My account settings" hidden><\/section>\s*<\/main>/.test(acct), "345 settings mount still right before </main>");
  ok(fs.statSync(path.join(root, "desk.html")).size === 33792, "desk.html stays 33,792 bytes");
  ok(!/account-connections/.test(read("desk.html")), "desk.html untouched");
  ok(!/check-account-connections-ui/.test(read("package.json")), "not in npm test yet (waits for 336 and 355)");

  // ---------- signed out: nothing loads ----------
  { const w = world({ reply: happy() }); await settle(); ok(w.calls.length === 0 && w.mount.hidden === true, "signed out: no fetch, stays hidden"); }

  // ---------- full page ----------
  {
    const w = world({ storage: SIGNED, reply: happy() });
    await settle();
    ok(w.mount.hidden === false, "signed in: shows");
    const p = w.posts();
    ok(p[0] && p[0].url === "/api/account" && p[0].init.method === "POST" && JSON.stringify(p[0].body) === '{"action":"connections"}', "lists with exactly {action:connections}");
    ok(p[1] && JSON.stringify(p[1].body) === '{"action":"setup-cards"}', "lists cards with exactly {action:setup-cards}");
    ok(p[0].init.headers["X-Workspace"] === "aia" && p[0].init.headers["X-Session"] === "tok123", "sends own seat headers");
    const conns = byId(w.mount, "acct-conns");
    ok(!!conns && /Connections/.test(conns.textContent), "Connections section painted");
    ok(find(conns, (n) => n.className === "acct-conn-status").map((n) => n.textContent).join() === "Saved, not tested yet", "statusText shown word for word");
    ok(conns.textContent.indexOf("API_KEY: set") >= 0 && conns.textContent.indexOf("OTHER_KEY: not set") >= 0, "each secret name shows set or not set");
    ok(conns.textContent.indexOf("Hook address: not set") >= 0, "hook shows not set");
    const html = w.mount.innerHTML;
    ok(html.indexOf("<img") < 0 && html.indexOf("&lt;img src=x onerror=") >= 0, "label, service and who render as text");
    ok(innerHTMLUsed === 0, "no innerHTML writes at all");
    ok(!/connected/i.test(allText(w)), "page text never says connected");
    const secretInputs = inputsOf(w.mount).filter((i) => i.type === "password");
    ok(secretInputs.length >= 2 && secretInputs.every((i) => i.getAttribute("autocomplete") === "off"), "every secret field is type=password with autocomplete off");
    // Stop and Kill on every card, in every state
    ["setup_mid", "setup_bun", "setup_blk", "setup_stp"].forEach((id) => {
      const b = cardBox(w, id);
      ok(!!b, "card " + id + " painted");
      const s = buttons(b, "Stop"), k = buttons(b, "Kill");
      ok(s.length === 1 && k.length === 1 && !s[0].disabled && !k[0].disabled, "card " + id + ": Stop and Kill shown and live");
    });
    ok(buttons(cardBox(w, "setup_stp"), "Start again").length === 1, "a stopped card offers Start again");
    ok(cardBox(w, "setup_bun").textContent.indexOf("Preview, nothing is charged.") >= 0, "a preview card says nothing is charged");
    ok(cardBox(w, "setup_mid").textContent.indexOf("Preview, nothing is charged.") >= 0, "bought:false / charged:false says nothing is charged");
    ok(cardBox(w, "setup_mid").textContent.indexOf("Open. 0 of 5 steps done.") >= 0, "card statusText shown word for word");

    // open the mid card: steps, plain states, history kinds
    let mid = await openCard(w, "setup_mid");
    ok(find(mid, (n) => n.className === "acct-step").length === 5, "mid card shows all five steps");
    ok(/Pick a desk · To do/.test(mid.textContent), "plain state To do");
    const lis = find(mid, (n) => n.tagName === "li" && n.parentNode && n.parentNode.className === "acct-history").map((n) => n.textContent);
    ok(lis.some((t) => t.indexOf(EVIL + " (AI): Setup card for Gmail.") >= 0), "history shows who (Kind): what");
    ok(lis.some((t) => /Hal: Stopped this setup card\./.test(t)) && !lis.some((t) => t.indexOf("(" + EVIL) >= 0), "unknown kind left off");
    ok(lis.some((t) => /Desk AI Rex \(SI\): Started this setup card again\./.test(t)), "who || by names desk events");
    ok(buttons(mid, "Stop").length === 1 && buttons(mid, "Kill").length === 1, "opened card keeps Stop and Kill");

    // blocked + killed card open: reasons shown, still Stop and Kill, no step actions
    const blk = await openCard(w, "setup_blk");
    ok(/Blocked: Killed\. Nothing more happens on this card\./.test(blk.textContent), "blocked shows its reason");
    ok(buttons(blk, "Done").length === 0 && buttons(blk, "Stop").length === 1 && buttons(blk, "Kill").length === 1, "killed card: no step actions, Stop and Kill stay");
    const stp = await openCard(w, "setup_stp");
    ok(/Blocked: The connection was removed\. Connect again to go on\./.test(stp.textContent), "mid-setup blocked step shows reason");

    // bundle checklist
    const bun = await openCard(w, "setup_bun");
    const groups = find(bun, (n) => n.className === "acct-group");
    ok(groups.length === 2, "bundle shows one checklist per item");
    ok(groups[0] && /Lead catcher · Gmail/.test(groups[0].parts[0].textContent) && groups[1] && /Reply helper/.test(groups[1].parts[0].textContent), "bundle checklist names each item");
    ok(groups.every((g) => find(g, (n) => n.className === "acct-step").length === 4), "each bundle item lists its four steps");
    ok(/Skipped: Needs no outside account\./.test(groups[1].textContent) && /Pick a desk · Done/.test(bun.textContent), "plain Skipped and Done with reason");
    ok(/2 parts/.test(bun.textContent), "bundle says it has parts, one card");
    ok(buttons(bun, "Stop").length === 1 && buttons(bun, "Kill").length === 1, "bundle: Stop and Kill once on the one card");

    // ---- exact request bodies ----
    mid = cardBox(w, "setup_mid");
    const sel = find(mid, (n) => n.tagName === "select")[0];
    ok(sel && sel.parts.length === 2 && sel.parts[1].value === "own-desk", "desk pick lists only own desks");
    sel.value = "own-desk";
    buttons(mid, "Use this desk")[0].fire("click"); await settle();
    ok(JSON.stringify(w.last().body) === JSON.stringify({ action: "setup-step", cardId: "setup_mid", stepId: "card.desk", do: "done", deskId: "own-desk" }), "desk step sends deskId");
    ok(cardBox(w, "setup_mid").textContent.indexOf("Server says: step moved.") >= 0, "step reply shows the server's history line");
    mid = cardBox(w, "setup_mid");
    const csel = find(mid, (n) => n.tagName === "select").filter((s) => s.parts.some((o) => o.value === "conn_k3x9a1"))[0];
    csel.value = "conn_k3x9a1";
    buttons(mid, "Done")[0].fire("click"); await settle();
    ok(JSON.stringify(w.last().body) === JSON.stringify({ action: "setup-step", cardId: "setup_mid", stepId: "g1.connect", do: "done", connectionId: "conn_k3x9a1" }), "connect step sends connectionId");
    mid = cardBox(w, "setup_mid");
    const sstep = find(mid, (n) => n.className === "acct-step")[2];
    const sIn = inputsOf(sstep);
    sIn[0].value = "API_KEY"; sIn[1].value = SECRET;
    buttons(sstep, "Done")[0].fire("click"); await settle();
    const sb = w.last().body;
    ok(sb.action === "setup-step" && sb.stepId === "g1.secret" && sb.do === "done" && JSON.stringify(Object.keys(sb.secret)) === '["name","value"]' && sb.secret.name === "API_KEY" && sb.secret.value === SECRET, "secret step sends secret:{name,value}");
    mid = cardBox(w, "setup_mid");
    const sstep2 = find(mid, (n) => n.className === "acct-step")[2];
    buttons(sstep2, "Done")[0].fire("click"); await settle();
    ok(JSON.stringify(w.last().body) === JSON.stringify({ action: "setup-step", cardId: "setup_mid", stepId: "g1.secret", do: "done" }), "secret step with nothing typed uses the saved secret");
    mid = cardBox(w, "setup_mid");
    const skipStep = find(mid, (n) => n.className === "acct-step")[1];
    const before = w.posts().length;
    buttons(skipStep, "Skip")[0].fire("click"); await settle();
    ok(w.posts().length === before && /Say why/.test(cardBox(w, "setup_mid").textContent), "skip without a reason asks why, sends nothing");
    inputsOf(find(cardBox(w, "setup_mid"), (n) => n.className === "acct-step")[1]).slice(-1)[0].value = "Not using Gmail";
    buttons(find(cardBox(w, "setup_mid"), (n) => n.className === "acct-step")[1], "Skip")[0].fire("click"); await settle();
    ok(JSON.stringify(w.last().body) === JSON.stringify({ action: "setup-step", cardId: "setup_mid", stepId: "g1.connect", do: "skip", reason: "Not using Gmail" }), "skip sends do:skip with reason");
    mid = cardBox(w, "setup_mid");
    const ap = find(mid, (n) => n.className === "acct-step")[3];
    ok(buttons(ap, "Skip").length === 0 && buttons(find(mid, (n) => n.className === "acct-step")[4], "Skip").length === 0, "approve and test cannot be skipped");
    const apBoxes = find(ap, (n) => n.type === "checkbox");
    ok(apBoxes.length === 2 && apBoxes.every((b) => b.checked === false), "approve: two choices, both off by default (stop-and-ask kept on)");
    buttons(ap, "Approve once")[0].fire("click"); await settle();
    ok(JSON.stringify(w.last().body) === JSON.stringify({ action: "setup-step", cardId: "setup_mid", stepId: "g1.approve", do: "done", allow: { money: false, deletes: false, messageNew: false } }), "approve sends allow with every stop-before kept on");
    find(cardBox(w, "setup_mid"), (n) => n.className === "acct-step")[3] && find(find(cardBox(w, "setup_mid"), (n) => n.className === "acct-step")[3], (n) => n.type === "checkbox")[1] && (find(find(cardBox(w, "setup_mid"), (n) => n.className === "acct-step")[3], (n) => n.type === "checkbox")[1].checked = true);
    buttons(find(cardBox(w, "setup_mid"), (n) => n.className === "acct-step")[3], "Approve once")[0].fire("click"); await settle();
    ok(JSON.stringify(w.last().body.allow) === JSON.stringify({ money: false, deletes: false, messageNew: true }), "approve sends the one choice that was ticked");
    buttons(find(cardBox(w, "setup_mid"), (n) => n.className === "acct-step")[4], "Run the dry run")[0].fire("click"); await settle();
    ok(JSON.stringify(w.last().body) === JSON.stringify({ action: "setup-step", cardId: "setup_mid", stepId: "g1.test", do: "done" }), "test is a dry run: no live, no extras");
    for (const verb of ["stop", "kill"]) {
      buttons(cardBox(w, "setup_bun"), verb === "stop" ? "Stop" : "Kill")[0].fire("click"); await settle();
      ok(JSON.stringify(w.last().body) === JSON.stringify({ action: "setup-step", cardId: "setup_bun", do: verb }), verb + " sends {action, cardId, do}");
    }
    buttons(cardBox(w, "setup_stp"), "Start again")[0].fire("click"); await settle();
    ok(JSON.stringify(w.last().body) === JSON.stringify({ action: "setup-step", cardId: "setup_stp", do: "start" }), "start sends do:start");

    // connection secret (success): cleared, only NAME: set
    const row = find(w.mount, (n) => n.className === "acct-conn")[0];
    const rIn = inputsOf(row);
    rIn[0].value = "NEW_KEY"; rIn[1].value = SECRET;
    buttons(row, "Save secret")[0].fire("click");
    ok(rIn[1].value === "", "connection secret field empty right after send");
    await settle();
    ok(JSON.stringify(w.last().body) === JSON.stringify({ action: "connection-secret", connectionId: "conn_k3x9a1", name: "NEW_KEY", value: SECRET }), "connection-secret sends connectionId, name, value");
    ok(rIn[1].value === "", "connection secret field empty after success");
    ok(find(byId(w.mount, "acct-conns"), (n) => n.getAttribute("role") === "status" && n.textContent === "NEW_KEY: set").length === 1, "after a save only NAME: set is shown");
    ok(byId(w.mount, "acct-conns").textContent.indexOf("NEW_KEY: set") >= 0, "list shows the new name as set");

    // connect form
    const form = find(w.mount, (n) => n.className === "acct-connect")[0];
    const fIn = inputsOf(form);
    fIn[0].value = "Shopify"; fIn[1].value = "Main store"; fIn[2].value = "API_KEY"; fIn[3].value = SECRET; fIn[4].value = "https://hooks.example.test/abc";
    find(form, (n) => n.tagName === "select")[0].value = "own-desk";
    buttons(form, "Save")[0].fire("click");
    ok(fIn[3].value === "", "connect secret field empty right after send");
    await settle();
    ok(JSON.stringify(w.last().body) === JSON.stringify({ action: "connect", service: "Shopify", label: "Main store", secrets: { API_KEY: SECRET }, hook: "https://hooks.example.test/abc", deskId: "own-desk" }), "connect sends service, label, secrets{NAME:value}, hook, deskId");
    ok(fIn[3].value === "" && fIn[4].value === "", "connect secret and hook fields empty after success");
    ok(form.textContent.indexOf("Saved, not tested yet. A setup card is waiting.") >= 0, "connect shows the server's hint");
    ok(!!cardBox(w, "setup_new"), "the new setup card appears");

    // disconnect: confirm first
    const offRow = find(w.mount, (n) => n.className === "acct-conn")[0];
    buttons(offRow, "Disconnect")[0].fire("click"); await settle();
    const cf = w.calls.filter((c) => c.url === "confirm").slice(-1)[0];
    ok(!!cf && /Remove/.test(cf.msg), "disconnect asks first");
    ok(w.posts().some((c) => JSON.stringify(c.body) === JSON.stringify({ action: "disconnect", connectionId: "conn_k3x9a1" })), "disconnect sends connectionId");

    // no buy / pay / price anywhere, and every action is a 355 action
    const keys = [].concat.apply([], w.posts().map((c) => deepKeys(c.body)));
    ok(!keys.some((k) => MONEY.test(k)), "no buy, pay or price field in any request");
    ok(w.posts().every((c) => !/"(buy|pay|price|checkout)"/i.test(c.raw)), "no money word as a field in any raw body");
    const ACTIONS = ["connections", "connect", "connection-secret", "disconnect", "setup-cards", "setup-card", "setup-step"];
    ok(w.posts().every((c) => ACTIONS.indexOf(c.body.action) >= 0), "every request uses a 355 action name");
    ok(w.posts().filter((c) => c.body.action === "setup-step").every((c) => ["done", "skip", "stop", "kill", "start"].indexOf(c.body.do) >= 0 && c.body.live === undefined), "setup-step do is done|skip|stop|kill|start, never live");
    ok(!/connected/i.test(allText(w)), "after every action the page still never says connected");
    noSecretAnywhere(w, "after successful sends");
  }

  // ---------- statusText follows the server, not the page ----------
  {
    const w = world({ storage: SIGNED, reply: happy({ connections: () => ({ status: 200, data: { ok: true, connections: [conn({ status: "tested", statusText: "Tested", hookSet: true })] } }) }) });
    await settle();
    ok(find(w.mount, (n) => n.className === "acct-conn-status").map((n) => n.textContent).join() === "Tested", "a different statusText is shown as sent");
    ok(byId(w.mount, "acct-conns").textContent.indexOf("Hook address: set") >= 0, "hook shows set");
  }

  // ---------- refusals: 409 / 403 / 503 show the server's own words ----------
  const ERR = {
    409: "Do the earlier steps first: Connect Gmail.",
    403: "An AI or SI account can't change this itself. The human owner can.",
    503: "The desk can't save right now. Try again in a moment."
  };
  for (const code of [409, 403, 503]) {
    const bad = () => ({ status: code, data: code === 503 ? { ok: false, error: ERR[503], code: "store_not_ready" } : { ok: false, error: ERR[code] } });
    const w = world({ storage: SIGNED, reply: happy({ "setup-step": (b) => b.do === "stop" || b.do === "kill" ? null : bad(), "connection-secret": bad, connect: bad }) });
    await settle();
    let mid = await openCard(w, "setup_mid");
    buttons(find(mid, (n) => n.className === "acct-step")[4], "Run the dry run")[0].fire("click"); await settle();
    mid = cardBox(w, "setup_mid");
    const t = mid.textContent;
    ok(t.indexOf(ERR[code]) >= 0, code + ": step shows the server's error text");
    ok(t.indexOf(String(code)) < 0 && t.indexOf("store_not_ready") < 0, code + ": no raw code shown");
    ok(t.indexOf("Server says: step moved.") < 0 && !/Saved\.|Working…/.test(t), code + ": no false done, no stuck spinner");
    ok(/Test run \(dry run\) · To do/.test(t), code + ": the step stays To do");
    // a secret step refusal also clears the field
    const sstep = find(mid, (n) => n.className === "acct-step")[2];
    const sIn = inputsOf(sstep); sIn[0].value = "API_KEY"; sIn[1].value = SECRET;
    buttons(sstep, "Done")[0].fire("click");
    ok(sIn[1].value === "", code + ": card secret field empty right after send");
    await settle();
    ok(sIn[1].value === "" && cardBox(w, "setup_mid").textContent.indexOf(ERR[code]) >= 0, code + ": card secret field empty after refusal and reason shown");
    // connection-secret refusal
    const row = find(w.mount, (n) => n.className === "acct-conn")[0];
    const rIn = inputsOf(row); rIn[0].value = "API_KEY"; rIn[1].value = SECRET;
    buttons(row, "Save secret")[0].fire("click");
    ok(rIn[1].value === "", code + ": connection secret field empty right after send");
    await settle();
    ok(rIn[1].value === "", code + ": connection secret field empty after refusal");
    ok(row.textContent.indexOf(ERR[code]) >= 0 && row.textContent.indexOf("API_KEY: set") >= 0 && byId(w.mount, "acct-conns").textContent.indexOf("API_KEY: set") >= 0, code + ": connection secret refusal shows the reason");
    ok(!find(byId(w.mount, "acct-conns"), (n) => n.getAttribute("role") === "status").some((n) => /: set$/.test(n.textContent)), code + ": no false set after a refusal");
    // connect refusal
    const form = find(w.mount, (n) => n.className === "acct-connect")[0];
    const fIn = inputsOf(form); fIn[0].value = "Shopify"; fIn[2].value = "API_KEY"; fIn[3].value = SECRET;
    buttons(form, "Save")[0].fire("click");
    ok(fIn[3].value === "", code + ": connect secret field empty right after send");
    await settle();
    ok(fIn[3].value === "" && form.textContent.indexOf(ERR[code]) >= 0, code + ": connect refusal clears the field and shows the reason");
    // Stop and Kill still answer and still show
    buttons(cardBox(w, "setup_mid"), "Kill")[0].fire("click"); await settle();
    ok(buttons(cardBox(w, "setup_mid"), "Stop").length === 1 && buttons(cardBox(w, "setup_mid"), "Kill").length === 1 && !buttons(cardBox(w, "setup_mid"), "Kill")[0].disabled, code + ": after Kill, Stop and Kill still show");
    noSecretAnywhere(w, code);
  }

  // ---------- Stop and Kill that do not save (store guard 503, any failure, saved:false) ----------
  {
    const G503 = { status: 503, data: { ok: false, error: "The desk can't save right now. Try again in a moment.", code: "store_not_ready" } };
    const shapes = [["503", () => G503], ["409", () => ({ status: 409, data: { ok: false, error: "Something else." } })], ["offline", null], ["saved:false", (b) => { const c = cardMid(); c.id = b.cardId; c.status = b.do === "stop" ? "stopped" : "killed"; c.statusText = b.do === "stop" ? "Stopped. Nothing runs from this card. Start it again to go on." : "Killed. Nothing more happens on this card."; return { status: 200, data: { ok: true, changed: true, saved: false, card: c, hint: "Stopped here, but it did not save. Tap Stop again." } }; }]];
    for (const [label, fn] of shapes) {
      for (const verb of ["stop", "kill"]) {
        const w = world({ storage: SIGNED, reply: happy({ "setup-step": (b) => (b.do === "stop" || b.do === "kill") && fn ? fn(b) : null }) });
        let lost = 0;
        if (!fn) { const f0 = w.ctx.fetch; w.ctx.fetch = (u, i) => { const b = i && i.body ? JSON.parse(i.body) : {}; if (b.do === "stop" || b.do === "kill") { lost += 1; return Promise.reject(new Error("offline")); } return f0(u, i); }; }
        await settle();
        await openCard(w, "setup_mid");
        const Verb = verb === "stop" ? "Stop" : "Kill";
        buttons(cardBox(w, "setup_mid"), Verb)[0].fire("click"); await settle();
        const b = cardBox(w, "setup_mid");
        const st = find(b, (n) => n.getAttribute("role") === "status")[0];
        ok(st && st.textContent === Verb + " didn't save. Try again in a moment.", label + " " + verb + ": says exactly " + Verb + " didn't save");
        ok(b.textContent.indexOf("Open. 0 of 5 steps done.") >= 0 && !/Stopped\.|Killed\./.test(b.textContent) && buttons(b, "Start again").length === 0, label + " " + verb + ": card never shown stopped or killed");
        ok(/Pick a desk · To do/.test(b.textContent) && !/Blocked/.test(b.textContent), label + " " + verb + ": steps unchanged");
        ok(buttons(b, "Stop").length === 1 && buttons(b, "Kill").length === 1 && !buttons(b, "Stop")[0].disabled && !buttons(b, "Kill")[0].disabled, label + " " + verb + ": Stop and Kill stay live to try again");
        const n = w.posts().filter((c) => c.body.do === verb).length + lost;
        buttons(b, Verb)[0].fire("click"); await settle();
        ok(w.posts().filter((c) => c.body.do === verb).length + lost === n + 1, label + " " + verb + ": tapping again sends again");
      }
    }
    // other steps on a 503 show the server's words
    const w = world({ storage: SIGNED, reply: happy({ "setup-step": (b) => b.do === "done" ? G503 : null }) });
    await settle();
    const mid = await openCard(w, "setup_mid");
    buttons(find(mid, (n) => n.className === "acct-step")[4], "Run the dry run")[0].fire("click"); await settle();
    ok(find(cardBox(w, "setup_mid"), (n) => n.getAttribute("role") === "status")[0].textContent === "The desk can't save right now. Try again in a moment.", "a step's 503 shows the server's error text");
  }

  // ---------- no blank error, and offline ----------
  {
    const w = world({ storage: SIGNED, reply: happy({ "setup-step": (b) => b.do === "done" ? { status: 500, data: {} } : null }) });
    await settle();
    let mid = await openCard(w, "setup_mid");
    buttons(find(mid, (n) => n.className === "acct-step")[4], "Run the dry run")[0].fire("click"); await settle();
    const st = find(cardBox(w, "setup_mid"), (n) => n.getAttribute("role") === "status")[0];
    ok(st && st.textContent.trim().length > 0 && !/500/.test(st.textContent), "an error with no words still says something plain");
  }
  {
    const w = world({ storage: SIGNED, reply: happy({ "connection-secret": () => ({ status: 200, data: { ok: true, name: "API_KEY", set: true, value: SECRET, hint: SECRET } }) }) });
    await settle();
    const row = find(w.mount, (n) => n.className === "acct-conn")[0];
    const rIn = inputsOf(row); rIn[0].value = "API_KEY"; rIn[1].value = SECRET;
    buttons(row, "Save secret")[0].fire("click"); await settle();
    ok(find(byId(w.mount, "acct-conns"), (n) => n.getAttribute("role") === "status" && n.textContent === "API_KEY: set").length === 1, "a reply with extra fields still shows only NAME: set");
    noSecretAnywhere(w, "echoing reply");
  }

  // ---------- held reply: field already empty while waiting ----------
  {
    const w = world({ storage: SIGNED, reply: happy(), hold: (b) => b.action === "connection-secret" });
    await settle();
    const row = find(w.mount, (n) => n.className === "acct-conn")[0];
    const rIn = inputsOf(row); rIn[0].value = "API_KEY"; rIn[1].value = SECRET;
    buttons(row, "Save secret")[0].fire("click"); await settle();
    ok(w.held.length === 1 && rIn[1].value === "", "secret field empty while the save is still on its way");
    w.held[0](); await settle();
    ok(rIn[1].value === "", "secret field empty once the save is back");
  }

  // ---------- Stop and Kill stay live while a reply is on its way ----------
  {
    const w = world({ storage: SIGNED, reply: happy(), hold: (b) => b.action === "setup-step" });
    await settle();
    for (const id of ["setup_mid", "setup_stp"]) {
      buttons(cardBox(w, id), "Kill")[0].fire("click"); await settle();
      const b = cardBox(w, id);
      ok(!buttons(b, "Stop")[0].disabled && !buttons(b, "Kill")[0].disabled, id + ": Stop and Kill never greyed out while Kill is sending");
      buttons(b, "Stop")[0].fire("click"); await settle();
      ok(!buttons(cardBox(w, id), "Stop")[0].disabled && !buttons(cardBox(w, id), "Kill")[0].disabled, id + ": Stop and Kill never greyed out while Stop is sending");
    }
    ok(w.held.length === 4, "every Stop and Kill tap went out, even with one still on its way");
    w.held.forEach((r) => r()); await settle();
  }

  // ---------- disconnect needs a yes ----------
  {
    const w = world({ storage: SIGNED, reply: happy(), confirm: false });
    await settle();
    buttons(find(w.mount, (n) => n.className === "acct-conn")[0], "Disconnect")[0].fire("click"); await settle();
    ok(!w.posts().some((c) => c.body.action === "disconnect"), "disconnect sends nothing without a yes");
  }

  console.log("check-account-connections-ui: " + passes + " pass, " + failures + " fail");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("check-account-connections-ui: FAIL crashed " + (e && e.stack || e)); process.exit(1); });
