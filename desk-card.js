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
  const fallback = recs.length ? recs : ["Open this card. Yes or Stop."];
  return "<div class=\"recs\" id=\"grok-recs\">" +
    "<div class=\"recs-title\">Next step</div>" +
    "<ul>" + fallback.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
    "</div>";
}
function openUsType() {
  document.getElementById("sheet-card").innerHTML =
    "<h3>We type it onto this queue</h3>" +
    "<p class=\"meta\">You tell us. We write the card. You still tap Yes or Stop.</p>" +
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
function thenWhoOf(j) {
  if (j && j.deskAi && j.deskAi.name) return String(j.deskAi.name);
  if (j && j.agentDraft && j.agentDraft.deskAi && (j.agentDraft.name || j.agentDraft.crew)) {
    return String(j.agentDraft.name || j.agentDraft.crew);
  }
  return "";
}
function thenGoneOf(j) {
  const g = j && j.thenAiGone;
  const name = g && (g.name || g.id) || "";
  return String(name || "").trim();
}
function namedNeedsWhoOf(j) {
  const who = thenWhoOf(j);
  if (who) return who;
  const gone = thenGoneOf(j);
  return gone ? (gone + " · not on this desk") : "";
}
function sheetNeedOf(j) {
  if (typeof cardNeeds === "function") return cardNeeds(j, false);
  return { decide: false, missing: [], priority: !!(j && (j.priority || j.cap)) };
}
function sheetChipsHtml(j) {
  if (typeof chipsHtml === "function") return chipsHtml(j, sheetNeedOf(j), "");
  const who = thenWhoOf(j);
  const gone = thenGoneOf(j);
  const bits = [];
  if (who) bits.push("<span class=\"q-chip q-ai\">" + esc(who) + "</span>");
  if (gone && !who) bits.push("<span class=\"q-chip q-ai-gone\">" + esc(gone + " · not on this desk") + "</span>");
  const wait = String((j && j.waitingOn) || "").toLowerCase();
  const st = String((j && j.status) || "");
  const needYou = wait === "owner" || wait === "person" || wait === "info" || wait === "helper" || st === "held" || st === "exception" || st === "waiting";
  if (needYou) {
    const named = namedNeedsWhoOf(j);
    bits.push("<span class=\"q-chip q-need\">" + esc(who ? (who + " · Needs you") : (named || "Needs you")) + "</span>");
  }
  return bits.length ? "<div class=\"q-chips\">" + bits.join(" ") + "</div>" : "";
}
function sheetPromptHtml(j) {
  if (typeof promptHtml === "function") return promptHtml(j, sheetNeedOf(j), "sheet");
  const who = thenWhoOf(j);
  const named = namedNeedsWhoOf(j);
  const wait = String((j && j.waitingOn) || "").toLowerCase();
  const st = String((j && j.status) || "");
  if (st === "shipped" || st === "killed" || st === "out" || (j && j.offDesk)) return "";
  const asked = talkTurnsOf(j).some(function (row) { return row.kind === "ask"; });
  if (!(wait === "info" || wait === "helper" || wait === "person" || wait === "owner" || asked || who || thenGoneOf(j))) return "";
  const askHuman = wait === "info";
  const label = askHuman ? "Ask the human" : (who ? (who + " asks") : (named || "Needs you"));
  let q = "Reply on this card. Nothing sent alone.";
  if (askHuman && j && (j.why || j.next)) q = String(j.why || j.next);
  else if (who) q = who + " asked on this card. Type a reply. Nothing sent alone.";
  else if (named) q = named + ". Type a reply. Nothing sent alone.";
  return "<div class=\"q-prompt\">" +
    "<div class=\"q-prompt-who\">" + esc(label) + "</div>" +
    "<p class=\"q-prompt-q\">" + esc(q) + "</p>" +
    "<p class=\"q-prompt-hold\">Reply stays on the card. Nothing sent alone.</p>" +
    "</div>";
}
function wipTalkLabelOf(row) {
  const from = String((row && row.from) || "").trim();
  const kind = String((row && row.kind) || "note");
  if (kind === "follow") return (from || "pipe") + " · follow";
  if (kind === "tell") return (from || "drop") + " · tell";
  if (/^(pipe|webhook|worker|capture)$/i.test(from)) return from + " · pipe WIP";
  return (from || "desk") + " · note";
}
function talkLabelOf(row, who, gone) {
  if (row.kind === "reply") return (row.from || "You") + " · you";
  if (row.kind === "note" || row.kind === "follow" || row.kind === "tell") return wipTalkLabelOf(row);
  if (row.kind === "ask" || row.kind === "rec") {
    if (who) return row.kind === "ask" ? (who + " · asks") : (who + " · Then draft");
    if (gone) return gone + " · not on this desk";
    const name = row.from || "Desk AI";
    return row.kind === "ask" ? (name + " · asks") : (name + " · Then draft");
  }
  return (row.from || "desk") + " · " + (row.kind || "note");
}
function talkTurnsOf(j) {
  const rows = [];
  const seen = {};
  function add(kind, from, text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return;
    const key = String(kind || "") + "|" + t;
    if (seen[key]) return;
    seen[key] = true;
    rows.push({ kind: kind, from: from || "", text: t });
  }
  (j && Array.isArray(j.thread) ? j.thread : []).forEach(function (t) {
    if (!t || !t.text) return;
    const k = String(t.kind || "note");
    if (k !== "ask" && k !== "reply" && k !== "rec" && k !== "note" && k !== "follow" && k !== "tell") return;
    add(k, t.from, t.text);
  });
  (j && Array.isArray(j.replies) ? j.replies : []).forEach(function (r) {
    if (!r) return;
    add("reply", r.from || "You", r.text);
  });
  const draft = String((j && (j.draft || (j.agentDraft && j.agentDraft.text))) || "").replace(/\s+/g, " ").trim();
  return rows.filter(function (row) {
    if (row.kind !== "rec") return true;
    if (draft && row.text === draft) return false;
    return true;
  });
}
function threadSheetHtml(j) {
  const draftText = (j && (j.draft || (j.agentDraft && j.agentDraft.text))) || "";
  const who = thenWhoOf(j);
  const gone = thenGoneOf(j);
  const face = who
    ? "<span class=\"q-chip q-ai\">" + esc(who) + "</span>"
    : (gone ? "<span class=\"q-chip q-ai-gone\">" + esc(gone + " · not on this desk") + "</span>" : "");
  const draftHtml = draftText
    ? "<div class=\"draft q-then\"><div class=\"q-then-who\">" + esc(who ? (who + " · Then draft") : (gone ? (gone + " · not on this desk") : "Draft")) + "</div>" +
      (face ? "<div class=\"q-then-face\">" + face + "</div>" : "") +
      "<div class=\"q-then-text\">" + esc(draftText) + "</div></div>"
    : "";
  const rows = talkTurnsOf(j);
  (j && Array.isArray(j.thread) ? j.thread : []).forEach(function (t) {
    if (!t || !t.text) return;
    const k = String(t.kind || "note");
    if (k === "ask" || k === "reply" || k === "rec") return;
    if (rows.some(function (row) { return row.text === String(t.text).replace(/\s+/g, " ").trim(); })) return;
    rows.push({ kind: k, from: t.from || "desk", text: String(t.text) });
  });
  const talks = rows.length
    ? "<div class=\"q-talk\">" + rows.map(function (row) {
      const ai = row.kind === "ask" || row.kind === "rec";
      const you = row.kind === "reply" || row.kind === "tell";
      const label = talkLabelOf(row, who, gone);
      return "<div class=\"q-turn " + (ai ? "q-turn-ai" : (you ? "q-turn-you" : "q-turn-ai")) + "\">" +
        "<div class=\"q-turn-who\">" + esc(label) + "</div>" +
        "<div class=\"q-turn-text\">" + esc(row.text) + "</div></div>";
    }).join("") + "</div>"
    : "<div>No notes yet.</div>";
  const prompt = sheetPromptHtml(j);
  const chips = sheetChipsHtml(j);
  const stacked = !!(draftHtml && (rows.length || prompt));
  return chips + (stacked ? "<div class=\"q-thread\">" : "<div class=\"talk\">") + draftHtml + talks + prompt +
    "<p class=\"q-prompt-hold\">On the card. Nothing sent alone.</p>" +
    (stacked ? "</div>" : "</div>");
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
    clockSheet(j) +
    grokRecsBox(j) +
    (j.photoUrl ? "<img class=\"thumb\" src=\"" + esc(j.photoUrl) + "\" alt=\"\">" : "") +
    (visitorLine(j.why) ? "<p>" + esc(visitorLine(j.why)) + "</p>" : "") +
    threadSheetHtml(j) +
    (staff || typeof bindAiHtml !== "function" ? "" : bindAiHtml(j, "sheet")) +
    custom +
    "<label>Note or ask</label><textarea id=\"job-note\" rows=\"2\" placeholder=\"Need the due date / already texted her\"></textarea>" +
    "<p class=\"meta\">Desk</p>" +
    "<div class=\"row actions\">" +
      "<button class=\"edit\" type=\"button\" onclick=\"saveJob('" + j.id + "')\">Save info</button>" +
      "<button class=\"edit\" type=\"button\" onclick=\"askMore('" + j.id + "')\">Ask for more</button>" +
      "<button class=\"edit\" type=\"button\" onclick=\"addNote('" + j.id + "')\">Add note</button>" +
      "<button class=\"edit\" type=\"button\" onclick=\"(typeof replyOnCard==='function'&&replyOnCard('" + j.id + "','sheet'))\">Reply on card</button>" +
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
function localClockInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}
function clockSheet(j) {
  const c = (j && j.clock) || {};
  const dueVal = localClockInput(c.dueAt || j.dueAt || "");
  const expVal = localClockInput(c.expireAt || j.expireAt || "");
  const status = c.expired || j.expired
    ? "Expired. Nothing sent. Open it or Stop it."
    : (c.late || j.late
      ? "Late · was due " + (c.dueLabel || "earlier") + "."
      : (c.dueLabel ? "Due " + c.dueLabel + "." : "No due time yet."));
  return "<div class=\"clock-sheet\">" +
    "<p class=\"meta\">" + status + (c.ageLabel ? " · " + c.ageLabel : "") + "</p>" +
    "<label>Due</label><input id=\"job-due\" type=\"datetime-local\" value=\"" + dueVal + "\">" +
    "<label>Expires</label><input id=\"job-expire\" type=\"datetime-local\" value=\"" + expVal + "\">" +
    "<p class=\"meta\">Due is when the work should happen. Expire is when the card goes stale. Expire does not Stop or send.</p>" +
    "<div class=\"row\" style=\"margin-top:8px\">" +
      "<button class=\"edit\" type=\"button\" onclick=\"scheduleJob('" + j.id + "', {due:'today 5pm'})\">Today 5</button>" +
      "<button class=\"edit\" type=\"button\" onclick=\"scheduleJob('" + j.id + "', {due:'tonight'})\">Tonight</button>" +
      "<button class=\"edit\" type=\"button\" onclick=\"scheduleJob('" + j.id + "', {due:'tomorrow 9am'})\">Tomorrow</button>" +
      "<button class=\"edit\" type=\"button\" onclick=\"scheduleJob('" + j.id + "', {due:'friday 9am'})\">Friday</button>" +
      "<button class=\"edit\" type=\"button\" onclick=\"snoozeJob('" + j.id + "', 'in 2 hours')\">Snooze 2h</button>" +
    "</div>" +
    "<div class=\"row\" style=\"margin-top:6px\">" +
      "<button class=\"edit\" type=\"button\" onclick=\"scheduleJob('" + j.id + "', {expire:'end of day'})\">Expire tonight</button>" +
      "<button class=\"edit\" type=\"button\" onclick=\"scheduleJob('" + j.id + "', {expire:'tomorrow'})\">Expire tomorrow</button>" +
      "<button class=\"edit\" type=\"button\" onclick=\"scheduleJob('" + j.id + "', {clearExpire:true, expire:'clear'})\">No expire</button>" +
    "</div></div>";
}
async function scheduleJob(id, payload) {
  const banner = document.getElementById("banner");
  const dueEl = document.getElementById("job-due");
  const expEl = document.getElementById("job-expire");
  const body = Object.assign({ action: "schedule", id: id, whoTapped: youName || "desk" }, payload || {});
  if (!payload && dueEl && dueEl.value) body.dueAt = dueEl.value;
  if (!payload && expEl && expEl.value) body.expireAt = expEl.value;
  const out = await api("/api/jobs", { method: "POST", body: JSON.stringify(body) });
  if (banner) banner.textContent = out.status >= 400
    ? ((out.data && out.data.error) || "Could not set that time.")
    : ((out.data && out.data.clock && out.data.clock.dueLabel) ? ("Due " + out.data.clock.dueLabel + ".") : "Times saved on the card.");
  await load();
  openJob(id);
}
async function snoozeJob(id, until) {
  const banner = document.getElementById("banner");
  const out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "snooze", id: id, until: until || "in 2 hours", whoTapped: youName || "desk" }) });
  if (banner) banner.textContent = out.status >= 400 ? ((out.data && out.data.error) || "Could not snooze.") : ("Snoozed" + (out.data && out.data.job && out.data.job.due ? " to " + out.data.job.due : "") + ".");
  if (typeof load === "function") await load();
  if (typeof openJob === "function") openJob(id);
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
  const dueAt = ((document.getElementById("job-due") || {}).value) || undefined;
  const expireAt = ((document.getElementById("job-expire") || {}).value) || undefined;
  await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "fill", id, custom, timing, dueAt, expireAt, whoTapped: youName || role || "desk" }) });
  if (dueAt || expireAt) {
    await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "schedule", id, dueAt, expireAt, whoTapped: youName || "desk" }) });
  }
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

