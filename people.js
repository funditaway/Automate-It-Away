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
  didQueryOpen: false
};

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, function (c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
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
  if (p && (p.deskAi || p.kind === "agent" || p.role === "agent")) return "agent";
  return (p && p.kind) || (p && p.role === "owner" ? "owner" : "helper");
}
function kindLabel(kind) {
  var k = String(kind || "").toLowerCase();
  if (k === "agent") return "Desk AI";
  return kind || "";
}
function isDeskAi(p) {
  return !!(p && p.deskAi);
}
function isBot(p) {
  return !!(p && (p.deskAi || kindOf(p) === "agent"));
}
function clipFace(s, n) {
  var t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  var max = n || 80;
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, "").replace(/[.,;:]+$/, "") + "…";
}
function namesOf(p) {
  var out = [];
  if (p && p.name) out.push(p.name);
  (p && p.seats || []).forEach(function (s) { if (s && s.name && out.indexOf(s.name) < 0) out.push(s.name); });
  return out;
}
function jobsOfPerson(p) {
  var names = namesOf(p).map(function (n) { return String(n).toLowerCase(); });
  return (STATE.jobs || []).filter(function (j) {
    if (!j || j.status === "shipped" || j.status === "killed") return false;
    var who = String((j.handedTo && j.handedTo.name) || j.assignee || "").toLowerCase();
    return who && names.indexOf(who) >= 0;
  });
}
function holdingOf(p) {
  return jobsOfPerson(p).filter(function (j) { return j.status !== "out" && !j.offDesk; }).length;
}
function extOf(p) {
  return jobsOfPerson(p).filter(function (j) { return j.status === "out" || j.offDesk; }).length;
}
function queryBox() { return document.getElementById("q"); }
function queryText() { return ((queryBox() && queryBox().value) || "").trim(); }
function persistView() {
  try {
    var p = new URLSearchParams(location.search || "");
    var q = queryText();
    if (q) p.set("q", q); else p.delete("q");
    if (STATE.filter && STATE.filter !== "all") p.set("f", STATE.filter); else p.delete("f");
    var next = location.pathname + (p.toString() ? "?" + p.toString() : "");
    history.replaceState(null, "", next);
  } catch (e) {}
}
function applyViewFromQuery() {
  var params = new URLSearchParams(location.search || "");
  var q = params.get("q");
  var f = params.get("f") || params.get("filter");
  if (q && queryBox()) queryBox().value = q;
  if (f) STATE.filter = String(f).toLowerCase();
}
function logicLine() {
  var bits = [];
  var f = STATE.filter;
  if (f === "waiting") bits.push("waiting on Approve");
  else if (f === "several") bits.push("on several desks");
  else if (f === "family") bits.push("family or friends");
  else if (f === "helper") bits.push("helpers");
  else if (f === "staff") bits.push("staff or owners");
  else if (f === "agent") bits.push("Desk AIs");
  else if (f === "ext") bits.push("off the desk");
  else if (f === "hold") bits.push("holding a card");
  var q = queryText();
  if (q) bits.push('search "' + q + '"');
  if (!bits.length) return "Everyone on desks this phone can open. Type a name and tap a chip — they AND together.";
  return "Showing people who match " + bits.join(" AND ") + ".";
}
function paintLogic() {
  var el = document.getElementById("people-logic");
  if (!el) {
    var q = queryBox();
    if (q && q.parentNode) {
      el = document.createElement("div");
      el.id = "people-logic";
      el.className = "meta";
      el.style.margin = "0 0 12px";
      q.parentNode.insertBefore(el, q.nextSibling);
    }
  }
  if (el) el.textContent = logicLine();
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
  el.innerHTML = "<h3>You · " + esc(you.name || "Desk") + "</h3><p class=\"meta\">" + esc(kindLabel(you.kind || you.role || "")) + (STATE.shop ? " · " + esc(STATE.shop) : "") + ". Owner owns Stop, money, pipes, and delete.</p>";
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
        deskAi: !!p.deskAi,
        does: p.does || "",
        prompt: p.prompt || "",
        aia: p.aia || "",
        aiId: p.aiId || "",
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
    if (p.deskAi) row.deskAi = true;
    if (p.does && !row.does) row.does = p.does;
    if (p.prompt && !row.prompt) row.prompt = p.prompt;
    if (p.aia && !row.aia) row.aia = p.aia;
    if (p.aiId && !row.aiId) row.aiId = p.aiId;
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
  var extN = STATE.people.filter(function (p) { return extOf(p); }).length;
  var chips = [["all", "All"], ["waiting", "Waiting" + (waiting ? " · " + waiting : "")], ["several", "Several desks" + (several ? " · " + several : "")], ["family", "Family"], ["helper", "Helpers"], ["staff", "Staff"], ["agent", "Desk AIs"], ["ext", "Off desk" + (extN ? " · " + extN : "")]];
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
    if (f === "several" && (p.desks || []).length < 2) return false;
    if (f === "family" && k !== "family" && k !== "friend") return false;
    if (f === "helper" && k !== "helper" && k !== "member") return false;
    if (f === "staff" && k !== "staff" && k !== "owner") return false;
    if (f === "agent" && k !== "agent") return false;
    if (f === "ext" && !extOf(p)) return false;
    if (f === "hold" && !holdingOf(p)) return false;
    if (!q) return true;
    var deskText = (p.desks || []).map(function (d) { return (d.desk || "") + " " + (d.slug || ""); }).join(" ");
    var seats = (p.seats || []).map(function (s) { return [s.crew, s.kind, s.status, s.desk, s.deskSlug].join(" "); }).join(" ");
    var extra = (holdingOf(p) ? "holding" : "") + " " + (extOf(p) ? "off desk ext" : "");
    return [p.name, deskText, p.phone, p.email, p.accountId, k, p.status, seats, extra, p.does || "", p.prompt || "", p.deskAi ? "desk ai bot" : ""].join(" ").toLowerCase().indexOf(q) >= 0;
  });
}

