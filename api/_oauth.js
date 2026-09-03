const crypto = require("crypto");

const ORIGIN = "https://automateitaway.com";
const CALLBACK = ORIGIN + "/api/auth?oauth=1";
const LAND = "/onboard";

const DOORS = [
  { id: "google", name: "Google", group: "live", kind: "oidc", env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] },
  { id: "github", name: "GitHub", group: "live", kind: "oauth", env: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"] },
  { id: "apple", name: "Apple", group: "live", kind: "oidc", env: ["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"] },
  { id: "microsoft", name: "Microsoft", group: "live", kind: "oidc", env: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"] },
  { id: "x", name: "X", group: "more", kind: "oauth", env: ["X_CLIENT_ID", "X_CLIENT_SECRET"] },
  { id: "amazon", name: "Amazon", group: "more", kind: "oauth", env: ["AMAZON_CLIENT_ID", "AMAZON_CLIENT_SECRET"] },
  { id: "facebook", name: "Facebook", group: "more", kind: "oauth", env: ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"] },
  { id: "grok", name: "Grok", group: "ask", kind: "ask" },
  { id: "chatgpt", name: "ChatGPT", group: "ask", kind: "ask" },
  { id: "claude", name: "Claude", group: "ask", kind: "ask" },
  { id: "linkedin", name: "LinkedIn", group: "ext", kind: "oidc", env: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"] },
  { id: "discord", name: "Discord", group: "ext", kind: "oauth", env: ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"] },
  { id: "vercel", name: "Vercel", group: "ext", kind: "oidc", env: ["VERCEL_OAUTH_CLIENT_ID", "VERCEL_OAUTH_CLIENT_SECRET"] },
  { id: "yahoo", name: "Yahoo", group: "ext", kind: "oidc", env: ["YAHOO_CLIENT_ID", "YAHOO_CLIENT_SECRET"] },
  { id: "passkey", name: "Passkey", group: "ext", kind: "later" },
  { id: "other", name: "Another site", group: "ext", kind: "ask" }
];

function envOn(keys) {
  return !!(keys || []).length && keys.every((k) => String(process.env[k] || "").trim());
}

function statusOf(door) {
  if (!door) return "ask";
  if (door.kind === "ask") return "ask";
  if (door.kind === "later") return "hold";
  if (envOn(door.env)) return "live";
  return "hold";
}

function publicOf(door) {
  const status = statusOf(door);
  return {
    id: door.id,
    name: door.name,
    group: door.group,
    status: status,
    live: status === "live",
    hold: status === "hold",
    ask: status === "ask",
    identityOnly: true
  };
}

function catalog(q) {
  const needle = String(q || "").trim().toLowerCase();
  const rows = DOORS.map(publicOf);
  if (!needle) return rows;
  return rows.filter((p) => (p.id + " " + p.name + " " + p.group).toLowerCase().indexOf(needle) >= 0);
}

function publicProviders(q) {
  return catalog(q);
}

function providerOf(id) {
  const raw = String(id || "").trim().toLowerCase();
  const alias = raw === "gmail" || raw === "googlemail" ? "google" : raw === "twitter" ? "x" : raw === "site" ? "other" : raw === "openai" ? "chatgpt" : raw === "anthropic" ? "claude" : raw === "xai" ? "grok" : raw;
  return DOORS.find((d) => d.id === alias) || null;
}

function doorOf(id) { return providerOf(id); }

function configured(id) {
  const door = providerOf(id);
  return !!(door && statusOf(door) === "live");
}

function hasKeys(id) { return configured(id); }

function blocked(door, extra) {
  extra = extra || {};
  if (!door) {
    return { ok: false, status: 409, ask: true, error: "Name the site. AIA will Ask. Identity only." };
  }
  const st = statusOf(door);
  if (door.kind === "ask" || door.id === "other") {
    return {
      ok: false, status: 409, ask: true, hold: false,
      provider: door.id, site: extra.site || "",
      error: door.id === "other"
        ? "Name the site. AIA will Ask. Identity only."
        : door.name + " has not admitted AIA as a website login yet. Ask stays on the wall."
    };
  }
  if (door.kind === "later" || st !== "live") {
    return {
      ok: false, status: 409, hold: true, ask: false,
      provider: door.id,
      error: "Hold. " + door.name + " is on the wall until the key is on this box. Identity only — never Send, Stop, pay, or draft.",
      landOn: LAND
    };
  }
  return null;
}

function startOAuth(provider, opts) {
  opts = opts || {};
  const door = providerOf(provider);
  const stop = blocked(door, opts);
  if (stop) return stop;
  const state = crypto.randomBytes(16).toString("hex");
  return {
    ok: true,
    provider: door.id,
    url: CALLBACK + "&provider=" + encodeURIComponent(door.id) + "&state=" + state,
    state: state,
    next: opts.next || "onboard",
    landOn: LAND,
    hint: "Identity only. Never Send, Stop, pay, or draft."
  };
}

function startUrl(provider, opts) { return startOAuth(provider, opts); }
function start(provider, opts) { return startOAuth(provider, opts); }

function finishOAuth(provider) {
  const door = providerOf(provider);
  const stop = blocked(door);
  if (stop) return stop;
  return {
    ok: false, status: 409, hold: true, provider: door.id,
    error: "Hold. Token exchange waits on the live key. Identity only.",
    landOn: LAND
  };
}

function finish(provider, opts) { return finishOAuth(provider, opts); }
function finishFromProfile(provider) { return finishOAuth(provider); }

function askOther(site) {
  const name = String(site || "").trim().slice(0, 80);
  if (!name) return { ok: false, status: 400, ask: true, error: "Name the site." };
  return {
    ok: false, status: 409, ask: true, site: name, provider: "other",
    error: "Ask AIA. " + name + " is not a live AIA login door. Identity only.",
    search: "https://www.google.com/search?q=" + encodeURIComponent(name + " oauth login developer")
  };
}

function isRelayEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  return /@privaterelay\.appleid\.com$/.test(e) || /@users\.noreply\.github\.com$/.test(e);
}

function emailLinkable(email) {
  const e = String(email || "").trim().toLowerCase();
  return !!e && e.indexOf("@") > 0 && !isRelayEmail(e);
}

function identitiesOf(acc) {
  if (!acc) return [];
  if (!Array.isArray(acc.identities)) acc.identities = [];
  return acc.identities;
}

function ensureIdentities(acc) { return identitiesOf(acc); }

function publicIdentities(acc) {
  return identitiesOf(acc).map((row) => ({
    provider: row.provider,
    email: row.email || "",
    name: row.name || "",
    linkedAt: row.linkedAt || "",
    verified: !!row.verified
  }));
}

function rememberIdentity(acc, ident) {
  if (!acc || !ident || !ident.provider) return { ok: false, status: 400, error: "Name the door." };
  const door = providerOf(ident.provider);
  if (!door) return { ok: false, status: 409, ask: true, error: "Unknown door." };
  const rows = identitiesOf(acc);
  const subject = String(ident.subject || ident.sub || ident.email || door.id).slice(0, 120);
  let hit = rows.find((r) => r.provider === door.id && String(r.subject || "") === subject);
  if (!hit) {
    hit = { provider: door.id, subject: subject, linkedAt: new Date().toISOString() };
    rows.push(hit);
  }
  hit.email = String(ident.email || hit.email || "").trim().toLowerCase().slice(0, 120);
  hit.name = String(ident.name || hit.name || "").trim().slice(0, 80);
  hit.verified = ident.verified !== false && !isRelayEmail(hit.email);
  hit.linkedAt = hit.linkedAt || new Date().toISOString();
  return { ok: true, identity: hit, identities: publicIdentities(acc) };
}

function attachIdentity(acc, ident) { return rememberIdentity(acc, ident); }
function linkProvider(acc, ident) { return rememberIdentity(acc, ident); }
function linkIdentity(acc, ident) { return rememberIdentity(acc, ident); }

function doorsOf(acc) {
  const rows = identitiesOf(acc);
  const hasPw = !!(acc && acc.password);
  const hasPin = !!(acc && acc.pin);
  return { identities: rows.length, password: hasPw, pin: hasPin, count: rows.length + (hasPw ? 1 : 0) + (hasPin ? 1 : 0) };
}

function dropIdentity(acc, provider) {
  if (!acc) return { ok: false, status: 404, error: "No AIA account." };
  const door = providerOf(provider);
  if (!door) return { ok: false, status: 400, error: "Name the door." };
  const rows = identitiesOf(acc);
  const next = rows.filter((r) => r.provider !== door.id);
  if (next.length === rows.length) return { ok: false, status: 404, error: "That door is not linked." };
  const preview = { identities: next.length, password: !!acc.password, pin: !!acc.pin };
  if (preview.identities + (preview.password ? 1 : 0) + (preview.pin ? 1 : 0) < 1) {
    return { ok: false, status: 409, error: "Keep at least one door: a linked login, a password, or a desk code." };
  }
  acc.identities = next;
  return { ok: true, identities: publicIdentities(acc) };
}

function unlinkProvider(acc, provider) { return dropIdentity(acc, provider); }
function unlinkIdentity(acc, provider) { return dropIdentity(acc, provider); }

function findBySubject(mem, provider, sub) {
  const door = providerOf(provider);
  const subject = String(sub || "");
  if (!door || !subject || !mem) return null;
  const books = (mem.accounts || []).filter(Boolean);
  return books.find((a) => identitiesOf(a).some((r) => r.provider === door.id && String(r.subject || "") === subject)) || null;
}

function findByIdentity(mem, ident) {
  if (!ident) return null;
  return findBySubject(mem, ident.provider, ident.subject || ident.sub);
}

function suggestAccount(mem, ident) {
  if (!ident) return null;
  const bySub = findByIdentity(mem, ident);
  if (bySub) return { account: bySub, reason: "subject" };
  const email = String(ident.email || "").trim().toLowerCase();
  if (!emailLinkable(email) || !mem) return null;
  const hit = (mem.accounts || []).find((a) => a && String(a.email || "").trim().toLowerCase() === email) || null;
  if (!hit) return null;
  return { account: hit, reason: "email", confirm: true };
}

module.exports = {
  DOORS, CALLBACK, LAND,
  catalog, publicProviders, publicOf, statusOf, providerOf, doorOf,
  configured, hasKeys, startOAuth, startUrl, start,
  finishOAuth, finish, finishFromProfile, askOther,
  identitiesOf, ensureIdentities, publicIdentities,
  rememberIdentity, attachIdentity, linkProvider, linkIdentity,
  dropIdentity, unlinkProvider, unlinkIdentity, doorsOf,
  findBySubject, findByIdentity, suggestAccount,
  isRelayEmail, emailLinkable
};
