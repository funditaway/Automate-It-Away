#!/usr/bin/env node
require("./_env-guard");
// Plain words on public pages, UI only.
// A stranger on /, /how, /setup, /pricing, /status or /examples never reads internal words
// (HOLD, Collect, pack, pipe, Cap, BYOK, .aia, Wallet.AIA, Ext). Payments read "Payments are off for now".
// /status shows expected held states in neutral grey, not orange or red. One word each for
// Desk, Queue and account. A waiting card never says "Ready"; Blocked and Waiting match
// between /account and the desk. History says one account has one Queue holding many desks.
// Examples never use owner names (james.aia, james-ai@, springfield-shop): yourname.aia, your-shop.aia.
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
const PAGES = ["index.html", "how.html", "setup.html", "pricing.html", "status.html", "examples.html"];
const FILES = PAGES.concat(["aia-tip.js", "desk-playbook.js", "setup-demo.js", "queue-login.js", "account-connections.js", "setup-cards.js", "desk-card.js", "history.html", "PACK.md", "pipes.html", "connections.html", "help.html", "desks-book.js", "create-desk.js", "ACCOUNT-YES-NO.md"]);
const SRC = {};
FILES.forEach((f) => { SRC[f] = read(f); });

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

async function suite(S, okFn) {
  const bad = [];
  const b = (m) => bad.push(m);
  const steps = [["public pages read plain", () => checkPages(S, b)], ["info tips read plain", () => checkTips(S, b)],
    ["playbook and demo read plain", () => checkPlaybook(S, b)], ["status grey for held states", () => checkStatus(S, b)],
    ["same words for Queue, desk, account", () => checkWords(S, b)], ["no owner names in examples", () => checkOwnerNames(S, b)]];
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
  ["demo HOLD", "setup-demo.js", [['mean: "Photo to comps to listing draft. Payments are off for now." }', 'mean: "Photo to comps to listing draft. Collect HOLD until Yes + a real money pipe." }']]]
];
function mutate(S, file, reps) {
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
