/* Signed-out Drop, Create and History: show "Sign in first" with one link to /login instead of
   tools that look like they work. A shared drop link (?ws= or ?workspace=), the public widget,
   and a phone that already saved a desk keep the normal page. */
(function () {
  var PAGES = { drop: "Drop", create: "Create", history: "History" };
  var COPY = {
    drop: "Sign in first. Then drop a task, an errand or a list onto your Queue.",
    create: "Sign in first. Then tell your Queue what to automate.",
    history: "Sign in first. History shows what your desks did."
  };
  function pageName() {
    var p = String((location && location.pathname) || "").replace(/\.html$/, "").replace(/\/+$/, "");
    return p.slice(p.lastIndexOf("/") + 1);
  }
  function signedIn() {
    try { return !!(localStorage.getItem("aia_session") || localStorage.getItem("aia_pin")); }
    catch (e) { return false; }
  }
  function sharedLink() {
    return /[?&](ws|workspace)=[^&]/.test(String((location && location.search) || ""));
  }
  function widget() {
    var root = document.documentElement;
    return !!(root && root.classList && root.classList.contains("widget"));
  }
  function savedDesks() {
    try { return !!(window.AIADesks && AIADesks.list && AIADesks.list().length); }
    catch (e) { return false; }
  }
  function needsSignIn() {
    var page = pageName();
    if (!PAGES[page]) return false;
    if (signedIn() || widget()) return false;
    if (page === "drop" && (sharedLink() || savedDesks())) return false;
    return true;
  }
  function paint() {
    var page = pageName();
    var main = document.querySelector("main");
    if (!main || document.getElementById("signin-first")) return;
    var box = document.createElement("section");
    box.id = "signin-first";
    box.className = "card";
    var h = document.createElement("h1");
    h.textContent = PAGES[page];
    var p = document.createElement("p");
    p.className = "sub";
    p.textContent = COPY[page];
    var go = document.createElement("a");
    go.id = "signin-first-go";
    go.className = "go";
    go.href = "/login";
    go.textContent = "Sign in";
    box.appendChild(h);
    box.appendChild(p);
    box.appendChild(go);
    main.insertBefore(box, main.firstChild);
  }
  function start() {
    if (!needsSignIn()) return;
    var root = document.documentElement;
    if (root && root.classList) root.classList.add("signin-first");
    if (!document.getElementById("signin-first-css")) {
      var css = document.createElement("style");
      css.id = "signin-first-css";
      css.textContent =
        "html.signin-first main > :not(#signin-first){display:none!important}" +
        "#signin-first{margin:16px 0;padding:18px}" +
        "#signin-first .sub{font-size:16px;margin:8px 0 16px}" +
        "#signin-first a.go{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 22px;border-radius:999px;font-weight:800;text-decoration:none}";
      (document.head || document.documentElement).appendChild(css);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint);
    else paint();
  }
  window.AIASignInFirst = { needsSignIn: needsSignIn };
  start();
})();
