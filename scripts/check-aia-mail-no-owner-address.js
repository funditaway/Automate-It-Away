#!/usr/bin/env node
require("./_env-guard");
// Address-format errors must not name a real account. Calls parseAddress,
// validateAddress, createIdentity, and the account HTTP handler (mail-add and
// handle) against a fresh temp store. Same ok:false and the same status as
// before the wording change. No reply body may match /james|oddo|funditaway|springfield/i.
// A static scan reads string literals used as error: values under api/, and
// every other string literal under api/ (including prompts). No literal may
// contain a james / funditaway / springfield .aia name. Reply strings (every api
// string literal) also may not name an owner. The only leftover is the reviewer
// desk slug, matched exactly. ownerName stays empty unless that account set one,
// and a reply sends it only to that account's owner. Health does not publish a repo slug.
// node scripts/check-aia-mail-no-owner-address.js
// node scripts/check-aia-mail-no-owner-address.js --mutate
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const OWNER = /james|oddo|funditaway|springfield/i;
const AIA_NAME = /(?:james|funditaway|springfield)[a-z0-9-]*\.aia/i;
const REPO_SLUG = "funditaway/Automate-It-Away";
const OWNER_LITERAL_OK = {};
[
  ["api/_aia-admin.js", "funditaway"]
].forEach(function (row) { OWNER_LITERAL_OK[row[0] + "\0" + row[1]] = true; });
function ownerLiteralAllowed(file, text) {
  return OWNER_LITERAL_OK[file + "\0" + text] === true;
}
const REGISTER_NOTE = "You sign the commit, wait about 60 seconds, then sign the register. AIA holds no keys. Collect stays on hold.";
const EMPTY = "Type an AIA email, like name@your-account.aia.";
const NO_AT = "Use name@your-account.aia.";
const TWO_AT = "Use local@account.aia.";
const COM = "AIA mail ends in .aia, like name@your-account.aia.";
const LOCAL = "Add a name before the @, like name@your-account.aia.";
const LABEL = "The part after the @ must be a .aia name, like your-account.aia.";
const SET_NAME = "Set your AIA Internet name first, like your-account.aia.";
const NET_END = "AIA Internet names end in .aia, like your-account.aia.";
const NET_USE = "Use a .aia name, like your-account.aia.";
const ADMIN_USE = "Use a .aia name, like your-account.aia.";

const PARSE = [
  ["empty", "", "   ", EMPTY],
  ["no-at", "not-an-email", "not-an-email", NO_AT],
  ["two-at", "a@b@c", "a@b@c", TWO_AT],
  ["com", "ada@example.com", "ada@example.com", COM],
  ["empty-local", "@ada.aia", "@ada.aia", LOCAL],
  ["bad-label", "queue@.aia", "queue@.aia", LABEL]
];

let failed = 0;
let passed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log("ok   " + msg); }
  else { failed += 1; console.error("FAIL " + msg); process.exitCode = 1; }
}

function walkJs(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (ent) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJs(p, out);
    else if (ent.isFile() && ent.name.endsWith(".js")) out.push(p);
  });
  return out;
}

function errorLiterals(src) {
  const out = [];
  const re = /\berror\s*:\s*/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    while (src[i] === " " || src[i] === "\t" || src[i] === "\n" || src[i] === "\r") i += 1;
    const q = src[i];
    if (q !== "\"" && q !== "'" && q !== "`") continue;
    let j = i + 1;
    let s = "";
    while (j < src.length) {
      const c = src[j];
      if (c === "\\") { s += src[j + 1] || ""; j += 2; continue; }
      if (c === q) break;
      s += c;
      j += 1;
    }
    out.push(s);
    re.lastIndex = j + 1;
  }
  return out;
}

function allowedLiteral(file, text) {
  return file === "api/health.js" && text === REPO_SLUG;
}

