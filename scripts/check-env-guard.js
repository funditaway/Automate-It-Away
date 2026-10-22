#!/usr/bin/env node
require("./_env-guard");
// Proves every check refuses to run with production settings (VERCEL_ENV=production or any BLOB_* variable):
// exit 1 with a clear message, before any api module loads, with no network attempt and no store file written.
// Values are never printed. A check's own child with fake Blob settings and its parent's pid still runs.
// Normal env -i runs are unaffected. Every scripts/check-*.js requires the guard first. Fake values only.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
let failed = 0;
let asserts = 0;
function ok(cond, msg) { asserts += 1; if (cond) console.log("ok  " + msg); else { console.error("FAIL " + msg); failed += 1; process.exitCode = 1; } }

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "aia-env-guard-"));
// Preload: logs any network attempt and any api module load to a file.
const preload = path.join(scratch, "watch.js");
fs.writeFileSync(preload, [
  'const fs = require("fs"); const Module = require("module"); const log = process.env.ENVG_LOG;',
  'const note = (w) => { try { fs.appendFileSync(log, w + "\\n"); } catch (e) {} };',
  'const net = require("net"); const oc = net.Socket.prototype.connect; net.Socket.prototype.connect = function () { note("net"); return oc.apply(this, arguments); };',
  'const dns = require("dns"); const ol = dns.lookup; dns.lookup = function () { note("dns"); return ol.apply(this, arguments); };',
  'if (typeof globalThis.fetch === "function") { const of = globalThis.fetch; globalThis.fetch = function () { note("fetch"); return of.apply(this, arguments); }; }',
  'const ld = Module._load; Module._load = function (req, parent) { if (/[\\\\/]api[\\\\/]/.test(String(req)) || (parent && /[\\\\/]api[\\\\/]/.test(String(parent.filename || "")))) note("api " + req); return ld.apply(this, arguments); };'
].join("\n"));
const dataFile = path.join(root, "api", "data", "aia.json");
const dataBefore = fs.existsSync(dataFile) ? fs.statSync(dataFile).mtimeMs : null;

let n = 0;
function run(args, extra) {
  n += 1;
  const tmp = path.join(scratch, "run" + n);
  fs.mkdirSync(tmp);
  const log = path.join(tmp, "watch.log");
  const store = path.join(tmp, "store.json");
  const env = Object.assign({ PATH: process.env.PATH, HOME: tmp, TMPDIR: tmp, AIA_STORE_PATH: store, AIA_UPLOAD_DIR: path.join(tmp, "up"), AIA_PIN_SALT: "fake-salt-for-tests", XAI_API_KEY: "xai-fake", ENVG_LOG: log, NODE_OPTIONS: "--require " + preload }, extra || {});
  const r = spawnSync(process.execPath, args, { env, cwd: root, encoding: "utf8", timeout: 120000 });
  const watched = fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "";
  const left = fs.readdirSync(tmp).filter((f) => f !== "watch.log");
  return { code: r.status, out: String(r.stdout || ""), err: String(r.stderr || ""), net: /^(net|dns|fetch)$/m.test(watched), api: /^api /m.test(watched), store: fs.existsSync(store), left };
}
const TOKEN = "fake-token-value-7q";
function refused(tag, script, extra, secrets) {
  const r = run([path.join("scripts", script)], extra);
  ok(r.code === 1 && /^REFUSED /m.test(r.err), tag + " " + script + ": exit 1 with a REFUSED message (got " + r.code + ")");
  ok(!r.api && !r.net && !r.store && r.left.length === 0 && !/^ok /m.test(r.out), tag + " " + script + ": no api module loaded, no network, no store file, no check ran");
  ok((secrets || []).every((v) => (r.out + r.err).indexOf(v) < 0), tag + " " + script + ": no value printed");
  return r;
}

