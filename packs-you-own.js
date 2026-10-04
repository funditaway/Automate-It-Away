/* Packs already on this account. List only. Nothing is saved from this page. */
(function () {
  var listEl = document.getElementById("list");
  if (!listEl) return;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      if (c === "&") return "&" + "amp;";
      if (c === "<") return "&" + "lt;";
      if (c === ">") return "&" + "gt;";
      if (c === "\"") return "&" + "quot;";
      return "&" + "#39;";
    });
  }

  function slugify(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  }

  function hdr(ws) {
    var h = { "Content-Type": "application/json" };
    var slug = slugify(ws || localStorage.getItem("aia_ws") || "");
    var pin = localStorage.getItem("aia_pin") || "";
    var tok = localStorage.getItem("aia_session") || "";
    if (slug) h["X-Workspace"] = slug;
    if (tok) h["X-Session"] = tok;
    if (pin) h["X-Pin"] = pin;
    return h;
  }

  function deskName(d) {
    return (d && (d.name || d.biz || d.slug)) || "this desk";
  }

  function remember(map, id, name, note) {
    var key = String(id || "").trim();
    if (!key) return;
    if (!map[key]) map[key] = { id: key, name: name || key, notes: [] };
    if (name && (map[key].name === key || !map[key].name)) map[key].name = name;
    if (note && map[key].notes.indexOf(note) < 0) map[key].notes.push(note);
  }

  function belongs(p, slug) {
    if (!p || !p.id || p.wanted || p.official) return false;
    if (p.type === "cosmetic") return false;
    var vis = String(p.visibility || p.status || "").toLowerCase();
    if (String(p.creatorId || "") === slug) return true;
    return vis === "private" || vis === "draft";
  }

  function paint(rows) {
    if (!rows.length) {
      listEl.innerHTML = "<p>No packs on this account yet.</p>";
      return;
    }
    listEl.innerHTML = rows.map(function (p) {
      var notes = (p.notes || []).map(function (n) { return "<p>" + esc(n) + "</p>"; }).join("");
      return "<article class=\"pack\"><b>" + esc(p.name || p.id) + "</b>" + notes + "</article>";
    }).join("");
  }

  async function load() {
    var line = document.getElementById("desk-line");
    try {
      var r = await fetch("/api/desks", {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ action: "mine" })
      });
      var data = await r.json().catch(function () { return {}; });
      if (r.status === 401 || r.status === 403) {
        if (line) line.textContent = "Open a desk you own to see packs on this account.";
        listEl.innerHTML = "<p><a href=\"/desks\">Your desks</a></p>";
        return;
      }
      if (!r.ok || !data || data.ok === false) {
        listEl.innerHTML = "<p>" + esc((data && data.error) || "Could not load packs on this account.") + "</p>";
        return;
      }
      var owned = Array.isArray(data.owned) ? data.owned.slice(0, 32) : [];
      if (line) {
        var accountName = data.account && data.account.name;
        line.textContent = accountName
          ? ("Packs already on " + accountName + ".")
          : "Packs already on this account.";
      }
      var map = {};
      owned.forEach(function (d) {
        if (!d || !d.pack) return;
        remember(map, d.pack, d.packName || d.pack, "On " + deskName(d));
      });
      var lists = await Promise.all(owned.map(function (d) {
        if (!d || !d.slug) return Promise.resolve(null);
        return fetch("/api/desks?packs=1&mine=1", { headers: hdr(d.slug) })
          .then(function (res) { return res.ok ? res.json() : null; })
          .then(function (body) { return { slug: d.slug, name: deskName(d), body: body }; })
          .catch(function () { return null; });
      }));
      lists.forEach(function (row) {
        if (!row || !row.body) return;
        var packs = row.body.packs || [];
        var names = {};
        packs.forEach(function (p) {
          if (p && p.id) names[p.id] = p.name || p.id;
        });
        Object.keys(map).forEach(function (id) {
          if (names[id] && map[id].name === id) map[id].name = names[id];
        });
        packs.forEach(function (p) {
          if (!belongs(p, row.slug)) return;
          var where = String(p.visibility || p.status || "").toLowerCase();
          var note = (where === "listed" || where === "published" || where === "submitted")
            ? ("A listing on " + row.name)
            : ("Saved on " + row.name);
          remember(map, p.id, p.name || p.id, note);
        });
      });
      var rows = Object.keys(map).map(function (k) { return map[k]; });
      rows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      paint(rows);
    } catch (e) {
      listEl.innerHTML = "<p>Could not reach the desk.</p>";
    }
  }

  load();
})();
