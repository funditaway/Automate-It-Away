/* Named Yes / Start gate. Yes never ships. Start stays on the card after a bad reload. */
function paintCardStartReady(id, amount) {
  var clean = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!clean) return;
  var card = document.querySelector('[data-job="' + clean + '"]');
  if (!card) return;
  card.classList.add("q-approved");
  var yes = card.querySelector(".q-yes");
  if (!yes) return;
  var btn = document.createElement("button");
  btn.className = "go q-start";
  btn.type = "button";
  btn.textContent = "Start";
  btn.setAttribute("onclick", "startCard('" + clean + "', " + (Number(amount) || 0) + ")");
  yes.replaceWith(btn);
}
function ensureApprovedCardVisible(id) {
  var clean = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!clean) return;
  var queue = document.getElementById("queue");
  if (!queue || (queue.querySelector && queue.querySelector('[data-job="' + clean + '"]'))) return;
  var job = (window.__aiaApprovedJobs && window.__aiaApprovedJobs[clean]) || { id: clean, title: "Approved card", status: "waiting" };
  if (typeof window.card !== "function") return;
  var staff = typeof role !== "undefined" && role === "employee";
  var html = window.card(job, staff);
  if (!html) return;
  if (queue.querySelector && queue.querySelector("#queue-empty")) queue.innerHTML = "";
  if (queue.querySelector && queue.querySelector("[data-job]")) queue.insertAdjacentHTML("afterbegin", html);
  else queue.innerHTML = html;
}
async function approveCard(id) {
  var banner = document.getElementById("banner");
  var clean = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!clean) return;
  if (typeof markCardApproved === "function") markCardApproved(clean);
  else {
    window.__aiaApproved = window.__aiaApproved || {};
    window.__aiaApproved[clean] = true;
    try { sessionStorage.setItem("aia_ok_" + clean, "1"); } catch (err) {}
  }
  var job = window.__aiaApprovedJobs && window.__aiaApprovedJobs[clean];
  var amount = Number(job && (job.amount || job.ask) || 0) || 0;
  paintCardStartReady(clean, amount);
  if (banner) banner.textContent = "Approved. Tap Start when you are ready. Nothing goes out alone.";
  ensureApprovedCardVisible(clean);
  paintCardStartReady(clean, amount);
  if (banner) banner.textContent = "Approved. Tap Start when you are ready. Nothing goes out alone.";
}
function startCard(id, amount) {
  var banner = document.getElementById("banner");
  var clean = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
  var ok = typeof isCardApproved === "function" ? isCardApproved(clean) : !!(window.__aiaApproved && window.__aiaApproved[clean]);
  if (!ok) {
    if (banner) banner.textContent = "Tap Yes to approve first.";
    return;
  }
  if (typeof ship === "function") return ship(clean, amount);
  if (banner) banner.textContent = "Approved. Tap Start when you are ready. Nothing goes out alone.";
}
function installYesStartGate() {
  window.approveCard = approveCard;
  window.startCard = startCard;
  window.paintCardStartReady = paintCardStartReady;
  window.ensureApprovedCardVisible = ensureApprovedCardVisible;
}
installYesStartGate();
setTimeout(installYesStartGate, 0);
setTimeout(installYesStartGate, 500);
