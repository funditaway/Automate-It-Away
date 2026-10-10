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

// 7. After Yes the page echoes what the desk saved (out.ai), and the 400-character summary keeps the needs.
(function savedAndOrder() {
  if (!api || typeof api.savedLine !== "function" || typeof api.promptParts !== "function") {
    fail("create-simple.js must expose savedLine and promptParts");
    return;
  }
  // The Yes handler must build its line from the server reply, not the typed name.
  if (!/done\.textContent = savedLine\(d, out\)/.test(js)) fail("the after-Yes line must come from savedLine(d, out)");
  else pass("after-Yes line is built from the server reply");
  if (/done\.textContent = d\.name/.test(js)) fail("the after-Yes line must not echo the typed name");

  const longName = "Pickup and carpool helper for the whole family, every week";
  const longJob = "Reads every school and carpool message, works out who is picking up which child on which day, and drafts a short reply for me to check before anything goes out to anyone at all";
  const typed = {
    name: longName,
    job: longJob,
    needs: "Names, dates, or details only you know",
    watches: "School emails\nCarpool texts",
    drafts: "A reply, short and kind",
    plan: Array.from({ length: 40 }, function (_, i) { return "Step number " + (i + 1) + ", check the calendar and the group chat"; })
  };
  const body = api.saveBody(typed);

  // Real server code turns the body into the saved Desk AI, the same way save-ai does.
  let ai = null;
  try {
    const ais = require(path.join(root, "api", "_ais.js"));
    ai = ais.publicAi(ais.normalizeAi(body, "check-ws"));
  } catch (e) {
    fail("could not run api/_ais.js normalizeAi/publicAi: " + e.message);
    return;
  }
  const line = api.savedLine(typed, { ok: true, ai: ai });
  if (line.indexOf(ai.name.trim() + " is named on this desk.") !== 0) fail("after-Yes line must start with the saved name: " + line.slice(0, 80));
  else pass("after-Yes line shows the saved name (" + ai.name.length + " characters)");
  if (line.indexOf(longName) >= 0) fail("after-Yes line must not show the full typed name");
  if (line.indexOf("Its job, as saved: " + ai.does.trim()) < 0) fail("after-Yes line must show the saved job");
  else pass("after-Yes line shows the saved job (" + ai.does.length + " characters)");
  if (line.indexOf(longJob) >= 0) fail("after-Yes line must not show the full typed job");
  if (line.indexOf("AIA kept the first " + server.name + " characters of the name.") < 0) fail("after-Yes line must say the name was cut");
  if (line.indexOf("AIA kept the first " + server.does + " characters of the job.") < 0) fail("after-Yes line must say the job was cut");
  if (line.indexOf("AIA kept the first " + server.prompt + " characters of the summary") < 0) fail("after-Yes line must say the summary was cut");
  else pass("after-Yes line says plainly what was cut (name, job, summary)");
  if (!/drafts only\. Nothing was sent or charged\./.test(line)) fail("after-Yes line must keep the draft-only, nothing-sent line");

  // Short entries: no cut lines.
  const shortTyped = { name: "Pickup helper", job: "Drafts pickup replies", needs: "Who picks up", watches: "Texts", drafts: "A reply", plan: ["Read", "Draft"] };
  const shortAi = require(path.join(root, "api", "_ais.js"));
  const shortLine = api.savedLine(shortTyped, { ok: true, ai: shortAi.publicAi(shortAi.normalizeAi(api.saveBody(shortTyped), "check-ws")) });
  if (/AIA kept the first/.test(shortLine)) fail("no cut line when nothing was cut: " + shortLine);
  else pass("no cut line when nothing was cut");

  // Order: lead, then needs, then (job and lists), then steps last.
  const parts = api.promptParts(typed).filter(Boolean);
  const lead = "Draft only. The person presses Yes, Stop, or Kill.";
  if (parts[0] !== lead) fail("summary must start with the draft-only lead");
  if (!/^Needs from the person: /.test(parts[1] || "")) fail("the needs line must come right after the lead");
  if (!/^Steps: /.test(parts[parts.length - 1] || "")) fail("the steps must come last so they are what gets trimmed");
  else pass("summary order: lead, needs, job and lists, steps last");

  // A long request: at most 400 characters, still holds the lead and the whole needs line.
  const p = api.promptOf(typed);
  if (p.length > server.prompt) fail("summary must be at most " + server.prompt + " characters, got " + p.length);
  if (p.indexOf(lead) !== 0) fail("cut summary must keep the lead");
  if (p.indexOf("Needs from the person: Names, dates, or details only you know.") < 0) fail("cut summary must keep the whole needs line");
  if (api.promptLength(typed) <= server.prompt) fail("this test request must be longer than the cut");
  if (ai.prompt.length > server.prompt || ai.prompt.indexOf(lead) !== 0 || ai.prompt.indexOf("Needs from the person: Names, dates, or details only you know.") < 0) fail("the server-saved summary must keep the lead and the needs line");
  else pass("long request: summary is " + p.length + " characters (of " + api.promptLength(typed) + "), keeps the lead and needs; steps trimmed");
})();

if (bad) { console.error(bad + " check(s) failed"); process.exit(1); }
console.log("check-create-open ok");
