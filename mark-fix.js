(function () {
  function paint() {
    var src = "/img/aia-pyramid-header.svg";
    document.querySelectorAll("header img.brand-mark, .site-header img.brand-mark, img.brand-mark").forEach(function (img) {
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
