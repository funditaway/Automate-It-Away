#!/usr/bin/env node
"use strict";
require("./_env-guard");

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const history = read("history.html");
const histSrc = read("api/_history.js");
const more = read("more.html");
const help = read("help.html");
const yesNo = read("ACCOUNT-YES-NO.md");
const packMd = read("PACK.md");
const pkg = read("package.json");

(function () {
  const m = history.match(/<script>\s*var lane[\s\S]*?<\/script>/);
  if (!m) {
    fail("history.html script must parse: missing History paint script");
    return;
  }
  const tmp = path.join(require("os").tmpdir(), "aia-history-ux-" + Date.now() + ".js");
  fs.writeFileSync(tmp, m[0].replace(/^<script>/, "").replace(/<\/script>$/, ""));
  const syntax = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  try { fs.unlinkSync(tmp); } catch (e) {}
  if (syntax.status !== 0) fail("history.html script must parse: " + (syntax.stderr || syntax.stdout || "syntax error"));
  else pass("history.html script parses");
})();

[
  "What this desk did. Real cards only",
  "id=\"how-history\"",
  "What you see here",
  "More filters",
  "Already done",
  "On the desk",
  "Coming up",
  "Off desk",
  "<button type=\"button\" data-flag=\"cap\">Do this first</button>",
  "<button type=\"button\" data-ex=\"late-cap\">Late, and marked “do this first”</button>",
  "if(flags.cap)bits.push(\"Do this first\");",
  "function threadFace",
  "function paintCards",
  "function toast",
  "function filterCount",
  "Show talk",
  "id=\"refresh\"",
  "id=\"toast\"",
  "Nothing sends from here"
].forEach(function (bit) {
  if (history.indexOf(bit) < 0) fail("history.html missing " + bit);
  else pass("history.html " + bit);
});
["Cap priority", "Late on Cap"].forEach(function (old) {
  if (history.indexOf(old) >= 0) fail("history.html still says " + old);
  else pass("history.html no longer says " + old);
});

