require("./_env-guard");
const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) {
  console.log("ok  " + msg);
}

const root = path.join(__dirname, "..");
const files = fs.readdirSync(root).filter((f) => f.endsWith(".html"));

files.forEach((file) => {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  const m = html.match(/<header\b[\s\S]*?<\/header>/i);
  if (!m) {
    fail(file + " has no header");
    return;
  }
  const hdr = m[0];
  if (!hdr.includes('class="brand"')) fail(file + " header missing class=brand");
  if (!hdr.includes('class="brand-name">Automate It Away</span>')) {
    fail(file + " header wordmark is not Automate It Away");
  } else {
    pass(file + " wordmark");
  }
  if (/AUTOMATE\s/.test(hdr) || /automateitaway\.com/.test(hdr)) {
    fail(file + " still uses old header text");
  }
  if (hdr.includes("brand-mark") === false) fail(file + " missing brand-mark");
});

const theme = fs.readFileSync(path.join(root, "theme.css"), "utf8");
if (!theme.includes("font: 700 16px/1.15")) fail("theme.css missing 16px wordmark lock");
else pass("theme.css locks 16px wordmark");

const js = fs.readFileSync(path.join(root, "theme.js"), "utf8");
if (!js.includes("aia-header-lock")) fail("theme.js missing header lock");
else pass("theme.js injects header lock");
if (!js.includes("paintWho") || !js.includes("who-chip")) fail("theme.js missing signed-in profile chip");
else pass("theme.js paints signed-in profile");
if (js.indexOf('if (r === "agent") return "Agent"') >= 0) fail("theme.js roleLabel still says Agent");
else pass("theme.js roleLabel does not say Agent");
if (js.indexOf('if (r === "agent") return "Desk AI"') < 0) fail("theme.js roleLabel must say Desk AI");
else pass("theme.js roleLabel maps agent to Desk AI");
if (!js.includes("Desk name + code")) fail("signed-out chip must not say email login");
else pass("signed-out copy is desk name + code");
const css = fs.readFileSync(path.join(root, "theme.css"), "utf8");
if (!css.includes(".who-chip")) fail("theme.css missing .who-chip");
else pass("theme.css styles the profile chip");

// Rendered header: parse every page, run the real theme.js, and count what people see.
// One header, one brand (mark, name, AIA), one theme button, one account chip, one tools row,
// one header-lock style, one ui-fix link, no repeated ids. Signed out: one "Sign in to your Queue"
// and no "Open my Queue". Signed in: one "Open my Queue" and no sign-in link. Desktop and phone
// paths, and theme.js loaded twice, must give the same single set.
// The page DOM is a small one built here on node built-ins (vm + an HTML parser below), so the
// check needs no package. theme.js itself runs unchanged inside a vm context.
const vm = require("vm");
const themeSrc = fs.readFileSync(path.join(root, "theme.js"), "utf8");
function homeHref(h) {
  return h === "/" || h === "index.html" || h === "/index.html";
}

// ---- mini DOM start ----
const VOID_TAGS = new Set("area base br col embed hr img input keygen link meta param source track wbr".split(" "));
const RAW_TAGS = new Set("script style textarea title xmp noembed noframes noscript iframe".split(" "));
const CLOSES_P = new Set("address article aside blockquote center details dialog dir div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr li dd dt main menu nav ol p pre section summary table ul".split(" "));
const HEAD_TAGS = new Set("base basefont bgsound link meta noframes script style template title noscript".split(" "));
const SPECIAL = new Set("address applet area article aside base basefont bgsound blockquote body br button caption center col colgroup dd details dir div dl dt embed fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html iframe img input keygen li link listing main marquee menu meta nav noembed noframes noscript object ol p param plaintext pre script section select source style summary table tbody td template textarea tfoot th thead title tr track ul wbr xmp".split(" "));
const SCOPE_STOP = new Set("applet caption html table td th marquee object template button".split(" "));
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", middot: "\u00b7", copy: "\u00a9", reg: "\u00ae", rarr: "\u2192", larr: "\u2190", uarr: "\u2191", darr: "\u2193", mdash: "\u2014", ndash: "\u2013", hellip: "\u2026", times: "\u00d7", bull: "\u2022", rsquo: "\u2019", lsquo: "\u2018", ldquo: "\u201c", rdquo: "\u201d", check: "\u2713" };
function decodeEntities(s) {
  if (s.indexOf("&") < 0) return s;
  return s.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, function (m, e) {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "\ufffd";
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, e) ? ENTITIES[e] : m;
  });
}
function escText(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\u00a0/g, "&nbsp;"); }
function escAttr(s) { return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/\u00a0/g, "&nbsp;"); }

// Selectors: tag, *, #id, .class, [attr], [attr=v] (also ~= ^= $= *= |=), :not(), :first-child,
// :last-child, :only-child; combinators " ", ">", "+", "~"; comma lists. Anything else throws, so a
// selector this DOM cannot answer turns into a FAIL instead of a quiet zero.
const selCache = new Map();
function parseSelector(src) {
  if (selCache.has(src)) return selCache.get(src);
  const s = String(src);
  let i = 0;
  const bad = function () { throw new Error("selector not supported by check-header DOM: " + s); };
  const ws = function () { let had = false; while (i < s.length && /\s/.test(s[i])) { i++; had = true; } return had; };
  const ident = function () { const m = /^-?[_a-zA-Z0-9\u00a0-\uffff-]+/.exec(s.slice(i)); if (!m) bad(); i += m[0].length; return m[0]; };
  const compound = function () {
    const c = { tag: null, id: null, cls: [], attrs: [], pseudo: [] };
    let any = false;
    if (s[i] === "*") { i++; any = true; } else if (/[a-zA-Z]/.test(s[i] || "")) { c.tag = ident().toLowerCase(); any = true; }
    for (;;) {
      const ch = s[i];
      if (ch === "#") { i++; c.id = ident(); any = true; }
      else if (ch === ".") { i++; c.cls.push(ident()); any = true; }
      else if (ch === "[") {
        i++; ws();
        const name = ident().toLowerCase(); ws();
        let op = null, val = null;
        if (s[i] !== "]") {
          const m = /^([~^$*|]?=)/.exec(s.slice(i));
          if (!m) bad();
          op = m[1]; i += op.length; ws();
          if (s[i] === '"' || s[i] === "'") { const j = s.indexOf(s[i], i + 1); if (j < 0) bad(); val = s.slice(i + 1, j); i = j + 1; }
          else { const m2 = /^[^\]\s]+/.exec(s.slice(i)); if (!m2) bad(); val = m2[0]; i += val.length; }
          ws();
        }
        if (s[i] !== "]") bad();
        i++;
        c.attrs.push({ name: name, op: op, val: val });
        any = true;
      } else if (ch === ":") {
        i++;
        const name = ident().toLowerCase();
        let arg = null;
        if (s[i] === "(") {
          let depth = 1, j = i + 1;
          while (j < s.length && depth) { if (s[j] === "(") depth++; else if (s[j] === ")") depth--; j++; }
          if (depth) bad();
          arg = parseSelector(s.slice(i + 1, j - 1));
          i = j;
        }
        if (name === "not" ? !arg : (arg || ["first-child", "last-child", "only-child"].indexOf(name) < 0)) bad();
        c.pseudo.push({ name: name, arg: arg });
        any = true;
      } else break;
    }
    if (!any) bad();
    return c;
  };
  const list = [];
  let cur = [], comb = null;
  ws();
  for (;;) {
    cur.push({ comb: comb, c: compound() });
    const had = ws();
    if (i >= s.length) { list.push(cur); break; }
    if (s[i] === ",") { i++; ws(); list.push(cur); cur = []; comb = null; continue; }
    if (s[i] === ">" || s[i] === "+" || s[i] === "~") { comb = s[i]; i++; ws(); continue; }
    if (had) { comb = " "; continue; }
    bad();
  }
  selCache.set(src, list);
  return list;
}
// Every unsupported selector is written to the page's error list before it throws, so a
// try/catch in page code cannot turn it into a quiet zero: the render FAILs either way.
function selectorFor(node, sel) {
  try { return parseSelector(sel); }
  catch (e) {
    const d = node && node._doc ? node._doc() : null;
    if (d && d._errors) d._errors.push("unsupported selector (recorded even when page code catches it): " + (e && e.message));
    throw e;
  }
}
function classesOf(el) { return (el.getAttribute("class") || "").split(/\s+/).filter(Boolean); }
function prevEl(el) {
  const p = el.parentNode;
  if (!p) return null;
  const k = p.childNodes.indexOf(el);
  for (let j = k - 1; j >= 0; j--) if (p.childNodes[j].nodeType === 1) return p.childNodes[j];
  return null;
}
function matchCompound(el, c) {
  if (c.tag && el.localName !== c.tag) return false;
  if (c.id !== null && el.getAttribute("id") !== c.id) return false;
  if (c.cls.length) { const cl = classesOf(el); for (const k of c.cls) if (cl.indexOf(k) < 0) return false; }
  for (const a of c.attrs) {
    const v = el.getAttribute(a.name);
    if (v === null) return false;
    if (!a.op) continue;
    if (a.op === "=" && v !== a.val) return false;
    if (a.op === "~=" && v.split(/\s+/).indexOf(a.val) < 0) return false;
    if (a.op === "^=" && !(a.val && v.startsWith(a.val))) return false;
    if (a.op === "$=" && !(a.val && v.endsWith(a.val))) return false;
    if (a.op === "*=" && !(a.val && v.indexOf(a.val) >= 0)) return false;
    if (a.op === "|=" && !(v === a.val || v.startsWith(a.val + "-"))) return false;
  }
  for (const p of c.pseudo) {
    if (p.name === "not") { if (matchList(el, p.arg)) return false; continue; }
    const sibs = el.parentNode ? el.parentNode.childNodes.filter(function (n) { return n.nodeType === 1; }) : [el];
    if (p.name === "first-child" && sibs[0] !== el) return false;
    if (p.name === "last-child" && sibs[sibs.length - 1] !== el) return false;
    if (p.name === "only-child" && sibs.length !== 1) return false;
  }
  return true;
}
function matchComplex(el, parts, k) {
  if (!matchCompound(el, parts[k].c)) return false;
  if (k === 0) return true;
  const comb = parts[k].comb;
  if (comb === ">") { const p = el.parentElement; return !!p && matchComplex(p, parts, k - 1); }
  if (comb === " ") { for (let p = el.parentElement; p; p = p.parentElement) if (matchComplex(p, parts, k - 1)) return true; return false; }
  if (comb === "+") { const p = prevEl(el); return !!p && matchComplex(p, parts, k - 1); }
  for (let p = prevEl(el); p; p = prevEl(p)) if (matchComplex(p, parts, k - 1)) return true;
  return false;
}
function matchList(el, list) { return list.some(function (parts) { return matchComplex(el, parts, parts.length - 1); }); }
function descendants(node, out) {
  for (const c of node.childNodes) if (c.nodeType === 1) { out.push(c); descendants(c, out); }
  return out;
}

