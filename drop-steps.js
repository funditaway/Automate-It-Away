(function () {
  var KEY = "aia_drop_step";
  var VOW = "Draft only. You still tap Yes or Stop. Nobody sends money from here.";
  var STEPS = [
    {
      id: "desk", label: "Desk",
      hint: "Pick the desk first. Every drop rides to that queue.",
      ids: ["desk-pick", "public-desk-search"],
      also: ["drop-sub"],
      off: ["drop-on"]
    },
    {
      id: "tell", label: "Tell",
      hint: "Say it or type it. A Desk AI drafts the card.",
      ids: ["talkBar", "drop-chat-wrap", "drop-thread-card"]
    },
    {
      id: "card", label: "Card",
      hint: "Fill the card. Drop it when you say so.",
      ids: ["modes", "drop-form-card"]
    },
    {
      id: "check", label: "Check",
      hint: "Read the card back before it lands.",
      ids: ["verify-strip", "drop-preview"]
    },
    {
      id: "share", label: "Share",
      hint: "Share the drop link. Public drop never sees money, Stop, or People.",
      ids: ["embed-card", "drop-log-card"]
    }
  ];
  var active = "";
  var busy = false;

  function el(id) { return document.getElementById(id); }
  function host() { return document.querySelector("main.wrap"); }
  function onDrop() { return !!el("drop-title") && !!el("drop-send"); }
  function embedOn() {
    if (document.body.classList.contains("embed") || window !== window.parent) return true;
    return /embed=1/.test(location.search);
  }
  function stepOf(id) {
    for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === id) return STEPS[i];
    return null;
  }
  function nodesOf(step) {
    return step.ids.concat(step.also || []).map(el).filter(Boolean);
  }
  function dupes() {
    var ids = [];
    STEPS.forEach(function (step) {
      (step.off || []).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
    });
    return ids;
  }
  function live(step) {
    return step.ids.some(function (id) {
      var node = el(id);
      return !!node && !node.hasAttribute("hidden");
    });
  }
  function open() { return STEPS.filter(live); }
  function remember(id) { try { sessionStorage.setItem(KEY, id); } catch (e) {} }
  function recall() { try { return sessionStorage.getItem(KEY) || ""; } catch (e) { return ""; } }
  function setText(node, text) { if (node && node.textContent !== text) node.textContent = text; }
  function setHtml(node, html) { if (node && node.innerHTML !== html) node.innerHTML = html; }

  function css() {
    if (el("drop-steps-css")) return;
    var tag = document.createElement("style");
    tag.id = "drop-steps-css";
    tag.textContent =
      ".step-off{display:none!important}" +
      "body.drop-steps .grid{grid-template-columns:1fr}" +
      "#drop-steps{position:sticky;top:0;z-index:20;background:var(--bg);padding:8px 0 6px;margin:0 0 10px}" +
      "#drop-step-tabs{display:flex;gap:5px;overflow-x:auto;-webkit-overflow-scrolling:touch}" +
      "#drop-step-tabs button{flex:1 1 auto;min-height:44px;min-width:0;padding:0 8px;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--ink);font:700 12px system-ui,sans-serif;cursor:pointer;white-space:nowrap}" +
      "#drop-step-tabs button.done{background:var(--edit);color:var(--edit-ink);border-color:var(--teal)}" +
      "#drop-step-tabs button.on{background:var(--orange);color:#0c1116;border-color:var(--orange)}" +
      "#drop-step-hint{margin:6px 0 0;font-size:12px}" +
      "#drop-step-vow{margin:1px 0 0;font-size:12px}" +
      "body.drop-steps #drop-sub{margin:4px 0 10px}" +
      "body.drop-steps #public-desk-hits{max-height:184px;overflow:auto}" +
      "#drop-step-foot{position:sticky;bottom:calc(76px + env(safe-area-inset-bottom,0px));z-index:19;display:flex;gap:8px;margin:10px 0 0;padding:6px 0;background:var(--bg)}" +
      "#drop-step-foot button{flex:1;min-height:48px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:700 15px system-ui,sans-serif;cursor:pointer}" +
      "#drop-step-next{background:var(--orange);color:#0c1116;border-color:var(--orange)}";
    document.head.appendChild(tag);
  }

  function build() {
    var main = host();
    if (!main) return;
    if (!el("drop-steps")) {
      var rail = document.createElement("div");
      rail.id = "drop-steps";
      rail.innerHTML =
        "<div id=\"drop-step-tabs\" role=\"tablist\" aria-label=\"Drop steps\"></div>" +
        "<p class=\"sub\" id=\"drop-step-hint\"></p>" +
        "<p class=\"sub\" id=\"drop-step-vow\">" + VOW + "</p>";
      main.insertBefore(rail, main.firstChild);
      el("drop-step-tabs").addEventListener("click", function (e) {
        var btn = e.target.closest("[data-step]");
        if (btn) go(btn.getAttribute("data-step"));
      });
    }
    if (!el("drop-step-foot")) {
      var foot = document.createElement("div");
      foot.id = "drop-step-foot";
      foot.innerHTML =
        "<button type=\"button\" id=\"drop-step-back\">Back</button>" +
        "<button type=\"button\" id=\"drop-step-next\">Next</button>";
      main.appendChild(foot);
      el("drop-step-back").addEventListener("click", function () { hop(-1); });
      el("drop-step-next").addEventListener("click", function () { hop(1); });
    }
  }

  function order() {
    var main = host();
    if (!main) return;
    var prev = null;
    ["drop-steps", "drop-title", "drop-on", "drop-sub"].forEach(function (id) {
      var node = el(id);
      if (!node || node.parentNode !== main) return;
      var seat = prev ? prev.nextSibling : main.firstChild;
      if (node !== seat) main.insertBefore(node, seat);
      prev = node;
    });
    var foot = el("drop-step-foot");
    if (foot && main.lastChild !== foot) main.appendChild(foot);
  }

  function paint() {
    var rows = open();
    if (!rows.length) return;
    if (rows.indexOf(stepOf(active)) < 0) active = rows[0].id;
    STEPS.forEach(function (step) {
      var on = step.id === active;
      nodesOf(step).forEach(function (node) { node.classList.toggle("step-off", !on); });
    });
    var at = rows.indexOf(stepOf(active));
    var hush = rows[at].off || [];
    dupes().forEach(function (id) {
      var node = el(id);
      if (node) node.classList.toggle("step-off", hush.indexOf(id) >= 0);
    });
    setHtml(el("drop-step-tabs"), rows.map(function (step, i) {
      var cls = step.id === active ? "on" : i < at ? "done" : "";
      return "<button type=\"button\" role=\"tab\" aria-selected=\"" + (step.id === active) +
        "\" class=\"" + cls + "\" data-step=\"" + step.id + "\">" + (i + 1) + " " + step.label + "</button>";
    }).join(""));
    setText(el("drop-step-hint"), "Step " + (at + 1) + " of " + rows.length + " · " + rows[at].hint);
    var back = el("drop-step-back");
    var next = el("drop-step-next");
    if (back) {
      back.hidden = at <= 0;
      setText(back, at > 0 ? "Back · " + rows[at - 1].label : "Back");
    }
    if (next) {
      next.hidden = at >= rows.length - 1;
      setText(next, at < rows.length - 1 ? "Next · " + rows[at + 1].label : "Next");
    }
  }

  function sync() {
    if (busy) return;
    busy = true;
    try { build(); order(); paint(); } finally { busy = false; }
  }

  function go(id, quiet) {
    if (!stepOf(id)) return;
    active = id;
    remember(id);
    sync();
    if (quiet) return;
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { window.scrollTo(0, 0); }
  }

  function hop(dir) {
    var rows = open();
    var to = rows[rows.indexOf(stepOf(active)) + dir];
    if (to) go(to.id);
  }

  function reveal(node) {
    if (!node) return;
    for (var i = 0; i < STEPS.length; i++) {
      var hit = nodesOf(STEPS[i]).some(function (seat) { return seat === node || seat.contains(node); });
      if (!hit) continue;
      if (STEPS[i].id !== active) go(STEPS[i].id, true);
      return;
    }
  }

  function watch() {
    var main = host();
    if (!main || !window.MutationObserver) return;
    var timer = null;
    new MutationObserver(function (recs) {
      var rail = el("drop-steps");
      var foot = el("drop-step-foot");
      var mine = recs.every(function (rec) {
        var t = rec.target;
        return (rail && (t === rail || rail.contains(t))) || (foot && (t === foot || foot.contains(t)));
      });
      if (mine) return;
      clearTimeout(timer);
      timer = setTimeout(sync, 60);
    }).observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  }

  function boot() {
    if (!onDrop() || embedOn()) return;
    css();
    document.body.classList.add("drop-steps");
    active = recall();
    if (!stepOf(active)) active = STEPS[0].id;
    sync();
    watch();
    var ticks = 0;
    var tick = setInterval(function () { sync(); if (++ticks > 20) clearInterval(tick); }, 250);
    window.AIADropSteps = {
      go: go,
      reveal: reveal,
      refresh: sync,
      current: function () { return active; },
      list: function () { return STEPS.map(function (s) { return s.id; }); }
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
