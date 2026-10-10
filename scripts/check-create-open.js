// Open Create: no step or list cap, plain cut notes that match the server's real limits,
// a feature-detected Talk button, no secrets kept by the page, and no runs-by-itself wording.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const os = require("os");

// The save cases run through the real save-ai handler on a temp store (never the live one).
const store = path.join(os.tmpdir(), "aia-create-open-check-" + process.pid + "-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
delete global.__aia;
delete global.__aiaHydrate;

const root = path.join(__dirname, "..");
let bad = 0;
function fail(msg) { bad += 1; console.error("FAIL " + msg); }
function pass(msg) { console.log("ok " + msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const html = read("create.html");
const js = read("create-simple.js");
const grok = read("api/_grok.js");
const aisSrc = read("api/_ais.js");
const csBlock = (html.match(/<section class="card cs" id="cs">[\s\S]*?<\/section>/) || [""])[0];
if (!csBlock) fail("create.html must keep the simple Create section");

// 1. Server limits, read from api/ (not guessed).
function num(re, src, what) {
  const m = src.match(re);
  if (!m) { fail("could not find the server limit for " + what); return null; }
  return Number(m[1]);
}
const server = {
  brief: num(/async function studioDraft[\s\S]*?String\(brief \|\| ""\)\.trim\(\)\.slice\(0,\s*(\d+)\)/, grok, "the studio-draft brief"),
  name: num(/const name = clip\(raw\.name,\s*(\d+)\)/, aisSrc, "the Desk AI name"),
  does: num(/does: clip\(raw\.does,\s*(\d+)\)/, aisSrc, "the Desk AI job (does)"),
  prompt: num(/prompt: clip\(raw\.prompt,\s*(\d+)\)/, aisSrc, "the Desk AI prompt")
};
pass("server limits: brief " + server.brief + ", name " + server.name + ", does " + server.does + ", prompt " + server.prompt);

// The page's LIMITS must equal the server's.
const box = { window: { document: null }, console: console };
vm.runInNewContext(read("card-rules.js"), box);
vm.runInNewContext(js, box);
const api = box.window.AIACreateSimple;
if (!api || !api.LIMITS) fail("create-simple.js must expose LIMITS");
else {
  Object.keys(server).forEach(function (k) {
    if (api.LIMITS[k] !== server[k]) fail("LIMITS." + k + " is " + api.LIMITS[k] + " but the server cuts at " + server[k]);
    else pass("LIMITS." + k + " matches the server (" + server[k] + ")");
  });
}

// Plain cut notes near each field, with the server's numbers.
function noteHas(id, re, what) {
  const m = csBlock.match(new RegExp('<p class="cs-cut" id="' + id + '"[^>]*>([\\s\\S]*?)</p>'));
  if (!m) return fail("missing cut note #" + id + " for " + what);
  if (!re.test(m[1])) fail("cut note #" + id + " must say " + re + " for " + what + ": " + m[1]);
  else pass("cut note for " + what + " says the server number");
}
if (server.brief) noteHas("cs-words-cut", new RegExp("AIA reads the first " + server.brief + " characters"), "the words");
if (server.name) noteHas("cs-name-cut", new RegExp("first " + server.name + " characters"), "the name");
if (server.does) noteHas("cs-job-cut", new RegExp("first " + server.does + " characters"), "the job");
if (server.prompt) noteHas("cs-save-cut", new RegExp("first " + server.prompt + " characters"), "the saved summary");
// No other made-up limit numbers in the notes.
const noteNums = (csBlock.match(/<p class="cs-cut"[^>]*>[\s\S]*?<\/p>/g) || []).join(" ").match(/first (\d+) characters/g) || [];
const allowed = [server.brief, server.name, server.does, server.prompt].map(String);
noteNums.forEach(function (t) {
  const n = t.match(/\d+/)[0];
  if (allowed.indexOf(n) < 0) fail("cut note names a limit the server does not have: " + t);
});
pass("cut notes only name real server limits");

// 2. No UI cap: no maxlength in the simple section, no list slicing, typing is never blocked.
if (/maxlength/i.test(csBlock)) fail("simple Create fields must not have maxlength");
else pass("no maxlength in simple Create");
// Allowed: the desk-name slug sent to the server (String(ws)...) and the three-word name suggestion (bits).
if (/\.slice\(0,\s*\d+\)/.test(js.replace(/String\(ws\)[^\n]*/, "").replace(/var bits = [^\n]*/, ""))) fail("create-simple.js must not slice lists or text to a fixed size");
else pass("no fixed-size slice on lists or text");
if (/clean\([^()]*,\s*\d+\)/.test(js)) fail("create-simple.js must not clip text to a number except through LIMITS");
else pass("text is only cut through LIMITS");
if (!/id="cs-plan"/.test(csBlock) || !/id="cs-plan-add"/.test(csBlock)) fail("simple Create needs a steps list with Add a step");
else pass("steps list with Add a step");
if (!/Remove/.test(js) || !/removeChild\(li\)/.test(js)) fail("each step must be removable");
else pass("steps can be removed");
if (/MAX_STEPS|maxSteps|steps?\.length\s*>=?\s*\d|plan\.length\s*>=?\s*\d/.test(js)) fail("there must be no step-count cap");
else pass("no step-count cap");
if (api) {
  const many = [];
  for (let i = 1; i <= 60; i++) many.push("Step number " + i + ", with a comma");
  const lines = api.linesOf(many.join("\n"));
  if (lines.length !== 60 || lines[59] !== "Step number 60, with a comma") fail("60 lines must all survive whole");
  else pass("60 lines survive whole");
  const longLine = "x".repeat(2000);
  if (api.linesOf(longLine)[0].length !== 2000) fail("a long line must not be clipped");
  else pass("a 2000-character line is kept whole on the page");
  const plan = api.planFrom("Read the note\nThen draft a reply; ask me first\nRemind me Friday");
  if (plan.length !== 3) fail("planFrom must keep every typed line as a step");
  else pass("planFrom keeps " + plan.length + " typed lines as steps");
  const d = { name: "N", job: "J", plan: many, watches: many, drafts: many, needs: many };
  const sample = api.sampleDraft(d, { title: "t" }).join(" ");
  if (sample.indexOf("60 steps") < 0) fail("sample card must count all 60 steps");
  else pass("sample card counts all 60 steps");
  const p = api.promptOf(d);
  if (p.length > server.prompt) fail("saved prompt must be cut at the server's " + server.prompt);
  else pass("saved prompt is cut at " + server.prompt + " only");
  if (p.indexOf("Draft only.") !== 0) fail("the draft-only line must come first so the cut never drops it");
  else pass("draft-only line comes first in the saved summary");
  if (api.promptLength(d) <= server.prompt) fail("promptLength must report the full length before the cut");
  else pass("page can say how much will not be saved");
  const s = api.starterDraft("Do a thing");
  if (!Array.isArray(s.plan)) fail("starter must carry the person's own steps");
}

// 3. Examples are labeled, never preselected.
const ph = (csBlock.match(/id="cs-words"[^>]*placeholder="([^"]*)"/) || [])[1] || "";
if (ph && !/^For example:/.test(ph)) fail("the words placeholder must be labeled as an example");
else pass("placeholder is labeled as an example");
if (/<select|checked|selected|aria-pressed="true"/.test(csBlock)) fail("simple Create must not preselect a template or action");
else pass("nothing preselected in simple Create");

// 4. Talk button: feature-detected, hidden by default, one start/stop button, honest note.
const mic = (csBlock.match(/<button[^>]*id="cs-mic"[^>]*>/) || [""])[0];
if (!mic) fail("simple Create needs the Talk button #cs-mic");
else if (!/\shidden(\s|>|=)/.test(mic)) fail("#cs-mic must start hidden until the browser has speech-to-text");
else pass("#cs-mic starts hidden");
if (!/win\.SpeechRecognition \|\| win\.webkitSpeechRecognition/.test(js)) fail("create-simple.js must feature-detect SpeechRecognition / webkitSpeechRecognition");
else pass("speech API is feature-detected");
if (!/if \(SR\) \{\s*el\("cs-mic"\)\.hidden = false;/.test(js)) fail("#cs-mic must only show when the speech API exists");
else pass("#cs-mic shows only when the API exists");
if (api) {
  if (api.speechApi({}) !== null) fail("speechApi must return null without the API");
  else pass("no API: speechApi is null, so the button stays hidden");
  function Fake() {}
  if (api.speechApi({ webkitSpeechRecognition: Fake }) !== Fake) fail("speechApi must find webkitSpeechRecognition");
  else pass("finds webkitSpeechRecognition");
}
if (!/aria-pressed/.test(js) || !/Stop listening/.test(js) || !/Listening\./.test(js)) fail("Talk must be one start/stop button with a clear listening state");
else pass("one Talk button with a listening state");
const micNote = (csBlock.match(/<p class="cs-cut" id="cs-mic-note"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || "";
if (!/Your browser does that/.test(micNote) || !/some browsers send the sound to their maker's service/i.test(micNote) || !/AIA does not upload or keep any audio/.test(micNote)) fail("the Talk note must say the browser does it, some send it to their maker, and AIA keeps no audio");
else pass("Talk note is honest about where speech goes");
if (/on-device|on device|never leaves|stays on your (phone|device)|private by design/i.test(csBlock + js)) fail("must not claim speech stays on the device");
else pass("no on-device claim");
if (/getUserMedia|MediaRecorder|AudioContext|new Blob|FormData/.test(js)) fail("create-simple.js must not record or upload audio");
else pass("no audio capture or upload");

// 5. No secrets: no secret field, nothing new kept in storage.
if (/type="password"|secret|api[-_ ]?key|token/i.test(csBlock)) fail("simple Create must not have a secrets field yet");
else pass("no secrets field");
if (/localStorage\.setItem|sessionStorage|indexedDB|document\.cookie/.test(js)) fail("create-simple.js must not store anything in the browser");
else pass("nothing stored in localStorage, sessionStorage, IndexedDB or cookies");

// 6. Draft only: no runs-by-itself, auto-run, or allowed-actions wording.
const words = csBlock + "\n" + js;
if (/runs? (by|on) (it|them)sel|runs? automatically|automatically (send|run|act|start)|auto-?run|on its own, it|turned on|is live|allowed actions|allowed-actions|one Yes at setup/i.test(words)) fail("simple Create must not say it runs by itself or show allowed actions");
else pass("no auto-run or allowed-actions wording");
["cs-yes\">Yes<", "cs-stop\">Stop<", "cs-kill\">Kill<"].forEach(function (b) {
  if (csBlock.indexOf(b) < 0) fail("Yes / Stop / Kill must stay as they are: " + b);
});
pass("Yes, Stop and Kill unchanged");

// 7. Save through the real save-ai handler: POST /api/desks the way the page does (api/auth.js routes via=desks to
//    api/_desks-http.js, which hands save-ai to api/_packs.js), on desks kept in a temp store. No copy of the handler.
const ais = require(path.join(root, "api", "_ais.js"));
const lib = require(path.join(root, "api", "_lib.js"));
const desksRoute = require(path.join(root, "api", "auth.js"));
const PIN = "4821";
let deskCount = 0;
function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end() { return this; }
  };
}
// A fresh desk in the temp store, opened by its owner.
async function freshDesk() {
  await lib.ready();
  deskCount += 1;
  const slug = "create-open-" + deskCount;
  const shop = { slug: slug, name: "Create " + deskCount, biz: slug, pin: lib.hashPin(PIN), createdAt: new Date().toISOString(), people: [], rules: [] };
  lib.ensurePeople(shop);
  if (!Array.isArray(lib.mem.workspaces)) lib.mem.workspaces = [];
  lib.mem.workspaces.unshift(shop);
  return { shop: shop, headers: { "content-type": "application/json", "x-workspace": slug, "x-pin": PIN } };
}
// One POST /api/desks through the real handler. Returns the HTTP status, r.ok (2xx) and the JSON reply.
async function postDesk(desk, body) {
  const res = mockRes();
  await desksRoute({ method: "POST", url: "/api/desks", headers: desk.headers, body: JSON.parse(JSON.stringify(body)), query: { via: "desks" } }, res);
  return { status: res.statusCode, httpOk: res.statusCode >= 200 && res.statusCode < 300, out: res.body };
}
async function saveViaDesks(d, desk) {
  desk = desk || await freshDesk();
  const r = await postDesk(desk, api.saveBody(d));
  r.desk = desk;
  return r;
}
async function yes(d, desk) {
  const r = await saveViaDesks(d, desk);
  const res = api.yesResult(d, r.out, r.httpOk);
  if (!res.saved) fail("this save should count as saved: " + res.text + " (HTTP " + r.status + ")");
  const got = api.savedReply(r.out) || r.out || {};
  return { out: got, ai: got.ai || {}, line: res.text, last: res.text.split("\n").pop(), res: res, desk: r.desk };
}
const lead = "Draft only. The person presses Yes, Stop, or Kill.";

async function savedValues() {
  if (!api || typeof api.savedLine !== "function" || typeof api.promptParts !== "function") { fail("create-simple.js must expose savedLine and promptParts"); return; }
  if (!/var res = yesResult\(d, out, r\.ok\);/.test(js) || !/done\.textContent = res\.text;/.test(js) || !/if \(res\.rulesStored && /.test(js)) fail("the after-Yes text must come from yesResult(d, out, r.ok)");
  else pass("after-Yes line is built from the server reply");
  if (/done\.textContent = d\.name/.test(js)) fail("the after-Yes line must not echo the typed name");
  const longName = "Pickup and carpool helper for the whole family, every week";
  const longJob = "Reads every school and carpool message, works out who is picking up which child on which day, and drafts a short reply for me to check before anything goes out to anyone at all";
  const typed = { name: longName, job: longJob, needs: "Names, dates, or details only you know", watches: "School emails\nCarpool texts\nThe class group chat, the sports club newsletter and every message from the after-school club about late pickups", drafts: "A reply, short and kind", plan: ["Read the message", "Draft a reply"] };
  const r = await yes(typed);
  if (r.line.indexOf(r.ai.name.trim() + " is named on this desk.") !== 0 || r.line.indexOf(longName) >= 0) fail("after-Yes line must show the saved name, not the typed one");
  else pass("after-Yes line shows the saved name (" + r.ai.name.length + " characters)");
  if (r.line.indexOf("Its job, as saved: " + r.ai.does + "\n") < 0 || r.line.indexOf(longJob) >= 0) fail("after-Yes line must show the saved job exactly");
  else pass("after-Yes line shows the saved job exactly (" + r.ai.does.length + " characters)");
  if (r.line.indexOf("AIA kept the first " + cp(r.ai.name) + " characters of the name.") < 0 || r.line.indexOf("AIA kept the first " + cp(r.ai.does) + " characters of the job.") < 0) fail("after-Yes line must say the name and job were cut, with the stored lengths");
  else pass("after-Yes line says the name and job were cut, with the stored lengths (" + cp(r.ai.name) + ", " + cp(r.ai.does) + ")");
  if (!/drafts only\. Nothing was sent or charged\./.test(r.line)) fail("after-Yes line must keep the draft-only, nothing-sent line");
  const p = api.promptOf(typed);
  if (p.length > server.prompt || p.indexOf(lead) !== 0 || p.indexOf("Needs from the person: Names, dates, or details only you know.") < 0) fail("summary must be at most 400 and keep the lead and the whole needs line");
  else pass("summary at most " + server.prompt + " characters, lead and needs whole");
  const shortTyped = { name: "Pickup helper", job: "Drafts pickup replies", needs: "Who picks up", watches: "Texts", drafts: "A reply", plan: ["Read", "Draft"] };
  const sr = await yes(shortTyped);
  if (/AIA kept the first|didn't fit|Only part|shortened/.test(sr.line)) fail("no cut lines when nothing was cut: " + sr.line);
  else pass("no cut lines when nothing was cut");
  const shown = sr.line.split("\n").filter(function (l) { return l.indexOf("Its job, as saved: ") === 0; })[0];
  if (shown !== "Its job, as saved: Drafts pickup replies") fail("saved job must be shown with nothing added: " + JSON.stringify(shown));
  else pass("saved job shown exactly as stored, no added period");
}

// 8. Three lines typed in the box give three steps (Draft it keeps the line breaks for the starter draft).
(function typedLines() {
  const fnSrc = (js.match(/async function draftIt\(\) \{[\s\S]*?\n  \}\n/) || [""])[0];
  if (!fnSrc) { fail("could not find draftIt"); return; }
  if (/starterDraft\(words\)|fromStudio\(words,/.test(fnSrc) || !/starterDraft\(raw\)/.test(fnSrc) || !/fromStudio\(raw, /.test(fnSrc)) fail("Draft it must pass the raw box text (with line breaks) to the starter draft");
  else pass("Draft it passes the raw box text to the starter draft");
  if (!/var raw = String\(el\("cs-words"\)\.value/.test(fnSrc) || !/var words = clean\(raw\)/.test(fnSrc) || !/brief: words/.test(fnSrc)) fail("only the studio-draft brief may squash the line breaks");
  else pass("only the studio-draft brief squashes line breaks");
  const typed = "Read the school email\nDraft a reply, short and kind\nRemind me Friday";
  const plan = api.starterDraft(typed).plan;
  if (!plan || plan.length !== 3 || plan[1] !== "Draft a reply, short and kind") fail("three typed lines must give three steps, got " + JSON.stringify(plan));
  else pass("three typed lines give three steps: " + JSON.stringify(plan));
  const studioPlan = api.fromStudio(typed, { name: "x", kind: "ai" }).plan;
  if (!studioPlan || studioPlan.length !== 3) fail("an AIA draft must keep the three typed steps too, got " + JSON.stringify(studioPlan));
  else pass("AIA draft keeps the three typed steps");
})();

// 9. Steps go as their own list (plan); the summary carries no steps.
async function planField() {
  const d = { name: "Pickup helper", job: "Drafts pickup replies", needs: "Who picks up", watches: "Texts", drafts: "A reply", plan: "Ask Ms. Lee about Friday\n\nRead the note then draft a reply\nCall Dad, Mom, or Sam", steps: ["qualify", "do", "follow"] };
  const body = api.saveBody(d);
  if (!Array.isArray(body.plan) || JSON.stringify(body.plan) !== JSON.stringify(["Ask Ms. Lee about Friday", "Read the note then draft a reply", "Call Dad, Mom, or Sam"])) fail("save-ai body must send plan as an array of typed lines: " + JSON.stringify(body.plan));
  else pass("save-ai sends plan as an array, one typed line each (blank lines dropped, 'Ms. Lee', ' then ', commas whole)");
  if (JSON.stringify(body.steps) !== JSON.stringify(["qualify", "do", "follow"])) fail("steps (the draft allow-list) must be sent exactly as before");
  else pass("steps field unchanged (draft allow-list)");
  const keys = Object.keys(body).sort().join(",");
  if (keys !== "action,does,id,name,plan,prompt,rules,steps") fail("save-ai body fields changed beyond adding plan: " + keys);
  else pass("save-ai body: same fields as 307 plus plan");
  // Same request fields as parked 307 (its file from git, when available), apart from the new plan.
  try {
    const cp = require("child_process");
    const old = cp.execSync("git show 3e05767700f61d7dcb3d7798df407225a62c2867:create-simple.js", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString();
    const oldBox = { window: { document: null, AIACardRules: box.window.AIACardRules } };
    vm.runInNewContext(old, oldBox);
    box.window.AIACardRules = box.window.AIACardRules || [];
    const was = oldBox.window.AIACreateSimple.saveBody(d);
    const now = Object.assign({}, body); delete now.plan;
    ["action", "id", "name", "does", "steps", "rules"].forEach(function (k) {
      if (JSON.stringify(was[k]) !== JSON.stringify(now[k])) fail("save-ai field " + k + " must match 307: " + JSON.stringify(was[k]) + " vs " + JSON.stringify(now[k]));
    });
    pass("save-ai action/id/name/does/steps/rules match 307 exactly (prompt now leaves out steps)");
  } catch (e) {
    pass("307's file is not in this checkout's history; field list check above still applies");
  }
  // The 2,717-character request with 42 typed lines: 42 steps go in plan, none in the summary.
  const lines42 = [];
  for (let i = 1; i <= 42; i++) lines42.push("Step " + i + " check the calendar and the carpool chat, then note it");
  let words = lines42.join("\n"); while (words.length < 2717) words += " ok"; words = words.slice(0, 2717);
  const big = api.starterDraft(words);
  const bigBody = api.saveBody(big);
  if (words.length !== 2717 || (bigBody.plan || []).length !== 42 || /Steps: /.test(bigBody.prompt) || bigBody.prompt.length > server.prompt) fail("2,717-character request: 42 steps in plan, none in the summary");
  else pass("2,717-character request: 42 steps sent in plan, summary " + bigBody.prompt.length + " characters with no steps");
  const sd = (js.match(/action: "studio-draft"[^}]*\}/) || [""])[0];
  if (!/plan: planFrom\(raw\)/.test(sd) || !/brief: words/.test(sd) || !/kind: "ai"/.test(sd)) fail("studio-draft must keep brief/kind and also send plan: " + sd);
  else pass("studio-draft also sends plan (harmless until the server reads it)");
  const many = { name: "M", job: "J", needs: "N", watches: "W", drafts: "D", plan: Array.from({ length: 50 }, function (_, i) { return "Step " + (i + 1) + ": check it"; }) };
  if (/Steps:|1\) |Step 1/.test(api.promptOf(many)) || api.promptParts(many).some(function (x) { return /^Steps: /.test(x); })) fail("the summary must not carry the steps");
  else pass("summary (prompt) carries no steps");
  if (!/id="cs-plan-cut"[^>]*>[^<]*Up to 200 steps\./.test(csBlock) || !/500 characters/.test((csBlock.match(/id="cs-plan-cut"[^>]*>([^<]*)/) || ["", ""])[1])) fail("the page must say 'Up to 200 steps.' and 500 characters near the steps");
  else pass("page says 'Up to 200 steps.' and 500 characters per step");
  const plimit = num(/const PLAN_MAX = (\d+)/, aisSrc, "the plan step count"), pchars = num(/const PLAN_CHARS = (\d+)/, aisSrc, "the plan step length");
  if (api.LIMITS.planSteps !== plimit || api.LIMITS.planChars !== pchars) fail("LIMITS.planSteps/planChars must match the server (" + plimit + "/" + pchars + ")");
  else pass("plan limits match the server: " + plimit + " steps, " + pchars + " characters");

  // 201 steps: step 201 dropped.
  const d201 = { name: "Many", job: "J", needs: "N", watches: "W", drafts: "D", plan: Array.from({ length: 201 }, function (_, i) { return "Do thing " + (i + 1); }) };
  const r201 = await yes(d201);
  if (!r201.out.planCut || r201.ai.plan.length !== 200 || r201.line.indexOf("AIA kept the first 200 steps. Step 201 didn't fit.") < 0) fail("201 steps must name step 201 as dropped: " + r201.line.split("\n").slice(-2).join(" | "));
  else pass("201 steps: 'AIA kept the first 200 steps. Step 201 didn't fit.'");
  const d230 = { name: "Many", job: "J", needs: "N", watches: "W", drafts: "D", plan: Array.from({ length: 230 }, function (_, i) { return "Do thing " + (i + 1); }) };
  const r230 = await yes(d230);
  if (r230.line.indexOf("AIA kept the first 200 steps. Steps 201 to 230 didn't fit.") < 0) fail("230 steps must read 'Steps 201 to 230 didn't fit.'");
  else pass("230 steps: 'Steps 201 to 230 didn't fit.'");
  // 501-character step: shortened.
  const d501 = { name: "Long", job: "J", needs: "N", watches: "W", drafts: "D", plan: ["Read it", "Draft it", "x".repeat(501)] };
  const r501 = await yes(d501);
  if (r501.ai.plan[2].length !== 500 || r501.line.indexOf("Step 3 was shortened to 500 characters.") < 0 || /didn't fit/.test(r501.line)) fail("a 501-character step must be noted as shortened: " + r501.line.split("\n").pop());
  else pass("501-character step: 'Step 3 was shortened to 500 characters.'");
  const cut2 = { kept: 3, dropped: 0, trimmed: 2, droppedIndexes: [], trimmedIndexes: [0, 2] };
  const two = api.planNote(cut2, ["a".repeat(500), "b", "c".repeat(500)], 3);
  if (two !== "Steps 1 and 3 were shortened to 500 characters.") fail("plural shortened wording: " + two);
  const mixed = api.planNote(cut2, ["a".repeat(499), "b", "c".repeat(500)], 3);
  if (mixed !== "Step 1 was shortened to 499 characters. Step 3 was shortened to 500 characters.") fail("each count comes from its own stored step: " + mixed);
  const noText = api.planNote(cut2, null, 3);
  if (noText !== "Steps 1 and 3 were shortened to fit.") fail("no stored steps: plain 'to fit' wording, no number: " + noText);
  if (api.planNote({ kept: 0, dropped: 1, trimmed: 0, droppedIndexes: [0], trimmedIndexes: [] }, [], 1) !== "Step 1 didn't fit.") fail("never 'the first 0 steps'");
  if (api.planNote({ kept: 1, dropped: 1, trimmed: 0, droppedIndexes: [1], trimmedIndexes: [] }, ["a"], 2) !== "AIA kept the first step. Step 2 didn't fit.") fail("singular kept wording");
  else pass("singular and plural step wording");
  // planCut null: the saved steps are listed, no steps note.
  const rn = await yes({ name: "Fine", job: "J", needs: "N", watches: "W", drafts: "D", plan: ["Read", "Draft"] });
  if (rn.out.planCut !== null || /didn't fit|shortened|AIA kept the first \d* ?steps?/.test(rn.line) || rn.line.indexOf("Its steps, as saved:\n1) Read\n2) Draft") < 0) fail("planCut null: steps shown as saved, no steps note: " + JSON.stringify(rn.line));
  else pass("planCut null: steps shown as the desk stored them, no steps note");
  // Server without plan (no out.ai.plan): say plainly the steps weren't saved.
  const old = api.savedLine({ name: "Old", job: "J", plan: ["Read"] }, { ok: true, ai: { name: "Old", does: "J", prompt: "x" } });
  if (old.indexOf("The desk did not save the steps.") < 0 || /Its steps, as saved/.test(old)) fail("without out.ai.plan the page must say the steps were not saved");
  else pass("no out.ai.plan: page says plainly the steps were not saved");
  // Never match on the server's bad-plan error text; show out.error as sent.
  if (/Steps must be a list of plain text|Plan must be a list of plain text/.test(js)) fail("create-simple.js must not contain the server's bad-plan error text");
  else pass("create-simple.js has neither bad-plan error string (out.error is shown as sent)");
  if (!/\(out && out\.error\) \|\| "The desk did not save it\."/.test(js)) fail("a failed save must show out.error as the server sent it");
}

// 10. Prompt trim note: a piece's own text (after its label) against the length really saved.
async function promptTrim() {
  if (/indexOf\(piece\.label\)|label: "Watches:"/.test(js)) fail("the trim note must not search the saved text for labels");
  // Probe's repro: needs "Your Yes" + 14 lines; saved ends at the "Watches" label.
  const needs = ["Your Yes"].concat(Array.from({ length: 14 }, function (_, i) { return "Need " + (i + 1) + " detail here"; })).join("\n");
  const pr = { name: "Label", job: "Drafts it", needs: needs, watches: "Cards", drafts: "Replies", plan: ["Read"] };
  const r1 = await yes(pr);
  if (!/Watches$/.test(r1.ai.prompt)) fail("repro setup: saved summary should end at the Watches label, got ..." + r1.ai.prompt.slice(-30));
  if (r1.last.indexOf("AIA kept the first " + r1.ai.prompt.length + " characters of the summary.") < 0 || /Only part of what it watches/.test(r1.last) || r1.last.indexOf("What it watches and what it drafts didn't fit.") < 0) fail("label-only Watches must be lost, not partly kept: " + r1.last);
  else pass("saved ends at 'Watches' label (" + r1.ai.prompt.length + "): what it watches and what it drafts didn't fit");
  // A lone "Job" label saved.
  let jneeds = needs, jr = null;
  for (let k = 0; k < 60 && !(jr && /Job$/.test(jr.ai.prompt)); k++) {
    jneeds = needs + "\n" + "z".repeat(k + 1);
    jr = await yes({ name: "Label", job: "Drafts it", needs: jneeds, watches: "Cards", drafts: "Replies", plan: [] });
  }
  if (!jr || !/Job$/.test(jr.ai.prompt)) fail("could not build the lone Job label case");
  else if (/Only part of the job/.test(jr.last) || jr.last.indexOf("The job, what it watches and what it drafts didn't fit.") < 0) fail("label-only Job must be lost: " + jr.last);
  else pass("saved ends at 'Job' label: the job, what it watches and what it drafts didn't fit");
  // Needs typed as "Watches: the bus list", cut inside the job.
  const longNeed = "Every name, date, time, address and phone number for each child, each driver and each school, plus who is allowed to pick up which child on which day and what to do when plans change at the last minute or someone is sick or late";
  const job150 = "Reads every school and carpool message, works out who is picking up which child on which day, and drafts a short reply for me to check first";
  const a = await yes({ name: "Bus", job: job150, needs: "Watches: the bus list\n" + longNeed, watches: "School texts", drafts: "A reply", plan: [] });
  if (/Only part of what it watches/.test(a.last) || a.last.indexOf("Only part of the job fit.") < 0 || a.last.indexOf("What it watches and what it drafts didn't fit.") < 0) fail("needs typed as 'Watches: ...' must not count as watches: " + a.last);
  else pass("needs typed as 'Watches: the bus list': job partly kept, watches and drafts lost");
  // One long word across the cut (the 401 long-word case): note says the real kept count.
  const base = { name: "Word", job: "Drafts replies", needs: "Who picks up", watches: "Texts", drafts: "", plan: [] };
  const filler = "pad ".repeat(Math.ceil((400 - api.promptLength(base) - 12) / 4)).trim();
  const c = { name: "Word", job: base.job, needs: base.needs, watches: base.watches, drafts: filler + "\n" + "w".repeat(260), plan: [] };
  const wordAt = api.summaryMap(c).full.indexOf("w".repeat(260));
  const cr = await yes(c);
  if (wordAt > 400 || wordAt + 260 <= 400) fail("long-word setup must span the cut");
  if (cr.ai.prompt.length >= 400 || cr.last.indexOf("AIA kept the first " + cr.ai.prompt.length + " characters of the summary.") < 0 || /first 400 characters/.test(cr.last)) fail("the note must give the real kept count: " + cr.last);
  else pass("long word across the cut: note says the real kept count (" + cr.ai.prompt.length + ")");
  // Edges: job 160/161, summary 400/401.
  const j160 = await yes({ name: "J", job: "b".repeat(160), needs: "N", watches: "W", drafts: "D", plan: [] });
  const j161 = await yes({ name: "J", job: "b".repeat(161), needs: "N", watches: "W", drafts: "D", plan: [] });
  if (/characters of the job/.test(j160.last) || j161.last.indexOf("AIA kept the first " + server.does + " characters of the job.") < 0) fail("job edges: 160 no note, 161 note");
  else pass("job edges: 160 no note, 161 note");
  function sized(n) { const d0 = { name: "S", job: "Drafts", needs: "N", watches: "W", drafts: "", plan: [] }; d0.drafts = "x".repeat(n - api.promptLength(d0)); return d0; }
  const s400 = sized(400), s401 = sized(401);
  const n400 = await yes(s400), n401 = await yes(s401);
  if (api.promptLength(s400) !== 400 || /AIA kept the first \d+ characters of the summary/.test(n400.last)) fail("a 400-character summary fits: no trim note");
  if (n401.last.indexOf("AIA kept the first " + n401.ai.prompt.length + " characters of the summary.") < 0) fail("a 401-character summary gets a note with the real kept count");
  else pass("summary edges: 400 no note, 401 note with the real kept count (" + n401.ai.prompt.length + ")");
  // Job echo keeps the stored trailing space at 160.
  const e = await yes({ name: "Space", job: "a".repeat(159) + " and more words after the cut", needs: "N", watches: "W", drafts: "D", plan: [] });
  const eShown = e.line.split("\n").filter(function (l) { return l.indexOf("Its job, as saved: ") === 0; })[0];
  if (eShown !== "Its job, as saved: " + e.ai.does) fail("job echo must be the stored row's job exactly");
  else pass("job echo is the stored row's job exactly (" + cp(e.ai.does) + " characters)");
}

// 12. Every "kept the first N" / "shortened to N" count comes from the stored text (Probe: a space at the cut).
function cp(x) { return Array.from(String(x)).length; }
async function storedCounts() {
  // The note code holds no fixed limit numbers.
  const a = js.indexOf("function cpLen"), b = js.indexOf("var api = {");
  const noteCode = a >= 0 && b > a ? js.slice(a, b) : "";
  if (!noteCode) fail("could not find the note code in create-simple.js");
  else if (/\b(500|160|40)\b/.test(noteCode) || /LIMITS\.(name|does|planChars|planSteps)/.test(noteCode)) fail("note code must not hold a literal 500/160/40 or read a fixed limit for a count");
  else pass("note code has no literal 500, 160 or 40 and reads no fixed limit for counts");
  // A 640-character step whose 500th character is a space, through the real save-ai handler: stored 499, note says 499.
  const step = "s".repeat(499) + " " + "t".repeat(140);
  const r = await yes({ name: "Space", job: "J", needs: "N", watches: "W", drafts: "D", plan: [step] });
  const stored = r.ai.plan && r.ai.plan[0];
  if (step.length !== 640 || step.charAt(499) !== " ") fail("space-at-the-cut setup");
  if (cp(stored) !== 499 || r.line.indexOf("Step 1 was shortened to 499 characters.") < 0 || /shortened to 500/.test(r.line)) fail("step with a space at 500 must be stored at 499 and the note must say 499: stored " + cp(stored) + ", " + r.last);
  else pass("640-character step, space at 500: real handler stores 499, after Yes says 'Step 1 was shortened to 499 characters.'");
  // Probe's Tuesday/Thursday name (space at character 40) and a job with a space at character 160.
  const name = "Pickup Helper for the Tuesday and Thurs day afterschool club";
  const job = "j".repeat(159) + " more words after the cut";
  if (name.charAt(39) !== " " || job.charAt(159) !== " ") fail("name/job space-at-the-cut setup");
  const jr = await yes({ name: name, job: job, needs: "N", watches: "W", drafts: "D", plan: [] });
  const jw = "AIA kept the first 159 characters of the job.";
  const nw = "AIA kept the first 39 characters of the name.";
  if (cp(jr.ai.does) !== 159 || cp(jr.ai.name) !== 39) fail("real handler must store the job at 159 and the name at 39, got " + cp(jr.ai.does) + " / " + cp(jr.ai.name));
  else if (jr.line.indexOf(jw) < 0 || jr.line.indexOf(nw) < 0 || /first 160 |first 40 /.test(jr.line)) fail("job and name notes must say 159 and 39: " + jr.line);
  else if (jr.line.indexOf("Pickup Helper for the Tuesday and Thurs is named on this desk.") !== 0) fail("the name line must be the stored name: " + jr.line.split("\n")[0]);
  else pass("Tuesday/Thursday name (space at 40) and job (space at 160): real handler stores 39/159, notes say 39 and 159");
  // A server that trims the trailing space (stored shorter): the note follows the stored text.
  const shortAi = Object.assign({}, jr.ai, { does: "j".repeat(159), name: name.slice(0, 39) });
  const sl = api.savedLine({ name: name, job: job, needs: "N", watches: "W", drafts: "D", plan: [] }, { ok: true, ai: shortAi, planCut: null });
  if (sl.indexOf("AIA kept the first 159 characters of the job.") < 0 || sl.indexOf("AIA kept the first 39 characters of the name.") < 0 || /first 160|first 40 /.test(sl)) fail("trimmed stored job/name must give 159/39: " + sl);
  else pass("stored job 159 / name 39 (trailing space trimmed): notes say 159 and 39");
  // Losing only a closing period is not losing part of a piece.
  const dp = { name: "P", job: "Drafts replies", needs: "Who picks up", watches: "Texts", drafts: "A reply.", plan: [] };
  const full = api.summaryMap(dp).full;
  const tn = api.trimNote(dp, full.replace(/\.+$/, ""));
  if (tn !== "") fail("only the closing periods lost must give no trim note: " + tn);
  else pass("only the closing periods lost: no 'Only part of' note");
}

// 13. Saved only if the desk's own list holds the AI (Probe: a 7th AI on a desk that keeps 6), through the real save-ai handler.
async function savedOnlyIfListed() {
  const claims = /is named on this desk|, as saved|stored the nine rules|does not store the rules|AIA kept the first|shortened|didn't fit|Only part/;
  function snap(shop) { return JSON.stringify({ ais: shop.ais, people: shop.people, packAis: shop.packAis, packBots: shop.packBots }); }
  async function deskWith(names) {
    const desk = await freshDesk();
    for (let i = 0; i < names.length; i++) {
      const r = await saveViaDesks({ name: names[i], job: "Drafts " + names[i], needs: "N", watches: "W", drafts: "D", plan: ["Read"] }, desk);
      if (!r.httpOk || !r.out || r.out.ok !== true) fail("setup: " + names[i] + " must save, got " + r.status + " " + JSON.stringify(r.out && r.out.error));
    }
    return desk;
  }
  const d7 = { name: "Seventh Helper", job: "Drafts pickup replies", needs: "Who picks up", watches: "Texts", drafts: "A reply", plan: ["Read", "Draft"] };

  // A desk with six Desk AIs: the real server refuses the 7th with 400 ok:false and saves nothing.
  const six = await deskWith(["One", "Two", "Three", "Four", "Five", "Six"]);
  if ((six.shop.ais || []).length !== 6) fail("setup: the desk must hold 6 Desk AIs, got " + (six.shop.ais || []).length);
  const before = snap(six.shop);
  const r7 = await saveViaDesks(d7, six);
  const res7 = api.yesResult(d7, r7.out, r7.httpOk);
  const seats7 = (six.shop.people || []).filter(function (p) { return p && /Seventh/.test(String(p.name || "")); });
  if (r7.status !== 400 || r7.httpOk || !r7.out || r7.out.ok !== false || r7.out.error !== "This desk already has 6 Desk AIs." || Object.prototype.hasOwnProperty.call(r7.out, "ai")) fail("real server: a 7th AI must get 400 ok:false 'This desk already has 6 Desk AIs.' with no ai, got " + r7.status + " " + JSON.stringify(r7.out));
  else if (snap(six.shop) !== before || seats7.length) fail("a refused 7th AI must leave the desk unchanged and write no seat");
  else if (res7.saved || res7.text !== r7.out.error + " Nothing was saved." || claims.test(res7.text)) fail("7th AI refused: page must show the error as sent, then 'Nothing was saved.', no claims: " + res7.text);
  else pass("7th AI on a 6-AI desk (real handler): 400 -> '" + res7.text + "', no saved/rules/steps claims, store unchanged");

  // Updating one of the six on the full desk still saves, and the page shows the saved lines from that row.
  const upd = { name: "Three", job: "Drafts pickup replies for Three", needs: "N", watches: "W", drafts: "D", plan: ["Read the note", "Draft a reply"] };
  const ru = await saveViaDesks(upd, six);
  const resU = api.yesResult(upd, ru.out, ru.httpOk);
  const rowU = (six.shop.ais || []).filter(function (x) { return x && x.name === "Three"; });
  if (!ru.httpOk || !ru.out || ru.out.ok !== true || (six.shop.ais || []).length !== 6 || rowU.length !== 1 || rowU[0].does !== upd.job) fail("updating one of the six on a full desk must save, got " + ru.status + " " + JSON.stringify(ru.out && ru.out.error));
  else if (!resU.saved || resU.text.indexOf("Three is named on this desk.") !== 0 || resU.text.indexOf("Its job, as saved: " + upd.job + "\n") < 0 || resU.text.indexOf("Its steps, as saved:\n1) Read the note\n2) Draft a reply") < 0) fail("an updated AI on a full desk must show the saved lines: " + resU.text);
  else pass("updating one of the six on a full desk (real handler): saved, still 6, saved lines shown");

  // A desk with five: Seventh Helper fits as the sixth, so it saves; it is in out.ais and the saved lines come from that row.
  const five = await deskWith(["One", "Two", "Three", "Four", "Five"]);
  const rOk = await saveViaDesks(d7, five);
  const ok = rOk.out || {};
  const okRes = api.yesResult(d7, ok, rOk.httpOk);
  const inList = (ok.ais || []).some(function (x) { return x && ok.ai && x.id === ok.ai.id; });
  if (!rOk.httpOk || ok.ok !== true || !inList || !(five.shop.ais || []).some(function (x) { return x && x.name === "Seventh Helper"; })) fail("normal save: the AI must be stored and in out.ais, got " + rOk.status + " " + JSON.stringify(ok.error));
  else if (!okRes.saved || okRes.text.indexOf("Seventh Helper is named on this desk.") !== 0 || okRes.text.indexOf("Its job, as saved: Drafts pickup replies\n") < 0 || okRes.text.indexOf("Its steps, as saved:\n1) Read\n2) Draft") < 0 || !/stored the nine rules/.test(okRes.text)) fail("an AI in the desk's list must show the saved lines: " + okRes.text);
  else pass("normal save (real handler): AI in out.ais; named, job, steps and rules lines show");

  // Stubbed replies (the real server no longer sends these): the page's guard must still hold.
  // ok:true but the AI is not in the desk's list.
  const notListed = api.yesResult(d7, { ok: true, ai: ok.ai, ais: ru.out && ru.out.ais }, true);
  if (notListed.saved || claims.test(notListed.text) || notListed.text !== "The desk did not save it. Nothing was saved.") fail("ok:true but not in out.ais must make no saved, rules or steps claims: " + notListed.text);
  else pass("stub: ok:true but not in out.ais -> '" + notListed.text + "'");
  // Counts come from the listed row, not out.ai.
  const listed = Object.assign({}, ok.ai, { name: "Seventh Helper (desk)" });
  const viaRow = api.yesResult(d7, Object.assign({}, ok, { ai: Object.assign({}, ok.ai, { name: "Other" }), ais: (ok.ais || []).map(function (x) { return x.id === ok.ai.id ? listed : x; }) }), true);
  if (viaRow.text.indexOf("Seventh Helper (desk) is named on this desk.") !== 0) fail("saved lines must read the row from out.ais: " + viaRow.text.split("\n")[0]);
  else pass("stub: saved lines read the matching row in out.ais, not out.ai");
  // No id, no list, or a name-only match: not saved.
  const noId = api.yesResult(d7, Object.assign({}, ok, { ai: Object.assign({}, ok.ai, { id: "" }) }), true);
  const noList = api.yesResult(d7, { ok: true, ai: ok.ai }, true);
  const nameOnly = api.yesResult(d7, Object.assign({}, ok, { ais: (ok.ais || []).map(function (x) { return x.id === ok.ai.id ? Object.assign({}, x, { id: "other" }) : x; }) }), true);
  if (noId.saved || noList.saved || nameOnly.saved || claims.test(noId.text + noList.text + nameOnly.text)) fail("no id, no ais, or only a name match must not count as saved");
  else pass("stub: no id, no ais list, or a name-only match: not saved, no claims");
  // ok:true, not listed, with an error string: the error exactly as sent, then ' Nothing was saved.'
  const withErr = api.yesResult(d7, { ok: true, ai: ok.ai, ais: ru.out && ru.out.ais, error: "This desk already has 6 Desk AIs." }, true);
  const otherErr = api.yesResult(d7, { ok: true, ai: ok.ai, ais: [], error: "Desk is busy, try again." }, true);
  if (withErr.saved || withErr.text !== "This desk already has 6 Desk AIs. Nothing was saved." || claims.test(withErr.text)) fail("ok:true not listed with out.error: show it exactly, then ' Nothing was saved.': " + withErr.text);
  else if (otherErr.saved || otherErr.text !== "Desk is busy, try again. Nothing was saved.") fail("any out.error is shown as sent, then ' Nothing was saved.': " + otherErr.text);
  else pass("stub: ok:true not listed with an error -> the error as sent, then ' Nothing was saved.'");
  // ok:false with the error -> shown as sent.
  const refused = api.yesResult(d7, { ok: false, error: "This desk already has 6 Desk AIs." }, false);
  if (refused.saved || refused.text !== "This desk already has 6 Desk AIs. Nothing was saved." || claims.test(refused.text)) fail("ok:false must show out.error as sent: " + refused.text);
  else pass("stub: ok:false 'This desk already has 6 Desk AIs.' shown as sent (then 'Nothing was saved.'), no claims");
  if (/already has 6 Desk AIs|6 Desk AIs/.test(js)) fail("create-simple.js must not match on the 6-AI error text");
  else pass("create-simple.js never matches on the 6-AI error text");
}

// 11. Before Yes: the studio-draft reply's planCut (servers with plan polish) gives a plain steps note; no planCut, no note.
function beforeYes() {
  if (typeof api.planFitNote !== "function") { fail("create-simple.js must expose planFitNote"); return Promise.resolve(); }
  const withCut = { ok: false, grok: "off", plan: Array.from({ length: 200 }, function (_, i) { return i === 2 ? "x".repeat(500) : "s" + i; }), planCut: { kept: 200, dropped: 1, trimmed: 1, droppedIndexes: [200], trimmedIndexes: [2] } };
  const n1 = api.planFitNote(withCut, 201);
  if (n1 !== "AIA will keep the first 200 steps. Step 201 won't fit. Step 3 will be shortened to 500 characters.") fail("draft reply with planCut must give the before-Yes note: " + n1);
  else pass("draft reply with planCut: '" + n1 + "'");
  const n2 = api.planFitNote({ plan: ["a".repeat(499)], planCut: { kept: 1, dropped: 2, trimmed: 1, droppedIndexes: [1, 2], trimmedIndexes: [0] } }, 3);
  if (n2 !== "AIA will keep the first step. Steps 2 to 3 won't fit. Step 1 will be shortened to 499 characters.") fail("before-Yes singular/plural: " + n2);
  if (api.planFitNote({ plan: [], planCut: { kept: 0, dropped: 1, trimmed: 0, droppedIndexes: [5], trimmedIndexes: [] } }, 2) !== "") fail("a planCut whose step numbers don't fit the steps sent must be ignored");
  else pass("before-Yes singular and plural wording");
  if (api.planFitNote({ ok: true, pack: {} }) !== "" || api.planFitNote({ ok: true, pack: {}, planCut: null }) !== "" || api.planFitNote(null) !== "") fail("draft reply without planCut must give no before-Yes note");
  else pass("draft reply without planCut: no before-Yes note");
  // The page: a hidden note line by the steps, filled from the draft reply, hidden again on any step edit.
  if (!/<p class="cs-cut" id="cs-plan-fit"[^>]*hidden><\/p>/.test(csBlock)) fail("create.html needs the hidden #cs-plan-fit line near the steps");
  const di = (js.match(/async function draftIt\(\) \{[\s\S]*?\n  \}\n/) || [""])[0];
  if ((di.match(/showPlanFit\(d, planFrom\(raw\)\.length\)/g) || []).length !== 1 || (di.match(/showPlanFit\(null\)/g) || []).length !== 2) fail("draftIt must fill the note from the draft reply (and clear it when there is none)");
  else if (!/addEventListener\("input", clearPlanFit\)/.test(js) || !/function paintPlan[\s\S]*?clearPlanFit\(\);[\s\S]*?\n  \}/.test(js)) fail("editing the steps must hide the before-Yes note");
  else pass("page fills the before-Yes note from the draft reply and hides it when steps change");
  // The real studio-draft code on this branch (no drafter key, so no network): 201 steps.
  let g;
  try { g = require(path.join(root, "api", "_grok.js")); } catch (e) { fail("could not load api/_grok.js: " + e.message); return Promise.resolve(); }
  if (g.pickDrafter({})) { pass("a drafter key is set here; skipping the real studio-draft case to avoid a network call"); return Promise.resolve(); }
  const plan201 = Array.from({ length: 201 }, function (_, i) { return "Do thing " + (i + 1); });
  return g.studioDraft("Help with pickups", {}, { kind: "ai", plan: plan201 }).then(function (out) {
    // Shape the reply the way api/_packs.js does for the drafting-off path.
    const reply = { ok: false, grok: "off", saved: false, plan: out.plan, planCut: out.planCut };
    const note = api.planFitNote(reply, plan201.length);
    if (out && out.planCut) {
      if (note.indexOf("AIA will keep the first 200 steps. Step 201 won't fit.") !== 0) fail("real studio-draft (plan polish): 201 steps must name step 201: " + note);
      else pass("real studio-draft returns planCut: before-Yes note '" + note + "'");
    } else if (note !== "") fail("real studio-draft without planCut must give no note");
    else pass("real studio-draft on this base returns no planCut: no before-Yes note (needs plan polish, PR 313)");
    // Probe's space at the cut, before Yes: the count comes from the reply's stored plan.
    const step = "s".repeat(499) + " " + "t".repeat(140);
    return g.studioDraft("Help with pickups", {}, { kind: "ai", plan: [step] }).then(function (o2) {
      const n = api.planFitNote({ ok: false, grok: "off", plan: o2.plan, planCut: o2.planCut }, 1);
      if (o2 && o2.planCut) {
        const want = "Step 1 will be shortened to " + cp(o2.plan[0]) + " characters.";
        if (n !== want || (cp(o2.plan[0]) === 499 && /500/.test(n))) fail("before Yes the count must come from the reply's stored step: " + n);
        else pass("real studio-draft, 640-character step with a space at 500: before Yes says '" + n + "'");
      } else if (n !== "") fail("no planCut in the draft reply must give no note");
      else pass("real studio-draft here returns no planCut for the space case: no before-Yes note");
    });
  }).catch(function (e) { fail("real studio-draft case threw: " + e.message); });
}

(async function main() {
  try {
    await savedValues();
    await planField();
    await promptTrim();
    await storedCounts();
    await savedOnlyIfListed();
    await beforeYes();
  } catch (e) {
    fail("check threw: " + (e && e.stack || e));
  }
  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
  if (bad) { console.error(bad + " check(s) failed"); process.exit(1); }
  console.log("check-create-open ok");
})();
