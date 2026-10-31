// My account: Connections and setup cards on /account.
// Talks only to POST /api/account (actions connections, connect, connection-secret, disconnect,
// setup-cards, setup-card, setup-step) for the signed-in seat. Shapes come from PR 355.
// - Every value from the server or a stranger is set with textContent or .value, never as HTML.
// - The status line of a connection is the server's statusText, word for word.
// - A secret goes in through a hidden field, is cleared right after it is sent (good or bad),
//   and is never kept, logged, put in the address, or shown. Only "NAME: set" comes back.
// - Stop and Kill show on every setup card until it is stopped for good, and are never switched off
//   or greyed out. Kill takes two taps, like Stop on the Queue: the first asks, the second sends.
// - Preview only: nothing here buys or charges anything (Collect stays on HOLD).
(function () {
  "use strict";
  var root = document.getElementById("acct-connections");
  if (!root) return;

  var KINDS = { human: "Human", ai: "AI", si: "SI" };
  var STATE = { todo: "To do", done: "Done", skipped: "Skipped", blocked: "Waiting" };
  var SKIPS = { connect: 1, secret: 1 };
  var OOPS = "That did not work. Nothing changed. Try again.";
  var OFFLINE = "Could not reach AIA. Nothing changed.";
  var PREVIEW = "Preview, nothing is charged.";
  // Word for word what api/_account-connect.js says about a killed card.
  var GONE = "Stopped for good. Nothing more happens on this card.";
  var GONE_ALREADY = "This card was already stopped for good. Nothing changed.";
  var KILL_ASK = "Stop for good? Nothing more happens on this card.";
  var KILL_YES = "Yes, stop for good";
  var KILL_KEEP = "Keep the card";
  // The second tap sends confirm:true. The api's answer when a Kill comes without it:
  var KILL_AGAIN = "Kill needs a second tap.";
  var KILL_REARM = "Kill needs a second tap. Tap Yes, stop for good, or Keep the card.";

  var conns = [], cards = [], desks = [], note = "", open = {}, said = {}, hints = {}, armed = {};
  var connBox = null, connHint = null, cardBox = null, cardHint = null;

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
    b.addEventListener("click", run);
    return b;
  }
  function field(box, label, max, type) {
    var l = el("label", "acct-field");
    l.appendChild(el("span", null, label));
    var i = document.createElement("input");
    i.type = type || "text";
    if (max) i.maxLength = max;
    i.value = "";
    l.appendChild(i);
    box.appendChild(l);
    return i;
  }
  function secretField(box, label) {
    var i = field(box, label, 0, "password");
    i.setAttribute("autocomplete", "off");
    return i;
  }
  function picker(box, label, items, empty) {
    var l = el("label", "acct-field");
    l.appendChild(el("span", null, label));
    var sel = document.createElement("select");
    var o0 = el("option", null, empty);
    o0.value = "";
    sel.appendChild(o0);
    items.forEach(function (it) {
      var o = el("option", null, it[1]);
      o.value = it[0];
      sel.appendChild(o);
    });
    l.appendChild(sel);
    box.appendChild(l);
    return sel;
  }
  function into(node) { return function (t) { node.textContent = t; }; }
  // A card's status line lives across repaints, so a reply is never lost when the card redraws.
  function cardSay(id) { return function (t) { said[id] = t; if (hints[id]) hints[id].textContent = t; }; }
  function errText(d) { return d && typeof d.error === "string" && d.error.trim() ? d.error : OOPS; }

  // One POST. Resolves { ok, d }; never throws. The hint gets the server's own words on any refusal.
  function post(body, hint, btn) {
    if (btn) btn.disabled = true;
    if (hint) hint("Working…");
    return fetch("/api/account", { method: "POST", headers: hdr(), body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok && !!d && d.ok !== false, d: d || {} }; }); })
      .catch(function () { return { ok: false, d: { error: OFFLINE } }; })
      .then(function (x) {
        if (btn) btn.disabled = false;
        if (!x.ok && hint) hint(errText(x.d));
        return x;
      });
  }
  // Sends a secret: the field is emptied the moment the request leaves, and again when it is back.
  function postSecret(body, input, hint, btn) {
    var p = post(body, hint, btn);
    input.value = "";
    return p.then(function (x) { input.value = ""; return x; });
  }

  // ---------- connections ----------
  function serviceName(c) { return c.label ? c.label + " · " + (c.service || "") : (c.service || ""); }

  function paintConnections() {
    clear(connBox);
    if (!conns.length) connBox.appendChild(el("p", "meta", "Nothing saved yet."));
    conns.forEach(function (c) {
      var row = el("div", "acct-conn");
      row.appendChild(el("strong", null, c.label || c.service || ""));
      if (c.label && c.service) row.appendChild(el("span", "meta", " · " + c.service));
      row.appendChild(el("p", "acct-conn-status", c.statusText || ""));
      var names = Array.isArray(c.secretNames) ? c.secretNames : [];
      var ul = el("ul", "acct-secret-names");
      names.forEach(function (s) { if (s && s.name) ul.appendChild(el("li", null, s.name + ": " + (s.set === true ? "set" : "not set"))); });
      ul.appendChild(el("li", null, "Hook address: " + (c.hookSet === true ? "set" : "not set")));
      row.appendChild(ul);

      var form = el("div", "acct-conn-secret");
      var nm = field(form, "Secret name", 40);
      var val = secretField(form, "Secret value (hidden, never shown again)");
      var hint = el("p", "meta");
      hint.setAttribute("role", "status");
      var save = button("Save secret", "go", function () {
        var name = nm.value.trim();
        if (!name) { hint.textContent = "Name the secret first."; return; }
        if (!val.value) { hint.textContent = "Paste the secret value."; return; }
        postSecret({ action: "connection-secret", connectionId: c.id, name: name, value: val.value }, val, into(hint), save).then(function (x) {
          if (!x.ok) return;
          if (x.d.set === true && x.d.name) {
            var hit = names.filter(function (s) { return s && s.name === x.d.name; })[0];
            if (hit) hit.set = true; else names.push({ name: x.d.name, set: true });
            c.secretNames = names;
            paintConnections();
            connHint.textContent = x.d.name + ": set";
          } else hint.textContent = OOPS;
        });
      });
      form.appendChild(el("p")).appendChild(save);
      form.appendChild(hint);
      row.appendChild(form);

      var dhint = el("p", "meta");
      dhint.setAttribute("role", "status");
      var off = button("Disconnect", "edit", function () {
        var ask = "Remove " + serviceName(c) + " and its saved secrets? Setup cards that use it will wait until you save it again.";
        if (typeof window.confirm === "function" && !window.confirm(ask)) return;
        post({ action: "disconnect", connectionId: c.id }, into(dhint), off).then(function (x) {
          if (!x.ok) return;
          conns = Array.isArray(x.d.connections) ? x.d.connections : conns.filter(function (k) { return k.id !== c.id; });
          paintConnections();
          connHint.textContent = "Removed " + serviceName(c) + ".";
          loadCards();
        });
      });
      row.appendChild(el("p")).appendChild(off);
      row.appendChild(dhint);
      connBox.appendChild(row);
    });
  }

  function paintConnectForm(box) {
    var f = el("div", "acct-connect");
    f.appendChild(el("h3", null, "Save a service you already use"));
    f.appendChild(el("p", "meta", "AIA keeps the secret or hook address here. It does not sign in to the service for you."));
    var service = field(f, "Service", 40);
    var label = field(f, "Label (optional)", 60);
    var sname = field(f, "Secret name", 40);
    var sval = secretField(f, "Secret value (hidden, never shown again)");
    var hook = field(f, "Hook address (optional, starts with https://)", 500, "url");
    hook.setAttribute("autocomplete", "off");
    var desk = picker(f, "Desk for its setup card (optional)", desks.map(function (d) { return [d.slug, d.name || d.slug]; }), "Pick later");
    var hint = el("p", "meta");
    hint.setAttribute("role", "status");
    var go = button("Save", "go", function () {
      var body = { action: "connect", service: service.value.trim() };
      if (!body.service) { hint.textContent = "Name the service first."; return; }
      if (label.value.trim()) body.label = label.value.trim();
      if (sval.value) {
        if (!sname.value.trim()) { hint.textContent = "Name the secret too."; return; }
        body.secrets = {};
        body.secrets[sname.value.trim()] = sval.value;
      }
      if (hook.value.trim()) body.hook = hook.value.trim();
      if (!body.secrets && !body.hook) { hint.textContent = "Paste a secret or a hook address to save."; return; }
      if (desk.value) body.deskId = desk.value;
      var p = postSecret(body, sval, into(hint), go);
      hook.value = "";
      p.then(function (x) {
        if (!x.ok) return;
        var c = x.d.connection;
        if (c && c.id) {
          conns = conns.filter(function (k) { return k.id !== c.id; }).concat([c]);
          paintConnections();
        }
        if (x.d.card && x.d.card.id) upsertCard(x.d.card);
        hint.textContent = typeof x.d.hint === "string" && x.d.hint ? x.d.hint : (c && c.statusText) || "";
        service.value = ""; label.value = ""; sname.value = "";
      });
    });
    f.appendChild(el("p")).appendChild(go);
    f.appendChild(hint);
    box.appendChild(f);
  }

  // ---------- setup cards ----------
  function upsertCard(card) {
    var i = -1;
    cards.forEach(function (c, j) { if (c.id === card.id) i = j; });
    if (i >= 0) cards[i] = card; else cards.push(card);
    paintCards();
  }

  function historyLine(h) {
    var when = "";
    try { when = h.at ? new Date(h.at).toLocaleString() : ""; } catch (e) {}
    var who = h.who || h.by || "";
    return (when ? when + " · " : "") + (who ? who + (KINDS[h.whoKind] ? " (" + KINDS[h.whoKind] + ")" : "") + ": " : "") + (h.what || "");
  }

  function stepRow(card, group, st, say) {
    var li = el("li", "acct-step");
    li.appendChild(el("strong", null, st.title || ""));
    var word = STATE[st.state] || "";
    if (word) li.appendChild(el("span", "meta", " · " + word + (st.reason ? ": " + st.reason : "")));
    else if (st.reason) li.appendChild(el("span", "meta", " · " + st.reason));
    if (st.state === "done" && st.result && st.result.text) li.appendChild(el("p", "meta", st.result.text));
    if (st.state !== "todo" && st.state !== "blocked") return li;
    if (card.status === "killed" || card.status === "done") return li;
    var act = el("div", "acct-step-do");
    var send = function (extra, btn, secretInput) {
      var body = { action: "setup-step", cardId: card.id, stepId: st.id, do: "done" };
      Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
      var p = secretInput ? postSecret(body, secretInput, say, btn) : post(body, say, btn);
      return p.then(function (x) {
        if (!x.ok) return;
        say(x.d.entry && x.d.entry.what ? x.d.entry.what : "Saved.");
        if (x.d.card && x.d.card.id) upsertCard(x.d.card);
      });
    };
    if (st.kind === "desk") {
      var dsel = picker(act, "Desk", desks.map(function (d) { return [d.slug, d.name || d.slug]; }), "Pick a desk");
      var db = button("Use this desk", "go", function () {
        if (!dsel.value) { say("Pick a desk first."); return; }
        send({ deskId: dsel.value }, db);
      });
      act.appendChild(el("p")).appendChild(db);
    } else if (st.kind === "connect") {
      var mine = conns.filter(function (c) { return !group || !group.serviceId || c.serviceId === group.serviceId; });
      var csel = picker(act, "Saved service", mine.map(function (c) { return [c.id, serviceName(c)]; }), "Pick one");
      var cb = button("Done", "go", function () {
        if (!csel.value) { say("Save the service under Connections first, then pick it here."); return; }
        send({ connectionId: csel.value }, cb);
      });
      act.appendChild(el("p")).appendChild(cb);
    } else if (st.kind === "secret") {
      var sn = field(act, "Secret name", 40);
      var sv = secretField(act, "Secret value (hidden, never shown again)");
      var sb = button("Done", "go", function () {
        if (sv.value) {
          if (!sn.value.trim()) { say("Name the secret too."); return; }
          send({ secret: { name: sn.value.trim(), value: sv.value } }, sb, sv);
        } else send({}, sb);
      });
      act.appendChild(el("p", "meta", "Leave the value empty to use the secret already saved for this service."));
      act.appendChild(el("p")).appendChild(sb);
    } else if (st.kind === "approve") {
      act.appendChild(el("p", "meta", "Approve once what this may do. Each box left empty keeps its stop-and-ask on. Spending money always stops and asks."));
      var boxes = [["deletes", "Let it delete without stopping to ask"], ["messageNew", "Let it message someone new without stopping to ask"]].map(function (o) {
        var l = el("label", "acct-pick");
        var x = document.createElement("input");
        x.type = "checkbox"; x.checked = false; x.value = o[0];
        l.appendChild(x);
        l.appendChild(el("span", null, o[1]));
        act.appendChild(l);
        return x;
      });
      var ab = button("Approve once", "go", function () {
        send({ allow: { money: false, deletes: boxes[0].checked === true, messageNew: boxes[1].checked === true } }, ab);
      });
      act.appendChild(el("p")).appendChild(ab);
    } else if (st.kind === "test") {
      act.appendChild(el("p", "meta", "A dry run. Nothing is sent and nothing is charged."));
      var tb = button("Run the dry run", "go", function () { send({}, tb); });
      act.appendChild(el("p")).appendChild(tb);
    }
    if (SKIPS[st.kind]) {
      var why = field(act, "Why skip this step?", 200);
      var kb = button("Skip", "edit", function () {
        if (!why.value.trim()) { say("Say why you are skipping this step."); return; }
        var body = { action: "setup-step", cardId: card.id, stepId: st.id, do: "skip", reason: why.value.trim() };
        post(body, say, kb).then(function (x) {
          if (!x.ok) return;
          say(x.d.entry && x.d.entry.what ? x.d.entry.what : "Skipped.");
          if (x.d.card && x.d.card.id) upsertCard(x.d.card);
        });
      });
      act.appendChild(el("p")).appendChild(kb);
    }
    li.appendChild(act);
    return li;
  }

  function paintCard(card) {
    var box = el("div", "acct-setup-card");
    box.id = "acct-card-" + card.id;
    var src = card.source || {};
    box.appendChild(el("h3", null, src.name || ""));
    if (src.preview === true || card.bought === false || card.charged === false) box.appendChild(el("p", "acct-preview", PREVIEW));
    box.appendChild(el("p", "meta", card.statusText || ""));
    var hint = el("p", "meta", said[card.id] || "");
    hint.setAttribute("role", "status");
    hints[card.id] = hint;
    var say = cardSay(card.id);

    // Stop and Kill: on every card until it is stopped for good, never greyed out.
    var gone = card.status === "killed";
    var always = el("div", "row acct-stopkill");
    var stopB = el("button", "edit acct-stop", "Stop");
    stopB.type = "button";
    var killB = el("button", "edit acct-kill", armed[card.id] ? KILL_YES : "Kill");
    killB.type = "button";
    var halt = function (verb) {
      // Kill asks first, like Stop on the Queue: the first tap only arms it.
      if (verb === "kill" && !armed[card.id]) { armed[card.id] = true; said[card.id] = KILL_ASK; paintCards(); return; }
      if (armed[card.id]) { delete armed[card.id]; said[card.id] = ""; paintCards(); }
      // A Stop or Kill that did not save (503 while the store guard is up, any refusal, or
      // saved:false) never paints the card as stopped or killed; the buttons stay live to try again.
      var body = { action: "setup-step", cardId: card.id, do: verb };
      if (verb === "kill") body.confirm = true;
      post(body, say, null).then(function (x) {
        if (verb === "kill" && !x.ok && x.d && x.d.error === KILL_AGAIN) { armed[card.id] = true; said[card.id] = KILL_REARM; paintCards(); return; }
        if (!x.ok || x.d.saved === false) { say(verb === "stop" ? "Stop didn't save. Try again in a moment." : "Kill didn't save. Try again in a moment."); return; }
        var dead = !!(x.d.card && x.d.card.status === "killed");
        var line = verb === "stop" ? "Stopped." : GONE;
        if (dead) line = x.d.changed === false ? GONE_ALREADY : GONE;
        say(typeof x.d.hint === "string" && x.d.hint ? x.d.hint : line);
        if (x.d.card && x.d.card.id) upsertCard(x.d.card);
      });
    };
    stopB.addEventListener("click", function () { halt("stop"); });
    killB.addEventListener("click", function () { halt("kill"); });
    if (!gone) {
      always.appendChild(stopB);
      always.appendChild(killB);
      if (armed[card.id]) always.appendChild(button(KILL_KEEP, "edit", function () { delete armed[card.id]; said[card.id] = ""; paintCards(); }));
    }
    if (card.status === "stopped") {
      var startB = button("Start again", "edit", function () {
        post({ action: "setup-step", cardId: card.id, do: "start" }, say, startB).then(function (x) {
          if (!x.ok) return;
          say("Started again.");
          if (x.d.card && x.d.card.id) upsertCard(x.d.card);
        });
      });
      always.appendChild(startB);
    }
    var isOpen = !!open[card.id];
    always.appendChild(button(isOpen ? "Close" : "Open", "edit", function () { open[card.id] = !isOpen; paintCards(); }));
    box.appendChild(always);
    box.appendChild(hint);
    if (!isOpen) return box;

    var steps = Array.isArray(card.steps) ? card.steps : [];
    var groups = Array.isArray(card.groups) ? card.groups : [];
    if (groups.length > 1) box.appendChild(el("p", "meta", "This has " + groups.length + " parts. Each part has its own checklist."));
    var top = steps.filter(function (s) { return s.group === "card"; });
    if (top.length) {
      var tu = el("ul", "acct-steps");
      top.forEach(function (s) { tu.appendChild(stepRow(card, null, s, say)); });
      box.appendChild(tu);
    }
    groups.forEach(function (g) {
      var gb = el("div", "acct-group");
      gb.appendChild(el("h4", null, (g.name || "") + (g.service ? " · " + g.service : "")));
      var gu = el("ul", "acct-steps");
      steps.filter(function (s) { return s.group === g.id; }).forEach(function (s) { gu.appendChild(stepRow(card, g, s, say)); });
      gb.appendChild(gu);
      box.appendChild(gb);
    });
    var hist = Array.isArray(card.history) ? card.history : [];
    box.appendChild(el("h4", null, "What happened on this card"));
    if (!hist.length) box.appendChild(el("p", "meta", "Nothing yet."));
    else {
      var hu = el("ul", "acct-history");
      hist.forEach(function (h) { hu.appendChild(el("li", null, historyLine(h))); });
      box.appendChild(hu);
    }
    return box;
  }

  function paintCards() {
    if (!cardBox) return;
    clear(cardBox);
    if (!cards.length) cardBox.appendChild(el("p", "meta", "No setup cards yet. Saving a service above makes one."));
    cards.forEach(function (c) { if (c && c.id) cardBox.appendChild(paintCard(c)); });
  }

  function loadCards() {
    return post({ action: "setup-cards" }, into(cardHint), null).then(function (x) {
      if (x.ok) { cards = Array.isArray(x.d.cards) ? x.d.cards : []; cardHint.textContent = ""; paintCards(); }
    });
  }

  function paint() {
    clear(root);
    var c = el("div", "card");
    c.id = "acct-conns";
    c.appendChild(el("h2", null, "Connections"));
    c.appendChild(el("p", "meta", note || "Saved here only. AIA does not sign in to these services."));
    connHint = el("p", "meta");
    connHint.setAttribute("role", "status");
    c.appendChild(connHint);
    connBox = el("div");
    c.appendChild(connBox);
    paintConnections();
    paintConnectForm(c);
    root.appendChild(c);

    var s = el("div", "card");
    s.id = "acct-setup";
    s.appendChild(el("h2", null, "Setup cards"));
    s.appendChild(el("p", "acct-always", "Stop and Kill work on every card until it is stopped for good."));
    cardHint = el("p", "meta");
    cardHint.setAttribute("role", "status");
    s.appendChild(cardHint);
    cardBox = el("div");
    s.appendChild(cardBox);
    paintCards();
    root.appendChild(s);
    root.hidden = false;
  }

  function load() {
    if (!signedIn()) { root.hidden = true; return Promise.resolve(); }
    var gotDesks = fetch("/api/account?settings=1", { method: "GET", headers: hdr() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var items = d && d.ok && d.settings && d.settings.desks && Array.isArray(d.settings.desks.items) ? d.settings.desks.items : [];
        desks = items.filter(function (k) { return k && k.slug && k.yours === "own"; });
      })
      .catch(function () { desks = []; });
    return gotDesks.then(function () { return post({ action: "connections" }, null, null); }).then(function (x) {
      conns = x.ok && Array.isArray(x.d.connections) ? x.d.connections : [];
      note = x.ok && typeof x.d.note === "string" ? x.d.note : "";
      paint();
      if (!x.ok) connHint.textContent = errText(x.d);
      return loadCards();
    });
  }

  window.AIAAccountConnections = { load: load };
  load();
})();
