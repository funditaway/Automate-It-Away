#!/usr/bin/env node
require("./_env-guard");
// Address-format errors must not name a real account. Calls parseAddress,
// validateAddress, createIdentity, and the account HTTP handler (mail-add and
// handle) against a fresh temp store. Same ok:false and the same status as
// before the wording change. No reply body may match /james|funditaway|springfield/i.
// A static scan reads string literals used as error: values under api/.
// node scripts/check-aia-mail-no-owner-address.js
// node scripts/check-aia-mail-no-owner-address.js --mutate
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const OWNER = /james|funditaway|springfield/i;
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

function staticScan() {
  const files = walkJs(path.join(root, "api"), []);
  const hits = [];
  const literals = [];
  files.forEach(function (file) {
    errorLiterals(fs.readFileSync(file, "utf8")).forEach(function (text) {
      literals.push({ file: path.relative(root, file), text: text });
      if (OWNER.test(text)) hits.push(path.relative(root, file) + ": " + text);
    });
  });
  ok(literals.length > 0, "static scan read " + literals.length + " error literals in " + files.length + " api files");
  [EMPTY, NO_AT, COM, LOCAL, LABEL, SET_NAME, NET_END, NET_USE, ADMIN_USE].forEach(function (text) {
    ok(literals.some(function (row) { return row.text === text; }), "static scan sees error literal: " + text);
  });
  const setNameCount = literals.filter(function (row) {
    return row.file === "api/_aia-mail.js" && row.text === SET_NAME;
  }).length;
  ok(setNameCount === 2, "both unset-name errors are generic (" + setNameCount + ")");
  ok(hits.length === 0, "no error literal names an owner account" + (hits.length ? " (" + hits.join(" | ") + ")" : ""));
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
async function call(handler, method, headers, body, query) {
  const res = mockRes();
  await handler(reqOf(method, headers, body, query), res);
  return res;
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
    'if (!handle) return { ok: false, status: 400, error: "Use a .aia name like james.aia." };']
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
