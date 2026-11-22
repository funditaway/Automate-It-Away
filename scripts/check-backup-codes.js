#!/usr/bin/env node
require("./_env-guard");
// Backup codes on /api/account { action: "backup-codes" } (no network):
// only the account owner, for their own account, makes 10 one-time codes;
// the plain codes are only in the one reply that makes them (never in the
// store, history, log lines, audit, or any other reply); only a salted
// scrypt hash is kept; useBackupCode compares with crypto.timingSafeEqual
// and each code works once; making new codes stops every old code;
// helpers, members, waiting, removed, Desk AI, other-desk owners, made-up
// sessions and strangers are refused and nothing is saved; the history row
// is "You made new backup codes."; the desk pin and the email session
// still read settings. Collect stays HOLD.
// Usage: node scripts/check-backup-codes.js            (check + mutants)
//        node scripts/check-backup-codes.js --child    (check only)
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const CHILD = process.argv.indexOf("--child") >= 0;
const root = path.join(__dirname, "..");
const store = path.join(os.tmpdir(), "aia-backup-codes-" + Date.now() + "-" + process.pid + ".json");
process.env.AIA_STORE_PATH = store;
process.env.AIA_TLD_PROBE = "0";
delete process.env.VERCEL_ENV;
delete process.env.AIA_ACCOUNT_SECRETS_KEY;
delete global.__aia;
delete global.__aiaHydrate;

const HISTORY_LINE = "You made new backup codes.";
const HINT = "Here are 10 backup codes. Each one works once. They are not shown again. Making new codes stops these from working.";
const REFUSE_OWNER = "Only the account owner can make backup codes. Nothing was saved.";
const CODE_RE = /^[abcdefghjkmnpqrstuvwxyz23456789]{5}-[abcdefghjkmnpqrstuvwxyz23456789]{5}$/;
const BANNED = /secur|bank-grade|unhackable|military|uncrackable/i;

let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); process.exitCode = 1; }
function pass(m) { console.log("ok   " + m); }
function ok(c, m) { if (c) pass(m); else fail(m); }

const replies = [];
const lines = [];
function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    getHeader(k) { return this.headers[k]; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; }
  };
}
let handler;
async function call(method, headers, body, query) {
  const res = mockRes();
  const q = Object.assign({ via: "account" }, query || {});
  const qs = Object.keys(q).map((k) => k + "=" + encodeURIComponent(q[k])).join("&");
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  ["log", "error", "warn", "info"].forEach((k) => { console[k] = function () { lines.push(Array.prototype.join.call(arguments, " ")); }; });
  try {
    await handler({ method, headers: headers || {}, body: body || {}, query: q, url: "/api/auth?" + qs }, res);
  } finally {
    Object.assign(console, orig);
  }
  const text = JSON.stringify({ s: res.statusCode, b: res.body, h: res.headers });
  replies.push(text);
  return res;
}
function seat(slug, pin) { return { "x-workspace": slug, "x-pin": pin }; }
function forms(code) { const c = String(code); return [c, c.replace("-", ""), c.toUpperCase(), c.replace("-", "").toUpperCase()]; }
function holds(text, codes) { return codes.some((c) => forms(c).some((f) => text.indexOf(f) >= 0)); }

