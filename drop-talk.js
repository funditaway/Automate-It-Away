(function () {
  function status(text) {
    var el = document.getElementById("talkStatus");
    if (el) el.textContent = text;
  }
  function workText() {
    var title = ((document.getElementById("title") || {}).value || "").trim();
    var note = ((document.getElementById("note") || {}).value || "").trim();
    var tell = ((document.getElementById("tell") || {}).value || "").trim();
    return title || note || tell;
  }
  function dropLine() {
    var name = (window.ws || (window.desk && (desk.name || desk.slug)) || "this desk");
    var work = workText();
    if (work) return work + ". Ready to send to " + name + ".";
    return "Say the work for " + name + ". Talk fills this drop. Nobody sends money from here.";
  }
  function fill(heard) {
    var text = String(heard || "").trim();
    if (!text) return;
    if (/^(send( it)?|send to the desk|drop it)$/i.test(text)) {
      status("Sending what is on the form.");
      if (typeof send === "function") send();
      return;
    }
    var cut = text.split(/[.!?]/)[0].trim().slice(0, 80) || text.slice(0, 80);
    var title = document.getElementById("title");
    var note = document.getElementById("note");
    var tell = document.getElementById("tell");
    if (title) title.value = cut;
    if (note) note.value = text;
    if (tell) tell.value = text;
    status("Heard. Sending to the desk.");
    if (window.AIASpeech) AIASpeech.speak("Sending to the desk.");
    if (typeof send === "function") send();
  }
  function boot() {
    var bar = document.getElementById("talkBar");
    if (!bar || !window.AIASpeech) return;
    if (AIASpeech.canSpeak() || AIASpeech.canListen()) bar.hidden = false;
    var talkBtn = document.getElementById("talkBtn");
    var hear = document.getElementById("hearBtn");
    var quiet = document.getElementById("quietBtn");
    if (hear) hear.onclick = function () {
      var line = dropLine();
      status(line);
      AIASpeech.speak(line);
    };
    if (talkBtn) talkBtn.onclick = function () {
      if (!AIASpeech.canListen()) {
        status("This phone will not take speech here. Type the drop.");
        return;
      }
      talkBtn.classList.add("on");
      status("Listening…");
      AIASpeech.listen(function (heard) {
        talkBtn.classList.remove("on");
        fill(heard);
      }, function (msg) {
        talkBtn.classList.remove("on");
        status(msg);
      });
    };
    if (quiet) quiet.onclick = function () {
      AIASpeech.stopTalk();
      if (talkBtn) talkBtn.classList.remove("on");
      status("Quiet. Type, or tap Talk.");
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
