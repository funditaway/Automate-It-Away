(function () {
  const view = document.getElementById("view");
  const err = document.getElementById("err");
  const ok = document.getElementById("ok");
  if (!view) return;

  let FILTER = "";
  let LAST = [];
  let QUERY = "";

  function headers() {
    const h = { "Content-Type": "application/json" };
    const ws = localStorage.getItem("aia_ws");
    const pin = localStorage.getItem("aia_pin");
    if (ws) h["X-Workspace"] = ws;
    if (pin) h["X-Pin"] = pin;
    return h;
  }
  function hasDesk() {
    return !!(localStorage.getItem("aia_ws") && localStorage.getItem("aia_pin"));
  }
  function deskName() {
    return localStorage.getItem("aia_desk_name") || localStorage.getItem("aia_name") || localStorage.getItem("aia_ws") || "";
  }
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
    });
  }
  function params() { return new URLSearchParams(location.search); }
  function fail(msg) { if (err) { err.style.display = "block"; err.textContent = msg; } if (ok) ok.style.display = "none"; }
  function done(msg) {
    if (ok) { ok.style.display = "block"; ok.innerHTML = msg + ' <a href="/drop">Drop →</a> · <a href="/desk">Desk →</a> · <a href="/rules">Rules →</a>'; }
    if (err) err.style.display = "none";
  }
  function priceOf(p) {
    if (p.priced && Number(p.ask) > 0) return "Ask $" + p.ask + " · Collect HOLD";
    if (p.official) return "AIA · free";
    return "Free listed";
  }
  function fieldChip(f) {
    if (!f) return "";
    if (typeof f === "string") return "<span class=\"feat\">" + esc(f) + " · text</span>";
    const type = f.type || "text";
    return "<span class=\"feat\">" + esc(f.label || f.key) + " · " + esc(type) + "</span>";
  }
  function featurePills(p) {
    const feats = p.features || [];
    if (feats.length) return feats.slice(0, 4).map(function (f) { return "<span class=\"feat\">" + esc(f) + "</span>"; }).join("");
    const fields = (p.fields || []).slice(0, 3).map(fieldChip).join("");
    const kinds = (p.kinds || []).slice(0, 2).map(function (k) { return "<span class=\"feat\">" + esc(k) + "</span>"; }).join("");
    return fields + kinds;
  }
  function shopCard(p) {
    const creatorId = p.creatorId || p.family || p.id || "";
    const useBtn = p.wanted
      ? "<a class=\"use\" href=\"/create?kind=pack&idea=" + encodeURIComponent(p.id) + "\">Make this pack</a>"
      : p.priced
        ? "<button class=\"use\" type=\"button\" data-buy=\"" + esc(p.id) + "\">Buy · install on this desk</button>"
        : "<button class=\"use\" type=\"button\" data-use=\"" + esc(p.id) + "\">Use on this desk</button>";
    const holdNote = p.pipeMissing
      ? "<p class=\"aia-line off\">Ask is listed. No money pipe. Collect stays HOLD. Orange until Square or a live webhook is connected.</p>"
      : (p.priced ? "<p class=\"hint\">Ask listed. Collect stays HOLD until Yes.</p>" : "");
    return "<article class=\"card shop\">" +
      "<b>" + esc(p.name) + "</b>" +
      "<p class=\"tag\">" + esc(p.family || "") + " · " + esc(priceOf(p)) + "</p>" +
      "<p class=\"hint\" style=\"margin:0\">" + esc(p.does || p.dropHint || "") + "</p>" +
      ((p.aiRows && p.aiRows.length) ? "<p class=\"tag\">Desk AI · " + esc(p.aiRows.map(function (a) { return a.aia ? (a.name + " · " + a.aia) : a.name; }).join(", ")) + "</p>" : "") +
      (p.aia ? "<p class=\"tag\">AIA Internet · " + esc(p.aia) + "</p>" : "") +
      "<div class=\"pills\">" + featurePills(p) + "</div>" +
      "<p class=\"tag\">" + (p.official ? "Official AIA" : esc(p.creator || p.family || "Listed creator")) +
        (p.rules ? " · " + p.rules + " rule" + (p.rules === 1 ? "" : "s") : "") +
        (p.priced ? " · Collect HOLD" : "") + "</p>" +
      holdNote +
      "<div class=\"cta\">" +
        useBtn +
        "<a class=\"use ghost\" href=\"/market?pack=" + encodeURIComponent(p.id) + "\">View listing</a>" +
        "<a class=\"use ghost\" href=\"/api/desks?packs=1&download=" + encodeURIComponent(p.aia || p.file || p.id) + "\">Download " + esc(p.file || (p.aia || p.id + ".aia")) + "</a>" +
        "<a class=\"use ghost\" href=\"/drop?pack=" + encodeURIComponent(p.id) + "\">Drop this pack</a>" +
        (creatorId ? "<a class=\"use ghost\" href=\"/market?creator=" + encodeURIComponent(creatorId) + "\">Creator</a>" : "") +
      "</div></article>";
  }
  function filtered(packs) {
    return (packs || []).filter(function (p) {
      if (FILTER === "official") return !!p.official;
      if (FILTER === "listed") return !p.official && !p.priced;
      if (FILTER === "market") return !!p.priced;
      if (FILTER === "free") return !p.priced;
      if (FILTER === "home" || FILTER === "consign" || FILTER === "fund" || FILTER === "land" || FILTER === "aia") {
        return [p.id, p.family, p.niche, p.name, p.creatorId, p.aisle].join(" ").toLowerCase().indexOf(FILTER) >= 0;
      }
      if (FILTER === "insurance") {
        const blob = [p.id, p.family, p.niche, p.name, p.creatorId].join(" ").toLowerCase();
        return blob.indexOf("insurance") >= 0 || blob.indexOf("quote") >= 0 || p.id === "vita";
      }
      return true;
    });
  }
  function shopMarkup(packs) {
    const list = filtered(packs);
    if (!list.length) {
      return "<div class=\"card\"><p class=\"hint\">No pack matches that aisle. Official AIA packs stay free. Make a niche pack in Creators Studio and list it here.</p>" +
        "<div class=\"cta\"><a class=\"use\" href=\"/dev\">Creators Studio</a><a class=\"use ghost\" href=\"/create\">Create instead</a></div></div>";
    }
    return "<div class=\"grid\">" + list.map(shopCard).join("") + "</div>";
  }
  function featuredRow(packs) {
    const official = (packs || []).filter(function (p) { return p.official; });
    if (!official.length || FILTER) return "";
    return "<h2>Official AIA aisle</h2><div class=\"grid\">" + official.map(shopCard).join("") + "</div>";
  }
  function deskBanner() {
    if (!hasDesk()) {
      return "<div class=\"card banner\"><div><b>Open a desk to put a pack on it.</b><p class=\"hint\" style=\"margin:0\">Shopping does not need a login. Use and Preview do.</p></div>" +
        "<div class=\"cta\"><a class=\"use\" href=\"/onboard\">Open a desk</a><a class=\"use ghost\" href=\"/create\">Create instead</a></div></div>";
    }
    return "<div class=\"card banner\"><div><b>Shopping for " + esc(deskName() || "this desk") + "</b><p class=\"hint\" style=\"margin:0\">Use installs the pack JSON onto this desk. Fresh desks start empty. Collect stays HOLD. Packs never Send, Stop, or pay.</p></div>" +
      "<div class=\"cta\"><a class=\"use ghost\" href=\"/desk\">Open the queue</a><a class=\"use ghost\" href=\"/drop\">Drop work</a></div></div>";
  }
  function shopPage(packs) {
    LAST = packs || [];
    view.innerHTML =
      "<h1>Find a pack. Put it on this desk.</h1>" +
      "<p class=\"sub\">Try first. Official packs are free. Open packs on AIA Internet: listed creator JSON installs onto your empty-starting desk. Download or share as a .aia file. Install a .aia onto this desk. A market ask is listed. Collect stays HOLD until a person taps Yes and a money pipe is live. Packs never send money. Queue cards count — not a model demo.</p>" +
      "<p class=\"aia-line off\">.aia names on this desk now. Wallet / registry connect later as a Pipe HOLD.</p>" +
      deskBanner() +
      "<div class=\"strip\">" +
        "<div><b>1. Find</b><span>Search a niche or tap an aisle.</span></div>" +
        "<div><b>2. Open</b><span>See fields, kinds, and rules.</span></div>" +
        "<div><b>3. Use</b><span>Copy it onto your desk.</span></div>" +
        "<div><b>4. Drop</b><span>Stamp one card and work it.</span></div>" +
      "</div>" +
      "<form class=\"card\" id=\"find\">" +
        "<label>Search the shop</label>" +
        "<input name=\"q\" value=\"" + esc(QUERY) + "\" placeholder=\"lawn · flood · oil change · insurance\" autocomplete=\"off\">" +
        "<div class=\"pills\" id=\"pills\">" +
          pill("", "All") + pill("official", "AIA") + pill("free", "Free") + pill("listed", "Listed") + pill("market", "Ask") +
          pill("home", "Home") + pill("consign", "Consign") + pill("insurance", "Insurance") + pill("fund", "Fund") + pill("land", "Land") + pill("aia", "Try it") +
        "</div>" +
        "<button class=\"go\" type=\"submit\" style=\"width:100%;margin-top:10px\">Find packs</button>" +
      "</form>" +
      featuredRow(LAST) +
      "<h2>" + (FILTER ? "That aisle" : "All listed packs") + "</h2>" +
      "<div id=\"rows\">" + shopMarkup(LAST) + "</div>" +
      "<div class=\"card\">" +
        "<b>Sell a pack on AIA</b>" +
        "<p class=\"hint\">Creators Studio lives on /dev. Name the pack on AIA Internet, add a desk AI, write a rule, then list it here or keep it private. Download and install use .aia files. An ask is listed. Collect stays HOLD. No silent charge.</p>" +
        "<div class=\"cta\"><a class=\"use\" href=\"/dev\">Open Creators Studio</a><a class=\"use ghost\" href=\"/account\">Creator / Dev flag</a></div>" +
      "</div>" +
      "<div class=\"card\">" +
        "<b>Install a .aia pack</b>" +
        "<p class=\"hint\">AIA Internet pack file. JSON inside. Named desk AIs and guardrails land on this desk. Private until you list it. Collect stays HOLD.</p>" +
        "<label>Choose a .aia file</label>" +
        "<input id=\"aia-file\" type=\"file\" accept=\".aia,application/json\">" +
        "<div class=\"cta\"><button class=\"use\" type=\"button\" id=\"install-aia\">Install .aia on this desk</button></div>" +
      "</div>" +
      "<p class=\"hint\">Priced packs still install. Collect stays HOLD until Yes and a live money pipe. Packs never bind coverage or move payouts. <a href=\"/legal\">Legal</a>.</p>";
  }
  function pill(id, label) {
    return "<button type=\"button\" data-filter=\"" + id + "\" class=\"" + (FILTER === id ? "on" : "") + "\">" + label + "</button>";
  }
  function ruleLine(r) {
    if (!r) return "";
    if (typeof r === "string") return r;
    const bits = [r.then || "note", r.when || "qualify"];
    if (r.ifKind) bits.push("kind " + r.ifKind);
    if (r.contains) bits.push("has “" + r.contains + "”");
    if (r.ifMoney != null) bits.push("$" + r.ifMoney + "+");
    return (r.text || "") + " · " + bits.join(" · ");
  }
  function listingPage(p) {
    const how = p.how || {};
    const included = (p.included || []).map(function (line) { return "<li>" + esc(line) + "</li>"; }).join("");
    const features = (p.features || []).map(function (f) { return "<span class=\"feat\">" + esc(f) + "</span>"; }).join("");
    const fields = (p.fields || []).map(fieldChip).join("") || "<span class=\"feat\">title · text</span><span class=\"feat\">notes · text</span>";
    const kinds = (p.kinds || []).map(function (k) { return "<span class=\"feat\">" + esc(k) + "</span>"; }).join("");
    const creator = p.creatorProfile || { name: p.creator || p.family || "A desk", family: p.family || "", does: "", href: "/market?creator=" + encodeURIComponent(p.creatorId || p.family || p.id || "") };
    const others = (p.otherPacks || []).map(shopCard).join("");
    const related = (p.relatedOfficial || []).map(shopCard).join("");
    const ownerBtns = hasDesk()
      ? (p.wanted
        ? "<a class=\"use\" href=\"/create?kind=pack&idea=" + encodeURIComponent(p.id) + "\">Make this pack</a>"
        : p.priced
          ? "<button class=\"use\" type=\"button\" data-buy=\"" + esc(p.id) + "\">Buy · install on this desk</button><button class=\"use ghost\" type=\"button\" data-preview=\"" + esc(p.id) + "\">Preview</button>"
          : "<button class=\"use\" type=\"button\" data-use=\"" + esc(p.id) + "\">Use on this desk</button><button class=\"use ghost\" type=\"button\" data-preview=\"" + esc(p.id) + "\">Preview</button>")
      : "<a class=\"use\" href=\"/onboard\">Open a desk to use it</a>";
    view.innerHTML =
      "<a class=\"back\" href=\"/market\">← Shop all packs</a>" +
      "<p class=\"tag\">" + esc(p.family || "") + " · " + esc(priceOf(p)) + (p.official ? " · Official" : " · Creator listing") + (p.aia ? " · " + esc(p.aia) : "") + "</p>" +
      "<h1>" + esc(p.name) + "</h1>" +
      "<p class=\"sub\">" + esc(p.does || "") + "</p>" +
      "<div class=\"cta\">" +
        ownerBtns +
        "<a class=\"use ghost\" href=\"/api/desks?packs=1&download=" + encodeURIComponent(p.aia || p.file || p.id) + "\">Download " + esc(p.file || p.aia || (p.id + ".aia")) + "</a>" +
        "<a class=\"use ghost\" href=\"/drop?pack=" + encodeURIComponent(p.id) + "\">Drop this pack</a>" +
        "<button class=\"use ghost\" type=\"button\" data-copy-link=\"" + esc(p.id) + "\">Copy listing link</button>" +
      "</div>" +
      "<h2>Field types on a card</h2>" +
      "<div class=\"pills\">" + fields + "</div>" +
      (kinds ? "<h2>Kinds this pack knows</h2><div class=\"pills\">" + kinds + "</div>" : "") +
      "<h2>Features</h2>" +
      "<div class=\"pills\">" + (features || "<p class=\"hint\">Same five steps. You send the draft.</p>") + "</div>" +
      "<h2>What’s included</h2>" +
      "<div class=\"card\"><ul class=\"inc\">" + (included || "<li>Name, what it does, fields, five-step words, and listed rules.</li><li>Does not copy pipes, people, or payouts.</li>") + "</ul>" +
        (p.dropHint ? "<p class=\"hint\">Drop hint: " + esc(p.dropHint) + "</p>" : "") +
        ((p.aiRows || []).length
          ? "<p class=\"hint\">Desk AIs that land on the desk</p>" + (p.aiRows || []).map(function (a) {
            return "<p class=\"hint\"><b>" + esc(a.name) + "</b>" + (a.aia ? (" · " + esc(a.aia)) : "") + " · " + esc(a.role || "Doer") + " · drafts " + esc((a.steps || []).join(", ") || "qualify, do, follow") + ". Never Yes / Stop / money / mail.</p>";
          }).join("")
          : "<p class=\"hint\">No named desk AI in this listing. Your desk AIs still apply.</p>") +
        ((p.ruleRows || p.ruleLines || []).length
          ? "<p class=\"hint\">Rules that land on the desk</p>" + (p.ruleRows || p.ruleLines).map(function (r) { return "<p class=\"hint\">" + esc(ruleLine(r)) + "</p>"; }).join("")
          : "<p class=\"hint\">No extra rules in the listing. Your desk rules still apply.</p>") +
      "</div>" +
      "<h2>How the pack works</h2>" +
      "<div class=\"how\">" +
        "<div><b>1. Capture</b>" + esc(how.capture || "Drop the facts this pack named.") + "</div>" +
        "<div><b>2. Qualify</b>" + esc(how.qualify || "Rules Cap or Wait on the words that matter.") + "</div>" +
        "<div><b>3. Do the work</b>" + esc(how.do || "AIA drafts. A person still taps Yes or No.") + "</div>" +
        "<div><b>4. Collect</b>" + esc(how.collect || "Collect stays HOLD until Yes and a live money pipe.") + "</div>" +
        "<div><b>5. Follow</b>" + esc(how.follow || "The card stays on History until it is done.") + "</div>" +
      "</div>" +
      "<h2>On a real desk</h2>" +
      "<p class=\"hint\">No demo chrome. Buy / install puts the thin JSON onto this desk. Fresh desks start empty until a pack or a rule lands.</p>" +
      (p.pipeMissing || (p.collectHold && !p.collectHold.pipe)
        ? "<p class=\"aia-line off\">" + esc((p.collectHold && p.collectHold.note) || "Ask is listed. No money pipe. Collect stays HOLD. Orange until Square or a live webhook is connected.") + "</p>"
        : (p.collectHold && p.collectHold.note ? "<p class=\"hint\">" + esc(p.collectHold.note) + "</p>" : "<p class=\"hint\">Collect stays HOLD. Packs never send money.</p>")) +
      "<h2>Creator</h2>" +
      "<div class=\"card profile\">" +
        "<b>" + esc(creator.name || "") + "</b>" +
        "<p class=\"tag\">" + esc(creator.family || "") + (p.official ? " · Official AIA family" : " · Listed desk") + "</p>" +
        "<p class=\"hint\">" + esc(creator.does || "") + "</p>" +
        "<div class=\"cta\"><a class=\"use ghost\" href=\"" + esc(creator.href || "/market") + "\">View profile and other packs</a></div>" +
      "</div>" +
      (others ? "<h2>Other packs from this creator</h2><div class=\"grid\">" + others + "</div>" : "") +
      (related ? "<h2>Also from AIA</h2><div class=\"grid\">" + related + "</div>" : "") +
      "<p class=\"hint\">Packs never Send, Stop, or pay. A priced pack still installs. Collect stays HOLD. <a href=\"/legal\">Legal</a> · <a href=\"/dev\">Creators Studio</a>.</p>";
  }
  function creatorPage(data) {
    const c = data.creator || {};
    const packs = data.packs || [];
    const others = data.otherPacks || [];
    view.innerHTML =
      "<a class=\"back\" href=\"/market\">← Shop all packs</a>" +
      "<p class=\"tag\">" + (c.id === "grok" || c.sku === false ? "Grok · AIA Studio · same account, not a SKU" : (c.official ? "Official AIA family" : "Listed creator")) + "</p>" +
      "<h1>" + esc(c.name || "Creator") + "</h1>" +
      "<p class=\"sub\">" + esc(c.does || "Packs this creator listed for other desks to use.") + "</p>" +
      "<h2>Packs on the shop</h2>" +
      (packs.length ? "<div class=\"grid\">" + packs.map(shopCard).join("") + "</div>" : "<p class=\"hint\">No listed pack from this creator yet.</p>") +
      (others.length ? "<h2>Other official packs</h2><div class=\"grid\">" + others.map(shopCard).join("") + "</div>" : "") +
      "<div class=\"card\"><b>Make a pack for your niche</b><p class=\"hint\">Any trade, shop, or house desk can list thin JSON. Billing for an ask stays HOLD until Yes.</p>" +
        "<div class=\"cta\"><a class=\"use\" href=\"/dev\">Open Creators Studio</a></div></div>";
  }
  async function loadShop(q) {
    QUERY = String(q || "").replace(/^find\s+/i, "").trim();
    try {
      const r = await fetch("/api/desks?packs=1&q=" + encodeURIComponent(QUERY));
      const data = await r.json().catch(function () { return {}; });
      shopPage((data && data.packs) || []);
    } catch (e) {
      shopPage([]);
    }
  }
  async function loadListing(id) {
    try {
      const r = await fetch("/api/desks?packs=1&id=" + encodeURIComponent(id));
      const data = await r.json().catch(function () { return {}; });
      const pack = data.pack || (data.packs && data.packs[0]);
      if (!r.ok || !pack) return fail(data.error || "No pack with that name.") || loadShop("");
      listingPage(pack);
    } catch (e) {
      loadShop("");
    }
  }
  async function loadCreator(id) {
    try {
      const r = await fetch("/api/desks?packs=1&creator=" + encodeURIComponent(id));
      const data = await r.json().catch(function () { return {}; });
      if (!r.ok) return fail(data.error || "No creator with that name.") || loadShop("");
      if (!data.creator && data.packs) data.creator = { name: id, official: false, does: "" };
      creatorPage(data);
    } catch (e) {
      loadShop("");
    }
  }
  async function usePack(id, preview, buy) {
    if (!hasDesk()) return fail("Open a desk first. Shopping stays public. Use needs the desk code.");
    const r = await fetch("/api/desks", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ action: preview ? "preview-pack" : (buy ? "buy-pack" : "install-pack"), id: id })
    });
    const data = await r.json().catch(function () { return {}; });
    if (r.status === 409) return fail(data.error || "Make this pack first.") || (data.href && (location.href = data.href));
    if (!r.ok) return fail(data.error || "Could not put that pack on this desk.");
    const n = data.rulesAdded || data.added || 0;
    const hold = data.collectHold && data.collectHold.note ? " " + data.collectHold.note : "";
    done((data.note || (data.already ? "Already on this desk." : (preview ? "Preview added. This desk only." : "Pack is on this desk."))) + (n ? " " + n + " rule" + (n === 1 ? "" : "s") + " landed." : "") + hold);
  }
  async function installAiaFile() {
    if (!hasDesk()) return fail("Open a desk first. Shopping stays public. Install needs the desk code.");
    const input = document.getElementById("aia-file");
    const file = input && input.files && input.files[0];
    if (!file) return fail("Pick a .aia pack file first.");
    if (file.name && !/\.aia$/i.test(file.name)) return fail("Use a .aia pack file.");
    let parsed;
    try { parsed = JSON.parse(await file.text()); } catch (e) { return fail("That .aia file is not JSON."); }
    const r = await fetch("/api/desks", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ action: "install-aia", filename: file.name, pack: parsed })
    });
    const data = await r.json().catch(function () { return {}; });
    if (!r.ok) return fail(data.error || "Could not install that .aia pack.");
    const n = data.added || 0;
    done((data.note || "Installed .aia onto this desk.") + (n ? " " + n + " rule" + (n === 1 ? "" : "s") + " landed." : ""));
  }
  document.getElementById("main").addEventListener("submit", function (e) {
    const form = e.target.closest("#find");
    if (!form) return;
    e.preventDefault();
    const q = new FormData(form).get("q") || "";
    const next = "/market?q=" + encodeURIComponent(q) + (FILTER ? "&filter=" + encodeURIComponent(FILTER) : "");
    history.replaceState({}, "", next);
    loadShop(q);
  });
  document.getElementById("main").addEventListener("click", function (e) {
    const pill = e.target.closest("#pills [data-filter]");
    if (pill) {
      FILTER = pill.getAttribute("data-filter") || "";
      const rows = document.getElementById("rows");
      if (rows) rows.innerHTML = shopMarkup(LAST);
      Array.prototype.forEach.call(document.querySelectorAll("#pills button"), function (b) {
        b.classList.toggle("on", b.getAttribute("data-filter") === FILTER);
      });
      const next = "/market?q=" + encodeURIComponent(QUERY) + (FILTER ? "&filter=" + encodeURIComponent(FILTER) : "");
      history.replaceState({}, "", next);
      return;
    }
    const buy = e.target.closest("[data-buy]");
    if (buy) {
      e.preventDefault();
      usePack(buy.getAttribute("data-buy"), false, true);
      return;
    }
    const use = e.target.closest("[data-use], [data-preview]");
    if (use) {
      e.preventDefault();
      usePack(use.getAttribute("data-use") || use.getAttribute("data-preview"), use.hasAttribute("data-preview"));
      return;
    }
    const copyLink = e.target.closest("[data-copy-link]");
    if (copyLink) {
      e.preventDefault();
      const url = location.origin + "/market?pack=" + encodeURIComponent(copyLink.getAttribute("data-copy-link") || "");
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).catch(function () {});
      done("Listing link copied.");
      return;
    }
    const inst = e.target.closest("#install-aia");
    if (inst) {
      e.preventDefault();
      installAiaFile();
      return;
    }
    const copyDraft = e.target.closest("[data-copy]");
    if (copyDraft) {
      e.preventDefault();
      const card = copyDraft.closest(".demo");
      const draft = card ? card.querySelector(".draft") : null;
      const text = draft ? draft.textContent.replace(/^Draft:\s*/, "") : "";
      if (text && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () {});
      done("Draft copied. You send it.");
    }
  });
  (function boot() {
    const q = params();
    const pack = q.get("pack") || q.get("id");
    const creator = q.get("creator");
    FILTER = q.get("filter") || "";
    QUERY = q.get("q") || "";
    if (creator) return loadCreator(creator);
    if (pack) return loadListing(pack);
    loadShop(QUERY);
  })();
})();
