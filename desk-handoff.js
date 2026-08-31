(function () {
  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, function (c) {
      return ({ "&": "&", "<": "<", ">": ">", '"': """ })[c];
    });
  }
  window.handoffLine = window.handoffLine || function (j) {
    if (!j) return "";
    if (j.agentDraft && j.agentDraft.crew) return j.agentDraft.crew + " · " + (j.agentDraft.artifact || "draft") + " on the card";
    var who = (j.handedTo && j.handedTo.name) || j.assignee || "";
    var kind = (j.handedTo && j.handedTo.kind) || "";
    if (who && (kind === "agent" || j.waitingOn === "agent")) return "Handed to " + who + " · agent · drafts only";
    if (who) return "Handed to " + who + (kind ? " · " + kind : "");
    if (j.waitingOn === "owner") return "Waiting on the owner";
    if (j.status === "out") return "Off the desk. Confirm done or Needs a hand.";
    return "On this desk. Hand to a person or an agent.";
  };
  window.handCardTo = window.handCardTo || async function (id) {
    var sel = document.getElementById("hand-to-" + id) || document.getElementById("hand-to");
    var name = sel && sel.value;
    var banner = document.getElementById("banner");
    if (!name || typeof api !== "function") return;
    var out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "assign", id: id, name: name, whoTapped: (window.youName || "desk") }) });
    if (banner) banner.textContent = out.status >= 400 ? ((out.data && out.data.error) || "Could not hand that off.") : ("Handed to " + name + ".");
    if (typeof load === "function") load();
  };
  window.needHand = window.needHand || async function (id) {
    var banner = document.getElementById("banner");
    if (typeof api !== "function") return;
    var out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "hand", id: id, whoTapped: (window.youName || "desk") }) });
    if (banner) banner.textContent = out.status >= 400 ? ((out.data && out.data.error) || "Could not bring it back.") : "Needs a hand. Back on the queue.";
    if (typeof load === "function") load();
  };
  function people() { return (typeof PEOPLE !== "undefined" && PEOPLE) || []; }
  function opts(j) {
    return people().filter(function (p) { return p && p.status !== "pending" && p.status !== "denied"; }).map(function (p) {
      var tag = (p.kind === "agent" || p.role === "agent") ? "agent" : (p.kind || p.role || "");
      var sel = j && j.assignee === p.name ? " selected" : "";
      return "<option value=\"" + esc(p.name) + "\"" + sel + ">" + esc(p.name) + (tag ? " · " + esc(tag) : "") + "</option>";
    }).join("");
  }
  function decorate(article, j) {
    if (!article || !j || article.getAttribute("data-handoff") === "1") return;
    article.setAttribute("data-handoff", "1");
    var line = document.createElement("p");
    line.className = "meta";
    line.textContent = window.handoffLine(j);
    article.appendChild(line);
    if (j.agentDraft) {
      var wrap = document.createElement("div");
      wrap.innerHTML = "<div class=\"draft\"><b>" + esc(j.agentDraft.crew) + " · " + esc(j.agentDraft.artifact) + "</b><br>" +
        esc(j.agentDraft.text) + "<br><span class=\"meta\">Never " + esc((j.agentDraft.never || []).join(", ")) + ". A person taps Send.</span></div>";
      article.appendChild(wrap.firstChild);
    }
    var list = opts(j);
    if (!list) return;
    var row = document.createElement("div");
    row.className = "row actions tap-opts";
    row.innerHTML = "<select id=\"hand-to-" + esc(j.id) + "\" style=\"min-height:44px;max-width:46%\">" + list + "</select>" +
      "<button class=\"edit\" type=\"button\">Hand to</button><button class=\"edit\" type=\"button\">Needs a hand</button>";
    var btns = row.querySelectorAll("button");
    btns[0].onclick = function () { window.handCardTo(j.id); };
    btns[1].onclick = function () { window.needHand(j.id); };
    article.appendChild(row);
  }
  function paint() {
    var jobs = (typeof JOBS !== "undefined" && JOBS) || [];
    var items = document.querySelectorAll("#queue article.item");
    items.forEach(function (el, i) {
      var title = (el.querySelector("h3") && el.querySelector("h3").textContent) || "";
      var open = jobs.filter(function (x) { return x && (x.status === "held" || x.status === "exception" || x.status === "waiting" || x.status === "out"); });
      var j = open[i] || jobs.find(function (x) { return x && x.title === title; });
      if (j) decorate(el, j);
    });
  }
  function wrap() {
    if (typeof window.load === "function" && !window.load._aiaHandoff) {
      var prev = window.load;
      window.load = async function () {
        var out = await prev.apply(this, arguments);
        try { paint(); } catch (e) {}
        return out;
      };
      window.load._aiaHandoff = true;
    }
    paint();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wrap);
  else wrap();
})();
