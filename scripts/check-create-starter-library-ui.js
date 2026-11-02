#!/usr/bin/env node
require("./_env-guard");
// Create: browse starter packs on the same card. Each listed pack is a preview.
// Tap fills #cs-words and that pack's draft fields. The person can still edit,
// then Draft it → review → sample cards → Yes / Stop / Kill.
// A pack is listed only after its own fill check passes. No buy, charge, or new route.
// Not part of npm test.
// usage: node scripts/check-create-starter-library-ui.js [repoRoot]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
let failures = 0, passes = 0;
function fail(msg) { failures += 1; console.error("FAIL " + msg); }
function ok(cond, msg) { if (cond) passes += 1; else fail(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const HINT = "These are previews. Nothing is bought. Tap one to fill the words. Change them if you want, then tap Draft it.";
const PICK_NOTE = "Change any words you want. Then tap Draft it.";
const SUMMARY = "Browse starter packs";
const EXAMPLE = "When the school moves pickup to 3:30, draft a note and a reply for me.";
const WHEN_THEN = [
  "When a school note arrives, draft a short reply for me.",
  "When a meeting time moves, draft a reminder with the date.",
  "When a friend asks for a favor, draft a list of what to bring.",
  "When trash day changes, draft a note I can check later."
];
const CHIPS = ["pickup", "bill", "neighbor", "plants"];
const AREAS = ["Home and school", "Work", "Around town", "Inbox and calendar"];
const FIXTURES = [
  { id: "pickup", area: "Home and school", name: "Pickup changes", words: "When a parent asks to change pickup, draft a reply and a reminder for me.", draft: { name: "Pickup notes", job: "Draft a reply and a reminder when pickup changes.", watches: ["Notes about a pickup change"], drafts: ["A reply for me", "A reminder"], needs: ["Your Yes before anything is used", "The new pickup time"] } },
  { id: "bill", area: "Home and school", name: "A bill due", words: "When a bill is due, draft a reminder with the date and what it is for.", draft: { name: "Bill reminder", job: "Draft a reminder when a bill is due.", watches: ["Bills that are coming due"], drafts: ["A reminder with the date and what it is for"], needs: ["Your Yes before anything is used", "The date and what the bill is for"] } },
  { id: "plants", area: "Home and school", name: "Water the plants", words: "Remind me to water the plants every Tuesday, and draft a note if a day gets missed.", draft: { name: "Plant reminder", job: "Remind me to water the plants, and note a missed day.", watches: ["Tuesday plant watering"], drafts: ["A watering reminder", "A note if a day gets missed"], needs: ["Your Yes before anything is used"] } },
  { id: "homework", area: "Home and school", name: "Homework night", words: "When homework is due tomorrow, draft a reminder and a short list of what is left.", draft: { name: "Homework reminder", job: "Draft a reminder and a short list when homework is due tomorrow.", watches: ["Homework due tomorrow"], drafts: ["A reminder", "A short list of what is left"], needs: ["Your Yes before anything is used", "What is still left"] } },
  { id: "shift", area: "Work", name: "A shift change", words: "When my shift time changes, draft a note with the new time and who to tell.", draft: { name: "Shift note", job: "Draft a note when a shift time changes.", watches: ["Shift time changes"], drafts: ["A note with the new time and who to tell"], needs: ["Your Yes before anything is used", "The new time"] } },
  { id: "follow", area: "Work", name: "After a call", words: "After a work call, draft a short follow-up of what we agreed and what is next.", draft: { name: "Call follow-up", job: "Draft a short follow-up after a work call.", watches: ["Notes from a work call"], drafts: ["A short follow-up of what we agreed"], needs: ["Your Yes before anything is used", "What you agreed"] } },
  { id: "week", area: "Work", name: "The week in review", words: "On Friday, draft a short note of what got done this week and what is still open.", draft: { name: "Week note", job: "On Friday, draft a short note of the week.", watches: ["Friday week notes"], drafts: ["What got done", "What is still open"], needs: ["Your Yes before anything is used"] } },
  { id: "neighbor", area: "Around town", name: "Neighbor help", words: "When a neighbor asks for help, draft a short reply and a time that works.", draft: { name: "Neighbor reply", job: "Draft a short reply and a time when a neighbor asks for help.", watches: ["A neighbor asking for help"], drafts: ["A short reply", "A time that works"], needs: ["Your Yes before anything is used", "A time that works for you"] } },
  { id: "repair", area: "Around town", name: "A repair visit", words: "When a repair visit is booked, draft a reminder with the day and what they are coming to fix.", draft: { name: "Repair reminder", job: "Draft a reminder when a repair visit is booked.", watches: ["Booked repair visits"], drafts: ["A reminder with the day and what they will fix"], needs: ["Your Yes before anything is used", "The day of the visit"] } },
  { id: "clinic", area: "Around town", name: "A visit moved", words: "When a clinic visit moves, draft a reply and a reminder with the new day and time.", draft: { name: "Visit reminder", job: "Draft a reply and a reminder when a clinic visit moves.", watches: ["Clinic visits that move"], drafts: ["A reply", "A reminder with the new day and time"], needs: ["Your Yes before anything is used", "The new day and time"] } },
  { id: "inbox", area: "Inbox and calendar", name: "A message to answer", words: "When a message needs an answer, draft a short reply I can check first.", draft: { name: "Message reply", job: "Draft a short reply when a message needs an answer.", watches: ["Messages that need an answer"], drafts: ["A short reply I can check first"], needs: ["Your Yes before anything is used"] } },
  { id: "calendar", area: "Inbox and calendar", name: "Calendar moved", words: "When something on my calendar moves, draft a reminder with the new day and time.", draft: { name: "Calendar reminder", job: "Draft a reminder when something on the calendar moves.", watches: ["Calendar items that move"], drafts: ["A reminder with the new day and time"], needs: ["Your Yes before anything is used", "The new day and time"] } }
];

const html = read("create.html");
const js = read("create-simple.js");
const pkg = read("package.json");
const self = fs.readFileSync(__filename, "utf8");
const deskPath = path.join(root, "desk.html");
const cs = (html.match(/<section class="card cs" id="cs">[\s\S]*?<\/section>/) || [""])[0];
const code = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const libHtml = (cs.match(/<details id="cs-library">[\s\S]*?<\/details>/) || [""])[0];
const starters = (cs.match(/<div class="chips" id="cs-starters"[\s\S]*?<\/div>/) || [""])[0];
const moreAt = html.indexOf('id="more-ways"');
const more = moreAt >= 0 ? html.slice(moreAt) : "";
const reqs = self.match(/require\([^)]+\)/g) || [];

ok(reqs[0] === 'require("./_env-guard")', "first require is ./_env-guard");
ok(fs.existsSync(deskPath) && fs.statSync(deskPath).size === 35012, "desk.html stays 35012 bytes");
ok(!/cs-library|starterLibrary|Browse starter packs/.test(read("desk.html")), "desk.html does not mention the library");
ok(!/check-create-starter-library-ui/.test(pkg), "library check stays out of npm test");
ok(!/check-create-voice-ui/.test(pkg) && !/check-create-starter-pack-ui/.test(pkg) && !/check-create-example-ui/.test(pkg) && !/check-create-when-then-ui/.test(pkg) && !/check-create-webhook-ui/.test(pkg) && !/check-create-import-export-ui/.test(pkg), "earlier Create checks stay out of npm test");
ok(html.indexOf("<script src=\"card-rules.js\"></script>") < html.indexOf("<script src=\"speech.js\"></script>") && html.indexOf("<script src=\"speech.js\"></script>") < html.indexOf("<script src=\"create-simple.js\"></script>"), "card-rules.js and speech.js still load before create-simple.js");
["create-pack-idea.js", "create-pack-adv.js", "create-pack-install.js", "create-pack-download.js", "create-desk.js"].forEach(function (name) {
  ok(html.indexOf(name) >= 0, "create.html still loads " + name);
  ok(cs.indexOf(name) < 0, name + " is not inside the simple card");
});
["create-pack-install.js", "create-pack-download.js", "create-desk.js"].forEach(function (name) {
  ok(read(name).indexOf("Collect stays HOLD") >= 0, name + " still says Collect stays HOLD");
});
ok(more.indexOf('id="start"') >= 0 && more.indexOf('id="picks"') >= 0 && more.indexOf('id="mode-advanced"') >= 0, "other ways stay under Other ways");
ok(/<details id="cs-library">/.test(cs) && libHtml.indexOf(SUMMARY) >= 0 && libHtml.indexOf(HINT) >= 0, "the library is on the simple card, in plain words");
ok(!/id="cs-library"[^>]*\sopen/.test(cs), "the library starts closed");
ok(cs.indexOf('id="cs-starters"') < cs.indexOf('id="cs-library"') && cs.indexOf('id="cs-library"') < cs.indexOf('id="cs-when-pick"') && cs.indexOf('id="cs-when-pick"') < cs.indexOf('id="cs-words"'), "the library sits between the four chips and the picker");
ok(starters.indexOf("cs-library") < 0 && starters.indexOf(SUMMARY) < 0, "the library is not one of the four chips");
ok(/id="cs-starters"/.test(cs) && /id="cs-words"/.test(cs) && /id="cs-draft">Draft it<\/button>/.test(cs), "packs, the words box, and Draft it stay");
ok(/id="cs-example"[^>]*>Show an example<\/button>/.test(cs), "Show an example stays");
ok(/<details id="cs-when-pick">/.test(cs) && /<details id="cs-webhook">/.test(cs), "the picker and the AI or site control stay");
ok(/id="cs-import"[^>]*>Bring in a file<\/button>/.test(cs) && /id="cs-export"[^>]*>Save a file<\/button>/.test(cs), "bring in and save a file stay");
ok(/id="cs-talk"[^>]*>Talk<\/button>/.test(cs) && /id="cs-quiet"[^>]*>Quiet<\/button>/.test(cs), "Talk and Quiet stay on the card");
ok(/id="cs-yes">Yes<\/button>/.test(cs) && /id="cs-stop">Stop<\/button>/.test(cs) && /id="cs-kill">Kill<\/button>/.test(cs), "Yes, Stop, and Kill stay their own buttons");
// cs-import and cs-export bring in and save a file. pack stays reserved. The library uses cs-library.
ok(cs.indexOf('id="cs-pack"') < 0, "path id cs-pack stays off this card");
ok(!/when this then that|if this then that|type="file"|<input[^>]*type="file"/i.test(cs), "the card stays in plain words and has no file import");
ok(!/\b(PASS|FAIL|HOLD)\b/.test(cs) && !/\b(PASS|FAIL|HOLD)\b/.test(code), "public Create card has no PASS, FAIL, or HOLD");
ok(!/\b(Foreman|Mapper|Packer|Doer|Rail|Builder|Worker|Switch|Counter)\b/.test(cs + "\n" + code), "public Create card has no crew names");
ok(!/\b[0-9a-f]{40}\b/i.test(cs), "public Create card has no tip");
ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(js), "create-simple.js still builds with textContent");
ok(/@media\(max-width:420px\)\{#cs-library \.chips\{flex-direction:column\}#cs-library \.chips button\{width:100%;text-align:left\}\}/.test(html), "library buttons stack on a narrow phone");
const actions = [];
js.replace(/action:\s*"([a-z-]+)"/g, function (_, a) { actions.push(a); return _; });
ok(actions.length === 2 && actions.indexOf("studio-draft") >= 0 && actions.indexOf("save-ai") >= 0, "still only studio-draft and save-ai");
const fetches = js.match(/fetch\("([^"]+)"/g) || [];
ok(fetches.length >= 1 && fetches.every(function (f) { return f === 'fetch("/api/desks"'; }), "still only /api/desks");
ok(!/buy-pack|checkout|stripe|\/api\/pay|Charge now|Pay now|\/market|install-pack/i.test(js + "\n" + cs), "library path adds no pay, install, or Market control");
ok(!fs.existsSync(path.join(root, "api", "library.js")) && !fs.readdirSync(path.join(root, "api")).some(function (name) { return /library|starter/i.test(name); }), "no new library route");
FIXTURES.forEach(function (p) {
  ok(libHtml.indexOf(p.name) < 0 && libHtml.indexOf(p.words) < 0, p.name + " is painted by the page, not hard-coded");
});

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

const IDS = ["cs", "cs-rules-list", "cs-step", "cs-ask", "cs-review", "cs-test", "cs-done", "cs-open", "cs-open-desk", "cs-name", "cs-job", "cs-watches", "cs-drafts", "cs-needs", "cs-src", "cs-words", "cs-draft", "cs-try", "cs-edit", "cs-back", "cs-yes", "cs-stop", "cs-kill", "cs-note", "cs-review-note", "cs-test-note", "cs-samples", "cs-rules-note", "cs-talk", "cs-quiet", "cs-heard", "cs-starters", "cs-starter-hint", "cs-library", "cs-library-hint", "cs-library-list", "cs-example", "cs-example-walk", "cs-when-pick", "cs-when", "cs-then", "more-ways"];

function boot(opt) {
  const page = { focused: "", calls: [], stops: 0, listens: 0, pending: null };
  const els = {};
  IDS.forEach(function (id) {
    const el = makeEl(/words|watches|drafts|needs/.test(id) ? "textarea" : "div");
    el.id = id;
    el.page = page;
    els[id] = el;
  });
  const store = opt.storage || {};
  const speech = opt.speech || "off";
  const api = speech === "missing" ? undefined : {
    canListen: function () { return speech !== "off"; },
    stopTalk: function () { page.stops += 1; page.pending = null; },
    listen: function (okFn, errFn) {
      page.listens += 1;
      if (speech === "hold") { page.pending = { ok: okFn, err: errFn }; return; }
      okFn("When a parent asks to change pickup, draft a reply");
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
  page.areas = function () {
    return els["cs-library-list"].parts.filter(function (node) { return node.className === "area"; }).map(function (node) { return node.textContent; });
  };
  page.libButtons = function () {
    const found = [];
    els["cs-library-list"].parts.forEach(function (node) {
      (node.parts || []).forEach(function (child) {
        if (child.tagName === "button") found.push(child);
      });
    });
    return found;
  };
  page.libButton = function (name) { return page.libButtons().filter(function (b) { return b.textContent === name; })[0] || null; };
  page.press = function (el) { (el.handlers.click || []).forEach(function (fn) { fn({ target: el }); }); };
  page.typeWords = function (value) {
    els["cs-words"].value = value;
    (els["cs-words"].handlers.input || []).forEach(function (fn) { fn({}); });
  };
  return page;
}

function tick() { return new Promise(function (r) { setImmediate(r); }); }
async function settle() { for (var i = 0; i < 6; i++) await tick(); }
function pressedNames(page, buttons) {
  return buttons.filter(function (b) { return b.getAttribute("aria-pressed") === "true" && b.className === "on"; }).map(function (b) { return b.textContent; });
}
function sameDraft(page, draft) {
  return page.els["cs-name"].value === draft.name
    && page.els["cs-job"].value === draft.job
    && page.els["cs-watches"].value === draft.watches.join("\n")
    && page.els["cs-drafts"].value === draft.drafts.join("\n")
    && page.els["cs-needs"].value === draft.needs.join("\n");
}
function byId(list, id) {
  return list.filter(function (p) { return p.id === id; })[0] || null;
}

(async function main() {
  const bare = { window: { document: null }, console: console };
  vm.runInNewContext(js, bare, { filename: "create-simple.js" });
  const api = bare.window.AIACreateSimple;
  ok(api && typeof api.starterLibrary === "function" && typeof api.starterPacks === "function", "the library is available before the page paints");
  const listed = api ? api.starterLibrary() : [];
  const chips = api ? api.starterPacks() : [];
  ok(chips.length === CHIPS.length && chips.map(function (p) { return p.id; }).join(",") === CHIPS.join(","), "the four chips stay in their order");
  ok(listed.length > chips.length && listed.length === FIXTURES.length, "the library is a longer everyday list than the four chips");
  const ids = {};
  const words = {};
  FIXTURES.forEach(function (p, i) {
    const got = listed[i] || {};
    ok(got.id === p.id && got.area === p.area && got.name === p.name && got.words === p.words, "pack " + p.name + " matches its fixture");
    ok(got.draft && got.draft.name === p.draft.name && got.draft.job === p.draft.job && (got.draft.watches || []).join("|") === p.draft.watches.join("|") && (got.draft.drafts || []).join("|") === p.draft.drafts.join("|") && (got.draft.needs || []).join("|") === p.draft.needs.join("|"), p.name + " has the same draft fields");
    ok(p.words.length > 0 && p.words.length <= 600 && p.name.length <= 40 && p.draft.name.length <= 40 && p.draft.job.length <= 160, p.name + " fits the boxes");
    ok(AREAS.indexOf(p.area) >= 0, p.name + " sits in an everyday area");
    ok(!ids[p.id] && !words[p.words], p.name + " is its own pack");
    ids[p.id] = true;
    words[p.words] = true;
    ok(p.words !== EXAMPLE && WHEN_THEN.indexOf(p.words) < 0, p.name + " is not the example or a when-then sentence");
    const chip = byId(chips, p.id);
    if (CHIPS.indexOf(p.id) >= 0) ok(chip && chip.words === p.words && chip.name === p.name, p.name + " still matches its chip");
    else ok(!chip, p.name + " is a library pack, not a fifth chip");
  });
  AREAS.forEach(function (area) {
    ok(FIXTURES.some(function (p) { return p.area === area; }), area + " has at least one pack");
  });
  if (api) {
    const first = api.starterLibrary();
    first[0].words = "nope";
    first[0].draft.watches.push("nope");
    first.push({ id: "untested", name: "Untested extra", words: "nope" });
    const again = api.starterLibrary();
    ok(again.length === FIXTURES.length && again[0].words === FIXTURES[0].words && again[0].draft.watches.join("|") === FIXTURES[0].draft.watches.join("|"), "changing the list does not change the packs");
  }
  const packBlob = FIXTURES.map(function (p) {
    return [p.id, p.area, p.name, p.words, p.draft.name, p.draft.job, p.draft.watches.join(" "), p.draft.drafts.join(" "), p.draft.needs.join(" ")].join("\n");
  }).join("\n");
  ok(!/\b(PASS|FAIL|HOLD)\b|stripe|checkout|webhook|buy-pack|\/market|\bBuy\b|\bpay\b|\bcharge\b|\bsend\b/i.test(packBlob + "\n" + HINT + "\n" + SUMMARY), "library words do not sell, charge, or use crew shorthand");
  ok(!/\b(Foreman|Mapper|Packer|Doer|Rail|Builder|Worker|Switch|Counter)\b/.test(packBlob), "library names are everyday words");

  const covered = [];
  for (let i = 0; i < FIXTURES.length; i++) {
    const p = FIXTURES[i];
    const w = boot({});
    const btn = w.libButton(p.name);
    let wordsOk = false;
    let draftOk = false;
    if (btn) {
      w.press(btn);
      wordsOk = w.els["cs-words"].value === p.words && w.focused === "cs-words" && w.calls.length === 0 && w.listens === 0 && w.els["cs-ask"].hidden === false && w.els["cs-note"].textContent === PICK_NOTE;
      draftOk = sameDraft(w, p.draft);
      w.click("cs-draft");
      await settle();
      draftOk = draftOk && w.calls.length === 0 && w.els["cs-review"].hidden === false && sameDraft(w, p.draft) && w.els["cs-src"].textContent.indexOf("Your desk is not open") >= 0;
    }
    ok(!!btn && btn.getAttribute("type") === "button" && btn.getAttribute("data-starter") === p.id, p.name + " is its own button");
    ok(wordsOk, p.name + " fills the words and does not post");
    ok(draftOk, p.name + " fills its draft fields");
    if (wordsOk && draftOk) covered.push(p.id);
  }

  {
    const w = boot({});
    const shown = w.libButtons().map(function (b) { return b.getAttribute("data-starter"); });
    ok(w.els["cs-library"].open === false && w.els["cs-words"].value === "" && w.els["cs-name"].value === "" && w.calls.length === 0, "opening the card does not fill words or draft by itself");
    ok(w.areas().join("|") === AREAS.join("|"), "the library groups packs by everyday area");
    ok(w.chips().length === 4 && w.chips().map(function (b) { return b.getAttribute("data-starter"); }).join(",") === CHIPS.join(","), "the four chips stay four chips");
    ok(shown.join(",") === covered.join(",") && shown.length === FIXTURES.length, "the card lists only packs whose fill check passed");
    shown.forEach(function (id) {
      ok(covered.indexOf(id) >= 0, id + " is listed only after its fill check passed");
    });
    ok(!w.libButton("Untested extra") && shown.indexOf("untested") < 0, "a pack with no fill check is not listed");
    AREAS.forEach(function (area) {
      const row = w.els["cs-library-list"].parts.filter(function (node) { return node.getAttribute("aria-label") === area; })[0];
      const names = row ? row.parts.filter(function (child) { return child.tagName === "button"; }).map(function (child) { return child.textContent; }) : [];
      const expect = FIXTURES.filter(function (p) { return p.area === area; }).map(function (p) { return p.name; });
      ok(names.join("|") === expect.join("|"), area + " shows its own packs");
    });
  }

  {
    const w = boot({});
    w.press(w.libButton("Pickup changes"));
    ok(pressedNames(w, w.chips()).join(",") === "Pickup changes" && pressedNames(w, w.libButtons()).join(",") === "Pickup changes", "a library pick of a chip pack marks both");
    ok(w.els["cs-name"].value === "Pickup notes", "the library pick fills the draft name");
    w.press(w.chip("A bill due"));
    ok(w.els["cs-words"].value === byId(FIXTURES, "bill").words && w.els["cs-name"].value === "" && w.els["cs-job"].value === "" && pressedNames(w, w.chips()).join(",") === "A bill due" && pressedNames(w, w.libButtons()).join(",") === "A bill due", "a chip still fills only the words");
    w.click("cs-draft");
    await settle();
    ok(w.calls.length === 0 && w.els["cs-name"].value === "Helper: When a bill" && w.els["cs-job"].value === byId(FIXTURES, "bill").words, "Draft it from a chip still builds the draft from the words");
  }

  {
    const w = boot({});
    w.press(w.libButton("Homework night"));
    ok(pressedNames(w, w.chips()).length === 0 && pressedNames(w, w.libButtons()).join(",") === "Homework night", "a library-only pack does not pretend to be a chip");
    const tweaked = byId(FIXTURES, "homework").words.replace("tomorrow", "tonight");
    w.typeWords(tweaked);
    ok(w.els["cs-words"].value === tweaked && pressedNames(w, w.libButtons()).length === 0 && pressedNames(w, w.chips()).length === 0, "changing the words leaves the pack unselected");
    w.click("cs-draft");
    await settle();
    ok(w.calls.length === 0 && w.els["cs-name"].value === "Helper: When homework is" && w.els["cs-job"].value === tweaked, "edited words build the draft from what the person wrote");
    w.typeWords(byId(FIXTURES, "homework").words);
    ok(pressedNames(w, w.libButtons()).join(",") === "Homework night", "the pack lights again when the words match it");
  }

  {
    const w = boot({});
    w.press(w.libButton("A repair visit"));
    w.click("cs-draft");
    await settle();
    ok(w.els["cs-review"].hidden === false && sameDraft(w, byId(FIXTURES, "repair").draft), "Draft it keeps the repair preview");
    w.click("cs-try");
    ok(w.els["cs-test"].hidden === false && w.els["cs-samples"].textContent.indexOf("Sample, made up") >= 0 && w.els["cs-samples"].textContent.indexOf("Nothing is sent.") >= 0 && w.els["cs-samples"].textContent.indexOf("The water bill is due on the 15th") >= 0, "sample cards still say they are made up and nothing is sent");
    w.click("cs-yes");
    await settle();
    ok(w.calls.length === 0 && w.els["cs-test-note"].textContent.indexOf("Open your desk first") >= 0 && w.els["cs-test-note"].textContent.indexOf("Nothing was saved") >= 0, "Yes with no open desk saves nothing");
    w.click("cs-stop");
    ok(w.els["cs-words"].value === byId(FIXTURES, "repair").words && w.els["cs-ask"].hidden === false && w.els["cs-note"].textContent.indexOf("Stopped.") === 0, "Stop keeps the pack words");
    w.click("cs-kill");
    ok(w.els["cs-words"].value === "" && w.els["cs-name"].value === "" && pressedNames(w, w.libButtons()).length === 0 && pressedNames(w, w.chips()).length === 0 && w.calls.length === 0 && w.els["cs-note"].textContent.indexOf("Killed.") === 0, "Kill throws the words and the pack away");
  }

  {
    const open = { aia_ws: "Own Desk", aia_session: "tok", aia_pin: "1234" };
    const w = boot({ storage: open });
    const pack = byId(FIXTURES, "calendar");
    w.press(w.libButton(pack.name));
    w.click("cs-draft");
    await settle();
    const draft = w.calls[0];
    ok(w.calls.length === 1 && draft.url === "/api/desks" && draft.body.action === "studio-draft" && draft.body.kind === "ai" && draft.body.brief === pack.words, "Draft it posts studio-draft with the pack words");
    ok(!draft.body.pack && !draft.body.id && draft.headers["X-Workspace"] === "own-desk" && draft.headers["X-Session"] === "tok", "the draft post is the words only, for this open desk");
    ok(w.els["cs-name"].value === "Lane", "an open desk still uses the studio draft");
    w.click("cs-try");
    w.click("cs-yes");
    await settle();
    const saved = w.calls[1];
    ok(w.calls.length === 2 && saved.url === "/api/desks" && saved.body.action === "save-ai" && saved.body.does === "Drafts pickup notes", "Yes still posts save-ai only");
    ok(w.els["cs-done"].textContent.indexOf("Nothing was sent or charged.") >= 0, "Yes still says nothing was sent or charged");
    ok(w.calls.every(function (c) { return c.url === "/api/desks" && (c.body.action === "studio-draft" || c.body.action === "save-ai"); }), "the library path never posts another action");
  }

  {
    const w = boot({ speech: "hold" });
    w.click("cs-talk");
    const late = w.pending && w.pending.ok;
    w.press(w.libButton("A shift change"));
    if (late) late("old words that should not land");
    ok(w.stops >= 1 && w.els["cs-words"].value === byId(FIXTURES, "shift").words && w.els["cs-talk"].getAttribute("aria-pressed") === "false", "picking a pack stops Talk and keeps the pack words");
    w.click("cs-talk");
    ok(w.listens >= 2 && w.pending && w.els["cs-words"].value === byId(FIXTURES, "shift").words, "Talk still listens after a pack is chosen");
    w.pending.ok("and mention Friday");
    ok(w.els["cs-words"].value === byId(FIXTURES, "shift").words + " and mention Friday" && pressedNames(w, w.libButtons()).length === 0, "more speech adds to the pack words");
  }

  if (failures) {
    console.error(failures + " check(s) failed");
    process.exit(1);
  }
  console.log("check-create-starter-library-ui ok (" + passes + " passed, " + covered.length + " packs listed)");
})().catch(function (e) {
  console.error("FAIL " + (e && e.stack || e));
  process.exit(1);
});
