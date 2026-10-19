#!/usr/bin/env node
// Collect is on HOLD, so no door may write an unheld money row.
// 1. POST /api/hook with paid/sold in event, action, or status (any case, "unpaid"
//    too), with no creds, a wrong secret, an owner pin, or an owner session, by card
//    id, externalId, unknown id, or no id: answers Collect HOLD and writes nothing:
//    no card change, no money row, no file write, no Blob put.
// 2. POST /api/jobs action=ship still ships the card but writes no money row.
// 3. Nothing in api/ calls the dormant chargeWallet, and no other api file writes
//    a money row.
// node scripts/check-no-unheld-money.js --mutants breaks the code each way and
// proves this check catches every one.
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");
const { spawnSync } = require("child_process");

const root = process.env.AIA_MONEY_ROOT || path.join(__dirname, "..");
const api = path.join(root, "api");

function fail(msg) { console.error("FAIL " + msg); process.exit(1); }
function pass(msg) { if (!process.env.AIA_MONEY_QUIET) console.log("ok  " + msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

// ---- static: who can write money ----
function staticChecks() {
  const files = fs.readdirSync(api).filter((f) => /\.js$/.test(f));
  const writers = [];
  const wallet = [];
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(api, f), "utf8");
    if (/money\s*\.\s*(unshift|push|splice)\s*\(|money\s*\[[^\]]*\]\s*=[^=]/.test(src)) writers.push(f);
    if (f !== "_wallets.js" && /chargeWallet|_wallets/.test(src)) wallet.push(f);
  });
  if (writers.join(",") !== "_wallets.js") fail("only the dormant api/_wallets.js may write a money row, found: " + writers.join(", "));
  pass("no api door writes a money row (api/_wallets.js is the only writer, and it is dormant)");
  if (wallet.length) fail("api must not call chargeWallet or load _wallets: " + wallet.join(", "));
  pass("nothing in api/ calls chargeWallet or loads _wallets");
  const hook = read("api/hook.js");
  if (hook.indexOf('/\\b(sold|paid)\\b/.test(raw)') < 0) fail("hook eventOf must match paid/sold as whole words only (unpaid is not paid)");
  pass("hook eventOf matches paid/sold as whole words");
  if (read("package.json").indexOf("scripts/check-no-unheld-money.js") < 0) fail("package.json test must run this check");
}

// ---- runtime ----
const blobCalls = [];
const realLoad = Module._load;
Module._load = function (req) {
  if (req === "@vercel/blob") {
    const spy = (name) => async function () { blobCalls.push(name); return { url: "https://blob.example.test/x", pathname: "x" }; };
    return { put: spy("put"), del: spy("del"), copy: spy("copy"), head: spy("head"), list: async () => ({ blobs: [] }), get: spy("get") };
  }
  return realLoad.apply(this, arguments);
};
let writes = [];
["writeFileSync", "appendFileSync", "renameSync", "copyFileSync", "unlinkSync"].forEach((k) => {
  const real = fs[k];
  fs[k] = function () { writes.push(k + " " + String(arguments[0])); return real.apply(this, arguments); };
});
["writeFile", "appendFile", "rename", "copyFile", "unlink"].forEach((k) => {
  const real = fs.promises[k];
  fs.promises[k] = function () { writes.push("promises." + k + " " + String(arguments[0])); return real.apply(this, arguments); };
});

function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; }
  };
}
async function call(handler, headers, body, url) {
  const res = mockRes();
  await handler({ method: "POST", headers: headers || {}, body: body || {}, query: {}, url: url || "/api/hook" }, res);
  return res;
}
// A private temp dir, so other checks running at the same time cannot add files to it.
if (!process.env.AIA_MONEY_QUIET) process.env.TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), "aia-money-tmp-"));
function tmpFiles() {
  try { return fs.readdirSync(os.tmpdir()).sort().join("\n"); } catch (e) { return ""; }
}

