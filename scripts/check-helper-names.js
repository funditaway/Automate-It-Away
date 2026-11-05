require("./_env-guard");
// check-helper-names: on the card sheet (desk-card.js openJob), anyone who is not the desk's owner
// (employee, helper, family) sees no seeded person name in the old talk block, the timeline, the
// assignee line or Hand to. The owner still sees every name. Desk labels and Desk AI names stay.
// UI only: GET /api/jobs is not changed here (Switch owns the payload side).
// Drives the real openJob in a sandbox and the real card-timeline.js events. Every rule has a mutant.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const SRC = { "desk-card.js": read("desk-card.js"), "card-timeline.js": read("card-timeline.js"), "package.json": read("package.json"), "desk-needs.js": read("desk-needs.js") };
const NAMES = ["Zelda", "Ownerperson", "Quincy", "Helperman", "Wendy", "Familyname", "Eddie", "Staffer", "Harriet", "Friendly", "Plumber"];
const NAME_RE = new RegExp(NAMES.join("|"));
const CARD = {
  id: "job_q1", title: "Fix the sink", status: "open", from: "Zelda Ownerperson", assignee: "Quincy Helperman", assigneeId: "p2",
  deskAi: { name: "Robo" }, agentDraft: { name: "Robo", text: "Draft: Tuesday at 9?", at: "2026-11-01T10:09:00Z" },
  createdAt: "2026-11-01T10:00:00Z",
  thread: [
    { at: "2026-11-01T10:01:00Z", from: "Wendy Familyname", kind: "tell", text: "Home Tuesday." },
    { at: "2026-11-01T10:02:00Z", from: "Eddie Staffer", kind: "note", text: "Got the part." },
    { at: "2026-11-01T10:03:00Z", from: "Harriet Friendly", kind: "follow", text: "Done?" },
    { at: "2026-11-01T10:04:00Z", from: "Robo", kind: "rec", text: "Call the plumber." },
    { at: "2026-11-01T10:05:00Z", from: "Grok", kind: "ask", text: "Which day?" },
    { at: "2026-11-01T10:06:00Z", from: "drop", kind: "tell", text: "From the desk." },
    { at: "2026-11-01T10:06:30Z", from: "Robo", kind: "note", text: "AI side note." }
  ],
  replies: [{ at: "2026-11-01T10:07:00Z", from: "Plumber Co", text: "Tuesday works." }, { at: "2026-11-01T10:08:00Z", text: "No name here." }]
};
// Real seat shape (Probe #468): every seat but the owner's has role employee; kind says what it is.
const PEOPLE = [{ id: "p1", name: "Zelda Ownerperson", role: "owner", kind: "owner" }, { id: "p2", name: "Quincy Helperman", role: "employee", kind: "helper" }, { id: "p3", name: "Wendy Familyname", role: "employee", kind: "family" }, { id: "p4", name: "Eddie Staffer", role: "employee", kind: "staff" }, { id: "p5", name: "Harriet Friendly", role: "employee", kind: "friend" }];

