/* Which kind of card is this? Read from fields the card already stores. Pure: no DOM, no network.
   First match wins: automation, file, lead, approval. Anything else is "unknown" and keeps today's generic card. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  var g = root || (typeof globalThis !== "undefined" ? globalThis : this);
  g.cardType = api.cardType;
  g.CardType = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var LEAD_KINDS = { "walk-in": 1, widget: 1, call: 1, form: 1, email: 1, text: 1, request: 1 };
  var TYPE_LABELS = { file: "File", lead: "Lead", approval: "Needs your Yes", automation: "Automation" };

  function has(v) { return v !== undefined && v !== null && v !== "" && v !== false && !(typeof v === "number" && !isFinite(v)); }
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

  function isAutomation(j) { return isObj(j.run) && !!(j.run.runNo || j.run.state); }
  function isFile(j) {
    var c = isObj(j.custom) ? j.custom : {};
    return (Array.isArray(j.files) && j.files.length > 0) || has(j.photoUrl) || j.kind === "photo" || c.mode === "files" || c.lane === "files";
  }
  function isLead(j) {
    return has(j.contactName) || has(j.phone) || has(j.email) || (typeof j.kind === "string" && Object.prototype.hasOwnProperty.call(LEAD_KINDS, j.kind));
  }
  function isApproval(j) {
    var waiting = j.status === "waiting" || j.status === "held";
    if (!(j.decide === true || waiting)) return false;
    return has(j.ask) || has(j.amount) || has(j.risk) || has(j.payoutTo) || has(j.artifact) || has(j.draft);
  }

  function cardType(j) {
    try {
      if (!isObj(j)) return "unknown";
      if (isAutomation(j)) return "automation";
      if (isFile(j)) return "file";
      if (isLead(j)) return "lead";
      if (isApproval(j)) return "approval";
    } catch (e) {}
    return "unknown";
  }
  function typeLabel(type) { return Object.prototype.hasOwnProperty.call(TYPE_LABELS, type) ? TYPE_LABELS[type] : ""; }

  return { cardType: cardType, typeLabel: typeLabel, LEAD_KINDS: LEAD_KINDS };
});
