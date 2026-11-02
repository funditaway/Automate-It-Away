#!/usr/bin/env node
require("./_env-guard");
// Email + password sign-in is a Queue login: the reply adds queue { accountId, name, desks }
// and a top-level desks array in the same public shape as POST /api/desks action "mine".
// Existing login fields stay. A shop-name + desk-code login gains no other desk.
// GET /api/jobs?desks=all (and ?queue=1) returns every desk where that password session's
// account holds an open seat, each card tagged with the desk slug and trimmed the way that
// seat's own single-desk GET trims it. A desk with no open seat is refused. A desk-code
// session and a stranger get the same 403 and the same error text. The read does not save.
// Collect stays HOLD. No network.
// Usage: node scripts/check-queue-login.js
//        node scripts/check-queue-login.js --mutate
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const MUTATE = process.argv.indexOf("--mutate") >= 0;
if (!MUTATE) {
  process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-queue-login-" + Date.now() + "-" + process.pid + ".json");
  delete global.__aia;
  delete global.__aiaHydrate;
}

let failed = 0;
function fail(msg) { console.error("FAIL " + msg); failed += 1; process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }
function ok(cond, msg) { if (cond) pass(msg); else fail(msg); }
function finish() {
  if (failed) { console.error("check-queue-login: " + failed + " failed"); process.exit(1); }
  console.log("check-queue-login: ok");
  process.exit(0);
}

function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; }
  };
}
async function call(handler, method, headers, body, query, url) {
  const res = mockRes();
  await handler({ method, headers: headers || {}, body: body || {}, query: query || {}, url: url || "/api/jobs" }, res);
  return res;
}
function sig(r) { return r.statusCode + " " + JSON.stringify(r.body); }
function needIds(card) { return ((card && card.needs) || []).map((a) => a && a.id); }
function untag(card) {
  const c = JSON.parse(JSON.stringify(card));
  delete c.slug;
  delete c.desk;
  return c;
}
const SHAPE = ["slug", "name", "aia", "role", "kind", "status", "requestedKind", "personId", "yours", "does", "instructions", "permsLine", "drop"];

