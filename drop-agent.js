(function () {
  var WHO = ["family", "friend", "helper", "staff"];

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

  window.AIADropAgent = {
    WHO: WHO,
    implementFromText: implementFromText,
    paintWho: paintWho,
    paintPreview: paintPreview,
    firstLine: firstLine,
    val: val
  };
})();
