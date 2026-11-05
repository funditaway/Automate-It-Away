require("./_env-guard");
// Q1a: the Queue Pipes row is reserved under the banner before desk-needs.js inserts it.
// Usage: node scripts/check-queue-pipes-reserve.js [--mutants]
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const SEL = "main.wrap:has(> #queue.q-desk) > #banner:not(:has(~ #queue-pipes-row))";

function check(css, needs, html) {
  const fails = [];
  const blocks = [];
  let i = -1;
  while ((i = css.indexOf(SEL, i + 1)) >= 0) {
    const open = css.indexOf("{", i), close = css.indexOf("}", open);
    blocks.push({ at: i, body: css.slice(open + 1, close) });
  }
  if (blocks.length !== 2) fails.push("reserve rule: want 2 blocks (desktop + phone), got " + blocks.length);
  const px = (b) => { const m = /margin-bottom:\s*(\d+)px/.exec(b.body); return m ? +m[1] : -1; };
  const phoneAt = css.lastIndexOf("@media (max-width: 859px)", blocks[1] ? blocks[1].at : -1);
  if (blocks[0] && px(blocks[0]) !== 60) fails.push("desktop reserve must be 60px (8 banner + 44 tap + 8 row)");
  if (blocks[1] && px(blocks[1]) !== 62) fails.push("phone reserve must be 62px (8 banner + 44 tap + 10 row)");
  if (blocks[1] && !(phoneAt > (blocks[0] ? blocks[0].at : 0))) fails.push("phone reserve must sit in the 859px media block");
  if (!/e\.id="queue-pipes-row"/.test(needs)) fails.push("desk-needs.js no longer makes #queue-pipes-row");
  if (!/o\.parentNode\.insertBefore\(e,o\.nextSibling\)/.test(needs)) fails.push("row no longer goes right after the banner");
  if (!/id="queue" class="q-desk"/.test(html)) fails.push('desk.html #queue lost class q-desk (reserve would not apply)');
  if (!/id="banner"/.test(html)) fails.push("desk.html lost #banner");
  if (!/body\.has-desk-nav #queue-pipes-row\s*\{\s*margin:\s*0 0 10px/.test(css)) fails.push("phone row margin changed (reserve must change too)");
  return fails;
}

const css = read("phone-clear.css"), needs = read("desk-needs.js"), html = read("desk.html");
const fails = check(css, needs, html);
if (process.argv.includes("--mutants")) {
  const M = [
    ["no reserve", css.split(SEL).join("main.wrap > #nope"), needs, html],
    ["desktop 52px", css.replace("margin-bottom: 60px", "margin-bottom: 52px"), needs, html],
    ["phone 60px", css.replace("margin-bottom: 62px", "margin-bottom: 60px"), needs, html],
    ["reserve never clears", css.split(SEL).join("main.wrap:has(> #queue.q-desk) > #banner"), needs, html],
    ["row id renamed", css, needs.replace('e.id="queue-pipes-row"', 'e.id="q-pipes"'), html],
    ["row moved", css, needs.replace("o.parentNode.insertBefore(e,o.nextSibling)", "o.parentNode.appendChild(e)"), html],
    ["queue class dropped", css, needs, html.replace('id="queue" class="q-desk"', 'id="queue"')],
    ["row margin 12", css.replace(/(body\.has-desk-nav #queue-pipes-row\s*\{\s*margin:\s*)0 0 10px/, "$10 0 12px"), needs, html],
  ];
  let caught = 0;
  for (const [n, c, nd, h] of M) { const f = check(c, nd, h); if (f.length) caught++; else console.log("MUTANT SURVIVED:", n); }
  console.log("mutants " + caught + "/" + M.length);
  if (caught !== M.length) process.exit(1);
}
if (fails.length) { console.error(fails.join("\n")); process.exit(1); }
console.log("check-queue-pipes-reserve OK");
