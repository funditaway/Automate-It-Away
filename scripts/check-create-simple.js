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
const rulesPath = path.join(root, "card-rules.js");
const rulesJs = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, "utf8") : "";

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
// One official copy of the rules: card-rules.js.
if (!rulesJs) fail("card-rules.js missing");
const rulesBox = { window: {} };
try { vm.runInNewContext(rulesJs, rulesBox); } catch (e) { fail("card-rules.js must run: " + e.message); }
const shared = rulesBox.window.AIACardRules;
if (!Array.isArray(shared) || shared.length !== 9) fail("card-rules.js must expose exactly nine rules on window.AIACardRules");
else pass("card-rules.js exposes nine rules");
RULES.forEach(function (r, i) {
  if (!Array.isArray(shared) || shared[i] !== r) fail("rule " + (i + 1) + " in card-rules.js is not verbatim");
  else pass("rule " + (i + 1) + " verbatim in card-rules.js");
});
if (/&[a-z#0-9]+;/i.test(rulesJs)) fail("card-rules.js must not use HTML entities");
else pass("card-rules.js has no entities");
const loadRules = html.indexOf("<script src=\"card-rules.js\"></script>");
const loadSimple = html.indexOf("<script src=\"create-simple.js\"></script>");
if (loadRules < 0) fail("create.html must load card-rules.js");
else if (loadSimple >= 0 && loadRules > loadSimple) fail("create.html must load card-rules.js before create-simple.js");
else pass("create.html loads card-rules.js first");
if (html.indexOf("id=\"cs-rules-list\"") < 0) fail("create.html needs the empty #cs-rules-list the page fills");
else pass("create.html has #cs-rules-list");
if (js.indexOf("AIACardRules") < 0) fail("create-simple.js must render from window.AIACardRules");
else pass("create-simple.js renders from the shared rules");
RULES.forEach(function (r, i) {
  const probe = r === "Plain words." ? null : r.slice(0, 40);
  [["create.html", html], ["create-simple.js", js]].forEach(function (pair) {
    const hit = probe ? pair[1].indexOf(probe) >= 0 : (/>Plain words\.</.test(pair[1]) || /"Plain words\."/.test(pair[1]));
    if (hit) fail("second copy of rule " + (i + 1) + " found in " + pair[0]);
  });
});
pass("no second copy of the rules in create.html or create-simple.js");
const ruleBlock = (html.match(/<details class="cs-rules"[\s\S]*?<\/details>/) || [""])[0];
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

  // A comma inside an edited line must survive: lists split on line breaks only.
  const typed = "Your Yes before anything is used\nNames, dates, or details only you know\n\nPickup times, in order";
  const edited = typeof api.linesOf === "function" ? api.linesOf(typed) : [];
  if (typeof api.linesOf !== "function") fail("create-simple.js must expose linesOf for edited lists");
  else if (edited.length !== 3 || edited[1] !== "Names, dates, or details only you know" || edited[2] !== "Pickup times, in order") fail("edited lines must split on line breaks only and keep commas");
  else pass("comma inside an edited line survives");
  const commaDraft = { name: "Pickup helper", job: "Drafts a reply, then a reminder", watches: ["Pickup changes, late or early"], drafts: ["The reply, short and kind"], needs: edited, steps: ["qualify", "do"] };
  const commaLines = api.sampleDraft(commaDraft, cards[0]).join(" ");
  if (commaLines.indexOf("names, dates, or details only you know") < 0) fail("sample card must keep the comma line whole");
  else pass("sample card keeps the comma line whole");
  if (commaLines.indexOf("the reply, short and kind") < 0) fail("sample card must keep commas in the drafts line");
  else pass("sample card keeps commas in the drafts line");
  // Same thing when the lists arrive as raw textarea text.
  const rawLines = api.sampleDraft({ drafts: "The reply, short and kind", needs: typed }, cards[0]).join(" ");
  if (rawLines.indexOf("names, dates, or details only you know") < 0 || rawLines.indexOf("the reply, short and kind") < 0) fail("raw textarea text must keep commas on the sample card");
  else pass("raw textarea text keeps commas on the sample card");
  const commaPrompt = api.promptOf(commaDraft);
  if (commaPrompt.indexOf("Drafts a reply, then a reminder") < 0 || commaPrompt.indexOf("Names, dates, or details only you know") < 0 || commaPrompt.indexOf("Pickup changes, late or early") < 0) fail("saved prompt must keep commas inside each line");
  else pass("saved prompt keeps commas inside each line");
  if (commaPrompt.indexOf("Names; dates") >= 0) fail("saved prompt must not turn commas into semicolons");
  else pass("no comma turned into a semicolon");
}

// The save-ai body sends steps as a list, not a comma string, and does is the job line as typed.
if (/steps:\s*\(d\.steps \|\| \[\]\)\.join\(/.test(js)) fail("save-ai steps must not be joined with commas");
else pass("save-ai steps sent as a list");
if (!/does:\s*d\.job\b/.test(js)) fail("save-ai does must be the job line as typed");
else pass("save-ai does is the job line");
if (/split\(\/\[,;\\n\]\+\/\)/.test(js)) fail("create-simple.js must not split edited text on commas");
else pass("no comma split on edited text");

// Yes sends the nine rules from card-rules.js in the save-ai body, one rule per line.
const ruleSandbox = { window: { AIACardRules: Array.isArray(shared) ? shared : [] }, console: console };
ruleSandbox.window.document = null;
vm.runInNewContext(js, ruleSandbox);
const rapi = ruleSandbox.window.AIACreateSimple;
const joined = Array.isArray(shared) ? shared.join("\n") : "";
if (!rapi || typeof rapi.saveBody !== "function") fail("create-simple.js must build the save-ai body with saveBody");
else {
  const body = rapi.saveBody({ name: "Pickup helper", job: "Drafts a reply, then a reminder", watches: ["Pickup changes"], drafts: ["The reply"], needs: ["Your Yes"], steps: ["qualify", "do"] });
  if (body.action !== "save-ai") fail("saveBody must be a save-ai body");
  else pass("saveBody is a save-ai body");
  if (body.rules !== joined) fail("save-ai body must carry rules from card-rules.js, joined with line breaks");
  else pass("save-ai body carries the nine rules from card-rules.js");
  if (joined.length > 1000) fail("joined rules must fit the 1000 character Desk AI rules field");
  else pass("joined rules fit under 1000 characters (" + joined.length + ")");
  if (!Array.isArray(body.steps)) fail("save-ai steps must be a list");
  else pass("save-ai steps are a list");
  // The honest line follows the server's answer, and never claims enforcement.
  const stored = rapi.rulesLine({ ok: true, ai: { rules: joined } });
  const notStored = rapi.rulesLine({ ok: true, ai: { name: "Pickup helper" } });
  const blank = rapi.rulesLine({ ok: true, ai: { rules: "" } });
  if (!rapi.rulesStored({ ai: { rules: joined } }) || stored.indexOf("stored the nine rules") < 0) fail("when the saved Desk AI returns rules, say the desk stored them");
  else pass("says the desk stored the rules only when they come back");
  if (rapi.rulesStored({ ai: {} }) || notStored.indexOf("does not store the rules yet") < 0 || blank.indexOf("does not store the rules yet") < 0) fail("when rules do not come back, keep the not-stored line");
  else pass("keeps the not-stored line when rules do not come back");
  [stored, notStored, blank].forEach(function (line) {
    if (line.indexOf("Nothing enforces them.") < 0) fail("rules line must say nothing enforces them: " + line);
  });
  pass("rules lines never claim enforcement");
}
if (/\b(enforces|enforced)\b/i.test(js.replace(/Nothing enforces them/g, ""))) fail("create-simple.js must not claim the rules are enforced");
else pass("no enforcement claim in create-simple.js");

// When the server has the Desk AI rules field, the joined rules must come back whole.
try {
  const aisApi = require(path.join(root, "api", "_ais.js"));
  if (typeof aisApi.rulesText === "function" && rapi && typeof rapi.saveBody === "function") {
    const made = aisApi.normalizeAi(rapi.saveBody({ name: "Pickup helper", job: "Drafts a reply", watches: [], drafts: [], needs: [], steps: ["qualify"] }), "sample-desk");
    const back = made && aisApi.publicAi(made);
    if (!back || back.rules !== joined) fail("server rules field must return the joined rules whole");
    else pass("server rules field returns the joined rules whole");
  } else {
    pass("server has no Desk AI rules field yet; the extra rules field is ignored");
  }
} catch (e) { fail("api/_ais.js must load: " + e.message); }

if (bad) { console.error(bad + " check(s) failed"); process.exit(1); }
console.log("check-create-simple ok");
