#!/usr/bin/env node
require("./_env-guard");
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

// Never touch the repo's real local store (api/data/aia.json), its uploads, or Blob.
// Every store setting the lib reads points at a private temp dir before api/_lib loads.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "aia-money-"));
fs.mkdirSync(path.join(scratch, "tmp"));
process.env.TMPDIR = path.join(scratch, "tmp");
process.env.AIA_STORE_PATH = path.join(scratch, "store.json");
process.env.AIA_UPLOAD_DIR = path.join(scratch, "up");
["BLOB_READ_WRITE_TOKEN", "BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN", "BLOB_READ_WRITE_TOKEN_STORE_ID", "BLOB_STORE_ID", "AIA_BLOB_TOKEN", "VERCEL_OIDC_TOKEN"].forEach((k) => { delete process.env[k]; });
process.on("exit", () => { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (e) {} });

// Every repo file (outside .git and node_modules), by hash, so the run can prove it left the repo alone.
function repoSnap(dir, out) {
  out = out || {};
  fs.readdirSync(dir).forEach((name) => {
    if (name === ".git" || name === "node_modules") return;
    const full = path.join(dir, name);
    const st = fs.lstatSync(full);
    if (st.isDirectory()) repoSnap(full, out);
    else if (st.isFile()) out[path.relative(root, full)] = require("crypto").createHash("sha1").update(fs.readFileSync(full)).digest("hex");
  });
  return out;
}
const DATA_FILE = path.join(api, "data", "aia.json");
const repoBefore = repoSnap(root);
const dataBefore = fs.existsSync(DATA_FILE) ? fs.readFileSync(DATA_FILE) : null;
function repoUnchanged() {
  const dataAfter = fs.existsSync(DATA_FILE) ? fs.readFileSync(DATA_FILE) : null;
  if ((dataBefore === null) !== (dataAfter === null) || (dataBefore && !dataBefore.equals(dataAfter))) {
    fail("api/data/aia.json changed during the run (" + (dataBefore ? "was there" : "was absent") + ", now " + (dataAfter ? dataAfter.length + " bytes" : "absent") + ")");
  }
  const after = repoSnap(root);
  const changed = Object.keys(Object.assign({}, repoBefore, after)).filter((k) => repoBefore[k] !== after[k]);
  if (changed.length) fail("the run changed repo files: " + changed.slice(0, 8).join(", "));
  pass("api/data/aia.json and every repo file are byte-unchanged (" + Object.keys(after).length + " files)");
}

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
function tmpFiles() {
  try { return fs.readdirSync(os.tmpdir()).sort().join("\n"); } catch (e) { return ""; }
}

