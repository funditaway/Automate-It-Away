#!/usr/bin/env node
require("./_env-guard");
// Create path 2: spoken words land in #cs-words, then the same Draft it / studio-draft / review /
// sample cards / Yes / Stop / Kill path. Browser speech only. No audio upload. No new route.
// Not part of npm test. usage: node scripts/check-create-voice-ui.js [repoRoot]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
let failures = 0, passes = 0;
function fail(msg) { failures += 1; console.error("FAIL " + msg); }
function ok(cond, msg) { if (cond) passes += 1; else fail(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const html = read("create.html");
const js = read("create-simple.js");
const pkg = read("package.json");
const deskPath = path.join(root, "desk.html");
const cs = (html.match(/<section class="card cs" id="cs">[\s\S]*?<\/section>/) || [""])[0];
const code = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const TYPE_INSTEAD = "This phone will not take speech here. Type what you want automated.";
const HEARD_LINE = "When a parent asks to change pickup, draft a reply";

ok(fs.existsSync(deskPath) && fs.statSync(deskPath).size === 35012, "desk.html stays 35012 bytes");
ok(!/cs-talk|cs-voice|create-voice/.test(read("desk.html")), "desk.html does not mention Create voice");
ok(!/check-create-voice-ui/.test(pkg), "voice check stays out of npm test");
ok(html.indexOf("<script src=\"speech.js\"></script>") >= 0 && html.indexOf("<script src=\"speech.js\"></script>") < html.indexOf("<script src=\"create-simple.js\"></script>"), "create.html loads speech.js before create-simple.js");
ok(html.indexOf("<script src=\"card-rules.js\"></script>") < html.indexOf("<script src=\"create-simple.js\"></script>"), "card-rules.js still loads before create-simple.js");
["create-pack-install.js", "create-pack-download.js", "create-desk.js"].forEach(function (name) {
  ok(html.indexOf(name) >= 0, "create.html still loads " + name);
  ok(read(name).indexOf("Collect stays HOLD") >= 0, name + " still says Collect stays HOLD");
});
ok(/id="cs-words"/.test(cs) && /id="cs-draft">Draft it<\/button>/.test(cs), "same words box and Draft it button");
ok(/id="cs-talk"[^>]*>Talk<\/button>/.test(cs) && /id="cs-quiet"[^>]*>Quiet<\/button>/.test(cs), "Talk and Quiet are plain buttons");
ok(/id="cs-heard"/.test(cs), "spoken status line is on the Create card");
ok(/id="cs-yes">Yes<\/button>/.test(cs) && /id="cs-stop">Stop<\/button>/.test(cs) && /id="cs-kill">Kill<\/button>/.test(cs), "Yes, Stop, and Kill stay their own buttons");
ok(!/id="cs-(pack|example|when|webhook|import|export)"/.test(cs), "paths 3 to 7 are not on this card");
ok(!/\b(PASS|FAIL|HOLD)\b/.test(cs) && !/\b(PASS|FAIL|HOLD)\b/.test(code), "public Create voice has no PASS, FAIL, or HOLD");
ok(!/\b(Foreman|Mapper|Packer|Doer|Rail|Builder|Worker)\b/.test(cs + "\n" + code), "public Create voice has no crew names");
ok(!/9e21597/.test(cs + "\n" + js) && !/\b[0-9a-f]{40}\b/i.test(cs), "public Create voice has no tip");
ok(!/MediaRecorder|getUserMedia|audio\/webm|audio\/wav|audio\/ogg|FormData|\/api\/speech|<audio/i.test(js + "\n" + cs), "no audio capture or audio upload");
ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(js), "create-simple.js still builds with textContent");
const actions = [];
js.replace(/action:\s*"([a-z-]+)"/g, function (_, a) { actions.push(a); return _; });
ok(actions.length === 2 && actions.indexOf("studio-draft") >= 0 && actions.indexOf("save-ai") >= 0, "still only studio-draft and save-ai");
const fetches = js.match(/fetch\("([^"]+)"/g) || [];
ok(fetches.length >= 1 && fetches.every(function (f) { return f === "fetch(\"/api/desks\""; }), "still only /api/desks");
ok(!/buy-pack|checkout|stripe|\/api\/pay|Charge now|Pay now/i.test(js + "\n" + cs), "voice path adds no pay control");
ok(js.indexOf(TYPE_INSTEAD) >= 0, "unsupported speech tells the person to type");
ok(!fs.existsSync(path.join(root, "api", "speech.js")), "no new speech route");

function makeEl(tag) {
  const el = {
    tagName: String(tag || "div").toLowerCase(), attrs: {}, className: "", id: "", parts: [], hidden: false, disabled: false, value: "", handlers: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    appendChild(c) { c.parentNode = this; this.parts.push(c); return c; },
    removeChild(c) { this.parts = this.parts.filter(function (p) { return p !== c; }); return c; },
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); },
    focus() { el.page.focused = this.id; }
  };
  Object.defineProperty(el, "textContent", {
    get() { return this.parts.map(function (p) { return p.text !== undefined ? p.text : p.textContent; }).join(""); },
    set(v) { this.parts = [{ text: String(v == null ? "" : v) }]; }
  });
  Object.defineProperty(el, "firstChild", { get() { return this.parts[0] || null; } });
  return el;
}

