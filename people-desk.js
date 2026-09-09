/* People sheet Accept / Deny / Say. Additive. AIA does not send. */
(function () {
  function $(id) { return document.getElementById(id); }
  function headers() {
    var h = { "Content-Type": "application/json", "X-Workspace": localStorage.getItem("aia_ws") || "" };
    var pin = localStorage.getItem("aia_pin");
    var ses = localStorage.getItem("aia_session");
    if (pin) h["X-Pin"] = pin;
    if (ses) h["X-Session"] = ses;
    return h;
  }
  async function api(path, body) {
    var r = await fetch(path, { method: "POST", headers: headers(), body: JSON.stringify(body || {}) });
    var data = await r.json().catch(function () { return {}; });
    return { status: r.status, data: data };
  }
  function banner(text) {
    var el = $("banner");
    if (el) el.textContent = text;
  }
  function currentPerson() {
    var name = ($("sheet-name") && $("sheet-name").textContent) || "";
    var list = (window.STATE && STATE.people) || [];
    return list.find(function (p) { return p && String(p.name || "") === name; }) || list.find(function (p) {
      return p && name && String(p.name || "").toLowerCase().indexOf(name.toLowerCase()) >= 0;
    }) || null;
  }
  function ensureActs() {
    if ($("sheet-approve")) return;
    var last = $("sheet-last");
    if (!last || !last.parentNode) return;
    var box = document.createElement("div");
    box.innerHTML =
      "<div class=\"acts\" id=\"sheet-owner\">" +
      "<button class=\"go\" type=\"button\" id=\"sheet-approve\">Accept</button>" +
      "<button class=\"kill\" type=\"button\" id=\"sheet-deny\">Deny</button>" +
      "</div>" +
      "<div class=\"talk\" id=\"sheet-talk\">" +
      "<input id=\"sheet-say\" placeholder=\"Say it on this desk — human, agent, or pipe\" autocomplete=\"off\">" +
      "<button class=\"edit\" type=\"button\" id=\"sheet-say-btn\">Say</button>" +
      "</div>" +
      "<p class=\"meta\">Talk stays on the desk. AIA does not send.</p>";
    last.parentNode.insertBefore(box, last.nextSibling);
  }
  async function seatAct(action) {
    var person = currentPerson();
    var id = person && (person.id || person.personId);
    if (!id) { banner("Open a waiting person first."); return; }
    var out = await api("/api/admin", { action: action, id: id });
    banner(out.status >= 400 ? ((out.data && out.data.error) || "Owner has to tap that.") : (action === "deny" ? "Denied. They stay off this desk." : "Accepted. They can open this desk."));
    if (typeof window.load === "function") window.load();
  }
  async function say() {
    var person = currentPerson();
    var id = person && (person.id || person.personId);
    var text = (($("sheet-say") && $("sheet-say").value) || "").trim();
    if (!text) return;
    if (!id) { banner("Open a person first."); return; }
    var out = await api("/api/admin", { action: "say", id: id, text: text, who: (window.STATE && STATE.you && STATE.you.name) || "desk" });
    banner(out.status >= 400 ? ((out.data && out.data.error) || "Could not say that.") : "Said on the desk. AIA did not send.");
    if ($("sheet-say")) $("sheet-say").value = "";
  }
  function wire() {
    ensureActs();
    var approve = $("sheet-approve");
    var deny = $("sheet-deny");
    var sayBtn = $("sheet-say-btn");
    if (approve && !approve._aia) { approve._aia = true; approve.addEventListener("click", function () { seatAct("approve"); }); }
    if (deny && !deny._aia) { deny._aia = true; deny.addEventListener("click", function () { seatAct("deny"); }); }
    if (sayBtn && !sayBtn._aia) { sayBtn._aia = true; sayBtn.addEventListener("click", say); }
  }
  function wrap() {
    if (typeof window.openSheet === "function" && !window.openSheet._aiaAccept) {
      var prev = window.openSheet;
      window.openSheet = async function () {
        var out = await prev.apply(this, arguments);
        try { wire(); } catch (e) {}
        return out;
      };
      window.openSheet._aiaAccept = true;
    }
    wire();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wrap);
  else wrap();
})();
