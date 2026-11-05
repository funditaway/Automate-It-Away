require("./_env-guard");
// Q1a(c): hidden in-place shell; queue-login.js reveals it at mount, matching main
// insertion timing so later card/filter text does not become desktop LCP.
// Usage: node scripts/check-queue-panels-reserve.js [--mutants]
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

function check(css, login, theme, html) {
  const fails = [];
  if (/margin-bottom:\s*\d+px/.test((css.match(/h1\.page-title:not\(:has[^}]+\}/) || [""])[0])) {
    fails.push("phone-clear.css must not use empty h1 margin-bottom reserve (LCP regressor)");
  }
  if (!/id="queue-desk-picker" aria-label="Desks in this Queue" hidden/.test(html)) fails.push("desk.html shell must stay hidden until mount");
  if (/queue-may-pick/.test(theme)) fails.push("theme.js must not reveal the shell before first paint");
  if (!/picker\.hidden = false/.test(login)) fails.push("queue-login.js must reveal the reused shell at mount");
  if (!/id="queue-all-desks"/.test(html) || !/id="queue-desk-buttons"/.test(html) || !/id="queue-add-desk"/.test(html)) {
    fails.push("desk.html picker shell missing All / buttons / Add controls");
  }
  if (!/id="queue-all-cards"/.test(html)) fails.push("desk.html missing #queue-all-cards shell");
  const h1At = html.indexOf('<h1 class="page-title">Queue</h1>');
  const pickAt = html.indexOf('id="queue-desk-picker"');
  const cardsAt = html.indexOf('id="queue-all-cards"');
  const bannerAt = html.indexOf('id="banner"');
  if (!(h1At >= 0 && pickAt > h1At && cardsAt > pickAt && bannerAt > cardsAt)) {
    fails.push("desk.html shell order must be h1 → #queue-desk-picker → #queue-all-cards → #banner");
  }
  if (!require("./_desk-html-pin").check(root)) fails.push("desk.html must match scripts/_desk-html-pin.js");
  if (!/picker\.__queueLoginBound/.test(login)) fails.push("queue-login.js must bind once on existing shell (__queueLoginBound)");
  if (!/getElementById\("queue-desk-picker"\)/.test(login)) fails.push("queue-login.js must look up #queue-desk-picker");
  if (!/getElementById\("queue-all-cards"\)/.test(login)) fails.push("queue-login.js must look up #queue-all-cards");
  if (!/insertBefore\(picker,\s*h1\.nextSibling\)/.test(login)) fails.push("queue-login.js lost fallback insert after title");
  if (!/#queue-desk-picker\{margin:0 0 12px\}/.test(login)) fails.push("picker margin-bottom changed in ensureCss");
  if (!/max-width:640px/.test(login)) fails.push("queue-login.js lost 640px phone stack");
  return fails;
}

const css = read("phone-clear.css"), login = read("queue-login.js"), theme = read("theme.js"), html = read("desk.html");
const fails = check(css, login, theme, html);
if (process.argv.includes("--mutants")) {
  const M = [
    ["empty margin reserve back", css + "\nmain.wrap > h1.page-title:not(:has(~ #queue-desk-picker)){margin-bottom:96px}\n", login, theme, html],
    ["shell visible before mount", css, login, theme, html.replace('aria-label="Desks in this Queue" hidden', 'aria-label="Desks in this Queue"')],
    ["pre-paint theme reveal back", css, login, 'document.documentElement.classList.add("queue-may-pick");' + theme, html],
    ["mount reveal dropped", css, login.replace('picker.hidden = false', 'picker.hidden = true'), theme, html],
    ["shell id renamed", css, login, theme, html.replace('id="queue-desk-picker"', 'id="q-picker"')],
    ["shell after banner", css, login, theme, html.replace(
      /(<h1 class="page-title">Queue<\/h1>)([\s\S]*?)(<div class="banner" id="banner">[\s\S]*?<\/div>)/,
      "$1\n    $3\n    <nav id=\"queue-desk-picker\" aria-label=\"Desks in this Queue\" hidden><p class=\"queue-picker-label\">Desks in this Queue</p><div class=\"queue-picker-row\"><button type=\"button\" id=\"queue-all-desks\" data-queue-desk=\"\">All desks</button><div id=\"queue-desk-buttons\"></div><a id=\"queue-add-desk\" href=\"/onboard\">Add a desk</a></div></nav>\n    <div id=\"queue-all-cards\"></div>"
    )],
    ["no bind once", css, login.replace(/picker\.__queueLoginBound/g, "picker.__nope"), theme, html],
    ["phone breakpoint 859", css, login.replace("max-width:640px", "max-width:859px"), theme, html],
  ];

  let caught = 0;
  for (const [n, c, lg, th, h] of M) {
    const f = check(c, lg, th, h);
    if (f.length) caught++;
    else console.log("MUTANT SURVIVED:", n);
  }
  console.log("mutants " + caught + "/" + M.length);
  if (caught !== M.length) process.exit(1);
}
if (fails.length) { console.error(fails.join("\n")); process.exit(1); }
console.log("check-queue-panels-reserve OK");
