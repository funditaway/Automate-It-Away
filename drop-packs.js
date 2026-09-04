(function () {
  var PACK_META = {
    home: { id: "home", name: "Home", kinds: ["chore", "school", "form", "reminder", "request", "pickup", "ride"], hint: "Home desk. School, chore, reminder. Cap same-day. Ask if a kid is named." },
    consign: { id: "consign", name: "Consign", kinds: ["list", "photo", "walk-in"], hint: "Resale desk. Photo and list. Draft only. Payout waits on you." },
    vita: { id: "vita", name: "Insurance", kinds: ["quote", "call", "follow", "book", "illustration", "app", "review", "service", "claim", "uw", "final", "term", "iul", "sitdown"], hint: "Insurance desk. Quote, missed call, sit-down, illustration. Bind stays off. You still send." },
    fund: { id: "fund", name: "Fund", kinds: ["request", "follow", "form"], hint: "Fund desk. Campaign note. Credit decision waits on you." },
    land: { id: "land", name: "Land", kinds: ["quote", "follow", "request"], hint: "Land desk. Lot interest. Cap flood and title." },
    "aia-adoption": { id: "aia-adoption", name: "Try it on this desk", kinds: ["task", "errand", "idea", "project"], hint: "Try first. Drop real work. AIA drafts. You tap Yes or Stop. Collect stays HOLD." }
  };
  function packMeta(id) {
    var key = String(id || "").toLowerCase();
    return PACK_META[key] || { id: key, name: key || "Pack", kinds: [], hint: "Pack on this desk. Draft only." };
  }
  function inferPacks(shop) {
    var listed = [];
    function add(id) {
      var s = String(id || "").toLowerCase();
      if (!s) return;
      if (s === "insurance" || s === "quote") s = "vita";
      if (s === "family") s = "home";
      if (s === "resale" || s === "consignment") s = "consign";
      if (listed.indexOf(s) < 0) listed.push(s);
    }
    if (shop && Array.isArray(shop.packs)) shop.packs.forEach(function (p) { add(p && (p.id || p)); });
    if (shop && Array.isArray(shop.packIds)) shop.packIds.forEach(add);
    if (shop && shop.packId) add(shop.packId);
    if (!listed.length && shop && shop.model) {
      var m = String(shop.model).toLowerCase();
      Object.keys(PACK_META).forEach(function (id) {
        if (m.indexOf(id) >= 0 || m.indexOf(PACK_META[id].name.toLowerCase()) >= 0) add(id);
      });
      if (/insurance|quote it away/.test(m)) add("vita");
    }
    var q = new URLSearchParams(location.search).get("pack");
    if (q) add(q);
    return listed.slice(0, 12);
  }
  function kindsForPacks(ids, selected) {
    var use = selected && selected !== "all" ? [selected] : (ids && ids.length ? ids : []);
    var out = [];
    use.forEach(function (id) {
      (packMeta(id).kinds || []).forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); });
    });
    return out;
  }
  function hintFor(ids, selected) {
    var vitaOn = (ids || []).indexOf("vita") >= 0;
    if (!ids || !ids.length) return "";
    if (selected && selected !== "all") return packMeta(selected).hint;
    if (ids.length === 1) return packMeta(ids[0]).hint;
    var names = ids.map(function (id) { return packMeta(id).name; }).join(" and ");
    return "This desk runs " + names + ". Pick a pack or leave All." + (vitaOn ? " Bind stays off." : "");
  }
  function applyDeskPack(id, paint) {
    var ids = window.__aiaPacks || [];
    var sel = id || window.__aiaPack || (ids.length === 1 ? ids[0] : "all");
    if (sel !== "all" && ids.length && ids.indexOf(sel) < 0 && !PACK_META[sel]) sel = ids.length === 1 ? ids[0] : "all";
    window.__aiaPack = sel;
    var packSel = document.getElementById("drop-pack");
    if (packSel && sel && sel !== "all") packSel.value = sel;
    var vitaOn = ids.indexOf("vita") >= 0 && (sel === "all" || sel === "vita");
    window.__aiaRail = !!(vitaOn || ids.indexOf("consign") >= 0 || ids.indexOf("land") >= 0 || ids.indexOf("fund") >= 0);
    if (vitaOn) {
      window.__aiaCrew = window.__aiaCrew || "Rail";
      if (window.AIADropAgent && AIADropAgent.paintCrew) AIADropAgent.paintCrew("Rail");
    } else if (ids.length > 1 && sel === "all") {
      window.__aiaCrew = window.__aiaCrew || "Packer";
      if (window.AIADropAgent && AIADropAgent.paintCrew) AIADropAgent.paintCrew("Packer");
    }
    var host = document.getElementById("pack-chips");
    if (host) host.querySelectorAll("[data-pack]").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-pack") === sel);
    });
    var hint = document.getElementById("pack-hint");
    if (hint) hint.textContent = hintFor(ids, sel);
    var kindSel = document.getElementById("kind");
    var allow = kindsForPacks(ids, sel);
    if (kindSel && allow.length && window.AIADropAgent && AIADropAgent.TYPES) {
      var keep = AIADropAgent.TYPES.filter(function (t) {
        return allow.indexOf(t.id) >= 0 || t.id === "request" || t.id === "note" || t.id === "custom";
      });
      var cur = kindSel.value;
      kindSel.innerHTML = keep.map(function (t) { return "<option value=\"" + t.id + "\">" + t.label + "</option>"; }).join("");
      if (keep.some(function (t) { return t.id === cur; })) kindSel.value = cur;
    }
    if (paint && window.AIADropTalk && AIADropTalk.preferPack) AIADropTalk.preferPack(sel, ids);
  }
  function paintPackChips(shop) {
    var ids = inferPacks(shop || {});
    window.__aiaPacks = ids;
    window.__aiaActivePacks = ids;
    if (!window.__aiaPack || (window.__aiaPack !== "all" && ids.indexOf(window.__aiaPack) < 0)) {
      window.__aiaPack = ids.length === 1 ? ids[0] : (ids.length ? "all" : "");
    }
    var host = document.getElementById("pack-chips");
    var hint = document.getElementById("pack-hint");
    var modes = document.getElementById("modes");
    if (!host && modes && modes.parentNode) {
      host = document.createElement("div");
      host.id = "pack-chips";
      host.className = "who-chips";
      hint = document.createElement("p");
      hint.id = "pack-hint";
      hint.className = "sub";
      modes.parentNode.insertBefore(host, modes.nextSibling);
      host.parentNode.insertBefore(hint, host.nextSibling);
    }
    if (!host) return ids;
    if (ids.length < 2) {
      host.hidden = true;
      if (hint) hint.textContent = ids[0] ? packMeta(ids[0]).hint : "";
      if (ids[0]) applyDeskPack(ids[0], false);
      return ids;
    }
    host.hidden = false;
    var sel = window.__aiaPack || "all";
    var bits = ["<button type=\"button\" data-pack=\"all\">All</button>"];
    ids.forEach(function (id) { bits.push("<button type=\"button\" data-pack=\"" + packMeta(id).id + "\">" + packMeta(id).name + "</button>"); });
    host.innerHTML = bits.join("");
    if (!host.__bound) {
      host.__bound = true;
      host.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-pack]");
        if (!btn) return;
        applyDeskPack(btn.getAttribute("data-pack"), true);
      });
    }
    applyDeskPack(sel, false);
    return ids;
  }
  function stampPacks(body) {
    var ids = window.__aiaPacks || [];
    var sel = window.__aiaPack && window.__aiaPack !== "all" ? window.__aiaPack : (ids.length === 1 ? ids[0] : "");
    var meta = sel ? packMeta(sel) : null;
    if (sel) body.pack = sel;
    body.custom = Object.assign({}, body.custom || {}, {
      pack: sel || "",
      packName: meta ? meta.name : "",
      packs: ids,
      rail: !!(window.__aiaRail || ids.indexOf("vita") >= 0)
    });
    return body;
  }
  window.AIADropPacks = {
    PACK_META: PACK_META,
    packMeta: packMeta,
    findPack: packMeta,
    inferPacks: inferPacks,
    kindsForPacks: kindsForPacks,
    hintFor: hintFor,
    paintPackChips: paintPackChips,
    applyDeskPack: applyDeskPack,
    stampPacks: stampPacks,
    stamp: stampPacks,
    boot: paintPackChips
  };
  function attachAgent() {
    if (!window.AIADropAgent) return;
    AIADropAgent.PACK_META = PACK_META;
    AIADropAgent.inferPacks = inferPacks;
    AIADropAgent.paintPackChips = paintPackChips;
    AIADropAgent.applyDeskPack = applyDeskPack;
    AIADropAgent.stampPacks = stampPacks;
    AIADropAgent.kindsForPacks = kindsForPacks;
  }
  attachAgent();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", attachAgent);
})();
