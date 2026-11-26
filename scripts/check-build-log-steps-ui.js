#!/usr/bin/env node
require("./_env-guard");
// check-build-log-steps-ui (BL2): build-log-steps-ui.js shows custom.buildLog.steps as a read-only list.
// Node only, no jsdom: the module runs in a vm against a small fake DOM.
// - rows in the order stored (oldest first), one line each: Label[: VERDICT][ on head8][. Deploy dpl_x][. Done.]
// - the words match BL1's buildStepLine in api/jobs.js for every step / verdict / head / deploy / done combination
// - unknown steps, results, heads and deploy ids are skipped and never echoed; names, times and posted text are never read
// - textContent only; no button, form, link, input, fetch, POST or storage; no empty box; old cards are left alone
// - desk-card.js loads the file itself, only for a card with steps; desk.html stays pinned
// Every rule has a mutant below that must be caught.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const MOD = "build-log-steps-ui.js", DC = "desk-card.js", JOBS = "api/jobs.js", PARENT = "scripts/check-card-timeline.js";
const SRC = {}; SRC[MOD] = read(MOD); SRC[DC] = read(DC); SRC[JOBS] = read(JOBS); SRC[PARENT] = read(PARENT);

const H1 = "1a2b3c4d" + "0".repeat(32), H2 = "ffeeddcc" + "a1".repeat(16);
const DPL = "dpl_Hp8gavfM";
let PWN = null;

function fakeDoc() {
  const byId = {};
  const bad = (what) => { PWN.hit = (PWN.hit || []).concat(what); };
  function mk(tag) {
    const n = {
      tagName: String(tag).toUpperCase(), children: [], attrs: {}, style: {}, className: "", id: "", _t: "", parent: null,
      appendChild(c) { n.children.push(c); c.parent = n; if (c.id) byId[c.id] = c; return c; },
      removeChild(c) { const i = n.children.indexOf(c); if (i >= 0) n.children.splice(i, 1); return c; },
      setAttribute(k, v) { n.attrs[k] = String(v); if (/^on/i.test(k) || /^(href|src|action|formaction)$/i.test(k)) bad("attr " + k); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(n.attrs, k) ? n.attrs[k] : null; },
      addEventListener() { bad("listener"); },
      insertAdjacentHTML() { bad("insertAdjacentHTML"); }
    };
    Object.defineProperty(n, "textContent", { get: () => n._t, set: (v) => { n._t = String(v); n.children = []; } });
    Object.defineProperty(n, "innerHTML", { get: () => "", set: () => bad("innerHTML") });
    Object.defineProperty(n, "outerHTML", { get: () => "", set: () => bad("outerHTML") });
    return n;
  }
  return { byId, createElement: (t) => { const e = mk(t); if (/^(button|form|input|a|textarea|select|iframe|script|img)$/i.test(t)) bad("element " + t); return e; },
    getElementById: (id) => byId[id] || null, write() { bad("document.write"); }, mkBox(id) { const e = mk("div"); e.id = id; byId[id] = e; return e; } };
}
function load(src) {
  PWN = { hit: null };
  const doc = fakeDoc();
  const win = { document: doc };
  const box = { window: win, Array: Array, Object: Object, String: String };
  vm.createContext(box);
  vm.runInContext(src, box);
  return { api: win.AIABuildSteps, doc };
}
function texts(node, out) {
  out = out || [];
  if (node._t) out.push(node._t);
  node.children.forEach((c) => texts(c, out));
  return out;
}
function tags(node, out) {
  out = out || [];
  out.push(node.tagName);
  node.children.forEach((c) => tags(c, out));
  return out;
}
function row(step, extra) {
  return Object.assign({ step, at: "2026-11-26T00:00:00.000Z", head: "", verdict: "", deploy: "", done: false, by: "Sam Jones" }, extra || {});
}
function cardOf(rows) { return { id: "job_1", title: "Build log: #604", custom: { buildLog: { desk: "d", pr: 604, steps: rows } } }; }

