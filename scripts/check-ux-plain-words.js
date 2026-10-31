#!/usr/bin/env node
require("./_env-guard");
// Plain words on public pages, UI only.
// A stranger on /, /how, /setup, /pricing, /status or /examples never reads internal words
// (HOLD, Collect, pack, pipe, Cap, BYOK, .aia, Wallet.AIA, Ext). Payments read "Payments are off for now".
// /status shows expected held states in neutral grey, not orange or red. One word each for
// Desk, Queue and account. A waiting card never says "Ready"; Blocked and Waiting match
// between /account and the desk. History says one account has one Queue holding many desks.
// Examples never use owner names (james.aia, james-ai@, springfield-shop): yourname.aia, your-shop.aia.
// D2: /help, /pipes (/connections) and /login read plain too (no HOLD, pipe, pack, Ext, owner names),
// except exact sentences other checks still pin (PINNED, each capped at its count today). /account has no
// owner names and fewer HOLD lines, /history says "Any connection", /status paints Whatnot as a grey held
// state, grey text reaches 4.5:1 on light and dark, and every in-site #anchor on /help lands on a real id.
// D3: /help, /pipes, /connections and /history also read plain in what their scripts draw (checkD3): page code runs in a
// vm and its draw functions run on fixtures, other scripts' strings are read; no HOLD, no pipe, and Pack is a name on /history.
// Every file is read up front; a missing or unreadable file is a FAIL (fail closed), never a skip.
// Each rule runs once on the real files, then against mutants that each must be caught.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync, execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const BASE = require("./_api-freeze").BASE; // on main; survives a squash-land
let failed = 0;
let passed = 0;
function fail(msg) { failed += 1; console.error("FAIL " + msg); }
function ok(cond, msg) { if (cond) { passed += 1; console.log("ok  " + msg); } else fail(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function readOrNull(rel) { try { const t = fs.readFileSync(path.join(root, rel), "utf8"); return typeof t === "string" ? t : null; } catch (e) { return null; } }
const PAGES = ["index.html", "how.html", "setup.html", "pricing.html", "status.html", "examples.html"];
const FILES = PAGES.concat(["aia-tip.js", "desk-playbook.js", "setup-demo.js", "queue-login.js", "account-connections.js", "setup-cards.js", "desk-card.js", "history.html", "PACK.md", "pipes.html", "connections.html", "help.html", "desks-book.js", "create-desk.js", "ACCOUNT-YES-NO.md",
  "login.html", "login-doors.js", "account.html", "aia-tld.js", "aia-register-abi.js", "theme.css", "vercel.json", "drop.html", "developer.html", "more.html",
  "theme.js", "desk-nav.js", "mark-fix.js", "analytics.js", "speech.js", "desk-switch.js", "signin-first.js", "market-shop.js", "desk-ais.js", "aia-wallet.js"]);
const PAGES2 = ["help.html", "pipes.html", "connections.html", "login.html"];
const SRC = {};
FILES.forEach((f) => { SRC[f] = readOrNull(f); });

const JARGON = [
  [/\bHOLD\b/, "HOLD"], [/\bCollect\b/, "Collect"], [/\bpacks?\b/i, "pack"], [/\bpipes?\b/i, "pipe"],
  [/\bCap\b/, "Cap"], [/\bBYOK\b/, "BYOK"], [/\.aia\b/, ".aia"], [/Wallet\.AIA/, "Wallet.AIA"], [/\bExt\b/, "Ext"],
  [/\bRecurring update\b/, "Recurring update"], [/real money pipe/, "real money pipe"]
];
// What a stranger can read: text between tags, aria-label/title/alt/placeholder, and prose strings in inline scripts.
function strangerText(html) {
  const out = [];
  const noComments = html.replace(/<!--[\s\S]*?-->/g, " ");
  const scripts = [];
  const body = noComments.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (m, code) => { scripts.push(code); return " "; })
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  body.replace(/<[a-z][^>]*>/gi, (tag) => {
    tag.replace(/\s(aria-label|title|alt|placeholder)="([^"]*)"/gi, (m, k, v) => { out.push(v); return m; });
    return " ";
  });
  out.push(body.replace(/<[^>]+>/g, " "));
  const head = (html.match(/<head[\s\S]*?<\/head>/i) || [""])[0];
  const t = head.match(/<title>([^<]*)<\/title>/i); if (t) out.push(t[1]);
  scripts.forEach((code) => out.push(proseStrings(code).join(" \n ")));
  return out.join(" \n ");
}
function proseStrings(code) {
  const strs = [];
  const clean = code.replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  clean.replace(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g, (m, a, b) => {
    const s = a !== undefined ? a : b;
    if (/\s/.test(s) && /[A-Za-z]{3}/.test(s) && !/[<>{};=]/.test(s)) strs.push(s);
    return m;
  });
  return strs;
}
// Words inside html built in JS strings ("<summary>Other ways to sign in</summary>"), tags dropped.
function markupStrings(code) {
  const strs = [];
  const clean = code.replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  clean.replace(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g, (m, a, b) => {
    const s = (a !== undefined ? a : b).replace(/\\u([0-9a-f]{4})/gi, (x, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\(.)/g, "$1");
    if (/</.test(s)) strs.push(strangerText(s));
    return m;
  });
  return strs;
}
function jargonIn(text) {
  const hits = [];
  JARGON.forEach(([re, word]) => { const m = text.match(re); if (m) hits.push(word + " ('" + text.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, " ").trim() + "')"); });
  return hits;
}

function checkPages(S, bad) {
  PAGES.forEach((p) => {
    jargonIn(strangerText(S[p])).forEach((h) => bad(p + " shows jargon: " + h));
    if (/\b(on|in) (one|the|this) queue\b|\bSame queue\b|\bsame queue\b/.test(strangerText(S[p]))) bad(p + " writes queue in lower case; the word is Queue");
  });
  ["index.html", "how.html", "pricing.html"].forEach((p) => {
    if (!/Payments are off for now/.test(S[p])) bad(p + " must say 'Payments are off for now'");
  });
  if (!/unless you choose to use your own AI key\./.test(S["pricing.html"])) bad("pricing must explain your own AI key in plain words");
  ["index.html", "how.html", "setup.html", "examples.html"].forEach((p) => {
    if (!/>Share an add-on</.test(S[p]) || !/>Update an add-on</.test(S[p])) bad(p + " must label the add-on buttons in plain words");
  });
  ["index.html", "how.html"].forEach((p) => {
    if (!/AIA never holds your keys/.test(S[p])) bad(p + " must keep the wallet honesty line in plain words");
  });
}

const TIP_IDS = ["give-pack", "update-pack", "collect-hold", "connect-wallet"];
function checkTips(S, bad) {
  const box = { window: {}, document: { readyState: "loading", addEventListener() {}, querySelectorAll: () => [], head: { appendChild() {} }, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }) } };
  let tips = null;
  const m = S["aia-tip.js"].match(/var TIPS = (\{[\s\S]*?\n  \});/) || S["aia-tip.js"].match(/TIPS\s*=\s*(\{[\s\S]*?\n\s*\});/);
  if (!m) { bad("aia-tip.js TIPS table not found"); return; }
  try { tips = vm.runInNewContext("(" + m[1].replace(/;\s*$/, "") + ")", box, { timeout: 1000 }); }
  catch (e) { bad("aia-tip.js TIPS does not parse: " + e.message); return; }
  TIP_IDS.forEach((id) => {
    const t = tips[id];
    if (!t) { bad("tip " + id + " missing"); return; }
    jargonIn([t.title, t.body, t.ask].join(" \n ")).forEach((h) => bad("tip " + id + " shows jargon: " + h));
  });
  if (tips["collect-hold"] && tips["collect-hold"].title !== "Payments are off for now") bad("payments tip title must be 'Payments are off for now'");
  if (tips["collect-hold"] && !/never charges/.test(tips["collect-hold"].body)) bad("payments tip must say Yes never charges");
  if (tips["connect-wallet"] && !/never holds your keys/.test(tips["connect-wallet"].body)) bad("wallet tip must keep key honesty");
}

