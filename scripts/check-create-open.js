// Open Create: no step or list cap, plain cut notes that match the server's real limits,
// a feature-detected Talk button, no secrets kept by the page, and no runs-by-itself wording.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

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
  const plan = api.planFrom("Read the note. Then draft a reply; ask me first. Remind me Friday");
  if (plan.length < 3) fail("planFrom must keep every step the person gave");
  else pass("planFrom keeps " + plan.length + " steps");
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

if (bad) { console.error(bad + " check(s) failed"); process.exit(1); }
console.log("check-create-open ok");
