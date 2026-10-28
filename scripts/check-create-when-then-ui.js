#!/usr/bin/env node
require("./_env-guard");
// Create path 5: pick what it watches and what it drafts. That builds the words
// in #cs-words. The person can still edit them, then Draft it, review, sample
// cards, and Yes / Stop / Kill. Same posts. No buy, charge, or new route.
// Not part of npm test. usage: node scripts/check-create-when-then-ui.js [repoRoot]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
let failures = 0, passes = 0;
function fail(msg) { failures += 1; console.error("FAIL " + msg); }
function ok(cond, msg) { if (cond) passes += 1; else fail(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const WHEN_NOTE = "These words come from what it watches and what it drafts. Change them if you want, then tap Draft it.";
const HINT = "Choose what it watches and what it drafts. Nothing is saved yet. You can change the words after.";
const SUMMARY = "Pick when this happens and what to draft";
const PACKS = [
  "When a parent asks to change pickup, draft a reply and a reminder for me.",
  "When a bill is due, draft a reminder with the date and what it is for.",
  "When a neighbor asks for help, draft a short reply and a time that works.",
  "Remind me to water the plants every Tuesday, and draft a note if a day gets missed."
];
const EXAMPLE = "When the school moves pickup to 3:30, draft a note and a reply for me.";
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
ok(!/cs-when|cs-then|whenThenWords/.test(read("desk.html")), "desk.html does not mention the picker");
ok(!/check-create-when-then-ui/.test(pkg), "when-then check stays out of npm test");
ok(!/check-create-voice-ui/.test(pkg) && !/check-create-starter-pack-ui/.test(pkg) && !/check-create-example-ui/.test(pkg), "earlier Create checks stay out of npm test");
ok(html.indexOf("<script src=\"card-rules.js\"></script>") < html.indexOf("<script src=\"speech.js\"></script>") && html.indexOf("<script src=\"speech.js\"></script>") < html.indexOf("<script src=\"create-simple.js\"></script>"), "card-rules.js and speech.js still load before create-simple.js");
["create-pack-idea.js", "create-pack-adv.js", "create-pack-install.js", "create-pack-download.js", "create-desk.js"].forEach(function (name) {
  ok(html.indexOf(name) >= 0, "create.html still loads " + name);
  ok(cs.indexOf(name) < 0, name + " is not inside the simple card");
});
["create-pack-install.js", "create-pack-download.js", "create-desk.js"].forEach(function (name) {
  ok(read(name).indexOf("Collect stays HOLD") >= 0, name + " still says Collect stays HOLD");
});
ok(more.indexOf('id="start"') >= 0 && more.indexOf('id="picks"') >= 0 && more.indexOf('id="mode-advanced"') >= 0, "other ways stay under Other ways");
ok(/<details id="cs-when-pick">/.test(cs) && cs.indexOf(SUMMARY) >= 0 && cs.indexOf(HINT) >= 0, "the picker is on the simple card, in plain words");
ok(cs.indexOf('id="cs-starters"') < cs.indexOf('id="cs-when-pick"') && cs.indexOf('id="cs-when-pick"') < cs.indexOf('id="cs-words"'), "the picker sits between the packs and the words");
ok(cs.indexOf('id="cs-when">') > cs.indexOf('id="cs-when-pick"') && cs.indexOf('id="cs-then">') > cs.indexOf('id="cs-when">') && cs.indexOf('id="cs-then">') < cs.indexOf('id="cs-words"'), "when and then are their own controls, before the words");
ok(/<label for="cs-when">When this happens<\/label>/.test(cs) && /<label for="cs-then">Then draft this<\/label>/.test(cs), "the labels say when this happens and then draft this");
ok(starters.indexOf("cs-when") < 0 && starters.indexOf("cs-then") < 0 && starters.indexOf(SUMMARY) < 0, "the picker is not one of the pack chips");
ok(cs.indexOf('id="cs-example"') > cs.indexOf('id="cs-words"') && /id="cs-example"[^>]*>Show an example<\/button>/.test(cs), "Show an example stays with the words");
ok(/id="cs-starters"/.test(cs) && /id="cs-words"/.test(cs) && /id="cs-draft">Draft it<\/button>/.test(cs), "packs, the words box, and Draft it stay");
ok(/id="cs-talk"[^>]*>Talk<\/button>/.test(cs) && /id="cs-quiet"[^>]*>Quiet<\/button>/.test(cs), "Talk and Quiet stay on the card");
ok(/id="cs-yes">Yes<\/button>/.test(cs) && /id="cs-stop">Stop<\/button>/.test(cs) && /id="cs-kill">Kill<\/button>/.test(cs), "Yes, Stop, and Kill stay their own buttons");
// cs-webhook is the AI / site control. import, export, and pack stay reserved.
["import", "export", "pack"].forEach(function (name) {
  ok(cs.indexOf('id="cs-' + name + '"') < 0, "path id cs-" + name + " stays off this card");
});
ok(!/when this then that|if this then that|type="file"|<input[^>]*type="file"/i.test(cs), "the card stays in plain words and has no file import");
ok(!/\b(PASS|FAIL|HOLD)\b/.test(cs) && !/\b(PASS|FAIL|HOLD)\b/.test(code), "public Create card has no PASS, FAIL, or HOLD");
ok(!/\b(Foreman|Mapper|Packer|Doer|Rail|Builder|Worker)\b/.test(cs + "\n" + code), "public Create card has no crew names");
ok(!/\b[0-9a-f]{40}\b/i.test(cs), "public Create card has no tip");
ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(js), "create-simple.js still builds with textContent");
const actions = [];
js.replace(/action:\s*"([a-z-]+)"/g, function (_, a) { actions.push(a); return _; });
ok(actions.length === 2 && actions.indexOf("studio-draft") >= 0 && actions.indexOf("save-ai") >= 0, "still only studio-draft and save-ai");
const fetches = js.match(/fetch\("([^"]+)"/g) || [];
ok(fetches.length >= 1 && fetches.every(function (f) { return f === 'fetch("/api/desks"'; }), "still only /api/desks");
ok(!/buy-pack|checkout|stripe|\/api\/pay|Charge now|Pay now|\/market/i.test(js + "\n" + cs), "when-then path adds no pay or Market control");
ok(!fs.existsSync(path.join(root, "api", "when.js")) && !fs.existsSync(path.join(root, "api", "then.js")) && !fs.readdirSync(path.join(root, "api")).some(function (name) { return /^(when|then|webhook|import|export)/i.test(name); }), "no new when, then, webhook, import, or export route");

function makeEl(tag) {
  const el = {
    tagName: String(tag || "div").toLowerCase(), attrs: {}, className: "", id: "", parts: [], hidden: false, disabled: false, value: "", open: false, handlers: {},
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

const IDS = ["cs", "cs-rules-list", "cs-step", "cs-ask", "cs-review", "cs-test", "cs-done", "cs-open", "cs-open-desk", "cs-name", "cs-job", "cs-watches", "cs-drafts", "cs-needs", "cs-src", "cs-words", "cs-draft", "cs-try", "cs-edit", "cs-back", "cs-yes", "cs-stop", "cs-kill", "cs-note", "cs-review-note", "cs-test-note", "cs-samples", "cs-rules-note", "cs-talk", "cs-quiet", "cs-heard", "cs-starters", "cs-starter-hint", "cs-example", "cs-example-walk", "cs-example-lead", "cs-example-draft", "cs-example-samples", "cs-example-next", "cs-when-pick", "cs-when-hint", "cs-when", "cs-then", "more-ways"];

function boot(opt) {
  const page = { focused: "", calls: [], stops: 0, listens: 0, pending: null };
  const els = {};
  IDS.forEach(function (id) {
    const el = makeEl(id === "cs-when" || id === "cs-then" ? "select" : /words|watches|drafts|needs/.test(id) ? "textarea" : "div");
    el.id = id;
    el.page = page;
    els[id] = el;
  });
  els["cs-talk"].className = "ghost";
  els["cs-talk"].attrs["aria-pressed"] = "false";
  els["cs-example-walk"].hidden = true;
  els["cs-when-pick"].open = false;
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
  page.choose = function (id, value) {
    els[id].value = value;
    (els[id].handlers.change || []).forEach(function (fn) { fn({}); });
  };
  page.typeWords = function (value) {
    els["cs-words"].value = value;
    (els["cs-words"].handlers.input || []).forEach(function (fn) { fn({}); });
  };
  page.optionLabels = function (id) {
    return els[id].parts.filter(function (o) { return o.value; }).map(function (o) { return o.textContent; });
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
  ok(api && typeof api.whenChoices === "function" && typeof api.thenChoices === "function" && typeof api.whenThenWords === "function", "when and then are available before the page paints");
  const whens = api ? api.whenChoices() : [];
  const thens = api ? api.thenChoices() : [];
  ok(whens.length === 4 && thens.length === 4, "a short list of when choices and then choices");
  const seen = {};
  const sentences = [];
  whens.forEach(function (w) {
    ok(w.id && w.label && w.phrase && w.label.length <= 40, "when choice " + w.label + " is a short everyday line");
    thens.forEach(function (t) {
      const sentence = api.whenThenWords(w.id, t.id);
      sentences.push(sentence);
      ok(sentence.indexOf("When " + w.phrase + ", draft " + t.phrase + ".") === 0 && sentence.length <= 160, "when " + w.label + " and then " + t.label + " build one sentence");
      ok(PACKS.indexOf(sentence) < 0 && sentence !== EXAMPLE, "that sentence is not a pack and not the example");
      ok(!seen[sentence], "each when and then pair builds its own sentence");
      seen[sentence] = true;
    });
  });
  thens.forEach(function (t) {
    ok(t.id && t.label && t.phrase && t.label.length <= 40, "then choice " + t.label + " is a short everyday line");
  });
  ok(api.whenThenWords("", "") === "" && api.whenThenWords(whens[0].id, "") === "" && api.whenThenWords("nope", thens[0].id) === "", "a half choice does not build words");
  if (api) {
    const first = api.whenChoices();
    first[0].phrase = "nope";
    first.push({ id: "extra", label: "Extra", phrase: "extra" });
    ok(api.whenChoices().length === 4 && api.whenChoices()[0].phrase === whens[0].phrase && api.whenThenWords(whens[0].id, thens[0].id) === sentences[0], "changing the list does not change the choices");
  }
  const blob = whens.concat(thens).map(function (x) { return x.label + "\n" + x.phrase; }).join("\n") + "\n" + sentences.join("\n") + "\n" + WHEN_NOTE + "\n" + HINT + "\n" + SUMMARY;
  ok(!/\b(PASS|FAIL|HOLD)\b|stripe|checkout|webhook|buy-pack|\/market|\bBuy\b|Pay now|Charge now/i.test(blob), "the choices do not sell, charge, or use crew shorthand");
  ok(!/\b(Foreman|Mapper|Packer|Doer|Rail|Builder|Worker)\b/.test(blob), "the choices are everyday words");

  const open = { aia_ws: "Own Desk", aia_session: "tok", aia_pin: "1234" };
  const sentence = sentences[0];

  {
    const w = boot({});
    ok(w.els["cs-when-pick"].open === false && w.els["cs-words"].value === "" && w.calls.length === 0 && w.els["cs-ask"].hidden === false, "the picker starts closed and does not fill the box");
    ok(w.optionLabels("cs-when").join("|") === whens.map(function (x) { return x.label; }).join("|"), "when lists what it watches");
    ok(w.optionLabels("cs-then").join("|") === thens.map(function (x) { return x.label; }).join("|"), "then lists what it drafts");
    ok(w.els["cs-when"].parts[0].textContent === "Choose what it watches" && w.els["cs-then"].parts[0].textContent === "Choose what it drafts", "each list starts with a plain choose line");
    ok(w.chips().length === 4 && w.chips().every(function (b) { return b.textContent !== SUMMARY && w.optionLabels("cs-when").indexOf(b.textContent) < 0; }), "packs stay four chips, separate from the picker");
    w.els["cs-when-pick"].open = true;
    w.choose("cs-when", whens[0].id);
    ok(w.els["cs-words"].value === "" && w.calls.length === 0 && w.listens === 0 && w.els["cs-when"].value === whens[0].id, "picking only a when does not fill the box or post");
    w.choose("cs-then", thens[0].id);
    ok(w.els["cs-words"].value === sentence && w.focused === "cs-words" && w.els["cs-note"].textContent === WHEN_NOTE, "picking a when and a then fills the words");
    ok(w.calls.length === 0 && w.els["cs-ask"].hidden === false && w.els["cs-review"].hidden === true && w.els["cs-when-pick"].open === true, "choosing stays on step 1 and does not draft");
    ok(pressedNames(w).length === 0 && w.els["cs-example-walk"].hidden === true, "choosing does not select a pack or open the example");
    w.choose("cs-when", whens[2].id);
    const other = api.whenThenWords(whens[2].id, thens[0].id);
    ok(w.els["cs-words"].value === other && w.els["cs-when"].value === whens[2].id && w.els["cs-then"].value === thens[0].id, "another when replaces the words");
    const tweaked = other.replace("draft", "please draft");
    w.typeWords(tweaked);
    ok(w.els["cs-words"].value === tweaked && w.els["cs-when"].value === "" && w.els["cs-then"].value === "" && w.els["cs-note"].textContent === "", "changing the words clears the picker and keeps the edit");
    w.typeWords(other);
    ok(w.els["cs-when"].value === whens[2].id && w.els["cs-then"].value === thens[0].id, "the picker matches again when the words match");
  }

  {
    const w = boot({});
    w.els["cs-when-pick"].open = true;
    w.choose("cs-when", whens[1].id);
    w.choose("cs-then", thens[1].id);
    const built = api.whenThenWords(whens[1].id, thens[1].id);
    w.choose("cs-then", "");
    ok(w.els["cs-words"].value === built && w.els["cs-when"].value === "" && w.els["cs-then"].value === "" && w.els["cs-when-pick"].open === true && w.calls.length === 0, "clearing one side keeps the words and clears both choices");
    w.press(w.chip("Pickup changes"));
    ok(w.els["cs-words"].value === PACKS[0] && pressedNames(w).join(",") === "Pickup changes" && w.els["cs-when"].value === "" && w.els["cs-when-pick"].open === false && w.calls.length === 0, "a pack still replaces the words and closes the picker");
    w.els["cs-when-pick"].open = true;
    w.choose("cs-when", whens[0].id);
    w.choose("cs-then", thens[3].id);
    w.click("cs-example");
    ok(w.els["cs-words"].value === EXAMPLE && w.els["cs-example-walk"].hidden === false && w.els["cs-when"].value === "" && w.els["cs-then"].value === "" && w.els["cs-when-pick"].open === false && pressedNames(w).length === 0 && w.calls.length === 0, "Show an example still replaces the words and does not post");
  }

  {
    const w = boot({});
    w.choose("cs-when", whens[0].id);
    w.choose("cs-then", thens[2].id);
    const tweaked = api.whenThenWords(whens[0].id, thens[2].id).replace("list", "short list");
    w.typeWords(tweaked);
    w.click("cs-draft");
    await settle();
    ok(w.calls.length === 0 && w.els["cs-review"].hidden === false && w.els["cs-open"].hidden === false && w.els["cs-job"].value === tweaked, "with no open desk, Draft it uses the changed words and does not post");
    ok(w.els["cs-src"].textContent.indexOf("Your desk is not open") >= 0, "the review still says the desk is not open");
    w.click("cs-try");
    ok(w.els["cs-test"].hidden === false && w.els["cs-samples"].textContent.indexOf("Sample, made up") >= 0 && w.els["cs-samples"].textContent.indexOf("Nothing is sent.") >= 0 && w.els["cs-samples"].textContent.indexOf("A parent asks to move Friday pickup to 4 pm") >= 0, "Try it on sample cards still says they are made up and nothing is sent");
    w.click("cs-yes");
    await settle();
    ok(w.calls.length === 0 && w.els["cs-test-note"].textContent.indexOf("Open your desk first") >= 0 && w.els["cs-test-note"].textContent.indexOf("Nothing was saved") >= 0, "Yes with no open desk saves nothing");
    w.click("cs-stop");
    ok(w.els["cs-words"].value === tweaked && w.els["cs-ask"].hidden === false && w.els["cs-note"].textContent.indexOf("Stopped.") === 0, "Stop keeps the words");
    w.click("cs-kill");
    ok(w.els["cs-words"].value === "" && w.els["cs-when"].value === "" && w.els["cs-then"].value === "" && w.els["cs-when-pick"].open === false && w.els["cs-example-walk"].hidden === true && w.calls.length === 0 && w.els["cs-note"].textContent.indexOf("Killed.") === 0, "Kill throws the words and the picker away");
    w.click("cs-draft");
    await settle();
    ok(w.calls.length === 0 && w.els["cs-note"].textContent.indexOf("Say what you want automated first.") === 0, "Draft it still asks for words when the box is empty");
  }

  {
    const w = boot({ storage: open });
    w.choose("cs-when", whens[3].id);
    w.choose("cs-then", thens[0].id);
    const built = api.whenThenWords(whens[3].id, thens[0].id);
    const tweaked = built.replace("short reply", "kind reply");
    w.typeWords(tweaked);
    w.click("cs-draft");
    await settle();
    const draft = w.calls[0];
    ok(w.calls.length === 1 && draft.url === "/api/desks" && draft.body.action === "studio-draft" && draft.body.kind === "ai" && draft.body.brief === tweaked, "Draft it posts studio-draft with the changed words");
    ok(!draft.body.pack && !draft.body.id && draft.headers["X-Workspace"] === "own-desk" && draft.headers["X-Session"] === "tok", "the draft post is the words only, for this open desk");
    ok(w.els["cs-review"].hidden === false && w.els["cs-name"].value === "Lane", "review still opens on the studio draft");
    w.click("cs-try");
    w.click("cs-yes");
    await settle();
    const saved = w.calls[1];
    ok(w.calls.length === 2 && saved.url === "/api/desks" && saved.body.action === "save-ai" && saved.body.does === "Drafts pickup notes", "Yes still posts save-ai only");
    ok(w.els["cs-done"].textContent.indexOf("Nothing was sent or charged.") >= 0, "Yes still says nothing was sent or charged");
    ok(w.calls.every(function (c) { return c.url === "/api/desks" && (c.body.action === "studio-draft" || c.body.action === "save-ai"); }), "the when-then path never posts another action");
  }

  {
    const w = boot({ speech: "hold" });
    w.click("cs-talk");
    const late = w.pending && w.pending.ok;
    w.els["cs-when-pick"].open = true;
    w.choose("cs-when", whens[0].id);
    w.choose("cs-then", thens[0].id);
    if (late) late("old words that should not land");
    ok(w.stops >= 1 && w.els["cs-words"].value === sentence && w.els["cs-talk"].getAttribute("aria-pressed") === "false" && w.els["cs-when-pick"].open === true, "choosing stops Talk and keeps the built words");
    ok(w.els["cs-heard"].textContent === "Quiet. Type what you want automated, or tap Talk.", "choosing while Talk is on does not leave it listening");
    w.click("cs-talk");
    ok(w.listens >= 2 && w.pending && w.els["cs-words"].value === sentence, "Talk still listens after a when and a then");
    w.pending.ok("and mention Friday");
    ok(w.els["cs-words"].value === sentence + " and mention Friday" && w.els["cs-when"].value === "" && w.els["cs-then"].value === "" && w.calls.length === 0, "more speech adds to the words and clears the picker");
    w.click("cs-quiet");
    ok(w.els["cs-heard"].textContent === "Quiet. Type what you want automated, or tap Talk.", "Quiet still says to type or talk");
  }

  if (failures) {
    console.error(failures + " check(s) failed");
    process.exit(1);
  }
  console.log("check-create-when-then-ui ok (" + passes + " passed)");
})().catch(function (e) {
  console.error("FAIL " + (e && e.stack || e));
  process.exit(1);
});
