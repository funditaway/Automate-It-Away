require("./_env-guard");
// check-card-thread: card-thread.js renders one card as one chat thread.
// - every actorKind maps to its plain tag (SI, AI, You, Helper, Family, Employee, Outside)
// - with no actorKind the tag falls back to the label the card already uses
// - each input is paired with the output that answered it
// - a stranger's view never shows a person's name (desk-card.js passes stranger for non-owners)
// - the thread fits a 390px screen (no fixed widths, long words wrap, one column)
// Plus: wired into the desk card sheet and npm test; no payment or Grok wording; desk.html untouched.
// Every rule has a mutant below that must be caught.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const SRC = { "card-thread.js": read("card-thread.js"), "desk-card.js": read("desk-card.js"), "package.json": read("package.json") };

let PWN = null; // what a browser would run if HTML were parsed
function fakeDoc() {
  const byId = {};
  const parse = (html) => { if (/<script|on\w+\s*=|javascript:/i.test(String(html))) PWN.hit = true; };
  function mk(tag) {
    const n = {
      tagName: String(tag).toUpperCase(), children: [], attrs: {}, className: "", _t: "", id: "",
      appendChild(c) { n.children.push(c); if (c.id) byId[c.id] = c; return c; },
      setAttribute(k, v) { n.attrs[k] = String(v); if (/^on/i.test(k)) PWN.hit = true; },
      insertAdjacentHTML(_, h) { parse(h); }
    };
    Object.defineProperty(n, "innerHTML", { get: () => "", set: (v) => { parse(v); n._t = String(v).replace(/<[^>]*>/g, ""); n.children = []; } });
    Object.defineProperty(n, "outerHTML", { get: () => "", set: (v) => parse(v) });
    Object.defineProperty(n, "textContent", {
      get: () => n._t + n.children.map((c) => c.textContent).join(" "),
      set: (v) => { n._t = String(v); n.children = []; }
    });
    return n;
  }
  const head = mk("head"), body = mk("body");
  return { head, body, createElement: mk, getElementById: (id) => byId[id] || null, _byId: byId };
}
function load(src) {
  const win = { console, document: { write: (h) => PWN && (PWN.hit = true) } };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(src, win, { filename: "card-thread.js", timeout: 2000 });
  return win.AIACardThread;
}
function all(n, cls) {
  const out = [];
  (function walk(x) { if (String(x.className || "").split(" ").indexOf(cls) >= 0) out.push(x); (x.children || []).forEach(walk); })(n);
  return out;
}

const OWNER = "Jordan Rivera";
const CARD = {
  title: "Fix the kitchen sink", from: "drop", createdAt: "2026-11-01T10:00:00Z",
  thread: [
    { at: "2026-11-01T10:01:00Z", from: "Grok", kind: "rec", text: "Call a plumber this week." },
    { at: "2026-11-01T10:02:00Z", from: OWNER, kind: "tell", text: "Ask for Tuesday morning." },
    { at: "2026-11-01T10:03:00Z", from: "desk ai", kind: "rec", text: "Draft: Can you come Tuesday at 9?" },
    { at: "2026-11-01T10:04:00Z", from: "desk ai", kind: "note", text: "A second draft, shorter." },
    { at: "2026-11-01T10:05:00Z", from: "Sam", actorKind: "family", kind: "note", text: "I will be home Tuesday." }
  ],
  replies: [{ at: "2026-11-01T10:06:00Z", from: "Plumber Co", text: "Tuesday at 9 works." }]
};

