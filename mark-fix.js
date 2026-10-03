(function () {
  /* theme.js owns which tile shows. This file only keeps the name from covering Sign in. */
  function fitHeader() {
    var header = document.querySelector("header, .site-header");
    if (!header) return;
    var name = header.querySelector(".brand-name");
    if (!name) return;
    var short = header.querySelector(".brand-short");
    if (!short) {
      short = document.createElement("span");
      short.className = "brand-short";
      short.textContent = "AIA";
      short.hidden = true;
      name.after(short);
    }
    var tools = header.querySelector(".hdr-tools, .theme-btn");
    name.hidden = false;
    short.hidden = true;
    var tight = window.innerWidth <= 430;
    if (!tight && tools) {
      var nameBox = name.getBoundingClientRect();
      var toolsBox = tools.getBoundingClientRect();
      tight = nameBox.right > toolsBox.left - 8;
    }
    if (tight) {
      name.hidden = true;
      short.hidden = false;
    }
  }
  function go() { fitHeader(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);
  else go();
  window.addEventListener("resize", go);
  setTimeout(go, 60);
})();
