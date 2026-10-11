#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const helpers = require(path.join(root, "escape-html.js"));

const QUOTE = "x');alert(11)//";
const IMG = "\"><img src=x onerror=alert(1)>";
const JSURL = "javascript:alert(1)";
const PAYLOADS = [QUOTE, IMG, JSURL];

function fail(msg) {
  console.error("check-rules-xss: " + msg);
  process.exit(1);
}

function htmlEscape(value) {
  return helpers.escapeHtml(value);
}

function El(tag) {
  this.tag = tag || "";
  this.id = "";
  this.className = "";
  this.hidden = false;
  this.type = "";
  this.value = "";
  this.checked = false;
  this.disabled = false;
  this.children = [];
  this.parent = null;
  this.attrs = {};
  this.listeners = {};
  this._text = "";
  this._html = "";
  this.style = {};
}

El.prototype.setAttribute = function (name, value) {
  this.attrs[name] = String(value);
};
El.prototype.getAttribute = function (name) {
  return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
};
El.prototype.appendChild = function (child) {
  child.parent = this;
  this.children.push(child);
  this._html = "";
  return child;
};
El.prototype.replaceChildren = function () {
  this.children.forEach(function (child) { child.parent = null; });
  this.children = [];
  this._text = "";
  this._html = "";
  for (let i = 0; i < arguments.length; i++) this.appendChild(arguments[i]);
};
El.prototype.addEventListener = function (type, fn) {
  (this.listeners[type] = this.listeners[type] || []).push(fn);
};
El.prototype.focus = function () {};
El.prototype.closest = function (sel) {
  let node = this;
  while (node) {
    if (matches(node, sel)) return node;
    node = node.parent;
  }
  return null;
};
Object.defineProperty(El.prototype, "textContent", {
  get: function () {
    if (this.children.length) return this.children.map(function (child) { return child.textContent; }).join("");
    return this._text;
  },
  set: function (value) {
    this._text = String(value == null ? "" : value);
    this.children.forEach(function (child) { child.parent = null; });
    this.children = [];
    this._html = "";
  }
});
Object.defineProperty(El.prototype, "innerHTML", {
  get: function () { return this._html; },
  set: function (value) {
    this._html = String(value == null ? "" : value);
    this.children.forEach(function (child) { child.parent = null; });
    this.children = [];
    this._text = "";
  }
});

function matches(el, sel) {
  if (!el || !el.tag) return false;
  if (sel === "button[data-rule-act]") return el.tag === "button" && !!el.attrs["data-rule-act"];
  return false;
}

function serialize(el) {
  if (!el || !el.tag) return "";
  let attrs = "";
  if (el.className) attrs += " class=\"" + htmlEscape(el.className) + "\"";
  Object.keys(el.attrs).forEach(function (name) {
    attrs += " " + name + "=\"" + htmlEscape(el.attrs[name]) + "\"";
  });
  let inner = "";
  if (el.children.length) inner = el.children.map(serialize).join("");
  else if (el._html) inner = el._html;
  else inner = htmlEscape(el._text || "");
  return "<" + el.tag + attrs + ">" + inner + "</" + el.tag + ">";
}

function walk(el, visit) {
  visit(el);
  (el.children || []).forEach(function (child) { walk(child, visit); });
}

