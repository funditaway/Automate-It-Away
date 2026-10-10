// Stranger text stays plain text on Queue (desk-queue.js) and Sell (consign.html):
// card fields typed by outsiders (why, title, sender, subject, notes) never become markup.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
let bad = 0;
function fail(msg) { bad += 1; console.error("FAIL " + msg); }
function pass(msg) { console.log("ok " + msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const SCRIPT = "<script>alert(1)</script>";
const IMG = "<img src=x onerror=alert(1)>";
const QUOTE = "x\" onmouseover=\"alert(1)";
const JSQ = "');alert(1);('";

// A small HTML reader (no dependencies): elements with their attributes, and the decoded text.
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (m, e) {
    e = e.toLowerCase();
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" }[e];
  });
}
function readHtml(html) {
  const els = [];
  let text = "", i = 0;
  while (i < html.length) {
    const c = html[i];
    if (c === "<" && html.startsWith("<!--", i)) { const e = html.indexOf("-->", i); i = e < 0 ? html.length : e + 3; continue; }
    if (c === "<" && html[i + 1] === "/") { const e = html.indexOf(">", i); i = e < 0 ? html.length : e + 1; continue; }
    if (c === "<" && /[a-zA-Z]/.test(html[i + 1] || "")) {
      let j = i + 1, tag = "";
      while (j < html.length && /[a-zA-Z0-9-]/.test(html[j])) tag += html[j++];
      const attrs = {};
      while (j < html.length && html[j] !== ">") {
        if (/[\s/]/.test(html[j])) { j++; continue; }
        let name = "";
        while (j < html.length && !/[\s=>/]/.test(html[j])) name += html[j++];
        let value = "";
        if (html[j] === "=") {
          j++;
          const q = html[j];
          if (q === "\"" || q === "'") { const e = html.indexOf(q, j + 1); value = html.slice(j + 1, e < 0 ? html.length : e); j = e < 0 ? html.length : e + 1; }
          else { while (j < html.length && !/[\s>]/.test(html[j])) value += html[j++]; }
        }
        if (name) attrs[name.toLowerCase()] = decode(value);
      }
      els.push({ tag: tag.toLowerCase(), attrs: attrs });
      i = j + 1;
      continue;
    }
    text += c; i++;
  }
  return { els: els, text: decode(text) };
}
const ONCLICK = /^[A-Za-z]+\('[^'\\]*'(, -?[0-9.]+)?(, '[^'\\]*')?\)$/;
function safeMarkup(where, html, mustShow) {
  const r = readHtml(html);
  const tags = r.els.map(function (e) { return e.tag; });
  const evil = tags.filter(function (t) { return t === "script" || t === "img"; });
  if (evil.length) return fail(where + ": stranger text became <" + evil.join(">, <") + "> elements");
  for (const e of r.els) {
    for (const name of Object.keys(e.attrs)) {
      if (/^on/.test(name) && name !== "onclick") return fail(where + ": stranger text added an " + name + " attribute");
      if (name === "onclick" && !/^document\.getElementById/.test(e.attrs[name]) && !ONCLICK.test(e.attrs[name])) return fail(where + ": onclick broken by stranger text: " + e.attrs[name]);
    }
  }
  const missing = mustShow.filter(function (t) { return r.text.indexOf(t) < 0; });
  if (missing.length) return fail(where + ": text must show literally: " + missing.join(" | ") + " (got: " + r.text.slice(0, 200) + ")");
  pass(where + ": no script/img elements or new handlers; stranger text shows as plain text");
}

