/* HTML file face for queue cards: sandboxed iframe, never innerHTML of file bytes. */
(function () {
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&#38;", "<": "&#60;", ">": "&#62;", "\"": "&#34;", "'": "&#39;" })[c];
    });
  }
  function filesOf(j) {
    if (typeof window.filesOf === "function" && window.filesOf !== filesOf) {
      try { return window.filesOf(j); } catch (e) {}
    }
    var out = [], seen = {};
    function add(f) {
      if (!f) return;
      var url = typeof f === "string" ? f : (f.url || "");
      if (!url || seen[url]) return;
      seen[url] = true;
      var kind = (typeof f === "object" && (f.kind || f.type)) || "";
      out.push({
        url: url,
        name: (typeof f === "object" && f.name) || (url === (j && j.photoUrl) ? "Photo" : "File"),
        kind: kind || (url === (j && j.photoUrl) ? "photo" : "file")
      });
    }
    if (j && j.photoUrl) add({ url: j.photoUrl, name: "Photo", kind: "photo" });
    (j && Array.isArray(j.files) ? j.files : []).forEach(add);
    return out;
  }
  function filesHtml(j) {
    var files = filesOf(j);
    if (!files.length) return "";
    return "<div class=\"q-files\">" + files.map(function (f) {
      var image = /image\//i.test(f.kind) || f.kind === "photo" || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(f.url);
      var html = /text\/html/i.test(f.kind) || /\.html?$/i.test(String(f.name || "")) || /\.html?(\?|$)/i.test(f.url || "");
      if (image && !html) return "<img class=\"thumb\" src=\"" + esc(f.url) + "\" alt=\"\">";
      if (html) {
        return "<div class=\"q-html pack-face\">" +
          "<div class=\"q-html-label\">" + esc(f.name || "HTML") + "</div>" +
          "<iframe class=\"q-html-frame\" sandbox=\"\" src=\"" + esc(f.url) + "\" title=\"" + esc(f.name || "HTML") + "\"></iframe>" +
          "<a class=\"q-file edit\" href=\"" + esc(f.url) + "\" target=\"_blank\" rel=\"noopener\">Open HTML</a>" +
          "</div>";
      }
      return "<a class=\"q-file edit\" href=\"" + esc(f.url) + "\">" + esc(f.name || "File") + "</a>";
    }).join("") + "</div>";
  }
  window.filesHtml = filesHtml;
  // Inject CSS once
  if (!document.getElementById("aia-q-html-css")) {
    var s = document.createElement("style");
    s.id = "aia-q-html-css";
    s.textContent =
      ".q-html{width:100%;border:1px solid color-mix(in srgb,var(--teal,#0d6b6b) 35%,transparent);border-radius:12px;padding:8px;background:color-mix(in srgb,var(--teal,#0d6b6b) 8%,transparent)}" +
      ".q-html-label{font-size:12px;font-weight:700;color:var(--teal,#0d6b6b);margin:0 0 6px}" +
      ".q-html-frame{display:block;width:100%;min-height:160px;max-height:42vh;border:0;border-radius:8px;background:#0c1116}";
    document.head.appendChild(s);
  }
})();
