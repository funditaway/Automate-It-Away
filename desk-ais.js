/* Named desk AIs + Rail guardrails. Thin strip — not a dashboard fork. */
(function () {
  function shopOpen() {
    return !!(localStorage.getItem("aia_ws") && (localStorage.getItem("aia_session") || localStorage.getItem("aia_pin")));
  }
  function headers() {
    var h = { "Content-Type": "application/json" };
    var ws = localStorage.getItem("aia_ws") || "";
    var pin = localStorage.getItem("aia_pin") || "";
    var tok = localStorage.getItem("aia_session") || "";
    if (ws) h["X-Workspace"] = ws;
    if (tok) h["X-Session"] = tok;
    else if (pin) h["X-Pin"] = pin;
    return h;
  }
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function host() {
    var el = document.getElementById("desk-ais");
    if (el) return el;
    var banner = document.getElementById("banner") || document.getElementById("rules-line") || document.getElementById("aia-line");
    if (!banner || !banner.parentNode) return null;
    el = document.createElement("div");
    el.id = "desk-ais";
    el.className = "item";
    el.hidden = true;
    banner.parentNode.insertBefore(el, banner.nextSibling);
    return el;
  }
  function paint(data) {
    var box = host();
    if (!box) return;
    var rows = (data && (data.ais || (data.desk && data.desk.ais))) || [];
    var rails = (data && (data.aiRails || data.rails || (data.desk && data.desk.aiRails))) || "Yes / Stop / Kill stay human. Desk AIs never Yes themselves. Collect stays HOLD. No silent money or mail.";
    if (!rows.length) {
      box.hidden = false;
      box.innerHTML = "<div class=\"meta\">Desk AI</div><p>No named AI on this desk yet. Create one in Studio or Create. Guardrails still apply: Yes / Stop / Kill stay human. No silent money or mail.</p>" +
        "<p class=\"meta\"><a href=\"/studio\">Creators Studio</a> · <a href=\"/create?kind=ai\">Name an AI</a> · <a href=\"/rules\">Rules</a></p>";
      return;
    }
    box.hidden = false;
    box.innerHTML = "<div class=\"meta\">Desk AI · bound here</div>" +
      rows.map(function (a) {
        return "<p><b>" + esc(a.name) + "</b> · " + esc(a.role || "Doer") +
          (a.does ? " — " + esc(a.does) : "") +
          "<br><span class=\"meta\">Drafts " + esc((a.steps || a.allow || []).join(", ") || "qualify, do, follow") +
          ". Never " + esc((a.never || ["send", "stop", "money", "mail"]).join(" · ")) + ".</span></p>";
      }).join("") +
      "<p class=\"meta\">" + esc(rails) + "</p>";
  }
  async function load() {
    if (!shopOpen()) {
      var box = document.getElementById("desk-ais");
      if (box) {
        box.hidden = false;
        box.innerHTML = "<div class=\"meta\">Desk AI</div><p class=\"meta\">Open this desk to see named AIs and guardrails. Yes / Stop / Kill stay human.</p>";
      }
      return;
    }
    try {
      var r = await fetch("/api/desks", { headers: headers() });
      var d = await r.json().catch(function () { return {}; });
      paint(d.desk || d);
    } catch (e) {
      paint({ ais: [] });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
  window.AIADeskAis = { load: load, paint: paint };
})();
