// check-bring-ai-ui: Bring your AI, slice 1 (account.html #acct-bring-ai, bring-ai.js).
// Drives the real flow in a fake page: pick ChatGPT, drop the file, check the preview, untick, Yes.
// - nothing leaves the page before Yes: no fetch, beacon, XHR, socket, storage write, IndexedDB
// - unticked chats are not sent
// - the synthetic ChatGPT fixtures parse (current branch only, user/assistant only, dedupe, titles)
// - projects become desks only when the file has a project field; otherwise one desk named after the AI
// - one topic per card: each chat is exactly one card holding only its own messages
// - ZIP via the browser's own inflate; preview reuses card-thread.js; 44px targets; plain words
// Every rule has a mutant below that must be caught.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");
const { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const FIX = path.join(root, "scripts/fixtures/bring-ai");
const PLAIN = fs.readFileSync(path.join(FIX, "chatgpt-conversations.json"));
const PROJ = fs.readFileSync(path.join(FIX, "chatgpt-projects.json"));
const SRC = { "bring-ai.js": read("bring-ai.js"), "card-thread.js": read("card-thread.js"), "account.html": read("account.html"), "package.json": read("package.json") };

function zipOf(name, data, store) {
  const body = store ? data : zlib.deflateRawSync(data);
  const nm = Buffer.from(name), method = store ? 0 : 8;
  const loc = Buffer.alloc(30); loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(method, 8);
  loc.writeUInt32LE(body.length, 18); loc.writeUInt32LE(data.length, 22); loc.writeUInt16LE(nm.length, 26);
  const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(method, 10);
  cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(nm.length, 28); cen.writeUInt32LE(0, 42);
  const off = 30 + nm.length + body.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + nm.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([loc, nm, body, cen, nm, end]);
}
function fileOf(buf) { return { size: buf.length, arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)) }; }

// ---- a small fake page ----
function page() {
  const byId = {}, net = [];
  function mk(tag) {
    const n = { tagName: String(tag).toUpperCase(), children: [], parentNode: null, attrs: {}, className: "", id: "", _t: "", _on: {}, hidden: false, checked: false, disabled: false, open: false, value: "", files: null };
    n.appendChild = (c) => { c.parentNode = n; n.children.push(c); if (c.id) byId[c.id] = c; return c; };
    n.removeChild = (c) => { n.children = n.children.filter((x) => x !== c); return c; };
    Object.defineProperty(n, "firstChild", { get: () => n.children[0] || null });
    Object.defineProperty(n, "textContent", { get: () => n._t + n.children.map((c) => c.textContent).join(" "), set: (v) => { n._t = String(v); n.children = []; } });
    n.setAttribute = (k, v) => { n.attrs[k] = String(v); };
    n.getAttribute = (k) => (k in n.attrs ? n.attrs[k] : null);
    n.addEventListener = (ev, f) => { (n._on[ev] = n._on[ev] || []).push(f); };
    n.fire = (ev, e) => (n._on[ev] || []).map((f) => f(Object.assign({ preventDefault() {} }, e || {})));
    return n;
  }
  const doc = { readyState: "complete", head: mk("head"), body: mk("body"), createElement: mk, getElementById: (id) => byId[id] || null, addEventListener() {} };
  const sec = mk("section"); sec.id = "acct-bring-ai"; sec.hidden = true; doc.body.appendChild(sec);
  const store = { aia_ws: "probe-desk", aia_session: "s-123" };
  const win = {
    console, document: doc, Promise, JSON, Object, Array, String, Number, Date, Math, Uint8Array, isFinite, setTimeout,
    TextDecoder, Blob, Response, DecompressionStream,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k) => net.push("localStorage.setItem " + k), removeItem: (k) => net.push("localStorage.removeItem " + k) },
    sessionStorage: { getItem: () => null, setItem: (k) => net.push("sessionStorage.setItem " + k) },
    navigator: { sendBeacon: (u) => { net.push("beacon " + u); return true; } },
    indexedDB: { open: () => { net.push("indexedDB"); return {}; } },
    XMLHttpRequest: function () { net.push("xhr"); this.open = () => {}; this.send = () => {}; this.setRequestHeader = () => {}; },
    WebSocket: function (u) { net.push("websocket " + u); },
    EventSource: function (u) { net.push("eventsource " + u); },
    BroadcastChannel: function () { net.push("broadcast"); this.postMessage = () => {}; },
    fetch: (u, o) => { net.push({ url: u, body: o && o.body }); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); }
  };
  win.window = win; win.self = win; win.top = win;
  return { win, doc, sec, net, byId };
}
function all(n, test, out) { out = out || []; if (test(n)) out.push(n); (n.children || []).forEach((c) => all(c, test, out)); return out; }
const hasCls = (c) => (n) => String(n.className || "").split(" ").indexOf(c) >= 0;
const flush = () => new Promise((r) => setImmediate(r)).then(() => new Promise((r) => setTimeout(r, 5)));
async function settle() { for (let i = 0; i < 20; i++) await flush(); }

