(function () {
  var LOG_KEY = "aia_drop_log";
  var DRAFT_KEY = "aia_drop_preview";
  var ASK = [
    { id: "desk", when: function (c) { return !c.desk; }, ask: "Which desk gets this?" },
    { id: "what", when: function (c) { return !c.title; }, ask: "What should the desk do with this?" },
    { id: "whoFor", when: function (c) { return /^(call|message|quote|follow)$/.test(c.kind) && !c.whoFor; }, ask: "Who is this for?" },
    { id: "do", when: function (c) { return !c.action; }, ask: "Should the desk text them, call them, put it on the calendar, or just keep the note?" },
    { id: "due", when: function (c) { return /^(reminder|book|follow|school|ride|pickup|delivery)$/.test(c.kind) && !c.due; }, ask: "When is this due?" },
    { id: "phone", when: function (c) { return /^(text|email|call)$/.test(c.action) && !c.phone && !c.email; }, ask: "Need a number or email so the draft has somewhere to go. The desk still will not send it." },
    { id: "paper", when: function (c) { return /^(form|files|photo)$/.test(c.kind) && !c.files && !c.notes; }, ask: "Drop the paper, or say what is on it." }
  ];
  var thread = [];
  var lastAsk = "";
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
    });
  }
  function val(id) { var el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; }
  function embedOn() { return document.body.classList.contains("embed") || window !== window.parent; }
  function deskName() {
    var d = window.desk || {};
    return d.name || d.slug || window.ws || localStorage.getItem("aia_ws") || "";
  }
  function deskSlug() { return window.ws || localStorage.getItem("aia_ws") || ""; }
  function readCard() {
    var kindEl = document.getElementById("kind");
    var files = (window.AIADropWell && AIADropWell.filesFromInput) ? AIADropWell.filesFromInput() : [];
    var photo = document.getElementById("photo");
    if ((!files || !files.length) && photo && photo.files) files = [].slice.call(photo.files, 0, 8);
    var mapped = {};
    if (window.AIADropAgent && AIADropAgent.implementFromText) {
      mapped = AIADropAgent.implementFromText(val("talkType") || val("note") || val("implement"), window.FIELDS || []) || {};
    }
    var action = window.__aiaOutcome || mapped.wanted || "";
    var title = val("title") || mapped.title || val("custom-name") || val("talkType") || val("note");
    title = String(title || "").split(/[.!?]/)[0].trim().slice(0, 80);
    var hold = holdWhy(title + " " + val("note") + " " + val("talkType"), mapped.amount);
    return {
      desk: deskSlug(),
      deskName: deskName() || "Pick a desk",
      who: window.whoKind || "helper",
      whoFor: val("who") || mapped.contactName || "",
      phone: val("phone") || mapped.phone || "",
      email: mapped.email || "",
      kind: (kindEl && kindEl.value) || mapped.kind || "request",
      title: title,
      notes: val("note") || val("talkType") || val("implement") || "",
      action: action,
      due: mapped.timing || val("drop-follow-when") || "",
      files: (files && files.length) || 0,
      fileNames: (files || []).map(function (f) { return f.name; }),
      hold: hold,
      crew: window.__aiaCrew || "",
      ready: false
    };
  }
  function holdWhy(text, amount) {
    var t = String(text || "");
    if (/\b(bind|coverage|illustration|application|policy)\b/i.test(t)) return "HOLD · bind / illustration / app";
    if (/\b(wire|payout|send money|pay them|move money)\b/i.test(t)) return "HOLD · move money";
    if (Number(amount) >= 250) return "HOLD · $250+";
    return "";
  }
  function missing(card) {
    var i;
    for (i = 0; i < ASK.length; i++) if (ASK[i].when(card)) return ASK[i];
    return null;
  }
  function actionLabel(id) {
    var map = { text: "Text them", email: "Email them", call: "Call them back", book: "Put it on the calendar", hand: "Hand it to someone", list: "Draft a listing", quote: "Draft a quote", wait: "Owner decides", note: "Just keep the note" };
    return map[id] || id || "Need this";
  }
  function inject() {
    if (document.getElementById("drop-preview")) return;
    var after = document.getElementById("talkBar") || document.getElementById("desk-pick") || document.getElementById("drop-sub");
    if (!after || !after.parentNode) return;
    var box = document.createElement("div");
    box.id = "drop-preview-wrap";
    box.innerHTML =
      "<div class=\"card\" id=\"drop-thread-card\">" +
      "<strong>Talk with this desk</strong>" +
      "<p class=\"sub\" id=\"thread-empty\">Talk to this desk. The desk asks what is missing. The card stays here until it is right.</p>" +
      "<div id=\"drop-thread\" class=\"drop-thread\"></div>" +
      "<input id=\"talkType\" placeholder=\"Say the work. The desk will ask.\" autocomplete=\"off\">" +
      "<div class=\"talk-actions\"><button type=\"button\" id=\"talkTypeBtn\">Tell the desk</button></div>" +
      "</div>" +
      "<div class=\"card\" id=\"verify-strip\"><strong>This drop</strong><div id=\"verify-cells\" class=\"verify-cells\"></div></div>" +
      "<div class=\"card\" id=\"drop-preview\"><strong>Card preview</strong><p class=\"sub\" id=\"preview-sub\">Not on the queue yet. Fix it here. Then send it.</p><div id=\"preview-body\"></div><p class=\"sub\" id=\"drop-ask\"></p></div>" +
      "<div class=\"card\" id=\"drop-log-card\"><strong>Drops from this phone</strong><div id=\"drop-log\"></div></div>";
    after.parentNode.insertBefore(box, after.nextSibling);
    if (!document.getElementById("drop-preview-css")) {
      var css = document.createElement("style"); css.id = "drop-preview-css";
      css.textContent = "#drop-preview-wrap{display:grid;gap:12px;margin:0 0 14px}#drop-thread{max-height:220px;overflow:auto;display:flex;flex-direction:column;gap:8px;margin:8px 0}#drop-thread .line{border-radius:12px;padding:8px 10px;font:600 14px/1.35 system-ui,sans-serif}#drop-thread .you{background:var(--edit);align-self:flex-end}#drop-thread .desk{background:var(--card);border:1px solid var(--line);align-self:flex-start}.verify-cells{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.verify-cells button{text-align:left;border:1px solid var(--line);background:var(--card);border-radius:10px;padding:8px;font:700 12px system-ui,sans-serif;color:var(--ink);min-height:52px}.verify-cells button span{display:block;font:600 11px/1.2 system-ui,sans-serif;color:var(--muted)}#talkType{width:100%;min-height:44px;font-size:16px;margin:8px 0;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink)}#talkTypeBtn,#card-ready{min-height:48px}#drop-log p{margin:6px 0;font:600 13px system-ui,sans-serif}@media(max-width:720px){.verify-cells{grid-template-columns:1fr}}";
      document.head.appendChild(css);
    }
    var bar = document.getElementById("talkBar");
    if (bar && !embedOn()) bar.hidden = false;
    if (document.getElementById("talkType") && document.querySelectorAll("#talkType").length > 1) {
      var extras = document.querySelectorAll("#talkType");
      if (extras.length > 1 && extras[0].closest("#talkBar")) extras[1].id = "talkTypePreview";
    }
  }
  function addLine(from, text, kind) {
    if (!text) return;
    thread.push({ from: from, text: String(text).slice(0, 240), kind: kind || (from === "desk" ? "ask" : "tell"), t: Date.now() });
    thread = thread.slice(-16);
    paintThread();
    persistDraft();
  }
  function paintThread() {
    var box = document.getElementById("drop-thread"); var empty = document.getElementById("thread-empty");
    if (!box) return;
    box.innerHTML = thread.map(function (l) {
      return "<div class=\"line " + (l.from === "you" ? "you" : "desk") + "\"><span>" + (l.from === "you" ? "You" : "Desk") + "</span> " + esc(l.text) + "</div>";
    }).join("");
    if (empty) empty.hidden = thread.length > 0;
    try { box.scrollTop = box.scrollHeight; } catch (e) {}
  }
  function paintVerify(card) {
    var box = document.getElementById("verify-cells"); if (!box) return;
    var cells = [
      ["Desk", card.deskName || "Pick a desk", "desk"],
      ["Who", (card.who || "helper") + (card.whoFor ? " · " + card.whoFor : ""), "who"],
      ["For", card.title || "Need this", "what"],
      ["Do", card.action ? actionLabel(card.action) : "Need this", "do"],
      ["Due", card.due || "No due yet", "due"],
      ["Files", card.files ? (card.files + " file" + (card.files > 1 ? "s" : "")) : "None", "files"]
    ];
    if (card.hold) cells.push(["HOLD", card.hold, "hold"]);
    box.innerHTML = cells.map(function (c) {
      return "<button type=\"button\" data-jump=\"" + c[2] + "\"><span>" + c[0] + "</span>" + esc(c[1]) + "</button>";
    }).join("");
  }
  function paintPreview(card) {
    var body = document.getElementById("preview-body"); var sub = document.getElementById("preview-sub"); var ask = document.getElementById("drop-ask");
    var miss = missing(card);
    card.ready = !miss && !!card.desk && !!card.title;
    if (body) {
      body.innerHTML = "<p><b>Desk</b> " + esc(card.deskName) + "</p>" +
        "<p><b>Who</b> " + esc(card.who) + (card.whoFor ? " · " + esc(card.whoFor) : "") + "</p>" +
        "<p><b>For</b> " + esc(card.title || "Need this") + " · " + esc(card.kind) + "</p>" +
        "<p><b>Do</b> " + esc(card.action ? actionLabel(card.action) : "Need this") + "</p>" +
        "<p><b>Due</b> " + esc(card.due || "No due yet") + "</p>" +
        (card.phone ? "<p><b>Phone</b> " + esc(card.phone) + "</p>" : "") +
        (card.hold ? "<p><b>HOLD</b> " + esc(card.hold) + ". Owner taps Yes or Stop after it lands.</p>" : "");
    }
    if (sub) sub.textContent = card.ready ? "Card looks right. Drop it when you say so." : "Need one more thing before this can leave.";
    if (ask) ask.textContent = miss ? miss.ask : (card.ready ? "The card looks right. Desk, who, what, do, and due are filled. Drop it when you say so." : "");
    var btn = document.getElementById("drop-send");
    if (btn) {
      btn.textContent = card.ready ? "Card is right · Drop it" : "Keep working";
      btn.disabled = false;
    }
    window.__aiaPreview = card;
    window.__aiaPreviewReady = !!card.ready;
    window.__aiaTalkThread = thread;
    paintVerify(card);
    persistDraft();
  }
  function persistDraft() {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ thread: thread, lastAsk: lastAsk, card: window.__aiaPreview || {} })); } catch (e) {}
  }
  function loadDraft() {
    try {
      var raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d && Array.isArray(d.thread)) thread = d.thread.slice(-16);
      lastAsk = (d && d.lastAsk) || "";
    } catch (e) {}
  }
  function paintLog() {
    var box = document.getElementById("drop-log"); if (!box) return;
    var rows = [];
    try { rows = JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); } catch (e) { rows = []; }
    if (!rows.length) { box.innerHTML = "<p class=\"sub\">No drops from this phone yet.</p>"; return; }
    box.innerHTML = rows.slice(0, 8).map(function (r) {
      return "<p>" + esc(r.title || "Drop") + " · " + esc(r.deskName || r.desk || "desk") +
        " · " + esc(r.who || "") + (r.due ? " · due " + esc(r.due) : "") +
        (r.id ? " <a href=\"/desk?job=" + encodeURIComponent(r.id) + "\">Open</a>" : "") + "</p>";
    }).join("");
  }
  function remember(job, card) {
    var rows = [];
    try { rows = JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); } catch (e) { rows = []; }
    rows.unshift({
      id: job && job.id, desk: card.desk, deskName: card.deskName, title: (job && job.title) || card.title,
      who: card.whoFor || card.who, action: card.action, due: card.due, hold: card.hold, at: Date.now()
    });
    try { localStorage.setItem(LOG_KEY, JSON.stringify(rows.slice(0, 20))); } catch (e) {}
    paintLog();
  }
  function applyAnswer(field, text) {
    var t = String(text || "").trim(); if (!t) return;
    if (field === "what" || field === "title") {
      var title = document.getElementById("title"); var note = document.getElementById("note");
      if (title && !title.value) title.value = t.slice(0, 80);
      if (note) note.value = (note.value ? note.value + " " : "") + t;
    }
    if (field === "whoFor" || field === "who") {
      var who = document.getElementById("who"); if (who && !who.value) who.value = t.slice(0, 80);
    }
    if (field === "due") {
      var when = document.querySelector("[data-kind-field=timing]") || document.getElementById("drop-follow-when");
      if (when) when.value = t.slice(0, 80);
    }
    if (field === "phone") {
      var phone = document.getElementById("phone"); if (phone) phone.value = t.slice(0, 40);
    }
    if (field === "do") {
      var raw = t.toLowerCase();
      var outcome = /email/.test(raw) ? "email" : /call/.test(raw) ? "call" : /calendar|book/.test(raw) ? "book" : /hand/.test(raw) ? "hand" : /quote/.test(raw) ? "quote" : /note|keep/.test(raw) ? "note" : /text/.test(raw) ? "text" : "";
      if (outcome) {
        window.__aiaOutcome = outcome;
        if (window.AIADropAgent && AIADropAgent.paintOutcomes) AIADropAgent.paintOutcomes(document.getElementById("outcome-chips"), outcome);
      }
    }
    if (field === "paper" && document.getElementById("note")) document.getElementById("note").value = t;
  }
  function hear(raw, parsed) {
    var text = String((parsed && parsed.text) || raw || "").trim();
    if (!text) return { send: false };
    if (/^(stop|never mind|cancel)$/i.test(text)) {
      thread = []; lastAsk = ""; paintThread(); paintPreview(readCard());
      addLine("desk", "Preview cleared. Nothing went to the queue.", "note");
      return { send: false, stop: true };
    }
    addLine("you", text, "tell");
    if (lastAsk) applyAnswer(lastAsk, text);
    if (parsed && window.AIADropTalk && !lastAsk) {
      /* drop-talk already applied parse to the form */
    }
    var card = readCard();
    if (!card.title && parsed && parsed.title) {
      var titleEl = document.getElementById("title"); if (titleEl) titleEl.value = parsed.title;
      card = readCard();
    }
    if (parsed && parsed.timing && !card.due) applyAnswer("due", parsed.timing);
    if (parsed && parsed.outcome && !card.action) { window.__aiaOutcome = parsed.outcome; }
    card = readCard();
    var miss = missing(card);
    var sendNow = !!(parsed && parsed.sendNow);
    if (!miss && card.desk && card.title) {
      lastAsk = "";
      addLine("desk", "The card looks right. Desk " + card.deskName + ". Who " + card.who + (card.whoFor ? " · " + card.whoFor : "") + ". For " + card.title + ". Do " + actionLabel(card.action) + ". Due " + (card.due || "none") + ". Drop it when you say so.", "note");
      paintPreview(card);
      if (window.AIASpeech) AIASpeech.speak("The card looks right. Drop it when you say so.");
      return { send: !!sendNow, ready: true };
    }
    if (miss) {
      lastAsk = miss.id;
      addLine("desk", miss.ask, "ask");
      paintPreview(card);
      if (window.AIASpeech) AIASpeech.speak(miss.ask);
      return { send: false, ask: miss.id };
    }
    paintPreview(card);
    return { send: false };
  }
  function gateSend() {
    var btn = document.getElementById("drop-send");
    if (!btn || btn.getAttribute("data-preview-gate")) return;
    btn.setAttribute("data-preview-gate", "1");
    btn.addEventListener("click", function (e) {
      var card = readCard();
      var miss = missing(card);
      if (!miss && card.desk && card.title) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!thread.length) addLine("desk", "Got it. Checking the card.", "note");
      hear(val("talkType") || val("title") || val("note") || "need a card", { text: val("talkType") || val("title") || val("note"), sendNow: false });
    }, true);
  }
  function wrapFetch() {
    if (window.__aiaPreviewFetch) return;
    window.__aiaPreviewFetch = true;
    var real = window.fetch;
    window.fetch = function (url, opts) {
      try {
        if (String(url).indexOf("/api/jobs") >= 0 && opts && opts.body) {
          var body = JSON.parse(opts.body);
          if (body && body.action === "capture") {
            body.thread = thread.slice(-12);
            body.previewReady = true;
            body.source = body.source || "preview";
            var card = window.__aiaPreview || readCard();
            if (card.due && !body.timing) body.timing = card.due;
            if (card.action && !body.outcome) { body.outcome = card.action; body.wanted = card.action; }
            if (card.whoFor && !body.contactName) body.contactName = card.whoFor;
            opts = Object.assign({}, opts, { body: JSON.stringify(body) });
            return real.call(this, url, opts).then(function (res) {
              var copy = res.clone();
              copy.json().then(function (out) {
                var job = out && (out.job || out);
                if (res.ok && job) {
                  remember(job, card);
                  addLine("desk", "On the queue · " + (card.deskName || "this desk") + ".", "note");
                  try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) {}
                }
              }).catch(function () {});
              return res;
            });
          }
        }
      } catch (e) {}
      return real.call(this, url, opts);
    };
  }
  function hookTalk() {
    if (!window.AIADropTalk || !AIADropTalk.fill || AIADropTalk.fill.__preview) return;
    var orig = AIADropTalk.fill;
    function wrapped(heard) {
      var parsed = AIADropTalk.parseTalk ? AIADropTalk.parseTalk(heard) : { text: heard, sendNow: /\bdrop it\b/i.test(heard || "") };
      if (parsed && parsed.text && orig) orig(parsed.text);
      var next = hear(heard, parsed);
      if (next && next.send && typeof window.send === "function") window.send();
      else if (next && next.send) {
        var btn = document.getElementById("drop-send"); if (btn) btn.click();
      }
    }
    wrapped.__preview = true;
    AIADropTalk.fill = wrapped;
  }
  function hookType() {
    var typeEl = document.getElementById("talkType") || document.getElementById("talkTypePreview");
    var btn = document.getElementById("talkTypeBtn");
    function go() {
      var text = typeEl ? String(typeEl.value || "").trim() : "";
      if (!text) { addLine("desk", "Say the work. The desk will ask.", "ask"); return; }
      if (window.AIADropTalk && AIADropTalk.fill) AIADropTalk.fill(text);
      else hear(text, { text: text, sendNow: /\bdrop it\b/i.test(text) });
      if (typeEl) typeEl.value = "";
    }
    if (btn && !btn.getAttribute("data-preview")) { btn.setAttribute("data-preview", "1"); btn.addEventListener("click", go); }
    if (typeEl && !typeEl.getAttribute("data-preview")) {
      typeEl.setAttribute("data-preview", "1");
      typeEl.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } });
    }
    var cells = document.getElementById("verify-cells");
    if (cells && !cells.getAttribute("data-jump")) {
      cells.setAttribute("data-jump", "1");
      cells.addEventListener("click", function (e) {
        var b = e.target.closest("[data-jump]"); if (!b) return;
        var jump = b.getAttribute("data-jump");
        var map = { what: "title", who: "who", due: "drop-follow-when", files: "photo", desk: "desk-pick" };
        var el = document.getElementById(map[jump] || jump);
        if (el && el.focus) el.focus();
        if (jump === "desk") {
          var pick = document.getElementById("desk-pick"); if (pick) pick.scrollIntoView({ block: "start" });
        }
      });
    }
  }
  function hookSendAlias() {
    if (typeof window.send === "function") return;
    var btn = document.getElementById("drop-send");
    if (btn) window.send = function () { btn.click(); };
  }
  function boot() {
    if (!document.getElementById("drop-title") && !document.getElementById("photo")) return;
    inject(); loadDraft(); wrapFetch(); gateSend(); hookSendAlias();
    setTimeout(function () { hookTalk(); hookType(); paintPreview(readCard()); paintThread(); paintLog(); }, 60);
    window.AIADropPreview = { hear: hear, readCard: readCard, paint: function () { paintPreview(readCard()); }, thread: function () { return thread.slice(); } };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
