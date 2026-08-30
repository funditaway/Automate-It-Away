(function (root) {
  const Rec = root.SpeechRecognition || root.webkitSpeechRecognition;
  let rec = null;

  function canSpeak() {
    return typeof root.speechSynthesis !== "undefined";
  }

  function canListen() {
    return !!Rec;
  }

  function stopTalk() {
    if (canSpeak()) root.speechSynthesis.cancel();
    if (rec) {
      try { rec.onresult = null; rec.onerror = null; rec.onend = null; rec.abort(); } catch (e) {}
      rec = null;
    }
  }

  function speak(text) {
    if (!canSpeak() || !text) return Promise.resolve();
    root.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = "en-US";
    u.rate = 1.02;
    u.pitch = 1;
    return new Promise(function (resolve) {
      u.onend = function () { resolve(); };
      u.onerror = function () { resolve(); };
      try { root.speechSynthesis.speak(u); } catch (e) { resolve(); }
    });
  }

  function listen(onResult, onErr) {
    if (!canListen()) {
      if (onErr) onErr("This phone will not take speech here. Type the answers.");
      return;
    }
    if (canSpeak()) root.speechSynthesis.cancel();
    if (rec) {
      try { rec.abort(); } catch (e) {}
    }
    rec = new Rec();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = function (e) {
      const hit = e.results && e.results[0] && e.results[0][0];
      const text = hit && hit.transcript ? String(hit.transcript).trim() : "";
      rec = null;
      if (text && onResult) onResult(text);
      else if (onErr) onErr("Did not catch that. Tap Talk and say it again.");
    };
    rec.onerror = function (e) {
      rec = null;
      const code = e && e.error;
      if (code === "aborted") return;
      if (code === "not-allowed") onErr && onErr("Mic is blocked. Allow it for this site, or type.");
      else if (code === "no-speech") onErr && onErr("Did not catch that. Tap Talk and say it again.");
      else onErr && onErr("Could not hear that. Type it.");
    };
    rec.onend = function () { rec = null; };
    try { rec.start(); } catch (e) {
      rec = null;
      if (onErr) onErr("Could not start the mic. Type it.");
    }
  }

  function digits(text) {
    return String(text || "").replace(/\D/g, "");
  }

  function email(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/\s+at\s+/g, "@")
      .replace(/\s+dot\s+/g, ".")
      .replace(/\s+/g, "");
  }

  function skipped(text) {
    return /^(skip|none|pass|next|nope|no thanks)$/i.test(String(text || "").trim());
  }

  root.AIASpeech = {
    canSpeak: canSpeak,
    canListen: canListen,
    speak: speak,
    listen: listen,
    stopTalk: stopTalk,
    digits: digits,
    email: email,
    skipped: skipped
  };

  root.addEventListener("pagehide", stopTalk);
  root.addEventListener("visibilitychange", function () {
    if (document.hidden) stopTalk();
  });
})(window);
