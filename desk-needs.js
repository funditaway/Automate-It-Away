/* Need-based card taps + orange Cap across desks on this phone. */
(function () {
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
    });
  }
  function val(j, key) {
    if (!j) return "";
    const custom = j.custom && typeof j.custom === "object" ? j.custom : {};
    return j[key] || custom[key] || "";
  }
  function cardNeeds(j, staff) {
    const actions = [];
    const missing = [];
    if (!j) return { line: "", actions: actions, missing: missing, decide: false, priority: false };
    if (Array.isArray(j.needs) && j.needs.length && typeof j.needs[0] === "object") {
      const actions = j.needs.slice();
      const decide = !!j.decide;
      if (decide && !staff && !actions.some(function (a) { return a && a.id === "kill"; })) {
        actions.push({ id: "kill", label: "Kill" });
      }
      return { line: j.needLine || j.next || "", actions: actions, missing: j.missing || [], decide: decide, priority: !!(j.priority || j.cap) };
    }
    const st = String(j.status || "");
    const done = st === "shipped" || st === "killed";
    const outDesk = st === "out" || j.offDesk || j.awaiting === "writeback";
    const waitInfo = j.waitingOn === "info" || /Need .+ before/i.test(String(j.why || ""));
    const decide = !done && !j.carried && !waitInfo && (st === "waiting" || st === "held");
    const priority = !!(j.priority || j.cap) && !done;
    const phone = String(val(j, "phone") || "").trim();
    const outcome = String(j.outcome || val(j, "outcome") || "").toLowerCase();
    const kind = String(j.kind || "").toLowerCase();
    const when = String(j.timing || j.when || val(j, "when") || "").trim();
    if ((outcome === "call" || kind === "call" || outcome === "text" || kind === "message") && !phone) missing.push("phone");
    if ((outcome === "book" || /school|reminder|pickup|ride|delivery/.test(kind)) && !when) missing.push("when");
    if ((kind === "list" || outcome === "list") && !j.photoUrl && !(j.files && j.files.length)) missing.push("photo");
    function add(id, label, extra) {
      if (actions.some(function (a) { return a.id === id; })) return;
      actions.push(Object.assign({ id: id, label: label }, extra || {}));
    }
    if (!done) add("open", "Open");
    if (outDesk) { add("done", "Done off desk"); add("handback", "Needs a hand"); }
    else if (missing.length) { add("fill", "Add " + missing[0]); add("ask", "Ask for more"); }
    else if (decide) { add("yes", "Yes"); if (!staff) { add("stop", "Stop"); add("kill", "Kill"); } }
    if (j.draft && !missing.length) add("copy", "Copy draft");
    if (phone || j.draft) add("text", "Text");
    if (val(j, "email") || j.draft) add("email", "Email");
    if (phone && (outcome === "call" || kind === "call")) add("call", "Call", { href: "tel:" + phone.replace(/[^\d+]/g, "") });
    if (!j.draft && !done) add("grok", askGrokLabel(j));
    if (!done) add(priority ? "uncap" : "cap", priority ? "Off the cap" : "Cap");
    const line = outDesk ? "Off the desk. Confirm done, or tap Needs a hand." : (missing.length ? "Need " + missing[0] + " before this can go." : (j.needLine || j.next || (decide ? "Ready. Yes / Stop / Kill stay human." : (priority ? "On the cap. Do this first." : "Do the next thing this card needs."))));
    return { line: line, actions: actions, missing: missing, decide: decide, priority: priority, outDesk: outDesk };
  }
  function clipFace(s, n) {
    const t = String(s || "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    const max = n || 72;
    if (t.length <= max) return t;
    return t.slice(0, max).replace(/\s+\S*$/, "").replace(/[.,;:]+$/, "") + "…";
  }
  function boundAi(j) {
    if (j && j.deskAi && j.deskAi.name) return j.deskAi;
    if (j && j.agentDraft && j.agentDraft.deskAi && (j.agentDraft.name || j.agentDraft.crew)) {
      return {
        name: j.agentDraft.name || j.agentDraft.crew,
        role: j.agentDraft.crew || j.agentDraft.role,
        does: j.agentDraft.does,
        prompt: j.agentDraft.prompt
      };
    }
    return null;
  }
  function primaryAi() {
    const api = window.AIADeskAis;
    if (!api) return null;
    if (typeof api.primary === "function") return api.primary();
    return (api.rows && api.rows[0]) || null;
  }
  function deskAis() {
    const api = window.AIADeskAis;
    const rows = (api && Array.isArray(api.rows) ? api.rows : []) || [];
    return rows.filter(function (a) { return a && (a.name || a.id); });
  }
  function isOwnerSeat() {
    if (window.AIADeskAis && window.AIADeskAis.owner === true) return true;
    if (window.AIADeskAis && window.AIADeskAis.owner === false) return false;
    try { return localStorage.getItem("aia_role") === "owner"; } catch (e) { return false; }
  }
  function thenWho(j) {
    const ai = boundAi(j);
    return ai && ai.name ? String(ai.name) : "";
  }
  function thenGone(j) {
    const g = j && j.thenAiGone;
    const name = g && (g.name || g.id) || "";
    return String(name || "").trim();
  }
  function goneHoldLabel(gone) {
    const name = String(gone || "").trim();
    return name ? (name + " · not on this desk") : "";
  }
  function namedNeedsWho(j) {
    const who = thenWho(j);
    if (who) return who;
    return goneHoldLabel(thenGone(j));
  }
  function thenDoes(j) {
    const ai = boundAi(j);
    return clipFace((ai && (ai.does || ai.prompt)) || "", 72);
  }
  function thenPrompt(j) {
    const ai = boundAi(j);
    const prompt = clipFace((ai && ai.prompt) || "", 72);
    const does = clipFace((ai && ai.does) || "", 72);
    if (!prompt || prompt === does) return "";
    return prompt;
  }
  function namedAskWho(j) {
    const who = thenWho(j);
    if (who) return who;
    if (thenGone(j)) return "";
    return (primaryAi() && primaryAi().name) || "";
  }
  function askGrokLabel(j) {
    const who = thenWho(j);
    const hold = goneHoldLabel(thenGone(j));
    if (who) return "Ask Grok · " + who;
    if (hold) return "Ask Grok · " + hold;
    const primary = namedAskWho(j);
    return primary ? ("Ask Grok · " + primary) : "Ask Grok";
  }
  function jobOf(id) {
    try {
      if (typeof jobBy === "function") {
        const found = jobBy(id);
        if (found) return found;
      }
    } catch (e) {}
    try {
      if (typeof JOBS !== "undefined" && Array.isArray(JOBS)) {
        for (let i = 0; i < JOBS.length; i++) {
          if (JOBS[i] && JOBS[i].id === id) return JOBS[i];
        }
      }
    } catch (e) {}
    return null;
  }
  function filesOf(j) {
    const out = [];
    const seen = {};
    function add(f) {
      if (!f) return;
      const url = typeof f === "string" ? f : (f.url || "");
      if (!url || seen[url]) return;
      seen[url] = true;
      const kind = (typeof f === "object" && (f.kind || f.type)) || "";
      out.push({
        url: url,
        name: (typeof f === "object" && f.name) || (url === (j && j.photoUrl) ? "Photo" : "File"),
        kind: kind || (url === (j && j.photoUrl) ? "photo" : "file")
      });
    }
    if (j && j.photoUrl) add({ url: j.photoUrl, name: "Photo", kind: "photo" });
    (j && Array.isArray(j.files) ? j.files : []).forEach(add);
    return out;
  }
  function isNeedsYou(j, need) {
    if (!j) return false;
    const st = String(j.status || "");
    if (st === "shipped" || st === "killed") return false;
    const wait = String(j.waitingOn || "").toLowerCase();
    if (wait === "owner" || wait === "person" || wait === "info" || wait === "helper") return true;
    if (st === "exception" || st === "held") return true;
    if (need && need.decide) return true;
    return false;
  }
  function isAskHuman(j, need) {
    if (!j) return false;
    if (String(j.waitingOn || "").toLowerCase() === "info") return true;
    if (need && need.missing && need.missing.length) return true;
    if (/Need .+ before/i.test(String(j.why || ""))) return true;
    return false;
  }
  function cardId(j) {
    return String((j && j.id) || "").replace(/[^a-zA-Z0-9_-]/g, "");
  }
  function lastOfKind(j, kind) {
    const rows = (j && Array.isArray(j.thread) ? j.thread : []).filter(function (t) {
      return t && t.text && String(t.kind || "") === kind;
    });
    return rows.length ? rows[rows.length - 1] : null;
  }
  function isPromptReply(j, need) {
    if (!j) return false;
    const st = String(j.status || "");
    if (st === "shipped" || st === "killed" || st === "out" || j.offDesk) return false;
    if (isAskHuman(j, need)) return true;
    const wait = String(j.waitingOn || "").toLowerCase();
    if (wait === "info" || wait === "helper") return true;
    if ((j.deskAi || thenGone(j)) && (wait === "person" || wait === "owner" || wait === "helper" || !wait)) return true;
    if (lastOfKind(j, "ask")) return true;
    return false;
  }
  function promptQuestion(j, need) {
    if (!j) return "The desk asked. Reply on this card.";
    if (isAskHuman(j, need)) {
      const miss = (need && need.line) || j.why || j.next || "";
      if (miss) return miss;
    }
    const asked = lastOfKind(j, "ask");
    if (asked && asked.text) return asked.text;
    if (j.why && !/HOLD/i.test(String(j.why)) && !/^Captured\.?$/i.test(String(j.why).trim())) return j.why;
    if (j.deskAi || thenGone(j)) {
      const who = thenWho(j);
      const hold = goneHoldLabel(thenGone(j));
      if (who) return who + " asked on this card. Type a reply. Nothing sent alone.";
      if (hold) return hold + ". Type a reply. Nothing sent alone.";
      return "The desk AI asked on this card. Type a reply. Nothing sent alone.";
    }
    return "Reply on this card. Nothing sent alone.";
  }
  function lastReply(j) {
    if (j && Array.isArray(j.replies) && j.replies.length) return j.replies[j.replies.length - 1];
    return lastOfKind(j, "reply");
  }
  function talkTurns(j) {
    const rows = [];
    const seen = {};
    function add(kind, from, text, at) {
      const t = String(text || "").replace(/\s+/g, " ").trim();
      if (!t) return;
      const key = String(kind || "") + "|" + t;
      if (seen[key]) return;
      seen[key] = true;
      rows.push({ kind: kind, from: from || "", text: t, at: at || "" });
    }
    (j && Array.isArray(j.thread) ? j.thread : []).forEach(function (t) {
      if (!t || !t.text) return;
      const k = String(t.kind || "note");
      if (k !== "ask" && k !== "reply" && k !== "rec") return;
      add(k, t.from, t.text, t.at);
    });
    (j && Array.isArray(j.replies) ? j.replies : []).forEach(function (r) {
      if (!r) return;
      add("reply", r.from || "You", r.text, r.at);
    });
    const draft = String((j && (j.draft || (j.agentDraft && j.agentDraft.text))) || "").replace(/\s+/g, " ").trim();
    return rows.filter(function (row) {
      if (row.kind !== "rec") return true;
      if (draft && row.text === draft) return false;
      return true;
    });
  }
  function talkLabel(row, who, gone) {
    if (row.kind === "reply") return (row.from || "You") + " · you";
    if (who) return row.kind === "ask" ? (who + " · asks") : (who + " · Then draft");
    const hold = goneHoldLabel(gone);
    if (hold) return hold;
    const name = row.from || "Desk AI";
    return row.kind === "ask" ? (name + " · asks") : (name + " · Then draft");
  }
  function talkHtml(j) {
    const rows = talkTurns(j);
    if (!rows.length) return "";
    const who = thenWho(j);
    const gone = thenGone(j);
    return "<div class=\"q-talk\">" + rows.map(function (row) {
      const ai = row.kind === "ask" || row.kind === "rec";
      return "<div class=\"q-turn " + (ai ? "q-turn-ai" : "q-turn-you") + "\">" +
        "<div class=\"q-turn-who\">" + esc(talkLabel(row, who, gone)) + "</div>" +
        "<div class=\"q-turn-text\">" + esc(row.text) + "</div></div>";
    }).join("") + "</div>";
  }
  function bindAiHtml(j, where) {
    const ais = deskAis();
    if (!ais.length || !isOwnerSeat()) return "";
    const id = cardId(j);
    if (!id) return "";
    const slot = String(where || "queue").replace(/[^a-z]/g, "") || "queue";
    const fid = "q-ai-" + slot + "-" + id;
    const who = thenWho(j);
    const gone = thenGone(j);
    const hold = !!(gone && !who);
    const curId = (j && j.deskAi && (j.deskAi.id || j.deskAi.name)) || who || "";
    const holdOpt = hold
      ? "<option value=\"\" selected>" + esc(goneHoldLabel(gone)) + "</option>"
      : "";
    const opts = ais.map(function (a) {
      const value = a.id || a.name || "";
      const sel = !hold && curId && (value === curId || a.name === curId || (j.deskAi && j.deskAi.id && a.id === j.deskAi.id)) ? " selected" : "";
      return "<option value=\"" + esc(value) + "\"" + sel + ">" + esc(a.name || "Desk AI") + "</option>";
    }).join("");
    return "<div class=\"q-bind\">" +
      "<label class=\"q-bind-lab\" for=\"" + fid + "\">Desk AI on this card</label>" +
      "<select id=\"" + fid + "\" class=\"q-ai-pick\" onchange=\"bindAiOnCard('" + id + "', this.value)\">" +
      holdOpt + opts +
      "</select>" +
      "<p class=\"q-bind-hold\">" + (hold
        ? "Gone bind HOLDs. Pick a desk AI already on this desk to clear. Yes / Stop / Kill stay human. Nothing sent alone."
        : "Picks who owns Then / Needs you on this card. Yes / Stop / Kill stay human. Nothing sent alone.") + "</p>" +
      "</div>";
  }
  function promptSurface(where) {
    const w = String(where || "queue").toLowerCase();
    if (w === "cap" || w === "sheet" || w === "read" || w === "queue") return w;
    return "queue";
  }
  function promptHtml(j, need, where) {
    if (!isPromptReply(j, need)) return "";
    const id = cardId(j);
    if (!id) return "";
    const surface = promptSurface(where);
    const send = surface !== "read";
    const who = thenWho(j);
    const named = namedNeedsWho(j);
    const label = isAskHuman(j, need)
      ? "Ask the human"
      : (who ? (who + " asks") : (named || "Needs you"));
    const q = promptQuestion(j, need);
    const stacked = talkTurns(j).some(function (row) { return row.kind === "reply"; });
    const reply = lastReply(j);
    const replyLine = (!stacked && reply)
      ? "<p class=\"q-reply-was\">" + esc((reply.from || "You") + " · " + (reply.text || "")) + "</p>"
      : "";
    const boxId = "q-reply-" + surface + "-" + id;
    const sendHtml = send
      ? ("<label class=\"q-prompt-lab\" for=\"" + boxId + "\">Reply on this card</label>" +
        "<textarea id=\"" + boxId + "\" class=\"q-reply-box\" rows=\"2\" placeholder=\"Type the answer here\"></textarea>" +
        "<div class=\"row actions tap-opts q-prompt-go\">" +
          "<button class=\"go q-reply-tap\" type=\"button\" onclick=\"replyOnCard('" + id + "','" + surface + "')\">Reply</button>" +
        "</div>")
      : "";
    return "<div class=\"q-prompt\">" +
      "<div class=\"q-prompt-who\">" + esc(label) + "</div>" +
      "<p class=\"q-prompt-q\">" + esc(q) + "</p>" +
      replyLine +
      sendHtml +
      "<p class=\"q-prompt-hold\">Reply stays on the card. Nothing sent alone.</p>" +
      "</div>";
  }
  function honestNext(j, need) {
    let line = String((need && need.line) || (j && j.next) || "").trim();
    if (!line) line = (need && need.decide) ? "Ready. Yes / Stop / Kill stay human." : "Do the next thing this card needs.";
    if (!/HOLD/i.test(line) && !/nothing sent/i.test(line)) {
      line = line.replace(/\.\s*$/, "") + ". HOLD. Nothing sent alone.";
    } else if (!/nothing sent/i.test(line)) {
      line = line.replace(/\.\s*$/, "") + ". Nothing sent alone.";
    }
    return line;
  }
  function filesHtml(j) {
    const files = filesOf(j);
    if (!files.length) return "";
    return "<div class=\"q-files\">" + files.map(function (f) {
      const image = /image\//i.test(f.kind) || f.kind === "photo" || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(f.url);
      if (image) return "<img class=\"thumb\" src=\"" + esc(f.url) + "\" alt=\"\">";
      return "<a class=\"q-file edit\" href=\"" + esc(f.url) + "\">" + esc(f.name || "File") + "</a>";
    }).join("") + "</div>";
  }
  function thenDraftHtml(j) {
    const text = (j && (j.draft || (j.agentDraft && j.agentDraft.text))) || "";
    if (!text) return "";
    const who = thenWho(j);
    const does = thenDoes(j);
    const prompt = thenPrompt(j);
    const gone = thenGone(j);
    const hold = goneHoldLabel(gone);
    const label = who ? (who + " · Then draft") : (hold || "Draft");
    const chips = [];
    if (who) chips.push("<span class=\"q-chip q-ai\">" + esc(who) + "</span>");
    if (hold && !who) chips.push("<span class=\"q-chip q-ai-gone\">" + esc(hold) + "</span>");
    if (does) chips.push("<span class=\"q-chip q-ai-does\">" + esc(does) + "</span>");
    if (prompt) chips.push("<span class=\"q-chip q-ai-prompt\">" + esc(prompt) + "</span>");
    return "<div class=\"draft q-then\">" +
      "<div class=\"q-then-who\">" + esc(label) + "</div>" +
      (chips.length ? "<div class=\"q-then-face\">" + chips.join(" ") + "</div>" : "") +
      "<div class=\"q-then-text\">" + esc(text) + "</div></div>";
  }
  function chipsHtml(j, need, status) {
    const bits = [];
    if (need && need.priority) bits.push("<span class=\"cap-mark\">Cap</span>");
    const who = thenWho(j);
    const gone = thenGone(j);
    if (who) bits.push("<span class=\"q-chip q-ai\">" + esc(who) + "</span>");
    if (gone && !who) bits.push("<span class=\"q-chip q-ai-gone\">" + esc(goneHoldLabel(gone)) + "</span>");
    if (isNeedsYou(j, need)) {
      const named = namedNeedsWho(j);
      const needWho = who ? (who + " · Needs you") : (named || "Needs you");
      bits.push("<span class=\"q-chip q-need\">" + esc(needWho) + "</span>");
    }
    if (isAskHuman(j, need)) bits.push("<span class=\"q-chip q-ask\">Ask the human</span>");
    if (need && need.decide) bits.push("<span class=\"q-chip q-hitl-mark\">Yes / Stop / Kill</span>");
    const fanTotal = j && j.custom && Number(j.custom.dropTotal);
    if (fanTotal > 1) {
      const n = Number(j.custom.dropIndex) || 0;
      bits.push("<span class=\"q-chip q-fan\">" + esc((n ? n + " of " + fanTotal : fanTotal + " cards") + " from this Drop") + "</span>");
    }
    if (status) bits.push("<span class=\"q-chip q-stat\">" + esc(status) + "</span>");
    return bits.length ? "<div class=\"q-chips\">" + bits.join(" ") + "</div>" : "";
  }
  function smsOf(j) {
    const draft = (j && (j.draft || j.title)) || "";
    if (typeof smsHref === "function") return smsHref(draft);
    return "sms:?&body=" + encodeURIComponent(draft);
  }
  function mailOf(j) {
    const draft = (j && (j.draft || j.title)) || "";
    if (typeof mailHref === "function") return mailHref(j.title, draft);
    return "mailto:?subject=" + encodeURIComponent((j && j.title) || "Desk draft") + "&body=" + encodeURIComponent(draft);
  }
  function paintAction(j, a, money) {
    if (a.id === "text") return "<a class=\"edit\" href=\"" + smsOf(j) + "\">" + a.label + "</a>";
    if (a.id === "email") return "<a class=\"edit\" href=\"" + mailOf(j) + "\">" + a.label + "</a>";
    if (a.id === "call") return "<a class=\"edit\" href=\"" + (a.href || "#") + "\">" + a.label + "</a>";
    if (a.id === "yes") return "<button class=\"go q-yes\" type=\"button\" onclick=\"ship('" + j.id + "', " + money + ")\">Yes</button>";
    if (a.id === "stop") return "<button class=\"kill q-stop\" type=\"button\" onclick=\"kill('" + j.id + "', '" + String(j.title || "").replace(/'/g, "") + "')\">Stop</button>";
    if (a.id === "kill") return "<button class=\"kill q-kill\" type=\"button\" onclick=\"kill('" + j.id + "', '" + String(j.title || "").replace(/'/g, "") + "')\">Kill</button>";
    if (a.id === "copy") return "<button class=\"edit\" type=\"button\" onclick=\"copyDraft('" + j.id + "')\">Copy draft</button>";
    if (a.id === "grok") return "<button class=\"edit\" type=\"button\" onclick=\"(typeof helpWithAi==='function'&&helpWithAi('" + j.id + "'))\">" + esc(a.label || "Ask Grok") + "</button>";
    if (a.id === "cap") return "<button class=\"go cap-tap\" type=\"button\" onclick=\"pinCap('" + j.id + "', true)\">Cap</button>";
    if (a.id === "uncap") return "<button class=\"edit\" type=\"button\" onclick=\"pinCap('" + j.id + "', false)\">Off the cap</button>";
    if (a.id === "fill" || a.id === "ask" || a.id === "hand") return "<button class=\"edit\" type=\"button\" onclick=\"openJob('" + j.id + "')\">" + a.label + "</button>";
    if (a.id === "handback") return "<button class=\"edit\" type=\"button\" onclick=\"(typeof needHand==='function'&&needHand('" + j.id + "'))\">Needs a hand</button>";
    if (a.id === "done") return "<button class=\"go\" type=\"button\" onclick=\"(typeof carryJob==='function'&&carryJob('" + j.id + "'))\">Done</button>";
    return "";
  }
  function cardActionHtml(j, staff, where) {
    const need = cardNeeds(j, staff);
    const money = Number(j.amount || j.ask || 0);
    const hitl = [];
    const rest = [];
    if (where === "queue") rest.push("<button class=\"edit\" type=\"button\" onclick=\"openJob('" + j.id + "')\">Open</button>");
    need.actions.slice(0, where === "queue" ? 8 : 10).forEach(function (a) {
      if (where === "queue" && a.id === "open") return;
      const bit = paintAction(j, a, money);
      if (!bit) return;
      if (a.id === "yes" || a.id === "stop" || a.id === "kill") hitl.push(bit);
      else rest.push(bit);
    });
    return (hitl.length ? "<div class=\"row actions tap-opts q-hitl\">" + hitl.join("") + "</div>" : "") +
      "<div class=\"row actions tap-opts\">" + rest.join("") + "</div>";
  }
  function cardRoot(id, where) {
    const safe = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const surface = promptSurface(where);
    if (surface === "cap") {
      const cap = document.getElementById("cap-list");
      if (cap && cap.querySelector) {
        const hit = cap.querySelector('[data-job="' + safe + '"]');
        if (hit) return hit;
      }
    }
    if (surface === "sheet") {
      const sheet = document.getElementById("sheet-card");
      if (sheet) return sheet;
    }
    const queue = document.getElementById("queue");
    if (queue && queue.querySelector) {
      const hit = queue.querySelector('[data-job="' + safe + '"]');
      if (hit) return hit;
    }
    const sheet = document.getElementById("sheet-card");
    if (sheet) return sheet;
    return document.getElementById("q-reply-" + surface + "-" + safe)
      || document.getElementById("q-reply-" + safe);
  }
  function setCardBusy(id, on, where) {
    const root = cardRoot(id, where);
    if (!root || !root.classList) return;
    root.classList.toggle("q-pending", !!on);
    if (root.setAttribute) root.setAttribute("aria-busy", on ? "true" : "false");
    let line = root.querySelector ? root.querySelector(".q-busy") : null;
    if (on) {
      if (!line && root.appendChild) {
        line = document.createElement("p");
        line.className = "q-busy meta";
        line.textContent = "Working. Nothing sent yet.";
        const next = root.querySelector && root.querySelector(".next-line, .q-prompt-hold, .sheet-decide");
        if (next && next.parentNode) next.parentNode.insertBefore(line, next);
        else root.appendChild(line);
      }
      if (root.querySelectorAll) {
        root.querySelectorAll(".q-yes, .q-stop, .q-kill, .q-reply-tap").forEach(function (el) { el.disabled = true; });
      }
    } else {
      if (line && line.remove) line.remove();
      if (root.querySelectorAll) {
        root.querySelectorAll(".q-yes, .q-stop, .q-kill, .q-reply-tap").forEach(function (el) { el.disabled = false; });
      }
    }
  }
  async function replyOnCard(id, where) {
    const banner = document.getElementById("banner");
    const safe = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const surface = promptSurface(where);
    const root = cardRoot(safe, surface);
    const box = (root && root.querySelector && root.querySelector(".q-reply-box"))
      || document.getElementById("q-reply-" + surface + "-" + safe)
      || document.getElementById("q-reply-" + safe)
      || document.getElementById("job-note");
    const text = box && box.value ? String(box.value).trim() : "";
    if (!text) {
      if (banner) banner.textContent = "Type a reply on the card.";
      return;
    }
    if (typeof api !== "function") return;
    setCardBusy(safe, true, surface);
    try {
      const out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "reply", id: safe, text: text, whoTapped: (typeof youName !== "undefined" && youName) || "desk" }) });
      const line = out.status >= 400
        ? ((out.data && out.data.error) || "Could not save that reply.")
        : "Reply is on the card. Nothing sent.";
      if (typeof load === "function") await load();
      if (banner) banner.textContent = line;
    } finally {
      setCardBusy(safe, false, surface);
    }
  }
  async function helpWithAi(id) {
    const banner = document.getElementById("banner");
    if (typeof api !== "function") return;
    const out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "recommend", id: id, whoTapped: (typeof youName !== "undefined" && youName) || "desk" }) });
    const job = (out.data && out.data.job) || jobOf(id) || { id: id };
    const gone = thenGone(job);
    const who = namedAskWho(job);
    const line = out.status >= 400
      ? ((out.data && out.data.error) || "Could not draft help.")
      : (gone && !who
        ? (goneHoldLabel(gone) + ". HOLD ask. Nothing sent.")
        : ((who ? (who + " drafted on the card.") : "Grok drafted on the card.") + " Nothing sent."));
    if (typeof load === "function") await load();
    if (banner) banner.textContent = line;
    if (typeof openJob === "function") openJob(id);
  }
  async function bindAiOnCard(id, ai) {
    const banner = document.getElementById("banner");
    const safe = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const who = String(ai || "").trim();
    if (!safe || !who) {
      if (banner) banner.textContent = "Pick a desk AI already on this desk.";
      return;
    }
    if (typeof api !== "function") return;
    const out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "bind-ai", id: safe, ai: who, whoTapped: (typeof youName !== "undefined" && youName) || "desk" }) });
    const name = (out.data && out.data.job && out.data.job.deskAi && out.data.job.deskAi.name) || who;
    const line = out.status >= 400
      ? ((out.data && out.data.error) || "Could not set that desk AI.")
      : (name + " owns Then / Needs you on this card. Nothing sent.");
    if (typeof load === "function") await load();
    if (banner) banner.textContent = line;
  }
  async function pinCap(id, on) {
    const banner = document.getElementById("banner");
    if (typeof api !== "function") return;
    const out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "priority", id: id, on: on !== false, whoTapped: (typeof youName !== "undefined" && youName) || "desk" }) });
    if (banner) banner.textContent = out.status >= 400 ? ((out.data && out.data.error) || "Could not move that on the cap.") : (on !== false ? "On the cap. Orange. Top of the pyramid." : "Off the cap.");
    if (typeof load === "function") await load();
    loadCap();
  }
  async function openCapDesk(slug, id) {
    const found = window.AIADesks && AIADesks.find ? AIADesks.find(slug) : null;
    if (found && found.pin) {
      localStorage.setItem("aia_ws", found.slug);
      localStorage.setItem("aia_pin", found.pin);
      const ws = document.getElementById("ws");
      const pin = document.getElementById("pin");
      if (ws) ws.value = found.slug;
      if (pin) pin.value = found.pin;
      if (typeof load === "function") await load();
      if (id && typeof openJob === "function") openJob(id);
      return;
    }
    window.location.href = "/desks";
  }
  function capCardHtml(j, here) {
    const other = (j.slug || j.workspace) && (j.slug || j.workspace) !== here;
    const need = cardNeeds(j, false);
    need.priority = true;
    const line = honestNext(j, { line: (need && need.line) || j.next || "On the cap.", decide: need.decide, priority: true });
    const draft = thenDraftHtml(j);
    const talks = talkHtml(j);
    const prompt = promptHtml(j, need, other ? "read" : "cap");
    const stacked = !!(talks && (draft || prompt));
    const thread = stacked ? "<div class=\"q-thread\">" + draft + talks + prompt + "</div>" : (draft + talks + prompt);
    const bind = other ? "" : bindAiHtml(j, "cap");
    return "<article class=\"item q-card cap-card\" data-job=\"" + esc(j.id || "") + "\"><div class=\"q-head\">" + chipsHtml(j, need, j.desk || j.slug || "") + "</div><h3>" + esc(j.title) + "</h3>" +
      filesHtml(j) + thread + bind +
      "<p class=\"next-line\">" + esc(line) + "</p>" +
      (other ? "<div class=\"row actions tap-opts\"><button class=\"go cap-tap\" type=\"button\" onclick=\"openCapDesk('" + String(j.slug || "").replace(/'/g, "") + "','" + String(j.id || "").replace(/'/g, "") + "')\">Open on " + esc(j.desk || j.slug || "that desk") + "</button></div>" : "<div class=\"row actions tap-opts\"><button class=\"edit\" type=\"button\" onclick=\"openJob('" + String(j.id || "").replace(/'/g, "") + "')\">Open</button></div>") +
      "</article>";
  }
  async function loadCap() {
    const band = document.getElementById("cap-band");
    const box = document.getElementById("cap-list");
    if (!band || !box || typeof api !== "function") return;
    const rows = (window.AIADesks && AIADesks.list) ? AIADesks.list() : [];
    const here = localStorage.getItem("aia_ws") || "";
    const pin = localStorage.getItem("aia_pin") || "";
    const desks = rows.filter(function (d) { return d && d.slug && d.pin && String(d.pin).length >= 4; });
    if (here && pin && !desks.some(function (d) { return d.slug === here; })) desks.unshift({ slug: here, pin: pin });
    if (!desks.length) { band.hidden = true; return; }
    try {
      const out = await api("/api/desks", { method: "POST", body: JSON.stringify({ action: "priority", desks: desks.slice(0, 32) }) });
      const items = (out.data && out.data.items) || [];
      if (!items.length) { band.hidden = true; box.innerHTML = ""; return; }
      band.hidden = false;
      box.innerHTML = items.map(function (j) {
        return capCardHtml(j, here);
      }).join("");
    } catch (e) { band.hidden = true; }
  }
  window.cardNeeds = cardNeeds;
  window.cardActionHtml = cardActionHtml;
  window.setCardBusy = setCardBusy;
  window.replyOnCard = replyOnCard;
  window.bindAiHtml = bindAiHtml;
  window.bindAiOnCard = bindAiOnCard;
  window.helpWithAi = helpWithAi;
  window.pinCap = pinCap;
  window.openCapDesk = openCapDesk;
  window.promptHtml = promptHtml;
  window.chipsHtml = chipsHtml;
  window.capCardHtml = capCardHtml;
  window.loadCap = loadCap;
  window.card = function (j, staff) {
    const need = cardNeeds(j, staff);
    const cap = !!need.priority;
    const why = (typeof visitorLine === "function" ? visitorLine(j.why) : (j.why || ""));
    const status = typeof labelStatus === "function" ? labelStatus(j.status) : (j.status || "");
    const line = honestNext(j, need);
    const draft = thenDraftHtml(j);
    const talks = talkHtml(j);
    const prompt = promptHtml(j, need);
    const bind = bindAiHtml(j, "queue");
    const stacked = !!(talks && (draft || prompt));
    const thread = stacked
      ? "<div class=\"q-thread\">" + draft + talks + prompt + "</div>"
      : (draft + talks + prompt);
    return "<article class=\"item q-card" + (cap ? " cap-card" : "") + "\" data-job=\"" + esc(j.id || "") + "\"><div class=\"q-head\">" + chipsHtml(j, need, status) + (j.assignee ? "<div class=\"meta q-assignee\">" + esc(j.assignee) + "</div>" : "") + "</div><h3>" + esc(j.title) + "</h3>" + filesHtml(j) + (why ? "<p class=\"q-why\">" + esc(why) + "</p>" : "") + thread + bind + "<p class=\"next-line\">" + esc(line) + "</p>" + cardActionHtml(j, staff, "queue") + "</article>";
  };
  function wrapLoad() {
    if (typeof window.load !== "function") { setTimeout(wrapLoad, 200); return; }
    if (window.load._aiaCap) return;
    const p = window.load;
    window.load = async function () {
      const out = await p.apply(this, arguments);
      try { await loadCap(); } catch (e) {}
      return out;
    };
    window.load._aiaCap = true;
  }
  function wrapHitl() {
    if (typeof window.ship !== "function" || typeof window.confirmKill !== "function") {
      setTimeout(wrapHitl, 200);
      return;
    }
    if (window.ship._aiaBusy) return;
    function wrap(name) {
      const prev = window[name];
      if (typeof prev !== "function") return;
      window[name] = async function (id) {
        const sheet = document.getElementById("sheet");
        const where = sheet && sheet.classList && sheet.classList.contains("on") ? "sheet" : undefined;
        setCardBusy(id, true, where);
        try { return await prev.apply(this, arguments); }
        finally { setCardBusy(id, false, where); }
      };
    }
    wrap("ship");
    wrap("confirmShip");
    wrap("confirmKill");
    window.ship._aiaBusy = true;
  }
  function injectCap() {
    if (!document.getElementById("cap-band")) {
      const queue = document.getElementById("queue");
      if (!queue) return;
      const band = document.createElement("div");
      band.id = "cap-band";
      band.className = "cap-band";
      band.hidden = true;
      band.innerHTML = "<h2>Cap · orange · every desk on this account</h2><div id=\"cap-list\"></div>";
      queue.parentNode.insertBefore(band, queue);
    }
    if (!document.getElementById("aia-cap-css")) {
      const css = document.createElement("style");
      css.id = "aia-cap-css";
      css.textContent = "#queue .q-card,#cap-list .q-card{border-radius:14px;padding:14px;margin:10px 0;box-shadow:var(--shadow)}" +
        "#queue .q-card h3,#cap-list .q-card h3{font-size:1.12rem;line-height:1.3;margin:8px 0 6px}" +
        ".q-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap}" +
        ".q-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}" +
        ".q-chip{display:inline-flex;align-items:center;min-height:28px;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.03em}" +
        ".q-need{background:var(--banner);color:var(--banner-ink)}" +
        ".q-ask{background:var(--edit);color:var(--edit-ink)}" +
        ".q-hitl-mark{background:var(--edit);color:var(--heading)}" +
        ".q-stat{background:var(--edit);color:var(--muted);font-weight:700}" +
        ".q-assignee{font-size:12px}" +
        ".q-why{color:var(--muted);font-size:14px;margin:4px 0 8px}" +
        ".q-then{background:var(--edit);border-radius:10px;padding:10px 12px;margin:8px 0}" +
        ".q-then-who{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--heading);margin:0 0 6px}" +
        ".q-then-face{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}" +
        ".q-ai{background:var(--teal,#119494);color:#fff}" +
        ".q-ai-gone{background:var(--banner);color:var(--banner-ink)}" +
        ".q-ai-does,.q-ai-prompt{background:var(--edit);color:var(--heading);font-weight:700;text-transform:none;letter-spacing:0;max-width:100%}" +
        ".q-then-text{font-size:14px;line-height:1.4;white-space:pre-wrap}" +
        ".q-files{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}" +
        ".q-files .thumb{max-width:min(160px,42vw);border-radius:10px}" +
        ".q-file{min-height:44px;padding:8px 12px;border-radius:10px;font-weight:700}" +
        ".q-prompt{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:8px 0}" +
        ".q-prompt-who{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--heading);margin:0 0 6px}" +
        ".q-prompt-q{font-size:15px;line-height:1.4;color:var(--heading);margin:0 0 8px}" +
        ".q-reply-was{font-size:13px;color:var(--muted);margin:0 0 8px;white-space:pre-wrap}" +
        ".q-prompt-lab{display:block;font-size:12px;font-weight:700;color:var(--heading);margin:0 0 4px}" +
        ".q-reply-box{width:100%;min-height:64px;padding:10px;border:1px solid var(--line);border-radius:10px;font:inherit;background:var(--bg);color:var(--ink)}" +
        ".q-prompt-go{margin-top:8px}" +
        ".q-reply-tap{min-height:44px;min-width:88px}" +
        ".q-prompt-hold{font-size:12px;color:var(--muted);margin:8px 0 0}" +
        ".q-thread{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px 10px;margin:8px 0}" +
        ".q-thread .q-then,.q-thread .q-prompt{margin:8px 0}" +
        ".q-talk{display:flex;flex-direction:column;gap:8px;margin:8px 0}" +
        ".q-turn{border-radius:10px;padding:8px 10px}" +
        ".q-turn-ai{background:var(--edit)}" +
        ".q-turn-you{background:var(--bg);border:1px solid var(--line)}" +
        ".q-turn-who{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--heading);margin:0 0 4px}" +
        ".q-turn-text{font-size:14px;line-height:1.4;white-space:pre-wrap}" +
        ".q-bind{margin:8px 0}" +
        ".q-bind-lab{display:block;font-size:12px;font-weight:700;color:var(--heading);margin:0 0 4px}" +
        ".q-ai-pick{width:100%;min-height:44px;padding:8px;border:1px solid var(--line);border-radius:8px;font:inherit;background:var(--bg);color:var(--ink)}" +
        ".q-bind-hold{font-size:12px;color:var(--muted);margin:6px 0 0}" +
        "#queue .next-line,#cap-list .next-line{font-size:14px;font-weight:700;color:var(--heading);margin:8px 0 10px}" +
        ".q-busy{font-size:12px;color:var(--muted);margin:6px 0}" +
        ".q-pending{opacity:.86}" +
        ".q-pending .q-yes,.q-pending .q-stop,.q-pending .q-kill,.q-pending .q-reply-tap{opacity:.55;pointer-events:none}" +
        ".q-hitl{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}" +

        ".q-hitl .go,.q-hitl .kill{min-height:48px;font-size:16px;width:100%}" +
        ".cap-card{border-left:4px solid var(--orange,#f39c12)}" +
        ".cap-mark{display:inline-flex;background:var(--orange,#f39c12);color:#0c1116;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border-radius:999px;padding:2px 8px}" +
        ".cap-band h2{font-size:13px;margin:8px 0 6px}" +
        ".cap-tap{background:var(--orange,#f39c12);color:#0c1116}" +
        "@media(max-width:420px){#queue .q-card,#cap-list .q-card{padding:14px 12px}.q-files .thumb{max-width:100%}.q-hitl{grid-template-columns:1fr 1fr 1fr}}";
      document.head.appendChild(css);
    }
    const filters = document.getElementById("queue-filters");
    if (filters && !filters.__aiaCap) {
      filters.addEventListener("click", function (e) {
        const btn = e.target.closest("[data-filter=\"cap\"]");
        if (!btn) return;
        const band = document.getElementById("cap-band");
        if (band && !band.hidden) band.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      filters.__aiaCap = true;
    }
  }
  wrapLoad();
  wrapHitl();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectCap);
  else injectCap();
})();
