(function () {
  var RECENT = "aia_drop_recent";
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
    });
  }
  function desk() {
    var cur = (window.AIADesks && AIADesks.current && AIADesks.current()) || {};
    var q = new URLSearchParams(location.search).get("ws") || "";
    return {
      slug: q || cur.slug || window.ws || localStorage.getItem("aia_ws") || "",
      name: cur.name || q || localStorage.getItem("aia_desk_name") || ""
    };
  }
  function recent() {
    try {
      var rows = JSON.parse(localStorage.getItem(RECENT) || "[]");
      return Array.isArray(rows) ? rows.filter(function (r) { return r && r.slug; }).slice(0, 6) : [];
    } catch (e) { return []; }
  }
  function rememberPublic(row) {
    if (!row || !row.slug) return;
    var rows = recent().filter(function (r) { return r.slug !== row.slug; });
    rows.unshift({ slug: row.slug, name: row.name || row.slug, at: Date.now() });
    try { localStorage.setItem(RECENT, JSON.stringify(rows.slice(0, 6))); } catch (e) {}
  }
  function banner() {
    var on = desk();
    var el = document.getElementById("drop-on");
    if (!el) {
      el = document.createElement("p"); el.id = "drop-on"; el.className = "sub";
      var title = document.getElementById("drop-title");
      if (title && title.parentNode) title.parentNode.insertBefore(el, title.nextSibling);
    }
    if (!on.slug) { el.textContent = "No desk yet. Pick one, say which desk, or find a public desk."; return; }
    el.innerHTML = "Dropping on <b>" + esc(on.name || on.slug) + "</b>. <a href=\"/drop\">Change desk</a>";
  }
  function camera() {
    var photo = document.getElementById("photo"); if (!photo) return;
    photo.setAttribute("capture", "environment");
    if (document.getElementById("take-photo")) return;
    var btn = document.createElement("button");
    btn.type = "button"; btn.id = "take-photo"; btn.className = "ghost"; btn.textContent = "Take a photo"; btn.style.width = "auto";
    photo.parentNode.insertBefore(btn, photo.nextSibling);
    btn.onclick = function () { photo.setAttribute("capture", "environment"); photo.click(); };
  }
  function paintRecent() {
    var host = document.getElementById("public-desk-search") || document.getElementById("desk-pick");
    if (!host || document.getElementById("recent-public")) return;
    var rows = recent(); if (!rows.length) return;
    var box = document.createElement("div"); box.id = "recent-public";
    box.innerHTML = "<label>Recent public desks</label><div class=\"desk-chips\" id=\"recent-public-hits\">" +
      rows.map(function (d) { return "<button type=\"button\" data-public-desk=\"" + esc(d.slug) + "\">" + esc(d.name || d.slug) + "</button>"; }).join("") + "</div>";
    host.appendChild(box);
    box.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-public-desk]");
      if (btn) location.href = "/drop?ws=" + encodeURIComponent(btn.getAttribute("data-public-desk"));
    });
  }
  function afterLinks(job) {
    var ok = document.getElementById("ok"); if (!ok) return;
    var title = (job && job.title) || "";
    var draft = (job && (job.draft || job.next || job.notes || job.title)) || title;
    var phone = (job && job.phone) || "";
    var email = (job && job.email) || "";
    var sms = phone ? "<a class=\"ghost\" href=\"sms:" + encodeURIComponent(phone) + "?&body=" + encodeURIComponent(draft) + "\">Text it</a>" : "";
    var mail = email ? "<a class=\"ghost\" href=\"mailto:" + encodeURIComponent(email) + "?subject=" + encodeURIComponent(title) + "&body=" + encodeURIComponent(draft) + "\">Email it</a>" : "";
    var extra = document.getElementById("drop-after");
    if (!extra) { extra = document.createElement("div"); extra.id = "drop-after"; extra.className = "desk-actions"; ok.parentNode.insertBefore(extra, ok.nextSibling); }
    extra.innerHTML = "<button type=\"button\" class=\"ghost\" id=\"copy-drop-draft\">Copy draft</button>" + sms + mail;
    extra.style.display = "flex";
    var btn = document.getElementById("copy-drop-draft");
    if (btn) btn.onclick = function () {
      if (navigator.clipboard) navigator.clipboard.writeText(draft);
      ok.textContent = "Draft copied. You send it. Desk does not send.";
    };
  }
  function wrapSend() {
    if (window.__aiaDropNowFetch) return;
    window.__aiaDropNowFetch = true;
    var real = window.fetch;
    window.fetch = function (url, opts) {
      var req = real.call(this, url, opts);
      try {
        if (String(url).indexOf("/api/jobs") < 0 || !opts || !opts.body) return req;
        var body = JSON.parse(opts.body);
        if (body.action !== "capture") return req;
        return req.then(function (res) {
          var copy = res.clone();
          copy.json().then(function (out) {
            var job = out && (out.job || out);
            if (res.ok && job) { var on = desk(); rememberPublic({ slug: on.slug, name: on.name }); afterLinks(job); }
          }).catch(function () {});
          return res;
        });
      } catch (e) { return req; }
    };
  }
  function findPublicFromTalk() {
    if (!window.AIADropTalk || AIADropTalk.__findWrap) return;
    AIADropTalk.__findWrap = true;
    var orig = AIADropTalk.fill; if (!orig) return;
    AIADropTalk.fill = function (heard) {
      var text = String(heard || "").trim();
      var find = text.match(/^\s*(?:find|search|look up)\s+(?:a\s+)?(?:public\s+)?(?:desk\s+)?(.+)$/i);
      if (find) {
        var q = find[1].replace(/\s+desk\s*$/i, "").trim();
        var input = document.getElementById("public-desk-q");
        if (input) { input.value = q; input.dispatchEvent(new Event("input", { bubbles: true })); }
        var status = document.getElementById("talkStatus");
        if (status) status.textContent = "Looking for a public desk named " + q + ".";
        if (window.AIASpeech) AIASpeech.speak("Looking for a public desk.");
        return;
      }
      return orig(heard);
    };
  }
  function boot() {
    if (!document.getElementById("drop-title")) return;
    banner(); camera(); paintRecent(); wrapSend(); findPublicFromTalk();
    var on = desk();
    if (on.slug && /(?:^|[?&])ws=/.test(location.search)) rememberPublic(on);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
