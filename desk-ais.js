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
    var mail = (data && (data.mail || (data.desk && data.desk.mail))) || [];
    var rails = (data && (data.aiRails || data.rails || (data.desk && data.desk.aiRails))) || "Yes / Stop / Kill stay human. Desk AIs never Yes themselves. Collect stays HOLD. No silent money or mail.";
    var inet = (data && (data.net || data.internet || (data.desk && data.desk.net))) || null;
    var netNote = (inet && inet.note) || ".aia names on this desk now. Wallet / registry connect later as a Pipe HOLD.";
    var aiaName = (data && (data.aia || (data.desk && data.desk.aia))) || "";
    if (!rows.length) {
      box.hidden = false;
      box.innerHTML = "<div class=\"meta\">Desk AI · AIA Internet</div><p>No named AI on this desk yet. Create one in Studio or Create. Guardrails still apply: Yes / Stop / Kill stay human. No silent money or mail.</p>" +
        "<p class=\"meta\">" + esc(netNote) + (aiaName ? (" This desk is " + esc(aiaName) + ".") : "") + "</p>" +
        "<p class=\"meta\"><a href=\"/studio\">Creators Studio</a> · <a href=\"/create?kind=ai\">Name an AI</a> · <a href=\"/account\">Create .aia email</a> · <a href=\"/rules\">Rules</a></p>";
      return;
    }
    box.hidden = false;
    box.innerHTML = "<div class=\"meta\">Desk AI · bound here" + (aiaName ? " · " + esc(aiaName) : "") + "</div>" +
      rows.map(function (a) {
        return "<p><b>" + esc(a.name) + "</b>" + (a.aia ? " · " + esc(a.aia) : "") + " · " + esc(a.role || "Doer") +
          (a.does ? " — " + esc(a.does) : "") +
          "<br><span class=\"meta\">Drafts " + esc((a.steps || a.allow || []).join(", ") || "qualify, do, follow") +
          ". Never " + esc((a.never || ["send", "stop", "money", "mail"]).join(" · ")) + ".</span></p>";
      }).join("") +
      (mail.length ? "<p class=\"meta\">.aia email · " + mail.map(function (m) { return esc(m.address); }).join(" · ") + " · Send HOLD</p>" : "<p class=\"meta\">Create a .aia email for automations on Account, Studio, or Desks. Send stays HOLD.</p>") +
      "<p class=\"meta\">" + esc(rails) + "</p>" +
      "<p class=\"meta\">" + esc(netNote) + "</p>";
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
