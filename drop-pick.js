(function () {
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
    });
  }
  function slugify(s) {
    if (window.AIADesks) return AIADesks.slugify(s);
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  }
  function goDrop(slug) {
    var use = slugify(slug);
    location.href = use ? ("/drop?ws=" + encodeURIComponent(use)) : "/drop";
  }
  function paintSearch(rows, accounts, q) {
    var box = document.getElementById("public-desk-hits");
    if (!box) return;
    var desks = Array.isArray(rows) ? rows : [];
    var acc = Array.isArray(accounts) ? accounts : [];
    if (!desks.length && !acc.length) {
      box.innerHTML = q ? "<p class=\"sub\">No public world desk or account matches that. Private desks stay off this list.</p>" : "<p class=\"sub\">No listed world desks yet. An owner can list theirs. Private desks stay off this list.</p>";
      return;
    }
    var accHtml = acc.length ? acc.map(function (a) {
      var label = esc(a.account || a.name || a.slug);
      var extra = a.name && a.account && a.name !== a.account ? " · " + esc(a.name) : "";
      return "<button type=\"button\" data-public-desk=\"" + esc(a.slug) + "\" data-world=\"account\">" + label + extra + " · account</button>";
    }).join("") : "";
    var deskHtml = desks.map(function (d) {
      var bits = [esc(d.name || d.slug)];
      if (d.account && d.account !== d.name) bits.push(esc(d.account));
      if (d.city) bits.push(esc(d.city));
      if (d.does) bits.push(esc(d.does));
      return "<button type=\"button\" data-public-desk=\"" + esc(d.slug) + "\" data-world=\"desk\">" + bits.join(" · ") + "</button>";
    }).join("");
    box.innerHTML = (accHtml ? "<p class=\"sub\">World accounts</p>" + accHtml : "") + (deskHtml ? "<p class=\"sub\">World desks</p>" + deskHtml : "");
  }
  async function searchPublic(q) {
    try {
      var r = await fetch("/api/desks?listed=1&q=" + encodeURIComponent(q || ""));
      var data = await r.json().catch(function () { return {}; });
      paintSearch((data && data.desks) || [], (data && data.accounts) || [], q);
    } catch (e) { paintSearch([], [], q); }
  }
  function injectSearch() {
    if (document.getElementById("public-desk-q")) return;
    if (window !== window.parent || /embed=1/.test(location.search)) return;
    var wrap = document.createElement("div");
    wrap.id = "public-desk-search";
    wrap.className = "card desk-pick";
    wrap.innerHTML = "<strong style=\"color:var(--heading)\">World users · accounts · desks</strong><label>Find a public desk</label><input id=\"public-desk-q\" placeholder=\"Desk, account, or city\" autocomplete=\"off\"><p class=\"sub\">Listed world desks and accounts first. Private desks stay off this list.</p><div class=\"desk-chips\" id=\"public-desk-hits\"></div>";
    var main = document.querySelector("main.wrap");
    var title = document.getElementById("drop-title");
    var sub = document.getElementById("drop-sub");
    var banner = document.getElementById("drop-on");
    var after = banner || sub || title;
    if (main && after && after.parentNode === main) {
      after.parentNode.insertBefore(wrap, after.nextSibling);
    } else {
      var box = document.getElementById("desk-pick");
      if (box) box.insertBefore(wrap, box.firstChild);
      else return;
    }
    var input = document.getElementById("public-desk-q");
    var hits = document.getElementById("public-desk-hits");
    var timer = null;
    if (input) input.addEventListener("input", function () {
      var q = String(input.value || "").trim();
      clearTimeout(timer);
      timer = setTimeout(function () { searchPublic(q); }, 220);
    });
    if (hits) hits.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-public-desk]");
      if (btn) goDrop(btn.getAttribute("data-public-desk"));
    });
    searchPublic("");
  }
  function paint() {
    var box = document.getElementById("desk-pick");
    var chips = document.getElementById("desk-chips");
    var sub = document.getElementById("desk-pick-sub");
    if (!box || !chips) return;
    if (window !== window.parent || /embed=1/.test(location.search)) { box.hidden = true; return; }
    box.hidden = false;
    var rows = (window.AIADesks && AIADesks.list) ? AIADesks.list() : [];
    var cur = (window.AIADesks && AIADesks.current && AIADesks.current()) || {};
    var ws = cur.slug || localStorage.getItem("aia_ws") || "";
    if (!rows.length) {
      chips.innerHTML = "";
      if (sub) sub.textContent = "This phone has no saved desk yet. Pick a world desk above, add one you already opened, or create a new desk.";
      return;
    }
    if (sub) sub.textContent = "Desks saved on this phone. World desks stay at the top.";
    chips.innerHTML = rows.map(function (d) {
      var on = d.slug === ws ? " on" : "";
      var who = d.role === "owner" ? " · owner" : d.role === "employee" ? " · helper" : "";
      return "<button type=\"button\" class=\"" + on.trim() + "\" data-desk=\"" + esc(d.slug) + "\">" +
        esc(d.name || d.slug) + who + (d.slug === ws ? " · this desk" : "") + "</button>";
    }).join("");
  }
  function pick(slug) {
    var row = window.AIADesks ? AIADesks.find(slug) : null;
    if (!row) return;
    if ((window.AIADesks && AIADesks.hasAuth && AIADesks.hasAuth(row)) || row.pin || row.token) {
      if (window.AIADesks && AIADesks.switchTo) AIADesks.switchTo(row.slug);
      goDrop(row.slug);
      return;
    }
    var add = document.getElementById("desk-add"); if (add) add.hidden = false;
    var name = document.getElementById("add-ws"); var err = document.getElementById("desk-err");
    if (name) name.value = row.name || row.slug;
    if (document.getElementById("add-pin")) document.getElementById("add-pin").focus();
    if (err) { err.style.display = "block"; err.textContent = "Type the desk code for " + (row.name || row.slug) + "."; }
  }
  async function addSaved() {
    var err = document.getElementById("desk-err");
    var name = String((document.getElementById("add-ws") || {}).value || "").trim();
    var code = String((document.getElementById("add-pin") || {}).value || "").trim();
    if (err) err.style.display = "none";
    if (!name || code.length < 4) { if (err) { err.style.display = "block"; err.textContent = "Desk name and a 4+ digit code."; } return; }
    var slug = slugify(name);
    try {
      var r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json", "X-Workspace": slug }, body: JSON.stringify({ action: "login", slug: slug, pin: code }) });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok) { if (err) { err.style.display = "block"; err.textContent = data.error || "Desk name or code does not match."; } return; }
      var ws = (data.workspace && data.workspace.slug) || slug;
      var label = (data.workspace && (data.workspace.biz || data.workspace.name)) || name;
      if (window.AIADesks) AIADesks.open({ slug: ws, name: label, pin: code, role: (data.you && data.you.role) || "owner" });
      else { localStorage.setItem("aia_ws", ws); localStorage.setItem("aia_pin", code); localStorage.setItem("aia_desk_name", label); }
      goDrop(ws);
    } catch (e) { if (err) { err.style.display = "block"; err.textContent = "Could not reach the desk."; } }
  }
  function paintOwnerListToggle() {
    var box = document.getElementById("desk-pick");
    if (!box || document.getElementById("list-public-btn")) return;
    var cur = (window.AIADesks && AIADesks.current && AIADesks.current()) || null;
    if (!cur || !cur.slug) return;
    if (cur.role && cur.role !== "owner") return;
    var btn = document.createElement("button");
    btn.type = "button"; btn.id = "list-public-btn"; btn.className = "ghost"; btn.style.width = "auto";
    btn.textContent = "List this desk in public search";
    var actions = box.querySelector(".desk-actions");
    if (actions) actions.appendChild(btn); else box.appendChild(btn);
    btn.onclick = async function () {
      var err = document.getElementById("desk-err");
      try {
        var headers = { "Content-Type": "application/json" };
        if (window.AIADesks && AIADesks.authHeaders) headers = AIADesks.authHeaders();
        var r = await fetch("/api/desks", { method: "POST", headers: headers, body: JSON.stringify({ action: "listed", listed: true, slug: cur.slug }) });
        var data = await r.json().catch(function () { return {}; });
        if (!r.ok) { if (err) { err.style.display = "block"; err.textContent = data.error || "Owner only."; } return; }
        btn.textContent = "Listed in public search";
        searchPublic((document.getElementById("public-desk-q") || {}).value || "");
      } catch (e) { if (err) { err.style.display = "block"; err.textContent = "Could not list this desk."; } }
    };
  }
  function boot() {
    var chips = document.getElementById("desk-chips");
    var toggle = document.getElementById("add-toggle");
    var openBtn = document.getElementById("add-open");
    injectSearch(); paint(); paintOwnerListToggle();
    if (chips) chips.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-desk]"); if (btn) pick(btn.getAttribute("data-desk"));
    });
    if (toggle) toggle.onclick = function () {
      var add = document.getElementById("desk-add"); if (!add) return;
      add.hidden = !add.hidden;
      if (!add.hidden && document.getElementById("add-ws")) document.getElementById("add-ws").focus();
    };
    if (openBtn) openBtn.onclick = addSaved;
  }
  window.AIADropDesks = { paint: paint, pick: pick, addSaved: addSaved, searchPublic: searchPublic };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
