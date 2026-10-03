(function () {
  var TEAL = "/img/aia-mark-teal.png";
  var DARK = "/img/aia-mark-dark.png";
  var LIGHT = "/img/aia-mark-light.png";
  var ORANGE = "/img/aia-mark-orange.png";
  function paint() {
    var dark = document.documentElement.classList.contains("dark");
    document.querySelectorAll("img.brand-mark, img.aia-mark").forEach(function (img) {
      var kind = (img.getAttribute("data-mark") || "").toLowerCase();
      var inHeader = img.closest("header, .site-header");
      var src = TEAL;
      if (kind === "orange") src = ORANGE;
      else if (kind === "light") src = LIGHT;
      else if (kind === "dark") src = DARK;
      else if (kind === "outline") src = "/img/aia-mark-outline.png";
      else if (inHeader) src = TEAL;
      else src = dark ? DARK : LIGHT;
      if (img.getAttribute("src") !== src) img.setAttribute("src", src);
      img.style.background = "transparent";
      img.alt = img.alt || "Automate It Away";
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint);
  else paint();
  setTimeout(paint, 50);
  setTimeout(paint, 400);
  new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
})();

(function () {
  function fitHeader() {
    var header = document.querySelector("header, .site-header");
    if (!header) return;
    var name = header.querySelector(".brand-name");
    var short = header.querySelector(".brand-short");
    var tools = header.querySelector(".hdr-tools");
    if (!name || !tools) return;
    name.style.setProperty("display", "", "important");
    if (short) short.style.setProperty("display", "none", "important");
    var nameBox = name.getBoundingClientRect();
    var toolsBox = tools.getBoundingClientRect();
    var tight = window.innerWidth <= 430 || nameBox.right > toolsBox.left - 8;
    if (tight) {
      name.style.setProperty("display", "none", "important");
      if (short) short.style.setProperty("display", "inline", "important");
    }
  }
  function go() { fitHeader(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);
  else go();
  setTimeout(go, 60);
  setTimeout(go, 400);
  window.addEventListener("resize", go);
})();
