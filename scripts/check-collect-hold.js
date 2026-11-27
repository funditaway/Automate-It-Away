#!/usr/bin/env node
require("./_env-guard");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function must(hay, needle, label) {
  if (!hay.includes(needle)) throw new Error("missing " + label + ": " + needle);
}
function mustNot(hay, needle, label) {
  if (hay.includes(needle)) throw new Error("invented " + label + ": " + needle);
}
function sliceBetween(hay, startNeedle, endNeedle, label) {
  const start = hay.indexOf(startNeedle);
  const end = hay.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(label + " missing");
  return hay.slice(start, end);
}

function articleCards(hay) {
  const out = [];
  const re = /<article class="card">[\s\S]*?<\/article>/g;
  let m;
  while ((m = re.exec(hay))) out.push(m[0]);
  return out;
}
function cardWith(hay, marker, label) {
  const hits = articleCards(hay).filter(function (c) { return c.includes(marker); });
  if (hits.length !== 1) throw new Error(label + " card missing or not unique");
  return hits[0];
}
function foldText(s) {
  return String(s)
    .replace(/&nbsp;?/gi, " ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, function (_, n) {
      const code = n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : parseInt(n, 10);
      if (code === 9 || code === 10 || code === 13 || code === 12 || code === 32 || code === 160) return " ";
      return String.fromCharCode(code);
    })
    .replace(/[\s\u00a0\u202f\u2007\u2009\u200a\ufeff]+/g, " ")
    .toLowerCase();
}
function hasCollectHoldVariant(hay) {
  return /\bcollect\s*hold\b/.test(foldText(hay));
}

const PAY_CONSIGN = "Photo to listing draft. Payments are off for now.";
const PAY_QUOTE = "Dispatch and approve wait on Yes. Bind off. Payments are off for now. Nothing is charged.";
const PAY_META = "The card is the UI. Desk AIs draft. You Yes / Stop. Payments are off for now. Nothing is charged.";
const CARD_CONSIGN = '<div class="top"><span>Consign It Away</span><span>First vertical</span></div>';
const CARD_QUOTE = '<div class="top"><span>Quote It Away</span><span>Quote ops</span></div>';
const CARD_META = '<div class="top"><span>Meta.aia</span><span>World Pack</span></div>';

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;?/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, function (_, n) {
      const code = n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : parseInt(n, 10);
      if (!Number.isFinite(code) || code <= 0) return "";
      try { return String.fromCodePoint(code); } catch (err) { return ""; }
    });
}
function normSpace(s) {
  return decodeEntities(s)
    .replace(/[\s\u00a0\u202f\u2007\u2009\u200a\u200b\ufeff]+/g, " ")
    .trim();
}

const VOID_TAGS = {
  area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1,
  link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1
};
const SKIP_TAGS = { script: 1, style: 1, noscript: 1, template: 1, head: 1 };

function parseOpenTag(tag) {
  const m = tag.match(/^<\s*([^\s/>]+)/);
  const name = m ? m[1].toLowerCase() : "";
  const attrs = {};
  const inner = tag.replace(/^<\s*[^\s/>]+/, "").replace(/\/?\s*>$/, "");
  const attrRe = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let am;
  while ((am = attrRe.exec(inner))) {
    attrs[am[1].toLowerCase()] = am[2] != null ? am[2] : am[3] != null ? am[3] : am[4] != null ? am[4] : "";
  }
  return { name: name, attrs: attrs };
}
function tagIsHidden(tag) {
  const attrs = parseOpenTag(tag).attrs;
  if (Object.prototype.hasOwnProperty.call(attrs, "hidden")) return true;
  if (String(attrs["aria-hidden"] || "").toLowerCase() === "true") return true;
  const style = String(attrs.style || "");
  if (/display\s*:\s*none/i.test(style)) return true;
  if (/visibility\s*:\s*hidden/i.test(style)) return true;
  return false;
}

