(function () {
  var FACES = {
    vita: {
      id: "vita", name: "Insurance",
      who: "Who it is for", what: "What they need", when: "When", where: "State",
      how: "Draft a packet. Bind stays off.",
      next: "Draft the packet. Illustration send is an owner tap.",
      rails: ["Bind stays off the desk.", "Illustration send is an owner tap.", "Do not invent premium, face, health, or approved."],
      keys: { who: ["whoFor", "contactName", "who"], what: ["need", "product", "title", "kind"], when: ["timing", "when"], where: ["state", "where"], how: ["product", "face", "carrier"] }
    },
    home: {
      id: "home", name: "Home",
      who: "Who it is for", what: "What is needed", when: "When", where: "Where",
      how: "Text, calendar file, or hand it.",
      next: "Cap same-day. Ask if a kid is named.",
      rails: ["Cap same-day cards.", "Ask me if a kid or school is named."],
      keys: { who: ["whoFor", "contactName", "who"], what: ["need", "title", "kind"], when: ["timing", "when"], where: ["where"], how: ["need"] }
    },
    consign: {
      id: "consign", name: "Consign",
      who: "Seller", what: "Item", when: "List when", where: "Photo / channel",
      how: "Draft a listing. Payout waits.",
      next: "Draft the title. Payout waits on you.",
      rails: ["Cap title-missing items.", "Wait on me before a payout leaves."],
      keys: { who: ["contactName", "who"], what: ["title", "need", "condition"], when: ["timing", "when"], where: ["where"], how: ["condition", "ask", "amount"] }
    },
    fund: {
      id: "fund", name: "Fund",
      who: "Campaign owner", what: "Campaign", when: "Raise window", where: "Page",
      how: "Draft the page. Credit waits.",
      next: "Draft the page. Credit decision waits on you.",
      rails: ["Wait on me before a credit decision."],
      keys: { who: ["contactName", "who"], what: ["campaign", "title", "need"], when: ["timing", "when"], where: ["where"], how: ["amount"] }
    },
    land: {
      id: "land", name: "Land",
      who: "Buyer", what: "Lot", when: "Interest when", where: "Flood / access",
      how: "Lot note. Cap flood and title.",
      next: "Write the lot note. Cap flood and title.",
      rails: ["Cap flood cards.", "Cap title cards."],
      keys: { who: ["contactName", "who"], what: ["lot", "title", "need"], when: ["timing", "when"], where: ["where"], how: ["title"] }
    }
  };
  function first(j, keys) {
    var custom = (j && j.custom) || {};
    var face = custom.face || {};
    var i;
    for (i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = face[k] || custom[k] || (j && j[k]);
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return "";
  }
  function packId(j) {
    if (!j) return "";
    var custom = j.custom || {};
    var raw = j.pack || custom.pack || (custom.packs && custom.packs[0]) || "";
    var s = String(raw || "").toLowerCase();
    if (s === "insurance" || s === "quote" || s === "year2" || s === "missed-call") s = "vita";
    if (s === "family") s = "home";
    if (s === "resale" || s === "consignment") s = "consign";
    return FACES[s] ? s : "";
  }
  function faceOf(j) {
    var id = packId(j);
    return id ? FACES[id] : null;
  }
  function valuesOf(j) {
    var face = faceOf(j);
    if (!face) return null;
    return {
      who: first(j, face.keys.who),
      what: first(j, face.keys.what) || String((j && (j.title || j.kind)) || ""),
      when: first(j, face.keys.when) || String((j && j.timing) || ""),
      where: first(j, face.keys.where),
      how: first(j, face.keys.how) || face.how
    };
  }
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
    });
  }
  function badgeHtml(j) {
    var face = faceOf(j);
    if (!face) return "";
    return "<span class=\"pack-badge\">" + esc(face.name) + "</span>";
  }
  function queueLine(j) {
    var face = faceOf(j);
    if (!face) return "";
    var v = valuesOf(j) || {};
    var bits = [face.name];
    if (j && j.kind) bits.push(j.kind);
    if (v.what && bits.indexOf(v.what) < 0) bits.push(v.what);
    if (v.where) bits.push(v.where);
    if (v.when) bits.push(v.when);
    return bits.slice(0, 5).join(" · ");
  }
  function viewHtml(j) {
    var face = faceOf(j);
    if (!face) return "";
    var v = valuesOf(j) || {};
    var rows = [
      ["Who", face.who, v.who],
      ["What", face.what, v.what],
      ["When", face.when, v.when],
      ["Where", face.where, v.where],
      ["How", face.how, v.how]
    ].filter(function (r) { return r[2]; });
    var rails = (face.rails || []).slice(0, 2).join(" ");
    return "<div class=\"pack-face\" data-pack=\"" + esc(face.id) + "\">" +
      "<p class=\"meta pack-line\">" + esc(face.name) + (j && j.kind ? " · " + esc(j.kind) : "") + " · " + esc(face.next) + "</p>" +
      (rows.length ? "<dl class=\"pack-5w\">" + rows.map(function (r) {
        return "<div><dt>" + esc(r[1]) + "</dt><dd>" + esc(r[2]) + "</dd></div>";
      }).join("") + "</dl>" : "") +
      (rails ? "<p class=\"meta pack-rail\">" + esc(rails) + "</p>" : "") +
      "</div>";
  }
  function fieldInputs(j) {
    var face = faceOf(j);
    if (!face) return "";
    var v = valuesOf(j) || {};
    var slots = [
      { slot: "who", label: face.who, key: face.keys.who[0], val: v.who },
      { slot: "what", label: face.what, key: face.keys.what[0], val: v.what },
      { slot: "when", label: face.when, key: face.keys.when[0], val: v.when },
      { slot: "where", label: face.where, key: face.keys.where[0], val: v.where }
    ];
    return slots.map(function (s) {
      return "<label>" + esc(s.label) + "</label><input data-field=\"" + esc(s.key) + "\" data-slot=\"" + esc(s.slot) + "\" value=\"" + esc(s.val) + "\" placeholder=\"" + esc(s.label) + "\">";
    }).join("");
  }
  function stampFace(body, extra) {
    body = body || {};
    extra = extra || {};
    var id = packId({ pack: body.pack || extra.pack, custom: body.custom || {} }) || extra.pack || "";
    var face = FACES[id];
    body.custom = Object.assign({}, body.custom || {});
    if (id) {
      body.pack = id;
      body.custom.pack = id;
      body.custom.packName = face ? face.name : id;
    }
    var blob = Object.assign({}, extra, body, body.custom || {});
    var fake = { pack: id, title: blob.title, kind: blob.kind, timing: blob.timing, contactName: blob.contactName || blob.who, custom: blob };
    var v = valuesOf(fake) || {};
    body.custom.face = {
      who: v.who || extra.who || "",
      what: v.what || extra.what || "",
      when: v.when || extra.when || blob.timing || "",
      where: v.where || extra.where || "",
      how: (face && face.how) || extra.how || ""
    };
    return body;
  }
  function grokHint(j) {
    var face = faceOf(j);
    if (!face) return "";
    return "Pack is " + face.name + ". Draft in that pack's language. Fill only that pack's who / what / when / where / how. " + face.rails.join(" ") + " Never invent money. Human taps Yes or Stop.";
  }
  function ensureCss() {
    if (document.getElementById("pack-card-css")) return;
    var css = document.createElement("style");
    css.id = "pack-card-css";
    css.textContent = ".pack-badge{display:inline-block;margin:0 6px 0 0;padding:2px 8px;border-radius:999px;background:var(--edit);color:var(--edit-ink);font:700 11px system-ui,sans-serif}" +
      ".pack-face{margin:8px 0;padding:8px 10px;border:1px solid var(--line);border-radius:10px}" +
      ".pack-5w{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0 0}" +
      ".pack-5w dt{font:700 11px system-ui,sans-serif;color:var(--heading)}" +
      ".pack-5w dd{font-size:13px;margin:2px 0 0}" +
      ".pack-rail{color:var(--heading);font-weight:600}" +
      "@media(max-width:640px){.pack-5w{grid-template-columns:1fr}}";
    document.head.appendChild(css);
  }
  window.AIAPackCard = {
    FACES: FACES, packId: packId, faceOf: faceOf, valuesOf: valuesOf,
    badgeHtml: badgeHtml, queueLine: queueLine, viewHtml: viewHtml,
    fieldInputs: fieldInputs, stampFace: stampFace, grokHint: grokHint, ensureCss: ensureCss
  };
  window.AIAPackFace = {
    FACES: FACES,
    packOf: faceOf,
    line: function (j) {
      var line = queueLine(j);
      return line ? "<p class=\"meta pack-face\">" + badgeHtml(j) + " " + esc(line) + "</p>" : "";
    },
    sheet: function (j) { return viewHtml(j) + fieldInputs(j); },
    brief: grokHint,
    ask: function (id) {
      var f = FACES[id] || FACES.home;
      return [f.who, f.what, f.when, f.where];
    }
  };
  function wrapCard() {
    if (typeof window.card !== "function" || window.card.__aiaPackFace) return;
    var prev = window.card;
    window.card = function (j, staff) {
      var html = prev(j, staff);
      var face = window.AIAPackFace.line(j);
      if (!html || !face || html.indexOf("pack-face") >= 0) return html;
      return html.replace("</h3>", "</h3>" + face);
    };
    window.card.__aiaPackFace = true;
  }
  function wrapSheet() {
    var host = document.getElementById("sheet-card");
    if (!host || host.__aiaPackFace) return;
    host.__aiaPackFace = true;
    var obs = new MutationObserver(function () {
      if (host.querySelector(".pack-face")) return;
      var idEl = document.getElementById("job-id");
      var id = idEl && idEl.value;
      var jobs = window.JOBS || [];
      var j = jobs.filter(function (x) { return x && x.id === id; })[0];
      if (!j) return;
      var sheet = window.AIAPackFace.sheet(j);
      if (!sheet) return;
      var h = host.querySelector("h3");
      if (h) h.insertAdjacentHTML("afterend", sheet);
    });
    obs.observe(host, { childList: true, subtree: true });
  }
  function boot() {
    ensureCss();
    wrapCard();
    wrapSheet();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 400);
})();
