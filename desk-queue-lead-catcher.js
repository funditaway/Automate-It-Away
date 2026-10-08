/* Lead Catcher cards on the main Queue. Read-only: Open goes to the Lead Catcher card.
   Yes, Stop and Kill stay on the card and go through Lead Catcher's own Yes check. Nothing is sent or charged here.
   Cards come only from this desk, and only when Lead Catcher is on for it. */
(function () {
  var BOX_ID = "lc-queue";
  var busy = false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
    });
  }
  function headers() {
    var h = {};
    var ws = "", tok = "", pin = "";
    try {
      ws = localStorage.getItem("aia_ws") || "";
      tok = localStorage.getItem("aia_session") || "";
      pin = localStorage.getItem("aia_pin") || "";
    } catch (e) {}
    var pinEl = document.getElementById("pin");
    if (pinEl && pinEl.value) pin = pinEl.value;
    if (ws) h["X-Workspace"] = ws;
    if (tok) h["X-Session"] = tok;
    if (pin) h["X-Pin"] = pin;
    return h;
  }
  function when(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  function ensureCss() {
    if (document.getElementById("lc-queue-css")) return;
    var css = document.createElement("style");
    css.id = "lc-queue-css";
    css.textContent =
      "#lc-queue{margin:0 0 10px}" +
      "#lc-queue .lc-q-head{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline;margin:0 0 6px}" +
      "#lc-queue .lc-q-head strong{color:var(--heading,#075756)}" +
      "#lc-queue .lc-tag{display:inline-block;margin:0 4px 0 0;padding:2px 8px;border-radius:999px;font:700 11px system-ui,sans-serif;background:var(--edit,#e6f2f1);color:var(--edit-ink,#075756)}" +
      "#lc-queue .lc-tag.lc-late{background:#fde8e6;color:#8a1c12}" +
      "#lc-queue .lc-tag.lc-urgent{background:#fff1dc;color:#7a4300}" +
      "#lc-queue .lc-tag.lc-label{background:#0D1216;color:#fff}" +
      "#lc-queue .lc-noowner{font-weight:700}";
    document.head.appendChild(css);
  }
  function box() {
    var el = document.getElementById(BOX_ID);
    if (el) return el;
    var queue = document.getElementById("queue");
    if (!queue || !queue.parentNode) return null;
    el = document.createElement("section");
    el.id = BOX_ID;
    el.setAttribute("aria-label", "Lead Catcher cards");
    el.hidden = true;
    queue.parentNode.insertBefore(el, queue);
    return el;
  }
  function item(i) {
    var tags = "<span class=\"lc-tag lc-label\">" + esc(i.label) + "</span>" +
      (i.mock ? "<span class=\"lc-tag\">MOCK channel</span>" : "") +
      (i.urgency === "emergency" || i.urgency === "high" ? "<span class=\"lc-tag lc-urgent\">" + esc(i.urgency_words) + "</span>" : "") +
      (i.late ? "<span class=\"lc-tag lc-late\">Late</span>" : "") +
      (i.customer_replied ? "<span class=\"lc-tag lc-urgent\">Customer replied</span>" : "") +
      (i.needs_attention ? "<span class=\"lc-tag lc-late\">Needs attention</span>" : "");
    var due = i.due ? esc(i.due_words) + " " + esc(when(i.due)) + (i.late ? " — late" : "") : "No due time yet";
    var owner = i.owner === "No owner" ? "<span class=\"lc-noowner\">No owner</span>" : "Owner: " + esc(i.owner);
    return "<article class=\"item lc-q-item\" data-lc-card=\"" + esc(i.id) + "\">" +
      "<div class=\"meta\">" + esc(i.status_words) + " · " + esc(i.urgency_words) + " · " + esc(i.kind) + "</div>" +
      "<h3>" + esc(i.name) + " <span class=\"pack-badge\">Lead Catcher</span></h3>" +
      "<p>" + tags + "</p>" +
      "<p class=\"meta\">" + owner + " · " + due + "</p>" +
      (i.waiting_reason ? "<p class=\"meta\">Waiting: " + esc(i.waiting_reason) + "</p>" : "") +
      (i.reply ? "<p class=\"meta\">" + esc(i.reply) + "</p>" : "") +
      "<p class=\"meta\">Came in by " + esc(i.source_words) + (i.mock ? " (MOCK — test only)" : "") + "</p>" +
      "<div class=\"row\"><a class=\"edit\" href=\"" + esc(i.href) + "\">Open</a></div>" +
      "</article>";
  }
  // When Lead Catcher rows show, AIA's own empty line ("Nothing here yet") would read wrong. Reword it, nothing else.
  var EMPTY_LC = "No other cards on this desk yet. Drop or Create one. You still tap Yes or Stop.";
  function tidyEmpty() {
    var el = document.getElementById(BOX_ID);
    var p = document.querySelector("#queue #queue-empty p");
    if (!p) return;
    if (el && !el.hidden) { if (p.textContent !== EMPTY_LC) { p.setAttribute("data-aia-text", p.textContent); p.textContent = EMPTY_LC; } }
    else if (p.getAttribute("data-aia-text")) { p.textContent = p.getAttribute("data-aia-text"); p.removeAttribute("data-aia-text"); }
  }
  function paint(data) {
    var el = box();
    if (!el) return;
    if (!data || !data.on || !data.items || !data.items.length) { el.hidden = true; el.innerHTML = ""; tidyEmpty(); return; }
    ensureCss();
    var c = data.counts || {};
    el.innerHTML = "<p class=\"meta lc-q-head\"><strong>Lead Catcher</strong> · " + esc(c.open) + " open" +
      (c.no_owner ? " · " + esc(c.no_owner) + " no owner" : "") + (c.late ? " · " + esc(c.late) + " late" : "") +
      " · <a href=\"/lead-catcher\">Open Lead Catcher</a></p>" +
      "<p class=\"meta\">" + esc(data.note || "") + "</p>" +
      data.items.map(item).join("");
    el.hidden = false;
    tidyEmpty();
  }
  function load() {
    if (busy) return;
    var h = headers();
    if (!h["X-Workspace"]) { paint(null); return; }
    busy = true;
    fetch("/api/lead-catcher?action=queue", { headers: h })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(paint)
      .catch(function () { paint(null); })
      .then(function () { busy = false; });
  }
  function boot() {
    load();
    var queue = document.getElementById("queue");
    if (queue && window.MutationObserver) new MutationObserver(tidyEmpty).observe(queue, { childList: true });
    var refresh = document.getElementById("refresh");
    if (refresh) refresh.addEventListener("click", function () { setTimeout(load, 300); });
    window.addEventListener("focus", load);
    window.addEventListener("storage", function (e) { if (!e || e.key === "aia_ws" || e.key === "aia_pin") load(); });
  }
  window.AIALeadCatcherQueue = { load: load };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
