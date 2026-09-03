var STATE = {
  people: [],
  groups: [],
  you: {},
  owner: false,
  jobs: [],
  filter: "all",
  shop: "",
  all: false,
  book: null,
  queryOpened: "",
  booted: false
};
function esc(s) {
  return String(s || "").replace(/[&<>"]/g, function (c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
  });
}
function lower(s) { return String(s || "").trim().toLowerCase(); }
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
  var n = lower(name);
  return (STATE.jobs || []).filter(function (j) {
    if (!j || j.status === "shipped" || j.status === "killed") return false;
    if (desk && j._desk && j._desk !== desk) return false;
    var who = lower((j.handedTo && j.handedTo.name) || j.assignee || "");
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
  var html = rows.length >= 2 ? "<button type=\"button\" data-desk=\"__all__\" class=\"" + (STATE.all ? "on" : "") + "\">All desks</button>" : "";
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
  return "sms:" + encodeURIComponent(phone || "") + "?body=" + encodeURIComponent(text || "");
}
function mailHref(email, text) {
  return "mailto:" + encodeURIComponent(email || "") + "?subject=" + encodeURIComponent("People note") + "&body=" + encodeURIComponent(text || "");
}
function paintYou() {
  var el = document.getElementById("you-card");
  var you = STATE.you || {};
  if (!you.name && !you.role) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = "<h3>You · " + esc(you.name || "Desk") + "</h3><p class=\"meta\">" + esc(you.kind || you.role || "") + (STATE.shop ? " · " + esc(STATE.shop) : "") + ". Owner owns Stop, money, pipes, and delete.</p>";
}
function personKey(p) {
  if (p && p.accountId) return "acct:" + p.accountId;
  if (p && p.email) return "email:" + lower(p.email);
  return "name:" + lower(p && p.name);
}
function groupPeople(rows) {
  var groups = {}, list = [];
  (rows || []).forEach(function (p) {
    if (!p) return;
    var key = personKey(p);
    if (!groups[key]) {
      groups[key] = {
        key: key,
        id: p.id || "",
        name: p.name || "Unnamed",
        email: p.email || "",
        phone: p.phone || "",
        accountId: p.accountId || "",
        seats: [],
        desks: [],
        kinds: {},
        hold: 0,
        ext: 0,
        waiting: 0,
        denied: 0,
        multi: false,
        lastSeen: "",
        lastDesk: ""
      };
      list.push(groups[key]);
    }
    var g = groups[key];
    g.seats.push(p);
    if (!g.id && p.id) g.id = p.id;
    if (!g.email && p.email) g.email = p.email;
    if (!g.phone && p.phone) g.phone = p.phone;
    if (!g.accountId && p.accountId) g.accountId = p.accountId;
    if (g.desks.indexOf(p.desk || p.deskSlug || "") < 0) g.desks.push(p.desk || p.deskSlug || "");
    g.kinds[kindOf(p)] = true;
    g.hold += holding(p.name, p.deskSlug);
    g.ext += extOf(p.name, p.deskSlug);
    if (p.status === "pending") g.waiting += 1;
    if (p.status === "denied") g.denied += 1;
    var seen = String(p.approvedAt || p.createdAt || "");
    if (seen && seen > g.lastSeen) {
      g.lastSeen = seen;
      g.lastDesk = p.desk || p.deskSlug || "";
    }
  });
  return list.map(function (g) {
    g.multi = g.desks.filter(Boolean).length >= 2;
    return g;
  }).sort(function (a, b) {
    return lower(a.name).localeCompare(lower(b.name));
  });
}
function hasKind(group, kinds) {
  return kinds.some(function (kind) { return !!group.kinds[kind]; });
}
function paintFilters() {
  var waiting = STATE.groups.filter(function (g) { return g.waiting; }).length;
  var many = STATE.groups.filter(function (g) { return g.multi; }).length;
  var chips = [["all", "All"], ["waiting", "Waiting" + (waiting ? " · " + waiting : "")], ["several", "Several desks" + (many ? " · " + many : "")], ["family", "Family"], ["helper", "Helpers"], ["staff", "Staff"], ["agent", "Agents"], ["ext", "Off desk"]];
  document.getElementById("filters").innerHTML = chips.map(function (c) {
    return "<button type=\"button\" data-f=\"" + c[0] + "\" class=\"" + (STATE.filter === c[0] ? "on" : "") + "\">" + c[1] + "</button>";
  }).join("");
}
function shown() {
  var q = lower(document.getElementById("q").value || "");
  var f = STATE.filter;
  return STATE.groups.filter(function (g) {
    if (!g) return false;
    if (f === "waiting" && !g.waiting) return false;
    if (f === "several" && !g.multi) return false;
    if (f === "family" && !hasKind(g, ["family", "friend"])) return false;
    if (f === "helper" && !hasKind(g, ["helper", "member"])) return false;
    if (f === "staff" && !hasKind(g, ["staff", "owner"])) return false;
    if (f === "agent" && !hasKind(g, ["agent"])) return false;
    if (f === "ext" && !g.ext) return false;
    if (!q) return true;
    return [g.name, g.email, g.phone, g.desks.join(" "), Object.keys(g.kinds).join(" ")].join(" ").toLowerCase().indexOf(q) >= 0;
  });
}
function badgeLine(group) {
  var out = [];
  if (group.multi) out.push("<span class=\"chip\">Several desks</span>");
  if (group.hold) out.push("<span class=\"chip\">Holding " + group.hold + "</span>");
  if (group.ext) out.push("<span class=\"chip\">Ext " + group.ext + "</span>");
  if (group.waiting) out.push("<span class=\"chip\">Waiting " + group.waiting + "</span>");
  if (!out.length) out.push("<span class=\"chip\">" + esc(Object.keys(group.kinds)[0] || "person") + "</span>");
  return out.join("");
}
function card(group) {
  var desks = group.desks.filter(Boolean);
  var note = desks.length ? desks.join(" · ") : "Tap to open";
  var when = group.lastSeen ? " · Seen " + esc(String(group.lastSeen).replace("T", " ").slice(0, 16)) : "";
  return "<article class=\"person\" data-open=\"" + esc(group.key) + "\"><h3>" + esc(group.name) + "</h3><div>" + badgeLine(group) + "</div><p class=\"meta\">" + esc(note) + (group.email ? " · " + esc(group.email) : "") + (group.phone ? " · " + esc(group.phone) : "") + when + "</p><div class=\"acts\"><button class=\"edit\" type=\"button\" data-open=\"" + esc(group.key) + "\">Open</button></div></article>";
}
function paintList() {
  var rows = shown();
  var box = document.getElementById("list");
  if (!STATE.groups.length) {
    if (savedDesks().length >= 2 || STATE.all) {
      box.innerHTML = "<div class=\"person empty\"><p>Nobody else is on the saved desks yet.</p><p class=\"meta\">Open one desk on this phone, add a seat there, then tap the name here.</p></div>";
    } else {
      box.innerHTML = "<div class=\"person empty\"><p>Nobody else on this desk yet.</p><p class=\"meta\">Add family, a helper, or an approved agent. Then tap the name here.</p></div>";
    }
    return;
  }
  if (!rows.length) {
    box.innerHTML = "<div class=\"person empty\"><p>No match on this filter.</p></div>";
    return;
  }
  box.innerHTML = rows.map(card).join("");
}
function paintCounts() {
  var groups = STATE.groups;
  document.getElementById("c-on").textContent = groups.filter(function (g) { return !g.denied; }).length;
  document.getElementById("c-wait").textContent = groups.filter(function (g) { return g.waiting; }).length;
  document.getElementById("c-agent").textContent = groups.filter(function (g) { return hasKind(g, ["agent"]); }).length;
  document.getElementById("c-hold").textContent = groups.reduce(function (n, g) { return n + g.hold; }, 0);
  document.getElementById("c-ext").textContent = groups.reduce(function (n, g) { return n + g.ext; }, 0);
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
function summaryOf(book) {
  var person = (book && book.person) || {};
  var seats = (book && book.seats) || [];
  var cards = (book && book.cards) || [];
  var names = seats.map(function (seat) { return seat.desk; }).filter(Boolean).join(", ") || "one desk";
  var holdingCount = seats.reduce(function (n, seat) { return n + (seat.holding || 0); }, 0);
  var extCount = seats.reduce(function (n, seat) { return n + (seat.ext || 0); }, 0);
  var last = book && book.lastCard && book.lastCard.title ? ". Last card: " + book.lastCard.title + "." : ".";
  return (person.name || "This person") + " is on " + names + ". Holding " + holdingCount + ". Off desk " + extCount + ". Open cards " + cards.length + last;
}
function renderItems(items, empty) {
  if (!items.length) return "<div class=\"sheet-row\"><p class=\"meta\">" + esc(empty) + "</p></div>";
  return items.map(function (item) {
    var stamp = String(item.t || item.lastSeen || "").replace("T", " ").slice(0, 16);
    return "<div class=\"sheet-row\"><b>" + esc(item.title || item.desk || "Desk") + "</b><p class=\"meta\">" + esc((item.desk || "") + (item.status ? " · " + item.status : "") + (item.waitingOn ? " · " + item.waitingOn : "") + (stamp ? " · " + stamp : "")) + "</p></div>";
  }).join("");
}
function renderSeats(book) {
  return ((book && book.seats) || []).map(function (seat) {
    return "<div class=\"sheet-row\"><b>" + esc(seat.desk || seat.slug) + "</b><p class=\"meta\">" + esc((seat.kind || "seat") + " · " + (seat.side || "both")) + (seat.theyOwn ? " · owner" : "") + (seat.holding ? " · holding " + seat.holding : "") + (seat.ext ? " · ext " + seat.ext : "") + (seat.done ? " · done " + seat.done : "") + (seat.lastCardTitle ? " · " + seat.lastCardTitle : "") + "</p><div class=\"acts\"><button class=\"edit\" type=\"button\" data-desk-switch=\"" + esc(seat.slug) + "\">Open desk</button></div></div>";
  }).join("") || "<div class=\"sheet-row\"><p class=\"meta\">No desk seats found.</p></div>";
}
function renderSheet(book) {
  var person = (book && book.person) || {};
  var current = localStorage.getItem("aia_ws") || "";
  var cards = (book && book.cards) || [];
  var theirs = cards.filter(function (card) { return card.slug !== current; });
  var yours = cards.filter(function (card) { return card.slug === current; });
  var text = summaryOf(book);
  document.getElementById("sheet-name").textContent = person.name || "Person";
  document.getElementById("sheet-meta").textContent = ((book && book.seats && book.seats.length) || 0) + " desk" + (((book && book.seats && book.seats.length) || 0) === 1 ? "" : "s");
  document.getElementById("sheet-copy").textContent = "Copy, text, or email this note. AIA does not send.";
  document.getElementById("sheet-seats").innerHTML = renderSeats(book);
  document.getElementById("sheet-theirs").innerHTML = renderItems(theirs, "No open cards on their other desks.");
  document.getElementById("sheet-yours").innerHTML = renderItems(yours, "No open cards on this desk.");
  document.getElementById("sheet-history").innerHTML = renderItems((book && book.history) || [], "No shared history yet.");
  document.getElementById("sheet-last").textContent = book && book.lastCard && book.lastCard.title ? ("Last card · " + book.lastCard.title) : "No last card yet.";
  document.getElementById("sheet-text").href = smsHref(person.phone || "", text);
  document.getElementById("sheet-mail").href = mailHref(person.email || "", text);
  document.getElementById("sheet-history-link").href = "/history?who=" + encodeURIComponent(person.name || "");
  document.getElementById("sheet").hidden = false;
}
async function openSheet(target) {
  var group = typeof target === "string" ? STATE.groups.filter(function (g) { return g.key === target; })[0] : target;
  if (!group) return;
  var body = {
    action: "person",
    id: group.id,
    name: group.name,
    email: group.email,
    accountId: group.accountId,
    desks: savedDesks().map(function (desk) {
      return { slug: desk.slug, pin: desk.pin || "", token: desk.token || "" };
    })
  };
  var out = await api("/api/admin", { method: "POST", body: JSON.stringify(body) });
  if (out.status >= 400 || !out.data || !out.data.ok) {
    document.getElementById("banner").textContent = (out.data && out.data.error) || "Could not open that person.";
    return;
  }
  STATE.book = out.data;
  try {
    var next = "/people?who=" + encodeURIComponent((STATE.book.person && STATE.book.person.name) || group.name || "");
    history.replaceState(null, "", next);
  } catch (e) {}
  renderSheet(out.data);
  STATE.queryOpened = lower((out.data.person && out.data.person.name) || group.name || "");
}
function openFromQuery() {
  var params = new URLSearchParams(location.search || "");
  var who = (params.get("who") || "").trim();
  if (!who || !STATE.groups.length) return;
  if (STATE.queryOpened === lower(who) && !document.getElementById("sheet").hidden) return;
  var hit = STATE.groups.filter(function (g) {
    return lower(g.name) === lower(who) || lower(g.email) === lower(who) || String(g.id || "") === who || String(g.accountId || "") === who;
  })[0];
  if (!hit) {
    hit = STATE.groups.filter(function (g) {
      return [g.name, g.email, g.desks.join(" ")].join(" ").toLowerCase().indexOf(lower(who)) >= 0;
    })[0];
  }
  if (hit) openSheet(hit);
}
async function load() {
  var banner = document.getElementById("banner");
  if (window.AIADesks && AIADesks.remember) AIADesks.remember();
  if (!STATE.booted && savedDesks().length >= 2) STATE.all = true;
  STATE.booted = true;
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
    STATE.groups = groupPeople(people);
    document.getElementById("add-box").hidden = true;
    banner.textContent = "Every desk saved on this phone. Tap a name to see their desks, cards, and history with yours.";
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
  STATE.people = (d.people || []).map(function (p) {
    return Object.assign({}, p, { desk: shop, deskSlug: localStorage.getItem("aia_ws") || "" });
  });
  STATE.groups = groupPeople(STATE.people);
  document.getElementById("add-box").hidden = !STATE.owner;
  banner.textContent = STATE.owner ? "Owner desk. Tap a name to see their desks, what they hold, and history with yours." : "You can see everyone on this desk. Tap a name for cards and shared history.";
  paintYou();
  paintLevels(d);
  var jobsOut = await api("/api/jobs");
  STATE.jobs = (jobsOut.data && (jobsOut.data.jobs || jobsOut.data.items || jobsOut.data)) || [];
  if (!Array.isArray(STATE.jobs)) STATE.jobs = [];
  var slug = localStorage.getItem("aia_ws") || "";
  STATE.jobs.forEach(function (j) { if (j) j._desk = slug; });
  STATE.groups = groupPeople(STATE.people);
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
  var line = inviteLine({ name: name || crew, pin: pin }, out.data.pending);
  note.textContent = out.data.pending ? line : ("On the desk. Copy and send this yourself: " + line);
  try { if (!out.data.pending) await navigator.clipboard.writeText(line); } catch (e) {}
  document.getElementById("n").value = "";
  load();
}
function useDeskSlug(slug) {
  var row = savedDesks().filter(function (d) { return d.slug === slug; })[0];
  if (row && window.AIADesks && AIADesks.open) { AIADesks.open(row); STATE.all = false; return true; }
  if (!row) return false;
  localStorage.setItem("aia_ws", row.slug);
  if (row.pin) localStorage.setItem("aia_pin", row.pin);
  if (row.token) localStorage.setItem("aia_session", row.token);
  if (row.name) localStorage.setItem("aia_desk_name", row.name);
  STATE.all = false;
  return true;
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
  if (useDeskSlug(slug)) load();
});
document.getElementById("list").addEventListener("click", function (e) {
  var btn = e.target.closest("[data-open]");
  if (!btn) return;
  openSheet(btn.getAttribute("data-open"));
});
document.getElementById("sheet-seats").addEventListener("click", function (e) {
  var btn = e.target.closest("[data-desk-switch]");
  if (!btn) return;
  if (useDeskSlug(btn.getAttribute("data-desk-switch"))) load();
});
document.getElementById("sheet-close").addEventListener("click", function () {
  document.getElementById("sheet").hidden = true;
});
document.getElementById("sheet-copy-btn").addEventListener("click", function () {
  if (!STATE.book || !navigator.clipboard) return;
  navigator.clipboard.writeText(summaryOf(STATE.book));
});
document.getElementById("sheet-hear").addEventListener("click", function () {
  if (window.AIASpeech && AIASpeech.speak && STATE.book) AIASpeech.speak(summaryOf(STATE.book));
});
document.getElementById("hear").addEventListener("click", function () {
  if (window.AIASpeech && AIASpeech.speak) AIASpeech.speak("Everyone on desks this phone can open. Tap a name.");
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