// Real GET /api/jobs (readTalk) rows from Probe #466 (726dbfce): every row has input:"" and output:"".
// The helper copy is server-masked: human rows come as from/actorLabel "You".
const READTALK = {"owner":{"text":"Fix the kitchen sink","title":"Fix the kitchen sink","from":"Zelda Ownerperson","createdAt":"2026-11-01T10:00:00Z","thread":[{"at":"2026-11-01T10:00:30Z","from":"Zelda Ownerperson","actorKind":"human","actorLabel":"Zelda Ownerperson","kind":"tell","text":"T-OWNOWN owner wrote this <img src=x onerror=window.__pwn=1>","input":"","output":""},{"at":"2026-11-01T10:01:00Z","from":"Grok","kind":"rec","actorKind":"ai","actorLabel":"Grok","text":"T-AI Call a plumber this week.","input":"","output":""},{"at":"2026-11-01T10:02:00Z","from":"Quincy Helperman","actorKind":"helper","actorLabel":"Quincy Helperman","kind":"tell","text":"T-HELPER I can call at noon. <script>window.__pwn=1</script>","input":"","output":""},{"at":"2026-11-01T10:03:00Z","from":"Switchy","actorKind":"si","actorLabel":"Switchy","kind":"rec","text":"T-SI SupercalifragilisticexpialidociousSupercalifragilisticexpialidociousSupercalifragilisticexpialidociousSupercalifragilisticexpialidociousSupercalifragilisticexpialidociousSupercalifragilisticexpialidociousSupercalifragilisticexpialidociousSupercalifragilisticexpialidocious and a long message that should wrap nicely on a phone screen without pushing sideways.","input":"","output":""},{"at":"2026-11-01T10:04:00Z","from":"Wendy Familyname","actorKind":"family","actorLabel":"Wendy Familyname","kind":"note","text":"T-FAMILY Home Tuesday.","input":"","output":""},{"at":"2026-11-01T10:05:00Z","from":"Eddie Staffer","actorKind":"employee","actorLabel":"Eddie Staffer","kind":"note","text":"T-EMPLOYEE Parts ordered.","input":"","output":""},{"at":"2026-11-01T10:06:00Z","from":"Harriet Humanfriend","actorKind":"human","actorLabel":"Harriet Humanfriend","kind":"note","text":"T-HUMANFRIEND Need a hand?","input":"","output":""},{"at":"2026-11-01T10:06:30Z","from":"Widget Dropper","actorKind":"ext","actorLabel":"Widget Dropper","kind":"note","text":"T-EXT outside drop came in","input":"","output":""},{"at":"2026-11-01T10:07:00Z","from":"drop","kind":"note","text":"T-LEGACY-DROP legacy drop row","actorKind":"ext","actorLabel":"drop","input":"","output":""},{"at":"2026-11-01T10:07:30Z","from":"grok","kind":"rec","text":"T-LEGACY-GROK legacy ai row","actorKind":"ai","actorLabel":"grok","input":"","output":""},{"at":"2026-11-01T10:08:00Z","from":"Nora Nullkind","kind":"note","text":"T-LEGACY-NAME legacy named row","actorKind":"human","actorLabel":"Nora Nullkind","input":"","output":""}],"replies":[{"at":"2026-11-01T10:09:00Z","from":"Plumber Co","text":"T-REPLY Tuesday at 9 works.","actorKind":"human","actorLabel":"Plumber Co","input":"","output":""}]},"helper":{"text":"Fix the kitchen sink","title":"Fix the kitchen sink","from":"Zelda Ownerperson","createdAt":"2026-11-01T10:00:00Z","thread":[{"at":"2026-11-01T10:00:30Z","from":"You","actorKind":"human","actorLabel":"You","kind":"tell","text":"T-OWNOWN owner wrote this <img src=x onerror=window.__pwn=1>","input":"","output":""},{"at":"2026-11-01T10:01:00Z","from":"AI","kind":"rec","actorKind":"ai","actorLabel":"AI","text":"T-AI Call a plumber this week.","input":"","output":""},{"at":"2026-11-01T10:02:00Z","from":"helper","actorKind":"helper","actorLabel":"helper","kind":"tell","text":"T-HELPER I can call at noon. <script>window.__pwn=1</script>","input":"","output":""},{"at":"2026-11-01T10:03:00Z","from":"SI","actorKind":"si","actorLabel":"SI","kind":"rec","text":"T-SI SupercalifragilisticexpialidociousSupercalifragilisticexpialidociousSupercalifragilisticexpialidociousSupercalifragilisticexpialidociousSupercalifragilisticexpialidociousSupercalifragilisticexpialidociousSupercalifragilisticexpialidociousSupercalifragilisticexpialidocious and a long message that should wrap nicely on a phone screen without pushing sideways.","input":"","output":""},{"at":"2026-11-01T10:04:00Z","from":"family","actorKind":"family","actorLabel":"family","kind":"note","text":"T-FAMILY Home Tuesday.","input":"","output":""},{"at":"2026-11-01T10:05:00Z","from":"employee","actorKind":"employee","actorLabel":"employee","kind":"note","text":"T-EMPLOYEE Parts ordered.","input":"","output":""},{"at":"2026-11-01T10:06:00Z","from":"You","actorKind":"human","actorLabel":"You","kind":"note","text":"T-HUMANFRIEND Need a hand?","input":"","output":""},{"at":"2026-11-01T10:06:30Z","from":"ext","actorKind":"ext","actorLabel":"ext","kind":"note","text":"T-EXT outside drop came in","input":"","output":""},{"at":"2026-11-01T10:07:00Z","from":"ext","kind":"note","text":"T-LEGACY-DROP legacy drop row","actorKind":"ext","actorLabel":"ext","input":"","output":""},{"at":"2026-11-01T10:07:30Z","from":"AI","kind":"rec","text":"T-LEGACY-GROK legacy ai row","actorKind":"ai","actorLabel":"AI","input":"","output":""},{"at":"2026-11-01T10:08:00Z","from":"You","kind":"note","text":"T-LEGACY-NAME legacy named row","actorKind":"human","actorLabel":"You","input":"","output":""}],"replies":[{"at":"2026-11-01T10:09:00Z","from":"You","text":"T-REPLY Tuesday at 9 works.","actorKind":"human","actorLabel":"You","input":"","output":""}]},"viewer":"Zelda Ownerperson"};
function suite(S) {
  const f = [];
  PWN = { hit: false };
  const ok = (c, m) => { if (!c) f.push(m); };
  let T;
  try { T = load(S["card-thread.js"]); } catch (e) { return ["card-thread.js does not run: " + e.message]; }
  if (!T) return ["card-thread.js must expose window.AIACardThread"];
  // 1. actorKind -> tag
  // Switch's exact actorKind values (api/_talk.js, draft #460); human is handled below
  const WANT = { si: "SI", ai: "AI", helper: "Helper", family: "Family", employee: "Employee", ext: "Outside" };
  Object.keys(WANT).forEach((k) => {
    ok(T.tagOf({ actorKind: k, from: "Someone Else" }) === WANT[k], "actorKind " + k + " -> " + WANT[k] + " (got " + T.tagOf({ actorKind: k, from: "Someone Else" }) + ")");
    ok(T.tagOf({ actorKind: k.toUpperCase(), from: "x" }, { stranger: true }) === WANT[k], "actorKind " + k + " in capitals still -> " + WANT[k]);
  });
  ok(T.tagOf({ actorKind: "ai", from: "Grok" }) === "AI" && T.tagOf({ actorKind: "si", from: "Grok" }) === "SI", "actorKind wins over the from label");
  ok(T.tagOf({ actorKind: "employee", from: "drop" }) === "Employee", "actorKind wins over the desk's own You");
  // ext always reads Outside, never You, whoever is looking and whatever the row's from says
  [{ actorKind: "ext", from: "drop" }, { actorKind: "ext", from: "", own: true }, { actorKind: "EXT", from: "Pat" }, { actorKind: "ext", from: "you" }].forEach((row) => {
    [undefined, { stranger: true }, { viewer: "pat" }].forEach((o) => ok(T.tagOf(row, o) === "Outside", "ext reads Outside, never You (" + JSON.stringify(row) + " " + JSON.stringify(o) + " -> " + T.tagOf(row, o) + ")"));
  });
  // human and friend never show a name to non-owners
  const NAMES = [{ actorKind: "human", from: "Sam Lee" }, { actorKind: "human", from: "Sam Lee", actorLabel: "Sam Lee" }, { actorKind: "human", from: "Sam Lee", actorLabel: "Friend: Sam Lee" }, { actorKind: "human", from: "Sam Lee", whoKind: "friend" }, { from: "Sam Lee", whoKind: "friend" }, { from: "Sam Lee", droppedByKind: "friend" }, { actorKind: "friend", from: "Sam Lee" }];
  NAMES.forEach((row) => { const t = T.tagOf(row, { stranger: true }); ok(!/Sam|Lee/.test(t), "non-owners never see a human or friend name (" + JSON.stringify(row) + " -> " + t + ")"); });
  const fr = T.build({ title: "hi", from: "drop", thread: NAMES.map((r, i) => Object.assign({ at: "2026-11-01T10:0" + i + ":00Z", text: "row " + i, kind: "tell" }, r)) }, { document: fakeDoc(), stranger: true });
  ok(!/Sam|Lee/.test(fr.textContent), "the whole thread shows no human or friend name to non-owners");
  // human: You on the viewer's own row; else actorLabel / current label; never a name for non-owners
  ok(T.tagOf({ actorKind: "human", from: "drop" }) === "You" && T.tagOf({ actorKind: "human", from: "Pat", own: true }) === "You", "human on the viewer's own row -> You");
  ok(T.tagOf({ actorKind: "human", from: "Pat" }, { viewer: "pat" }) === "You", "human whose from is the viewer -> You");
  ok(T.tagOf({ actorKind: "human", from: "Sam", actorLabel: "Sam (friend)" }) === "Sam (friend)", "human, not own, owner's view -> actorLabel");
  ok(T.tagOf({ actorKind: "human", from: "Sam" }) === "Sam", "human with no actorLabel -> the current label");
  ok(T.tagOf({ actorKind: "human", from: "Sam", actorLabel: "Sam (friend)" }, { stranger: true }) === "Helper", "human, not own, stranger's view -> no name (Helper)");
  ok(T.tagOf({ actorKind: "HUMAN", from: "drop" }) === "You", "human in capitals still works");
  ok(T.tagOf({ actorKind: "you", from: "Pat" }) === "Pat" && T.tagOf({ actorKind: "outside", from: "Pat" }) === "Pat", "values Switch does not send (you, outside) fall back");
  // 2. fallback when actorKind is missing: the card's current label
  ok(T.tagOf({ from: "Grok" }) === "AI", "fallback: an AI from -> AI");
  ok(T.tagOf({ from: "drop" }) === "You" && T.tagOf({ from: "" }) === "You", "fallback: the desk itself -> You");
  ok(T.tagOf({ from: "Maria" }) === "Maria", "fallback: the owner's own view keeps the current label (got " + T.tagOf({ from: "Maria" }) + ")");
  ok(T.tagOf({ from: "x", whoKind: "family" }) === "Family", "fallback: whoKind family -> Family");
  ok(T.tagOf({ actorKind: "", from: "Grok" }) === "AI", "an empty actorKind falls back");
  ok(T.tagOf({ actorKind: "robot", from: "Maria" }) === "Maria", "an unknown actorKind falls back, it is not shown raw");
  // 3. pairing
  const E = T.entries(CARD);
  const flat = E.map((e) => (e.input ? e.input.tag + ":" + e.input.text : "-") + " => " + (e.output ? e.output.tag + ":" + e.output.text : "-"));
  const WANTP = [
    "You:Fix the kitchen sink => AI:Call a plumber this week.",
    OWNER + ":Ask for Tuesday morning. => AI:Draft: Can you come Tuesday at 9?",
    "- => AI:A second draft, shorter.",
    "Family:I will be home Tuesday. => -",
    "Outside:Tuesday at 9 works. => -"
  ];
  ok(JSON.stringify(flat) === JSON.stringify(WANTP), "input and output pair up in order:\n    got  " + JSON.stringify(flat) + "\n    want " + JSON.stringify(WANTP));
  const io = T.entries({ thread: [{ at: "2026-11-01T10:00:00Z", actorKind: "ai", actorLabel: "AI", input: "What is due?", output: "Rent on Friday.", from: "Grok", kind: "rec" }, { at: "2026-11-01T10:00:05Z", actorKind: "employee", input: "Paid it.", from: "Lee" }] });
  ok(io.length === 2 && io[0].input && io[0].input.text === "What is due?" && io[0].output && io[0].output.text === "Rent on Friday." && io[1].input && io[1].input.text === "Paid it." && !io[1].output, "Switch's {input, output} row is one entry, input then output");
  ok(T.entries({ thread: [{ at: "2026-11-01T10:00:01Z", from: "drop", kind: "tell", text: "q" }, { at: "2026-11-01T10:00:02Z", actorKind: "human", from: "Sam", kind: "rec", text: "me too" }] }).length === 2, "a human row is an input, not an answer");
  ok(T.entries({ thread: [{ at: "2026-11-01T10:00:02Z", from: "Grok", kind: "rec", text: "late" }, { at: "2026-11-01T10:00:01Z", from: "drop", kind: "tell", text: "early" }] }).length === 1, "rows pair by time, not by array order");
  const rec = T.entries({ thread: [{ at: "2026-11-01T10:00:01Z", from: "drop", kind: "tell", text: "q" }, { at: "2026-11-01T10:00:02Z", from: "Planner", kind: "rec", text: "a" }] });
  ok(rec.length === 1 && rec[0].output && rec[0].output.text === "a", "a rec row is an output, whoever wrote it");
  const reuse = T.entries({ entries: [{ input: { actorKind: "human", own: true, text: "Plan a trip" }, output: { actorKind: "ai", text: "Here is a plan." } }] });
  ok(reuse.length === 1 && reuse[0].input.tag === "You" && reuse[0].output.tag === "AI", "rows not yet saved (Bring your AI preview) render through the same path");
  // build: one li per entry, input then output, wait line when no output
  const doc = fakeDoc();
  const list = T.build(CARD, { document: doc });
  const lis = all(list, "ct-entry");
  ok(lis.length === 5, "one thread entry per pair (" + lis.length + ")");
  ok(lis[0] && lis[0].children[0].className === "ct-in" && lis[0].children[1].className === "ct-out", "an entry shows its input, then its output");
  ok(lis[3] && /No reply yet\./.test(lis[3].textContent), "an input with no output says No reply yet.");
  ok(lis[2] && lis[2].children.length === 1 && lis[2].children[0].className === "ct-out", "an output with no input stands alone");
  // 4. no owner names for strangers
  const sdoc = fakeDoc();
  const st = T.build(CARD, { document: sdoc, stranger: true });
  ok(st.textContent.indexOf("Jordan") < 0 && st.textContent.indexOf("Rivera") < 0, "a stranger's view never shows the owner's name");
  ok(st.textContent.indexOf("Plumber Co") < 0 && st.textContent.indexOf("Sam") < 0, "a stranger's view shows no other names either");
  const tags = all(st, "ct-tag").map((n) => n.textContent);
  ok(tags.length && tags.every((t) => ["SI", "AI", "You", "Helper", "Family", "Employee", "Outside"].indexOf(t) >= 0), "a stranger's view shows only the seven tags (" + tags.join(",") + ")");
  ok(/stranger:\s*sheetHidesNames\(\),/.test(S["desk-card.js"]) && /function sheetHidesNames\(\) \{ return typeof role === "undefined" \|\| role !== "owner"; \}/.test(S["desk-card.js"]), "desk-card.js passes stranger for anyone who is not the owner (blank role too)");
  // 4b. message text and tags are rendered as text, never as HTML (owner and helper views)
  const EVIL = "<img src=x onerror=window.__pwn=1><script>window.__pwn=1</script>";
  const HOSTILE = { title: EVIL, from: "drop", createdAt: "2026-11-01T10:00:00Z", thread: [
    { at: "2026-11-01T10:01:00Z", actorKind: "ai", from: "Grok", kind: "rec", text: EVIL },
    { at: "2026-11-01T10:02:00Z", actorKind: "human", actorLabel: EVIL, from: EVIL, kind: "tell", text: "hi" },
    { at: "2026-11-01T10:03:00Z", actorKind: "ext", input: EVIL, output: EVIL }] };
  [false, true].forEach((stranger) => {
    PWN.hit = false;
    const hd = fakeDoc();
    const out = T.build(HOSTILE, { document: hd, stranger });
    const who = stranger ? "helper" : "owner";
    ok(!PWN.hit, "the " + who + " view never parses card text as HTML (window.__pwn stays unset)");
    const texts = all(out, "ct-text").map((x) => x._t);
    ok(texts.length >= 4 && texts.filter((t) => t === EVIL).length >= 3, "the " + who + " view shows hostile text literally, escaped (" + texts.length + ")");
    const tg = all(out, "ct-tag").map((x) => x._t);
    ok(stranger ? tg.indexOf(EVIL.slice(0, 40)) < 0 : tg.indexOf(EVIL.slice(0, 40)) >= 0, "a hostile label is " + (stranger ? "hidden" : "shown as plain text") + " in the " + who + " view");
  });
  ok(!/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write|\beval\(|new Function/.test(S["card-thread.js"]), "card-thread.js has no HTML-parsing path (textContent only)");
  // 5. layout at 390
  const cssNode = doc.getElementById("card-thread-css");
  const css = cssNode ? cssNode._t : "";
  ok(!!css, "card-thread.js adds its own styles");
  ok(/\.ct-text\{[^}]*overflow-wrap:anywhere/.test(css), "long words wrap at 390 (overflow-wrap:anywhere on the text)");
  ok(/\.ct-in,\.card-thread \.ct-out\{[^}]*max-width:min\(100%,640px\)/.test(css), "each bubble is at most the screen wide (max-width:min(100%,640px))");
  ok(/\.card-thread\{[^}]*flex-direction:column/.test(css) && /\.ct-entry\{[^}]*flex-direction:column/.test(css), "one column: input above output");
  ok(/\.ct-entry\{[^}]*min-width:0/.test(css) && /\.ct-out\{[^}]*min-width:0|\.ct-in,\.card-thread \.ct-out\{[^}]*min-width:0/.test(css), "flex children may shrink below their text (min-width:0)");
  ok(!/\.ct-tag\{[^}]*(display:none|visibility:hidden|opacity:0|font-size:0|width:0)/.test(css), "the who-did-it tag is visible");
  ok(/\.ct-text\{[^}]*white-space:pre-wrap/.test(css) && !/white-space:(pre|nowrap)(;|\})/.test(css), "text wraps (pre-wrap, never pre or nowrap)");
  ok(!/position:(absolute|fixed)/.test(css), "nothing is pulled out of the flow (no absolute or fixed)");
  // every margin, padding, offset, indent or shift stays small, so text never pushes past a 390 screen
  const OFF = /(?:^|[;{])\s*(margin(?:-left|-right)?|padding(?:-left|-right)?|left|right|text-indent|inset|translate|transform|gap|border(?:-left|-right)?-width)\s*:([^;}]*)/g;
  const big = [];
  let mm;
  while ((mm = OFF.exec(css))) { (mm[2].match(/-?\d+(?:\.\d+)?(px|em|rem|vw|ch|%)/g) || []).forEach((v) => { const n = parseFloat(v), u = v.replace(/[-\d.]/g, ""); const px = u === "px" ? n : u === "em" || u === "rem" ? n * 16 : u === "ch" ? n * 8 : u === "vw" ? n * 3.9 : n * 3.9; if (Math.abs(px) > 24) big.push(mm[1] + ":" + v); }); }
  ok(!big.length, "no margin, padding or offset over 24px on the thread (" + big.join(",") + ")");
  const tx = (/\.ct-text\{([^}]*)\}/.exec(css) || ["", ""])[1];
  ok(/(^|;)margin:0(;|$)/.test(tx) && !/margin-|padding|left|right|text-indent|transform|width/.test(tx), ".ct-text has no margin, offset or width of its own (" + tx + ")");
  const allpx = (css.match(/(?:width|min-width|max-width|flex-basis|flex):[^;}]*/g) || []).filter((d) => (d.match(/(\d+)px/g) || []).some((v) => parseInt(v, 10) > 358) && !/max-width:min\(100%,640px\)/.test(d));
  ok(!allpx.length, "no width, min-width or flex-basis wider than a 390 screen (" + allpx.join(",") + ")");
  const wide = (css.match(/(?:^|[;{])(?:width|min-width):\s*(\d+)px/g) || []).map((m) => +m.replace(/\D/g, "")).filter((n) => n > 358);
  ok(!wide.length, "no fixed width wider than a 390 screen (" + wide.join(",") + ")");
  // 6. wiring and words
  ok(S["desk-card.js"].indexOf('"<div id=\\"card-thread-sheet\\"></div>" +') >= 0 && /AIACardThread\.mount\("card-thread-sheet", j, opts\)/.test(S["desk-card.js"]) && S["desk-card.js"].indexOf("  mountCardThread(j);\n") >= 0, "the desk card sheet mounts the thread");
  ok(/s\.src = "card-thread\.js"/.test(S["desk-card.js"]), "desk-card.js loads card-thread.js itself (desk.html stays as it is)");
  const shown = (S["card-thread.js"].match(/textContent = "([^"]*)"/g) || []).join(" ");
  ok(!/grok|pay|charge|collect|money|\$/i.test(shown), "no payment or Grok wording on screen (" + shown + ")");
  // Real readTalk rows: 11 thread rows + 1 reply all render (input:"" / output:"" is not an {input,output} row).
  const seeded = READTALK.owner.thread.concat(READTALK.owner.replies).map((r) => String(r.text).replace(/\s+/g, " ").trim());
  [["owner", READTALK.owner, { viewer: READTALK.viewer }], ["helper", READTALK.helper, { stranger: true, viewer: "Quincy Helperman" }]].forEach(([who, card, o]) => {
    const es = T.entries(card, o) || [];
    const sides = [].concat.apply([], es.map((e) => [e.input, e.output].filter(Boolean)));
    const texts = sides.map((x) => x.text);
    ok(seeded.length === 12 && seeded.every((t) => texts.indexOf(t) >= 0) && sides.length === 13, who + ": all 12 readTalk rows render (got " + sides.length + " sides, 13 with the card text)");
    const tagOfText = (t) => (sides.find((x) => x.text === t) || {}).tag;
    if (who === "helper") {
      ok(sides.every((x) => x.tag !== "You"), "helper: no row reads You (" + sides.map((x) => x.tag).join(",") + ")");
      ok(READTALK.helper.thread.concat(READTALK.helper.replies).filter((r) => r.actorKind === "human").every((r) => tagOfText(String(r.text).trim()) === "Helper"), "helper: masked human rows read Helper");
      ok(T.tagOf({ actorKind: "human", from: "drop", actorLabel: "You" }, { stranger: true }) === "Helper" && T.tagOf({ from: "drop" }, { stranger: true }) === "Helper" && T.tagOf({ from: "You" }, { stranger: true }) === "Helper", "helper: masked You / from=drop never read You");
    } else {
      const rows = READTALK.owner.thread.concat(READTALK.owner.replies);
      const mine = rows.filter((r) => r.actorKind === "human" && r.from === READTALK.viewer), others = rows.filter((r) => r.actorKind === "human" && r.from !== READTALK.viewer);
      ok(mine.length > 0 && mine.every((r) => tagOfText(String(r.text).trim()) === "You") && tagOfText(READTALK.owner.text) === "You", "owner: own rows (and their own card text) read You");
      ok(others.length > 0 && others.every((r) => { const t = tagOfText(String(r.text).trim()); return t !== "You" && t === r.actorLabel; }), "owner: other people's rows keep their label, never You");
    }
  });
  ok(/viewer: typeof youName === "string" \? youName : ""/.test(S["desk-card.js"]), "desk-card.js passes the signed-in name as viewer");
  let pkg = ""; try { pkg = JSON.parse(S["package.json"]).scripts.test; } catch (e) {}
  ok(/node scripts\/check-owner-key-only\.js && node scripts\/check-owner-key-only-mutants\.js && node scripts\/check-card-thread-actor\.js && node scripts\/check-card-thread-actor-mutants\.js && node scripts\/check-card-thread\.js$/.test(pkg.trim()) && (pkg.match(/check-card-thread\.js/g) || []).length === 1, "npm test runs check-card-thread once, last, after the owner-key and #460 card-thread checks");
  return f;
}

