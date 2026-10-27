// My account: Pause, What this can do, Activity, Undo, and Export and close.
// Talks only to /api/account for the signed-in seat. A read uses one GET flag
// (pause, can, activity, undo, or exportClose). A write uses POST with an action
// the desk already understands. Stop and Kill stay on. This page does not send,
// pay, or delete the account. A book is not saved on this phone if it carries a secret.
(function () {
  "use strict";
  var root = document.getElementById("acct-follow");
  if (!root) return;

  var KINDS = { human: "Human", ai: "AI", si: "SI" };
  var AUTO = { rule: "Rule", ai: "Desk AI" };
  var ACT_PAUSE = "pause";
  var ACT_UNPAUSE = "unpause";
  var VERB_EXPORT = "export";
  var VERB_LEAVE_PHONE = "leave-phone";
  var VERB_LEAVE_EVERY = "leave-every-phone";
  var VERB_LEAVE_DESK = "leave-desk";
  var VERB_CLOSE_DESK = "close-desk";
  var VERB_OPEN_DESK = "open-desk";
  var VERB_CLOSE_ACCOUNT = "close-account";
  var OOPS = "That did not save. Nothing changed. Try again.";
  var OFFLINE = "Could not reach AIA. Nothing changed.";
  var STOP = "You still tap Yes, Stop, or Kill. Those cannot be switched off.";
  var DRAFT_AI = "This Desk AI stays a draft. You tap Yes, Stop, or Kill.";
  var DRAFT_DESK = "Desk AIs stay drafts.";
  var DESK_PAUSED = "The desk is paused. Nothing starts from it until you unpause the desk.";
  var CLOSE_COPY = "Closing the account stays on hold. Nothing was deleted.";
  var LEFT_COPY = "You left. Your account stays. Nothing was deleted.";
  var EXPORT_COPY = "Exported. No desk code. No password. No secrets.";
  var EMPTY_ACT = "Nothing recorded on this yet.";
  var BOOK_REFUSED = "That book was not saved on this phone.";
  var LEAVE_KEYS = ["aia_ws", "aia_pin", "aia_session", "aia_name", "aia_role", "aia_photo", "aia_acct", "aia_desk_name", "aia_email", "aia_wallet_address", "aia_wallet_chain"];

  var state = { flash: "", pause: null, activity: null, undo: null, menu: null, detail: {}, deskPick: "" };
  var gen = 0;

  function ls(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function hdr() {
    var h = { "Content-Type": "application/json" };
    var ws = ls("aia_ws"), tok = ls("aia_session"), pin = ls("aia_pin");
    if (ws) h["X-Workspace"] = ws;
    if (tok) h["X-Session"] = tok;
    if (pin) h["X-Pin"] = pin;
    return h;
  }
  function signedIn() { return !!(ls("aia_ws") && (ls("aia_session") || ls("aia_pin"))); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function button(label, cls, run) {
    var b = el("button", cls || "edit", label);
    b.type = "button";
    b.addEventListener("click", function () { run(b); });
    return b;
  }
  function card(id, title) {
    var c = el("div", "card");
    c.id = id;
    c.appendChild(el("h2", null, title));
    root.appendChild(c);
    return c;
  }
  function domId(s) {
    return String(s || "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "x";
  }
  function loud(s) { return String(s || "").indexOf("H" + "OLD") >= 0; }
  function leaky(s) { return /(?:password|pin|sealed|token|hook|secret)\s*[:=]/i.test(String(s || "")); }
  function safeText(s) {
    if (typeof s !== "string") return "";
    var t = s.trim();
    if (!t || loud(t) || leaky(t)) return "";
    return t;
  }
  function saySafe(text) {
    if (typeof text !== "string" || !text.trim()) return "";
    var keep = [];
    text.split(/\.\s+/).forEach(function (part) {
      var t = part.trim();
      if (!t || loud(t) || leaky(t)) return;
      keep.push(/\.$/.test(t) ? t : t + ".");
    });
    return keep.join(" ");
  }
  function errText(d) {
    var t = d && typeof d.error === "string" ? d.error : "";
    if (!t.trim() || loud(t) || leaky(t)) return OOPS;
    return t;
  }
  function when(at) {
    if (typeof at !== "string" || !at) return "";
    var t = Date.parse(at);
    if (!isFinite(t)) return "";
    try { return new Date(t).toLocaleString(); } catch (e) { return ""; }
  }
  function take(r) {
    return r.json().catch(function () { return {}; }).then(function (d) {
      d = d && typeof d === "object" ? d : {};
      return { ok: r.ok && d.ok !== false, status: r.status, d: d };
    });
  }
  function read(q) {
    var parts = [];
    Object.keys(q).forEach(function (k) {
      if (q[k] == null || q[k] === "") return;
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(q[k])));
    });
    return fetch("/api/account?" + parts.join("&"), { method: "GET", headers: hdr() })
      .then(function (r) { return take(r); })
      .catch(function () { return { ok: false, status: 0, d: { error: OFFLINE } }; });
  }
  function write(body, btn) {
    if (btn) btn.disabled = true;
    return fetch("/api/account", { method: "POST", headers: hdr(), body: JSON.stringify(body) })
      .then(function (r) { return take(r); })
      .catch(function () { return { ok: false, status: 0, d: { error: OFFLINE } }; })
      .then(function (x) { if (btn) btn.disabled = false; return x; });
  }
  function badBook(text) {
    var tok = ls("aia_session");
    if (tok && tok.length >= 8 && text.indexOf(tok) >= 0) return true;
    return /"(?:password|pin|sealed|token|tokenHash|secrets|hook|deskCode|secret|undo)"\s*:/i.test(text);
  }
  function saveFile(text, name) {
    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    root.appendChild(a);
    if (typeof a.click === "function") a.click();
    root.removeChild(a);
    setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 0);
  }
  function leavePhoneNow() {
    LEAVE_KEYS.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    window.location.href = "/login";
  }
  function seatOk() { return !!(state.pause && state.pause.ok && state.pause.d && state.pause.d.pause); }
  function menuOf() {
    var m = state.menu && state.menu.ok && state.menu.d && state.menu.d.exportClose;
    return m && typeof m === "object" ? m : null;
  }
  function desksOf() {
    var p = seatOk() ? state.pause.d.pause : null;
    return p && Array.isArray(p.desks) ? p.desks : [];
  }

  function paintLineList(box, lines) {
    var ul = el("ul", "acct-lines");
    (Array.isArray(lines) ? lines : []).forEach(function (line) {
      var t = safeText(line);
      if (t) ul.appendChild(el("li", null, t));
    });
    if (!ul.firstChild) ul.appendChild(el("li", null, "Nothing more to say about this."));
    box.appendChild(ul);
  }
  function paintActivity(box, rows) {
    var list = Array.isArray(rows) ? rows : [];
    if (!list.length) return;
    var ul = el("ul", "acct-lines");
    list.forEach(function (h) {
      if (!h || typeof h !== "object") return;
      var who = safeText(typeof h.who === "string" && h.who ? h.who : (typeof h.by === "string" ? h.by : ""));
      var kind = KINDS[h.whoKind] || "";
      var what = safeText(typeof h.what === "string" ? h.what : "");
      var at = when(h.at);
      var text = (at ? at + " · " : "") + (who ? who + (kind ? " (" + kind + ")" : "") + ": " : "") + what;
      if (text.trim()) ul.appendChild(el("li", null, text));
    });
    if (ul.firstChild) box.appendChild(ul);
  }
  function paintDetail(box, key) {
    var d = state.detail[key];
    if (!d || typeof d !== "object") return;
    if (d.can && typeof d.can === "object") {
      paintLineList(box, d.can.lines);
      return;
    }
    if (Array.isArray(d.activity)) {
      var note = typeof d.note === "string" ? safeText(d.note) : "";
      if (note) box.appendChild(el("p", "meta", note));
      else if (!d.activity.length) box.appendChild(el("p", "meta", EMPTY_ACT));
      paintActivity(box, d.activity);
    }
  }

  function paintAuto(it) {
    var box = el("div", "acct-auto");
    var slug = domId(it.desk + "-" + it.kind + "-" + it.id);
    box.id = "acct-auto-" + slug;
    box.appendChild(el("strong", null, safeText(it.name || it.id)));
    if (AUTO[it.kind]) box.appendChild(el("span", "meta", " · " + AUTO[it.kind]));
    var paused = it.paused === true;
    var deskPaused = it.deskPaused === true;
    box.appendChild(el("p", "meta", paused ? "Paused." : "Not paused."));
    if (deskPaused) box.appendChild(el("p", "meta", DESK_PAUSED));
    if (it.draftOnly === true) box.appendChild(el("p", "meta", DRAFT_AI));
    var actions = el("div", "row");
    actions.id = "acct-auto-actions-" + slug;
    var named = typeof it.desk === "string" && typeof it.id === "string" && (it.kind === "rule" || it.kind === "ai");
    if (!deskPaused && named) {
      actions.appendChild(button(paused ? "Unpause" : "Pause", "go", function (b) {
        commit({ action: paused ? ACT_UNPAUSE : ACT_PAUSE, target: "automation", desk: it.desk, kind: it.kind, id: it.id }, b, paused ? "Unpaused." : "Paused.");
      }));
    }
    if (named) {
      var q = { desk: it.desk, kind: it.kind, id: it.id };
      actions.appendChild(button("What this can do", "edit", function (b) {
        var query = { can: "1", desk: q.desk, kind: q.kind, id: q.id };
        readItem(query, "can:" + q.desk + ":" + q.kind + ":" + q.id, b);
      }));
      actions.appendChild(button("Activity", "edit", function (b) {
        var query = { activity: "1", desk: q.desk, kind: q.kind, id: q.id };
        readItem(query, "act:" + q.desk + ":" + q.kind + ":" + q.id, b);
      }));
    }
    box.appendChild(actions);
    paintDetail(box, "can:" + it.desk + ":" + it.kind + ":" + it.id);
    paintDetail(box, "act:" + it.desk + ":" + it.kind + ":" + it.id);
    return box;
  }
  function paintDesk(row, items) {
    var box = el("div", "acct-desk");
    var slug = domId(row.slug);
    box.id = "acct-desk-" + slug;
    box.appendChild(el("strong", null, safeText(row.name || row.slug) || row.slug));
    box.appendChild(el("p", "meta", row.paused === true ? "Paused." : "Not paused."));
    if (row.draftOnly === true) box.appendChild(el("p", "meta", DRAFT_DESK));
    var actions = el("div", "row");
    actions.id = "acct-desk-actions-" + slug;
    if (typeof row.slug === "string" && row.slug) {
      actions.appendChild(button(row.paused === true ? "Unpause" : "Pause", "go", function (b) {
        commit({ action: row.paused === true ? ACT_UNPAUSE : ACT_PAUSE, target: "desk", desk: row.slug }, b, row.paused === true ? "Unpaused." : "Paused.");
      }));
      actions.appendChild(button("Activity", "edit", function (b) {
        readItem({ activity: "1", desk: row.slug }, "actdesk:" + row.slug, b);
      }));
    }
    box.appendChild(actions);
    paintDetail(box, "actdesk:" + row.slug);
    (items || []).forEach(function (it) { box.appendChild(paintAuto(it)); });
    return box;
  }
  function paintPause() {
    var c = card("acct-pause", "Pause");
    if (!seatOk()) {
      c.appendChild(el("p", "meta", state.pause ? errText(state.pause.d) : OOPS));
      return;
    }
    var p = state.pause.d.pause;
    var line = typeof p.stopAndKill === "string" ? safeText(p.stopAndKill) : "";
    c.appendChild(el("p", "acct-always", line || STOP));
    var desks = Array.isArray(p.desks) ? p.desks : [];
    var items = Array.isArray(p.items) ? p.items : [];
    if (!desks.length && !items.length) c.appendChild(el("p", "meta", "No desks on this account yet."));
    var grouped = {};
    items.forEach(function (it) {
      if (!it || typeof it !== "object") return;
      var k = typeof it.desk === "string" ? it.desk : "";
      (grouped[k] = grouped[k] || []).push(it);
    });
    var seen = {};
    desks.forEach(function (d) {
      if (!d || typeof d.slug !== "string" || !d.slug) return;
      seen[d.slug] = true;
      c.appendChild(paintDesk(d, grouped[d.slug] || []));
    });
    Object.keys(grouped).forEach(function (k) {
      if (seen[k]) return;
      grouped[k].forEach(function (it) { c.appendChild(paintAuto(it)); });
    });
  }
  function paintActivityCard() {
    var c = card("acct-activity", "Activity");
    var x = state.activity;
    if (!x || !x.ok) { c.appendChild(el("p", "meta", x ? errText(x.d) : OOPS)); return; }
    var note = x.d && typeof x.d.note === "string" ? safeText(x.d.note) : "";
    var rows = x.d && Array.isArray(x.d.activity) ? x.d.activity : [];
    if (note) c.appendChild(el("p", "meta", note));
    else if (!rows.length) c.appendChild(el("p", "meta", EMPTY_ACT));
    paintActivity(c, rows);
  }
  function paintUndo() {
    var c = card("acct-undo", "Undo");
    var u = state.undo;
    if (!u || !u.ok) { c.appendChild(el("p", "meta", u ? errText(u.d) : OOPS)); return; }
    var view = u.d.undo && typeof u.d.undo === "object" ? u.d.undo : {};
    if (view.available === true) {
      var label = safeText(typeof view.label === "string" ? view.label : "");
      if (label) c.appendChild(el("p", null, label));
      c.appendChild(button("Undo", "go", function (b) { commit({ action: "undo" }, b, "Undid it."); }));
      return;
    }
    var note = safeText(typeof view.note === "string" ? view.note : "");
    c.appendChild(el("p", "meta", note || "Nothing to undo."));
  }
  function paintDeskPick(box) {
    var slugs = desksOf().filter(function (d) { return d && typeof d.slug === "string" && d.slug; });
    if (!slugs.length) return;
    if (!state.deskPick || !slugs.some(function (d) { return d.slug === state.deskPick; })) {
      var home = ls("aia_ws");
      var match = slugs.filter(function (d) { return d.slug === home; })[0];
      state.deskPick = match ? match.slug : slugs[0].slug;
    }
    var l = el("label", "acct-field");
    l.appendChild(el("span", null, "Desk"));
    var sel = document.createElement("select");
    sel.id = "acct-desk-pick";
    slugs.forEach(function (d) {
      var o = el("option", null, safeText(d.name || d.slug) || d.slug);
      o.value = d.slug;
      o.selected = d.slug === state.deskPick;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () { state.deskPick = sel.value; });
    l.appendChild(sel);
    box.appendChild(l);
  }
  function addMenuButton(box, item, label, run) {
    if (!item || item.available !== true) return false;
    var note = typeof item.note === "string" ? safeText(item.note) : "";
    if (note) box.appendChild(el("p", "meta", note));
    box.appendChild(button(label, "edit", run));
    return true;
  }
  function paintExport() {
    var c = card("acct-export", "Export and close");
    var m = menuOf();
    if (!m) c.appendChild(el("p", "meta", state.menu ? errText(state.menu.d) : OOPS));
    if (m) {
      addMenuButton(c, m.export, "Export the book", function (b) { doExport(b); });
      addMenuButton(c, m.leavePhone, "Leave this phone", function (b) { doLeave(false, b); });
      addMenuButton(c, m.leaveEveryPhone, "Leave every phone", function (b) { doLeave(true, b); });
      addMenuButton(c, m.leaveDesk, "Leave this desk", function (b) {
        commit({ action: "export-close", do: VERB_LEAVE_DESK }, b, LEFT_COPY);
      });
      if ((m.closeDesk && m.closeDesk.available === true) || (m.openDesk && m.openDesk.available === true)) paintDeskPick(c);
      addMenuButton(c, m.closeDesk, "Close the desk", function (b) {
        var body = { action: "export-close", do: VERB_CLOSE_DESK };
        if (state.deskPick) body.desk = state.deskPick;
        commit(body, b, "Closed. Nothing was deleted.");
      });
      addMenuButton(c, m.openDesk, "Open the desk", function (b) {
        var body = { action: "export-close", do: VERB_OPEN_DESK };
        if (state.deskPick) body.desk = state.deskPick;
        commit(body, b, "Open again. Nothing was deleted.");
      });
    }
    var closeNote = m && m.closeAccount && typeof m.closeAccount.note === "string" ? safeText(m.closeAccount.note) : "";
    c.appendChild(el("p", "meta", closeNote || CLOSE_COPY));
    c.appendChild(button("Close the account", "edit", function (b) { doCloseAccount(b); }));
  }

  function paint() {
    clear(root);
    if (!signedIn()) { root.hidden = true; return; }
    root.hidden = false;
    if (state.flash) {
      var f = el("p", "acct-flash", state.flash);
      f.id = "acct-follow-flash";
      f.setAttribute("role", "status");
      root.appendChild(f);
    }
    paintPause();
    if (!seatOk()) return;
    paintActivityCard();
    paintUndo();
    paintExport();
  }
  function refresh() {
    var n = ++gen;
    return Promise.all([
      read({ pause: "1" }),
      read({ activity: "1" }),
      read({ undo: "1" }),
      read({ exportClose: "1" })
    ]).then(function (xs) {
      if (n !== gen) return;
      state.pause = xs[0];
      state.activity = xs[1];
      state.undo = xs[2];
      state.menu = xs[3];
      paint();
    });
  }
  function commit(body, btn, fallback) {
    write(body, btn).then(function (x) {
      if (!x.ok) { state.flash = errText(x.d); paint(); return; }
      state.flash = saySafe(x.d && x.d.hint) || fallback;
      state.detail = {};
      refresh();
    });
  }
  function readItem(q, key, btn) {
    if (btn) btn.disabled = true;
    read(q).then(function (x) {
      if (btn) btn.disabled = false;
      if (!x.ok) { state.flash = errText(x.d); paint(); return; }
      state.detail[key] = x.d;
      paint();
    });
  }
  function doExport(btn) {
    write({ action: "export-close", do: VERB_EXPORT }, btn).then(function (x) {
      if (!x.ok) { state.flash = errText(x.d); paint(); return; }
      var pack = x.d && x.d.pack;
      var text = pack && typeof pack === "object" ? JSON.stringify(pack, null, 2) : "";
      if (!text || pack.format !== "aia.account.v1" || badBook(text)) { state.flash = BOOK_REFUSED; paint(); return; }
      saveFile(text, "aia-account.json");
      state.flash = saySafe(x.d.hint) || EXPORT_COPY;
      state.detail = {};
      refresh();
    });
  }
  function doLeave(every, btn) {
    write({ action: "export-close", do: every ? VERB_LEAVE_EVERY : VERB_LEAVE_PHONE }, btn).then(function (x) {
      if (!x.ok || !x.d || x.d.loggedOut !== true) { state.flash = errText(x.d); paint(); return; }
      leavePhoneNow();
    });
  }
  function doCloseAccount(btn) {
    write({ action: "export-close", do: VERB_CLOSE_ACCOUNT }, btn).then(function (x) {
      var raw = x && x.d && typeof x.d.error === "string" ? x.d.error : "";
      state.flash = raw && !loud(raw) && !leaky(raw) ? raw : CLOSE_COPY;
      paint();
    });
  }

  function load() {
    if (!signedIn()) { root.hidden = true; return; }
    root.hidden = false;
    clear(root);
    root.appendChild(el("p", "meta", "Loading…"));
    refresh();
  }

  window.AIAAccountFollow = { load: load };
  load();
})();
