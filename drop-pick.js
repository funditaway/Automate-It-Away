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
  function paint() {
    var box = document.getElementById("desk-pick");
    var chips = document.getElementById("desk-chips");
    var sub = document.getElementById("desk-pick-sub");
    if (!box || !chips) return;
    if (window !== window.parent || /embed=1/.test(location.search)) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    var rows = (window.AIADesks && AIADesks.list) ? AIADesks.list() : [];
    var cur = (window.AIADesks && AIADesks.current && AIADesks.current()) || {};
    var ws = cur.slug || localStorage.getItem("aia_ws") || "";
    if (!rows.length) {
      chips.innerHTML = "";
      if (sub) sub.textContent = "No desks on this phone yet. Add one you already opened, or create a new desk.";
      return;
    }
    if (sub) sub.textContent = "Desks saved on this phone. Tap one to drop there. Add another, or create a new desk.";
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
    if (row.pin) {
      AIADesks.switchTo(row.slug);
      goDrop(row.slug);
      return;
    }
    var add = document.getElementById("desk-add");
    if (add) add.hidden = false;
    var name = document.getElementById("add-ws");
    var err = document.getElementById("desk-err");
    if (name) name.value = row.name || row.slug;
    if (document.getElementById("add-pin")) document.getElementById("add-pin").focus();
    if (err) {
      err.style.display = "block";
      err.textContent = "Type the desk code for " + (row.name || row.slug) + ".";
    }
  }
  async function addSaved() {
    var err = document.getElementById("desk-err");
    var name = String((document.getElementById("add-ws") || {}).value || "").trim();
    var code = String((document.getElementById("add-pin") || {}).value || "").trim();
    if (err) err.style.display = "none";
    if (!name || code.length < 4) {
      if (err) { err.style.display = "block"; err.textContent = "Desk name and a 4+ digit code."; }
      return;
    }
    var slug = slugify(name);
    try {
      var r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Workspace": slug },
        body: JSON.stringify({ action: "login", slug: slug, pin: code })
      });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        if (err) { err.style.display = "block"; err.textContent = data.error || "Desk name or code does not match."; }
        return;
      }
      var ws = (data.workspace && data.workspace.slug) || slug;
      var label = (data.workspace && (data.workspace.biz || data.workspace.name)) || name;
      if (window.AIADesks) {
        AIADesks.open({ slug: ws, name: label, pin: code, role: (data.you && data.you.role) || "owner" });
      } else {
        localStorage.setItem("aia_ws", ws);
        localStorage.setItem("aia_pin", code);
        localStorage.setItem("aia_desk_name", label);
      }
      goDrop(ws);
    } catch (e) {
      if (err) { err.style.display = "block"; err.textContent = "Could not reach the desk."; }
    }
  }
  function boot() {
    var chips = document.getElementById("desk-chips");
    var toggle = document.getElementById("add-toggle");
    var openBtn = document.getElementById("add-open");
    paint();
    if (chips) chips.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-desk]");
      if (btn) pick(btn.getAttribute("data-desk"));
    });
    if (toggle) toggle.onclick = function () {
      var add = document.getElementById("desk-add");
      if (!add) return;
      add.hidden = !add.hidden;
      if (!add.hidden && document.getElementById("add-ws")) document.getElementById("add-ws").focus();
    };
    if (openBtn) openBtn.onclick = addSaved;
  }
  window.AIADropDesks = { paint: paint, pick: pick, addSaved: addSaved };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
