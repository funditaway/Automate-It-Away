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
// on an omittable end tag. datalist is skipped, but the skip ends at its own
// </datalist> or at the nearest open ancestor's close tag, whichever is first
// — it must never run to EOF just because </datalist> is missing.

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
// nav, form, pre, blockquote, hr) or by the parent's close tag. Raw-text
// elements (script, style, title, textarea, noscript, iframe) end at the
// FIRST case-insensitive matching close tag; inner markup is not depth-
// tracked. That matches a browser with scripting on for noscript, and iframe
// as raw text: content after that first close is visible. datalist ends at
// its own </datalist> or the nearest open ancestor's close tag, whichever
// is first, and never runs to EOF just because </datalist> is missing.
// template and other non-raw skips still track the nesting depth of their
// own tag name. </head> also ends at <body. No jsdom, no extra deps.
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
    // Raw-text elements end at the FIRST case-insensitive matching close
    // tag; inner markup is not parsed or depth-tracked (a nested
    // </noscript> or </iframe> does not wait for a second close). Content
    // after that first close is visible. Matches a browser with scripting
    // on for noscript, and iframe as raw text.
    const RAW_TEXT = { script: 1, style: 1, title: 1, textarea: 1, noscript: 1, iframe: 1 };
    if (RAW_TEXT[name]) {
      // Browsers also close at an end tag carrying attributes or a slash
      // (</name data-x>, </name/>), not only </name> or </name >.
      const closeRe = new RegExp("</" + escapeRe(name) + "(?=[\\s/>])[^>]*>", "i");
      const m = closeRe.exec(src.slice(i));
      i = m ? i + m.index + m[0].length : n;
      return;
    }
    // datalist: end at </datalist> or at the nearest open ancestor's close
    // tag, whichever comes first. Never run to EOF just because
    // </datalist> is missing (browser implies a close at the parent, e.g.
    // </p> in <p>...<datalist><option>x</p>).
    if (name === "datalist") {
      const parentName = current().name !== "#root" ? current().name : null;
      let pos = i;
      while (pos < n) {
        if (src.startsWith("<!--", pos)) {
          const endC = src.indexOf("-->", pos + 4);
          pos = endC < 0 ? n : endC + 3;
          continue;
        }
        const lt = src.indexOf("<", pos);
        if (lt < 0) break;
        const gt = src.indexOf(">", lt);
        if (gt < 0) break;
        const tag = src.slice(lt, gt + 1);
        if (/^<\/datalist\s*>/i.test(tag)) {
          i = gt + 1;
          return;
        }
        if (parentName && new RegExp("^</" + escapeRe(parentName) + "\\s*>", "i").test(tag)) {
          i = lt;
          return;
        }
        pos = gt + 1;
      }
      // No own close and no parent close: do not run to EOF.
      return;
    }
    // Every other non-raw skip (template, head, …) tracks the nesting
    // depth of ITS OWN tag name and ends only at the matching close. An
    // inner </div> cannot end a template/head early; a nested <template>
    // inside a <template> waits for the outer close.
    let depth = 1;
    while (i < n && depth > 0) {
      if (src.startsWith("<!--", i)) {
        const end = src.indexOf("-->", i + 4);
        i = end < 0 ? n : end + 3;
        continue;
      }
      const lt = src.indexOf("<", i);
      if (lt < 0) { i = n; return; }
      i = lt;
      if (name === "head" && /^<body[\s>]/i.test(src.slice(i))) return;
      const gt = src.indexOf(">", i);
      if (gt < 0) { i = n; return; }
      const tag = src.slice(i, gt + 1);
      i = gt + 1;
      if (/^<!|^<\?/.test(tag)) continue;
      const tname = (tag.match(/^<\s*\/?\s*([^\s/>]+)/) || [null, ""])[1].toLowerCase();
      if (tname !== name) continue;
      if (/^<\s*\//.test(tag)) depth--;
      else if (!VOID_TAGS[name]) depth++;
    }
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
      // textarea is raw-text and visible: do not parse inner markup.
      if (parsed.name === "textarea" && !selfClose) {
        const closeRe = new RegExp("</textarea(?=[\\s/>])[^>]*>", "i");
        const slice = src.slice(i);
        const m = closeRe.exec(slice);
        const raw = src.slice(i, m ? i + m.index : n);
        i = m ? i + m.index + m[0].length : n;
        if (!ignoring("textarea") && !el.hidden && !el.dialogClosed) {
          current().children.push(el);
          if (raw) el.children.push({ name: "#text", text: raw });
        }
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
// Raw-source charge/payments guard. Scans the WHOLE examples.html source
// case-insensitively (comments, attributes, hidden elements, scripts, styles
// included). Hidden text counts on purpose. No extractor is used.
//
// Word list: the stems already used by this check, plus /\bpayments?\b/i.
// Bare /\bpay\b/ is not used: the real page has "I cannot send, pay, or bind
// anything."
const CHARGE_WORD_RES = [
  /\bcharg/i,
  /\bbill/i,
  /\bfees?\b/i,
  /\binvoices?\b/i,
  /\bdebit/i,
  /\bsubscri/i,
  /\brenew/i,
  /\bpay\s+now\b/i,
  /\bpaid\b/i,
  /\$\s*\d/,
  /[€£]\s*\d/,
  /\d(?:[.,]\d+)?\s*[€£]/,
  /\b\d+(?:[.,]\d+)?\s*(USD|EUR)\b/i,
  /\b(USD|EUR)\s*\d+(?:[.,]\d+)?\b/i,
  /\bpayments?\b/i
];

// Allowed phrases as they appear in today's raw source, with literal counts
// from a full-file audit (7 word-list hits, all inside these phrases).
// Do not widen this list without a new audit.
const RAW_ALLOWED_PHRASES = [
  [PAY_CONSIGN, 1],
  [PAY_QUOTE, 1],
  [PAY_META, 1],
  ["Payments are off for now.", 4],
  ["Switching a plan does not charge.", 1]
];

function allowedPhraseRanges(hay) {
  const ranges = [];
  RAW_ALLOWED_PHRASES.forEach(function (row) {
    const phrase = row[0], want = row[1];
    let from = 0, n = 0;
    while (true) {
      const i = hay.indexOf(phrase, from);
      if (i < 0) break;
      ranges.push([i, i + phrase.length]);
      n += 1;
      from = i + phrase.length;
    }
    if (n !== want) {
      throw new Error(
        "examples.html raw source: " + JSON.stringify(phrase) +
        " appears " + n + " time(s), expected " + want
      );
    }
  });
  return ranges;
}

function rangeCovers(index, ranges) {
  return ranges.some(function (r) { return index >= r[0] && index < r[1]; });
}

function forbidRawChargeHits(hay) {
  const ranges = allowedPhraseRanges(hay);
  CHARGE_WORD_RES.forEach(function (re) {
    const flags = re.flags.indexOf("g") >= 0 ? re.flags : re.flags + "g";
    const g = new RegExp(re.source, flags);
    let m;
    while ((m = g.exec(hay))) {
      if (!rangeCovers(m.index, ranges)) {
        const around = hay.slice(Math.max(0, m.index - 24), m.index + Math.max(m[0].length, 1) + 24)
          .replace(/\s+/g, " ");
        throw new Error("examples.html raw source: unlisted charge/payments wording at " + m.index + ": " + around);
      }
      if (!m[0].length) g.lastIndex += 1;
    }
  });
}

// Visible-text snapshot of examples.html, compared to
// scripts/fixtures/examples-visible.txt (generated from the real page).
//
// Normalization: walk the current extractor's visible forest in document
// order. Emit one line per block-level element. A block flushes its direct
// text and inline descendants, passed through normSpace (decode already
// happened in the forest; whitespace including NBSP collapses to a single
// space; trim). Child blocks are emitted as their own lines. Empty lines
// are dropped. The file ends with a trailing newline.
// Any added, moved, removed, or reworded visible copy fails. On mismatch,
// print the first differing line (fixture vs page) so a copy PR can update
// the fixture.
const SNAPSHOT_BLOCK = {
  html: 1, body: 1, header: 1, footer: 1, main: 1, nav: 1, section: 1, article: 1,
  aside: 1, div: 1, p: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1,
  ul: 1, ol: 1, li: 1, dl: 1, dt: 1, dd: 1, table: 1, thead: 1, tbody: 1, tfoot: 1,
  tr: 1, td: 1, th: 1, form: 1, fieldset: 1, pre: 1, blockquote: 1, hr: 1,
  figure: 1, figcaption: 1, address: 1, details: 1
};
const VISIBLE_SNAPSHOT_PATH = "scripts/fixtures/examples-visible.txt";

function visibleSnapshot(html) {
  const root = visibleForest(html);
  const lines = [];
  function flush(buf) {
    const t = normSpace(buf.join(" "));
    if (t) lines.push(t);
    buf.length = 0;
  }
  function walk(node, buf) {
    if (!node) return;
    if (node.name === "#text") {
      if (node.text) buf.push(node.text);
      return;
    }
    if (SNAPSHOT_BLOCK[node.name]) {
      const inner = [];
      (node.children || []).forEach(function (ch) {
        if (ch.name === "#text") {
          walk(ch, inner);
        } else if (SNAPSHOT_BLOCK[ch.name]) {
          flush(inner);
          walk(ch, inner);
          flush(inner);
        } else {
          walk(ch, inner);
        }
      });
      flush(inner);
      return;
    }
    (node.children || []).forEach(function (ch) { walk(ch, buf); });
  }
  walk(root, []);
  return lines.join("\n") + (lines.length ? "\n" : "");
}

function firstSnapshotDiff(expected, actual) {
  const e = expected.split("\n");
  const a = actual.split("\n");
  let i = 0;
  while (i < e.length && i < a.length && e[i] === a[i]) i += 1;
  return {
    line: i + 1,
    old: i < e.length ? e[i] : "(end)",
    neu: i < a.length ? a[i] : "(end)"
  };
}

function pinVisibleSnapshot(hay) {
  const expected = fs.readFileSync(path.join(root, VISIBLE_SNAPSHOT_PATH), "utf8");
  const actual = visibleSnapshot(hay);
  if (actual !== expected) {
    const d = firstSnapshotDiff(expected, actual);
    throw new Error(
      "examples.html visible text drifted at line " + d.line +
      "\n  fixture: " + d.old +
      "\n  page:    " + d.neu
    );
  }
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
  forbidRawChargeHits(hay);
  pinVisibleSnapshot(hay);
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
,
  ["G1 noscript in a div holds an inner div then the Quote ops line", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">Dispatch and approve wait on Yes. Bind off.</p><div><noscript><div>Turn on JS.</div><p class=\"notes\">" + PAY_QUOTE + "</p></noscript></div>");
  }],
  ["G1 template in a div holds an inner div then the Quote ops line", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">Dispatch and approve wait on Yes. Bind off.</p><div><template><div></div><p class=\"notes\">" + PAY_QUOTE + "</p></template></div>");
  }],
  ["G1 nested template-in-template holds the Quote ops line", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">Dispatch and approve wait on Yes. Bind off.</p><template><template></template><p class=\"notes\">" + PAY_QUOTE + "</p></template>");
  }],
  ["G2 div.notes: line in a span plus a custom x-tail", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<div class=\"notes\"><span>" + PAY_QUOTE + "</span><x-tail> Ever.</x-tail></div>");
  }],
  ["G2 span holder plus a kbd tail", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<span>" + PAY_QUOTE + "</span><kbd> Ever.</kbd>");
  }],
  ["G2 span holder plus a button tail", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<span>" + PAY_QUOTE + "</span><button> Ever.</button>");
  }],
  ["G2 span holder plus an ins tail", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<span>" + PAY_QUOTE + "</span><ins> Ever.</ins>");
  }],
  ["G2 span holder plus a font tail", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<span>" + PAY_QUOTE + "</span><font> Ever.</font>");
  }],
  ["G2 span holder plus a custom x-tail", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<span>" + PAY_QUOTE + "</span><x-tail> Ever.</x-tail>");
  }],
  ["G2 kbd prefix plus a span holder", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<kbd>Yes. </kbd><span>" + PAY_QUOTE + "</span>");
  }],
  ["R-B25 lead: Payments turned on.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">Payments turned on. ");
  }],
  ["R-B26 lead: Payments go live today.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">Payments go live today. ");
  }],
  ["R-B27 lead: Payments enabled", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">Payments enabled ");
  }],
  ["R-B28 lead: Payment enabled.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">Payment enabled. ");
  }],
  ["R-B29 lead: Payments enabled today.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\">Payments enabled today. ");
  }],
  ["allowed Switching a plan does not charge. plus a span tail", function (s) {
    return s.replace("Switching a plan does not charge.", "Switching a plan does not charge.<span> Upgrading does.</span>");
  }],
  ["App row Payments are off for now. plus a span tail", function (s) {
    return s.replace("Payments are off for now. <a href", "Payments are off for now.<span> Until checkout.</span> <a href");
  }],
  ["App row prefix before Payments are off for now.", function (s) {
    return s.replace("Payments are off for now. <a href", "Note: Payments are off for now. <a href");
  }]
