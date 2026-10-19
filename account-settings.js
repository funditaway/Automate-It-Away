// My account settings: six plain sections on /account.
// Reads GET /api/account?settings=1 for the signed-in seat only. Every stranger-typed
// value is set with textContent or .value, never as HTML. A section the server does
// not back yet shows one plain "coming soon" line, never a dead switch.
// Stop and Kill always work; nothing here can turn them off. Collect HOLD.
(function () {
  "use strict";
  var root = document.getElementById("acct-settings");
  if (!root) return;

  var SOON = {
    profile: "Changing your name and profile here is coming soon.",
    talk: "Choosing how AIA reaches you here is coming soon.",
    notify: "Choosing which things AIA tells you about is coming soon.",
    desks: "Seeing your desks here is coming soon.",
    allow: "Choosing which Packs and automations each desk allows is coming soon.",
    autos: "Settings for automations that run on their own are coming soon.",
    runOwn: "Letting an automation run on its own is coming soon. Today AIA waits for a person on every card.",
    look: "Choosing your look here is coming soon.",
    secrets: "Saving secrets for your automations is coming soon. They will go in through a hidden field and will never be shown again.",
    history: "No changes yet."
  };
  var STOPS = [["money", "Stop and ask before spending money"], ["deletes", "Stop and ask before deleting anything"], ["messageNew", "Stop and ask before messaging someone new"]];
  var LOOKS = { system: "Match my phone or computer", light: "Light", dark: "Dark" };
  var REACH = { call: "Call me", text: "Text me", email: "Email me" };
  var KINDS = { human: "Person", ai: "AI", si: "SI" };

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
  function soon(box, text) { box.appendChild(el("p", "meta soon", text)); }
  function on(x) { return !!(x && x.available === true); }
  function card(id, title) {
    var c = el("div", "card");
    c.id = id;
    c.appendChild(el("h2", null, title));
    root.appendChild(c);
    return c;
  }
  function field(box, label, value, max, type) {
    var l = el("label", "acct-field");
    l.appendChild(el("span", null, label));
    var i = document.createElement(type === "note" ? "textarea" : "input");
    if (type && type !== "note") i.type = type;
    i.maxLength = max;
    i.value = String(value || "");
    l.appendChild(i);
    box.appendChild(l);
    return i;
  }
  function saveRow(box, label, run) {
    var p = el("p");
    var b = el("button", "go", label);
    b.type = "button";
    var hint = el("p", "meta");
    hint.setAttribute("role", "status");
    b.addEventListener("click", function () { run(hint, b); });
    p.appendChild(b);
    box.appendChild(p);
    box.appendChild(hint);
    return hint;
  }
  function post(body, hint, btn) {
    if (btn) btn.disabled = true;
    hint.textContent = "Saving…";
    return fetch("/api/account", { method: "POST", headers: hdr(), body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) {
        if (btn) btn.disabled = false;
        if (!x.ok || !x.d || x.d.ok === false) { hint.textContent = (x.d && x.d.error) || "That did not save. Nothing changed."; return null; }
        hint.textContent = x.d.hint || "Saved.";
        if (x.d.settings) paintHistory(x.d.settings.history);
        return x.d;
      })
      .catch(function () { if (btn) btn.disabled = false; hint.textContent = "Could not reach AIA. Nothing changed."; return null; });
  }

  function paintProfile(s) {
    var c = card("acct-profile", "Name and profile");
    if (!on(s)) return soon(c, SOON.profile);
    var f = {
      name: field(c, "Your name", s.name, 80),
      email: field(c, "Email", s.email, 120, "email"),
      phone: field(c, "Phone", s.phone, 32, "tel"),
      city: field(c, "City", s.city, 60),
      state: field(c, "State", s.state, 40),
      timezone: field(c, "Time zone", s.timezone, 60),
      hours: field(c, "Hours you work", s.hours, 80),
      note: field(c, "A note about you", s.note, 240, "note")
    };
    var kinds = (Array.isArray(s.kindChoices) ? s.kindChoices : []).filter(function (k) { return KINDS[k]; });
    var kindSel = null;
    if (kinds.length) {
      var kl = el("label", "acct-field");
      kl.appendChild(el("span", null, "This account is a"));
      kindSel = document.createElement("select");
      kinds.forEach(function (k) {
        var o = el("option", null, KINDS[k]);
        o.value = k; o.selected = s.kind === k;
        kindSel.appendChild(o);
      });
      kl.appendChild(kindSel);
      c.appendChild(kl);
    } else if (KINDS[s.kind]) {
      c.appendChild(el("p", "meta", "This account is a " + KINDS[s.kind] + "."));
    }
    saveRow(c, "Save profile", function (hint, btn) {
      var set = {};
      Object.keys(f).forEach(function (k) { set[k] = f[k].value; });
      if (kindSel && kindSel.value !== s.kind) set.kind = kindSel.value;
      post({ action: "settings", section: "profile", set: set }, hint, btn).then(function (d) {
        if (!kindSel || !("kind" in set)) return;
        if (d) s.kind = set.kind; else kindSel.value = s.kind;
      });
    });
  }

  function paintTalk(s) {
    var c = card("acct-talk", "How AIA talks to you");
    if (!on(s)) { soon(c, SOON.talk); soon(c, SOON.notify); return; }
    c.appendChild(el("p", "meta", "When AIA needs you, it reaches you this way."));
    var choices = Array.isArray(s.reachChoices) ? s.reachChoices : [];
    var group = el("div", "acct-choices");
    choices.forEach(function (k) {
      if (!REACH[k]) return;
      var l = el("label", "acct-pick");
      var r = document.createElement("input");
      r.type = "radio"; r.name = "acct-reach"; r.value = k; r.checked = s.reach === k;
      l.appendChild(r);
      l.appendChild(el("span", null, REACH[k]));
      group.appendChild(l);
    });
    c.appendChild(group);
    saveRow(c, "Save how AIA reaches you", function (hint, btn) {
      var pick = group.querySelector("input:checked");
      if (!pick) { hint.textContent = "Pick call, text, or email first."; return; }
      post({ action: "settings", section: "talk", set: { reach: pick.value } }, hint, btn);
    });
    if (!on(s.notify)) soon(c, SOON.notify);
  }

  function paintDesks(s) {
    var c = card("acct-desks", "Your desks");
    if (!on(s)) return soon(c, SOON.desks);
    var items = Array.isArray(s.items) ? s.items : [];
    if (!items.length) c.appendChild(el("p", "meta", "You are not on any desk yet."));
    items.forEach(function (d) {
      var row = el("div", "acct-desk");
      row.appendChild(el("strong", null, d.name || d.slug));
      row.appendChild(el("span", "meta", d.yours === "own" ? " · Yours" : " · You help here"));
      row.appendChild(el("p", "meta", d.pack && d.pack.name ? "Pack: " + d.pack.name : "No Pack on this desk."));
      var autos = Array.isArray(d.automations) ? d.automations : [];
      row.appendChild(el("p", "meta", autos.length ? "Automations: " + autos.map(function (a) { return a.name; }).join(", ") : "No automations on this desk."));
      c.appendChild(row);
    });
    var anyAllow = items.some(function (d) { return on(d.allowList); });
    if (!anyAllow) soon(c, SOON.allow);
  }

  function paintAutos(s) {
    var c = card("acct-autos", "Your automations");
    c.appendChild(el("p", "acct-always", "Stop and Kill always work. They cannot be switched off."));
    if (!on(s)) { soon(c, SOON.autos); return; }
    if (!on(s.runOnItsOwn)) soon(c, SOON.runOwn);
    var items = Array.isArray(s.items) ? s.items : [];
    if (!items.length) { c.appendChild(el("p", "meta", "No automations on your desks yet.")); return; }
    if (s.note) c.appendChild(el("p", "meta", s.note));
    items.forEach(function (a) {
      var box = el("div", "acct-auto");
      box.appendChild(el("strong", null, a.name || a.id));
      var sb = a.stopBefore || {};
      STOPS.forEach(function (st) {
        var l = el("label", "acct-pick");
        var x = document.createElement("input");
        x.type = "checkbox"; x.checked = sb[st[0]] !== false;
        l.appendChild(x);
        l.appendChild(el("span", null, st[1]));
        var hint = el("span", "meta");
        hint.setAttribute("role", "status");
        x.addEventListener("change", function () {
          var set = { desk: a.desk, kind: a.kind, id: a.id };
          set[st[0]] = x.checked;
          post({ action: "settings", section: "automations", set: set }, hint, x).then(function (d) { if (!d) x.checked = !x.checked; });
        });
        l.appendChild(hint);
        box.appendChild(l);
      });
      c.appendChild(box);
    });
  }

  function paintLook(s) {
    var c = card("acct-look", "Look and feel");
    if (!on(s)) return soon(c, SOON.look);
    var l = el("label", "acct-field");
    l.appendChild(el("span", null, "Colors"));
    var sel = document.createElement("select");
    (Array.isArray(s.themes) ? s.themes : []).forEach(function (t) {
      if (!LOOKS[t]) return;
      var o = el("option", null, LOOKS[t]);
      o.value = t; o.selected = s.theme === t;
      sel.appendChild(o);
    });
    l.appendChild(sel);
    c.appendChild(l);
    saveRow(c, "Save look", function (hint, btn) {
      var t = sel.value;
      post({ action: "settings", section: "look", set: { theme: t } }, hint, btn).then(function (d) {
        if (!d) return;
        try { localStorage.setItem("aia_theme", t); } catch (e) {}
        if (window.AIATheme && typeof window.AIATheme.apply === "function") window.AIATheme.apply();
      });
    });
  }

  function paintSecrets() {
    // Secrets stay "coming soon" until James agrees the server key. No field, no list.
    var c = card("acct-secrets", "Secrets");
    soon(c, SOON.secrets);
  }

  var histBox = null;
  function paintHistory(list) {
    if (!histBox) return;
    while (histBox.firstChild) histBox.removeChild(histBox.firstChild);
    var rows = Array.isArray(list) ? list : [];
    if (!rows.length) { histBox.appendChild(el("p", "meta", SOON.history)); return; }
    var ul = el("ul", "acct-history");
    rows.forEach(function (h) {
      var when = "";
      try { when = h.at ? new Date(h.at).toLocaleString() : ""; } catch (e) {}
      ul.appendChild(el("li", null, (when ? when + " · " : "") + (h.who ? h.who + (KINDS[h.whoKind] ? " (" + KINDS[h.whoKind] + ")" : "") + ": " : "") + (h.what || "")));
    });
    histBox.appendChild(ul);
  }

  function paint(st) {
    while (root.firstChild) root.removeChild(root.firstChild);
    st = st || {};
    paintProfile(st.profile);
    paintTalk(st.talk);
    paintDesks(st.desks);
    paintAutos(st.automations);
    paintLook(st.look);
    paintSecrets();
    var h = card("acct-history", "What changed on your account");
    histBox = el("div");
    h.appendChild(histBox);
    paintHistory(st.history);
    root.hidden = false;
  }

  function load() {
    if (!signedIn()) { root.hidden = true; return; }
    fetch("/api/account?settings=1", { method: "GET", headers: hdr() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { paint(d && d.ok && d.settings ? d.settings : null); })
      .catch(function () { paint(null); });
  }

  window.AIAAccountSettings = { paint: paint, load: load };
  load();
})();
