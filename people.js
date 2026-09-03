var STATE = {
  people: [],
  rawPeople: [],
  you: {},
  owner: false,
  jobs: [],
  filter: "all",
  shop: "",
  all: false,
  desk: "",
  didQueryOpen: false,
  jobCountsByPerson: null
};

var FILTERS = ["all", "waiting", "several", "family", "helper", "staff", "agent", "ext", "hold"];

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, function (c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
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

function lower(v) {
  return String(v || "").trim().toLowerCase();
}

function fmtTime(t) {
  if (!t) return "";
  var d = new Date(t);
  if (!d || isNaN(d.getTime())) return String(t);
  return d.toLocaleString();
}

function savedDesks() {
  if (window.AIADesks && AIADesks.list) {
    return AIADesks.list().filter(function (d) { return d && d.slug && (d.pin || d.token); });
  }
  var cur = localStorage.getItem("aia_ws");
  return cur ? [{ slug: cur, name: localStorage.getItem("aia_desk_name") || cur, pin: localStorage.getItem("aia_pin") || "", token: localStorage.getItem("aia_session") || "" }] : [];
}

function inviteLine(p, pending) {
  var shop = STATE.shop || localStorage.getItem("aia_desk_name") || "this desk";
  var who = (p && p.name) || "They";
  if (pending) return who + " is on the book for " + shop + ". Waiting on Approve. They do not open the queue yet.";
  var typed = (document.getElementById("p") && document.getElementById("p").value || "").trim();
  var code = typed || "their desk code";
  return who + " can open " + shop + " with their own desk code " + code + ". Same queue. They tap work. They do not send money. https://automateitaway.com/login";
}

function smsHref(phone, text) {
  if (!phone) return "#";
  return "sms:" + encodeURIComponent(phone) + "?body=" + encodeURIComponent(text);
}

function mailHref(email, text) {
  if (!email) return "#";
  return "mailto:" + encodeURIComponent(email) + "?subject=" + encodeURIComponent("Desk invite") + "&body=" + encodeURIComponent(text);
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

function paintYou() {
  var el = document.getElementById("you-card");
  var you = STATE.you || {};
  if (!you.name && !you.role) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = "<h3>You · " + esc(you.name || "Desk") + "</h3><p class=\"meta\">" + esc(you.kind || you.role || "") + (STATE.shop ? " · " + esc(STATE.shop) : "") + ". Owner owns Stop, money, pipes, and delete.</p>";
}

function groupPeople(list) {
  var by = {};
  var out = [];
  (list || []).forEach(function (src) {
    if (!src) return;
    var p = Object.assign({}, src);
    delete p.pin;
    delete p.code;
    var key = "name:" + String(p.name || "").trim().toLowerCase();
    if (p.email) key = "email:" + String(p.email).trim().toLowerCase();
    if (p.accountId) key = "account:" + String(p.accountId).trim();
    if (!by[key]) {
      by[key] = {
        key: key,
        id: p.id || "",
        name: p.name || "Unnamed",
        email: p.email || "",
        phone: p.phone || "",
        accountId: p.accountId || "",
        status: p.status || "approved",
        kind: kindOf(p),
        desks: [],
        seats: []
      };
      out.push(by[key]);
    }
    var row = by[key];
    if (!row.id && p.id) row.id = p.id;
    if (!row.email && p.email) row.email = p.email;
    if (!row.phone && p.phone) row.phone = p.phone;
    if (!row.accountId && p.accountId) row.accountId = p.accountId;
    if (!row.name && p.name) row.name = p.name;
    row.seats.push(p);
    if (!row.desks.some(function (d) { return d.slug === p.deskSlug; })) {
      row.desks.push({ slug: p.deskSlug || "", desk: p.desk || p.deskSlug || "Desk", status: p.status || "approved", kind: kindOf(p), id: p.id || "" });
    }
    if (p.status === "pending") row.status = "pending";
  });
  return out;
}

function paintFilters() {
  var waiting = STATE.people.filter(function (p) { return p.status === "pending"; }).length;
  var several = STATE.people.filter(function (p) { return (p.desks || []).length >= 2; }).length;
  var ext = STATE.people.filter(function (p) { return personJobStats(p).ext > 0; }).length;
  var hold = STATE.people.filter(function (p) { return personJobStats(p).holding > 0; }).length;
  var chips = [["all", "All"], ["waiting", "Waiting" + (waiting ? " · " + waiting : "")], ["several", "Several desks" + (several ? " · " + several : "")], ["family", "Family"], ["helper", "Helpers"], ["staff", "Staff"], ["agent", "Agents"], ["ext", "Off desk" + (ext ? " · " + ext : "")], ["hold", "Holding" + (hold ? " · " + hold : "")]];
  document.getElementById("filters").innerHTML = chips.map(function (c) {
    return "<button type=\"button\" data-f=\"" + c[0] + "\" class=\"" + (STATE.filter === c[0] ? "on" : "") + "\">" + c[1] + "</button>";
  }).join("");
}

function personMarkers(p) {
  var names = {}, emails = {}, ids = {}, accounts = {};
  function mark(v, box) {
    var k = lower(v);
    if (k) box[k] = true;
  }
  mark(p && p.name, names);
  mark(p && p.email, emails);
  mark(p && p.id, ids);
  mark(p && p.accountId, accounts);
  (p && p.seats || []).forEach(function (seat) {
    mark(seat && seat.name, names);
    mark(seat && seat.email, emails);
    mark(seat && seat.id, ids);
    mark(seat && seat.accountId, accounts);
  });
  return { names: names, emails: emails, ids: ids, accounts: accounts };
}

function jobMatchesPerson(job, marks) {
  if (!job || !marks) return false;
  if (job.handedTo && marks.ids[lower(job.handedTo.id)]) return true;
  var vals = [
    job.assignee,
    job.handedTo && job.handedTo.name
  ];
  return vals.some(function (v) {
    var k = lower(v);
    return !!(k && (marks.names[k] || marks.emails[k] || marks.ids[k] || marks.accounts[k]));
  });
}

function ensureJobCounts() {
  if (STATE.jobCountsByPerson) return;
  var out = {};
  (STATE.people || []).forEach(function (p) {
    out[p.key] = { holding: 0, ext: 0 };
  });
  (STATE.jobs || []).forEach(function (job) {
    if (!job) return;
    var done = job.status === "shipped" || job.status === "killed";
    if (done) return;
    var offDesk = !!(job.status === "out" || job.offDesk);
    (STATE.people || []).forEach(function (p) {
      if (!p || !out[p.key]) return;
      if (!jobMatchesPerson(job, personMarkers(p))) return;
      if (offDesk) out[p.key].ext += 1;
      else out[p.key].holding += 1;
    });
  });
  STATE.jobCountsByPerson = out;
}

function personJobStats(p) {
  ensureJobCounts();
  return (p && STATE.jobCountsByPerson && STATE.jobCountsByPerson[p.key]) || { holding: 0, ext: 0 };
}

function logicLine() {
  var q = (document.getElementById("q").value || "").trim().toLowerCase();
  var labels = {
    all: "all",
    waiting: "waiting",
    several: "several desks",
    family: "family",
    helper: "helper",
    staff: "staff",
    agent: "agent",
    ext: "off desk",
    hold: "holding"
  };
  var f = labels[STATE.filter] || "all";
  if (!q && STATE.filter === "all") return "Showing all people.";
  if (!q) return "Showing people who match " + f + ".";
  if (STATE.filter === "all") return "Showing people who match search " + q + ".";
  return "Showing people who match " + f + " AND search " + q + ".";
}

function paintLogic() {
  var el = document.getElementById("people-logic");
  if (el) el.textContent = logicLine();
}

function persistView() {
  var params = new URLSearchParams(location.search || "");
  params.set("q", (document.getElementById("q").value || "").trim());
  params.set("f", FILTERS.indexOf(STATE.filter) >= 0 ? STATE.filter : "all");
  var next = location.pathname + "?" + params.toString() + (location.hash || "");
  history.replaceState(null, "", next);
}

function applyViewFromQuery() {
  var params = new URLSearchParams(location.search || "");
  var q = params.get("q");
  var f = params.get("f");
  if (q !== null) document.getElementById("q").value = q;
  if (f && FILTERS.indexOf(f) >= 0) STATE.filter = f;
}

function shown() {
  var q = (document.getElementById("q").value || "").toLowerCase().trim();
  var f = STATE.filter;
  return STATE.people.filter(function (p) {
    if (!p) return false;
    var k = kindOf(p);
    var stats = personJobStats(p);
    if (f === "waiting" && p.status !== "pending") return false;
    if (f === "several" && (p.desks || []).length < 2) return false;
    if (f === "family" && k !== "family" && k !== "friend") return false;
    if (f === "helper" && k !== "helper" && k !== "member") return false;
    if (f === "staff" && k !== "staff" && k !== "owner") return false;
    if (f === "agent" && k !== "agent") return false;
    if (f === "ext" && stats.ext <= 0) return false;
    if (f === "hold" && stats.holding <= 0) return false;
    if (!q) return true;
    var deskText = (p.desks || []).map(function (d) { return d.desk || d.slug || ""; }).join(" ");
    var seatText = (p.seats || []).map(function (seat) {
      return [seat.kind || seat.role || "", seat.status || "", seat.crew || ""].join(" ");
    }).join(" ");
    var extra = [];
    if (stats.holding > 0) extra.push("holding " + stats.holding);
    if (stats.ext > 0) extra.push("off desk " + stats.ext + " ext " + stats.ext);
    return [p.name, deskText, seatText, p.phone, p.email, extra.join(" ")].join(" ").toLowerCase().indexOf(q) >= 0;
  });
}

function card(p) {
  var seatCount = (p.desks || []).length;
  var chips = (p.desks || []).slice(0, 3).map(function (d) {
    return "<span class=\"chip\">" + esc(d.desk || d.slug || "Desk") + "</span>";
  }).join("");
  if (seatCount > 3) chips += "<span class=\"chip\">+" + (seatCount - 3) + " more</span>";
  var sub = (p.phone ? esc(p.phone) : "") + (p.phone && p.email ? " · " : "") + (p.email ? esc(p.email) : "") + (seatCount >= 2 ? " · Several desks" : "");
  return "<article class=\"person" + (p.status === "pending" ? " waiting" : "") + "\" data-open=\"" + esc(p.key) + "\"><h3>" + esc(p.name || "Unnamed") + "</h3><div><span class=\"chip seat\">" + esc(kindOf(p)) + "</span><span class=\"chip\">" + esc(p.status || "approved") + "</span>" + chips + "</div><p class=\"meta\">" + sub + "</p><div class=\"acts\"><button class=\"edit\" type=\"button\" data-act=\"open\" data-key=\"" + esc(p.key) + "\">Open</button></div></article>";
}

function paintList() {
  var rows = shown();
  var box = document.getElementById("list");
  paintLogic();
  if (!STATE.people.length) {
    if (STATE.all) box.innerHTML = "<div class=\"person empty\"><p>Nobody on your saved desks yet.</p><p class=\"meta\">Open one desk and tap Add someone.</p></div>";
    else box.innerHTML = "<div class=\"person empty\"><p>Nobody else on this desk yet.</p><p class=\"meta\">Add family, a helper, or an approved agent.</p></div>";
    return;
  }
  if (!rows.length) {
    box.innerHTML = "<div class=\"person empty\"><p>No match on this filter.</p></div>";
    return;
  }
  box.innerHTML = rows.map(card).join("");
}

function paintCounts() {
  var people = STATE.people;
  document.getElementById("c-on").textContent = people.filter(function (p) { return p.status !== "pending" && p.status !== "denied"; }).length;
  document.getElementById("c-wait").textContent = people.filter(function (p) { return p.status === "pending"; }).length;
  document.getElementById("c-agent").textContent = people.filter(function (p) { return kindOf(p) === "agent"; }).length;
  var hold = 0, ext = 0;
  people.forEach(function (p) {
    var stats = personJobStats(p);
    hold += stats.holding;
    ext += stats.ext;
  });
  document.getElementById("c-hold").textContent = hold;
  var extEl = document.getElementById("c-ext");
  if (extEl) extEl.textContent = ext;
}

function paintLevels(d) {
  var el = document.getElementById("levels");
  var list = d.levels || [];
  el.innerHTML = list.map(function (lv) { return "<p><b>" + esc(lv.label) + "</b> — " + esc(lv.does) + "</p>"; }).join("") || "<p class=\"meta\">Seats load with the desk.</p>";
}

function personByKey(key) {
  return STATE.people.find(function (p) { return p.key === key; }) || null;
}

function seatHtml(seat) {
  var bits = [];
  if (seat.holding) bits.push("Holding " + seat.holding);
  if (seat.ext) bits.push("Ext " + seat.ext);
  if (seat.done) bits.push("Done " + seat.done);
  return "<div class=\"sheet-row\"><b>" + esc(seat.desk || seat.slug || "Desk") + "</b><div class=\"meta\">" + esc(seat.kind || "helper") + (bits.length ? " · " + esc(bits.join(" · ")) : "") + (seat.lastSeen ? " · " + esc(fmtTime(seat.lastSeen)) : "") + "</div></div>";
}

function cardHtml(cardItem) {
  if (!cardItem) return "";
  var meta = [cardItem.desk || cardItem.slug || "", cardItem.status || "", cardItem.t ? fmtTime(cardItem.t) : ""].filter(Boolean).join(" · ");
  return "<div class=\"sheet-row\"><b>" + esc(cardItem.title || cardItem.what || "Card") + "</b><div class=\"meta\">" + esc(meta) + "</div></div>";
}

function historyHtml(item) {
  if (!item) return "";
  var title = item.what || item.title || item.card || "Activity";
  var meta = [item.who || "", item.desk || "", item.t ? fmtTime(item.t) : ""].filter(Boolean).join(" · ");
  return "<div class=\"sheet-row\"><b>" + esc(title) + "</b><div class=\"meta\">" + esc(meta) + "</div></div>";
}

async function openSheet(person) {
  if (!person) return;
  var desks = savedDesks().map(function (d) { return { slug: d.slug, pin: d.pin || "", token: d.token || "" }; });
  var body = {
    action: "person",
    id: person.id || "",
    name: person.name || "",
    email: person.email || "",
    accountId: person.accountId || "",
    desks: desks
  };
  var out = await api("/api/admin", { method: "POST", body: JSON.stringify(body) });
  if (out.status >= 400 || !out.data || !out.data.ok) return;
  var data = out.data;
  var sheet = document.getElementById("sheet");
  document.getElementById("sheet-name").textContent = (data.person && data.person.name) || person.name || "Person";
  var seatCount = (data.seats || []).length;
  document.getElementById("sheet-meta").textContent = seatCount + " seat" + (seatCount === 1 ? "" : "s") + " · AIA does not send";
  document.getElementById("sheet-copy").textContent = inviteLine(data.person || person, false);
  document.getElementById("sheet-seats").innerHTML = (data.seats || []).map(seatHtml).join("") || "<p class=\"meta\">No seats found.</p>";

  var yours = (data.cards || []).filter(function (c) { return c && (c.side === "yours" || c.side === "both" || c.slug === data.currentSlug); });
  var theirs = (data.cards || []).filter(function (c) { return c && !(c.side === "yours" || c.side === "both" || c.slug === data.currentSlug); });
  document.getElementById("sheet-yours").innerHTML = yours.length ? yours.map(cardHtml).join("") : "<p class=\"meta\">No open cards on your desks.</p>";
  document.getElementById("sheet-theirs").innerHTML = theirs.length ? theirs.map(cardHtml).join("") : "<p class=\"meta\">No open cards on their other desks.</p>";

  document.getElementById("sheet-history").innerHTML = (data.history || []).length ? (data.history || []).slice(0, 20).map(historyHtml).join("") : "<p class=\"meta\">No shared history yet.</p>";
  document.getElementById("sheet-last").textContent = data.lastCard ? ("Last card: " + (data.lastCard.title || data.lastCard.what || "Card") + (data.lastCard.t ? (" · " + fmtTime(data.lastCard.t)) : "")) : "Last card: none yet.";

  var line = inviteLine(data.person || person, false);
  document.getElementById("sheet-copy-btn").onclick = async function () {
    try { await navigator.clipboard.writeText(line); } catch (e) {}
  };
  document.getElementById("sheet-text").href = smsHref((data.person && data.person.phone) || person.phone || "", line);
  document.getElementById("sheet-mail").href = mailHref((data.person && data.person.email) || person.email || "", line);
  document.getElementById("sheet-hear").onclick = function () {
    if (window.AIASpeech && AIASpeech.speak) AIASpeech.speak(line);
  };
  document.getElementById("sheet-history-link").href = "/history?who=" + encodeURIComponent((data.person && data.person.name) || person.name || "");
  document.getElementById("sheet-close").onclick = function () { sheet.hidden = true; };

  sheet.hidden = false;
}

function openFromQuery() {
  if (STATE.didQueryOpen) return;
  var who = new URLSearchParams(location.search || "").get("who");
  if (!who) return;
  var want = String(who).trim().toLowerCase();
  var found = STATE.people.find(function (p) {
    if (!p) return false;
    return String(p.name || "").trim().toLowerCase() === want;
  }) || STATE.people.find(function (p) {
    return p && String(p.name || "").toLowerCase().indexOf(want) >= 0;
  });
  if (!found) return;
  STATE.didQueryOpen = true;
  openSheet(found);
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
    var row = Object.assign({}, p, { desk: desk.name || desk.slug, deskSlug: desk.slug, ownerHere: ownerHere });
    delete row.pin;
    delete row.code;
    return row;
  });
  return { ok: !!(admin && admin.ok), admin: admin || {}, people: people, jobs: list };
}