// The BL1 words, read from api/jobs.js without running the handler.
function bl1(src) {
  const a = src.indexOf("const BUILD_STEPS = "), b = src.indexOf("function findBuildStepCard");
  if (a < 0 || b < a) return null;
  const box = {};
  vm.createContext(box);
  vm.runInContext(src.slice(a, b) + "\nthis.out = { BUILD_STEPS, BUILD_STEP_VERDICTS, buildStepLine };", box);
  return box.out;
}

function suite(S) {
  try { return suiteRun(S); } catch (e) { return ["crash: " + (e && e.message)]; }
}
function suiteRun(S) {
  const f = [];
  const must = (c, m) => { if (!c) f.push(m); };
  let L;
  try { L = load(S[MOD]); } catch (e) { return ["module does not load: " + e.message]; }
  const api = L.api;
  if (!api || typeof api.lines !== "function" || typeof api.build !== "function" || typeof api.mount !== "function") return ["module does not expose lines / build / mount"];
  const lines = (rows) => api.lines(cardOf(rows));
  const sameArr = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // 1. Order and exact words, with junk rows between that must be skipped.
  const rows = [
    row("draft-opened"),
    row("constructor"), row("<b>Probe</b>"),
    row("new-head", { head: H1 }),
    row("probe", { verdict: "PASS", head: H1 }),
    row("probe", { verdict: "FAIL", head: H2 }),
    row("hasOwnProperty"),
    row("named"),
    row("landed", { done: true }),
    row("deployed", { deploy: DPL }),
    row("ramp", { verdict: "GREEN" }),
    row("ramp", { verdict: "ORANGE" }),
    row("ramp", { verdict: "RED" }),
    row("decision", { verdict: "HOLD" }),
    row("deployed", { verdict: "GREEN", head: H1, deploy: DPL, done: true }),
    row("nonsense", { verdict: "PASS" })
  ];
  const want = ["Draft opened", "New head on 1a2b3c4d", "Probe: PASS on 1a2b3c4d", "Probe: FAIL on ffeeddcc", "Named", "Landed. Done.",
    "Deployed. Deploy dpl_Hp8gavfM", "Ramp: GREEN", "Ramp: ORANGE", "Ramp: RED", "Decision: HOLD", "Deployed: GREEN on 1a2b3c4d. Deploy dpl_Hp8gavfM. Done."];
  must(sameArr(lines(rows), want), "lines in order with exact words: " + JSON.stringify(lines(rows)));
  const box = api.build(cardOf(rows));
  must(box && sameArr(texts(box).slice(1), want), "rendered rows match the lines, in order, one per row: " + JSON.stringify(box && texts(box)));
  if (box) {
    const li = []; (function w(n) { if (n.tagName === "LI") li.push(n); n.children.forEach(w); })(box);
    must(li.length === want.length && li.every((n) => n.children.length === 0), "one plain li per row, text only inside");
    must(sameArr(tags(box).filter((t, i, a) => a.indexOf(t) === i).sort(), ["DIV", "LI", "OL", "P"]), "only div, p, ol and li are drawn: " + tags(box).join(","));
  }
  // Each piece on its own and in the fixed order.
  must(sameArr(lines([row("probe", { head: H1 })]), ["Probe on 1a2b3c4d"]), "head8 is the first 8 characters, no verdict");
  must(sameArr(lines([row("probe", { verdict: "PASS" })]), ["Probe: PASS"]), "verdict joins with a colon");
  must(sameArr(lines([row("deployed", { deploy: DPL, done: true })]), ["Deployed. Deploy dpl_Hp8gavfM. Done."]), "deploy then Done");
  must(sameArr(lines([row("named", { done: true })]), ["Named. Done."]), "Done. closes the line");
  must(sameArr(lines([row("named", { done: false })]), ["Named"]), "done false adds nothing");
  ["true", 1, "yes", {}, [1]].forEach((d) => must(sameArr(lines([row("named", { done: d })]), ["Named"]), "only done:true adds Done. (not " + JSON.stringify(d) + ")"));
  must(sameArr(lines([{ step: "probe", verdict: "PASS", head: H1 }]), ["Probe: PASS on 1a2b3c4d"]), "a row with no other keys is fine");
  must(sameArr(lines([row("probe", { verdict: null, head: undefined, deploy: null })]), ["Probe"]), "null and undefined parts are blank");

  // 2. Same words as BL1 for every combination.
  const B = bl1(S[JOBS]);
  if (!B) f.push("could not read BL1 words from api/jobs.js");
  else {
    must(JSON.stringify(B.BUILD_STEPS) === JSON.stringify(api.LABELS), "step labels equal BL1's BUILD_STEPS");
    must(JSON.stringify(B.BUILD_STEP_VERDICTS) === JSON.stringify(api.VERDICTS), "verdicts equal BL1's BUILD_STEP_VERDICTS");
    let n = 0, drift = 0;
    Object.keys(B.BUILD_STEPS).forEach((step) => ["", "PASS", "FAIL", "GREEN", "ORANGE", "RED", "HOLD"].forEach((v) => ["", H1].forEach((h) => ["", DPL].forEach((d) => [false, true].forEach((dn) => {
      const r = row(step, { verdict: v, head: h, deploy: d, done: dn });
      n++;
      if (B.buildStepLine(r) !== api.lineOf(r)) drift++;
    })))));
    must(n === 8 * 7 * 2 * 2 * 2 && drift === 0, "BL1's line equals this line for all " + n + " combinations (" + drift + " differ)");
  }

  // 3. Skipped, never echoed.
  const trash = [
    row("<img src=x onerror=alert(1)>"), row("PROBE"), row("probe "), row(""), row("__proto__"), row("toString"), row("valueOf"),
    row("probe", { verdict: "OK" }), row("probe", { verdict: "pass" }), row("probe", { verdict: "<script>alert(1)</script>" }), row("probe", { verdict: 5 }), row("probe", { verdict: ["PASS"] }),
    row("probe", { head: H1.slice(0, 39) }), row("probe", { head: H1 + "0" }), row("probe", { head: H1.toUpperCase() }), row("probe", { head: "g".repeat(40) }),
    row("probe", { head: 12345678 }), row("probe", { head: "1a2b3c4d" }), row("probe", { head: "<b>" + H1 + "</b>" }),
    row("deployed", { deploy: "dpl_" }), row("deployed", { deploy: "dpl_abc" }), row("deployed", { deploy: "xpl_Hp8gavfM" }), row("deployed", { deploy: "dpl_<img onerror=x>" }),
    row("deployed", { deploy: "dpl_" + "a".repeat(41) }), row("deployed", { deploy: 7 }),
    null, undefined, 5, "probe", [], { verdict: "PASS" }, { step: 7 }, { step: ["probe"] }, { step: { toString() { return "probe"; } } }
  ];
  must(lines(trash).length === 0, "unknown step / result / head / deploy rows are skipped: " + JSON.stringify(lines(trash)));
  const mixed = lines(trash.slice(0, 12).concat([row("named")], trash.slice(12)));
  must(sameArr(mixed, ["Named"]), "skipped rows leave the good row in place: " + JSON.stringify(mixed));
  const tb = api.build(cardOf(trash.concat([row("named")])));
  must(tb && sameArr(texts(tb).slice(1), ["Named"]), "skipped rows never reach the screen");

  // 4. HTML-like and name payloads never show, never inject.
  PWN.hit = null;
  const evil = row("probe", { verdict: "PASS", head: H1, by: "<script>alert('by')</script>Sam Jones", at: "<img src=x onerror=alert('at')>",
    note: "<b>posted text</b>", text: "raw posted text", name: "Sam Jones", title: "<i>t</i>", why: "<u>why</u>", charged: true, amount: 99 });
  const ec = cardOf([evil, row("named", { by: "Riley Park" })]);
  ec.custom.buildLog.by = "Sam Jones"; ec.title = "<svg onload=alert(1)>"; ec.who = "Sam Jones";
  const eb = api.build(ec);
  const all = eb ? texts(eb).join("|") : "";
  must(eb && sameArr(texts(eb).slice(1), ["Probe: PASS on 1a2b3c4d", "Named"]), "payload keys are not read: " + all);
  must(!/[<>]|script|onerror|onload|posted|Sam|Jones|Riley|Park|99|charged|alert/i.test(all), "no payload, name, time or money text on screen: " + all);
  must(!PWN.hit, "nothing is parsed as HTML (innerHTML / outerHTML / insertAdjacentHTML / write / on* attributes): " + JSON.stringify(PWN.hit));

  // 5. Nothing written, nothing clickable.
  const src = S[MOD];
  const code = src.replace(/^\s*\/\/.*$/gm, "");
  [[/\bfetch\s*\(/, "fetch"], [/XMLHttpRequest/, "XMLHttpRequest"], [/sendBeacon/, "sendBeacon"], [/\bPOST\b/i, "POST"], [/\bmethod\s*:/, "method:"], [/FormData/, "FormData"],
    [/innerHTML|outerHTML|insertAdjacentHTML|document\.write/, "HTML writes"], [/createElement\(\s*["'](button|form|input|a|textarea|select|iframe|script|img)["']/i, "button / form / link / input"],
    [/<button|<form|<a\s|<input/i, "markup"], [/onclick|addEventListener|\.onclick\s*=/i, "click handler"], [/localStorage|sessionStorage|setItem|indexedDB|cookie/, "storage"],
    [/\/api\//, "/api/ path"], [/\bapi\s*\(/, "api()"], [/approveCard|startCard|confirmKill|\bkill\s*\(|\bship\s*\(|carryJob|saveJob/, "Yes / Start / Stop / Kill"],
    [/\bcharge|payout|\bmoney\b|\bamount\b|\bCollect\b/i, "money words"]].forEach((p) => must(!p[0].test(code), "module must not use " + p[1]));
  must(code.indexOf("textContent") >= 0, "module writes with textContent");
  must(!/&[a-zA-Z#0-9]+;/.test(code), "module carries no HTML entities");
  const used = {}; (code.match(/\b(?:card|row)\.([A-Za-z_]+)/g) || []).forEach((m) => { used[m.split(".")[1]] = true; });
  const extra = Object.keys(used).filter((k) => ["custom", "step", "verdict", "head", "deploy", "done"].indexOf(k) < 0);
  must(extra.length === 0, "module reads only custom, step, verdict, head, deploy, done: extra " + extra.join(","));

  // 6. Empty or missing steps draw nothing; old cards are left alone.
  const empties = [null, undefined, 5, "x", [], {}, { custom: null }, { custom: {} }, { custom: { buildLog: null } }, { custom: { buildLog: {} } }, { custom: { buildLog: { steps: [] } } },
    { custom: { buildLog: { steps: {} } } }, { custom: { buildLog: { steps: "probe" } } }, { custom: { buildLog: { steps: { length: 1, 0: row("named") } } } }, { custom: "buildLog" },
    cardOf([row("nonsense"), null, row("probe", { verdict: "BAD" })]),
    { custom: { buildLog: { pr: 557, head: H1, status: "landed", verdict: "PASS" } }, title: "Landed: Draft (#557)" }];
  empties.forEach((c, i) => {
    must(api.build(c) === null, "no box for empty/missing steps #" + i);
    const el = L.doc.mkBox("t" + i);
    const before = JSON.stringify(c === undefined ? null : c);
    api.mount(el, c);
    must(el.children.length === 0, "mount adds nothing for empty/missing steps #" + i);
    must(JSON.stringify(c === undefined ? null : c) === before, "the card is not changed #" + i);
  });
  const old = { id: "j9", title: "Quote for Sam", status: "waiting", why: "x", custom: { outcome: "A quote" }, thread: [{ text: "hi" }] };
  const oldBefore = JSON.stringify(old);
  const oel = L.doc.mkBox("old");
  const keep = L.doc.createElement("div"); keep.className = "card-timeline"; oel.appendChild(keep);
  api.mount(oel, old);
  must(oel.children.length === 1 && oel.children[0] === keep && JSON.stringify(old) === oldBefore, "an old card without buildLog is unchanged and so is its container");
  // mount twice: one list; other children stay; a later card with no steps takes the old list off.
  const mel = L.doc.mkBox("m");
  const tl = L.doc.createElement("div"); tl.className = "card-timeline"; mel.appendChild(tl);
  const c1 = cardOf([row("named"), row("landed", { done: true })]);
  api.mount(mel, c1); api.mount(mel, c1);
  const lists = mel.children.filter((c) => c.getAttribute("data-build-steps") !== null);
  must(lists.length === 1 && mel.children.length === 2 && mel.children[0] === tl && mel.children[1] === lists[0], "mount twice keeps one list after the timeline");
  api.mount(mel, cardOf([row("probe", { verdict: "FAIL", head: H2 })]));
  must(mel.children.length === 2 && sameArr(texts(mel.children[1]).slice(1), ["Probe: FAIL on ffeeddcc"]), "a new open replaces the list");
  api.mount(mel, old);
  must(mel.children.length === 1 && mel.children[0] === tl, "a card with no steps takes the earlier list off");
  must(api.mount("no-such-id", c1) === null, "mount on a missing target does nothing");
  // does not change the card it reads
  const rc = cardOf(rows), rcb = JSON.stringify(rc);
  api.lines(rc); api.build(rc);
  must(JSON.stringify(rc) === rcb, "reading a card never changes it");
  // big card: all rows, in order
  const many = []; for (let i = 0; i < 200; i++) many.push(row(i % 2 ? "named" : "probe", { head: i % 2 ? "" : H1, verdict: i % 2 ? "" : (i % 4 ? "FAIL" : "PASS") }));
  const ml = lines(many);
  must(ml.length === 200 && ml[0] === "Probe: PASS on 1a2b3c4d" && ml[1] === "Named" && ml[2] === "Probe: FAIL on 1a2b3c4d" && ml[199] === "Named", "200 rows all show, in order");

  // 7. Wiring in desk-card.js (desk.html is not touched).
  const dc = S[DC];
  const fn = /function mountBuildSteps\(j\) \{[\s\S]*?\n\}\n/.exec(dc);
  must(!!fn, "desk-card.js defines mountBuildSteps");
  const opens = dc.indexOf("async function openJob(id) {");
  const body = opens >= 0 ? dc.slice(opens) : "";
  must(/\n  mountCardThread\(j\);\n  mountBuildSteps\(j\);\n  document\.getElementById\("sheet"\)\.classList\.add\("on"\);/.test(body), "the card sheet calls mountBuildSteps(j) after the thread");
  must(/s\.src = "build-log-steps-ui\.js"/.test(dc) && /AIABuildSteps\.mount\(box, j\)/.test(dc), "desk-card.js loads build-log-steps-ui.js itself and mounts it");
  must(/getElementById\("card-timeline-sheet"\)/.test(fn ? fn[0] : "") && dc.indexOf('"<div id=\\"card-timeline-sheet\\"></div>" +') >= 0, "the list goes under the timeline on the card sheet");
  if (fn) {
    const mk = (hasScript, loaded) => {
      PWN = { hit: null };
      const doc = fakeDoc(); const win = { document: doc }; const calls = { mounts: [], scripts: [], listeners: 0 };
      const target = doc.mkBox("card-timeline-sheet");
      if (hasScript) { const s0 = doc.createElement("x"); s0.id = "build-steps-js"; s0.addEventListener = () => { calls.listeners++; }; doc.byId["build-steps-js"] = s0; }
      const origCreate = doc.createElement;
      doc.createElement = (t) => { const e = origCreate(t); e.addEventListener = (ev, cb) => { calls.listeners++; e.cb = cb; }; if (t === "script") calls.scripts.push(e); return e; };
      doc.head = doc.mkBox("head");
      if (loaded) win.AIABuildSteps = { mount: (el, c) => { calls.mounts.push([el, c]); } };
      const box = { window: win, document: doc, Array: Array };
      vm.createContext(box);
      vm.runInContext(fn[0] + "\nthis.mountBuildSteps = mountBuildSteps;", box);
      return { call: box.mountBuildSteps, calls, win, target, doc };
    };
    const withSteps = cardOf([row("named")]);
    [null, undefined, {}, { custom: {} }, { custom: { buildLog: {} } }, { custom: { buildLog: { steps: [] } } }, { custom: { buildLog: { steps: "x" } } }, { custom: { buildLog: { pr: 5, head: H1 } } }, { custom: { outcome: "A quote" } }].forEach((c, i) => {
      const t = mk(false, false); t.call(c);
      must(t.calls.scripts.length === 0 && t.calls.mounts.length === 0, "a card with no steps loads nothing and mounts nothing (#" + i + ")");
      const t2 = mk(false, true); t2.call(c);
      must(t2.calls.mounts.length === 0, "a card with no steps does not mount even when loaded (#" + i + ")");
    });
    const a = mk(false, false); a.call(withSteps);
    must(a.calls.scripts.length === 1 && a.calls.scripts[0].src === "build-log-steps-ui.js" && a.calls.scripts[0].id === "build-steps-js" && a.doc.byId.head.children.length === 1, "first card with steps loads build-log-steps-ui.js once");
    a.win.AIABuildSteps = { mount: (el, c) => { a.calls.mounts.push([el, c]); } };
    if (a.calls.scripts[0] && a.calls.scripts[0].cb) a.calls.scripts[0].cb();
    must(a.calls.mounts.length === 1 && a.calls.mounts[0][0] === a.target && a.calls.mounts[0][1] === withSteps, "after load it mounts into the timeline box with the card");
    const b = mk(false, true); b.call(withSteps);
    must(b.calls.scripts.length === 0 && b.calls.mounts.length === 1, "already loaded: mounts at once, no second script");
    const c2 = mk(true, false); c2.call(withSteps);
    must(c2.calls.scripts.length === 0 && c2.calls.listeners === 1, "script already on the page: no second script, waits for load");
    const nb = mk(false, true); nb.target.id = "x"; delete nb.doc.byId["card-timeline-sheet"]; nb.call(withSteps);
    must(nb.calls.mounts.length === 0 && nb.calls.scripts.length === 0, "no timeline box on the page: nothing happens");
  }
  const deskHtml = fs.readFileSync(path.join(root, "desk.html"));
  must(deskHtml.length === 35485 && crypto.createHash("sha256").update(deskHtml).digest("hex") === "d84ad086270c2abf2e20e101488976b1db7abf82db0bef5d14747c83a749f8db", "desk.html is the pinned 35485 bytes (d84ad086...)");
  must(deskHtml.toString("utf8").indexOf(MOD) < 0, "desk.html does not load the new file (desk-card.js does)");
  const par = S[PARENT];
  must(par.indexOf('spawnSync(process.execPath, [path.join(__dirname, "check-build-log-steps-ui.js")], { stdio: "inherit", env: process.env })') >= 0 && /if \(stepsUi\.status !== 0\) fail\(/.test(par) && par.indexOf("if (failed) { console.error(failed") > par.indexOf("stepsUi.status"), "check-card-timeline.js runs this check as a child and fails when it fails");
  return f;
}

function rep(file, find, repl) {
  return (S) => {
    const s = S[file];
    if (s.indexOf(find) < 0 || s.indexOf(find) !== s.lastIndexOf(find)) return null;
    const o = Object.assign({}, S); o[file] = s.replace(find, repl); return o;
  };
}
const M = MOD;
const MUTANTS = [
  ["reorder: rows come out newest first", rep(M, "    return out;\n  }\n  // The list, or null", "    return out.reverse();\n  }\n  // The list, or null")],
  ["reorder: lines sorted by text", rep(M, "    return out;\n  }\n  // The list, or null", "    return out.sort();\n  }\n  // The list, or null")],
  ["drop a row (the second good one)", rep(M, "if (t) out.push(t);", "if (t && out.length !== 1) out.push(t);")],
  ["drop the last row", rep(M, "for (var i = 0; i < rows.length; i++) {", "for (var i = 0; i < rows.length - 1; i++) {")],
  ["echo an unknown step name", (S) => { const o = rep(M, 'typeof row.step !== "string" || !own(LABELS, row.step)) return "";', 'typeof row.step !== "string") return "";')(S); return o && rep(M, 'var line = LABELS[row.step];', 'var line = own(LABELS, row.step) ? LABELS[row.step] : row.step;')(o); }],
  ["prototype step names allowed (no own check)", rep(M, '|| !own(LABELS, row.step)) return "";', '|| !LABELS[row.step]) return "";')],
  ["innerHTML for the row text", rep(M, "li.textContent = text;", "li.innerHTML = text;")],
  ["add a button in each row", rep(M, "li.textContent = text;", 'li.textContent = text; li.appendChild(doc.createElement("button"));')],
  ["add a form around the list", rep(M, "box.appendChild(list);", 'box.appendChild(list); box.appendChild(doc.createElement("form"));')],
  ["add a link", rep(M, "box.appendChild(list);", 'box.appendChild(list); box.appendChild(doc.createElement("a"));')],
  ["click handler on a row", rep(M, "li.textContent = text;", 'li.textContent = text; li.setAttribute("onclick", "x()");')],
  ["post to the server", rep(M, 'var MARK = "data-build-steps";', 'var MARK = "data-build-steps"; if (root.fetch) root.fetch("x", { method: "POST" });')],
  ["head8 becomes head7", rep(M, "row.head.slice(0, 8)", "row.head.slice(0, 7)")],
  ["head shown in full", rep(M, "row.head.slice(0, 8)", "row.head")],
  ["short head accepted", rep(M, "/^[0-9a-f]{40}$/", "/^[0-9a-f]{8,40}$/")],
  ["head not checked at all", rep(M, "typeof row.head !== \"string\" || !HEAD.test(row.head)", "false")],
  ["uppercase head accepted", rep(M, "/^[0-9a-f]{40}$/", "/^[0-9a-fA-F]{40}$/")],
  ["Done. missing", rep(M, '    if (row.done === true) line += ". Done.";\n', "")],
  ["Done. for any truthy done", rep(M, "if (row.done === true)", "if (row.done)")],
  ["Done. without the period", rep(M, 'line += ". Done."', 'line += ". Done"')],
  ["Deploy missing", rep(M, '      line += ". Deploy " + row.deploy;\n', "")],
  ["Deploy separator changed", rep(M, '". Deploy "', '" Deploy "')],
  ["deploy id not checked", rep(M, "/^dpl_[A-Za-z0-9]{6,40}$/", "/^.*$/")],
  ["deploy id too short allowed", rep(M, "{6,40}", "{1,40}")],
  ["unknown verdict shown", rep(M, 'if (typeof row.verdict !== "string" || VERDICTS.indexOf(row.verdict) < 0) return "";', "")],
  ["verdict separator changed", rep(M, 'line += ": " + row.verdict', 'line += " - " + row.verdict')],
  ["HOLD no longer a verdict", rep(M, '"RED", "HOLD"]', '"RED"]')],
  ["verdict lower-cased", rep(M, 'line += ": " + row.verdict', 'line += ": " + row.verdict.toLowerCase()')],
  ["step label changed", rep(M, '"draft-opened": "Draft opened"', '"draft-opened": "Draft Opened"')],
  ["step label added", rep(M, '"decision": "Decision" }', '"decision": "Decision", "extra": "Extra" }')],
  ["step label dropped", rep(M, ' "named": "Named",', "")],
  ["empty box drawn for no rows", rep(M, "    if (!rows.length) return null;\n", "")],
  ["heading drawn on empty mount", rep(M, "    var box = build(card, opts);\n    if (box) el.appendChild(box);", "    var box = build(card, opts) || doc.createElement(\"div\");\n    el.appendChild(box);")],
  ["name shown on the line", rep(M, 'if (row.done === true) line += ". Done.";', 'if (row.done === true) line += ". Done."; if (row.by) line += " by " + row.by;')],
  ["time shown on the line", rep(M, 'if (row.done === true) line += ". Done.";', 'if (row.done === true) line += ". Done."; if (row.at) line += " " + row.at;')],
  ["posted note shown", rep(M, 'if (row.done === true) line += ". Done.";', 'if (row.done === true) line += ". Done."; if (row.note) line += " " + row.note;')],
  ["list drawn twice on a second mount", rep(M, "el.removeChild(k)", "0")],
  ["mount wipes the whole target", rep(M, "    var kids = el.children ?", "    el.textContent = \"\"; var kids = el.children ?")],
  ["mount edits the card", rep(M, "    return out;\n  }\n  // The list, or null", "    if (log) log.seen = true;\n    return out;\n  }\n  // The list, or null")],
  ["money word on the face", rep(M, 'head.textContent = "Build steps";', 'head.textContent = "Build steps. Nothing is charged.";')],
  ["steps read from the wrong key", rep(M, "card.custom.buildLog : null", "card.custom.buildlog : null")],
  ["non-array steps iterated", rep(M, "Array.isArray(log.steps) ? log.steps : []", "log.steps || []")],
  ["desk-card: never mounts the steps", rep(DC, "  mountBuildSteps(j);\n", "")],
  ["desk-card: loads the file for every card", rep(DC, "  if (!log || !Array.isArray(log.steps) || !log.steps.length) return;\n", "")],
  ["desk-card: wrong script name", rep(DC, 's.src = "build-log-steps-ui.js"', 's.src = "build-steps.js"')],
  ["desk-card: mounts into the wrong box", rep(DC, 'const box = document.getElementById("card-timeline-sheet");\n  if (!box) return;\n  const go', 'const box = document.getElementById("card-thread-sheet");\n  if (!box) return;\n  const go')],
  ["desk-card: second script every time", rep(DC, 'let s = document.getElementById("build-steps-js");\n  if (!s) {', "let s = null;\n  if (!s) {")],
  ["desk-card: mounted before the thread", rep(DC, "  mountCardThread(j);\n  mountBuildSteps(j);\n", "  mountBuildSteps(j);\n  mountCardThread(j);\n")],
  ["BL1 word drifts (Probe -> Probed)", rep(JOBS, '"probe": "Probe"', '"probe": "Probed"')],
  ["BL1 line drifts (on -> at)", rep(JOBS, 'line += " on " + row.head.slice(0, 8);', 'line += " at " + row.head.slice(0, 8);')],
  ["BL1 verdict list drifts", rep(JOBS, 'const BUILD_STEP_VERDICTS = ["PASS", "FAIL", "GREEN", "ORANGE", "RED", "HOLD"];', 'const BUILD_STEP_VERDICTS = ["PASS", "FAIL", "GREEN", "ORANGE", "RED"];')],
  ["parent check stops running this check", rep(PARENT, "check-build-log-steps-ui.js", "check-build-log-steps-uix.js")]
];

const base = suite(SRC);
let bad = base.length;
base.forEach((m) => console.log("FAIL " + m));
if (!bad) console.log("ok build-log-steps-ui: order, words (match BL1), skips, textContent only, read-only, empty, old cards, wiring");
let caught = 0;
MUTANTS.forEach(([name, make]) => {
  const S = make(SRC);
  if (!S) { console.log("FAIL mutant does not apply: " + name); bad++; return; }
  const r = suite(S);
  if (r.some((m) => /^module does not load/.test(m))) { console.log("FAIL mutant breaks the syntax (not a real test): " + name); bad++; return; }
  if (r.length) { caught++; console.log("ok mutant caught: " + name + " (" + r[0].slice(0, 110) + ")"); }
  else { console.log("FAIL mutant NOT caught: " + name); bad++; }
});
console.log("check-build-log-steps-ui mutants: " + caught + "/" + MUTANTS.length + " caught");
if (bad) { console.log("check-build-log-steps-ui failed"); process.exit(1); }
console.log("check-build-log-steps-ui: ok");
