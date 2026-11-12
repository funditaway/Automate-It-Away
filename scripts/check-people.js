require("./_env-guard");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const adminSrc = fs.readFileSync(path.join(root, "api/admin.js"), "utf8");
const peopleHtml = fs.readFileSync(path.join(root, "people.html"), "utf8");
const peopleJs = fs.readFileSync(path.join(root, "people.js"), "utf8");
const peopleDesk = fs.readFileSync(path.join(root, "people-desk.js"), "utf8");
const historyHtml = fs.readFileSync(path.join(root, "history.html"), "utf8");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

if (!/action === "person"/.test(adminSrc)) fail("admin action=person");
else pass("admin action=person");
if (!/function personBook/.test(adminSrc) && !/personBook\(/.test(adminSrc)) fail("admin personBook");
else pass("admin personBook");
if (!/function allowedSlugs/.test(adminSrc)) fail("admin allowedSlugs");
else pass("admin allowedSlugs");
if (/slugs: slugs.length \? slugs : null/.test(adminSrc)) fail("admin must not pass slugs null");
else pass("admin slugs stay locked");
if (/peopleAcross\(\)/.test(adminSrc) && /action === "person"[\s\S]{0,400}peopleAcross/.test(adminSrc)) fail("person action must not use peopleAcross");
else pass("person action avoids peopleAcross");

if (peopleHtml.indexOf("id=\"sheet\"") < 0) fail("people sheet markup");
else pass("people sheet markup");
if (peopleJs.indexOf("function groupPeople") < 0) fail("people groupPeople");
else pass("people groupPeople");
if (peopleJs.indexOf("function openSheet") < 0) fail("people openSheet");
else pass("people openSheet");
if (peopleJs.indexOf("action: \"person\"") < 0) fail("people POSTs person");
else pass("people POSTs person");
// The Full history link carries the seat id + desk (372), never the name.
if (peopleJs.indexOf("seatLink(\"/history\", seat)") < 0 || peopleJs.indexOf("/history?who=") >= 0) fail("people history seat link");
else pass("people history seat link");
if (peopleJs.indexOf("openFromQuery") < 0) fail("people ?who= open");
else pass("people ?who= open");
if (peopleJs.indexOf("function kindLabel") < 0 || peopleJs.indexOf('if (k === "agent") return "Desk AI"') < 0) {
  fail("people.js must label agent seats Desk AI");
} else pass("people kindLabel maps agent to Desk AI");
if (/esc\(kindOf\(p\)\)/.test(peopleJs)) fail("people card seat chip must not paint raw kindOf");
else pass("people card seat chip uses kindLabel");
if (peopleJs.indexOf("kindLabel(seat.kind") < 0) fail("people open-sheet seats must label agent Desk AI");
else pass("people open-sheet seats use kindLabel");
if (peopleDesk.indexOf("human, agent, or pipe") >= 0) fail("people-desk Say still says agent");
else pass("people-desk Say does not say agent");
if (peopleDesk.indexOf("human, Desk AI, or pipe") < 0) fail("people-desk Say must name Desk AI");
else pass("people-desk Say names Desk AI");
if (peopleJs.indexOf('bits.push("agents")') >= 0) fail("people logicLine still says agents");
else pass("people logicLine does not say agents");
if (peopleJs.indexOf('bits.push("Desk AIs")') < 0) fail("people logicLine must say Desk AIs");
else pass("people logicLine names Desk AIs");
const yesNo = fs.readFileSync(path.join(root, "ACCOUNT-YES-NO.md"), "utf8");
const packMd = fs.readFileSync(path.join(root, "PACK.md"), "utf8");
if (yesNo.indexOf("People logic leftover") < 0) fail("ACCOUNT-YES-NO must name People logic leftover");
else pass("ACCOUNT-YES-NO names People logic leftover");
if (packMd.indexOf("People logic leftover") < 0) fail("PACK.md must name People logic leftover");
else pass("PACK.md names People logic leftover");

if (historyHtml.indexOf("params.get(\"who\")") < 0) fail("history reads ?who=");
else pass("history reads ?who=");
if (historyHtml.indexOf("who-chip") < 0) fail("history who chip");
else pass("history who chip");
// History links back to People by seat id + desk (372), never by name.
if (historyHtml.indexOf("\"/people?seat=\"") < 0 || historyHtml.indexOf("/people?who=") >= 0) fail("history back to people");
else pass("history back to people");

const vm = require("vm");

function pinTag(html, id) {
  const m = html.match(new RegExp("<input id=\"" + id + "\"[^>]*>"));
  return m ? m[0] : "";
}
if (!/\stype="password"/.test(pinTag(peopleHtml, "p"))) fail("Invite #p must be type=password");
else pass("Invite #p is type=password");
if (!/\stype="password"/.test(pinTag(peopleHtml, "sit-pin"))) fail("Sit #sit-pin must be type=password");
else pass("Sit #sit-pin is type=password");
if (!/if \(ses\) h\["X-Session"\] = ses;\s*if \(pin && !ses\) h\["X-Pin"\] = pin;/.test(peopleJs)) {
  fail("current-desk headers must send a leftover aia_pin only when no session is present");
} else pass("current-desk headers skip leftover aia_pin when a session is present");

const MULTI_DESK_BITS = [
  "if (d && d.pin) h[\"X-Pin\"] = d.pin;",
  "if (d && d.token) h[\"X-Session\"] = d.token;",
  "if (desk.pin) h[\"X-Pin\"] = desk.pin;",
  "if (desk.token) h[\"X-Session\"] = desk.token;",
  "var desks = savedDesks().map(function (d) { return { slug: d.slug, pin: d.pin || \"\", token: d.token || \"\" }; });"
];
MULTI_DESK_BITS.forEach(function (bit) {
  if (peopleJs.indexOf(bit) < 0) fail("multi-desk pin/token path must stay as written: " + bit);
  else pass("multi-desk path kept: " + bit);
});

function leftoverFaults(kind, src, html) {
  const faults = [];
  if (!/\stype="password"/.test(pinTag(html, "p")) || !/\stype="password"/.test(pinTag(html, "sit-pin"))) faults.push("field type=text");
  if (!/if \(pin && !ses\) h\["X-Pin"\] = pin;/.test(src) || /if \(pin\) h\["X-Pin"\] = pin;\s*if \(ses\)/.test(src)) {
    faults.push("leftover pin with session");
  }
  MULTI_DESK_BITS.forEach(function (bit) {
    if (src.indexOf(bit) < 0) faults.push("other-desk pins stripped");
  });
  return faults;
}
(function staticLeftover() {
  const live = leftoverFaults("", peopleJs, peopleHtml);
  if (live.length) fail("people leftover-pin faults: " + live.join("; "));
  else pass("people Invite/Sit fields and current-desk session headers are in place");
  const textHtml = peopleHtml
    .replace(pinTag(peopleHtml, "p"), pinTag(peopleHtml, "p").replace(/\s*type="password"/, ""))
    .replace(pinTag(peopleHtml, "sit-pin"), pinTag(peopleHtml, "sit-pin").replace(/\s*type="password"/, ""));
  const pinSrc = peopleJs.replace("if (pin && !ses) h[\"X-Pin\"] = pin;", "if (pin) h[\"X-Pin\"] = pin;");
  const stripped = peopleJs.replace("if (desk.pin) h[\"X-Pin\"] = desk.pin;", "if (false && desk.pin) h[\"X-Pin\"] = desk.pin;");
  [
    ["field type=text", peopleJs, textHtml],
    ["leftover pin with session", pinSrc, peopleHtml],
    ["other-desk pins stripped", stripped, peopleHtml]
  ].forEach(function (row) {
    const faults = leftoverFaults(row[0], row[1], row[2]);
    if (faults.indexOf(row[0]) < 0) fail("people leftover-pin mutant survived: " + row[0]);
    else pass("people leftover-pin mutant caught: " + row[0]);
  });
})();

function makeEl(tag, id, attrs) {
  const el = {
    tagName: String(tag).toUpperCase(), id: id, attrs: Object.assign({}, attrs || {}), style: {}, listeners: {},
    innerHTML: "", textContent: "", value: "", checked: !!(attrs && "checked" in attrs),
    hidden: !!(attrs && "hidden" in attrs), parentNode: null, onclick: null, children: [],
    classList: { add: function () {}, remove: function () {}, contains: function () { return false; } },
    setAttribute: function (k, v) { this.attrs[k] = String(v); if (k === "hidden") this.hidden = true; },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    removeAttribute: function (k) { delete this.attrs[k]; if (k === "hidden") this.hidden = false; },
    addEventListener: function (t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    insertBefore: function () {}, appendChild: function (c) { this.children.push(c); return c; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; }, closest: function () { return null; }
  };
  return el;
}
function makeDom(html) {
  const els = {};
  const re = /<(\w+)([^>]*)\sid="([^"]+)"([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrsText = m[2] + " " + m[4];
    const attrs = {};
    const ar = /([\w-]+)(?:="([^"]*)")?/g;
    let a;
    while ((a = ar.exec(attrsText))) attrs[a[1]] = a[2] === undefined ? "" : a[2];
    els[m[3]] = makeEl(m[1].toLowerCase(), m[3], attrs);
  }
  return els;
}
function makeStore(init) {
  const data = Object.assign({}, init || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
    _data: data
  };
}

