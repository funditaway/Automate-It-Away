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
const SKIP_TAGS = { script: 1, style: 1, noscript: 1, template: 1, head: 1, title: 1, iframe: 1, datalist: 1 };
// option is not skipped: its end tag is omittable, and option text is visible
// (a <select><option> is shown on screen). skipToClose must never wait only
// on an omittable end tag; datalist (required </datalist>) still is skipped.

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
// template/head/title/iframe/datalist, closed details (summary stays), a dialog
// that is not open, and hidden elements (hidden, display:none,
// visibility:hidden, aria-hidden="true") do not count. A "/" on a non-void
// open tag is ignored, as in HTML. A p is closed by the next block start
// (p, div, section, article, h1-h6, ul, ol, table, details, header, footer,
// nav, form, pre, blockquote, hr) or by the parent's close tag. skipToClose
// ends at </tag> or the parent's close (and </head> also at <body); it never
// waits only on an omittable end tag. No jsdom, no extra deps.
function visibleForest(html) {
  const root = { name: "#root", children: [] };
  const stack = [root];
  let i = 0;
  const n = String(html).length;
  const src = String(html);
  function blocked() {
    return stack.some(function (el) { return el.skip || el.hidden || el.dialogClosed; });
  }
  function insideClosedDetails(incomingName) {
    var closed = false, inSummary = false;
    for (var s = 0; s < stack.length; s++) {
      if (stack[s].detailsClosed) { closed = true; inSummary = false; }
      if (stack[s].name === "summary") inSummary = true;
    }
    if (!closed) return false;
    if (inSummary) return false;
    if (incomingName === "summary") return false;
    return true;
  }
  function ignoring(incomingName) {
    return blocked() || insideClosedDetails(incomingName);
  }
  function current() { return stack[stack.length - 1]; }
  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function skipToClose(name) {
    // End at </name>, or at the parent's close, whichever is first.
    // Never wait only on an omittable end tag (option is not skipped;
    // head also ends at <body). An unclosed skip does not eat the
    // rest of the page past the parent.
    const slice = src.slice(i);
    const closeRe = new RegExp("</" + escapeRe(name) + "\\s*>", "i");
    const m = closeRe.exec(slice);
    let end = m ? i + m.index + m[0].length : n;
    const parent = current();
    if (parent && parent.name && parent.name !== "#root") {
      const pre = new RegExp("</" + escapeRe(parent.name) + "\\s*>", "i");
      const pm = pre.exec(slice);
      if (pm && i + pm.index < end) end = i + pm.index;
    }
    if (name === "head") {
      const bm = /<body[\s>]/i.exec(slice);
      if (bm && i + bm.index < end) end = i + bm.index;
    }
    i = end;
  }
  const P_CLOSE_BY = {
    p: 1, div: 1, section: 1, article: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1,
    ul: 1, ol: 1, table: 1, details: 1, header: 1, footer: 1, nav: 1, form: 1,
    pre: 1, blockquote: 1, hr: 1
  };
  function closeImpliedP() {
    for (var s = stack.length - 1; s > 0; s--) {
      if (stack[s].name === "p") {
        stack.length = s;
        return;
      }
    }
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
      // HTML ignores a trailing slash on non-void tags, so <p hidden/> stays open.
      // A following block start (or another p) implicitly closes an open p.
      if (P_CLOSE_BY[parsed.name]) closeImpliedP();
      const selfClose = !!VOID_TAGS[parsed.name];
      const attrs = parsed.attrs;
      const el = {
        name: parsed.name,
        hidden: tagIsHidden(tag),
        skip: !!SKIP_TAGS[parsed.name],
        detailsClosed: parsed.name === "details" && !Object.prototype.hasOwnProperty.call(attrs, "open"),
        dialogClosed: parsed.name === "dialog" && !Object.prototype.hasOwnProperty.call(attrs, "open"),
        className: attrs["class"] || "",
        children: []
      };
      if (el.skip) {
        if (!selfClose) skipToClose(parsed.name);
        continue;
      }
      if (!ignoring(parsed.name) && !el.hidden && !el.dialogClosed) current().children.push(el);
      if (!selfClose) stack.push(el);
      continue;
    }
    const next = src.indexOf("<", i);
    const raw = src.slice(i, next < 0 ? n : next);
    i = next < 0 ? n : next;
    if (!ignoring("#text") && raw) current().children.push({ name: "#text", text: raw });
  }
  return root;
}
function visibleUnits(html) {
  const units = [];
  const elements = [];
  function walk(node) {
    if (node.name === "#text") {
      const t = normSpace(node.text);
      if (t) units.push(t);
      return node.text;
    }
    const parts = (node.children || []).map(walk);
    const raw = parts.join(" ");
    const t = normSpace(raw);
    if (node.name !== "#root" && t) {
      units.push(t);
      elements.push({ name: node.name, text: t });
    }
    return raw;
  }
  const root = visibleForest(html);
  const pageText = normSpace(walk(root));
  return { units: units, elements: elements, text: pageText };
}
function hasExactVisible(html, line) {
  const want = normSpace(line);
  if (!want) return false;
  return visibleUnits(html).units.some(function (u) { return u === want; });
}

