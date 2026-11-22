require("./_env-guard");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) { console.log("ok  " + msg); }

const root = path.join(__dirname, "..");
const pages = [
  "desk.html", "drop.html", "widget.html", "create.html", "history.html",
  "pipes.html", "connections.html", "help.html", "rules.html", "more.html",
  "developer.html", "market.html", "account.html"
];
const need = ["Queue", "Drop", "Create", "History", "More", "has-desk-nav", "id=\"desk-nav\""];

pages.forEach((file) => {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  need.forEach((bit) => {
    if (!html.includes(bit)) fail(file + " missing " + bit);
  });
  if (!html.includes("desk-nav.css") && !html.includes("#desk-nav{")) {
    fail(file + " has no desk-nav CSS");
  }
  if (!/class="[^"]*\bhas-desk-nav\b/.test(html)) fail(file + " body missing has-desk-nav");
  else pass(file + " has five tabs + bar CSS");
  if (html.includes("data-tab=\"rules\"") || html.includes("data-tab=\"pipes\"") || html.includes("data-tab=\"people\"")) {
    fail(file + " still has Rules / Pipes / People on the tab bar");
  }
});

const desk = fs.readFileSync(path.join(root, "desk.html"), "utf8");
if (!desk.includes("desk-tabs")) fail("desk.html missing header tabs");
else pass("desk header shows Queue · Drop · Create · History · More");
if (!desk.includes("data-tab=\"create\"") || !desk.includes("data-tab=\"history\"")) {
  fail("desk.html missing Create / History tabs");
} else pass("desk tabs are Queue Drop Create History More");
if (!desk.includes("href=\"/create\"")) fail("desk.html Create tab is not /create");
else pass("desk Create tab href is /create");
if (!desk.includes("href=\"/history\"")) fail("desk.html History tab is not /history");
else pass("desk History tab href is /history");
const drop = fs.readFileSync(path.join(root, "drop.html"), "utf8");
if (!drop.includes("data-tab=\"create\"") || !drop.includes("data-tab=\"history\"")) {
  fail("drop.html missing Create / History tabs");
} else pass("drop tabs are Queue Drop Create History More");
if (drop.includes("http-equiv=\"refresh\"") || drop.includes("location.replace(\"/widget") || drop.length < 4000) {
  fail("drop.html must be the real Drop page, not a stub");
} else pass("drop.html is the real Drop page");
if (!drop.includes("Drop anything") || drop.includes("Drop something off") || drop.includes("List / sell")) {
  fail("drop.html must read as drop anything, not consign-only");
} else pass("drop.html copy is drop anything");
const pipes = fs.readFileSync(path.join(root, "pipes.html"), "utf8");
if (!pipes.includes("This desk") || pipes.includes("http-equiv=\"refresh\"") || pipes.length < 4000) {
  fail("pipes.html must be the real Pipes page, not a stub");
} else pass("pipes.html is the real Pipes page");
if (!pipes.includes("href=\"/pipes\"") && !fs.readFileSync(path.join(root, "more.html"), "utf8").includes("href=\"/pipes\"")) {
  fail("Pipes must stay reachable from More");
} else pass("Pipes is reachable");
const rules = fs.readFileSync(path.join(root, "rules.html"), "utf8");
if (!rules.includes("/api/rules")) fail("rules.html must stay the Rules page");
else pass("Rules page is intact");
const more = fs.readFileSync(path.join(root, "more.html"), "utf8");
if (!more.includes("href=\"/rules\"") || !more.includes("href=\"/pipes\"")) fail("more.html must keep Rules and Pipes links");
else pass("More keeps Rules and Pipes");
if (!more.includes("Lives here, not on the tab bar")) fail("more.html must say Rules/Pipes live under More");
else pass("Rules and Pipes copy is off the tab bar");
if (!more.includes("Creators Studio")) fail("more.html must link Creators Studio");
else pass("More links Creators Studio");
pages.concat(["desk-nav.js"]).forEach((file) => {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  if (html.includes("/desk#rules") && file !== "desk-nav.js") fail(file + " still links Rules to /desk#rules");
});
const nav = fs.readFileSync(path.join(root, "desk-nav.js"), "utf8");
if (!nav.includes("desk-ais.js")) fail("desk-nav.js must load desk-ais.js");
else pass("nav loads desk-ais");
if (!nav.includes("href: \"/create\"") || !nav.includes("href: \"/history\"")) fail("desk-nav.js missing Create / History hrefs");
else pass("Create and History hrefs are set");
if (!nav.includes("name === \"create\"") || !nav.includes("name === \"history\"")) fail("desk-nav.js must highlight /create and /history");
else pass("Create and History tabs highlight their pages");
if (nav.includes("href: \"/people\"")) fail("desk-nav.js still puts People on the bar");
else pass("People is off the tab bar");
if (nav.includes("href: \"/rules\"") || nav.includes("href: \"/pipes\"")) fail("desk-nav.js still puts Rules / Pipes on the bar");
else pass("Rules and Pipes are off the tab bar");
if (!nav.includes("href: \"/more\"") || !nav.includes("name === \"more\"")) fail("desk-nav.js More href is not /more");
else pass("More tab href is /more");
if (!nav.includes("href: \"/drop\"") || !nav.includes("return \"/drop\"")) fail("desk-nav.js Drop href is not /drop");
else pass("Drop tab href is /drop");
if (nav.includes("href: \"/widget\"") || nav.includes("return \"/widget\"")) fail("desk-nav.js Drop href must not be /widget");
else pass("Drop tab href is not /widget");
if (/display:\s*none/.test(desk) && /header span a/.test(desk)) {
  fail("desk.html still hides header links on phone");
}

