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
  function markSrc() {
    return isDark() ? "/img/aia-pyramid-tile.svg" : "/img/aia-pyramid-tile-light.svg";
  }
  function paintMarks() {
    document.querySelectorAll("img.brand-mark").forEach(function (img) {
      if (img.getAttribute("src") !== markSrc()) img.src = markSrc();
    });
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
    paintMarks();
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
  function lockHeader() {
    if (document.getElementById("aia-header-lock")) return;
    var s = document.createElement("style");
    s.id = "aia-header-lock";
    s.textContent =
      "header:not(.top), .site-header{background:var(--header)!important;color:#fff!important;" +
      "padding:10px 4.5vw!important;padding-top:calc(10px + env(safe-area-inset-top,0px))!important}" +
      "header, .site-header, header.top{" +
      "font:700 15px/1.2 \"Segoe UI\",system-ui,-apple-system,sans-serif!important;letter-spacing:0!important}" +
      "header a, .site-header a, header button, .site-header button, header span, header strong," +
      "header nav, header .nav, header .desk-tabs, header .desk-tabs a, header .theme-btn, .theme-btn," +
      "header .brand, .site-header .brand, header.top .brand, header > a.brand, header .brand-name," +
      "header .brand-page, header .who-chip, header .who-chip strong, header .who-chip span, header.top .who{" +
      "font:700 15px/1.2 \"Segoe UI\",system-ui,-apple-system,sans-serif!important;" +
      "letter-spacing:0!important;text-transform:none!important;font-style:normal!important}" +
      "header .brand, .site-header .brand, header.top .brand, header > a.brand, .site-header > a.brand{" +
      "display:inline-flex!important;align-items:center!important;gap:8px!important;" +
      "min-height:44px;color:#fff!important;text-decoration:none!important}" +
      "header .brand-name, .site-header .brand-name, header .brand strong, header.top .brand-name{color:#fff!important}" +
      "header .brand-page, .site-header .brand-page{color:var(--header-accent)!important;white-space:nowrap}" +
      "header .brand-mark, .site-header .brand-mark{width:28px;height:28px;flex:0 0 28px;border-radius:7px}" +
      ".who-chip{display:inline-flex!important;flex-direction:row!important;justify-content:flex-end;align-items:center!important;gap:8px!important;" +
      "min-height:44px;max-width:min(52vw,220px);margin-left:auto;padding:4px 8px 4px 4px;border-radius:999px;" +
      "background:rgba(255,255,255,.14);color:#fff;text-decoration:none}" +
      ".who-pic{width:36px;height:36px;border-radius:50%;flex:0 0 36px;display:inline-flex;align-items:center;justify-content:center;" +
      "background:rgba(255,255,255,.2);color:#fff;object-fit:cover;overflow:hidden}" +
      ".who-copy{min-width:0;text-align:right}" +
      ".who-chip strong,.who-chip span,.who-copy strong,.who-copy span{display:block;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}" +
      ".who-chip span,.who-copy span{color:var(--header-accent)}" +
      ".who-chip.out span{color:rgba(255,255,255,.82)}" +
      ".who-chip.out .who-pic{font-size:12px}";
    document.head.appendChild(s);
  }
  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, function (c) {
      return ({ "&": "&", "<": "<", ">": ">", '"': """ })[c];
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
    if (src) return "<img class=\"who-pic\" alt=\"\" src=\"" + esc(src) + "\">";
    return "<span class=\"who-pic\">" + esc(initials(name)) + "</span>";
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
      var btn = header.querySelector("[data-theme-btn], .theme-btn");
      if (btn && btn.parentNode) btn.parentNode.insertBefore(chip, btn);
      else header.appendChild(chip);
    }
    var ws = localStorage.getItem("aia_ws") || "";
    var pin = localStorage.getItem("aia_pin") || "";
    var person = localStorage.getItem("aia_name") || "";
    var role = roleLabel(localStorage.getItem("aia_role") || "");
    var desk = localStorage.getItem("aia_desk_name") || ws;
    var page = pageName();
    if (ws && pin) {
      chip.classList.remove("out");
      chip.href = page === "account" ? "/more" : "/account";
      var title = person || desk || "You";
      var meta = role || "Signed in";
      chip.innerHTML = picHtml(title) + "<span class=\"who-copy\"><strong>" + esc(title) + "</strong><span>" + esc(meta) + "</span></span>";
      chip.title = title + " · Your account";
      return;
    }
    chip.classList.add("out");
    chip.innerHTML = "<span class=\"who-pic\">?</span><span class=\"who-copy\"><strong>Sign in</strong><span>Desk name + code</span></span>";
    if (/^(login|onboard)$/.test(page)) {
      chip.href = page === "login" ? "/onboard" : "/login";
      chip.querySelector("strong").textContent = "Not signed in";
      chip.title = "Open a desk with the name and code. Email is not login.";
      return;
    }
    chip.href = "/login";
    chip.title = "Open this desk";
  }
  function mark() {
    lockHeader();
    paintWho();
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
          a.href = "index.html";
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
  window.AIATheme = { apply: apply, cycle: cycle, label: label, paintWho: paintWho, initials: initials };
})();