function card(p) {
  var seatCount = (p.desks || []).length;
  var chips = (p.desks || []).slice(0, 3).map(function (d) {
    return "<span class=\"chip\">" + esc(d.desk || d.slug || "Desk") + "</span>";
  }).join("");
  if (seatCount > 3) chips += "<span class=\"chip\">+" + (seatCount - 3) + " more</span>";
  var sub = (p.phone ? esc(p.phone) : "") + (p.phone && p.email ? " · " : "") + (p.email ? esc(p.email) : "") + (seatCount >= 2 ? " · Several desks" : "");
  var bot = isBot(p);
  var does = clipFace(p.does || "", 120);
  var prompt = clipFace(p.prompt || p.promptSummary || "", 80);
  if (isDeskAi(p)) chips += "<span class=\"chip\">desk AI</span>";
  if (bot && does) chips += "<span class=\"chip\">" + esc(does) + "</span>";
  var extra = bot
    ? (does ? "<p class=\"meta\">Does · " + esc(does) + "</p>" : "") +
      (prompt ? "<p class=\"meta\">Prompt · " + esc(prompt) + "</p>" : "") +
      "<p class=\"meta\">On queue cards: " + esc(p.name || "Desk AI") + " · Then draft. Needs you names this AI.</p>"
    : "";
  var edit = (STATE.owner && isDeskAi(p) && !STATE.all)
    ? "<form class=\"ai-edit\" data-ai=\"" + esc(p.aiId || p.id || p.name || "") + "\" data-key=\"" + esc(p.key) + "\">" +
      "<label>Name</label><input name=\"name\" maxlength=\"40\" value=\"" + esc(p.name || "") + "\">" +
      "<label>Does</label><input name=\"does\" maxlength=\"160\" value=\"" + esc(p.does || "") + "\">" +
      "<label>Prompt</label><textarea name=\"prompt\" maxlength=\"400\" rows=\"3\">" + esc(p.prompt || "") + "</textarea>" +
      "<button class=\"go\" type=\"submit\" data-act=\"save-ai\">Save on this desk</button>" +
      "<p class=\"meta\">Updates name / does / prompt. Queue chips follow. Yes / Stop / Kill stay human.</p>" +
      "</form>"
    : "";
  return "<article class=\"person" + (p.status === "pending" ? " waiting" : "") + (isDeskAi(p) ? " desk-ai" : "") + "\" data-open=\"" + esc(p.key) + "\"><h3>" + esc(p.name || "Unnamed") + "</h3><div><span class=\"chip seat\">" + esc(kindLabel(kindOf(p))) + "</span><span class=\"chip\">" + esc(p.status || "approved") + "</span>" + chips + "</div><p class=\"meta\">" + sub + "</p>" + extra + edit + "<div class=\"acts\"><button class=\"edit\" type=\"button\" data-act=\"open\" data-key=\"" + esc(p.key) + "\">Open</button></div></article>";
}