// Node-only visible-text extractor. Comments, attributes, script/style/noscript/
// template/head, and hidden elements (hidden, display:none, visibility:hidden,
// aria-hidden="true") do not count. No jsdom, no extra deps.
function visibleForest(html) {
  const root = { name: "#root", children: [] };
  const stack = [root];
  let i = 0;
  const n = String(html).length;
  const src = String(html);
  function ignoring() {
    return stack.some(function (el) { return el.skip || el.hidden; });
  }
  function current() { return stack[stack.length - 1]; }
  function skipToClose(name) {
    const re = new RegExp("</" + name + "\\s*>", "i");
    const slice = src.slice(i);
    const m = re.exec(slice);
    i = m ? i + m.index + m[0].length : n;
  }
  while (i < n) {
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src[i] === "<") {
      const end = src.indexOf(">", i);
      if (end < 0) break;
      const tag = src.slice(i, end + 1);
      i = end + 1;
      if (/^<!|^<\?/.test(tag)) continue;
      if (/^<\s*\//.test(tag)) {
        const name = (tag.match(/^<\s*\/\s*([^\s>]+)/) || [null, ""])[1].toLowerCase();
        for (let s = stack.length - 1; s > 0; s--) {
          if (stack[s].name === name) {
            stack.length = s;
            break;
          }
        }
        continue;
      }
      const parsed = parseOpenTag(tag);
      const selfClose = /\/\s*>$/.test(tag) || VOID_TAGS[parsed.name];
      const el = {
        name: parsed.name,
        hidden: tagIsHidden(tag),
        skip: !!SKIP_TAGS[parsed.name],
        children: []
      };
      if (el.skip) {
        if (!selfClose) skipToClose(parsed.name);
        continue;
      }
      if (!ignoring() && !el.hidden) current().children.push(el);
      if (!selfClose) stack.push(el);
      continue;
    }
    const next = src.indexOf("<", i);
    const raw = src.slice(i, next < 0 ? n : next);
    i = next < 0 ? n : next;
    if (!ignoring() && raw) current().children.push({ name: "#text", text: raw });
  }
  return root;
}
function visibleUnits(html) {
  const units = [];
  function walk(node) {
    if (node.name === "#text") {
      const t = normSpace(node.text);
      if (t) units.push(t);
      return node.text;
    }
    const parts = (node.children || []).map(walk);
    const raw = parts.join(" ");
    const t = normSpace(raw);
    if (node.name !== "#root" && t) units.push(t);
    return raw;
  }
  const root = visibleForest(html);
  const pageText = normSpace(walk(root));
  return { units: units, text: pageText };
}
function hasExactVisible(html, line) {
  const want = normSpace(line);
  if (!want) return false;
  return visibleUnits(html).units.some(function (u) { return u === want; });
}

function pinVisibleExact(hay, marker, line, label) {
  const card = cardWith(hay, marker, label);
  if (!hasExactVisible(card, line)) {
    throw new Error("missing visible exact " + label + " payments off: " + line);
  }
  return card;
}
function forbidVisibleElsewhere(hay, marker, line, label) {
  const card = cardWith(hay, marker, label);
  const start = hay.indexOf(card);
  if (start < 0) throw new Error(label + " card missing");
  const rest = hay.slice(0, start) + hay.slice(start + card.length);
  if (visibleUnits(rest).text.includes(normSpace(line))) {
    throw new Error(line + " is visible outside " + label);
  }
}
function extraChargeHits(text) {
  const hits = [];
  const rules = [
    [/nothing is charged/i, "Nothing is charged"],
    [/charged monthly/i, "charged monthly"],
    [/you are charged/i, "You are charged"],
    [/\bwe charge/i, "we charge"],
    [/\$\s*\d[\d,]*(?:\.\d+)?\s*(?:\/\s*|per\s+)(?:mo(?:nth)?|yr|year|wk|week|da(?:y)?)/i, "price-per-period"]
  ];
  rules.forEach(function (row) {
    if (row[0].test(text)) hits.push(row[1]);
  });
  return hits;
}
function forbidExtraChargeLines(hay, allowedLines, label) {
  let text = visibleUnits(hay).text;
  allowedLines.forEach(function (line) {
    const n = normSpace(line);
    let idx;
    while ((idx = text.indexOf(n)) >= 0) {
      text = normSpace(text.slice(0, idx) + " " + text.slice(idx + n.length));
    }
  });
  const hits = extraChargeHits(text);
  if (hits.length) throw new Error("invented " + label + ": " + hits.join(", "));
}

