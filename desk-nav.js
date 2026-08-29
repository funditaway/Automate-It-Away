(function () {
  var TABS = [
    { id: "queue", label: "Queue", href: "desk.html", ico: "M4 6h16M4 12h16M4 18h10" },
    { id: "drop", label: "Drop", href: "widget.html", ico: "M12 5v14M5 12h14" },
    { id: "rules", label: "Rules", href: "desk.html#rules", ico: "M8 6h12M8 12h12M8 18h8M4 6h.01M4 12h.01M4 18h.01" },
    { id: "pipes", label: "Pipes", href: "connections.html", ico: "M7 8h10M7 16h10M5 12h2m10 0h2" },
    { id: "more", label: "More", href: "#more", ico: "M6 12h.01M12 12h.01M18 12h.01" }
  ];
  var MORE = [
    { href: "help.html", label: "Help" },
    { href: "admin.html", label: "People" },
    { href: "setup.html", label: "Setup" },
    { href: "chat.html", label: "Tell the desk" },
    { href: "support.html", label: "Support" }
  ];

  function file() {
    var p = (location.pathname || "").split("/").pop() || "index.html";
    if (!p || p === "/") return "index.html";
    return p.indexOf(".") === -1 ? p + ".html" : p;
  }

  function tabOf() {
    var name = file();
    if (name === "desk.html" && location.hash === "#rules") return "rules";
    if (name === "desk.html") return "queue";
    if (name === "widget.html") return "drop";
    if (name === "connections.html") return "pipes";
    if (/^(help|admin|setup|support|chat|consign)\.html$/.test(name)) return "more";
    return "";
  }

  function svg(d) {
    return "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"" + d + "\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>";
  }

  function goRules(e) {
    if (file() !== "desk.html") return;
    if (e) e.preventDefault();
    location.hash = "rules";
    var el = document.getElementById("rules");
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
    paintOn();
  }

  function toggleMore(e) {
    if (e) e.preventDefault();
    var sheet = document.getElementById("desk-more");
    if (!sheet) return;
    sheet.classList.toggle("on");
  }

  function paintOn() {
    var on = tabOf();
    document.querySelectorAll("#desk-nav [data-tab]").forEach(function (el) {
      el.classList.toggle("on", el.getAttribute("data-tab") === on);
    });
  }

  function boot() {
    if (document.getElementById("desk-nav")) return;
    if (!document.getElementById("desk-nav-css")) {
      var css = document.createElement("style");
      css.id = "desk-nav-css";
      css.textContent =
        "body.has-desk-nav{padding-bottom:calc(68px + env(safe-area-inset-bottom,0px))}" +
        "#desk-nav{position:fixed;left:0;right:0;bottom:0;z-index:15;display:flex;background:#0d6b6b;color:#fff;padding:6px 4px calc(6px + env(safe-area-inset-bottom,0px));box-shadow:0 -6px 20px rgba(10,79,79,.22)}" +
        "#desk-nav a,#desk-nav button{flex:1;width:auto;margin:0;min-height:52px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:0;background:transparent;color:rgba(255,255,255,.84);font:700 11px/1.1 system-ui,Segoe UI,sans-serif;letter-spacing:.02em;text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent}" +
        "#desk-nav a.on,#desk-nav button.on{color:#f39c12}" +
        "#desk-nav svg{width:22px;height:22px;display:block}" +
        "#desk-more{display:none;position:fixed;inset:0;z-index:16;background:rgba(10,79,79,.45);align-items:flex-end;justify-content:center}" +
        "#desk-more.on{display:flex}" +
        "#desk-more .card{width:min(440px,100%);background:#fff;color:#1a2332;border-radius:16px 16px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));margin-bottom:calc(68px + env(safe-area-inset-bottom,0px))}" +
        "html.dark #desk-more .card{background:#151b22;color:#e8eef4}" +
        "#desk-more h3{margin:0 0 8px;color:#0a4f4f;font-size:1rem}" +
        "html.dark #desk-more h3{color:#d4f0f0}" +
        "#desk-more a{display:block;padding:12px;margin:6px 0;border-radius:10px;background:#e6f7f7;color:#0a4f4f;font-weight:700;text-decoration:none}" +
        "html.dark #desk-more a{background:#163333;color:#c8eeee}" +
        "#desk-more .close{background:#f39c12;color:#fff}" +
        "@media(max-width:720px){body.has-desk-nav header span a,body.has-desk-nav header>a+a{display:none}}";
      document.head.appendChild(css);
    }
    document.body.classList.add("has-desk-nav");
    var on = tabOf();
    var nav = document.createElement("nav");
    nav.id = "desk-nav";
    nav.setAttribute("aria-label", "Desk");
    nav.innerHTML = TABS.map(function (t) {
      var tag = t.id === "more" ? "button" : "a";
      var extra = t.id === "more" ? " type=\"button\"" : " href=\"" + t.href + "\"";
      return "<" + tag + extra + " data-tab=\"" + t.id + "\" class=\"" + (on === t.id ? "on" : "") + "\">" +
        svg(t.ico) + "<span>" + t.label + "</span></" + tag + ">";
    }).join("");
    var more = document.createElement("div");
    more.id = "desk-more";
    more.innerHTML = "<div class=\"card\"><h3>More</h3>" +
      MORE.map(function (m) { return "<a href=\"" + m.href + "\">" + m.label + "</a>"; }).join("") +
      "<a href=\"#\" class=\"close\" id=\"desk-more-close\">Close</a></div>";
    document.body.appendChild(nav);
    document.body.appendChild(more);
    var rules = nav.querySelector("[data-tab=\"rules\"]");
    if (rules) rules.addEventListener("click", goRules);
    var moreBtn = nav.querySelector("[data-tab=\"more\"]");
    if (moreBtn) moreBtn.addEventListener("click", toggleMore);
    more.addEventListener("click", function (e) {
      if (e.target === more) more.classList.remove("on");
    });
    var close = document.getElementById("desk-more-close");
    if (close) close.addEventListener("click", function (e) { e.preventDefault(); more.classList.remove("on"); });
    window.addEventListener("hashchange", paintOn);
    if (location.hash === "#rules") goRules();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
