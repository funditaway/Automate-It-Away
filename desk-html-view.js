/* HTML file face for queue cards: sandboxed iframe, never innerHTML of file bytes. */
(function () {
  function esc(s) {
    if (typeof escapeHtml === "function") return escapeHtml(s);
    return String(s || "").replace(/[&<>"'`]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;", "`": "&#96;" })[c];
    });
  }
  function urlOf(raw) {
    if (typeof safeUrl === "function") return safeUrl(raw);
    return "";
  }
  function filesOf(j) {
    if (typeof window.filesOf === "function" && window.filesOf !== filesOf) {
      try { return window.filesOf(j); } catch (e) {}
    }
    var out = [], seen = {};
    function add(f, legacy) {
      if (!f) return;
      var url = typeof f === "string" ? f : (f.url || "");
      if (!url || seen[url]) return;
      seen[url] = true;
      var obj = typeof f === "object";
      out.push({
        url: url,
        name: (obj && f.name) || (legacy ? legacyName(url) : "File"),
        kind: (obj && f.kind) || "",
        type: (obj && f.type) || ""
      });
    }
    // The real upload record (name, stored type) wins; a bare photoUrl only fills in when no record has that url.
    (j && Array.isArray(j.files) ? j.files : []).forEach(function (f) { add(f); });
    if (j && j.photoUrl) {
      var other = NOT_IMAGE.test(j.photoUrl);
      add({ url: j.photoUrl, name: other ? "" : "Photo", kind: other ? "file" : "photo" }, true);
    }
    return out;
  }
  // Clearly not a picture: a legacy photoUrl ending like this shows as a named link.
  var NOT_IMAGE = /\.(pdf|heic|heif|mp4|mov|webm|docx?|txt|csv|xlsx?|pptx?|zip)(\?|#|$)/i;
  function legacyName(url) {
    var path = String(url).split(/[?#]/)[0];
    var last = path.slice(path.lastIndexOf("/") + 1);
    try { last = decodeURIComponent(last); } catch (e) {}
    return last || "File";
  }
  // Image only for a stored png/jpeg/gif/webp; with no stored type, a photo kind or an image file ending.
  function isImage(f) {
    if (f.type) return /^image\/(png|jpeg|gif|webp)$/i.test(f.type);
    return f.kind === "photo" || /\.(jpg|jpeg|png|gif|webp)(\?|#|$)/i.test(f.url);
  }
  function filesHtml(j) {
    var files = filesOf(j);
    if (!files.length) return "";
    var bits = files.map(function (f) {
      var href = urlOf(f.url);
      if (!href) return "";
      var image = isImage(f);
      var html = /text\/html/i.test(f.type || f.kind) || /\.html?$/i.test(String(f.name || "")) || /\.html?(\?|$)/i.test(f.url || "");
      if (image && !html) return "<img class=\"thumb\" src=\"" + esc(href) + "\" alt=\"\">";
      if (html) {
        return "<div class=\"q-html pack-face\">" +
          "<div class=\"q-html-label\">" + esc(f.name || "HTML") + "</div>" +
          "<iframe class=\"q-html-frame\" sandbox=\"\" src=\"" + esc(href) + "\" title=\"" + esc(f.name || "HTML") + "\"></iframe>" +
          "<a class=\"q-file edit\" href=\"" + esc(href) + "\" target=\"_blank\" rel=\"noopener\">Open HTML</a>" +
          "</div>";
      }
      return "<a class=\"q-file edit\" href=\"" + esc(href) + "\">" + esc(f.name || "File") + "</a>";
    }).filter(Boolean);
    if (!bits.length) return "";
    return "<div class=\"q-files\">" + bits.join("") + "</div>";
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
