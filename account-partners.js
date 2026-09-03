(function (w) {
  function card() {
    var host = document.getElementById("partner-access") || document.getElementById("oauth-wall");
    if (!host) return;
    if (!document.getElementById("partner-access")) {
      var box = document.createElement("div");
      box.className = "card";
      box.id = "partner-access";
      box.innerHTML =
        "<h2>Connection partners</h2>" +
        "<p class=\"meta\">World AIA Account. Identity only. Special API Access is not this login — pipes stay on Connections. Never Send, Stop, pay, or draft from a partner token.</p>" +
        "<p class=\"meta\">Scopes: openid, email, profile / name. Never Gmail, Drive, Calendar write, payments, bind, or premium.</p>" +
        "<p class=\"meta\"><a href=\"legal.html\">Terms &amp; privacy</a> · Unlink only if another door remains.</p>" +
        "<div id=\"oauth-wall\"></div>";
      host.parentNode.insertBefore(box, host);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", card);
  else card();
  w.AIAAccountPartners = { boot: card };
})(window);
