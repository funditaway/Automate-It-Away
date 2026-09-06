/* Named desk AIs + Rail guardrails. Thin strip — not a dashboard fork. */
(function () {
  var ROWS = [];
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
  function clipFace(s, n) {
    var t = String(s || "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    var max = n || 80;
    if (t.length <= max) return t;
    return t.slice(0, max).replace(/\s+\S*$/, "").replace(/[.,;:]+$/, "") + "…";
  }
  function host() {
    var el = document.getElementById("desk-ais");
    if (el) return el;
    var banner = document.getElementById("banner") || document.getElementById("rules-line") || document.getElementById("aia-line");
    if (!banner || !banner.parentNode) return null;
    el = document.createElement("div");
    el.id = "desk-ais";
    el.className = "item desk-ais-box";
    banner.parentNode.insertBefore(el, banner.nextSibling);
    return el;
  }
  function injectCss() {
    if (document.getElementById("aia-desk-ais-css")) return;
    var css = document.createElement("style");
    css.id = "aia-desk-ais-css";
    css.textContent = ".desk-ais-box .ai-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;margin:10px 0}" +
      ".desk-ais-box .ai-card h3{font-size:1.05rem;line-height:1.3;margin:6px 0}" +
      ".desk-ais-box .ai-does{color:var(--heading);font-size:14px;margin:4px 0 6px}" +
      ".desk-ais-box .ai-prompt{color:var(--muted);font-size:13px;margin:0 0 8px}" +
      ".desk-ais-box .q-ai{background:var(--teal,#119494);color:#fff}" +
      ".desk-ais-box .q-ai-does,.desk-ais-box .q-ai-prompt{background:var(--edit);color:var(--heading);font-weight:700}" +
      ".desk-ais-box .q-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}" +
      ".desk-ais-box .q-chip{display:inline-flex;align-items:center;min-height:28px;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:800}";
    document.head.appendChild(css);
  }
  function faceOf(a) {
    var name = (a && a.name) || "Desk AI";
    var does = clipFace((a && a.does) || "", 72);
    return name + " · Then draft" + (does ? " · " + does : "");
  }
  function cardOf(a) {
    var does = clipFace((a && a.does) || "", 160);
    var prompt = clipFace((a && (a.promptSummary || a.prompt)) || "", 80);
    var chips = "<span class=\"q-chip q-ai\">" + esc(a.name || "Desk AI") + "</span>" +
      (a.role ? " <span class=\"q-chip q-stat\">" + esc(a.role) + "</span>" : "") +
      (does ? " <span class=\"q-chip q-ai-does\">" + esc(does) + "</span>" : "") +
      (prompt && prompt !== does ? " <span class=\"q-chip q-ai-prompt\">" + esc(prompt) + "</span>" : "");
    return "<article class=\"ai-card q-card\">" +
      "<div class=\"q-head\"><div class=\"q-chips\">" + chips + "</div></div>" +
      "<h3>" + esc(a.name || "Desk AI") + (a.aia ? " · " + esc(a.aia) : "") + "</h3>" +
      (does ? "<p class=\"ai-does\">" + esc(does) + "</p>" : "") +
      (prompt ? "<p class=\"ai-prompt\">Prompt · " + esc(prompt) + "</p>" : "<p class=\"ai-prompt\">No prompt on this bot yet. It still drafts HOLD.</p>") +
      "<p class=\"meta\">On queue cards: " + esc(faceOf(a)) + ". Ask Grok / Then draft / Needs you name this AI.</p>" +
      "<p class=\"meta\">Drafts " + esc((a.steps || a.allow || []).join(", ") || "qualify, do, follow") +
        ". Never " + esc((a.never || ["send", "stop", "money", "mail"]).join(" · ")) +
        ". Yes / Stop / Kill stay human.</p>" +
      "</article>";
  }
  function paint(data) {
    var box = host();
    if (!box) return;
    injectCss();
    var rows = (data && (data.ais || (data.desk && data.desk.ais))) || [];
    ROWS = Array.isArray(rows) ? rows.slice() : [];
    if (window.AIADeskAis) window.AIADeskAis.rows = ROWS;
    var mail = (data && (data.mail || (data.desk && data.desk.mail))) || [];
    var rails = (data && (data.aiRails || data.rails || (data.desk && data.desk.aiRails))) || "Yes / Stop / Kill stay human. Desk AIs never Yes themselves. Collect stays HOLD. No silent money or mail.";
    var inet = (data && (data.net || data.internet || (data.desk && data.desk.net))) || null;
    var netNote = (inet && inet.note) || ".aia names on this desk now. Wallet / registry connect later as a Pipe HOLD.";
    var aiaName = (data && (data.aia || (data.desk && data.desk.aia))) || "";
    box.className = (box.className || "").indexOf("desk-ais-box") >= 0 ? box.className : ((box.className || "item") + " desk-ais-box");
    if (!rows.length) {
      box.hidden = false;
      box.innerHTML = "<div class=\"meta\">Desk AIs · AIA Internet</div><p>No named AI on this desk yet. Create one in Studio or Create. Guardrails still apply: Yes / Stop / Kill stay human. No silent money or mail.</p>" +
        "<p class=\"meta\">" + esc(netNote) + (aiaName ? (" This desk is " + esc(aiaName) + ".") : "") + "</p>" +
        "<p class=\"meta\"><a href=\"/studio\">Creators Studio</a> · <a href=\"/create?kind=ai\">Name an AI</a> · <a href=\"/account\">Create .aia email</a> · <a href=\"/rules\">Rules</a></p>";
      return;
    }
    box.hidden = false;
    box.innerHTML = "<div class=\"meta\">Desk AIs · bound here" + (aiaName ? " · " + esc(aiaName) : "") + " · how they show on queue cards</div>" +
      rows.map(cardOf).join("") +
      (mail.length ? "<p class=\"meta\">.aia email · " + mail.map(function (m) { return esc(m.address); }).join(" · ") + " · Send HOLD</p>" : "<p class=\"meta\">Create a .aia email for automations on Account, Studio, or Desks. Send stays HOLD.</p>") +
      "<p class=\"meta\">" + esc(rails) + "</p>" +
      "<p class=\"meta\">" + esc(netNote) + "</p>";
  }
  async function refresh() {
    if (!shopOpen()) {
      ROWS = [];
      if (window.AIADeskAis) window.AIADeskAis.rows = ROWS;
      var box = document.getElementById("desk-ais");
      if (box) {
        box.hidden = false;
        box.innerHTML = "<div class=\"meta\">Desk AIs</div><p class=\"meta\">Open this desk to see named AIs and how they show on queue cards. Yes / Stop / Kill stay human.</p>";
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
  async function load() {
    await refresh();
  }
  function wrapLoad() {
    if (typeof window.load !== "function") { setTimeout(wrapLoad, 200); return; }
    if (window.load._aiaDeskAis) return;
    var prev = window.load;
    window.load = async function () {
      try { await refresh(); } catch (e) {}
      return prev.apply(this, arguments);
    };
    window.load._aiaDeskAis = true;
  }
  function primary() {
    return ROWS[0] || null;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
  wrapLoad();
  window.AIADeskAis = { load: load, paint: paint, rows: ROWS, primary: primary };
})();
