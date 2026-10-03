(function () {
  var CARD_TYPES = [
    { id: "task", label: "A task" },
    { id: "chore", label: "An errand" },
    { id: "list", label: "A list" },
    { id: "idea", label: "An idea" },
    { id: "project", label: "A project" },
    { id: "build", label: "A build" },
    { id: "request", label: "A request" },
    { id: "note", label: "A note" },
    { id: "custom", label: "Custom" }
  ];
  var draftBlob = null;
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "\u0026amp;", "<": "\u0026lt;", ">": "\u0026gt;", "\"": "\u0026quot;", "'": "\u0027" })[c];
    });
  }
  function headers() {
    var h = { "Content-Type": "application/json" };
    try {
      var ws = localStorage.getItem("aia_ws") || "";
      var tok = localStorage.getItem("aia_session") || "";
      if (ws) h["X-Workspace"] = ws;
      if (tok) h["X-Session"] = tok;
    } catch (e) {}
    return h;
  }
  function deskOpen() {
    try {
      return !!(localStorage.getItem("aia_ws") && localStorage.getItem("aia_session"));
    } catch (e) { return false; }
  }
  function typeOf(id) {
    for (var i = 0; i < CARD_TYPES.length; i++) if (CARD_TYPES[i].id === id) return CARD_TYPES[i];
    return CARD_TYPES[0];
  }
  function labelOf(id) {
    var t = typeOf(id);
    return (t && t.id === id) ? t.label : String(id || "Card");
  }
  function ensureCss() {
    if (document.getElementById("drop-custom-css")) return;
    var css = document.createElement("style");
    css.id = "drop-custom-css";
    css.textContent = "#pane-custom{margin:8px 0;padding:10px 12px;border:1px solid var(--line);border-radius:12px}.card-type-chips{display:flex;flex-wrap:wrap;gap:6px}.card-type-chips button{min-height:40px;padding:6px 10px;border-radius:999px;border:1px solid var(--line);background:var(--card);font:700 12px system-ui}.card-type-chips button.on{background:var(--edit);color:var(--edit-ink)}#custom-ai-box{display:none;margin-top:10px}#custom-ai-box.on{display:block}#custom-ai-draft{display:none;margin-top:8px;border-left:3px solid var(--teal);padding:8px;white-space:pre-wrap}#custom-ai-draft.on{display:block}#custom-ai-row{display:flex;gap:8px;margin-top:8px}#custom-ai-row button{flex:1;min-height:44px;border-radius:10px;font:700 13px system-ui}#custom-ask{background:var(--edit)}#custom-yes{background:var(--teal);color:#fff;border:0}.card-type-badge{display:inline-block;padding:2px 8px;border-radius:999px;background:var(--banner);font:700 11px system-ui;margin-right:6px}";
    document.head.appendChild(css);
  }
  function paintTypes(on) {
    var box = document.getElementById("card-type-chips");
    if (!box) return on || "custom";
    var cur = on || "custom";
    box.innerHTML = CARD_TYPES.map(function (t) {
      return "<button type=\"button\" class=\"" + (t.id === cur ? "on" : "") + "\" data-card-type=\"" + t.id + "\">" + esc(t.label) + "</button>";
    }).join("");
    return cur;
  }
  function setType(id) {
    var t = typeOf(id);
    var kind = document.getElementById("kind");
    if (kind) {
      if (![].some.call(kind.options, function (o) { return o.value === t.id; })) {
        var opt = document.createElement("option");
        opt.value = t.id; opt.textContent = t.label; kind.appendChild(opt);
      }
      kind.value = t.id;
    }
    paintTypes(t.id);
    window.__aiaCardType = t.id;
  }
  function ensurePane() {
    ensureCss();
    var pane = document.getElementById("pane-custom");
    if (!pane) return null;
    if (!document.getElementById("card-type-chips")) {
      var wrap = document.createElement("div");
      wrap.innerHTML = "<label class=\"lbl\">Card type</label><div id=\"card-type-chips\" class=\"card-type-chips\" role=\"group\" aria-label=\"Card type\"></div><div id=\"custom-ai-box\"><p class=\"muted\">A Desk AI drafts. You still tap Yes, then Start.</p><textarea id=\"custom-ai-ask\" rows=\"2\" placeholder=\"What should Desk AI draft?\" style=\"width:100%\"></textarea><div id=\"custom-ai-row\"><button type=\"button\" id=\"custom-ask\">Ask Desk AI to draft</button><button type=\"button\" id=\"custom-yes\" hidden>Use draft</button><button type=\"button\" id=\"custom-stop\" hidden>Clear</button></div><div id=\"custom-ai-draft\"></div></div>";
      pane.appendChild(wrap);
      setType(window.__aiaCardType || "custom");
      pane.addEventListener("click", function (e) {
        var b = e.target && e.target.closest && e.target.closest("[data-card-type]");
        if (b) setType(b.getAttribute("data-card-type"));
        if (e.target && e.target.id === "custom-ask") askDesk();
        if (e.target && e.target.id === "custom-yes") useDraft();
        if (e.target && e.target.id === "custom-stop") clearDraft();
      });
    }
    var box = document.getElementById("custom-ai-box");
    if (box) box.classList.add("on");
    return pane;
  }
  function show(on) {
    ensurePane();
    var pane = document.getElementById("pane-custom");
    if (pane) pane.hidden = !on;
    var box = document.getElementById("custom-ai-box");
    if (box) box.classList.toggle("on", !!on);
    if (on) paintTypes(window.__aiaCardType || "custom");
  }
  function clearDraft() {
    draftBlob = null;
    var d = document.getElementById("custom-ai-draft");
    if (d) { d.textContent = ""; d.classList.remove("on"); }
    var y = document.getElementById("custom-yes");
    var s = document.getElementById("custom-stop");
    if (y) y.hidden = true;
    if (s) s.hidden = true;
  }
  function useDraft() {
    if (!draftBlob) return;
    var title = document.getElementById("title");
    var note = document.getElementById("note");
    var name = document.getElementById("custom-name");
    if (title && draftBlob.title) title.value = draftBlob.title;
    if (note && draftBlob.notes) note.value = draftBlob.notes;
    if (name && draftBlob.customName) name.value = draftBlob.customName;
    if (draftBlob.cardType) setType(draftBlob.cardType);
    clearDraft();
  }
  async function askDesk() {
    var err = document.getElementById("err");
    var draftEl = document.getElementById("custom-ai-draft");
    var askEl = document.getElementById("custom-ai-ask");
    var prompt = ((askEl && askEl.value) || "").trim();
    var name = ((document.getElementById("custom-name") && document.getElementById("custom-name").value) || "").trim();
    var title = ((document.getElementById("title") && document.getElementById("title").value) || "").trim();
    var note = ((document.getElementById("note") && document.getElementById("note").value) || "").trim();
    if (!deskOpen()) { if (err) { err.style.display = "block"; err.textContent = "Open a desk first."; } return; }
    if (!prompt && !name && !title && !note) { if (err) { err.style.display = "block"; err.textContent = "Name it or tell Desk AI."; } return; }
    var askBtn = document.getElementById("custom-ask");
    if (askBtn) { askBtn.disabled = true; askBtn.textContent = "Drafting…"; }
    try {
      var body = {
        action: "suggest",
        kind: window.__aiaCardType || "custom",
        title: title || name || "Custom Drop",
        notes: [prompt, note].filter(Boolean).join("\n"),
        custom: { customDrop: true, cardType: window.__aiaCardType || "custom", name: name || title }
      };
      var r = await fetch("/api/jobs", { method: "POST", headers: headers(), body: JSON.stringify(body) });
      var out = await r.json().catch(function () { return {}; });
      if (!r.ok) { if (err) { err.style.display = "block"; err.textContent = out.error || "Draft failed."; } return; }
      draftBlob = {
        title: out.title || body.title,
        notes: out.notes || out.draft || out.suggestion || body.notes,
        customName: name || "",
        cardType: out.kind || body.kind || "custom"
      };
      if (draftEl) {
        draftEl.classList.add("on");
        draftEl.textContent = "Desk AI draft:\n" + (draftBlob.title ? ("Title: " + draftBlob.title + "\n") : "") + (draftBlob.notes || "");
      }
      var y = document.getElementById("custom-yes");
      var s = document.getElementById("custom-stop");
      if (y) y.hidden = false;
      if (s) s.hidden = false;
    } catch (ex) {
      if (err) { err.style.display = "block"; err.textContent = "Could not reach Desk AI."; }
    } finally {
      if (askBtn) { askBtn.disabled = false; askBtn.textContent = "Ask Desk AI to draft"; }
    }
  }
  function stamp(item) {
    if (!item) return item;
    item.custom = item.custom || {};
    item.custom.customDrop = true;
    item.custom.cardType = window.__aiaCardType || item.kind || "custom";
    var name = document.getElementById("custom-name");
    if (name && name.value) item.custom.name = name.value.trim();
    if (!item.kind) item.kind = item.custom.cardType;
    return item;
  }
  function badgeHtml(id) {
    return "<span class=\"card-type-badge\">" + esc(labelOf(id)) + "</span>";
  }
  function wrapPackFace() {
    if (window.__aiaDropCustomPack || !window.AIAPackCard || !AIAPackCard.faceOf) return;
    window.__aiaDropCustomPack = true;
    var prev = AIAPackCard.faceOf.bind(AIAPackCard);
    AIAPackCard.faceOf = function (job) {
      var html = prev(job);
      try {
        var ct = job && job.custom && (job.custom.cardType || (job.custom.customDrop && job.kind));
        if (ct && String(html).indexOf("card-type-badge") < 0) {
          html = badgeHtml(ct) + " · Yes, then Start " + html;
        }
      } catch (e) {}
      return html;
    };
  }
  function hookMode() {
    ensurePane();
    wrapPackFace();
    function bind(id, attr, val) {
      var el = document.getElementById(id);
      if (!el || el.__aiaCustomHook) return;
      el.__aiaCustomHook = true;
      el.addEventListener("click", function (e) {
        var b = e.target && e.target.closest && e.target.closest("[" + attr + "]");
        if (b) show(b.getAttribute(attr) === val);
      });
    }
    bind("modes", "data-mode", "custom");
    bind("ways-chips", "data-way", "custom");
    var send = document.getElementById("drop-send");
    if (send && !send.__aiaCustomStamp) {
      send.__aiaCustomStamp = true;
      send.addEventListener("click", function () {
        try {
          if (window.__aiaPendingCapture) stamp(window.__aiaPendingCapture);
        } catch (e) {}
      }, true);
    }
  }
  function boot() {
    ensureCss();
    hookMode();
    try {
      if ((new URLSearchParams(location.search || "").get("mode") || "") === "custom") show(true);
    } catch (e) {}
  }
  window.AIADropCustom = { show: show, stamp: stamp, CARD_TYPES: CARD_TYPES, setType: setType, labelOf: labelOf };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 120);
  setTimeout(wrapPackFace, 400);
  setTimeout(hookMode, 200);
})();
