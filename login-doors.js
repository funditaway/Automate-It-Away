(function (w) {
  var FALLBACK = [
    { id: "google", name: "Google", group: "live", status: "hold" },
    { id: "github", name: "GitHub", group: "live", status: "hold" },
    { id: "apple", name: "Apple", group: "live", status: "hold" },
    { id: "microsoft", name: "Microsoft", group: "live", status: "hold" },
    { id: "x", name: "X", group: "more", status: "hold" },
    { id: "amazon", name: "Amazon", group: "more", status: "hold" },
    { id: "facebook", name: "Facebook", group: "more", status: "hold" },
    { id: "grok", name: "Grok", group: "ask", status: "ask" },
    { id: "chatgpt", name: "ChatGPT", group: "ask", status: "ask" },
    { id: "claude", name: "Claude", group: "ask", status: "ask" },
    { id: "linkedin", name: "LinkedIn", group: "ext", status: "hold" },
    { id: "discord", name: "Discord", group: "ext", status: "hold" },
    { id: "vercel", name: "Vercel", group: "ext", status: "hold" },
    { id: "yahoo", name: "Yahoo", group: "ext", status: "hold" },
    { id: "passkey", name: "Passkey", group: "ext", status: "hold" },
    { id: "other", name: "Another site", group: "ext", status: "ask" }
  ];
  var box, flash, rows = FALLBACK.slice();
  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c];
    });
  }
  function tag(st) {
    if (st === "live") return ["now", "Live"];
    if (st === "ask") return ["ask", "Ask"];
    return ["hold", "Hold"];
  }
  function hdr() {
    var h = { "Content-Type": "application/json" };
    var tok = "";
    try { tok = localStorage.getItem("aia_session") || ""; } catch (e) {}
    if (tok) h["X-Session"] = tok;
    return h;
  }
  function say(msg, ok) {
    if (!flash) return;
    flash.textContent = msg || "";
    flash.className = ok ? "ok" : "err";
    flash.style.display = msg ? "block" : "none";
  }
  function btns(group) {
    return rows.filter(function (p) { return p.group === group && p.id !== "other" && p.id !== "passkey"; }).map(function (p) {
      var t = tag(p.status);
      return "<button type=\"button\" class=\"oauth-btn\" data-id=\"" + esc(p.id) + "\">Continue with " + esc(p.name) + " <span class=\"oauth-tag " + t[0] + "\">" + t[1] + "</span></button>";
    }).join("");
  }
  function paint() {
    if (!box) return;
    box.innerHTML =
      "<p class=\"oauth-lead\">Or continue with. Identity only — never Send, Stop, pay, or draft.</p>" +
      "<div class=\"oauth-row\" data-group=\"live\">" + btns("live") + "</div>" +
      "<details class=\"oauth-more\"><summary>More doors</summary><div class=\"oauth-row\">" + btns("more") + "</div></details>" +
      "<details class=\"oauth-more\"><summary>Ask · Grok, ChatGPT, Claude</summary><div class=\"oauth-row\">" + btns("ask") + "</div><p class=\"hint\">Those vendors have not admitted AIA as a website login yet. Tap files Ask.</p></details>" +
      "<details class=\"oauth-more\" open><summary>Ext</summary><div class=\"oauth-row\">" + btns("ext") + "</div>" +
      "<div class=\"oauth-ext\"><label>Another site</label><div class=\"oauth-row\"><input id=\"oauth-site\" placeholder=\"any site on the internet\"><button type=\"button\" class=\"oauth-btn\" data-id=\"other\">Ask AIA</button><button type=\"button\" class=\"oauth-btn\" data-id=\"passkey\">Passkey later</button></div></div></details>" +
      "<p class=\"err\" id=\"oauth-flash\" style=\"display:none\"></p>";
    flash = box.querySelector("#oauth-flash");
    box.onclick = function (e) {
      var btn = e.target.closest("[data-id]");
      if (btn) start(btn.getAttribute("data-id"));
    };
  }
  async function start(id) {
    var site = "";
    if (id === "other" || id === "site") {
      id = "other";
      var inp = box && box.querySelector("#oauth-site");
      site = inp ? String(inp.value || "").trim() : "";
      if (!site) { say("Name the site."); return; }
    }
    say("");
    try {
      var r = await fetch("/api/account", {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ action: id === "other" ? "oauth-ask" : "oauth-start", provider: id, site: site, next: location.pathname.indexOf("account") >= 0 ? "link" : "onboard" })
      });
      var d = await r.json().catch(function () { return {}; });
      if (d && d.url) { location.href = d.url; return; }
      say(d.error || d.hint || (r.status === 409 ? "Hold. That door is on the wall until the key or the vendor admits AIA." : "Could not start that door."));
    } catch (e) {
      say("Could not reach the account.");
    }
  }
  async function load() {
    box = document.getElementById("oauth-wall");
    if (!box) return;
    paint();
    try {
      var r = await fetch("/api/account?providers=1");
      var d = await r.json().catch(function () { return {}; });
      if (r.ok && d && (d.providers || d.catalog)) rows = d.providers || d.catalog;
    } catch (e) {}
    paint();
    if (/oauth=1/.test(location.search)) {
      say("Account opened with that login. Name your desk. Give the work a home.", true);
    }
  }
  w.AIALoginDoors = { load: load, start: start, catalog: function () { return rows; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
})(window);
