/* Orange cap cards are the first action. AIA writes the taps. */
(function () {
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
    });
  }
  function isActionCard(j) {
    if (typeof window.isActionCard === "function") return window.isActionCard(j);
    if (!j) return false;
    const st = String(j.status || "");
    if (st === "shipped" || st === "killed") return false;
    return !!(j.priority || j.cap || st === "held" || j.waitingOn === "owner" || j.rail === "held");
  }
  function cardNeeds(j, staff) {
    const taps = Array.isArray(j && j.taps) ? j.taps : [];
    const actions = taps.filter(function (t) { return t && !(staff && t.owner); }).map(function (t) {
      return { id: t.id || t.action, label: t.label, action: t.action };
    });
    const priority = isActionCard(j);
    if (!actions.some(function (a) { return a.id === "cap" || a.action === "priority"; })) {
      actions.push({ id: priority ? "uncap" : "cap", label: priority ? "Off the cap" : "Cap", action: "priority" });
    }
    return {
      line: priority ? "On the cap. Do this first." : (j && j.next) || "Taps match what the card needs.",
      actions: actions,
      missing: (j && j.missing) || [],
      decide: !!(j && j.decide),
      priority: priority
    };
  }
  function cardActionHtml(j, staff) {
    if (typeof tapButtons === "function") return "<div class=\"row actions tap-opts\">" + tapButtons(j, staff) + "</div>";
    const need = cardNeeds(j, staff);
    const money = Number(j.amount || j.ask || 0);
    const bits = ["<button class=\"edit\" type=\"button\" onclick=\"openJob('" + j.id + "')\">Open</button>"];
    need.actions.forEach(function (a) {
      if (a.id === "cap") bits.push("<button class=\"go cap-tap\" type=\"button\" onclick=\"pinCap('" + j.id + "', true)\">Cap</button>");
      else if (a.id === "uncap") bits.push("<button class=\"edit\" type=\"button\" onclick=\"pinCap('" + j.id + "', false)\">Off the cap</button>");
      else bits.push("<button class=\"go\" type=\"button\" onclick=\"runTap('" + j.id + "','" + esc(a.id) + "', " + money + ")\">" + esc(a.label) + "</button>");
    });
    return "<div class=\"row actions tap-opts\">" + bits.join("") + "</div>";
  }
  async function pinCap(id, on) {
    if (typeof window.pinCap === "function" && window.pinCap !== pinCap) return window.pinCap(id, on);
    if (typeof api !== "function") return;
    const out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "priority", id: id, on: on !== false, whoTapped: (typeof youName !== "undefined" && youName) || "desk" }) });
    const banner = document.getElementById("banner");
    if (banner) banner.textContent = out.status >= 400 ? ((out.data && out.data.error) || "Could not move that on the cap.") : (on !== false ? "On the cap. Orange. Do this first." : "Off the cap.");
    if (typeof load === "function") await load();
  }
  window.cardNeeds = cardNeeds;
  window.cardActionHtml = cardActionHtml;
  if (typeof window.pinCap !== "function") window.pinCap = pinCap;
})();
