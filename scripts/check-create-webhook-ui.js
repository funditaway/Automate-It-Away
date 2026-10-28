#!/usr/bin/env node
require("./_env-guard");
// Create path 6: say the draft also talks to an AI, an agent, a site, or a hook.
// A name and an address can be added to the words. A secret stays in the hidden
// field and is not copied into the words, the draft, sample cards, or any post.
// Then the same Draft it → review → sample cards → Yes / Stop / Kill path.
// Same posts. No buy, charge, or new route.
// Not part of npm test. usage: node scripts/check-create-webhook-ui.js [repoRoot]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
let failures = 0, passes = 0;
function fail(msg) { failures += 1; console.error("FAIL " + msg); }
function ok(cond, msg) { if (cond) passes += 1; else fail(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const SUMMARY = "Also talk to an AI or a site";
const HINT = "Name it and give its address. A secret stays hidden on this phone. Nothing is called.";
const LINK_NOTE = "These words now say where it talks. A secret stays on this phone and is not saved. Change the words if you want, then tap Draft it.";
const ADDRESS_NOTE = "Use a full address that starts with https://. Put a secret in the secret field, not in the address.";
const NAME = "School notes";
const SAFE = "https://school.example/notes";
const SECRET = "s3cret-key-99";
const QUERY = "query-token-77";
const RAW_URL = SAFE + "?token=" + QUERY;
const USER_URL = "https://user:" + SECRET + "@school.example/notes";
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
const hook = (cs.match(/<details id="cs-webhook">[\s\S]*?<\/details>/) || [""])[0];

ok(fs.existsSync(deskPath) && fs.statSync(deskPath).size === 35012, "desk.html stays 35012 bytes");
ok(!/cs-webhook|cs-webhook-secret|safeAddress/.test(read("desk.html")), "desk.html does not mention the AI or site control");
ok(!/check-create-webhook-ui/.test(pkg), "webhook check stays out of npm test");
ok(!/check-create-voice-ui/.test(pkg) && !/check-create-starter-pack-ui/.test(pkg) && !/check-create-example-ui/.test(pkg) && !/check-create-when-then-ui/.test(pkg), "earlier Create checks stay out of npm test");
ok(html.indexOf("<script src=\"card-rules.js\"></script>") < html.indexOf("<script src=\"speech.js\"></script>") && html.indexOf("<script src=\"speech.js\"></script>") < html.indexOf("<script src=\"create-simple.js\"></script>"), "card-rules.js and speech.js still load before create-simple.js");
["create-pack-idea.js", "create-pack-adv.js", "create-pack-install.js", "create-pack-download.js", "create-desk.js"].forEach(function (name) {
  ok(html.indexOf(name) >= 0, "create.html still loads " + name);
  ok(cs.indexOf(name) < 0, name + " is not inside the simple card");
});
["create-pack-install.js", "create-pack-download.js", "create-desk.js"].forEach(function (name) {
  ok(read(name).indexOf("Collect stays HOLD") >= 0, name + " still says Collect stays HOLD");
});
ok(more.indexOf('id="start"') >= 0 && more.indexOf('id="picks"') >= 0 && more.indexOf('id="mode-advanced"') >= 0, "other ways stay under Other ways");
ok(/<details id="cs-webhook">/.test(cs) && hook.indexOf(SUMMARY) >= 0 && hook.indexOf(HINT) >= 0, "the control is on the simple card, in plain words");
ok(cs.indexOf('id="cs-example"') < cs.indexOf('id="cs-webhook"') && cs.indexOf('id="cs-webhook"') < cs.indexOf('id="cs-draft"') && cs.indexOf('id="cs-words"') < cs.indexOf('id="cs-webhook"'), "the control sits with the words, before Draft it");
ok(starters.indexOf("cs-webhook") < 0 && starters.indexOf(SUMMARY) < 0, "the control is not one of the pack chips");
ok(/<label for="cs-webhook-kind">What it talks to<\/label>/.test(hook) && /<label for="cs-webhook-name">Name<\/label>/.test(hook) && /<label for="cs-webhook-url">Address<\/label>/.test(hook) && /<label for="cs-webhook-secret">Secret, if it has one<\/label>/.test(hook), "the labels are name, address, and an optional secret");
ok(/<input id="cs-webhook-secret"[^>]*type="password"/.test(hook), "the secret field is masked");
ok(!/value=/.test(hook) && hook.indexOf(SECRET) < 0 && hook.indexOf(QUERY) < 0, "the control does not ship a secret in the page");
ok(/id="cs-webhook-add"[^>]*>Add this to my words<\/button>/.test(hook), "adding it to the words is its own button");
ok(/id="cs-starters"/.test(cs) && /<details id="cs-when-pick">/.test(cs) && /id="cs-words"/.test(cs) && /id="cs-draft">Draft it<\/button>/.test(cs), "packs, the picker, the words box, and Draft it stay");
ok(/id="cs-example"[^>]*>Show an example<\/button>/.test(cs), "Show an example stays");
ok(/id="cs-talk"[^>]*>Talk<\/button>/.test(cs) && /id="cs-quiet"[^>]*>Quiet<\/button>/.test(cs), "Talk and Quiet stay on the card");
ok(/id="cs-yes">Yes<\/button>/.test(cs) && /id="cs-stop">Stop<\/button>/.test(cs) && /id="cs-kill">Kill<\/button>/.test(cs), "Yes, Stop, and Kill stay their own buttons");
// cs-import and cs-export bring in and save a file. pack stays reserved.
["pack"].forEach(function (name) {
  ok(cs.indexOf('id="cs-' + name + '"') < 0, "path id cs-" + name + " stays off this card");
});
ok(!/type="file"|<input[^>]*type="file"/i.test(cs), "no file import on this card");
ok(!/\b(PASS|FAIL|HOLD)\b/.test(cs) && !/\b(PASS|FAIL|HOLD)\b/.test(code), "public Create card has no PASS, FAIL, or HOLD");
ok(!/\b(Foreman|Mapper|Packer|Doer|Rail|Builder|Worker|Switch|Counter)\b/.test(cs + "\n" + code), "public Create card has no crew names");
ok(!/\b[0-9a-f]{40}\b/i.test(cs), "public Create card has no tip");
ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(js), "create-simple.js still builds with textContent");
const actions = [];
js.replace(/action:\s*"([a-z-]+)"/g, function (_, a) { actions.push(a); return _; });
ok(actions.length === 2 && actions.indexOf("studio-draft") >= 0 && actions.indexOf("save-ai") >= 0, "still only studio-draft and save-ai");
const fetches = js.match(/fetch\("([^"]+)"/g) || [];
ok(fetches.length >= 1 && fetches.every(function (f) { return f === 'fetch("/api/desks"'; }), "still only /api/desks");
ok(!/buy-pack|checkout|stripe|\/api\/pay|Charge now|Pay now|\/market/i.test(js + "\n" + cs), "this path adds no pay or Market control");
ok(!fs.existsSync(path.join(root, "api", "webhook.js")) && !fs.readdirSync(path.join(root, "api")).some(function (name) { return /^(webhook|import|export)/i.test(name); }), "no new webhook, import, or export route");

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

const IDS = ["cs", "cs-rules-list", "cs-step", "cs-ask", "cs-review", "cs-test", "cs-done", "cs-open", "cs-open-desk", "cs-name", "cs-job", "cs-watches", "cs-drafts", "cs-needs", "cs-src", "cs-words", "cs-draft", "cs-try", "cs-edit", "cs-back", "cs-yes", "cs-stop", "cs-kill", "cs-note", "cs-review-note", "cs-test-note", "cs-samples", "cs-rules-note", "cs-talk", "cs-quiet", "cs-heard", "cs-starters", "cs-starter-hint", "cs-example", "cs-example-walk", "cs-example-lead", "cs-example-draft", "cs-example-samples", "cs-example-next", "cs-when-pick", "cs-when-hint", "cs-when", "cs-then", "cs-webhook", "cs-webhook-hint", "cs-webhook-kind", "cs-webhook-name", "cs-webhook-url", "cs-webhook-secret", "cs-webhook-add", "cs-webhook-review", "more-ways"];

function boot(opt) {
  const page = { focused: "", calls: [], stops: 0, listens: 0, pending: null };
  const els = {};
  IDS.forEach(function (id) {
    const el = makeEl(id === "cs-when" || id === "cs-then" || id === "cs-webhook-kind" ? "select" : /words|watches|drafts|needs/.test(id) ? "textarea" : "div");
    el.id = id;
    el.page = page;
    els[id] = el;
  });
  els["cs-talk"].className = "ghost";
  els["cs-talk"].attrs["aria-pressed"] = "false";
  els["cs-example-walk"].hidden = true;
  els["cs-when-pick"].open = false;
  els["cs-webhook"].open = false;
  els["cs-webhook-review"].hidden = true;
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
        if (opt.draftError) return { ok: false, json: async function () { return { ok: false, error: opt.draftError }; } };
        return { ok: true, json: async function () { return { ok: true, pack: { name: "P", kinds: "chore", fields: "who:text", ais: [{ name: "Lane", does: "Drafts pickup notes", steps: "qualify,do" }] } }; } };
      }
      if (body.action === "save-ai") {
        if (opt.saveError) return { ok: false, json: async function () { return { ok: false, error: opt.saveError }; } };
        return { ok: true, json: async function () { return { ok: true, ai: { name: body.name } }; } };
      }
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
  page.fillLink = function (kind, name, url, secret) {
    els["cs-webhook"].open = true;
    if (kind != null) page.choose("cs-webhook-kind", kind);
    if (name != null) els["cs-webhook-name"].value = name;
    if (url != null) els["cs-webhook-url"].value = url;
    if (secret != null) els["cs-webhook-secret"].value = secret;
  };
  return page;
}

