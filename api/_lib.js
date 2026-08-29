const PROVIDERS = {
  square: { label: "Square", acts: ["payout", "checkout"], env: ["SQUARE_ACCESS_TOKEN"] },
  ebay: { label: "eBay", acts: ["list", "unlist", "sync"], env: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"] },
  calendar: { label: "Google Calendar", acts: ["book", "cancel"], env: ["GOOGLE_CLIENT_ID"] },
  consign: { label: "Consign It Away store", acts: ["list", "payout"], env: ["CONSIGN_API_BASE"] },
  webhook: { label: "Custom webhook", acts: ["post"], env: [] },
  sms: { label: "SMS", acts: ["text"], env: ["TWILIO_ACCOUNT_SID"] },
  whatnot: { label: "Whatnot", acts: ["list"], env: ["WHATNOT_TOKEN"] }
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Workspace");
}

function configured(provider) {
  const spec = PROVIDERS[provider];
  if (!spec) return false;
  if (!spec.env.length) return true;
  return spec.env.some((k) => !!process.env[k]);
}

function catalog() {
  return Object.entries(PROVIDERS).map(([id, spec]) => ({
    id,
    label: spec.label,
    acts: spec.acts,
    live: configured(id),
    note: configured(id) ? "env present" : "connect when keys are set"
  }));
}

const mem = globalThis.__aia || (globalThis.__aia = { connections: [], jobs: [], audit: [] });

function log(agent, action, result) {
  mem.audit.unshift({ t: new Date().toISOString(), agent, action, result });
  mem.audit = mem.audit.slice(0, 200);
}

module.exports = { PROVIDERS, cors, configured, catalog, mem, log };
