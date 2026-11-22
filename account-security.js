// My account: Two-factor, Backup codes, and Signed-in devices. Read only.
// One GET /api/account (the home read the page already makes). No POST, no PUT, no DELETE,
// and nothing is written to this phone. There is no setup button: the server step is not built.
// Devices come only from the home read's sessions rows, and only rows whose accountId is this
// account's id (account.id), and never when you.accountId names another account.
// A row uses current, workspace, and seenAt (or createdAt) only.
// Not signed in, a failed read, or no account id: nothing shows.
// This Signed-in devices list is the account's session trail (the old Phones on this account
// card). It keeps only those session fields. It does not use name, role, or any other field,
// and it has no leave button: Leave this phone stays on the page, and Leave every phone stays
// in the activity menu.
(function () {
  "use strict";
  var root = document.getElementById("acct-security");
  if (!root) return;

  var TITLE = "Sign-in";
  var TWO_FACTOR = "Two-factor: not set up yet.";
  var CODES = "Backup codes";
  var NONE = "None yet.";
  var DEVICES = "Signed-in devices";
  var THIS_ONE = "This device";
  var OTHER = "Other device";
  var SEEN = "Seen ";

  function ls(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function hdr() {
    var h = {};
    var ws = ls("aia_ws"), tok = ls("aia_session"), pin = ls("aia_pin");
    if (ws) h["X-Workspace"] = ws;
    if (tok) h["X-Session"] = tok;
    if (pin) h["X-Pin"] = pin;
    return h;
  }
  function signedIn() { return !!(ls("aia_ws") && (ls("aia_session") || ls("aia_pin"))); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }
  function clear(box) { while (box.firstChild) box.removeChild(box.firstChild); }
  function hide() { clear(root); root.hidden = true; }
  function two(n) { return (n < 10 ? "0" : "") + n; }
  function when(s) {
    var t = Date.parse(String(s || ""));
    if (!isFinite(t)) return "";
    var d = new Date(t);
    return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) + " " + two(d.getHours()) + ":" + two(d.getMinutes());
  }
  function ownRows(d) {
    var acc = d && d.account;
    var id = acc && typeof acc.id === "string" ? acc.id : "";
    if (!id || !Array.isArray(d.sessions)) return null;
    // A home read for a seat that belongs to another account shows nothing.
    var you = d.you;
    if (you && typeof you.accountId === "string" && you.accountId && you.accountId !== id) return null;
    return d.sessions.filter(function (s) { return s && typeof s === "object" && s.accountId === id; });
  }
  function line(s) {
    var row = el("div", "item");
    row.appendChild(el("strong", "", s.current === true ? THIS_ONE : OTHER));
    var bits = [];
    if (typeof s.workspace === "string" && s.workspace) bits.push(s.workspace);
    var at = when(s.seenAt || s.createdAt);
    if (at) bits.push(SEEN + at);
    if (bits.length) row.appendChild(el("div", "meta", bits.join(" · ")));
    return row;
  }
  function paint(d) {
    var rows = ownRows(d);
    if (!rows) { hide(); return; }
    clear(root);
    var c = el("div", "card");
    c.appendChild(el("h2", "", TITLE));
    if (!(d.account && d.account.mfaOn === true)) c.appendChild(el("p", "meta", TWO_FACTOR));
    c.appendChild(el("h3", "", CODES));
    c.appendChild(el("p", "meta", NONE));
    c.appendChild(el("h3", "", DEVICES));
    var list = el("div");
    list.id = "acct-security-devices";
    if (rows.length) rows.forEach(function (s) { list.appendChild(line(s)); });
    else list.appendChild(el("p", "meta", NONE));
    c.appendChild(list);
    root.appendChild(c);
    root.hidden = false;
  }
  function load() {
    if (!signedIn()) { hide(); return; }
    fetch("/api/account", { method: "GET", headers: hdr() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.ok !== false && d.account) paint(d); else hide(); })
      .catch(function () { hide(); });
  }

  window.AIAAccountSecurity = { load: load };
  load();
})();
