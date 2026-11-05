require("./_env-guard");
// Q1a(c): desk-picker reserved under the title only when html.queue-may-pick
// (signed-in). Strangers skip the empty margin so signed-out LCP stays.
// Usage: node scripts/check-queue-panels-reserve.js [--mutants]
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const SEL = "html.queue-may-pick main.wrap > h1.page-title:not(:has(~ #queue-desk-picker))";

function check(css, login, theme, html) {
  const fails = [];
  if (/main\.wrap\s*>\s*h1\.page-title:not\(:has\(~\s*#queue-desk-picker\)\)\s*\{[^}]*margin-bottom/.test(css)
      && !/html\.queue-may-pick\s+main\.wrap\s*>\s*h1\.page-title:not\(:has\(~\s*#queue-desk-picker\)\)/.test(css)) {
    fails.push("reserve must be gated on html.queue-may-pick (unsigned reserve blows stranger LCP)");
  }
  const blocks = [];
  let i = -1;
  while ((i = css.indexOf(SEL, i + 1)) >= 0) {
    const open = css.indexOf("{", i), close = css.indexOf("}", open);
    blocks.push({ at: i, body: css.slice(open + 1, close) });
  }
  if (blocks.length !== 2) fails.push("reserve rule: want 2 blocks (desktop + phone), got " + blocks.length);
  const px = (b) => { const m = /margin-bottom:\s*(\d+)px/.exec(b.body); return m ? +m[1] : -1; };
  const phoneAt = css.lastIndexOf("@media (max-width: 640px)", blocks[1] ? blocks[1].at : -1);
  if (blocks[0] && px(blocks[0]) !== 96) fails.push("desktop reserve must be 96px (10 title + 74 picker + 12 margin)");
  if (blocks[1] && px(blocks[1]) !== 156) fails.push("phone reserve must be 156px (10 title + 134 picker + 12 margin)");
  if (blocks[1] && !(phoneAt > (blocks[0] ? blocks[0].at : 0))) fails.push("phone reserve must sit in the 640px media block");
  if (!/queue-may-pick/.test(theme) || !/aia_session/.test(theme) || !/aia_pin/.test(theme)) {
    fails.push("theme.js must set html.queue-may-pick from aia_session or aia_pin before paint");
  }
  if (!/id = "queue-desk-picker"/.test(login) && !/id=\"queue-desk-picker\"/.test(login)) fails.push("queue-login.js no longer makes #queue-desk-picker");
  if (!/insertBefore\(picker,\s*h1\.nextSibling\)/.test(login)) fails.push("picker no longer goes right after the title");
  if (!/class="page-title"/.test(html) || !/>Queue<\/h1>/.test(html)) fails.push("desk.html lost h1.page-title Queue (reserve would not apply)");
  if (fs.statSync(path.join(root, "desk.html")).size !== 35055) fails.push("desk.html must stay 35055 bytes");
  if (!/#queue-desk-picker\{margin:0 0 12px\}/.test(login)) fails.push("picker margin-bottom changed (reserve must change too)");
  if (!/max-width:640px/.test(login)) fails.push("queue-login.js lost 640px phone stack (reserve breakpoint must match)");
  return fails;
}

const css = read("phone-clear.css"), login = read("queue-login.js"), theme = read("theme.js"), html = read("desk.html");
const fails = check(css, login, theme, html);
if (process.argv.includes("--mutants")) {
  const M = [
    ["ungated reserve", css.split("html.queue-may-pick ").join(""), login, theme, html],
    ["no reserve", css.split(SEL).join("html.queue-may-pick main.wrap > h1.nope"), login, theme, html],
    ["desktop 80px", css.replace(SEL + " {\n  margin-bottom: 96px;", SEL + " {\n  margin-bottom: 80px;"), login, theme, html],
    ["phone 140px", css.replace("margin-bottom: 156px", "margin-bottom: 140px"), login, theme, html],
    ["reserve never clears", css.split(SEL).join("html.queue-may-pick main.wrap > h1.page-title"), login, theme, html],
    ["no theme may-pick", css, login, theme.replace(/queue-may-pick/g, "queue-nope"), html],
    ["picker id renamed", css, login.replace('id = "queue-desk-picker"', 'id = "q-picker"'), theme, html],
    ["picker moved", css, login.replace("insertBefore(picker, h1.nextSibling)", "insertBefore(picker, queue)"), theme, html],
    ["phone breakpoint 859", css.replace("@media (max-width: 640px)", "@media (max-width: 859px)"), login, theme, html],
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
