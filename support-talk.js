/* World door for AIA Help. Posts a card onto desk aia. Never sends mail or money. */
(function () {
  var KIND = "broke";
  var asked = 0;
  var PROMPT = "What broke? Which page? Name of your desk (not the code). How do we reach you?";
  var HOME = PROMPT;

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

  var askCtx = { field: "", tip: "", page: "" };

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
      page: page || askCtx.page,
      deskName: deskName,
      who: who,
      email: email,
      phone: phone,
      field: askCtx.field,
      tip: askCtx.tip,
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
        deskName: p.deskName,
        field: p.field,
        tip: p.tip
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
    AIASpeech.listen(function (t) {
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
    }, function (msg) {
      setOk(msg || "Did not catch that. Tap Talk and say it again.");
    });
  }

  function quiet() {
    if (window.AIASpeech && AIASpeech.stopTalk) AIASpeech.stopTalk();
    thread(HOME);
  }

  function paintAsk() {
    var q = {};
    try { q = new URLSearchParams(location.search || ""); } catch (e) { q = new URLSearchParams(); }
    var field = q.get("field") || "";
    var ask = q.get("ask") || "";
    var from = q.get("from") || "";
    var tipText = q.get("tip") || "";
    var tips = (window.AIATip && AIATip.tips) || {};
    var tip = tips[field];
    if (!tipText && tip) tipText = tip.body || "";
    askCtx = {
      field: field,
      tip: tipText,
      page: from ? ("/" + from.replace(/\.html$/, "")) : ""
    };
    var line = "";
    if (tip || tipText) {
      line = ((tip && tip.title) ? tip.title + " — " : "") +
        (tipText || (tip && tip.body) || "") +
        " Need more? Type it or Talk. This chat stays draft / help. Need a person? Drop a card on the AIA Admin desk. Yes / Stop stay human.";
    } else if (ask) {
      line = ask + " Type more or Talk. This chat stays draft / help. Need a person? Drop a card on the AIA Admin desk. Yes / Stop stay human.";
    }
    if (!line) return;
    HOME = line;
    thread(line);
    var title = $("title");
    var notes = $("notes");
    var page = $("page");
    if (title && !title.value) title.value = (tip && tip.ask) || ask;
    if (notes && !notes.value) {
      notes.value = (from ? ("From " + from + ". ") : "") +
        (field ? ("Field " + field + ". ") : "") +
        (tipText ? (tipText + " ") : "") +
        ((tip && tip.ask) || ask);
    }
    if (page && from && !page.value) page.value = askCtx.page;
    paintKind(guessKind((tip && tip.ask) || ask || field));
  }

  function bind() {
    paintAsk();
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
