/* Name a Desk AI on this desk. Yes is the only save. Stop clears the draft. Nothing is charged. */
(function () {
  var listEl = document.getElementById("list");
  var aisEl = document.getElementById("ais");
  var namedEl = document.getElementById("named");
  var draftEl = document.getElementById("draft");
  var decideEl = document.getElementById("decide");
  var okEl = document.getElementById("ok");
  var errEl = document.getElementById("err");
  if (!listEl || !draftEl) return;

  var packs = [];
  var pending = null;

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

  function hdr() {
    var h = { "Content-Type": "application/json" };
    var ws = localStorage.getItem("aia_ws") || "";
    var pin = localStorage.getItem("aia_pin") || "";
    var tok = localStorage.getItem("aia_session") || "";
    if (ws) h["X-Workspace"] = slugify(ws);
    if (tok) h["X-Session"] = tok;
    if (pin) h["X-Pin"] = pin;
    return h;
  }

  function deskOpen() {
    return !!(localStorage.getItem("aia_ws") && (localStorage.getItem("aia_session") || localStorage.getItem("aia_pin")));
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function setVal(id, v) {
    var el = document.getElementById(id);
    if (el) el.value = v == null ? "" : String(v);
  }

  function show(msg, good) {
    if (okEl) {
      okEl.style.display = good ? "block" : "none";
      okEl.textContent = good ? msg : "";
    }
    if (errEl) {
      errEl.style.display = good ? "none" : "block";
      errEl.textContent = good ? "" : msg;
    }
  }

  function ownPack(p) {
    if (!p || !p.id || p.official || p.wanted) return false;
    if (p.type === "cosmetic") return false;
    return true;
  }

  function rowsOf(p) {
    if (!p) return [];
    if (Array.isArray(p.aiRows)) return p.aiRows.filter(function (a) { return a && a.name; });
    if (Array.isArray(p.ais)) return p.ais.filter(function (a) { return a && typeof a === "object" && a.name; });
    return [];
  }

  function hideDecide() {
    pending = null;
    draftEl.classList.remove("on");
    draftEl.textContent = "";
    if (decideEl) decideEl.hidden = true;
  }

  function showDecide(text) {
    draftEl.classList.add("on");
    draftEl.textContent = text;
    if (decideEl) decideEl.hidden = false;
  }

  function paintNamed(rows) {
    if (!namedEl) return;
    rows = Array.isArray(rows) ? rows.filter(function (a) { return a && a.name; }) : [];
    if (!rows.length) {
      namedEl.innerHTML = "<p>No Desk AI named on this desk yet.</p>";
      return;
    }
    namedEl.innerHTML = rows.map(function (a) {
      return "<article class=\"pack\"><b>" + esc(a.name) + "</b>" +
        (a.does ? "<p>" + esc(a.does) + "</p>" : "") +
        "<div class=\"row\"><button type=\"button\" class=\"ghost\" data-use=\"" + esc(a.id || a.name) + "\">Use this name</button></div></article>";
    }).join("");
  }

  function paintListing(p) {
    if (!aisEl) return;
    if (!p) {
      aisEl.innerHTML = "";
      return;
    }
    var rows = rowsOf(p);
    var head = "<p>Listing: " + esc(p.name || p.id) + ". Naming does not edit this listing.</p>";
    if (!rows.length) {
      aisEl.innerHTML = head + "<p>This listing does not show a Desk AI.</p>";
      return;
    }
    aisEl.innerHTML = head + rows.map(function (a) {
      return "<article class=\"pack\"><b>" + esc(a.name) + "</b>" +
        (a.does ? "<p>" + esc(a.does) + "</p>" : "") + "</article>";
    }).join("");
  }

  function paintList() {
    if (!packs.length) {
      listEl.innerHTML = "<p>No listings on this desk yet. Naming still happens on this desk.</p>";
      return;
    }
    listEl.innerHTML = packs.map(function (p) {
      return "<article class=\"pack\"><b>" + esc(p.name || p.id) + "</b>" +
        (p.does ? "<p>" + esc(p.does) + "</p>" : "") +
        "<div class=\"row\"><button type=\"button\" class=\"ghost\" data-pack=\"" + esc(p.id) + "\">Read this listing</button></div></article>";
    }).join("");
  }

  function fillAi(a) {
    setVal("name", (a && a.name) || "");
    setVal("does", (a && a.does) || "");
    setVal("prompt", (a && a.prompt) || "");
    setVal("ai-id", (a && a.id) || "");
  }

  function clearForm() {
    fillAi(null);
  }

  async function loadPacks() {
    try {
      var r = await fetch("/api/desks?packs=1&mine=1", { headers: hdr() });
      var d = await r.json().catch(function () { return {}; });
      if (r.status === 401 || r.status === 404) {
        location.replace("/onboard");
        return;
      }
      if (!r.ok) {
        listEl.innerHTML = "<p>" + esc((d && d.error) || "Could not load listings.") + "</p>";
        return;
      }
      packs = (d.packs || []).filter(ownPack);
      paintList();
    } catch (e) {
      listEl.innerHTML = "<p>Could not reach the desk.</p>";
    }
  }

  async function loadNamed() {
    try {
      var r = await fetch("/api/desks", { headers: hdr() });
      var d = await r.json().catch(function () { return {}; });
      if (r.status === 401 || r.status === 404) {
        location.replace("/onboard");
        return;
      }
      var rows = (d && d.desk && d.desk.ais) || (d && d.ais) || [];
      paintNamed(rows);
    } catch (e) {
      paintNamed([]);
    }
  }

  function readListing(id) {
    var picked = null;
    for (var i = 0; i < packs.length; i++) {
      if (packs[i] && packs[i].id === id) picked = packs[i];
    }
    paintListing(picked);
    show(picked ? "Listing only. Naming does not edit it." : "That listing is not on this desk.", !!picked);
  }

  function useAi(key) {
    var rows = [];
    if (namedEl) {
      namedEl.querySelectorAll("[data-use]").forEach(function (btn) {
        if (btn.getAttribute("data-use") === key) rows.push(btn);
      });
    }
    var card = rows[0] && rows[0].closest(".pack");
    var name = card && card.querySelector("b") ? card.querySelector("b").textContent : "";
    var does = card && card.querySelector("p") ? card.querySelector("p").textContent : "";
    if (!name) return show("That Desk AI is not named on this desk.", false);
    hideDecide();
    fillAi({ id: key, name: name, does: does, prompt: "" });
    show("Loaded into the form. Nothing is named until you tap Yes.", true);
  }

  function stage() {
    if (!deskOpen()) {
      location.replace("/onboard");
      return;
    }
    var name = val("name");
    if (!name) return show("Name the Desk AI first. Nothing was named.", false);
    pending = {
      id: val("ai-id"),
      name: name,
      does: val("does"),
      prompt: val("prompt")
    };
    showDecide("Name \"" + name + "\" on this desk.\nNothing is named until you tap Yes. Stop clears this draft. Nothing is charged. The pack listing does not change.");
    show("", true);
    if (okEl) okEl.style.display = "none";
  }

  async function askDesk() {
    if (!deskOpen()) {
      location.replace("/onboard");
      return;
    }
    var brief = [val("name"), val("does"), val("prompt")].filter(Boolean).join(". ");
    if (!brief) return show("Say what the Desk AI should do first. Nothing was named.", false);
    var btn = document.getElementById("ask");
    if (btn) btn.disabled = true;
    try {
      var r = await fetch("/api/desks", {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ action: "studio-draft", brief: brief, kind: "ai" })
      });
      var d = await r.json().catch(function () { return {}; });
      var pack = d && d.pack;
      var rows = pack ? rowsOf(pack) : [];
      var ai = rows[0] || null;
      if (!d || !d.ok || !ai || !ai.name) {
        return show("No draft this time. You can still write it by hand. Nothing was named.", false);
      }
      var keep = val("ai-id");
      fillAi({ id: keep, name: ai.name, does: ai.does || "", prompt: ai.prompt || "" });
      show("Draft only. Nothing is named until you tap Yes.", true);
    } catch (e) {
      show("Could not reach the desk. Nothing was named.", false);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function yes() {
    if (!deskOpen()) {
      location.replace("/onboard");
      return;
    }
    if (!pending || !pending.name) return show("Nothing is waiting. Name a Desk AI first.", false);
    var btn = document.getElementById("yes");
    if (btn) btn.disabled = true;
    var body = {
      action: "save-ai",
      id: pending.id || "",
      name: pending.name,
      does: pending.does || "",
      prompt: pending.prompt || ""
    };
    try {
      var r = await fetch("/api/desks", {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify(body)
      });
      var d = await r.json().catch(function () { return {}; });
      if (r.status === 401 || r.status === 404) {
        location.replace("/onboard");
        return;
      }
      if (!r.ok || d.ok === false) {
        show((d && d.error) || "The desk did not do that. Nothing was named.", false);
        return;
      }
      hideDecide();
      clearForm();
      if (Array.isArray(d.ais)) paintNamed(d.ais);
      show("Named on this desk. The pack listing did not change. Nothing was charged.", true);
    } catch (e) {
      show("Could not reach the desk. Nothing was named.", false);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function stop() {
    hideDecide();
    show("Stopped. The draft is cleared. Nothing was named.", true);
  }

  listEl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-pack]");
    if (!btn) return;
    readListing(btn.getAttribute("data-pack"));
  });
  if (namedEl) namedEl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-use]");
    if (!btn) return;
    useAi(btn.getAttribute("data-use"));
  });
  var askBtn = document.getElementById("ask");
  if (askBtn) askBtn.addEventListener("click", askDesk);
  var stageBtn = document.getElementById("stage");
  if (stageBtn) stageBtn.addEventListener("click", stage);
  var yesBtn = document.getElementById("yes");
  if (yesBtn) yesBtn.addEventListener("click", yes);
  var stopBtn = document.getElementById("stop");
  if (stopBtn) stopBtn.addEventListener("click", stop);

  if (!deskOpen()) location.replace("/onboard");
  else {
    var line = document.getElementById("desk-line");
    if (line) line.textContent = "Yes names the Desk AI on this desk. Listings stay as they are.";
    loadNamed();
    loadPacks();
  }
})();