function skipRegex(src, i) {
  let j = i + 1;
  let cls = false;
  while (j < src.length && src[j] !== "\n") {
    if (src[j] === "\\") { j += 2; continue; }
    if (src[j] === "[") cls = true;
    else if (src[j] === "]") cls = false;
    else if (src[j] === "/" && !cls) {
      j += 1;
      while (j < src.length && /[a-z]/i.test(src[j])) j += 1;
      return j;
    }
    j += 1;
  }
  return -1;
}

const REGEX_KEYWORD = /^(return|throw|case|delete|void|typeof|in|of|instanceof|else|do|yield|await)$/;

function wordBefore(src, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j -= 1;
  const end = j;
  if (j < 0 || !/[A-Za-z0-9_$]/.test(src[j])) return "";
  while (j >= 0 && /[A-Za-z0-9_$]/.test(src[j])) j -= 1;
  return src.slice(j + 1, end + 1);
}

function stringLiterals(src, start, stopOnBrace) {
  const out = [];
  let i = start || 0;
  let prev = "";
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end < 0) return { ok: false, reason: "unterminated comment" };
      i = end + 2;
      continue;
    }
    if (c === "/" && (/[(,=:[!&|?{};]|^$/.test(prev) || REGEX_KEYWORD.test(wordBefore(src, i)))) {
      const next = skipRegex(src, i);
      if (next < 0) return { ok: false, reason: "unterminated regex" };
      i = next;
      prev = "/";
      continue;
    }
    if (c === "\"" || c === "'" || c === "`") {
      const q = c;
      let j = i + 1;
      let s = "";
      let closed = false;
      while (j < src.length) {
        if (q === "`" && src[j] === "$" && src[j + 1] === "{") {
          out.push(s);
          s = "";
          const inner = stringLiterals(src, j + 2, true);
          if (!inner.ok) return { ok: false, reason: "template literal" };
          inner.literals.forEach(function (text) { out.push(text); });
          j = inner.i;
          continue;
        }
        if (src[j] === "\\") { s += src[j + 1] || ""; j += 2; continue; }
        if (src[j] === q) { out.push(s); i = j + 1; prev = q; closed = true; break; }
        s += src[j];
        j += 1;
      }
      if (!closed) return { ok: false, reason: q === "`" ? "template literal" : "unterminated string" };
      continue;
    }
    if (stopOnBrace && c === "{") { depth += 1; i += 1; prev = c; continue; }
    if (stopOnBrace && c === "}") {
      if (depth === 0) return { ok: true, literals: out, i: i + 1 };
      depth -= 1;
      i += 1;
      prev = c;
      continue;
    }
    if (!/\s/.test(c)) prev = c;
    i += 1;
  }
  if (stopOnBrace) return { ok: false, reason: "template literal" };
  return { ok: true, literals: out };
}

