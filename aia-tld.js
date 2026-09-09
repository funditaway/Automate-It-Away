/* AIA Internet / .aia TLD on Account. Honest lock status + on-desk Register when unlocked.
   Browser calls approve-registration with the connected owner. James signs every tx. Collect HOLD. */
(function () {
  var REGISTER = "https://dns.decentraweb.org/name/aia";
  var LOCKED = "Bridge locked on Decentraweb — watching. When unlocked, Connect wallet then Register.";
  var READY = "Ready to mint when Bridge clears.";
  var HOLD = "Collect stays HOLD. AIA holds no keys. James signs mint in MetaMask when Bridge clears.";
  var SAVE_KEY = "aia_tld_register";
  var last = null;
  var busy = false;
  var tick = null;

  function host() { return document.getElementById("aia-tld"); }
  function abi() { return window.AIARegisterAbi || null; }
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
  function opened() {
    return !!(localStorage.getItem("aia_session") || (localStorage.getItem("aia_ws") && localStorage.getItem("aia_pin")));
  }
  function localWallet() {
    if (window.AIAWallet && AIAWallet.local) return AIAWallet.local();
    var address = String(localStorage.getItem("aia_wallet_address") || "").trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return { connected: false, short: "", address: "", chainId: 0 };
    return { connected: true, address: address, short: address.slice(0, 6) + "…" + address.slice(-4), chainId: Number(localStorage.getItem("aia_wallet_chain") || 0) || 0 };
  }
  function provider() {
    return (typeof window !== "undefined" && window.ethereum) || null;
  }
  function saved() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch (e) { return null; }
  }
  function persist(row) {
    if (!row) localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, JSON.stringify(row));
  }
  function msg(text, good) {
    var el = document.getElementById("aia-tld-msg");
    if (!el) return;
    el.className = good ? "ok" : "meta";
    el.textContent = text || "";
  }
  function WATCH_NOTE() {
    return "Watching Decentraweb for .aia. Collect stays HOLD.";
  }

  function checklist(unlocked, connected) {
    return "<ol class=\"aia-tld-steps\">" +
      "<li>" + (connected ? "Wallet is connected on Ethereum mainnet." : "Connect a browser wallet on this Account (Ethereum mainnet).") + "</li>" +
      "<li>" + (unlocked ? "Tap Register .aia on this desk." : "When Bridge clears, tap Register .aia on this desk.") + "</li>" +
      "<li>James signs commit in MetaMask. AIA does not send the tx.</li>" +
      "<li>Wait 60 seconds, then sign register — " + esc("~0.041–0.045 ETH/yr + 10% buffer + gas, or DWEB") + ".</li>" +
      "</ol>";
  }

  function waitLeft(row) {
    if (!row || !row.committedAt) return (abi() && abi().WAIT_MS) || 60000;
    var wait = (abi() && abi().WAIT_MS) || 60000;
    return Math.max(0, wait - (Date.now() - Number(row.committedAt)));
  }

  function paint(state, hint) {
    var el = host();
    if (!el) return;
    var tld = (state && (state.aiaTld || state.tld)) || state || {};
    last = tld;
    var local = localWallet();
    var wallet = (tld.wallet && tld.wallet.connected && (tld.wallet.address || tld.wallet.short)) ? tld.wallet : local;
    if (local.connected && local.address) wallet = Object.assign({}, wallet, local);
    var status = tld.status || (tld.ownedByConnected ? "owned" : tld.bridgeLocked ? "bridge-locked" : tld.available ? "available" : "watching");
    var label = tld.label || (status === "owned" ? "Owned" : status === "available" ? "Available to register" : status === "bridge-locked" ? "Bridge locked" : "Watching");
    var short = (wallet && (wallet.short || (wallet.address ? wallet.address.slice(0, 6) + "…" + wallet.address.slice(-4) : ""))) || "";
    var connected = !!(wallet && wallet.connected && (wallet.address || short));
    var row = saved();
    var body = "<p><strong id=\"aia-tld-status\">" + esc(label) + "</strong></p>";
    if (status === "owned") {
      body += "<p class=\"meta\">.aia is on this connected wallet" + (short ? " · " + esc(short) : "") + ".</p>";
      persist(null);
    } else if (status === "available") {
      body += availableBody(tld, wallet, connected, short, row);
    } else {
      body += "<p class=\"meta\" id=\"aia-tld-copy\">" + esc(status === "bridge-locked" ? LOCKED : (tld.note || WATCH_NOTE())) + "</p>";
      if (connected && short) {
        body += "<p><strong id=\"aia-tld-wallet\">" + esc(short) + "</strong></p>";
        body += "<p class=\"meta\" id=\"aia-tld-ready\">" + esc(READY) + "</p>";
      }
      body += checklist(false, connected);
      body += "<p class=\"row\"><a class=\"edit\" id=\"aia-tld-watch\" href=\"" + esc(tld.registerUrl || REGISTER) + "\" target=\"_blank\" rel=\"noopener\">Watch on Decentraweb</a></p>";
    }
    el.innerHTML = "<h2>AIA Internet / .aia TLD</h2>" +
      "<p class=\"meta\">" + HOLD + "</p>" +
      body +
      "<p class=\"meta\" id=\"aia-tld-msg\">" + esc(hint || "") + "</p>";
    bind(status, connected);
    if (status === "available" && row && row.committedAt && waitLeft(row) > 0) startTick();
  }

  function availableBody(tld, wallet, connected, short, row) {
    var q = (row && row.quote) || (tld.register && tld.register.fee) || (tld.fee) || "~0.041–0.045 ETH/yr + gas, or DWEB";
    var estimate = (row && row.quote && row.quote.estimate) || q;
    var dweb = !!(row && row.dweb);
    var html = "<p class=\"meta\">" + esc(tld.note || "Bridge is clear. Connect wallet, then Register .aia.") + "</p>";
    if (connected && short) html += "<p><strong id=\"aia-tld-wallet\">" + esc(short) + "</strong></p>";
    html += checklist(true, connected);
    html += "<p class=\"meta\" id=\"aia-tld-fee\">Fee before send: " + esc(estimate) + ". Collect stays HOLD.</p>";
    if (connected) {
      html += "<p class=\"row\">" +
        "<button type=\"button\" class=\"" + (dweb ? "edit" : "go") + "\" id=\"aia-tld-pay-eth\">Pay ETH</button>" +
        "<button type=\"button\" class=\"" + (dweb ? "go" : "edit") + "\" id=\"aia-tld-pay-dweb\">Pay DWEB</button>" +
        "</p>";
    }
    html += "<p class=\"row\">";
    if (!connected) {
      html += "<button type=\"button\" class=\"go\" id=\"aia-tld-connect\">Connect Wallet</button>";
    } else if (row && row.status === "committed") {
      var left = waitLeft(row);
      html += "<button type=\"button\" class=\"go\" id=\"aia-tld-sign-register\"" + (left > 0 ? " disabled" : "") + ">" +
        (left > 0 ? ("Wait " + Math.ceil(left / 1000) + "s") : "Sign register") + "</button>";
    } else if (row && row.status === "quoted") {
      html += "<button type=\"button\" class=\"go\" id=\"aia-tld-sign-commit\">Sign commit</button>";
    } else {
      html += "<button type=\"button\" class=\"go\" id=\"aia-tld-register-btn\">Register .aia</button>";
    }
    html += "<a class=\"edit\" id=\"aia-tld-register\" href=\"" + esc(tld.registerUrl || REGISTER) + "\" target=\"_blank\" rel=\"noopener\">Open Decentraweb Register</a>";
    html += "</p>";
    if (row && row.commitTx) html += "<p class=\"meta\">Commit " + esc(row.commitTx) + "</p>";
    if (row && row.registerTx) html += "<p class=\"meta\">Register " + esc(row.registerTx) + "</p>";
    return html;
  }

  function bind(status, connected) {
    var connectBtn = document.getElementById("aia-tld-connect");
    var start = document.getElementById("aia-tld-register-btn");
    var commit = document.getElementById("aia-tld-sign-commit");
    var reg = document.getElementById("aia-tld-sign-register");
    var eth = document.getElementById("aia-tld-pay-eth");
    var dweb = document.getElementById("aia-tld-pay-dweb");
    if (connectBtn) connectBtn.onclick = askConnect;
    if (start) start.onclick = function () { startQuote(false); };
    if (commit) commit.onclick = function () { sendCommit(); };
    if (reg) reg.onclick = function () { sendRegister(); };
    if (eth) eth.onclick = function () { setPay(false); };
    if (dweb) dweb.onclick = function () { setPay(true); };
    if (status !== "available" && !connected) return;
  }

  function setPay(dweb) {
    var row = saved() || { status: "idle" };
    row.dweb = !!dweb;
    persist(row);
    paint({ aiaTld: last }, dweb ? "DWEB path. James still signs every tx." : "ETH path. James still signs every tx.");
    if (row.status === "quoted" || row.status === "idle") startQuote(!!dweb);
  }

  async function askConnect() {
    if (!opened()) {
      paint({ aiaTld: last }, "Open this desk first, then connect a browser wallet.");
      return;
    }
    if (window.AIAWallet && AIAWallet.connect) {
      await AIAWallet.connect();
      load();
      return;
    }
    paint({ aiaTld: last }, "Connect a browser wallet on the Wallet card first.");
  }

  async function ensureMainnet(eth) {
    var chain = "0x1";
    try { chain = await eth.request({ method: "eth_chainId" }); } catch (e) { chain = "0x1"; }
    if (String(chain).toLowerCase() === "0x1") return true;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1" }] });
      return true;
    } catch (err) {
      msg((err && err.message) || "Switch the wallet to Ethereum mainnet.");
      return false;
    }
  }

  async function accountsOf(eth) {
    var acc = await eth.request({ method: "eth_requestAccounts" });
    return acc && acc[0] ? String(acc[0]) : "";
  }

  async function startQuote(dwebFlag) {
    if (busy) return;
    var wallet = localWallet();
    if (!wallet.connected) {
      await askConnect();
      return;
    }
    var lib = abi();
    if (!lib) {
      msg("Register encoder is missing on this page.");
      return;
    }
    var eth = provider();
    if (!eth || typeof eth.request !== "function") {
      msg("No browser wallet on this phone. Install MetaMask, then tap Connect.");
      return;
    }
    busy = true;
    try {
      if (!(await ensureMainnet(eth))) return;
      var from = await accountsOf(eth);
      if (lib.normalizeAddress(from) !== lib.normalizeAddress(wallet.address)) {
        msg("Connected wallet must match the Account wallet.");
        return;
      }
      var dweb = dwebFlag != null ? !!dwebFlag : !!(saved() && saved().dweb);
      var rentWei = lib.FEE_HIGH_WEI;
      try {
        var call = lib.callRentPrice(dweb);
        var hex = await eth.request({ method: "eth_call", params: [{ to: call.to, data: call.data }, "latest"] });
        if (hex && hex !== "0x") rentWei = lib.parseWei(hex);
      } catch (e) {}
      var quote = lib.quoteOf({ dweb: dweb, rentWei: rentWei });
      try {
        var r = await fetch("/api/account", {
          method: "POST",
          headers: hdr(),
          body: JSON.stringify({ action: "aia-quote", owner: wallet.address, dweb: dweb, rentWei: rentWei })
        });
        var d = await r.json().catch(function () { return {}; });
        if (r.ok && d && d.quote) quote = d.quote;
      } catch (e) {}
      persist({
        status: "quoted",
        owner: wallet.address,
        dweb: dweb,
        quote: quote,
        at: Date.now()
      });
      paint({ aiaTld: last }, "Fee before send: " + quote.estimate + ". Tap Sign commit — James signs. AIA does not send.");
    } catch (err) {
      msg((err && err.message) || "Could not quote .aia.");
    } finally {
      busy = false;
    }
  }

  async function sendCommit() {
    if (busy) return;
    var lib = abi();
    var wallet = localWallet();
    var row = saved();
    if (!lib || !wallet.connected) {
      await askConnect();
      return;
    }
    var eth = provider();
    if (!eth || typeof eth.request !== "function") {
      msg("No browser wallet on this phone.");
      return;
    }
    busy = true;
    try {
      if (!(await ensureMainnet(eth))) return;
      var from = await accountsOf(eth);
      if (lib.normalizeAddress(from) !== lib.normalizeAddress(wallet.address)) {
        msg("Connected wallet must match the Account wallet.");
        return;
      }
      msg("Asking Decentraweb to approve .aia for this wallet…");
      var payload = lib.approvalPayload(from);
      var res = await fetch(lib.APPROVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      });
      var body = await res.json().catch(function () { return {}; });
      var approval = lib.parseApproval(body, payload);
      if (!approval.ok && (approval.bridgeLocked || lib.looksBridgeLock(res.status, body, JSON.stringify(body)))) {
        persist(null);
        paint({
          aiaTld: Object.assign({}, last || {}, {
            status: "bridge-locked",
            label: "Bridge locked",
            bridgeLocked: true,
            available: false,
            note: LOCKED
          })
        }, approval.error || LOCKED);
        return;
      }
      if (!approval.ok) {
        msg(approval.error || "Decentraweb did not approve registration.");
        return;
      }
      var tx = lib.txCommit(from, approval.commitment, approval.signature);
      msg("MetaMask will ask to sign commit. AIA does not send.");
      var hash = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: tx.from, to: tx.to, data: tx.data, value: tx.value }]
      });
      persist({
        status: "committed",
        owner: lib.normalizeAddress(from),
        dweb: !!(row && row.dweb),
        quote: (row && row.quote) || lib.quoteOf({ dweb: !!(row && row.dweb) }),
        approval: approval,
        secret: payload.secret,
        commitment: approval.commitment,
        signature: approval.signature,
        timestamp: approval.timestamp,
        commitTx: hash,
        committedAt: Date.now()
      });
      paint({ aiaTld: last }, "Commit sent. Wait ~60s, then tap Sign register. Fee stays on screen. Collect stays HOLD.");
      startTick();
    } catch (err) {
      msg((err && (err.message || err.error)) || "Commit was not sent.");
    } finally {
      busy = false;
    }
  }

  async function sendRegister() {
    if (busy) return;
    var lib = abi();
    var wallet = localWallet();
    var row = saved();
    if (!lib || !wallet.connected || !row || !row.approval) {
      msg("Start Register .aia again — the commit step is missing.");
      return;
    }
    if (waitLeft(row) > 0) {
      paint({ aiaTld: last }, "Wait " + Math.ceil(waitLeft(row) / 1000) + "s after commit, then sign register.");
      return;
    }
    var eth = provider();
    if (!eth || typeof eth.request !== "function") {
      msg("No browser wallet on this phone.");
      return;
    }
    busy = true;
    try {
      if (!(await ensureMainnet(eth))) return;
      var from = await accountsOf(eth);
      if (lib.normalizeAddress(from) !== lib.normalizeAddress(row.owner || wallet.address)) {
        msg("Same wallet that signed commit must sign register.");
        return;
      }
      var quote = row.quote || lib.quoteOf({ dweb: !!row.dweb });
      if (row.dweb) {
        msg("MetaMask will ask to approve DWEB spend if needed, then register.");
        var allowCall = { to: lib.DWEB_TOKEN, data: lib.encodeAllowance(from, lib.CONTROLLER) };
        var allowHex = "0x0";
        try { allowHex = await eth.request({ method: "eth_call", params: [allowCall, "latest"] }); } catch (e) { allowHex = "0x0"; }
        if (BigInt(lib.parseWei(allowHex)) < BigInt(quote.safeWei)) {
          var approveTx = lib.txApproveDweb(from, quote.safeWei);
          await eth.request({
            method: "eth_sendTransaction",
            params: [{ from: approveTx.from, to: approveTx.to, data: approveTx.data, value: approveTx.value }]
          });
        }
      }
      var tx = lib.txRegister({
        names: [lib.LABEL],
        owner: from,
        durations: [lib.DURATION_ONE_YEAR],
        secret: row.secret || (row.approval && row.approval.secret),
        chainId: lib.CHAIN_ID,
        timestamp: row.timestamp || (row.approval && row.approval.timestamp),
        dweb: !!row.dweb,
        fee: quote.safeWei
      });
      msg("Fee before send: " + quote.estimate + ". MetaMask will ask to sign register. AIA does not send.");
      var hash = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: tx.from, to: tx.to, data: tx.data, value: tx.value }]
      });
      persist(Object.assign({}, row, { status: "registered", registerTx: hash }));
      paint({ aiaTld: last }, "Register sent " + hash + ". Refreshing .aia status. Collect stays HOLD.");
      load();
    } catch (err) {
      msg((err && (err.message || err.error)) || "Register was not sent.");
    } finally {
      busy = false;
    }
  }

  function startTick() {
    if (tick) return;
    tick = setInterval(function () {
      var row = saved();
      if (!row || row.status !== "committed") {
        clearInterval(tick);
        tick = null;
        return;
      }
      if (waitLeft(row) <= 0) {
        clearInterval(tick);
        tick = null;
        paint({ aiaTld: last }, "60s is up. Tap Sign register. Fee is still on screen. Collect stays HOLD.");
        return;
      }
      var btn = document.getElementById("aia-tld-sign-register");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Wait " + Math.ceil(waitLeft(row) / 1000) + "s";
      }
    }, 1000);
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
  window.AIATld = { boot: boot, load: load, paint: paint, fromWallet: fromWallet, startQuote: startQuote, sendCommit: sendCommit, sendRegister: sendRegister };
})();
