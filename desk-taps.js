/* AIA card taps — more than Yes / Stop. Drafts only. */
(function () {
  function dropUrl() {
    const ws = (typeof workspaceSlug === "function" ? workspaceSlug() : "") || (window.localStorage && localStorage.getItem("aia_ws")) || "";
    return "https://automateitaway.com/drop?ws=" + encodeURIComponent(ws);
  }
  window.copyDropLink = async function () {
    const url = dropUrl();
    try { await navigator.clipboard.writeText(url); } catch (e) { window.prompt("Copy this drop link", url); }
    const banner = document.getElementById("banner");
    if (banner) banner.textContent = "Drop link copied. Work only. No money.";
  };
  window.inviteText = function (name, pin, shop) {
    return (name || "Helper") + " can open " + (shop || "this desk") +
      " with their own desk code " + pin +
      ". Same queue. They tap work. They do not send money. https://automateitaway.com/login";
  };
  window.openInvite = function () {
    const shop = (typeof deskLabel === "function" ? deskLabel() : "") || "this desk";
    const staff = typeof role !== "undefined" && role === "employee";
    const card = document.getElementById("sheet-card");
    if (!card) return;
    card.innerHTML = staff
      ? "<h3>Invite a helper</h3><p class=\"meta\">Waiting on the owner.</p><div class=\"sheet-decide\"><button class=\"edit\" type=\"button\" onclick=\"document.getElementById('sheet').classList.remove('on')\">Close</button></div>"
      : "<h3>Invite a helper</h3><p class=\"meta\">Second phone. Same queue. Owner owns Stop. AIA does not text them.</p>" +
        "<label>Name</label><input id=\"inv-name\" placeholder=\"Sam\">" +
        "<label>Who they are</label><select id=\"inv-kind\"><option value=\"helper\">Helper</option><option value=\"family\">Family</option><option value=\"friend\">Friend</option><option value=\"staff\">Staff</option></select>" +
        "<label>Their desk code</label><input id=\"inv-pin\" inputmode=\"numeric\" placeholder=\"4+ digits\">" +
        "<label>Phone (optional)</label><input id=\"inv-phone\" inputmode=\"tel\">" +
        "<label>Email (optional)</label><input id=\"inv-email\" inputmode=\"email\">" +
        "<div class=\"row actions\" style=\"margin-top:12px\"><button class=\"go\" type=\"button\" onclick=\"inviteHelper()\">Add to this desk</button><button class=\"edit\" type=\"button\" onclick=\"document.getElementById('sheet').classList.remove('on')\">Cancel</button></div>";
    document.getElementById("sheet").classList.add("on");
  };
  window.inviteHelper = async function () {
    const name = ((document.getElementById("inv-name") || {}).value || "").trim();
    const pin = String((document.getElementById("inv-pin") || {}).value || "").trim();
    const kind = (document.getElementById("inv-kind") || {}).value || "helper";
    const banner = document.getElementById("banner");
    if (!name || pin.length < 4) { if (banner) banner.textContent = "Name and a 4+ digit desk code."; return; }
    const out = await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "invite", name: name, pin: pin, kind: kind, role: "employee", phone: ((document.getElementById("inv-phone") || {}).value || ""), email: ((document.getElementById("inv-email") || {}).value || ""), whoTapped: youName || "owner" }) });
    if (out.status >= 400) { if (banner) banner.textContent = (out.data && out.data.error) || "Could not add that person."; return; }
    const shop = (typeof deskLabel === "function" ? deskLabel() : "") || "this desk";
    const line = inviteText(name, pin, shop);
    document.getElementById("sheet-card").innerHTML =
      "<h3>" + esc(name) + " is on this desk</h3><p class=\"meta\">Copy this. AIA does not send it.</p><div class=\"draft\">" + esc(line) + "</div>" +
      "<div class=\"row actions\"><button class=\"edit\" type=\"button\" onclick=\"navigator.clipboard.writeText(document.querySelector('#sheet-card .draft').textContent)\">Copy line</button>" +
      "<a class=\"edit\" href=\"" + smsHref(line) + "\">Text it</a><a class=\"edit\" href=\"" + mailHref(shop + " desk", line) + "\">Email it</a></div>" +
      "<div class=\"sheet-decide\"><button class=\"edit\" type=\"button\" onclick=\"document.getElementById('sheet').classList.remove('on')\">Close</button></div>";
  };

  var TALK_MODE = "work";
  function talkHint(mode) {
    if (mode === "note") return "Talk adds a note to the first waiting card.";
    if (mode === "invite") return "Say a name, who they are, and a 4 digit desk code.";
    if (mode === "rule") return "Say the rule. Then say yes to add it.";
    return "Talk puts work on this queue. Then text, email, hand off, Yes, or Stop.";
  }
  window.talkHeard = async function (text) {
    const line = String(text || "").trim();
    if (!line) return;
    if (TALK_MODE === "invite") { openInvite(); return; }
    if (TALK_MODE === "note") {
      const open = (JOBS || []).filter(function (j) { return j.status === "held" || j.status === "exception" || j.status === "waiting"; })[0];
      if (open) {
        await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "say", id: open.id, text: line, whoTapped: youName || "desk" }) });
        if (typeof load === "function") load();
        return;
      }
    }
    if (TALK_MODE === "rule") {
      const out = await api("/api/rules", { method: "POST", body: JSON.stringify({ action: "talk", text: line }) });
      const ask = (out.data && out.data.ask) || "Rule drafted. Confirm on /rules.";
      const status = document.getElementById("talkStatus");
      if (status) status.textContent = ask;
      if (window.AIASpeech) AIASpeech.speak(ask);
      return;
    }
    const out = await api("/api/intake", { method: "POST", body: JSON.stringify({ action: "do", text: line }) });
    const banner = document.getElementById("banner");
    if (banner) banner.textContent = out.status >= 400 ? ((out.data && out.data.error) || "Could not put that on the queue.") : "On the queue. You still tap.";
    if (typeof load === "function") load();
  };
  function injectTalkBar() {
    if (document.getElementById("talkBar")) return;
    const banner = document.getElementById("banner");
    if (!banner) return;
    const bar = document.createElement("div");
    bar.className = "talk-bar";
    bar.id = "talkBar";
    bar.innerHTML =
      "<p class=\"talk-status\" id=\"talkStatus\">Work hits this desk. Grok drafts. You text, email, hand off, Yes, or Stop.</p>" +
      "<div class=\"talk-opts\" id=\"talkOpts\">" +
        "<button type=\"button\" data-talk=\"work\" class=\"on\">Work</button>" +
        "<button type=\"button\" data-talk=\"note\">Note</button>" +
        "<button type=\"button\" data-talk=\"invite\">Invite</button>" +
        "<button type=\"button\" data-talk=\"rule\">Rule</button>" +
      "</div>" +
      "<button type=\"button\" id=\"hearBtn\">Hear this</button>" +
      "<button type=\"button\" id=\"talkBtn\">Talk</button>" +
      "<button type=\"button\" id=\"quietBtn\">Quiet</button>" +
      "<button type=\"button\" id=\"inviteBtn\">Invite helper</button>" +
      "<button type=\"button\" id=\"dropLinkBtn\">Copy drop link</button>" +
      "<select id=\"voicePick\" hidden></select>" +
      "<select id=\"voiceRate\" hidden><option value=\"0.85\">Slow</option><option value=\"1.02\" selected>Normal</option><option value=\"1.2\">Fast</option></select>";
    banner.insertAdjacentElement("afterend", bar);
    const taps = document.createElement("p");
    taps.className = "meta";
    taps.textContent = "Taps on a card: Copy \u00b7 Text \u00b7 Email \u00b7 Phone file \u00b7 Hand to \u00b7 Done by hand \u00b7 Yes \u00b7 Stop";
    const steps = document.getElementById("step-words");
    if (steps) steps.insertAdjacentElement("afterend", taps);
  }
  function wireTalkBar() {
    injectTalkBar();
    const status = document.getElementById("talkStatus");
    const talkBtn = document.getElementById("talkBtn");
    const opts = document.getElementById("talkOpts");
    if (opts) opts.onclick = function (e) {
      const btn = e.target.closest("[data-talk]");
      if (!btn) return;
      TALK_MODE = btn.getAttribute("data-talk") || "work";
      opts.querySelectorAll("[data-talk]").forEach(function (el) {
        el.classList.toggle("on", el.getAttribute("data-talk") === TALK_MODE);
      });
      if (status) status.textContent = talkHint(TALK_MODE);
    };
    const hearBtn = document.getElementById("hearBtn");
    if (hearBtn) hearBtn.onclick = function () {
      const line = talkHint(TALK_MODE);
      if (status) status.textContent = line;
      if (window.AIASpeech) AIASpeech.speak(line);
    };
    if (talkBtn) talkBtn.onclick = function () {
      if (!window.AIASpeech || !AIASpeech.canListen()) {
        if (TALK_MODE === "invite") openInvite();
        else if (typeof openUsType === "function") openUsType();
        return;
      }
      talkBtn.classList.add("on");
      if (status) status.textContent = "Listening for " + TALK_MODE + "\u2026";
      AIASpeech.listen(function (heard) {
        talkBtn.classList.remove("on");
        talkHeard(heard);
      }, function (msg) {
        talkBtn.classList.remove("on");
        if (status) status.textContent = msg;
      });
    };
    const quietBtn = document.getElementById("quietBtn");
    if (quietBtn) quietBtn.onclick = function () {
      if (window.AIASpeech) AIASpeech.stopTalk();
      if (talkBtn) talkBtn.classList.remove("on");
      if (status) status.textContent = "Quiet.";
    };
    const inviteBtn = document.getElementById("inviteBtn");
    if (inviteBtn) inviteBtn.onclick = function () { openInvite(); };
    const dropBtn = document.getElementById("dropLinkBtn");
    if (dropBtn) dropBtn.onclick = function () { copyDropLink(); };
    const pick = document.getElementById("voicePick");
    const rateEl = document.getElementById("voiceRate");
    if (window.AIASpeech && AIASpeech.canSpeak()) {
      const list = AIASpeech.voices() || [];
      if (pick && list.length) {
        pick.hidden = false;
        pick.innerHTML = list.map(function (v) {
          return "<option value=\"" + String(v.name).replace(/\"/g, "") + "\">" + String(v.name).replace(/</g, "") + "</option>";
        }).join("");
        pick.onchange = function () { AIASpeech.setVoice(pick.value); };
      }
      if (rateEl) {
        rateEl.hidden = false;
        rateEl.onchange = function () { AIASpeech.setRate(rateEl.value); };
      }
    }
  }

  window.card = function (j, staff) {
    const money = Number(j.amount || j.ask || 0);
    const why = typeof visitorLine === "function" ? visitorLine(j.why) : (j.why || "");
    const next = (typeof visitorLine === "function" ? visitorLine(j.next) : j.next) || "Text, email, hand off, Yes, or Stop.";
    const draft = j.draft || j.title || "";
    const sms = typeof smsHref === "function" ? smsHref(draft) : "sms:?&body=" + encodeURIComponent(draft);
    const mail = typeof mailHref === "function" ? mailHref(j.title, draft) : "mailto:?subject=" + encodeURIComponent(j.title || "") + "&body=" + encodeURIComponent(draft);
    return "<article class=\"item\"><div class=\"meta\">" +
      (typeof labelStatus === "function" ? labelStatus(j.status) : j.status) +
      (j.assignee ? " \u00b7 " + esc(j.assignee) : "") +
      "</div><h3>" + esc(j.title) + "</h3>" +
      (j.photoUrl ? "<img class=\"thumb\" src=\"" + esc(j.photoUrl) + "\" alt=\"\">" : "") +
      (why ? "<p>" + esc(why) + "</p>" : "") +
      (j.draft ? "<div class=\"draft\">" + esc(j.draft) + "</div>" : "") +
      "<p class=\"meta\">" + esc(next) + "</p>" +
      "<div class=\"row actions tap-opts\">" +
        "<button class=\"edit\" type=\"button\" onclick=\"openJob('" + j.id + "')\">Open</button>" +
        "<a class=\"edit\" href=\"" + sms + "\">Text</a>" +
        "<a class=\"edit\" href=\"" + mail + "\">Email</a>" +
        "<button class=\"edit\" type=\"button\" onclick=\"openJob('" + j.id + "')\">Hand to</button>" +
        "<button class=\"go\" type=\"button\" onclick=\"ship('" + j.id + "', " + money + ")\">Yes</button>" +
        (staff ? "" : "<button class=\"kill\" type=\"button\" onclick=\"kill('" + j.id + "', '" + esc(j.title).replace(/'/g, "") + "')\">Stop</button>") +
      "</div></article>";
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireTalkBar);
  } else {
    wireTalkBar();
  }
  setTimeout(wireTalkBar, 300);
})();