function staticScan() {
  const files = walkJs(path.join(root, "api"), []);
  const hits = [];
  const literals = [];
  const all = [];
  const nameHits = [];
  let sawSlug = false;
  let scanFailed = "";
  files.forEach(function (file) {
    const rel = path.relative(root, file);
    const src = fs.readFileSync(file, "utf8");
    errorLiterals(src).forEach(function (text) {
      literals.push({ file: rel, text: text });
      if (OWNER.test(text)) hits.push(rel + ": " + text);
    });
    const parsed = stringLiterals(src);
    if (!parsed.ok) { scanFailed = rel + " " + parsed.reason; return; }
    parsed.literals.forEach(function (text) {
      all.push({ file: rel, text: text });
      if (rel === "api/health.js" && text === REPO_SLUG) sawSlug = true;
      if (allowedLiteral(rel, text)) return;
      if (AIA_NAME.test(text)) nameHits.push(rel + ": " + text.slice(0, 120));
    });
  });
  ok(!scanFailed, "string literals scanned" + (scanFailed ? " fail closed (" + scanFailed + ")" : ""));
  ok(literals.length > 0, "static scan read " + literals.length + " error literals in " + files.length + " api files");
  [EMPTY, NO_AT, COM, LOCAL, LABEL, SET_NAME, NET_END, NET_USE, ADMIN_USE].forEach(function (text) {
    ok(literals.some(function (row) { return row.text === text; }), "static scan sees error literal: " + text);
  });
  const setNameCount = literals.filter(function (row) {
    return row.file === "api/_aia-mail.js" && row.text === SET_NAME;
  }).length;
  ok(setNameCount === 2, "both unset-name errors are generic (" + setNameCount + ")");
  ok(hits.length === 0, "no error literal names an owner account" + (hits.length ? " (" + hits.join(" | ") + ")" : ""));
  ok(all.length > literals.length, "static scan read " + all.length + " string literals");
  ok(!sawSlug, "health.js does not publish the repo slug");
  ok(OWNER.test("Oddo") && OWNER.test("oddo") && !OWNER.test("Ada"), "owner regex includes oddo");
  ok(allowedLiteral("api/health.js", REPO_SLUG) && !allowedLiteral("api/health.js", REPO_SLUG + " james.aia") && !allowedLiteral("api/_grok.js", REPO_SLUG) && !allowedLiteral("api/health.js", "funditaway.aia"), "repo slug exclusion is exact and only api/health.js");
  ok(!AIA_NAME.test("Register .aia from this desk when Bridge is clear. You sign in your wallet."), "plain register prose next to .aia is not a .aia name");
  ok(!AIA_NAME.test("Register .aia from this desk. James signs in MetaMask.") && OWNER.test("James signs in MetaMask."), "owner-name prose is not a .aia name; the name scan still ignores it");
  ok(AIA_NAME.test("james.aia") && AIA_NAME.test("springfield-shop.aia") && AIA_NAME.test("funditaway.aia") && !AIA_NAME.test("yourname.aia") && !AIA_NAME.test("your-shop.aia"), "owner .aia names match; neutral examples do not");
  ok(nameHits.length === 0, "no api string literal has a james/funditaway/springfield .aia name" + (nameHits.length ? " (" + nameHits.join(" | ") + ")" : ""));
  const ownerHits = [];
  let sawRegisterNote = false;
  all.forEach(function (row) {
    if (row.file === "api/_aia-register.js" && row.text === REGISTER_NOTE) sawRegisterNote = true;
    if (!OWNER.test(row.text) || ownerLiteralAllowed(row.file, row.text)) return;
    ownerHits.push(row.file + ": " + row.text.slice(0, 140));
  });
  ok(sawRegisterNote, "register note is second person");
  ok(ownerHits.length === 0, "no api reply string names an owner" + (ownerHits.length ? " (" + ownerHits.join(" | ") + ")" : ""));
}

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end() { return this; }
  };
}
function reqOf(method, headers, body, query) {
  return { method: method, headers: headers || {}, body: body || {}, query: query || {} };
}
async function call(handler, method, headers, body, query, url) {
  const res = mockRes();
  const req = reqOf(method, headers, body, query);
  if (url) req.url = url;
  try { await handler(req, res); }
  catch (e) { if (res.body == null) res.body = { error: String(e && e.message || e) }; }
  return res;
}
async function runtimeReplies() {
  const auth = require("../api/auth");
  const admin = require("../api/admin");
  const lib = require("../api/_lib");
  const accountApi = require("../api/_account");
  await lib.ready();
  const platform = accountApi.ensureAccount();
  ok(!OWNER.test(String(platform.ownerName || "")), "fresh platform ownerName is empty");
  const openedA = await call(auth, "POST", {}, { action: "open", slug: "owner-a", biz: "Ada Desk", name: "Ada", pin: "4821" });
  ok(openedA.statusCode === 201 || openedA.statusCode === 200, "runtime open owner-a " + openedA.statusCode);
  const openedB = await call(auth, "POST", {}, { action: "open", slug: "owner-b", biz: "Bea Desk", name: "Bea", pin: "4822" });
  ok(openedB.statusCode === 201 || openedB.statusCode === 200, "runtime open owner-b " + openedB.statusCode);
  const shop = (lib.mem.workspaces || []).find(function (w) { return w && w.slug === "owner-a"; });
  ok(!!shop, "runtime desk owner-a is in memory");
  if (shop) {
    shop.people.push({ id: "p_helper_runtime", name: "Hal", role: "helper", kind: "helper", status: "approved", pin: lib.hashPin("5555") });
  }
  const seats = [
    ["stranger", { "x-workspace": "owner-a" }],
    ["helper", { "x-workspace": "owner-a", "x-pin": "5555" }],
    ["other owner", { "x-workspace": "owner-b", "x-pin": "4822" }]
  ];
  const routes = [
    ["admin", admin, "/api/admin"],
    ["auth", auth, "/api/auth"],
    ["desks", auth, "/api/desks"],
    ["account", auth, "/api/account"],
    ["connections", require("../api/connections"), "/api/connections"],
    ["health", require("../api/health"), "/api/health"],
    ["status", require("../api/health"), "/api/status"],
    ["hook", require("../api/hook"), "/api/hook"],
    ["intake", require("../api/intake"), "/api/intake"],
    ["jobs", require("../api/jobs"), "/api/jobs"],
    ["migrate-uploads", require("../api/migrate-uploads"), "/api/migrate-uploads"],
    ["rules", require("../api/rules"), "/api/rules"],
    ["upload", require("../api/upload"), "/api/upload"],
    ["worker", require("../api/worker"), "/api/worker"]
  ];
  for (let s = 0; s < seats.length; s += 1) {
    for (let r = 0; r < routes.length; r += 1) {
      for (let m = 0; m < 2; m += 1) {
        const method = m === 0 ? "GET" : "POST";
        const res = await call(routes[r][1], method, seats[s][1], method === "POST" ? {} : {}, {}, routes[r][2]);
        noOwner(seats[s][0] + " " + method + " " + routes[r][0], res.body);
      }
    }
  }
  platform.ownerName = "James Oddo";
  const helperAdmin = await call(admin, "GET", { "x-workspace": "owner-a", "x-pin": "5555" }, {}, {}, "/api/admin");
  ok(helperAdmin.statusCode === 200 && helperAdmin.body && helperAdmin.body.account, "helper admin is signed in " + helperAdmin.statusCode);
  ok(!OWNER.test(JSON.stringify(helperAdmin.body || "")), "helper admin hides a set ownerName");
  const otherAdmin = await call(admin, "GET", { "x-workspace": "owner-b", "x-pin": "4822" }, {}, {}, "/api/admin");
  ok(otherAdmin.statusCode === 200 && otherAdmin.body && otherAdmin.body.account, "other owner admin is signed in " + otherAdmin.statusCode);
  ok(!OWNER.test(JSON.stringify(otherAdmin.body || "")), "another queue hides a set ownerName");
  platform.ownerName = "";
  await railDraftReplies(lib);
}
async function railDraftReplies(lib) {
  const jobs = require("../api/jobs");
  const worker = require("../api/worker");
  const ownerH = { "x-workspace": "owner-a", "x-pin": "4821" };
  const helperH = { "x-workspace": "owner-a", "x-pin": "5555" };
  const shop = (lib.mem.workspaces || []).find(function (w) { return w && w.slug === "owner-a"; });
  ok(!!shop, "rail desk is still in memory");
  if (!shop) return;
  shop.people.push({ id: "p_rail_runtime", name: "Lane", crew: "Rail", role: "agent", kind: "agent", status: "approved" });
  const captured = await call(jobs, "POST", ownerH, { action: "capture", title: "Ada rail card", notes: "A card for the rail." }, {}, "/api/jobs");
  noOwner("owner capture", captured.body);
  const jobId = captured.body && captured.body.job && captured.body.job.id;
  ok(captured.statusCode === 201 && !!jobId, "owner capture wrote a card " + captured.statusCode);
  const assigned = await call(jobs, "POST", ownerH, { action: "assign", id: jobId, name: "Lane" }, {}, "/api/jobs");
  noOwner("owner assign", assigned.body);
  ok(assigned.statusCode === 200 && assigned.body && assigned.body.job && assigned.body.job.assignee === "Lane", "owner assign handed the card to the Rail agent " + assigned.statusCode);
  const drafted = await call(worker, "POST", ownerH, {}, {}, "/api/worker");
  noOwner("worker draft", drafted.body);
  ok(drafted.statusCode === 200 && drafted.body && drafted.body.drafted >= 1, "worker wrote a draft through the agent seat " + drafted.statusCode + " " + JSON.stringify(drafted.body && drafted.body.drafted));
  const ownerJobs = await call(jobs, "GET", ownerH, {}, {}, "/api/jobs");
  const helperJobs = await call(jobs, "GET", helperH, {}, {}, "/api/jobs");
  noOwner("owner GET jobs", ownerJobs.body);
  noOwner("helper GET jobs", helperJobs.body);
  const railLine = "Rail on Ada rail card: Ready if a person taps Yes. Rail does not tap Stop.";
  ok(ownerJobs.statusCode === 200 && JSON.stringify(ownerJobs.body || "").indexOf(railLine) >= 0, "owner GET has the Rail draft");
  ok(helperJobs.statusCode === 200 && JSON.stringify(helperJobs.body || "").indexOf(railLine) >= 0, "helper GET has the Rail draft");
}
function noOwner(label, body) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  ok(!OWNER.test(raw || ""), label + " reply has no owner name");
}
function keysOk(label, body, keys) {
  const got = body && typeof body === "object" ? Object.keys(body).sort() : [];
  ok(JSON.stringify(got) === JSON.stringify(keys.slice().sort()), label + " shape " + JSON.stringify(got));
}