,
  ["footer Payments enabled. prefix on Payments are off for now.", function (s) {
    return s.replace("<p class=\"note\">These cards are labeled DEMO.", "<p class=\"note\">Payments enabled. Payments are off for now. These cards are labeled DEMO.");
  }],
  ["footer Payment enabled. prefix on Payments are off for now.", function (s) {
    return s.replace("<p class=\"note\">These cards are labeled DEMO.", "<p class=\"note\">Payment enabled. Payments are off for now. These cards are labeled DEMO.");
  }],
  ["Quote ops h3: Payments turned on. Payments are off for now.", function (s) {
    return s.replace("<h3>Intake · match · 7-day vetting</h3>", "<h3>Payments turned on. Payments are off for now.</h3>");
  }],
  ["lead end: Payments are live. Payments are off for now.", function (s) {
    return s.replace("or bind coverage.", "or bind coverage. Payments are live. Payments are off for now.");
  }],
  ["App row Payments phrase deleted", function (s) {
    return s.replace(" The app or webhook is the live connection. Payments are off for now. ", " The app or webhook is the live connection. ");
  }],
  ["App row removed", function (s) {
    return s.replace("    <div class=\"how\"><b>App / webhook</b><span>When the www hook writes a card. If it is tagged Lead. Then a named desk AI drafts. Buyer binds their own keys and devices on Connections. Yes / Stop / Kill before outbound or hardware. Not a listed SKU. Not a bindings product. The app or webhook is the live connection. Payments are off for now. <a href=\"help.html#build-pack\">Build an add-on →</a></span></div>\n", "");
  }],
  ["lead noscript-in-noscript then You will be charged $5.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\"><noscript><noscript></noscript>You will be charged $5.</noscript>");
  }],
  ["lead iframe-in-iframe then You will be charged $5.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\"><iframe><iframe></iframe>You will be charged $5.</iframe>");
  }],
  ["lead unclosed datalist then footer Billed monthly.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\"><datalist><option>x ").replace("<p class=\"note\">These cards are labeled DEMO.", "<p class=\"note\">Billed monthly. These cards are labeled DEMO.");
  }],
  ["G3 Quote notes then unclosed into a div Ever.", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">" + PAY_QUOTE + "<div>Ever.</div>");
  }],
  ["G3 Quote notes then unclosed into a p Ever.", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<p class=\"notes\">" + PAY_QUOTE + "<p>Ever.");
  }],
  ["Z-H01 lead noscript-in-noscript then Bind is on.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\"><noscript><noscript></noscript>Bind is on.</noscript> ");
  }],
  ["Z-H09 noscript-in-noscript reworded Quote notes beside the real line", function (s) {
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<noscript><noscript></noscript><p class=\"notes\">Dispatch and approve wait on Yes. Bind on.</p></noscript><p class=\"notes\">" + PAY_QUOTE + "</p>");
  }],
  ["Z-H03 lead iframe-in-iframe then Bind is on.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\"><iframe><iframe></iframe>Bind is on.</iframe> ");
  }],
  ["Z-H04 footer unclosed datalist then Bind is on.", function (s) {
    return s.replace("Bind and premium stay off the desk.</p>", "Bind and premium stay off the desk.<datalist><option>x</p><p>Bind is on.</p>");
  }],
  ["V03 lead </noscript data-x> then Bind is on.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\"><noscript>x</noscript data-x=\"1\">Bind is on.<noscript></noscript> ");
  }],
  ["V03b lead </noscript/> then Bind is on.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\"><noscript>x</noscript/>Bind is on.<noscript></noscript> ");
  }],
  ["V11 lead </iframe data-x> then Bind is on.", function (s) {
    return s.replace("<p class=\"lead\">", "<p class=\"lead\"><iframe>x</iframe data-x=\"1\">Bind is on.<iframe></iframe> ");
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
  }],
  ["valid empty noscript before the Quote ops payments-off line", function (s) {
    // Strict-side accept: the real Quote ops card line sits after a
    // </noscript>. An empty <noscript></noscript> is inserted immediately
    // before that card's <p class="notes">. Visible text is unchanged and
    // must still equal the fixture.
    return s.replace("<p class=\"notes\">" + PAY_QUOTE + "</p>", "<noscript></noscript><p class=\"notes\">" + PAY_QUOTE + "</p>");
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

