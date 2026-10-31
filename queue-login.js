/* Queue sign-in lands here. One account, one Queue, many desks.
   Email sign-in stores the desk list from the login reply (desks, or queue.desks).
   The Queue picker uses that list and skips an extra call.
   When the reply lacks a desk list (an old session, or a reload after that list was used),
   POST /api/desks { action: "mine" } fills the picker.
   All desks calls GET /api/jobs?desks=all. That counts only when the response is ok
   and every card has a slug. An empty list counts. Otherwise each desk is read with
   GET /api/jobs?workspace=<slug>. One desk uses that same workspace read on this session.
   A failed read never looks empty: a 500, a network error, or no answer within QUEUE_WAIT_MS
   shows "Couldn't load your Queue. Try again." with a Try again button that runs the load again.
   "Nothing waiting" shows only after every read answered 200 with zero open cards. */
(function () {
  var ALL_BANNER = "Every desk in this Queue.";
  var LOGIN_REPLY_KEY = "aia_queue_login_reply";
  var desks = [];
  var cards = [];
  var mode = "all";
  var loadGen = 0;
  // About 8 seconds, in line with the 7-second health wait on /create and /history.
  var QUEUE_WAIT_MS = 8000;
  var LOAD_FAILED = "Couldn't load your Queue. Try again.";
  var SOME_FAILED = "Couldn't load every desk, so some cards may be missing. Try again.";
  var load = null;        // the current load: { failed, allFailed, signal }; an old load only marks its own object
  var loading = false;
  var loadError = false;
  var mineFailed = false;
  var firstSignal = null;  // the first page load shares one deadline across the desk list and the cards

  // Abort a read that has not answered in time. Without timers or AbortController (old browsers) it is a no-op.
  function waitSignal() {
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    if (ctl && typeof setTimeout === "function") setTimeout(function () { try { ctl.abort(); } catch (e) {} }, QUEUE_WAIT_MS);
    return ctl ? ctl.signal : undefined;
  }


  function slugify(s) {
    if (window.AIADesks && AIADesks.slugify) return AIADesks.slugify(s);
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  }

  function signedIn() {
    try {
      return !!(localStorage.getItem("aia_session") || localStorage.getItem("aia_pin"));
    } catch (e) {
      return false;
    }
  }

  function headersFor(workspace) {
    var h = { "Content-Type": "application/json", "Accept": "application/json" };
    var tok = "";
    var pin = "";
    var home = "";
    try {
      tok = localStorage.getItem("aia_session") || "";
      pin = localStorage.getItem("aia_pin") || "";
      home = localStorage.getItem("aia_ws") || "";
    } catch (e) {}
    if (tok) h["X-Session"] = tok;
    if (workspace) h["X-Workspace"] = workspace;
    else if (home) h["X-Workspace"] = home;
    if (pin && (!workspace || workspace === home)) h["X-Pin"] = pin;
    return h;
  }

  function readWorkspace() {
    try {
      return slugify(new URLSearchParams(location.search).get("workspace") || "");
    } catch (e) {
      return "";
    }
  }

  function writeWorkspace(slug) {
    var url;
    try { url = new URL(location.href); } catch (e) { return; }
    if (slug) url.searchParams.set("workspace", slug);
    else url.searchParams.delete("workspace");
    var next = url.pathname + url.search + url.hash;
    var now = location.pathname + location.search + location.hash;
    if (next !== now) history.pushState({ queueWorkspace: slug || "" }, "", next);
  }

  function plainStatus(s) {
    if (s === "exception") return "Waiting on a person";
    if (s === "held") return "Waiting on the owner";
    if (s === "waiting") return "Needs you";
    if (s === "shipped") return "Sent";
    if (s === "killed") return "Stopped";
    return "Open";
  }

  function openCard(j) {
    return j && j.status !== "shipped" && j.status !== "killed";
  }

  function ensureCss() {
    if (document.getElementById("queue-login-css")) return;
    var css = document.createElement("style");
    css.id = "queue-login-css";
    css.textContent =
      "#queue-desk-picker{margin:0 0 12px}" +
      "#queue-desk-picker .queue-picker-label{font-weight:800;margin:0 0 8px;color:var(--heading,#0a4f4f)}" +
      "#queue-desk-picker .queue-picker-row,#queue-desk-buttons{display:flex;flex-wrap:wrap;gap:8px;align-items:center}" +
      "#queue-desk-picker button,#queue-desk-picker a{min-height:44px;border-radius:999px;border:1px solid var(--line,#d5e0e0);background:var(--card,#fff);color:inherit;font:700 14px/1.2 inherit;padding:8px 14px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}" +
      "#queue-desk-picker button.on{background:#0d6b6b;color:#fff;border-color:#0d6b6b}" +
      "#queue-all-cards .item{background:var(--card,#fff);border:1px solid var(--line,#d5e0e0);border-radius:14px;padding:14px;margin:10px 0}" +
      "#queue-all-cards h3{margin:4px 0;font-size:1.05rem}" +
      "#queue-all-cards .meta{font-size:13px;color:var(--muted,#5c6b73);margin:0 0 8px}" +
      "#queue-all-cards .queue-desk-label{display:block;font-size:12px;font-weight:700;color:var(--muted,#5c6b73);margin:0 0 4px}" +
      "#queue-empty-next{background:var(--card,#fff);border:1px solid var(--line,#d5e0e0);border-radius:14px;padding:16px;margin:10px 0}" +
      "#queue-empty-next .meta{font-size:15px;margin:0 0 12px}" +
      "#queue-empty-next a.go{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 18px;border-radius:999px;font-weight:800;text-decoration:none}" +
      "#queue-all-cards [data-queue-error]{background:var(--card,#fff);border:1px solid var(--line,#d5e0e0);border-radius:14px;padding:16px;margin:10px 0}" +
      "#queue-all-cards [data-queue-error] p{font-size:15px;margin:0 0 12px}" +
      "#queue-all-cards [data-queue-retry]{min-height:44px;padding:10px 18px;border-radius:999px;font-weight:800;cursor:pointer}" +
      "#queue-desk-picker[hidden]{display:none!important}" +
      "html.queue-signed-out main > :not(h1):not(#queue-all-cards){display:none!important}" +
      "@media (max-width:640px){" +
      "#queue-desk-picker .queue-picker-row,#queue-desk-buttons{flex-direction:column;align-items:stretch;width:100%}" +
      "#queue-desk-picker button,#queue-desk-picker a{width:100%}" +
      "}";
    document.head.appendChild(css);
  }

  function showNative(on) {
    var q = document.getElementById("queue");
    var all = document.getElementById("queue-all-cards");
    if (q && q.hidden === on) q.hidden = !on;
    if (all) all.hidden = !!on;
  }

  function bannerText() {
    if (mode === "all") return ALL_BANNER;
    var row = deskBySlug(mode);
    var name = (row && row.name) || mode || "This desk";
    return name + " in this Queue.";
  }

  function paintBanner() {
    var banner = document.getElementById("banner");
    if (!banner) return;
    var text = bannerText();
    if (banner.textContent !== text) banner.textContent = text;
  }

  function quietPhoneView() {
    var box = document.getElementById("desk-view");
    if (box && !box.hidden) box.hidden = true;
  }

  function deskBySlug(slug) {
    for (var i = 0; i < desks.length; i++) {
      if (desks[i].slug === slug) return desks[i];
    }
    return null;
  }

  function rememberAll() {
    if (!window.AIADesks || !AIADesks.add) return;
    var token = "";
    var role = "";
    var who = "";
    try {
      token = localStorage.getItem("aia_session") || "";
      role = localStorage.getItem("aia_role") || "";
      who = localStorage.getItem("aia_name") || "";
    } catch (e) {}
    desks.forEach(function (d) {
      AIADesks.add({ slug: d.slug, name: d.name, pin: "", token: token, role: role, who: who });
    });
  }

  function rememberDesk(slug) {
    var row = deskBySlug(slug);
    var name = (row && row.name) || slug;
    try {
      rememberAll();
      if (window.AIADesks && AIADesks.open) {
        AIADesks.open({
          slug: slug,
          name: name,
          pin: localStorage.getItem("aia_pin") || "",
          token: localStorage.getItem("aia_session") || "",
          role: localStorage.getItem("aia_role") || "",
          who: localStorage.getItem("aia_name") || ""
        });
      } else {
        localStorage.setItem("aia_ws", slug);
        localStorage.setItem("aia_desk_name", name);
      }
    } catch (e) {}
    var wsEl = document.getElementById("ws");
    if (wsEl) wsEl.value = slug;
  }

  function paintPicker() {
    var box = document.getElementById("queue-desk-buttons");
    var allBtn = document.getElementById("queue-all-desks");
    if (!box || !allBtn) return;
    allBtn.classList.toggle("on", mode === "all");
    box.replaceChildren();
    desks.forEach(function (d) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-queue-desk", d.slug);
      btn.textContent = d.name || d.slug;
      if (mode === d.slug) btn.className = "on";
      box.appendChild(btn);
    });
  }

  function deskLabelText(j) {
    var slug = slugify((j && (j.slug || j.desk)) || "");
    var known = slug ? deskBySlug(slug) : null;
    if (known && known.name) return known.name;
    return String((j && (j.desk || j.slug)) || "Desk");
  }

  // Empty or signed-out Queue: one line and exactly one next step.
  function emptyState(box, text, href, label) {
    var wrap = document.createElement("div");
    wrap.id = "queue-empty-next";
    var p = document.createElement("p");
    p.className = "meta";
    p.textContent = text;
    var go = document.createElement("a");
    go.className = "go";
    go.id = "queue-next-step";
    go.href = href;
    go.textContent = label;
    wrap.appendChild(p);
    wrap.appendChild(go);
    box.appendChild(wrap);
  }

  // A read failed or timed out: say so, with one Try again button. Never the empty state.
  function errorState(box, text) {
    var wrap = document.createElement("div");
    wrap.setAttribute("data-queue-error", "1");
    wrap.setAttribute("role", "alert");
    var p = document.createElement("p");
    p.textContent = text;
    var again = document.createElement("button");
    again.type = "button";
    again.setAttribute("data-queue-retry", "1");
    again.textContent = "Try again";
    wrap.appendChild(p);
    wrap.appendChild(again);
    box.appendChild(wrap);
  }

  function loadingState(box) {
    var p = document.createElement("p");
    p.className = "meta";
    p.setAttribute("role", "status");
    p.textContent = "Loading your Queue…";
    box.appendChild(p);
  }

  // Signed out, the Queue shows only the sign-in step; desk tools stay out of the way.
  function markSignedOut(on) {
    var root = document.documentElement;
    if (root && root.classList) root.classList.toggle("queue-signed-out", !!on);
    var picker = document.getElementById("queue-desk-picker");
    if (picker) picker.hidden = !!on;
  }

  function paintCards(rows) {
    var box = document.getElementById("queue-all-cards");
    if (!box) return;
    box.replaceChildren();
    var out = !signedIn();
    markSignedOut(out);
    if (out) {
      emptyState(box, "Sign in to see your Queue. It keeps every desk and card in one place.", "/login", "Sign in");
      return;
    }
    var open = (rows || []).filter(openCard);
    if (!open.length && loading) { loadingState(box); return; }
    if (!open.length && loadError) { errorState(box, LOAD_FAILED); return; }
    if (loadError) errorState(box, SOME_FAILED);
    if (!open.length) {
      var named = mode !== "all" ? deskBySlug(mode) : null;
      if (!desks.length) emptyState(box, "No desks in this Queue yet. Create a desk to start.", "/onboard", "Create a desk");
      else emptyState(box, named ? ("Nothing waiting on " + named.name + ". Drop a card to start.") : "Nothing waiting in this Queue. Drop a card to start.", "/drop", "Drop a card");
      return;
    }
    open.forEach(function (j) {
      var card = document.createElement("article");
      card.className = "item";
      if (mode === "all") {
        var lab = document.createElement("p");
        lab.className = "queue-desk-label";
        lab.textContent = deskLabelText(j);
        card.appendChild(lab);
      }
      var meta = document.createElement("p");
      meta.className = "meta";
      meta.textContent = plainStatus(j.status);
      var title = document.createElement("h3");
      title.textContent = j.title || "Card";
      var next = document.createElement("p");
      next.className = "meta";
      next.textContent = j.needLine || j.next || "Pick this desk in the Queue to decide.";
      var go = document.createElement("button");
      go.type = "button";
      go.setAttribute("data-queue-desk", j.deskSlug || j.slug || j.desk || j.workspace || "");
      go.textContent = "Show this desk";
      card.appendChild(meta);
      card.appendChild(title);
      card.appendChild(next);
      if (go.getAttribute("data-queue-desk")) card.appendChild(go);
      box.appendChild(card);
    });
  }

  function addDesk(list, seen, row) {
    if (!row) return;
    var slug = slugify(row.slug || row.biz || row.name || "");
    if (!slug || seen[slug]) return;
    seen[slug] = true;
    list.push({ slug: slug, name: String(row.name || row.biz || slug) });
  }

  function fromMine(data) {
    var list = [];
    var seen = {};
    ["owned", "member", "desks"].forEach(function (key) {
      var rows = data && data[key];
      if (!Array.isArray(rows)) return;
      rows.forEach(function (row) { addDesk(list, seen, row); });
    });
    return list;
  }

  function desksFromLoginReply(data) {
    if (!data || typeof data !== "object") return null;
    var rows = Array.isArray(data.desks) ? data.desks : null;
    if (!rows && data.queue && Array.isArray(data.queue.desks)) rows = data.queue.desks;
    if (!rows) return null;
    return fromMine({ desks: rows });
  }

  function takeLoginDesks() {
    var data = null;
    try {
      var raw = sessionStorage.getItem(LOGIN_REPLY_KEY);
      if (!raw) return null;
      data = JSON.parse(raw);
    } catch (e) {
      return null;
    }
    var rows = desksFromLoginReply(data);
    try { sessionStorage.removeItem(LOGIN_REPLY_KEY); } catch (e2) {}
    return rows;
  }

  function fromPhone() {
    var list = [];
    var seen = {};
    var rows = (window.AIADesks && AIADesks.list) ? AIADesks.list() : [];
    rows.forEach(function (row) { addDesk(list, seen, row); });
    return list;
  }

  async function loadMine() {
    if (!signedIn()) return null;
    try {
      var r = await fetch("/api/desks", {
        method: "POST",
        headers: headersFor(""),
        body: JSON.stringify({ action: "mine" }),
        signal: firstSignal || waitSignal()
      });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok) mineFailed = true;
      if (!r.ok || !data || data.ok === false) return null;
      mineFailed = false;
      return data;
    } catch (e) {
      mineFailed = true;
      return null;
    }
  }

  function everyCardHasSlug(rows) {
    if (!Array.isArray(rows)) return false;
    for (var i = 0; i < rows.length; i++) {
      var card = rows[i];
      if (!card || !Object.prototype.hasOwnProperty.call(card, "slug")) return false;
      if (String(card.slug || "").trim() === "") return false;
    }
    return true;
  }

  function mapCard(j, desk) {
    var slug = slugify((j && (j.slug || j.desk || j.workspace)) || (desk && desk.slug) || "");
    var known = deskBySlug(slug);
    return {
      id: j.id,
      title: j.title || "Card",
      status: j.status || "",
      next: j.next || "",
      needLine: j.needLine || "",
      workspace: (j && j.workspace) || slug,
      deskSlug: slug,
      slug: (j && j.slug) || slug,
      desk: (j && j.desk) || slug,
      deskName: (known && known.name) || (desk && desk.name) || slug || "Desk"
    };
  }

  // Real all-desks read: ok response, and every card has a slug. Empty list counts.
  async function readAllDesks() {
    var mine = load;
    var tok = "";
    try { tok = localStorage.getItem("aia_session") || ""; } catch (e) {}
    if (!tok) return null;
    try {
      var r = await fetch("/api/jobs?desks=all", {
        headers: { "Accept": "application/json", "X-Session": tok },
        signal: mine ? mine.signal : waitSignal()
      });
      var data = await r.json().catch(function () { return null; });
      if ((!r.ok || !data) && mine) mine.allFailed = true;
      if (!r.ok || !data || data.ok !== true || data.error) return null;
      var rows = Array.isArray(data.jobs) ? data.jobs : null;
      if (!rows || !everyCardHasSlug(rows)) return null;
      return rows;
    } catch (e) {
      if (mine) mine.allFailed = true;
      return null;
    }
  }

  // A failed desk read still returns [] so the other desks show, but it marks this load as failed.
  async function jobsForDesk(desk) {
    var mine = load;
    try {
      var r = await fetch("/api/jobs?workspace=" + encodeURIComponent(desk.slug), {
        headers: headersFor(desk.slug),
        signal: mine ? mine.signal : waitSignal()
      });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok || !data || !Array.isArray(data.jobs)) { if (mine) mine.failed = true; return []; }
      return data.jobs.map(function (j) { return mapCard(j, desk); });
    } catch (e) {
      if (mine) mine.failed = true;
      return [];
    }
  }

  async function refreshCards() {
    var gen = ++loadGen;
    var next = [];
    // One deadline for the whole load, so a hang shows the error after QUEUE_WAIT_MS, not once per desk.
    var me = load = { failed: false, allFailed: false, signal: firstSignal || waitSignal() };
    firstSignal = null;
    loading = true;
    loadError = false;
    if (!visibleCards().filter(openCard).length) paintCards(visibleCards());
    if (mode === "all") {
      var all = await readAllDesks();
      if (gen !== loadGen) return;
      if (all) {
        next = all.map(function (j) { return mapCard(j, null); });
      } else {
        // No desk list to fall back on: a failed all-desks read is an error, not an empty Queue.
        if (!desks.length && (me.allFailed || mineFailed)) me.failed = true;
        for (var i = 0; i < desks.length; i++) {
          var part = await jobsForDesk(desks[i]);
          if (gen !== loadGen) return;
          part.forEach(function (row) { next.push(row); });
        }
      }
    } else {
      var desk = deskBySlug(mode) || { slug: mode, name: mode };
      next = await jobsForDesk(desk);
      if (gen !== loadGen) return;
    }
    cards = next;
    loading = false;
    loadError = !!me.failed;
    paintCards(visibleCards());
  }

  // Try again: read the desk list again if that read failed, then the cards.
  async function retryLoad() {
    if (mineFailed && !desks.length) {
      var gen = loadGen;
      loading = true;
      loadError = false;
      paintCards([]);
      firstSignal = waitSignal();
      var mine = await loadMine();
      if (gen !== loadGen) { firstSignal = null; return; }
      if (mine) desks = fromMine(mine);
      paintPicker();
    }
    await refreshCards();
  }

  function visibleCards() {
    if (mode === "all") return cards;
    return cards.filter(function (j) { return (j.deskSlug || j.slug || j.desk || j.workspace) === mode; });
  }

  function selectDesk(slug, fromPop) {
    slug = slugify(slug);
    if (slug && !deskBySlug(slug)) desks.push({ slug: slug, name: slug });
    mode = slug || "all";
    if (!fromPop) writeWorkspace(slug);
    paintPicker();
    showNative(false);
    paintBanner();
    quietPhoneView();
    if (slug) rememberDesk(slug);
    loading = true;
    loadError = false;
    paintCards(visibleCards());
    refreshCards();
    if (slug && typeof window.load === "function") window.load();
  }

  function watchNative() {
    var q = document.getElementById("queue");
    if (q && !q.__queueLoginWatch) {
      q.__queueLoginWatch = true;
      new MutationObserver(function () {
        if (!q.hidden) q.hidden = true;
      }).observe(q, { attributes: true, childList: true, attributeFilter: ["hidden"] });
    }
    var banner = document.getElementById("banner");
    if (banner && !banner.__queueLoginWatch) {
      banner.__queueLoginWatch = true;
      new MutationObserver(function () { paintBanner(); }).observe(banner, { childList: true, characterData: true, subtree: true });
    }
    var phone = document.getElementById("desk-view");
    if (phone && !phone.__queueLoginWatch) {
      phone.__queueLoginWatch = true;
      new MutationObserver(function () { quietPhoneView(); }).observe(phone, { attributes: true, attributeFilter: ["hidden"] });
    }
  }

  function mount() {
    if (document.getElementById("queue-desk-picker")) return;
    var queue = document.getElementById("queue");
    if (!queue || !queue.parentNode) return;
    ensureCss();
    var picker = document.createElement("nav");
    picker.id = "queue-desk-picker";
    picker.setAttribute("aria-label", "Desks in this Queue");
    var label = document.createElement("p");
    label.className = "queue-picker-label";
    label.textContent = "Desks in this Queue";
    var row = document.createElement("div");
    row.className = "queue-picker-row";
    var allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.id = "queue-all-desks";
    allBtn.setAttribute("data-queue-desk", "");
    allBtn.textContent = "All desks";
    var buttons = document.createElement("div");
    buttons.id = "queue-desk-buttons";
    var add = document.createElement("a");
    add.id = "queue-add-desk";
    add.href = "/onboard";
    add.textContent = "Add a desk";
    row.appendChild(allBtn);
    row.appendChild(buttons);
    row.appendChild(add);
    picker.appendChild(label);
    picker.appendChild(row);
    var h1 = document.querySelector("main h1, h1.page-title");
    if (h1 && h1.parentNode) h1.parentNode.insertBefore(picker, h1.nextSibling);
    else queue.parentNode.insertBefore(picker, queue);
    var list = document.createElement("div");
    list.id = "queue-all-cards";
    if (picker.parentNode) picker.parentNode.insertBefore(list, picker.nextSibling);
    else queue.parentNode.insertBefore(list, queue);
    picker.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("[data-queue-desk]") : null;
      if (!btn || btn.id === "queue-add-desk") return;
      selectDesk(btn.getAttribute("data-queue-desk") || "");
    });
    list.addEventListener("click", function (e) {
      var again = e.target && e.target.closest ? e.target.closest("[data-queue-retry]") : null;
      if (again) { retryLoad(); return; }
      var btn = e.target && e.target.closest ? e.target.closest("[data-queue-desk]") : null;
      if (!btn) return;
      selectDesk(btn.getAttribute("data-queue-desk") || "");
    });
    window.addEventListener("popstate", function () {
      selectDesk(readWorkspace(), true);
    });
    watchNative();
  }

  async function boot() {
    mount();
    if (!document.getElementById("queue-desk-picker")) return;
    firstSignal = waitSignal();
    var fromReply = takeLoginDesks();
    if (fromReply) {
      desks = fromReply;
    } else {
      var mine = await loadMine();
      desks = mine ? fromMine(mine) : fromPhone();
      if (!desks.length) desks = fromPhone();
    }
    var asked = readWorkspace();
    if (asked && !deskBySlug(asked)) desks.push({ slug: asked, name: asked });
    mode = asked || "all";
    rememberAll();
    paintPicker();
    showNative(false);
    paintBanner();
    quietPhoneView();
    if (mode !== "all") rememberDesk(mode);
    await refreshCards();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