async function load() {
  var banner = document.getElementById("banner");
  if (window.AIADesks && AIADesks.remember) AIADesks.remember();
  applyViewFromQuery();

  var rows = savedDesks();
  if (!localStorage.getItem("aia_people_scope_init")) {
    STATE.all = rows.length >= 2;
    localStorage.setItem("aia_people_scope_init", "1");
  }

  paintDesks();
  if (!localStorage.getItem("aia_ws") || !(localStorage.getItem("aia_session") || localStorage.getItem("aia_pin"))) {
    banner.textContent = "Open the desk on this phone first. People follows the working desk.";
    return;
  }

  if (STATE.all) {
    var peopleAll = [], jobsAll = [], last = null;
    for (var i = 0; i < rows.length; i++) {
      var pack = await fetchDesk(rows[i]);
      if (!pack.ok) continue;
      last = pack.admin;
      peopleAll = peopleAll.concat(pack.people);
      jobsAll = jobsAll.concat(pack.jobs);
    }
    STATE.you = (last && last.you) || {};
    STATE.owner = false;
    STATE.rawPeople = peopleAll;
    STATE.people = groupPeople(peopleAll);
    STATE.jobs = jobsAll;
    STATE.jobCountsByPerson = null;
    STATE.shop = "All desks";
    document.getElementById("add-box").hidden = true;
    banner.textContent = "Every desk saved on this phone. Switch to one desk to add or approve.";
    paintYou();
    if (last) paintLevels(last);
    paintCounts();
    paintFilters();
    paintList();
    openFromQuery();
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
  STATE.rawPeople = (d.people || []).map(function (p) {
    var row = Object.assign({}, p, { desk: shop, deskSlug: localStorage.getItem("aia_ws") || "" });
    delete row.pin;
    delete row.code;
    return row;
  });
  STATE.people = groupPeople(STATE.rawPeople);
  STATE.jobCountsByPerson = null;

  document.getElementById("add-box").hidden = !STATE.owner;
  banner.textContent = STATE.owner ? "Owner desk. Approve seats. Hand to uses these names. You still send the draft." : "You can see who sits here. Owner adds people and taps Approve.";
  paintYou();
  paintLevels(d);
  paintCounts();
  paintFilters();
  paintList();
  openFromQuery();
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
  var line = inviteLine({ name: name || crew }, out.data.pending);
  note.textContent = out.data.pending ? line : ("On the desk. Copy and send this yourself: " + line);
  try { if (!out.data.pending) await navigator.clipboard.writeText(line); } catch (e) {}
  document.getElementById("n").value = "";
  load();
}

document.getElementById("filters").addEventListener("click", function (e) {
  var btn = e.target.closest("[data-f]");
  if (!btn) return;
  STATE.filter = btn.getAttribute("data-f");
  paintFilters();
  paintList();
  persistView();
});

document.getElementById("q").addEventListener("input", function () {
  paintList();
  persistView();
});
document.getElementById("add-btn").addEventListener("click", invite);
document.getElementById("sit-btn").addEventListener("click", sit);

document.getElementById("desk-chips").addEventListener("click", function (e) {
  var btn = e.target.closest("[data-desk]");
  if (!btn) return;
  var slug = btn.getAttribute("data-desk");
  if (slug === "__all__") {
    STATE.all = true;
    load();
    return;
  }
  STATE.all = false;
  var row = savedDesks().filter(function (d) { return d.slug === slug; })[0];
  if (row && window.AIADesks && AIADesks.open) AIADesks.open(row);
  else if (row) {
    localStorage.setItem("aia_ws", row.slug);
    if (row.pin) localStorage.setItem("aia_pin", row.pin);
    if (row.token) localStorage.setItem("aia_session", row.token);
    if (row.name) localStorage.setItem("aia_desk_name", row.name);
  }
  load();
});

document.getElementById("list").addEventListener("click", function (e) {
  var btn = e.target.closest("[data-act]");
  if (btn && btn.getAttribute("data-act") === "open") {
    openSheet(personByKey(btn.getAttribute("data-key")));
    return;
  }
  var cardEl = e.target.closest("article[data-open]");
  if (!cardEl) return;
  if (e.target.closest("a") || e.target.closest("button")) return;
  openSheet(personByKey(cardEl.getAttribute("data-open")));
});

document.getElementById("hear").addEventListener("click", function () {
  if (window.AIASpeech && AIASpeech.speak) AIASpeech.speak(logicLine());
});

document.getElementById("quiet").addEventListener("click", function () {
  if (window.AIASpeech && AIASpeech.stopTalk) AIASpeech.stopTalk();
});

function applyTalk(text) {
  var raw = String(text || "").trim();
  if (!raw) return;
  if (/^add\b/i.test(raw)) {
    var inviteText = raw.replace(/^add\b/i, "").trim();
    if (inviteText) document.getElementById("n").value = inviteText;
    return;
  }
  var m = raw.match(/^find\b(.*)$/i);
  if (!m) return;
  var rest = String(m[1] || "").trim();
  var pick = "";
  var terms = [
    { re: /^off\s+desk\b/i, filter: "ext" },
    { re: /^holding?\b/i, filter: "hold" },
    { re: /^waiting\b/i, filter: "waiting" },
    { re: /^several\b/i, filter: "several" },
    { re: /^family\b/i, filter: "family" },
    { re: /^helper(?:s)?\b/i, filter: "helper" },
    { re: /^staff\b/i, filter: "staff" },
    { re: /^agent(?:s)?\b/i, filter: "agent" },
    { re: /^all\b/i, filter: "all" }
  ];
  terms.some(function (t) {
    if (!t.re.test(rest)) return false;
    STATE.filter = t.filter;
    rest = rest.replace(t.re, "").trim();
    pick = t.filter;
    return true;
  });
  if (rest || pick) document.getElementById("q").value = rest;
  paintFilters();
  paintList();
  persistView();
}

document.getElementById("talk").addEventListener("click", function () {
  if (!window.AIASpeech || !AIASpeech.listen) {
    document.getElementById("heard").textContent = "Talk needs Safari or Chrome on this phone.";
    return;
  }
  AIASpeech.listen(function (text) {
    applyTalk(text);
    document.getElementById("heard").textContent = String(text || "").trim();
  });
});

document.getElementById("clear-view").addEventListener("click", function () {
  STATE.filter = "all";
  document.getElementById("q").value = "";
  paintFilters();
  paintList();
  persistView();
});

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
else load();
