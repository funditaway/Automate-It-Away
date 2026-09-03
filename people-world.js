(function () {
  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c];
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
  async function admin(body) {
    var r = await fetch("/api/admin", { method: "POST", headers: headers(), body: JSON.stringify(body || {}) });
    var data = await r.json().catch(function () { return {}; });
    return { status: r.status, data: data };
  }
  function smsHref(text) {
    return "sms:?body=" + encodeURIComponent(text);
  }
  function mailHref(text) {
    return "mailto:?subject=" + encodeURIComponent("Desk invite") + "&body=" + encodeURIComponent(text);
  }
  function worldLine(hit, kind) {
    var shop = localStorage.getItem("aia_desk_name") || "this desk";
    var who = (hit && (hit.at || (hit.handle ? "@" + hit.handle : ""))) || "You";
    var seat = kind || "helper";
    return who + " — you're invited to sit on " + shop + " as " + seat + ". Open https://automateitaway.com/login with your own account. Accept on People. Nobody sends money from here.";
  }
  function paintWorld(hits, hint) {
    var box = document.getElementById("world");
    if (!box) return;
    var rows = hits || [];
    if (!rows.length) {
      box.innerHTML = hint ? "<p class=\"meta\">" + esc(hint) + "</p>" : "";
      return;
    }
    box.innerHTML = "<h2>World</h2>" + rows.map(function (p) {
      var desks = (p.listedDesks || []).map(function (d) { return esc(d.name || d.slug); }).join(", ");
      var loc = [p.city, p.state].filter(Boolean).join(", ");
      var at = p.at || (p.handle ? "@" + p.handle : "");
      var act;
      if (p.reserved || p.sit === false) act = "<p class=\"meta\">@AIA is not a sit target.</p>";
      else if (p.alreadyOnDesk) act = "<p class=\"meta\">Already on this desk as " + esc(p.seatKind || "helper") + ".</p>";
      else if (p.pendingOnDesk) act = "<p class=\"meta\">Already asked. Waiting on them.</p>";
      else {
        act = "<button class=\"go\" type=\"button\" data-world-invite=\"" + esc(p.handle || "") + "\" data-id=\"" + esc(p.accountId || "") + "\">Invite to this desk</button>";
      }
      return "<article class=\"person\"><h3>" + esc(at) + " · " + esc(p.name || "") + "</h3><p class=\"meta\">" + esc(loc || "Listed desks only") + (desks ? " · " + desks : "") + "</p><div class=\"acts\">" + act + "</div></article>";
    }).join("");
  }
  function paintAsks(data) {
    var box = document.getElementById("asks");
    if (!box) return;
    var incoming = (data && data.incoming) || [];
    var outgoing = (data && data.outgoing) || [];
    if (!incoming.length && !outgoing.length) {
      box.innerHTML = "";
      return;
    }
    var html = "<h2>Asked</h2>";
    incoming.forEach(function (inv) {
      var line = (inv && inv.line) || ((inv.name || inv.slug || "A desk") + " asked you to sit as " + (inv.kind || "helper") + ". Accept on People. AIA does not send.");
      html += "<article class=\"person waiting\"><h3>" + esc(inv.name || inv.desk || inv.slug) + " · " + esc(inv.kind || "helper") + "</h3><p class=\"meta\">" + esc(inv.by || "Someone") + " asked you. Waiting on Accept.</p><div class=\"acts\"><button class=\"go\" type=\"button\" data-accept=\"" + esc(inv.slug) + "\">Accept</button><button class=\"kill\" type=\"button\" data-decline=\"" + esc(inv.slug) + "\">Decline</button><button class=\"edit\" type=\"button\" data-copy=\"" + esc(line) + "\">Copy</button><a class=\"edit\" href=\"" + smsHref(line) + "\">Text it</a><a class=\"edit\" href=\"" + mailHref(line) + "\">Email it</a></div></article>";
    });
    outgoing.forEach(function (inv) {
      var line = (inv && inv.line) || worldLine({ handle: String(inv.handle || "").replace(/^@/, ""), at: inv.handle }, inv.kind);
      html += "<article class=\"person\"><h3>" + esc(inv.handle || inv.name || "") + " · " + esc(inv.kind || "helper") + "</h3><p class=\"meta\">Asked. Waiting on them.</p><div class=\"acts\"><button class=\"edit\" type=\"button\" data-copy=\"" + esc(line) + "\">Copy</button><a class=\"edit\" href=\"" + smsHref(line) + "\">Text it</a><a class=\"edit\" href=\"" + mailHref(line) + "\">Email it</a></div></article>";
    });
    box.innerHTML = html;
  }
  async function loadAsks() {
    var out = await admin({ action: "invites" });
    if (out.status < 400 && out.data && out.data.ok) paintAsks(out.data);
  }
  async function findWorld(q) {
    var heard = document.getElementById("world-note");
    var query = String(q || "").trim();
    if (!query) {
      paintWorld([], "");
      return;
    }
    var out = await admin({ action: "find", q: query });
    var hits = (out.data && (out.data.hits || out.data.people)) || [];
    var hint = (out.data && (out.data.hint || out.data.error)) || (hits.length ? "" : "No world account by that name. Ask them to set a handle on Account.");
    if (heard) heard.textContent = hint;
    paintWorld(hits, hint);
    return out;
  }
  async function inviteWorld(handle, kind, accountId) {
    var heard = document.getElementById("world-note");
    var banner = document.getElementById("banner");
    var seat = kind || ((document.getElementById("world-kind") && document.getElementById("world-kind").value) || "helper");
    var body = { action: "invite-world", kind: seat };
    if (accountId) body.accountId = accountId;
    if (handle) body.handle = String(handle).replace(/^@/, "");
    if (!body.handle && !body.accountId) {
      body.handle = ((document.getElementById("world-who") && document.getElementById("world-who").value) || "").trim();
    }
    var out = await admin(body);
    var msg = (out.data && (out.data.hint || out.data.error)) || "Asked.";
    if (heard) heard.textContent = msg;
    if (banner) banner.textContent = msg;
    if (out.status < 400) {
      var line = (out.data && out.data.line) || worldLine({ handle: body.handle }, seat);
      try { await navigator.clipboard.writeText(line); } catch (err) {}
    }
    await loadAsks();
    return out;
  }
  function parseTalk(text) {
    var raw = String(text || "").trim();
    var find = raw.match(/^(?:find|search)\s+@?([a-z0-9_-]+)/i);
    if (find) return { act: "find", handle: find[1] };
    var inv = raw.match(/^invite\s+@?([a-z0-9_-]+)(?:\s+as\s+(family|friend|helper|member|staff))?/i);
    if (inv) return { act: "invite", handle: inv[1], kind: (inv[2] || "helper").toLowerCase() };
    if (/^@[a-z0-9_-]{2,}$/i.test(raw)) return { act: "find", handle: raw.replace(/^@/, "") };
    return null;
  }
  function bind() {
    var findBtn = document.getElementById("world-find-btn");
    var qBox = document.getElementById("world-who");
    var kind = document.getElementById("world-kind");
    var search = document.getElementById("q");
    if (findBtn) {
      findBtn.onclick = function () {
        var q = (qBox && qBox.value) || (search && search.value) || "";
        if (search && qBox && qBox.value) search.value = qBox.value;
        findWorld(q);
      };
    }
    if (qBox) {
      qBox.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); findWorld(qBox.value); }
      });
    }
    if (search) {
      search.addEventListener("input", function () {
        var v = String(search.value || "").trim();
        if (v.charAt(0) === "@" || /^[a-z0-9_-]{2,}$/i.test(v)) {
          if (window.__aiaWorldPeopleTimer) clearTimeout(window.__aiaWorldPeopleTimer);
          window.__aiaWorldPeopleTimer = setTimeout(function () { findWorld(v); }, 220);
        }
      });
    }
    var inviteBtn = document.getElementById("world-btn");
    if (inviteBtn) inviteBtn.onclick = function () { inviteWorld(null, kind && kind.value); };
    var list = document.getElementById("world");
    if (list) {
      list.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-world-invite]");
        if (!btn) return;
        inviteWorld(btn.getAttribute("data-world-invite"), kind && kind.value, btn.getAttribute("data-id"));
      });
    }
    var asked = document.getElementById("asks");
    if (asked) {
      asked.addEventListener("click", async function (e) {
        var copy = e.target.closest("[data-copy]");
        if (copy) {
          try { await navigator.clipboard.writeText(copy.getAttribute("data-copy") || ""); } catch (err) {}
          return;
        }
        var acc = e.target.closest("[data-accept]");
        if (acc) {
          await admin({ action: "accept-invite", slug: acc.getAttribute("data-accept") });
          await loadAsks();
          return;
        }
        var dec = e.target.closest("[data-decline]");
        if (dec) {
          await admin({ action: "decline-invite", slug: dec.getAttribute("data-decline") });
          await loadAsks();
        }
      });
    }
    var heard = document.getElementById("heard");
    var origListen = window.AIASpeech && AIASpeech.listen;
    if (origListen && !window.__aiaWorldTalkWrap) {
      window.__aiaWorldTalkWrap = true;
      AIASpeech.listen = function (cb) {
        return origListen.call(AIASpeech, function (said) {
          var parsed = parseTalk(said);
          if (parsed) {
            if (heard) heard.textContent = said || "";
            if (qBox && parsed.handle) qBox.value = "@" + parsed.handle;
            if (search && parsed.handle) search.value = "@" + parsed.handle;
            if (parsed.kind && kind) kind.value = parsed.kind;
            if (parsed.act === "find") findWorld(parsed.handle);
            if (parsed.act === "invite") inviteWorld(parsed.handle, parsed.kind);
          }
          if (typeof cb === "function") cb(said);
        });
      };
    }
    loadAsks();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
  window.AIAWorldPeople = { findWorld: findWorld, inviteWorld: inviteWorld, parseTalk: parseTalk };
})();