async function main() {
  const store = path.join(os.tmpdir(), "aia-mail-no-owner-" + Date.now() + "-" + process.pid + ".json");
  process.env.AIA_STORE_PATH = store;
  process.env.AIA_TLD_PROBE = "0";
  delete global.__aia;
  delete global.__aiaHydrate;

  staticScan();
  await runtimeReplies();

  const mail = require("../api/_aia-mail");
  const admin = require("../api/_aia-admin");
  const auth = require("../api/auth");
  const account = require("../api/_account-http");
  const lib = require("../api/_lib");

  PARSE.forEach(function (row) {
    const label = row[0];
    const parsed = mail.parseAddress(row[1]);
    ok(parsed && parsed.ok === false, label + " parseAddress ok:false");
    ok(!Object.prototype.hasOwnProperty.call(parsed, "status"), label + " parseAddress has no status");
    ok(parsed.error === row[3], label + " parseAddress error");
    keysOk(label + " parseAddress", parsed, ["ok", "error"]);
    noOwner(label + " parseAddress", parsed);
  });

  const unset = mail.validateAddress("queue@ada.aia", { id: "acct_blank", aia: "", handle: "", slug: "", name: "" }, { aia: "", aiaName: "", slug: "", biz: "" });
  ok(unset && unset.ok === false, "unset validateAddress ok:false");
  ok(!Object.prototype.hasOwnProperty.call(unset, "status"), "unset validateAddress has no status");
  ok(unset.error === SET_NAME, "unset validateAddress error");
  keysOk("unset validateAddress", unset, ["ok", "error"]);
  noOwner("unset validateAddress", unset);

  const made = mail.createIdentity({ id: "acct_blank" }, { slug: "" }, { address: "queue@ada.aia" });
  ok(made && made.ok === false, "unset createIdentity ok:false");
  ok(made.status === 400, "unset createIdentity status 400");
  ok(made.error === SET_NAME, "unset createIdentity error");
  keysOk("unset createIdentity", made, ["ok", "status", "error"]);
  noOwner("unset createIdentity", made);

  await lib.ready();
  const slug = "ada-desk";
  const pin = "4821";
  const opened = await call(auth, "POST", { "x-workspace": slug }, {
    action: "open",
    slug: slug,
    biz: "Ada Desk",
    name: "Ada",
    email: "ada@example.com",
    password: "ada-mail-pass-1234",
    pin: pin
  });
  ok(opened.statusCode === 201 || opened.statusCode === 200, "open desk " + opened.statusCode);
  const signed = await call(account, "POST", {}, { action: "login", email: "ada@example.com", password: "ada-mail-pass-1234" });
  const token = signed.body && signed.body.session && signed.body.session.token;
  ok(signed.statusCode === 200 && !!token, "owner email sign-in " + signed.statusCode);
  const headers = { "x-workspace": slug, "x-pin": pin, "x-session": token };

  for (let i = 0; i < PARSE.length; i += 1) {
    const row = PARSE[i];
    const label = row[0] + " mail-add";
    const res = await call(account, "POST", headers, { action: "mail-add", address: row[2], desk: slug });
    ok(res.statusCode === 400, label + " HTTP 400 got " + res.statusCode);
    ok(res.body && res.body.ok === false, label + " ok:false");
    ok(res.body && res.body.error === row[3], label + " error got " + (res.body && res.body.error));
    keysOk(label, res.body, ["ok", "error", "mx"]);
    noOwner(label, res.body);
  }

  const handleCases = [
    ["handle .com", "example.com", 400, NET_END],
    ["handle empty label", ".aia", 400, NET_USE],
    ["handle bad name", "!!!", 400, ADMIN_USE]
  ];
  for (let i = 0; i < handleCases.length; i += 1) {
    const row = handleCases[i];
    const res = await call(account, "POST", headers, { action: "handle", handle: row[1] });
    ok(res.statusCode === row[2], row[0] + " HTTP " + row[2] + " got " + res.statusCode);
    ok(res.body && res.body.ok === false, row[0] + " ok:false");
    ok(res.body && res.body.error === row[3], row[0] + " error got " + (res.body && res.body.error));
    keysOk(row[0], res.body, ["ok", "error"]);
    noOwner(row[0], res.body);
  }

  const directCom = admin.setAccountHandle({ id: "acct_plain" }, "example.com");
  ok(directCom && directCom.ok === false && directCom.status === 400 && directCom.error === NET_END, "setAccountHandle .com status 400");
  noOwner("setAccountHandle .com", directCom);
  const directBang = admin.setAccountHandle({ id: "acct_plain" }, "!!!");
  ok(directBang && directBang.ok === false && directBang.status === 400 && directBang.error === ADMIN_USE, "setAccountHandle bad name status 400");
  noOwner("setAccountHandle bad name", directBang);

  const acc = (lib.mem.accounts || []).find(function (a) { return a && a.email === "ada@example.com"; });
  const shop = (lib.mem.workspaces || []).find(function (w) { return w && w.slug === slug; });
  ok(!!acc && !!shop, "fresh account and desk are in memory");
  if (acc && shop) {
    const poison = "ab-".repeat(30);
    acc.aia = poison;
    shop.aia = poison;
    ok(mail.labelsFor(acc, shop).length === 0, "poisoned account has no AIA Internet name");
    const res = await call(account, "POST", headers, { action: "mail-add", address: "queue@ada.aia", desk: slug });
    ok(res.statusCode === 400, "unset mail-add HTTP 400 got " + res.statusCode);
    ok(res.body && res.body.ok === false, "unset mail-add ok:false");
    ok(res.body && res.body.error === SET_NAME, "unset mail-add error got " + (res.body && res.body.error));
    keysOk("unset mail-add", res.body, ["ok", "error", "mx"]);
    noOwner("unset mail-add", res.body);
  }

  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
  if (failed) {
    console.error("check-aia-mail-no-owner-address: " + failed + " failed, " + passed + " passed");
    process.exit(1);
  }
  console.log("check-aia-mail-no-owner-address: " + passed + " passed");
}

