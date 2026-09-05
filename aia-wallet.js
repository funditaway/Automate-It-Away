/* AIA Wallet Connect — EIP-1193 / browser wallet on Account. Address only. No keys. Collect HOLD. */
(function () {
  var ADDR_KEY = "aia_wallet_address";
  var CHAIN_KEY = "aia_wallet_chain";
  var HELP = "Wallet is for AIA Internet identity / TLD ownership. Mint and Bridge stay external until ready. Collect stays HOLD.";
  var MISSING = "No browser wallet on this phone. Install MetaMask or another EIP-1193 wallet, then tap Connect.";

  function host() { return document.getElementById("aia-wallet"); }
  function slugify(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function hdr() {
    var h = { "Content-Type": "application/json" };
    var ws = localStorage.getItem("aia_ws") || "";
    var pin = localStorage.getItem("aia_pin") || "";
    var tok = localStorage.getItem("aia_session") || "";
    if (ws) h["X-Workspace"] = slugify(ws);
    if (tok) h["X-Session"] = tok;
    else if (pin) h["X-Pin"] = pin;
    return h;
  }
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function shortAddress(addr) {
    var a = String(addr || "").trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(a)) return "";
    return a.slice(0, 6) + "…" + a.slice(-4);
  }
  function chainLabel(id) {
    var n = Number(id);
    if (n === 1) return "Ethereum mainnet";
    if (n === 11155111) return "Sepolia";
    if (n === 137) return "Polygon";
    if (n === 10) return "Optimism";
    if (n === 42161) return "Arbitrum One";
    if (n === 8453) return "Base";
    if (!n) return "";
    return "Chain " + n;
  }
  function localWallet() {
    var address = String(localStorage.getItem(ADDR_KEY) || "").trim();
    var chainId = Number(localStorage.getItem(CHAIN_KEY) || 0) || 0;
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return { connected: false, address: "", short: "", chainId: 0, chain: "" };
    return { connected: true, address: address, short: shortAddress(address), chainId: chainId, chain: chainLabel(chainId) };
  }
  function remember(address, chainId) {
    if (address) localStorage.setItem(ADDR_KEY, address);
    else localStorage.removeItem(ADDR_KEY);
    if (chainId) localStorage.setItem(CHAIN_KEY, String(chainId));
    else localStorage.removeItem(CHAIN_KEY);
  }
  function forget() {
    localStorage.removeItem(ADDR_KEY);
    localStorage.removeItem(CHAIN_KEY);
  }
  function opened() {
    return !!(localStorage.getItem("aia_session") || (localStorage.getItem("aia_ws") && localStorage.getItem("aia_pin")));
  }
  function provider() {
    return (typeof window !== "undefined" && window.ethereum) || null;
  }
  function parseChainId(raw) {
    if (raw == null || raw === "") return 0;
    var s = String(raw);
    if (/^0x[0-9a-fA-F]+$/.test(s)) return parseInt(s, 16) || 0;
    return Number(s) || 0;
  }
  function msg(text, good) {
    var el = document.getElementById("aia-wallet-msg");
    if (!el) return;
    el.className = good ? "ok" : "meta";
    el.textContent = text || "";
  }
  function paint(wallet, hint) {
    var el = host();
    if (!el) return;
    wallet = wallet || localWallet();
    var connected = !!(wallet && wallet.connected && wallet.address);
    var chain = (wallet && (wallet.chain || chainLabel(wallet.chainId))) || "";
    var short = (wallet && (wallet.short || shortAddress(wallet.address))) || "";
    var body;
    if (!opened()) {
      body = "<p class=\"meta\">Open this desk first, then connect a browser wallet.</p>";
    } else if (connected) {
      body = "<p><strong id=\"aia-wallet-short\">" + esc(short) + "</strong></p>" +
        "<p class=\"meta\" id=\"aia-wallet-chain\">" + esc(chain || "Chain unknown") +
        (Number(wallet.chainId) === 1 ? "" : " · Ethereum mainnet preferred for Decentraweb") + "</p>" +
        "<p class=\"row\"><button type=\"button\" class=\"edit\" id=\"aia-wallet-off\">Disconnect</button></p>";
    } else {
      body = "<p class=\"row\"><button type=\"button\" class=\"go\" id=\"aia-wallet-on\">Connect Wallet</button></p>";
    }
    el.innerHTML = "<h2>Wallet</h2>" +
      "<p class=\"meta\">" + HELP + "</p>" +
      body +
      "<p class=\"meta\" id=\"aia-wallet-msg\">" + esc(hint || "") + "</p>";
    var on = document.getElementById("aia-wallet-on");
    var off = document.getElementById("aia-wallet-off");
    if (on) on.onclick = connect;
    if (off) off.onclick = disconnect;
    if (window.AIATld && AIATld.fromWallet) AIATld.fromWallet(wallet);
  }
  async function persist(address, chainId) {
    remember(address, chainId);
    var r = await fetch("/api/account", {
      method: "POST",
      headers: hdr(),
      body: JSON.stringify({ action: "wallet", walletAddress: address, walletChainId: chainId })
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      msg(d.error || "Could not save the wallet on this desk session.");
      return d.wallet || localWallet();
    }
    if (d.wallet && d.wallet.address) remember(d.wallet.address, d.wallet.chainId);
    return d.wallet || localWallet();
  }
  async function connect() {
    if (!opened()) {
      paint(null, "Open this desk first, then connect a browser wallet.");
      return;
    }
    var eth = provider();
    if (!eth || typeof eth.request !== "function") {
      paint(localWallet(), MISSING);
      return;
    }
    try {
      var accounts = await eth.request({ method: "eth_requestAccounts" });
      var address = accounts && accounts[0] ? String(accounts[0]) : "";
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        paint(localWallet(), "Wallet did not return an Ethereum address.");
        return;
      }
      var chainRaw = "0x1";
      try { chainRaw = await eth.request({ method: "eth_chainId" }); } catch (e) { chainRaw = "0x1"; }
      var chainId = parseChainId(chainRaw);
      var wallet = await persist(address, chainId);
      paint(wallet, wallet && wallet.connected ? "Connected on this desk session." : "");
    } catch (err) {
      var text = (err && (err.message || err.error)) || "Wallet did not connect.";
      paint(localWallet(), text);
    }
  }
  async function disconnect() {
    forget();
    try {
      await fetch("/api/account", {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ action: "disconnect-wallet" })
      });
    } catch (e) {}
    paint({ connected: false }, "Disconnected. Address cleared on this desk session.");
  }
  function listen() {
    var eth = provider();
    if (!eth || typeof eth.on !== "function" || eth.__aiaWalletBound) return;
    eth.__aiaWalletBound = true;
    eth.on("accountsChanged", function (accounts) {
      var next = accounts && accounts[0] ? String(accounts[0]) : "";
      if (!next) {
        forget();
        paint({ connected: false }, "Wallet disconnected in the browser.");
        return;
      }
      if (opened()) persist(next, Number(localStorage.getItem(CHAIN_KEY) || 0) || 0).then(function (w) { paint(w); });
    });
    eth.on("chainChanged", function (chainId) {
      var id = parseChainId(chainId);
      var cur = localWallet();
      if (cur.connected && opened()) persist(cur.address, id).then(function (w) { paint(w); });
    });
  }
  function fromAccount(state) {
    var acc = (state && state.account) || {};
    var w = (state && state.wallet) || acc.wallet || null;
    if (w && w.connected && w.address) {
      remember(w.address, w.chainId);
      return w;
    }
    if (acc.walletAddress) {
      remember(acc.walletAddress, acc.walletChainId);
      return { connected: true, address: acc.walletAddress, short: shortAddress(acc.walletAddress), chainId: acc.walletChainId, chain: chainLabel(acc.walletChainId) };
    }
    if (state && state.wallet && state.wallet.connected === false) {
      forget();
      return { connected: false, address: "", short: "", chainId: 0, chain: "" };
    }
    return localWallet();
  }
  async function load(state) {
    if (!host()) return;
    if (state && (state.account || state.wallet)) {
      paint(fromAccount(state));
      listen();
      return;
    }
    paint(localWallet());
    if (!opened()) {
      listen();
      return;
    }
    try {
      var r = await fetch("/api/account", { method: "GET", headers: hdr() });
      var d = await r.json().catch(function () { return {}; });
      if (r.ok && d && (d.ok || d.account || d.wallet)) paint(fromAccount(d));
    } catch (e) {}
    listen();
  }
  function boot() {
    if (!host()) return;
    load();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.AIAWallet = { boot: boot, load: load, paint: paint, connect: connect, disconnect: disconnect, local: localWallet };
})();
