(function () {
  function fix(id) {
    var el = document.getElementById(id);
    if (!el || !el.accept) return;
    if (/text\/html|\.html/i.test(el.accept)) return;
    el.accept = el.accept.replace(/,\s*$/, "") + ",text/html,.html";
  }
  function run() { fix("photo"); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