function paintList() {
  persistView();
  paintLogic();
  var rows = shown();
  var box = document.getElementById("list");
  if (!STATE.people.length) {
    if (STATE.all) box.innerHTML = "<div class=\"person empty\"><p>Nobody on your saved desks yet.</p><p class=\"meta\">Open one desk and tap Add someone.</p></div>";
    else box.innerHTML = "<div class=\"person empty\"><p>Nobody else on this desk yet.</p><p class=\"meta\">Add family, a helper, or a named Desk AI.</p></div>";
    return;
  }
  if (!rows.length) {
    box.innerHTML = "<div class=\"person empty\"><p>No match for this search and filter.</p><p class=\"meta\">" + logicLine() + " Clear the box or tap All.</p></div>";
    return;
  }
  box.innerHTML = rows.map(card).join("");
}

function paintCounts() {
  var people = STATE.people;
  document.getElementById("c-on").textContent = people.filter(function (p) { return p.status !== "pending" && p.status !== "denied"; }).length;
  document.getElementById("c-wait").textContent = people.filter(function (p) { return p.status === "pending"; }).length;
  document.getElementById("c-agent").textContent = people.filter(function (p) { return kindOf(p) === "agent"; }).length;
  document.getElementById("c-hold").textContent = people.reduce(function (n, p) { return n + holdingOf(p); }, 0);
  var extEl = document.getElementById("c-ext");
  if (extEl) extEl.textContent = people.reduce(function (n, p) { return n + extOf(p); }, 0);
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
  return "<div class=\"sheet-row\"><b>" + esc(seat.desk || seat.slug || "Desk") + "</b><div class=\"meta\">" + esc(kindLabel(seat.kind || "helper")) + (bits.length ? " · " + esc(bits.join(" · ")) : "") + (seat.lastSeen ? " · " + esc(fmtTime(seat.lastSeen)) : "") + "</div></div>";
}

function thenWhoOf(item) {
  return (item && item.deskAi && item.deskAi.name) || (item && item.thenWho) || "";
}

function thenGoneOf(item) {
  var g = item && item.thenAiGone;
  return String((g && (g.name || g.id)) || "").trim();
}

function goneHoldLabel(gone) {
  var name = String(gone || "").trim();
  return name ? (name + " · not on this desk") : "";
}

function namedNeedsWho(item) {
  var who = thenWhoOf(item);
  if (who) return who;
  return goneHoldLabel(thenGoneOf(item));
}

function whyOf(item) {
  return String((item && (item.why || item.how || item.next)) || "");
}

function lastAskOf(item) {
  var rows = ((item && item.thread) || []).filter(function (t) {
    return t && t.text && String(t.kind || "") === "ask";
  });
  return rows.length ? rows[rows.length - 1] : null;
}

function isAskHuman(item) {
  if (!item) return false;
  if (String(item.waitingOn || "").toLowerCase() === "info") return true;
  if (item.missing && item.missing.length) return true;
  return /Need .+ before/i.test(whyOf(item));
}

function isNeedsYou(item) {
  if (!item) return false;
  var st = String(item.status || "");
  if (st === "shipped" || st === "killed") return false;
  var wait = String(item.waitingOn || "").toLowerCase();
  return wait === "owner" || wait === "person" || wait === "info" || wait === "helper" || st === "exception" || st === "held";
}

function isPromptReply(item) {
  if (!item) return false;
  var st = String(item.status || "");
  if (st === "shipped" || st === "killed" || st === "out" || item.offDesk) return false;
  if (isAskHuman(item)) return true;
  var wait = String(item.waitingOn || "").toLowerCase();
  if (wait === "info" || wait === "helper") return true;
  if ((item.deskAi || thenGoneOf(item)) && (wait === "person" || wait === "owner" || wait === "helper" || !wait)) return true;
  return !!lastAskOf(item);
}

