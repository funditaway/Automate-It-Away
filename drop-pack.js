(function () {
  var PACKS = [];
  var CHIP = "all";
  var Q = "";
  var PICK = null;

  function headers() {
    var h = { "Content-Type": "application/json" };
    var ws = localStorage.getItem("aia_ws");
    var pin = localStorage.getItem("aia_pin");
    if (ws) h["X-Workspace"] = ws;
    if (pin) h["X-Pin"] = pin;
    return h;
  }
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; });
  }
  function labelOf(p) {
    if (!p) return "This desk";
    if (p.id === "vita") return "Insurance";
    return p.name || p.id;
  }
  function filtered() {
    return PACKS.filter(function (p) {
      if (CHIP === "free" && p.priced) return false;
      if (CHIP === "official" && !p.official) return false;
      if (CHIP === "listed" && p.official) return false;
      if (CHIP === "market" && !p.priced) return false;
      if (["home", "consign", "insurance", "fund", "land"].indexOf(CHIP) >= 0) {
        var blob = [p.id, p.name, p.family, p.niche].join(" ").toLowerCase();
        if (CHIP === "insurance") return /insurance|vita|quote/.test(blob);
        return blob.indexOf(CHIP) >= 0;
      }
      return true;
    });
  }
  function fillSelect(sel) {
    if (!sel) return;
    var cur = (PICK && PICK.id) || sel.value || "";
    var rows = PACKS.slice();
    sel.innerHTML = '<option value="">This desk / let the engine pick</option>' + rows.map(function (p) {
      var tag = p.priced ? ("ask $" + p.ask) : (p.official ? "official" : "listed");
      return '<option value="' + esc(p.id) + '">' + esc(labelOf(p)) + " · " + tag + "</option>";
    }).join("");
    if (cur) sel.value = cur;
  }
  function paintRows() {
    var box = document.getElementById("drop-pack-list");
    if (!box) return;
    var rows = filtered();
    if (!rows.length) {
      box.innerHTML = '<p class="sub">No pack matches. Try home, consign, insurance, or a word from your niche.</p>';
      return;
    }
    box.innerHTML = rows.slice(0, 12).map(function (p) {
      var on = PICK && PICK.id === p.id ? " on" : "";
      var tag = p.priced ? ("Ask $" + p.ask + " · tag") : (p.official ? "Official" : "Creator");
      return '<button type="button" class="drop-pack-row' + on + '" data-drop-pack="' + esc(p.id) + '"><b>' + esc(labelOf(p)) + '</b><span>' + esc(p.family || tag) + ' · ' + esc(tag) + '</span><em>' + esc(p.dropHint || p.does || "") + '</em></button>';
    }).join("");
  }
  function inject() {
    if (document.getElementById("drop-pack-pane")) return;
    if (document.body.classList.contains("embed")) return;
    var after = document.getElementById("talkBar") || document.getElementById("modes") || document.getElementById("drop-sub") || document.getElementById("drop-title");
    if (!after || !after.parentNode) return;
    var pane = document.createElement("div");
    pane.id = "drop-pack-pane";
    pane.className = "card";
    pane.innerHTML = '<strong style="color:var(--heading)">Use a pack on this drop</strong><p class="sub" id="drop-pack-hint">Official or a creator pack from the marketplace. Fields land on this card. Packs do not send money.</p><label>Find a pack</label><input id="drop-pack-q" placeholder="find flood · oil change · school"><div class="who-chips" id="drop-pack-chips"></div><div id="drop-pack-list"></div>';
    after.parentNode.insertBefore(pane, after.nextSibling);
    if (!document.getElementById("drop-pack-css")) {
      var css = document.createElement("style");
      css.id = "drop-pack-css";
      css.textContent = "#drop-pack-pane{margin:0 0 14px}#drop-pack-list{display:grid;gap:8px;margin-top:8px}.drop-pack-row{text-align:left;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);padding:10px 12px;min-height:44px;font:600 14px/1.3 system-ui,sans-serif;cursor:pointer}.drop-pack-row b{display:block}.drop-pack-row span,.drop-pack-row em{display:block;font-style:normal;font-weight:500;color:var(--muted);font-size:12px}.drop-pack-row.on{border-color:var(--teal);background:var(--edit);color:var(--edit-ink)}";
      document.head.appendChild(css);
    }
    paintChips();
    var q = document.getElementById("drop-pack-q");
    if (q) q.addEventListener("input", function () { Q = String(q.value || "").replace(/^find\s+/i, "").trim(); load(); });
    var list = document.getElementById("drop-pack-list");
    if (list) list.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-drop-pack]");
      if (btn) pick(btn.getAttribute("data-drop-pack"));
    });
  }
  function paintChips() {
    var box = document.getElementById("drop-pack-chips");
    if (!box) return;
    var chips = ["all", "official", "listed", "free", "home", "consign", "insurance", "fund", "land"];
    box.innerHTML = chips.map(function (c) {
      return '<button type="button" class="' + (CHIP === c ? "on" : "") + '" data-pack-chip="' + c + '">' + (c === "all" ? "All" : c.charAt(0).toUpperCase() + c.slice(1)) + "</button>";
    }).join("");
    box.onclick = function (e) {
      var btn = e.target.closest("[data-pack-chip]");
      if (!btn) return;
      CHIP = btn.getAttribute("data-pack-chip");
      paintChips();
      paintRows();
    };
  }
  function applyFields(pack) {
    if (!pack) return;
    var hint = document.getElementById("drop-pack-hint");
    if (hint) hint.textContent = (pack.dropHint || pack.does || "Pack on this drop.") + (pack.priced ? " Ask is a tag. No card." : " Free.") + " Nobody sends money from here.";
    var note = document.getElementById("note");
    if (note && !note.value && pack.dropHint) note.placeholder = pack.dropHint;
    var kind = document.getElementById("kind");
    if (kind && pack.kinds && pack.kinds[0]) {
      if (![].some.call(kind.options, function (o) { return o.value === pack.kinds[0]; })) {
        var opt = document.createElement("option"); opt.value = pack.kinds[0]; opt.textContent = pack.kinds[0]; kind.appendChild(opt);
      }
      kind.value = pack.kinds[0];
      if (window.AIADropAgent && AIADropAgent.paintKindFields) AIADropAgent.paintKindFields(document.getElementById("kind-fields"), pack.kinds[0]);
    }
    var box = document.getElementById("kind-fields");
    if (box && pack.fields && pack.fields.length) {
      pack.fields.forEach(function (f) {
        if (!f || !f.key) return;
        if (box.querySelector('[data-kind-field="' + f.key + '"]')) return;
        var lab = document.createElement("label"); lab.textContent = f.label || f.key;
        var inp = document.createElement("input"); inp.setAttribute("data-kind-field", f.key); inp.placeholder = f.label || f.key;
        if (f.type === "number") inp.setAttribute("inputmode", "decimal");
        box.appendChild(lab); box.appendChild(inp);
      });
    }
    var sel = document.getElementById("drop-pack");
    if (sel) { fillSelect(sel); sel.value = pack.id; }
    window.__aiaPack = pack;
  }
  function pick(id) {
    var pack = PACKS.filter(function (p) { return p.id === id; })[0];
    if (!pack) return loadOne(id);
    if (PICK && PICK.id === id) { PICK = null; window.__aiaPack = null; var sel = document.getElementById("drop-pack"); if (sel) sel.value = ""; paintRows(); return pack; }
    PICK = pack;
    applyFields(pack);
    paintRows();
    try { sessionStorage.setItem("aia_drop_pack", pack.id); } catch (e) {}
    return pack;
  }
  function loadOne(id) {
    return fetch("/api/desks?packs=1&drop=1&id=" + encodeURIComponent(id), { headers: headers() }).then(function (r) { return r.json(); }).then(function (data) {
      if (data && data.pack) {
        if (!PACKS.some(function (p) { return p.id === data.pack.id; })) PACKS.unshift(data.pack);
        PICK = data.pack;
        applyFields(data.pack);
        paintRows();
      }
      return data && data.pack;
    }).catch(function () { return null; });
  }
  function load() {
    var term = String(Q || "").replace(/^find\s+/i, "").replace(/\bpack\b/gi, " ").trim();
    return fetch("/api/desks?packs=1&q=" + encodeURIComponent(term), { headers: headers() }).then(function (r) { return r.json(); }).then(function (data) {
      PACKS = (data && data.packs) || [];
      fillSelect(document.getElementById("drop-pack"));
      paintRows();
      var saved = "";
      try { saved = sessionStorage.getItem("aia_drop_pack") || ""; } catch (e) {}
      var params = new URLSearchParams(location.search);
      var want = params.get("pack") || saved;
      if (want && !PICK) pick(want);
      return PACKS;
    }).catch(function () { PACKS = []; paintRows(); return PACKS; });
  }
  function applyTalk(text) {
    var raw = String(text || "");
    var m = raw.match(/\b(?:use|with|on)\s+(?:the\s+)?([a-z0-9][\w &-]{1,40}?)\s+pack\b/i) || raw.match(/\bfind\s+([a-z0-9][\w &-]{1,40}?)\s+pack\b/i);
    if (!m) return null;
    var want = String(m[1] || "").trim().toLowerCase();
    if (!want) return null;
    Q = want;
    var q = document.getElementById("drop-pack-q"); if (q) q.value = want;
    var hit = PACKS.filter(function (p) {
      return [p.id, p.name, p.niche, p.family].join(" ").toLowerCase().indexOf(want) >= 0;
    })[0];
    if (hit) return pick(hit.id);
    return load().then(function () {
      var next = PACKS.filter(function (p) { return [p.id, p.name, p.niche].join(" ").toLowerCase().indexOf(want) >= 0; })[0];
      return next ? pick(next.id) : null;
    });
  }
  function current() { return PICK; }
  function boot() {
    var page = (location.pathname || "").replace(/\/+$/, "").split("/").pop() || "";
    if (!/^(drop|widget)$/.test(page.replace(/\.html$/, ""))) return;
    inject();
    load();
    if (window.AIADropTalk && AIADropTalk.fill) {
      var real = AIADropTalk.fill;
      AIADropTalk.fill = function (heard) { applyTalk(heard); return real(heard); };
    }
    window.AIADropPack = { load: load, pick: pick, applyTalk: applyTalk, current: current, packs: function () { return PACKS; } };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
