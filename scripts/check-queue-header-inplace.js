require("./_env-guard");
// Q1a(b): header desk-tabs stay in place — static CSS matches ensureCss final layout;
// paintTabs updates header tabs in place when markup already matches (no wipe).
// Usage: node scripts/check-queue-header-inplace.js [--mutants]
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

function check(css, js, html, fix) {
  const fails = [];
  if (!/\.desk-tabs\s*\{[^}]*justify-content:\s*flex-start/.test(css)) fails.push("desk-nav.css desk-tabs not flex-start");
  if (!/\.desk-tabs\s*\{[^}]*gap:\s*8px 18px/.test(css)) fails.push("desk-nav.css desk-tabs gap not 8px 18px");
  if (!/\.desk-tabs\s*\{[^}]*font:\s*700 15px/.test(css)) fails.push("desk-nav.css desk-tabs font not 15px");
  if (!/\.desk-tabs a\.on\s*\{[^}]*color:\s*#f39c12/.test(css)) fails.push("desk-nav.css a.on not #f39c12");
  if (/box-shadow:\s*inset 0 -3px 0 #f39c12/.test(css.match(/\.desk-tabs a\.on\s*\{[^}]*\}/) || [""])[0]) fails.push("desk-nav.css a.on still underline shift");
  if (!/justify-content:flex-start/.test(js) || !/gap:8px 18px/.test(js) || !/font:700 15px/.test(js)) fails.push("desk-nav.js ensureCss final layout drifted");
  if (!/existing\.length === TABS\.length/.test(js)) fails.push("desk-nav.js missing in-place header tab update");
  if (!/querySelectorAll\("a\[data-tab\]"\)/.test(js)) fails.push("desk-nav.js missing data-tab probe");
  if (!/justify-content:flex-start/.test(html) || !/gap:8px 18px/.test(html) || !/font:700 15px/.test(html)) fails.push("desk.html inline desk-tabs not final layout");
  if (!/desk-tabs a\.on\{color:#f39c12\}/.test(html)) fails.push("desk.html inline a.on not final");
  if (!/\.desk-tabs a\.on\s*\{[^}]*color:\s*#f39c12\s*!important;[^}]*box-shadow:\s*none\s*!important/.test(fix)) fails.push("ui-fix.css does not override white active text and underline");
  if (fix.lastIndexOf(".desk-tabs a.on {\n  color: #f39c12 !important;\n  box-shadow: none !important;\n}") < fix.indexOf("box-shadow: inset 0 -3px 0 #f39c12 !important")) fails.push("winning active-tab rule must come after the old underline");
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
    ["css flex space-between", css.replace("justify-content: flex-start", "justify-content: space-between"), js, html],
    ["css gap 10", css.replace("gap: 8px 18px", "gap: 8px 10px"), js, html],
    ["css font 13", css.replace("font: 700 15px", "font: 700 13px"), js, html],
    ["css on underline", css.replace(/\.desk-tabs a\.on\s*\{[^}]*\}/, ".desk-tabs a.on { color: #fff; box-shadow: inset 0 -3px 0 #f39c12; }"), js, html],
    ["js no in-place", js.replace("existing.length === TABS.length", "existing.length === 999"), css, html],
    ["js ensureCss gap", js.replace("gap:8px 18px", "gap:8px 10px"), css, html],
    ["html inline gap", html.replace("gap:8px 18px", "gap:8px 10px"), css, js],
    ["html no on color", html.replace(".desk-tabs a.on{color:#f39c12}", ".desk-tabs a.on{color:#fff}"), css, js],
    ["override loses important", css, js, html, fix.replace("color: #f39c12 !important;\n  box-shadow: none !important;\n}", "color: #f39c12;\n  box-shadow: none;\n}")],
    ["override white underline", css, js, html, fix.replace(/\.desk-tabs a\.on \{\n  color: #f39c12 !important;\n  box-shadow: none !important;\n\}\n$/, "")],
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