async function main() {
  const lib = require(path.join(root, "api/_lib"));
  const settings = require(path.join(root, "api/_account-settings"));
  handler = require(path.join(root, "api/auth"));
  await lib.ready();
  const now = new Date().toISOString();
  const H = (p) => lib.hashPin(p);
  lib.mem.accounts = [
    { id: "acct_A", name: "Own Shop", ownerName: "Ann", email: "ann@example.test", desks: ["own-desk"], memberDesks: [], createdAt: now },
    { id: "acct_B", name: "Bo", ownerName: "Bo", email: "bo@example.test", desks: [], memberDesks: ["own-desk"], createdAt: now },
    { id: "acct_C", name: "Other Shop", ownerName: "Cy", email: "cy@example.test", desks: ["other-desk"], memberDesks: [], createdAt: now }
  ];
  lib.mem.workspaces = [
    {
      slug: "own-desk", biz: "Own Shop", name: "Ann", accountId: "acct_A", pin: H("4821"), createdAt: now,
      people: [
        { id: "p_owner", name: "Ann", role: "owner", kind: "owner", status: "approved", pin: H("4821"), accountId: "acct_A", email: "ann@example.test" },
        { id: "p_helper", name: "Hal", role: "employee", kind: "helper", status: "approved", pin: H("5555"), accountId: "" },
        { id: "p_wait", name: "Wes", role: "employee", kind: "helper", status: "pending", pin: H("7777"), accountId: "acct_B" },
        { id: "p_ai", name: "Bot", role: "employee", kind: "agent", status: "approved", pin: H("8888"), accountId: "acct_B" },
        { id: "p_bo", name: "Bo", role: "employee", kind: "member", status: "approved", pin: H("9999"), accountId: "acct_B" },
        { id: "p_gone", name: "Gil", role: "owner", kind: "owner", status: "removed", pin: H("2468"), accountId: "acct_A" }
      ]
    },
    {
      slug: "other-desk", biz: "Other Shop", name: "Cy", accountId: "acct_C", pin: H("1234"), createdAt: now,
      people: [{ id: "p_owner", name: "Cy", role: "owner", kind: "owner", status: "approved", pin: H("1234"), accountId: "acct_C" }]
    }
  ];
  lib.mem.money = [{ id: "m1", amount: 5, status: "hold" }];
  const moneyBefore = JSON.stringify(lib.mem.money);
  const A = () => lib.mem.accounts.find((a) => a.id === "acct_A");
  const C = () => lib.mem.accounts.find((a) => a.id === "acct_C");
  const W = (s) => lib.mem.workspaces.find((w) => w.slug === s);
  const memText = () => JSON.stringify(lib.mem);
  // Everything a refused call could write. Sessions only slide seenAt, and
  // mem.account is the built-in AIA account filled on first read (main does both).
  const writeView = () => JSON.stringify(Object.keys(lib.mem).filter((k) => k !== "sessions" && k !== "account").sort().map((k) => [k, lib.mem[k]]));
  await call("GET", {}, null, { settings: "1" });
  await lib.save();

  // Source: hashed with scrypt, compared with timingSafeEqual, wired once.
  const src = fs.readFileSync(path.join(root, "api/_account-settings.js"), "utf8");
  const useSrc = (src.split("function useBackupCode")[1] || "").split("\nfunction ")[0];
  ok(/crypto\.scryptSync\(/.test(src) && /crypto\.randomBytes\(16\)/.test(src), "source: codes are hashed with scrypt and a 16-byte salt each");
  ok(/crypto\.timingSafeEqual\(want, got\)/.test(useSrc) && !/\.hash\s*===|===\s*row\.hash|want\s*===\s*got|\.equals\(/.test(useSrc), "source: useBackupCode compares with crypto.timingSafeEqual, never ===");
  ok(!/return true;[\s\S]*\n  \}\n  if \(!hit\)/.test(useSrc) && !/for \([^)]*\) \{[^}]*return true/.test(useSrc), "source: useBackupCode has no early return inside the compare loop");
  ok(/crypto\.randomInt\(/.test(src) && !/Math\.random/.test(src), "source: codes come from crypto.randomInt, never Math.random");
  ok(!/console\.(log|error|warn|info)/.test(src), "source: settings prints nothing to the console");
  ok(!BANNED.test(HINT) && !BANNED.test(HISTORY_LINE) && !BANNED.test(REFUSE_OWNER) && src.indexOf(HINT) >= 0 && src.indexOf(HISTORY_LINE) >= 0 && src.indexOf(REFUSE_OWNER) >= 0, "words: plain facts only, no security brag words");
  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  ok(pkg.indexOf("node scripts/check-backup-codes.js") >= 0, "package.json test runs this check");

  // Refused callers: nothing saved, no codes, store bytes unchanged.
  const refused = [
    ["helper on the owner's desk", seat("own-desk", "5555"), {}],
    ["member with an account of their own", seat("own-desk", "9999"), {}],
    ["waiting seat", seat("own-desk", "7777"), {}],
    ["Desk AI seat", seat("own-desk", "8888"), {}],
    ["removed owner seat", seat("own-desk", "2468"), {}],
    ["wrong desk pin", seat("own-desk", "0000"), {}],
    ["stranger, no headers", {}, {}],
    ["made-up session", { "x-session": "not-a-real-token" }, {}],
    ["other desk owner naming acct_A", seat("other-desk", "1234"), { accountId: "acct_A" }],
    ["owner naming another account", seat("own-desk", "4821"), { accountId: "acct_C" }],
    ["owner with an extra field", seat("own-desk", "4821"), { codes: ["aaaaa-aaaaa"] }]
  ];
  const otherTok = lib.issueSession(W("other-desk").people[0], W("other-desk"), C(), { headers: {} }).token;
  refused.push(["other desk owner session pointed at own-desk", { "x-session": otherTok, "x-workspace": "own-desk" }, {}]);
  for (const [label, headers, extra] of refused) {
    await lib.save();
    const before = writeView();
    const bytes0 = fs.readFileSync(store, "utf8");
    const r = await call("POST", headers, Object.assign({ action: "backup-codes" }, extra));
    const b = r.body || {};
    const no = r.statusCode >= 400 && r.statusCode < 500 && b.ok === false && !b.codes && !b.backupCodes;
    const same = writeView() === before && fs.readFileSync(store, "utf8") === bytes0;
    ok(no && same && !A().backupCodes && !C().backupCodes, "refused, nothing saved: " + label + " (" + r.statusCode + ")");
  }
  const helperR = await call("POST", seat("own-desk", "9999"), { action: "backup-codes" });
  ok(helperR.body && helperR.body.error === REFUSE_OWNER && helperR.statusCode === 403, "member with an account of their own gets the exact owner-only refusal");

  // Owner makes codes with the desk pin.
  const hist0 = (A().history || []).length;
  const logs0 = JSON.stringify(lib.mem.audit || []) + JSON.stringify(lib.mem.log || []);
  const made = await call("POST", seat("own-desk", "4821"), { action: "backup-codes" });
  const madeText = replies[replies.length - 1];
  const codes = (made.body && made.body.codes) || [];
  ok(made.statusCode === 200 && made.body.ok === true, "owner with the desk pin makes backup codes (" + made.statusCode + ")");
  ok(codes.length === 10 && codes.every((c) => CODE_RE.test(c)) && new Set(codes).size === 10, "10 distinct codes, xxxxx-xxxxx");
  ok(made.body.hint === HINT, "hint is the exact plain line");
  ok(JSON.stringify(made.body.backupCodes) === JSON.stringify({ made: true, madeAt: A().backupCodes.madeAt, left: 10, total: 10 }), "reply counts 10 left of 10");
  const rows = (A().backupCodes && A().backupCodes.codes) || [];
  ok(rows.length === 10 && rows.every((r) => r.tag === "scrypt1" && /^[0-9a-f]{32}$/.test(r.salt) && /^[0-9a-f]{64}$/.test(r.hash) && r.usedAt === "" && Object.keys(r).sort().join(",") === "hash,salt,tag,usedAt"), "stored rows are tag, salt, scrypt hash, usedAt only");
  ok(new Set(rows.map((r) => r.salt)).size === 10, "each code has its own salt");
  const sha = codes.map((c) => crypto.createHash("sha256").update(c.replace("-", "")).digest("hex"));
  ok(!rows.some((r) => sha.indexOf(r.hash) >= 0), "stored hash is not a bare sha256 of a code");
  await lib.save();
  ok(!holds(memText(), codes), "no plain code in memory (store, history, audit, log, sessions)");
  ok(!holds(fs.readFileSync(store, "utf8"), codes), "no plain code in the saved store file");
  ok(!holds(JSON.stringify(A().history || []), codes), "no plain code in history");
  ok(!holds(lines.join("\n"), codes), "no plain code in any console line");
  const h = (A().history || [])[0] || {};
  ok((A().history || []).length === hist0 + 1 && h.what === HISTORY_LINE && h.section === "backup-codes", "one history row: " + HISTORY_LINE);
  ok((JSON.stringify(lib.mem.audit || []) + JSON.stringify(lib.mem.log || [])) !== null && !holds(JSON.stringify(lib.mem.audit || []) + JSON.stringify(lib.mem.log || []), codes) && logs0 !== undefined, "no plain code in audit or log rows");

  // Shown once: later reads never carry them.
  const read = await call("GET", seat("own-desk", "4821"), null, { settings: "1" });
  ok(read.statusCode === 200 && read.body.settings.backupCodes.left === 10 && read.body.settings.backupCodes.made === true, "settings read shows only made/left/total");
  const emailTok = lib.issueSession(W("own-desk").people[0], W("own-desk"), A(), { headers: {} }, "password").token;
  const viaEmail = await call("GET", { "x-session": emailTok }, null, { settings: "1" });
  ok(viaEmail.statusCode === 200 && viaEmail.body.settings.account.id === "acct_A", "email session still reads settings (" + viaEmail.statusCode + ")");
  const viaPin = await call("GET", seat("own-desk", "4821"), null, { settings: "1" });
  ok(viaPin.statusCode === 200, "desk pin still reads settings");
  const others = replies.filter((t) => t !== madeText);
  ok(!others.some((t) => holds(t, codes)), "codes appear only in the one reply that made them (" + others.length + " other replies)");

  // One use each.
  ok(settings.useBackupCode(A(), codes[0]) === true, "a fresh code works");
  ok(settings.useBackupCode(A(), codes[0]) === false, "the same code a second time is refused");
  ok(settings.useBackupCode(A(), codes[1].toUpperCase().replace("-", " ")) === true, "case and spacing do not matter");
  ok(settings.useBackupCode(A(), codes[1]) === false, "that code is spent too");
  ok(settings.useBackupCode(A(), "aaaaa-aaaaa") === false && settings.useBackupCode(A(), "") === false && settings.useBackupCode(A(), "0o1il-0o1il") === false && settings.useBackupCode(A(), { toString: "x" }) === false, "made-up, empty, badly formed, and object codes are refused");
  ok(settings.useBackupCode(C(), codes[2]) === false, "a code from one account does not work on another");
  ok(rows.filter((r) => r.usedAt).length === 2, "exactly two codes are marked used");
  const left = await call("GET", seat("own-desk", "4821"), null, { settings: "1" });
  ok(left.body.settings.backupCodes.left === 8 && left.body.settings.backupCodes.total === 10, "8 left after two uses");

  // New codes stop every old code.
  const again = await call("POST", { "x-session": emailTok }, { action: "backup-codes" });
  const codes2 = (again.body && again.body.codes) || [];
  ok(again.statusCode === 200 && codes2.length === 10 && !codes2.some((c) => codes.indexOf(c) >= 0), "owner email session makes a new set");
  ok(codes.every((c) => settings.useBackupCode(A(), c) === false), "every old code (used or not) stops working");
  ok(settings.useBackupCode(A(), codes2[9]) === true, "a new code works");
  ok((A().history || [])[0].what === HISTORY_LINE && (A().history || []).filter((x) => x.what === HISTORY_LINE).length === 2, "the second set adds its own history row");
  await lib.save();
  ok(!holds(memText(), codes.concat(codes2)) && !holds(fs.readFileSync(store, "utf8"), codes.concat(codes2)) && !holds(lines.join("\n"), codes.concat(codes2)), "no plain code from either set in memory, store, or console");

  // Other desk's owner makes their own; acct_A is untouched.
  const aBefore = JSON.stringify(A().backupCodes);
  const cy = await call("POST", seat("other-desk", "1234"), { action: "backup-codes" });
  ok(cy.statusCode === 200 && C().backupCodes && JSON.stringify(A().backupCodes) === aBefore, "another owner makes codes only on their own account");
  ok(settings.useBackupCode(A(), cy.body.codes[0]) === false, "the other owner's code does not work on acct_A");
  ok(JSON.stringify(lib.mem.money) === moneyBefore, "money rows untouched (Collect HOLD)");

  try { fs.unlinkSync(store); } catch (e) {}
  if (failed) { console.error("check-backup-codes: " + failed + " failed"); process.exit(1); }
  console.log("check-backup-codes: ok");
}

// Mutants: each one breaks one rule in a copy of api/; the check must fail on it.
const MUTANTS = [
  ["plain code stored next to the hash", "rows.push({ tag: BACKUP_TAG, salt:", "rows.push({ code: c, tag: BACKUP_TAG, salt:"],
  ["plain codes put in history", 'addHistory(acc, person, "backup-codes", "You made new backup codes.", whoKind);', 'addHistory(acc, person, "backup-codes", "You made new backup codes. " + codes.join(" "), whoKind);'],
  ["plain codes in the log", 'lib.log("Account", "Backup codes made", "OK", seat.row.slug);', 'lib.log("Account", "Backup codes made " + codes.join(" "), "OK", seat.row.slug);'],
  ["codes shown again on settings read (kept outside the store)", [["      backupCodes: publicBackupCodes(acc),\n", "      backupCodes: Object.assign(publicBackupCodes(acc), { codes: LAST_CODES[acc.id] || [] }),\n"], ["  acc.backupCodes = { madeAt:", "  LAST_CODES[acc.id] = plainCodes;\n  acc.backupCodes = { madeAt:"], ["const BACKUP_N = 16384;", "const BACKUP_N = 16384;\nconst LAST_CODES = {};"]]],
  ["codes kept for later reads", "  acc.backupCodes = { madeAt:", "  acc.lastCodes = plainCodes;\n  acc.backupCodes = { madeAt:"],
  ["used code not marked", "  hit.usedAt = new Date().toISOString();\n", ""],
  ["used code still accepted", "row.tag !== BACKUP_TAG || row.usedAt ||", "row.tag !== BACKUP_TAG ||"],
  ["new codes keep the old ones", "  acc.backupCodes = { madeAt: new Date().toISOString(), codes: rows };", "  const keep = acc.backupCodes && Array.isArray(acc.backupCodes.codes) ? acc.backupCodes.codes : [];\n  acc.backupCodes = { madeAt: new Date().toISOString(), codes: keep.concat(rows) };"],
  ["owner-only gate dropped", '    if (!lib.isOwner(person)) return refuse(res, 403, "Only the account owner can make backup codes. Nothing was saved."), true;\n', ""],
  ["=== compare instead of timingSafeEqual", "crypto.timingSafeEqual(want, got)", "want.toString(\"hex\") === got.toString(\"hex\")"],
  ["unsalted sha256 hash", "  return crypto.scryptSync(String(code), salt, 32, { N: BACKUP_N, r: 8, p: 1 });", "  return crypto.createHash(\"sha256\").update(String(code)).digest();"],
  ["one salt for all codes", "    const salt = crypto.randomBytes(16);\n", "    const salt = Buffer.alloc(16, 1);\n"],
  ["any code accepted", "if (!hit) return false;", "if (!hit) { hit = set.find((r) => r && !r.usedAt); if (!hit) return false; }"],
  ["history row words changed", '"You made new backup codes."', '"Backup codes were made."'],
  ["security brag in the hint", "Here are 10 backup codes. Each one works once.", "Here are 10 secure backup codes. Each one works once."],
  ["nine codes", "const BACKUP_COUNT = 10;", "const BACKUP_COUNT = 9;"],
  ["Math.random codes", "BACKUP_CHARS[crypto.randomInt(BACKUP_CHARS.length)]", "BACKUP_CHARS[Math.floor(Math.random() * BACKUP_CHARS.length)]"],
  ["saved before the owner check", '    if (!lib.isOwner(person)) return refuse(res, 403, "Only the account owner can make backup codes. Nothing was saved."), true;\n    const codes = makeBackupCodes(acc);\n', '    const codes = makeBackupCodes(acc);\n    if (!lib.isOwner(person)) { await lib.save(); return refuse(res, 403, "Only the account owner can make backup codes. Nothing was saved."), true; }\n'],
  ["extra fields accepted", '    const extra = onlyKeys(body, ["action"].concat(ID_FIELDS));\n    if (extra) return refuse(res, 400, "Not a backup code field: "', '    const extra = null;\n    if (extra) return refuse(res, 400, "Not a backup code field: "']
];

function copyTree(dir) {
  const skip = { ".git": 1, node_modules: 1 };
  fs.readdirSync(root).forEach((n) => {
    if (skip[n]) return;
    if (n === "api" || n === "packs" || n === "package.json" || /^aia-register-abi/.test(n)) fs.cpSync(path.join(root, n), path.join(dir, n), { recursive: true });
  });
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  ["_env-guard.js", "check-backup-codes.js"].forEach((f) => fs.copyFileSync(path.join(__dirname, f), path.join(dir, "scripts", f)));
}

function runMutants() {
  const env = Object.assign({}, process.env);
  Object.keys(env).forEach((k) => { if (/^BLOB_|^AIA_STORE_PATH$/.test(k)) delete env[k]; });
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "aia-backup-mut-"));
  copyTree(base);
  const control = spawnSync(process.execPath, [path.join(base, "scripts/check-backup-codes.js"), "--child"], { cwd: base, env, encoding: "utf8", timeout: 300000 });
  ok(control.status === 0, "mutants: control copy passes");
  const file = path.join(base, "api/_account-settings.js");
  const clean = fs.readFileSync(file, "utf8");
  let caught = 0;
  MUTANTS.forEach(([label, from, to]) => {
    const pairs = Array.isArray(from) ? from : [[from, to]];
    let text = clean;
    for (const [a, b] of pairs) {
      if (text.split(a).length !== 2) { fail("mutant anchor not found once: " + label); return; }
      text = text.replace(a, b);
    }
    fs.writeFileSync(file, text);
    const r = spawnSync(process.execPath, [path.join(base, "scripts/check-backup-codes.js"), "--child"], { cwd: base, env, encoding: "utf8", timeout: 300000 });
    if (r.status !== 0) { caught += 1; pass("mutant caught: " + label); } else fail("mutant survived: " + label);
  });
  fs.writeFileSync(file, clean);
  fs.rmSync(base, { recursive: true, force: true });
  ok(caught === MUTANTS.length, "mutants " + caught + "/" + MUTANTS.length + " caught");
}

main().then(() => {
  if (!CHILD && !failed) runMutants();
  if (failed) { console.error("check-backup-codes: " + failed + " failed"); process.exit(1); }
  if (!CHILD) console.log("check-backup-codes: ok with mutants");
}).catch((e) => { console.error("FAIL " + (e && e.stack || e)); process.exit(1); });
