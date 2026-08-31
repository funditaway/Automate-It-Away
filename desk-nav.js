(function () {
  var TABS = [
    { id: "queue", label: "Queue", href: "/desk", ico: "M4 6h16M4 12h16M4 18h10" },
    { id: "drop", label: "Drop", href: "/drop", ico: "M12 5v14M5 12h14" },
    { id: "rules", label: "Rules", href: "/rules", ico: "M8 6h12M8 12h12M8 18h8M4 6h.01M4 12h.01M4 18h.01" },
    { id: "pipes", label: "Pipes", href: "/connections", ico: "M7 8h10M7 16h10M5 12h2m10 0h2" },
    { id: "more", label: "More", href: "/more", ico: "M6 12h.01M12 12h.01M18 12h.01" }
  ];
  function file() {
    var p = (location.pathname || "").replace(/\/+$/, "");
    p = p.split("/").pop() || "index";
    return p.replace(/\.html$/, "") || "index";
  }
  function dropHref() {
    if (window.AIADesks && window.AIADesks.widgetHref) return window.AIADesks.widgetHref();
    var ws = localStorage.getItem("aia_ws");
    if (ws) return "/drop?ws=" + encodeURIComponent(ws);
    return "/drop";
  }
  function tabOf() {
    var name = file();
    if (name === "rules") return "rules";
    if (name === "desk") return "queue";
    if (name === "widget" || name === "drop") return "drop";
    if (name === "connections") return "pipes";
    if (name === "more") return "more";
    return "";
  }
  function svg(d) {
    return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"" + d + "\" fill=\"none stroke=currentColor stroke-width=2 stroke-linecap=round\"/></svg>";
  }
  function boot() {
    if (window !== window.parent) return;
    document.body.classList.add("has-desk-nav");
    if (tabOf() === "queue" && !document.querySelector("script[data-aia-handoff]")) {
      var s = document.createElement("script");
      s.src = "/desk-handoff.js";
      s.setAttribute("data-aia-handoff", "1");
      document.body.appendChild(s);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