// Row 9 (James-approved): each new label appears exactly once, inside its own group.
// "Late, and marked “do this first”" is a Quick find (#examples); "Do this first" is a filter
// flag (#flags) and the summary line. A doubled button, or one moved into the other group, fails.
function rowNine(h) {
  const bad = [];
  const count = (hay, needle) => hay.split(needle).length - 1;
  const block = (id) => {
    const m = h.match(new RegExp('<div class="chips" id="' + id + '">([\\s\\S]*?)</div>'));
    return m ? m[1] : null;
  };
  const LATE = '<button type="button" data-ex="late-cap">Late, and marked “do this first”</button>';
  const FLAG = '<button type="button" data-flag="cap">Do this first</button>';
  const SUM = 'if(flags.cap)bits.push("Do this first");';
  const ex = block("examples"), flags = block("flags");
  if (ex === null) bad.push("Quick finds group #examples missing");
  if (flags === null) bad.push("filter flags group #flags missing");
  if (count(h, "Late, and marked “do this first”") !== 1) bad.push("'Late, and marked “do this first”' must appear exactly once (got " + count(h, "Late, and marked “do this first”") + ")");
  if (count(h, LATE) !== 1) bad.push("the late-cap Quick find button must appear exactly once");
  if (count(h, 'data-ex="late-cap"') !== 1) bad.push("exactly one data-ex=\"late-cap\" button");
  if (count(h, ">Do this first</button>") !== 1) bad.push("the 'Do this first' button must appear exactly once (got " + count(h, ">Do this first</button>") + ")");
  if (count(h, FLAG) !== 1) bad.push("the cap flag button must appear exactly once");
  if (count(h, 'data-flag="cap"') !== 1) bad.push("exactly one data-flag=\"cap\" button");
  if (count(h, 'bits.push("Do this first")') !== 1 || count(h, SUM) !== 1) bad.push("the summary 'Do this first' must appear exactly once, bound to flags.cap");
  if (count(h, "Do this first") !== 2) bad.push("'Do this first' must appear exactly twice: the flag button and the summary (got " + count(h, "Do this first") + ")");
  if (ex !== null && flags !== null) {
    if (count(ex, LATE) !== 1) bad.push("the late-cap button must sit inside Quick finds (#examples)");
    if (flags.indexOf("Late, and marked") >= 0 || flags.indexOf("late-cap") >= 0) bad.push("the late-cap button must not sit in the filter flags");
    if (count(flags, FLAG) !== 1) bad.push("the 'Do this first' button must sit inside the filter flags (#flags)");
    if (ex.indexOf("Do this first<") >= 0 || ex.indexOf('data-flag="cap"') >= 0) bad.push("the 'Do this first' flag must not sit in Quick finds");
    if (ex.indexOf('<button type="button" data-ex="money-hand">Money handed off</button>\n' + LATE + '\n<button type="button" data-ex="ext">Off the desk</button>') < 0) bad.push("the late-cap button must keep its place (after Money handed off, before Off the desk)");
    if (flags.indexOf('<button type="button" data-flag="files">Files</button>\n' + FLAG + '\n<button type="button" data-flag="missing">Missing</button>') < 0) bad.push("the 'Do this first' flag must keep its place (after Files, before Missing)");
  }
  const qf = h.indexOf('<details class="fold" id="quick-fold">'), qfEnd = h.indexOf("</details>", qf);
  const lateAt = h.indexOf(LATE);
  if (!(qf >= 0 && lateAt > qf && lateAt < qfEnd)) bad.push("the late-cap button must stay inside the Quick finds fold");
  const adv = h.indexOf('<div class="adv" id="adv-box"'), flagAt = h.indexOf(FLAG);
  if (!(adv >= 0 && flagAt > adv && flagAt < h.indexOf('<div class="logic" id="logic">'))) bad.push("the 'Do this first' flag must stay inside the filters box");
  return bad;
}
(function () {
  const bad = rowNine(history);
  if (bad.length) bad.forEach((b) => fail("history.html row 9: " + b));
  else pass("history.html row 9 labels appear exactly once, each inside its own group");
  const LATE = '<button type="button" data-ex="late-cap">Late, and marked “do this first”</button>';
  const FLAG = '<button type="button" data-flag="cap">Do this first</button>';
  const cut = (h, x) => h.split(x + "\n").join("");
  const muts = [
    ["doubled flag button", (h) => h.split(FLAG).join(FLAG + "\n" + FLAG)],
    ["doubled late-cap button", (h) => h.split(LATE).join(LATE + "\n" + LATE)],
    ["late-cap moved into the flags", (h) => cut(h, LATE).split(FLAG).join(FLAG + "\n" + LATE)],
    ["flag moved into Quick finds", (h) => cut(h, FLAG).split(LATE).join(LATE + "\n" + FLAG)],
    ["flag copied into Quick finds", (h) => h.split(LATE).join(LATE + "\n" + FLAG)],
    ["late-cap copied into the flags", (h) => h.split(FLAG).join(FLAG + "\n" + LATE)],
    ["flag reordered in its group", (h) => cut(h, FLAG).split('<button type="button" data-flag="audit">Audit only</button>').join('<button type="button" data-flag="audit">Audit only</button>\n' + FLAG)],
    ["late-cap reordered in its group", (h) => cut(h, LATE).split('<button type="button" data-ex="stopped">Stopped</button>').join('<button type="button" data-ex="stopped">Stopped</button>\n' + LATE)],
    ["late-cap moved out of the fold", (h) => cut(h, LATE).split('<p class="meta">When</p>').join(LATE + '\n<p class="meta">When</p>')],
    ["summary doubled", (h) => h.split('if(flags.cap)bits.push("Do this first");').join('if(flags.cap)bits.push("Do this first");if(flags.cap)bits.push("Do this first");')],
    ["label in a third place", (h) => h.split('<p class="meta">When</p>').join('<p class="meta">When · Do this first</p>')]
  ];
  let caught = 0;
  muts.forEach(([name, fn]) => {
    const m = fn(history);
    if (m === history) { fail("row 9 mutant does not apply: " + name); return; }
    if (rowNine(m).length) caught += 1;
    else fail("row 9 mutant NOT caught: " + name);
  });
  if (caught === muts.length) pass("row 9 mutants caught " + caught + "/" + muts.length);
})();

