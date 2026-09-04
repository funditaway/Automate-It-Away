function esc(s) {
  return String(s || "").replace(/[&<>"']/g, function (c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
  });
}
function phoneDesks() { return (window.AIADesks && AIADesks.list()) || []; }
function banner(text) { var el = document.getElementById("banner"); if (el) el.textContent = text; }
function sessionHdr(slug, pin) {
  var h = { "Content-Type": "application/json" };
  if (slug) h["X-Workspace"] = slug;
  var tok = localStorage.getItem("aia_session") || "";
  if (tok) h["X-Session"] = tok; else if (pin) h["X-Pin"] = pin;
  return h;
}
function atOf(value) {
  var bare = String(value || "").replace(/^@+/, "").replace(/\.aia$/i, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 63);
  return bare ? bare + ".aia" : "";
}
var ASK = ["family", "friend", "helper", "member", "staff"];
var BOOK = { owned: [], member: [], desks: [], handle: "", you: null, kinds: ASK };
function paintYou(book) {
  var handle = atOf((book && (book.aia || book.at || book.handle)) || (book && book.you && (book.you.aia || book.you.at || book.you.handle)) || "");
  var title = document.getElementById("you-title");
  var line = document.getElementById("you-line");
  var input = document.getElementById("you-handle");
  if (title) title.textContent = (book && book.account && book.account.name) || (book && book.you && book.you.name) || "Your account";
  if (line) line.textContent = handle ? ("AIA Internet name is " + handle) : "AIA Internet uses the .aia TLD — james.aia";
  if (input && handle) input.value = handle;
}
function cardHtml(d, lane) {
  var kind = d.kind || d.role || "member";
  var perms = d.permsLine || kind;
  var asked = d.requestedKind ? ("Asking for " + d.requestedKind) : "";
  var status = d.status && d.status !== "approved" ? d.status : "";
  var chips = "<span class=\"chip\">" + esc(kind) + "</span>" +
    (status ? "<span class=\"chip\">" + esc(status) + "</span>" : "") +
    (asked ? "<span class=\"chip\">" + esc(asked) + "</span>" : "") +
    (d.handle ? "<span class=\"chip\">" + esc(atOf(d.handle)) + "</span>" : "");
  var askBtns = (kind === "owner") ? "" : ASK.map(function (k) {
    return "<button class=\"edit\" type=\"button\" data-act=\"ask\" data-kind=\"" + k + "\">Ask " + k + "</button>";
  }).join("");
  return "<div class=\"card\" data-slug=\"" + esc(d.slug) + "\" data-lane=\"" + esc(lane || "") + "\">" +
    "<h2>" + esc(d.name || d.slug) + "</h2>" +
    "<p class=\"meta\" data-meta>" + esc(perms) + (d.does ? " · " + esc(d.does) : "") + "</p>" +
    "<div>" + chips + "</div>" +
    "<div class=\"row\">" +
      "<button class=\"go\" type=\"button\" data-act=\"open\">Open queue</button>" +
      "<button class=\"edit\" type=\"button\" data-act=\"leave\">Leave</button>" +
      "<button class=\"edit\" type=\"button\" data-act=\"forget\">Forget phone</button>" +
    "</div>" +
    (askBtns ? "<div class=\"row ask-row\">" + askBtns + "</div>" : "") +
    "</div>";
}
async function hydrate() {
  var rows = phoneDesks();
  var box = document.getElementById("list");
  try {
    var r = await fetch("/api/desks", {
      method: "POST",
      headers: sessionHdr(localStorage.getItem("aia_ws") || "", localStorage.getItem("aia_pin") || ""),
      body: JSON.stringify({ action: "mine", desks: rows.map(function (d) { return { slug: d.slug, pin: d.pin }; }) })
    });
    var data = await r.json().catch(function () { return {}; });
    if (r.ok && data && (data.owned || data.member || data.desks)) {
      BOOK = data;
      if (data.kinds && data.kinds.length) ASK = data.kinds;
      paintYou(data);
      var owned = data.owned || [];
      var member = data.member || [];
      var seen = {};
      owned.concat(member).forEach(function (d) { if (d && d.slug) seen[d.slug] = true; });
      var phoneOnly = rows.filter(function (d) { return d && d.slug && !seen[d.slug]; });
      var html = "";
      if (owned.length) html += "<h2>Desks you own</h2>" + owned.map(function (d) { return cardHtml(d, "own"); }).join("");
      if (member.length) html += "<h2>Desks you sit on</h2>" + member.map(function (d) { return cardHtml(d, "sit"); }).join("");
      if (phoneOnly.length) html += "<h2>Saved on this phone</h2>" + phoneOnly.map(function (d) { return cardHtml(d, "phone"); }).join("");
      if (!html) html = "<div class=\"card empty\"><p>No desks on this account yet. Add one below or create a new desk.</p></div>";
      box.innerHTML = html;
      banner((atOf(data.at || data.handle || data.aia) ? ("AIA Internet name is " + atOf(data.at || data.handle || data.aia) + ". ") : "") +
        "Leave drops your seat. Last owner keeps the seat or deletes the desk. AIA does not send. Wallet / registry connect later as a Pipe HOLD.");
      return;
    }
  } catch (e) {}
  if (!rows.length) {
    box.innerHTML = "<div class=\"card empty\"><p>No desks on this account or phone yet. Add one below or create a new desk.</p></div>";
    return;
  }
  box.innerHTML = "<h2>Saved on this phone</h2>" + rows.map(function (d) { return cardHtml(d, "phone"); }).join("");
}
function findPhone(slug) {
  var rows = phoneDesks();
  for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) return rows[i];
  return null;
}
async function apiDesk(action, slug, extra) {
  var row = findPhone(slug) || {};
  var r = await fetch("/api/desks", {
    method: "POST",
    headers: sessionHdr(slug, row.pin || ""),
    body: JSON.stringify(Object.assign({ action: action, slug: slug, pin: row.pin }, extra || {}))
  });
  var data = await r.json().catch(function () { return {}; });
  return { status: r.status, data: data };
}
document.getElementById("list").addEventListener("click", async function (e) {
  var btn = e.target.closest("[data-act]"); if (!btn) return;
  var card = e.target.closest("[data-slug]"); if (!card) return;
  var slug = card.getAttribute("data-slug");
  var act = btn.getAttribute("data-act");
  if (act === "open") { if (window.AIADesks) AIADesks.switchTo(slug); location.href = "/desk"; return; }
  if (act === "forget") { if (window.AIADesks) AIADesks.forget(slug); hydrate(); return; }
  if (act === "leave") {
    var left = await apiDesk("leave", slug);
    if (left.status >= 400) { banner(left.data.error || "Could not leave."); return; }
    if (window.AIADesks) AIADesks.forget(slug);
    banner((left.data.name || slug) + " — you left. Account stays yours.");
    hydrate();
    return;
  }
  if (act === "ask") {
    var kind = btn.getAttribute("data-kind") || "member";
    var asked = await apiDesk("ask", slug, { kind: kind });
    if (asked.status >= 400) { banner(asked.data.error || "Could not ask."); return; }
    banner("Asked for " + kind + ". Owner sees it on their queue. AIA does not send.");
    hydrate();
  }
});
document.getElementById("gone-go").onclick = async function () {
  var name = String(document.getElementById("gone-ws").value || "").trim();
  var out = document.getElementById("gone-out");
  if (!name) { out.textContent = "Type a shop name."; return; }
  var slug = window.AIADesks ? AIADesks.slugify(name) : name;
  var r = await fetch("/api/desks", { method: "POST", headers: { "Content-Type": "application/json", "X-Workspace": slug }, body: JSON.stringify({ action: "gone", slug: slug }) });
  var data = await r.json().catch(function () { return {}; });
  var events = data.events || [];
  out.innerHTML = events.length ? events.map(function (e) {
    return esc((e.t || "").slice(0, 19)) + " · " + esc(e.action) + " · " + esc(e.by || "");
  }).join("<br>") : (data.error || "No deletion log for that name.");
};
document.getElementById("add-open").onclick = async function () {
  var err = document.getElementById("add-err");
  var name = String(document.getElementById("add-ws").value || "").trim();
  var code = String(document.getElementById("add-pin").value || "").trim();
  err.hidden = true;
  if (!name || code.length < 4) { err.hidden = false; err.textContent = "Shop name and a 4+ digit code."; return; }
  var slug = window.AIADesks ? AIADesks.slugify(name) : name;
  var r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json", "X-Workspace": slug }, body: JSON.stringify({ action: "login", slug: slug, pin: code }) });
  var data = await r.json().catch(function () { return {}; });
  if (!r.ok) { err.hidden = false; err.textContent = data.error || "Shop name or code does not match."; return; }
  if (window.AIADesks) {
    AIADesks.add({ slug: (data.workspace && data.workspace.slug) || slug, name: (data.workspace && (data.workspace.biz || data.workspace.name)) || name, pin: code, role: (data.you && data.you.role) || "" });
  }
  hydrate();
};
var saveHandle = document.getElementById("save-handle");
if (saveHandle) saveHandle.onclick = async function () {
  var msg = document.getElementById("handle-msg");
  var want = String((document.getElementById("you-handle") || {}).value || "").trim();
  var slug = localStorage.getItem("aia_ws") || "";
  var out = await fetch("/api/desks", { method: "POST", headers: sessionHdr(slug, localStorage.getItem("aia_pin") || ""), body: JSON.stringify({ action: "handle", handle: want, slug: slug }) });
  var data = await out.json().catch(function () { return {}; });
  if (msg) msg.textContent = out.ok ? ("AIA Internet name is " + (data.aia || data.at || atOf(want))) : (data.error || "Could not save.");
  if (out.ok) paintYou({ at: data.aia || data.at || atOf(want), handle: data.handle, aia: data.aia, account: BOOK.account, you: BOOK.you });
};
hydrate();
