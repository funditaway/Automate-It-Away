#!/usr/bin/env node
require("./_env-guard");
// Create path 4: Show an example fills #cs-words and paints one walkthrough
// (words, draft, sample cards) on this phone. Then the same Draft it → review →
// sample cards → Yes / Stop / Kill path. Previews only. No buy, charge, or new route.
// Not part of npm test. usage: node scripts/check-create-example-ui.js [repoRoot]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
let failures = 0, passes = 0;
function fail(msg) { failures += 1; console.error("FAIL " + msg); }
function ok(cond, msg) { if (cond) passes += 1; else fail(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const WORDS = "When the school moves pickup to 3:30, draft a note and a reply for me.";
const LEAD = "Here is one example. It stays on this phone. Nothing is saved or sent.";
const NOTE = "This is an example. Change any words you want. Then tap Draft it.";
const NEXT = "These words are in the box. Change them if you want, then tap Draft it.";
const PACKS = [
  "When a parent asks to change pickup, draft a reply and a reminder for me.",
  "When a bill is due, draft a reminder with the date and what it is for.",
  "When a neighbor asks for help, draft a short reply and a time that works.",
  "Remind me to water the plants every Tuesday, and draft a note if a day gets missed."
];
const HEARD_LINE = "When a parent asks to change pickup, draft a reply";

const html = read("create.html");
const js = read("create-simple.js");
const pkg = read("package.json");
const deskPath = path.join(root, "desk.html");
const cs = (html.match(/<section class="card cs" id="cs">[\s\S]*?<\/section>/) || [""])[0];
const code = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const starters = (cs.match(/<div class="chips" id="cs-starters"[\s\S]*?<\/div>/) || [""])[0];
const moreAt = html.indexOf('id="more-ways"');
const more = moreAt >= 0 ? html.slice(moreAt) : "";

ok(fs.existsSync(deskPath) && fs.statSync(deskPath).size === 35012, "desk.html stays 35012 bytes");
ok(!/cs-example|workedExample|Show an example/.test(read("desk.html")), "desk.html does not mention the example");
ok(!/check-create-example-ui/.test(pkg), "example check stays out of npm test");
ok(!/check-create-voice-ui/.test(pkg) && !/check-create-starter-pack-ui/.test(pkg), "voice and starter checks stay out of npm test");
ok(html.indexOf("<script src=\"card-rules.js\"></script>") < html.indexOf("<script src=\"speech.js\"></script>") && html.indexOf("<script src=\"speech.js\"></script>") < html.indexOf("<script src=\"create-simple.js\"></script>"), "card-rules.js and speech.js still load before create-simple.js");
["create-pack-idea.js", "create-pack-adv.js", "create-pack-install.js", "create-pack-download.js", "create-desk.js"].forEach(function (name) {
  ok(html.indexOf(name) >= 0, "create.html still loads " + name);
  ok(cs.indexOf(name) < 0, name + " is not inside the simple card");
});
["create-pack-install.js", "create-pack-download.js", "create-desk.js"].forEach(function (name) {
  ok(read(name).indexOf("Collect stays HOLD") >= 0, name + " still says Collect stays HOLD");
});
ok(more.indexOf('id="start"') >= 0 && more.indexOf('id="picks"') >= 0 && more.indexOf('id="mode-advanced"') >= 0, "other ways stay under Other ways");
ok(/id="cs-example"[^>]*>Show an example<\/button>/.test(cs), "Show an example is a button on the simple card");
ok(/id="cs-example-walk" hidden/.test(cs) && /id="cs-example-next">/.test(cs) && cs.indexOf(NEXT) >= 0, "the walkthrough starts hidden, with a plain next step");
ok(cs.indexOf('id="cs-example"') > cs.indexOf('id="cs-words"') && cs.indexOf('id="cs-example"') < cs.indexOf('id="cs-draft"'), "the example control sits with the words, before Draft it");
ok(starters.indexOf("cs-example") < 0 && starters.indexOf("Show an example") < 0, "the example is not one of the pack chips");
ok(/id="cs-starters"/.test(cs) && /id="cs-words"/.test(cs) && /id="cs-draft">Draft it<\/button>/.test(cs), "packs, the words box, and Draft it stay");
ok(/id="cs-talk"[^>]*>Talk<\/button>/.test(cs) && /id="cs-quiet"[^>]*>Quiet<\/button>/.test(cs), "Talk and Quiet stay on the card");
ok(/id="cs-yes">Yes<\/button>/.test(cs) && /id="cs-stop">Stop<\/button>/.test(cs) && /id="cs-kill">Kill<\/button>/.test(cs), "Yes, Stop, and Kill stay their own buttons");
// cs-import and cs-export bring in and save a file. pack stays reserved.
["pack"].forEach(function (name) {
  ok(cs.indexOf('id="cs-' + name + '"') < 0, "path id cs-" + name + " stays off this card");
});
ok(!/when this then that|if this then that|type="file"|<input[^>]*type="file"/i.test(cs), "no when-this-then-that picker and no file import on this card");
ok(!/\b(PASS|FAIL|HOLD)\b/.test(cs) && !/\b(PASS|FAIL|HOLD)\b/.test(code), "public Create card has no PASS, FAIL, or HOLD");
ok(!/\b(Foreman|Mapper|Packer|Doer|Rail|Builder|Worker)\b/.test(cs + "\n" + code), "public Create card has no crew names");
ok(!/\b[0-9a-f]{40}\b/i.test(cs), "public Create card has no tip");
ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(js), "create-simple.js still builds with textContent");
const actions = [];
js.replace(/action:\s*"([a-z-]+)"/g, function (_, a) { actions.push(a); return _; });
ok(actions.length === 2 && actions.indexOf("studio-draft") >= 0 && actions.indexOf("save-ai") >= 0, "still only studio-draft and save-ai");
const fetches = js.match(/fetch\("([^"]+)"/g) || [];
ok(fetches.length >= 1 && fetches.every(function (f) { return f === 'fetch("/api/desks"'; }), "still only /api/desks");
ok(!/buy-pack|checkout|stripe|\/api\/pay|Charge now|Pay now|\/market/i.test(js + "\n" + cs), "example path adds no pay or Market control");
ok(!fs.existsSync(path.join(root, "api", "example.js")) && !fs.readdirSync(path.join(root, "api")).some(function (name) { return /^example/i.test(name); }), "no new example route");
ok(js.indexOf(WORDS) >= 0 && js.indexOf(LEAD) >= 0 && PACKS.every(function (p) { return p !== WORDS && js.indexOf(p) >= 0; }), "one example, and the four packs stay their own words");

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

const IDS = ["cs", "cs-rules-list", "cs-step", "cs-ask", "cs-review", "cs-test", "cs-done", "cs-open", "cs-open-desk", "cs-name", "cs-job", "cs-watches", "cs-drafts", "cs-needs", "cs-src", "cs-words", "cs-draft", "cs-try", "cs-edit", "cs-back", "cs-yes", "cs-stop", "cs-kill", "cs-note", "cs-review-note", "cs-test-note", "cs-samples", "cs-rules-note", "cs-talk", "cs-quiet", "cs-heard", "cs-starters", "cs-starter-hint", "cs-example", "cs-example-walk", "cs-example-lead", "cs-example-draft", "cs-example-samples", "cs-example-next", "more-ways"];

function boot(opt) {
  const page = { focused: "", calls: [], stops: 0, listens: 0, pending: null };
  const els = {};
  IDS.forEach(function (id) {
    const el = makeEl(/words|watches|drafts|needs/.test(id) ? "textarea" : "div");
    el.id = id;
    el.page = page;
    els[id] = el;
  });
  els["cs-talk"].className = "ghost";
  els["cs-talk"].attrs["aria-pressed"] = "false";
  els["cs-example-walk"].hidden = true;
  const store = opt.storage || {};
  const speech = opt.speech || "off";
  const api = speech === "missing" ? undefined : {
    canListen: function () { return speech !== "off"; },
    stopTalk: function () { page.stops += 1; page.pending = null; },
    listen: function (okFn, errFn) {
      page.listens += 1;
      if (speech === "hold") { page.pending = { ok: okFn, err: errFn }; return; }
      okFn(HEARD_LINE);
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
  page.api = sandbox.window.AIACreateSimple;
  page.click = function (id) { (els[id].handlers.click || []).forEach(function (fn) { fn({ target: els[id] }); }); };
  page.chips = function () { return els["cs-starters"].parts.slice(); };
  page.chip = function (name) { return page.chips().filter(function (b) { return b.textContent === name; })[0] || null; };
  page.press = function (el) { (el.handlers.click || []).forEach(function (fn) { fn({ target: el }); }); };
  page.typeWords = function (value) {
    els["cs-words"].value = value;
    (els["cs-words"].handlers.input || []).forEach(function (fn) { fn({}); });
  };
  return page;
}

function tick() { return new Promise(function (r) { setImmediate(r); }); }
async function settle() { for (var i = 0; i < 6; i++) await tick(); }
function pressedNames(page) {
  return page.chips().filter(function (b) { return b.getAttribute("aria-pressed") === "true" && b.className === "on"; }).map(function (b) { return b.textContent; });
}

(async function main() {
  const bare = { window: { document: null }, console: console };
  vm.runInNewContext(js, bare, { filename: "create-simple.js" });
  const api = bare.window.AIACreateSimple;
  ok(api && typeof api.workedExample === "function" && typeof api.starterPacks === "function", "the example is available before the page paints");
  const ex = api ? api.workedExample() : {};
  ok(ex.words === WORDS && ex.words.length > 0 && ex.words.length <= 160, "the example is one short everyday sentence");
  ok(PACKS.indexOf(ex.words) < 0, "the example is not a copy of a pack");
  if (api) {
    const first = api.workedExample();
    first.words = "nope";
    ok(api.workedExample().words === WORDS, "changing the example object does not change the example");
    const draft = api.starterDraft(WORDS);
    ok(draft.job === WORDS && draft.name === "Helper: When the school" && draft.watches.length && draft.drafts.length && draft.needs.length, "the example draft is a name, one job, and the three lists");
    const lines = api.sampleDraft(draft, api.sampleCards()[0]).join(" ");
    ok(lines.indexOf("Nothing is sent.") >= 0, "an example sample still says nothing is sent");
  }
  ok(!/\b(PASS|FAIL|HOLD)\b|stripe|checkout|webhook|buy-pack|\/market|\bBuy\b/i.test(WORDS + "\n" + LEAD + "\n" + NOTE), "the example does not sell, charge, or use crew shorthand");

  const open = { aia_ws: "Own Desk", aia_session: "tok", aia_pin: "1234" };

  {
    const w = boot({ storage: open });
    ok(w.els["cs-example"].textContent === "Show an example" && w.els["cs-example"].getAttribute("aria-expanded") === "false" && w.els["cs-example-walk"].hidden === true, "the example starts closed");
    ok(w.chips().length === 4 && w.chips().every(function (b) { return b.textContent !== "Show an example"; }) && w.els["cs-words"].value === "" && w.calls.length === 0, "packs stay four chips and the example does not fill the box by itself");
    w.click("cs-example");
    ok(w.calls.length === 0 && w.listens === 0 && w.els["cs-ask"].hidden === false && w.els["cs-review"].hidden === true && w.els["cs-test"].hidden === true, "showing the example does not talk, draft, or leave step 1");
    ok(w.els["cs-words"].value === WORDS && pressedNames(w).length === 0, "the example puts its words in the box and does not select a pack");
    ok(w.els["cs-example"].textContent === "Hide the example" && w.els["cs-example"].getAttribute("aria-expanded") === "true" && w.els["cs-example-walk"].hidden === false, "the example opens on the card");
    ok(w.els["cs-example-lead"].textContent === LEAD && w.els["cs-note"].textContent === NOTE, "the example says it stays on this phone");
    const shown = w.els["cs-example-draft"].textContent;
    ok(shown.indexOf("The words") >= 0 && shown.indexOf(WORDS) >= 0 && shown.indexOf("Helper: When the school") >= 0 && shown.indexOf("One job") >= 0 && shown.indexOf("What it drafts") >= 0, "the walkthrough shows the words and the draft");
    ok(w.els["cs-example-samples"].parts.length === 3 && w.els["cs-example-samples"].textContent.indexOf("Sample, made up") >= 0 && w.els["cs-example-samples"].textContent.indexOf("Nothing is sent.") >= 0 && w.els["cs-example-samples"].textContent.indexOf("A parent asks to move Friday pickup to 4 pm") >= 0, "the walkthrough shows made-up sample cards");
    w.click("cs-example");
    ok(w.els["cs-example-walk"].hidden === true && w.els["cs-example"].textContent === "Show an example" && w.els["cs-words"].value === WORDS && w.calls.length === 0, "hiding the example keeps the words and does not post");
    w.click("cs-example");
    ok(w.els["cs-example-walk"].hidden === false && w.els["cs-words"].value === WORDS, "showing it again opens the same example");
  }

  {
    const w = boot({ storage: open });
    w.click("cs-example");
    w.typeWords(WORDS.replace("3:30", "4:00"));
    ok(w.els["cs-example-walk"].hidden === true && w.els["cs-example"].textContent === "Show an example" && w.els["cs-note"].textContent === "", "changing the words closes the example");
    w.click("cs-example");
    w.press(w.chip("Pickup changes"));
    ok(w.els["cs-words"].value === PACKS[0] && pressedNames(w).join(",") === "Pickup changes" && w.els["cs-example-walk"].hidden === true && w.calls.length === 0, "a pack still replaces the example words and does not post");
  }

  {
    const w = boot({});
    w.click("cs-example");
    w.click("cs-draft");
    await settle();
    ok(w.calls.length === 0 && w.els["cs-review"].hidden === false && w.els["cs-open"].hidden === false && w.els["cs-job"].value === WORDS, "with no open desk, Draft it uses the example words and does not post");
    ok(w.els["cs-src"].textContent.indexOf("Your desk is not open") >= 0, "the review still says the desk is not open");
    w.click("cs-try");
    ok(w.els["cs-test"].hidden === false && w.els["cs-samples"].textContent.indexOf("Sample, made up") >= 0 && w.els["cs-samples"].textContent.indexOf("Nothing is sent.") >= 0, "Try it on sample cards still says they are made up and nothing is sent");
    w.click("cs-yes");
    await settle();
    ok(w.calls.length === 0 && w.els["cs-test-note"].textContent.indexOf("Open your desk first") >= 0 && w.els["cs-test-note"].textContent.indexOf("Nothing was saved") >= 0, "Yes with no open desk saves nothing");
    w.click("cs-stop");
    ok(w.els["cs-words"].value === WORDS && w.els["cs-ask"].hidden === false && w.els["cs-note"].textContent.indexOf("Stopped.") === 0, "Stop keeps the example words");
    w.click("cs-kill");
    ok(w.els["cs-words"].value === "" && w.els["cs-example-walk"].hidden === true && w.els["cs-example"].textContent === "Show an example" && w.calls.length === 0 && w.els["cs-note"].textContent.indexOf("Killed.") === 0, "Kill throws the example away");
    w.click("cs-draft");
    await settle();
    ok(w.calls.length === 0 && w.els["cs-note"].textContent.indexOf("Say what you want automated first.") === 0, "Draft it still asks for words when the box is empty");
  }

  {
    const w = boot({ storage: open });
    w.click("cs-example");
    const tweaked = WORDS.replace("note", "short note");
    w.typeWords(tweaked);
    w.click("cs-draft");
    await settle();
    const draft = w.calls[0];
    ok(w.calls.length === 1 && draft.url === "/api/desks" && draft.body.action === "studio-draft" && draft.body.kind === "ai" && draft.body.brief === tweaked, "Draft it posts studio-draft with the changed example words");
    ok(!draft.body.pack && !draft.body.id && draft.headers["X-Workspace"] === "own-desk" && draft.headers["X-Session"] === "tok", "the draft post is the words only, for this open desk");
    ok(w.els["cs-review"].hidden === false && w.els["cs-name"].value === "Lane", "review still opens on the studio draft");
    w.click("cs-try");
    w.click("cs-yes");
    await settle();
    const saved = w.calls[1];
    ok(w.calls.length === 2 && saved.url === "/api/desks" && saved.body.action === "save-ai" && saved.body.does === "Drafts pickup notes", "Yes still posts save-ai only");
    ok(w.els["cs-done"].textContent.indexOf("Nothing was sent or charged.") >= 0, "Yes still says nothing was sent or charged");
    ok(w.calls.every(function (c) { return c.url === "/api/desks" && (c.body.action === "studio-draft" || c.body.action === "save-ai"); }), "the example path never posts another action");
  }

  {
    const w = boot({ speech: "hold" });
    w.click("cs-talk");
    const late = w.pending && w.pending.ok;
    w.click("cs-example");
    if (late) late("old words that should not land");
    ok(w.stops >= 1 && w.els["cs-words"].value === WORDS && w.els["cs-talk"].getAttribute("aria-pressed") === "false" && w.els["cs-example-walk"].hidden === false, "showing an example stops Talk and keeps the example words");
    ok(w.els["cs-heard"].textContent === "Quiet. Type what you want automated, or tap Talk.", "showing an example while Talk is on does not leave it listening");
    w.click("cs-talk");
    ok(w.listens >= 2 && w.pending && w.els["cs-words"].value === WORDS, "Talk still listens after the example is open");
    w.pending.ok("and mention Friday");
    ok(w.els["cs-words"].value === WORDS + " and mention Friday" && w.els["cs-example-walk"].hidden === true && w.calls.length === 0, "more speech adds to the example words and closes the walkthrough");
    w.click("cs-quiet");
    ok(w.els["cs-heard"].textContent === "Quiet. Type what you want automated, or tap Talk.", "Quiet still says to type or talk");
  }

  {
    const w = boot({ speech: "words" });
    w.click("cs-example");
    w.click("cs-talk");
    ok(w.els["cs-words"].value.indexOf(WORDS) === 0 && w.els["cs-words"].value.indexOf(HEARD_LINE) > 0 && w.calls.length === 0 && w.els["cs-example-walk"].hidden === true, "Talk still adds words and does not draft by itself");
  }

  if (failures) {
    console.error(failures + " check(s) failed");
    process.exit(1);
  }
  console.log("check-create-example-ui ok (" + passes + " passed)");
})().catch(function (e) {
  console.error("FAIL " + (e && e.stack || e));
  process.exit(1);
});
