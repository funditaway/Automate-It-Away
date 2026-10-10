// G28 check: links, callbacks and notes AIA generates point at the live site
// (www.automateitaway.com / automateitaway.com) on production only.
// Off production (preview, development, unset, wrong-case "Production") they use
// the request's own host, else VERCEL_URL, else stay relative. Production output
// must stay exactly as before.
// Mocked env, mock requests, temp store file. No network.
// `node scripts/check-public-host.js` runs the checks and the built-in mutations
// (each mutation must make the checks fail).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const API = path.join(ROOT, "api");
const WWW = "https://www.automateitaway.com";
const APEX = "https://automateitaway.com";
const PREVIEW_HOST = "automate-it-away-git-preview-public-host-james-oddos-projects.vercel.app";
const DEPLOY_URL = "automate-it-away-abc123xyz-james-oddos-projects.vercel.app";
const SLUG = "host-check-desk";

let passed = 0;
let failed = 0;
function result(ok, id, label, detail) {
  if (ok) { passed++; console.log("PASS " + id + " " + label); }
  else { failed++; console.log("FAIL " + id + " " + label + (detail ? " — got " + detail : "")); }
}

function withEnv(env, fn) {
  const keys = ["VERCEL_ENV", "VERCEL_URL"];
  const prev = {};
  keys.forEach((k) => { prev[k] = process.env[k]; delete process.env[k]; });
  Object.keys(env).forEach((k) => { process.env[k] = env[k]; });
  try { return fn(); }
  finally { keys.forEach((k) => { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; }); }
}

const reqHost = (h) => ({ headers: { host: h } });
const reqFwd = (fwd, h) => ({ headers: { "x-forwarded-host": fwd, host: h } });
const noLive = (s) => String(s).indexOf("automateitaway.com") === -1;

// ---------- unit checks on the helper (env passed in, nothing global) ----------
function unitChecks(ph, tag) {
  const t = (id, label, ok, got) => result(ok, tag + id, label, ok ? "" : JSON.stringify(got));
  const prod = { VERCEL_ENV: "production", VERCEL_URL: DEPLOY_URL };
  const prev = { VERCEL_ENV: "preview", VERCEL_URL: DEPLOY_URL };
  const dev = { VERCEL_ENV: "development" };
  const unset = {};

  // production: exactly today's strings, request host ignored
  let v = ph.hookUrl(SLUG, reqHost(PREVIEW_HOST), prod);
  t("H01", "production hook URL is the live www host, unchanged", v === WWW + "/api/hook?workspace=" + SLUG, v);
  v = ph.hookUrl("", null, prod);
  t("H02", "production bare hook URL unchanged", v === WWW + "/api/hook", v);
  v = ph.homeUrl(reqHost(PREVIEW_HOST), prod);
  t("H03", "production home link is the live apex, unchanged", v === APEX, v);
  v = ph.publicUrl("/login", null, ph.LIVE_APEX, prod);
  t("H04", "production login link unchanged", v === APEX + "/login", v);
  t("H05", "PUBLIC_HOST constant unchanged", ph.PUBLIC_HOST === WWW, ph.PUBLIC_HOST);

  // preview: the request's own host, else VERCEL_URL; never the live site
  v = ph.hookUrl(SLUG, reqHost(PREVIEW_HOST), prev);
  t("H06", "preview hook URL uses the request's host", v === "https://" + PREVIEW_HOST + "/api/hook?workspace=" + SLUG, v);
  v = ph.hookUrl(SLUG, reqFwd(PREVIEW_HOST, "internal.local"), prev);
  t("H07", "preview prefers x-forwarded-host", v === "https://" + PREVIEW_HOST + "/api/hook?workspace=" + SLUG, v);
  v = ph.hookUrl(SLUG, null, prev);
  t("H08", "preview with no request uses VERCEL_URL", v === "https://" + DEPLOY_URL + "/api/hook?workspace=" + SLUG, v);
  v = ph.hookUrl(SLUG, reqHost("www.automateitaway.com"), prev);
  t("H09", "preview never trusts a live-site Host header", v === "https://" + DEPLOY_URL + "/api/hook?workspace=" + SLUG, v);
  v = ph.homeUrl(reqHost("automateitaway.com"), { VERCEL_ENV: "preview", VERCEL_URL: "www.automateitaway.com" });
  t("H10", "preview never uses a live-site VERCEL_URL (falls back to /)", v === "/", v);
  v = ph.publicUrl("/login", null, ph.LIVE_APEX, prev);
  t("H11", "preview login link uses VERCEL_URL", v === "https://" + DEPLOY_URL + "/login", v);

  // development / unset / wrong case
  v = ph.hookUrl(SLUG, reqHost("localhost:3000"), dev);
  t("H12", "development on localhost uses http://localhost:3000", v === "http://localhost:3000/api/hook?workspace=" + SLUG, v);
  v = ph.hookUrl(SLUG, null, unset);
  t("H13", "unset env, no host: relative hook path", v === "/api/hook?workspace=" + SLUG, v);
  v = ph.homeUrl(null, unset);
  t("H14", "unset env, no host: home link is /", v === "/", v);
  v = ph.hookUrl(SLUG, reqHost(PREVIEW_HOST), { VERCEL_ENV: "Production" });
  t("H15", "wrong-case 'Production' is not production", noLive(v) && v.indexOf(PREVIEW_HOST) > 0, v);
  v = ph.hookUrl(SLUG, reqHost("evil.example\r\nSet-Cookie: x=1"), unset);
  t("H16", "a malformed Host header is ignored", v === "/api/hook?workspace=" + SLUG, v);
  t("H17", "isProduction only for exactly 'production'",
    ph.isProduction(prod) === true && ph.isProduction(prev) === false && ph.isProduction(dev) === false && ph.isProduction(unset) === false && ph.isProduction({ VERCEL_ENV: "production " }) === false, "");
  t("H18", "LIVE_DOMAIN and LIVE_APEX constants unchanged", ph.LIVE_DOMAIN === "automateitaway.com" && ph.LIVE_APEX === APEX, ph.LIVE_DOMAIN + " " + ph.LIVE_APEX);
}