// Counts card lookups during one request: find / findIndex / some / filter called from
// api/hook.js on the card list. The lib swaps mem.jobs for a fresh array on load, so the
// spy sits on Array.prototype and checks "this" against the live mem.jobs at call time.
function spyLookups(lib) {
  const names = ["find", "findIndex", "some", "filter"];
  const real = {};
  const spy = { n: 0, stop() { names.forEach((k) => { Array.prototype[k] = real[k]; }); } };
  names.forEach((k) => {
    real[k] = Array.prototype[k];
    Array.prototype[k] = function () {
      if (this === lib.mem.jobs) {
        const caller = String(new Error().stack || "").split("\n")[2] || "";
        if (/api[\\/]hook\.js/.test(caller)) spy.n++;
      }
      return real[k].apply(this, arguments);
    };
  });
  return spy;
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
    { event: "payment paid" }, { status: "UNPAID" }, { event: "update", status: "UnPaid" }, { event: "update", action: "SOLD" },
    { status: ["paid"] }, { event: "update", status: ["paid"] }, { event: "update", status: ["update", "paid"] }, { event: "update", status: [["sold"]] }
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
        const lookups = spyLookups(lib);
        const r = await call(hook, headers, body);
        lookups.stop();
        if (lookups.n) fail(label + ": looked up a card before answering HOLD (" + lookups.n + " card lookups)");
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
  pass(n + " paid/sold hook posts answer Collect HOLD before any card lookup: no card change, no money row, no file, no Blob");

  // Status that is not a plain string and carries no paid/sold word: no crash, and no
  // money, done, or charge. It may take the ordinary update path (a note on the card).
  const odd = [0, 42, true, null, {}, { v: "paid" }, [], [1, 2]];
  for (const st of odd) {
    const label = "status " + JSON.stringify(st);
    const moneyB = JSON.stringify(lib.mem.money || []);
    let r;
    try { r = await call(hook, { "x-workspace": slug }, { id: "job_moneyhold", status: st }); } catch (e) { fail(label + " crashed the hook: " + e.message); }
    if (!r || !(r.statusCode === 200 || r.statusCode === 409)) fail(label + ": expected 200 update or 409 HOLD, got " + (r && r.statusCode) + " " + JSON.stringify(r && r.body));
    const c = lib.mem.jobs.find((j) => j.id === "job_moneyhold");
    if (JSON.stringify(lib.mem.money || []) !== moneyB) fail(label + ": wrote a money row");
    if (!c || c.status !== "out" || c.doneAt || c.charged === true || c.paid) fail(label + ": marked the card done or charged: " + JSON.stringify(c));
  }
  pass("odd status shapes (number, bool, null, object, array) do not crash and write no money, done, or charge");

  // done with an amount closes the card but writes no money row (hook and desk).
  lib.mem.jobs.unshift({ id: "job_moneydone", workspace: slug, title: "Done with money", amount: 42, status: "out", step: "Do", createdAt: new Date().toISOString() });
  lib.mem.jobs.unshift({ id: "job_moneydone2", workspace: slug, title: "Done on desk", amount: 42, status: "out", step: "Do", createdAt: new Date().toISOString() });
  const moneyD = JSON.stringify(lib.mem.money || []);
  const hd = await call(hook, { "x-workspace": slug }, { id: "job_moneydone", event: "done", amount: 42, notes: "Finished." });
  const jd = await call(jobs, { "x-workspace": slug, "x-pin": pin }, { action: "done", id: "job_moneydone2", amount: 42, text: "Finished." }, "/api/jobs");
  if (hd.statusCode !== 200 || lib.mem.jobs.find((j) => j.id === "job_moneydone").status !== "shipped") fail("hook done must still close the card, got " + hd.statusCode);
  if (jd.statusCode !== 200) fail("desk done must still answer 200, got " + jd.statusCode + " " + JSON.stringify(jd.body && jd.body.error));
  if (JSON.stringify(lib.mem.money || []) !== moneyD) fail("done with an amount wrote a money row: " + JSON.stringify((lib.mem.money || [])[0]));
  ["job_moneydone", "job_moneydone2"].forEach((id) => { const c = lib.mem.jobs.find((j) => j.id === id); if (c.charged === true || c.paid) fail(id + " done marked the card charged or paid"); });
  pass("done with an amount (hook and desk) closes the card and writes no money row");

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
  if (shipped.charged === true || shipped.paid || shipped.paidAt || shipped.chargedAt) fail("ship marked the card charged or paid: " + JSON.stringify({ charged: shipped.charged, paid: shipped.paid, paidAt: shipped.paidAt, chargedAt: shipped.chargedAt }));
  pass("ship still ships the card and saves, writes no money row, and never marks the card charged or paid");
  repoUnchanged();
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
  ["HOLD moved after the card lookup", "api/hook.js",
    '  if (event === "collect" || moneyWord(body)) {\n    return res.status(409)', '  if (false) {\n    return res.status(409)',
    ['  if (event === "capture" || !job) {', '  if (event === "collect" || moneyWord(body)) {\n    return res.status(409).json({ ok: false, hold: true, collect: "hold", charged: false, event: "collect", error: COLLECT_HOLD });\n  }\n  if (event === "capture" || !job) {']],
  ["moneyWord case-sensitive (UNPAID falls through)", "api/hook.js",
    '/paid|sold/i.test(String(', '/paid|sold/.test(String('],
  ["moneyWord strings only (status [\"paid\"] with event update falls through)", "api/hook.js",
    '.some((v) => /paid|sold/i.test(String(v == null ? "" : v)))', '.some((v) => typeof v === "string" && /paid|sold/i.test(v))'],
  ["ship marks the card charged", "api/jobs.js",
    '// Collect is on HOLD: Ship never writes a money row.', 'job.charged = true;'],
  ["ship marks the card paid", "api/jobs.js",
    '// Collect is on HOLD: Ship never writes a money row.', 'job.paid = true; job.paidAt = new Date().toISOString();'],
  ["hook done with an amount writes a money row (no literal unshift)", "api/hook.js",
    '    finishDone(job, body, body.how || "pipe");', '    finishDone(job, body, body.how || "pipe");\n    if (body.amount) Array.prototype.unshift.call(mem["mon" + "ey"], { workspace, what: "Pipe done", amt: "$" + body.amount, held: false });'],
  ["the hook writes the repo's api/data/aia.json when it loads", "api/hook.js",
    'const mail = require("./_aia-mail");', 'const mail = require("./_aia-mail");\ntry { require("fs").mkdirSync(require("path").join(__dirname, "data"), { recursive: true }); require("fs").writeFileSync(require("path").join(__dirname, "data", "aia.json"), "{}"); } catch (e) {}'],
  ["package.json stops running this check", "package.json",
    'node scripts/check-no-unheld-money.js', 'node scripts/check-icons.js']
];
// Indexes of mutants only the source scan can see (no request behavior changes).
const STATIC_ONLY = ["hook eventOf regex back to /sold|paid/", "an api door calls chargeWallet", "another api file writes a money row", "package.json stops running this check"];
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
    function makeMutant(dir) {
      copyTree(pristine, dir);
      const file = path.join(dir, m[1]);
      let src = fs.readFileSync(file, "utf8");
      if (m[2] === null) src = src + m[3];
      else {
        if (src.indexOf(m[2]) < 0) fail("mutant " + m[0] + ": anchor not found in " + m[1]);
        src = src.replace(m[2], m[3]);
        if (m[4]) {
          if (src.indexOf(m[4][0]) < 0) fail("mutant " + m[0] + ": second anchor not found in " + m[1]);
          src = src.replace(m[4][0], m[4][1]);
        }
        if (m[1] === "api/hook.js" && m[3].indexOf("job0()") >= 0) src = src + HOOK_JOB0;
      }
      fs.writeFileSync(file, src);
    }
    makeMutant(dir);
    const first = (r) => (String(r.stderr || "").split("\n").find((l) => l.indexOf("FAIL ") === 0) || ("exit " + r.status)).slice(0, 150);
    const r = runChild(dir, false);
    // Mutants that change behavior must also be caught by the runtime part alone,
    // not only by the source scan.
    let rt = null;
    if (STATIC_ONLY.indexOf(m[0]) < 0) {
      // A fresh mutant copy, so nothing the first run left behind hides a change.
      fs.rmSync(dir, { recursive: true, force: true });
      makeMutant(dir);
      rt = runChild(dir, true);
    }
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
