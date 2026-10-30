require("./_env-guard");
// Queue sign-in is an account login. The Queue page lists every desk.
// Shop name + code still opens that one desk with ?workspace= on the same Queue.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const main = "813dfc0cf0fc98d9cd2ad92b897104bdd58bd629";
let bad = 0;
let okN = 0;
function fail(msg) { bad += 1; console.error("FAIL " + msg); }
function ok(msg) { okN += 1; console.log("ok " + msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const BAD = [
  /desk login/i,
  /sign in to your desk/i,
  /sign-in to your desk/i,
  /sign in to this desk/i,
  /sign in to the desk/i,
  /desk sign-in/i,
  /desk sign in/i
];
const COPY_FILES = [
  "login.html",
  "onboard.html",
  "help.html",
  "theme.js",
  "legal.html",
  "examples.html",
  "setup.html",
  "doors.js",
  "login-doors.js",
  "queue-login.js"
];
COPY_FILES.forEach(function (name) {
  const text = read(name);
  let hit = "";
  BAD.forEach(function (re) {
    if (re.test(text)) hit = re.source;
  });
  if (hit) fail(name + " still has desk-login wording (" + hit + ")");
  else ok(name + " has no desk-login wording");
});

const login = read("login.html");
const onboard = read("onboard.html");
const help = read("help.html");
const theme = read("theme.js");
const picker = read("queue-login.js");
const nav = read("desk-nav.js");

if (login.indexOf("Sign in to your Queue") < 0) fail("login.html missing Sign in to your Queue");
else ok("login.html says Sign in to your Queue");
if (login.indexOf("Open my Queue") < 0) fail("login.html missing Open my Queue");
else ok("login.html says Open my Queue");
if (login.indexOf('location.href = "desk.html"') < 0) fail("email sign-in must land on the Queue");
else ok("email sign-in lands on the Queue");
if (login.indexOf("desk.html?workspace=") < 0) fail("shop name + code must stay on the Queue with ?workspace=");
else ok("shop name + code uses ?workspace= on the Queue");
if (login.indexOf("AIADesks.open") < 0 || login.indexOf("if (!r.ok)") < 0) fail("login still has to keep the desk after a real sign-in");
else ok("login still keeps the desk after a real sign-in");

if (onboard.indexOf("Open your Queue") < 0 && onboard.indexOf("Open my Queue") < 0) fail("sign-up missing Queue copy");
else ok("sign-up says Queue");
if (onboard.indexOf('location.href = "desk.html"') < 0) fail("sign-up must land on the Queue");
else ok("sign-up lands on the Queue");
if (onboard.indexOf("Sign in to your Queue") < 0) fail("sign-up header missing Sign in to your Queue");
else ok("sign-up links to Sign in to your Queue");

if (help.indexOf("Sign in to your Queue") < 0 || help.indexOf("Open my Queue") < 0) fail("help missing Queue sign-in copy");
else ok("help says Sign in to your Queue");
if (theme.indexOf("Sign in to your Queue") < 0 || theme.indexOf("Open my Queue") < 0) fail("header/footer missing Queue account link");
else ok("header and footer say Queue");
if (theme.indexOf("Desk name + code") < 0) fail("theme.js dropped Desk name + code");
else ok("shop-name door copy still in the header chip title");

if (picker.indexOf("All desks") < 0 || picker.indexOf("Add a desk") < 0) fail("desk picker missing All desks or Add a desk");
else ok("desk picker has All desks and Add a desk");
if (picker.indexOf('id="queue-desk-picker"') < 0 && picker.indexOf("queue-desk-picker") < 0) fail("picker root missing");
else ok("picker root is queue-desk-picker");
if (picker.indexOf('action: "mine"') < 0 && picker.indexOf("action:\"mine\"") < 0) fail("picker must keep POST /api/desks action mine as fallback");
else ok("mine fallback is POST /api/desks action mine");
if (picker.indexOf("data.desks") < 0 || picker.indexOf("data.queue.desks") < 0) fail("picker must use desks or queue.desks from the login reply");
else ok("login reply desks are used (desks, or queue.desks)");
if (login.indexOf("aia_queue_login_reply") < 0 || login.indexOf("data.queue.desks") < 0) fail("email sign-in must store the login reply desks");
else ok("email sign-in stores the login reply desks");
if (picker.indexOf("workspace") < 0 || picker.indexOf("searchParams") < 0) fail("desk filter must use the ?workspace= query");
else ok("desk filter uses ?workspace=");
if (picker.indexOf("/api/jobs?desks=all") < 0) fail("All desks must call GET /api/jobs?desks=all");
else ok("All desks calls GET /api/jobs?desks=all");
if (picker.indexOf("scope=account") >= 0) fail("scope=account probe must be gone");
else ok("scope=account probe is gone");
if (picker.indexOf("hasOwnProperty.call") < 0 || picker.indexOf('"slug"') < 0) fail("slug guard missing");
else ok("slug guard requires every card to have a slug");
if (picker.indexOf("/api/jobs?workspace=") < 0) fail("one desk and the fallback must use ?workspace=");
else ok("one desk and the per-desk fallback use ?workspace=");
if (picker.indexOf("queue-desk-label") < 0 || picker.indexOf("j.desk") < 0 || picker.indexOf("j.slug") < 0) fail("All desks cards must label the desk from desk or slug");
else ok("All desks cards show a desk label from desk or slug");
if (nav.indexOf("queue-login.js") < 0) fail("desk-nav must load the Queue picker");
else ok("Queue page loads the picker");

["checkout", "charge", "buy-pack"].forEach(function (bit) {
  if (picker.indexOf(bit) >= 0) fail("queue-login.js must not " + bit);
  else ok("queue-login.js has no " + bit);
});

const deskBytes = fs.statSync(path.join(root, "desk.html")).size;
if (deskBytes !== 35012) fail("desk.html is " + deskBytes + " bytes, want 35012");
else ok("desk.html is 35012 bytes");

const pkg = read("package.json");
if (pkg.indexOf("node scripts/check-queue-login-ui.js") < 0) fail("npm test must run check-queue-login-ui");
else ok("npm test runs check-queue-login-ui");

let apiDiff = "";
try {
  apiDiff = execSync("git diff --name-only " + main + " -- api", { cwd: root, encoding: "utf8" }).trim();
} catch (e) {
  fail("could not diff api vs main");
  apiDiff = "error";
}
if (apiDiff && apiDiff !== "error") fail("api files changed vs main: " + apiDiff.replace(/\n/g, ", "));
else if (!apiDiff) ok("no api file changes vs main " + main.slice(0, 7));

let before = [];
try {
  before = execSync("git ls-tree -r --name-only " + main + " -- api", { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(function (p) { return /^api\/[a-z][^/]*\.js$/.test(p) && p.indexOf("/_") < 0; });
} catch (e) {
  fail("could not list api routes on " + main);
}
const now = fs.readdirSync(path.join(root, "api")).filter(function (f) {
  return /^[a-z].*\.js$/.test(f) && f.indexOf("_") !== 0;
}).map(function (f) { return "api/" + f; });
const known = {};
before.forEach(function (p) { known[p] = true; });
const added = now.filter(function (p) { return !known[p]; });
if (added.length) fail("new api route files: " + added.join(", "));
else ok("no new api route files vs " + main.slice(0, 7));

// Behavioral reads. queue-login.js is loaded as-is in a tiny DOM with a stubbed fetch.
const NORTH = { slug: "north", name: "North Shop" };
const SOUTH = { slug: "south", name: "South Shop" };
const REPLY_KEY = "aia_queue_login_reply";

function job(desk, extra) {
  return Object.assign({
    id: "job-" + desk.slug,
    title: desk.name + " card",
    status: "waiting",
    slug: desk.slug,
    desk: desk.slug
  }, extra || {});
}

function replyJson(desks, queueDesks) {
  const body = {};
  if (desks) body.desks = desks;
  if (queueDesks) body.queue = { desks: queueDesks };
  return JSON.stringify(body);
}

function makeEl(tag) {
  const el = {
    tagName: String(tag || "div").toUpperCase(),
    className: "",
    hidden: false,
    value: "",
    type: "",
    text: "",
    attrs: {},
    children: [],
    parentNode: null,
    style: {}
  };
  Object.defineProperty(el, "id", {
    get: function () { return el.attrs.id || ""; },
    set: function (v) { el.attrs.id = String(v); }
  });
  el.classList = {
    toggle: function (name, on) {
      const parts = String(el.className || "").split(/\s+/).filter(Boolean).filter(function (p) { return p !== name; });
      const has = String(el.className || "").split(/\s+/).indexOf(name) >= 0;
      const next = on === undefined ? !has : !!on;
      if (next) parts.push(name);
      el.className = parts.join(" ");
      return next;
    },
    contains: function (name) { return String(el.className || "").split(/\s+/).indexOf(name) >= 0; }
  };
  el.setAttribute = function (k, v) {
    el.attrs[k] = String(v);
    if (k === "id") el.id = String(v);
    if (k === "class") el.className = String(v);
  };
  el.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(el.attrs, k) ? el.attrs[k] : null; };
  el.appendChild = function (c) { c.parentNode = el; el.children.push(c); return c; };
  el.insertBefore = function (c, ref) {
    c.parentNode = el;
    const i = ref ? el.children.indexOf(ref) : -1;
    if (i < 0) el.children.push(c);
    else el.children.splice(i, 0, c);
    return c;
  };
  el.replaceChildren = function () {
    const nodes = Array.prototype.slice.call(arguments);
    el.children.splice(0, el.children.length);
    nodes.forEach(function (n) { el.appendChild(n); });
  };
  Object.defineProperty(el, "nextSibling", {
    get: function () {
      if (!el.parentNode) return null;
      const i = el.parentNode.children.indexOf(el);
      return i >= 0 ? el.parentNode.children[i + 1] || null : null;
    }
  });
  Object.defineProperty(el, "textContent", {
    get: function () {
      if (el.children.length) return el.children.map(function (c) { return c.textContent || ""; }).join("");
      return el.text;
    },
    set: function (v) { el.text = v == null ? "" : String(v); el.children.splice(0, el.children.length); }
  });
  el.addEventListener = function () {};
  return el;
}

function walk(el, fn) {
  if (!el || !el.tagName) return;
  fn(el);
  (el.children || []).forEach(function (c) { walk(c, fn); });
}

function makeDocument() {
  const documentElement = makeEl("html");
  const head = makeEl("head");
  const body = makeEl("body");
  const main = makeEl("main");
  const h1 = makeEl("h1");
  h1.className = "page-title";
  h1.textContent = "Queue";
  const banner = makeEl("div");
  banner.id = "banner";
  const queue = makeEl("div");
  queue.id = "queue";
  main.appendChild(h1);
  main.appendChild(banner);
  main.appendChild(queue);
  const ws = makeEl("input");
  ws.id = "ws";
  body.appendChild(main);
  body.appendChild(ws);
  documentElement.appendChild(head);
  documentElement.appendChild(body);
  const listeners = {};
  function matches(el, sel) {
    if (sel === "h1.page-title") return el.tagName === "H1" && String(el.className).split(/\s+/).indexOf("page-title") >= 0;
    if (sel === "main h1") return el.tagName === "H1" && el.parentNode && el.parentNode.tagName === "MAIN";
    return false;
  }
  const document = {
    documentElement: documentElement,
    head: head,
    body: body,
    readyState: "loading",
    listeners: listeners,
    createElement: makeEl,
    addEventListener: function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    getElementById: function (id) {
      let found = null;
      walk(documentElement, function (el) { if (!found && el.id === id) found = el; });
      return found;
    },
    querySelector: function (sel) {
      const parts = String(sel || "").split(",").map(function (s) { return s.trim(); });
      let found = null;
      walk(documentElement, function (el) {
        if (!found && parts.some(function (p) { return matches(el, p); })) found = el;
      });
      return found;
    }
  };
  return document;
}

function memStore(seed) {
  const m = Object.assign({}, seed || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; }
  };
}

function http(status, body) {
  return { status: status, body: body };
}

function route(spec, url) {
  const u = String(url);
  if (u.indexOf("/api/jobs?desks=all") >= 0) return spec.all;
  if (u.indexOf("/api/jobs?scope=account") >= 0) return spec.all;
  const wm = u.match(/\/api\/jobs\?workspace=([^&]+)/);
  if (wm) {
    const slug = decodeURIComponent(wm[1]);
    return http(200, { ok: true, jobs: [job(slug === "south" ? SOUTH : NORTH)] });
  }
  if (u.indexOf("/api/jobs") >= 0) return http(200, { ok: true, jobs: [] });
  if (u.indexOf("/api/desks") >= 0) {
    return http(200, { ok: true, desks: [NORTH, SOUTH], owned: [NORTH], member: [SOUTH] });
  }
  return http(200, { ok: true });
}

async function bootPage(src, spec) {
  const calls = [];
  const document = makeDocument();
  const local = memStore(Object.assign({ aia_session: "sess-test", aia_ws: "north" }, spec.local || {}));
  const session = memStore(spec.session || {});
  const location = {
    href: "http://127.0.0.1/desk.html" + (spec.search || ""),
    pathname: "/desk.html",
    search: spec.search || "",
    hash: ""
  };
  function MutationObserver() {}
  MutationObserver.prototype.observe = function () {};
  MutationObserver.prototype.disconnect = function () {};
  const sandbox = {
    URL: URL,
    URLSearchParams: URLSearchParams,
    JSON: JSON,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Promise: Promise,
    Error: Error,
    Math: Math,
    Date: Date,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    console: console,
    document: document,
    location: location,
    history: { pushState: function () {} },
    localStorage: local,
    sessionStorage: session,
    MutationObserver: MutationObserver,
    fetch: function (url, init) {
      calls.push({
        url: String(url),
        method: (init && init.method) || "GET",
        body: init && init.body ? String(init.body) : ""
      });
      const res = route(spec, url);
      return Promise.resolve({
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        json: function () { return Promise.resolve(res.body); }
      });
    },
    addEventListener: function () {},
    AIADesks: {
      slugify: function (s) {
        return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      },
      add: function () {},
      list: function () { return []; },
      open: function (row) { if (row && row.slug) local.setItem("aia_ws", row.slug); }
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  try {
    vm.runInContext(src, sandbox, { filename: "queue-login.js" });
    const fns = document.listeners.DOMContentLoaded || [];
    for (let i = 0; i < fns.length; i++) await fns[i]();
  } catch (e) {
    return { threw: (e && e.stack) || String(e), calls: calls, labels: [], buttons: [], titles: [] };
  }
  const labels = [];
  const buttons = [];
  const titles = [];
  walk(document.documentElement, function (el) {
    if (String(el.className).split(/\s+/).indexOf("queue-desk-label") >= 0) labels.push(el.textContent);
    if (el.tagName === "BUTTON") buttons.push(el.textContent);
    if (el.tagName === "H3") titles.push(el.textContent);
  });
  return { threw: "", calls: calls, labels: labels, buttons: buttons, titles: titles };
}

function desksAll(calls) { return calls.filter(function (c) { return c.url.indexOf("/api/jobs?desks=all") >= 0; }); }
function scopeAccount(calls) { return calls.filter(function (c) { return c.url.indexOf("scope=account") >= 0; }); }
function workspaces(calls) {
  return calls.map(function (c) {
    const m = String(c.url).match(/\/api\/jobs\?workspace=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }).filter(Boolean);
}
function mines(calls) {
  return calls.filter(function (c) {
    return c.method === "POST" && c.url.indexOf("/api/desks") >= 0 && c.body.indexOf('"mine"') >= 0;
  });
}

function bothDesks(list) { return list.indexOf("north") >= 0 && list.indexOf("south") >= 0; }

async function behaviorFaults(src) {
  const stored = replyJson([NORTH, SOUTH], [NORTH, SOUTH]);
  const queueOnly = replyJson(null, [NORTH, SOUTH]);
  const cases = [
    {
      name: "all slugs",
      spec: {
        session: { [REPLY_KEY]: stored },
        all: http(200, { ok: true, jobs: [job(NORTH), job(SOUTH)] })
      },
      check: function (r) {
        const f = [];
        if (desksAll(r.calls).length !== 1) f.push("expected one GET /api/jobs?desks=all, saw " + r.calls.map(function (c) { return c.method + " " + c.url; }).join(" | "));
        if (workspaces(r.calls).length) f.push("per-desk fetch on a real all-desks read");
        if (mines(r.calls).length) f.push("POST mine on the first open after a login reply");
        if (scopeAccount(r.calls).length) f.push("scope=account was called");
        if (r.labels.indexOf("North Shop") < 0 || r.labels.indexOf("South Shop") < 0) f.push("desk labels missing (" + r.labels.join(", ") + ")");
        return f;
      }
    },
    {
      name: "missing slug",
      spec: {
        session: { [REPLY_KEY]: stored },
        all: http(200, { ok: true, jobs: [{ id: "bare", title: "No slug", status: "waiting", desk: "north" }] })
      },
      check: function (r) {
        return bothDesks(workspaces(r.calls)) ? [] : ["missing slug was trusted; workspace calls: " + workspaces(r.calls).join(",")];
      }
    },
    {
      name: "empty slug",
      spec: {
        session: { [REPLY_KEY]: stored },
        all: http(200, { ok: true, jobs: [{ id: "blank", title: "Blank slug", status: "waiting", slug: "", desk: "" }] })
      },
      check: function (r) {
        return bothDesks(workspaces(r.calls)) ? [] : ["empty slug was trusted; workspace calls: " + workspaces(r.calls).join(",")];
      }
    },
    {
      name: "ok false",
      spec: {
        session: { [REPLY_KEY]: stored },
        all: http(200, { ok: false, jobs: [job(NORTH), job(SOUTH)] })
      },
      check: function (r) {
        return bothDesks(workspaces(r.calls)) ? [] : ["ok:false reply was trusted; workspace calls: " + workspaces(r.calls).join(",")];
      }
    },
    {
      name: "403",
      spec: {
        session: { [REPLY_KEY]: stored },
        all: http(403, { ok: false, error: "No desk with that name." })
      },
      check: function (r) {
        return bothDesks(workspaces(r.calls)) ? [] : ["403 reply was trusted; workspace calls: " + workspaces(r.calls).join(",")];
      }
    },
    {
      name: "empty list",
      spec: {
        session: { [REPLY_KEY]: stored },
        all: http(200, { ok: true, jobs: [] })
      },
      check: function (r) {
        const f = [];
        if (desksAll(r.calls).length !== 1) f.push("empty list did not call desks=all");
        if (workspaces(r.calls).length) f.push("empty list fell back to per-desk reads");
        return f;
      }
    },
    {
      name: "no stored reply",
      spec: {
        session: {},
        all: http(200, { ok: true, jobs: [job(NORTH), job(SOUTH)] })
      },
      check: function (r) {
        const f = [];
        if (!mines(r.calls).length) f.push("reload without a stored reply did not POST action mine");
        if (r.buttons.indexOf("North Shop") < 0 || r.buttons.indexOf("South Shop") < 0) f.push("mine desks did not reach the picker (" + r.buttons.join(", ") + ")");
        return f;
      }
    },
    {
      name: "queue.desks only",
      spec: {
        session: { [REPLY_KEY]: queueOnly },
        all: http(200, { ok: true, jobs: [job(NORTH), job(SOUTH)] })
      },
      check: function (r) {
        const f = [];
        if (mines(r.calls).length) f.push("queue.desks was ignored and mine ran");
        if (r.buttons.indexOf("North Shop") < 0 || r.buttons.indexOf("South Shop") < 0) f.push("queue.desks did not fill the picker");
        return f;
      }
    },
    {
      name: "one desk",
      spec: {
        search: "?workspace=south",
        session: { [REPLY_KEY]: stored },
        all: http(200, { ok: true, jobs: [job(NORTH), job(SOUTH)] })
      },
      check: function (r) {
        const f = [];
        if (workspaces(r.calls).indexOf("south") < 0) f.push("one desk did not call ?workspace=south (" + r.calls.map(function (c) { return c.url; }).join(" | ") + ")");
        if (mines(r.calls).length) f.push("one desk called mine even though the login reply had desks");
        if (r.titles.indexOf("South Shop card") < 0) f.push("one desk did not show that desk's card");
        return f;
      }
    }
  ];
  const faults = [];
  for (let i = 0; i < cases.length; i++) {
    const item = cases[i];
    const result = await bootPage(src, item.spec);
    const found = result.threw ? [result.threw.split("\n")[0]] : item.check(result);
    found.forEach(function (msg) { faults.push(item.name + ": " + msg); });
  }
  (await staleLoadFaults(src)).forEach(function (msg) { faults.push(msg); });
  return faults;
}

// Two overlapping loads: All desks starts first and answers last; a newer pick of one desk
// answers first. The late All desks answer must not overwrite the newer desk's cards.
async function staleLoadFaults(src) {
  const calls = [];
  const document = makeDocument();
  const local = memStore({ aia_session: "sess-test", aia_ws: "north" });
  const session = memStore({ [REPLY_KEY]: replyJson([NORTH, SOUTH], null) });
  const location = { href: "http://127.0.0.1/desk.html", pathname: "/desk.html", search: "", hash: "" };
  const winListeners = {};
  let releaseAll = null;
  function MutationObserver() {}
  MutationObserver.prototype.observe = function () {};
  MutationObserver.prototype.disconnect = function () {};
  function reply(status, body) {
    return { ok: status >= 200 && status < 300, status: status, json: function () { return Promise.resolve(body); } };
  }
  const sandbox = {
    URL: URL, URLSearchParams: URLSearchParams, JSON: JSON, Object: Object, Array: Array, String: String,
    Number: Number, Promise: Promise, Error: Error, Math: Math, Date: Date,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent, console: console,
    document: document, location: location, history: { pushState: function () {} },
    localStorage: local, sessionStorage: session, MutationObserver: MutationObserver,
    fetch: function (url, init) {
      const u = String(url);
      calls.push({ url: u, method: (init && init.method) || "GET", body: init && init.body ? String(init.body) : "" });
      if (u.indexOf("/api/jobs?desks=all") >= 0) {
        return new Promise(function (resolve) {
          releaseAll = function () { resolve(reply(200, { ok: true, jobs: [job(NORTH, { title: "Stale north card" }), job(SOUTH, { title: "Stale south card" })] })); };
        });
      }
      return Promise.resolve(reply(route({ all: http(200, { ok: true, jobs: [] }) }, url).status, route({ all: http(200, { ok: true, jobs: [] }) }, url).body));
    },
    addEventListener: function (ev, fn) { (winListeners[ev] = winListeners[ev] || []).push(fn); },
    AIADesks: {
      slugify: function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40); },
      add: function () {}, list: function () { return []; },
      open: function (row) { if (row && row.slug) local.setItem("aia_ws", row.slug); }
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const tick = async function () { for (let i = 0; i < 20; i++) await new Promise(function (r) { setImmediate(r); }); };
  function titles() {
    const out = [];
    walk(document.documentElement, function (el) { if (el.tagName === "H3") out.push(el.textContent); });
    return out;
  }
  try {
    vm.runInContext(src, sandbox, { filename: "queue-login.js" });
    const fns = document.listeners.DOMContentLoaded || [];
    fns.forEach(function (fn) { fn(); });
    await tick();
    if (!releaseAll) return ["stale load: All desks read never started (" + calls.map(function (c) { return c.url; }).join(" | ") + ")"];
    location.search = "?workspace=south";
    location.href = "http://127.0.0.1/desk.html?workspace=south";
    (winListeners.popstate || []).forEach(function (fn) { fn({}); });
    await tick();
    const newer = titles();
    if (newer.indexOf("South Shop card") < 0) return ["stale load: the newer desk pick did not paint (" + newer.join(", ") + ")"];
    releaseAll();
    await tick();
    const after = titles();
    const f = [];
    if (after.some(function (t) { return /^Stale /.test(t); })) f.push("stale load: an older All desks answer overwrote the newer desk pick (" + after.join(", ") + ")");
    if (after.indexOf("South Shop card") < 0) f.push("stale load: the newer desk's card is gone (" + after.join(", ") + ")");
    return f;
  } catch (e) {
    return ["stale load threw " + ((e && e.message) || e)];
  }
}

function loginBehavior(html) {
  const faults = [];
  const m = String(html).match(/sessionStorage\.setItem\("aia_queue_login_reply",\s*JSON\.stringify\(\{([\s\S]*?)\}\)\)/);
  if (!m) return ["login.html does not store the sign-in reply for the Queue"];
  const data = {
    desks: [{ slug: "from-desks", name: "From desks" }],
    queue: { desks: [{ slug: "from-queue", name: "From queue" }] }
  };
  let parsed;
  try {
    parsed = JSON.parse(vm.runInNewContext("JSON.stringify({" + m[1] + "})", { data: data, JSON: JSON, Array: Array }));
  } catch (e) {
    return ["login.html reply store did not run (" + (e && e.message) + ")"];
  }
  if (!parsed || !Array.isArray(parsed.desks) || !parsed.desks[0] || parsed.desks[0].slug !== "from-desks") {
    faults.push("login.html does not store reply.desks");
  }
  if (!parsed || !parsed.queue || !Array.isArray(parsed.queue.desks) || !parsed.queue.desks[0] || parsed.queue.desks[0].slug !== "from-queue") {
    faults.push("login.html does not store reply.queue.desks");
  }
  return faults;
}

const MUTANTS = [
  ["V1 drop the everyCardHasSlug gate from readAllDesks", "queue-login.js",
    "      if (!rows || !everyCardHasSlug(rows)) return null;\n",
    "      if (!rows) return null;\n"],
  ["V3 allow an empty slug through", "queue-login.js",
    "      if (String(card.slug || \"\").trim() === \"\") return false;\n",
    "      if (!(\"slug\" in card)) return false;\n"],
  ["V5 per-desk fallback fetch loses ?workspace=", "queue-login.js",
    "          var part = await jobsForDesk(desks[i]);\n",
    "          var part = await fetch(\"/api/jobs\", { headers: headersFor(desks[i].slug) }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (data) { return Array.isArray(data.jobs) ? data.jobs.map(function (j) { return mapCard(j, desks[i]); }) : []; });\n"],
  ["V6 drop the data.ok !== true check", "queue-login.js",
    "      if (!r.ok || !data || data.ok !== true || data.error) return null;\n",
    "      if (!r.ok || !data || data.error) return null;\n"],
  ["V8 login.html stops passing desks from the sign-in reply", "login.html",
    "              desks: data.desks,\n",
    ""],
  ["V10 force the all-desks path", "queue-login.js",
    "      if (!r.ok || !data || data.ok !== true || data.error) return null;\n      var rows = Array.isArray(data.jobs) ? data.jobs : null;\n      if (!rows || !everyCardHasSlug(rows)) return null;\n      return rows;\n",
    "      var rows = data && Array.isArray(data.jobs) ? data.jobs : [];\n      return rows;\n"],
  ["desks=all call removed", "queue-login.js",
    "    if (!tok) return null;\n    try {\n      var r = await fetch(\"/api/jobs?desks=all\", {\n",
    "    if (!tok) return null;\n    return null; try {\n      var r = await fetch(\"/api/jobs?desks=all\", {\n"],
  ["mine fallback removed when the reply is absent", "queue-login.js",
    "      var mine = await loadMine();\n      desks = mine ? fromMine(mine) : fromPhone();\n",
    "      var mine = null;\n      desks = fromPhone();\n"],
  ["scope=account reintroduced", "queue-login.js",
    "\"/api/jobs?desks=all\"",
    "\"/api/jobs?scope=account\""],
  ["per-card desk label removed", "queue-login.js",
    "      if (mode === \"all\") {\n        var lab = document.createElement(\"p\");\n        lab.className = \"queue-desk-label\";\n        lab.textContent = deskLabelText(j);\n        card.appendChild(lab);\n      }\n",
    ""],
  ["one-desk view not using ?workspace=", "queue-login.js",
    "      next = await jobsForDesk(desk);\n",
    "      next = [];\n"],
  ["login reply ignored so mine always runs", "queue-login.js",
    "    if (fromReply) {\n",
    "    if (fromReply && false) {\n"],
  ["login reply queue.desks ignored", "queue-login.js",
    "    if (!rows && data.queue && Array.isArray(data.queue.desks)) rows = data.queue.desks;\n",
    "    if (false && data.queue && Array.isArray(data.queue.desks)) rows = data.queue.desks;\n"],
  ["stale-load guard removed (every gen !== loadGen check)", "queue-login.js",
    "if (gen !== loadGen) return;",
    "/* no stale-load guard */",
    "all"]
];
function applyMutant(orig, row) {
  return row[4] === "all" ? orig.split(row[2]).join(row[3]) : orig.replace(row[2], row[3]);
}

function finish() {
  if (bad) {
    console.error("check-queue-login-ui: " + okN + " ok, " + bad + " failed");
    process.exit(1);
  }
  console.log("check-queue-login-ui: " + okN + " ok, 0 failed");
}

async function behaviors() {
  const src = read("queue-login.js");
  const html = read("login.html");
  const live = await behaviorFaults(src);
  if (live.length) live.forEach(function (msg) { fail("unmutated " + msg); });
  else ok("unmutated queue-login.js passes the desk reads");
  const stored = loginBehavior(html);
  if (stored.length) stored.forEach(function (msg) { fail(msg); });
  else ok("login.html stores reply.desks and reply.queue.desks");

  let caught = 0;
  MUTANTS.forEach(function (row) {
    const name = row[0];
    const file = row[1];
    const find = row[2];
    const repl = row[3];
    const orig = file === "login.html" ? html : src;
    if (orig.indexOf(find) < 0) { fail(name + " ANCHOR GONE"); return; }
    if (row[4] !== "all" && orig.indexOf(find) !== orig.lastIndexOf(find)) { fail(name + " ANCHOR NOT UNIQUE"); return; }
    const next = applyMutant(orig, row);
    if (next === orig) { fail(name + " NO-OP"); return; }
  });
  if (bad) return;

  for (let i = 0; i < MUTANTS.length; i++) {
    const name = MUTANTS[i][0];
    const file = MUTANTS[i][1];
    const find = MUTANTS[i][2];
    const repl = MUTANTS[i][3];
    const faults = file === "login.html"
      ? loginBehavior(applyMutant(html, MUTANTS[i]))
      : await behaviorFaults(applyMutant(src, MUTANTS[i]));
    if (faults.length) {
      caught += 1;
      ok("caught " + name + " (" + faults[0] + ")");
    } else fail("SURVIVED " + name);
  }
  if (caught === MUTANTS.length) ok("mutants " + caught + "/" + MUTANTS.length + " caught");
  else fail("mutants " + caught + "/" + MUTANTS.length + " caught");
}

behaviors().then(finish).catch(function (e) {
  fail("behavior crash " + (e && e.stack || e));
  finish();
});
