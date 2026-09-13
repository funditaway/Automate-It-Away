/* Queue UX: calm desk surface, clear states, Cap drag, progressive chrome. */
(function () {
  var KEY = "aia_queue_tools";

  function ensureCss() {
    if (document.getElementById("queue-ux-css")) return;
    var css = document.createElement("style");
    css.id = "queue-ux-css";
    css.textContent =
      "body.queue-desk{background:radial-gradient(120% 80% at 50% -10%,color-mix(in srgb,var(--teal) 18%,var(--bg)),var(--bg) 52%)}" +
      "html.dark body.queue-desk{background:radial-gradient(120% 80% at 50% -10%,color-mix(in srgb,var(--teal) 22%,var(--bg)),var(--bg) 55%)}" +
      ".queue-desk .wrap{width:min(720px,94vw);padding-top:12px}" +
      "#queue-desk-rail{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:0 0 10px}" +
      "#queue-desk-rail .q-metrics{display:flex;gap:8px;flex-wrap:wrap}" +
      ".q-metric{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:4px 10px;border-radius:999px;background:color-mix(in srgb,var(--card) 88%,transparent);border:1px solid var(--line);font:700 12px/1 system-ui,sans-serif;color:var(--heading)}" +
      ".q-metric b{font-size:15px;color:var(--teal)}" +
      ".q-metric .dot{width:8px;height:8px;border-radius:50%;background:var(--teal)}" +
      ".q-metric.is-wait .dot{background:var(--orange)}" +
      ".q-metric.is-flag .dot{background:var(--aia-alert,#c0392b)}" +
      "#desk-tools{margin:0 0 12px;border:1px solid var(--line);border-radius:14px;background:color-mix(in srgb,var(--card) 92%,transparent);overflow:hidden}" +
      "#desk-tools>summary{list-style:none;cursor:pointer;padding:12px 14px;font:700 13px/1.2 system-ui,sans-serif;color:var(--heading);display:flex;align-items:center;justify-content:space-between;gap:8px}" +
      "#desk-tools>summary::-webkit-details-marker{display:none}" +
      "#desk-tools>summary::after{content:\"+\";font-size:18px;line-height:1;color:var(--muted)}" +
      "#desk-tools[open]>summary::after{content:\"–\"}" +
      "#desk-tools .tools-body{padding:0 14px 14px;display:grid;gap:10px}" +
      "#desk-tools .item,#desk-tools #aia-wallet,#desk-tools #desk-ais{margin:0;box-shadow:none}" +
      "#pack-filters{background:transparent;border:0;padding:0;margin:0 0 12px;box-shadow:none}" +
      "#pack-filters .now{font-size:12px;margin:0 0 6px}" +
      "#pack-filters > .meta{display:none}" +
      "#pack-chips{gap:6px}" +
      "#pack-chips button{border-radius:10px;min-height:36px;padding:6px 10px}" +
      "#how-in{display:none}" +
      "#queue-taps,#step-words,#widget-count,#rules-line{font-size:12px}" +
      "#queue.q-desk{display:flex;flex-direction:column;gap:0;min-height:120px}" +
      "#queue .q-card,#cap-list .q-card{position:relative;border:1px solid var(--line);border-radius:16px;padding:14px 14px 14px 18px;margin:0 0 12px;background:var(--card);box-shadow:0 10px 28px color-mix(in srgb,var(--teal-deep) 8%,transparent);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease,opacity .18s ease}" +
      "#queue .q-card::before,#cap-list .q-card::before{content:\"\";position:absolute;left:0;top:10px;bottom:10px;width:4px;border-radius:4px;background:var(--line)}" +
      "#queue .q-state-pending::before{background:var(--teal)}" +
      "#queue .q-state-running::before,.q-pending.q-card::before{background:color-mix(in srgb,var(--teal) 55%,white)}" +
      "#queue .q-state-flagged::before,#cap-list .q-state-flagged::before{background:var(--aia-alert,#c0392b)}" +
      "#queue .q-state-cap::before,#cap-list .q-card::before,#queue .cap-card::before{background:var(--orange)}" +
      "#queue .q-state-done::before{background:color-mix(in srgb,var(--teal) 40%,var(--muted))}" +
      "#queue .q-card:hover{transform:translateY(-1px);box-shadow:0 14px 32px color-mix(in srgb,var(--teal-deep) 12%,transparent)}" +
      "#queue .q-card.q-dragging{opacity:.55;transform:scale(.98)}" +
      "#queue .q-card.q-drop-over{border-color:var(--orange);box-shadow:0 0 0 2px color-mix(in srgb,var(--orange) 35%,transparent)}" +
      ".q-drag{position:absolute;right:8px;top:10px;width:28px;height:36px;display:flex;align-items:center;justify-content:center;color:var(--muted);cursor:grab;user-select:none;font-size:14px;letter-spacing:-2px;opacity:.55}" +
      ".q-drag:active{cursor:grabbing}" +
      ".q-face{padding-right:28px}" +
      ".q-state-mark{display:inline-flex;align-items:center;gap:6px;min-height:24px;font:800 10px/1 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 6px}" +
      ".q-state-mark .pip{width:7px;height:7px;border-radius:50%;background:currentColor}" +
      ".q-state-pending .q-state-mark{color:var(--teal)}" +
      ".q-state-running .q-state-mark{color:var(--heading)}" +
      ".q-state-flagged .q-state-mark{color:var(--aia-alert,#c0392b)}" +
      ".q-state-cap .q-state-mark,.cap-card .q-state-mark{color:var(--orange)}" +
      ".q-drawer{margin:10px 0 0;border-top:1px solid var(--line);padding-top:8px}" +
      ".q-drawer>summary{list-style:none;cursor:pointer;font:700 12px/1.2 system-ui,sans-serif;color:var(--heading);padding:6px 0;display:flex;align-items:center;justify-content:space-between}" +
      ".q-drawer>summary::-webkit-details-marker{display:none}" +
      ".q-drawer>summary::after{content:\"Show\";font-size:11px;color:var(--muted);font-weight:700}" +
      ".q-drawer[open]>summary::after{content:\"Hide\"}" +
      ".q-drawer-body{padding:4px 0 2px}" +
      "#cap-drop{margin:0 0 12px;padding:14px;border:1.5px dashed color-mix(in srgb,var(--orange) 55%,var(--line));border-radius:14px;background:color-mix(in srgb,var(--orange) 8%,var(--card));text-align:center;color:var(--banner-ink);font:700 13px/1.3 system-ui,sans-serif;opacity:0;max-height:0;overflow:hidden;transition:opacity .18s ease,max-height .18s ease,margin .18s ease,padding .18s ease}" +
      "#cap-drop.on{opacity:1;max-height:80px;margin-bottom:12px;padding:14px}" +
      "#cap-drop.hot{background:color-mix(in srgb,var(--orange) 18%,var(--card));border-color:var(--orange)}" +
      "#queue-empty{padding:28px 16px;text-align:center;border:1px dashed var(--line);border-radius:16px;background:color-mix(in srgb,var(--card) 80%,transparent)}" +
      "#queue-empty p{margin:0 0 12px;color:var(--muted)}" +
      "@media(max-width:640px){.queue-desk .kpis{display:none}#queue-desk-rail{margin-bottom:8px}}";
    document.head.appendChild(css);
  }

  function stateOf(j) {
    if (!j) return "pending";
    if (j.status === "shipped" || j.carried) return "done";
    if (j.priority || j.cap) return "cap";
    if (j.status === "exception" || j.waitingOn === "info" || j.waitingOn === "person") return "flagged";
    if (/Need .+ before/i.test(String(j.why || "")) || /Needs you/i.test(String(j.next || ""))) return "flagged";
    if (j.status === "out" || j.awaiting === "writeback") return "running";
    return "pending";
  }

  function markCard(el, j) {
    if (!el || !el.classList) return;
    ["q-state-pending", "q-state-running", "q-state-flagged", "q-state-cap", "q-state-done"].forEach(function (c) {
      el.classList.remove(c);
    });
    var state = stateOf(j);
    el.classList.add("q-state-" + state);
    if (!el.querySelector(".q-state-mark")) {
      var mark = document.createElement("div");
      mark.className = "q-state-mark";
      var labels = { pending: "Waiting", running: "Working", flagged: "Needs you", cap: "Cap", done: "Done" };
      mark.innerHTML = "<span class=\"pip\" aria-hidden=\"true\"></span><span>" + (labels[state] || "Waiting") + "</span>";
      var face = el.querySelector(".q-face") || el;
      face.insertBefore(mark, face.firstChild);
    } else {
      var labels2 = { pending: "Waiting", running: "Working", flagged: "Needs you", cap: "Cap", done: "Done" };
      var span = el.querySelector(".q-state-mark span:last-child");
      if (span) span.textContent = labels2[state] || "Waiting";
    }
    if (!el.querySelector(".q-drag")) {
      var drag = document.createElement("div");
      drag.className = "q-drag";
      drag.title = "Drag to Cap";
      drag.setAttribute("aria-hidden", "true");
      drag.textContent = "⋮⋮";
      el.appendChild(drag);
    }
    el.setAttribute("draggable", "true");
  }

  function paintStates() {
    var box = document.getElementById("queue");
    if (!box) return;
    box.classList.add("q-desk");
    var jobs = window.JOBS || [];
    box.querySelectorAll(".q-card[data-job]").forEach(function (el) {
      var id = el.getAttribute("data-job");
      var j = jobs.filter(function (x) { return x && String(x.id) === String(id); })[0] || { id: id, status: "waiting" };
      markCard(el, j);
    });
    var cap = document.getElementById("cap-list");
    if (cap) {
      cap.querySelectorAll(".q-card[data-job]").forEach(function (el) {
        el.classList.add("q-state-cap");
        markCard(el, { id: el.getAttribute("data-job"), priority: true, status: "held" });
      });
    }
  }

  function paintMetrics() {
    var rail = document.getElementById("queue-desk-rail");
    if (!rail) return;
    var jobs = window.JOBS || [];
    var open = jobs.filter(function (j) {
      return j && j.status !== "shipped" && j.status !== "killed";
    });
    var wait = open.filter(function (j) { return stateOf(j) === "pending" || stateOf(j) === "running"; }).length;
    var flag = open.filter(function (j) { return stateOf(j) === "flagged"; }).length;
    var cap = open.filter(function (j) { return stateOf(j) === "cap"; }).length;
    var done = jobs.filter(function (j) { return j && j.status === "shipped"; }).length;
    var metrics = rail.querySelector(".q-metrics");
    if (!metrics) return;
    metrics.innerHTML =
      "<span class=\"q-metric is-wait\" title=\"Open work\"><span class=\"dot\" aria-hidden=\"true\"></span>Open <b>" + open.length + "</b></span>" +
      "<span class=\"q-metric\" title=\"Waiting\"><span class=\"dot\" aria-hidden=\"true\"></span>Wait <b>" + wait + "</b></span>" +
      (flag ? "<span class=\"q-metric is-flag\" title=\"Needs you\"><span class=\"dot\" aria-hidden=\"true\"></span>Flag <b>" + flag + "</b></span>" : "") +
      (cap ? "<span class=\"q-metric\" title=\"On the Cap\"><span class=\"dot\" aria-hidden=\"true\"></span>Cap <b>" + cap + "</b></span>" : "") +
      "<span class=\"q-metric\" title=\"Sent\"><span class=\"dot\" aria-hidden=\"true\"></span>Sent <b>" + done + "</b></span>";
  }

  function foldChrome() {
    if (document.getElementById("desk-tools")) return;
    var main = document.querySelector("main.wrap");
    if (!main) return;
    var tools = document.createElement("details");
    tools.id = "desk-tools";
    tools.innerHTML = "<summary>Desk tools<span class=\"meta\" style=\"font-weight:600\">Wallet · Desk AIs · widgets</span></summary><div class=\"tools-body\"></div>";
    try {
      if (localStorage.getItem(KEY) === "open") tools.open = true;
    } catch (e) {}
    tools.addEventListener("toggle", function () {
      try { localStorage.setItem(KEY, tools.open ? "open" : "shut"); } catch (e) {}
    });
    var body = tools.querySelector(".tools-body");
    var move = ["desk-ais", "aia-wallet", "widget-count", "rule-widgets", "step-words"];
    var anchor = document.getElementById("queue-filters") || document.getElementById("queue");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(tools, anchor);
    else main.appendChild(tools);
    move.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.parentNode !== body) {
        if (id === "rule-widgets" || id === "widget-count") {
          var wrap = document.createElement("div");
          wrap.appendChild(el);
          body.appendChild(wrap);
        } else body.appendChild(el);
      }
    });
    var play = document.querySelector("[data-aia-playbook]");
    if (play && play.parentNode !== body) body.appendChild(play);
    var how = document.getElementById("how-in");
    if (how && how.parentNode !== body) body.appendChild(how);
  }

  function ensureRail() {
    if (document.getElementById("queue-desk-rail")) return;
    var banner = document.getElementById("banner");
    var rail = document.createElement("div");
    rail.id = "queue-desk-rail";
    rail.innerHTML = "<div class=\"q-metrics\"></div><div class=\"row\" id=\"queue-desk-actions\"></div>";
    if (banner && banner.parentNode) banner.parentNode.insertBefore(rail, banner.nextSibling);
    var actions = rail.querySelector("#queue-desk-actions");
    var drop = document.getElementById("drop-go");
    var refresh = document.querySelector("main .row button[onclick*=\"load\"]");
    if (actions) {
      if (drop && drop.parentNode) actions.appendChild(drop);
      if (refresh && refresh.parentNode) actions.appendChild(refresh);
    }
  }

  function ensureCapDrop() {
    if (document.getElementById("cap-drop")) return;
    var queue = document.getElementById("queue");
    if (!queue || !queue.parentNode) return;
    var zone = document.createElement("div");
    zone.id = "cap-drop";
    zone.textContent = "Drop on Cap · do this first";
    zone.setAttribute("aria-hidden", "true");
    queue.parentNode.insertBefore(zone, queue);
  }

  function wireDrag() {
    if (document.documentElement.__aiaQueueDrag) return;
    document.documentElement.__aiaQueueDrag = true;
    var dragId = "";
    document.addEventListener("dragstart", function (e) {
      var card = e.target && e.target.closest && e.target.closest("#queue .q-card[data-job]");
      if (!card) return;
      dragId = card.getAttribute("data-job") || "";
      card.classList.add("q-dragging");
      if (e.dataTransfer) {
        e.dataTransfer.setData("text/plain", dragId);
        e.dataTransfer.effectAllowed = "move";
      }
      var zone = document.getElementById("cap-drop");
      if (zone) zone.classList.add("on");
    });
    document.addEventListener("dragend", function () {
      document.querySelectorAll(".q-dragging,.q-drop-over").forEach(function (el) {
        el.classList.remove("q-dragging", "q-drop-over");
      });
      var zone = document.getElementById("cap-drop");
      if (zone) zone.classList.remove("on", "hot");
      dragId = "";
    });
    document.addEventListener("dragover", function (e) {
      var zone = e.target && e.target.closest && e.target.closest("#cap-drop");
      var card = e.target && e.target.closest && e.target.closest("#queue .q-card[data-job]");
      if (zone || card) {
        e.preventDefault();
        if (zone) zone.classList.add("hot");
        if (card && card.getAttribute("data-job") !== dragId) card.classList.add("q-drop-over");
      }
    });
    document.addEventListener("dragleave", function (e) {
      var zone = e.target && e.target.closest && e.target.closest("#cap-drop");
      if (zone) zone.classList.remove("hot");
      var card = e.target && e.target.closest && e.target.closest("#queue .q-card");
      if (card) card.classList.remove("q-drop-over");
    });
    document.addEventListener("drop", function (e) {
      var zone = e.target && e.target.closest && e.target.closest("#cap-drop");
      var card = e.target && e.target.closest && e.target.closest("#queue .q-card[data-job]");
      var id = dragId || (e.dataTransfer && e.dataTransfer.getData("text/plain")) || "";
      if (!id) return;
      e.preventDefault();
      if (zone) {
        if (typeof window.pinCap === "function") window.pinCap(id, true);
        return;
      }
      if (card && card.getAttribute("data-job") !== id) {
        var target = card.getAttribute("data-job");
        var jobs = window.JOBS || [];
        var dest = jobs.filter(function (j) { return j && String(j.id) === String(target); })[0];
        if (dest && (dest.priority || dest.cap) && typeof window.pinCap === "function") {
          window.pinCap(id, true);
        } else if (typeof window.pinCap === "function") {
          window.pinCap(id, true);
        }
      }
    });
  }

  function wrapCard() {
    return typeof window.card === "function";
  }

  function hookLoad() {
    if (typeof window.load !== "function" || window.load.__aiaUx) return;
    var orig = window.load;
    window.load = async function () {
      var out = await orig.apply(this, arguments);
      try {
        paintMetrics();
        paintStates();
      } catch (e) {}
      return out;
    };
    window.load.__aiaUx = true;
  }

  function boot() {
    document.body.classList.add("queue-desk");
    ensureCss();
    ensureRail();
    foldChrome();
    ensureCapDrop();
    wireDrag();
    wrapCard();
    hookLoad();
    paintMetrics();
    paintStates();
  }

  function retryWrap() {
    if (!wrapCard()) setTimeout(retryWrap, 120);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 60);
  setTimeout(retryWrap, 180);
  setTimeout(hookLoad, 220);
  setTimeout(paintStates, 400);
})();
