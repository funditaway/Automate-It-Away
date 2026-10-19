#!/usr/bin/env node
// Opening a card: the same frame for every card, only the middle changes by type.
// Runs the REAL card-type.js, card-middle.js, desk-card.js (openJob) in a small DOM stub.
// usage: node scripts/check-card-types.js [repoRoot]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
let failures = 0, passes = 0;
function fail(msg) { failures += 1; console.error("check-card-types: FAIL " + msg); }
function ok(cond, msg) { if (cond) passes += 1; else fail(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

// ---------- a small DOM: ordered parts (html strings and nodes), serialised with real escaping ----------
const VOID = { img: 1, br: 1, input: 1 };
function escText(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escAttr(s) { return escText(s).replace(/"/g, "&quot;"); }
function makeEl(tag) {
  const el = {
    tagName: String(tag).toLowerCase(), attrs: {}, className: "", parts: [], style: {}, dataset: {},
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    appendChild(c) { if (!c || !c.tagName) throw new TypeError("appendChild needs a node"); this.parts.push(c); return c; },
    insertAdjacentHTML(where, html) { if (where === "beforeend") this.parts.push({ html: String(html) }); },
    addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} }, focus() {}, scrollIntoView() {},
    set textContent(v) { this.parts = [{ text: String(v == null ? "" : v) }]; },
    get textContent() { return this.parts.map((p) => p.html !== undefined ? p.html.replace(/<[^>]*>/g, "") : p.text !== undefined ? p.text : p.textContent).join(""); },
    set innerHTML(v) { this.parts = [{ html: String(v == null ? "" : v) }]; },
    get innerHTML() { return serialize(this, true); },
    get firstChild() { return this.parts.find((p) => p.tagName) || null; }
  };
  return el;
}
function serialize(el, inner) {
  const body = el.parts.map((p) => p.html !== undefined ? p.html : p.text !== undefined ? escText(p.text) : serialize(p, false)).join("");
  if (inner) return body;
  const attrs = (el.className ? ' class="' + escAttr(el.className) + '"' : "") + Object.keys(el.attrs).map((k) => " " + k + '="' + escAttr(el.attrs[k]) + '"').join("");
  return "<" + el.tagName + attrs + ">" + (VOID[el.tagName] ? "" : body + "</" + el.tagName + ">");
}
function walk(el, fn) { fn(el); (el.parts || []).forEach((p) => { if (p.tagName) walk(p, fn); }); }

function world(opts) {
  opts = opts || {};
  const els = {};
  const document = {
    getElementById(id) { if (!els[id]) els[id] = makeEl("div"); return els[id]; },
    createElement: makeEl, querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {}
  };
  const ctx = {
    document, console, URLSearchParams, setTimeout() { return 0; }, clearTimeout() {},
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { search: "", href: "https://probe.test/" }, navigator: {}
  };
  ctx.window = ctx; ctx.addEventListener = function () {};
  ctx.JOBS = []; ctx.FIELDS = []; ctx.PEOPLE = [{ name: "Pat", role: "owner" }]; ctx.role = opts.role || "owner";
  ctx.labelStatus = (s) => String(s || ""); ctx.api = async () => ({ status: 200, data: {} });
  ctx.load = async function () {};
  if (opts.approved) ctx.isCardApproved = () => true;
  return ctx;
}
function loadInto(ctx, rels) { rels.forEach((rel) => vm.runInNewContext(read(rel), ctx, { filename: rel })); }
const BASE = ["escape-html.js", "desk-html-view.js"];
async function openIn(job, o) {
  o = o || {};
  const ctx = world(o);
  loadInto(ctx, BASE);
  ctx.esc = ctx.escapeHtml; // desk.html defines esc() the same way
  if (!o.noTypes) loadInto(ctx, ["card-type.js", "card-middle.js"]);
  loadInto(ctx, ["desk-card.js"]);
  if (o.patch) o.patch(ctx);
  ctx.JOBS = [job];
  await vm.runInNewContext("openJob(" + JSON.stringify(job && job.id) + ")", ctx);
  const card = ctx.document.getElementById("sheet-card");
  return { card, html: serialize(card, true), ctx };
}
function decideRow(html) { const i = html.indexOf('<div class="sheet-decide">'); return i < 0 ? "" : html.slice(i); }

// ---------- 1. the detector ----------
const T = require(path.join(root, "card-type.js"));
const EV = "<img src=x onerror=alert(1)>";
const TABLE = [
  ["empty object", {}, "unknown"], ["null", null, "unknown"], ["undefined", undefined, "unknown"], ["string", "file", "unknown"], ["array", [], "unknown"], ["number", 5, "unknown"],
  ["plain note", { title: "Call plumber", kind: "note" }, "unknown"],
  ["run with runNo", { run: { runNo: 2 } }, "automation"], ["run with state", { run: { state: "waiting" } }, "automation"],
  ["run empty object", { run: {} }, "unknown"], ["run null", { run: null }, "unknown"], ["run string", { run: "yes" }, "unknown"], ["run array", { run: [1] }, "unknown"],
  ["files[] with one", { files: [{ name: "a.pdf", url: "/api/upload?id=a" }] }, "file"], ["files[] empty", { files: [] }, "unknown"], ["files not an array (string)", { files: "a.pdf" }, "unknown"],
  ["files not an array (object)", { files: { 0: "a" } }, "unknown"], ["photoUrl", { photoUrl: "/api/upload?id=a" }, "file"], ["kind photo", { kind: "photo" }, "file"],
  ["custom.mode files", { custom: { mode: "files" } }, "file"], ["custom.lane files", { custom: { lane: "files" } }, "file"], ["custom string", { custom: "files" }, "unknown"],
  ["custom.mode other", { custom: { mode: "email" } }, "unknown"],
  ["contactName", { contactName: "Dana" }, "lead"], ["phone", { phone: "555-0100" }, "lead"], ["email", { email: "d@x.co" }, "lead"],
  ["kind walk-in", { kind: "walk-in" }, "lead"], ["kind widget", { kind: "widget" }, "lead"], ["kind call", { kind: "call" }, "lead"], ["kind form", { kind: "form" }, "lead"],
  ["kind email", { kind: "email" }, "lead"], ["kind text", { kind: "text" }, "lead"], ["kind request", { kind: "request" }, "lead"], ["kind constructor (not own)", { kind: "constructor" }, "unknown"], ["kind toString", { kind: "toString" }, "unknown"],
  ["decide + amount", { decide: true, amount: 40 }, "approval"], ["decide + ask text", { decide: true, ask: "Pay the vendor?" }, "approval"], ["decide + risk", { decide: true, risk: "high" }, "approval"],
  ["decide + payoutTo", { decide: true, payoutTo: "Sam" }, "approval"], ["decide + artifact", { decide: true, artifact: "invoice" }, "approval"], ["decide + draft", { decide: true, draft: "Hi" }, "approval"],
  ["waiting + amount", { status: "waiting", amount: 5 }, "approval"], ["held + draft", { status: "held", draft: "x" }, "approval"],
  ["decide, nothing stored to show", { decide: true }, "unknown"], ["amount alone", { amount: 40 }, "unknown"], ["status open + amount", { status: "open", amount: 5 }, "unknown"],
  ["decide as string", { decide: "true", amount: 5 }, "unknown"],
  // double matches: first match wins
  ["photo + contact", { photoUrl: "/api/upload?id=a", contactName: "Dana", phone: "555" }, "file"],
  ["lead with amount", { kind: "call", contactName: "Dana", amount: 90, decide: true }, "lead"],
  ["run + files", { run: { runNo: 1 }, files: [{ url: "/a" }] }, "automation"],
  ["run + lead + approval", { run: { state: "running" }, email: "a@b.co", decide: true, amount: 1 }, "automation"],
  ["file + approval", { files: [{ name: "q.pdf", url: "/a" }], decide: true, amount: 5 }, "file"],
  ["kind photo + contact", { kind: "photo", email: "a@b.co" }, "file"]
];
TABLE.forEach(function (r) { ok(T.cardType(r[1]) === r[2], "detector · " + r[0] + ": got " + T.cardType(r[1]) + " want " + r[2]); });
ok(T.typeLabel("file") === "File" && T.typeLabel("lead") === "Lead" && T.typeLabel("approval") === "Needs your Yes" && T.typeLabel("automation") === "Automation" && T.typeLabel("unknown") === "" && T.typeLabel("constructor") === "", "type labels");
const hostile = { get title() { throw new Error("boom"); }, get files() { throw new Error("boom"); }, get run() { throw new Error("boom"); } };
ok(T.cardType(hostile) === "unknown", "detector survives a getter that throws");
console.log("check-card-types: detector table " + TABLE.length + " rows");

// ---------- 2. every type, through the real openJob ----------
const SAMPLE = { staff: false };
const YES = (h) => '<button class="go q-yes" type="button" onclick="approveCard(\'' + h + '\')">Yes</button>';
const START = (h, m) => '<button class="go q-start" type="button" onclick="startCard(\'' + h + "', " + m + ')">Start</button>';
const STOP = (h) => '<button class="kill q-stop" type="button" onclick="kill(\'' + h + '\')">Stop</button>';
const DECIDE = (h, mid, staff) => '<div class="sheet-decide"><button class="edit" type="button" onclick="carryJob(\'' + h + '\')">Done by hand</button><button class="edit" type="button" onclick="document.getElementById(\'sheet\').classList.remove(\'on\')">Close</button>' + mid + (staff ? "<span></span>" : STOP(h)) + "</div>";

const FIX = {
  file: { id: "f1", title: "Porch photos", status: "open", files: [{ id: "a1", name: "invoice.pdf", type: "application/octet-stream", kind: "document", bytes: 1572864, url: "/api/upload?id=a1" }, { id: "a2", name: "porch.png", type: "image/png", kind: "photo", bytes: 2048, url: "/api/upload?id=a2" }, { id: "a3", name: "IMG_1.HEIC", type: "image/heic", kind: "photo", bytes: 500, url: "/api/upload?id=a3" }], from: "Dana", to: "Pat", contactName: "Dana", phone: "555-0100", decide: true, amount: 25 },
  lead: { id: "l1", title: "Fence quote", status: "open", kind: "walk-in", contactName: "Dana Lee", phone: "(555) 010-0100", email: "dana@example.com", notes: "Wants a 40ft fence", outcome: "A quote by Friday", amount: 90, decide: true },
  approval: { id: "p1", title: "Pay Sam", status: "waiting", decide: true, draft: "Send Sam $120 for the gutter job", amount: 120, payoutTo: "Sam Rivera", risk: "Money moves", artifact: "https://example.com/inv/9" },
  automation: { id: "r1", title: "Weekly sweep", status: "open", run: { state: "waiting", runNo: 3, steps: [{ n: 1, action: "plan", said: "Found 2 late cards", result: "done", why: "" }, { n: 2, action: "send", said: "Text Dana", result: "unsure", why: "No answer yet" }], waiting: { n: 2, action: "send", why: "Asked you" } }, decide: true },
  unknown: { id: "u1", title: "Oil change", status: "open", why: "Friday", kind: "note" }
};
function leaves(card) { const out = []; walk(card, (n) => { if (n.tagName) out.push(n); }); return out; }
function frameOf(card) { return card.parts.find((p) => p.tagName === "div" && /card-frame/.test(p.className)); }
function textsOf(node) { return node.textContent; }

(async function () {
  // frame order and lines
  for (const type of ["file", "lead", "approval", "automation"]) {
    const r = await openIn(FIX[type]);
    const frame = frameOf(r.card);
    ok(!!frame, type + " · typed frame is used");
    if (!frame) continue;
    const kids = frame.parts.filter((p) => p.tagName);
    const classes = kids.map((k) => k.tagName + "." + k.className.split(" ")[0]);
    ok(kids.length >= 5 && kids[0].tagName === "h3" && /card-type-label/.test(kids[1].className) && /card-ask/.test(kids[2].className) && /card-next/.test(kids[3].className) && /card-middle/.test(kids[4].className), type + " · frame order title, label, ask, next step, middle (" + classes.join(" ") + ")");
    ok(kids[0].textContent === FIX[type].title, type + " · title");
    ok(kids[1].textContent === T.typeLabel(type), type + " · label " + kids[1].textContent);
    ok(kids[2].textContent.length > 0 && kids[2].textContent.length < 420, type + " · one ask line");
    ok(/Next step/.test(kids[3].textContent), type + " · next step box");
    ok(kids[5] && /card-timeline/.test(kids[5].className) && kids[5].getAttribute("data-card") === FIX[type].id && kids[5].parts.length === 0, type + " · empty timeline mount point");
    ok(r.html.indexOf('<div class="sheet-decide">') > r.html.indexOf("card-frame"), type + " · decide row comes after the frame");
    ok(/Save info/.test(r.html) && /id="job-note"/.test(r.html) && /Copy draft/.test(r.html), type + " · Save info, Note or ask and Copy draft are still on the card");
    ok(r.html.indexOf("card-more") > r.html.indexOf("card-frame") && r.html.indexOf("card-more") < r.html.indexOf("sheet-decide"), type + " · the old card body is kept under More");
  }

  // decide row: byte-identical to the generic card, for typed and unknown, owner / staff / approved
  const rows = [
    { name: "owner, not approved", o: {}, want: DECIDE("X", YES("X"), false) },
    { name: "owner, approved", o: { approved: true }, want: DECIDE("X", START("X", 0), false) },
    { name: "staff", o: { role: "employee" }, want: DECIDE("X", YES("X"), true) }
  ];
  for (const rw of rows) {
    for (const type of ["file", "lead", "approval", "automation", "unknown"]) {
      const job = Object.assign({}, FIX[type], { id: "X" }); delete job.amount; job.ask = 0;
      const r = await openIn(job, rw.o);
      ok(decideRow(r.html) === rw.want, "decide row byte-identical · " + type + " · " + rw.name + "\n   got  " + decideRow(r.html) + "\n   want " + rw.want);
    }
  }
  { const job = Object.assign({}, FIX.approval, { id: "X", amount: 120 }); const r = await openIn(job, { approved: true });
    ok(decideRow(r.html) === DECIDE("X", START("X", 120), false), "decide row with money · Start passes the amount"); }
  { const typed = await openIn(Object.assign({}, FIX.file, { id: "id<b>1" })); const gen = await openIn(Object.assign({}, FIX.unknown, { id: "id<b>1" }));
    ok(decideRow(typed.html) === decideRow(gen.html) && /approveCard\('idb1'\)/.test(decideRow(typed.html)), "decide row · id with markup is the same safe id both ways"); }

  // file middle
  { const r = await openIn(FIX.file); const f = frameOf(r.card); const all = leaves(f);
    const imgs = all.filter((n) => n.tagName === "img").map((n) => n.attrs.src);
    const links = all.filter((n) => n.tagName === "a" && /q-file/.test(n.className)).map((n) => [n.attrs.href, n.textContent, n.attrs.rel]);
    ok(JSON.stringify(imgs) === JSON.stringify(["/api/upload?id=a2"]), "file · thumbnail only for png: " + JSON.stringify(imgs));
    ok(JSON.stringify(links) === JSON.stringify([["/api/upload?id=a1", "invoice.pdf", "noopener"], ["/api/upload?id=a3", "IMG_1.HEIC", "noopener"]]), "file · PDF and HEIC are named links with rel noopener: " + JSON.stringify(links));
    const t = textsOf(f);
    ok(/1\.5 MB/.test(t) && /2 KB/.test(t) && /500 B/.test(t), "file · size in human units: " + t.slice(0, 200));
    ok(/From: Dana/.test(t) && /To: Pat/.test(t), "file · from and to");
    ok(/Contact: Dana · 555-0100/.test(t), "file · contact line");
    ok(/Needs your Yes\./.test(t), "file · Needs your Yes line when decide");
    const f2 = frameOf((await openIn({ id: "f2", title: "t", files: [{ name: "a.pdf", url: "/a" }] })).card);
    ok(!/Needs your Yes|Contact:/.test(textsOf(f2)), "file · no Yes line / contact line when not stored");
    const f3 = frameOf((await openIn({ id: "f3", title: "t", custom: { mode: "files" } })).card);
    ok(/No file on this card yet/.test(textsOf(f3)), "file · lane card with no file says so");
    const f4 = frameOf((await openIn({ id: "f4", title: "t", photoUrl: "https://store.public.blob.vercel-storage.com/desk/file_2.pdf" })).card);
    ok(leaves(f4).filter((n) => n.tagName === "img").length === 0 && /file_2\.pdf/.test(textsOf(f4)), "file · legacy photoUrl .pdf is a named link, no thumbnail");
  }
  // lead middle
  { const r = await openIn(FIX.lead); const f = frameOf(r.card); const t = textsOf(f); const all = leaves(f);
    const hrefs = all.filter((n) => n.tagName === "a").map((n) => n.attrs.href);
    ok(JSON.stringify(hrefs) === JSON.stringify(["tel:5550100100", "mailto:dana@example.com"]), "lead · tel and mailto: " + JSON.stringify(hrefs));
    ok(/Who: Dana Lee/.test(t) && /What they need: A quote by Friday · Wants a 40ft fence/.test(t) && /How to reach|Phone:/.test(t) && /Came in by: walk-in/.test(t), "lead · who, what they need, how to reach: " + t);
    ok(t.indexOf("Who:") < t.indexOf("What they need:") && t.indexOf("What they need:") < t.indexOf("Phone:"), "lead · order who, what they need, how to reach");
    const bad = frameOf((await openIn({ id: "l2", title: "t", kind: "call", phone: "javascript:alert(1)", email: "not an email" })).card);
    ok(leaves(bad).filter((n) => n.tagName === "a").length === 0, "lead · odd phone or email is text, never a link");
    ok(/no phone or email/.test(textsOf(frameOf((await openIn({ id: "l3", title: "t", kind: "form" })).card))), "lead · says plainly when nothing to reach them by");
  }
  // approval middle
  { const r = await openIn(FIX.approval); const f = frameOf(r.card); const t = textsOf(f);
    ok(/Send Sam \$120 for the gutter job/.test(t) && /Amount: \$120/.test(t) && /Pay to: Sam Rivera/.test(t) && /Risk: Money moves/.test(t) && /Nothing happens until you say Yes\./.test(t), "approval · action as stored, amount, payee, risk, Nothing happens: " + t);
    ok(!/Collect|HOLD/.test(textsOf(f)), "approval · adds no Collect or HOLD wording");
    ok(leaves(f).filter((n) => n.tagName === "button").length === 0, "approval · no buttons in the frame");
  }
  // automation middle
  { const r = await openIn(FIX.automation); const f = frameOf(r.card); const t = textsOf(f);
    ok(/Found 2 late cards/.test(t) && /Text Dana · unsure/.test(t), "automation · steps shown: " + t);
    ok(t.indexOf("This step may have already run. Check before it tries again.") >= 0, "automation · unsure sentence");
    ok(leaves(f).filter((n) => n.tagName === "button" || n.tagName === "a").length === 0 && !/onclick/.test(serialize(f, false)), "automation · no buttons, no links, no handlers (stub)");
    ok(/Check the unsure step first/.test(t), "automation · next step names the unsure step");
    ok(!/may have already run/.test(textsOf(frameOf((await openIn({ id: "r2", title: "t", run: { state: "done", runNo: 1, steps: [{ said: "ok", result: "done" }] } })).card))), "automation · sentence only for an unsure step");
  }
  // recs are reused as the next step
  { const r = await openIn(Object.assign({}, FIX.file, { recs: ["Text her the quote.", { text: "Ask for the gate code" }, "Text her the quote."] })); const f = frameOf(r.card);
    const next = f.parts.filter((p) => p.tagName)[3]; const lis = leaves(next).filter((n) => n.tagName === "li").map((n) => n.textContent);
    ok(JSON.stringify(lis) === JSON.stringify(["Text her the quote.", "Ask for the gate code"]), "next step reuses recs once each: " + JSON.stringify(lis)); }

  // unknown = today's generic card, unchanged
  { const u = await openIn(FIX.unknown); const g = await openIn(FIX.unknown, { noTypes: true });
    ok(u.html === g.html && !/card-frame|card-more/.test(u.html) && /<h3>Oil change<\/h3>/.test(u.html), "unknown · same HTML with or without the new scripts"); }
  { const r = await openIn({ id: "x1", title: "t", why: "w", draft: "d" }, {}); ok(!/card-frame/.test(r.html), "plain card with a draft only is still generic"); }

  // ---------- 3. strangers type the fields ----------
  const P = ["<img src=x onerror=alert(1)>", "<script>alert(1)</script>", "\"><svg onload=alert(1)>", "'-alert(1)-'", "</h3><b>x</b>", "javascript:alert(1)", "data:text/html,<script>alert(1)</script>"];
  const SAFE_HREF = /^(https?:\/\/|\/(?![\/\\])|mailto:[A-Za-z0-9._%+\-]+@|tel:\+?[0-9]+$)/i;
  function audit(node, label) {
    const allow = { div: 1, p: 1, b: 1, span: 1, a: 1, img: 1, ul: 1, li: 1, h3: 1 };
    walk(node, function (n) {
      if (!allow[n.tagName]) fail(label + " · unexpected element <" + n.tagName + ">");
      Object.keys(n.attrs).forEach(function (k) {
        if (/^on/i.test(k) || k === "style" || k === "srcdoc") fail(label + " · attribute " + k + " on <" + n.tagName + ">");
        if ((k === "href" || k === "src") && !SAFE_HREF.test(n.attrs[k])) fail(label + " · unsafe " + k + " " + n.attrs[k]);
      });
      passes += 1;
    });
  }
  for (const p of P) {
    const stranger = {
      file: { id: "s1", title: p, why: p, from: p, to: p, contactName: p, phone: p, email: p, recs: [p], files: [{ name: p, kind: p, type: p, url: p, bytes: p }, { name: p + ".pdf", url: "https://example.com/" + encodeURIComponent(p) }], photoUrl: p },
      lead: { id: "s2", title: p, why: p, contactName: p, phone: p, email: p, notes: p, outcome: p, kind: "call", recs: [p], ask: p },
      approval: { id: "s3", title: p, why: p, decide: true, draft: p, ask: p, risk: p, payoutTo: p, artifact: p, amount: p, recs: [p] },
      automation: { id: "s4", title: p, why: p, run: { state: p, runNo: p, steps: [{ said: p, action: p, result: "unsure", why: p }, p, null, 7], waiting: { action: p, why: p } }, recs: [p] }
    };
    for (const type of Object.keys(stranger)) {
      const r = await openIn(stranger[type]);
      const frame = frameOf(r.card);
      ok(!!frame, "stranger " + type + " · typed frame still renders");
      if (!frame) continue;
      audit(frame, "stranger " + type);
      const html = serialize(frame, false);
      ["<img src=x", "<script", "<svg", "</h3><b>"].forEach(function (needle) {
        if (html.indexOf(needle) >= 0) fail("stranger " + type + " · raw " + needle + " in the frame for payload " + JSON.stringify(p));
      });
      if (p === P[0] && type !== "automation") ok(html.indexOf("&lt;img src=x onerror=alert(1)&gt;") >= 0, "stranger " + type + " · payload shown literally");
      // the generic card (same job) is untouched by this change, so check only that the whole sheet has no raw tag from the payload
      const whole = r.html;
      ["<img src=x", "<script>alert", "<svg onload"].forEach(function (needle) { if (whole.indexOf(needle) >= 0) fail("stranger " + type + " · raw " + needle + " in the whole sheet for payload " + JSON.stringify(p)); });
    }
  }

  // ---------- 4. fallbacks ----------
  const generic = async (job) => (await openIn(job, { noTypes: true })).html;
  const FALL = [
    ["empty object", { id: "e1" }], ["no id", { title: "No id here", files: [{ name: "a.pdf", url: "/a" }] }], ["files is a string", { id: "e2", title: "t", files: "a.pdf" }],
    ["files is an object", { id: "e3", title: "t", files: { a: 1 } }], ["run is null", { id: "e4", title: "t", run: null }], ["run is a string", { id: "e5", title: "t", run: "yes" }],
    ["files hold junk", { id: "e6", title: "t", files: [null, 5, {}, [], "x"] }], ["custom is a string", { id: "e7", title: "t", custom: "files" }]
  ];
  for (const f of FALL) {
    let r; try { r = await openIn(f[1]); } catch (e) { fail("fallback " + f[0] + " threw " + e.message); continue; }
    const g = await generic(f[1]);
    const type = T.cardType(f[1]);
    if (type === "unknown") ok(r.html === g, "fallback · " + f[0] + " · generic card unchanged");
    else ok(!!frameOf(r.card) && /sheet-decide/.test(r.html), "fallback · " + f[0] + " (" + type + ") · renders a frame and the decide row");
  }
  { const r = await openIn({ id: "e8", title: "t", files: [null, 5, {}, [], "x"] }); ok(/sheet-decide/.test(r.html), "files holding junk still opens with the decide row"); }
  { const huge = "A".repeat(200000);
    for (const type of ["file", "lead", "approval", "automation"]) {
      const job = JSON.parse(JSON.stringify(FIX[type])); job.title = huge; job.why = huge; job.notes = huge; job.draft = huge; job.from = huge; job.to = huge; job.contactName = huge; job.outcome = huge; job.risk = huge;
      if (job.files) job.files[0].name = huge; if (job.run) job.run.steps[0].said = huge;
      const r = await openIn(job); const f = frameOf(r.card);
      ok(!!f && serialize(f, false).length < 12000, "huge strings · " + type + " · frame stays small (" + (f ? serialize(f, false).length : "none") + " chars)"); } }
  // an exception anywhere in the new code: today's generic card
  for (const how of ["frame throws", "frame returns junk", "detector throws", "insert throws"]) {
    const job = FIX.lead;
    const patch = how === "frame throws" ? (c) => { c.CardMiddle.frame = function () { throw new Error("boom"); }; }
      : how === "frame returns junk" ? (c) => { c.CardMiddle.frame = function () { return { nope: 1 }; }; }
      : how === "detector throws" ? (c) => { c.CardType.cardType = function () { throw new Error("boom"); }; }
      : (c) => { const el = c.document.getElementById("sheet-card"); el.insertAdjacentHTML = function () { throw new Error("boom"); }; };
    let r; try { r = await openIn(job, { patch }); } catch (e) { fail("fallback " + how + " · openJob threw " + e.message); continue; }
    const g = await generic(job);
    ok(r.html === g, "fallback · " + how + " · generic card, same HTML as without the new scripts");
  }

  // Collect / HOLD wording in the existing sheet files is still all there
  const WANT = { "desk-needs.js": [1, 5] };
  Object.keys(WANT).forEach(function (rel) {
    const s = read(rel);
    const c = (s.match(/Collect/g) || []).length, h = (s.match(/HOLD/g) || []).length;
    ok(c >= WANT[rel][0] && h >= WANT[rel][1], rel + " · Collect/HOLD wording kept (" + c + "/" + h + ", want at least " + WANT[rel].join("/") + ")");
  });
  ["card-type.js", "card-middle.js"].forEach(function (rel) { ok(!/Collect|HOLD/.test(read(rel)), rel + " · adds no Collect or HOLD claim"); });
  // card-middle.js: no innerHTML, no inline handlers
  { const src = read("card-middle.js"); ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write|eval\(|new Function/.test(src), "card-middle.js · no innerHTML / eval"); ok(!/onclick|onerror|onload|setAttribute\("on/i.test(src), "card-middle.js · no inline handlers"); }

  if (failures) { console.error("check-card-types: " + failures + " failure(s), " + passes + " passed"); process.exit(1); }
  console.log("check-card-types: ok · " + passes + " checks · every type renders in the same frame, strangers' text stays literal, decide row byte-identical, fallbacks keep today's card");
})().catch(function (e) { console.error(e && e.stack || e); process.exit(1); });