const DESKS_LIST = [
  { slug: "rivera-resale", name: "Rivera resale", pin: "1111", token: "sess-1" },
  { slug: "oddo-house", name: "Oddo house", pin: "2468", token: "" }
];
const PERSON = { id: "s_pat", name: "Pat", seats: [{ id: "s_pat", deskSlug: "oddo-house", kind: "helper" }] };

function bootPeople(opts) {
  opts = opts || {};
  const els = makeDom(peopleHtml);
  const store = makeStore(Object.assign({
    aia_people_scope_init: "1",
    aia_ws: "rivera-resale",
    aia_desk_name: "Rivera resale",
    aia_pin: "1111",
    aia_session: "sess-1"
  }, opts.store || {}));
  const calls = [];
  async function fetchImpl(url, init) {
    const headers = (init && init.headers) || {};
    let body = {};
    try { if (init && init.body) body = JSON.parse(init.body); } catch (e) { body = {}; }
    calls.push({ url: String(url), method: (init && init.method) || "GET", headers: Object.assign({}, headers), body: body });
    if (body && body.action === "person") {
      return { status: 200, json: async function () { return { ok: true, person: { name: "Pat", phone: "", email: "" }, seats: PERSON.seats, cards: [], history: [], thread: [], currentSlug: "rivera-resale" }; } };
    }
    if (String(url).indexOf("/api/admin?") === 0) {
      return { status: 200, json: async function () { return { ok: true, person: { name: "Pat", phone: "417", email: "" }, thread: [], seats: PERSON.seats, cards: [], history: [], currentSlug: "oddo-house" }; } };
    }
    if (String(url).indexOf("/api/admin") === 0) {
      const ws = headers["X-Workspace"] || store.getItem("aia_ws");
      return { status: 200, json: async function () {
        return { ok: true, you: { role: "owner", name: "Sam" }, shop: { name: ws === "oddo-house" ? "Oddo house" : "Rivera resale" }, people: [Object.assign({}, PERSON, { desk: ws })] };
      } };
    }
    if (String(url).indexOf("/api/jobs") === 0) {
      return { status: 200, json: async function () { return { ok: true, jobs: [] }; } };
    }
    return { status: 200, json: async function () { return { ok: true }; } };
  }
  const document = {
    readyState: "loading",
    getElementById: function (id) { return els[id] || null; },
    createElement: function (tag) { return makeEl(tag, "", {}); },
    addEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
  const ctx = {
    window: null,
    document: document,
    localStorage: store,
    sessionStorage: makeStore(),
    fetch: fetchImpl,
    console: console,
    location: { href: "http://localhost/people", pathname: "/people", search: "", hash: "" },
    history: { replaceState: function () {} },
    navigator: { clipboard: { writeText: async function () {} } },
    URLSearchParams: URLSearchParams,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Promise: Promise,
    Date: Date,
    JSON: JSON
  };
  ctx.window = ctx;
  ctx.window.window = ctx.window;
  ctx.AIADesks = {
    list: function () { return DESKS_LIST.map(function (d) { return Object.assign({}, d); }); },
    remember: function () {},
    open: function () {},
    find: function (slug) { return DESKS_LIST.filter(function (d) { return d.slug === slug; })[0] || null; }
  };
  vm.createContext(ctx);
  vm.runInContext(peopleJs, ctx, { filename: "people.js" });
  return { ctx: ctx, els: els, store: store, calls: calls };
}

function currentDeskCalls(calls) {
  return calls.filter(function (c) {
    const ws = c.headers["X-Workspace"];
    const path = c.url.split("?")[0];
    const otherDeskGet = /[?&]desk=oddo-house/.test(c.url);
    const person = c.body && c.body.action === "person";
    return (path === "/api/admin" || path === "/api/jobs") && ws === "rivera-resale" && !otherDeskGet && !person;
  });
}

(async function liveLeftover() {
  const withSession = bootPeople();
  await withSession.ctx.load();
  const cur = currentDeskCalls(withSession.calls);
  if (!cur.length) fail("current-desk load must call /api/admin or /api/jobs");
  else pass("current-desk load calls the working desk");
  if (cur.some(function (c) { return c.headers["X-Pin"]; })) {
    fail("current-desk load must not send leftover aia_pin when a session is present");
  } else pass("current-desk load does not send leftover aia_pin when a session is present");
  if (!cur.every(function (c) { return c.headers["X-Session"] === "sess-1"; })) {
    fail("current-desk load must send X-Session");
  } else pass("current-desk load sends X-Session");

  const pinOnly = bootPeople({ store: { aia_session: undefined } });
  pinOnly.store.removeItem("aia_session");
  await pinOnly.ctx.load();
  const pinCur = currentDeskCalls(pinOnly.calls);
  if (!pinCur.length || !pinCur.every(function (c) { return c.headers["X-Pin"] === "1111" && !c.headers["X-Session"]; })) {
    fail("current-desk load must still send leftover aia_pin when there is no session");
  } else pass("current-desk load still sends leftover aia_pin when there is no session");

  const all = bootPeople();
  all.ctx.STATE.all = true;
  await all.ctx.load();
  const oddo = all.calls.filter(function (c) { return c.headers["X-Workspace"] === "oddo-house" && (c.url.split("?")[0] === "/api/admin" || c.url.split("?")[0] === "/api/jobs"); });
  if (!oddo.length) fail("All desks must still fetch the other saved desk");
  else pass("All desks still fetches the other saved desk");
  if (!oddo.every(function (c) { return c.headers["X-Pin"] === "2468"; })) {
    fail("All desks must still send the other desk's saved pin, got " + JSON.stringify(oddo.map(function (c) { return c.headers; })));
  } else pass("All desks still sends the other desk's saved pin");
  if (oddo.some(function (c) { return c.headers["X-Pin"] === "1111"; })) {
    fail("All desks must not substitute the current leftover pin on the other desk");
  } else pass("All desks does not substitute the current leftover pin on the other desk");

  const sheet = bootPeople();
  await sheet.ctx.load();
  const before = sheet.calls.length;
  await sheet.ctx.openSheet(sheet.ctx.STATE.people[0] || PERSON, { id: "s_pat", desk: "oddo-house" });
  const after = sheet.calls.slice(before);
  const seatGet = after.filter(function (c) { return String(c.url).indexOf("/api/admin?") === 0; })[0];
  if (!seatGet) fail("other-desk sheet must still GET the seat on that desk");
  else pass("other-desk sheet still GETs the seat on that desk");
  if (!seatGet || seatGet.headers["X-Workspace"] !== "oddo-house" || seatGet.headers["X-Pin"] !== "2468") {
    fail("other-desk sheet must still send that desk's saved pin on the seat GET, got " + JSON.stringify(seatGet && seatGet.headers));
  } else pass("other-desk sheet still sends that desk's saved pin on the seat GET");
  const personPost = after.filter(function (c) { return c.body && c.body.action === "person"; })[0];
  if (!personPost) fail("openSheet must still POST action=person");
  else pass("openSheet still POSTs action=person");
  const desks = (personPost && personPost.body && personPost.body.desks) || [];
  const want = [
    { slug: "rivera-resale", pin: "1111", token: "sess-1" },
    { slug: "oddo-house", pin: "2468", token: "" }
  ];
  const same = JSON.stringify(desks) === JSON.stringify(want);
  if (!same) fail("person POST desks list must stay {slug, pin, token} for every saved desk, got " + JSON.stringify(desks));
  else pass("person POST desks list still sends saved pins and tokens unchanged");
  if (personPost && personPost.headers["X-Pin"]) {
    fail("person POST on the current desk must not send leftover aia_pin when a session is present");
  } else pass("person POST on the current desk does not send leftover aia_pin when a session is present");
  if (personPost && personPost.headers["X-Session"] !== "sess-1") {
    fail("person POST on the current desk must send X-Session");
  } else pass("person POST on the current desk sends X-Session");

  const pinMutSrc = peopleJs.replace("if (pin && !ses) h[\"X-Pin\"] = pin;", "if (pin) h[\"X-Pin\"] = pin;");
  const pinMut = (function () {
    const orig = peopleJs;
    // boot with mutated source by temporarily swapping is messy; run a local vm of the mutant
    const saved = peopleJs;
    return null;
  })();
  // Re-run a boot using a one-off mutated source
  function bootSrc(src, opts) {
    const hold = peopleJs;
    // inline copy of bootPeople against src
    const els = makeDom(peopleHtml);
    const store = makeStore(Object.assign({
      aia_people_scope_init: "1", aia_ws: "rivera-resale", aia_desk_name: "Rivera resale",
      aia_pin: "1111", aia_session: "sess-1"
    }, (opts && opts.store) || {}));
    const calls = [];
    async function fetchImpl(url, init) {
      const headers = (init && init.headers) || {};
      let body = {};
      try { if (init && init.body) body = JSON.parse(init.body); } catch (e) { body = {}; }
      calls.push({ url: String(url), method: (init && init.method) || "GET", headers: Object.assign({}, headers), body: body });
      return { status: 200, json: async function () { return { ok: true, you: { role: "owner", name: "Sam" }, shop: { name: "Rivera resale" }, people: [], jobs: [] }; } };
    }
    const document = {
      readyState: "loading",
      getElementById: function (id) { return els[id] || null; },
      createElement: function (tag) { return makeEl(tag, "", {}); },
      addEventListener: function () {},
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; }
    };
    const ctx = {
      window: null, document: document, localStorage: store, sessionStorage: makeStore(),
      fetch: fetchImpl, console: console,
      location: { href: "http://localhost/people", pathname: "/people", search: "", hash: "" },
      history: { replaceState: function () {} }, navigator: { clipboard: { writeText: async function () {} } },
      URLSearchParams: URLSearchParams, setTimeout: setTimeout, clearTimeout: clearTimeout, Promise: Promise, Date: Date, JSON: JSON
    };
    ctx.window = ctx; ctx.window.window = ctx.window;
    ctx.AIADesks = { list: function () { return DESKS_LIST.map(function (d) { return Object.assign({}, d); }); }, remember: function () {}, open: function () {} };
    vm.createContext(ctx);
    vm.runInContext(src, ctx, { filename: "people.js" });
    return { ctx: ctx, calls: calls };
  }
  const leaked = bootSrc(pinMutSrc);
  await leaked.ctx.load();
  const leakedCur = currentDeskCalls(leaked.calls);
  if (!leakedCur.some(function (c) { return c.headers["X-Pin"] === "1111"; })) {
    fail("leftover pin with session mutant must still send X-Pin on the current desk");
  } else pass("leftover pin with session mutant still caught on the current desk");

  if (process.exitCode) {
    console.error("check-people failed");
    process.exit(process.exitCode);
  }
  console.log("check-people: ok");
})().catch(function (err) {
  fail((err && err.stack) || String(err));
  process.exit(1);
});