function pinCardLine(hay, marker, line, label) {
  const card = cardWith(hay, marker, label);
  must(card, line, label + " payments off");
  articleCards(hay).forEach(function (c) {
    if (c !== card && c.includes(line)) throw new Error(line + " is not pinned to " + label + " alone");
  });
  return card;
}

// Real examples.html helper used by the main path and by every in-script mutant.
function checkExamplesPayments(hay) {
  must(hay, PAY_CONSIGN, "examples.html Consign payments off");
  mustNot(hay, "Collect HOLD", "examples.html Collect jargon");
  must(hay, PAY_QUOTE, "examples.html Quote ops payments off");
  must(hay, PAY_META, "examples.html Meta.aia payments off");
  pinCardLine(hay, CARD_CONSIGN, PAY_CONSIGN, "examples.html Consign card");
  pinCardLine(hay, CARD_QUOTE, PAY_QUOTE, "examples.html Quote ops card");
  pinCardLine(hay, CARD_META, PAY_META, "examples.html Meta.aia card");
  if (hasCollectHoldVariant(hay)) throw new Error("invented examples.html Collect jargon variant");
  pinVisibleExact(hay, CARD_CONSIGN, PAY_CONSIGN, "examples.html Consign card");
  pinVisibleExact(hay, CARD_QUOTE, PAY_QUOTE, "examples.html Quote ops card");
  pinVisibleExact(hay, CARD_META, PAY_META, "examples.html Meta.aia card");
  forbidVisibleElsewhere(hay, CARD_CONSIGN, PAY_CONSIGN, "examples.html Consign card");
  forbidVisibleElsewhere(hay, CARD_QUOTE, PAY_QUOTE, "examples.html Quote ops card");
  forbidVisibleElsewhere(hay, CARD_META, PAY_META, "examples.html Meta.aia card");
  forbidExtraChargeLines(hay, [PAY_CONSIGN, PAY_QUOTE, PAY_META], "examples.html extra charge wording");
}

const index = read("index.html");
const help = read("help.html");
const consign = read("consign.html");
const yesNo = read("ACCOUNT-YES-NO.md");
const packMd = read("PACK.md");
const pkg = read("package.json");
const nav = read("desk-nav.js");

const follow = sliceBetween(index, "<b>Keep the follow-up</b>", "</div>", "index.html follow-up");
must(follow, "One nudge. Then it stops.", "follow-up one nudge");
must(follow, "Payments are off for now.", "follow-up payments off");
mustNot(follow, "Collect stays HOLD", "follow-up Collect jargon");
mustNot(follow, "Money waits only if you wrote that rule", "follow-up rule-gated live money");

const bills = sliceBetween(index, "<b>Bills</b>", "</div>", "index.html Bills");
must(bills, "Bill due on the card. Payments are off for now.", "Bills payments off");
mustNot(bills, "lets the money move", "Bills owner lets money move");
mustNot(bills, "money-wait rule", "Bills money-wait as live pipe");

const collectDd = sliceBetween(help, "<dt>Collect</dt>", "<dt>Open</dt>", "help.html Collect dd");
must(collectDd, "Collect stays HOLD until a person taps Yes and a real money pipe is live.", "Collect dd HOLD");
must(collectDd, "Helper can prep the draft", "Collect dd helper preps");
must(collectDd, "Yes is not a collect charge", "Collect dd Yes is not a collect charge");
mustNot(collectDd, "Owner lets the money move", "Collect dd owner lets money move");
mustNot(collectDd, "Only if the owner wrote that rule", "Collect dd rule-gated live money");

const paidStep = sliceBetween(consign, "<b>4 Collect HOLD</b>", "</div>", "consign.html 4 Collect HOLD");
must(paidStep, "Square stays HOLD until Yes + a real money pipe", "consign Square HOLD");
mustNot(consign, "4 Paid", "consign live Paid step");
mustNot(consign, "Square payout", "consign live Square payout");
mustNot(consign, "Seller gets paid", "consign live seller paid");
must(consign, "Collect HOLD until Yes + a real money pipe", "consign lead Collect HOLD");

