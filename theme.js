(function () {
  function systemDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function isDark() {
    var t = localStorage.getItem("aia_theme") || "system";
    if (t === "dark") return true;
    if (t === "light") return false;
    return systemDark();
  }
  function label() {
    var t = localStorage.getItem("aia_theme") || "system";
    if (t === "dark") return "Dark";
    if (t === "light") return "Light";
    return "Auto";
  }
  function tileSrc() {
    return isDark() ? "/img/aia-pyramid-header.svg" : "/img/aia-pyramid-tile-light.svg";
  }
  function markSrc() {
    return "/img/aia-pyramid-header.svg";
  }
  function paintMarks() {
    var headerSrc = markSrc();
    var tile = tileSrc();
    document.querySelectorAll("img.brand-mark").forEach(function (img) {
      var inHeader = img.closest("header, .site-header");
      img.setAttribute("src", inHeader ? headerSrc : tile);
    });
  }
