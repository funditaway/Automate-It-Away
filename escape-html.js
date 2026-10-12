/* Shared HTML escape for desk and queue card text.
   Escape & < > " ' and backtick. Links are http, https, mailto,
   or a same-origin path. javascript: is never a link. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  var g = root || (typeof globalThis !== "undefined" ? globalThis : this);
  g.escapeHtml = api.escapeHtml;
  g.safeUrl = api.safeUrl;
  g.safeId = api.safeId;
  g.safeTel = api.safeTel;
  g.jsAttr = api.jsAttr;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"'`]/g, function (ch) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;",
        "`": "&#96;"
      }[ch];
    });
  }

  function safeUrl(url) {
    var raw = String(url == null ? "" : url).replace(/^\s+|\s+$/g, "");
    if (!raw) return "";
    var compact = raw.replace(/[\u0000-\u001F\u007F\s]+/g, "");
    var head = compact.slice(0, 32).toLowerCase();
    if (head.indexOf("javascript:") === 0) return "";
    if (head.indexOf("vbscript:") === 0) return "";
    if (head.indexOf("data:") === 0) return "";
    if (/^https?:\/\//i.test(compact)) return raw;
    if (/^mailto:/i.test(compact)) return raw;
    if (raw.charAt(0) === "/" && raw.charAt(1) !== "/" && raw.charAt(1) !== "\\") return raw;
    return "";
  }

  function safeId(id) {
    return String(id == null ? "" : id).replace(/[^a-zA-Z0-9_-]/g, "");
  }

  function safeTel(url) {
    var compact = String(url == null ? "" : url).replace(/[\u0000-\u001F\u007F\s]+/g, "");
    if (/^tel:\+?[0-9]{1,20}$/.test(compact)) return compact;
    return safeUrl(url) || "#";
  }

  function jsAttr(value) {
    return escapeHtml(JSON.stringify(String(value == null ? "" : value)));
  }

  return {
    escapeHtml: escapeHtml,
    safeUrl: safeUrl,
    safeId: safeId,
    safeTel: safeTel,
    jsAttr: jsAttr
  };
});