[follow, bills, collectDd, paidStep, consign].forEach(function (hay, i) {
  const name = ["follow-up", "Bills", "Collect dd", "consign 4", "consign.html"][i];
  mustNot(hay, "AIA coin", name + " AIA coin");
  mustNot(hay, "compute credits", name + " compute credits");
});
["index.html", "help.html", "consign.html"].forEach(function (name) {
  mustNot(read(name), "drop-pack.js", name + " loads drop-pack.js");
});
mustNot(nav, "drop-pack.js", "desk-nav loads drop-pack.js");

if (/\$\d/.test(follow) || /\$\d/.test(bills) || /\$\d/.test(collectDd) || /\$\d/.test(paidStep)) {
  throw new Error("leftover Collect copy invented a price");
}

must(yesNo, "check-collect-hold.js", "ACCOUNT-YES-NO records leftover Collect honesty");
must(yesNo, "index.html follow-up", "ACCOUNT-YES-NO names index follow-up");
must(yesNo, "help.html Collect", "ACCOUNT-YES-NO names help Collect dd");
must(yesNo, "consign.html", "ACCOUNT-YES-NO names consign.html");
must(packMd, "index.html follow-up", "PACK.md names index follow-up");
must(packMd, "help.html Collect", "PACK.md names help Collect");
must(packMd, "consign.html", "PACK.md names consign.html");
must(pkg, "check-collect-hold.js", "package.json runs check-collect-hold");

const leftover = {
  "setup.html": read("setup.html"),
  "examples.html": read("examples.html"),
  "setup-demo.js": read("setup-demo.js"),
  "api/_packs.js": read("api/_packs.js"),
  "pack-card.js": read("pack-card.js"),
  "desk-queue-packs.js": read("desk-queue-packs.js"),
  "drop-packs.js": read("drop-packs.js"),
  "packs/consign.json": read("packs/consign.json"),
  "api/_engine.js": read("api/_engine.js"),
  "pricing.html": read("pricing.html"),
  "legal.html": read("legal.html")
};
Object.keys(leftover).forEach(function (name) {
  const hay = leftover[name];
  mustNot(hay, "Payout waits", name + " live payout waits");
  mustNot(hay, "Seller gets paid", name + " live seller paid");
  mustNot(hay, "lets the money move", name + " owner lets money move");
  mustNot(hay, "Collect when due", name + " live Collect when due");
  mustNot(hay, "AIA coin", name + " AIA coin");
  mustNot(hay, "compute credits", name + " compute credits");
  mustNot(hay, "drop-pack.js", name + " loads drop-pack.js");
});
must(leftover["setup.html"], "Photo to listing draft. Payments are off for now.", "setup.html Consign payments off");
mustNot(leftover["setup.html"], "Collect HOLD", "setup.html Collect jargon");
checkExamplesPayments(leftover["examples.html"]);
must(leftover["setup-demo.js"], "Photo to comps to listing draft. Payments are off for now.", "setup-demo estate payments off");
must(leftover["api/_packs.js"], "Photo in. Listing draft. Collect HOLD until Yes + a real money pipe.", "marketplace consign HOLD");
must(leftover["pack-card.js"], "Draft a listing. Collect HOLD until Yes + a real money pipe.", "pack-card consign HOLD");
must(leftover["desk-queue-packs.js"], "Collect HOLD until Yes + a real money pipe.", "queue consign empty HOLD");
must(leftover["packs/consign.json"], "Collect HOLD until Yes + a real money pipe.", "consign.json HOLD");
must(leftover["api/_engine.js"], "Collect stays HOLD until Yes + a real money pipe.", "engine consign hold rec HOLD");
must(leftover["pricing.html"], "Payments are off for now.", "pricing note payments off");
mustNot(leftover["pricing.html"], "Collect stays HOLD", "pricing Collect jargon");
mustNot(leftover["pricing.html"], "Per shipped job", "pricing live per-job bill");
must(leftover["legal.html"], "Collect stays HOLD until a person taps Yes and a real money pipe is live.", "legal lead HOLD");
mustNot(leftover["legal.html"], "We bill shipped jobs", "legal live shipped-job bill");
mustNot(leftover["legal.html"], "before money moves", "legal money-moves-alone");
mustNot(leftover["legal.html"], "The agent may draft", "legal agent may draft");
must(leftover["legal.html"], "Desk AIs draft. Humans Yes / Stop / Kill.", "legal Desk AIs draft");
  must(leftover["legal.html"], "A Desk AI can draft when drafts are on.", "legal Desk AI drafts-on");
  mustNot(leftover["legal.html"], "our key", "legal our-key honesty");