// ---------- wiring: every live-host string in api/ goes through the helper ----------
function wiringChecks(files, tag) {
  const t = (id, label, ok, got) => result(ok, tag + id, label, ok ? "" : got);
  const offenders = [];
  Object.keys(files).forEach((name) => {
    if (name === "_public-host.js") return;
    files[name].split("\n").forEach((line, i) => {
      if (/https?:\/\/(www\.)?automateitaway\.com/.test(line)) offenders.push(name + ":" + (i + 1));
    });
  });
  t("W01", "no hard-coded live-site URL in api/ outside _public-host.js", offenders.length === 0, offenders.join(", "));
  const lib = files["_lib.js"] || "";
  t("W02", "_lib.js takes PUBLIC_HOST and hookUrl from _public-host.js",
    /require\("\.\/_public-host"\)/.test(lib) && !/const PUBLIC_HOST\s*=/.test(lib) && !/function hookUrl\(/.test(lib), "");
  const bare = [];
  Object.keys(files).forEach((name) => {
    if (name === "_public-host.js") return;
    files[name].split("\n").forEach((line, i) => {
      if (/automateitaway\.com/.test(line)) bare.push(name + ":" + (i + 1));
    });
  });
  t("W04", "no other live-host string (automateitaway.com) in api/ outside _public-host.js", bare.length === 0, bare.join(", "));
  const own = Object.keys(files).filter((f) => f !== "_public-host.js" && /function hookUrl\(|const PUBLIC_HOST\s*=/.test(files[f]));
  t("W03", "no other file in api/ defines its own hookUrl or PUBLIC_HOST", own.length === 0, own.join(", "));
}

function readApi(dir) {
  const out = {};
  fs.readdirSync(dir).filter((f) => f.endsWith(".js")).forEach((f) => { out[f] = fs.readFileSync(path.join(dir, f), "utf8"); });
  return out;
}

// ---------- end to end in a child: real handlers, temp store, mocked env ----------
function e2eChild() {
  const env = process.env.VERCEL_ENV || "";
  let netCalls = 0;
  global.fetch = async () => { netCalls++; throw new Error("network blocked in check-public-host"); };
  (async () => {
    const lib = require(path.join(API, "_lib"));
    const auth = require(path.join(API, "auth"));
    const connections = require(path.join(API, "connections"));
    const people = require(path.join(API, "_world-people"));
    const oauth = require(path.join(API, "_oauth"));
    const doors = require(path.join(API, "_account-doors"));
    const mockRes = () => ({ headers: {}, statusCode: 200, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, end() { return this; } });
    const call = async (h, method, headers, body) => { const res = mockRes(); await h({ method, headers, body: body || {}, query: {} }, res); return res; };
    await lib.ready();
    const pin = "4821";
    await call(auth, "POST", { "x-workspace": SLUG, host: PREVIEW_HOST }, { action: "open", slug: SLUG, biz: "Host Check", name: "Tester", email: "tester@example.com", pin });
    const conn = await call(connections, "GET", { "x-workspace": SLUG, "x-pin": pin, host: PREVIEW_HOST }, {});
    const out = {
      env,
      status: conn.statusCode,
      inbound: conn.body && conn.body.inbound,
      invite: people.inviteLine("Host Check", "helper", "@tester"),
      homepage: oauth.complianceOf().homepage,
      home: doors.policyOf(null).home,
      netCalls
    };
    process.stdout.write("E2E " + JSON.stringify(out) + "\n");
  })().catch((e) => { process.stdout.write("E2E-ERROR " + (e && e.stack || e) + "\n"); process.exit(3); });
}

function e2e(envName) {
  const store = path.join(os.tmpdir(), "aia-public-host-check-" + process.pid + "-" + (envName || "unset") + ".json");
  try { fs.unlinkSync(store); } catch (e) {}
  const env = Object.assign({}, process.env, { AIA_STORE_PATH: store });
  ["VERCEL_ENV", "VERCEL_URL", "VERCEL_OIDC_TOKEN", "BLOB_READ_WRITE_TOKEN", "BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN", "BLOB_READ_WRITE_TOKEN_STORE_ID", "BLOB_STORE_ID", "AIA_BLOB_TOKEN"].forEach((k) => delete env[k]);
  if (envName) env.VERCEL_ENV = envName;
  if (envName === "preview") env.VERCEL_URL = DEPLOY_URL;
  const r = spawnSync(process.execPath, [__filename, "--e2e-child"], { env, encoding: "utf8", timeout: 60000 });
  try { fs.unlinkSync(store); } catch (e) {}
  const line = String(r.stdout || "").split("\n").find((l) => l.indexOf("E2E ") === 0);
  if (!line) return { error: (r.stdout || "") + (r.stderr || "") };
  return JSON.parse(line.slice(4));
}

function e2eChecks() {
  const p = e2e("preview");
  const d = e2e("");
  const pr = e2e("production");
  const pv = (id, label, ok) => result(ok, id, label, ok ? "" : JSON.stringify(p));
  pv("E01", "preview: Connections shows an inbound hook on this deployment (VERCEL_URL)", !p.error && p.status === 200 && p.inbound === "https://" + DEPLOY_URL + "/api/hook?workspace=" + SLUG);
  pv("E02", "preview: invite note links to this deployment's /login, not the live site", !p.error && p.invite.indexOf("https://" + DEPLOY_URL + "/login") > 0 && noLive(p.invite));
  pv("E03", "preview: OAuth homepage and account-doors home are not the live site", !p.error && p.homepage === "https://" + DEPLOY_URL && p.home === "https://" + DEPLOY_URL);

  result(!d.error && d.status === 200 && d.inbound === "/api/hook?workspace=" + SLUG && noLive(d.invite) && d.invite.indexOf("Open /login with") > 0 && d.homepage === "/" && d.home === "/",
    "E04", "unset env, no VERCEL_URL: relative links, never the live site", JSON.stringify(d));

  const invite = "@tester — you're invited to sit on Host Check as helper. Open https://automateitaway.com/login with your own account. Accept on People. Nobody sends money from here.";
  result(!pr.error && pr.status === 200 && pr.inbound === WWW + "/api/hook?workspace=" + SLUG && pr.invite === invite && pr.homepage === APEX && pr.home === APEX,
    "E05", "production: hook, invite note, homepage and home are exactly as before (request host ignored)", JSON.stringify(pr));
  result([p, d, pr].every((r) => !r.error && r.netCalls === 0), "E06", "no network calls in any scenario (fetch blocked and counted)", JSON.stringify([p.netCalls, d.netCalls, pr.netCalls]));
}

// ---------- mutations: each must make the unit or wiring checks fail ----------
const MUTATIONS = [
  { id: "M1", what: "treat every env as production", file: "_public-host.js", from: 'return String(envOf(env).VERCEL_ENV || "") === "production";', to: "return true;" },
  { id: "M2", what: "trust a live-site host off production", file: "_public-host.js", from: 'if (bare === LIVE_DOMAIN || bare.endsWith("." + LIVE_DOMAIN)) return "";', to: "" },
  { id: "M3", what: "fall back to the live host instead of relative", file: "_public-host.js", from: '  return "";\n}\n\n// live:', to: "  return PUBLIC_HOST;\n}\n\n// live:" },
  { id: "M4", what: "hookUrl ignores the request", file: "_public-host.js", from: 'encodeURIComponent(slug), req, PUBLIC_HOST, env)', to: 'encodeURIComponent(slug), null, PUBLIC_HOST, env)' },
  { id: "M5", what: "production uses the request host", file: "_public-host.js", from: "if (isProduction(env)) return live || PUBLIC_HOST;", to: "if (isProduction(env)) return selfOrigin(req, env) || live;" },
  { id: "M6", what: "prefer VERCEL_URL over the request host", file: "_public-host.js", from: 'const fromReq = cleanHost(headerOf(req, "x-forwarded-host")) || cleanHost(headerOf(req, "host"));', to: "const fromReq = cleanHost(envOf(env).VERCEL_URL);" },
  { id: "M7", what: "_lib.js goes back to its own hard-coded hook host", file: "_lib.js", from: 'const { PUBLIC_HOST, hookUrl, publicUrl } = require("./_public-host");', to: 'const { publicUrl } = require("./_public-host");\nconst PUBLIC_HOST = "https://www.automateitaway.com";\nfunction hookUrl(workspace) { return PUBLIC_HOST + "/api/hook"; }' },
  { id: "M8", what: "invite note hard-codes the live site again", file: "_world-people.js", from: '". Open " + publicUrl("/login", null, LIVE_APEX) + " with', to: '". Open https://automateitaway.com/login with' },
  { id: "M9", what: "accept malformed hosts", file: "_public-host.js", from: "if (!/^(\\[[0-9a-f:.]+\\]|[a-z0-9.-]+)(:\\d{1,5})?$/.test(h)) return \"\";", to: "" },
  { id: "M10", what: "health hard-codes the live domain again", file: "health.js", from: 'domain: require("./_public-host").LIVE_DOMAIN,', to: 'domain: "automateitaway.com",' },
  { id: "M11", what: "calendar UID hard-codes the live domain again", file: "_engine.js", from: '"@" + require("./_public-host").LIVE_DOMAIN,', to: '"@automateitaway.com",' }
];

function runMutations() {
  const files = readApi(API);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-ph-mut-"));
  let caught = 0;
  MUTATIONS.forEach((m) => {
    const src = files[m.file];
    if (!src || src.indexOf(m.from) === -1) { result(false, m.id, "mutation applies: " + m.what, "pattern not found in " + m.file); return; }
    const mutated = Object.assign({}, files, { [m.file]: src.replace(m.from, m.to) });
    const before = failed;
    const beforePassed = passed;
    const quiet = console.log;
    console.log = () => {};
    try {
      if (m.file === "_public-host.js") {
        const p = path.join(tmp, m.id + "-public-host.js");
        fs.writeFileSync(p, mutated[m.file]);
        delete require.cache[p];
        unitChecks(require(p), m.id + ":");
      }
      wiringChecks(mutated, m.id + ":");
    } finally { console.log = quiet; }
    const hit = failed > before;
    failed = before;
    passed = beforePassed;
    if (hit) caught++;
    result(hit, m.id, "mutation caught: " + m.what);
  });
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log("mutations caught " + caught + "/" + MUTATIONS.length);
}

if (process.argv.includes("--e2e-child")) {
  e2eChild();
} else {
  withEnv({}, () => {
    unitChecks(require(path.join(API, "_public-host")), "");
    wiringChecks(readApi(API), "");
    e2eChecks();
    runMutations();
  });
  console.log("check-public-host: PASS " + passed + " · FAIL " + failed);
  process.exit(failed ? 1 : 0);
}
