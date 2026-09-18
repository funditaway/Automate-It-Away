(function () {
  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }
  ready(function () {
    const row = document.querySelector("main .row");
    if (row && !document.getElementById("us-type-btn")) {
      const btn = document.createElement("button");
      btn.id = "us-type-btn";
      btn.className = "edit";
      btn.type = "button";
      btn.textContent = "We type it in";
      btn.onclick = function () { if (typeof openUsType === "function") openUsType(); };
      const first = row.querySelector("button");
      if (first && first.nextSibling) row.insertBefore(btn, first.nextSibling);
      else row.appendChild(btn);
    }
    if (!document.getElementById("how-in")) {
      const q = document.getElementById("queue");
      if (q) {
        const box = document.createElement("div");
        box.id = "how-in";
        box.className = "item";
        box.innerHTML = "<div class=\"meta\">How work gets here</div>" +
          "<p><b>You drop it</b> — photo, form, missed call. Two taps.</p>" +
          "<p><b>We type it</b> — tell us. We write the card. You still say Yes or Stop.</p>" +
          "<p><b>A pipe</b> — optional. The queue works without one.</p>" +
          "<p class=\"meta\"><a href=\"connections.html\">Add a pipe</a> · <a href=\"chat.html\">Tell us</a></p>";
        q.parentNode.insertBefore(box, q);
      }
    }
    const openBtn = document.querySelector("#gate button");
    if (openBtn && openBtn.textContent === "Open") openBtn.textContent = "That's my queue";
    const chat = document.querySelector('a[href="chat.html"]');
    if (chat) chat.textContent = "Tell us";
  });
  function setCardBusy(id, on) {
    if (typeof window.setCardBusy === "function" && window.setCardBusy !== setCardBusy) {
      window.setCardBusy(id, on);
      return;
    }
    const safe = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const queue = document.getElementById("queue");
    const root = (queue && queue.querySelector && queue.querySelector('[data-job="' + safe + '"]'))
      || document.getElementById("sheet-card");
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
    } else if (line && line.remove) line.remove();
  }
  function wrapHitlBusy() {
    if (typeof window.ship !== "function" || typeof window.confirmKill !== "function") {
      setTimeout(wrapHitlBusy, 200);
      return;
    }
    if (window.ship._aiaBusy) return;
    function wrap(name) {
      const prev = window[name];
      if (typeof prev !== "function") return;
      window[name] = async function (id) {
        setCardBusy(id, true);
        try { return await prev.apply(this, arguments); }
        finally { setCardBusy(id, false); }
      };
    }
    wrap("ship");
    wrap("confirmShip");
    wrap("confirmKill");
    window.ship._aiaBusy = true;
  }
  wrapHitlBusy();
})();
