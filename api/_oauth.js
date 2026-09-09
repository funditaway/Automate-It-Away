const IDENTITY_SCOPES = ["openid", "email", "profile"];
const NEVER_SCOPES = [
  "gmail", "drive", "calendar", "mail.send", "payments", "paypal",
  "stripe", "policy", "bind", "premium", "commission", "illustration"
];

const PROVIDERS = [
  { id: "google", label: "Google", group: "live", status: "hold" },
  { id: "github", label: "GitHub", group: "live", status: "hold" },
  { id: "apple", label: "Apple", group: "live", status: "hold" },
  { id: "microsoft", label: "Microsoft", group: "live", status: "hold" },
  { id: "x", label: "X", group: "more", status: "hold" },
  { id: "amazon", label: "Amazon", group: "more", status: "hold" },
  { id: "facebook", label: "Facebook", group: "more", status: "hold" },
  { id: "grok", label: "Grok", group: "ask", status: "ask" },
  { id: "chatgpt", label: "ChatGPT", group: "ask", status: "ask" },
  { id: "claude", label: "Claude", group: "ask", status: "ask" },
  { id: "linkedin", label: "LinkedIn", group: "ext", status: "hold" },
  { id: "discord", label: "Discord", group: "ext", status: "hold" },
  { id: "vercel", label: "Vercel", group: "ext", status: "hold" },
  { id: "yahoo", label: "Yahoo", group: "ext", status: "hold" },
  { id: "passkey", label: "Passkey", group: "ext", status: "ask" },
  { id: "other", label: "Another site", group: "ext", status: "ask" }
];

function publicProviders() {
  return PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    name: p.label,
    group: p.group,
    status: p.status,
    live: p.status === "live",
    ask: p.status === "ask",
    hold: p.status === "hold",
    scopes: IDENTITY_SCOPES.slice(),
    purpose: "identity"
  }));
}

function complianceOf() {
  return {
    purpose: "identity",
    specialApiAccess: "hold",
    scopes: IDENTITY_SCOPES.slice(),
    neverScopes: NEVER_SCOPES.slice(),
    never: ["send", "stop", "pay", "draft", "bind", "premium", "commission"],
    privacy: "/legal",
    terms: "/legal",
    homepage: "https://automateitaway.com",
    pipes: "/connections",
    delete: "Leave this phone. Owner can delete a desk. Last owner cannot leave.",
    sellingLists: false,
    oneAccount: true,
    handleIsNotLogin: true,
    loginIsNotAPipe: true,
    insuranceFace: "Insurance / Quote It Away",
    note: "Account login asks a partner only who you are. Special API Access and paid pipes stay on Connections. Owner connects. AIA never uses a partner token to Send, Stop, pay, draft, bind, or place premium."
  };
}

function identitiesOf(account) {
  return Array.isArray(account && account.identities) ? account.identities : [];
}

function doorsOf(account) {
  const acc = account || {};
  return Number(!!acc.password) + Number(!!acc.pin) + identitiesOf(acc).length;
}

function startOAuth(body) {
  const id = String((body && (body.provider || body.id || body.site)) || "").toLowerCase().trim();
  const site = String((body && body.site) || "").trim();
  if (id === "other" || id === "site" || id === "ext") {
    if (!site) return { ok: false, status: 400, error: "Name the site." };
    return {
      ok: false,
      status: 409,
      ask: true,
      compliance: complianceOf(),
      error: "Ask. AIA can add that site as a login door. Identity only — never Send, Stop, pay, or draft."
    };
  }
  const row = PROVIDERS.find((p) => p.id === id);
  if (!row) return { ok: false, status: 400, error: "Name the site." };
  if (row.status === "ask") {
    return {
      ok: false,
      status: 409,
      ask: true,
      compliance: complianceOf(),
      error: "Ask. That vendor has not admitted AIA as a website login yet."
    };
  }
  return {
    ok: false,
    status: 409,
    hold: true,
    compliance: complianceOf(),
    error: "Hold. That door is on the wall until the app id is on the box. Identity scopes only."
  };
}

function unlinkProvider(account, providerId) {
  if (!account) return { ok: false, status: 401, error: "Sign in first." };
  const id = String(providerId || "").toLowerCase().trim();
  const list = identitiesOf(account);
  if (!list.some((row) => row && row.provider === id)) {
    return { ok: false, status: 404, error: "That login is not on this account." };
  }
  if (doorsOf(account) < 2) {
    return { ok: false, status: 409, error: "Keep one door. Set a password or keep another login before you unlink this one." };
  }
  account.identities = list.filter((row) => row && row.provider !== id);
  return { ok: true, identities: account.identities, doors: doorsOf(account) };
}

module.exports = {
  PROVIDERS,
  IDENTITY_SCOPES,
  NEVER_SCOPES,
  publicProviders,
  complianceOf,
  identitiesOf,
  doorsOf,
  startOAuth,
  unlinkProvider
};