async function runtime() {
  const auth = require(path.join(api, "auth"));
  const hook = require(path.join(api, "hook"));
  const jobs = require(path.join(api, "jobs"));
  const lib = require(path.join(api, "_lib"));
  await lib.ready();
  const slug = "money-hold-shop";
  const pin = "5172";
  const opened = await call(auth, { "x-workspace": slug }, { action: "open", slug: slug, biz: "Money Hold Shop", name: "James", pin: pin }, "/api/auth");
  if (opened.statusCode !== 201) fail("could not open a desk: " + opened.statusCode + " " + JSON.stringify(opened.body));
  const token = opened.body && opened.body.session && opened.body.session.token;
  if (!token) fail("desk open should issue a session");
  const other = await call(auth, { "x-workspace": "money-hold-other" }, { action: "open", slug: "money-hold-other", biz: "Other", name: "Other", pin: "6283" }, "/api/auth");
  if (other.statusCode !== 201) fail("could not open the other desk");
  lib.mem.jobs.unshift({ id: "job_moneyhold", externalId: "ext-moneyhold", workspace: slug, title: "Porch sale", amount: 42, status: "out", step: "Do", offDesk: true, awaiting: "writeback", createdAt: new Date().toISOString() });
  lib.mem.money = lib.mem.money || [];
  await lib.save();
  pass("opened a desk with a card waiting on write-back");

  const creds = {
    "no creds": {},
    "wrong secret": { "x-hook-secret": "not-the-secret", authorization: "Bearer not-the-secret" },
    "other desk's pin": { "x-pin": "6283" },
    "owner pin": { "x-pin": pin },
    "owner session": { "x-session": token }
  };
  const targets = {
    "card id": { id: "job_moneyhold" },
    "jobId": { jobId: "job_moneyhold" },
    "externalId": { externalId: "ext-moneyhold" },
    "unknown id": { id: "job_nope" },
    "no id": {}
  };
  const words = [
    { event: "paid" }, { event: "sold" }, { event: "PAID" }, { event: "Sold" }, { action: "paid" },
    { status: "paid" }, { status: "unpaid" }, { event: "update", status: "paid" }, { event: "done", action: "sold" },
    { event: "payment paid" }
  ];
  let n = 0;
  for (const cn of Object.keys(creds)) {
    for (const tn of Object.keys(targets)) {
      for (const w of words) {
        const body = Object.assign({ amount: 42, notes: "Paid in full." }, targets[tn], w);
        const headers = Object.assign({ "x-workspace": slug }, creds[cn]);
        const label = cn + " / " + tn + " / " + JSON.stringify(w);
        const before = JSON.stringify(lib.mem);
        const tmpBefore = tmpFiles();
        writes = [];
        blobCalls.length = 0;
        const r = await call(hook, headers, body);
        const b = r.body || {};
        if (r.statusCode !== 409 || b.ok !== false || b.hold !== true || b.collect !== "hold" || b.charged !== false || !/Collect stays HOLD/.test(String(b.error || ""))) {
          fail(label + ": expected the Collect HOLD reply, got " + r.statusCode + " " + JSON.stringify(b));
        }
        if (JSON.stringify(lib.mem) !== before) fail(label + ": changed the store in memory");
        if (writes.length) fail(label + ": wrote a file: " + writes.join(", "));
        if (blobCalls.length) fail(label + ": touched Blob: " + blobCalls.join(", "));
        if (tmpFiles() !== tmpBefore) fail(label + ": left a /tmp file");
        n++;
      }
    }
  }
  const card = lib.mem.jobs.find((j) => j.id === "job_moneyhold");
  if (!card || card.status !== "out" || card.doneAt || (lib.mem.money || []).length !== 0) fail("card or money changed after paid: " + JSON.stringify(card));
  pass(n + " paid/sold hook posts answer Collect HOLD: no card change, no money row, no file, no Blob");

  // Other events still write, so the spy above is live.
  writes = [];
  const upd = await call(hook, { "x-workspace": slug }, { id: "job_moneyhold", event: "update", notes: "Still out." });
  if (upd.statusCode !== 200 || !writes.length) fail("hook update must still save, got " + upd.statusCode + " writes " + writes.length);
  pass("hook update still saves (the write spy is live)");

  // Ship: a desk webhook that answers 2xx ships the card and writes no money row.
  lib.mem.connections.push({ id: "conn_moneyhold", workspace: slug, provider: "webhook", hook: "https://hook.example.test/ship", label: "Test hook", live: true });
  lib.mem.jobs.unshift({ id: "job_moneyship", workspace: slug, title: "Ship me", amount: 42, status: "waiting", step: "Do", createdAt: new Date().toISOString() });
  const realFetch = global.fetch;
  const fetched = [];
  global.fetch = async function (url) { fetched.push(String(url)); return { ok: true, status: 200, json: async () => ({}), text: async () => "" }; };
  const moneyBefore = JSON.stringify(lib.mem.money || []);
  writes = [];
  const ship = await call(jobs, { "x-workspace": slug, "x-pin": pin }, { action: "ship", id: "job_moneyship", amount: 42, confirm: true }, "/api/jobs");
  global.fetch = realFetch;
  const shipped = lib.mem.jobs.find((j) => j.id === "job_moneyship");
  if (ship.statusCode !== 200 || !shipped || shipped.status !== "shipped") fail("ship must still ship the card, got " + ship.statusCode + " " + JSON.stringify(ship.body && (ship.body.error || ship.body.job && ship.body.job.status)));
  if (fetched.indexOf("https://hook.example.test/ship") < 0) fail("ship did not reach the desk webhook stub: " + fetched.join(", "));
  if (!writes.length) fail("ship must still save the card");
  if (JSON.stringify(lib.mem.money || []) !== moneyBefore) fail("ship wrote a money row: " + JSON.stringify((lib.mem.money || [])[0]));
  pass("ship still ships the card and saves, and writes no money row");
  console.log("check-no-unheld-money: ok");
}

