require("./_env-guard");
// Unlist on /create: the #mine button must be in #form or have form=,
// and tapping it must fire the existing unlist-pack request.
const fs = require("fs");
const path = require("path");

// Portable document + event tree sufficient to boot create-desk.js and tap Unlist.
function makeEl(tag, attrs) {
  attrs = attrs || {};
  const classSet = new Set(String(attrs.class || attrs.className || "").split(/\s+/).filter(Boolean));
  const el = {
    tagName: String(tag || "div").toUpperCase(),
    attrs: Object.assign({}, attrs),
    children: [],
    parentNode: null,
    style: { display: attrs.style && /display:none/.test(attrs.style) ? "none" : "" },
    hidden: false,
    disabled: false,
    value: attrs.value || "",
    text: "",
    html: "",
    listeners: Object.create(null),
    ownerDocument: null,
    classList: {
      _set: classSet,
      add(c) { classSet.add(c); },
      remove(c) { classSet.delete(c); },
      contains(c) { return classSet.has(c); },
      toggle(c, force) {
        if (force === true) classSet.add(c);
        else if (force === false) classSet.delete(c);
        else if (classSet.has(c)) classSet.delete(c); else classSet.add(c);
        return classSet.has(c);
      }
    },
    get id() { return this.attrs.id || ""; },
    set id(v) { this.attrs.id = v; },
    get className() { return Array.from(classSet).join(" "); },
    set className(v) { classSet.clear(); String(v || "").split(/\s+/).filter(Boolean).forEach((c) => classSet.add(c)); },
    get textContent() { return this.text || this.children.map((c) => c.textContent).join(""); },
    set textContent(v) { this.text = String(v || ""); this.children = []; this.html = this.text; },
    get innerHTML() { return this.html || this.children.map((c) => c.outerHTML || c.textContent).join(""); },
    set innerHTML(v) {
      this.html = String(v || "");
      this.text = this.html.replace(/<[^>]+>/g, "");
      const kids = parseFragment(this.html, this.ownerDocument);
      kids.forEach((k) => { k.parentNode = this; k.ownerDocument = this.ownerDocument; });
      this.children = kids;
      if (this.ownerDocument) this.ownerDocument._index(this);
    },
    get outerHTML() { return "<" + this.tagName.toLowerCase() + ">" + this.innerHTML + "</" + this.tagName.toLowerCase() + ">"; },
    getAttribute(k) {
      if (k === "class") return this.className;
      const v = this.attrs[k];
      return v == null ? null : String(v);
    },
    setAttribute(k, v) {
      if (k === "class") this.className = v;
      else this.attrs[k] = v;
    },
    hasAttribute(k) { return this.getAttribute(k) != null; },
    contains(n) {
      if (n === this) return true;
      return this.children.some((c) => c.contains && c.contains(n));
    },
    appendChild(n) {
      if (!n) return n;
      if (n.parentNode && n.parentNode.removeChild) n.parentNode.removeChild(n);
      n.parentNode = this;
      n.ownerDocument = this.ownerDocument;
      this.children.push(n);
      if (this.ownerDocument) this.ownerDocument._index(n);
      return n;
    },
    removeChild(n) {
      this.children = this.children.filter((c) => c !== n);
      if (n) n.parentNode = null;
      return n;
    },
    closest(sel) {
      let n = this;
      while (n) {
        if (matchSel(n, sel)) return n;
        n = n.parentNode;
      }
      return null;
    },
    querySelector(sel) {
      if (matchSel(this, sel)) return this;
      for (const c of this.children) {
        const hit = c.querySelector && c.querySelector(sel);
        if (hit) return hit;
      }
      return null;
    },
    querySelectorAll(sel) {
      const out = [];
      if (matchSel(this, sel)) out.push(this);
      this.children.forEach((c) => { if (c.querySelectorAll) out.push.apply(out, c.querySelectorAll(sel)); });
      return out;
    },
    addEventListener(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
    },
    dispatchEvent(ev) {
      ev.target = ev.target || this;
      const path = [];
      let n = this;
      while (n) { path.push(n); n = n.parentNode; }
      for (const node of path) {
        ev.currentTarget = node;
        const fns = (node.listeners[ev.type] || []).slice();
        for (const fn of fns) fn.call(node, ev);
        if (ev.cancelBubble) break;
      }
      return !ev.defaultPrevented;
    },
    click() {
      this.dispatchEvent({ type: "click", bubbles: true, cancelable: true, preventDefault() { this.defaultPrevented = true; }, defaultPrevented: false });
    },
    reset() {},
    scrollIntoView() {}
  };
  return el;
}

