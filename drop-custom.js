(function () {
  function run() {
    var parts = window.__aiaDropCustomParts || [];
    if (parts.length < 4) return;
    for (var i = 0; i < 4; i++) if (typeof parts[i] !== "string") return;
    if (window.__aiaDropCustomLoaded) return;
    window.__aiaDropCustomLoaded = true;
    var s = document.createElement("script");
    s.textContent = parts.join("");
    (document.head || document.documentElement).appendChild(s);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(run, 0); });
  else setTimeout(run, 0);
  setTimeout(run, 50);
  setTimeout(run, 200);
})();
