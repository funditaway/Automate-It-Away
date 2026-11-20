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
if (peopleJs.indexOf("action: \"login\"") < 0 || peopleJs.indexOf("function exchangeDeskCode") < 0) {
  fail("people.js must exchange a saved desk code via /api/auth login");
} else pass("people.js exchanges a saved desk code via /api/auth login");
if (peopleJs.indexOf('h["X-Session"] = desk.token') < 0 || peopleJs.indexOf('h["X-Session"] = d.token') < 0) {
  fail("fetchDesk and deskHeaders must send the desk token");
} else pass("fetchDesk and deskHeaders send the desk token");
if (peopleJs.indexOf('h["X-Pin"] = desk.pin') >= 0 || peopleJs.indexOf('if (d && d.pin) h["X-Pin"] = d.pin') >= 0) {
  fail("fetchDesk and deskHeaders must never send a stored pin");
} else pass("fetchDesk and deskHeaders never send a stored pin");
if (/pin:\s*d\.pin/.test(peopleJs)) fail("person POST must not send a stored pin");
else pass("person POST does not send a stored pin");

function leftoverFaults(kind, src, html) {
  const faults = [];
  if (!/\stype="password"/.test(pinTag(html, "p")) || !/\stype="password"/.test(pinTag(html, "sit-pin"))) faults.push("field type=text");
  if (!/if \(pin && !ses\) h\["X-Pin"\] = pin;/.test(src) || /if \(pin\) h\["X-Pin"\] = pin;\s*if \(ses\)/.test(src)) {
    faults.push("leftover pin with session");
  }
  if (src.indexOf("stripDeskPin(slug);") < 0) faults.push("kept pin");
  if (src.indexOf('h["X-Session"] = desk.token') < 0) faults.push("no token sent");
  if (src.indexOf('h["X-Pin"] = desk.pin') >= 0 || /pin:\s*d\.pin/.test(src)) faults.push("no token sent");
  return faults;
}

(function staticLeftover() {
  const live = leftoverFaults("", peopleJs, peopleHtml);
  if (live.length) fail("people leftover-pin faults: " + live.join("; "));
  else pass("people token-exchange and current-desk session headers are in place");
  const textHtml = peopleHtml
    .replace(pinTag(peopleHtml, "p"), pinTag(peopleHtml, "p").replace(/\s*type="password"/, ""))
    .replace(pinTag(peopleHtml, "sit-pin"), pinTag(peopleHtml, "sit-pin").replace(/\s*type="password"/, ""));
  const pinSrc = peopleJs.replace("if (pin && !ses) h[\"X-Pin\"] = pin;", "if (pin) h[\"X-Pin\"] = pin;");
  const kept = peopleJs.replace(/stripDeskPin\(slug\);/g, "/* kept pin */");
  const noTok = peopleJs.replace("if (desk.token) h[\"X-Session\"] = desk.token;", "");
  [
    ["field type=text", peopleJs, textHtml],
    ["leftover pin with session", pinSrc, peopleHtml],
    ["kept pin", kept, peopleHtml],
    ["no token sent", noTok, peopleHtml]
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

const PERSON = { id: "s_pat", name: "Pat", seats: [{ id: "s_pat", deskSlug: "oddo-house", kind: "helper" }] };
const START_DESKS = [
  { slug: "rivera-resale", name: "Rivera resale", pin: "1111", token: "sess-1" },
  { slug: "oddo-house", name: "Oddo house", pin: "2468" }
];

function bootPeople(opts) {
  opts = opts || {};
  const src = opts.src || peopleJs;
  const els = makeDom(peopleHtml);
  const store = makeStore(Object.assign({
    aia_people_scope_init: "1",
    aia_ws: "rivera-resale",
    aia_desk_name: "Rivera resale",
    aia_pin: "1111",
    aia_session: "sess-1",
    aia_desks: JSON.stringify(START_DESKS)
  }, opts.store || {}));
  const codes = Object.assign({ "rivera-resale": "1111", "oddo-house": "2468" }, opts.codes || {});
  const tokens = Object.assign({ "rivera-resale": "sess-1", "oddo-house": "tok-oddo" }, opts.tokens || {});
  const calls = [];
  async function fetchImpl(url, init) {
    const headers = (init && init.headers) || {};
    let body = {};
    try { if (init && init.body) body = JSON.parse(init.body); } catch (e) { body = {}; }
    calls.push({ url: String(url), method: (init && init.method) || "GET", headers: Object.assign({}, headers), body: body });
    if (String(url).indexOf("/api/auth") === 0) {
      const slug = body.workspace || headers["X-Workspace"] || "";
      const ok = body.action === "login" && body.pin && codes[slug] === body.pin;
      if (opts.authFail || !ok) {
        return { status: 401, ok: false, json: async function () { return { error: "Desk name or code does not match." }; } };
      }
      return { status: 200, ok: true, json: async function () {
        return { workspace: { slug: slug, biz: slug === "oddo-house" ? "Oddo house" : "Rivera resale" }, session: { token: tokens[slug] || ("tok-" + slug) }, you: { role: "owner", name: "Sam" } };
      } };
    }
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
    list: function () {
      try {
        const rows = JSON.parse(store.getItem("aia_desks") || "[]");
        if (Array.isArray(rows) && rows.length) return rows;
      } catch (e) {}
      return START_DESKS.map(function (d) { return Object.assign({}, d); });
    },
    remember: function () {},
    open: function () {},
    slugify: function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40); },
    find: function (slug) { return this.list().filter(function (d) { return d.slug === slug; })[0] || null; }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: "people.js" });
  return { ctx: ctx, els: els, store: store, calls: calls };
}

