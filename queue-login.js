/* Queue sign-in lands here. One account, one Queue, many desks.
   The desk list is POST /api/desks { action: "mine" }.
   A desk filter is the ?workspace= query on this same page.
   All desks reads each desk from that list. A future all-desks read is
   detected and used only when the response says it is one. */
(function () {
  var ALL_BANNER = "Every desk in this Queue.";
  var desks = [];
  var cards = [];
  var mode = "all";

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
    if (s === "waiting") return "Ready";
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

  function paintCards(rows) {
    var box = document.getElementById("queue-all-cards");
    if (!box) return;
    box.replaceChildren();
    if (!signedIn()) {
      var need = document.createElement("p");
      need.className = "meta";
      need.textContent = "Sign in to your Queue to see cards from every desk.";
      box.appendChild(need);
      return;
    }
    var open = (rows || []).filter(openCard);
    if (!open.length) {
      var empty = document.createElement("p");
      empty.className = "meta";
      var named = mode !== "all" ? deskBySlug(mode) : null;
      empty.textContent = !desks.length
        ? "No desks in this Queue yet. Add a desk to start."
        : (named ? ("Nothing waiting on " + named.name + ".") : "Nothing waiting in this Queue.");
      box.appendChild(empty);
      return;
    }
    open.forEach(function (j) {
      var card = document.createElement("article");
      card.className = "item";
      var meta = document.createElement("p");
      meta.className = "meta";
      var deskName = j.deskName || j.workspace || "Desk";
      meta.textContent = deskName + " · " + plainStatus(j.status);
      var title = document.createElement("h3");
      title.textContent = j.title || "Card";
      var next = document.createElement("p");
      next.className = "meta";
      next.textContent = j.needLine || j.next || "Pick this desk in the Queue to decide.";
      var go = document.createElement("button");
      go.type = "button";
      go.setAttribute("data-queue-desk", j.deskSlug || j.workspace || "");
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
        body: JSON.stringify({ action: "mine" })
      });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok || !data || data.ok === false) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  // Future all-desks read. Ignored unless the body says it covers the account.
  async function readAllDesks() {
    var tok = "";
    try { tok = localStorage.getItem("aia_session") || ""; } catch (e) {}
    if (!tok) return null;
    try {
      var r = await fetch("/api/jobs?scope=account", {
        headers: { "Accept": "application/json", "X-Session": tok }
      });
      if (!r.ok) return null;
      var data = await r.json().catch(function () { return null; });
      if (!data) return null;
      if (data.allDesks !== true && data.scope !== "account" && data.queue !== "all") return null;
      var rows = Array.isArray(data.jobs) ? data.jobs : (Array.isArray(data.items) ? data.items : null);
      return rows;
    } catch (e) {
      return null;
    }
  }

  async function jobsForDesk(desk) {
    try {
      var r = await fetch("/api/jobs?workspace=" + encodeURIComponent(desk.slug), {
        headers: headersFor(desk.slug)
      });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok || !data || !Array.isArray(data.jobs)) return [];
      return data.jobs.map(function (j) {
        return {
          id: j.id,
          title: j.title || "Card",
          status: j.status || "",
          next: j.next || "",
          needLine: j.needLine || "",
          workspace: j.workspace || desk.slug,
          deskSlug: j.workspace || desk.slug,
          deskName: desk.name || desk.slug
        };
      });
    } catch (e) {
      return [];
    }
  }

  async function refreshCards() {
    var future = await readAllDesks();
    if (future) {
      cards = future.map(function (j) {
        var slug = slugify(j.workspace || j.desk || j.slug || "");
        var known = deskBySlug(slug);
        return {
          id: j.id,
          title: j.title || "Card",
          status: j.status || "",
          next: j.next || "",
          needLine: j.needLine || "",
          workspace: slug,
          deskSlug: slug,
          deskName: j.deskName || (known && known.name) || slug || "Desk"
        };
      });
    } else {
      cards = [];
      for (var i = 0; i < desks.length; i++) {
        var rows = await jobsForDesk(desks[i]);
        rows.forEach(function (row) { cards.push(row); });
      }
    }
    paintCards(visibleCards());
  }

  function visibleCards() {
    if (mode === "all") return cards;
    return cards.filter(function (j) { return (j.deskSlug || j.workspace) === mode; });
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
    paintCards(visibleCards());
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
    var mine = await loadMine();
    desks = mine ? fromMine(mine) : fromPhone();
    if (!desks.length) desks = fromPhone();
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
