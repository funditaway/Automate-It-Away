#!/usr/bin/env node
require("./_env-guard");
// Create path 7: bring in a text or JSON file, or save the words and draft as a file.
// Both stay in the browser. Draft it still posts studio-draft. Yes still posts save-ai.
// Both go only to /api/desks. A secret that was never in the words is not in the file.
// Not part of npm test. usage: node scripts/check-create-import-export-ui.js [repoRoot]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
let failures = 0, passes = 0;
function fail(msg) { failures += 1; console.error("FAIL " + msg); }
function ok(cond, msg) { if (cond) passes += 1; else fail(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const HINT = "Bring in a text or JSON file, or drop it on the words. You can still change them. Save a file keeps a copy on this phone. Nothing is uploaded.";
const BROUGHT = "Brought in from your file. Change any words you want. Then tap Draft it.";
const BROUGHT_SHORT = "Brought in from your file. Long text was shortened so it fits. Change any words you want. Then tap Draft it.";
const SAVED = "Saved a file on this phone. Nothing was uploaded.";
const EMPTY_SAVE = "Nothing to save yet. Type some words, or bring in a file.";
const FILE_KIND = "Use a plain text or JSON file.";
const FILE_BIG = "That file is too big. Use a short text or JSON file.";
const FILE_EMPTY = "That file had no words to use.";
const FILE_JSON = "That JSON file could not be read. Use plain text, or a file with words in it.";
const SECRET = "s3cret-key-99";
const QUERY = "query-token-77";
const SESSION = "sess-token-55";
const PIN = "pin-secret-33";
const TEXT_WORDS = "When a parent asks to change pickup, draft a reply and a reminder for me.";
const JSON_WORDS = "When trash day changes, draft a reminder with the date.";
const PACKS = [
  "When a parent asks to change pickup, draft a reply and a reminder for me.",
  "When a bill is due, draft a reminder with the date and what it is for.",
  "When a neighbor asks for help, draft a short reply and a time that works.",
  "Remind me to water the plants every Tuesday, and draft a note if a day gets missed."
];

const html = read("create.html");
const js = read("create-simple.js");
const pkg = read("package.json");
const deskPath = path.join(root, "desk.html");
const cs = (html.match(/<section class="card cs" id="cs">[\s\S]*?<\/section>/) || [""])[0];
const code = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const starters = (cs.match(/<div class="chips" id="cs-starters"[\s\S]*?<\/div>/) || [""])[0];
const files = (cs.match(/<div class="row-btns" id="cs-files"[\s\S]*?<\/div>/) || [""])[0];
const moreAt = html.indexOf('id="more-ways"');
const more = moreAt >= 0 ? html.slice(moreAt) : "";

ok(fs.existsSync(deskPath) && fs.statSync(deskPath).size === 35012, "desk.html stays 35012 bytes");
ok(!/cs-import|cs-export|readImportText|exportText/.test(read("desk.html")), "desk.html does not mention bring-in or save-a-file");
ok(!/check-create-import-export-ui/.test(pkg), "import export check stays out of npm test");
ok(!/check-create-voice-ui/.test(pkg) && !/check-create-starter-pack-ui/.test(pkg) && !/check-create-example-ui/.test(pkg) && !/check-create-when-then-ui/.test(pkg) && !/check-create-webhook-ui/.test(pkg), "earlier Create checks stay out of npm test");
ok(html.indexOf("<script src=\"card-rules.js\"></script>") < html.indexOf("<script src=\"speech.js\"></script>") && html.indexOf("<script src=\"speech.js\"></script>") < html.indexOf("<script src=\"create-simple.js\"></script>"), "card-rules.js and speech.js still load before create-simple.js");
["create-pack-idea.js", "create-pack-adv.js", "create-pack-install.js", "create-pack-download.js", "create-desk.js"].forEach(function (name) {
  ok(html.indexOf(name) >= 0, "create.html still loads " + name);
  ok(cs.indexOf(name) < 0, name + " is not inside the simple card");
});
["create-pack-install.js", "create-pack-download.js", "create-desk.js"].forEach(function (name) {
  ok(read(name).indexOf("Collect stays HOLD") >= 0, name + " still says Collect stays HOLD");
});
ok(more.indexOf('id="start"') >= 0 && more.indexOf('id="picks"') >= 0 && more.indexOf('id="mode-advanced"') >= 0, "other ways stay under Other ways");
ok(/id="cs-import"[^>]*>Bring in a file<\/button>/.test(files) && /id="cs-export"[^>]*>Save a file<\/button>/.test(files), "bring in and save are their own buttons, in plain words");
ok(files.indexOf(HINT) < 0 && cs.indexOf(HINT) > cs.indexOf('id="cs-files"') && cs.indexOf(HINT) < cs.indexOf('id="cs-example"'), "the hint is plain words with the file controls");
ok(cs.indexOf('id="cs-words"') < cs.indexOf('id="cs-import"') && cs.indexOf('id="cs-import"') < cs.indexOf('id="cs-export"') && cs.indexOf('id="cs-export"') < cs.indexOf('id="cs-draft"'), "the controls sit with the words, before Draft it");
ok(/id="cs-import-file"/.test(cs) && /accept="[^"]*json/.test(cs) && /#cs-import-file\{position:absolute/.test(html), "the chooser accepts a text or JSON file and stays clipped off the card");
ok(!/type="file"|<input[^>]*type="file"/i.test(cs), "the card markup leaves the file type for the page to set");
ok(starters.indexOf("cs-import") < 0 && starters.indexOf("cs-export") < 0 && starters.indexOf("Bring in a file") < 0, "bring in and save are not pack chips");
ok(/id="cs-starters"/.test(cs) && /<details id="cs-when-pick">/.test(cs) && /id="cs-words"/.test(cs) && /id="cs-draft">Draft it<\/button>/.test(cs), "packs, the picker, the words box, and Draft it stay");
ok(/id="cs-example"[^>]*>Show an example<\/button>/.test(cs), "Show an example stays");
ok(/<details id="cs-webhook">/.test(cs) && /id="cs-webhook-secret"/.test(cs), "Also talk to an AI or a site stays");
ok(/id="cs-talk"[^>]*>Talk<\/button>/.test(cs) && /id="cs-quiet"[^>]*>Quiet<\/button>/.test(cs), "Talk and Quiet stay on the card");
ok(/id="cs-yes">Yes<\/button>/.test(cs) && /id="cs-stop">Stop<\/button>/.test(cs) && /id="cs-kill">Kill<\/button>/.test(cs), "Yes, Stop, and Kill stay their own buttons");
ok(cs.indexOf('id="cs-pack"') < 0, "path id cs-pack stays off this card");
ok(/@media\(max-width:420px\)\{#cs-files\{flex-direction:column\}\}/.test(html), "file buttons stack on a narrow phone");
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
ok(!fs.existsSync(path.join(root, "api", "import.js")) && !fs.existsSync(path.join(root, "api", "export.js")) && !fs.readdirSync(path.join(root, "api")).some(function (name) { return /^(webhook|import|export)/i.test(name); }), "no new import, export, or webhook route");
ok(js.indexOf('setAttribute("type", "file")') >= 0 && js.indexOf("new FileReader()") >= 0 && js.indexOf("createObjectURL") >= 0 && js.indexOf("new Blob(") >= 0, "bring in uses a file input and FileReader, and save uses a blob download");

function makeEl(tag) {
  const el = {
    tagName: String(tag || "div").toLowerCase(), attrs: {}, className: "", id: "", parts: [], hidden: false, disabled: false, value: "", open: false, href: "", download: "", files: null, handlers: {},
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === "href") this.href = String(v); if (k === "download") this.download = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    appendChild(c) { c.parentNode = this; this.parts.push(c); return c; },
    removeChild(c) { this.parts = this.parts.filter(function (p) { return p !== c; }); c.parentNode = null; return c; },
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); },
    focus() { el.page.focused = this.id; },
    click() { el.page.clicks.push(this); }
  };
  Object.defineProperty(el, "textContent", {
    get() { return this.parts.map(function (p) { return p.text !== undefined ? p.text : p.textContent; }).join(""); },
    set(v) { this.parts = [{ text: String(v == null ? "" : v) }]; }
  });
  Object.defineProperty(el, "firstChild", { get() { return this.parts[0] || null; } });
  return el;
}

const IDS = ["cs", "cs-rules-list", "cs-step", "cs-ask", "cs-review", "cs-test", "cs-done", "cs-open", "cs-open-desk", "cs-name", "cs-job", "cs-watches", "cs-drafts", "cs-needs", "cs-src", "cs-words", "cs-draft", "cs-try", "cs-edit", "cs-back", "cs-yes", "cs-stop", "cs-kill", "cs-note", "cs-review-note", "cs-test-note", "cs-samples", "cs-rules-note", "cs-talk", "cs-quiet", "cs-heard", "cs-starters", "cs-starter-hint", "cs-example", "cs-example-walk", "cs-example-lead", "cs-example-draft", "cs-example-samples", "cs-example-next", "cs-when-pick", "cs-when-hint", "cs-when", "cs-then", "cs-webhook", "cs-webhook-hint", "cs-webhook-kind", "cs-webhook-name", "cs-webhook-url", "cs-webhook-secret", "cs-webhook-add", "cs-webhook-review", "cs-files", "cs-file-hint", "cs-import", "cs-export", "cs-import-file", "more-ways"];

function boot(opt) {
  const page = { focused: "", calls: [], stops: 0, listens: 0, pending: null, reads: 0, clicks: [], blobs: [], revoked: [], prevented: 0 };
  const els = {};
  IDS.forEach(function (id) {
    const el = makeEl(id === "cs-when" || id === "cs-then" || id === "cs-webhook-kind" ? "select" : id === "cs-import-file" ? "input" : /words|watches|drafts|needs/.test(id) ? "textarea" : "div");
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
  els["cs-import-file"].hidden = false;
  const store = opt.storage || {};
  const speech = opt.speech || "off";
  const api = speech === "missing" ? undefined : {
    canListen: function () { return speech !== "off"; },
    stopTalk: function () { page.stops += 1; page.pending = null; },
    listen: function (okFn, errFn) {
      page.listens += 1;
      if (speech === "hold") { page.pending = { ok: okFn, err: errFn }; return; }
      okFn("When a neighbor asks for help, draft a short reply");
    }
  };
  function FileReader() { this.result = ""; this.onload = null; this.onerror = null; }
  FileReader.prototype.readAsText = function (file) {
    page.reads += 1;
    if (file && file.fail) { if (typeof this.onerror === "function") this.onerror(); return; }
    this.result = file && file.text != null ? String(file.text) : "";
    if (typeof this.onload === "function") this.onload();
  };
  function Blob(parts, opts) { this.parts = parts || []; this.type = opts && opts.type || ""; }
  const urlApi = {
    createObjectURL: function (blob) { page.blobs.push(blob); return "blob:aia-words"; },
    revokeObjectURL: function (u) { page.revoked.push(u); }
  };
  const body = makeEl("body");
  body.page = page;
  const doc = {
    body: body,
    getElementById: function (id) { return els[id] || null; },
    createElement: function (tag) { const el = makeEl(tag); el.page = page; return el; }
  };
  const sandbox = {
    window: { AIACardRules: ["Plain words."], document: doc },
    URLSearchParams: URLSearchParams,
    location: { search: "", hash: "" },
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); }
    },
    FileReader: FileReader,
    Blob: Blob,
    URL: urlApi,
    fetch: async function (url, init) {
      const body = JSON.parse(init.body);
      page.calls.push({ url: url, body: body, headers: init.headers || {} });
      if (body.action === "studio-draft") {
        if (opt.draftError) return { ok: false, json: async function () { return { ok: false, error: opt.draftError }; } };
        return { ok: true, json: async function () { return { ok: true, pack: { name: "P", kinds: "chore", fields: "who:text", ais: [{ name: "Lane", does: "Drafts pickup notes", steps: "qualify,do" }] } }; } };
      }
      if (body.action === "save-ai") {
        if (opt.saveError) return { ok: false, json: async function () { return { ok: false, error: opt.saveError }; } };
        return { ok: true, json: async function () { return { ok: true, ai: { name: body.name, rules: body.rules } }; } };
      }
      return { ok: false, json: async function () { return { ok: false, error: "no" }; } };
    }
  };
  if (api) sandbox.window.AIASpeech = api;
  vm.runInNewContext(js, sandbox, { filename: "create-simple.js" });
  page.els = els;
  page.api = sandbox.window.AIACreateSimple;
  page.click = function (id) { (els[id].handlers.click || []).forEach(function (fn) { fn({ target: els[id] }); }); };
  page.fire = function (id, ev) { (els[id].handlers[ev] || []).forEach(function (fn) { fn({}); }); };
  page.choose = function (id, value) {
    els[id].value = value;
    (els[id].handlers.change || []).forEach(function (fn) { fn({}); });
  };
  page.drop = function (file) {
    const e = {
      preventDefault: function () { page.prevented += 1; },
      dataTransfer: { files: [file], dropEffect: "" }
    };
    (els["cs-ask"].handlers.drop || []).forEach(function (fn) { fn(e); });
  };
  page.pick = function (file) {
    page.click("cs-import");
    els["cs-import-file"].files = [file];
    (els["cs-import-file"].handlers.change || []).forEach(function (fn) { fn({}); });
  };
  return page;
}

