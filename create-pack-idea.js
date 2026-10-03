/* Packs Studio create slice: /create?kind=pack&idea=… from Make this pack. */
(function () {
  function ideaLabel(id) {
    return String(id || "").split(/[-_]+/).filter(Boolean).map(function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(" ") || "New pack";
  }
  function params() {
    try { return new URLSearchParams(location.search || ""); } catch (e) { return new URLSearchParams(); }
  }
  function ideaOf() {
    var p = params();
    return String(p.get("idea") || p.get("pack") || "").trim();
  }
  function setAdvanced(on) {
    if (typeof window.AIACreateSetMode === "function") {
      window.AIACreateSetMode(!!on);
      return;
    }
    document.body.classList.toggle("show-adv", !!on);
    var simple = document.getElementById("mode-simple");
    var adv = document.getElementById("mode-advanced");
    if (simple) simple.classList.toggle("on", !on);
    if (adv) adv.classList.toggle("on", !!on);
  }
  function pickPack() {
    var btn = document.querySelector('#picks [data-kind="pack"]');
    if (btn) btn.click();
  }
  function applyPackIdea(idea) {
    var raw = String(idea || "").trim();
    if (!raw) return false;
    setAdvanced(true);
    var form = document.getElementById("form");
    if (!form) return false;
    var nameEl = form.querySelector('input[name="listName"]');
    var doesEl = form.querySelector('input[name="listDoes"]');
    var askEl = form.querySelector('input[name="listAsk"]');
    var q = document.getElementById("pack-q");
    var name = ideaLabel(raw);
    var does = "Make this pack on this desk. You still tap Yes, then Start.";
    if (nameEl && !nameEl.value) nameEl.value = name;
    if (doesEl && !doesEl.value) doesEl.value = does;
    if (askEl && !askEl.value) askEl.placeholder = "Leave blank to list free";
    if (q) {
      q.value = raw.replace(/^find\s+/i, "").trim();
      try { q.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
    }
    var list = document.getElementById("pack-list");
    if (list && list.parentNode && !document.getElementById("pack-idea-note")) {
      var note = document.createElement("p");
      note.className = "hint";
      note.id = "pack-idea-note";
      note.textContent = "Make this pack: " + name + ". List it, then Use on this desk. You still tap Yes, then Start. Packs do not send money.";
      list.parentNode.insertBefore(note, list);
    }
    if (nameEl && nameEl.focus) nameEl.focus();
    return true;
  }
  function boot() {
    var idea = ideaOf();
    if (!idea) return;
    var kind = params().get("kind") || "";
    if (kind && kind !== "pack" && kind !== "packs" && kind !== "market") return;
    pickPack();
    var tries = 0;
    function go() {
      tries += 1;
      if (applyPackIdea(idea)) return;
      if (tries < 20) setTimeout(go, 120);
    }
    setTimeout(go, 80);
    setTimeout(go, 400);
  }
  window.applyPackIdea = applyPackIdea;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
