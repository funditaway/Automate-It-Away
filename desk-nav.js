(function () {
  var TABS = [
    { id: "queue", label: "Queue", href: "/desk", ico: "M4 6h16M4 12h16M4 18h10" },
    { id: "drop", label: "Drop", href: "/drop", ico: "M12 5v14M5 12h14" },
    { id: "rules", label: "Rules", href: "/rules", ico: "M8 6h12M8 12h12M8 18h8M4 6h.01M4 12h.01M4 18h.01" },
    { id: "pipes", label: "Pipes", href: "/pipes", ico: "M7 8h10M7 16h10M5 12h2m10 0h2" },
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
    if (name === "rules") return "rules";
    if (name === "desk") return "queue";
    if (name === "widget" || name === "drop") return "drop";
    if (name === "connections" || name === "pipes") return "pipes";
    if (name === "more" || name === "history" || name === "people") return "more";
    if (/^(help|admin|setup|support|chat|consign|create|desks|account|market|developer)$/.test(name)) return "more";
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

  function migrateHistoryTab() {
    document.querySelectorAll("#desk-nav [data-tab=\"history\"], .desk-tabs [data-tab=\"history\"]").forEach(function (el) {
      el.setAttribute("data-tab", "rules");
      if (el.tagName === "A") el.setAttribute("href", "/rules");
      var span = el.querySelector("span");
      if (span) span.textContent = "Rules";
      else if (el.childNodes.length === 1) el.textContent = "Rules";
      var path = el.querySelector("path");
      if (path) path.setAttribute("d", "M8 6h12M8 12h12M8 18h8M4 6h.01M4 12h.01M4 18h.01");
    });
  }

  function migratePeopleTab() {
    document.querySelectorAll("#desk-nav [data-tab=\"people\"], .desk-tabs [data-tab=\"people\"]").forEach(function (el) {
      el.setAttribute("data-tab", "pipes");
      if (el.tagName === "A") el.setAttribute("href", "/pipes");
      var span = el.querySelector("span");
      if (span) span.textContent = "Pipes";
      else if (el.childNodes.length === 1) el.textContent = "Pipes";
      var path = el.querySelector("path");
      if (path) path.setAttribute("d", "M7 8h10M7 16h10M5 12h2m10 0h2");
    });
  }

  function wireHrefs() {
    var href = dropHref();
    document.querySelectorAll("#desk-nav [data-tab=\"drop\"], #drop-go, #head-drop, .desk-tabs [data-tab=\"drop\"]").forEach(function (el) {
      if (el && el.tagName === "A") el.setAttribute("href", href);
    });
    document.querySelectorAll("#desk-nav [data-tab=\"rules\"], .desk-tabs [data-tab=\"rules\"]").forEach(function (el) {
      if (el && el.tagName === "A") el.setAttribute("href", "/rules");
    });
    document.querySelectorAll("#desk-nav [data-tab=\"pipes\"], .desk-tabs [data-tab=\"pipes\"]").forEach(function (el) {
      if (el && el.tagName === "A") el.setAttribute("href", "/pipes");
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
      "body.has-desk-nav{padding-bottom:calc(128px + env(safe-area-inset-bottom,0px))}" +
      "header, .site-header{display:flex;flex-wrap:wrap;align-items:center}" +
      ".desk-tabs{width:100%;display:flex;flex-wrap:wrap;justify-content:flex-start;gap:8px 18px;padding-top:8px;font:700 15px/1.2 Segoe UI,system-ui,sans-serif}" +
      ".desk-tabs a{color:#fff;text-decoration:none}.desk-tabs a.on{color:#f39c12}" +
      "#desk-nav{position:fixed;left:0;right:0;bottom:0;z-index:40;display:flex;background:#0d6b6b;color:#fff;padding:8px 4px calc(14px + env(safe-area-inset-bottom,0px));box-shadow:0 -6px 20px rgba(10,79,79,.22)}" +
      "#desk-nav a{flex:1;width:auto;margin:0;min-height:52px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:0;background:transparent;color:rgba(255,255,255,.92);font:700 12px/1.1 system-ui,Segoe UI,sans-serif;letter-spacing:.02em;text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}" +
      "#desk-nav a.on{color:#f39c12}" +
      "#desk-nav svg{width:22px;height:22px;display:block;pointer-events:none}" +
      ".theme-btn{position:relative;z-index:2;pointer-events:auto}";
    document.head.appendChild(css);
  }

  function paintTabs(root, withIcons) {
    if (!root) return;
    var on = tabOf();
    var hrefDrop = dropHref();
    root.innerHTML = TABS.map(function (t) {
      var href = t.id === "drop" ? hrefDrop : t.href;
      var extra = "";
      if (t.id === "drop") extra = root.id === "desk-nav" ? " id=\"nav-drop\"" : " id=\"head-drop\"";
      var ico = withIcons ? svg(t.ico) : "";
      return "<a href=\"" + href + "\" data-tab=\"" + t.id + "\"" + extra + " class=\"" + (on === t.id ? "on" : "") + "\">" +
        ico + "<span>" + t.label + "</span></a>";
    }).join("");
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

  function loadDrop(name, attr) {
    if (tabOf() !== "drop") return;
    if (document.querySelector("script[" + attr + "]")) return;
    var el = document.createElement("script");
    el.src = "/" + name;
    el.setAttribute(attr, "1");
    document.body.appendChild(el);
  }

  function loadQueue(name, attr) {
    if (tabOf() !== "queue") return;
    if (document.querySelector("script[" + attr + "]")) return;
    var el = document.createElement("script");
    el.src = "/" + name;
    el.setAttribute(attr, "1");
    document.body.appendChild(el);
  }

  function loadPeople(name, attr) {
    if (file() !== "people") return;
    if (document.querySelector("script[" + attr + "]")) return;
    var el = document.createElement("script");
    el.src = "/" + name;
    el.setAttribute(attr, "1");
    document.body.appendChild(el);
  }

  function boot() {
    if (window !== window.parent) return;
    ensureCss();
    document.body.classList.add("has-desk-nav");
    migrateHistoryTab();
    migratePeopleTab();
    var nav = document.getElementById("desk-nav");
    if (!nav) {
      nav = document.createElement("nav");
      nav.id = "desk-nav";
      nav.setAttribute("aria-label", "Desk");
      document.body.appendChild(nav);
    }
    paintTabs(nav, true);
    document.querySelectorAll("nav.desk-tabs, .desk-tabs").forEach(function (el) {
      paintTabs(el, false);
    });
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
    loadQueue("pack-card.js", "data-aia-pack-card");
    loadQueue("desk-needs.js", "data-aia-desk-needs");
    loadQueue("desk-inbox.js", "data-aia-desk-inbox");
    loadQueue("desk-queue-packs.js", "data-aia-queue-packs");
    loadPeople("people-desk.js", "data-aia-people-desk");
    loadPeople("people-world.js", "data-aia-people-world");
    loadDrop("drop-talk.js", "data-aia-drop-talk");
    loadDrop("drop-now.js", "data-aia-drop-now");
    loadDrop("drop-more.js", "data-aia-drop-more");
    loadDrop("drop-preview.js", "data-aia-drop-preview");
    loadDrop("drop-chat.js", "data-aia-drop-chat");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
