/* Setup cards on the desk.
   When you connect a service or get a Pack, automation, add-on, or bundle, a setup card
   shows here with plain steps. Each step reads Done, To do, Skipped, or Waiting.
   - Reads GET /api/jobs?workspace=<desk> (setupCards), or ?desks=all on the Queue's
     All desks view (each card then carries its desk slug).
   - Acts with POST /api/account { action: "setup-step", cardId, stepId, do }.
   - One tap sends one request. Nothing is retried on its own. Kill takes two taps, like Stop
     on the Queue: the first asks (Yes, stop for good / Keep the card), the second sends with
     confirm:true. A 409 "Kill needs a second tap." asks again.
   - An empty list or a refused read shows nothing at all.
   - Every card links to My account (/account#setup-<id>).
   - Stop and Kill show on every card. Nothing here buys or charges anything.
   - Every value from the server is set with textContent, never as HTML. */
(function () {
  "use strict";
  if (window.AIASetupCards) return;

  var STATE = { todo: "To do", done: "Done", skipped: "Skipped", blocked: "Waiting" };
  var SKIPS = { connect: 1, secret: 1 };
  var WAIT_SECRET = "Waiting. Secrets can't be saved yet, so nothing was saved. You can finish this step later in My account.";
  var OOPS = "That didn't go through. Nothing changed.";
  var OFFLINE = "Couldn't reach Automate It Away. Nothing changed.";
  var SKIP_WHY = "Skipped from the desk card.";
  // Word for word what api/_account-connect.js says about a killed card.
  var GONE = "Stopped for good. Nothing more happens on this card.";
  var KILL_ASK = "Stop for good? Nothing more happens on this card.";
  var KILL_YES = "Yes, stop for good";
  var KILL_KEEP = "Keep the card";
  var KILL_AGAIN = "Kill needs a second tap.";
  var KILL_REARM = "Kill needs a second tap. Tap Yes, stop for good, or Keep the card.";

  var cards = [];
  var said = {};
  var waiting = {};
  var armed = {};
  // Each painted card's own Kill / Keep / say nodes, so arming swaps them in place (see arm()).
  var parts = {};
  var shownAll = false;
  var root = null;
  var readGen = 0;

  function ls(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function page() {
    var p = String((location && location.pathname) || "").replace(/\/+$/, "");
    p = p.split("/").pop() || "index";
    return p.replace(/\.html$/, "") || "index";
  }
  function slugify(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  }
  function askedDesk() {
    try { return slugify(new URLSearchParams(location.search || "").get("workspace") || ""); } catch (e) { return ""; }
  }
  function headers(slug) {
    var h = { "Content-Type": "application/json", "Accept": "application/json" };
    var tok = ls("aia_session"), pin = ls("aia_pin"), home = ls("aia_ws");
    if (tok) h["X-Session"] = tok;
    if (slug) h["X-Workspace"] = slug;
    else if (home) h["X-Workspace"] = home;
    if (pin && (!slug || slug === home)) h["X-Pin"] = pin;
    return h;
  }
  // Built here, with the card id encoded, so an odd id can't break the link.
  function hrefOf(card) {
    return "/account#setup-" + encodeURIComponent(String(card && card.id || ""));
  }
  function deskName(slug) {
    if (!slug) return "";
    try {
      var rows = window.AIADesks && window.AIADesks.list ? window.AIADesks.list() : [];
      for (var i = 0; i < rows.length; i++) {
        if (rows[i] && rows[i].slug === slug && rows[i].name) return String(rows[i].name);
      }
    } catch (e) {}
    return slug;
  }
  function liveCard(c) { return c && c.id && c.status !== "killed"; }

  function ensureCss() {
    if (document.getElementById("setup-cards-css")) return;
    var css = document.createElement("style");
    css.id = "setup-cards-css";
    css.textContent =
      "#setup-cards-desk{margin:0 0 14px}" +
      "#setup-cards-desk h2{font-size:1.05rem;margin:0 0 8px;color:var(--heading,#0a4f4f)}" +
      ".setup-card{background:var(--card,#fff);border:1px solid var(--line,#d5e0e0);border-radius:14px;padding:14px;margin:10px 0}" +
      ".setup-card h3{margin:2px 0 4px;font-size:1.05rem}" +
      ".setup-card .meta{font-size:13px;color:var(--muted,#5c6b73);margin:0 0 6px}" +
      ".setup-card .setup-desk{font-weight:700}" +
      ".setup-steps{list-style:none;padding:0;margin:8px 0}" +
      ".setup-step{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:8px 0;border-top:1px solid var(--line,#e3ecec)}" +
      ".setup-step .setup-title{flex:1 1 180px;font-weight:600}" +
      ".setup-word{font-family:inherit;font-weight:700;font-size:12px;line-height:1;border-radius:999px;padding:5px 9px;background:#eef3f3;color:#35505a}" +
      ".setup-word.is-done{background:#e2f5ea;color:#17663a}.setup-word.is-skipped{background:#f1f1f1;color:#555}.setup-word.is-blocked{background:#fff4dc;color:#7a5200}" +
      ".setup-step .setup-why{flex-basis:100%;font-size:13px;color:var(--muted,#5c6b73);margin:0}" +
      ".setup-card button,.setup-card a.setup-open{min-height:40px;border-radius:999px;border:1px solid var(--line,#d5e0e0);background:var(--card,#fff);color:inherit;font-family:inherit;font-weight:700;font-size:14px;line-height:1.2;padding:8px 14px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}" +
      ".setup-card button.setup-go{background:#0d6b6b;color:#fff;border-color:#0d6b6b}" +
      ".setup-card button:disabled{opacity:.6;cursor:default}" +
      ".setup-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}" +
      ".setup-say{font-size:13px;margin:6px 0 0;color:#35505a}" +
      ".setup-finish a{font-weight:700}" +
      ".setup-hl{outline:3px solid #f2b705;outline-offset:3px;border-radius:12px}" +
      "@media (max-width:640px){.setup-row{flex-direction:column;align-items:stretch}.setup-card button,.setup-card a.setup-open{width:100%;justify-content:center}}";
    (document.head || document.body).appendChild(css);
  }

  // ---------- talking to the server ----------
  function post(body) {
    var slug = askedDesk() || ls("aia_ws");
    return fetch("/api/account", { method: "POST", headers: headers(slug), body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, d: d || {} }; });
      }, function () { return { ok: false, status: 0, d: {}, offline: true }; });
  }

  function upsert(card) {
    var i = -1;
    cards.forEach(function (c, j) { if (c.id === card.id) i = j; });
    if (card.status === "killed") { if (i >= 0) cards.splice(i, 1); }
    else if (i >= 0) cards[i] = Object.assign({ slug: cards[i].slug, href: cards[i].href }, card);
    else cards.push(card);
    paint();
  }

  function reply(card, st, x) {
    if (x.ok) {
      delete waiting[card.id + "|" + (st ? st.id : "")];
      var next = x.d && x.d.card;
      // The api's own words whenever it sends them (an already-killed card, a save that did not stick).
      var hint = x.d && typeof x.d.hint === "string" && x.d.hint ? x.d.hint : "";
      var line = hint || (x.d && x.d.entry && typeof x.d.entry.what === "string" && x.d.entry.what) || "Saved.";
      if (next && next.id) {
        said[next.id] = next.status === "killed" ? "" : line;
        if (next.status === "killed") said.__top = hint || GONE;
        upsert(next);
      } else { said[card.id] = line; paint(); }
      return;
    }
    if (x.status === 409 && st && (st.kind === "secret" || (x.d && x.d.secretsReady === false))) {
      waiting[card.id + "|" + st.id] = true;
      said[card.id] = WAIT_SECRET;
      paint();
      return;
    }
    var msg = x.offline ? OFFLINE : (x.d && typeof x.d.error === "string" && x.d.error ? x.d.error : OOPS);
    said[card.id] = msg;
    paint();
  }

  // Arming (and Keep the card) swaps only this card's Kill / Keep buttons and its line, in place: no list
  // repaint, so the page does not move and no other card's button slides under the finger. Focus goes to
  // the button the next tap or Enter should hit: Yes, stop for good when armed, Kill again after Keep.
  function arm(card, on, line) {
    var p = parts[card.id];
    if (on) armed[card.id] = true; else delete armed[card.id];
    said[card.id] = line;
    if (!p || !p.kill || !p.kill.parentNode) { paint(); return; }
    p.kill.textContent = on ? KILL_YES : "Kill";
    p.kill.disabled = false;
    if (on && !p.keep) { p.keep = keepButton(card); p.row.insertBefore(p.keep, p.open); }
    if (!on && p.keep) { p.row.removeChild(p.keep); p.keep = null; }
    p.say.textContent = line;
    if (p.kill.focus) p.kill.focus({ preventScroll: true });
  }
  function keepButton(card) {
    var k = button(KILL_KEEP, "setup-keep", function () { if (armed[card.id]) arm(card, false, ""); });
    k.setAttribute("data-card-id", card.id);
    return k;
  }

  function act(card, st, verb, btn) {
    // The first Kill tap only asks; nothing is sent until the second.
    if (verb === "kill" && !armed[card.id]) { arm(card, true, KILL_ASK); return Promise.resolve(null); }
    if (armed[card.id]) { delete armed[card.id]; if (said[card.id] === KILL_ASK) said[card.id] = ""; }
    var body = { action: "setup-step", cardId: card.id };
    if (st) body.stepId = st.id;
    body.do = verb;
    if (verb === "kill") body.confirm = true;
    if (verb === "skip") body.reason = SKIP_WHY;
    if (st && st.kind === "desk" && verb === "done" && (card.slug || card.deskId)) body.deskId = card.slug || card.deskId;
    if (btn) btn.disabled = true;
    return post(body).then(function (x) {
      if (verb === "kill" && x.status === 409 && x.d && x.d.error === KILL_AGAIN) { arm(card, true, KILL_REARM); return x; }
      reply(card, st, x);
      return x;
    });
  }

  // ---------- painting ----------
  function button(label, cls, run) {
    var b = el("button", cls || "", label);
    b.type = "button";
    b.addEventListener("click", function () { run(b); });
    return b;
  }

  function stepRow(card, st) {
    var li = el("li", "setup-step");
    li.setAttribute("data-step-id", st.id || "");
    li.appendChild(el("span", "setup-title", st.title || "Step"));
    var held = !!waiting[card.id + "|" + st.id];
    var stateKey = held ? "blocked" : (STATE[st.state] ? st.state : "todo");
    var word = el("span", "setup-word is-" + stateKey, STATE[stateKey]);
    word.setAttribute("data-state", stateKey);
    li.appendChild(word);
    var why = typeof st.statusText === "string" && st.statusText ? st.statusText : (st.reason || "");
    if (held) why = "Waiting until secrets can be saved.";
    if (why) li.appendChild(el("p", "setup-why", why));
    if (card.status === "open" && st.state === "todo" && !held) {
      // A connect step needs a saved service picked, which only My account offers.
      if (st.kind === "connect") {
        var fin = el("a", "setup-open setup-finish-acct", "Finish in My account");
        fin.href = hrefOf(card);
        li.appendChild(fin);
      } else li.appendChild(button(st.kind === "test" ? "Done (dry run)" : "Done", "setup-go setup-done", function (b) { act(card, st, "done", b); }));
      if (SKIPS[st.kind]) li.appendChild(button("Skip", "setup-skip", function (b) { act(card, st, "skip", b); }));
    }
    return li;
  }

  function cardBox(card) {
    var box = el("article", "setup-card");
    box.id = "setup-card-" + card.id;
    box.setAttribute("data-card-id", card.id);
    var src = card.source || {};
    if (card.slug) {
      var d = el("p", "meta setup-desk", "Desk: " + deskName(card.slug));
      d.setAttribute("data-desk", card.slug);
      box.appendChild(d);
    }
    box.appendChild(el("h3", null, "Set up " + (src.name || card.name || "this")));
    if (typeof card.statusText === "string" && card.statusText) box.appendChild(el("p", "meta setup-status", card.statusText));
    var steps = Array.isArray(card.steps) ? card.steps : [];
    if (steps.length) {
      var ul = el("ul", "setup-steps");
      steps.forEach(function (st) { if (st && st.id) ul.appendChild(stepRow(card, st)); });
      box.appendChild(ul);
    }
    var row = el("div", "setup-row");
    if (card.status === "stopped") row.appendChild(button("Start again", "setup-go setup-start", function (b) { act(card, null, "start", b); }));
    // Stop and Kill: on every card, in every state, never greyed out ahead of time.
    var stopB = row.appendChild(button("Stop", "setup-stop", function (b) { act(card, null, "stop", b); }));
    stopB.setAttribute("data-card-id", card.id);
    var killB = row.appendChild(button(armed[card.id] ? KILL_YES : "Kill", "setup-kill", function (b) { act(card, null, "kill", b); }));
    killB.setAttribute("data-card-id", card.id);
    var keepB = armed[card.id] ? row.appendChild(keepButton(card)) : null;
    var a = el("a", "setup-open", "Open in My account");
    a.href = hrefOf(card);
    row.appendChild(a);
    box.appendChild(row);
    var say = el("p", "setup-say", said[card.id] || "");
    say.setAttribute("role", "status");
    box.appendChild(say);
    parts[card.id] = { row: row, kill: killB, keep: keepB, open: a, say: say };
    return box;
  }

  function mountPoint() {
    if (root && root.parentNode) return root;
    var found = document.getElementById("setup-cards-desk");
    if (found) { root = found; return root; }
    var anchor = document.getElementById("queue-all-cards") || document.getElementById("queue");
    if (!anchor || !anchor.parentNode) return null;
    root = el("section");
    root.id = "setup-cards-desk";
    root.setAttribute("aria-label", "Setup cards");
    root.hidden = true;
    anchor.parentNode.insertBefore(root, anchor);
    return root;
  }

  function paint() {
    var box = mountPoint();
    if (!box) return;
    ensureCss();
    clear(box);
    parts = {};
    var live = cards.filter(liveCard);
    if (!live.length && !said.__top) { box.hidden = true; return; }
    box.hidden = false;
    if (live.length) box.appendChild(el("h2", null, "Setup to finish"));
    if (said.__top) {
      var top = el("p", "setup-say", said.__top);
      top.setAttribute("role", "status");
      box.appendChild(top);
    }
    live.forEach(function (c) { box.appendChild(cardBox(c)); });
  }

  function show(list, all) {
    shownAll = !!all;
    cards = (Array.isArray(list) ? list : []).filter(liveCard);
    said = {};
    paint();
  }

  // ---------- reading the desk ----------
  function read(url, slug) {
    return fetch(url, { headers: headers(slug) }).then(function (r) {
      if (!r.ok) return [];
      return r.json().then(function (d) { return d && Array.isArray(d.setupCards) ? d.setupCards : []; }, function () { return []; });
    }, function () { return []; });
  }

  function refresh() {
    var gen = ++readGen;
    if (!ls("aia_session") && !ls("aia_pin")) { show([], false); return Promise.resolve([]); }
    var slug = askedDesk();
    var queueAll = !slug && page() === "desk" && !!ls("aia_session");
    var p;
    if (queueAll) p = read("/api/jobs?desks=all", "").then(function (l) { return { l: l, all: true }; });
    else {
      slug = slug || ls("aia_ws");
      if (!slug) { show([], false); return Promise.resolve([]); }
      p = read("/api/jobs?workspace=" + encodeURIComponent(slug), slug).then(function (l) { return { l: l, all: false }; });
    }
    // A newer read (another desk picked) wins; an older answer that lands late is dropped.
    return p.then(function (got) { if (gen === readGen) show(got.l, got.all); return cards; });
  }

  // ---------- a Pack install reply ----------
  function fromInstall(data, into) {
    var card = data && data.setupCard;
    if (!card || !card.id) return null;
    var box = into || document.getElementById("ok");
    if (!box) return null;
    var old = box.querySelector ? box.querySelector(".setup-finish") : null;
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var p = el("span", "setup-finish");
    var name = (card.source && card.source.name) || "this";
    p.appendChild(el("span", null, (data.setupCardCreated ? " A setup card for " + name + " is on your desk. " : " The setup card for " + name + " is still on your desk. ")));
    var a = el("a", null, "Finish setup");
    a.href = hrefOf(card);
    p.appendChild(a);
    box.appendChild(p);
    return a;
  }

  // ---------- My account: #setup-<id> ----------
  var opened = {};
  var scrolled = {};
  function wantedId() {
    var m = /^#setup-(.+)$/.exec(String((location && location.hash) || ""));
    if (!m) return "";
    try { return decodeURIComponent(m[1]); } catch (e) { return ""; }
  }
  function markAccount() {
    var id = wantedId();
    if (!id) return false;
    var box = document.getElementById("acct-card-" + id);
    if (!box) return false;
    if (box.classList) box.classList.add("setup-hl");
    box.setAttribute("data-setup-target", "1");
    if (!opened[id]) {
      var btns = box.querySelectorAll ? box.querySelectorAll("button") : [];
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].textContent === "Open") { opened[id] = true; btns[i].click(); return markAccount(); }
      }
      opened[id] = true;
    }
    if (!scrolled[id] && box.scrollIntoView) {
      scrolled[id] = true;
      try { box.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (e) { box.scrollIntoView(); }
    }
    return true;
  }
  function bootAccount() {
    ensureCss();
    var host = document.getElementById("acct-connections");
    markAccount();
    if (host && typeof MutationObserver === "function") {
      new MutationObserver(function () { markAccount(); }).observe(host, { childList: true, subtree: true });
    }
    window.addEventListener("hashchange", function () { scrolled = {}; markAccount(); });
  }

  function bootDesk() {
    refresh();
    window.addEventListener("popstate", function () { setTimeout(refresh, 0); });
    document.addEventListener("click", function (e) {
      var t = e && e.target;
      var hit = t && t.closest ? t.closest("[data-queue-desk]") : null;
      if (hit) setTimeout(refresh, 0);
    });
  }

  window.AIASetupCards = { refresh: refresh, show: show, fromInstall: fromInstall, markAccount: markAccount, cards: function () { return cards.slice(); }, allDesks: function () { return shownAll; } };

  function boot() {
    var name = page();
    if (name === "account") bootAccount();
    else if (name === "desk" || document.getElementById("queue")) bootDesk();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
