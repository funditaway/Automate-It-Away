/* Desk AIs on this pack. A Desk AI may draft. Yes is the only save. Stop clears the draft. Nothing is charged. */
(function () {
  var listEl = document.getElementById("list");
  var aisEl = document.getElementById("ais");
  var draftEl = document.getElementById("draft");
  var decideEl = document.getElementById("decide");
  var okEl = document.getElementById("ok");
  var errEl = document.getElementById("err");
  var pickedEl = document.getElementById("picked");
  if (!listEl || !draftEl) return;

  var packs = [];
  var picked = null;
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

  function paintAis() {
    if (!aisEl) return;
    var rows = rowsOf(picked);
    if (!picked) {
      aisEl.innerHTML = "";
      return;
    }
    if (!rows.length) {
      aisEl.innerHTML = "<p>No Desk AI on this pack yet. Name one below. Nothing is saved until you tap Yes.</p>";
      return;
    }
    aisEl.innerHTML = rows.map(function (a) {
      return "<article class=\"pack\"><b>" + esc(a.name) + "</b>" +
        (a.does ? "<p>" + esc(a.does) + "</p>" : "") +
        "<div class=\"row\"><button type=\"button\" class=\"ghost\" data-use=\"" + esc(a.id || a.name) + "\">Use this name</button></div></article>";
    }).join("");
  }

  function paintList() {
    if (!packs.length) {
      listEl.innerHTML = "<p>No packs on this desk yet.</p>";
      return;
    }
    listEl.innerHTML = packs.map(function (p) {
      var n = rowsOf(p).length;
      return "<article class=\"pack\"><b>" + esc(p.name || p.id) + "</b>" +
        "<p>" + esc(n ? (n + " Desk AI" + (n === 1 ? "" : "s")) : "No Desk AI yet") + (p.does ? (" · " + esc(p.does)) : "") + "</p>" +
        "<div class=\"row\"><button type=\"button\" class=\"ghost\" data-pack=\"" + esc(p.id) + "\">Use this pack</button></div></article>";
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

  async function load() {
    var line = document.getElementById("desk-line");
    if (!deskOpen()) {
      location.replace("/onboard");
      return;
    }
    if (line) line.textContent = "These packs are on this desk. Pick one, then name a Desk AI.";
    try {
      var r = await fetch("/api/desks?packs=1&mine=1", { headers: hdr() });
      var d = await r.json().catch(function () { return {}; });
      if (r.status === 401 || r.status === 404) {
        location.replace("/onboard");
        return;
      }
      if (!r.ok) {
        listEl.innerHTML = "<p>" + esc((d && d.error) || "Could not load your packs.") + "</p>";
        return;
      }
      packs = (d.packs || []).filter(ownPack);
      paintList();
    } catch (e) {
      listEl.innerHTML = "<p>Could not reach the desk.</p>";
    }
  }

  function pick(id) {
    hideDecide();
    picked = null;
    for (var i = 0; i < packs.length; i++) {
      if (packs[i] && packs[i].id === id) picked = packs[i];
    }
    clearForm();
    if (pickedEl) {
      pickedEl.textContent = picked
        ? ("Pack: " + (picked.name || picked.id) + ". Name a Desk AI below. Nothing is saved until you tap Yes.")
        : "Pick a pack first. Nothing is saved until you tap Yes.";
    }
    paintAis();
    show(picked ? "Pack picked. Nothing was saved." : "That pack is not on this desk.", !!picked);
  }

  function useAi(key) {
    var rows = rowsOf(picked);
    var hit = null;
    for (var i = 0; i < rows.length; i++) {
      var a = rows[i];
      if ((a.id || a.name) === key) hit = a;
    }
    if (!hit) return show("That Desk AI is not on this pack.", false);
    hideDecide();
    fillAi(hit);
    show("Loaded into the form. Nothing is saved until you tap Yes.", true);
  }

  function stage() {
    if (!deskOpen()) {
      location.replace("/onboard");
      return;
    }
    if (!picked || !picked.id) return show("Pick a pack first. Nothing was saved.", false);
    var name = val("name");
    if (!name) return show("Name the Desk AI first. Nothing was saved.", false);
    pending = {
      id: val("ai-id"),
      name: name,
      does: val("does"),
      prompt: val("prompt")
    };
    showDecide("Name \"" + name + "\" on " + (picked.name || picked.id) + ".\nNothing is saved until you tap Yes. Stop clears this draft and saves nothing. Nothing is charged.");
    show("", true);
    if (okEl) okEl.style.display = "none";
  }

  async function askDesk() {
    if (!deskOpen()) {
      location.replace("/onboard");
      return;
    }
    if (!picked) return show("Pick a pack first. Nothing was saved.", false);
    var brief = [picked.name, val("name"), val("does"), val("prompt")].filter(Boolean).join(". ");
    if (!brief) return show("Say what the Desk AI should do first. Nothing was saved.", false);
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
        return show("No draft this time. You can still write it by hand. Nothing was saved.", false);
      }
      var keep = val("ai-id");
      fillAi({ id: keep, name: ai.name, does: ai.does || "", prompt: ai.prompt || "" });
      show("Draft only. Nothing is saved until you tap Yes.", true);
    } catch (e) {
      show("Could not reach the desk. Nothing was saved.", false);
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
    if (!picked || !picked.id) return show("Pick a pack first. Nothing was saved.", false);
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
        show((d && d.error) || "The desk did not do that. Nothing was saved.", false);
        return;
      }
      hideDecide();
      clearForm();
      show("Saved. Nothing was charged.", true);
      await load();
      picked = null;
      if (pickedEl) pickedEl.textContent = "Pick a pack first. Nothing is saved until you tap Yes.";
      if (aisEl) aisEl.innerHTML = "";
    } catch (e) {
      show("Could not reach the desk. Nothing was saved.", false);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function stop() {
    hideDecide();
    show("Stopped. The draft is cleared. Nothing was saved.", true);
  }

  listEl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-pack]");
    if (!btn) return;
    pick(btn.getAttribute("data-pack"));
  });
  if (aisEl) aisEl.addEventListener("click", function (e) {
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
  else load();
})();