const create = fs.readFileSync(path.join(root, "create.html"), "utf8");
const createJs = fs.readFileSync(path.join(root, "create-desk.js"), "utf8");
if (!create.includes("id=\"start-decide\"") || !create.includes("#start-decide[hidden]")) {
  fail("create.html must hide Yes/Stop until a draft exists");
} else pass("Create hides Yes/Stop until Ask the desk");
if (!create.includes("id=\"start-note\"") || !create.includes("id=\"start-open\"")) {
  fail("create.html must keep Ask / Yes / stranger notes on the start card");
} else pass("Create start notes stay on the start card");
if (!create.includes(".start-note.is-err") || !create.includes("var(--orange)") || !create.includes(".start-note.is-ok") || !create.includes("var(--teal)")) {
  fail("create.html start notes must paint orange fail / teal Yes on the start card");
} else pass("Create start notes paint orange fail / teal Yes");
if (!create.includes(".start-note.is-ask")) {
  fail("create.html empty Ask must paint a non-sticky is-ask note, not leftover is-err");
} else pass("Create empty Ask paints is-ask, not is-err");
if (createJs.includes('classList.toggle("err"') || createJs.includes('classList.toggle("ok"')) {
  fail("create-desk.js start notes must not reuse .err/.ok display:none");
} else pass("Create start notes do not reuse .err/.ok display:none");
if (create.indexOf("id=\"start-note\"") > create.indexOf("id=\"start-kind\"")) {
  fail("create.html start notes must sit above How / what so a phone sees them");
} else pass("Create start notes sit above the fields");
if (!create.includes("Open this desk") || !create.includes("Unlock this desk")) {
  fail("create.html start must offer Open this desk / Unlock this desk");
} else pass("Create start stranger path is Open / Unlock");
if (!create.includes("#start-queue[hidden]") || !create.includes("#start-note[hidden]")) {
  fail("create.html must hide Put it on the queue and start notes with hidden");
} else pass("Create start skip and notes honor hidden");
if (!create.includes("task") || !create.includes("idea") || !create.includes("project") || !create.includes("build")) {
  fail("create.html must start real AIA work kinds");
} else pass("Create kinds are task/errand/list/idea/project/build");
if (!createJs.includes("action: \"suggest\"") || !createJs.includes("/api/health") || !createJs.includes("A Desk AI can't draft on this phone yet.")) {
  fail("create-desk.js must ask the desk and stay honest when drafts are off");
} else pass("Create asks the desk and stays honest offline");
if (createJs.includes("XAI_API_KEY") || createJs.includes("this box") || create.includes("XAI_API_KEY") || create.includes("this box") || create.includes("when a key is on")) {
  fail("Create must not name XAI_API_KEY / this box / key-on jargon");
} else pass("Create drafts-off uses Desk AI voice");
["history.html", "more.html", "desk.html", "drop-agent.js"].forEach(function (file) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  if (src.indexOf("XAI_API_KEY") >= 0) fail(file + " still names XAI_API_KEY on public chrome");
  else if (/\bthis box\b/.test(src)) fail(file + " still says this box on public chrome");
  else pass(file + " Desk AI voice has no key / box jargon");
});
if (create.includes("$250") || create.includes("placeholder=\"250\"")) fail("create.html invented a $250 default");
else pass("Create has no $250 default");
if (!createJs.includes("save-ai") || !createJs.includes('id: "ai"')) fail("create-desk.js must name a desk AI");
else pass("Create can name a desk AI");
if (!createJs.includes("deskOpen") || !createJs.includes("Open or unlock this desk first")) fail("Create must gate Desk AI Bind behind an open desk");
else pass("Create gates Desk AI Bind");
["developer.html", "market.html", "create.html", "more.html", "help.html"].forEach(function (file) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  if (!html.includes("ai.aia")) fail(file + " missing ai.aia brand");
  else pass(file + " names ai.aia");
  if (html.includes("www.aia.aia")) fail(file + " branded www.aia.aia");
  else pass(file + " does not use www.aia.aia");
  if (file !== "more.html" && !html.includes(".aia")) fail(file + " missing .aia files");
});
if (!create.includes("You tap Yes or Stop.")) fail("create.html must keep Yes or Stop");
else pass("Create lead is Yes or Stop");
if (create.includes("What should the desk do?")) fail("create.html start still says What should the desk do");
else pass("Create start does not say What should the desk do");
if (!create.includes("What should a Desk AI draft?")) fail("create.html start must ask What should a Desk AI draft");
else pass("Create start is What should a Desk AI draft");
if (!create.includes(">Ask the desk<")) fail("create.html must keep the Ask the desk tap");
else pass("Create keeps Ask the desk");
if (createJs.includes("Yes or No") || createJs.includes("yes or no")) fail("create-desk.js still paints Yes or No as the rail");
else pass("Create form does not paint Yes or No");
if (!createJs.includes("You still tap Yes or Stop")) fail("create-desk.js must keep Yes or Stop");
else pass("Create form keeps Yes or Stop");
if (createJs.includes("Say what the desk should do.")) fail("create-desk.js empty start still says the desk should do");
else pass("Create empty start does not say the desk should do");
if (!createJs.includes("Say what a Desk AI should draft.")) fail("create-desk.js empty start must say Say what a Desk AI should draft");
else pass("Create empty start is Say what a Desk AI should draft");
if (createJs.includes('return startFail("Say what a Desk AI should draft.")')) {
  fail("create-desk.js empty Ask must not paint is-err via startFail");
} else pass("Create empty Ask does not use startFail / is-err");
if (!createJs.includes("function startHint") || !createJs.includes("function clearStartHint") || !createJs.includes('kind === "ask"')) {
  fail("create-desk.js empty Ask must use a non-sticky startHint path");
} else pass("Create empty Ask uses startHint");
if (!createJs.includes('addEventListener("input", clearStartHint') || !createJs.includes('addEventListener("focus", clearStartHint')) {
  fail("create-desk.js must clear empty-Ask hint on type / focus");
} else pass("Create empty Ask hint clears on type / focus");
if (createJs.includes('return fail("Say what a Desk AI should draft.")') || createJs.includes('return fail("Open a desk on this phone first.")')) {
  fail("create-desk.js start fail must stay on the start card, not #err under the form");
} else pass("Create start fail stays on the start card");
if (!createJs.includes("function startFail") || !createJs.includes("function startDone") || !createJs.includes("function paintStartDesk")) {
  fail("create-desk.js must paint start Ask / Yes / stranger notes on the start card");
} else pass("Create start paints Ask / Yes / stranger on the start card");
if (createJs.includes('classList.contains("err")')) {
  fail("create-desk.js paintStartDesk must check is-err, not leftover .err");
} else pass("Create start Open/Unlock clear does not check leftover .err");
if (!createJs.includes('classList.contains("is-err")')) {
  fail("create-desk.js paintStartDesk must clear the is-err Open/Unlock note");
} else pass("Create start Open/Unlock clear checks is-err");
if (!createJs.includes('addEventListener("pageshow"') || !/pageshow[\s\S]{0,80}paintStartDesk/.test(createJs)) {
  fail("create-desk.js must re-paint start desk on pageshow so Open/Unlock clear is honest");
} else pass("Create start re-paints on pageshow");
(function () {
  const from = createJs.indexOf('localStorage.setItem("aia_ws"');
  const to = createJs.indexOf('return done("Workspace is open');
  const block = from >= 0 && to > from ? createJs.slice(from, to) : "";
  if (block.indexOf("paintStartDesk()") < 0) {
    fail("create-desk.js must paintStartDesk after same-page Workspace open");
  } else pass("Create start clears Open/Unlock after same-page open");
})();


