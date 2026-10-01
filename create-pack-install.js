/* Packs leftover after Advanced Use honesty: empty pack-list + Install .aia Create path clarity.
   Collect HOLD. Not Market. No silent bind. */
(function () {
  var EMPTY_SOFT = /No pack matches/i;
  var EMPTY_HONEST =
    "No pack matches here. Clear chips or try another search — or List your own pack below, or Install a .aia file. You still tap Yes, then Start. Packs do not send money. Collect stays HOLD.";
  var INSTALL_HONEST =
    "Install copies rules from a .aia file onto this desk. You still tap Yes, then Start. Packs do not send money. Collect stays HOLD.";

  function honestEmpty(list) {
    if (!list) return;
    var kids = list.children;
    if (!kids || kids.length !== 1) return;
    var only = kids[0];
    if (!only || only.tagName !== "P") return;
    if (!EMPTY_SOFT.test(only.textContent || "")) return;
    if (only.id === "pack-list-empty") return;
    only.id = "pack-list-empty";
    only.className = "hint";
    only.textContent = EMPTY_HONEST;
  }

  function ensureInstallHonesty(form) {
    if (!form || document.getElementById("pack-install-honest")) return;
    var btn = form.querySelector("#install-aia");
    if (!btn) return;
    var p = document.createElement("p");
    p.className = "hint";
    p.id = "pack-install-honest";
    p.textContent = INSTALL_HONEST;
    var wrap = btn.closest("p.cta") || btn.parentNode;
    if (wrap && wrap.parentNode) wrap.insertAdjacentElement("afterend", p);
    else btn.insertAdjacentElement("afterend", p);
  }

  function tick() {
    var form = document.getElementById("form");
    if (!form) return;
    if (!form.querySelector("#install-aia") && !document.getElementById("pack-list")) return;
    ensureInstallHonesty(form);
    honestEmpty(document.getElementById("pack-list"));
  }

  function boot() {
    tick();
    var form = document.getElementById("form");
    if (form && window.MutationObserver) {
      new MutationObserver(function () { tick(); }).observe(form, { childList: true, subtree: true });
    }
    setInterval(tick, 800);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
