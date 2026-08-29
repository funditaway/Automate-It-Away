function openUsType() {
  document.getElementById("sheet-card").innerHTML =
    "<h3>We type it onto this queue</h3>" +
    "<p class=\"meta\">You tell us. We write the card. You still tap Send or Stop.</p>" +
    "<label>What should we put on the queue?</label>" +
    "<input id=\"cap-title\" placeholder=\"Permission slip Friday, oil change, oak dresser\">" +
    "<label>When or ask</label>" +
    "<input id=\"cap-when\" placeholder=\"Friday / $40\">" +
    "<label>Note for us</label>" +
    "<textarea id=\"cap-note\" rows=\"2\" placeholder=\"From the school packet / neighbor asked\"></textarea>" +
    "<input type=\"hidden\" id=\"cap-kind\" value=\"note\">" +
    "<div class=\"row\" style=\"margin-top:12px\">" +
      "<button class=\"go\" type=\"button\" onclick=\"captureFromUs()\">Put it on the queue</button>" +
      "<button class=\"edit\" type=\"button\" onclick=\"document.getElementById('sheet').classList.remove('on')\">Cancel</button>" +
    "</div>";
  document.getElementById("sheet").classList.add("on");
}
async function captureFromUs() {
  const titleEl = document.getElementById("cap-title");
  if (titleEl && !titleEl.value) titleEl.value = "Desk note";
  const kind = document.getElementById("cap-kind");
  if (kind) kind.value = "note";
  await capture();
}
function jobBy(id) { return JOBS.find(j => j.id === id); }
function openJob(id) {
  const j = jobBy(id);
  if (!j) return;
  const staff = role === "employee";
  const money = Number(j.amount || j.ask || 0);
  const recs = (j.recs || []).map(r => "<li>" + esc(r.text) + "</li>").join("");
  const thread = (j.thread || []).map(t => "<div><b>" + esc(t.from) + "</b> · " + esc(t.kind || "note") + "<br>" + esc(t.text) + "</div>").join("") || "<div>No notes yet.</div>";
  const custom = (FIELDS || []).map(f => {
    const val = (j.custom && j.custom[f.key]) || j[f.key] || "";
    return "<label>" + esc(f.label) + "</label><input data-field=\"" + esc(f.key) + "\" value=\"" + esc(val) + "\" placeholder=\"" + esc(f.label) + "\">";
  }).join("");
  document.getElementById("sheet-card").innerHTML =
    "<h3>" + esc(j.title) + "</h3>" +
    "<p class=\"meta\">" + labelStatus(j.status) + " · " + esc(j.pack || "") + " · " + esc(j.risk || "none") + "</p>" +
    (j.photoUrl ? "<img class=\"thumb\" src=\"" + esc(j.photoUrl) + "\" alt=\"\">" : "") +
    "<p>" + esc(j.why || "") + "</p>" +
    "<p class=\"meta\">Grok recs</p><ul class=\"recs\">" + (recs || "<li>Open this card. Send or Stop.</li>") + "</ul>" +
    (j.draft ? "<div class=\"draft\">" + esc(j.draft) + "</div>" : "") +
    "<div class=\"talk\">" + thread + "</div>" + custom +
    "<label>Note or ask</label><textarea id=\"job-note\" rows=\"2\" placeholder=\"Need the due date / dad already signed\"></textarea>" +
    "<div class=\"row\" style=\"margin-top:10px\">" +
      "<button class=\"edit\" type=\"button\" onclick=\"saveJob('" + j.id + "')\">Save info</button>" +
      "<button class=\"edit\" type=\"button\" onclick=\"askMore('" + j.id + "')\">Ask for more</button>" +
      "<button class=\"edit\" type=\"button\" onclick=\"addNote('" + j.id + "')\">Add note</button>" +
    "</div>" +
    (staff ? "" : "<div class=\"row\" style=\"margin-top:8px\"><input id=\"new-field\" placeholder=\"New field name\" style=\"flex:1\"><button class=\"edit\" type=\"button\" onclick=\"addField()\">Add field</button></div>") +
    "<div class=\"row\" style=\"margin-top:12px\">" +
      "<button class=\"edit\" type=\"button\" onclick=\"phoneCal('" + j.id + "')\">Phone calendar</button>" +
      "<button class=\"go\" type=\"button\" onclick=\"ship('" + j.id + "', " + money + ")\">" + (money ? "Send $" + money : "Send") + "</button>" +
      (staff ? "" : "<button class=\"kill\" type=\"button\" onclick=\"kill('" + j.id + "', '" + esc(j.title).replace(/'/g, "") + "')\">Stop</button>") +
      "<button class=\"edit\" type=\"button\" onclick=\"document.getElementById('sheet').classList.remove('on')\">Close</button>" +
    "</div>";
  document.getElementById("sheet").classList.add("on");
}
function collectCustom() {
  const custom = {};
  document.querySelectorAll("[data-field]").forEach(el => { custom[el.getAttribute("data-field")] = el.value; });
  return custom;
}
async function saveJob(id) {
  const custom = collectCustom();
  const note = (document.getElementById("job-note") || {}).value || "";
  const timing = custom.when || undefined;
  await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "fill", id, custom, timing, whoTapped: youName || role || "desk" }) });
  if (note) await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "say", id, text: note, whoTapped: youName || "desk" }) });
  await load();
  openJob(id);
}
async function addNote(id) {
  const text = (document.getElementById("job-note") || {}).value || "";
  if (!text) return;
  await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "say", id, text, whoTapped: youName || "desk" }) });
  await load();
  openJob(id);
}
async function askMore(id) {
  const text = (document.getElementById("job-note") || {}).value || "Need a bit more before this can go.";
  await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "ask", id, text, whoTapped: youName || "desk" }) });
  await load();
  openJob(id);
}
async function phoneCal(id) {
  const r = await fetch("/api/jobs?ics=" + encodeURIComponent(id), { headers: headers() });
  if (!r.ok) {
    document.getElementById("banner").textContent = "Could not make the calendar file.";
    return;
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = id + ".ics";
  a.click();
  URL.revokeObjectURL(url);
}
async function addField() {
  const label = (document.getElementById("new-field") || {}).value || "";
  if (!label) return;
  const out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "define-field", label, whoTapped: youName || "owner" }) });
  if (out.status >= 400) {
    document.getElementById("banner").textContent = (out.data && out.data.error) || "Could not add field.";
    return;
  }
  FIELDS = out.data.fields || FIELDS;
  const open = document.querySelector("#sheet-card h3");
  await load();
  if (open) {
    const j = JOBS.find(x => x.title === open.textContent);
    if (j) openJob(j.id);
  }
}