// 1. Real checks, VERCEL_ENV=production and BLOB_READ_WRITE_TOKEN=fake.
const both = { VERCEL_ENV: "production", BLOB_READ_WRITE_TOKEN: TOKEN };
["check-personof-session-desk.js", "check-seat-owner-account.js", "check-blob-store.js", "check-health-no-save.js", "check-blob-write-fail.js"].forEach((s) => refused("[prod+blob]", s, both, [TOKEN]));
// 2. Either one alone, any BLOB_* name, and VERCEL_ENV in another case.
refused("[VERCEL_ENV only]", "check-personof-session-desk.js", { VERCEL_ENV: "production" });
refused("[BLOB token only]", "check-personof-session-desk.js", { BLOB_READ_WRITE_TOKEN: TOKEN }, [TOKEN]);
refused("[BLOB_STORE_ID only]", "check-seat-owner-account.js", { BLOB_STORE_ID: "store-fake-id-3k" }, ["store-fake-id-3k"]);
refused("[VERCEL_ENV Production]", "check-seat-owner-account.js", { VERCEL_ENV: " Production " });
// 3. A forged child marker (not its parent's pid) is refused too.
refused("[forged child marker]", "check-personof-session-desk.js", { VERCEL_ENV: "production", BLOB_READ_WRITE_TOKEN: TOKEN, AIA_CHECK_PARENT: "1" }, [TOKEN]);
// 4. A check's own child: parent's pid and fake Blob values pass the guard; a real-looking value does not.
const stub = ["-e", 'require("./scripts/_env-guard"); console.log("THROUGH")'];
const kid = run(stub, { VERCEL_ENV: "production", BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_FAKESTORE_fakefakefake", AIA_CHECK_PARENT: String(process.pid) });
ok(kid.code === 0 && /THROUGH/.test(kid.out), "[child] own child with fake Blob settings and the parent's pid passes the guard (got " + kid.code + ")");
const kidReal = run(stub, { VERCEL_ENV: "production", BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_STORE_realish_9z", AIA_CHECK_PARENT: String(process.pid) });
ok(kidReal.code === 1 && /^REFUSED /m.test(kidReal.err) && !/THROUGH/.test(kidReal.out) && kidReal.err.indexOf("realish") < 0, "[child] a non-fake Blob value is refused even with the parent's pid (got " + kidReal.code + ")");
// 5. Normal env -i style run: unaffected (the api loads, the check passes, no network).
const plain = run([path.join("scripts", "check-personof-session-desk.js")]);
ok(plain.code === 0 && !/^REFUSED/m.test(plain.err) && plain.api && !plain.net, "[normal] a plain run with fake keys is not refused and passes (got " + plain.code + ")");
const plain2 = run([path.join("scripts", "check-seat-owner-account.js")]);
ok(plain2.code === 0 && !/^REFUSED/m.test(plain2.err), "[normal] check-seat-owner-account runs as before (got " + plain2.code + ")");
ok((dataBefore === null ? !fs.existsSync(dataFile) : fs.statSync(dataFile).mtimeMs === dataBefore), "no api/data/aia.json written in the repo");

// 6. Every check requires the guard as its first statement; the test line sets no production env.
const checks = fs.readdirSync(__dirname).filter((f) => /^check-.*\.js$/.test(f));
const missing = checks.filter((f) => {
  const lines = fs.readFileSync(path.join(__dirname, f), "utf8").split("\n");
  const code = lines.filter((l, i) => !(i === 0 && l.startsWith("#!")) && l.trim() && !/^\s*\/\//.test(l) && !/^\s*['"]use strict['"];?\s*$/.test(l));
  return code[0] !== 'require("./_env-guard");';
});
ok(checks.length > 100 && missing.length === 0, "every scripts/check-*.js (" + checks.length + ") requires ./_env-guard first" + (missing.length ? " (missing: " + missing.join(", ") + ")" : ""));
const testLine = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts.test;
ok(!/VERCEL_ENV=|BLOB_[A-Z_]*=/.test(testLine) && testLine.indexOf("node scripts/check-env-guard.js") >= 0, "the test line sets no VERCEL_ENV or BLOB_* and runs this check");

fs.rmSync(scratch, { recursive: true, force: true });
console.log((failed ? "FAIL" : "PASS") + " check-env-guard: " + (asserts - failed) + "/" + asserts + " asserts");
