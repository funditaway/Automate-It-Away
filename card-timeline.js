// Card timeline: what already happened on this card, oldest first.
// Read-only. Uses only fields the card already stores. Never makes up an event.
(function () {
  var AI_FROM = /^(grok|desk ai|desk-ai|then|worker|engine|agent)$/i;
  function clean(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
  function whenOf(at) {
    if (!at) return null;
    var d = new Date(at);
    return isNaN(d.getTime()) ? null : d;
  }
  function who(from) {
    var f = clean(from);
    if (!f || /^you$/i.test(f)) return "You";
    return f;
  }
  function aiName(card) {
    if (card && card.deskAi && card.deskAi.name) return clean(card.deskAi.name);
    if (card && card.agentDraft && (card.agentDraft.name || card.agentDraft.crew)) return clean(card.agentDraft.name || card.agentDraft.crew);
    return "";
  }
  function isAi(card, from) {
    var f = clean(from);
    if (!f) return false;
    if (AI_FROM.test(f)) return true;
    var n = aiName(card);
    return !!(n && n.toLowerCase() === f.toLowerCase());
  }
  function short(text) {
    var t = clean(text);
    return t.length > 60 ? t.slice(0, 57).replace(/\s+\S*$/, "") + "..." : t;
  }
  function madeLabel(from) {
    var f = clean(from).toLowerCase();
    if (!f || f === "drop" || f === "desk" || f === "desk-chat" || f === "you" || f === "onboard") return "You dropped this";
    if (f === "member") return "A member asked for this";
    if (f === "then") return "Made after a Yes on another card";
    return "Came in from " + clean(from);
  }
  function talkLabel(card, row) {
    var kind = String(row.kind || "note");
    var ai = isAi(card, row.from);
    var aiWho = aiName(card) || "Desk AI";
    if (kind === "rec") return (ai && aiName(card) ? aiWho : "Desk AI") + " drafted a reply";
    if (kind === "ask") return ai ? (aiWho + " asked a question") : (who(row.from) + " asked for more");
    if (kind === "reply") return who(row.from) + " replied";
    if (kind === "follow") return who(row.from) + " marked it done";
    if (kind === "tell") return who(row.from) + " told the desk";
    return (ai ? aiWho : who(row.from)) + " added a note";
  }
  var FLOW = {
    kill: "Stopped by a person (Kill). Nothing went out.",
    collect: "Started by a person. Marked sent.",
    handoff: "Handed off",
    follow: "Marked done"
  };
  function events(card) {
    var out = [];
    var seen = {};
    if (!card || typeof card !== "object") return out;
    function add(at, label, quote) {
      var d = whenOf(at);
      if (!d || !label) return;
      var key = label + "|" + (quote || "") + "|" + Math.floor(d.getTime() / 1000);
      if (seen[key]) return;
      seen[key] = true;
      out.push({ at: d, label: label, quote: quote || "", n: out.length });
    }
    var thread = Array.isArray(card.thread) ? card.thread : [];
    var replies = Array.isArray(card.replies) ? card.replies : [];
    var flow = Array.isArray(card.flow) ? card.flow : [];
    var hasRec = false;
    var hasFollowTalk = false;
    var talkReplies = {};
    add(card.createdAt, madeLabel(card.from));
    thread.forEach(function (t) {
      if (!t || !t.text) return;
      var kind = String(t.kind || "note");
      if (kind === "rec") hasRec = true;
      if (kind === "follow") hasFollowTalk = true;
      if (kind === "reply") talkReplies[clean(t.text)] = true;
      add(t.at, talkLabel(card, t), short(t.text));
    });
    replies.forEach(function (r) {
      if (!r || !r.text || talkReplies[clean(r.text)]) return;
      add(r.at, who(r.from) + " replied", short(r.text));
    });
    if (card.agentDraft && card.agentDraft.at) {
      add(card.agentDraft.at, (clean(card.agentDraft.name || card.agentDraft.crew) || "Desk AI") + " drafted a reply");
    }
    if (card.grokAt && !hasRec && !(card.agentDraft && card.agentDraft.at)) add(card.grokAt, "Desk AI drafted a reply");
    var flowFollow = false;
    flow.forEach(function (f) {
      if (!f || !FLOW[f.step]) return;
      if (f.step === "follow") {
        flowFollow = true;
        if (hasFollowTalk) return;
      }
      add(f.at, FLOW[f.step]);
    });
    if (card.doneAt && !flowFollow && !hasFollowTalk) add(card.doneAt, card.doneHow === "hand" ? "Marked done by hand" : "Marked done");
    if (card.priorityAt) add(card.priorityAt, "Put on the cap");
    out.sort(function (a, b) { return (a.at - b.at) || (a.n - b.n); });
    return out;
  }
  function timeLabel(d) {
    try {
      return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    } catch (e) {
      return d.toISOString().slice(0, 16).replace("T", " ");
    }
  }
  function build(card) {
    var box = document.createElement("div");
    box.className = "card-timeline";
    box.setAttribute("data-card-timeline", "");
    box.style.margin = "10px 0";
    var head = document.createElement("p");
    head.className = "meta";
    head.textContent = "What happened on this card";
    box.appendChild(head);
    var rows = events(card);
    if (!rows.length) {
      var none = document.createElement("p");
      none.className = "meta tl-none";
      none.textContent = "Nothing yet.";
      box.appendChild(none);
      return box;
    }
    var list = document.createElement("ol");
    list.className = "tl-list";
    list.style.listStyle = "none";
    list.style.margin = "0";
    list.style.padding = "0 0 0 10px";
    list.style.borderLeft = "2px solid var(--line)";
    rows.forEach(function (ev) {
      var li = document.createElement("li");
      li.className = "tl-row";
      li.style.margin = "0 0 6px";
      li.style.fontSize = "13px";
      var t = document.createElement("span");
      t.className = "meta tl-time";
      t.textContent = timeLabel(ev.at) + " · ";
      var label = document.createElement("span");
      label.className = "tl-label";
      label.textContent = ev.label;
      li.appendChild(t);
      li.appendChild(label);
      if (ev.quote) {
        var q = document.createElement("div");
        q.className = "meta tl-quote";
        q.textContent = ev.quote;
        li.appendChild(q);
      }
      list.appendChild(li);
    });
    box.appendChild(list);
    return box;
  }
  function mount(target, card) {
    var el = typeof target === "string" ? document.getElementById(target) : target;
    if (!el) return null;
    el.textContent = "";
    var box = build(card);
    el.appendChild(box);
    return box;
  }
  window.AIACardTimeline = { events: events, build: build, mount: mount };
})();
