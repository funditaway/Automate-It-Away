/* Need-based card taps + orange Cap across desks on this phone. */
(function () {
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
    });
  }
  function val(j, key) {
    if (!j) return "";
    const custom = j.custom && typeof j.custom === "object" ? j.custom : {};
    return j[key] || custom[key] || "";
  }
  function cardNeeds(j, staff) {
    const actions = [];
    const missing = [];
    if (!j) return { line: "", actions: actions, missing: missing, decide: false, priority: false };
    if (Array.isArray(j.needs) && j.needs.length && typeof j.needs[0] === "object") {
      return { line: j.needLine || j.next || "", actions: j.needs, missing: j.missing || [], decide: !!j.decide, priority: !!(j.priority || j.cap) };
    }
    const st = String(j.status || "");
    const done = st === "shipped" || st === "killed";
    const outDesk = st === "out" || j.offDesk || j.awaiting === "writeback";
    const waitInfo = j.waitingOn === "info" || /Need .+ before/i.test(String(j.why || ""));
    const decide = !done && !j.carried && !waitInfo && (st === "waiting" || st === "held");
    const priority = !!(j.priority || j.cap) && !done;
    const phone = String(val(j, "phone") || "").trim();
    const outcome = String(j.outcome || val(j, "outcome") || "").toLowerCase();
    const kind = String(j.kind || "").toLowerCase();
    const when = String(j.timing || j.when || val(j, "when") || "").trim();
    if ((outcome === "call" || kind === "call" || outcome === "text" || kind === "message") && !phone) missing.push("phone");
    if ((outcome === "book" || /school|reminder|pickup|ride|delivery/.test(kind)) && !when) missing.push("when");
    if ((kind === "list" || outcome === "list") && !j.photoUrl) missing.push("photo");
    function add(id, label, extra) {
      if (actions.some(function (a) { return a.id === id; })) return;
      actions.push(Object.assign({ id: id, label: label }, extra || {}));
    }
    if (!done) add("open", "Open");
    if (outDesk) { add("done", "Done off desk"); add("handback", "Needs a hand"); }
    else if (missing.length) { add("fill", "Add " + missing[0]); add("ask", "Ask for more"); }
    else if (decide) { add("yes", "Yes"); if (!staff) add("stop", "Stop"); }
    if (j.draft && !missing.length) add("copy", "Copy draft");
    if (phone || j.draft) add("text", "Text");
    if (val(j, "email") || j.draft) add("email", "Email");
    if (phone && (outcome === "call" || kind === "call")) add("call", "Call", { href: "tel:" + phone.replace(/[^\d+]/g, "") });
    if (!j.draft && !done) add("grok", "Ask Grok");
    if (!done) add(priority ? "uncap" : "cap", priority ? "Off the cap" : "Cap");
    const line = outDesk ? "Off the desk. Confirm done, or tap Needs a hand." : (missing.length ? "Need " + missing[0] + " before this can go." : (j.needLine || j.next || (decide ? "Ready. Yes or Stop." : (priority ? "On the cap. Do this first." : "Do the next thing this card needs."))));
    return { line: line, actions: actions, missing: missing, decide: decide, priority: priority, outDesk: outDesk };
  }
  function smsOf(j) {
    const draft = (j && (j.draft || j.title)) || "";
    if (typeof smsHref === "function") return smsHref(draft);
    return "sms:?&body=" + encodeURIComponent(draft);
  }
  function mailOf(j) {
    const draft = (j && (j.draft || j.title)) || "";
    if (typeof mailHref === "function") return mailHref(j.title, draft);
    return "mailto:?subject=" + encodeURIComponent((j && j.title) || "Desk draft") + "&body=" + encodeURIComponent(draft);
  }
  function cardActionHtml(j, staff, where) {
    const need = cardNeeds(j, staff);
    const money = Number(j.amount || j.ask || 0);
    const bits = [];
    if (where === "queue") bits.push("<button class=\"edit\" type=\"button\" onclick=\"openJob('" + j.id + "')\">Open</button>");
    need.actions.slice(0, where === "queue" ? 6 : 10).forEach(function (a) {
      if (where === "queue" && a.id === "open") return;
      if (a.id === "text") bits.push("<a class=\"edit\" href=\"" + smsOf(j) + "\">" + a.label + "</a>");
      else if (a.id === "email") bits.push("<a class=\"edit\" href=\"" + mailOf(j) + "\">" + a.label + "</a>");
      else if (a.id === "call") bits.push("<a class=\"edit\" href=\"" + (a.href || "#") + "\">" + a.label + "</a>");
      else if (a.id === "yes") bits.push("<button class=\"go\" type=\"button\" onclick=\"ship('" + j.id + "', " + money + ")\">Yes</button>");
      else if (a.id === "stop") bits.push("<button class=\"kill\" type=\"button\" onclick=\"kill('" + j.id + "', '" + String(j.title || "").replace(/'/g, "") + "')\">Stop</button>");
      else if (a.id === "copy") bits.push("<button class=\"edit\" type=\"button\" onclick=\"copyDraft('" + j.id + "')\">Copy draft</button>");
      else if (a.id === "grok") bits.push("<button class=\"edit\" type=\"button\" onclick=\"(typeof helpWithAi==='function'&&helpWithAi('" + j.id + "'))\">Ask Grok</button>");
      else if (a.id === "cap") bits.push("<button class=\"go cap-tap\" type=\"button\" onclick=\"pinCap('" + j.id + "', true)\">Cap</button>");
      else if (a.id === "uncap") bits.push("<button class=\"edit\" type=\"button\" onclick=\"pinCap('" + j.id + "', false)\">Off the cap</button>");
      else if (a.id === "fill" || a.id === "ask" || a.id === "hand") bits.push("<button class=\"edit\" type=\"button\" onclick=\"openJob('" + j.id + "')\">" + a.label + "</button>");
      else if (a.id === "handback") bits.push("<button class=\"edit\" type=\"button\" onclick=\"(typeof needHand==='function'&&needHand('" + j.id + "'))\">Needs a hand</button>");
      else if (a.id === "done") bits.push("<button class=\"go\" type=\"button\" onclick=\"(typeof carryJob==='function'&&carryJob('" + j.id + "'))\">Done</button>");
    });
    return "<div class=\"row actions tap-opts\">" + bits.join("") + "</div>";
  }
  async function helpWithAi(id) {
    const banner = document.getElementById("banner");
    if (typeof api !== "function") return;
    const out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "recommend", id: id, whoTapped: (typeof youName !== "undefined" && youName) || "desk" }) });
    const line = out.status >= 400 ? ((out.data && out.data.error) || "Could not draft help.") : "Grok drafted on the card. Nothing sent.";
    if (typeof load === "function") await load();
    if (banner) banner.textContent = line;
    if (typeof openJob === "function") openJob(id);
  }
  async function pinCap(id, on) {
    const banner = document.getElementById("banner");
    if (typeof api !== "function") return;
    const out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "priority", id: id, on: on !== false, whoTapped: (typeof youName !== "undefined" && youName) || "desk" }) });
    if (banner) banner.textContent = out.status >= 400 ? ((out.data && out.data.error) || "Could not move that on the cap.") : (on !== false ? "On the cap. Orange. Top of the pyramid." : "Off the cap.");
    if (typeof load === "function") await load();
    loadCap();
  }
  async function openCapDesk(slug, id) {
    const found = window.AIADesks && AIADesks.find ? AIADesks.find(slug) : null;
    if (found && found.pin) {
      localStorage.setItem("aia_ws", found.slug);
      localStorage.setItem("aia_pin", found.pin);
      const ws = document.getElementById("ws");
      const pin = document.getElementById("pin");
      if (ws) ws.value = found.slug;
      if (pin) pin.value = found.pin;
      if (typeof load === "function") await load();
      if (id && typeof openJob === "function") openJob(id);
      return;
    }
    window.location.href = "/desks";
  }
  async function loadCap() {
    const band = document.getElementById("cap-band");
    const box = document.getElementById("cap-list");
    if (!band || !box || typeof api !== "function") return;
    const rows = (window.AIADesks && AIADesks.list) ? AIADesks.list() : [];
    const here = localStorage.getItem("aia_ws") || "";
    const pin = localStorage.getItem("aia_pin") || "";
    const desks = rows.filter(function (d) { return d && d.slug && d.pin && String(d.pin).length >= 4; });
    if (here && pin && !desks.some(function (d) { return d.slug === here; })) desks.unshift({ slug: here, pin: pin });
    if (!desks.length) { band.hidden = true; return; }
    try {
      const out = await api("/api/desks", { method: "POST", body: JSON.stringify({ action: "priority", desks: desks.slice(0, 32) }) });
      const items = (out.data && out.data.items) || [];
      if (!items.length) { band.hidden = true; box.innerHTML = ""; return; }
      band.hidden = false;
      box.innerHTML = items.map(function (j) {
        const other = (j.slug || j.workspace) && (j.slug || j.workspace) !== here;
        return "<article class=\"item cap-card\"><div class=\"meta\"><span class=\"cap-mark\">Cap</span> " + esc(j.desk || j.slug || "") + "</div><h3>" + esc(j.title) + "</h3><p class=\"meta\">" + esc(j.next || "On the cap.") + "</p>" +
          (other ? "<div class=\"row\"><button class=\"go cap-tap\" type=\"button\" onclick=\"openCapDesk('" + String(j.slug || "").replace(/'/g, "") + "','" + String(j.id || "").replace(/'/g, "") + "')\">Open on " + esc(j.desk || j.slug || "that desk") + "</button></div>" : "<div class=\"row\"><button class=\"edit\" type=\"button\" onclick=\"openJob('" + String(j.id || "").replace(/'/g, "") + "')\">Open</button></div>") +
          "</article>";
      }).join("");
    } catch (e) { band.hidden = true; }
  }
  window.cardNeeds = cardNeeds;
  window.cardActionHtml = cardActionHtml;
  window.helpWithAi = helpWithAi;
  window.pinCap = pinCap;
  window.openCapDesk = openCapDesk;
  window.loadCap = loadCap;
  window.card = function (j, staff) {
    const need = cardNeeds(j, staff);
    const cap = !!need.priority;
    const why = (typeof visitorLine === "function" ? visitorLine(j.why) : (j.why || ""));
    const status = typeof labelStatus === "function" ? labelStatus(j.status) : (j.status || "");
    return "<article class=\"item" + (cap ? " cap-card" : "") + "\"><div class=\"meta\">" + (cap ? "<span class=\"cap-mark\">Cap</span> " : "") + esc(status) + (j.assignee ? " · " + esc(j.assignee) : "") + "</div><h3>" + esc(j.title) + "</h3>" + (j.photoUrl ? "<img class=\"thumb\" src=\"" + esc(j.photoUrl) + "\" alt=\"\">" : "") + (why ? "<p>" + esc(why) + "</p>" : "") + (j.draft ? "<div class=\"draft\">" + esc(j.draft) + "</div>" : "") + "<p class=\"next-line\">" + esc(need.line || "") + "</p>" + cardActionHtml(j, staff, "queue") + "</article>";
  };
  function wrapLoad() {
    if (typeof window.load !== "function") { setTimeout(wrapLoad, 200); return; }
    if (window.load._aiaCap) return;
    const p = window.load;
    window.load = async function () {
      const out = await p.apply(this, arguments);
      try { await loadCap(); } catch (e) {}
      return out;
    };
    window.load._aiaCap = true;
  }
  function injectCap() {
    if (document.getElementById("cap-band")) return;
    const queue = document.getElementById("queue");
    if (!queue) return;
    const band = document.createElement("div");
    band.id = "cap-band";
    band.className = "cap-band";
    band.hidden = true;
    band.innerHTML = "<h2>Cap · orange · every desk on this account</h2><div id=\"cap-list\"></div>";
    queue.parentNode.insertBefore(band, queue);
    if (!document.getElementById("aia-cap-css")) {
      const css = document.createElement("style");
      css.id = "aia-cap-css";
      css.textContent = ".cap-card{border-left:4px solid var(--orange,#f39c12)}.cap-mark{display:inline-flex;background:var(--orange,#f39c12);color:#0c1116;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border-radius:999px;padding:2px 8px}.cap-band h2{font-size:13px;margin:8px 0 6px}.cap-tap{background:var(--orange,#f39c12);color:#0c1116}";
      document.head.appendChild(css);
    }
  }
  wrapLoad();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectCap);
  else injectCap();
})();
