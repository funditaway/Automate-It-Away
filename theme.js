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
    return isDark() ? "/img/aia-pyramid-tile.svg" : "/img/aia-pyramid-tile-light.svg";
  }
  function markSrc() {
    return "/img/aia-pyramid-header.svg";
  }
  function orangeSrc() {
    return "/img/aia-pyramid-on-orange.svg";
  }
  function paintMarks() {
    var headerSrc = markSrc();
    var tile = tileSrc();
    var orange = orangeSrc();
    document.querySelectorAll("img.brand-mark, img.aia-mark").forEach(function (img) {
      if (img.getAttribute("data-mark-lock") === "1") return;
      var inHeader = img.closest("header, .site-header");
      var onOrange = img.closest("[data-mark='orange']");
      var next = inHeader ? headerSrc : onOrange ? orange : tile;
      if (img.getAttribute("src") !== next) img.setAttribute("src", next);
      if (!img.getAttribute("alt")) img.setAttribute("alt", "AIA");
      img.onerror = function () {
        if (img.getAttribute("src") !== headerSrc) img.setAttribute("src", headerSrc);
      };
    });
  }
