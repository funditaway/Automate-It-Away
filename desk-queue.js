/* Queue cards: Yes/No only on decide jobs. Hand off, pipes, Ask Grok. */
(function () {
  function isDecideJob(j) {
    if (!j) return false;
    if (j.status === "killed" || j.status === "shipped" || j.carried) return false;
    if (j.waitingOn === "info") return false;
    if (/Need .+ before/i.test(String(j.why || ""))) return false;
    return j.status === "waiting" || j.status === "held";
  }
  window.isDecideJob = isDecideJob;
  window.PIPES = window.PIPES || [];
  async function loadPipes() {
    try {
      const out = await api("/api/connections");
      const live = ((out.data && out.data.connections) || []).filter(function (c) {
        return c && (c.live || c.provider === "webhook");
      });
      const cat = ((out.data && out.data.catalog) || []).filter(function (p) {
        return p && p.status === "live";
      });
      window.PIPES = live.length ? live : cat;
    } catch (e) {
      window.PIPES = window.PIPES || [];
    }
    return window.PIPES;
  }
  window.helpWithAi = async function (id) {
    const banner = document.getElementById("banner");
    const out = await api("/api/jobs", {
      method: "POST",
      body: JSON.stringify({ action: "recommend", id: id, whoTapped: (typeof youName !== "undefined" && youName) || "desk" })
    });
    if (banner) banner.textContent = out.status >= 400
      ? ((out.data && out.data.error) || "Could not draft help.")
      : "Grok drafted on the card. Nothing sent.";
    if (typeof load === "function") await load();
    if (typeof openJob === "function") openJob(id);
  };
  window.openHandOff = function (id) {
    if (typeof openJob === "function") openJob(id);
    setTimeout(function () {
      const el = document.getElementById("hand-to");
      if (el) el.focus();
    }, 50);
  };
  window.sendToPipe = function () {
    window.location.href = "/connections";
  };
  window.queueCard = function (j, staff) {
    const money = Number(j.amount || j.ask || 0);
    const why = typeof visitorLine === "function" ? visitorLine(j.why) : (j.why || "");
    const decide = isDecideJob(j);
    const next = typeof visitorLine === "function" ? visitorLine(j.next) : j.next;
    const line = decide ? (next || "Yes or No.") : (next || "Hand off, use a pipe, or ask Grok.");
    const draft = j.draft || j.title || "";
    const sms = typeof smsHref === "function" ? smsHref(draft) : "sms:?&body=" + encodeURIComponent(draft);
    const mail = typeof mailHref === "function" ? mailHref(j.title, draft) : "mailto:?subject=" + encodeURIComponent(j.title || "") + "&body=" + encodeURIComponent(draft);
    const names = (window.PIPES || []).slice(0, 3).map(function (p) { return p.label || p.provider || p.id; }).filter(Boolean);
    const pipeLine = names.length ? "Pipes: " + names.join(", ") : "No live pipe yet. Connect one on Pipes.";
    const decideBtns = decide
      ? ("<button class=\"go\" type=\"button\" onclick=\"ship('" + j.id + "', " + money + ")\">Yes</button>" +
        (staff ? "" : "<button class=\"kill\" type=\"button\" onclick=\"kill('" + j.id + "', '" + String(j.title || "").replace(/'/g, "") + "')\">No</button>"))
      : "";
    const safe = typeof esc === "function" ? esc : function (s) { return String(s || ""); };
    return "<article class=\"item\"><div class=\"meta\">" +
      (typeof labelStatus === "function" ? labelStatus(j.status) : j.status) +
      (j.assignee ? " · handed to " + safe(j.assignee) : "") +
      (decide ? " · Yes/No" : "") +
      "</div><h3>" + safe(j.title) + "</h3>" +
      (j.photoUrl ? "<img class=\"thumb\" src=\"" + safe(j.photoUrl) + "\" alt=\"\">" : "") +
      (why ? "<p>" + safe(why) + "</p>" : "") +
      (j.draft ? "<div class=\"draft\">" + safe(j.draft) + "</div>" : "") +
      "<p class=\"meta\">" + safe(line) + "</p>" +
      "<p class=\"meta\">" + safe(pipeLine) + "</p>" +
      "<div class=\"row actions tap-opts\">" +
        "<button class=\"edit\" type=\"button\" onclick=\"openJob('" + j.id + "')\">Open</button>" +
        "<a class=\"edit\" href=\"" + sms + "\">Text</a>" +
        "<a class=\"edit\" href=\"" + mail + "\">Email</a>" +
        "<button class=\"edit\" type=\"button\" onclick=\"openHandOff('" + j.id + "')\">Hand off</button>" +
        "<button class=\"edit\" type=\"button\" onclick=\"sendToPipe()\">Pipes</button>" +
        "<button class=\"edit\" type=\"button\" onclick=\"helpWithAi('" + j.id + "')\">Ask Grok</button>" +
        decideBtns +
      "</div></article>";
  };
  window.paintQueueCard = function () {
    const box = document.getElementById("queue");
    if (!box || typeof JOBS === "undefined") return;
    const staff = typeof role !== "undefined" && role === "employee";
    const open = JOBS.filter(function (j) {
      return j.status === "held" || j.status === "exception" || j.status === "waiting";
    });
    box.innerHTML = open.map(function (j) { return window.queueCard(j, staff); }).join("") ||
      "<p style=\"color:var(--muted)\">Nothing here yet.</p>";
  };
  function wrapLoad() {
    if (typeof window.load !== "function") { setTimeout(wrapLoad, 200); return; }
    if (window.load._aiaQueue) return;
    const prev = window.load;
    window.load = async function () {
      const out = await prev.apply(this, arguments);
      try { await loadPipes(); window.paintQueueCard(); } catch (e) {}
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
        if (sheet && !sheet.querySelector("[data-aia-help]")) {
          const row = sheet.querySelector(".sheet-decide") || sheet;
          const pipes = document.createElement("button");
          pipes.className = "edit";
          pipes.type = "button";
          pipes.textContent = "Pipes";
          pipes.onclick = function () { sendToPipe(); };
          const help = document.createElement("button");
          help.className = "edit";
          help.type = "button";
          help.setAttribute("data-aia-help", "1");
          help.textContent = "Ask Grok";
          help.onclick = function () { helpWithAi(id); };
          row.insertBefore(help, row.firstChild);
          row.insertBefore(pipes, row.firstChild);
        }
      } catch (e) {}
      return out;
    };
    window.openJob._aiaDecide = true;
  }
  wrapLoad();
  wrapOpen();
})();