function workspacePinTag(js) {
  const at = js.indexOf("<label>Desk code</label>");
  if (at < 0) return "";
  const start = js.indexOf("<input", at);
  const end = js.indexOf(">", start);
  return start > at && end > start ? js.slice(start, end + 1) : "";
}
function teammatePinTag(js) {
  const at = js.indexOf("<label>Their desk code</label>");
  if (at < 0) return "";
  const start = js.indexOf("<input", at);
  const end = js.indexOf(">", start);
  return start > at && end > start ? js.slice(start, end + 1) : "";
}
function createDeskFaults(js) {
  const bad = [];
  if (!/\btype="password"/.test(workspacePinTag(js))) bad.push("field type=text");
  if (js.indexOf('localStorage.setItem("aia_pin"') >= 0) bad.push("pin stored");
  const from = js.indexOf('localStorage.setItem("aia_ws"');
  const to = js.indexOf('return done("Workspace is open');
  const openBlock = from >= 0 && to > from ? js.slice(from, to) : "";
  const keeps = openBlock.indexOf('localStorage.setItem("aia_session"') >= 0 || openBlock.indexOf("keepSession") >= 0;
  if (!keeps) bad.push("session not kept");
  return bad;
}
function applyCreateDeskMutant(js, kind) {
  if (kind === "field type=text") {
    return js.replace(
      '<label>Desk code</label><input name="pin" required type="password"',
      '<label>Desk code</label><input name="pin" required type="text"'
    );
  }
  if (kind === "pin stored") {
    return js
      .replace(
        'localStorage.setItem("aia_ws", slug);',
        'localStorage.setItem("aia_ws", slug);\n        localStorage.setItem("aia_pin", pin);'
      )
      .replace("try { localStorage.removeItem(\"aia_pin\"); } catch (e) {}", "");
  }
  if (kind === "session not kept") {
    return js
      .replace("if (data.session && data.session.token) localStorage.setItem(\"aia_session\", data.session.token);\n", "")
      .replace("        if (window.AIADesks && AIADesks.keepSession) AIADesks.keepSession(data);\n", "")
      .replace(/        if \(window\.AIADesks && AIADesks\.open\) \{\n          AIADesks\.open\(\{[\s\S]*?\}\);\n        \}\n/, "");
  }
  return js;
}

