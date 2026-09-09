/* On-desk .aia register quotes + calldata. No keys. No approve-registration.
   Browser calls Decentraweb with the connected owner. James signs every tx. Collect HOLD. */
const abi = require("../aia-register-abi");
const connect = require("./_connect-wallet");

const HOLD_NOTE = "James signs commit, waits ~60s, then signs register. AIA holds no keys. Collect stays HOLD.";

function ownerOf(raw) {
  return abi.checksumAddress(raw) || abi.normalizeAddress(raw);
}

function quote(opts) {
  const owner = ownerOf((opts && (opts.owner || opts.walletAddress || opts.address)) || "");
  const dweb = !!(opts && (opts.dweb || opts.pay === "dweb" || opts.currency === "DWEB"));
  const rentWei = (opts && (opts.rentWei || opts.rent)) || abi.FEE_HIGH_WEI;
  const row = abi.quoteOf({ dweb: dweb, rentWei: rentWei, bufferPct: opts && opts.bufferPct });
  row.owner = owner;
  row.ownerShort = owner ? abi.shortAddress(owner) : "";
  row.rentPriceCall = abi.callRentPrice(dweb);
  row.approveCall = dweb && owner ? abi.txApproveDweb(owner, row.safeWei) : null;
  row.custodial = false;
  row.charged = false;
  row.collect = "hold";
  row.mint = false;
  row.broadcast = false;
  row.approveRegistration = false;
  row.note = HOLD_NOTE;
  return row;
}

function encodePlan(body) {
  const owner = ownerOf((body && (body.owner || body.walletAddress || body.address)) || "");
  if (!owner) return { ok: false, status: 400, error: "Connect a wallet first. Register uses that address as owner." };
  const dweb = !!(body && (body.dweb || body.pay === "dweb" || body.currency === "DWEB"));
  const q = quote(Object.assign({}, body, { owner: owner, dweb: dweb }));
  const approval = body && (body.approval || body);
  const hasApproval = !!(approval && approval.commitment && approval.signature && approval.secret && approval.timestamp != null);
  const plan = {
    ok: true,
    quote: q,
    owner: owner,
    dweb: dweb,
    waitMs: abi.WAIT_MS,
    controller: abi.CONTROLLER,
    dwebToken: abi.DWEB_TOKEN,
    approveUrl: abi.APPROVE_URL,
    approvalPayload: hasApproval ? null : abi.approvalPayload(owner, (body && body.secret) || undefined),
    commit: null,
    register: null,
    approveDweb: dweb ? abi.txApproveDweb(owner, q.safeWei) : null,
    rentPriceCall: q.rentPriceCall,
    custodial: false,
    charged: false,
    collect: "hold",
    mint: false,
    broadcast: false,
    approveRegistration: false,
    note: HOLD_NOTE
  };
  if (hasApproval) {
    const parsed = abi.parseApproval({
      commitment: approval.commitment,
      signature: approval.signature,
      timestamp: approval.timestamp
    }, {
      secret: approval.secret,
      owner: owner,
      name: [abi.LABEL]
    });
    if (!parsed.ok) return { ok: false, status: 400, error: parsed.error, bridgeLocked: !!parsed.bridgeLocked };
    plan.commit = abi.txCommit(owner, parsed.commitment, parsed.signature);
    plan.register = abi.txRegister({
      names: [abi.LABEL],
      owner: owner,
      durations: [abi.DURATION_ONE_YEAR],
      secret: parsed.secret,
      chainId: abi.CHAIN_ID,
      timestamp: parsed.timestamp,
      dweb: dweb,
      fee: (body && (body.fee || body.safeWei)) || q.safeWei
    });
  }
  return plan;
}

function publicFlow(wallet) {
  const w = wallet && wallet.connected && wallet.address ? wallet : connect.emptyPublic();
  const owner = ownerOf(w.address || "");
  return {
    ready: !!(owner && w.connected),
    owner: owner,
    ownerShort: owner ? abi.shortAddress(owner) : "",
    controller: abi.CONTROLLER,
    waitMs: abi.WAIT_MS,
    fee: abi.quoteOf({}).fee,
    approveUrl: abi.APPROVE_URL,
    custodial: false,
    charged: false,
    collect: "hold",
    mint: false,
    approveRegistration: false,
    note: owner
      ? "Register .aia from this desk when Bridge is clear. James signs in MetaMask. Collect stays HOLD."
      : "Connect a browser wallet first. Register uses that address as owner."
  };
}

function healthBlock() {
  return {
    register: "client commit→wait→register",
    approveRegistration: false,
    custodial: false,
    charged: false,
    collect: "hold",
    mint: false,
    note: "On-desk Register encodes calldata only. Browser calls approve-registration with the connected owner. Server never signs."
  };
}

module.exports = {
  HOLD_NOTE,
  quote,
  encodePlan,
  publicFlow,
  healthBlock,
  abi
};
