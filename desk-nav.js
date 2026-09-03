(function () {
  var TABS = [
    { id: "queue", label: "Queue", href: "/desk", ico: "M4 6h16M4 12h16M4 18h10" },
    { id: "drop", label: "Drop", href: "/drop", ico: "M12 5v14M5 12h14" },
    { id: "history", label: "History", href: "/history", ico: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0" },
    { id: "pipes", label: "Pipes", href: "/connections", ico: "M7 8h10M7 16h10M5 12h2m10 0h2" },
    { id: "more", label: "More", href: "/more", ico: "M6 12h.01M12 12h.01M18 12h.01" }
  ];

  function file() {
    var p = (location.pathname || "").replace(/\/+$/, "");
    p = p.split("/").pop() || "index";
    return p.replace(/\.html$/, "") || "index";
  }

  function shopOpen() {
    return !!(localStorage.getItem("aia_ws") && (localStorage.getItem("aia_session") || localStorage.getItem("aia_pin")));
  }

  function dropHref() {
    if (window.AIADesks && window.AIADesks.widgetHref) return window.AIADesks.widgetHref();
    var ws = localStorage.getItem("aia_ws");
    if (ws) return "/drop?ws=" + encodeURIComponent(ws);
    return "/drop";
  }

  function tabOf() {
    var name = file();
    if (name === "history") return "history";
    if (name === "rules") return "more";
    if ((name === "desk" || name === "desk.html") && location.hash === "#rules") return "more";
    if (name === "desk") return "queue";
    if (name === "widget" || name === "drop") return "drop";
    if (name === "connections") return "pipes";
    if (name === "more") return "more";
    if (/^(help|admin|setup|support|chat|consign|create|desks|account|market)$/.test(name)) return "more";
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

  function migrateRulesTab() {
    document.querySelectorAll("#desk-nav [data-tab=\"rules\"], .desk-tabs [data-tab=\"rules\"]").forEach(function (el) {
      el.setAttribute("data-tab", "history");
      if (el.tagName === "A") el.setAttribute("href", "/history");
      var span = el.querySelector("span");
      if (span) span.textContent = "History";
      else if (el.childNodes.length === 1) el.textContent = "History";
      var path = el.querySelector("path");
      if (path) path.setAttribute("d", "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0");
    });
  }

  function wireHrefs() {
    var href = dropHref();
    document.querySelectorAll("#desk-nav [data-tab=\"drop\"], #drop-go, #head-drop, .desk-tabs [data-tab=\"drop\"]").forEach(function (el) {
      if (el && el.tagName === "A") el.setAttribute("href", href);
    });
    document.querySelectorAll("#desk-nav [data-tab=\"history\"], .desk-tabs [data-tab=\"history\"]").forEach(function (el) {
      if (el && el.tagName === "A") el.setAttribute("href", "/history");
    });
    document.querySelectorAll("#desk-nav [data-tab=\"more\"], .desk-tabs [data-tab=\"more\"]").forEach(function (el) {
      if (el && el.tagName === "A") el.setAttribute("href", "/more");
    });
  }

  function ensureCss() {
    if (document.getElementById("desk-nav-css")) return;
    var css = document.createElement("style");
    css.id = "desk-nav-css";
    css.textContent =
      "body.has-desk-nav{padding-bottom:calc(76px + env(safe-area-inset-bottom,0px))}" +
      ".desk-tabs{width:100%;display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px 10px;padding-top:8px;font:700 15px/1.2 Segoe UI,system-ui,sans-serif}" +
      ".desk-tabs a{color:#fff;text-decoration:none}.desk-tabs a.on{color:#f39c12}" +
      "#desk-nav{position:fixed;left:0;right:0;bottom:0;z-index:40;display:flex;background:#0d6b6b;color:#fff;padding:8px 4px calc(14px + env(safe-area-inset-bottom,0px));box-shadow:0 -6px 20px rgba(10,79,79,.22)}" +
      "#desk-nav a{flex:1;width:auto;margin:0;min-height:52px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:0;background:transparent;color:rgba(255,255,255,.92);font:700 12px/1.1 system-ui,Segoe UI,sans-serif;letter-spacing:.02em;text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}" +
      "#desk-nav a.on{color:#f39c12}" +
      "#desk-nav svg{width:22px;height:22px;display:block;pointer-events:none}" +
      ".theme-btn{position:relative;z-index:2;pointer-events:auto}";
    document.head.appendChild(css);
  }

  function ensureIcons(nav) {
    TABS.forEach(function (t) {
      var a = nav.querySelector("[data-tab=\"" + t.id + "\"]");
      if (!a) return;
      if (!a.querySelector("svg")) {
        a.insertAdjacentHTML("afterbegin", svg(t.ico));
      }
    });
  }

  function liftNav() {
    var nav = document.getElementById("desk-nav");
    var vv = window.visualViewport;
    var gap = 0;
    if (vv) gap = Math.max(0, (window.innerHeight || 0) - vv.height - (vv.offsetTop || 0));
    var kb = gap > 80;
    document.body.classList.toggle("kb-open", kb);
    if (!nav) return;
    if (kb) {
      nav.style.bottom = "0px";
      return;
    }
    nav.style.bottom = gap ? gap + "px" : "0px";
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
        var href = t.id === "drop" ? dropHref() : t.href;
        return "<a href=\"" + href + "\" data-tab=\"" + t.id + "\" class=\"" + (on === t.id ? "on" : "") + "\">" +
          svg(t.ico) + "<span>" + t.label + "</span></a>";
      }).join("");
      document.body.appendChild(nav);
    } else {
      ensureIcons(nav);
    }
    migrateRulesTab();
    wireHrefs();
    paintOn();
    liftNav();
    window.addEventListener("hashchange", paintOn);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", liftNav);
      window.visualViewport.addEventListener("scroll", liftNav);
    }
    window.addEventListener("resize", liftNav);
    if (tabOf() === "queue" && !document.querySelector("script[data-aia-handoff]")) {
      var s = document.createElement("script");
      s.src = "/desk-handoff.js";
      s.setAttribute("data-aia-handoff", "1");
      document.body.appendChild(s);
    }
    if (tabOf() === "queue" && !document.querySelector("script[data-aia-desk-view]")) {
      var v = document.createElement("script");
      v.src = "/desk-view.js";
      v.setAttribute("data-aia-desk-view", "1");
      document.body.appendChild(v);
    }
    if (tabOf() === "queue" && !document.querySelector("script[data-aia-desk-clock]")) {
      var c = document.createElement("script");
      c.src = "/desk-clock.js";
      c.setAttribute("data-aia-desk-clock", "1");
      document.body.appendChild(c);
    }
    if (tabOf() === "drop" && !document.querySelector("script[data-aia-drop-talk]")) {
      var t = document.createElement("script");
      t.src = "/drop-talk.js";
      t.setAttribute("data-aia-drop-talk", "1");
      document.body.appendChild(t);
    }
    if (tabOf() === "drop" && !document.querySelector("script[data-aia-drop-now]")) {
      var n = document.createElement("script");
      n.src = "/drop-now.js";
      n.setAttribute("data-aia-drop-now", "1");
      document.body.appendChild(n);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