// 1. desk-queue.js in a small DOM stub.
function queueSandbox(withEsc) {
  const boxes = {};
  function box(id) {
    if (!boxes[id]) boxes[id] = { id: id, html: "", set innerHTML(v) { this.html = String(v); }, get innerHTML() { return this.html; }, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, classList: { add: function () {}, remove: function () {}, toggle: function () {} } };
    return boxes[id];
  }
  const sb = {
    console: console,
    setTimeout: function () {},
    localStorage: { getItem: function () { return "desk"; } },
    document: { getElementById: box, createElement: function () { return {}; } },
    encodeURIComponent: encodeURIComponent,
    PEOPLE: [{ name: IMG, role: "helper" }, { name: QUOTE, role: "owner" }, { name: JSQ, role: "helper" }],
    JOBS: [{ id: "j1", status: "waiting", title: SCRIPT + " " + QUOTE + " " + JSQ, why: "Sender " + IMG + ". Subject " + SCRIPT + ".", from: IMG, sender: IMG, subject: SCRIPT, draft: IMG, assignee: QUOTE, next: SCRIPT, amount: 0 }],
    api: async function () { return { data: { inbound: SCRIPT, catalog: [{ id: "p1", label: IMG, status: "live", live: true }, { id: "p2", label: SCRIPT, status: "hold", note: IMG }], connections: [] } }; }
  };
  if (withEsc) sb.esc = function (s) { return String(s || "").replace(/[&<>"']/g, function (c) { return { "&": "&" + "amp;", "<": "&" + "lt;", ">": "&" + "gt;", "\"": "&" + "quot;", "'": "&" + "#39;" }[c]; }); };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(read("desk-queue.js"), sb);
  return { sb: sb, box: box };
}
async function checkQueue() {
  for (const withEsc of [false, true]) {
    const label = withEsc ? "desk-queue.js with the page's esc" : "desk-queue.js when esc is not a function";
    const q = queueSandbox(withEsc);
    if (typeof q.sb.queueCard !== "function") { fail("desk-queue.js must define queueCard"); return; }
    if (!withEsc && typeof q.sb.esc === "function") fail("setup: esc should be missing");
    // The why line on its own (the fallback path Switch traced).
    const card = q.sb.queueCard(q.sb.JOBS[0], false);
    safeMarkup(label + ": queue card (title, why with sender/subject, draft, handed to)", card, [SCRIPT, IMG, "Sender " + IMG + ". Subject " + SCRIPT + "."]);
    // The full paint (innerHTML) the queue does.
    q.sb.paintQueueCard();
    safeMarkup(label + ": painted queue", q.box("queue").html, [SCRIPT, IMG]);
    await q.sb.openHandOff("j1");
    safeMarkup(label + ": hand-off sheet (people names)", q.box("sheet-card").html, [IMG, QUOTE]);
    await q.sb.openPipesSheet("j1");
    safeMarkup(label + ": pipes sheet (labels, notes, inbound)", q.box("sheet-card").html, [IMG, SCRIPT]);
  }
  // Normal text stays the same.
  const n = queueSandbox(false);
  const plain = readHtml(n.sb.queueCard({ id: "j2", status: "waiting", title: "Lamp for Ms. Lee", why: "Needs a human.", amount: 0 }, false)).text;
  if (plain.indexOf("Lamp for Ms. Lee") < 0 || plain.indexOf("Needs a human.") < 0) fail("normal text must show unchanged: " + plain);
  else pass("normal card text shows unchanged");
}

// 2. consign.html's script in a small DOM stub.
function checkConsign() {
  const html = read("consign.html");
  const m = html.match(/<script>\s*(const Q=\[\];[\s\S]*?)<\/script>/);
  if (!m) return fail("could not find the consign.html queue script");
  function el(tag) {
    return { tag: tag, children: [], text: "", className: "", html: null, listeners: 0,
      set textContent(v) { this.text = String(v); this.children = []; this.html = null; }, get textContent() { return this.text + this.children.map(function (c) { return c.textContent; }).join(""); },
      set innerHTML(v) { this.html = String(v); this.children = []; }, get innerHTML() { return this.html || ""; },
      appendChild: function (c) { this.children.push(c); return c; }, addEventListener: function () { this.listeners += 1; } };
  }
  const queue = el("div");
  const fields = { title: { value: SCRIPT + " " + QUOTE }, price: { value: "85" }, notes: { value: IMG + " " + SCRIPT } };
  const sb = { console: console, document: { getElementById: function (id) { return id === "queue" ? queue : fields[id] || null; }, createElement: el } };
  sb.window = sb;
  vm.createContext(sb);
  try { vm.runInContext(m[1], sb); sb.capture(); } catch (e) { return fail("consign.html script threw: " + e.message); }
  if (queue.html != null) return safeMarkup("consign.html (innerHTML)", queue.html, [SCRIPT, IMG]);
  const all = [];
  (function walk(n) { all.push(n); n.children.forEach(walk); })(queue);
  const tags = all.slice(1).map(function (n) { return n.tag; });
  if (tags.indexOf("script") >= 0 || tags.indexOf("img") >= 0 || all.some(function (n) { return n.html != null; })) return fail("consign.html: stranger text became elements or markup");
  const t = queue.textContent;
  if (t.indexOf(SCRIPT + " " + QUOTE + " · $85") < 0 || t.indexOf(IMG + " " + SCRIPT) < 0) return fail("consign.html: text must show literally: " + t);
  if (JSON.stringify(tags) !== JSON.stringify(["div", "b", "p", "button", "button"])) return fail("consign.html: same structure as before (div.item > b, p, Yes, Kill): " + tags.join(","));
  pass("consign.html: item title and notes go in as plain text, same div/b/p/Yes/Kill structure");
}

checkConsign();
checkQueue().then(function () {
  if (bad) { console.error(bad + " check(s) failed"); process.exit(1); }
  console.log("check-stranger-text ok");
}, function (e) { console.error("FAIL " + e.message); process.exit(1); });
