require("./_env-guard");
// Queue pass Q1e: AA contrast on the Queue from theme.css alone. Each override must beat the page's own
// inline rule by specificity and pass 4.5:1. desk.html matches its byte/SHA-256 pin; rules.html style
// and colour rules plus the AA pairs this check reads stay at 83a951a9; api/ and legal.html stay as main.
const fs = require("fs"), path = require("path"), crypto = require("crypto"), { execFileSync } = require("child_process");
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
const RULES_STYLE_PIN = "83a951a91e195d5cf501a6b25283d709480dc467";
const RULES_STYLE_SHA = "5bca95d65166c91e4c610f1029f2b7dc6592d6daf62ef8c828154151f6e990ca";
const RULES_AA_PAIRS_SHA = "5efc9e5b50617f47fb06f476ecda07270a7c472d2c146021168c1e30da10f6a7";
const PINNED_AA_PAIRS = {
  chipBg: "#0d6b6b",
  chipFg: "#fff",
  activeFg: "#fff",
  activeBgLight: "#2a7d7d",
  activeBgDark: "#286464",
  activeUnderline: "#f39c12",
  teal: "#5ec4c4",
  killInk: "color-mix(in srgb, var(--aia-alert) 42%, white)"
};
function sha256(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
function rulesStyleAndColourBlob(html) {
  const parts = [];
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = styleRe.exec(html))) parts.push(m[1]);
  const attrRe = /\s(?:style|color|bgcolor|fill|stroke|stop-color|flood-color|lighting-color|text-decoration-color|border-color|background-color|outline-color)\s*=\s*(?:"[^"]*"|'[^']*')/gi;
  while ((m = attrRe.exec(html))) parts.push(m[0]);
  return parts.join("\n");
}
const COLOUR_PROP = /^(color|background|background-color|background-image|border|border-color|border-top|border-right|border-bottom|border-left|outline|outline-color|box-shadow|fill|stroke|text-decoration-color|column-rule-color|stop-color|flood-color|lighting-color)$/;
function rulesColourPairs(html) {
  const pairs = [];
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = styleRe.exec(html))) {
    const css = m[1].replace(/\/\*[\s\S]*?\*\//g, "");
    const ruleRe = /([^{}]+)\{([^{}]+)\}/g;
    let r;
    while ((r = ruleRe.exec(css))) {
      const sel = r[1].replace(/\s+/g, " ").trim();
      r[2].split(";").forEach(function (d) {
        const i = d.indexOf(":");
        if (i < 0) return;
        const prop = d.slice(0, i).trim().toLowerCase();
        const val = d.slice(i + 1).trim();
        if (!val) return;
        if (COLOUR_PROP.test(prop) || /color/.test(prop)) pairs.push(sel + "{" + prop + ":" + val + "}");
      });
    }
  }
  const attrRe = /\s(?:style|color|bgcolor|fill|stroke|stop-color|flood-color|lighting-color|text-decoration-color|border-color|background-color|outline-color)\s*=\s*("[^"]*"|'[^']*')/gi;
  while ((m = attrRe.exec(html))) {
    const raw = m[0].trim();
    const name = raw.split("=")[0].trim().toLowerCase();
    const val = m[1].slice(1, -1);
    if (name === "style") {
      val.split(";").forEach(function (d) {
        const i = d.indexOf(":");
        if (i < 0) return;
        const prop = d.slice(0, i).trim().toLowerCase();
        const v = d.slice(i + 1).trim();
        if (!v) return;
        if (COLOUR_PROP.test(prop) || /color/.test(prop)) pairs.push("[style]{" + prop + ":" + v + "}");
      });
    } else {
      pairs.push("[" + name + "]=" + val);
    }
  }
  return pairs;
}
function rulesContrastFaults(html) {
  const faults = [];
  const styleSha = sha256(rulesStyleAndColourBlob(html));
  const pairsSha = sha256(rulesColourPairs(html).join("\n"));
  if (styleSha !== RULES_STYLE_SHA) faults.push("style and colour hash " + styleSha);
  if (pairsSha !== RULES_AA_PAIRS_SHA) faults.push("AA colour pairs hash " + pairsSha);
  return faults;
}
let bad = 0;
suite(SRC).forEach((m) => { console.log("FAIL " + m); bad++; });
let same = "";
try { same = execFileSync("git", ["diff", "--name-only", "83a951a91e195d5cf501a6b25283d709480dc467", "--", "api", "legal.html"], { cwd: root, encoding: "utf8" }).trim(); } catch (e) { same = "git error"; }
const pin = (() => { try { return require("./_api-freeze").PIN || {}; } catch (e) { return {}; } })();
const left = same === "git error" ? ["git error"] : same.split("\n").filter(Boolean).filter(function (rel) {
  if (rel.indexOf("api/") !== 0 || !Object.prototype.hasOwnProperty.call(pin, rel)) return true;
  let now = "";
  try { now = execFileSync("git", ["hash-object", "--", rel], { cwd: root, encoding: "utf8" }).trim(); } catch (e) { return true; }
  return now !== pin[rel];
});
if (left.length) { console.log("FAIL api/ and legal.html stay as main (" + left.join("\n") + ")"); bad++; }
if (!require("./_desk-html-pin").check(root)) { console.log("FAIL desk.html does not match its byte/SHA-256 pin"); bad++; }
const rulesHtml = fs.readFileSync(path.join(root, "rules.html"), "utf8");
const rulesFaults = rulesContrastFaults(rulesHtml);
if (rulesFaults.length) { console.log("FAIL rules.html style and colour rules stay at " + RULES_STYLE_PIN.slice(0, 8) + " (" + rulesFaults.join("; ") + ")"); bad++; }
else console.log("ok  rules.html style and colour rules match " + RULES_STYLE_PIN.slice(0, 8));
(function pinAaPairs() {
  const t = SRC["theme.css"];
  const chip = rule(t, "html body .q-ai");
  const bg = chip && (chip.match(/background:(#[0-9a-f]{3,6})/i) || [])[1];
  const fg = chip && (chip.match(/(?:^|;)color:(#[0-9a-f]{3,6})/i) || [])[1];
  const active = rule(SRC["desk-nav.css"], ".desk-tabs a.on");
  const activeFg = active && (active.match(/(?:^|;)\s*color:\s*(#[0-9a-f]{3,6})\s*!important/i) || [])[1];
  const faults = [];
  if (bg !== PINNED_AA_PAIRS.chipBg) faults.push("AI chip background " + bg);
  if (fg !== PINNED_AA_PAIRS.chipFg) faults.push("AI chip color " + fg);
  if (activeFg !== PINNED_AA_PAIRS.activeFg) faults.push("active tab color " + activeFg);
  if (!(active && new RegExp("box-shadow:\\s*inset 0 -3px 0 " + PINNED_AA_PAIRS.activeUnderline + "\\s*!important").test(active))) faults.push("active tab underline");
  if (!new RegExp("--teal: " + PINNED_AA_PAIRS.teal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ";").test(t)) faults.push("dark --teal");
  if (!new RegExp("--kill-ink: " + PINNED_AA_PAIRS.killInk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ";").test(t)) faults.push("kill ink");
  const activeBgs = [PINNED_AA_PAIRS.activeBgLight, PINNED_AA_PAIRS.activeBgDark];
  if (!(activeFg && activeBgs.every((tabBg) => ratio(activeFg, tabBg) >= 4.5))) faults.push("active tab AA pair");
  if (JSON.stringify(["#2a7d7d", "#286464"]) !== JSON.stringify(activeBgs)) faults.push("active tab pair literals");
  if (faults.length) { console.log("FAIL pinned AA pairs this check reads (" + faults.join("; ") + ")"); bad++; }
  else console.log("ok  pinned AA pairs this check reads");
})();
const colourMutant = rulesHtml.replace("#119494", "#119495");
if (colourMutant === rulesHtml || colourMutant.split("#119495").length !== 2) { console.log("FAIL rules.html colour mutant does not apply"); bad++; }
else if (!rulesContrastFaults(colourMutant).length) { console.log("FAIL rules.html colour mutant was not caught"); bad++; }
else console.log("ok  rules.html colour mutant caught (" + rulesContrastFaults(colourMutant)[0] + ")");
const SCRIPT_NEEDLE = "const loginRes = await fetch(\"/api/auth\", {";
const SCRIPT_SWAP = "const loginRes = await fetch(\"/api/auth\", { /* auth */";
const scriptMutant = rulesHtml.replace(SCRIPT_NEEDLE, SCRIPT_SWAP);
if (scriptMutant === rulesHtml || scriptMutant.split(SCRIPT_SWAP).length !== 2) { console.log("FAIL rules.html Open/auth script mutant does not apply"); bad++; }
else if (rulesContrastFaults(scriptMutant).length) { console.log("FAIL rules.html Open/auth script mutant must still pass the style pin (" + rulesContrastFaults(scriptMutant).join("; ") + ")"); bad++; }
else console.log("ok  rules.html Open/auth script mutant still passes the style pin");
let caught = 0;
MUTANTS.forEach(([n, mk]) => { const S = mk(SRC); if (!S) { console.log("FAIL mutant does not apply: " + n); bad++; return; } const r = suite(S); if (r.length) { caught++; console.log("ok mutant caught: " + n + " (" + r[0] + ")"); } else { console.log("FAIL mutant NOT caught: " + n); bad++; } });
console.log("check-queue-contrast mutants: " + caught + "/" + MUTANTS.length + " caught");
if (bad) { console.log("check-queue-contrast failed"); process.exit(1); }
console.log("check-queue-contrast: ok");
