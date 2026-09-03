(function () {
  var KINDS = [
    { re: /\b(ride|pick me up|give me a lift)\b/i, kind: "ride", outcome: "book" },
    { re: /\b(pick ?up|drop[- ]?off)\b/i, kind: "pickup", outcome: "book" },
    { re: /\b(list|sell|ebay|consign)\b/i, kind: "list", outcome: "list" },
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
    return "Talk or type the work. Then say drop it. Nobody sends money from here.";
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
    if (!document.getElementById("talk-drop-css")) {
      var css = document.createElement("style"); css.id = "talk-drop-css";
      css.textContent = "#talkBar{display:block;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin:0 0 14px}#talkBar .talk-status{font:600 15px/1.35 system-ui,sans-serif;color:var(--heading);margin:0 0 10px}#talkBar #talkType{width:100%;padding:10px;border:1px solid var(--line);border-radius:10px;font:inherit;background:var(--card);color:var(--ink);margin:0 0 8px}#talkBar button{min-height:48px;border-radius:12px;border:1px solid var(--line);background:var(--edit);color:var(--edit-ink);font:700 15px system-ui,sans-serif;padding:10px 14px;margin-right:8px;margin-top:4px}#talkBtn,#talkTypeBtn{background:var(--orange);color:#0c1116;border-color:var(--orange);min-width:30%;font-size:17px}#talkBtn.on{outline:3px solid var(--teal)}";
      document.head.appendChild(css);
    }
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
  function focusTalk() {
    var bar = document.getElementById("talkBar"); if (!bar) return;
    bar.hidden = false;
    try { bar.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (e) { bar.scrollIntoView(true); }
    var typeEl = document.getElementById("talkType"); if (typeEl) typeEl.focus();
  }
  function boot() {
    var bar = document.getElementById("talkBar"); if (!bar) return;
    styleBar(bar);
    if (!window.AIASpeech) status("Type the drop. Speech is off on this phone.");
    var talkBtn = document.getElementById("talkBtn"); var hear = document.getElementById("hearBtn"); var quiet = document.getElementById("quietBtn");
    var typeEl = document.getElementById("talkType"); var typeBtn = document.getElementById("talkTypeBtn");
    status(dropLine());
    if (hear) hear.onclick = function () { var line = dropLine(); status(line); if (window.AIASpeech) AIASpeech.speak(line); };
    if (talkBtn) talkBtn.onclick = function () {
      if (!window.AIASpeech || !AIASpeech.canListen()) { status("This phone will not take speech here. Type the drop."); if (typeEl) typeEl.focus(); return; }
      talkBtn.classList.add("on"); status("Listening… say the work. End with drop it if you want it on the queue.");
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
    window.addEventListener("hashchange", function () { if (wantTalk()) focusTalk(); });
    window.AIADropTalk = { parseTalk: parseTalk, fill: fill, dropLine: dropLine, focusTalk: focusTalk };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
