function visitorLine(s) {
  return String(s || "")
    .replace(/Over \$250 waits on the owner\.?/gi, "")
    .replace(/Money over \$250[^.]*\.?/gi, "")
    .replace(/You tap Send or Stop\.?/gi, "")
    .replace(/until (GOOGLE_CLIENT_ID is )?on the box\.?/gi, "")
    .replace(/the key is on the box\.?/gi, "")
    .replace(/Grok recs/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
function recLine(r) {
  if (!r) return "";
  if (typeof r === "string") return visitorLine(r);
  return visitorLine(r.text || r.note || "");
}
function grokRecsBox(j) {
  const recs = (j && j.recs ? j.recs : [])
    .map(recLine)
    .filter(Boolean)
    .filter(function (t, i, a) { return a.indexOf(t) === i; })
    .slice(0, 5);
  const fallback = recs.length ? recs : ["Open this card. Yes or no."];
  return "<div class=\"recs\" id=\"grok-recs\">" +
    "<div class=\"recs-title\">Next step</div>" +
    "<ul>" + fallback.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
    "</div>";
}
function openUsType() {
  document.getElementById("sheet-card").innerHTML =
    "<h3>We type it onto this queue</h3>" +
    "<p class=\"meta\">You tell us. We write the card. You still tap yes or no.</p>" +
    "<label>What should we put on the queue?</label>" +
    "<input id=\"cap-title\" placeholder=\"Permission slip Friday, oil change, oak dresser\">" +
    "<label>When or ask</label>" +
    "<input id=\"cap-when\" placeholder=\"Friday / $40\">" +
    "<label>Note for us</label>" +
    "<textarea id=\"cap-note\" rows=\"2\" placeholder=\"From the school packet / neighbor asked\"></textarea>" +
    "<input type=\"hidden\" id=\"cap-kind\" value=\"note\">" +
    "<div class=\"row actions\" style=\"margin-top:12px\">" +
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
var PEOPLE = typeof PEOPLE === "undefined" ? [] : PEOPLE;
async function loadPeople() {
  if (PEOPLE && PEOPLE.length) return PEOPLE;
  try {
    const auth = await api("/api/auth");
    PEOPLE = (auth.data && auth.data.workspace && auth.data.workspace.people) || [];
  } catch (e) {
    PEOPLE = [];
  }
  return PEOPLE;
}
function smsHref(text) {
  return "sms:?&body=" + encodeURIComponent(text || "");
}
function mailHref(title, text) {
  return "mailto:?subject=" + encodeURIComponent(title || "Desk draft") + "&body=" + encodeURIComponent(text || "");
}
async function openJob(id) {
  const j = jobBy(id);
  if (!j) return;
  await loadPeople();
  const staff = role === "employee";
  const money = Number(j.amount || j.ask || 0);
  const thread = (j.thread || []).map(t => "<div><b>" + esc(t.from) + "</b> · " + esc(t.kind || "note") + "<br>" + esc(t.text) + "</div>").join("") || "<div>No notes yet.</div>";
  const custom = (FIELDS || []).map(f => {
    const val = (j.custom && j.custom[f.key]) || j[f.key] || "";
    return "<label>" + esc(f.label) + "</label><input data-field=\"" + esc(f.key) + "\" value=\"" + esc(val) + "\" placeholder=\"" + esc(f.label) + "\">";
  }).join("");
  const draft = j.draft || j.title || "";
  const peopleOpts = (PEOPLE || []).map(p =>
    "<option value=\"" + esc(p.name) + "\"" + (j.assignee === p.name ? " selected" : "") + ">" + esc(p.name) + (p.role === "owner" ? " · owner" : "") + "</option>"
  ).join("");
  document.getElementById("sheet-card").innerHTML =
    "<h3>" + esc(j.title) + "</h3>" +
    "<p class=\"meta\">" + labelStatus(j.status) + (j.assignee ? " · " + esc(j.assignee) : "") + (j.carried ? " · done by hand" : "") + (j.kind ? " · " + esc(j.kind) : "") + "</p>" +
    (j.outcome || (j.custom && j.custom.outcome)
      ? "<p class=\"meta\">They want: " + esc(j.outcome || j.custom.outcome) + (j.next ? " · " + esc(j.next) : "") + "</p>"
      : "") +
    grokRecsBox(j) +
    (j.photoUrl ? "<img class=\"thumb\" src=\"" + esc(j.photoUrl) + "\" alt=\"\">" : "") +
    (visitorLine(j.why) ? "<p>" + esc(visitorLine(j.why)) + "</p>" : "") +
    (j.draft ? "<div class=\"draft\">" + esc(j.draft) + "</div>" : "") +
    "<div class=\"talk\">" + thread + "</div>" + custom +
    "<label>Note or ask</label><textarea id=\"job-note\" rows=\"2\" placeholder=\"Need the due date / already texted her\"></textarea>" +
    "<p class=\"meta\">Desk</p>" +
    "<div class=\"row actions\">" +
      "<button class=\"edit\" type=\"button\" onclick=\"saveJob('" + j.id + "')\">Save info</button>" +
      "<button class=\"edit\" type=\"button\" onclick=\"askMore('" + j.id + "')\">Ask for more</button>" +
      "<button class=\"edit\" type=\"button\" onclick=\"addNote('" + j.id + "')\">Add note</button>" +
      (staff ? "" : "<button class=\"edit\" type=\"button\" onclick=\"addFieldPrompt('" + j.id + "')\">Add field</button>") +
    "</div>" +
    (peopleOpts
      ? "<label>Hand to</label><div class=\"row actions\"><select id=\"hand-to\">" + peopleOpts + "</select><button class=\"edit\" type=\"button\" onclick=\"handTo('" + j.id + "')\">Hand to</button></div>"
      : "<p class=\"meta\"><a href=\"/admin\">Add people</a> to hand work off.</p>") +
    "<p class=\"meta\">Send it yourself</p>" +
    "<div class=\"row actions\">" +
      "<button class=\"edit\" type=\"button\" onclick=\"copyDraft('" + j.id + "')\">Copy draft</button>" +
      "<a class=\"edit\" href=\"" + smsHref(draft) + "\">Text it</a>" +
      "<a class=\"edit\" href=\"" + mailHref(j.title, draft) + "\">Email it</a>" +
      "<button class=\"edit\" type=\"button\" onclick=\"phoneCal('" + j.id + "')\">Save a file</button>" +
    "</div>" +
    "<div class=\"sheet-decide\">" +
      "<button class=\"edit\" type=\"button\" onclick=\"carryJob('" + j.id + "')\">Done by hand</button>" +
      "<button class=\"edit\" type=\"button\" onclick=\"document.getElementById('sheet').classList.remove('on')\">Close</button>" +
      "<button class=\"go\" type=\"button\" onclick=\"ship('" + j.id + "', " + money + ")\">Yes</button>" +
      (staff ? "<span></span>" : "<button class=\"kill\" type=\"button\" onclick=\"kill('" + j.id + "', '" + esc(j.title).replace(/'/g, "") + "')\">No</button>") +
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
async function handTo(id) {
  const name = (document.getElementById("hand-to") || {}).value || "";
  if (!name) return;
  const out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "assign", id, name, whoTapped: youName || "desk" }) });
  if (out.status >= 400) {
    document.getElementById("banner").textContent = (out.data && out.data.error) || "Could not hand that off.";
    return;
  }
  await load();
  openJob(id);
}
async function copyDraft(id) {
  const j = jobBy(id);
  const text = (j && (j.draft || j.title || "")) || "";
  try {
    await navigator.clipboard.writeText(text);
    document.getElementById("banner").textContent = "Draft copied. Paste it where it goes.";
  } catch (e) {
    window.prompt("Copy this", text);
  }
}
async function carryJob(id) {
  const note = ((document.getElementById("job-note") || {}).value || "Done by hand.").trim();
  const out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "carry", id, text: note, whoTapped: youName || role || "desk" }) });
  document.getElementById("sheet").classList.remove("on");
  if (out.status === 403) {
    document.getElementById("banner").textContent = (out.data && out.data.error) || "Waiting on the owner.";
  } else {
    document.getElementById("banner").textContent = "Marked done by hand.";
  }
  load();
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
function addFieldPrompt(id) {
  const label = window.prompt("New field name");
  if (!label) return;
  addField(label, id);
}
async function addField(label, id) {
  const name = label || (document.getElementById("new-field") || {}).value || "";
  if (!name) return;
  const out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "define-field", label: name, whoTapped: youName || "owner" }) });
  if (out.status >= 400) {
    document.getElementById("banner").textContent = (out.data && out.data.error) || "Could not add field.";
    return;
  }
  FIELDS = out.data.fields || FIELDS;
  await load();
  if (id) openJob(id);
}

// Buttons live in #desk-actions on desk.html. Do not inject into #gate.
