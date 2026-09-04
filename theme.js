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
  function tileSrc() {
    return isDark() ? "/img/aia-pyramid-tile.svg" : "/img/aia-pyramid-tile-light.svg";
  }
  function markSrc() {
    return "/img/aia-pyramid-header.svg";
  }
  function paintMarks() {
    var headerSrc = markSrc();
    var tile = tileSrc();
    document.querySelectorAll("img.brand-mark").forEach(function (img) {
      var inHeader = img.closest("header, .site-header");
      img.setAttribute("src", inHeader ? headerSrc : tile);
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
    var tools = header.querySelector(".hdr-tools");
    var btn = header.querySelector("[data-theme-btn], .theme-btn");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "theme-btn";
      btn.setAttribute("data-theme-btn", "");
      (tools || header).appendChild(btn);
    }
    btn.type = "button";
    btn.setAttribute("data-theme-btn", "");
    btn.classList.add("theme-btn");
    if (tools && btn.parentNode !== tools) tools.appendChild(btn);
    else if (!tools && btn.parentNode !== header) header.appendChild(btn);
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
      "html,body{overflow-x:clip;max-width:100%}" +
      "img,video,canvas{max-width:100%}" +
      "header:not(.top), .site-header{background:var(--header)!important;color:#fff!important;" +
      "padding:10px 4.5vw!important;padding-top:calc(10px + env(safe-area-inset-top,0px))!important;" +
      "display:flex!important;flex-wrap:wrap!important;align-items:center!important;gap:8px 12px!important}" +
      "header, .site-header{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;" +
      "align-items:center!important;column-gap:10px!important;row-gap:8px!important;overflow:visible!important}" +
      "header .theme-btn, .theme-btn{position:relative;z-index:8;pointer-events:auto!important;" +
      "flex:0 0 auto;min-height:40px;min-width:auto;padding:6px 12px;cursor:pointer;white-space:nowrap}" +
      "header .brand-mark, .site-header .brand-mark{width:32px;height:32px;flex:0 0 32px;border-radius:8px;background:transparent}" +
      ".hdr-tools{display:flex!important;align-items:center;gap:8px;margin-left:0;flex:0 0 auto;" +
      "grid-column:2;grid-row:1;justify-self:end;max-width:100%}" +
      "header > .brand, .site-header > .brand, header > a.brand, header > a:first-child{" +
      "order:1;min-width:0;grid-column:1;grid-row:1}" +
      "header nav.site-nav, header .nav.site-nav, header .nav:not(.desk-tabs), .site-header .nav{" +
      "grid-column:1/-1;grid-row:2;width:100%;min-width:0;flex-wrap:wrap}" +
      ".who-chip{display:inline-flex!important;flex-direction:row!important;align-items:center!important;gap:8px;" +
      "min-height:44px;width:auto;margin-left:0;max-width:min(46vw,168px);padding:4px 12px 4px 4px;border-radius:999px;" +
      "border:1px solid rgba(255,255,255,.4)!important;background:#083838!important;color:#fff!important;text-decoration:none;overflow:hidden}" +
      ".who-chip.signed-out{padding:8px 16px!important;max-width:none!important;gap:0}" +
      ".who-chip.signed-out .who-pic{display:none}" +
      ".who-chip.signed-out .who-copy{text-align:center}" +
      ".who-chip.signed-out .who-copy strong{display:inline!important}" +
      ".who-chip.signed-out .who-copy > span{display:none!important}" +
      ".who-pic{width:32px;height:32px;border-radius:50%;flex:0 0 32px;display:inline-flex;align-items:center;" +
      "justify-content:center;background:rgba(255,255,255,.18);color:#fff;object-fit:cover;overflow:hidden}" +
      ".who-copy{min-width:0;flex:1 1 auto;text-align:right}" +
      ".who-copy strong{display:block;font:700 15px/1.2 Segoe UI,system-ui,sans-serif;color:#fff!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".brand-short{display:none}" +
      "a.btn.outline,.btn.outline,a.outline{background:transparent!important;color:var(--teal)!important;border:1px solid var(--teal)!important}" +
      ".kpi b{display:block;min-height:1.35em;font-size:1.3rem;line-height:1.2;color:var(--teal)}" +
      "body.has-desk-nav header, body.has-desk-nav .site-header{" +
      "display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important}" +
      "body.has-desk-nav header > .brand, body.has-desk-nav header > a.brand," +
      "body.has-desk-nav header > a:first-child, body.has-desk-nav .site-header > .brand{" +
      "grid-column:1;grid-row:1}" +
      "body.has-desk-nav header .hdr-tools, body.has-desk-nav .site-header .hdr-tools{" +
      "grid-column:2;grid-row:1;margin-left:0;justify-self:end;order:0}" +
      "body.has-desk-nav header .desk-tabs, body.has-desk-nav .site-header .desk-tabs{" +
      "grid-column:1/-1;grid-row:2;width:100%}" +
      "body.has-desk-nav header nav.site-nav, body.has-desk-nav header .nav.site-nav{display:none!important}" +
      "@media (max-width:640px){" +
      "header .brand, .site-header .brand, header > a.brand, header > a:first-child{min-width:0}" +
      "header .brand-name,.site-header .brand-name, header > a strong, header .brand strong{display:none!important}" +
      "header .brand-short,.site-header .brand-short{display:inline!important}" +
      ".hdr-tools{gap:6px}" +
      ".who-chip{max-width:none!important}" +
      ".who-copy > span{display:none!important}" +
      "header nav:not(.desk-tabs), header .nav, header .nav.site-nav, .site-header .nav{width:100%!important;flex-wrap:wrap!important}" +
      "header nav.site-nav a[href='/login'], header .nav.site-nav a[href='/login']," +
      "header nav.site-nav a[href='login.html'], header .nav.site-nav a[href='login.html']," +
      "header nav.site-nav a[href='/onboard'], header .nav.site-nav a[href='/onboard']," +
      "header nav.site-nav a[href='onboard.html'], header .nav.site-nav a[href='onboard.html']{display:none!important}" +
      ".hero-grid,.facts,.words,.parts,.steps{grid-template-columns:1fr!important}" +
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
      if (c === "&") return "&" + "amp;";
      if (c === "<") return "&" + "lt;";
      if (c === ">") return "&" + "gt;";
      if (c === '"') return "&" + "quot;";
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
      chip.classList.remove("out", "signed-out");
      chip.href = page === "account" ? "/more" : "/account";
      var title = person || desk || "You";
      var meta = role || "Signed in";
      chip.innerHTML = picHtml(title) + '<span class="who-copy"><strong>' + esc(title) + "</strong><span>" + esc(meta) + "</span></span>";
      chip.title = title + " · Your account";
      return;
    }
    chip.classList.remove("out");
    chip.classList.add("signed-out");
    if (/^(login|onboard)$/.test(page)) {
      chip.innerHTML = '<span class="who-copy"><strong>New desk</strong></span>';
      chip.href = page === "login" ? "/onboard" : "/login";
      chip.title = page === "login" ? "Open a new desk" : "Open a desk you already have";
      return;
    }
    chip.innerHTML = '<span class="who-copy"><strong>Sign in</strong></span>';
    chip.href = "/login";
    chip.title = "Open this desk";
  }
  var SITE_LINKS = [
    { id: "how", href: "/how", label: "How" },
    { id: "setup", href: "/setup", label: "Setup" },
    { id: "desk", href: "/desk", label: "Desk" }
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
  function ensureFixCss() {
    if (document.getElementById("aia-ui-fix-link")) return;
    var l = document.createElement("link");
    l.id = "aia-ui-fix-link";
    l.rel = "stylesheet";
    l.href = "/ui-fix.css";
    document.head.appendChild(l);
  }
  function mark() {
    ensurePhoneMeta();
    lockHeader();
    ensureFixCss();
    ensureBtn();
    paintSiteNav();
    paintWho();
    paintFooter();
    liftChrome(document.querySelector("header, .site-header"));
    var brandHost = document.querySelector(".site-header > a, header > a.brand, header > a, header .logo, header .brand");
    if (brandHost && brandHost.tagName === "A") {
      brandHost.classList.add("brand");
      if (!brandHost.querySelector(".brand-mark")) {
        var img = document.createElement("img");
        img.className = "brand-mark";
        img.src = markSrc();
        img.width = 32;
        img.height = 32;
        img.alt = "";
        brandHost.insertBefore(img, brandHost.firstChild);
      }
      if (!brandHost.querySelector(".brand-name")) {
        var strong = brandHost.querySelector("strong");
        if (strong) {
          strong.classList.add("brand-name");
        }
      }
      if (!brandHost.querySelector(".brand-short")) {
        var short = document.createElement("span");
        short.className = "brand-short";
        short.textContent = "AIA";
        var nameEl = brandHost.querySelector(".brand-name");
        if (nameEl && nameEl.parentNode === brandHost) nameEl.insertAdjacentElement("afterend", short);
        else brandHost.appendChild(short);
      }
    }
    apply();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mark);
  else mark();
  window.AIATheme = { apply: apply, cycle: cycle, label: label, paintWho: paintWho, initials: initials, paintFooter: paintFooter };
})();