const liveCreateFaults = createDeskFaults(createJs);
if (liveCreateFaults.length) fail("create-desk.js leftover desk code faults: " + liveCreateFaults.join("; "));
else pass("create-desk.js keeps a leftover desk code out of storage after Open");
if (!/\btype="password"/.test(workspacePinTag(createJs)) || !/\bautocomplete="new-password"/.test(workspacePinTag(createJs))) {
  fail("create-desk.js Workspace desk code field must be type=password autocomplete=new-password");
} else pass("create-desk.js Workspace desk code field is masked");
if (!/\btype="password"/.test(teammatePinTag(createJs)) || !/\bautocomplete="new-password"/.test(teammatePinTag(createJs))) {
  fail("create-desk.js teammate pin field must be type=password autocomplete=new-password");
} else pass("create-desk.js teammate pin field is masked");

["field type=text", "pin stored", "session not kept"].forEach(function (kind) {
  const faults = createDeskFaults(applyCreateDeskMutant(createJs, kind));
  if (faults.indexOf(kind) < 0) fail("create-desk leftover-pin mutant survived: " + kind);
  else pass("create-desk leftover-pin mutant caught: " + kind);
});

function memStore(seed) {
  const m = Object.assign({}, seed || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? String(m[k]) : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    _raw: m
  };
}
function makeClassList() {
  const set = {};
  return {
    add: function (c) { set[c] = true; },
    remove: function (c) { delete set[c]; },
    contains: function (c) { return !!set[c]; },
    toggle: function (c, on) {
      if (on === false) delete set[c];
      else if (on === true) set[c] = true;
      else if (set[c]) delete set[c];
      else set[c] = true;
      return !!set[c];
    }
  };
}
function makeEl(id) {
  return {
    id: id,
    value: "",
    textContent: "",
    innerHTML: "",
    hidden: false,
    disabled: false,
    style: {},
    classList: makeClassList(),
    _fields: {},
    _on: {},
    setAttribute: function () {},
    getAttribute: function () { return null; },
    addEventListener: function (type, fn) {
      this._on[type] = this._on[type] || [];
      this._on[type].push(fn);
    },
    querySelector: function (sel) {
      if (sel === ".go") {
        if (!this._go) this._go = makeEl("go");
        return this._go;
      }
      return null;
    },
    closest: function () { return null; },
    reset: function () {},
    appendChild: function () {},
    parentNode: { appendChild: function () {} }
  };
}
function bootCreateDesk(src, seed, opts) {
  const store = memStore(seed);
  const fetches = [];
  const els = {};
  function el(id) {
    if (!els[id]) els[id] = makeEl(id);
    return els[id];
  }
  ["picks", "form", "ok", "err", "mine", "mode-simple", "mode-advanced", "start-open", "start-note"].forEach(el);
  const modes = makeEl("modes");
  const pickFns = [];
  const submitFns = [];
  el("picks").addEventListener = function (type, fn) { if (type === "click") pickFns.push(fn); };
  el("form").addEventListener = function (type, fn) { if (type === "submit") submitFns.push(fn); };
  const ctx = {
    Promise: Promise,
    JSON: JSON,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Date: Date,
    Error: Error,
    Math: Math,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    URLSearchParams: URLSearchParams,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    console: console,
    localStorage: store,
    location: { search: "", hash: "" },
    addEventListener: function () {},
    FormData: function (form) {
      const fields = (form && form._fields) || {};
      return { get: function (k) { return Object.prototype.hasOwnProperty.call(fields, k) ? fields[k] : ""; } };
    },
    document: {
      body: { classList: makeClassList() },
      getElementById: function (id) { return el(id); },
      querySelector: function (sel) { return sel === ".modes" ? modes : null; },
      createElement: function (tag) { return makeEl(tag); },
      addEventListener: function () {}
    },
    fetch: function (url, init) {
      fetches.push({ url: String(url), headers: (init && init.headers) || {}, body: init && init.body, method: (init && init.method) || "GET" });
      const status = opts && opts.status != null ? opts.status : 201;
      const body = (opts && opts.body) || {
        ok: true,
        session: { token: "sess-create-1" },
        you: { name: "Owner", role: "owner" },
        workspace: { slug: "rivera-resale", biz: "Rivera Resale", name: "Rivera Resale" }
      };
      return Promise.resolve({
        ok: status < 400,
        status: status,
        json: function () { return Promise.resolve(body); }
      });
    }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  const deskSwitch = fs.readFileSync(path.join(root, "desk-switch.js"), "utf8");
  vm.runInNewContext(deskSwitch + "\n" + src, ctx, { timeout: 4000 });
  const btn = { closest: function () { return { getAttribute: function () { return "workspace"; } }; } };
  pickFns.forEach(function (fn) { fn({ target: btn }); });
  el("form")._fields = { name: "Owner", biz: "Rivera Resale", pin: "4821" };
  return Promise.resolve()
    .then(function () { return submitFns[0]({ preventDefault: function () {} }); })
    .then(function () { return Promise.resolve(); })
    .then(function () {
      return {
        store: store,
        fetches: fetches,
        els: els,
        ctx: ctx,
        shopOpen: !!(ctx.AIADesks && ctx.AIADesks.shopOpen && ctx.AIADesks.shopOpen())
      };
    });
}

async function runCreateDeskPinTests() {
  const openOk = await bootCreateDesk(createJs, {});
  const authPosts = openOk.fetches.filter(function (f) {
    return String(f.url).indexOf("/api/auth") >= 0 && String(f.method).toUpperCase() === "POST";
  });
  if (!authPosts.length) fail("create Workspace Open must POST /api/auth");
  else pass("create Workspace Open POSTs /api/auth");
  const sentPin = authPosts.some(function (f) {
    const h = f.headers || {};
    const pinHdr = h["X-Pin"] || h["x-pin"];
    let bodyPin = "";
    try { bodyPin = (JSON.parse(f.body || "{}") || {}).pin; } catch (e) {}
    return pinHdr === "4821" && bodyPin === "4821";
  });
  if (!sentPin) fail("create Workspace Open must still send the typed desk code on the open request");
  else pass("create Workspace Open still sends the typed desk code");
  if (openOk.store.getItem("aia_pin")) fail("create Workspace Open must not store aia_pin, got " + openOk.store.getItem("aia_pin"));
  else pass("create Workspace Open does not store aia_pin");
  if (openOk.store.getItem("aia_session") !== "sess-create-1") fail("create Workspace Open must keep the returned session");
  else pass("create Workspace Open keeps the returned session");
  if (openOk.store.getItem("aia_ws") !== "rivera-resale") fail("create Workspace Open must keep the desk name");
  else pass("create Workspace Open keeps the desk name");
  if (!openOk.shopOpen) fail("shopOpen must be true after create Workspace Open with a session");
  else pass("shopOpen is true after create Workspace Open");
  let desks = [];
  try { desks = JSON.parse(openOk.store.getItem("aia_desks") || "[]"); } catch (e) { desks = []; }
  if (desks.some(function (d) { return d && "pin" in d && d.pin; })) fail("create Workspace Open must not leave a desk code on aia_desks");
  else pass("create Workspace Open does not leave a desk code on aia_desks");
  if (openOk.els["start-open"] && !openOk.els["start-open"].hidden) fail("create start gate must hide after Workspace Open");
  else pass("create start gate hides after Workspace Open");

  const leftover = await bootCreateDesk(createJs, {
    aia_desks: JSON.stringify([{ slug: "rivera-resale", name: "Rivera Resale", pin: "6612" }])
  });
  if (leftover.store.getItem("aia_pin")) fail("create Workspace Open must drop a leftover aia_pin");
  else pass("create Workspace Open drops a leftover aia_pin");
  let leftoverDesks = [];
  try { leftoverDesks = JSON.parse(leftover.store.getItem("aia_desks") || "[]"); } catch (e) { leftoverDesks = []; }
  if (leftoverDesks.some(function (d) { return d && d.slug === "rivera-resale" && "pin" in d; })) {
    fail("create Workspace Open must strip a leftover aia_desks pin");
  } else pass("create Workspace Open strips a leftover aia_desks pin");

  const denied = await bootCreateDesk(createJs, {}, { status: 401, body: { ok: false, error: "Desk code does not match this shop" } });
  if (denied.store.getItem("aia_pin") || denied.store.getItem("aia_session") || denied.store.getItem("aia_ws")) {
    fail("failed Workspace Open must not write session, pin, or desk name");
  } else pass("failed Workspace Open does not write session, pin, or desk name");

  const storedMutant = await bootCreateDesk(applyCreateDeskMutant(createJs, "pin stored"), {});
  if (storedMutant.store.getItem("aia_pin") !== "4821") fail("pin stored mutant must write aia_pin");
  else pass("pin stored mutant still caught on Open");

  const sessionMutant = await bootCreateDesk(applyCreateDeskMutant(createJs, "session not kept"), {});
  if (sessionMutant.store.getItem("aia_session")) fail("session not kept mutant must not write aia_session");
  else pass("session not kept mutant still caught on Open");
}

if (createJs.includes("Put the work on the queue, or Stop")) fail("create-desk.js drafts-off start still says Put the work, or Stop");
else pass("Create drafts-off start does not say Put the work, or Stop");
if (!createJs.includes("Yes puts the work on the queue. Stop discards it.")) {
  fail("create-desk.js drafts-off start must name Yes / Stop");
} else pass("Create drafts-off start names Yes / Stop");
if (!createJs.includes("skip.hidden = !!on") || !createJs.includes("start-queue")) {
  fail("create-desk.js must hide Put it on the queue while Yes / Stop decide");
} else pass("Create hides the skip while Yes / Stop decide");
if (!createJs.includes("You still tap Yes / Stop / Kill.")) {
  fail("create-desk.js start Yes handoff must name the Queue rail");
} else pass("Create start Yes handoff names Yes / Stop / Kill");
if (createJs.includes('return done("On the queue. Same Drop card.')) {
  fail("create-desk.js start Yes must not dump success under the form");
} else pass("Create start Yes stays on the start card");
if (!createJs.includes("function queueHref") || !createJs.includes("/desk?job=") || !createJs.includes("Open this card")) {
  fail("create-desk.js Yes handoff must link Open this card /desk?job=");
} else pass("Create Yes handoff links Open this card /desk?job=");
if (!create.includes("Open this card.")) fail("create.html start must name Open this card");
else pass("Create start hint names Open this card");
const yesNo = fs.readFileSync(path.join(root, "ACCOUNT-YES-NO.md"), "utf8");
const packMd = fs.readFileSync(path.join(root, "PACK.md"), "utf8");
if (yesNo.indexOf("Create → Queue handoff leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must record the Create → Queue handoff leftover");
} else pass("ACCOUNT-YES-NO records Create → Queue handoff leftover");
if (packMd.indexOf("Create → Queue handoff leftover:") < 0) {
  fail("PACK.md must record the Create → Queue handoff leftover");
} else pass("PACK.md records Create → Queue handoff leftover");
if (yesNo.indexOf("Create start leftover after that pass") < 0) fail("ACCOUNT-YES-NO must record the Create start leftover");
else pass("ACCOUNT-YES-NO records Create start leftover");
if (packMd.indexOf("Create start leftover:") < 0) fail("PACK.md must record the Create start leftover");
else pass("PACK.md records Create start leftover");
if (yesNo.indexOf("Create start card leftover after that pass") < 0) fail("ACCOUNT-YES-NO must record the Create start card leftover");
else pass("ACCOUNT-YES-NO records Create start card leftover");
if (packMd.indexOf("Create start card leftover:") < 0) fail("PACK.md must record the Create start card leftover");
else pass("PACK.md records Create start card leftover");
if (yesNo.indexOf("Create start Open/Unlock leftover after that pass") < 0) fail("ACCOUNT-YES-NO must record the Create start Open/Unlock leftover");
else pass("ACCOUNT-YES-NO records Create start Open/Unlock leftover");
if (packMd.indexOf("Create start Open/Unlock leftover:") < 0) fail("PACK.md must record the Create start Open/Unlock leftover");
else pass("PACK.md records Create start Open/Unlock leftover");
if (yesNo.indexOf("Counter Desk AI voice leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must record the Counter Desk AI voice leftover");
} else pass("ACCOUNT-YES-NO records Counter Desk AI voice leftover");
if (packMd.indexOf("Counter Desk AI voice leftover:") < 0) {
  fail("PACK.md must record the Counter Desk AI voice leftover");
} else pass("PACK.md records Counter Desk AI voice leftover");
const statusPage = fs.readFileSync(path.join(root, "status.html"), "utf8");
if (statusPage.indexOf("XAI_API_KEY") >= 0 || /Could not reach this box/.test(statusPage) || /Static host — API lives on the Vercel/.test(statusPage) || /\/drop\?ws=/.test(statusPage)) {
  fail("status.html still names keys, this box, Vercel, or /drop?ws= on the face");
} else if (!/Could not reach the desk/.test(statusPage) || !/From a link or this phone/.test(statusPage)) {
  fail("status.html must use Desk AI voice on catch / Drop");
} else if (/id="raw"|deskPublicDump/.test(statusPage) || /\bblob\b|Decentraweb/i.test(statusPage)) {
  fail("status.html still dumps raw health JSON or names blob / Decentraweb");
} else pass("status.html Counter chrome uses Desk AI voice; no raw dump");
if (yesNo.indexOf("Status raw health dump leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must record the Status raw health dump leftover");
} else pass("ACCOUNT-YES-NO records Status raw health dump leftover");
if (packMd.indexOf("Status raw health dump leftover:") < 0) {
  fail("PACK.md must record the Status raw health dump leftover");
} else pass("PACK.md records Status raw health dump leftover");

const history = fs.readFileSync(path.join(root, "history.html"), "utf8");
if (!history.includes("id=\"aia-line\"") || !history.includes("id=\"desk-pick\"") || !history.includes("does not invent")) {
  fail("history.html missing AIA trail / desk filter / honest empty");
} else pass("History has AIA trail, desk filter, honest empty");
if (!history.includes("citations") || !history.includes("aiaStatus")) fail("history.html must show AIA status and citations");
else pass("History shows AIA status and citations");
if (history.includes("$250") || /demo activity|fake job/i.test(history)) fail("history.html invented demo activity");
else pass("History has no fake activity");
if (history.includes("XAI_API_KEY") || history.includes("this box") || history.includes("draft key")) {
  fail("History must not name XAI_API_KEY / this box / draft key");
} else pass("History drafts-off uses Desk AI voice");
if (!history.includes("A Desk AI can't draft on this phone yet.") || !history.includes("A Desk AI can draft.")) {
  fail("History aia-line must use Desk AI voice");
} else pass("History aia-line uses Desk AI voice");
if (yesNo.indexOf("History drafts-off leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must record the History drafts-off leftover");
} else pass("ACCOUNT-YES-NO records History drafts-off leftover");
if (packMd.indexOf("History drafts-off leftover:") < 0) {
  fail("PACK.md must record the History drafts-off leftover");
} else pass("PACK.md records History drafts-off leftover");

const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
if (!/"source": "\/pipes"/.test(vercel) || !/\/pipes\.html/.test(vercel)) {
  fail("vercel.json must rewrite /pipes to pipes.html");
} else pass("/pipes rewrites to the Pipes page");
if (!/"source": "\/drop"/.test(vercel) || !/\/drop\.html/.test(vercel)) {
  fail("vercel.json must rewrite /drop to drop.html");
} else pass("/drop rewrites to the Drop page");
if (!/"source": "\/create"/.test(vercel) || !/\/create\.html/.test(vercel)) {
  fail("vercel.json must rewrite /create to create.html");
} else pass("/create rewrites to the Create page");
if (!/"source": "\/history"/.test(vercel) || !/\/history\.html/.test(vercel)) {
  fail("vercel.json must rewrite /history to history.html");
} else pass("/history rewrites to the History page");
if (!fs.existsSync(path.join(root, "drop.html"))) fail("drop.html missing — Vercel cleanUrls 404s /drop");
else pass("drop.html exists for /drop");
if (!fs.existsSync(path.join(root, "pipes.html"))) fail("pipes.html missing — Vercel cleanUrls 404s /pipes");
else pass("pipes.html exists for /pipes");
if (!fs.existsSync(path.join(root, "create.html"))) fail("create.html missing — Vercel cleanUrls 404s /create");
else pass("create.html exists for /create");
if (!fs.existsSync(path.join(root, "history.html"))) fail("history.html missing — Vercel cleanUrls 404s /history");
else pass("history.html exists for /history");

const theme = fs.readFileSync(path.join(root, "theme.css"), "utf8");
if (theme.includes("header span a { display: none; }")) {
  fail("theme.css still hides header links — iOS then has no Create/History");
} else pass("theme.css keeps header tabs visible");

const css = fs.readFileSync(path.join(root, "desk-nav.css"), "utf8");
if (!css.includes("#desk-nav") || !css.includes("position: fixed")) fail("desk-nav.css missing fixed bar");
else pass("desk-nav.css paints the bottom bar");

["drop.html", "widget.html"].forEach(function (file) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  if (!src.includes('href="/drop" data-tab="drop"')) fail(file + " Drop tab must open /drop");
  else pass(file + " Drop tab opens /drop");
  if (src.includes('href="/widget" data-tab="drop"')) fail(file + " Drop tab must not open /widget");
  else pass(file + " Drop tab is not /widget");
});

if (yesNo.indexOf("Drop tab full Drop leftover after that pass") < 0) fail("ACCOUNT-YES-NO must name Drop tab full Drop leftover");
else pass("ACCOUNT-YES-NO records Drop tab full Drop leftover");
if (packMd.indexOf("Drop tab full Drop leftover:") < 0) fail("PACK.md must name Drop tab full Drop leftover");
else pass("PACK.md records Drop tab full Drop leftover");

const jobs = fs.readFileSync(path.join(root, "api/jobs.js"), "utf8");
if (!jobs.includes("action === \"suggest\"") || !jobs.includes("saved: false")) fail("jobs.js must draft without inventing a saved card");
else pass("jobs.js suggest does not save a fake card");
const grok = fs.readFileSync(path.join(root, "api/_grok.js"), "utf8");
if (!grok.includes("normalizeCites") || !grok.includes("search_parameters")) fail("grok must keep citations and optional web search");
else pass("Grok stores citations when the web was used");

runCreateDeskPinTests().then(function () {
  if (process.exitCode) {
    console.error("check-desk-nav failed");
    process.exit(1);
  }
  console.log("check-desk-nav passed");
}).catch(function (err) {
  console.error(err);
  process.exit(1);
});