function checkPlaybook(S, bad) {
  const js = S["desk-playbook.js"];
  const stack = js.slice(js.indexOf('id: "stack"'), js.indexOf('id: "agent"'));
  jargonIn(proseStrings(stack).join(" \n ") + " " + (stack.match(/name: "([^"]*)"|surface: "([^"]*)"|go: "([^"]*)"/g) || []).join(" ")).forEach((h) => bad("playbook step 2 shows jargon: " + h));
  const guard = js.slice(js.indexOf('id: "guard"'), js.indexOf("];", js.indexOf('id: "guard"')));
  jargonIn(proseStrings(guard).join(" ")).forEach((h) => bad("playbook step 4 shows jargon: " + h));
  const fn = js.slice(js.indexOf("function stepWhat"), js.indexOf("return p.what;", js.indexOf("function stepWhat")));
  jargonIn(proseStrings(fn).join(" ")).forEach((h) => bad("public playbook step 3 shows jargon: " + h));
  if (/ai\.aia|mint/.test(fn)) bad("public playbook step 3 must not teach ai.aia or mint");
  const demo = (S["setup-demo.js"].match(/\{ id: "estate"[^\n]*/) || [""])[0];
  jargonIn(proseStrings(demo).join(" ")).forEach((h) => bad("setup demo estate shows jargon: " + h));
  ["pipes.html", "connections.html"].forEach((p) => {
    if (!/<title>Connections · Automate It Away<\/title>/.test(S[p]) || !/<h1>This desk’s connections\.<\/h1>/.test(S[p])) bad(p + " must be named Connections, the word public pages use");
  });
}

function runStatus(S, health, status) {
  const html = S["status.html"];
  const ids = {};
  html.replace(/<span id="([^"]+)" class="([^"]*)">([^<]*)<\/span>/g, (m, id, cls, txt) => { ids[id] = { id, className: cls, textContent: txt }; return m; });
  const code = (html.match(/<script>(\s*\/\/ Server notes[\s\S]*?)<\/script>/) || html.match(/<script>([^<]*deskFaceNote[\s\S]*?)<\/script>/) || ["", ""])[1];
  if (!code) throw new Error("status.html paint script missing");
  const answers = [health, status];
  let n = 0;
  const ctx = {
    document: { getElementById: (id) => ids[id] || null },
    fetch: () => { const body = answers[n++]; return Promise.resolve({ ok: !!body, status: body ? 200 : 500, json: () => Promise.resolve(body) }); },
    Promise
  };
  vm.runInNewContext(code, ctx, { timeout: 1000 });
  return new Promise((r) => setTimeout(() => r(ids), 20));
}
async function checkStatus(S, bad) {
  const html = S["status.html"];
  const css = (html.match(/\.hold\{color:([^}]+)\}/) || [])[1] || "";
  if (!css) bad("status.html .hold colour missing");
  if (/#f39c12|orange|#ff6b4a|red/i.test(css)) bad("status held states must be neutral grey, not orange or red (" + css + ")");
  if (!/Grey is off for now on purpose; nothing is broken\./.test(html)) bad("status legend must say grey is off on purpose");
  html.replace(/<span[^>]*class="hold"[^>]*>([^<]*)<\/span>/g, (m, t) => { jargonIn(t).forEach((h) => bad("status first paint jargon: " + h)); if (/^Hold/.test(t)) bad("status first paint says Hold: " + t); return m; });
  const held = await runStatus(S,
    { ok: true, accounts: { login: "Email + password" }, store: { live: true, note: "Saved on this desk" }, files: { note: "Photos and files are saved" }, automation: { deskAi: { on: false } }, pipes: [{ id: "webhook", live: true }, { id: "square", live: false }] },
    { status: "hold", note: "Collect stays HOLD until Yes + a real pipe.", wallet: { connected: false, note: "Wallet connect stays HOLD. Collect and pack pay stay HOLD." }, aiaTld: {} });
  Object.keys(held).forEach((id) => {
    const el = held[id];
    if (el.className === "down") bad("status #" + id + " is red for an expected held state");
    jargonIn(el.textContent).forEach((h) => bad("status #" + id + " shows jargon after load: " + h));
  });
  if (held.api && held.api.className !== "up") bad("status desk health must be green when the desk answers");
  if (held.pipes && held.pipes.className !== "hold") bad("held paid services must stay grey");
  if (held.wallet && !/optional/.test(held.wallet.textContent + " " + (S["status.html"].match(/<span>Crypto wallet \(optional\)<\/span>/) || [""])[0])) bad("wallet row must say it is optional");
  const down = await runStatus(S, null, null);
  if (!down.api || down.api.className !== "down") bad("status desk health must turn red only when the desk cannot be reached");
}

function grab(src, name) {
  const i = src.indexOf("function " + name + "(");
  if (i < 0) return null;
  let d = 0;
  for (let j = src.indexOf("{", i); j < src.length; j++) {
    if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) return src.slice(i, j + 1); }
  }
  return null;
}
function checkWords(S, bad) {
  const fn = grab(S["queue-login.js"], "plainStatus");
  if (!fn) bad("queue-login.js plainStatus missing");
  else {
    const say = vm.runInNewContext(fn + "\n;plainStatus", {});
    if (say("waiting") === "Ready" || /Ready/.test(say("waiting"))) bad("a waiting card must not say Ready");
    if (say("waiting") !== "Needs you") bad("a waiting card must say 'Needs you', as the desk card does (got " + say("waiting") + ")");
  }
  if (!/st === "waiting"/.test(S["desk-card.js"]) || !/flagged:"Needs you"|Needs you/.test(S["desk-card.js"] + " " + read("desk-needs.js"))) bad("desk must still call a waiting card Needs you");
  const state = (src) => { const m = src.match(/var STATE = (\{[^}]*\});/); return m ? vm.runInNewContext("(" + m[1] + ")", {}) : null; };
  const a = state(S["account-connections.js"]), d = state(S["setup-cards.js"]);
  if (!a || !d) bad("STATE word tables missing");
  else {
    ["todo", "done", "skipped", "blocked"].forEach((k) => { if (a[k] !== d[k]) bad("/account says '" + a[k] + "' where the desk says '" + d[k] + "' for " + k); });
    if (a.blocked !== "Waiting") bad("a held step must read Waiting on /account");
  }
  const hist = S["history.html"];
  if (/One account, one desk/.test(hist)) bad("History still says 'One account, one desk'");
  if (!/One account has one Queue, and your Queue holds all your desks\./.test(hist)) bad("History must say one account has one Queue holding all your desks");
  if (/james-ai@/.test(S["PACK.md"])) bad("PACK.md still shows a real person's address");
  if (!/helper-ai@yourname\.aia/.test(S["PACK.md"])) bad("PACK.md must show an example address");
}

