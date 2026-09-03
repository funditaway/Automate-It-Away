/* World Queue filters. Find a card. All · Needs you · Mine · Drop · Talk · Pipes · Cap. AND with pack chips. Never Vita. AIA does not send. */
(function () {
  var KEY = "aia_queue_filter";
  var FILTER = "all";
  var QUERY = "";
  var CHIPS = ["all", "need", "mine", "drop", "talk", "pipes", "cap"];
  var LABELS = { all: "All", need: "Needs you", mine: "Mine", drop: "Drop", talk: "Talk", pipes: "Pipes", cap: "Cap" };

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function customOf(j) {
    return (j && j.custom && typeof j.custom === "object") ? j.custom : {};
  }
  function blob(j) {
    var c = customOf(j);
    return [
      j.provider, j.source, j.from, j.pipe, j.channel, j.kind,
      c.from, c.source, c.via, c.origin, c.how, c.talk, c.droppedBy,
      j.droppedByKind, c.droppedByKind, j.promptVersion, j.whoTapped, j.sourceUrl, c.sourceUrl
    ].join(" ").toLowerCase();
  }
  function isOpen(j) {
    if (!j) return false;
    var st = String(j.status || "");
    return st !== "shipped" && st !== "killed";
  }
  function isTalk(j) {
    var c = customOf(j);
    if (c.talk === true || c.via === "talk" || c.via === "speech" || c.source === "talk") return true;
    return /\btalk\b|\bspeech\b|\bvoice\b/.test(blob(j));
  }
  function isPipe(j) {
    var p = String(j.provider || customOf(j).provider || j.pipe || customOf(j).pipe || "").toLowerCase();
    if (p && p !== "drop" && p !== "talk" && p !== "desk" && p !== "manual" && p !== "queue" && p !== "form") return true;
    return /\bhook\b|\bpipe\b|\binbound\b|\bwebhook\b/.test(blob(j));
  }
  function isDrop(j) {
    if (isTalk(j) || isPipe(j)) return false;
    var c = customOf(j);
    if (j.droppedByKind || c.droppedByKind) return true;
    return /\bdrop\b|\bwidget\b/.test(blob(j)) || /\/drop/.test(String(j.sourceUrl || c.sourceUrl || ""));
  }
  function youName() {
    return String(window.youName || localStorage.getItem("aia_name") || "").trim().toLowerCase();
  }
  function isMine(j) {
    var who = String(j.assignee || "").trim().toLowerCase();
    if (!who) return false;
    var me = youName();
    if (!me) return true;
    return who === me;
  }
  function isCap(j) {
    return !!(j && (j.priority || j.cap));
  }
  function needsYou(j) {
    if (!j || !isOpen(j)) return false;
    var st = String(j.status || "");
    if (st === "held" || st === "exception" || st === "waiting") return true;
    if (String(j.waitingOn || "").toLowerCase() === "owner") return true;
    if (j.late || j.expired) return true;
    if (typeof window.cardNeeds === "function") {
      try {
        var n = window.cardNeeds(j);
        if (n && (n.decide || (n.missing && n.missing.length))) return true;
      } catch (e) {}
    }
    return false;
  }
  function sourceOf(j) {
    if (isTalk(j)) return "talk";
    if (isPipe(j)) return "pipes";
    if (isDrop(j)) return "drop";
    return "desk";
  }
  function hay(j) {
    var c = customOf(j);
    return [
      j.title, j.notes, j.draft, j.why, j.next, j.needLine, j.contactName, j.name,
      j.phone, j.email, j.assignee, j.pack, j.kind, j.desk, j.provider, j.from,
      c.packName, c.outcome, c.notes
    ].join(" ").toLowerCase();
  }
  function keep(j) {
    if (!isOpen(j)) return false;
    if (QUERY && hay(j).indexOf(QUERY) < 0) return false;
    if (FILTER === "all") return true;
    if (FILTER === "need") return needsYou(j);
    if (FILTER === "mine") return isMine(j);
    if (FILTER === "drop") return isDrop(j);
    if (FILTER === "talk") return isTalk(j);
    if (FILTER === "pipes") return isPipe(j);
    if (FILTER === "cap") return isCap(j);
    return true;
  }
  function sortRows(rows) {
    return (rows || []).slice().sort(function (a, b) {
      var ac = isCap(a) ? 1 : 0;
      var bc = isCap(b) ? 1 : 0;
      if (ac !== bc) return bc - ac;
      var an = needsYou(a) ? 1 : 0;
      var bn = needsYou(b) ? 1 : 0;
      if (an !== bn) return bn - an;
      return String(b.updatedAt || b.createdAt || b.t || "").localeCompare(String(a.updatedAt || a.createdAt || a.t || ""));
    });
  }
  function openAll() {
    return (window.JOBS || []).filter(isOpen);
  }
  function counts() {
    var map = { all: 0, need: 0, mine: 0, drop: 0, talk: 0, pipes: 0, cap: 0 };
    openAll().forEach(function (j) {
      if (QUERY && hay(j).indexOf(QUERY) < 0) return;
      map.all += 1;
      if (needsYou(j)) map.need += 1;
      if (isMine(j)) map.mine += 1;
      if (isDrop(j)) map.drop += 1;
      if (isTalk(j)) map.talk += 1;
      if (isPipe(j)) map.pipes += 1;
      if (isCap(j)) map.cap += 1;
    });
    return map;
  }
  function emptyLine() {
    if (FILTER === "all" && !QUERY) return "";
    if (FILTER === "need") return "Nothing needs you on this view. Switch to All, or drop the next thing.";
    if (FILTER === "mine") return "Nothing handed to you. Hand a card on People, or switch to All.";
    if (FILTER === "drop") return "No Drop cards here. Family and friends land work on /drop.";
    if (FILTER === "talk") return "No Talk cards here. Say the work on Drop, then drop it.";
    if (FILTER === "pipes") return "No pipe cards here. Copy the hook on Pipes. Named pipes stay hold until keys sit on the box.";
    if (FILTER === "cap") return "Nothing on the cap. Orange is first. You still tap Copy, Text, Email, Hand, or Stop.";
    if (QUERY) return "No card matches that find. Clear it, or drop the work.";
    return "";
  }
  function ensureCss() {
    if (document.getElementById("queue-filter-css")) return;
    var css = document.createElement("style");
    css.id = "queue-filter-css";
    css.textContent =
      "#queue-filters{margin:0 0 10px}" +
      "#queue-filters .now{color:var(--heading);font-weight:700;margin:0 0 4px}" +
      "#queue-find{width:100%;min-height:44px;margin:6px 0 8px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);font:16px system-ui,sans-serif}" +
      "#queue-chips{display:flex;flex-wrap:nowrap;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:0 0 4px;scrollbar-width:none}" +
      "#queue-chips::-webkit-scrollbar{display:none}" +
      "#queue-chips button{min-height:44px;min-width:44px;padding:8px 12px;border-radius:999px;font-size:13px;white-space:nowrap;flex:0 0 auto}" +
      "#queue-chips button.on{background:var(--teal,#0d6b6b);color:#fff;border-color:transparent}" +
      "#queue-chips button.cap-on,#queue-chips button[data-queue-filter=cap].on{background:var(--orange,#f39c12);color:#0c1116}" +
      "#queue-filter-line{margin:8px 0 0}" +
      "#queue-clear{margin-left:6px}";
    document.head.appendChild(css);
  }
  function ensureDom() {
    if (document.getElementById("queue-filters")) return;
    var box = document.createElement("div");
    box.id = "queue-filters";
    box.className = "item";
    box.innerHTML =
      "<p class=\"now\">Find work</p>" +
      "<p class=\"meta\">Search, then tap how it got here. Packs stay under this. You still tap Copy, Text, Email, Hand, Cap, or Stop. Nobody sends money from here.</p>" +
      "<label class=\"meta\" for=\"queue-find\">Find a card</label>" +
      "<input id=\"queue-find\" type=\"search\" enterkeyhint=\"search\" autocomplete=\"off\" placeholder=\"Name, note, draft, person\">" +
      "<div id=\"queue-chips\" role=\"tablist\" aria-label=\"Queue filters\"></div>" +
      "<p class=\"meta\" id=\"queue-filter-line\"></p>";
    var packs = document.getElementById("pack-filters");
    var view = document.getElementById("desk-view");
    var queue = document.getElementById("queue");
    if (packs && packs.parentNode) packs.parentNode.insertBefore(box, packs);
    else if (view && view.parentNode) view.parentNode.insertBefore(box, view.nextSibling);
    else if (queue && queue.parentNode) queue.parentNode.insertBefore(box, queue);
  }
  function lineText(n) {
    var bits = [];
    if (QUERY) bits.push("Find on");
    if (FILTER !== "all") bits.push(LABELS[FILTER] || FILTER);
    if (!bits.length) bits.push((n.all || 0) + (n.all === 1 ? " card" : " cards") + " on this view");
    else bits.push((n[FILTER] != null ? n[FILTER] : 0) + " match");
    if (n.need && FILTER === "all") bits.push(n.need + " need you");
    return bits.join(" · ");
  }
  function paintBar() {
    ensureCss();
    ensureDom();
    var chips = document.getElementById("queue-chips");
    var line = document.getElementById("queue-filter-line");
    var find = document.getElementById("queue-find");
    if (!chips) return;
    var n = counts();
    chips.innerHTML = CHIPS.map(function (id) {
      var count = n[id] ? " · " + n[id] : "";
      var on = FILTER === id ? " on" : "";
      var extra = id === "cap" && FILTER === "cap" ? " cap-on" : "";
      return "<button type=\"button\" class=\"edit" + on + extra + "\" data-queue-filter=\"" + id + "\" role=\"tab\" aria-selected=\"" + (FILTER === id ? "true" : "false") + "\">" +
        LABELS[id] + count + "</button>";
    }).join("");
    if (find && find.value !== QUERY) find.value = QUERY;
    if (line) {
      var dirty = FILTER !== "all" || !!QUERY;
      line.innerHTML = esc(lineText(n)) +
        (dirty ? " <button class=\"edit\" type=\"button\" id=\"queue-clear\">Show all</button>" : "") +
        " <a class=\"edit\" href=\"/drop\">Drop anything</a>";
    }
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify({ filter: FILTER, q: QUERY })); } catch (e) {}
    try {
      if (FILTER !== "all" && location.hash !== "#" + FILTER) history.replaceState(null, "", "#" + FILTER);
    } catch (e) {}
  }
  function apply() {
    persist();
    paintBar();
    if (window.AIAQueuePacks && typeof AIAQueuePacks.paint === "function") AIAQueuePacks.paint();
    else if (typeof window.paintQueueCard === "function") window.paintQueueCard();
  }
  function setFilter(id) {
    FILTER = CHIPS.indexOf(id) >= 0 ? id : "all";
    apply();
  }
  function setQuery(q) {
    QUERY = String(q || "").trim().toLowerCase().slice(0, 80);
    apply();
  }
  function clearAll() {
    FILTER = "all";
    QUERY = "";
    apply();
  }
  function readSaved() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        if (raw.charAt(0) === "{") {
          var o = JSON.parse(raw);
          FILTER = CHIPS.indexOf(o.filter) >= 0 ? o.filter : "all";
          QUERY = String(o.q || "").trim().toLowerCase().slice(0, 80);
        } else if (CHIPS.indexOf(raw) >= 0) FILTER = raw;
      }
    } catch (e) {}
    var hash = String(location.hash || "").replace("#", "").toLowerCase();
    if (hash === "handed" || hash === "handed-to-me") hash = "mine";
    if (CHIPS.indexOf(hash) >= 0) FILTER = hash;
    try {
      var q = new URLSearchParams(location.search).get("filter") || "";
      if (CHIPS.indexOf(String(q).toLowerCase()) >= 0) FILTER = String(q).toLowerCase();
    } catch (e) {}
  }
  function hookLoad() {
    if (typeof window.load !== "function" || window.load.__aiaFilters) return;
    var orig = window.load;
    window.load = async function () {
      var out = await orig.apply(this, arguments);
      paintBar();
      return out;
    };
    window.load.__aiaFilters = true;
  }
  function wire() {
    var chips = document.getElementById("queue-chips");
    if (chips && !chips.__wired) {
      chips.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-queue-filter]");
        if (btn) setFilter(btn.getAttribute("data-queue-filter"));
      });
      chips.__wired = true;
    }
    var box = document.getElementById("queue-filters");
    if (box && !box.__wired) {
      box.addEventListener("click", function (e) {
        if (e.target && e.target.id === "queue-clear") clearAll();
      });
      box.__wired = true;
    }
    var find = document.getElementById("queue-find");
    if (find && !find.__wired) {
      var t = 0;
      find.addEventListener("input", function () {
        var v = find.value;
        clearTimeout(t);
        t = setTimeout(function () { setQuery(v); }, 160);
      });
      find.addEventListener("keydown", function (e) {
        if (e.key === "Escape") { find.value = ""; setQuery(""); }
        if (e.key === "Enter") { e.preventDefault(); setQuery(find.value); }
      });
      find.__wired = true;
    }
  }
  function boot() {
    if (!document.getElementById("queue") && (location.pathname || "").indexOf("desk") < 0) return;
    readSaved();
    ensureCss();
    ensureDom();
    wire();
    hookLoad();
    window.AIAQueueFilters = {
      keep: keep,
      sort: sortRows,
      emptyLine: emptyLine,
      filter: function () { return FILTER; },
      query: function () { return QUERY; },
      setFilter: setFilter,
      setQuery: setQuery,
      clear: clearAll,
      paint: paintBar,
      sourceOf: sourceOf,
      counts: counts
    };
    paintBar();
    if (window.AIAQueuePacks && typeof AIAQueuePacks.paint === "function") AIAQueuePacks.paint();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 80);
  setTimeout(hookLoad, 220);
})();
