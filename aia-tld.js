/* AIA Internet / .aia TLD reclaim on Account. Honest status only. No mint from this desk. Collect HOLD. */
(function () {
  var REGISTER = "https://dns.decentraweb.org/name/aia";
  var LOCKED = "Bridge locked on Decentraweb — watching. When unlocked, Connect wallet then Register.";
  var READY = "Ready to mint when Bridge clears.";
  var HOLD = "Collect stays HOLD. AIA holds no keys. James signs mint in MetaMask when Bridge clears.";

  function host() { return document.getElementById("aia-tld"); }
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function hdr() {
    var h = { "Content-Type": "application/json" };
    var ws = localStorage.getItem("aia_ws") || "";
    var pin = localStorage.getItem("aia_pin") || "";
    var tok = localStorage.getItem("aia_session") || "";
    if (ws) h["X-Workspace"] = String(ws).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (tok) h["X-Session"] = tok;
    else if (pin) h["X-Pin"] = pin;
    return h;
  }
  function localWallet() {
    if (window.AIAWallet && AIAWallet.local) return AIAWallet.local();
    var address = String(localStorage.getItem("aia_wallet_address") || "").trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return { connected: false, short: "" };
    return { connected: true, address: address, short: address.slice(0, 6) + "…" + address.slice(-4) };
  }

  function checklist(unlocked) {
    return "<ol class=\"aia-tld-steps\">" +
      "<li>Connect a browser wallet on this Account (Ethereum mainnet).</li>" +
      "<li>" + (unlocked ? "Open Decentraweb Register for .aia." : "When Bridge clears, open Decentraweb Register for .aia.") + "</li>" +
      "<li>Request to register — James signs in MetaMask. AIA does not send the tx.</li>" +
      "<li>Wait 60 seconds, then pay " + esc("~0.041–0.045 ETH/yr + gas, or DWEB") + ".</li>" +
      "</ol>";
  }

  function paint(state, hint) {
    var el = host();
    if (!el) return;
    var tld = (state && (state.aiaTld || state.tld)) || state || {};
    var local = localWallet();
    var wallet = (tld.wallet && tld.wallet.connected && tld.wallet.short) ? tld.wallet : local;
    var status = tld.status || (tld.ownedByConnected ? "owned" : tld.bridgeLocked ? "bridge-locked" : tld.available ? "available" : "watching");
    var label = tld.label || (status === "owned" ? "Owned" : status === "available" ? "Available to register" : status === "bridge-locked" ? "Bridge locked" : "Watching");
    var note = tld.note || (status === "bridge-locked" ? (wallet.connected ? READY : LOCKED) : HOLD);
    var short = (wallet && (wallet.short || "")) || "";
    var body = "<p><strong id=\"aia-tld-status\">" + esc(label) + "</strong></p>";
    if (status === "owned") {
      body += "<p class=\"meta\">.aia is on this connected wallet" + (short ? " · " + esc(short) : "") + ".</p>";
    } else if (status === "available") {
      body += "<p class=\"meta\">" + esc(tld.note || "Bridge is clear. Connect wallet, then Register .aia.") + "</p>";
      body += checklist(true);
      body += "<p class=\"row\"><a class=\"go\" id=\"aia-tld-register\" href=\"" + esc(tld.registerUrl || REGISTER) + "\" target=\"_blank\" rel=\"noopener\">Open Decentraweb Register</a></p>";
    } else {
      body += "<p class=\"meta\" id=\"aia-tld-copy\">" + esc(status === "bridge-locked" ? LOCKED : (tld.note || WATCH_NOTE())) + "</p>";
      if (wallet && wallet.connected && short) {
        body += "<p><strong id=\"aia-tld-wallet\">" + esc(short) + "</strong></p>";
        body += "<p class=\"meta\" id=\"aia-tld-ready\">" + esc(READY) + "</p>";
      }
      body += checklist(false);
      body += "<p class=\"row\"><a class=\"edit\" id=\"aia-tld-watch\" href=\"" + esc(tld.registerUrl || REGISTER) + "\" target=\"_blank\" rel=\"noopener\">Watch on Decentraweb</a></p>";
    }
    el.innerHTML = "<h2>AIA Internet / .aia TLD</h2>" +
      "<p class=\"meta\">" + HOLD + "</p>" +
      body +
      "<p class=\"meta\" id=\"aia-tld-msg\">" + esc(hint || "") + "</p>";
  }

  function WATCH_NOTE() {
    return "Watching Decentraweb for .aia. Collect stays HOLD.";
  }

  async function load(state) {
    if (!host()) return;
    if (state && (state.aiaTld || state.status === "bridge-locked" || state.bridgeLocked != null)) {
      paint(state.aiaTld ? state : { aiaTld: state });
    } else {
      paint({ status: "watching", note: "Checking Decentraweb…" });
    }
    try {
      var r = await fetch("/api/status", { method: "GET", headers: hdr() });
      var d = await r.json().catch(function () { return {}; });
      if (d && d.aiaTld) paint(d);
      else if (state && state.aiaTld) paint(state);
      else paint({ status: "watching", note: (d && d.error) || "Could not read .aia status." });
    } catch (e) {
      if (state && state.aiaTld) paint(state);
      else paint({ status: "watching", note: "Could not reach /api/status." });
    }
  }

  function fromWallet() {
    if (!host()) return;
    load();
  }

  function boot() {
    if (!host()) return;
    load();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.AIATld = { boot: boot, load: load, paint: paint, fromWallet: fromWallet };
})();