function setCardBusy(id, on) {
  if (typeof window.setCardBusy === "function" && window.setCardBusy !== setCardBusy) {
    const sheet = document.getElementById("sheet");
    const where = sheet && sheet.classList && sheet.classList.contains("on") ? "sheet" : undefined;
    window.setCardBusy(id, on, where);
    return;
  }
  const safe = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const queue = document.getElementById("queue");
  const sheet = document.getElementById("sheet");
  const sheetOn = sheet && sheet.classList && sheet.classList.contains("on");
  const root = (sheetOn && document.getElementById("sheet-card"))
    || (queue && queue.querySelector && queue.querySelector('[data-job="' + safe + '"]'))
    || document.getElementById("sheet-card");
  if (!root || !root.classList) return;
  root.classList.toggle("q-pending", !!on);
  if (root.setAttribute) root.setAttribute("aria-busy", on ? "true" : "false");
  let line = root.querySelector ? root.querySelector(".q-busy") : null;
  if (on) {
    if (!line && root.appendChild) {
      line = document.createElement("p");
      line.className = "q-busy meta";
      line.textContent = "Working. Nothing sent yet.";
      const next = root.querySelector && root.querySelector(".next-line, .q-prompt-hold, .sheet-decide");
      if (next && next.parentNode) next.parentNode.insertBefore(line, next);
      else root.appendChild(line);
    }
    if (root.querySelectorAll) {
      root.querySelectorAll(".q-yes, .q-stop, .q-kill, .q-reply-tap, .sheet-decide .go, .sheet-decide .kill").forEach(function (el) { el.disabled = true; });
    }
  } else {
    if (line && line.remove) line.remove();
    if (root.querySelectorAll) {
      root.querySelectorAll(".q-yes, .q-stop, .q-kill, .q-reply-tap, .sheet-decide .go, .sheet-decide .kill").forEach(function (el) { el.disabled = false; });
    }
  }
}
function wrapHitlBusy() {
  if (typeof window.ship !== "function" || typeof window.confirmKill !== "function") {
    setTimeout(wrapHitlBusy, 200);
    return;
  }
  if (window.ship._aiaBusy) return;
  function wrap(name) {
    const prev = window[name];
    if (typeof prev !== "function") return;
    window[name] = async function (id) {
      setCardBusy(id, true);
      try { return await prev.apply(this, arguments); }
      finally { setCardBusy(id, false); }
    };
  }
  wrap("ship");
  wrap("confirmShip");
  wrap("confirmKill");
  window.ship._aiaBusy = true;
}
wrapHitlBusy();

// Buttons live in #desk-actions on desk.html. Do not inject into #gate.