async function main() {
  const auth = require(path.join(root, "api/auth"));
  const jobs = require(path.join(root, "api/jobs"));
  const desks = require(path.join(root, "api/_desks-http"));
  const lib = require(path.join(root, "api/_lib"));
  await lib.ready();
  const STORE = process.env.AIA_STORE_PATH;
  const A = "ql-a";
  const B = "ql-b";
  const C = "ql-c";
  const D = "ql-d";
  const SECRET_C = "SECRET-C-NOSEAT";
  const SECRET_D = "SECRET-D-CLOSED";
  const TITLE_A = "Card A owner";
  const TITLE_B = "Card B helper";

  async function open(slug, name, pin, email) {
    const r = await call(auth, "POST", { "x-workspace": slug }, { action: "open", slug, biz: name, name, pin, email: email || "" }, {}, "/api/auth");
    if (r.statusCode !== 201 || !r.body || !r.body.session) throw new Error("open " + slug + " " + r.statusCode + " " + JSON.stringify(r.body));
    return r.body.session.token;
  }
  const annTok = await open(A, "Ann Queue", "1111", "");
  const pw = await call(auth, "POST", { "x-workspace": A, "x-session": annTok }, { action: "password", password: "ann-pass-queue-1234", email: "ann@queue.test" }, {}, "/api/auth");
  if (pw.statusCode !== 200) throw new Error("password " + pw.statusCode + " " + JSON.stringify(pw.body));
  await open(B, "Bea Desk", "2222", "bea@queue.test");
  await open(C, "Cy Desk", "3333", "cy@queue.test");
  await open(D, "Dee Desk", "4444", "dee@queue.test");

  const ann = (lib.mem.accounts || []).find((a) => a && a.email === "ann@queue.test");
  if (!ann) throw new Error("Ann account missing");
  const W = (slug) => lib.mem.workspaces.find((w) => w && w.slug === slug);
  W(B).people.push({ id: "p_ann_at_b", name: "Ann", role: "employee", kind: "helper", status: "approved", accountId: ann.id, email: "ann@queue.test", pin: lib.hashPin("9191"), createdAt: "2026-01-02T00:00:00.000Z" });
  W(D).people.push({ id: "p_ann_at_d", name: "Ann", role: "owner", kind: "owner", status: "denied", accountId: ann.id, email: "ann@queue.test", pin: lib.hashPin("8181"), createdAt: "2026-01-03T00:00:00.000Z" });
  if (ann.desks.indexOf(C) < 0) ann.desks.push(C);
  function putJob(slug, id, title, extra) {
    lib.mem.jobs.unshift(Object.assign({ id, workspace: slug, title, status: "waiting", kind: "task", createdAt: "2026-01-01T00:00:00.000Z" }, extra || {}));
  }
  putJob(A, "job_ql_a", TITLE_A, { priority: true });
  putJob(B, "job_ql_b", TITLE_B);
  putJob(C, "job_ql_c", SECRET_C);
  putJob(D, "job_ql_d", SECRET_D);

  const email = await call(auth, "POST", {}, { action: "login", email: "ann@queue.test", password: "ann-pass-queue-1234", workspace: A }, {}, "/api/auth");
  ok(email.statusCode === 200 && email.body && email.body.emailLogin === true && email.body.savedLogin === true && email.body.ok === true, "[email] login still ok (" + email.statusCode + ")");
  const body = email.body || {};
  ok(body.hint === "Signed in with email and password.", "[email] hint unchanged");
  ok(body.workspace && body.workspace.slug === A && body.session && body.session.workspace === A && body.session.accountId === ann.id, "[email] workspace and session account unchanged (" + (body.session && body.session.workspace) + ")");
  ok(body.account && body.account.id === ann.id && body.account.hasPassword === true && body.you && body.you.id && body.plan, "[email] account, you, and plan still present");
  ok(body.queue && body.queue.accountId === ann.id && body.queue.name === ann.name && Array.isArray(body.queue.desks), "[email] queue is the account (" + (body.queue && body.queue.name) + ")");
  ok(Array.isArray(body.desks) && JSON.stringify(body.desks) === JSON.stringify(body.queue.desks), "[email] top-level desks matches queue.desks");
  const mine = await call(desks, "POST", { "x-workspace": A, "x-session": body.session.token }, { action: "mine" }, {}, "/api/desks");
  ok(mine.statusCode === 200 && JSON.stringify(mine.body.desks) === JSON.stringify(body.desks), "[email] desks match action mine (" + mine.statusCode + ")");
  const slugs = (body.desks || []).map((d) => d && d.slug);
  ok(slugs.indexOf(A) >= 0 && slugs.indexOf(B) >= 0 && slugs.indexOf(D) >= 0 && slugs.indexOf(C) < 0, "[email] queue lists open seats and the closed seat mine lists, not a desk with no seat (" + slugs.join(",") + ")");
  const cardA = (body.desks || []).find((d) => d && d.slug === A);
  const cardB = (body.desks || []).find((d) => d && d.slug === B);
  ok(cardA && SHAPE.every((k) => Object.prototype.hasOwnProperty.call(cardA, k)) && cardA.yours === "own", "[email] desk card uses the mine public shape");
  ok(cardB && cardB.yours === "member" && cardB.role === "helper", "[email] helper desk is a member card (" + (cardB && cardB.role) + ")");
  const rawEmail = lib.findSession(body.session.token, { slide: false });
  ok(rawEmail && rawEmail.proof === "password" && rawEmail.accountId === ann.id, "[email] session proof is password");

  const pin = await call(auth, "POST", {}, { action: "login", workspace: A, pin: "1111" }, {}, "/api/auth");
  const pinBody = JSON.stringify(pin.body || {});
  ok(pin.statusCode === 200 && pin.body && pin.body.savedLogin === true && !pin.body.emailLogin, "[pin] desk-code login still opens this desk (" + pin.statusCode + ")");
  ok(!pin.body.queue && !pin.body.desks, "[pin] desk-code login adds no queue and no desks list");
  ok(pinBody.indexOf(B) < 0 && pinBody.indexOf(C) < 0 && pinBody.indexOf(D) < 0 && pinBody.indexOf(SECRET_C) < 0, "[pin] desk-code login gains no other desk");
  const pinTok = pin.body.session.token;
  const rawPin = lib.findSession(pinTok, { slide: false });
  ok(rawPin && rawPin.accountId === ann.id && rawPin.proof !== "password", "[pin] owner desk-code session still carries the account and is not a password proof");

  await lib.save();
  const bytes0 = fs.readFileSync(STORE);
  const snap = () => JSON.stringify({
    jobs: lib.mem.jobs, workspaces: lib.mem.workspaces, accounts: lib.mem.accounts,
    money: lib.mem.money, audit: lib.mem.audit, inbox: lib.mem.inbox, files: lib.mem.files
  });
  const mem0 = snap();
  const money0 = JSON.stringify(lib.mem.money || []);
  let writes = 0;
  const save = lib.save;
  lib.save = async function () { writes += 1; return save.apply(this, arguments); };

  const hdr = { "x-session": body.session.token };
  const all = await call(jobs, "GET", hdr, null, { desks: "all" }, "/api/jobs?desks=all");
  const viaQueue = await call(jobs, "GET", hdr, null, { queue: "1" }, "/api/jobs?queue=1");
  const onlyA = await call(jobs, "GET", hdr, null, { desks: A }, "/api/jobs?desks=" + A);
  const onlyB = await call(jobs, "GET", hdr, null, { desks: B }, "/api/jobs?desks=" + B);
  const both = await call(jobs, "GET", hdr, null, { desks: A + "," + B }, "/api/jobs?desks=" + A + "," + B);
  const askC = await call(jobs, "GET", hdr, null, { desks: C }, "/api/jobs?desks=" + C);
  const askD = await call(jobs, "GET", hdr, null, { desks: D }, "/api/jobs?desks=" + D);
  const askAC = await call(jobs, "GET", hdr, null, { desks: A + "," + C }, "/api/jobs?desks=" + A + "," + C);
  const askMissing = await call(jobs, "GET", hdr, null, { desks: "no-such-desk" }, "/api/jobs?desks=no-such-desk");
  const pinAll = await call(jobs, "GET", { "x-workspace": A, "x-session": pinTok, "x-pin": "1111" }, null, { desks: "all" }, "/api/jobs?desks=all");
  const pinQueue = await call(jobs, "GET", { "x-workspace": B, "x-session": pinTok }, null, { queue: "1" }, "/api/jobs?queue=1");
  const strangerA = await call(jobs, "GET", { "x-workspace": A }, null, { desks: "all" }, "/api/jobs?desks=all");
  const strangerC = await call(jobs, "GET", { "x-workspace": C, "x-pin": "3333" }, null, { desks: "all" }, "/api/jobs?desks=all");
  const strangerNone = await call(jobs, "GET", {}, null, { queue: "1" }, "/api/jobs?queue=1");
  const strangerFake = await call(jobs, "GET", { "x-workspace": "no-such-desk" }, null, { desks: "no-such-desk" }, "/api/jobs?desks=no-such-desk");

  lib.save = save;
  ok(writes === 0, "[read] GET made zero save() calls (" + writes + ")");
  ok(Buffer.compare(bytes0, fs.readFileSync(STORE)) === 0, "[read] store file unchanged");
  ok(snap() === mem0, "[read] jobs, desks, accounts, money, and audit unchanged");
  ok(JSON.stringify(lib.mem.money || []) === money0, "[read] Collect money rows unchanged");

  ok(all.statusCode === 200 && all.body && all.body.ok === true, "[all] password session reads the queue (" + all.statusCode + ")");
  ok(JSON.stringify(all.body) === JSON.stringify(viaQueue.body) && all.statusCode === viaQueue.statusCode, "[all] ?queue=1 matches ?desks=all");
  const titles = (all.body.jobs || []).map((j) => j && j.title);
  ok(titles.indexOf(TITLE_A) >= 0 && titles.indexOf(TITLE_B) >= 0, "[all] both open desks are in the queue (" + titles.join(" | ") + ")");
  ok(titles.indexOf(SECRET_C) < 0 && titles.indexOf(SECRET_D) < 0 && JSON.stringify(all.body).indexOf(SECRET_C) < 0 && JSON.stringify(all.body).indexOf(SECRET_D) < 0, "[all] a desk with no open seat is not in the queue");
  const gotA = (all.body.jobs || []).find((j) => j && j.id === "job_ql_a");
  const gotB = (all.body.jobs || []).find((j) => j && j.id === "job_ql_b");
  ok(gotA && gotA.slug === A && gotA.desk === A && gotA.workspace === A, "[all] owner card is tagged with its desk");
  ok(gotB && gotB.slug === B && gotB.desk === B && gotB.workspace === B, "[all] helper card is tagged with its desk");
  ok(needIds(gotA).indexOf("stop") >= 0 && needIds(gotA).indexOf("kill") >= 0, "[all] owner seat keeps Stop / Kill (" + needIds(gotA).join(",") + ")");
  ok(needIds(gotB).indexOf("stop") < 0 && needIds(gotB).indexOf("kill") < 0, "[all] helper seat hides Stop / Kill (" + needIds(gotB).join(",") + ")");
  const qSlugs = (all.body.desks || []).map((d) => d.slug).sort();
  ok(qSlugs.join(",") === [A, B].sort().join(","), "[all] queue desks are only the open seats (" + qSlugs.join(",") + ")");
  ok(all.body.queue && all.body.queue.accountId === ann.id && all.body.queue.name === ann.name && JSON.stringify(all.body.queue.desks) === JSON.stringify(all.body.desks), "[all] queue names the account and the open desks");
  ok((all.body.cap || []).some((j) => j && j.id === "job_ql_a" && j.slug === A) && !(all.body.cap || []).some((j) => j && j.id === "job_ql_b"), "[all] cap uses the same per-desk card");

  const one = await call(jobs, "GET", Object.assign({ "x-workspace": A }, hdr), null, {}, "/api/jobs");
  const two = await call(jobs, "GET", Object.assign({ "x-workspace": B }, hdr), null, {}, "/api/jobs");
  const singleA = ((one.body && one.body.jobs) || []).find((j) => j.id === "job_ql_a");
  const singleB = ((two.body && two.body.jobs) || []).find((j) => j.id === "job_ql_b");
  ok(one.statusCode === 200 && !Object.prototype.hasOwnProperty.call(one.body, "queue") && JSON.stringify(one.body).indexOf(TITLE_B) < 0, "[one] a normal GET is still this desk only");
  ok(singleA && JSON.stringify(untag(gotA)) === JSON.stringify(singleA), "[all] owner card matches that desk's own GET");
  ok(two.statusCode === 200 && singleB && JSON.stringify(untag(gotB)) === JSON.stringify(singleB), "[all] helper card matches that desk's own GET (" + two.statusCode + ")");
  ok(onlyA.statusCode === 200 && (onlyA.body.jobs || []).every((j) => j.workspace === A) && JSON.stringify(onlyA.body).indexOf(TITLE_B) < 0, "[list] ?desks=" + A + " is only that open desk");
  ok(onlyB.statusCode === 200 && (onlyB.body.jobs || []).some((j) => j.id === "job_ql_b") && needIds((onlyB.body.jobs || []).find((j) => j.id === "job_ql_b")).indexOf("stop") < 0, "[list] ?desks=" + B + " keeps the helper trim");
  ok(both.statusCode === 200 && (both.body.jobs || []).some((j) => j.id === "job_ql_a") && (both.body.jobs || []).some((j) => j.id === "job_ql_b"), "[list] two open desks");

  const refused = [pinAll, pinQueue, strangerA, strangerC, strangerNone, strangerFake, askC, askD, askAC, askMissing];
  ok(refused.every((r) => sig(r) === sig(pinAll)), "[refuse] pin, stranger, a missing desk, and a desk with no open seat share one reply (" + sig(pinAll) + ")");
  ok(pinAll.statusCode === 403 && pinAll.body && pinAll.body.ok === false && pinAll.body.error === "No desk with that name." && Object.keys(pinAll.body).length === 2, "[refuse] plain 403, no extra fields");
  ok(refused.every((r) => JSON.stringify(r.body).indexOf(SECRET_C) < 0 && JSON.stringify(r.body).indexOf(SECRET_D) < 0 && JSON.stringify(r.body).indexOf(TITLE_A) < 0), "[refuse] no cards in the refusal");

  const pinOne = await call(jobs, "GET", { "x-workspace": A, "x-session": pinTok }, null, {}, "/api/jobs");
  ok(pinOne.statusCode === 200 && (pinOne.body.jobs || []).some((j) => j.id === "job_ql_a") && JSON.stringify(pinOne.body).indexOf(TITLE_B) < 0 && JSON.stringify(pinOne.body).indexOf(SECRET_C) < 0, "[pin] without the opt-in, desk-code still reads only its own desk");

  const jobsSrc = fs.readFileSync(path.join(root, "api/jobs.js"), "utf8");
  ok(jobsSrc.indexOf("Collect is on HOLD: Ship never writes a money row.") >= 0, "[collect] Ship still says Collect is on HOLD");
  lib.mem.connections = lib.mem.connections || [];
  lib.mem.connections.push({ id: "c_ql", workspace: A, provider: "webhook", hook: "https://hook.example.test/queue-login", label: "Hook", status: "on", live: false });
  const realFetch = global.fetch;
  global.fetch = async function () { return { status: 200, ok: true, json: async () => ({}), text: async () => "" }; };
  const beforeMoney = JSON.stringify(lib.mem.money || []);
  const ship = await call(jobs, "POST", Object.assign({ "x-workspace": A }, hdr), { action: "ship", id: "job_ql_a", confirm: true, provider: "webhook", amount: 42 }, {}, "/api/jobs");
  global.fetch = realFetch;
  const shipped = lib.mem.jobs.find((j) => j && j.id === "job_ql_a");
  ok(ship.statusCode === 200 && shipped && !shipped.charged && !shipped.paid && !shipped.paidAt, "[collect] ship still does not mark the card paid (" + ship.statusCode + " " + (shipped && shipped.status) + ")");
  ok(JSON.stringify(lib.mem.money || []) === beforeMoney, "[collect] ship wrote no money row");

  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  ok(pkg.indexOf("node scripts/check-queue-login.js") >= 0, "package.json test runs this check");
  try { fs.rmSync(STORE, { force: true }); } catch (e) {}
}