must(yesNo, "Legal / Studio Desk AI leftover", "ACCOUNT-YES-NO names Legal / Studio Desk AI leftover");
must(packMd, "Legal / Studio Desk AI leftover", "PACK.md names Legal / Studio Desk AI leftover");
must(yesNo, "setup.html", "ACCOUNT-YES-NO names setup.html leftover");
must(yesNo, "pricing.html", "ACCOUNT-YES-NO names pricing.html leftover");
must(packMd, "setup.html", "PACK.md names setup.html leftover");
must(packMd, "pricing.html", "PACK.md names pricing.html leftover");

function swapOnce(hay, a, b) {
  if (hay.split(a).length !== 2 || hay.split(b).length !== 2) throw new Error("swap does not apply");
  return hay.replace(a, "\0SWAP\0").replace(b, a).replace("\0SWAP\0", b);
}
function caughtExamples(hay) {
  try {
    checkExamplesPayments(hay);
    return null;
  } catch (err) {
    return err;
  }
}

const examplesSrc = leftover["examples.html"];
const examplesMutants = [
  ["Quote ops Collect HOLD restored", function (s) { return s.replace(PAY_QUOTE, "Dispatch and approve wait on Yes. Bind off. Collect HOLD."); }],
  ["Meta.aia Collect HOLD restored", function (s) { return s.replace(PAY_META, "The card is the UI. Desk AIs draft. You Yes / Stop. Collect HOLD."); }],
  ["Quote ops payments line reworded", function (s) { return s.replace(PAY_QUOTE, "Dispatch and approve wait on Yes. Bind off. Payments are paused for now. Nothing is charged."); }],
  ["Meta.aia payments line reworded", function (s) { return s.replace(PAY_META, "The card is the UI. Desk AIs draft. You Yes / Stop. Payments are paused for now. Nothing is charged."); }],
  ["Quote ops payments line dropped", function (s) { return s.replace(PAY_QUOTE, "Dispatch and approve wait on Yes. Bind off."); }],
  ["Meta.aia payments line dropped", function (s) { return s.replace(PAY_META, "The card is the UI. Desk AIs draft. You Yes / Stop."); }],
  ["swap Quote ops and Meta.aia payments-off lines", function (s) { return swapOnce(s, PAY_QUOTE, PAY_META); }],
  ["remove Consign payments-off from that card only", function (s) { return s.replace(PAY_CONSIGN, "Photo to listing draft."); }],
  ["duplicate Quote ops line onto Meta.aia and remove it from Quote ops", function (s) {
    return s.replace(PAY_QUOTE, "Dispatch and approve wait on Yes. Bind off.").replace(PAY_META, PAY_META + " " + PAY_QUOTE);
  }],
  ["move Quote ops payments-off line outside the card", function (s) {
    return s.replace(PAY_QUOTE, "Dispatch and approve wait on Yes. Bind off.").replace("<p class=\"lead\">", "<p class=\"lead\">" + PAY_QUOTE + " ");
  }],
  ["reword Consign payments-off on that card only", function (s) { return s.replace(PAY_CONSIGN, "Photo to listing draft. Payments are paused for now."); }],
  ["Collect hold case variant kept beside the Quote ops line", function (s) { return s.replace(PAY_QUOTE, PAY_QUOTE + " Collect hold."); }],
  ["Collect&nbsp;HOLD entity variant kept beside the Quote ops line", function (s) { return s.replace(PAY_QUOTE, PAY_QUOTE + " Collect&nbsp;HOLD."); }],
  ["COLLECT HOLD case variant in the lead", function (s) { return s.replace("<p class=\"lead\">", "<p class=\"lead\">COLLECT HOLD. "); }],
  ["Collect&#160;HOLD numeric entity in the lead", function (s) { return s.replace("<p class=\"lead\">", "<p class=\"lead\">Collect&#160;HOLD. "); }],
  ["move Consign payments-off line outside the card", function (s) {
    return s.replace(PAY_CONSIGN, "Photo to listing draft.").replace("<p class=\"lead\">", "<p class=\"lead\">" + PAY_CONSIGN + " ");
  }],
  ["comment copy of Quote ops payments-off on that card", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">Dispatch and approve wait on Yes. Bind off.<!-- " + PAY_QUOTE + " --></p>");
  }],
  ["attribute copy of Quote ops payments-off on that card", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\" title=\"" + PAY_QUOTE + "\">Dispatch and approve wait on Yes. Bind off.</p>");
  }],
  ["hidden attribute on the Quote ops notes p", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\" hidden>" + PAY_QUOTE + "</p>");
  }],
  ["display:none on the Quote ops notes p", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\" style=\"display:none\">" + PAY_QUOTE + "</p>");
  }],
  ["visibility:hidden on the Quote ops notes p", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\" style=\"visibility:hidden\">" + PAY_QUOTE + "</p>");
  }],
  ["aria-hidden on the Quote ops notes p", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\" aria-hidden=\"true\">" + PAY_QUOTE + "</p>");
  }],
  ["template copy of Quote ops payments-off on that card", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">Dispatch and approve wait on Yes. Bind off.</p><template>" + PAY_QUOTE + "</template>");
  }],
  ["script copy of Quote ops payments-off on that card", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">Dispatch and approve wait on Yes. Bind off.</p><script>" + PAY_QUOTE + "</script>");
  }],
  ["style copy of Quote ops payments-off on that card", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">Dispatch and approve wait on Yes. Bind off.</p><style>" + PAY_QUOTE + "</style>");
  }],
  ["noscript copy of Quote ops payments-off on that card", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">Dispatch and approve wait on Yes. Bind off.</p><noscript>" + PAY_QUOTE + "</noscript>");
  }],
  ["hidden p on the Quote ops card keeps the payments-off line", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">Dispatch and approve wait on Yes. Bind off.</p><p hidden>" + PAY_QUOTE + "</p>");
  }],
  ["trailing Ever. on the Quote ops payments-off line", function (s) {
    return s.replace(PAY_QUOTE, PAY_QUOTE + " Ever.");
  }],
  ["leading prefix on the Quote ops payments-off line", function (s) {
    return s.replace(PAY_QUOTE, "Note: " + PAY_QUOTE);
  }],
  ["extra charge line in the page lead", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">You are charged monthly. ");
  }],
  ["extra charge line in the page footer", function (s) {
    return s.replace("<p class=\"note\">", "<p class=\"note\">Nothing is charged. ");
  }],
  ["copy Meta.aia payments-off line into the page lead", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">" + PAY_META + " ");
  }],
  ["copy Quote ops payments-off line outside any card", function (s) {
    return s.replace("<p class=\"note\">", "<p class=\"note\">" + PAY_QUOTE + " ");
  }]
];
let examplesCaught = 0;
examplesMutants.forEach(function (row) {
  const name = row[0], apply = row[1];
  const mutated = apply(examplesSrc);
  if (mutated === examplesSrc) throw new Error("mutant does not apply: " + name);
  const err = caughtExamples(mutated);
  if (!err) throw new Error("mutant NOT caught: " + name);
  examplesCaught += 1;
  console.log("ok mutant caught: " + name + " (" + err.message + ")");
});
if (examplesCaught !== examplesMutants.length) throw new Error("examples payments mutants " + examplesCaught + "/" + examplesMutants.length);
console.log("check-collect-hold examples payments mutants: " + examplesCaught + "/" + examplesMutants.length + " caught");

console.log("check-collect-hold: ok");
