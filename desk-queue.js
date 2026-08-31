/* Queue cards: Yes/No on decide jobs. Off-desk done / needs a hand. */
(function () {
  function isDecideJob(j) {
    if (!j) return false;
    if (j.status === "killed" || j.status === "shipped" || j.carried || j.status === "out") return false;
    if (j.waitingOn === "info") return false;
    if (/Need .+ before/i.test(String(j.why || ""))) return false;
    return j.status === "waiting" || j.status === "held";
  }
  window.isDecideJob = isDecideJob;
  window.PIPES = window.PIPES || [];
  window.INBOUND = window.INBOUND || "";

  async function loadPeople() {
    if (typeof PEOPLE !== "undefined" && PEOPLE && PEOPLE.length) return PEOPLE;
    try {
      const out = await api("/api/auth");
      PEOPLE = (out.data && out.data.workspace && out.data.workspace.people) || [];
    } catch (e) { PEOPLE = []; }
    return PEOPLE;
  }
  async function loadPipes() {
    try {
      const out = await api("/api/connections");
      const data = out.data || {};
      window.INBOUND = data.inbound || "";
      const catalog = data.catalog || [];
      const mine = data.connections || [];
      window.PIPES = catalog.map(function (p) {
        const on = mine.find(function (c) { return c.provider === p.id; });
        return { id: p.id, label: p.label, status: on ? (on.status || p.status) : p.status, live: !!(on ? on.live : p.live), onDesk: !!on, note: p.note || "" };
      });
    } catch (e) { window.PIPES = window.PIPES || []; }
    return window.PIPES;
  }
  function livePipes() {
    return (window.PIPES || []).filter(function (p) { return p.live && p.status === "live"; });
  }
  window.helpWithAi = async function (id) {
    const banner = document.getElementById("banner");
    const out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "recommend", id: id, whoTapped: (typeof youName !== "undefined" && youName) || "desk" }) });
    if (banner) banner.textContent = out.status >= 400 ? ((out.data && out.data.error) || "Could not draft help.") : "Grok drafted on the card. Nothing sent.";
    if (typeof load === "function") await load();
    if (typeof openJob === "function") openJob(id);
  };
  window.openHandOff = async function (id) {
    await loadPeople();
    const sheet = document.getElementById("sheet-card");
    const wrap = document.getElementById("sheet");
    if (!sheet || !wrap) return;
    const people = PEOPLE || [];
    const j = (typeof jobBy === "function" ? jobBy(id) : (JOBS || []).find(function (x) { return x.id === id; })) || {};
    const rows = people.map(function (p) {
      const name = p.name || p.id;
      const on = j.assignee && String(j.assignee).toLowerCase() === String(name).toLowerCase();
      return "<button class=\"edit\" type=\"button\" onclick=\"handOffTo('" + id + "', '" + String(name).replace(/'/g, "") + "')\">" + (typeof esc === "function" ? esc(name) : name) + (p.role === "owner" ? " · owner" : " · helper") + (on ? " · has it" : "") + "</button>";
    }).join("");
    sheet.innerHTML = "<h3>Hand off</h3><p class=\"meta\">A person already on this desk. Owner still owns No. AIA does not text them.</p>" + (rows ? "<div class=\"row actions\">" + rows + "</div>" : "<p class=\"meta\">No other people yet.</p><p class=\"meta\"><button class=\"edit\" type=\"button\" onclick=\"openInvite()\">Invite a helper</button></p>") + "<div class=\"sheet-decide\"><button class=\"edit\" type=\"button\" onclick=\"document.getElementById('sheet').classList.remove('on')\">Close</button></div>";
    wrap.classList.add("on");
  };
  window.handOffTo = async function (id, name) {
    const banner = document.getElementById("banner");
    const out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "assign", id: id, name: name, whoTapped: (typeof youName !== "undefined" && youName) || "desk" }) });
    if (out.status >= 400) { if (banner) banner.textContent = (out.data && out.data.error) || "Name someone already on People."; return; }
    document.getElementById("sheet").classList.remove("on");
    if (banner) banner.textContent = "Handed to " + name + ".";
    if (typeof load === "function") await load();
  };
  window.openPipesSheet = async function (id) {
    await loadPipes();
    const sheet = document.getElementById("sheet-card");
    const wrap = document.getElementById("sheet");
    if (!sheet || !wrap) return;
    const live = livePipes();
    const hold = (window.PIPES || []).filter(function (p) { return !p.live; });
    const liveRows = live.map(function (p) { return "<p><b>" + p.label + "</b> · live" + (p.onDesk ? " · on this desk" : "") + "</p>"; }).join("") || "<p class=\"meta\">No named pipe is live. Webhook inbound still writes cards.</p>";
    const holdRows = hold.map(function (p) { return "<p class=\"meta\">" + p.label + " · " + (p.status || "hold") + (p.note ? " · " + p.note : "") + "</p>"; }).join("");
    sheet.innerHTML = "<h3>Pipes</h3><p class=\"meta\">Write back done or hand. AIA does not send money from this sheet.</p><p class=\"meta\">Live now</p>" + liveRows + (window.INBOUND ? "<p class=\"meta\">Inbound hook</p><div class=\"draft\">" + window.INBOUND + "</div>" : "") + "<p class=\"meta\">Hold until keys sit on the box</p>" + holdRows + "<div class=\"row actions\" style=\"margin-top:12px\"><a class=\"edit\" href=\"/connections\">Open Pipes wall</a></div><div class=\"sheet-decide\"><button class=\"edit\" type=\"button\" onclick=\"document.getElementById('sheet').classList.remove('on')\">Close</button></div>";
    wrap.classList.add("on");
  };
  window.sendToPipe = function (id) { openPipesSheet(id); };
  window.doneOffDesk = async function (id) {
    const banner = document.getElementById("banner");
    const note = window.prompt("How did this get done?", "Done off the desk.") || "Done off the desk.";
    const out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "done", id: id, text: note, how: "off-desk", whoTapped: (typeof youName !== "undefined" && youName) || "desk" }) });
    if (banner) banner.textContent = out.status >= 400 ? ((out.data && out.data.error) || "Could not mark done.") : "Done off the desk.";
    const sheet = document.getElementById("sheet");
    if (sheet) sheet.classList.remove("on");
    if (typeof load === "function") await load();
  };
  window.needsHand = async function (id) {
    const banner = document.getElementById("banner");
    const note = window.prompt("What still needs a hand?", "Needs a hand.") || "Needs a hand.";
    const out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "hand", id: id, text: note, whoTapped: (typeof youName !== "undefined" && youName) || "desk" }) });
    if (banner) banner.textContent = out.status >= 400 ? ((out.data && out.data.error) || "Could not bounce this back.") : "Back on the queue. Needs a hand.";
    const sheet = document.getElementById("sheet");
    if (sheet) sheet.classList.remove("on");
    if (typeof load === "function") await load();
  };
  window.queueCard = function (j, staff) {
    const money = Number(j.amount || j.ask || 0);
    const why = typeof visitorLine === "function" ? visitorLine(j.why) : (j.why || "");
    const decide = isDecideJob(j);
    const next = typeof visitorLine === "function" ? visitorLine(j.next) : j.next;
    const outDesk = j.status === "out" || j.awaiting === "writeback";
    const line = outDesk ? (next || "Off the desk. Confirm done, or tap Needs a hand.") : decide ? (next || "Yes or No.") : (next || "Hand off, send off the desk, or ask Grok.");
    const draft = j.draft || j.title || "";
    const sms = typeof smsHref === "function" ? smsHref(draft) : "sms:?&body=" + encodeURIComponent(draft);
    const mail = typeof mailHref === "function" ? mailHref(j.title, draft) : "mailto:?subject=" + encodeURIComponent(j.title || "") + "&body=" + encodeURIComponent(draft);
    const live = livePipes().map(function (p) { return p.label; });
    const pipeLine = live.length ? "Live pipes: " + live.join(", ") : "Live pipe: inbound webhook. Named pipes on hold.";
    const decideBtns = decide ? ("<button class=\"go\" type=\"button\" onclick=\"ship('" + j.id + "', " + money + ")\">Yes</button>" + (staff ? "" : "<button class=\"kill\" type=\"button\" onclick=\"kill('" + j.id + "', '" + String(j.title || "").replace(/'/g, "") + "')\">No</button>")) : "";
    const safe = typeof esc === "function" ? esc : function (s) { return String(s || ""); };
    return "<article class=\"item\"><div class=\"meta\">" + (outDesk ? "Off the desk" : (typeof labelStatus === "function" ? labelStatus(j.status) : j.status)) + (j.assignee ? " · handed to " + safe(j.assignee) : "") + (decide ? " · Yes/No" : outDesk ? " · write-back" : "") + "</div><h3>" + safe(j.title) + "</h3>" + (j.photoUrl ? "<img class=\"thumb\" src=\"" + safe(j.photoUrl) + "\" alt=\"\">" : "") + (why ? "<p>" + safe(why) + "</p>" : "") + (j.draft ? "<div class=\"draft\">" + safe(j.draft) + "</div>" : "") + "<p class=\"meta\">" + safe(line) + "</p><p class=\"meta\">" + safe(pipeLine) + "</p><div class=\"row actions tap-opts\"><button class=\"edit\" type=\"button\" onclick=\"openJob('" + j.id + "')\">Open</button><a class=\"edit\" href=\"" + sms + "\">Text</a><a class=\"edit\" href=\"" + mail + "\">Email</a><button class=\"edit\" type=\"button\" onclick=\"openHandOff('" + j.id + "')\">Hand off</button><button class=\"edit\" type=\"button\" onclick=\"openPipesSheet('" + j.id + "')\">Pipes</button><button class=\"edit\" type=\"button\" onclick=\"helpWithAi('" + j.id + "')\">Ask Grok</button><button class=\"go\" type=\"button\" onclick=\"doneOffDesk('" + j.id + "')\">Done off desk</button><button class=\"edit\" type=\"button\" onclick=\"needsHand('" + j.id + "')\">Needs a hand</button>" + decideBtns + "</div></article>";
  };
  window.paintQueueCard = function () {
    const box = document.getElementById("queue");
    if (!box || typeof JOBS === "undefined") return;
    const staff = typeof role !== "undefined" && role === "employee";
    const open = JOBS.filter(function (j) { return j.status === "held" || j.status === "exception" || j.status === "waiting" || j.status === "out"; });
    box.innerHTML = open.map(function (j) { return window.queueCard(j, staff); }).join("") || "<p style=\"color:var(--muted)\">Nothing here yet.</p>";
  };
  function wrapLoad() {
    if (typeof window.load !== "function") { setTimeout(wrapLoad, 200); return; }
    if (window.load._aiaQueue) return;
    const prev = window.load;
    window.load = async function () {
      const out = await prev.apply(this, arguments);
      try { await loadPipes(); await loadPeople(); window.paintQueueCard(); } catch (e) {}
      return out;
    };
    window.load._aiaQueue = true;
    loadPipes().then(function () { try { window.paintQueueCard(); } catch (e) {} });
  }
  function wrapOpen() {
    if (typeof window.openJob !== "function") { setTimeout(wrapOpen, 200); return; }
    if (window.openJob._aiaDecide) return;
    const prev = window.openJob;
    window.openJob = async function (id) {
      const out = await prev.apply(this, arguments);
      try {
        const j = (typeof jobBy === "function" ? jobBy(id) : (JOBS || []).find(function (x) { return x.id === id; }));
        const decide = isDecideJob(j);
        const sheet = document.getElementById("sheet-card");
        if (sheet && !decide) {
          sheet.querySelectorAll(".sheet-decide .go, .sheet-decide .kill").forEach(function (el) {
            const label = (el.textContent || "").trim();
            if (label === "Yes" || label === "No") el.remove();
          });
        }
        if (sheet && !sheet.querySelector("[data-aia-done]")) {
          const row = sheet.querySelector(".sheet-decide") || sheet;
          const done = document.createElement("button");
          done.className = "go"; done.type = "button"; done.setAttribute("data-aia-done", "1"); done.textContent = "Done off desk";
          done.onclick = function () { doneOffDesk(id); };
          const hand = document.createElement("button");
          hand.className = "edit"; hand.type = "button"; hand.textContent = "Needs a hand";
          hand.onclick = function () { needsHand(id); };
          row.insertBefore(hand, row.firstChild);
          row.insertBefore(done, row.firstChild);
        }
      } catch (e) {}
      return out;
    };
    window.openJob._aiaDecide = true;
  }
  wrapLoad();
  wrapOpen();
})();