function assertInert(html, where) {
  if (typeof html !== "string") fail(where + " did not render");
  if (/<script[\s>/]/i.test(html)) fail(where + " rendered a script tag");
  if (/<img\b[^>]*\sonerror\s*=/i.test(html)) fail(where + " rendered an img onerror handler");
  if (/\s(?:href|src)\s*=\s*["']\s*(?:javascript|vbscript|data):/i.test(html)) fail(where + " rendered a javascript: link");
  if (/\sonclick\s*=/i.test(html)) fail(where + " put a value in an onclick handler");
  if (html.indexOf(IMG) >= 0) fail(where + " left the img payload raw");
  if (html.indexOf("<script") >= 0) fail(where + " left a script tag raw");
}

const rulesPage = fs.readFileSync(path.join(root, "rules.html"), "utf8");
if (/onclick\s*=\s*["'][^"']*(?:editRule|toggleWidget|removeRule)\s*\(/.test(rulesPage)) {
  fail("rules.html still calls Edit, Widget, or Remove from an onclick string");
}
if (rulesPage.indexOf("escape-html.js") < 0) fail("rules.html must load the shared escapeHtml helper");
if (rulesPage.indexOf("data-rule-id") < 0 || rulesPage.indexOf("addEventListener") < 0) {
  fail("rules.html must bind rule actions from data attributes");
}

const scriptMatch = rulesPage.match(/<script src="escape-html\.js"><\/script>\s*<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) fail("rules.html inline script not found");

const store = {};
const nodes = {};
const posts = [];
let rulesBody = [];

function make(id) {
  const el = new El(id ? "div" : "");
  el.id = id || "";
  return el;
}

const ctx = {
  console: console,
  setTimeout: function () {},
  clearTimeout: function () {},
  localStorage: {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : ""; },
    setItem: function (key, value) { store[key] = String(value); }
  },
  location: { search: "", href: "http://127.0.0.1:3000/rules" },
  escapeHtml: helpers.escapeHtml,
  safeUrl: helpers.safeUrl,
  safeId: helpers.safeId
};
ctx.AIADesks = {
  shopOpen: function () { return true; },
  current: function () { return { name: "Shop" }; },
  widgetHref: function () { return "/drop?ws=shop"; },
  slugify: function (value) { return String(value || "").trim(); },
  nounsOf: function () {
    return { capture: "Capture", qualify: "Qualify", do: "Do", collect: "Collect", follow: "Follow" };
  },
  defaultNouns: function () { return this.nounsOf(); }
};
ctx.fetch = function (url, opts) {
  const method = (opts && opts.method) || "GET";
  const target = String(url);
  if (method !== "GET") posts.push({ url: target, body: opts && opts.body });
  let data = {};
  if (target.indexOf("/api/rules") >= 0 && method === "GET") {
    data = { rules: rulesBody, ais: rulesBody.map(function (rule, i) {
      return { id: PAYLOADS[i] || rule.id, name: rule.text };
    }), canAdd: true, nouns: ctx.AIADesks.nounsOf(), widgetsOn: rulesBody.filter(function (rule) {
      return rule.widget && rule.widget.on;
    }).length };
  } else if (target.indexOf("/api/auth") >= 0) {
    data = { you: { role: "owner", name: "Ada" }, workspace: { name: "Shop", nouns: ctx.AIADesks.nounsOf() } };
  }
  return Promise.resolve({
    status: 200,
    json: function () { return Promise.resolve(data); }
  });
};
ctx.document = {
  readyState: "complete",
  addEventListener: function () {},
  getElementById: function (id) {
    if (!nodes[id]) nodes[id] = make(id);
    return nodes[id];
  },
  createElement: function (tag) { return new El(tag); },
  querySelector: function (sel) {
    if (sel === "#rule-add .go") {
      const add = nodes["rule-add"];
      if (!add) return null;
      return add.children.filter(function (child) {
        return String(child.className || "").split(/\s+/).indexOf("go") >= 0;
      })[0] || null;
    }
    return null;
  },
  querySelectorAll: function () { return []; }
};
ctx.window = ctx;

const add = ctx.document.getElementById("rule-add");
const go = ctx.document.createElement("button");
go.className = "go";
go.type = "button";
go.textContent = "Add a rule";
add.appendChild(go);

vm.runInNewContext(scriptMatch[1], ctx);
if (typeof ctx.paintRules !== "function") fail("paintRules must stay callable");
if (typeof ctx.editRule !== "function" || typeof ctx.toggleWidget !== "function" || typeof ctx.removeRule !== "function") {
  fail("Edit, Widget, and Remove handlers must stay on the page");
}

rulesBody = PAYLOADS.map(function (payload, i) {
  return {
    id: payload,
    text: "Name " + payload,
    when: "drop",
    then: i === 1 ? "draft" : "note",
    contains: payload,
    tag: payload,
    widget: { on: i === 1, label: payload },
    aiName: payload,
    aiId: payload
  };
});

function buttons() {
  const found = [];
  walk(nodes["rule-list"], function (el) {
    if (el.tag === "button" && el.attrs["data-rule-act"]) found.push(el);
  });
  return found;
}

function button(act, id) {
  return buttons().filter(function (el) {
    return el.attrs["data-rule-act"] === act && el.attrs["data-rule-id"] === id;
  })[0];
}

function click(el) {
  const event = { target: el };
  const chain = [];
  let node = el;
  while (node) {
    chain.push(node);
    node = node.parent;
  }
  chain.forEach(function (current) {
    (current.listeners.click || []).slice().forEach(function (fn) { fn(event); });
  });
}

function flush() {
  return new Promise(function (resolve) { setImmediate(resolve); });
}

ctx.document.getElementById("ws").value = "shop";

ctx.load().then(function () {
  const list = nodes["rule-list"];
  if (!list) fail("rule list was not painted");
  const html = serialize(list);
  assertInert(html, "rules list");
  PAYLOADS.forEach(function (payload) {
    if (html.indexOf(payload) >= 0 && payload === IMG) fail("rules list left the img payload raw");
    const titleHit = [];
    walk(list, function (el) {
      if (el.tag === "b" && el.textContent === "Name " + payload) titleHit.push(el);
      if (el.tag === "img" || el.tag === "script") fail("a rule name became a live " + el.tag + " element");
    });
    if (!titleHit.length) fail("rule name was not rendered as text: " + payload);
  });

  const aiHtml = nodes["rule-ai"] && nodes["rule-ai"].innerHTML;
  assertInert(aiHtml || "", "desk AI picker");
  if (!aiHtml || aiHtml.indexOf(htmlEscape(IMG)) < 0) fail("desk AI names must be escaped");

  PAYLOADS.forEach(function (payload, i) {
    ["edit", "widget", "remove"].forEach(function (act) {
      const el = button(act, payload);
      if (!el) fail(act + " is missing for " + payload);
      if (el.getAttribute("data-rule-id") !== payload) fail(act + " is not bound to the real rule id");
      if (el.attrs.onclick) fail(act + " still has an onclick attribute");
    });
    const widget = button("widget", payload);
    const wantOn = i !== 1;
    if (widget.textContent !== (wantOn ? "Widget on" : "Widget off")) {
      fail("widget button label drifted for " + payload);
    }
    if (widget.getAttribute("data-widget-on") !== (wantOn ? "true" : "false")) {
      fail("widget button would toggle the wrong state");
    }
    if (button("edit", payload).textContent !== "Edit") fail("Edit label drifted");
    if (button("remove", payload).textContent !== "Remove") fail("Remove label drifted");
  });

  PAYLOADS.forEach(function (payload) {
    click(button("edit", payload));
    if (nodes["rule-text"].value !== "Name " + payload) fail("Edit did not open the named rule");
    if (nodes["rule-contains"].value !== payload) fail("Edit did not keep that rule's fields");
    const save = ctx.document.querySelector("#rule-add .go");
    if (!save || save.textContent !== "Save rule") fail("Edit did not switch the form to Save rule");
  });

  const before = posts.length;
  click(button("widget", QUOTE));
  click(button("widget", IMG));
  click(button("remove", JSURL));
  return flush().then(function () { return flush(); }).then(function () {
    const next = posts.slice(before).map(function (row) {
      return JSON.parse(row.body);
    });
    const widgetQuote = next.filter(function (body) { return body.action === "widget" && body.id === QUOTE; })[0];
    const widgetImg = next.filter(function (body) { return body.action === "widget" && body.id === IMG; })[0];
    const removed = next.filter(function (body) { return body.action === "remove" && body.id === JSURL; })[0];
    if (!widgetQuote || widgetQuote.on !== true) fail("Widget on did not act on the quote-break rule");
    if (!widgetImg || widgetImg.on !== false) fail("Widget off did not act on the img rule");
    if (!removed) fail("Remove did not act on the javascript: rule");
    console.log("check-rules-xss: ok");
  });
}).catch(function (err) {
  fail(err && err.stack ? err.stack : String(err));
});
