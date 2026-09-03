(function () {
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
    });
  }
  function workspace() {
    if (typeof workspaceSlug === "function") return workspaceSlug();
    return (window.AIADesks && AIADesks.slugify(localStorage.getItem("aia_ws") || "")) || "";
  }
  function deskName(d) {
    if (!d) return "desk";
    return d.name || d.slug || "desk";
  }
  function headersFor(desk) {
    var h = { "Content-Type": "application/json" };
    if (!desk) return h;
    if (desk.slug) h["X-Workspace"] = desk.slug;
    if (desk.token) h["X-Session"] = desk.token;
    else if (desk.pin) h["X-Pin"] = desk.pin;
    return h;
  }
  function ensureCss() {
    if (document.getElementById("desk-view-css")) return;
    var css = document.createElement("style");
    css.id = "desk-view-css";
    css.textContent =
      "#desk-view{margin:0 0 10px}" +
      "#desk-view .now{color:var(--heading);font-weight:700;margin:0 0 6px}" +
      "#desk-chips{display:flex;flex-wrap:wrap;gap:6px}" +
      "#desk-chips button{min-height:40px;padding:6px 10px;border-radius:999px;font-size:12px}" +
      "#desk-chips button.on{background:var(--edit);color:var(--edit-ink);border-color:var(--teal)}" +
      "#desk-chips button.work{background:var(--orange,#f39c12);color:#0c1116;border-color:transparent}" +
      ".desk-tag{display:inline-block;margin:0 6px 6px 0;font-size:11px;font-weight:700;color:var(--teal)}" +
      ".desk-use{margin:6px 0 0}";
    document.head.appendChild(css);
  }
  function ensureDom() {
    if (document.getElementById("desk-view")) return;
    var session = document.getElementById("session");
    var box = document.createElement("div");
    box.className = "item";
    box.id = "desk-view";
    box.hidden = true;
    box.innerHTML =
      "<p class=\"now\" id=\"desk-now\">This queue</p>" +
      "<p class=\"meta\" id=\"desk-now-sub\">Tap desks to show them here. All shows every saved desk. Use makes that desk the one new work hits.</p>" +
      "<div id=\"desk-chips\"></div>";
    if (session && session.parentNode) session.parentNode.insertBefore(box, session.nextSibling);
    else {
      var main = document.querySelector("main.wrap") || document.body;
      main.insertBefore(box, main.firstChild);
    }
  }
  function counts() {
    var map = {};
    (window.JOBS || []).forEach(function (j) {
      var slug = j.slug || j.workspace || workspace();
      if (!slug) return;
      if (j.status === "shipped" || j.status === "killed") return;
      map[slug] = (map[slug] || 0) + 1;
    });
    return map;
  }
  function paintBar() {
    ensureCss();
    ensureDom();
    var box = document.getElementById("desk-view");
    var chips = document.getElementById("desk-chips");
    var now = document.getElementById("desk-now");
    var sub = document.getElementById("desk-now-sub");
    if (!box || !chips || !window.AIADesks) return;
    var rows = AIADesks.list() || [];
    var open = AIADesks.shopOpen && AIADesks.shopOpen();
    box.hidden = !open || !rows.length;
    if (box.hidden) return;
    var cur = workspace();
    var st = AIADesks.viewState ? AIADesks.viewState() : { mode: "one", slugs: [cur] };
    var selected = {};
    (AIADesks.viewDesks ? AIADesks.viewDesks() : rows).forEach(function (d) { selected[d.slug] = true; });
    var working = deskName(AIADesks.current()) || cur || "this desk";
    var viewing = AIADesks.viewLabel ? AIADesks.viewLabel() : working;
    var many = st.mode === "all" || (st.slugs || []).length > 1;
    if (now) now.textContent = many
      ? ("Queue · " + viewing + " · new work hits " + working)
      : ("This queue · " + working);
    if (sub) sub.textContent = rows.length < 2
      ? "This phone has one desk. Open another to view two queues here."
      : "Orange is the working desk. Tap a name to add it. Use switches where new work lands.";
    var n = counts();
    chips.innerHTML =
      "<button type=\"button\" class=\"" + (st.mode === "all" ? "on" : "") + "\" data-view=\"all\">All desks</button>" +
      rows.map(function (d) {
        var work = d.slug === cur;
        var onChip = !!selected[d.slug] || st.mode === "all";
        var cls = work ? "work" : (onChip ? "on" : "edit");
        var count = n[d.slug] ? " · " + n[d.slug] : "";
        var tag = work ? " · working" : "";
        return "<button type=\"button\" class=\"" + cls + "\" data-desk=\"" + esc(d.slug) + "\">" +
          esc(d.name || d.slug) + count + tag + "</button>" +
          (work ? "" : "<button type=\"button\" class=\"edit\" data-use=\"" + esc(d.slug) + "\">Use</button>");
      }).join("") +
      "<button type=\"button\" class=\"edit\" data-view=\"one\">This desk only</button>";
    var who = document.getElementById("who-line");
    if (who && many) {
      var you = localStorage.getItem("aia_name") || "";
      who.textContent = (you ? you + " · " : "") + "working " + working + " · viewing " + viewing;
    }
    var banner = document.getElementById("banner");
    if (banner && open) {
      banner.textContent = many
        ? ("Viewing " + viewing + ". New work still hits " + working + ".")
        : (working + " · drop anything. Rules apply as cards land.");
    }
  }
  async function fetchViews(here) {
    if (!window.AIADesks) return [];
    var rows = AIADesks.viewDesks ? AIADesks.viewDesks() : [];
    if (!rows.length) {
      var cur = AIADesks.current && AIADesks.current();
      if (cur && (cur.pin || cur.token)) rows = [cur];
    }
    if (!rows.length) return [];
    var bags = await Promise.all(rows.map(async function (d) {
      try {
        var r = await fetch("/api/jobs", { headers: headersFor(d) });
        var data = await r.json().catch(function () { return {}; });
        return (data.jobs || []).map(function (j) {
          return Object.assign({}, j, {
            slug: d.slug,
            workspace: d.slug,
            desk: d.name || d.slug,
            _foreign: !!(here && d.slug !== here)
          });
        });
      } catch (e) {
        return [];
      }
    }));
    return bags.reduce(function (all, part) { return all.concat(part); }, []);
  }
  function decorateCard(j, html) {
    var here = workspace();
    var slug = j.slug || j.workspace || here;
    var name = j.desk || (window.AIADesks && AIADesks.find(slug) && AIADesks.find(slug).name) || slug;
    var tag = "<span class=\"desk-tag\">" + esc(name) + "</span>";
    var use = (slug && slug !== here)
      ? "<div class=\"desk-use\"><button class=\"go\" type=\"button\" onclick=\"AIADeskView.useDesk('" + esc(slug) + "','" + esc(j.id) + "')\">Use " + esc(name) + "</button></div>"
      : "";
    if (!html) {
      return "<article class=\"item\"><div class=\"meta\">" + tag + "</div><h3>" + esc(j.title) + "</h3>" + use + "</article>";
    }
    return html.replace("<article", "<article").replace(">", ">" + tag) + use;
  }
  function paintMerged(jobs) {
    jobs = jobs || [];
    window.JOBS = jobs;
    var box = document.getElementById("queue");
    if (!box || typeof card !== "function") {
      paintBar();
      return;
    }
    var staff = (window.role || localStorage.getItem("aia_role")) === "employee";
    var open = jobs.filter(function (j) {
      return j.status !== "shipped" && j.status !== "killed";
    });
    if (!open.length) {
      paintBar();
      return;
    }
    box.innerHTML = open.map(function (j) {
      var html = card(j, staff);
      return decorateCard(j, html);
    }).join("");
    paintBar();
  }
  async function enhance() {
    if (!window.AIADesks || !AIADesks.shopOpen || !AIADesks.shopOpen()) {
      paintBar();
      return;
    }
    var here = workspace();
    var jobs = await fetchViews(here);
    paintMerged(jobs);
  }
  function tapDesk(slug) {
    if (!window.AIADesks) return;
    var cur = workspace();
    if (slug === cur) AIADesks.viewOne(slug);
    else AIADesks.toggleView(slug);
    if (typeof load === "function") load();
  }
  function useDesk(slug, id) {
    if (!window.AIADesks || !AIADesks.switchTo) return;
    if (!AIADesks.switchTo(slug)) return;
    if (AIADesks.viewOne) AIADesks.viewOne(slug);
    var wsEl = document.getElementById("ws");
    var pinEl = document.getElementById("pin");
    var row = AIADesks.find(slug) || {};
    if (wsEl) wsEl.value = row.slug || slug;
    if (pinEl) pinEl.value = row.pin || "";
    if (typeof load === "function") {
      Promise.resolve(load()).then(function () {
        if (id && typeof openJob === "function") openJob(id);
      });
    }
  }
  function onChipClick(e) {
    var all = e.target.closest("[data-view]");
    if (all) {
      if (all.getAttribute("data-view") === "all" && window.AIADesks) AIADesks.viewAll();
      if (all.getAttribute("data-view") === "one" && window.AIADesks) AIADesks.viewOne(workspace());
      if (typeof load === "function") load();
      return;
    }
    var use = e.target.closest("[data-use]");
    if (use) {
      useDesk(use.getAttribute("data-use"));
      return;
    }
    var desk = e.target.closest("[data-desk]");
    if (desk) tapDesk(desk.getAttribute("data-desk"));
  }
  function hookLoad() {
    if (typeof load !== "function" || load.__aiaView) return;
    var orig = load;
    window.load = async function () {
      await orig.apply(this, arguments);
      await enhance();
    };
    window.load.__aiaView = true;
  }
  function boot() {
    ensureCss();
    ensureDom();
    var chips = document.getElementById("desk-chips");
    if (chips && !chips.__wired) {
      chips.addEventListener("click", onChipClick);
      chips.__wired = true;
    }
    hookLoad();
    paintBar();
    if (typeof load === "function" && load.__aiaView) enhance();
  }
  window.AIADeskView = { paintBar: paintBar, enhance: enhance, useDesk: useDesk, tapDesk: tapDesk };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 0);
  setTimeout(hookLoad, 50);
})();