const MUTANTS = [
  ["mail empty", "api/_aia-mail.js",
    'if (!text) return { ok: false, error: "Type an AIA email, like name@your-account.aia." };',
    'if (!text) return { ok: false, error: "Name a .aia email like james-ai@funditaway.aia." };'],
  ["mail no-at", "api/_aia-mail.js",
    'return { ok: false, error: "Use name@your-account.aia." };',
    'return { ok: false, error: "Use local@account.aia — like james-ai@funditaway.aia or queue@springfield-shop.aia." };'],
  ["mail com", "api/_aia-mail.js",
    'return { ok: false, error: "AIA mail ends in .aia, like name@your-account.aia." };',
    'return { ok: false, error: "AIA Internet mail ends in .aia — like james-ai@funditaway.aia." };'],
  ["mail empty-local", "api/_aia-mail.js",
    'if (!local) return { ok: false, error: "Add a name before the @, like name@your-account.aia." };',
    'if (!local) return { ok: false, error: "Local part looks like james-ai or queue." };'],
  ["mail bad-label", "api/_aia-mail.js",
    'if (!account) return { ok: false, error: "The part after the @ must be a .aia name, like your-account.aia." };',
    'if (!account) return { ok: false, error: "Account label must be a .aia name — funditaway.aia or springfield-shop.aia." };'],
  ["mail unset validate", "api/_aia-mail.js",
    '    return { ok: false, error: "Set your AIA Internet name first, like your-account.aia." };',
    '    return { ok: false, error: "Set the AIA Internet name first — funditaway.aia or springfield-shop.aia." };'],
  ["mail unset create", "api/_aia-mail.js",
    'if (!labels.length) return { ok: false, status: 400, error: "Set your AIA Internet name first, like your-account.aia." };',
    'if (!labels.length) return { ok: false, status: 400, error: "Set the AIA Internet name first — funditaway.aia or springfield-shop.aia." };'],
  ["net ends-in", "api/_aia-net.js",
    'return { ok: false, error: "AIA Internet names end in .aia, like your-account.aia." };',
    'return { ok: false, error: "AIA Internet names end in .aia — like james.aia or springfield-shop.aia." };'],
  ["net empty label", "api/_aia-net.js",
    'if (!label) return { ok: false, error: "Use a .aia name, like your-account.aia." };',
    'if (!label) return { ok: false, error: "Use a .aia name like james.aia or springfield-shop.aia." };'],
  ["admin bad name", "api/_aia-admin.js",
    'if (!handle) return { ok: false, status: 400, error: "Use a .aia name, like your-account.aia." };',
    'if (!handle) return { ok: false, status: 400, error: "Use a .aia name like james.aia." };'],
  ["grok prompt owner .aia name", "api/_grok.js",
    "AIA Internet uses the .aia TLD (yourname.aia, your-shop.aia).",
    "AIA Internet uses the .aia TLD (james.aia, springfield-shop.aia)."],
  ["health repo slug restored", "api/health.js",
    'revShort: rev ? rev.slice(0, 7) : null,\n    dns: "pointed",',
    'revShort: rev ? rev.slice(0, 7) : null,\n    repo: "funditaway/Automate-It-Away",\n    dns: "pointed",'],
  ["reply names Oddo", "api/health.js",
    'mfa: "Two-step sign-in is off for now. No email codes. No SMS codes."',
    'mfa: "Two-step sign-in is off for now, Oddo. No email codes. No SMS codes."'],
  ["platform ownerName default restored", "api/_account.js",
    'heldBy: "admin", ownerName: ""',
    'heldBy: "admin", ownerName: "James Oddo"'],
  ["helper is sent ownerName", "api/_account.js",
    "if (opts && opts.showOwnerName) out.ownerName = account.ownerName || \"\";",
    "if (true) out.ownerName = account.ownerName || \"\";"],
  ["Rail draft names the owner", "api/_handoff.js",
    'Rail: "Rail on " + title + ": " + (job.risk && job.risk !== "none" ? "Needs a look · " + job.risk : "Ready if a person taps Yes") + ". Rail does not tap Stop.",',
    'Rail: "Rail on " + title + ": " + (job.risk && job.risk !== "none" ? "Needs a look · " + job.risk : "Ready if a person taps Yes") + ". Rail does not tap Stop." + " " + "Jam" + "es",'],
  ["register note names the owner", "api/_aia-register.js",
    'const HOLD_NOTE = "You sign the commit, wait about 60 seconds, then sign the register. AIA holds no keys. Collect stays on hold.";',
    'const HOLD_NOTE = "James signs the commit, waits about 60 seconds, then signs the register. AIA holds no keys. Collect stays on hold.";'],
  ["migrate delete names the owner", "api/migrate-uploads.js",
    'return deny(res, 403, "Delete needs your Yes.");',
    'return deny(res, 403, "Delete needs James\'s Yes.");']
];

