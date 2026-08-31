(function () {
  var WHO = ["family", "friend", "helper", "staff"];
  var TYPES = [
    { id: "request", label: "A request", fields: ["need", "timing"], outcome: "wait" },
    { id: "note", label: "A note", fields: ["need"], outcome: "note" },
    { id: "call", label: "Missed call", fields: ["phone", "timing"], outcome: "call" },
    { id: "message", label: "A message to send", fields: ["whoFor", "phone", "need"], outcome: "text" },
    { id: "pickup", label: "Pickup / drop-off", fields: ["where", "timing", "whoFor"], outcome: "book" },
    { id: "ride", label: "A ride", fields: ["fromWhere", "where", "timing"], outcome: "book" },
    { id: "reminder", label: "A reminder", fields: ["timing", "need"], outcome: "book" },
    { id: "book", label: "Book a time", fields: ["timing", "where", "whoFor"], outcome: "book" },
    { id: "chore", label: "Chore / errand", fields: ["need", "timing", "where"], outcome: "hand" },
    { id: "form", label: "Form / paper", fields: ["timing", "need"], outcome: "wait" },
    { id: "photo", label: "A photo", fields: ["need"], outcome: "note" },
    { id: "list", label: "List / sell", fields: ["condition", "amount", "need"], outcome: "list" },
    { id: "quote", label: "Need a quote", fields: ["need", "amount"], outcome: "quote" },
    { id: "follow", label: "Follow up", fields: ["whoFor", "timing", "need"], outcome: "call" },
    { id: "walk-in", label: "Walk-in job", fields: ["need", "timing", "amount"], outcome: "wait" }
  ];
  var FIELDSPEC = {
    need: { label: "What is needed", ph: "Oil change · pickup at school" },
    whoFor: { label: "Who it is for", ph: "Sam" },
    where: { label: "Where", ph: "School · shop · house" },
    fromWhere: { label: "From", ph: "Practice" },
    timing: { label: "When", ph: "Friday 3pm" },
    amount: { label: "Amount note", ph: "85", mode: "decimal" },
    condition: { label: "Condition", ph: "Good / needs clean" },
    phone: { label: "Callback number", ph: "417-555-0100", mode: "tel" }
  };
  var OUTCOMES = [
    { id: "text", label: "Text them", next: "Copy or text the draft. Desk does not send." },
    { id: "email", label: "Email them", next: "Copy or email the draft. Desk does not send." },
    { id: "call", label: "Call them back", next: "Call them back. Then mark it done." },
    { id: "book", label: "Put it on the calendar", next: "Save the phone calendar file. Google write stays off until the key is set." },
    { id: "hand", label: "Hand it to someone", next: "Hand this to a name on People." },
    { id: "list", label: "Draft a listing", next: "Draft the listing. Owner taps Yes." },
    { id: "quote", label: "Draft a quote", next: "Draft only. Do not send a quote from here." },
    { id: "wait", label: "Owner decides", next: "Owner picks Yes or Stop." },
    { id: "note", label: "Just keep the note", next: "Leave it on the queue. No send." }
  ];

  function typeOf(id) {
    var i;
    for (i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return TYPES[i];
    return TYPES[0];
  }
  function outcomeOf(id) {
    var i;
    for (i = 0; i < OUTCOMES.length; i++) if (OUTCOMES[i].id === id) return OUTCOMES[i];
    return null;
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function firstLine(text) {
    return String(text || "").split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean)[0] || "";
  }

  function implementFromText(text, fields) {
    var blob = String(text || "").trim();
    var out = { custom: {} };
    if (!blob) return out;
    var email = blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (email) out.email = email[0];
    var phone = blob.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/);
    if (phone) out.phone = phone[0];
    var dollars = blob.match(/\$\s*(\d+(?:\.\d{1,2})?)/) || blob.match(/\b(\d+(?:\.\d{1,2})?)\s*(?:dollars|usd)\b/i);
    if (dollars) {
      var n = Number(dollars[1]);
      if (isFinite(n)) out.amount = n;
    }
    var when = blob.match(/\b(?:by |due |on |at )?((?:mon|tue|wed|thu|fri|sat|sun)[a-z]*(?:\s+\d{1,2}(?:\/\d{1,2})?)?(?:\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
    if (when) out.timing = String(when[1] || when[0]).trim().slice(0, 80);
    var named = blob.match(/\b(?:from|name|i am|i'm|this is)\s*[:\-]?\s*([A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+)?)/i);
    if (named) out.contactName = named[1].trim().slice(0, 80);
    var title = firstLine(blob).replace(/^[-*•]\s*/, "").slice(0, 160);
    if (title) out.title = title;
    (fields || []).forEach(function (f) {
      if (!f || !f.key) return;
      var label = String(f.label || f.key);
      var re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[:=]\\s*([^,;\\n]+)", "i");
      var m = blob.match(re);
      if (m) out.custom[f.key] = m[1].trim().slice(0, 200);
    });
    return out;
  }

  function paintWho(current) {
    var box = document.getElementById("who-chips");
    if (!box) return current || "helper";
    var on = WHO.indexOf(current) >= 0 ? current : "helper";
    box.innerHTML = WHO.map(function (k) {
      return "<button type=\"button\" class=\"" + (k === on ? "on" : "") + "\" data-who=\"" + k + "\">" + k + "</button>";
    }).join("");
    return on;
  }

  function paintPreview(mapped) {
    var box = document.getElementById("agent-preview");
    if (!box) return;
    var bits = [];
    if (mapped.title) bits.push("Title · " + mapped.title);
    if (mapped.contactName) bits.push("Name · " + mapped.contactName);
    if (mapped.phone) bits.push("Phone · " + mapped.phone);
    if (mapped.email) bits.push("Email · " + mapped.email);
    if (mapped.amount != null) bits.push("Amount note · $" + mapped.amount);
    if (mapped.timing) bits.push("When · " + mapped.timing);
    Object.keys(mapped.custom || {}).forEach(function (k) {
      bits.push(k + " · " + mapped.custom[k]);
    });
    if (!bits.length) {
      box.hidden = true;
      box.textContent = "";
      return;
    }
    box.hidden = false;
    box.textContent = "Lands as: " + bits.join(" · ") + ". Still a draft. Nobody sends money from here.";
  }

  function paintKinds(sel, current) {
    if (!sel) return current || "request";
    var on = current || sel.value || "request";
    if (!typeOf(on) || typeOf(on).id !== on) on = "request";
    sel.innerHTML = TYPES.map(function (t) {
      return "<option value=\"" + t.id + "\"" + (t.id === on ? " selected" : "") + ">" + t.label + "</option>";
    }).join("");
    sel.value = on;
    return on;
  }

  function paintKindFields(box, kindId, preset) {
    if (!box) return;
    var t = typeOf(kindId);
    var have = preset || {};
    box.innerHTML = (t.fields || []).map(function (key) {
      var spec = FIELDSPEC[key] || { label: key, ph: "" };
      var mode = spec.mode ? (" inputmode=\"" + spec.mode + "\"") : "";
      var val = have[key] ? String(have[key]).replace(/"/g, "&quot;") : "";
      return "<label>" + spec.label + "</label>" +
        "<input data-kind-field=\"" + key + "\" placeholder=\"" + spec.ph + "\"" + mode + " value=\"" + val + "\">";
    }).join("");
  }

  function collectKindFields() {
    var out = {};
    var nodes = document.querySelectorAll("[data-kind-field]");
    var i;
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute("data-kind-field");
      var v = String(el.value || "").trim();
      if (key && v) out[key] = v.slice(0, 200);
    }
    return out;
  }

  function paintOutcomes(box, current) {
    if (!box) return current || "wait";
    var on = current || "wait";
    if (!outcomeOf(on)) on = "wait";
    box.innerHTML = OUTCOMES.map(function (o) {
      return "<button type=\"button\" class=\"" + (o.id === on ? "on" : "") + "\" data-outcome=\"" + o.id + "\">" + o.label + "</button>";
    }).join("");
    return on;
  }

  function applyKindToForm(kindId, extras) {
    extras = extras || {};
    if (extras.timing && document.getElementById("timing")) document.getElementById("timing").value = extras.timing;
    if (extras.amount && document.getElementById("amount")) document.getElementById("amount").value = extras.amount;
    if (extras.condition && document.getElementById("condition")) document.getElementById("condition").value = extras.condition;
    if (extras.phone && document.getElementById("phone") && !document.getElementById("phone").value) {
      document.getElementById("phone").value = extras.phone;
    }
    if (extras.need && document.getElementById("note") && !document.getElementById("note").value) {
      document.getElementById("note").value = extras.need;
    }
    if (extras.whoFor && document.getElementById("who") && !document.getElementById("who").value) {
      document.getElementById("who").value = extras.whoFor;
    }
  }

  window.AIADropAgent = {
    WHO: WHO,
    TYPES: TYPES,
    OUTCOMES: OUTCOMES,
    implementFromText: implementFromText,
    paintWho: paintWho,
    paintPreview: paintPreview,
    paintKinds: paintKinds,
    paintKindFields: paintKindFields,
    collectKindFields: collectKindFields,
    paintOutcomes: paintOutcomes,
    typeOf: typeOf,
    outcomeOf: outcomeOf,
    applyKindToForm: applyKindToForm,
    firstLine: firstLine,
    val: val
  };
})();
