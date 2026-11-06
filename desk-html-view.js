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
    var bits = files.map(function (f) {
      var href = urlOf(f.url);
      if (!href) return "";
      var image = /image\//i.test(f.kind) || f.kind === "photo" || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(f.url);
      var html = /text\/html/i.test(f.kind) || /\.html?$/i.test(String(f.name || "")) || /\.html?(\?|$)/i.test(f.url || "");
      if (image && !html) return "<img class=\"thumb\" src=\"" + esc(href) + "\" alt=\"\">";
      if (html && sbxOn(j)) {
        // S1: owner's own card runs its JS in an opaque-origin iframe; Stop lives outside the frame.
        return "<div class=\"q-html pack-face q-sbx\" data-sbx-src=\"" + esc(href) + "\"" +
          " data-sbx-from=\"" + esc(j.from || "") + "\" data-sbx-ak=\"" + esc(j.actorKind || "") + "\" data-sbx-who=\"" + esc(j.droppedByKind || j.whoKind || "") + "\">" +
          "<div class=\"q-html-label\">" + esc(f.name || "HTML") + " <span class=\"q-sbx-by\"></span></div>" +
          "<button type=\"button\" class=\"q-sbx-stop\" data-sbx-stop=\"1\">Stop</button>" +
          "<div class=\"q-sbx-slot\"></div>" +
          "</div>";
      }
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
  // ---- S1 sandbox face: owner-only, scripts on, no same-origin, CSP connect-src 'none'. ----
  var SBX = "allow-scripts";
  var CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'";
  var MAX = 512 * 1024;
  function authorTag(j) {
    var T = window.AIACardThread;
    var row = { from: j && j.from, actorKind: j && j.actorKind, whoKind: j && (j.droppedByKind || j.whoKind) };
    try { if (T && typeof T.tagOf === "function") return T.tagOf(row) || "Helper"; } catch (e) {}
    return "Helper";
  }
  // Fail closed: only the desk owner sees a script face (viewer gate at render) ...
  function sbxOn(j) {
    var r = typeof role === "undefined" ? "" : role;
    if (r !== "owner") return false;
    var T = window.AIACardThread;
    return !T || authorTag(j) === "You";
  }
  // ... and only on a card the owner made (author tag You), checked again at mount.
  function ownCard(box) {
    return authorTag({ from: box.getAttribute("data-sbx-from"), actorKind: box.getAttribute("data-sbx-ak"), droppedByKind: box.getAttribute("data-sbx-who") }) === "You";
  }
  function inertFrame(src) {
    var fr = document.createElement("iframe");
    fr.className = "q-html-frame";
    fr.setAttribute("sandbox", "");
    fr.setAttribute("src", src);
    fr.setAttribute("title", "HTML");
    return fr;
  }
  function srcdocOf(text) {
    return "<meta http-equiv=\"Content-Security-Policy\" content=\"" + CSP + "\">" + String(text || "");
  }
  function frameOf(text, title) {
    var fr = document.createElement("iframe");
    fr.className = "q-html-frame";
    fr.setAttribute("sandbox", SBX);
    fr.setAttribute("csp", CSP);
    fr.setAttribute("referrerpolicy", "no-referrer");
    fr.setAttribute("allow", "");
    fr.setAttribute("title", title || "Card face");
    fr.srcdoc = srcdocOf(text);
    return fr;
  }
  function mountOne(box, n) {
    if (!box || box.getAttribute("data-sbx-done")) return;
    if (!window.AIACardThread && (n || 0) < 40) { setTimeout(function () { mountOne(box, (n || 0) + 1); }, 50); return; }
    box.setAttribute("data-sbx-done", "1");
    var src = box.getAttribute("data-sbx-src") || "";
    var slot = box.querySelector(".q-sbx-slot");
    if (!src || !slot) return;
    var by = box.querySelector(".q-sbx-by");
    var tag = authorTag({ from: box.getAttribute("data-sbx-from"), actorKind: box.getAttribute("data-sbx-ak"), droppedByKind: box.getAttribute("data-sbx-who") });
    if (by) by.textContent = "by " + tag;
    if (!ownCard(box) || typeof fetch !== "function") {
      var sb = box.querySelector(".q-sbx-stop");
      if (sb) sb.remove();
      slot.appendChild(inertFrame(src));
      return;
    }
    fetch(src, { credentials: "same-origin" }).then(function (r) { return r.ok ? r.text() : ""; }).then(function (t) {
      if (!t || t.length > MAX || box.getAttribute("data-sbx-stopped")) return;
      slot.textContent = "";
      var fr = frameOf(t, "Card face"), loads = 0;
      // A face that navigates itself away (a second load) is stopped at once.
      fr.addEventListener("load", function () { if (++loads > 1) stop(box); });
      slot.appendChild(fr);
    }).catch(function () {});
  }
  function scan() {
    var list = document.querySelectorAll ? document.querySelectorAll(".q-sbx[data-sbx-src]:not([data-sbx-done])") : [];
    for (var i = 0; i < list.length; i++) mountOne(list[i]);
  }
  // Stop: drop the frame (its JS dies with it) and hide the face. Chrome is in the parent, never in the frame.
  function stop(box) {
    if (!box) return;
    box.setAttribute("data-sbx-stopped", "1");
    var slot = box.querySelector(".q-sbx-slot");
    if (slot) slot.textContent = "Stopped.";
    var b = box.querySelector(".q-sbx-stop");
    if (b) b.disabled = true;
  }
  if (document.addEventListener) {
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var b = t.closest("[data-sbx-stop]");
      if (b) stop(b.closest(".q-sbx"));
    });
  }
  if (typeof MutationObserver === "function" && document.body) {
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  }
  scan();
  window.AIASandboxFace = { SANDBOX: SBX, CSP: CSP, srcdocOf: srcdocOf, frameOf: frameOf, sbxOn: sbxOn, ownCard: ownCard, mountOne: mountOne, authorTag: authorTag, stop: stop, scan: scan };
  window.filesHtml = filesHtml;
  // Inject CSS once
  if (!document.getElementById("aia-q-html-css")) {
    var s = document.createElement("style");
    s.id = "aia-q-html-css";
    s.textContent =
      ".q-html{width:100%;border:1px solid color-mix(in srgb,var(--teal,#0d6b6b) 35%,transparent);border-radius:12px;padding:8px;background:color-mix(in srgb,var(--teal,#0d6b6b) 8%,transparent)}" +
      ".q-html-label{font-size:12px;font-weight:700;color:var(--teal,#0d6b6b);margin:0 0 6px}" +
      ".q-sbx-by{font-weight:600;opacity:.8}.q-sbx-stop{float:right;margin:-2px 0 6px}" +
      ".q-html-frame{display:block;width:100%;min-height:160px;max-height:42vh;border:0;border-radius:8px;background:#0c1116}";
    document.head.appendChild(s);
  }
})();