const INLINE_TAGS = {
  span: 1, a: 1, b: 1, i: 1, em: 1, strong: 1, small: 1, label: 1, abbr: 1,
  cite: 1, code: 1, q: 1, sub: 1, sup: 1, mark: 1, u: 1, s: 1, time: 1, data: 1
};
function attachVisible(node, parent) {
  node.parent = parent || null;
  if (node.name === "#text") {
    node.rawJoin = node.text;
    node.visible = normSpace(node.text);
    return;
  }
  (node.children || []).forEach(function (ch) { attachVisible(ch, node); });
  const raw = (node.children || []).map(function (ch) {
    return ch.rawJoin != null ? ch.rawJoin : "";
  }).join(" ");
  node.rawJoin = raw;
  node.visible = normSpace(raw);
}
function smallestContaining(node, want) {
  if (!node || node.name === "#text") return null;
  if (!node.visible || node.visible.indexOf(want) < 0) return null;
  var found = null;
  (node.children || []).forEach(function (ch) {
    var sub = smallestContaining(ch, want);
    if (sub) found = sub;
  });
  if (found) return found;
  return node.name === "#root" ? null : node;
}
function siblingHasVisible(parent, el, inlineOnly) {
  return (parent.children || []).some(function (ch) {
    if (ch === el) return false;
    if (ch.name === "#text") return !!normSpace(ch.text);
    if (!ch.visible) return false;
    if (inlineOnly) return !!INLINE_TAGS[ch.name];
    return true;
  });
}
// Smallest element containing the full line must equal the line. Walk up through
// pure wrappers (parent text === line). Extra visible text in the same parent
// outside that element fails, except other blocks beside a card-level container
// (so h3 / .cta stay allowed). A span/small/label/section holder is fine.
function hasExactVisibleBlock(html, line) {
  const want = normSpace(line);
  if (!want) return false;
  const root = visibleForest(html);
  attachVisible(root, null);
  var el = smallestContaining(root, want);
  if (!el) return false;
  while (el.parent && el.parent.name !== "#root" && el.parent.visible === want) {
    el = el.parent;
  }
  if (el.visible !== want) return false;
  const parent = el.parent;
  if (!parent || parent.name === "#root") return true;
  // Structural parents (article, details, section, div, ...) may have other
  // block/summary siblings (open details + summary, h3, .cta). Only an inline
  // or text sibling is a tail. Phrasing parents (p, label, li, headings) fail
  // on any extra visible sibling text.
  const STRUCTURAL_PARENTS = {
    article: 1, section: 1, div: 1, details: 1, main: 1, header: 1, footer: 1,
    aside: 1, nav: 1, form: 1, ul: 1, ol: 1, table: 1, fieldset: 1, body: 1,
    figure: 1, dl: 1, dialog: 1
  };
  const structural = !!STRUCTURAL_PARENTS[parent.name];
  if (siblingHasVisible(parent, el, structural)) return false;
  return true;
}
function pinVisibleExactBlock(hay, marker, line, label) {
  const card = cardWith(hay, marker, label);
  if (!hasExactVisibleBlock(card, line)) {
    throw new Error("missing visible exact block " + label + " payments off: " + line);
  }
  return card;
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

const ALLOWED_PHRASES = [
  "Payments are off for now.",
  "Switching a plan does not charge."
];
// Stem-based charge wording. Bare /\bpay\b/ is not used: the real page has
// "I cannot send, pay, or bind anything." Currency covers $, EUR symbol, pound,
// USD, EUR (symbol and code forms; a cheap extension of the brief's "any $ amount").
function unlistedChargeHits(text) {
  const hits = [];
  const rules = [
    [/\bcharg/i, "charge wording"],
    [/\bbill/i, "bill wording"],
    [/\bfees?\b/i, "fee wording"],
    [/\binvoices?\b/i, "invoice wording"],
    [/\bdebit/i, "debit wording"],
    [/\bsubscri/i, "subscription wording"],
    [/\brenew/i, "renew wording"],
    [/\bpay\s+now\b/i, "pay now"],
    [/\bpaid\b/i, "paid wording"],
    [/\bpayments?\s+(are|is)\s+(on|live|enabled)\b/i, "payments on/live"],
    [/\$\s*\d/, "dollar amount"],
    [/[€£]\s*\d/, "euro/pound amount"],
    [/\d(?:[.,]\d+)?\s*[€£]/, "euro/pound amount"],
    [/\b\d+(?:[.,]\d+)?\s*(USD|EUR)\b/i, "USD/EUR amount"],
    [/\b(USD|EUR)\s*\d+(?:[.,]\d+)?\b/i, "USD/EUR amount"]
  ];
  rules.forEach(function (row) {
    if (row[0].test(text)) hits.push(row[1]);
  });
  return hits;
}
function cardPinnedLine(article) {
  const t = article.visible || "";
  if (t.indexOf("Consign It Away") >= 0 && t.indexOf("First vertical") >= 0) return PAY_CONSIGN;
  if (t.indexOf("Quote ops") >= 0) return PAY_QUOTE;
  if (t.indexOf("Meta.aia") >= 0 || t.indexOf("World Pack") >= 0) return PAY_META;
  return null;
}
function enclosingCard(node) {
  var n = node;
  while (n) {
    if (n.name === "article" && /\bcard\b/.test(n.className || "")) return n;
    n = n.parent;
  }
  return null;
}
function isAllowedExact(node) {
  const t = node.visible;
  if (!t) return false;
  if (t === ALLOWED_PHRASES[0] || t === ALLOWED_PHRASES[1]) return true;
  const card = enclosingCard(node);
  const pin = card ? cardPinnedLine(card) : null;
  return !!(pin && t === pin);
}
function allAllowedLines() {
  return [PAY_CONSIGN, PAY_QUOTE, PAY_META].concat(ALLOWED_PHRASES);
}
// Whole-page charge guard. An allowed line is removed only when it is the
// whole visible text of a unit (pinned lines only inside their own card).
// An allowed phrase plus a tail in the same text unit fails.
function forbidUnlistedChargeWording(hay, label) {
  const root = visibleForest(hay);
  attachVisible(root, null);
  var remainder = [];
  var tail = null;
  const allowed = {};
  allAllowedLines().forEach(function (line) { allowed[normSpace(line)] = true; });
  function walk(node) {
    if (node.name === "#text") {
      const t = node.visible;
      if (!t) return;
      if (isAllowedExact(node)) return;
      // Fail only when leftover text follows the phrase in this text node
      // (a tail). A prefix before the phrase is allowed: the real App/webhook
      // span ends its first text node with "Payments are off for now." and a
      // following <a> sibling. Flagging ancestor elements would trip that.
      allAllowedLines().forEach(function (line) {
        const n = normSpace(line);
        const idx = t.indexOf(n);
        if (idx < 0) return;
        const after = normSpace(t.slice(idx + n.length));
        if (after) tail = t;
      });
      remainder.push(t);
      return;
    }
    if (node.name !== "#root" && isAllowedExact(node)) return;
    (node.children || []).forEach(walk);
  }
  walk(root);
  if (tail) throw new Error("invented " + label + ": allowed line with a tail: " + tail);
  const hits = unlistedChargeHits(normSpace(remainder.join(" ")));
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
  pinVisibleExactBlock(hay, CARD_CONSIGN, PAY_CONSIGN, "examples.html Consign card");
  pinVisibleExactBlock(hay, CARD_QUOTE, PAY_QUOTE, "examples.html Quote ops card");
  pinVisibleExactBlock(hay, CARD_META, PAY_META, "examples.html Meta.aia card");
  forbidUnlistedChargeWording(hay, "examples.html unlisted charge wording");
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
  }],
  ["P-T02 tail in inline span on Quote ops", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">" + PAY_QUOTE + "<span> Ever.</span></p>");
  }],
  ["P-T03 tail after br on Quote ops", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">" + PAY_QUOTE + "<br>Ever.</p>");
  }],
  ["P-T04 tail in a link on Quote ops", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">" + PAY_QUOTE + " <a href=\"#\">Just kidding.</a></p>");
  }],
  ["P-T05 prefix in b on Quote ops", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\"><b>Yes.</b> " + PAY_QUOTE + "</p>");
  }],
  ["P-T07 Quote ops line wrapped in span plus visible tail", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\"><span>" + PAY_QUOTE + "</span> Ever.</p>");
  }],
  ["P-T08 Consign tail in em", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_CONSIGN + "</p>", "<p class=\"notes\">" + PAY_CONSIGN + " <em>Except today.</em></p>");
  }],
  ["P-T11 Quote ops tail is a charge in a span", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">" + PAY_QUOTE + " <span>Then $5 is charged.</span></p>");
  }],
  ["P-T14 Meta tail in span", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_META + "</p>", "<p class=\"notes\">" + PAY_META + "<span> Ever.</span></p>");
  }],
  ["P-C01 lead: You will be charged $5.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">You will be charged $5. ");
  }],
  ["P-C03 footer: $5 a month.", function (s) {
    return s.replace("<p class=\"note\">", "<p class=\"note\">$5 a month. ");
  }],
  ["P-C05 footer: Billed monthly.", function (s) {
    return s.replace("<p class=\"note\">", "<p class=\"note\">Billed monthly. ");
  }],
  ["P-C06 lead: Your card is charged today.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">Your card is charged today. ");
  }],
  ["P-C09 lead: Payments are live.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">Payments are live. ");
  }],
  ["P-C10 lead: A $5 fee applies.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">A $5 fee applies. ");
  }],
  ["P-C11 lead: You'll be charged.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">You'll be charged. ");
  }],
  ["P-C16 step 6 flipped: Switching a plan does charge.", function (s) {
    return s.replace("Switching a plan does not charge.", "Switching a plan does charge.");
  }],
  ["P-C17 lead: Charged per month.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">Charged per month. ");
  }],
  ["P-E01 self-closing hidden p keeps the Quote ops line", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\" hidden/>" + PAY_QUOTE + "</p>");
  }],
  ["P-E02 self-closing hidden span wraps the Quote ops line", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\"><span hidden />" + PAY_QUOTE + "</p>");
  }],
  ["P-E03 self-closing template holds the Quote ops line", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">Dispatch and approve wait on Yes. Bind off.</p><template/>" + PAY_QUOTE + "</template>");
  }],
  ["P-E08 closed details holds the Quote ops line", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">Dispatch and approve wait on Yes. Bind off.</p><details><summary>More</summary><p>" + PAY_QUOTE + "</p></details>");
  }],
  ["P-E09 unopened dialog holds the Quote ops line", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">Dispatch and approve wait on Yes. Bind off.</p><dialog><p>" + PAY_QUOTE + "</p></dialog>");
  }],
  ["P-E10 title in body holds the Quote ops line", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">Dispatch and approve wait on Yes. Bind off.</p><title>" + PAY_QUOTE + "</title>");
  }],
  ["P-E11 iframe holds the Quote ops line", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">Dispatch and approve wait on Yes. Bind off.</p><iframe>" + PAY_QUOTE + "</iframe>");
  }],
  ["P-E12 datalist option holds the Quote ops line", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">Dispatch and approve wait on Yes. Bind off.</p><datalist><option>" + PAY_QUOTE + "</option></datalist>");
  }],
  ["X1 select in the lead then footer You will be charged $5.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\"><select><option>One<option>Two</select> ").replace("<p class=\"note\">", "<p class=\"note\">You will be charged $5. ");
  }],
  ["X2 select in the lead then footer Nothing is charged.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\"><select><option>One<option>Two</select> ").replace("<p class=\"note\">", "<p class=\"note\">Nothing is charged. ");
  }],
  ["X3 select in the lead then Meta line in the footer", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\"><select><option>One<option>Two</select> ").replace("<p class=\"note\">", "<p class=\"note\">" + PAY_META + " ");
  }],
  ["R-C17 select in the lead then Consign line after it", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\"><select><option>A</select> " + PAY_CONSIGN + " ");
  }],
  ["R-C13 visible select option You will be charged $5. in the lead", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\"><select><option>You will be charged $5.</option></select> ");
  }],
  ["R-A02 card has no p.notes: line in a span plus a tail span", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<span>" + PAY_QUOTE + "</span><span> Ever.</span>");
  }],
  ["R-A03 span.notes with a b tail", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<span class=\"notes\">" + PAY_QUOTE + "<b> Ever.</b></span>");
  }],
  ["R-A04 section.notes with a span tail", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<section class=\"notes\">" + PAY_QUOTE + "<span> Ever.</span></section>");
  }],
  ["R-A05 small holder with a span tail", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<small>" + PAY_QUOTE + "<span> Ever.</span></small>");
  }],
  ["R-A09 Consign line in a label with an em tail", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_CONSIGN + "</p>", "<label>" + PAY_CONSIGN + "<em> Except today.</em></label>");
  }],
  ["R-A11 prefix in b inside a span holder", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<span><b>Yes.</b> " + PAY_QUOTE + "</span>");
  }],
  ["R-B18 Quote ops cta: You will be charged $5.", function (s) {
    return s.replace("<p class=\"cta\"><a href=\"qia.html\">", "<p class=\"cta\">You will be charged $5. <a href=\"qia.html\">");
  }],
  ["R-B20 Consign h3: You will be charged $5.", function (s) {
    return s.replace("<h3>Estate · assets · auto</h3>", "<h3>Estate · assets · auto. You will be charged $5.</h3>");
  }],
  ["R-B08 lead: An invoice is sent monthly.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">An invoice is sent monthly. ");
  }],
  ["R-B09 lead: We bill you monthly.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">We bill you monthly. ");
  }],
  ["R-B10 lead: Billing starts today.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">Billing starts today. ");
  }],
  ["R-B11 lead: Payments are on.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">Payments are on. ");
  }],
  ["R-B15 lead: Your card is debited monthly.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">Your card is debited monthly. ");
  }],
  ["R-B16 lead: Subscription renews monthly.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">Subscription renews monthly. ");
  }],
  ["R-B17 lead: Pay now to continue.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">Pay now to continue. ");
  }],
  ["R-B24 lead: Paid plans only.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">Paid plans only. ");
  }],
  ["R-B12 lead: euro 5 a month.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">€5 a month. ");
  }],
  ["R-B13 lead: Plans cost 5 USD.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">Plans cost 5 USD. ");
  }],
  ["R-B14 lead: A small fee.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">A small fee. ");
  }],
  ["R-B01 allowed Switching a plan does not charge. plus a tail", function (s) {
    return s.replace("Switching a plan does not charge.", "Switching a plan does not charge. Upgrading does.");
  }],
  ["R-B02 allowed Payments are off for now. plus a tail", function (s) {
    return s.replace("Payments are off for now. <a href", "Payments are off for now. Until checkout. <a href");
  }],
  ["implicit p close still fails a Quote notes tail", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">" + PAY_QUOTE + " Ever.");
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

const examplesAccepted = [
  ["valid Quote notes without a closing p, next p.cta closes it", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">" + PAY_QUOTE);
  }],
  ["valid empty p/ before the Quote notes", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p/>" + "<p class=\"notes\">" + PAY_QUOTE + "</p>");
  }]
];
let examplesAcceptedOk = 0;
examplesAccepted.forEach(function (row) {
  const name = row[0], apply = row[1];
  const mutated = apply(examplesSrc);
  if (mutated === examplesSrc) throw new Error("accepted case does not apply: " + name);
  const err = caughtExamples(mutated);
  if (err) throw new Error("accepted HTML rejected: " + name + " (" + err.message + ")");
  examplesAcceptedOk += 1;
  console.log("ok accepted: " + name);
});
if (examplesAcceptedOk !== examplesAccepted.length) throw new Error("accepted HTML " + examplesAcceptedOk + "/" + examplesAccepted.length);
console.log("check-collect-hold accepted HTML: " + examplesAcceptedOk + "/" + examplesAccepted.length);

console.log("check-collect-hold: ok");

