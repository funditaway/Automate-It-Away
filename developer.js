/* Creators Studio. Same login. Packs never Send, Stop, or pay. */
(function () {
  var view = document.getElementById("view");
  var errEl = document.getElementById("err");
  var okEl = document.getElementById("ok");
  if (!view) return;

  var tab = "home";
  var creator = false;
  var grokOn = false;
  var grokDraft = null;
  var formState = {};

  function slugify(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function hdr() {
    var h = { "Content-Type": "application/json" };
    var ws = localStorage.getItem("aia_ws") || "";
    var pin = localStorage.getItem("aia_pin") || "";
    var tok = localStorage.getItem("aia_session") || "";
    if (ws) h["X-Workspace"] = slugify(ws);
    if (tok) h["X-Session"] = tok;
    else if (pin) h["X-Pin"] = pin;
    return h;
  }
  function show(msg, good) {
    if (okEl) { okEl.style.display = good ? "block" : "none"; if (good) okEl.textContent = msg; }
    if (errEl) { errEl.style.display = good ? "none" : "block"; if (!good) errEl.textContent = msg; }
  }
  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }
  function snap() {
    view.querySelectorAll("input,select,textarea").forEach(function (el) {
      if (el.id) formState[el.id] = el.value;
    });
  }
  function restore() {
    Object.keys(formState).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = formState[id];
    });
  }
  function parseFields(line) {
    return String(line || "").split(/[,;\n]+/).map(function (part) {
      var bits = part.split(":");
      var label = String(bits[0] || "").trim();
      if (!label) return null;
      var type = String(bits[1] || "text").trim().toLowerCase();
      if (type !== "number" && type !== "yesno") type = "text";
      return { label: label.slice(0, 40), type: type };
    }).filter(Boolean);
  }
  function bots() {
    var out = [];
    var n1 = val("bot1-name") || formState["bot1-name"];
    if (n1) out.push({ name: n1, crew: val("bot1-crew") || formState["bot1-crew"] || "Doer", prompt: val("bot1-prompt") || formState["bot1-prompt"] || "", does: val("bot1-does") || formState["bot1-does"] || "", draftOnly: true, never: ["send", "stop", "money"] });
    var n2 = val("bot2-name") || formState["bot2-name"];
    if (n2) out.push({ name: n2, crew: val("bot2-crew") || formState["bot2-crew"] || "Worker", prompt: val("bot2-prompt") || formState["bot2-prompt"] || "", does: val("bot2-does") || formState["bot2-does"] || "", draftOnly: true, never: ["send", "stop", "money"] });
    return out.slice(0, 3);
  }
  function packBody(extra) {
    return Object.assign({
      name: val("name") || formState.name || "",
      niche: val("niche") || formState.niche || "",
      family: val("niche") || formState.niche || "",
      does: val("does") || formState.does || "",
      fields: parseFields(val("fields") || formState.fields || ""),
      kinds: val("kinds") || formState.kinds || "",
      rules: (val("rule") || formState.rule) ? [{ text: val("rule") || formState.rule }] : [],
      ask: Number(val("ask") || formState.ask || 0) || 0,
      bots: bots(),
      dropHint: val("drop-hint") || formState["drop-hint"] || "",
      dropForm: { hint: val("drop-hint") || formState["drop-hint"] || "", kinds: val("drop-kinds") || formState["drop-kinds"] || "", public: false },
      pipes: val("pipes") || formState.pipes || "",
      ext: val("ext") || formState.ext || "",
      handTo: val("hand-to") || formState["hand-to"] || "",
      queue: {
        badge: val("q-badge") || formState["q-badge"] || "",
        empty: val("q-empty") || formState["q-empty"] || "",
        group: val("q-group") || formState["q-group"] || "none",
        sort: val("q-sort") || formState["q-sort"] || "cap-first",
        chips: val("q-chips") || formState["q-chips"] || "",
        taps: val("q-taps") || formState["q-taps"] || "copy,text,email,hand,cap",
        never: ["send", "stop", "pay", "bind"]
      },
      status: "draft"
    }, extra || {});
  }
  async function post(action, extra) {
    snap();
    var r = await fetch("/api/desks", { method: "POST", headers: hdr(), body: JSON.stringify(Object.assign(packBody(extra), { action: action })) });
    var d = await r.json().catch(function () { return {}; });
    return { ok: r.ok, status: r.status, data: d };
  }
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function tabs() {
    return [
      ["home", "Home"],
      ["grok", "Grok"],
      ["pack", "Pack"],
      ["bots", "Bots"],
      ["drop", "Drop form"],
      ["queue", "Queue"],
      ["pipes", "Pipes"],
      ["ext", "Ext"],
      ["test", "Test"],
      ["submit", "Submit"]
    ].map(function (row) {
      return "<button type=\"button\" data-tab=\"" + row[0] + "\" class=\"" + (tab === row[0] ? "on" : "") + "\">" + row[1] + "</button>";
    }).join("");
  }

  function pane() {
    if (tab === "grok") return (
      "<div class=\"card\"><h2>Ask Grok</h2>" +
      "<p class=\"hint\">Included drafter on this same AIA account — not a second SKU. Helps build bots and packs. Never Send, Stop, or pay. Never auto-mail. You tap Yes to put the draft on Pack and Bots, or Stop to discard it.</p>" +
      "<p class=\"aia-line\" id=\"aia-line\">Checking drafts…</p>" +
      "<label>What should this pack do?</label>" +
      "<textarea id=\"grok-brief\" rows=\"4\" placeholder=\"Saturday oil-change lane. Photo in. Draft the title. Wait on payout.\"></textarea>" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"ask-grok\">Ask Grok</button></p>" +
      "<div class=\"draft\" id=\"grok-draft-box\"></div>" +
      "<div class=\"cta\" id=\"grok-decide\" hidden>" +
        "<button class=\"go yes\" type=\"button\" id=\"grok-yes\">Yes · put it on Pack</button>" +
        "<button class=\"go stop\" type=\"button\" id=\"grok-stop\">Stop</button>" +
      "</div></div>"
    );
    if (tab === "pack") return (
      "<div class=\"card\"><h2>The pack</h2>" +
      "<label>Pack name</label><input id=\"name\" placeholder=\"Saturday oil-change lane\">" +
      "<label>Niche</label><input id=\"niche\" placeholder=\"shop, school, lawn, resale\">" +
      "<label>What it does</label><input id=\"does\" placeholder=\"Photo in. Draft the title. Wait on payout.\">" +
      "<label>Fields (label:type)</label><input id=\"fields\" placeholder=\"who:text, lots:number, titled:yesno\">" +
      "<label>Kinds</label><input id=\"kinds\" placeholder=\"list, photo, walk-in\">" +
      "<label>Rule line</label><input id=\"rule\" placeholder=\"Cap title-missing items.\">" +
      "<label>Ask (Collect stays HOLD)</label><input id=\"ask\" inputmode=\"decimal\" placeholder=\"Leave blank to list free\">" +
      "<p class=\"hint\">A number here is a listed ask. World desks can still install the pack. Collect stays HOLD until a person taps Yes and a money pipe is live.</p>" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"save-pack\">Save draft</button></p></div>"
    );
    if (tab === "bots") return (
      "<div class=\"card\"><h2>Pack bots</h2><p class=\"hint\">Draft only. Never Send, Stop, or pay. Owner Approves the seat on Use. Grok can draft these; you still tap Yes.</p>" +
      "<label>Bot 1 name</label><input id=\"bot1-name\" placeholder=\"Lane Doer\">" +
      "<label>Crew</label><select id=\"bot1-crew\"><option>Doer</option><option>Worker</option><option>Rail</option><option>Packer</option><option>Mapper</option></select>" +
      "<label>What it drafts</label><input id=\"bot1-does\" placeholder=\"Draft the next step\">" +
      "<label>Draft line</label><textarea id=\"bot1-prompt\" rows=\"2\" placeholder=\"Do not send it. Do not invent a price.\"></textarea>" +
      "<label>Bot 2 name</label><input id=\"bot2-name\" placeholder=\"Lane Worker\">" +
      "<label>Crew</label><select id=\"bot2-crew\"><option>Worker</option><option>Doer</option><option>Rail</option><option>Foreman</option></select>" +
      "<label>What it drafts</label><input id=\"bot2-does\" placeholder=\"Qualify and write the follow note\">" +
      "<label>Draft line</label><textarea id=\"bot2-prompt\" rows=\"2\"></textarea>" +
      "<p class=\"hint\">Never: Send · Stop · pay · public Bot API</p>" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"save-bots\">Save bots on draft</button></p></div>"
    );
    if (tab === "drop") return (
      "<div class=\"card\"><h2>Drop form inside the pack</h2>" +
      "<label>Drop hint</label><input id=\"drop-hint\" placeholder=\"Name who, when, and the car.\">" +
      "<label>Drop kinds</label><input id=\"drop-kinds\" placeholder=\"request, photo, reminder\">" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"save-drop\">Save drop form</button></p></div>"
    );
    if (tab === "queue") return (
      "<div class=\"card\"><h2>How the queue looks</h2><p class=\"hint\">This is a block on the pack. Not a new pack type. Packs never Send, Stop, or pay.</p>" +
      "<label>Badge</label><input id=\"q-badge\" placeholder=\"Insurance\">" +
      "<label>Empty line</label><input id=\"q-empty\" placeholder=\"Drop a name, a state, and what they need.\">" +
      "<label>Kind chips</label><input id=\"q-chips\" placeholder=\"lead, quote, call, review\">" +
      "<label>Group</label><select id=\"q-group\"><option value=\"none\">None</option><option value=\"kind\">Kind</option><option value=\"when\">When</option></select>" +
      "<label>Sort</label><select id=\"q-sort\"><option value=\"cap-first\">Cap first</option><option value=\"new\">Newest</option></select>" +
      "<label>Taps on the card</label><input id=\"q-taps\" placeholder=\"copy,text,email,hand,cap\">" +
      "<p class=\"hint\">Never: Send · Stop · pay · bind. Owner still taps Stop on the desk.</p>" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"save-queue\">Save queue on draft</button></p></div>"
    );
    if (tab === "pipes") return (
      "<div class=\"card\"><h2>Named pipes</h2><p class=\"hint\">Wish list only. Live send stays HOLD. Webhook is the only live pipe on the desk.</p>" +
      "<label>Pipes</label><input id=\"pipes\" placeholder=\"webhook, calendar, gmail\">" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"save-pipes\">Save pipe names</button></p></div>"
    );
    if (tab === "ext") return (
      "<div class=\"card\"><h2>Ext · hand off</h2><p class=\"hint\">Work that leaves this desk. AIA does not send the text or email. History lane stays ext until write-back.</p>" +
      "<label>Hand to</label><input id=\"hand-to\" placeholder=\"Saturday helper\">" +
      "<label>Ext note</label><input id=\"ext\" placeholder=\"They pick the car up off-desk. Follow later.\">" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"save-ext\">Save ext on draft</button>" +
      "<a class=\"go ghost\" href=\"/people\">People</a></p></div>"
    );
    if (tab === "test") return (
      "<div class=\"card\"><h2>Test on this desk</h2><p class=\"hint\">Copies fields, rules, pending bots, and ext onto this queue. Not on Market. Fresh desks stay empty until you test or a world user installs.</p>" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"test-pack\">Test this pack</button>" +
      "<a class=\"go ghost\" href=\"/drop\">Open Drop</a><a class=\"go ghost\" href=\"/desk\">Open Queue</a></p></div>"
    );
    if (tab === "submit") return (
      "<div class=\"card\"><h2>Submit to AIA</h2><p class=\"hint\">You cannot ship your own pack. AIA approves. Then it appears on /market. World desks install the JSON onto their queue. Collect stays HOLD.</p>" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"submit-pack\">Submit for review</button>" +
      "<a class=\"go ghost\" href=\"/market\">Marketplace</a></p></div>"
    );
    return (
      "<div class=\"card\"><h2>Creators Studio</h2>" +
      "<p class=\"hint\">Try first. Drop real work. Worker-first: drafts wait on Yes or Stop. Open packs: thin JSON a world desk can install. Secure-by-design: no silent Collect, no auto mail.</p>" +
      "<p class=\"hint\">Grok is the included drafter on this same AIA account. Not a second SKU. Ask Grok, then Yes to put the draft on Pack and Bots.</p>" +
      "<div id=\"mine-list\"></div></div>"
    );
  }

  function paintGate() {
    view.innerHTML =
      "<form class=\"card\" id=\"gate\"><h2>Open this desk</h2><p class=\"hint\">Same account. Not a second book.</p>" +
      "<label>Desk name</label><input id=\"slug\" placeholder=\"Rivera Resale\">" +
      "<label>Owner code</label><input id=\"pin\" inputmode=\"numeric\" minlength=\"4\" placeholder=\"4+ digits\">" +
      "<p class=\"cta\"><button class=\"go\" type=\"submit\">Open Studio</button></p></form>";
    var slug = document.getElementById("slug");
    if (slug) slug.value = localStorage.getItem("aia_desk_name") || localStorage.getItem("aia_ws") || "";
    document.getElementById("gate").addEventListener("submit", openLab);
  }

  function paintLab() {
    snap();
    view.innerHTML =
      "<div class=\"card banner\"><div><b>" + (creator ? "Creators Studio on · still free" : "Studio flag is off") + "</b>" +
      "<p class=\"hint\">Draft → test on this desk → submit to AIA → Market. Packs never Send. Collect stays HOLD.</p></div>" +
      "<div class=\"cta\"><button class=\"go\" type=\"button\" id=\"on-dev\">I make packs</button>" +
      "<button class=\"go ghost\" type=\"button\" id=\"off-dev\">Regular account</button></div></div>" +
      "<div class=\"pills\" id=\"tabs\">" + tabs() + "</div>" + pane();
    restore();
    bindLab();
    if (tab === "home") loadMine();
    if (tab === "grok") {
      paintAia();
      showGrokDraft(grokDraft);
    }
  }

  function bindLab() {
    var tabsEl = document.getElementById("tabs");
    if (tabsEl) tabsEl.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tab]");
      if (!btn) return;
      snap();
      tab = btn.getAttribute("data-tab");
      paintLab();
    });
    function save() { return saveDraft(); }
    ["save-pack", "save-bots", "save-drop", "save-queue", "save-pipes", "save-ext"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.onclick = save;
    });
    var testBtn = document.getElementById("test-pack");
    if (testBtn) testBtn.onclick = testPack;
    var subBtn = document.getElementById("submit-pack");
    if (subBtn) subBtn.onclick = submitPack;
    var on = document.getElementById("on-dev");
    if (on) on.onclick = function () { switchPlan("dev"); };
    var off = document.getElementById("off-dev");
    if (off) off.onclick = function () { switchPlan("pro"); };
    var ask = document.getElementById("ask-grok");
    if (ask) ask.onclick = askGrok;
    var yes = document.getElementById("grok-yes");
    if (yes) yes.onclick = yesGrok;
    var stop = document.getElementById("grok-stop");
    if (stop) stop.onclick = stopGrok;
  }

  async function paintAia() {
    var el = document.getElementById("aia-line");
    if (!el) return;
    try {
      var r = await fetch("/api/health");
      var h = await r.json().catch(function () { return {}; });
      var g = h && h.automation && h.automation.grok;
      grokOn = !!(g && g.on);
      el.classList.toggle("off", !grokOn);
      el.textContent = grokOn
        ? "Grok drafts are on via api.x.ai. Every call is audited. Never Send. You still tap Yes or Stop."
        : "Drafts are off — no XAI_API_KEY on this box. Orange copy only. You can still write the pack by hand.";
    } catch (e) {
      grokOn = false;
      el.classList.add("off");
      el.textContent = "Could not reach this box. Drafts stay off. You can still write the pack by hand.";
    }
  }

  function showGrokDraft(data) {
    var box = document.getElementById("grok-draft-box");
    var decide = document.getElementById("grok-decide");
    if (!box || !decide) return;
    grokDraft = data || null;
    if (!data) {
      box.classList.remove("on");
      box.textContent = "";
      decide.hidden = true;
      return;
    }
    var pack = data.pack || data;
    var lines = [
      pack.name && ("Name: " + pack.name),
      pack.does && ("Does: " + pack.does),
      pack.niche && ("Niche: " + pack.niche),
      pack.rule && ("Rule: " + pack.rule),
      (pack.bots && pack.bots[0] && pack.bots[0].name) && ("Bot: " + pack.bots[0].name),
      "Collect stays HOLD. Never Send."
    ].filter(Boolean);
    box.classList.add("on");
    box.textContent = lines.join("\n") || (data.note || "Draft ready. Yes puts it on Pack. Stop discards it.");
    decide.hidden = false;
  }

  function applyPackDraft(pack) {
    if (!pack) return;
    formState.name = pack.name || "";
    formState.niche = pack.niche || pack.family || "";
    formState.does = pack.does || "";
    formState.fields = typeof pack.fields === "string"
      ? pack.fields
      : (Array.isArray(pack.fields) ? pack.fields.map(function (f) {
        if (!f) return "";
        if (typeof f === "string") return f;
        return (f.label || f.key || "") + ":" + (f.type || "text");
      }).filter(Boolean).join(", ") : "");
    formState.kinds = Array.isArray(pack.kinds) ? pack.kinds.join(", ") : (pack.kinds || "");
    formState.rule = pack.rule || (pack.rules && pack.rules[0] && (pack.rules[0].text || pack.rules[0])) || "";
    formState.ask = pack.ask != null ? String(pack.ask) : "";
    formState["drop-hint"] = pack.dropHint || "";
    if (pack.queue) {
      formState["q-badge"] = pack.queue.badge || "";
      formState["q-empty"] = pack.queue.empty || "";
      formState["q-chips"] = Array.isArray(pack.queue.chips) ? pack.queue.chips.join(", ") : (pack.queue.chips || "");
    }
    var rows = pack.bots || [];
    if (rows[0]) {
      formState["bot1-name"] = rows[0].name || "";
      formState["bot1-crew"] = rows[0].crew || "Doer";
      formState["bot1-does"] = rows[0].does || "";
      formState["bot1-prompt"] = rows[0].prompt || "";
    }
    if (rows[1]) {
      formState["bot2-name"] = rows[1].name || "";
      formState["bot2-crew"] = rows[1].crew || "Worker";
      formState["bot2-does"] = rows[1].does || "";
      formState["bot2-prompt"] = rows[1].prompt || "";
    }
  }

  async function askGrok() {
    snap();
    var brief = val("grok-brief") || formState["grok-brief"] || "";
    if (!brief) return show("Say what the pack should do.", false);
    var go = document.getElementById("ask-grok");
    if (go) go.disabled = true;
    try {
      var r = await fetch("/api/desks", {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ action: "studio-draft", brief: brief, kind: "pack" })
      });
      var d = await r.json().catch(function () { return {}; });
      if (d.grok === "off" || d.reason === "no-key") {
        var line = document.getElementById("aia-line");
        if (line) { line.classList.add("off"); line.textContent = d.note || "Drafts are off — no XAI_API_KEY on this box. Orange copy only."; }
        grokOn = false;
      }
      if (!d.ok) {
        showGrokDraft({ note: d.note || "No draft this time. Write the pack by hand. AIA does not send." });
        return show(d.note || d.error || "No draft this time.", false);
      }
      showGrokDraft(d);
      show(d.note || "Draft only. Yes saves it on this lab. Stop discards it.", true);
    } catch (e) {
      show("Could not reach Creators Studio.", false);
    } finally {
      if (go) go.disabled = false;
    }
  }

  function yesGrok() {
    if (!grokDraft || !grokDraft.pack) return show("Ask Grok first.", false);
    applyPackDraft(grokDraft.pack);
    grokDraft = null;
    tab = "pack";
    paintLab();
    show("Draft is on Pack and Bots. Save when it looks right. AIA does not send.", true);
  }

  function stopGrok() {
    grokDraft = null;
    showGrokDraft(null);
    show("Draft discarded. Nothing sent.", true);
  }

  async function saveDraft() {
    snap();
    if (!(val("name") || formState.name)) return show("Name the pack first.", false);
    var out = await post("list-pack", { status: "draft" });
    if (!out.ok) return show((out.data && out.data.error) || "Could not save draft.", false);
    show((out.data && out.data.note) || "Draft saved. Off Market until AIA approves.", true);
    tab = "home";
    paintLab();
  }
  async function testPack() {
    snap();
    if (!(val("name") || formState.name)) return show("Name the pack first.", false);
    var out = await post("test-pack");
    if (!out.ok && (out.status === 400 || out.status === 404)) out = await post("use-pack", { preview: false });
    if (!out.ok) return show((out.data && out.data.error) || "Could not test.", false);
    show((out.data && out.data.note) || "Test is on this desk. Open Drop or Queue.", true);
  }
  async function submitPack() {
    snap();
    if (!(val("name") || formState.name)) return show("Name the pack first.", false);
    var out = await post("submit-pack");
    if (!out.ok && (out.status === 400 || out.status === 404)) out = await post("list-pack", { submit: true, status: "submitted" });
    if (!out.ok) return show((out.data && out.data.error) || "Could not submit.", false);
    show((out.data && out.data.note) || "Submitted to AIA. Not on Market until approved.", true);
    tab = "home";
    paintLab();
  }
  async function switchPlan(plan) {
    var r = await fetch("/api/account", { method: "POST", headers: hdr(), body: JSON.stringify({ action: "plan", plan: plan }) });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) return show(d.error || "Could not switch the plan.", false);
    creator = plan === "dev";
    show(d.hint || (creator ? "Creators Studio is on. Still free." : "Regular account. Still free."), true);
    paintLab();
  }
  async function loadMine() {
    var box = document.getElementById("mine-list");
    if (!box) return;
    try {
      var r = await fetch("/api/desks?packs=1&mine=1", { headers: hdr() });
      var d = await r.json().catch(function () { return {}; });
      var rows = (d.packs || []).filter(function (p) { return p && !p.official && !p.wanted && p.type !== "cosmetic"; });
      if (!rows.length) { box.innerHTML = "<p class=\"hint\">No Studio packs yet. Ask Grok, or save a draft on Pack.</p>"; return; }
      box.innerHTML = rows.map(function (p) {
        var botsN = p.bots || (p.botRows && p.botRows.length) || 0;
        return "<div class=\"pack-row\"><b>" + esc(p.name || p.id) + "</b><span class=\"hint\">" +
          esc(p.status || p.review || "draft") + (p.priced ? (" · ask $" + p.ask + " · Collect HOLD") : " · free") +
          (botsN ? (" · " + botsN + " bot") : "") +
          (p.ext ? " · ext" : "") + "</span></div>";
      }).join("");
    } catch (e) {
      box.innerHTML = "<p class=\"hint\">Could not load packs.</p>";
    }
  }
  async function openLab(e) {
    if (e) e.preventDefault();
    var slug = slugify(val("slug"));
    var pin = val("pin");
    var r = await fetch("/api/account", { method: "POST", headers: hdr(), body: JSON.stringify({ action: "login", slug: slug, pin: pin, name: slug }) });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) return show(d.error || "Desk name or code does not match.", false);
    if (d.session && d.session.token) localStorage.setItem("aia_session", d.session.token);
    if (slug) localStorage.setItem("aia_ws", slug);
    if (pin) localStorage.setItem("aia_pin", pin);
    creator = !!(d.plan && (d.plan.creator || d.plan.plan === "dev"));
    show(d.hint || "Creators Studio is open.", true);
    paintLab();
  }

  async function boot() {
    if (!(localStorage.getItem("aia_session") || localStorage.getItem("aia_ws"))) {
      paintGate();
      return;
    }
    try {
      var r = await fetch("/api/account", { method: "GET", headers: hdr() });
      var d = await r.json().catch(function () { return {}; });
      if (d && (d.ok || d.account)) {
        creator = !!(d.plan && (d.plan.creator || d.plan.plan === "dev"));
        paintLab();
        return;
      }
    } catch (e) {}
    paintGate();
  }
  boot();
})();