function tick() { return new Promise(function (r) { setImmediate(r); }); }
async function settle() { for (var i = 0; i < 6; i++) await tick(); }
function pressedNames(page) {
  return page.chips().filter(function (b) { return b.getAttribute("aria-pressed") === "true" && b.className === "on"; }).map(function (b) { return b.textContent; });
}
function echoed(page) {
  const bits = [];
  Object.keys(page.els).forEach(function (id) {
    const node = page.els[id];
    bits.push(node.textContent || "");
    if (id !== "cs-webhook-secret") bits.push(String(node.value || ""));
  });
  page.calls.forEach(function (c) {
    bits.push(JSON.stringify(c.body));
    bits.push(JSON.stringify(c.headers || {}));
  });
  return bits.join("\n");
}
function shown(page) {
  return Object.keys(page.els).map(function (id) { return page.els[id].textContent || ""; }).join("\n");
}
function leaks(page) {
  const text = echoed(page);
  return text.indexOf(SECRET) >= 0 || text.indexOf(QUERY) >= 0;
}

(async function main() {
  const bare = { window: { document: null }, console: console };
  vm.runInNewContext(js, bare, { filename: "create-simple.js" });
  const api = bare.window.AIACreateSimple;
  ok(api && typeof api.linkChoices === "function" && typeof api.linkSentence === "function" && typeof api.safeAddress === "function", "the AI and site choices are available before the page paints");
  const links = api ? api.linkChoices() : [];
  ok(links.length === 4, "a short list of what it can talk to");
  const sentences = [];
  links.forEach(function (item) {
    ok(item.id && item.label && item.phrase && item.label.length <= 40, "choice " + item.label + " is a short everyday line");
    const sentence = api.linkSentence(item.id, NAME, RAW_URL);
    sentences.push(sentence);
    ok(sentence === "It also talks to " + item.phrase + " named " + NAME + " at " + SAFE + ".", item.label + " builds one sentence with the site address only");
    ok(sentence.indexOf(SECRET) < 0 && sentence.indexOf(QUERY) < 0, item.label + " leaves the secret and the extra address part out");
    ok(PACKS.indexOf(sentence) < 0 && sentence !== EXAMPLE, item.label + " is not a pack and not the example");
  });
  ok(api.safeAddress(RAW_URL) === SAFE && api.safeAddress(USER_URL) === "" && api.safeAddress("http://school.example/notes") === "" && api.safeAddress("https://school.example/notes") === SAFE, "only a plain https address is kept");
  ok(api.linkSentence("", NAME, SAFE) === "" && api.linkSentence("agent", "", SAFE) === "" && api.linkSentence("agent", NAME, "notes") === "" && api.linkSentence("nope", NAME, SAFE) === "", "a half choice does not build words");
  if (api) {
    const first = api.linkChoices();
    first[0].phrase = "nope";
    first.push({ id: "extra", label: "Extra", phrase: "extra" });
    ok(api.linkChoices().length === 4 && api.linkChoices()[0].phrase === links[0].phrase && api.linkSentence(links[1].id, NAME, SAFE) === sentences[1], "changing the list does not change the choices");
  }
  const blob = links.map(function (x) { return x.label + "\n" + x.phrase; }).join("\n") + "\n" + sentences.join("\n") + "\n" + SUMMARY + "\n" + HINT + "\n" + LINK_NOTE + "\n" + ADDRESS_NOTE;
  ok(!/\b(PASS|FAIL|HOLD)\b|stripe|checkout|buy-pack|\/market|\bBuy\b|Pay now|Charge now/i.test(blob), "the choices do not sell or charge");
  ok(!/\b(Foreman|Mapper|Packer|Doer|Rail|Builder|Worker|Switch|Counter)\b/.test(blob), "the choices are everyday words");
  ok(blob.indexOf(SECRET) < 0 && blob.indexOf(QUERY) < 0, "the choices do not carry a secret");

  const open = { aia_ws: "Own Desk", aia_session: "tok", aia_pin: "1234" };
  const agentSentence = sentences.filter(function (s) { return s.indexOf("an agent named") >= 0; })[0];

  {
    const w = boot({});
    ok(w.els["cs-webhook"].open === false && w.els["cs-words"].value === "" && w.calls.length === 0 && w.els["cs-ask"].hidden === false, "the control starts closed and does not fill the box");
    ok(w.optionLabels("cs-webhook-kind").join("|") === links.map(function (x) { return x.label; }).join("|"), "the list is an AI, an agent, a site, and a hook");
    ok(w.els["cs-webhook-kind"].parts[0].textContent === "Choose what it talks to", "the list starts with a plain choose line");
    ok(w.chips().length === 4, "packs stay four chips");
    w.els["cs-webhook"].open = true;
    w.fillLink("agent", NAME, RAW_URL, SECRET);
    ok(w.els["cs-words"].value === "" && w.calls.length === 0 && w.els["cs-webhook-secret"].value === SECRET && w.els["cs-webhook-url"].value === RAW_URL && shown(w).indexOf(SECRET) < 0 && shown(w).indexOf(QUERY) < 0, "filling the fields does not post or copy the secret onto the page");
    w.click("cs-webhook-add");
    ok(w.els["cs-words"].value === agentSentence && w.focused === "cs-words" && w.els["cs-note"].textContent === LINK_NOTE, "adding it puts the name and address in the words");
    ok(w.els["cs-webhook-url"].value === SAFE && w.els["cs-webhook-secret"].value === SECRET && w.calls.length === 0 && !leaks(w), "the address box keeps the site only, and the secret stays hidden");
    ok(w.els["cs-ask"].hidden === false && w.els["cs-review"].hidden === true && pressedNames(w).length === 0 && w.els["cs-example-walk"].hidden === true, "adding it stays on step 1 and does not draft");
    const tweaked = agentSentence.replace("School notes", "Friday notes");
    w.typeWords(tweaked);
    ok(w.els["cs-words"].value === tweaked && w.els["cs-webhook-secret"].value === SECRET && !leaks(w) && w.calls.length === 0, "changing the words keeps the edit and still hides the secret");
  }

  {
    const w = boot({});
    w.els["cs-webhook"].open = true;
    w.fillLink("", "", USER_URL, SECRET);
    w.click("cs-webhook-add");
    ok(w.els["cs-words"].value === "" && w.els["cs-webhook-url"].value === "" && w.els["cs-note"].textContent === "Choose what it talks to." && !leaks(w) && w.calls.length === 0, "a secret inside the address is dropped and not repeated");
    w.fillLink("agent", "", "http://school.example/notes", SECRET);
    w.click("cs-webhook-add");
    ok(w.els["cs-words"].value === "" && w.els["cs-note"].textContent === "Give it a name." && w.els["cs-webhook-url"].value === "http://school.example/notes" && !leaks(w), "a name is required, and the note does not repeat the secret");
    w.fillLink("agent", NAME, "http://school.example/notes", SECRET);
    w.click("cs-webhook-add");
    ok(w.els["cs-words"].value === "" && w.els["cs-note"].textContent === ADDRESS_NOTE && !leaks(w) && w.calls.length === 0, "an address has to start with https, and nothing is posted");
    w.fillLink("site", "Town hall", SAFE, "");
    w.click("cs-webhook-add");
    const siteSentence = api.linkSentence("site", "Town hall", SAFE);
    ok(w.els["cs-words"].value === siteSentence && w.els["cs-note"].textContent === LINK_NOTE && !leaks(w), "a site with no secret still adds the words");
  }

  {
    const w = boot({});
    w.press(w.chip("Pickup changes"));
    w.fillLink("agent", NAME, RAW_URL, SECRET);
    w.click("cs-webhook-add");
    ok(w.els["cs-words"].value === PACKS[0].replace(/\.$/, "") + ". " + agentSentence && pressedNames(w).length === 0 && !leaks(w) && w.calls.length === 0, "the line is added after pack words");
    w.press(w.chip("A bill due"));
    ok(w.els["cs-words"].value === PACKS[1] && pressedNames(w).join(",") === "A bill due" && w.els["cs-webhook-secret"].value === SECRET && !leaks(w) && w.calls.length === 0, "a pack still replaces the words and does not post");
    w.els["cs-when-pick"].open = true;
    w.choose("cs-when", "note");
    w.choose("cs-then", "reply");
    ok(w.els["cs-words"].value.indexOf("When a school note arrives") === 0 && w.els["cs-words"].value.indexOf(SECRET) < 0 && w.calls.length === 0, "the picker still builds its own words");
    w.click("cs-example");
    ok(w.els["cs-words"].value === EXAMPLE && w.els["cs-example-walk"].hidden === false && w.els["cs-example-samples"].textContent.indexOf(SECRET) < 0 && w.els["cs-example-samples"].textContent.indexOf("Nothing is sent.") >= 0 && w.calls.length === 0, "Show an example still replaces the words and does not post");
  }

  {
    const w = boot({});
    w.fillLink("hook", "Porch light", SAFE, SECRET);
    w.click("cs-webhook-add");
    const built = w.els["cs-words"].value;
    const tweaked = built.replace("Porch light", "Front porch");
    w.typeWords(tweaked);
    w.click("cs-draft");
    await settle();
    ok(w.calls.length === 0 && w.els["cs-review"].hidden === false && w.els["cs-open"].hidden === false && w.els["cs-job"].value === tweaked, "with no open desk, Draft it uses the changed words and does not post");
    ok(w.els["cs-webhook-review"].hidden === true && w.els["cs-src"].textContent.indexOf("Your desk is not open") >= 0 && !leaks(w), "the review stays quiet when the words no longer match, and the secret is still hidden");
    w.typeWords(built);
    w.click("cs-back");
    w.click("cs-draft");
    await settle();
    ok(w.calls.length === 0 && w.els["cs-webhook-review"].textContent.indexOf("a hook named Porch light") >= 0 && w.els["cs-webhook-review"].textContent.indexOf(SAFE) >= 0 && w.els["cs-webhook-review"].textContent.indexOf("not shown or saved") >= 0 && w.els["cs-webhook-review"].textContent.indexOf("does not call") >= 0 && !leaks(w), "the review names the hook and says the secret is not saved");
    w.click("cs-try");
    ok(w.els["cs-test"].hidden === false && w.els["cs-samples"].textContent.indexOf("Sample, made up") >= 0 && w.els["cs-samples"].textContent.indexOf("Nothing is sent.") >= 0 && w.els["cs-samples"].textContent.indexOf("Would talk to a hook named Porch light at " + SAFE) >= 0 && w.els["cs-samples"].textContent.indexOf("Nothing is called.") >= 0 && !leaks(w), "sample cards name the hook and do not show the secret");
    w.click("cs-yes");
    await settle();
    ok(w.calls.length === 0 && w.els["cs-test-note"].textContent.indexOf("Open your desk first") >= 0 && w.els["cs-test-note"].textContent.indexOf("Nothing was saved") >= 0 && !leaks(w), "Yes with no open desk saves nothing");
    w.click("cs-stop");
    ok(w.els["cs-words"].value === built && w.els["cs-webhook-secret"].value === SECRET && w.els["cs-ask"].hidden === false && w.els["cs-note"].textContent.indexOf("Stopped.") === 0 && !leaks(w), "Stop keeps the words and still hides the secret");
    w.click("cs-kill");
    ok(w.els["cs-words"].value === "" && w.els["cs-webhook-secret"].value === "" && w.els["cs-webhook-name"].value === "" && w.els["cs-webhook-url"].value === "" && w.els["cs-webhook"].open === false && w.els["cs-example-walk"].hidden === true && w.calls.length === 0 && w.els["cs-note"].textContent.indexOf("Killed.") === 0 && !leaks(w), "Kill throws the words, the address, and the secret away");
  }

  {
    const w = boot({ storage: open, draftError: "The desk did not draft this." });
    w.fillLink("ai", NAME, RAW_URL, SECRET);
    w.click("cs-webhook-add");
    const built = w.els["cs-words"].value;
    w.click("cs-draft");
    await settle();
    const draft = w.calls[0];
    ok(w.calls.length === 1 && draft.url === "/api/desks" && draft.body.action === "studio-draft" && draft.body.kind === "ai" && draft.body.brief === built, "Draft it posts studio-draft with the words");
    ok(Object.keys(draft.body).sort().join(",") === "action,brief,kind" && draft.body.brief.indexOf(SECRET) < 0 && draft.body.brief.indexOf(QUERY) < 0 && draft.body.brief.indexOf(SAFE) >= 0, "the draft post has no extra fields and no secret");
    ok(w.els["cs-src"].textContent.indexOf("The desk did not draft this.") >= 0 && !leaks(w), "an error does not repeat the secret");
  }

  {
    const w = boot({ storage: open, saveError: "The desk did not save it." });
    w.fillLink("agent", NAME, RAW_URL, SECRET);
    w.click("cs-webhook-add");
    const built = w.els["cs-words"].value;
    w.click("cs-draft");
    await settle();
    const draft = w.calls[0];
    ok(draft.body.brief === built && draft.headers["X-Workspace"] === "own-desk" && draft.headers["X-Session"] === "tok", "the draft post is for this open desk");
    ok(w.els["cs-review"].hidden === false && w.els["cs-name"].value === "Lane" && w.els["cs-webhook-review"].textContent.indexOf(SAFE) >= 0 && !leaks(w), "review still opens on the studio draft and names the address");
    w.click("cs-try");
    w.click("cs-yes");
    await settle();
    const saved = w.calls[1];
    ok(w.calls.length === 2 && saved.url === "/api/desks" && saved.body.action === "save-ai" && saved.body.does === "Drafts pickup notes", "Yes still posts save-ai only");
    ok(Object.keys(saved.body).sort().join(",") === "action,does,id,name,prompt,rules,steps" && JSON.stringify(saved.body).indexOf(SECRET) < 0 && JSON.stringify(saved.body).indexOf(QUERY) < 0, "save-ai keeps its old fields and does not carry the secret");
    ok(w.els["cs-test-note"].textContent.indexOf("Nothing was saved") >= 0 && !leaks(w), "a save error does not repeat the secret");
    ok(w.calls.every(function (c) { return c.url === "/api/desks" && (c.body.action === "studio-draft" || c.body.action === "save-ai"); }), "this path never posts another action");
  }

  {
    const w = boot({ storage: open });
    w.fillLink("agent", NAME, SAFE, SECRET);
    w.click("cs-webhook-add");
    w.click("cs-draft");
    await settle();
    w.click("cs-try");
    w.click("cs-yes");
    await settle();
    ok(w.els["cs-done"].textContent.indexOf("Nothing was sent or charged.") >= 0 && w.els["cs-done"].textContent.indexOf(SECRET) < 0 && !leaks(w), "Yes still says nothing was sent or charged, and does not show the secret");
  }

  {
    const w = boot({ speech: "hold" });
    w.click("cs-talk");
    const late = w.pending && w.pending.ok;
    w.els["cs-webhook"].open = true;
    w.fillLink("agent", NAME, SAFE, SECRET);
    w.click("cs-webhook-add");
    if (late) late("old words " + SECRET);
    ok(w.stops >= 1 && w.els["cs-words"].value === agentSentence && w.els["cs-talk"].getAttribute("aria-pressed") === "false" && !leaks(w), "adding the line stops Talk and keeps the built words");
    ok(w.els["cs-heard"].textContent === "Quiet. Type what you want automated, or tap Talk.", "adding the line while Talk is on does not leave it listening");
    w.click("cs-talk");
    ok(w.listens >= 2 && w.pending && w.els["cs-words"].value === agentSentence, "Talk still listens after the line is added");
    w.pending.ok("and mention Friday");
    ok(w.els["cs-words"].value === agentSentence + " and mention Friday" && w.calls.length === 0 && !leaks(w), "more speech adds to the words and does not draft");
    w.click("cs-quiet");
    ok(w.els["cs-heard"].textContent === "Quiet. Type what you want automated, or tap Talk.", "Quiet still says to type or talk");
  }

  if (failures) {
    console.error(failures + " check(s) failed");
    process.exit(1);
  }
  console.log("check-create-webhook-ui ok (" + passes + " passed)");
})().catch(function (e) {
  console.error("FAIL " + (e && e.stack || e));
  process.exit(1);
});
