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
  ok(/stranger:\s*!!role && role !== "owner"/.test(S["desk-card.js"]), "desk-card.js passes stranger for anyone who is not the owner");
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
  let pkg = ""; try { pkg = JSON.parse(S["package.json"]).scripts.test; } catch (e) {}
  ok(/node scripts\/check-setup-cards-ui\.js && node scripts\/check-card-thread\.js && node scripts\/check-ux-signin\.js/.test(pkg), "npm test runs check-card-thread (after check-setup-cards-ui, before check-ux-signin)");
  return f;
}

function staticChecks() {
  const f = [];
  let base = "";
  try { base = execFileSync("git", ["merge-base", "HEAD", "origin/main"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch (e) {}
  let changed = null;
  if (base) { try { changed = execFileSync("git", ["diff", "--name-only", base, "--", "desk.html", "api", "legal.html"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch (e) { changed = null; } }
  if (changed === null) f.push("could not diff against main (failing closed)");
  else if (changed) f.push("desk.html, api/ and legal.html stay as on main (" + changed.replace(/\n/g, ", ") + ")");
  return f;
}

function rep(file, a, b) { return (S) => { const s = S[file]; if (s.indexOf(a) < 0 || s.indexOf(a) !== s.lastIndexOf(a)) return null; const o = Object.assign({}, S); o[file] = s.replace(a, b); return o; }; }
const CT = "card-thread.js", DC = "desk-card.js", PK = "package.json";
const MUTANTS = [
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
  ["helper role only marked stranger", rep(DC, 'const opts = { stranger: !!role && role !== "owner" };', 'const opts = { stranger: role === "helper" };')],
  ["si shown as AI", rep(CT, 'si: "SI"', 'si: "AI"')],
  ["ai tag dropped", rep(CT, ' ai: "AI",', "")],
  ["human never You", rep(CT, 'return ownRow(row, from, opts) ? "You" : labelOf(row, from, opts);', 'return labelOf(row, from, opts);')],
  ["human always You", rep(CT, 'return ownRow(row, from, opts) ? "You" : labelOf(row, from, opts);', 'return "You";')],
  ["own flag ignored", rep(CT, "    if (row.own === true) return true;\n", "")],
  ["viewer ignored", rep(CT, "    return !!v && v === from.toLowerCase();", "    return false;")],
  ["actorLabel ignored", rep(CT, "    return (lab || from).slice(0, 40);", "    return from.slice(0, 40);")],
  ["stranger sees actorLabel", rep(CT, '    if (opts && opts.stranger) return SHOWN.indexOf(lab) >= 0 ? lab : "Helper";', '    if (opts && opts.stranger) return lab || "Helper";')],
  ["old you/outside values accepted", rep(CT, "    return TAGS[k] || \"\";\n  }\n  function ownRow", "    return TAGS[KIND_ALIAS[k] || k] || (k === \"you\" ? \"You\" : \"\");\n  }\n  function ownRow")],
  ["input/output row split wrong", rep(CT, '        if (t.output != null) add(Object.assign({}, t, { text: t.output }), "out");', '        if (t.output != null) add(Object.assign({}, t, { text: t.output }), "in");')],
  ["input/output row ignored", rep(CT, "      if (t.input != null || t.output != null) {", "      if (false) {")],
  ["human row seen as output", rep(CT, '    if (TAGS[k] || k === "human") return false;', '    if (TAGS[k]) return false;')],
  ["helper shown as Employee", rep(CT, 'helper: "Helper"', 'helper: "Employee"')],
  ["family shown as Helper", rep(CT, 'family: "Family"', 'family: "Helper"')],
  ["employee tag dropped", rep(CT, ' employee: "Employee",', "")],
  ["ext shown as Helper", rep(CT, 'ext: "Outside" }', 'ext: "Helper" }')],
  ["actorKind is case-sensitive", rep(CT, "    var ak = clean(row.actorKind).toLowerCase();", "    var ak = clean(row.actorKind);")],
  ["actorKind ignored (fallback always)", rep(CT, "    var t = actorTag(ak);\n    if (t) return t;\n", "")],
  ["fallback: AI from not seen", rep(CT, "if (AI_FROM.test(from) || row.ai === true) return \"AI\";", "")],
  ["fallback: desk itself not You", rep(CT, "if (YOU_FROM.test(from)) return \"You\";", "")],
  ["fallback: whoKind ignored", rep(CT, "kindTag(row.whoKind) || ", "")],
  ["fallback: shows Helper even to the owner", rep(CT, "    return (lab || from).slice(0, 40);", "    return \"Helper\";")],
  ["unknown actorKind shown raw", rep(CT, "  function actorTag(k) {\n    return TAGS[k] || \"\";", "  function actorTag(k) {\n    return TAGS[k] || k;")],
  ["stranger sees names", rep(CT, '    if (opts && opts.stranger) return SHOWN.indexOf(lab) >= 0 ? lab : "Helper";\n', "")],
  ["desk-card never marks strangers", rep(DC, 'const opts = { stranger: !!role && role !== "owner" };', "const opts = { stranger: false };")],
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
  ["not in npm test", rep(PK, "node scripts/check-card-thread.js && ", "")]
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
