(function (w) {
  var FALLBACK = [
    { id: "google", label: "Google", group: "live", status: "hold" },
    { id: "github", label: "GitHub", group: "live", status: "hold" },
    { id: "apple", label: "Apple", group: "live", status: "hold" },
    { id: "microsoft", label: "Microsoft", group: "live", status: "hold" },
    { id: "x", label: "X", group: "more", status: "hold" },
    { id: "amazon", label: "Amazon", group: "more", status: "hold" },
    { id: "facebook", label: "Facebook", group: "more", status: "hold" },
    { id: "grok", label: "Grok", group: "ask", status: "ask" },
    { id: "chatgpt", label: "ChatGPT", group: "ask", status: "ask" },
    { id: "claude", label: "Claude", group: "ask", status: "ask" },
    { id: "linkedin", label: "LinkedIn", group: "ext", status: "hold" },
    { id: "discord", label: "Discord", group: "ext", status: "hold" },
    { id: "vercel", label: "Vercel", group: "ext", status: "hold" },
    { id: "yahoo", label: "Yahoo", group: "ext", status: "hold" },
    { id: "passkey", label: "Passkey", group: "ext", status: "ask" },
    { id: "other", label: "Another site", group: "ext", status: "ask" }
  ];
  var box, flash, rows = FALLBACK.slice();
  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c];
    });
  }
  function nameOf(p) { return p.label || p.name || p.id; }
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
    return rows.filter(function (p) { return p.group === group && p.id !== "other"; }).map(function (p) {
      var t = tag(p.status);
      return "<button type=\"button\" class=\"oauth-btn\" data-id=\"" + esc(p.id) + "\">Continue with " + esc(nameOf(p)) + " <span class=\"oauth-tag " + t[0] + "\">" + t[1] + "</span></button>";
    }).join("");
  }
  function paint() {
    if (!box) return;
    box.innerHTML =
      "<p class=\"oauth-lead\">Live door is desk name + code, or email + password. Continue-with stays Hold until the app id is on the box. Identity only \u2014 never Send, Stop, pay, or draft.</p>" +
      "<details class=\"oauth-more\"><summary>Continue with \u2014 Hold</summary><div class=\"oauth-row\" data-group=\"live\">" + btns("live") + "</div></details>" +
      "<details class=\"oauth-more\"><summary>More doors</summary><div class=\"oauth-row\">" + btns("more") + "</div></details>" +
      "<details class=\"oauth-more\"><summary>Ask \u00b7 Grok, ChatGPT, Claude</summary><div class=\"oauth-row\">" + btns("ask") + "</div><p class=\"hint\">Those vendors have not admitted AIA as a website login yet. Tap files Ask.</p></details>" +
      "<details class=\"oauth-more\"><summary>Ext</summary><div class=\"oauth-row\">" + btns("ext") + "</div>" +
      "<div class=\"oauth-ext\"><label>Another site</label><div class=\"oauth-row\"><input id=\"oauth-site\" placeholder=\"any site on the internet\"><button type=\"button\" class=\"oauth-btn\" data-id=\"other\">Ask AIA</button></div></div></details>" +
      "<p class=\"err\" id=\"oauth-flash\" style=\"display:none\"></p>";
    flash = box.querySelector("#oauth-flash");
    box.onclick = function (e) {
      var btn = e.target.closest("[data-id]");
      if (btn) start(btn.getAttribute("data-id"));
    };
  }
  async function start(id) {
    var site = "";
    if (id === "other" || id === "site" || id === "ext") {
      var inp = box && box.querySelector("#oauth-site");
      site = inp ? String(inp.value || "").trim() : "";
      if (!site && id === "other") { say("Name the site."); return; }
    }
    say("");
    try {
      var r = await fetch("/api/account", {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({
          action: id === "other" ? "ask-other" : "oauth-start",
          provider: id,
          site: site,
          next: location.pathname.indexOf("account") >= 0 ? "link" : "onboard"
        })
      });
      if (r.status === 400 || r.status === 404) {
        r = await fetch("/api/auth", {
          method: "POST",
          headers: hdr(),
          body: JSON.stringify({
            action: id === "other" ? "ask-other" : "oauth-start",
            provider: id,
            site: site,
            next: location.pathname.indexOf("account") >= 0 ? "link" : "onboard"
          })
        });
      }
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
      if (!r.ok) r = await fetch("/api/auth?providers=1");
      var d = await r.json().catch(function () { return {}; });
      if (r.ok && d && (d.providers || d.catalog)) {
        rows = (d.providers || d.catalog).map(function (p) {
          return {
            id: p.id,
            label: p.label || p.name || p.id,
            group: p.group,
            status: p.status || (p.live ? "live" : p.ask ? "ask" : "hold")
          };
        });
      }
    } catch (e) {}
    paint();
    if (/oauth=1/.test(location.search)) {
      say("Account opened with that login. Name your desk. Give the work a home.", true);
    }
    if (/oauth=err/.test(location.search)) {
      say("That login did not finish. Try another door.");
    }
  }
  w.AIALoginDoors = { load: load, start: start, catalog: function () { return rows; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
})(window);
