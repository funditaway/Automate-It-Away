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
  if (line.indexOf("AIA kept the first " + ai.prompt.length + " characters of the summary.") < 0) fail("after-Yes line must say how much of the summary was really kept (" + ai.prompt.length + ")");
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

// 9. Honest trim note: built from what really survived the 400-character cut, naming every lost piece.
(function honestTrim() {
  if (typeof api.trimNote !== "function") { fail("create-simple.js must expose trimNote"); return; }
  const ais = require(path.join(root, "api", "_ais.js"));
  function save(d) { return ais.publicAi(ais.normalizeAi(api.saveBody(d), "check-ws")); }

  // Steps split on line breaks only.
  const kept = api.planFrom("Ask Ms. Lee about Friday\n\n  \nRead the note then draft a reply\nCall Dad, Mom, or Sam\r\n");
  if (JSON.stringify(kept) !== JSON.stringify(["Ask Ms. Lee about Friday", "Read the note then draft a reply", "Call Dad, Mom, or Sam"])) fail("steps must split on line breaks only (Ms. Lee, then, commas stay whole; blank lines ignored): " + JSON.stringify(kept));
  else pass("steps split on line breaks only; 'Ms. Lee', ' then ' and commas stay whole, blank lines ignored");
  if (api.planFrom("Read it. Then reply, then remind me").length !== 1) fail("one typed line must stay one step");

  // The summary carries the job exactly as the server keeps it (first 160 characters).
  const longJob = "Reads every school and carpool message and works out who is picking up which child on which day and drafts a short reply for me to check before anything goes out to anyone at all ever";
  const jobPart = api.promptParts({ job: longJob }).filter(function (x) { return /^Job: /.test(x); })[0] || "";
  if (jobPart !== "Job: " + longJob.slice(0, server.does).trim() + ".") fail("the summary must carry the job cut at " + server.does + " like the server: " + jobPart.slice(0, 60));
  else pass("summary carries the job cut at " + server.does + ", same as the server");

  // Probe case 1: a 2,717-character request with AIA drafting off: 42 typed lines, starter draft.
  const lines = [];
  for (let i = 1; i <= 42; i++) lines.push("Step " + i + " check the calendar and the carpool chat, then note it");
  let words = lines.join("\n");
  while (words.length < 2717) words += " ok";
  words = words.slice(0, 2717);
  const d1 = api.starterDraft(words);
  if (words.length !== 2717 || d1.plan.length !== 42) fail("case 1 setup must be 2,717 characters and 42 steps, got " + words.length + " / " + d1.plan.length);
  const ai1 = save(d1);
  const line1 = api.savedLine(d1, { ok: true, ai: ai1 });
  const expect1 = "AIA kept the first " + ai1.prompt.length + " characters of the summary. Only part of what it watches fit. What it drafts and the steps didn't fit.";
  if (ai1.prompt.indexOf("Needs from the person: ") < 0 || ai1.prompt.indexOf("Drafts:") >= 0 || ai1.prompt.indexOf("Steps:") >= 0) fail("case 1 must save the lead, needs and job and lose drafts and steps: " + ai1.prompt.slice(-60));
  if (line1.indexOf(expect1) < 0) fail("case 1 (2,717 characters, 42 steps) must name every lost piece: " + line1.split("\n").pop());
  else pass("case 1 (2,717 characters, 42 steps): " + expect1);
  if (/so the last steps were trimmed/.test(line1)) fail("case 1 must not say only the last steps were trimmed");

  // Probe case 2: a long job pushes the cut into what it watches.
  const d2 = { name: "Pickup helper", job: longJob, needs: "Names, dates, or details only you know\nYour Yes before anything is used", watches: "New cards on this desk about pickups, school runs and carpool changes for the whole family every week of the school year including holidays", drafts: "A reply, short and kind", plan: ["Read the message", "Draft a reply", "Remind me"] };
  const ai2 = save(d2);
  const line2 = api.savedLine(d2, { ok: true, ai: ai2 });
  const expect2 = "Only part of what it watches fit. What it drafts and the steps didn't fit.";
  if (ai2.prompt.length > server.prompt || ai2.prompt.indexOf("Needs from the person: Names, dates, or details only you know; Your Yes before anything is used.") < 0) fail("case 2 must keep the needs whole within " + server.prompt);
  if (line2.indexOf(expect2) < 0 || line2.indexOf("AIA kept the first " + server.does + " characters of the job.") < 0) fail("case 2 (long job) must name the lost pieces and the job cut: " + line2.split("\n").pop());
  else pass("case 2 (long job): " + expect2);

  // Steps that partly fit are counted.
  const d4 = { name: "Helper", job: "Drafts replies", needs: "Who picks up", watches: "Texts", drafts: "A reply", plan: lines.slice(0, 20) };
  const line4 = api.savedLine(d4, { ok: true, ai: save(d4) });
  const m4 = line4.match(/Only the first (\d+) of the 20 steps fit\./);
  if (!m4 || /didn't fit/.test(line4)) fail("partly kept steps must be counted, and nothing else listed: " + line4.split("\n").pop());
  else pass("partly kept steps are counted: Only the first " + m4[1] + " of the 20 steps fit.");

  // Nothing that fits gets a trim note.
  const d3 = { name: "Pickup helper", job: "Drafts pickup replies", needs: "Who picks up", watches: "Texts", drafts: "A reply", plan: ["Read", "Draft"] };
  const line3 = api.savedLine(d3, { ok: true, ai: save(d3) });
  if (/AIA kept the first|didn't fit|Only part/.test(line3)) fail("nothing that fits gets a trim note: " + line3);
  else pass("a request that fits gets no trim note");

  // The saved job is shown exactly as stored: no added period.
  const shown = line3.split("\n").filter(function (l) { return l.indexOf("Its job, as saved: ") === 0; })[0];
  if (shown !== "Its job, as saved: Drafts pickup replies") fail("the saved job must be shown with nothing added: " + JSON.stringify(shown));
  else pass("saved job shown exactly as stored, no added period");
  const shown2 = line2.split("\n").filter(function (l) { return l.indexOf("Its job, as saved: ") === 0; })[0];
  if (shown2 !== "Its job, as saved: " + ai2.does) fail("a cut job must be shown exactly as stored: " + JSON.stringify(shown2));
  if (!/done\.style\.whiteSpace = "pre-line"/.test(js)) fail("the after-Yes box must keep the saved job on its own line");
})();

// 10. The trim note uses piece positions and the length really saved (never label searches or a fixed 400).
(function positionsAndRealLength() {
  if (typeof api.summaryMap !== "function") { fail("create-simple.js must expose summaryMap (piece offsets)"); return; }
  if (/indexOf\(piece\.label\)|label: "Watches:"/.test(js)) fail("the trim note must not search the saved text for labels");
  const ais = require(path.join(root, "api", "_ais.js"));
  function save(d) { return ais.publicAi(ais.normalizeAi(api.saveBody(d), "check-ws")); }
  function note(d) { const ai = save(d); return { ai: ai, line: api.savedLine(d, { ok: true, ai: ai }), last: api.savedLine(d, { ok: true, ai: ai }).split("\n").pop() }; }
  const longNeed = "Every name, date, time, address and phone number for each child, each driver and each school, plus who is allowed to pick up which child on which day and what to do when plans change at the last minute or someone is sick or late";
  const job150 = "Reads every school and carpool message, works out who is picking up which child on which day, and drafts a short reply for me to check first";

  // a) Needs typed as "Watches: the bus list", with the cut inside the job: watches are lost, not partly kept.
  const a = note({ name: "Bus helper", job: job150, needs: "Watches: the bus list\n" + longNeed, watches: "School texts", drafts: "A reply", plan: ["Read", "Reply"] });
  const aKept = a.ai.prompt.length;
  const m = api.summaryMap({ job: job150, needs: "Watches: the bus list\n" + longNeed, watches: "School texts", drafts: "A reply", plan: ["Read", "Reply"] });
  const jobPiece = m.pieces[1];
  if (!(jobPiece.start < aKept && aKept < jobPiece.end)) fail("case a setup: the cut must land inside the job (" + jobPiece.start + "-" + jobPiece.end + ", kept " + aKept + ")");
  if (/Only part of what it watches/.test(a.last) || a.last.indexOf("Only part of the job fit.") < 0 || a.last.indexOf("What it watches, what it drafts and the steps didn't fit.") < 0) fail("needs typed as 'Watches: ...' must not count as watches: " + a.last);
  else pass("needs typed as 'Watches: the bus list': job partly kept, watches/drafts/steps lost");

  // b) A job containing "Steps:" while the real steps are lost.
  const b = note({ name: "Steps helper", job: "Steps: read the note, check the calendar, then draft the reply for me to look at", needs: "Who picks up", watches: longNeed, drafts: "A reply", plan: ["Read", "Reply"] });
  if (/steps fit|step fit/.test(b.last) || b.last.indexOf("the steps didn't fit.") < 0) fail("a job containing 'Steps:' must not count as steps: " + b.last);
  else pass("job containing 'Steps:': the real steps are reported lost");

  // c) One 260-character word at about position 401: the page trims to the last whole word; the note says the real kept count.
  const base = { name: "Word helper", job: "Drafts replies", needs: "Who picks up", watches: "Texts", drafts: "", plan: [] };
  const lead = api.promptLength(base);
  const filler = "pad ".repeat(Math.ceil((400 - lead - 12) / 4)).trim();
  const c = { name: base.name, job: base.job, needs: base.needs, watches: base.watches, drafts: filler + "\n" + "w".repeat(260), plan: [] };
  const cMap = api.summaryMap(c);
  const wordAt = cMap.full.indexOf("w".repeat(260));
  const cn = note(c);
  const cKept = cn.ai.prompt.length;
  if (wordAt > 400 || wordAt + 260 <= 400) fail("case c setup: the long word must span the 400 cut (starts at " + wordAt + ")");
  if (cKept >= 400 || cn.last.indexOf("AIA kept the first " + cKept + " characters of the summary.") < 0 || /first 400 characters/.test(cn.last)) fail("the note must report the real kept length (" + cKept + "): " + cn.last);
  else pass("260-character word across the cut: note says the real kept count (" + cKept + "), not 400");
  if (cKept !== api.savedLength(c, cn.ai.prompt)) fail("savedLength must equal the saved prompt length");

  // d) Singular: one step.
  const d1 = note({ name: "One step", job: "Drafts replies", needs: "Who picks up", watches: longNeed + " " + longNeed, drafts: "A reply", plan: ["Read the note"] });
  if (/\b1 steps\b|None of the 1\b/.test(d1.last) || d1.last.indexOf("the step didn't fit.") < 0) fail("one lost step must read 'the step': " + d1.last);
  else pass("one lost step reads 'the step'");
  const two = note({ name: "Two steps", job: "Drafts replies", needs: "Who picks up", watches: "Texts", drafts: "A reply", plan: ["Read the note", "w".repeat(380)] });
  if (/\b1 of\b|\b1 steps\b/.test(two.last) || two.last.indexOf("Only the first of the 2 steps fit.") < 0) fail("one of two steps kept must read 'Only the first of the 2 steps fit.': " + two.last);
  else pass("one of two steps kept reads 'Only the first of the 2 steps fit.'");

  // e) Job echo keeps the trailing space the server stored at character 160.
  const spaceJob = "a".repeat(159) + " and more words after the cut";
  const e = note({ name: "Space job", job: spaceJob, needs: "Who picks up", watches: "Texts", drafts: "A reply", plan: ["Read"] });
  const eShown = e.line.split("\n").filter(function (l) { return l.indexOf("Its job, as saved: ") === 0; })[0];
  if (!/ $/.test(e.ai.does) || eShown !== "Its job, as saved: " + e.ai.does) fail("job echo must keep the stored trailing space: " + JSON.stringify(eShown && eShown.slice(-5)));
  else pass("job echo keeps the trailing space the server stored at 160");

  // f) Edges: job 160 / 161, summary 400 / 401.
  const j160 = note({ name: "J", job: "b".repeat(160), needs: "N", watches: "W", drafts: "D", plan: [] });
  const j161 = note({ name: "J", job: "b".repeat(161), needs: "N", watches: "W", drafts: "D", plan: [] });
  if (/characters of the job/.test(j160.last) || j161.last.indexOf("AIA kept the first " + server.does + " characters of the job.") < 0) fail("job edges: 160 has no note, 161 has the note");
  else pass("job edges: 160 no note, 161 note");
  function sized(n) {
    const d0 = { name: "S", job: "Drafts", needs: "N", watches: "W", drafts: "", plan: [] };
    const room = n - api.promptLength(d0);
    d0.drafts = "x".repeat(room);
    return d0;
  }
  const s400 = sized(400), s401 = sized(401);
  if (api.promptLength(s400) !== 400 || api.promptLength(s401) !== 401) fail("edge setup must give 400 and 401 characters");
  const n400 = note(s400), n401 = note(s401);
  if (/AIA kept the first \d+ characters of the summary/.test(n400.last)) fail("a 400-character summary fits: no trim note");
  if (n401.last.indexOf("AIA kept the first " + n401.ai.prompt.length + " characters of the summary.") < 0) fail("a 401-character summary gets a note with the real kept count: " + n401.last);
  else pass("summary edges: 400 no note, 401 note with the real kept count (" + n401.ai.prompt.length + ")");
})();

if (bad) { console.error(bad + " check(s) failed"); process.exit(1); }
console.log("check-create-open ok");