async function flow(S, file, opts) {
  opts = opts || {};
  const P = page();
  const ctx = vm.createContext(P.win);
  vm.runInContext(S["card-thread.js"], ctx, { filename: "card-thread.js", timeout: 2000 });
  vm.runInContext(S["bring-ai.js"], ctx, { filename: "bring-ai.js", timeout: 2000 });
  await settle();
  const r = { P, before: [], picks: all(P.sec, hasCls("bring-ai-pick")) };
  const gpt = r.picks.find((b) => b.getAttribute("data-ai") === "chatgpt");
  if (!gpt) return r;
  gpt.fire("click");
  await settle();
  const inp = all(P.sec, hasCls("bring-ai-input"))[0];
  r.link = all(P.sec, hasCls("bring-ai-link"))[0];
  if (!inp) return r;
  inp.files = [file];
  inp.fire("change");
  await settle();
  r.desks = all(P.sec, hasCls("bring-ai-desk")).map((d) => ({ name: d.children[0] && d.children[0].textContent, chats: all(d, hasCls("bring-ai-row")).slice(1).map((x) => x.textContent) }));
  // open every chat's thread (must stay on the device)
  all(P.sec, hasCls("bring-ai-thread")).forEach((d) => { d.open = true; d.fire("toggle"); });
  await settle();
  r.threads = all(P.sec, hasCls("bring-ai-thread")).map((d) => ({ tags: all(d, hasCls("ct-tag")).map((t) => t.textContent), text: d.textContent }));
  if (opts.untick) {
    const row = all(P.sec, hasCls("bring-ai-row")).find((x) => x.textContent.indexOf(opts.untick) >= 0 && !/^ ?Desk:/.test(x.textContent.trim()));
    const box = row && row.children[0];
    if (box) { box.checked = false; box.fire("change"); await settle(); }
  }
  r.before = P.net.slice();
  const yes = all(P.sec, hasCls("bring-ai-go"))[0];
  r.yesLabel = yes ? yes.textContent : "";
  if (yes && !opts.noYes) { yes.fire("click"); await settle(); }
  r.sent = P.net.filter((x) => typeof x === "object").map((x) => ({ url: x.url, body: JSON.parse(x.body) }));
  r.other = P.net.filter((x) => typeof x !== "object");
  r.status = (all(P.sec, hasCls("bring-ai-status"))[0] || { textContent: "" }).textContent;
  return r;
}
const chatsOf = (sent) => sent.flatMap((s) => (Array.isArray(s.body.projects) ? s.body.projects : []).flatMap((d) => (d.chats || []).map((c) => Object.assign({ desk: d.name }, c))));

