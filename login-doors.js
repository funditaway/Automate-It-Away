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
  function isLive(p) { return p.status === "live"; }
  function liveBtns() {
    return rows.filter(function (p) { return isLive(p) && p.id !== "other"; }).map(function (p) {
      return "<button type=\"button\" class=\"oauth-btn\" data-id=\"" + esc(p.id) + "\">Continue with " + esc(nameOf(p)) + "</button>";
    }).join("");
  }
  function soonBtns() {
    return rows.filter(function (p) { return !isLive(p) && p.id !== "other"; }).map(function (p) {
      return "<button type=\"button\" class=\"oauth-btn oauth-soon\" disabled aria-disabled=\"true\" data-soon=\"" + esc(p.id) + "\">" + esc(nameOf(p)) + " <span class=\"oauth-tag hold\">Coming soon</span></button>";
    }).join("");
  }
  function paint() {
    if (!box) return;
    var live = liveBtns();
    var soon = soonBtns();
    box.innerHTML =
      (live ? "<p class=\"oauth-lead\">Or continue with</p><div class=\"oauth-row\" data-group=\"live\">" + live + "</div>" : "") +
      (soon ? "<details class=\"oauth-more\" data-group=\"soon\"><summary>Other ways to sign in \u00b7 coming soon</summary><p class=\"hint\">These are not ready yet. Use your desk name and code for now.</p><div class=\"oauth-row\">" + soon + "</div></details>" : "") +
      "<p class=\"err\" id=\"oauth-flash\" style=\"display:none\"></p>";
    flash = box.querySelector("#oauth-flash");
    box.onclick = function (e) {
      var btn = e.target.closest("[data-id]");
      if (!btn || btn.disabled) return;
      var id = btn.getAttribute("data-id");
      var row = rows.filter(function (p) { return p.id === id; })[0];
      if (row && isLive(row)) start(id);
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
      say(d.error || d.hint || (r.status === 409 ? "That sign-in is not ready yet. Use your desk name and code for now." : "Could not start that sign-in."));
    } catch (e) {
      say("Could not reach the account.");
    }
  }
  function soonCss() {
    if (!document.head || document.getElementById("oauth-soon-css")) return;
    var css = document.createElement("style");
    css.id = "oauth-soon-css";
    css.textContent = ".oauth-btn[disabled]{opacity:.6;cursor:not-allowed;border-style:dashed}";
    document.head.appendChild(css);
  }
  async function load() {
    box = document.getElementById("oauth-wall");
    if (!box) return;
    soonCss();
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
      say("That login did not finish. Use your desk name and code for now.");
    }
  }
  w.AIALoginDoors = { load: load, start: start, catalog: function () { return rows; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
})(window);
