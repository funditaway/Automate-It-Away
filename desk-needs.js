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
      return { line: j.needLine || j.next || "", actions: j.needs, missing: j.missing || [], decide: !!j.decide, priority: !!(j.priority || j.cap) };
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
    if (!j.draft && !done) add("grok", "Ask Grok");
    if (!done) add(priority ? "uncap" : "cap", priority ? "Off the cap" : "Cap");
    const line = outDesk ? "Off the desk. Confirm done, or tap Needs a hand." : (missing.length ? "Need " + missing[0] + " before this can go." : (j.needLine || j.next || (decide ? "Ready. Yes / Stop / Kill stay human." : (priority ? "On the cap. Do this first." : "Do the next thing this card needs."))));
    return { line: line, actions: actions, missing: missing, decide: decide, priority: priority, outDesk: outDesk };
  }
  function thenWho(j) {
    if (!j) return "";
    if (j.deskAi && j.deskAi.name) return String(j.deskAi.name);
    if (j.agentDraft && j.agentDraft.deskAi && (j.agentDraft.name || j.agentDraft.crew)) {
      return String(j.agentDraft.name || j.agentDraft.crew);
    }
    return "";
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
    if (j.deskAi && (wait === "person" || wait === "owner" || wait === "helper" || !wait)) return true;
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
    if (j.why && !/HOLD/i.test(String(j.why))) return j.why;
    if (j.deskAi) return "The desk AI asked on this card. Type a reply. Nothing sent alone.";
    return "Reply on this card. Nothing sent alone.";
  }
  function lastReply(j) {
    if (j && Array.isArray(j.replies) && j.replies.length) return j.replies[j.replies.length - 1];
    return lastOfKind(j, "reply");
  }
  function promptHtml(j, need) {
    if (!isPromptReply(j, need)) return "";
    const id = cardId(j);
    if (!id) return "";
    const who = thenWho(j);
    const label = isAskHuman(j, need)
      ? "Ask the human"
      : (who ? (who + " asks") : "Needs you");
    const q = promptQuestion(j, need);
    const reply = lastReply(j);
    const replyLine = reply
      ? "<p class=\"q-reply-was\">" + esc((reply.from || "You") + " · " + (reply.text || "")) + "</p>"
      : "";
    return "<div class=\"q-prompt\">" +
      "<div class=\"q-prompt-who\">" + esc(label) + "</div>" +
      "<p class=\"q-prompt-q\">" + esc(q) + "</p>" +
      replyLine +
      "<label class=\"q-prompt-lab\" for=\"q-reply-" + id + "\">Reply on this card</label>" +
      "<textarea id=\"q-reply-" + id + "\" class=\"q-reply-box\" rows=\"2\" placeholder=\"Type the answer here\"></textarea>" +
      "<div class=\"row actions tap-opts q-prompt-go\">" +
        "<button class=\"go q-reply-tap\" type=\"button\" onclick=\"replyOnCard('" + id + "')\">Reply</button>" +
      "</div>" +
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
    const label = who ? (who + " · Then draft") : "Draft";
    return "<div class=\"draft q-then\"><div class=\"q-then-who\">" + esc(label) + "</div><div class=\"q-then-text\">" + esc(text) + "</div></div>";
  }
  function chipsHtml(j, need, status) {
    const bits = [];
    if (need && need.priority) bits.push("<span class=\"cap-mark\">Cap</span>");
    if (isNeedsYou(j, need)) bits.push("<span class=\"q-chip q-need\">Needs you</span>");
    if (isAskHuman(j, need)) bits.push("<span class=\"q-chip q-ask\">Ask the human</span>");
    if (need && need.decide) bits.push("<span class=\"q-chip q-hitl-mark\">Yes / Stop / Kill</span>");
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
    if (a.id === "grok") return "<button class=\"edit\" type=\"button\" onclick=\"(typeof helpWithAi==='function'&&helpWithAi('" + j.id + "'))\">Ask Grok</button>";
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
  async function replyOnCard(id) {
    const banner = document.getElementById("banner");
    const safe = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const box = document.getElementById("q-reply-" + safe) || document.getElementById("job-note");
    const text = box && box.value ? String(box.value).trim() : "";
    if (!text) {
      if (banner) banner.textContent = "Type a reply on the card.";
      return;
    }
    if (typeof api !== "function") return;
    const out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "reply", id: safe, text: text, whoTapped: (typeof youName !== "undefined" && youName) || "desk" }) });
    const line = out.status >= 400
      ? ((out.data && out.data.error) || "Could not save that reply.")
      : "Reply is on the card. Nothing sent.";
    if (typeof load === "function") await load();
    if (banner) banner.textContent = line;
  }
  async function helpWithAi(id) {
    const banner = document.getElementById("banner");
    if (typeof api !== "function") return;
    const out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "recommend", id: id, whoTapped: (typeof youName !== "undefined" && youName) || "desk" }) });
    const line = out.status >= 400 ? ((out.data && out.data.error) || "Could not draft help.") : "Grok drafted on the card. Nothing sent.";
    if (typeof load === "function") await load();
    if (banner) banner.textContent = line;
    if (typeof openJob === "function") openJob(id);
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
        const other = (j.slug || j.workspace) && (j.slug || j.workspace) !== here;
        const line = honestNext(j, { line: j.next || "On the cap.", decide: false, priority: true });
        return "<article class=\"item q-card cap-card\"><div class=\"q-head\">" + chipsHtml(j, { priority: true, decide: false, missing: [] }, j.desk || j.slug || "") + "</div><h3>" + esc(j.title) + "</h3>" +
          filesHtml(j) + thenDraftHtml(j) +
          "<p class=\"next-line\">" + esc(line) + "</p>" +
          (other ? "<div class=\"row actions tap-opts\"><button class=\"go cap-tap\" type=\"button\" onclick=\"openCapDesk('" + String(j.slug || "").replace(/'/g, "") + "','" + String(j.id || "").replace(/'/g, "") + "')\">Open on " + esc(j.desk || j.slug || "that desk") + "</button></div>" : "<div class=\"row actions tap-opts\"><button class=\"edit\" type=\"button\" onclick=\"openJob('" + String(j.id || "").replace(/'/g, "") + "')\">Open</button></div>") +
          "</article>";
      }).join("");
    } catch (e) { band.hidden = true; }
  }
  window.cardNeeds = cardNeeds;
  window.cardActionHtml = cardActionHtml;
  window.replyOnCard = replyOnCard;
  window.helpWithAi = helpWithAi;
  window.pinCap = pinCap;
  window.openCapDesk = openCapDesk;
  window.loadCap = loadCap;
  window.card = function (j, staff) {
    const need = cardNeeds(j, staff);
    const cap = !!need.priority;
    const why = (typeof visitorLine === "function" ? visitorLine(j.why) : (j.why || ""));
    const status = typeof labelStatus === "function" ? labelStatus(j.status) : (j.status || "");
    const line = honestNext(j, need);
    return "<article class=\"item q-card" + (cap ? " cap-card" : "") + "\"><div class=\"q-head\">" + chipsHtml(j, need, status) + (j.assignee ? "<div class=\"meta q-assignee\">" + esc(j.assignee) + "</div>" : "") + "</div><h3>" + esc(j.title) + "</h3>" + filesHtml(j) + (why ? "<p class=\"q-why\">" + esc(why) + "</p>" : "") + thenDraftHtml(j) + promptHtml(j, need) + "<p class=\"next-line\">" + esc(line) + "</p>" + cardActionHtml(j, staff, "queue") + "</article>";
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
        "#queue .next-line,#cap-list .next-line{font-size:14px;font-weight:700;color:var(--heading);margin:8px 0 10px}" +
        ".q-hitl{grid-template-columns:1fr 1fr 1fr}" +
        ".q-hitl .go,.q-hitl .kill{min-height:48px;font-size:16px}" +
        ".cap-card{border-left:4px solid var(--orange,#f39c12)}" +
        ".cap-mark{display:inline-flex;background:var(--orange,#f39c12);color:#0c1116;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border-radius:999px;padding:2px 8px}" +
        ".cap-band h2{font-size:13px;margin:8px 0 6px}" +
        ".cap-tap{background:var(--orange,#f39c12);color:#0c1116}" +
        "@media(max-width:420px){#queue .q-card,#cap-list .q-card{padding:14px 12px}.q-files .thumb{max-width:100%}.q-hitl{grid-template-columns:1fr 1fr}}";
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
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectCap);
  else injectCap();
})();