function promptQuestion(item) {
  if (!item) return "The desk asked. Reply on this card.";
  if (isAskHuman(item)) {
    var miss = whyOf(item);
    if (miss) return miss;
  }
  var asked = lastAskOf(item);
  if (asked && asked.text) return asked.text;
  var why = whyOf(item);
  if (why && !/HOLD/i.test(why) && !/^Captured\.?$/i.test(why.trim())) return why;
  if (item.deskAi || thenGoneOf(item)) {
    var who = thenWhoOf(item);
    var hold = goneHoldLabel(thenGoneOf(item));
    if (who) return who + " asked on this card. Type a reply. Nothing sent alone.";
    if (hold) return hold + ". Type a reply. Nothing sent alone.";
    return "The desk AI asked on this card. Type a reply. Nothing sent alone.";
  }
  return "Reply on this card. Nothing sent alone.";
}

function promptHtml(item) {
  if (!isPromptReply(item)) return "";
  var who = thenWhoOf(item);
  var named = namedNeedsWho(item);
  var label = isAskHuman(item) ? "Ask the human" : (who ? (who + " asks") : (named || "Needs you"));
  return "<div class=\"q-prompt\">" +
    "<div class=\"q-prompt-who\">" + esc(label) + "</div>" +
    "<p class=\"q-prompt-q\">" + esc(promptQuestion(item)) + "</p>" +
    "<p class=\"q-prompt-hold\">Reply stays on the card. Nothing sent alone.</p>" +
    "</div>";
}

function chipsHtml(item) {
  var bits = [];
  var who = thenWhoOf(item);
  var gone = thenGoneOf(item);
  if (who) bits.push("<span class=\"q-chip q-ai\">" + esc(who) + "</span>");
  if (gone && !who) bits.push("<span class=\"q-chip q-ai-gone\">" + esc(goneHoldLabel(gone)) + "</span>");
  if (isNeedsYou(item)) {
    var named = namedNeedsWho(item);
    bits.push("<span class=\"q-chip q-need\">" + esc(who ? (who + " · Needs you") : (named || "Needs you")) + "</span>");
  }
  if (isAskHuman(item)) bits.push("<span class=\"q-chip q-ask\">Ask the human</span>");
  return bits.length ? "<div class=\"q-chips\">" + bits.join(" ") + "</div>" : "";
}

function wipTalkLabelOf(row) {
  var from = String((row && row.from) || "").trim();
  var kind = String((row && row.kind) || "note");
  if (kind === "follow") return (from || "pipe") + " · follow";
  if (kind === "tell") return (from || "drop") + " · tell";
  if (/^(pipe|webhook|worker|capture)$/i.test(from)) return from + " · pipe WIP";
  return (from || "desk") + " · note";
}

function talkLabelOf(row, who, gone) {
  if (row.kind === "reply") return (row.from || "You") + " · you";
  if (row.kind === "note" || row.kind === "follow" || row.kind === "tell") return wipTalkLabelOf(row);
  if (who) return row.kind === "ask" ? (who + " · asks") : (who + " · Then draft");
  var hold = goneHoldLabel(gone);
  if (hold) return hold;
  var name = row.from || "Desk AI";
  return row.kind === "ask" ? (name + " · asks") : (name + " · Then draft");
}

function talkRowsOf(item) {
  var rows = [];
  var seen = {};
  function add(kind, from, text) {
    var t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return;
    var key = String(kind || "") + "|" + t;
    if (seen[key]) return;
    seen[key] = true;
    rows.push({ kind: kind, from: from || "", text: t });
  }
  ((item && item.thread) || []).forEach(function (t) {
    if (!t || !t.text) return;
    var k = String(t.kind || "note");
    if (k !== "ask" && k !== "reply" && k !== "rec" && k !== "note" && k !== "follow" && k !== "tell") return;
    add(k, t.from, t.text);
  });
  ((item && item.replies) || []).forEach(function (r) {
    if (!r) return;
    add("reply", r.from || "You", r.text);
  });
  var draft = String((item && item.draft) || "").replace(/\s+/g, " ").trim();
  return rows.filter(function (row) {
    if (row.kind !== "rec") return true;
    if (draft && row.text === draft) return false;
    return true;
  });
}

