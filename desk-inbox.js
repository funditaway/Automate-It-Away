(function () {
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (ch) {
      return ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === "\"" ? "&quot;" : "&#39;";
    });
  }
  async function apiCall(path, opts) {
    if (typeof api === "function") return api(path, opts);
    const req = Object.assign({}, opts || {});
    req.headers = Object.assign({ "Content-Type": "application/json" }, req.headers || {}, typeof headers === "function" ? headers() : {});
    const res = await fetch(path, req);
    const data = await res.json().catch(function () { return {}; });
    return { status: res.status, data: data };
  }
  function pendingPeople(data) {
    return ((data && data.people) || []).filter(function (p) { return p && p.status === "pending"; });
  }
  function inboxBox() {
    var box = document.getElementById("desk-inbox");
    if (box) return box;
    var queue = document.getElementById("queue");
    if (!queue || !queue.parentNode) return null;
    box = document.createElement("div");
    box.id = "desk-inbox";
    box.className = "item";
    queue.parentNode.insertBefore(box, queue);
    return box;
  }
  async function postAdmin(body) {
    return apiCall("/api/admin", { method: "POST", body: JSON.stringify(body || {}) });
  }
  async function pull() {
    var box = inboxBox();
    if (!box) return;
    var a = await apiCall("/api/admin");
    var c = await apiCall("/api/connections");
    var owner = !!(a.data && a.data.you && (a.data.you.role === "owner" || a.data.you.kind === "owner"));
    var pending = pendingPeople(a.data);
    var conns = ((c.data && c.data.connections) || []).map(function (row) { return row.label || row.provider || row.id; });
    var drafts = ((c.data && c.data.drafts) || []).map(function (row) { return row.label || row.provider || row.id; });
    var rows = pending.map(function (p) {
      var id = esc(p.id || "");
      return "<div class=\"item\" style=\"margin:8px 0\"><p><b>" + esc(p.name || p.id || "Pending") + "</b> · " + esc(p.kind || p.role || "helper") + "</p>" +
        (owner ? "<div class=\"row actions\"><button class=\"go\" type=\"button\" onclick=\"window.aiaInboxAdmin('approve','" + id + "')\">Accept</button><button class=\"kill\" type=\"button\" onclick=\"window.aiaInboxAdmin('deny','" + id + "')\">No</button></div>" : "") +
        "<div class=\"row\" style=\"margin-top:6px\"><textarea id=\"inbox-say-" + id + "\" placeholder=\"Say to this person\" maxlength=\"500\" rows=\"2\"></textarea><button class=\"edit\" type=\"button\" onclick=\"window.aiaInboxSay('" + id + "')\">Say</button></div></div>";
    }).join("");
    box.innerHTML =
      "<h3>Inbox</h3>" +
      "<p class=\"meta\">AIA does not send, post, or pay.</p>" +
      (rows || "<p class=\"meta\">No pending people.</p>") +
      "<p class=\"meta\" style=\"margin-top:10px\"><b>Connections</b>: " + (conns.length ? esc(conns.join(", ")) : "None") + " · <a href=\"/connections\">Open</a></p>" +
      "<p class=\"meta\"><b>AI on this desk</b>: " + (drafts.length ? esc(drafts.join(", ")) : "None") + " · <a href=\"/people?f=agent\">People</a></p>";
  }
  window.aiaInboxAdmin = async function (action, id) {
    var out = await postAdmin({ action: action, id: id });
    if (out.status < 400) return pull();
    window.alert((out.data && out.data.error) || "Could not update this request.");
  };
  window.aiaInboxSay = async function (id) {
    var el = document.getElementById("inbox-say-" + id);
    var text = (el && el.value || "").trim().slice(0, 500);
    if (!text) return;
    var out = await postAdmin({ action: "say", id: id, text: text });
    if (out.status >= 400) return window.alert((out.data && out.data.error) || "Could not post this message.");
    if (el) el.value = "";
    return pull();
  };
  function wrapLoad() {
    if (typeof window.load !== "function") return setTimeout(wrapLoad, 200);
    if (window.load._aiaInbox) return;
    var prev = window.load;
    window.load = async function () {
      var out = await prev.apply(this, arguments);
      try { await pull(); } catch (e) {}
      return out;
    };
    window.load._aiaInbox = true;
    pull().catch(function () {});
  }
  wrapLoad();
})();
