/* #266 Your packs — ownership chrome + put on one / more desks.
   Wire existing use-pack / unlist-pack / packs GET only. No Market invent. No silent money. */
(function () {
  var list = document.getElementById("pack-list");
  var listedBox = document.getElementById("listed-list");
  var err = document.getElementById("err");
  var ok = document.getElementById("ok");
  var banner = document.getElementById("banner");
  var activePack = "";
  var PACKS = [];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({
        "&": "&" + "amp;",
        "<": "&" + "lt;",
        ">": "&" + "gt;",
        '"': "&" + "quot;",
        "'": "&#39;"
      })[c];
    });
  }

  function fail(msg) {
    if (err) { err.style.display = "block"; err.textContent = msg || "Could not update packs."; }
    if (ok) ok.style.display = "none";
  }
  function done(msg) {
    if (ok) { ok.style.display = "block"; ok.textContent = msg || "Done."; }
    if (err) err.style.display = "none";
  }

  function desks() {
    if (window.AIADesks && typeof AIADesks.list === "function") {
      return AIADesks.list().filter(function (d) {
        return d && d.slug && (d.pin || d.token);
      });
    }
    var slug = localStorage.getItem("aia_ws");
    var pin = localStorage.getItem("aia_pin");
    var tok = localStorage.getItem("aia_session");
    if (!slug || (!pin && !tok)) return [];
    return [{
      slug: slug,
      name: localStorage.getItem("aia_desk_name") || slug,
      pin: pin || "",
      token: tok || ""
    }];
  }

  function hdrFor(desk) {
    var h = { "Content-Type": "application/json" };
    if (!desk) {
      var ws = localStorage.getItem("aia_ws");
      var pin = localStorage.getItem("aia_pin");
      var tok = localStorage.getItem("aia_session");
      if (ws) h["X-Workspace"] = ws;
      if (tok) h["X-Session"] = tok;
      if (pin) h["X-Pin"] = pin;
      return h;
    }
    h["X-Workspace"] = desk.slug;
    if (desk.token) h["X-Session"] = desk.token;
    if (desk.pin) h["X-Pin"] = desk.pin;
    return h;
  }

  function priceOf(p) {
    if (p.priced && Number(p.ask) > 0) return "Ask $" + p.ask + " · money off until Yes";
    if (p.official) return "AIA · free";
    return "Free listed";
  }

  function deskPickHtml(id) {
    var rows = desks();
    if (!rows.length) {
      return "<p class=\"hint\">Open a desk as owner first. Then pick desks here.</p>" +
        "<div class=\"row\"><a class=\"ghost\" href=\"/desks\">Desks</a><a class=\"ghost\" href=\"/onboard\">Open a desk</a></div>";
    }
    var boxes = rows.map(function (d) {
      return "<label><input type=\"checkbox\" data-desk=\"" + esc(d.slug) + "\" checked> " +
        esc(d.name || d.slug) + "</label>";
    }).join("");
    return "<p class=\"hint\">Pick one desk or more. A pack can change how each desk works.</p>" +
      "<div class=\"desk-pick\">" + boxes + "</div>" +
      "<div class=\"row\">" +
      "<button type=\"button\" class=\"go\" data-put=\"" + esc(id) + "\">Put on desks</button>" +
      "<button type=\"button\" class=\"ghost\" data-cancel-pick=\"" + esc(id) + "\">Stop</button>" +
      "</div>";
  }

  function packRow(p) {
    var tag = priceOf(p);
    var wanted = p.wanted || p.use === "make";
    var btn = wanted
      ? "<a class=\"go\" href=\"/create?kind=pack&idea=" + encodeURIComponent(p.id) + "\">Make this pack</a>"
      : "<button type=\"button\" class=\"go\" data-activate=\"" + esc(p.id) + "\">Put on a desk</button>";
    return "<div class=\"pack-row\" data-pack=\"" + esc(p.id) + "\">" +
      "<b>" + esc(p.name) + "</b>" +
      "<p class=\"meta\">" + esc(p.family || "") + " · " + esc(tag) + (p.official ? " · Official" : "") + "</p>" +
      "<p class=\"hint\">" + esc(p.does || "") + "</p>" +
      "<div class=\"row\">" + btn +
      "<button type=\"button\" class=\"ghost\" data-multi=\"" + esc(p.id) + "\">Put on more desks</button>" +
      "<a class=\"ghost\" href=\"/market?pack=" + encodeURIComponent(p.id) + "\">View listing</a>" +
      "</div>" +
      "<div class=\"desk-pick\" id=\"pick-" + esc(p.id) + "\" hidden></div>" +
      "</div>";
  }

  function listedRow(p) {
    return "<div class=\"pack-row\">" +
      "<b>" + esc(p.name) + "</b>" +
      "<p class=\"meta\">" + (p.priced ? ("ask $" + esc(p.ask)) : "free") +
      " · " + esc(p.visibility || p.status || "listed") + "</p>" +
      "<div class=\"row\">" +
      "<button type=\"button\" class=\"go\" data-activate=\"" + esc(p.id) + "\">Put on a desk</button>" +
      "<button type=\"button\" class=\"ghost\" data-unlist=\"" + esc(p.id) + "\">Unlist</button>" +
      "<a class=\"ghost\" href=\"/create?kind=pack&idea=" + encodeURIComponent(p.id) + "\">Edit listing</a>" +
      "</div></div>";
  }

  function showPick(packId) {
    activePack = packId;
    var box = document.getElementById("pick-" + packId);
    if (!box) return;
    box.hidden = false;
    box.innerHTML = deskPickHtml(packId);
  }

  function hidePick(packId) {
    var box = document.getElementById("pick-" + packId);
    if (box) { box.hidden = true; box.innerHTML = ""; }
    if (activePack === packId) activePack = "";
  }

  function selectedDesks(root) {
    var out = [];
    var map = {};
    desks().forEach(function (d) { map[d.slug] = d; });
    (root || document).querySelectorAll("input[data-desk]:checked").forEach(function (el) {
      var slug = el.getAttribute("data-desk");
      if (slug && map[slug]) out.push(map[slug]);
    });
    return out;
  }

  async function putOnDesks(packId, chosen) {
    if (!packId) return fail("Pick a pack first.");
    if (!chosen || !chosen.length) return fail("Pick at least one desk you own.");
    var notes = [];
    var i;
    for (i = 0; i < chosen.length; i++) {
      var desk = chosen[i];
      try {
        var r = await fetch("/api/desks", {
          method: "POST",
          headers: hdrFor(desk),
          body: JSON.stringify({ action: "use-pack", id: packId })
        });
        var data = await r.json().catch(function () { return {}; });
        if (r.status === 409) {
          notes.push((desk.name || desk.slug) + ": make this pack first");
          continue;
        }
        if (!r.ok) {
          notes.push((desk.name || desk.slug) + ": " + (data.error || "could not put pack on"));
          continue;
        }
        notes.push((desk.name || desk.slug) + ": " + (data.already ? "already on" : "on"));
      } catch (e) {
        notes.push((desk.name || desk.slug) + ": could not reach desk");
      }
    }
    hidePick(packId);
    done("Put on desks. " + notes.join(" · ") + " You still tap Yes or Stop. Money stays off until Yes. Packs do not send money.");
  }

  async function unlistPack(id) {
    var cur = desks()[0];
    if (!cur) return fail("Open a desk as owner to unlist.");
    var r = await fetch("/api/desks", {
      method: "POST",
      headers: hdrFor(cur),
      body: JSON.stringify({ action: "unlist-pack", id: id })
    });
    var data = await r.json().catch(function () { return {}; });
    if (!r.ok) return fail(data.error || "Could not unlist that pack.");
    done(data.note || "Pack is private again. Off the public list.");
    loadPacks();
  }

  async function shellActivate(kind) {
    var pick = document.getElementById("pick-" + kind);
    if (!pick) return;
    pick.hidden = false;
    pick.innerHTML = deskPickHtml(kind) +
      "<p class=\"hint\" id=\"shell-note-" + esc(kind) + "\">Shell only until this pack is listed. No live keys. Money stays off.</p>";
  }

  async function shellPut(kind, chosen) {
    if (!chosen || !chosen.length) return fail("Pick at least one desk you own.");
    // Try known free ids only — never invent Market / Collect / keys.
    var tryIds = kind === "muse"
      ? ["muse", "muse-pack", "muse-v1"]
      : ["meta", "meta-official", "meta-creator-studio"];
    var found = null;
    var catalog = PACKS || [];
    var t;
    for (t = 0; t < tryIds.length; t++) {
      var id = tryIds[t];
      if (catalog.some(function (p) { return p && p.id === id; })) { found = id; break; }
    }
    if (!found) {
      done((kind === "muse" ? "Muse Pack" : "Meta Official Packs") +
        " shell is ready. Pack not listed on this account yet — no charge, no keys. When it lands, Yes → pick desks puts it on.");
      hidePick(kind);
      return;
    }
    return putOnDesks(found, chosen);
  }

  function paintPacks(rows) {
    PACKS = rows || [];
    var freeish = PACKS.filter(function (p) {
      return p && !p.wanted && (p.official || !p.priced || Number(p.ask) === 0);
    });
    var rest = PACKS.filter(function (p) {
      return p && !p.wanted && freeish.indexOf(p) < 0;
    });
    var show = freeish.concat(rest).slice(0, 40);
    if (!list) return;
    if (!show.length) {
      list.innerHTML = "<p class=\"hint\">No packs yet. Install a free pack from Packs, or list one in Studio.</p>";
    } else {
      list.innerHTML = show.map(packRow).join("");
    }
    var mine = PACKS.filter(function (p) { return p && !p.official && !p.wanted; });
    if (listedBox) {
      listedBox.innerHTML = mine.length
        ? mine.map(listedRow).join("")
        : "<p class=\"hint\">No creator listings from this desk yet. List one on Create.</p>";
    }
  }

  async function loadPacks() {
    var cur = desks()[0];
    try {
      var url = "/api/desks?packs=1";
      var r = await fetch(url, { headers: hdrFor(cur) });
      var data = await r.json().catch(function () { return {}; });
      paintPacks(data.packs || []);
      if (banner) {
        var n = desks().length;
        banner.textContent = n
          ? ("Desks on this phone: " + n + ". Put a pack on one desk or more. You still tap Yes or Stop.")
          : "Open a desk as owner to put a pack on it. You still tap Yes or Stop on the queue.";
      }
    } catch (e) {
      fail("Could not load packs.");
    }
  }

  document.getElementById("main").addEventListener("click", function (e) {
    var yesShell = e.target.closest("[data-yes-shell]");
    if (yesShell) {
      e.preventDefault();
      shellActivate(yesShell.getAttribute("data-yes-shell"));
      return;
    }
    var stopShell = e.target.closest("[data-stop-shell]");
    if (stopShell) {
      e.preventDefault();
      hidePick(stopShell.getAttribute("data-stop-shell"));
      done("Stopped. Nothing put on a desk.");
      return;
    }
    var act = e.target.closest("[data-activate]");
    if (act) {
      e.preventDefault();
      var one = desks();
      if (one.length === 1) {
        putOnDesks(act.getAttribute("data-activate"), one);
      } else {
        showPick(act.getAttribute("data-activate"));
      }
      return;
    }
    var multi = e.target.closest("[data-multi]");
    if (multi) {
      e.preventDefault();
      showPick(multi.getAttribute("data-multi"));
      return;
    }
    var put = e.target.closest("[data-put]");
    if (put) {
      e.preventDefault();
      var pid = put.getAttribute("data-put");
      var root = document.getElementById("pick-" + pid) || put.closest(".pack-row") || document;
      var chosen = selectedDesks(root);
      if (pid === "muse" || pid === "meta") shellPut(pid, chosen);
      else putOnDesks(pid, chosen);
      return;
    }
    var cancel = e.target.closest("[data-cancel-pick]");
    if (cancel) {
      e.preventDefault();
      hidePick(cancel.getAttribute("data-cancel-pick"));
      return;
    }
    var unlist = e.target.closest("[data-unlist]");
    if (unlist) {
      e.preventDefault();
      unlistPack(unlist.getAttribute("data-unlist"));
    }
  });

  if (window.AIADesks && typeof AIADesks.remember === "function") AIADesks.remember();
  loadPacks();
})();
