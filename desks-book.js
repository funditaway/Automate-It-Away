/* Desks account book. Phone list + signed-in account. Last owner does not delete. AIA does not send. */
(function () {
  var listEl = document.getElementById("list");
  var banner = document.getElementById("banner");
  var youTitle = document.getElementById("you-title");
  var youLine = document.getElementById("you-line");
  var handleEl = document.getElementById("you-handle");
  var handleMsg = document.getElementById("handle-msg");
  var addErr = document.getElementById("add-err");
  if (!listEl) return;

  var ACCOUNT = null;
  var ROWS = [];

  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, function (c) {
      return ({ "&": "&", "<": "<", ">": ">", '"': """ })[c];
    });
  }
  function slugify(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function hdr(extra) {
    var h = { "Content-Type": "application/json" };
    var desks = window.AIADesks;
    if (desks && desks.authHeaders) {
      var more = desks.authHeaders(extra && extra.slug);
      Object.keys(more || {}).forEach(function (k) { h[k] = more[k]; });
    } else {
      var ws = (extra && extra.slug) || localStorage.getItem("aia_ws") || "";
      var pin = (extra && extra.pin) || localStorage.getItem("aia_pin") || "";
      var tok = localStorage.getItem("aia_session") || "";
      if (ws) h["X-Workspace"] = slugify(ws);
      if (tok) h["X-Session"] = tok;
      else if (pin) h["X-Pin"] = pin;
    }
    return h;
  }
  function phoneDesks() {
    if (window.AIADesks && window.AIADesks.list) return window.AIADesks.list() || [];
    try { return JSON.parse(localStorage.getItem("aia_desks") || "[]") || []; } catch (e) { return []; }
  }
  function say(el, msg, good) {
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
    el.className = good ? "ok" : "err";
  }

  async function post(path, body, extra) {
    var r = await fetch(path, { method: "POST", headers: hdr(extra), body: JSON.stringify(body || {}) });
    var d = await r.json().catch(function () { return {}; });
    return { ok: r.ok, status: r.status, data: d };
  }
  async function get(path, extra) {
    var r = await fetch(path, { headers: hdr(extra) });
    var d = await r.json().catch(function () { return {}; });
    return { ok: r.ok, status: r.status, data: d };
  }

  function handleOf(acc) {
    if (!acc) return "";
    var raw = acc.handle || acc.at || acc.accountname || acc.name || "";
    return String(raw || "").replace(/^@/, "").trim();
  }

  function paintYou() {
    var acc = ACCOUNT || {};
    var handle = handleOf(acc);
    var name = acc.displayName || acc.name || acc.accountName || "Your account";
    if (youTitle) youTitle.textContent = name;
    if (youLine) youLine.textContent = handle
      ? ("World users receive @" + handle + ". Email is not login.")
      : "World users receive @accountname. Email is not login.";
    if (handleEl && handle) handleEl.value = handle;
    if (banner) {
      banner.textContent = acc && (acc.ok || acc.account || acc.id)
        ? "Desks this account owns or sits on. Leave removes you from this phone. Last owner stays."
        : "Sign in to see every desk on this account. Forget phone never deletes the desk.";
    }
  }

  function seatOf(row) {
    return String((row && (row.seat || row.role || row.who)) || "owner").toLowerCase();
  }
  function permsLine(row) {
    var seat = seatOf(row);
    if (seat === "owner") return "Owner. Stop, money, delete, code, and pipes stay here.";
    if (seat === "staff" || seat === "member") return "Member. Work the queue. Owner taps stay off.";
    if (seat === "helper" || seat === "friend" || seat === "family") return "Helper. Queue only. Owner Approves first.";
    return "Seat on this desk.";
  }

  function cardHtml(row) {
    var slug = row.slug || row.id || "";
    var name = row.name || row.deskName || slug || "Desk";
    var seat = seatOf(row);
    var handle = handleOf(row) || handleOf(ACCOUNT);
    return '<div class="card" data-desk="' + esc(slug) + '">' +
      '<h2>' + esc(name) + '</h2>' +
      '<p class="meta">' +
        '<span class="chip">' + esc(seat) + '</span>' +
        (handle ? '<span class="chip">@' + esc(handle) + '</span>' : '') +
        (row.city ? esc(row.city) : '') +
      '</p>' +
      '<p class="meta">' + esc(permsLine(row)) + '</p>' +
      '<div class="row">' +
        '<button class="go" type="button" data-open="' + esc(slug) + '">Open queue</button>' +
        '<button class="edit" type="button" data-drop="' + esc(slug) + '">Drop</button>' +
        '<button class="kill" type="button" data-leave="' + esc(slug) + '">Leave</button>' +
      '</div>' +
      '<p class="meta">Ask to sit</p>' +
      '<div class="row ask-row">' +
        ['family', 'friend', 'helper', 'member', 'staff'].map(function (kind) {
          return '<button class="edit" type="button" data-ask="' + esc(slug) + '" data-kind="' + kind + '">' + kind + '</button>';
        }).join('') +
      '</div>' +
      '<p class="meta" data-msg="' + esc(slug) + '"></p>' +
    '</div>';
  }

  function paintList() {
    if (!ROWS.length) {
      listEl.innerHTML = '<div class="card empty"><p>No desks on this phone yet. Add one below or create a new desk.</p>' +
        '<div class="row"><a class="go" href="/onboard">Create a new desk</a><a class="edit" href="/drop">Drop</a></div></div>';
      return;
    }
    listEl.innerHTML = ROWS.map(cardHtml).join("");
  }

  async function loadAccount() {
    var out = await get("/api/account");
    if (out.ok) ACCOUNT = out.data.account || out.data.plan && out.data || out.data;
    else ACCOUNT = null;
    paintYou();
  }

  async function loadRows() {
    var phone = phoneDesks();
    var mine = [];
    var out = await post("/api/desks", { action: "mine" });
    if (out.ok && Array.isArray(out.data.desks || out.data.rows)) mine = out.data.desks || out.data.rows;
    var map = {};
    phone.concat(mine).forEach(function (row) {
      if (!row) return;
      var slug = slugify(row.slug || row.id || row.ws || row.name || "");
      if (!slug) return;
      map[slug] = Object.assign({ slug: slug, name: row.name || row.deskName || slug, seat: row.seat || row.role || "owner", pin: row.pin }, map[slug] || {}, row, { slug: slug });
    });
    ROWS = Object.keys(map).map(function (k) { return map[k]; });
    paintList();
  }

  async function saveHandle() {
    var handle = String(handleEl && handleEl.value || "").replace(/^@/, "").trim();
    if (!handle) return say(handleMsg, "Name the handle the world sees.", false);
    var out = await post("/api/account", { action: "handle", handle: handle, at: handle });
    if (!out.ok && (out.status === 400 || out.status === 404)) out = await post("/api/desks", { action: "handle", handle: handle });
    if (!out.ok) return say(handleMsg, (out.data && out.data.error) || "Could not save handle.", false);
    if (ACCOUNT) ACCOUNT.handle = handle;
    paintYou();
    say(handleMsg, out.data.note || ("World users receive @" + handle + "."), true);
  }

  async function addDesk() {
    var name = String((document.getElementById("add-ws") || {}).value || "").trim();
    var pin = String((document.getElementById("add-pin") || {}).value || "").trim();
    if (!name || !pin) return say(addErr, "Shop name and desk code.", false);
    var slug = slugify(name);
    var out = await post("/api/account", { action: "login", slug: slug, pin: pin, name: name });
    if (!out.ok) out = await post("/api/auth", { action: "login", slug: slug, pin: pin, name: name });
    if (!out.ok) return say(addErr, (out.data && out.data.error) || "Desk name or code does not match.", false);
    if (out.data.session && out.data.session.token) localStorage.setItem("aia_session", out.data.session.token);
    if (window.AIADesks && window.AIADesks.add) window.AIADesks.add({ slug: slug, name: name, pin: pin, role: (out.data.role || "owner") });
    else {
      try {
        var rows = phoneDesks();
        rows = rows.filter(function (r) { return slugify(r.slug || r.name) !== slug; });
        rows.push({ slug: slug, name: name, pin: pin, role: "owner" });
        localStorage.setItem("aia_desks", JSON.stringify(rows));
      } catch (e) {}
    }
    say(addErr, "On this phone.", true);
    loadRows();
  }

  async function leaveDesk(slug) {
    var row = ROWS.filter(function (r) { return r.slug === slug; })[0] || { slug: slug };
    var out = await post("/api/desks", { action: "leave", slug: slug }, row);
    if (out.status === 409) return msg(slug, (out.data && out.data.error) || "Last owner stays. Hand the desk off first.", false);
    if (window.AIADesks && window.AIADesks.forget) window.AIADesks.forget(slug);
    else {
      try {
        var rows = phoneDesks().filter(function (r) { return slugify(r.slug || r.name) !== slug; });
        localStorage.setItem("aia_desks", JSON.stringify(rows));
      } catch (e) {}
    }
    if (localStorage.getItem("aia_ws") === slug) {
      localStorage.removeItem("aia_ws");
      localStorage.removeItem("aia_pin");
    }
    msg(slug, (out.data && out.data.note) || "Left this phone. The desk is still there.", true);
    loadRows();
  }

  async function askSeat(slug, kind) {
    var row = ROWS.filter(function (r) { return r.slug === slug; })[0] || { slug: slug };
    var out = await post("/api/desks", { action: "ask", slug: slug, kind: kind, invite: kind }, row);
    if (!out.ok && (out.status === 400 || out.status === 404)) {
      out = await post("/api/admin", { action: "ask", slug: slug, kind: kind, invite: kind }, row);
    }
    if (!out.ok) return msg(slug, (out.data && out.data.error) || "Ask is pending until they Accept. AIA does not send.", false);
    msg(slug, out.data.note || ("Asked as " + kind + ". Waits on Accept. AIA does not send."), true);
  }

  function msg(slug, text, good) {
    var el = listEl.querySelector('[data-msg="' + slug + '"]');
    say(el, text, good);
  }

  function openDesk(slug, drop) {
    var row = ROWS.filter(function (r) { return r.slug === slug; })[0];
    if (window.AIADesks && window.AIADesks.open && row) window.AIADesks.open(row);
    else {
      localStorage.setItem("aia_ws", slug);
      if (row && row.pin) localStorage.setItem("aia_pin", row.pin);
      if (row && row.name) localStorage.setItem("aia_desk_name", row.name);
    }
    location.href = drop ? ("/drop?ws=" + encodeURIComponent(slug)) : "/desk";
  }

  async function goneLookup() {
    var name = String((document.getElementById("gone-ws") || {}).value || "").trim();
    var box = document.getElementById("gone-out");
    if (!box) return;
    if (!name) { box.textContent = "Type a shop name."; return; }
    var out = await post("/api/desks", { action: "gone", slug: slugify(name), name: name });
    if (!out.ok) out = await get("/api/desks?gone=1&q=" + encodeURIComponent(name));
    var row = (out.data && (out.data.tombstone || out.data.gone || out.data.desk)) || null;
    box.textContent = row
      ? ("Deleted. " + (row.note || "Cards are gone. The log is not."))
      : ((out.data && out.data.error) || "No tombstone for that name on this store.");
  }

  listEl.addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    if (btn.getAttribute("data-open")) return openDesk(btn.getAttribute("data-open"), false);
    if (btn.getAttribute("data-drop")) return openDesk(btn.getAttribute("data-drop"), true);
    if (btn.getAttribute("data-leave")) return leaveDesk(btn.getAttribute("data-leave"));
    if (btn.getAttribute("data-ask")) return askSeat(btn.getAttribute("data-ask"), btn.getAttribute("data-kind"));
  });
  var saveBtn = document.getElementById("save-handle");
  if (saveBtn) saveBtn.onclick = saveHandle;
  var addBtn = document.getElementById("add-open");
  if (addBtn) addBtn.onclick = addDesk;
  var goneBtn = document.getElementById("gone-go");
  if (goneBtn) goneBtn.onclick = goneLookup;

  async function boot() {
    await loadAccount();
    await loadRows();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
