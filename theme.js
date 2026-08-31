(function () {
  function systemDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function isDark() {
    const t = localStorage.getItem("aia_theme") || "system";
    if (t === "dark") return true;
    if (t === "light") return false;
    return systemDark();
  }
  function label() {
    const t = localStorage.getItem("aia_theme") || "system";
    if (t === "dark") return "Dark";
    if (t === "light") return "Light";
    return "Auto";
  }
  function apply() {
    const dark = isDark();
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("light", !dark);
    const meta = document.querySelector("meta[name='theme-color']");
    if (meta) meta.setAttribute("content", dark ? "#0c1116" : "#0d6b6b");
    document.querySelectorAll("[data-theme-btn]").forEach(function (b) {
      b.textContent = label();
      b.title = "Theme: " + label() + ". Tap to change.";
    });
  }
  function cycle() {
    const cur = localStorage.getItem("aia_theme") || "system";
    const next = cur === "system" ? "dark" : cur === "dark" ? "light" : "system";
    localStorage.setItem("aia_theme", next);
    apply();
  }
  apply();
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
  }
  function mark() {
    if (document.querySelector(".brand-mark")) return;
    var host = document.querySelector(".site-header > a, header > a, header .logo, header .brand, header > strong");
    if (!host) return;
    var img = document.createElement("img");
    img.className = "brand-mark";
    img.src = "img/aia-pyramid-tile.svg";
    img.width = 28;
    img.height = 28;
    img.alt = "";
    if (host.tagName === "STRONG") {
      var a = document.createElement("a");
      a.href = "index.html";
      a.appendChild(img);
      a.appendChild(host.cloneNode(true));
      host.replaceWith(a);
      return;
    }
    host.insertBefore(img, host.firstChild);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mark);
  else mark();
  window.AIATheme = { apply: apply, cycle: cycle, label: label };
})();
