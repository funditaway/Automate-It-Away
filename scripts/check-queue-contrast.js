require("./_env-guard");
// Queue pass Q1e: AA contrast on the Queue from theme.css alone. Each override must beat the page's own
// inline rule by specificity and pass 4.5:1. desk.html matches its byte/SHA-256 pin; rules.html, api/ and legal.html stay as main.
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
const SRC = Object.fromEntries(["theme.css", "desk-nav.css", "desk-nav.js", "ui-fix.css", "package.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const lum = (h) => { h = h.replace("#", ""); if (h.length === 3) h = h.replace(/./g, "$&$&"); return h.match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const spec = (s) => [(s.match(/#[\w-]+/g) || []).length, (s.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g) || []).length, (s.replace(/[#.:][\w-]+|\[[^\]]*\]/g, " ").match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length];
const gt = (a, b) => (a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2]);
function rule(css, sel) { const m = css.replace(/\/\*[\s\S]*?\*\//g, "").match(new RegExp("(^|\\})\\s*" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}")); return m ? m[2] : null; }
function suite(S) {
  const f = [], ok = (c, m) => { if (!c) f.push(m); };
  const t = S["theme.css"];
  const chip = rule(t, "html body .q-ai"), bg = chip && (chip.match(/background:(#[0-9a-f]{3,6})/i) || [])[1], fg = chip && (chip.match(/(?:^|;)color:(#[0-9a-f]{3,6})/i) || [])[1];
  ok(bg && fg && ratio(bg, fg) >= 4.5 && gt(spec("html body .q-ai"), spec(".q-ai")), "the AI chip passes AA in both themes and beats desk.html's .q-ai (" + (bg && fg ? ratio(bg, fg).toFixed(2) : "missing") + ")");
  const meta = rule(t, "html body main .meta");
  ok(meta !== null && /opacity:1(?![\d.])/.test(meta) && gt(spec("html body main .meta"), spec(".meta")), ".meta is no longer faded (beats the inline opacity:.7)");
  const drag = rule(t, "html body .q-drag");
  ok(drag !== null && /opacity:1(?![\d.])/.test(drag) && gt(spec("html body .q-drag"), spec(".q-drag")), "the drag handle is no longer faded");
  const mark = rule(t, "html.dark .q-state-flagged .q-state-mark");
  ok(mark !== null && /color:var\(--kill-ink\)/.test(mark) && gt(spec("html.dark .q-state-flagged .q-state-mark"), spec(".q-state-flagged .q-state-mark")), "Needs you on dark uses the AA kill ink (8.6:1)");
  ok(/--kill-ink: color-mix\(in srgb, var\(--aia-alert\) 42%, white\);/.test(t), "dark --kill-ink stays the 42% mix that passes AA");
  ok(/--teal: #5ec4c4;/.test(t), "dark --teal is unchanged (teal text on dark still passes)");
  const active = rule(S["desk-nav.css"], ".desk-tabs a.on");
  const activeFg = active && (active.match(/(?:^|;)\s*color:\s*(#[0-9a-f]{3,6})\s*!important/i) || [])[1];
  ok(activeFg && ["#2a7d7d", "#286464"].every((bg) => ratio(activeFg, bg) >= 4.5), "active Queue tab text passes AA on light and dark teal (" + (activeFg ? ["#2a7d7d", "#286464"].map((bg) => ratio(activeFg, bg).toFixed(2)).join(" / ") : "missing") + ")");
  ok(active && /box-shadow:\s*inset 0 -3px 0 #f39c12\s*!important/.test(active), "active Queue tab keeps its orange underline");
  const winner = ".desk-tabs a.on {\n  color: #fff !important;\n  box-shadow: inset 0 -3px 0 #f39c12 !important;\n}";
  ok(S["ui-fix.css"].includes(winner) && S["ui-fix.css"].lastIndexOf(winner) > S["ui-fix.css"].indexOf("color: #f39c12 !important"), "ui-fix.css final active-tab rule keeps AA white text and the orange underline");
  ok(S["desk-nav.js"].includes(".desk-tabs a.on{color:#fff!important;box-shadow:inset 0 -3px 0 #f39c12!important}"), "desk-nav.js injected active-tab rule keeps AA white text and the orange underline");
  ok(/node scripts\/check-queue-contrast\.js/.test(S["package.json"]), "npm test runs check-queue-contrast.js");
  return f;
}
const rep = (file, a, b) => (S) => (S[file].split(a).length !== 2 ? null : Object.assign({}, S, { [file]: S[file].replace(a, b) }));
const MUTANTS = [
  ["chip back to light teal", rep("theme.css", "html body .q-ai{background:#0d6b6b;", "html body .q-ai{background:#5ec4c4;")],
  ["chip rule loses to desk.html", rep("theme.css", "html body .q-ai{", ".q-ai{")],
  ["meta still faded", rep("theme.css", "html body main .meta{opacity:1}", "html body main .meta{opacity:.7}")],
  ["meta rule loses", rep("theme.css", "html body main .meta{", ".meta{")],
  ["drag still faded", rep("theme.css", "html body .q-drag{opacity:1}", "html body .q-drag{opacity:.85}")],
  ["Needs you back to raw red", rep("theme.css", "html.dark .q-state-flagged .q-state-mark{color:var(--kill-ink)}", "html.dark .q-state-flagged .q-state-mark{color:var(--aia-alert)}")],
  ["kill ink weakened", rep("theme.css", "--kill-ink: color-mix(in srgb, var(--aia-alert) 42%, white);", "--kill-ink: color-mix(in srgb, var(--aia-alert) 90%, white);")],
  ["teal darkened (hurts teal text)", rep("theme.css", "--teal: #5ec4c4;", "--teal: #0d6b6b;")],
  ["active tab back to orange text", rep("ui-fix.css", ".desk-tabs a.on {\n  color: #fff !important;\n  box-shadow: inset 0 -3px 0 #f39c12 !important;\n}", ".desk-tabs a.on {\n  color: #f39c12 !important;\n  box-shadow: inset 0 -3px 0 #f39c12 !important;\n}")],
  ["active tab AA rule dropped", rep("ui-fix.css", ".desk-tabs a.on {\n  color: #fff !important;\n  box-shadow: inset 0 -3px 0 #f39c12 !important;\n}\n", "")],
  ["fallback active tab back to orange text", rep("desk-nav.css", "color: #fff !important;\n  box-shadow: inset 0 -3px 0 #f39c12 !important;", "color: #f39c12 !important;\n  box-shadow: inset 0 -3px 0 #f39c12 !important;")],
  ["injected active tab back to orange text", rep("desk-nav.js", ".desk-tabs a.on{color:#fff!important;box-shadow:inset 0 -3px 0 #f39c12!important}", ".desk-tabs a.on{color:#f39c12!important;box-shadow:inset 0 -3px 0 #f39c12!important}")],
  ["not in npm test", rep("package.json", " && node scripts/check-queue-contrast.js", "")]
];
let bad = 0;
suite(SRC).forEach((m) => { console.log("FAIL " + m); bad++; });
let same = "";
try { same = execFileSync("git", ["diff", "--name-only", "83a951a91e195d5cf501a6b25283d709480dc467", "--", "rules.html", "api", "legal.html"], { cwd: root, encoding: "utf8" }).trim(); } catch (e) { same = "git error"; }
const pin = (() => { try { return require("./_api-freeze").PIN || {}; } catch (e) { return {}; } })();
const left = same === "git error" ? ["git error"] : same.split("\n").filter(Boolean).filter(function (rel) {
  if (rel.indexOf("api/") !== 0 || !Object.prototype.hasOwnProperty.call(pin, rel)) return true;
  let now = "";
  try { now = execFileSync("git", ["hash-object", "--", rel], { cwd: root, encoding: "utf8" }).trim(); } catch (e) { return true; }
  return now !== pin[rel];
});
if (left.length) { console.log("FAIL rules.html, api/ and legal.html stay as main (" + left.join("\n") + ")"); bad++; }
if (!require("./_desk-html-pin").check(root)) { console.log("FAIL desk.html does not match its byte/SHA-256 pin"); bad++; }
let caught = 0;
MUTANTS.forEach(([n, mk]) => { const S = mk(SRC); if (!S) { console.log("FAIL mutant does not apply: " + n); bad++; return; } const r = suite(S); if (r.length) { caught++; console.log("ok mutant caught: " + n + " (" + r[0] + ")"); } else { console.log("FAIL mutant NOT caught: " + n); bad++; } });
console.log("check-queue-contrast mutants: " + caught + "/" + MUTANTS.length + " caught");
if (bad) { console.log("check-queue-contrast failed"); process.exit(1); }
console.log("check-queue-contrast: ok");
