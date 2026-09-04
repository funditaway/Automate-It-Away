(function () {
  function icon(rel, href, extra) {
    if (!document.head) return;
    if (document.querySelector('link[rel="' + rel + '"][href="' + href + '"]')) return;
    var el = document.createElement("link");
    el.rel = rel;
    el.href = href;
    if (extra) {
      Object.keys(extra).forEach(function (k) { el.setAttribute(k, extra[k]); });
    }
    document.head.appendChild(el);
  }
  icon("icon", "/favicon.svg", { type: "image/svg+xml" });
  icon("icon", "/favicon.ico", { sizes: "any" });
  icon("apple-touch-icon", "/apple-touch-icon.png");
  icon("manifest", "/site.webmanifest");

  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };
  var s = document.createElement("script");
  s.defer = true;
  s.src = "/_vercel/insights/script.js";
  document.head.appendChild(s);

  function blankMoneyExample() {
    var money = document.getElementById("rule-money");
    if (money && (money.getAttribute("placeholder") === "250" || money.getAttribute("placeholder") === "$250")) {
      money.setAttribute("placeholder", "leave blank");
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", blankMoneyExample);
  else blankMoneyExample();
})();