// Owner names never show as examples: neutral yourname.aia / your-shop.aia instead.
const OWNER = /james\.aia|james-ai@|springfield-shop|James(?:’|'|&#39;|&rsquo;)s AI/i;
function checkOwnerNames(S, bad) {
  PAGES.concat(["help.html", "desks-book.js", "create-desk.js", "PACK.md"]).forEach((f) => {
    const m = OWNER.exec(S[f]);
    if (m) bad(f + " still shows an owner name as an example (" + m[0] + ")");
  });
  const yes = S["ACCOUNT-YES-NO.md"].split("\n").filter((l) => /Onboard this desk \(`\/help#onboard-desk`\)/.test(l));
  if (yes.length !== 1) bad("ACCOUNT-YES-NO.md Onboard this desk line missing");
  else {
    if (OWNER.test(yes[0])) bad("ACCOUNT-YES-NO.md Onboard line still shows an owner name");
    if (yes[0].indexOf("`yourname.aia`-style name on Account") < 0) bad("ACCOUNT-YES-NO.md Onboard line must use yourname.aia");
  }
  const help = S["help.html"];
  [["<code>yourname.aia</code>-style name on Account", "help desk identity example"],
   ["named like your-shop.aia.", "help packs example"],
   ["Set an AIA Internet name like yourname.aia on Account", "help sign-in example"],
   ["Find the leaks. Hook up connections. Name a desk AI.", "help playbook lead in plain words"],
   ["2 Hook up connections — Connections.", "help playbook steps in plain words"]].forEach(([t, l]) => { if (help.indexOf(t) < 0) bad(l + " missing: " + t); });
  if (/Hook the pipes/.test(help)) bad("help.html still says Hook the pipes");
  if (/springfield/i.test(help)) bad("help.html still names Springfield as an example");
  if (help.indexOf("<p>Not legal advice. Sample shop checklist.") < 0) bad("help.html checklist must use a neutral example (Sample shop checklist)");
  if (S["desks-book.js"].indexOf('"AIA Internet uses the .aia TLD — e.g. yourname.aia"') < 0) bad("desks-book.js must show an example name");
  const cd = S["create-desk.js"];
  if (cd.indexOf('<input name="name" required placeholder="e.g. Helper AI">') < 0 || cd.indexOf('<input name="aia" placeholder="e.g. yourname.aia">') < 0) bad("create-desk.js desk AI placeholders must be examples");
  const pk = S["PACK.md"];
  if (!/`queue@your-shop\.aia`/.test(pk) || !/`yourname\.aia`, `your-shop\.aia`/.test(pk) || !/"ais": \[\{ "name": "Helper AI", "aia": "yourname\.aia" \}\]/.test(pk)) bad("PACK.md must use neutral example names");
}

// ---------- D2 ----------
// Sentences other checks pin word for word (check name in brackets). They stay, and only up to today's count.
const PINNED = {
  "help.html": [
    ["A pack puts When → If → Then on this desk queue", 1, "check-aia-tip"],
    ["How do I install, give, or update a pack?", 1, "check-help-faq"],
    ["do not map shared OpenAI keys into packs", 1, "check-world-people"],
    ["you do not pick a pack on every Drop", 1, "check-pack-queue-shape"],
    ["You do not pick a pack on every Drop", 2, "check-help-faq, check-pack-queue-shape"],
    ["desk account and you install a pack", 1, "check-build-pack"],
    ["Your first pack in Creators Studio", 1, "check-ux-simplify"],
    ["Selling packs — risk honesty", 1, "check-pack-sell"],
    ["Installed packs auto-shape", 2, "check-pack-queue-shape"],
    ["When for packs and rules", 1, "check-aia-inbound"],
    ["Thin App / webhook pack", 1, "check-build-pack"],
    ["When a pack is worth it", 4, "check-pack-sell"],
    ["stands behind the pack", 1, "check-pack-sell"],
    ["Build a pack / desk AI", 2, "check-build-pack"],
    ["Build automation packs", 1, "check-studio-earnings"],
    ["On-desk Pack Creator", 1, "check-build-pack"],
    ["3–5 strong packs", 1, "check-studio-earnings"],
    ["First pack suite", 1, "check-studio-earnings"],
    ["Selling packs", 3, "check-pack-sell, check-ux-simplify"],
    ["Learn packs", 1, "check-studio-earnings"],
    ["Import Pack", 1, "check-world-people"],
    ["Update pack", 3, "check-aia-tip, check-history-roadmap, check-world-home"],
    ["Open packs", 2, "check-aia-adoption, check-queue-packs"],
    ["Give pack", 3, "check-aia-tip, check-history-roadmap, check-packs-download-assert"]
  ],
  "pipes.html": [],
  "connections.html": [],
  "login.html": []
};
const JARGON2 = [[/\bHOLD\b/, "HOLD"], [/\bpipes?\b/i, "pipe"], [/\bExt\b/, "Ext"], [/\bKilled\b/, "Killed"], [/\bSHA\b/, "SHA"]];
const PACKWORD = [/\bpacks?\b/i, "pack"];
const MINTWORD = [/\bmint(s|ed|ing)?\b/i, "mint"]; // login.html: a stranger signing in never reads mint
function unpinned(f, text, bad) {
  let t = text;
  (PINNED[f] || []).forEach(([s, max, who]) => {
    const n = t.split(s).length - 1;
    if (n > max) bad(f + " repeats a pinned sentence " + n + " times (pinned " + max + ", " + who + "): " + s);
    t = t.split(s).join(" ");
  });
  return t;
}
function checkFilesRead(S, bad) {
  FILES.forEach((f) => { if (typeof S[f] !== "string") bad(f + " is missing or unreadable (fail closed)"); });
}
function checkPages2(S, bad) {
  PAGES2.forEach((p) => {
    if (typeof S[p] !== "string") return;
    // Code samples show real JSON keys ("when": "pipe"); they are data, not words to read.
    let text = strangerText(p === "help.html" ? S[p].replace(/<code\b[\s\S]*?<\/code>/gi, " ") : S[p]);
    if (p === "login.html" && typeof S["login-doors.js"] === "string") text += " \n " + proseStrings(S["login-doors.js"]).concat(markupStrings(S["login-doors.js"])).join(" \n ");
    text = unpinned(p, text, bad);
    const words = JARGON2.concat(p === "help.html" ? [PACKWORD] : []).concat(p === "login.html" ? JARGON.concat([MINTWORD]) : []);
    words.forEach(([re, word]) => { const m = text.match(re); if (m) bad(p + " shows jargon: " + word + " ('" + text.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, " ").trim() + "')"); });
    const own = OWNER.exec(text) || /\bJames\b|springfield/i.exec(text);
    if (own) bad(p + " shows an owner name (" + own[0] + ")");
  });
  const help = S["help.html"] || "";
  ["Payments are off for now", "Connections across the internet", "the not-on-this-desk note", "Selling packs"].forEach((t) => { if (help.indexOf(t) < 0) bad("help.html must say: " + t); });
  ["pipes.html", "connections.html"].forEach((p) => {
    const h = S[p] || "";
    if (h.indexOf(">Show connections</button>") < 0) bad(p + " button must say Show connections");
    if (h.indexOf("You do not need a connection to start.") < 0) bad(p + " lead must say connection");
  });
  if ((S["pipes.html"] || "").indexOf("Sending stays off for now.") < 0) bad("pipes.html inbound note must say sending stays off");
  const tip = (S["aia-tip.js"] || "").match(/"pipes": \{\s*title: "([^"]*)",[\s\S]*?ask: "([^"]*)"/);
  if (!tip || tip[1] !== "Connections" || /\bpipe/i.test(tip[2])) bad("the pipes info tip must be titled Connections and ask about a connection");
}
function checkAccount(S, bad) {
  const files = ["account.html", "aia-tld.js", "aia-register-abi.js"];
  files.forEach((f) => {
    const code = f.endsWith(".js") ? proseStrings(S[f] || "").join(" \n ") : strangerText(S[f] || "");
    const m = /\bJames\b|james\.aia|james-ai@|springfield/i.exec(code);
    if (m) bad(f + " shows an owner name on /account (" + m[0] + ")");
  });
  let acct = strangerText(S["account.html"] || "");
  // Pinned word for word elsewhere: check-history-roadmap (Recurring update HOLD. Collect HOLD.),
  // check-account-page (Authenticator stays HOLD). D3: the Collect and pack pay line is gone (see checkOldLines).
  [["Recurring update HOLD. Collect HOLD.", 1], ["Authenticator stays HOLD.", 1]].forEach(([t, max]) => {
    const n = acct.split(t).length - 1;
    if (n > max) bad("account.html repeats pinned line " + n + " times: " + t);
    acct = acct.split(t).join(" ");
  });
  const holds = (acct.match(/\bHOLD\b/g) || []).length;
  if (holds) bad("account.html shows HOLD outside the pinned lines (" + holds + ")");
  if (/identity HOLD until mint|Page should say HOLD|HOLD\. Not live\./.test(acct)) bad("account.html still shows an unpinned HOLD line");
  if ((S["aia-tld.js"] || "").indexOf("You sign the commit in your own wallet (MetaMask). AIA does not send it.") < 0) bad("aia-tld.js checklist must say you sign in your own wallet");
}
function checkHistory(S, bad) {
  const h = S["history.html"] || "";
  if (/Any pipe/.test(h)) bad("History filter still says Any pipe");
  if (h.indexOf('<option value="">Any connection</option>') < 0 || h.indexOf('sel("pipe",f.pipes,"Any connection")') < 0) bad("History filter must say Any connection");
  if (/\["Pipe",it\.pipe/.test(h)) bad("History card sheet still labels a row Pipe");
}
// ---------- D3 ----------
// /help, /pipes, /connections and /history: what the page scripts draw reads plain too. Every local script a page
// loads is scanned: page code runs in a node vm on a hollow DOM, and the draw functions it defines (History's
// roadHtml and talk labels, the Help playbook, the info tips the page links) run on fixtures; every other script's
// prose and markup strings are read. A script that is missing, unreadable, not on the list, or draws nothing is a
// FAIL (fail closed). No HOLD and no pipe anywhere in that text; on /history, Pack is a name and never lower case.
const D3_PAGES = ["help.html", "pipes.html", "connections.html", "history.html"];
const D3_SCRIPTS = ["theme.js", "aia-tip.js", "desk-playbook.js", "desk-nav.js", "mark-fix.js", "analytics.js", "speech.js", "desk-switch.js", "signin-first.js"];
const D3_WORDS = [[/\bHOLD\b/, "HOLD"], [/\bpipes?\b/i, "pipe"]];
const D3_LOWER_PACK = [/\bpacks?\b/, "pack (lower case; the name is Pack)"];
// Labels drawn as (x || "word") + " · ..." have no space inside the fallback word, so prose scans miss them.
function fallbackWords(code) {
  const out = [];
  code.replace(/\|\|\s*"([^"\\\n]{1,40})"\)\s*\+\s*"\s*·/g, (m, w) => { out.push(w); return m; });
  code.replace(/\|\|\s*'([^'\\\n]{1,40})'\)\s*\+\s*'\s*·/g, (m, w) => { out.push(w); return m; });
  return out;
}
// Html built in JS strings, tags dropped. A string can hold half a tag (concatenation splits '<b class="' + x + '">Name');
// the tail of a tag at the start and an unclosed tag at the end are markup, not words.
function d3Markup(code) {
  const strs = [];
  const clean = code.replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  clean.replace(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g, (m, a, b) => {
    let s = (a !== undefined ? a : b).replace(/\\u([0-9a-f]{4})/gi, (x, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\(.)/g, "$1");
    if (!/[<>]/.test(s)) return m;
    s = s.replace(/^[^<]*?>/, " ").replace(/<[^>]*$/, " ");
    strs.push(strangerText(s));
    return m;
  });
  return strs;
}
function hollow() {
  const fn = function () { return hollow(); };
  return new Proxy(fn, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => "";
      if (k === Symbol.iterator) return function* () {};
      if (k === "then") return undefined;
      if (k === "length") return 0;
      return hollow();
    },
    set() { return true; },
    apply() { return hollow(); },
    construct() { return hollow(); }
  });
}
function host(own) {
  return new Proxy(own, { get(t, k) { return k in t ? t[k] : (k === Symbol.toPrimitive ? () => "" : hollow()); }, set(t, k, v) { t[k] = v; return true; }, has() { return true; } });
}
// Run page code on a hollow DOM. Function declarations are hoisted, so they exist even when boot code throws.
function runPage(code) {
  const win = {}; const doc = { readyState: "complete" };
  const g = { console: { log() {}, warn() {}, error() {} }, JSON, Math, Date, String, Number, Object, Array, RegExp, Promise, Error, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, isNaN, URLSearchParams, URL,
    setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {}, requestAnimationFrame() { return 0; },
    fetch() { return new Promise(() => {}); }, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { href: "https://automateitaway.com/", search: "", hash: "", pathname: "/", origin: "https://automateitaway.com" }, navigator: { userAgent: "node" } };
  const ctx = host(g);
  g.window = host(win); g.self = g.window; g.document = host(doc); g.globalThis = ctx;
  let threw = null;
  try { vm.runInNewContext(code, ctx, { timeout: 2000 }); } catch (e) { threw = e; }
  return { ctx: g, win, threw };
}
const D3_DRAW = {
  "history.html": [
    ["roadHtml", [{}]],
    ["roadHtml", [{ desk: "Sample desk", pack: "Sample Pack", packId: "sample", owner: true, desks: 1 }]],
    ["wipTalkLabel", [{ kind: "follow" }]],
    ["wipTalkLabel", [{ kind: "tell" }]],
    ["wipTalkLabel", [{ kind: "note" }]],
    ["wipTalkLabel", [{ kind: "note", from: "webhook" }]],
    ["wipTalkLabel", [{ kind: "follow", from: "webhook" }]]
  ]
};
function d3Text(S, p, bad) {
  const html = S[p];
  const parts = [];
  if (typeof html !== "string") { bad(p + " is missing or unreadable (fail closed)"); return null; }
  const page = p === "help.html" ? html.replace(/<code\b[\s\S]*?<\/code>/gi, " ") : html;
  parts.push(["html", unpinned(p, strangerText(page), bad)]);
  const inline = [];
  html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, code) => { if (!/\bsrc=/.test(attrs) && !/type="application\/(ld\+)?json"/.test(attrs)) inline.push(code); return m; });
  inline.forEach((code, i) => {
    parts.push(["inline script " + (i + 1), proseStrings(code).concat(d3Markup(code), fallbackWords(code)).join(" \n ")]);
    (D3_DRAW[p] || []).forEach(([fn, args]) => {
      if (code.indexOf("function " + fn + "(") < 0) return;
      const run = runPage(code);
      const f = run.ctx[fn];
      if (typeof f !== "function") { bad(p + " " + fn + "() did not load in the vm (fail closed)"); return; }
      let out = "";
      try { out = String(f.apply(null, args)); } catch (e) { bad(p + " " + fn + "() threw on its fixture: " + e.message); return; }
      if (!out.trim()) bad(p + " " + fn + "() drew nothing (fail closed)");
      parts.push(["drawn " + fn + "(" + JSON.stringify(args[0]) + ")", /</.test(out) ? strangerText(out) : out]);
      args.__seen = true;
    });
  });
  (D3_DRAW[p] || []).forEach(([fn]) => { if (!inline.some((c) => c.indexOf("function " + fn + "(") >= 0)) bad(p + " no longer defines " + fn + "() for the drawn-text scan (fail closed)"); });
  const srcs = [];
  html.replace(/<script\b[^>]*\ssrc="([^"]+)"[^>]*>/gi, (m, src) => { srcs.push(src); return m; });
  if (!srcs.length) bad(p + " loads no scripts (scan found nothing, fail closed)");
  srcs.forEach((src) => {
    if (/^(https?:)?\/\//.test(src)) return;
    const f = src.replace(/^\//, "").split("?")[0];
    if (D3_SCRIPTS.indexOf(f) < 0) { bad(p + " loads " + f + ", which the drawn-text scan does not cover (fail closed)"); return; }
    const code = S[f];
    if (typeof code !== "string") { bad(p + " script " + f + " is missing or unreadable (fail closed)"); return; }
    if (f === "aia-tip.js") {
      const run = runPage(code); const tips = run.win.AIATip && run.win.AIATip.tips;
      if (!tips || typeof tips !== "object") { bad(p + " aia-tip.js did not expose its tips in the vm (fail closed)"); return; }
      const keys = [];
      html.replace(/data-aia-tip="([^"]+)"/g, (m, key) => { if (keys.indexOf(key) < 0) keys.push(key); return m; });
      if (!keys.length) bad(p + " loads aia-tip.js but links no tip (scan found nothing, fail closed)");
      keys.forEach((key) => {
        const t = tips[key];
        if (!t) bad(p + " links tip " + key + ", which aia-tip.js does not define");
        else parts.push(["tip " + key, [t.title, t.body, t.ask].join(" \n ")]);
      });
      return;
    }
    if (f === "desk-playbook.js") {
      const run = runPage(code); const pb = run.win.AIAPlaybook;
      const modes = []; html.replace(/data-aia-playbook="([^"]*)"/g, (m, mode) => { modes.push(mode); return m; });
      if (!modes.length) return; // loaded but nothing to mount: the playbook draws nothing here
      if (!pb || typeof pb.html !== "function") { bad(p + " desk-playbook.js did not expose AIAPlaybook.html in the vm (fail closed)"); return; }
      modes.forEach((mode) => {
        const out = String(pb.html({ compact: mode === "compact", embed: mode === "embed" }));
        if (!out.trim()) bad(p + " playbook drew nothing (fail closed)");
        parts.push(["playbook " + mode, strangerText(out)]);
      });
      return;
    }
    parts.push(["script " + f, proseStrings(code).concat(d3Markup(code), fallbackWords(code)).join(" \n ")]);
  });
  return parts;
}
function checkD3(S, bad) {
  D3_PAGES.forEach((p) => {
    const parts = d3Text(S, p, bad);
    if (!parts) return;
    const words = D3_WORDS.concat(p === "history.html" ? [D3_LOWER_PACK] : []);
    parts.forEach(([where, text]) => {
      words.forEach(([re, word]) => {
        const g = new RegExp(re.source, re.flags.replace("g", "") + "g"); let m;
        while ((m = g.exec(text))) bad("D3 " + p + " " + where + " shows " + word + " ('" + text.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, " ").trim() + "')");
      });
    });
    if (parts.filter(([w]) => w !== "html").length < 2) bad("D3 " + p + " drawn-text scan read under two scripts (fail closed)");
  });
}
// D3: two old lines reuse the landed API wording (#448). Old line anywhere in these files is a FAIL; the new line must be there.
const OLD_LINES = [
  ["Wallet / registry connect later as a Pipe HOLD", "Wallet and name registry connections come later.", ["market-shop.js", "desks-book.js", "desk-ais.js"]],
  ["Collect and pack pay stay HOLD", "Payments are off for now. Nothing is charged.", ["help.html", "account.html", "aia-wallet.js"]]
];
function checkOldLines(S, bad) {
  OLD_LINES.forEach(([old, now, files]) => {
    files.forEach((f) => {
      const t = S[f];
      if (typeof t !== "string") { bad(f + " is missing or unreadable (fail closed)"); return; }
      if (t.indexOf(old) >= 0) bad("old line back in " + f + ": " + old);
      if (t.indexOf(now) < 0) bad(f + " must say: " + now);
    });
  });
}
function hex(c) { const m = String(c || "").trim().match(/^#([0-9a-f]{6})$/i); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; }
function lumOf(rgb) { const a = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }
function contrast(a, b) { if (!a || !b) return 0; const x = lumOf(a), y = lumOf(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function cssVars(css, block) {
  const body = (css.match(new RegExp(block.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}")) || [])[1] || "";
  const out = {}; body.replace(/(--[\w-]+)\s*:\s*([^;]+);/g, (m, k, v) => { out[k] = v.trim(); return m; });
  return out;
}
function resolveColor(v, vars, depth) {
  if ((depth || 0) > 6 || !v) return null;
  v = v.trim();
  if (hex(v)) return hex(v);
  const ref = v.match(/^var\((--[\w-]+)\)$/); if (ref) return resolveColor(vars[ref[1]], vars, (depth || 0) + 1);
  const mix = v.match(/^color-mix\(in srgb,\s*(.+?)\s+(\d+)%,\s*(.+)\)$/);
  if (mix) { const a = resolveColor(mix[1], vars, (depth || 0) + 1), b = resolveColor(mix[3], vars, (depth || 0) + 1), w = +mix[2] / 100; return a && b ? a.map((x, i) => Math.round(x * w + b[i] * (1 - w))) : null; }
  return null;
}
function checkStatus2(S, bad) {
  const html = S["status.html"] || "";
  const row = html.match(/<div class="row"><span>Whatnot<\/span><span class="([^"]*)">([^<]*)<\/span><\/div>/);
  if (!row) bad("status Whatnot row missing");
  else {
    if (row[1] !== "hold") bad("status Whatnot must be a grey held state, not '" + row[1] + "'");
    if (/live/i.test(row[2]) && !/not/i.test(row[2])) bad("status Whatnot must not say it is live");
  }
  html.replace(/<span class="down">([^<]*)<\/span>/g, (m, t) => { bad("status paints a fixed row red: " + t); return m; });
  const light = S["theme.css"] ? cssVars(S["theme.css"], ":root") : {};
  const dark = Object.assign({}, light, S["theme.css"] ? cssVars(S["theme.css"], "html.dark") : {});
  const lightBg = resolveColor("var(--bg)", light), darkBg = resolveColor("var(--bg)", dark), darkCard = resolveColor("var(--card)", dark), lightCard = resolveColor("var(--card)", light);
  const holdDark = hex(((html.match(/\.hold\{color:([^}]+)\}/) || [])[1]));
  const holdLight = hex(((html.match(/html:not\(\.dark\) \.hold\{color:([^}]+)\}/) || [])[1]));
  if (!(contrast(holdLight, lightBg) >= 4.5)) bad("status grey on the light theme is " + contrast(holdLight, lightBg).toFixed(2) + ":1 (needs 4.5)");
  if (!(contrast(holdDark, [7, 9, 12]) >= 4.5) || !(contrast(holdDark, darkBg) >= 4.5)) bad("status grey on the dark theme is under 4.5:1");
  const legend = (html.match(/<p style="color:([^;"]+);margin-top:18px">Green is on\./) || [])[1];
  if (!legend) bad("status legend colour missing");
  else {
    const l = resolveColor(legend, light), d = resolveColor(legend, dark);
    if (!(contrast(l, lightBg) >= 4.5) || !(contrast(d, darkBg) >= 4.5)) bad("status legend grey is under 4.5:1 (" + legend + ")");
  }
  ["pipes.html", "connections.html"].forEach((p) => {
    const h = S[p] || "";
    const sl = hex(((h.match(/\.soon\{color:([^}]+)\}/) || [])[1]));
    const sd = hex(((h.match(/html\.dark \.soon\{color:([^}]+)\}/) || [])[1]));
    if (!(contrast(sl, lightCard) >= 4.5) || !(contrast(sl, lightBg) >= 4.5)) bad(p + " Coming soon grey on light is under 4.5:1");
    if (!(contrast(sd, darkCard) >= 4.5) || !(contrast(sd, darkBg) >= 4.5)) bad(p + " Coming soon grey on dark is under 4.5:1");
  });
}
function targetFile(S, href) {
  let p = href.split("#")[0].split("?")[0];
  if (!p) return "help.html";
  let v = {}; try { v = JSON.parse(S["vercel.json"] || "{}"); } catch (e) { return null; }
  (v.redirects || []).forEach((r) => { if (r.source === p) p = r.destination; });
  (v.rewrites || []).forEach((r) => { if (r.source === p) p = r.destination; });
  p = p.replace(/^\//, "");
  if (!/\.html$/.test(p)) p += ".html";
  return p;
}
function checkHelpAnchors(S, bad) {
  const help = S["help.html"] || "";
  let n = 0;
  help.replace(/\shref="([^"]*#[^"]*)"/g, (m, href) => {
    if (/^(https?:|mailto:|tel:)/.test(href) && !/automateitaway\.com/.test(href)) return m;
    const id = href.split("#")[1];
    const f = targetFile(S, href.replace(/^https?:\/\/[^/]+/, ""));
    const page = f && (f === "help.html" ? help : (typeof S[f] === "string" ? S[f] : readOrNull(f)));
    n += 1;
    if (typeof page !== "string") { bad("/help link " + href + " points at a page that is missing (" + f + ")"); return m; }
    if (!id || page.indexOf(' id="' + id + '"') < 0) bad("/help link " + href + " has no id=\"" + id + "\" on " + f);
    return m;
  });
  if (n < 20) bad("/help anchor scan found only " + n + " links");
  if (/drop#talk/.test(help)) bad("/help still links to /drop#talk (drop.html has no id=talk)");
  // The Drop · Talk link must really open Talk: run drop-talk.js's own wantTalk() on that URL.
  const talkLink = (help.match(/<a href="([^"]*)">Drop · Talk<\/a>/) || [])[1];
  if (!talkLink) bad("/help has no Drop · Talk link");
  else {
    const talkJs = (typeof S["drop-talk.js"] === "string" ? S["drop-talk.js"] : readOrNull("drop-talk.js")) || "";
    const fn = (talkJs.match(/function wantTalk\(\) \{[\s\S]*?\n  \}/) || [])[0];
    if (!fn) bad("drop-talk.js has no wantTalk() to open Talk from a link");
    else {
      const u = new URL(talkLink, "https://automateitaway.com");
      let opens = false;
      try { opens = vm.runInNewContext(fn + "\nwantTalk();", { location: { hash: u.hash, search: u.search }, URLSearchParams: URLSearchParams }) === true; } catch (e) { opens = false; }
      if (u.pathname !== "/drop" || !opens) bad("/help Drop · Talk link " + talkLink + " does not open Talk on /drop");
    }
  }
}

async function suite(S, okFn) {
  const bad = [];
  const b = (m) => bad.push(m);
  const steps = [["every file read (fail closed)", () => checkFilesRead(S, b)], ["public pages read plain", () => checkPages(S, b)], ["info tips read plain", () => checkTips(S, b)],
    ["playbook and demo read plain", () => checkPlaybook(S, b)], ["status grey for held states", () => checkStatus(S, b)],
    ["same words for Queue, desk, account", () => checkWords(S, b)], ["no owner names in examples", () => checkOwnerNames(S, b)],
    ["help, connections and login read plain", () => checkPages2(S, b)], ["account has no owner names", () => checkAccount(S, b)],
    ["history says connection", () => checkHistory(S, b)], ["pages draw plain words (D3)", () => checkD3(S, b)], ["old wallet lines gone (D3)", () => checkOldLines(S, b)], ["status held states grey with 4.5:1", () => checkStatus2(S, b)],
    ["help anchors resolve", () => checkHelpAnchors(S, b)]];
  for (const [name, fn] of steps) {
    const n = bad.length;
    try { await fn(); } catch (e) { bad.push(name + " threw " + e.message); }
    if (okFn && bad.length === n) okFn(name);
  }
  return bad;
}

const MUTANTS = [
  ["index Collect HOLD back", "index.html", [["One nudge. Then it stops. Payments are off for now.", "One nudge. Then it stops. Collect stays HOLD until Yes + a real money pipe."]]],
  ["pricing BYOK back", "pricing.html", [["unless you choose to use your own AI key.", "unless you choose BYOK."]]],
  ["how Give pack back", "how.html", [[">Share an add-on<", ">Give pack<"]]],
  ["setup .aia file back", "setup.html", [["Download or share the file.", "Download / share the .aia file."]]],
  ["examples Pipes link back", "examples.html", [["Open Connections →", "Open Pipes →"]]],
  ["aria-label jargon", "index.html", [['aria-label="More about payments"', 'aria-label="More about Collect HOLD"']]],
  ["inline script jargon", "how.html", [['name: "4 Get paid (off for now)"', 'name: "4 Collect HOLD"']]],
  ["lower-case queue", "setup.html", [["Same Queue.", "Same queue."]]],
  ["tip title Collect HOLD", "aia-tip.js", [['title: "Payments are off for now",', 'title: "Collect HOLD",']]],
  ["tip wallet jargon", "aia-tip.js", [["Use your own MetaMask or WalletConnect if you want one. AIA never holds your keys and does not run a wallet for you.", "Your MetaMask or WalletConnect. Not Wallet.AIA. AIA never holds your keys."]]],
  ["playbook Open Pipes", "desk-playbook.js", [['go: "Open Connections"', 'go: "Open Pipes"']]],
  ["playbook embed .aia", "desk-playbook.js", [['return "Create the work. Name a desk AI. Desk AI names stay on this desk.', 'return "Create the work. Name a desk AI as a .aia. Desk AI names stay on this desk.']]],
  ["status orange", "status.html", [[".hold{color:#8b9aab}", ".hold{color:#f39c12}"]]],
  ["status Hold first paint", "status.html", [['<span id="grok" class="hold">Checking…</span>', '<span id="grok" class="hold">Hold — checking</span>']]],
  ["status raw server note", "status.html", [["      return plainNote(n);", "      return n;"]]],
  ["status held paints red", "status.html", [['pipes.className = "hold"; }', 'pipes.className = "down"; }']]],
  ["status down not red", "status.html", [['document.getElementById("api").className = "down";', 'document.getElementById("api").className = "hold";']]],
  ["status legend Orange", "status.html", [["Green is on. Grey is off for now on purpose; nothing is broken.", "Green is live. Orange is HOLD — wait."]]],
  ["waiting says Ready", "queue-login.js", [['if (s === "waiting") return "Needs you";', 'if (s === "waiting") return "Ready";']]],
  ["account says Blocked", "account-connections.js", [['blocked: "Waiting" };', 'blocked: "Blocked" };']]],
  ["History one desk", "history.html", [["One account has one Queue, and your Queue holds all your desks.", "One account, one desk."]]],
  ["PACK.md real address", "PACK.md", [["`helper-ai@yourname.aia`", "`james-ai@funditaway.aia`"]]],
  ["Pipes page title", "pipes.html", [["<title>Connections · Automate It Away</title>", "<title>Pipes · Automate It Away</title>"]]],
  ["help james.aia back", "help.html", [["<code>yourname.aia</code>-style name", "<code>james.aia</code>-style name"]]],
  ["help springfield-shop back", "help.html", [["named like your-shop.aia.", "named like springfield-shop.aia."]]],
  ["help sign-in james.aia back", "help.html", [["name like yourname.aia on Account", "name like james.aia on Account"]]],
  ["help james-ai@ address added", "help.html", [["named like your-shop.aia.", "named like your-shop.aia, mail james-ai@funditaway.aia."]]],
  ["help Hook the pipes back", "help.html", [["Find the leaks. Hook up connections.", "Find the leaks. Hook the pipes."]]],
  ["help steps Hook the pipes back", "help.html", [["2 Hook up connections — Connections.", "2 Hook the pipes — Pipes."]]],
  ["desks-book james.aia back", "desks-book.js", [["— e.g. yourname.aia", "— james.aia"]]],
  ["create-desk AI name placeholder back", "create-desk.js", [['placeholder="e.g. Helper AI"', 'placeholder="James’s AI"']]],
  ["create-desk aia placeholder back", "create-desk.js", [['<input name="aia" placeholder="e.g. yourname.aia">', '<input name="aia" placeholder="james.aia">']]],
  ["PACK.md springfield-shop back", "PACK.md", [["`queue@your-shop.aia`", "`queue@springfield-shop.aia`"]]],
  ["PACK.md james.aia back", "PACK.md", [['"ais": [{ "name": "Helper AI", "aia": "yourname.aia" }]', '"ais": [{ "name": "Helper AI", "aia": "james.aia" }]']]],
  ["PACK.md James's AI back", "PACK.md", [['      "name": "Helper AI",', '      "name": "James’s AI",']]],
  ["ACCOUNT-YES-NO james.aia back", "ACCOUNT-YES-NO.md", [["`yourname.aia`-style name on Account", "`james.aia`-style name on Account"]]],
  ["index springfield-shop added", "index.html", [["One nudge. Then it stops. Payments are off for now.", "One nudge. Then it stops. Payments are off for now. See springfield-shop."]]],
  ["help Springfield checklist back", "help.html", [["Sample shop checklist.", "Springfield checklist."]]],
  ["help Springfield named elsewhere", "help.html", [["named like your-shop.aia.", "named like your-shop.aia. Springfield shops use this."]]],
  ["demo HOLD", "setup-demo.js", [['mean: "Photo to comps to listing draft. Payments are off for now." }', 'mean: "Photo to comps to listing draft. Collect HOLD until Yes + a real money pipe." }']]],
  // D2
  ["account identity HOLD back", "account.html", [["Collect HOLD. Your AIA name waits until it is registered.", "Collect HOLD. .aia identity HOLD until mint."]]],
  ["account Not live HOLD back", "account.html", [["<p class=\"meta\">Off for now. No email codes.", "<p class=\"meta\">HOLD. Not live. No email codes."]]],
  ["account mfa hint HOLD back", "account.html", [['id="mfa-hint">Authenticator is off for now.</p>', 'id="mfa-hint">Page should say HOLD.</p>']]],
  ["account export Collect HOLD back", "account.html", [["No password hash. Payments are off for now.\";", "No password hash. Collect HOLD.\";"]]],
  ["account pinned line doubled", "account.html", [["Recurring update HOLD. Collect HOLD.", "Recurring update HOLD. Collect HOLD. Recurring update HOLD. Collect HOLD."]]],
  ["tld checklist James back", "aia-tld.js", [["<li>You sign the commit in your own wallet (MetaMask). AIA does not send it.</li>", "<li>James signs commit in MetaMask. AIA does not send the tx.</li>"]]],
  ["tld mint James back", "aia-tld.js", [["You sign the mint in your own wallet (MetaMask) when the bridge clears.", "James signs mint in MetaMask when Bridge clears."]]],
  ["tld Sign commit James back", "aia-tld.js", [["Tap Sign commit — you sign in your wallet.", "Tap Sign commit — James signs."]]],
  ["register note James back", "aia-register-abi.js", [["You sign the commit, wait about 60 seconds, then sign the registration.", "James signs commit, waits ~60s, then signs register."]]],
  ["help Collect HOLD back", "help.html", [["Payments are off for now, and Yes never charges anyone.", "Collect stays HOLD until Yes."]]],
  ["help Connections across back", "help.html", [["Connections across the internet", "Pipes across the internet"]]],
  ["help add-on back to pack", "help.html", [["DFY is mostly an off-platform service wrapping the add-on.", "DFY is mostly an off-platform service wrapping the pack."]]],
  ["help gone HOLD back", "help.html", [["the not-on-this-desk note", "gone HOLD"]]],
  ["help pinned sentence repeated", "help.html", [["Payments are off for now, and Yes never charges anyone.", "Collect and payouts HOLD. Collect and payouts HOLD."]]],
  ["help owner name added", "help.html", [["Payments are off for now, and Yes never charges anyone.", "Payments are off for now, and Yes never charges anyone. Ask James."]]],
  ["help dead #talk back", "help.html", [['href="/drop?talk=1"', 'href="/drop#talk"']]],
  ["help anchor typo", "help.html", [['href="#pack-worth"', 'href="#pack-wurth"']]],
  ["help link to a missing page", "help.html", [['href="/drop?talk=1"', 'href="/nowhere#talk"']]],
  ["help Talk link opens plain Drop", "help.html", [['<a href="/drop?talk=1">Drop · Talk</a>', '<a href="/drop">Drop · Talk</a>']]],
  ["help Talk link talk=0", "help.html", [['<a href="/drop?talk=1">Drop · Talk</a>', '<a href="/drop?talk=0">Drop · Talk</a>']]],
  ["help Talk link to another page", "help.html", [['<a href="/drop?talk=1">Drop · Talk</a>', '<a href="/desk?talk=1">Drop · Talk</a>']]],
  ["pipes Show pipes back", "pipes.html", [[">Show connections</button>", ">Show pipes</button>"]]],
  ["pipes lead pipe back", "pipes.html", [["You do not need a connection to start.", "You do not need a pipe to start."]]],
  ["pipes Send HOLD back", "pipes.html", [["Sending stays off for now.", "Send stays HOLD."]]],
  ["connections lead pipe back", "connections.html", [["You do not need a connection to start.", "You do not need a pipe to start."]]],
  ["pipes soon grey back", "pipes.html", [[".soon{color:#56636f}", ".soon{color:#6b7c8f}"]]],
  ["connections dark soon grey back", "connections.html", [["html.dark .soon{color:#9aa8b6}", "html.dark .soon{color:#6b7c8f}"]]],
  ["tip title Pipes back", "aia-tip.js", [['title: "Connections",\n      body: "Webhook is live.', 'title: "Pipes",\n      body: "Webhook is live.']]],
  ["tip ask pipe back", "aia-tip.js", [['ask: "What is a connection on this desk?"', 'ask: "What is a pipe on this desk?"']]],
  ["history Any pipe back", "history.html", [['<option value="">Any connection</option>', '<option value="">Any pipe</option>']]],
  ["history sheet Pipe row back", "history.html", [['["Connection",it.pipe', '["Pipe",it.pipe']]],
  ["status Whatnot red back", "status.html", [['<span>Whatnot</span><span class="hold">Not available yet</span>', '<span>Whatnot</span><span class="down">Not live</span>']]],
  ["status light grey rule gone", "status.html", [["html:not(.dark) .hold{color:#56636f}", ""]]],
  ["status legend grey back", "status.html", [['<p style="color:var(--muted);margin-top:18px">', '<p style="color:#8b9aab;margin-top:18px">']]],
  ["login Ext back", "login-doors.js", [["Other ways to sign in \\u00b7 coming soon", "Ext \\u00b7 coming soon"]]],
  ["login owner name", "login.html", [["</body>", "<p>Ask james.aia</p></body>"]]],
  ["login mint", "login.html", [["</body>", "<p>Mint your name after you sign in.</p></body>"]]],
  // D3: each jargon string put back, in page html and in script-drawn text; each must be caught by the D3 scan (4th field).
  ["D3 help spine HOLD back", "help.html", [["Yes / Stop / Kill stay human. Payments are off for now. Nothing is charged.</p>", "Yes / Stop / Kill stay human. Collect stays HOLD until a person taps Yes and a real Collect money pipe is live.</p>"]], "D3 help.html html shows HOLD"],
  ["D3 help Recurring update HOLD back", "help.html", [["Recurring updates are off for now.", "Recurring update HOLD."]], "D3 help.html html shows HOLD"],
  ["D3 help live pipe back", "help.html", [["App / webhook is the live connection.", "App / webhook is the live pipe."]], "D3 help.html html shows pipe"],
  ["D3 help Collect HOLD spine back", "help.html", [["Drop → Qualify → Do → Collect → Follow + Yes", "Drop → Qualify → Do → Collect HOLD → Follow + Yes"]], "D3 help.html html shows HOLD"],
  ["D3 help eBay stay HOLD back", "help.html", [["and eBay stay off until keys land", "and eBay stay HOLD until keys land"]], "D3 help.html html shows HOLD"],
  ["D3 help pipes and keys back", "help.html", [["own connections and keys", "own pipes and keys"]], "D3 help.html html shows pipe"],
  ["D3 help devices on Pipes back", "help.html", [["devices on Connections.", "devices on Pipes."]], "D3 help.html html shows pipe"],
  ["D3 help Collect and payouts HOLD back", "help.html", [["you install a pack. Payments are off for now. Nothing is charged.", "you install a pack. Collect and payouts HOLD."]], "D3 help.html html shows HOLD"],
  ["D3 help Collect stays HOLD back", "help.html", [["No SaaS codegen. Payments are off for now. Nothing is charged.", "No SaaS codegen. Collect stays HOLD."]], "D3 help.html html shows HOLD"],
  ["D3 help pack pay HOLD back", "help.html", [["Not Wallet.AIA. Payments are off for now. Nothing is charged.", "Not Wallet.AIA. Collect and pack pay stay HOLD until Yes + real pipe."]], "D3 help.html html shows HOLD"],
  ["D3 help Pipes → Rules back", "help.html", [["Connections → Rules When", "Pipes → Rules When"]], "D3 help.html html shows pipe"],
  ["D3 help HOLD ask back", "help.html", [["/ the ask waits)", "/ HOLD ask)"]], "D3 help.html html shows HOLD"],
  ["D3 help MX still HOLD back", "help.html", [["still off for now. AIA AI home", "still HOLD. AIA AI home"]], "D3 help.html html shows HOLD"],
  ["D3 help gone HOLD back (People)", "help.html", [["named desk AI or the not-on-this-desk note,", "named desk AI or gone HOLD,"]], "D3 help.html html shows HOLD"],
  ["D3 help Naming the pipe back", "help.html", [["Naming the connection does not turn them green.", "Naming the pipe does not turn them green."]], "D3 help.html html shows pipe"],
  ["D3 help Collect dd HOLD back", "help.html", [["<dd>Payments are off for now. Nothing is charged. Helper can prep", "<dd>Collect stays HOLD until a person taps Yes and a real money pipe is live. Helper can prep"]], "D3 help.html html shows HOLD"],
  ["D3 help Authenticator HOLD back", "help.html", [["Authenticator is off for now.", "Authenticator stays HOLD."]], "D3 help.html html shows HOLD"],
  ["D3 pipes Orange pipe back", "pipes.html", [["Orange until a real connection answers. Naming the connection does not turn it green.", "Orange until a real pipe answers. Naming the pipe does not turn it green."]], "D3 pipes.html html shows pipe"],
  ["D3 connections Orange pipe back", "connections.html", [["Orange until a real connection answers. Naming the connection does not turn it green.", "Orange until a real pipe answers. Naming the pipe does not turn it green."]], "D3 connections.html html shows pipe"],
  ["D3 history html Pipe HOLD added", "history.html", [['<option value="">Any connection</option>', '<option value="">Any connection</option><option value="x">Pipe HOLD</option>']], "D3 history.html html shows HOLD"],
  ["D3 history Install pack button back", "history.html", [[">Install a Pack</button>", ">Install pack</button>"]], "D3 history.html drawn roadHtml"],
  ["D3 history Give pack button back", "history.html", [[">Give a Pack · .aia</button>", ">Give pack · .aia</button>"]], "D3 history.html drawn roadHtml"],
  ["D3 history Update pack button back", "history.html", [[">Update a Pack · Yes</button>", ">Update pack · Yes</button>"]], "D3 history.html drawn roadHtml"],
  ["D3 history No pack yet back (roadmap)", "history.html", [['" No Pack on this desk yet."', '" No pack on this desk yet."']], "D3 history.html drawn roadHtml({})"],
  ["D3 history No pack yet back (hint)", "history.html", [['"No Pack on this desk yet. Install a Pack first."', '"No pack on this desk yet. Install a pack first."']], "D3 history.html inline script"],
  ["D3 history Install a pack with Yes back", "history.html", [["Install a Pack with Yes.", "Install a pack with Yes."]], "D3 history.html drawn roadHtml"],
  ["D3 history Give pack downloads back", "history.html", [["Give a Pack downloads the file", "Give pack downloads the file"]], "D3 history.html drawn roadHtml"],
  ["D3 history give a pack back", "history.html", [[">Open a desk to install or give a Pack.</p>", ">Open a desk to install or give a pack.</p>"]], "D3 history.html inline script"],
  ["D3 history pack file error back", "history.html", [['"Could not install that .aia Pack."', '"Could not install that .aia pack."']], "D3 history.html inline script"],
  ["D3 history follow falls back to pipe", "history.html", [['(from||"connection")+" · follow"', '(from||"pipe")+" · follow"']], "D3 history.html drawn wipTalkLabel({\"kind\":\"follow\"}) shows pipe"],
  ["D3 history pipe WIP label back", "history.html", [['return from+" · connection WIP"', 'return from+" · pipe WIP"']], "D3 history.html drawn wipTalkLabel({\"kind\":\"note\",\"from\":\"webhook\"}) shows pipe"],
  ["D3 history pipe filter chip back", "history.html", [['bits.push("connection "+pipe)', 'bits.push("pipe "+pipe)']], "D3 history.html inline script"],
  ["D3 help playbook step HOLD back", "desk-playbook.js", [["Odd cases go to a person. Yes, Stop, or Kill. Payments are off for now.", "Odd cases go to a person. Yes, Stop, or Kill. Collect stays HOLD."]], "D3 help.html playbook embed shows HOLD"],
  ["D3 help tip give-pack live pipe back", "aia-tip.js", [["The app or webhook is the live connection.", "The app or webhook is the live pipe."]], "D3 help.html tip give-pack shows pipe"],
  ["D3 pipes tip body pipe back", "aia-tip.js", [['body: "Webhook is live.', 'body: "Webhook is a live pipe.']], "D3 pipes.html tip pipes shows pipe"],
  ["D3 help theme.js string HOLD", "theme.js", [['"Theme: Auto follows your device. Tap to change."', '"Theme: Auto follows your device. Collect HOLD."']], "D3 help.html script theme.js shows HOLD"],
  ["D3 history sign-in line pipe", "signin-first.js", [["Sign in first. History shows what your desks did.", "Sign in first. History shows what your pipes did."]], "D3 history.html script signin-first.js shows pipe"],
  ["D3 history loads an unscanned script", "history.html", [['<script src="signin-first.js"', '<script src="zz-unscanned.js"></script><script src="signin-first.js"']], "does not cover (fail closed)"],
  ["D3 history roadHtml renamed", "history.html", [["function roadHtml(road)", "function roadHtmlX(road)"]], "no longer defines roadHtml()"],
  ["D3 desk-nav.js unreadable", "desk-nav.js", null, "desk-nav.js is missing or unreadable"],
  ["D3 aia-tip.js exposes no tips", "aia-tip.js", [["window.AIATip = {", "window.AIATipGone = {"]], "did not expose its tips in the vm (fail closed)"],
  ["D3 help links a missing tip", "help.html", [['data-aia-tip="give-pack"', 'data-aia-tip="give-pakk"']], "which aia-tip.js does not define"],
  ["D3 market-shop old registry line back", "market-shop.js", [["Wallet and name registry connections come later.", "Wallet / registry connect later as a Pipe HOLD."]], "old line back in market-shop.js"],
  ["D3 desks-book old registry line back", "desks-book.js", [["Wallet and name registry connections come later.", "Wallet / registry connect later as a Pipe HOLD."]], "old line back in desks-book.js"],
  ["D3 desk-ais old registry line back", "desk-ais.js", [["Wallet and name registry connections come later.", "Wallet / registry connect later as a Pipe HOLD."]], "old line back in desk-ais.js"],
  ["D3 help old pack pay line back", "help.html", [["AIA does not hold keys. Payments are off for now. Nothing is charged.", "AIA does not hold keys. Collect and pack pay stay HOLD until Yes + real pipe."]], "old line back in help.html"],
  ["D3 account old pack pay line back", "account.html", [["AIA does not hold keys. Payments are off for now. Nothing is charged.", "AIA does not hold keys. Collect and pack pay stay HOLD until Yes + real pipe."]], "old line back in account.html"],
  ["D3 wallet UI old pack pay line back", "aia-wallet.js", [["AIA does not hold keys. Payments are off for now. Nothing is charged.", "AIA does not hold keys. Collect and pack pay stay HOLD until Yes + real pipe."]], "old line back in aia-wallet.js"],
  ["D3 desk-ais new registry line dropped", "desk-ais.js", [["Wallet and name registry connections come later.", "Wallets later."]], "desk-ais.js must say: Wallet and name registry connections come later."],
  ["D3 account payments line dropped", "account.html", [["AIA does not hold keys. Payments are off for now. Nothing is charged.", "AIA does not hold keys."]], "account.html must say: Payments are off for now. Nothing is charged."],
  ["help.html unreadable", "help.html", null],
  ["pipes.html unreadable", "pipes.html", null]
];
function mutate(S, file, reps) {
  if (reps === null) return Object.assign({}, S, { [file]: null });
  let s = S[file];
  for (const [find, repl] of reps) { if (s.indexOf(find) < 0) return null; s = s.split(find).join(repl); }
  return Object.assign({}, S, { [file]: s });
}
function staticChecks() {
  const desk = fs.statSync(path.join(root, "desk.html")).size;
  ok(desk === 35012, "desk.html is 35012 bytes (" + desk + ")");
  // api/ freeze from #434: any git or helper error is a FAIL, never a pass.
  let freeze;
  try { freeze = require("./_api-freeze").check(root); }
  catch (e) { freeze = { ok: false, problems: ["api freeze helper failed: " + ((e && e.message) || e)] }; }
  if (!freeze || freeze.ok !== true) freeze = { ok: false, base: (freeze && freeze.base) || BASE, problems: (freeze && freeze.problems && freeze.problems.length) ? freeze.problems : ["api freeze gave no answer"] };
  ok(freeze.ok, "api/ frozen vs " + String(freeze.base || BASE).slice(0, 8) + " (scripts/_api-freeze.js)" + (freeze.ok ? "" : ": " + freeze.problems.join("; ")));
  ok(/check-ux-plain-words\.js/.test(read("package.json")), "npm test runs check-ux-plain-words.js");
  // legal.html must match main; a git error is a FAIL, never a pass.
  let legal = null;
  try {
    execFileSync("git", ["cat-file", "-e", BASE + "^{commit}"], { cwd: root, stdio: ["ignore", "ignore", "ignore"] });
    legal = execFileSync("git", ["diff", "--name-only", BASE, "--", "legal.html"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch (e) { legal = null; }
  ok(legal === "", "legal.html is untouched vs " + BASE.slice(0, 8) + (legal === null ? " (git error, failing closed)" : legal ? " (" + legal + ")" : ""));
}
async function main() {
  staticChecks();
  const base = await suite(SRC, (m) => ok(true, m));
  base.forEach((m) => fail(m));
  let caught = 0;
  for (const [name, file, reps, want] of MUTANTS) {
    const S = mutate(SRC, file, reps);
    if (S === null) { fail("mutant does not apply: " + name); continue; }
    let bad;
    try { bad = await suite(S, null); } catch (e) { bad = ["threw " + e.message]; }
    // A D3 mutant counts only when the D3 scan itself names it (want), not when some other rule trips.
    const hit = want ? bad.filter((m) => m.indexOf(want) >= 0) : bad;
    if (hit.length) { caught += 1; console.log("ok  mutant caught: " + name + " (" + hit[0] + ")"); }
    else fail("mutant NOT caught: " + name + (want ? " (wanted: " + want + "; got: " + (bad[0] || "nothing") + ")" : ""));
  }
  // Control: the playbook lead is not drawn in /help's embed, so jargon there must not count (the scan reads what is drawn).
  {
    const S = mutate(SRC, "desk-playbook.js", [["Walk them in order.", "Walk the pipes in order."]]);
    const bad = []; if (S) checkD3(S, (m) => bad.push(m));
    ok(S !== null && bad.length === 0, "D3 scan reads what the playbook draws: its lead is not in the /help embed" + (bad.length ? " (" + bad[0] + ")" : ""));
  }
  console.log("mutants caught " + caught + "/" + MUTANTS.length);
  if (caught !== MUTANTS.length || MUTANTS.length < 10) fail("every mutant must be caught (" + caught + "/" + MUTANTS.length + ")");
  if (failed) { console.error("check-ux-plain-words: " + passed + " ok, " + failed + " failed"); process.exit(1); }
  console.log("check-ux-plain-words: " + passed + " ok, 0 failed");
}
main().catch((e) => { console.error("FAIL " + (e && e.stack || e)); process.exit(1); });