const IDS = ["cs", "cs-rules-list", "cs-step", "cs-ask", "cs-review", "cs-test", "cs-done", "cs-open", "cs-open-desk", "cs-name", "cs-job", "cs-watches", "cs-drafts", "cs-needs", "cs-src", "cs-words", "cs-draft", "cs-try", "cs-edit", "cs-back", "cs-yes", "cs-stop", "cs-kill", "cs-note", "cs-review-note", "cs-test-note", "cs-samples", "cs-rules-note", "cs-talk", "cs-quiet", "cs-heard", "more-ways"];

function boot(opt) {
  const page = { focused: "", calls: [], stops: 0, listens: 0, pending: null };
  const els = {};
  IDS.forEach(function (id) {
    const el = makeEl(id === "cs-words" || id.indexOf("cs-") === 0 && /watches|drafts|needs/.test(id) ? "textarea" : "div");
    el.id = id;
    el.page = page;
    els[id] = el;
  });
  els["cs-talk"].className = "ghost";
  els["cs-talk"].attrs["aria-pressed"] = "false";
  const store = opt.storage || {};
  const speech = opt.speech || "words";
  const api = speech === "missing" ? undefined : {
    canListen: function () { return speech !== "off"; },
    stopTalk: function () { page.stops += 1; page.pending = null; },
    listen: function (okFn, errFn) {
      page.listens += 1;
      if (speech === "deny") { errFn("Mic is blocked. Allow it for this site, or type."); return; }
      if (speech === "empty") { errFn(""); return; }
      if (speech === "hold" || speech === "restart") {
        const prev = page.pending;
        page.pending = { ok: okFn, err: errFn };
        if (speech === "restart" && prev && prev.err) prev.err("Could not hear that. Type it.");
        return;
      }
      okFn(speech === "yes-words" ? "Yes send the invoice" : HEARD_LINE);
    }
  };
  const doc = {
    getElementById: function (id) { return els[id] || null; },
    createElement: function (tag) { const el = makeEl(tag); el.page = page; return el; }
  };
  const sandbox = {
    window: { AIACardRules: [], document: doc },
    URLSearchParams: URLSearchParams,
    location: { search: "", hash: "" },
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); }
    },
    fetch: async function (url, init) {
      const body = JSON.parse(init.body);
      page.calls.push({ url: url, body: body, headers: init.headers || {} });
      if (body.action === "studio-draft") {
        return { ok: true, json: async function () { return { ok: true, pack: { name: "P", kinds: "chore", fields: "who:text", ais: [{ name: "Lane", does: "Drafts pickup notes", steps: "qualify,do" }] } }; } };
      }
      if (body.action === "save-ai") return { ok: true, json: async function () { return { ok: true, ai: { name: body.name } }; } };
      return { ok: false, json: async function () { return { ok: false, error: "no" }; } };
    }
  };
  if (api) sandbox.window.AIASpeech = api;
  vm.runInNewContext(js, sandbox, { filename: "create-simple.js" });
  page.els = els;
  page.click = function (id) { (els[id].handlers.click || []).forEach(function (fn) { fn({ target: els[id] }); }); };
  return page;
}

