var STATE = { people: [], you: {}, owner: false, jobs: [], filter: "all", shop: "", all: false, desk: "" };
function esc(s) {
  return String(s || "").replace(/[&<>"]/g, function (c) {
    return ({ "&": "&", "<": "<", ">": ">", '"': """ })[c];
  });
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
function kindOf(p) {
  return (p && p.kind) || (p && p.role === "owner" ? "owner" : "helper");
}
function jobsOf(name, desk) {
  var n = String(name || "").toLowerCase();
  return (STATE.jobs || []).filter(function (j) {
    if (!j || j.status === "shipped" || j.status === "killed") return false;
    if (desk && j._desk && j._desk !== desk) return false;
    var who = ((j.handedTo && j.handedTo.name) || j.assignee || "").toLowerCase();
    return who && who === n;
  });
}
function holding(name, desk) {
  return jobsOf(name, desk).filter(function (j) { return j.status !== "out" && !j.offDesk; }).length;
}
function extOf(name, desk) {
  return jobsOf(name, desk).filter(function (j) { return j.status === "out" || j.offDesk; }).length;
}
function savedDesks() {
  if (window.AIADesks && AIADesks.list) {
    return AIADesks.list().filter(function (d) { return d && d.slug && (d.pin || d.token); });
  }
  var cur = localStorage.getItem("aia_ws");
  return cur ? [{ slug: cur, name: localStorage.getItem("aia_desk_name") || cur, pin: localStorage.getItem("aia_pin") || "", token: localStorage.getItem("aia_session") || "" }] : [];
}
function paintDesks() {
  var box = document.getElementById("desk-chips");
  if (!box) return;
  var rows = savedDesks();
  var cur = localStorage.getItem("aia_ws") || "";
  var html = "<button type=\"button\" data-desk=\"__all__\" class=\"" + (STATE.all ? "on" : "") + "\">All desks</button>";
  rows.forEach(function (d) {
    var on = !STATE.all && d.slug === cur ? " on" : "";
    html += "<button type=\"button\" data-desk=\"" + esc(d.slug) + "\" class=\"" + on.trim() + "\">" + esc(d.name || d.slug) + "</button>";
  });
  box.innerHTML = html;
}
function inviteLine(p, pending) {
  var shop = STATE.shop || localStorage.getItem("aia_desk_name") || "this desk";
  var who = (p && p.name) || "They";
  if (pending) return who + " is on the book for " + shop + ". Waiting on Approve. They do not open the queue yet.";
  var code = (p && p.pin) || (document.getElementById("p") && document.getElementById("p").value) || "their desk code";
  return who + " can open " + shop + " with their own desk code " + code + ". Same queue. They tap work. They do not send money. https://automateitaway.com/login";
}
function smsHref(phone, text) {
  if (!phone) return "";
  return "sms:" + encodeURIComponent(phone) + "?body=" + encodeURIComponent(text);
}
function mailHref(email, text) {
  if (!email) return "";
  return "mailto:" + encodeURIComponent(email) + "?subject=" + encodeURIComponent("Desk invite") + "&body=" + encodeURIComponent(text);
}
function paintYou() {
  var el = document.getElementById("you-card");
  var you = STATE.you || {};
  if (!you.name && !you.role) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = "<h3>You · " + esc(you.name || "Desk") + "</h3><p class=\"meta\">" + esc(you.kind || you.role || "") + (STATE.shop ? " · " + esc(STATE.shop) : "") + ". Owner owns Stop, money, pipes, and delete.</p>";
}
function paintFilters() {
  var waiting = STATE.people.filter(function (p) { return p.status === "pending"; }).length;
  var chips = [["all", "All"], ["waiting", "Waiting" + (waiting ? " · " + waiting : "")], ["family", "Family"], ["helper", "Helpers"], ["staff", "Staff"], ["agent", "Agents"], ["ext", "Off desk"]];
  document.getElementById("filters").innerHTML = chips.map(function (c) {
    return "<button type=\"button\" data-f=\"" + c[0] + "\" class=\"" + (STATE.filter === c[0] ? "on" : "") + "\">" + c[1] + "</button>";
  }).join("");
}
function shown() {
  var q = (document.getElementById("q").value || "").toLowerCase().trim();
  var f = STATE.filter;
  return STATE.people.filter(function (p) {
    if (!p) return false;
    var k = kindOf(p);
    if (f === "waiting" && p.status !== "pending") return false;
    if (f === "family" && k !== "family" && k !== "friend") return false;
    if (f === "helper" && k !== "helper" && k !== "member") return false;
    if (f === "staff" && k !== "staff" && k !== "owner") return false;
    if (f === "agent" && k !== "agent") return false;
    if (f === "ext" && !extOf(p.name, p.deskSlug)) return false;
    if (!q) return true;
    return [p.name, p.phone, p.email, p.crew, k, p.status, p.desk].join(" ").toLowerCase().indexOf(q) >= 0;
  });
}
function card(p) {
  var k = kindOf(p);
  var hold = holding(p.name, p.deskSlug);
  var extN = extOf(p.name, p.deskSlug);
  var pending = p.status === "pending";
  var denied = p.status === "denied";
  var cls = "person" + (pending ? " waiting" : "") + (denied ? " denied" : "") + (k === "agent" ? " agent" : "");
  var line = inviteLine(p, pending);
  var acts = "";
  if ((STATE.owner || p.ownerHere) && p.role !== "owner") {
    if (pending) {
      acts += "<button class=\"go\" type=\"button\" data-act=\"approve\" data-id=\"" + esc(p.id) + "\">Approve</button>";
      acts += "<button class=\"kill\" type=\"button\" data-act=\"deny\" data-id=\"" + esc(p.id) + "\">Deny</button>";
    } else if (k !== "agent") {
      acts += "<button class=\"edit\" type=\"button\" data-act=\"permit\" data-kind=\"family\" data-id=\"" + esc(p.id) + "\">Family</button>";
      acts += "<button class=\"edit\" type=\"button\" data-act=\"permit\" data-kind=\"helper\" data-id=\"" + esc(p.id) + "\">Helper</button>";
      acts += "<button class=\"edit\" type=\"button\" data-act=\"permit\" data-kind=\"staff\" data-id=\"" + esc(p.id) + "\">Staff</button>";
    }
    if (!denied && !pending) acts += "<button class=\"edit\" type=\"button\" data-act=\"hold\" data-id=\"" + esc(p.id) + "\">Hold</button>";
    acts += "<button class=\"kill\" type=\"button\" data-act=\"remove\" data-id=\"" + esc(p.id) + "\">Remove</button>";
  }
  acts += "<button class=\"edit\" type=\"button\" data-act=\"copy\" data-id=\"" + esc(p.id) + "\">Copy invite</button>";
  if (p.phone) acts += "<a href=\"" + esc(smsHref(p.phone, line)) + "\">Text it</a>";
  if (p.email) acts += "<a href=\"" + esc(mailHref(p.email, line)) + "\">Email it</a>";
  if (!pending && !denied) acts += "<a href=\"/desk\" data-act=\"hand\" data-id=\"" + esc(p.id) + "\">Hand work</a>";
  if (extN) acts += "<a href=\"/history\" data-act=\"ext\" data-id=\"" + esc(p.id) + "\">Off desk · " + extN + "</a>";
  var cur = localStorage.getItem("aia_ws") || "";
  if (p.deskSlug && p.deskSlug !== cur) acts += "<button class=\"edit\" type=\"button\" data-act=\"use\" data-id=\"" + esc(p.id) + "\">Use this desk</button>";
  if (!STATE.owner && p.id === (STATE.you && STATE.you.id) && !pending) acts += "<button class=\"edit\" type=\"button\" data-act=\"ask\" data-id=\"" + esc(p.id) + "\">Ask staff</button>";
  return "<article class=\"" + cls + "\" data-id=\"" + esc(p.id) + "\"><h3>" + esc(p.name || "Unnamed") + "</h3><div><span class=\"chip seat\">" + esc(p.label || k) + "</span>" + (p.crew ? "<span class=\"chip\">" + esc(p.crew) + "</span>" : "") + "<span class=\"chip\">" + esc(p.status || "approved") + "</span>" + (p.desk ? "<span class=\"chip\">" + esc(p.desk) + "</span>" : "") + (hold ? "<span class=\"chip\">Holding " + hold + "</span>" : "") + (extN ? "<span class=\"chip\">Ext " + extN + "</span>" : "") + "</div><p class=\"meta\">" + esc(p.does || "") + (p.phone ? " · " + esc(p.phone) : "") + (p.email ? " · " + esc(p.email) : "") + "</p><div class=\"acts\">" + acts + "</div></article>";
}
function paintList() {
  var rows = shown();
  var box = document.getElementById("list");
  if (!STATE.people.length) {
    box.innerHTML = "<div class=\"person empty\"><p>Nobody else on this desk yet.</p><p class=\"meta\">Add family, a helper, or an approved agent. Their name lands on Hand to.</p></div>";
    return;
  }
  if (!rows.length) {
    box.innerHTML = "<div class=\"person empty\"><p>No match on this filter.</p></div>";
    return;
  }
  if (!STATE.all) { box.innerHTML = rows.map(card).join(""); return; }
  var groups = {}, order = [];
  rows.forEach(function (p) {
    var key = p.deskSlug || p.desk || "desk";
    if (!groups[key]) { groups[key] = []; order.push({ key: key, name: p.desk || key }); }
    groups[key].push(p);
  });
  box.innerHTML = order.map(function (g) { return "<h2>" + esc(g.name) + "</h2>" + groups[g.key].map(card).join(""); }).join("");
}
function paintCounts() {
  var people = STATE.people;
  document.getElementById("c-on").textContent = people.filter(function (p) { return p.status !== "pending" && p.status !== "denied"; }).length;
  document.getElementById("c-wait").textContent = people.filter(function (p) { return p.status === "pending"; }).length;
  document.getElementById("c-agent").textContent = people.filter(function (p) { return kindOf(p) === "agent"; }).length;
  var hold = 0, ext = 0;
  people.forEach(function (p) { hold += holding(p.name, p.deskSlug); ext += extOf(p.name, p.deskSlug); });
  document.getElementById("c-hold").textContent = hold;
  var extEl = document.getElementById("c-ext");
  if (extEl) extEl.textContent = ext;
}
function paintLevels(d) {
  var el = document.getElementById("levels");
  var list = d.levels || [];
  el.innerHTML = list.map(function (lv) { return "<p><b>" + esc(lv.label) + "</b> — " + esc(lv.does) + "</p>"; }).join("") || "<p class=\"meta\">Seats load with the desk.</p>";
}
async function fetchDesk(desk) {
  var h = { "Content-Type": "application/json", "X-Workspace": desk.slug || desk };
  if (desk.pin) h["X-Pin"] = desk.pin;
  if (desk.token) h["X-Session"] = desk.token;
  var admin = await fetch("/api/admin", { headers: h }).then(function (r) { return r.json().catch(function () { return {}; }); }).catch(function () { return {}; });
  var jobs = await fetch("/api/jobs", { headers: h }).then(function (r) { return r.json().catch(function () { return {}; }); }).catch(function () { return {}; });
  var list = (jobs && (jobs.jobs || jobs.items)) || [];
  if (!Array.isArray(list)) list = [];
  list.forEach(function (j) { if (j) j._desk = desk.slug; });
  var you = (admin && admin.you) || {};
  var ownerHere = you.role === "owner" || you.kind === "owner";
  var people = ((admin && admin.people) || []).map(function (p) {
    return Object.assign({}, p, { desk: desk.name || desk.slug, deskSlug: desk.slug, ownerHere: ownerHere });
  });
  return { ok: !!(admin && admin.ok), admin: admin || {}, people: people, jobs: list };
}
async function load() {
  var banner = document.getElementById("banner");
  if (window.AIADesks && AIADesks.remember) AIADesks.remember();
  paintDesks();
  if (!localStorage.getItem("aia_ws") || !(localStorage.getItem("aia_session") || localStorage.getItem("aia_pin"))) {
    banner.textContent = "Open the desk on this phone first. People follows the working desk.";
    return;
  }
  if (STATE.all) {
    var rows = savedDesks(), people = [], jobs = [], last = null;
    for (var i = 0; i < rows.length; i++) {
      var pack = await fetchDesk(rows[i]);
      if (!pack.ok) continue;
      last = pack.admin;
      people = people.concat(pack.people);
      jobs = jobs.concat(pack.jobs);
    }
    STATE.you = (last && last.you) || {};
    STATE.owner = false;
    STATE.people = people;
    STATE.jobs = jobs;
    STATE.shop = "All desks";
    document.getElementById("add-box").hidden = true;
    banner.textContent = "Every desk saved on this phone. Switch to one desk to add or approve.";
    paintYou();
    if (last) paintLevels(last);
    paintCounts();
    paintFilters();
    paintList();
    return;
  }
  var out = await api("/api/admin");
  var d = out.data || {};
  if (out.status === 401) { banner.textContent = "Desk code required."; return; }
  if (out.status === 403 && d.pending) { banner.textContent = "That seat is waiting on the owner."; return; }
  if (out.status === 404) { banner.textContent = "No desk with that name. Open one first."; return; }
  if (!d.ok) { banner.textContent = d.error || "Could not open People."; return; }
  STATE.you = d.you || {};
  STATE.owner = (STATE.you.role === "owner" || STATE.you.kind === "owner");
  var shop = (d.shop && (d.shop.name || d.shop.desk)) || localStorage.getItem("aia_desk_name") || localStorage.getItem("aia_ws") || "";
  STATE.shop = shop;
  STATE.people = (d.people || []).map(function (p) {
    return Object.assign({}, p, { desk: shop, deskSlug: localStorage.getItem("aia_ws") || "" });
  });
  document.getElementById("add-box").hidden = !STATE.owner;
  banner.textContent = STATE.owner ? "Owner desk. Approve seats. Hand to uses these names. You still send the draft." : "You can see who sits here. Owner adds people and taps Approve.";
  paintYou();
  paintLevels(d);
  var jobsOut = await api("/api/jobs");
  STATE.jobs = (jobsOut.data && (jobsOut.data.jobs || jobsOut.data.items || jobsOut.data)) || [];
  if (!Array.isArray(STATE.jobs)) STATE.jobs = [];
  var slug = localStorage.getItem("aia_ws") || "";
  STATE.jobs.forEach(function (j) { if (j) j._desk = slug; });
  paintCounts();
  paintFilters();
  paintList();
}
async function sit() {
  var note = document.getElementById("sit-note");
  var ws = (document.getElementById("sit-ws").value || "").trim();
  var name = (document.getElementById("sit-name").value || STATE.you.name || "").trim();
  if (!ws || !name) { note.textContent = "Name the desk and yourself."; return; }
  var h = { "Content-Type": "application/json", "X-Workspace": ws };
  var pin = document.getElementById("sit-pin").value.trim();
  if (pin) h["X-Pin"] = pin;
  var r = await fetch("/api/admin", { method: "POST", headers: h, body: JSON.stringify({ action: "request", name: name, kind: document.getElementById("sit-kind").value, email: STATE.you.email || "", phone: STATE.you.phone || "" }) });
  var data = await r.json().catch(function () { return {}; });
  if (r.status >= 400) { note.textContent = data.error || "Could not ask that desk."; return; }
  note.textContent = "Asked. Waiting on that owner. They Approve on their People tab. AIA does not text them.";
}
async function invite() {
  var name = document.getElementById("n").value.trim();
  var kind = document.getElementById("k").value;
  var crew = document.getElementById("crew").value;
  var pin = document.getElementById("p").value.trim();
  var note = document.getElementById("inv");
  if (!name && !crew) { note.textContent = "Name the person or pick a crew seat."; return; }
  var out = await api("/api/admin", { method: "POST", body: JSON.stringify({ action: "invite", name: name || crew, email: document.getElementById("e").value, phone: document.getElementById("ph").value, pin: pin, account: document.getElementById("acct").value, kind: kind, crew: crew, approve: document.getElementById("now").checked, role: "employee" }) });
  if (out.status >= 400) { note.textContent = (out.data && out.data.error) || "Could not add that person."; return; }
  var line = inviteLine({ name: name || crew, pin: pin }, out.data.pending);
  note.textContent = out.data.pending ? line : ("On the desk. Copy and send this yourself: " + line);
  try { if (!out.data.pending) await navigator.clipboard.writeText(line); } catch (e) {}
  document.getElementById("n").value = "";
  load();
}
function personOf(id) { return STATE.people.find(function (x) { return x.id === id; }) || null; }
function useDeskOf(p) {
  if (!p || !p.deskSlug) return false;
  var row = savedDesks().filter(function (d) { return d.slug === p.deskSlug; })[0];
  if (row && window.AIADesks && AIADesks.open) { AIADesks.open(row); STATE.all = false; return true; }
  if (row) {
    localStorage.setItem("aia_ws", row.slug);
    if (row.pin) localStorage.setItem("aia_pin", row.pin);
    if (row.token) localStorage.setItem("aia_session", row.token);
    if (row.name) localStorage.setItem("aia_desk_name", row.name);
    STATE.all = false;
    return true;
  }
  return false;
}
function headersForPerson(p) {
  var h = headers();
  if (!p || !p.deskSlug) return h;
  var row = savedDesks().filter(function (d) { return d.slug === p.deskSlug; })[0];
  if (!row) return h;
  h["X-Workspace"] = row.slug;
  if (row.pin) h["X-Pin"] = row.pin;
  if (row.token) h["X-Session"] = row.token;
  return h;
}
async function act(kind, id, extra) {
  var banner = document.getElementById("banner");
  var person = personOf(id);
  var body = { action: kind, id: id };
  if (extra) Object.assign(body, extra);
  if (kind === "hold") body.action = "deny";
  if (kind === "use") { useDeskOf(person); load(); return; }
  if (kind === "hand" || kind === "ext") { useDeskOf(person); return; }
  if (kind === "ask") {
    var outAsk = await api("/api/admin", { method: "POST", body: JSON.stringify({ action: "ask", kind: "staff" }) });
    banner.textContent = outAsk.status >= 400 ? ((outAsk.data && outAsk.data.error) || "Could not ask.") : "Asked for staff. Owner Approves on this list.";
    load();
    return;
  }
  if (kind === "copy") {
    var line = inviteLine(person, person && person.status === "pending");
    try { await navigator.clipboard.writeText(line); banner.textContent = "Invite copied. You send it."; }
    catch (e) { banner.textContent = line; }
    return;
  }
  var r = await fetch("/api/admin", { method: "POST", headers: headersForPerson(person), body: JSON.stringify(body) });
  var data = await r.json().catch(function () { return {}; });
  if (r.status >= 400) banner.textContent = data.error || "Could not update that seat.";
  load();
}
function parseTalk(text) {
  var t = String(text || "").trim();
  if (!t) return;
  document.getElementById("heard").textContent = t;
  var low = t.toLowerCase();
  ["family", "friend", "helper", "member", "staff", "agent"].forEach(function (s) { if (low.indexOf(s) >= 0) document.getElementById("k").value = s; });
  ["Worker", "Doer", "Rail", "Mapper", "Packer", "Builder", "Foreman"].forEach(function (c) {
    if (low.indexOf(c.toLowerCase()) >= 0) { document.getElementById("crew").value = c; document.getElementById("k").value = "agent"; }
  });
  var name = t.replace(/add\s+/i, "").replace(/\s+as\s+.*/i, "").replace(/\s+to\s+(the\s+)?desk.*/i, "").trim();
  if (name) document.getElementById("n").value = name.split(/[,.]/)[0].trim();
}
document.getElementById("filters").addEventListener("click", function (e) {
  var btn = e.target.closest("[data-f]");
  if (!btn) return;
  STATE.filter = btn.getAttribute("data-f");
  paintFilters();
  paintList();
});
document.getElementById("q").addEventListener("input", paintList);
document.getElementById("add-btn").addEventListener("click", invite);
document.getElementById("sit-btn").addEventListener("click", sit);
document.getElementById("desk-chips").addEventListener("click", function (e) {
  var btn = e.target.closest("[data-desk]");
  if (!btn) return;
  var slug = btn.getAttribute("data-desk");
  if (slug === "__all__") { STATE.all = true; load(); return; }
  STATE.all = false;
  var row = savedDesks().filter(function (d) { return d.slug === slug; })[0];
  if (row && window.AIADesks && AIADesks.open) AIADesks.open(row);
  else if (row) {
    localStorage.setItem("aia_ws", row.slug);
    if (row.pin) localStorage.setItem("aia_pin", row.pin);
    if (row.name) localStorage.setItem("aia_desk_name", row.name);
  }
  load();
});
document.getElementById("list").addEventListener("click", function (e) {
  var btn = e.target.closest("[data-act]");
  if (!btn) return;
  var a = btn.getAttribute("data-act");
  var id = btn.getAttribute("data-id");
  if (a === "permit") act("permit", id, { kind: btn.getAttribute("data-kind") });
  else act(a, id);
});
document.getElementById("hear").addEventListener("click", function () {
  if (window.AIASpeech && AIASpeech.speak) AIASpeech.speak("Name the person and the seat. Helper, family, staff, or an agent.");
});
document.getElementById("quiet").addEventListener("click", function () {
  if (window.AIASpeech && AIASpeech.stopTalk) AIASpeech.stopTalk();
});
document.getElementById("talk").addEventListener("click", function () {
  if (!window.AIASpeech || !AIASpeech.listen) {
    document.getElementById("heard").textContent = "Talk needs Safari or Chrome on this phone.";
    return;
  }
  AIASpeech.listen(function (text) { parseTalk(text); });
});
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
else load();
