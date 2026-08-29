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
          "<p><b>We type it</b> — tell us. We write the card. You still say yes or no.</p>" +
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
})();
