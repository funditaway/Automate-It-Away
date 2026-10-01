(function () {
  function paint() {
    /* Header bar is teal. Use the white-stroke pyramid on teal tile. */
    var src = "/img/aia-mark-teal.png";
    document.querySelectorAll("header img.brand-mark, .site-header img.brand-mark, img.brand-mark").forEach(function (img) {
      var kind = (img.getAttribute("data-mark") || "").toLowerCase();
      if (kind && kind !== "header" && kind !== "teal") return;
      var inHeader = img.closest("header, .site-header");
      if (inHeader) {
        img.setAttribute("src", src);
        img.style.background = "transparent";
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint);
  else paint();
  setTimeout(paint, 50);
  setTimeout(paint, 400);
})();
