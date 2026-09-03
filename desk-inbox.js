/* AIA desk inbox — owner Accept on the working desk.
   Humans, agents, and pipes talk on the same card thread.
   AIA does not send. */
(function () {
  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function headers() {
    var h = { "Content-Type": "application/json", "X-Workspace": localStorage.getItem("aia_ws") || "" };
    var pin = localStorage.getItem("aia_pin");
    var ses = localStorage.getItem("aia_session");
    if (pin) h["X-Pin"] = pin;
    if (ses) h["X-Session"] = ses;
    return h;
  }
  async function api(path, opts) {
    var r = await fetch(path, Object.assign({ headers: headers() }, opts || {}));
    var data = await r.json().catch(function () { return {}; });
    return { status: r.status, data: data };
  }
  function box() {
    var el = document.getElementById("desk-inbox");
    if (el) return el;
    var banner = document.getElementById("banner");
    el = document.createElement("section");
    el.id = "desk-inbox";
    el.className = "desk-inbox";
    el.hidden = true;
    if (banner && banner.parentNode) banner.parentNode.insertBefore(el, banner.nextSibling);
    else document.body.insertBefore(el, document.body.firstChild);
    return el;
  }
  function kindLabel(p) {
    var k = String((p && p.kind) || (p && p.role) || "helper").toLowerCase();
    if (k === "agent") return "AI agent";
    if (k === "pipe" || k === "connection") return "Connection";
    if (k === "family" || k === "friend") return "Family";
    if (k === "staff") return "Staff";
    if (k === "member") return "Member";
    return "Helper";
  }
  function laneOf(p) {
    var k = String((p && p.kind) || "").toLowerCase();
    if (k === "agent") return "agent";
    if (k === "pipe" || k === "connection") return "pipe";
    return "human";
  }
  function talkLine(item) {
    var who = (item && (item.who || item.from || item.kind)) || "Desk";
    var text = (item && (item.text || item.note || item.body)) || "";
    var t = item && item.t ? new Date(item.t).toLocaleString() : "";
    return "<div class=\"sheet-row inbox-say\"><b>" + esc(who) + "</b><div class=\"meta\">" + esc(text) + (t ? " · " + esc(t) : "") + "</div></div>";
  }
  function card(p) {
    var lane = laneOf(p);
    var thread = (p.thread || p.talk || []).slice(-6).map(talkLine).join("");
    var id = esc(p.id || "");
    return "<article class=\"item inbox-card inbox-" + lane + "\" data-id=\"" + id + "\">" +
      "<div class=\"meta\">Needs you · " + esc(kindLabel(p)) + (p.desk ? " · " + esc(p.desk) : "") + "</div>" +
      "<h3>" + esc(p.name || "Someone") + " asked to sit</h3>" +
      "<p>" + esc(p.does || p.note || p.ask || "Waiting on Accept. They do not open the queue yet.") + "</p>" +
      (thread || "<p class=\"meta\">No talk on this card yet.</p>") +
      "<label class=\"meta\">Say something on this desk</label>" +
      "<input data-say=\"" + id + "\" placeholder=\"Reply stays on the desk. AIA does not send.\">" +
      "<div class=\"row actions tap-opts\">" +
        "<button class=\"go\" type=\"button\" data-act=\"accept\" data-id=\"" + id + "\">Accept</button>" +
        "<button class=\"kill\" type=\"button\" data-act=\"deny\" data-id=\"" + id + "\">Deny</button>" +
        "<button class=\"edit\" type=\"button\" data-act=\"say\" data-id=\"" + id + "\">Say</button>" +
        "<a class=\"edit\" href=\"/people?who=" + encodeURIComponent(p.name || "") + "&f=waiting\">Open on People</a>" +
      "</div></article>";
  }
  async function act(kind, id, extra) {
    var body = { action: kind === "accept" ? "approve" : kind, id: id };
    if (extra) Object.assign(body, extra);
    var out = await api("/api/admin", { method: "POST", body: JSON.stringify(body) });
    var banner = document.getElementById("banner");
    if (out.status >= 400) {
      if (banner) banner.textContent = (out.data && out.data.error) || "Could not update that request.";
      return;
    }
    if (banner) banner.textContent = kind === "accept" ? "Accepted on this desk. They can open the queue." : kind === "deny" ? "Denied. They stay off the queue." : "Said on the desk. AIA did not send.";
    load();
    if (typeof window.load === "function" && window.load !== load) window.load();
  }
  async function load() {
    var el = box();
    if (!localStorage.getItem("aia_ws") || !(localStorage.getItem("aia_session") || localStorage.getItem("aia_pin"))) {
      el.hidden = true;
      return;
    }
    var out = await api("/api/admin");
    var d = out.data || {};
    var you = d.you || {};
    var owner = you.role === "owner" || you.kind === "owner";
    var people = d.people || [];
    var waiting = people.filter(function (p) { return p && (p.status === "pending" || p.status === "waiting"); });
    var asks = (d.asks || d.approvals || []).filter(function (a) { return a && (a.status === "pending" || !a.status); });
    var pipes = ((d.connections || d.pipes) || []).filter(function (c) { return c && (c.status === "pending" || c.status === "ask"); });
    pipes.forEach(function (c) {
      waiting.push({ id: c.id, name: c.label || c.provider || "Pipe", kind: "pipe", status: "pending", note: c.note || "Connection waiting on Accept.", thread: c.thread || [] });
    });
    asks.forEach(function (a) {
      if (!waiting.some(function (p) { return p.id === a.id; })) waiting.push(a);
    });
    if (!waiting.length) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    var who = owner ? "Owner desk. Accept, deny, or talk here." : "Waiting on the owner. You can say something. AIA does not send.";
    el.innerHTML = "<h2>Needs you</h2><p class=\"meta\">" + who + " Humans, agents, and connections talk on this desk.</p>" + waiting.map(card).join("");
    el.onclick = function (e) {
      var btn = e.target.closest("[data-act]");
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      var kind = btn.getAttribute("data-act");
      if (kind === "say") {
        var input = el.querySelector("[data-say=\"" + id + "\"]");
        var text = input ? String(input.value || "").trim() : "";
        if (!text) return;
        act("say", id, { text: text, who: (you.name || "desk") });
        return;
      }
      if (!owner && (kind === "accept" || kind === "deny")) return;
      act(kind, id);
    };
  }
  function wrap() {
    if (typeof window.load === "function" && !window.load._aiaInbox) {
      var prev = window.load;
      window.load = async function () {
        var out = await prev.apply(this, arguments);
        try { await load(); } catch (err) {}
        return out;
      };
      window.load._aiaInbox = true;
    }
    load();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wrap);
  else wrap();
})();
