// Simple Create path: the nine rules verbatim, draft only, Yes / Stop / Kill, sample cards labeled, no buy / charge / Market path.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
let bad = 0;
function fail(msg) { bad += 1; console.error("FAIL " + msg); }
function pass(msg) { console.log("ok " + msg); }

const html = fs.readFileSync(path.join(root, "create.html"), "utf8");
const js = fs.readFileSync(path.join(root, "create-simple.js"), "utf8");

const RULES = [
  "One card, one idea. Stay inside this card's topic. Keep its talk, drafts, decisions, and actions here, in order.",
  "New card only when needed. If the talk moves to a different project that needs its own history, suggest a new card. Don't split one idea across cards.",
  "Keep the history clear. Note each decision, draft, and next step in plain words.",
  "Draft only. Never send, pay, delete, or charge on your own. The person presses Yes, Stop, or Kill.",
  "When unsure, stop and ask. Make your first work easy to undo.",
  "One job. If another card or Desk AI fits better, say which one. The person moves it.",
  "Plain words.",
  "No silent money. No fees or charges unless the person says Yes.",
  "Use only what this card stores. Don't pretend to remember other cards or desks."
];
const ruleBlock = (html.match(/<details class="cs-rules"[\s\S]*?<\/details>/) || [""])[0];
const ruleItems = [];
ruleBlock.replace(/<li>([\s\S]*?)<\/li>/g, function (_, t) { ruleItems.push(t); return _; });
if (ruleItems.length !== 9) fail("create.html must show exactly nine rules, found " + ruleItems.length);
else pass("nine rules listed");
RULES.forEach(function (r, i) {
  if (ruleItems[i] !== r) fail("rule " + (i + 1) + " is not verbatim");
  else pass("rule " + (i + 1) + " verbatim");
});
if (/&[a-z#0-9]+;/i.test(ruleBlock)) fail("rules block must not use HTML entities");
else pass("rules block has no entities");
if (!/does not enforce these rules/.test(ruleBlock)) fail("rules block must say the page does not enforce them");
else pass("rules shown as copy only");

if (html.indexOf("<script src=\"create-simple.js\"></script>") < 0) fail("create.html must load create-simple.js");
else pass("create.html loads create-simple.js");
if (html.indexOf("id=\"cs\"") < 0 || html.indexOf("id=\"cs\"") > html.indexOf("id=\"start\"")) fail("simple Create must come before the older start card");
else pass("simple Create comes first");
["id=\"cs-words\"", "id=\"cs-draft\"", "id=\"cs-name\"", "id=\"cs-job\"", "id=\"cs-watches\"", "id=\"cs-drafts\"", "id=\"cs-needs\"", "id=\"cs-try\"", "id=\"cs-samples\""].forEach(function (bit) {
  if (html.indexOf(bit) < 0) fail("create.html missing " + bit);
  else pass("create.html has " + bit);
});
[["cs-yes", "Yes"], ["cs-stop", "Stop"], ["cs-kill", "Kill"]].forEach(function (pair) {
  const re = new RegExp("id=\"" + pair[0] + "\">" + pair[1] + "</button>");
  if (!re.test(html)) fail(pair[1] + " must be its own button with the plain label " + pair[1]);
  else pass(pair[1] + " is its own button");
});
if (js.indexOf("Sample, made up") < 0 || html.indexOf("Made-up cards on this phone only") < 0) fail("sample cards must be labeled as made up");
else pass("sample cards labeled");

const syn = spawnSync(process.execPath, ["--check", path.join(root, "create-simple.js")], { encoding: "utf8" });
if (syn.status !== 0) fail("create-simple.js must parse");
else pass("create-simple.js parses");
if (/innerHTML|insertAdjacentHTML|document\.write/.test(js)) fail("create-simple.js must build with textContent only");
else pass("create-simple.js uses textContent");
const actions = [];
js.replace(/action:\s*"([a-z-]+)"/g, function (_, a) { actions.push(a); return _; });
const allowed = ["studio-draft", "save-ai"];
const extra = actions.filter(function (a) { return allowed.indexOf(a) < 0; });
if (extra.length) fail("create-simple.js may only call studio-draft and save-ai, found " + extra.join(", "));
else if (actions.indexOf("studio-draft") < 0 || actions.indexOf("save-ai") < 0) fail("create-simple.js must use studio-draft then save-ai");
else pass("only studio-draft and save-ai");
const fetches = js.match(/fetch\("([^"]+)"/g) || [];
if (fetches.some(function (f) { return f !== "fetch(\"/api/desks\""; })) fail("create-simple.js may only post to /api/desks");
else pass("only /api/desks");
const money = /buy-pack|list-pack|publish-pack|submit-pack|install-pack|use-pack|\/market|checkout|square|stripe|payout|\bcharge\(|\/api\/pay|ask:\s*[1-9]/i;
if (money.test(js)) fail("create-simple.js must not add a buy, charge, or Market path");
else pass("no buy / charge / Market path in create-simple.js");
const csBlock = (html.match(/<section class="card cs" id="cs">[\s\S]*?<\/section>/) || [""])[0];
if (/data-buy|Buy\b|\/market|checkout|Charge now|Pay now/i.test(csBlock)) fail("simple Create section must not show Buy, Market, or charge controls");
else pass("simple Create section has no Buy / Market / charge");
if (/runs (by|on) (it|them)sel|automatically|on its own, it|turned on|is live/i.test(csBlock + js)) fail("simple Create must not claim it runs by itself");
else pass("no runs-by-itself claim");

// Older Collect HOLD honesty lines live in the scripts the page still loads.
["create-pack-install.js", "create-pack-download.js"].forEach(function (name) {
  if (html.indexOf(name) < 0) fail("create.html must still load " + name);
  else pass("create.html still loads " + name);
});

// Behaviour: pure helpers in a sandbox with no DOM.
const sandbox = { window: {}, console: console };
sandbox.window.document = null;
vm.runInNewContext(js, sandbox);
const api = sandbox.window.AIACreateSimple;
if (!api) fail("window.AIACreateSimple missing");
else {
  const s = api.starterDraft("Remind me to water the plants every Tuesday");
  if (!s.name || s.job.indexOf("water the plants") < 0 || !s.watches.length || !s.drafts.length || !s.needs.length) fail("starter draft must have name, one job, watches, drafts, needs");
  else pass("starter draft has one job and the three lists");
  const st = api.fromStudio("x", { name: "P", kinds: "chore,school", fields: "who:text,when:text", ais: [{ name: "Lane", does: "Drafts pickup notes", steps: "qualify,do,send" }] });
  if (st.source !== "aia" || st.name !== "Lane" || st.job !== "Drafts pickup notes") fail("studio draft must map name and job");
  else pass("studio draft maps name and job");
  if (st.steps.indexOf("send") >= 0) fail("studio draft must drop unknown steps like send");
  else pass("studio draft drops send");
  if (st.needs[0] !== "Your Yes before anything is used" || st.needs.indexOf("The who") < 0) fail("needs must start with Yes and list fields");
  else pass("needs list fields after Yes");
  const p = api.promptOf(st);
  if (p.length > 400) fail("prompt must fit save-ai's 400 characters");
  else pass("prompt fits 400");
  if (p.indexOf("Draft only.") < 0) fail("prompt must say draft only");
  else pass("prompt says draft only");
  const cards = api.sampleCards();
  if (cards.length < 2) fail("need sample cards");
  else pass("sample cards present");
  const lines = api.sampleDraft(st, cards[0]);
  if (lines.join(" ").indexOf("Nothing is sent.") < 0) fail("sample draft must say nothing is sent");
  else pass("sample draft says nothing is sent");
}

if (bad) { console.error(bad + " check(s) failed"); process.exit(1); }
console.log("check-create-simple ok");
