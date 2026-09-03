/* World door for AIA Help. Posts a card onto desk aia. Never sends mail or money. */
(function () {
  var KIND = "broke";
  var asked = 0;
  var PROMPT = "What broke? Which page? Name of your desk (not the code). How do we reach you?";

  function $(id) { return document.getElementById(id); }
  function setOk(t) { var el = $("ok"); if (el) el.textContent = t || ""; }
  function thread(t) { var el = $("thread"); if (el) el.textContent = t; }

  function currentKind() {
    var on = document.querySelector("#kinds button.on");
    return (on && on.getAttribute("data-kind")) || KIND;
  }

  function paintKind(k) {
    KIND = k || KIND;
    document.querySelectorAll("#kinds button").forEach(function (btn) {
      btn.classList.toggle("on", btn.getAttribute("data-kind") === KIND);
    });
  }

  function guessKind(text) {
    var s = String(text || "").toLowerCase();
    if (/\blogin\b|password|sign in|locked out/.test(s)) return "login";
    if (/\bpack\b|market|catalog/.test(s)) return "pack";
    if (/\bpipe\b|webhook|connection/.test(s)) return "pipe";
    if (/account|people|handle|seat/.test(s)) return "account";
    if (/desk|queue|card/.test(s)) return "desk";
    if (/idea|wish|add|feature/.test(s)) return "idea";
    return "broke";
  }

  function payload() {
    var title = (($("title") || {}).value || "").trim();
    var notes = (($("notes") || {}).value || "").trim();
    var page = (($("page") || {}).value || "").trim();
    var deskName = (($("deskName") || {}).value || "").trim();
    var who = (($("who") || {}).value || "").trim();
    var email = (($("email") || {}).value || "").trim();
    var phone = (($("phone") || {}).value || "").trim();
    if (!title && notes) title = notes.slice(0, 80);
    return {
      title: title,
      notes: notes,
      page: page,
      deskName: deskName,
      who: who,
      email: email,
      phone: phone,
      kind: currentKind()
    };
  }

  function applyTalk(text) {
    var raw = String(text || "").trim();
    if (!raw) return;
    var notes = $("notes");
    var title = $("title");
    if (notes) notes.value = notes.value ? (notes.value + "\n" + raw) : raw;
    if (title && !title.value) title.value = raw.slice(0, 80);
    paintKind(guessKind((notes && notes.value) || raw));
    var low = raw.toLowerCase();
    if (/@/.test(raw) && $("email") && !$("email").value) $("email").value = raw.match(/\S+@\S+/)[0];
    if (/\bpage\b|\//.test(low) && $("page") && !$("page").value) {
      var m = raw.match(/\/[-a-z0-9#?=&]+/i);
      if (m) $("page").value = m[0];
    }
  }

  async function dropCard() {
    var p = payload();
    if (!p.title || !p.notes) {
      setOk("Title and what broke are required.");
      return;
    }
    setOk("Filing the card …");
    var body = {
      action: "capture",
      pack: "aia",
      kind: p.kind,
      title: p.title,
      notes: p.notes,
      contactName: p.who,
      email: p.email,
      phone: p.phone,
      from: "support",
      timing: "",
      custom: {
        outcome: "ticket",
        page: p.page,
        deskName: p.deskName
      }
    };
    var res;
    try {
      res = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Workspace": "aia"
        },
        body: JSON.stringify(body)
      });
    } catch (err) {
      setOk("Could not file. Copy this and drop it on /drop?ws=aia.");
      return;
    }
    var json = {};
    try { json = await res.json(); } catch (e) { json = {}; }
    if (res.ok && json && (json.ok || json.job)) {
      setOk("Card is on the AIA desk. A person looks. Nothing sends itself.");
      thread("Card is on the AIA desk. You can close this.");
      if (window.AIASpeech && AIASpeech.speak) AIASpeech.speak("Card is on the AIA desk. A person looks. Nothing sends itself.");
      return;
    }
    setOk("Could not file. Copy this and drop it on /drop?ws=aia.");
  }

  function hear() {
    var text = ($("thread") && $("thread").textContent) || PROMPT;
    if (window.AIASpeech && AIASpeech.speak) AIASpeech.speak(text);
  }

  function talk() {
    if (!window.AIASpeech || !AIASpeech.listen) {
      setOk("Talk needs a browser that can listen. Type it instead.");
      return;
    }
    thread("Listening …");
    AIASpeech.listen({
      ontext: function (t) {
        var said = String(t || "").trim();
        if (!said) return;
        if (/\bdrop it\b|file it|send it/i.test(said)) {
          applyTalk(said.replace(/\b(drop it|file it|send it)\b/ig, "").trim());
          dropCard();
          return;
        }
        applyTalk(said);
        asked += 1;
        if (asked === 1) thread("Which page, and the name of your desk — not the code?");
        else if (asked === 2) thread("How do we reach you? Then say drop it.");
        else thread("Say drop it to put this on the AIA desk.");
      },
      onend: function () {}
    });
  }

  function quiet() {
    if (window.AIASpeech && AIASpeech.stopTalk) AIASpeech.stopTalk();
    thread(PROMPT);
  }

  function bind() {
    document.querySelectorAll("#kinds button").forEach(function (btn) {
      btn.addEventListener("click", function () { paintKind(btn.getAttribute("data-kind")); });
    });
    var send = $("drop-send");
    if (send) send.addEventListener("click", dropCard);
    var hearBtn = $("hear");
    if (hearBtn) hearBtn.addEventListener("click", hear);
    var talkBtn = $("talk");
    if (talkBtn) talkBtn.addEventListener("click", talk);
    var quietBtn = $("quiet");
    if (quietBtn) quietBtn.addEventListener("click", quiet);
    window.send = dropCard;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
