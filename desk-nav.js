(function () {
  var TABS = [
    { id: "queue", label: "Queue", href: "/desk", ico: "M4 6h16M4 12h16M4 18h10" },
    { id: "drop", label: "Drop", href: "/widget.html", ico: "M12 5v14M5 12h14" },
    { id: "rules", label: "Rules", href: "/desk#rules", ico: "M8 6h12M8 12h12M8 18h8M4 6h.01M4 12h.01M4 18h.01" },
    { id: "pipes", label: "Pipes", href: "/connections", ico: "M7 8h10M7 16h10M5 12h2m10 0h2" },
    { id: "more", label: "More", href: "/help", ico: "M6 12h.01M12 12h.01M18 12h.01" }
  ];

  function file() {
    var p = (location.pathname || "").replace(/\/+$/, "");
    p = p.split("/").pop() || "index";
    return p.replace(/\.html$/, "") || "index";
  }

  function shopOpen() {
    return !!(localStorage.getItem("aia_ws") && localStorage.getItem("aia_pin"));
  }

  function dropHref() {
    return shopOpen() ? "/widget.html" : "/onboard";
  }

  function tabOf() {
    var name = file();
    if ((name === "desk" || name === "desk.html") && location.hash === "#rules") return "rules";
    if (name === "desk") return "queue";
    if (name === "widget") return "drop";
    if (name === "connections") return "pipes";
    if (/^(help|admin|setup|support|chat|consign)$/.test(name)) return "more";
    return "";
  }

  function svg(d) {
    return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"" + d + "\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>";
  }

  function paintOn() {
    var on = tabOf();
    document.querySelectorAll("#desk-nav [data-tab]").forEach(function (el) {
      el.classList.toggle("on", el.getAttribute("data-tab") === on);
    });
  }

  function wireHrefs(root) {
    var drop = (root || document).querySelector("#desk-nav [data-tab=\"drop\"], #drop-go");
    if (drop && drop.tagName === "A") drop.setAttribute("href", dropHref());
    document.querySelectorAll("#drop-go").forEach(function (el) {
      if (el.tagName === "A") el.setAttribute("href", dropHref());
    });
  }

  function ensureCss() {
    if (document.getElementById("desk-nav-css")) return;
    var css = document.createElement("style");
    css.id = "desk-nav-css";
    css.textContent =
      "body.has-desk-nav{padding-bottom:calc(68px + env(safe-area-inset-bottom,0px))}" +
      "#desk-nav{position:fixed;left:0;right:0;bottom:0;z-index:15;display:flex;background:#0d6b6b;color:#fff;padding:6px 4px calc(6px + env(safe-area-inset-bottom,0px));box-shadow:0 -6px 20px rgba(10,79,79,.22)}" +
      "#desk-nav a{flex:1;width:auto;margin:0;min-height:52px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:0;background:transparent;color:rgba(255,255,255,.84);font:700 11px/1.1 system-ui,Segoe UI,sans-serif;letter-spacing:.02em;text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}" +
      "#desk-nav a.on{color:#f39c12}" +
      "#desk-nav svg{width:22px;height:22px;display:block;pointer-events:none}" +
      ".theme-btn{position:relative;z-index:2;pointer-events:auto}" +
      "@media(max-width:720px){body.has-desk-nav header span{font-size:0}body.has-desk-nav header span a{display:none}body.has-desk-nav header span .theme-btn,body.has-desk-nav header span button{font-size:12px}body.has-desk-nav header>a+a{display:none}}";
    document.head.appendChild(css);
  }

  function boot() {
    ensureCss();
    document.body.classList.add("has-desk-nav");
    var nav = document.getElementById("desk-nav");
    if (!nav) {
      nav = document.createElement("nav");
      nav.id = "desk-nav";
      nav.setAttribute("aria-label", "Desk");
      var on = tabOf();
      nav.innerHTML = TABS.map(function (t) {
        var href = t.id === "drop" ? dropHref() : t.href;
        return "<a href=\"" + href + "\" data-tab=\"" + t.id + "\" class=\"" + (on === t.id ? "on" : "") + "\">" +
          svg(t.ico) + "<span>" + t.label + "</span></a>";
      }).join("");
      document.body.appendChild(nav);
    } else {
      wireHrefs(nav);
      paintOn();
    }
    wireHrefs(document);
    window.addEventListener("hashchange", paintOn);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
