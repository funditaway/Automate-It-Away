// Build steps: the steps of one Build log card, oldest first, one plain line each.
// Read-only. Uses only card.custom.buildLog.steps, which the server (api/jobs.js, BL1) only ever appends to.
// - Each line is built from fixed words plus values that pass a strict check: Label[: VERDICT][ on head8][. Deploy dpl_x][. Done.]
// - A row with an unknown step, an unknown result, a head that is not 40 lowercase hex, or a bad deploy id is skipped, never shown.
// - No name, no time and no posted text is read or shown. textContent only. No buttons, no forms, no server calls.
// - No steps (or none that pass): nothing is drawn, not even an empty box.
// - Reusable: AIABuildSteps.lines(card) for the text, AIABuildSteps.build(card) for the list, AIABuildSteps.mount(target, card).
(function (root) {
  "use strict";
  var LABELS = { "draft-opened": "Draft opened", "new-head": "New head", "probe": "Probe", "named": "Named", "landed": "Landed", "deployed": "Deployed", "ramp": "Ramp", "decision": "Decision" };
  var VERDICTS = ["PASS", "FAIL", "GREEN", "ORANGE", "RED", "HOLD"];
  var HEAD = /^[0-9a-f]{40}$/;
  var DEPLOY = /^dpl_[A-Za-z0-9]{6,40}$/;
  var MARK = "data-build-steps";

  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function blank(v) { return v === undefined || v === null || v === ""; }
  // One row to one line, or "" when the row is not one the server could have stored.
  function lineOf(row) {
    if (!row || typeof row !== "object" || typeof row.step !== "string" || !own(LABELS, row.step)) return "";
    var line = LABELS[row.step];
    if (!blank(row.verdict)) {
      if (typeof row.verdict !== "string" || VERDICTS.indexOf(row.verdict) < 0) return "";
      line += ": " + row.verdict;
    }
    if (!blank(row.head)) {
      if (typeof row.head !== "string" || !HEAD.test(row.head)) return "";
      line += " on " + row.head.slice(0, 8);
    }
    if (!blank(row.deploy)) {
      if (typeof row.deploy !== "string" || !DEPLOY.test(row.deploy)) return "";
      line += ". Deploy " + row.deploy;
    }
    if (row.done === true) line += ". Done.";
    return line;
  }
  // Every line that passes, in the order the rows are stored (the server only appends, so that is oldest first).
  function lines(card) {
    var out = [];
    var log = card && typeof card === "object" && card.custom && typeof card.custom === "object" ? card.custom.buildLog : null;
    var rows = log && typeof log === "object" && Array.isArray(log.steps) ? log.steps : [];
    for (var i = 0; i < rows.length; i++) {
      var t = lineOf(rows[i]);
      if (t) out.push(t);
    }
    return out;
  }
  // The list, or null when there is nothing to show.
  function build(card, opts) {
    var doc = (opts && opts.document) || root.document;
    var rows = lines(card);
    if (!rows.length) return null;
    var box = doc.createElement("div");
    box.className = "build-steps";
    box.setAttribute(MARK, "");
    box.style.margin = "10px 0";
    var head = doc.createElement("p");
    head.className = "meta";
    head.textContent = "Build steps";
    box.appendChild(head);
    var list = doc.createElement("ol");
    list.className = "bs-list";
    list.setAttribute("aria-label", "Build steps");
    list.style.listStyle = "none";
    list.style.margin = "0";
    list.style.padding = "0 0 0 10px";
    list.style.borderLeft = "2px solid var(--line)";
    rows.forEach(function (text) {
      var li = doc.createElement("li");
      li.className = "bs-row";
      li.style.margin = "0 0 6px";
      li.style.fontSize = "13px";
      li.style.overflowWrap = "anywhere";
      li.textContent = text;
      list.appendChild(li);
    });
    box.appendChild(list);
    return box;
  }
  // Put the list at the end of the target. A list from an earlier open is taken off first.
  function mount(target, card, opts) {
    var doc = (opts && opts.document) || root.document;
    var el = typeof target === "string" ? doc.getElementById(target) : target;
    if (!el) return null;
    var kids = el.children ? Array.prototype.slice.call(el.children) : [];
    kids.forEach(function (k) {
      if (k && k.getAttribute && k.getAttribute(MARK) !== null && el.removeChild) el.removeChild(k);
    });
    var box = build(card, opts);
    if (box) el.appendChild(box);
    return box;
  }
  var api = { LABELS: LABELS, VERDICTS: VERDICTS, lineOf: lineOf, lines: lines, build: build, mount: mount };
  root.AIABuildSteps = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);
