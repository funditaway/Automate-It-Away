/* AIA creator lab. Same login. Packs never Send, Stop, or pay. */
(function () {
  var view = document.getElementById("view");
  var errEl = document.getElementById("err");
  var okEl = document.getElementById("ok");
  if (!view) return;

  var tab = "home";
  var creator = false;

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
    if (val("bot1-name")) out.push({ name: val("bot1-name"), crew: val("bot1-crew") || "Doer", prompt: val("bot1-prompt"), does: val("bot1-does"), draftOnly: true, never: ["send", "stop", "money"] });
    if (val("bot2-name")) out.push({ name: val("bot2-name"), crew: val("bot2-crew") || "Worker", prompt: val("bot2-prompt"), does: val("bot2-does"), draftOnly: true, never: ["send", "stop", "money"] });
    return out.slice(0, 3);
  }
  function packBody(extra) {
    return Object.assign({
      name: val("name"),
      niche: val("niche"),
      family: val("niche"),
      does: val("does"),
      fields: parseFields(val("fields")),
      kinds: val("kinds"),
      rules: val("rule") ? [{ text: val("rule") }] : [],
      ask: Number(val("ask") || 0) || 0,
      bots: bots(),
      dropHint: val("drop-hint"),
      dropForm: { hint: val("drop-hint"), kinds: val("drop-kinds"), public: false },
      pipes: val("pipes"),
      ext: val("ext"),
      handTo: val("hand-to"),
      queue: {
        badge: val("q-badge"),
        empty: val("q-empty"),
        group: val("q-group") || "none",
        sort: val("q-sort") || "cap-first",
        chips: val("q-chips"),
        taps: val("q-taps") || "copy,text,email,hand,cap",
        never: ["send", "stop", "pay", "bind"]
      },
      status: "draft"
    }, extra || {});
  }
  async function post(action, extra) {
    var r = await fetch("/api/desks", { method: "POST", headers: hdr(), body: JSON.stringify(Object.assign(packBody(extra), { action: action })) });
    var d = await r.json().catch(function () { return {}; });
    return { ok: r.ok, status: r.status, data: d };
  }
  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, function (c) {
      return ({ "&": "&", "<": "<", ">": ">", '"': """ })[c];
    });
  }

  function tabs() {
    return [
      ["home", "Home"],
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
    if (tab === "pack") return (
      "<div class=\"card\"><h2>The pack</h2>" +
      "<label>Pack name</label><input id=\"name\" placeholder=\"Saturday oil-change lane\">" +
      "<label>Niche</label><input id=\"niche\" placeholder=\"shop, school, lawn, resale\">" +
      "<label>What it does</label><input id=\"does\" placeholder=\"Photo in. Draft the title. Wait on payout.\">" +
      "<label>Fields (label:type)</label><input id=\"fields\" placeholder=\"who:text, lots:number, titled:yesno\">" +
      "<label>Kinds</label><input id=\"kinds\" placeholder=\"list, photo, walk-in\">" +
      "<label>Rule line</label><input id=\"rule\" placeholder=\"Cap title-missing items.\">" +
      "<label>Ask (tag only)</label><input id=\"ask\" inputmode=\"decimal\" placeholder=\"Leave blank to list free\">" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"save-pack\">Save draft</button></p></div>"
    );
    if (tab === "bots") return (
      "<div class=\"card\"><h2>Pack bots</h2><p class=\"hint\">Draft only. Never Send, Stop, or pay. Owner Approves the seat on Use.</p>" +
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
      "<div class=\"card\"><h2>Test on this desk</h2><p class=\"hint\">Copies fields, rules, pending bots, and ext onto this queue. Not on Market.</p>" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"test-pack\">Test this pack</button>" +
      "<a class=\"go ghost\" href=\"/drop\">Open Drop</a><a class=\"go ghost\" href=\"/desk\">Open Queue</a></p></div>"
    );
    if (tab === "submit") return (
      "<div class=\"card\"><h2>Submit to AIA</h2><p class=\"hint\">You cannot ship your own pack. AIA approves. Then it appears on /market.</p>" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"submit-pack\">Submit for review</button>" +
      "<a class=\"go ghost\" href=\"/market\">Marketplace</a></p></div>"
    );
    return (
      "<div class=\"card\"><h2>Lab packs</h2><p class=\"hint\">Drafts stay off Market. Test here. Ext is a hand-off, not a send.</p><div id=\"mine-list\"></div></div>"
    );
  }

  function paintGate() {
    view.innerHTML =
      "<form class=\"card\" id=\"gate\"><h2>Open this desk</h2><p class=\"hint\">Same account. Not a second book.</p>" +
      "<label>Desk name</label><input id=\"slug\" placeholder=\"Rivera Resale\">" +
      "<label>Owner code</label><input id=\"pin\" inputmode=\"numeric\" minlength=\"4\" placeholder=\"4+ digits\">" +
      "<p class=\"cta\"><button class=\"go\" type=\"submit\">Open lab</button></p></form>";
    var slug = document.getElementById("slug");
    if (slug) slug.value = localStorage.getItem("aia_desk_name") || localStorage.getItem("aia_ws") || "";
    document.getElementById("gate").addEventListener("submit", openLab);
  }

  function paintLab() {
    view.innerHTML =
      "<div class=\"card banner\"><div><b>" + (creator ? "Developer on · still free" : "Dev is off") + "</b>" +
      "<p class=\"hint\">Draft → test on this desk → submit to AIA → Market. Packs never Send.</p></div>" +
      "<div class=\"cta\"><button class=\"go\" type=\"button\" id=\"on-dev\">I make packs</button>" +
      "<button class=\"go ghost\" type=\"button\" id=\"off-dev\">Regular account</button></div></div>" +
      "<div class=\"pills\" id=\"tabs\">" + tabs() + "</div>" + pane();
    bindLab();
    if (tab === "home") loadMine();
  }

  function bindLab() {
    var tabsEl = document.getElementById("tabs");
    if (tabsEl) tabsEl.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tab]");
      if (!btn) return;
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
  }

  async function saveDraft() {
    if (!val("name")) return show("Name the pack first.", false);
    var out = await post("list-pack", { status: "draft" });
    if (!out.ok) return show((out.data && out.data.error) || "Could not save draft.", false);
    show((out.data && out.data.note) || "Draft saved. Off Market until AIA approves.", true);
    tab = "home";
    paintLab();
  }
  async function testPack() {
    if (!val("name")) return show("Name the pack first.", false);
    var out = await post("test-pack");
    if (!out.ok && (out.status === 400 || out.status === 404)) out = await post("use-pack", { preview: false });
    if (!out.ok) return show((out.data && out.data.error) || "Could not test.", false);
    show((out.data && out.data.note) || "Test is on this desk. Open Drop or Queue.", true);
  }
  async function submitPack() {
    if (!val("name")) return show("Name the pack first.", false);
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
    show(d.hint || (creator ? "Creator is on. Still free." : "Regular account. Still free."), true);
    paintLab();
  }
  async function loadMine() {
    var box = document.getElementById("mine-list");
    if (!box) return;
    try {
      var r = await fetch("/api/desks?packs=1&mine=1", { headers: hdr() });
      var d = await r.json().catch(function () { return {}; });
      var rows = (d.packs || []).filter(function (p) { return p && !p.official; });
      if (!rows.length) { box.innerHTML = "<p class=\"hint\">No lab packs yet. Save a draft on Pack.</p>"; return; }
      box.innerHTML = rows.map(function (p) {
        var botsN = (p.bots && p.bots.length) || (p.bot && p.bot.name ? 1 : 0);
        return "<div class=\"pack-row\"><b>" + esc(p.name || p.id) + "</b><span class=\"hint\">" +
          esc(p.status || p.review || "draft") + (p.priced ? (" · ask $" + p.ask) : " · free") +
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
    show(d.hint || "Lab is open.", true);
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