function matchSel(el, sel) {
  if (!el || !sel) return false;
  if (sel.charAt(0) === "#") return el.id === sel.slice(1);
  if (sel.charAt(0) === ".") return el.classList.contains(sel.slice(1));
  if (sel.charAt(0) === "[") {
    const m = sel.match(/^\[([^\=\]]+)(?:=\"([^\"]*)\")?\]$/);
    if (!m) return false;
    const v = el.getAttribute(m[1]);
    return m[2] === undefined ? v != null : v === m[2];
  }
  return el.tagName === sel.toUpperCase();
}

function parseFragment(html, doc) {
  const kids = [];
  const re = /<([a-zA-Z0-9]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9]+)([^>]*)\/?>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) {
      const el = elFromTag(m[1], m[2], doc);
      const inner = m[3] || "";
      if (/<[a-zA-Z]/.test(inner)) {
        parseFragment(inner, doc).forEach((c) => el.appendChild(c));
        el.html = inner;
      } else {
        el.text = inner;
        el.html = inner;
      }
      kids.push(el);
    } else if (m[4]) {
      kids.push(elFromTag(m[4], m[5], doc));
    } else if (m[6] && m[6].trim()) {
      const t = makeEl("span", {});
      t.ownerDocument = doc;
      t.text = m[6];
      kids.push(t);
    }
  }
  return kids;
}