class DNode {
  constructor(doc) { this.ownerDocument = doc; this.parentNode = null; this.childNodes = []; this._ls = {}; }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get nextSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) + 1] || null : null; }
  get previousSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) - 1] || null : null; }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get children() { return this.childNodes.filter(function (n) { return n.nodeType === 1; }); }
  get firstElementChild() { return this.children[0] || null; }
  get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
  get nextElementSibling() { let n = this.nextSibling; while (n && n.nodeType !== 1) n = n.nextSibling; return n; }
  get previousElementSibling() { return prevEl(this); }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n.nodeType === 9; }
  _doc() { return this.nodeType === 9 ? this : this.ownerDocument; }
  appendChild(n) { return this.insertBefore(n, null); }
  append() { for (const n of arguments) this.appendChild(typeof n === "string" ? this._doc().createTextNode(n) : n); }
  prepend() { const f = this.firstChild; for (const n of arguments) this.insertBefore(typeof n === "string" ? this._doc().createTextNode(n) : n, f); }
  insertBefore(n, ref) {
    if (!n || !(n instanceof DNode)) throw new TypeError("insertBefore: not a node");
    if (n.nodeType === 11) { for (const c of n.childNodes.slice()) this.insertBefore(c, ref); return n; }
    if (n.contains(this)) throw new Error("HierarchyRequestError");
    if (ref === undefined) ref = null;
    if (ref !== null && ref.parentNode !== this) throw new Error("NotFoundError: insertBefore reference is not a child");
    if (n.parentNode) n.parentNode._unlink(n);
    const at = ref === null ? this.childNodes.length : this.childNodes.indexOf(ref);
    this.childNodes.splice(at, 0, n);
    n.parentNode = this;
    this._doc()._mutated(this);
    return n;
  }
  _unlink(n) { const k = this.childNodes.indexOf(n); if (k >= 0) this.childNodes.splice(k, 1); n.parentNode = null; this._doc()._mutated(this); }
  removeChild(n) { if (!n || n.parentNode !== this) throw new Error("NotFoundError: removeChild"); this._unlink(n); return n; }
  replaceChild(n, old) { this.insertBefore(n, old); return this.removeChild(old); }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; }
  hasChildNodes() { return this.childNodes.length > 0; }
  get textContent() {
    if (this.nodeType === 3 || this.nodeType === 8) return this.data;
    let t = "";
    const walk = function (n) { for (const c of n.childNodes) { if (c.nodeType === 3) t += c.data; else if (c.nodeType === 1 || c.nodeType === 11) walk(c); } };
    walk(this);
    return t;
  }
  set textContent(v) {
    if (this.nodeType === 3 || this.nodeType === 8) { this.data = String(v); this._doc()._mutated(this); return; }
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    v = v === null || v === undefined ? "" : String(v);
    if (v !== "") this.appendChild(this._doc().createTextNode(v));
    else this._doc()._mutated(this);
  }
  querySelectorAll(sel) {
    const list = selectorFor(this, sel);
    return descendants(this, []).filter(function (el) { return matchList(el, list); });
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  addEventListener(type, fn) { if (typeof fn !== "function" && !(fn && fn.handleEvent)) return; (this._ls[type] = this._ls[type] || []).push(fn); }
  removeEventListener(type, fn) { const l = this._ls[type]; if (l) { const k = l.indexOf(fn); if (k >= 0) l.splice(k, 1); } }
  dispatchEvent(ev) {
    if (!ev.target) ev.target = this;
    ev.currentTarget = this;
    for (const fn of (this._ls[ev.type] || []).slice()) {
      try { typeof fn === "function" ? fn.call(this, ev) : fn.handleEvent(ev); }
      catch (e) { this._doc()._errors.push(ev.type + " listener threw: " + (e && e.message)); }
    }
    if (ev.bubbles && !ev._stopped && this.parentNode) this.parentNode.dispatchEvent(ev);
    else if (ev.bubbles && !ev._stopped && this.nodeType === 9 && this._win) this._win.dispatchEvent(ev);
    return !ev.defaultPrevented;
  }
}
class DText extends DNode {
  constructor(doc, data, type) { super(doc); this.nodeType = type || 3; this.data = String(data); }
  get nodeName() { return this.nodeType === 3 ? "#text" : "#comment"; }
  get nodeValue() { return this.data; }
  set nodeValue(v) { this.data = String(v); }
}
const REFLECT = ["href", "src", "rel", "type", "title", "alt", "width", "height", "name", "content", "lang", "target", "role", "placeholder", "dir", "for", "media", "sizes", "charset"];
class DElement extends DNode {
  constructor(doc, name) {
    super(doc);
    this.nodeType = 1;
    this.localName = String(name).toLowerCase();
    this._attrs = new Map();
    this.style = makeStyle();
    this.dataset = makeDataset(this);
    if (this.localName === "template") this.content = new DFragment(doc);
  }
  get tagName() { return this.localName.toUpperCase(); }
  get nodeName() { return this.tagName; }
  getAttribute(n) { n = String(n).toLowerCase(); return this._attrs.has(n) ? this._attrs.get(n) : null; }
  setAttribute(n, v) { this._attrs.set(String(n).toLowerCase(), String(v)); this._doc()._mutated(this); }
  hasAttribute(n) { return this._attrs.has(String(n).toLowerCase()); }
  removeAttribute(n) { this._attrs.delete(String(n).toLowerCase()); this._doc()._mutated(this); }
  toggleAttribute(n, force) { const has = this.hasAttribute(n); const on = force === undefined ? !has : !!force; if (on && !has) this.setAttribute(n, ""); if (!on && has) this.removeAttribute(n); return on; }
  getAttributeNames() { return Array.from(this._attrs.keys()); }
  get attributes() { return Array.from(this._attrs, function (p) { return { name: p[0], value: p[1] }; }); }
  get id() { return this.getAttribute("id") || ""; }
  set id(v) { this.setAttribute("id", v); }
  get className() { return this.getAttribute("class") || ""; }
  set className(v) { this.setAttribute("class", v); }
  get classList() {
    const el = this;
    const set = function (arr) { el.setAttribute("class", arr.join(" ")); };
    return hostify({
      add: function () { const c = classesOf(el); for (const k of arguments) if (c.indexOf(String(k)) < 0) c.push(String(k)); set(c); },
      remove: function () { const drop = Array.prototype.map.call(arguments, String); if (el.hasAttribute("class")) set(classesOf(el).filter(function (k) { return drop.indexOf(k) < 0; })); },
      contains: function (k) { return classesOf(el).indexOf(String(k)) >= 0; },
      toggle: function (k, force) {
        const has = classesOf(el).indexOf(String(k)) >= 0;
        const on = force === undefined ? !has : !!force;
        if (on && !has) this.add(k);
        if (!on && has) this.remove(k);
        return on;
      },
      get length() { return classesOf(el).length; },
      item: function (n) { return classesOf(el)[n] || null; }
    }, "classList");
  }
  get innerHTML() { return this.childNodes.map(serialize).join(""); }
  set innerHTML(v) {
    const host = this.localName === "template" ? this.content : this;
    for (const c of host.childNodes) c.parentNode = null;
    host.childNodes = [];
    parseHTML(this._doc(), String(v === null || v === undefined ? "" : v), host);
    this._doc()._mutated(this);
  }
  get outerHTML() { return serialize(this); }
  insertAdjacentElement(where, el) {
    const w = String(where).toLowerCase();
    if (w === "beforebegin") { if (!this.parentNode) return null; this.parentNode.insertBefore(el, this); }
    else if (w === "afterbegin") this.insertBefore(el, this.firstChild);
    else if (w === "beforeend") this.appendChild(el);
    else if (w === "afterend") { if (!this.parentNode) return null; this.parentNode.insertBefore(el, this.nextSibling); }
    else throw new Error("SyntaxError: insertAdjacentElement " + where);
    return el;
  }
  insertAdjacentHTML(where, html) {
    const frag = new DFragment(this._doc());
    parseHTML(this._doc(), String(html), frag);
    this.insertAdjacentElement(where, frag);
  }
  insertAdjacentText(where, text) { this.insertAdjacentElement(where, this._doc().createTextNode(text)); }
  matches(sel) { return matchList(this, selectorFor(this, sel)); }
  closest(sel) { const list = selectorFor(this, sel); for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (matchList(n, list)) return n; return null; }
  getElementsByTagName(t) { return this.querySelectorAll(t); }
  getElementsByClassName(c) { return this.querySelectorAll(String(c).trim().split(/\s+/).map(function (k) { return "." + k; }).join("")); }
  click() { this.dispatchEvent(makeEvent("click", true)); }
  focus() {}
  blur() {}
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }; }
}
REFLECT.forEach(function (p) {
  const attr = p === "for" ? "for" : p;
  Object.defineProperty(DElement.prototype, p === "for" ? "htmlFor" : p, {
    get: function () { return this.getAttribute(attr) || ""; },
    set: function (v) { this.setAttribute(attr, v); }
  });
});
class DFragment extends DNode {
  constructor(doc) { super(doc); this.nodeType = 11; }
  get nodeName() { return "#document-fragment"; }
}
function serialize(n) {
  if (n.nodeType === 3) {
    const p = n.parentNode;
    return p && p.nodeType === 1 && /^(script|style|xmp|noembed|noframes|noscript|iframe)$/.test(p.localName) ? n.data : escText(n.data);
  }
  if (n.nodeType === 8) return "<!--" + n.data + "-->";
  if (n.nodeType === 11) return n.childNodes.map(serialize).join("");
  let s = "<" + n.localName;
  n._attrs.forEach(function (v, k) { s += " " + k + '="' + escAttr(v) + '"'; });
  s += ">";
  if (VOID_TAGS.has(n.localName)) return s;
  const kids = n.localName === "template" ? n.content.childNodes : n.childNodes;
  return s + kids.map(serialize).join("") + "</" + n.localName + ">";
}
class DDocument extends DNode {
  constructor() {
    super(null);
    this.nodeType = 9;
    this.readyState = "loading";
    this._observers = [];
    this._errors = [];
    this._quiet = true;
    const html = this.createElement("html");
    html.appendChild(this.createElement("head"));
    html.appendChild(this.createElement("body"));
    this.appendChild(html);
    this._quiet = false;
  }
  get nodeName() { return "#document"; }
  get documentElement() { return this.children[0] || null; }
  get head() { const h = this.documentElement; return h ? h.children.filter(function (e) { return e.localName === "head"; })[0] || null : null; }
  get body() { const h = this.documentElement; return h ? h.children.filter(function (e) { return e.localName === "body"; })[0] || null : null; }
  get defaultView() { return this._win || null; }
  createElement(t) { return new DElement(this, t); }
  createElementNS(ns, t) { return new DElement(this, t); }
  createTextNode(t) { return new DText(this, t, 3); }
  createComment(t) { return new DText(this, t, 8); }
  createDocumentFragment() { return new DFragment(this); }
  getElementById(id) { id = String(id); return descendants(this, []).filter(function (e) { return e.getAttribute("id") === id; })[0] || null; }
  getElementsByTagName(t) { return this.querySelectorAll(t); }
  getElementsByClassName(c) { return this.querySelectorAll(String(c).trim().split(/\s+/).map(function (k) { return "." + k; }).join("")); }
  _mutated(target) {
    if (this._quiet || !this._observers.length) return;
    for (const o of this._observers) {
      if (!o.root) continue;
      if (o.opts && o.opts.subtree ? !o.root.contains(target) : target !== o.root) continue;
      o.records.push({ type: "childList", target: target });
      if (!o.queued) {
        o.queued = true;
        const doc = this;
        queueMicrotask(function () {
          o.queued = false;
          if (!o.root || !o.records.length) return;
          const recs = o.records; o.records = [];
          try { o.cb(recs, o.api); } catch (e) { doc._errors.push("MutationObserver callback threw: " + (e && e.message)); }
        });
      }
    }
  }
}
// Parser: enough of the HTML tree builder for these pages (void and raw-text elements, implied
// html/head/body, implied </p> </li> </dt> </dd> </option> </td> </tr>, nested <a>, <tbody> under
// <table>, foreign svg self-closing, entities). Element-for-element parity with jsdom on every page and
// every rendered state was proved before this check stopped using jsdom.
function parseHTML(doc, html, fragHost) {
  doc._quiet = true;
  const stack = [];
  let bodyOpen = !!fragHost;
  const base = function () { return fragHost || (bodyOpen ? doc.body : doc.head); };
  const cur = function () { const t = stack.length ? stack[stack.length - 1] : base(); return t.localName === "template" ? t.content : t; };
  const inStack = function (name, stopAt) {
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].localName === name) return k;
      if (stopAt && stopAt.has(stack[k].localName)) return -1;
    }
    return -1;
  };
  const popTo = function (k) { stack.length = k; };
  const foreign = function () { return stack.some(function (e) { return e.localName === "svg" || e.localName === "math"; }); };
  const addText = function (t) {
    if (!t) return;
    if (!bodyOpen && !stack.length) {
      if (/^[\t\n\f\r ]*$/.test(t)) { doc.head.appendChild(doc.createTextNode(t)); return; }
      bodyOpen = true;
    }
    const p = cur();
    const last = p.lastChild;
    if (last && last.nodeType === 3) last.data += t;
    else p.appendChild(doc.createTextNode(t));
  };
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) { addText(decodeEntities(html.slice(i))); break; }
    if (lt > i) addText(decodeEntities(html.slice(i, lt)));
    i = lt;
    if (html.startsWith("<!--", i)) {
      const e = html.indexOf("-->", i + 4);
      const data = html.slice(i + 4, e < 0 ? n : e);
      i = e < 0 ? n : e + 3;
      if (fragHost || bodyOpen || stack.length) cur().appendChild(doc.createComment(data));
      continue;
    }
    if (html[i + 1] === "!" || html[i + 1] === "?") { const e = html.indexOf(">", i); i = e < 0 ? n : e + 1; continue; }
    const end = html[i + 1] === "/";
    const m = /^<\/?([a-zA-Z][^\s\/>]*)/.exec(html.slice(i, i + 200));
    if (!m) { addText("<"); i += 1; continue; }
    const name = m[1].toLowerCase();
    i += m[0].length;
    const attrs = [];
    let selfClose = false;
    for (;;) {
      while (i < n && /[\s\/]/.test(html[i])) { if (html[i] === "/" && html[i + 1] === ">") { selfClose = true; } i++; }
      if (i >= n) break;
      if (html[i] === ">") { i++; break; }
      const am = /^[^\s\/>=][^\s\/>=]*/.exec(html.slice(i, i + 200));
      if (!am) { i++; continue; }
      const an = am[0].toLowerCase();
      i += am[0].length;
      while (i < n && /\s/.test(html[i])) i++;
      let av = "";
      if (html[i] === "=") {
        i++;
        while (i < n && /\s/.test(html[i])) i++;
        if (html[i] === '"' || html[i] === "'") { const q = html[i]; const e = html.indexOf(q, i + 1); av = html.slice(i + 1, e < 0 ? n : e); i = e < 0 ? n : e + 1; }
        else { const vm2 = /^[^\s>]*/.exec(html.slice(i)); av = vm2[0]; i += av.length; }
        av = decodeEntities(av);
      }
      attrs.push([an, av]);
    }
    if (end) {
      if (name === "head") { continue; }
      if (name === "body" || name === "html") { continue; }
      if (name === "p" && inStack("p", SCOPE_STOP) < 0) { cur().appendChild(doc.createElement("p")); continue; }
      const k = inStack(name, SPECIAL.has(name) ? null : SPECIAL);
      if (k >= 0) popTo(k);
      continue;
    }
    if (name === "html" || name === "head" || name === "body") {
      const target = name === "html" ? doc.documentElement : name === "head" ? doc.head : doc.body;
      if (!fragHost) attrs.forEach(function (a) { if (!target.hasAttribute(a[0])) target.setAttribute(a[0], a[1]); });
      if (name === "body" && !fragHost) { bodyOpen = true; stack.length = 0; }
      continue;
    }
    if (!bodyOpen && !stack.length && !HEAD_TAGS.has(name)) bodyOpen = true;
    if (!foreign()) {
      if (CLOSES_P.has(name)) { const k = inStack("p", SCOPE_STOP); if (k >= 0) popTo(k); }
      if (name === "li") { const k = inStack("li", new Set(["ul", "ol", "menu"])); if (k >= 0) popTo(k); }
      if (name === "dt" || name === "dd") { const k1 = inStack("dt", new Set(["dl"])), k2 = inStack("dd", new Set(["dl"])); const k = Math.max(k1, k2); if (k >= 0) popTo(k); }
      if (/^h[1-6]$/.test(name) && stack.length && /^h[1-6]$/.test(stack[stack.length - 1].localName)) stack.pop();
      if (name === "option" && stack.length && stack[stack.length - 1].localName === "option") stack.pop();
      if (name === "a") { const k = inStack("a", SCOPE_STOP); if (k >= 0) popTo(k); }
      if (name === "button") { const k = inStack("button", SCOPE_STOP); if (k >= 0) popTo(k); }
      if (name === "td" || name === "th") { const k = Math.max(inStack("td", new Set(["tr", "table"])), inStack("th", new Set(["tr", "table"]))); if (k >= 0) popTo(k); }
      if (name === "tr") {
        const k = inStack("tr", new Set(["table", "tbody", "thead", "tfoot"])); if (k >= 0) popTo(k);
        if (stack.length && stack[stack.length - 1].localName === "table") { const tb = doc.createElement("tbody"); cur().appendChild(tb); stack.push(tb); }
      }
      if (name === "tbody" || name === "thead" || name === "tfoot") { const k = Math.max(inStack("tbody", new Set(["table"])), inStack("thead", new Set(["table"])), inStack("tfoot", new Set(["table"]))); if (k >= 0) popTo(k); }
    }
    const el = doc.createElement(name);
    attrs.forEach(function (a) { if (!el._attrs.has(a[0])) el._attrs.set(a[0], a[1]); });
    cur().appendChild(el);
    if (RAW_TAGS.has(name)) {
      const re = new RegExp("</" + name + "(?=[\\s/>])", "i");
      const rest = html.slice(i);
      const mm = re.exec(rest);
      const txt = rest.slice(0, mm ? mm.index : rest.length);
      if (txt) el.appendChild(doc.createTextNode(name === "textarea" || name === "title" ? decodeEntities(txt) : txt));
      i += mm ? mm.index : rest.length;
      if (mm) { const e = html.indexOf(">", i); i = e < 0 ? n : e + 1; }
      continue;
    }
    if (VOID_TAGS.has(name)) continue;
    if (selfClose && (foreign() || name === "svg" || name === "math")) continue;
    stack.push(el);
  }
  doc._quiet = false;
}
class DStorage {
  constructor() { this._m = new Map(); }
  getItem(k) { k = String(k); return this._m.has(k) ? this._m.get(k) : null; }
  setItem(k, v) { this._m.set(String(k), String(v)); }
  removeItem(k) { this._m.delete(String(k)); }
  clear() { this._m.clear(); }
  key(n) { return Array.from(this._m.keys())[n] || null; }
  get length() { return this._m.size; }
}