const MUTANTS = [
  ["Q1 email login omits queue", "api/auth.js",
    "queue: { accountId: queue.accountId, name: queue.name, desks: queue.desks },\n", ""],
  ["Q2 email login desks are only the signed-in desk", "api/auth.js",
    "queue: { accountId: queue.accountId, name: queue.name, desks: queue.desks },\n          desks: queue.desks",
    "queue: { accountId: queue.accountId, name: queue.name, desks: queue.desks.filter((d) => d && via.desk && d.slug === via.desk.slug) },\n          desks: queue.desks.filter((d) => d && via.desk && d.slug === via.desk.slug)"],
  ["Q3 desk-code login lists every desk on the account", "api/auth.js",
    'hint: "Desk name + code opened this phone."',
    'hint: "Desk name + code opened this phone.", desks: require("./_account").queueForPerson(person, require("./_account").accountForDesk(row), row.slug).desks'],
  ["Q4 a password proof is not required", "api/_lib.js",
    'if (!raw || sessionProof(raw.proof) !== "password") return null;\n', ""],
  ["Q5 a desk with no open seat is included", "api/jobs.js",
    "if (!asked || !queueSeatOk(found, session)) {\n      if (want.mode === \"list\") return refuseQueue(res);\n      continue;\n    }",
    "if (false) {\n      if (want.mode === \"list\") return refuseQueue(res);\n      continue;\n    }"],
  ["Q6 the queue read saves", "api/jobs.js",
    "if (!session) return refuseQueue(res);\n",
    "if (!session) return refuseQueue(res); await save();\n"],
  ["Q7 every card is trimmed as the owner", "api/jobs.js",
    "jobs.push(tagQueueJob(presentJob(j, found.person), slug));",
    "jobs.push(tagQueueJob(presentJob(j, null), slug));"],
  ["Q8 Collect HOLD line removed", "api/jobs.js",
    "Collect is on HOLD: Ship never writes a money row.",
    "Ship writes the money row."],
  ["Q9 package.json stops running this check", "package.json",
    "node scripts/check-queue-login.js",
    "node scripts/check-icons.js"]
];

