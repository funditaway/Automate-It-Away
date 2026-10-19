#!/usr/bin/env node
// Proves the read-only link check (linkCheck) on the dry run of POST /api/migrate-uploads:
// tmp-file records are statted (exists, missing, size mismatch), Blob records get one HEAD
// (ok, 404, wrong size, error, timeout), only counts and fixed labels come back (no url, id,
// file name, path, or desk name), a dry run copies, deletes, and saves nothing, a refused call
// stays refused and checks nothing, apply carries no linkCheck, and shapes is unchanged.
// No network. The Blob store is a mock inside the child process.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const PIN = "4821";
const OTHER_PIN = "7373";
const TOKEN = "vercel_blob_rw_FAKESTORE_fakefakefake";
const CONFIRM = "move-old-uploads";
const SLUG = "springfield-shop";

function fail(msg) {
  console.error("FAIL " + scrub(msg));
  process.exit(1);
}
function pass(msg) { console.log("ok  " + scrub(msg)); }
function scrub(msg) {
  return String(msg || "").split(PIN).join("[pin]").split(OTHER_PIN).join("[pin]").replace(/vercel_blob_rw_[A-Za-z0-9_]+/g, "[token]");
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

function assertSources() {
  const mig = read("api/migrate-uploads.js");
  const start = mig.indexOf("const LINK_TIMEOUT_MS");
  const end = mig.indexOf("async function publicGet");
  if (start < 0 || end < start) fail("link check helpers missing from migrate-uploads.js");
  const code = mig.slice(start, end);
  ["blobCopy", "blobDel", "blobPutAt", "save(", "applyStore", "uploadMap(", "writeFile", "unlink", "rmSync", "readFile", "mem.files.push", "mem.migrations ="].forEach((word) => {
    if (code.indexOf(word) >= 0) fail("link check helpers must stay read-only (found " + word + ")");
  });
  if (!/if \(!apply\) \{[\s\S]*?safeLinkCheck\(mem\.files\)[\s\S]*?\n  \}\n  if \(plan\.mismatch/.test(mig)) fail("linkCheck must run only inside the dry run branch");
  if ((mig.match(/safeLinkCheck\(/g) || []).length !== 2) fail("linkCheck must be called from exactly one place");
  if (!/shapes: plan\.shapes/.test(mig)) fail("shapes must still ride on the plan");
  const pkg = read("package.json");
  const shapesAt = pkg.indexOf("node scripts/check-migrate-uploads-shapes.js && node scripts/check-migrate-uploads-linkcheck.js");
  if (shapesAt < 0) fail("package.json must run check-migrate-uploads-linkcheck right after check-migrate-uploads-shapes");
  pass("link check helpers are read-only, dry-run only, and wired into package.json");
}

function spawnChild(scenario) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aia-link-"));
  const env = {
    PATH: process.env.PATH,
    HOME: tmp,
    AIA_STORE_PATH: path.join(tmp, "store.json"),
    AIA_UPLOAD_DIR: path.join(tmp, "up"),
    AIA_TEST_TMP: tmp,
    VERCEL_ENV: "production",
    BLOB_READ_WRITE_TOKEN: TOKEN,
    BLOB_STORE_ID: "store_FAKESTORE"
  };
  const r = spawnSync(process.execPath, [__filename, "--child", scenario], { env: env, cwd: tmp, encoding: "utf8", timeout: 60000 });
  fs.rmSync(tmp, { recursive: true, force: true });
  const blob = String(r.stdout || "") + "\n" + String(r.stderr || "");
  if (blob.indexOf(PIN) >= 0 || blob.indexOf(OTHER_PIN) >= 0 || blob.indexOf(TOKEN) >= 0) return { leak: true, checks: [] };
  const line = String(r.stdout || "").split("\n").find((l) => l.indexOf("RESULT ") === 0);
  if (!line) return { error: "no result (exit " + r.status + "): " + scrub(String(r.stderr || "").slice(-500)), checks: [] };
  try { return JSON.parse(line.slice(7)); } catch (e) { return { error: "bad result json", checks: [] }; }
}

function judge(out, label) {
  if (out.leak) fail(label + " leaked a pin or token into output");
  if (out.error) fail(label + " " + out.error);
  const bad = (out.checks || []).filter((c) => !c.ok);
  if (bad.length) fail(label + " " + bad.map((c) => c.name + (c.detail ? " (" + c.detail + ")" : "")).join("; "));
  pass(label + " (" + out.checks.length + " checks)");
}

function installMock(Module) {
  const fake = { files: Object.create(null), hang: Object.create(null), boom: Object.create(null), heads: [], copies: [], dels: [], puts: [], gets: 0 };
  function pathFrom(u) {
    const s = String(u || "");
    if (!/^https?:/i.test(s)) return s.replace(/^\/+/, "");
    return decodeURIComponent(new URL(s).pathname.replace(/^\/+/, ""));
  }
  function publicUrl(pathname) { return "https://store_FAKESTORE.public.blob.vercel-storage.com/" + pathname; }
  const orig = Module._load;
  Module._load = function (request) {
    if (request === "@vercel/blob") {
      return {
        async get() { throw new Error("Vercel Blob: The requested blob does not exist"); },
        async head(key) {
          const pathname = pathFrom(key);
          fake.heads.push(pathname);
          if (fake.hang[pathname]) return new Promise(() => {});
          if (fake.boom[pathname]) throw new Error("Vercel Blob: store exploded");
          const raw = fake.files[pathname];
          if (!raw) throw new Error("Vercel Blob: The requested blob does not exist");
          return { pathname: pathname, url: publicUrl(pathname), size: raw.length, contentType: "image/png" };
        },
        async put(key) { fake.puts.push(String(key)); throw new Error("put must not run"); },
        async del(key) { fake.dels.push(pathFrom(key)); throw new Error("del must not run"); },
        async list() { return { blobs: [], hasMore: false }; },
        async copy(from, to) { fake.copies.push(String(to)); throw new Error("copy must not run"); }
      };
    }
    return orig.apply(this, arguments);
  };
  global.fetch = async function (url, opts) {
    const method = String((opts && opts.method) || "GET").toUpperCase();
    if (method === "PUT" || method === "POST" || method === "DELETE") fake.puts.push("rest-write");
    else fake.gets += 1;
    const empty = { ok: false, status: 500, headers: { get: () => null }, text: async () => "{\"error\":{\"message\":\"down\"}}", arrayBuffer: async () => Buffer.alloc(0) };
    if (String(url).indexOf("vercel.com/api/blob?") >= 0) return { ok: true, status: 200, headers: { get: () => "application/json" }, text: async () => JSON.stringify({ blobs: [], hasMore: false }) };
    return empty;
  };
  return { fake: fake, publicUrl: publicUrl };
}

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
async function call(handler, method, headers, body) {
  const res = mockRes();
  await handler({ method: method, headers: headers || {}, body: body || {}, query: {} }, res);
  return res;
}
// ready() also HEADs the store file itself, so count only heads of file records. The Blob
// helper retries a failed HEAD with other auth, so count each file once.
function fileHeads(fake) {
  const seen = {};
  fake.heads.forEach((h) => { if (h.indexOf(SLUG + "/file_") === 0) seen[h] = true; });
  return Object.keys(seen);
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// Only numbers anywhere, except the fixed note.
function onlyCounts(node, trail) {
  if (typeof node === "number") return true;
  if (typeof node === "string") return trail === "note";
  if (!node || typeof node !== "object") return false;
  return Object.keys(node).every((k) => onlyCounts(node[k], k));
}

async function setup() {
  const Module = require("module");
  const mock = installMock(Module);
  const lib = require(path.join(root, "api", "_lib.js"));
  const auth = require(path.join(root, "api", "auth.js"));
  const mig = require(path.join(root, "api", "migrate-uploads.js"));
  await lib.ready();
  const checks = [];
  function check(name, ok, detail) { checks.push({ name: name, ok: !!ok, detail: ok ? "" : scrub(detail) }); }
  const opened = await call(auth, "POST", { "x-workspace": SLUG }, { action: "open", slug: SLUG, biz: "Springfield Shop", name: "James", pin: PIN });
  check("desk opens", opened.statusCode === 201, String(opened.statusCode));
  const invited = await call(auth, "POST", { "x-workspace": SLUG, "x-pin": PIN }, { action: "invite", name: "Pat", pin: OTHER_PIN, kind: "helper" });
  check("helper seat added", invited.statusCode === 200 || invited.statusCode === 201, String(invited.statusCode));
  return { mock: mock, fake: mock.fake, lib: lib, mig: mig, checks: checks, check: check, owner: { "x-workspace": SLUG, "x-pin": PIN } };
}

const LEAKS = [
  SLUG, "other-desk-name", "store_FAKESTORE", "blob.vercel-storage", "elsewhere", "cdn.", "secret-name", "file_idsecret", "idsecret",
  "q1-report", "tmpfile-", "up/", "/tmp", "aia-link", "https:", "http:", "/api/upload", "ENOENT", "exploded", "does not exist",
  PIN, OTHER_PIN, TOKEN, "vercel_blob_rw"
];

function writeTmp(dir, name, size) {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name);
  fs.writeFileSync(p, Buffer.alloc(size, 7));
  return p;
}

async function childFixtures() {
  const t = await setup();
  const { fake, lib, mig, mock } = t;
  const dir = path.join(process.env.AIA_TEST_TMP, "up");
  const V = (p) => mock.publicUrl(p);
  const okPath = writeTmp(dir, "tmpfile-ok", 10);
  const smallPath = writeTmp(dir, "tmpfile-small", 3);
  const missPath = path.join(dir, "tmpfile-gone");
  const asDir = path.join(dir, "tmpfile-dir");
  fs.mkdirSync(asDir, { recursive: true });
  fake.files[SLUG + "/file_ok1.png"] = Buffer.alloc(20);
  fake.files[SLUG + "/file_ok2.png"] = Buffer.alloc(5);
  fake.files[SLUG + "/file_size.png"] = Buffer.alloc(8);
  fake.files[SLUG + "/file_boom.png"] = Buffer.alloc(8);
  fake.boom[SLUG + "/file_boom.png"] = true;
  const files = [
    { id: "file_idsecret1", workspace: SLUG, name: "q1-report.png", bytes: 10, driver: "tmp-file", url: "/api/upload?id=file_idsecret1", path: okPath },
    { id: "file_idsecret2", workspace: SLUG, name: "two.png", bytes: 10, driver: "tmp-file", url: "/api/upload?id=file_idsecret2", path: smallPath },
    { id: "file_idsecret3", workspace: SLUG, name: "three.png", bytes: 10, driver: "tmp-file", url: "/api/upload?id=file_idsecret3", path: missPath },
    { id: "file_idsecret4", workspace: SLUG, name: "four.png", bytes: 10, driver: "tmp-file", url: "/api/upload?id=file_idsecret4" },
    { id: "file_idsecret5", workspace: SLUG, name: "five.png", bytes: 10, driver: "tmp-file", url: "/api/upload?id=file_idsecret5", path: asDir },
    { id: "file_idsecret6", workspace: SLUG, name: "six.png", bytes: 20, driver: "blob", url: V(SLUG + "/file_ok1.png"), remoteUrl: V(SLUG + "/file_ok1.png") },
    { id: "file_idsecret7", workspace: SLUG, name: "seven.png", driver: "blob", url: V(SLUG + "/file_ok2.png") },
    { id: "file_idsecret8", workspace: SLUG, name: "eight.png", bytes: 9, driver: "blob", url: V(SLUG + "/file_404.png") },
    { id: "file_idsecret9", workspace: SLUG, name: "nine.png", bytes: 99, driver: "blob", url: V(SLUG + "/file_size.png") },
    { id: "file_idsecret10", workspace: SLUG, name: "ten.png", bytes: 8, driver: "blob", url: V(SLUG + "/file_boom.png") },
    { id: "file_idsecret11", workspace: "other-desk-name", name: "eleven.jpg", url: "https://cdn.elsewhere-example.org/secret-name.jpg", driver: "local" },
    { id: "file_idsecret12" },
    "not-a-record-string"
  ];
  lib.mem.files.length = 0;
  files.forEach((f) => lib.mem.files.push(f));
  lib.mem.migrations = { uploads: {} };
  await lib.save();

  function snap() {
    return JSON.stringify({ files: lib.mem.files, jobs: lib.mem.jobs, migrations: lib.mem.migrations, money: lib.mem.money || [] });
  }
  function disk() {
    return JSON.stringify(fs.readdirSync(dir).sort().map((n) => [n, fs.existsSync(path.join(dir, n)) && fs.statSync(path.join(dir, n)).isFile() ? fs.statSync(path.join(dir, n)).size : -1]));
  }
  const before = snap();
  const diskBefore = disk();
  const putsBefore = fake.puts.length;

  // refused calls come first: nothing is checked
  const noPin = await call(mig, "POST", { "x-workspace": SLUG }, { confirm: CONFIRM });
  const badPin = await call(mig, "POST", { "x-workspace": SLUG, "x-pin": "0000" }, { confirm: CONFIRM });
  const helper = await call(mig, "POST", { "x-workspace": SLUG, "x-pin": OTHER_PIN }, { confirm: CONFIRM });
  const noConfirm = await call(mig, "POST", t.owner, {});
  const wrongDesk = await call(mig, "POST", { "x-workspace": "no-such-desk", "x-pin": PIN }, { confirm: CONFIRM });
  t.check("no desk code is still 401", noPin.statusCode === 401, String(noPin.statusCode));
  t.check("wrong desk code is still 401", badPin.statusCode === 401, String(badPin.statusCode));
  t.check("a helper seat is still 403", helper.statusCode === 403, String(helper.statusCode));
  t.check("missing confirm is still 403", noConfirm.statusCode === 403, String(noConfirm.statusCode));
  t.check("unknown desk is still 404", wrongDesk.statusCode === 404, String(wrongDesk.statusCode));
  t.check("refused calls carry no linkCheck and check nothing", [noPin, badPin, helper, noConfirm, wrongDesk].every((r) => r.body && r.body.linkCheck === undefined) && fileHeads(fake).length === 0, String(fileHeads(fake).length));

  const dry = await call(mig, "POST", t.owner, { confirm: CONFIRM });
  const body = dry.body || {};
  const lc = body.linkCheck || {};
  t.check("dry run answers 200 with linkCheck", dry.statusCode === 200 && body.dryRun === true && body.apply === false && !!body.linkCheck, String(dry.statusCode));
  t.check("total counts every record", lc.total === 13, String(lc.total));
  t.check("answers: tmp exists, blob ok, blob ok without recorded size", lc.answers === 3, String(lc.answers));
  t.check("missingFile: tmp missing and blob 404", lc.missingFile === 2, String(lc.missingFile));
  t.check("sizeMismatch: tmp and blob", lc.sizeMismatch === 2, String(lc.sizeMismatch));
  t.check("errored: no path, path is a folder, blob error", lc.errored === 3, String(lc.errored));
  t.check("unchecked: foreign host, no link, non-record", lc.unchecked === 3, String(lc.unchecked));
  t.check("counts add up to total", lc.answers + lc.missingFile + lc.sizeMismatch + lc.errored + lc.unchecked === lc.total, "sum");
  t.check("byDriver tmpFile", same(lc.byDriver && lc.byDriver.tmpFile, { total: 5, answers: 1, missingFile: 1, sizeMismatch: 1, errored: 2, unchecked: 0 }), JSON.stringify(lc.byDriver && lc.byDriver.tmpFile));
  t.check("byDriver blob", same(lc.byDriver && lc.byDriver.blob, { total: 5, answers: 2, missingFile: 1, sizeMismatch: 1, errored: 1, unchecked: 0 }), JSON.stringify(lc.byDriver && lc.byDriver.blob));
  t.check("byDriver other", same(lc.byDriver && lc.byDriver.other, { total: 3, answers: 0, missingFile: 0, sizeMismatch: 0, errored: 0, unchecked: 3 }), JSON.stringify(lc.byDriver && lc.byDriver.other));
  t.check("note says tmp files live on one instance", typeof lc.note === "string" && /one server instance/.test(lc.note) && /different instance/.test(lc.note), String(lc.note));
  t.check("only blob links on the store host get a HEAD, each file once", fileHeads(fake).length === 5, JSON.stringify(fileHeads(fake).length));
  const text = JSON.stringify(lc);
  const hit = LEAKS.filter((s) => text.indexOf(s) >= 0);
  t.check("no-leak: no url, id, file name, path, host, desk name, error text, pin, or token in linkCheck", hit.length === 0, "found " + hit.length + " fixture strings");
  t.check("no-leak: linkCheck holds only numbers and the fixed note", onlyCounts(lc, ""), "non-number leaf");
  const whole = JSON.stringify(body.linkCheck) + JSON.stringify(Object.keys(body));
  t.check("no-leak: nothing in linkCheck echoes a record id or path", !lib.mem.files.some((r) => r && typeof r === "object" && ((r.id && whole.indexOf(r.id) >= 0) || (r.path && whole.indexOf(r.path) >= 0))), "echo");
  t.check("dry run saves, copies, relinks, and deletes nothing", snap() === before && disk() === diskBefore && fake.copies.length === 0 && fake.dels.length === 0 && fake.puts.length === putsBefore, JSON.stringify([fake.copies.length, fake.dels.length, fake.puts.length - putsBefore]));
  t.check("plan semantics unchanged: count, mismatch, items, steps", body.count === 0 && body.mismatch === true && body.items.length === 0 && body.expect === 9 && body.steps.length === 2 && body.steps[0].step === "preflight" && body.steps[1].step === "inventory" && body.note === "Dry run. Nothing was copied, relinked, or deleted.", JSON.stringify([body.count, body.mismatch, body.steps.length]));
  const sh = body.shapes || {};
  t.check("shapes field unchanged", sh.listedVia === "sdk" && sh.filesTotal === 13 && sh.blobsTotal === 0 && sh.files.url.absolute === 6 && sh.files.url.relative === 5 && sh.files.url.none === 1 && sh.files.notText === 1 && sh.files.driver.tmpFile === 5 && sh.files.driver.blob === 5 && sh.files.relativeApiRoute === 5, JSON.stringify([sh.listedVia, sh.filesTotal, sh.files && sh.files.url]));
  t.check("shapes still holds no linkCheck data", !("linkCheck" in sh) && !("answers" in sh), "mixed");

  const applied = await call(mig, "POST", t.owner, { confirm: CONFIRM, apply: true });
  t.check("apply with a mismatch still refuses with 409 and runs no link check", applied.statusCode === 409 && applied.body && applied.body.mismatch === true && applied.body.linkCheck === undefined && fileHeads(fake).length === 5, JSON.stringify([applied.statusCode, fileHeads(fake).length]));
  t.check("apply carries the same shapes", applied.body && same(applied.body.shapes, sh), "shapes differ");
  const del = await call(mig, "POST", t.owner, { confirm: CONFIRM, action: "delete" });
  t.check("delete without Yes still refuses and runs no link check", del.statusCode === 403 && del.body && del.body.linkCheck === undefined && fileHeads(fake).length === 5, String(del.statusCode));
  t.check("refused apply and delete save, copy, and delete nothing", snap() === before && disk() === diskBefore && fake.copies.length === 0 && fake.dels.length === 0 && fake.puts.length === putsBefore, "writes");
  return t.checks;
}

async function childEdges() {
  const t = await setup();
  const { fake, lib, mig, mock } = t;
  const V = (p) => mock.publicUrl(p);
  const putsBefore = fake.puts.length;
  // timeout: a HEAD that never answers is counted as errored, fast, with a short limit
  fake.files[SLUG + "/file_slow.png"] = Buffer.alloc(4);
  fake.hang[SLUG + "/file_slow.png"] = true;
  fake.files[SLUG + "/file_fast.png"] = Buffer.alloc(4);
  const recs = [
    { id: "file_idsecret1", bytes: 4, url: V(SLUG + "/file_slow.png") },
    { id: "file_idsecret2", bytes: 4, url: V(SLUG + "/file_fast.png") },
    { id: "file_idsecret3", bytes: 4, url: V(SLUG + "/file_gone.png") },
    { id: "file_idsecret4", bytes: 4, url: "//store_FAKESTORE.public.blob.vercel-storage.com/" + SLUG + "/file_fast.png" }
  ];
  const started = Date.now();
  const out = await mig.linkCheck(recs, { timeoutMs: 60 });
  const took = Date.now() - started;
  t.check("blob timeout counts as errored and returns fast", out.total === 4 && out.errored === 1 && out.answers === 2 && out.missingFile === 1 && took < 3000, JSON.stringify([out.total, out.errored, out.answers, out.missingFile, took]));
  t.check("blob counts sit under byDriver.blob", out.byDriver.blob.total === 4 && out.byDriver.tmpFile.total === 0 && out.byDriver.other.total === 0, JSON.stringify(out.byDriver));
  const text = JSON.stringify(out);
  t.check("timeout run leaks nothing", ["file_", SLUG, "store_FAKESTORE", "https:", "idsecret"].every((s) => text.indexOf(s) < 0) && onlyCounts(out, ""), "leak");
  const empty = await mig.linkCheck([], { timeoutMs: 60 });
  t.check("no records: all zero", empty.total === 0 && empty.answers === 0 && empty.errored === 0, JSON.stringify(empty));
  const junk = await mig.linkCheck(null, { timeoutMs: 60 });
  t.check("non-list input: all zero", junk.total === 0, JSON.stringify(junk));
  // the hard cap on HEADs keeps a huge store from fanning out
  const many = [];
  for (let i = 0; i < 230; i++) many.push({ id: "file_idsecret" + i, bytes: 4, url: V(SLUG + "/file_fast.png") });
  fake.heads.length = 0;
  const capped = await mig.linkCheck(many, { timeoutMs: 500 });
  t.check("HEAD fan-out is capped, the rest is unchecked", capped.total === 230 && capped.answers === 200 && capped.unchecked === 30 && fake.heads.filter((h) => h.indexOf(SLUG + "/file_") === 0).length === 200, JSON.stringify([capped.answers, capped.unchecked, fake.heads.length]));
  t.check("no writes anywhere", fake.copies.length === 0 && fake.dels.length === 0 && fake.puts.length === putsBefore, JSON.stringify(fake.puts.length - putsBefore));
  return t.checks;
}

if (process.argv[2] === "--child") {
  const run = { fixtures: childFixtures, edges: childEdges }[process.argv[3]];
  run().then((checks) => { console.log("RESULT " + JSON.stringify({ checks: checks })); process.exit(0); }).catch((e) => { console.error(scrub(e && e.stack || e)); process.exit(1); });
} else {
  assertSources();
  judge(spawnChild("fixtures"), "tmp-file and blob link checks count right, nothing leaks, nothing is written");
  judge(spawnChild("edges"), "timeout, empty input, and the HEAD cap");
  console.log("check-migrate-uploads-linkcheck: ok");
}