// ---- strict host objects ----
// Every object page code can reach (window / self / globalThis, document and every node, navigator,
// location, screen, performance, console, storage, style, classList, dataset, media query lists,
// events, observers) ends in a recording proxy, so a property, method or "in" test the stub does
// not model is recorded instead of reading as a quiet undefined/false. Own-key reflection
// (hasOwnProperty, Object.keys / getOwnPropertyNames / getOwnPropertyDescriptor, Reflect.ownKeys,
// for-in, prototype walks) on those objects is recorded too, unless on window it names a modelled
// API or a JS built-in. Only accesses made by page code count (the stack's first non-native frame
// is not this file); the DOM's own internals may probe freely. Any record FAILs the page run.
let ACTIVE_DOC = null;
const SETUP_FILE = "check-header-setup";
const SAFE_KEYS = new Set(["then", "toJSON", "inspect", "toString", "valueOf", "toLocaleString", "nodeType", "asymmetricMatch", "$$typeof"]);
const REFLECTIVE = new Set(["hasOwnProperty", "propertyIsEnumerable", "isPrototypeOf", "__lookupGetter__", "__lookupSetter__", "__defineGetter__", "__defineSetter__"]);
const HOSTS = new WeakMap();
function pageCaller(skip) {
  const prep = Error.prepareStackTrace, lim = Error.stackTraceLimit;
  let cs = [];
  try {
    Error.stackTraceLimit = 16;
    Error.prepareStackTrace = function (e, sites) { return sites; };
    const o = {};
    Error.captureStackTrace(o, skip);
    cs = o.stack || [];
  } finally { Error.prepareStackTrace = prep; Error.stackTraceLimit = lim; }
  for (const c of cs) {
    const f = c.getFileName && c.getFileName();
    if (!f || /^node:/.test(f) || f === "<anonymous>" || c.isNative && c.isNative()) continue;
    return f !== __filename && f !== SETUP_FILE;
  }
  return false;
}
function record(msg, skip) { if (ACTIVE_DOC && pageCaller(skip)) ACTIVE_DOC._errors.push(msg + " (the check-header page does not model it)"); }
function hostName(o, fallback) {
  const h = HOSTS.get(o);
  if (h) return h;
  if (o instanceof DNode) return o.nodeType === 9 ? "document" : o.nodeType === 1 ? "<" + o.localName + ">" : "a DOM node";
  return fallback;
}
function hostLabel(o) {
  if (o === null || (typeof o !== "object" && typeof o !== "function")) return null;
  const h = HOSTS.get(o);
  if (h) return h;
  return o instanceof DNode ? hostName(o) : null;
}
const reflectiveCache = new Map();
function reflectiveFn(k) {
  if (reflectiveCache.has(k)) return reflectiveCache.get(k);
  const orig = Object.prototype[k];
  const f = function () {
    record("page code called " + hostName(this, "a host object") + "." + k + "(" + (arguments.length ? String(arguments[0]) : "") + ")", f);
    return orig.apply(this, arguments);
  };
  reflectiveCache.set(k, f);
  return f;
}
function hostTail(label) {
  const handler = {
    get: function get(t, k, r) {
      if (typeof k === "symbol" || SAFE_KEYS.has(k)) return Reflect.get(t, k, r);
      if (REFLECTIVE.has(k)) return reflectiveFn(k);
      record("page code read " + hostName(r, label) + "." + k, get);
      return Reflect.get(t, k, r);
    },
    has: function has(t, k) {
      if (typeof k !== "symbol" && !SAFE_KEYS.has(k)) record("page code tested '" + k + "' in " + label, has);
      return Reflect.has(t, k);
    },
    ownKeys: function ownKeys(t) { record("page code enumerated the keys of " + label, ownKeys); return Reflect.ownKeys(t); },
    getPrototypeOf: function getPrototypeOf(t) { record("page code walked the prototype chain of " + label, getPrototypeOf); return Reflect.getPrototypeOf(t); }
  };
  return new Proxy(Object.prototype, handler);
}
const TAILS = new Map();
function tailFor(label) { if (!TAILS.has(label)) TAILS.set(label, hostTail(label)); return TAILS.get(label); }
function hostify(obj, label) { if (Object.getPrototypeOf(obj) === Object.prototype) Object.setPrototypeOf(obj, tailFor(label)); HOSTS.set(obj, label); return obj; }
Object.setPrototypeOf(DNode.prototype, tailFor("a DOM node"));
// A real element's constructor is HTMLDivElement and so on; the stub's classes are not that, so
// page code reading .constructor reaches the recorder instead.
[DNode, DText, DElement, DFragment, DDocument, DStorage].forEach(function (C) { delete C.prototype.constructor; });
Object.setPrototypeOf(DStorage.prototype, tailFor("Storage"));
function makeEvent(type, bubbles, extra) {
  const e = hostify({
    type: type, bubbles: !!bubbles, cancelable: true, composed: false, isTrusted: true, defaultPrevented: false,
    target: null, currentTarget: null, timeStamp: 0, eventPhase: 0,
    preventDefault: function () { this.defaultPrevented = true; },
    stopPropagation: function () { this._stopped = true; },
    stopImmediatePropagation: function () { this._stopped = true; }
  }, "an event");
  if (extra) Object.assign(e, extra);
  return e;
}
// style: unset CSS properties read as "" (as in a browser); methods are modelled; enumerating it,
// or testing a name with "in", is recorded.
function makeStyle() {
  const store = Object.create(null);
  const api = {
    setProperty: function (k, v) { store[String(k)] = String(v); },
    getPropertyValue: function (k) { return store[String(k)] || ""; },
    removeProperty: function (k) { const v = store[String(k)] || ""; delete store[String(k)]; return v; }
  };
  const px = new Proxy(store, {
    get: function get(t, k) {
      if (typeof k === "symbol" || SAFE_KEYS.has(k)) return undefined;
      if (Object.prototype.hasOwnProperty.call(api, k)) return api[k];
      if (k === "cssText") return Object.keys(t).map(function (n) { return n + ": " + t[n]; }).join("; ");
      if (/^(--|[a-z][a-zA-Z]*$)/.test(k)) return t[k] === undefined ? "" : t[k];
      record("page code read style." + k, get);
      return undefined;
    },
    set: function (t, k, v) { t[k] = String(v); return true; },
    has: function has(t, k) { record("page code tested '" + String(k) + "' in style", has); return k in t || Object.prototype.hasOwnProperty.call(api, k); },
    ownKeys: function ownKeys(t) { record("page code enumerated style", ownKeys); return Reflect.ownKeys(t); },
    getPrototypeOf: function getPrototypeOf() { record("page code walked the prototype chain of style", getPrototypeOf); return null; }
  });
  HOSTS.set(px, "style");
  return px;
}
// dataset: a live view of the data-* attributes, as in a browser (missing keys read undefined).
function makeDataset(el) {
  const attr = function (k) { return "data-" + String(k).replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); }); };
  const prop = function (a) { return a.slice(5).replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); }); };
  const keys = function () { return el.getAttributeNames().filter(function (a) { return /^data-/.test(a); }).map(prop); };
  const px = new Proxy(Object.create(null), {
    get: function (t, k) { if (typeof k === "symbol") return undefined; const v = el.getAttribute(attr(k)); return v === null ? undefined : v; },
    set: function (t, k, v) { el.setAttribute(attr(k), v); return true; },
    has: function (t, k) { return typeof k === "string" && el.hasAttribute(attr(k)); },
    deleteProperty: function (t, k) { el.removeAttribute(attr(k)); return true; },
    ownKeys: function () { return keys(); },
    getOwnPropertyDescriptor: function (t, k) { const v = typeof k === "string" ? el.getAttribute(attr(k)) : null; return v === null ? undefined : { value: v, writable: true, enumerable: true, configurable: true }; }
  });
  HOSTS.set(px, "dataset");
  return px;
}
// matchMedia: a real evaluator for media types, not/only, and, comma lists, and the features
// min-/max-width, width, min-/max-height, height (px, em, rem), orientation, prefers-color-scheme
// and prefers-reduced-motion. Anything else is unparseable: recorded, and matches false.
function evalMedia(query, env) {
  const parts = String(query).split(",");
  let any = false;
  for (let part of parts) {
    let s = part.trim().toLowerCase();
    if (!s) throw new Error("empty media query");
    let neg = false;
    let m = /^(not|only)\s+/.exec(s);
    if (m) { neg = m[1] === "not"; s = s.slice(m[0].length); }
    let typeOk = true, hadType = false;
    m = /^(all|screen|print)(?![-\w])\s*/.exec(s);
    if (m) {
      hadType = true; typeOk = m[1] !== "print"; s = s.slice(m[0].length);
      if (s) { if (!/^and\s+/.test(s)) throw new Error("bad media query: " + part); s = s.replace(/^and\s+/, ""); }
    } else if (m === null && /^(not|only)$/.test(s)) throw new Error("bad media query: " + part);
    if (!hadType && (neg || !s)) throw new Error("bad media query: " + part);
    let ok = typeOk;
    if (s) {
      for (const f of s.split(/\s+and\s+/)) {
        const fm = /^\(\s*([a-z-]+)\s*:\s*([^()]+?)\s*\)$/.exec(f.trim());
        if (!fm) throw new Error("bad media feature: " + f);
        ok = mediaFeature(fm[1], fm[2], env) && ok;
      }
    }
    if (neg ? !ok : ok) any = true;
  }
  return any;
}
function mediaFeature(name, val, env) {
  const len = function () {
    const m = /^(\d+(?:\.\d+)?)(px|em|rem)$/.exec(val);
    if (!m) throw new Error("bad media length: " + val);
    return Number(m[1]) * (m[2] === "px" ? 1 : 16);
  };
  if (name === "min-width") return env.w >= len();
  if (name === "max-width") return env.w <= len();
  if (name === "width") return env.w === len();
  if (name === "min-height") return env.h >= len();
  if (name === "max-height") return env.h <= len();
  if (name === "height") return env.h === len();
  if (name === "orientation") { if (!/^(portrait|landscape)$/.test(val)) throw new Error("bad orientation: " + val); return val === (env.h >= env.w ? "portrait" : "landscape"); }
  if (name === "prefers-color-scheme") { if (!/^(light|dark)$/.test(val)) throw new Error("bad prefers-color-scheme: " + val); return val === env.scheme; }
  if (name === "prefers-reduced-motion") { if (!/^(no-preference|reduce)$/.test(val)) throw new Error("bad prefers-reduced-motion: " + val); return val === env.motion; }
  throw new Error("media feature not modelled: " + name);
}
// One page in one state: a document, a window (the vm global) with localStorage, matchMedia
// (phone = every max-width query matches), a fake clock for setTimeout/setInterval, and
// MutationObserver delivered as microtasks, ResizeObserver and IntersectionObserver that call
// back on the fake clock, pageshow after load, and a window that FAILs on any browser global it
// does not model (instead of letting feature-detected code quietly skip).
// JS built-ins every vm context has; anything else must be on the stub window.
const JS_BUILTINS = new Set(vm.runInNewContext("Object.getOwnPropertyNames(globalThis)"));
function makeWindow(html, pagePath, phone) {
  const doc = new DDocument();
  ACTIVE_DOC = doc;
  const env = { w: phone ? 390 : 1280, h: phone ? 844 : 900, scheme: "light", motion: "no-preference" };
  parseHTML(doc, html, null);
  const timers = [];
  let clock = 0, nextId = 1;
  const addTimer = function (fn, ms, args, every) {
    const id = nextId++;
    timers.push({ id: id, at: clock + Math.max(0, Number(ms) || 0), fn: fn, args: args, every: every ? Math.max(1, Number(ms) || 0) : 0 });
    return id;
  };
  const clearTimer = function (id) { const k = timers.findIndex(function (t) { return t.id === id; }); if (k >= 0) timers.splice(k, 1); };
  const ls = {};
  const win = {
    document: doc,
    localStorage: hostify(new DStorage(), "localStorage"),
    sessionStorage: hostify(new DStorage(), "sessionStorage"),
    location: hostify({ pathname: pagePath, href: "https://aia.test" + pagePath, origin: "https://aia.test", protocol: "https:", host: "aia.test", hostname: "aia.test", port: "", search: "", hash: "" }, "location"),
    navigator: hostify({ userAgent: "aia-check-header", language: "en-US", languages: ["en-US"], onLine: true }, "navigator"),
    screen: hostify({ width: env.w, height: env.h, availWidth: env.w, availHeight: env.h, colorDepth: 24, pixelDepth: 24 }, "screen"),
    performance: hostify({ now: function () { return clock; }, timeOrigin: 0 }, "performance"),
    devicePixelRatio: phone ? 3 : 1,
    innerWidth: env.w,
    innerHeight: env.h,
    outerWidth: env.w,
    outerHeight: env.h,
    console: hostify({ log() {}, info() {}, warn() {}, error() {}, debug() {} }, "console"),
    matchMedia: function (q) {
      let matches = false;
      try { matches = evalMedia(q, env); }
      catch (e) { doc._errors.push("matchMedia(" + JSON.stringify(String(q)) + ") could not be evaluated: " + e.message); }
      const ls2 = [];
      return hostify({
        matches: matches, media: String(q), onchange: null,
        addEventListener: function (t, fn) { if (t === "change") ls2.push(fn); }, removeEventListener: function (t, fn) { const k = ls2.indexOf(fn); if (k >= 0) ls2.splice(k, 1); },
        addListener: function (fn) { ls2.push(fn); }, removeListener: function (fn) { const k = ls2.indexOf(fn); if (k >= 0) ls2.splice(k, 1); },
        dispatchEvent: function () { return true; }
      }, "a MediaQueryList");
    },
    setTimeout: function (fn, ms) { return addTimer(fn, ms, Array.prototype.slice.call(arguments, 2), false); },
    setInterval: function (fn, ms) { return addTimer(fn, ms, Array.prototype.slice.call(arguments, 2), true); },
    clearTimeout: clearTimer,
    clearInterval: clearTimer,
    requestAnimationFrame: function (fn) { return addTimer(function () { fn(clock); }, 16, [], false); },
    cancelAnimationFrame: clearTimer,
    getComputedStyle: function () { return { getPropertyValue: function () { return ""; } }; },
    addEventListener: function (t, fn) { (ls[t] = ls[t] || []).push(fn); },
    removeEventListener: function (t, fn) { const l = ls[t]; if (l && l.indexOf(fn) >= 0) l.splice(l.indexOf(fn), 1); },
    dispatchEvent: function (ev) {
      for (const fn of (ls[ev.type] || []).slice()) {
        try { fn.call(win, ev); } catch (e) { doc._errors.push("window " + ev.type + " listener threw: " + (e && e.message)); }
      }
      return true;
    },
    MutationObserver: function (cb) {
      const o = { cb: cb, root: null, opts: null, records: [], queued: false };
      o.api = this;
      this.observe = function (root, opts) { o.root = root; o.opts = opts || {}; if (doc._observers.indexOf(o) < 0) doc._observers.push(o); };
      this.disconnect = function () { o.root = null; o.records = []; const k = doc._observers.indexOf(o); if (k >= 0) doc._observers.splice(k, 1); };
      this.takeRecords = function () { const r = o.records; o.records = []; return r; };
    },
    Event: function (type, init) { this.type = type; this.bubbles = !!(init && init.bubbles); },
    // ResizeObserver: one callback a frame after observe() (and after every observe of a new
    // target), with a plausible box. IntersectionObserver: one callback right after observe(),
    // the header is on screen.
    ResizeObserver: function (cb) {
      const api = this, seen = new Set();
      this.observe = function (el) {
        if (seen.has(el)) return; seen.add(el);
        addTimer(function () {
          if (!seen.has(el)) return;
          const w = phone ? 390 : 1280, hgt = 56;
          const box = { x: 0, y: 0, top: 0, left: 0, width: w, height: hgt, right: w, bottom: hgt };
          try { cb([{ target: el, contentRect: box, borderBoxSize: [{ inlineSize: w, blockSize: hgt }], contentBoxSize: [{ inlineSize: w, blockSize: hgt }], devicePixelContentBoxSize: [{ inlineSize: w, blockSize: hgt }] }], api); }
          catch (e) { doc._errors.push("ResizeObserver callback threw: " + (e && e.message)); }
        }, 16, [], false);
      };
      this.unobserve = function (el) { seen.delete(el); };
      this.disconnect = function () { seen.clear(); };
    },
    IntersectionObserver: function (cb, opts) {
      const api = this, seen = new Set();
      this.root = (opts && opts.root) || null; this.rootMargin = (opts && opts.rootMargin) || "0px"; this.thresholds = [].concat((opts && opts.threshold) || 0);
      this.observe = function (el) {
        if (seen.has(el)) return; seen.add(el);
        addTimer(function () {
          if (!seen.has(el)) return;
          const w = phone ? 390 : 1280;
          const box = { x: 0, y: 0, top: 0, left: 0, width: w, height: 56, right: w, bottom: 56 };
          try { cb([{ target: el, isIntersecting: true, intersectionRatio: 1, boundingClientRect: box, intersectionRect: box, rootBounds: { x: 0, y: 0, top: 0, left: 0, width: w, height: phone ? 844 : 900, right: w, bottom: phone ? 844 : 900 }, time: clock }], api); }
          catch (e) { doc._errors.push("IntersectionObserver callback threw: " + (e && e.message)); }
        }, 0, [], false);
      };
      this.unobserve = function (el) { seen.delete(el); };
      this.disconnect = function () { seen.clear(); };
      this.takeRecords = function () { return []; };
    }
  };
  // window itself has no Object.prototype: Object.prototype methods on window come from this
  // window's own realm (where own-key reflection is checked), as in a browser.
  Object.setPrototypeOf(win, null);
  ["MutationObserver", "ResizeObserver", "IntersectionObserver", "Event"].forEach(function (k) { Object.setPrototypeOf(win[k].prototype, tailFor("a " + k)); });
  // Unknown browser globals FAIL: a bare name, window.X, self.X or "X" in window that the stub
  // does not model is recorded, so code gated on a missing API cannot quietly skip. Bare names
  // reach a recording proxy at the end of the global's prototype chain (JS built-ins and the
  // stub's own globals are found first); window / self are a recording view of the same global.
  const unknown = function (k) {
    if (typeof k !== "string" || k in win || JS_BUILTINS.has(k) || (protoTarget && k in protoTarget)) return;
    doc._errors.push("page code read browser global '" + k + "', which the check-header window does not model");
  };
  let protoTarget = null;
  vm.createContext(win);
  const realGlobal = vm.runInContext("globalThis", win, { filename: SETUP_FILE });
  protoTarget = vm.runInContext("Object.getPrototypeOf(globalThis)", win, { filename: SETUP_FILE });
  const tail = new Proxy(protoTarget, {
    has: function (t, k) { if (k in t) return true; unknown(k); return false; },
    get: function (t, k, r) { if (k in t) return Reflect.get(t, k, r); unknown(k); return undefined; }
  });
  win.__aiaTail = tail;
  vm.runInContext("Object.setPrototypeOf(globalThis, __aiaTail);", win, { filename: SETUP_FILE });
  delete win.__aiaTail;
  const winKnown = function (k) { return typeof k === "symbol" || Object.prototype.hasOwnProperty.call(win, k) || JS_BUILTINS.has(k); };
  const gwin = new Proxy(win, {
    get: function get(t, k) {
      if (k === "constructor" || k === "__proto__") record("page code read window." + k, get);
      if (k in t) return Reflect.get(t, k);
      unknown(k); return realGlobal[k];
    },
    has: function (t, k) { if (k in t) return true; unknown(k); return k in realGlobal; },
    set: function (t, k, v) { t[k] = v; return true; },
    getOwnPropertyDescriptor: function getOwnPropertyDescriptor(t, k) {
      if (!winKnown(k)) record("page code asked whether window owns '" + String(k) + "'", getOwnPropertyDescriptor);
      const d = Reflect.getOwnPropertyDescriptor(t, k);
      if (d || !JS_BUILTINS.has(k)) return d;
      const b = Reflect.getOwnPropertyDescriptor(realGlobal, k);
      return b ? Object.assign({}, b, { configurable: true }) : undefined;
    },
    ownKeys: function ownKeys(t) { record("page code enumerated the keys of window", ownKeys); return Reflect.ownKeys(t); },
    getPrototypeOf: function getPrototypeOf(t) { record("page code walked the prototype chain of window", getPrototypeOf); return Reflect.getPrototypeOf(t); }
  });
  win.window = gwin;
  win.self = gwin;
  doc._win = gwin;
  HOSTS.set(win, "window"); HOSTS.set(gwin, "window"); HOSTS.set(realGlobal, "window");
  // Own-key reflection from page code goes through this window's Object / Reflect: on window it
  // must name a modelled API or a JS built-in; on any other host object it is recorded.
  const VObject = vm.runInContext("Object", win, { filename: SETUP_FILE });
  const VReflect = vm.runInContext("Reflect", win, { filename: SETUP_FILE });
  const VJSON = vm.runInContext("JSON", win, { filename: SETUP_FILE });
  const ownCheck = function (o, k, how, skip) {
    const h = hostLabel(o);
    if (!h || h === "dataset") return; // dataset is a full model of the data-* attributes
    if (h === "window") { if (!winKnown(k)) record("page code asked " + how + " whether window owns '" + String(k) + "'", skip); }
    else record("page code asked " + how + " whether " + h + " owns '" + String(k) + "'", skip);
  };
  const keyed = function (holder, name) {
    const orig = holder[name];
    const f = function (o, k) { ownCheck(o, k, name, f); return orig.apply(this, arguments); };
    Object.defineProperty(holder, name, { value: f, writable: true, configurable: true });
  };
  const listing = function (holder, name, all) {
    const orig = holder[name];
    const f = function () {
      const objs = all ? Array.prototype.slice.call(arguments, 1) : [arguments[0]];
      objs.forEach(function (o) { const h = hostLabel(o); if (h && h !== "dataset") record("page code listed " + h + " with " + name, f); });
      return orig.apply(this, arguments);
    };
    Object.defineProperty(holder, name, { value: f, writable: true, configurable: true });
  };
  keyed(VObject, "getOwnPropertyDescriptor"); keyed(VObject, "hasOwn"); keyed(VReflect, "getOwnPropertyDescriptor");
  ["keys", "values", "entries", "getOwnPropertyNames", "getOwnPropertySymbols", "getOwnPropertyDescriptors", "getPrototypeOf"].forEach(function (n) { listing(VObject, n, false); });
  ["ownKeys", "getPrototypeOf"].forEach(function (n) { listing(VReflect, n, false); });
  listing(VObject, "assign", true); listing(VJSON, "stringify", false);
  ["hasOwnProperty", "propertyIsEnumerable"].forEach(function (n) {
    const orig = VObject.prototype[n];
    const f = function (k) { ownCheck(this, k, n, f); return orig.apply(this, arguments); };
    Object.defineProperty(VObject.prototype, n, { value: f, writable: true, configurable: true });
  });
  const settle = function () { return new Promise(function (r) { setImmediate(r); }); };
  const ev = function (type, bubbles) { return makeEvent(type, bubbles); };
  return {
    window: win,
    document: doc,
    errors: doc._errors,
    pendingTimers: function () { return timers.length; },
    run: function (src) { ACTIVE_DOC = doc; vm.runInContext(src, win, { filename: "theme.js", timeout: 2000 }); },
    // pageshow / pagehide carry persisted (false on a normal load, true on a back/forward restore).
    pageEvent: async function (type, persisted) {
      const e = ev(type, false); e.persisted = !!persisted;
      win.dispatchEvent(e);
      await settle();
    },
    // Run every timer to completion, in order, on the fake clock (bounded). Anything still
    // pending after the bound (a setInterval, or a timer that keeps re-arming) is an error,
    // never a quiet pass.
    drain: async function () {
      let steps = 0;
      while (timers.length && steps < 2000) {
        timers.sort(function (a, b) { return a.at - b.at || a.id - b.id; });
        const t = timers[0];
        if (t.at - clock > 600000) break;
        await this.advance(t.at - clock);
        steps += 1;
      }
      if (timers.length) doc._errors.push(timers.length + " timer(s) still pending after running every timer (setInterval or a re-arming timer; the header count is not final)");
    },
    settle: settle,
    // Parsing is done: DOMContentLoaded on document (bubbles to window), then load on window.
    load: async function () {
      await settle();
      doc.readyState = "interactive";
      doc.dispatchEvent(ev("DOMContentLoaded", true));
      await settle();
      doc.readyState = "complete";
      win.dispatchEvent(ev("load", false));
      await settle();
      const ps = ev("pageshow", false); ps.persisted = false;
      win.dispatchEvent(ps);
      await settle();
    },
    // Fake time: run every timer due in the next ms milliseconds, in order, settling microtasks
    // after each one. A header that appears or changes on a timer is in the count.
    advance: async function (ms) {
      const until = clock + ms;
      let guard = 0;
      for (;;) {
        timers.sort(function (a, b) { return a.at - b.at || a.id - b.id; });
        const t = timers[0];
        if (!t || t.at > until || ++guard > 5000) break;
        clock = t.at;
        if (t.every) t.at += t.every; else timers.shift();
        try { typeof t.fn === "function" ? t.fn.apply(win, t.args) : vm.runInContext(String(t.fn), win); }
        catch (e) { doc._errors.push("timer threw: " + (e && e.message)); }
        await settle();
      }
      clock = until;
      await settle();
    }
  };
}
// ---- mini DOM end ----

