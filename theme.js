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
  function ensureIcon(rel, href, extra) {
    if (!document.head) return;
    if (document.querySelector('link[rel="' + rel + '"][href="' + href + '"]')) return;
    const el = document.createElement("link");
    el.rel = rel;
    el.href = href;
    if (extra) Object.keys(extra).forEach(function (k) { el.setAttribute(k, extra[k]); });
    document.head.appendChild(el);
  }
  function installMark() {
    ensureIcon("icon", "/favicon.svg", { type: "image/svg+xml" });
    ensureIcon("icon", "/favicon.ico", { sizes: "any" });
    ensureIcon("apple-touch-icon", "/apple-touch-icon.png");
    ensureIcon("manifest", "/site.webmanifest");
    if (!document.querySelector("meta[name='theme-color']") && document.head) {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = "#0d6b6b";
      document.head.appendChild(meta);
    }
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
  installMark();
  apply();
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
  }
  window.AIATheme = { apply: apply, cycle: cycle, label: label };
})();