if (history.indexOf("not on this desk") < 0) {
  fail("History must say when a named desk AI is not on this desk");
} else pass("History says when a named desk AI is not on this desk");
if (history.indexOf("Needs you") < 0) {
  fail("History must keep Needs you");
} else pass("History keeps Needs you");
if (history.indexOf("XAI_API_KEY") >= 0 || /\bthis box\b/.test(history)) {
  fail("History must not name XAI_API_KEY / this box");
} else if (history.indexOf("A Desk AI can't draft on this phone yet.") < 0 || history.indexOf("Could not reach the desk.") < 0) {
  fail("History drafts-off must use Desk AI voice");
} else pass("History drafts-off uses Desk AI voice");
if (yesNo.indexOf("Counter Desk AI voice leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must record Counter Desk AI voice leftover");
} else pass("ACCOUNT-YES-NO records Counter Desk AI voice leftover");
if (history.indexOf("Give is the file") < 0) {
  fail("History must keep Give is the file");
} else pass("History keeps Give is the file");
if (history.indexOf("Collect HOLD") >= 0 || /\$\d|price|charge/i.test(history)) {
  fail("History must stay quiet on Collect and price");
} else pass("History stays quiet on Collect");
if (history.indexOf("Yes / Stop / Kill") < 0 || history.indexOf("You still tap Yes or Stop") < 0) {
  fail("History must keep Yes / Stop on cards");
} else pass("History keeps Yes / Stop");
if (history.indexOf("function viaLabel") < 0 || history.indexOf("it.decide") < 0) {
  fail("History must paint via + decide tags");
} else pass("History paints via + decide tags");
if (history.indexOf("Nothing on this trail yet") < 0) {
  fail("empty History with no filters must say the trail is empty");
} else pass("empty History with no filters is honest");
if (history.indexOf("Nothing matches these filters") < 0) {
  fail("empty History with filters must say nothing matches");
} else pass("filtered empty History is honest");
if (history.indexOf("Clear filters only when a filter hid the trail") < 0) {
  fail("History must not offer Clear filters on a truly empty trail");
} else pass("Clear filters only when a filter hid the trail");
if (history.indexOf('id="clear-view" hidden') < 0 && history.indexOf("clr.hidden=n<1") < 0) {
  fail("History toolbar Clear filters must hide when no filter is on");
} else pass("History toolbar Clear filters hides when no filter is on");
if (history.indexOf("clr.hidden=n<1") < 0) {
  fail("paint() must hide #clear-view when filterCount is 0");
} else pass("paint() hides #clear-view when filterCount is 0");
if (history.indexOf("You still tap Yes or Stop") < 0 || history.indexOf("Nothing on this trail yet") < 0) {
  fail("empty History must stay honest and keep Yes or Stop");
} else pass("empty History stays honest");
if (history.indexOf("XAI_API_KEY") >= 0 || history.indexOf("this box") >= 0 || history.indexOf("draft key") >= 0) {
  fail("History must not name XAI_API_KEY / this box / draft key");
} else pass("History drafts-off uses Desk AI voice");
if (history.indexOf("Checking whether a Desk AI can draft on this phone") < 0) {
  fail("History checking line must use Desk AI voice");
} else pass("History checking line uses Desk AI voice");
if (history.indexOf("A Desk AI can't draft on this phone yet.") < 0 || history.indexOf("A Desk AI can draft.") < 0) {
  fail("History aia-line must use Desk AI drafts-on / drafts-off voice");
} else pass("History aia-line uses Desk AI drafts-on / drafts-off voice");
if (history.indexOf("Could not reach the desk.") < 0) {
  fail("History fail notes must say Could not reach the desk");
} else pass("History fail notes use desk, not box");
if (history.indexOf("Grok drafts are on") >= 0) {
  fail("History aia-line must not dump Grok crew notes");
} else pass("History aia-line drops Grok crew notes");
if (histSrc.indexOf("function viaOf") < 0 || histSrc.indexOf("function whoOf") < 0) {
  fail("_history must expose viaOf / whoOf");
} else pass("_history exposes viaOf / whoOf");
if (yesNo.indexOf("History drafted-card trail leftover") < 0) {
  fail("ACCOUNT-YES-NO must name History drafted-card trail leftover");
} else pass("ACCOUNT-YES-NO names History drafted-card trail leftover");
if (yesNo.indexOf("History drafts-off leftover after that pass") < 0) {
  fail("ACCOUNT-YES-NO must name History drafts-off leftover");
} else pass("ACCOUNT-YES-NO names History drafts-off leftover");
if (packMd.indexOf("History drafts-off leftover:") < 0) {
  fail("PACK.md must name History drafts-off leftover");
} else pass("PACK.md names History drafts-off leftover");

if (histSrc.indexOf('ext: "Off desk"') < 0) fail("laneLabel must say Off desk");
else pass("laneLabel says Off desk");

if (more.indexOf("real cards only") < 0) fail("more.html History must lead with simple words");
else pass("more.html History leads with simple words");
if (more.indexOf("This account’s past / now / next") < 0 || more.indexOf("Give is the file") < 0) {
  fail("more.html must keep account roadmap honesty");
} else pass("more.html keeps account roadmap honesty");

if (help.indexOf("What this desk did") < 0) fail("help.html History FAQ must use simple words");
else pass("help.html History FAQ uses simple words");
if (help.indexOf("this account’s roadmap") < 0 || help.indexOf("Give is the file") < 0) {
  fail("help.html must keep History roadmap honesty");
} else pass("help.html keeps History roadmap honesty");

if (yesNo.indexOf("check-history-ux.js") < 0) fail("ACCOUNT-YES-NO must record History UX");
else pass("ACCOUNT-YES-NO records History UX");
if (pkg.indexOf("check-history-ux.js") < 0) fail("package.json must run check-history-ux");
else pass("package.json runs check-history-ux");

if (failed) {
  console.error("\n" + failed + " History UX check(s) failed");
  process.exit(1);
}
console.log("\nHistory UX checks passed");