function staticChecks() {
  const f = [];
  let base = "";
  try { base = execFileSync("git", ["merge-base", "HEAD", "origin/main"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch (e) {}
  let changed = null;
  if (base) { try { changed = execFileSync("git", ["diff", "--name-only", base, "--", "legal.html"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch (e) { changed = null; } }
  if (changed === null) f.push("could not diff against main (failing closed)");
  else if (changed) f.push("desk.html matches its byte/SHA-256 pin and legal.html stays as on main; api/ is pinned by check-api-freeze (" + changed.replace(/\n/g, ", ") + ")");
  if (!require("./_desk-html-pin").check(root)) f.push("desk.html does not match its byte/SHA-256 pin");
  return f;
}

function rep(file, a, b) { return (S) => { const s = S[file]; if (s.indexOf(a) < 0 || s.indexOf(a) !== s.lastIndexOf(a)) return null; const o = Object.assign({}, S); o[file] = s.replace(a, b); return o; }; }
const CT = "card-thread.js", DC = "desk-card.js", PK = "package.json";
const MUTANTS = [
  ["ext reads You on own rows", rep(CT, "    var t = actorTag(ak);\n    if (t) return t;\n", "    if (ak === \"ext\" && ownRow(row, from, opts)) return \"You\";\n    var t = actorTag(ak);\n    if (t) return t;\n")],
  ["ext falls through to the label", rep(CT, ' ext: "Outside" }', " }")],
  ["friend name leaks to non-owners", rep(CT, '    if (opts && opts.stranger) return lab !== "You" && SHOWN.indexOf(lab) >= 0 ? lab : "Helper";', '    if (opts && opts.stranger && /friend/i.test(String(row.whoKind || row.droppedByKind || lab))) return (lab || from).slice(0, 40);\n    if (opts && opts.stranger) return SHOWN.indexOf(lab) >= 0 ? lab : "Helper";')],
  ["human from leaks when no label", rep(CT, '    if (opts && opts.stranger) return lab !== "You" && SHOWN.indexOf(lab) >= 0 ? lab : "Helper";', '    if (opts && opts.stranger) return SHOWN.indexOf(lab) >= 0 ? lab : (lab ? "Helper" : from);')],
  ["unescaped HTML in message text", rep(CT, "    p.textContent = part.text;", "    p.innerHTML = part.text;")],
  ["unescaped HTML in tag", rep(CT, "    tag.textContent = part.tag;", "    tag.innerHTML = part.tag;")],
  ["text via insertAdjacentHTML", rep(CT, "    p.textContent = part.text;", "    p.insertAdjacentHTML(\"beforeend\", part.text);")],
  ["tag hidden (display:none)", rep(CT, ".card-thread .ct-tag{display:inline-block;", ".card-thread .ct-tag{display:none;")],
  ["text margin 420px", rep(CT, ".card-thread .ct-text{margin:0;", ".card-thread .ct-text{margin:0 0 0 420px;")],
  ["text offset 420px", rep(CT, ".card-thread .ct-text{margin:0;", ".card-thread .ct-text{margin:0;position:relative;left:420px;")],
  ["text indent 420px", rep(CT, ".card-thread .ct-text{margin:0;", ".card-thread .ct-text{margin:0;text-indent:420px;")],
  ["text transform 420px", rep(CT, ".card-thread .ct-text{margin:0;", ".card-thread .ct-text{margin:0;transform:translateX(420px);")],
  ["text width 420px", rep(CT, ".card-thread .ct-text{margin:0;", ".card-thread .ct-text{margin:0;width:420px;")],
  ["bubble padding 420px", rep(CT, "box-sizing:border-box;padding:8px 10px;", "box-sizing:border-box;padding:8px 420px;")],
  ["layout: no wrap (pre)", rep(CT, "overflow-wrap:anywhere;word-break:break-word;white-space:pre-wrap", "white-space:pre")],
  ["layout: fixed 600px bubble via min-width", rep(CT, ".card-thread .ct-in,.card-thread .ct-out{max-width:min(100%,640px);min-width:0;", ".card-thread .ct-in,.card-thread .ct-out{max-width:min(100%,640px);min-width:600px;")],
  ["layout: flex-basis 500px", rep(CT, ".card-thread .ct-entry{display:flex;flex-direction:column;", ".card-thread .ct-entry{display:flex;flex-direction:column;flex:0 0 500px;width:fit-content;padding-right:400px;")],
  ["no fallback (unknown -> empty)", rep(CT, "    return labelOf(row, from, opts);\n  }\n  function isOutput", "    return \"\";\n  }\n  function isOutput")],
  ["last entry dropped", rep(CT, "    rows.forEach(function (e) {\n      var li", "    rows.slice(0, -1).forEach(function (e) {\n      var li")],
  ["newest first", rep(CT, "    out.sort(function (a, b) { return (a.at - b.at) || (a.n - b.n); });", "    out.sort(function (a, b) { return (b.at - a.at) || (b.n - a.n); });")],
  ["helper role only marked stranger", rep(DC, 'const opts = { stranger: sheetHidesNames(),', 'const opts = { stranger: role === "helper",')],
  ["si shown as AI", rep(CT, 'si: "SI"', 'si: "AI"')],
  ["ai tag dropped", rep(CT, ' ai: "AI",', "")],
  ["human never You", rep(CT, 'return ownRow(row, from, opts) ? "You" : labelOf(row, from, opts);', 'return labelOf(row, from, opts);')],
  ["human always You", rep(CT, 'return ownRow(row, from, opts) ? "You" : labelOf(row, from, opts);', 'return "You";')],
  ["own flag ignored", rep(CT, "    if (row.own === true) return true;\n", "")],
  ["viewer ignored", rep(CT, "    return !!v && v === from.toLowerCase();", "    return false;")],
  ["actorLabel ignored", rep(CT, "    return (lab || from).slice(0, 40);", "    return from.slice(0, 40);")],
  ["stranger sees actorLabel", rep(CT, '    if (opts && opts.stranger) return lab !== "You" && SHOWN.indexOf(lab) >= 0 ? lab : "Helper";', '    if (opts && opts.stranger) return lab || "Helper";')],
  ["old you/outside values accepted", rep(CT, "    return TAGS[k] || \"\";\n  }\n  // A stranger", "    return TAGS[KIND_ALIAS[k] || k] || (k === \"you\" ? \"You\" : \"\");\n  }\n  // A stranger")],
  ["input/output row split wrong", rep(CT, '        if (clean(t.output)) add(Object.assign({}, t, { text: t.output }), "out");', '        if (clean(t.output)) add(Object.assign({}, t, { text: t.output }), "in");')],
  ["input/output row ignored", rep(CT, "      if (clean(t.input) || clean(t.output)) {", "      if (false) {")],
  ["human row seen as output", rep(CT, '    if (TAGS[k] || k === "human") return false;', '    if (TAGS[k]) return false;')],
  ["helper shown as Employee", rep(CT, 'helper: "Helper"', 'helper: "Employee"')],
  ["family shown as Helper", rep(CT, 'family: "Family"', 'family: "Helper"')],
  ["employee tag dropped", rep(CT, ' employee: "Employee",', "")],
  ["ext shown as Helper", rep(CT, 'ext: "Outside" }', 'ext: "Helper" }')],
  ["actorKind is case-sensitive", rep(CT, "    var ak = clean(row.actorKind).toLowerCase();", "    var ak = clean(row.actorKind);")],
  ["actorKind ignored (fallback always)", rep(CT, "    var t = actorTag(ak);\n    if (t) return t;\n", "")],
  ["fallback: AI from not seen", rep(CT, "if (AI_FROM.test(from) || row.ai === true) return \"AI\";", "")],
  ["fallback: desk itself not You", rep(CT, "    if (ownRow(row, from, opts)) return \"You\";\n    if (YOU_FROM.test(from)) return opts && opts.stranger ? \"Helper\" : \"You\";\n", "")],
  ["fallback: whoKind ignored", rep(CT, "kindTag(row.whoKind) || ", "")],
  ["fallback: shows Helper even to the owner", rep(CT, "    return (lab || from).slice(0, 40);", "    return \"Helper\";")],
  ["unknown actorKind shown raw", rep(CT, "  function actorTag(k) {\n    return TAGS[k] || \"\";", "  function actorTag(k) {\n    return TAGS[k] || k;")],
  ["stranger sees names", rep(CT, '    if (opts && opts.stranger) return lab !== "You" && SHOWN.indexOf(lab) >= 0 ? lab : "Helper";\n', "")],
  ["desk-card never marks strangers", rep(DC, 'const opts = { stranger: sheetHidesNames(),', "const opts = { stranger: false,")],
  ["replies keep their name for strangers", rep(CT, 'actorKind: r.actorKind || "ext" }', "actorKind: r.actorKind }")],
  ["second output overwrites the first", rep(CT, "} else if (cur && !cur.output) {", "} else if (cur) {")],
  ["output-only rows dropped", rep(CT, "      } else {\n        cur = { input: null, output: { tag: tag, text: r.text } };\n        entries.push(cur);\n      }", "      }")],
  ["rows not sorted by time", rep(CT, "    out.sort(function (a, b) { return (a.at - b.at) || (a.n - b.n); });\n", "")],
  ["rec seen as input", rep(CT, 'return kind === "rec" || ', "return ")],
  ["output before input in an entry", rep(CT, "      if (e.input) li.appendChild(side(doc, \"ct-in\", e.input));\n      if (e.output) li.appendChild(side(doc, \"ct-out\", e.output));", "      if (e.output) li.appendChild(side(doc, \"ct-out\", e.output));\n      if (e.input) li.appendChild(side(doc, \"ct-in\", e.input));")],
  ["no wait line", rep(CT, "No reply yet.", "")],
  ["preview entries not supported", rep(CT, "    if (card && Array.isArray(card.entries)) {", "    if (false) {")],
  ["no wrap at 390", rep(CT, "overflow-wrap:anywhere;", "")],
  ["fixed bubble width", rep(CT, "max-width:min(100%,640px);", "width:420px;")],
  ["two columns", rep(CT, ".card-thread .ct-entry{display:flex;flex-direction:column;", ".card-thread .ct-entry{display:flex;flex-direction:row;")],
  ["no shrink", rep(CT, ".card-thread .ct-entry{display:flex;flex-direction:column;gap:6px;max-width:100%;min-width:0;", ".card-thread .ct-entry{display:flex;flex-direction:column;gap:6px;max-width:100%;")],
  ["sheet has no thread slot", rep(DC, '    "<div id=\\"card-thread-sheet\\"></div>" +\n', "")],
  ["sheet never mounts the thread", rep(DC, "  mountCardThread(j);\n", "")],
  ["Grok wording on screen", rep(CT, 'none.textContent = "Nothing yet.";', 'none.textContent = "Grok has nothing yet.";')],
  ["payment wording on screen", rep(CT, 'w.textContent = "No reply yet.";', 'w.textContent = "No reply yet. Nothing is charged.";')],
  ["readTalk blank input/output rows dropped", rep(CT, "      if (clean(t.input) || clean(t.output)) {", "      if (t.input != null || t.output != null) {")],
  ["stranger can see You (own row)", rep(CT, "    if (opts && opts.stranger) return false;\n", "")],
  ["stranger sees the masked You label", rep(CT, 'return lab !== "You" && SHOWN.indexOf(lab) >= 0 ? lab : "Helper";', 'return SHOWN.indexOf(lab) >= 0 ? lab : "Helper";')],
  ["stranger reads from=drop as You", rep(CT, 'if (YOU_FROM.test(from)) return opts && opts.stranger ? "Helper" : "You";', 'if (YOU_FROM.test(from)) return "You";')],
  ["owner's own card text not You", rep(CT, "    if (ownRow(row, from, opts)) return \"You\";\n    if (YOU_FROM", "    if (YOU_FROM")],
  ["desk-card passes no viewer", rep(DC, ', viewer: typeof youName === "string" ? youName : "" };', " };")],
  ["not in npm test", rep(PK, " && node scripts/check-card-thread.js", "")]
];

const base = suite(SRC).concat(staticChecks());
let bad = base.length;
base.forEach((m) => console.log("FAIL " + m));
if (!bad) console.log("ok card-thread: tags, fallback, pairing, no names for strangers, 390 layout, wiring");
let caught = 0;
MUTANTS.forEach(([name, make]) => {
  const S = make(SRC);
  if (!S) { console.log("FAIL mutant does not apply: " + name); bad++; return; }
  const r = suite(S);
  if (r.length) { caught++; console.log("ok mutant caught: " + name + " (" + r[0].split("\n")[0] + ")"); }
  else { console.log("FAIL mutant NOT caught: " + name); bad++; }
});
console.log("check-card-thread mutants: " + caught + "/" + MUTANTS.length + " caught");
if (bad) { console.log("check-card-thread failed"); process.exit(1); }
console.log("check-card-thread: ok");