(function bootDeskHome() {
  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }
  ready(function () {
    const row = document.querySelector("main .row");
    if (row && !document.getElementById("us-type-btn")) {
      const btn = document.createElement("button");
      btn.id = "us-type-btn";
      btn.className = "edit";
      btn.type = "button";
      btn.textContent = "We type it in";
      btn.onclick = function () { if (typeof openUsType === "function") openUsType(); };
      const first = row.querySelector("button");
      if (first && first.nextSibling) row.insertBefore(btn, first.nextSibling);
      else row.appendChild(btn);
    }
    if (!document.getElementById("how-in")) {
      const q = document.getElementById("queue");
      if (q) {
        const box = document.createElement("div");
        box.id = "how-in";
        box.className = "item";
        box.innerHTML = "<div class=\"meta\">How work gets here</div><p><b>You drop it</b> — photo, form, missed call. Two taps.</p><p><b>We type it</b> — tell us. We write the card. You still say yes or no.</p><p><b>A pipe</b> — optional. The queue works without one.</p><p class=\"meta\"><a href=\"connections.html\">Add a pipe</a> · <a href=\"chat.html\">Tell us</a></p>";
        q.parentNode.insertBefore(box, q);
      }
    }
    const openBtn = document.querySelector("#gate button");
    if (openBtn && openBtn.textContent.trim() === "Open") openBtn.textContent = "That's my queue";
  });
})();