function runMutants() {
  const { spawnSync } = require("child_process");
  const skip = new Set([".git", "node_modules"]);
  const copy = (src, dst) => {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const s = path.join(src, e.name);
      const d = path.join(dst, e.name);
      if (e.isDirectory()) copy(s, d);
      else if (e.isFile()) fs.copyFileSync(s, d);
    }
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aia-ql-mut-"));
  copy(root, dir);
  if (fs.existsSync(path.join(root, "node_modules"))) fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
  const run = () => {
    const h = fs.mkdtempSync(path.join(os.tmpdir(), "aia-ql-home-"));
    return spawnSync(process.execPath, [path.join(dir, "scripts/check-queue-login.js")], {
      cwd: dir,
      env: { PATH: process.env.PATH || "", HOME: h, TMPDIR: h },
      encoding: "utf8",
      timeout: 120000
    });
  };
  const base = run();
  if (base.status !== 0) {
    console.error("unmutated check fails in the copy:\n" + (base.stdout + base.stderr).slice(-2500));
    process.exit(1);
  }
  let caught = 0;
  let total = 0;
  let bad = 0;
  for (const [name, file, find, repl] of MUTANTS) {
    const p = path.join(dir, file);
    const orig = fs.readFileSync(p, "utf8");
    if (orig.indexOf(find) < 0) { console.log(name + " | ANCHOR GONE"); bad += 1; continue; }
    if (orig.indexOf(find) !== orig.lastIndexOf(find)) { console.log(name + " | ANCHOR NOT UNIQUE"); bad += 1; continue; }
    fs.writeFileSync(p, orig.replace(find, repl));
    const r = run();
    fs.writeFileSync(p, orig);
    const first = ((r.stdout || "") + "\n" + (r.stderr || "")).split("\n").find((l) => l.indexOf("FAIL") === 0) || "";
    total += 1;
    if (r.status) { caught += 1; console.log(name + " | CAUGHT | " + first.slice(0, 180)); }
    else console.log(name + " | SURVIVED");
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("SCORE " + caught + "/" + total + " caught" + (bad ? " (" + bad + " anchors bad)" : ""));
  process.exit(caught === total && !bad ? 0 : 1);
}

if (MUTATE) runMutants();
else main().then(finish).catch((e) => { console.error("FAIL crash " + (e && e.stack || e)); process.exit(1); });
