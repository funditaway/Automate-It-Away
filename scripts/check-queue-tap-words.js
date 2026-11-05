require("./_env-guard");
// Queue pass Q1f: the Talk · Say · Reply label (label.q-prompt-lab) is at least 44px tall, and the Queue's
// connections button says Connections (live wording), never Pipes. The button stays bound to openPipesSheet,
// and the sheet it opens uses Connections wording from the live wall. desk.html stays as it is.
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const SRC = { "theme.css": read("theme.css"), "desk-needs.js": read("desk-needs.js"), "desk.html": read("desk.html"), "package.json": read("package.json") };
function spec(sel) { // [ids, classes+attrs+pseudo, types] for one simple selector chain
  const s = sel.replace(/::?[\w-]+(\([^)]*\))?/g, (m) => (m.startsWith("::") ? " T" : " .c"));
  return [(s.match(/#[\w-]+/g) || []).length, (s.match(/\.[\w-]+|\[[^\]]*\]/g) || []).length, (s.replace(/[#.][\w-]+|\[[^\]]*\]/g, " ").match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length];
}
const gt = (a, b) => a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];
function rules(css) { const out = []; css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/([^{}]+)\{([^{}]*)\}/g, (m, sel, body) => { sel.split(",").forEach((x) => out.push({ sel: x.trim(), body })); return m; }); return out; }
function px(body, prop) { const m = body.match(new RegExp("(?:^|;)\\s*" + prop + "\\s*:\\s*([\\d.]+)px")); return m ? +m[1] : null; }
function suite(S) {
  const f = [], ok = (c, m) => { if (!c) f.push(m); };
  const deskRule = rules((S["desk.html"].match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "").find((r) => /\.q-prompt-lab$/.test(r.sel));
  const base = deskRule ? spec(deskRule.sel) : [0, 1, 0];
  const mine = rules(S["theme.css"]).filter((r) => /label\.q-prompt-lab|\.q-prompt-lab/.test(r.sel) && px(r.body, "min-height") !== null);
  const win = mine.filter((r) => px(r.body, "min-height") >= 44 && gt(spec(r.sel), base) && !/display\s*:\s*none/.test(r.body));
  ok(win.length > 0, "label.q-prompt-lab gets min-height >= 44px from a rule that beats desk.html's (" + (deskRule && deskRule.sel) + ")");
  ok(win.every((r) => !/(^|;)\s*(max-height|height)\s*:\s*([0-3]?\d|4[0-3])px/.test(r.body) && !/overflow\s*:\s*hidden/.test(r.body)), "the 44px label is not capped or clipped");
  const d = S["desk-needs.js"];
  ok(/t\.id="queue-pipes-tap"/.test(d), "the Queue connections button keeps its id (check-queue-ux)");
  ok(/t\.textContent="Connections"/.test(d) && /setAttribute\("aria-label","Connections"\)/.test(d), "the Queue button reads Connections (text and aria-label)");
  ok(!/textContent="Pipes"|"aria-label","Pipes"/.test(d), "the Queue button never reads Pipes");
  ok(/,t\.onclick=function\(\)\{openPipesSheet\(\)\}/.test(d), "the Queue Connections button onclick is bound to openPipesSheet");
  ok(/<h3>Connections<\/h3>/.test(d) && !/<h3>Pipes<\/h3>/.test(d), "openPipesSheet sheet heading reads Connections");
  ok(/q\("pipes","Connections"\)/.test(d) && /\{id:"pipes",label:"Connections"\}/.test(d) && !/"pipes","Pipes"|label:"Pipes"/.test(d), "per-card action reads Connections (id stays pipes)");
  ok((d.match(/openPipesSheet\(\\''\+safeId\([te]\.id\)\+"'\)\\">Connections<\/button>/g) || []).length === 2 && !/\\">Pipes<\/button>/.test(d), "per-card Connections buttons (cap card and drawer) open openPipesSheet");
  ok(/Orange until a real pipe answers/.test(d), "sheet keeps the live orange-line wording");
  ok(/If we do not have a name yet, the inbound hook still takes the card\./.test(d), "sheet empty state uses live connections.html wording");
  ok(/Open Connections/.test(d) && /href="\/connections"/.test(d) && !/Open Pipes wall/.test(d), "sheet link reads Open Connections and stays on /connections");
  ok(/AIA does not send money from this sheet/.test(d), "sheet keeps the existing no-money line");
  ok(/node scripts\/check-setup-cards-ui\.js && node scripts\/check-helper-names\.js && node scripts\/check-queue-tap-words\.js && node scripts\/check-ux-signin\.js/.test(S["package.json"]), "npm test runs setup-cards-ui && helper-names && queue-tap-words && ux-signin in that order");
  return f;
}
const rep = (file, a, b) => (S) => { if (S[file].split(a).length !== 2) return null; return Object.assign({}, S, { [file]: S[file].replace(a, b) }); };
const RULE = "div.q-prompt > label.q-prompt-lab{min-height:44px;display:flex;align-items:center;cursor:pointer}";
const MUTANTS = [
  ["label 40px", rep("theme.css", "min-height:44px;display:flex", "min-height:40px;display:flex")],
  ["rule loses to desk.html (same specificity)", rep("theme.css", "div.q-prompt > label.q-prompt-lab{", ".q-prompt-lab{")],
  ["label rule gone", rep("theme.css", RULE, "")],
  ["label capped at 20px", rep("theme.css", "cursor:pointer}", "cursor:pointer;max-height:20px;overflow:hidden}")],
  ["Pipes back", rep("desk-needs.js", 't.textContent="Connections"', 't.textContent="Pipes"')],
  ["aria-label Pipes back", rep("desk-needs.js", '"aria-label","Connections"', '"aria-label","Pipes"')],
  ["button id renamed", rep("desk-needs.js", 't.id="queue-pipes-tap"', 't.id="queue-connections-tap"')],
  ["handler unbound", rep("desk-needs.js", ",t.onclick=function(){openPipesSheet()}", "")],
  ["sheet heading Pipes back", rep("desk-needs.js", "<h3>Connections</h3>", "<h3>Pipes</h3>")],
  ["Open Pipes wall back", rep("desk-needs.js", "Open Connections", "Open Pipes wall")],
  ["old empty pipe wording back", rep("desk-needs.js", "If we do not have a name yet, the inbound hook still takes the card.", "No named pipe is live. Webhook inbound still writes cards.")],
  ["per-card action Pipes back", rep("desk-needs.js", 'q("pipes","Connections")', 'q("pipes","Pipes")')],
  ["decide-card action Pipes back", rep("desk-needs.js", '{id:"pipes",label:"Connections"}', '{id:"pipes",label:"Pipes"}')],
  ["cap-card button Pipes back", rep("desk-needs.js", "safeId(t.id)+\"')\\\">Connections</button>", "safeId(t.id)+\"')\\\">Pipes</button>")],
  ["drawer button Pipes back", rep("desk-needs.js", "safeId(e.id)+\"')\\\">Connections</button>", "safeId(e.id)+\"')\\\">Pipes</button>")],
  ["not in npm test", rep("package.json", " && node scripts/check-queue-tap-words.js", "")]
];
let bad = 0;
const base = suite(SRC);
base.forEach((m) => { console.log("FAIL " + m); bad++; });
let same = "";
try { same = execFileSync("git", ["diff", "--name-only", "83a951a91e195d5cf501a6b25283d709480dc467", "--", "desk.html", "api", "legal.html"], { cwd: root, encoding: "utf8" }).trim(); } catch (e) { same = "git error"; }
if (same) { console.log("FAIL desk.html, api/ and legal.html stay as main (" + same + ")"); bad++; }
let caught = 0;
MUTANTS.forEach(([name, make]) => { const S = make(SRC); if (!S) { console.log("FAIL mutant does not apply: " + name); bad++; return; } const r = suite(S); if (r.length) { caught++; console.log("ok mutant caught: " + name + " (" + r[0] + ")"); } else { console.log("FAIL mutant NOT caught: " + name); bad++; } });
console.log("check-queue-tap-words mutants: " + caught + "/" + MUTANTS.length + " caught");
if (bad) { console.log("check-queue-tap-words failed"); process.exit(1); }
console.log("check-queue-tap-words: ok");