function trailThreadHtml(item) {
  var draftText = (item && item.draft) || "";
  var who = thenWhoOf(item);
  var gone = thenGoneOf(item);
  var hold = goneHoldLabel(gone);
  var label = who ? (who + " · Then draft") : (hold || "Draft");
  var face = who
    ? "<span class=\"chip p-ai\">" + esc(who) + "</span>"
    : (hold ? "<span class=\"chip p-ai-gone\">" + esc(hold) + "</span>" : "");
  var draftHtml = draftText
    ? "<div class=\"p-then\"><div class=\"p-then-who\">" + esc(label) + "</div>" +
      (face ? "<div class=\"p-then-face\">" + face + "</div>" : "") +
      "<div class=\"p-then-text\">" + esc(draftText) + "</div></div>"
    : (hold && !who
      ? "<div class=\"p-then\"><div class=\"p-then-who\">" + esc(hold) + "</div>" +
        (face ? "<div class=\"p-then-face\">" + face + "</div>" : "") + "</div>"
      : "");
  var rows = talkRowsOf(item);
  var talks = rows.length
    ? "<div class=\"p-talk\">" + rows.map(function (row) {
      var ai = row.kind === "ask" || row.kind === "rec";
      var you = row.kind === "reply" || row.kind === "tell";
      var turnLabel = talkLabelOf(row, who, gone);
      return "<div class=\"p-turn " + (ai ? "p-turn-ai" : (you ? "p-turn-you" : "p-turn-ai")) + "\">" +
        "<div class=\"p-turn-who\">" + esc(turnLabel) + "</div>" +
        "<div class=\"p-turn-text\">" + esc(row.text) + "</div></div>";
    }).join("") + "</div>"
    : "";
  var prompt = promptHtml(item);
  var chips = chipsHtml(item);
  if (!draftHtml && !talks && !prompt) return chips;
  return chips + "<div class=\"p-thread\">" + draftHtml + talks + prompt + "<p class=\"p-hold\">On the card. Nothing sent alone.</p></div>";
}

function cardHtml(cardItem) {
  if (!cardItem) return "";
  var meta = [cardItem.desk || cardItem.slug || "", cardItem.status || "", cardItem.t ? fmtTime(cardItem.t) : ""].filter(Boolean).join(" · ");
  return "<div class=\"sheet-row\"><b>" + esc(cardItem.title || cardItem.what || "Card") + "</b><div class=\"meta\">" + esc(meta) + "</div>" + trailThreadHtml(cardItem) + "</div>";
}

function historyHtml(item) {
  if (!item) return "";
  var title = item.what || item.title || item.card || "Activity";
  var meta = [item.who || "", item.desk || "", item.t ? fmtTime(item.t) : ""].filter(Boolean).join(" · ");
  return "<div class=\"sheet-row\"><b>" + esc(title) + "</b><div class=\"meta\">" + esc(meta) + "</div>" + trailThreadHtml(item) + "</div>";
}

function accountRoadMini() {
  return "<div class=\"road-mini\"><b>This account</b><div class=\"meta\">Past / now / next on History. Install / give / update a .aia with Yes. Give is the file. Update is install again. Recurring update HOLD. Collect HOLD. .aia identity HOLD until mint.</div><div class=\"acts\"><a class=\"go\" href=\"/history#account-road\">Account roadmap on History</a></div></div>";
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
  var road = document.getElementById("sheet-road");
  if (road) road.innerHTML = accountRoadMini();
  document.getElementById("sheet-history-link").href = "/history?who=" + encodeURIComponent((data.person && data.person.name) || person.name || "") + "#account-road";
  document.getElementById("sheet-close").onclick = function () { sheet.hidden = true; };

  sheet.hidden = false;
}

function openFromQuery() {
  applyViewFromQuery();
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
});

