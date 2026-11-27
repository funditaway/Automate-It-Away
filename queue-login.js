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
  // After a good signed-in load, reread the Queue while the tab is visible. Timers start only then
  // so the 8-second load wait stays the only timeout during a hang.
  var LIVE_IDLE_MS = 15000;
  var LIVE_BACKOFF_MAX_MS = 120000;
  var LIVE_FOCUS_MS = 50;
  var LIVE_OK = "Up to date";
  var LIVE_NOW = "Updated just now";
  var LIVE_FAIL = "Couldn't refresh. Trying again soon.";
  var liveArmed = false;
  var liveTimer = null;
  var liveDebounce = null;
  var liveBackoff = LIVE_IDLE_MS;
  var liveInFlight = false;
  var liveWanted = false;
  var liveWatchBound = false;
  var livePaintWaiting = false;

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

  // Queue step 1: one plain state per card, read only from fields GET /api/jobs?desks=all already
  // returns (status, decide, awaiting, offDesk, draft). A card that fits none shows no label.
  var STATE_NEEDS = "Needs you";
  var STATE_DRAFTED = "Drafted";
  var STATE_RUNNING = "Running";
  var STATE_DONE = "Done";
  function queueState(j) {
    if (!j || typeof j !== "object") return "";
    var st = typeof j.status === "string" ? j.status : "";
    var open = st === "waiting" || st === "held" || st === "exception";
    if (st === "shipped") return STATE_DONE;
    if (st === "out") return STATE_RUNNING;
    if (!open) return "";
    if (j.awaiting === "writeback" || j.offDesk === true) return STATE_RUNNING;
    if ((st === "waiting" || st === "held") && j.decide === true) return STATE_NEEDS;
    if (typeof j.draft === "string" && j.draft.trim()) return STATE_DRAFTED;
    return "";
  }

  // Yes / Stop / Kill on a Queue card: only on a card that needs you, only when that seat's own
  // card lists the tap (staff seats get no Stop or Kill), and only with a card id and its desk.
  function safeCardId(id) {
    return String(id == null ? "" : id).replace(/[^a-zA-Z0-9_-]/g, "");
  }
  function cardDesk(j) {
    return slugify((j && (j.deskSlug || j.slug || j.desk || j.workspace)) || "");
  }
  function needHas(j, id) {
    var rows = j && Array.isArray(j.needs) ? j.needs : [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].id === id) return true;
    }
    return false;
  }
  function stopSheet() {
    var sheet = document.getElementById("sheet");
    var card = document.getElementById("sheet-card");
    return sheet && card ? { sheet: sheet, card: card } : null;
  }
  function controlsFor(j) {
    var on = signedIn() && !!safeCardId(j && j.id) && !!cardDesk(j) && queueState(j) === STATE_NEEDS;
    var sheet = !!stopSheet();
    return {
      yes: on && needHas(j, "yes"),
      stop: on && sheet && needHas(j, "stop"),
      kill: on && sheet && needHas(j, "kill")
    };
  }
  function controlsSig(j) {
    var c = controlsFor(j);
    return (c.yes ? "yes" : "") + "," + (c.stop ? "stop" : "") + "," + (c.kill ? "kill" : "");
  }
  function controlButton(cls, attr, id, desk, label) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.setAttribute(attr, id);
    b.setAttribute("data-queue-on", desk);
    b.textContent = label;
    return b;
  }
  function buildControls(j) {
    var c = controlsFor(j);
    if (!c.yes && !c.stop && !c.kill) return null;
    var id = safeCardId(j.id);
    var desk = cardDesk(j);
    var row = document.createElement("div");
    row.className = "row queue-controls";
    row.setAttribute("data-queue-controls", controlsSig(j));
    if (c.yes) row.appendChild(controlButton("go q-yes", "data-queue-yes", id, desk, "Yes"));
    if (c.stop) row.appendChild(controlButton("kill q-stop", "data-queue-stop", id, desk, "Stop"));
    if (c.kill) row.appendChild(controlButton("kill q-kill", "data-queue-kill", id, desk, "Kill"));
    return row;
  }
  function buildState(j) {
    var label = queueState(j);
    if (!label) return null;
    var p = document.createElement("p");
    p.className = "meta queue-state";
    p.setAttribute("data-queue-state", label);
    p.textContent = label;
    return p;
  }
  function cardFor(id, desk) {
    for (var i = 0; i < cards.length; i++) {
      var j = cards[i];
      if (j && safeCardId(j.id) === id && cardDesk(j) === desk) return j;
    }
    return null;
  }
  function tapName(fallback) {
    var who = "";
    var role = "";
    try {
      who = localStorage.getItem("aia_name") || "";
      role = localStorage.getItem("aia_role") || "";
    } catch (e) {}
    return who || (fallback === "desk" ? role : "") || fallback;
  }
  // The same POST /api/jobs the desk sends, with that card's own desk in X-Workspace.
  async function postJob(desk, body) {
    try {
      var r = await fetch("/api/jobs", { method: "POST", headers: headersFor(desk), body: JSON.stringify(body) });
      var data = await r.json().catch(function () { return {}; });
      return { status: r.status, data: data };
    } catch (e) {
      return { status: 0, data: {} };
    }
  }
  var queueTapping = false;
  var NOTHING_CHANGED = "Nothing changed.";
  var NO_REACH = "Could not reach AIA. Nothing changed.";
  // A refused tap (403, 404, 409, any error) or no answer: the card stays as it was and says so.
  function tapRefused(id, desk, status) {
    var box = document.getElementById("queue-all-cards");
    var key = id + "@" + desk;
    var card = null;
    var kids = box ? box.children || [] : [];
    for (var i = 0; i < kids.length; i++) {
      if (kids[i] && kids[i].getAttribute && kids[i].getAttribute("data-queue-card") === key) card = kids[i];
    }
    if (!card) return;
    var note = null;
    var parts = card.children || [];
    for (var n = 0; n < parts.length; n++) {
      if (parts[n] && parts[n].getAttribute && parts[n].getAttribute("data-queue-tap-note") !== null) note = parts[n];
    }
    if (!note) {
      note = document.createElement("p");
      note.className = "meta";
      note.setAttribute("data-queue-tap-note", "1");
      note.setAttribute("role", "status");
      card.appendChild(note);
    }
    note.textContent = status ? NOTHING_CHANGED : NO_REACH;
  }
  function tapOk(out) {
    return !!(out && out.status >= 200 && out.status < 300);
  }
  // Yes: the desk's ship tap (confirm false). A held card stays held for the owner; nothing is confirmed here.
  async function queueYes(btn) {
    var id = safeCardId(btn.getAttribute("data-queue-yes"));
    var desk = slugify(btn.getAttribute("data-queue-on") || "");
    var j = id && desk ? cardFor(id, desk) : null;
    if (!j || !controlsFor(j).yes || queueTapping) return;
    var amt = Number(j.amount || j.ask || 0);
    queueTapping = true;
    btn.disabled = true;
    var out = null;
    try {
      out = await postJob(desk, { action: "ship", id: id, amount: Number.isFinite(amt) ? amt : 0, confirm: false, whoTapped: tapName("desk") });
    } finally {
      queueTapping = false;
      btn.disabled = false;
    }
    if (!tapOk(out)) { tapRefused(id, desk, out && out.status); return; }
    await refreshCards();
  }
  // Stop and Kill: the desk's own second tap first (the same "Stop?" sheet), then the desk's kill POST with confirm.
  function queueStopAsk(btn, attr) {
    var id = safeCardId(btn.getAttribute(attr));
    var desk = slugify(btn.getAttribute("data-queue-on") || "");
    var j = id && desk ? cardFor(id, desk) : null;
    var c = j ? controlsFor(j) : null;
    if (!c || !(attr === "data-queue-kill" ? c.kill : c.stop)) return;
    var s = stopSheet();
    if (!s) return;
    var h = document.createElement("h3");
    h.textContent = "Stop?";
    var p = document.createElement("p");
    p.className = "meta";
    p.textContent = (j.title || "") + ". Nothing goes out.";
    var row = document.createElement("div");
    row.className = "row";
    var yes = document.createElement("button");
    yes.type = "button";
    yes.className = "kill";
    yes.setAttribute("data-queue-stop-confirm", id);
    yes.textContent = "Stop";
    var keep = document.createElement("button");
    keep.type = "button";
    keep.className = "edit";
    keep.textContent = "Keep the card";
    yes.addEventListener("click", function () { queueStopConfirm(id, desk); });
    keep.addEventListener("click", function () { s.sheet.classList.remove("on"); });
    row.appendChild(yes);
    row.appendChild(keep);
    s.card.replaceChildren(h, p, row);
    s.sheet.classList.add("on");
  }
  async function queueStopConfirm(id, desk) {
    var s = stopSheet();
    if (s) s.sheet.classList.remove("on");
    var j = cardFor(id, desk);
    if (!j || queueTapping) return;
    queueTapping = true;
    var out = null;
    try {
      out = await postJob(desk, { action: "kill", id: id, confirm: true, whoTapped: tapName("owner") });
    } finally {
      queueTapping = false;
    }
    if (!tapOk(out)) { tapRefused(id, desk, out && out.status); return; }
    await refreshCards();
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
      "#queue-all-cards .queue-state{font-weight:800;color:var(--heading,#0a4f4f);margin:0 0 4px}" +
      "#queue-all-cards .queue-controls{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px}" +
      "#queue-all-cards .queue-controls button{min-height:44px;padding:8px 16px;border-radius:999px;font-weight:800;cursor:pointer}" +
      "#queue-empty-next{background:var(--card,#fff);border:1px solid var(--line,#d5e0e0);border-radius:14px;padding:16px;margin:10px 0}" +
      "#queue-empty-next .meta{font-size:15px;margin:0 0 12px}" +
      "#queue-empty-next a.go{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 18px;border-radius:999px;font-weight:800;text-decoration:none}" +
      "#queue-all-cards [data-queue-error]{background:var(--card,#fff);border:1px solid var(--line,#d5e0e0);border-radius:14px;padding:16px;margin:10px 0}" +
      "#queue-all-cards [data-queue-error] p{font-size:15px;margin:0 0 12px}" +
      "#queue-all-cards [data-queue-retry]{min-height:44px;padding:10px 18px;border-radius:999px;font-weight:800;cursor:pointer}" +
      "#queue-desk-picker[hidden]{display:none!important}" +
      "#queue-live-status{font-size:13px;color:var(--muted,#5c6b73);margin:0 0 8px}" +
      "#queue-live-status[hidden]{display:none!important}" +
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
      }
    } catch (e) {}
  }

  function paintCards(rows) {
    var box = document.getElementById("queue-all-cards");
    if (!box) return;
    box.replaceChildren();
    var out = !signedIn();
    markSignedOut(out);
    if (out) {
      emptyState(box, "Sign in to see your Queue. Every desk and card lives here.", "/login", "Sign in");
      armAfterGoodPaint();
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
      armAfterGoodPaint();
      return;
    }
    open.forEach(function (j) { box.appendChild(buildCard(j)); });
    armAfterGoodPaint();
  }

  function armAfterGoodPaint() {
    if (!signedIn() || loading || loadError) {
      if (!signedIn()) {
        stopLiveTimer();
        liveArmed = false;
        setLiveStatus("");
      }
      return;
    }
    liveArmed = true;
    bindLiveWatch();
    setLiveStatus(document.getElementById("queue-live-status") && document.getElementById("queue-live-status").textContent ? document.getElementById("queue-live-status").textContent : LIVE_OK);
    if (!liveInFlight) armLiveTimer(LIVE_IDLE_MS);
  }

  function addDesk(list, seen, row) {
    if (!row) return;
    var slug = slugify(row.slug || row.biz || row.name || "");
    if (!slug || seen[slug]) return;
    seen[slug] = true;
    list.push({ slug: slug, name: String(row.name || row.biz || slug), own: (row.yours === "own" || row.role === "owner") && row.status !== "denied" && row.status !== "pending" });
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
      deskName: (known && known.name) || (desk && desk.name) || slug || "Desk",
      draft: typeof j.draft === "string" ? j.draft : "",
      decide: j.decide === true,
      awaiting: j.awaiting || "",
      offDesk: j.offDesk === true,
      needs: Array.isArray(j.needs) ? j.needs.map(function (a) { return { id: a && a.id }; }) : [],
      amount: j.amount,
      ask: j.ask
    };
  }

  async function loadAllCards() {
    try {
      var r = await fetch("/api/jobs?desks=all", { headers: headersFor(""), signal: firstSignal || waitSignal() });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok || !data || data.ok === false) return null;
      var rows = data.jobs || data.cards || [];
      if (!everyCardHasSlug(rows)) return null;
      return rows.map(function (j) { return mapCard(j); });
    } catch (e) {
      return null;
    }
  }

  async function loadOneDesk(desk) {
    try {
      var r = await fetch("/api/jobs?workspace=" + encodeURIComponent(desk.slug), { headers: headersFor(desk.slug), signal: firstSignal || waitSignal() });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok || !data || data.ok === false) return null;
      var rows = data.jobs || data.cards || [];
      return rows.map(function (j) { return mapCard(j, desk); });
    } catch (e) {
      return null;
    }
  }

  async function refreshCards() {
    if (!signedIn()) { paintCards([]); return; }
    loading = true;
    loadError = false;
    paintCards(cards);
    var all = await loadAllCards();
    var next = [];
    var failed = false;
    if (all) {
      next = all;
    } else {
      for (var i = 0; i < desks.length; i++) {
        var one = await loadOneDesk(desks[i]);
        if (!one) { failed = true; continue; }
        next = next.concat(one);
      }
    }
    loading = false;
    loadError = failed && !next.length;
    cards = next;
    paintCards(cards);
    paintBanner();
  }

  function emptyState(box, text, href, label) {
    var wrap = document.createElement("div");
    wrap.id = "queue-empty-next";
    var p = document.createElement("p");
    p.className = "meta";
    p.textContent = text;
    var a = document.createElement("a");
    a.className = "go";
    a.href = href;
    a.textContent = label;
    wrap.appendChild(p);
    wrap.appendChild(a);
    box.appendChild(wrap);
  }

  function loadingState(box) {
    var p = document.createElement("p");
    p.className = "meta";
    p.textContent = "Loading your Queue…";
    box.appendChild(p);
  }

  function errorState(box, text) {
    var wrap = document.createElement("div");
    wrap.setAttribute("data-queue-error", "1");
    var p = document.createElement("p");
    p.textContent = text;
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("data-queue-retry", "1");
    b.textContent = "Try again";
    b.addEventListener("click", function () { refreshCards(); });
    wrap.appendChild(p);
    wrap.appendChild(b);
    box.appendChild(wrap);
  }

  function markSignedOut(out) {
    document.documentElement.classList.toggle("queue-signed-out", !!out);
  }

  function setLiveStatus(text) {
    var el = document.getElementById("queue-live-status");
    if (!el) return;
    el.textContent = text || "";
    el.hidden = !text;
  }

  function stopLiveTimer() {
    if (liveTimer) { clearTimeout(liveTimer); liveTimer = null; }
  }

  function armLiveTimer(ms) {
    stopLiveTimer();
    if (!liveArmed || !signedIn()) return;
    liveTimer = setTimeout(function () { liveTick(); }, ms);
  }

  function bindLiveWatch() {
    if (liveWatchBound) return;
    liveWatchBound = true;
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && liveArmed) armLiveTimer(LIVE_FOCUS_MS);
    });
    window.addEventListener("focus", function () {
      if (liveArmed) armLiveTimer(LIVE_FOCUS_MS);
    });
  }

  async function liveTick() {
    if (!liveArmed || !signedIn() || liveInFlight) return;
    liveInFlight = true;
    try {
      await refreshCards();
      liveBackoff = LIVE_IDLE_MS;
      setLiveStatus(LIVE_NOW);
    } catch (e) {
      liveBackoff = Math.min(LIVE_BACKOFF_MAX_MS, liveBackoff * 2);
      setLiveStatus(LIVE_FAIL);
    } finally {
      liveInFlight = false;
      if (liveArmed) armLiveTimer(liveBackoff);
    }
  }

  function boot() {
    ensureCss();
    paintCards([]);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
