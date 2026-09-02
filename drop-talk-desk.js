(function () {
  function desks() { return (window.AIADesks && AIADesks.list) ? AIADesks.list() : []; }
  function slug() {
    var q = new URLSearchParams(location.search).get("ws") || "";
    var cur = (window.AIADesks && AIADesks.current && AIADesks.current()) || {};
    return q || cur.slug || (window.desk && desk.slug) || window.ws || localStorage.getItem("aia_ws") || "";
  }
  function ready() {
    var s = slug();
    if (!s) return false;
    if (window !== window.parent || /embed=1/.test(location.search)) return true;
    var row = window.AIADesks && AIADesks.find ? AIADesks.find(s) : null;
    return !!(localStorage.getItem("aia_pin") || localStorage.getItem("aia_session") || (row && (row.pin || row.token)));
  }
  function name() {
    var cur = (window.AIADesks && AIADesks.current && AIADesks.current()) || {};
    return cur.name || slug() || "this desk";
  }
  function status(t) { var el = document.getElementById("talkStatus"); if (el) el.textContent = t; }
  function matchDesk(text) {
    var rows = desks(); var t = String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    if (!t) return [];
    return rows.filter(function (d) {
      var n = String(d.name || d.slug).toLowerCase();
      var sl = String(d.slug || "").toLowerCase().replace(/-/g, " ");
      return (n && t.indexOf(n) >= 0) || (sl && t.indexOf(sl) >= 0);
    });
  }
  function useDesk(row) {
    if (!row) return false;
    if (!row.pin && !row.token) {
      status("Type the desk code for " + (row.name || row.slug) + ".");
      if (window.AIADropDesks && AIADropDesks.pick) AIADropDesks.pick(row.slug);
      return false;
    }
    if (window.AIADesks && AIADesks.switchTo) AIADesks.switchTo(row.slug);
    window.ws = row.slug; window.desk = row;
    if (window.AIADropDesks && AIADropDesks.paint) AIADropDesks.paint();
    return true;
  }
  function goDesk(row, pending) {
    if (!useDesk(row)) return true;
    try { if (pending) sessionStorage.setItem("aia_talk_pending", JSON.stringify(pending)); } catch (e) {}
    var here = new URLSearchParams(location.search).get("ws") || "";
    if (here === row.slug && ready()) return false;
    location.href = "/drop?ws=" + encodeURIComponent(row.slug);
    return true;
  }
  function line() {
    if (!ready()) {
      var rows = desks();
      if (!rows.length) return "Pick a desk first. Add one you already opened, or create a desk. Then talk.";
      if (rows.length === 1) return "This phone has " + (rows[0].name || rows[0].slug) + ". Tap it, or say that name.";
      return "Pick a desk first, or say which desk. " + rows.map(function (d) { return d.name || d.slug; }).slice(0, 4).join(", ") + ".";
    }
    return "Talk the work for " + name() + ". End with drop it if you want it on the queue.";
  }
  function lock() {
    var btn = document.getElementById("talkBtn");
    if (btn) { btn.disabled = false; btn.textContent = ready() ? "Talk to the desk" : "Say which desk"; }
    var pick = document.getElementById("desk-pick");
    if (pick) pick.classList.toggle("need-desk", !ready());
    status(line());
  }
  function pendingOf(parsed) {
    if (!parsed || !parsed.text) return null;
    return { title: parsed.title, notes: parsed.text, kind: parsed.kind, outcome: parsed.outcome, who: parsed.who, timing: parsed.timing, sendNow: parsed.sendNow };
  }
  function boot() {
    if (!window.AIADropTalk) return;
    var origFill = AIADropTalk.fill;
    var origParse = AIADropTalk.parseTalk;
    AIADropTalk.deskReady = ready;
    AIADropTalk.dropLine = line;
    AIADropTalk.lockTalk = lock;
    AIADropTalk.matchDesk = matchDesk;
    AIADropTalk.fill = function (heard) {
      var text = String(heard || "").trim();
      if (!text) return;
      var parsed = origParse ? origParse(text) : { text: text };
      parsed.desks = matchDesk(text);
      parsed.desk = parsed.desks[0] || null;
      if (parsed.desks.length > 1) { status("Which desk? " + parsed.desks.map(function (d) { return d.name || d.slug; }).join(", ") + "."); return; }
      if (parsed.desk && !ready()) {
        status("Putting this on " + (parsed.desk.name || parsed.desk.slug) + ".");
        if (goDesk(parsed.desk, pendingOf(parsed))) return;
      }
      if (!ready()) {
        var only = desks();
        if (only.length === 1 && (parsed.text || /desk|here/i.test(text))) {
          if (goDesk(only[0], pendingOf(parsed))) return;
        }
        status(line());
        var box = document.getElementById("desk-pick");
        if (box) box.scrollIntoView({ block: "start" });
        if (window.AIASpeech) AIASpeech.speak("Pick a desk first, or say which desk.");
        return;
      }
      if (origFill) origFill(heard);
    };
    lock();
    try {
      var raw = sessionStorage.getItem("aia_talk_pending") || "";
      sessionStorage.removeItem("aia_talk_pending");
      if (raw && ready() && origFill) {
        var p = JSON.parse(raw);
        if (p.notes || p.title) origFill((p.title || p.notes) + (p.sendNow ? " drop it" : ""));
      }
    } catch (e) {}
  }
  function wait() {
    if (window.AIADropTalk) boot();
    else setTimeout(wait, 40);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait);
  else wait();
})();
