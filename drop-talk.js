(function () {
  var KINDS = [
    { re: /\b(task|to-?do)\b/i, kind: "task", outcome: "wait" },
    { re: /\b(idea|what if)\b/i, kind: "idea", outcome: "note" },
    { re: /\b(project)\b/i, kind: "project", outcome: "wait" },
    { re: /\b(build|make this|make a)\b/i, kind: "build", outcome: "wait" },
    { re: /\b(ride|pick me up|give me a lift)\b/i, kind: "ride", outcome: "book" },
    { re: /\b(pick ?up|drop[- ]?off)\b/i, kind: "pickup", outcome: "book" },
    { re: /\b(sell|ebay|consign|listing)\b/i, kind: "list", outcome: "list" },
    { re: /\b(list)\b/i, kind: "list", outcome: "note" },
    { re: /\b(quote|how much|estimate)\b/i, kind: "quote", outcome: "quote" },
    { re: /\b(missed call|call (them|him|her|me) back|they called)\b/i, kind: "call", outcome: "call" },
    { re: /\b(remind|reminder|don't forget)\b/i, kind: "reminder", outcome: "book" },
    { re: /\b(chore|errand|lawn|grocery|groceries)\b/i, kind: "chore", outcome: "hand" },
    { re: /\b(school|kids|field trip|practice)\b/i, kind: "school", outcome: "book" },
    { re: /\b(repair|fix it|broken)\b/i, kind: "repair", outcome: "quote" },
    { re: /\b(deliver|delivery)\b/i, kind: "delivery", outcome: "book" },
    { re: /\b(invoice|bill|owe)\b/i, kind: "invoice", outcome: "wait" },
    { re: /\b(package|parcel)\b/i, kind: "package", outcome: "book" },
    { re: /\b(form|paper|permission slip)\b/i, kind: "form", outcome: "wait" },
    { re: /\b(photo|picture|pic)\b/i, kind: "photo", outcome: "note" },
    { re: /\b(follow ?up|check in)\b/i, kind: "follow", outcome: "call" },
    { re: /\b(custom|my own)\b/i, kind: "custom", outcome: "wait" }
  ];
  var WHO = [
    { re: /\b(i'?m |this is )?(family|mom|dad|wife|husband|son|daughter)\b/i, who: "family" },
    { re: /\b(friend)\b/i, who: "friend" },
    { re: /\b(staff|employee)\b/i, who: "staff" },
    { re: /\b(helper|neighbor)\b/i, who: "helper" }
  ];
  var OUTCOMES = [
    { re: /\btext (them|him|her|it)\b/i, outcome: "text" },
    { re: /\bemail\b/i, outcome: "email" },
    { re: /\bcall (them|him|her|back)\b/i, outcome: "call" },
    { re: /\b(calendar|book it|put it on the calendar)\b/i, outcome: "book" },
    { re: /\bhand (it )?(off|to)\b/i, outcome: "hand" },
    { re: /\bjust (a )?note\b/i, outcome: "note" },
    { re: /\bwait|ask (me|the owner)\b/i, outcome: "wait" }
  ];
  var CREW = ["Foreman", "Mapper", "Packer", "Doer", "Rail", "Builder", "Worker"];
  function embedOn() {
    try {
      if (document.body && document.body.classList.contains("embed")) return true;
      if (window !== window.parent) return true;
      return /embed=1/.test(location.search);
    } catch (e) { return false; }
  }
  function widgetOn() {
    try {
      if (document.documentElement && document.documentElement.classList && document.documentElement.classList.contains("widget")) return true;
      if (document.body && document.body.classList && document.body.classList.contains("widget")) return true;
      var p = String(location.pathname || "").replace(/\/+$/, "");
      if (/(?:^|\/)widget(?:\.html)?$/i.test(p)) return true;
      return /\/widget(?:\.html)?(?:[?#]|$)/i.test(String(location.href || ""));
    } catch (e) { return false; }
  }
  function slimChrome() { return embedOn() || widgetOn(); }
  function markSlim() {
    try {
      if (widgetOn()) {
        if (document.documentElement && document.documentElement.classList) document.documentElement.classList.add("widget");
        if (document.body && document.body.classList) document.body.classList.add("widget");
      }
      if (embedOn()) {
        if (document.documentElement && document.documentElement.classList) document.documentElement.classList.add("embed");
        if (document.body && document.body.classList) document.body.classList.add("embed");
      }
    } catch (e) {}
  }
  function talkCss() {
    if (document.getElementById("talk-drop-css")) return;
    var css = document.createElement("style"); css.id = "talk-drop-css";
    css.textContent = "html.widget #talkBar,html.embed #talkBar,body.widget #talkBar,body.embed #talkBar{display:none!important}html.widget #talkBar *,html.embed #talkBar *,body.widget #talkBar *,body.embed #talkBar *{display:none!important}body:not(.widget):not(.embed) #talkBar{display:block;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin:0 0 14px}#talkBar .talk-status{font:600 15px/1.35 system-ui,sans-serif;color:var(--heading);margin:0 0 10px}#talkBar #talkType{width:100%;padding:10px;border:1px solid var(--line);border-radius:10px;font:inherit;background:var(--card);color:var(--ink);margin:0 0 8px}body:not(.widget):not(.embed) #talkBar button{min-height:48px;border-radius:12px;border:1px solid var(--line);background:var(--edit);color:var(--edit-ink);font:700 15px system-ui,sans-serif;padding:10px 14px;margin-right:8px;margin-top:4px}body:not(.widget):not(.embed) #talkBtn,body:not(.widget):not(.embed) #talkTypeBtn{background:var(--orange);color:#0c1116;border-color:var(--orange);min-width:30%;font-size:17px}#talkBtn.on{outline:3px solid var(--teal)}";
    document.head.appendChild(css);
  }
  function hushTalk() {
    talkCss();
    var bar = document.getElementById("talkBar");
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
  }
  function status(text) { var el = document.getElementById("talkStatus"); if (el) el.textContent = text; }
  function deskName() { return (window.desk && (desk.name || desk.slug)) || window.ws || "this desk"; }
  function workText() {
    var title = ((document.getElementById("title") || {}).value || "").trim();
    var note = ((document.getElementById("note") || {}).value || "").trim();
    var impl = ((document.getElementById("implement") || {}).value || "").trim();
    var custom = ((document.getElementById("custom-name") || {}).value || "").trim();
    var typed = ((document.getElementById("talkType") || {}).value || "").trim();
    return title || note || impl || custom || typed;
  }
  function dropLine() {
    var work = workText();
    if (work) return work + ". Say drop it to put this on " + deskName() + ".";
    return "Talk or type the work. A Desk AI drafts the card. You still tap Yes or Stop.";
  }
  function parseTalk(raw) {
    var text = String(raw || "").replace(/\s+/g, " ").trim();
    var sendNow = /\b(drop it|send it|put it on( the)? (desk|queue)|that's it|that is it|go ahead)\b/i.test(text);
    var cleaned = text.replace(/\b(drop it|send it|put it on( the)? (desk|queue)|that's it|that is it|go ahead)\b/gi, " ").replace(/\s+/g, " ").trim();
    var out = { text: cleaned || text, notes: cleaned || text, title: "", kind: "", outcome: "", who: "", crew: "", sendNow: sendNow };
    var i;
    for (i = 0; i < KINDS.length; i++) if (KINDS[i].re.test(text)) { out.kind = KINDS[i].kind; out.outcome = KINDS[i].outcome; break; }
    for (i = 0; i < WHO.length; i++) if (WHO[i].re.test(text)) { out.who = WHO[i].who; break; }
    for (i = 0; i < OUTCOMES.length; i++) if (OUTCOMES[i].re.test(text)) { out.outcome = OUTCOMES[i].outcome; break; }
    for (i = 0; i < CREW.length; i++) {
      var re = new RegExp("\\b" + CREW[i] + "\\b", "i");
      if (re.test(text)) { out.crew = CREW[i]; break; }
    }
    var when = text.match(/\b(?:by |due |on |at |friday|monday|tuesday|wednesday|thursday|saturday|sunday|tonight|tomorrow|today)[^,.!]{0,40}/i);
    if (when) out.timing = when[0].trim().slice(0, 80);
    out.title = (cleaned || text).split(/[.!?]/)[0].trim().slice(0, 80);
    return out;
  }
  function applyParsed(parsed) {
    if (!parsed || !parsed.text) return;
    var title = document.getElementById("title"); var note = document.getElementById("note");
    var tell = document.getElementById("tell"); var impl = document.getElementById("implement"); var kind = document.getElementById("kind");
    var customName = document.getElementById("custom-name"); var agentTell = document.getElementById("agent-tell");
    if (impl && impl.offsetParent !== null) impl.value = parsed.text;
    if (title) title.value = parsed.title || parsed.text.slice(0, 80);
    if (note) note.value = parsed.text; if (tell) tell.value = parsed.text;
    if (agentTell && !agentTell.value) agentTell.value = parsed.text;
    if (customName && parsed.kind === "custom" && !customName.value) customName.value = parsed.title || parsed.text.slice(0, 80);
    if (kind && parsed.kind) {
      if (![].some.call(kind.options, function (o) { return o.value === parsed.kind; })) {
        var opt = document.createElement("option"); opt.value = parsed.kind; opt.textContent = parsed.kind; kind.appendChild(opt);
      }
      kind.value = parsed.kind;
      if (window.AIADropAgent && AIADropAgent.paintKindFields) AIADropAgent.paintKindFields(document.getElementById("kind-fields"), parsed.kind);
    }
    if (parsed.timing) { var timingEl = document.querySelector("[data-kind-field=timing]"); if (timingEl) timingEl.value = parsed.timing; }
    if (parsed.outcome) {
      window.__aiaOutcome = parsed.outcome;
      if (window.AIADropAgent && AIADropAgent.paintOutcomes) AIADropAgent.paintOutcomes(document.getElementById("outcome-chips"), parsed.outcome);
    }
    if (parsed.who && window.AIADropAgent && AIADropAgent.paintWho) { AIADropAgent.paintWho(parsed.who); window.whoKind = parsed.who; }
    if (parsed.crew) {
      window.__aiaCrew = parsed.crew;
      var crewBtn = document.querySelector("#crew-chips [data-crew=\"" + parsed.crew + "\"]");
      if (crewBtn) {
        document.querySelectorAll("#crew-chips button").forEach(function (b) { b.classList.toggle("on", b === crewBtn); });
      }
    }
    if (window.AIADropAgent && AIADropAgent.paintPreview) AIADropAgent.paintPreview(AIADropAgent.implementFromText(parsed.text, window.FIELDS || []));
  }
  function fireSend() {
    if (typeof window.send === "function") window.send();
    else { var btn = document.getElementById("drop-send"); if (btn) btn.click(); }
  }
  function fill(heard) {
    var text = String(heard || "").trim(); if (!text) return;
    if (/^(drop it|send it|yes|yeah|do it|go ahead)$/i.test(text)) {
      if (!workText()) { status("Say the work first. Then say drop it."); if (window.AIASpeech) AIASpeech.speak("Say the work first."); return; }
      status("Dropping it on the queue."); if (window.AIASpeech) AIASpeech.speak("Dropping it on the queue."); fireSend(); return;
    }
    var parsed = parseTalk(text); applyParsed(parsed);
    var typeEl = document.getElementById("talkType"); if (typeEl && parsed.text) typeEl.value = parsed.text;
    if (parsed.sendNow) { status("Heard. Dropping it on " + deskName() + "."); if (window.AIASpeech) AIASpeech.speak("Dropping it on the queue."); fireSend(); return; }
    var line = (parsed.title || parsed.text) + ". Say drop it if that is right.";
    status(line); if (window.AIASpeech) AIASpeech.speak(line);
  }
  function styleBar(bar) {
    if (slimChrome()) { hushTalk(); return; }
    talkCss();
    bar.hidden = false; bar.classList.add("talk-first");
    var main = document.querySelector("main.wrap"); var title = document.getElementById("drop-title");
    if (main && title && bar.parentNode === main) {
      var sub = document.getElementById("drop-sub"); var after = sub || title;
      if (after.nextSibling !== bar) after.parentNode.insertBefore(bar, after.nextSibling);
    }
    var talkBtn = document.getElementById("talkBtn"); if (talkBtn) talkBtn.textContent = "Talk to the desk";
  }
  function wantTalk() {
    var params = new URLSearchParams(location.search);
    return location.hash === "#talk" || params.get("talk") === "1" || params.get("mode") === "talk";
  }
  var STEP_KEY = "aia_drop_step";
  var beforeTalk = "";
  // A Talk link with no desk behind it (signed out, or signed in with no desk yet) cannot open Tell.
  // Point at the one next step the page already offers instead of leaving nothing focused.
  function signedOutBox() {
    var root = document.documentElement;
    return !!(root && root.classList && root.classList.contains("signin-first") && document.getElementById("signin-first-go"));
  }
  function pointAt(node) {
    if (!node) return;
    try { node.scrollIntoView({ block: "center" }); } catch (e) { if (node.scrollIntoView) node.scrollIntoView(); }
    if (node.focus) node.focus({ preventScroll: true });
  }
  function pointSignIn() { pointAt(document.getElementById("signin-first-go")); }
  function pointDesk() {
    // drop-steps already wrote its "Pick a desk first" line into #desk-err; that line is hidden until shown.
    var err = document.getElementById("desk-err");
    if (err && err.textContent) err.style.display = "block";
    var pick = document.getElementById("desk-pick");
    pointAt((pick && pick.querySelector('a[href="/onboard"]')) || pick);
  }
  function focusType() {
    var box = document.getElementById("talkType");
    if (!box) box = document.getElementById("talkBtn");
    if (box && box.focus) box.focus({ preventScroll: true });
  }
  function focusTalk() {
    if (slimChrome()) { hushTalk(); return; }
    var bar = document.getElementById("talkBar"); if (!bar) return;
    if (signedOutBox()) { pointSignIn(); return; }
    // Show first, focus last: a node that is hidden or display:none can't take focus.
    bar.hidden = false;
    // The step rail may have painted Desk before the bar showed; open Tell so the bar is not display:none.
    if (window.AIADropSteps && AIADropSteps.go && AIADropSteps.current() !== "tell") {
      beforeTalk = location.hash === "#talk" ? AIADropSteps.current() || "" : "";
      // A Talk link opens Tell for this visit only; it must not become the step plain /drop remembers.
      var kept = null; try { kept = sessionStorage.getItem(STEP_KEY); } catch (e) {}
      AIADropSteps.go("tell", true);
      try { if (kept === null) sessionStorage.removeItem(STEP_KEY); else sessionStorage.setItem(STEP_KEY, kept); } catch (e) {}
      // Tell did not open: no desk yet. Show the desk step's next move, not a hidden Talk bar.
      if (AIADropSteps.current() !== "tell") { beforeTalk = ""; pointDesk(); return; }
    }
    // The type box is the target; the Talk button only when the type box is not on the page yet.
    var typeEl = document.getElementById("talkType") || document.getElementById("talkBtn"); if (typeEl) typeEl.focus({ preventScroll: true });
    // Then bring the bar to the top, below the sticky step rail (its scroll-margin-top). Again after a frame,
    // once the step change has laid out, so a late layout shift can't leave the bar under the rail.
    talkToTop(bar);
    (window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); })(function () { talkToTop(bar); });
  }
  function talkToTop(bar) {
    // A tap on another step before the late frame: that step must not get Tell's scroll or room.
    if (window.AIADropSteps && AIADropSteps.current && AIADropSteps.current() !== "tell") return;
    try { bar.scrollIntoView({ block: "start" }); } catch (e) { bar.scrollIntoView(true); }
    fitType(bar);
  }
  // The top of the screen's bottom cover: the fixed bottom nav or the sticky Back / Next, whichever is higher.
  function floorY() {
    var h = window.innerHeight || 0; var top = h;
    ["desk-nav", "drop-step-foot"].forEach(function (id) {
      var n = document.getElementById(id); if (!n || !n.getBoundingClientRect) return;
      var cs = window.getComputedStyle ? window.getComputedStyle(n) : null;
      if (!cs || cs.display === "none" || (cs.position !== "fixed" && cs.position !== "sticky")) return;
      var r = n.getBoundingClientRect();
      if (r.height > 0 && r.top < top && r.bottom > 0) top = r.top;
    });
    return top;
  }
  // The type box must end up above the bottom nav and Back / Next, or a tap on it lands on the nav.
  // On a short screen it cannot fit with them: make room (talk-roomy, then talk-tight) and bring the bar up again.
  function fitType(bar) {
    var t = document.getElementById("talkType"); if (!t || !t.getBoundingClientRect) return;
    // The send button ("Tell the desk") sits right under the type box: both must be on screen at once.
    var send = document.getElementById("talkTypeBtn");
    var sendBottom = function () {
      if (!send || !send.getBoundingClientRect) return -Infinity;
      var r = send.getBoundingClientRect(); return r.height > 0 ? r.bottom : -Infinity;
    };
    var sendFits = function () { return sendBottom() + 8 <= floorY(); };
    var fits = function () { if (!sendFits()) return false; return t.getBoundingClientRect().bottom + 8 <= floorY(); };
    if (fits()) return;
    // First just bring the bar to the top (a refit on Next starts from wherever the page was); make room
    // only if the type box still does not fit there.
    try { bar.scrollIntoView({ block: "start" }); } catch (e) { bar.scrollIntoView(true); }
    if (fits()) return;
    var room = ["talk-roomy", "talk-tight"];
    for (var i = 0; i < room.length; i++) {
      if (document.body && document.body.classList) document.body.classList.add(room[i]);
      try { bar.scrollIntoView({ block: "start" }); } catch (e) { bar.scrollIntoView(true); }
      if (fits()) return;
    }
    // Still too short: the type box wins over the top of the bar.
    var gap = t.getBoundingClientRect().bottom + 8 - floorY();
    if (sendBottom() + 8 - floorY() > gap) gap = sendBottom() + 8 - floorY();
    if (gap > 0 && window.scrollBy) window.scrollBy(0, gap);
  }
  // The room classes belong to one fit on Tell. Leaving Tell, or turning / resizing the screen, clears them
  // so nothing leaks into portrait; Tell opening (by any route) and a turn on Tell fit the type box again.
  var ROOM = ["talk-roomy", "talk-tight"];
  var lastStep = "";
  var lastW = 0;
  function clearRoom() {
    if (!document.body || !document.body.classList) return;
    ROOM.forEach(function (c) { document.body.classList.remove(c); });
  }
  function onTell() { return !!(window.AIADropSteps && AIADropSteps.current && AIADropSteps.current() === "tell"); }
  function refit() {
    (window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); })(function () {
      var bar = document.getElementById("talkBar");
      if (!bar || bar.hidden || !onTell()) return;
      // Re-measure the rail first (a turn changes its height) so the fit uses the new scroll margin.
      if (AIADropSteps.refresh) AIADropSteps.refresh();
      fitType(bar);
    });
  }
  // drop-steps.js calls this on every paint with the active step.
  function onStep(step) {
    if (step === lastStep) return;
    lastStep = step;
    if (step !== "tell") { clearRoom(); return; }
    refit();
  }
  function onTurn() {
    var w = window.innerWidth || 0;
    if (w === lastW) return;
    lastW = w;
    clearRoom();
    if (onTell()) refit();
  }
  // Back from #talk (the hash is gone) returns to the step the page was on before Talk opened.
  function leaveTalk() {
    if (!beforeTalk || !window.AIADropSteps || !AIADropSteps.go) return;
    var to = beforeTalk; beforeTalk = "";
    if (AIADropSteps.current() === "tell") AIADropSteps.go(to, true);
  }
  function boot() {
    if (slimChrome()) { markSlim(); hushTalk(); return; }
    var bar = document.getElementById("talkBar"); if (!bar) return;
    styleBar(bar);
    if (!window.AIASpeech) status("Type the drop. Speech is off on this phone.");
    var talkBtn = document.getElementById("talkBtn"); var hear = document.getElementById("hearBtn"); var quiet = document.getElementById("quietBtn");
    var typeEl = document.getElementById("talkType"); var typeBtn = document.getElementById("talkTypeBtn");
    status(dropLine());
    if (hear) hear.onclick = function () { var line = dropLine(); status(line); if (window.AIASpeech) AIASpeech.speak(line); };
    if (talkBtn) talkBtn.onclick = function () {
      if (!window.AIASpeech || !AIASpeech.canListen()) { status("This phone will not take speech here. Type the drop."); if (typeEl) typeEl.focus(); return; }
      talkBtn.classList.add("on"); status("Listening… say the work. A Desk AI drafts the card.");
      AIASpeech.listen(function (heard) { talkBtn.classList.remove("on"); fill(heard); }, function (msg) { talkBtn.classList.remove("on"); status(msg); });
    };
    if (quiet) quiet.onclick = function () { if (window.AIASpeech) AIASpeech.stopTalk(); if (talkBtn) talkBtn.classList.remove("on"); status("Quiet. Tap Talk to the desk, or type."); };
    function sendTyped() {
      var text = typeEl ? String(typeEl.value || "").trim() : "";
      if (!text) { status("Type the work first. Then drop it."); return; }
      fill(text);
    }
    if (typeBtn) typeBtn.onclick = sendTyped;
    if (typeEl) typeEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendTyped(); }
    });
    if (wantTalk()) setTimeout(focusTalk, 50);
    window.addEventListener("hashchange", function () { if (wantTalk()) focusTalk(); else leaveTalk(); });
    lastW = window.innerWidth || 0;
    window.addEventListener("resize", onTurn);
    window.addEventListener("orientationchange", onTurn);
    window.AIADropTalk = { parseTalk: parseTalk, fill: fill, dropLine: dropLine, focusTalk: focusTalk, focusType: focusType, onStep: onStep };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
