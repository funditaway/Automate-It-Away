(function () {
  function systemDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function isDark() {
    var t = localStorage.getItem("aia_theme") || "system";
    if (t === "dark") return true;
    if (t === "light") return false;
    return systemDark();
  }
  function label() {
    var t = localStorage.getItem("aia_theme") || "system";
    if (t === "dark") return "Dark";
    if (t === "light") return "Light";
    return "Auto";
  }
  function markSrc() {
    return isDark() ? "/img/aia-pyramid-tile.svg" : "/img/aia-pyramid-tile-light.svg";
  }
  function paintMarks() {
    var src = markSrc();
    document.querySelectorAll("img.brand-mark").forEach(function (img) {
      img.setAttribute("src", src);
    });
  }
  function apply() {
    var dark = isDark();
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("light", !dark);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    var meta = document.querySelector("meta[name='theme-color']");
    if (meta) meta.setAttribute("content", dark ? "#0c1116" : "#0d6b6b");
    document.querySelectorAll("[data-theme-btn], .theme-btn").forEach(function (b) {
      b.textContent = label();
      b.setAttribute("aria-label", "Theme " + label());
      b.title = "Theme: " + label() + ". Tap to change.";
    });
    paintMarks();
  }
  var lastTap = 0;
  function cycle(ev) {
    var now = Date.now();
    if (now - lastTap < 280) return;
    lastTap = now;
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    var cur = localStorage.getItem("aia_theme") || "system";
    var next = cur === "system" ? "dark" : cur === "dark" ? "light" : "system";
    localStorage.setItem("aia_theme", next);
    apply();
  }
  function liftChrome(header) {
    if (!header) return;
    var tools = header.querySelector(".hdr-tools");
    if (!tools) {
      tools = document.createElement("div");
      tools.className = "hdr-tools";
      header.appendChild(tools);
    }
    var btn = header.querySelector("[data-theme-btn], .theme-btn");
    var chip = document.getElementById("who-chip");
    if (chip && chip.parentNode !== tools) tools.appendChild(chip);
    if (btn && btn.parentNode !== tools) tools.appendChild(btn);
  }
  function ensureBtn() {
    var header = document.querySelector("header, .site-header");
    if (!header) return;
    if (document.body && document.body.classList.contains("embed")) return;
    var btn = header.querySelector("[data-theme-btn], .theme-btn");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "theme-btn";
      btn.setAttribute("data-theme-btn", "");
      header.appendChild(btn);
    }
    btn.type = "button";
    btn.setAttribute("data-theme-btn", "");
    btn.classList.add("theme-btn");
    if (btn.parentNode !== header) header.appendChild(btn);
    if (!btn.getAttribute("data-aia-bound")) {
      btn.setAttribute("data-aia-bound", "1");
      btn.addEventListener("click", cycle);
    }
  }
  function ensurePhoneMeta() {
    function put(name, content) {
      var el = document.querySelector('meta[name="' + name + '"]');
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    }
    put("apple-mobile-web-app-capable", "yes");
    put("mobile-web-app-capable", "yes");
    put("apple-mobile-web-app-status-bar-style", "black-translucent");
    put("apple-mobile-web-app-title", "AIA");
  }
  apply();
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
  }
  document.addEventListener("click", function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    if (t.closest("[data-theme-btn], button.theme-btn")) cycle(ev);
  });
  function lockHeader() {
    if (document.getElementById("aia-header-lock")) return;
    var s = document.createElement("style");
    s.id = "aia-header-lock";
    s.textContent =
      "html,body{overflow-x:hidden;max-width:100%}" +
      "img,video,canvas{max-width:100%}" +
      "header:not(.top), .site-header{background:var(--header)!important;color:#fff!important;" +
      "padding:10px 4.5vw!important;padding-top:calc(10px + env(safe-area-inset-top,0px))!important;" +
      "display:flex!important;flex-wrap:wrap!important;align-items:center!important;gap:8px 12px!important}" +
      "header .theme-btn, .theme-btn{position:relative;z-index:8;pointer-events:auto!important;" +
      "flex:0 0 auto;min-height:44px;min-width:52px;cursor:pointer}" +
      "header .brand-mark, .site-header .brand-mark{width:28px;height:28px;flex:0 0 28px;border-radius:7px}" +
      ".hdr-tools{display:flex;align-items:center;gap:8px;margin-left:auto;flex:0 0 auto}" +
      ".who-chip{display:inline-flex!important;flex-direction:row!important;align-items:center!important;gap:8px;" +
      "min-height:44px;width:auto;margin-left:0;max-width:min(52vw,200px);padding:4px 12px 4px 4px;border-radius:999px;" +
      "border:1px solid rgba(255,255,255,.4);background:#083838;color:#fff;text-decoration:none;overflow:hidden}" +
      ".who-pic{width:32px;height:32px;border-radius:50%;flex:0 0 32px;display:inline-flex;align-items:center;" +
      "justify-content:center;background:rgba(255,255,255,.18);color:#fff;object-fit:cover;overflow:hidden}" +
      ".who-copy{min-width:3.2rem;flex:1 1 auto;text-align:right}" +
      ".who-copy strong{display:block;font:700 15px/1.2 Segoe UI,system-ui,sans-serif;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      "@media (max-width:640px){" +
      "header .brand, .site-header .brand, header > a.brand, header > a:first-child{order:1;flex:1 1 140px;min-width:0}" +
      "header .brand-name,.site-header .brand-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".hdr-tools{order:2;margin-left:auto}" +
      ".who-chip{max-width:min(46vw,160px)!important}" +
      ".theme-btn{order:0}" +
      ".who-copy > span{display:none!important}" +
      "header nav:not(.desk-tabs), header .nav, .site-header .nav{width:100%!important;flex-wrap:wrap!important;order:5}" +
      ".hero-grid,.facts,.words,.parts,.steps{grid-template-columns:1fr 1fr!important}" +
      "table{display:block;overflow-x:auto}" +
      "}" +
      "@media (max-width:420px){" +
      ".hero-grid,.facts,.words,.parts,.steps{grid-template-columns:1fr!important}" +
      ".reels,.kpis{grid-template-columns:1fr 1fr!important}" +
      ".who-pic{width:28px;height:28px;flex-basis:28px}" +
      "}";
    document.head.appendChild(s);
  }
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      if (c === "&") return "&amp;";
      if (c === "<") return "&lt;";
      if (c === ">") return "&gt;";
      if (c === '"') return "&quot;";
      return "&#39;";
    });
  }
  function roleLabel(r) {
    r = String(r || "").toLowerCase();
    if (r === "owner") return "Owner";
    if (r === "staff") return "Staff";
    if (r === "helper") return "Helper";
    if (r === "friend") return "Friend";
    if (r === "family") return "Family";
    if (r === "agent") return "Agent";
    if (!r) return "";
    return r.charAt(0).toUpperCase() + r.slice(1);
  }
  function pageName() {
    var p = (location.pathname || "").replace(/\/+$/, "");
    p = p.split("/").pop() || "index";
    return p.replace(/\.html$/, "") || "index";
  }
  function initials(name) {
    var p = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!p.length) return "AIA";
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0].charAt(0) + p[p.length - 1].charAt(0)).toUpperCase();
  }
  function photoSrc() {
    return localStorage.getItem("aia_photo") || "";
  }
  function picHtml(name) {
    var src = photoSrc();
    if (src) return '<img class="who-pic" alt="" src="' + esc(src) + '">';
    return '<span class="who-pic">' + esc(initials(name)) + "</span>";
  }
  function paintWho() {
    var header = document.querySelector("header, .site-header");
    if (!header) return;
    if (document.body && document.body.classList.contains("embed")) return;
    if (header.classList.contains("top") && header.querySelector(".who")) return;
    var chip = document.getElementById("who-chip");
    if (!chip) {
      chip = document.createElement("a");
      chip.id = "who-chip";
      chip.className = "who-chip";
      header.appendChild(chip);
    }
    liftChrome(header);
    var ws = localStorage.getItem("aia_ws") || "";
    var pin = localStorage.getItem("aia_pin") || localStorage.getItem("aia_session") || "";
    var person = localStorage.getItem("aia_name") || "";
    var role = roleLabel(localStorage.getItem("aia_role") || "");
    var desk = localStorage.getItem("aia_desk_name") || ws;
    var page = pageName();
    if (ws && pin) {
      chip.classList.remove("out");
      chip.href = page === "account" ? "/more" : "/account";
      var title = person || desk || "You";
      var meta = role || "Signed in";
      chip.innerHTML = picHtml(title) + '<span class="who-copy"><strong>' + esc(title) + "</strong><span>" + esc(meta) + "</span></span>";
      chip.title = title + " · Your account";
      return;
    }
    chip.classList.add("out");
    chip.innerHTML = '<span class="who-pic">?</span><span class="who-copy"><strong>Sign in</strong><span>Desk name + code</span></span>';
    if (/^(login|onboard)$/.test(page)) {
      chip.href = page === "login" ? "/onboard" : "/login";
      var strong = chip.querySelector("strong");
      if (strong) strong.textContent = "Not signed in";
      chip.title = "Open a desk with the name and code. Email is not login.";
      return;
    }
    chip.href = "/login";
    chip.title = "Open this desk";
  }
  var SITE_LINKS = [
    { id: "how", href: "/how", label: "How" },
    { id: "setup", href: "/setup", label: "Setup" },
    { id: "desk", href: "/desk", label: "Desk" },
    { id: "login", href: "/login", label: "Sign in" },
    { id: "onboard", href: "/onboard", label: "Open your desk" }
  ];
  var FOOT_LINKS = [
    { href: "/how", label: "How" },
    { href: "/setup", label: "Setup" },
    { href: "/help", label: "Help" },
    { href: "/pricing", label: "Pricing" },
    { href: "/legal", label: "Legal" },
    { href: "/status", label: "Status" }
  ];
  function isDeskFamily() {
    if (document.body && document.body.classList.contains("has-desk-nav")) return true;
    if (document.querySelector(".desk-tabs, #desk-nav")) return true;
    return /^(desk|widget|drop|rules|connections|more|desks|history|admin|create|help|account)$/.test(pageName());
  }
  function isEmbed() {
    return !!(document.body && document.body.classList.contains("embed"));
  }
  function paintSiteNav() {
    if (isEmbed() || isDeskFamily()) return;
    if (/^(consign|dashboard|chat)$/.test(pageName())) return;
    var header = document.querySelector("header, .site-header");
    if (!header) return;
    var nav = header.querySelector("nav:not(.desk-tabs), .nav");
    if (!nav) {
      nav = document.createElement("nav");
      nav.className = "site-nav";
      header.appendChild(nav);
    }
    nav.classList.add("site-nav");
    var page = pageName();
    nav.innerHTML = SITE_LINKS.map(function (l) {
      return "<a href=\"" + l.href + "\"" + (l.id === page ? " class=\"on\"" : "") + ">" + l.label + "</a>";
    }).join("");
  }
  function paintFooter() {
    if (isEmbed()) return;
    if (/^(chat)$/.test(pageName())) return;
    var foot = document.querySelector("footer");
    if (!foot) {
      foot = document.createElement("footer");
      foot.className = "site-foot";
      document.body.appendChild(foot);
    }
    foot.classList.add("site-foot");
    var links = FOOT_LINKS.map(function (l) {
      return "<a href=\"" + l.href + "\">" + l.label + "</a>";
    }).join("<span aria-hidden=\"true\">·</span>");
    foot.innerHTML = "<p>© 2026 Automate It Away</p><nav>" + links + "</nav>";
  }
  function mark() {
    ensurePhoneMeta();
    lockHeader();
    ensureBtn();
    paintSiteNav();
    paintWho();
    paintFooter();
    liftChrome(document.querySelector("header, .site-header"));
    if (!document.querySelector(".brand-mark")) {
      var host = document.querySelector(".site-header > a, header > a, header .logo, header .brand, header > strong");
      if (host) {
        var img = document.createElement("img");
        img.className = "brand-mark";
        img.src = markSrc();
        img.width = 28;
        img.height = 28;
        img.alt = "";
        if (host.tagName === "STRONG") {
          var a = document.createElement("a");
          a.href = "/";
          a.appendChild(img);
          a.appendChild(host.cloneNode(true));
          host.replaceWith(a);
        } else {
          host.insertBefore(img, host.firstChild);
        }
      }
    }
    apply();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mark);
  else mark();
  window.AIATheme = { apply: apply, cycle: cycle, label: label, paintWho: paintWho, initials: initials, paintFooter: paintFooter };
})();
