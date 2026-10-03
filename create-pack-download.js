/* Packs leftover after Install .aia honesty: Download .aia Create path + after-List #mine clarity.
   Collect HOLD. Not Market. No silent bind. Collect stays HOLD. */
(function () {
  var DOWNLOAD_HONEST =
    "Download and Give pack are on History. Install is here. You still tap Yes, then Start. Packs do not send money.";
  var MINE_HONEST =
    "Listed from this desk. Unlist removes the listing only. Tap Use on this desk above. Give pack is on History. You still tap Yes, then Start. Packs do not send money.";

  function ensureDownloadHonesty(form) {
    if (!form || document.getElementById("pack-download-honest")) return;
    if (!form.querySelector("#install-aia") && !document.getElementById("pack-list")) return;
    var p = document.createElement("p");
    p.className = "hint";
    p.id = "pack-download-honest";
    p.textContent = DOWNLOAD_HONEST;
    var installHonest = document.getElementById("pack-install-honest");
    var installBtn = form.querySelector("#install-aia");
    var wrap = installBtn && (installBtn.closest("p.cta") || installBtn.parentNode);
    if (installHonest && installHonest.parentNode) {
      installHonest.insertAdjacentElement("afterend", p);
    } else if (wrap && wrap.parentNode) {
      wrap.insertAdjacentElement("afterend", p);
    } else {
      var list = document.getElementById("pack-list");
      if (list && list.parentNode) list.parentNode.insertBefore(p, list.nextSibling);
      else form.appendChild(p);
    }
  }

  function ensureMineHonesty() {
    var mine = document.getElementById("mine");
    if (!mine || mine.style.display === "none" || !mine.innerHTML) return;
    if (document.getElementById("pack-mine-honest")) return;
    if (!/Listed from desks|Unlist/i.test(mine.textContent || "")) return;
    var p = document.createElement("p");
    p.className = "hint";
    p.id = "pack-mine-honest";
    p.textContent = MINE_HONEST;
    var link = document.createElement("p");
    link.className = "cta";
    link.id = "pack-mine-give";
    link.innerHTML = '<a class="use ghost" href="/history">History · Give pack · .aia</a>';
    mine.appendChild(p);
    mine.appendChild(link);
  }

  function honestListedOk(node) {
    if (!node || node.dataset.packDlHonest === "1") return;
    var t = String(node.textContent || "");
    if (!/Pack is listed/i.test(t)) return;
    if (/Download \/ Give|\.aia is on History/i.test(t)) {
      node.dataset.packDlHonest = "1";
      return;
    }
    node.textContent = t.replace(/\s*$/, "") + " Download / Give .aia is on History. You still tap Yes, then Start.";
    node.dataset.packDlHonest = "1";
  }

  function tick() {
    var form = document.getElementById("form");
    if (!form) return;
    if (!form.querySelector("#install-aia") && !document.getElementById("pack-list") && !document.getElementById("mine")) return;
    ensureDownloadHonesty(form);
    ensureMineHonesty();
    honestListedOk(document.getElementById("ok"));
  }

  function boot() {
    tick();
    var form = document.getElementById("form");
    if (form && window.MutationObserver) {
      new MutationObserver(function () { tick(); }).observe(form, { childList: true, subtree: true });
    }
    var mine = document.getElementById("mine");
    if (mine && window.MutationObserver) {
      new MutationObserver(function () { ensureMineHonesty(); }).observe(mine, { childList: true, subtree: true, attributes: true });
    }
    var ok = document.getElementById("ok");
    if (ok && window.MutationObserver) {
      new MutationObserver(function () { honestListedOk(ok); }).observe(ok, { childList: true, characterData: true, subtree: true });
    }
    setInterval(tick, 800);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