async function renderPage(file, opts) {
  const w = makeWindow(fs.readFileSync(path.join(root, file), "utf8"), "/" + file.replace(/\.html$/, ""), !!opts.phone);
  if (opts.signedIn) {
    w.window.localStorage.setItem("aia_ws", "alpha");
    w.window.localStorage.setItem("aia_session", "tok-alpha");
    w.window.localStorage.setItem("aia_name", "Sam");
  }
  w.run(themeSrc);
  await w.settle();
  // Before DOMContentLoaded: the phone path has already painted the header chrome.
  w.early = {
    lock: w.document.querySelectorAll("#aia-header-lock").length,
    btn: w.document.querySelectorAll("header [data-theme-btn], header .theme-btn, .site-header [data-theme-btn], .site-header .theme-btn").length
  };
  await w.load();
  await w.advance(1000);
  if (opts.twice) {
    w.run(themeSrc);
    await w.settle();
    await w.advance(1000);
  }
  // Then every timer runs to the end, the page is left and restored from the back/forward
  // cache (pagehide + pageshow persisted:true), and every timer runs to the end again.
  await w.drain();
  await w.pageEvent("pagehide", true);
  await w.pageEvent("pageshow", true);
  await w.drain();
  if (w.pendingTimers() !== 0) w.errors.push("pendingTimers() is " + w.pendingTimers() + " after the drain");
  if (w.errors.length) throw new Error(w.errors[0]);
  return w;
}
function selfTest() {
  const bad = [];
  const w = makeWindow('<!doctype html><html><head><title>t &amp; u</title><script>if (a < b) {}</script></head><body><header class="site-header"><a class="brand" href="index.html"><img class="brand-mark" src="x.png" alt=""><span class="brand-name">Automate It Away</span></a><div class="nav"><a href="onboard.html" data-nav-keep>Open a Queue</a><p>one<p>two</div></header><ul><li>a<li>b</ul><table><tr><td>c</table><svg viewBox="0 0 1 1"><path d="M0 0"/></svg><i id="x">&lt;b&gt;</i></body></html>', "/selftest", false);
  const d = w.document;
  if (d.querySelectorAll("header").length !== 1) bad.push("header");
  if (d.querySelectorAll("header > a.brand").length !== 1 || d.querySelectorAll("header>a.brand img.brand-mark").length !== 1) bad.push("child/descendant combinator");
  if (d.querySelectorAll('a[data-nav-keep][href="onboard.html"]').length !== 1) bad.push("attribute selector");
  if (d.querySelectorAll("header a:not(.brand)").length !== 1) bad.push(":not");
  if (d.querySelectorAll(".nav p").length !== 2 || d.querySelectorAll("li").length !== 2 || d.querySelectorAll("table > tbody > tr > td").length !== 1) bad.push("implied end tags");
  if (d.querySelectorAll("path").length !== 1 || d.querySelector("path").parentNode.localName !== "svg") bad.push("svg self-closing");
  if (d.head.querySelectorAll("script, title").length !== 2 || d.querySelector("script").textContent !== "if (a < b) {}") bad.push("raw text");
  if (d.getElementById("x").textContent !== "<b>" || d.querySelector("title").textContent !== "t & u") bad.push("entities");
  const a = d.querySelector(".brand");
  a.insertAdjacentHTML("afterbegin", "<b class=\"k\">k</b>");
  if (a.firstChild.className !== "k" || d.querySelector(".brand-mark").closest("header, .site-header") !== d.querySelector("header")) bad.push("insertAdjacentHTML/closest");
  a.classList.add("on"); a.classList.remove("brand");
  if (d.querySelectorAll(".brand").length !== 0 || !a.classList.contains("on")) bad.push("classList");
  let threw = false;
  try { d.querySelectorAll("a:hover"); } catch (e) { threw = true; }
  if (!threw) bad.push("unknown selector must throw");
  if (!w.errors.some(function (e) { return /unsupported selector/.test(e) && /a:hover/.test(e); })) bad.push("unknown selector must be recorded on the page");
  if (bad.length) fail("check-header DOM self-test: " + bad.join("; "));
  else pass("check-header DOM self-test (parser, selectors, insertAdjacentHTML, classList)");
}
// The stub must behave like a browser where page code could hide a duplicate from it.
async function stubSelfTest() {
  const bad = [];
  const page = '<!doctype html><html><head></head><body><header class="site-header"><div class="hdr-tools"></div></header></body></html>';
  const probe = async function (code, after) {
    const w = makeWindow(page, "/selftest", false);
    w.run(code);
    await w.settle();
    await w.load();
    await w.advance(1000);
    if (after) await after(w);
    return w;
  };
  let w = await probe('window.addEventListener("pageshow", function (e) { document.body.setAttribute("data-ps", (document.body.getAttribute("data-ps") || "") + (e.persisted ? "T" : "F")); });', async function (x) { await x.pageEvent("pageshow", true); });
  if (w.document.body.getAttribute("data-ps") !== "FT") bad.push("pageshow must fire after load (persisted false), then on restore (persisted true): got " + w.document.body.getAttribute("data-ps"));
  w = await probe('new ResizeObserver(function (es) { if (es[0].contentRect.width > 0) document.body.setAttribute("data-ro", "1"); }).observe(document.body); new IntersectionObserver(function (es) { if (es[0].isIntersecting) document.body.setAttribute("data-io", "1"); }).observe(document.body);');
  if (w.document.body.getAttribute("data-ro") !== "1" || w.document.body.getAttribute("data-io") !== "1") bad.push("ResizeObserver and IntersectionObserver must call back");
  w = await probe('if (typeof PerformanceObserver !== "undefined" || window.SomeNewApi || ("Foo" in window)) {}');
  ["PerformanceObserver", "SomeNewApi", "Foo"].forEach(function (k) { if (!w.errors.some(function (e) { return e.indexOf("'" + k + "'") >= 0; })) bad.push("unknown global " + k + " must be recorded"); });
  w = await probe('var known = typeof Promise + typeof JSON + typeof document + typeof localStorage + typeof setTimeout;');
  if (w.errors.length) bad.push("JS built-ins and modelled globals must not be flagged: " + w.errors[0]);
  w = await probe('try { document.querySelector("header:has(.x)"); } catch (e) {}');
  if (!w.errors.some(function (e) { return /unsupported selector/.test(e) && /:has/.test(e); })) bad.push(":has() caught by page code must still be recorded");
  w = await probe('setTimeout(function () { document.body.setAttribute("data-late", "1"); setTimeout(function () { document.body.setAttribute("data-later", "1"); }, 30000); }, 2500);', function (x) { return x.drain(); });
  if (w.document.body.getAttribute("data-late") !== "1" || w.document.body.getAttribute("data-later") !== "1" || w.pendingTimers() !== 0) bad.push("drain must run every one-shot timer (2500ms, then 30s more)");
  w = await probe('setInterval(function () {}, 5000);', function (x) { return x.drain(); });
  if (!w.errors.some(function (e) { return /still pending/.test(e); })) bad.push("a timer still pending after the drain must be recorded");
  if (bad.length) fail("check-header stub self-test: " + bad.join("; "));
  else pass("check-header stub self-test (pageshow false/true, ResizeObserver and IntersectionObserver call back, unknown globals and caught unsupported selectors recorded, timers drained or flagged)");
}
// Strict host objects and the media-query evaluator: Probe's C3, C4b, C8b, C8c, C9, C10, C11 and
// their siblings, each as a small page script that must either trip the recorder or show the
// duplicate it builds; and ordinary theme.js-style code must trip nothing.
async function hostSelfTest() {
  const bad = [];
  const page = '<!doctype html><html><head></head><body><header class="site-header"><div class="hdr-tools"></div></header></body></html>';
  const run = async function (code, phone) {
    const w = makeWindow(page, "/selftest", !!phone);
    try { w.run(code); } catch (e) { w.errors.push("threw: " + e.message); }
    await w.settle();
    await w.load();
    await w.advance(1000);
    await w.drain();
    return w;
  };
  const DUP = 'var b = document.createElement("button"); b.className = "theme-btn"; document.querySelector("header .hdr-tools").appendChild(b);';
  const dupCount = function (w) { return w.document.querySelectorAll(".theme-btn").length; };
  const trips = [
    ["C4b document.fonts && document.fonts.ready", 'if (document.fonts && document.fonts.ready) {}', /document\.fonts/],
    ["C8b window.hasOwnProperty('requestIdleCallback')", 'if (window.hasOwnProperty("requestIdleCallback")) {}', /requestIdleCallback/],
    ["C8c Object.getOwnPropertyNames(window)", 'if (Object.getOwnPropertyNames(window).indexOf("requestIdleCallback") >= 0) {}', /listed window|enumerated the keys of window/],
    ["C9 'fonts' in document", 'if ("fonts" in document) {}', /'fonts' in/],
    ["C10 navigator.userAgentData", 'if (typeof navigator !== "undefined" && navigator.userAgentData) {}', /navigator\.userAgentData/],
    ["C11 document.documentElement.animate", 'if (document.documentElement.animate) {}', /<html>\.animate/],
    ["Reflect.ownKeys(document)", 'Reflect.ownKeys(document);', /listed document/],
    ["Object.keys(navigator)", 'Object.keys(navigator);', /listed navigator/],
    ["'animate' in el", 'if ("animate" in document.querySelector("header")) {}', /'animate' in/],
    ["el.hasOwnProperty", 'document.querySelector("header").hasOwnProperty("x");', /hasOwnProperty\(x\)/],
    ["Object.prototype.hasOwnProperty.call(el)", 'Object.prototype.hasOwnProperty.call(document.body, "nodeType");', /owns 'nodeType'/],
    ["globalThis.hasOwnProperty('requestIdleCallback')", 'globalThis.hasOwnProperty("requestIdleCallback");', /window owns 'requestIdleCallback'/],
    ["Object.getOwnPropertyNames(globalThis)", 'Object.getOwnPropertyNames(globalThis);', /listed window/],
    ["Object.getOwnPropertyDescriptor(window)", 'Object.getOwnPropertyDescriptor(window, "requestIdleCallback");', /requestIdleCallback/],
    ["for-in over an element", 'for (var k in document.body) { if (k === "animate") {} }', /enumerated the keys of/],
    ["Object.getPrototypeOf(document)", 'Object.getPrototypeOf(document);', /listed document/],
    ["el.__proto__ walk", 'var pp = document.body.__proto__;', /__proto__/],
    ["el.constructor", 'var cc = document.body.constructor;', /\.constructor/],
    ["document.getAnimations()", 'if (document.getAnimations) {}', /document\.getAnimations/],
    ["el.getAnimations", 'if (document.body.getAnimations) {}', /<body>\.getAnimations/],
    ["enumerating style", 'Object.keys(document.body.style);', /listed style/],
    ["'x' in style", 'if ("contain" in document.body.style) {}', /in style/],
    ["classList.replace", 'if (document.body.classList.replace) {}', /classList\.replace/],
    ["event member not modelled", 'window.addEventListener("load", function (e) { if (e.persistedX) {} });', /an event\.persistedX/],
    ["location member not modelled", 'if (location.ancestorOrigins) {}', /location\.ancestorOrigins/],
    ["screen.orientation", 'if (screen.orientation) {}', /screen\.orientation/],
    ["performance.getEntries", 'if (performance.getEntries) {}', /performance\.getEntries/],
    ["localStorage as a map", 'if (localStorage.aia_ws) {}', /localStorage\.aia_ws/],
    ["MediaQueryList member", 'if (matchMedia("(min-width: 1px)").onchangeX) {}', /MediaQueryList\.onchangeX/],
    ["unparseable media query", 'matchMedia("(min-width: 10 apples)");', /could not be evaluated/],
    ["unmodelled media feature", 'matchMedia("(hover: hover)");', /could not be evaluated/],
    ["window.requestIdleCallback", 'if (window.requestIdleCallback) {}', /'requestIdleCallback'/],
    ["typeof customElements", 'if (typeof customElements !== "undefined") {}', /'customElements'/]
  ];
  for (const [name, code, re] of trips) {
    const w = await run(code, false);
    if (!w.errors.some(function (e) { return re.test(e); })) bad.push(name + " must be recorded (got: " + (w.errors[0] || "nothing") + ")");
  }
  // Duplicates that a real load shows must show here, at the right width.
  const dups = [
    ["C3 matchMedia min-width 861px + immediate call", 'var mq3 = matchMedia("(min-width: 861px)"); var f3 = function () { if (mq3.matches) { ' + DUP + ' } }; mq3.addEventListener("change", f3); f3();', [2, 1]],
    ["matchMedia('(min-width: 1000px)') change listener + immediate", 'var m = window.matchMedia("(min-width: 1000px)"); var f = function () { if (m.matches) { ' + DUP + ' } }; m.addEventListener("change", f); f();', [2, 1]],
    ["screen.width", 'if (screen.width > 1000) { ' + DUP + ' }', [2, 1]],
    ["devicePixelRatio", 'if (devicePixelRatio >= 2) { ' + DUP + ' }', [1, 2]],
    ["orientation: portrait", 'if (matchMedia("(orientation: portrait)").matches) { ' + DUP + ' }', [1, 2]],
    ["not all and (max-width: 860px)", 'if (matchMedia("not all and (max-width: 860px)").matches) { ' + DUP + ' }', [2, 1]],
    ["screen and (max-width: 53.75em), print", 'if (matchMedia("screen and (max-width: 53.75em), print").matches) { ' + DUP + ' }', [1, 2]],
    ["prefers-color-scheme light", 'if (matchMedia("(prefers-color-scheme: light)").matches) { ' + DUP + ' }', [2, 2]],
    ["prefers-reduced-motion no-preference", 'if (matchMedia("(prefers-reduced-motion: no-preference)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) { ' + DUP + ' }', [2, 2]],
    ["innerWidth", 'if (innerWidth > 860) { ' + DUP + ' }', [2, 1]]
  ];
  for (const [name, code, want] of dups) {
    for (const phone of [false, true]) {
      const w = await run('document.querySelector("header .hdr-tools").appendChild(Object.assign(document.createElement("button"), { className: "theme-btn" }));' + code, phone);
      const got = dupCount(w);
      if (got !== want[phone ? 1 : 0] || w.errors.length) bad.push(name + " at " + (phone ? 390 : 1280) + ": " + got + " theme buttons, want " + want[phone ? 1 : 0] + (w.errors.length ? " (" + w.errors[0] + ")" : ""));
    }
  }
  // Ordinary page code must not trip the recorder.
  const clean = await run([
    'var h = document.querySelector("header, .site-header"); h.classList.add("x"); h.classList.toggle("y", true); h.classList.contains("x");',
    'h.setAttribute("data-a", "1"); h.dataset.k = "v"; var dv = h.dataset.k + (h.dataset.none === undefined ? "" : "!");',
    'h.style.display = "none"; var c = h.style.color; h.style.setProperty("--x", "1");',
    'Object.keys({ a: 1 }).forEach(function () {}); ({}).hasOwnProperty("a"); Array.prototype.slice.call(document.querySelectorAll("a"));',
    'localStorage.getItem("aia_ws"); sessionStorage.setItem("k", "v"); var p = location.pathname + location.search + navigator.userAgent;',
    'window.hasOwnProperty("matchMedia"); globalThis.hasOwnProperty("Promise"); var inw = "matchMedia" in window;',
    'var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; window.matchMedia("(max-width: 860px)").addEventListener("change", function () {});',
    'var sw = screen.width + devicePixelRatio + performance.now(); document.addEventListener("click", function (e) { var t = e.target; });',
    'document.body.click(); window.addEventListener("pageshow", function (e) { var q = e.persisted; });',
    'Promise.resolve(h).then(function () {}); JSON.stringify({ a: 1 }); String(h); var tt = typeof requestAnimationFrame;'
  ].join("\n"), false);
  if (clean.errors.length) bad.push("ordinary page code was recorded: " + clean.errors.join(" | "));
  if (bad.length) fail("check-header strict host self-test: " + bad.join("; "));
  else pass("check-header strict host self-test (" + trips.length + " unmodelled reads, own-key reflections and bad media queries recorded; " + dups.length + " width/media/screen duplicates shown at 1280 and 390; ordinary page code clean)");
}
function staticDom(file) {
  const d = makeWindow(fs.readFileSync(path.join(root, file), "utf8"), "/" + file.replace(/\.html$/, ""), false).document;
  const tag = file + " (source)";
  const bad = [];
  if (d.querySelectorAll("header").length !== 1) bad.push("header count " + d.querySelectorAll("header").length);
  const brands = d.querySelectorAll(".brand");
  if (brands.length !== 1) bad.push(".brand count " + brands.length);
  else {
    if (brands[0].tagName !== "A") bad.push(".brand is not a link");
    if (!homeHref(brands[0].getAttribute("href") || "")) bad.push(".brand does not go home");
    if (!brands[0].closest("header")) bad.push(".brand is not in the header");
  }
  if (d.querySelectorAll(".brand-mark").length !== 1) bad.push(".brand-mark count " + d.querySelectorAll(".brand-mark").length);
  if (d.querySelectorAll(".brand-name").length !== 1) bad.push(".brand-name count " + d.querySelectorAll(".brand-name").length);
  const h = d.querySelector("header");
  if (h && h.querySelectorAll("nav").length > 1) bad.push("more than one nav in the header");
  const themeTags = d.querySelectorAll("script[src]").filter(function (s) { return /(^|\/)theme\.js(\?|#|$)/.test(s.getAttribute("src")); }).length;
  if (themeTags !== 1) bad.push("theme.js script tags " + themeTags);
  const ids = {};
  d.querySelectorAll("[id]").forEach(function (e) { ids[e.id] = (ids[e.id] || 0) + 1; });
  const dup = Object.keys(ids).filter(function (k) { return ids[k] > 1; });
  if (dup.length) bad.push("repeated ids " + dup.join(","));
  if (bad.length) fail(tag + ": " + bad.join("; "));
  else pass(tag + " one header, one brand link home, one mark, one name, no repeated ids");
}
function renderedChecks(file, opts, d, early) {
  const tag = file + " (" + (opts.signedIn ? "signed in" : "signed out") + ", " + (opts.phone ? "phone" : "desktop") + (opts.twice ? ", theme.js twice" : "") + ")";
  const bad = [];
  const n = function (sel) { return d.querySelectorAll(sel).length; };
  const h = d.querySelector("header");
  if (n("header") !== 1 || n("header, .site-header") !== 1 || !h) { fail(tag + ": header count " + n("header") + ", with .site-header " + n("header, .site-header")); return; }
  [[".brand", 1], [".brand-mark", 1], [".brand-name", 1], [".brand-short", 1], [".theme-btn", 1], ["[data-theme-btn], .theme-btn", 1], ["#aia-header-lock", 1], ["#aia-ui-fix-link", 1]].forEach(function (pair) {
    if (n(pair[0]) !== pair[1]) bad.push(pair[0] + " count " + n(pair[0]));
  });
  if (h.querySelectorAll(".hdr-tools").length !== 1) bad.push(".hdr-tools count " + h.querySelectorAll(".hdr-tools").length);
  const brand = d.querySelector(".brand");
  if (brand && (brand.tagName !== "A" || !h.contains(brand))) bad.push("brand is not a header link");
  if (brand && brand.querySelectorAll(".brand-mark, .brand-name, .brand-short").length !== 3) bad.push("brand mark/name/AIA not inside the brand link");
  if (brand && !homeHref(brand.getAttribute("href") || "")) bad.push("brand link goes to " + brand.getAttribute("href") + " after theme.js, not home");
  if (brand && brand.querySelectorAll("img").length !== 1) bad.push("brand has " + brand.querySelectorAll("img").length + " images");
  if (h.querySelectorAll("img.brand-mark, img.aia-mark").length !== 1) bad.push("header logo count " + h.querySelectorAll("img.brand-mark, img.aia-mark").length);
  if (brand && (brand.textContent.match(/Automate It Away/g) || []).length !== 1) bad.push("brand says Automate It Away " + (brand.textContent.match(/Automate It Away/g) || []).length + " times");
  const tools = h.querySelector(".hdr-tools");
  const btn = d.querySelector("[data-theme-btn], .theme-btn");
  if (btn && tools && btn.parentNode !== tools) bad.push("theme button not in the tools row");
  const chips = d.querySelectorAll(".who-chip");
  const linkText = function (re) { return Array.prototype.filter.call(h.querySelectorAll("a"), function (a) { return re.test(a.textContent || ""); }).length; };
  const signIn = linkText(/Sign in to your Queue/);
  const openMine = Array.prototype.filter.call(h.querySelectorAll("a, button"), function (a) { return /Open my Queue/.test(a.textContent || ""); }).length;
  const home = d.querySelectorAll("#queue-home-link");
  const loginOut = file === "login.html" && !opts.signedIn;
  if (loginOut) {
    if (chips.length !== 0) bad.push("login page shows an account chip next to its own Open a Queue");
    if (linkText(/Open a Queue/) !== 1) bad.push("Open a Queue shown " + linkText(/Open a Queue/) + " times");
  } else {
    if (chips.length !== 1) bad.push(".who-chip count " + chips.length);
    else if (tools && chips[0].parentNode !== tools) bad.push("account chip not in the tools row");
    if (chips.length && chips[0].tagName !== "A") bad.push("account chip is not a link");
  }
  if (opts.signedIn) {
    if (home.length !== 1) bad.push("Open my Queue count " + home.length);
    else if (home[0].getAttribute("href") !== "/desk" || !/Open my Queue/.test(home[0].textContent || "")) bad.push("queue link does not open /desk");
    if (openMine !== 1) bad.push("Open my Queue shown " + openMine + " times in the header");
    if (signIn !== 0) bad.push("signed in but header still says Sign in to your Queue (" + signIn + ")");
    if (chips.length === 1 && chips[0].classList.contains("signed-out")) bad.push("signed in chip marked signed-out");
  } else {
    if (home.length !== 0 || openMine !== 0) bad.push("signed out but header shows Open my Queue");
    if (signIn !== (loginOut ? 0 : 1)) bad.push("Sign in to your Queue shown " + signIn + " times");
  }
  if (opts.phone && (early.lock !== 1 || early.btn !== 1)) bad.push("phone header not painted before DOMContentLoaded (lock " + early.lock + ", theme button " + early.btn + ")");
  const ids = {};
  d.querySelectorAll("[id]").forEach(function (e) { ids[e.id] = (ids[e.id] || 0) + 1; });
  const dup = Object.keys(ids).filter(function (k) { return ids[k] > 1; });
  if (dup.length) bad.push("repeated ids " + dup.join(","));
  if (bad.length) fail(tag + ": " + bad.join("; "));
  else pass(tag + " one of each header item");
}

(async function () {
  selfTest();
  await stubSelfTest();
  await hostSelfTest();
  let rendered = 0;
  for (const file of files.slice().sort()) {
    staticDom(file);
    for (const signedIn of [false, true]) {
      for (const phone of [false, true]) {
        for (const twice of [false, true]) {
          const opts = { signedIn: signedIn, phone: phone, twice: twice };
          let w;
          try {
            w = await renderPage(file, opts);
          } catch (e) {
            fail(file + " theme.js render threw: " + (e && e.message));
            continue;
          }
          renderedChecks(file, opts, w.document, w.early);
          rendered += 1;
        }
      }
    }
  }
  if (files.length < 30) fail("expected 30+ pages, found " + files.length);
  if (rendered !== files.length * 8) fail("rendered " + rendered + " of " + files.length * 8);
  else pass("rendered " + rendered + " page states (" + files.length + " pages x signed in/out x desktop/phone x once/twice)");

  if (process.exitCode) {
    console.error("check-header failed");
    process.exit(1);
  }
  console.log("check-header passed");
})().catch(function (e) {
  console.error("FAIL check-header crashed: " + (e && e.stack || e));
  process.exit(1);
});
