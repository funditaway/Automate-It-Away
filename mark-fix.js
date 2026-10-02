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
