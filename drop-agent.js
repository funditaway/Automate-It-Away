(function () {
  var WHO = ["family", "friend", "helper", "staff"];
  var TYPES = [
    { id: "task", label: "A task", fields: ["need", "timing"], outcome: "wait" },
    { id: "chore", label: "An errand", fields: ["need", "timing", "where"], outcome: "hand" },
    { id: "list", label: "A list", fields: ["need"], outcome: "note" },
    { id: "idea", label: "An idea", fields: ["need"], outcome: "note" },
    { id: "project", label: "A project", fields: ["need", "timing"], outcome: "wait" },
    { id: "build", label: "A build", fields: ["need", "timing"], outcome: "wait" },
    { id: "request", label: "A request", fields: ["need", "timing"], outcome: "wait" },
    { id: "note", label: "A note", fields: ["need"], outcome: "note" },
    { id: "call", label: "Missed call", fields: ["phone", "timing"], outcome: "call" },
    { id: "message", label: "A message to send", fields: ["whoFor", "phone", "need"], outcome: "text" },
    { id: "pickup", label: "Pickup / drop-off", fields: ["where", "timing", "whoFor"], outcome: "book" },
    { id: "ride", label: "A ride", fields: ["fromWhere", "where", "timing"], outcome: "book" },
    { id: "reminder", label: "A reminder", fields: ["timing", "need"], outcome: "book" },
    { id: "book", label: "Book a time", fields: ["timing", "where", "whoFor"], outcome: "book" },
    { id: "form", label: "Form / paper", fields: ["timing", "need"], outcome: "wait" },
    { id: "photo", label: "A photo", fields: ["need"], outcome: "note" },
    { id: "quote", label: "Need a quote", fields: ["need", "amount"], outcome: "quote" },
    { id: "follow", label: "Follow up", fields: ["whoFor", "timing", "need"], outcome: "call" },
    { id: "walk-in", label: "Walk-in job", fields: ["need", "timing", "amount"], outcome: "wait" }
  ];
  var FIELDSPEC = {
    need: { label: "What is needed", ph: "Grocery run · porch idea · Friday ride" },
    whoFor: { label: "Who it is for", ph: "Sam" },
    where: { label: "Where", ph: "School · shop · house" },
    fromWhere: { label: "From", ph: "Practice" },
    timing: { label: "When", ph: "Friday 3pm" },
    amount: { label: "Amount note", ph: "85", mode: "decimal" },
    condition: { label: "Condition", ph: "Good / needs clean" },
    phone: { label: "Callback number", ph: "417-555-0100", mode: "tel" }
  };
  var ACTIONS = [
    { id: "draft", label: "Draft it", hint: "Qualify and draft. Do not send." },
    { id: "follow", label: "Follow later", hint: "Nudge after it sits. Still a draft." },
    { id: "hand", label: "Hand it off", hint: "Assign to a name on People." },
    { id: "calendar", label: "Calendar file", hint: "Save a phone file. Google write stays off." },
    { id: "rules", label: "Run desk rules", hint: "Honor the rules already on this desk." },
    { id: "owner", label: "Owner first", hint: "Wait on the owner before Yes." }
  ];
  var OUTCOMES = [
    { id: "text", label: "Text them", next: "Copy or text the draft. Desk does not send." },
    { id: "email", label: "Email them", next: "Copy or email the draft. Desk does not send." },
    { id: "call", label: "Call them back", next: "Call them back. Then mark it done." },
    { id: "book", label: "Put it on the calendar", next: "Save the phone calendar file. Google write stays off until the key is set." },
    { id: "hand", label: "Hand it to someone", next: "Hand this to a name on People." },
    { id: "list", label: "Draft a list", next: "Keep the list on the card. Owner taps Yes." },
    { id: "quote", label: "Draft a quote", next: "Draft only. Do not send a quote from here." },
    { id: "wait", label: "Owner decides", next: "Owner picks Yes or Stop." },
    { id: "note", label: "Just keep the note", next: "Leave it on the queue. No send." }
  ];
  function typeOf(id) { var i; for (i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return TYPES[i]; return TYPES[0]; }
  function outcomeOf(id) { var i; for (i = 0; i < OUTCOMES.length; i++) if (OUTCOMES[i].id === id) return OUTCOMES[i]; return null; }
  function val(id) { var el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; }
  function firstLine(text) { return String(text || "").split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean)[0] || ""; }
  function implementFromText(text, fields) {
    var blob = String(text || "").trim(); var out = { custom: {} }; if (!blob) return out;
    var email = blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i); if (email) out.email = email[0];
    var phone = blob.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/); if (phone) out.phone = phone[0];
    var dollars = blob.match(/\$\s*(\d+(?:\.\d{1,2})?)/) || blob.match(/\b(\d+(?:\.\d{1,2})?)\s*(?:dollars|usd)\b/i);
    if (dollars) { var n = Number(dollars[1]); if (isFinite(n)) out.amount = n; }
    var when = blob.match(/\b(?:by |due |on |at )?((?:mon|tue|wed|thu|fri|sat|sun)[a-z]*(?:\s+\d{1,2}(?:\/\d{1,2})?)?(?:\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
    if (when) out.timing = String(when[1] || when[0]).trim().slice(0, 80);
    var named = blob.match(/\b(?:from|name|i am|i'm|this is)\s*[:\-]?\s*([A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+)?)/i);
    if (named) out.contactName = named[1].trim().slice(0, 80);
    var title = firstLine(blob).replace(/^[-*•]\s*/, "").slice(0, 160); if (title) out.title = title;
    (fields || []).forEach(function (f) {
      if (!f || !f.key) return;
      var label = String(f.label || f.key);
      var re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[:=]\\s*([^,;\\n]+)", "i");
      var m = blob.match(re); if (m) out.custom[f.key] = m[1].trim().slice(0, 200);
    });
    return out;
  }
  function paintWho(current) {
    var box = document.getElementById("who-chips"); if (!box) return current || "helper";
    var on = WHO.indexOf(current) >= 0 ? current : "helper";
    box.innerHTML = WHO.map(function (k) { return "<button type=\"button\" class=\"" + (k === on ? "on" : "") + "\" data-who=\"" + k + "\">" + k + "</button>"; }).join("");
    return on;
  }
  function paintPreview(mapped) {
    var box = document.getElementById("agent-preview"); if (!box) return;
    var bits = [];
    if (mapped.title) bits.push("Title · " + mapped.title);
    if (mapped.contactName) bits.push("Name · " + mapped.contactName);
    if (mapped.phone) bits.push("Phone · " + mapped.phone);
    if (mapped.email) bits.push("Email · " + mapped.email);
    if (mapped.amount != null) bits.push("Amount note · $" + mapped.amount);
    if (mapped.timing) bits.push("When · " + mapped.timing);
    Object.keys(mapped.custom || {}).forEach(function (k) { bits.push(k + " · " + mapped.custom[k]); });
    if (!bits.length) { box.hidden = true; box.textContent = ""; return; }
    box.hidden = false;
    box.textContent = "Lands as: " + bits.join(" · ") + ". Still a draft. Nobody sends money from here.";
  }
  function paintKinds(sel, current) {
    if (!sel) return current || "request";
    var on = current || sel.value || "task";
    if (!typeOf(on) || typeOf(on).id !== on) on = "request";
    sel.innerHTML = TYPES.map(function (t) { return "<option value=\"" + t.id + "\"" + (t.id === on ? " selected" : "") + ">" + t.label + "</option>"; }).join("");
    sel.value = on; return on;
  }
  function paintKindFields(box, kindId, preset) {
    if (!box) return;
    var t = typeOf(kindId); var have = preset || {};
    box.innerHTML = (t.fields || []).map(function (key) {
      var spec = FIELDSPEC[key] || { label: key, ph: "" };
      var mode = spec.mode ? (" inputmode=\"" + spec.mode + "\"") : "";
      var val = have[key] ? String(have[key]).replace(/"/g, "&quot;") : "";
      return "<label>" + spec.label + "</label><input data-kind-field=\"" + key + "\" placeholder=\"" + spec.ph + "\"" + mode + " value=\"" + val + "\">";
    }).join("");
  }
  function collectKindFields() {
    var out = {}; var nodes = document.querySelectorAll("[data-kind-field]"); var i;
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i]; var key = el.getAttribute("data-kind-field"); var v = String(el.value || "").trim();
      if (key && v) out[key] = v.slice(0, 200);
    }
    return out;
  }
  function paintOutcomes(box, current) {
    if (!box) return current || "wait";
    var on = current || "wait"; if (!outcomeOf(on)) on = "wait";
    box.innerHTML = OUTCOMES.map(function (o) { return "<button type=\"button\" class=\"" + (o.id === on ? "on" : "") + "\" data-outcome=\"" + o.id + "\">" + o.label + "</button>"; }).join("");
    return on;
  }
  function applyKindToForm(kindId, extras) {
    extras = extras || {};
    if (extras.timing && document.getElementById("timing")) document.getElementById("timing").value = extras.timing;
    if (extras.amount && document.getElementById("amount")) document.getElementById("amount").value = extras.amount;
    if (extras.condition && document.getElementById("condition")) document.getElementById("condition").value = extras.condition;
    if (extras.phone && document.getElementById("phone") && !document.getElementById("phone").value) document.getElementById("phone").value = extras.phone;
    if (extras.need && document.getElementById("note") && !document.getElementById("note").value) document.getElementById("note").value = extras.need;
    if (extras.whoFor && document.getElementById("who") && !document.getElementById("who").value) document.getElementById("who").value = extras.whoFor;
  }
  function deskIsOpen() { return document.body.classList.contains("desk-open") || !!(localStorage.getItem("aia_pin") && (localStorage.getItem("aia_ws") || localStorage.getItem("aia_desk"))); }
  function isEmbed() { return document.body.classList.contains("embed"); }
  function paintActions(box, on) {
    if (!box) return on || {};
    var picked = on && typeof on === "object" ? on : {};
    box.innerHTML = ACTIONS.map(function (a) { return "<button type=\"button\" class=\"" + (picked[a.id] ? "on" : "") + "\" data-action=\"" + a.id + "\">" + a.label + "</button>"; }).join("");
    return picked;
  }
  function actionHint(picked) {
    var bits = ACTIONS.filter(function (a) { return picked && picked[a.id]; }).map(function (a) { return a.hint; });
    if (!bits.length) return "Advanced stays off until you tap a quick action. Nobody sends money from here.";
    return bits.join(" ") + " Nobody sends money from here.";
  }
  function collectAutomation() {
    var picked = window.__aiaActions || {}; var auto = {};
    ACTIONS.forEach(function (a) { if (picked[a.id]) auto[a.id] = true; });
    var packEl = document.getElementById("drop-pack"); var handEl = document.getElementById("drop-hand"); var whenEl = document.getElementById("drop-follow-when");
    if (packEl && packEl.value) auto.pack = packEl.value;
    if (handEl && handEl.value) auto.handTo = handEl.value;
    if (whenEl && whenEl.value) auto.followWhen = whenEl.value;
    return auto;
  }
  function injectDropUI() {
    var kind = document.getElementById("kind"); if (!kind) return;
    if (!document.getElementById("kind-fields")) {
      var fields = document.createElement("div"); fields.id = "kind-fields";
      kind.parentNode.insertBefore(fields, kind.nextSibling);
      var lab = document.createElement("label"); lab.textContent = "Preferred outcome";
      fields.parentNode.insertBefore(lab, fields.nextSibling);
      var chips = document.createElement("div"); chips.id = "outcome-chips"; chips.className = "outcomes who-chips";
      lab.parentNode.insertBefore(chips, lab.nextSibling);
      var hint = document.createElement("p"); hint.id = "outcome-hint"; hint.className = "sub";
      hint.textContent = "What the desk should do next. Still a draft. Nobody sends money from here.";
      chips.parentNode.insertBefore(hint, chips.nextSibling);
    }
    if (!document.getElementById("drop-outcome-css")) {
      var css = document.createElement("style"); css.id = "drop-outcome-css";
      css.textContent = ".outcomes,.drop-actions{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 10px}.outcomes button,.drop-actions button,.adv-toggle{flex:1;min-width:96px;min-height:44px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);font:700 13px system-ui,sans-serif;cursor:pointer}.outcomes button.on,.drop-actions button.on,.adv-toggle.on{background:var(--edit);color:var(--edit-ink);border-color:var(--teal)}#pane-auto{margin-top:8px}";
      document.head.appendChild(css);
    }
    if (isEmbed() || document.getElementById("drop-actions")) return;
    var after = document.getElementById("outcome-hint") || document.getElementById("outcome-chips") || kind;
    var tog = document.createElement("button"); tog.type = "button"; tog.id = "adv-toggle"; tog.className = "adv-toggle"; tog.textContent = "Advanced";
    after.parentNode.insertBefore(tog, after.nextSibling);
    var pane = document.createElement("div"); pane.id = "pane-auto"; pane.hidden = true;
    pane.innerHTML = "<label>Quick actions</label><div class=\"drop-actions\" id=\"drop-actions\"></div><p class=\"sub\" id=\"action-hint\">Tap what the desk should do after this lands. Draft only.</p><label>Pack</label><select id=\"drop-pack\"><option value=\"\">This desk / let the engine pick</option><option value=\"home\">Home</option><option value=\"consign\">Consign</option><option value=\"vita\">Insurance</option><option value=\"fund\">Fund</option><option value=\"land\">Land</option></select><label>Hand to</label><select id=\"drop-hand\"><option value=\"\">Leave on the queue</option></select><label>Follow when</label><input id=\"drop-follow-when\" placeholder=\"Tomorrow · Friday\">";
    tog.parentNode.insertBefore(pane, tog.nextSibling);
  }
  function bootDropKinds() {
    injectDropUI();
    var kindSel = document.getElementById("kind"); if (!kindSel) return "wait";
    var startKind = paintKinds(kindSel, kindSel.value || "request");
    var startType = typeOf(startKind);
    paintKindFields(document.getElementById("kind-fields"), startKind);
    var outcome = paintOutcomes(document.getElementById("outcome-chips"), startType.outcome || "wait");
    var hint = document.getElementById("outcome-hint");
    var row = outcomeOf(outcome); if (hint && row) hint.textContent = row.next;
    window.__aiaOutcome = outcome;
    window.__aiaActions = window.__aiaActions || { rules: true };
    var actBox = document.getElementById("drop-actions"); var actHint = document.getElementById("action-hint");
    paintActions(actBox, window.__aiaActions); if (actHint) actHint.textContent = actionHint(window.__aiaActions);
    if (actBox) actBox.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action]"); if (!btn) return;
      var id = btn.getAttribute("data-action");
      window.__aiaActions[id] = !window.__aiaActions[id];
      if (id === "calendar") { window.__aiaOutcome = paintOutcomes(document.getElementById("outcome-chips"), "book"); if (hint) hint.textContent = (outcomeOf("book") || {}).next || ""; }
      if (id === "owner") { window.__aiaOutcome = paintOutcomes(document.getElementById("outcome-chips"), "wait"); if (hint) hint.textContent = (outcomeOf("wait") || {}).next || ""; }
      if (id === "hand") { window.__aiaOutcome = paintOutcomes(document.getElementById("outcome-chips"), "hand"); if (hint) hint.textContent = (outcomeOf("hand") || {}).next || ""; }
      paintActions(actBox, window.__aiaActions); if (actHint) actHint.textContent = actionHint(window.__aiaActions);
    });
    var tog = document.getElementById("adv-toggle"); var pane = document.getElementById("pane-auto");
    if (tog && pane) {
      if (deskIsOpen()) { pane.hidden = false; tog.classList.add("on"); }
      tog.addEventListener("click", function () { pane.hidden = !pane.hidden; tog.classList.toggle("on", !pane.hidden); });
    }
    if (deskIsOpen()) {
      try {
        var ws = localStorage.getItem("aia_ws") || ""; var pin = localStorage.getItem("aia_pin") || "";
        var headers = { "Content-Type": "application/json" }; if (ws) headers["X-Workspace"] = ws; if (pin) headers["X-Pin"] = pin;
        fetch("/api/auth", { headers: headers }).then(function (r) { return r.json(); }).then(function (data) {
          var people = (data && data.workspace && data.workspace.people) || (data && data.people) || [];
          var hand = document.getElementById("drop-hand"); if (!hand || !people.length) return;
          var cur = hand.value;
          hand.innerHTML = "<option value=\"\">Leave on the queue</option>" + people.map(function (p) {
            var name = p.name || p.id || "";
            return "<option value=\"" + String(name).replace(/"/g, "") + "\">" + name + (p.role === "owner" ? " · owner" : "") + "</option>";
          }).join("");
          if (cur) hand.value = cur;
        }).catch(function () {});
      } catch (e) {}
    }
    kindSel.addEventListener("change", function () {
      var t = typeOf(kindSel.value);
      paintKindFields(document.getElementById("kind-fields"), t.id);
      window.__aiaOutcome = paintOutcomes(document.getElementById("outcome-chips"), t.outcome);
      if (hint) hint.textContent = (outcomeOf(window.__aiaOutcome) || {}).next || "";
    });
    var outBox = document.getElementById("outcome-chips");
    if (outBox) outBox.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-outcome]"); if (!btn) return;
      window.__aiaOutcome = paintOutcomes(outBox, btn.getAttribute("data-outcome"));
      if (hint) hint.textContent = (outcomeOf(window.__aiaOutcome) || {}).next || "";
    });
    if (!window.__aiaFetchWrap) {
      window.__aiaFetchWrap = true;
      var real = window.fetch;
      window.fetch = function (url, opts) {
        try {
          if (String(url).indexOf("/api/jobs") >= 0 && opts && opts.body) {
            var body = JSON.parse(opts.body);
            if (body && body.action === "capture") {
              var extras = collectKindFields();
              var picked = window.__aiaOutcome || "wait";
              body.outcome = picked; body.wanted = picked;
              if (extras.timing) body.timing = extras.timing;
              if (extras.amount) { var n = Number(extras.amount); if (isFinite(n) && n > 0) body.amount = n; }
              if (extras.condition) body.condition = extras.condition;
              if (extras.phone && !body.phone) body.phone = extras.phone;
              if (extras.need && !body.notes) body.notes = extras.need;
              if (extras.whoFor && !body.contactName) body.contactName = extras.whoFor;
              var auto = collectAutomation();
              if (auto.pack) body.pack = auto.pack;
              if (auto.handTo) { body.assignee = auto.handTo; body.handTo = auto.handTo; }
              if (auto.followWhen) body.timing = body.timing || auto.followWhen;
              body.custom = Object.assign({}, body.custom || {}, extras, { outcome: picked, automation: auto, follow: !!auto.follow, runRules: auto.rules !== false, draftAfter: !!auto.draft, ownerFirst: !!auto.owner });
              opts = Object.assign({}, opts, { body: JSON.stringify(body) });
              window.__aiaPendingAuto = auto;
            }
          }
        } catch (e) {}
        var req = real.call(this, url, opts);
        try {
          if (String(url).indexOf("/api/jobs") >= 0 && opts && opts.body && JSON.parse(opts.body).action === "capture") {
            return req.then(function (res) {
              var copy = res.clone();
              copy.json().then(function (out) {
                var job = out && (out.job || out.data || out); var id = job && job.id;
                var auto = window.__aiaPendingAuto || {}; var headers = (opts && opts.headers) || {};
                if (id && auto.draft) real.call(window, "/api/jobs", { method: "POST", headers: headers, body: JSON.stringify({ action: "recommend", id: id }) });
                if (id && auto.handTo) real.call(window, "/api/jobs", { method: "POST", headers: headers, body: JSON.stringify({ action: "assign", id: id, name: auto.handTo }) });
              }).catch(function () {});
              return res;
            });
          }
        } catch (e2) {}
        return req;
      };
    }
    return window.__aiaOutcome;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootDropKinds);
  else bootDropKinds();
  window.AIADropAgent = { WHO: WHO, TYPES: TYPES, OUTCOMES: OUTCOMES, ACTIONS: ACTIONS, implementFromText: implementFromText, paintWho: paintWho, paintPreview: paintPreview, paintKinds: paintKinds, paintKindFields: paintKindFields, collectKindFields: collectKindFields, paintOutcomes: paintOutcomes, typeOf: typeOf, outcomeOf: outcomeOf, applyKindToForm: applyKindToForm, bootDropKinds: bootDropKinds, firstLine: firstLine, val: val };
})();
