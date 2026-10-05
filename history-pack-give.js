/* Packs leftover after Create Download honesty (#262): History Give · .aia page honesty.
   Collect HOLD. Not Market. No silent bind. */
(function () {
  var GIVE_HONEST =
    "Give pack · .aia downloads the file here. They Install on Create or History with Yes, then Start. Packs do not send money. Collect stays HOLD. No silent push.";
  var SOFT_GIVE_OK = "They install with Yes. No silent push.";
  var GIVE_OK_TAIL =
    " They install with Yes, then Start. Packs do not send money. Collect stays HOLD. No silent push.";

  function ensureGiveHonesty() {
    if (document.getElementById("history-pack-give-honest")) return;
    var road = document.getElementById("road-body") || document.getElementById("account-road");
    if (!road) return;
    var p = document.createElement("p");
    p.className = "hint";
    p.id = "history-pack-give-honest";
    p.textContent = GIVE_HONEST;
    var hold = road.querySelector(".h-hold");
    if (hold && hold.parentNode) hold.insertAdjacentElement("beforebegin", p);
    else road.appendChild(p);
  }

  function honestRoadHint(el) {
    if (!el || el.dataset.packGiveHonest === "1") return;
    var t = String(el.textContent || "");
    if (!t) return;
    if (/Yes, then Start/i.test(t) && /Collect stays HOLD|Collect HOLD/i.test(t) && /Packs do not send money/i.test(t)) {
      el.dataset.packGiveHonest = "1";
      return;
    }
    if (t.indexOf(SOFT_GIVE_OK) >= 0 || /Downloaded .+\. They install with Yes\./i.test(t)) {
      el.textContent = t
        .replace(SOFT_GIVE_OK, "")
        .replace(/\s*They install with Yes\.?\s*$/i, "")
        .replace(/\s*$/, "") + GIVE_OK_TAIL;
      el.dataset.packGiveHonest = "1";
      return;
    }
    if (/Installed \.aia onto this desk\./i.test(t) && !/Yes, then Start/i.test(t)) {
      el.textContent = t.replace(/\s*$/, "") + " You still tap Yes, then Start. Packs do not send money. Collect stays HOLD.";
      el.dataset.packGiveHonest = "1";
    }
  }

  function honestNextCopy(root) {
    if (!root) return;
    root.querySelectorAll(".road-col p, .road-hint, .meta").forEach(function (el) {
      var t = String(el.textContent || "");
      if (!/Give pack = download/i.test(t)) return;
      if (/Yes, then Start/i.test(t)) return;
      if (!/They install with Yes/i.test(t)) return;
      el.textContent = t.replace(
        /They install with Yes\./i,
        "They install with Yes, then Start. Packs do not send money. Collect stays HOLD."
      );
    });
  }

  function tick() {
    ensureGiveHonesty();
    document.querySelectorAll(".road-hint").forEach(honestRoadHint);
    honestNextCopy(document.getElementById("road-body"));
    honestNextCopy(document.getElementById("sheet-road"));
  }

  function boot() {
    tick();
    if (window.MutationObserver) {
      var obs = new MutationObserver(function () { tick(); });
      ["road-body", "sheet-road", "account-road"].forEach(function (id) {
        var n = document.getElementById(id);
        if (n) obs.observe(n, { childList: true, subtree: true, characterData: true });
      });
    }
    setInterval(tick, 900);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
