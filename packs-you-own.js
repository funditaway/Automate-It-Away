function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return ({
      "&": "&" + "amp;",
      "<": "&" + "lt;",
      ">": "&" + "gt;",
      "\"": "&" + "quot;",
      "'": "&#39;"
    })[c];
  });
}

var STATE = { packs: [], pending: null };

function hdr() {
  var h = { "Content-Type": "application/json" };
  var slug = localStorage.getItem("aia_ws") || "";
  var pin = localStorage.getItem("aia_pin") || "";
  var tok = localStorage.getItem("aia_session") || "";
  if (slug) h["X-Workspace"] = slug;
  if (tok) h["X-Session"] = tok;
  if (pin) h["X-Pin"] = pin;
  return h;
}

function note(text) {
  var el = document.getElementById("note");
  if (el) el.textContent = text || "";
}

function showEmpty(on) {
  var el = document.getElementById("empty");
  if (el) el.hidden = !on;
}

function showGate(on) {
  var el = document.getElementById("gate");
  if (el) el.hidden = !on;
}

function pendingFor(packId) {
  return STATE.pending && STATE.pending.packId === packId ? STATE.pending : null;
}

function deskName(pack, slug) {
  var hit = (pack.desks || []).filter(function (d) { return d.slug === slug; })[0];
  return (hit && hit.name) || slug;
}

function cardHtml(pack) {
  var pending = pendingFor(pack.id);
  var desks = pack.desks || [];
  var rows = desks.map(function (d) {
    var on = !!d.on;
    var tap = d.switched
      ? "<button type=\"button\" data-act=\"off\" data-pack=\"" + esc(pack.id) + "\" data-slug=\"" + esc(d.slug) + "\">Stop</button>"
      : (on ? "" : "<button type=\"button\" data-act=\"start\" data-pack=\"" + esc(pack.id) + "\" data-slug=\"" + esc(d.slug) + "\">Start</button>");
    return "<div class=\"desk-row\"><span>" + esc(d.name || d.slug) + (on ? " · On" : "") + "</span>" + tap + "</div>";
  }).join("");
  var ask = "";
  if (pending) {
    var line = pending.kind === "give"
      ? "Give pack."
      : ("Turn this pack on for " + (deskName(pack, pending.slug) || "this desk") + ".");
    ask = "<div class=\"ask\"><p>" + esc(line) + "</p><div class=\"row\">" +
      "<button type=\"button\" class=\"yes\" data-act=\"yes\" data-pack=\"" + esc(pack.id) + "\">Yes</button>" +
      "<button type=\"button\" data-act=\"stop\" data-pack=\"" + esc(pack.id) + "\">Stop</button>" +
      "</div></div>";
  }
  var install = desks.length
    ? "<button type=\"button\" data-act=\"install\" data-pack=\"" + esc(pack.id) + "\">Install pack</button>"
    : "";
  return "<article class=\"card\" data-pack=\"" + esc(pack.id) + "\">" +
    "<h2>" + esc(pack.name || pack.id) + "</h2>" +
    (rows || "<p class=\"meta\">No desk you own yet.</p>") +
    ask +
    "<div class=\"row\">" +
      "<button type=\"button\" data-act=\"give\" data-pack=\"" + esc(pack.id) + "\">Give pack</button>" +
      install +
    "</div></article>";
}

function paint() {
  var box = document.getElementById("list");
  if (!box) return;
  box.innerHTML = (STATE.packs || []).map(cardHtml).join("");
}

function packOf(id) {
  for (var i = 0; i < STATE.packs.length; i++) if (STATE.packs[i].id === id) return STATE.packs[i];
  return null;
}

function firstOffDesk(pack) {
  var desks = (pack && pack.desks) || [];
  for (var i = 0; i < desks.length; i++) if (!desks[i].on) return desks[i].slug;
  return desks.length ? desks[0].slug : "";
}

async function load() {
  showEmpty(false);
  showGate(false);
  note("");
  try {
    var r = await fetch("/api/desks", {
      method: "POST",
      headers: hdr(),
      body: JSON.stringify({ action: "owned-packs" })
    });
    var data = await r.json().catch(function () { return {}; });
    if (r.status === 401 || r.status === 403) {
      STATE.packs = [];
      paint();
      showEmpty(false);
      showGate(true);
      note(data.error || "Open a desk you own.");
      return;
    }
    if (!r.ok) {
      STATE.packs = [];
      paint();
      showEmpty(true);
      note("Could not open this account.");
      return;
    }
    STATE.packs = data.packs || [];
    paint();
    showEmpty(!STATE.packs.length);
    if (!STATE.packs.length) note("");
  } catch (e) {
    STATE.packs = [];
    paint();
    showEmpty(true);
    note("Could not open this account.");
  }
}

async function post(action, extra) {
  var r = await fetch("/api/desks", {
    method: "POST",
    headers: hdr(),
    body: JSON.stringify(Object.assign({ action: action }, extra || {}))
  });
  var data = await r.json().catch(function () { return {}; });
  return { status: r.status, data: data };
}

async function giveFile(pack) {
  var r = await fetch("/api/desks?packs=1&download=" + encodeURIComponent(pack.id), { headers: hdr() });
  if (!r.ok) { note("That file is not here."); return; }
  var blob = await r.blob();
  var a = document.createElement("a");
  var url = URL.createObjectURL(blob);
  a.href = url;
  a.download = (pack.name || "pack") + ".aia";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  note("Give pack.");
}

document.getElementById("list").addEventListener("click", async function (e) {
  var btn = e.target.closest("[data-act]");
  if (!btn) return;
  var act = btn.getAttribute("data-act");
  var id = btn.getAttribute("data-pack");
  var pack = packOf(id);
  if (!pack) return;
  if (act === "start" || act === "install") {
    var slug = btn.getAttribute("data-slug") || firstOffDesk(pack);
    if (!slug) { note("No desk you own yet."); return; }
    STATE.pending = { packId: id, slug: slug, kind: "on" };
    paint();
    note("You tap Yes or Stop.");
    return;
  }
  if (act === "give") {
    STATE.pending = { packId: id, slug: "", kind: "give" };
    paint();
    note("You tap Yes or Stop.");
    return;
  }
  if (act === "stop") {
    STATE.pending = null;
    paint();
    note("");
    return;
  }
  if (act === "yes") {
    var pending = pendingFor(id);
    if (!pending) return;
    if (pending.kind === "give") {
      STATE.pending = null;
      paint();
      await giveFile(pack);
      return;
    }
    var turned = await post("pack-on", { slug: pending.slug, pack: id, yes: true });
    STATE.pending = null;
    if (turned.status >= 400) { note(turned.data.error || "Could not turn this pack on."); paint(); return; }
    note(turned.data.note || "On for this desk.");
    await load();
    return;
  }
  if (act === "off") {
    var slugOff = btn.getAttribute("data-slug");
    var stopped = await post("pack-off", { slug: slugOff, pack: id, stop: true });
    if (stopped.status >= 400) { note(stopped.data.error || "Could not stop."); return; }
    note(stopped.data.note || "Off for this desk.");
    await load();
  }
});

load();