function elFromTag(tag, attrStr, doc) {
  const attrs = {};
  String(attrStr || "").replace(/([:a-zA-Z0-9_-]+)=\"([^\"]*)\"/g, (_, k, v) => { attrs[k] = v; return _; });
  const el = makeEl(tag, attrs);
  el.ownerDocument = doc;
  return el;
}

function documentFromCreateHtml(html) {
  const ids = Object.create(null);
  const classes = Object.create(null);
  const root = makeEl("body", {});
  const doc = {
    readyState: "complete",
    body: root,
    documentElement: root,
    _ids: ids,
    getElementById(id) { return ids[id] || null; },
    querySelector(sel) { return root.querySelector(sel); },
    querySelectorAll(sel) { return root.querySelectorAll(sel); },
    createElement(tag) { const el = makeEl(tag, {}); el.ownerDocument = doc; return el; },
    addEventListener() {},
    _index(node) {
      if (node && node.id) ids[node.id] = node;
      if (node && node.children) node.children.forEach((c) => doc._index(c));
    }
  };
  root.ownerDocument = doc;
  html.replace(/<([a-zA-Z0-9]+)([^>]*)/g, (_, tag, attr) => {
    if (!/\bid="/.test(attr) && !/\bclass="/.test(attr)) return _;
    const el = elFromTag(tag, attr, doc);
    if (el.id) ids[el.id] = el;
    root.appendChild(el);
    const cls = el.className;
    if (cls) cls.split(/\s+/).forEach((c) => { (classes[c] = classes[c] || []).push(el); });
    return _;
  });
  function find(sel) {
    if (sel.charAt(0) === "#") return ids[sel.slice(1)] || null;
    if (sel.charAt(0) === ".") return (classes[sel.slice(1)] || [])[0] || null;
    return root.querySelector(sel);
  }
  doc.querySelector = find;
  // form and mine parentage from source HTML
  const form = ids.form;
  const mine = ids.mine;
  const formAt = html.search(/<form[^>]*id="form"/);
  const formEnd = html.indexOf("</form>", formAt);
  const mineAt = html.search(/id="mine"/);
  if (form && mine) {
    if (mine.parentNode) mine.parentNode.removeChild(mine);
    if (formAt >= 0 && formEnd > formAt && mineAt > formAt && mineAt < formEnd) {
      form.appendChild(mine);
    } else {
      const wrap = makeEl("details", {});
      wrap.ownerDocument = doc;
      if (form.parentNode) form.parentNode.removeChild(form);
      wrap.appendChild(form);
      wrap.appendChild(mine);
      root.appendChild(wrap);
    }
  }
  return doc;
}

async function tapUnlist(createHtml, createJs) {
  const posts = [];
  const doc = documentFromCreateHtml(createHtml);
  const jsonRes = (body, status) => {
    const text = JSON.stringify(body == null ? {} : body);
    return {
      ok: (status || 200) >= 200 && (status || 200) < 300,
      status: status || 200,
      json: async () => JSON.parse(text),
      text: async () => text
    };
  };
  const local = Object.create(null);
  local.aia_ws = "rivera-resale";
  local.aia_session = "tok-test";
  local.aia_pin = "1234";
  const window = {
    document: doc,
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(local, k) ? local[k] : null; },
      setItem(k, v) { local[k] = String(v); },
      removeItem(k) { delete local[k]; }
    },
    location: { search: "?kind=pack", hash: "", href: "https://aia.test/create?kind=pack", origin: "https://aia.test", pathname: "/create" },
    navigator: { clipboard: { writeText: async () => {} } },
    fetch: async function (url, opts) {
      const u = String(url);
      let body = null;
      try { body = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) { body = opts && opts.body; }
      posts.push({ u, method: (opts && opts.method) || "GET", body });
      if (/\/api\/desks\?packs=/.test(u)) {
        return jsonRes({ packs: [{ id: "pack-mine-1", name: "Saturday oil change", official: false, priced: false, ask: 0, family: "desk", does: "Photo in." }] });
      }
      if (/\/api\/health/.test(u)) return jsonRes({ ok: true, automation: { drafts: { included: false } } });
      if (body && body.action === "unlist-pack") return jsonRes({ ok: true, note: "Pack is private again." });
      return jsonRes({ ok: true });
    },
    addEventListener() {},
    matchMedia() { return { matches: false, addListener() {}, addEventListener() {}, removeEventListener() {}, removeListener() {}, dispatchEvent() { return false; } }; },
    AIADesks: undefined,
    AIASetupCards: undefined,
    URLSearchParams: URLSearchParams,
    FormData: function () { return { get() { return ""; } }; },
    AbortController: AbortController,
    setTimeout,
    clearTimeout,
    Promise,
    console
  };
  doc.defaultView = window;
  window.window = window;
  window.eval = function (code) { return vmRun(code, window); };
  vmRun(createJs, window);
  await new Promise((r) => setTimeout(r, 40));
  const form = doc.getElementById("form");
  const mine = doc.getElementById("mine");
  const btn = (mine && mine.querySelector("[data-unlist]")) || doc.querySelector("[data-unlist]");
  const associated = !!(btn && form && (form.contains(btn) || btn.getAttribute("form") === "form"));
  if (btn) {
    btn.dispatchEvent({
      type: "click",
      bubbles: true,
      cancelable: true,
      target: btn,
      preventDefault() { this.defaultPrevented = true; },
      defaultPrevented: false
    });
    await new Promise((r) => setTimeout(r, 40));
  }
  const unlistPosts = posts.filter((p) => p.body && p.body.action === "unlist-pack");
  const ok = doc.getElementById("ok");
  return {
    btn: !!btn,
    associated,
    formAttr: btn && btn.getAttribute("form"),
    inForm: !!(form && btn && form.contains(btn)),
    fired: unlistPosts.length > 0 && unlistPosts[0].body.id === "pack-mine-1" && /\/api\/desks/.test(unlistPosts[0].u),
    note: ok && String(ok.textContent || ""),
    posts: unlistPosts
  };
}

function vmRun(code, window) {
  const vm = require("vm");
  const ctx = {
    window,
    document: window.document,
    localStorage: window.localStorage,
    location: window.location,
    navigator: window.navigator,
    fetch: window.fetch,
    console: window.console,
    URLSearchParams: window.URLSearchParams,
    FormData: window.FormData,
    AbortController: window.AbortController,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    Promise: window.Promise,
    AIADesks: undefined,
    AIASetupCards: undefined
  };
  ctx.window = window;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  // Script uses bare document, fetch, localStorage, location, window
  vm.runInContext(code, ctx, { filename: "create-desk.js" });
  return ctx;
}

module.exports = { tapUnlist };

const root = path.join(__dirname, "..");
function fail(msg) { console.error("FAIL " + msg); process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }

