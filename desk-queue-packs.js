/* Pack bar on Queue. Accepts work, wanted, creator, AIA, color, ask. Packs never Send/Stop/pay. Insurance face never Vita. */
(function () {
  var KEY = "aia_queue_pack";
  var FILTER = "all";
  var CATALOG = [];
  var OFFICIAL = ["home", "consign", "quote", "vita", "insurance", "fund", "land", "aia", "aia-adoption", "aia-implement"];
  var WANTED = ["lawn", "repair", "shop-bay", "estate-day", "cleanout", "rental", "rent-due", "title-run", "survey", "year2", "wholesale", "missed-call", "delivery"];
  var COLOR = ["color-teal", "color-harvest", "color-night", "color-slate"];
  var TYPES = ["all", "work", "wanted", "creator", "aia", "color", "ask"];

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
    });
  }
  function packOf(j) {
    if (!j) return "";
    var custom = j.custom || {};
    var raw = j.pack || custom.pack || (custom.packs && custom.packs[0]) || "";
    return String(raw || "").toLowerCase();
  }
  function canon(id) {
    var s = String(id || "").toLowerCase();
    if (s === "quote" || s === "insurance" || s === "vita" || s === "year2" || s === "missed-call") return "insurance";
    if (s === "family") return "home";
    if (s === "resale" || s === "consignment") return "consign";
    if (s === "aia-adoption" || s === "adoption") return "aia-adoption";
    if (s === "aia-implement" || s === "implement" || s === "playbook") return "aia-implement";
    return s;
  }
  function badgeName(id, j) {
    var c = canon(id);
    if (c === "insurance") return "Insurance";
    if (c === "home") return "Home";
    if (c === "consign") return "Consign";
    if (c === "fund") return "Fund";
    if (c === "land") return "Land";
    if (c === "aia-adoption") return "Try it on this desk";
    if (c === "aia-implement") return "Four steps on this desk";
    if (c === "aia") return "AIA";
    var custom = (j && j.custom) || {};
    var hit = CATALOG.filter(function (p) { return p && (p.id === id || canon(p.id) === c); })[0];
    var name = (custom.packName || custom.face && custom.face.name || (hit && (hit.face || hit.name)) || id || "").trim();
    if (/vita/i.test(name) && c === "insurance") return "Insurance";
    return name || "Pack";
  }
  function typeOf(id) {
    var s = String(id || "").toLowerCase();
    if (!s) return "none";
    if (COLOR.indexOf(s) >= 0 || s.indexOf("color-") === 0) return "cosmetic";
    if (s === "ask") return "ask";
    if (WANTED.indexOf(s) >= 0) return "wanted";
    var hit = CATALOG.filter(function (p) { return p && p.id === s; })[0];
    if (hit) {
      if (hit.type === "cosmetic" || hit.type === "ask" || hit.type === "wanted") return hit.type;
      if (hit.wanted) return "wanted";
      if (hit.official) return "official";
      return "creator";
    }
    if (OFFICIAL.indexOf(s) >= 0) return "official";
    return "creator";
  }
  function openJobs() {
    return (window.JOBS || []).filter(function (j) {
      return j && j.status !== "shipped" && j.status !== "killed";
    });
  }
  function matches(j) {
    var id = packOf(j);
    var t = typeOf(id);
    var c = canon(id);
    if (FILTER === "all" || FILTER === "color") return true;
    if (FILTER === "ask") return false;
    if (FILTER === "work") return t === "official" || t === "creator" || t === "none" || t === "work";
    if (FILTER === "wanted") return t === "wanted";
    if (FILTER === "creator") return t === "creator";
    if (FILTER === "aia") return t === "official";
    return c === canon(FILTER) || id === FILTER;
  }
  function emptyCopy() {
    if (FILTER === "ask") return "Ask is a tag. No card. No checkout.";
    if (FILTER === "color") return "Color is a try-on for this phone. It does not hide work. Pick teal, harvest, night, or slate on Account.";
    if (FILTER === "wanted") return "No cards for that wanted pack yet. Drop one anyway. Use still says Make this pack.";
    if (FILTER === "creator") return "No creator-pack cards on this queue. Test a pack from the lab, or find one on Market.";
    if (FILTER === "aia") return "No official AIA pack cards here. Official packs are free. They copy rules. They do not send money.";
    if (FILTER === "work") return "No work-pack cards here. Drop with Home, Consign, Insurance, Fund, or Land — or a creator pack.";
    if (canon(FILTER) === "insurance") return "Drop a name, a state, and what they need. Bind stays off.";
    if (FILTER === "home") return "Drop a chore, school form, or same-day pickup. Cap same-day.";
    if (FILTER === "consign") return "Drop a photo of the item. Draft the title. Payout waits on you.";
    if (FILTER === "fund") return "Drop the campaign note. Credit waits on you.";
    if (FILTER === "land") return "Drop the lot note. Cap flood. Cap title.";
    if (FILTER === "aia-adoption") return "Try first. Drop a task, an errand, or an idea. AIA drafts. You tap Yes or Stop.";
    if (FILTER === "aia-implement") return "Four steps. Drop a leak, a pipe note, a desk AI idea, or a guard. You still tap.";
    if (WANTED.indexOf(FILTER) >= 0) return "Make this pack on Create, then drop it. Use still says Make this pack.";
    if (FILTER === "all") return "Nothing on this queue yet. Drop anything. Find a pack. Add a rule if you need one.";
    return "Drop work for this pack. You still tap Yes or Stop.";
  }
  function emptyHtml() {
    var pack = FILTER === "all" || TYPES.indexOf(FILTER) >= 0 ? "" : FILTER;
    var drop = pack ? "/drop?pack=" + encodeURIComponent(pack) : "/drop";
    var make = WANTED.indexOf(FILTER) >= 0 ? "/create?kind=pack&idea=" + encodeURIComponent(FILTER) : "";
    return "<p class=\"meta\" id=\"pack-empty\">" + esc(emptyCopy()) + "</p>" +
      "<div class=\"row\">" +
      "<a class=\"go\" href=\"" + drop + "\">Drop" + (pack ? " with this pack" : " anything") + "</a>" +
      "<a class=\"edit\" href=\"/market\">Find a pack</a>" +
      (make ? "<a class=\"edit\" href=\"" + make + "\">Make this pack</a>" : "") +
      "<a class=\"edit\" href=\"/rules\">Add a rule</a></div>";
  }
  function ensureCss() {
    if (document.getElementById("queue-pack-css")) return;
    var css = document.createElement("style");
    css.id = "queue-pack-css";
    css.textContent =
      "#pack-filters{margin:0 0 10px}" +
      "#pack-filters .now{color:var(--heading);font-weight:700;margin:0 0 4px}" +
      "#pack-chips{display:flex;flex-wrap:wrap;gap:6px}" +
      "#pack-chips button{min-height:40px;padding:6px 10px;border-radius:999px;font-size:12px}" +
      "#pack-chips button.on{background:var(--edit);color:var(--edit-ink);border-color:var(--teal)}" +
      ".pack-badge{display:inline-block;margin:0 6px 0 0;padding:2px 8px;border-radius:999px;background:var(--edit);color:var(--edit-ink);font:700 11px system-ui,sans-serif}";
    document.head.appendChild(css);
  }
  function ensureDom() {
    if (document.getElementById("pack-filters")) return;
    var box = document.createElement("div");
    box.id = "pack-filters";
    box.className = "item";
    box.innerHTML = "<p class=\"now\">Packs on this queue</p>" +
      "<p class=\"meta\">Packs change how the card looks. You still tap Copy, Text, Email, Hand, Cap, or Stop. Nobody sends money from here.</p>" +
      "<div id=\"pack-chips\"></div>";
    var view = document.getElementById("desk-view");
    var queue = document.getElementById("queue");
    if (view && view.parentNode) view.parentNode.insertBefore(box, view.nextSibling);
    else if (queue && queue.parentNode) queue.parentNode.insertBefore(box, queue);
  }
  function counts() {
    var map = { all: 0, work: 0, wanted: 0, creator: 0, aia: 0 };
    var packs = {};
    openJobs().forEach(function (j) {
      var id = packOf(j);
      var t = typeOf(id);
      var c = canon(id);
      map.all += 1;
      if (t === "official" || t === "creator" || t === "none" || t === "work") map.work += 1;
      if (t === "wanted") map.wanted += 1;
      if (t === "creator") map.creator += 1;
      if (t === "official") map.aia += 1;
      if (c) packs[c] = (packs[c] || 0) + 1;
    });
    return { map: map, packs: packs };
  }
  function paintBar() {
    ensureCss();
    ensureDom();
    var chips = document.getElementById("pack-chips");
    if (!chips) return;
    var n = counts();
    var labels = { all: "All", work: "Work", wanted: "Wanted", creator: "Creator", aia: "AIA", color: "Color", ask: "Ask" };
    var html = TYPES.map(function (t) {
      var count = n.map[t] ? " · " + n.map[t] : "";
      if (t === "color" || t === "ask") count = "";
      return "<button type=\"button\" class=\"" + (FILTER === t ? "on" : "edit") + "\" data-pack-filter=\"" + t + "\">" +
        labels[t] + count + "</button>";
    }).join("");
    Object.keys(n.packs).forEach(function (id) {
      if (TYPES.indexOf(id) >= 0) return;
      html += "<button type=\"button\" class=\"" + (canon(FILTER) === id ? "on" : "edit") + "\" data-pack-filter=\"" + esc(id) + "\">" +
        esc(badgeName(id)) + " · " + n.packs[id] + "</button>";
    });
    chips.innerHTML = html;
  }
  function decorate(html, j) {
    var id = packOf(j);
    if (!html || !id) return html;
    var name = badgeName(id, j);
    if (!name || /vita/i.test(name) && canon(id) === "insurance") name = canon(id) === "insurance" ? "Insurance" : name;
    var badge = "<span class=\"pack-badge\">" + esc(name) + "</span>";
    if (html.indexOf("pack-badge") >= 0) return html;
    if (html.indexOf("</h3>") >= 0) return html.replace("</h3>", "</h3>" + badge);
    return html;
  }
  function paintQueue() {
    var box = document.getElementById("queue");
    if (!box) { paintBar(); return; }
    var staff = (window.role || localStorage.getItem("aia_role")) === "employee";
    var rows = openJobs().filter(matches);
    if (FILTER === "color") rows = openJobs();
    paintBar();
    if (!rows.length) {
      box.innerHTML = emptyHtml();
      return;
    }
    if (typeof window.card !== "function") return;
    box.innerHTML = rows.map(function (j) {
      return decorate(window.card(j, staff), j);
    }).join("");
  }
  function setFilter(id) {
    FILTER = String(id || "all").toLowerCase() || "all";
    try { localStorage.setItem(KEY, FILTER); } catch (e) {}
    paintQueue();
  }
  function hookLoad() {
    if (typeof window.load !== "function" || window.load.__aiaPacks) return;
    var orig = window.load;
    window.load = async function () {
      await orig.apply(this, arguments);
      paintQueue();
    };
    window.load.__aiaPacks = true;
  }
  function wrapCard() {
    if (typeof window.card !== "function" || window.card.__aiaPackBadge) return;
    var prev = window.card;
    window.card = function (j, staff) {
      return decorate(prev(j, staff), j);
    };
    window.card.__aiaPackBadge = true;
  }
  function loadCatalog() {
    var h = { "Content-Type": "application/json" };
    var ws = localStorage.getItem("aia_ws");
    var pin = localStorage.getItem("aia_pin");
    var tok = localStorage.getItem("aia_session");
    if (ws) h["X-Workspace"] = ws;
    if (tok) h["X-Session"] = tok;
    else if (pin) h["X-Pin"] = pin;
    return fetch("/api/desks?packs=1", { headers: h }).then(function (r) { return r.json(); }).then(function (d) {
      CATALOG = (d && d.packs) || [];
    }).catch(function () { CATALOG = []; });
  }
  function boot() {
    try { FILTER = localStorage.getItem(KEY) || "all"; } catch (e) { FILTER = "all"; }
    ensureCss();
    ensureDom();
    var chips = document.getElementById("pack-chips");
    if (chips && !chips.__wired) {
      chips.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-pack-filter]");
        if (btn) setFilter(btn.getAttribute("data-pack-filter"));
      });
      chips.__wired = true;
    }
    wrapCard();
    hookLoad();
    loadCatalog().then(function () { paintBar(); paintQueue(); });
    window.AIAQueuePacks = { filter: function () { return FILTER; }, setFilter: setFilter, paint: paintQueue, badgeName: badgeName, packOf: packOf, typeOf: typeOf };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 80);
  setTimeout(hookLoad, 200);
})();
