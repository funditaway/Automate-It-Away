/* Your pack listings. A Desk AI may draft. Yes saves or removes. Stop cancels. Nothing is charged. */
(function () {
  var listEl = document.getElementById("list");
  var draftEl = document.getElementById("draft");
  var decideEl = document.getElementById("decide");
  var okEl = document.getElementById("ok");
  var errEl = document.getElementById("err");
  var titleEl = document.getElementById("form-title");
  var stageBtn = document.getElementById("stage");
  if (!listEl || !draftEl) return;

  var loaded = null;
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

  function whereOf(p) {
    var vis = String((p && (p.visibility || p.status)) || "").toLowerCase();
    if (vis === "listed" || vis === "published" || vis === "submitted") return "On the public list";
    return "On this desk only";
  }

  function ownPack(p) {
    if (!p || !p.id || p.official || p.wanted) return false;
    if (p.type === "cosmetic") return false;
    return true;
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

  function ruleText(p) {
    if (!p) return "";
    if (typeof p.rule === "string") return p.rule;
    var rows = Array.isArray(p.rules) ? p.rules : (Array.isArray(p.ruleRows) ? p.ruleRows : []);
    var first = rows[0];
    if (!first) return "";
    if (typeof first === "string") return first;
    return String(first.text || "");
  }

  function paintFormTitle() {
    if (titleEl) titleEl.textContent = loaded && loaded.id ? "Edit this listing" : "New listing";
    if (stageBtn) stageBtn.textContent = loaded && loaded.id ? "Update listing" : "Save listing";
  }

  function fill(p) {
    loaded = p || null;
    var name = document.getElementById("name");
    var does = document.getElementById("does");
    var rule = document.getElementById("rule");
    var share = document.getElementById("share");
    if (name) name.value = (p && p.name) || "";
    if (does) does.value = (p && p.does) || "";
    if (rule) rule.value = ruleText(p);
    if (share) {
      var vis = String((p && (p.visibility || p.status)) || "private").toLowerCase();
      share.value = (vis === "listed" || vis === "published" || vis === "submitted") ? "listed" : "private";
    }
    paintFormTitle();
  }

  function clearForm() {
    fill(null);
  }

  function paintList(rows) {
    if (!rows.length) {
      listEl.innerHTML = "<p>No listings on this desk yet. Write one below, or ask the desk to draft it.</p>";
      return;
    }
    listEl.innerHTML = rows.map(function (p) {
      return "<article class=\"pack\"><b>" + esc(p.name || p.id) + "</b>" +
        "<p>" + esc(whereOf(p)) + (p.does ? (" · " + esc(p.does)) : "") + "</p>" +
        "<div class=\"row\">" +
        "<button type=\"button\" class=\"ghost\" data-edit=\"" + esc(p.id) + "\">Edit</button>" +
        "<button type=\"button\" class=\"ghost\" data-remove=\"" + esc(p.id) + "\">Delete listing</button>" +
        "</div></article>";
    }).join("");
  }

  async function load() {
    var line = document.getElementById("desk-line");
    if (!deskOpen()) {
      if (line) line.textContent = "Open a desk first. Listings stay on that desk.";
      listEl.innerHTML = "<p><a href=\"/onboard\">Open a desk</a></p>";
      return;
    }
    if (line) line.textContent = "These are listings on this desk. Market stays a separate page.";
    try {
      var r = await fetch("/api/desks?packs=1&mine=1", { headers: hdr() });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        listEl.innerHTML = "<p>" + esc((d && d.error) || "Could not load your listings.") + "</p>";
        return;
      }
      paintList((d.packs || []).filter(ownPack));
    } catch (e) {
      listEl.innerHTML = "<p>Could not reach the desk.</p>";
    }
  }

  function saveBody() {
    var name = val("name");
    var does = val("does");
    var rule = val("rule");
    var share = val("share") === "listed" ? "listed" : "private";
    var body = {
      action: share === "listed" ? "list-pack" : "private-pack",
      name: name,
      does: does,
      visibility: share,
      status: share === "private" ? "private" : "listed"
    };
    if (loaded && loaded.id) body.id = loaded.id;
    if (loaded && loaded.aia) body.aia = loaded.aia;
    if (loaded && loaded.ask != null) body.ask = loaded.ask;
    if (rule) body.rules = [{ text: rule }];
    else if (loaded && Array.isArray(loaded.rules)) body.rules = loaded.rules;
    else if (loaded && Array.isArray(loaded.ruleRows)) body.rules = loaded.ruleRows;
    if (loaded && Array.isArray(loaded.aiRows) && loaded.aiRows.length) body.ais = loaded.aiRows;
    if (loaded && Array.isArray(loaded.workflowRows) && loaded.workflowRows.length) body.workflows = loaded.workflowRows;
    return body;
  }

  function stageSave() {
    if (!deskOpen()) return show("Open a desk first. Nothing was saved.", false);
    if (!val("name")) return show("Name the listing first.", false);
    var body = saveBody();
    var verb = body.id ? "Update" : "Create";
    var where = body.visibility === "listed" ? "on the public list" : "on this desk only";
    pending = { kind: "save", body: body };
    showDecide(verb + " \"" + body.name + "\" " + where + ".\nNothing is saved until you tap Yes. Stop cancels this draft. Nothing is charged.");
    show("", true);
    if (okEl) okEl.style.display = "none";
  }

  function stageRemove(id, name) {
    pending = {
      kind: "remove",
      body: { action: "unlist-pack", id: id }
    };
    showDecide("Delete the public listing for \"" + (name || id) + "\".\nThe pack stays on this desk. Nothing is removed until you tap Yes. Stop cancels this draft. Nothing is charged.");
    show("", true);
    if (okEl) okEl.style.display = "none";
  }

  async function edit(id) {
    hideDecide();
    try {
      var r = await fetch("/api/desks?packs=1&mine=1&id=" + encodeURIComponent(id), { headers: hdr() });
      var d = await r.json().catch(function () { return {}; });
      var pack = d.pack || d.listing;
      if (!r.ok || !pack) return show((d && d.error) || "Could not open that listing.", false);
      fill(pack);
      show("Loaded into the form. Nothing is saved until you tap Yes.", true);
    } catch (e) {
      show("Could not reach the desk.", false);
    }
  }

  async function askDesk() {
    if (!deskOpen()) return show("Open a desk first.", false);
    var brief = [val("name"), val("does"), val("rule")].filter(Boolean).join(". ");
    if (!brief) return show("Say what the listing should do first.", false);
    var btn = document.getElementById("ask");
    if (btn) btn.disabled = true;
    try {
      var r = await fetch("/api/desks", {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ action: "studio-draft", brief: brief, kind: "pack" })
      });
      var d = await r.json().catch(function () { return {}; });
      if (!d || !d.ok || !d.pack) {
        return show((d && (d.note || d.error)) || "No draft this time. You can still write it by hand. Nothing was saved.", false);
      }
      var pack = d.pack;
      if (loaded && loaded.id) pack.id = loaded.id;
      fill(Object.assign({}, loaded || {}, pack, { id: loaded && loaded.id }));
      stageSave();
      show("Draft only. Nothing is saved until you tap Yes.", true);
    } catch (e) {
      show("Could not reach the desk. Nothing was saved.", false);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function yes() {
    if (!pending || !pending.body) return show("Nothing is waiting. Write a listing or pick Delete listing first.", false);
    var btn = document.getElementById("yes");
    if (btn) btn.disabled = true;
    var kind = pending.kind;
    try {
      var r = await fetch("/api/desks", {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify(pending.body)
      });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok || d.ok === false) {
        show((d && d.error) || "The desk did not do that. Nothing was saved or removed.", false);
        return;
      }
      hideDecide();
      clearForm();
      if (kind === "remove") {
        show("Taken off the public list. The pack stays on this desk. Nothing was charged.", true);
      } else {
        show("Saved. Nothing was charged.", true);
      }
      await load();
    } catch (e) {
      show("Could not reach the desk. Nothing was saved or removed.", false);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function stop() {
    hideDecide();
    show("Stopped. Nothing was saved or removed.", true);
  }

  listEl.addEventListener("click", function (e) {
    var editBtn = e.target.closest("[data-edit]");
    if (editBtn) {
      edit(editBtn.getAttribute("data-edit"));
      return;
    }
    var rm = e.target.closest("[data-remove]");
    if (!rm) return;
    var id = rm.getAttribute("data-remove");
    var card = rm.closest(".pack");
    var name = card && card.querySelector("b") ? card.querySelector("b").textContent : id;
    stageRemove(id, name);
  });

  var askBtn = document.getElementById("ask");
  if (askBtn) askBtn.addEventListener("click", askDesk);
  if (stageBtn) stageBtn.addEventListener("click", stageSave);
  var fresh = document.getElementById("fresh");
  if (fresh) fresh.addEventListener("click", function () {
    hideDecide();
    clearForm();
    show("Cleared. Nothing was saved or removed.", true);
  });
  var yesBtn = document.getElementById("yes");
  if (yesBtn) yesBtn.addEventListener("click", yes);
  var stopBtn = document.getElementById("stop");
  if (stopBtn) stopBtn.addEventListener("click", stop);

  paintFormTitle();
  load();
})();