function tick() { return new Promise(function (r) { setImmediate(r); }); }
async function settle() { for (var i = 0; i < 6; i++) await tick(); }
function pressedNames(page) {
  return page.els["cs-starters"].parts.filter(function (b) { return b.getAttribute("aria-pressed") === "true" && b.className === "on"; }).map(function (b) { return b.textContent; });
}
function savedText(page) {
  return page.blobs.map(function (b) { return (b.parts || []).join(""); }).join("\n");
}
function leaks(text) {
  const blob = String(text || "");
  return blob.indexOf(SECRET) >= 0 || blob.indexOf(QUERY) >= 0 || blob.indexOf(SESSION) >= 0 || blob.indexOf(PIN) >= 0;
}

(async function main() {
  const bare = { window: { document: null }, console: console };
  vm.runInNewContext(js, bare, { filename: "create-simple.js" });
  const api = bare.window.AIACreateSimple;
  ok(api && typeof api.readImportText === "function" && typeof api.exportText === "function" && typeof api.allowedFile === "function", "file helpers are available before the page paints");
  const textIn = api.readImportText(TEXT_WORDS + "\n", "pickup.txt", "text/plain");
  ok(textIn.ok && textIn.words === TEXT_WORDS && !textIn.draft && textIn.shortened === false, "a text file becomes the words");
  const long = "Remind me to water the plants. " + "please ".repeat(120);
  const shortIn = api.readImportText(long, "long.txt", "text/plain");
  ok(shortIn.ok && shortIn.words.length <= 600 && shortIn.shortened === true && shortIn.words.indexOf("Remind me to water the plants") === 0, "a long text file is shortened to fit the box");
  ok(api.readImportText("", "empty.txt", "text/plain").note === FILE_EMPTY && api.readImportText("   \n", "blank.txt", "").note === FILE_EMPTY, "an empty file does not invent words");
  ok(api.readImportText("hello\0there", "a.txt", "text/plain").note === FILE_KIND, "a binary file is refused");
  ok(api.readImportText("<html><script>nope</script></html>", "page.html", "text/html").note === FILE_KIND, "a web page is refused");
  ok(api.readImportText("x".repeat(8001), "big.txt", "text/plain").note === FILE_BIG, "a huge file is refused before it fills the box");
  ok(api.allowedFile("notes.exe", "application/octet-stream") === false && api.allowedFile("photo.png", "image/png") === false && api.allowedFile("notes.txt", "text/plain") === true && api.allowedFile("draft.json", "application/json") === true, "only text and JSON files are allowed");
  ok(api.readImportText("{", "bad.json", "application/json").note === FILE_JSON, "broken JSON does not fill the box");
  const secretJson = JSON.stringify({ words: JSON_WORDS, secret: SECRET, token: QUERY, password: PIN });
  const secretIn = api.readImportText(secretJson, "draft.json", "application/json");
  ok(secretIn.ok && secretIn.words === JSON_WORDS && JSON.stringify(secretIn).indexOf(SECRET) < 0 && JSON.stringify(secretIn).indexOf(QUERY) < 0 && JSON.stringify(secretIn).indexOf(PIN) < 0, "a secret in the file is not copied into the words or the draft");
  const draftFile = {
    words: JSON_WORDS,
    name: "Trash helper",
    job: "Draft a reminder when trash day changes",
    watches: ["Trash day changes"],
    drafts: ["A reminder with the date"],
    needs: ["Your Yes before anything is used", "The day"]
  };
  const draftIn = api.readImportText(JSON.stringify(draftFile), "trash.json", "application/json");
  ok(draftIn.ok && draftIn.words === JSON_WORDS && draftIn.draft && draftIn.draft.name === "Trash helper" && draftIn.draft.job === draftFile.job && draftIn.draft.watches[0] === "Trash day changes" && draftIn.draft.needs[1] === "The day", "a JSON draft fills the words and the draft fields");
  const round = api.readImportText(api.exportText(draftIn.words, draftIn.draft), "aia-words.json", "application/json");
  ok(round.ok && round.words === JSON_WORDS && round.draft.name === "Trash helper" && round.draft.drafts[0] === "A reminder with the date", "a saved file can be brought back in");
  const leaked = api.exportText(JSON_WORDS, { name: "Trash helper", job: draftFile.job, secret: SECRET, token: QUERY, watches: draftFile.watches, drafts: draftFile.drafts, needs: draftFile.needs });
  ok(leaked.indexOf(SECRET) < 0 && leaked.indexOf(QUERY) < 0 && leaked.indexOf(JSON_WORDS) >= 0 && leaked.indexOf("Trash helper") >= 0, "a saved file keeps the words and leaves a secret out");
  ok(!/\b(PASS|FAIL|HOLD)\b|stripe|checkout|buy-pack|\/market|\bBuy\b|Pay now|Charge now/i.test(HINT + "\n" + BROUGHT + "\n" + SAVED + "\n" + FILE_KIND), "the file notes do not sell or charge");

  {
    const w = boot({});
    ok(w.els["cs-import-file"].getAttribute("type") === "file", "the page turns the chooser into a file input");
    ok(w.els["cs-words"].value === "" && w.calls.length === 0 && w.reads === 0 && w.els["cs-ask"].hidden === false, "bring in does not fill the box by itself");
    w.click("cs-export");
    ok(w.blobs.length === 0 && w.els["cs-note"].textContent === EMPTY_SAVE && w.calls.length === 0, "save with no words does not download or post");
  }

  {
    const w = boot({});
    w.pick({ name: "pickup.txt", type: "text/plain", size: TEXT_WORDS.length, text: TEXT_WORDS });
    ok(w.reads === 1 && w.els["cs-words"].value === TEXT_WORDS && w.els["cs-note"].textContent === BROUGHT && w.calls.length === 0 && w.els["cs-ask"].hidden === false && w.focused === "cs-words", "bringing in a text file fills the words and does not post");
    ok(w.els["cs-import-file"].value === "", "the chooser can take the same file again");
    w.els["cs-words"].value = TEXT_WORDS.replace("reply", "note");
    (w.els["cs-words"].handlers.input || []).forEach(function (fn) { fn({}); });
    ok(w.els["cs-words"].value.indexOf("note") >= 0 && w.calls.length === 0, "the person can still change the words");
    w.click("cs-draft");
    await settle();
    ok(w.calls.length === 0 && w.els["cs-review"].hidden === false && w.els["cs-job"].value.indexOf("note") >= 0 && w.els["cs-src"].textContent.indexOf("Your desk is not open") >= 0, "Draft it still opens a review from the words when the desk is closed");
    w.click("cs-try");
    ok(w.els["cs-test"].hidden === false && w.els["cs-samples"].textContent.indexOf("Sample, made up") >= 0 && w.els["cs-samples"].textContent.indexOf("Nothing is sent.") >= 0, "Try it on sample cards still stays on this phone");
    w.click("cs-yes");
    await settle();
    ok(w.calls.length === 0 && w.els["cs-test-note"].textContent.indexOf("Nothing was saved") >= 0, "Yes with no open desk saves nothing");
    w.click("cs-stop");
    ok(w.els["cs-words"].value.indexOf("note") >= 0 && w.els["cs-ask"].hidden === false && w.els["cs-note"].textContent.indexOf("Stopped.") === 0, "Stop keeps the words from the file");
    w.click("cs-kill");
    ok(w.els["cs-words"].value === "" && w.calls.length === 0 && w.els["cs-note"].textContent.indexOf("Killed.") === 0, "Kill throws the brought-in words away");
  }

  const open = { aia_ws: "Own Desk", aia_session: SESSION, aia_pin: PIN };
  {
    const w = boot({ storage: open });
    w.els["cs-webhook-secret"].value = SECRET;
    w.pick({ name: "pickup.txt", type: "text/plain", size: 40, text: TEXT_WORDS });
    w.els["cs-words"].value = TEXT_WORDS + " extra";
    w.click("cs-draft");
    await settle();
    ok(w.calls.length === 1 && w.calls[0].url === "/api/desks" && w.calls[0].body.action === "studio-draft" && w.calls[0].body.brief.indexOf("extra") >= 0 && w.calls[0].body.brief.indexOf(SECRET) < 0, "Draft it still posts only studio-draft, without the secret");
    ok(w.els["cs-review"].hidden === false && w.els["cs-name"].value === "Lane", "review still opens on the studio draft");
    w.click("cs-try");
    w.click("cs-yes");
    await settle();
    ok(w.calls.length === 2 && w.calls[1].body.action === "save-ai" && JSON.stringify(w.calls[1].body).indexOf(SECRET) < 0, "Yes still posts only save-ai, without the secret");
    ok(w.els["cs-done"].textContent.indexOf("Nothing was sent or charged.") >= 0, "Yes still says nothing was sent or charged");
  }

  {
    const w = boot({ storage: open });
    const file = JSON.stringify({ words: JSON_WORDS, name: "Trash helper", job: "Draft a reminder when trash day changes", watches: ["Trash day changes"], drafts: ["A reminder with the date"], needs: ["Your Yes before anything is used"], secret: SECRET, token: QUERY });
    w.els["cs-webhook-secret"].value = SECRET;
    w.drop({ name: "trash.json", type: "application/json", size: file.length, text: file });
    ok(w.prevented >= 1 && w.els["cs-words"].value === JSON_WORDS && w.els["cs-name"].value === "Trash helper" && w.els["cs-note"].textContent === BROUGHT && w.calls.length === 0, "dropping a JSON file fills the words and the draft fields");
    ok(w.els["cs-words"].value.indexOf(SECRET) < 0 && w.els["cs-note"].textContent.indexOf(SECRET) < 0 && w.els["cs-job"].value.indexOf(SECRET) < 0, "the secret in that file is not shown");
    w.click("cs-export");
    const saved = savedText(w);
    ok(w.calls.length === 0 && w.blobs.length === 1 && w.blobs[0].type === "application/json" && w.clicks.some(function (n) { return n.download === "aia-words.json"; }) && w.revoked.length === 1, "save downloads aia-words.json on this phone and does not post");
    ok(saved.indexOf(JSON_WORDS) >= 0 && saved.indexOf("Trash helper") >= 0 && !leaks(saved), "the file has the words and the draft, and not the secret or the sign-in");
    ok(w.els["cs-note"].textContent === SAVED, "save says the file stayed on this phone");
    w.click("cs-draft");
    await settle();
    ok(w.calls.length === 1 && w.calls[0].body.action === "studio-draft" && w.els["cs-name"].value === "Lane", "Draft it still prefers the desk draft when the desk answers");
  }

  {
    const w = boot({});
    const file = JSON.stringify({ words: JSON_WORDS, name: "Trash helper", job: "Draft a reminder when trash day changes", watches: ["Trash day changes"], drafts: ["A reminder with the date"], needs: ["Your Yes"] });
    w.pick({ name: "trash.json", type: "application/json", size: file.length, text: file });
    w.click("cs-draft");
    await settle();
    ok(w.calls.length === 0 && w.els["cs-name"].value === "Trash helper" && w.els["cs-job"].value === "Draft a reminder when trash day changes" && w.els["cs-watches"].value === "Trash day changes", "with no desk, Draft it keeps the draft fields from the file");
    w.els["cs-webhook-secret"].value = SECRET;
    w.click("cs-back");
    w.click("cs-export");
    ok(!leaks(savedText(w)) && savedText(w).indexOf("Trash helper") >= 0 && w.calls.length === 0, "saving after review still leaves the secret out");
  }

  {
    const w = boot({});
    w.els["cs-words"].value = TEXT_WORDS;
    w.els["cs-webhook-secret"].value = SECRET;
    w.click("cs-export");
    ok(savedText(w).indexOf(TEXT_WORDS) >= 0 && !leaks(savedText(w)) && w.calls.length === 0, "a secret typed only in its hidden field is not in the saved file");
    const before = w.els["cs-words"].value;
    w.pick({ name: "page.html", type: "text/html", size: 20, text: "<html>nope</html>" });
    ok(w.reads === 0 && w.els["cs-words"].value === before && w.els["cs-note"].textContent === FILE_KIND, "a web page is not brought in");
    w.pick({ name: "big.txt", type: "text/plain", size: 20001, text: "nope" });
    ok(w.reads === 0 && w.els["cs-words"].value === before && w.els["cs-note"].textContent === FILE_BIG, "a file that is too big is not read");
    w.pick({ name: "bad.json", type: "application/json", size: 2, text: "{" });
    ok(w.els["cs-words"].value === before && w.els["cs-note"].textContent === FILE_JSON, "broken JSON leaves the words as they were");
    w.pick({ name: "long.txt", type: "text/plain", size: 700, text: long });
    ok(w.els["cs-words"].value.length <= 600 && w.els["cs-words"].value.length > 0 && w.els["cs-note"].textContent === BROUGHT_SHORT, "a long file fills a shortened line the person can edit");
  }

  {
    const w = boot({ speech: "hold" });
    w.click("cs-talk");
    ok(w.listens === 1 && w.els["cs-talk"].getAttribute("aria-pressed") === "true", "Talk still listens");
    w.drop({ name: "pickup.txt", type: "text/plain", size: TEXT_WORDS.length, text: TEXT_WORDS });
    ok(w.stops >= 1 && w.els["cs-talk"].getAttribute("aria-pressed") === "false" && w.els["cs-words"].value === TEXT_WORDS && w.els["cs-heard"].textContent === "Quiet. Type what you want automated, or tap Talk.", "bringing in a file stops Talk and fills the words");
    w.click("cs-quiet");
    ok(w.els["cs-heard"].textContent === "Quiet. Type what you want automated, or tap Talk.", "Quiet still says to type or talk");
  }

  {
    const w = boot({});
    w.pick({ name: "pickup.txt", type: "text/plain", size: 20, text: "Temporary words from a file." });
    const chip = w.els["cs-starters"].parts.filter(function (b) { return b.textContent === "A bill due"; })[0];
    (chip.handlers.click || []).forEach(function (fn) { fn({}); });
    ok(w.els["cs-words"].value === PACKS[1] && pressedNames(w).join(",") === "A bill due" && w.calls.length === 0, "a pack still replaces the words");
    w.click("cs-example");
    ok(w.els["cs-example-walk"].hidden === false && w.els["cs-words"].value.indexOf("school moves pickup") >= 0 && w.calls.length === 0, "Show an example still fills the words");
    w.els["cs-when-pick"].open = true;
    w.choose("cs-when", "trash");
    w.choose("cs-then", "reminder");
    ok(w.els["cs-words"].value === "When trash day changes, draft a reminder with the date." && w.calls.length === 0, "when this happens and what to draft still build the words");
    w.els["cs-webhook"].open = true;
    w.choose("cs-webhook-kind", "site");
    w.els["cs-webhook-name"].value = "School notes";
    w.els["cs-webhook-url"].value = "https://school.example/notes";
    w.els["cs-webhook-secret"].value = SECRET;
    w.click("cs-webhook-add");
    ok(w.els["cs-words"].value.indexOf("https://school.example/notes") >= 0 && w.els["cs-words"].value.indexOf(SECRET) < 0 && w.calls.length === 0, "Also talk to an AI or a site still adds the address only");
    w.click("cs-export");
    ok(savedText(w).indexOf("https://school.example/notes") >= 0 && !leaks(savedText(w)), "the saved file can include the address from the words and still leaves the secret out");
  }

  if (failures) { console.error(failures + " failed, " + passes + " passed"); process.exit(1); }
  console.log("check-create-import-export-ui ok (" + passes + " passed)");
})();