function mutate() {
  const { spawnSync } = require("child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aia-mail-owner-mut-"));
  fs.cpSync(root, dir, { recursive: true, filter: function (src) { return !/[\\/](\.git|node_modules)$/.test(src); } });
  if (fs.existsSync(path.join(root, "node_modules"))) {
    fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
  }
  const run = function () {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "aia-mail-owner-home-"));
    return spawnSync(process.execPath, [path.join(dir, "scripts/check-aia-mail-no-owner-address.js")], {
      cwd: dir,
      env: { PATH: process.env.PATH || "", HOME: home, TMPDIR: home },
      encoding: "utf8",
      timeout: 120000
    });
  };
  let caught = 0;
  let total = 0;
  let bad = 0;
  try {
    const base = run();
    if (base.status !== 0) {
      console.error("unmutated check fails in the copy:\n" + ((base.stdout || "") + (base.stderr || "")).slice(-2500));
      process.exit(1);
    }
    const passedLine = ((base.stdout || "").split("\n").filter(function (l) { return l.indexOf(" passed") >= 0; }).pop()) || "";
    console.log("UNMUTATED | PASS | " + passedLine);
    MUTANTS.forEach(function (row) {
      const name = row[0];
      const file = row[1];
      const find = row[2];
      const repl = row[3];
      const p = path.join(dir, file);
      const orig = fs.readFileSync(p, "utf8");
      if (orig.indexOf(find) < 0) { console.log(name + " | ANCHOR GONE"); bad += 1; return; }
      if (orig.indexOf(find) !== orig.lastIndexOf(find)) { console.log(name + " | ANCHOR NOT UNIQUE"); bad += 1; return; }
      fs.writeFileSync(p, orig.replace(find, repl));
      const r = run();
      fs.writeFileSync(p, orig);
      const first = ((r.stdout || "") + "\n" + (r.stderr || "")).split("\n").find(function (l) { return l.indexOf("FAIL") === 0; }) || "";
      total += 1;
      if (r.status) { caught += 1; console.log(name + " | CAUGHT | " + first.slice(0, 180)); }
      else console.log(name + " | SURVIVED");
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log("SCORE " + caught + "/" + total + " caught" + (bad ? " (" + bad + " anchors bad)" : ""));
  process.exit(caught === total && !bad ? 0 : 1);
}

if (process.argv.indexOf("--mutate") >= 0) mutate();
else main().catch(function (e) {
  console.error("FAIL crash " + (e && e.stack || e));
  process.exit(1);
});
