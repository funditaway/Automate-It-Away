// One place that decides which site address AIA puts in the links, callbacks and
// notes it generates.
//
// Production (VERCEL_ENV exactly "production") keeps today's live addresses,
// unchanged. Everywhere else (Vercel previews, development, local runs, tests)
// the live site is never used: the address comes from the request's own host
// when a caller passes the request, else from VERCEL_URL (this deployment's own
// URL), else it is left relative ("/api/hook"). Today's callers (hookUrl via
// _lib, the invite note, the home links) pass no request, so previews use
// VERCEL_URL. A host that is the live site itself is never trusted off production.
// LIVE_DOMAIN is the bare domain name (health "domain" field, calendar UIDs): an
// identifier, not a link, so it is the same in every environment.
//
// Not a serverless function (leading underscore), so it doesn't count toward
// the Vercel function limit.

const PUBLIC_HOST = "https://www.automateitaway.com";
const LIVE_APEX = "https://automateitaway.com";
const LIVE_DOMAIN = "automateitaway.com";

function envOf(env) {
  return env || process.env;
}

function isProduction(env) {
  return String(envOf(env).VERCEL_ENV || "") === "production";
}

function cleanHost(value) {
  let h = String(value || "").split(",")[0].trim().toLowerCase();
  h = h.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!h || h.length > 253) return "";
  if (!/^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:\d{1,5})?$/.test(h)) return "";
  const bare = h.replace(/:\d+$/, "").replace(/\.$/, "");
  if (bare === LIVE_DOMAIN || bare.endsWith("." + LIVE_DOMAIN)) return "";
  return h;
}

function isLocal(host) {
  const bare = host.replace(/:\d+$/, "");
  return bare === "localhost" || bare.endsWith(".localhost") || bare === "127.0.0.1" || bare === "[::1]" || bare === "0.0.0.0";
}

function headerOf(req, name) {
  const h = (req && req.headers) || {};
  const v = h[name] !== undefined ? h[name] : h[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

// Origin for links off production: the request's own host, else VERCEL_URL, else "".
function selfOrigin(req, env) {
  const fromReq = cleanHost(headerOf(req, "x-forwarded-host")) || cleanHost(headerOf(req, "host"));
  if (fromReq) return (isLocal(fromReq) ? "http://" : "https://") + fromReq;
  const fromVercel = cleanHost(envOf(env).VERCEL_URL);
  if (fromVercel) return (isLocal(fromVercel) ? "http://" : "https://") + fromVercel;
  return "";
}

// live: the exact production origin to keep (default the www host).
function publicOrigin(req, live, env) {
  if (isProduction(env)) return live || PUBLIC_HOST;
  return selfOrigin(req, env);
}

// path must start with "/". Off production with no known host this stays relative.
function publicUrl(path, req, live, env) {
  return publicOrigin(req, live, env) + path;
}

function hookUrl(workspace, req, env) {
  const slug = String(workspace || "").trim();
  return slug
    ? publicUrl("/api/hook?workspace=" + encodeURIComponent(slug), req, PUBLIC_HOST, env)
    : publicUrl("/api/hook", req, PUBLIC_HOST, env);
}

// Home page link: the live apex on production, else this deployment (or "/").
function homeUrl(req, env) {
  return publicOrigin(req, LIVE_APEX, env) || "/";
}

module.exports = { PUBLIC_HOST, LIVE_APEX, LIVE_DOMAIN, isProduction, selfOrigin, publicOrigin, publicUrl, hookUrl, homeUrl };