// ---- mutants ----
const MUTANTS = [
  ["hook paid writes a held:false money row", "api/hook.js",
    'return res.status(409).json({ ok: false, hold: true, collect: "hold"',
    'if (job0()) { mem.money.unshift({ at: "x", workspace, who: "x", what: "Pipe collect", amt: "$42", held: false }); await save(); }\n    return res.status(409).json({ ok: false, hold: true, collect: "hold"'],
  ["hook paid marks the card done", "api/hook.js",
    'return res.status(409).json({ ok: false, hold: true, collect: "hold"',
    'const j0 = job0(); if (j0) { finishDone(j0, body, "pipe"); await save(); }\n    return res.status(409).json({ ok: false, hold: true, collect: "hold"'],
  ["hook paid writes a held:true money row", "api/hook.js",
    'return res.status(409).json({ ok: false, hold: true, collect: "hold"',
    'mem.money.unshift({ at: "x", workspace, who: "x", what: "Pipe collect", amt: "$42", held: true, charged: false }); await save();\n    return res.status(409).json({ ok: false, hold: true, collect: "hold"'],
  ["hook paid saves (put) only on the externalId branch", "api/hook.js",
    'return res.status(409).json({ ok: false, hold: true, collect: "hold"',
    'if (body.externalId) await save();\n    return res.status(409).json({ ok: false, hold: true, collect: "hold"'],
  ["hook HOLD only for event=collect (status unpaid falls through and writes)", "api/hook.js",
    'if (event === "collect" || moneyWord(body)) {', 'if (event === "collect") {'],
  ["hook HOLD skipped for a seated owner", "api/hook.js",
    'if (event === "collect" || moneyWord(body)) {', 'if ((event === "collect" || moneyWord(body)) && !hasSeat(req, workspace)) {'],
  ["hook HOLD only on action (event/status paid writes)", "api/hook.js",
    'return [body.event, body.action, body.status].some(', 'return [body.action].some('],
  ["hook eventOf regex back to /sold|paid/", "api/hook.js",
    '/\\b(sold|paid)\\b/.test(raw)', '/sold|paid/.test(raw)'],
  ["ship writes a held:false money row", "api/jobs.js",
    '// Collect is on HOLD: Ship never writes a money row.',
    'mem.money.unshift({ at: new Date().toISOString(), workspace, who: job.payoutTo || job.title, what: "Ship", amt: amount ? "$" + amount : "—", held: false });'],
  ["ship writes a held:true charged:false money row", "api/jobs.js",
    '// Collect is on HOLD: Ship never writes a money row.',
    'mem.money.unshift({ at: new Date().toISOString(), workspace, who: job.title, what: "Ship", amt: "$" + amount, held: true, charged: false });'],
  ["an api door calls chargeWallet", "api/jobs.js",
    '// Collect is on HOLD: Ship never writes a money row.',
    '// Collect is on HOLD: Ship never writes a money row.\n      if (body.wallet) require("./_wallets").chargeWallet(body.wallet, amount, "ship", person);'],
  ["another api file writes a money row", "api/worker.js",
    null, '\nfunction __m(mem) { mem.money.push({ held: false }); }\n'],
  ["package.json stops running this check", "package.json",
    'node scripts/check-no-unheld-money.js', 'node scripts/check-icons.js']
];
// Indexes of mutants only the source scan can see (no request behavior changes).
const STATIC_ONLY = [7, 10, 11, 12];
const HOOK_JOB0 = '\nfunction job0() { return (require("./_lib").mem.jobs || []).find((j) => j && j.id === "job_moneyhold"); }\n';

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach((name) => {
    if (name === ".git" || name === "node_modules") return;
    const a = path.join(from, name); const b = path.join(to, name);
    const st = fs.lstatSync(a);
    if (st.isDirectory()) copyTree(a, b); else if (st.isFile()) fs.copyFileSync(a, b);
  });
}

