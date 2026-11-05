// Card thread: one card as one chat thread. Each entry is an input and the output that answered it,
// each with a plain who-did-it tag: SI, AI, You, Helper, Family, Employee or Outside.
// - The tag comes from Switch's actorKind on the row (api/_talk.js, #460): si, ai, human, helper, family,
//   employee, ext. human is You on the viewer's own row; otherwise its actorLabel or the current label.
//   A friend comes through as human. Unknown or missing actorKind falls back to the current label.
// - For a stranger's view (opts.stranger) this thread shows no person name: a name falls back to Helper.
//   It covers this thread only; other blocks on the page are not changed here.
// - Rows may carry { input, output } (Switch's shape): that row is one entry, input then output.
// - Read-only. Uses only fields the card already stores; never makes up a row. textContent only.
// - Reusable: AIACardThread.build(card) for a stored card, or build({ entries: [...] }) for rows that
//   are not saved yet (the Bring your AI preview).
(function (root) {
  "use strict";
  var TAGS = { si: "SI", ai: "AI", helper: "Helper", family: "Family", employee: "Employee", ext: "Outside" };
  var SHOWN = ["SI", "AI", "You", "Helper", "Family", "Employee", "Outside"];
  // Older labels on rows without actorKind (whoKind, droppedByKind) only; actorKind itself must be exact.
  var KIND_ALIAS = { staff: "employee", outside: "ext", stranger: "ext", agent: "ai" };
  var AI_FROM = /^(grok|desk ai|desk-ai|then|worker|engine|agent|assistant)$/i;
  var YOU_FROM = /^(|you|desk|drop|desk-chat|onboard|user)$/i;

  function clean(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function kindTag(k) {
    k = clean(k).toLowerCase();
    if (KIND_ALIAS[k]) k = KIND_ALIAS[k];
    return TAGS[k] || "";
  }
  function actorTag(k) {
    return TAGS[k] || "";
  }
  function ownRow(row, from, opts) {
    if (row.own === true) return true;
    if (YOU_FROM.test(from)) return true;
    var v = clean(opts && opts.viewer).toLowerCase();
    return !!v && v === from.toLowerCase();
  }
  // A person's own label, or the safe tag when the viewer is not the owner.
  function labelOf(row, from, opts) {
    var lab = clean(row.actorLabel);
    if (opts && opts.stranger) return SHOWN.indexOf(lab) >= 0 ? lab : "Helper";
    return (lab || from).slice(0, 40);
  }
  // The tag for one row: actorKind first; then the label the card already uses.
  function tagOf(row, opts) {
    row = row || {};
    var from = clean(row.from);
    var ak = clean(row.actorKind).toLowerCase();
    if (ak === "human") return ownRow(row, from, opts) ? "You" : labelOf(row, from, opts);
    var t = actorTag(ak);
    if (t) return t;
    if (AI_FROM.test(from) || row.ai === true) return "AI";
    if (YOU_FROM.test(from)) return "You";
    var k = kindTag(row.whoKind) || kindTag(row.droppedByKind) || kindTag(from);
    if (k && k !== "You") return k;
    return labelOf(row, from, opts);
  }
  function isOutput(row) {
    var k = clean(row.actorKind).toLowerCase();
    if (k === "ai" || k === "si") return true;
    if (TAGS[k] || k === "human") return false;
    var kind = clean(row.kind).toLowerCase();
    return kind === "rec" || AI_FROM.test(clean(row.from)) || row.ai === true;
  }
  function whenOf(at) {
    if (!at) return 0;
    var d = new Date(at).getTime();
    return isNaN(d) ? 0 : d;
  }
  // Every row on the card, oldest first: { at, side: "in" | "out", text, row }.
  function rowsOf(card) {
    var out = [], n = 0;
    function add(row, side) {
      var text = clean(row && row.text);
      if (!text) return;
      out.push({ at: whenOf(row.at), side: side, text: text, row: row, n: n++ });
    }
    if (!card || typeof card !== "object") return out;
    if (card.text || card.title) add({ at: card.createdAt, text: card.text || card.title, from: card.from, actorKind: card.actorKind, whoKind: card.droppedByKind || card.whoKind }, "in");
    (Array.isArray(card.thread) ? card.thread : []).forEach(function (t) {
      if (!t) return;
      if (t.input != null || t.output != null) {
        if (t.input != null) add(Object.assign({}, t, { text: t.input }), "in");
        if (t.output != null) add(Object.assign({}, t, { text: t.output }), "out");
        return;
      }
      add(t, isOutput(t) ? "out" : "in");
    });
    (Array.isArray(card.replies) ? card.replies : []).forEach(function (r) { if (r) add({ at: r.at, text: r.text, from: r.from, actorKind: r.actorKind || "ext" }, "in"); });
    var d = card.agentDraft;
    if (d && d.text && !(card.thread || []).some(function (t) { return t && clean(t.text) === clean(d.text); })) add({ at: d.at, text: d.text, from: "desk ai", actorKind: d.actorKind || "ai" }, "out");
    out.sort(function (a, b) { return (a.at - b.at) || (a.n - b.n); });
    return out;
  }
  // Pair them: an input, then the first output after it. An output with no input of its own stands alone.
  function pair(rows, opts) {
    var entries = [], cur = null;
    rows.forEach(function (r) {
      var tag = tagOf(r.row, opts);
      if (r.side === "in") {
        cur = { input: { tag: tag, text: r.text }, output: null };
        entries.push(cur);
      } else if (cur && !cur.output) {
        cur.output = { tag: tag, text: r.text };
      } else {
        cur = { input: null, output: { tag: tag, text: r.text } };
        entries.push(cur);
      }
    });
    return entries;
  }
  function entries(card, opts) {
    if (card && Array.isArray(card.entries)) {
      return card.entries.map(function (e) {
        return {
          input: e.input ? { tag: tagOf(e.input, opts), text: clean(e.input.text) } : null,
          output: e.output ? { tag: tagOf(e.output, opts), text: clean(e.output.text) } : null
        };
      });
    }
    return pair(rowsOf(card), opts);
  }
  function css(doc) {
    if (!doc || doc.getElementById("card-thread-css")) return;
    var s = doc.createElement("style");
    s.id = "card-thread-css";
    s.textContent =
      ".card-thread{list-style:none;margin:10px 0;padding:0;display:flex;flex-direction:column;gap:10px;max-width:100%;box-sizing:border-box}" +
      ".card-thread .ct-entry{display:flex;flex-direction:column;gap:6px;max-width:100%;min-width:0;box-sizing:border-box}" +
      ".card-thread .ct-in,.card-thread .ct-out{max-width:min(100%,640px);min-width:0;box-sizing:border-box;padding:8px 10px;border-radius:12px;border:1px solid var(--line,#ccc)}" +
      ".card-thread .ct-out{align-self:flex-end;background:var(--edit,#eef6f6)}" +
      ".card-thread .ct-tag{display:inline-block;font:700 12px system-ui,sans-serif;margin:0 0 2px}" +
      ".card-thread .ct-text{margin:0;font-size:14px;line-height:1.4;overflow-wrap:anywhere;word-break:break-word;white-space:pre-wrap}" +
      ".card-thread .ct-wait{margin:0;font-size:13px}";
    (doc.head || doc.body).appendChild(s);
  }
  function side(doc, cls, part) {
    var box = doc.createElement("div");
    box.className = cls;
    var tag = doc.createElement("span");
    tag.className = "ct-tag";
    tag.textContent = part.tag;
    var p = doc.createElement("p");
    p.className = "ct-text";
    p.textContent = part.text;
    box.appendChild(tag);
    box.appendChild(p);
    return box;
  }
  function build(card, opts) {
    var doc = (opts && opts.document) || root.document;
    css(doc);
    var list = doc.createElement("ol");
    list.className = "card-thread";
    list.setAttribute("aria-label", "Card thread");
    var rows = entries(card, opts);
    if (!rows.length) {
      var none = doc.createElement("li");
      none.className = "meta ct-wait";
      none.textContent = "Nothing yet.";
      list.appendChild(none);
      return list;
    }
    rows.forEach(function (e) {
      var li = doc.createElement("li");
      li.className = "ct-entry";
      if (e.input) li.appendChild(side(doc, "ct-in", e.input));
      if (e.output) li.appendChild(side(doc, "ct-out", e.output));
      else {
        var w = doc.createElement("p");
        w.className = "meta ct-wait";
        w.textContent = "No reply yet.";
        li.appendChild(w);
      }
      list.appendChild(li);
    });
    return list;
  }
  function mount(target, card, opts) {
    var doc = (opts && opts.document) || root.document;
    var el = typeof target === "string" ? doc.getElementById(target) : target;
    if (!el) return null;
    el.textContent = "";
    var list = build(card, opts);
    el.appendChild(list);
    return list;
  }
  var api = { TAGS: TAGS, tagOf: tagOf, entries: entries, build: build, mount: mount };
  root.AIACardThread = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);