function parseDesks(store) {
  try { return JSON.parse(store.getItem("aia_desks") || "[]"); } catch (e) { return []; }
}
function currentDeskCalls(calls) {
  return calls.filter(function (c) {
    const path = c.url.split("?")[0];
    return (path === "/api/admin" || path === "/api/jobs") && c.headers["X-Workspace"] === "rivera-resale" && !(c.body && c.body.action === "person") && !/[?&]desk=oddo-house/.test(c.url);
  });
}

(async function liveTokens() {
  const all = bootPeople();
  all.ctx.STATE.all = true;
  await all.ctx.load();
  const login = all.calls.filter(function (c) { return String(c.url).indexOf("/api/auth") === 0; });
  if (login.length !== 1 || login[0].body.action !== "login" || login[0].body.workspace !== "oddo-house" || login[0].body.pin !== "2468" || login[0].headers["X-Workspace"] !== "oddo-house") {
    fail("code-only saved desk must be exchanged once via login, got " + JSON.stringify(login.map(function (c) { return { body: c.body, headers: c.headers }; })));
  } else pass("code-only saved desk is exchanged once via login");
  const rows = parseDesks(all.store);
  const oddo = rows.filter(function (d) { return d.slug === "oddo-house"; })[0] || {};
  const rivera = rows.filter(function (d) { return d.slug === "rivera-resale"; })[0] || {};
  if (oddo.pin || rivera.pin || (rows.some(function (d) { return d && d.pin; }))) fail("exchange must drop saved pins, got " + JSON.stringify(rows));
  else pass("exchange drops saved pins");
  if (oddo.token !== "tok-oddo" || rivera.token !== "sess-1") fail("exchange must store the per-desk token, got " + JSON.stringify(rows));
  else pass("exchange stores the per-desk token");
  if (all.store.getItem("aia_pin")) fail("current leftover aia_pin must be dropped after exchange");
  else pass("current leftover aia_pin is dropped after exchange");

  const oddoApi = all.calls.filter(function (c) {
    const path = c.url.split("?")[0];
    return (path === "/api/admin" || path === "/api/jobs") && c.headers["X-Workspace"] === "oddo-house";
  });
  if (!oddoApi.length) fail("All desks must still fetch the other desk after exchange");
  else pass("All desks still fetches the other desk after exchange");
  if (!oddoApi.every(function (c) { return c.headers["X-Session"] === "tok-oddo" && !c.headers["X-Pin"]; })) {
    fail("All desks must send the other desk's token and never a stored pin, got " + JSON.stringify(oddoApi.map(function (c) { return c.headers; })));
  } else pass("All desks sends the other desk's token and never a stored pin");
  if (oddoApi.some(function (c) { return c.headers["X-Session"] === "sess-1"; })) {
    fail("All desks must not send the current desk's session to another desk");
  } else pass("All desks does not send the current desk's session to another desk");

  const cur = currentDeskCalls(all.calls);
  if (!cur.length || !cur.every(function (c) { return c.headers["X-Session"] === "sess-1" && !c.headers["X-Pin"]; })) {
    fail("current-desk load must send X-Session and no leftover X-Pin");
  } else pass("current-desk load sends X-Session and no leftover X-Pin");

  const sheet = bootPeople();
  await sheet.ctx.load();
  const before = sheet.calls.length;
  await sheet.ctx.openSheet(sheet.ctx.STATE.people[0] || PERSON, { id: "s_pat", desk: "oddo-house" });
  const after = sheet.calls.slice(before);
  const seatGet = after.filter(function (c) { return String(c.url).indexOf("/api/admin?") === 0; })[0];
  if (!seatGet || seatGet.headers["X-Workspace"] !== "oddo-house" || seatGet.headers["X-Session"] !== "tok-oddo" || seatGet.headers["X-Pin"]) {
    fail("other-desk sheet must send that desk's token and never a stored pin, got " + JSON.stringify(seatGet && seatGet.headers));
  } else pass("other-desk sheet sends that desk's token and never a stored pin");
  if (seatGet && seatGet.headers["X-Session"] === "sess-1") fail("other-desk sheet must not send the current desk's session");
  const personPost = after.filter(function (c) { return c.body && c.body.action === "person"; })[0];
  if (!personPost) fail("openSheet must still POST action=person");
  else pass("openSheet still POSTs action=person");
  const desks = (personPost && personPost.body && personPost.body.desks) || [];
  if (desks.some(function (d) { return d && ("pin" in d) && d.pin; }) || desks.some(function (d) { return d && d.slug === "oddo-house" && d.token !== "tok-oddo"; })) {
    fail("person POST must send tokens and never a stored pin, got " + JSON.stringify(desks));
  } else pass("person POST sends tokens and never a stored pin");
  if (personPost.headers["X-Pin"] || personPost.headers["X-Session"] !== "sess-1") {
    fail("person POST on the current desk must send X-Session and no leftover X-Pin");
  } else pass("person POST on the current desk sends X-Session and no leftover X-Pin");

  const denied = bootPeople({ authFail: true });
  const beforeSession = denied.store.getItem("aia_session");
  const beforeWs = denied.store.getItem("aia_ws");
  await denied.ctx.load();
  const deniedRows = parseDesks(denied.store);
  const deniedOddo = deniedRows.filter(function (d) { return d.slug === "oddo-house"; })[0] || {};
  if (deniedOddo.pin) fail("wrong-code exchange must drop the saved pin");
  else pass("wrong-code exchange drops the saved pin");
  if (deniedOddo.token) fail("wrong-code exchange must not store a token");
  else pass("wrong-code exchange does not store a token");
  if (denied.store.getItem("aia_session") !== beforeSession || denied.store.getItem("aia_ws") !== beforeWs) {
    fail("wrong-code exchange must not rewrite the current desk session");
  } else pass("wrong-code exchange does not rewrite the current desk session");
  if (denied.els["desk-code-prompt"] && denied.els["desk-code-prompt"].hidden) {
    fail("wrong-code exchange must show the per-desk code prompt");
  } else pass("wrong-code exchange shows the per-desk code prompt");

  const writeMutSrc = peopleJs.replace(
    "if (!r.ok || !(data.session && data.session.token)) {\n      markDeskNeedsCode(slug, name);\n      showDeskCodePrompt(slug, name, data.error || \"Desk name or code does not match.\");\n      return { slug: slug, name: name, token: \"\", needCode: true };\n    }",
    "if (!r.ok || !(data.session && data.session.token)) {\n      storeDeskToken(slug, \"tok-bad\", name);\n      localStorage.setItem(\"aia_pin\", code);\n      return { slug: slug, name: name, token: \"tok-bad\" };\n    }"
  );
  const writeMut = bootPeople({ src: writeMutSrc, authFail: true });
  await writeMut.ctx.load();
  const writeRows = parseDesks(writeMut.store);
  const writeOddo = writeRows.filter(function (d) { return d.slug === "oddo-house"; })[0] || {};
  if (!writeOddo.token && !writeMut.store.getItem("aia_pin")) fail("wrong-code writing state mutant must still write a token or pin");
  else pass("wrong-code writing state mutant still caught");

  const leakSrc = peopleJs.replace(
    "if (d && d.token) h[\"X-Session\"] = d.token;",
    "if (d && d.token) h[\"X-Session\"] = d.token; else h[\"X-Session\"] = localStorage.getItem(\"aia_session\");"
  );
  const leak = bootPeople({ src: leakSrc });
  await leak.ctx.load();
  const beforeLeak = leak.calls.length;
  await leak.ctx.openSheet(leak.ctx.STATE.people[0] || PERSON, { id: "s_pat", desk: "oddo-house" });
  const leakGet = leak.calls.slice(beforeLeak).filter(function (c) { return String(c.url).indexOf("/api/admin?") === 0; })[0];
  // After a successful exchange oddo has tok-oddo, so else-branch may not fire. Force a no-token other desk:
  const leak2 = bootPeople({ src: leakSrc, store: { aia_desks: JSON.stringify([{ slug: "rivera-resale", name: "Rivera resale", token: "sess-1" }, { slug: "oddo-house", name: "Oddo house" }]) } });
  leak2.ctx.STATE.people = [PERSON];
  const b2 = leak2.calls.length;
  await leak2.ctx.openSheet(PERSON, { id: "s_pat", desk: "oddo-house" });
  const leakGet2 = leak2.calls.slice(b2).filter(function (c) { return String(c.url).indexOf("/api/admin?") === 0; })[0];
  if (!leakGet2 || leakGet2.headers["X-Session"] !== "sess-1") fail("current desk session to another desk mutant must still send sess-1, got " + JSON.stringify(leakGet2 && leakGet2.headers));
  else pass("current desk session to another desk mutant still caught");

  if (process.exitCode) { console.error("check-people failed"); process.exit(process.exitCode); }
  console.log("check-people: ok");
})().catch(function (err) {
  fail((err && err.stack) || String(err));
  process.exit(1);
});
