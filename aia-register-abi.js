/* Raw ABI calldata for Decentraweb RootRegistrarController.
   Browser + Node. No ethers. No @decentraweb/core. No keys. No broadcast. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.AIARegisterAbi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var CONTROLLER = "0xcCbCa4F9651Ef122D58d7EC5acCa27D806840209";
  var DWEB_TOKEN = "0xE7f58A92476056627f9FdB92286778aBd83b285F";
  var DWEB_REGISTRY = "0x8eb93AB94A6Afa8d416aB1884Ebb5A3f00920a7A";
  var LABEL = "aia";
  var CHAIN_ID = 1;
  var DURATION_ONE_YEAR = 31556926;
  var WAIT_MS = 60 * 1000;
  var APPROVAL_TTL_MS = 30 * 60 * 1000;
  var FEE_LOW_WEI = "41000000000000000";
  var FEE_HIGH_WEI = "45000000000000000";
  var BUFFER_PCT = 10;
  var APPROVE_URL = "https://api.decentraweb.org/api/v1/approve-registration";
  var SELECTOR = {
    commit: "0x0cff2adf",
    registerWithConfigBatch: "0x2cc9db8a",
    rentPrice: "0x6cfc51e2",
    approve: "0x095ea7b3",
    allowance: "0xdd62ed3e",
    balanceOf: "0x70a08231"
  };

  function hexOf(bytes) {
    var out = "";
    for (var i = 0; i < bytes.length; i++) out += ("0" + (bytes[i] & 255).toString(16)).slice(-2);
    return out;
  }

  function utf8Bytes(s) {
    if (typeof TextEncoder !== "undefined") return new Uint8Array(new TextEncoder().encode(String(s)));
    var str = String(s);
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xd800 && c <= 0xdbff) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return Uint8Array.from(out);
  }

  function toBytes(input) {
    if (input instanceof Uint8Array) return input;
    if (typeof input === "string") {
      if (/^0x[0-9a-fA-F]*$/.test(input) && input.length % 2 === 0) {
        var hex = input.slice(2);
        var buf = new Uint8Array(hex.length / 2);
        for (var i = 0; i < buf.length; i++) buf[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        return buf;
      }
      return utf8Bytes(input);
    }
    if (Array.isArray(input)) return Uint8Array.from(input);
    return utf8Bytes(String(input || ""));
  }

  /* Keccak-256 (Ethereum pad 0x01). Empty → c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470 */
  function keccak256(input) {
    var msg = toBytes(input);
    var RC = [
      1, 0, 32898, 0, 32906, 2147483648, 2147516416, 2147483648, 32907, 0, 2147483649, 0,
      2147516545, 2147483648, 32777, 2147483648, 138, 0, 136, 0, 2147516425, 0, 2147483658, 0,
      2147516555, 0, 139, 2147483648, 32905, 2147483648, 32771, 2147483648, 32770, 2147483648,
      128, 2147483648, 32778, 0, 2147483658, 2147483648, 2147516545, 2147483648, 32896, 2147483648,
      2147483649, 0, 2147516424, 2147483648
    ];
    var s = new Uint32Array(50);
    var i, j, n, c0, c1;
    var rate = 136;
    var blocks = Math.floor(msg.length / rate) + 1;
    var padded = new Uint8Array(blocks * rate);
    padded.set(msg);
    padded[msg.length] ^= 0x01;
    padded[padded.length - 1] ^= 0x80;
    for (n = 0; n < padded.length; n += rate) {
      for (i = 0; i < rate / 4; i++) {
        s[i] ^= padded[n + i * 4] | (padded[n + i * 4 + 1] << 8) | (padded[n + i * 4 + 2] << 16) | (padded[n + i * 4 + 3] << 24);
      }
      for (var round = 0; round < 24; round++) {
        var C = new Uint32Array(10);
        for (i = 0; i < 5; i++) {
          C[i * 2] = s[i * 2] ^ s[i * 2 + 10] ^ s[i * 2 + 20] ^ s[i * 2 + 30] ^ s[i * 2 + 40];
          C[i * 2 + 1] = s[i * 2 + 1] ^ s[i * 2 + 11] ^ s[i * 2 + 21] ^ s[i * 2 + 31] ^ s[i * 2 + 41];
        }
        for (i = 0; i < 5; i++) {
          var d0 = C[((i + 4) % 5) * 2] ^ rotl32(C[((i + 1) % 5) * 2], C[((i + 1) % 5) * 2 + 1], 1)[0];
          var d1 = C[((i + 4) % 5) * 2 + 1] ^ rotl32(C[((i + 1) % 5) * 2], C[((i + 1) % 5) * 2 + 1], 1)[1];
          for (j = 0; j < 5; j++) {
            s[i * 2 + j * 10] ^= d0;
            s[i * 2 + j * 10 + 1] ^= d1;
          }
        }
        var B = new Uint32Array(50);
        B[0] = s[0];
        B[1] = s[1];
        var r = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
        var pi = [0, 10, 20, 5, 15, 16, 1, 11, 21, 6, 7, 17, 2, 12, 22, 23, 8, 18, 3, 13, 14, 24, 9, 19, 4];
        for (i = 1; i < 25; i++) {
          var rot = rotl32(s[i * 2], s[i * 2 + 1], r[i]);
          B[pi[i] * 2] = rot[0];
          B[pi[i] * 2 + 1] = rot[1];
        }
        for (i = 0; i < 5; i++) {
          for (j = 0; j < 5; j++) {
            var idx = i * 2 + j * 10;
            s[idx] = B[idx] ^ ((~B[((i + 1) % 5) * 2 + j * 10]) & B[((i + 2) % 5) * 2 + j * 10]);
            s[idx + 1] = B[idx + 1] ^ ((~B[((i + 1) % 5) * 2 + j * 10 + 1]) & B[((i + 2) % 5) * 2 + j * 10 + 1]);
          }
        }
        s[0] ^= RC[round * 2];
        s[1] ^= RC[round * 2 + 1];
      }
    }
    var out = new Uint8Array(32);
    for (i = 0; i < 8; i++) {
      out[i * 4] = s[i] & 255;
      out[i * 4 + 1] = (s[i] >>> 8) & 255;
      out[i * 4 + 2] = (s[i] >>> 16) & 255;
      out[i * 4 + 3] = (s[i] >>> 24) & 255;
    }
    return "0x" + hexOf(out);

    function rotl32(lo, hi, n) {
      n %= 64;
      if (!n) return [lo, hi];
      if (n === 32) return [hi, lo];
      if (n < 32) return [(lo << n) | (hi >>> (32 - n)), (hi << n) | (lo >>> (32 - n))];
      n -= 32;
      return [(hi << n) | (lo >>> (32 - n)), (lo << n) | (hi >>> (32 - n))];
    }
  }

  function selectorOf(sig) {
    return "0x" + keccak256(sig).slice(2, 10);
  }

  function pad64(hex) {
    var h = String(hex || "").replace(/^0x/i, "").toLowerCase();
    if (h.length > 64) h = h.slice(-64);
    while (h.length < 64) h = "0" + h;
    return h;
  }

  function encodeUint(value) {
    var n = typeof value === "bigint" ? value : BigInt(String(value == null ? 0 : value));
    if (n < 0n) throw new Error("uint cannot be negative");
    return pad64(n.toString(16));
  }

  function encodeBool(v) {
    return encodeUint(v ? 1 : 0);
  }

  function encodeAddress(addr) {
    var a = normalizeAddress(addr);
    if (!a) throw new Error("Need an Ethereum address.");
    return pad64(a.slice(2));
  }

  function encodeBytes32(hex) {
    var h = String(hex || "").replace(/^0x/i, "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(h)) throw new Error("Need a 32-byte hex value.");
    return h;
  }

  function utf8Hex(s) {
    return hexOf(utf8Bytes(s));
  }

  function encodeBytes(hexNoPrefix) {
    var h = String(hexNoPrefix || "");
    var len = encodeUint(h.length / 2);
    var pad = (64 - (h.length % 64)) % 64;
    return len + h + (pad ? "0".repeat(pad) : "");
  }

  function encodeString(s) {
    return encodeBytes(utf8Hex(s));
  }

  function encodeStringArray(arr) {
    var list = Array.isArray(arr) ? arr : [arr];
    var head = encodeUint(list.length);
    var offsets = "";
    var tail = "";
    var offset = list.length * 32;
    for (var i = 0; i < list.length; i++) {
      offsets += encodeUint(offset);
      var enc = encodeString(list[i]);
      tail += enc;
      offset += enc.length / 2;
    }
    return head + offsets + tail;
  }

  function encodeUintArray(arr) {
    var list = Array.isArray(arr) ? arr : [arr];
    var out = encodeUint(list.length);
    for (var i = 0; i < list.length; i++) out += encodeUint(list[i]);
    return out;
  }

  function withSelector(sel, body) {
    return String(sel).toLowerCase() + String(body || "").toLowerCase();
  }

  function normalizeAddress(raw) {
    var s = String(raw || "").trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(s)) return "";
    return "0x" + s.slice(2).toLowerCase();
  }

  function checksumAddress(raw) {
    var lower = normalizeAddress(raw);
    if (!lower) return "";
    var hash = keccak256(lower.slice(2)).slice(2);
    var out = "0x";
    for (var i = 0; i < 40; i++) {
      var c = lower.charAt(2 + i);
      out += parseInt(hash.charAt(i), 16) >= 8 ? c.toUpperCase() : c;
    }
    return out;
  }

  function shortAddress(addr) {
    var a = normalizeAddress(addr);
    if (!a) return "";
    return a.slice(0, 6) + "…" + a.slice(-4);
  }

  function randomSecret() {
    var bytes = new Uint8Array(32);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else {
      var nodeCrypto = null;
      try { nodeCrypto = require("crypto"); } catch (e) { nodeCrypto = null; }
      if (nodeCrypto && nodeCrypto.randomBytes) bytes = nodeCrypto.randomBytes(32);
      else throw new Error("No CSPRNG on this box.");
    }
    return "0x" + hexOf(bytes);
  }

  function splitSignature(sig) {
    var h = String(sig || "").replace(/^0x/i, "").toLowerCase();
    if (h.length !== 130) throw new Error("Need a 65-byte signature.");
    var r = "0x" + h.slice(0, 64);
    var s = "0x" + h.slice(64, 128);
    var v = parseInt(h.slice(128, 130), 16);
    if (v < 27) v += 27;
    return { v: v, r: r, s: s };
  }

  function encodeCommit(commitment, signature) {
    var parts = splitSignature(signature);
    return withSelector(SELECTOR.commit, encodeBytes32(commitment) + encodeUint(parts.v) + encodeBytes32(parts.r) + encodeBytes32(parts.s));
  }

  function encodeRentPrice(name, duration, dweb) {
    var head = encodeUint(96) + encodeUint(duration == null ? DURATION_ONE_YEAR : duration) + encodeBool(!!dweb);
    return withSelector(SELECTOR.rentPrice, head + encodeString(name || LABEL));
  }

  function encodeRegister(opts) {
    var names = (opts && opts.names) || [LABEL];
    var owner = checksumAddress((opts && opts.owner) || "") || normalizeAddress((opts && opts.owner) || "");
    var durations = (opts && opts.durations) || names.map(function () { return DURATION_ONE_YEAR; });
    var secret = opts && opts.secret;
    var chainId = (opts && opts.chainId) || CHAIN_ID;
    var timestamp = opts && opts.timestamp;
    var dweb = !!(opts && (opts.dweb || opts.isFeeInDWEBToken));
    var fee = (opts && (opts.fee || opts.safePrice)) || "0";
    if (!owner) throw new Error("Register needs the connected owner address.");
    if (!secret) throw new Error("Register needs the approval secret.");
    if (timestamp == null) throw new Error("Register needs the approval timestamp.");
    var namesEnc = encodeStringArray(names);
    var dursEnc = encodeUintArray(durations);
    var head =
      encodeUint(256) +
      encodeAddress(owner) +
      encodeUint(256 + namesEnc.length / 2) +
      encodeBytes32(secret) +
      encodeUint(chainId) +
      encodeUint(timestamp) +
      encodeBool(dweb) +
      encodeUint(fee);
    return withSelector(SELECTOR.registerWithConfigBatch, head + namesEnc + dursEnc);
  }

  function encodeApprove(spender, amount) {
    return withSelector(SELECTOR.approve, encodeAddress(spender || CONTROLLER) + encodeUint(amount || 0));
  }

  function encodeAllowance(owner, spender) {
    return withSelector(SELECTOR.allowance, encodeAddress(owner) + encodeAddress(spender || CONTROLLER));
  }

  function encodeBalanceOf(owner) {
    return withSelector(SELECTOR.balanceOf, encodeAddress(owner));
  }

  function mulDiv(wei, num, den) {
    return ((typeof wei === "bigint" ? wei : BigInt(String(wei))) * BigInt(num)) / BigInt(den);
  }

  function withBuffer(wei, pct) {
    var p = pct == null ? BUFFER_PCT : pct;
    return mulDiv(wei, 100 + p, 100).toString();
  }

  function formatEth(wei) {
    var n = typeof wei === "bigint" ? wei : BigInt(String(wei || "0"));
    var whole = n / 1000000000000000000n;
    var frac = (n % 1000000000000000000n).toString().padStart(18, "0").replace(/0+$/, "");
    return frac ? whole.toString() + "." + frac.slice(0, 6).replace(/0+$/, "") : whole.toString();
  }

  function parseWei(hex) {
    var h = String(hex || "0x0");
    if (!h || h === "0x") return "0";
    return BigInt(h).toString();
  }

  function quoteOf(opts) {
    var dweb = !!(opts && opts.dweb);
    var rent = (opts && opts.rentWei) || FEE_HIGH_WEI;
    var safe = withBuffer(rent, opts && opts.bufferPct);
    var low = withBuffer(FEE_LOW_WEI);
    var high = withBuffer(FEE_HIGH_WEI);
    return {
      name: LABEL,
      tld: ".aia",
      chainId: CHAIN_ID,
      duration: DURATION_ONE_YEAR,
      durationLabel: "1 year",
      controller: CONTROLLER,
      dwebToken: DWEB_TOKEN,
      registry: DWEB_REGISTRY,
      dweb: dweb,
      currency: dweb ? "DWEB" : "ETH",
      rentWei: String(rent),
      safeWei: String(safe),
      rentEth: formatEth(rent),
      safeEth: formatEth(safe),
      fee: "~0.041–0.045 ETH/yr + gas, or DWEB",
      bufferPct: opts && opts.bufferPct != null ? opts.bufferPct : BUFFER_PCT,
      estimate: dweb
        ? (formatEth(safe) + " DWEB (includes " + BUFFER_PCT + "% buffer)")
        : (formatEth(safe) + " ETH (includes " + BUFFER_PCT + "% buffer; rent ~0.041–0.045 ETH)"),
      rangeWei: { low: low, high: high },
      waitMs: WAIT_MS,
      approvalTtlMs: APPROVAL_TTL_MS,
      approveUrl: APPROVE_URL,
      mint: false,
      custodial: false,
      charged: false,
      collect: "hold",
      note: "James signs commit, waits ~60s, then signs register. AIA holds no keys. Collect stays HOLD."
    };
  }

  function approvalPayload(owner, secret) {
    var addr = checksumAddress(owner) || normalizeAddress(owner);
    if (!addr) throw new Error("Approval needs the connected wallet address.");
    return {
      name: [LABEL],
      owner: checksumAddress(addr) || addr,
      chainid: CHAIN_ID,
      secret: secret || randomSecret()
    };
  }

  function looksBridgeLock(status, body, text) {
    var blob = String(status || "") + " " + String(text || "") + " " + JSON.stringify(body || {});
    if (/bridge lock/i.test(blob)) return true;
    if (/failed to get bridge lock/i.test(blob)) return true;
    if (/failed to check domain is bridge lock/i.test(blob)) return true;
    return false;
  }

  function parseApproval(body, payload) {
    var row = body && typeof body === "object" ? body : {};
    if (row.errorMessage || (row.error && !row.commitment && !row.signature)) {
      return {
        ok: false,
        bridgeLocked: looksBridgeLock(0, row, row.errorMessage || ""),
        error: row.errorMessage || (Array.isArray(row.error) && row.error[0] && row.error[0].error) || "Decentraweb did not approve registration."
      };
    }
    if (!row.commitment || !row.signature || row.timestamp == null) {
      return { ok: false, bridgeLocked: looksBridgeLock(0, row, ""), error: "Decentraweb approval was incomplete." };
    }
    return {
      ok: true,
      commitment: row.commitment,
      signature: row.signature,
      timestamp: Number(row.timestamp),
      secret: payload && payload.secret,
      owner: payload && payload.owner,
      names: (payload && payload.name) || [LABEL],
      expiresAt: (Number(row.timestamp) + APPROVAL_TTL_MS / 1000) * 1000
    };
  }

  function txCommit(from, commitment, signature) {
    return {
      from: normalizeAddress(from),
      to: CONTROLLER,
      data: encodeCommit(commitment, signature),
      value: "0x0",
      chainId: "0x1"
    };
  }

  function txRegister(opts) {
    var fee = String((opts && (opts.fee || opts.safeWei)) || "0");
    var dweb = !!(opts && opts.dweb);
    return {
      from: normalizeAddress(opts.owner),
      to: CONTROLLER,
      data: encodeRegister(opts),
      value: dweb ? "0x0" : "0x" + BigInt(fee).toString(16),
      chainId: "0x1"
    };
  }

  function txApproveDweb(from, amount) {
    return {
      from: normalizeAddress(from),
      to: DWEB_TOKEN,
      data: encodeApprove(CONTROLLER, amount),
      value: "0x0",
      chainId: "0x1"
    };
  }

  function callRentPrice(dweb) {
    return { to: CONTROLLER, data: encodeRentPrice(LABEL, DURATION_ONE_YEAR, !!dweb) };
  }

  function verifySelectors() {
    var want = {
      "commit(bytes32,uint8,bytes32,bytes32)": SELECTOR.commit,
      "registerWithConfigBatch(string[],address,uint256[],bytes32,uint256,uint256,bool,uint256)": SELECTOR.registerWithConfigBatch,
      "rentPrice(string,uint256,bool)": SELECTOR.rentPrice,
      "approve(address,uint256)": SELECTOR.approve,
      "allowance(address,address)": SELECTOR.allowance,
      "balanceOf(address)": SELECTOR.balanceOf
    };
    var out = {};
    Object.keys(want).forEach(function (sig) {
      out[sig] = { want: want[sig], got: selectorOf(sig), ok: selectorOf(sig) === want[sig] };
    });
    return out;
  }

  return {
    CONTROLLER: CONTROLLER,
    DWEB_TOKEN: DWEB_TOKEN,
    DWEB_REGISTRY: DWEB_REGISTRY,
    LABEL: LABEL,
    CHAIN_ID: CHAIN_ID,
    DURATION_ONE_YEAR: DURATION_ONE_YEAR,
    WAIT_MS: WAIT_MS,
    APPROVAL_TTL_MS: APPROVAL_TTL_MS,
    FEE_LOW_WEI: FEE_LOW_WEI,
    FEE_HIGH_WEI: FEE_HIGH_WEI,
    BUFFER_PCT: BUFFER_PCT,
    APPROVE_URL: APPROVE_URL,
    SELECTOR: SELECTOR,
    keccak256: keccak256,
    selectorOf: selectorOf,
    normalizeAddress: normalizeAddress,
    checksumAddress: checksumAddress,
    shortAddress: shortAddress,
    randomSecret: randomSecret,
    splitSignature: splitSignature,
    encodeCommit: encodeCommit,
    encodeRegister: encodeRegister,
    encodeRentPrice: encodeRentPrice,
    encodeApprove: encodeApprove,
    encodeAllowance: encodeAllowance,
    encodeBalanceOf: encodeBalanceOf,
    withBuffer: withBuffer,
    formatEth: formatEth,
    parseWei: parseWei,
    quoteOf: quoteOf,
    approvalPayload: approvalPayload,
    looksBridgeLock: looksBridgeLock,
    parseApproval: parseApproval,
    txCommit: txCommit,
    txRegister: txRegister,
    txApproveDweb: txApproveDweb,
    callRentPrice: callRentPrice,
    verifySelectors: verifySelectors
  };
});
