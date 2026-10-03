/* Packs leftover after Studio create ?idea=: Advanced clarity + Use-on-desk honesty.
   Collect HOLD. Not Market. No silent bind. Collect stays HOLD. */
(function () {
  function applyAdvancedUi(on) {
    document.body.classList.toggle("show-adv", !!on);
    var simple = document.getElementById("mode-simple");
    var adv = document.getElementById("mode-advanced");
    if (simple) simple.classList.toggle("on", !on);
    if (adv) adv.classList.toggle("on", !!on);
  }
  var priorMode = typeof window.AIACreateSetMode === "function" ? window.AIACreateSetMode : null;
  function setAdvanced(on) {
    if (priorMode && priorMode !== setAdvanced) {
      priorMode(!!on);
      return;
    }
    applyAdvancedUi(on);
  }
  window.AIACreateSetMode = setAdvanced;

  function revealListFields(form) {
    if (!form) return;
    ["listName", "listDoes"].forEach(function (name) {
      var el = form.querySelector('[name="' + name + '"]');
      if (!el) return;
      el.classList.remove("adv");
      var lab = el.previousElementSibling;
      if (lab && lab.tagName === "LABEL") lab.classList.remove("adv");
    });
    var ask = form.querySelector('[name="listAsk"]');
    if (ask && ask.placeholder && / · Collect/.test(ask.placeholder)) {
      ask.placeholder = ask.placeholder.replace(/ · Collect.*$/, "");
    }
  }

  function ensureListHint(form) {
    if (!form || document.getElementById("pack-list-adv-hint")) return;
    var list = document.getElementById("pack-list");
    if (!list || !list.parentNode) return;
    var hint = document.createElement("p");
    hint.className = "hint";
    hint.id = "pack-list-adv-hint";
    hint.textContent = "Name the pack and what it does. Then tap Use on this desk. You still tap Yes, then Start. Packs do not send money.";
    var install = form.querySelector("#install-aia");
    var anchor = install && install.closest("p") ? install.closest("p").nextSibling : list;
    form.insertBefore(hint, anchor || list);
  }

  function honestyUnderUse(row) {
    if (!row || row.querySelector(".pack-use-honest")) return;
    var btn = row.querySelector("[data-use], a.use");
    if (!btn) return;
    var wanted = !!(btn.tagName === "A" && /idea=/.test(btn.getAttribute("href") || ""));
    var p = document.createElement("p");
    p.className = "hint pack-use-honest";
    p.textContent = wanted
      ? "Opens Advanced list fields. You still tap Yes, then Start. Packs do not send money."
      : "Copies rules onto this desk. You still tap Yes, then Start. Packs do not send money.";
    btn.insertAdjacentElement("afterend", p);
  }

  function polishPackRows() {
    var list = document.getElementById("pack-list");
    if (!list) return;
    list.querySelectorAll(".pack-row").forEach(honestyUnderUse);
  }

  function honestOk(node) {
    if (!node || node.dataset.packHonest === "1") return;
    var t = String(node.textContent || "");
    if (!/Pack is on this desk|Installed \.aia|Pack is listed|Rules added/i.test(t)) return;
    if (/Yes, then Start/i.test(t)) {
      node.dataset.packHonest = "1";
      return;
    }
    node.textContent = t.replace(/\s*$/, "") + " You still tap Yes, then Start. Packs do not send money.";
    node.dataset.packHonest = "1";
  }

  function tick() {
    var form = document.getElementById("form");
    if (!form) return;
    if (!form.querySelector('[name="listName"]') && !document.getElementById("pack-q")) return;
    revealListFields(form);
    ensureListHint(form);
    polishPackRows();
    honestOk(document.getElementById("ok"));
  }

  function boot() {
    tick();
    var form = document.getElementById("form");
    if (form && window.MutationObserver) {
      new MutationObserver(function () { tick(); }).observe(form, { childList: true, subtree: true });
    }
    var ok = document.getElementById("ok");
    if (ok && window.MutationObserver) {
      new MutationObserver(function () { honestOk(ok); }).observe(ok, { childList: true, characterData: true, subtree: true });
    }
    setInterval(tick, 800);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