function tick() { return new Promise(function (r) { setImmediate(r); }); }
async function settle() { for (var i = 0; i < 6; i++) await tick(); }

(async function main() {
  const open = { aia_ws: "Own Desk", aia_session: "tok", aia_pin: "1234" };

  {
    const w = boot({ speech: "words", storage: open });
    ok(w.els["cs-heard"].textContent === "Talk, or type in the box. Then tap Draft it.", "when speech works, the hint says talk or type");
    w.click("cs-talk");
    ok(w.els["cs-words"].value === HEARD_LINE, "spoken words land in #cs-words");
    ok(w.calls.length === 0, "speech does not draft by itself");
    ok(w.els["cs-ask"].hidden === false && w.els["cs-done"].hidden === true, "speech stays on step 1 until Draft it");
    w.click("cs-draft");
    await settle();
    ok(w.calls.length === 1 && w.calls[0].url === "/api/desks" && w.calls[0].body.action === "studio-draft" && w.calls[0].body.kind === "ai" && w.calls[0].body.brief === HEARD_LINE, "Draft it posts studio-draft with the spoken words");
    ok(w.calls[0].headers["X-Workspace"] === "own-desk" && w.calls[0].headers["X-Session"] === "tok", "draft still sends the open desk");
    ok(w.els["cs-ask"].hidden === true && w.els["cs-review"].hidden === false && w.els["cs-name"].value === "Lane", "review opens on the studio draft");
    w.click("cs-try");
    ok(w.els["cs-test"].hidden === false && w.els["cs-samples"].textContent.indexOf("Sample, made up") >= 0 && w.els["cs-samples"].textContent.indexOf("Nothing is sent.") >= 0, "sample cards still say they are made up and nothing is sent");
    w.click("cs-yes");
    await settle();
    ok(w.calls.length === 2 && w.calls[1].body.action === "save-ai" && w.calls[1].url === "/api/desks", "Yes still posts save-ai only");
    ok(w.els["cs-done"].textContent.indexOf("Nothing was sent or charged.") >= 0, "Yes still says nothing was sent or charged");
    ok(w.calls.every(function (c) { return c.url === "/api/desks" && (c.body.action === "studio-draft" || c.body.action === "save-ai"); }), "the spoken path never posts another action");
  }

  {
    const w = boot({ speech: "yes-words" });
    w.click("cs-talk");
    ok(w.els["cs-words"].value === "Yes send the invoice" && w.calls.length === 0 && w.els["cs-ask"].hidden === false, "saying Yes does not save, send, or charge");
  }

  {
    const w = boot({ speech: "hold" });
    w.els["cs-words"].value = "When a parent asks";
    w.click("cs-talk");
    ok(w.els["cs-talk"].className.indexOf("on") >= 0 && w.els["cs-talk"].getAttribute("aria-pressed") === "true", "Talk shows it is listening");
    w.pending.ok("to change pickup, draft a reply");
    ok(w.els["cs-words"].value === "When a parent asks to change pickup, draft a reply", "more speech adds to words already in the box");
    w.els["cs-words"].value = "Names";
    w.click("cs-talk");
    w.pending.ok("dates, or details only you know");
    ok(w.els["cs-words"].value === "Names dates, or details only you know", "a comma in speech stays in the box");
    w.els["cs-words"].value = "a".repeat(600);
    w.click("cs-talk");
    w.pending.ok("more words here");
    ok(w.els["cs-words"].value === "a".repeat(600), "speech does not grow the box past 600 characters");
  }

  {
    const w = boot({ speech: "hold" });
    w.click("cs-talk");
    const first = w.pending;
    w.click("cs-talk");
    first.ok("old words");
    ok(w.pending !== first && w.els["cs-words"].value === "" && w.els["cs-heard"].textContent === "Listening. Say what you want automated.", "a new Talk replaces the previous listen");
    w.pending.ok("new words");
    ok(w.els["cs-words"].value === "new words", "the latest listen lands in the box");
  }

  {
    const w = boot({ speech: "hold" });
    w.els["cs-words"].value = "a".repeat(590);
    w.click("cs-talk");
    w.pending.ok("hello world extra");
    ok(w.els["cs-words"].value === ("a".repeat(590) + " hello"), "a full box keeps the typed words and only a whole extra word");
  }

  {
    const w = boot({ speech: "deny" });
    w.click("cs-talk");
    ok(w.els["cs-heard"].textContent === "Mic is blocked. Allow it for this site, or type.", "a blocked mic says to allow it or type");
    ok(w.els["cs-words"].value === "" && w.focused === "cs-words", "a blocked mic focuses the box");
    ok(w.els["cs-talk"].getAttribute("aria-pressed") === "false", "Talk is not left on after a block");
  }

  {
    const w = boot({ speech: "empty" });
    w.click("cs-talk");
    ok(w.els["cs-heard"].textContent === "Could not hear that. Type it." && w.focused === "cs-words", "a missed listen says to type");
  }

  {
    const w = boot({ speech: "off" });
    ok(w.els["cs-heard"].textContent === TYPE_INSTEAD, "no speech on this phone says to type, right away");
    w.click("cs-talk");
    ok(w.listens === 0 && w.els["cs-heard"].textContent === TYPE_INSTEAD && w.focused === "cs-words", "Talk with no speech focuses the box and does not listen");
  }

  {
    const w = boot({ speech: "missing" });
    ok(w.els["cs-heard"].textContent === TYPE_INSTEAD, "a missing speech helper says to type");
    w.click("cs-talk");
    ok(w.listens === 0 && w.focused === "cs-words", "Talk still focuses the box when the helper is missing");
  }

  {
    const w = boot({ speech: "hold" });
    w.click("cs-talk");
    const late = w.pending.ok;
    w.click("cs-quiet");
    late("should not land");
    ok(w.stops >= 1 && w.els["cs-talk"].className === "ghost" && w.els["cs-words"].value === "", "Quiet stops listening and drops a late result");
    ok(w.els["cs-heard"].textContent === "Quiet. Type what you want automated, or tap Talk.", "Quiet says to type or talk");
  }

  {
    const w = boot({ speech: "restart" });
    w.click("cs-talk");
    w.click("cs-talk");
    ok(w.els["cs-heard"].textContent === "Listening. Say what you want automated." && w.els["cs-talk"].className.indexOf("on") >= 0 && w.els["cs-words"].value === "", "tapping Talk again does not keep the old error");
    w.pending.ok("draft a reminder for me");
    ok(w.els["cs-words"].value === "draft a reminder for me", "the latest listen still lands in the box");
  }

  {
    const w = boot({ speech: "words", storage: open });
    w.click("cs-talk");
    w.click("cs-draft");
    await settle();
    w.click("cs-stop");
    ok(w.els["cs-words"].value === HEARD_LINE && w.els["cs-ask"].hidden === false, "Stop clears the draft and keeps the spoken words");
    ok(w.els["cs-note"].textContent.indexOf("Stopped.") === 0, "Stop still says the draft is cleared");
    w.click("cs-kill");
    ok(w.els["cs-words"].value === "" && w.calls.length === 1, "Kill throws the words away and does not post again");
    ok(w.els["cs-note"].textContent.indexOf("Killed.") === 0, "Kill still says everything is thrown away");
  }

  {
    const w = boot({ speech: "words" });
    w.click("cs-talk");
    w.click("cs-draft");
    await settle();
    ok(w.calls.length === 0 && w.els["cs-review"].hidden === false && w.els["cs-open"].hidden === false, "with no open desk, spoken words still make a starter and do not post");
    ok(w.els["cs-src"].textContent.indexOf("Your desk is not open") >= 0, "the starter still says the desk is not open");
  }

  if (failures) {
    console.error(failures + " check(s) failed");
    process.exit(1);
  }
  console.log("check-create-voice-ui ok (" + passes + " passed)");
})().catch(function (e) {
  console.error("FAIL " + (e && e.stack || e));
  process.exit(1);
});