function runChild(dir, runtimeOnly) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-money-run-"));
  const env = { PATH: process.env.PATH, HOME: tmp, TMPDIR: tmp, AIA_STORE_PATH: path.join(tmp, "store.json"), AIA_UPLOAD_DIR: path.join(tmp, "up"), AIA_MONEY_ROOT: dir, AIA_MONEY_QUIET: "1" };
  if (runtimeOnly) env.AIA_MONEY_RUNTIME_ONLY = "1";
  const r = spawnSync(process.execPath, [path.join(dir, "scripts", "check-no-unheld-money.js")], { env, cwd: dir, encoding: "utf8", timeout: 120000 });
  fs.rmSync(tmp, { recursive: true, force: true });
  return r;
}

function mutants() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "aia-money-mut-"));
  const pristine = path.join(base, "pristine");
  copyTree(path.join(__dirname, ".."), pristine);
  const ok = runChild(pristine);
  if (ok.status !== 0) { console.error(ok.stdout + ok.stderr); fail("pristine copy must pass before mutants run"); }
  let caught = 0;
  MUTANTS.forEach((m, i) => {
    const dir = path.join(base, "m" + i);
    copyTree(pristine, dir);
    const file = path.join(dir, m[1]);
    let src = fs.readFileSync(file, "utf8");
    if (m[2] === null) src = src + m[3];
    else {
      if (src.indexOf(m[2]) < 0) fail("mutant " + m[0] + ": anchor not found in " + m[1]);
      src = src.replace(m[2], m[3]);
      if (m[1] === "api/hook.js" && m[3].indexOf("job0()") >= 0) src = src + HOOK_JOB0;
    }
    fs.writeFileSync(file, src);
    const first = (r) => (String(r.stderr || "").split("\n").find((l) => l.indexOf("FAIL ") === 0) || ("exit " + r.status)).slice(0, 150);
    const r = runChild(dir, false);
    // Mutants that change behavior must also be caught by the runtime part alone,
    // not only by the source scan.
    const rt = STATIC_ONLY.indexOf(i) < 0 ? runChild(dir, true) : null;
    const hit = r.status !== 0 && (!rt || rt.status !== 0);
    if (hit) caught++;
    console.log((hit ? "caught   " : "MISSED   ") + m[0] + " -> " + first(r) + (rt ? " | runtime alone: " + first(rt) : " | source scan only"));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  fs.rmSync(base, { recursive: true, force: true });
  console.log("mutants caught " + caught + "/" + MUTANTS.length);
  if (caught !== MUTANTS.length) process.exit(1);
}

if (process.argv.indexOf("--mutants") >= 0) mutants();
else {
  if (!process.env.AIA_MONEY_RUNTIME_ONLY) staticChecks();
  runtime().catch((e) => fail(String(e && e.stack || e)));
}