const ASYNC_ERRS = [];
process.on("unhandledRejection", (e) => ASYNC_ERRS.push(String(e && e.message || e)));
process.on("uncaughtException", (e) => ASYNC_ERRS.push(String(e && e.message || e)));
async function suite(S) {
  const f = [];
  const errs0 = ASYNC_ERRS.length;
  const ok = (c, m) => { if (!c) f.push(m); };
  let a, b, z, zs, n;
  try {
    a = await flow(S, fileOf(PLAIN), { untick: "Bike tune-up" });
    b = await flow(S, fileOf(PROJ));
    z = await flow(S, fileOf(zipOf("Export/conversations.json", PLAIN)));
    zs = await flow(S, fileOf(zipOf("conversations.json", PROJ, true)));
    n = await flow(S, fileOf(PROJ), { noYes: true });
  } catch (e) { return ["the flow does not run: " + (e && e.message)]; }
  ok(a.picks.map((p) => p.textContent).join(",") === "ChatGPT,Claude,Grok,Gemini,Perplexity,Copilot", "step 1 lists the six AIs (" + a.picks.map((p) => p.textContent) + ")");
  // official export pages only
  const OFFICIAL = { chatgpt: "https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data", claude: "https://support.anthropic.com/en/articles/9450526-how-can-i-export-my-claude-ai-data", grok: "https://x.ai/legal/faq", gemini: "https://support.google.com/accounts/answer/3024190", perplexity: "https://www.perplexity.ai/hub/legal/self-serve-data-options", copilot: "https://support.microsoft.com/en-us/privacy/manage-your-copilot-activity-history-in-the-privacy-dashboard" };
  const hrefs = {}; (S["bring-ai.js"].match(/\{ id: "(\w+)", name: "[^"]+",(?: reads: true,)? href: "([^"]+)" \}/g) || []).forEach((m) => { const x = /id: "(\w+)".*href: "([^"]+)"/.exec(m); hrefs[x[1]] = x[2]; });
  ok(JSON.stringify(hrefs) === JSON.stringify(OFFICIAL), "step 2 links only the plan's official export pages (" + JSON.stringify(hrefs) + ")");
  ok(a.link && a.link.href === OFFICIAL.chatgpt && a.link.rel === "noopener noreferrer", "step 2 opens ChatGPT's own export page, rel noopener");
  // nothing before Yes
  [a, b, z, zs, n].forEach((r, i) => ok(r.before.length === 0, "nothing leaves the page before Yes (run " + i + ": " + JSON.stringify(r.before).slice(0, 160) + ")"));
  ok(n.sent.length === 0 && n.other.length === 0, "with no Yes, nothing is ever sent");
  [a, b, z, zs].forEach((r, i) => ok(r.other.length === 0, "Yes uses one POST only, no storage or beacon (run " + i + ": " + r.other.join(",") + ")"));
  ok(a.sent.length === 1 && a.sent[0].url === "/api/account" && a.sent[0].body.action === "import-ai" && a.sent[0].body.provider === "chatgpt" && a.sent[0].body.part === 1 && a.sent[0].body.parts === 1, "Yes sends one import-ai POST to /api/account (" + JSON.stringify(a.sent.map((s) => [s.url, s.body.action])) + ")");
  // fixtures parse; one desk named after the AI
  ok(JSON.stringify(a.desks.map((d) => d.name.trim())) === JSON.stringify(["Desk: ChatGPT (3 chats)"]), "no project field: one desk named after the AI (" + JSON.stringify(a.desks.map((d) => d.name)) + ")");
  const ca = chatsOf(a.sent);
  ok(ca.map((c) => c.conversationId).join(",") === "c-1,c-3", "unticked chat is not sent (" + ca.map((c) => c.conversationId) + ")");
  ok(/Yes, bring in 2 chats/.test(a.yesLabel), "Yes counts only ticked chats (" + a.yesLabel + ")");
  const c1 = ca.find((c) => c.conversationId === "c-1") || { messages: [] };
  ok(JSON.stringify(c1.messages.map((m) => m.role + ":" + m.text)) === JSON.stringify(["user:How often should I water a fern?", "assistant:About once a week, when the top soil is dry."]), "current branch only; no system rows; no abandoned edits (" + JSON.stringify(c1.messages) + ")");
  const c3 = ca.find((c) => c.conversationId === "c-3") || {};
  ok(c3.title === "Plan a weekend trip to Galena", "a chat with no title is named from its first question (" + c3.title + ")");
  ok(c1.title === "Water the plants" && c1.createdAt === "2025-11-01T12:00:00.000Z" && c1.messageCount === 2 && c1.excerpt === "How often should I water a fern?", "each card carries title, date, count, excerpt (" + JSON.stringify([c1.title, c1.createdAt, c1.messageCount, c1.excerpt]) + ")");
  // project grouping
  const want = ["Desk: Kitchen remodel (2 chats)", "Desk: Spanish practice (1 chat)", "Desk: ChatGPT (1 chat)"];
  ok(JSON.stringify(b.desks.map((d) => d.name.trim())) === JSON.stringify(want), "project field: projects become desks; the rest go to the AI's desk; duplicates dropped (" + JSON.stringify(b.desks.map((d) => d.name)) + ")");
  const cb = chatsOf(b.sent);
  ok(cb.map((c) => c.desk + "/" + c.conversationId).join(",") === "Kitchen remodel/p-1,Kitchen remodel/p-2,Spanish practice/p-3,ChatGPT/p-4", "each chat goes to its own project's desk (" + cb.map((c) => c.desk + "/" + c.conversationId) + ")");
  // one topic per card
  [ca, cb].forEach((cs, i) => {
    const ids = cs.map((c) => c.conversationId);
    ok(new Set(ids).size === ids.length, "one card per chat, no doubles (run " + i + ")");
  });
  const p1 = cb.find((c) => c.conversationId === "p-1") || { messages: [] };
  ok(p1.messages.length === 2 && p1.messages.every((m) => /cabinet|Sage/i.test(m.text)) && !p1.messages.some((m) => /duplicate|quote|drill/i.test(m.text)), "a card holds only its own chat's messages (" + JSON.stringify(p1.messages) + ")");
  ok(b.threads.length === 4 && /Sage or navy/.test(b.threads[0].text) && !/Compare two quotes/.test(b.threads[0].text), "each chat previews as its own thread (" + b.threads.length + ")");
  ok(b.threads[0] && b.threads[0].tags.join(",") === "You,AI", "the preview is the card thread: You, then AI (" + (b.threads[0] && b.threads[0].tags) + ")");
  // ZIP
  ok(chatsOf(z.sent).map((c) => c.conversationId).join(",") === "c-1,c-2,c-3", "a ZIP export (deflate) is read on the device (" + chatsOf(z.sent).map((c) => c.conversationId) + ")");
  ok(chatsOf(zs.sent).length === 4, "a ZIP export (stored) is read on the device");
  // fail closed
  const T = await flow(S, fileOf(Buffer.from(JSON.stringify([{ title: "no mapping" }]))));
  ok(T.sent.length === 0 && /can't read this file/.test(T.status) && !all(T.P.sec, hasCls("bring-ai-go")).length, "an unknown layout imports nothing (" + T.status + ")");
  // page, css, words
  ok(SRC_OK(S), "account.html has the section and loads card-thread.js before bring-ai.js");
  const css = (S["bring-ai.js"].match(/s\.textContent =\s*\n([\s\S]*?);\n/) || ["", ""])[1];
  ok(/#acct-bring-ai button,#acct-bring-ai \.bring-ai-link,#acct-bring-ai \.bring-ai-file,#acct-bring-ai \.bring-ai-row,#acct-bring-ai \.bring-ai-thread summary\{min-height:44px;min-width:44px/.test(css), "every tap target is 44px (buttons, links, file, rows, See this chat)");
  const shown = (S["bring-ai.js"].match(/"[^"]{6,}"/g) || []).filter((x) => / /.test(x) && !/^"https?:|#acct|function|\\u/.test(x)).join(" ");
  ok(!/\b(pay|paid|charge|price|bill|terms|privacy policy|legal|consent|agree|james|oddo|api|json payload|endpoint|upload)\b/i.test(shown.replace(/"Drop the ZIP or JSON"|conversations\.json/g, "")), "plain words: no payment, legal, owner names or jargon on screen");
  ok(!/\b(james|oddo)\b/i.test(S["bring-ai.js"] + S["account.html"].slice(S["account.html"].indexOf('id="acct-bring-ai"'), S["account.html"].indexOf('id="acct-bring-ai"') + 200)), "no owner names in Bring your AI");
  let pkg = ""; try { pkg = JSON.parse(S["package.json"]).scripts.test; } catch (e) {}
  ok(/node scripts\/check-card-thread\.js && node scripts\/check-bring-ai-ui\.js && node scripts\/check-ux-signin\.js/.test(pkg), "npm test runs check-bring-ai-ui");
  if (ASYNC_ERRS.length > errs0) f.push("the page threw: " + ASYNC_ERRS[errs0]);
  return f;
}
function SRC_OK(S) {
  const h = S["account.html"];
  const i = h.indexOf('<section id="acct-bring-ai" class="card" aria-label="Bring your AI" hidden></section>');
  const a = h.indexOf('<script src="card-thread.js"></script>'), b = h.indexOf('<script src="bring-ai.js"></script>');
  return i > 0 && a > 0 && b > a;
}
function staticChecks() {
  const f = [];
  let base = "", changed = null;
  try { base = execFileSync("git", ["merge-base", "HEAD", "origin/main"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch (e) {}
  if (base) { try { changed = execFileSync("git", ["diff", "--name-only", base, "--", "desk.html", "api", "legal.html"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch (e) {} }
  if (changed === null) f.push("could not diff against main (failing closed)");
  else if (changed) f.push("desk.html, api/ and legal.html stay as on main (" + changed.replace(/\n/g, ", ") + ")");
  return f;
}

function rep(file, a, b) { return (S) => { const s = S[file]; if (s.indexOf(a) < 0 || s.indexOf(a) !== s.lastIndexOf(a)) return null; const o = Object.assign({}, S); o[file] = s.replace(a, b); return o; }; }
const BA = "bring-ai.js", AH = "account.html", PK = "package.json";
const MUTANTS = [
  ["fetch on file drop", rep(BA, '    say("Reading the file on this device...");', '    say("Reading the file on this device..."); fetch("/api/account", { method: "POST", body: "{}" });')],
  ["beacon on preview", rep(BA, "      got = r.got;\n", "      got = r.got; navigator.sendBeacon(\"/api/log\", \"x\");\n")],
  ["storage sync on preview", rep(BA, "      got = r.got;\n", "      got = r.got; localStorage.setItem(\"aia_bring\", JSON.stringify(got));\n")],
  ["send when a chat is opened", rep(BA, "      done = true;\n", "      done = true; send();\n")],
  ["send as soon as read", rep(BA, "      paintPreview();\n      say(\"\");", "      paintPreview();\n      say(\"\"); send();")],
  ["untick ignored", rep(BA, "      var chats = d.chats.filter(function (c) { return !off[key(d.name, c.id)]; });", "      var chats = d.chats;")],
  ["untick box does nothing", rep(BA, "          if (on) delete off[key(d.name, c.id)]; else off[key(d.name, c.id)] = 1;\n          paintPreview();", "          paintPreview();")],
  ["whole branch tree, not current node", rep(BA, "    if (c.current_node && map[c.current_node]) {", "    if (false) {")],
  ["system rows kept", rep(BA, '      if (role !== "user" && role !== "assistant") return;', "      if (!role) return;")],
  ["duplicates kept", rep(BA, "      if (seen[id]) return;\n", "")],
  ["no title fallback", rep(BA, '|| cleanText(first, 60) || "Untitled chat"', '|| "Untitled chat"')],
  ["group by title when there is no project", rep(BA, "      var name = (named && projectOf(c)) || aiName;", "      var name = (named && projectOf(c)) || cleanText(c.title, 80) || aiName;")],
  ["never group by project", rep(BA, "    var named = data.some(function (c) { return !!projectOf(c); });", "    var named = false;")],
  ["project.name ignored", rep(BA, '    if (p && typeof p === "object" && typeof p.name === "string") return cleanText(p.name, 80);\n', "")],
  ["desk not named after the AI", rep(BA, "      var name = (named && projectOf(c)) || aiName;", '      var name = (named && projectOf(c)) || "Imported";')],
  ["chats merged into one card", rep(BA, "        slot.chats.push(card);", "        if (slot.chats.length) slot.chats[0].messages = slot.chats[0].messages.concat(card.messages); else slot.chats.push(card);")],
  ["card holds the whole desk", rep(BA, "    return { conversationId: c.id, title: c.title, createdAt: c.createdAt, messageCount: c.messages.length, excerpt: first.slice(0, EXCERPT), messages: c.messages };", "    var mm = [].concat.apply([], (got ? got.projects : []).map(function (d) { return [].concat.apply([], d.chats.map(function (x) { return x.messages; })); }));\n    return { conversationId: c.id, title: c.title, createdAt: c.createdAt, messageCount: c.messages.length, excerpt: first.slice(0, EXCERPT), messages: mm };")],
  ["fails open on unknown layout", rep(BA, '      if (!c0 || typeof c0 !== "object" || !c0.mapping || typeof c0.mapping !== "object" || Array.isArray(c0.mapping)) return null;', "      if (!c0) return null;")],
  ["ZIP deflate broken", rep(BA, 'new DecompressionStream("deflate-raw")', 'new DecompressionStream("gzip")')],
  ["ZIP stored broken", rep(BA, "    if (e.method === 0) return Promise.resolve({ text: new TextDecoder().decode(data) });\n", "")],
  ["ZIP not detected", rep(BA, "      if (isZip(b)) return unzipText(b, \"conversations.json\");\n", "")],
  ["preview not the card thread", rep(BA, "      if (window.AIACardThread) d.appendChild", "      if (false) d.appendChild")],
  ["preview thread mixes chats", rep(BA, "build({ entries: pairsOf(c) }, { stranger: true })", "build({ entries: [].concat.apply([], got.projects.map(function (x) { return [].concat.apply([], x.chats.map(pairsOf)); })) }, { stranger: true })")],
  ["user shown as not-You", rep(BA, '{ actorKind: "human", own: true, text: m.text }', '{ actorKind: "helper", text: m.text }')],
  ["export link swapped", rep(BA, "https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data", "https://chatgpt-export-help.example.com/")],
  ["link without noopener", rep(BA, '      a2.rel = "noopener noreferrer";\n', "")],
  ["tap target under 44px", rep(BA, ",#acct-bring-ai .bring-ai-thread summary{min-height:44px", "{min-height:44px")],
  ["payment words", rep(BA, '"Bring your chats from another AI. ', '"Bring your chats from another AI. It is free, no charge. ')],
  ["owner name on screen", rep(BA, '"Nothing is ticked. Nothing was sent."', '"Nothing is ticked, James. Nothing was sent."')],
  ["section missing", rep(AH, '    <section id="acct-bring-ai" class="card" aria-label="Bring your AI" hidden></section>\n', "")],
  ["card-thread not loaded first", rep(AH, '<script src="card-thread.js"></script>\n<script src="bring-ai.js"></script>', '<script src="bring-ai.js"></script>\n<script src="card-thread.js"></script>')],
  ["not in npm test", rep(PK, "node scripts/check-bring-ai-ui.js && ", "")]
];

(async () => {
  const base = (await suite(SRC)).concat(staticChecks());
  let bad = base.length;
  base.forEach((m) => console.log("FAIL " + m));
  if (!bad) console.log("ok bring-ai: nothing before Yes, untick, fixtures, grouping, one topic per card, ZIP, card thread preview");
  let caught = 0;
  for (const [name, make] of MUTANTS) {
    const S = make(SRC);
    if (!S) { console.log("FAIL mutant does not apply: " + name); bad++; continue; }
    const r = await suite(S);
    if (r.length) { caught++; console.log("ok mutant caught: " + name + " (" + r[0].split("\n")[0].slice(0, 120) + ")"); }
    else { console.log("FAIL mutant NOT caught: " + name); bad++; }
  }
  console.log("check-bring-ai-ui mutants: " + caught + "/" + MUTANTS.length + " caught");
  if (bad) { console.log("check-bring-ai-ui failed"); process.exit(1); }
  console.log("check-bring-ai-ui: ok");
})();
