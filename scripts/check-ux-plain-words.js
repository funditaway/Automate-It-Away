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
  "login.html", "login-doors.js", "account.html", "aia-tld.js", "aia-register-abi.js", "theme.css", "vercel.json", "drop.html", "developer.html", "more.html"]);
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
    ["Collect stays HOLD until a person taps Yes and a real money pipe is live.", 1, "check-collect-hold"],
    ["Collect stays HOLD until a person taps Yes and a real Collect money pipe", 1, "check-studio-earnings"],
    ["Collect and pack pay stay HOLD until Yes + real pipe", 2, "check-pack-sell, check-connect-wallet"],
    ["A pack puts When → If → Then on this desk queue", 1, "check-aia-tip"],
    ["Buyer binds their own keys and devices on Pipes", 1, "check-build-pack"],
    ["Drop → Qualify → Do → Collect HOLD → Follow", 2, "check-desk-switch"],
    ["Naming the pipe does not turn them green.", 1, "check-pipes-switch"],
    ["Calendar, SMS, Square, and eBay stay HOLD", 1, "check-world-people"],
    ["How do I install, give, or update a pack?", 1, "check-help-faq"],
    ["do not map shared OpenAI keys into packs", 1, "check-world-people"],
    ["you do not pick a pack on every Drop", 1, "check-pack-queue-shape"],
    ["You do not pick a pack on every Drop", 2, "check-help-faq, check-pack-queue-shape"],
    ["desk account and you install a pack", 1, "check-build-pack"],
    ["Your first pack in Creators Studio", 1, "check-ux-simplify"],
    ["App / webhook is the live pipe", 2, "check-aia-tip"],
    ["Pipes → Rules When · If · Then", 1, "check-queue-help"],
    ["Selling packs — risk honesty", 1, "check-pack-sell"],
    ["Installed packs auto-shape", 2, "check-pack-queue-shape"],
    ["When for packs and rules", 1, "check-aia-inbound"],
    ["Collect and payouts HOLD", 3, "check-build-pack, check-pack-sell"],
    ["Authenticator stays HOLD", 1, "check-account-page"],
    ["Thin App / webhook pack", 1, "check-build-pack"],
    ["When a pack is worth it", 4, "check-pack-sell"],
    ["stands behind the pack", 1, "check-pack-sell"],
    ["Build a pack / desk AI", 2, "check-build-pack"],
    ["Build automation packs", 1, "check-studio-earnings"],
    ["Recurring update HOLD", 4, "check-help-faq, check-history-roadmap"],
    ["On-desk Pack Creator", 1, "check-build-pack"],
    ["Collect stays HOLD", 3, "check-help-faq, check-queue-help, check-desk-cards"],
    ["3–5 strong packs", 1, "check-studio-earnings"],
    ["First pack suite", 1, "check-studio-earnings"],
    ["pipes and keys", 1, "check-build-pack"],
    ["Selling packs", 3, "check-pack-sell, check-ux-simplify"],
    ["Learn packs", 1, "check-studio-earnings"],
    ["Import Pack", 1, "check-world-people"],
    ["Update pack", 3, "check-aia-tip, check-history-roadmap, check-world-home"],
    ["still HOLD", 1, "check-aia-inbound, check-aia-register, check-money-pipe"],
    ["Open packs", 2, "check-aia-adoption, check-queue-packs"],
    ["Give pack", 3, "check-aia-tip, check-history-roadmap, check-packs-download-assert"],
    ["HOLD ask", 1, "check-ask-grok-gone"],
    ["gone HOLD", 1, "check-help-faq (First day People)"]
  ],
  "pipes.html": [["Orange until a real pipe answers. Naming the pipe does not turn it green.", 1, "check-pipes-switch"]],
  "connections.html": [["Orange until a real pipe answers. Naming the pipe does not turn it green.", 1, "check-pipes-switch"]],
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
  // check-connect-wallet / check-pack-sell (Collect and pack pay ...), check-account-page (Authenticator stays HOLD).
  [["Recurring update HOLD. Collect HOLD.", 1], ["Collect and pack pay stay HOLD until Yes + real pipe.", 1], ["Authenticator stays HOLD.", 1]].forEach(([t, max]) => {
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
}

async function suite(S, okFn) {
  const bad = [];
  const b = (m) => bad.push(m);
  const steps = [["every file read (fail closed)", () => checkFilesRead(S, b)], ["public pages read plain", () => checkPages(S, b)], ["info tips read plain", () => checkTips(S, b)],
    ["playbook and demo read plain", () => checkPlaybook(S, b)], ["status grey for held states", () => checkStatus(S, b)],
    ["same words for Queue, desk, account", () => checkWords(S, b)], ["no owner names in examples", () => checkOwnerNames(S, b)],
    ["help, connections and login read plain", () => checkPages2(S, b)], ["account has no owner names", () => checkAccount(S, b)],
    ["history says connection", () => checkHistory(S, b)], ["status held states grey with 4.5:1", () => checkStatus2(S, b)],
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
  for (const [name, file, reps] of MUTANTS) {
    const S = mutate(SRC, file, reps);
    if (S === null) { fail("mutant does not apply: " + name); continue; }
    let bad;
    try { bad = await suite(S, null); } catch (e) { bad = ["threw " + e.message]; }
    if (bad.length) { caught += 1; console.log("ok  mutant caught: " + name + " (" + bad[0] + ")"); }
    else fail("mutant NOT caught: " + name);
  }
  console.log("mutants caught " + caught + "/" + MUTANTS.length);
  if (caught !== MUTANTS.length || MUTANTS.length < 10) fail("every mutant must be caught (" + caught + "/" + MUTANTS.length + ")");
  if (failed) { console.error("check-ux-plain-words: " + passed + " ok, " + failed + " failed"); process.exit(1); }
  console.log("check-ux-plain-words: " + passed + " ok, 0 failed");
}
main().catch((e) => { console.error("FAIL " + (e && e.stack || e)); process.exit(1); });