function timelineEvents(S, card) {
  const win = { console };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(S["card-timeline.js"], win, { timeout: 2000 });
  return win.AIACardTimeline.events(card);
}
async function sheet(S, role) {
  const noop = () => {};
  const els = {};
  const mk = (id) => { const n = { id, style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, setAttribute: noop, getAttribute: () => null, addEventListener: noop, appendChild: noop, querySelector: () => null, querySelectorAll: () => [], textContent: "", value: "", focus: noop, scrollIntoView: noop, showModal: noop }; let h = ""; Object.defineProperty(n, "innerHTML", { get: () => h, set: (v) => { h = String(v); } }); return n; };
  const get = (id) => els[id] || (els[id] = mk(id));
  let tl = null;
  const ctx = { console, setTimeout: noop, clearTimeout: noop, Promise, JSON, Date, Math, URLSearchParams, location: { search: "", hash: "", pathname: "/desk" }, localStorage: { getItem: () => null, setItem: noop }, history: { replaceState: noop }, addEventListener: noop,
    document: { getElementById: get, createElement: mk, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, body: mk(), head: mk(), readyState: "complete" },
    fetch: () => Promise.resolve({ ok: true, json: () => ({}) }), AIACardTimeline: { mount: (id, card) => { tl = card; } } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext("let role = " + JSON.stringify(role) + "; function esc(s){return String(s==null?'':s).replace(/[&<>\"']/g,function(c){return '&#'+c.charCodeAt(0)+';'})}", ctx);
  vm.runInContext(S["desk-card.js"], ctx, { filename: "desk-card.js", timeout: 3000 });
  ctx.__card = JSON.parse(JSON.stringify(CARD));
  ctx.__people = JSON.parse(JSON.stringify(PEOPLE));
  vm.runInContext("var FIELDS = []; var labelStatus = function (x) { return x || ''; }; PEOPLE = __people; jobBy = function () { return __card; }; loadPeople = async function () {};", ctx);
  await vm.runInContext("openJob('job_q1')", ctx);
  // The Queue card face (desk-needs.js window.card) shows sheetCardOf(card).assignee.
  const face = /\(typeof sheetCardOf==="function"\?sheetCardOf\(t\):t\)\.assignee\?'<div class="meta q-assignee">'\+e\(\(typeof sheetCardOf==="function"\?sheetCardOf\(t\):t\)\.assignee\)/.test(S["desk-needs.js"]);
  ctx.__faceCard = JSON.parse(JSON.stringify(CARD));
  const faceText = face ? vm.runInContext("(typeof sheetCardOf==='function'?sheetCardOf(__faceCard):__faceCard).assignee", ctx) : (CARD.assignee || "");
  const html = get("sheet-card").innerHTML;
  const hand = (/<select id="hand-to">([\s\S]*?)<\/select>/.exec(html) || ["", ""])[1];
  const talk = (/<div class="q-talk">([\s\S]*?)<\/div><p class="q-prompt|<div class="q-talk">([\s\S]*?)<div id="card-timeline-sheet">/.exec(html) || ["", "", ""]);
  return { face: faceText, html, hand, talk: talk[1] || talk[2] || "", meta: (/<p class="meta">([^<]*)<\/p>/.exec(html) || ["", ""])[1], tl, events: tl ? timelineEvents(S, tl).map((e) => [e.label, e.detail].join(" ")).join(" | ") : "", original: ctx.__card };
}

async function suite(S) {
  const f = [];
  const ok = (c, m) => { if (!c) f.push(m); };
  let o, views = {};
  try {
    o = await sheet(S, "owner");
    for (const r of ["employee", "helper", "family", "", "visitor"]) views[r] = await sheet(S, r);
  } catch (e) { return ["the card sheet does not open: " + (e && e.message)]; }
  // the owner still sees everyone
  ok(/Wendy Familyname/.test(o.talk) && /Eddie Staffer/.test(o.talk) && /Plumber Co/.test(o.talk), "the owner's talk block keeps names");
  ok(/Quincy Helperman/.test(o.meta), "the owner's assignee line keeps the name");
  ok(/>Zelda Ownerperson · owner</.test(o.hand) && /Quincy Helperman/.test(o.hand), "the owner's Hand to keeps names");
  ok(/Came in from Zelda Ownerperson/.test(o.events) && /Plumber Co replied/.test(o.events), "the owner's timeline keeps names (" + o.events.slice(0, 120) + ")");
  for (const r of Object.keys(views)) {
    const v = views[r];
    const hit = (s) => (NAME_RE.exec(s) || [""])[0];
    ok(v.talk && !hit(v.talk), r + ": the old talk block shows no seeded name (" + hit(v.talk) + ")");
    ok(!hit(v.events), r + ": the timeline shows no seeded name (" + hit(v.events) + ")");
    ok(!hit(v.hand), r + ": Hand to shows no seeded name (" + hit(v.hand) + ")");
    ok(!hit(v.meta), r + ": the assignee line shows no seeded name (" + v.meta + ")");
    ok(!hit(v.html), r + ": nothing on the card sheet shows a seeded name (" + hit(v.html) + ")");
    ok(/Helper · tell/.test(v.talk) && /Came in from Helper/.test(v.events) && /Helper replied/.test(v.events), r + ": a hidden name reads Helper");
    const opts = (v.hand.match(/<option value="(p\d)"[^>]*>([^<]*)</g) || []).map((x) => x.replace(/<option value="(p\d)"[^>]*>/, "$1=").replace(/<$/, "")).join(",");
    ok(opts === "p1=Owner,p2=Helper,p3=Employee 1,p4=Employee 2,p5=Employee 3", (r || "blank role") + ": Hand to tags by seat kind; family and friend read Employee N (" + opts + ")");
    ok(v.face === "Helper", (r || "blank role") + ": the Queue card face assignee reads Helper (" + v.face + ")");
    ok(/value="p1"/.test(v.hand) && /value="p2" selected/.test(v.hand), r + ": Hand to still hands to the same seats");
    const aiLabels = (t) => (t.match(/<div class="q-turn-who">Robo[^<]*/g) || []).join("|");
    ok(/Robo/.test(v.talk) && aiLabels(v.talk) === aiLabels(o.talk) && /Robo/.test(v.events), r + ": Desk AI names stay as the owner sees them (" + aiLabels(v.talk) + ")");
    ok(/From the desk/.test(v.talk) && /drop · tell/.test(v.talk), r + ": desk labels stay");
    ok(!/ · owner</.test(v.hand), r + ": Hand to adds no owner suffix to a tag");
    ok(v.original.from === "Zelda Ownerperson" && v.original.thread[0].from === "Wendy Familyname", r + ": the stored card is not changed (UI only)");
  }
  ok(!/api\//.test(""), "");
  let pkg = ""; try { pkg = JSON.parse(S["package.json"]).scripts.test; } catch (e) {}
  ok(/ && node scripts\/check-helper-names\.js( &&|")/.test(pkg), "npm test runs check-helper-names");
  return f;
}
function staticChecks() {
  const f = [];
  let base = "", changed = null;
  try { base = execFileSync("git", ["merge-base", "HEAD", "origin/main"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch (e) {}
  if (base) { try { changed = execFileSync("git", ["diff", "--name-only", base, "--", "desk.html", "api", "legal.html", "card-timeline.js"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch (e) {} }
  if (changed === null) f.push("could not diff against main (failing closed)");
  else if (changed) f.push("desk.html, api/, legal.html and card-timeline.js stay as on main (" + changed.replace(/\n/g, ", ") + ")");
  return f;
}
function rep(file, a, b) { return (S) => { const s = S[file]; if (s.indexOf(a) < 0 || s.indexOf(a) !== s.lastIndexOf(a)) return null; const o = Object.assign({}, S); o[file] = s.replace(a, b); return o; }; }
const DC = "desk-card.js", NE = "desk-needs.js";
const MUTANTS = [
  ["names never hidden", rep(DC, 'function sheetHidesNames() { return typeof role === "undefined" || role !== "owner"; }', "function sheetHidesNames() { return false; }")],
  ["names hidden from the owner too", rep(DC, 'function sheetHidesNames() { return typeof role === "undefined" || role !== "owner"; }', "function sheetHidesNames() { return true; }")],
  ["only employees hidden", rep(DC, 'function sheetHidesNames() { return typeof role === "undefined" || role !== "owner"; }', 'function sheetHidesNames() { return role === "employee"; }')],
  ["sheet not masked", rep(DC, "  const j = sheetCardOf(jobBy(id));", "  const j = jobBy(id);")],
  ["thread names kept", rep(DC, "  if (Array.isArray(j.thread)) c.thread = j.thread.map(", "  if (false) c.thread = j.thread.map(")],
  ["reply names kept", rep(DC, "  if (Array.isArray(j.replies)) c.replies = j.replies.map(", "  if (false) c.replies = j.replies.map(")],
  ["card from kept", rep(DC, "  c.from = sheetFrom(j, j.from, ais);\n", "")],
  ["assignee kept", rep(DC, '  if (j.assignee) c.assignee = "Helper";\n', "")],
  ["keep list lets names through", rep(DC, "const SHEET_KEEP_FROM = /^(|you|", "const SHEET_KEEP_FROM = /^(.*|you|")],
  ["Desk AI names hidden too", rep(DC, "  if (SHEET_KEEP_FROM.test(f) || ais.indexOf(f.toLowerCase()) >= 0) return from;", "  if (SHEET_KEEP_FROM.test(f)) return from;")],
  ["stored card changed", rep(DC, "  const c = Object.assign({}, j);", "  const c = j;")],
  ["blank role fails open", rep(DC, "function sheetHidesNames() { return typeof role === \"undefined\" || role !== \"owner\"; }", "function sheetHidesNames() { return typeof role === \"string\" && !!role && role !== \"owner\"; }")],
  ["Hand to tags by role, not kind", rep(DC, '    return String((x && x.kind) || "").toLowerCase() === "helper" ? "Helper" : "Employee";', '    return ({ helper: "Helper", family: "Family", friend: "Helper" })[String((x && x.role) || "").toLowerCase()] || "Employee";')],
  ["family seat reads Family", rep(DC, '    return String((x && x.kind) || "").toLowerCase() === "helper" ? "Helper" : "Employee";', '    var k = String((x && x.kind) || "").toLowerCase(); return k === "helper" ? "Helper" : k === "family" ? "Family" : "Employee";')],
  ["friend seat reads Helper", rep(DC, '    return String((x && x.kind) || "").toLowerCase() === "helper" ? "Helper" : "Employee";', '    var k = String((x && x.kind) || "").toLowerCase(); return k === "helper" || k === "friend" ? "Helper" : "Employee";')],
  ["card face shows the raw assignee", rep(NE, `((typeof sheetCardOf==="function"?sheetCardOf(t):t).assignee?'<div class="meta q-assignee">'+e((typeof sheetCardOf==="function"?sheetCardOf(t):t).assignee)+"</div>":"")`, `(t.assignee?'<div class="meta q-assignee">'+e(t.assignee)+"</div>":"")`)],
  ["Hand to shows names", rep(DC, '  if (!sheetHidesNames()) return String((p && p.name) || "");', '  return String((p && p.name) || "");')],
  ["Hand to tags not counted", rep(DC, "  if (same <= 1) return tag;", "  return tag;")],
  ["Hand to owner suffix for helpers", rep(DC, '(p.role === "owner" && !sheetHidesNames() ? " · owner" : "")', '(p.role === "owner" ? " · owner" : "")')],
  ["Hand to loses seats", rep(DC, "\"<option value=\\\"\" + esc(p.id || \"\") + \"\\\"\"", "\"<option value=\\\"\" + esc(\"\") + \"\\\"\"")],
  ["hidden name not Helper", rep(DC, '  return "Helper";\n}\nfunction sheetCardOf', '  return "Someone";\n}\nfunction sheetCardOf')],
  ["not in npm test", rep("package.json", " && node scripts/check-helper-names.js", "")]
];
(async () => {
  const base = (await suite(SRC)).concat(staticChecks());
  let bad = base.length;
  base.forEach((m) => console.log("FAIL " + m));
  if (!bad) console.log("ok helper-names: owner sees names; employee, helper and family see tags in the talk block, timeline, assignee and Hand to");
  let caught = 0;
  for (const [name, make] of MUTANTS) {
    const S = make(SRC);
    if (!S) { console.log("FAIL mutant does not apply: " + name); bad++; continue; }
    const r = await suite(S);
    if (r.length) { caught++; console.log("ok mutant caught: " + name + " (" + r[0].slice(0, 110) + ")"); } else { console.log("FAIL mutant NOT caught: " + name); bad++; }
  }
  console.log("check-helper-names mutants: " + caught + "/" + MUTANTS.length + " caught");
  if (bad) { console.log("check-helper-names failed"); process.exit(1); }
  console.log("check-helper-names: ok");
  process.exit(0);
})();
