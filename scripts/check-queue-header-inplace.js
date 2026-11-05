require("./_env-guard");
// Q1a follow-up: header desk-tabs stay in place; restore the compact cbd572a1 layout
// that recovers signed-out LCP without removing the AA white/orange active marker.
// paintTabs updates header tabs in place when markup already matches (no wipe).
// Usage: node scripts/check-queue-header-inplace.js [--mutants]
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

function check(css, js, html, fix) {
  const fails = [];
  if (!/\.desk-tabs\s*\{[^}]*justify-content:\s*space-between/.test(css)) fails.push("desk-nav.css desk-tabs not space-between");
  if (!/\.desk-tabs\s*\{[^}]*gap:\s*8px 10px/.test(css)) fails.push("desk-nav.css desk-tabs gap not 8px 10px");
  if (!/\.desk-tabs\s*\{[^}]*font:\s*700 13px/.test(css)) fails.push("desk-nav.css desk-tabs font not 13px");
  if (!/\.desk-tabs a\.on\s*\{[^}]*color:\s*#fff\s*!important/.test(css)) fails.push("desk-nav.css a.on not AA white");
  if (!/box-shadow:\s*inset 0 -3px 0 #f39c12\s*!important/.test((css.match(/\.desk-tabs a\.on\s*\{[^}]*\}/) || [""])[0])) fails.push("desk-nav.css a.on lost its orange active marker");
  if (!/justify-content:space-between/.test(js) || !/gap:8px 10px/.test(js) || !/font:700 13px/.test(js)) fails.push("desk-nav.js ensureCss final layout drifted");
  if (!js.includes(".desk-tabs a.on{color:#fff!important;box-shadow:inset 0 -3px 0 #f39c12!important}")) fails.push("desk-nav.js injected active tab lost AA white text or orange underline");
  if (!/existing\.length === TABS\.length/.test(js)) fails.push("desk-nav.js missing in-place header tab update");
  if (!/querySelectorAll\("a\[data-tab\]"\)/.test(js)) fails.push("desk-nav.js missing data-tab probe");
  if (!/justify-content:space-between/.test(html) || !/gap:8px 10px/.test(html) || !/font:700 13px/.test(html)) fails.push("desk.html inline desk-tabs not final layout");
  if (!/desk-tabs a\.on\{color:#f39c12\}/.test(html)) fails.push("desk.html inline a.on not final");
  if (!/\.desk-tabs a\.on\s*\{[^}]*color:\s*#fff\s*!important;[^}]*box-shadow:\s*inset 0 -3px 0 #f39c12\s*!important/.test(fix)) fails.push("ui-fix.css does not keep AA white active text and its orange underline");
  if (fix.lastIndexOf(".desk-tabs a.on {\n  color: #fff !important;\n  box-shadow: inset 0 -3px 0 #f39c12 !important;\n}") < fix.indexOf("color: #f39c12 !important")) fails.push("winning AA active-tab rule must come after the old orange-text rule");
  return fails;
}

const css = read("desk-nav.css");
const js = read("desk-nav.js");
const html = read("desk.html");
const fix = read("ui-fix.css");
const base = check(css, js, html, fix);
if (base.length) {
  console.error("FAIL " + base.join("; "));
  process.exit(1);
}
console.log("check-queue-header-inplace OK");

if (process.argv.includes("--mutants")) {
  const mutants = [
    ["css flex start", css.replace("justify-content: space-between", "justify-content: flex-start"), js, html],
    ["css gap 18", css.replace("gap: 8px 10px", "gap: 8px 18px"), js, html],
    ["css font 15", css.replace("font: 700 13px", "font: 700 15px"), js, html],
    ["css on no underline", css.replace(/\.desk-tabs a\.on\s*\{[^}]*\}/, ".desk-tabs a.on { color: #fff !important; box-shadow: none !important; }"), js, html],
    ["js no in-place", js.replace("existing.length === TABS.length", "existing.length === 999"), css, html],
    ["js ensureCss gap", js.replace("gap:8px 10px", "gap:8px 18px"), css, html],
    ["js active tab orange", js.replace(".desk-tabs a.on{color:#fff!important;box-shadow:inset 0 -3px 0 #f39c12!important}", ".desk-tabs a.on{color:#f39c12!important;box-shadow:none!important}"), css, html],
    ["html inline gap", html.replace("gap:8px 10px", "gap:8px 18px"), css, js],
    ["html no on color", html.replace(".desk-tabs a.on{color:#f39c12}", ".desk-tabs a.on{color:#fff}"), css, js],
    ["override loses important", css, js, html, fix.replace("color: #fff !important;\n  box-shadow: inset 0 -3px 0 #f39c12 !important;\n}", "color: #fff;\n  box-shadow: inset 0 -3px 0 #f39c12;\n}")],
    ["override drops AA rule", css, js, html, fix.replace(/\.desk-tabs a\.on \{\n  color: #fff !important;\n  box-shadow: inset 0 -3px 0 #f39c12 !important;\n\}\n$/, "")],
  ];
  let hit = 0;
  for (const [name, a, b, c] of mutants) {
    // order: css, js, html in check()
    let fails;
    if (name.startsWith("css")) fails = check(a, js, html, fix);
    else if (name.startsWith("js")) fails = check(css, a, html, fix);
    else if (name.startsWith("html")) fails = check(css, js, a, fix);
    else fails = check(css, js, html, c);
    if (fails.length) hit++;
    else console.error("mutant escaped: " + name);
  }
  console.log("mutants " + hit + "/" + mutants.length);
  if (hit !== mutants.length) process.exit(1);
}