document.getElementById("q").addEventListener("input", function () {
  paintList();
});
var clearBtn = document.getElementById("clear-view");
if (clearBtn) clearBtn.addEventListener("click", function () {
  STATE.filter = "all";
  if (queryBox()) queryBox().value = "";
  var heard = document.getElementById("heard");
  if (heard) heard.textContent = "";
  paintFilters();
  paintList();
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

async function savePeopleAi(form) {
  if (!form) return;
  var banner = document.getElementById("banner");
  var nameEl = form.querySelector("[name=\"name\"]");
  var doesEl = form.querySelector("[name=\"does\"]");
  var promptEl = form.querySelector("[name=\"prompt\"]");
  var name = nameEl ? String(nameEl.value || "").trim() : "";
  if (!name) {
    if (banner) banner.textContent = "Name the desk AI first.";
    return;
  }
  var out = await api("/api/desks", { method: "POST", body: JSON.stringify({ action: "save-ai", id: form.getAttribute("data-ai") || "", name: name, does: doesEl ? doesEl.value : "", prompt: promptEl ? promptEl.value : "" }) });
  if (out.status >= 400) {
    if (banner) banner.textContent = (out.data && out.data.error) || "Could not save that desk AI.";
    return;
  }
  if (banner) banner.textContent = ((out.data && out.data.note) || (name + " is bound to this desk.")) + " Nothing sent.";
  load();
}

document.getElementById("list").addEventListener("submit", function (e) {
  var form = e.target && e.target.closest ? e.target.closest("form.ai-edit") : null;
  if (!form) return;
  e.preventDefault();
  savePeopleAi(form);
});

document.getElementById("list").addEventListener("click", function (e) {
  var btn = e.target.closest("[data-act]");
  if (btn && btn.getAttribute("data-act") === "save-ai") return;
  if (btn && btn.getAttribute("data-act") === "open") {
    openSheet(personByKey(btn.getAttribute("data-key")));
    return;
  }
  var cardEl = e.target.closest("article[data-open]");
  if (!cardEl) return;
  if (e.target.closest("a") || e.target.closest("button") || e.target.closest("form") || e.target.closest("input") || e.target.closest("textarea")) return;
  openSheet(personByKey(cardEl.getAttribute("data-open")));
});

function applyTalk(text) {
  var t = String(text || "").trim();
  if (!t) return;
  document.getElementById("heard").textContent = t;
  var low = t.toLowerCase();
  if (/wait/.test(low)) STATE.filter = "waiting";
  else if (/several|multiple desk/.test(low)) STATE.filter = "several";
  else if (/family|friend/.test(low)) STATE.filter = "family";
  else if (/helper|member/.test(low)) STATE.filter = "helper";
  else if (/\bstaff\b|\bowner\b/.test(low)) STATE.filter = "staff";
  else if (/agent|desk ai|\bbots?\b/.test(low)) STATE.filter = "agent";
  else if (/off desk|\bext\b/.test(low)) STATE.filter = "ext";
  else if (/holding|hold a card/.test(low)) STATE.filter = "hold";
  else if (/everyone|all people|clear/.test(low)) {
    STATE.filter = "all";
    if (queryBox()) queryBox().value = "";
  }
  var m = low.match(/\b(?:find|search|show|named|who is|who's)\s+(.+)/);
  var leftover = m ? m[1] : (/wait|several|family|friend|helper|member|staff|owner|agent|off desk|\bext\b|holding|everyone|all people|clear/.test(low) ? "" : t);
  leftover = String(leftover || "").replace(/\b(family|friends?|helper|member|staff|owner|agent|desk ai|bots?|waiting|pending|several desks|several|off desk|off the desk|holding|all people|everyone|clear)\b/g, " ").replace(/\s+/g, " ").replace(/\.$/, "").trim();
  if (leftover && queryBox()) queryBox().value = leftover;
  ["family", "friend", "helper", "member", "staff", "agent"].forEach(function (s) {
    if (low.indexOf(s) >= 0 && document.getElementById("k")) document.getElementById("k").value = s;
  });
  paintFilters();
  paintList();
}

document.getElementById("hear").addEventListener("click", function () {
  if (window.AIASpeech && AIASpeech.speak) AIASpeech.speak(logicLine());
});

document.getElementById("quiet").addEventListener("click", function () {
  if (window.AIASpeech && AIASpeech.stopTalk) AIASpeech.stopTalk();
});

document.getElementById("talk").addEventListener("click", function () {
  if (!window.AIASpeech || !AIASpeech.listen) {
    document.getElementById("heard").textContent = "Talk needs Safari or Chrome on this phone.";
    return;
  }
  AIASpeech.listen(function (text) {
    applyTalk(text);
  });
});

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
else load();
