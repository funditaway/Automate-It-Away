/* AIA Account world doors. Identity only. Never Send, Stop, pay, or draft.
   Underscore helper — not a Vercel function. Required from /api/auth or /api/account. */

const DOORS = [
  { id: "google", name: "Google", group: "live", kind: "oidc", env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] },
  { id: "github", name: "GitHub", group: "live", kind: "oidc", env: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"] },
  { id: "apple", name: "Apple", group: "live", kind: "oidc", env: ["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID"] },
  { id: "microsoft", name: "Microsoft", group: "live", kind: "oidc", env: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"] },
  { id: "x", name: "X", group: "more", kind: "oidc", env: ["X_CLIENT_ID", "X_CLIENT_SECRET"] },
  { id: "amazon", name: "Amazon", group: "more", kind: "oidc", env: ["AMAZON_CLIENT_ID", "AMAZON_CLIENT_SECRET"] },
  { id: "facebook", name: "Facebook", group: "more", kind: "oidc", env: ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"] },
  { id: "grok", name: "Grok", group: "ask", kind: "ask" },
  { id: "chatgpt", name: "ChatGPT", group: "ask", kind: "ask" },
  { id: "claude", name: "Claude", group: "ask", kind: "ask" },
  { id: "linkedin", name: "LinkedIn", group: "ext", kind: "oidc", env: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"] },
  { id: "discord", name: "Discord", group: "ext", kind: "oidc", env: ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"] },
  { id: "vercel", name: "Vercel", group: "ext", kind: "oidc", env: ["VERCEL_OAUTH_CLIENT_ID", "VERCEL_OAUTH_CLIENT_SECRET"] },
  { id: "yahoo", name: "Yahoo", group: "ext", kind: "oidc", env: ["YAHOO_CLIENT_ID", "YAHOO_CLIENT_SECRET"] },
  { id: "passkey", name: "Passkey", group: "ext", kind: "later" },
  { id: "other", name: "Another site", group: "ext", kind: "ask" }
];

const AUTH_URL = {
  google: "https://accounts.google.com/o/oauth2/v2/auth",
  github: "https://github.com/login/oauth/authorize",
  apple: "https://appleid.apple.com/auth/authorize",
  microsoft: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  x: "https://twitter.com/i/oauth2/authorize",
  amazon: "https://www.amazon.com/ap/oa",
  facebook: "https://www.facebook.com/v19.0/dialog/oauth",
  linkedin: "https://www.linkedin.com/oauth/v2/authorization",
  discord: "https://discord.com/oauth2/authorize",
  vercel: "https://vercel.com/oauth/authorize",
  yahoo: "https://api.login.yahoo.com/oauth2/request_auth"
};

const SCOPES = {
  google: "openid email profile",
  github: "read:user user:email",
  apple: "name email",
  microsoft: "openid email profile",
  x: "users.read tweet.read",
  amazon: "profile",
  facebook: "public_profile email",
  linkedin: "openid profile email",
  discord: "identify email",
  vercel: "openid email profile",
  yahoo: "openid email profile"
};

function envOn(name) {
  return !!(process.env[name] && String(process.env[name]).trim());
}

function hasKeys(door) {
  const need = (door && door.env) || [];
  return need.length > 0 && need.every(envOn);
}

function statusOf(door) {
  if (!door) return "hold";
  if (door.kind === "ask") return "ask";
  if (door.kind === "later") return "hold";
  return hasKeys(door) ? "live" : "hold";
}

function publicOf(door) {
  const status = statusOf(door);
  return {
    id: door.id,
    name: door.name,
    group: door.group,
    status: status,
    live: status === "live",
    note: status === "live"
      ? "Identity only. Never Send, Stop, pay, or draft."
      : status === "ask"
        ? "Ask. That vendor has not admitted AIA as a website login."
        : "Hold. Drop the app id on the box to light this door."
  };
}

function catalog(q) {
  const needle = String(q || "").trim().toLowerCase();
  return DOORS.filter((d) => {
    if (!needle) return true;
    return [d.id, d.name, d.group].join(" ").toLowerCase().indexOf(needle) >= 0;
  }).map(publicOf);
}

function publicProviders() {
  return {
    ok: true,
    providers: catalog(),
    note: "AIA Account world doors. Identity only. Never Send, Stop, pay, or draft.",
    landOn: "/onboard"
  };
}

function providerOf(id) {
  const key = String(id || "").trim().toLowerCase();
  if (key === "site" || key === "another") return DOORS.find((d) => d.id === "other");
  if (key === "twitter") return DOORS.find((d) => d.id === "x");
  if (key === "gmail") return DOORS.find((d) => d.id === "google");
  return DOORS.find((d) => d.id === key) || null;
}

function configured(id) {
  return hasKeys(providerOf(id));
}

function holdBody(door, extra) {
  const status = statusOf(door);
  const ask = status === "ask" || (door && door.kind === "ask");
  return Object.assign({
    ok: false,
    hold: !ask,
    ask: !!ask,
    status: 409,
    provider: door && door.id,
    error: ask
      ? (door && door.name ? door.name : "That door") + " is Ask until the vendor admits AIA as a website login."
      : (door && door.name ? door.name : "That door") + " is Hold until the app id is on the box.",
    hint: "Identity only. Never Send, Stop, pay, or draft. After a world signup, name your desk and pick a desk code."
  }, extra || {});
}

function callbackUrl(origin) {
  const base = String(origin || process.env.AIA_ORIGIN || "https://automateitaway.com").replace(/\/$/, "");
  return base + "/api/auth?oauth=1";
}

function startOAuth(provider, opts) {
  const door = typeof provider === "string" ? providerOf(provider) : provider;
  if (!door) return holdBody({ id: "other", name: "That door", kind: "ask" }, { ask: true });
  if (door.id === "other") return askOther(opts && opts.site);
  if (door.kind === "ask" || door.kind === "later" || !hasKeys(door)) return holdBody(door);
  const origin = (opts && opts.origin) || "";
  const clientId = process.env[door.env[0]];
  const url = AUTH_URL[door.id];
  if (!url || !clientId) return holdBody(door);
  const next = encodeURIComponent((opts && opts.next) || "onboard");
  const state = "aia_" + door.id + "_" + Date.now().toString(36) + "_" + next;
  const auth = url +
    "?client_id=" + encodeURIComponent(clientId) +
    "&redirect_uri=" + encodeURIComponent(callbackUrl(origin)) +
    "&response_type=code" +
    "&scope=" + encodeURIComponent(SCOPES[door.id] || "openid email") +
    "&state=" + encodeURIComponent(state);
  return { ok: true, url: auth, provider: door.id, state: state };
}

function finishOAuth(provider) {
  const door = typeof provider === "string" ? providerOf(provider) : provider;
  return holdBody(door || { id: "other", name: "That door", kind: "hold" }, {
    error: "Hold. Token exchange stays off until the app id is live on Vercel."
  });
}

function askOther(site) {
  const name = String(site || "").trim().slice(0, 80);
  return {
    ok: false,
    ask: true,
    hold: false,
    status: 409,
    provider: "other",
    site: name,
    error: name
      ? "Ask AIA. " + name + " is not a live AIA login yet. Identity only."
      : "Name the site. AIA will Ask. Identity only.",
    hint: name
      ? "Search " + name + " developer login / OAuth / OpenID docs. This does not mint a pipe or a draft key."
      : "Type any site on the internet."
  };
}

function identitiesOf(acc) {
  return ((acc && acc.identities) || []).map((row) => ({
    provider: row.provider,
    subject: row.subject,
    email: row.email || "",
    name: row.name || "",
    verified: !!row.verified,
    linkedAt: row.linkedAt || ""
  }));
}

function rememberIdentity(acc, ident) {
  if (!acc) return { ok: false, error: "No AIA account." };
  const provider = String((ident && ident.provider) || "").toLowerCase();
  const subject = String((ident && ident.subject) || "").trim();
  if (!provider || !subject) return { ok: false, error: "Need a provider and a subject." };
  acc.identities = acc.identities || [];
  const hit = acc.identities.find((row) => row.provider === provider && row.subject === subject);
  const row = {
    provider: provider,
    subject: subject,
    email: (ident && ident.email) || "",
    name: (ident && ident.name) || "",
    verified: !!(ident && ident.verified),
    linkedAt: (hit && hit.linkedAt) || new Date().toISOString()
  };
  if (hit) Object.assign(hit, row);
  else acc.identities.push(row);
  return { ok: true, identity: row, identities: identitiesOf(acc) };
}

function dropIdentity(acc, provider) {
  if (!acc) return { ok: false, status: 404, error: "No AIA account." };
  const id = String(provider || "").toLowerCase();
  const list = acc.identities || [];
  const next = list.filter((row) => row.provider !== id);
  if (next.length === list.length) return { ok: false, status: 404, error: "That door is not on this book." };
  const doorsLeft = next.length + (acc.password ? 1 : 0) + (acc.pin ? 1 : 0);
  if (doorsLeft < 1) {
    return { ok: false, status: 409, error: "Keep one door. Set a password or desk code before unlinking the last login." };
  }
  acc.identities = next;
  return { ok: true, identities: identitiesOf(acc) };
}

function linkProvider(acc, identity) {
  return rememberIdentity(acc, identity);
}

function unlinkProvider(acc, provider) {
  return dropIdentity(acc, provider);
}

function isRelayEmail(email) {
  const e = String(email || "").toLowerCase();
  return /@privaterelay\.appleid\.com$/.test(e) || /@users\.noreply\.github\.com$/.test(e);
}

function emailLinkable(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e || e.indexOf("@") < 1) return false;
  return !isRelayEmail(e);
}

function suggestAccount(mem, identity) {
  const email = identity && identity.verified && emailLinkable(identity.email) ? String(identity.email).toLowerCase() : "";
  if (!email || !mem) return null;
  const books = mem.accounts || mem.accountBook || [];
  const hit = books.find((acc) => acc && String(acc.email || "").toLowerCase() === email);
  if (!hit) return null;
  return { id: hit.id, name: hit.name || "", email: hit.email, suggest: true, autoMerge: false };
}

function findBySubject(mem, provider, subject) {
  const books = (mem && (mem.accounts || mem.accountBook)) || [];
  const id = String(provider || "").toLowerCase();
  const sub = String(subject || "").trim();
  for (let i = 0; i < books.length; i++) {
    const acc = books[i];
    const hit = ((acc && acc.identities) || []).find((row) => row.provider === id && row.subject === sub);
    if (hit) return acc;
  }
  return null;
}

function doorsOf() {
  return DOORS.map(publicOf);
}

module.exports = {
  catalog: catalog,
  publicProviders: publicProviders,
  publicOf: publicOf,
  providerOf: providerOf,
  doorOf: providerOf,
  configured: configured,
  hasKeys: hasKeys,
  statusOf: statusOf,
  startOAuth: startOAuth,
  startUrl: startOAuth,
  start: startOAuth,
  finishOAuth: finishOAuth,
  finish: finishOAuth,
  finishFromProfile: finishOAuth,
  askOther: askOther,
  identitiesOf: identitiesOf,
  publicIdentities: identitiesOf,
  rememberIdentity: rememberIdentity,
  attachIdentity: rememberIdentity,
  dropIdentity: dropIdentity,
  linkProvider: linkProvider,
  linkIdentity: linkProvider,
  unlinkProvider: unlinkProvider,
  unlinkIdentity: unlinkProvider,
  suggestAccount: suggestAccount,
  findBySubject: findBySubject,
  findByIdentity: findBySubject,
  isRelayEmail: isRelayEmail,
  emailLinkable: emailLinkable,
  ensureIdentities: identitiesOf,
  doorsOf: doorsOf,
  DOORS: DOORS
};
