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
    if (/^(help|admin|setup|support|chat|consign|create)$/.test(name)) return "more";
    return "";
  }
  function svg(d) {
    return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"" + d + "\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>";
  }
  function paintOn() {
    var on = tabOf();
    document.querySelectorAll("#desk-nav [data-tab], .desk-tabs [data-tab]").forEach(function (el) {
      el.classList.toggle("on", el.getAttribute("data-tab") === on);
    });
  }
  function wireHrefs() {
    document.querySelectorAll("#desk-nav [data-tab=\"drop\"], .desk-tabs [data-tab=\"drop\"]").forEach(function (el) {
      if (el && el.tagName === "A") el.setAttribute("href", dropHref());
    });
    document.querySelectorAll("#desk-nav [data-tab=\"rules\"], .desk-tabs [data-tab=\"rules\"]").forEach(function (el) {
      if (el && el.tagName === "A") el.setAttribute("href", "/rules");
    });
    document.querySelectorAll("#desk-nav [data-tab=\"more\"], .desk-tabs [data-tab=\"more\"]").forEach(function (el) {
      if (el && el.tagName === "A") el.setAttribute("href", "/more");
    });
  }
  function ensureCss() {
    if (document.getElementById("desk-nav-css")) return;
    var css = document.createElement("style");
    css.id = "desk-nav-css";
    css.textContent = "body.has-desk-nav{padding-bottom:calc(76px + env(safe-area-inset-bottom,0px))}#desk-nav{position:fixed;left:0;right:0;bottom:0;z-index:40;display:flex;background:#0d6b6b;color:#fff;padding:8px 4px calc(14px + env(safe-area-inset-bottom,0px))}#desk-nav a{flex:1;min-height:52px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:rgba(255,255,255,.92);font:700 12px/1.1 system-ui,sans-serif;text-decoration:none}#desk-nav a.on{color:#f39c12}#desk-nav svg{width:22px;height:22px}";
    document.head.appendChild(css);
  }
  function boot() {
    if (window !== window.parent) return;
    ensureCss();
    document.body.classList.add("has-desk-nav");
    var nav = document.getElementById("desk-nav");
    if (!nav) {
      nav = document.createElement("nav");
      nav.id = "desk-nav";
      nav.setAttribute("aria-label", "Desk");
      var on = tabOf();
      nav.innerHTML = TABS.map(function (t) {
        return "<a href=\"" + t.href + "\" data-tab=\"" + t.id + "\" class=\"" + (on === t.id ? "on" : "") + "\">" + svg(t.ico) + "<span>" + t.label + "</span></a>";
      }).join("");
      document.body.appendChild(nav);
    }
    wireHrefs();
    paintOn();
    if (tabOf() === "queue" && !document.querySelector("script[data-aia-handoff]")) {
      var s = document.createElement("script"); s.src = "/desk-handoff.js"; s.setAttribute("data-aia-handoff", "1"); document.body.appendChild(s);
    }
    if (tabOf() === "queue" && !document.querySelector("script[data-aia-desk-view]")) {
      var v = document.createElement("script"); v.src = "/desk-view.js"; v.setAttribute("data-aia-desk-view", "1"); document.body.appendChild(v);
    }
    if (tabOf() === "drop") {
      if (!document.querySelector("script[data-aia-drop-talk]")) {
        var t = document.createElement("script"); t.src = "/drop-talk.js"; t.setAttribute("data-aia-drop-talk", "1"); document.body.appendChild(t);
      }
      if (!document.querySelector("script[data-aia-drop-now]")) {
        var n = document.createElement("script"); n.src = "/drop-now.js"; n.setAttribute("data-aia-drop-now", "1"); document.body.appendChild(n);
      }
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