function applyUnlistMutant(kind, html, js) {
  let nextHtml = html;
  let nextJs = js;
  if (kind === "Unlist button outside the form with no form attr") {
    nextJs = nextJs.replace(/ form="form"/g, "").replace(/if \(mine\) form\.appendChild\(mine\);?/g, "");
    const formAt = nextHtml.search(/<form[^>]*id="form"/);
    const formEnd = nextHtml.indexOf("</form>", formAt);
    const mineAt = nextHtml.search(/id="mine"/);
    if (formAt >= 0 && formEnd > formAt && mineAt > formAt && mineAt < formEnd) {
      const mineOpen = nextHtml.lastIndexOf("<", mineAt);
      const mineEnd = nextHtml.indexOf("</div>", mineAt);
      const mineClose = mineEnd >= 0 ? mineEnd + 6 : mineAt;
      const mineBlock = nextHtml.slice(mineOpen, mineClose);
      nextHtml = nextHtml.slice(0, mineOpen) + nextHtml.slice(mineClose);
      const end = nextHtml.indexOf("</form>", formAt);
      nextHtml = nextHtml.slice(0, end + 7) + "\n    " + mineBlock + nextHtml.slice(end + 7);
    }
  } else if (kind === "Unlist handler removed") {
    nextJs = nextJs.replace(/\n    if \(mine\) mine\.addEventListener\("click", async \(e\) => \{\n      const unlist = e\.target\.closest\("\[data-unlist\]"\);\n      if \(!unlist\) return;\n      e\.preventDefault\(\);\n      await unlistPack\(unlist\.getAttribute\("data-unlist"\)\);\n    \}\);/g, "");
    nextJs = nextJs.replace(/\n      const unlist = e\.target\.closest\("\[data-unlist\]"\);\n      if \(unlist\) \{\n        e\.preventDefault\(\);\n        await unlistPack\(unlist\.getAttribute\("data-unlist"\)\);\n        return;\n      \}/g, "");
  }
  return { html: nextHtml, js: nextJs };
}

async function unlistFaults(html, js) {
  const tap = await tapUnlist(html, js);
  const bad = [];
  if (!tap.associated) bad.push("Unlist button outside the form with no form attr");
  if (!tap.fired) bad.push("Unlist handler removed");
  return { bad: unique(bad), tap };
}

function unique(rows) {
  const out = [];
  rows.forEach(function (row) { if (out.indexOf(row) < 0) out.push(row); });
  return out;
}

async function main() {
  const createHtml = fs.readFileSync(path.join(root, "create.html"), "utf8");
  const createJs = fs.readFileSync(path.join(root, "create-desk.js"), "utf8");
  const live = await unlistFaults(createHtml, createJs);
  if (!live.tap.btn) fail("create.html #mine must paint an Unlist button for a listed pack");
  else pass("create.html #mine paints an Unlist button for a listed pack");
  if (live.bad.length) fail("Unlist on /create drifted: " + live.bad.join("; "));
  else pass("Unlist tap posts unlist-pack and the button is in #form or has form=");
  if (!live.tap.fired || !live.tap.posts[0] || live.tap.posts[0].u !== "/api/desks" || live.tap.posts[0].body.action !== "unlist-pack") {
    fail("Unlist must still POST /api/desks action unlist-pack");
  } else pass("Unlist still POSTs /api/desks action unlist-pack");
  if (!/Pack is private again/.test(live.tap.note || "")) {
    fail("Unlist must still use the existing confirmation path");
  } else pass("Unlist still uses the existing confirmation path");

  const mutants = ["Unlist button outside the form with no form attr", "Unlist handler removed"];
  let caught = 0;
  for (const kind of mutants) {
    const next = applyUnlistMutant(kind, createHtml, createJs);
    if (next.html === createHtml && next.js === createJs) {
      fail("mutant does not apply: " + kind);
      continue;
    }
    const faults = await unlistFaults(next.html, next.js);
    if (faults.bad.indexOf(kind) < 0) fail("mutant missed: " + kind + " (got " + JSON.stringify(faults.bad) + ")");
    else { caught += 1; pass("mutant caught: " + kind); }
  }
  if (caught !== mutants.length) fail("Unlist mutants: " + caught + "/" + mutants.length + " caught");
  else pass("Unlist mutants: " + caught + "/" + mutants.length + " caught");
}

module.exports = { tapUnlist };

if (require.main !== module) {
  const { spawnSync } = require("child_process");
  const r = spawnSync(process.execPath, [__filename], { stdio: "inherit" });
  if (r.status) process.exitCode = r.status || 1;
} else {
  main().catch((err) => {
    fail(err && err.stack || String(err));
    process.exit(1);
  });
}
