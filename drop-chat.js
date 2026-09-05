(function () {
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
    });
  }
  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }
  function desk() {
    var cur = (window.AIADesks && AIADesks.current && AIADesks.current()) || {};
    var q = "";
    try { q = String(new URLSearchParams(location.search).get("ws") || "").trim(); } catch (e) { q = ""; }
    if (window.AIADesks && AIADesks.slugify) q = AIADesks.slugify(q);
    var saved = (q && window.AIADesks && AIADesks.find) ? AIADesks.find(q) : null;
    var slug = q || cur.slug || window.ws || localStorage.getItem("aia_ws") || "";
    var name = q
      ? ((saved && saved.name) || q)
      : (cur.name || localStorage.getItem("aia_desk_name") || slug || "this desk");
    return {
      slug: slug,
      name: name,
      pin: (saved && saved.pin) || (!q ? (cur.pin || localStorage.getItem("aia_pin") || "") : "")
    };
  }
  function headers() {
    var on = desk();
    var h = { "Content-Type": "application/json" };
    if (on.slug) h["X-Workspace"] = on.slug;
    if (on.pin) h["X-Pin"] = on.pin;
    var sess = localStorage.getItem("aia_session") || "";
    if (sess) h["X-Session"] = sess;
    return h;
  }
  function localDraft(text) {
    var t = String(text || "").replace(/\s+/g, " ").trim();
    var title = (t.split(/[.!?]/)[0] || t).slice(0, 80) || "Desk note";
    var kind = /\b(quote|how much|estimate)\b/i.test(t) ? "quote"
      : /\b(task|to-?do)\b/i.test(t) ? "task"
      : /\b(idea|what if)\b/i.test(t) ? "idea"
      : /\b(project)\b/i.test(t) ? "project"
      : /\b(build|make this|make a)\b/i.test(t) ? "build"
      : /\b(sell|ebay|consign|listing)\b/i.test(t) ? "list"
      : /\b(list)\b/i.test(t) ? "list"
      : /\b(call|missed)\b/i.test(t) ? "call"
      : /\b(repair|fix)\b/i.test(t) ? "repair"
      : /\b(ride|pick ?up)\b/i.test(t) ? "pickup"
      : "task";
    var next = kind === "quote" ? "Draft the quote. Owner taps Yes before anything leaves."
      : kind === "list" ? "On the queue as a list. You still tap Yes."
      : kind === "call" ? "Draft the call-back. Desk does not dial."
      : "On the queue. Copy, text, email, or hand it. Stop stays an owner tap.";
    return {
      title: title,
      kind: kind,
      notes: t,
      draft: title + ". " + next,
      next: next,
      from: "desk-chat"
    };
  }
  function ensureThread() {
    if (document.getElementById("drop-thread")) return document.getElementById("drop-thread");
    var after = document.getElementById("public-desk-search") || document.getElementById("desk-pick") || document.getElementById("drop-sub");
    if (!after || !after.parentNode) return null;
    var box = document.createElement("div");
    box.id = "drop-chat-wrap";
    box.className = "card";
    box.innerHTML =
      "<strong>Tell the desk</strong>" +
      "<p class=\"sub\" id=\"thread-empty\">Say anything. AIA AI answers. The card lands in this chat. Nobody sends money from here.</p>" +
      "<div id=\"drop-thread\" class=\"drop-thread\"></div>" +
      "<input id=\"talkType\" placeholder=\"Tell the desk…\" autocomplete=\"off\">" +
      "<div class=\"talk-actions\"><button type=\"button\" id=\"talkTypeBtn\">Tell the desk</button></div>";
    after.parentNode.insertBefore(box, after.nextSibling);
    if (!document.getElementById("drop-chat-css")) {
      var css = document.createElement("style");
      css.id = "drop-chat-css";
      css.textContent = "#drop-chat-wrap{margin:0 0 14px}#drop-thread{max-height:280px;overflow:auto;display:flex;flex-direction:column;gap:8px;margin:8px 0}#drop-thread .line{border-radius:12px;padding:8px 10px;font:600 14px/1.35 system-ui,sans-serif}#drop-thread .you{background:var(--edit);align-self:flex-end}#drop-thread .desk{background:var(--card);border:1px solid var(--line);align-self:flex-start}#drop-thread .card-bubble{border:1px solid var(--teal);background:var(--card);align-self:stretch;padding:10px}#drop-thread .card-bubble b{display:block;color:var(--heading);margin:0 0 4px}#talkType{width:100%;min-height:44px;font-size:16px;margin:8px 0;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink)}#talkTypeBtn{min-height:48px;border-radius:12px;border:0;background:var(--orange);color:#0c1116;font:700 15px system-ui,sans-serif;padding:10px 14px;width:100%}";
      document.head.appendChild(css);
    }
    return document.getElementById("drop-thread");
  }
  function addLine(from, text, extra) {
    var box = ensureThread();
    if (!box || !text) return;
    var empty = document.getElementById("thread-empty");
    if (empty) empty.hidden = true;
    var div = document.createElement("div");
    div.className = "line " + (from === "you" ? "you" : from === "card" ? "card-bubble" : "desk");
    if (from === "card" && extra) {
      div.innerHTML = "<b>Card · " + esc(extra.title || "Drop") + "</b>" +
        "<p>" + esc(extra.draft || extra.next || extra.notes || "On the queue.") + "</p>" +
        (extra.id ? "<p class=\"sub\"><a href=\"/desk?job=" + encodeURIComponent(extra.id) + "\">Open on the queue</a> · Copy, text, or email it. Desk does not send.</p>" : "<p class=\"sub\">Draft only. You still tap Yes or Stop.</p>");
    } else {
      div.innerHTML = "<span>" + (from === "you" ? "You" : "AIA") + "</span> " + esc(text);
    }
    box.appendChild(div);
    try { box.scrollTop = box.scrollHeight; } catch (e) {}
  }
  function fillForm(job) {
    if (!job) return;
    var title = document.getElementById("title");
    var note = document.getElementById("note");
    var tell = document.getElementById("tell") || document.getElementById("agent-tell");
    if (title && job.title) title.value = job.title;
    if (note && (job.notes || job.draft)) note.value = job.notes || job.draft;
    if (tell && job.draft) tell.value = job.draft;
  }
  function paintJob(job, reply) {
    if (!job) return;
    addLine("desk", reply || job.next || ("On the queue as “" + job.title + "”. You tap Yes or Stop."));
    addLine("card", job.draft || job.next || job.title, job);
    fillForm(job);
    window.__aiaLastDrop = job;
  }
  async function tell(text) {
    var raw = String(text || "").trim();
    if (!raw) { addLine("desk", "Say anything. AIA writes the card here."); return; }
    if (/^(stop|kill|send money|pay them|bind|wire it)\b/i.test(raw)) {
      addLine("you", raw);
      addLine("desk", "Chat does not Send, Stop, pay, or bind. Open the card on the queue if the owner needs to tap.");
      return;
    }
    addLine("you", raw);
    var on = desk();
    if (!on.slug) {
      var local = localDraft(raw);
      addLine("desk", "Pick a world desk at the top first. Here is the card AIA would write.");
      addLine("card", local.draft, local);
      fillForm(local);
      var q = document.getElementById("public-desk-q");
      if (q) q.focus();
      return;
    }
    try {
      var r = await fetch("/api/intake", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ action: "do", text: raw, source: "drop-chat" })
      });
      var out = await r.json().catch(function () { return {}; });
      if (r.ok && out.job) {
        var msg = "";
        if (out.intake && out.intake.messages && out.intake.messages.length) {
          var last = out.intake.messages[out.intake.messages.length - 1];
          if (last && last.from === "desk") msg = last.text;
        }
        paintJob(out.job, msg);
        return;
      }
      if (r.status === 404 || r.status === 401) {
        var draft = localDraft(raw);
        addLine("desk", out.error || "That desk needs a code on this phone, or pick another world desk. AIA still wrote a draft card here.");
        addLine("card", draft.draft, draft);
        fillForm(draft);
        return;
      }
      var fallback = localDraft(raw);
      addLine("desk", out.error || "Desk kept the words. Card is a local draft until the queue takes it.");
      addLine("card", fallback.draft, fallback);
      fillForm(fallback);
    } catch (e) {
      var hold = localDraft(raw);
      addLine("desk", "Could not reach the desk. Card stayed in this chat.");
      addLine("card", hold.draft, hold);
      fillForm(hold);
    }
  }
  function hook() {
    ensureThread();
    var typeEl = document.getElementById("talkType");
    var btn = document.getElementById("talkTypeBtn");
    function go() {
      var text = typeEl ? String(typeEl.value || "").trim() : "";
      if (!text) { addLine("desk", "Type the work. AIA answers and writes the card in this chat."); return; }
      if (typeEl) typeEl.value = "";
      tell(text);
    }
    if (btn && !btn.getAttribute("data-aia-chat")) {
      btn.setAttribute("data-aia-chat", "1");
      btn.textContent = "Tell the desk";
      btn.addEventListener("click", function (e) { e.preventDefault(); go(); });
    }
    if (typeEl && !typeEl.getAttribute("data-aia-chat")) {
      typeEl.setAttribute("data-aia-chat", "1");
      typeEl.setAttribute("placeholder", "Say anything. AIA writes the card.");
      typeEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); }
      });
    }
    if (window.AIADropTalk && AIADropTalk.fill && !AIADropTalk.fill.__chat) {
      var orig = AIADropTalk.fill;
      function wrapped(heard) {
        var text = String(heard || "").trim();
        if (!text) return orig(heard);
        if (/^(drop it|send it|go ahead)$/i.test(text) && window.__aiaLastDrop) {
          addLine("desk", "That card is already on the queue. Open it to Copy, Text, Email, or Stop.");
          return;
        }
        tell(text);
      }
      wrapped.__chat = true;
      AIADropTalk.fill = wrapped;
    }
  }
  function greet() {
    var on = desk();
    var box = document.getElementById("drop-thread");
    if (!box || box.getAttribute("data-greeted")) return;
    box.setAttribute("data-greeted", "1");
    addLine("desk", on.slug
      ? ("This is " + (on.name || on.slug) + ". Say anything. AIA writes a card in this chat. You still tap Yes or Stop.")
      : "Pick a world desk at the top, or say the work. AIA still answers.");
  }
  function boot() {
    if (!document.getElementById("drop-title")) return;
    if (document.body.classList.contains("embed") || window !== window.parent) return;
    hook();
    greet();
    window.AIADropChat = { tell: tell, localDraft: localDraft };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
