/* .aia email identities for Automations. Same book on Account, Studio, Desks. Send stays HOLD. */
(function () {
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
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function host() { return document.getElementById("aia-mail"); }
  function msg(text, good) {
    var el = document.getElementById("aia-mail-msg");
    if (!el) return;
    el.className = good ? "ok" : "meta";
    el.textContent = text || "";
  }
  function domainsOf(state) {
    var acc = (state && state.account) || {};
    var desk = (state && state.desk) || {};
    var out = [];
    function add(raw) {
      var s = String(raw || "").toLowerCase().replace(/^@+/, "").replace(/\.aia$/i, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
      if (s && out.indexOf(s) < 0) out.push(s);
    }
    add(acc.aia || acc.handle || acc.slug);
    add(desk.aia || desk.aiaLabel || desk.slug);
    ((state && (state.desksOwned || (state.mine && state.mine.owned))) || []).forEach(function (d) {
      add(d.aia || d.slug);
    });
    return out;
  }
  function domainOf(state) {
    var pick = document.getElementById("aia-mail-domain");
    if (pick && pick.value) return String(pick.value).replace(/\.aia$/i, "") + ".aia";
    var rows = domainsOf(state);
    return rows.length ? rows[0] + ".aia" : "account.aia";
  }
  function preview(state) {
    var localEl = document.getElementById("aia-mail-local");
    var out = document.getElementById("aia-mail-preview");
    if (!out) return;
    var local = slugify((localEl && localEl.value) || "queue") || "queue";
    var domain = domainOf(state) || "account.aia";
    var bind = document.getElementById("aia-mail-bind");
    var ai = document.getElementById("aia-mail-ai");
    if (bind && bind.value === "ai" && ai && ai.value && !((localEl && localEl.value))) {
      local = slugify(ai.options[ai.selectedIndex] ? (ai.options[ai.selectedIndex].getAttribute("data-local") || ai.value) : ai.value) || local;
    }
    out.textContent = local + "@" + domain.replace(/^\.+/, "");
  }
  function formHtml(state) {
    var desks = (state && (state.desksOwned || (state.mine && state.mine.owned) || state.desks)) || [];
    var ais = (state && (state.ais || (state.desk && state.desk.ais))) || [];
    var cur = slugify(localStorage.getItem("aia_ws") || "");
    var deskOpts = desks.length
      ? desks.map(function (d) {
        var slug = d.slug || d;
        return "<option value=\"" + esc(slug) + "\"" + (slug === cur ? " selected" : "") + ">" + esc(d.name || slug) + "</option>";
      }).join("")
      : (cur ? "<option value=\"" + esc(cur) + "\">" + esc(cur) + "</option>" : "<option value=\"\">Open a desk first</option>");
    var aiOpts = "<option value=\"\">Pick a named desk AI</option>" + ais.map(function (a) {
      var local = slugify(a.aiaLabel || a.id || a.name || "");
      return "<option value=\"" + esc(a.id || a.name) + "\" data-local=\"" + esc(local) + "\">" + esc(a.name) + (a.aia ? " · " + esc(a.aia) : "") + "</option>";
    }).join("");
    var domains = domainsOf(state);
    var domainOpts = (domains.length ? domains : ["account"]).map(function (d) {
      return "<option value=\"" + esc(d) + "\">" + esc(d + ".aia") + "</option>";
    }).join("");
    return "<label for=\"aia-mail-local\">Local part</label>" +
      "<input id=\"aia-mail-local\" maxlength=\"63\" placeholder=\"james-ai or queue\" autocomplete=\"off\">" +
      "<label for=\"aia-mail-domain\">Account .aia name</label>" +
      "<select id=\"aia-mail-domain\">" + domainOpts + "</select>" +
      "<label for=\"aia-mail-desk\">Bound desk</label>" +
      "<select id=\"aia-mail-desk\">" + deskOpts + "</select>" +
      "<label for=\"aia-mail-bind\">Bind to</label>" +
      "<select id=\"aia-mail-bind\"><option value=\"desk\">This desk</option><option value=\"ai\">A named desk AI</option></select>" +
      "<label for=\"aia-mail-ai\">Named desk AI</label>" +
      "<select id=\"aia-mail-ai\">" + aiOpts + "</select>" +
      "<p class=\"meta\" id=\"aia-mail-preview\">queue@" + esc(domainOf(state) || "account.aia") + "</p>" +
      "<div class=\"row\" style=\"margin-top:10px\">" +
        "<button class=\"go\" type=\"button\" id=\"aia-mail-create\">Create .aia email for automations</button>" +
      "</div>";
  }
  function listHtml(rows) {
    if (!rows || !rows.length) {
      return "<p class=\"meta\">No .aia emails yet. Create one to operate Automations and desk AIs.</p>";
    }
    return rows.map(function (row) {
      return "<div class=\"item\" data-mail=\"" + esc(row.id) + "\">" +
        "<strong>" + esc(row.address) + "</strong>" +
        "<div class=\"meta\">" + esc(row.bind === "ai" ? (row.aiName || "desk AI") : "desk") +
        (row.workspace ? " · " + esc(row.workspace) : "") +
        " · inbound Drop · Send HOLD</div>" +
        "<div class=\"row\">" +
          "<button class=\"edit\" type=\"button\" data-in=\"" + esc(row.address) + "\">Simulate inbound</button>" +
          "<button class=\"kill edit\" type=\"button\" data-rm=\"" + esc(row.id) + "\">Remove</button>" +
        "</div></div>";
    }).join("");
  }
  function paint(state) {
    var box = host();
    if (!box) return;
    var rows = (state && state.mail) || [];
    var mx = (state && state.mx) || {};
    box.innerHTML =
      "<h2>Create .aia email for automations</h2>" +
      "<p class=\"meta\">Pattern: {ai-or-desk-name}@{accountname}.aia — james-ai@funditaway.aia, queue@springfield-shop.aia. World users create their own and additional emails to operate Automations and desk AIs.</p>" +
      "<p class=\"meta\" id=\"aia-mail-hold\">" + esc(mx.note || "Identities work on the desk now. Internet mail when the MX pipe is connected. DNS for ai.aia / *.aia does not resolve yet.") + " Outbound Send stays HOLD. Status orange until a real MX pipe.</p>" +
      formHtml(state) +
      "<div id=\"aia-mail-list\">" + listHtml(rows) + "</div>" +
      "<p class=\"meta\" id=\"aia-mail-msg\"></p>";
    wire(state);
    preview(state);
  }
  function gate() {
    var box = host();
    if (!box) return;
    box.innerHTML =
      "<h2>Create .aia email for automations</h2>" +
      "<p class=\"meta\">Open this account to create james-ai@funditaway.aia or queue@springfield-shop.aia. Identities work on the desk now. Internet mail when the MX pipe is connected. DNS for ai.aia / *.aia does not resolve yet. Outbound Send stays HOLD.</p>";
  }
  async function loadDeskAis(state) {
    try {
      var r = await fetch("/api/desks", { headers: hdr() });
      var d = await r.json().catch(function () { return {}; });
      if (d && d.desk) {
        state.desk = d.desk;
        state.ais = d.desk.ais || [];
        if (d.desk.mail && !state.mail) state.mail = d.desk.mail;
      }
    } catch (e) {}
    return state;
  }
  async function load() {
    var box = host();
    if (!box) return null;
    if (!(localStorage.getItem("aia_session") || localStorage.getItem("aia_ws"))) {
      gate();
      return null;
    }
    try {
      var r = await fetch("/api/account", { method: "GET", headers: hdr() });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok || !(d && (d.ok || d.account))) {
        gate();
        return null;
      }
      await loadDeskAis(d);
      paint(d);
      return d;
    } catch (e) {
      gate();
      return null;
    }
  }
  function wire(state) {
    ["aia-mail-local", "aia-mail-bind", "aia-mail-ai", "aia-mail-desk", "aia-mail-domain"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("input", function () { preview(state); });
      if (el) el.addEventListener("change", function () { preview(state); });
    });
    var create = document.getElementById("aia-mail-create");
    if (create) create.onclick = function () { add(state); };
    var list = document.getElementById("aia-mail-list");
    if (list) list.addEventListener("click", function (e) {
      var rm = e.target.closest("[data-rm]");
      var inn = e.target.closest("[data-in]");
      if (rm) remove(rm.getAttribute("data-rm"));
      else if (inn) inbound(inn.getAttribute("data-in"));
    });
  }
  async function add(state) {
    var local = slugify((document.getElementById("aia-mail-local") || {}).value || "");
    var desk = ((document.getElementById("aia-mail-desk") || {}).value) || localStorage.getItem("aia_ws") || "";
    var bind = ((document.getElementById("aia-mail-bind") || {}).value) || "desk";
    var ai = ((document.getElementById("aia-mail-ai") || {}).value) || "";
    if (bind === "ai" && !ai) return msg("Pick the named desk AI this email binds to.");
    if (!local && bind === "ai" && ai) {
      var sel = document.getElementById("aia-mail-ai");
      local = slugify((sel && sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].getAttribute("data-local")) || ai);
    }
    if (!local) local = "queue";
    var domain = ((document.getElementById("aia-mail-domain") || {}).value) || "";
    var r = await fetch("/api/account", {
      method: "POST",
      headers: hdr(),
      body: JSON.stringify({ action: "mail-add", local: local, desk: desk, bind: bind, ai: ai, account: domain })
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) return msg(d.error || "Could not create that .aia email.");
    msg(d.hint || ((d.identity && d.identity.address) + " is on this account."), true);
    await load();
  }
  async function remove(id) {
    var r = await fetch("/api/account", {
      method: "POST",
      headers: hdr(),
      body: JSON.stringify({ action: "mail-remove", id: id })
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) return msg(d.error || "Could not remove that identity.");
    msg((d.removed || "That identity") + " is off this account.", true);
    await load();
  }
  async function inbound(address) {
    var r = await fetch("/api/hook", {
      method: "POST",
      headers: hdr(),
      body: JSON.stringify({
        event: "capture",
        to: address,
        from: "simulate@desk",
        subject: "Inbound · " + address,
        text: "Simulated inbound to " + address + ". Automations can trigger from this Drop. Desk does not send.",
        provider: "aia-mail"
      })
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) return msg(d.error || "Inbound did not land.");
    var job = d.job || {};
    msg("Drop landed" + (job.id ? " · " + job.id : "") + ". Open Queue. Send stays HOLD.", true);
  }
  function boot() {
    if (!host()) return;
    load();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.AIAMail = { boot: boot, load: load, paint: paint };
})();
