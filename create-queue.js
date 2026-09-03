/* Advanced queue fields on /create. Packs never Send/Stop/pay/bind. Insurance face never Vita. */
(function () {
  function queueFromForm(form) {
    if (!form) return null;
    var f = new FormData(form);
    var badge = String(f.get("queueBadge") || "").trim();
    var empty = String(f.get("queueEmpty") || "").trim();
    var chips = String(f.get("queueChips") || "").split(/[,;]+/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 8);
    var taps = String(f.get("queueTaps") || "copy, text, email, hand, cap").split(/[,;]+/).map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean).filter(function (t) {
      return ["send", "stop", "pay", "bind", "yes", "no"].indexOf(t) < 0;
    }).slice(0, 8);
    if (!badge && !empty && !chips.length) return null;
    if (/vita/i.test(badge)) badge = "Insurance";
    return {
      badge: badge,
      empty: empty,
      group: f.get("queueGroup") || "none",
      sort: f.get("queueSort") || "cap-first",
      chips: chips,
      taps: taps.length ? taps : ["copy", "text", "email", "hand", "cap"],
      never: ["send", "stop", "pay", "bind"]
    };
  }
  function fieldsHtml() {
    return "<div id=\"create-queue-fields\" class=\"adv\">" +
      "<label>Badge on the queue</label><input name=\"queueBadge\" id=\"q-badge\" placeholder=\"Oil change\">" +
      "<label>Empty line</label><input name=\"queueEmpty\" placeholder=\"Drop the car and the day.\">" +
      "<label>Kind chips</label><input name=\"queueChips\" placeholder=\"photo, request, follow\">" +
      "<label>Group cards by</label><select name=\"queueGroup\"><option value=\"none\">None</option><option value=\"kind\">Kind</option><option value=\"when\">When</option></select>" +
      "<label>Sort</label><select name=\"queueSort\"><option value=\"cap-first\">Cap first</option><option value=\"new\">Newest</option></select>" +
      "<label>Taps that show</label><input name=\"queueTaps\" placeholder=\"copy, text, email, hand, cap\">" +
      "<p class=\"hint\">Packs never Send, Stop, or pay. Insurance badge is Insurance \u2014 never Vita.</p></div>";
  }
  function inject() {
    var form = document.getElementById("form");
    if (!form || form.querySelector("#create-queue-fields")) return;
    var name = form.querySelector('input[name="name"]');
    var does = form.querySelector('input[name="does"]');
    if (!name || !does) return;
    var go = form.querySelector(".go");
    if (go) go.insertAdjacentHTML("beforebegin", fieldsHtml());
    else form.insertAdjacentHTML("beforeend", fieldsHtml());
  }
  if (!window.fetch.__aiaQueue) {
    var orig = window.fetch;
    window.fetch = function (url, opts) {
      try {
        if (opts && typeof opts.body === "string") {
          var body = JSON.parse(opts.body);
          var act = String(body.action || body.kind || "");
          if (act === "create" || act === "list-pack" || act === "save-pack" || body.kind === "model") {
            var q = queueFromForm(document.getElementById("form"));
            if (q) body.queue = q;
            opts = Object.assign({}, opts, { body: JSON.stringify(body) });
          }
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    window.fetch.__aiaQueue = true;
  }
  function boot() {
    inject();
    var form = document.getElementById("form");
    if (form && !form.__aiaQueueObs) {
      form.__aiaQueueObs = true;
      new MutationObserver(inject).observe(form, { childList: true, subtree: true });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 200);
})();
